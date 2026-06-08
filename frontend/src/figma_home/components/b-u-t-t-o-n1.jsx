import { useMemo } from "react";
import styles from "./b-u-t-t-o-n1.module.css";

const BUTTON1 = ({
  className = "",
  property1 = "Default",
  cONTACTUS,
  showBUTTON,
  bUTTONBackgroundColor,
  bUTTONWidth,
  bUTTONBorder,
  bUTTONAlignSelf,
  cONTACTUSColor,
  cONTACTUSTextTransform,
  onClick,
})=> {
  const bUTTONStyle = useMemo(()=> {
    return {
      backgroundColor: bUTTONBackgroundColor,
      width: bUTTONWidth,
      border: bUTTONBorder,
      alignSelf: bUTTONAlignSelf,
    };
  }, [bUTTONBackgroundColor, bUTTONWidth, bUTTONBorder, bUTTONAlignSelf]);

  const cONTACTUSStyle = useMemo(()=> {
    return {
      color: cONTACTUSColor,
      textTransform: cONTACTUSTextTransform,
    };
  }, [cONTACTUSColor, cONTACTUSTextTransform]);

  return (
    !!showBUTTON && (
      <button
        className={[styles.button, className].join(" ")}
        data-property1={property1}
        style={bUTTONStyle}
        onClick={onClick}
        type="button"
      >
        <div className={styles.contactUs} style={cONTACTUSStyle}>
          {cONTACTUS}
        </div>
      </button>
    )
  );
};

export default BUTTON1;
