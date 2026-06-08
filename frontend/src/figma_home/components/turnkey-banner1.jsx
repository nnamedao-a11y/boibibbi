import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import axios from "axios";
import { useLang } from "../../i18n";
import AnimatedHeading from "../../components/AnimatedHeading";
import useInView from "../../components/useInView";
import styles from "./turnkey-banner1.module.css";

const API_URL = process.env.REACT_APP_BACKEND_URL || "";
const SITE_INFO_CACHE = "__bibi_site_info_promise__";

function fetchSiteInfo() {
  if (typeof window === "undefined") return Promise.resolve(null);
  if (!window[SITE_INFO_CACHE]) {
    window[SITE_INFO_CACHE] = axios
      .get(`${API_URL}/api/site-info`)
      .then((r) => r.data)
      .catch(() => null);
  }
  return window[SITE_INFO_CACHE];
}

const DEFAULT_VIBER_URL = "viber://chat?number=%2B359875313158";

const T = {
  en: {
    titleLine1: "How to buy",
    titleLine2: "a turnkey car",
    from: "from",
    usa: "the USA",
    korea: "Korea",
    step1: "We send an application",
    step2: "We discuss the details",
    step3: "We look for a car",
    step4a: "We buy and deliver to",
    step4b: "a European port",
    step5a: "We clear customs and",
    step5b: "deliver the car to Bulgaria",
    pickUp: "PICK UP A CAR",
    joinLine1: "Join our group and",
    joinLine2: "get the hottest offers",
  },
  bg: {
    titleLine1: "Как да купите",
    titleLine2: "автомобил до ключ",
    from: "от",
    usa: "САЩ",
    korea: "Корея",
    step1: "Изпращаме заявка",
    step2: "Обсъждаме детайлите",
    step3: "Търсим автомобил",
    step4a: "Купуваме и доставяме до",
    step4b: "европейско пристанище",
    step5a: "Извършваме митническо",
    step5b: "оформяне и доставка до България",
    pickUp: "ИЗБЕРИ АВТОМОБИЛ",
    joinLine1: "Присъединете се към нашата група",
    joinLine2: "и получете най-горещите оферти",
  },
};

/**
 * "How to buy a turnkey car" — pixel-perfect Figma rebuild.
 *
 *   Background : aerial road photo (image-57@2x, 1918 × 2379)
 *   Layout     : every element is absolutely positioned over the photo
 *                so the title sits over the car's trunk, the USA / Korea
 *                labels flank the car body, the partner logos sit below
 *                the car on the road, the steps are arranged in a
 *                zig-zag in the lower half, and the CTA + Viber pill are
 *                at the very bottom under the linear-gradient fade.
 *
 *   Sizes (Figma):
 *     PICK UP A CAR  → 380 × 45
 *     Join card      → 394 × 118  (clickable → Viber URL from admin)
 */
const TurnkeyBanner1 = ({ className = "" }) => {
  const [viberUrl, setViberUrl] = useState(DEFAULT_VIBER_URL);
  const { lang } = useLang();
  const t = lang === "bg" ? T.bg : T.en;

  useEffect(() => {
    let cancelled = false;
    fetchSiteInfo().then((info) => {
      if (cancelled || !info) return;
      const url = info?.footer?.viber_community?.url;
      if (url && typeof url === "string") setViberUrl(url);
    });
    return () => { cancelled = true; };
  }, []);

  // ── Staggered reveal for the 5 zig-zag steps ──────────────────────────
  // Per Figma & user request:
  //   step 1 → slides in from LEFT
  //   step 2 → slides in from RIGHT
  //   step 3 → slides in from LEFT
  //   step 4 → slides in from RIGHT
  //   step 5 → slides in from BELOW (center)
  // The whole sequence is triggered when the zig-zag block scrolls into
  // view, so the steps appear one after another like a numbered timeline.
  const [stepsRef, stepsInView] = useInView({ threshold: 0.18 });
  const stepRevealClass = stepsInView ? styles.stepInView : "";

  return (
    <section className={[styles.section, className].join(" ")}>
      {/* Aerial road background — full-bleed, native orientation */}
      <img
        className={styles.bgRoad}
        src="/figma/image-57@2x.webp"
        alt=""
        aria-hidden="true"
      />
      <div className={styles.bgTop}    aria-hidden="true" />
      <div className={styles.bgScrim}  aria-hidden="true" />

      <div className={styles.inner}>
        {/* ── Title ─────────────────────────────────────────────────── */}
        <h1 className={styles.title}>
          <AnimatedHeading as="span" text={t.titleLine1} />
          <AnimatedHeading
            as="span"
            text={t.titleLine2}
            baseDelay={t.titleLine1.replace(/\s/g, "").length * 28}
          />
        </h1>

        {/* ── USA · Korea source labels ─────────────────────────────── */}
        <div className={[styles.source, styles.sourceUSA].join(" ")}>
          <span className={styles.sourceFrom}>{t.from}</span>
          <div className={styles.sourceRow}>
            <span className={styles.dot} />
            <span className={styles.sourceName}>{t.usa}</span>
          </div>
        </div>

        <div className={[styles.source, styles.sourceKorea].join(" ")}>
          <span className={styles.sourceFrom}>{t.from}</span>
          <div className={styles.sourceRow}>
            <span className={styles.dot} />
            <span className={styles.sourceName}>{t.korea}</span>
          </div>
        </div>

        {/* ── Partner logos ─────────────────────────────────────────────
            Now using transparent SVG logos (same assets that the mobile
            home page uses). Previously the .webp screenshots had baked-in
            white backgrounds which clashed with the dark turnkey banner.
            The SVGs are background-less, so on the dark fabric texture
            they sit cleanly without any boxed-in look. */}
        <div className={styles.logos}>
          <div className={styles.logosRow}>
            <img
              src="/figma/copart-logo.svg"
              alt="Copart"
              className={styles.logoCopart}
            />
            <img
              src="/figma/carfax-logo.svg"
              alt="CARFAX"
              className={styles.logoCarfax}
            />
            <img
              src="/figma/manheim-logo.svg"
              alt="Manheim"
              className={styles.logoManheim}
            />
          </div>
          <div className={styles.logosRow}>
            <img
              src="/figma/iaai-logo.svg"
              alt="IAA — Insurance Auto Auctions"
              className={styles.logoIaa}
            />
            <img
              src="/figma/encar-logo.svg"
              alt="Encar"
              className={styles.logoEncar}
            />
          </div>
        </div>

        {/* ── Steps (1-5) zig-zag — directional reveal ─────────────────
            Reveal sequence (per Figma + user spec):
              step 1 ←  from LEFT
              step 2 →  from RIGHT
              step 3 ←  from LEFT
              step 4 →  from RIGHT
              step 5 ↑  from BELOW (center)
            All five share the same `useInView` trigger anchored on
            step 1, so as soon as the zig-zag enters the viewport the
            cascade plays one-by-one with 180 ms steps. */}
        <div
          ref={stepsRef}
          className={[styles.step, styles.step1, stepRevealClass].join(" ")}
        >
          <span className={styles.stepNum}>1/</span>
          <p className={styles.stepText}>{t.step1}</p>
        </div>

        <div className={[styles.step, styles.step2, stepRevealClass].join(" ")}>
          <span className={styles.stepNum}>2/</span>
          <p className={styles.stepText}>{t.step2}</p>
        </div>

        <div className={[styles.step, styles.step3, stepRevealClass].join(" ")}>
          <span className={styles.stepNum}>3/</span>
          <p className={styles.stepText}>{t.step3}</p>
        </div>

        <div className={[styles.step, styles.step4, stepRevealClass].join(" ")}>
          <span className={styles.stepNum}>4/</span>
          <p className={styles.stepText}>
            {t.step4a}
            <br />{t.step4b}
          </p>
        </div>

        <div className={[styles.step, styles.step5, stepRevealClass].join(" ")}>
          <span className={styles.stepNum}>5/</span>
          <p className={styles.stepText}>
            {t.step5a}
            <br />{t.step5b}
          </p>
        </div>

        {/* ── PICK UP A CAR button ──────────────────────────────────── */}
        <Link to="/calculator" className={styles.pickup}>
          {t.pickUp}
        </Link>

        {/* ── Join our group / Viber pill ───────────────────────────── */}
        <a
          href={viberUrl}
          className={styles.joinCard}
          target="_blank"
          rel="noopener noreferrer"
          data-testid="turnkey-join-viber"
        >
          <span className={styles.joinText}>
            {t.joinLine1}
            <br />
            {t.joinLine2}
          </span>
          <img
            className={styles.joinIcon}
            src="/figma/basil-viber-outline.svg"
            alt=""
            aria-hidden="true"
          />
        </a>
      </div>
    </section>
  );
};

export default TurnkeyBanner1;
