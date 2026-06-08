/**
 * RangeStepSelect — combo input that pairs the existing free-form text
 * input with a dropdown of preset values (used for Year / Price / Mileage
 * "From" and "To" inputs in the catalog filter).
 *
 * Behaviour:
 *   • The visible field is still a fully typeable text input — users can
 *     enter any numeric value, the slider keeps mirroring the range, and
 *     the backend filter uses the typed number verbatim.
 *   • A small ▾ chevron on the right opens a popover with predefined
 *     "common" values (e.g. 2025, 2024 … for Year; 5k, 10k, 25k …
 *     for Price). Clicking a value fills the input.
 *   • The popover mirrors the open-state styling of CustomDropdown so the
 *     overall catalog filter UI stays visually consistent with the rest
 *     of the page (Brand dropdown on Welcome, etc.).
 */
import React, { useState, useRef, useEffect, useCallback } from 'react';
import styles from './RangeStepSelect.module.css';

export default function RangeStepSelect({
  value,
  onChange,                // (string) => void — fires for both typed and picked values
  placeholder,
  steps = [],              // [{ label, value }]
  formatValue,             // optional: (raw) => display string for the input
  emptyLabel = '— Clear —',
  inputMode = 'numeric',
  testId = 'range-step-select',
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  /* Click-outside / Escape closes the popover. */
  const handleDocClick = useCallback((e) => {
    if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
  }, []);
  const handleKey = useCallback((e) => {
    if (e.key === 'Escape') setOpen(false);
  }, []);
  useEffect(() => {
    if (!open) return undefined;
    document.addEventListener('mousedown', handleDocClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleDocClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [open, handleDocClick, handleKey]);

  const display = value && formatValue ? formatValue(value) : (value ?? '');

  return (
    <div
      ref={wrapRef}
      className={`${styles.wrap} ${open ? styles.wrapOpen : ''}`}
      data-testid={testId}
    >
      <input
        type="text"
        inputMode={inputMode}
        className={styles.input}
        placeholder={placeholder}
        value={display}
        onChange={(e) => onChange(e.target.value.replace(/[^0-9]/g, ''))}
        data-testid={`${testId}-input`}
      />
      <button
        type="button"
        className={`${styles.chevron} ${open ? styles.chevronOpen : ''}`}
        onClick={() => setOpen((o) => !o)}
        aria-label={open ? 'Close options' : 'Open options'}
        aria-expanded={open}
        data-testid={`${testId}-toggle`}
      >
        <svg width="11" height="7" viewBox="0 0 11 7" fill="none" aria-hidden="true">
          <path d="M1 1l4.5 4.5L10 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div className={styles.menu} role="listbox" data-testid={`${testId}-menu`}>
          <button
            type="button"
            className={styles.option}
            onClick={() => { onChange(''); setOpen(false); }}
            data-testid={`${testId}-option-empty`}
          >
            <span className={styles.optionLabel}>{emptyLabel}</span>
          </button>
          {steps.map((s) => {
            const val = String(s.value);
            const isActive = String(value || '') === val;
            return (
              <button
                type="button"
                key={val}
                className={`${styles.option} ${isActive ? styles.optionActive : ''}`}
                onClick={() => { onChange(val); setOpen(false); }}
                data-testid={`${testId}-option-${val}`}
              >
                <span className={styles.optionLabel}>{s.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
