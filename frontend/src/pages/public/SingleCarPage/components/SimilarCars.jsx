import React, { useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import { useParams } from 'react-router-dom';
import { useLang } from '../../../../i18n';
import { useSingleCarT } from '../i18n';
import CarCard from './CarCard';
import styles from './SimilarCars.module.css';

const API_URL = process.env.REACT_APP_BACKEND_URL || '';
const PAGE_SIZE = 3;
const MOBILE_BREAKPOINT = 768;

/* ─────────────────────────────────────────────────────────────────────────
 * Pagination arrow SVGs — 40 × 40 circle with chevron centred inside.
 *
 * Three visual states per arrow:
 *
 *   • DEFAULT  (no fill, orange ring, orange chevron)
 *       Used when:
 *         – the user has not clicked any arrow yet (no `lastDir`)
 *         – or this is the opposite of `lastDir` and is still navigable
 *
 *   • FILLED   (orange fill, orange ring, black chevron)
 *       Used when:
 *         – this arrow matches the direction the user just navigated
 *           (e.g. they clicked ">" so the next button shows filled)
 *
 *   • DISABLED (no fill, grey ring + grey chevron, reduced opacity)
 *       Used when:
 *         – the arrow can no longer move in its direction
 *           (e.g. activeIdx === 0 → prev is disabled, activeIdx === N-1
 *            → next is disabled)
 *
 * Note: each <button> wrapper still handles aria/click. We render only one
 * variant at a time based on the props passed in.
 * ───────────────────────────────────────────────────────────────────────── */
const ArrowLeftCircle = ({ filled, disabled }) => {
  const ringStroke = disabled ? '#5E5E5E' : '#FEAE00';
  const ringFill = filled && !disabled ? '#FEAE00' : 'transparent';
  const chevronStroke = disabled
    ? '#5E5E5E'
    : filled
      ? '#18181B'
      : '#FEAE00';
  return (
    <svg width="40" height="40" viewBox="0 0 40 40" aria-hidden="true">
      <circle cx="20" cy="20" r="19" stroke={ringStroke} fill={ringFill} strokeWidth="1" />
      <path
        d="M23 13 16 20l7 7"
        stroke={chevronStroke}
        strokeWidth="2"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
};

const ArrowRightCircle = ({ filled, disabled }) => {
  const ringStroke = disabled ? '#5E5E5E' : '#FEAE00';
  const ringFill = filled && !disabled ? '#FEAE00' : 'transparent';
  const chevronStroke = disabled
    ? '#5E5E5E'
    : filled
      ? '#18181B'
      : '#FEAE00';
  return (
    <svg width="40" height="40" viewBox="0 0 40 40" aria-hidden="true">
      <circle cx="20" cy="20" r="19" stroke={ringStroke} fill={ringFill} strokeWidth="1" />
      <path
        d="M17 13l7 7-7 7"
        stroke={chevronStroke}
        strokeWidth="2"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
};

/**
 * "Similar Cars" carousel at the bottom of SingleCarPage.
 *
 * Behaviour
 * ─────────
 *  • Desktop (≥ 769 px) — classic 3-cards-per-page layout. Prev / Next
 *    buttons paginate through the 18-item feed in chunks of 3.
 *  • Mobile  (≤ 768 px) — single-card horizontal scroll-snap slider. All
 *    items are rendered inside one scroller; the page indicator and
 *    arrow buttons drive the scroll position so that "01 / N" always
 *    mirrors the card that is ≥ 70 % visible on screen (snap default).
 *
 * Pagination indicator logic (see SVG block above for visual rules):
 *   • `lastDir = null`           → both arrows DEFAULT (outline only)
 *   • `lastDir = 'next'`         → right arrow FILLED, left arrow DEFAULT
 *   • `lastDir = 'prev'`         → left arrow FILLED, right arrow DEFAULT
 *   • Either arrow at the boundary becomes DISABLED regardless of `lastDir`.
 */
const SimilarCars = ({ className = '' }) => {
  const params = useParams();
  const { lang } = useLang();
  const t = useSingleCarT(lang);
  const currentVin = useMemo(
    () => (params.slug || params.query || params.vin || '').toUpperCase(),
    [params],
  );

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  /* `lastDir` tracks the most recent navigation direction the user chose.
   * It starts as null so on first render both arrows render in DEFAULT
   * (outline-only) state per the design spec. */
  const [lastDir, setLastDir] = useState(null);
  const [isMobile, setIsMobile] = useState(
    typeof window !== 'undefined' && window.innerWidth <= MOBILE_BREAKPOINT,
  );
  const scrollerRef = useRef(null);
  const [activeIdx, setActiveIdx] = useState(0);

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth <= MOBILE_BREAKPOINT);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const { data } = await axios.get(`${API_URL}/api/public/featured`, {
          params: { limit: 18 },
          timeout: 15000,
        });
        if (cancelled) return;
        const arr = Array.isArray(data?.items) ? data.items : [];
        const filtered = arr.filter((x) => (x?.vin || '').toUpperCase() !== currentVin);
        setItems(filtered);
      } catch {
        if (!cancelled) setItems([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [currentVin]);

  /* Mobile: track which card is currently snapped into view based on
   * scrollLeft. The browser's mandatory snap honours a ~50 % visibility
   * threshold; we round here to mirror that visually in the page label. */
  useEffect(() => {
    if (!isMobile) return undefined;
    const el = scrollerRef.current;
    if (!el) return undefined;
    const onScroll = () => {
      const w = el.clientWidth || 1;
      const idx = Math.round(el.scrollLeft / w);
      setActiveIdx(Math.max(0, Math.min(items.length - 1, idx)));
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, [isMobile, items.length]);

  /* Desktop pagination (3-per-page). Hidden on mobile via isMobile branch. */
  const totalPagesDesktop = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPagesDesktop);
  const slice = items.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  // If no items and not loading, hide the entire block.
  if (!loading && items.length === 0) return null;

  /* Mobile: single-card slider state */
  const mobileTotal = items.length;
  const mobileCurrent = Math.min(activeIdx + 1, Math.max(1, mobileTotal));
  const scrollToIdx = (idx) => {
    const el = scrollerRef.current;
    if (!el) return;
    const clamped = Math.max(0, Math.min(items.length - 1, idx));
    el.scrollTo({ left: clamped * el.clientWidth, behavior: 'smooth' });
  };

  /* Boundary / state computations for the arrow visuals. */
  const prevDisabled = isMobile ? activeIdx <= 0 : safePage <= 1;
  const nextDisabled = isMobile ? activeIdx >= mobileTotal - 1 : safePage >= totalPagesDesktop;
  const prevFilled = lastDir === 'prev' && !prevDisabled;
  const nextFilled = lastDir === 'next' && !nextDisabled;

  const handlePrev = () => {
    if (prevDisabled) return;
    setLastDir('prev');
    if (isMobile) scrollToIdx(activeIdx - 1);
    else setPage((p) => Math.max(1, p - 1));
  };
  const handleNext = () => {
    if (nextDisabled) return;
    setLastDir('next');
    if (isMobile) scrollToIdx(activeIdx + 1);
    else setPage((p) => Math.min(totalPagesDesktop, p + 1));
  };

  return (
    <section className={[styles.similarCarsContainerWrapper, className].join(' ')}>
      <div className={styles.similarCarsContainer}>
        <h2 className={styles.similarCars}>
          <span>{t.similarPart1}</span>
          <span className={styles.cars}>{t.similarPart2}</span>
        </h2>
        <div className={styles.carCards} ref={scrollerRef}>
          {loading
            ? Array.from({ length: PAGE_SIZE }).map((_, i) => (
                <CarCardSkeleton key={`sk-${i}`} />
              ))
            : (isMobile ? items : slice).map((item) => (
                <CarCard key={item.vin} data={item} variant="similar" />
              ))}
        </div>
        {!loading && (isMobile ? mobileTotal > 1 : totalPagesDesktop > 1) && (
          <div className={styles.pagination}>
            <button
              type="button"
              className={[styles.pageBtn, styles.pageBtnPrev, prevFilled ? styles.pageBtnFilled : ''].join(' ')}
              aria-label={t.previous}
              data-state={prevDisabled ? 'disabled' : prevFilled ? 'filled' : 'default'}
              disabled={prevDisabled}
              onClick={handlePrev}
            >
              <ArrowLeftCircle filled={prevFilled} disabled={prevDisabled} />
            </button>
            <div className={styles.pageNum}>
              {(() => {
                const total = items.length;
                if (isMobile) {
                  return `${String(mobileCurrent).padStart(2, '0')}/${String(total).padStart(2, '0')}`;
                }
                /* Desktop: show the index of the LAST visible card on the
                 * current page ("seen 3 of 12") so the indicator reflects
                 * the real number of similar cars instead of pages.
                 * Previously this said "01/04" for 12 cars / 3 per page,
                 * which confused users into thinking only 4 cars existed. */
                const lastVisible = Math.min(safePage * PAGE_SIZE, total);
                return `${String(lastVisible).padStart(2, '0')}/${String(total).padStart(2, '0')}`;
              })()}
            </div>
            <button
              type="button"
              className={[styles.pageBtn, styles.pageBtnNext, nextFilled ? styles.pageBtnFilled : ''].join(' ')}
              aria-label={t.next}
              data-state={nextDisabled ? 'disabled' : nextFilled ? 'filled' : 'default'}
              disabled={nextDisabled}
              onClick={handleNext}
            >
              <ArrowRightCircle filled={nextFilled} disabled={nextDisabled} />
            </button>
          </div>
        )}
      </div>
    </section>
  );
};

const CarCardSkeleton = () => (
  <div className={styles.skeletonCard} aria-hidden="true">
    <div className={styles.skeletonImage} />
    <div className={styles.skeletonLines}>
      <div className={styles.skeletonLine} />
      <div className={styles.skeletonLine} style={{ width: '60%' }} />
      <div className={styles.skeletonLine} style={{ width: '40%' }} />
    </div>
  </div>
);

export default SimilarCars;
