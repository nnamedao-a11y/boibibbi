import FrameComponent16 from "./frame-component16";
import FrameComponent14 from "./frame-component14";
import FrameComponent15 from "./frame-component15";
import styles from "./frame-component19.module.css";

const FrameComponent19 = ({
  className = "",
})=> {
  return (
    <div className={[styles.orderProcessWrapper, className].join(" ")}>
      <div className={styles.orderProcess}>
        <div className={styles.componentParent}>
          <FrameComponent16 />
          <div className={styles.beforeProcess}>
            <h3 className={styles.before}>/ before</h3>
          </div>
          <div className={styles.afterPhase}>
            <h3 className={styles.after}>/ after</h3>
          </div>
        </div>
        <div className={styles.componentParent}>
          <FrameComponent14 />
          <div className={styles.beforeProcess}>
            <h3 className={styles.before}>/ before</h3>
          </div>
          <div className={styles.afterWrapper}>
            <h3 className={styles.after}>/ after</h3>
          </div>
        </div>
        <div className={styles.instanceGroup}>
          <div className={styles.rectangleParent}>
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
              <div className={styles.dateElementParent}>
                <FrameComponent15
                  frameDivWidth="188.1px"
                  frameDivPadding="unset"
                />
                <div className={styles.nestedFinishedParent}>
                  <div className={styles.nestedFinished}>
                    <div className={styles.theDateOf}>
                      The date of the finished car
                    </div>
                    <h3 className={styles.h3}>12.04.2026</h3>
                  </div>
                  <div className={styles.priceBackground} />
                  <div className={styles.priceDetails}>
                    <div className={styles.turnkeyPriceIn}>
                      Turnkey price in Bulgaria
                    </div>
                    <h3 className={styles.euro}>6,500 euro</h3>
                  </div>
                </div>
              </div>
            </div>
            <section className={styles.frameParent}>
              <div className={styles.wrapperDtKlausenLs1351Parent}>
                <div className={styles.wrapperDtKlausenLs1351}>
                  <img                     className={styles.dtKlausenLs1351Icon}
                    width={402}
                    height={383.7}
                    sizes="100vw"
                    alt=""
                    src="/figma/DT-Klausen-LS-135-12@2x.webp"
                  />
                </div>
                <div className={styles.wrapperDtKlausenLs1351}>
                  <img                     className={styles.dtKlausenLs1351Icon}
                    width={402}
                    height={383.7}
                    sizes="100vw"
                    alt=""
                    src="/figma/DT-Klausen-LS-135-32@2x.webp"
                  />
                </div>
              </div>
              <img                 className={styles.dtKlausenLs1352Icon}
                width={402}
                height={383.7}
                sizes="100vw"
                alt=""
                src="/figma/DT-Klausen-LS-135-22@2x.webp"
              />
            </section>
          </div>
          <div className={styles.beforeContainer}>
            <h3 className={styles.before}>/ before</h3>
          </div>
        </div>
      </div>
    </div>
  );
};

export default FrameComponent19;
