import React, { useEffect, useState } from 'react';
import VinSearchDropdown from '../../components/public/VinSearchDropdown';
import { useLang } from '../../i18n';

/**
 * MobileMenu — pixel-accurate Figma `Menu.svg` recreation.
 *
 * Typography spec (per Figma):
 *  • Top phones      → Mazzard Medium 12px, block 104×31
 *  • Search icon     → 19.41×19.41, color = placeholder grey
 *  • Search field    → Helvetica 14px (content area ~168×21)
 *  • Nav links       → Helvetica 24px (CATALOG / CALCULATOR / ABOUT US / CONTACTS)
 *  • LOG IN          → Helvetica Medium 14px
 *  • Lower phones    → Helvetica Medium 14px, yellow
 *  • "Our Address:"  → Helvetica Medium 14px
 *  • Address text    → Helvetica Medium 14px
 *  • "Social Media:" → Helvetica Medium 14px
 *  • Social icons    → 32×32 each
 *  • Language block  → 50×17 (ENG ▾)
 */

const NAV = [
  { tKey: 'crumbCatalog',    fallback: 'CATALOG',    href: '/catalog' },
  { tKey: 'crumbCalculator', fallback: 'CALCULATOR', href: '/calculator' },
  { tKey: 'crumbAbout',      fallback: 'ABOUT US',   href: '/about' },
  { tKey: 'crumbContacts',   fallback: 'CONTACTS',   href: '/contacts' },
];

const LANG_LABEL = { en: 'ENG', bg: 'BG' };

const HELVETICA = "'Helvetica Neue', Helvetica, Arial, sans-serif";
const MAZZARD = "'Mazzard M', 'Mazzard', system-ui, sans-serif";
const PLACEHOLDER_GREY = '#8A8A8A';

export default function MobileMenu({
  open,
  onClose,
  phones = ['+359 875 313 158', '+359 897 884 804'],
  addresses = [
    'Bulgaria, Sofia, Dragalevtsi, Vitosha Blvd. No. 230',
    'Bulgaria, Sofia, Bulgaria Blvd., No. 81',
  ],
  socials = {
    instagram: { enabled: true, url: 'https://instagram.com/' },
    facebook: { enabled: true, url: 'https://facebook.com/' },
    telegram: { enabled: true, url: 'https://t.me/' },
  },
  lang = 'en',
  onLangChange,
}) {
  // Detect customer auth via localStorage (same pattern Header1 uses).
  // We read it inside the component so the state refreshes when the menu
  // re-opens after a login flow elsewhere on the page.
  const [authState, setAuthState] = useState({ isAuthed: false, customerId: null, name: '' });
  useEffect(() => {
    if (!open) return; // only re-read when the drawer opens
    try {
      const raw = localStorage.getItem('customer_session');
      const parsed = raw ? JSON.parse(raw) : null;
      if (parsed?.customerId) {
        setAuthState({
          isAuthed: true,
          customerId: parsed.customerId,
          name: parsed.name || parsed.email || '',
        });
      } else {
        setAuthState({ isAuthed: false, customerId: null, name: '' });
      }
    } catch {
      setAuthState({ isAuthed: false, customerId: null, name: '' });
    }
  }, [open]);
  const { t } = useLang();
  // Lock body scroll while menu is open
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  /* ── VIN autocomplete state ───────────────────────────────────────────
   * Mirrors the typeahead behaviour used in the desktop header / hero so
   * users get the SAME suggestion UX inside the mobile slide-out menu:
   *   • As you type, /api/public/search/suggest returns car previews;
   *   • Clicking a result navigates to /cars/<VIN>.
   * The dropdown auto-shows once 2+ chars are entered (handled by
   * VinSearchDropdown internally via MIN_LEN). */
  const [vinQuery, setVinQuery] = useState('');
  const [vinDropdownOpen, setVinDropdownOpen] = useState(false);

  if (!open) return null;

  const langKey = (lang || 'en').toLowerCase().startsWith('bg') ? 'bg' : 'en';
  const langLabel = LANG_LABEL[langKey];

  return (
    <div
      role="dialog"
      aria-modal="true"
      data-testid="mobile-menu"
      className="fixed inset-0 z-[100] bg-black overflow-y-auto"
      style={{ fontFamily: HELVETICA }}
    >
      {/* ───────── Header (height 80) ───────── */}
      <div
        className="sticky top-0 bg-black flex items-end gap-3 px-4 pb-2 pt-9 box-border z-10"
        style={{ height: 80 }}
      >
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
        {/* Top phones — Figma: 104×31, Mazzard SemiBold 12px */}
        <div
          className="flex flex-col flex-1 ml-2 text-[#FEAE00]"
          style={{
            width: 104,
            minWidth: 104,
            height: 31,
            fontFamily: MAZZARD,
            fontWeight: 500, // closest weight to Mazzard SemiBold available
            fontSize: 12,
            lineHeight: '14px',
            letterSpacing: '0',
          }}
        >
          {phones[0] ? <span className="block whitespace-nowrap">{phones[0]}</span> : null}
          {phones[1] ? <span className="block whitespace-nowrap mt-[3px]">{phones[1]}</span> : null}
        </div>
        <button
          type="button"
          aria-label="Close menu"
          data-testid="mobile-menu-close"
          onClick={onClose}
          className="w-8 h-8 flex items-center justify-center text-white hover:text-[#FEAE00] transition-colors"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      {/* ───────── Body ───────── */}
      <div className="px-4 pt-5 pb-12 flex flex-col">
        {/* Search field — Helvetica 14, icon = placeholder grey, 19.41×19.41
         *  + LIVE VIN/lot typeahead dropdown (parity with desktop header). */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const q = vinQuery.trim();
            if (q) window.location.href = `/search/${encodeURIComponent(q)}`;
          }}
          className="mb-9 relative"
        >
          <label className="relative block">
            <span
              className="absolute top-1/2 -translate-y-1/2 pointer-events-none"
              style={{ left: 16, color: PLACEHOLDER_GREY, width: 19.41, height: 19.41 }}
            >
              <svg
                width="19.41"
                height="19.41"
                viewBox="0 0 20 20"
                fill="none"
                aria-hidden="true"
                style={{ display: 'block' }}
              >
                <circle cx="9" cy="9" r="6" stroke="currentColor" strokeWidth="1.5" />
                <path d="M14 14l3.5 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </span>
            <input
              type="search"
              name="q"
              value={vinQuery}
              onChange={(e) => {
                setVinQuery(e.target.value);
                setVinDropdownOpen(true);
              }}
              onFocus={() => {
                if (vinQuery.trim().length > 0) setVinDropdownOpen(true);
              }}
              autoComplete="off"
              placeholder={t('searchByVinPlaceholder') || 'Search by VIN or lot number'}
              data-testid="mobile-menu-search"
              className="w-full bg-transparent border border-[#555452] rounded text-white focus:outline-none focus:border-[#FEAE00]"
              style={{
                height: 56,
                paddingLeft: 48,
                paddingRight: 16,
                fontFamily: HELVETICA,
                fontSize: 14,
                fontWeight: 400,
                color: '#fff',
              }}
            />
          </label>

          {/* Live VIN/lot typeahead dropdown — same component used by the
           * desktop public header.  Renders absolutely below the input. */}
          <VinSearchDropdown
            query={vinQuery}
            open={vinDropdownOpen}
            onClose={() => setVinDropdownOpen(false)}
            onSelectQuery={(q) => setVinQuery(q)}
            align="left"
            width="100%"
            variant="dark"
          />
        </form>

        {/* ───────── Nav links — Helvetica 24px ───────── */}
        <nav className="flex flex-col gap-7 mb-12">
          {NAV.map((item) => {
            const label = t(item.tKey) || item.fallback;
            return (
              <a
                key={item.href}
                href={item.href}
                onClick={onClose}
                data-testid={`mobile-nav-${item.fallback.toLowerCase().replace(/\s+/g, '-')}`}
                className="block text-white hover:text-[#FEAE00] transition-colors uppercase"
                style={{
                  fontFamily: HELVETICA,
                  fontSize: 24,
                  fontWeight: 400,
                  lineHeight: 1,
                  letterSpacing: '0',
                }}
              >
                {label}
              </a>
            );
          })}
        </nav>

        {/* LOG IN / MY CABINET — Helvetica Medium 14px.
            Switches state + label based on the customer's auth.
            Authed → amber-filled with a green "online" dot + "MY CABINET — name"
            Guest  → standard amber LOG IN. */}
        <a
          href={authState.isAuthed && authState.customerId ? `/cabinet/${authState.customerId}` : '/cabinet/login'}
          onClick={onClose}
          data-testid="mobile-menu-login"
          data-authed={authState.isAuthed ? 'true' : 'false'}
          className="relative flex items-center justify-center w-full text-center bg-[#FEAE00] text-black uppercase rounded hover:brightness-110 transition gap-2"
          style={{
            height: 56,
            fontFamily: HELVETICA,
            fontSize: 14,
            fontWeight: 500,
            letterSpacing: '0.04em',
          }}
        >
          {authState.isAuthed && (
            <span
              aria-hidden="true"
              className="inline-block rounded-full bg-emerald-500 ring-2 ring-black/10"
              style={{ width: 8, height: 8 }}
              title="Signed in"
            />
          )}
          <span className="truncate max-w-[230px]">
            {authState.isAuthed
              ? (t('mobileMenuMyCabinet') || 'MY CABINET')
                + (authState.name ? ` — ${String(authState.name).split('@')[0].slice(0, 18).toUpperCase()}` : '')
              : (t('mobileMenuLogIn') || 'LOG IN')
            }
          </span>
        </a>

        {/* Lower phones — Helvetica Medium 14px, yellow */}
        <div
          className="mt-8 text-[#FEAE00]"
          style={{
            fontFamily: HELVETICA,
            fontSize: 14,
            fontWeight: 500,
            lineHeight: '20px',
          }}
        >
          {phones.map((p, i) => (
            <a
              key={i}
              href={`tel:${p.replace(/\s+/g, '')}`}
              className="block hover:opacity-80"
              style={i > 0 ? { marginTop: 4 } : undefined}
            >
              {p}
            </a>
          ))}
        </div>

        {/* Our Address — label 14px H Medium, text 14px H Medium */}
        {addresses && addresses.length > 0 ? (
          <div className="mt-8">
            <div
              className="text-white/90"
              style={{
                fontFamily: HELVETICA,
                fontSize: 14,
                fontWeight: 500,
                lineHeight: '20px',
                marginBottom: 12,
              }}
            >
              {t('mobileMenuOurAddress') || 'Our Address:'}
            </div>
            <div
              className="text-white"
              style={{
                fontFamily: HELVETICA,
                fontSize: 14,
                fontWeight: 500,
                lineHeight: '20px',
              }}
            >
              {addresses.map((a, i) => (
                <div key={i} style={i > 0 ? { marginTop: 4 } : undefined}>
                  {a}
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {/* Social Media — label 14px H Medium */}
        <div className="mt-8">
          <div
            className="text-white/90"
            style={{
              fontFamily: HELVETICA,
              fontSize: 14,
              fontWeight: 500,
              lineHeight: '20px',
              marginBottom: 12,
            }}
          >
            {t('mobileMenuSocialMedia') || 'Social Media:'}
          </div>
          <div className="flex items-center justify-between">
            {/* Social icons — 32×32 each */}
            <div className="flex items-center gap-4">
              {socials?.instagram?.enabled !== false ? (
                <a
                  href={socials?.instagram?.url || '#'}
                  target="_blank"
                  rel="noreferrer"
                  aria-label="Instagram"
                  className="rounded-full border border-[#555452] flex items-center justify-center text-white hover:text-[#FEAE00] hover:border-[#FEAE00] transition-colors"
                  style={{ width: 32, height: 32 }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <rect x="3" y="3" width="18" height="18" rx="5" stroke="currentColor" strokeWidth="1.7" />
                    <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="1.7" />
                    <circle cx="17.5" cy="6.5" r="1" fill="currentColor" />
                  </svg>
                </a>
              ) : null}
              {socials?.facebook?.enabled !== false ? (
                <a
                  href={socials?.facebook?.url || '#'}
                  target="_blank"
                  rel="noreferrer"
                  aria-label="Facebook"
                  className="rounded-full border border-[#555452] flex items-center justify-center text-white hover:text-[#FEAE00] hover:border-[#FEAE00] transition-colors"
                  style={{ width: 32, height: 32 }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <path d="M22 12a10 10 0 10-11.56 9.88v-6.99H7.9V12h2.54V9.8c0-2.51 1.5-3.9 3.78-3.9 1.1 0 2.24.2 2.24.2v2.46h-1.26c-1.24 0-1.63.77-1.63 1.56V12h2.78l-.44 2.89h-2.34v6.99A10 10 0 0022 12z" />
                  </svg>
                </a>
              ) : null}
              {socials?.telegram?.enabled !== false ? (
                <a
                  href={socials?.telegram?.url || '#'}
                  target="_blank"
                  rel="noreferrer"
                  aria-label="Telegram"
                  className="rounded-full border border-[#555452] flex items-center justify-center text-white hover:text-[#FEAE00] hover:border-[#FEAE00] transition-colors"
                  style={{ width: 32, height: 32 }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path
                      d="M21.45 4.16L2.79 11.43c-1.27.49-1.26 1.19-.23 1.5l4.79 1.5L18.43 7.4c.52-.32 1-.15.6.2L9.9 15.49l-.34 5.07c.5 0 .73-.23 1-.5l2.39-2.32 4.97 3.67c.91.5 1.57.24 1.81-.84l3.27-15.4c.34-1.32-.5-1.92-1.55-1.51z"
                      fill="currentColor"
                    />
                  </svg>
                </a>
              ) : null}
            </div>

            {/* ENG dropdown — block 50×17 */}
            <button
              type="button"
              onClick={() => onLangChange && onLangChange(langKey === 'en' ? 'bg' : 'en')}
              data-testid="mobile-menu-lang"
              className="flex items-center justify-between text-white hover:text-[#FEAE00] transition-colors"
              style={{
                width: 50,
                height: 17,
                padding: 0,
                fontFamily: HELVETICA,
                fontSize: 14,
                fontWeight: 500,
                lineHeight: '17px',
                letterSpacing: '0',
              }}
            >
              <span>{langLabel}</span>
              <svg width="10" height="6" viewBox="0 0 10 6" fill="none" aria-hidden="true">
                <path
                  d="M1 1l4 4 4-4"
                  stroke="currentColor"
                  strokeWidth="1.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
