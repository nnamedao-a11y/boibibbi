/**
 * runtime-origin-patch.js — bullet-proof backend URL rewriting.
 *
 * THE PROBLEM
 * ───────────
 * When the user attaches a CUSTOM domain (e.g. `bibicar.org`) to an
 * Emergent deployment, the React bundle has ALREADY been built with
 * `REACT_APP_BACKEND_URL` baked in as the Emergent default
 * (`https://*.emergent.host`).  The user opens the custom domain in
 * the browser, axios fires the request to `*.emergent.host` instead
 * of the same origin, the browser's CORS policy blocks it, and the
 * UI shows the generic "Network Error" alert (see the screenshot the
 * operator reported).
 *
 * THE FIX
 * ───────
 * We DO NOT rebuild the bundle, we DO NOT touch the 112 source files
 * that already use `${process.env.REACT_APP_BACKEND_URL}/...`.  Instead
 * we install a single axios request interceptor that runs BEFORE every
 * outbound HTTP call and:
 *
 *   1. Looks at the original URL.
 *   2. If it absolutely points to `*.emergent.host` / `*.preview.*`
 *      (the typical "stale build" hosts) AND the page is currently
 *      served from a different origin → rewrite the host to the
 *      current `window.location.origin` (keeping the path intact).
 *   3. Otherwise the URL is left untouched (developer mode against
 *      localhost still works, same-origin requests still work).
 *
 * The same logic is also applied to `window.fetch` so that any
 * non-axios call (e.g. the few raw `fetch(...)` invocations) behave
 * identically.  This guarantees that ALL backend traffic from the
 * frontend lands on the same origin the user is browsing, which:
 *
 *   • Eliminates the CORS pre-flight that the "Network Error" used to
 *     surface.
 *   • Makes the deployment fully portable across custom domains —
 *     attach `bibicar.org`, `acme-cars.com`, anything — and the
 *     frontend "just works" without rebuilding.
 *
 * The patch is idempotent (multiple imports do not stack
 * interceptors) and silent in production (no console noise).
 */
import axios from "axios";

// Patterns the original "baked" backend URL might match — extend as
// new Emergent host suffixes are introduced.
const STALE_HOST_PATTERNS = [
  /\.emergent\.host$/i,
  /\.preview\.emergentagent\.com$/i,
  /\.emergentagent\.com$/i,
];

function isStaleHost(host) {
  if (!host) return false;
  return STALE_HOST_PATTERNS.some((re) => re.test(host));
}

/**
 * Returns the URL the frontend SHOULD use as backend base.  In the
 * browser this is always `window.location.origin`.  In SSR / Node
 * (e.g. CRA tests) we just return null and the original URL is kept.
 */
function currentOrigin() {
  if (typeof window === "undefined" || !window.location) return null;
  return window.location.origin;
}

/**
 * Rewrites a target URL when its host is in the "stale" set AND we
 * are running in the browser AND the current origin differs from
 * the stale host.  Same-origin URLs and relative paths pass through.
 */
export function rewriteIfStale(rawUrl) {
  if (!rawUrl || typeof rawUrl !== "string") return rawUrl;
  // Relative path (starts with `/`, `./`, `../`) — keep as-is.
  if (!/^https?:\/\//i.test(rawUrl)) return rawUrl;
  const origin = currentOrigin();
  if (!origin) return rawUrl;
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return rawUrl;
  }
  // Same origin — leave untouched.
  if (parsed.origin === origin) return rawUrl;
  // Not on a known stale host — leave untouched (could be a 3rd-party
  // CDN, image proxy, vesselfinder.com, etc.).
  if (!isStaleHost(parsed.hostname)) return rawUrl;
  // Otherwise: rewrite host + protocol to current origin.
  const next = new URL(parsed.pathname + parsed.search + parsed.hash, origin);
  return next.toString();
}

let installed = false;

export function installRuntimeOriginPatch() {
  if (installed) return;
  installed = true;

  // ── axios — global interceptor on the default + module instance ──
  const tagInterceptor = (instance) => {
    if (!instance || !instance.interceptors || !instance.interceptors.request) return;
    instance.interceptors.request.use((config) => {
      if (config.url) config.url = rewriteIfStale(config.url);
      if (config.baseURL) config.baseURL = rewriteIfStale(config.baseURL);
      return config;
    });
  };
  tagInterceptor(axios);
  // Also patch the default baseURL in case something reads it directly.
  if (axios.defaults && axios.defaults.baseURL) {
    axios.defaults.baseURL = rewriteIfStale(axios.defaults.baseURL);
  }

  // ── window.fetch — wrap once, preserving all other arguments ────
  if (typeof window !== "undefined" && typeof window.fetch === "function") {
    const original = window.fetch.bind(window);
    window.fetch = (input, init) => {
      if (typeof input === "string") {
        return original(rewriteIfStale(input), init);
      }
      // Request object (rare in this codebase) — re-create with new URL
      if (input && typeof input === "object" && "url" in input) {
        const rewritten = rewriteIfStale(input.url);
        if (rewritten !== input.url) {
          const cloned = new Request(rewritten, input);
          return original(cloned, init);
        }
      }
      return original(input, init);
    };
  }
}

// Auto-install on import so consumers only need `import "./runtime-origin-patch"`.
installRuntimeOriginPatch();

export default installRuntimeOriginPatch;
