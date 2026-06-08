/**
 * LegalWorkflowPage — единая dashboard для P0.1–P0.4:
 *   Tab 1: Customer Legal  (P0.1) — юридические поля клиента
 *   Tab 2: Deal Pipeline   (P0.2) — 20 стадий + advance
 *   Tab 3: Deposit v2      (P0.3) — required EUR + confirm + forfeit
 *   Tab 4: Contract v2     (P0.4) — lifecycle + upload signed PDF
 *
 * Backend: legal_workflow.py  (/api/legal/*, /api/contracts2/*)
 */
import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { API_URL } from '../../App';
import { toast } from 'sonner';
import { motion } from 'framer-motion';
import {
  Scales, IdentificationCard, Coins, FileText,
  CheckCircle, Warning, ArrowsClockwise, FloppyDisk,
  ShieldCheck, Fire, UploadSimple, ArrowRight, Info,
  Trophy, X as IconX,
  Wallet, Bank, Money, Lock, LockOpen, Plus, Receipt,
  CurrencyEur, CheckSquare, XCircle, ListChecks, Calculator
} from '@phosphor-icons/react';
import CalculationsTab from '../../components/crm/calculations/CalculationsTab';
import WhiteSelect from '../../components/ui/WhiteSelect';
import SectionTabs, { OptionPillGroup } from '../../components/ui/SectionTabs';
import SharedZoneBadge from '../../components/ui/SharedZoneBadge';
import LabelWithTip from '../../components/ui/LabelWithTip';

import { useLang } from '../../i18n';
// ──────────────────────── STATIC HELPERS ─────────────────────────
const STAGE_LABELS = {
  lead: 'Lead',
  qualified: 'Qualified',
  variants_sent: 'Varianty Sent',
  deposit_contract_drafted: 'Deposit Contract Drafted',
  deposit_contract_signed: 'Deposit Contract Signed',
  deposit_paid: 'Deposit Paid',
  searching_at_auction: 'Searching at Auction',
  auction_lost: 'Auction Lost',
  auction_won: 'Auction Won',
  final_contract_sent: 'Final Contract Sent',
  final_contract_signed: 'Final Contract Signed',
  after_win_payment_paid: 'After-Win Payment Paid',
  in_transit_to_rotterdam: 'In Transit → Rotterdam',
  arrived_rotterdam: 'Arrived Rotterdam',
  customs_calculated: 'Customs Calculated',
  final_payment_paid: 'Final Payment Paid',
  in_transit_to_bg: 'In Transit → BG',
  delivered: 'Delivered',
  closed: 'Closed',
  cancelled: 'Cancelled',
};

const DEPOSIT_STATUS_COLORS = {
  pending:                   'bg-[#FEF3C7] text-[#D97706]',
  paid_confirmed:            'bg-[#D1FAE5] text-[#059669]',
  refund_pending_voluntary:  'bg-[#E0E7FF] text-[#4F46E5]',
  refund_pending_30d:        'bg-[#FED7AA] text-[#C2410C]',
  refund_approved:           'bg-[#BFDBFE] text-[#1D4ED8]',
  refund_rejected:           'bg-[#FEE2E2] text-[#DC2626]',
  refunded:                  'bg-[#A7F3D0] text-[#065F46]',
  forfeit_pending_teamlead:  'bg-[#FED7AA] text-[#C2410C]',
  forfeit_pending_admin:     'bg-[#FCA5A5] text-[#991B1B]',
  forfeited:                 'bg-[#1F2937] text-white',
};

const LIFECYCLE_COLORS = {
  draft:                  'bg-[#F4F4F5] text-[#71717A]',
  sent_to_client:         'bg-[#E0E7FF] text-[#4F46E5]',
  client_signed:          'bg-[#FEF3C7] text-[#D97706]',
  company_signed_stamped: 'bg-[#DBEAFE] text-[#2563EB]',
  finalized:              'bg-[#D1FAE5] text-[#059669]',
  cancelled:              'bg-[#FEE2E2] text-[#DC2626]',
};

// ───────────────────────── MAIN PAGE ─────────────────────────────
export default function LegalWorkflowPage() {
  const { t } = useLang();
  const [params, setParams] = useSearchParams();
  const initialTab = params.get('tab') || 'customer_legal';
  const [tab, setTab] = useState(initialTab);
  const [catalog, setCatalog] = useState(null);
  const [customers, setCustomers] = useState([]);
  const [deals, setDeals] = useState([]);

  // Sync tab → URL query
  useEffect(() => {
    if (tab !== params.get('tab')) {
      const next = new URLSearchParams(params);
      next.set('tab', tab);
      setParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  // Sync URL query → tab (so sidebar navigation between ?tab=deal_pipeline /
  // ?tab=deposit_v2 works even when already on this page).
  useEffect(() => {
    const urlTab = params.get('tab');
    if (urlTab && urlTab !== tab) {
      setTab(urlTab);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  useEffect(() => {
    (async () => {
      try {
        const [cat, cust, dl] = await Promise.all([
          axios.get(`${API_URL}/api/legal/catalog`),
          axios.get(`${API_URL}/api/customers?limit=200`),
          axios.get(`${API_URL}/api/deals?limit=200`),
        ]);
        setCatalog(cat.data);
        setCustomers(cust.data?.data || []);
        setDeals(dl.data?.data || []);
      } catch (e) {
        console.error(e);
        toast.error(t('adm_failed_to_load_directories'));
      }
    })();
  }, []);

  const tabs = [
    { id: 'customer_legal', label: t('customerLegal'), icon: IdentificationCard },
    { id: 'deal_pipeline',  label: t('dealPipelineTab'),  icon: ArrowsClockwise },
    { id: 'deposit_v2',     label: t('depositV2Tab'),     icon: Coins },
    { id: 'contract_v2',    label: t('contractV2Tab'),    icon: FileText },
    { id: 'financials',     label: t('financialsTab'), icon: Wallet },
    { id: 'calculations',   label: t('calculationsTab'),   icon: Calculator },
  ];

  return (
    <motion.div
      data-testid="legal-workflow-page"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="space-y-6"
    >
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-2xl bg-[#18181B] text-white flex items-center justify-center shrink-0">
          <Scales size={20} weight="bold" />
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-bold tracking-tight text-[#18181B] leading-tight break-words"
              style={{ fontFamily: 'Mazzard, Mazzard H, Mazzard M, system-ui, sans-serif' }}>
            {t('legalAndPipelineWorkflow')}
          </h1>
          <p className="text-[12px] text-[#71717A] mt-0.5 break-words">
            {t('legalWorkflowSubtitle')}
          </p>
          <div className="mt-2">
            <SharedZoneBadge />
          </div>
        </div>
      </div>

      {/* Tabs — unified black-outline standard */}
      <SectionTabs
        tabs={tabs.map((t2) => ({ id: t2.id, label: t2.label, icon: t2.icon }))}
        activeId={tab}
        onChange={setTab}
        testIdPrefix="legal-tab"
        ariaLabel="Legal workflow sections"
        className="-mx-1 sm:mx-0"
      />

      <div className="min-h-[500px]">
        {tab === 'customer_legal' && (
          <CustomerLegalTab customers={customers} />
        )}
        {tab === 'deal_pipeline' && (
          <DealPipelineTab
            deals={deals}
            customers={customers}
            catalog={catalog}
            onRefresh={async () => {
              const r = await axios.get(`${API_URL}/api/deals?limit=200`);
              setDeals(r.data?.data || []);
            }}
          />
        )}
        {tab === 'deposit_v2' && (
          <DepositV2Tab
            customers={customers}
            deals={deals}
            catalog={catalog}
          />
        )}
        {tab === 'contract_v2' && (
          <ContractV2Tab
            customers={customers}
            deals={deals}
            catalog={catalog}
          />
        )}
        {tab === 'financials' && (
          <FinancialsTab
            customers={customers}
            deals={deals}
          />
        )}
        {tab === 'calculations' && (
          <CalculationsTab deals={deals} />
        )}
      </div>
    </motion.div>
  );
}

// ════════════════════════ P0.1 TAB ═══════════════════════════════
function CustomerLegalTab({ customers }) {
  const { t } = useLang();
  const navigate = useNavigate();
  const [customerId, setCustomerId] = useState('');
  const [legal, setLegal] = useState(emptyLegal());
  const [validation, setValidation] = useState(null);
  const [saving, setSaving] = useState(false);

  function emptyLegal() {
    return {
      first_name: '', last_name: '', egn: '',
      national_id_no: '', id_card_address: '',
      id_card_issued_by: '', id_card_issue_date: '',
    };
  }

  const load = useCallback(async (id) => {
    if (!id) { setLegal(emptyLegal()); setValidation(null); return; }
    try {
      const [r1, r2] = await Promise.all([
        axios.get(`${API_URL}/api/customers/${id}/legal`),
        axios.get(`${API_URL}/api/customers/${id}/legal/validate`),
      ]);
      setLegal({ ...emptyLegal(), ...(r1.data?.legal || {}) });
      setValidation(r2.data);
    } catch (e) {
      setLegal(emptyLegal());
      setValidation(null);
    }
  }, []);

  useEffect(() => { load(customerId); }, [customerId, load]);

  const save = async () => {
    if (!customerId) return toast.error(t('pleaseSelectClient'));
    if (!/^\d{10}$/.test(legal.egn)) return toast.error(t('adm_egn_must_be_exactly_10_digits'));
    if (!/^\d{4}-\d{2}-\d{2}$/.test(legal.id_card_issue_date))
      return toast.error(t('adm_issue_date_in_yyyymmdd_format'));
    setSaving(true);
    try {
      await axios.put(`${API_URL}/api/customers/${customerId}/legal`, legal);
      toast.success(t('adm_legal_fields_saved'));
      await load(customerId);
    } catch (e) {
      toast.error(e?.response?.data?.detail || t('adm2_4d86bed39c'));
    } finally {
      setSaving(false);
    }
  };

  const field = (key, label, opts = {}) => (
    <div>
      <label className="block text-xs font-semibold uppercase tracking-wider text-[#71717A] mb-2">
        {label}{!opts.optional && <span className="text-[#DC2626]"> *</span>}
      </label>
      <input
        type={opts.type || 'text'}
        value={legal[key] || ''}
        onChange={(e) => setLegal({ ...legal, [key]: e.target.value })}
        placeholder={opts.placeholder}
        maxLength={opts.maxLength}
        className="input w-full"
        data-testid={`legal-${key}`}
      />
    </div>
  );

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2 section-card">
        <div className="section-title-clean">
          <IdentificationCard size={22} weight="duotone" className="text-[#4F46E5]" />
          <span>{t('customerLegalFields')}</span>
        </div>

        <div className="space-y-5">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-[#71717A] mb-2">
              {t('clientLabel')} <span className="text-[#DC2626]">*</span>
            </label>
            <WhiteSelect
              value={customerId}
              onChange={(v) => setCustomerId(v)}
              data-testid="legal-customer-select"
              placeholder={`— ${t('selectClient')} —`}
              options={[
                { value: '', label: `— ${t('selectClient')} —` },
                ...customers.map(c => ({
                  value: c.id,
                  label: `${(c.firstName || '') + ' ' + (c.lastName || '')} · ${c.email || c.phone || c.id}`,
                })),
              ]}
            />
            {customerId && (
              <button
                type="button"
                onClick={() => navigate(`/admin/customers/${customerId}/360`)}
                className="mt-1.5 text-[11px] text-[#4F46E5] hover:underline inline-flex items-center gap-1"
                data-testid="legal-open-customer-360"
              >
                → {t('lw_open_customer_360')}
              </button>
            )}
          </div>

          {customerId && (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {field('first_name', t('adm2_1b2b542aeb'), { placeholder: t('adm_ivan') })}
                {field('last_name',  t('adm2_db93f7d0fb'), { placeholder: t('adm_ivanov') })}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {field('egn',            t('adm2_10_106b2ae400'),  { maxLength: 10, placeholder: '9901011234' })}
                {field('national_id_no', t('adm2_d9063bb8cb'), { placeholder: t('adm_bg1234567') })}
              </div>
              {field('id_card_address', t('adm2_ecebe5fec5'), { placeholder: t('adm_sofia_str') })}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {field('id_card_issued_by',   t('adm2_82a99b398f'),      { placeholder: t('adm_ministry_of_interior_sofia') })}
                {field('id_card_issue_date',  t('adm2_7803e296c0'),     { type: 'date' })}
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  onClick={save}
                  disabled={saving}
                  className="btn-primary"
                  data-testid="legal-save-btn"
                >
                  <FloppyDisk size={18} weight="bold" />
                  {saving ? t('adm2_73dba4fd6c') : t('adm2_74ea58b6a8')}
                </button>
                <button
                  onClick={() => load(customerId)}
                  className="btn-secondary"
                >
                  {t('adm_reset_2')}
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="section-card">
        <div className="section-title-clean">
          <ShieldCheck size={22} weight="duotone" className="text-[#059669]" />
          <span>{t('depositReadiness')}</span>
        </div>

        {!customerId && (
          <p className="text-sm text-[#71717A]">{t('selectClientForStatus')}</p>
        )}

        {customerId && validation && (
          <div className="space-y-4">
            {validation.ready_for_deposit_contract ? (
              <div className="bg-[#D1FAE5] border border-[#059669]/30 rounded-xl p-4">
                <div className="flex items-center gap-2 text-[#059669] font-semibold">
                  <CheckCircle size={22} weight="fill" />
                  {t('adm_all_fields_filled')}
                </div>
                <p className="text-sm text-[#047857] mt-2">
                  {t('adm_it_is_possible_to_create_a_deposit_agreement')}
                </p>
              </div>
            ) : (
              <div className="bg-[#FEF3C7] border border-[#D97706]/30 rounded-xl p-4">
                <div className="flex items-center gap-2 text-[#D97706] font-semibold">
                  <Warning size={22} weight="fill" />
                  {t('adm_missing_fields')}
                </div>
                <ul className="text-sm text-[#92400E] mt-2 list-disc pl-5 space-y-1">
                  {validation.missing_fields.map(f => <li key={f}>{f}</li>)}
                </ul>
              </div>
            )}
            <div className="text-xs text-[#71717A] bg-[#F9FAFB] rounded-lg p-3">
              <p className="font-semibold mb-1 text-[#18181B]">{t('adm_rule')}</p>
              {t('r9_without_all_7_legal_api')}{' '}
              <code className="bg-white px-1.5 py-0.5 rounded border border-[#E4E4E7]">
                POST /api/contracts2 type=deposit
              </code>{' '}
              {t('r9_will_return')}<b>422</b>.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ════════════════════════ P0.2 TAB ═══════════════════════════════
function DealPipelineTab({ deals, customers = [], catalog, onRefresh }) {
  const { t, lang } = useLang();
  const navigate = useNavigate();
  const [dealId, setDealId] = useState('');
  const [selected, setSelected] = useState(null);
  const [advancing, setAdvancing] = useState(false);
  // Wave 5 — Create Deal modal (closes the gap: until now deals could only
  // be created via raw API).
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newDeal, setNewDeal] = useState({ title: '', vin: '', customerId: '' });
  const [creatingDeal, setCreatingDeal] = useState(false);
  // P1.3 auction_won state
  const [showWonModal, setShowWonModal] = useState(false);
  const [wonForm, setWonForm] = useState({
    price_usd: '', auction: 'Copart', lot_number: '',
    auction_fee_eur: '', delivery_eur: '', service_fee_eur: '', fx_usd_to_eur: '',
    note: '',
  });
  const [wonSubmitting, setWonSubmitting] = useState(false);
  const [wonResult, setWonResult] = useState(null);

  useEffect(() => {
    if (!dealId) { setSelected(null); return; }
    const d = deals.find(x => x.id === dealId);
    setSelected(d || null);
  }, [dealId, deals]);

  const stages = catalog?.deal_stages || [];
  const groups = catalog?.deal_stage_groups || [];
  const forwardMap = catalog?.deal_stage_forward || {};
  const auctionDefaults = catalog?.auction_defaults || {};
  const stagesAllowingWin = auctionDefaults.stages_allowing_auction_won
    || ['searching_at_auction', 'auction_lost', 'deposit_paid'];
  const currentStage = selected?.stage || selected?.status || 'lead';
  const allowedTargets = forwardMap[currentStage] || [];
  const currentGroup = groups.find(g => g.stages.includes(currentStage))?.id;
  const canMarkAsWon = !!selected && stagesAllowingWin.includes(currentStage);

  const advance = async (target) => {
    if (!selected) return;
    setAdvancing(true);
    try {
      await axios.post(`${API_URL}/api/deals/${selected.id}/advance`, { to: target });
      toast.success(`${t('r9_deal_moved_to')}${STAGE_LABELS[target] || target}`);
      await onRefresh();
      setDealId(selected.id);
    } catch (e) {
      toast.error(e?.response?.data?.detail || t('adm2_3044da855d'));
    } finally {
      setAdvancing(false);
    }
  };

  const openWonModal = () => {
    setWonForm({
      price_usd: '', auction: 'Copart', lot_number: '',
      auction_fee_eur: '', delivery_eur: '', service_fee_eur: '', fx_usd_to_eur: '',
      note: '',
    });
    setWonResult(null);
    setShowWonModal(true);
  };

  const submitAuctionWon = async () => {
    if (!selected) return;
    const priceNum = parseFloat(wonForm.price_usd);
    if (!priceNum || priceNum <= 0) {
      toast.error(t('adm2_hammer_price_usd_3f8a044b74'));
      return;
    }
    if (!wonForm.auction.trim()) {
      toast.error(t('adm_enter_auction_name'));
      return;
    }
    setWonSubmitting(true);
    try {
      const payload = {
        price_usd: priceNum,
        auction: wonForm.auction.trim(),
      };
      if (wonForm.lot_number.trim()) payload.lot_number = wonForm.lot_number.trim();
      if (wonForm.auction_fee_eur) payload.auction_fee_eur = parseFloat(wonForm.auction_fee_eur);
      if (wonForm.delivery_eur) payload.delivery_eur = parseFloat(wonForm.delivery_eur);
      if (wonForm.service_fee_eur) payload.service_fee_eur = parseFloat(wonForm.service_fee_eur);
      if (wonForm.fx_usd_to_eur) payload.fx_usd_to_eur = parseFloat(wonForm.fx_usd_to_eur);
      if (wonForm.note.trim()) payload.note = wonForm.note.trim();

      const r = await axios.post(
        `${API_URL}/api/legal/deals/${selected.id}/auction/won`,
        payload,
      );
      setWonResult(r.data);
      if (r.data.idempotent) {
        toast.info(t('adm_deal_is_already_marked_as_auction_won_artifacts_re'));
      } else {
        toast.success(
          `🎉 auction_won! Contract ${r.data.contract.id.slice(0, 16)}…, ` +
          `invoice ${r.data.invoice.id.slice(0, 16)}… (€${r.data.total_eur.toLocaleString()})`
        );
      }
      await onRefresh();
      setDealId(selected.id);
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'auction_won failed');
    } finally {
      setWonSubmitting(false);
    }
  };

  // Wave 5 — Create Deal handler
  const createDeal = async () => {
    if (!newDeal.customerId) {
      toast.error(t('lw_deal_customer_label'));
      return;
    }
    if (!newDeal.title.trim()) {
      toast.error(t('lw_deal_title_label'));
      return;
    }
    setCreatingDeal(true);
    try {
      const payload = {
        title: newDeal.title.trim(),
        customerId: newDeal.customerId,
        stage: 'lead',
        status: 'lead',
      };
      if (newDeal.vin.trim()) payload.vin = newDeal.vin.trim().toUpperCase();
      const r = await axios.post(`${API_URL}/api/deals`, payload);
      const created = r.data?.deal || r.data?.data || r.data;
      const createdId = created?.id || created?._id;
      toast.success(t('lw_deal_create_success') || 'Deal created');
      setShowCreateModal(false);
      setNewDeal({ title: '', vin: '', customerId: '' });
      await onRefresh();
      if (createdId) {
        setDealId(createdId);
      }
    } catch (e) {
      toast.error(
        e?.response?.data?.detail
          || e?.response?.data?.message
          || t('lw_deal_create_failed')
          || 'Failed to create deal'
      );
    } finally {
      setCreatingDeal(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="section-card">
        <div className="section-title-clean flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ArrowsClockwise size={22} weight="duotone" className="text-[#4F46E5]" />
            <span>{t('adm_deal_selection')}</span>
          </div>
          <button
            type="button"
            onClick={() => setShowCreateModal(true)}
            className="inline-flex items-center gap-1.5 text-xs font-semibold bg-[#4F46E5] text-white px-3 py-1.5 rounded-lg hover:bg-[#4338CA] transition-colors"
            data-testid="create-deal-btn"
            title={t('lw_create_deal_btn')}
          >
            + {t('lw_create_deal_btn')}
          </button>
        </div>
        <label className="block text-xs font-semibold uppercase tracking-wider text-[#71717A] mb-2">
          {t('adm_deal_2')}
        </label>
        <WhiteSelect
          value={dealId}
          onChange={(v) => setDealId(v)}
          data-testid="pipeline-deal-select"
          placeholder={`— ${t('selectDeal')} —`}
          options={[
            { value: '', label: `— ${t('selectDeal')} —` },
            ...deals.map(d => ({
              value: d.id,
              label: `${d.title || d.vin || d.id} · ${STAGE_LABELS[d.stage || d.status] || (d.stage || d.status)}`,
            })),
          ]}
        />

        {selected && (
          <div className="mt-5 space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-[#71717A]">ID</span>
              <span className="font-mono text-xs">{selected.id}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#71717A]">VIN</span>
              <span className="font-mono text-xs">{selected.vin || '—'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#71717A]">{t('lw_max_bid_label')}</span>
              <span className="font-semibold">${(selected.max_bid_usd || 0).toLocaleString()}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#71717A]">Deposit contract</span>
              <span className="font-mono text-xs">{selected.deposit_contract_id || '—'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#71717A]">Final contract</span>
              <span className="font-mono text-xs">{selected.final_contract_id || '—'}</span>
            </div>
            {selected.customerId && (
              <button
                type="button"
                onClick={() => navigate(`/admin/customers/${selected.customerId}/360`)}
                className="mt-2 text-[11px] text-[#4F46E5] hover:underline inline-flex items-center gap-1"
                data-testid="pipeline-open-customer-360"
              >
                → {t('lw_open_customer_360')}
              </button>
            )}
            {/* Wave 6 — link to operations-centric deal workspace */}
            <button
              type="button"
              onClick={() => navigate(`/admin/deals/${selected.id}`)}
              className="mt-1 text-[11px] text-[#B45309] hover:underline inline-flex items-center gap-1 font-semibold"
              data-testid="pipeline-open-deal-workspace"
            >
              → Open deal workspace (Wave 6)
            </button>
          </div>
        )}
      </div>

      <div className="lg:col-span-2 section-card">
        <div className="section-title-clean">
          <ArrowRight size={22} weight="duotone" className="text-[#059669]" />
          <span>{t('adm2_pipeline_20_19da9a0d96')}</span>
        </div>

        {!selected && (
          <p className="text-sm text-[#71717A]">{t('selectDealLeft')}</p>
        )}

        {selected && (
          <>
            {/* 8 macro groups overview */}
            {groups.length > 0 && (
              <div className="mb-5">
                <div className="text-xs uppercase tracking-wider text-[#71717A] mb-2">
                  {t('adm3_b723a68124')}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {groups.map((g, idx) => {
                    const isCur = g.id === currentGroup;
                    const curIdx = groups.findIndex(x => x.id === currentGroup);
                    const isPast = curIdx >= 0 && idx < curIdx;
                    return (
                      <div key={g.id} className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold ${
                        isCur ? 'bg-[#4F46E5] text-white' :
                        isPast ? 'bg-[#D1FAE5] text-[#059669]' :
                        'bg-[#F4F4F5] text-[#71717A]'
                      }`} data-testid={`macro-group-${g.id}`}>
                        <span className="text-[10px] opacity-70">{idx + 1}.</span>
                        {(g.labels && g.labels[lang]) || g.label}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="text-xs uppercase tracking-wider text-[#71717A] mb-2">
              {t('adm3_619f0e009f')}
            </div>
            <div className="flex flex-wrap gap-2 mb-6">
              {stages.map(s => {
                const isCur = s === currentStage;
                const isPast = stages.indexOf(s) < stages.indexOf(currentStage);
                return (
                  <span
                    key={s}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium ${
                      isCur ? 'bg-[#4F46E5] text-white' :
                      isPast ? 'bg-[#D1FAE5] text-[#059669]' :
                      'bg-[#F4F4F5] text-[#71717A]'
                    }`}
                  >
                    {STAGE_LABELS[s] || s}
                  </span>
                );
              })}
            </div>

            <div className="bg-[#F9FAFB] rounded-xl p-4 mb-4">
              <div className="text-xs uppercase tracking-wider text-[#71717A] mb-1">{t('adm_current_stage_2')}</div>
              <div className="text-lg font-bold text-[#18181B]">
                {STAGE_LABELS[currentStage] || currentStage}
              </div>
            </div>

            <div>
              <div className="text-xs uppercase tracking-wider text-[#71717A] mb-2">
                {t('adm_allowed_transitions')}
              </div>
              {allowedTargets.length === 0 ? (
                <p className="text-sm text-[#71717A]">{t('finalStageNoTransitions')}</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {allowedTargets.map(t => (
                    <button
                      key={t}
                      onClick={() => advance(t)}
                      disabled={advancing}
                      data-testid={`advance-to-${t}`}
                      className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2
                        ${t === 'cancelled'
                          ? 'bg-[#FEE2E2] hover:bg-[#FCA5A5] text-[#DC2626]'
                          : 'bg-[#4F46E5] hover:bg-[#4338CA] text-white'}`}
                    >
                      <ArrowRight size={14} weight="bold" />
                      {STAGE_LABELS[t] || t}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* P1.3 — auction_won big button */}
            {canMarkAsWon && (
              <div className="mt-6 p-4 rounded-xl border-2 border-dashed border-[#F59E0B] bg-gradient-to-br from-[#FFFBEB] to-[#FEF3C7]">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-full bg-[#F59E0B] flex items-center justify-center flex-shrink-0">
                      <Trophy size={22} weight="fill" className="text-white" />
                    </div>
                    <div>
                      <div className="text-sm font-bold text-[#92400E]">
                        {t('adm_auction_event_mark_as_won')}
                      </div>
                      <div className="text-xs text-[#92400E] opacity-80 mt-1">
                        {t('adm3_d94f1ac0ed')}
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={openWonModal}
                    data-testid="btn-mark-as-won"
                    className="px-5 py-2.5 rounded-lg bg-[#F59E0B] hover:bg-[#D97706] text-white text-sm font-bold flex items-center gap-2 shadow-md transition-colors"
                  >
                    <Trophy size={16} weight="fill" />{t('markAsWon')}</button>
                </div>
              </div>
            )}

            {selected.stage_history && selected.stage_history.length > 0 && (
              <div className="mt-6">
                <div className="text-xs uppercase tracking-wider text-[#71717A] mb-2">
                  {t('adm_transition_history')}
                </div>
                <div className="space-y-2 max-h-60 overflow-auto">
                  {[...selected.stage_history].reverse().slice(0, 20).map((h, i) => (
                    <div key={i} className="text-xs bg-[#F9FAFB] rounded-lg p-2 flex items-center gap-2">
                      <span className="text-[#71717A]">{h.at && new Date(h.at).toLocaleString()}</span>
                      <span className="font-mono">{h.from || '—'} → <b>{h.to}</b></span>
                      <span className="text-[#71717A]">· {h.by}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* P1.3 — auction_won modal */}
      {showWonModal && selected && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
          onClick={() => !wonSubmitting && setShowWonModal(false)}
          data-testid="auction-won-modal"
        >
          <div
            className="bg-white rounded-2xl max-w-2xl w-full max-h-[92vh] overflow-auto shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6 border-b border-[#E4E4E7] flex items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-full bg-[#F59E0B] flex items-center justify-center flex-shrink-0">
                  <Trophy size={22} weight="fill" className="text-white" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-[#18181B]">{t('markAsWon')}</h3>
                  <p className="text-sm text-[#71717A] mt-0.5">
                    {t('adm_deal')} <span className="font-mono">{selected.id}</span> ·
                    {' '}{STAGE_LABELS[currentStage] || currentStage}
                  </p>
                </div>
              </div>
              <button
                onClick={() => !wonSubmitting && setShowWonModal(false)}
                className="p-1 rounded-lg hover:bg-[#F4F4F5]"
                data-testid="auction-won-close"
              >
                <IconX size={20} className="text-[#71717A]" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              {!wonResult && (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wider text-[#71717A] mb-1.5">
                        {t('adm_hammer_price_usd')}
                      </label>
                      <input
                        type="number"
                        step="1"
                        value={wonForm.price_usd}
                        onChange={(e) => setWonForm(s => ({ ...s, price_usd: e.target.value }))}
                        className="input w-full"
                        placeholder="15000"
                        data-testid="won-price-usd"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wider text-[#71717A] mb-1.5">
                        {t('adm_auction')}
                      </label>
                      <WhiteSelect
                        value={wonForm.auction}
                        onChange={(v) => setWonForm(s => ({ ...s, auction: v }))}
                        data-testid="won-auction"
                        options={[
                          { value: 'Copart', label: t('adm_copart') },
                          { value: 'IAA', label: 'IAA' },
                          { value: 'Manheim', label: t('adm_manheim') },
                          { value: 'ADESA', label: 'ADESA' },
                          { value: 'Other', label: t('docOther') },
                        ]}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wider text-[#71717A] mb-1.5">
                        {t('lotNumber')}
                      </label>
                      <input
                        type="text"
                        value={wonForm.lot_number}
                        onChange={(e) => setWonForm(s => ({ ...s, lot_number: e.target.value }))}
                        className="input w-full"
                        placeholder={t('adm_lot12345')}
                        data-testid="won-lot"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wider text-[#71717A] mb-1.5">
                        {t('adm_fx_usdeur')}
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        value={wonForm.fx_usd_to_eur}
                        onChange={(e) => setWonForm(s => ({ ...s, fx_usd_to_eur: e.target.value }))}
                        className="input w-full"
                        placeholder={String(auctionDefaults.default_fx_usd_to_eur || 0.92)}
                        data-testid="won-fx"
                      />
                    </div>
                  </div>

                  <div className="border-t border-[#E4E4E7] pt-4">
                    <div className="text-xs uppercase tracking-wider text-[#71717A] mb-3">
                      {t('adm3_d9c11612de')}
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div>
                        <label className="block text-xs text-[#71717A] mb-1.5">
                          {t('auctionFeeEur')}
                        </label>
                        <input
                          type="number"
                          step="1"
                          value={wonForm.auction_fee_eur}
                          onChange={(e) => setWonForm(s => ({ ...s, auction_fee_eur: e.target.value }))}
                          className="input w-full"
                          placeholder={String(auctionDefaults.auction_fee_eur || 500)}
                          data-testid="won-auction-fee"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-[#71717A] mb-1.5">
                          {t('adm_delivery_rotterdam_eur')}
                        </label>
                        <input
                          type="number"
                          step="1"
                          value={wonForm.delivery_eur}
                          onChange={(e) => setWonForm(s => ({ ...s, delivery_eur: e.target.value }))}
                          className="input w-full"
                          placeholder={String(auctionDefaults.delivery_to_rotterdam_eur || 800)}
                          data-testid="won-delivery"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-[#71717A] mb-1.5">
                          {t('serviceFeeEur')}
                        </label>
                        <input
                          type="number"
                          step="1"
                          value={wonForm.service_fee_eur}
                          onChange={(e) => setWonForm(s => ({ ...s, service_fee_eur: e.target.value }))}
                          className="input w-full"
                          placeholder={String(auctionDefaults.service_fee_eur || 1000)}
                          data-testid="won-service-fee"
                        />
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-[#71717A] mb-1.5">
                      {t('adm_note_2')}
                    </label>
                    <textarea
                      rows={2}
                      value={wonForm.note}
                      onChange={(e) => setWonForm(s => ({ ...s, note: e.target.value }))}
                      className="input w-full"
                      placeholder={t('adm_any_comment_for_history')}
                      data-testid="won-note"
                    />
                  </div>

                  <div className="bg-[#F0F9FF] border border-[#BAE6FD] rounded-lg p-3 text-xs text-[#0C4A6E] flex gap-2">
                    <Info size={16} weight="duotone" className="flex-shrink-0 mt-0.5" />
                    <div>
                      <b>{t('adm_what_will_happen')}</b> {t('adm3_a7753cfb6f')} <b>draft</b>; invoice <b>after_win_package</b>
                      {t('adm_will_be_created_in_status')} <b>pending</b>{t('adm3_567938d94c')}
                    </div>
                  </div>
                </>
              )}

              {wonResult && (
                <div className="space-y-4">
                  <div className="p-4 rounded-xl bg-[#D1FAE5] border border-[#10B981] flex items-start gap-3">
                    <CheckCircle size={22} weight="fill" className="text-[#059669] flex-shrink-0 mt-0.5" />
                    <div>
                      <div className="font-bold text-[#065F46]">
                        {wonResult.idempotent ? t('adm2_auction_won_ee4262657e') : t('adm2_auction_won_bcc90ae6bc')}
                      </div>
                      <div className="text-sm text-[#065F46] opacity-90 mt-1">
                        {t('adm_total_2')} <b>€{wonResult.total_eur?.toLocaleString()}</b>
                      </div>
                    </div>
                  </div>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between p-3 bg-[#F9FAFB] rounded-lg">
                      <span className="text-[#71717A]">{t('finalContract')}</span>
                      <span className="font-mono text-xs">{wonResult.contract?.id}</span>
                    </div>
                    <div className="flex justify-between p-3 bg-[#F9FAFB] rounded-lg">
                      <span className="text-[#71717A]">Invoice (after_win_package)</span>
                      <span className="font-mono text-xs">{wonResult.invoice?.id}</span>
                    </div>
                    <div className="flex justify-between p-3 bg-[#F9FAFB] rounded-lg">
                      <span className="text-[#71717A]">{t('createdNowQuestion')}</span>
                      <span className="font-medium">
                        contract: {wonResult.contract_created ? 'YES' : 'no (existing)'} ·
                        {' '}invoice: {wonResult.invoice_created ? 'YES' : 'no (existing)'}
                      </span>
                    </div>
                  </div>
                  <div className="border border-[#E4E4E7] rounded-xl overflow-hidden">
                    <div className="px-4 py-2 bg-[#F4F4F5] text-xs font-semibold uppercase tracking-wider text-[#71717A]">
                      {t('invoiceItems')}
                    </div>
                    <table className="w-full text-sm">
                      <tbody>
                        {(wonResult.items || []).map((it, idx) => (
                          <tr key={idx} className="border-t border-[#E4E4E7]">
                            <td className="px-4 py-2">{it.name}</td>
                            <td className={`px-4 py-2 text-right font-mono ${
                              it.amount < 0 ? 'text-[#059669]' : 'text-[#18181B]'
                            }`}>
                              {it.amount < 0 ? '−' : ''}€{Math.abs(it.amount).toLocaleString()}
                            </td>
                          </tr>
                        ))}
                        <tr className="border-t-2 border-[#18181B] bg-[#F9FAFB]">
                          <td className="px-4 py-2 font-bold">{t('totalCount')}</td>
                          <td className="px-4 py-2 text-right font-mono font-bold">
                            €{wonResult.total_eur?.toLocaleString()}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>

            <div className="p-6 border-t border-[#E4E4E7] flex justify-end gap-2">
              {!wonResult && (
                <>
                  <button
                    onClick={() => setShowWonModal(false)}
                    disabled={wonSubmitting}
                    className="px-4 py-2 rounded-lg text-sm font-medium border border-[#E4E4E7] hover:bg-[#F4F4F5]"
                    data-testid="won-cancel"
                  >
                    {t('adm_cancel_2')}
                  </button>
                  <button
                    onClick={submitAuctionWon}
                    disabled={wonSubmitting}
                    className="px-5 py-2 rounded-lg bg-[#F59E0B] hover:bg-[#D97706] text-white text-sm font-bold flex items-center gap-2 disabled:opacity-50"
                    data-testid="won-submit"
                  >
                    <Trophy size={16} weight="fill" />
                    {wonSubmitting ? t('adm2_b5e0b5f8ee') : t('adm2_8ceb03076f')}
                  </button>
                </>
              )}
              {wonResult && (
                <button
                  onClick={() => setShowWonModal(false)}
                  className="px-5 py-2 rounded-lg bg-[#4F46E5] hover:bg-[#4338CA] text-white text-sm font-bold"
                  data-testid="won-close"
                >{t('done')}</button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Wave 5 — Create Deal modal */}
      {showCreateModal && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 px-4"
          onClick={() => !creatingDeal && setShowCreateModal(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6"
            onClick={(e) => e.stopPropagation()}
            data-testid="create-deal-modal"
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-[#18181B]">{t('lw_create_deal_title')}</h3>
              <button
                type="button"
                onClick={() => !creatingDeal && setShowCreateModal(false)}
                className="text-[#71717A] hover:text-[#18181B] text-xl leading-none"
              >×</button>
            </div>
            <div className="space-y-4">
              <div>
                <LabelWithTip
                  label={t('lw_deal_title_label')}
                  hint={t('lw_deal_title_hint')}
                  required
                />
                <input
                  type="text"
                  value={newDeal.title}
                  onChange={(e) => setNewDeal({ ...newDeal, title: e.target.value })}
                  className="input w-full"
                  placeholder="BMW X5 2021 → Иванов"
                  data-testid="create-deal-title"
                />
              </div>
              <div>
                <LabelWithTip
                  label={t('lw_deal_customer_label')}
                  hint={t('lw_deal_customer_hint')}
                  required
                />
                <WhiteSelect
                  value={newDeal.customerId}
                  onChange={(v) => setNewDeal({ ...newDeal, customerId: v })}
                  data-testid="create-deal-customer"
                  placeholder={`— ${t('selectShort')} —`}
                  options={[
                    { value: '', label: `— ${t('selectShort')} —` },
                    ...customers.map((c) => ({
                      value: c.id,
                      label: `${(c.firstName || '') + ' ' + (c.lastName || '')} · ${c.email || c.phone || c.id}`,
                    })),
                  ]}
                />
              </div>
              <div>
                <LabelWithTip
                  label={t('lw_deal_vin_label')}
                  hint={t('lw_deal_vin_hint')}
                />
                <input
                  type="text"
                  value={newDeal.vin}
                  onChange={(e) => setNewDeal({ ...newDeal, vin: e.target.value })}
                  className="input w-full font-mono"
                  placeholder="WBAFG8C56DCY12345"
                  maxLength={17}
                  data-testid="create-deal-vin"
                />
              </div>
              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  disabled={creatingDeal}
                  className="flex-1 px-4 py-2.5 rounded-lg border border-[#E4E4E7] text-[#71717A] font-semibold hover:bg-[#F4F4F5]"
                >
                  {t('cancel') || 'Cancel'}
                </button>
                <button
                  type="button"
                  onClick={createDeal}
                  disabled={creatingDeal || !newDeal.title.trim() || !newDeal.customerId}
                  className="flex-1 px-4 py-2.5 rounded-lg bg-[#4F46E5] hover:bg-[#4338CA] disabled:bg-[#A5B4FC] text-white font-bold"
                  data-testid="create-deal-submit"
                >
                  {creatingDeal ? '…' : t('lw_deal_create_submit')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ════════════════════════ P0.3 TAB ═══════════════════════════════
function DepositV2Tab({ customers, deals, catalog }) {
  const { t } = useLang();
  const navigate = useNavigate();
  const [customerId, setCustomerId] = useState('');
  const [dealId, setDealId] = useState('');
  const [maxBidUsd, setMaxBidUsd] = useState(0);
  const [fxRate, setFxRate] = useState('');
  const [paidAmount, setPaidAmount] = useState(0);
  const [calc, setCalc] = useState(null);
  const [note, setNote] = useState('');
  const [deposits, setDeposits] = useState([]);
  const [creating, setCreating] = useState(false);
  // Wave 5 — next-step nudge: surfaces "what to do now" right after creation
  const [lastCreated, setLastCreated] = useState(null);

  const rules = catalog?.deposit_rules || {};
  const defaultFx = rules.default_fx_usd_to_eur || 0.92;

  const doCalc = useCallback(async (bid, fx) => {
    if (!bid || bid <= 0) { setCalc(null); return; }
    try {
      const r = await axios.post(`${API_URL}/api/legal/deposit/calculate`, {
        max_bid_usd: Number(bid),
        ...(fx ? { fx_rate_usd_to_eur: Number(fx) } : {}),
      });
      setCalc(r.data);
    } catch (e) {
      setCalc(null);
    }
  }, []);

  useEffect(() => { doCalc(maxBidUsd, fxRate); }, [maxBidUsd, fxRate, doCalc]);

  const loadDeposits = useCallback(async () => {
    if (!customerId) { setDeposits([]); return; }
    try {
      // list by fetching individually: we don't have a list endpoint by customer,
      // but we can query /api/deposits (legacy) and /api/legal/deposits via history.
      // Simpler: fetch customer 360 which includes legal_deposits… but that's legacy.
      // For now, query each known deposit_id stored in the customer doc (if any),
      // otherwise show empty list hint.
      // Fallback: use legacy /api/deposits and filter client-side.
      const r = await axios.get(`${API_URL}/api/deposits?customerId=${customerId}`);
      setDeposits(r.data?.data || []);
    } catch {
      setDeposits([]);
    }
  }, [customerId]);

  useEffect(() => { loadDeposits(); }, [loadDeposits]);

  const create = async () => {
    if (!customerId) return toast.error(t('pleaseSelectClient'));
    if (!maxBidUsd || maxBidUsd <= 0) return toast.error(t('adm_specify_max_bid_usd'));
    setCreating(true);
    try {
      const payload = {
        customer_id: customerId,
        deal_id: dealId || null,
        max_bid_usd: Number(maxBidUsd),
        paid_amount_eur: Number(paidAmount) || 0,
        note: note || null,
        ...(fxRate ? { fx_rate_usd_to_eur: Number(fxRate) } : {}),
      };
      const r = await axios.post(`${API_URL}/api/legal/deposits`, payload);
      toast.success(`${t('r9_deposit_created')}(${r.data.deposit.id})`);
      setLastCreated(r.data.deposit);
      setMaxBidUsd(0); setFxRate(''); setPaidAmount(0); setNote('');
      loadDeposits();
    } catch (e) {
      toast.error(e?.response?.data?.detail || t('adm2_f1de201a04'));
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* LEFT: Create + Calculator */}
      <div className="space-y-6">
        <div className="section-card">
          <div className="section-title-clean">
            <Coins size={22} weight="duotone" className="text-[#D97706]" />
            <span>{t('adm_mandatory_deposit_calculator')}</span>
          </div>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <LabelWithTip
                  label={t('lw_max_bid_label')}
                  hint={t('lw_max_bid_hint')}
                  example={t('lw_max_bid_example')}
                />
                <div className="relative">
                  <input
                    type="number"
                    value={maxBidUsd}
                    onChange={(e) => setMaxBidUsd(parseFloat(e.target.value) || 0)}
                    className="input w-full pr-16"
                    placeholder="35000"
                    data-testid="dep-max-bid"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] font-semibold text-[#A1A1AA] pointer-events-none select-none">USD</span>
                </div>
              </div>
              <div>
                <LabelWithTip
                  label={t('lw_fx_label')}
                  hint={t('lw_fx_hint')}
                  example={t('lw_fx_example')}
                />
                <div className="relative">
                  <input
                    type="number"
                    step="0.001"
                    value={fxRate}
                    onChange={(e) => setFxRate(e.target.value)}
                    placeholder={String(defaultFx)}
                    className="input w-full pr-16"
                    data-testid="dep-fx-rate"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] font-semibold text-[#A1A1AA] pointer-events-none select-none">USD→EUR</span>
                </div>
              </div>
            </div>
            {calc && (
              <div className="bg-gradient-to-br from-[#FEF3C7] to-[#FDE68A] rounded-xl p-5 border border-[#D97706]/30">
                <div className="text-xs uppercase tracking-wider text-[#92400E] mb-1 flex items-center gap-1.5">
                  {t('lw_required_eur_label')}
                </div>
                <div className="text-3xl font-bold text-[#78350F]">
                  € {Number(calc.required_amount_eur).toLocaleString('de-DE', { minimumFractionDigits: 2 })}
                </div>
                <div className="mt-3 text-[11px] text-[#78350F] space-y-0.5 leading-relaxed">
                  <div>{t('lw_required_eur_hint')}</div>
                </div>
              </div>
            )}
            <div className="text-xs text-[#71717A] bg-[#F9FAFB] rounded-lg p-3 flex gap-2">
              <Info size={16} className="flex-shrink-0 mt-0.5" />
              <div>
                {t('adm_rule_if')} <b>{t('lw_max_bid_label')} &gt; ${rules.pct_threshold_usd}</b>,
                required = max(<b>€{rules.min_eur}</b>, {Math.round((rules.pct || 0) * 100)}% × bid × fx).
                {t('r9_otherwise_always_min')}<b>€{rules.min_eur}</b>.
              </div>
            </div>
          </div>
        </div>

        <div className="section-card">
          <div className="section-title-clean">
            <FloppyDisk size={22} weight="duotone" className="text-[#4F46E5]" />
            <span>{t('adm_create_deposit')}</span>
          </div>
          <div className="space-y-4">
            <div>
              <LabelWithTip
                label={t('adm_customer')}
                hint={t('lw_deal_customer_hint')}
                required
              />
              <WhiteSelect
                value={customerId}
                onChange={(v) => setCustomerId(v)}
                data-testid="dep-customer"
                placeholder={`— ${t('selectShort')} —`}
                options={[
                  { value: '', label: `— ${t('selectShort')} —` },
                  ...customers.map(c => ({
                    value: c.id,
                    label: `${(c.firstName || '') + ' ' + (c.lastName || '')} · ${c.email || c.phone || c.id}`,
                  })),
                ]}
              />
              {customerId && (
                <button
                  type="button"
                  onClick={() => navigate(`/admin/customers/${customerId}/360`)}
                  className="mt-1.5 text-[11px] text-[#4F46E5] hover:underline inline-flex items-center gap-1"
                  data-testid="dep-open-customer-360"
                >
                  → {t('lw_open_customer_360')}
                </button>
              )}
            </div>
            <div>
              <LabelWithTip
                label={t('lw_deal_label')}
                hint={t('lw_deal_hint')}
              />
              <WhiteSelect
                value={dealId}
                onChange={(v) => setDealId(v)}
                data-testid="dep-deal"
                placeholder={t('adm_do_not_bind')}
                options={[
                  { value: '', label: t('adm_do_not_bind') },
                  ...deals
                    .filter(d => !customerId || d.customerId === customerId)
                    .map(d => ({ value: d.id, label: d.title || d.vin || d.id })),
                ]}
              />
            </div>
            <div>
              <LabelWithTip
                label={t('lw_paid_eur_label')}
                hint={t('lw_paid_eur_hint')}
              />
              <input type="number" value={paidAmount}
                     onChange={(e) => setPaidAmount(parseFloat(e.target.value) || 0)}
                     className="input w-full" data-testid="dep-paid-amount"
                     placeholder="0" />
            </div>
            <div>
              <LabelWithTip
                label={t('lw_note_label')}
                hint={t('lw_note_hint')}
              />
              <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2}
                        className="input w-full resize-none" data-testid="dep-note" />
            </div>
            <button onClick={create} disabled={creating || !customerId || !maxBidUsd}
                    className="btn-primary w-full" data-testid="dep-create-btn">
              <Coins size={18} weight="bold" />
              {creating ? t('adm2_2c13e01c21') : t('adm2_76dffbfc65')}
            </button>

            {/* Wave 5 — Next-step nudge */}
            {lastCreated && (
              <div className="rounded-xl bg-[#ECFDF5] border border-[#10B981]/40 p-4 text-[#065F46]" data-testid="dep-next-step">
                <div className="flex items-start gap-2.5">
                  <CheckCircle size={20} weight="fill" className="text-[#059669] flex-shrink-0 mt-0.5" />
                  <div className="flex-1 text-sm">
                    <div className="font-semibold mb-1">{t('lw_next_step_title')}</div>
                    <div className="text-[12.5px] leading-relaxed">{t('lw_next_step_pending')}</div>
                    <div className="mt-2.5 flex flex-wrap gap-2">
                      {customerId && (
                        <button
                          type="button"
                          onClick={() => navigate(`/admin/customers/${customerId}/360`)}
                          className="text-[11px] bg-white border border-[#10B981]/40 text-[#065F46] px-2.5 py-1.5 rounded-lg hover:bg-[#D1FAE5] transition-colors"
                        >
                          → {t('lw_open_customer_360')}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setLastCreated(null)}
                        className="text-[11px] text-[#065F46]/70 hover:text-[#065F46] px-2 py-1.5"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* RIGHT: Existing deposits + actions */}
      <div className="section-card">
        <div className="section-title-clean">
          <ShieldCheck size={22} weight="duotone" className="text-[#059669]" />
          <span>{t('customerDeposits')}</span>
        </div>
        {!customerId && (
          <p className="text-sm text-[#71717A]">
            {t('selectClientForDeposits')}
          </p>
        )}
        {customerId && (
          <DepositsListForCustomer customerId={customerId} />
        )}
      </div>
    </div>
  );
}

function DepositsListForCustomer({ customerId }) {
  const { t } = useLang();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      // Try new /legal/deposits list by customer; backend exposes /legal/deposits/{id} only,
      // so we filter from customer 360 (if available) or from /api/deposits legacy.
      // For P0 we go via legacy endpoint since deposit IDs created via /legal/deposits also get
      // a dual-write; for safety we simply call the dedicated /api/deposits and filter.
      let r = null;
      try {
        r = await axios.get(`${API_URL}/api/customers/${customerId}/360`);
      } catch { r = null; }
      const arr = r?.data?.deposits || [];
      setItems(arr);
    } finally {
      setLoading(false);
    }
  }, [customerId]);

  useEffect(() => { reload(); }, [reload]);

  const confirm = async (id) => {
    try {
      await axios.put(`${API_URL}/api/legal/deposits/${id}/confirm-payment`, {});
      toast.success(t('adm_payment_confirmed_30day_timer_started'));
      reload();
    } catch (e) {
      toast.error(e?.response?.data?.detail || t('adm2_2d8655ffab'));
    }
  };
  const forfeitRequest = async (id) => {
    const reason = window.prompt(t('adm3_acfcbb16be'), 'client refused after win');
    if (!reason) return;
    try {
      await axios.post(`${API_URL}/api/legal/deposits/${id}/forfeit/request`, { reason });
      toast.success(t('adm_burn_requested_awaiting_team_lead'));
      reload();
    } catch (e) { toast.error(e?.response?.data?.detail || t('adm2_c6fd3c6a62')); }
  };
  const forfeitTeamLead = async (id) => {
    try {
      await axios.post(`${API_URL}/api/legal/deposits/${id}/forfeit/teamlead-approve`);
      toast.success(t('adm_team_lead_confirmed_waiting_for_admin'));
      reload();
    } catch (e) { toast.error(e?.response?.data?.detail || t('adm2_c6fd3c6a62')); }
  };
  const forfeitAdmin = async (id) => {
    if (!window.confirm(t('adm2_df5d20d090'))) return;
    try {
      await axios.post(`${API_URL}/api/legal/deposits/${id}/forfeit/admin-finalize`);
      toast.success(t('adm_deposit_forfeited'));
      reload();
    } catch (e) { toast.error(e?.response?.data?.detail || t('adm2_c6fd3c6a62')); }
  };
  // ─── P1.1 Refund actions ────────────────────────────────────────────
  const refundRequest = async (id) => {
    const reason = window.prompt(t('adm3_1c917e68b5'), 'client wants to cancel');
    if (!reason) return;
    try {
      await axios.post(`${API_URL}/api/legal/deposits/${id}/refund/request`, { reason });
      toast.success(t('adm_return_request_created_awaiting_admin'));
      reload();
    } catch (e) { toast.error(e?.response?.data?.detail || t('adm2_c6fd3c6a62')); }
  };
  const refundApprove = async (id) => {
    try {
      await axios.post(`${API_URL}/api/legal/deposits/${id}/refund/approve`, { note: '' });
      toast.success(t('adm_return_approved_can_execute'));
      reload();
    } catch (e) { toast.error(e?.response?.data?.detail || t('adm2_c6fd3c6a62')); }
  };
  const refundReject = async (id) => {
    const reason = window.prompt(t('adm3_62a2544af4'), '');
    if (!reason) return;
    try {
      await axios.post(`${API_URL}/api/legal/deposits/${id}/refund/reject`, { reason });
      toast.success(t('adm_return_rejected'));
      reload();
    } catch (e) { toast.error(e?.response?.data?.detail || t('adm2_c6fd3c6a62')); }
  };
  const refundExecute = async (id, isStripe) => {
    if (!window.confirm(isStripe
      ? t('adm2_stripe_refund_1778925480')
      : t('adm2_626052df79'))) return;
    const body = isStripe
      ? { method: 'stripe' }
      : { method: 'bank_manual',
          bank_proof_url: window.prompt(t('adm3_b8be5763b2'), '') || null };
    try {
      const r = await axios.post(`${API_URL}/api/legal/deposits/${id}/refund/execute`, body);
      toast.success(`${t('r9_refund_executed')}(${r.data.method})`);
      reload();
    } catch (e) { toast.error(e?.response?.data?.detail || t('adm2_c6fd3c6a62')); }
  };
  const runScanNow = async () => {
    try {
      const r = await axios.post(`${API_URL}/api/legal/refund/scan-now`);
      toast.success(`Cron: promoted=${r.data.promoted} checked=${r.data.checked}`);
      reload();
    } catch (e) { toast.error(e?.response?.data?.detail || t('adm2_admin_a8b0e917f9')); }
  };

  if (loading) return <p className="text-sm text-[#71717A]">{t('adm_loading_5')}</p>;
  if (!items.length) return (
    <div>
      <button onClick={runScanNow} data-testid="scan-refund-now"
              className="mb-3 text-xs bg-[#4F46E5] text-white px-3 py-1.5 rounded-lg flex items-center gap-1">
        <ArrowsClockwise size={14} weight="bold" /> Run refund cron now (admin)
      </button>
      <p className="text-sm text-[#71717A]">{t('clientHasNoDeposits')}</p>
    </div>
  );

  return (
    <div className="space-y-3 max-h-[640px] overflow-auto">
      <div className="flex justify-end">
        <button onClick={runScanNow} data-testid="scan-refund-now"
                className="text-xs bg-[#4F46E5] text-white px-3 py-1.5 rounded-lg flex items-center gap-1">
          <ArrowsClockwise size={14} weight="bold" /> {t('adm_run_refund_cron_now')}
        </button>
      </div>
      {items.map(d => {
        const isLegal = !!d.required_amount_eur;
        const status = d.status || 'pending';
        const color = DEPOSIT_STATUS_COLORS[status] || 'bg-[#F4F4F5] text-[#71717A]';
        return (
          <div key={d.id} className="border border-[#E4E4E7] rounded-xl p-4" data-testid={`deposit-item-${d.id}`}>
            <div className="flex items-start justify-between mb-2">
              <div>
                <div className="font-semibold text-[#18181B]">#{(d.id || '').slice(-10)}</div>
                <div className="text-xs text-[#71717A]">
                  {d.createdAt && new Date(d.createdAt).toLocaleString()}
                </div>
              </div>
              <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${color}`}>
                {status}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-sm mb-3">
              {isLegal ? (
                <>
                  <div><span className="text-[#71717A]">{t('adm_required_eur')}</span> <b>€{d.required_amount_eur}</b></div>
                  <div><span className="text-[#71717A]">{t('adm_paid_eur')}</span> <b>€{d.paid_amount_eur || 0}</b></div>
                  <div><span className="text-[#71717A]">max_bid:</span> <b>${d.max_bid_usd}</b></div>
                  <div><span className="text-[#71717A]">fx:</span> <b>{d.fx_rate_usd_to_eur}</b></div>
                </>
              ) : (
                <>
                  <div><span className="text-[#71717A]">amount:</span> <b>${d.amount || 0}</b></div>
                  <div><span className="text-[#71717A]">legacy</span></div>
                </>
              )}
            </div>
            {d.search_timer_deadline_at && (
              <div className="text-xs bg-[#E0E7FF] text-[#4F46E5] rounded-lg px-3 py-2 mb-3">
                {t('adm_30day_search_deadline')} <b>{new Date(d.search_timer_deadline_at).toLocaleString()}</b>
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              {isLegal && status === 'pending' && (
                <button onClick={() => confirm(d.id)}
                        data-testid={`confirm-dep-${d.id}`}
                        className="text-xs bg-[#059669] text-white px-3 py-1.5 rounded-lg flex items-center gap-1">
                  <CheckCircle size={14} weight="bold" /> {t('adm_confirm_payment')}
                </button>
              )}
              {isLegal && status === 'paid_confirmed' && (
                <>
                  <button onClick={() => refundRequest(d.id)}
                          data-testid={`refund-req-${d.id}`}
                          className="text-xs bg-[#E0E7FF] text-[#4F46E5] px-3 py-1.5 rounded-lg flex items-center gap-1">
                    <ArrowsClockwise size={14} weight="bold" /> {t('adm_voluntary_refund')}
                  </button>
                  <button onClick={() => forfeitRequest(d.id)}
                          data-testid={`forfeit-req-${d.id}`}
                          className="text-xs bg-[#FED7AA] text-[#C2410C] px-3 py-1.5 rounded-lg flex items-center gap-1">
                    <Fire size={14} weight="bold" /> {t('adm_request_forfeit')}
                  </button>
                </>
              )}
              {isLegal && (status === 'refund_pending_30d' || status === 'refund_pending_voluntary') && (
                <>
                  <button onClick={() => refundApprove(d.id)}
                          data-testid={`refund-approve-${d.id}`}
                          className="text-xs bg-[#BFDBFE] text-[#1D4ED8] px-3 py-1.5 rounded-lg flex items-center gap-1">
                    <CheckCircle size={14} weight="bold" /> {t('adm_approve_refund')}
                  </button>
                  <button onClick={() => refundReject(d.id)}
                          data-testid={`refund-reject-${d.id}`}
                          className="text-xs bg-[#FEE2E2] text-[#DC2626] px-3 py-1.5 rounded-lg flex items-center gap-1">
                    {t('rejectRefund')}
                  </button>
                </>
              )}
              {isLegal && status === 'refund_approved' && (
                <>
                  <button onClick={() => refundExecute(d.id, false)}
                          data-testid={`refund-exec-bank-${d.id}`}
                          className="text-xs bg-[#A7F3D0] text-[#065F46] px-3 py-1.5 rounded-lg flex items-center gap-1">
                    <CheckCircle size={14} weight="bold" /> Execute (bank manual)
                  </button>
                  <button onClick={() => refundExecute(d.id, true)}
                          data-testid={`refund-exec-stripe-${d.id}`}
                          className="text-xs bg-[#DDD6FE] text-[#5B21B6] px-3 py-1.5 rounded-lg flex items-center gap-1">
                    Execute (Stripe)
                  </button>
                </>
              )}
              {isLegal && status === 'forfeit_pending_teamlead' && (
                <button onClick={() => forfeitTeamLead(d.id)}
                        data-testid={`forfeit-tl-${d.id}`}
                        className="text-xs bg-[#FCA5A5] text-[#991B1B] px-3 py-1.5 rounded-lg flex items-center gap-1">
                  <ShieldCheck size={14} weight="bold" /> {t('adm_teamlead_approve')}
                </button>
              )}
              {isLegal && status === 'forfeit_pending_admin' && (
                <button onClick={() => forfeitAdmin(d.id)}
                        data-testid={`forfeit-admin-${d.id}`}
                        className="text-xs bg-[#1F2937] text-white px-3 py-1.5 rounded-lg flex items-center gap-1">
                  <Fire size={14} weight="fill" /> {t('adm_admin_finalize')}
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ════════════════════════ P0.4 TAB ═══════════════════════════════
function ContractV2Tab({ customers, deals, catalog }) {
  const { t } = useLang();
  const [customerId, setCustomerId] = useState('');
  const [dealId, setDealId] = useState('');
  const [type, setType] = useState('deposit');
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState([]);
  const [creating, setCreating] = useState(false);
  const [refresh, setRefresh] = useState(0);

  const create = async () => {
    if (!customerId) return toast.error(t('pleaseSelectClient'));
    if (!dealId)     return toast.error(t('pleaseSelectDeal'));
    setCreating(true);
    try {
      const r = await axios.post(`${API_URL}/api/contracts2`, {
        customer_id: customerId, deal_id: dealId, type, notes, items,
      });
      toast.success(`${t('r9_contract_created')}(${r.data.contract.id})`);
      setNotes('');
      setRefresh(x => x + 1);
    } catch (e) {
      toast.error(e?.response?.data?.detail || t('adm2_fd771a96cc'));
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div className="section-card">
        <div className="section-title-clean">
          <FileText size={22} weight="duotone" className="text-[#4F46E5]" />
          <span>{t('adm_create_contract_v2')}</span>
        </div>
        <div className="space-y-4">
          <OptionPillGroup
            options={(catalog?.contract_types || ['deposit', 'final', 'purchase']).map((ct) => ({
              value: ct,
              label: ct.toUpperCase(),
            }))}
            value={type}
            onChange={setType}
            testIdPrefix="ctype"
            ariaLabel="Contract type"
          />
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-[#71717A] mb-2">{t('adm_customer')}</label>
            <WhiteSelect
              value={customerId}
              onChange={(v) => setCustomerId(v)}
              data-testid="c2-customer"
              placeholder={`— ${t('selectShort')} —`}
              options={[
                { value: '', label: `— ${t('selectShort')} —` },
                ...customers.map(c => ({
                  value: c.id,
                  label: `${(c.firstName || '') + ' ' + (c.lastName || '')} · ${c.email || c.id}`,
                })),
              ]}
            />
          </div>
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-[#71717A] mb-2">{t('adm_deal_3')}</label>
            <WhiteSelect
              value={dealId}
              onChange={(v) => setDealId(v)}
              data-testid="c2-deal"
              placeholder={`— ${t('selectShort')} —`}
              options={[
                { value: '', label: `— ${t('selectShort')} —` },
                ...deals
                  .filter(d => !customerId || d.customerId === customerId)
                  .map(d => ({ value: d.id, label: d.title || d.vin || d.id })),
              ]}
            />
          </div>
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-[#71717A] mb-2">{t('adm_notes')}</label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3}
                      className="input w-full resize-none" data-testid="c2-notes" />
          </div>
          <div className="text-xs text-[#71717A] bg-[#F9FAFB] rounded-lg p-3 flex gap-2">
            <Info size={16} className="flex-shrink-0 mt-0.5" />
            <div>
              {t('adm_for')} <b>type=deposit</b> {t('adm3_18ed2322c4')} <b>{t('customerLegal')}</b>).
            </div>
          </div>
          <button onClick={create} disabled={creating || !customerId || !dealId}
                  className="btn-primary w-full" data-testid="c2-create">
            <FileText size={18} weight="bold" />
            {creating ? t('adm2_2c13e01c21') : t('adm2_cb05c89823')}
          </button>
        </div>
      </div>

      <div className="section-card">
        <div className="section-title-clean">
          <ArrowsClockwise size={22} weight="duotone" className="text-[#059669]" />
          <span>{t('adm_deal_contracts')}</span>
        </div>
        {!dealId ? (
          <p className="text-sm text-[#71717A]">{t('selectDealForContracts')}</p>
        ) : (
          <ContractsListForDeal dealId={dealId} catalog={catalog} refreshKey={refresh} />
        )}
      </div>
    </div>
  );
}

function ContractsListForDeal({ dealId, catalog, refreshKey }) {
  const { t } = useLang();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  const forwardMap = catalog?.contract_lifecycle_forward || {};

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const r = await axios.get(`${API_URL}/api/contracts2?deal_id=${dealId}&limit=50`);
      setItems(r.data?.data || []);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [dealId]);

  useEffect(() => { reload(); }, [reload, refreshKey]);

  const transition = async (id, to) => {
    try {
      await axios.post(`${API_URL}/api/contracts2/${id}/transition`, { to });
      toast.success(`${t('r9_transferred_to')}${to}`);
      reload();
    } catch (e) {
      toast.error(e?.response?.data?.detail || t('adm2_3044da855d'));
    }
  };

  const uploadSigned = async (id, file) => {
    if (!file) return;
    const fd = new FormData();
    fd.append('file', file);
    try {
      const r = await axios.post(`${API_URL}/api/contracts2/${id}/upload-signed`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      toast.success(t('adm_signed_pdf_uploaded'));
      reload();
    } catch (e) {
      toast.error(e?.response?.data?.detail || t('adm2_e0e3af66a0'));
    }
  };

  if (loading) return <p className="text-sm text-[#71717A]">{t('adm_loading_5')}</p>;
  if (!items.length) return <p className="text-sm text-[#71717A]">{t('adm_no_contracts_yet')}</p>;

  return (
    <div className="space-y-3 max-h-[640px] overflow-auto">
      {items.map(c => {
        const color = LIFECYCLE_COLORS[c.lifecycle] || 'bg-[#F4F4F5] text-[#71717A]';
        const allowed = forwardMap[c.lifecycle] || [];
        return (
          <div key={c.id} className="border border-[#E4E4E7] rounded-xl p-4" data-testid={`contract-item-${c.id}`}>
            <div className="flex items-start justify-between mb-2">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-[#18181B]">{(c.type || '').toUpperCase()}</span>
                  <span className="font-mono text-xs text-[#71717A]">#{(c.id || '').slice(-10)}</span>
                </div>
                <div className="text-xs text-[#71717A]">
                  {c.created_at && new Date(c.created_at).toLocaleString()}
                </div>
              </div>
              <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${color}`}>
                {c.lifecycle}
              </span>
            </div>

            {c.signed_pdf_url && (
              <a href={`${API_URL}${c.signed_pdf_url}`} target="_blank" rel="noreferrer"
                 className="inline-flex items-center gap-1 text-xs text-[#4F46E5] underline mb-2">
                <UploadSimple size={14} /> {t('adm_signed_pdf')}
              </a>
            )}

            {allowed.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-2">
                {allowed.map(t => (
                  <button key={t} onClick={() => transition(c.id, t)}
                          data-testid={`ctr-transition-${c.id}-${t}`}
                          className={`text-xs px-2.5 py-1 rounded-lg font-medium flex items-center gap-1 ${
                            t === 'cancelled'
                              ? 'bg-[#FEE2E2] text-[#DC2626]'
                              : 'bg-[#4F46E5] text-white'
                          }`}>
                    <ArrowRight size={12} weight="bold" />
                    {t}
                  </button>
                ))}
              </div>
            )}

            <label className="inline-flex items-center gap-2 text-xs text-[#4F46E5] cursor-pointer">
              <UploadSimple size={14} />
              <span>{t('uploadSignedPdf')}</span>
              <input type="file" accept="application/pdf" className="hidden"
                     data-testid={`ctr-upload-${c.id}`}
                     onChange={(e) => uploadSigned(c.id, e.target.files?.[0])} />
            </label>
          </div>
        );
      })}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════
//   P1.2  FINANCIALS  &  PAYMENTS  TAB
// ════════════════════════════════════════════════════════════════════════

const PAYMENT_METHOD_LABELS = {
  bank: { label: 'Bank', tint: 'bg-[#DBEAFE] text-[#1D4ED8]' },
  stripe: { label: 'Stripe', tint: 'bg-[#E0E7FF] text-[#4F46E5]' },
  cash_off_books: { label: 'Cash 🔴', tint: 'bg-[#FEE2E2] text-[#DC2626]' },
  internal: { label: 'adm_internal', tint: 'bg-[#F4F4F5] text-[#71717A]' },
  other: { label: 'Other', tint: 'bg-[#FEF3C7] text-[#D97706]' },
};

const PAYMENT_STATUS_TINT = {
  pending: 'bg-[#FEF3C7] text-[#D97706]',
  confirmed: 'bg-[#D1FAE5] text-[#059669]',
  voided: 'bg-[#F4F4F5] text-[#71717A] line-through',
};

const DEAL_PAYMENT_STATUS_TINT = {
  unpaid: 'bg-[#FEE2E2] text-[#DC2626]',
  partial: 'bg-[#FEF3C7] text-[#D97706]',
  paid: 'bg-[#D1FAE5] text-[#059669]',
  overpaid: 'bg-[#DBEAFE] text-[#1D4ED8]',
};

function fmt(n) {
  if (n === null || n === undefined) return '—';
  const v = Number(n);
  return `€${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function FinancialsTab({ customers, deals }) {
  const { t } = useLang();
  const [dealId, setDealId] = useState('');
  const [refreshTick, setRefreshTick] = useState(0);
  const triggerRefresh = () => setRefreshTick(t => t + 1);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="section-card lg:col-span-1">
        <div className="section-title-clean">
          <ListChecks size={22} weight="duotone" className="text-[#4F46E5]" />
          <span>{t('adm_deal_2')}</span>
        </div>
        <WhiteSelect
          value={dealId}
          onChange={(v) => setDealId(v)}
          data-testid="fin-deal-select"
          placeholder={`— ${t('selectDeal')} —`}
          options={[
            { value: '', label: `— ${t('selectDeal')} —` },
            ...deals.map(d => ({
              value: d.id,
              label: `${(d.title || d.vin || d.id)} · ${STAGE_LABELS[d.stage] || d.stage || ''}`,
            })),
          ]}
        />
        <div className="text-xs text-[#71717A] mt-3 bg-[#F9FAFB] rounded-lg p-3 flex gap-2">
          <Info size={16} className="flex-shrink-0 mt-0.5" />
          <div>
            {t('financialFlowExplanation')}
          </div>
        </div>
      </div>

      <div className="lg:col-span-2 space-y-6">
        {!dealId ? (
          <div className="section-card text-sm text-[#71717A] text-center py-12">
            {t('selectDealForBreakdown')}
          </div>
        ) : (
          <>
            <BreakdownPanel
              dealId={dealId}
              refreshTick={refreshTick}
              onRefresh={triggerRefresh}
            />
            <PaymentsPanel
              dealId={dealId}
              refreshTick={refreshTick}
              onRefresh={triggerRefresh}
            />
          </>
        )}
      </div>
    </div>
  );
}

function BreakdownPanel({ dealId, refreshTick, onRefresh }) {
  const { t } = useLang();
  const [items, setItems] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewData, setPreviewData] = useState(null);

  const reload = useCallback(async () => {
    if (!dealId) return;
    setLoading(true);
    try {
      const r = await axios.get(`${API_URL}/api/legal/deals/${dealId}/financials`);
      setItems(r.data?.data || []);
      setSummary(r.data?.summary || null);
    } catch (e) {
      console.error(e);
      toast.error(e?.response?.data?.detail || t('adm2_breakdown_b50421c66e'));
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [dealId]);

  useEffect(() => { reload(); }, [reload, refreshTick]);

  const previewFinal = async () => {
    try {
      const tplR = await axios.get(`${API_URL}/api/admin/invoice-templates?kind=final&active=true`);
      const tpl = (tplR.data?.data || [])[0];
      if (!tpl) throw new Error(t('adm2_template_kind_final_0ea56d6082'));
      const aw = items.find(i => i.kind === 'after_win');
      const ctx = {};
      if (aw?.auction?.price_eur) ctx.vehicle_price_eur = aw.auction.price_eur;
      const r = await axios.post(
        `${API_URL}/api/admin/invoice-templates/${tpl.id}/preview`,
        { context: ctx, overrides: {} },
      );
      setPreviewData(r.data?.preview);
      setPreviewOpen(true);
    } catch (e) {
      toast.error(e?.response?.data?.detail || e.message || 'Preview failed');
    }
  };

  const generateFinal = async () => {
    setGenerating(true);
    try {
      const r = await axios.post(
        `${API_URL}/api/legal/deals/${dealId}/final-breakdown`,
        { context: {}, overrides: {} },
      );
      if (r.data?.idempotent) {
        toast.info(t('adm_final_breakdown_already_exists'));
      } else {
        toast.success(t('adm_final_breakdown_created'));
      }
      setPreviewOpen(false);
      onRefresh();
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Generate failed');
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="section-card">
      <div className="flex items-start justify-between mb-4">
        <div className="section-title-clean !mb-0">
          <Receipt size={22} weight="duotone" className="text-[#4F46E5]" />
          <span>{t('financialBreakdownTitle')}</span>
        </div>
        {summary?.final?.exists ? (
          <span className="px-3 py-1 rounded-full text-xs font-semibold bg-[#F4F4F5] text-[#18181B] flex items-center gap-1">
            <Lock size={14} weight="bold" /> {t('adm_final_locked')}
          </span>
        ) : (
          <button
            onClick={previewFinal}
            data-testid="fin-preview-final"
            className="btn-primary !px-3 !py-2 !text-xs"
          >
            <Plus size={14} weight="bold" /> {t('adm_generate_final_costs')}
          </button>
        )}
      </div>

      {loading ? (
        <p className="text-sm text-[#71717A]">{t('adm_loading_5')}</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-[#71717A]">
          {t('adm_no_breakdowns_yet_after')} <b>auction_won</b> {t('adm3_9035ff8358')}
        </p>
      ) : (
        <div className="space-y-4">
          {items.map(b => (
            <BreakdownCard key={b.id} bd={b} />
          ))}
        </div>
      )}

      {previewOpen && previewData && (
        <PreviewModal
          data={previewData}
          onCancel={() => setPreviewOpen(false)}
          onConfirm={generateFinal}
          confirming={generating}
        />
      )}
    </div>
  );
}

function BreakdownCard({ bd }) {
  const { t } = useLang();
  const totals = bd.totals || {};
  const items = bd.items || [];
  return (
    <div className="border border-[#E4E4E7] rounded-xl overflow-hidden"
         data-testid={`breakdown-card-${bd.id}`}>
      <div className="bg-[#F9FAFB] px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-[#18181B] uppercase tracking-wide text-sm">
            {bd.kind === 'final' ? '🟣 Final' : '🟦 After-Win'}
          </span>
          <span className="font-mono text-xs text-[#71717A]">#{(bd.id || '').slice(-10)}</span>
          {bd.locked && (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[#F4F4F5] text-[#18181B] flex items-center gap-1">
              <Lock size={10} weight="bold" /> LOCKED
            </span>
          )}
        </div>
        <div className="text-xs text-[#71717A]">
          {bd.created_at && new Date(bd.created_at).toLocaleString()}
          {bd.fx_rate_snapshot && (
            <span className="ml-2 font-mono">FX {bd.fx_rate_snapshot}</span>
          )}
        </div>
      </div>

      <div className="px-4 py-3">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[#71717A] text-xs uppercase tracking-wide">
              <th className="text-left py-2 font-medium">{t('itemLabel')}</th>
              <th className="text-right py-2 font-medium">{t('amount')}</th>
              <th className="text-center py-2 font-medium">{t('methodLabel')}</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it, idx) => {
              const meth = PAYMENT_METHOD_LABELS[it.payment_type] || PAYMENT_METHOD_LABELS.other;
              const isCash = it.payment_type === 'cash_off_books';
              const isNeg = Number(it.amount) < 0;
              return (
                <tr key={idx} className={`border-t border-[#F4F4F5] ${isCash ? 'bg-[#FEF2F2]/40' : ''}`}>
                  <td className="py-2 text-[#18181B]">{it.label || it.name || it.key}</td>
                  <td className={`py-2 text-right font-mono font-semibold ${
                    isNeg ? 'text-[#059669]' : isCash ? 'text-[#DC2626]' : 'text-[#18181B]'
                  }`}>{fmt(it.amount)}</td>
                  <td className="py-2 text-center">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${meth.tint}`}>
                      {meth.label}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="px-4 py-3 bg-[#F9FAFB] grid grid-cols-3 gap-3 text-sm">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-[#71717A] font-medium">{t('totalCount')}</div>
          <div className="font-mono font-bold text-[#18181B]">
            {fmt(totals.total_all ?? bd.amount)}
          </div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wider text-[#059669] font-medium">{t('officialBadge')}</div>
          <div className="font-mono font-bold text-[#059669]">{fmt(totals.total_official)}</div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wider text-[#DC2626] font-medium">{'Cash 🔴'}</div>
          <div className="font-mono font-bold text-[#DC2626]">{fmt(totals.total_cash)}</div>
        </div>
      </div>
    </div>
  );
}

function PreviewModal({ data, onCancel, onConfirm, confirming }) {
  const { t } = useLang();
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[85vh] overflow-auto"
           data-testid="fin-preview-modal">
        <div className="px-6 py-4 border-b border-[#E4E4E7] flex items-center justify-between">
          <h3 className="text-lg font-bold text-[#18181B]">{t('adm_preview_final_breakdown')}</h3>
          <button onClick={onCancel} className="p-1 hover:bg-[#F4F4F5] rounded">
            <IconX size={18} />
          </button>
        </div>
        <div className="p-6">
          <BreakdownCard bd={{
            id: 'preview', kind: 'final', locked: false,
            items: data.items, totals: data.totals,
            created_at: new Date().toISOString(),
          }} />
          <p className="text-xs text-[#71717A] mt-3 italic">
            {t('adm3_eb8fcce11b')} <b>locked=true</b> {t('adm_and_cannot_be_changed_anymore')}
          </p>
        </div>
        <div className="px-6 py-4 border-t border-[#E4E4E7] flex justify-end gap-2">
          <button onClick={onCancel} className="btn-secondary" data-testid="fin-preview-cancel">{t('cancelAction')}</button>
          <button onClick={onConfirm} disabled={confirming}
                  className="btn-primary" data-testid="fin-preview-confirm">
            {confirming ? 'Saving…' : 'Confirm & Create'}
          </button>
        </div>
      </div>
    </div>
  );
}

function PaymentsPanel({ dealId, refreshTick, onRefresh }) {
  const { t } = useLang();
  const [payments, setPayments] = useState([]);
  const [summary, setSummary] = useState(null);
  const [paymentStatus, setPaymentStatus] = useState('unpaid');
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);

  const reload = useCallback(async () => {
    if (!dealId) return;
    setLoading(true);
    try {
      const r = await axios.get(`${API_URL}/api/legal/deals/${dealId}/payments`);
      setPayments(r.data?.payments || []);
      setSummary(r.data?.summary || null);
      setPaymentStatus(r.data?.payment_status || 'unpaid');
    } catch (e) {
      console.error(e);
      setPayments([]);
    } finally {
      setLoading(false);
    }
  }, [dealId]);

  useEffect(() => { reload(); }, [reload, refreshTick]);

  const confirmPayment = async (id) => {
    try {
      await axios.post(`${API_URL}/api/legal/payments/${id}/confirm`, {});
      toast.success(t('adm_payment_confirmed'));
      onRefresh();
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Confirm failed');
    }
  };

  const voidPayment = async (id) => {
    const reason = window.prompt(t('adm3_a0e215377f'), '');
    if (!reason || reason.length < 2) return;
    try {
      await axios.post(`${API_URL}/api/legal/payments/${id}/void`, { reason });
      toast.success(t('adm_payment_voided'));
      onRefresh();
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Void failed (admin only)');
    }
  };

  const totalAll = summary?.total_all || 0;
  const paidTotal = summary?.paid_total || 0;
  const remaining = summary?.remaining || 0;
  const progress = totalAll > 0 ? Math.min(100, (paidTotal / totalAll) * 100) : 0;
  const statusTint = DEAL_PAYMENT_STATUS_TINT[paymentStatus] || DEAL_PAYMENT_STATUS_TINT.unpaid;

  return (
    <div className="section-card">
      <div className="flex items-start justify-between mb-4">
        <div className="section-title-clean !mb-0">
          <Wallet size={22} weight="duotone" className="text-[#059669]" />
          <span>{t('paymentsAlerts')}</span>
          <span className={`ml-2 px-3 py-1 rounded-full text-xs font-semibold uppercase ${statusTint}`}
                data-testid="fin-payment-status">
            {paymentStatus}
          </span>
        </div>
        <button onClick={() => setShowAdd(true)}
                data-testid="fin-add-payment"
                className="btn-primary !px-3 !py-2 !text-xs">
          <Plus size={14} weight="bold" />{t('addPaymentAction')}</button>
      </div>

      <div className="bg-[#F9FAFB] rounded-xl p-4 mb-4 grid grid-cols-3 gap-3 text-sm">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-[#71717A] font-medium">{t('toPayLabel')}</div>
          <div className="font-mono font-bold text-[#18181B]">{fmt(totalAll)}</div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wider text-[#059669] font-medium">{t('stagePaymentDone')}</div>
          <div className="font-mono font-bold text-[#059669]" data-testid="fin-paid-total">{fmt(paidTotal)}</div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wider text-[#71717A] font-medium">{t('remainingLabel')}</div>
          <div className={`font-mono font-bold ${
            remaining < 0 ? 'text-[#1D4ED8]' : remaining === 0 ? 'text-[#059669]' : 'text-[#DC2626]'
          }`}>{fmt(remaining)}</div>
        </div>
        <div className="col-span-3">
          <div className="h-2 bg-[#E4E4E7] rounded-full overflow-hidden">
            <div className={`h-full transition-all ${
              paymentStatus === 'paid' ? 'bg-[#059669]'
              : paymentStatus === 'overpaid' ? 'bg-[#1D4ED8]'
              : paymentStatus === 'partial' ? 'bg-[#D97706]'
              : 'bg-[#71717A]'
            }`} style={{ width: `${progress}%` }} />
          </div>
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-[#71717A]">{t('adm_loading_5')}</p>
      ) : payments.length === 0 ? (
        <p className="text-sm text-[#71717A]">{t('adm_no_payments_yet')}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[#71717A] text-xs uppercase tracking-wide border-b border-[#E4E4E7]">
                <th className="text-left py-2 px-2 font-medium">{t('date')}</th>
                <th className="text-right py-2 px-2 font-medium">{t('amount')}</th>
                <th className="text-center py-2 px-2 font-medium">{t('methodLabel')}</th>
                <th className="text-center py-2 px-2 font-medium">{t('statusGeneric')}</th>
                <th className="text-center py-2 px-2 font-medium">{t('proofLabel')}</th>
                <th className="text-right py-2 px-2 font-medium">{t('actionsLabel')}</th>
              </tr>
            </thead>
            <tbody>
              {payments.map(p => {
                const meth = PAYMENT_METHOD_LABELS[p.method] || PAYMENT_METHOD_LABELS.other;
                const stTint = PAYMENT_STATUS_TINT[p.status] || '';
                const isCash = p.method === 'cash_off_books';
                return (
                  <tr key={p.id}
                      className={`border-b border-[#F4F4F5] ${isCash ? 'bg-[#FEF2F2]/40' : ''} ${
                        p.status === 'voided' ? 'opacity-50' : ''
                      }`}
                      data-testid={`payment-row-${p.id}`}>
                    <td className="py-2 px-2 text-xs text-[#71717A]">
                      {new Date(p.created_at).toLocaleString()}
                    </td>
                    <td className={`py-2 px-2 text-right font-mono font-semibold ${
                      isCash ? 'text-[#DC2626]' : 'text-[#18181B]'
                    }`}>{fmt(p.amount)}</td>
                    <td className="py-2 px-2 text-center">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${meth.tint}`}>
                        {meth.label}
                      </span>
                    </td>
                    <td className="py-2 px-2 text-center">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase ${stTint}`}>
                        {p.status}
                      </span>
                    </td>
                    <td className="py-2 px-2 text-center">
                      {p.proof_url ? (
                        <a href={p.proof_url} target="_blank" rel="noreferrer"
                           className="text-[#4F46E5] underline text-xs">link</a>
                      ) : <span className="text-[#71717A] text-xs">—</span>}
                    </td>
                    <td className="py-2 px-2 text-right">
                      {p.status === 'pending' && (
                        <button onClick={() => confirmPayment(p.id)}
                                data-testid={`fin-confirm-${p.id}`}
                                className="text-xs px-2.5 py-1 rounded-lg bg-[#059669] text-white font-semibold mr-1">
                          {t('confirmAction')}
                        </button>
                      )}
                      {p.status !== 'voided' && (
                        <button onClick={() => voidPayment(p.id)}
                                data-testid={`fin-void-${p.id}`}
                                className="text-xs px-2.5 py-1 rounded-lg bg-[#FEE2E2] text-[#DC2626] font-semibold">
                          {t('adm_void')}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {showAdd && (
        <AddPaymentModal
          dealId={dealId}
          onCancel={() => setShowAdd(false)}
          onCreated={() => { setShowAdd(false); onRefresh(); }}
        />
      )}
    </div>
  );
}

function AddPaymentModal({ dealId, onCancel, onCreated }) {
  const { t } = useLang();
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('bank');
  const [proofUrl, setProofUrl] = useState('');
  const [note, setNote] = useState('');
  const [autoConfirm, setAutoConfirm] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    const amt = Number(amount);
    if (!amt || amt <= 0) {
      toast.error(t('adm_amount_must_be_0'));
      return;
    }
    setSubmitting(true);
    try {
      const r = await axios.post(`${API_URL}/api/legal/deals/${dealId}/payments`, {
        amount: amt, method, currency: 'EUR',
        proof_url: proofUrl || null,
        note: note || null,
        auto_confirm: autoConfirm,
      });
      const warns = r.data?.warnings || [];
      if (warns.length) {
        toast.warning(warns.join('; '));
      } else {
        toast.success(r.data?.payment?.status === 'confirmed' ? 'Payment confirmed' : 'Payment created (pending)');
      }
      onCreated();
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Create failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full"
           data-testid="fin-add-payment-modal">
        <div className="px-6 py-4 border-b border-[#E4E4E7] flex items-center justify-between">
          <h3 className="text-lg font-bold text-[#18181B]">{t('addPaymentAction')}</h3>
          <button onClick={onCancel} className="p-1 hover:bg-[#F4F4F5] rounded">
            <IconX size={18} />
          </button>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-[#71717A] mb-2">
              Amount (EUR) *
            </label>
            <input type="number" step="0.01" min="0" value={amount}
                   onChange={(e) => setAmount(e.target.value)}
                   data-testid="fin-pay-amount"
                   className="input w-full" placeholder="0.00" />
          </div>
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-[#71717A] mb-2">
              {t('adm_method')}
            </label>
            <div className="grid grid-cols-3 gap-2">
              {['bank', 'stripe', 'cash_off_books'].map(m => {
                const meta = PAYMENT_METHOD_LABELS[m];
                return (
                  <button key={m}
                          type="button"
                          onClick={() => setMethod(m)}
                          data-testid={`fin-method-${m}`}
                          className={`px-3 py-2 rounded-lg text-xs font-semibold border-2 transition-colors ${
                            method === m
                              ? 'border-[#4F46E5] bg-[#E0E7FF] text-[#4F46E5]'
                              : 'border-[#E4E4E7] bg-white text-[#71717A] hover:border-[#4F46E5]/40'
                          }`}>
                    {meta.label}
                  </button>
                );
              })}
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-[#71717A] mb-2">
              Proof URL {method === 'bank' ? '(recommended)' : '(optional)'}
            </label>
            <input value={proofUrl} onChange={(e) => setProofUrl(e.target.value)}
                   data-testid="fin-pay-proof"
                   className="input w-full" placeholder="https://…" />
          </div>
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-[#71717A] mb-2">
              {t('adm_note')}
            </label>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2}
                      className="input w-full resize-none" />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={autoConfirm}
                   onChange={(e) => setAutoConfirm(e.target.checked)}
                   data-testid="fin-pay-auto-confirm" />
            <span className="text-[#18181B]">Auto-confirm (admin only)</span>
          </label>
        </div>
        <div className="px-6 py-4 border-t border-[#E4E4E7] flex justify-end gap-2">
          <button onClick={onCancel} className="btn-secondary">{t('cancelAction')}</button>
          <button onClick={submit} disabled={submitting || !amount}
                  className="btn-primary" data-testid="fin-pay-submit">
            {submitting ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

