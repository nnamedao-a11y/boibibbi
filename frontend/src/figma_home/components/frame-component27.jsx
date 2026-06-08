import { useNavigate } from "react-router-dom";
import { useLang } from "../../i18n";
import BUTTON1 from "./b-u-t-t-o-n1";
import AnimatedHeading from "../../components/AnimatedHeading";
import useInView from "../../components/useInView";
import { useGetInTouch } from "../../components/public/GetInTouchModal";
import styles from "./frame-component27.module.css";

const T = {
  en: {
    headOrange: "Want to drive",
    headWhite: "your dream car?",
    sub1: "Fill out the application",
    sub2: "and we will find",
    sub3: "the best offer for you",
    contactUs: "CONTACT US",
  },
  bg: {
    headOrange: "Искате да карате",
    headWhite: "колата на мечтите си?",
    sub1: "Попълнете формуляра",
    sub2: "и ние ще намерим",
    sub3: "най-добрата оферта за вас",
    contactUs: "СВЪРЖЕТЕ СЕ С НАС",
  },
};

const FrameComponent27 = ({ className = "" }) => {
  const navigate = useNavigate();
  const { lang } = useLang();
  const t = lang === "bg" ? T.bg : T.en;
  const { open: openGetInTouch } = useGetInTouch();

  // CONTACT US — opens the global "Reach Out To Us" modal (same one that
  // sits under the map on the Contacts page). Falls back to the dedicated
  // contacts page if the provider isn't in scope.
  const handleContactClick = () => {
    if (typeof openGetInTouch === "function") {
      openGetInTouch();
      return;
    }
    navigate("/contacts#reach-out");
  };
  const [formColRef, formColInView] = useInView();

  return (
    <section
      className={[styles.heroSection, className].join(" ")}
      style={{ backgroundImage: "url(/figma/young-woman-with-salesman-carshowroom-1@2x.webp)" }}
    >
      {/* Top-left BIBI logo overlay */}
      <img
        className={styles.logo}
        loading="lazy"
        width={264}
        height={90}
        alt="BIBI Cars"
        src="/figma/BiBi-logo-02-1.svg"
      />

      {/* Bottom row: heading (left) + form (right) */}
      <div className={styles.bottomRow}>
        <h1 className={styles.heading}>
          <AnimatedHeading as="span" className={styles.headingOrange} text={t.headOrange} />
          <AnimatedHeading
            as="span"
            className={styles.headingWhite}
            text={t.headWhite}
            baseDelay={t.headOrange.replace(/\s/g, "").length * 28}
          />
        </h1>

        <div
          ref={formColRef}
          className={`${styles.formColumn} ${formColInView ? "is-visible" : ""}`}
        >
          <h2 className={`${styles.subcopy} reveal reveal--slide-left`} style={{ animationDelay: "120ms" }}>
            {t.sub1}
            <br />
            {t.sub2}
            <br />
            {t.sub3}
          </h2>

          <div className="reveal reveal--fade-up" style={{ animationDelay: "320ms" }}>
            <BUTTON1
              property1="Default"
              cONTACTUS={t.contactUs}
              showBUTTON
              bUTTONBackgroundColor="#FEAE00"
              bUTTONWidth="380px"
              bUTTONBorder="none"
              bUTTONAlignSelf="unset"
              cONTACTUSColor="#000"
              cONTACTUSTextTransform="uppercase"
              onClick={handleContactClick}
              data-testid="dream-car-contact-us"
            />
          </div>
        </div>
      </div>
    </section>
  );
};

export default FrameComponent27;
