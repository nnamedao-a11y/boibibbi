/**
 * SortDropdown — Figma 1:1 "SORT ±" menu.
 *
 * States:
 *   collapsed → "SORT +" (yellow underlined)  →  click → expands
 *   expanded  → "SORT −" (yellow underlined)  +  menu panel below
 *
 * Geometry (per Figma annotation):
 *   • menu starts 8 px below SORT button
 *   • inner padding 12 px (top/bottom/left/right)
 *   • row vertical padding: 12 px above & below text
 *   • horizontal separator (#3A3A3A, 1px) between logical groups
 *   • checkmark icon (yellow) 12×12, 8 px gap to text label
 *   • selected text  : #D6D6D6 (light)
 *   • unselected text: #949494 (grey)
 *   • font           : Mazzard H, 14px, weight 400, capitalize
 *
 * Sort keys (matches backend /api/public/vehicles?sort=...):
 *   popular | newest | oldest | most_expensive | cheapest |
 *   greatest_mileage | lowest_mileage
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useLang } from '../../../i18n';
import styles from './SortDropdown.module.css';

// English fallback labels also used as i18n translation keys via `tKey`.
export const SORT_OPTIONS = [
  { group: 0, key: 'popular',          label: 'Popular',          tKey: 'sortPopular' },
  { group: 1, key: 'newest',           label: 'Newest',           tKey: 'sortNewest' },
  { group: 1, key: 'oldest',           label: 'Oldest',           tKey: 'sortOldest' },
  { group: 2, key: 'most_expensive',   label: 'Most expensive',   tKey: 'sortMostExpensive' },
  { group: 2, key: 'cheapest',         label: 'Cheapest',         tKey: 'sortCheapest' },
  { group: 3, key: 'greatest_mileage', label: 'Greatest mileage', tKey: 'sortGreatestMileage' },
  { group: 3, key: 'lowest_mileage',   label: 'Lowest mileage',   tKey: 'sortLowestMileage' },
];

export const SortDropdown = ({ value = 'popular', onChange }) => {
  const { t } = useLang();
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const localizedOptions = useMemo(
    () => SORT_OPTIONS.map((o) => ({ ...o, label: t(o.tKey) || o.label })),
    [t]
  );

  // Close on outside click / Escape
  useEffect(() => {
    if (!open) return undefined;
    const onDocClick = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown',   onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown',   onKey);
    };
  }, [open]);

  const select = (k) => {
    onChange?.(k);
    setOpen(false);
  };

  return (
    <div className={styles.root} ref={rootRef}>
      <button
        type="button"
        className={styles.toggle}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="listbox"
        data-testid="catalog-sort"
      >
        {t('sortLabel') || 'SORT'}&nbsp;{open ? '−' : '+'}
      </button>

      {open && (
        <ul
          className={styles.menu}
          role="listbox"
          aria-label="Sort order"
          data-testid="catalog-sort-menu"
        >
          {localizedOptions.map((opt, idx) => {
            const isSelected = opt.key === value;
            const prev = localizedOptions[idx - 1];
            const showDivider = prev && prev.group !== opt.group;
            return (
              <React.Fragment key={opt.key}>
                {showDivider && <li className={styles.divider} aria-hidden="true" />}
                <li
                  className={`${styles.item} ${isSelected ? styles.itemSelected : ''}`}
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => select(opt.key)}
                  data-testid={`sort-option-${opt.key}`}
                >
                  <span className={styles.check} aria-hidden="true">
                    {isSelected && (
                      <svg viewBox="0 0 12 12" width="12" height="12" fill="none">
                        <path
                          d="M2 6.5L4.8 9 10 3.2"
                          stroke="currentColor"
                          strokeWidth="1.6"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    )}
                  </span>
                  <span className={styles.label}>{opt.label}</span>
                </li>
              </React.Fragment>
            );
          })}
        </ul>
      )}
    </div>
  );
};

export default SortDropdown;
