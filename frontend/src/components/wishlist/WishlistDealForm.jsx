/**
 * WishlistDealForm  —  переиспользуемая форма создания карточки
 * для блока «Top Deals of the Week».
 *
 * Используется в двух местах:
 *   1. /manager/wishlist — основная страница менеджера
 *   2. /team/wishlist-approvals — кнопка «+ Create Top Deal» открывает
 *      модал с этой же формой (тимлид по основе апрувит, но может
 *      и создавать собственные карточки).
 *
 * Props:
 *   - onCreated?: (item) => void   вызывается после успешного создания
 *   - onCancel?:  () => void       для модала: закрыть после отмены
 *   - compact?:   boolean          компактный layout для модала (без обёрточной карточки)
 *   - showCancel?: boolean         показать кнопку Cancel (для модала)
 */
import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import {
  Plus,
  MagnifyingGlass,
  Car,
  CaretRight,
  Sparkle,
} from '@phosphor-icons/react';

const API_URL = process.env.REACT_APP_BACKEND_URL || '';

const CATEGORIES = [
  { id: 'motorbike', label: 'Motorbike', icon: '/figma/calc/veh-motorbike.png' },
  { id: 'sedan',     label: 'Sedan',     icon: '/figma/calc/veh-sedan.png' },
  { id: 'suv',       label: 'SUV',       icon: '/figma/calc/veh-suv.png' },
  { id: 'pickup',    label: 'Pick-up',   icon: '/figma/calc/veh-pickup.png' },
  { id: 'van',       label: 'Van',       icon: '/figma/calc/veh-van.png' },
];

const BUDGETS = [
  { id: '10-15K', label: '10–15K' },
  { id: '15-25K', label: '15–25K' },
  { id: '30-50K', label: '30–50K' },
];

const WEEKS = [
  { id: 'current', label: 'This week' },
  { id: 'next',    label: 'Next week' },
];

/* ------------------------------------------------------------------ */
/*  VIN autocomplete                                                   */
/* ------------------------------------------------------------------ */
function VinAutocomplete({ value, onChange, onSelect }) {
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const q = (value || '').trim();
    if (q.length < 3) {
      setResults([]);
      return;
    }
    const handle = setTimeout(async () => {
      setLoading(true);
      try {
        const { data } = await axios.get(
          `${API_URL}/api/manager/wishlist-deals/vin-search`,
          { params: { q, limit: 8 } },
        );
        setResults(Array.isArray(data) ? data : []);
        setOpen(true);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 220);
    return () => clearTimeout(handle);
  }, [value]);

  return (
    <div className="relative">
      <div className="relative">
        <MagnifyingGlass size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#71717A]" />
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value.toUpperCase())}
          onFocus={() => results.length && setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 180)}
          placeholder="Enter VIN, lot # or year/make/model"
          data-testid="wishlist-vin-input"
          className="w-full pl-10 pr-4 py-2.5 border border-[#E4E4E7] rounded-xl text-sm focus:outline-none focus:border-[#18181B]"
        />
      </div>
      {open && results.length > 0 && (
        <div className="absolute z-30 left-0 right-0 mt-1 bg-white border border-[#E4E4E7] rounded-xl shadow-lg max-h-80 overflow-auto">
          {results.map((r) => (
            <button
              key={r.vin}
              type="button"
              onClick={() => {
                onSelect(r);
                setOpen(false);
              }}
              data-testid={`wishlist-vin-suggest-${r.vin}`}
              className="w-full text-left px-3 py-2.5 hover:bg-[#FAFAFA] flex items-center gap-3 border-b border-[#F4F4F5] last:border-b-0"
            >
              {r.image ? (
                <img src={r.image} alt={r.vin} className="w-14 h-10 object-cover rounded bg-[#F4F4F5]" />
              ) : (
                <div className="w-14 h-10 rounded bg-[#F4F4F5] flex items-center justify-center">
                  <Car size={16} className="text-[#A1A1AA]" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-[#18181B] truncate">
                  {[r.year, r.make, r.model].filter(Boolean).join(' ') || r.title || r.vin}
                </div>
                <div className="text-xs text-[#71717A] truncate">
                  VIN: {r.vin}{r.lot_number ? ` · Lot ${r.lot_number}` : ''}
                </div>
              </div>
              <CaretRight size={14} className="text-[#A1A1AA] flex-shrink-0" />
            </button>
          ))}
        </div>
      )}
      {loading && (
        <div className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[#71717A]">…</div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Form                                                               */
/* ------------------------------------------------------------------ */
const WishlistDealForm = ({ onCreated, onCancel, compact = false, showCancel = false }) => {
  const [category, setCategory] = useState('sedan');
  const [budget, setBudget] = useState('10-15K');
  const [week, setWeek] = useState('current');
  const [vin, setVin] = useState('');
  const [note, setNote] = useState('');
  const [selectedSnapshot, setSelectedSnapshot] = useState(null);
  const [creating, setCreating] = useState(false);

  const reset = () => {
    setVin('');
    setNote('');
    setSelectedSnapshot(null);
  };

  const handleSubmit = async (e) => {
    e?.preventDefault?.();
    if (!vin.trim()) {
      toast.error('VIN is required');
      return;
    }
    setCreating(true);
    try {
      const { data } = await axios.post(`${API_URL}/api/manager/wishlist-deals`, {
        vin: vin.trim().toUpperCase(),
        category,
        budget,
        week,
        note: note.trim() || undefined,
      });
      toast.success('Wishlist card created — pending team-lead approval');
      reset();
      if (typeof onCreated === 'function') onCreated(data);
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Failed to create');
    } finally {
      setCreating(false);
    }
  };

  const wrapperClass = compact
    ? 'space-y-5'
    : 'bg-white rounded-2xl border border-[#E4E4E7] p-5 sm:p-6 space-y-5';

  return (
    <form onSubmit={handleSubmit} className={wrapperClass} data-testid="wishlist-builder-form">
      {!compact && (
        <div className="flex items-center gap-2">
          <Sparkle size={18} className="text-amber-500" weight="fill" />
          <h2 className="text-lg font-semibold text-[#18181B]">New curated pick</h2>
        </div>
      )}

      {/* Category */}
      <div>
        <label className="text-xs font-semibold uppercase tracking-wider text-[#71717A] mb-2 block">
          Category
        </label>
        <div className="flex flex-wrap gap-2" role="radiogroup">
          {CATEGORIES.map((c) => (
            <button
              key={c.id}
              type="button"
              role="radio"
              aria-checked={category === c.id}
              onClick={() => setCategory(c.id)}
              data-testid={`wishlist-cat-${c.id}`}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-xl border text-sm font-medium transition ${
                category === c.id
                  ? 'bg-amber-400 text-[#18181B] border-amber-400'
                  : 'bg-white text-[#18181B] border-[#E4E4E7] hover:border-[#A1A1AA]'
              }`}
            >
              <span
                aria-hidden
                style={{
                  width: 18,
                  height: 18,
                  backgroundColor: 'currentColor',
                  WebkitMaskImage: `url(${c.icon})`,
                  maskImage: `url(${c.icon})`,
                  WebkitMaskRepeat: 'no-repeat',
                  maskRepeat: 'no-repeat',
                  WebkitMaskPosition: 'center',
                  maskPosition: 'center',
                  WebkitMaskSize: 'contain',
                  maskSize: 'contain',
                  display: 'inline-block',
                }}
              />
              {c.label}
            </button>
          ))}
        </div>
      </div>

      {/* Budget + Week */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <div>
          <label className="text-xs font-semibold uppercase tracking-wider text-[#71717A] mb-2 block">
            Budget
          </label>
          <div className="flex gap-2" role="radiogroup">
            {BUDGETS.map((b) => (
              <button
                key={b.id}
                type="button"
                role="radio"
                aria-checked={budget === b.id}
                onClick={() => setBudget(b.id)}
                data-testid={`wishlist-bud-${b.id}`}
                className={`flex-1 px-4 py-2 rounded-xl border text-sm font-semibold transition ${
                  budget === b.id
                    ? 'bg-amber-400 text-[#18181B] border-amber-400'
                    : 'bg-white text-[#18181B] border-[#E4E4E7] hover:border-[#A1A1AA]'
                }`}
              >
                {b.label}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="text-xs font-semibold uppercase tracking-wider text-[#71717A] mb-2 block">
            Week
          </label>
          <div className="flex gap-2" role="radiogroup">
            {WEEKS.map((w) => (
              <button
                key={w.id}
                type="button"
                role="radio"
                aria-checked={week === w.id}
                onClick={() => setWeek(w.id)}
                className={`flex-1 px-4 py-2 rounded-xl border text-sm font-semibold transition ${
                  week === w.id
                    ? 'bg-[#18181B] text-white border-[#18181B]'
                    : 'bg-white text-[#18181B] border-[#E4E4E7] hover:border-[#A1A1AA]'
                }`}
              >
                {w.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* VIN */}
      <div>
        <label className="text-xs font-semibold uppercase tracking-wider text-[#71717A] mb-2 block">
          Vehicle (VIN)
        </label>
        <VinAutocomplete
          value={vin}
          onChange={(v) => {
            setVin(v);
            setSelectedSnapshot(null);
          }}
          onSelect={(r) => {
            setVin(r.vin || '');
            setSelectedSnapshot(r);
          }}
        />
        {selectedSnapshot && (
          <div className="mt-3 flex items-center gap-3 p-3 bg-[#FAFAFA] border border-[#E4E4E7] rounded-xl">
            {selectedSnapshot.image && (
              <img
                src={selectedSnapshot.image}
                alt={selectedSnapshot.vin}
                className="w-20 h-14 rounded-lg object-cover bg-[#F4F4F5]"
              />
            )}
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-[#18181B] truncate">
                {[selectedSnapshot.year, selectedSnapshot.make, selectedSnapshot.model]
                  .filter(Boolean).join(' ') || selectedSnapshot.title}
              </div>
              <div className="text-xs text-[#71717A] truncate">
                VIN: {selectedSnapshot.vin}
                {selectedSnapshot.lot_number ? ` · Lot ${selectedSnapshot.lot_number}` : ''}
                {selectedSnapshot.auction_name ? ` · ${selectedSnapshot.auction_name}` : ''}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Note */}
      <div>
        <label className="text-xs font-semibold uppercase tracking-wider text-[#71717A] mb-2 block">
          Note (optional)
        </label>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Why is this a great deal?"
          rows={2}
          className="w-full px-3 py-2 border border-[#E4E4E7] rounded-xl text-sm focus:outline-none focus:border-[#18181B] resize-none"
        />
      </div>

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <span className="text-xs text-[#71717A]">
          Submission goes to team-lead for approval.
        </span>
        <div className="flex items-center gap-2">
          {showCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2.5 rounded-xl bg-white border border-[#E4E4E7] text-[#18181B] text-sm font-medium hover:bg-[#F4F4F5]"
            >
              Cancel
            </button>
          )}
          <button
            type="submit"
            disabled={creating || !vin.trim()}
            data-testid="wishlist-submit"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-amber-400 text-[#18181B] font-semibold hover:bg-amber-300 disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            <Plus size={16} weight="bold" />
            {creating ? 'Submitting…' : 'Submit for approval'}
          </button>
        </div>
      </div>
    </form>
  );
};

export default WishlistDealForm;
