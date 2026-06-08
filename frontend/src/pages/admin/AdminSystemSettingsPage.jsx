/**
 * AdminSystemSettingsPage — admin UI for production domain + CORS allowlist.
 *
 * Phase IV-5. Reads/writes:
 *   GET   /api/admin/system/settings
 *   PATCH /api/admin/system/settings
 *   POST  /api/admin/system/settings/jwt/rotate
 *
 * Changes take effect on the next request without restarting the backend
 * (DynamicCORSMiddleware hot-reloads from DB every 30 s). Restart only
 * required after JWT rotation.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  Globe,
  Shield,
  Plus,
  X,
  ArrowsClockwise,
  Copy,
  Warning,
  CheckCircle,
  Key,
  FloppyDisk,
} from '@phosphor-icons/react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || '';

const apiFetch = (path, init = {}) => {
  const token = (typeof window !== 'undefined' && localStorage.getItem('token')) || '';
  const headers = {
    ...(init.headers || {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
  return fetch(`${BACKEND_URL}${path}`, { ...init, headers });
};

const Section = ({ icon: Icon, title, hint, children }) => (
  <div className="bg-white border border-[#E4E4E7] rounded-2xl p-4 sm:p-5 space-y-4">
    <div className="flex items-start gap-3">
      {Icon ? (
        <div className="w-9 h-9 rounded-xl bg-[#FAFAFA] border border-[#E4E4E7] flex items-center justify-center shrink-0">
          <Icon size={16} weight="duotone" className="text-[#18181B]" />
        </div>
      ) : null}
      <div className="min-w-0 flex-1">
        <h3 className="text-[14px] font-bold tracking-tight text-[#18181B] leading-tight">
          {title}
        </h3>
        {hint ? (
          <p className="text-[12px] text-[#71717A] mt-0.5 leading-snug">{hint}</p>
        ) : null}
      </div>
    </div>
    {children}
  </div>
);

const Input = ({ label, value, onChange, placeholder, hint, ...rest }) => (
  <label className="block">
    {label ? (
      <span className="block text-[10.5px] font-semibold uppercase tracking-wider text-[#71717A] mb-1.5">
        {label}
      </span>
    ) : null}
    <input
      type="text"
      value={value || ''}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full h-10 px-3 rounded-lg border border-[#E4E4E7] bg-white text-[13px] text-[#18181B] placeholder:text-[#A1A1AA] focus:outline-none focus:ring-2 focus:ring-[#18181B]/15 focus:border-[#18181B]"
      {...rest}
    />
    {hint ? (
      <p className="text-[11px] text-[#71717A] mt-1 leading-snug">{hint}</p>
    ) : null}
  </label>
);

const CopyableField = ({ label, value, testid }) => {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    if (!value) return;
    navigator.clipboard?.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <div>
      {label ? (
        <span className="block text-[10.5px] font-semibold uppercase tracking-wider text-[#71717A] mb-1.5">
          {label}
        </span>
      ) : null}
      <div className="flex items-stretch gap-2">
        <div className="flex-1 min-w-0 h-10 px-3 rounded-lg border border-[#E4E4E7] bg-[#FAFAFA] text-[12.5px] text-[#52525B] font-mono flex items-center truncate">
          {value || <span className="italic text-[#A1A1AA]">— not configured —</span>}
        </div>
        <button
          type="button"
          onClick={copy}
          disabled={!value}
          className="h-10 px-3 rounded-lg bg-white border border-[#E4E4E7] text-[#18181B] text-[12px] font-semibold hover:border-[#18181B] disabled:opacity-50 disabled:cursor-not-allowed transition-colors inline-flex items-center gap-1.5"
          data-testid={testid}
        >
          {copied ? (
            <>
              <CheckCircle size={13} weight="bold" />
              Copied
            </>
          ) : (
            <>
              <Copy size={13} weight="bold" />
              Copy
            </>
          )}
        </button>
      </div>
    </div>
  );
};

const AdminSystemSettingsPage = () => {
  const [data, setData] = useState(null);
  const [draft, setDraft] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [newOrigin, setNewOrigin] = useState('');
  const [rotating, setRotating] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await apiFetch('/api/admin/system/settings');
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = await r.json();
      setData(j);
      setDraft(j.settings);
    } catch (e) {
      toast.error(`Load failed: ${e.message || e}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const save = async () => {
    if (!draft) return;
    setSaving(true);
    try {
      const r = await apiFetch('/api/admin/system/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          production_domain: draft.production_domain,
          cors_origins: draft.cors_origins || [],
          cors_origin_regex: draft.cors_origin_regex,
          allow_subdomains: draft.allow_subdomains,
        }),
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error(err.detail || `HTTP ${r.status}`);
      }
      const j = await r.json();
      setData(j);
      setDraft(j.settings);
      toast.success('System settings saved — CORS allowlist refreshing across all workers');
    } catch (e) {
      toast.error(`Save failed: ${e.message || e}`);
    } finally {
      setSaving(false);
    }
  };

  const addOrigin = () => {
    const o = (newOrigin || '').trim().replace(/\/$/, '');
    if (!o) return;
    if ((draft.cors_origins || []).includes(o)) {
      toast.message('Origin already in the list');
      setNewOrigin('');
      return;
    }
    setDraft({ ...draft, cors_origins: [...(draft.cors_origins || []), o] });
    setNewOrigin('');
  };

  const removeOrigin = (o) => {
    setDraft({
      ...draft,
      cors_origins: (draft.cors_origins || []).filter((x) => x !== o),
    });
  };

  const rotateJwt = async () => {
    if (rotating) return;
    if (
      !window.confirm(
        'Rotate JWT_SECRET?\n\nThis will INSTANTLY invalidate every active token.\nYou (and everyone else) will need to log in again.\nA backend restart is also required to load the new secret.',
      )
    )
      return;
    setRotating(true);
    try {
      const r = await apiFetch('/api/admin/system/settings/jwt/rotate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirm: true }),
      });
      const j = await r.json();
      if (!r.ok || !j.success) {
        throw new Error(j.detail || `HTTP ${r.status}`);
      }
      toast.success(j.message || 'JWT_SECRET rotated. Restart backend manually.');
    } catch (e) {
      toast.error(`Rotation failed: ${e.message || e}`);
    } finally {
      setRotating(false);
    }
  };

  if (loading || !draft) {
    return (
      <div className="px-4 sm:px-6 py-10">
        <div className="max-w-3xl mx-auto text-center text-[#71717A]">Loading…</div>
      </div>
    );
  }

  const env = data?.env_baseline || {};
  const computed = data?.computed || {};
  const dirty =
    JSON.stringify(draft) !== JSON.stringify(data?.settings || {});

  return (
    <div className="px-3 sm:px-6 py-4 sm:py-8 max-w-4xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <h1
            className="text-xl sm:text-2xl font-bold tracking-tight text-[#18181B] leading-tight"
            style={{ fontFamily: 'Mazzard, system-ui, sans-serif' }}
          >
            System Settings
          </h1>
          <p className="text-[12px] sm:text-sm text-[#71717A] mt-1 leading-snug">
            Production domain, CORS allowlist, JWT rotation — all configurable here, no .env edits required. Changes hot-reload within 30 s.
          </p>
        </div>
        <button
          onClick={save}
          disabled={saving || !dirty}
          className="inline-flex items-center gap-1.5 h-10 px-4 rounded-xl bg-[#18181B] text-white text-[13px] font-semibold hover:bg-[#27272A] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          data-testid="btn-save-settings"
        >
          {saving ? (
            <ArrowsClockwise size={14} weight="bold" className="animate-spin" />
          ) : (
            <FloppyDisk size={14} weight="bold" />
          )}
          {saving ? 'Saving…' : dirty ? 'Save changes' : 'Saved'}
        </button>
      </div>

      {/* Production domain */}
      <Section
        icon={Globe}
        title="Production domain"
        hint="The canonical URL where this CRM is hosted on production. Used to compute webhook URLs, OG-tags, emails. Will be auto-added to the CORS allowlist."
      >
        <Input
          label="Domain (include https://)"
          value={draft.production_domain}
          onChange={(v) => setDraft({ ...draft, production_domain: v })}
          placeholder="https://bibi.cars"
          hint="Example: https://bibi.cars  ·  no trailing slash"
          data-testid="input-production-domain"
        />

        <label className="flex items-start gap-3 cursor-pointer select-none pt-1">
          <input
            type="checkbox"
            checked={draft.allow_subdomains === true}
            onChange={(e) => setDraft({ ...draft, allow_subdomains: e.target.checked })}
            className="w-4 h-4 mt-0.5 accent-[#18181B] cursor-pointer shrink-0"
            data-testid="input-allow-subdomains"
          />
          <div className="flex-1 min-w-0">
            <span className="block text-[13px] font-medium text-[#18181B]">
              Allow subdomains
            </span>
            <span className="block text-[11.5px] text-[#71717A] mt-0.5 leading-snug">
              Generates a wildcard regex from the production domain, so{' '}
              <span className="font-mono">api.bibi.cars</span>,{' '}
              <span className="font-mono">admin.bibi.cars</span>, etc. all pass CORS without listing each one.
            </span>
          </div>
        </label>

        {draft.cors_origin_regex ? (
          <div className="px-3 py-2 rounded-lg bg-[#FAFAFA] border border-[#E4E4E7]">
            <span className="block text-[10.5px] font-semibold uppercase tracking-wider text-[#71717A] mb-0.5">
              Derived regex
            </span>
            <code className="text-[11.5px] text-[#52525B] break-all">
              {draft.cors_origin_regex}
            </code>
          </div>
        ) : null}
      </Section>

      {/* Computed URLs (read-only, copy-paste helpers) */}
      <Section
        icon={Shield}
        title="Computed URLs"
        hint="These URLs are built from your production domain. Copy them into your Ringostat/Stripe/etc. dashboards."
      >
        <CopyableField
          label="Ringostat webhook URL"
          value={computed.ringostat_webhook_url}
          testid="copy-ringostat-webhook"
        />
        <CopyableField
          label="Site origin"
          value={computed.site_origin}
          testid="copy-site-origin"
        />
      </Section>

      {/* CORS origins */}
      <Section
        icon={Shield}
        title="CORS allowlist"
        hint="Extra origins beyond the production domain. Useful for preview branches, partner widgets, or staging. The .env baseline below is always merged on top."
      >
        <div className="space-y-2">
          {(draft.cors_origins || []).map((o) => (
            <div
              key={o}
              className="flex items-center justify-between gap-2 h-10 px-3 rounded-lg border border-[#E4E4E7] bg-[#FAFAFA]"
              data-testid={`cors-row-${o}`}
            >
              <span className="text-[12.5px] text-[#18181B] font-mono truncate">{o}</span>
              <button
                type="button"
                onClick={() => removeOrigin(o)}
                className="w-6 h-6 rounded-md hover:bg-white border border-transparent hover:border-[#E4E4E7] text-[#71717A] hover:text-red-600 inline-flex items-center justify-center transition-colors shrink-0"
                aria-label="Remove origin"
              >
                <X size={12} weight="bold" />
              </button>
            </div>
          ))}
          {(draft.cors_origins || []).length === 0 ? (
            <p className="text-[12px] text-[#A1A1AA] italic">No extra origins configured.</p>
          ) : null}
        </div>

        <div className="flex items-center gap-2 pt-1">
          <input
            type="text"
            value={newOrigin}
            onChange={(e) => setNewOrigin(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addOrigin();
              }
            }}
            placeholder="https://staging.bibi.cars"
            className="flex-1 h-10 px-3 rounded-lg border border-[#E4E4E7] bg-white text-[12.5px] text-[#18181B] placeholder:text-[#A1A1AA] focus:outline-none focus:ring-2 focus:ring-[#18181B]/15 focus:border-[#18181B] font-mono"
            data-testid="input-new-origin"
          />
          <button
            type="button"
            onClick={addOrigin}
            disabled={!newOrigin.trim()}
            className="h-10 px-3 rounded-lg bg-white border border-[#E4E4E7] text-[#18181B] text-[12px] font-semibold hover:border-[#18181B] disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-1.5 transition-colors"
            data-testid="btn-add-origin"
          >
            <Plus size={12} weight="bold" />
            Add
          </button>
        </div>

        {/* Env baseline (read-only info) */}
        {(env.cors_origins?.length > 0 || env.cors_origin_regex) ? (
          <div className="mt-3 pt-3 border-t border-[#F4F4F5]">
            <p className="text-[10.5px] font-semibold uppercase tracking-wider text-[#71717A] mb-2">
              .env baseline (read-only, always merged)
            </p>
            <div className="space-y-1">
              {(env.cors_origins || []).map((o) => (
                <code
                  key={`env-${o}`}
                  className="block text-[11.5px] text-[#52525B] font-mono break-all"
                >
                  {o}
                </code>
              ))}
              {env.cors_origin_regex ? (
                <code className="block text-[11.5px] text-[#52525B] font-mono break-all">
                  regex: {env.cors_origin_regex}
                </code>
              ) : null}
            </div>
          </div>
        ) : null}
      </Section>

      {/* JWT rotation */}
      <Section
        icon={Key}
        title="JWT secret rotation"
        hint="Rotates the signing key used to issue session tokens. After rotation, EVERY active token is invalidated and a backend restart is required."
      >
        <div className="px-3 py-2.5 rounded-lg bg-amber-50 border border-amber-200 text-[11.5px] text-amber-900 flex items-start gap-2">
          <Warning size={14} weight="duotone" className="text-amber-700 shrink-0 mt-0.5" />
          <div className="min-w-0 leading-snug">
            <strong>Heads-up:</strong> Rotating the JWT secret logs out every user (including you).
            You'll need to sign in again. Use this only after a suspected key compromise or before going to prod.
          </div>
        </div>
        <button
          onClick={rotateJwt}
          disabled={rotating}
          className="inline-flex items-center gap-1.5 h-10 px-4 rounded-xl bg-white border border-amber-300 text-amber-900 text-[12.5px] font-semibold hover:bg-amber-50 hover:border-amber-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          data-testid="btn-rotate-jwt"
        >
          {rotating ? (
            <ArrowsClockwise size={14} weight="bold" className="animate-spin" />
          ) : (
            <Key size={14} weight="bold" />
          )}
          Rotate JWT secret
        </button>
      </Section>

      {/* Footer status */}
      {data?.settings?.updated_at ? (
        <p className="text-[11px] text-[#A1A1AA] text-center">
          Last updated {new Date(data.settings.updated_at).toLocaleString()} by{' '}
          <span className="font-mono">{data.settings.updated_by || 'unknown'}</span>
        </p>
      ) : null}
    </div>
  );
};

export default AdminSystemSettingsPage;
