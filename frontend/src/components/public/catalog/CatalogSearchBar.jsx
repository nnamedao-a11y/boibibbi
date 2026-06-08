/**
 * CatalogSearchBar — Figma 1:1 search bar that lives INSIDE the
 * `/catalog` page next to the CATALOG heading.
 *
 *   • Width 459 × 40, radius 8 px (matches global header search).
 *   • Magnifier 24 × 24 at 9 px left padding.
 *   • Mazzard H Regular 14 px, placeholder #5E5E5E.
 *   • Real backend search via the existing `<VinSearchDropdown />` —
 *     hits `/api/public/search/suggest?q=…` and navigates to the
 *     vehicle detail page on click.
 */
import React, { useEffect, useRef, useState } from 'react';
import VinSearchDropdown from '../VinSearchDropdown';
import { useLang } from '../../../i18n';
import styles from './CatalogSearchBar.module.css';

export const CatalogSearchBar = ({ className = '' }) => {
  const { t } = useLang();
  const [query, setQuery] = useState('');
  const [open,  setOpen]  = useState(false);
  const rootRef = useRef(null);

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

  return (
    <form
      ref={rootRef}
      className={`${styles.root} ${className}`}
      role="search"
      onSubmit={(e) => e.preventDefault()}
      data-testid="catalog-search-bar"
    >
      <img
        className={styles.icon}
        width={24}
        height={24}
        alt=""
        src="/figma/boxicons-search.svg"
      />
      <input
        className={styles.input}
        type="text"
        placeholder={t('searchByVinPlaceholder') || 'Search by VIN or lot number'}
        value={query}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        autoComplete="off"
        data-testid="catalog-search-input"
      />
      <VinSearchDropdown
        query={query}
        open={open}
        onClose={() => setOpen(false)}
        align="left"
        variant="dark"
        width="459px"
      />
    </form>
  );
};

export default CatalogSearchBar;
