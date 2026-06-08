/**
 * BIBI Cars — Wave 13 — Delivery 360
 *
 * Fleet-wide control plane for the "where is the car?" problem.
 *
 * Tabs:
 *   1. Overview — KPI grid + delivery health distribution + by-milestone funnel
 *   2. Shipments — sortable queue (worst delivery health first)
 *   3. Carriers  — carrier center perf table
 *   4. Risk      — only delay_risk + delayed + critical shipments
 *
 * Per-deal Delivery360 (vertical timeline + carrier card + documents) lives
 * inside Deal360 as a 3rd tab — see Deal360.js.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import {
  Truck, MapPin, Boat, Warning, ChartLine, ArrowsClockwise, ChartPieSlice,
  Lifebuoy, UsersThree, Heartbeat, ArrowSquareOut, Package,
} from '@phosphor-icons/react';

import { API_URL } from '../App';
import { DELIVERY_HEALTH_CFG } from '../components/delivery360/DeliveryHealthBadge';
import RefreshButton from '../components/ui/RefreshButton';
import { PageHeader, PageTabs } from '../components/ui/PageHeader';
import RoleZoneBadge from '../components/ui/RoleZoneBadge';
import { HelpTooltip } from '../components/ui/HelpTooltip';
import { Select } from '../components/ui/Select';
import WhiteSelect from '../components/ui/WhiteSelect';
import { useLang } from '../i18n';

const SEG_ORDER = ['on_track', 'delay_risk', 'delayed', 'critical', 'delivered', 'cancelled'];

const SegBadge = ({ segment, score, testId, label }) => {
  const cfg = DELIVERY_HEALTH_CFG[segment] || DELIVERY_HEALTH_CFG.on_track;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider ${cfg.cls}`}
      data-testid={testId || `del-seg-${segment}`}
    >
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: cfg.dot }} />
      {label || cfg.label.replace('Delivery · ', '')}
      {typeof score === 'number' ? <span className="tabular-nums opacity-70">{score}</span> : null}
    </span>
  );
};

const KpiTile = ({ icon: Icon, label, value, hint, tone = 'neutral', testId, onClick, tooltip }) => {
  const toneCls = {
    neutral: 'bg-white border-[#E4E4E7]',
    good:    'bg-emerald-50 border-emerald-200',
    warn:    'bg-amber-50 border-amber-200',
    bad:     'bg-red-50 border-red-200',
  }[tone] || 'bg-white border-[#E4E4E7]';
  const interactive = onClick ? 'cursor-pointer hover:shadow-md transition-shadow' : '';
  const tile = (
    <div className={`border rounded-2xl p-4 ${toneCls} ${interactive}`} data-testid={testId} onClick={onClick}>
      <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider font-bold text-[#71717A]">
        <Icon size={14} weight="bold" /> {label}
      </div>
      <div className="text-2xl font-bold text-[#18181B] mt-1 tabular-nums">{value}</div>
      {hint ? <div className="text-[11px] text-[#71717A] mt-0.5">{hint}</div> : null}
    </div>
  );
  return tooltip ? <HelpTooltip text={tooltip}>{tile}</HelpTooltip> : tile;
};

const MILESTONE_LABEL_FALLBACK = {
  auction_won:        'Auction won',
  payment_confirmed:  'Payment confirmed',
  picked_up:          'Picked up',
  port_arrived:       'Port arrived',
  loaded:             'Loaded',
  in_transit:         'In transit',
  customs:            'Customs',
  ready_for_delivery: 'Ready for delivery',
  delivered:          'Delivered',
};

const Delivery360 = () => {
  const navigate = useNavigate();
  const { t } = useLang();
  const [tab, setTab] = useState('overview');

  const MILESTONE_LABEL = useMemo(() => ({
    auction_won:        t('w13_milestone_auction_won'),
    payment_confirmed:  t('w13_milestone_payment'),
    picked_up:          t('w13_milestone_picked_up'),
    port_arrived:       t('w13_milestone_port_arrived'),
    loaded:             t('w13_milestone_loaded'),
    in_transit:         t('w13_milestone_in_transit'),
    customs:            t('w13_milestone_customs'),
    ready_for_delivery: t('w13_milestone_ready'),
    delivered:          t('w13_milestone_delivered'),
  }), [t]);

  const TABS = useMemo(() => ([
    { key: 'overview',  label: t('w13_tab_overview'),  icon: ChartLine,    tooltip: t('tip_w13_tab_overview') },
    { key: 'shipments', label: t('w13_tab_shipments'), icon: Truck,        tooltip: t('tip_w13_tab_shipments') },
    { key: 'carriers',  label: t('w13_tab_carriers'),  icon: UsersThree,   tooltip: t('tip_w13_tab_carriers') },
    { key: 'risk',      label: t('w13_tab_risk'),      icon: Lifebuoy,     tooltip: t('tip_w13_tab_risk') },
  ]), [t]);

  const [overview,  setOverview]  = useState(null);
  const [shipments, setShipments] = useState([]);
  const [carriers,  setCarriers]  = useState([]);
  const [risk,      setRisk]      = useState({ items: [], by_segment: {}, total: 0 });
  const [loading,   setLoading]   = useState({ overview: true, shipments: false, carriers: false, risk: false });
  const [filter,    setFilter]    = useState({ segment: '', milestone: '' });

  // ---- loaders ----------------------------------------------------------
  const loadOverview = useCallback(async () => {
    setLoading((l) => ({ ...l, overview: true }));
    try {
      const r = await axios.get(`${API_URL}/api/delivery/overview`);
      setOverview(r.data?.data || null);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to load Delivery overview');
    } finally { setLoading((l) => ({ ...l, overview: false })); }
  }, []);

  const loadShipments = useCallback(async () => {
    setLoading((l) => ({ ...l, shipments: true }));
    try {
      const q = new URLSearchParams();
      if (filter.segment)   q.set('segment', filter.segment);
      if (filter.milestone) q.set('milestone', filter.milestone);
      q.set('limit', '300');
      const r = await axios.get(`${API_URL}/api/delivery/shipments?${q}`);
      setShipments(r.data?.items || []);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to load shipments');
    } finally { setLoading((l) => ({ ...l, shipments: false })); }
  }, [filter]);

  const loadCarriers = useCallback(async () => {
    setLoading((l) => ({ ...l, carriers: true }));
    try {
      const r = await axios.get(`${API_URL}/api/delivery/carriers`);
      setCarriers(r.data?.items || []);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to load carriers');
    } finally { setLoading((l) => ({ ...l, carriers: false })); }
  }, []);

  const loadRisk = useCallback(async () => {
    setLoading((l) => ({ ...l, risk: true }));
    try {
      const r = await axios.get(`${API_URL}/api/delivery/risk`);
      setRisk({
        items: r.data?.items || [],
        by_segment: r.data?.by_segment || {},
        total: r.data?.total || 0,
      });
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to load risk queue');
    } finally { setLoading((l) => ({ ...l, risk: false })); }
  }, []);

  useEffect(() => { loadOverview(); }, [loadOverview]);
  useEffect(() => { if (tab === 'shipments') loadShipments(); }, [tab, loadShipments]);
  useEffect(() => { if (tab === 'carriers')  loadCarriers();  }, [tab, loadCarriers]);
  useEffect(() => { if (tab === 'risk')      loadRisk();      }, [tab, loadRisk]);

  const refreshAll = () => {
    loadOverview();
    if (tab === 'shipments') loadShipments();
    if (tab === 'carriers')  loadCarriers();
    if (tab === 'risk')      loadRisk();
  };

  const counts   = overview?.counts   || {};
  const bySeg    = overview?.by_segment || {};
  const byMile   = overview?.by_milestone || {};
  const milestonesList = useMemo(() => Object.entries(byMile).sort((a, b) => b[1] - a[1]), [byMile]);
  const delayed  = counts.delayed_or_worse || 0;
  const delayedTone = delayed > 0 ? 'bad' : 'good';

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      data-testid="delivery360-page"
      className="min-h-full space-y-4"
    >
      <PageHeader
        icon={Truck}
        title={t('w13_title')}
        subtitle={overview?.scope?.all
          ? t('w360_scope_all')
          : t('w360_scope_managers').replace('{n}', overview?.scope?.managers || 0)}
        actions={<RefreshButton onClick={refreshAll} testId="delivery360-refresh" />}
        testId="delivery360-header"
      />

      <RoleZoneBadge variant="wave360" />

      <PageTabs tabs={TABS} active={tab} onChange={setTab} testId="delivery360-tabs" />

      <div className="space-y-4">
        <div className="p-0 space-y-4">
          {/* ===== OVERVIEW ===== */}
          {tab === 'overview' ? (
            loading.overview && !overview ? (
              <div className="flex justify-center py-16">
                <div className="w-7 h-7 border-2 border-[#18181B] border-t-transparent rounded-full animate-spin" />
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <KpiTile icon={Truck}     label={t('w13_kpi_shipments')} value={counts.shipments_total || 0} hint={t('w13_kpi_in_scope')} tooltip={t('tip_w13_kpi_shipments')} testId="kpi-shipments" />
                  <KpiTile icon={Boat}      label={t('w13_kpi_in_transit')} value={counts.in_transit || 0} tooltip={t('tip_w13_kpi_in_transit')} testId="kpi-in-transit" />
                  <KpiTile icon={Package}   label={t('w13_kpi_delivered')}  value={counts.delivered  || 0} tone="good" tooltip={t('tip_w13_kpi_delivered')} testId="kpi-delivered" />
                  <KpiTile icon={Warning}   label={t('w13_kpi_delayed')}    value={delayed} tone={delayedTone} tooltip={t('tip_w13_kpi_delayed')} testId="kpi-delayed"
                    hint={t('w13_kpi_avg_variance').replace('{n}', overview?.avg_eta_variance_days ?? 0)}
                    onClick={() => setTab('risk')} />
                </div>

                <div className="bg-white border border-[#E4E4E7] rounded-2xl p-4" data-testid="delivery-health-breakdown">
                  <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider font-bold text-[#71717A] mb-3">
                    <Heartbeat size={14} weight="bold" /> {t('w13_health_dist')}
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
                    {SEG_ORDER.map((seg) => (
                      <div key={seg} className="border border-[#E4E4E7] rounded-xl p-3" data-testid={`del-seg-card-${seg}`}>
                        <SegBadge segment={seg} label={t(`delivery_seg_${seg}`)} />
                        <div className="text-[14px] font-semibold tabular-nums text-[#18181B] mt-1.5">{bySeg[seg] || 0}</div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="bg-white border border-[#E4E4E7] rounded-2xl p-4">
                  <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider font-bold text-[#71717A] mb-3">
                    <ChartPieSlice size={14} weight="bold" /> {t('w13_by_milestone')}
                  </div>
                  {milestonesList.length === 0 ? (
                    <div className="text-sm text-[#71717A]">{t('w13_no_ship_scope')}</div>
                  ) : (
                    <div className="space-y-2">
                      {milestonesList.map(([key, n]) => {
                        const pct = counts.shipments_total ? Math.round((n / counts.shipments_total) * 100) : 0;
                        return (
                          <div key={key} className="flex items-center gap-3">
                            <div className="w-44 text-[12px] text-[#52525B] uppercase tracking-wider">{MILESTONE_LABEL[key] || key}</div>
                            <div className="flex-1 h-2 bg-[#F4F4F5] rounded-full overflow-hidden">
                              <div className="h-full bg-[#18181B]" style={{ width: `${pct}%` }} />
                            </div>
                            <div className="w-14 text-right tabular-nums text-[12px] font-semibold text-[#18181B]">{n}</div>
                            <div className="w-10 text-right text-[11px] text-[#71717A]">{pct}%</div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </>
            )
          ) : null}

          {/* ===== SHIPMENTS QUEUE ===== */}
          {tab === 'shipments' ? (
            <>
              <div className="bg-[#FAFAFA] border border-[#E4E4E7] rounded-2xl p-3 flex items-center gap-2 flex-wrap text-[12px]">
                <span className="text-[#52525B] font-semibold">{t('w13_filter')}:</span>
                <WhiteSelect
                  value={filter.segment} onChange={(e) => setFilter((f) => ({ ...f, segment: e.target.value }))}
                  className="min-w-[160px]"
                  data-testid="shipments-filter-segment"
                >
                  <option value="">{t('all_segments')}</option>
                  {SEG_ORDER.map((s) => <option key={s} value={s}>{t(`delivery_seg_${s}`)}</option>)}
                </WhiteSelect>
                <WhiteSelect
                  value={filter.milestone} onChange={(e) => setFilter((f) => ({ ...f, milestone: e.target.value }))}
                  className="min-w-[180px]"
                  data-testid="shipments-filter-milestone"
                >
                  <option value="">{t('all_milestones')}</option>
                  {Object.keys(MILESTONE_LABEL).map((k) => <option key={k} value={k}>{MILESTONE_LABEL[k]}</option>)}
                </WhiteSelect>
              </div>
              <ShipmentsTable rows={shipments} loading={loading.shipments} t={t} onOpen={(r) => navigate(`/admin/deals/${r.deal_id}/360?tab=delivery`)} />
            </>
          ) : null}

          {/* ===== CARRIERS ===== */}
          {tab === 'carriers' ? (
            <div className="bg-white border border-[#E4E4E7] rounded-2xl overflow-x-auto" data-testid="carriers-table">
              <div className="grid grid-cols-12 gap-2 min-w-[720px] px-4 py-2 border-b border-[#E4E4E7] bg-[#FAFAFA] text-[10px] uppercase tracking-wider font-bold text-[#71717A]">
                <div className="col-span-4">{t('w13_carrier')}</div>
                <div className="col-span-1 text-right">{t('w13_loads')}</div>
                <div className="col-span-1 text-right">{t('w13_kpi_delivered')}</div>
                <div className="col-span-1 text-right">{t('w13_on_time')}</div>
                <div className="col-span-1 text-right">{t('w13_delayed_only')}</div>
                <div className="col-span-2 text-right">{t('w13_avg_variance')}</div>
                <div className="col-span-1 text-right">{t('w13_on_time_pct')}</div>
                <div className="col-span-1 text-right">{t('w13_rating')}</div>
              </div>
              {loading.carriers ? (
                <div className="py-10 flex justify-center"><div className="w-6 h-6 border-2 border-[#18181B] border-t-transparent rounded-full animate-spin" /></div>
              ) : carriers.length === 0 ? (
                <div className="py-12 text-center text-[#71717A] text-sm">{t('w13_no_carriers')}</div>
              ) : (
                <div className="divide-y divide-[#F4F4F5]">
                  {carriers.map((c) => {
                    const ratingTone = (c.rating || 0) >= 4 ? 'text-emerald-700' : (c.rating || 0) >= 3 ? 'text-amber-700' : 'text-red-700';
                    return (
                      <div key={c.carrier_id || c.carrier_name} className="grid grid-cols-12 gap-2 min-w-[720px] px-4 py-2.5 items-center text-[13px]" data-testid={`carrier-row-${c.carrier_id || 'unassigned'}`}>
                        <div className="col-span-4 font-medium text-[#18181B] truncate">{c.carrier_name}</div>
                        <div className="col-span-1 text-right tabular-nums">{c.loads}</div>
                        <div className="col-span-1 text-right tabular-nums text-emerald-700">{c.delivered}</div>
                        <div className="col-span-1 text-right tabular-nums text-emerald-700">{c.on_time}</div>
                        <div className={`col-span-1 text-right tabular-nums ${c.delayed ? 'text-red-700 font-semibold' : ''}`}>{c.delayed}</div>
                        <div className="col-span-2 text-right tabular-nums">{c.avg_eta_variance_days != null ? `${c.avg_eta_variance_days}d` : '—'}</div>
                        <div className="col-span-1 text-right tabular-nums">{c.on_time_rate != null ? `${c.on_time_rate}%` : '—'}</div>
                        <div className={`col-span-1 text-right tabular-nums font-bold ${ratingTone}`}>{c.rating != null ? `${c.rating}★` : '—'}</div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ) : null}

          {/* ===== RISK QUEUE ===== */}
          {tab === 'risk' ? (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <KpiTile icon={Warning}    label={t('w13_delay_risk')} value={risk.by_segment?.delay_risk || 0} tone={risk.by_segment?.delay_risk ? 'warn' : 'neutral'} testId="risk-kpi-delay" />
                <KpiTile icon={Heartbeat}  label={t('w13_delayed_only')} value={risk.by_segment?.delayed    || 0} tone={risk.by_segment?.delayed    ? 'bad'  : 'neutral'} testId="risk-kpi-delayed" />
                <KpiTile icon={Lifebuoy}   label={t('w13_critical')}   value={risk.by_segment?.critical   || 0} tone={risk.by_segment?.critical   ? 'bad'  : 'neutral'} testId="risk-kpi-critical" />
              </div>
              <ShipmentsTable rows={risk.items} loading={loading.risk} t={t} onOpen={(r) => navigate(`/admin/deals/${r.deal_id}/360?tab=delivery`)} />
            </>
          ) : null}
        </div>
      </div>
    </motion.div>
  );
};

const ShipmentsTable = ({ rows = [], loading = false, onOpen, t = (k) => k }) => (
  <div className="bg-white border border-[#E4E4E7] rounded-2xl overflow-x-auto" data-testid="shipments-table">
    <div className="grid grid-cols-12 gap-2 min-w-[720px] px-4 py-2 border-b border-[#E4E4E7] bg-[#FAFAFA] text-[10px] uppercase tracking-wider font-bold text-[#71717A]">
      <div className="col-span-3">{t('deal_dot_customer')}</div>
      <div className="col-span-2">{t('carrier')}</div>
      <div className="col-span-2">{t('milestone')}</div>
      <div className="col-span-1 text-right">{t('w13_col_done') || 'Done'}</div>
      <div className="col-span-1 text-right">ETA Δ</div>
      <div className="col-span-1 text-right">{t('w13_col_days_idle') || 'Days idle'}</div>
      <div className="col-span-2">{t('w13_col_health') || 'Health · Reason'}</div>
    </div>
    {loading ? (
      <div className="py-10 flex justify-center"><div className="w-6 h-6 border-2 border-[#18181B] border-t-transparent rounded-full animate-spin" /></div>
    ) : rows.length === 0 ? (
      <div className="py-12 text-center text-[#71717A] text-sm">{t('nothing_in_filter')}</div>
    ) : (
      <div className="divide-y divide-[#F4F4F5]">
        {rows.map((r) => {
          const variance = r.eta_variance_days;
          const varTone = (variance ?? 0) > 7 ? 'text-red-700' : (variance ?? 0) > 0 ? 'text-amber-700' : 'text-[#52525B]';
          return (
            <div key={r.shipment_id} className="grid grid-cols-12 gap-2 min-w-[720px] px-4 py-2.5 items-center text-[13px]" data-testid={`shipment-row-${r.shipment_id}`}>
              <div className="col-span-3 min-w-0">
                <button onClick={() => onOpen?.(r)} className="block w-full text-left truncate font-medium text-[#18181B] hover:underline">
                  {r.deal_title || r.deal_id?.slice(-12) || '—'} <ArrowSquareOut size={10} className="inline ml-0.5 text-[#A1A1AA]" />
                </button>
                <div className="text-[11px] text-[#71717A] truncate">{r.customer_name || (r.vin ? `VIN ${r.vin}` : '—')}</div>
              </div>
              <div className="col-span-2 text-[12px] text-[#52525B] truncate">{r.carrier_name || <span className="text-amber-700">No carrier</span>}</div>
              <div className="col-span-2 text-[12px] text-[#52525B] uppercase tracking-wider truncate">{r.current_milestone_label}</div>
              <div className="col-span-1 text-right tabular-nums text-[12px] text-[#52525B]">{r.milestones_done}/{r.milestones_total}</div>
              <div className={`col-span-1 text-right tabular-nums font-semibold ${varTone}`}>{variance != null ? `${variance > 0 ? '+' : ''}${variance}d` : '—'}</div>
              <div className="col-span-1 text-right tabular-nums text-[#52525B]">{r.days_since_milestone != null ? `${r.days_since_milestone}d` : '—'}</div>
              <div className="col-span-2 flex items-center gap-1.5 flex-wrap min-w-0">
                <SegBadge segment={r.delivery_health} score={r.delivery_score} label={t(`delivery_seg_${r.delivery_health}`)} />
                <span className="text-[11px] text-[#71717A] truncate">{(r.reasons && r.reasons[0]) || ''}</span>
              </div>
            </div>
          );
        })}
      </div>
    )}
  </div>
);

export default Delivery360;
