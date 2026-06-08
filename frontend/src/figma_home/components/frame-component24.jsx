import { useEffect, useRef, useState } from "react";
import styles from "./frame-component24.module.css";
import AnimatedHeading from "../../components/AnimatedHeading";
import { useLang } from "../../i18n";

/**
 * FrameComponent24 — "WE HAVE PERFECT SERVICE" section.
 *
 * Animation (per user spec):
 *  • The whole block is gated by ONE IntersectionObserver on the outer
 *    wrapper. As soon as the section enters the viewport, `.is-visible`
 *    is added on the wrapper — which lights up every descendant carrying
 *    the global `.reveal.reveal--slide-left` class (defined in
 *    `components/reveal.global.css`).
 *
 *  • Cadence:
 *       ─ 0 ms     : "we have perfect service" headline (AnimatedHeading
 *                    already handles its own character cascade)
 *       ─ 120 ms   : "Just a few steps to your dream car" subtitle
 *       ─ 280 ms   : column 1 (pin + title + description) slides in
 *       ─ 520 ms   : column 2
 *       ─ 760 ms   : column 3
 *       ─ 1000 ms  : column 4
 *
 *    Within each column the icon, title and description share the same
 *    base delay with a 60 ms intra-column micro-stagger so the column
 *    reads as a single "block" arriving from the left, exactly as the
 *    user requested ("блочно, как слева направо").
 *
 *  • Honours `prefers-reduced-motion`: the global `.reveal` keyframes
 *    no-op in that case, so users with the OS toggle get the static
 *    final state.
 */
const FrameComponent24 = ({ className = "" }) => {
  const { lang } = useLang();
  const isBg = lang === "bg";

  // ── One observer for the whole section ─────────────────────────────
  const sectionRef = useRef(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = sectionRef.current;
    if (!el) return undefined;

    // Respect reduced-motion preference: skip the cascade entirely so
    // the section is fully visible from the first paint.
    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      setInView(true);
      return undefined;
    }

    // If the section is already in the viewport at mount (e.g. user
    // landed deep-linked at a hash anchor), fire on the next frame.
    const rect = el.getBoundingClientRect();
    const vh = window.innerHeight || 0;
    if (rect.top < vh && rect.bottom > 0) {
      requestAnimationFrame(() => requestAnimationFrame(() => setInView(true)));
      return undefined;
    }

    if (typeof IntersectionObserver === "undefined") {
      setInView(true);
      return undefined;
    }

    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setInView(true);
            io.disconnect();
          }
        });
      },
      // Fire as soon as ~10% of the section enters the viewport, with
      // a small bottom bias so the cascade kicks in slightly before
      // the section is dead-centre.
      { threshold: 0.1, rootMargin: "0px 0px -10% 0px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const T = isBg
    ? {
        weHavePerfect: "имаме перфектно обслужване",
        justAFew1: "Само няколко стъпки",
        justAFew2: "до колата на мечтите ви",
        choose: "Изберете перфектната кола",
        pay: "Платете бързо и без усилия",
        track1: "Проследявайте колата си",
        track2: "в реално време",
        keys: "Получете ключовете и се насладете на новата си кола",
        find: "Намерете автомобил, който отговаря на стила и бюджета ви",
        simple: "Прост, прозрачен процес без усложнения",
        stayUpdated:
          "Бъдете в течение на всяка стъпка от пътуването в личния си акаунт",
        manager:
          "Нашият мениджър ще ви предаде автомобила и ще се погрижи за всеки детайл",
      }
    : {
        weHavePerfect: "we have perfect service",
        justAFew1: "Just a few steps",
        justAFew2: "to your dream car",
        choose: "Choose your perfect car",
        pay: "Pay quickly and effortlessly",
        track1: "Track your car",
        track2: "in real time",
        keys: "Get the keys and enjoy your new car",
        find: "Find a vehicle that matches your style and budget",
        simple: "A simple, transparent process with no complications",
        stayUpdated:
          "Stay updated on every step of the journey in your personal account",
        manager:
          "Our manager will hand over the vehicle and take care of every detail",
      };

  // ── Per-column timing ──────────────────────────────────────────────
  // Each column = {pin, title, description}. The three items share the
  // same base delay with a small 60 ms micro-stagger so the column
  // reads as a single sliding block. Columns themselves are 240 ms
  // apart, yielding a clean left-to-right wave.
  const COL_BASE = 280; // ms — when the first column starts
  const COL_STEP = 240; // ms — gap between columns
  const INTRA = 60; // ms — micro-stagger inside one column (pin → title → desc)
  const colDelay = (i) => COL_BASE + i * COL_STEP;

  const isVisibleClass = inView ? "is-visible" : "";

  return (
    <section
      ref={sectionRef}
      className={[
        styles.weHavePerfectServiceWrapper,
        isVisibleClass,
        className,
      ].join(" ")}
      data-testid="perfect-service-section"
    >
      <div className={styles.weHavePerfectService}>
        <section className={styles.serviceContent}>
          <div className={styles.weHavePerfectServiceParent}>
            {/* Headline already cascades character-by-character via
                AnimatedHeading; we let it run on its own intersection. */}
            <AnimatedHeading
              as="h2"
              className={styles.weHavePerfect}
              text={T.weHavePerfect}
            />
            <div className={styles.dreamCar}>
              <div
                className={`${styles.frameParent} reveal reveal--slide-left`}
                style={{ animationDelay: "120ms" }}
              >
                <div className={styles.vectorWrapper}>
                  <img
                    className={styles.vectorIcon}
                    width={13}
                    height={76}
                    sizes="100vw"
                    alt=""
                    src="/figma/Vector.svg"
                  />
                </div>
                <h2 className={styles.justAFewContainer}>
                  <span>
                    {T.justAFew1} <br />
                  </span>
                  <span className={styles.toYourDream}>{T.justAFew2}</span>
                </h2>
                <div className={styles.vectorContainer}>
                  <img
                    className={styles.vectorIcon2}
                    width={13}
                    height={76}
                    sizes="100vw"
                    alt=""
                    src="/figma/Vector.svg"
                  />
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── Pins + titles + descriptions ──────────────────────────────
            Reveal cadence (all from LEFT → right):
              column 1 starts at  280ms
              column 2 starts at  520ms
              column 3 starts at  760ms
              column 4 starts at 1000ms
            Each column's pin/title/description trail by 60 ms within
            the column so the icon arrives first then the title then
            the description — but still feels like a single sliding
            block per user spec. */}
        <section className={styles.locationSet}>
          <div className={styles.locationService}>
            <div className={styles.locationIcon}>
              {/* Column 1 — pin */}
              <div
                className={`${styles.locationSolo} reveal reveal--slide-left`}
                style={{ animationDelay: `${colDelay(0)}ms` }}
              >
                <div className={styles.weuilocationFilledParent}>
                  <img
                    className={styles.weuilocationFilledIcon}
                    width={44.2}
                    height={44.2}
                    sizes="100vw"
                    alt=""
                    src="/figma/weui-location-filled.svg"
                  />
                  <div className={styles.frameChild} />
                </div>
              </div>

              {/* Column 2 — pin */}
              <div
                className={`${styles.iconPairs} reveal reveal--slide-left`}
                style={{ animationDelay: `${colDelay(1)}ms` }}
              >
                <img
                  className={styles.weuilocationFilledIcon}
                  width={44.2}
                  height={44.2}
                  sizes="100vw"
                  alt=""
                  src="/figma/weui-location-filled.svg"
                />
                <div className={styles.frameChild} />
              </div>

              {/* Column 3 — pin + connecting line */}
              <div
                className={`${styles.locationOverlap} reveal reveal--slide-left`}
                style={{ animationDelay: `${colDelay(2)}ms` }}
              >
                <div className={styles.locationOverlapChild} />
                <div className={styles.weuilocationFilledGroup}>
                  <img
                    className={styles.weuilocationFilledIcon}
                    width={44.2}
                    height={44.2}
                    sizes="100vw"
                    alt=""
                    src="/figma/weui-location-filled.svg"
                  />
                  <div className={styles.frameChild} />
                </div>
              </div>

              {/* Column 4 — pin */}
              <div
                className={`${styles.iconPairs2} reveal reveal--slide-left`}
                style={{ animationDelay: `${colDelay(3)}ms` }}
              >
                <img
                  className={styles.weuilocationFilledIcon}
                  width={44.2}
                  height={44.2}
                  sizes="100vw"
                  alt=""
                  src="/figma/weui-location-filled.svg"
                />
                <div className={styles.frameChild} />
              </div>
            </div>
          </div>

          <div className={styles.serviceClaims}>
            <h1
              className={`${styles.chooseYourPerfect} reveal reveal--slide-left`}
              style={{ animationDelay: `${colDelay(0) + INTRA}ms` }}
            >
              {" "}
              {T.choose}
            </h1>
            <h1
              className={`${styles.chooseYourPerfect} reveal reveal--slide-left`}
              style={{ animationDelay: `${colDelay(1) + INTRA}ms` }}
            >
              {T.pay}
            </h1>
            <h1
              className={`${styles.chooseYourPerfect} reveal reveal--slide-left`}
              style={{ animationDelay: `${colDelay(2) + INTRA}ms` }}
            >
              {T.track1} <br />
              {T.track2}
            </h1>
            <h1
              className={`${styles.chooseYourPerfect} reveal reveal--slide-left`}
              style={{ animationDelay: `${colDelay(3) + INTRA}ms` }}
            >
              {T.keys}
            </h1>
          </div>

          <div className={styles.findVehicleProcess}>
            <div className={styles.findAVehicleThatMatchesYoParent}>
              <div
                className={`${styles.findAVehicle} reveal reveal--slide-left`}
                style={{ animationDelay: `${colDelay(0) + INTRA * 2}ms` }}
              >
                {T.find}
              </div>
              <div
                className={`${styles.processStatement} reveal reveal--slide-left`}
                style={{ animationDelay: `${colDelay(1) + INTRA * 2}ms` }}
              >
                <div className={styles.aSimpleTransparent}>{T.simple}</div>
              </div>
              <div
                className={`${styles.processStep} reveal reveal--slide-left`}
                style={{ animationDelay: `${colDelay(2) + INTRA * 2}ms` }}
              >
                <div className={styles.aSimpleTransparent}>
                  {T.stayUpdated}
                </div>
              </div>
              <div
                className={`${styles.ourManagerWill} reveal reveal--slide-left`}
                style={{ animationDelay: `${colDelay(3) + INTRA * 2}ms` }}
              >
                {T.manager}
              </div>
            </div>
          </div>
        </section>
      </div>
    </section>
  );
};

export default FrameComponent24;
