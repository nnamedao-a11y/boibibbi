import { useMemo } from "react";
import styles from "./frame-component15.module.css";

const FrameComponent15 = ({
  className = "",
  frameDivWidth,
  frameDivPadding,
})=> {
  const frameDivStyle = useMemo(()=> {
    return {
      width: frameDivWidth,
      padding: frameDivPadding,
    };
  }, [frameDivWidth, frameDivPadding]);

  return (
    <div
      className={[styles.frameParent, className].join(" ")}
      style={frameDivStyle}
    >
      <div className={styles.orderDateParent}>
        <div className={styles.orderDate}>Order date</div>
        <h3 className={styles.h3}>12.12.2025</h3>
      </div>
      <div className={styles.dateBackgroundWrapper}>
        <div className={styles.dateBackground} />
      </div>
    </div>
  );
};

export default FrameComponent15;
