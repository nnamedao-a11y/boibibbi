/**
 * GetInTouchModal — Premium "Get in touch" modal used across the public site
 * (homepage footer CTA, BibiPublicLayout footer CTA, dream-car hero, etc.).
 *
 * Design:
 *   • Dark glass card with thin orange accent border, matching Figma palette.
 *   • Mazzard / Inter font stack (matches the rest of the public site).
 *   • Yellow primary button (#FEAE00 → black text), exact same vibe as the
 *     header / footer CTAs.
 *
 * Behaviour:
 *   • Opened via a global Context — see `GetInTouchProvider` / `useGetInTouch`.
 *   • Submits to `POST /api/public/lead-requests` with the schema in the
 *     architecture spec. Captures landing page + UTM params automatically.
 *   • Two-state UX: form view → success view (after a successful submit).
 *   • Closes on backdrop click / ESC / "X" / "Close" buttons.
 *   • Locks page scroll while open.
 */
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import axios from "axios";
import { usePolicyModal } from "./PolicyModal";

const API_URL = process.env.REACT_APP_BACKEND_URL || "";

// Strict Bulgarian phone — must be "+359" followed by exactly 9 digits.
// Same regex used by CatalogConsultationBlock so the validation behaviour
// is identical across every public lead form.
const BG_PHONE_RE = /^\+359\d{9}$/;

// ─── Context ──────────────────────────────────────────────────────────────
const GetInTouchContext = createContext({
  open: () => {},
  close: () => {},
  isOpen: false,
});

export const useGetInTouch = () => useContext(GetInTouchContext);

export function GetInTouchProvider({ children }) {
  const [isOpen, setIsOpen] = useState(false);
  const [defaults, setDefaults] = useState(null);

  const open = useCallback((preset) => {
    setDefaults(preset || null);
    setIsOpen(true);
  }, []);

  const close = useCallback(() => setIsOpen(false), []);

  const ctx = useMemo(() => ({ open, close, isOpen }), [open, close, isOpen]);

  return (
    <GetInTouchContext.Provider value={ctx}>
      {children}
      {isOpen && <GetInTouchModal onClose={close} initial={defaults} />}
    </GetInTouchContext.Provider>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────
function captureUtm() {
  try {
    const sp = new URLSearchParams(window.location.search);
    const out = {};
    [
      "utm_source",
      "utm_medium",
      "utm_campaign",
      "utm_term",
      "utm_content",
      "gclid",
      "fbclid",
    ].forEach((k) => {
      const v = sp.get(k);
      if (v) out[k] = v;
    });
    return out;
  } catch {
    return {};
  }
}

const initialForm = {
  name: "",
  phone: "+359",
  email: "",
  car_preference: "",
  message: "",
};

// ─── Modal component ──────────────────────────────────────────────────────
function GetInTouchModal({ onClose, initial }) {
  const [form, setForm] = useState({ ...initialForm, ...(initial || {}) });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const { open: openPolicy } = usePolicyModal();

  // Per-launch overrides — let callers customise the modal heading
  // without forking the component (e.g. the Contacts page wants the
  // modal to read "Reach out to us" instead of "Get in touch").
  const titleOverride = initial?.title;
  const subtitleOverride = initial?.subtitle;

  const set = (k) => (e) =>
    setForm((s) => ({ ...s, [k]: e.target?.value ?? e }));

  // Bulgarian phone — keep the "+359" prefix locked, allow only digits
  // after it (max 9). Mirrors the change() handler in
  // CatalogConsultationBlock so the UX is consistent across every form.
  const onPhoneChange = (e) => {
    let v = e.target.value;
    if (!v.startsWith("+359")) {
      v = "+359" + v.replace(/^\+?3?5?9?/, "").replace(/\D/g, "");
    } else {
      v = "+359" + v.slice(4).replace(/\D/g, "").slice(0, 9);
    }
    setForm((s) => ({ ...s, phone: v }));
    if (error) setError("");
  };

  // Lock page scroll while modal is open
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const validate = () => {
    if (!form.name.trim() || form.name.trim().length < 2)
      return "Please enter your name.";
    if (!BG_PHONE_RE.test(form.phone.replace(/\s/g, "")))
      return "Phone must be +359 followed by 9 digits.";
    if (form.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.email.trim()))
      return "Please enter a valid email address.";
    return "";
  };

  const submit = async (e) => {
    e.preventDefault();
    const v = validate();
    if (v) {
      setError(v);
      return;
    }
    setError("");
    setSubmitting(true);
    try {
      const payload = {
        source: "website_get_in_touch",
        channel: "website",
        name: form.name.trim(),
        // Canonical E.164 — strip stray whitespace.
        phone: form.phone.replace(/\s/g, ""),
        email: form.email.trim() || null,
        car_preference: form.car_preference.trim() || null,
        message: form.message.trim() || null,
        landing_page:
          typeof window !== "undefined" ? window.location.href : null,
        utm: captureUtm(),
      };
      await axios.post(`${API_URL}/api/public/lead-requests`, payload);
      setSuccess(true);
    } catch (err) {
      const msg =
        err?.response?.data?.detail ||
        "Could not send your request. Please try again or call us directly.";
      setError(typeof msg === "string" ? msg : "Could not send your request.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="git-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="git-title"
      onMouseDown={(e) => {
        // Close only when clicking the backdrop, not the card itself.
        if (e.target === e.currentTarget) onClose();
      }}
      data-testid="get-in-touch-modal"
    >
      <div className="git-modal-card">
        <button
          type="button"
          className="git-modal-close"
          aria-label="Close"
          onClick={onClose}
          data-testid="get-in-touch-close"
        >
          ×
        </button>

        {!success ? (
          <>
            <header className="git-modal-header">
              <h2 id="git-title" className="git-modal-title">
                {titleOverride || "Get in touch"}
              </h2>
              <p className="git-modal-subtitle">
                {subtitleOverride ||
                  "Tell us what car you are looking for and our manager will contact you shortly."}
              </p>
            </header>

            <form className="git-modal-form" onSubmit={submit} noValidate>
              <div className="git-field">
                <label htmlFor="git-name" className="git-label">
                  Name<span className="git-req">*</span>
                </label>
                <input
                  id="git-name"
                  type="text"
                  className="git-input"
                  placeholder="Your name"
                  value={form.name}
                  onChange={set("name")}
                  autoComplete="name"
                  required
                  data-testid="git-input-name"
                />
              </div>

              <div className="git-field">
                <label htmlFor="git-phone" className="git-label">
                  Phone / Viber<span className="git-req">*</span>
                </label>
                <div className="git-input-with-icon">
                  <img
                    src="/about-us/emojione-v1-flag-for-bulgaria.svg"
                    alt=""
                    className="git-input-icon"
                    width={22}
                    height={16}
                  />
                  <input
                    id="git-phone"
                    type="tel"
                    inputMode="tel"
                    className="git-input git-input--with-icon"
                    placeholder="+359"
                    value={form.phone}
                    onChange={onPhoneChange}
                    autoComplete="tel"
                    maxLength={13}
                    required
                    data-testid="git-input-phone"
                  />
                </div>
              </div>

              <div className="git-field">
                <label htmlFor="git-email" className="git-label">
                  Email
                </label>
                <input
                  id="git-email"
                  type="email"
                  className="git-input"
                  placeholder="Email address"
                  value={form.email}
                  onChange={set("email")}
                  autoComplete="email"
                  data-testid="git-input-email"
                />
              </div>

              <div className="git-field">
                <label htmlFor="git-car" className="git-label">
                  Car preference
                </label>
                <input
                  id="git-car"
                  type="text"
                  className="git-input"
                  placeholder="BMW X5, Audi A6, Tesla Model 3..."
                  value={form.car_preference}
                  onChange={set("car_preference")}
                  data-testid="git-input-car"
                />
              </div>

              <div className="git-field">
                <label htmlFor="git-msg" className="git-label">
                  Additional wishes
                </label>
                <textarea
                  id="git-msg"
                  rows={3}
                  className="git-input git-textarea"
                  placeholder="Describe your preferences..."
                  value={form.message}
                  onChange={set("message")}
                  data-testid="git-input-message"
                />
              </div>

              {error && (
                <div className="git-error" role="alert" data-testid="git-error">
                  {error}
                </div>
              )}

              <button
                type="submit"
                className="git-submit"
                disabled={submitting}
                data-testid="git-submit"
              >
                {submitting ? "Sending..." : "Send request"}
              </button>

              <p className="git-disclaimer">
                By sending this request you agree to our{" "}
                <button
                  type="button"
                  className="git-policy-link"
                  onClick={() => openPolicy("privacy")}
                  data-testid="git-privacy-link"
                >
                  Privacy Policy
                </button>
                .
              </p>
            </form>
          </>
        ) : (
          <div className="git-success" data-testid="git-success">
            <div className="git-success-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M5 12.5l4.5 4.5L19 7.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <h2 className="git-success-title">Request sent successfully</h2>
            <p className="git-success-text">
              Our manager will contact you shortly.
            </p>
            <button
              type="button"
              className="git-success-btn"
              onClick={onClose}
              data-testid="git-success-close"
            >
              Close
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default GetInTouchModal;
