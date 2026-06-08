/**
 * BIBI Cars — PolicyModal
 *
 * Premium dark-glass modal used to display the legal policies that admins
 * curate from the back-office (Privacy / Terms / Cookies / Conditions).
 *
 * Why a modal (and not a separate page)?
 *   • Footer links, "Get in touch" footer disclaimer, registration form
 *     consent text and the Cookie banner all need to surface the same
 *     legal text. A dedicated page would force a hard navigation away
 *     from the user's current task — a modal preserves context.
 *   • The content itself is admin-managed via the existing
 *     `PUT /api/admin/site-info` ⇢ `policies.{key}.{en|bg}` flow.
 *
 * Data source:
 *   GET /api/site-info/policy/{key}?lang=en|bg
 *     → { title: string, content: string (HTML) }
 *
 * Behaviour:
 *   • Opened via a global Context — see `PolicyModalProvider` /
 *     `usePolicyModal`.
 *   • Closes on backdrop click / ESC / "X" / "Close" button.
 *   • Locks page scroll while open.
 *   • Auto re-fetches on language change.
 */
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import axios from 'axios';
import { useLang } from '../../i18n';

const API_URL = process.env.REACT_APP_BACKEND_URL || '';

// Allowed policy keys (matches backend enum).
const POLICY_KEYS = ['privacy', 'terms', 'cookies', 'conditions'];

// Localized fallback titles (used while loading or on fetch failure).
const FALLBACK_TITLES = {
  en: {
    privacy: 'Privacy Policy',
    terms: 'Terms of Use',
    cookies: 'Cookies',
    conditions: 'Conditions',
  },
  bg: {
    privacy: 'Политика за поверителност',
    terms: 'Условия за ползване',
    cookies: 'Бисквитки',
    conditions: 'Общи условия',
  },
};

const UI_T = {
  en: {
    loading: 'Loading…',
    empty: 'Content unavailable.',
    close: 'Close',
  },
  bg: {
    loading: 'Зареждане…',
    empty: 'Съдържанието не е налично.',
    close: 'Затвори',
  },
};

// ─── Context ──────────────────────────────────────────────────────────────
const PolicyModalContext = createContext({
  open: () => {},
  close: () => {},
  isOpen: false,
  policyKey: null,
});

export const usePolicyModal = () => useContext(PolicyModalContext);

export function PolicyModalProvider({ children }) {
  const [policyKey, setPolicyKey] = useState(null);

  const open = useCallback((key) => {
    if (!POLICY_KEYS.includes(key)) {
      // eslint-disable-next-line no-console
      console.warn(`[PolicyModal] Unknown key "${key}" — ignored`);
      return;
    }
    setPolicyKey(key);
  }, []);

  const close = useCallback(() => setPolicyKey(null), []);

  const ctx = useMemo(
    () => ({ open, close, isOpen: !!policyKey, policyKey }),
    [open, close, policyKey],
  );

  return (
    <PolicyModalContext.Provider value={ctx}>
      {children}
      {policyKey && <PolicyModalView policyKey={policyKey} onClose={close} />}
    </PolicyModalContext.Provider>
  );
}

// ─── Modal view ───────────────────────────────────────────────────────────
function PolicyModalView({ policyKey, onClose }) {
  const { lang } = useLang();
  const ui = lang === 'bg' ? UI_T.bg : UI_T.en;
  const apiLang = lang === 'bg' ? 'bg' : 'en';
  const fallbackTitle =
    (FALLBACK_TITLES[apiLang] || FALLBACK_TITLES.en)[policyKey] || policyKey;

  const [policy, setPolicy] = useState(null);
  const [loading, setLoading] = useState(true);

  // Lock page scroll while the modal is open.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  // Close on ESC.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Fetch the policy text whenever key / language changes.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setPolicy(null);
    (async () => {
      try {
        const r = await axios.get(
          `${API_URL}/api/site-info/policy/${policyKey}`,
          { params: { lang: apiLang } },
        );
        if (!cancelled) setPolicy(r.data || null);
      } catch {
        if (!cancelled) setPolicy(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [policyKey, apiLang]);

  const title = (policy && policy.title) || fallbackTitle;
  const html =
    (policy && policy.content) ||
    (loading ? `<p>${ui.loading}</p>` : `<p>${ui.empty}</p>`);

  return (
    <div
      className="bibi-policy-modal__backdrop"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={title}
      data-testid="policy-modal"
    >
      <div
        className="bibi-policy-modal__card"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          className="bibi-policy-modal__close"
          aria-label={ui.close}
          onClick={onClose}
          data-testid="policy-modal-close"
        >
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
            <path
              d="M6 6L18 18M18 6L6 18"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
        </button>

        <header className="bibi-policy-modal__header">
          <span className="bibi-policy-modal__eyebrow">BIBI Cars</span>
          <h2
            className="bibi-policy-modal__title"
            data-testid="policy-modal-title"
          >
            {title}
          </h2>
        </header>

        <div className="bibi-policy-modal__body">
          <article
            className="bibi-policy-modal__prose"
            // Content is curated by admins via the back-office HTML editor —
            // it is intentionally rendered as HTML.
            dangerouslySetInnerHTML={{ __html: html }}
            data-testid="policy-modal-content"
          />
        </div>

        <footer className="bibi-policy-modal__footer">
          <button
            type="button"
            className="bibi-policy-modal__cta"
            onClick={onClose}
            data-testid="policy-modal-close-cta"
          >
            {ui.close}
          </button>
        </footer>
      </div>
    </div>
  );
}

export default PolicyModalProvider;
