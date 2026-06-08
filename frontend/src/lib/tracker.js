/**
 * tracker.js — лёгкий клиентский трекинг.
 *
 * Шлёт POST /api/track/event на каждую загрузку страницы + при смене URL
 * (React Router → useLocation). Без cookies, без fingerprinting; sessionId
 * хранится в sessionStorage (живёт пока вкладка открыта).
 *
 * Сразу включается. UTM-метки sticky к сессии (один раз поймали ?utm_*=...
 * — запоминаем до закрытия вкладки).
 *
 * Использование:
 *   import { initTracker, trackEvent, trackVehicleView, trackVinSearch,
 *            trackCalculatorUse, trackLeadSubmit } from './lib/tracker';
 *
 *   // В App.js один раз:
 *   initTracker();  // вешает page_view на каждую смену URL.
 *
 *   // По ходу UI — точечные события:
 *   trackVehicleView({ vehicleId: 'abc' });
 *   trackVinSearch({ vin: '1HG...' });
 *   trackCalculatorUse();
 *   trackLeadSubmit();
 */

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || '';

// ── Session ID (sessionStorage, живёт пока открыта вкладка) ──────────
function getSessionId() {
  try {
    let sid = window.sessionStorage.getItem('bibi_session_id');
    if (!sid) {
      sid = `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
      window.sessionStorage.setItem('bibi_session_id', sid);
    }
    return sid;
  } catch (_e) {
    return '';
  }
}

// ── UTM sticky: запоминаем UTM при первом заходе в сессию ────────────
const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'];

function captureUtm() {
  try {
    const params = new URLSearchParams(window.location.search);
    const captured = {};
    UTM_KEYS.forEach((k) => {
      const v = params.get(k);
      if (v) captured[k] = v.slice(0, 128);
    });
    if (Object.keys(captured).length) {
      window.sessionStorage.setItem('bibi_utm', JSON.stringify(captured));
    }
  } catch (_e) {
    /* noop */
  }
}

function readUtm() {
  try {
    const raw = window.sessionStorage.getItem('bibi_utm');
    if (!raw) return {};
    return JSON.parse(raw) || {};
  } catch (_e) {
    return {};
  }
}

// ── Низкоуровневая отправка ──────────────────────────────────────────
async function sendEvent(type, extra = {}) {
  if (!BACKEND_URL) return;
  const body = {
    type,
    path: window.location.pathname || '/',
    session_id: getSessionId(),
    referrer: document.referrer || '',
    host: window.location.host || '',
    user_agent: navigator.userAgent || '',
    ...readUtm(),
    ...extra,
  };
  try {
    // Используем sendBeacon если доступен (надёжнее при unload), иначе fetch keepalive.
    const url = `${BACKEND_URL}/api/track/event`;
    const payload = JSON.stringify(body);
    if (navigator.sendBeacon) {
      const blob = new Blob([payload], { type: 'application/json' });
      navigator.sendBeacon(url, blob);
      return;
    }
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: payload,
      keepalive: true,
      credentials: 'omit',
    });
  } catch (_e) {
    /* network errors — silent */
  }
}

// ── Public API ───────────────────────────────────────────────────────
let _initialized = false;
let _lastPath = null;

export function initTracker() {
  if (_initialized || typeof window === 'undefined') return;
  _initialized = true;
  captureUtm();
  // Первый page_view
  _lastPath = window.location.pathname;
  sendEvent('page_view');

  // Слушаем смену history (React Router pushState/popstate)
  const fire = () => {
    const p = window.location.pathname;
    if (p === _lastPath) return;
    _lastPath = p;
    sendEvent('page_view');
  };

  // popstate (back/forward)
  window.addEventListener('popstate', fire);

  // monkey-patch pushState/replaceState — стандартный приём для SPA-трекинга
  const _push = window.history.pushState.bind(window.history);
  window.history.pushState = function (state, title, url) {
    const ret = _push(state, title, url);
    fire();
    return ret;
  };
  const _replace = window.history.replaceState.bind(window.history);
  window.history.replaceState = function (state, title, url) {
    const ret = _replace(state, title, url);
    fire();
    return ret;
  };
}

export function trackEvent(type, extra = {}) {
  return sendEvent(type, extra);
}

export const trackVehicleView   = (extra = {}) => sendEvent('vehicle_view', extra);
export const trackVinSearch     = (extra = {}) => sendEvent('vin_search', extra);
export const trackCalculatorUse = (extra = {}) => sendEvent('calculator_use', extra);
export const trackLeadSubmit    = (extra = {}) => sendEvent('lead_submit', extra);
