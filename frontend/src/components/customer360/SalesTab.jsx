/**
 * SalesTab — Customer360 tab showing all sales for a single customer.
 * Read + create + status transitions. Reuses /api/customers/{cid}/sales.
 */
import React, { useEffect, useState, useCallback } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { Banknote, Plus, ExternalLink, CheckCircle2, XCircle } from 'lucide-react';

const API_URL = process.env.REACT_APP_BACKEND_URL || '';

const STATUS_BADGE = {
  draft:     { bg: 'bg-zinc-100',    text: 'text-zinc-700',    label: 'Draft' },
  active:    { bg: 'bg-amber-100',   text: 'text-amber-700',   label: 'Active' },
  sold:      { bg: 'bg-emerald-100', text: 'text-emerald-700', label: 'Sold' },
  cancelled: { bg: 'bg-rose-100',    text: 'text-rose-700',    label: 'Cancelled' },
};

export default function SalesTab({ customerId }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!customerId) return;
    setLoading(true);
    try {
      const r = await axios.get(`${API_URL}/api/customers/${customerId}/sales`);
      setItems(r.data?.items || []);
    } catch (e) {
      toast.error('Failed to load sales');
    } finally {
      setLoading(false);
    }
  }, [customerId]);

  useEffect(() => { load(); }, [load]);

  const markSold = async (s) => {
    try {
      await axios.patch(`${API_URL}/api/sales/${s.id}`, { status: 'sold' });
      toast.success('Marked as sold');
      await load();
    } catch (e) { toast.error('Failed to update'); }
  };

  const cancelSale = async (s) => {
    if (!window.confirm(`Cancel sale ${s.vin || s.lot || s.id}?`)) return;
    try {
      await axios.delete(`${API_URL}/api/sales/${s.id}`);
      toast.success('Sale cancelled');
      await load();
    } catch (e) { toast.error('Failed to cancel'); }
  };

  return (
    <div className="space-y-4" data-testid="customer360-sales-tab">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Banknote className="w-5 h-5 text-zinc-500" />
          <h3 className="text-base font-semibold text-zinc-900">Sales ({items.length})</h3>
        </div>
        <a
          href={`/admin/sales`}
          className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-xl bg-[#18181B] hover:bg-[#27272A] text-white text-[12.5px] font-semibold"
          data-testid="sales-tab-add-link"
        >
          <Plus className="w-4 h-4" /> Add Sale
        </a>
      </div>

      {loading ? (
        <div className="text-center py-8 text-zinc-400 text-sm">Loading…</div>
      ) : items.length === 0 ? (
        <div className="text-center py-10 text-zinc-400 text-sm bg-zinc-50 rounded-2xl">
          No sales yet for this customer.
        </div>
      ) : (
        <div className="bg-white border border-zinc-200 rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-zinc-50 text-zinc-600 text-[11.5px] uppercase">
                <tr>
                  <th className="text-left px-4 py-2.5 font-semibold">Vehicle</th>
                  <th className="text-left px-4 py-2.5 font-semibold">VIN / Lot</th>
                  <th className="text-left px-4 py-2.5 font-semibold">Country</th>
                  <th className="text-left px-4 py-2.5 font-semibold">Amount</th>
                  <th className="text-left px-4 py-2.5 font-semibold">Status</th>
                  <th className="text-right px-4 py-2.5 font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {items.map((s) => {
                  const badge = STATUS_BADGE[s.status] || STATUS_BADGE.draft;
                  return (
                    <tr key={s.id} data-testid={`c360-sale-row-${s.id}`}>
                      <td className="px-4 py-3 text-zinc-900 font-medium">
                        {[s.brand, s.model].filter(Boolean).join(' ') || '—'}
                        {s.year ? <span className="text-zinc-500"> · {s.year}</span> : null}
                      </td>
                      <td className="px-4 py-3 font-mono text-[12px]">{s.vin || s.lot || '—'}</td>
                      <td className="px-4 py-3 text-zinc-700">{s.country || '—'}</td>
                      <td className="px-4 py-3 font-semibold text-zinc-900">
                        {Number(s.saleAmount || 0).toLocaleString()} {s.saleCurrency || ''}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold ${badge.bg} ${badge.text}`}>
                          {badge.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="inline-flex items-center gap-1">
                          {s.status !== 'sold' && s.status !== 'cancelled' && (
                            <button
                              onClick={() => markSold(s)}
                              title="Mark as sold"
                              className="h-8 w-8 rounded-lg border border-emerald-100 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 inline-flex items-center justify-center"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                          <a
                            href={`/admin/sales`}
                            title="Open Sales page"
                            className="h-8 w-8 rounded-lg border border-[#E4E4E7] bg-white hover:bg-zinc-50 text-zinc-600 inline-flex items-center justify-center"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                          {s.status !== 'cancelled' && (
                            <button
                              onClick={() => cancelSale(s)}
                              title="Cancel"
                              className="h-8 w-8 rounded-lg border border-rose-100 bg-rose-50 hover:bg-rose-100 text-rose-700 inline-flex items-center justify-center"
                            >
                              <XCircle className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
