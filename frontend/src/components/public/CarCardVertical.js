import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Scale, Heart } from 'lucide-react';
import { optimizeImage, ImageSize } from '../../lib/optimizeImage';

const fallbackImage =
  'https://images.unsplash.com/photo-1503376780353-7e6692767b70?auto=format&fit=crop&w=1200&q=70';

/**
 * Format an auction countdown identical to the catalog row card:
 *     >= 1 day  →  "1d: 4h: 35m"
 *     <  1 day  →  "12h: 35m"
 *     <  1 hour →  "35m"
 *     past / invalid → null  (caller hides chip)
 */
const formatAuctionCountdown = (raw) => {
  if (!raw) return null;
  try {
    let d;
    if (raw instanceof Date) d = raw;
    else if (typeof raw === 'string') {
      const s = raw.trim();
      const m = s.match(/^(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{4})$/);
      if (m) {
        const [, dd, mm, yyyy] = m;
        d = new Date(Number(yyyy), Number(mm) - 1, Number(dd), 23, 59, 0);
      } else {
        d = new Date(s);
      }
    } else { return null; }
    if (Number.isNaN(d.getTime())) return null;
    const diff = d.getTime() - Date.now();
    if (diff <= 0) return null;
    const days    = Math.floor(diff / 86400000);
    const hours   = Math.floor((diff / 3600000) % 24);
    const minutes = Math.floor((diff / 60000) % 60);
    if (days > 0)  return `${days}d: ${hours}h: ${minutes}m`;
    if (hours > 0) return `${hours}h: ${minutes}m`;
    return `${minutes}m`;
  } catch { return null; }
};

/**
 * CarCardVertical — exactly matches Figma spec (560 × 764 container).
 * Built using responsive proportions so it scales down on small screens
 * but preserves the same internal ratios.
 */
export const CarCardVertical = ({ v, idx = 0 }) => {
  const id = v?.vin || v?._id || v?.id || idx;
  const img = (v?.images && v.images[0]) || v?.image_url || fallbackImage;
  const title =
    v?.title ||
    `${v?.year || ''} ${v?.make || ''} ${v?.model || ''}`.trim() ||
    'Vehicle';
  const mileage = v?.odometer
    ? `${Number(v.odometer).toLocaleString()} ${(v?.odometer_unit || 'km').toUpperCase()}`
    : v?.mileage || '—';
  const engine =
    v?.engine ||
    v?.engine_info ||
    (v?.engine_size && v?.fuel_type
      ? `${v.engine_size}L / ${String(v.fuel_type).toUpperCase()}`
      : '—');
  const drive = (v?.drive || v?.drivetrain || '—').toUpperCase();
  const turnkey = v?.turnkey_price || v?.price_bulgaria || null;
  const average = v?.average_price || null;
  const tradingDate = v?.sale_date || v?.auction_date || null;

  /* ── Live auction countdown — recalculates every minute and pulls
   *    from sale_date / auction_date / auction_countdown so the chip
   *    always reflects current reality (never shows a fake "1d 4h 35m"). */
  const auctionDateRaw = v?.sale_date || v?.auction_date || null;
  const [countdown, setCountdown] = useState(
    () => v?.auction_countdown || formatAuctionCountdown(auctionDateRaw),
  );
  useEffect(() => {
    setCountdown(v?.auction_countdown || formatAuctionCountdown(auctionDateRaw));
    if (!auctionDateRaw) return undefined;
    const tickId = setInterval(() => {
      setCountdown(formatAuctionCountdown(auctionDateRaw));
    }, 60000);
    return () => clearInterval(tickId);
  }, [auctionDateRaw, v?.auction_countdown]);

  return (
    <Link
      to={`/cars/${encodeURIComponent(id)}`}
      className="group bg-[#1D1D1B] rounded-lg overflow-hidden flex flex-col transition-colors hover:bg-[#232321]"
      data-testid={`car-card-${idx}`}
    >
      {/* ---------- IMAGE ---------- */}
      <div className="relative aspect-[517/388] bg-black">
        <img
          src={optimizeImage(img, ImageSize.cardDesktop)}
          alt={title}
          loading="lazy"
          decoding="async"
          onError={(e) => { e.currentTarget.src = fallbackImage; }}
          className="absolute inset-0 w-full h-full object-cover"
          data-testid={`car-card-${idx}-image`}
        />
        {/* Trading date badge — top-left, semi-transparent white.
            Hidden when the backend has no sale_date for this row. */}
        {tradingDate && (
          <div
            className="absolute top-4 left-4 px-3 h-8 flex items-center text-[13px] font-medium text-black bg-white/70 rounded-sm"
            data-testid={`car-card-${idx}-trading-date`}
          >
            {tradingDate}
          </div>
        )}
        {/* Timer pill — top-left, amber #FEAE00 @ 80%.  Hidden when no
            live countdown is available so we never render the fake "1 d
            4h 35m" placeholder. Position and visual treatment match the
            catalog row card 1-to-1 (iconoir-clock 18×18, gap 8 px,
            height 32 px, white-space nowrap, vertically centered). */}
        {countdown && (
          <div
            className="absolute top-3 left-3 h-8 flex items-center justify-center gap-2 px-3 bg-[#FEAE00] text-black text-[14px] font-medium leading-none whitespace-nowrap select-none"
            style={{ backgroundColor: 'rgba(254, 174, 0, 0.8)' }}
            data-testid={`car-card-${idx}-timer`}
          >
            <img
              src="/single-car/iconoir-clock.png"
              alt=""
              width={18}
              height={18}
              style={{ display: 'block', flex: '0 0 auto' }}
            />
            <span style={{ lineHeight: 1 }}>{countdown}</span>
          </div>
        )}
        {/* Compare + favorite icons — bottom-right circular outline */}
        <div className="absolute bottom-4 right-4 flex items-center gap-3">
          <button
            type="button"
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
            className="w-8 h-8 rounded-full border border-[#FEAE00] flex items-center justify-center text-[#FEAE00] bg-black/20 hover:bg-[#FEAE00] hover:text-black transition-colors"
            aria-label="Compare"
            data-testid={`car-card-${idx}-compare`}
          >
            <Scale size={14} strokeWidth={2} />
          </button>
          <button
            type="button"
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
            className="w-8 h-8 rounded-full border border-[#FEAE00] flex items-center justify-center text-[#FEAE00] bg-black/20 hover:bg-[#FEAE00] hover:text-black transition-colors"
            aria-label="Add to favorites"
            data-testid={`car-card-${idx}-favorite`}
          >
            <Heart size={14} strokeWidth={2} />
          </button>
        </div>
      </div>

      {/* ---------- TITLE ---------- */}
      <div className="px-6 pt-6 pb-4">
        <h3
          className="text-white font-bold leading-tight"
          style={{ fontSize: 24 }}
          data-testid={`car-card-${idx}-title`}
        >
          {title}
        </h3>
      </div>

      {/* ---------- MAIN INFO: left price box + right specs ---------- */}
      <div className="px-6 pb-4 grid grid-cols-[1fr_1fr] gap-4">
        {/* Left: Black turnkey price box */}
        <div className="bg-black rounded-lg px-4 py-4 flex flex-col justify-between min-h-[120px]">
          <div className="text-[14px] text-[#EFEFEF] leading-snug">
            Estimated turnkey price in Bulgaria
          </div>
          <div
            className="text-[#FEAE00] font-bold uppercase tracking-wide mt-2"
            style={{ fontSize: 20 }}
            data-testid={`car-card-${idx}-turnkey-price`}
          >
            {turnkey || '—'}
          </div>
        </div>

        {/* Right: Mileage / Engine / Drive */}
        <div className="flex flex-col justify-center gap-3 pl-1">
          <div className="flex items-center justify-between gap-3">
            <span className="text-[14px] text-white capitalize">Mileage</span>
            <span
              className="text-[14px] font-bold uppercase text-[#FEAE00] text-right"
              data-testid={`car-card-${idx}-mileage`}
            >
              {mileage}
            </span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-[14px] text-white capitalize">Engine</span>
            <span className="text-[14px] font-bold uppercase text-[#FEAE00] text-right whitespace-nowrap">
              {engine}
            </span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-[14px] text-white capitalize">Drive</span>
            <span className="text-[14px] font-bold uppercase text-[#FEAE00] text-right">
              {drive}
            </span>
          </div>
        </div>
      </div>

      {/* ---------- FOOTER: Average cost + More details button ---------- */}
      <div className="px-6 pb-6 pt-4 mt-auto flex items-end justify-between gap-4">
        <div>
          <div className="text-[14px] text-[#EFEFEF] mb-1">Average cost in Bulgaria</div>
          <div
            className="text-[14px] font-bold uppercase text-[#FEAE00]"
            data-testid={`car-card-${idx}-average-price`}
          >
            {average || '—'}
          </div>
        </div>
        <span
          className="inline-flex items-center justify-center bg-[#FEAE00] hover:bg-[#FFBF2D] text-black text-[14px] font-medium rounded-md h-[45px] px-8 transition-colors"
          data-testid={`car-card-${idx}-more-details`}
        >
          More details
        </span>
      </div>
    </Link>
  );
};

export default CarCardVertical;
