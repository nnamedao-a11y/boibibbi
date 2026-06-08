/**
 * Customer Auth — direct Google Sign-In via Google Identity Services (GIS).
 *
 * Flow:
 *   1. Page loads → fetches the Google Client ID from /api/auth/google-client-id
 *      (configured in Admin → Integrations → Google Sign-In).
 *   2. Loads https://accounts.google.com/gsi/client once, initialises GIS with
 *      the Client ID, renders a Google-branded button (or falls back to our
 *      own styled button that triggers google.accounts.id.prompt()).
 *   3. User chooses account in the Google popup → GIS returns an ID token.
 *   4. We POST { credential } to /api/customer-auth/google/verify, which
 *      validates the token server-side and returns our customer + sessionToken.
 *
 * No third-party intermediate screen. No extra redirect.
 */

import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  createContext,
  useContext,
} from 'react';
import { useNavigate, useLocation, Link, Navigate } from 'react-router-dom';
import axios from 'axios';
import { useLang } from '../../i18n';
import { useAuth } from '../../App';
import BibiLogo from '../../components/public/BibiLogo';
import { usePolicyModal } from '../../components/public/PolicyModal';
import {
  User,
  Lock,
  Envelope,
  Eye,
  EyeSlash,
  ArrowLeft,
  Warning,
  SpinnerGap,
} from '@phosphor-icons/react';

const API_URL = process.env.REACT_APP_BACKEND_URL || '';
const GSI_SRC = 'https://accounts.google.com/gsi/client';

// ----------------------------------------------------------------------------
// Inline EN/BG strings — the cabinet auth screen must ONLY speak EN/BG, never
// Ukrainian (admin) even if the user toggled lang=uk elsewhere.
// ----------------------------------------------------------------------------
const STR = {
  en: {
    welcomeBack: 'Sign In',
    createAccount: 'Create Your Account',
    signInSubtitle: 'Access your BIBI Cars cabinet.',
    signUpSubtitle: 'Join BIBI Cars and unlock your personal cabinet.',
    tabSignIn: 'Sign In',
    tabSignUp: 'Sign Up',
    continueWithGoogle: 'Continue with Google',
    or: 'or continue with email',
    yourName: 'Full Name',
    namePlaceholder: 'John Doe',
    emailLabel: 'Email address',
    emailPlaceholder: 'your@email.com',
    password: 'Password',
    confirmPassword: 'Confirm Password',
    confirmPasswordPlaceholder: 'Repeat your password',
    forgotPassword: 'Forgot password?',
    passwordReqTitle: 'Password must contain:',
    passwordReqLength: 'At least 6 characters',
    passwordReqUpper: 'One uppercase letter (A-Z)',
    passwordReqLower: 'One lowercase letter (a-z)',
    passwordsDontMatch: 'Passwords do not match.',
    passwordTooWeak: 'Password does not meet the requirements.',
    loading: 'Please wait…',
    signInCta: 'Sign In',
    signUpCta: 'Create Account',
    noAccount: "Don't have an account?",
    haveAccount: 'Already have an account?',
    signUpHere: 'Sign up',
    signInHere: 'Sign in',
    mustAgreeLegal: 'Please accept the Privacy Policy and Terms of Use to continue.',
    legalNotice: 'I agree with the',
    and: 'and',
    privacy: 'Privacy Policy',
    terms: 'Terms of Use',
    backToSite: 'Back to site',
    secureLogin: 'Secure login · 256-bit SSL',
    authorizing: 'Authorizing…',
    googleNotConfigured: 'Google Sign-In is not configured yet. Admin can set it up in Integrations.',
    authError: 'Authentication failed. Please try again.',
    emailLogoIn: 'Email',
  },
  bg: {
    welcomeBack: 'Вход',
    createAccount: 'Създайте акаунт',
    signInSubtitle: 'Достъп до вашия BIBI Cars кабинет.',
    signUpSubtitle: 'Регистрирайте се в BIBI Cars, за да получите своя кабинет.',
    tabSignIn: 'Вход',
    tabSignUp: 'Регистрация',
    continueWithGoogle: 'Продължете с Google',
    or: 'или с имейл',
    yourName: 'Пълно име',
    namePlaceholder: 'Иван Иванов',
    emailLabel: 'Имейл адрес',
    emailPlaceholder: 'your@email.com',
    password: 'Парола',
    confirmPassword: 'Потвърдете паролата',
    confirmPasswordPlaceholder: 'Повторете паролата',
    forgotPassword: 'Забравена парола?',
    passwordReqTitle: 'Паролата трябва да съдържа:',
    passwordReqLength: 'Поне 6 символа',
    passwordReqUpper: 'Една главна буква (A-Z)',
    passwordReqLower: 'Една малка буква (a-z)',
    passwordsDontMatch: 'Паролите не съвпадат.',
    passwordTooWeak: 'Паролата не отговаря на изискванията.',
    loading: 'Моля, изчакайте…',
    signInCta: 'Вход',
    signUpCta: 'Създаване на акаунт',
    noAccount: 'Нямате акаунт?',
    haveAccount: 'Вече имате акаунт?',
    signUpHere: 'Регистрирайте се',
    signInHere: 'Влезте',
    mustAgreeLegal: 'Моля, приемете Политиката за поверителност и Условията за ползване.',
    legalNotice: 'Съгласен съм с',
    and: 'и',
    privacy: 'Политиката за поверителност',
    terms: 'Условията за ползване',
    backToSite: 'Обратно към сайта',
    secureLogin: 'Защитен вход · 256-bit SSL',
    authorizing: 'Оторизация…',
    googleNotConfigured: 'Google Sign-In все още не е настроен.',
    authError: 'Неуспешно удостоверяване. Моля, опитайте отново.',
    emailLogoIn: 'Имейл',
  },
};
const pick = (lang) => (lang === 'bg' ? STR.bg : STR.en);

// ============================================================================
// AUTH CONTEXT
// ============================================================================

const CustomerAuthContext = createContext(null);
export const useCustomerAuth = () => useContext(CustomerAuthContext);

export const CustomerAuthProvider = ({ children }) => {
  const [customer, setCustomer] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => { checkAuth(); }, []);

  const checkAuth = async () => {
    try {
      const savedSession = localStorage.getItem('customer_session');
      let sessionToken = null;
      if (savedSession) {
        try { sessionToken = JSON.parse(savedSession)?.sessionToken || null; } catch {}
      }
      if (sessionToken) {
        try {
          const res = await axios.get(`${API_URL}/api/customer-auth/google/me`, {
            headers: { Authorization: `Bearer ${sessionToken}` },
          });
          setCustomer(res.data);
          localStorage.setItem('customer_session', JSON.stringify({
            ...res.data,
            sessionToken: res.data.sessionToken || sessionToken,
          }));
          return;
        } catch {
          localStorage.removeItem('customer_session');
        }
      }
      const token = localStorage.getItem('customer_token');
      if (token) {
        try {
          const res = await axios.get(`${API_URL}/api/customer-auth/me`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          setCustomer(res.data);
          if (res.data?.customerId) {
            localStorage.setItem('customer_session', JSON.stringify(res.data));
          }
          return;
        } catch {
          localStorage.removeItem('customer_token');
          localStorage.removeItem('customer_session');
        }
      }
      setCustomer(null);
    } finally {
      setLoading(false);
    }
  };

  // Verify Google ID token (from GIS) with our backend
  const verifyGoogleCredential = async (credential) => {
    const res = await axios.post(`${API_URL}/api/customer-auth/google/verify`, { credential });
    const customerData = res.data;
    if (customerData?.customerId) {
      localStorage.setItem(
        'customer_session',
        JSON.stringify({ ...customerData, sessionToken: customerData.sessionToken }),
      );
    }
    setCustomer(customerData);
    return customerData;
  };

  // Legacy email/password login
  const login = async (email, password) => {
    const res = await axios.post(`${API_URL}/api/customer-auth/login`, { email, password });
    const customerData = res.data;
    localStorage.setItem('customer_token', customerData.accessToken);
    localStorage.setItem('customer_session', JSON.stringify(customerData));
    setCustomer(customerData);
    return customerData;
  };
  const register = async (email, password, name) => {
    const res = await axios.post(`${API_URL}/api/customer-auth/register`, {
      email, password, name, customerId: '',
    });
    const customerData = res.data;
    localStorage.setItem('customer_token', customerData.accessToken);
    localStorage.setItem('customer_session', JSON.stringify(customerData));
    setCustomer(customerData);
    return customerData;
  };

  const logout = async () => {
    try {
      const saved = localStorage.getItem('customer_session');
      const token = saved ? JSON.parse(saved)?.sessionToken : null;
      if (token) {
        await axios.post(
          `${API_URL}/api/customer-auth/google/logout`,
          {},
          { headers: { Authorization: `Bearer ${token}` } },
        );
      }
    } catch {}
    localStorage.removeItem('customer_token');
    localStorage.removeItem('customer_session');
    setCustomer(null);
  };

  return (
    <CustomerAuthContext.Provider
      value={{
        customer,
        loading,
        login,
        register,
        logout,
        verifyGoogleCredential,
        checkAuth,
      }}
    >
      {children}
    </CustomerAuthContext.Provider>
  );
};

// ============================================================================
// PROTECTED ROUTE
// ============================================================================

export const CustomerProtectedRoute = ({ children }) => {
  const { customer, loading } = useCustomerAuth();
  const location = useLocation();
  if (location.state?.user) return children;
  if (loading) {
    return (
      <div className="public-theme min-h-screen bg-black flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <SpinnerGap size={40} className="animate-spin text-[#FEAE00]" />
          <span className="text-[12px] uppercase tracking-[0.18em] text-white/50">loading</span>
        </div>
      </div>
    );
  }
  if (!customer) return <Navigate to="/cabinet/login" replace />;
  return children;
};

// ============================================================================
// AUTH CALLBACK — legacy third-party flow is removed; this route redirects to /cabinet/login
// (kept for any old bookmarks / external links).
// ============================================================================

export const AuthCallback = () => {
  const navigate = useNavigate();
  useEffect(() => { navigate('/cabinet/login', { replace: true }); }, [navigate]);
  return null;
};

// ============================================================================
// Google Identity Services loader — reloaded when language changes so that the
// native button text follows the user's EN/BG choice (GIS reads locale only
// on script init, not from renderButton options).
// ============================================================================

let gsiLoaderPromise = null;
let gsiLoadedLocale = null;

const loadGsiWithLocale = (locale) => {
  if (typeof window === 'undefined') return Promise.reject(new Error('no window'));
  if (gsiLoaderPromise && gsiLoadedLocale === locale) return gsiLoaderPromise;

  // Remove any existing script + reset window.google.accounts so re-init works
  try {
    document
      .querySelectorAll('script[src*="accounts.google.com/gsi/client"]')
      .forEach((s) => s.remove());
    if (window.google && window.google.accounts) {
      try { delete window.google.accounts; } catch { window.google.accounts = undefined; }
    }
  } catch {}
  gsiLoaderPromise = null;
  gsiLoadedLocale = locale;

  gsiLoaderPromise = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = `${GSI_SRC}?hl=${encodeURIComponent(locale)}`;
    s.async = true;
    s.defer = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('gsi failed'));
    document.head.appendChild(s);
  });
  return gsiLoaderPromise;
};

// ============================================================================
// LOGIN PAGE
// ============================================================================

export const CustomerLoginPage = () => {
  const { lang } = useLang();
  const t = pick(lang);
  const navigate = useNavigate();
  const location = useLocation();
  const auth = useCustomerAuth();
  const staffAuth = useAuth();
  const { customer, verifyGoogleCredential } = auth;
  const { open: openPolicy } = usePolicyModal();

  // ── Mode (sign-in vs sign-up). Optional `?mode=register` URL param so
  // we can deep-link straight into registration from CTAs. ──
  const initialMode = (() => {
    try {
      const sp = new URLSearchParams(location.search);
      const m = (sp.get('mode') || '').toLowerCase();
      if (m === 'register' || m === 'signup' || m === 'sign-up') return false; // false = register mode
    } catch {}
    return true; // true = sign-in mode by default
  })();
  const [isLogin, setIsLogin] = useState(initialMode);

  // ── Form state ──
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [name, setName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showPasswordConfirm, setShowPasswordConfirm] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [agreed, setAgreed] = useState(false);

  // ── Step 2 (multi-factor challenge for admin TOTP / team-lead email-OTP) ──
  // When the staff /api/auth/login returns a `__challenge` payload instead of
  // a JWT, we switch the UI into the challenge step. The user enters a 6-digit
  // code; we POST it to /api/auth/2fa/verify (admin) or /api/auth/email-otp/verify
  // (team_lead) via staffAuth.completeChallenge.
  //
  // Persistence: challenge payload is kept in localStorage under
  // `bibi_staff_challenge` so that an accidental page reload doesn't kick the
  // team-lead out while they're waiting for the admin to read the OTP. The
  // record auto-expires after 10 minutes (matching backend OTP TTL).
  const CHAL_LS_KEY = 'bibi_staff_challenge';
  const [challenge, setChallengeRaw] = useState(() => {
    try {
      const raw = localStorage.getItem(CHAL_LS_KEY);
      if (!raw) return null;
      const obj = JSON.parse(raw);
      if (!obj || !obj.challenge) return null;
      if (obj.expires_at && Date.now() > obj.expires_at) {
        localStorage.removeItem(CHAL_LS_KEY);
        return null;
      }
      return obj;
    } catch { return null; }
  });
  // Wrapper that mirrors the challenge state into localStorage.
  const setChallenge = useCallback((next) => {
    setChallengeRaw(next);
    try {
      if (next) {
        const ttlSec = Number(next.expires_in_seconds || 600);
        const payload = { ...next, expires_at: Date.now() + ttlSec * 1000 };
        localStorage.setItem(CHAL_LS_KEY, JSON.stringify(payload));
      } else {
        localStorage.removeItem(CHAL_LS_KEY);
      }
    } catch { /* localStorage may be disabled in some browsers */ }
  }, []);
  const [challengeCode, setChallengeCode] = useState('');
  const [challengeBusy, setChallengeBusy] = useState(false);
  const [challengeError, setChallengeError] = useState('');
  const [otpResendCooldown, setOtpResendCooldown] = useState(0);

  useEffect(() => {
    if (otpResendCooldown <= 0) return;
    const id = setTimeout(() => setOtpResendCooldown((c) => Math.max(0, c - 1)), 1000);
    return () => clearTimeout(id);
  }, [otpResendCooldown]);

  // ── Google Sign-In state ──
  // Public Google config — `clientId` + `enabled`. When admin disables
  // Google sign-in via Admin → Settings → Auth, hide the entire Google
  // block (button + divider + GIS init) and let email-only login carry
  // the page.
  const [googleConfig, setGoogleConfig] = useState({ clientId: '', enabled: false });
  const clientId = googleConfig.clientId;
  const googleEnabled = googleConfig.enabled && !!googleConfig.clientId;
  const [googleReady, setGoogleReady] = useState(false);
  const [googleAuthorizing, setGoogleAuthorizing] = useState(false);
  const hiddenGoogleRef = useRef(null);

  // ── Password validation (live indicators) ──
  const pwdChecks = {
    length: password.length >= 6,
    upper: /[A-Z]/.test(password),
    lower: /[a-z]/.test(password),
  };
  const pwdAllValid = pwdChecks.length && pwdChecks.upper && pwdChecks.lower;
  const confirmMatches = password.length > 0 && password === passwordConfirm;

  // Reset transient state on mode switch
  const switchMode = (toLogin) => {
    setIsLogin(toLogin);
    setError('');
    setPassword('');
    setPasswordConfirm('');
    setShowPassword(false);
    setShowPasswordConfirm(false);
  };

  // Redirect if already logged in (staff or customer — whichever is active)
  useEffect(() => {
    const staffUser = staffAuth?.user;
    if (staffUser?.id) {
      const role = (staffUser.role || '').toLowerCase();
      if (role === 'manager') navigate('/manager', { replace: true });
      else if (role === 'team_lead') navigate('/team/dashboard', { replace: true });
      else if (role === 'admin' || role === 'master_admin') navigate('/admin', { replace: true });
      return;
    }
    if (customer?.customerId) {
      navigate(`/cabinet/${customer.customerId}`);
    }
  }, [customer, staffAuth?.user, navigate]);

  // Fetch Client ID once
  useEffect(() => {
    let cancelled = false;
    axios.get(`${API_URL}/api/auth/google-client-id`)
      .then((r) => {
        if (cancelled) return;
        setGoogleConfig({
          clientId: r.data?.clientId || '',
          enabled: r.data?.enabled !== false,
        });
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  // Handle Google credential response (from GIS popup)
  const handleGoogleCredential = useCallback(async (response) => {
    if (!response?.credential) return;
    setError('');
    setGoogleAuthorizing(true);
    try {
      const data = await verifyGoogleCredential(response.credential);
      navigate(`/cabinet/${data.customerId}`, { replace: true, state: { user: data } });
    } catch (err) {
      const detail = err.response?.data?.detail || err.response?.data?.message || err.message;
      setError(typeof detail === 'string' ? detail : t.authError);
      setGoogleAuthorizing(false);
    }
  }, [verifyGoogleCredential, navigate, t.authError]);

  // Initialise GIS once we have Client ID. Skipped entirely when admin
  // toggles Google off (`googleEnabled === false`).
  useEffect(() => {
    if (!googleEnabled || !clientId) return;
    let cancelled = false;
    setGoogleReady(false);
    loadGsiWithLocale('en')
      .then(() => {
        if (cancelled || !window.google?.accounts?.id) return;
        try {
          /* `auto_select: true` enables silent re-authentication on
           * return visits. Respects `disableAutoSelect()` from logout. */
          window.google.accounts.id.initialize({
            client_id: clientId,
            callback: handleGoogleCredential,
            auto_select: true,
            ux_mode: 'popup',
            itp_support: true,
          });
          setGoogleReady(true);
          // Silent One-Tap suggestion — fully optional, fails silently.
          try { window.google.accounts.id.prompt(); } catch (_) {}
        } catch (e) {
          console.warn('[gsi] initialize failed', e);
        }
      })
      .catch((e) => console.warn('[gsi] load failed', e));
    return () => { cancelled = true; };
  }, [clientId, googleEnabled, handleGoogleCredential]);

  // Render the hidden, native Google button
  useEffect(() => {
    if (!googleReady || !hiddenGoogleRef.current || !window.google?.accounts?.id) return;
    try {
      hiddenGoogleRef.current.innerHTML = '';
      window.google.accounts.id.renderButton(hiddenGoogleRef.current, {
        type: 'standard',
        theme: 'filled_black',
        size: 'large',
        text: 'continue_with',
        shape: 'rectangular',
        logo_alignment: 'left',
        width: 380,
      });
    } catch (e) {
      console.warn('[gsi] renderButton failed', e);
    }
  }, [googleReady]);

  const triggerGoogleSignIn = () => {
    const host = hiddenGoogleRef.current;
    if (!host) return;
    const native = host.querySelector('div[role="button"]') || host.querySelector('button');
    if (native) { native.click(); return; }
    try { window.google?.accounts?.id?.prompt(); } catch {}
  };

  const handleGoogleClick = () => {
    // Consent only required for REGISTRATION mode (since Google may create a new account).
    // In Sign-In mode we don't gate Google login (existing accounts already accepted terms).
    if (!isLogin && !agreed) { setError(t.mustAgreeLegal); return; }
    if (!clientId) { setError(t.googleNotConfigured); return; }
    if (!window.google?.accounts?.id) return;
    triggerGoogleSignIn();
  };

  // Centralised post-login routing for staff users.
  const routeStaffUser = useCallback((staffUser) => {
    const role = (staffUser?.role || '').toLowerCase();
    if (role === 'manager') navigate('/manager', { replace: true });
    else if (role === 'team_lead') navigate('/team/dashboard', { replace: true });
    else if (role === 'admin' || role === 'master_admin') navigate('/admin', { replace: true });
    else navigate('/admin', { replace: true });
  }, [navigate]);

  // Step-2 verify (TOTP or email-OTP).
  const verifyChallenge = async (e) => {
    if (e?.preventDefault) e.preventDefault();
    if (!challenge) return;
    setChallengeError('');
    const code = (challengeCode || '').trim();
    if (code.length !== 6 || /\D/.test(code)) {
      setChallengeError('Enter the 6-digit code.');
      return;
    }
    setChallengeBusy(true);
    try {
      let user;
      if (challenge.challenge === 'totp') {
        user = await staffAuth.completeChallenge('/api/auth/2fa/verify', {
          user_id: challenge.user_id,
          code,
        });
      } else if (challenge.challenge === 'email_otp') {
        user = await staffAuth.completeChallenge('/api/auth/email-otp/verify', {
          challenge_token: challenge.challenge_token,
          code,
        });
      } else {
        setChallengeError('Unsupported challenge type.');
        return;
      }
      // success — clear challenge state and route the user.
      setChallenge(null);
      setChallengeCode('');
      routeStaffUser(user);
    } catch (err) {
      const detail = err?.response?.data?.detail || err?.message || 'Invalid code.';
      setChallengeError(typeof detail === 'string' ? detail : 'Invalid code.');
    } finally {
      setChallengeBusy(false);
    }
  };

  // Resend email-OTP code (team_lead). 30s cooldown.
  const resendEmailOtp = async () => {
    if (!challenge || challenge.challenge !== 'email_otp') return;
    if (otpResendCooldown > 0) return;
    setChallengeBusy(true);
    setChallengeError('');
    try {
      const { data } = await axios.post(`${API_URL}/api/auth/email-otp/request`, {
        user_id: challenge.user_id,
      });
      setChallenge({
        ...challenge,
        challenge_token: data.challenge_token,
        recipient_masked: data.recipient_masked || challenge.recipient_masked,
      });
      setChallengeCode('');
      setOtpResendCooldown(30);
    } catch (err) {
      const detail = err?.response?.data?.detail || err?.message || 'Resend failed.';
      setChallengeError(typeof detail === 'string' ? detail : 'Resend failed.');
    } finally {
      setChallengeBusy(false);
    }
  };

  const cancelChallenge = () => {
    setChallenge(null);
    setChallengeCode('');
    setChallengeError('');
    setOtpResendCooldown(0);
  };

  const handleEmailSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!isLogin) {
      // ── Registration extra validation ──
      if (!agreed) { setError(t.mustAgreeLegal); return; }
      if (!pwdAllValid) { setError(t.passwordTooWeak); return; }
      if (password !== passwordConfirm) { setError(t.passwordsDontMatch); return; }
    }

    setSubmitting(true);
    try {
      if (isLogin) {
        // 1) Try STAFF login first
        try {
          const staffResult = await staffAuth.login(email, password);
          // Multi-step challenge (admin TOTP / team-lead email-OTP).
          if (staffResult && staffResult.__challenge) {
            setChallenge(staffResult);
            setChallengeCode('');
            setChallengeError('');
            setOtpResendCooldown(staffResult.challenge === 'email_otp' ? 30 : 0);
            return;
          }
          routeStaffUser(staffResult);
          return;
        } catch (staffErr) {
          const code = staffErr?.response?.status;
          if (code && code !== 401 && code !== 404 && code !== 422) throw staffErr;
        }
        // 2) Fallback to CUSTOMER login
        const data = await auth.login(email, password);
        navigate(`/cabinet/${data.customerId}`);
      } else {
        const data = await auth.register(email, password, name);
        navigate(`/cabinet/${data.customerId}`);
      }
    } catch (err) {
      const detail = err.response?.data?.message || err.response?.data?.detail || err.message;
      setError(typeof detail === 'string' ? detail : t.authError);
    } finally {
      setSubmitting(false);
    }
  };

  const title = isLogin ? t.welcomeBack : t.createAccount;
  const subtitle = isLogin ? t.signInSubtitle : t.signUpSubtitle;

  const inputBase =
    'w-full h-[50px] pl-11 pr-4 bg-[#0F0F0D] border border-[#3A3A37] rounded-md text-[15px] font-medium text-white placeholder:text-[#6A6A66] outline-none transition-all shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] focus:border-[#FEAE00] focus:ring-2 focus:ring-[#FEAE00]/35 focus:shadow-[0_0_0_4px_rgba(254,174,0,0.18),inset_0_1px_0_rgba(255,255,255,0.04)] hover:border-[#55544E]';

  return (
    <div
      className="public-theme min-h-screen bg-black relative overflow-hidden flex flex-col"
      data-testid="customer-login-page"
    >
      {/* Ambient accents */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(700px 480px at 12% -10%, rgba(254,174,0,0.14) 0%, rgba(0,0,0,0) 55%),' +
            'radial-gradient(620px 420px at 95% 110%, rgba(254,174,0,0.10) 0%, rgba(0,0,0,0) 60%)',
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.05]"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg width='40' height='40' viewBox='0 0 40 40' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='%23ffffff' fill-opacity='1'%3E%3Ccircle cx='1' cy='1' r='1'/%3E%3C/g%3E%3C/svg%3E\")",
        }}
      />

      {/* Top bar — logo only (the bottom "Back to site" link is the canonical one) */}
      <div className="relative z-10 flex items-center justify-between px-6 xl:px-12 pt-6 lg:pt-8">
        <BibiLogo height={40} />
      </div>

      {/* Centred auth card */}
      <div className="relative z-10 flex-1 flex items-center justify-center px-4 py-10 lg:py-14">
        <div className="w-full max-w-[460px]">
          {/* Title block */}
          <div className="text-center mb-10">
            <h1
              className="text-[30px] lg:text-[38px] leading-[1.05] font-extrabold tracking-tight text-white"
              style={{ fontFamily: "'Mazzard', 'Mazzard H', 'Mazzard M', system-ui, sans-serif" }}
              data-testid="auth-title"
            >
              {title}
            </h1>
            <p className="text-[14px] lg:text-[15px] text-white/70 mt-3 max-w-[380px] mx-auto leading-relaxed">
              {subtitle}
            </p>
          </div>

          {/* Auth card — no border / no yellow glow ring, just a clean dark surface with soft shadow. */}
          <div className="rounded-2xl bg-[#1D1D1B] shadow-[0_20px_60px_rgba(0,0,0,0.55),inset_0_1px_0_rgba(255,255,255,0.04)] p-6 sm:p-8">

            {/* ── Mode switcher (Sign In / Sign Up) — visible at the top, not hidden ── */}
            <div
              className="relative grid grid-cols-2 mb-7 p-1 bg-[#0F0F0D] border border-[#3A3A37] rounded-lg"
              role="tablist"
              aria-label="Auth mode"
            >
              <button
                type="button"
                role="tab"
                aria-selected={isLogin}
                onClick={() => switchMode(true)}
                className={[
                  'h-[42px] rounded-md text-[13px] font-semibold uppercase tracking-[0.1em] transition-all',
                  isLogin
                    ? 'bg-[#FEAE00] text-black'
                    : 'text-white/70 hover:text-white',
                ].join(' ')}
                data-testid="auth-tab-signin"
              >
                {t.tabSignIn}
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={!isLogin}
                onClick={() => switchMode(false)}
                className={[
                  'h-[42px] rounded-md text-[13px] font-semibold uppercase tracking-[0.1em] transition-all',
                  !isLogin
                    ? 'bg-[#FEAE00] text-black'
                    : 'text-white/70 hover:text-white',
                ].join(' ')}
                data-testid="auth-tab-signup"
              >
                {t.tabSignUp}
              </button>
            </div>

            {/* Error banner */}
            {error && (
              <div
                className="mb-5 p-3 rounded-md bg-[#3A1212] border border-[#5B1B1B] flex items-start gap-2.5"
                role="alert"
                data-testid="auth-error"
              >
                <Warning size={18} className="text-[#FF6B6B] mt-[1px] flex-shrink-0" />
                <span className="text-[13px] text-[#FFCACA] leading-snug">{error}</span>
              </div>
            )}

            {/* ── Google Sign-In: conditionally rendered. When admin
             *    toggles Google off (`features.googleEnabled = false`),
             *    the entire Google block + the "OR" divider collapse,
             *    and email-only login becomes the primary CTA. */}
            {googleEnabled && (
            <>
            <div className="relative" data-testid="google-signin-wrap">
              {/* Hidden native GIS button */}
              <div
                ref={hiddenGoogleRef}
                aria-hidden="true"
                tabIndex={-1}
                style={{
                  position: 'absolute', top: 0, left: 0,
                  width: 1, height: 1, overflow: 'hidden',
                  opacity: 0, pointerEvents: 'none', visibility: 'hidden',
                }}
                data-testid="google-signin-native-hidden"
              />

              {googleAuthorizing ? (
                <div className="w-full h-[52px] rounded-md bg-black border border-[#3A3A37] flex items-center justify-center gap-2.5 text-white">
                  <SpinnerGap size={18} className="animate-spin text-[#FEAE00]" />
                  <span className="text-[13px] font-medium">{t.authorizing}</span>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={handleGoogleClick}
                  disabled={!googleReady || !clientId}
                  className={[
                    'w-full h-[52px] rounded-md font-semibold text-[14px] transition-all flex items-center justify-center gap-3 border',
                    googleReady && clientId
                      ? 'bg-white hover:bg-[#F5F5F5] active:bg-[#EEEEEE] text-[#1F1F1F] border-transparent shadow-[0_4px_14px_-2px_rgba(0,0,0,0.6),inset_0_1px_0_rgba(255,255,255,0.5)]'
                      : 'bg-black/60 text-white/55 border-[#2A2A28] cursor-not-allowed',
                  ].join(' ')}
                  data-testid="google-signin-btn"
                >
                  <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
                    <path fill="#EA4335" d="M9 3.48c1.69 0 2.85.73 3.5 1.34l2.56-2.5C13.5.89 11.43 0 9 0 5.48 0 2.44 2.02.96 4.96l2.91 2.26C4.57 5.1 6.62 3.48 9 3.48z"/>
                    <path fill="#34A853" d="M17.64 9.2c0-.63-.06-1.25-.16-1.84H9v3.49h4.84a4.14 4.14 0 01-1.79 2.71l2.84 2.2c1.66-1.53 2.75-3.78 2.75-6.56z"/>
                    <path fill="#FBBC05" d="M3.88 10.78a5.4 5.4 0 010-3.56L.96 4.96a9 9 0 000 8.08l2.92-2.26z"/>
                    <path fill="#4285F4" d="M9 18c2.43 0 4.47-.8 5.96-2.19l-2.84-2.2c-.79.53-1.81.85-3.12.85-2.38 0-4.43-1.62-5.13-3.82L.96 13.04C2.44 15.98 5.48 18 9 18z"/>
                  </svg>
                  <span>{t.continueWithGoogle}</span>
                </button>
              )}
            </div>

            {/* Divider — only shown when Google block is also visible */}
            <div className="relative my-6">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-[#3A3A37]" />
              </div>
              <div className="relative flex justify-center">
                <span className="px-3 bg-[#1D1D1B] text-[11px] uppercase tracking-[0.18em] text-white/55 font-semibold">
                  {t.or}
                </span>
              </div>
            </div>
            </>
            )}

            {/* ── Email/password form (always visible — no intermediate button) ── */}
            <form onSubmit={handleEmailSubmit} className="space-y-4" data-testid="email-auth-form">
              {!isLogin && (
                <div>
                  <label className="block text-[12px] font-bold text-[#FEAE00] mb-4 uppercase tracking-[0.12em]">
                    {t.yourName}
                  </label>
                  <div className="relative">
                    <User size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#FEAE00]/80" />
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder={t.namePlaceholder}
                      required
                      autoComplete="name"
                      className={inputBase}
                      data-testid="register-name-input"
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="block text-[12px] font-bold text-[#FEAE00] mb-4 uppercase tracking-[0.12em]">
                  {t.emailLabel}
                </label>
                <div className="relative">
                  <Envelope size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#FEAE00]/80" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder={t.emailPlaceholder}
                    required
                    className={inputBase}
                    data-testid="login-email-input"
                    autoComplete="email"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-4">
                  <label className="block text-[12px] font-bold text-[#FEAE00] uppercase tracking-[0.12em]">
                    {t.password}
                  </label>
                  {isLogin && (
                    <Link
                      to="/cabinet/forgot-password"
                      className="text-[11px] text-white/70 hover:text-[#FEAE00] font-medium transition-colors"
                      tabIndex={-1}
                      data-testid="forgot-password-link"
                    >
                      {t.forgotPassword}
                    </Link>
                  )}
                </div>
                <div className="relative">
                  <Lock size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#FEAE00]/80" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                    minLength={isLogin ? 1 : 6}
                    className={`${inputBase} pr-11`}
                    data-testid="login-password-input"
                    autoComplete={isLogin ? 'current-password' : 'new-password'}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((s) => !s)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-white/50 hover:text-[#FEAE00] transition-colors p-1"
                    tabIndex={-1}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeSlash size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>

              {/* Password strength indicators — only on register and only when user starts typing */}
              {!isLogin && password.length > 0 && (
                <div
                  className="bg-[#0F0F0D] border border-[#2A2A28] rounded-md p-3 space-y-1.5"
                  data-testid="password-requirements"
                >
                  <div className="text-[11px] uppercase tracking-[0.1em] text-white/55 font-semibold mb-1.5">
                    {t.passwordReqTitle}
                  </div>
                  {[
                    { ok: pwdChecks.length, label: t.passwordReqLength, key: 'length' },
                    { ok: pwdChecks.upper,  label: t.passwordReqUpper,  key: 'upper' },
                    { ok: pwdChecks.lower,  label: t.passwordReqLower,  key: 'lower' },
                  ].map(({ ok, label, key }) => (
                    <div key={key} className="flex items-center gap-2 text-[12px]" data-testid={`pwd-req-${key}`}>
                      <span className={[
                        'w-4 h-4 rounded-full border flex items-center justify-center transition-colors',
                        ok ? 'bg-[#19A36C] border-[#19A36C]' : 'bg-transparent border-[#5A5A56]',
                      ].join(' ')}>
                        {ok && (
                          <svg width="9" height="9" viewBox="0 0 24 24" fill="none">
                            <path d="M4 12.5l5 5L20 6" stroke="#000" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        )}
                      </span>
                      <span className={ok ? 'text-[#9FE8C6]' : 'text-white/55'}>{label}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Confirm password — only on register */}
              {!isLogin && (
                <div>
                  <label className="block text-[12px] font-bold text-[#FEAE00] mb-4 uppercase tracking-[0.12em]">
                    {t.confirmPassword}
                  </label>
                  <div className="relative">
                    <Lock size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#FEAE00]/80" />
                    <input
                      type={showPasswordConfirm ? 'text' : 'password'}
                      value={passwordConfirm}
                      onChange={(e) => setPasswordConfirm(e.target.value)}
                      placeholder={t.confirmPasswordPlaceholder}
                      required
                      className={`${inputBase} pr-11 ${
                        passwordConfirm.length > 0 && !confirmMatches
                          ? 'border-[#7A2B2B] focus:border-[#FF6B6B] focus:ring-[#FF6B6B]/30'
                          : ''
                      }`}
                      data-testid="register-password-confirm-input"
                      autoComplete="new-password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPasswordConfirm((s) => !s)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-white/50 hover:text-[#FEAE00] transition-colors p-1"
                      tabIndex={-1}
                      aria-label={showPasswordConfirm ? 'Hide password' : 'Show password'}
                    >
                      {showPasswordConfirm ? <EyeSlash size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                  {passwordConfirm.length > 0 && !confirmMatches && (
                    <p className="mt-1.5 text-[11.5px] text-[#FF8B8B]" data-testid="pwd-mismatch">
                      {t.passwordsDontMatch}
                    </p>
                  )}
                </div>
              )}

              {/* Consent — only on register, inline, prominent */}
              {!isLogin && (
                <div
                  role="checkbox"
                  tabIndex={0}
                  onClick={() => { setAgreed((v) => !v); if (!agreed) setError(''); }}
                  onKeyDown={(e) => {
                    if (e.key === ' ' || e.key === 'Enter') {
                      e.preventDefault();
                      setAgreed((v) => !v);
                      if (!agreed) setError('');
                    }
                  }}
                  className={[
                    'w-full flex items-start gap-3 text-left p-3 rounded-lg border transition-colors cursor-pointer select-none',
                    agreed
                      ? 'bg-[#FEAE00]/10 border-[#FEAE00]/40'
                      : 'bg-[#0F0F0D] border-[#3A3A37] hover:border-[#FEAE00]/40',
                  ].join(' ')}
                  data-testid="auth-consent-checkbox"
                  aria-checked={agreed}
                >
                  <span
                    className={[
                      'w-5 h-5 rounded border flex items-center justify-center mt-0.5 shrink-0 transition-colors',
                      agreed ? 'bg-[#FEAE00] border-[#FEAE00]' : 'bg-transparent border-[#5A5A56]',
                    ].join(' ')}
                  >
                    {agreed && (
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                        <path d="M4 12.5l5 5L20 6" stroke="#000" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </span>
                  <span className="flex-1 text-[12.5px] text-white/85 leading-relaxed">
                    {t.legalNotice}{' '}
                    <span
                      role="link"
                      tabIndex={0}
                      onClick={(e) => { e.stopPropagation(); openPolicy('privacy'); }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          e.stopPropagation();
                          openPolicy('privacy');
                        }
                      }}
                      className="text-[#FEAE00] underline underline-offset-2 hover:brightness-110 font-medium cursor-pointer"
                      data-testid="auth-privacy-link"
                    >
                      {t.privacy}
                    </span>{' '}
                    {t.and}{' '}
                    <span
                      role="link"
                      tabIndex={0}
                      onClick={(e) => { e.stopPropagation(); openPolicy('terms'); }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          e.stopPropagation();
                          openPolicy('terms');
                        }
                      }}
                      className="text-[#FEAE00] underline underline-offset-2 hover:brightness-110 font-medium cursor-pointer"
                      data-testid="auth-terms-link"
                    >
                      {t.terms}
                    </span>.
                  </span>
                </div>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="w-full h-[54px] mt-2 bg-[#FEAE00] hover:bg-[#FFBF2D] active:bg-[#E89D00] text-black rounded-md font-semibold text-[14px] tracking-[0.06em] uppercase transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                data-testid="login-submit-btn"
              >
                {submitting ? (
                  <>
                    <SpinnerGap size={18} className="animate-spin" />
                    {t.loading}
                  </>
                ) : isLogin ? t.signInCta : t.signUpCta}
              </button>
            </form>

            {/* Bottom helper — toggle mode */}
            <div className="mt-6 text-center text-[13px]">
              <span className="text-white/65">
                {isLogin ? t.noAccount : t.haveAccount}
              </span>
              <button
                onClick={() => switchMode(!isLogin)}
                className="ml-2 text-[#FEAE00] font-bold hover:underline underline-offset-4"
                data-testid="toggle-auth-mode-btn"
                type="button"
              >
                {isLogin ? t.signUpHere : t.signInHere}
              </button>
            </div>
          </div>

          {/* Bottom: back to site link with proper breathing room */}
          <div className="mt-10 text-center">
            <Link
              to="/"
              className="inline-flex items-center gap-1.5 text-[12px] uppercase tracking-[0.14em] text-white/65 hover:text-[#FEAE00] transition-colors"
              data-testid="back-to-site-link"
            >
              <ArrowLeft size={14} />
              {t.backToSite}
            </Link>
          </div>
        </div>
      </div>

      {/* ── Step-2 challenge modal (TOTP / email-OTP) ──────────────── */}
      {challenge && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
          data-testid="login-challenge-modal"
          onMouseDown={(e) => { if (e.target === e.currentTarget) cancelChallenge(); }}
        >
          <form
            onSubmit={verifyChallenge}
            className="w-full max-w-md bg-[#0F0F0D] border border-[#3A3A37] rounded-2xl p-6 sm:p-8 shadow-[0_24px_80px_rgba(0,0,0,0.65)] relative"
          >
            <button
              type="button"
              onClick={cancelChallenge}
              className="absolute top-3 right-3 w-9 h-9 rounded-full text-white/60 hover:text-white hover:bg-white/5 flex items-center justify-center"
              aria-label="Close"
              data-testid="login-challenge-cancel"
            >
              ✕
            </button>

            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-xl bg-[#FEAE00]/15 border border-[#FEAE00]/30 flex items-center justify-center text-[#FEAE00]">
                <Lock size={20} weight="bold" />
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-[0.16em] text-[#FEAE00]/80">
                  {challenge.challenge === 'totp' ? 'Two-factor required' : 'Email code required'}
                </div>
                <h2 className="text-white text-xl font-semibold leading-tight">
                  {challenge.challenge === 'totp' ? 'Authenticator code' : 'Verification code'}
                </h2>
              </div>
            </div>

            <p className="text-sm text-white/70 leading-relaxed mt-3">
              {challenge.challenge === 'totp' ? (
                <>
                  Open <strong className="text-white">Google Authenticator</strong> and enter the 6-digit code for{' '}
                  <strong className="text-white">{challenge.user_email}</strong>.
                </>
              ) : (
                <>
                  A code was issued for <strong className="text-white">{challenge.user_email}</strong>. Ask the master-admin
                  {challenge.recipient_masked ? (
                    <> (<code className="bg-white/10 px-1.5 py-0.5 rounded text-[12px] font-mono">{challenge.recipient_masked}</code>)</>
                  ) : null}
                  {' '}for the 6-digit code.
                </>
              )}
            </p>

            <label className="block mt-5 text-[11px] uppercase tracking-[0.14em] text-white/55 font-semibold">
              6-digit code
            </label>
            <input
              type="text"
              inputMode="numeric"
              autoFocus
              maxLength={6}
              value={challengeCode}
              onChange={(e) => setChallengeCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="000000"
              data-testid="login-challenge-code"
              className="mt-2 w-full h-[58px] bg-[#070705] border border-[#3A3A37] rounded-md text-center text-2xl font-mono tracking-[0.5em] text-white outline-none focus:border-[#FEAE00] focus:ring-2 focus:ring-[#FEAE00]/35"
            />

            {challengeError && (
              <div className="mt-3 flex items-start gap-2 text-[13px] text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded-lg p-2.5">
                <Warning size={14} weight="fill" className="flex-shrink-0 mt-0.5" />
                <span>{challengeError}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={challengeBusy || challengeCode.length !== 6}
              data-testid="login-challenge-submit"
              className="mt-5 w-full h-[50px] rounded-md bg-[#FEAE00] hover:bg-[#FFC04A] disabled:opacity-50 text-black text-[15px] font-bold tracking-wide transition-colors flex items-center justify-center gap-2"
            >
              {challengeBusy ? <SpinnerGap size={18} className="animate-spin" /> : null}
              {challengeBusy ? 'Verifying…' : 'Verify & sign in'}
            </button>

            {challenge.challenge === 'email_otp' && (
              <button
                type="button"
                onClick={resendEmailOtp}
                disabled={challengeBusy || otpResendCooldown > 0}
                data-testid="login-challenge-resend"
                className="mt-3 w-full text-[12px] text-white/55 hover:text-white disabled:opacity-40 underline-offset-4 hover:underline"
              >
                {otpResendCooldown > 0 ? `Resend code in ${otpResendCooldown}s` : 'Resend code'}
              </button>
            )}

            <div className="mt-5 pt-4 border-t border-white/10 text-[11px] text-white/40 leading-relaxed">
              {challenge.challenge === 'totp' ? (
                'Codes refresh every 30 seconds. If the code is rejected, wait for the next one.'
              ) : (
                'Codes are valid for 10 minutes. Max 5 attempts before a new code must be issued.'
              )}
            </div>
          </form>
        </div>
      )}

      {/* Footer trust strip */}
      <div className="relative z-10 border-t border-[#1A1A18] bg-black/40">
        <div className="max-w-[1200px] mx-auto px-6 py-4 flex flex-col sm:flex-row items-center justify-between gap-2 text-[11px] text-white/35 uppercase tracking-[0.14em]">
          <span>© {new Date().getFullYear()} BIBI CARS</span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-[#FEAE00] shadow-[0_0_8px_rgba(254,174,0,0.8)]" />
            {t.secureLogin}
          </span>
        </div>
      </div>
    </div>
  );
};

export default CustomerLoginPage;
