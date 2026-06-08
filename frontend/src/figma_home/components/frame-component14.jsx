import FrameComponent15 from "./frame-component15";
import styles from "./frame-component14.module.css";

const FrameComponent14 = ({
  className = "",
  frameDivWidth,
  frameDivPadding,
})=> {
  return (
    <div className={[styles.rectangleParent, className].join(" ")}>
      <div className={styles.instanceChild} />
      <div className={styles.bmv328Wrapper}>
        <h2 className={styles.bmv328}>BMV 328</h2>
      </div>
      <div className={styles.rectangleGroup}>
        <div className={styles.frameChild} />
        <div className={styles.frameChild} />
      </div>
      <div className={styles.instanceItem} />
      <div className={styles.instanceInner} />
      <div className={styles.rectangleDiv} />
      <div className={styles.frameWrapper}>
        <div className={styles.frameParent}>
          <FrameComponent15
            frameDivWidth={frameDivWidth}
            frameDivPadding={frameDivPadding}
          />
          <div className={styles.theDateOfTheFinishedCarParent}>
            <div className={styles.theDateOf}>The date of the finished car</div>
            <h3 className={styles.labelturnkey}>12.04.2026</h3>
          </div>
          <div className={styles.rectangleContainer}>
            <div className={styles.frameInner} />
            <div className={styles.turnkeyPriceInBulgariaParent}>
              <div className={styles.turnkeyPriceIn}>
                Turnkey price in Bulgaria
              </div>
              <h3 className={styles.euro}>6,500 euro</h3>
            </div>
          </div>
        </div>
      </div>
      <section className={styles.frameGroup}>
        <div className={styles.dtKlausenLs1351Parent}>
          <img             className={styles.dtKlausenLs1351Icon}
            width={402}
            height={383.7}
            sizes="100vw"
            alt=""
            src="/figma/DT-Klausen-LS-135-11@2x.webp"
          />
          <img             className={styles.dtKlausenLs1351Icon}
            width={402}
            height={383.7}
            sizes="100vw"
            alt=""
            src="/figma/DT-Klausen-LS-135-31@2x.webp"
          />
        </div>
        <div className={styles.dtKlausenLs1352Wrapper}>
          <img             className={styles.dtKlausenLs1352Icon}
            width={402}
            height={383.7}
            sizes="100vw"
            alt=""
            src="/figma/DT-Klausen-LS-135-21@2x.webp"
          />
        </div>
      </section>
    </div>
  );
};

export default FrameComponent14;
