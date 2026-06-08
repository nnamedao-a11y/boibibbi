/**
 * ExtClientsPage — per-manager extension HMAC secrets registry (Phase E)
 *
 * Manager wants: know which devices are allowed to sign Chrome-extension
 * traffic, rotate their secret, or instantly revoke a compromised one.
 *
 * Endpoints:
 *   GET  /api/admin/ext-clients
 *   POST /api/admin/ext-clients              body: {name, managerEmail?}
 *   POST /api/admin/ext-clients/{id}/revoke
 *   POST /api/admin/ext-clients/{id}/rotate
 *
 * Secret is shown ONLY on create/rotate (write-once).
 */
import React, { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { ArrowClockwise, Copy, Plus, Rocket, Warning, X } from '@phosphor-icons/react';

import { useLang } from '../../i18n';
const API =
  process.env.REACT_APP_BACKEND_URL ||
  import.meta?.env?.REACT_APP_BACKEND_URL ||
  '';

function authHeaders() {
  const token = localStorage.getItem('auth_token') || localStorage.getItem('token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export default function ExtClientsPage() {
  const { t } = useLang();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({ name: '', managerEmail: '' });
  const [secretShow, setSecretShow] = useState(null); // {clientId, secret}
  const [bootstrapResult, setBootstrapResult] = useState(null);
  const [bootstrapping, setBootstrapping] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await axios.get(`${API}/api/admin/ext-clients`, { headers: authHeaders() });
      setItems(r.data.items || []);
    } catch (e) {
      toast.error(e.response?.data?.detail || e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const createOne = async () => {
    if (!form.name.trim()) {
      toast.error(t('adm_name_is_required_2'));
      return;
    }
    try {
      const r = await axios.post(
        `${API}/api/admin/ext-clients`,
        { name: form.name.trim(), managerEmail: form.managerEmail.trim() || undefined },
        { headers: authHeaders() },
      );
      setSecretShow({ clientId: r.data.clientId, secret: r.data.secret });
      setForm({ name: '', managerEmail: '' });
      await load();
    } catch (e) {
      toast.error(e.response?.data?.detail || e.message);
    }
  };

  const bootstrapAll = async () => {
    if (!window.confirm(t('r9_create_ext_client_confirm'))) return;
    setBootstrapping(true);
    try {
      const r = await axios.post(
        `${API}/api/admin/ext-clients/bootstrap`,
        {},
        { headers: authHeaders() },
      );
      setBootstrapResult(r.data);
      const { created = [], skipped = [], totalManagers = 0 } = r.data;
      if (created.length > 0) {
        toast.success(`${t('r9_created')}: ${created.length} · ${t('r9_skipped')}: ${skipped.length} · ${t('r9_total_managers')}: ${totalManagers}`);
      } else if (totalManagers === 0) {
        toast.info(t('adm_no_managers_in_the_system_yet_create_them_via_admi'));
      } else {
        toast.info(`${t('r9_all')} ${totalManagers} ${t('r9_managers_have_active_client')}`);
      }
      await load();
    } catch (e) {
      toast.error(e.response?.data?.detail || e.message);
    } finally {
      setBootstrapping(false);
    }
  };

  const revoke = async (clientId) => {
    if (!window.confirm(`${t('r9_revoke_client')} ${clientId}? ${t('r9_signatures_invalid')}`)) return;
    try {
      await axios.post(`${API}/api/admin/ext-clients/${clientId}/revoke`, {}, { headers: authHeaders() });
      toast.success(t('adm_withdrawn'));
      await load();
    } catch (e) {
      toast.error(e.response?.data?.detail || e.message);
    }
  };

  const rotate = async (clientId) => {
    if (!window.confirm(t('adm3_b1211eb53f'))) return;
    try {
      const r = await axios.post(
        `${API}/api/admin/ext-clients/${clientId}/rotate`,
        {},
        { headers: authHeaders() },
      );
      setSecretShow({ clientId, secret: r.data.secret });
      await load();
    } catch (e) {
      toast.error(e.response?.data?.detail || e.message);
    }
  };

  const copyToClipboard = (value, label) => {
    navigator.clipboard?.writeText(value);
    toast.success(label || t('copied'));
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* ── Page header ───────────────────────────────────────── */}
      <div className="min-w-0">
        <h1
          className="text-xl sm:text-2xl md:text-3xl font-bold text-[#18181B] leading-tight"
          style={{ fontFamily: 'Mazzard, Mazzard H, Mazzard M, system-ui, sans-serif' }}
        >
          {t('adm_extension_hmacclients')}
        </h1>
        <p className="mt-1 text-[12px] sm:text-sm text-[#71717A] max-w-2xl leading-relaxed">
          {t('adm3_a5aeb1abd6')}
        </p>
      </div>

      {/* ── New customer card ─────────────────────────────────── */}
      <section className="rounded-2xl border border-[#E4E4E7] bg-white p-4 sm:p-5 md:p-6">
        <h3 className="text-[15px] sm:text-base font-semibold text-[#18181B] mb-4">
          {t('adm_new_customer')}
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
          <label className="block">
            <span className="text-xs font-medium text-[#18181B]">{t('adm_name_2')}</span>
            <input
              data-testid="new-client-name"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="manager-alice"
              className="mt-1 w-full h-11 px-3 py-2.5 rounded-xl border border-[#E4E4E7] bg-white text-sm text-[#18181B] focus:outline-none focus:border-[#18181B] focus-visible:ring-4 focus-visible:ring-black/10 transition-colors"
            />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-[#18181B]">{t('adm3_email_df557ae5ed')}</span>
            <input
              data-testid="new-client-email"
              value={form.managerEmail}
              onChange={(e) => setForm((f) => ({ ...f, managerEmail: e.target.value }))}
              placeholder={t('adm_alicebibicars')}
              className="mt-1 w-full h-11 px-3 py-2.5 rounded-xl border border-[#E4E4E7] bg-white text-sm text-[#18181B] focus:outline-none focus:border-[#18181B] focus-visible:ring-4 focus-visible:ring-black/10 transition-colors"
            />
          </label>
        </div>
        <div className="mt-4 flex flex-col sm:flex-row gap-2 sm:gap-3">
          <button
            data-testid="create-client-btn"
            onClick={createOne}
            className="inline-flex items-center justify-center gap-2 h-11 px-5 rounded-xl bg-[#18181B] text-sm font-medium text-white hover:bg-[#27272A] transition-colors focus:outline-none focus-visible:ring-4 focus-visible:ring-black/10"
          >
            <Plus size={15} weight="bold" /> {t('adm_create')}
          </button>
          <button
            data-testid="bootstrap-btn"
            onClick={bootstrapAll}
            disabled={bootstrapping}
            className="inline-flex items-center justify-center gap-2 h-11 px-5 rounded-xl border border-[#E4E4E7] bg-white text-sm font-medium text-[#18181B] hover:bg-zinc-50 transition-colors disabled:opacity-50 focus:outline-none focus-visible:ring-4 focus-visible:ring-black/10"
            title={t('adm_automatically_create_ext_client_for_all_managers_w')}
          >
            <Rocket size={15} weight="duotone" /> {bootstrapping ? 'Bootstrap…' : t('adm3_e6eda2f1ae')}
          </button>
        </div>
      </section>

      {/* ── Bootstrap result panel ────────────────────────────── */}
      {bootstrapResult && (
        <section
          data-testid="bootstrap-result"
          className="rounded-2xl border border-[#E4E4E7] bg-white p-4 sm:p-5"
        >
          <div className="flex items-start justify-between gap-3 mb-3">
            <div className="min-w-0">
              <div className="text-[13px] sm:text-sm font-semibold text-[#18181B] flex items-center gap-2">
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-[#16A34A]" />
                {t('adm_bootstrap_managers_result')}
              </div>
              <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-[12px] sm:text-[13px] text-[#71717A]">
                <span>{t('adm_total_managers')} <b className="text-[#18181B]">{bootstrapResult.totalManagers}</b></span>
                <span>{t('adm_created')} <b className="text-[#18181B]">{bootstrapResult.created?.length || 0}</b></span>
                <span>{t('adm3_caa452faa9')} <b className="text-[#18181B]">{bootstrapResult.skipped?.length || 0}</b></span>
              </div>
            </div>
            <button
              onClick={() => setBootstrapResult(null)}
              className="inline-flex items-center justify-center h-9 w-9 shrink-0 rounded-xl border border-[#E4E4E7] bg-white text-[#18181B] hover:bg-zinc-50 transition-colors"
              title={t('adm_close_panel')}
            >
              <X size={14} />
            </button>
          </div>

          {bootstrapResult.created && bootstrapResult.created.length > 0 && (
            <>
              <div className="text-[11.5px] text-[#71717A] mb-2.5 leading-relaxed">
                <b className="text-[#18181B]">{t('adm_copy_the_secrets_now_they_will_be_lost_after_closi')}</b>
              </div>
              <div className="space-y-2.5">
                {bootstrapResult.created.map((c) => (
                  <div
                    key={c.clientId}
                    className="rounded-xl border border-[#E4E4E7] bg-zinc-50 p-3 space-y-2"
                  >
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px]">
                      <span className="text-[#18181B] font-medium truncate">
                        {c.managerEmail}
                      </span>
                      <code className="font-mono text-[11px] text-[#71717A]">{c.clientId}</code>
                    </div>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 min-w-0 bg-white border border-[#E4E4E7] px-2.5 py-2 rounded-lg font-mono text-[11px] text-[#18181B] break-all">
                        {c.secret}
                      </code>
                      <button
                        onClick={() => copyToClipboard(c.secret, `${t('r9_copied')}: ${c.managerEmail}`)}
                        className="inline-flex items-center justify-center h-9 w-9 shrink-0 rounded-xl border border-[#E4E4E7] bg-white text-[#18181B] hover:bg-zinc-50 transition-colors"
                        title={t('adm_copy')}
                      >
                        <Copy size={13} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </section>
      )}

      {/* ── New secret reveal (create / rotate) ───────────────── */}
      {secretShow && (
        <section className="rounded-2xl border border-[#E4E4E7] bg-white p-4 sm:p-5">
          <div className="flex items-start justify-between gap-3 mb-3">
            <div className="flex items-center gap-2 min-w-0">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-[#F59E0B] shrink-0" />
              <h4 className="text-[13px] sm:text-sm font-semibold text-[#18181B]">
                {t('adm_save_the_secret_now_it_is_shown_only_once')}
              </h4>
            </div>
            <button
              onClick={() => setSecretShow(null)}
              className="text-xs text-[#71717A] hover:text-[#18181B] underline shrink-0"
            >
              {t('adm_understood')}
            </button>
          </div>
          <div className="mb-2 text-[11.5px] text-[#71717A]">
            clientId: <code className="font-mono text-[#18181B]">{secretShow.clientId}</code>
          </div>
          <div className="flex items-center gap-2">
            <code className="flex-1 min-w-0 bg-zinc-50 border border-[#E4E4E7] px-2.5 py-2 rounded-lg font-mono text-[11.5px] text-[#18181B] break-all">
              {secretShow.secret}
            </code>
            <button
              onClick={() => copyToClipboard(secretShow.secret, t('copied'))}
              className="inline-flex items-center justify-center h-9 w-9 shrink-0 rounded-xl border border-[#E4E4E7] bg-white text-[#18181B] hover:bg-zinc-50 transition-colors"
              title={t('adm_copy')}
            >
              <Copy size={13} />
            </button>
          </div>
        </section>
      )}

      {/* ── Clients list — Cards on mobile, table on sm+ ──────── */}
      <section className="rounded-2xl border border-[#E4E4E7] bg-white overflow-hidden">
        <div className="flex items-center justify-between gap-2 px-4 sm:px-5 py-3 border-b border-[#F4F4F5]">
          <h3 className="text-[13px] sm:text-sm font-semibold text-[#18181B]">
            Clients
            <span className="ml-2 font-normal text-[#71717A]">({items.length})</span>
          </h3>
          <button
            onClick={load}
            className="inline-flex items-center gap-1.5 h-9 px-3 rounded-xl border border-[#E4E4E7] bg-white text-xs font-medium text-[#18181B] hover:bg-zinc-50 transition-colors"
          >
            <ArrowClockwise size={13} /> {t('adm_refresh_2')}
          </button>
        </div>

        {/* MOBILE — cards */}
        <div className="sm:hidden divide-y divide-[#F4F4F5]">
          {loading && items.length === 0 && (
            <div className="px-4 py-10 text-center text-sm text-[#71717A]">{t('adm_loading_3')}</div>
          )}
          {!loading && items.length === 0 && (
            <div className="px-4 py-10 text-center text-sm text-[#A1A1AA]">{t('adm_no_customers_yet')}</div>
          )}
          {items.map((c) => (
            <div key={c.clientId} className="px-4 py-3.5 space-y-2.5">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-[13px] font-semibold text-[#18181B] truncate">{c.name || '—'}</div>
                  <div className="text-[11px] text-[#71717A] truncate">{c.managerEmail || '—'}</div>
                  <code className="block mt-1 font-mono text-[10.5px] text-[#A1A1AA] truncate">{c.clientId}</code>
                </div>
                {c.active ? (
                  <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border border-[#E4E4E7] bg-white text-[10.5px] font-semibold text-[#18181B] shrink-0">
                    <span className="inline-block w-1.5 h-1.5 rounded-full bg-[#16A34A]" />active
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border border-[#E4E4E7] bg-white text-[10.5px] font-semibold text-[#71717A] shrink-0">
                    <span className="inline-block w-1.5 h-1.5 rounded-full bg-[#DC2626]" />revoked
                  </span>
                )}
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10.5px] text-[#71717A]">
                  {c.createdAt ? new Date(c.createdAt).toLocaleString() : '—'}
                </span>
                {c.active && (
                  <div className="flex gap-2">
                    <button
                      onClick={() => rotate(c.clientId)}
                      className="inline-flex items-center h-8 px-3 rounded-xl border border-[#E4E4E7] bg-white text-[11px] font-medium text-[#18181B] hover:bg-zinc-50 transition-colors"
                    >
                      {t('adm_rotate')}
                    </button>
                    <button
                      onClick={() => revoke(c.clientId)}
                      className="inline-flex items-center h-8 px-3 rounded-xl border border-[#FCA5A5] bg-white text-[11px] font-medium text-[#DC2626] hover:bg-[#FEF2F2] transition-colors"
                    >
                      {t('adm_withdraw')}
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* DESKTOP — table */}
        <div className="hidden sm:block overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 text-[#71717A]">
              <tr>
                <Th>{t('clientId')}</Th>
                <Th>{t('adm_name_2')}</Th>
                <Th>{t('emailLabel')}</Th>
                <Th>{t('statusGeneric')}</Th>
                <Th>{t('createdOn')}</Th>
                <Th>{t('actionsUk')}</Th>
              </tr>
            </thead>
            <tbody>
              {loading && items.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-[#71717A]">{t('adm_loading_3')}</td>
                </tr>
              )}
              {!loading && items.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-[#A1A1AA]">{t('adm_no_customers_yet')}</td>
                </tr>
              )}
              {items.map((c) => (
                <tr key={c.clientId} className="border-t border-[#F4F4F5] hover:bg-zinc-50/60">
                  <Td><code className="font-mono text-[11.5px] text-[#18181B]">{c.clientId}</code></Td>
                  <Td><span className="text-[13px] text-[#18181B]">{c.name}</span></Td>
                  <Td><span className="text-[12.5px] text-[#71717A]">{c.managerEmail || '—'}</span></Td>
                  <Td>
                    {c.active ? (
                      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border border-[#E4E4E7] bg-white text-[10.5px] font-semibold text-[#18181B]">
                        <span className="inline-block w-1.5 h-1.5 rounded-full bg-[#16A34A]" />active
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border border-[#E4E4E7] bg-white text-[10.5px] font-semibold text-[#71717A]">
                        <span className="inline-block w-1.5 h-1.5 rounded-full bg-[#DC2626]" />revoked
                      </span>
                    )}
                  </Td>
                  <Td><span className="text-[11.5px] text-[#71717A]">{c.createdAt ? new Date(c.createdAt).toLocaleString() : '—'}</span></Td>
                  <Td>
                    {c.active && (
                      <div className="flex gap-2">
                        <button
                          onClick={() => rotate(c.clientId)}
                          className="inline-flex items-center h-8 px-3 rounded-xl border border-[#E4E4E7] bg-white text-[11.5px] font-medium text-[#18181B] hover:bg-zinc-50 transition-colors"
                        >
                          {t('adm_rotate')}
                        </button>
                        <button
                          onClick={() => revoke(c.clientId)}
                          className="inline-flex items-center h-8 px-3 rounded-xl border border-[#FCA5A5] bg-white text-[11.5px] font-medium text-[#DC2626] hover:bg-[#FEF2F2] transition-colors"
                        >
                          {t('adm_withdraw')}
                        </button>
                      </div>
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function Th({ children }) {
  return (
    <th className="text-left px-3.5 py-2.5 text-[10.5px] font-semibold uppercase tracking-wider">
      {children}
    </th>
  );
}
function Td({ children }) {
  return <td className="px-3.5 py-3 align-middle">{children}</td>;
}
