import { useMemo } from "react";
import { Link } from "react-router-dom";
import styles from "./c-o-n-t-a-c-t-s1.module.css";

/**
 * Header navigation pill — matches the Figma export 1:1.
 * When `to` is provided, becomes a real <Link> for navigation but keeps the
 * same visual hierarchy (outer flex container + inner inline-block label).
 */
const CONTACTS1 = ({
  className = "",
  cONTACTS,
  cONTACTSWidth,
  cONTACTSWidth1,
  to,
  navKey,
}) => {
  const outerStyle = useMemo(() => ({ width: cONTACTSWidth }), [cONTACTSWidth]);
  const innerStyle = useMemo(() => ({ width: cONTACTSWidth1 }), [cONTACTSWidth1]);

  const inner = (
    <div className={styles.contacts2} style={{ ...innerStyle, whiteSpace: "nowrap" }}>
      {cONTACTS}
    </div>
  );

  if (to) {
    return (
      <Link
        to={to}
        className={[styles.contacts, className].join(" ")}
        style={{ ...outerStyle, textDecoration: "none", color: "inherit" }}
        data-testid={`header-nav-${navKey || (cONTACTS || "").toString().toLowerCase().replace(/\s+/g, "-")}`}
      >
        {inner}
      </Link>
    );
  }

  return (
    <div className={[styles.contacts, className].join(" ")} style={outerStyle}>
      {inner}
    </div>
  );
};

export default CONTACTS1;
