/**
 * Card1 — "Top vehicles deals" card (homepage).
 *
 * Now fully wired to real data:
 *   • Real BidMotors lot — `vin`, `lot_number`, photo, mileage, condition…
 *   • Real countdown timer — derived from the parsed `sale_date` (DD.MM.YYYY).
 *     Bulgarian time is used to align with bidmotors.bg auction schedule.
 *     If `sale_date` is missing we fall back to a neutral "Auction TBA" chip.
 *   • Heart  → toggles `favorites` (auth-aware via existing FavoriteButton flow)
 *   • Scales → toggles `compare` (uses `userEngagementApi.compare`)
 *   • "More details" / photo / title → existing `/vin/<VIN>` page.
 *
 * The parent `FrameComponent21` loads the user's favorites & compare lists
 * ONCE and passes Sets here, so we don't fan-out 12 GETs per card.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useLang } from "../../i18n";
import { userEngagementApi, getCustomerToken } from "../../lib/api";
import ShareModal from "../../components/public/ShareModal";
import { optimizeImage, ImageSize } from "../../lib/optimizeImage";
import styles from "./card1.module.css";

const FALLBACK_IMG = "/figma/image-15@2x.webp";

const T = {
  en: {
    purchasePrice: "Purchase price",
    mileage: "Mileage",
    engine: "Engine",
    drive: "Drive",
    estimatedFinalCostToBulgaria: "Estimated final cost to Bulgaria:",
    moreDetails: "More details",
    onRequest: "On request",
    auctionTba: "Auction TBA",
    lotPrefix: "Lot",
    auctionPrefix: "Auction",
    closed: "Closed",
    shareCar: "Share car",
    addToCompare: "Add to compare",
    removeFromCompare: "Remove from compare",
    addToFavorites: "Add to favorites",
    removeFromFavorites: "Remove from favorites",
    pleaseLogin: "Please log in to save favorites",
    compareFull: "Compare list is full (max 3). Remove one first.",
    addedToFavorites: "Added to favorites",
    removedFromFavorites: "Removed from favorites",
    addedToCompare: "Added to compare",
    addedToCompareNeedMore: "Add at least 1 more car to start comparing",
    compareReadyTitle: "Ready to compare!",
    compareReadyDesc: "2 cars selected — open the comparison view",
    compareFullTitle: "Compare list is full (3/3)",
    compareFullDesc: "Open the comparison view or remove a car to add another",
    openCompareBtn: "Open compare",
    removedFromCompare: "Removed from compare",
    couldNotUpdateFavorites: "Could not update favorites",
    couldNotUpdateCompare: "Could not update compare",
  },
  bg: {
    purchasePrice: "Покупна цена",
    mileage: "Пробег",
    engine: "Двигател",
    drive: "Задвижване",
    estimatedFinalCostToBulgaria: "Прогнозна крайна цена в България:",
    moreDetails: "Повече детайли",
    onRequest: "По запитване",
    auctionTba: "Аукцион предстои",
    lotPrefix: "Лот",
    auctionPrefix: "Аукцион",
    closed: "Закрит",
    shareCar: "Сподели автомобила",
    addToCompare: "Добави към сравнение",
    removeFromCompare: "Премахни от сравнение",
    addToFavorites: "Добави в любими",
    removeFromFavorites: "Премахни от любими",
    pleaseLogin: "Моля, влезте, за да запазите в любими",
    compareFull: "Списъкът за сравнение е пълен (макс. 3). Премахнете един първо.",
    addedToFavorites: "Добавено в любими",
    removedFromFavorites: "Премахнато от любими",
    addedToCompare: "Добавено за сравнение",
    addedToCompareNeedMore: "Добавете още поне 1 автомобил, за да започнете сравнението",
    compareReadyTitle: "Готово за сравнение!",
    compareReadyDesc: "Избрани са 2 автомобила — отворете изгледа за сравнение",
    compareFullTitle: "Списъкът за сравнение е пълен (3/3)",
    compareFullDesc: "Отворете сравнението или премахнете автомобил, за да добавите друг",
    openCompareBtn: "Отвори сравнение",
    removedFromCompare: "Премахнато от сравнение",
    couldNotUpdateFavorites: "Не успяхме да обновим любими",
    couldNotUpdateCompare: "Не успяхме да обновим сравнението",
  },
};

/* ────────── helpers ────────── */
const fmtKm = (n, unit) => {
  if (n == null || n === "") return "—";
  try {
    const num = typeof n === "number" ? n : parseInt(String(n).replace(/[^\d]/g, ""), 10);
    if (!num || isNaN(num)) return String(n);
    return `${num.toLocaleString("en-US").replace(/,/g, " ")} ${(unit || "km").toUpperCase()}`;
  } catch {
    return String(n);
  }
};

const fmtPrice = (p, onRequest) => {
  if (!p) return onRequest || "On request";
  if (typeof p === "object") {
    const amount = p.amount || p.value || p.usd || p.eur;
    const cur = (p.currency || p.cur || "EUR").toUpperCase();
    if (amount) return `${Number(amount).toLocaleString("en-US")} ${cur}`;
  }
  return String(p);
};

/**
 * Parse a BidMotors `sale_date` string ("DD.MM.YYYY" or "DD.MM.YYYY HH:MM"
 * or ISO) and return a JS Date in Europe/Sofia (UTC+2). When only a date is
 * provided, we point to the end of that auction day (23:59 local).
 */
function parseSaleDate(s) {
  if (!s) return null;
  if (s instanceof Date) return s;
  const str = String(s).trim();
  // Try ISO first
  const iso = Date.parse(str);
  if (!isNaN(iso) && /\d{4}-\d{2}-\d{2}/.test(str)) return new Date(iso);
  // DD.MM.YYYY[ HH:MM]
  const m = str.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})(?:\s+(\d{1,2}):(\d{2}))?/);
  if (m) {
    const [, d, mo, y, hh, mm] = m;
    // Approximate Bulgaria UTC+2 offset (DST not strictly tracked — close enough
    // for a marketing countdown; live status is anchored to backend "live" flag).
    const utcMs = Date.UTC(
      parseInt(y, 10),
      parseInt(mo, 10) - 1,
      parseInt(d, 10),
      hh ? parseInt(hh, 10) - 2 : 21, // 23:59 Sofia ≈ 21:59 UTC if no time given
      mm ? parseInt(mm, 10) : 59,
      0
    );
    return new Date(utcMs);
  }
  return null;
}

function formatRemaining(ms, closedLabel) {
  if (ms <= 0) return closedLabel || "Closed";
  const totalSec = Math.floor(ms / 1000);
  const days = Math.floor(totalSec / 86400);
  const hours = Math.floor((totalSec % 86400) / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h ${mins}m`;
  return `${hours}h ${mins}m ${totalSec % 60}s`;
}

/* ────────── component ────────── */
const Card1 = ({
  className = "",
  data,
  // legacy Figma props (used as fallback)
  image15,
  iconoirclock = "/figma/iconoir-clock.svg",
  title: titleProp,
  tradingDate: tradingDateProp,
  timer: timerProp,
  purchasePrice: purchasePriceProp,
  mileage: mileageProp,
  engine: engineProp,
  drive: driveProp,
  finalCost: finalCostProp,
  ctaLabel,
  // shared selection state
  favoriteSet,
  compareSet,
  compareCount = 0,
  onToggleFavoriteLocal, // (vin, next) — optimistic update from parent
  onToggleCompareLocal,  // (vin, next)
}) => {
  const navigate = useNavigate();
  const { lang } = useLang();
  const t = lang === "bg" ? T.bg : T.en;
  const [busyFav, setBusyFav] = useState(false);
  const [busyCmp, setBusyCmp] = useState(false);
  /* Transient one-shot "pop" animation flag — set true only when the
   * USER clicks the icon. Prevents the icons from "twitching" on the
   * initial render when the favorites/compare sets arrive async from
   * the API and flip the active state. Cleared 320 ms after the click. */
  const [popFav, setPopFav] = useState(false);
  const [popCmp, setPopCmp] = useState(false);
  const popTimersRef = useRef({ fav: null, cmp: null });
  useEffect(() => () => {
    if (popTimersRef.current.fav) clearTimeout(popTimersRef.current.fav);
    if (popTimersRef.current.cmp) clearTimeout(popTimersRef.current.cmp);
  }, []);

  // Resolve display values
  // The backend `/api/public/vehicles` row uses `images` (array), `current_bid`
  // (numeric, with `current_bid_currency`) and `drivetrain` — Card1 maps those
  // to the slot names used in the UI.  When a field is missing we render an
  // em-dash rather than mock data: the user explicitly asked to remove every
  // hard-coded "20,000-30,000 EURO" / "65 900 KM" / Lucid placeholder.
  const vin = data?.vin || null;
  const title = data?.title || titleProp || '';
  const imagesArr = Array.isArray(data?.images) ? data.images.filter(Boolean) : [];
  const image = imagesArr[0] || data?.image || image15 || FALLBACK_IMG;
  const auctionName = data?.auction_name || data?.auction || '';
  const lotNumber = data?.lot_number;
  // Real price comes from `current_bid` + `current_bid_currency` (USD by
  // default).  Fall back to the older `price` field for legacy rows, then
  // to "On request" when neither is present.  No mock EUR range.
  const fmtCurrentBid = () => {
    if (data && Number.isFinite(Number(data.current_bid))) {
      const v = Number(data.current_bid);
      const cur = (data.current_bid_currency || 'USD').toUpperCase();
      const sym = cur === 'USD' ? '$' : cur === 'EUR' ? '€' : '';
      try { return `${sym}${v.toLocaleString('en-US')}${sym ? '' : ' ' + cur}`; }
      catch { return `${sym}${v}${sym ? '' : ' ' + cur}`; }
    }
    return null;
  };
  const purchasePrice = fmtCurrentBid()
    || fmtPrice(data?.price ?? purchasePriceProp, t.onRequest)
    || t.onRequest;
  const mileage = data ? fmtKm(data.odometer, data.odometer_unit) : (mileageProp || '—');
  // `engine` from backend is "1.6l 4" / "3.5l 6" — show that verbatim.
  const engine = data?.engine || engineProp || '—';
  const drive  = data?.drivetrain || driveProp || '—';
  // `finalCost` block was a sales-tool teaser; only show if explicitly passed.
  const finalCost = finalCostProp || null;
  const tradingDate = tradingDateProp
    || (lotNumber ? `${t.lotPrefix} - ${lotNumber}` : (auctionName ? `${t.auctionPrefix} - ${auctionName}` : ''));

  /* ── real-time countdown ── */
  const saleAt = useMemo(() => parseSaleDate(data?.sale_date), [data?.sale_date]);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!saleAt) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [saleAt]);
  const timerLabel = saleAt ? formatRemaining(saleAt.getTime() - now, t.closed) : (timerProp || t.auctionTba);

  /* Single canonical detail path: /cars/:vin
   * Every welcome-page card (figma_home card1, CarRowCard, CarCardVertical) and
   * the header VIN search submit to the same SingleCarPage via this route. The
   * old `/catalog/:id` and `/vin/:query` shortcuts have been retired to avoid
   * any stale layout flashing during navigation (see App.js routes). */
  const detailHref = vin ? `/cars/${encodeURIComponent(vin)}` : null;
  const isFav = vin && favoriteSet ? favoriteSet.has(vin) : false;
  const isCmp = vin && compareSet ? compareSet.has(vin) : false;
  const cmpFull = compareCount >= 3 && !isCmp;

  /* ── Share modal state — opens on share-icon click; the modal posts to
   *    /api/shares so we keep parity with SingleCarPage's share flow. */
  const [shareOpen, setShareOpen] = useState(false);

  /* ── handlers ── */
  const requireAuth = () => {
    if (getCustomerToken()) return true;
    toast.info(t.pleaseLogin, { duration: 2400 });
    setTimeout(() => {
      const redirect = encodeURIComponent(window.location.pathname);
      navigate(`/cabinet/login?redirect=${redirect}`);
    }, 700);
    return false;
  };

  const handleFav = async (e) => {
    e.preventDefault(); e.stopPropagation();
    if (!vin || busyFav) return;
    if (!requireAuth()) return;
    const next = !isFav;
    onToggleFavoriteLocal?.(vin, next); // optimistic in parent
    // Trigger ONE-SHOT pop animation only on user interaction.
    if (next) {
      setPopFav(true);
      if (popTimersRef.current.fav) clearTimeout(popTimersRef.current.fav);
      popTimersRef.current.fav = setTimeout(() => setPopFav(false), 320);
    }
    setBusyFav(true);
    try {
      const snapshot = {
        title, vin, vehicleId: vin, year: data?.year, make: data?.make,
        model: data?.model, trim: data?.trim, image,
        lot_number: lotNumber, auction_name: auctionName,
        odometer: data?.odometer, odometer_unit: data?.odometer_unit,
        price: data?.price,
      };
      if (next) {
        await userEngagementApi.favorites.add({
          vin, vehicleId: vin, sourcePage: window.location.pathname, ...snapshot,
        });
        toast.success(t.addedToFavorites, { description: title, duration: 2200 });
      } else {
        await userEngagementApi.favorites.remove(vin);
        toast(t.removedFromFavorites, { description: title, duration: 1800 });
      }
    } catch (err) {
      onToggleFavoriteLocal?.(vin, !next); // rollback
      if (err?.status === 401) requireAuth();
      else toast.error(err?.message || t.couldNotUpdateFavorites);
    } finally {
      setBusyFav(false);
    }
  };

  const handleCmp = async (e) => {
    e.preventDefault(); e.stopPropagation();
    if (!vin || busyCmp) return;
    if (!requireAuth()) return;  // guest → show sign-in modal, don't call API
    if (cmpFull) {
      toast.info(t.compareFull, { duration: 2200 });
      return;
    }
    const next = !isCmp;
    onToggleCompareLocal?.(vin, next);
    if (next) {
      setPopCmp(true);
      if (popTimersRef.current.cmp) clearTimeout(popTimersRef.current.cmp);
      popTimersRef.current.cmp = setTimeout(() => setPopCmp(false), 320);
    }
    setBusyCmp(true);
    try {
      if (next) {
        const res = await userEngagementApi.compare.add({
          vehicleId: vin, vin, snapshot: {
            title, image, year: data?.year, make: data?.make, model: data?.model,
            lot_number: lotNumber, auction_name: auctionName,
            odometer: data?.odometer, odometer_unit: data?.odometer_unit,
          },
        });
        const count = typeof res?.count === 'number' ? res.count : null;
        const openCompare = () => {
          let cid = null;
          try { cid = JSON.parse(localStorage.getItem('customer_session') || 'null')?.customerId; }
          catch { cid = null; }
          window.location.href = cid ? `/cabinet/${cid}/compare` : '/cabinet/compare';
        };
        if (count === 1 || res?.needsMore === true) {
          toast.success(t.addedToCompare, {
            description: t.addedToCompareNeedMore,
            duration: 5500,
          });
        } else if (count === 2) {
          toast.success(t.compareReadyTitle, {
            description: t.compareReadyDesc,
            duration: 6500,
            action: { label: t.openCompareBtn, onClick: openCompare },
          });
        } else {
          toast.success(t.compareFullTitle, {
            description: t.compareFullDesc,
            duration: 5500,
            action: { label: t.openCompareBtn, onClick: openCompare },
          });
        }
      } else {
        await userEngagementApi.compare.remove(vin);
        toast(t.removedFromCompare, { description: title, duration: 1600 });
      }
    } catch (err) {
      onToggleCompareLocal?.(vin, !next);
      if (err?.status === 401 || err?.status === 403) {
        requireAuth();
      } else if (err?.status === 409) {
        toast.info(t.compareFull, { duration: 2500 });
      } else {
        toast.error(err?.message || t.couldNotUpdateCompare);
      }
    } finally {
      setBusyCmp(false);
    }
  };

  const PhotoOverlays = () => (
    <>
      <img className={styles.image} src={optimizeImage(image, ImageSize.cardDesktop)} alt={title} loading="lazy"
           onError={(e) => { e.currentTarget.src = FALLBACK_IMG; }} />
      <div className={styles.tradingDate}>{tradingDate}</div>
      <div className={styles.timerChip} title={saleAt ? saleAt.toLocaleString() : ""}>
        <img className={styles.clockIcon} src={iconoirclock} width={20} height={20} alt="" />
        <span className={styles.timerText}>{timerLabel}</span>
      </div>
      <div className={styles.actions}>
        {/* 1. SHARE — opens ShareModal (parity with SingleCarPage + Catalog
         *    cards).  Stop click propagation so it doesn't trigger the card's
         *    own navigation Link. */}
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); e.preventDefault(); setShareOpen(true); }}
          className={styles.iconBtn}
          aria-label={t.shareCar}
          data-testid={`share-btn-${vin || "card"}`}
        >
          <img src="/figma/card-share.svg" alt="" width={32} height={32} />
        </button>
        <button
          type="button"
          onClick={handleCmp}
          disabled={busyCmp}
          className={`${styles.iconBtn} ${isCmp ? styles.iconBtnActive : ""} ${popCmp ? styles.iconJustPopped : ""}`}
          aria-label={isCmp ? t.removeFromCompare : t.addToCompare}
          aria-pressed={isCmp}
          data-testid={`compare-btn-${vin || "card"}`}
        >
          <img
            src={isCmp ? "/figma/card-compare-active.svg" : "/figma/card-compare.svg"}
            alt="" width={32} height={32}
          />
        </button>
        <button
          type="button"
          onClick={handleFav}
          disabled={busyFav}
          className={`${styles.iconBtn} ${isFav ? styles.iconBtnActive : ""} ${popFav ? styles.iconJustPopped : ""}`}
          aria-label={isFav ? t.removeFromFavorites : t.addToFavorites}
          aria-pressed={isFav}
          data-testid={`fav-btn-${vin || "card"}`}
        >
          <img
            src={isFav ? "/figma/card-heart-active.svg" : "/figma/card-heart.svg"}
            alt="" width={32} height={32}
          />
        </button>
      </div>
    </>
  );

  return (
    <article className={[styles.card, className].join(" ")} data-testid={vin ? `deal-card-${vin}` : "deal-card"}>
      <div className={styles.imageBox}>
        {detailHref ? (
          <Link to={detailHref} aria-label={title} style={{ display: "block", width: "100%", height: "100%" }}>
            <PhotoOverlays />
          </Link>
        ) : (
          <PhotoOverlays />
        )}
      </div>

      <h3 className={styles.title}>
        {detailHref ? (
          <Link to={detailHref} style={{ color: "inherit", textDecoration: "none" }}>{title}</Link>
        ) : title}
      </h3>

      <div className={styles.specs}>
        <div className={styles.priceBox}>
          <span className={styles.priceLabel}>{t.purchasePrice}</span>
          <span className={styles.priceValue}>{purchasePrice}</span>
        </div>

        <dl className={styles.techList}>
          <div className={styles.techRow}>
            <dt className={styles.techLabel}>{t.mileage}</dt>
            <dd className={styles.techValue}>{mileage}</dd>
          </div>
          <div className={styles.techRow}>
            <dt className={styles.techLabel}>{t.engine}</dt>
            <dd className={styles.techValue}>{engine}</dd>
          </div>
          <div className={styles.techRow}>
            <dt className={styles.techLabel}>{t.drive}</dt>
            <dd className={styles.techValue}>{drive}</dd>
          </div>
        </dl>
      </div>

      <div className={styles.footer}>
        <div className={styles.finalCostBlock}>
          <span className={styles.finalCostLabel}>{t.estimatedFinalCostToBulgaria}</span>
          <span className={styles.finalCostValue}>{finalCost || "—"}</span>
        </div>
        {detailHref ? (
          <Link to={detailHref} className={styles.ctaBtn} style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", textDecoration: "none" }}>
            {ctaLabel || t.moreDetails}
          </Link>
        ) : (
          <button type="button" className={styles.ctaBtn}>{ctaLabel || t.moreDetails}</button>
        )}
      </div>

      {/* ── Share modal portal — opens from the share icon above.  Closed by
       *    default; mounted unconditionally so the open/close animation runs
       *    smoothly without remount flicker. */}
      <ShareModal
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        vin={vin}
        snapshot={{
          title,
          image,
          price: typeof purchasePrice === "string" ? purchasePrice : undefined,
          lot_number: lotNumber,
          auction_name: auctionName,
        }}
      />
    </article>
  );
};

export default Card1;
