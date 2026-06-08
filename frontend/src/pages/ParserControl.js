/**
 * Parser Control Center — monitoring-grade UI (v3 · ops hardening).
 *
 * v3 upgrades:
 *   1. Role guard           — master_admin/owner only see mutation controls.
 *                              Regular admin/manager/team_lead get a clean
 *                              read-only view (same data, no buttons, with a
 *                              visible "READ-ONLY" banner).
 *   2. Extension block      — per-client "Last seen Xs ago" + success rate,
 *                              aggregate freshness pill, 2-minute critical
 *                              auto-alert when no client has pinged back.
 *
 * v2 (preserved):
 *   - SystemStatusBar with inline REASON
 *   - Extension CRITICAL alarm (pulse, red card)
 *   - Source tier chips (PRIMARY / INDEX / HTTP / CRITICAL · CF)
 *   - "X sources disabled" banner
 *   - Performance rollup (🟢 OK / 🟡 DEGRADED / 🔴 BAD)
 *   - Debug Retry button
 *   - "Updated Xs ago" freshness indicator
 *
 * Single fetch from /api/control/overview every 5 s.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import {
  ShieldCheck,
  Warning,
  WarningCircle,
  CheckCircle,
  XCircle,
  Plugs,
  PlugsConnected,
  Browser,
  Lightning,
  Database,
  Globe,
  Pulse,
  ArrowClockwise,
  ArrowSquareOut,
  CircleNotch,
  MagnifyingGlass,
  CaretRight,
  Siren,
  Download,
  Copy,
  Check,
  Play,
  Stop,
  Gear,
  ShieldSlash,
  TrendUp,
  Clock,
} from '@phosphor-icons/react';
import { useAuth, API_URL } from '../App';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { useLang } from '../i18n';
import PromotionStatsPanel from '../components/admin/PromotionStatsPanel';

const POLL_INTERVAL = 5000;

const STATUS_PRESET = {
  ok: {
    label: 'OK',
    bg: 'bg-emerald-500',
    bgSoft: 'bg-emerald-50',
    border: 'border-emerald-200',
    text: 'text-emerald-700',
    dot: 'bg-emerald-500',
  },
  warn: {
    label: 'WARN',
    bg: 'bg-amber-500',
    bgSoft: 'bg-amber-50',
    border: 'border-amber-200',
    text: 'text-amber-700',
    dot: 'bg-amber-500',
  },
  drift: {
    label: 'DRIFT',
    bg: 'bg-amber-500',
    bgSoft: 'bg-amber-50',
    border: 'border-amber-200',
    text: 'text-amber-700',
    dot: 'bg-amber-500',
  },
  down: {
    label: 'DOWN',
    bg: 'bg-red-500',
    bgSoft: 'bg-red-50',
    border: 'border-red-200',
    text: 'text-red-700',
    dot: 'bg-red-500',
  },
};

const TIER_ICON = {
  LIVE: Lightning,
  INDEX: Database,
  HTTP: Globe,
  EXT: Browser,
};

// Tier chip meta — explicit hierarchy. Extension is the critical fallback:
// Cloudflare-protected sources depend on it, so we mark it red-accent.
const TIER_META = {
  LIVE: {
    label: 'PRIMARY',
    chipBg: 'bg-emerald-50',
    chipText: 'text-emerald-700',
    chipBorder: 'border-emerald-200',
  },
  INDEX: {
    label: 'INDEX',
    chipBg: 'bg-blue-50',
    chipText: 'text-blue-700',
    chipBorder: 'border-blue-200',
  },
  HTTP: {
    label: 'HTTP',
    chipBg: 'bg-violet-50',
    chipText: 'text-violet-700',
    chipBorder: 'border-violet-200',
  },
  EXT: {
    label: 'CRITICAL · CF',
    chipBg: 'bg-red-50',
    chipText: 'text-red-700',
    chipBorder: 'border-red-200',
  },
};

// ── 1. SystemStatusBar ──────────────────────────────────
// Neutral card design (V2 — Wave 3.x): white card with a coloured status
// dot + STATUS chip on the right, instead of a full-bleed orange/red
// gradient. Matches the visual language of the rest of the admin
// (Tracking, Business Metrics, etc.) — no more loud filled hero.
const SystemStatusBar = ({ system, alerts }) => {
  const { t } = useLang();
  const status = system?.status || 'green';
  const isRed = status === 'red';
  const isYellow = status === 'yellow';
  const dot = isRed ? '#DC2626' : isYellow ? '#F59E0B' : '#16A34A';
  const Icon = isRed ? XCircle : isYellow ? Warning : ShieldCheck;
  const headline = isRed
    ? 'SYSTEM DEGRADED'
    : isYellow
    ? 'SYSTEM PARTIAL'
    : 'SYSTEM HEALTHY';
  const chipTextCls = isRed ? 'text-[#DC2626]' : isYellow ? 'text-[#B45309]' : 'text-[#15803D]';

  const backendReason = system?.reason;
  const reasonItems = Array.isArray(alerts) ? alerts.slice(0, 2) : [];
  const extraAlerts =
    Array.isArray(alerts) && alerts.length > 2 ? alerts.length - 2 : 0;

  return (
    <div
      className="bg-white border border-[#E4E4E7] rounded-2xl p-5"
      data-testid="system-status-bar"
    >
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-lg bg-[#FAFAFA] border border-[#E4E4E7] flex items-center justify-center flex-shrink-0">
          <Icon size={18} weight="duotone" className="text-[#3F3F46]" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span
              className="inline-block w-1.5 h-1.5 rounded-full flex-shrink-0"
              style={{ background: dot }}
            />
            <p
              className="text-[15px] font-semibold tracking-tight text-[#18181B]"
              style={{ fontFamily: 'Mazzard, Mazzard H, Mazzard M, system-ui, sans-serif' }}
            >
              {headline}
            </p>
          </div>
          {backendReason ? (
            <div className="mt-2" data-testid="system-reason">
              <p className="text-[10px] uppercase tracking-[0.18em] text-[#71717A] font-semibold mb-0.5">
                {t('adm_reason')}
              </p>
              <p className="text-[13px] text-[#3F3F46] leading-snug">
                {backendReason}
              </p>
              {reasonItems.length > 0 && (
                <p className="text-[12px] text-[#71717A] leading-snug mt-1.5">
                  {reasonItems.join(' • ')}
                  {extraAlerts > 0 && (
                    <span className="ml-1.5 text-[#A1A1AA]">
                      (+{extraAlerts} more)
                    </span>
                  )}
                </p>
              )}
            </div>
          ) : reasonItems.length > 0 ? (
            <div className="mt-2" data-testid="system-reason">
              <p className="text-[10px] uppercase tracking-[0.18em] text-[#71717A] font-semibold mb-0.5">
                {t('adm_reason')}
              </p>
              <p className="text-[13px] text-[#3F3F46] leading-snug">
                {reasonItems.join(' • ')}
                {extraAlerts > 0 && (
                  <span className="ml-1.5 text-[#A1A1AA]">
                    (+{extraAlerts} more)
                  </span>
                )}
              </p>
            </div>
          ) : (
            <p className="text-[13px] text-[#71717A] mt-1">
              {t('adm_all_sources_operational_resolver_chain_intact')}
            </p>
          )}
        </div>
        <div className="hidden sm:block text-right flex-shrink-0">
          <p className="text-[10px] uppercase tracking-wider text-[#71717A]">
            {t('adm_status')}
          </p>
          <p className={`text-[15px] font-bold ${chipTextCls}`}>{system?.label || '—'}</p>
        </div>
      </div>
    </div>
  );
};

// ── 2. ExtensionStatusCard — CRITICAL alarm + health telemetry ──────────
// Helper: humanise a duration in seconds → "3s" / "42s" / "2m" / "1h 12m".
const fmtAge = (secs) => {
  if (secs === null || secs === undefined) return 'never';
  const s = Math.max(0, Math.floor(secs));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  return rm ? `${h}h ${rm}m` : `${h}h`;
};

const ExtensionStatusCard = ({ extension, canManage, onOpenExtensionTab }) => {
  const { t } = useLang();
  const online = extension?.online || 0;
  const total = extension?.total || 0;
  const obsVins = extension?.obs_cache_vins || 0;
  const queue = extension?.queue_depth || 0;
  const inFlight = extension?.in_flight || 0;
  const clients = extension?.clients || [];

  // Aggregated freshness: min age across all known clients.
  const minAge = clients.length
    ? Math.min(...clients.map((c) => Number(c.age_sec || 0)))
    : null;
  // Aggregated success rate (average of non-null rates, 0 → 1).
  const rates = clients
    .map((c) => c.success_rate_recent)
    .filter((v) => v !== null && v !== undefined);
  const avgSr =
    rates.length > 0 ? rates.reduce((a, b) => a + b, 0) / rates.length : null;

  // Critical state — escalate if stale > 120s (2 min) even if someone is
  // technically "online" but just sent a heartbeat long ago.
  const isStale = minAge !== null && minAge > 120;
  const isCritical = online === 0 || (total > 0 && isStale);
  const isWarn = online === 1 && !isCritical;

  // Neutral card with a coloured status dot. Critical state still
  // communicates urgency via a coloured dot + text accent, but no
  // longer fills the whole block with red/pastel background.
  const dot = isCritical ? '#DC2626' : isWarn ? '#F59E0B' : '#16A34A';
  const Icon = isCritical ? Siren : isWarn ? Warning : PlugsConnected;

  const headline = isCritical
    ? online === 0
      ? 'CRITICAL · EXTENSION OFFLINE'
      : 'CRITICAL · EXTENSION STALE (>2 min)'
    : isWarn
    ? 'EXTENSION SPOF — install a second client'
    : 'EXTENSION OK';

  const headlineCls = isCritical
    ? 'text-[#DC2626]'
    : isWarn
    ? 'text-[#B45309]'
    : 'text-[#18181B]';

  return (
    <div
      className="bg-white border border-[#E4E4E7] rounded-2xl p-5"
      data-testid="extension-status-card"
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-start gap-3 min-w-0">
          <div className="w-9 h-9 rounded-lg bg-[#FAFAFA] border border-[#E4E4E7] flex items-center justify-center flex-shrink-0">
            <Icon size={18} weight="duotone" className="text-[#3F3F46]" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span
                className="inline-block w-1.5 h-1.5 rounded-full flex-shrink-0"
                style={{ background: dot }}
              />
              <p
                className={`text-[14px] sm:text-[15px] font-semibold tracking-tight ${headlineCls}`}
                style={{ fontFamily: 'Mazzard, Mazzard H, Mazzard M, system-ui, sans-serif' }}
              >
                {headline}
              </p>
            </div>
            <p className="text-[12px] text-[#71717A] mt-1">
              {online} online · {Math.max(0, total - online)} offline · queue{' '}
              {queue} · in-flight {inFlight} · obs cache {obsVins} VINs
            </p>
            {/* Aggregate freshness + success-rate row */}
            <div
              className="mt-2 flex flex-wrap gap-2 text-[11px]"
              data-testid="ext-aggregate-health"
            >
              <span className="inline-flex items-center gap-1.5 text-[#71717A]">
                <span
                  className="inline-block w-1.5 h-1.5 rounded-full"
                  style={{ background: isStale ? '#DC2626' : '#A1A1AA' }}
                />
                Last seen:{' '}
                <span className="font-semibold text-[#18181B]">
                  {minAge === null ? 'never' : `${fmtAge(minAge)} ago`}
                </span>
              </span>
              {avgSr !== null && (
                <span className="inline-flex items-center gap-1.5 text-[#71717A]">
                  <span
                    className="inline-block w-1.5 h-1.5 rounded-full"
                    style={{ background: avgSr >= 0.9 ? '#16A34A' : avgSr >= 0.6 ? '#F59E0B' : '#DC2626' }}
                  />
                  Success rate:{' '}
                  <span className="font-semibold text-[#18181B]">
                    {Math.round(avgSr * 100)}%
                  </span>
                </span>
              )}
            </div>
            {isCritical && (
              <p
                className="text-[12px] text-[#3F3F46] mt-2.5 leading-snug border-l-2 border-[#DC2626] pl-2.5"
                data-testid="ext-critical-reason"
              >
                Cloudflare sources DISABLED ·{' '}
                <span className="text-[#18181B] font-medium">{t('adm_poctra_cfw_aah_salvagebid')}</span>{' '}
                will not answer until a client registers.
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 self-stretch sm:self-auto sm:flex-shrink-0 w-full sm:w-auto">
          <button
            type="button"
            onClick={async () => {
              try {
                toast.info(t('adm_preparing_zip'));
                const res = await axios.get(`${API_URL}/api/extension/download`, {
                  responseType: 'blob',
                });
                const blob = new Blob([res.data], { type: 'application/zip' });
                const url = URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.href = url;
                link.download = 'bibi-cars-extension.zip';
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                setTimeout(() => URL.revokeObjectURL(url), 1500);
                toast.success(`${t('r9_loaded_text')} ${(blob.size / 1024).toFixed(1)} KB`);
              } catch (err) {
                toast.error(`${t('r9_load_error_msg')}: ${err?.response?.status || err.message}`);
              }
            }}
            className="inline-flex items-center justify-center gap-2 h-10 px-4 rounded-xl bg-[#18181B] text-[13px] font-medium text-white hover:bg-[#27272A] transition-colors flex-1 sm:flex-none focus:outline-none focus-visible:ring-4 focus-visible:ring-black/10"
            data-testid="ext-download-cta"
            title={t('adm_download_the_extension_zip_archive_for_installatio')}
          >
            <Download size={14} weight="bold" />
            <span className="hidden xs:inline sm:inline">{t('adm_download_extension')}</span>
            <span className="xs:hidden sm:hidden">Download</span>
          </button>
          {canManage && (
            <button
              type="button"
              onClick={() => onOpenExtensionTab && onOpenExtensionTab()}
              className="inline-flex items-center justify-center gap-1 h-10 px-3 sm:px-4 rounded-xl border border-[#E4E4E7] bg-white text-[13px] font-medium text-[#18181B] hover:bg-zinc-50 transition-colors focus:outline-none focus-visible:ring-4 focus-visible:ring-black/10"
              data-testid="ext-setup-cta"
            >
              <span>{isCritical ? 'Setup' : 'Manage'}</span>
              <CaretRight size={13} />
            </button>
          )}
        </div>
      </div>
      {clients.length > 0 && (
        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
          {clients.map((c) => {
            const sr = c.success_rate_recent;
            const srTxt =
              sr === null || sr === undefined ? '—' : `${Math.round(sr * 100)}%`;
            const age = Number(c.age_sec || 0);
            const stale = !c.online || age > 120;
            return (
              <div
                key={c.client_id}
                className="flex items-center justify-between bg-white border border-[#E4E4E7] rounded-xl px-3 py-2.5"
                data-testid={`ext-client-${c.client_id}`}
              >
                <div className="min-w-0">
                  <p className="text-[13px] font-medium text-[#18181B] truncate">
                    {(c.label || c.client_id).slice(0, 28)}
                  </p>
                  <p className="text-[10.5px] text-[#A1A1AA]">
                    {c.version || '—'}
                    <span className="mx-1.5 text-[#D4D4D8]">·</span>
                    <span
                      className={stale ? 'text-[#DC2626] font-semibold' : ''}
                    >
                      seen {fmtAge(age)} ago
                    </span>
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span
                    className={`text-[11px] tabular-nums ${
                      sr !== null && sr !== undefined && sr < 0.6
                        ? 'text-[#DC2626] font-semibold'
                        : 'text-[#71717A]'
                    }`}
                    title="Success rate (last 20 jobs)"
                  >
                    {srTxt}
                  </span>
                  <span
                    className={`w-2 h-2 rounded-full ${
                      !c.online
                        ? 'bg-red-500'
                        : c.unhealthy
                        ? 'bg-amber-500'
                        : 'bg-emerald-500'
                    }`}
                    title={
                      !c.online
                        ? 'offline'
                        : c.unhealthy
                        ? 'unhealthy'
                        : 'online'
                    }
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

// ── 3. Source row ───────────────────────────────────────
const SourceRow = ({ row }) => {
  const { t } = useLang();
  const preset = STATUS_PRESET[row.status] || STATUS_PRESET.ok;
  const TierIcon = TIER_ICON[row.tier] || Plugs;
  const tierMeta = TIER_META[row.tier] || TIER_META.HTTP;
  return (
    <div
      className="bg-white rounded-xl border border-[#E4E4E7] p-3 sm:p-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4"
      data-testid={`source-row-${row.key}`}
    >
      <div className="flex items-center gap-2.5 sm:gap-3 sm:w-60 lg:w-72 min-w-0">
        <div
          className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${preset.dot} ${
            row.status === 'down' ? 'animate-pulse' : ''
          }`}
        />
        <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-lg bg-[#F4F4F5] flex items-center justify-center flex-shrink-0">
          <TierIcon size={15} weight="duotone" className="text-[#18181B]" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] sm:text-sm font-semibold text-[#18181B] truncate">
            {row.label}
          </p>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span
              className={`text-[9px] font-bold uppercase tracking-[0.1em] px-1.5 py-0.5 rounded border ${tierMeta.chipBg} ${tierMeta.chipText} ${tierMeta.chipBorder}`}
              data-testid={`source-tier-${row.key}`}
            >
              {tierMeta.label}
            </span>
            <span className="text-[10px] text-[#A1A1AA] uppercase tracking-wide">
              {row.tier}
            </span>
          </div>
        </div>
        {/* Mobile status pill — inline with title */}
        <span
          className={`sm:hidden text-[10px] px-2 py-1 rounded-md font-bold uppercase tracking-wider shrink-0 ${preset.bgSoft} ${preset.text} border ${preset.border}`}
        >
          {row.status === 'ok'
            ? 'OK'
            : row.status === 'down'
            ? 'DOWN'
            : row.status === 'drift'
            ? 'DRIFT'
            : 'WARN'}
        </span>
      </div>
      <div className="grid grid-cols-4 gap-2 sm:gap-6 flex-1 min-w-0">
        <div className="min-w-0">
          <p className="text-[10px] text-[#A1A1AA] uppercase tracking-wide truncate">
            {t('cmp_p50')}
          </p>
          <p className="text-[13px] sm:text-sm font-bold text-[#18181B] truncate tabular-nums">
            {row.latency_p50_ms ? `${row.latency_p50_ms}ms` : '—'}
          </p>
        </div>
        <div className="min-w-0">
          <p className="text-[10px] text-[#A1A1AA] uppercase tracking-wide truncate">
            {t('adm_hit')}
          </p>
          <p className="text-[13px] sm:text-sm font-bold text-emerald-600 truncate">
            {row.calls > 0 ? `${Math.round((row.hit_ratio || 0) * 100)}%` : '—'}
          </p>
        </div>
        <div className="min-w-0">
          <p className="text-[10px] text-[#A1A1AA] uppercase tracking-wide truncate">
            {t('adm_calls')}
          </p>
          <p className="text-[13px] sm:text-sm font-bold text-[#18181B] truncate">{row.calls}</p>
        </div>
        <div className="min-w-0">
          <p className="text-[10px] text-[#A1A1AA] uppercase tracking-wide truncate">
            {t('adm_errors')}
          </p>
          <p
            className={`text-[13px] sm:text-sm font-bold truncate ${
              row.errors > 0 ? 'text-red-600' : 'text-[#18181B]'
            }`}
          >
            {row.errors}
          </p>
        </div>
      </div>
      <div className="hidden sm:flex items-center gap-2 flex-shrink-0">
        <span
          className={`text-[10px] px-2 py-1 rounded-md font-bold uppercase tracking-wider ${preset.bgSoft} ${preset.text} border ${preset.border}`}
        >
          {row.status === 'ok'
            ? '● OK'
            : row.status === 'down'
            ? '● DOWN'
            : row.status === 'drift'
            ? '⚠ DRIFT'
            : '● WARN'}
        </span>
        {row.circuit_open && (
          <span className="text-[10px] px-2 py-0.5 rounded-md font-medium bg-red-50 text-red-700 border border-red-200">
            circuit open
          </span>
        )}
        {row.key === 'extension' && row.clients_online === 0 && (
          <span className="text-[10px] px-2 py-0.5 rounded-md font-medium bg-red-50 text-red-700 border border-red-200">
            {t('adm_0_clients')}
          </span>
        )}
      </div>
    </div>
  );
};

// ── 3b. SourcesGrid with disabled-count banner ───────────
const SourcesGrid = ({ sources }) => {
  const { t } = useLang();
  const safeSources = Array.isArray(sources) ? sources : [];
  const disabledCount = safeSources.filter((s) => s.status === 'down').length;
  // Extension aggregates 4 Cloudflare sub-sources; if it's down they all are off.
  const extOff = safeSources.find(
    (s) => s.key === 'extension' && s.status === 'down',
  );
  const extSubsources = extOff?.subsources?.length || 0;
  const effectiveDisabled = disabledCount + (extSubsources > 0 ? extSubsources : 0);

  return (
    <div data-testid="sources-grid">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between mb-3">
        <h2
          className="text-sm font-bold text-[#18181B] tracking-tight"
          style={{ fontFamily: 'Mazzard, Mazzard H, Mazzard M, system-ui, sans-serif' }}
        >
          SOURCES
        </h2>
        <p className="text-[11px] text-[#A1A1AA] leading-snug">
          {t('adm_resolver_chain_order_live_index_http_ext')}
        </p>
      </div>

      {effectiveDisabled > 0 && (
        <div
          className="mb-3 bg-white border border-[#E4E4E7] rounded-xl px-3.5 py-2.5 flex items-center gap-2.5"
          data-testid="sources-disabled-banner"
        >
          <span
            className="inline-block w-1.5 h-1.5 rounded-full flex-shrink-0"
            style={{ background: '#DC2626' }}
          />
          <p className="text-[12.5px] text-[#3F3F46]">
            <span className="font-semibold text-[#18181B]">
              {effectiveDisabled} source{effectiveDisabled === 1 ? '' : 's'} disabled
            </span>
            {extSubsources > 0 && (
              <span className="text-[#71717A]">
                {' '}— Cloudflare group:{' '}
                <span className="font-semibold text-[#3F3F46]">
                  {extOff.subsources.join(' · ')}
                </span>
              </span>
            )}
          </p>
        </div>
      )}

      <div className="space-y-2">
        {safeSources.map((row) => (
          <SourceRow key={row.key} row={row} />
        ))}
      </div>
    </div>
  );
};

// ── 4. PerformancePanel with rollup status ──────────────
const PerformancePanel = ({ performance }) => {
  const { t } = useLang();
  const hitRate = performance?.hit_rate || 0;
  const errorRate = performance?.error_rate || 0;
  const totalCalls = performance?.total_calls ?? 0;

  // rollup: BAD if error>{t('adm_20_warn_if_hit')}<50% (and any traffic), OK otherwise.
  let rollup = 'ok';
  if (totalCalls > 0) {
    if (errorRate > 0.2) rollup = 'bad';
    else if (hitRate < 0.5) rollup = 'warn';
  }

  const rollupMeta = {
    ok: {
      label: t('adm_ok'),
      bg: 'bg-emerald-50',
      text: 'text-emerald-700',
      border: 'border-emerald-200',
    },
    warn: {
      label: t('adm_degraded'),
      bg: 'bg-amber-50',
      text: 'text-amber-800',
      border: 'border-amber-200',
    },
    bad: {
      label: t('adm_bad'),
      bg: 'bg-red-50',
      text: 'text-red-700',
      border: 'border-red-200',
    },
  }[rollup];

  const tiles = [
    {
      label: t('cmp_p50_latency'),
      value: performance?.p50_ms ? `${performance.p50_ms}ms` : '—',
    },
    {
      label: t('cmp_p95_latency'),
      value: performance?.p95_ms ? `${performance.p95_ms}ms` : '—',
    },
    {
      label: t('adm_hit_rate'),
      value: `${Math.round(hitRate * 100)}%`,
      tone: hitRate >= 0.7 ? 'ok' : hitRate >= 0.4 ? 'warn' : 'down',
    },
    {
      label: t('adm_error_rate'),
      value: `${Math.round(errorRate * 100)}%`,
      tone: errorRate <= 0.05 ? 'ok' : errorRate <= 0.2 ? 'warn' : 'down',
    },
    {
      label: t('adm_total_calls'),
      value: totalCalls,
    },
  ];

  return (
    <div data-testid="performance-panel">
      <div className="flex items-center justify-between mb-3">
        <h2
          className="text-sm font-bold text-[#18181B] tracking-tight"
          style={{ fontFamily: 'Mazzard, Mazzard H, Mazzard M, system-ui, sans-serif' }}
        >
          PERFORMANCE
        </h2>
        <span
          className={`text-[11px] px-2.5 py-1 rounded-md font-bold uppercase tracking-wider border ${rollupMeta.bg} ${rollupMeta.text} ${rollupMeta.border}`}
          data-testid="performance-rollup"
        >
          {rollupMeta.label}
        </span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {tiles.map((t) => (
          <div
            key={t.label}
            className="bg-white rounded-xl border border-[#E4E4E7] p-4"
            data-testid={`perf-${t.label}`}
          >
            <p className="text-[10px] text-[#A1A1AA] uppercase tracking-wide mb-1">
              {t.label}
            </p>
            <p
              className={`text-2xl font-bold tracking-tight ${
                t.tone === 'down'
                  ? 'text-red-600'
                  : t.tone === 'warn'
                  ? 'text-amber-600'
                  : 'text-[#18181B]'
              }`}
            >
              {t.value}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
};

// ── 5. AlertsPanel ───────────────────────────────────────
const AlertsPanel = ({ alerts }) => {
  const { t } = useLang();
  if (!alerts || alerts.length === 0) {
    return (
      <div
        className="bg-white border border-[#E4E4E7] rounded-2xl p-4 flex items-center gap-3"
        data-testid="alerts-panel-empty"
      >
        <div className="w-9 h-9 rounded-lg bg-[#FAFAFA] border border-[#E4E4E7] flex items-center justify-center flex-shrink-0">
          <CheckCircle size={18} weight="duotone" className="text-[#3F3F46]" />
        </div>
        <div className="flex items-center gap-2 flex-1">
          <span
            className="inline-block w-1.5 h-1.5 rounded-full flex-shrink-0"
            style={{ background: '#16A34A' }}
          />
          <p className="text-[13.5px] text-[#18181B] font-medium">
            {t('adm_no_active_alerts_system_fully_healthy')}
          </p>
        </div>
      </div>
    );
  }
  return (
    <div data-testid="alerts-panel">
      <h2
        className="text-sm font-bold text-[#18181B] tracking-tight mb-3"
        style={{ fontFamily: 'Mazzard, Mazzard H, Mazzard M, system-ui, sans-serif' }}
      >
        {t('adm_alerts')} <span className="text-red-600">{alerts.length}</span>
      </h2>
      <div className="bg-white border border-red-200 rounded-xl divide-y divide-red-100">
        {alerts.map((a, i) => (
          <div
            key={i}
            className="px-4 py-3 flex items-start gap-3"
            data-testid={`alert-${i}`}
          >
            <WarningCircle
              size={18}
              weight="fill"
              className="text-red-500 flex-shrink-0 mt-0.5"
            />
            <p className="text-xs text-[#27272A]">{a}</p>
          </div>
        ))}
      </div>
    </div>
  );
};

// ── 7. OpsGuardianPanel ──────────────────────────────────
// Shows alerter/autoheal status so operators know the system will shout
// when they're not looking. Master-admin can fire a test alert to verify
// Telegram / webhook wiring before a real incident.
const OpsGuardianPanel = ({ canTest }) => {
  const { t } = useLang();
  const [status, setStatus] = useState(null);
  const [testing, setTesting] = useState(false);
  const [expandedAudit, setExpandedAudit] = useState(null); // index of expanded row

  const loadStatus = useCallback(async () => {
    try {
      const r = await axios.get(`${API_URL}/api/control/ops/status`);
      setStatus(r.data);
    } catch (e) {
      // Read-only admins without token get 401 here — silently keep old state.
    }
  }, []);

  useEffect(() => {
    loadStatus();
    const t = setInterval(loadStatus, 10000);
    return () => clearInterval(t);
  }, [loadStatus]);

  const runTest = async () => {
    if (!canTest || testing) return;
    setTesting(true);
    try {
      const r = await axios.post(`${API_URL}/api/control/ops/test-alert`, {
        title: 'ops test alert',
        message: t('adm_synthetic_alert_from_admin_ui'),
        severity: 'info',
      });
      if (r.data?.dispatched) toast.success(t('adm_alert_dispatched_to_external_channels'));
      else toast.message('Dispatched to audit log (no external channel configured)');
      loadStatus();
    } catch (e) {
      const detail = e?.response?.data?.detail || String(e);
      toast.error(detail);
    } finally {
      setTesting(false);
    }
  };

  if (!status) return null;

  const telegramOn = !!status?.channels?.telegram;
  const webhookOn = !!status?.channels?.webhook;
  const enabled = !!status?.enabled;
  const loopAge = status?.last_loop_age_sec;
  const loopStale = loopAge === null || loopAge === undefined || loopAge > (status?.interval_sec || 60) * 2;

  const dotByTone = {
    ok: '#16A34A',
    warn: '#F59E0B',
    down: '#DC2626',
    neutral: '#A1A1AA',
  };

  const statusItems = [
    {
      label: 'Guardian',
      value: enabled ? 'running' : 'disabled',
      tone: enabled ? (loopStale ? 'warn' : 'ok') : 'down',
    },
    {
      label: 'Telegram',
      value: telegramOn ? 'wired' : 'not set',
      tone: telegramOn ? 'ok' : 'warn',
    },
    {
      label: 'Webhook',
      value: webhookOn ? 'wired' : 'not set',
      tone: webhookOn ? 'ok' : 'warn',
    },
    {
      label: 'Tick',
      value: loopAge !== null && loopAge !== undefined ? `${loopAge}s ago` : 'never',
      tone: loopStale ? 'warn' : 'ok',
    },
    {
      label: 'Alerts',
      value: String(status?.counters?.total_alerts_sent || 0),
      tone: 'neutral',
    },
    {
      label: 'Heals',
      value: String(status?.counters?.total_heal_actions || 0),
      tone: 'neutral',
    },
  ];

  const audit = status?.recent_audit || [];

  // Compact, human-readable label for each audit kind. Unknown kinds fall back
  // to a Title-Cased version of the raw kind (so long machine names like
  // "alert_log_only" become a clean "Alert Log Only" instead of overflowing).
  const auditKindMeta = {
    alert_emitted: { label: 'Alert', dot: '#DC2626' },
    heal_action: { label: 'Heal', dot: '#F59E0B' },
    test_alert: { label: 'Test', dot: '#71717A' },
    alert_log_only: { label: 'Logged', dot: '#A1A1AA' },
  };
  const formatKindLabel = (k) => {
    if (!k) return 'Event';
    if (auditKindMeta[k]) return auditKindMeta[k].label;
    return String(k)
      .replace(/[_-]+/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase());
  };

  return (
    <div data-testid="ops-guardian-panel">
      <div className="flex items-center justify-between mb-3">
        <h2
          className="text-sm font-semibold text-[#18181B] tracking-tight flex items-center gap-2"
          style={{ fontFamily: 'Mazzard, Mazzard H, Mazzard M, system-ui, sans-serif' }}
        >
          <Siren size={16} weight="duotone" className="text-[#18181B]" />
          OPS Guardian · alerts &amp; auto-heal
        </h2>
        {canTest && (
          <button
            onClick={runTest}
            disabled={testing}
            data-testid="ops-test-alert"
            className="inline-flex items-center gap-2 h-9 px-3.5 rounded-xl bg-[#18181B] text-xs font-medium text-white hover:bg-[#27272A] transition-colors disabled:opacity-50 focus:outline-none focus-visible:ring-4 focus-visible:ring-black/10"
          >
            {testing ? (
              <CircleNotch size={12} className="animate-spin" />
            ) : (
              <Lightning size={12} weight="fill" />
            )}
            Fire test alert
          </button>
        )}
      </div>

      <div className="bg-white border border-[#E4E4E7] rounded-2xl p-4 sm:p-5 md:p-6">
        {/* ── Status mini-grid: borderless meta-rows ── */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-x-4 gap-y-3 sm:gap-y-4">
          {statusItems.map((it) => (
            <div key={it.label} className="min-w-0" data-testid={`ops-chip-${it.label.toLowerCase()}`}>
              <div className="text-[10px] uppercase tracking-[0.15em] text-[#A1A1AA] font-semibold mb-1">
                {it.label}
              </div>
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className="inline-block w-1.5 h-1.5 rounded-full flex-shrink-0"
                  style={{ background: dotByTone[it.tone] }}
                />
                <span className="text-[13px] font-semibold text-[#18181B] truncate">
                  {it.value}
                </span>
              </div>
            </div>
          ))}
        </div>

        {/* ── No channels warning ── */}
        {(!telegramOn && !webhookOn) && (
          <div className="mt-4 rounded-xl border border-[#E4E4E7] bg-[#FAFAFA] p-3 flex items-start gap-2.5">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-[#F59E0B] mt-1.5 shrink-0" />
            <p className="text-[12px] text-[#3F3F46] leading-relaxed">
              <span className="font-semibold text-[#18181B]">No external alert channels configured.</span> Set{' '}
              <span className="font-semibold text-[#18181B]">TELEGRAM_BOT_TOKEN</span>{' '}
              +{' '}
              <span className="font-semibold text-[#18181B]">TELEGRAM_CHAT_ID</span>{' '}
              or{' '}
              <span className="font-semibold text-[#18181B]">ALERT_WEBHOOK_URL</span>{' '}
              in backend env and restart to receive pages when the system degrades.
            </p>
          </div>
        )}

        {/* ── Recent audit — scrollable list with expandable details ── */}
        {audit.length > 0 && (
          <div className="mt-5 pt-4 border-t border-[#F4F4F5]">
            <div className="flex items-center justify-between mb-2.5">
              <p className="text-[10.5px] uppercase tracking-[0.15em] text-[#71717A] font-semibold">
                Recent audit
                <span className="ml-1 text-[#A1A1AA] normal-case tracking-normal font-normal">({audit.length})</span>
              </p>
              <span className="text-[10.5px] text-[#A1A1AA]">tap row for details</span>
            </div>
            <div
              className="rounded-xl border border-[#E4E4E7] bg-white divide-y divide-[#F4F4F5]"
              style={{
                maxHeight: '320px',
                overflowY: 'auto',
                WebkitOverflowScrolling: 'touch',
                overscrollBehavior: 'contain',
                touchAction: 'pan-y',
              }}
            >
              {audit.map((row, i) => {
                const isExpanded = expandedAudit === i;
                const kindMeta = auditKindMeta[row.kind] || { dot: '#A1A1AA' };
                const kindLabel = formatKindLabel(row.kind);
                const ts = row.ts ? new Date(row.ts * 1000) : null;
                const titleText = row.title || row.action || row.fingerprint || row.message || '—';
                return (
                  <div key={i}>
                    <button
                      type="button"
                      onClick={() => setExpandedAudit(isExpanded ? null : i)}
                      className="w-full text-left px-3 py-2.5 hover:bg-zinc-50/60 transition-colors focus:outline-none focus-visible:bg-zinc-50"
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <span
                          className="inline-block w-1.5 h-1.5 rounded-full flex-shrink-0"
                          style={{ background: kindMeta.dot || '#A1A1AA' }}
                        />
                        <span className="text-[10.5px] text-[#71717A] tabular-nums shrink-0">
                          {ts
                            ? ts.toLocaleTimeString('en-GB', {
                                hour: '2-digit',
                                minute: '2-digit',
                                second: '2-digit',
                              })
                            : '—'}
                        </span>
                        <span className="text-[9.5px] uppercase tracking-wider font-semibold text-[#52525B] bg-zinc-100 rounded px-1.5 py-0.5 shrink-0">
                          {kindLabel}
                        </span>
                        <CaretRight
                          size={12}
                          className={`text-[#A1A1AA] shrink-0 ml-auto transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                        />
                      </div>
                      <div className="pl-[14px] text-[12.5px] text-[#3F3F46] leading-snug break-words line-clamp-2">
                        {titleText}
                      </div>
                    </button>
                    {isExpanded && (
                      <div className="px-3 pb-3 pl-[28px] space-y-1.5 bg-zinc-50/40">
                        {row.severity && (
                          <div className="flex items-baseline gap-2 text-[11.5px]">
                            <span className="text-[#71717A] w-20 shrink-0">Severity</span>
                            <span className="text-[#18181B] font-medium capitalize">{row.severity}</span>
                          </div>
                        )}
                        {row.action && (
                          <div className="flex items-baseline gap-2 text-[11.5px]">
                            <span className="text-[#71717A] w-20 shrink-0">Action</span>
                            <span className="text-[#18181B]">{row.action}</span>
                          </div>
                        )}
                        {row.fingerprint && (
                          <div className="flex items-baseline gap-2 text-[11.5px]">
                            <span className="text-[#71717A] w-20 shrink-0">Fingerprint</span>
                            <span className="text-[#18181B] text-[10.5px] break-all">{row.fingerprint}</span>
                          </div>
                        )}
                        {row.message && (
                          <div className="flex items-baseline gap-2 text-[11.5px]">
                            <span className="text-[#71717A] w-20 shrink-0">Message</span>
                            <span className="text-[#3F3F46] leading-relaxed">{row.message}</span>
                          </div>
                        )}
                        {row.reason && (
                          <div className="flex items-baseline gap-2 text-[11.5px]">
                            <span className="text-[#71717A] w-20 shrink-0">Reason</span>
                            <span className="text-[#3F3F46] leading-relaxed">{row.reason}</span>
                          </div>
                        )}
                        {row.dispatched != null && (
                          <div className="flex items-baseline gap-2 text-[11.5px]">
                            <span className="text-[#71717A] w-20 shrink-0">Dispatched</span>
                            <span className="text-[#18181B]">{row.dispatched ? 'yes' : 'no (audit only)'}</span>
                          </div>
                        )}
                        {ts && (
                          <div className="flex items-baseline gap-2 text-[11.5px]">
                            <span className="text-[#71717A] w-20 shrink-0">Timestamp</span>
                            <span className="text-[#3F3F46] tabular-nums">{ts.toLocaleString()}</span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// ── 8. DebugPanel — with Retry ──────────────────────────
const CHAIN_STEPS = [
  { src: 'CACHE', label: 'Cache' },
  { src: 'SEARCH', label: 'BitMotors' },
  { src: 'WESTMOTORS', label: 'WestMotors' },
  { src: 'LEMON', label: 'Lemon' },
  { src: 'AUCTIONAUTO', label: 'AuctionAuto' },
  { src: 'POCTRA', label: 'Poctra' },
  { src: 'CARSFROMWEST', label: 'CarsFromWest' },
  { src: 'AUTOAUCTIONHISTORY', label: 'AAH' },
  { src: 'SALVAGEBID', label: 'SalvageBid' },
  { src: 'PAGE', label: 'BitMotors PAGE' },
];

const DebugPanel = ({ canProbe }) => {
  const { t } = useLang();
  const [query, setQuery] = useState('5YJSA1E25HF199047');
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState(null);
  const [lastRan, setLastRan] = useState(null);

  const run = useCallback(
    async (overrideQuery) => {
      if (!canProbe) return;
      const q = (overrideQuery ?? query ?? '').trim().toUpperCase();
      if (!q) return;
      setRunning(true);
      setResult(null);
      try {
        const r = await axios.post(`${API_URL}/api/control/debug/probe`, {
          query: q,
        });
        setResult(r.data);
        setLastRan(q);
        if (r.data?.found) toast.success(`Found via ${r.data.source}`);
        else toast.message(t('adm_not_found_in_any_source'));
      } catch (e) {
        const detail = e?.response?.data?.detail || String(e);
        setResult({ error: detail });
        toast.error(detail);
      } finally {
        setRunning(false);
      }
    },
    [query, canProbe],
  );

  // Mark every chain step as ❌ except the one that answered.
  const winnerSource = (result?.source || '').toUpperCase();
  const winnerKey = winnerSource.replace(/_CACHED$/, '').replace(/_/g, '');

  return (
    <div data-testid="debug-panel">
      <h2
        className="text-sm font-bold text-[#18181B] tracking-tight mb-3 flex items-center gap-2"
        style={{ fontFamily: 'Mazzard, Mazzard H, Mazzard M, system-ui, sans-serif' }}
      >
        <MagnifyingGlass size={16} weight="duotone" />
        {t('adm_debug_vin_lot_probe')}
      </h2>
      <div className="bg-white border border-[#E4E4E7] rounded-2xl p-4 sm:p-5">
        {!canProbe && (
          <div
            className="mb-3 px-3 py-2 rounded-md bg-[#FAFAFA] border border-[#E4E4E7] text-[11px] text-[#71717A] flex items-center gap-2"
            data-testid="debug-readonly"
          >
            <WarningCircle size={13} weight="fill" className="text-[#A1A1AA]" />
            {t('adm_readonly_mode_debug_probe_requires')} <b>master_admin</b> {t('adm_role')}
          </div>
        )}
        <div className="flex flex-col sm:flex-row gap-2 mb-3">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value.toUpperCase())}
            onKeyDown={(e) => e.key === 'Enter' && canProbe && run()}
            placeholder="VIN (17 chars) or LOT number"
            data-testid="debug-input"
            disabled={!canProbe}
            className="flex-1 h-11 px-3.5 py-2.5 text-sm tracking-wide border border-[#E4E4E7] bg-white rounded-xl text-[#18181B] focus:outline-none focus:border-[#18181B] focus-visible:ring-4 focus-visible:ring-black/10 disabled:bg-[#FAFAFA] disabled:text-[#A1A1AA] disabled:cursor-not-allowed transition-colors"
          />
          <button
            onClick={() => run()}
            disabled={running || !canProbe}
            data-testid="debug-run"
            className="inline-flex items-center justify-center gap-2 h-11 px-5 rounded-xl bg-[#18181B] text-sm font-medium text-white hover:bg-[#27272A] transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-4 focus-visible:ring-black/10"
          >
            {running ? (
              <>
                <CircleNotch size={14} className="animate-spin" />
                {t('adm_probing')}
              </>
            ) : (
              <>
                <Lightning size={14} weight="fill" />
                RUN
              </>
            )}
          </button>
        </div>
        {result && !result.error && (
          <div data-testid="debug-result">
            <div className="flex flex-wrap items-center gap-3 mb-3 pb-3 border-b border-[#F4F4F5]">
              <div className="flex items-center gap-2">
                {result.found ? (
                  <CheckCircle size={18} weight="fill" className="text-emerald-600" />
                ) : (
                  <XCircle size={18} weight="fill" className="text-red-500" />
                )}
                <span className="text-sm font-bold text-[#18181B]">
                  {result.found ? 'FOUND' : 'NOT FOUND'}
                </span>
              </div>
              {result.found && (
                <>
                  <span className="text-xs text-[#71717A]">
                    via{' '}
                    <span className="font-semibold text-[#18181B]">
                      {result.source}
                    </span>
                  </span>
                  <span className="text-xs text-[#71717A]">
                    {result.latency_ms}ms
                  </span>
                  {result.title && (
                    <span className="text-xs text-[#52525B]">
                      — {result.title}
                    </span>
                  )}
                </>
              )}
              {!result.found && (
                <span className="text-xs text-[#71717A]">
                  walked full chain · {result.latency_ms}ms
                </span>
              )}
              {/* Retry button — re-runs the last probe without retyping */}
              {lastRan && (
                <button
                  onClick={() => run(lastRan)}
                  disabled={running}
                  data-testid="debug-retry"
                  className="ml-auto text-[11px] font-semibold text-blue-600 hover:text-blue-800 flex items-center gap-1 disabled:opacity-50"
                >
                  <ArrowClockwise size={12} weight="bold" />
                  {t('adm_retry')}
                </button>
              )}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
              {CHAIN_STEPS.map((step) => {
                const matches =
                  result.found && winnerKey === step.src.replace(/_/g, '');
                const Icon = matches ? CheckCircle : XCircle;
                return (
                  <div
                    key={step.src}
                    className={`flex items-center gap-2 px-3 py-2 rounded-md border text-xs ${
                      matches
                        ? 'bg-emerald-50 border-emerald-200 text-emerald-800 font-semibold'
                        : 'bg-[#FAFAFA] border-[#F4F4F5] text-[#A1A1AA]'
                    }`}
                  >
                    <Icon
                      size={12}
                      weight="fill"
                      className={matches ? 'text-emerald-600' : 'text-[#D4D4D8]'}
                    />
                    {step.label}
                  </div>
                );
              })}
            </div>
            {result.found && result.image_count > 0 && (
              <p className="text-[11px] text-[#71717A] mt-3">
                year:{' '}
                <span className="text-[#18181B] font-medium">
                  {result.year || '—'}
                </span>{' '}
                · make:{' '}
                <span className="text-[#18181B] font-medium">
                  {result.make || '—'}
                </span>{' '}
                · model:{' '}
                <span className="text-[#18181B] font-medium">
                  {result.model || '—'}
                </span>{' '}
                · images:{' '}
                <span className="text-[#18181B] font-medium">
                  {result.image_count}
                </span>
              </p>
            )}
          </div>
        )}
        {result?.error && (
          <div className="flex items-start gap-2">
            <p className="flex-1 text-xs text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">
              {result.error}
            </p>
            {lastRan && (
              <button
                onClick={() => run(lastRan)}
                disabled={running}
                data-testid="debug-retry-err"
                className="text-[11px] font-semibold text-blue-600 hover:text-blue-800 flex items-center gap-1 self-center whitespace-nowrap disabled:opacity-50"
              >
                <ArrowClockwise size={12} weight="bold" />
                {t('adm_retry')}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════
// EXTENSION SETUP TAB — embedded inside Parser Control
// (replaces the old standalone /admin/parser/chrome-extension page)
// ═══════════════════════════════════════════════════════════════════
const ExtensionSetupTab = () => {
  const { t } = useLang();
  const [info, setInfo] = useState(null);
  const [copiedField, setCopiedField] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await axios.get(`${API_URL}/api/extension/info`);
        if (!cancelled) setInfo(r.data);
      } catch (_) { /* ok */ }
    })();
    return () => { cancelled = true; };
  }, []);

  const copyToClipboard = (text, field, label = t('adm2_1be0a269d9')) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    toast.success(label);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const handleDownload = async () => {
    try {
      toast.info(t('adm_preparing_zip'));
      const res = await axios.get(`${API_URL}/api/extension/download`, {
        responseType: 'blob',
      });
      const blob = new Blob([res.data], { type: 'application/zip' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'bibi-cars-extension.zip';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(url), 1500);
      toast.success(`${t('r9_loaded_text')} ${(blob.size / 1024).toFixed(1)} KB`);
    } catch (err) {
      toast.error(`${t('r9_load_error_msg')}: ${err?.response?.status || err.message}`);
    }
  };

  const fmtSize = (b) => {
    if (!b) return '~18 KB';
    if (b < 1024) return `${b} B`;
    if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
    return `${(b / (1024 * 1024)).toFixed(2)} MB`;
  };

  const backendUrl =
    typeof window !== 'undefined'
      ? window.location.origin
      : 'https://your-backend.example.com';

  const SOURCES = [
    { id: 'poctra',             label: t('adm_poctracom'),             role: 'CF · INDEX' },
    { id: 'carsfromwest',       label: t('adm_carsfromwestcom'),       role: 'CF · INDEX' },
    { id: 'autoauctionhistory', label: t('adm_autoauctionhistorycom'), role: 'CF · INDEX' },
    { id: 'salvagebid',         label: t('adm_salvagebidcom'),         role: 'CF · LIVE'  },
  ];

  const CopyBtn = ({ value, field, label }) => (
    <button
      type="button"
      onClick={() => copyToClipboard(value, field, label)}
      className="inline-flex items-center justify-center h-8 w-8 shrink-0 rounded-lg border border-[#E4E4E7] bg-white text-[#18181B] hover:bg-zinc-50 transition-colors focus:outline-none focus-visible:ring-4 focus-visible:ring-black/10"
      title={t('adm_copy_2')}
    >
      {copiedField === field ? <Check size={13} weight="bold" className="text-[#16A34A]" /> : <Copy size={13} />}
    </button>
  );

  return (
    <div className="space-y-4 sm:space-y-5" data-testid="ext-setup-tab">
      {/* ─── HERO card ─────────────────────────────────────── */}
      <div className="rounded-2xl border border-[#E4E4E7] bg-white p-4 sm:p-5 md:p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2.5">
              <div className="inline-flex items-center justify-center w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-[#F4F4F5] shrink-0">
                <Browser size={18} weight="duotone" className="text-[#18181B]" />
              </div>
              <div className="min-w-0">
                <h3 className="text-[15px] sm:text-base md:text-lg font-semibold text-[#18181B] leading-tight" style={{ fontFamily: 'Mazzard, Mazzard H, Mazzard M, system-ui, sans-serif' }}>
                  Chrome Extension
                </h3>
                <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-[#71717A]">
                  <span className="font-medium">v{info?.version || '4.1.0'}</span>
                  <span className="text-[#D4D4D8]">·</span>
                  <span className="inline-flex items-center gap-1 text-[10.5px] uppercase tracking-wider font-medium">
                    <span className="inline-block w-1.5 h-1.5 rounded-full bg-[#16A34A]" />
                    Multi-source CF bypass
                  </span>
                </div>
              </div>
            </div>
            <p className="mt-3 text-[12.5px] sm:text-[13px] text-[#52525B] max-w-2xl leading-relaxed">
              {t('adm3_9b55233b99')}
            </p>
            <p className="mt-2 text-[10.5px] text-[#A1A1AA]">
              {t('r9_zip_size')}: {fmtSize(info?.file_size)}
              {info?.file_count ? ` · ${info.file_count} ${t('r9_files_label')}` : ''} · {t('r9_without_legacy')}
            </p>
          </div>
          <button
            onClick={handleDownload}
            data-testid="setup-download-extension"
            className="inline-flex items-center justify-center gap-2 h-11 px-5 rounded-xl bg-[#18181B] text-sm font-medium text-white hover:bg-[#27272A] transition-colors w-full md:w-auto shrink-0 focus:outline-none focus-visible:ring-4 focus-visible:ring-black/10"
          >
            <Download size={15} weight="bold" />
            {t('adm_download_zip')}
          </button>
        </div>
      </div>

      {/* ─── Install steps ─────────────────────────────────────── */}
      <div className="rounded-2xl border border-[#E4E4E7] bg-white p-4 sm:p-5 md:p-6">
        <div className="flex items-center gap-2 mb-4 sm:mb-5">
          <Lightning size={16} weight="duotone" className="text-[#F59E0B]" />
          <h3 className="text-[15px] sm:text-base font-semibold text-[#18181B]" style={{ fontFamily: 'Mazzard, Mazzard H, Mazzard M, system-ui, sans-serif' }}>
            {t('adm3_d2554c9904')}
          </h3>
        </div>
        <ol className="space-y-3 sm:space-y-3.5">
          {[
            { n: 1, text: t('adm_download_the_zip_using_the_button_above') },
            { n: 2, text: t('adm_unpack_the_archive_into_any_convenient_folder') },
          ].map((s) => (
            <Step key={s.n} n={s.n}>{s.text}</Step>
          ))}
          <Step n={3}>
            {t('r9_open_4b8a9c')}{' '}
            <span className="bg-zinc-100 px-1.5 py-0.5 rounded text-[11.5px] text-[#18181B] font-medium">chrome://extensions/</span>{' '}
            {t('r9_in_chrome_1f2c3d')}
          </Step>
          <Step n={4}>
            {t('adm_enable')} <strong className="font-semibold text-[#18181B]">{t('adm_developer_mode')}</strong> (top-right).
          </Step>
          <Step n={5}>
            {t('adm_click')} <strong className="font-semibold text-[#18181B]">{t('adm_download_unpacked')}</strong> {t('adm_and_select_the_unzipped_folder_2')}
          </Step>
          <Step n={6}>{t('adm_click_the_bibi_icon_in_the_toolbar_a_popup_will_op')}</Step>

          {/* Step 7 — Popup configuration panel */}
          <li className="flex gap-3">
            <span className="flex-shrink-0 inline-flex items-center justify-center w-6 h-6 rounded-lg bg-[#18181B] text-white text-[11.5px] font-semibold">7</span>
            <div className="flex-1 min-w-0 space-y-3">
              <p className="text-[13px] sm:text-sm text-[#3F3F46] leading-relaxed">
                {t('adm2_popup_1500a85eae')}
              </p>
              <div className="rounded-xl border border-[#E4E4E7] bg-zinc-50/40 p-3 sm:p-3.5 space-y-2.5">
                {/* BACKEND URL — label + auto-detected hint + copy */}
                <KeyRow
                  label={t('adm_backend_url')}
                  copyValue={backendUrl}
                  copyField="backend"
                  copyLabel={t('adm_backend_url_copied')}
                  CopyBtn={CopyBtn}
                >
                  <code className="flex-1 min-w-0 bg-white border border-[#E4E4E7] px-2.5 py-1.5 rounded-lg text-[11px] text-[#71717A] truncate" title={backendUrl}>
                    auto-detected · {new URL(backendUrl).host}
                  </code>
                </KeyRow>

                {/* CLIENT LABEL */}
                <KeyRow
                  label={t('adm_client_label')}
                  CopyBtn={CopyBtn}
                >
                  <code className="flex-1 min-w-0 bg-white border border-[#E4E4E7] px-2.5 py-1.5 rounded-lg text-[11.5px] text-[#A1A1AA]">
                    owner-laptop
                  </code>
                  <span className="text-[10.5px] text-[#A1A1AA] shrink-0 hidden sm:inline">
                    {t('adm_any_name')}
                  </span>
                </KeyRow>

                {/* HMAC SECRET */}
                <KeyRow label={t('adm_hmac_secret')} CopyBtn={CopyBtn}>
                  {info?.hmac_secret ? (
                    <>
                      <code
                        className="flex-1 min-w-0 bg-white border border-[#E4E4E7] px-2.5 py-1.5 rounded-lg text-[11px] text-[#18181B] break-all tracking-wide"
                        data-testid="hmac-secret-value"
                      >
                        {info.hmac_secret}
                      </code>
                      <CopyBtn value={info.hmac_secret} field="hmac" label={t('adm_hmac_secret_copied')} />
                    </>
                  ) : (
                    <span className="text-[11px] text-[#92400E] bg-[#FFFBEB] border border-[#FDE68A] px-2.5 py-1.5 rounded-lg w-full">
                      {t('adm_ext_shared_secret_is_not_set_in_backendenv')}
                    </span>
                  )}
                </KeyRow>
              </div>
            </div>
          </li>

          <Step n={8}>
            {t('adm_click')} <strong className="font-semibold text-[#18181B]">{t('adm_save_2')}</strong> {t('adm3_9f23a06622')}
            <span className="bg-zinc-100 px-1 rounded text-[11.5px] text-[#18181B] font-medium">/api/ext/register</span>{t('adm3_9d689ddf04')}
          </Step>
        </ol>

        {/* Success hint */}
        <div className="mt-5 rounded-xl border border-[#E4E4E7] bg-white px-3.5 py-2.5 flex items-start gap-2.5">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-[#16A34A] mt-2 shrink-0" />
          <p className="text-[12px] sm:text-[12.5px] text-[#3F3F46] leading-relaxed">
            {t('adm_after_successful_connection_on_this_page_in_the_bl')} <strong className="font-semibold text-[#18181B]">{t('adm_extension_status')}</strong> {t('adm_1_online_client_with_last_seen_5_s_will_appear_and')}
          </p>
        </div>
      </div>

      {/* ─── Supported sources ─────────────────────────────────────── */}
      <div className="rounded-2xl border border-[#E4E4E7] bg-white p-4 sm:p-5 md:p-6">
        <div className="flex items-center gap-2 mb-3 sm:mb-4">
          <Plugs size={16} weight="duotone" className="text-[#18181B]" />
          <h3 className="text-[15px] sm:text-base font-semibold text-[#18181B]" style={{ fontFamily: 'Mazzard, Mazzard H, Mazzard M, system-ui, sans-serif' }}>
            {t('adm_supported_sources')}
          </h3>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-2.5">
          {SOURCES.map((s) => (
            <div
              key={s.id}
              className="flex items-center gap-2.5 p-2.5 sm:p-3 rounded-xl border border-[#E4E4E7] bg-white"
            >
              <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-[#16A34A] shrink-0">
                <CheckCircle size={11} weight="fill" className="text-white" />
              </span>
              <span className="flex-1 text-[13px] sm:text-sm font-medium text-[#18181B] truncate" title={s.label}>
                {s.label}
              </span>
              <span className="text-[9.5px] text-[#71717A] bg-zinc-50 border border-[#E4E4E7] px-1.5 py-0.5 rounded shrink-0 whitespace-nowrap tracking-wider font-semibold uppercase">
                {s.role}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* ─── Common issues ─────────────────────────────────────── */}
      <div className="rounded-2xl border border-[#E4E4E7] bg-white p-4 sm:p-5 md:p-6">
        <div className="flex items-center gap-2 mb-3 sm:mb-4">
          <Warning size={16} weight="duotone" className="text-[#F59E0B]" />
          <h3 className="text-[15px] sm:text-base font-semibold text-[#18181B]" style={{ fontFamily: 'Mazzard, Mazzard H, Mazzard M, system-ui, sans-serif' }}>
            {t('adm_common_issues')}
          </h3>
        </div>
        <div className="space-y-3">
          <Issue n={1} title={t('adm_1_popup_shows_nothing')}>
            <li>{t('adm_reload_the_extension_in_chromeextensions')}</li>
            <li>{t('adm_make_sure_the_backend_url_is_specified_correctly_a')}</li>
            <li>{t('adm_open_inspect_views_background_check_registration_l')}</li>
          </Issue>
          <Issue n={2} title={t('adm_2_in_status_above_0_clients')}>
            <li>
              {t('adm_the_hmac_secret_in_the_popup_must_exactly_match_th')}{' '}
              <span className="bg-zinc-100 px-1 rounded text-[10.5px] text-[#18181B] font-medium">EXT_SHARED_SECRET</span>{' '}
              {t('adm2_22842a6c50')}{' '}
              <span className="bg-zinc-100 px-1 rounded text-[10.5px] text-[#18181B] font-medium">{t('adm_backendenv')}</span>.
            </li>
            <li>
              {t('adm_in_the_network_tab_background_pages_must_post_to')}{' '}
              <span className="bg-zinc-100 px-1 rounded text-[10.5px] text-[#18181B] font-medium">/api/ext/heartbeat</span>{' '}
              {t('adm2_60_200_ok_39dbe1ae6b')}
            </li>
          </Issue>
          <Issue n={3} title={t('adm_3_json_parse_error_unexpected_nonwhitespace')}>
            <li className="list-none -ml-4">{t('adm2_v3_x_v4_0_chrome_extens_95f860ec9f')}</li>
          </Issue>
          <Issue n={4} title={t('adm_4_410_gone_on_old_endpoints')}>
            <li className="list-none -ml-4">
              {t('r9_not_error_v4_legacy_8e7f6a')}{' '}
              <span className="bg-zinc-100 px-1 rounded text-[10.5px] text-[#18181B] font-medium">/api/copart/*</span>,{' '}
              <span className="bg-zinc-100 px-1 rounded text-[10.5px] text-[#18181B] font-medium">/api/bidcars/*</span>,{' '}
              <span className="bg-zinc-100 px-1 rounded text-[10.5px] text-[#18181B] font-medium">/api/carfast/*</span>{' '}
              {t('adm_return_json_410_gone_so_old_clients_explicitly_see')}
            </li>
          </Issue>
        </div>
      </div>
    </div>
  );
};

// --- helpers for ExtensionSetupTab ---
function Step({ n, children }) {
  return (
    <li className="flex gap-3">
      <span className="flex-shrink-0 inline-flex items-center justify-center w-6 h-6 rounded-lg bg-[#18181B] text-white text-[11.5px] font-semibold">
        {n}
      </span>
      <span className="flex-1 min-w-0 text-[13px] sm:text-sm text-[#3F3F46] leading-relaxed [overflow-wrap:anywhere]">
        {children}
      </span>
    </li>
  );
}

function KeyRow({ label, children, copyValue, copyField, copyLabel, CopyBtn }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-3">
      <span className="text-[10px] sm:text-[10.5px] font-semibold text-[#71717A] sm:w-24 sm:flex-shrink-0 uppercase tracking-wider">
        {label}
      </span>
      <div className="flex items-center gap-2 min-w-0 flex-1">
        {children}
        {copyValue && CopyBtn && (
          <CopyBtn value={copyValue} field={copyField} label={copyLabel} />
        )}
      </div>
    </div>
  );
}

function Issue({ n, title, children }) {
  return (
    <div className="rounded-xl border border-[#E4E4E7] bg-zinc-50/40 px-3 py-3 sm:px-3.5 sm:py-3.5">
      <p className="font-semibold text-[#18181B] text-[13px] sm:text-sm mb-1 flex items-center gap-2">
        <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-white border border-[#E4E4E7] text-[10.5px] font-semibold text-[#18181B] shrink-0">
          {n}
        </span>
        <span className="min-w-0">{title}</span>
      </p>
      <ul className="list-disc list-outside text-[11.5px] sm:text-[12px] text-[#52525B] space-y-1 ml-7 leading-relaxed">
        {children}
      </ul>
    </div>
  );
}


// ─────────────────────────────────────────────────────────────────────────
// LiveParsersPanel — light-theme console for /api/ingestion/admin/parsers/*
// Replaces the standalone dark ParserManagerPage. Lives inside the existing
// VIN Parser dashboard so admins keep ONE light-themed surface for parser
// ops. Fully i18n-aware (en/uk/bg) and mobile-adaptive.
// ─────────────────────────────────────────────────────────────────────────

const READINESS_CLS = {
  ready:        'bg-emerald-50 text-emerald-700 border-emerald-200',
  needs_config: 'bg-amber-50 text-amber-700 border-amber-200',
  incomplete:   'bg-red-50 text-red-700 border-red-200',
  unknown:      'bg-zinc-50 text-zinc-600 border-zinc-200',
};

const STATUS_DOT_LIGHT = {
  running: 'bg-emerald-500 animate-pulse',
  standby: 'bg-zinc-400',
  paused:  'bg-amber-500',
  error:   'bg-red-500',
};

const TYPE_PILL_LIGHT = {
  api:        'bg-sky-50 text-sky-700 border-sky-200',
  playwright: 'bg-violet-50 text-violet-700 border-violet-200',
  extension:  'bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200',
  passive:    'bg-zinc-50 text-zinc-600 border-zinc-200',
};

// Locale-aware relative-time formatter using Intl. Falls back to EN on
// unsupported locales (Intl.RelativeTimeFormat exists everywhere modern).
const formatRelativeIntl = (iso, lang) => {
  if (!iso) return null;
  try {
    const then = new Date(iso).getTime();
    const diff = Math.round((then - Date.now()) / 1000);
    const abs = Math.abs(diff);
    const localeCode = lang === 'uk' ? 'uk' : lang === 'bg' ? 'bg' : 'en';
    const rtf = new Intl.RelativeTimeFormat(localeCode, { numeric: 'auto' });
    if (abs < 60) return rtf.format(diff, 'second');
    if (abs < 3600) return rtf.format(Math.round(diff / 60), 'minute');
    if (abs < 86400) return rtf.format(Math.round(diff / 3600), 'hour');
    return rtf.format(Math.round(diff / 86400), 'day');
  } catch {
    return String(iso).slice(0, 19);
  }
};

const readinessLabel = (t, readiness) => {
  switch (readiness) {
    case 'ready':        return t('pc_readiness_ready');
    case 'needs_config': return t('pc_readiness_needs_config');
    case 'incomplete':   return t('pc_readiness_incomplete');
    default:             return t('pc_readiness_unknown');
  }
};

const LiveParserCard = ({ parser, busy, canManage, onAction, t, lang }) => {
  const {
    source, name, type, status, readiness, readinessDetail,
    lastRunAt, lastSuccessAt, itemsParsed, itemsCreated, errorsCount,
    isPaused, circuitState, documentsInDB, extensionSessions, apiKeyConfigured,
  } = parser;

  const readinessClass = READINESS_CLS[readiness] || READINESS_CLS.unknown;
  const typeCls = TYPE_PILL_LIGHT[type] || TYPE_PILL_LIGHT.passive;
  const dotCls  = STATUS_DOT_LIGHT[status] || STATUS_DOT_LIGHT.standby;
  const circuitOpen = circuitState === 'open';
  const canRun = canManage && readiness === 'ready' && !busy;
  const lastTime = formatRelativeIntl(lastRunAt || lastSuccessAt, lang) || '—';

  const Metric = ({ icon: Icon, label, value, danger }) => (
    <div className="flex items-center gap-2 rounded-lg bg-[#FAFAFA] border border-[#E4E4E7] px-2.5 py-2 min-w-0">
      <Icon size={14} weight="duotone" className={`shrink-0 ${danger ? 'text-red-500' : 'text-[#71717A]'}`} />
      <div className="min-w-0 flex-1">
        <div className="text-[10px] uppercase tracking-wide text-[#71717A] leading-none truncate">{label}</div>
        <div className={`text-[13px] font-semibold truncate ${danger ? 'text-red-600' : 'text-[#18181B]'}`}>
          {String(value)}
        </div>
      </div>
    </div>
  );

  return (
    <article
      className="bg-white border border-[#E4E4E7] rounded-2xl p-3.5 sm:p-5 hover:border-[#A1A1AA] transition-colors min-w-0"
      data-testid={`live-parser-card-${source}`}
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 min-w-0">
            <span className={`inline-block w-2 h-2 rounded-full shrink-0 ${dotCls}`} />
            <h3 className="text-[14px] font-semibold text-[#18181B] truncate">{name}</h3>
          </div>
          <p className="text-[11px] text-[#71717A] mt-0.5 truncate font-mono">{source}</p>
        </div>
        <span className={`shrink-0 text-[10px] uppercase tracking-wide px-2 py-1 rounded-md border font-medium ${typeCls}`}>
          {type}
        </span>
      </div>

      <div className="flex flex-wrap gap-1.5 items-center mb-3">
        <span
          className={`text-[11px] px-2 py-0.5 rounded-md border font-medium ${readinessClass}`}
          data-testid={`live-parser-readiness-${source}`}
        >
          {readinessLabel(t, readiness)}
        </span>
        {circuitOpen && (
          <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-md border bg-red-50 text-red-700 border-red-200 font-medium">
            <ShieldSlash size={12} weight="duotone" /> {t('pc_circuit_open')}
          </span>
        )}
        {isPaused && (
          <span className="text-[11px] px-2 py-0.5 rounded-md border bg-amber-50 text-amber-700 border-amber-200 font-medium">
            {t('pc_paused')}
          </span>
        )}
        {apiKeyConfigured === false && (
          <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-md border bg-amber-50 text-amber-700 border-amber-200 font-medium">
            <Gear size={12} weight="duotone" /> {t('pc_apikey_missing')}
          </span>
        )}
      </div>

      {readinessDetail && (
        <p className="text-[11.5px] text-[#52525B] leading-relaxed mb-3 line-clamp-3">
          {readinessDetail}
        </p>
      )}

      <div className="grid grid-cols-2 gap-2 mb-4">
        <Metric icon={Database}    label={t('pc_metric_indb')}    value={documentsInDB ?? '—'} />
        <Metric icon={Clock}       label={t('pc_metric_last')}    value={lastTime} />
        <Metric icon={TrendUp}     label={t('pc_metric_parsed')}  value={itemsParsed ?? 0} />
        <Metric icon={CheckCircle} label={t('pc_metric_created')} value={itemsCreated ?? 0} />
        {(errorsCount ?? 0) > 0 && (
          <Metric icon={XCircle} label={t('pc_metric_errors')} value={errorsCount} danger />
        )}
        {type === 'extension' && (
          <Metric icon={Gear} label={t('pc_metric_sessions')} value={extensionSessions ?? 0} />
        )}
      </div>

      {canManage && (
        <div className="grid grid-cols-3 gap-2 pt-3 border-t border-[#E4E4E7]">
          <button
            type="button"
            disabled={!canRun}
            onClick={() => onAction(source, 'run-once', { successKey: 'pc_msg_run_once_started', name })}
            className="inline-flex items-center justify-center gap-1.5 h-9 px-2 rounded-lg bg-white border border-[#E4E4E7] hover:border-[#18181B] text-[12px] font-medium text-[#18181B] disabled:opacity-40 disabled:cursor-not-allowed transition-colors min-w-0"
            data-testid={`live-parser-run-once-${source}`}
          >
            {busy === 'run-once'
              ? <CircleNotch size={12} className="animate-spin shrink-0" />
              : <Lightning size={12} weight="duotone" className="shrink-0" />}
            <span className="truncate">Run Once</span>
          </button>
          <button
            type="button"
            disabled={!canRun || status === 'running'}
            onClick={() => onAction(source, 'run', { successKey: 'pc_msg_run_started', name })}
            className="inline-flex items-center justify-center gap-1.5 h-9 px-2 rounded-lg bg-[#18181B] hover:bg-[#27272A] text-[12px] font-semibold text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors min-w-0"
            data-testid={`live-parser-run-${source}`}
          >
            {busy === 'run'
              ? <CircleNotch size={12} className="animate-spin shrink-0" />
              : <Play size={12} weight="fill" className="shrink-0" />}
            <span className="truncate">Run</span>
          </button>
          <button
            type="button"
            disabled={busy || status !== 'running'}
            onClick={() => onAction(source, 'stop', { successKey: 'pc_msg_stop_signal', name })}
            className="inline-flex items-center justify-center gap-1.5 h-9 px-2 rounded-lg bg-white border border-red-200 hover:bg-red-50 text-[12px] font-medium text-red-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors min-w-0"
            data-testid={`live-parser-stop-${source}`}
          >
            {busy === 'stop'
              ? <CircleNotch size={12} className="animate-spin shrink-0" />
              : <Stop size={12} weight="fill" className="shrink-0" />}
            <span className="truncate">Stop</span>
          </button>
          {circuitOpen && (
            <button
              type="button"
              disabled={busy === 'circuit-breaker/reset'}
              onClick={() => onAction(source, 'circuit-breaker/reset', { successKey: 'pc_msg_circuit_reset', name })}
              className="col-span-3 inline-flex items-center justify-center gap-1.5 h-9 px-3 rounded-lg bg-amber-50 hover:bg-amber-100 border border-amber-200 text-[12px] font-medium text-amber-700 transition-colors"
              data-testid={`live-parser-reset-circuit-${source}`}
            >
              {busy === 'circuit-breaker/reset'
                ? <CircleNotch size={12} className="animate-spin shrink-0" />
                : <ShieldSlash size={12} weight="duotone" className="shrink-0" />}
              <span className="truncate">{t('pc_reset_circuit')}</span>
            </button>
          )}
        </div>
      )}
    </article>
  );
};

const LiveParsersPanel = ({ canManage }) => {
  const { t, lang } = useLang();
  const { token } = useAuth();
  const [parsers, setParsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastFetch, setLastFetch] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState({});
  // Per-source vehicle-cap for the next run-once / run-all click. Backend
  // derives `max_pages` from `max_vehicles` (≈30 cars/page on bitmotors).
  // Default 1000 — a reasonable upper bound for a single manual sweep.
  const [vehicleLimit, setVehicleLimit] = useState(1000);

  const authHeaders = useMemo(
    () => (token ? { Authorization: `Bearer ${token}` } : {}),
    [token],
  );

  const fetchParsers = useCallback(async (silent = false) => {
    if (!silent) setRefreshing(true);
    try {
      const res = await axios.get(
        `${API_URL}/api/ingestion/admin/parsers`,
        { headers: authHeaders, timeout: 15000 },
      );
      if (res.data && Array.isArray(res.data.parsers)) {
        setParsers(res.data.parsers);
        setError(null);
        setLastFetch(new Date());
      } else {
        throw new Error('Unexpected response shape');
      }
    } catch (e) {
      const status = e?.response?.status;
      const msg = (status === 401 || status === 403)
        ? t('pc_no_access')
        : (e?.response?.data?.detail || e.message || t('pc_load_fail'));
      setError(msg);
      if (!silent) toast.error(`${t('pc_load_fail')}: ${msg}`);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [authHeaders, t]);

  useEffect(() => {
    fetchParsers(false);
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') fetchParsers(true);
    }, 5000);
    return () => clearInterval(id);
  }, [fetchParsers]);

  const callAction = useCallback(
    async (source, action, opts = {}) => {
      if (!canManage) return;
      const path = `${API_URL}/api/ingestion/admin/parsers/${source}/${action}`;
      setBusy((b) => ({ ...b, [source]: action }));
      try {
        // Auto-inject the vehicle limit for run-once so the operator can cap
        // how many cars a manual sweep touches (≈30 cars / bitmotors page).
        const autoBody =
          action === 'run-once'
            ? { max_vehicles: Math.max(0, Number(vehicleLimit) || 0) }
            : {};
        const body = { ...autoBody, ...(opts.body || {}) };
        const res = await axios.post(path, body, {
          headers: authHeaders,
          timeout: action === 'run-once' ? 120000 : 30000,
        });
        const successMsg = opts.successKey
          ? `${t(opts.successKey)} → ${opts.name || source}`
          : `${action.replace(/-/g, ' ')} → ${source}`;
        const resultDescr = res.data?.result
          ? `pages=${res.data.result.pages_scraped ?? '—'} found=${res.data.result.vehicles_found ?? '—'} new=${res.data.result.new ?? 0}`
          : (res.data?.message || res.data?.detail || undefined);
        toast.success(successMsg, { description: resultDescr });
        fetchParsers(true);
        return res.data;
      } catch (e) {
        const status = e?.response?.status;
        const detail =
          e?.response?.data?.message ||
          e?.response?.data?.detail ||
          e?.response?.data?.error ||
          e.message ||
          t('pc_unknown_error');
        if (status === 410) {
          const useInstead = e?.response?.data?.use_instead;
          toast.info(`${action.replace(/-/g, ' ')} — ${t('pc_deprecated')} ${source}`, {
            description: useInstead ? `${detail}\n${t('pc_use_instead')}: ${useInstead}` : detail,
            duration: 8000,
          });
        } else {
          toast.error(`${action} → ${source} ${t('pc_action_failed')}`, { description: detail });
        }
        return null;
      } finally {
        setBusy((b) => {
          const next = { ...b };
          delete next[source];
          return next;
        });
      }
    },
    [authHeaders, fetchParsers, canManage, t, vehicleLimit],
  );

  const runAll = useCallback(async () => {
    if (!canManage) return;
    if (!window.confirm(t('pc_confirm_run_all'))) return;
    try {
      const body = {
        max_vehicles: Math.max(0, Number(vehicleLimit) || 0),
        run_once: true,
      };
      const res = await axios.post(
        `${API_URL}/api/ingestion/admin/parsers/run-all`,
        body,
        { headers: authHeaders, timeout: 120000 },
      );
      const results = res.data?.results || {};
      const startedCount = Object.values(results).filter(
        (r) => r && (r.started || r.success !== false),
      ).length;
      toast.success(t('pc_toast_run_all_done'), {
        description: res.data?.message
          ? `${res.data.message} · ${t('pc_toast_started_n').replace('{n}', String(startedCount))} · cap=${vehicleLimit}`
          : t('pc_toast_started_n').replace('{n}', String(startedCount)),
        duration: 6000,
      });
      fetchParsers(true);
    } catch (e) {
      toast.error(t('pc_toast_run_all_fail'), { description: e?.response?.data?.detail || e.message });
    }
  }, [authHeaders, fetchParsers, canManage, t, vehicleLimit]);

  const stopAll = useCallback(async () => {
    if (!canManage) return;
    if (!window.confirm(t('pc_confirm_stop_all'))) return;
    try {
      const res = await axios.post(
        `${API_URL}/api/ingestion/admin/parsers/stop-all`,
        {},
        { headers: authHeaders, timeout: 30000 },
      );
      const stopped = res.data?.stopped ?? '?';
      toast.success(t('pc_toast_stop_all_done'), {
        description: res.data?.message || t('pc_toast_stopped_n').replace('{n}', String(stopped)),
      });
      fetchParsers(true);
    } catch (e) {
      toast.error(t('pc_toast_stop_all_fail'), { description: e?.response?.data?.detail || e.message });
    }
  }, [authHeaders, fetchParsers, canManage, t]);

  const lastFetchLabel = lastFetch ? formatRelativeIntl(lastFetch.toISOString(), lang) : null;

  return (
    <section className="space-y-4" data-testid="live-parsers-panel">
      {/* Architecture banner — light theme, mobile-adaptive */}
      <div
        className="rounded-2xl border border-sky-200 bg-sky-50 px-3 sm:px-4 py-3 flex items-start gap-3"
        data-testid="live-parsers-architecture-banner"
      >
        <div className="w-9 h-9 rounded-lg bg-white border border-sky-200 flex items-center justify-center flex-shrink-0">
          <Lightning size={16} weight="duotone" className="text-sky-600" />
        </div>
        <div className="text-[12px] sm:text-[12.5px] leading-relaxed flex-1 min-w-0">
          <div className="font-semibold text-[#18181B] mb-0.5">
            {t('pc_live_first_title')}
          </div>
          <div className="text-[#52525B]">
            {t('pc_live_first_desc')}
          </div>
        </div>
      </div>

      {/* Header — stacks on mobile, becomes a row at sm+ */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-[15px] sm:text-[16px] font-semibold text-[#18181B] break-words">
            {t('pc_panel_title')}
          </h2>
          <p className="text-[12px] text-[#71717A] mt-0.5 break-words">
            {t('pc_panel_subtitle')}
            {lastFetchLabel && (
              <span className="ml-1">· {t('pc_updated')} {lastFetchLabel}</span>
            )}
          </p>
        </div>
        <div className="grid grid-cols-3 sm:flex sm:flex-wrap items-stretch sm:items-center gap-2">
          {canManage && (
            <div
              className="col-span-3 sm:col-auto flex items-stretch sm:items-center gap-2 bg-[#FAFAFA] border border-[#E4E4E7] rounded-xl px-2 py-1.5"
              data-testid="live-parsers-vehicle-limit"
              title={t('pc_vehicle_limit_hint') || 'Max vehicles per Run / Run Once (≈30 cars per page)'}
            >
              <span className="text-[11px] uppercase tracking-wide text-[#71717A] self-center whitespace-nowrap px-1">
                {t('pc_vehicle_limit_label') || 'Cap'}
              </span>
              <input
                type="number"
                min={0}
                step={500}
                value={vehicleLimit}
                onChange={(e) => setVehicleLimit(Math.max(0, Number(e.target.value) || 0))}
                className="w-20 h-7 px-2 text-[12.5px] text-[#18181B] bg-white border border-[#E4E4E7] focus:border-[#18181B] focus:outline-none rounded-md"
                data-testid="live-parsers-vehicle-limit-input"
              />
              <div className="flex gap-1">
                {[1000, 3000, 5000].map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setVehicleLimit(v)}
                    className={`h-7 px-2 text-[11px] rounded-md border transition-colors ${
                      vehicleLimit === v
                        ? 'bg-[#18181B] text-white border-[#18181B]'
                        : 'bg-white text-[#18181B] border-[#E4E4E7] hover:border-[#18181B]'
                    }`}
                    data-testid={`live-parsers-vehicle-limit-preset-${v}`}
                  >
                    {v >= 1000 ? `${v / 1000}k` : v}
                  </button>
                ))}
              </div>
            </div>
          )}
          <button
            type="button"
            onClick={() => fetchParsers(false)}
            disabled={refreshing}
            className="inline-flex items-center justify-center gap-1.5 h-9 px-3 rounded-xl bg-white border border-[#E4E4E7] hover:border-[#18181B] text-[12.5px] font-medium text-[#18181B] disabled:opacity-50 transition-colors min-w-0"
            data-testid="live-parsers-refresh-btn"
          >
            <ArrowClockwise size={14} weight="bold" className={`shrink-0 ${refreshing ? 'animate-spin' : ''}`} />
            <span className="truncate">{t('pc_refresh')}</span>
          </button>
          {canManage && (
            <>
              <button
                type="button"
                onClick={runAll}
                className="inline-flex items-center justify-center gap-1.5 h-9 px-3 rounded-xl bg-[#18181B] hover:bg-[#27272A] text-[12.5px] font-semibold text-white transition-colors min-w-0"
                data-testid="live-parsers-run-all-btn"
              >
                <Lightning size={14} weight="fill" className="shrink-0" />
                <span className="truncate">{t('pc_run_all')}</span>
              </button>
              <button
                type="button"
                onClick={stopAll}
                className="inline-flex items-center justify-center gap-1.5 h-9 px-3 rounded-xl bg-white border border-red-200 hover:bg-red-50 text-[12.5px] font-medium text-red-700 transition-colors min-w-0"
                data-testid="live-parsers-stop-all-btn"
              >
                <Stop size={14} weight="fill" className="shrink-0" />
                <span className="truncate">{t('pc_stop_all')}</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Loading / Error / Empty / Grid */}
      {loading && (
        <div
          className="flex items-center gap-3 text-[#71717A] py-12 justify-center"
          data-testid="live-parsers-loading"
        >
          <CircleNotch size={20} className="animate-spin" />
          {t('pc_loading')}
        </div>
      )}

      {!loading && error && (
        <div
          className="rounded-2xl border border-red-200 bg-red-50 p-4 text-red-700 text-[13px]"
          data-testid="live-parsers-error"
        >
          <div className="flex items-start gap-2">
            <Warning size={18} weight="duotone" className="mt-0.5 shrink-0" />
            <div className="min-w-0">
              <div className="font-semibold mb-1">{t('pc_error_title')}</div>
              <div className="text-red-600 break-words">{error}</div>
            </div>
          </div>
        </div>
      )}

      {!loading && !error && parsers.length === 0 && (
        <div className="rounded-2xl border border-[#E4E4E7] bg-white p-12 text-center text-[#71717A] text-[13px]">
          {t('pc_empty')}
        </div>
      )}

      {!loading && parsers.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {parsers.map((p) => (
            <LiveParserCard
              key={p.source}
              parser={p}
              busy={busy[p.source]}
              canManage={canManage}
              onAction={callAction}
              t={t}
              lang={lang}
            />
          ))}
        </div>
      )}

      {/* Help footer */}
      <div className="text-[11.5px] text-[#71717A] leading-relaxed bg-[#FAFAFA] border border-[#E4E4E7] rounded-2xl p-3 sm:p-4">
        <div className="font-semibold text-[#18181B] mb-1">{t('pc_help_title')}</div>
        <ul className="list-disc pl-5 space-y-1 break-words">
          <li>{t('pc_help_run_once')}</li>
          <li>{t('pc_help_run')}</li>
          <li>{t('pc_help_stop')}</li>
          <li>{t('pc_help_extension')}</li>
        </ul>
      </div>
    </section>
  );
};






// ── ParserControl page ───────────────────────────────────
const ParserControl = () => {
  const { t } = useLang();
  const { user } = useAuth();
  // Only master_admin / owner / admin can mutate infrastructure (backend gate
  // is `require_master_admin` which already accepts {"admin","owner","master_admin"}).
  // Everybody else (team_lead / manager / moderator) gets the full dashboard
  // read-only.
  const role = (user?.role || '').toLowerCase();
  const isMasterAdmin = role === 'master_admin' || role === 'owner' || role === 'admin';

  // Tab state — supports deep-link via ?tab=extension (back-compat for the
  // legacy /admin/parser/chrome-extension URL which now redirects here).
  const initialTab = (() => {
    if (typeof window === 'undefined') return 'overview';
    const p = new URLSearchParams(window.location.search);
    const t = p.get('tab');
    if (t === 'extension') return 'extension';
    if (t === 'ingestion' || t === 'parsers') return 'ingestion';
    if (t === 'promotion') return 'promotion';
    return 'overview';
  })();
  const [activeTab, setActiveTab] = useState(initialTab);
  const handleTabChange = (val) => {
    setActiveTab(val);
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      if (val === 'overview') url.searchParams.delete('tab');
      else url.searchParams.set('tab', val);
      window.history.replaceState({}, '', url.toString());
    }
  };

  const [overview, setOverview] = useState(null);
  const [loadErr, setLoadErr] = useState(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState(null);
  const [now, setNow] = useState(Date.now());
  const nowTick = useRef(null);

  const fetchOverview = useCallback(async () => {
    try {
      const r = await axios.get(`${API_URL}/api/control/overview`);
      setOverview(r.data);
      setLastUpdate(Date.now());
      setLoadErr(null);
    } catch (e) {
      setLoadErr(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchOverview();
    const t = setInterval(fetchOverview, POLL_INTERVAL);
    return () => clearInterval(t);
  }, [fetchOverview]);

  // 1s ticker for the "Updated Xs ago" freshness indicator
  useEffect(() => {
    nowTick.current = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(nowTick.current);
  }, []);

  const total = overview?.sources?.length || 0;
  const healthy = useMemo(
    () => (overview?.sources || []).filter((r) => r.status === 'ok').length,
    [overview?.sources],
  );

  const freshSeconds = lastUpdate
    ? Math.max(0, Math.floor((now - lastUpdate) / 1000))
    : null;
  const freshStale = freshSeconds !== null && freshSeconds > POLL_INTERVAL / 1000 + 3;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <CircleNotch size={32} className="animate-spin text-[#18181B]" />
      </div>
    );
  }

  return (
    <motion.div
      data-testid="parser-control-page"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="space-y-4 sm:space-y-6"
    >
      {/* Header with freshness indicator — full-width-safe on mobile */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0 flex-1">
          <div className="w-10 h-10 rounded-2xl bg-[#18181B] text-white flex items-center justify-center shrink-0">
            <Browser size={20} weight="bold" />
          </div>
          <div className="min-w-0 flex-1">
            <h1
              className="text-2xl font-bold tracking-tight text-[#18181B] leading-tight break-words"
              style={{ fontFamily: 'Mazzard, Mazzard H, Mazzard M, system-ui, sans-serif' }}
            >
              {t('adm_vin_parser_control_center')}
            </h1>
            <p className="text-[12px] text-[#71717A] mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
              <span>
                {healthy}/{total} sources healthy
              </span>
              <CaretRight size={10} className="text-[#D4D4D8]" />
              <span>polled every {POLL_INTERVAL / 1000}s</span>
              {freshSeconds !== null && (
                <>
                  <CaretRight size={10} className="text-[#D4D4D8]" />
                  <span
                    className={`inline-flex items-center gap-1 ${
                      freshStale ? 'text-amber-600 font-medium' : 'text-[#71717A]'
                    }`}
                    data-testid="freshness"
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
        </div>
        <button
          onClick={fetchOverview}
          className="inline-flex items-center justify-center h-9 w-9 shrink-0 rounded-xl bg-[#18181B] text-white hover:bg-[#27272A] active:bg-black transition-colors focus:outline-none focus-visible:ring-4 focus-visible:ring-black/15"
          data-testid="pc-refresh"
          title={t('adm_refresh')}
          aria-label={t('adm_refresh')}
        >
          <ArrowClockwise size={16} weight="bold" />
        </button>
      </div>

      {loadErr && (
        <div className="mb-4 px-3 py-2.5 rounded-xl bg-[#FEF2F2] border border-[#FCA5A5] text-xs text-[#7F1D1D]">
          load error: {loadErr}
        </div>
      )}

      <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full space-y-6">
        {/* Tabs — inherit the platform's canonical black-outline language
            from `<TabsList>/<TabsTrigger>` (see /components/ui/tabs.jsx). */}
        <TabsList>
          <TabsTrigger value="overview" data-testid="tab-overview">
            {t('adm_overview_2')}
          </TabsTrigger>
          <TabsTrigger value="ingestion" data-testid="tab-ingestion">
            {t('pc_tab_ingestion')}
          </TabsTrigger>
          <TabsTrigger value="promotion" data-testid="tab-promotion">
            Promotion
          </TabsTrigger>
          <TabsTrigger value="extension" data-testid="tab-extension">
            {t('adm_chrome_extension')}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6 mt-0">
          {/* Read-only banner for non-master viewers — toned-down neutral
              card to match the rest of the admin (no more full-black hero). */}
          {!isMasterAdmin && (
            <div
              className="bg-white border border-[#E4E4E7] rounded-2xl px-4 py-3 flex items-center gap-3"
              data-testid="readonly-banner"
            >
              <div className="w-9 h-9 rounded-lg bg-[#FAFAFA] border border-[#E4E4E7] flex items-center justify-center flex-shrink-0">
                <ShieldCheck size={16} weight="duotone" className="text-[#3F3F46]" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[13.5px] font-semibold tracking-tight text-[#18181B]">
                  {t('adm_readonly_infrastructure_is_managed_by_master_admin')}
                </p>
                <p className="text-[11.5px] text-[#71717A] mt-0.5 leading-snug">
                  You can see system health and alerts. Parser run/stop, scheduler
                  control, extension provisioning and live probes are reserved to
                  the master_admin role (ops guard).
                </p>
              </div>
              <span className="hidden sm:inline-block text-[10px] uppercase tracking-wider bg-[#FAFAFA] px-2 py-0.5 rounded border border-[#E4E4E7] text-[#71717A] font-semibold">
                role: {role || 'unknown'}
              </span>
            </div>
          )}

          <SystemStatusBar
            system={overview?.system}
            alerts={overview?.alerts}
          />
          <ExtensionStatusCard
            extension={overview?.extension}
            canManage={isMasterAdmin}
            onOpenExtensionTab={() => handleTabChange('extension')}
          />
          <SourcesGrid sources={overview?.sources} />
          <PerformancePanel performance={overview?.performance} />
          <AlertsPanel alerts={overview?.alerts} />
          <OpsGuardianPanel canTest={isMasterAdmin} />
          <DebugPanel canProbe={isMasterAdmin} />

          {/* Quick links — master_admin only (ops surface) ───────────── */}
          {isMasterAdmin && (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mt-4">
              {[
                { href: '/admin/parser/proxies', icon: Pulse, label: t('adm_proxy_manager') },
                { href: '/admin/parser/logs', icon: ArrowClockwise, label: t('adm_parser_logs') },
                { href: '/admin/parser/settings', icon: Database, label: t('adm_parser_settings') },
              ].map(({ href, icon: Icon, label }) => (
                <a
                  key={href}
                  href={href}
                  className="flex items-center gap-3 p-3.5 bg-white rounded-xl border border-[#E4E4E7] hover:border-[#18181B] transition-colors group"
                >
                  <Icon
                    size={18}
                    weight="duotone"
                    className="text-[#71717A] group-hover:text-[#18181B] transition-colors"
                  />
                  <span className="text-xs font-medium text-[#52525B] group-hover:text-[#18181B] transition-colors">
                    {label}
                  </span>
                  <ArrowSquareOut
                    size={12}
                    className="text-[#D4D4D8] ml-auto"
                  />
                </a>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="ingestion" className="mt-0">
          <LiveParsersPanel canManage={isMasterAdmin} />
        </TabsContent>

        <TabsContent value="promotion" className="mt-0">
          <PromotionStatsPanel canManage={isMasterAdmin} />
        </TabsContent>

        <TabsContent value="extension" className="mt-0">
          <ExtensionSetupTab />
        </TabsContent>
      </Tabs>
    </motion.div>
  );
};

export default ParserControl;
