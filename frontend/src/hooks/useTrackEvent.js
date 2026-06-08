/**
 * useTrackEvent — Phase B3 user-observation hook (Wave 3 freeze)
 * ================================================================
 *
 * Tiny, privacy-respecting client for POST /api/events/track.
 *
 *   import { trackEvent } from "@/hooks/useTrackEvent";
 *   trackEvent("catalog_filter_changed", { filter: "price" });
 *
 * Design:
 *   - Fire-and-forget. We never await; we never throw on the user path.
 *   - No PII. The backend further strips email/phone/etc anyway, but we
 *     keep the contract clean here too.
 *   - Debounced/coalesced on the caller side when needed (e.g. don't fire
 *     filter_changed on every keystroke — fire on commit).
 *   - Beacon-friendly: if `navigator.sendBeacon` is available we use it,
 *     so the event ships even mid-navigation (e.g. catalog_search_abandoned
 *     when the user closes the tab).
 *
 * Whitelisted events (must match backend ALLOWED_EVENTS):
 *   catalog_filter_changed, catalog_filter_reset, catalog_search_abandoned,
 *   catalog_search_submitted, catalog_show_more, catalog_sort_changed,
 *   detail_view, detail_bounce, vin_check_submitted, vin_check_no_result,
 *   calculator_used, contact_us_clicked, consultation_requested.
 *
 * Anything outside that whitelist is rejected server-side. Use the helper
 * `EVENT_NAMES` const to avoid typos.
 */

const API_BASE = (typeof process !== "undefined" && process.env && process.env.REACT_APP_BACKEND_URL) || "";
const ENDPOINT = `${API_BASE}/api/events/track`;

export const EVENT_NAMES = Object.freeze({
  CATALOG_FILTER_CHANGED:    "catalog_filter_changed",
  CATALOG_FILTER_RESET:      "catalog_filter_reset",
  CATALOG_SEARCH_ABANDONED:  "catalog_search_abandoned",
  CATALOG_SEARCH_SUBMITTED:  "catalog_search_submitted",
  CATALOG_SHOW_MORE:         "catalog_show_more",
  CATALOG_SORT_CHANGED:      "catalog_sort_changed",
  DETAIL_VIEW:               "detail_view",
  DETAIL_BOUNCE:             "detail_bounce",
  VIN_CHECK_SUBMITTED:       "vin_check_submitted",
  VIN_CHECK_NO_RESULT:       "vin_check_no_result",
  CALCULATOR_USED:           "calculator_used",
  CONTACT_US_CLICKED:        "contact_us_clicked",
  CONSULTATION_REQUESTED:    "consultation_requested",
});

/**
 * Fire a single event. Returns void; never throws.
 * @param {string} event       — must be one of EVENT_NAMES values
 * @param {object} [props]     — small, non-PII props (filter name, sort, vin)
 */
export function trackEvent(event, props) {
  if (!event || typeof event !== "string") return;
  if (!API_BASE) return;     // SSR / no-backend builds: silent no-op
  if (typeof navigator === "undefined" || typeof window === "undefined") return;
  // Honor DNT — if user opted out, we don't ship anything.
  try {
    if (navigator.doNotTrack === "1" || window.doNotTrack === "1") return;
  } catch (_) { /* ignore */ }

  const body = JSON.stringify({ event, props: props || {} });
  try {
    if (typeof navigator.sendBeacon === "function") {
      const blob = new Blob([body], { type: "application/json" });
      const ok = navigator.sendBeacon(ENDPOINT, blob);
      if (ok) return;
    }
  } catch (_) { /* fall through */ }
  // Fallback: fire-and-forget fetch with keepalive so it survives nav.
  try {
    fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
    }).catch(() => { /* swallow */ });
  } catch (_) { /* ignore */ }
}

/** React-hook-style alias for ergonomics. Returns the stable function. */
export default function useTrackEvent() {
  return trackEvent;
}
