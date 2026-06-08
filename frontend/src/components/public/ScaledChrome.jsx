/**
 * SiteChrome — responsive wrapper around the figma `Header1` / `Footer1`.
 *
 * Both components were exported from Figma at a fixed 1920px viewport.
 * To unify the public site we render them on EVERY page (homepage, contacts,
 * about, policies, etc.) and simply transform-scale them down on smaller
 * viewports so they always look exactly like the Figma design — no
 * duplicate "old" / "new" header & footer anymore.
 *
 * Renders the inner component at its native 1920px width inside a flexible
 * outer wrapper whose height tracks the scaled inner element.
 *
 * Usage:
 *   <ScaledChrome><Header1 /></ScaledChrome>
 *   ... page body ...
 *   <ScaledChrome><Footer1 /></ScaledChrome>
 *
 * Above 1920px we don't upscale — design stays at its native size and is
 * centered in the viewport (logo / nav stay sharp).
 */
import React, { useEffect, useRef, useState } from "react";

const DESIGN_WIDTH = 1920;

export default function ScaledChrome({ children }) {
  const innerRef = useRef(null);
  const [scale, setScale] = useState(1);
  const [innerHeight, setInnerHeight] = useState(0);

  // Track viewport width → scale ratio
  useEffect(() => {
    const onResize = () => {
      const vw = window.innerWidth;
      const next = vw < DESIGN_WIDTH ? vw / DESIGN_WIDTH : 1;
      setScale(next);
    };
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // Track natural inner height so the outer wrapper occupies the correct
  // post-scale height (no extra whitespace, no clipping).
  useEffect(() => {
    if (!innerRef.current) return;
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) setInnerHeight(e.contentRect.height);
    });
    ro.observe(innerRef.current);
    return () => ro.disconnect();
  }, []);

  return (
    <div
      style={{
        width: "100%",
        overflowX: "clip",                  /* keep horizontal clipping … */
        overflowY: "visible",               /* …but let header dropdowns escape */
        background: "#000",
        position: "relative",
        height: innerHeight ? innerHeight * scale : "auto",
      }}
    >
      <div
        ref={innerRef}
        style={{
          width: `${DESIGN_WIDTH}px`,
          transformOrigin: "top left",
          transform: `scale(${scale})`,
        }}
      >
        {children}
      </div>
    </div>
  );
}
