/**
 * Compare Page (Customer Cabinet)
 *
 * Path: /cabinet/:customerId/compare
 *
 * Unified marketplace-style comparison:
 *   • Each car is a single, self-contained card (photo → title → spec rows
 *     inside the same rounded border) — same visual language as Favorites.
 *   • Cards sit side-by-side; spec rows align horizontally so the user can
 *     compare values across cars without losing the "this car = this card"
 *     mental model.
 *   • Rows where every car has no value are dropped completely (no
 *     unnecessary "—" rows). When at least one car has the value, all cards
 *     render the row (the empty ones show "—" so the user understands "we
 *     know about this one, we don't know about the other").
 *   • Adding a third car is a tiny inline pill in the header (not a giant
 *     placeholder column) and links to the catalog so the user can pick a
 *     new vehicle.
 *   • Mobile: vertical pager (one card at a time).
 */

import React, { useMemo, useState } from 'react';
import {
  Scales,
  Trash,
  Plus,
  Heart,
  Gauge,
  MapPin,
  Calendar,
  Car as CarIcon,
  GasPump,
  Wrench,
  Hammer,
  ShieldCheck,
  TrendUp,
  CurrencyDollar,
  Warning,
  CaretLeft,
  CaretRight,
} from '@phosphor-icons/react';
import { useNavigate, useParams } from 'react-router-dom';
import { useCompare } from '../../hooks/useCompare';

/* ─────────────────────────── Helpers ─────────────────────────── */

const isEmptyVal = (v) =>
  v == null
  || v === ''
  || (Array.isArray(v) && v.length === 0)
  || (typeof v === 'number' && Number.isNaN(v));

const fmtMoney = (v, currency = 'USD') => {
  if (isEmptyVal(v) || Number.isNaN(Number(v))) return null;
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency || 'USD',
      maximumFractionDigits: 0,
    }).format(Number(v));
  } catch {
    return `$${Number(v).toLocaleString()}`;
  }
};

const fmtMileage = (v, unit) => {
  if (isEmptyVal(v) || Number.isNaN(Number(v))) return null;
  return `${Number(v).toLocaleString('en-US')} ${unit || 'mi'}`;
};

const fmtDate = (v) => {
  if (!v) return null;
  try {
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) return String(v);
    return d.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
  } catch {
    return String(v);
  }
};

const FALLBACK_IMG =
  'data:image/svg+xml;utf8,'
  + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 320">'
      + '<rect width="100%" height="100%" fill="#1B1B1F"/>'
      + '<path d="M120 200 L200 130 L260 175 L320 145 L380 200 Z" fill="#27272A"/>'
      + '<circle cx="240" cy="120" r="22" fill="#27272A"/>'
      + '<text x="50%" y="86%" font-family="system-ui" font-size="20" fill="#52525B" text-anchor="middle">No photo</text>'
      + '</svg>',
  );

const dealStatusStyles = {
  good_deal: { bg: 'bg-emerald-500/15', text: 'text-emerald-400', dot: 'bg-emerald-400' },
  fair_deal: { bg: 'bg-amber-500/15',   text: 'text-amber-400',   dot: 'bg-amber-400' },
  bad_deal:  { bg: 'bg-red-500/15',     text: 'text-red-400',     dot: 'bg-red-400' },
};

/* Parameter rows (most → least important) */
const ROW_DEFS = [
  {
    key: 'year', label: 'Year', icon: Calendar,
    render: (v) => (v ? <span className="font-semibold">{v}</span> : null),
  },
  {
    key: 'bodyType', label: 'Body type', icon: CarIcon,
    render: (v) => (v ? <span className="capitalize">{String(v).toLowerCase()}</span> : null),
  },
  {
    key: 'mileage', label: 'Mileage', icon: Gauge, compare: 'lowerBetter',
    render: (v, item) => {
      const m = fmtMileage(v, item.mileageUnit);
      return m ? <span className="font-semibold">{m}</span> : null;
    },
  },
  {
    key: 'price', label: 'Price', icon: CurrencyDollar, compare: 'lowerBetter',
    render: (v, item) => {
      const m = fmtMoney(v, item.currency);
      return m ? <span className="font-semibold text-[#FEAE00]">{m}</span> : null;
    },
  },
  {
    key: 'maxBid', label: 'Max bid', icon: TrendUp,
    render: (v, item) => {
      const m = fmtMoney(v, item.currency);
      return m ? <span className="font-medium text-emerald-400">{m}</span> : null;
    },
  },
  {
    key: 'finalAllInPrice', label: 'All-in price', icon: CurrencyDollar, compare: 'lowerBetter',
    render: (v, item) => fmtMoney(v, item.currency),
  },
  {
    key: 'damage', label: 'Damage', icon: Warning,
    render: (v) => v
      ? <span className="capitalize text-red-300">{String(v).toLowerCase()}</span>
      : null,
  },
  {
    key: 'saleDate', label: 'Auction date', icon: Hammer,
    render: (v) => {
      const d = fmtDate(v);
      return d ? <span>{d}</span> : null;
    },
  },
  {
    key: 'location', label: 'Location', icon: MapPin,
    render: (v) => (v ? <span className="text-white/90">{v}</span> : null),
  },
  {
    key: 'auctionName', label: 'Auction', icon: Hammer,
    render: (v) => (v
      ? <span className="uppercase tracking-wide text-xs font-semibold text-[#FEAE00]">{v}</span>
      : null),
  },
  {
    key: 'lotNumber', label: 'Lot #', icon: Hammer,
    render: (v) => (v ? <span className="font-mono text-xs">{v}</span> : null),
  },
  {
    key: 'drive', label: 'Drive', icon: CarIcon,
    render: (v) => (v ? <span className="uppercase">{String(v)}</span> : null),
  },
  {
    key: 'fuel', label: 'Fuel', icon: GasPump,
    render: (v) => (v ? <span className="capitalize">{String(v).toLowerCase()}</span> : null),
  },
  {
    key: 'transmission', label: 'Transmission', icon: Wrench,
    render: (v) => (v ? <span className="capitalize">{String(v).toLowerCase()}</span> : null),
  },
  {
    key: 'confidence', label: 'Confidence', icon: ShieldCheck,
    render: (v) => (v != null
      ? <span className="font-semibold">{Math.round(Number(v) * 100)}%</span>
      : null),
  },
  {
    key: 'dealStatus', label: 'Deal status', icon: TrendUp,
    render: (v) => {
      if (!v) return null;
      const s = dealStatusStyles[v] || dealStatusStyles.fair_deal;
      const label = v === 'good_deal' ? 'Good deal' : v === 'bad_deal' ? 'Bad deal' : 'Fair deal';
      return (
        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${s.bg} ${s.text}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
          {label}
        </span>
      );
    },
  },
];

/* ─────────────────────────── Page ─────────────────────────── */

export default function ComparePage() {
  const navigate = useNavigate();
  const { customerId } = useParams();
  const { resolved, items, loading, remove, clear, count } = useCompare();
  const [mobileIdx, setMobileIdx] = useState(0);

  const data = useMemo(
    () => (resolved.length
      ? resolved
      : items.map((it) => ({
        vehicleId: it.vehicleId || it.vin,
        vin: it.vin,
        ...(it.snapshot || {}),
      }))),
    [resolved, items],
  );

  /* Only keep rows where at least one car has a non-empty value */
  const visibleRows = useMemo(() => {
    if (data.length === 0) return [];
    return ROW_DEFS.filter((row) => data.some((item) => !isEmptyVal(item[row.key])));
  }, [data]);

  /* Leader detection for "lowerBetter" rows (cheapest price, lowest mileage…) */
  const leaderByKey = useMemo(() => {
    const map = {};
    if (data.length < 2) return map;
    visibleRows.forEach((row) => {
      if (row.compare !== 'lowerBetter') return;
      const vals = data
        .map((it) => ({ id: it.vin || it.vehicleId, n: Number(it[row.key]) }))
        .filter((x) => !Number.isNaN(x.n) && x.n > 0);
      if (vals.length < 2) return;
      vals.sort((a, b) => a.n - b.n);
      map[row.key] = vals[0].id;
    });
    return map;
  }, [data, visibleRows]);

  /* Safe pager index */
  const safeMobileIdx = Math.min(mobileIdx, Math.max(0, data.length - 1));

  /* ─── States ─── */

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20" data-testid="compare-loading">
        <div className="w-8 h-8 border-2 border-zinc-400 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  /* Empty state */
  if (!count) {
    return (
      <div className="space-y-6">
        <CompareHeader count={0} onClear={null} onAddCar={null} />
        <div className="rounded-3xl border border-dashed border-zinc-700 bg-[#0F0F11] p-10 md:p-16 text-center">
          <div className="mx-auto w-16 h-16 rounded-2xl bg-[#FEAE00]/10 flex items-center justify-center mb-5">
            <Scales size={32} weight="duotone" className="text-[#FEAE00]" />
          </div>
          <h3 className="text-xl md:text-2xl font-bold text-white mb-2">
            Nothing to compare yet
          </h3>
          <p className="text-zinc-400 mb-6 max-w-md mx-auto">
            Browse the catalog and pick at least two vehicles to see them side-by-side.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <button
              onClick={() => navigate('/catalog')}
              className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-[#FEAE00] text-[#18181B] font-semibold hover:bg-[#E89D00] transition-colors"
              data-testid="compare-empty-open-catalog"
            >
              <CarIcon size={18} weight="fill" /> Browse catalog
            </button>
            <button
              onClick={() => navigate(customerId ? `/cabinet/${customerId}/favorites` : '/cabinet/favorites')}
              className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-zinc-800 text-white hover:bg-zinc-700 transition-colors"
            >
              <Heart size={18} weight="fill" /> Open Favorites
            </button>
          </div>
        </div>
      </div>
    );
  }

  const canAddMore = data.length < 3;
  const need2 = count === 1;

  return (
    <div className="space-y-6" data-testid="compare-page">
      <CompareHeader
        count={count}
        onClear={clear}
        onAddCar={canAddMore ? () => navigate('/catalog') : null}
      />

      {/* Need-at-least-2 banner — only when exactly 1 car is in the list */}
      {need2 && (
        <div className="rounded-2xl bg-amber-500/10 border border-amber-500/30 p-4 md:p-5 flex items-start gap-3">
          <div className="shrink-0 w-9 h-9 rounded-xl bg-amber-500/20 flex items-center justify-center">
            <Warning size={18} weight="fill" className="text-amber-400" />
          </div>
          <div className="flex-1">
            <p className="font-semibold text-amber-100">
              Add 1 more car to start comparing
            </p>
            <p className="text-sm text-amber-200/80 mt-0.5">
              Comparison works with 2 or 3 cars. Pick another vehicle from the catalog.
            </p>
          </div>
          <button
            onClick={() => navigate('/catalog')}
            className="hidden sm:inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-amber-500 text-[#18181B] font-semibold text-sm hover:bg-amber-400 transition-colors"
            data-testid="compare-banner-browse"
          >
            <Plus size={16} /> Browse catalog
          </button>
        </div>
      )}

      {/* ─────────── DESKTOP / TABLET (≥ md) ─────────── */}
      <div
        className={`hidden md:grid gap-4 ${data.length === 1 ? 'grid-cols-1 max-w-md' : 'grid-cols-2'} ${data.length === 3 ? '!grid-cols-3' : ''}`}
      >
        {data.map((item) => (
          <CarCompareCard
            key={item.vehicleId || item.vin}
            item={item}
            rows={visibleRows}
            leaderByKey={leaderByKey}
            onRemove={remove}
          />
        ))}
      </div>

      {/* ─────────── MOBILE (< md): pager + single card ─────────── */}
      <div className="md:hidden space-y-4">
        {data.length > 1 && (
          <div className="flex items-center justify-between gap-2">
            <button
              onClick={() => setMobileIdx((i) => Math.max(0, i - 1))}
              disabled={safeMobileIdx === 0}
              className="w-10 h-10 rounded-full bg-zinc-800 text-white disabled:opacity-30 flex items-center justify-center"
              aria-label="Previous car"
            >
              <CaretLeft size={18} weight="bold" />
            </button>
            <div className="flex gap-1.5">
              {data.map((_, i) => (
                <button
                  key={i}
                  onClick={() => setMobileIdx(i)}
                  className={`h-1.5 rounded-full transition-all ${i === safeMobileIdx ? 'bg-[#FEAE00] w-8' : 'bg-zinc-700 w-3'}`}
                  aria-label={`Go to car ${i + 1}`}
                />
              ))}
            </div>
            <button
              onClick={() => setMobileIdx((i) => Math.min(data.length - 1, i + 1))}
              disabled={safeMobileIdx >= data.length - 1}
              className="w-10 h-10 rounded-full bg-zinc-800 text-white disabled:opacity-30 flex items-center justify-center"
              aria-label="Next car"
            >
              <CaretRight size={18} weight="bold" />
            </button>
          </div>
        )}

        {data[safeMobileIdx] && (
          <CarCompareCard
            item={data[safeMobileIdx]}
            rows={visibleRows}
            leaderByKey={leaderByKey}
            onRemove={remove}
            // On mobile we also surface the "other car's" value as a small chip
            // next to each row so the comparison context isn't lost while paging.
            peers={data.filter((_, i) => i !== safeMobileIdx)}
            onPeerClick={(idx) => {
              const peerVehicleId = data.filter((_, i) => i !== safeMobileIdx)[idx]?.vehicleId
                || data.filter((_, i) => i !== safeMobileIdx)[idx]?.vin;
              const realIdx = data.findIndex((d) => (d.vehicleId || d.vin) === peerVehicleId);
              if (realIdx >= 0) setMobileIdx(realIdx);
            }}
          />
        )}
      </div>
    </div>
  );
}

/* ─────────────────────────── Header ─────────────────────────── */

function CompareHeader({ count, onClear, onAddCar }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        <div className="p-3 rounded-2xl bg-[#FEAE00]/15 ring-1 ring-[#FEAE00]/30">
          <Scales size={24} weight="fill" className="text-[#FEAE00]" />
        </div>
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-white leading-tight">
            Comparison
          </h1>
          <p className="text-zinc-400 text-sm mt-0.5">
            {count} / 3 cars
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        {onAddCar && (
          <button
            onClick={onAddCar}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-zinc-800 text-zinc-200 hover:bg-[#FEAE00] hover:text-[#18181B] border border-zinc-700 hover:border-[#FEAE00] transition-colors text-sm font-medium"
            data-testid="compare-add-car-btn"
            title="Add another car from the catalog"
          >
            <Plus size={14} weight="bold" /> Add car
          </button>
        )}
        {onClear && count > 0 && (
          <button
            onClick={onClear}
            className="inline-flex items-center justify-center gap-2 px-3 py-2 rounded-xl border border-zinc-700 text-zinc-300 hover:bg-zinc-800 hover:text-white hover:border-zinc-600 transition-colors text-sm font-medium"
            data-testid="clear-compare-btn"
          >
            <Trash size={14} />
            Clear
          </button>
        )}
      </div>
    </div>
  );
}

/* ─────────────────── Single Car Card (photo + specs in one card) ─────────────────── */

function CarCompareCard({ item, rows, leaderByKey, onRemove, peers, onPeerClick }) {
  const navigate = useNavigate();
  const title = item.title || [item.year, item.make, item.model].filter(Boolean).join(' ');
  const price = fmtMoney(item.price, item.currency);
  const mileage = fmtMileage(item.mileage, item.mileageUnit);

  const openDetail = () => {
    if (item.vin) navigate(`/vin/${encodeURIComponent(item.vin)}`);
  };

  const carKey = String(item.vin || item.vehicleId || '').toUpperCase();

  return (
    <div
      className="group relative flex flex-col overflow-hidden rounded-2xl border border-zinc-800 bg-gradient-to-b from-[#17171A] to-[#0F0F11] shadow-lg shadow-black/30 hover:border-zinc-700 transition-colors"
      data-testid={`compare-card-${item.vin}`}
    >
      {/* Photo */}
      <button
        type="button"
        onClick={openDetail}
        className="block w-full aspect-[16/10] overflow-hidden bg-zinc-900 relative"
        aria-label={title}
      >
        <img
          src={item.image || FALLBACK_IMG}
          alt={title}
          loading="lazy"
          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
          onError={(e) => { e.currentTarget.src = FALLBACK_IMG; }}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/0 to-transparent" />
        <span
          role="button"
          tabIndex={0}
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); onRemove?.(item.vehicleId || item.vin); }}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); onRemove?.(item.vehicleId || item.vin); } }}
          className="absolute top-3 right-3 inline-flex items-center justify-center w-9 h-9 rounded-full bg-black/60 backdrop-blur-sm text-white/90 hover:bg-red-500 hover:text-white transition-colors cursor-pointer"
          aria-label="Remove"
          data-testid={`remove-compare-${item.vin}`}
        >
          <Trash size={16} />
        </span>
        {price && (
          <div className="absolute bottom-3 left-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#FEAE00] text-[#18181B] font-bold text-sm shadow-lg">
            {price}
          </div>
        )}
        {mileage && (
          <div className="absolute bottom-3 right-3 inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-black/60 backdrop-blur-sm text-white/90 text-xs font-semibold">
            <Gauge size={14} />
            {mileage}
          </div>
        )}
      </button>

      {/* Title + VIN block (inside the same card) */}
      <div className="px-4 pt-4 pb-3 space-y-1.5 border-b border-zinc-800/80">
        <button type="button" onClick={openDetail} className="text-left w-full">
          <h3 className="text-base font-bold text-white leading-tight line-clamp-2 group-hover:text-[#FEAE00] transition-colors">
            {title || 'Unknown vehicle'}
          </h3>
        </button>
        {item.vin && (
          <p className="text-[11px] font-mono text-zinc-500 tracking-wide truncate" title={item.vin}>
            VIN: {item.vin}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-1.5 pt-1">
          {item.bodyType && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-zinc-800/80 text-zinc-300 text-[11px] capitalize">
              <CarIcon size={12} />
              {String(item.bodyType).toLowerCase()}
            </span>
          )}
          {item.fuel && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-zinc-800/80 text-zinc-300 text-[11px] capitalize">
              <GasPump size={12} />
              {String(item.fuel).toLowerCase()}
            </span>
          )}
        </div>
      </div>

      {/* Spec rows — inside the SAME card (unified visual) */}
      <div className="flex flex-col">
        {rows.map((row, ri) => {
          const val = item[row.key];
          const rendered = !isEmptyVal(val) ? row.render(val, item) : null;
          const isLeader = leaderByKey[row.key] === carKey;
          return (
            <div
              key={row.key}
              className={`px-4 py-3 flex items-center justify-between gap-3 border-b border-zinc-800/60 last:border-b-0 ${ri % 2 ? 'bg-white/[0.015]' : ''} ${isLeader ? 'bg-emerald-500/[0.06]' : ''}`}
            >
              <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-zinc-500 min-w-0">
                <row.icon size={13} weight="duotone" className="shrink-0" />
                <span className="truncate">{row.label}</span>
              </div>
              <div className="flex items-center gap-1.5 text-sm text-white/90 text-right min-w-0">
                {isLeader && (
                  <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-emerald-500/20 text-emerald-400 text-[10px] font-bold shrink-0" title="Best in this row">
                    ★
                  </span>
                )}
                <div className="truncate">
                  {rendered || <span className="text-zinc-600">—</span>}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Mobile-only: peers at a glance (so user keeps the comparison context
          while flipping between cards on a phone) */}
      {peers && peers.length > 0 && (
        <div className="px-4 py-3 border-t border-zinc-800 bg-black/30">
          <p className="text-[10px] uppercase tracking-wider text-zinc-500 mb-2">
            Compare with
          </p>
          <div className="flex gap-2 overflow-x-auto -mx-1 px-1 pb-1">
            {peers.map((p, idx) => (
              <button
                key={p.vehicleId || p.vin}
                onClick={() => onPeerClick?.(idx)}
                className="shrink-0 flex items-center gap-2 px-2 py-1.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 hover:border-zinc-700 transition-colors min-w-[180px]"
              >
                <img
                  src={p.image || FALLBACK_IMG}
                  alt=""
                  className="w-10 h-10 rounded-lg object-cover bg-zinc-800"
                  onError={(e) => { e.currentTarget.src = FALLBACK_IMG; }}
                />
                <div className="text-left flex-1 min-w-0">
                  <div className="text-xs font-semibold text-white truncate">
                    {p.title || [p.year, p.make, p.model].filter(Boolean).join(' ')}
                  </div>
                  <div className="text-[10px] text-zinc-500">
                    {p.year || '—'} · {fmtMileage(p.mileage, p.mileageUnit) || '—'}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
