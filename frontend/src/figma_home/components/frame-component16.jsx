import styles from "./frame-component16.module.css";

const FrameComponent16 = ({
  className = "",
})=> {
  return (
    <div className={[styles.bmvDetailsParent, className].join(" ")}>
      <div className={styles.bmvDetails} />
      <div className={styles.bmvElements}>
        <h2 className={styles.bmv328}>BMV 328</h2>
      </div>
      <div className={styles.rectangleParent}>
        <div className={styles.frameChild} />
        <div className={styles.frameChild} />
      </div>
      <div className={styles.componentChild} />
      <div className={styles.componentItem} />
      <div className={styles.componentInner} />
      <div className={styles.dataLayoutWrapper}>
        <div className={styles.dataLayout}>
          <div className={styles.orderDateParent}>
            <div className={styles.orderDate}>Order date</div>
            <h3 className={styles.labelContainer}>12.12.2025</h3>
          </div>
          <div className={styles.dataDisplay}>
            <div className={styles.dataDisplayChild} />
          </div>
          <div className={styles.theDateOfTheFinishedCarParent}>
            <div className={styles.theDateOf}>The date of the finished car</div>
            <h3 className={styles.h3}>12.04.2026</h3>
          </div>
          <div className={styles.dataLayoutChild} />
          <div className={styles.turnkeyPriceInBulgariaParent}>
            <div className={styles.turnkeyPriceIn}>
              Turnkey price in Bulgaria
            </div>
            <h3 className={styles.euro}>6,500 euro</h3>
          </div>
        </div>
      </div>
      <section className={styles.frameParent}>
        <div className={styles.dtKlausenLs1351Parent}>
          <img             className={styles.dtKlausenLs1351Icon}
            width={402}
            height={383.7}
            sizes="100vw"
            alt=""
            src="/figma/DT-Klausen-LS-135-1@2x.webp"
          />
          <img             className={styles.dtKlausenLs1351Icon}
            loading="lazy"
            width={402}
            height={383.7}
            sizes="100vw"
            alt=""
            src="/figma/DT-Klausen-LS-135-3@2x.webp"
          />
        </div>
        <img           className={styles.dtKlausenLs1352Icon}
          loading="lazy"
          width={402}
          height={383.7}
          sizes="100vw"
          alt=""
          src="/figma/DT-Klausen-LS-135-2@2x.webp"
        />
      </section>
    </div>
  );
};

export default FrameComponent16;
