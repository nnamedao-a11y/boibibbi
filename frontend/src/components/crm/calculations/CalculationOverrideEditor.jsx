/**
 * P2.7 — Override editor.
 *
 * Lets a manager:
 *  • inline-edit any row value
 *  • hide a row from the client view
 *  • add a custom fee row
 *  • apply a single-line discount
 *
 * Mutations PATCH /api/calculations/{id}/overrides — backend recomputes total.
 * Disabled when calc.status ∈ {final, archived} (immutable audit).
 */
import React, { useState, useMemo, useCallback } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { API_URL } from '../../../App';
import { useLang } from '../../../i18n';
import {
  PencilSimple, Eye, EyeSlash, Trash, Plus, FloppyDisk, X,
  CurrencyEur, CurrencyDollar, Receipt,
} from '@phosphor-icons/react';
import WhiteSelect from '../../../components/ui/WhiteSelect';

const INFO_ROW_KEYS = new Set(['customsBase', 'declaredValue']);
const LOCKED_STATUSES = new Set(['final', 'archived']);

const fmt = (v, ccy = 'EUR') => {
  const sym = ccy === 'USD' ? '$' : '€';
  return `${sym}${Math.round(Number(v) || 0).toLocaleString()}`;
};

export default function CalculationOverrideEditor({ calc, onChange }) {
  const { t } = useLang();
  const overrides = calc?.overrides || { rows: {}, hidden_rows: [], added_rows: [], discount: 0 };
  const breakdown = calc?.breakdown || [];
  const status    = (calc?.status || 'draft').toLowerCase();
  const locked    = LOCKED_STATUSES.has(status);
  const calcId    = calc?.id;

  const [editing, setEditing] = useState(null);  // key currently being edited
  const [draftValue, setDraftValue] = useState('');
  const [adding, setAdding]   = useState(false);
  const [newRow, setNewRow]   = useState({ key: '', label: '', value: '', currency: 'EUR', visibility: 'manager' });
  const [discount, setDiscount] = useState(String(overrides.discount || ''));
  const [busy, setBusy] = useState(false);

  const hidden = useMemo(() => new Set(overrides.hidden_rows || []), [overrides.hidden_rows]);

  const patchOverrides = useCallback(async (next) => {
    if (locked || !calcId) return;
    setBusy(true);
    try {
      const res = await axios.patch(`${API_URL}/api/calculations/${calcId}/overrides`, next);
      if (res.data?.success && res.data?.calculation) {
        onChange?.(res.data.calculation);
        toast.success(t('cmp_override_saved'));
      }
    } catch (err) {
      const msg = err?.response?.data?.detail || err.message;
      toast.error(`Override failed: ${msg}`);
    } finally {
      setBusy(false);
    }
  }, [calcId, locked, onChange]);

  const saveRowValue = async (key) => {
    const num = parseFloat(draftValue);
    if (Number.isNaN(num)) { toast.error(t('cmp_enter_a_number')); return; }
    const nextRows = { ...(overrides.rows || {}), [key]: num };
    await patchOverrides({ rows: nextRows });
    setEditing(null);
  };

  const clearRowOverride = async (key) => {
    const nextRows = { ...(overrides.rows || {}) };
    delete nextRows[key];
    await patchOverrides({ rows: nextRows });
  };

  const toggleHide = async (key) => {
    const arr = new Set(overrides.hidden_rows || []);
    if (arr.has(key)) arr.delete(key); else arr.add(key);
    await patchOverrides({ hidden_rows: Array.from(arr) });
  };

  const addRow = async () => {
    const v = parseFloat(newRow.value);
    if (!newRow.label.trim() || Number.isNaN(v)) {
      toast.error(t('cmp_provide_a_label_and_a_numeric_value'));
      return;
    }
    const key = newRow.key.trim() || `manager_fee_${Date.now()}`;
    const arr = [
      ...(overrides.added_rows || []),
      { key, label: newRow.label.trim(), value: v, currency: newRow.currency, visibility: newRow.visibility },
    ];
    await patchOverrides({ added_rows: arr });
    setAdding(false);
    setNewRow({ key: '', label: '', value: '', currency: 'EUR', visibility: 'manager' });
  };

  const removeAddedRow = async (key) => {
    const arr = (overrides.added_rows || []).filter(r => r.key !== key);
    await patchOverrides({ added_rows: arr });
  };

  const saveDiscount = async () => {
    const v = parseFloat(discount);
    await patchOverrides({ discount: Number.isNaN(v) ? 0 : v });
  };

  return (
    <div className="space-y-3" data-testid="calc-override-editor">
      {locked && (
        <div className="px-3 py-2 rounded-md bg-[#F4F4F5] text-[#71717A] text-xs flex items-center gap-2">
          {t('cmp_this_calculation_is')} <b>{status}</b> {t('cmp_overrides_are_locked_for_audit_integrity')}
        </div>
      )}

      {/* MAIN BREAKDOWN ROWS */}
      <div className="rounded-lg border border-[#E4E4E7] overflow-hidden">
        <div className="px-3 py-2 bg-[#FAFAFA] text-xs font-semibold uppercase tracking-wide text-[#71717A] flex justify-between">
          <span>{t('cmp_breakdown_engine_rows')}</span>
          <span>{breakdown.length} rows</span>
        </div>
        <div className="divide-y divide-[#F4F4F5]">
          {breakdown.map((row) => {
            const k         = row.key;
            const overridden = overrides.rows && k in overrides.rows;
            const isHidden   = hidden.has(k);
            const isInfo     = INFO_ROW_KEYS.has(k);
            const isAdded    = (overrides.added_rows || []).some(r => r.key === k);
            const isEditing  = editing === k;
            return (
              <div key={k}
                   className={`px-3 py-2 flex items-center gap-3 text-sm ${isHidden ? 'opacity-50' : ''} ${isAdded ? 'bg-[#FEF3C7]/40' : ''}`}
                   data-testid={`override-row-${k}`}>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 text-[#18181B] truncate">
                    <span className="truncate">{row.label}</span>
                    {row.visibility && (
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider bg-[#F4F4F5] text-[#71717A]">{row.visibility}</span>
                    )}
                    {isInfo && <span className="text-[10px] text-[#A1A1AA]">(info row, excluded from total)</span>}
                    {isAdded && <span className="text-[10px] text-[#B45309] font-semibold">manager-added</span>}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {isEditing ? (
                    <>
                      <input
                        type="number"
                        value={draftValue}
                        onChange={(e) => setDraftValue(e.target.value)}
                        className="w-28 px-2 py-1 border border-[#D4D4D8] rounded text-sm text-right"
                        autoFocus
                        data-testid={`override-input-${k}`}
                      />
                      <button onClick={() => saveRowValue(k)} disabled={busy} title={t('cmp_save')} className="p-1.5 rounded hover:bg-[#DCFCE7] text-[#16A34A]">
                        <FloppyDisk size={16} weight="bold" />
                      </button>
                      <button onClick={() => setEditing(null)} title={t('cmp_cancel')} className="p-1.5 rounded hover:bg-[#FEE2E2] text-[#71717A]">
                        <X size={16} weight="bold" />
                      </button>
                    </>
                  ) : (
                    <>
                      <div className={`font-mono text-sm tabular-nums ${overridden ? 'text-[#B45309] font-bold' : 'text-[#18181B]'}`}>
                        {fmt(row.value, row.currency)}
                      </div>
                      {overridden && (
                        <button onClick={() => clearRowOverride(k)} disabled={busy} title={t('cmp_clear_override')} className="p-1.5 rounded hover:bg-[#FEE2E2] text-[#DC2626]">
                          <Trash size={14} />
                        </button>
                      )}
                      {!locked && !isInfo && !isAdded && (
                        <button
                          onClick={() => { setEditing(k); setDraftValue(String(row.value || '')); }}
                          title={t('cmp_edit_value')}
                          className="p-1.5 rounded hover:bg-[#E0E7FF] text-[#4F46E5]"
                          data-testid={`override-edit-${k}`}
                        >
                          <PencilSimple size={14} />
                        </button>
                      )}
                      {!locked && !isInfo && (
                        isAdded ? (
                          <button onClick={() => removeAddedRow(k)} disabled={busy} title={t('cmp_remove_added_row')} className="p-1.5 rounded hover:bg-[#FEE2E2] text-[#DC2626]">
                            <Trash size={14} />
                          </button>
                        ) : (
                          <button
                            onClick={() => toggleHide(k)}
                            title={isHidden ? 'Show to client' : 'Hide from client'}
                            className="p-1.5 rounded hover:bg-[#F4F4F5] text-[#71717A]"
                            data-testid={`override-hide-${k}`}
                          >
                            {isHidden ? <EyeSlash size={14} /> : <Eye size={14} />}
                          </button>
                        )
                      )}
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ADD ROW */}
      <div className="rounded-lg border border-[#E4E4E7] p-3">
        {!adding ? (
          <button
            onClick={() => setAdding(true)}
            disabled={locked}
            className="flex items-center gap-2 text-sm font-semibold text-[#4F46E5] hover:text-[#3730A3] disabled:opacity-50"
            data-testid="override-add-row"
          >
            <Plus size={14} weight="bold" /> {t('cmp_add_custom_fee_row')}
          </button>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-5 gap-2">
            <input placeholder={t('cmp_label')}   value={newRow.label}
                   onChange={(e) => setNewRow({ ...newRow, label: e.target.value })}
                   className="px-2 py-1.5 border border-[#D4D4D8] rounded text-sm md:col-span-2" />
            <input placeholder={t('cmp_value')}   type="number" value={newRow.value}
                   onChange={(e) => setNewRow({ ...newRow, value: e.target.value })}
                   className="px-2 py-1.5 border border-[#D4D4D8] rounded text-sm text-right" />
            <WhiteSelect value={newRow.currency} onChange={(e) => setNewRow({ ...newRow, currency: e.target.value })}>
              <option value="EUR">{t('cmp_eur')}</option>
              <option value="USD">{t('cmp_usd')}</option>
            </WhiteSelect>
            <WhiteSelect value={newRow.visibility} onChange={(e) => setNewRow({ ...newRow, visibility: e.target.value })}>
              <option value="client">{t('cmp_visible_to_client')}</option>
              <option value="manager">{t('cmp_manager_only')}</option>
              <option value="admin_only">{t('cmp_admin_only')}</option>
            </WhiteSelect>
            <div className="md:col-span-5 flex items-center gap-2 justify-end">
              <button onClick={() => setAdding(false)} className="px-3 py-1.5 rounded text-sm font-semibold text-[#71717A] hover:bg-[#F4F4F5]">{t('cmp_cancel')}</button>
              <button onClick={addRow} disabled={busy} className="px-3 py-1.5 rounded text-sm font-semibold bg-[#4F46E5] text-white hover:bg-[#3730A3]">{t('cmp_add_row')}</button>
            </div>
          </div>
        )}
      </div>

      {/* DISCOUNT */}
      <div className="rounded-lg border border-[#FECDD3] bg-[#FFF1F2] p-3">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-[#9F1239] mb-2">
          <Receipt size={14} /> {t('cmp_manager_discount')}
        </div>
        <div className="flex items-center gap-2">
          <CurrencyEur size={14} className="text-[#9F1239]" />
          <input
            type="number"
            value={discount}
            onChange={(e) => setDiscount(e.target.value)}
            placeholder="0"
            disabled={locked}
            className="w-32 px-2 py-1.5 border border-[#FCA5A5] rounded text-sm text-right"
            data-testid="override-discount"
          />
          <button
            onClick={saveDiscount}
            disabled={locked || busy}
            className="px-3 py-1.5 rounded text-sm font-semibold bg-[#9F1239] text-white hover:bg-[#881337] disabled:opacity-50"
          >
            {t('cmp_apply_discount')}
          </button>
          <span className="text-xs text-[#71717A] ml-2">{t('cmp_reduces_total_by_this_amount')}</span>
        </div>
      </div>
    </div>
  );
}
