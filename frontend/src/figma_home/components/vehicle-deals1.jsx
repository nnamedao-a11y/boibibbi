/**
 * VehicleDeals1 — header for the "Top vehicles deals of the week".
 *
 * Pixel-aligned to the Figma reference shared by the user
 * (Figma → Dev Mode inspection):
 *
 *   ┌──────────────────────────── full width ────────────────────────┐
 *   │                                                                  │
 *   │                        TOP VEHICLES DEALS                       │  ← centered
 *   │                                                                  │     (gap-28
 *   │                            OF THE WEEK                          │      between lines)
 *   │                                                                  │
 *   │                                                                  │  ← big gap
 *   │                                                                  │
 *   │                                ⌜ THOUSANDS OF LISTINGS.  ⌝     │
 *   │                                │ ONLY THE BEST MAKE THE   │     │  ← right-edge,
 *   │                                │ UPDATED WEEKLY           │     │     aligned with
 *   │                                ⌞                          ⌟     │     card grid
 *   └──────────────────────────────────────────────────────────────────┘
 *
 * Brackets: 3 px stroke, color **#555452** (Figma Vector layer),
 * 13 × 76 px native size; vertically stretched to wrap the tagline.
 */
import { useLang } from "../../i18n";
import AnimatedHeading from "../../components/AnimatedHeading";
import useInView from "../../components/useInView";
import styles from "./vehicle-deals1.module.css";

const Bracket = ({ side = "left" }) => (
  <svg
    className={side === "left" ? styles.bracket : styles.bracketRight}
    viewBox="0 0 17 80"
    preserveAspectRatio="none"
    aria-hidden="true"
    focusable="false"
  >
    {/* "[" path — short top, long vertical, short bottom (Figma Vector.svg). */}
    <path
      d="M14.5264 1.5H1.5V77.5264H14.5264"
      stroke="#555452"
      strokeWidth="3"
      strokeLinecap="square"
      fill="none"
      vectorEffect="non-scaling-stroke"
    />
  </svg>
);

const T = {
  en: {
    titleOrange: "Top vehicles deals",
    titleWhite: "of the week",
    line1: "Thousands of listings.",
    line2: "Only the best make the cut.",
    line3: "Updated weekly",
  },
  bg: {
    titleOrange: "Топ автомобилни оферти",
    titleWhite: "на седмицата",
    line1: "Хиляди обяви.",
    line2: "Само най-добрите преминават.",
    line3: "Актуализирано седмично",
  },
};

const VehicleDeals1 = ({ className = "" }) => {
  const { lang } = useLang();
  const t = lang === "bg" ? T.bg : T.en;
  /* Match the hero motion language — the tagline lines (THOUSANDS /
   * ONLY THE BEST / UPDATED WEEKLY) cascade in left-to-right via the
   * site-wide `data-stagger` reveal pattern as soon as the bracketed
   * block scrolls into view. */
  const [taglineRef, taglineInView] = useInView();
  /* Delay the tagline reveal until the title's per-char wave has had
   * time to finish — keeps the visual hierarchy clean. The title is
   * ~ "Top vehicles deals" + "of the week" ≈ 28 non-space chars × 28ms
   * step + 900ms duration ≈ 1.6s. We start the tagline cascade a bit
   * earlier so it feels connected, not detached. */
  const titleChars =
    (t.titleOrange?.replace(/\s/g, "").length || 0) +
    (t.titleWhite?.replace(/\s/g, "").length || 0);
  const taglineBaseDelay = titleChars * 28 + 200; // ms
  return (
    <section className={[styles.vehicleDeals, className].join(" ")}>
      {/* Centered title — both lines stacked with a tight 28 px gap.
          Both lines share the same scroll-trigger via AnimatedHeading;
          line 2's baseDelay continues the per-char cascade from line 1
          (≈ length-of-line-1 chars * 28 ms step) so the diagonal wave
          flows smoothly across both lines. */}
      <div className={styles.titleBlock}>
        <AnimatedHeading as="h2" className={styles.titleOrange} text={t.titleOrange} />
        <AnimatedHeading
          as="h2"
          className={styles.titleWhite}
          text={t.titleWhite}
          baseDelay={(t.titleOrange?.replace(/\s/g, "").length || 0) * 28}
        />
      </div>

      {/* Bracketed tagline — right-aligned with the cards grid below.
          Lines fade-up in sequence via the site-wide stagger pattern,
          baseDelay scheduled to start after the title wave. */}
      <div
        ref={taglineRef}
        className={[styles.taglineWrap, taglineInView ? "is-visible" : ""].join(" ")}
      >
        <div className={styles.tagline}>
          <Bracket side="left" />
          <p
            className={styles.taglineText}
            data-stagger="80"
            style={{ "--stagger-step": "140ms", animationDelay: `${taglineBaseDelay}ms` }}
          >
            <span
              className={`${styles.taglineLine} ${styles.taglineLine1}`}
              style={{ animationDelay: `${taglineBaseDelay}ms` }}
            >
              {t.line1}
            </span>
            <span
              className={`${styles.taglineLine} ${styles.taglineLine2}`}
              style={{ animationDelay: `${taglineBaseDelay + 140}ms` }}
            >
              {t.line2}
            </span>
            <span
              className={`${styles.taglineLine} ${styles.taglineLine3}`}
              style={{ animationDelay: `${taglineBaseDelay + 280}ms` }}
            >
              {t.line3}
            </span>
          </p>
          <Bracket side="right" />
        </div>
      </div>
    </section>
  );
};

export default VehicleDeals1;
