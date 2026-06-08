/**
 * PromotionStatsPanel — compact admin dashboard for the catalog promotion
 * pipeline (Phase IV-3).
 *
 * Reads from two backend endpoints:
 *   GET  /api/ingestion/admin/promotion/dashboard
 *   GET  /api/ingestion/admin/stabilization/snapshot?window_minutes=5
 *
 * And exposes two master_admin-only actions:
 *   POST /api/ingestion/admin/parsers/westmotors/parse-now
 *   POST /api/ingestion/admin/promotion/run-once
 *
 * Visual language: matches ParserControl.js (white surfaces, #18181B accents,
 * #E4E4E7 borders, slim cards). No transparent backgrounds. Auto-refresh
 * every 15 s, manual refresh button.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import {
  ArrowClockwise,
  Database,
  Lightning,
  TrendUp,
  Pulse,
  CircleNotch,
  Play,
  Stack,
  ChartBar,
  Clock,
} from '@phosphor-icons/react';
import { API_URL } from '../../App';

const POLL_MS = 15000;

const Stat = ({ label, value, hint, accent, testid }) => (
  <div
    className="bg-white border border-[#E4E4E7] rounded-xl px-4 py-3"
    data-testid={testid}
  >
    <p className="text-[10.5px] font-semibold uppercase tracking-wider text-[#71717A]">
      {label}
    </p>
    <p
      className={`text-xl font-bold tabular-nums mt-1 ${
        accent === 'good'
          ? 'text-emerald-600'
          : accent === 'warn'
          ? 'text-amber-600'
          : accent === 'bad'
          ? 'text-red-600'
          : 'text-[#18181B]'
      }`}
    >
      {value}
    </p>
    {hint ? (
      <p className="text-[10.5px] text-[#71717A] mt-0.5">{hint}</p>
    ) : null}
  </div>
);

const fmt = (n) => {
  if (n === null || n === undefined) return '—';
  const num = Number(n);
  if (Number.isNaN(num)) return String(n);
  return num.toLocaleString('en-US');
};

const pct = (n) => {
  if (n === null || n === undefined) return '—';
  return `${Number(n).toFixed(1)}%`;
};

const ProgressBar = ({ value, max, color = '#18181B' }) => {
  const safeMax = max || 1;
  const w = Math.max(0, Math.min(100, (value / safeMax) * 100));
  return (
    <div className="w-full h-1.5 bg-[#F4F4F5] rounded-full overflow-hidden">
      <div
        className="h-full rounded-full transition-all duration-500"
        style={{ width: `${w}%`, backgroundColor: color }}
      />
    </div>
  );
};

const PromotionStatsPanel = ({ canManage = false }) => {
  const [data, setData] = useState(null);
  const [snap, setSnap] = useState(null);
  const [err, setErr] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busyAction, setBusyAction] = useState(null);
  const [lastUpdate, setLastUpdate] = useState(null);
  const [now, setNow] = useState(Date.now());
  const tickRef = useRef(null);

  const fetchAll = useCallback(async () => {
    try {
      const [dash, sn] = await Promise.all([
        axios.get(`${API_URL}/api/ingestion/admin/promotion/dashboard`),
        axios.get(
          `${API_URL}/api/ingestion/admin/stabilization/snapshot?window_minutes=5`,
        ),
      ]);
      setData(dash.data?.data || null);
      setSnap(sn.data?.data || null);
      setErr(null);
      setLastUpdate(Date.now());
    } catch (e) {
      setErr(e?.response?.data?.detail || e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
    const t = setInterval(fetchAll, POLL_MS);
    return () => clearInterval(t);
  }, [fetchAll]);

  useEffect(() => {
    tickRef.current = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(tickRef.current);
  }, []);

  const triggerParseNow = async () => {
    if (busyAction) return;
    setBusyAction('parse');
    try {
      const r = await axios.post(
        `${API_URL}/api/ingestion/admin/parsers/westmotors/parse-now`,
        { batch_size: 50, concurrency: 3, cycles: 2 },
      );
      const res = r.data?.result || {};
      toast.success(
        `WestMotors parsed: ok=${res.ok || 0}, failed=${res.failed || 0}, no_payload=${res.no_payload || 0}`,
      );
      fetchAll();
    } catch (e) {
      toast.error(
        `parse-now failed: ${e?.response?.data?.message || e?.message || String(e)}`,
      );
    } finally {
      setBusyAction(null);
    }
  };

  const triggerPromote = async () => {
    if (busyAction) return;
    setBusyAction('promote');
    try {
      const r = await axios.post(
        `${API_URL}/api/ingestion/admin/promotion/run-once`,
        { sources: ['lemon', 'westmotors'], max_per_source: 2000, batch: 500 },
      );
      const results = r.data?.result?.results || [];
      const totals = results.reduce(
        (acc, x) => {
          acc.full += x.promoted_full || 0;
          acc.partial += x.promoted_partial || 0;
          acc.dupe += x.duplicates || 0;
          return acc;
        },
        { full: 0, partial: 0, dupe: 0 },
      );
      toast.success(
        `Promotion done: +${totals.full} full / +${totals.partial} partial · ${totals.dupe} dup`,
      );
      fetchAll();
    } catch (e) {
      toast.error(
        `promotion failed: ${e?.response?.data?.detail || e?.message || String(e)}`,
      );
    } finally {
      setBusyAction(null);
    }
  };

  const freshSeconds = lastUpdate
    ? Math.max(0, Math.floor((now - lastUpdate) / 1000))
    : null;
  const freshStale = freshSeconds !== null && freshSeconds > POLL_MS / 1000 + 3;

  const ct = data?.catalog_totals || {};
  const sources = data?.sources || [];
  const recent = data?.recent_runs || [];
  const rate = data?.promotion_rate || {};
  const pworkers = data?.parser_workers || {};
  const promoter = data?.promotion_worker || {};

  // Sums for sticky summary tiles
  const allActive = useMemo(
    () => sources.reduce((a, s) => a + (s.active || 0), 0),
    [sources],
  );
  const allParsed = useMemo(
    () => sources.reduce((a, s) => a + (s.parsed || 0), 0),
    [sources],
  );

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center h-64">
        <CircleNotch size={32} className="animate-spin text-[#18181B]" />
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6" data-testid="promotion-stats-panel">
      {/* Header — stacks on mobile, side-by-side on sm+. Action buttons wrap
          to their own row on narrow viewports so the title never gets clipped. */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <h2
            className="text-base sm:text-lg md:text-xl font-bold tracking-tight text-[#18181B] leading-tight break-words"
            style={{ fontFamily: 'Mazzard, system-ui, sans-serif' }}
          >
            Promotion Pipeline · Stats
          </h2>
          <p className="text-[11px] sm:text-[12px] text-[#71717A] mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
            <span className="truncate max-w-full">discovery → parse → promotion → catalog</span>
            {freshSeconds !== null && (
              <>
                <span className="text-[#D4D4D8] hidden sm:inline">·</span>
                <span
                  className={`inline-flex items-center gap-1 ${
                    freshStale ? 'text-amber-600 font-medium' : 'text-[#71717A]'
                  }`}
                  data-testid="promotion-freshness"
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      freshStale
                        ? 'bg-amber-500'
                        : 'bg-emerald-500 animate-pulse'
                    }`}
                  />
                  Updated {freshSeconds}s ago
                </span>
              </>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap sm:shrink-0">
          {canManage && (
            <>
              <button
                onClick={triggerParseNow}
                disabled={!!busyAction}
                className="inline-flex items-center justify-center gap-1.5 h-9 px-3 rounded-xl bg-white border border-[#E4E4E7] text-[#18181B] text-xs font-semibold hover:border-[#18181B] transition-colors disabled:opacity-50 flex-1 sm:flex-none"
                data-testid="btn-parse-now"
                title="Trigger 2 batches of WestMotors JSON-LD parsing"
              >
                {busyAction === 'parse' ? (
                  <CircleNotch size={14} className="animate-spin" />
                ) : (
                  <Lightning size={14} weight="bold" />
                )}
                <span className="whitespace-nowrap">Parse 100 WM</span>
              </button>
              <button
                onClick={triggerPromote}
                disabled={!!busyAction}
                className="inline-flex items-center justify-center gap-1.5 h-9 px-3 rounded-xl bg-[#18181B] text-white text-xs font-semibold hover:bg-[#27272A] active:bg-black transition-colors disabled:opacity-50 flex-1 sm:flex-none"
                data-testid="btn-promote-run"
                title="Sweep promotion across lemon + westmotors"
              >
                {busyAction === 'promote' ? (
                  <CircleNotch size={14} className="animate-spin" />
                ) : (
                  <Play size={14} weight="fill" />
                )}
                <span className="whitespace-nowrap">Promote Now</span>
              </button>
            </>
          )}
          <button
            onClick={fetchAll}
            className="inline-flex items-center justify-center h-9 w-9 shrink-0 rounded-xl bg-white border border-[#E4E4E7] text-[#18181B] hover:border-[#18181B] transition-colors"
            title="Refresh"
            data-testid="btn-refresh-promotion"
          >
            <ArrowClockwise size={14} weight="bold" />
          </button>
        </div>
      </div>

      {err && (
        <div className="px-3 py-2.5 rounded-xl bg-[#FEF2F2] border border-[#FCA5A5] text-xs text-[#7F1D1D]">
          load error: {err}
        </div>
      )}

      {/* Top KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat
          label="Catalog total"
          value={fmt(ct.total_vin_data)}
          hint={`+${fmt(ct.data_quality_full)} full · +${fmt(
            ct.data_quality_partial,
          )} partial`}
          testid="kpi-catalog-total"
        />
        <Stat
          label="Catalog ready"
          value={fmt(ct.catalog_ready)}
          hint={`${pct(
            ct.total_vin_data
              ? (ct.catalog_ready / ct.total_vin_data) * 100
              : 0,
          )} of catalog`}
          accent="good"
          testid="kpi-catalog-ready"
        />
        <Stat
          label="Promoted / hr"
          value={fmt(rate.per_hour || 0)}
          hint={`last ${rate.window_minutes || 60} min window`}
          accent={(rate.per_hour || 0) > 0 ? 'good' : null}
          testid="kpi-promoted-rate"
        />
        <Stat
          label="Active discovery pool"
          value={fmt(allActive)}
          hint={`${fmt(allParsed)} parsed (${pct(
            allActive ? (allParsed / allActive) * 100 : 0,
          )})`}
          testid="kpi-discovery-pool"
        />
      </div>

      {/* Per-source breakdown */}
      <div className="bg-white border border-[#E4E4E7] rounded-2xl p-4 sm:p-5">
        <div className="flex items-center gap-2 mb-3">
          <Stack size={16} className="text-[#18181B]" weight="duotone" />
          <h3 className="text-[13.5px] font-bold tracking-tight text-[#18181B]">
            Per-Source Pipeline
          </h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {sources.map((s) => {
            if (!s.present) {
              return (
                <div
                  key={s.source}
                  className="border border-dashed border-[#E4E4E7] rounded-xl px-4 py-3 text-center"
                >
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-[#71717A]">
                    {s.source}
                  </p>
                  <p className="text-xs text-[#A1A1AA] mt-2">collection not present</p>
                </div>
              );
            }
            const parsedPct = s.parsed_pct ?? 0;
            return (
              <div
                key={s.source}
                className="border border-[#E4E4E7] rounded-xl p-3.5"
                data-testid={`src-${s.source}`}
              >
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[12px] font-bold uppercase tracking-wider text-[#18181B]">
                    {s.source}
                  </p>
                  <span className="text-[10px] text-[#71717A] tabular-nums">
                    {pct(parsedPct)}
                  </span>
                </div>
                <ProgressBar
                  value={s.parsed || 0}
                  max={s.active || 1}
                  color={
                    parsedPct >= 80
                      ? '#10B981'
                      : parsedPct >= 30
                      ? '#F59E0B'
                      : '#18181B'
                  }
                />
                <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5 text-[11px] tabular-nums">
                  <span className="text-[#71717A]">active</span>
                  <span className="text-right font-semibold text-[#18181B]">
                    {fmt(s.active)}
                  </span>
                  <span className="text-[#71717A]">parsed</span>
                  <span className="text-right font-semibold text-emerald-700">
                    {fmt(s.parsed)}
                  </span>
                  <span className="text-[#71717A]">unparsed</span>
                  <span className="text-right text-[#52525B]">
                    {fmt(s.unparsed)}
                  </span>
                  <span className="text-[#71717A]">blacklisted</span>
                  <span className="text-right text-amber-700">
                    {fmt(s.blacklisted)}
                  </span>
                  {s.archived ? (
                    <>
                      <span className="text-[#71717A]">archived</span>
                      <span className="text-right text-[#A1A1AA]">
                        {fmt(s.archived)}
                      </span>
                    </>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Recent promotion runs + Parser workers */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Recent runs */}
        <div className="bg-white border border-[#E4E4E7] rounded-2xl p-4 sm:p-5">
          <div className="flex items-center gap-2 mb-3">
            <Clock size={16} className="text-[#18181B]" weight="duotone" />
            <h3 className="text-[13.5px] font-bold tracking-tight text-[#18181B]">
              Recent Promotion Runs
            </h3>
            <span className="ml-auto text-[10px] uppercase tracking-wider text-[#A1A1AA]">
              last 10
            </span>
          </div>
          {recent.length === 0 ? (
            <p className="text-xs text-[#A1A1AA]">No promotion runs yet.</p>
          ) : (
            <div className="space-y-1.5 max-h-80 overflow-y-auto pr-1">
              {recent.map((r, idx) => {
                const t = r.totals || {};
                const ts = (r.started_at || '').replace('T', ' ').slice(0, 19);
                const promoted = (t.promoted_full || 0) + (t.promoted_partial || 0);
                return (
                  <div
                    key={idx}
                    className="flex items-center justify-between gap-2 border border-[#F4F4F5] rounded-lg px-2.5 py-1.5 text-[11.5px] tabular-nums"
                  >
                    <span className="text-[#71717A] truncate">{ts}</span>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-emerald-700 font-semibold">
                        +{fmt(promoted)}
                      </span>
                      <span className="text-[#A1A1AA]">/</span>
                      <span className="text-[#52525B]">{fmt(t.seen)} seen</span>
                      {t.duplicates ? (
                        <span className="text-amber-700">
                          · {fmt(t.duplicates)} dup
                        </span>
                      ) : null}
                      {t.errors ? (
                        <span className="text-red-600">
                          · {fmt(t.errors)} err
                        </span>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Parser workers */}
        <div className="bg-white border border-[#E4E4E7] rounded-2xl p-4 sm:p-5">
          <div className="flex items-center gap-2 mb-3">
            <Pulse size={16} className="text-[#18181B]" weight="duotone" />
            <h3 className="text-[13.5px] font-bold tracking-tight text-[#18181B]">
              Parser Workers
            </h3>
          </div>
          <div className="space-y-3">
            {Object.entries(pworkers).map(([name, st]) => {
              const dbInfo = st?.db || {};
              const counters = st?.counters || st?.worker_counters || {};
              return (
                <div
                  key={name}
                  className="border border-[#E4E4E7] rounded-xl px-3 py-2.5"
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <p className="text-[12px] font-bold uppercase tracking-wider text-[#18181B]">
                      {name}
                    </p>
                    <span
                      className={`text-[10px] font-semibold px-2 py-0.5 rounded ${
                        st?.worker_active
                          ? 'bg-emerald-50 text-emerald-700'
                          : 'bg-[#FAFAFA] text-[#71717A]'
                      }`}
                    >
                      {st?.worker_active ? 'active' : 'idle'}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-[10.5px] tabular-nums text-[#52525B]">
                    <span>
                      ok <strong className="text-emerald-700">{fmt(counters.ok || counters.parsed)}</strong>
                    </span>
                    <span>
                      fail <strong className="text-red-600">{fmt(counters.failed)}</strong>
                    </span>
                    <span>
                      cycles <strong className="text-[#18181B]">{fmt(counters.cycles)}</strong>
                    </span>
                    <span>
                      parsed <strong className="text-[#18181B]">{fmt(dbInfo.parsed)}</strong>
                    </span>
                    <span>
                      unparsed <strong className="text-[#52525B]">{fmt(dbInfo.unparsed)}</strong>
                    </span>
                    <span>
                      blacklisted <strong className="text-amber-700">{fmt(dbInfo.blacklisted)}</strong>
                    </span>
                  </div>
                </div>
              );
            })}
            {Object.keys(pworkers).length === 0 && (
              <p className="text-xs text-[#A1A1AA]">No parser workers reporting.</p>
            )}
          </div>

          {/* Promotion worker summary */}
          {promoter?.running !== undefined && (
            <div className="mt-3 pt-3 border-t border-[#F4F4F5]">
              <div className="flex items-center justify-between text-[11px] text-[#52525B]">
                <span className="font-semibold uppercase tracking-wider text-[#71717A]">
                  CatalogPromotionWorker
                </span>
                <span
                  className={`text-[10px] font-semibold px-2 py-0.5 rounded ${
                    promoter.running
                      ? 'bg-emerald-50 text-emerald-700'
                      : 'bg-[#FAFAFA] text-[#71717A]'
                  }`}
                >
                  {promoter.running ? 'running' : 'stopped'}
                </span>
              </div>
              <p className="text-[10.5px] text-[#71717A] mt-1">
                interval {promoter.interval_seconds}s · batch{' '}
                {promoter.batch_per_source}/source ·{' '}
                {promoter.last_run_at
                  ? `last ${promoter.last_run_at.slice(11, 19)}`
                  : 'no runs yet'}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Stabilization snapshot */}
      <div className="bg-white border border-[#E4E4E7] rounded-2xl p-4 sm:p-5">
        <div className="flex items-center gap-2 mb-3">
          <TrendUp size={16} className="text-[#18181B]" weight="duotone" />
          <h3 className="text-[13.5px] font-bold tracking-tight text-[#18181B]">
            Stabilization Snapshot
          </h3>
          <span className="ml-auto text-[10px] uppercase tracking-wider text-[#A1A1AA]">
            {snap?.window_minutes || 5} min window
          </span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Stat
            label="Memory RSS"
            value={`${snap?.memory?.rss_mb_psutil ?? snap?.memory?.rss_mb ?? '—'} MB`}
            hint={
              snap?.memory?.cpu_pct !== undefined
                ? `cpu ${snap.memory.cpu_pct}%`
                : 'backend process'
            }
            testid="sb-memory"
          />
          <Stat
            label="Slow queries"
            value={fmt(snap?.latency?.slow_query_count)}
            hint={
              snap?.latency?.slow_avg_ms
                ? `avg ${snap.latency.slow_avg_ms} ms`
                : 'no slow queries'
            }
            accent={
              (snap?.latency?.slow_query_count || 0) > 5 ? 'warn' : 'good'
            }
            testid="sb-latency"
          />
          <Stat
            label="Duplicates seen"
            value={fmt(snap?.duplicates?.duplicates_seen)}
            hint={`${snap?.duplicates?.promotion_runs_in_window || 0} runs`}
            accent={
              (snap?.duplicates?.duplicates_seen || 0) > 1000 ? 'warn' : null
            }
            testid="sb-dupes"
          />
          <Stat
            label="Mongo collections"
            value={fmt(snap?.mongo?.collections?.length)}
            hint="tracked in window"
            testid="sb-coll"
          />
        </div>
        {/* Per-collection growth */}
        {snap?.mongo?.collections?.length ? (
          <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-2">
            {snap.mongo.collections.map((c) => {
              const grown = Object.entries(c)
                .filter(([k]) => k.startsWith('new_in_window'))
                .map(([k, v]) => ({
                  k: k.replace('new_in_window_by_', ''),
                  v,
                }));
              return (
                <div
                  key={c.collection}
                  className="flex items-center justify-between text-[11.5px] border border-[#F4F4F5] rounded-lg px-2.5 py-1.5"
                >
                  <span className="font-mono text-[#52525B] truncate">
                    {c.collection}
                  </span>
                  <div className="flex items-center gap-2 tabular-nums">
                    <span className="text-[#18181B] font-semibold">
                      {fmt(c.count)}
                    </span>
                    {grown.map((g) => (
                      <span key={g.k} className="text-emerald-700 text-[10.5px]">
                        +{fmt(g.v)} <span className="text-[#A1A1AA]">{g.k}</span>
                      </span>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        ) : null}
      </div>
    </div>
  );
};

export default PromotionStatsPanel;
