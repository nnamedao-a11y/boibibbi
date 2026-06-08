/**
 * SearchForCarsHeading — "SEARCH FOR CARS / FROM AMERICA AND KOREA"
 *
 * Per-character left-to-right reveal animation matching the hero
 * "FROM AUCTION TO KEYS" headline 1-to-1:
 *   • Each character is wrapped in a .charMask (overflow:hidden) +
 *     .charInner (translateY 100% → 0, opacity 0 → 1, ease-out-quint)
 *   • Stagger 32 ms per character — strict left-to-right cascade
 *   • Second line starts 220 ms after the first one finishes its first
 *     few characters, so the two lines flow into each other.
 *   • Animation only runs once the section scrolls into view
 *     (IntersectionObserver, honours prefers-reduced-motion).
 */
import React from 'react';
import SplitText from '../SplitText';
import useInView from '../useInView';
import styles from './SearchForCarsHeading.module.css';

export default function SearchForCarsHeading() {
  const [ref, inView] = useInView({ threshold: 0.25 });

  return (
    <section
      ref={ref}
      data-testid="search-for-cars-heading"
      className={[styles.heading, inView ? 'is-visible' : ''].join(' ')}
    >
      <div className={styles.headingInner}>
        <SplitText
          as="h2"
          className={styles.lineOrange}
          text="Search for cars"
          baseDelay={120}
          stepMs={32}
          charClass={styles.charMask}
          innerClass={styles.charInner}
        />
        <SplitText
          as="h2"
          className={styles.lineWhite}
          text="from America and Korea"
          baseDelay={520}
          stepMs={28}
          charClass={styles.charMask}
          innerClass={styles.charInner}
        />
      </div>
    </section>
  );
}
