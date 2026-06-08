/**
 * Public Catalog page — Figma 1:1 (1920 design viewport).
 *
 * Phase B1 — Frontend pagination + cache hardening
 * ------------------------------------------------
 *   • Pagination is **accumulating**: each page is its own React Query
 *     cache entry; we walk pages 1..loadedPages on every render and
 *     concatenate their `items`. Earlier pages stay in cache so back-nav
 *     and re-mount don't re-fetch.
 *   • Page reset only on filters/sort change (not on "Show more +").
 *   • Cache key = filters + sort + skip → identical queries collide
 *     across components / unmounts.
 */
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import styles from './CatalogPage.module.css';
import CatalogFilter    from '../../components/public/catalog/CatalogFilter';
import VehicleCardRow   from '../../components/public/catalog/VehicleCardRow';
import SortDropdown, { SORT_OPTIONS } from '../../components/public/catalog/SortDropdown';
import CatalogSearchBar from '../../components/public/catalog/CatalogSearchBar';
import CatalogConsultationBlock from '../../components/public/catalog/CatalogConsultationBlock';
import PageHero from '../../components/public/PageHero';
import { useLang } from '../../i18n';
import { API_URL } from '../../App';
import { buildVehiclesParams } from '../../hooks/usePublicVehicles';
import { trackEvent, EVENT_NAMES } from '../../hooks/useTrackEvent';

const PAGE_SIZE = 6;

const DEFAULT_FILTERS = {
  vehicleType: null,        // motorbike | sedan | suv | pickup | van | null (all)
  brand:    [],             // string[] (multi-select)
  model:    [],             // string[] (multi-select)
  yearMin:  '',
  yearMax:  '',
  priceMin: '',
  priceMax: '',
  mileageMin: '',
  mileageMax: '',
  damaged:  null,           // null = both, true | false
  country:  null,           // USA | KOREA | null
  auctionType: [],          // string[] (multi-select)
  auctionStatus: [],        // ['within7','upcoming','buyNow']
  fuel:     [],
  transmission: [],
  bodyType: '',
  driveType:'',
  engineVolume: '',
};

export default function CatalogPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useLang();
  // Read URL query params on first mount → seed filters.
  // Enables deep-links like /catalog?make=Toyota&model=Corolla (used by
  // VehicleCardRow Sold-variant CTA "find similar vehicles").
  const initialFilters = useMemo(() => {
    const sp = new URLSearchParams(location.search);
    return {
      ...DEFAULT_FILTERS,
      brand:        sp.get('make')         ? [sp.get('make')]   : DEFAULT_FILTERS.brand,
      model:        sp.get('model')        ? [sp.get('model')]  : DEFAULT_FILTERS.model,
      yearMin:      sp.get('year_min')     || DEFAULT_FILTERS.yearMin,
      yearMax:      sp.get('year_max')     || DEFAULT_FILTERS.yearMax,
      priceMin:     sp.get('price_min')    || DEFAULT_FILTERS.priceMin,
      priceMax:     sp.get('price_max')    || DEFAULT_FILTERS.priceMax,
      vehicleType:  sp.get('vehicle_type') || DEFAULT_FILTERS.vehicleType,
      country:      sp.get('country')      || DEFAULT_FILTERS.country,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // run only once on mount; further changes routed via setFilters
  const [filters, setFilters] = useState(initialFilters);
  const [page,    setPage]    = useState(1);    // page count, used for limit
  const [items,   setItems]   = useState([]);
  const [total,   setTotal]   = useState(0);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);
  const [sort,    setSort]    = useState('popular');
  // Honest meta from backend (price_filter_mode, hidden_by_price_filter)
  const [meta, setMeta] = useState(null);

  // Mobile UI state — filter drawer + sort sheet (≤768 px viewport)
  const [mobileFilterOpen, setMobileFilterOpen] = useState(false);
  const [mobileSortOpen,   setMobileSortOpen]   = useState(false);

  // Lock body scroll when any mobile overlay is open
  useEffect(() => {
    const anyOpen = mobileFilterOpen || mobileSortOpen;
    if (typeof document === 'undefined') return undefined;
    const prev = document.body.style.overflow;
    if (anyOpen) document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [mobileFilterOpen, mobileSortOpen]);

  // Phase B1 — Build axios params per page (NOT per cumulative window).
  // The old code did `limit = page*PAGE_SIZE, skip = 0` which refetched
  // everything from the start on every "Show more +" click. We now fetch
  // ONE page at a time and accumulate via React Query's cache.
  const baseParams = useMemo(
    () => buildVehiclesParams(filters, sort, 0, PAGE_SIZE),
    [filters, sort]
  );

  // Reset page→1 ONLY when filters/sort change (NOT on Show more).
  useEffect(() => { setPage(1); }, [JSON.stringify(filters), sort]); // eslint-disable-line react-hooks/exhaustive-deps

  // Active page query — fetches just the current "tip" page. Earlier
  // pages are read from cache by the accumulator effect below.
  const queryClient = useQueryClient();
  const currentSkip = (page - 1) * PAGE_SIZE;
  const currentPageParams = { ...baseParams, skip: currentSkip, limit: PAGE_SIZE };
  const currentQ = useQuery({
    queryKey: ['public/vehicles', currentPageParams],
    placeholderData: (prev) => prev,
    queryFn: async ({ signal }) => {
      const res = await axios.get(`${API_URL}/api/public/vehicles`, {
        params: currentPageParams,
        signal,
        timeout: 20000,
      });
      const d = res?.data || {};
      return {
        items: Array.isArray(d.data) ? d.data : Array.isArray(d.items) ? d.items : [],
        total: Number.isFinite(d.total) ? Number(d.total) : 0,
        meta:  d.meta || null,
      };
    },
  });

  // Accumulate pages 1..page from cache so the grid renders ALL loaded
  // items, not just the tip page. Earlier pages sit warm in cache.
  //
  // Defensive dedup-by-VIN: if the backend serves a stable order and our
  // page slices don't overlap, accumulation is safe. But if a worker
  // inserts a new vehicle between the page-1 and page-2 fetch, the
  // backend's `skip/limit` window can shift by one row and the same VIN
  // could appear on consecutive pages. We collapse by VIN (falling back
  // to lot_number / id) so the user never sees the same car twice. This
  // is a no-op when there is no overlap.
  useEffect(() => {
    const seen = new Set();
    const acc = [];
    let lastTotal = 0;
    let lastMeta = null;
    for (let p = 1; p <= page; p++) {
      const skip = (p - 1) * PAGE_SIZE;
      const cached = queryClient.getQueryData([
        'public/vehicles',
        { ...baseParams, skip, limit: PAGE_SIZE },
      ]);
      if (cached?.items?.length) {
        for (const it of cached.items) {
          const k = it.vin || it.lot_number || it.id;
          if (k && seen.has(k)) continue;
          if (k) seen.add(k);
          acc.push(it);
        }
      }
      if (cached?.total) lastTotal = cached.total;
      if (cached?.meta)  lastMeta  = cached.meta;
    }
    if (acc.length) setItems(acc);
    if (lastTotal) setTotal(lastTotal);
    // Always sync meta (even when result set is empty — that's exactly when
    // we want to surface the honest "X cars hidden by price filter" hint).
    setMeta(lastMeta);
    //
    // ── PHASE B5: HONEST EMPTY-STATE ON STRICT FILTER CHANGES ─────────
    // The two guards above (`if (acc.length)` and `if (lastTotal)`) were
    // originally added to prevent a brief grid flash between pagination
    // page swaps. Side-effect: when a NEW filter combination returns
    // ZERO matches, both branches silently no-op and the previous
    // (now-stale) cards stay on screen — making it look like the
    // filter did nothing. User-reported case: pick Audi → set
    // price_min=50000 → backend honestly returns total=0 +
    // hidden_by_price_filter=2, but UI kept showing the two priceless
    // Audi A4s, contradicting the banner. We now check whether the
    // currently-active query has finished AND produced an explicitly
    // empty page; if so, we clear the grid + total so the meta-only
    // empty state renders cleanly. Pagination (page > 1) is exempt so
    // earlier accumulated pages don't get wiped.
    if (
      page === 1
      && !currentQ.isLoading
      && !currentQ.isFetching
      && currentQ.data
      && Array.isArray(currentQ.data.items)
      && currentQ.data.items.length === 0
    ) {
      if (acc.length === 0) {
        setItems([]);
      }
      setTotal(Number.isFinite(currentQ.data.total) ? currentQ.data.total : 0);
    }
  }, [page, baseParams, currentQ.data, queryClient]);

  // Loading state — only true on the very first page (skeleton), not on
  // "Show more +" (the existing grid stays visible while the new page is
  // streamed in).
  useEffect(() => {
    if (page === 1) setLoading(currentQ.isLoading || currentQ.isFetching);
    setError(currentQ.isError ? (currentQ.error?.message || 'Could not load vehicles') : null);
  }, [page, currentQ.isLoading, currentQ.isFetching, currentQ.isError, currentQ.error]);

  // Active chip list — mirrors what the screenshot shows above the cards
  const activeChips = useMemo(() => {
    const chips = [];
    if (filters.yearMin || filters.yearMax)
      chips.push({ key: 'year',    label: `${filters.yearMin || '—'}-${filters.yearMax || '—'}` });
    if (filters.priceMin || filters.priceMax)
      chips.push({ key: 'price',   label: `€${filters.priceMin || '0'}-${filters.priceMax || '…'}` });
    if (filters.mileageMin || filters.mileageMax)
      chips.push({ key: 'mileage', label: `${filters.mileageMin || '0'}-${filters.mileageMax || '…'} km` });
    if (filters.damaged === true)  chips.push({ key: 'damaged', label: t('cardChipDamaged') || 'damaged' });
    if (filters.damaged === false) chips.push({ key: 'damaged', label: t('cardChipNotDamaged') || 'not damaged' });
    if (filters.brand && (Array.isArray(filters.brand) ? filters.brand.length : true)) {
      const brandLabel = Array.isArray(filters.brand)
        ? (filters.brand.length === 1 ? filters.brand[0] : `${filters.brand[0]} +${filters.brand.length - 1}`)
        : filters.brand;
      chips.push({ key: 'brand', label: brandLabel });
    }
    return chips;
  }, [filters, t]);

  const removeChip = (key) => {
    setPage(1);
    setFilters((prev) => {
      switch (key) {
        case 'year':    return { ...prev, yearMin: '', yearMax: '' };
        case 'price':   return { ...prev, priceMin: '', priceMax: '' };
        case 'mileage': return { ...prev, mileageMin: '', mileageMax: '' };
        case 'damaged': return { ...prev, damaged: null };
        case 'brand':   return { ...prev, brand: [], model: [] };
        default: return prev;
      }
    });
  };

  const resetAll = () => {
    setPage(1);
    setFilters(DEFAULT_FILTERS);
    trackEvent(EVENT_NAMES.CATALOG_FILTER_RESET);
  };
  const showMore = () => {
    setPage((p) => {
      const next = p + 1;
      trackEvent(EVENT_NAMES.CATALOG_SHOW_MORE, { page: next });
      return next;
    });
  };

  const canShowMore = items.length < total;

  // ── Cards reveal: one IntersectionObserver on the cards section so the
  // 6 default rows cascade in (block-by-block) when they scroll into view.
  // Adding `is-visible` once permanently means newly-mounted cards from
  // "Show more +" inherit the cascade rule and animate in automatically
  // — each new card picks up its `:nth-child(n)` stagger delay defined
  // in `reveal.global.css`.
  const cardsRef = useRef(null);
  const [cardsInView, setCardsInView] = useState(false);
  useEffect(() => {
    const el = cardsRef.current;
    if (!el || cardsInView) return undefined;
    const reduced =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduced) { setCardsInView(true); return undefined; }
    const rect = el.getBoundingClientRect();
    if (rect.top < (window.innerHeight || 0) && rect.bottom > 0) {
      requestAnimationFrame(() => requestAnimationFrame(() => setCardsInView(true)));
      return undefined;
    }
    if (typeof IntersectionObserver === 'undefined') { setCardsInView(true); return undefined; }
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => { if (e.isIntersecting) { setCardsInView(true); io.disconnect(); } });
      },
      { threshold: 0.05, rootMargin: '0px 0px -8% 0px' }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [cardsInView]);

  return (
    <div className={styles.catalogPage} data-testid="catalog-page">
      <PageHero
        home={t('crumbHome') || 'HOME'}
        crumbs={[{ label: t('crumbCatalog') || 'CATALOG' }]}
        title={t('pageCatalogTitle') || 'CATALOG'}
        rightSlot={<CatalogSearchBar />}
        testId="catalog-hero"
      />
      <div className={styles.container}>

        {/* main 2-column grid: filter | results */}
        <div className={styles.grid}>
          <CatalogFilter
            value={filters}
            onChange={(next) => { setFilters(next); setPage(1); }}
          />

          <div className={styles.resultsCol}>
            <header className={styles.resultsHeader}>
              <span className={styles.resultsCount}>
                {t('catalogFoundLabel') || 'FOUND'}{' '}<span className={styles.num}>{total.toLocaleString()}</span>{' '}{t('catalogResultsLabel') || 'RESULTS'}
              </span>

              {/* Mobile-only filter/sort icon buttons (24×24).
               *  Hidden on desktop via CSS (.mobileTools { display:none }). */}
              <div className={styles.mobileTools}>
                <button
                  type="button"
                  onClick={() => setMobileSortOpen(true)}
                  aria-label={t('mobileSortTitle') || 'Sort'}
                  aria-pressed={mobileSortOpen}
                  data-testid="catalog-mobile-sort-btn"
                >
                  <img src="/figma/catalog/icon-sort.svg" alt="" />
                </button>
                <button
                  type="button"
                  onClick={() => setMobileFilterOpen(true)}
                  aria-label={t('mobileFiltersTitle') || 'Filters'}
                  aria-pressed={mobileFilterOpen}
                  data-testid="catalog-mobile-filter-btn"
                >
                  <img src="/figma/catalog/icon-filter.svg" alt="" />
                </button>
              </div>

              <div className={styles.chipRow}>
                {activeChips.map((c) => (
                  <button
                    key={c.key}
                    type="button"
                    className={styles.chip}
                    onClick={() => removeChip(c.key)}
                    data-testid={`catalog-chip-${c.key}`}
                  >
                    <span>{c.label}</span>
                    <span className={styles.x} aria-hidden="true">×</span>
                  </button>
                ))}
                {activeChips.length > 0 && (
                  <button type="button" className={styles.resetAll} onClick={resetAll} data-testid="catalog-reset">{t('catalogResetAll') || 'Reset all'}</button>
                )}
              </div>

              {/* Desktop sort dropdown — hidden on mobile (CSS) */}
              <div className={styles.sortDropdownDesktop}>
                <SortDropdown
                  value={sort}
                  onChange={(k) => {
                    trackEvent(EVENT_NAMES.CATALOG_SORT_CHANGED, { sort: k });
                    setSort(k);
                    setPage(1);
                  }}
                />
              </div>
            </header>

            <section
              ref={cardsRef}
              className={`${styles.cards} ${cardsInView ? 'is-visible' : ''}`}
              data-stagger="120"
              style={{ '--stagger-step': '120ms' }}
              data-testid="catalog-cards"
            >
              {loading && items.length === 0 && (
                <div className={styles.statePanel}>{t('loadingVehicles') || 'Loading vehicles…'}</div>
              )}
              {error && (
                <div className={styles.statePanel}>{error}</div>
              )}
              {!loading && !error && items.length === 0 && (
                <div className={styles.statePanel}>
                  {(meta && (filters.priceMin || filters.priceMax) && meta.hidden_by_price_filter > 0)
                    ? (
                      <>
                        <strong>{meta.hidden_by_price_filter.toLocaleString()}</strong>
                        {' '}{(t('catalogHiddenByPriceFilter') || "vehicles match your other filters but don't have price data yet.")}
                        <br />
                        <button
                          type="button"
                          className={styles.priceHintAction}
                          onClick={() => removeChip('price')}
                          data-testid="catalog-clear-price-filter"
                        >
                          {t('catalogClearPriceFilter') || 'Clear price filter to see them →'}
                        </button>
                      </>
                    )
                    : (t('noVehiclesMatch') || 'No vehicles match the current filters. Try resetting the filters.')}
                </div>
              )}
              {!loading && !error && items.length > 0 && meta?.hidden_by_price_filter > 0 && (filters.priceMin || filters.priceMax) && (
                <div className={styles.priceHintBanner} data-testid="catalog-price-hint">
                  <span className={styles.priceHintDot} aria-hidden="true" />
                  <span>
                    {meta.hidden_by_price_filter.toLocaleString()}
                    {' '}{t('catalogPriceHintExtra') || "more vehicles match your other filters but don't have price data yet."}
                  </span>
                  <button
                    type="button"
                    className={styles.priceHintLink}
                    onClick={() => removeChip('price')}
                    data-testid="catalog-clear-price-filter-inline"
                  >
                    {t('catalogClearPrice') || 'Clear price filter'}
                  </button>
                </div>
              )}
              {items.map((v) => (
                <VehicleCardRow
                  key={v.vin || v.id || v.lot_number}
                  vehicle={v}
                  onClick={() => navigate(`/cars/${encodeURIComponent(v.vin || v.id)}`)}
                />
              ))}
            </section>

            {canShowMore && (
              <div className={styles.showMoreWrap}>
                <button type="button" className={styles.showMore} onClick={showMore} data-testid="catalog-show-more">
                  {t('showMorePlus') || 'Show more +'}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* External gap from the last vehicle card to the gray consultation block.
       *  Per Figma: 397 px from last card → top of gray section.
       *  When Show more is visible (32 + 72 + 16 = 120 px already used) we shrink
       *  the spacer to 397 - 120 = 277 px to keep the total at 397 px. */}
      <div
        aria-hidden="true"
        style={{ height: canShowMore ? 277 : 397 }}
        data-testid="catalog-consultation-spacer"
      />

      {/* Bottom consultation/contact section (full-bleed, Figma 1:1) */}
      <CatalogConsultationBlock />

      {/* =================================================================
       *  Mobile overlays — only rendered visible on ≤ 768 px via CSS.
       *  We keep them in the DOM so the slide-in animation runs both ways.
       * =============================================================== */}
      {/* Filter drawer scrim */}
      <div
        className={`${styles.mobileBackdrop} ${mobileFilterOpen || mobileSortOpen ? styles.mobileBackdropOpen : ''}`}
        onClick={() => { setMobileFilterOpen(false); setMobileSortOpen(false); }}
        aria-hidden="true"
        data-testid="catalog-mobile-backdrop"
      />

      {/* Filter bottom-sheet — hosts the same CatalogFilter used on desktop.
       *  Local state lets the user tweak filters and APPLY at the bottom; the
       *  drawer closes either via APPLY (commits) or × (discards changes).   */}
      <aside
        className={`${styles.mobileDrawer} ${mobileFilterOpen ? styles.mobileDrawerOpen : ''}`}
        aria-hidden={!mobileFilterOpen}
        data-testid="catalog-mobile-filter-drawer"
      >
        <div className={styles.mobileDrawerHeader}>
          <h2 className={styles.mobileDrawerTitle}>{t('mobileFiltersTitle') || 'Filters'}</h2>
          <button
            type="button"
            className={styles.mobileDrawerClose}
            onClick={() => setMobileFilterOpen(false)}
            aria-label={t('mobileCloseFilters') || 'Close filters'}
            data-testid="catalog-mobile-filter-close"
          >
            ×
          </button>
        </div>
        <div className={styles.mobileDrawerBody}>
          <CatalogFilter
            value={filters}
            onChange={(next) => { setFilters(next); setPage(1); }}
          />
        </div>
        <div className={styles.mobileDrawerFooter}>
          <button
            type="button"
            className={styles.mobileDrawerReset}
            onClick={() => { setFilters(DEFAULT_FILTERS); setPage(1); }}
            data-testid="catalog-mobile-filter-reset"
          >
            {t('catalogResetAll') || 'Reset all'}
          </button>
          <button
            type="button"
            className={styles.mobileDrawerApply}
            onClick={() => setMobileFilterOpen(false)}
            data-testid="catalog-mobile-filter-apply"
          >
            {t('mobileApplyFilters') || 'Apply filters'}
          </button>
        </div>
      </aside>

      {/* Sort bottom-sheet — slides up from bottom, mirrors filter sheet.
       *  Uses SORT_OPTIONS groups for visual dividers (matches Figma). */}
      <div
        className={`${styles.mobileSortMenu} ${mobileSortOpen ? styles.mobileSortMenuOpen : ''}`}
        aria-hidden={!mobileSortOpen}
        data-testid="catalog-mobile-sort-sheet"
      >
        <div className={styles.mobileSortHeader}>
          <span>{t('mobileSortTitle') || 'Sort'}</span>
          <button
            type="button"
            onClick={() => setMobileSortOpen(false)}
            aria-label={t('mobileCloseSort') || 'Close sort'}
            data-testid="catalog-mobile-sort-close"
          >
            <svg viewBox="0 0 16 16" width="16" height="16" fill="none" aria-hidden="true">
              <path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        <div className={styles.mobileSortList}>
          {SORT_OPTIONS.map((opt, idx) => {
            const prev = SORT_OPTIONS[idx - 1];
            const isSelected = sort === opt.key;
            const showDivider = prev && prev.group !== opt.group;
            return (
              <React.Fragment key={opt.key}>
                {showDivider && <hr className={styles.mobileSortDivider} aria-hidden="true" />}
                <button
                  type="button"
                  className={styles.mobileSortOption}
                  data-active={isSelected ? 'true' : 'false'}
                  onClick={() => { setSort(opt.key); setPage(1); setMobileSortOpen(false); }}
                  data-testid={`catalog-mobile-sort-${opt.key}`}
                >
                  <span className={`${styles.mobileSortCheck} ${isSelected ? '' : styles.mobileSortCheckHidden}`} aria-hidden="true">
                    {isSelected && (
                      <svg viewBox="0 0 12 12" width="12" height="12" fill="none">
                        <path d="M2 6.5L4.8 9 10 3.2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </span>
                  <span>{t(opt.tKey) || opt.label}</span>
                </button>
              </React.Fragment>
            );
          })}
        </div>
      </div>
    </div>
  );
}
