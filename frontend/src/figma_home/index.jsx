/**
 * FigmaHomePage — responsive entry point.
 *
 * • ≥ 768px: render the existing pixel-perfect 1920px Figma export
 *           (Homepage1) inside a transform-scaler so it fits without
 *           overlap at desktop / tablet widths.
 * • < 768px: render the dedicated `MobileHomePage` component built
 *           from the Figma mobile mock (BIBICARS 5 + Menu.svg).
 */
import React, { useEffect, useState, useRef } from 'react';
import './figma-global.css';
import scaler from './figma-scaler.module.css';
import Homepage1 from './homepage1';
import MobileHomePage from './mobile/MobileHomePage';
import useIsMobile from './mobile/useIsMobile';

const DESIGN_WIDTH = 1920;
const MOBILE_BREAKPOINT = 768;

export default function FigmaHomePage() {
  const isMobile = useIsMobile(MOBILE_BREAKPOINT);
  const innerRef = useRef(null);
  const [scale, setScale] = useState(1);
  const [innerHeight, setInnerHeight] = useState(0);

  useEffect(() => {
    if (isMobile) return undefined;
    const onResize = () => {
      const vw = window.innerWidth;
      const next = vw < DESIGN_WIDTH ? vw / DESIGN_WIDTH : 1;
      setScale(next);
    };
    onResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [isMobile]);

  // Track the actual rendered height of the 1920-wide content so the
  // outer wrapper occupies the correct, scaled height (no extra
  // whitespace below the footer, no clipped content).
  useEffect(() => {
    if (isMobile) return undefined;
    if (!innerRef.current) return undefined;
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) setInnerHeight(e.contentRect.height);
    });
    ro.observe(innerRef.current);
    return () => ro.disconnect();
  }, [isMobile]);

  if (isMobile) {
    return <MobileHomePage />;
  }

  return (
    <div
      className={scaler.figmaScaler}
      style={{ height: innerHeight ? innerHeight * scale : 'auto' }}
    >
      <div
        ref={innerRef}
        className={scaler.figmaInner}
        style={{ transform: `scale(${scale})` }}
      >
        <Homepage1 />
      </div>
    </div>
  );
}
