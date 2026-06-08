/**
 * CustomDropdown — Figma 1:1.
 *
 *  Two visual variants:
 *
 *  ▸ variant="checkmark" (Brand dropdown)
 *      Selected options show only a yellow ✓ on the left, no square.
 *
 *  ▸ variant="checkbox"  (Model dropdown)
 *      Selected options show a 12×12 yellow-bordered square with a
 *      yellow ✓ inside. Unselected options keep an empty 12×12
 *      grey-bordered square. Adds an optional “Clear selection”
 *      action button at the bottom of the menu.
 *
 *  Closed-state trigger : 44 px, 1 px #555452, radius 4, padding 0 16.
 *  Open-state trigger   : whole row turns into a search <input>; chevron
 *                         is hidden (the trigger doubles as the search
 *                         field, matching Figma exactly).
 *  Menu (popover)       : top = trigger-bottom + 9 px, same width, bg
 *                         #222220, border 1 #555452, radius 4, max-height
 *                         ≈ 290 px (scrollable). Empty-state menu
 *                         collapses to ≈ 40 px showing centred message.
 *  Option row           : 30 px tall, padding 0 16 px, gap 16 px,
 *                         Mazzard H 14 Regular. Selected #D6D6D6,
 *                         unselected #949494, hover bg rgba(255,255,255,0.04).
 *  Bottom action area   : 40 px tall, separator line #555452, centred
 *                         yellow “Clear selection” button when at least
 *                         one option is selected (multi only).
 */
import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import styles from './CustomDropdown.module.css';

export default function CustomDropdown({
  value,
  options,
  placeholder = 'Select',
  disabledPlaceholder,           // text shown when disabled (e.g. "Select brand first")
  emptyText = 'No results',      // shown when search yields no options
  onChange,
  disabled = false,
  multi = false,
  searchable,
  variant = 'checkmark',         // 'checkmark' | 'checkbox'
  clearLabel,                    // e.g. "Clear selection". If set + multi → shows bottom action.
  testId = 'dropdown',
}) {
  const isSearchable = searchable ?? multi;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const ref = useRef(null);
  const inputRef = useRef(null);

  const opts = useMemo(() => (
    (options || []).map((o) => {
      if (typeof o === 'string') return { label: o, value: o, available: true };
      // Accept either {name, count, available} or {label, value, available}
      const label = o.label ?? o.name;
      const val   = o.value ?? o.name ?? label;
      return {
        label,
        value: val,
        available: o.available !== false,
        count: o.count,
      };
    })
  ), [options]);

  /* selectedValues — always an array for unified logic. */
  const selectedValues = useMemo(() => {
    if (multi) return Array.isArray(value) ? value : [];
    return value ? [value] : [];
  }, [value, multi]);

  const selectedOpts = useMemo(
    () => opts.filter((o) => selectedValues.includes(o.value)),
    [opts, selectedValues],
  );

  /* Filter visible options by search query. */
  const visibleOpts = useMemo(() => {
    if (!query) return opts;
    const q = query.toLowerCase();
    return opts.filter((o) => String(o.label).toLowerCase().includes(q));
  }, [opts, query]);

  /* Outside click / Escape — close. */
  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e) => {
      if (ref.current && !ref.current.contains(e.target)) {
        setOpen(false);
        setQuery('');
      }
    };
    const onKey = (e) => {
      if (e.key === 'Escape') {
        setOpen(false);
        setQuery('');
      }
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  /* Force-close when component becomes disabled. */
  useEffect(() => {
    if (disabled && open) {
      setOpen(false);
      setQuery('');
    }
  }, [disabled, open]);

  /* Auto-focus the in-place search input on open. */
  useEffect(() => {
    if (open && isSearchable && inputRef.current) {
      const t = setTimeout(() => inputRef.current?.focus(), 30);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [open, isSearchable]);

  const handlePick = useCallback((nextVal) => {
    if (multi) {
      const set = new Set(selectedValues);
      if (set.has(nextVal)) set.delete(nextVal); else set.add(nextVal);
      onChange?.(Array.from(set));
      /* keep menu open for multi-select */
    } else {
      onChange?.(nextVal);
      setOpen(false);
      setQuery('');
    }
  }, [multi, selectedValues, onChange]);

  const handleClear = useCallback(() => {
    if (multi) onChange?.([]);
    else onChange?.('');
  }, [multi, onChange]);

  /* Closed-state trigger label. */
  const triggerText = (() => {
    if (disabled && disabledPlaceholder) return disabledPlaceholder;
    if (multi) {
      if (!selectedOpts.length) return placeholder;
      if (selectedOpts.length === 1) return selectedOpts[0].label;
      return `${selectedOpts[0].label} +${selectedOpts.length - 1}`;
    }
    return selectedOpts[0]?.label || placeholder;
  })();
  const isPlaceholder = !selectedOpts.length;

  const showClearAction = multi && !!clearLabel && selectedValues.length > 0;

  return (
    <div
      className={`${styles.wrap} ${disabled ? styles.disabled : ''}`}
      ref={ref}
      data-testid={testId}
    >
      {open && isSearchable && !disabled ? (
        <div className={`${styles.trigger} ${styles.triggerOpen}`}>
          <input
            ref={inputRef}
            type="text"
            className={styles.searchInput}
            placeholder={placeholder}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            data-testid={`${testId}-search`}
            autoComplete="off"
            spellCheck="false"
          />
        </div>
      ) : (
        <button
          type="button"
          className={`${styles.trigger} ${open ? styles.triggerOpen : ''}`}
          onClick={() => !disabled && setOpen((o) => !o)}
          disabled={disabled}
          aria-expanded={open}
          aria-haspopup="listbox"
          data-testid={`${testId}-trigger`}
        >
          <span className={isPlaceholder ? styles.placeholder : styles.value}>
            {triggerText}
          </span>
          {!open && (
            <img
              src="/figma/icons/chevron-down-grey.svg"
              alt=""
              className={styles.chevron}
              width={17}
              height={17}
            />
          )}
        </button>
      )}

      {open && !disabled && (
        <div className={styles.menu} role="listbox" data-testid={`${testId}-menu`}>
          {visibleOpts.length === 0 ? (
            <div className={styles.emptyState} data-testid={`${testId}-empty`}>
              {emptyText}
            </div>
          ) : (
            <>
              <div className={styles.optionsScroll}>
                {!multi && (
                  <button
                    type="button"
                    className={`${styles.option} ${!selectedValues.length ? styles.optionSelected : ''}`}
                    onClick={() => handlePick('')}
                    data-testid={`${testId}-opt-all`}
                  >
                    <SelectionIndicator
                      variant={variant}
                      checked={!selectedValues.length}
                    />
                    <span className={styles.optionLabel}>{placeholder}</span>
                  </button>
                )}
                {visibleOpts.map((o) => {
                  const checked = selectedValues.includes(o.value);
                  return (
                    <button
                      key={o.value}
                      type="button"
                      className={`${styles.option} ${checked ? styles.optionSelected : ''} ${!o.available ? styles.optionDimmed : ''}`}
                      onClick={() => handlePick(o.value)}
                      data-testid={`${testId}-opt-${String(o.value).toLowerCase().replace(/\s+/g,'-')}`}
                      title={!o.available ? 'Currently no listings for this option' : undefined}
                    >
                      <SelectionIndicator variant={variant} checked={checked} />
                      <span className={styles.optionLabel}>{o.label}</span>
                    </button>
                  );
                })}
              </div>
              {showClearAction && (
                <div className={styles.actionsRow}>
                  <button
                    type="button"
                    className={styles.clearBtn}
                    onClick={handleClear}
                    data-testid={`${testId}-clear`}
                  >
                    {clearLabel}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

/* ─── Selection indicator (left column of each row) ───────────────
 *  variant="checkmark"  → just a 9×6 yellow ✓ when selected, nothing otherwise.
 *  variant="checkbox"   → 12×12 square. Unselected: empty grey border.
 *                          Selected:  yellow border + yellow ✓ inside.
 */
function SelectionIndicator({ variant, checked }) {
  if (variant === 'checkbox') {
    return (
      <span className={`${styles.checkbox} ${checked ? styles.checkboxOn : ''}`} aria-hidden="true">
        {checked && (
          <svg width="9" height="6" viewBox="0 0 9 6" fill="none">
            <path
              d="M8 0.5L2.4 5 0.5 3.47"
              stroke="#FEAE00"
              strokeWidth="1.2"
              strokeLinecap="square"
              strokeLinejoin="round"
            />
          </svg>
        )}
      </span>
    );
  }
  /* checkmark variant */
  return (
    <span className={styles.checkSlot} aria-hidden="true">
      {checked && (
        <svg width="9" height="6" viewBox="0 0 9 6" fill="none">
          <path
            d="M8 0.5L2.4 5 0.5 3.47"
            stroke="#FEAE00"
            strokeWidth="1.2"
            strokeLinecap="square"
            strokeLinejoin="round"
          />
        </svg>
      )}
    </span>
  );
}
