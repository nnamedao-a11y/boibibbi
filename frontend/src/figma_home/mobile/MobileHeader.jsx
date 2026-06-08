import React from 'react';
import { useLang } from '../../i18n';

/**
 * MobileHeader — pixel-accurate Figma mobile header (360×80).
 *
 * Layout: Logo (102×34) · phones block (104×31, Mazzard SemiBold 12px) · hamburger (32×32).
 */
export default function MobileHeader({
  phones = ['+359 875 313 158', '+359 897 884 804'],
  onMenuOpen,
}) {
  const { t } = useLang();
  return (
    <header
      className="sticky top-0 z-30 w-full bg-black flex items-end gap-3 px-4 pb-2 pt-9 box-border"
      style={{ height: 80 }}
    >
      {/* Logo */}
      <a
        href="/"
        aria-label="BIBI Cars"
        className="flex items-center"
        style={{ width: 102, height: 34, paddingRight: '5.4px' }}
      >
        <img
          src="/mobile/BiBi-logo-02-1.svg"
          alt="BIBI Cars"
          width={97}
          height={34}
          style={{ height: 34, width: 'auto' }}
        />
      </a>

      {/* Phones — 104×31, Mazzard (Medium → closest to SemiBold available) 12px */}
      <div
        className="flex flex-col flex-1 ml-2 text-[#FEAE00]"
        style={{
          width: 104,
          minWidth: 104,
          height: 31,
          fontFamily: "'Mazzard M', 'Mazzard', system-ui, sans-serif",
          fontWeight: 500,
          fontSize: 12,
          lineHeight: '14px',
          letterSpacing: '0',
        }}
      >
        {phones[0] ? <span className="block whitespace-nowrap">{phones[0]}</span> : null}
        {phones[1] ? (
          <span className="block whitespace-nowrap" style={{ marginTop: 3 }}>
            {phones[1]}
          </span>
        ) : null}
      </div>

      {/* Hamburger */}
      <button
        type="button"
        aria-label={t('mobileMenuOpen') || 'Open menu'}
        data-testid="mobile-menu-open"
        onClick={onMenuOpen}
        className="w-8 h-8 flex items-center justify-center text-[#FEAE00] hover:opacity-80 transition-opacity"
      >
        <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <path
            d="M5 9.5h22M5 16h22M5 22.5h22"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
          />
        </svg>
      </button>
    </header>
  );
}
