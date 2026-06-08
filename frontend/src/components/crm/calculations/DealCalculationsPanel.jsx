/**
 * P2.7 — Deal Calculations Panel.
 *
 * The central financial workspace for a single deal:
 *   • Version list (sorted newest-first) with status, total, delta vs previous
 *   • Status workflow controls (validated transitions on backend)
 *   • Side-by-side compare modal
 *   • Override editor (inline rows / hide / add / discount)
 *   • Comments (internal vs shared with client)
 *   • Timeline (created / status / comments / deal events / child versions)
 *   • Profitability widget (admin/teamlead only)
 *   • Share link (public quote URL + copy)
 *   • "New version" button — clone the active calc into v+1
 */
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import { API_URL } from '../../../App';
import {
  Stack, Plus, Copy, Link as LinkIcon, ArrowsLeftRight, Trash, ArrowRight,
  ChatCircleText, Receipt, Sparkle, Lock,
} from '@phosphor-icons/react';
import CalculationStatusBadge   from './CalculationStatusBadge';
import CalculationDelta         from './CalculationDelta';
import CalculationOverrideEditor from './CalculationOverrideEditor';
import CalculationComments      from './CalculationComments';
import CalculationProfitability from './CalculationProfitability';
import CalculationCompareModal  from './CalculationCompareModal';
import CalculationTimeline      from './CalculationTimeline';
import { useLang } from '../../../i18n';

// State machine — mirrors backend
const NEXT_STATUSES = {
  draft:              ['sent_to_client', 'auction_mode', 'archived'],
  sent_to_client:     ['approved_by_client', 'auction_mode', 'archived'],
  approved_by_client: ['auction_mode', 'final', 'archived'],
  auction_mode:       ['final', 'archived'],
  final:              ['archived'],
  archived:           [],
};

const STATUS_LABELS = {
  draft:              'Draft',
  sent_to_client:     'Sent to client',
  approved_by_client: 'Approved by client',
  auction_mode:       'Auction mode',
  final:              'Final',
  archived:           'Archived',
};

const fmt = (v, ccy = 'EUR') => {
  const sym = ccy === 'USD' ? '$' : '€';
  return `${sym}${Math.round(Number(v) || 0).toLocaleString()}`;
};
const fmtTime = (iso) => { try { return new Date(iso).toLocaleString(); } catch { return iso || ''; } };

// ----------------------------------------------------------------------
// MAIN COMPONENT
// ----------------------------------------------------------------------
export default function DealCalculationsPanel({ dealId, customerId, leadId, frontendOrigin }) {
  const { t } = useLang();
  const [calcs, setCalcs] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [active, setActive] = useState(null);
  const [loadingList, setLoadingList] = useState(true);
  const [busy, setBusy] = useState(false);
  const [compare, setCompare] = useState(null);  // {a,b}
  const [pickFor, setPickFor] = useState(null);  // 'b' — we're picking a second calc to compare to A

  // Where to query — prefer dealId, fall back to customer / lead
  const params = useMemo(() => {
    const q = new URLSearchParams();
    if (dealId)     q.set('dealId',     dealId);
    if (customerId) q.set('customerId', customerId);
    if (leadId)     q.set('leadId',     leadId);
    return q.toString();
  }, [dealId, customerId, leadId]);

  const loadList = useCallback(async () => {
    if (!params) return;
    setLoadingList(true);
    try {
      const res = await axios.get(`${API_URL}/api/calculations?${params}`);
      const items = res.data?.items || [];
      setCalcs(items);
      if (items.length && (!activeId || !items.find(c => c.id === activeId))) {
        setActiveId(items[0].id);
      } else if (!items.length) {
        setActiveId(null);
        setActive(null);
      }
    } catch (err) {
      const msg = err?.response?.data?.detail || err.message;
      toast.error(`Could not load calculations: ${msg}`);
    } finally { setLoadingList(false); }
  }, [params, activeId]);

  const loadActive = useCallback(async () => {
    if (!activeId) { setActive(null); return; }
    try {
      const res = await axios.get(`${API_URL}/api/calculations/${activeId}`);
      setActive(res.data?.calculation || null);
    } catch (err) {
      const msg = err?.response?.data?.detail || err.message;
      toast.error(`Could not load calc: ${msg}`);
    }
  }, [activeId]);

  useEffect(() => { loadList(); }, [loadList]);
  useEffect(() => { loadActive(); }, [loadActive]);

  // Order versions newest-first, compute delta vs previous version of same chain
  const decoratedCalcs = useMemo(() => {
    if (!calcs.length) return [];
    const sorted = [...calcs].sort((a, b) => (Number(b.version) || 0) - (Number(a.version) || 0));
    const byId   = new Map(sorted.map(c => [c.id, c]));
    return sorted.map((c) => {
      let prevTotal = null;
      if (c.parent_id && byId.has(c.parent_id)) {
        prevTotal = Number(byId.get(c.parent_id)?.outputs?.total || 0);
      } else {
        // fallback: previous version with version-1
        const prev = sorted.find(p => Number(p.version) === Number(c.version) - 1);
        if (prev) prevTotal = Number(prev.outputs?.total || 0);
      }
      const total = Number(c.outputs?.total || 0);
      return { ...c, delta: prevTotal != null ? total - prevTotal : null, total };
    });
  }, [calcs]);

  // ----- Actions -----
  const transitionStatus = async (target) => {
    if (!active || !target) return;
    setBusy(true);
    try {
      const res = await axios.patch(`${API_URL}/api/calculations/${active.id}/status`, { status: target });
      if (res.data?.calculation) {
        setActive(res.data.calculation);
        toast.success(`Status → ${STATUS_LABELS[target] || target}`);
        loadList();
      }
    } catch (err) {
      const msg = err?.response?.data?.detail || err.message;
      toast.error(`Cannot transition: ${msg}`);
    } finally { setBusy(false); }
  };

  const cloneActive = async () => {
    if (!active) return;
    setBusy(true);
    try {
      const res = await axios.post(`${API_URL}/api/calculations/${active.id}/clone`, {});
      const next = res.data?.calculation;
      if (next) {
        toast.success(`New version v${next.version} created`);
        setActiveId(next.id);
        loadList();
      }
    } catch (err) {
      const msg = err?.response?.data?.detail || err.message;
      toast.error(`Clone failed: ${msg}`);
    } finally { setBusy(false); }
  };

  const archiveActive = async () => {
    if (!active) return;
    if (!window.confirm('Soft-archive this calculation? (irreversible — status → archived)')) return;
    setBusy(true);
    try {
      await axios.delete(`${API_URL}/api/calculations/${active.id}`);
      toast.success(t('cmp_archived'));
      loadList();
    } catch (err) {
      const msg = err?.response?.data?.detail || err.message;
      toast.error(`Archive failed: ${msg}`);
    } finally { setBusy(false); }
  };

  const buildShareUrl = (calc) => {
    if (!calc?.share_token) return null;
    const origin = frontendOrigin || (typeof window !== 'undefined' ? window.location.origin : '');
    return `${origin}/quote/${calc.share_token}`;
  };

  const copyShare = async () => {
    const url = buildShareUrl(active);
    if (!url) { toast.error(t('cmp_no_share_token_cannot_share_this_calc')); return; }
    try {
      await navigator.clipboard.writeText(url);
      toast.success(t('cmp_share_link_copied'));
    } catch {
      toast.error(t('cmp_clipboard_blocked_copy_manually') + url);
    }
  };

  const startCompare = () => {
    if (!active) return;
    if (decoratedCalcs.length < 2) { toast.error(t('cmp_need_at_least_2_versions_to_compare')); return; }
    // default: compare active (B) against the previous version (A)
    const idx = decoratedCalcs.findIndex(c => c.id === active.id);
    const a   = decoratedCalcs[idx + 1] || decoratedCalcs.find(c => c.id !== active.id);
    if (a) setCompare({ a: a.id, b: active.id });
    else setPickFor('a');
  };

  // ----- RENDER -----
  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-4" data-testid="deal-calculations-panel">
      {/* LEFT — VERSION LIST */}
      <div className="lg:col-span-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-bold text-[#18181B]">
            <Stack size={18} weight="duotone" className="text-[#4F46E5]" />
            Versions ({decoratedCalcs.length})
          </div>
          {active && (
            <button
              onClick={cloneActive}
              disabled={busy}
              className="text-xs font-semibold text-[#4F46E5] hover:text-[#3730A3] flex items-center gap-1"
              data-testid="calc-new-version"
            >
              <Plus size={14} weight="bold" /> {t('cmp_new_version')}
            </button>
          )}
        </div>

        {loadingList && <div className="text-xs text-[#A1A1AA]">{t('cmp_loading')}</div>}
        {!loadingList && decoratedCalcs.length === 0 && (
          <div className="p-4 rounded-lg border border-dashed border-[#E4E4E7] text-center">
            <div className="text-sm text-[#71717A] mb-2">No calculations yet for this {dealId ? 'deal' : customerId ? 'customer' : 'lead'}.</div>
            <div className="text-xs text-[#A1A1AA]">{t('cmp_use_the_calculator_to_create_the_first_snapshot_or')}</div>
          </div>
        )}

        <div className="space-y-2 max-h-[70vh] overflow-y-auto pr-1">
          {decoratedCalcs.map((c) => {
            const isActive = c.id === activeId;
            return (
              <button
                key={c.id}
                onClick={() => setActiveId(c.id)}
                className={`w-full text-left p-3 rounded-lg border transition-all ${
                  isActive
                    ? 'border-[#4F46E5] bg-[#EEF2FF] shadow-sm'
                    : 'border-[#E4E4E7] bg-white hover:border-[#A5B4FC]'
                }`}
                data-testid={`calc-version-${c.version}`}
              >
                <div className="flex items-start justify-between gap-2 mb-1">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-[#18181B]">v{c.version}</span>
                    <CalculationStatusBadge status={c.status} />
                  </div>
                  <span className="font-mono text-sm font-bold text-[#18181B]">{fmt(c.total)}</span>
                </div>
                <div className="flex items-center justify-between text-xs text-[#71717A]">
                  <span>{fmtTime(c.created_at)}</span>
                  {c.delta != null && <CalculationDelta value={c.delta} />}
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-[10px] px-1.5 py-0.5 bg-[#F4F4F5] text-[#71717A] rounded uppercase tracking-wider font-semibold">{c.origin}</span>
                  <span className="text-[10px] px-1.5 py-0.5 bg-[#F4F4F5] text-[#71717A] rounded font-mono truncate">{c.id}</span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* RIGHT — ACTIVE VERSION DETAIL */}
      <div className="lg:col-span-8 space-y-4">
        {!active && (
          <div className="p-6 rounded-lg border border-dashed border-[#E4E4E7] text-center text-[#71717A]">
            <Sparkle size={28} className="mx-auto mb-2 text-[#A1A1AA]" />
            {t('cmp_select_a_version_to_view_edit_share_and_approve')}
          </div>
        )}

        {active && (
          <motion.div
            key={active.id}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.18 }}
            className="space-y-4"
          >
            {/* HEADER STRIP */}
            <div className="rounded-lg border border-[#E4E4E7] bg-white p-4">
              <div className="flex flex-wrap items-center gap-3 justify-between">
                <div className="flex items-center gap-3">
                  <div>
                    <div className="text-xs uppercase tracking-wider text-[#71717A] font-semibold">{t('cmp_version')}</div>
                    <div className="text-2xl font-bold text-[#18181B] flex items-center gap-2">
                      v{active.version}
                      <CalculationStatusBadge status={active.status} size="lg" />
                    </div>
                  </div>
                  <div className="pl-4 border-l border-[#E4E4E7]">
                    <div className="text-xs uppercase tracking-wider text-[#71717A] font-semibold">{t('cmp_client_total')}</div>
                    <div className="text-2xl font-bold text-[#18181B] font-mono">{fmt(active.outputs?.total)}</div>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    onClick={copyShare}
                    disabled={!active.share_token}
                    className="px-3 py-1.5 text-sm font-semibold rounded border border-[#D4D4D8] text-[#18181B] hover:bg-[#F4F4F5] disabled:opacity-50 flex items-center gap-1.5"
                    data-testid="calc-copy-share"
                  >
                    <LinkIcon size={14} /> {t('cmp_copy_share_link')}
                  </button>
                  <button
                    onClick={startCompare}
                    disabled={decoratedCalcs.length < 2}
                    className="px-3 py-1.5 text-sm font-semibold rounded border border-[#D4D4D8] text-[#18181B] hover:bg-[#F4F4F5] disabled:opacity-50 flex items-center gap-1.5"
                    data-testid="calc-compare-btn"
                  >
                    <ArrowsLeftRight size={14} /> {t('cmp_compare')}
                  </button>
                  <button
                    onClick={archiveActive}
                    disabled={active.status === 'archived'}
                    className="px-3 py-1.5 text-sm font-semibold rounded border border-[#FECDD3] text-[#9F1239] hover:bg-[#FEE2E2] disabled:opacity-50 flex items-center gap-1.5"
                    data-testid="calc-archive"
                  >
                    <Trash size={14} /> {t('cmp_archive')}
                  </button>
                </div>
              </div>

              {/* STATUS TRANSITIONS */}
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="text-xs font-semibold text-[#71717A] uppercase">{t('cmp_move_to')}</span>
                {(NEXT_STATUSES[active.status] || []).map((s) => (
                  <button
                    key={s}
                    onClick={() => transitionStatus(s)}
                    disabled={busy}
                    className="px-2.5 py-1 text-xs font-semibold rounded border border-[#4F46E5] text-[#4F46E5] hover:bg-[#EEF2FF] disabled:opacity-50 flex items-center gap-1"
                    data-testid={`calc-transition-${s}`}
                  >
                    <ArrowRight size={12} weight="bold" /> {STATUS_LABELS[s] || s}
                  </button>
                ))}
                {!(NEXT_STATUSES[active.status] || []).length && (
                  <span className="text-xs text-[#A1A1AA] inline-flex items-center gap-1"><Lock size={12} /> terminal state</span>
                )}
              </div>

              {/* SHARE URL VISIBLE */}
              {active.share_token && (
                <div className="mt-3 px-2 py-1.5 bg-[#FAFAFA] border border-[#E4E4E7] rounded text-xs text-[#71717A] font-mono break-all">
                  {buildShareUrl(active)}
                </div>
              )}
            </div>

            {/* PROFITABILITY (admin/teamlead only — widget self-hides otherwise) */}
            <CalculationProfitability calc={active} />

            {/* OVERRIDE EDITOR */}
            <div className="rounded-lg border border-[#E4E4E7] bg-white p-4 space-y-3">
              <div className="flex items-center gap-2 text-sm font-bold text-[#18181B]">
                <Receipt size={16} weight="duotone" className="text-[#4F46E5]" />
                {t('cmp_overrides')}
              </div>
              <CalculationOverrideEditor calc={active} onChange={setActive} />
            </div>

            {/* COMMENTS + TIMELINE side by side */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="rounded-lg border border-[#E4E4E7] bg-white p-4">
                <CalculationComments calcId={active.id} />
              </div>
              <div className="rounded-lg border border-[#E4E4E7] bg-white p-4">
                <CalculationTimeline calcId={active.id} />
              </div>
            </div>
          </motion.div>
        )}
      </div>

      <AnimatePresence>
        {compare && (
          <CalculationCompareModal a={compare.a} b={compare.b} onClose={() => setCompare(null)} />
        )}
      </AnimatePresence>
    </div>
  );
}
