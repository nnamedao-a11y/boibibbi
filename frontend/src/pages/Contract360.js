/**
 * BIBI Cars — Wave 15 — Contract360
 *
 * Contract Lifecycle Management center. Fills the contractual vacuum
 * between Deal360 and Finance360.
 *
 * Tabs:
 *   • Overview    — headline KPIs + segment + status + at-risk preview
 *   • Contracts   — filterable list with health badge + drilldown
 *   • Templates   — 4 default templates with "Create from template"
 *   • Approvals   — pending approval queue (per step)
 *   • Risk        — at-risk contracts (unsigned / expired / missing annex / wrong version)
 *   • Timeline    — drilldown view for a single contract
 *
 * Every contract row drills into Deal360 (when deal_id exists) and into a
 * detail panel showing approvals + timeline + attachments.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import {
  FileText, ArrowsClockwise, Plus, CurrencyEur, Warning, ArrowSquareOut,
  CheckCircle, XCircle, Clock, PaperPlaneTilt, Archive, PencilSimple,
  ListBullets, Stack, ShieldCheck, Files, ChartLine, Lifebuoy,
} from '@phosphor-icons/react';

import { API_URL } from '../App';
import { useLang } from '../i18n';
import { HelpTooltip } from '../components/ui/HelpTooltip';
import { Select } from '../components/ui/Select';
import WhiteSelect from '../components/ui/WhiteSelect';
import RefreshButton from '../components/ui/RefreshButton';
import { PageHeader, PageTabs, HeaderActionButton } from '../components/ui/PageHeader';
import RoleZoneBadge from '../components/ui/RoleZoneBadge';

const fmt = (n, ccy = 'EUR') => {
  const num = Number(n || 0);
  try { return new Intl.NumberFormat('en-US', { style: 'currency', currency: ccy, maximumFractionDigits: 0 }).format(num); }
  catch { return `${ccy} ${num.toFixed(0)}`; }
};

const fmtDate = (iso) => {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }); }
  catch { return iso; }
};

const SEG_TONE = {
  healthy:          { bg: 'bg-emerald-50',  border: 'border-emerald-200', text: 'text-emerald-700' },
  draft:            { bg: 'bg-slate-50',    border: 'border-slate-200',   text: 'text-slate-700' },
  pending_approval: { bg: 'bg-blue-50',     border: 'border-blue-200',    text: 'text-blue-700' },
  missing_annex:    { bg: 'bg-amber-50',    border: 'border-amber-200',   text: 'text-amber-700' },
  wrong_version:    { bg: 'bg-amber-50',    border: 'border-amber-200',   text: 'text-amber-700' },
  unsigned:         { bg: 'bg-orange-50',   border: 'border-orange-200',  text: 'text-orange-700' },
  critical:         { bg: 'bg-red-50',      border: 'border-red-200',     text: 'text-red-700' },
  archived:         { bg: 'bg-zinc-100',    border: 'border-zinc-200',    text: 'text-zinc-600' },
};

const STATUS_TONE = {
  draft:            'bg-slate-100 text-slate-700',
  pending_approval: 'bg-blue-100 text-blue-700',
  approved:         'bg-cyan-100 text-cyan-700',
  sent:             'bg-indigo-100 text-indigo-700',
  opened:           'bg-purple-100 text-purple-700',
  signed:           'bg-emerald-100 text-emerald-700',
  active:           'bg-emerald-100 text-emerald-700',
  amended:          'bg-amber-100 text-amber-700',
  expired:          'bg-red-100 text-red-700',
  archived:         'bg-zinc-100 text-zinc-600',
  rejected:         'bg-red-100 text-red-700',
};

const SegBadge = ({ value }) => {
  const t = SEG_TONE[value] || SEG_TONE.draft;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${t.bg} ${t.border} ${t.text}`}>
      {(value || '—').replace(/_/g, ' ')}
    </span>
  );
};
const StatusBadge = ({ value }) => (
  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider ${STATUS_TONE[value] || 'bg-slate-100 text-slate-700'}`}>
    {(value || 'draft').replace(/_/g, ' ')}
  </span>
);

const KpiTile = ({ icon: Icon, label, value, hint, tone = 'neutral', testId, onClick, tooltip }) => {
  const toneCls = {
    neutral:  'bg-white border-[#E4E4E7]',
    good:     'bg-emerald-50 border-emerald-200',
    warn:     'bg-amber-50 border-amber-200',
    bad:      'bg-red-50 border-red-200',
    accent:   'bg-indigo-50 border-indigo-200',
  }[tone] || 'bg-white border-[#E4E4E7]';
  const interactive = onClick ? 'cursor-pointer hover:shadow-md transition-shadow' : '';
  const tile = (
    <div className={`border rounded-2xl p-4 ${toneCls} ${interactive}`} onClick={onClick} data-testid={testId}>
      <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider font-bold text-[#71717A]">
        <Icon size={14} weight="bold" /> {label}
      </div>
      <div className="text-2xl font-bold text-[#18181B] mt-1 tabular-nums">{value}</div>
      {hint ? <div className="text-[11px] text-[#71717A] mt-0.5">{hint}</div> : null}
    </div>
  );
  return tooltip ? <HelpTooltip text={tooltip}>{tile}</HelpTooltip> : tile;
};

const TABS_FACTORY = (t) => ([
  { key: 'overview',  label: t('w15_tab_dashboard'),  icon: ChartLine,    tooltip: t('tip_w15_tab_dashboard') },
  { key: 'contracts', label: t('w15_tab_contracts'),  icon: ListBullets,  tooltip: t('tip_w15_tab_contracts') },
  { key: 'templates', label: t('w15_tab_templates'),  icon: Stack,        tooltip: t('tip_w15_tab_templates') },
  { key: 'approvals', label: t('w15_tab_approvals'),  icon: ShieldCheck,  tooltip: t('tip_w15_tab_approvals') },
  { key: 'risk',      label: t('w15_tab_risk'),       icon: Lifebuoy,     tooltip: t('tip_w15_tab_risk') },
  { key: 'timeline',  label: 'Timeline',              icon: Files,        tooltip: '' },
]);

export default function Contract360() {
  const navigate = useNavigate();
  const { t } = useLang();
  const TABS = useMemo(() => TABS_FACTORY(t), [t]);
  const [searchParams, setSearchParams] = useSearchParams();
  const [tab, setTab] = useState(searchParams.get('tab') || 'overview');
  const [data, setData] = useState({});
  const [loading, setLoading] = useState({});
  const [selectedId, setSelectedId] = useState(searchParams.get('id') || null);
  const [createOpen, setCreateOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');

  const token = localStorage.getItem('token') || localStorage.getItem('access_token');
  const headers = useMemo(() => ({ Authorization: `Bearer ${token}` }), [token]);

  const setData_ = (k, v) => setData((prev) => ({ ...prev, [k]: v }));
  const setLoad_ = (k, v) => setLoading((prev) => ({ ...prev, [k]: v }));

  // ─── Loaders ─────────────────────────────────────────────────────────
  const loadOverview = useCallback(async () => {
    setLoad_('overview', true);
    try {
      const { data } = await axios.get(`${API_URL}/api/contracts/overview`, { headers });
      setData_('overview', data?.data || null);
    } catch (e) { toast.error('Failed to load overview'); }
    finally { setLoad_('overview', false); }
  }, [headers]);

  const loadList = useCallback(async () => {
    setLoad_('list', true);
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.set('status', statusFilter);
      if (typeFilter)   params.set('type', typeFilter);
      params.set('limit', '500');
      const { data } = await axios.get(`${API_URL}/api/contracts?${params.toString()}`, { headers });
      setData_('list', data?.items || []);
    } catch (e) { toast.error('Failed to load contracts'); }
    finally { setLoad_('list', false); }
  }, [headers, statusFilter, typeFilter]);

  const loadTemplates = useCallback(async () => {
    setLoad_('templates', true);
    try {
      const { data } = await axios.get(`${API_URL}/api/contracts/templates`, { headers });
      setData_('templates', data?.items || []);
    } catch (e) { toast.error('Failed to load templates'); }
    finally { setLoad_('templates', false); }
  }, [headers]);

  const loadRisk = useCallback(async () => {
    setLoad_('risk', true);
    try {
      const { data } = await axios.get(`${API_URL}/api/contracts/risk`, { headers });
      setData_('risk', data?.data || null);
    } catch (e) { toast.error('Failed to load risk'); }
    finally { setLoad_('risk', false); }
  }, [headers]);

  const loadDetail = useCallback(async (id) => {
    if (!id) return;
    setLoad_('detail', true);
    try {
      const { data } = await axios.get(`${API_URL}/api/contracts/${id}`, { headers });
      setData_('detail', data?.data || null);
    } catch (e) { toast.error('Failed to load contract'); }
    finally { setLoad_('detail', false); }
  }, [headers]);

  // ─── tab switching ───────────────────────────────────────────────────
  useEffect(() => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('tab', tab);
      if (selectedId) next.set('id', selectedId); else next.delete('id');
      return next;
    });
    if (tab === 'overview')  loadOverview();
    if (tab === 'contracts') loadList();
    if (tab === 'templates') loadTemplates();
    if (tab === 'approvals') loadList();
    if (tab === 'risk')      loadRisk();
    if (tab === 'timeline' && selectedId) loadDetail(selectedId);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, statusFilter, typeFilter]);

  useEffect(() => { if (selectedId) loadDetail(selectedId); }, [selectedId, loadDetail]);

  const refresh = () => {
    if (tab === 'overview')  loadOverview();
    if (tab === 'contracts') loadList();
    if (tab === 'templates') loadTemplates();
    if (tab === 'approvals') loadList();
    if (tab === 'risk')      loadRisk();
    if (tab === 'timeline' && selectedId) loadDetail(selectedId);
  };

  // ─── lifecycle actions ───────────────────────────────────────────────
  const doAction = useCallback(async (id, action, body = null) => {
    try {
      const url = `${API_URL}/api/contracts/${id}/${action}`;
      const res = await axios.post(url, body || {}, { headers });
      const c = res.data?.data;
      if (c) {
        toast.success(`${action} → ${c.status}`);
        setData_('detail', c);
        // refresh list / overview in background
        loadList(); loadOverview();
        if (action === 'amend' && c.id !== id) setSelectedId(c.id);
      }
    } catch (e) {
      const msg = e?.response?.data?.detail || e.message;
      toast.error(`${action} failed: ${msg}`);
    }
  }, [headers, loadList, loadOverview]);

  const createFromTemplate = useCallback(async (templateKey) => {
    try {
      const tpl = (data.templates || []).find((t) => t.key === templateKey);
      const { data: res } = await axios.post(
        `${API_URL}/api/contracts`,
        { template: templateKey, title: `${tpl?.name || templateKey} — ${new Date().toLocaleDateString()}` },
        { headers },
      );
      const c = res?.data;
      if (c) {
        toast.success(`Contract ${c.id} created`);
        setSelectedId(c.id);
        setTab('timeline');
        loadList();
      }
    } catch (e) {
      toast.error(`Create failed: ${e?.response?.data?.detail || e.message}`);
    }
  }, [headers, data.templates, loadList]);

  // ─── derived ─────────────────────────────────────────────────────────
  const ccy = data.overview?.currency || 'EUR';
  const totals = data.overview?.totals || {};
  const list = data.list || [];
  const pendingApprovals = useMemo(() => list.filter((c) => c.status === 'pending_approval'), [list]);

  return (
    <div className="min-h-full" data-testid="contract360-page">
      {/* HEADER */}
      <PageHeader
        icon={FileText}
        title={t('w15_title')}
        subtitle={t('w15_subtitle')}
        actions={(
          <>
            <HeaderActionButton icon={Plus} label={t('w17_new')} onClick={() => setTab('templates')} variant="primary" testId="new-contract-btn" responsiveIconOnly />
            <RefreshButton onClick={refresh} testId="refresh-btn" />
          </>
        )}
        testId="contract360-header"
      />

      <div className="mb-4"><RoleZoneBadge variant="wave360" /></div>

      {/* TABS */}
      <PageTabs
        tabs={TABS}
        active={tab}
        onChange={setTab}
        testId="contract360-tabs"
      />

      <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }} className="space-y-5">

        {/* ============================== OVERVIEW ============================== */}
        {tab === 'overview' ? (
          loading.overview && !data.overview ? (
            <div className="flex justify-center py-16"><div className="w-7 h-7 border-2 border-[#18181B] border-t-transparent rounded-full animate-spin" /></div>
          ) : data.overview ? (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3" data-testid="overview-kpis">
                <KpiTile icon={FileText}    label="Contracts"        value={totals.contracts || 0}                  hint={`scope: ${data.overview.scope?.all ? 'all' : data.overview.scope?.managers + ' mgr'}`} tooltip={t('tip_w15_tab_dashboard')} />
                <KpiTile icon={CurrencyEur} label="Total value"      value={fmt(totals.total_value, ccy)}            hint={`${fmt(totals.active_value, ccy)} active`} tone="accent" tooltip={t('tip_w12a_kpi_revenue')} />
                <KpiTile icon={ShieldCheck} label="Pending approvals" value={totals.pending_approvals || 0}          hint="awaiting internal sign-off" tone={totals.pending_approvals > 0 ? 'warn' : 'good'} onClick={() => setTab('approvals')} tooltip={t('tip_w16_kpi_pending')} testId="kpi-pending" />
                <KpiTile icon={Warning}     label="Overdue signature" value={totals.overdue_signature || 0}          hint={`${fmt(totals.unsigned_value, ccy)} at risk`} tone={totals.overdue_signature > 0 ? 'bad' : 'good'} onClick={() => setTab('risk')} tooltip={t('tip_w16_kpi_unsigned')} testId="kpi-overdue" />
                <KpiTile icon={Clock}       label="Expiring soon"    value={totals.expiring_soon || 0}              hint="≤ 7 days" tone={totals.expiring_soon > 0 ? 'warn' : 'good'} tooltip={t('tip_w16_kpi_expiring')} />
                <KpiTile icon={CheckCircle} label="Healthy"          value={totals.healthy_count || 0}              hint="active + signed + papered" tone="good" tooltip={t('tip_w15_tab_risk')} />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div className="bg-white border border-[#E4E4E7] rounded-2xl p-4" data-testid="overview-by-segment">
                  <div className="text-[10px] uppercase tracking-wider font-bold text-[#71717A] mb-3">{t('ct_health_distribution')}</div>
                  {Object.entries(data.overview.by_segment || {}).length === 0 ? (
                    <div className="text-sm text-[#71717A] py-2">{t('ct_no_contracts_yet')}</div>
                  ) : (
                    <div className="space-y-2">
                      {Object.entries(data.overview.by_segment || {}).filter(([, v]) => v > 0).map(([seg, count]) => (
                        <div key={seg} className="flex items-center gap-3">
                          <div className="w-40"><SegBadge value={seg} /></div>
                          <div className="flex-1 h-2 bg-[#F4F4F5] rounded-full overflow-hidden">
                            <div className={`h-full ${SEG_TONE[seg]?.bg.replace('-50', '-400') || 'bg-slate-400'}`} style={{ width: `${Math.min(100, (count / Math.max(1, totals.contracts || 1)) * 100)}%` }} />
                          </div>
                          <div className="w-10 text-right tabular-nums text-[12px] font-semibold text-[#18181B]">{count}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div className="bg-white border border-[#E4E4E7] rounded-2xl p-4" data-testid="overview-by-status">
                  <div className="text-[10px] uppercase tracking-wider font-bold text-[#71717A] mb-3">{t('ct_by_status')}</div>
                  {Object.entries(data.overview.by_status || {}).length === 0 ? (
                    <div className="text-sm text-[#71717A] py-2">{t('ct_no_contracts_yet')}</div>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {Object.entries(data.overview.by_status || {}).map(([status, count]) => (
                        <button key={status} onClick={() => { setStatusFilter(status); setTab('contracts'); }} className="inline-flex items-center gap-2 px-3 py-1.5 border border-[#E4E4E7] rounded-xl hover:bg-[#FAFAFA] text-left">
                          <StatusBadge value={status} />
                          <span className="text-[13px] font-semibold tabular-nums text-[#18181B]">{count}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="bg-white border border-[#E4E4E7] rounded-2xl p-4" data-testid="overview-at-risk">
                <div className="flex items-center justify-between mb-3">
                  <div className="text-[10px] uppercase tracking-wider font-bold text-[#71717A]">{t('ct_top_at_risk')}</div>
                  <button onClick={() => setTab('risk')} className="text-[11px] font-semibold text-[#18181B] hover:underline">{t('ct_view_all')} →</button>
                </div>
                {(data.overview.top_at_risk || []).length === 0 ? (
                  <div className="text-sm text-[#71717A] py-2">{t('ct_no_at_risk')}</div>
                ) : (
                  <div className="divide-y divide-[#F4F4F5]">
                    {data.overview.top_at_risk.map((c) => (
                      <button key={c.id} onClick={() => { setSelectedId(c.id); setTab('timeline'); }} className="w-full grid grid-cols-12 gap-2 py-2 items-center text-left text-[13px] hover:bg-[#FAFAFA] px-2 -mx-2 rounded">
                        <div className="col-span-4 truncate font-medium text-[#18181B]">{c.title || c.id}<ArrowSquareOut size={10} className="inline ml-1 text-[#A1A1AA]" /></div>
                        <div className="col-span-2"><StatusBadge value={c.status} /></div>
                        <div className="col-span-2"><SegBadge value={c.segment} /></div>
                        <div className="col-span-2 text-right tabular-nums font-semibold text-[#18181B]">{fmt(c.amount, ccy)}</div>
                        <div className="col-span-2 text-[11px] text-[#71717A] truncate">{(c.reasons || [])[0]}</div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </>
          ) : null
        ) : null}

        {/* ============================== CONTRACTS ============================ */}
        {tab === 'contracts' ? (
          <>
            <div className="bg-white border border-[#E4E4E7] rounded-2xl p-3 flex flex-wrap gap-2 items-center" data-testid="contracts-filters">
              <WhiteSelect value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="min-w-[160px]" data-testid="filter-status">
                <option value="">{t('all_statuses')}</option>
                {['draft','pending_approval','approved','sent','opened','signed','active','amended','expired','archived','rejected'].map((s) => <option key={s} value={s}>{t(`contract_status_${s}`)}</option>)}
              </WhiteSelect>
              <WhiteSelect value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="min-w-[160px]" data-testid="filter-type">
                <option value="">{t('all_types')}</option>
                {['purchase','agency','transport','custom'].map((tp) => <option key={tp} value={tp}>{t(`contract_type_${tp}`)}</option>)}
              </WhiteSelect>
              {statusFilter || typeFilter ? <button onClick={() => { setStatusFilter(''); setTypeFilter(''); }} className="text-[11px] text-[#71717A] hover:underline">{t('clear') || 'Clear'}</button> : null}
              <div className="ml-auto text-[12px] text-[#71717A]">{list.length} {t('w15_tab_contracts').toLowerCase()}</div>
            </div>
            <ContractsTable rows={list} loading={loading.list} ccy={ccy} t={t} onSelect={(id) => { setSelectedId(id); setTab('timeline'); }} onDeal={(deal_id) => navigate(`/admin/deals/${deal_id}/360`)} />
          </>
        ) : null}

        {/* ============================== TEMPLATES ============================ */}
        {tab === 'templates' ? (
          loading.templates && !data.templates ? (
            <div className="flex justify-center py-16"><div className="w-7 h-7 border-2 border-[#18181B] border-t-transparent rounded-full animate-spin" /></div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4" data-testid="templates-grid">
              {(data.templates || []).map((t) => (
                <div key={t.key} className="bg-white border border-[#E4E4E7] rounded-2xl p-5 flex flex-col" data-testid={`template-card-${t.key}`}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-lg font-bold text-[#18181B]">{t.name}</div>
                    <span className="text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-full bg-zinc-100 text-zinc-700">{t.type}</span>
                  </div>
                  <p className="text-[13px] text-[#52525B] mb-3">{t.description}</p>
                  <div className="text-[11px] text-[#71717A] mb-1 uppercase tracking-wider font-bold">Approval chain</div>
                  <div className="flex flex-wrap gap-1 mb-3">
                    {(t.approval_chain || []).map((s, i) => (
                      <span key={i} className="inline-flex items-center gap-1 text-[11px] bg-zinc-50 border border-zinc-200 rounded-full px-2 py-0.5 text-zinc-700">{s.replace(/_/g, ' ')}{i < (t.approval_chain || []).length - 1 ? ' →' : ''}</span>
                    ))}
                  </div>
                  <div className="text-[11px] text-[#71717A] mb-1 uppercase tracking-wider font-bold">Required annexes</div>
                  <div className="flex flex-wrap gap-1 mb-3">
                    {(t.required_annexes || []).length === 0 ? <span className="text-[12px] text-[#A1A1AA]">none</span> : null}
                    {(t.required_annexes || []).map((a) => (
                      <span key={a} className="text-[11px] bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5 text-amber-700">{a.replace(/_/g, ' ')}</span>
                    ))}
                  </div>
                  <div className="text-[11px] text-[#71717A] mb-3">Valid {t.valid_days || 30} days · signature {t.signature_required ? 'required' : 'optional'}</div>
                  <button onClick={() => createFromTemplate(t.key)} className="mt-auto inline-flex items-center justify-center gap-2 px-3 py-2 bg-[#18181B] text-white rounded-xl text-[12px] font-semibold hover:bg-black" data-testid={`create-${t.key}`}>
                    <Plus size={14} weight="bold" /> Create {t.name}
                  </button>
                </div>
              ))}
            </div>
          )
        ) : null}

        {/* ============================== APPROVALS ============================ */}
        {tab === 'approvals' ? (
          loading.list && !list.length ? (
            <div className="flex justify-center py-16"><div className="w-7 h-7 border-2 border-[#18181B] border-t-transparent rounded-full animate-spin" /></div>
          ) : (
            <div data-testid="approvals-queue">
              {pendingApprovals.length === 0 ? (
                <div className="bg-white border border-[#E4E4E7] rounded-2xl p-6 text-center text-sm text-[#71717A]">{t('ct_no_pending')}</div>
              ) : (
                <div className="bg-white border border-[#E4E4E7] rounded-2xl overflow-x-auto">
                  <table className="w-full text-[13px]">
                    <thead className="bg-[#FAFAFA] text-left text-[10px] uppercase tracking-wider text-[#71717A]">
                      <tr><th className="px-4 py-3">{t('contract') || 'Contract'}</th><th className="px-4 py-3">{t('type') || 'Type'}</th><th className="px-4 py-3">{t('next_step') || 'Next step'}</th><th className="px-4 py-3 text-right">{t('amount') || 'Amount'}</th><th className="px-4 py-3">{t('actions') || 'Actions'}</th></tr>
                    </thead>
                    <tbody className="divide-y divide-[#F4F4F5]">
                      {pendingApprovals.map((c) => {
                        const next = (c.approvals || []).find((a) => a.status === 'pending')?.step;
                        return (
                          <tr key={c.id} className="hover:bg-[#FAFAFA]">
                            <td className="px-4 py-3"><button className="text-left font-medium text-[#18181B] hover:underline" onClick={() => { setSelectedId(c.id); setTab('timeline'); }}>{c.title || c.id}</button></td>
                            <td className="px-4 py-3 capitalize">{c.type && t(`contract_type_${c.type}`) !== `contract_type_${c.type}` ? t(`contract_type_${c.type}`) : c.type}</td>
                            <td className="px-4 py-3">{next ? <StatusBadge value={next} /> : <span className="text-[#A1A1AA]">—</span>}</td>
                            <td className="px-4 py-3 text-right tabular-nums">{fmt(c.amount, c.currency || 'EUR')}</td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2">
                                <button onClick={() => doAction(c.id, 'approve', { comment: 'Approved via queue' })} className="inline-flex items-center gap-1 px-2 py-1 bg-emerald-600 text-white rounded-lg text-[11px] font-semibold hover:bg-emerald-700" data-testid={`approve-${c.id}`}><CheckCircle size={12} weight="bold" /> {t('approve') || 'Approve'}</button>
                                <button onClick={() => doAction(c.id, 'reject',  { comment: 'Rejected via queue' })} className="inline-flex items-center gap-1 px-2 py-1 bg-red-600 text-white rounded-lg text-[11px] font-semibold hover:bg-red-700" data-testid={`reject-${c.id}`}><XCircle size={12} weight="bold" /> {t('reject') || 'Reject'}</button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )
        ) : null}

        {/* ============================== RISK ================================= */}
        {tab === 'risk' ? (
          loading.risk && !data.risk ? (
            <div className="flex justify-center py-16"><div className="w-7 h-7 border-2 border-[#18181B] border-t-transparent rounded-full animate-spin" /></div>
          ) : data.risk ? (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3" data-testid="risk-kpis">
                <KpiTile icon={Lifebuoy}    label="Contracts at risk" value={data.risk.total || 0} hint={`${fmt(data.risk.risk_value, ccy)} exposed`} tone={data.risk.total > 0 ? 'bad' : 'good'} />
                {Object.entries(data.risk.by_segment || {}).filter(([, v]) => v > 0).slice(0, 3).map(([seg, count]) => (
                  <KpiTile key={seg} icon={Warning} label={seg.replace(/_/g, ' ')} value={count} tone="warn" testId={`risk-seg-${seg}`} />
                ))}
              </div>
              <div className="bg-white border border-[#E4E4E7] rounded-2xl overflow-x-auto">
                <table className="w-full text-[13px]" data-testid="risk-table">
                  <thead className="bg-[#FAFAFA] text-left text-[10px] uppercase tracking-wider text-[#71717A]">
                    <tr><th className="px-4 py-3">Contract</th><th className="px-4 py-3">Segment</th><th className="px-4 py-3">Status</th><th className="px-4 py-3 text-right">Score</th><th className="px-4 py-3 text-right">Amount</th><th className="px-4 py-3">Reason</th></tr>
                  </thead>
                  <tbody className="divide-y divide-[#F4F4F5]">
                    {(data.risk.items || []).length === 0 ? (
                      <tr><td colSpan={6} className="px-4 py-6 text-center text-sm text-[#71717A]">{t('ct_no_risk')}</td></tr>
                    ) : (data.risk.items || []).map((c) => (
                      <tr key={c.id} className="hover:bg-[#FAFAFA] cursor-pointer" onClick={() => { setSelectedId(c.id); setTab('timeline'); }} data-testid={`risk-row-${c.id}`}>
                        <td className="px-4 py-3 font-medium text-[#18181B] truncate max-w-[280px]">{c.title || c.id}</td>
                        <td className="px-4 py-3"><SegBadge value={c.segment} /></td>
                        <td className="px-4 py-3"><StatusBadge value={c.status} /></td>
                        <td className="px-4 py-3 text-right tabular-nums">{c.score}</td>
                        <td className="px-4 py-3 text-right tabular-nums">{fmt(c.amount, ccy)}</td>
                        <td className="px-4 py-3 text-[11px] text-[#71717A] truncate max-w-[280px]">{(c.reasons || [])[0]}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : null
        ) : null}

        {/* ============================== TIMELINE ============================= */}
        {tab === 'timeline' ? (
          !selectedId ? (
            <div className="bg-white border border-[#E4E4E7] rounded-2xl p-6 text-center text-sm text-[#71717A]">{t('w15_pick_a_contract')} <button className="underline" onClick={() => setTab('contracts')}>{t('w15_tab_contracts')}</button>{t('w15_pick_a_contract_from')} <button className="underline" onClick={() => setTab('risk')}>{t('w15_tab_risk')}</button>{t('w15_pick_a_contract_or')} <button className="underline" onClick={() => setTab('overview')}>{t('w15_tab_overview')}</button> {t('w15_pick_a_contract_see')}</div>
          ) : loading.detail && !data.detail ? (
            <div className="flex justify-center py-16"><div className="w-7 h-7 border-2 border-[#18181B] border-t-transparent rounded-full animate-spin" /></div>
          ) : data.detail ? (
            <ContractDetail c={data.detail} onAction={doAction} onOpenDeal={(d) => navigate(`/admin/deals/${d}/360`)} />
          ) : null
        ) : null}
      </motion.div>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────
const ContractsTable = ({ rows, loading, ccy, onSelect, onDeal, t = (k) => k }) => {
  if (loading && !rows.length) return <div className="flex justify-center py-16"><div className="w-7 h-7 border-2 border-[#18181B] border-t-transparent rounded-full animate-spin" /></div>;
  if (!rows.length) return <div className="bg-white border border-[#E4E4E7] rounded-2xl p-6 text-center text-sm text-[#71717A]">{t('ct_no_contracts_create')}</div>;
  return (
    <div className="bg-white border border-[#E4E4E7] rounded-2xl overflow-x-auto">
      <table className="w-full text-[13px]" data-testid="contracts-table">
        <thead className="bg-[#FAFAFA] text-left text-[10px] uppercase tracking-wider text-[#71717A]">
          <tr>
            <th className="px-4 py-3">Title</th>
            <th className="px-4 py-3">Type</th>
            <th className="px-4 py-3">Status</th>
            <th className="px-4 py-3">Health</th>
            <th className="px-4 py-3 text-right">Amount</th>
            <th className="px-4 py-3">Valid to</th>
            <th className="px-4 py-3">v</th>
            <th className="px-4 py-3">Deal</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[#F4F4F5]">
          {rows.map((c) => (
            <tr key={c.id} className="hover:bg-[#FAFAFA]" data-testid={`row-${c.id}`}>
              <td className="px-4 py-3"><button onClick={() => onSelect(c.id)} className="text-left font-medium text-[#18181B] hover:underline">{c.title || c.id}</button></td>
              <td className="px-4 py-3 capitalize">{c.type || c.template}</td>
              <td className="px-4 py-3"><StatusBadge value={c.status} /></td>
              <td className="px-4 py-3"><SegBadge value={c.health?.segment} /></td>
              <td className="px-4 py-3 text-right tabular-nums">{fmt(c.amount, c.currency || ccy)}</td>
              <td className="px-4 py-3 text-[12px] text-[#71717A]">{fmtDate(c.valid_to)}</td>
              <td className="px-4 py-3 text-[12px] tabular-nums">{c.version}</td>
              <td className="px-4 py-3">{c.deal_id ? <button className="text-[11px] text-[#18181B] hover:underline inline-flex items-center gap-1" onClick={() => onDeal(c.deal_id)}>{c.deal_id} <ArrowSquareOut size={10} /></button> : <span className="text-[#A1A1AA]">—</span>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

const ContractDetail = ({ c, onAction, onOpenDeal }) => {
  const status = c.status;
  const canSend     = ['draft', 'approved'].includes(status);
  const canApprove  = status === 'pending_approval';
  const canReject   = status === 'pending_approval';
  const canSign     = ['approved', 'sent', 'opened'].includes(status);
  const canAmend    = ['active', 'sent', 'signed'].includes(status);
  const canArchive  = !['archived'].includes(status);

  return (
    <div className="space-y-4" data-testid="contract-detail">
      <div className="bg-white border border-[#E4E4E7] rounded-2xl p-5">
        <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
          <div>
            <div className="text-xl font-bold text-[#18181B]">{c.title || c.id}</div>
            <div className="text-[12px] text-[#71717A] mt-0.5 flex flex-wrap items-center gap-2">
              <span>v{c.version}</span> ·
              <StatusBadge value={c.status} />
              <SegBadge value={c.health?.segment} />
              <span>Score {c.health?.score}</span>
              {c.deal_id ? <button onClick={() => onOpenDeal(c.deal_id)} className="text-[#18181B] underline inline-flex items-center gap-1">Deal {c.deal_id} <ArrowSquareOut size={10} /></button> : null}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {canSend     ? <button onClick={() => onAction(c.id, 'send')}    className="inline-flex items-center gap-1 px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-[12px] font-semibold hover:bg-indigo-700" data-testid="action-send"><PaperPlaneTilt size={12} weight="bold" /> {status === 'draft' ? 'Send for approval' : 'Send to customer'}</button> : null}
            {canApprove  ? <button onClick={() => onAction(c.id, 'approve', { comment: 'OK' })} className="inline-flex items-center gap-1 px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-[12px] font-semibold hover:bg-emerald-700" data-testid="action-approve"><CheckCircle size={12} weight="bold" /> Approve step</button> : null}
            {canReject   ? <button onClick={() => onAction(c.id, 'reject',  { comment: 'Rejected' })} className="inline-flex items-center gap-1 px-3 py-1.5 bg-red-600 text-white rounded-lg text-[12px] font-semibold hover:bg-red-700" data-testid="action-reject"><XCircle size={12} weight="bold" /> Reject</button> : null}
            {canSign     ? <button onClick={() => onAction(c.id, 'sign',    { signer_name: 'Customer', method: 'electronic' })} className="inline-flex items-center gap-1 px-3 py-1.5 bg-[#18181B] text-white rounded-lg text-[12px] font-semibold hover:bg-black" data-testid="action-sign"><PencilSimple size={12} weight="bold" /> Sign</button> : null}
            {canAmend    ? <button onClick={() => onAction(c.id, 'amend',   { reason: 'Manual amendment' })} className="inline-flex items-center gap-1 px-3 py-1.5 bg-amber-500 text-white rounded-lg text-[12px] font-semibold hover:bg-amber-600" data-testid="action-amend"><PencilSimple size={12} weight="bold" /> Amend</button> : null}
            {canArchive  ? <button onClick={() => onAction(c.id, 'archive')} className="inline-flex items-center gap-1 px-3 py-1.5 border border-[#E4E4E7] text-[#52525B] rounded-lg text-[12px] font-semibold hover:bg-[#FAFAFA]" data-testid="action-archive"><Archive size={12} weight="bold" /> Archive</button> : null}
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-[12px]">
          <div><div className="text-[10px] uppercase text-[#71717A] tracking-wider font-bold">Amount</div><div className="text-[14px] font-semibold tabular-nums">{fmt(c.amount, c.currency || 'EUR')}</div></div>
          <div><div className="text-[10px] uppercase text-[#71717A] tracking-wider font-bold">Valid</div><div className="text-[13px]">{fmtDate(c.valid_from)} → {fmtDate(c.valid_to)}</div></div>
          <div><div className="text-[10px] uppercase text-[#71717A] tracking-wider font-bold">Sent</div><div className="text-[13px]">{fmtDate(c.sent_at)}</div></div>
          <div><div className="text-[10px] uppercase text-[#71717A] tracking-wider font-bold">Signed</div><div className="text-[13px]">{fmtDate(c.signed_at)}</div></div>
        </div>
        {(c.health?.reasons || []).length ? (
          <div className="mt-3 pt-3 border-t border-[#F4F4F5]">
            <div className="text-[10px] uppercase text-[#71717A] tracking-wider font-bold mb-1">Health reasons</div>
            <div className="text-[12px] text-[#52525B]">{(c.health?.reasons || []).join(' · ')}</div>
          </div>
        ) : null}
      </div>

      {/* Approvals */}
      <div className="bg-white border border-[#E4E4E7] rounded-2xl p-4" data-testid="detail-approvals">
        <div className="text-[10px] uppercase tracking-wider font-bold text-[#71717A] mb-3">Approval chain</div>
        {(c.approvals || []).length === 0 ? (
          <div className="text-sm text-[#71717A]">Not sent yet. The chain is: {(c.approval_chain || []).join(' → ')}</div>
        ) : (
          <div className="space-y-2">
            {c.approvals.map((a, i) => (
              <div key={i} className="flex items-center justify-between text-[13px]">
                <div className="flex items-center gap-2">
                  {a.status === 'approved' ? <CheckCircle size={14} weight="bold" className="text-emerald-600" /> : a.status === 'rejected' ? <XCircle size={14} weight="bold" className="text-red-600" /> : <Clock size={14} weight="bold" className="text-[#A1A1AA]" />}
                  <span className="font-semibold capitalize">{a.step.replace(/_/g, ' ')}</span>
                  <StatusBadge value={a.status} />
                </div>
                <div className="text-[11px] text-[#71717A]">{a.actor_name || ''} {a.at ? `· ${fmtDate(a.at)}` : ''}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Attachments */}
      <div className="bg-white border border-[#E4E4E7] rounded-2xl p-4" data-testid="detail-attachments">
        <div className="text-[10px] uppercase tracking-wider font-bold text-[#71717A] mb-3">Attachments ({(c.attachments || []).length})</div>
        {(c.required_annexes || []).length ? (
          <div className="mb-3">
            <div className="text-[11px] text-[#71717A] mb-1">Required annexes:</div>
            <div className="flex flex-wrap gap-1">
              {(c.required_annexes || []).map((a) => {
                const present = (c.attachments || []).some((att) => (att.kind_key || att.filename || '').toLowerCase().includes(a.toLowerCase()));
                return (
                  <span key={a} className={`text-[11px] rounded-full px-2 py-0.5 border ${present ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-amber-50 border-amber-200 text-amber-700'}`}>{present ? '✓ ' : '⏳ '}{a.replace(/_/g, ' ')}</span>
                );
              })}
            </div>
          </div>
        ) : null}
        {(c.attachments || []).length === 0 ? (
          <div className="text-sm text-[#71717A]">No attachments yet.</div>
        ) : (
          <div className="divide-y divide-[#F4F4F5]">
            {c.attachments.map((a) => (
              <div key={a.id} className="flex items-center justify-between py-2 text-[13px]">
                <div className="flex items-center gap-2">
                  <FileText size={14} className="text-[#71717A]" />
                  <span className="font-medium">{a.filename}</span>
                  <span className="text-[11px] text-[#71717A]">{a.kind}</span>
                </div>
                <div className="text-[11px] text-[#71717A]">{fmtDate(a.uploaded_at)}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Timeline */}
      <div className="bg-white border border-[#E4E4E7] rounded-2xl p-4" data-testid="detail-timeline">
        <div className="text-[10px] uppercase tracking-wider font-bold text-[#71717A] mb-3">Timeline</div>
        {(c.events || []).length === 0 ? (
          <div className="text-sm text-[#71717A]">No events yet.</div>
        ) : (
          <div className="space-y-3">
            {(c.events || []).slice().reverse().map((e, i) => (
              <div key={i} className="flex items-start gap-3 text-[13px]">
                <div className="w-2 h-2 rounded-full bg-[#18181B] mt-1.5" />
                <div className="flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold capitalize">{e.kind.replace(/_/g, ' ')}</span>
                    <span className="text-[11px] text-[#71717A]">{fmtDate(e.at)}</span>
                  </div>
                  <div className="text-[12px] text-[#52525B]">{e.note || ''}{e.actor_name ? ` · ${e.actor_name}` : ''}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Versions */}
      {(c.versions || []).length ? (
        <div className="bg-white border border-[#E4E4E7] rounded-2xl p-4" data-testid="detail-versions">
          <div className="text-[10px] uppercase tracking-wider font-bold text-[#71717A] mb-3">Version history ({c.versions.length})</div>
          <div className="space-y-2">
            {c.versions.map((v, i) => (
              <div key={i} className="flex items-center justify-between text-[12px] text-[#52525B]">
                <div className="flex items-center gap-2"><span className="font-semibold text-[#18181B]">v{v.version}</span><StatusBadge value={v.status} /></div>
                <div className="text-[11px] text-[#71717A]">{v.reason || ''} · {fmtDate(v.at)}</div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
};
