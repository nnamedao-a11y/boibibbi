import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useLang } from "../../i18n";
import BUTTON1 from "./b-u-t-t-o-n1";
import AnimatedHeading from "../../components/AnimatedHeading";
import useInView from "../../components/useInView";
import styles from "./frame-component25.module.css";

const T = {
  en: {
    ourServices: "our Services",
    import: "Import",
    importDesc:
      "We help you find the right car based on your budget, style, and needs - handling the inspection, purchase, and delivery from the USA to Bulgaria.",
    euAdaptation: "Adaptation to European Standards",
    euAdaptationDesc:
      "We adapt the vehicle to EU standards and ensure it’s ready for smooth registration.",
    registration: "Registration and Certification",
    registrationDesc:
      "We handle full registration in Bulgaria, including KAT, documents, and transit plates - supporting you every step.",
    financing: "Financing",
    financingDesc:
      "We connect you with TBI Bank and UniCredit Bulbank and guide you through the financing process.",
    partsSourcing: "Parts Sourcing and Delivery",
    partsSourcingDesc:
      "We source and order quality parts from the USA, helping you save without compromise.",
    autoService: "Auto Service",
    autoServiceDesc:
      "We handle all repairs and technical work through a trusted partner service.",
    detailing: "Detailing and Cleaning",
    detailingDesc:
      "We provide professional cleaning and restoration of both exterior and interior. We make your car look and feel like new.",
    homeDelivery: "Home Delivery",
    homeDeliveryDesc:
      "We arrange delivery of your vehicle to any city in Bulgaria. You receive a ready-to-drive car right at your doorstep — no hassle, no extra trips.",
    findACar: "find a car",
  },
  bg: {
    ourServices: "нашите услуги",
    import: "Внос",
    importDesc:
      "Помагаме ви да намерите правилния автомобил според бюджета, стила и нуждите ви – извършваме инспекция, покупка и доставка от САЩ до България.",
    euAdaptation: "Адаптация към европейските стандарти",
    euAdaptationDesc:
      "Адаптираме автомобила към стандартите на ЕС и гарантираме готовност за безпроблемна регистрация.",
    registration: "Регистрация и сертификация",
    registrationDesc:
      "Извършваме пълна регистрация в България, включително КАТ, документи и транзитни табели – на ваше разположение на всяка крачка.",
    financing: "Финансиране",
    financingDesc:
      "Свързваме ви с TBI Bank и UniCredit Bulbank и ви водим през процеса на финансиране.",
    partsSourcing: "Намиране и доставка на части",
    partsSourcingDesc:
      "Намираме и поръчваме качествени части от САЩ, помагайки ви да спестите без компромиси.",
    autoService: "Авто сервиз",
    autoServiceDesc:
      "Извършваме всички ремонти и техническа работа чрез доверен партньорски сервиз.",
    detailing: "Детайлинг и почистване",
    detailingDesc:
      "Предоставяме професионално почистване и възстановяване на екстериора и интериора. Правим колата ви да изглежда и се чувства като нова.",
    homeDelivery: "Доставка до дома",
    homeDeliveryDesc:
      "Организираме доставка на автомобила до всеки град в България. Получавате готов за шофиране автомобил пред вратата си – без главоболия и излишни пътувания.",
    findACar: "намери автомобил",
  },
};

const FrameComponent25 = ({
  className = "",
})=> {
  const { lang } = useLang();
  const t = lang === "bg" ? T.bg : T.en;
  const navigate = useNavigate();
  const rootRef = useRef(null);
  // Viewport observer: triggers the stagger reveal on the 8 service cards.
  const [cardsObsRef, cardsInView] = useInView();

  /* ─────────────────────────────────────────────────────────────────────
   * 3D-tilt orchestration for the 8 service cards.
   *
   * The grid stays statically aligned at all times — no card ever leaves
   * its slot during scroll or while idle. The parallax only fires while
   * a card is hovered:
   *
   *   • The hovered card tilts in 3D toward the cursor and lifts on Z.
   *   • Its icon, headings and body float at their own depths inside the
   *     card, creating real "layered glass" parallax INSIDE the card.
   *   • All neighbouring cards remain completely still.
   *
   * Initial entrance is a one-shot stagger fade-in driven by an
   * IntersectionObserver — once the section enters the viewport each
   * card eases up into place with a 70 ms cascade between siblings.
   *
   * All hover updates are batched via requestAnimationFrame so the
   * section never costs more than one composited paint per frame, and
   * the whole effect respects `prefers-reduced-motion`.
   * ─────────────────────────────────────────────────────────────────── */
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const reduceMotion = window.matchMedia?.(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const isCoarsePointer = window.matchMedia?.(
      "(hover: none), (pointer: coarse)",
    ).matches;
    const isMobile = window.innerWidth < 768;

    // Pick up the 8 service cards (4 in row 1 + 4 in row 2).
    const row1 = root.querySelector(`.${styles.frameParent}`);
    const row2 = root.querySelector(`.${styles.frameParent5}`);
    const cards = [
      ...(row1 ? Array.from(row1.querySelectorAll(":scope > section")) : []),
      ...(row2 ? Array.from(row2.querySelectorAll(":scope > section")) : []),
    ];
    if (cards.length === 0) return;

    // Depth pattern — checkerboard so neighbouring cards have their own
    // tilt personality on hover (some shift more aggressively than others).
    const DEPTHS = [0.85, 1.15, 0.95, 1.05, 1.05, 0.95, 1.15, 0.85];

    cards.forEach((card, i) => {
      card.classList.add(styles.parallaxCard);
      card.style.setProperty("--depth", String(DEPTHS[i % DEPTHS.length]));
      card.style.setProperty("--stagger", String(i));
    });

    // ── IntersectionObserver: stagger fade-in on enter ──────────────
    if (!reduceMotion && typeof IntersectionObserver !== "undefined") {
      const io = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              entry.target.classList.add(styles.cardEntered);
              io.unobserve(entry.target);
            }
          });
        },
        { threshold: 0.15, rootMargin: "0px 0px -8% 0px" },
      );
      cards.forEach((c) => io.observe(c));
      root.__parallaxIo = io;
    } else {
      cards.forEach((c) => c.classList.add(styles.cardEntered));
    }

    if (reduceMotion) return undefined;

    // ── Per-card 3D tilt — the only live animation in the section ───
    const cardHandlers = [];
    if (!isCoarsePointer && !isMobile) {
      cards.forEach((card) => {
        let cardRaf = 0;
        let cx = 0;
        let cy = 0;
        const apply = () => {
          cardRaf = 0;
          card.style.setProperty("--ctx", cx.toFixed(4));
          card.style.setProperty("--cty", cy.toFixed(4));
        };
        const enter = () => {
          card.classList.add(styles.cardHover);
        };
        const move = (e) => {
          const rect = card.getBoundingClientRect();
          cx = (e.clientX - rect.left) / rect.width - 0.5;
          cy = (e.clientY - rect.top) / rect.height - 0.5;
          if (!cardRaf) cardRaf = requestAnimationFrame(apply);
        };
        const leave = () => {
          card.classList.remove(styles.cardHover);
          cx = 0;
          cy = 0;
          if (!cardRaf) cardRaf = requestAnimationFrame(apply);
        };
        card.addEventListener("mouseenter", enter);
        card.addEventListener("mousemove", move);
        card.addEventListener("mouseleave", leave);
        cardHandlers.push({ card, enter, move, leave });
      });
    }

    return () => {
      cardHandlers.forEach(({ card, enter, move, leave }) => {
        card.removeEventListener("mouseenter", enter);
        card.removeEventListener("mousemove", move);
        card.removeEventListener("mouseleave", leave);
      });
      if (root.__parallaxIo) {
        root.__parallaxIo.disconnect();
        delete root.__parallaxIo;
      }
    };
  }, []);

  return (
    <section
      ref={rootRef}
      className={[styles.servicesTitleWrapper, className].join(" ")}
      data-testid="our-services-section"
    >
      <div className={styles.servicesTitle}>
        <div className={styles.ourServicesWrapper}>
          <AnimatedHeading as="h2" className={styles.ourServices} text={t.ourServices} />
        </div>
        <div
          ref={cardsObsRef}
          className={`${styles.servicesCards} ${cardsInView ? "is-visible" : ""}`}
          data-stagger="80"
          style={{ "--stagger-step": "100ms" }}
        >
          <div className={styles.serviceDetailsColumn}>
            <div className={styles.frameParent} data-stagger="80" style={{ "--stagger-step": "100ms" }}>
              {/* Row 1, card 1 — IMPORT (consolidated single SVG) */}
              <section className={`${styles.rectangleParent} ${styles.serviceCard}`}>
                <div className={styles.serviceCardBg} />
                <div className={styles.serviceCardIcon} style={{ width: 70, height: 54 }}>
                  <img
                    className={styles.importIcon}
                    width={70}
                    height={54}
                    sizes="100vw"
                    alt=""
                    src="/figma/import-icon.svg"
                  />
                </div>
                <h3 className={styles.serviceCardTitle}>{t.import}</h3>
                <div className={styles.serviceCardDesc}>{t.importDesc}</div>
              </section>

              {/* Row 1, card 2 — EU ADAPTATION (original 6-fragment composition) */}
              <section className={`${styles.rectangleGroup} ${styles.serviceCard}`}>
                <div className={styles.serviceCardBg} />
                <div className={styles.serviceCardIcon} style={{ width: 52, height: 52 }}>
                  <div className={styles.eUAdaptation}>
                    <img
                      className={styles.vectorIcon}
                      width={52}
                      height={52}
                      sizes="100vw"
                      alt=""
                      src="/figma/Vector2.svg"
                    />
                    <img
                      className={styles.vectorIcon8}
                      width={5}
                      height={5}
                      sizes="100vw"
                      alt=""
                      src="/figma/Vector2-dot-5.svg"
                    />
                    <img
                      className={styles.vectorIcon9}
                      width={5}
                      height={5}
                      sizes="100vw"
                      alt=""
                      src="/figma/Vector2-dot-5.svg"
                    />
                    <img
                      className={styles.vectorIcon10}
                      width={5}
                      height={5}
                      sizes="100vw"
                      alt=""
                      src="/figma/Vector2-dot-5.svg"
                    />
                    <img
                      className={styles.vectorIcon11}
                      width={5}
                      height={5}
                      sizes="100vw"
                      alt=""
                      src="/figma/Vector2-dot-5.svg"
                    />
                    <img
                      className={styles.vectorIcon12}
                      width={29.6}
                      height={29.4}
                      sizes="100vw"
                      alt=""
                      src="/figma/Vector7.svg"
                    />
                  </div>
                </div>
                <h2 className={`${styles.serviceCardTitle} ${styles.serviceCardTitleTwoLine}`}>
                  {t.euAdaptation}
                </h2>
                <div className={styles.serviceCardDesc}>{t.euAdaptationDesc}</div>
              </section>

              {/* Row 1, card 3 — REGISTRATION & CERTIFICATION (consolidated) */}
              <section className={`${styles.rectangleContainer} ${styles.serviceCard}`}>
                <div className={styles.serviceCardBg} />
                <div className={styles.serviceCardIcon} style={{ width: 66, height: 70 }}>
                  <img
                    className={styles.registrationIcon}
                    width={66}
                    height={70}
                    sizes="100vw"
                    alt=""
                    src="/figma/registration-icon.svg"
                  />
                </div>
                <h2 className={`${styles.serviceCardTitle} ${styles.serviceCardTitleTwoLine}`}>
                  {t.registration}
                </h2>
                <div className={styles.serviceCardDesc}>{t.registrationDesc}</div>
              </section>

              {/* Row 1, card 4 — FINANCING (consolidated) */}
              <section className={`${styles.frameSection} ${styles.serviceCard}`}>
                <div className={styles.serviceCardBg} />
                <div className={styles.serviceCardIcon} style={{ width: 68, height: 62 }}>
                  <img
                    className={styles.financingIcon}
                    width={68}
                    height={62}
                    sizes="100vw"
                    alt=""
                    src="/figma/financing-icon.svg"
                  />
                </div>
                <h3 className={styles.serviceCardTitle}>{t.financing}</h3>
                <div className={styles.serviceCardDesc}>{t.financingDesc}</div>
              </section>
            </div>

            <div className={styles.frameParent5}>
              {/* Row 2, card 1 — PARTS SOURCING & DELIVERY (consolidated single SVG,
                  same pattern as Import/Registration/Financing — fixes the
                  internal divider lines which previously scaled to ~0px stroke). */}
              <section className={`${styles.frameWrapper3} ${styles.serviceCard}`}>
                <div className={styles.serviceCardBg} />
                <div className={styles.serviceCardIcon} style={{ width: 56, height: 46 }}>
                  <img
                    className={styles.partsSourcingIcon}
                    width={56}
                    height={46}
                    sizes="100vw"
                    alt=""
                    src="/figma/parts-sourcing-icon.svg"
                  />
                </div>
                <h2 className={`${styles.serviceCardTitle} ${styles.serviceCardTitleTwoLine}`}>
                  {t.partsSourcing}
                </h2>
                <div className={styles.serviceCardDesc}>{t.partsSourcingDesc}</div>
              </section>

              {/* Row 2, card 2 — AUTO SERVICE (consolidated single SVG:
                  outer shell 58×58 + GPS-fix crosshair 20×20 centred
                  inside, all strokes native 2 px). */}
              <section className={`${styles.rectangleParent3} ${styles.serviceCard}`}>
                <div className={styles.serviceCardBg} />
                <div className={styles.serviceCardIcon} style={{ width: 60, height: 60 }}>
                  <img
                    className={styles.autoServiceIcon}
                    width={60}
                    height={60}
                    sizes="100vw"
                    alt=""
                    src="/figma/auto-service-icon.svg"
                  />
                </div>
                <h3 className={styles.serviceCardTitle}>{t.autoService}</h3>
                <div className={styles.serviceCardDesc}>{t.autoServiceDesc}</div>
              </section>

              {/* Row 2, card 3 — DETAILING & CLEANING (original gemini-svg-1.svg) */}
              <section className={`${styles.rectangleParent4} ${styles.serviceCard}`}>
                <div className={styles.serviceCardBg} />
                <div className={styles.serviceCardIcon} style={{ width: 85, height: 85 }}>
                  <img
                    className={styles.geminiSvg1Icon}
                    loading="lazy"
                    width={85}
                    height={85}
                    sizes="100vw"
                    alt=""
                    src="/figma/gemini-svg-1.svg"
                  />
                </div>
                <h2 className={`${styles.serviceCardTitle} ${styles.serviceCardTitleTwoLine}`}>
                  {t.detailing}
                </h2>
                <div className={styles.serviceCardDesc}>{t.detailingDesc}</div>
              </section>

              {/* Row 2, card 4 — HOME DELIVERY (consolidated single SVG,
                  EXACT Figma geometry: house 51.81×46.63, car 41.4×20.7,
                  wheels 7.8×7.8 — total icon 74.2×65.7, all strokes
                  native 2 px). */}
              <section className={`${styles.rectangleParent5} ${styles.serviceCard}`}>
                <div className={styles.serviceCardBg} />
                <div className={styles.serviceCardIcon} style={{ width: 74.2, height: 65.7 }}>
                  <img
                    className={styles.homeDeliveryIcon}
                    width={74.2}
                    height={65.7}
                    sizes="100vw"
                    alt=""
                    src="/figma/home-delivery-icon.svg"
                  />
                </div>
                <h3 className={styles.serviceCardTitle}>{t.homeDelivery}</h3>
                <div className={styles.serviceCardDesc}>{t.homeDeliveryDesc}</div>
              </section>
            </div>
          </div>
          <div className={styles.contactButtonService}>
            <BUTTON1
              property1="Default"
              cONTACTUS={t.findACar}
              showBUTTON
              bUTTONBackgroundColor="#000"
              bUTTONWidth="459px"
              bUTTONBorder="none"
              bUTTONAlignSelf="unset"
              cONTACTUSColor="#feae00"
              cONTACTUSTextTransform="uppercase"
              /* "Find a car" navigates straight into the public catalog so
                 users land on the live inventory after exploring the
                 services lineup — the most natural conversion path. */
              onClick={() => navigate("/catalog")}
            />
          </div>
        </div>
      </div>
    </section>
  );
};

export default FrameComponent25;
