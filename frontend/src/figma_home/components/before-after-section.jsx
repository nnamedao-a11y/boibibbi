import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import axios from "axios";
import AnimatedHeading from "../../components/AnimatedHeading";
import { useLang } from "../../i18n";
import styles from "./before-after-section.module.css";

/**
 * BeforeAfterSection — admin-managed "BEFORE AND AFTER" carousel.
 *
 * Each card is fully driven by `before_after` payload from `/api/site-info`
 * and editable in Admin → Info → Content → Before / After.
 */

const API_URL = process.env.REACT_APP_BACKEND_URL || "";

const FALLBACK_CFG = {
  enabled: true,
  title_en: "Before and after",
  title_bg: "Преди и след",
  subtitle_yellow_en: "Our clients receive",
  subtitle_yellow_bg: "Нашите клиенти получават",
  subtitle_white_en: "the best service",
  subtitle_white_bg: "най-добрата услуга",
  items: [
    {
      id: "fallback-1",
      enabled: true,
      model: "BMW 328",
      order_date: "12.12.2025",
      finished_date: "12.04.2026",
      price: "6,500 EURO",
      before_image_url: "/figma/DT-Klausen-LS-135-12@2x.webp",
      after_image_url: "/figma/DT-Klausen-LS-135-22@2x.webp",
    },
    {
      id: "fallback-2",
      enabled: true,
      model: "Audi Q5",
      order_date: "03.03.2026",
      finished_date: "11.06.2026",
      price: "12,900 EURO",
      before_image_url: "/figma/DT-Klausen-LS-135-12@2x.webp",
      after_image_url: "/figma/DT-Klausen-LS-135-22@2x.webp",
    },
    {
      id: "fallback-3",
      enabled: true,
      model: "Mercedes-Benz GLC",
      order_date: "18.01.2026",
      finished_date: "22.05.2026",
      price: "18,400 EURO",
      before_image_url: "/figma/DT-Klausen-LS-135-12@2x.webp",
      after_image_url: "/figma/DT-Klausen-LS-135-22@2x.webp",
    },
    {
      id: "fallback-4",
      enabled: true,
      model: "Toyota Camry",
      order_date: "07.02.2026",
      finished_date: "30.05.2026",
      price: "9,200 EURO",
      before_image_url: "/figma/DT-Klausen-LS-135-12@2x.webp",
      after_image_url: "/figma/DT-Klausen-LS-135-22@2x.webp",
    },
    {
      id: "fallback-5",
      enabled: true,
      model: "Jeep Grand Cherokee",
      order_date: "25.10.2025",
      finished_date: "08.03.2026",
      price: "15,750 EURO",
      before_image_url: "/figma/DT-Klausen-LS-135-12@2x.webp",
      after_image_url: "/figma/DT-Klausen-LS-135-22@2x.webp",
    },
    {
      id: "fallback-6",
      enabled: true,
      model: "Hyundai Sonata",
      order_date: "14.04.2026",
      finished_date: "20.07.2026",
      price: "8,300 EURO",
      before_image_url: "/figma/DT-Klausen-LS-135-12@2x.webp",
      after_image_url: "/figma/DT-Klausen-LS-135-22@2x.webp",
    },
    {
      id: "fallback-7",
      enabled: true,
      model: "Volkswagen Tiguan",
      order_date: "02.11.2025",
      finished_date: "19.02.2026",
      price: "11,200 EURO",
      before_image_url: "/figma/DT-Klausen-LS-135-12@2x.webp",
      after_image_url: "/figma/DT-Klausen-LS-135-22@2x.webp",
    },
    {
      id: "fallback-8",
      enabled: true,
      model: "Ford Explorer",
      order_date: "21.05.2026",
      finished_date: "30.08.2026",
      price: "16,800 EURO",
      before_image_url: "/figma/DT-Klausen-LS-135-12@2x.webp",
      after_image_url: "/figma/DT-Klausen-LS-135-22@2x.webp",
    },
    {
      id: "fallback-9",
      enabled: true,
      model: "Honda CR-V",
      order_date: "09.09.2025",
      finished_date: "12.01.2026",
      price: "10,450 EURO",
      before_image_url: "/figma/DT-Klausen-LS-135-12@2x.webp",
      after_image_url: "/figma/DT-Klausen-LS-135-22@2x.webp",
    },
    {
      id: "fallback-10",
      enabled: true,
      model: "Kia Sportage",
      order_date: "30.06.2026",
      finished_date: "15.09.2026",
      price: "9,900 EURO",
      before_image_url: "/figma/DT-Klausen-LS-135-12@2x.webp",
      after_image_url: "/figma/DT-Klausen-LS-135-22@2x.webp",
    },
    {
      id: "fallback-11",
      enabled: true,
      model: "Mazda CX-5",
      order_date: "11.08.2025",
      finished_date: "04.12.2025",
      price: "13,650 EURO",
      before_image_url: "/figma/DT-Klausen-LS-135-12@2x.webp",
      after_image_url: "/figma/DT-Klausen-LS-135-22@2x.webp",
    },
  ],
};

function fullMediaUrl(u) {
  if (!u) return "";
  if (/^https?:\/\//i.test(u)) return u;
  if (u.startsWith("/figma/")) return u; // public asset, served by frontend
  return `${API_URL}${u}`;
}

function getActiveLang() {
  // kept for backwards-compat — not used (replaced by useLang() context).
  if (typeof window === "undefined") return "en";
  const docLang = (document?.documentElement?.lang || "").toLowerCase();
  if (docLang.startsWith("bg")) return "bg";
  return "en";
}

const BeforeAfterSection = () => {
  const trackRef = useRef(null);
  const [activeIdx, setActiveIdx] = useState(0);
  const [cfg, setCfg] = useState(FALLBACK_CFG);
  const { lang: ctxLang } = useLang();
  const lang = ctxLang === "bg" ? "bg" : "en";

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await axios.get(`${API_URL}/api/site-info`);
        if (cancelled) return;
        const ba = r?.data?.before_after;
        if (ba && typeof ba === "object") {
          setCfg({
            ...FALLBACK_CFG,
            ...ba,
            items: Array.isArray(ba.items) ? ba.items : [],
          });
        }
      } catch {
        /* keep fallback */
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    /* lang updates flow through useLang() context — no manual listeners needed */
  }, []);

  const visibleCards = useMemo(
    () => (cfg.items || []).filter((c) => c && c.enabled !== false),
    [cfg.items],
  );

  // Compute step (layout width + gap) using offsetWidth so the calculation
  // is INDEPENDENT of any CSS transform: scale() applied to inactive cards.
  const getStep = useCallback(() => {
    const el = trackRef.current;
    if (!el) return 0;
    const card = el.querySelector(`.${styles.card}`);
    if (!card) return 0;
    const cs = window.getComputedStyle(el);
    const gap = parseFloat(cs.columnGap || cs.gap || "0") || 0;
    return card.offsetWidth + gap;
  }, []);

  const handleScroll = useCallback(() => {
    const el = trackRef.current;
    if (!el) return;
    const step = getStep();
    if (!step) return;
    const idx = Math.round(el.scrollLeft / step);
    setActiveIdx(Math.max(0, Math.min(visibleCards.length - 1, idx)));
  }, [visibleCards.length, getStep]);

  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    el.addEventListener("scroll", handleScroll, { passive: true });
    return () => el.removeEventListener("scroll", handleScroll);
  }, [handleScroll]);

  useEffect(() => {
    setActiveIdx(0);
    if (trackRef.current) trackRef.current.scrollTo({ left: 0 });
  }, [visibleCards.length]);

  const scrollToIdx = (i) => {
    const el = trackRef.current;
    if (!el) return;
    const step = getStep();
    if (!step) return;
    el.scrollTo({ left: step * i, behavior: "smooth" });
    setActiveIdx(Math.max(0, Math.min(visibleCards.length - 1, i)));
  };

  // Cyclic navigation — wraps around so user can keep scrolling endlessly.
  const prev = () => {
    if (visibleCards.length === 0) return;
    const target = activeIdx === 0 ? visibleCards.length - 1 : activeIdx - 1;
    scrollToIdx(target);
  };
  const next = () => {
    if (visibleCards.length === 0) return;
    const target = activeIdx === visibleCards.length - 1 ? 0 : activeIdx + 1;
    scrollToIdx(target);
  };

  if (cfg.enabled === false) return null;

  const title =
    lang === "bg" ? cfg.title_bg || cfg.title_en : cfg.title_en || cfg.title_bg;
  const subYellow =
    lang === "bg"
      ? cfg.subtitle_yellow_bg || cfg.subtitle_yellow_en
      : cfg.subtitle_yellow_en || cfg.subtitle_yellow_bg;
  const subWhite =
    lang === "bg"
      ? cfg.subtitle_white_bg || cfg.subtitle_white_en
      : cfg.subtitle_white_en || cfg.subtitle_white_bg;

  return (
    <section className={styles.section} data-testid="before-after-section">
      <AnimatedHeading as="h2" className={styles.title} text={title} />

      <div className={styles.bracketRow}>
        <img className={styles.bracketLeft} src="/figma/Vector.svg" width={13} height={76} alt="" />
        <h3 className={styles.subhead}>
          <span className={styles.subheadYellow}>{subYellow}</span>
          <br />
          <span className={styles.subheadWhite}>{subWhite}</span>
        </h3>
        <img className={styles.bracketRight} src="/figma/Vector.svg" width={13} height={76} alt="" />
      </div>

      {visibleCards.length === 0 ? (
        <div className={styles.empty}>{lang === "bg" ? "Все още няма карти." : "No cards yet."}</div>
      ) : (
        <>
          <div className={styles.carousel}>
            <div className={styles.track} ref={trackRef}>
              {visibleCards.map((c) => (
                <article className={styles.card} key={c.id}>
                  <div className={styles.labelsRow}>
                    <span className={styles.labelBefore}>{lang === "bg" ? "/ преди" : "/ before"}</span>
                    <span className={styles.labelAfter}>{lang === "bg" ? "/ след" : "/ after"}</span>
                  </div>

                  <div className={styles.imagesRow}>
                    <img
                      src={fullMediaUrl(c.before_image_url) || "/figma/DT-Klausen-LS-135-12@2x.webp"}
                      alt="before"
                      className={styles.cardImg}
                      loading="lazy"
                    />
                    <img
                      src={fullMediaUrl(c.after_image_url) || "/figma/DT-Klausen-LS-135-22@2x.webp"}
                      alt="after"
                      className={styles.cardImg}
                      loading="lazy"
                    />
                  </div>

                  <h3 className={styles.cardTitle}>{c.model || ""}</h3>

                  <div className={styles.cardFooter}>
                    <div className={styles.footerCell}>
                      <span className={styles.footerLabel}>{lang === "bg" ? "Дата на поръчка" : "Order date"}</span>
                      <span className={styles.footerValue}>{c.order_date || ""}</span>
                    </div>
                    <div className={styles.footerCell}>
                      <span className={styles.footerLabel}>{lang === "bg" ? "Дата на готовия автомобил" : "The date of the finished car"}</span>
                      <span className={styles.footerValue}>{c.finished_date || ""}</span>
                    </div>
                    <div className={styles.footerCell}>
                      <span className={styles.footerLabel}>{lang === "bg" ? "Цена до ключ в България" : "Turnkey price in Bulgaria"}</span>
                      <span className={styles.footerValue}>{c.price || ""}</span>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </div>

          {visibleCards.length > 1 && (
            <div className={styles.nav}>
              <button
                className={styles.navBtn}
                onClick={prev}
                aria-label="Previous"
                data-testid="ba-prev"
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path d="M9 1L3 7L9 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>

              <div className={styles.dots}>
                {visibleCards.map((_, i) => (
                  <button
                    key={i}
                    className={`${styles.dot} ${i === activeIdx ? styles.dotActive : ""}`}
                    onClick={() => scrollToIdx(i)}
                    aria-label={`Go to slide ${i + 1}`}
                    data-testid={`ba-dot-${i}`}
                  />
                ))}
              </div>

              <button
                className={styles.navBtn}
                onClick={next}
                aria-label="Next"
                data-testid="ba-next"
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path d="M5 1L11 7L5 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
};

export default BeforeAfterSection;
