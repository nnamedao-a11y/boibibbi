import FrameComponent18 from "./components/frame-component18";
import BrandLogos1 from "./components/brand-logos1";
import VehicleDeals1 from "./components/vehicle-deals1";
import FrameComponent20 from "./components/frame-component20";
import FrameComponent21 from "./components/frame-component21";
import FrameComponent22 from "./components/frame-component22";
import FrameComponent23 from "./components/frame-component23";
import TurnkeyBanner1 from "./components/turnkey-banner1";
import ServiceBanners1 from "./components/service-banners1";
import ProcessBanner1 from "./components/process-banner1";
import FrameComponent24 from "./components/frame-component24";
import FrameComponent25 from "./components/frame-component25";
import BeforeAfterSection from "./components/before-after-section";
import FrameComponent19 from "./components/frame-component19";
import ReviewsArea1 from "./components/reviews-area1";
import FrameComponent26 from "./components/frame-component26";
import FrameComponent27 from "./components/frame-component27";
import FrameComponent28 from "./components/frame-component28";
import { useLang } from "../i18n";
import { useCallback, useState } from "react";
import AnimatedHeading from "../components/AnimatedHeading";
// NOTE: Header1 / Footer1 are NOT imported here anymore. They are rendered
// once at the route-layout level (`PublicLayout` / `<BibiHeader/>`/<BibiFooter/>)
// so the public site has a SINGLE header & footer across every page.
import styles from "./homepage1.module.css";

const T = {
  en: {
    searchForCars: "Search for cars ",
    fromAmericaAndKorea: "from America and Korea",
    ourClientsSay: "our clients say",
  },
  bg: {
    searchForCars: "Търсене на автомобили ",
    fromAmericaAndKorea: "от Америка и Корея",
    ourClientsSay: "Какво казват нашите клиенти",
  },
};

const Homepage1 = ()=> {
  const { lang } = useLang();
  const t = lang === "bg" ? T.bg : T.en;
  // Shared filter state between FrameComponent20 (filter bar) and
  // FrameComponent21 (curated wishlist cards). Default to "sedan" +
  // "10-15K" so the first paint matches the visual default.
  const [dealsCategory, setDealsCategory] = useState("sedan");
  const [dealsBudget, setDealsBudget] = useState("10-15K");
  // Live count of curated picks rendered in the grid — mirrors into
  // the "PROPOSALS - n" counter on the filter row.
  const [dealsCount, setDealsCount] = useState(null);
  const handleDealsFilterChange = useCallback(({ vehicleId, tier }) => {
    if (vehicleId) setDealsCategory(vehicleId);
    if (tier) setDealsBudget(tier);
  }, []);
  const handleDealsCount = useCallback((n) => setDealsCount(n), []);
  return (
    <div className={styles.homepage}>
      <img         className={styles.image57Icon}
        width={1920}
        height={2378.4}
        sizes="100vw"
        alt=""
        src="/figma/image-57@2x.webp"
      />
      <div className={styles.image57} />
      <img         className={styles.unsplashwl8dyDm7x8Icon}
        width={1494.7}
        height={1144.1}
        sizes="100vw"
        alt=""
        src="/figma/unsplash-WL8DY-Dm7X8@2x.webp"
      />
      {/* Header1 removed — rendered once at the layout level */}
      <FrameComponent18 />
      <section className={styles.catalogAction}>
        <div className={styles.carSearch}>
          <div className={styles.searchCopy}>
            <AnimatedHeading as="h2" className={styles.searchForCars} text={t.searchForCars} />
          </div>
          <AnimatedHeading
            as="h2"
            className={styles.fromAmericaAnd}
            text={t.fromAmericaAndKorea}
            baseDelay={(t.searchForCars || "").replace(/\s/g, "").length * 28}
          />
        </div>
      </section>
      <BrandLogos1 />
      <section className={styles.rectangleParent}>
        <div className={styles.frameChild} />
        <VehicleDeals1 />
        <FrameComponent20
          onChange={handleDealsFilterChange}
          countOverride={dealsCount}
        />
        <FrameComponent21
          category={dealsCategory}
          budget={dealsBudget}
          onCount={handleDealsCount}
        />
      </section>
      <FrameComponent22 />
      <FrameComponent23 />
      <TurnkeyBanner1 />
      <div className={styles.homepageChild} />
      <ServiceBanners1 />
      <ProcessBanner1 />
      <FrameComponent24 />
      <FrameComponent25 />
      <BeforeAfterSection />
      <main className={styles.serviceVisualsParent}>
        <section className={styles.reviewsContainerWrapper}>
          <div className={styles.reviewsContainer}>
            <div className={styles.testimonialsHeader}>
              <AnimatedHeading
                as="h2"
                className={styles.ourClientsSay}
                text={t.ourClientsSay}
              />
            </div>
          </div>
        </section>
        <ReviewsArea1 />
      </main>
      <FrameComponent26 />
      <FrameComponent27 />
      <FrameComponent28 lang={lang} />
      {/* Footer1 removed — rendered once at the layout level */}
    </div>
  );
};

export default Homepage1;
