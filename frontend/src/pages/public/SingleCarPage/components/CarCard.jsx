import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { useLang } from '../../../../i18n';
import { useSingleCarT } from '../i18n';
import Button1 from './Button1';
import ShareModal from '../../../../components/public/ShareModal';
import { userEngagementApi, getCustomerToken } from '../../../../lib/api';
import styles from './CarCard.module.css';

/**
 * "Similar car" carousel card. Now fully wired to real BidMotors data via
 * the `data` prop (passed from <SimilarCars />), and clickable: each card
 * — including its photo, title and "More details" CTA — links to
 * `/cars/<VIN>`, the canonical SingleCarPage. No more dead onClicks, no
 * more hard-coded "Lucid Motors Air Pure" placeholders.
 *
 * The three small action icons in the body (and the mobile overlay) are
 * now fully functional **inside the Link wrapper**:
 *
 *   • Share    — opens the platform-wide <ShareModal /> for this VIN.
 *                Anonymous users CAN share (no auth required) — the
 *                share is tracked server-side by IP.
 *   • Compare  — toggles add/remove from the customer's compare list.
 *                Requires authentication; guests are redirected to login
 *                via a toast action.
 *   • Favorite — toggles add/remove from the customer's favorites list.
 *                Requires authentication; same toast pattern as Compare.
 *
 * All three icons use `e.preventDefault(); e.stopPropagation();` on click
 * so they DON'T trigger the parent <Link> navigation to /cars/<VIN>.
 */

const FALLBACK_IMG = '/single-car/image-151@2x.png';

const titleCase = (s) =>
  String(s || '')
    .toLowerCase()
    .replace(/\b([a-z])/g, (m) => m.toUpperCase())
    .replace(/\bUsa\b/g, 'USA');

const fmtTitle = (it) => {
  if (it?.title) {
    const parts = it.title.split(/\s+/);
    const y = /^\d{4}$/.test(parts[0]) ? parts[0] : null;
    const rest = y ? parts.slice(1).join(' ') : it.title;
    return y ? `${y} ${titleCase(rest)}` : titleCase(rest);
  }
  return [it?.year, titleCase(it?.make || ''), titleCase(it?.model || '')].filter(Boolean).join(' ');
};

const fmtKm = (n, unit) => {
  if (!n) return '—';
  const num = typeof n === 'number' ? n : parseInt(String(n).replace(/[^\d]/g, ''), 10);
  if (!Number.isFinite(num) || num <= 0) return '—';
  const u = (unit || 'km').toLowerCase() === 'mi' ? 'mi' : 'km';
  return `${num.toLocaleString('en-US')} ${u}`;
};

const fmtEngine = (it) => {
  const e = it?.engine;
  if (!e) return it?.fuel_type ? titleCase(it.fuel_type) : '—';
  const m = String(e).match(/(\d+(?:[.,]\d+)?)\s*l/i);
  const base = m ? `${m[1].replace(',', '.')}L` : String(e);
  const fuel = it?.fuel_type ? titleCase(it.fuel_type) : '';
  return fuel ? `${base} / ${fuel}` : base;
};

const fmtDrive = (it) => {
  const d = it?.drivetrain || '';
  const s = String(d).toLowerCase();
  if (s.includes('front')) return 'FWD';
  if (s.includes('rear')) return 'RWD';
  if (s.includes('all-wheel') || s.includes('all wheel')) return 'AWD';
  if (s.includes('4')) return '4WD';
  return d || '—';
};

const fmtPriceRange = (it) => {
  const num =
    typeof it?.price === 'number'
      ? it.price
      : parseFloat(String(it?.price || '').replace(/[^\d.]/g, ''));
  if (!Number.isFinite(num) || num <= 0) return null;  /* fall back to "—" per Figma */
  const cur = (it?.currency || 'EUR').toUpperCase();
  const sym = cur === 'EUR' ? '€' : cur === 'USD' ? '$' : `${cur} `;
  return `${sym}${Math.round(num).toLocaleString('en-US')}`;
};

const fmtFinalRange = (it) => {
  const num =
    typeof it?.price === 'number'
      ? it.price
      : parseFloat(String(it?.price || '').replace(/[^\d.]/g, ''));
  if (!Number.isFinite(num) || num <= 0) return null;  /* fall back to "—" per Figma */
  const low = Math.round(num + 2700 + num * 0.2);
  const high = Math.round(low * 1.18);
  return `€${low.toLocaleString('en-US')}-${high.toLocaleString('en-US')}`;
};

const parseSaleDate = (s) => {
  if (!s) return null;
  const str = String(s).trim();
  const iso = Date.parse(str);
  if (!Number.isNaN(iso) && /\d{4}-\d{2}-\d{2}/.test(str)) return new Date(iso);
  const m = str.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})(?:\s+(\d{1,2}):(\d{2}))?/);
  if (m) {
    const [, d, mo, y, hh, mm] = m;
    return new Date(Date.UTC(+y, +mo - 1, +d, hh ? +hh - 2 : 21, mm ? +mm : 59));
  }
  return null;
};

const fmtRemaining = (ms, closedLabel) => {
  if (ms <= 0) return closedLabel || 'Closed';
  const totalSec = Math.floor(ms / 1000);
  const days = Math.floor(totalSec / 86400);
  const hours = Math.floor((totalSec % 86400) / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h ${mins}m`;
  return `${hours}h ${mins}m ${totalSec % 60}s`;
};

const CarCard = ({ className = '', data, variant = 'main' }) => {
  const { lang } = useLang();
  const t = useSingleCarT(lang);
  const vin = data?.vin;
  const detailHref = vin ? `/cars/${encodeURIComponent(vin)}` : null;

  const title = useMemo(() => fmtTitle(data), [data]);
  const image = data?.image || FALLBACK_IMG;
  const mileage = fmtKm(data?.odometer, data?.odometer_unit);
  const engine = fmtEngine(data);
  const drive = fmtDrive(data);
  const purchasePrice = fmtPriceRange(data);
  const estimatedFinalCost = fmtFinalRange(data);
  const tradingDate = data?.sale_date
    ? `${t.tradingDate} - ${data.sale_date}`
    : data?.auction_name
      ? `${t.auctionPrefix} - ${data.auction_name}`
      : t.auctionTba;

  // Live countdown derived from sale_date.
  const saleAt = useMemo(() => parseSaleDate(data?.sale_date), [data?.sale_date]);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!saleAt) return undefined;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [saleAt]);
  const timer = saleAt ? fmtRemaining(saleAt.getTime() - now, t.closed) : 'TBA';

  /* ── Share / Compare / Favorite live state ──────────────────────────── */
  const [shareOpen, setShareOpen] = useState(false);
  const [isFavorite, setIsFavorite] = useState(false);
  const [isComparing, setIsComparing] = useState(false);
  const [favBusy, setFavBusy] = useState(false);
  const [cmpBusy, setCmpBusy] = useState(false);

  /* Hydrate compare + favorite states whenever VIN changes (per-card). */
  useEffect(() => {
    let cancelled = false;
    if (!vin) return undefined;
    (async () => {
      try {
        if (!getCustomerToken()) {
          if (!cancelled) setIsFavorite(false);
          return;
        }
        const r = await userEngagementApi.favorites.check(vin);
        if (!cancelled) setIsFavorite(!!r?.isFavorite);
      } catch {
        if (!cancelled) setIsFavorite(false);
      }
    })();
    (async () => {
      try {
        if (!getCustomerToken()) {
          if (!cancelled) setIsComparing(false);
          return;
        }
        const list = await userEngagementApi.compare.getMine();
        const arr = Array.isArray(list) ? list : [];
        const upperVin = String(vin).toUpperCase();
        if (!cancelled) {
          setIsComparing(arr.some((x) => String(x?.vin || x?.vehicleId || '').toUpperCase() === upperVin));
        }
      } catch {
        if (!cancelled) setIsComparing(false);
      }
    })();
    return () => { cancelled = true; };
  }, [vin]);

  const snapshotPayload = useCallback(() => ({
    vin,
    title,
    make: data?.make,
    model: data?.model,
    year: data?.year,
    price: data?.price,
    currency: data?.currency || 'EUR',
    image,
    lot_number: data?.lot_number,
    auction_name: data?.auction_name,
    odometer: data?.odometer,
    odometer_unit: data?.odometer_unit,
    sourcePage: typeof window !== 'undefined' ? window.location.pathname : '',
  }), [vin, title, data, image]);

  /* Click handlers — each stops the Link navigation. */
  const handleShareClick = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!vin) return;
    setShareOpen(true);
  }, [vin]);

  const handleFavoriteClick = useCallback(async (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!vin || favBusy) return;
    if (!getCustomerToken()) {
      toast.info(t.signInToSaveFavorites, {
        action: { label: t.signInBtn, onClick: () => { window.location.href = '/cabinet/login'; } },
      });
      return;
    }
    setFavBusy(true);
    try {
      if (isFavorite) {
        await userEngagementApi.favorites.remove(vin);
        setIsFavorite(false);
        toast.success(t.removedFromFavorites);
      } else {
        await userEngagementApi.favorites.add(snapshotPayload());
        setIsFavorite(true);
        toast.success(t.addedToFavorites);
      }
    } catch (err) {
      if (err?.status === 401 || err?.status === 403) {
        toast.error(t.pleaseSignInAgain);
      } else {
        toast.error(err?.message || t.couldNotUpdateFavorites);
      }
    } finally {
      setFavBusy(false);
    }
  }, [vin, favBusy, isFavorite, snapshotPayload, t]);

  const handleCompareClick = useCallback(async (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!vin || cmpBusy) return;
    if (!getCustomerToken()) {
      toast.info(t.signInToCompareCars, {
        action: { label: t.signInBtn, onClick: () => { window.location.href = '/cabinet/login'; } },
      });
      return;
    }
    setCmpBusy(true);
    try {
      if (isComparing) {
        await userEngagementApi.compare.remove(vin);
        setIsComparing(false);
        toast.success(t.removedFromCompare);
      } else {
        const res = await userEngagementApi.compare.add({
          vin,
          vehicleId: vin,
          snapshot: snapshotPayload(),
        });
        setIsComparing(true);
        // 3 distinct UX states based on the resulting cart size:
        //   count === 1 → "need at least 1 more" (no Open-compare CTA yet)
        //   count === 2 → "Ready to compare!" (primary CTA to open the cabinet)
        //   count === 3 → "Compare is full" (CTA still goes to the cabinet)
        const count = typeof res?.count === 'number' ? res.count : null;
        const openCompare = () => {
          let cid = null;
          try { cid = JSON.parse(localStorage.getItem('customer_session') || 'null')?.customerId; }
          catch { cid = null; }
          window.location.href = cid ? `/cabinet/${cid}/compare` : '/cabinet/compare';
        };
        if (count === 1 || res?.needsMore === true) {
          // Stage 1 — informative, no CTA (you can't compare 1 car)
          toast.success(t.addedToCompareNeedMore, {
            duration: 5500,
            description: t.compareNeedMoreDesc,
          });
        } else if (count === 2) {
          // Stage 2 — first time it actually becomes useful → highlight CTA
          toast.success(t.compareReadyTitle, {
            duration: 6500,
            description: t.compareReadyDesc,
            action: { label: t.openCompareBtn, onClick: openCompare },
          });
        } else {
          // Stage 3 — cap reached
          toast.success(t.compareFullTitle, {
            duration: 5500,
            description: t.compareFullDesc,
            action: { label: t.openCompareBtn, onClick: openCompare },
          });
        }
      }
    } catch (err) {
      if (err?.status === 401 || err?.status === 403) {
        toast.error(t.pleaseSignInAgain);
      } else {
        toast.error(err?.message || t.couldNotUpdateCompare);
      }
    } finally {
      setCmpBusy(false);
    }
  }, [vin, cmpBusy, isComparing, snapshotPayload, t]);

  /* For the small icon row we'll render real <button>s. They keep the
   * exact same visual (32×32 PNG/SVG image) but now have aria/click
   * behaviour. `data-active="true"` on compare/favorite drives the
   * subtle visual ring via CSS once the user has toggled them on. */
  const ShareIconBtn = (
    <button
      type="button"
      className={styles.iconBtn}
      onClick={handleShareClick}
      aria-label={t.shareCar}
      data-testid={`carcard-share-${vin || 'na'}`}
    >
      <img className={styles.frameIcon} width={32} height={32} alt="" src="/single-car/share-icon.svg" />
    </button>
  );
  const CompareIconBtn = (
    <button
      type="button"
      className={[styles.iconBtn, isComparing ? styles.iconBtnActive : ''].join(' ')}
      onClick={handleCompareClick}
      aria-label={isComparing ? t.removeFromCompare : t.addToCompare}
      aria-pressed={isComparing}
      disabled={cmpBusy}
      data-active={isComparing ? 'true' : 'false'}
      data-testid={`carcard-compare-${vin || 'na'}`}
    >
      <img className={styles.frameIcon} width={32} height={32} alt="" src="/single-car/Frame-1707479182.svg" />
    </button>
  );
  const FavoriteIconBtn = (
    <button
      type="button"
      className={[styles.iconBtn, isFavorite ? styles.iconBtnActive : ''].join(' ')}
      onClick={handleFavoriteClick}
      aria-label={isFavorite ? t.removeFromFavorites : t.addToFavorites}
      aria-pressed={isFavorite}
      disabled={favBusy}
      data-active={isFavorite ? 'true' : 'false'}
      data-testid={`carcard-favorite-${vin || 'na'}`}
    >
      <img className={styles.frameIcon} width={32} height={32} alt="" src="/single-car/Frame-1707479176.svg" />
    </button>
  );

  /* Mobile-overlay variants — same buttons but with a thinner class so the
   * positioning rules in .mobileActionIcons / .mobileActionIcon stay
   * unchanged from before. */
  const MobileShareBtn = (
    <button
      type="button"
      className={styles.mobileIconBtn}
      onClick={handleShareClick}
      aria-label={t.shareCar}
      data-testid={`carcard-share-mobile-${vin || 'na'}`}
    >
      <img className={styles.mobileActionIcon} width={32} height={32} alt="" src="/single-car/share-icon.svg" />
    </button>
  );
  const MobileCompareBtn = (
    <button
      type="button"
      className={[styles.mobileIconBtn, isComparing ? styles.iconBtnActive : ''].join(' ')}
      onClick={handleCompareClick}
      aria-label={isComparing ? t.removeFromCompare : t.addToCompare}
      aria-pressed={isComparing}
      disabled={cmpBusy}
      data-active={isComparing ? 'true' : 'false'}
      data-testid={`carcard-compare-mobile-${vin || 'na'}`}
    >
      <img className={styles.mobileActionIcon} width={32} height={32} alt="" src="/single-car/Frame-1707479182.svg" />
    </button>
  );
  const MobileFavoriteBtn = (
    <button
      type="button"
      className={[styles.mobileIconBtn, isFavorite ? styles.iconBtnActive : ''].join(' ')}
      onClick={handleFavoriteClick}
      aria-label={isFavorite ? t.removeFromFavorites : t.addToFavorites}
      aria-pressed={isFavorite}
      disabled={favBusy}
      data-active={isFavorite ? 'true' : 'false'}
      data-testid={`carcard-favorite-mobile-${vin || 'na'}`}
    >
      <img className={styles.mobileActionIcon} width={32} height={32} alt="" src="/single-car/Frame-1707479176.svg" />
    </button>
  );

  const inner = (
    <div className={[styles.buttonParent, variant === 'similar' ? styles.buttonParentSimilar : ''].join(' ').trim()}>
      {/* Top: image + Trading date strip */}
      <div className={styles.imageWrapper}>
        <div className={styles.imageInner}>
          <img
            className={styles.image15Icon}
            width={517}
            height={388}
            alt={title}
            src={image}
            loading="lazy"
            onError={(e) => { e.currentTarget.src = FALLBACK_IMG; }}
          />
          <div className={styles.tradingDetails}>
            <div className={styles.tradingDate}>{tradingDate}</div>
          </div>

          {/* ── Desktop overlay: timer chip BOTTOM-LEFT + action icons BOTTOM-RIGHT
                (Figma spec — chip + icons live on the image, not in the body). */}
          <div className={styles.timerRow}>
            <div className={styles.iconoirclockParent}>
              <img
                className={styles.iconoirclock}
                width={18}
                height={18}
                alt=""
                src="/single-car/iconoir-clock.png"
              />
              <div className={styles.d4h35m}>{timer}</div>
            </div>
            <div className={styles.frameIcons}>
              {ShareIconBtn}
              {CompareIconBtn}
              {FavoriteIconBtn}
            </div>
          </div>

          {/* ── MOBILE-ONLY overlays: timer chip top-left, action icons
                top-right. Hidden on desktop (≥ 769 px). ──────────────── */}
          <div className={styles.mobileImageOverlay} aria-hidden="false">
            <div className={styles.mobileTimerChip}>
              <img
                className={styles.mobileTimerClock}
                width={18}
                height={18}
                alt=""
                src="/single-car/iconoir-clock.png"
              />
              <div className={styles.mobileTimerText}>{timer}</div>
            </div>
            <div className={styles.mobileActionIcons}>
              {MobileShareBtn}
              {MobileCompareBtn}
              {MobileFavoriteBtn}
            </div>
          </div>
        </div>
      </div>

      {/* Body */}
      <div className={styles.body}>
        {/* Title + details */}
        <div className={styles.titleBlock}>
          <h3 className={styles.lucidMotorsAir}>{title}</h3>
          <div className={styles.detailsBlock}>
            <div className={styles.row1}>
              <div className={styles.purchasePriceParent}>
                <div className={styles.priceSquaresParent}>
                  <div className={styles.priceSquares} />
                  <div className={styles.purchasePrice}>{t.purchasePrice}</div>
                  <h3 className={styles.h3}>{purchasePrice || "—"}</h3>
                </div>
              </div>
              <div className={styles.mileageEngineBlock}>
                <div className={styles.specRow}>
                  <span className={styles.specLabel}>{t.mileage}</span>
                  <span className={styles.specValue}>{mileage}</span>
                </div>
                <div className={styles.specRow}>
                  <span className={styles.specLabel}>{t.engine}</span>
                  <span className={styles.specValue}>{engine}</span>
                </div>
                <div className={styles.specRow}>
                  <span className={styles.specLabel}>{t.drive}</span>
                  <span className={styles.specValue}>{drive}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom: Estimated final cost + CTA */}
        <div className={styles.footerRow}>
          <div className={styles.estimatedFinalCostToBulgarParent}>
            <div className={styles.estimatedFinalCost}>{t.estimatedFinalCostToBulgaria}</div>
            <div className={styles.divFinalCost}>{estimatedFinalCost || "—"}</div>
          </div>
          <Button1
            property1="Default"
            cONTACTUS={t.moreDetails}
            showBUTTON
            bUTTONWidth="171px"
            bUTTONBorder="unset"
          />
        </div>
      </div>
    </div>
  );

  const cardEl = !detailHref ? (
    <section className={[styles.card, variant === 'similar' ? styles.cardSimilar : '', className].join(' ').trim()}>{inner}</section>
  ) : (
    <Link
      to={detailHref}
      className={[styles.card, variant === 'similar' ? styles.cardSimilar : '', className].join(' ').trim()}
      style={{ color: 'inherit', textDecoration: 'none', cursor: 'pointer' }}
      data-testid={`similar-card-${vin}`}
    >
      {inner}
    </Link>
  );

  return (
    <>
      {cardEl}
      {/* ShareModal renders into a portal so it is unaffected by Link/overflow */}
      <ShareModal
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        vin={vin}
        snapshot={{
          title,
          make: data?.make,
          model: data?.model,
          year: data?.year,
          price: data?.price,
          currency: data?.currency,
          image,
          lot_number: data?.lot_number,
          auction_name: data?.auction_name,
          odometer: data?.odometer,
          odometer_unit: data?.odometer_unit,
        }}
      />
    </>
  );
};

export default CarCard;
