import { useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { useLang } from "../../i18n";
import { useTiltParallax } from "../../components/useTiltParallax";
import AnimatedHeading from "../../components/AnimatedHeading";
import useInView from "../../components/useInView";
import styles from "./frame-component23.module.css";

const BracketLabel = ({ children, color = "var(--color-dimgray-200)", className = "" }) => (
  <span
    className={[styles.bracketLabel, className].join(" ")}
    style={{ "--bracket-color": color }}
  >
    <span className={styles.bracketChild}>{children}</span>
  </span>
);

const T = {
  en: {
    howWeWork: "How we work",
    tagLine1: "WE WORK FOR EACH CLIENT",
    tagLine2: "DEPENDING ON THE BUDGET",
    cardStandardTitle: "Standard",
    cardStandardDesc: "Sourcing, inspection, bidding, purchase, and delivery to Bulgaria.",
    cardStandardCta1: "From there, you handle",
    cardStandardCta2: "everything yourself.",
    cardTurnkeyTitle: "Turnkey",
    popular: "popular",
    cardTurnkeyDesc:
      "Full-service with zero involvement required: sourcing, inspection, purchase, delivery, adaptation, technical inspection, and registration.",
    cardTurnkeyCta1: "You simply pick up",
    cardTurnkeyCta2: "a ready-to-drive car.",
    cardSourcingTitle1: "Sourcing + Delivery",
    cardSourcingTitle2: "+ Support",
    cardSourcingDesc: "Sourcing, inspection, purchase, and delivery.",
    cardSourcingCta1: "You handle registration - we",
    cardSourcingCta2: "connect you with trusted",
    cardSourcingCta3: "service partners.",
    haveAQuestion: "Have a question?",
    contactUs: "Contact us",
  },
  bg: {
    howWeWork: "Как работим",
    tagLine1: "РАБОТИМ ЗА ВСЕКИ КЛИЕНТ",
    tagLine2: "В ЗАВИСИМОСТ ОТ БЮДЖЕТА",
    cardStandardTitle: "Стандарт",
    cardStandardDesc: "Намиране, инспекция, наддаване, покупка и доставка до България.",
    cardStandardCta1: "Оттам нататък сами",
    cardStandardCta2: "управлявате всичко.",
    cardTurnkeyTitle: "До ключ",
    popular: "популярно",
    cardTurnkeyDesc:
      "Пълно обслужване без ваше участие: намиране, инспекция, покупка, доставка, адаптация, технически преглед и регистрация.",
    cardTurnkeyCta1: "Просто получавате готов",
    cardTurnkeyCta2: "за шофиране автомобил.",
    cardSourcingTitle1: "Намиране + Доставка",
    cardSourcingTitle2: "+ Поддръжка",
    cardSourcingDesc: "Намиране, инспекция, покупка и доставка.",
    cardSourcingCta1: "Регистрацията е ваша – ние",
    cardSourcingCta2: "ви свързваме с доверени",
    cardSourcingCta3: "сервизни партньори.",
    haveAQuestion: "Имате въпрос?",
    contactUs: "Свържете се с нас",
  },
};

const FrameComponent23 = ({ className = "" }) => {
  const { lang } = useLang();
  const t = lang === "bg" ? T.bg : T.en;
  const cardsRef = useRef(null);
  // Apply the shared BIBI hover/press tilt parallax to the 3 plan cards.
  //
  // Entry animation is owned by the site-wide `data-stagger` cascade on
  // `.cardsRow` below — passing `skipEntry: true` prevents the tilt-card
  // IntersectionObserver from racing the stagger system for opacity /
  // transform (which is what was making the cards' reveal animation
  // intermittent or invisible).
  //
  // The hover behavior is also restricted to "no rotation" via the CSS
  // override `.card:global(.tilt-hover) { --tilt-tilt: 0 }` below — so
  // the cards still get a subtle lift + scale on hover (the parallax
  // zoom the user asked to keep) but they no longer wobble / rotate on
  // cursor position (the geometric tilt the user asked to remove).
  useTiltParallax(cardsRef, {
    cardsSelector: ":scope > article",
    skipEntry: true,
  });
  // ── Release the entry animation's `fill-mode: both` hold ──
  // The site-wide `bibiRevealFadeUp` animation on .cardsRow[data-stagger]
  // keeps "owning" the transform property after it finishes, which
  // blocks the CSS transition from interpolating the hover scale (the
  // browser just snaps to scale(1.06) instead of flowing into it).
  // Removing the animation declaration on `animationend` releases the
  // property back to the static CSS cascade — at which point our
  // transition: transform 560ms cubic-bezier(...) on .tilt-hover plays
  // smoothly. The visual is identical because the static CSS rest state
  // already matches the animation's end-frame (opacity:1, no offset).
  useEffect(() => {
    const node = cardsRef.current;
    if (!node) return undefined;
    const cards = node.querySelectorAll(":scope > article");
    const onEnd = (e) => {
      // Only intercept the entry reveal — leave hover/leave transitions alone.
      if (e.animationName && e.animationName.toLowerCase().includes("reveal")) {
        e.currentTarget.style.animation = "none";
      }
    };
    cards.forEach((c) => c.addEventListener("animationend", onEnd));
    return () => cards.forEach((c) => c.removeEventListener("animationend", onEnd));
  }, []);
  const [rowObsRef, rowInView] = useInView();
  // Combine the tilt ref and observer ref into one node
  const setRowRef = (node) => {
    cardsRef.current = node;
    rowObsRef.current = node;
  };
  return (
    <section className={[styles.howWeWorkSection, className].join(" ")}>
      <div className={styles.inner}>
        {/* ── Top: title + tag ───────────────────────────────────────── */}
        <header className={styles.topRow}>
          <AnimatedHeading as="h2" className={styles.howWeWork} text={t.howWeWork} />

          <div className={styles.eachClientTag}>
            <BracketLabel className={styles.eachClientBrackets}>
              <span className={styles.eachClientStack}>
                <span className={styles.eachClientYellow}>
                  {t.tagLine1}
                </span>
                <span className={styles.eachClientWhite}>
                  {t.tagLine2}
                </span>
              </span>
            </BracketLabel>
          </div>
        </header>

        {/* ── Cards row ──────────────────────────────────────────────── */}
        <div
          ref={setRowRef}
          className={`${styles.cardsRow} tilt-scope ${rowInView ? "is-visible" : ""}`}
          data-stagger="80"
          style={{ "--stagger-step": "140ms" }}
        >
          {/* ── Card 1 — Standard ───────────────────────────────────── */}
          <article data-tilt-card className={[styles.card, styles.cardDark].join(" ")}>
            <div className={styles.cardTop}>
              <BracketLabel>
                <span className={styles.tileNum}>1</span>
              </BracketLabel>
            </div>

            <h3 className={[styles.cardTitle, styles.titleOrange].join(" ")}>
              {t.cardStandardTitle}
            </h3>

            <p className={[styles.cardDesc, styles.descWhite].join(" ")}>
              {t.cardStandardDesc}
            </p>

            <p className={[styles.cardCta, styles.ctaOrange].join(" ")}>
              {t.cardStandardCta1}
              <br />
              {t.cardStandardCta2}
            </p>
          </article>

          {/* ── Card 2 — Turnkey (yellow / popular) ─────────────────── */}
          <article data-tilt-card className={[styles.card, styles.cardYellow].join(" ")}>
            <div className={styles.cardTop}>
              <BracketLabel color="#040103">
                <span className={styles.tileNum}>2</span>
              </BracketLabel>
              <button type="button" className={styles.popularPill}>
                {t.popular}
              </button>
            </div>

            <h3 className={[styles.cardTitle, styles.titleBlack].join(" ")}>
              {t.cardTurnkeyTitle}
            </h3>

            <p className={[styles.cardDesc, styles.descBlack].join(" ")}>
              {t.cardTurnkeyDesc}
            </p>

            <p className={[styles.cardCta, styles.ctaBlack].join(" ")}>
              {t.cardTurnkeyCta1}
              <br />
              {t.cardTurnkeyCta2}
            </p>
          </article>

          {/* ── Card 3 — Sourcing + Delivery + Support ──────────────── */}
          <article data-tilt-card className={[styles.card, styles.cardDark].join(" ")}>
            <div className={styles.cardTop}>
              <BracketLabel>
                <span className={styles.tileNum}>3</span>
              </BracketLabel>
            </div>

            <h3 className={[styles.cardTitle, styles.titleOrange].join(" ")}>
              {t.cardSourcingTitle1}
              <br />
              {t.cardSourcingTitle2}
            </h3>

            <p className={[styles.cardDesc, styles.descWhite].join(" ")}>
              {t.cardSourcingDesc}
            </p>

            <p className={[styles.cardCta, styles.ctaOrange].join(" ")}>
              {t.cardSourcingCta1}
              <br />
              {t.cardSourcingCta2}
              <br />
              {t.cardSourcingCta3}
            </p>
          </article>
        </div>

        {/* ── Bottom: Have a question card ───────────────────────────── */}
        <div className={styles.questionWrap}>
          <div className={styles.questionCard}>
            <h3 className={styles.questionTitle}>
              {t.haveAQuestion}
              <br />
              {t.contactUs}
            </h3>

            <div className={styles.questionPhones}>
              <a href="tel:+359875313158" className={styles.questionPhone}>
                +359 875 313 158
              </a>
              <a href="tel:+359897884804" className={styles.questionPhone}>
                +359 897 884 804
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default FrameComponent23;
