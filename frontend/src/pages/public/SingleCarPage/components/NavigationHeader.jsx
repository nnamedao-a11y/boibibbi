import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { useLang } from '../../../../i18n';
import { useSingleCarT } from '../i18n';
import styles from './NavigationHeader.module.css';
import ShareModal from '../../../../components/public/ShareModal';
import AnimatedHeading from '../../../../components/AnimatedHeading';
import { userEngagementApi, getCustomerToken } from '../../../../lib/api';

/**
 * Breadcrumb + page title for the Single Car page.
 *
 * STRICT pixel spec (May 2026, desktop ≥ 1280 px):
 *   • 52 px gap from PublicLayout header bottom → breadcrumb top   (padding-top)
 *   • 100 px left & right padding
 *   • 76 px gap breadcrumb → title           → title top = 148 px from header
 *   • 80 px H Bold Mazzard title (line-height 99.9%)
 *   • 142 px gap title bottom → ImageGrid top → ImageGrid top = 370 px from header
 *   • Breadcrumb: 20 px H SemiBold (600), uppercase
 *   • Right side: 3 action icons 40×40, gap 24 px, anchored to right padding (100)
 *
 * The right-icon strip renders three actions in the order
 *   **Share → Compare → Favorite**
 * each as 40 × 40 with an orange outlined ring matching the rest of the
 * SingleCarPage chrome. All three are fully wired to the backend:
 *   • Share    — opens <ShareModal /> (POST /api/shares — auth optional)
 *   • Compare  — POST /api/compare/add  / DELETE /api/compare/remove/<VIN>
 *                Live state from GET /api/compare/me on mount.
 *   • Favorite — POST /api/favorites    / DELETE /api/favorites/<VIN>
 *                Live state from GET /api/favorites/check/<VIN> on mount
 *                (requires auth; falls back to "not favorited" for guests
 *                and redirects unauthenticated favorite clicks to login).
 *
 * The compare icon is the **design-system scales icon** (was previously
 * mistakenly using a custom horizontal-arrow SVG). The scales SVG is the
 * exact icon already used in CarCard's frameIcons row (Frame-1707479182).
 */
const NavigationHeader = ({
  className = '',
  breadcrumb = ['Home', 'Catalog'],
  title = '',
  vin = '',
  loading = false,
  /** Snapshot fields used by ShareModal — main image, price, etc. */
  shareSnapshot = null,
}) => {
  const { lang } = useLang();
  const t = useSingleCarT(lang);
  const displayTitle = loading ? t.loading : (title || t.vehicle);
  const [shareOpen, setShareOpen] = useState(false);

  const [isFavorite, setIsFavorite] = useState(false);
  const [isComparing, setIsComparing] = useState(false);
  const [favBusy, setFavBusy] = useState(false);
  const [cmpBusy, setCmpBusy] = useState(false);

  /* ── On VIN change: hydrate compare + favorite state ── */
  useEffect(() => {
    let cancelled = false;
    if (!vin) {
      setIsFavorite(false);
      setIsComparing(false);
      return undefined;
    }

    // Favorites — only meaningful for authenticated users. Guests get false.
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

    // Compare — also auth-gated now (matches new platform-wide UX). Guests
    // get a "not comparing" state and clicking will trigger the sign-in toast.
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

  const buildSnapshotPayload = useCallback(() => ({
    vin,
    title: shareSnapshot?.title || displayTitle,
    make: shareSnapshot?.make,
    model: shareSnapshot?.model,
    year: shareSnapshot?.year,
    trim: shareSnapshot?.trim,
    price: shareSnapshot?.price,
    image: shareSnapshot?.image,
    lot_number: shareSnapshot?.lot_number,
    auction_name: shareSnapshot?.auction_name,
    odometer: shareSnapshot?.odometer,
    odometer_unit: shareSnapshot?.odometer_unit,
    sourcePage: typeof window !== 'undefined' ? window.location.pathname : '',
  }), [vin, shareSnapshot, displayTitle]);

  /* ── Favorite click ── */
  const handleFavoriteClick = useCallback(async () => {
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
        await userEngagementApi.favorites.add(buildSnapshotPayload());
        setIsFavorite(true);
        toast.success(t.addedToFavorites);
      }
    } catch (e) {
      const msg = e?.message || t.couldNotUpdateFavorites;
      if (e?.status === 401 || e?.status === 403) {
        toast.error(t.pleaseSignInAgain);
      } else {
        toast.error(msg);
      }
    } finally {
      setFavBusy(false);
    }
  }, [vin, isFavorite, favBusy, buildSnapshotPayload, t]);

  /* ── Compare click ── */
  const handleCompareClick = useCallback(async () => {
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
        await userEngagementApi.compare.add({
          vin,
          vehicleId: vin,
          snapshot: buildSnapshotPayload(),
        });
        setIsComparing(true);
        toast.success(t.addedToCompare, {
          action: { label: t.openCompareBtn, onClick: () => { window.location.href = '/cabinet/compare'; } },
        });
      }
    } catch (e) {
      toast.error(e?.message || t.couldNotUpdateCompare);
    } finally {
      setCmpBusy(false);
    }
  }, [vin, isComparing, cmpBusy, buildSnapshotPayload, t]);

  return (
    <section className={[styles.navigationHeader, className].join(' ')}>
      <div className={styles.headerInner}>
        <h3 className={styles.breadcrumb}>
          <Link to="/" className={styles.crumbLink} data-testid="breadcrumb-home">{breadcrumb[0]}</Link>
          <span className={styles.crumbSep}> / </span>
          <Link to="/catalog" className={styles.crumbLink} data-testid="breadcrumb-catalog">{breadcrumb[1]}</Link>
          <span className={styles.crumbSep}> / </span>
          <span className={styles.lucidMotorsAir}>{displayTitle}</span>
        </h3>

        <div className={styles.titleRow}>
          {/* Animated entry — per-character left-to-right cascade matching
              the homepage hero ("FROM AUCTION TO KEYS"). Only the title
              animates; the icon row remains static so its hit targets are
              immediately interactive. */}
          <AnimatedHeading
            as="h1"
            className={styles.title}
            text={displayTitle || ''}
          />
          <div className={styles.iconRow}>
            {/* 1. Share — opens ShareModal */}
            <button
              type="button"
              className={styles.iconBtn}
              aria-label={t.shareCar}
              data-vin={vin}
              data-testid="single-car-share-btn"
              onClick={() => setShareOpen(true)}
              disabled={!vin || loading}
            >
              <img
                className={styles.iconImg}
                width={40}
                height={40}
                alt=""
                src="/single-car/share-icon.svg"
              />
            </button>

            {/* 2. Compare — toggles add/remove from compare list */}
            <button
              type="button"
              className={[styles.iconBtn, isComparing ? styles.iconBtnActive : ''].join(' ')}
              aria-label={isComparing ? t.removeFromCompare : t.addToCompare}
              aria-pressed={isComparing}
              data-vin={vin}
              data-active={isComparing ? 'true' : 'false'}
              data-testid="single-car-compare-btn"
              onClick={handleCompareClick}
              disabled={!vin || loading || cmpBusy}
            >
              <img
                className={styles.iconImg}
                width={40}
                height={40}
                alt=""
                src="/single-car/compare-icon.svg"
              />
            </button>

            {/* 3. Favorite (heart) — toggles add/remove */}
            <button
              type="button"
              className={[styles.iconBtn, isFavorite ? styles.iconBtnActive : ''].join(' ')}
              aria-label={isFavorite ? t.removeFromFavorites : t.addToFavorites}
              aria-pressed={isFavorite}
              data-vin={vin}
              data-active={isFavorite ? 'true' : 'false'}
              data-testid="single-car-favorite-btn"
              onClick={handleFavoriteClick}
              disabled={!vin || loading || favBusy}
            >
              <img
                className={styles.iconImg}
                width={40}
                height={40}
                alt=""
                src="/single-car/favorite-icon.svg"
              />
            </button>
          </div>
        </div>
      </div>

      <ShareModal
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        vin={vin}
        snapshot={shareSnapshot}
      />
    </section>
  );
};

export default NavigationHeader;
