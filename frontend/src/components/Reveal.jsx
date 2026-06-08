/**
 * Reveal — sister component to ``<AnimatedHeading>`` for non-text elements.
 * -----------------------------------------------------------------------------
 *
 * The hero block animates per-character via ``<AnimatedHeading>``. This
 * component applies the SAME visual language (ease-out-quint slide-up with a
 * subtle left→right cascade) to anything that's NOT a string: card grids,
 * logo rows, calculator panels, photo galleries.
 *
 * Use cases:
 *   • ``variant="fade-up"``   — single block, opacity + slight slide-up.
 *   • ``variant="slide-left"`` — block slides in from the left (use for
 *                                two-line subtitles, lists, paragraph stacks).
 *   • ``variant="stagger"``   — wraps children; each child animates
 *                               sequentially left→right with ``stepMs`` ms gap.
 *
 * Trigger:
 *   Reveal fires ONCE when its host element first scrolls into the viewport
 *   (IntersectionObserver). Honours ``prefers-reduced-motion``.
 *
 * Props:
 *   as           default "div"        — tag rendered as the wrapper
 *   variant      "fade-up" | "slide-left" | "stagger"   (default "fade-up")
 *   stepMs       default 80           — ms gap between staggered children
 *   baseDelay    default 0            — ms before the first child starts
 *   durationMs   default 760
 *   threshold    default 0.18
 *   rootMargin   default "0px 0px -8% 0px"
 *   once         default true
 *   className                          — passthrough class on the wrapper
 *   children     React nodes
 */
import React, { Children, useEffect, useMemo, useRef, useState } from "react";
import styles from "./Reveal.module.css";

const Reveal = ({
  as: Tag = "div",
  variant = "fade-up",
  stepMs = 80,
  baseDelay = 0,
  durationMs = 760,
  threshold = 0.18,
  rootMargin = "0px 0px -8% 0px",
  once = true,
  className = "",
  style,
  children,
  ...rest
}) => {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);

  const reducedMotion = useMemo(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  }, []);

  useEffect(() => {
    if (reducedMotion) {
      setVisible(true);
      return undefined;
    }
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return undefined;
    }

    const rect = el.getBoundingClientRect();
    const inViewAtMount =
      rect.top < (window.innerHeight || 0) && rect.bottom > 0;
    if (inViewAtMount) {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setVisible(true));
      });
      return undefined;
    }

    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setVisible(true);
            if (once) io.disconnect();
          }
        });
      },
      { threshold, rootMargin }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [reducedMotion, threshold, rootMargin, once]);

  const wrapperCls = [
    styles.reveal,
    styles[`variant_${variant}`] || "",
    visible ? styles.isVisible : "",
    className,
  ].filter(Boolean).join(" ");

  if (variant === "stagger") {
    const items = Children.toArray(children);
    return (
      <Tag ref={ref} className={wrapperCls} style={style} {...rest}>
        {items.map((child, idx) => (
          <span
            key={idx}
            className={styles.staggerItem}
            style={{
              animationDelay: `${baseDelay + idx * stepMs}ms`,
              animationDuration: `${durationMs}ms`,
            }}
          >
            {child}
          </span>
        ))}
      </Tag>
    );
  }

  // fade-up / slide-left: single block
  return (
    <Tag
      ref={ref}
      className={wrapperCls}
      style={{
        ...style,
        animationDelay: `${baseDelay}ms`,
        animationDuration: `${durationMs}ms`,
      }}
      {...rest}
    >
      {children}
    </Tag>
  );
};

export default Reveal;
