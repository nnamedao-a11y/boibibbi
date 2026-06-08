/**
 * VesselFinder Admin Console — simplified
 *
 * Only what an admin actually needs:
 *  1. Status block (cookies / online / heartbeat / успешные тики)
 *  2. One-click «Установить расширение» + «Sync cookies helper»
 *  3. Единый поиск (имя / MMSI / IMO / VIN / container / lot)
 *  4. Список активных shipments с кнопкой «Tick now» напрямую
 *  5. Bind vessel → shipment (предзаполняется из поиска)
 *
 * Никакого bbox, raw payload диагностики и прочего мусора.
 */
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import axios from 'axios';
import { useLocation } from 'react-router-dom';
import { useLang } from '../../i18n';
import {
  Anchor,
  ArrowClockwise,
  Boat,
  CheckCircle,
  Download,
  Lightning,
  Link as LinkIcon,
  MagnifyingGlass,
  Power,
  Target,
  XCircle,
  Warning,
} from '@phosphor-icons/react';
import RefreshButton from '../../components/ui/RefreshButton';

const API_URL = process.env.REACT_APP_BACKEND_URL;

// ---------- helpers ----------
const fmtAgo = (iso) => {
  if (!iso) return '—';
  const ms = new Date(iso).getTime();
  const sec = Math.max(0, Math.round((Date.now() - ms) / 1000));
  if (sec < 60) return `${sec}s ago`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
  return `${Math.floor(sec / 3600)}h ago`;
};

function StatusPill({ kind, children }) {
  // Unified neutral design: small dot showing status colour, the chip itself
  // uses the standard admin neutral background. Matches the rest of the UI
  // (no more loud emerald/amber/rose filled badges).
  const dot =
    kind === 'healthy' ? '#16A34A'
    : kind === 'degraded' ? '#F59E0B'
    : kind === 'expired' ? '#DC2626'
    : '#A1A1AA';
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-[#E4E4E7] bg-white px-3 py-1 text-[12px] font-semibold text-[#3F3F46]">
      <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ background: dot }} />
      {children}
    </span>
  );
}

function Stat({ label, value, sub, icon: Icon, tone = 'slate' }) {
  // Neutral admin card: black value, grey supporting text. Tone now only
  // tints the value's left dot — keeps visual rhythm consistent.
  const dot = {
    emerald: '#16A34A',
    rose: '#DC2626',
    amber: '#F59E0B',
    sky: '#2563EB',
    slate: '#A1A1AA',
  }[tone] || '#A1A1AA';
  return (
    <div className="rounded-xl border border-[#E4E4E7] bg-white p-4">
      <div className="flex items-center gap-2 text-[10.5px] uppercase tracking-wider text-[#71717A] font-semibold">
        {Icon ? <Icon size={13} /> : (
          <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ background: dot }} />
        )}
        {label}
      </div>
      <div className="mt-1.5 text-[22px] font-bold text-[#18181B] leading-tight">{value ?? '—'}</div>
      {sub ? <div className="mt-0.5 text-[12px] text-[#71717A] truncate">{sub}</div> : null}
    </div>
  );
}

// ---------- main ----------
export default function VesselFinderSessionPage() {
  const { t } = useLang();
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  // shipments list
  const [shipments, setShipments] = useState([]);
  const [tickingId, setTickingId] = useState(null);
  const [tickResults, setTickResults] = useState({}); // shipmentId -> result

  // unified search
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchData, setSearchData] = useState(null);

  // bind
  const [bindShipmentId, setBindShipmentId] = useState('');
  const [bindVin, setBindVin] = useState('');
  const [bindMmsi, setBindMmsi] = useState('');
  const [bindImo, setBindImo] = useState('');
  const [bindName, setBindName] = useState('');
  const [bindContainer, setBindContainer] = useState('');
  const [bindContainerSeal, setBindContainerSeal] = useState('');
  const [bindForceNew, setBindForceNew] = useState(false);
  const [bindNewStageLabel, setBindNewStageLabel] = useState('');
  const [bindBusy, setBindBusy] = useState(false);
  const [bindResult, setBindResult] = useState(null);

  // vessel history for currently-selected shipment
  const [vesselHistory, setVesselHistory] = useState(null);
  const [historyLoading, setHistoryLoading] = useState(false);

  // help modal
  const [showHelp, setShowHelp] = useState(false);

  // ext-clients (BIBI Cars / auction parser extension keys)
  const [extClients, setExtClients] = useState([]);
  const [extLoading, setExtLoading] = useState(false);
  const [extError, setExtError] = useState(null);
  const [newSecret, setNewSecret] = useState(null);     // last secret returned by bootstrap/rotate
  const [copiedField, setCopiedField] = useState(null);
  // Shared HMAC secret (baked into Vessel Sync ext, from backend .env)
  const [sharedSecret, setSharedSecret] = useState(null);
  const [sharedSecretVisible, setSharedSecretVisible] = useState(false);
  // Locally-cached secrets from previous Generate clicks — backend stores
  // only the hash, so we keep the plaintext in localStorage so the admin
  // can re-copy it after refreshing the page (the user explicitly asked
  // not to lose access to the secret after the modal is dismissed).
  const [cachedSecrets, setCachedSecrets] = useState({});

  // ---- data loaders ----
  const loadStatus = useCallback(async () => {
    try {
      const res = await axios.get(`${API_URL}/api/vesselfinder/session/status`);
      setStatus(res.data);
    } catch {
      setStatus(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadShipments = useCallback(async () => {
    try {
      const res = await axios.get(`${API_URL}/api/shipments`);
      const items = res.data?.items || res.data?.data || [];
      setShipments(items);
    } catch { /* silent */ }
  }, []);

  // ── Extension keys (clientId + HMAC secret) ─────────────────────────
  // The auction-parser extension (BIBI Cars / Poctra etc.) needs an
  // ext-client pair to sign requests with HMAC.  The Vessel Sync extension
  // already bakes the shared secret at build time, so the keys block is
  // shown here purely so the operator can copy them into the browser
  // extension popup when prompted for "missing keys".
  const authHeaders = () => {
    const token = localStorage.getItem('auth_token') || localStorage.getItem('token');
    return token ? { Authorization: `Bearer ${token}` } : {};
  };

  const loadExtClients = useCallback(async () => {
    setExtError(null);
    try {
      const r = await axios.get(`${API_URL}/api/admin/ext-clients`, { headers: authHeaders() });
      setExtClients(r.data?.items || []);
    } catch (e) {
      setExtError(e?.response?.data?.detail || e.message);
    }
  }, []);

  // Load the server-wide HMAC shared secret (baked into Vessel Sync ext).
  // Persists across page reloads because the value lives in .env on the
  // backend — it's NOT stored in MongoDB.
  const loadSharedSecret = useCallback(async () => {
    try {
      const r = await axios.get(`${API_URL}/api/admin/ext-clients/shared-secret`, { headers: authHeaders() });
      setSharedSecret(r.data || null);
    } catch (e) {
      setSharedSecret({ configured: false, error: e?.response?.data?.detail || e.message });
    }
  }, []);

  // Load locally-cached per-client secrets (the plaintext Generate showed
  // once and we kept).  Keyed by clientId.  Stored in localStorage so the
  // admin can recover them after refreshing or closing the browser.
  const CACHE_KEY = 'bibi.extClientSecrets.v1';
  const loadCachedSecrets = useCallback(() => {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      setCachedSecrets(raw ? JSON.parse(raw) : {});
    } catch { setCachedSecrets({}); }
  }, []);

  const cacheSecret = (clientId, secret, name) => {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      const cur = raw ? JSON.parse(raw) : {};
      cur[clientId] = { secret, name, savedAt: new Date().toISOString() };
      localStorage.setItem(CACHE_KEY, JSON.stringify(cur));
      setCachedSecrets(cur);
    } catch {}
  };

  const forgetCachedSecret = (clientId) => {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      const cur = raw ? JSON.parse(raw) : {};
      delete cur[clientId];
      localStorage.setItem(CACHE_KEY, JSON.stringify(cur));
      setCachedSecrets(cur);
    } catch {}
  };

  useEffect(() => {
    loadStatus();
    loadShipments();
    loadExtClients();
    loadSharedSecret();
    loadCachedSecrets();
    const t1 = setInterval(loadStatus, 10000);
    const t2 = setInterval(loadShipments, 30000);
    return () => { clearInterval(t1); clearInterval(t2); };
  }, [loadStatus, loadShipments, loadExtClients, loadSharedSecret, loadCachedSecrets]);

  // ---- actions ----
  const bootstrapExtClient = async () => {
    setExtLoading(true);
    setExtError(null);
    try {
      const r = await axios.post(
        `${API_URL}/api/admin/ext-clients/bootstrap`,
        { label: 'Browser extension', note: 'Created from Vessel Sync admin page' },
        { headers: authHeaders() },
      );
      const created = (r.data?.created || [])[0];
      if (created?.secret) {
        // Bootstrap returned a NEW client → secret is shown ONLY this once
        setNewSecret({ clientId: created.clientId, secret: created.secret, name: created.name });
        // Also cache so the admin can re-copy after refresh
        cacheSecret(created.clientId, created.secret, created.name);
      }
      await loadExtClients();
    } catch (e) {
      setExtError(e?.response?.data?.detail || e.message);
    } finally {
      setExtLoading(false);
    }
  };

  const rotateExtClient = async (clientId) => {
    if (!window.confirm(`Rotate secret for ${clientId}? The old secret stops working immediately.`)) return;
    setExtLoading(true);
    setExtError(null);
    try {
      const r = await axios.post(
        `${API_URL}/api/admin/ext-clients/${clientId}/rotate`,
        {},
        { headers: authHeaders() },
      );
      if (r.data?.secret) {
        setNewSecret({ clientId, secret: r.data.secret, name: r.data.name });
        cacheSecret(clientId, r.data.secret, r.data.name);
      }
      await loadExtClients();
    } catch (e) {
      setExtError(e?.response?.data?.detail || e.message);
    } finally {
      setExtLoading(false);
    }
  };

  const copyToClipboard = async (value, field) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 1500);
    } catch {}
  };

  const downloadExtension = async () => {
    // The extension ZIP is behind `require_admin`, so we can't use a plain
    // <a href> / window.location — the browser does NOT attach the JWT
    // from localStorage to a top-level navigation. We fetch it via axios
    // with Authorization header and trigger the download from the blob.
    const token = localStorage.getItem('auth_token') || localStorage.getItem('token');
    if (!token) {
      alert(t('vfAuthRequired'));
      return;
    }
    try {
      setBusy(true);
      const r = await axios.get(
        `${API_URL}/api/admin/vesselfinder/extension/download`,
        {
          headers: { Authorization: `Bearer ${token}` },
          responseType: 'blob',
        },
      );
      const url = URL.createObjectURL(r.data);
      const a = document.createElement('a');
      a.href = url;
      // filename comes from Content-Disposition but we set explicit too
      a.download = 'bibi-vesselfinder-extension.zip';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1500);
    } catch (e) {
      const msg =
        e.response?.status === 401
          ? t('vfAuthExpired')
          : e.response?.status === 403
          ? t('vfNoRights')
          : e.response?.data?.detail || e.message || t('vfAuthRequired');
      alert(msg);
    } finally {
      setBusy(false);
    }
  };

  const pingSession = async () => {
    setBusy(true);
    try {
      await axios.post(`${API_URL}/api/vesselfinder/session/test`);
      await loadStatus();
    } finally {
      setBusy(false);
    }
  };

  const clearSession = async () => {
    if (!window.confirm(t('vfDisconnectConfirm'))) return;
    setBusy(true);
    try {
      await axios.delete(`${API_URL}/api/vesselfinder/session`);
      await loadStatus();
    } finally {
      setBusy(false);
    }
  };

  const resetCounters = async () => {
    if (!window.confirm(t('vfResetConfirm'))) return;
    setBusy(true);
    try {
      await axios.post(`${API_URL}/api/vesselfinder/session/reset-counters`);
      await loadStatus();
    } finally {
      setBusy(false);
    }
  };

  const tickShipment = async (shipmentId) => {
    setTickingId(shipmentId);
    try {
      const res = await axios.post(`${API_URL}/api/shipments/${shipmentId}/tick`);
      setTickResults((prev) => ({ ...prev, [shipmentId]: { ok: true, data: res.data, at: new Date() } }));
    } catch (e) {
      setTickResults((prev) => ({
        ...prev,
        [shipmentId]: { ok: false, error: e?.response?.data?.detail || String(e), at: new Date() },
      }));
    } finally {
      setTickingId(null);
      loadStatus();
    }
  };

  const tickAllActive = async () => {
    const active = shipments.filter((s) => s.trackingActive);
    if (!active.length) return;
    if (!window.confirm(t('vfTickActiveConfirm').replace('{count}', active.length))) return;
    for (const s of active) {
      // eslint-disable-next-line no-await-in-loop
      await tickShipment(s.id);
    }
  };

  const runSearch = async () => {
    const q = query.trim();
    if (!q) return;
    setSearching(true);
    setSearchData(null);
    try {
      // parallel: legacy manager search + NEW unified shipment search + live VF
      const [dbRes, richRes, liveRes] = await Promise.allSettled([
        axios.get(`${API_URL}/api/manager/tracking/search`, { params: { q } }),
        axios.get(`${API_URL}/api/admin/shipments/search`, { params: { q, limit: 30 } }),
        axios.get(`${API_URL}/api/vesselfinder/vessels/search`, { params: { bbox: '-180,-80,180,80', query: q } }),
      ]);
      setSearchData({
        db:   dbRes.status   === 'fulfilled' ? dbRes.value.data   : { error: String(dbRes.reason) },
        rich: richRes.status === 'fulfilled' ? richRes.value.data : { error: String(richRes.reason) },
        live: liveRes.status === 'fulfilled' ? liveRes.value.data : { error: String(liveRes.reason?.response?.data?.detail || liveRes.reason) },
      });
    } finally {
      setSearching(false);
    }
  };

  const prefillBind = (v) => {
    setBindMmsi(v.mmsi || '');
    setBindImo(v.imo || '');
    setBindName(v.name || '');
    document.getElementById('bind-card')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  // Load vessel history whenever the selected shipment changes
  const loadVesselHistory = useCallback(async (sid) => {
    if (!sid) { setVesselHistory(null); return; }
    setHistoryLoading(true);
    try {
      const res = await axios.get(`${API_URL}/api/shipments/${sid}/vessel-history`);
      setVesselHistory(res.data);
    } catch (e) {
      setVesselHistory({ error: e?.response?.data?.detail || String(e) });
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    loadVesselHistory(bindShipmentId);
  }, [bindShipmentId, loadVesselHistory]);

  // Auto-prefill Shipment ID from ?shipmentId=... (used by Exceptions deep-link)
  const _location = useLocation();
  useEffect(() => {
    const params = new URLSearchParams(_location.search);
    const sid = params.get('shipmentId');
    if (sid && sid !== bindShipmentId) {
      setBindShipmentId(sid);
      setTimeout(() => {
        document.getElementById('bind-card')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 300);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [_location.search]);

  // Auto-resolve VIN → shipmentId when VIN is entered (debounced)
  useEffect(() => {
    const vin = bindVin.trim().toUpperCase();
    if (!vin || vin.length < 10) return;
    const h = setTimeout(async () => {
      // Try to find a shipment for this VIN in the shipments list first
      const match = shipments.find((s) => (s.vin || '').toUpperCase() === vin);
      if (match && match.id !== bindShipmentId) setBindShipmentId(match.id);
    }, 400);
    return () => clearTimeout(h);
  }, [bindVin, shipments, bindShipmentId]);

  const doBind = async () => {
    setBindBusy(true);
    setBindResult(null);
    try {
      // If VIN is provided and no shipmentId, route through /bind-by-vin
      if (bindVin.trim() && !bindShipmentId) {
        const res = await axios.post(`${API_URL}/api/shipments/bind-by-vin`, {
          vin:            bindVin.trim(),
          mmsi:           bindMmsi.trim() || null,
          imo:            bindImo.trim() || null,
          name:           bindName.trim() || null,
          container:      bindContainer.trim() || null,
          containerSeal:  bindContainerSeal.trim() || null,
          forceNewStage:  bindForceNew,
          newStageLabel:  bindNewStageLabel.trim() || null,
        });
        setBindResult({ ok: true, data: res.data });
        if (res.data.shipmentId) setBindShipmentId(res.data.shipmentId);
      } else {
        if (!bindShipmentId) {
          setBindResult({ ok: false, error: t('adm2_shipment_id_vin_43d326d0b8') });
          return;
        }
        const res = await axios.post(
          `${API_URL}/api/shipments/${bindShipmentId}/vessel`,
          {
            mmsi:          bindMmsi.trim() || null,
            imo:           bindImo.trim() || null,
            name:          bindName.trim() || null,
            container:     bindContainer.trim() || null,
            containerSeal: bindContainerSeal.trim() || null,
            forceNewStage: bindForceNew,
            newStageLabel: bindNewStageLabel.trim() || null,
          }
        );
        setBindResult({ ok: true, data: res.data });
      }
      await loadShipments();
      await loadVesselHistory(bindShipmentId);
    } catch (e) {
      setBindResult({ ok: false, error: e?.response?.data?.detail || String(e) });
    } finally {
      setBindBusy(false);
    }
  };

  // Explicit "Сменить судно" — confirms + calls /transfer-vessel endpoint.
  const doTransferVessel = async () => {
    if (!bindShipmentId) { setBindResult({ ok: false, error: t('vfBindChooseShipment') }); return; }
    if (!bindMmsi.trim() && !bindImo.trim() && !bindName.trim()) {
      setBindResult({ ok: false, error: 'MMSI / IMO / vessel name required' });
      return;
    }
    const confirmMsg = t('vfBindConfirmMsg').replace('{name}', bindName || bindMmsi);
    if (!window.confirm(confirmMsg)) return;
    setBindBusy(true);
    setBindResult(null);
    try {
      const res = await axios.post(
        `${API_URL}/api/shipments/${bindShipmentId}/transfer-vessel`,
        {
          mmsi:          bindMmsi.trim() || null,
          imo:           bindImo.trim() || null,
          name:          bindName.trim() || null,
          container:     bindContainer.trim() || null,
          containerSeal: bindContainerSeal.trim() || null,
          label:         bindNewStageLabel.trim() || null,
        }
      );
      setBindResult({ ok: true, data: res.data, transfer: true });
      await loadShipments();
      await loadVesselHistory(bindShipmentId);
    } catch (e) {
      setBindResult({ ok: false, error: e?.response?.data?.detail || String(e) });
    } finally {
      setBindBusy(false);
    }
  };

  // ---- derived ----
  const sessionStatus = status?.sessionStatus || 'not_connected';
  const statusKind = {
    healthy: 'healthy',
    degraded: 'degraded',
    paused: 'degraded',
    expired: 'expired',
    not_connected: 'offline',
  }[sessionStatus] || 'offline';

  // Three-level truth:
  //   1. EXTENSION HEALTH — heartbeat < 5min and cookies present
  //   2. VF FETCH HEALTH — did VesselFinder return vessels recently (cookies valid)
  //   3. MATCH HEALTH — did our target shipment match in the last fetches
  const extensionOk = status?.heartbeatAgeSec != null && status.heartbeatAgeSec < 300 && status.cookiesCount > 0;
  const vfFetchOk = status?.lastVfFetchOkAt
    ? (Date.now() - new Date(status.lastVfFetchOkAt).getTime()) < 10 * 60 * 1000
    : false;
  const vfFetchOkOrMatch = vfFetchOk || (status?.successCount > 0);
  const matchOk = status?.successCount > 0;
  const activeCount = shipments.filter((s) => s.trackingActive).length;
  const parserRunning = extensionOk; // keep name for legacy references below

  const dbShipments = searchData?.db?.data?.shipments || [];
  const dbDeals = searchData?.db?.data?.deals || [];
  const dbVehicles = searchData?.db?.data?.vehicles || [];
  const liveVessels = searchData?.live?.vessels || [];
  const classification = searchData?.db?.classification;
  // NEW: rich search results (VIN / container / vessel name / MMSI / IMO aware)
  const richShipments = searchData?.rich?.results || [];

  const totalFound = useMemo(() => (
    dbShipments.length + dbDeals.length + dbVehicles.length + liveVessels.length + richShipments.length
  ), [dbShipments, dbDeals, dbVehicles, liveVessels, richShipments]);

  // ---- render ----
  return (
    <div className="space-y-4 sm:space-y-6">
      {/* ================ HEADER — Refresh ALWAYS top-RIGHT (June 2026) ================
          Mobile: Refresh sits in the title row, top-right. The other 3 actions
          (Exceptions / Instructions / Install) drop to their own row below.
          Desktop: single row, all 4 actions inline on the right. */}
      <div className="space-y-3 sm:space-y-0 sm:flex sm:flex-row sm:flex-wrap sm:items-start sm:justify-between sm:gap-4">
        {/* Title row (mobile: includes refresh pinned right; desktop: just the title block) */}
        <div className="flex items-start gap-3 min-w-0 sm:flex-1">
          <div className="w-10 h-10 rounded-xl bg-[#18181B] text-white flex items-center justify-center shrink-0">
            <Anchor size={18} weight="duotone" />
          </div>
          <div className="min-w-0 flex-1">
            <h1
              className="text-xl sm:text-2xl font-bold tracking-tight text-[#18181B] leading-tight break-words"
              style={{ fontFamily: 'Mazzard, Mazzard H, Mazzard M, system-ui, sans-serif' }}
            >
              {t('vesselFinderTracker')}
            </h1>
            <p className="mt-1 text-[12px] sm:text-sm text-[#71717A] max-w-2xl leading-relaxed line-clamp-3 sm:line-clamp-none">
              {t('vfSubtitle')}
            </p>
          </div>
          {/* MOBILE-ONLY refresh button, pinned top-RIGHT inside the title row.
              Hidden on sm+ — there it lives in the secondary actions cluster. */}
          <div className="sm:hidden shrink-0">
            <RefreshButton
              onClick={() => { loadStatus(); loadShipments(); }}
              ariaLabel={t('vfBtnRefreshTitle')}
              testId="vf-refresh-button-mobile"
              title={t('vfBtnRefreshTitle')}
            />
          </div>
        </div>
        {/* Secondary actions (Exceptions / Instructions / Install). On mobile
            this row sits BELOW the title row. On desktop it's the right-side
            cluster of the header AND includes the desktop refresh button. */}
        <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap shrink-0">
          {/* Desktop refresh — hidden on mobile (mobile refresh is in the title row above). */}
          <div className="hidden sm:block">
            <RefreshButton
              onClick={() => { loadStatus(); loadShipments(); }}
              ariaLabel={t('vfBtnRefreshTitle')}
              testId="vf-refresh-button"
              title={t('vfBtnRefreshTitle')}
            />
          </div>
          <a
            href="/admin/shipments/exceptions"
            className="inline-flex items-center justify-center gap-2 h-10 w-10 sm:w-auto sm:px-4 shrink-0 rounded-xl border border-[#E4E4E7] bg-white text-sm font-medium text-[#18181B] hover:bg-zinc-50 transition-colors focus:outline-none focus-visible:ring-4 focus-visible:ring-black/10 whitespace-nowrap"
            title={t('vfBtnExceptionsTitle')}
          >
            <Warning size={15} weight="duotone" />
            <span className="hidden sm:inline">{t('vfBtnExceptions')}</span>
          </a>
          <button
            onClick={() => setShowHelp((v) => !v)}
            className="inline-flex items-center justify-center gap-2 h-10 w-10 sm:w-auto sm:px-4 shrink-0 rounded-xl border border-[#E4E4E7] bg-white text-sm font-medium text-[#18181B] hover:bg-zinc-50 transition-colors focus:outline-none focus-visible:ring-4 focus-visible:ring-black/10 whitespace-nowrap"
            title={t('vfBtnInstructions')}
          >
            <Lightning size={15} weight="duotone" className="sm:hidden" />
            <span className="hidden sm:inline">{t('vfBtnInstructions')}</span>
          </button>
          <button
            onClick={downloadExtension}
            className="inline-flex items-center justify-center gap-2 h-10 px-3 sm:px-4 shrink-0 rounded-xl bg-[#18181B] text-[13px] sm:text-sm font-medium text-white hover:bg-[#27272A] transition-colors shadow-sm focus:outline-none focus-visible:ring-4 focus-visible:ring-black/10 whitespace-nowrap"
          >
            <Download size={15} weight="bold" />
            <span className="hidden sm:inline">{t('vfBtnInstallExtension')}</span>
            <span className="sm:hidden">Install</span>
          </button>
        </div>
      </div>

      {/* ================ HELP PANEL ================ */}
      {showHelp && (
        <div className="rounded-2xl border border-[#E4E4E7] bg-[#FAFAFA] p-5 text-[13.5px] text-[#3F3F46]">
          <h3 className="font-semibold text-[#18181B] mb-2">{t('vfHowToConnect')}</h3>
          <ol className="list-decimal ml-5 space-y-1.5">
            <li>{t('vfStep1')}</li>
            <li>{t('vfStep2')}</li>
            <li>{t('vfStep3prefix')}<b>{t('bibiVesselSync')}</b>{t('vfStep3middle')}<code className="bg-white border border-[#E4E4E7] rounded px-1.5 py-0.5 text-[12px]">{t('vfStep3yourSiteUrl')}</code>{t('vfStep3suffix')}</li>
            <li>{t('vfStep4prefix')}<a className="text-[#18181B] underline underline-offset-2" href="https://www.vesselfinder.com" target="_blank" rel="noreferrer">{t('adm_vesselfindercom')}</a>{t('vfStep4suffix')}</li>
            <li>{t('vfStep5prefix')}<b>{t('vfStep5connect')}</b>{t('vfStep5suffix')}<b>{t('vfStep5online')}</b>{t('vfStep5dot')}</li>
            <li>{t('vfStep6')}</li>
          </ol>
          <div className="mt-4 pt-3 border-t border-[#E4E4E7] text-[12.5px] text-[#52525B]">
            <b className="text-[#18181B]">BIBI Cars (auction parser) extension — required keys:</b>
            <ol className="list-decimal ml-5 mt-1.5 space-y-1">
              <li>Scroll down to the <b>“Extension keys”</b> block on this page and click <b>“Generate new client”</b>.</li>
              <li>Copy <code className="bg-white border border-[#E4E4E7] rounded px-1 text-[11px]">Client ID</code> and <code className="bg-white border border-[#E4E4E7] rounded px-1 text-[11px]">Client Secret</code> (secret is shown ONCE).</li>
              <li>Open the BIBI Cars extension popup → paste your CRM URL → paste the keys into <b>Client ID</b> / <b>Client Secret</b> fields → <b>Save</b>.</li>
              <li>The “missing keys” warning will disappear and the extension starts sending HMAC-signed observations.</li>
            </ol>
          </div>
        </div>
      )}

      {/* ================ EXTENSION KEYS ================
          The auction-parser extension (BIBI Cars) needs a `clientId` and a
          `secret` to HMAC-sign its requests.  This panel:
            • Surfaces the server-wide EXT_SHARED_SECRET (baked into the
              Vessel Sync extension at build time) so the admin can copy
              it into the popup without rebuilding the ZIP.
            • Lists every active per-machine ext-client (created via
              /bootstrap) and shows the LOCALLY-CACHED secret (we keep the
              plaintext in localStorage so it survives page reload — the
              server only stores the salted hash).
            • Lets the admin generate / rotate at any time. */}
      <section className="rounded-2xl border border-[#E4E4E7] bg-white p-4 sm:p-5 md:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between sm:gap-4 mb-4 sm:mb-5">
          <div className="min-w-0 flex-1">
            <h3 className="text-[15px] sm:text-base md:text-lg font-semibold text-[#18181B]">Extension keys</h3>
            <p className="mt-1 text-[12px] sm:text-sm text-[#71717A] max-w-2xl leading-relaxed">
              Vessel Sync uses the <b className="text-[#18181B]">Shared HMAC secret</b> below.
              The BIBI Cars (auction parser) extension uses
              <b className="text-[#18181B]"> per-machine</b> client IDs/secrets — generate them in the second block.
            </p>
          </div>
          <button
            onClick={bootstrapExtClient}
            disabled={extLoading}
            className="inline-flex items-center justify-center gap-2 h-10 px-3.5 sm:px-4 shrink-0 w-full sm:w-auto rounded-xl bg-[#18181B] text-[13px] sm:text-sm font-medium text-white hover:bg-[#27272A] transition-colors shadow-sm disabled:opacity-40 focus:outline-none focus-visible:ring-4 focus-visible:ring-black/10"
            data-testid="vf-ext-bootstrap"
          >
            + Generate new client
          </button>
        </div>

        {/* ── Shared HMAC secret ── (always visible, never lost) ── */}
        <div className="mb-4 rounded-2xl border border-[#E4E4E7] bg-white p-4">
          <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
            <div className="min-w-0">
              <h4 className="text-[13px] font-semibold text-[#18181B] flex items-center gap-2 flex-wrap">
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-[#16A34A] shrink-0" />
                Shared HMAC secret
                <span className="text-[11px] font-normal text-[#71717A]">(Vessel Sync · always available)</span>
              </h4>
              <div className="text-[11.5px] text-[#71717A] mt-1.5 leading-relaxed break-words">
                {sharedSecret?.configured
                  ? <>Source: <code className="bg-zinc-50 border border-[#E4E4E7] rounded px-1.5 py-0.5 text-[11px] text-[#18181B]">{sharedSecret.source}</code>  ·  Fingerprint: <code className="bg-zinc-50 border border-[#E4E4E7] rounded px-1.5 py-0.5 text-[11px] text-[#18181B]">{sharedSecret.fingerprint}…</code>  ·  Length: {sharedSecret.length}</>
                  : 'EXT_SHARED_SECRET is NOT set in backend .env — Vessel Sync extension cannot HMAC-sign requests until you set it.'}
              </div>
            </div>
            {sharedSecret?.configured && (
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setSharedSecretVisible(v => !v)}
                  className="inline-flex items-center h-9 px-3 rounded-xl border border-[#E4E4E7] bg-white text-xs font-medium text-[#18181B] hover:bg-zinc-50 transition-colors focus:outline-none focus-visible:ring-4 focus-visible:ring-black/10"
                >
                  {sharedSecretVisible ? 'Hide' : 'Show'}
                </button>
                <button
                  type="button"
                  onClick={() => copyToClipboard(sharedSecret.secret, 'shared-secret')}
                  className="inline-flex items-center h-9 px-3 rounded-xl bg-[#18181B] text-xs font-medium text-white hover:bg-[#27272A] transition-colors focus:outline-none focus-visible:ring-4 focus-visible:ring-black/10"
                  data-testid="vf-shared-secret-copy"
                >
                  {copiedField === 'shared-secret' ? '✓ Copied' : 'Copy'}
                </button>
              </div>
            )}
          </div>
          {sharedSecret?.configured && (
            <code
              className="block bg-zinc-50 border border-[#E4E4E7] rounded-xl px-3 py-2.5 text-[12px] text-[#18181B] break-all font-mono"
              data-testid="vf-shared-secret-value"
            >
              {sharedSecretVisible ? sharedSecret.secret : '•'.repeat(Math.min(48, sharedSecret.length || 48))}
            </code>
          )}
          {sharedSecret?.usage && (
            <div className="mt-2 text-[11.5px] text-[#71717A] leading-relaxed">{sharedSecret.usage}</div>
          )}
        </div>

        {extError && (
          <div className="mb-3 rounded-lg bg-[#FEE2E2] border border-[#FCA5A5] text-[#7F1D1D] text-[12px] px-3 py-2">
            {extError}
          </div>
        )}

        {/* "One-time" reveal banner — secret is shown ONLY right after
            bootstrap/rotate; copying is the only way to keep it. */}
        {newSecret && (
          <div className="mb-3 rounded-2xl border border-[#E4E4E7] bg-white p-4">
            <div className="flex items-center justify-between mb-2 gap-3">
              <div className="flex items-center gap-2 text-[13px] font-semibold text-[#18181B] min-w-0">
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-[#F59E0B] shrink-0" />
                <span className="truncate">New keys for: {newSecret.name || newSecret.clientId}</span>
              </div>
              <button
                onClick={() => setNewSecret(null)}
                className="text-[12px] text-[#71717A] hover:text-[#18181B] underline shrink-0"
              >
                Dismiss
              </button>
            </div>
            <div className="text-[11.5px] text-[#71717A] mb-3 leading-relaxed">
              <b className="text-[#18181B]">Copy the secret now.</b> It is hashed on the server and cannot be shown again.
              Rotate to issue a new one.
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <div className="text-[10.5px] uppercase tracking-wider text-[#71717A] font-semibold mb-1.5">Client ID</div>
                <div className="flex items-center gap-2 bg-zinc-50 rounded-xl border border-[#E4E4E7] px-3 py-2">
                  <code className="text-[12px] text-[#18181B] flex-1 break-all" data-testid="vf-ext-new-client-id">{newSecret.clientId}</code>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(newSecret.clientId, `new-${newSecret.clientId}-id`)}
                    className="text-[11px] text-[#18181B] underline hover:no-underline whitespace-nowrap"
                  >
                    {copiedField === `new-${newSecret.clientId}-id` ? 'copied' : 'copy'}
                  </button>
                </div>
              </div>
              <div>
                <div className="text-[10.5px] uppercase tracking-wider text-[#71717A] font-semibold mb-1.5">Client Secret (shown once)</div>
                <div className="flex items-center gap-2 bg-zinc-50 rounded-xl border border-[#E4E4E7] px-3 py-2">
                  <code className="text-[12px] text-[#18181B] flex-1 break-all" data-testid="vf-ext-new-client-secret">{newSecret.secret}</code>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(newSecret.secret, `new-${newSecret.clientId}-secret`)}
                    className="text-[11px] text-[#18181B] underline hover:no-underline whitespace-nowrap"
                  >
                    {copiedField === `new-${newSecret.clientId}-secret` ? 'copied' : 'copy'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* List of existing clients */}
        {extClients.length === 0 ? (
          <div className="text-[12.5px] text-[#71717A] py-2">
            No per-machine extension clients yet. Click <b>Generate new client</b> above to create one (only needed for the <b>BIBI Cars (auction parser)</b> extension — Vessel Sync uses the shared secret above).
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[12.5px]">
              <thead>
                <tr className="text-left text-[10.5px] uppercase tracking-wider text-[#71717A] border-b border-[#E4E4E7]">
                  <th className="py-2 pr-3 font-semibold">Client ID</th>
                  <th className="py-2 pr-3 font-semibold">Name</th>
                  <th className="py-2 pr-3 font-semibold">Secret (cached locally)</th>
                  <th className="py-2 pr-3 font-semibold">Status</th>
                  <th className="py-2 pr-3 font-semibold">Created</th>
                  <th className="py-2 pr-3 font-semibold text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {extClients.map((c) => {
                  const cached = cachedSecrets[c.clientId];
                  const revealKey = `reveal-${c.clientId}`;
                  return (
                  <tr key={c.clientId} className="border-b border-[#F4F4F5] align-top">
                    <td className="py-2 pr-3">
                      <div className="flex items-center gap-2">
                        <code className="text-[12px] text-[#18181B] break-all">{c.clientId}</code>
                        <button
                          type="button"
                          onClick={() => copyToClipboard(c.clientId, `list-${c.clientId}-id`)}
                          className="text-[11px] text-[#18181B] underline hover:no-underline"
                        >
                          {copiedField === `list-${c.clientId}-id` ? 'copied' : 'copy'}
                        </button>
                      </div>
                    </td>
                    <td className="py-2 pr-3 text-[#18181B]">{c.name || '—'}</td>
                    <td className="py-2 pr-3">
                      {cached ? (
                        <div className="flex items-center gap-2">
                          <code
                            className="text-[11.5px] text-[#18181B] bg-zinc-50 border border-[#E4E4E7] rounded px-1.5 py-0.5 break-all"
                            style={{
                              filter: copiedField === revealKey ? 'none' : 'blur(4px)',
                              transition: 'filter 0.15s ease',
                              maxWidth: 180,
                              display: 'inline-block',
                            }}
                            onMouseEnter={() => setCopiedField(revealKey)}
                            onMouseLeave={() => setCopiedField(null)}
                            title="Hover to reveal · click 'copy' to grab"
                          >
                            {cached.secret}
                          </code>
                          <div className="flex flex-col gap-0.5">
                            <button
                              type="button"
                              onClick={() => copyToClipboard(cached.secret, `cached-${c.clientId}`)}
                              className="text-[10.5px] text-[#18181B] underline hover:no-underline whitespace-nowrap"
                            >
                              {copiedField === `cached-${c.clientId}` ? '✓ copied' : 'copy'}
                            </button>
                            <button
                              type="button"
                              onClick={() => { if (window.confirm('Forget this secret from local cache?')) forgetCachedSecret(c.clientId); }}
                              className="text-[10.5px] text-[#DC2626] underline hover:no-underline whitespace-nowrap"
                              title="Remove from local cache. The client itself stays active on the server."
                            >
                              forget
                            </button>
                          </div>
                        </div>
                      ) : (
                        <span className="text-[11px] text-[#A1A1AA] italic">not cached — rotate to issue a new one</span>
                      )}
                    </td>
                    <td className="py-2 pr-3">
                      {c.active ? (
                        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border border-[#E4E4E7] bg-white text-[10.5px] font-semibold text-[#18181B]"><span className="inline-block w-1.5 h-1.5 rounded-full bg-[#16A34A]" />active</span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border border-[#E4E4E7] bg-white text-[10.5px] font-semibold text-[#71717A]"><span className="inline-block w-1.5 h-1.5 rounded-full bg-[#DC2626]" />revoked</span>
                      )}
                    </td>
                    <td className="py-2 pr-3 text-[#71717A] text-[11.5px]">
                      {c.createdAt ? new Date(c.createdAt).toLocaleString() : '—'}
                    </td>
                    <td className="py-2 pr-3 text-right">
                      <button
                        type="button"
                        onClick={() => rotateExtClient(c.clientId)}
                        disabled={extLoading}
                        className="inline-flex items-center gap-1 rounded border border-[#E4E4E7] bg-white px-2 py-1 text-[11px] font-semibold text-[#18181B] hover:bg-[#FAFAFA] disabled:opacity-40"
                      >
                        Rotate secret
                      </button>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ================ STATUS STRIP ================ */}
      <section className="rounded-2xl border border-[#E4E4E7] bg-white p-4 sm:p-5">
        <div className="space-y-3 mb-4">
          <div className="flex items-center gap-2 flex-wrap">
            <StatusPill kind={extensionOk ? 'healthy' : 'expired'}>
              {t('vfPillStep1Prefix')} {extensionOk ? t('vfPillStep1Working') : t('vfPillStep1Offline')}
            </StatusPill>
            <StatusPill kind={vfFetchOkOrMatch ? 'healthy' : (extensionOk ? 'degraded' : 'offline')}>
              {t('vfPillStep2Prefix')} {vfFetchOkOrMatch ? '✓' : '—'}
            </StatusPill>
            <StatusPill kind={matchOk ? 'healthy' : (vfFetchOkOrMatch ? 'degraded' : 'offline')}>
              {t('vfPillStep3Prefix')} {matchOk ? '✓' : '—'}
            </StatusPill>
            {status?.extensionVersion && (
              <span className="text-[11.5px] text-[#71717A] ml-1">ext v{status.extensionVersion}</span>
            )}
          </div>
          <div className="flex flex-nowrap items-center gap-2 -mx-1 px-1 overflow-x-auto sm:flex-wrap sm:overflow-visible sm:mx-0 sm:px-0 no-scrollbar">
            <button
              onClick={pingSession}
              disabled={busy || !status?.connected}
              className="inline-flex items-center gap-2 h-10 px-3.5 sm:px-4 shrink-0 rounded-xl bg-[#18181B] text-[13px] sm:text-sm font-medium text-white hover:bg-[#27272A] transition-colors disabled:opacity-40 focus:outline-none focus-visible:ring-4 focus-visible:ring-black/10"
              data-testid="vf-check-session-button"
            >
              <Lightning size={14} weight="fill" /> <span>{t('vfBtnPingSession')}</span>
            </button>
            <button
              onClick={tickAllActive}
              disabled={!activeCount}
              className="inline-flex items-center gap-2 h-10 px-3.5 sm:px-4 shrink-0 rounded-xl border border-[#E4E4E7] bg-white text-[13px] sm:text-sm font-medium text-[#18181B] hover:bg-zinc-50 transition-colors disabled:opacity-40 focus:outline-none focus-visible:ring-4 focus-visible:ring-black/10"
              data-testid="vf-tick-all-button"
            >
              <Target size={14} weight="duotone" /> <span className="whitespace-nowrap">{t('vfBtnTickAll')} ({activeCount})</span>
            </button>
            <button
              onClick={resetCounters}
              className="inline-flex items-center gap-2 h-10 px-3.5 sm:px-4 shrink-0 rounded-xl border border-[#E4E4E7] bg-white text-[13px] sm:text-sm font-medium text-[#18181B] hover:bg-zinc-50 transition-colors focus:outline-none focus-visible:ring-4 focus-visible:ring-black/10"
              title={t('vfBtnResetCountersTitle')}
              data-testid="vf-reset-counters-button"
            >
              <ArrowClockwise size={14} /> <span>{t('vfBtnResetCounters')}</span>
            </button>
            <button
              onClick={clearSession}
              disabled={!status?.connected}
              className="inline-flex items-center gap-2 h-10 px-3.5 sm:px-4 shrink-0 rounded-xl border border-[#FCA5A5] bg-white text-[13px] sm:text-sm font-medium text-[#DC2626] hover:bg-[#FEF2F2] transition-colors disabled:opacity-40 focus:outline-none focus-visible:ring-4 focus-visible:ring-red-200"
              data-testid="vf-disconnect-session-button"
            >
              <Power size={14} /> <span>{t('vfBtnDisconnectSession')}</span>
            </button>
          </div>
        </div>
        {status?.sessionMessage && (
          <div className="mb-4 text-[13px] rounded-xl border border-[#E4E4E7] bg-[#FAFAFA] px-3 py-2 text-[#3F3F46] flex items-center gap-2">
            <span
              className="inline-block w-1.5 h-1.5 rounded-full flex-shrink-0"
              style={{ background:
                sessionStatus === 'healthy' ? '#16A34A' :
                sessionStatus === 'expired' ? '#DC2626' :
                '#F59E0B'
              }}
            />
            {status.sessionMessage}
          </div>
        )}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2 sm:gap-3">
          <Stat label={t('cookiesLabel')} value={status?.cookiesCount ?? 0} icon={CheckCircle} tone={status?.cookiesCount ? 'emerald' : 'slate'} />
          <Stat label={t('heartbeatLabel')} value={status?.heartbeatAgeSec != null ? fmtAgo(status.lastHeartbeatAt) : '—'} sub={extensionOk ? t('vfStatExtAlive') : t('vfStatExtNoSignal')} tone={extensionOk ? 'emerald' : 'rose'} />
          <Stat label={t('vfStatVfResponds')} value={status?.vfFetchOkCount != null ? (status.vfFetchOkCount + (status?.successCount || 0)) : '—'} sub={status?.lastVfFetchOkAt ? fmtAgo(status.lastVfFetchOkAt) : (status?.lastSuccessAt ? fmtAgo(status.lastSuccessAt) : t('vfStatVfNoSuccess'))} tone={vfFetchOkOrMatch ? 'emerald' : 'slate'} />
          <Stat label={t('vfStatOurMatches')} value={status?.successCount ?? 0} sub={status?.lastSuccessAt ? fmtAgo(status.lastSuccessAt) : t('vfStatNoMatchesYet')} tone={matchOk ? 'emerald' : 'slate'} />
          <Stat label={t('vfStatLastReason')} value={status?.consecutiveFails != null ? `${status.consecutiveFails} ${t('vfStatConsecutive')}` : '—'} sub={status?.lastFailReason || t('vfStatOkLabel')} tone={status?.consecutiveFails > 5 ? 'amber' : 'slate'} />
        </div>
      </section>

      {/* ================ UNIFIED SEARCH ================ */}
      <section className="rounded-2xl border border-[#E4E4E7] bg-white p-4 sm:p-5 md:p-6">
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <MagnifyingGlass size={18} className="text-[#18181B]" weight="bold" />
          <h2 className="text-base font-semibold text-[#18181B]">{t('vfSearchTitle')}</h2>
          <span className="text-xs text-[#71717A] basis-full sm:basis-auto">
            {t('vfSearchHint')}
          </span>
        </div>
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && runSearch()}
            placeholder={t('adm_msc_oscar_wbaja7c52kww12345_227280290_mscu1234567')}
            className="flex-1 h-11 px-3 py-2.5 rounded-xl border border-[#E4E4E7] bg-white text-sm text-[#18181B] focus:outline-none focus:border-[#18181B] focus-visible:ring-4 focus-visible:ring-black/10 transition-colors"
            data-testid="vf-search-input"
          />
          <button
            onClick={runSearch}
            disabled={searching || !query.trim()}
            className="h-11 px-5 sm:w-auto self-stretch sm:self-auto rounded-xl bg-[#18181B] text-sm font-medium text-white hover:bg-[#27272A] transition-colors disabled:opacity-40 focus:outline-none focus-visible:ring-4 focus-visible:ring-black/10"
            data-testid="vf-search-find-button"
          >
            {searching ? t('vfSearchSearching') : t('vfSearchFind')}
          </button>
        </div>

        {searchData && (
          <div className="mt-4 space-y-3">
            <div className="text-xs text-[#71717A] flex items-center gap-3">
              <span>{t('adm_found')} <b className="text-[#18181B]">{totalFound}</b></span>
              {classification && (
                <span className="inline-flex items-center gap-1 rounded-full border border-[#E4E4E7] bg-zinc-50 px-2 py-0.5 font-mono text-[10px] text-[#18181B]">
                  type: {classification}
                </span>
              )}
            </div>

            {/* Live vessels */}
            {liveVessels.length > 0 && (
              <div>
                <div className="text-xs font-semibold text-[#18181B] mb-2 flex items-center gap-1.5">
                  <Boat size={14} weight="fill" className="text-[#71717A]" /> {t('r9_live_vessels')} (VesselFinder) — {liveVessels.length}
                </div>
                <div className="overflow-x-auto rounded-xl border border-[#E4E4E7]">
                  <table className="w-full text-xs">
                    <thead className="bg-zinc-50 text-[#71717A]">
                      <tr>
                        <th className="p-2.5 text-left font-semibold uppercase tracking-wider text-[10.5px]">{t('name')}</th>
                        <th className="p-2.5 text-left font-semibold uppercase tracking-wider text-[10.5px]">MMSI</th>
                        <th className="p-2.5 text-left font-semibold uppercase tracking-wider text-[10.5px]">IMO</th>
                        <th className="p-2.5 text-left font-semibold uppercase tracking-wider text-[10.5px]">{t('positionLabel')}</th>
                        <th className="p-2.5 text-left font-semibold uppercase tracking-wider text-[10.5px]">{t('speedLabel')}</th>
                        <th className="p-2.5"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {liveVessels.map((v, i) => (
                        <tr key={i} className="border-t border-[#F4F4F5] hover:bg-zinc-50/60">
                          <td className="p-2.5 font-medium text-[#18181B]">{v.name || '—'}</td>
                          <td className="p-2.5 font-mono text-[10px] text-[#18181B]">{v.mmsi || '—'}</td>
                          <td className="p-2.5 font-mono text-[10px] text-[#18181B]">{v.imo || '—'}</td>
                          <td className="p-2.5 font-mono text-[10px] text-[#18181B]">
                            {v.lat != null ? `${v.lat.toFixed(3)}, ${v.lng?.toFixed(3)}` : '—'}
                          </td>
                          <td className="p-2.5 text-[#18181B]">{v.speed ?? '—'} kn</td>
                          <td className="p-2.5">
                            <button
                              onClick={() => prefillBind(v)}
                              className="inline-flex items-center h-8 px-3 rounded-xl bg-[#18181B] text-[11px] font-medium text-white hover:bg-[#27272A] transition-colors"
                            >
                              {t('adm_bind_2')}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Rich shipment results (VIN / container / vessel name / MMSI / IMO) */}
            {richShipments.length > 0 && (
              <div>
                <div className="text-xs font-semibold text-[#18181B] mb-2 flex items-center gap-1.5">
                  <Target size={14} weight="fill" className="text-[#71717A]" /> Shipments (VIN / container / vessel) — {richShipments.length}
                </div>
                <div className="overflow-x-auto rounded-xl border border-[#E4E4E7] bg-white">
                  <table className="w-full text-xs">
                    <thead className="bg-zinc-50 text-[#71717A]">
                      <tr>
                        <th className="p-2.5 text-left font-semibold uppercase tracking-wider text-[10.5px]">{t('adm_vin_car')}</th>
                        <th className="p-2.5 text-left font-semibold uppercase tracking-wider text-[10.5px]">{t('adm_container_vessel')}</th>
                        <th className="p-2.5 text-left font-semibold uppercase tracking-wider text-[10.5px]">{t('adm_route')}</th>
                        <th className="p-2.5 text-left font-semibold uppercase tracking-wider text-[10.5px]">{t('progress')}</th>
                        <th className="p-2.5 text-left font-semibold uppercase tracking-wider text-[10.5px]">{t('sourceHealth')}</th>
                        <th className="p-2.5"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {richShipments.map((s) => {
                        const healthDot = s.trackingHealth === 'ok' ? '#16A34A'
                          : s.trackingHealth === 'stale' ? '#DC2626'
                          : s.trackingHealth === 'estimated' ? '#F59E0B'
                          : '#A1A1AA';
                        const healthLabel = s.trackingHealth === 'ok' ? 'Live'
                          : s.trackingHealth === 'stale' ? 'Stale'
                          : s.trackingHealth === 'estimated' ? 'Estimated'
                          : '—';
                        return (
                          <tr key={s.id} className="border-t border-[#F4F4F5] hover:bg-zinc-50/60" data-testid={`rich-shipment-${s.id}`}>
                            <td className="p-2.5">
                              <div className="font-mono text-[11px] text-[#18181B]">{s.vin || '—'}</div>
                              <div className="font-mono text-[10px] text-[#A1A1AA]">{s.id}</div>
                              {s.vehicleTitle && <div className="text-[11px] text-[#71717A] mt-0.5">{s.vehicleTitle}</div>}
                            </td>
                            <td className="p-2.5">
                              {s.currentContainer?.number && (
                                <div className="text-[11px] font-mono text-[#18181B]">
                                  {s.currentContainer.number}
                                </div>
                              )}
                              {s.currentVessel?.name && (
                                <div className="text-[11px] text-[#18181B] flex items-center gap-1 mt-0.5">
                                  <Anchor size={10} className="text-[#71717A]" /> {s.currentVessel.name}
                                  {s.currentVessel.mmsi && <span className="text-[9px] text-[#A1A1AA] font-mono">· {s.currentVessel.mmsi}</span>}
                                </div>
                              )}
                              {!s.currentContainer?.number && !s.currentVessel?.name && (
                                <div className="text-[11px] text-[#A1A1AA] italic">{t('adm_not_assigned')}</div>
                              )}
                            </td>
                            <td className="p-2.5 text-[11px] text-[#71717A]">
                              {s.origin?.name || '—'} <span className="text-[#A1A1AA]">→</span> {s.destination?.name || '—'}
                              {s.location && <div className="text-[10px] text-[#A1A1AA] mt-0.5">{s.location}</div>}
                            </td>
                            <td className="p-2.5 w-28">
                              <div className="flex items-center gap-1.5">
                                <div className="flex-1 h-1.5 bg-zinc-100 rounded-full overflow-hidden">
                                  <div className="h-full bg-[#18181B]" style={{ width: `${Math.round((s.progress || 0) * 100)}%` }} />
                                </div>
                                <span className="text-[10px] font-semibold text-[#18181B] w-7 text-right">{Math.round((s.progress || 0) * 100)}%</span>
                              </div>
                            </td>
                            <td className="p-2.5">
                              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border border-[#E4E4E7] bg-white text-[10px] font-semibold text-[#18181B]">
                                <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ background: healthDot }} />
                                {healthLabel}
                              </span>
                            </td>
                            <td className="p-2.5 text-right whitespace-nowrap">
                              <button
                                onClick={() => { setBindShipmentId(s.id); document.getElementById('bind-card')?.scrollIntoView({ behavior: 'smooth' }); }}
                                className="inline-flex items-center h-8 px-3 rounded-xl border border-[#E4E4E7] bg-white text-[10px] font-medium text-[#18181B] hover:bg-zinc-50 transition-colors"
                              >
                                {t('adm_bind')}
                              </button>
                              <button
                                onClick={() => tickShipment(s.id)}
                                disabled={tickingId === s.id}
                                className="ml-1 inline-flex items-center h-8 px-3 rounded-xl bg-[#18181B] text-[10px] font-medium text-white hover:bg-[#27272A] transition-colors disabled:opacity-40"
                              >
                                {tickingId === s.id ? '…' : 'Tick'}
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* DB shipments */}
            {dbShipments.length > 0 && (
              <div>
                <div className="text-xs font-semibold text-[#18181B] mb-2 flex items-center gap-1.5">
                  <Target size={14} weight="fill" className="text-[#71717A]" /> {t('r9_shipments_in_db')} — {dbShipments.length}
                </div>
                <div className="space-y-1.5">
                  {dbShipments.map((s) => (
                    <div key={s.id} className="rounded-xl border border-[#E4E4E7] p-3 text-xs flex items-center gap-3 hover:bg-zinc-50/60">
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-[#18181B] truncate">{s.vehicleTitle || s.id}</div>
                        <div className="text-[#71717A] flex gap-2 font-mono text-[10px] mt-0.5">
                          <span>#{s.id}</span>
                          {s.vin && <span>VIN:{s.vin}</span>}
                          {s.vessel?.name && <span>· {s.vessel.name}</span>}
                        </div>
                      </div>
                      <button
                        onClick={() => { setBindShipmentId(s.id); document.getElementById('bind-card')?.scrollIntoView({ behavior: 'smooth' }); }}
                        className="text-[10px] font-medium text-[#18181B] underline hover:no-underline"
                      >
                        {t('adm_use_id')}
                      </button>
                      <button
                        onClick={() => tickShipment(s.id)}
                        disabled={tickingId === s.id}
                        className="inline-flex items-center h-8 px-3 rounded-xl bg-[#18181B] text-[10px] font-medium text-white hover:bg-[#27272A] transition-colors disabled:opacity-40"
                      >
                        {tickingId === s.id ? '…' : 'Tick'}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* No results */}
            {totalFound === 0 && !searching && (
              <div className="rounded-xl border border-dashed border-[#E4E4E7] p-6 text-center text-xs text-[#71717A]">
                {t('r9_nothing_found')}. {searchData?.live?.error ? <span className="text-[#DC2626]">Live: {String(searchData.live.error).slice(0, 120)}</span> : null}
              </div>
            )}
          </div>
        )}
      </section>

      {/* ================ SHIPMENTS WITH TICK ================ */}
      <section className="rounded-2xl border border-[#E4E4E7] bg-white p-4 sm:p-5 md:p-6">
        <div className="flex items-center justify-between gap-2 mb-4">
          <h2 className="text-base font-semibold text-[#18181B] flex items-center gap-2 min-w-0">
            <Boat size={18} weight="duotone" className="text-[#18181B] shrink-0" />
            <span className="truncate">{t('vfActiveShipments')}</span>
            <span className="text-xs text-[#71717A] font-normal shrink-0">({shipments.length})</span>
          </h2>
          <button onClick={loadShipments} className="inline-flex items-center justify-center h-9 w-9 shrink-0 rounded-xl bg-[#18181B] text-white hover:bg-[#27272A] active:bg-black transition-colors focus:outline-none focus-visible:ring-4 focus-visible:ring-black/15" aria-label={t('vfBtnRefreshTitle')} title={t('vfBtnRefreshTitle')}>
            <ArrowClockwise size={14} weight="bold" />
          </button>
        </div>
        {shipments.length === 0 ? (
          <div className="text-center py-10 text-sm text-[#71717A]">{t('vfShipmentsEmpty')}</div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-[#E4E4E7]">
            <table className="w-full text-xs">
              <thead className="bg-zinc-50 text-[#71717A]">
                <tr>
                  <th className="p-2.5 text-left font-semibold uppercase tracking-wider text-[10.5px]">{t('shipmentAlerts')}</th>
                  <th className="p-2.5 text-left font-semibold uppercase tracking-wider text-[10.5px]">{t('vessel')}</th>
                  <th className="p-2.5 text-left font-semibold uppercase tracking-wider text-[10.5px]">VIN</th>
                  <th className="p-2.5 text-left font-semibold uppercase tracking-wider text-[10.5px]">{t('trackingLabel')}</th>
                  <th className="p-2.5 text-left font-semibold uppercase tracking-wider text-[10.5px]">{t('adm_last_result')}</th>
                  <th className="p-2.5"></th>
                </tr>
              </thead>
              <tbody>
                {shipments.map((s) => {
                  const r = tickResults[s.id];
                  return (
                    <tr key={s.id} className="border-t border-[#F4F4F5] hover:bg-zinc-50/60">
                      <td className="p-2.5">
                        <div className="font-semibold text-[#18181B]">{s.vehicleTitle || '—'}</div>
                        <div className="font-mono text-[10px] text-[#71717A]">{s.id}</div>
                      </td>
                      <td className="p-2.5">
                        {s.vessel?.name ? (
                          <>
                            <div className="font-medium text-[#18181B]">{s.vessel.name}</div>
                            <div className="font-mono text-[10px] text-[#71717A]">
                              {s.vessel.mmsi ? `MMSI:${s.vessel.mmsi}` : ''} {s.vessel.imo ? `IMO:${s.vessel.imo}` : ''}
                            </div>
                          </>
                        ) : <span className="text-[#A1A1AA]">{t('adm_not_assigned_2')}</span>}
                      </td>
                      <td className="p-2.5 font-mono text-[10px] text-[#18181B]">{s.vin || '—'}</td>
                      <td className="p-2.5">
                        {s.trackingActive
                          ? <span className="inline-flex items-center gap-1.5 rounded-full border border-[#E4E4E7] bg-white px-2 py-0.5 text-[10px] font-semibold text-[#18181B]"><span className="inline-block w-1.5 h-1.5 rounded-full bg-[#16A34A]" /> ON</span>
                          : <span className="inline-flex items-center gap-1.5 rounded-full border border-[#E4E4E7] bg-white px-2 py-0.5 text-[10px] font-semibold text-[#71717A]"><span className="inline-block w-1.5 h-1.5 rounded-full bg-[#A1A1AA]" /> OFF</span>}
                      </td>
                      <td className="p-2.5 text-[10px]">
                        {r ? (
                          r.ok ? (
                            <span className="text-[#16A34A]">✓ {r.data?.source || 'ok'} @{r.at.toLocaleTimeString()}</span>
                          ) : (
                            <span className="text-[#DC2626]" title={r.error}>✗ {String(r.error).slice(0, 40)}</span>
                          )
                        ) : <span className="text-[#A1A1AA]">—</span>}
                      </td>
                      <td className="p-2.5">
                        <button
                          onClick={() => tickShipment(s.id)}
                          disabled={tickingId === s.id}
                          className="inline-flex items-center gap-1 h-8 px-3 rounded-xl bg-[#18181B] text-[11px] font-medium text-white hover:bg-[#27272A] transition-colors disabled:opacity-40"
                        >
                          <Target size={11} /> {tickingId === s.id ? t('adm2_fd1567dc80') : 'Tick now'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ================ BIND (VIN-centric) ================ */}
      <section id="bind-card" className="rounded-2xl border border-[#E4E4E7] bg-white p-4 sm:p-5 md:p-6">
        <div className="flex items-center gap-2 mb-1">
          <LinkIcon size={18} className="text-[#18181B]" weight="bold" />
          <h2 className="text-base font-semibold text-[#18181B]">{t('vfBindTitle')}</h2>
        </div>
        <p className="text-xs text-[#71717A] mb-4 leading-relaxed">
          {t('vfBindIntro1')}<b>VIN</b>{t('vfBindIntro2')}
          {' '}{t('vfBindIntro3')}<b>{t('vfBindIntroBold')}</b>{t('vfBindIntro4')}
        </p>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <label className="text-xs text-[#18181B] font-medium md:col-span-2">
            {t('adm3_e033ab5ffe')}
            <input
              value={bindVin}
              onChange={(e) => setBindVin(e.target.value.toUpperCase())}
              className="mt-1 w-full h-11 rounded-xl border border-[#E4E4E7] bg-white px-3 py-2.5 text-sm font-mono uppercase text-[#18181B] focus:outline-none focus:border-[#18181B] focus-visible:ring-4 focus-visible:ring-black/10 transition-colors"
              placeholder={t('adm_wbaja7c52kww12345')}
            />
            {bindShipmentId && bindVin && (
              <div className="text-[10px] text-emerald-600 mt-0.5 font-mono">
                ✓ {t('r9_resolved')} → {bindShipmentId}
              </div>
            )}
          </label>
          <label className="text-xs text-[#18181B] font-medium md:col-span-2">
            {t('adm3_3d7afec746')}
            <input
              value={bindShipmentId}
              onChange={(e) => setBindShipmentId(e.target.value)}
              className="mt-1 w-full h-11 rounded-xl border border-[#E4E4E7] bg-white px-3 py-2.5 text-sm font-mono text-[#18181B] focus:outline-none focus:border-[#18181B] focus-visible:ring-4 focus-visible:ring-black/10 transition-colors"
              placeholder="ship_test_customer_001_1"
            />
          </label>
        </div>

        <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3">
          <label className="text-xs text-[#18181B] font-medium">
            {t('adm_vessel_name')}
            <input
              value={bindName}
              onChange={(e) => setBindName(e.target.value)}
              className="mt-1 w-full h-11 rounded-xl border border-[#E4E4E7] bg-white px-3 py-2.5 text-sm text-[#18181B] focus:outline-none focus:border-[#18181B] focus-visible:ring-4 focus-visible:ring-black/10 transition-colors"
              placeholder={t('adm_msc_oscar')}
            />
          </label>
          <label className="text-xs text-[#18181B] font-medium">
            MMSI
            <input
              value={bindMmsi}
              onChange={(e) => setBindMmsi(e.target.value)}
              className="mt-1 w-full h-11 rounded-xl border border-[#E4E4E7] bg-white px-3 py-2.5 text-sm font-mono text-[#18181B] focus:outline-none focus:border-[#18181B] focus-visible:ring-4 focus-visible:ring-black/10 transition-colors"
              placeholder="227280290"
            />
          </label>
          <label className="text-xs text-[#18181B] font-medium">
            IMO
            <input
              value={bindImo}
              onChange={(e) => setBindImo(e.target.value)}
              className="mt-1 w-full h-11 rounded-xl border border-[#E4E4E7] bg-white px-3 py-2.5 text-sm font-mono text-[#18181B] focus:outline-none focus:border-[#18181B] focus-visible:ring-4 focus-visible:ring-black/10 transition-colors"
              placeholder="9629344"
            />
          </label>
        </div>

        <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3">
          <label className="text-xs text-[#18181B] font-medium">
            {t('adm_container_5')}
            <input
              value={bindContainer}
              onChange={(e) => setBindContainer(e.target.value.toUpperCase())}
              className="mt-1 w-full h-11 rounded-xl border border-[#E4E4E7] bg-white px-3 py-2.5 text-sm font-mono text-[#18181B] focus:outline-none focus:border-[#18181B] focus-visible:ring-4 focus-visible:ring-black/10 transition-colors"
              placeholder={t('adm_msku1234567')}
            />
          </label>
          <label className="text-xs text-[#18181B] font-medium">
            {t('containerSeal')}
            <input
              value={bindContainerSeal}
              onChange={(e) => setBindContainerSeal(e.target.value)}
              className="mt-1 w-full h-11 rounded-xl border border-[#E4E4E7] bg-white px-3 py-2.5 text-sm font-mono text-[#18181B] focus:outline-none focus:border-[#18181B] focus-visible:ring-4 focus-visible:ring-black/10 transition-colors"
              placeholder={t('adm_seal001')}
            />
          </label>
          <label className="text-xs text-[#18181B] font-medium">
            {t('vfBindNewStageLabel')}
            <input
              value={bindNewStageLabel}
              onChange={(e) => setBindNewStageLabel(e.target.value)}
              className="mt-1 w-full h-11 rounded-xl border border-[#E4E4E7] bg-white px-3 py-2.5 text-sm text-[#18181B] focus:outline-none focus:border-[#18181B] focus-visible:ring-4 focus-visible:ring-black/10 transition-colors"
              placeholder={t('adm_transshipment_in_algeciras')}
            />
          </label>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            onClick={doBind}
            disabled={bindBusy || (!bindShipmentId && !bindVin.trim()) || (!bindMmsi && !bindImo && !bindName)}
            className="inline-flex items-center h-11 px-5 rounded-xl bg-[#18181B] text-sm font-medium text-white hover:bg-[#27272A] transition-colors disabled:opacity-40 focus:outline-none focus-visible:ring-4 focus-visible:ring-black/10"
            data-testid="vf-bind-button"
          >
            {bindBusy ? t('vfBindBinding') : t('vfBindAction')}
          </button>

          <button
            onClick={doTransferVessel}
            disabled={bindBusy || !bindShipmentId || (!bindMmsi && !bindImo && !bindName)}
            className="inline-flex items-center gap-2 h-11 px-4 rounded-xl border border-[#E4E4E7] bg-white text-sm font-medium text-[#18181B] hover:bg-zinc-50 transition-colors disabled:opacity-40 focus:outline-none focus-visible:ring-4 focus-visible:ring-black/10"
            title={t('vfBindForceNewStageTitle')}
            data-testid="vf-transfer-vessel-button"
          >
            <Warning size={14} weight="fill" className="text-[#F59E0B]" /> {t('vfBindForceNewStage')}
          </button>

          <label className="inline-flex items-center gap-2 text-xs text-[#18181B] font-medium ml-auto">
            <input
              type="checkbox"
              checked={bindForceNew}
              onChange={(e) => setBindForceNew(e.target.checked)}
              className="rounded border-[#E4E4E7] accent-[#18181B]"
            />
            {t('vfBindForceNewStage')}
          </label>
        </div>

        {bindResult?.ok && (
          <div className="mt-3 rounded-xl border border-[#E4E4E7] bg-white px-3 py-2.5 text-sm text-[#18181B] flex items-start gap-2">
            <CheckCircle size={16} weight="fill" className={`mt-0.5 flex-shrink-0 ${bindResult.data?.createdNewStage ? 'text-[#F59E0B]' : 'text-[#16A34A]'}`} />
            <div className="flex-1">
              <div className="font-medium">
                {bindResult.data?.createdNewStage
                  ? `${t('vfBindResultNewStage')}${bindResult.data?.newStageId}`
                  : t('vfBindResultUpdated')}
              </div>
              <div className="text-xs mt-0.5 text-[#71717A]">{t('shipmentAlerts')}<span className="font-mono text-[#18181B]">{bindResult.data?.shipmentId}</span>{t('vfBindStageCount')}<b className="text-[#18181B]">{bindResult.data?.vesselStagesCount}</b>
                {bindResult.data?.container && <> {t('adm_container_2')} <span className="font-mono text-[#18181B]">{bindResult.data.container.number}</span></>}
              </div>
            </div>
          </div>
        )}
        {bindResult && !bindResult.ok && (
          <div className="mt-3 rounded-xl border border-[#FCA5A5] bg-[#FEF2F2] px-3 py-2.5 text-sm text-[#7F1D1D] flex items-center gap-2">
            <XCircle size={16} weight="fill" /> {bindResult.error}
          </div>
        )}
      </section>

      {/* ================ VESSEL HISTORY ================ */}
      {bindShipmentId && (
        <section className="rounded-2xl border border-[#E4E4E7] bg-white p-4 sm:p-5 md:p-6">
          <div className="flex items-center gap-2 mb-4">
            <Boat size={18} weight="duotone" className="text-[#18181B]" />
            <h2 className="text-base font-semibold text-[#18181B]">{t('adm_shipping_history')}</h2>
            <span className="text-xs text-[#71717A] font-mono">{bindShipmentId}</span>
            <button
              onClick={() => loadVesselHistory(bindShipmentId)}
              className="ml-auto inline-flex items-center justify-center h-9 w-9 shrink-0 rounded-xl bg-[#18181B] text-white hover:bg-[#27272A] active:bg-black transition-colors focus:outline-none focus-visible:ring-4 focus-visible:ring-black/15"
              aria-label={t('adm_refresh_2')}
              title={t('adm_refresh_2')}
            >
              <ArrowClockwise size={14} weight="bold" />
            </button>
          </div>

          {historyLoading && (
            <div className="text-sm text-[#71717A]">{t('adm_loading_5')}</div>
          )}
          {vesselHistory?.error && (
            <div className="text-sm text-[#DC2626]">{vesselHistory.error}</div>
          )}
          {vesselHistory?.vesselStages?.length === 0 && (
            <div className="text-sm text-[#71717A] italic">
              {t('vfBindNoStages')}
            </div>
          )}
          {vesselHistory?.vesselStages?.length > 0 && (
            <div className="space-y-0">
              {vesselHistory.vesselStages.map((st, i) => {
                const isCurrent = st.isCurrent;
                const isDone = st.status === 'done';
                const dot = isCurrent
                  ? 'bg-[#18181B] ring-4 ring-zinc-200'
                  : isDone
                  ? 'bg-[#16A34A]'
                  : 'bg-[#D4D4D8]';
                const txt = isCurrent
                  ? 'text-[#18181B]'
                  : isDone
                  ? 'text-[#16A34A]'
                  : 'text-[#71717A]';
                const line = isDone ? 'bg-[#86EFAC]' : 'bg-[#E4E4E7]';
                return (
                  <div key={st.stageId} className="flex gap-3">
                    <div className="flex flex-col items-center">
                      <div className={`w-8 h-8 rounded-full ${dot} flex items-center justify-center`}>
                        {isDone ? (
                          <CheckCircle size={14} weight="fill" className="text-white" />
                        ) : (
                          <Boat size={12} weight={isCurrent ? 'fill' : 'regular'} className="text-white" />
                        )}
                      </div>
                      {i < vesselHistory.vesselStages.length - 1 && (
                        <div className={`flex-1 w-0.5 my-1 ${line}`} style={{ minHeight: '2rem' }} />
                      )}
                    </div>
                    <div className="flex-1 pb-5">
                      <div className="flex items-baseline gap-2 flex-wrap">
                        <div className={`font-semibold ${txt}`}>{st.label}</div>
                        {isCurrent && (
                          <span className="text-[10px] uppercase tracking-wider text-[#18181B] font-bold">{t('vfStageActive')}</span>
                        )}
                        {isDone && (
                          <span className="text-[10px] uppercase tracking-wider text-[#16A34A] font-semibold">{t('vfStageDone')}</span>
                        )}
                      </div>
                      {(st.from || st.to) && (
                        <div className="text-xs text-[#71717A] mt-1">
                          {st.from} <span className="mx-1">→</span> {st.to}
                        </div>
                      )}
                      <div className="text-[11px] flex flex-wrap gap-1.5 mt-2">
                        {st.vessel?.name && (
                          <span className="inline-flex items-center gap-1 font-mono bg-zinc-50 text-[#18181B] border border-[#E4E4E7] px-2 py-0.5 rounded-lg">
                            <Anchor size={10} className="text-[#71717A]" /> {st.vessel.name}
                          </span>
                        )}
                        {st.vessel?.mmsi && (
                          <span className="font-mono bg-zinc-50 text-[#71717A] border border-[#E4E4E7] px-2 py-0.5 rounded-lg">
                            MMSI {st.vessel.mmsi}
                          </span>
                        )}
                        {st.vessel?.imo && (
                          <span className="font-mono bg-zinc-50 text-[#71717A] border border-[#E4E4E7] px-2 py-0.5 rounded-lg">
                            IMO {st.vessel.imo}
                          </span>
                        )}
                        {st.container?.number && (
                          <span className="font-mono bg-zinc-50 text-[#18181B] border border-[#E4E4E7] px-2 py-0.5 rounded-lg">
                            {st.container.number}
                          </span>
                        )}
                      </div>
                      {(st.startedAt || st.completedAt) && (
                        <div className="text-[10px] text-[#A1A1AA] mt-1.5 font-mono">
                          {st.startedAt && <span>{t('adm3_4454f5463a')} {fmtAgo(st.startedAt)}</span>}
                          {st.completedAt && <span className="ml-3">{t('adm3_a63ec7aa83')} {fmtAgo(st.completedAt)}</span>}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
