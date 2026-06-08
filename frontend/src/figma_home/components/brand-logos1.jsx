/**
 * BrandLogos1 — "Search for cars from America and Korea / Most popular brands".
 *
 * • Shows the 6 most popular brands (Audi, BMW, Jeep, Toyota, Ford, Hyundai).
 *   The expanding "show more / hide" grid was removed (June 2026) — power
 *   users go to the full catalog filter via the "OTHER BRANDS +" link
 *   below the grid which jumps straight to `/catalog`.
 * • Each brand card links to the catalogue PRE-FILTERED by that make
 *   (`/catalog?make=Audi`). `CatalogPage` reads the `make` query param on
 *   first mount (see CatalogPage.jsx initialFilters) and seeds
 *   `filters.brand` so the user lands directly on, e.g., all Audi cars
 *   without having to open the filter dropdown again. The June-2026
 *   stakeholder change that stripped the query-param was reverted on
 *   user request (2026-05-25): clicking a logo MUST land on filtered
 *   results, otherwise the "popular brands" CTA loses its meaning.
 */
import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useLang } from "../../i18n";
import useInView from "../../components/useInView";
import styles from "./brand-logos1.module.css";

/* The default 6 — pinned to match the original Figma export */
const FEATURED_SLUGS = ["audi", "bmw", "jeep", "toyota", "ford", "hyundai"];

/* Brand metadata for the 6 popular cards. Logo files are self-hosted under
   /figma/brands/<slug>.webp — the catalog filter uses the slug too. */
const POPULAR_BRANDS = [
  { slug: "audi",    name: "Audi" },
  { slug: "bmw",     name: "BMW" },
  { slug: "jeep",    name: "Jeep" },
  { slug: "toyota",  name: "Toyota" },
  { slug: "ford",    name: "Ford" },
  { slug: "hyundai", name: "Hyundai" },
].map((b) => ({ ...b, src: `/figma/brands/${b.slug}.webp` }));

const BrandLogos1 = ({ className = "" }) => {
  const { lang } = useLang();
  const isBg = lang === "bg";
  const T = isBg
    ? {
        title: "Най-популярни марки",
        otherBrands: "други марки +",
        browse: (n) => `Преглед на ${n}`,
      }
    : {
        title: "most popular brands",
        otherBrands: "other brands +",
        browse: (n) => `Browse ${n}`,
      };

  /* Static, popular-only list. Memo kept for parity with previous implementation. */
  const ordered = useMemo(() => POPULAR_BRANDS, []);

  // Viewport observer for the whole brands section — flips `inView`
  // the first time the grid scrolls into view, triggering the 6-logo cascade.
  const [sectionRef, inView] = useInView();

  return (
    <section ref={sectionRef} className={[styles.brandLogos, className, inView ? "is-visible" : ""].join(" ")}>
      <div className={styles.popularBrands}>
        <div className={styles.rectangleParent}>
          <div className={styles.brandsHeader}>
            <h2 className={styles.mostPopularBrands}>{T.title}</h2>
          </div>

          {/* Brands grid — single row of 6 popular makes.
              Each item slides up + fades in with a 140 ms stagger so
              the cascade reads as STRICT left→right (matches the hero
              "FROM AUCTION TO KEYS" reveal timing). The `brandReveal`
              CSS class lives in the module so the animation only
              triggers when the section's `.is-visible` is set by
              IntersectionObserver. */}
          <div className={styles.brandsGrid}>
            {ordered.map((b, i) => (
              <Link
                // Pass proper-case make (Audi, BMW, …) — CatalogPage's
                // brand chip / API both expect canonical casing, which
                // also aligns with the case-insensitive dedup in
                // /api/public/brands (PHASE B4).
                to={`/catalog?make=${encodeURIComponent(b.name)}`}
                key={b.slug}
                className={`${styles.brandItem} ${styles.brandReveal}`}
                aria-label={T.browse(b.name)}
                data-testid={`brand-logo-${b.slug}`}
                data-row={0}
                style={{ animationDelay: `${300 + i * 140}ms` }}
              >
                <img
                  className={styles.brandLogo}
                  src={b.src}
                  alt={b.name}
                  loading="lazy"
                  decoding="async"
                  onError={(e) => {
                    e.currentTarget.style.display = "none";
                    if (e.currentTarget.nextSibling) {
                      e.currentTarget.nextSibling.style.display = "inline";
                    }
                  }}
                />
                <span className={styles.brandFallback}>{b.name}</span>
              </Link>
            ))}
          </div>
        </div>

        {/* OTHER BRANDS — links straight to the full catalog where the user
            can filter by any make. (Previously this was a show-more toggle
            that revealed the rest of the 51 brands; removed June 2026.) */}
        <div className={styles.otherBrands}>
          <Link
            to="/catalog"
            className={styles.otherBrands2}
            data-testid="brands-show-more"
          >
            {T.otherBrands}
          </Link>
        </div>
      </div>
    </section>
  );
};

export default BrandLogos1;
