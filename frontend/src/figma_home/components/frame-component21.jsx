/**
 * FrameComponent21 — "Top vehicles deals of the week" curated wishlist.
 *
 * Re-engineered (May 2026): the block no longer paginates the FULL
 * `/api/public/vehicles` catalogue. Instead it surfaces a manager-
 * curated, team-lead-approved weekly wishlist read from
 * `/api/public/wishlist-deals?category=…&budget=…&week=current`.
 *
 * Props:
 *   - `category`   — one of motorbike|sedan|suv|pickup|van (from FrameComponent20)
 *   - `budget`     — one of 10-15K|15-25K|30-50K        (from FrameComponent20)
 *   - `onCount`    — optional callback fired with the live count so the
 *                    filter row's "proposals" counter can mirror it.
 *
 * "MORE VEHICLES +" no longer paginates within the section — it links to
 * the full /catalog page so users can browse beyond the curated set.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import { Link } from "react-router-dom";
import Card1 from "./card1";
import { userEngagementApi } from "../../lib/api";
import { useTiltParallax } from "../../components/useTiltParallax";
import useInView from "../../components/useInView";
import { useLang } from "../../i18n";
import styles from "./frame-component21.module.css";

const API = process.env.REACT_APP_BACKEND_URL || "";

const PLACEHOLDER_IMGS = [
  "/figma/image-15@2x.webp",
  "/figma/image-151@2x.webp",
  "/figma/image-152@2x.webp",
  "/figma/image-153@2x.webp",
  "/figma/image-154@2x.webp",
  "/figma/image-155@2x.webp",
];

/**
 * Adapt a wishlist row (with cached `snapshot`) into the shape Card1
 * expects. Card1 reads top-level fields like vin/title/year/make/model
 * /current_bid/images so we flatten the snapshot up to the root.
 */
function wishlistToCard(item) {
  const s = item?.snapshot || {};
  return {
    vin: item.vin,
    id: item.id,
    title: s.title,
    make: s.make,
    model: s.model,
    year: s.year,
    current_bid: s.current_bid,
    odometer: s.odometer,
    odometer_unit: s.odometer_unit,
    images: s.image ? [s.image] : [],
    detail_url: s.detail_url,
    auction_name: s.auction_name,
    sale_date: s.sale_date,
    lot_number: s.lot_number,
    // pass-through so the card knows this is a curated deal
    wishlist: {
      category: item.category,
      budget: item.budget,
      week_start: item.week_start,
      note: item.note,
    },
  };
}

const FrameComponent21 = ({ className = "", category, budget, onCount }) => {
  const { lang } = useLang();
  const isBg = lang === "bg";

  // Selection sets propagated to Card1
  const [favSet, setFavSet] = useState(new Set());
  const [cmpSet, setCmpSet] = useState(new Set());
  const [cmpCount, setCmpCount] = useState(0);

  // Pull current-week approved curated cards filtered by the selected
  // category + budget (or all if filters not supplied).
  const dealsQ = useQuery({
    queryKey: ["public/wishlist-deals", { category, budget }],
    queryFn: async ({ signal }) => {
      const params = { week: "current", limit: 60 };
      if (category) params.category = category;
      if (budget) params.budget = budget;
      const { data } = await axios.get(`${API}/api/public/wishlist-deals`, {
        params, signal, timeout: 15000,
      });
      const list = Array.isArray(data?.data) ? data.data : [];
      return { items: list.map(wishlistToCard), raw: list };
    },
    placeholderData: (prev) => prev,
    staleTime: 60_000,
  });

  const items = dealsQ.data?.items || [];
  const loadingMore = dealsQ.isFetching;
  const total = items.length;

  // Tell the parent (FrameComponent20) the live count so its
  // "PROPOSALS - n" counter matches what's actually rendered.
  useEffect(() => {
    if (typeof onCount === "function") onCount(total);
  }, [total, onCount]);

  /* ── Load favorites + compare once (silent on guest) ─────────────── */
  const loadEngagement = useCallback(async () => {
    try {
      const favs = await userEngagementApi.favorites.getMine();
      if (Array.isArray(favs)) {
        setFavSet(new Set(favs.map((f) => (f.vin || f.vehicleId || "").toUpperCase()).filter(Boolean)));
      }
    } catch {/* unauth or API down → leave empty */}
    try {
      const cmp = await userEngagementApi.compare.getMine();
      const list = Array.isArray(cmp) ? cmp : (cmp?.items || []);
      const ids = list.map((c) => (c.vin || c.vehicleId || "").toUpperCase()).filter(Boolean);
      setCmpSet(new Set(ids));
      setCmpCount(ids.length);
    } catch {/* leave empty */}
  }, []);

  useEffect(() => { loadEngagement(); }, [loadEngagement]);

  /* ── Optimistic toggles propagated from Card1 ─────────────────────── */
  const handleToggleFavorite = useCallback((vin, next) => {
    if (!vin) return;
    const v = vin.toUpperCase();
    setFavSet((prev) => {
      const ns = new Set(prev);
      if (next) ns.add(v); else ns.delete(v);
      return ns;
    });
  }, []);

  const handleToggleCompare = useCallback((vin, next) => {
    if (!vin) return;
    const v = vin.toUpperCase();
    setCmpSet((prev) => {
      const ns = new Set(prev);
      if (next) ns.add(v); else ns.delete(v);
      return ns;
    });
    setCmpCount((c) => Math.max(0, c + (next ? 1 : -1)));
  }, []);

  /* ── Build rows ───────────────────────────────────────────────────── */
  const live = items.length > 0 ? items : null;
  // Show placeholder skeletons ONLY while a request is in flight.
  // Once the request settles and there are 0 curated picks for the
  // selected (category, budget) combo, we hide the placeholders and
  // render the empty-state block instead.
  const isInitialLoading = dealsQ.isLoading || (dealsQ.isFetching && !dealsQ.data);
  const showPlaceholders = !live && isInitialLoading;
  const visibleCount = live ? live.length : (showPlaceholders ? 6 : 0);
  const rows = useMemo(() => {
    const out = [];
    if (live) {
      for (let i = 0; i < live.length; i += 3) out.push(live.slice(i, i + 3));
    } else if (showPlaceholders) {
      out.push([0, 1, 2]);
      out.push([3, 4, 5]);
    }
    return out;
  }, [live, showPlaceholders]);

  // Reusable BIBI tilt-parallax for the car cards.
  const blockRef = useRef(null);
  useTiltParallax(blockRef, {
    cardsSelector: `:scope .${styles.carBlock}`,
    skipEntry: true,
    deps: [live],
  });

  // Viewport observer for the section.
  const [sectionRef, inView] = useInView();
  const prevCountRef = useRef(6);
  const prevCount = prevCountRef.current;
  prevCountRef.current = visibleCount;

  // Empty state when filter combo has no curated cards yet.
  const isEmpty = !isInitialLoading && items.length === 0;

  // Compose the catalog query string so "More vehicles +" preserves the
  // user's current filter selection when jumping to the full catalog.
  // CatalogPage parses `vehicle_type`, `price_min`, `price_max` from the
  // URL on mount (see DEFAULT_FILTERS in CatalogPage.jsx), so we map the
  // wishlist filter shape into the catalogue's URL contract.
  const catalogHref = useMemo(() => {
    const qs = new URLSearchParams();
    if (category) qs.set("vehicle_type", category);
    if (budget) {
      const m = /^(\d+)\s*-\s*(\d+)K$/i.exec(String(budget));
      if (m) {
        qs.set("price_min", String(Number(m[1]) * 1000));
        qs.set("price_max", String(Number(m[2]) * 1000));
      }
    }
    const tail = qs.toString();
    return tail ? `/catalog?${tail}` : "/catalog";
  }, [category, budget]);

  return (
    <div ref={sectionRef} className={[styles.cardsBlockWrapper, className, inView ? "is-visible" : ""].join(" ")}>
      <div ref={blockRef} className={`${styles.cardsBlock} tilt-scope`}>
        {rows.map((row, ri) => (
          <div className={styles.cardsParent} key={`row-${ri}`}>
            {row.map((cell, ci) => {
              const cardIdx = ri * 3 + ci;
              const isFresh = cardIdx >= prevCount;
              const delayIdx = isFresh ? (cardIdx - prevCount) : (cardIdx % 6);
              const animStyle = { animationDelay: `${delayIdx * 140}ms` };
              if (live) {
                const v = cell;
                return (
                  <section
                    className={`${styles.carBlock} reveal reveal--fade-up`}
                    style={animStyle}
                    key={v.vin || v.id || `${ri}-${ci}`}
                    data-testid={`top-deals-card-${v.vin || v.id}`}
                  >
                    <Card1
                      data={v}
                      favoriteSet={favSet}
                      compareSet={cmpSet}
                      compareCount={cmpCount}
                      onToggleFavoriteLocal={handleToggleFavorite}
                      onToggleCompareLocal={handleToggleCompare}
                    />
                  </section>
                );
              }
              const idx = typeof cell === "number" ? cell : cardIdx;
              return (
                <section
                  className={`${styles.carBlock} reveal reveal--fade-up`}
                  style={animStyle}
                  key={`ph-${idx}`}
                >
                  <Card1 image15={PLACEHOLDER_IMGS[idx % PLACEHOLDER_IMGS.length]} />
                </section>
              );
            })}
          </div>
        ))}

        {/* Empty state when no curated cards match the current filters */}
        {isEmpty && (
          <div
            data-testid="top-deals-empty"
            style={{
              padding: "40px 24px",
              textAlign: "center",
              color: "rgba(255,255,255,0.75)",
              fontFamily: "var(--font-mazzard)",
            }}
          >
            <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>
              {isBg
                ? "Все още няма селекция за тази седмица"
                : "No curated picks for this combo yet"}
            </div>
            <div style={{ fontSize: 14, opacity: 0.75, marginBottom: 18, maxWidth: 520, margin: "0 auto 18px" }}>
              {isBg
                ? "Изберете друг бюджет или категория, или прегледайте целия каталог."
                : "Pick another category or budget — or browse the full catalog below."}
            </div>
          </div>
        )}

        {/* "MORE WISH LIST" → jumps to the full catalog (preserves filters as query params). */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "32px 0 0", gap: 6 }}>
          <Link
            to={catalogHref}
            data-testid="top-deals-more-link"
            style={{
              background: "transparent", border: 0, color: "#FEAE00",
              fontFamily: "var(--font-mazzard)", fontSize: 18, fontWeight: 500,
              letterSpacing: "0.06em", textTransform: "uppercase",
              textDecoration: "underline", cursor: loadingMore ? "wait" : "pointer", padding: "8px 12px",
              opacity: loadingMore ? 0.5 : 1,
            }}
          >
            {loadingMore
              ? (isBg ? "зареждам…" : "loading…")
              : (isBg ? "още автомобили +" : "more vehicles +")}
          </Link>
          {total > 0 && (
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", letterSpacing: "0.04em" }}>
              {isBg
                ? `${total} селекции за тази седмица`
                : `${total} curated pick${total === 1 ? "" : "s"} this week`}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default FrameComponent21;
