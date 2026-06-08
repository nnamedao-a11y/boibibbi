/**
 * Dual-thumb range slider (Figma 1:1 — Catalog filter).
 *
 *   • Two overlapping native <input type="range"> for accessibility & drag.
 *   • Yellow fill between thumbs, gray rail outside.
 *   • Thumbs: 14 × 14 round, #FEAE00, no border.
 *   • Track : 2 px, #2C2D2A (inactive) / #FEAE00 (between thumbs).
 *   • onChange fires with {min, max} on every drag tick.
 *   • Snaps to integer step (default 1).
 */
import React, { useMemo } from 'react';
import styles from './RangeSlider.module.css';

export default function RangeSlider({
  min, max,            // hard bounds (number)
  value = [min, max],  // current [lo, hi]
  step = 1,
  onChange,            // (next: [lo, hi]) => void
  testId = 'range',
  wrapClassName = '',  // outer wrapper class (e.g. for margin-top)
}) {
  const [lo, hi] = value;
  const safeLo = Math.max(min, Math.min(lo ?? min, hi ?? max));
  const safeHi = Math.min(max, Math.max(hi ?? max, lo ?? min));
  const range = Math.max(1, max - min);
  const left   = ((safeLo - min) / range) * 100;
  const right  = 100 - ((safeHi - min) / range) * 100;

  const fillStyle = useMemo(() => ({ left: `${left}%`, right: `${right}%` }), [left, right]);

  const onLo = (e) => {
    const v = Math.min(Number(e.target.value), safeHi - step);
    onChange?.([v, safeHi]);
  };
  const onHi = (e) => {
    const v = Math.max(Number(e.target.value), safeLo + step);
    onChange?.([safeLo, v]);
  };

  return (
    <div className={wrapClassName}>
      <div className={styles.slider} data-testid={testId}>
        <div className={styles.rail} />
        <div className={styles.fill} style={fillStyle} />
        <input
          type="range"
          min={min} max={max} step={step}
          value={safeLo}
          onChange={onLo}
          className={`${styles.input} ${styles.inputLo}`}
          data-testid={`${testId}-min`}
          aria-label="Minimum"
        />
        <input
          type="range"
          min={min} max={max} step={step}
          value={safeHi}
          onChange={onHi}
          className={`${styles.input} ${styles.inputHi}`}
          data-testid={`${testId}-max`}
          aria-label="Maximum"
        />
      </div>
    </div>
  );
}
