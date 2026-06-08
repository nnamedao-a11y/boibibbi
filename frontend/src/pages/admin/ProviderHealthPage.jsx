/**
 * Admin Provider Pressure / Health Dashboard
 *
 *   /admin/provider-health
 *
 * Shows every manager's Provider Pressure score (0-100), tier, and
 * component sub-scores. Drives matching / visibility / boosts.
 *
 * Backend:
 *   GET  /api/admin/providers/stats
 *   POST /api/admin/providers/stats/recompute
 *
 * Layout strategy:
 *   - Desktop (md+): full data table
 *   - Mobile (<md): vertical cards, one per provider, every metric stacked
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { useLang } from '../../i18n';
import ControlSubNav from '../../components/admin/ControlSubNav';
import ControlPageHeader from '../../components/admin/ControlPageHeader';
import RefreshButton from '../../components/ui/RefreshButton';
import {
  Gauge,
  ArrowClockwise,
  Warning,
} from '@phosphor-icons/react';

const API_URL = process.env.REACT_APP_BACKEND_URL || 'http://localhost:8001';

const TIER_META = {
  high:      { label: 'High',      emoji: '🟢', color: 'bg-emerald-100 text-emerald-700 ring-emerald-200', bar: 'bg-emerald-500', multiplier: '×1.2' },
  normal:    { label: 'Normal',    emoji: '🟡', color: 'bg-amber-100 text-amber-700 ring-amber-200',       bar: 'bg-amber-500',   multiplier: '×1.0' },
  warning:   { label: 'Warning',   emoji: '🟠', color: 'bg-orange-100 text-orange-700 ring-orange-200',    bar: 'bg-orange-500',  multiplier: '×0.8' },
  penalized: { label: 'Penalized', emoji: '🔴', color: 'bg-red-100 text-red-700 ring-red-200',             bar: 'bg-red-500',     multiplier: '×0.5' },
  hidden:    { label: 'Hidden',    emoji: '🚫', color: 'bg-zinc-200 text-zinc-700 ring-zinc-300',           bar: 'bg-zinc-500',    multiplier: 'excl.' },
};

const pct = (v) => (v === null || v === undefined ? '—' : `${(v * 100).toFixed(0)}%`);

const TierBadge = ({ tier }) => {
  const meta = TIER_META[tier] || TIER_META.normal;
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold ring-1 ${meta.color}`}
      data-testid={`tier-badge-${tier}`}
    >
      <span>{meta.emoji}</span>
      {meta.label}
      <span className="text-[9px] opacity-70 ml-0.5">{meta.multiplier}</span>
    </span>
  );
};

const ScoreBar = ({ score, tier }) => {
  const meta = TIER_META[tier] || TIER_META.normal;
  return (
    <div className="w-full">
      <div className="flex items-center justify-between text-[11px] font-medium text-zinc-500 mb-1">
        <span>0</span>
        <span className="text-zinc-900 text-sm font-bold">{score}</span>
        <span>100</span>
      </div>
      <div className="h-1.5 bg-zinc-100 rounded-full overflow-hidden">
        <div
          className={`h-full ${meta.bar} transition-all duration-500`}
          style={{ width: `${Math.max(2, score)}%` }}
        />
      </div>
    </div>
  );
};

/* ---------- Mobile-only card view (one per provider) ---------- */
const ProviderCard = ({ it, t }) => {
  return (
    <div
      className="bg-white border border-zinc-200 rounded-2xl p-5 shadow-sm space-y-4"
      data-testid={`provider-card-${it.providerId}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-semibold text-base text-zinc-900 truncate">
            {it.providerName || it.providerId}
          </div>
          <div className="text-xs text-zinc-400 truncate mt-0.5">
            {it.providerEmail || it.providerId}
          </div>
        </div>
        <TierBadge tier={it.tier} />
      </div>

      <ScoreBar score={it.score || 0} tier={it.tier} />

      <div className="grid grid-cols-3 gap-2.5 pt-1">
        <div className="bg-zinc-50 rounded-xl p-3">
          <div className="text-[10px] uppercase tracking-wide text-zinc-400 font-semibold">
            {t('responseLabel')}
          </div>
          <div className="text-base font-semibold text-zinc-800 mt-1">
            {pct(it.sub_scores?.responseScore)}
          </div>
          <div className="text-[10px] text-zinc-400 mt-0.5">
            {it.metrics?.responseTimeAvg
              ? `${it.metrics.responseTimeAvg} ${t('r9_min_short')}`
              : '—'}
          </div>
        </div>
        <div className="bg-zinc-50 rounded-xl p-3">
          <div className="text-[10px] uppercase tracking-wide text-zinc-400 font-semibold">
            {t('completionLabel')}
          </div>
          <div className="text-base font-semibold text-zinc-800 mt-1">
            {pct(it.sub_scores?.completionScore)}
          </div>
          <div className="text-[10px] text-zinc-400 mt-0.5">
            {it.metrics?.completedOrders ?? 0}/{it.metrics?.totalOrders ?? 0}
          </div>
        </div>
        <div className="bg-zinc-50 rounded-xl p-3">
          <div className="text-[10px] uppercase tracking-wide text-zinc-400 font-semibold">
            {t('activityLabel')}
          </div>
          <div className="text-base font-semibold text-zinc-800 mt-1">
            {pct(it.sub_scores?.activityScore)}
          </div>
          <div className="text-[10px] text-zinc-400 mt-0.5">
            {it.metrics?.activeOrders ?? 0}/{it.metrics?.totalOrders ?? 0}
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between text-xs text-zinc-500 pt-3 border-t border-zinc-100">
        <span>
          {t('lateStarts')}:{' '}
          {(it.penalties?.lateStarts ?? 0) > 0 ? (
            <span className="inline-flex items-center gap-1 text-red-600 font-medium">
              <Warning size={12} weight="bold" />
              {it.penalties.lateStarts}
            </span>
          ) : (
            <span className="text-zinc-400">0</span>
          )}
        </span>
        <span className="text-zinc-400">
          {it.updatedAt ? new Date(it.updatedAt).toLocaleDateString() : '—'}
        </span>
      </div>
    </div>
  );
};

export default function ProviderHealthPage() {
  const { t } = useLang();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [recomputing, setRecomputing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const r = await axios.get(`${API_URL}/api/admin/providers/stats`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setItems(r.data.items || []);
    } catch (e) {
      console.error(e);
      toast.error(t('adm_failed_to_load_health_dashboard'));
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const recomputeAll = useCallback(async () => {
    setRecomputing(true);
    try {
      const token = localStorage.getItem('token');
      const r = await axios.post(
        `${API_URL}/api/admin/providers/stats/recompute`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      toast.success(
        `${t('r9_recalculated')} ${r.data?.count ?? 0} ${t('r9_providers_plural')}`
      );
      await load();
    } catch (e) {
      console.error(e);
      toast.error(t('adm_recalculation_failed'));
    } finally {
      setRecomputing(false);
    }
  }, [load, t]);

  useEffect(() => {
    load();
  }, [load]);

  const tierCounts = useMemo(() => {
    const acc = { high: 0, normal: 0, warning: 0, penalized: 0, hidden: 0 };
    for (const it of items) {
      if (acc[it.tier] !== undefined) acc[it.tier] += 1;
    }
    return acc;
  }, [items]);

  return (
    <div data-testid="provider-health-page">
      <ControlSubNav />

      <div className="space-y-5 sm:space-y-6">
        <ControlPageHeader
          icon={Gauge}
          title={t('adm_provider_pressure_healthscore')}
          subtitle={t('adm_performer_rating_controls_matching_visibility_boos')}
          action={
            <RefreshButton
              onClick={recomputeAll}
              loading={recomputing || loading}
              ariaLabel={t('adm2_98a263e7c7')}
              testId="provider-recompute-btn"
            />
          }
        />

        {/* Tier distribution — 5 chips, 2-col mobile / 3-col tablet / 5-col desktop, generous padding */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-3">
          {Object.entries(TIER_META).map(([key, meta]) => (
            <div
              key={key}
              className={`rounded-xl p-4 sm:p-4 ring-1 ${meta.color} min-w-0`}
            >
              <div className="flex items-center justify-between gap-2 mb-2.5">
                <span className="text-[11px] sm:text-xs font-semibold uppercase tracking-wide truncate">
                  {meta.emoji} {meta.label}
                </span>
                <span className="text-[10px] sm:text-xs opacity-70 flex-shrink-0">
                  {meta.multiplier}
                </span>
              </div>
              <div className="text-2xl sm:text-2xl font-bold leading-none">
                {tierCounts[key] ?? 0}
              </div>
            </div>
          ))}
        </div>

        {/* Desktop table (md+) */}
        <div className="hidden md:block bg-white rounded-2xl border border-zinc-200 overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="min-w-[800px] w-full text-sm">
              <thead className="bg-zinc-50 border-b border-zinc-200">
                <tr className="text-left text-xs font-semibold uppercase tracking-wide text-zinc-500">
                  <th className="px-3 py-3 whitespace-nowrap">{t('adm_assignee')}</th>
                  <th className="px-3 py-3 w-40 whitespace-nowrap">{t('scoreLabel')}</th>
                  <th className="px-3 py-3 whitespace-nowrap">{t('tierLabel')}</th>
                  <th className="px-3 py-3 whitespace-nowrap">{t('responseLabel')}</th>
                  <th className="px-3 py-3 whitespace-nowrap">{t('completionLabel')}</th>
                  <th className="px-3 py-3 whitespace-nowrap">{t('activityLabel')}</th>
                  <th className="px-3 py-3 whitespace-nowrap">{t('adm_orders')}</th>
                  <th className="px-3 py-3 whitespace-nowrap">{t('lateStarts')}</th>
                  <th className="px-3 py-3 whitespace-nowrap">{t('adm_updated')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {loading && items.length === 0 && (
                  <tr>
                    <td colSpan={9} className="text-center py-10 text-zinc-400">
                      {t('adm_loading_3')}
                    </td>
                  </tr>
                )}
                {!loading && items.length === 0 && (
                  <tr>
                    <td colSpan={9} className="text-center py-10 text-zinc-400 px-4">
                      {t('adm_no_provider_create_an_invoice_and_mark_it_as_paid')}
                    </td>
                  </tr>
                )}
                {items.map((it) => (
                  <tr
                    key={it.providerId}
                    className="hover:bg-zinc-50"
                    data-testid={`provider-row-${it.providerId}`}
                  >
                    <td className="px-3 py-3 whitespace-nowrap">
                      <div className="font-medium text-zinc-900">
                        {it.providerName || it.providerId}
                      </div>
                      <div className="text-xs text-zinc-400">
                        {it.providerEmail || it.providerId}
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <ScoreBar score={it.score || 0} tier={it.tier} />
                    </td>
                    <td className="px-3 py-3">
                      <TierBadge tier={it.tier} />
                    </td>
                    <td className="px-3 py-3 text-zinc-700 whitespace-nowrap">
                      <div className="font-medium">
                        {pct(it.sub_scores?.responseScore)}
                      </div>
                      <div className="text-xs text-zinc-400">
                        {it.metrics?.responseTimeAvg
                          ? `${it.metrics.responseTimeAvg} ${t('r9_min_short')}`
                          : '—'}
                      </div>
                    </td>
                    <td className="px-3 py-3 text-zinc-700 whitespace-nowrap">
                      <div className="font-medium">
                        {pct(it.sub_scores?.completionScore)}
                      </div>
                      <div className="text-xs text-zinc-400">
                        {it.metrics?.completedOrders ?? 0}/
                        {it.metrics?.totalOrders ?? 0}
                      </div>
                    </td>
                    <td className="px-3 py-3 text-zinc-700 whitespace-nowrap">
                      {pct(it.sub_scores?.activityScore)}
                    </td>
                    <td className="px-3 py-3 text-zinc-700 whitespace-nowrap">
                      <span className="font-medium">
                        {it.metrics?.activeOrders ?? 0}
                      </span>
                      <span className="text-xs text-zinc-400">
                        {' '}/ {it.metrics?.totalOrders ?? 0}
                      </span>
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap">
                      {(it.penalties?.lateStarts ?? 0) > 0 ? (
                        <span className="inline-flex items-center gap-1 text-red-600 font-medium">
                          <Warning size={14} weight="bold" />
                          {it.penalties.lateStarts}
                        </span>
                      ) : (
                        <span className="text-zinc-400">0</span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-xs text-zinc-400 whitespace-nowrap">
                      {it.updatedAt
                        ? new Date(it.updatedAt).toLocaleString()
                        : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Mobile card list (<md) */}
        <div className="md:hidden space-y-4">
          {loading && items.length === 0 && (
            <div className="bg-white rounded-2xl border border-zinc-200 p-6 text-center text-sm text-zinc-400">
              {t('adm_loading_3')}
            </div>
          )}
          {!loading && items.length === 0 && (
            <div className="bg-white rounded-2xl border border-zinc-200 p-6 text-center text-sm text-zinc-400">
              {t('adm_no_provider_create_an_invoice_and_mark_it_as_paid')}
            </div>
          )}
          {items.map((it) => (
            <ProviderCard key={it.providerId} it={it} t={t} />
          ))}
        </div>

        {/* Legend */}
        <div className="bg-zinc-50 border border-zinc-200 rounded-xl p-4 sm:p-5 text-xs text-zinc-600 leading-relaxed">
          <div className="font-semibold text-zinc-700 mb-2">
            {t('adm_how_it_works')}
          </div>
          <ul className="list-disc pl-5 space-y-1.5">
            <li>
              <b>Score 80–100 (High)</b>{' '}
              {t('adm_boost_12_in_matching_priority_delivery_of_new_orde')}
            </li>
            <li>
              <b>60–79 (Normal)</b>{' '}
              {t('adm_normal_output_multiplier_10')}
            </li>
            <li>
              <b>40–59 (Warning)</b>{' '}
              {t('adm_multiplier_08_manager_receives_a_notification_you')}
            </li>
            <li>
              <b>20–39 (Penalized)</b>{' '}
              {t('adm_multiplier_05_penalty_close_to_disabling')}
            </li>
            <li>
              <b>&lt; 20 (Hidden)</b>{' '}
              {t('adm_excluded_from_matching_can_be_returned_by_recalcul')}
            </li>
          </ul>
          <div className="mt-2">
            {t('adm_tier_change_notifications_are_sent_to_the_manager')}
          </div>
        </div>
      </div>
    </div>
  );
}
