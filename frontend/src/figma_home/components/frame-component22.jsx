import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import VinSearchDropdown from "../../components/public/VinSearchDropdown";
import AnimatedHeading from "../../components/AnimatedHeading";
import useInView from "../../components/useInView";
import { useLang } from "../../i18n";
import styles from "./frame-component22.module.css";

/**
 * "Calculate a car yourself" welcome-page block.
 *
 * The VIN/lot search input now has a typeahead dropdown identical to the one
 * in the public header: as the user types ≥ 2 chars, we hit
 * `/api/public/search/suggest` (BidMotors live + stale fallback) and render
 * mini-cards. Clicking any card navigates straight to /cars/<VIN> — the
 * canonical SingleCarPage. Submitting the form without picking a suggestion
 * falls back to /vin/<query> for the full lookup chain. Empty input still
 * routes to /calculator as before.
 */
const FrameComponent22 = ({ className = "" }) => {
  const navigate = useNavigate();
  const { lang } = useLang();
  const isBg = lang === "bg";
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);

  const T = isBg
    ? {
        line1: "Изчислете автомобила сами",
        line2: "с гарантирана цена",
        fromUsaKorea: "От САЩ и Корея",
        searchPlaceholder: "Търсене по VIN или лот номер",
        searchAria: "Търсене по VIN или лот номер",
        calculate: "ИЗЧИСЛИ",
        allCatalog: "целият каталог +",
        truckAlt: "Ford пикап",
      }
    : {
        line1: "Calculate a car yourself",
        line2: "with a price guarantee",
        fromUsaKorea: "From the USA and Korea",
        searchPlaceholder: "Search by VIN or lot number",
        searchAria: "Search by VIN or lot number",
        calculate: "CALCULATE",
        allCatalog: "all catalog +",
        truckAlt: "Ford pickup truck",
      };

  const handleSubmit = (e) => {
    e.preventDefault();
    const v = q.trim();
    if (!v) {
      navigate("/calculator");
      return;
    }
    const clean = v.toUpperCase().replace(/[\s-]/g, "");
    setOpen(false);
    navigate(`/vin/${encodeURIComponent(clean)}`);
  };

  const [gridRef, gridInView] = useInView();

  return (
    <section className={[styles.rectangleParent, className].join(" ")}>
      <div className={styles.calculate}>
        {/* Two-line title — both lines animate with a continuous left→right
            character cascade. Line 2 starts after Line 1's last char + a tiny
            extra delay so the diagonal wave never visually "resets". */}
        <h2 className={styles.calculateACar}>
          <AnimatedHeading
            as="span"
            className={styles.calculateLine1}
            text={T.line1}
          />
          <AnimatedHeading
            as="span"
            className={styles.withAPrice}
            text={T.line2}
            baseDelay={T.line1.replace(/\s/g, "").length * 28}
          />
        </h2>

        <div
          ref={gridRef}
          className={`${styles.calcGrid} ${gridInView ? "is-visible" : ""}`}
        >
          <div className={`${styles.imageBox} reveal reveal--fade-up`} style={{ animationDelay: "0ms" }}>
            <img
              className={styles.image93Icon}
              loading="lazy"
              alt={T.truckAlt}
              src="/figma/image-93@2x.webp"
            />
          </div>

          <div
            className={styles.calcRight}
            data-stagger="80"
            style={{ "--stagger-step": "140ms" }}
          >
            <h3 className={styles.fromTheUsaContainer}>
              {T.fromUsaKorea}
            </h3>

            <form
              className={styles.searchForm}
              onSubmit={handleSubmit}
              role="search"
              data-testid="welcome-vin-search"
            >
              <div className={styles.inputWrapper} style={{ position: "relative" }}>
                <img
                  className={styles.boxiconssearch}
                  alt=""
                  src="/figma/boxicons-search.svg"
                />
                <input
                  className={styles.searchByVin}
                  placeholder={T.searchPlaceholder}
                  type="text"
                  value={q}
                  onChange={(e) => { setQ(e.target.value); setOpen(true); }}
                  onFocus={() => setOpen(true)}
                  autoComplete="off"
                  aria-label={T.searchAria}
                  data-testid="welcome-vin-input"
                />
                <VinSearchDropdown
                  query={q}
                  open={open}
                  onClose={() => setOpen(false)}
                  align="left"
                  variant="dark"
                />
              </div>

              <button type="submit" className={styles.calcCta}>
                {T.calculate}
              </button>
            </form>

            <Link to="/catalog" className={styles.allCatalog}>
              {T.allCatalog}
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
};

export default FrameComponent22;
