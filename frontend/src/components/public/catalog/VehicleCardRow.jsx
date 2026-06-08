/**
 * Vehicle card row (Figma 1:1 — active & sold variants).
 *
 *  Action icons (top-right):
 *    1) SHARE     — opens <ShareModal />            (same icon + flow as SingleCarPage)
 *    2) COMPARE   — toggles via userEngagementApi   (scales SVG)
 *    3) FAVOURITE — toggles via userEngagementApi   (heart SVG)
 *
 *  Reuses the EXACT same icons & data-layer used on the single-car page
 *  (`/single-car/share-icon.svg`, `compare-icon.svg`, `favorite-icon.svg`).
 *  No custom SVGs are created for this card.
 */
import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import styles from './VehicleCardRow.module.css';
import ShareModal from '../ShareModal';
import { useLang } from '../../../i18n';
import { userEngagementApi, getCustomerToken } from '../../../lib/api';
import { optimizeImage, ImageSize } from '../../../lib/optimizeImage';

const fmtNum   = (n) => (n === null || n === undefined ? '—' : Number(n).toLocaleString());
const fmtMoney = (n, ccy = 'EUR') => {
  if (n === null || n === undefined || n === '') return '—';
  const c = (ccy || 'EUR').toUpperCase();
  const sym = c === 'USD' ? '$' : c === 'GBP' ? '£' : c === 'BGN' ? 'лв ' : '€';
  return `${sym}${Number(n).toLocaleString()}`;
};
/**
 * Parses many date formats seen across our parsers:
 *   • ISO 8601:    "2026-05-11T00:00:00Z"
 *   • DD.MM.YYYY:  "11.05.2026"   (bidmotors)
 *   • DD/MM/YYYY:  "11/05/2026"
 *   • Date object: already a Date
 */
const fmtDate = (raw) => {
  if (!raw) return '—';
  try {
    let d;
    if (raw instanceof Date) {
      d = raw;
    } else if (typeof raw === 'string') {
      const s = raw.trim();
      // DD.MM.YYYY  or  DD/MM/YYYY
      const m = s.match(/^(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{4})$/);
      if (m) {
        const [, dd, mm, yyyy] = m;
        d = new Date(Number(yyyy), Number(mm) - 1, Number(dd));
      } else {
        d = new Date(s);
      }
    } else {
      return '—';
    }
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('en-GB');
  } catch { return '—'; }
};

/**
 * Cross-browser clipboard write. Falls back to the legacy hidden-textarea
 * + `document.execCommand("copy")` trick when `navigator.clipboard` is
 * not available (older Safari, http origins, restricted iframes).
 * Returns a Promise<boolean> resolving to true on success.
 */
const writeClipboard = async (text) => {
  const str = String(text ?? '').trim();
  if (!str) return false;
  // Modern path
  if (typeof navigator !== 'undefined'
      && navigator.clipboard
      && typeof navigator.clipboard.writeText === 'function'
      && window.isSecureContext) {
    try { await navigator.clipboard.writeText(str); return true; } catch { /* fall through */ }
  }
  // Legacy path
  try {
    const ta = document.createElement('textarea');
    ta.value = str;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    ta.setSelectionRange(0, str.length);
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return !!ok;
  } catch { return false; }
};

const copyToClipboard = async (e, text, label, fallbackError) => {
  e.stopPropagation();
  const ok = await writeClipboard(text);
  if (ok) toast.success(`${label}: ${text}`);
  else    toast.error(fallbackError);
};

/**
 * Format the raw `engine` string (BidMotors detail page) into a compact
 * spec line that fits the 226 px specs column at 14 px Mazzard H Bold.
 *
 *   Input                                          → Output
 *   "3.3l v-6 di, dohc, vvt, 290hp"               → "3.3L V-6 290HP"
 *   "5.5l v8 fi dohc 32v nf4"                     → "5.5L V-8"
 *   "5.7l v-8 vvt, 395hp"                         → "5.7L V-8 395HP"
 *   "1.5l i-4 dohc, vvt, 76hp"                    → "1.5L I-4 76HP"
 *   "3.0l v-6 di, dohc, vvt, supercharger, 333hp" → "3.0L V-6 333HP"
 *   "4.4l 8"                                      → "4.4L"
 *   "Electric, 240kW"                             → "ELECTRIC 240KW"
 *   ""  / null                                    → "—"
 *
 * Rule of thumb: keep displacement, cylinder layout (V/I/H/L + count)
 * and power (HP or kW). Drop noise: DI, DOHC, VVT, FI, NF4, codes.
 */
const formatEngine = (raw) => {
  if (!raw || typeof raw !== 'string') return '—';
  const s = raw.trim();
  if (!s) return '—';
  // Electric / hybrid (no displacement)
  if (/\b(electric|ev|hybrid)\b/i.test(s) && !/\d+\.\d+\s*l\b/i.test(s)) {
    const kw = s.match(/(\d+)\s*kW/i);
    const hp = s.match(/(\d+)\s*HP/i);
    const tag = /hybrid/i.test(s) ? 'HYBRID' : 'ELECTRIC';
    return [tag, kw ? `${kw[1]}KW` : (hp ? `${hp[1]}HP` : null)].filter(Boolean).join(' ');
  }
  const disp   = s.match(/(\d+\.\d+)\s*l\b/i);
  const layout = s.match(/\b([VIHL])[-]?(\d+)\b/i);
  const hp     = s.match(/(\d+)\s*HP\b/i);
  const kw     = s.match(/(\d+)\s*kW\b/i);
  const parts  = [];
  if (disp)   parts.push(`${disp[1]}L`);
  if (layout) parts.push(`${layout[1].toUpperCase()}-${layout[2]}`);
  if (hp)        parts.push(`${hp[1]}HP`);
  else if (kw)   parts.push(`${kw[1]}KW`);
  if (parts.length === 0) {
    // Fallback: first chunk before comma, max 18 chars
    return s.split(/[,;]/)[0].slice(0, 18).toUpperCase();
  }
  return parts.join(' ');
};

/**
 * Format an auction countdown identical to the Figma "Vehicle Card (Mobile)"
 * timer chip:
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

export default function VehicleCardRow({ vehicle, onClick }) {
  const v = vehicle || {};
  const { t } = useLang();
  const isSold = !!(v.sold || (v.status && String(v.status).toLowerCase() === 'sold'));
  const image  = (Array.isArray(v.images) && v.images.length > 0) ? v.images[0] : null;
  const title  = v.title || [v.year, v.make, v.model].filter(Boolean).join(' ') || 'Vehicle';
  const vin    = v.vin || '';
  const make   = v.make || '';
  const model  = v.model || '';
  const navigate = useNavigate();

  /* ── Action-icon state (mirrors NavigationHeader's hydration logic) ── */
  const [isFavorite,  setIsFavorite]  = useState(false);
  const [isComparing, setIsComparing] = useState(false);
  const [shareOpen,   setShareOpen]   = useState(false);
  const [busy,        setBusy]        = useState(false);

  /* ── Live auction countdown ("1d: 4h: 35m") — recalculates every minute.
   *    Uses the same date field shown in the spec grid (auction_date /
   *    sale_date), so the chip & data row never go out of sync.  When the
   *    date is missing / past, the chip is hidden entirely. */
  const auctionDateRaw = isSold ? (v.sold_date || v.sale_date) : (v.sale_date || v.auction_date);
  const [countdown, setCountdown] = useState(() => formatAuctionCountdown(auctionDateRaw));
  useEffect(() => {
    if (isSold || !auctionDateRaw) { setCountdown(null); return undefined; }
    setCountdown(formatAuctionCountdown(auctionDateRaw));
    const id = setInterval(() => setCountdown(formatAuctionCountdown(auctionDateRaw)), 60_000);
    return () => clearInterval(id);
  }, [auctionDateRaw, isSold]);

  useEffect(() => {
    let alive = true;
    if (!vin || isSold) return () => { alive = false; };
    (async () => {
      try {
        if (getCustomerToken()) {
          const r = await userEngagementApi.favorites.check(vin);
          if (alive) setIsFavorite(!!(r && (r.is_favorite || r.is_favorited)));
        }
      } catch { /* ignore */ }
      try {
        const list = await userEngagementApi.compare.getMine();
        if (alive && Array.isArray(list)) {
          setIsComparing(list.some((x) => (x.vin || x).toUpperCase() === vin.toUpperCase()));
        }
      } catch { /* ignore */ }
    })();
    return () => { alive = false; };
  }, [vin, isSold]);

  /* ── Build a vehicle snapshot for engagement endpoints ── */
  const buildPayload = useCallback(() => ({
    vin,
    vehicleId: v.id || vin,
    title:  v.title || [v.year, v.make, v.model].filter(Boolean).join(' '),
    make:   v.make,
    model:  v.model,
    year:   v.year,
    trim:   v.trim,
    image:  (Array.isArray(v.images) && v.images.length > 0) ? v.images[0] : null,
    price:  v.current_bid || v.price || v.estimated_price,
    currency: v.current_bid_currency || v.currency || 'EUR',
    lot_number: v.lot_number,
    auction_name: v.auction_name || v.auction,
    odometer: v.odometer,
    odometer_unit: v.odometer_unit,
    sourcePage: typeof window !== 'undefined' ? window.location.pathname : '',
  }), [v, vin]);

  const handleFavorite = useCallback(async (e) => {
    e.stopPropagation();
    if (!vin || busy || isSold) return;
    if (!getCustomerToken()) {
      toast.info(t('toastSignInToSaveFav') || 'Sign in to save favorites', {
        action: {
          label: t('toastSignIn') || 'Sign in',
          onClick: () => { if (typeof window !== 'undefined') window.location.href = '/customer/login'; },
        },
      });
      return;
    }
    setBusy(true);
    try {
      if (isFavorite) {
        await userEngagementApi.favorites.remove(vin);
        setIsFavorite(false);
        toast.success(t('toastRemovedFav') || 'Removed from favourites');
      } else {
        await userEngagementApi.favorites.add(buildPayload());
        setIsFavorite(true);
        toast.success(t('toastAddedFav') || 'Added to favourites');
      }
    } catch (err) {
      toast.error(err?.response?.data?.detail || err?.message || t('toastFavError') || 'Could not update favourites');
    } finally { setBusy(false); }
  }, [vin, busy, isFavorite, isSold, buildPayload, t]);

  const handleCompare = useCallback(async (e) => {
    e.stopPropagation();
    if (!vin || busy || isSold) return;
    // Auth-gate (same UX as Favorites) — guests get a clear sign-in prompt
    // instead of a silent 401 from the backend.
    if (!getCustomerToken()) {
      toast.info(t('toastSignInToCompare') || 'Sign in to add cars to comparison', {
        action: {
          label: t('toastSignIn') || 'Sign in',
          onClick: () => { if (typeof window !== 'undefined') window.location.href = '/customer/login'; },
        },
      });
      return;
    }
    setBusy(true);
    try {
      if (isComparing) {
        await userEngagementApi.compare.remove(vin);
        setIsComparing(false);
        toast.success(t('toastRemovedCompare') || 'Removed from comparison');
      } else {
        const res = await userEngagementApi.compare.add(buildPayload());
        setIsComparing(true);
        const count = typeof res?.count === 'number' ? res.count : null;
        const openCompare = () => {
          let cid = null;
          try { cid = JSON.parse(localStorage.getItem('customer_session') || 'null')?.customerId; }
          catch { cid = null; }
          window.location.href = cid ? `/cabinet/${cid}/compare` : '/cabinet/compare';
        };
        if (count === 1 || res?.needsMore === true) {
          toast.success(t('toastAddedCompare') || 'Added to comparison', {
            duration: 5500,
            description: t('toastCompareNeedMoreDesc') || 'Add at least 1 more car to start comparing',
          });
        } else if (count === 2) {
          toast.success(t('toastCompareReady') || 'Ready to compare!', {
            duration: 6500,
            description: t('toastCompareReadyDesc') || '2 cars selected — open the comparison view',
            action: { label: t('toastOpenCompare') || 'Open compare', onClick: openCompare },
          });
        } else {
          toast.success(t('toastCompareFull') || 'Compare list is full (3/3)', {
            duration: 5500,
            description: t('toastCompareFullDesc') || 'Open the comparison view or remove a car to add another',
            action: { label: t('toastOpenCompare') || 'Open compare', onClick: openCompare },
          });
        }
      }
    } catch (err) {
      // Surface 401/403 explicitly (in case the token was revoked between
      // the auth check above and the API call).
      if (err?.status === 401 || err?.status === 403 || err?.response?.status === 401 || err?.response?.status === 403) {
        toast.info(t('toastSignInToCompare') || 'Sign in to add cars to comparison', {
          action: {
            label: t('toastSignIn') || 'Sign in',
            onClick: () => { if (typeof window !== 'undefined') window.location.href = '/customer/login'; },
          },
        });
      } else {
        toast.error(err?.response?.data?.detail || err?.message || t('toastCompareError') || 'Could not update compare list');
      }
    } finally { setBusy(false); }
  }, [vin, busy, isComparing, isSold, buildPayload, t]);

  const handleShare = useCallback((e) => {
    e.stopPropagation();
    if (!vin || isSold) return;
    setShareOpen(true);
  }, [vin, isSold]);

  /* ── Derived fields ── */
  const mileage     = (v.odometer || v.mileage) ? `${fmtNum(v.odometer || v.mileage)} ${v.odometer_unit || 'km'}` : '—';
  const engine      = v.engine
    ? formatEngine(v.engine)
    : (v.engine_size && v.fuel_type ? `${v.engine_size} / ${v.fuel_type}` : (v.fuel_type || '—'));
  const drive       = v.drive_type || v.drivetrain || v.drive || '—';
  const damage      = (v.damaged === false) ? (t('cardUndamagedChip') || 'undamaged') : (v.damage_primary || v.damage || '—');
  const condition   = v.condition || v.title_condition || '—';
  const auction     = v.auction_name || v.auction || '—';
  const currentRate = v.current_bid || v.price || v.estimated_price;
  const rateCurrency = v.current_bid_currency || v.currency || 'EUR';
  const soldPrice   = v.sold_price || v.final_price || currentRate;
  const soldCurrency = v.sold_price_currency || v.sold_currency || rateCurrency;
  const auctionDate = auctionDateRaw;

  /* ── "Find similar vehicles" — Sold variant CTA ──
   * Pre-filters the catalog by make + model so the user lands on equivalent
   * active listings instead of the dead Sold record. */
  const handleFindSimilar = useCallback((e) => {
    e.stopPropagation();
    const params = new URLSearchParams();
    if (make)  params.set('make',  make);
    if (model) params.set('model', model);
    const qs = params.toString();
    navigate(qs ? `/catalog?${qs}` : '/catalog');
  }, [navigate, make, model]);

  return (
    <article
      className={styles.card}
      onClick={onClick}
      data-testid={`vehicle-card-${vin || v.id || v.lot_number}`}
    >
      {/* IMAGE LEFT */}
      <div className={styles.imageWrap}>
        {image
          ? <img className={styles.image} src={optimizeImage(image, ImageSize.cardDesktop)} alt={title} loading="lazy" decoding="async" />
          : <div className={styles.placeholder}>BIBI CARS</div>}

        {/* Live auction countdown — Figma "Vehicle Card (Mobile)":
         *   • position: absolute, top-left of image, 12 px from edges
         *   • bg #FEAE00, text black, H Medium 12
         *   • padding 5 px (T/B) × 8 px (L/R), gap 4 px, radius 4
         *   • only shown for active listings with a future auction date */}
        {countdown && !isSold && (
          <div className={styles.timerChip} data-testid={`auction-timer-${vin || v.id}`}>
            <img src="/single-car/iconoir-clock.png" alt="" width={18} height={18} />
            <span>{countdown}</span>
          </div>
        )}

        {isSold && (
          <div className={styles.soldOverlay} data-testid="sold-overlay">
            <img
              className={styles.soldCheck}
              src="/catalog/check-contained.svg"
              alt=""
              width={80}
              height={80}
            />
            <div className={styles.soldTitle}>{t('cardSoldTitle') || 'SOLD'}</div>
            <div className={styles.soldSub}>{t('cardSoldSubtitle') || 'This vehicle has been sold'}</div>
          </div>
        )}
      </div>

      {/* INFO RIGHT */}
      <div className={styles.info}>
        {/* TOP GROUP: title + icons + LOT/VIN -------- pinned to top */}
        <div className={styles.topGroup}>
          <div className={styles.topRow}>
            <h3 className={styles.title}>{title}</h3>

            <div className={styles.actionIcons} onClick={(e) => e.stopPropagation()}>
              {/* 1. SHARE — always visible (parity with SingleCarPage and
               *    Welcome top-deals; user spec session 36: share must be
               *    present on every card variant, including Sold). */}
              <button
                type="button"
                className={`${styles.actionBtn} ${isSold ? styles.actionBtnDisabled : ''}`}
                onClick={handleShare}
                disabled={!vin || isSold}
                aria-label={t('cardShareCar') || 'Share car'}
                data-testid={`vehicle-share-${vin}`}
              >
                <img className={styles.actionIcon} src="/single-car/share-icon.svg" alt="" />
              </button>

              {/* 2. COMPARE — scales icon, real userEngagementApi */}
              <button
                type="button"
                className={`${styles.actionBtn} ${isComparing ? styles.actionBtnActive : ''} ${isSold ? styles.actionBtnDisabled : ''}`}
                onClick={handleCompare}
                disabled={!vin || isSold || busy}
                aria-label={isComparing ? (t('cardRemoveCompare') || 'Remove from compare') : (t('cardAddCompare') || 'Add to compare')}
                aria-pressed={isComparing}
                data-testid={`vehicle-compare-${vin}`}
              >
                <img className={styles.actionIcon} src="/single-car/compare-icon.svg" alt="" />
              </button>

              {/* 3. FAVOURITE — heart icon */}
              <button
                type="button"
                className={`${styles.actionBtn} ${isFavorite ? styles.actionBtnActive : ''} ${isSold ? styles.actionBtnDisabled : ''}`}
                onClick={handleFavorite}
                disabled={!vin || isSold || busy}
                aria-label={isFavorite ? (t('cardRemoveFavorite') || 'Remove from favourites') : (t('cardAddFavorite') || 'Add to favourites')}
                aria-pressed={isFavorite}
                data-testid={`vehicle-favorite-${vin}`}
              >
                <img className={styles.actionIcon} src="/single-car/favorite-icon.svg" alt="" />
              </button>
            </div>
          </div>

          {/* IDENTIFIERS: LOT + VIN */}
          <div className={styles.identifiers}>
            {v.lot_number && (
              <span className={styles.idLine}>
                {t('cardLot') || 'LOT'}: #{v.lot_number}
                <button type="button" className={styles.copy} onClick={(e) => copyToClipboard(e, v.lot_number, t('cardLot') || 'LOT', t('toastClipboardUnavailable') || 'Clipboard unavailable')} title={t('cardCopyLot') || 'Copy lot number'} data-testid={`copy-lot-${v.lot_number}`}>
                  <img src="/figma/catalog/icon-copy.svg" alt="" />
                </button>
              </span>
            )}
            {vin && (
              <span className={styles.idLine}>
                VIN: {vin}
                <button type="button" className={styles.copy} onClick={(e) => copyToClipboard(e, vin, 'VIN', t('toastClipboardUnavailable') || 'Clipboard unavailable')} title={t('cardCopyVin') || 'Copy VIN'} data-testid={`copy-vin-${vin}`}>
                  <img src="/figma/catalog/icon-copy.svg" alt="" />
                </button>
              </span>
            )}
          </div>
        </div>

        {/* DATA ROW: specs (left) + right column (price + CTA) ----------
         *  Each (label + value) pair is wrapped in a `.specItem` so we can
         *  rearrange the entire data section into a clean 2-col mobile grid
         *  (Mileage | Engine, Drive | Damage, …, Auction Date | Current Rate)
         *  via CSS only.  On desktop `.specItem { display:contents }` keeps
         *  the existing 2-col label/value grid intact. */}
        <div className={styles.dataRow}>
          <div className={`${styles.specBlock} ${isSold ? styles.specBlockMuted : ''}`}>
            <div className={styles.specItem}>
              <span className={styles.specLabel}>{t('cardMileage') || 'Mileage'}</span>
              <span className={styles.specValue}>{mileage}</span>
            </div>
            <div className={styles.specItem}>
              <span className={styles.specLabel}>{t('cardEngine') || 'Engine'}</span>
              <span className={styles.specValue} title={v.engine || ''}>{engine}</span>
            </div>
            <div className={styles.specItem}>
              <span className={styles.specLabel}>{t('cardDrive') || 'Drive'}</span>
              <span className={styles.specValue}>{drive}</span>
            </div>
            <div className={styles.specItem}>
              <span className={styles.specLabel}>{t('cardDamage') || 'Damage'}</span>
              <span className={styles.specValue}>{damage}</span>
            </div>
            <div className={styles.specItem}>
              <span className={styles.specLabel}>{t('cardCondition') || 'Condition'}</span>
              <span className={styles.specValue}>{condition}</span>
            </div>
            <div className={styles.specItem}>
              <span className={styles.specLabel}>{t('cardAuction') || 'Auction'}</span>
              <span className={styles.specValue}>{auction}</span>
            </div>
          </div>

          <div className={styles.rightCol}>
            <div className={styles.priceBlock}>
              <div className={`${styles.specItem} ${styles.priceItem}`}>
                <span className={styles.priceLabel}>{isSold ? (t('cardSoldPrice') || 'Sold Price') : (t('cardCurrentRate') || 'Current Rate')}</span>
                <span className={`${styles.priceValue} ${isSold ? styles.priceMuted : ''}`} data-testid={isSold ? `sold-price-${vin}` : `current-rate-${vin}`}>{fmtMoney(isSold ? soldPrice : currentRate, isSold ? soldCurrency : rateCurrency)}</span>
              </div>
              <div className={`${styles.specItem} ${styles.dateItem}`}>
                <span className={styles.priceLabel}>{isSold ? (t('cardSoldDate') || 'Sold Date') : (t('cardAuctionDate') || 'Auction Date')}</span>
                <span className={`${styles.dateValue} ${isSold ? styles.dateMuted : ''}`} data-testid={isSold ? `sold-date-${vin}` : `auction-date-${vin}`}>{fmtDate(auctionDate)}</span>
              </div>
            </div>

            <button
              type="button"
              className={styles.cta}
              onClick={isSold ? handleFindSimilar : (e) => { e.stopPropagation(); onClick?.(); }}
              data-testid={isSold ? `find-similar-${vin || v.id || v.lot_number}` : `vehicle-cta-${vin || v.id || v.lot_number}`}
            >
              {isSold ? (t('cardFindSimilarVehicles') || 'find similar vehicles') : (t('cardExactCostBulgaria') || 'exact cost in Bulgaria')}
            </button>
          </div>
        </div>
      </div>

      {/* Share modal — same component used on SingleCarPage */}
      {shareOpen && (
        <ShareModal
          open={shareOpen}
          onClose={() => setShareOpen(false)}
          vin={vin}
          snapshot={{
            title,
            make:  v.make,
            model: v.model,
            year:  v.year,
            image,
            sourcePage: typeof window !== 'undefined' ? window.location.pathname : '',
          }}
        />
      )}
    </article>
  );
}
