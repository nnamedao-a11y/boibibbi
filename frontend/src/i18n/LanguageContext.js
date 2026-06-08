/**
 * Language Context
 *
 * Languages:
 *   • Admin / Manager / Team-lead cabinets only:  EN + BG + UK
 *   • EVERYTHING ELSE (public site, customer cabinet, auth pages):  EN + BG only
 *
 * Ukrainian (UK) is reserved strictly for the three back-office cabinets.
 * It is invisible in any UI outside of them and is auto-coerced to English
 * the moment the user navigates outside the back-office area.
 *
 * Default behaviour:
 *   • If user has a stored preference  → use it (unless UK is disallowed for
 *     the current route, in which case it is silently mapped to EN).
 *   • Else if browser locale starts with 'bg' → BG
 *   • Else → EN  (default for everyone, including Ukrainian browsers — they
 *     can still pick UK manually inside the admin cabinet).
 *
 * Persistence: localStorage["bibi_lang"].
 * Public toggle order on click: EN → BG → EN.
 */

import React, { createContext, useContext, useState, useEffect } from 'react';
import translations from './translations';

const LanguageContext = createContext(null);

// All available languages — EN first (public default), BG second, UK last
// (admin-only). `label` is the 3-letter UI label shown in the header
// switcher and the dropdown menu (Figma spec uses ENG/BG/UKR — 3 letters
// wide per Figma 31×17).
export const LANGUAGES = [
  { code: 'en', label: 'ENG', flag: '🇬🇧', name: 'English' },
  { code: 'bg', label: 'BG',  flag: '🇧🇬', name: 'Български' },
  { code: 'uk', label: 'UK',  flag: '🇺🇦', name: 'Українська' },
];

// Public site + customer cabinet only support EN + BG — UK is reserved for
// admin/manager/team-lead cabinets.
export const PUBLIC_LANGUAGES = LANGUAGES.filter((l) => l.code === 'en' || l.code === 'bg');
// Alias kept for explicit semantics in customer-cabinet UI.
export const CUSTOMER_LANGUAGES = PUBLIC_LANGUAGES;

const SUPPORTED = LANGUAGES.map((l) => l.code);
const PUBLIC_SUPPORTED = PUBLIC_LANGUAGES.map((l) => l.code);
const DEFAULT_LANG = 'en';

// Back-office (staff) cabinet routes where Ukrainian (UK) is allowed.
// Anything OUTSIDE of these prefixes (public site, customer cabinet, auth
// flows, etc.) must render in EN or BG only.
const STAFF_LANG_PREFIXES = ['/admin', '/manager', '/team'];

const isStaffRoute = (pathname) => {
  if (!pathname) return false;
  return STAFF_LANG_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(p + '/') || pathname.startsWith(p + '?'),
  );
};

// True wherever Ukrainian must NOT be active.
const isPublicOnlyLangRoute = (pathname) => !isStaffRoute(pathname);

/**
 * Return the user's preferred language from the browser (navigator.languages),
 * restricted to languages the public/customer-facing surface supports.
 * Ukrainian is NEVER auto-selected — the back-office cabinets require an
 * explicit click in their own switcher to opt in.
 */
const detectBrowserLang = () => {
  if (typeof navigator === 'undefined') return DEFAULT_LANG;
  const langs = navigator.languages && navigator.languages.length
    ? navigator.languages
    : [navigator.language || ''];
  for (const raw of langs) {
    if (!raw) continue;
    const code = raw.toLowerCase().slice(0, 2);
    if (PUBLIC_SUPPORTED.includes(code)) return code; // EN or BG
    // 'uk' / 'ua' browser locales are intentionally NOT honoured — the
    // public surface stays English by default.
  }
  return DEFAULT_LANG;
};

const normalizeLang = (raw) => {
  if (!raw) return null;
  if (raw === 'ua') return 'uk';
  return SUPPORTED.includes(raw) ? raw : null;
};

/**
 * Given the desired language and the active route, return the actually
 * usable language. UK requested outside of staff routes is downgraded to EN.
 */
const enforceLangForRoute = (desired, pathname) => {
  if (desired === 'uk' && !isStaffRoute(pathname)) return 'en';
  return desired;
};

export const LanguageProvider = ({ children }) => {
  const [lang, setLang] = useState(() => {
    if (typeof window === 'undefined') return DEFAULT_LANG;
    let stored = null;
    try { stored = localStorage.getItem('bibi_lang'); } catch {}
    let initial = normalizeLang(stored);
    if (!initial) {
      // First visit — pick from browser locale (EN or BG only).
      initial = detectBrowserLang();
    }
    // Route-aware coercion on first paint: UK only allowed on /admin/,
    // /manager/, /team/ routes; everywhere else falls back to EN.
    try {
      const path =
        typeof window !== 'undefined' && window.location ? window.location.pathname : '';
      initial = enforceLangForRoute(initial, path);
    } catch {}
    try { localStorage.setItem('bibi_lang', initial); } catch {}
    return initial;
  });

  // Save language preference to localStorage + reflect on <html lang="…">
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try { localStorage.setItem('bibi_lang', lang); } catch {}
    try { document.documentElement.setAttribute('lang', lang); } catch {}
    try { document.body && document.body.setAttribute('data-app-lang', lang); } catch {}
  }, [lang]);

  // Listen to route changes (pushState/replaceState/popstate) and, when the
  // user navigates OUTSIDE the staff cabinets while UK is active, downgrade
  // them to EN. We monkey-patch the History API so that any react-router
  // navigation (which uses pushState under the hood) emits a synthetic
  // 'bibi:locationchange' event.
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const guardRoute = () => {
      try {
        const path = window.location.pathname || '';
        if (!isStaffRoute(path)) {
          setLang((cur) => (cur === 'uk' ? 'en' : cur));
        }
      } catch {}
    };
    // Initial check after mount (covers SSR/hydration timing).
    guardRoute();
    // History API patch — fire a custom event on push/replace so SPA
    // navigation also triggers the route guard. Do NOT install the patch
    // twice if the LanguageProvider remounts.
    if (!window.__bibiHistoryPatched) {
      const origPush = window.history.pushState;
      const origReplace = window.history.replaceState;
      window.history.pushState = function (...args) {
        const r = origPush.apply(this, args);
        window.dispatchEvent(new Event('bibi:locationchange'));
        return r;
      };
      window.history.replaceState = function (...args) {
        const r = origReplace.apply(this, args);
        window.dispatchEvent(new Event('bibi:locationchange'));
        return r;
      };
      window.__bibiHistoryPatched = true;
    }
    window.addEventListener('popstate', guardRoute);
    window.addEventListener('bibi:locationchange', guardRoute);
    return () => {
      window.removeEventListener('popstate', guardRoute);
      window.removeEventListener('bibi:locationchange', guardRoute);
    };
  }, []);

  // Translation function — current lang first, then EN, then BG, then UK,
  // then the key itself as a last resort.
  const t = (key) => (
    translations[lang]?.[key]
    ?? translations.en?.[key]
    ?? translations.bg?.[key]
    ?? translations.uk?.[key]
    ?? key
  );

  // Toggle between EN ↔ BG (public-friendly cycle). Used by the public
  // header / mobile menu where only EN+BG are exposed.
  const toggleLang = () => {
    const idx = PUBLIC_LANGUAGES.findIndex((l) => l.code === lang);
    const next = PUBLIC_LANGUAGES[(idx + 1) % PUBLIC_LANGUAGES.length];
    setLang(next.code);
  };

  // Set specific language (ignores unknown codes; aliases 'ua' → 'uk').
  // If the active route is NOT a staff cabinet (admin/manager/team), UK is
  // silently downgraded to EN — the public + customer surface is EN/BG only.
  const changeLang = (newLang) => {
    const normalized = normalizeLang(newLang);
    if (!normalized) return;
    try {
      const path =
        typeof window !== 'undefined' && window.location ? window.location.pathname : '';
      setLang(enforceLangForRoute(normalized, path));
    } catch {
      setLang(normalized === 'uk' ? 'en' : normalized);
    }
  };

  return (
    <LanguageContext.Provider
      value={{
        lang,
        setLang: changeLang,
        t,
        toggleLang,
        changeLang,
        languages: LANGUAGES,
        publicLanguages: PUBLIC_LANGUAGES,
        customerLanguages: CUSTOMER_LANGUAGES,
      }}
    >
      {children}
    </LanguageContext.Provider>
  );
};

export const useLang = () => {
  const context = useContext(LanguageContext);
  if (!context) {
    return {
      lang: DEFAULT_LANG,
      setLang: () => {},
      t: (key) => translations[DEFAULT_LANG]?.[key] || key,
      toggleLang: () => {},
      changeLang: () => {},
      languages: LANGUAGES,
      publicLanguages: PUBLIC_LANGUAGES,
      customerLanguages: CUSTOMER_LANGUAGES,
    };
  }
  return context;
};

export default LanguageContext;
