/**
 * Team-Lead Wishlist Approvals  —  /team/wishlist-approvals
 * ──────────────────────────────────────────────────────────
 * Approval queue for the manager-curated "Top deals of the week"
 * wishlist. Team leads:
 *   • See the pending queue.
 *   • Multi-select cards with checkboxes (incl. "select all").
 *   • Approve or reject in BULK — one click handles N cards.
 *   • Toggle between Pending / Approved / Rejected / All views.
 *
 * Backend: /api/team-lead/wishlist-deals  (require_admin, team_lead in ADMIN_ROLES)
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import {
  CheckCircle,
  XCircle,
  Clock,
  Car,
  CheckSquare,
  Square,
  Sparkle,
  Plus,
  X,
} from '@phosphor-icons/react';
import { useLang } from '../../i18n';
import WishlistDealForm from '../../components/wishlist/WishlistDealForm';

const API_URL = process.env.REACT_APP_BACKEND_URL || '';

const STATUS_PILL = {
  pending:  { color: '#D97706', bg: '#FEF3C7', label: 'Pending',  Icon: Clock },
  approved: { color: '#059669', bg: '#D1FAE5', label: 'Approved', Icon: CheckCircle },
  rejected: { color: '#DC2626', bg: '#FEE2E2', label: 'Rejected', Icon: XCircle },
};

const TeamWishlistApprovalsPage = () => {
  const { t } = useLang();
  const [items, setItems] = useState([]);
  const [counts, setCounts] = useState({ pending: 0, approved: 0, rejected: 0 });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState(new Set());
  const [tab, setTab] = useState('pending');
  // Модал создания: тимлид по основе апрувит, но может и сам создать
  // карточку — этой же кнопкой, без перехода на отдельную страницу.
  const [createOpen, setCreateOpen] = useState(false);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      // Always pass `status` explicitly. The backend treats values not in
      // VALID_STATUSES (e.g. "all") as "no filter", whereas an *omitted*
      // status parameter falls back to "pending" — which would make our
      // All/Approved/Rejected tabs all look empty.
      const { data } = await axios.get(`${API_URL}/api/team-lead/wishlist-deals`, {
        params: { status: tab },
      });
      setItems(Array.isArray(data?.data) ? data.data : []);
      setCounts(data?.counts || { pending: 0, approved: 0, rejected: 0 });
      setSelected(new Set());
    } catch {
      toast.error(t('loadingError') || 'Failed to load approval queue');
    } finally {
      setLoading(false);
    }
  }, [tab, t]);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  /* ── selection helpers ─────────────────────────────────────────── */
  const allSelected = items.length > 0 && selected.size === items.length;
  const someSelected = selected.size > 0 && !allSelected;

  const toggleOne = (id) => {
    setSelected((prev) => {
      const ns = new Set(prev);
      if (ns.has(id)) ns.delete(id);
      else ns.add(id);
      return ns;
    });
  };

  const toggleAll = () => {
    if (allSelected || someSelected) setSelected(new Set());
    else setSelected(new Set(items.map((x) => x.id)));
  };

  /* ── bulk actions ──────────────────────────────────────────────── */
  const bulkApprove = async (allPending = false) => {
    const ids = allPending ? null : Array.from(selected);
    if (!allPending && ids.length === 0) {
      toast.error('Select at least one card');
      return;
    }
    setBusy(true);
    try {
      const body = allPending ? { all: true } : { ids };
      const { data } = await axios.post(
        `${API_URL}/api/team-lead/wishlist-deals/approve`,
        body,
      );
      toast.success(`Approved ${data?.approved || 0} card${(data?.approved || 0) === 1 ? '' : 's'}`);
      fetchItems();
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Approve failed');
    } finally {
      setBusy(false);
    }
  };

  const bulkReject = async () => {
    const ids = Array.from(selected);
    if (ids.length === 0) {
      toast.error('Select at least one card');
      return;
    }
    const reason = window.prompt('Optional reject reason:') || '';
    setBusy(true);
    try {
      const { data } = await axios.post(
        `${API_URL}/api/team-lead/wishlist-deals/reject`,
        { ids, reason },
      );
      toast.success(`Rejected ${data?.rejected || 0} card${(data?.rejected || 0) === 1 ? '' : 's'}`);
      fetchItems();
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Reject failed');
    } finally {
      setBusy(false);
    }
  };

  const singleApprove = async (id) => {
    setBusy(true);
    try {
      await axios.post(`${API_URL}/api/team-lead/wishlist-deals/${id}/approve`);
      toast.success('Approved');
      fetchItems();
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Approve failed');
    } finally {
      setBusy(false);
    }
  };

  const singleReject = async (id) => {
    const reason = window.prompt('Reject reason:') || '';
    setBusy(true);
    try {
      await axios.post(
        `${API_URL}/api/team-lead/wishlist-deals/${id}/reject`,
        { reason },
      );
      toast.success('Rejected');
      fetchItems();
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Reject failed');
    } finally {
      setBusy(false);
    }
  };

  /* ── render ────────────────────────────────────────────────────── */
  const tabs = useMemo(() => ([
    { id: 'pending',  label: `Pending (${counts.pending})`,  color: '#D97706' },
    { id: 'approved', label: `Approved (${counts.approved})`, color: '#059669' },
    { id: 'rejected', label: `Rejected (${counts.rejected})`, color: '#DC2626' },
    { id: 'all',      label: 'All', color: '#18181B' },
  ]), [counts]);

  return (
    <motion.div
      data-testid="team-wishlist-approvals-page"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-5"
    >
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Sparkle size={20} className="text-amber-500" weight="fill" />
            <h1
              className="text-2xl font-bold text-[#18181B]"
              style={{ fontFamily: 'Mazzard, Mazzard H, Mazzard M, system-ui, sans-serif' }}
            >
              Top Deals Approvals
            </h1>
          </div>
          <p className="text-sm text-[#71717A]">
            Approve manager-curated wishlist cards for the homepage block. Bulk-approve to clear the queue in one click.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setCreateOpen(true)}
            data-testid="open-create-top-deal"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-400 text-[#18181B] font-semibold hover:bg-amber-300 transition"
          >
            <Plus size={16} weight="bold" /> Create Top Deal
          </button>
          <button
            onClick={() => bulkApprove(true)}
            disabled={busy || counts.pending === 0}
            data-testid="approve-all-pending"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 text-white font-semibold hover:bg-emerald-500 disabled:opacity-50 transition"
          >
            <CheckCircle size={16} weight="fill" /> Approve ALL pending ({counts.pending})
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 flex-wrap">
        {tabs.map((tt) => (
          <button
            key={tt.id}
            onClick={() => setTab(tt.id)}
            data-testid={`tab-${tt.id}`}
            className={`px-4 py-2 rounded-xl text-sm font-medium border transition ${
              tab === tt.id
                ? 'text-white border-transparent'
                : 'bg-white text-[#18181B] border-[#E4E4E7] hover:border-[#A1A1AA]'
            }`}
            style={tab === tt.id ? { background: tt.color } : undefined}
          >
            {tt.label}
          </button>
        ))}
      </div>

      {/* Action bar (sticky) */}
      <div
        className={`sticky top-0 z-10 bg-white rounded-2xl border border-[#E4E4E7] px-4 py-3 flex items-center gap-3 flex-wrap transition ${
          selected.size > 0 ? 'shadow-sm' : ''
        }`}
      >
        <button
          onClick={toggleAll}
          disabled={items.length === 0}
          data-testid="select-all-toggle"
          className="inline-flex items-center gap-2 text-sm font-medium text-[#18181B] disabled:opacity-50"
        >
          {allSelected
            ? <CheckSquare size={18} weight="fill" className="text-amber-500" />
            : someSelected
              ? <CheckSquare size={18} weight="duotone" className="text-amber-500" />
              : <Square size={18} className="text-[#A1A1AA]" />}
          {allSelected ? 'Deselect all' : someSelected ? `${selected.size} selected — deselect all` : 'Select all'}
        </button>
        <div className="text-xs text-[#71717A]">
          {selected.size > 0
            ? `${selected.size} of ${items.length} selected`
            : `${items.length} card${items.length === 1 ? '' : 's'}`}
        </div>
        <div className="flex-1" />
        <button
          onClick={() => bulkApprove(false)}
          disabled={busy || selected.size === 0}
          data-testid="bulk-approve-selected"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-500 disabled:opacity-50 transition"
        >
          <CheckCircle size={14} weight="fill" /> Approve selected
        </button>
        <button
          onClick={bulkReject}
          disabled={busy || selected.size === 0}
          data-testid="bulk-reject-selected"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-rose-600 text-white text-sm font-semibold hover:bg-rose-500 disabled:opacity-50 transition"
        >
          <XCircle size={14} weight="fill" /> Reject selected
        </button>
      </div>

      {/* List */}
      <div className="bg-white rounded-2xl border border-[#E4E4E7] overflow-hidden">
        {loading ? (
          <div className="p-10 text-center text-sm text-[#71717A]">Loading…</div>
        ) : items.length === 0 ? (
          <div className="p-10 text-center text-sm text-[#71717A]">
            {tab === 'pending'
              ? 'No pending cards — everything is up to date.'
              : 'No cards in this view.'}
          </div>
        ) : (
          <div className="divide-y divide-[#E4E4E7]" data-testid="approvals-list">
            {items.map((it) => {
              const pill = STATUS_PILL[it.status] || STATUS_PILL.pending;
              const Icon = pill.Icon;
              const s = it.snapshot || {};
              const checked = selected.has(it.id);
              return (
                <div
                  key={it.id}
                  className={`p-4 flex items-center gap-4 hover:bg-[#FAFAFA] ${checked ? 'bg-amber-50/40' : ''}`}
                  data-testid={`approval-row-${it.id}`}
                >
                  <button
                    onClick={() => toggleOne(it.id)}
                    data-testid={`row-check-${it.id}`}
                    className="text-[#A1A1AA] hover:text-amber-500"
                  >
                    {checked
                      ? <CheckSquare size={20} weight="fill" className="text-amber-500" />
                      : <Square size={20} />}
                  </button>
                  {s.image ? (
                    <img src={s.image} alt={it.vin} className="w-20 h-14 rounded-lg object-cover bg-[#F4F4F5]" />
                  ) : (
                    <div className="w-20 h-14 rounded-lg bg-[#F4F4F5] flex items-center justify-center">
                      <Car size={20} className="text-[#A1A1AA]" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium text-[#18181B] truncate">
                        {[s.year, s.make, s.model].filter(Boolean).join(' ') || s.title || it.vin}
                      </span>
                      <span
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider"
                        style={{ color: pill.color, background: pill.bg }}
                      >
                        <Icon size={10} weight="fill" /> {pill.label}
                      </span>
                    </div>
                    <div className="text-xs text-[#71717A] truncate">
                      VIN {it.vin} · {it.category} · {it.budget} · Week {it.week_start}
                      {it.note ? ` · "${it.note}"` : ''}
                    </div>
                    <div className="text-[10px] text-[#A1A1AA] mt-0.5">
                      By {it.created_by_name || it.created_by}
                      {it.approved_by_name ? ` · ${it.status === 'rejected' ? 'rejected' : 'approved'} by ${it.approved_by_name}` : ''}
                      {it.reject_reason ? ` · ${it.reject_reason}` : ''}
                    </div>
                  </div>
                  {it.status === 'pending' && (
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => singleApprove(it.id)}
                        disabled={busy}
                        data-testid={`single-approve-${it.id}`}
                        className="p-2 rounded-lg text-emerald-600 hover:bg-emerald-50 disabled:opacity-50"
                        title="Approve"
                      >
                        <CheckCircle size={18} weight="fill" />
                      </button>
                      <button
                        onClick={() => singleReject(it.id)}
                        disabled={busy}
                        data-testid={`single-reject-${it.id}`}
                        className="p-2 rounded-lg text-rose-600 hover:bg-rose-50 disabled:opacity-50"
                        title="Reject"
                      >
                        <XCircle size={18} weight="fill" />
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
      {/* Create Top Deal modal — same form as /manager/wishlist, available
          right here so team-lead can publish their own pick without
          leaving the approvals page. */}
      <AnimatePresence>
        {createOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-3 sm:p-6"
            onClick={() => setCreateOpen(false)}
          >
            <motion.div
              initial={{ opacity: 0, y: 20, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.98 }}
              className="bg-white rounded-2xl w-full max-w-3xl max-h-[92vh] overflow-hidden flex flex-col"
              onClick={(e) => e.stopPropagation()}
              data-testid="create-top-deal-modal"
            >
              <div className="px-5 py-4 border-b border-[#E4E4E7] flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Sparkle size={18} className="text-amber-500" weight="fill" />
                  <h3 className="font-semibold text-[#18181B] text-lg">New curated pick</h3>
                </div>
                <button
                  onClick={() => setCreateOpen(false)}
                  data-testid="close-create-top-deal"
                  className="p-2 rounded-lg hover:bg-[#F4F4F5]"
                >
                  <X size={20} />
                </button>
              </div>
              <div className="p-5 overflow-auto">
                <WishlistDealForm
                  compact
                  showCancel
                  onCancel={() => setCreateOpen(false)}
                  onCreated={() => {
                    setCreateOpen(false);
                    // Свежесозданная карточка имеет status=pending → переключаем
                    // на вкладку Pending и обновляем список.
                    setTab('pending');
                    fetchItems();
                  }}
                />
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

export default TeamWishlistApprovalsPage;
