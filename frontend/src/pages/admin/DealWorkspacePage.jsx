/**
 * Wave 6 — Deal Workspace Page (/admin/deals/:id)
 *
 * Thin operational shell. Header + 8 tabs:
 *   Overview, Vehicle, Auction, Deposit, Contract, Payments, Shipping, Timeline
 *
 * Design rules (locked-in for Wave 6):
 *   - No giant superpage. Each tab is a small, focused panel.
 *   - No realtime / chat / AI / workflow automation.
 *   - Health is read-only (computed by backend).
 *   - Stage transitions delegate to existing /api/deals/:id/advance.
 */
import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { API_URL, useAuth } from '../../App';
import { toast } from 'sonner';
import {
  ArrowLeft, ArrowRight, CaretRight, Car, User, Coins, FileText,
  CreditCard, Truck, Clock, Note, Plus, Receipt, Trophy, Gavel,
  ArrowsClockwise,
} from '@phosphor-icons/react';
import PipelineStageBadge from '../../components/deal/PipelineStageBadge';
import DealHealthBadge from '../../components/deal/DealHealthBadge';
import ReassignDialog from '../../components/ui/ReassignDialog';
import useManagersMap from '../../hooks/useManagersMap';

const TABS = [
  { id: 'overview',  label: 'Overview',  Icon: Note },
  { id: 'vehicle',   label: 'Vehicle',   Icon: Car },
  { id: 'auction',   label: 'Auction',   Icon: Gavel },
  { id: 'deposit',   label: 'Deposit',   Icon: Coins },
  { id: 'contract',  label: 'Contract',  Icon: FileText },
  { id: 'payments',  label: 'Payments',  Icon: CreditCard },
  { id: 'shipping',  label: 'Shipping',  Icon: Truck },
  { id: 'timeline',  label: 'Timeline',  Icon: Clock },
];

function fmtMoney(n, ccy = 'USD') {
  if (n == null || isNaN(n)) return '—';
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: ccy, maximumFractionDigits: 0 }).format(Number(n));
  } catch (e) { return `${n} ${ccy}`; }
}

function Section({ title, children, right }) {
  return (
    <div className="rounded-xl border bg-white p-5" style={{ borderColor: '#E5E7EB' }}>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-base font-semibold" style={{ color: '#0F172A' }}>{title}</h3>
        {right}
      </div>
      {children}
    </div>
  );
}

function KV({ k, v, mono }) {
  return (
    <div className="flex justify-between items-baseline py-1.5" style={{ borderBottom: '1px dashed #F3F4F6' }}>
      <span className="text-sm" style={{ color: '#6B7280' }}>{k}</span>
      <span className={`text-sm font-medium ${mono ? 'font-mono' : ''}`} style={{ color: '#0F172A' }}>{v ?? '—'}</span>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────
function TabOverview({ deal, customer, counts }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <Section title="Customer">
        <KV k="Name" v={customer ? (customer.name || `${customer.first_name || ''} ${customer.last_name || ''}`.trim() || customer.email) : '—'} />
        <KV k="Email" v={customer?.email} mono />
        <KV k="Phone" v={customer?.phone} mono />
        <KV k="Company" v={customer?.company} />
      </Section>
      <Section title="Deal">
        <KV k="Title" v={deal?.title} />
        <KV k="VIN" v={deal?.vin} mono />
        <KV k="Manager" v={deal?.managerId || deal?.manager_id || '—'} mono />
        <KV k="Max bid (USD)" v={fmtMoney(deal?.max_bid_usd, 'USD')} />
        <KV k="Client price" v={fmtMoney(deal?.clientPrice || deal?.value, 'USD')} />
      </Section>
      <Section title="Counts">
        <KV k="Deposits"  v={counts?.deposits} />
        <KV k="Contracts" v={counts?.contracts} />
        <KV k="Payments"  v={counts?.payments} />
        <KV k="Shipments" v={counts?.shipments} />
      </Section>
      <Section title="Lifecycle">
        <KV k="Created"  v={deal?.created_at ? new Date(deal.created_at).toLocaleString() : '—'} />
        <KV k="Updated"  v={deal?.updated_at ? new Date(deal.updated_at).toLocaleString() : '—'} />
        <KV k="Deposit confirmed" v={deal?.deposit_paid_at ? new Date(deal.deposit_paid_at).toLocaleString() : '—'} />
        <KV k="Delivered" v={deal?.delivered_at ? new Date(deal.delivered_at).toLocaleString() : '—'} />
      </Section>
    </div>
  );
}

function TabVehicle({ deal }) {
  return (
    <Section title="Vehicle">
      <KV k="VIN" v={deal?.vin} mono />
      <KV k="Title" v={deal?.title} />
      <KV k="Year/Make/Model" v={[deal?.year, deal?.make, deal?.model].filter(Boolean).join(' ') || '—'} />
      <KV k="Mileage" v={deal?.mileage} />
      <KV k="Description" v={deal?.description} />
    </Section>
  );
}

function TabAuction({ deal }) {
  return (
    <Section title="Auction">
      <KV k="Max bid (USD)" v={fmtMoney(deal?.max_bid_usd, 'USD')} />
      <KV k="Auction date" v={deal?.auction_date ? new Date(deal.auction_date).toLocaleString() : '—'} />
      <KV k="Source" v={deal?.auction_source || deal?.source} />
      <KV k="Lot number" v={deal?.lot_number} mono />
      <p className="text-xs mt-3" style={{ color: '#9CA3AF' }}>
        Bid placement and result confirmation continue to live in the existing operational pages.
        This tab summarises the most relevant auction facts only.
      </p>
    </Section>
  );
}

function TabDeposit({ counts }) {
  return (
    <Section title="Deposit" right={<span className="text-xs" style={{ color: '#6B7280' }}>{counts?.deposits ?? 0} on file</span>}>
      <p className="text-sm" style={{ color: '#6B7280' }}>
        Deposit lifecycle (create, confirm, refund, forfeit) is handled on <strong>/admin/legal?tab=deposit_v2</strong>.
        Wave 6 keeps this tab as a summary so the workspace remains thin.
      </p>
    </Section>
  );
}

function TabContract({ counts }) {
  return (
    <Section title="Contracts" right={<span className="text-xs" style={{ color: '#6B7280' }}>{counts?.contracts ?? 0} on file</span>}>
      <p className="text-sm" style={{ color: '#6B7280' }}>
        Contract lifecycle (draft / sent / signed / stamped / finalised) lives on the legal workflow page.
      </p>
    </Section>
  );
}

function TabPayments({ counts }) {
  return (
    <Section title="Payments" right={<span className="text-xs" style={{ color: '#6B7280' }}>{counts?.payments ?? 0} entries</span>}>
      <p className="text-sm" style={{ color: '#6B7280' }}>
        Payments tracking is on <strong>/admin/payments</strong>. This tab will show the most recent payment summary here in a future iteration.
      </p>
    </Section>
  );
}

function TabShipping({ counts }) {
  return (
    <Section title="Shipping" right={<span className="text-xs" style={{ color: '#6B7280' }}>{counts?.shipments ?? 0} shipments</span>}>
      <p className="text-sm" style={{ color: '#6B7280' }}>
        Logistics, ETA and customs are tracked on the shipping pages. Wave 6 only links here.
      </p>
    </Section>
  );
}

function TimelineEvent({ ev }) {
  return (
    <div className="flex gap-3 py-3" style={{ borderBottom: '1px solid #F3F4F6' }}>
      <div className="flex-shrink-0 mt-1">
        <div className="w-2 h-2 rounded-full" style={{ background: '#FFA800' }} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm" style={{ color: '#0F172A' }}>{ev.message}</div>
        <div className="flex items-center gap-2 mt-1 text-xs" style={{ color: '#9CA3AF' }}>
          <span className="font-mono">{ev.event_type}</span>
          <span>•</span>
          <span>{ev.at ? new Date(ev.at).toLocaleString() : ''}</span>
          {ev.actor?.email ? (<><span>•</span><span>{ev.actor.email}</span></>) : null}
        </div>
      </div>
    </div>
  );
}

function TabTimeline({ dealId, onAfterNote }) {
  const [events, setEvents] = useState(null);
  const [note, setNote] = useState('');
  const [posting, setPosting] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await axios.get(`${API_URL}/api/admin/deals/${dealId}/timeline?limit=200`);
      setEvents(r.data.events || []);
    } catch (e) {
      toast.error('Failed to load timeline');
      setEvents([]);
    }
  }, [dealId]);

  useEffect(() => { load(); }, [load]);

  const submit = async (e) => {
    e?.preventDefault?.();
    if (!note.trim()) return;
    setPosting(true);
    try {
      await axios.post(`${API_URL}/api/admin/deals/${dealId}/notes`, { text: note.trim() });
      setNote('');
      await load();
      onAfterNote?.();
      toast.success('Note added');
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to add note');
    } finally {
      setPosting(false);
    }
  };

  return (
    <Section title="Timeline" right={<span className="text-xs" style={{ color: '#6B7280' }}>{events?.length ?? 0} events</span>}>
      <form onSubmit={submit} className="mb-4 flex gap-2">
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Add a note (e.g. ‘Customer confirmed, will send wire today’)…"
          className="flex-1 border rounded-md px-3 py-2 text-sm"
          style={{ borderColor: '#D1D5DB' }}
          data-testid="deal-note-input"
          maxLength={4000}
        />
        <button
          type="submit"
          disabled={posting || !note.trim()}
          className="px-4 py-2 rounded-md text-sm font-semibold disabled:opacity-50"
          style={{ background: '#FFA800', color: '#111' }}
          data-testid="deal-note-submit"
        >
          <Plus size={14} className="inline mr-1" /> Add note
        </button>
      </form>
      {events === null ? (
        <div className="text-sm py-4 text-center" style={{ color: '#9CA3AF' }}>Loading…</div>
      ) : events.length === 0 ? (
        <div className="text-sm py-6 text-center" style={{ color: '#9CA3AF' }}>
          No events yet. Operational milestones will appear here automatically.
        </div>
      ) : (
        <div>
          {events.map((ev) => <TimelineEvent key={ev.id} ev={ev} />)}
        </div>
      )}
    </Section>
  );
}

// ──────────────────────────────────────────────────────────────────────────
export default function DealWorkspacePage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const role = (user?.role || '').toLowerCase();
  const canReassign = ['admin', 'owner', 'master_admin', 'team_lead'].includes(role);
  const { managers: managersMap, invalidate: invalidateManagers } = useManagersMap();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [active, setActive] = useState('overview');
  const [showReassign, setShowReassign] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const r = await axios.get(`${API_URL}/api/admin/deals/${id}`);
      setData(r.data.data);
    } catch (e) {
      const status = e.response?.status;
      setError(status === 403 ? 'You do not have access to this deal.' :
               status === 404 ? 'Deal not found.' :
               (e.response?.data?.detail || 'Failed to load deal'));
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  if (error) {
    return (
      <div className="p-6">
        <button onClick={() => navigate('/admin/legal?tab=deal_pipeline')} className="mb-4 inline-flex items-center gap-1 text-sm" style={{ color: '#6B7280' }}>
          <ArrowLeft size={14} /> Back to deals
        </button>
        <div className="rounded-xl border p-6 text-sm" style={{ background: '#FEF2F2', borderColor: '#FECACA', color: '#7F1D1D' }}>
          {error}
        </div>
      </div>
    );
  }

  if (!data) {
    return <div className="p-6 text-sm" style={{ color: '#9CA3AF' }}>Loading deal workspace…</div>;
  }

  const { deal, customer, pipeline_stage, stage_legacy, health, counts } = data;

  return (
    <div className="p-6 max-w-7xl mx-auto" data-testid="deal-workspace">
      <button
        onClick={() => navigate(-1)}
        className="mb-4 inline-flex items-center gap-1 text-sm hover:underline"
        style={{ color: '#6B7280' }}
      >
        <ArrowLeft size={14} /> Back
      </button>

      {/* HEADER */}
      <div className="rounded-xl border bg-white p-5 mb-4" style={{ borderColor: '#E5E7EB' }}>
        <div className="flex flex-wrap items-start gap-4 justify-between">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold mb-1" style={{ color: '#0F172A' }}>
              {deal?.title || 'Untitled deal'}
            </h1>
            <div className="flex items-center flex-wrap gap-2 text-sm" style={{ color: '#6B7280' }}>
              {deal?.vin && <span className="font-mono">VIN {deal.vin}</span>}
              {deal?.vin && customer && <span>•</span>}
              {customer && (
                <span>
                  {customer.name || `${customer.first_name || ''} ${customer.last_name || ''}`.trim() || customer.email}
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => navigate(`/admin/deals/${dealId}/360`)}
              className="px-3 py-1.5 rounded-xl bg-[#18181B] hover:bg-[#3F3F46] text-white text-sm font-semibold flex items-center gap-1.5 transition-colors"
              data-testid="deal-open-360-btn"
              title="Open the Deal360 single-pane view"
            >
              Deal 360 →
            </button>
            {canReassign && (
              <button
                onClick={() => setShowReassign(true)}
                className="px-3 py-1.5 rounded-xl bg-[#EEF2FF] hover:bg-[#E0E7FF] text-[#4F46E5] text-sm font-semibold flex items-center gap-1.5 transition-colors"
                data-testid="deal-reassign-btn"
                title="Reassign deal to another manager"
              >
                <ArrowsClockwise size={14} weight="bold" /> Reassign
              </button>
            )}
            <PipelineStageBadge stage={pipeline_stage} />
            <DealHealthBadge health={health} />
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mt-4">
          <div>
            <div className="text-xs uppercase tracking-wide" style={{ color: '#9CA3AF' }}>Manager</div>
            <div className="text-sm font-medium" style={{ color: '#0F172A' }}>
              {deal?.managerId && managersMap[deal.managerId]
                ? (managersMap[deal.managerId].name || managersMap[deal.managerId].email)
                : (deal?.managerId || deal?.manager_id || <span className="italic text-[#A1A1AA]">unassigned</span>)}
            </div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-wide" style={{ color: '#9CA3AF' }}>Max bid</div>
            <div className="text-sm font-medium" style={{ color: '#0F172A' }}>{fmtMoney(deal?.max_bid_usd, 'USD')}</div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-wide" style={{ color: '#9CA3AF' }}>Legacy stage</div>
            <div className="text-sm font-medium font-mono" style={{ color: '#0F172A' }}>{stage_legacy || '—'}</div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-wide" style={{ color: '#9CA3AF' }}>Created</div>
            <div className="text-sm font-medium" style={{ color: '#0F172A' }}>{deal?.created_at ? new Date(deal.created_at).toLocaleDateString() : '—'}</div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-wide" style={{ color: '#9CA3AF' }}>Timeline events</div>
            <div className="text-sm font-medium" style={{ color: '#0F172A' }}>{counts?.timeline_events ?? 0}</div>
          </div>
        </div>
      </div>

      {/* TABS */}
      <div className="flex flex-wrap gap-2 mb-4" data-testid="deal-tabs">
        {TABS.map((t) => {
          const Icon = t.Icon;
          const isActive = active === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setActive(t.id)}
              data-testid={`deal-tab-${t.id}`}
              className={`inline-flex items-center gap-1.5 px-3 py-2 text-sm rounded-md border transition`}
              style={{
                borderColor: isActive ? '#FFA800' : '#E5E7EB',
                background:  isActive ? '#FFF7E6' : '#FFFFFF',
                color:       isActive ? '#7C2D12' : '#374151',
                fontWeight:  isActive ? 700 : 500,
              }}
            >
              <Icon size={14} /> {t.label}
            </button>
          );
        })}
      </div>

      {/* TAB CONTENT */}
      {active === 'overview' && <TabOverview deal={deal} customer={customer} counts={counts} />}
      {active === 'vehicle'  && <TabVehicle  deal={deal} />}
      {active === 'auction'  && <TabAuction  deal={deal} />}
      {active === 'deposit'  && <TabDeposit  counts={counts} />}
      {active === 'contract' && <TabContract counts={counts} />}
      {active === 'payments' && <TabPayments counts={counts} />}
      {active === 'shipping' && <TabShipping counts={counts} />}
      {active === 'timeline' && <TabTimeline dealId={deal?.id || deal?._id || id} onAfterNote={load} />}

      {/* Wave 7 — Reassign deal dialog */}
      {canReassign && showReassign && (
        <ReassignDialog
          open={showReassign}
          onClose={() => setShowReassign(false)}
          entity="deal"
          ids={[deal?.id || deal?._id || id]}
          currentManagerId={deal?.managerId}
          onSuccess={() => {
            invalidateManagers();
            load();
          }}
        />
      )}
    </div>
  );
}
