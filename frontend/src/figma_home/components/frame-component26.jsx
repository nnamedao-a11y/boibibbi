import { useLang } from "../../i18n";
import AnimatedHeading from "../../components/AnimatedHeading";
import useInView from "../../components/useInView";
import styles from "./frame-component26.module.css";

const T = {
  en: {
    headPart1: "Why You Pay Less ",
    headPart2: "And Get More",
    dash: "— ",
    advantages: "advantages",
    car: "car",
    largeSelection: "/ Large selection",
    moreTrim: "More trim levels, colors, rare models",
    betterTrim: "/ Better trim levels",
    muchCheaper: "/ Much cheaper",
    muchCheaperDesc1: "Even taking into account delivery and customs clearance,",
    muchCheaperDesc2: "the car often comes out 20–50% cheaper",
    transparentHistory: "/ Transparent history",
    moreOptionsBetterMultimedia1: "More options",
    moreOptionsBetterMultimedia2: "Better multimedia",
    moreOptionsBetterMultimedia3: "Higher level of comfort",
    vinChecks: "VIN checks (Carfax, AutoCheck)",
  },
  bg: {
    headPart1: "Защо плащате по-малко ",
    headPart2: "и получавате повече",
    dash: "— ",
    advantages: "предимства",
    car: "автомобил",
    largeSelection: "/ Голям избор",
    moreTrim: "Повече комплектации, цветове, редки модели",
    betterTrim: "/ По-добри комплектации",
    muchCheaper: "/ Много по-евтино",
    muchCheaperDesc1: "Дори с включена доставка и митническо оформяне,",
    muchCheaperDesc2: "автомобилът често излиза 20–50% по-евтин",
    transparentHistory: "/ Прозрачна история",
    moreOptionsBetterMultimedia1: "Повече опции",
    moreOptionsBetterMultimedia2: "По-добра мултимедия",
    moreOptionsBetterMultimedia3: "По-високо ниво на комфорт",
    vinChecks: "VIN проверки (Carfax, AutoCheck)",
  },
};

const FrameComponent26 = ({
  className = "",
})=> {
  const { lang } = useLang();
  const t = lang === "bg" ? T.bg : T.en;
  const [advRef, advInView] = useInView();
  return (
    <section className={[styles.rectangleParent, className].join(" ")}>
      <div className={styles.frameChild} />
      <div className={styles.lessPayContainer}>
        <h1 className={styles.whyYouPayContainer}>
          <AnimatedHeading as="span" text={`${t.headPart1.trimEnd()} ${t.dash.trim()}`} />
          <AnimatedHeading
            as="span"
            className={styles.andGetMore}
            text={t.headPart2}
            baseDelay={(t.headPart1 + t.dash).replace(/\s/g, "").length * 28}
          />
        </h1>
      </div>
      <div ref={advRef} className={`${styles.paylessReasons} ${advInView ? "is-visible" : ""}`}>
        <h2 className={`${styles.advantages} reveal reveal--fade-up`} style={{ animationDelay: "0ms" }}>{t.advantages}</h2>
        <div className={styles.vehicleAdvantage}>
          {/* Decorative rotated "CAR" word — kept static so its
              `transform: rotate(-90deg)` is not overridden by any
              reveal animation's translate3d() transform. */}
          <div className={styles.car}>{t.car}</div>
          <div className={styles.trimContainer}>
            <div className={styles.contentAdvantage}>
              <section className={`${styles.infoContainer} reveal reveal--fade-up`} style={{ animationDelay: "240ms" }}>
                <div className={styles.detailAdvantage}>
                  <div className={styles.titleAdvantage}>
                    <div className={styles.advantageFeatures}>
                      <h2 className={styles.largeSelection}>
                        {t.largeSelection}
                      </h2>
                    </div>
                    <h2 className={styles.moreTrimLevels}>
                      {t.moreTrim}
                    </h2>
                  </div>
                  <div className={styles.trimFeatures}>
                    <h2 className={styles.largeSelection}>
                      {t.betterTrim}
                    </h2>
                  </div>
                </div>
                <div className={styles.cheaperAdvantage}>
                  <img                     className={styles.image79Icon}
                    loading="lazy"
                    width={391}
                    height={391}
                    sizes="100vw"
                    alt=""
                    src="/figma/image-79@2x.webp"
                  />
                  <div className={styles.descriptionContainer}>
                    <div className={styles.titleAdvantage}>
                      <h2 className={styles.muchCheaper}>{t.muchCheaper}</h2>
                      <h2 className={styles.evenTakingInto}>
                        {t.muchCheaperDesc1}{" "}
                        <br />
                        {t.muchCheaperDesc2}
                      </h2>
                    </div>
                    {/* Transparent history + VIN checks are GROUPED so the
                        8 px header→body gap can never fall apart — exactly
                        like Much cheaper / Even taking into account above. */}
                    <div className={styles.titleAdvantage}>
                      <h2 className={styles.transparentHistory}>
                        {t.transparentHistory}
                      </h2>
                      <h2 className={styles.vinChecksCarfax}>
                        {t.vinChecks}
                      </h2>
                    </div>
                  </div>
                </div>
              </section>
              <section className={`${styles.multimediaFeatures} reveal reveal--fade-up`} style={{ animationDelay: "360ms" }}>
                <h2 className={styles.moreOptionsBetterMultimedia}>
                  {t.moreOptionsBetterMultimedia1}
                  <br />
                  {t.moreOptionsBetterMultimedia2}
                  <br />
                  {t.moreOptionsBetterMultimedia3}
                </h2>
                <div className={styles.vINTool} aria-hidden="true" />
              </section>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default FrameComponent26;
