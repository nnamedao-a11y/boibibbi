/**
 * JourneyPanel — cabinet view of a shipment's journey.
 *
 * Renders:
 *   • stages timeline (done / active / pending) with per-stage label
 *   • current position + progress bar + ETA
 *   • LIVE / ESTIMATED source badge
 *   • recent events feed
 *
 * Data source: GET /api/shipments/{id}/journey.
 * Live updates: Socket.IO 'shipment:update' pushed into a merged view model.
 */

import React, { useEffect, useMemo, useState, useCallback } from 'react';
import axios from 'axios';
import {
  Truck,
  Anchor,
  Package,
  CheckCircle,
  CircleDashed,
  CircleNotch,
  MapPin,
  WifiHigh,
  WifiSlash,
  CalendarBlank,
} from '@phosphor-icons/react';
import ShipmentTrackingMap from './ShipmentTrackingMap';
import { useLang, getLocale } from '../../i18n';

const API_URL = process.env.REACT_APP_BACKEND_URL || 'http://localhost:8001';

const STAGE_ICON = {
  land: Truck,
  vessel: Anchor,
  port: Package,
};

const STAGE_STATUS_STYLE = {
  done:    { dot: 'bg-emerald-500',  text: 'text-emerald-700', line: 'bg-emerald-300' },
  active:  { dot: 'bg-blue-500 ring-4 ring-blue-200', text: 'text-blue-700', line: 'bg-zinc-200' },
  pending: { dot: 'bg-zinc-300',     text: 'text-zinc-500',    line: 'bg-zinc-200' },
  skipped: { dot: 'bg-zinc-200',     text: 'text-zinc-400',    line: 'bg-zinc-200' },
};

/**
 * Derive a live-data health flag from tracking source + freshness.
 *   live      — real-scraped/real, fresh (< 10 min)
 *   estimated — interpolated/simulated/real-but-stale
 *   no-data   — no source or source=error
 */
function liveHealth(src, updatedAtIso) {
  const age = updatedAtIso ? (Date.now() - new Date(updatedAtIso).getTime()) / 1000 : Infinity;
  if (!src) return 'no-data';
  if (typeof src === 'string' && src.startsWith('real') && age < 600) return 'live';
  if (src === 'interpolated' || (typeof src === 'string' && src.startsWith('real'))) return 'estimated';
  if (src === 'simulated') return 'estimated';
  return 'no-data';
}

function isRealSource(src) {
  return typeof src === 'string' && src.startsWith('real');
}

function sourceLabel(src, t) {
  const tr = typeof t === 'function' ? t : (k) => k;
  if (!src) return tr('adm3_dd2d85a1bf');
  if (isRealSource(src)) return tr('adm3_e987627403');
  if (src === 'interpolated') return tr('adm3_c92c766780');
  if (src === 'simulated') return tr('adm3_01bf527899');
  return src;
}

function fmtEta(iso) {
  if (!iso) return null;
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return null;
    return d.toLocaleString(getLocale(), { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
  } catch { return null; }
}

function fmtTime(iso) {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleString(getLocale());
  } catch { return ''; }
}

/**
 * Humanised "X хвилин тому" / "just now" / "X год тому" / fallback to absolute.
 * Ukrainian with proper plural forms.
 */
function fmtRelative(iso, t) {
  const tr = typeof t === 'function' ? t : (k) => k;
  if (!iso) return '';
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    const sec = Math.max(0, Math.round((Date.now() - d.getTime()) / 1000));
    if (sec < 15) return tr('adm3_12453cb1a8');
    if (sec < 60) return `${sec}${tr('r9_s_ago')}`;
    const min = Math.round(sec / 60);
    if (min < 60) return `${min} ${tr('r9_min_ago')}`;
    const h = Math.round(min / 60);
    if (h < 24) return `${h} ${tr('r9_h_ago')}`;
    const days = Math.round(h / 24);
    if (days < 7) return `${days} ${tr('r9_days_ago')}`;
    return fmtTime(iso);
  } catch { return ''; }
}

export default function JourneyPanel({ shipmentId, initialJourney = null, liveUpdate = null, showEvents = true }) {
  const { t } = useLang();
  const [journey, setJourney] = useState(initialJourney);
  const [loading, setLoading] = useState(!initialJourney);
  const [error, setError] = useState(null);

  const fetchJourney = useCallback(async () => {
    if (!shipmentId) return;
    try {
      setLoading(true);
      const { data } = await axios.get(`${API_URL}/api/shipments/${shipmentId}/journey`);
      if (data?.ok && data.shipment) {
        setJourney(data.shipment);
      }
      setError(null);
    } catch (e) {
      console.warn('[JourneyPanel] fetch failed:', e);
      setError(t('adm3_f0188b7e39'));
    } finally {
      setLoading(false);
    }
  }, [shipmentId]);

  useEffect(() => { fetchJourney(); }, [fetchJourney]);

  // Merge incoming socket 'shipment:update' into local journey
  useEffect(() => {
    if (!liveUpdate || !journey) return;
    if (liveUpdate.shipmentId !== journey.id) return;
    setJourney((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        currentPosition: {
          ...(prev.currentPosition || {}),
          ...(liveUpdate.currentPosition || liveUpdate.position || {}),
          source: liveUpdate.source || liveUpdate.type || prev.currentPosition?.source,
          updatedAt: liveUpdate.updatedAt || new Date().toISOString(),
        },
        progress: typeof liveUpdate.progress === 'number' ? liveUpdate.progress : prev.progress,
        liveEta: liveUpdate.eta || prev.liveEta,
        trackingSource: liveUpdate.source || liveUpdate.type || prev.trackingSource,
        currentStageId: liveUpdate.currentStageId || prev.currentStageId,
      };
    });
  }, [liveUpdate, journey]);

  // Refresh relative time tick every 30s so "X хв тому" stays fresh without
  // forcing the whole component tree to re-render.
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const h = setInterval(() => setTick((t) => t + 1), 30_000);
    return () => clearInterval(h);
  }, []);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const _tick = tick;  // keep lint happy; used implicitly in render

  const progressPct = useMemo(() => {
    const p = Number(journey?.progress || 0);
    return Math.min(100, Math.max(0, Math.round(p * 100)));
  }, [journey?.progress]);

  const src = journey?.currentPosition?.source || journey?.trackingSource;
  const etaText = fmtEta(journey?.liveEta || journey?.eta);
  const updatedAt = journey?.currentPosition?.updatedAt;
  const regionLabel = liveUpdate?.location || journey?.location || null;
  // Prefer backend-computed trackingHealth (accounts for > 3h staleness + no_data)
  // over client-side liveHealth guess.
  const health = journey?.trackingHealth || liveHealth(src, updatedAt);
  const curStage = (journey?.stages || []).find((s) => s.id === journey?.currentStageId);
  const curVessel = curStage?.vessel || journey?.currentVessel || journey?.vessel;
  const curContainer = curStage?.container || journey?.currentContainer || journey?.container;
  const curPos = journey?.currentPosition || {};
  const speedKn = curPos.speed || curPos.sog;
  const course = curPos.course || curPos.cog;
  // Vessel stages (for history block below)
  const vesselStages = (journey?.stages || []).filter((s) => s.type === 'vessel');
  const hasMultipleVessels = vesselStages.length >= 2;

  if (loading) {
    return (
      <div className="flex items-center gap-3 p-6 text-zinc-500" data-testid="journey-loading">
        <CircleNotch size={20} className="animate-spin" />
        <span>{t('cmp_loading_route')}</span>
      </div>
    );
  }
  if (error && !journey) {
    return (
      <div className="p-6 text-rose-600 bg-rose-50 rounded-xl border border-rose-200">
        {error}
      </div>
    );
  }
  if (!journey) return null;

  const stages = journey.stages || [];
  const currentStageId = journey.currentStageId;

  return (
    <div className="space-y-5" data-testid="journey-panel">
      {/* Live map with floating overlay */}
      {Array.isArray(journey.route) && journey.route.length >= 2 && (
        <div className="relative">
          <ShipmentTrackingMap
            shipment={{
              ...journey,
              originPort: journey.origin?.name,
              destinationPort: journey.destination?.name,
            }}
            liveUpdate={liveUpdate}
          />
          {/* Live tracking overlay — top-right corner, dark glassmorphism.
              Phase B3.1: switched from bg-white/95 to bg-[#1A1B19]/92 so
              the card sits inside the cabinet's dark theme instead of
              flashing as a white block on a black map. */}
          {(curVessel?.name || curPos?.lat != null) && (
            <div
              className="absolute top-3 right-3 max-w-[260px] bg-[#1A1B19]/92 backdrop-blur-md border border-[#34343A] shadow-[0_12px_28px_rgba(0,0,0,0.55)] rounded-xl p-3 text-xs z-[1000]"
              data-testid="live-overlay"
              style={{ pointerEvents: 'none' }}
            >
              <div className="flex items-center gap-2 mb-1.5">
                <span
                  className={`w-2 h-2 rounded-full ${
                    health === 'live' || health === 'ok' ? 'bg-emerald-400 animate-pulse'
                    : health === 'stale' ? 'bg-rose-400 animate-pulse'
                    : health === 'estimated' ? 'bg-amber-400'
                    : 'bg-zinc-500'
                  }`}
                />
                <span className={`font-semibold text-[11px] uppercase tracking-wide ${
                  health === 'live' || health === 'ok' ? 'text-emerald-300'
                  : health === 'stale' ? 'text-rose-300'
                  : health === 'estimated' ? 'text-amber-300'
                  : 'text-zinc-400'
                }`}>
                  {health === 'live' || health === 'ok' ? 'Live tracking'
                  : health === 'stale' ? t('adm3_60019e5599')
                  : health === 'estimated' ? 'Estimated'
                  : t('adm3_dee9a2d8d9')}
                </span>
              </div>
              {curVessel?.name && (
                <div className="flex items-center gap-1.5 text-zinc-50 font-semibold mb-1">
                  <Anchor size={14} weight="fill" className="text-sky-400" />
                  {curVessel.name}
                </div>
              )}
              <div className="space-y-0.5 text-zinc-300">
                {speedKn != null && Number.isFinite(Number(speedKn)) && (
                  <div>
                    <span className="text-zinc-500">{t('cmp_speed')}</span>{' '}
                    <span className="font-semibold text-zinc-100">{Number(speedKn).toFixed(1)} kn</span>{' '}
                    <span className="text-zinc-500">(~{Math.round(Number(speedKn) * 1.852)} {t('r9_km_h')})</span>
                  </div>
                )}
                {course != null && Number.isFinite(Number(course)) && (
                  <div>
                    <span className="text-zinc-500">{t('cmp_course')}</span>{' '}
                    <span className="font-semibold text-zinc-100">{Math.round(Number(course))}°</span>
                  </div>
                )}
                {regionLabel && (
                  <div className="flex items-center gap-1">
                    <MapPin size={11} className="text-zinc-500" />
                    <span className="truncate text-zinc-200">{regionLabel}</span>
                  </div>
                )}
                {updatedAt && (
                  <div className="text-[10px] text-zinc-500 mt-0.5" title={fmtTime(updatedAt)}>
                    ⏱ {t('r9_updated')} {fmtRelative(updatedAt, t)}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Current container + vessel compact card — CONTAINER-FIRST
          (client thinks in containers, not vessel names) */}
      {(curVessel?.name || curContainer?.number) && (
        <div className="rounded-xl border border-indigo-200 bg-gradient-to-br from-indigo-50 via-sky-50 to-white p-4" data-testid="current-vessel-card">
          <div className="text-xs font-semibold text-indigo-700 uppercase tracking-wider mb-2">{t('cmp_your_parcel_is_currently')}</div>
          <div className="flex flex-wrap items-center gap-4">
            {curContainer?.number && (
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-lg bg-indigo-100">
                  <Package size={18} weight="fill" className="text-indigo-700" />
                </div>
                <div>
                  <div className="font-bold text-zinc-900 leading-tight font-mono">{curContainer.number}</div>
                  {curContainer.sealNumber ? (
                    <div className="text-[11px] text-zinc-500 font-mono">seal {curContainer.sealNumber}</div>
                  ) : (
                    <div className="text-[11px] text-zinc-400">{t('cmp_container')}</div>
                  )}
                </div>
              </div>
            )}
            {curVessel?.name && (
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-lg bg-sky-100">
                  <Anchor size={18} weight="fill" className="text-sky-700" />
                </div>
                <div>
                  <div className="font-bold text-zinc-900 leading-tight">{curVessel.name}</div>
                  <div className="text-[11px] text-zinc-500 font-mono">
                    {curVessel.mmsi && <span>MMSI {curVessel.mmsi}</span>}
                    {curVessel.imo && <span className="ml-2">IMO {curVessel.imo}</span>}
                  </div>
                </div>
              </div>
            )}
            {journey?.emotionalText && (
              <div className="text-sm text-zinc-700 italic ml-auto">
                {journey.emotionalText}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Vessel history — vertical timeline with dates.
          Only rendered if there was at least one transshipment. */}
      {hasMultipleVessels && (
        <div className="rounded-xl border border-zinc-200 bg-white p-4" data-testid="vessel-history">
          <h4 className="font-semibold text-zinc-900 mb-4 flex items-center gap-2">
            <Anchor size={16} weight="duotone" className="text-sky-600" />
            {t('cmp_transportation_history')}
            <span className="text-xs font-normal text-zinc-500">({vesselStages.length} {vesselStages.length === 1 ? t('adm3_1efb870abb') : t('adm3_044aa53710')})</span>
          </h4>
          <div className="relative">
            {vesselStages.map((vs, i) => {
              const isCurrent = vs.id === journey.currentStageId;
              const done = vs.status === 'done';
              const isLast = i === vesselStages.length - 1;
              return (
                <div key={vs.id} className="flex gap-3 relative">
                  {/* dot + line */}
                  <div className="flex flex-col items-center">
                    <div
                      className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 shadow-sm ${
                        isCurrent
                          ? 'bg-blue-500 ring-4 ring-blue-100'
                          : done
                          ? 'bg-emerald-500'
                          : 'bg-zinc-300'
                      }`}
                    >
                      {done ? (
                        <CheckCircle size={16} weight="fill" className="text-white" />
                      ) : (
                        <Anchor size={14} weight={isCurrent ? 'fill' : 'regular'} className="text-white" />
                      )}
                    </div>
                    {!isLast && (
                      <div
                        className={`w-0.5 flex-1 my-1 ${done ? 'bg-emerald-300' : 'bg-zinc-200'}`}
                        style={{ minHeight: '3rem' }}
                      />
                    )}
                  </div>

                  {/* content */}
                  <div className="flex-1 pb-5 min-w-0">
                    <div className="flex items-start justify-between gap-2 flex-wrap">
                      <div className="min-w-0">
                        <div className={`font-semibold text-sm ${
                          isCurrent ? 'text-blue-800' : done ? 'text-emerald-800' : 'text-zinc-700'
                        }`}>
                          {vs.vessel?.name || `${t('r9_vessel')} ${i + 1}`}
                          {isCurrent && (
                            <span className="ml-2 text-[10px] uppercase tracking-wider bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full font-bold">
                              {t('cmp_now')}
                            </span>
                          )}
                          {done && !isCurrent && (
                            <span className="ml-2 text-[10px] uppercase tracking-wider text-emerald-600 font-semibold">
                              {t('cmp_completed')}
                            </span>
                          )}
                        </div>
                        {vs.label && vs.label !== vs.vessel?.name && (
                          <div className="text-xs text-zinc-500 mt-0.5">{vs.label}</div>
                        )}
                      </div>
                    </div>

                    {/* meta chips: container, MMSI, IMO */}
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {vs.container?.number && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-mono bg-indigo-50 text-indigo-800 border border-indigo-100 px-1.5 py-0.5 rounded">
                          <Package size={10} weight="fill" /> {vs.container.number}
                        </span>
                      )}
                      {vs.vessel?.mmsi && (
                        <span className="text-[11px] font-mono bg-zinc-50 text-zinc-600 border border-zinc-200 px-1.5 py-0.5 rounded">
                          MMSI {vs.vessel.mmsi}
                        </span>
                      )}
                      {vs.vessel?.imo && (
                        <span className="text-[11px] font-mono bg-zinc-50 text-zinc-600 border border-zinc-200 px-1.5 py-0.5 rounded">
                          IMO {vs.vessel.imo}
                        </span>
                      )}
                    </div>

                    {/* dates */}
                    {(vs.startedAt || vs.completedAt) && (
                      <div className="text-[11px] text-zinc-500 mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5">
                        {vs.startedAt && (
                          <span className="inline-flex items-center gap-1">
                            <CalendarBlank size={10} className="text-zinc-400" />
                            {t('cmp_start_2')} <span className="font-medium text-zinc-700">{fmtTime(vs.startedAt)}</span>
                          </span>
                        )}
                        {vs.completedAt && (
                          <span className="inline-flex items-center gap-1">
                            <CheckCircle size={10} className="text-emerald-500" weight="fill" />
                            {t('cmp_completed_2')} <span className="font-medium text-zinc-700">{fmtTime(vs.completedAt)}</span>
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Source + progress + ETA row */}
      <div className="rounded-xl border border-zinc-200 bg-white p-4" data-testid="journey-summary">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <div className="flex items-center gap-2">
            <span
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
                health === 'stale'
                  ? 'bg-rose-100 text-rose-700 border border-rose-200'
                  : isRealSource(src) && health !== 'stale'
                    ? 'bg-emerald-100 text-emerald-700'
                    : src === 'interpolated' || health === 'estimated'
                      ? 'bg-amber-100 text-amber-700'
                      : 'bg-zinc-100 text-zinc-600'
              }`}
              data-testid="journey-source-badge"
            >
              {health === 'stale' ? (
                <>🔴 <span>{t('adm3_dfadd96167')}</span></>
              ) : isRealSource(src) ? (
                <><WifiHigh size={12} weight="fill" /> {sourceLabel(src, t)}</>
              ) : (
                <><WifiSlash size={12} /> {sourceLabel(src, t)}</>
              )}
            </span>
            {updatedAt && (
              <span className="text-xs text-zinc-400" title={fmtTime(updatedAt)}>
                {t('r9_updated')} {fmtRelative(updatedAt, t)}
              </span>
            )}
            {regionLabel && (
              <span className="text-xs font-medium text-zinc-700 bg-zinc-100 px-2 py-0.5 rounded-full">
                {regionLabel}
              </span>
            )}
          </div>
          {etaText && (
            <div className="flex items-center gap-2 text-sm text-zinc-700">
              <CalendarBlank size={16} className="text-blue-500" />
              <span className="text-zinc-500">ETA</span>
              <span className="font-semibold">{etaText}</span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-3" data-testid="journey-progress">
          <div className="flex-1 h-2 bg-zinc-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-blue-500 to-indigo-500 transition-all duration-700"
              style={{ width: `${progressPct}%` }}
            />
          </div>
          <span className="text-sm font-semibold text-zinc-800 min-w-[3.5rem] text-right">{progressPct}%</span>
        </div>

        {(journey.origin?.name || journey.destination?.name) && (
          <div className="flex items-center justify-between text-xs text-zinc-500 mt-2">
            <span className="flex items-center gap-1"><MapPin size={12} /> {journey.origin?.name || 'Origin'}</span>
            <span className="flex items-center gap-1">{journey.destination?.name || 'Destination'} <MapPin size={12} /></span>
          </div>
        )}
      </div>

      {/* Stages timeline */}
      {stages.length > 0 && (
        <div className="rounded-xl border border-zinc-200 bg-white p-4" data-testid="journey-stages">
          <h4 className="font-semibold text-zinc-900 mb-4">{t('cmp_delivery_stages')}</h4>
          <div className="space-y-0">
            {stages.map((stage, idx) => {
              const Icon = STAGE_ICON[stage.type] || Package;
              const status = stage.status || 'pending';
              const style = STAGE_STATUS_STYLE[status] || STAGE_STATUS_STYLE.pending;
              const isCurrent = stage.id === currentStageId;
              const isLast = idx === stages.length - 1;
              return (
                <div key={stage.id || idx} className="flex gap-3">
                  <div className="flex flex-col items-center">
                    <div
                      className={`w-9 h-9 rounded-full flex items-center justify-center ${style.dot} ${isCurrent ? 'text-white' : 'text-white'}`}
                    >
                      {status === 'done'
                        ? <CheckCircle size={18} weight="fill" className="text-white" />
                        : <Icon size={16} weight={status === 'active' ? 'fill' : 'regular'} />}
                    </div>
                    {!isLast && <div className={`flex-1 w-0.5 my-1 ${style.line}`} style={{ minHeight: '2rem' }} />}
                  </div>
                  <div className="pb-5 flex-1">
                    <div className={`font-medium ${style.text}`}>
                      {stage.label || `${t('r9_stage')} ${idx + 1}`}
                      {isCurrent && <span className="ml-2 text-[10px] uppercase tracking-wider text-blue-600 font-semibold">{t('cmp_current')}</span>}
                    </div>
                    {(stage.from || stage.to) && (
                      <div className="text-xs text-zinc-500 mt-0.5">
                        {stage.from} <span className="mx-1">→</span> {stage.to}
                      </div>
                    )}
                    {stage.vessel && (stage.vessel.name || stage.vessel.mmsi || stage.vessel.imo) && (
                      <div className="text-[11px] text-zinc-500 mt-1 flex flex-wrap gap-2">
                        {stage.vessel.name && <span className="font-mono bg-sky-50 text-sky-800 border border-sky-100 px-1.5 py-0.5 rounded">⚓ {stage.vessel.name}</span>}
                        {stage.vessel.mmsi && <span className="font-mono bg-zinc-50 px-1.5 py-0.5 rounded">MMSI {stage.vessel.mmsi}</span>}
                        {stage.vessel.imo  && <span className="font-mono bg-zinc-50 px-1.5 py-0.5 rounded">IMO {stage.vessel.imo}</span>}
                      </div>
                    )}
                    {stage.container?.number && (
                      <div className="text-[11px] mt-1">
                        <span className="font-mono bg-indigo-50 text-indigo-800 border border-indigo-100 px-1.5 py-0.5 rounded">
                          📦 {stage.container.number}
                        </span>
                      </div>
                    )}
                    {(stage.startedAt || stage.completedAt) && (
                      <div className="text-[11px] text-zinc-400 mt-1">
                        {stage.startedAt && <span>{t('r9_start_colon')} {fmtTime(stage.startedAt)}</span>}
                        {stage.completedAt && <span className="ml-2">{t('r9_completed_colon')} {fmtTime(stage.completedAt)}</span>}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Events feed */}
      {showEvents && Array.isArray(journey.events) && journey.events.length > 0 && (
        <div className="rounded-xl border border-zinc-200 bg-white p-4" data-testid="journey-events">
          <h4 className="font-semibold text-zinc-900 mb-3">{t('cmp_event_history')}</h4>
          <div className="space-y-2">
            {[...journey.events].reverse().slice(0, 12).map((ev, i) => (
              <div key={i} className="flex items-start gap-3 text-sm">
                <CircleDashed size={14} className="mt-1 text-zinc-400 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-zinc-800 truncate">{ev.label || ev.type}</div>
                  <div className="text-[11px] text-zinc-400" title={fmtTime(ev.createdAt)}>
                    {fmtRelative(ev.createdAt, t)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
