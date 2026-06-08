/**
 * Master-Admin  →  Email Templates editor
 * Edit subject/html/text per (event × audience × lang). Create-on-save
 * if the row does not yet exist in the DB (seed was moved to Mongo).
 */
import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import axios from 'axios';
import { toast } from 'sonner';
import { useLang } from '../../i18n';
import {
  Mail,
  RefreshCw,
  Save,
  Eye,
  Search,
  Clock,
  CheckCircle2,
  Send,
  PlayCircle,
  FileCheck2,
  AlertTriangle,
  Layers,
  X,
} from 'lucide-react';
import WhiteSelect from '../../components/ui/WhiteSelect';
import RefreshButton from '../../components/ui/RefreshButton';

const API_URL = process.env.REACT_APP_BACKEND_URL || '';

const EVENT_META = {
  invoice_sent:      { label: 'Invoice Sent',     icon: Send,           color: '#18181B' },
  payment_confirmed: { label: 'Payment Confirmed',   icon: CheckCircle2,   color: '#18181B' },
  order_started:     { label: 'Order started',   icon: PlayCircle,     color: '#18181B' },
  order_finished:    { label: 'Order completed',   icon: FileCheck2,     color: '#18181B' },
  payment_reminder:  { label: 'Payment Reminder', icon: AlertTriangle, color: '#18181B' },
};

const AUDIENCE_LABEL = {
  customer:     { labelKey: 'customer',         color: 'bg-zinc-100 text-zinc-700' },
  manager:      { labelKey: 'roleManager',      color: 'bg-zinc-100 text-zinc-700' },
  team_lead:    { labelKey: 'roleTeamLead',     color: 'bg-zinc-100 text-zinc-700' },
  master_admin: { labelKey: 'roleMasterAdmin',  color: 'bg-zinc-100 text-zinc-700' },
};

const LANG_LABEL = { ua: '🇺🇦 UA', en: '🇬🇧 EN' };

const authHeaders = () => {
  const token = localStorage.getItem('token');
  return token ? { Authorization: `Bearer ${token}` } : {};
};

export default function EmailTemplatesPage() {
  const { t, lang } = useLang();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterEvent, setFilterEvent] = useState('');
  const [filterAud, setFilterAud] = useState('');
  // Language filter — follows the current UI language by default.
  // Templates are stored with `lang` ∈ {ua, en}. UK UI → 'ua'; EN/BG UI → 'en'.
  // Once the user makes an explicit choice (via the dropdown), we remember it in
  // localStorage and stop auto-following the UI language for this admin.
  const uiLangToRecord = (l) => (l === 'uk' ? 'ua' : 'en');
  const OVERRIDE_KEY = 'bibi_email_templates_filter_lang_override';
  const [filterLang, setFilterLang] = useState(() => {
    try {
      const saved = localStorage.getItem(OVERRIDE_KEY);
      if (saved === '' || saved === 'ua' || saved === 'en') return saved;
    } catch { /* ignore */ }
    return uiLangToRecord(lang);
  });
  // Auto-follow UI language whenever it changes — but only if user hasn't
  // explicitly pinned a value via the dropdown.
  useEffect(() => {
    let hasOverride = false;
    try { hasOverride = localStorage.getItem(OVERRIDE_KEY) !== null; } catch { /* ignore */ }
    if (!hasOverride) {
      setFilterLang(uiLangToRecord(lang));
    }
  }, [lang]);
  // Wrap setter so explicit user choices are persisted as overrides.
  const onChangeFilterLang = (value) => {
    setFilterLang(value);
    try { localStorage.setItem(OVERRIDE_KEY, value); } catch { /* ignore */ }
  };
  const [search, setSearch] = useState('');
  const [preview, setPreview] = useState(false);

  // Body scroll lock while the editor panel is open. Without this, when the
  // user scrolls while the panel is open, the underlying page (and the
  // global top header) scroll independently — creating a thin strip of
  // underlying content visible above the panel (looks like the panel is
  // "pressing on the header").
  const [selected, _setSelected] = useState(null);
  const setSelected = (v) => {
    _setSelected(v);
    try {
      if (v) document.body.style.overflow = 'hidden';
      else document.body.style.overflow = '';
    } catch { /* ignore */ }
  };
  // Cleanup on unmount.
  useEffect(() => () => { try { document.body.style.overflow = ''; } catch { /* ignore */ } }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await axios.get(`${API_URL}/api/admin/email-templates`, { headers: authHeaders() });
      setItems(r.data?.items || []);
    } catch { toast.error(t('loadingError')); }
    finally { setLoading(false); }
  }, [t]);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => items.filter(tpl => (
    (!filterEvent || tpl.event === filterEvent) &&
    (!filterAud   || tpl.audience === filterAud) &&
    (!filterLang  || tpl.lang === filterLang) &&
    (!search || (tpl.subject || '').toLowerCase().includes(search.toLowerCase()))
  )), [items, filterEvent, filterAud, filterLang, search]);

  const save = async () => {
    if (!selected) return;
    try {
      // Update if `id` exists; otherwise create.
      if (selected.id && items.some(i => i.id === selected.id && !i._new)) {
        await axios.patch(`${API_URL}/api/admin/email-templates/${selected.id}`, {
          subject: selected.subject,
          html: selected.html,
          text_template: selected.text_template || '',
        }, { headers: authHeaders() });
      } else {
        await axios.post(`${API_URL}/api/admin/email-templates`, selected, { headers: authHeaders() });
      }
      toast.success(t('adm_template_saved'));
      await load();
      setSelected(null);
    } catch (e) {
      toast.error(e.response?.data?.detail || t('adm2_d1b0c19159'));
    }
  };

  const testDispatch = async () => {
    if (!selected?.event) return;
    try {
      const r = await axios.post(`${API_URL}/api/admin/notifications/test-dispatch`, {
        event: selected.event,
      }, { headers: authHeaders() });
      toast.success(`Dispatch OK · ${r.data?.dispatch?.total || 0} ${t('recipients')}`);
    } catch (e) {
      toast.error(e.response?.data?.detail || t('adm2_425cb83731'));
    }
  };

  const openNew = () => setSelected({
    _new: true, id: null, event: 'invoice_sent', audience: 'customer', lang: 'ua',
    subject: '', html: '<p></p>', text_template: '',
  });

  return (
    <div className="space-y-6">
      {/*
        ── Email templates header — Refresh ALWAYS pinned top-RIGHT ──────
        Mobile (< md):
          [icon]  Email templates           [Refresh]
                  Edit subject/html/text…
          [+ New template]   ← own row, left-aligned
        Desktop (≥ md):
          [icon]  Email templates    [+ New template] [Refresh]
      */}
      <div className="mb-6">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#18181B] text-white flex items-center justify-center shrink-0">
            <Mail className="w-[18px] h-[18px]" />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[#18181B] leading-tight break-words"
                style={{ fontFamily: 'Mazzard, Mazzard H, Mazzard M, system-ui, sans-serif' }}>
              {t('adm_email_templates')}
            </h1>
            <p className="text-xs sm:text-sm text-[#71717A] mt-1 break-words">{t('adm3_subject_html_text_446e60b4ae')} {'{{ invoice.id }}'} {t('adm3_861533500f')}</p>
          </div>
          {/* Refresh top-right on every viewport. Desktop also shows + New
              template button to the left of refresh in the same row. */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={openNew}
              data-testid="email-templates-new-btn-desktop"
              className="hidden md:inline-flex items-center gap-2 h-10 px-4 bg-[#18181B] text-white rounded-xl hover:bg-[#27272A] active:bg-black text-sm font-medium whitespace-nowrap focus:outline-none focus-visible:ring-4 focus-visible:ring-black/15"
            >
              <Layers className="w-4 h-4" /> {t('adm_new_template')}
            </button>
            <RefreshButton
              onClick={load}
              loading={loading}
              ariaLabel={t('adm_refresh_3')}
              testId="email-templates-refresh-btn"
            />
          </div>
        </div>
        {/* Mobile-only row: + New template on its own line, left-aligned. */}
        <div className="mt-4 md:hidden">
          <button
            onClick={openNew}
            data-testid="email-templates-new-btn"
            className="inline-flex items-center gap-2 h-10 px-4 bg-[#18181B] text-white rounded-xl hover:bg-[#27272A] active:bg-black text-sm font-medium focus:outline-none focus-visible:ring-4 focus-visible:ring-black/15"
          >
            <Layers className="w-4 h-4" /> {t('adm_new_template')}
          </button>
        </div>
      </div>

      {/* Filters — flat row, no card-in-card; grid auto-fit so dropdowns wrap cleanly */}
      <div className="mb-4 grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(220px,1fr))] sm:[grid-template-columns:minmax(280px,2fr)_repeat(3,minmax(180px,1fr))]">
        <div className="relative min-w-0">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400 pointer-events-none" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('adm_search_by_subject')}
            className="w-full pl-10 pr-3 py-2.5 min-h-[2.75rem] border border-[#E4E4E7] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#18181B]/15 focus:border-[#18181B]"
            data-testid="email-templates-search-input"
          />
        </div>
        <WhiteSelect value={filterEvent} onChange={(e) => setFilterEvent(e.target.value)} data-testid="email-templates-event-select">
          <option value="">{t('allEvents')}</option>
          {Object.entries(EVENT_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </WhiteSelect>
        <WhiteSelect value={filterAud} onChange={(e) => setFilterAud(e.target.value)} data-testid="email-templates-audience-select">
          <option value="">{t('allAudiences')}</option>
          {Object.entries(AUDIENCE_LABEL).map(([k, v]) => <option key={k} value={k}>{t(v.labelKey)}</option>)}
        </WhiteSelect>
        <WhiteSelect
          value={filterLang}
          onChange={(e) => onChangeFilterLang(e.target.value)}
          title={t('adm_filter_by_template_language')}
          data-testid="email-templates-lang-select"
        >
          <option value="">{t('adm_all_languages')}</option>
          <option value="ua">🇺🇦 UA</option>
          <option value="en">🇬🇧 EN</option>
        </WhiteSelect>
      </div>

      <div className="bg-white border border-zinc-200 rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-zinc-50 text-xs uppercase text-zinc-500">
            <tr>
              <th className="text-left px-5 py-3 font-medium whitespace-nowrap">{t('event')}</th>
              <th className="text-left px-5 py-3 font-medium whitespace-nowrap">{t('audienceLabel')}</th>
              <th className="text-left px-5 py-3 font-medium whitespace-nowrap">{t('languageLabel')}</th>
              <th className="text-left px-5 py-3 font-medium whitespace-nowrap">{t('subjectLabel')}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && !loading ? (
              <tr><td colSpan={5} className="text-center py-12 text-zinc-400 text-sm">{t('noTemplatesYet')}</td></tr>
            ) : filtered.map(tpl => {
              const meta = EVENT_META[tpl.event] || { label: tpl.event, color: '#71717A' };
              const Icon = meta.icon || Mail;
              const aud = AUDIENCE_LABEL[tpl.audience] || { labelKey: 'unknownLabel', color: 'bg-zinc-100 text-zinc-700' };
              return (
                <tr key={tpl.id} onClick={() => setSelected(tpl)} className="border-t border-zinc-100 hover:bg-zinc-50 cursor-pointer">
                  <td className="px-5 py-3 flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${meta.color}15` }}>
                      <Icon className="w-4 h-4" style={{ color: meta.color }} />
                    </div>
                    <span className="text-zinc-900 font-medium">{meta.label}</span>
                  </td>
                  <td className="px-5 py-3">
                    <span className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-medium ${aud.color}`}>{t(aud.labelKey)}</span>
                  </td>
                  <td className="px-5 py-3 text-zinc-600">{LANG_LABEL[tpl.lang] || tpl.lang}</td>
                  <td className="px-5 py-3 text-zinc-700 truncate max-w-[500px]">{tpl.subject}</td>
                  <td className="px-5 py-3 text-right text-xs text-zinc-400">
                    {tpl.updated_at ? <><Clock className="inline w-3 h-3" /> edited</> : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        </div>
      </div>

      {/* Editor panel — rendered via portal to document.body so it escapes
          the in-page layout (space-y-6 wrapping the page added a phantom
          24px top offset). With portal, `fixed inset-0` truly fills the
          viewport from y=0 covering the global header completely. */}
      {selected && createPortal(
        <div
          className="fixed inset-0 flex"
          style={{ zIndex: 9999, isolation: 'isolate' }}
        >
          <div className="flex-1 bg-zinc-900/40" onClick={() => setSelected(null)} />
          <aside className="w-full max-w-3xl bg-white shadow-2xl overflow-y-auto">
            <div className="sticky top-0 z-10 bg-white border-b border-zinc-200 px-4 sm:px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="min-w-0 flex items-start gap-3">
                <button
                  onClick={() => setSelected(null)}
                  className="shrink-0 inline-flex items-center justify-center h-9 w-9 rounded-xl bg-white border border-[#E4E4E7] hover:bg-zinc-50 text-[#18181B] transition-colors focus:outline-none focus-visible:ring-4 focus-visible:ring-black/10"
                  aria-label="Close"
                  data-testid="email-template-close-btn"
                >
                  <X className="w-4 h-4" />
                </button>
                <div className="min-w-0">
                  <h2 className="font-semibold text-zinc-900 whitespace-nowrap">{selected._new ? t('adm2_82976e2a87') : t('adm2_2474e2a1f6')}</h2>
                  <p className="text-xs text-zinc-500 truncate">{selected.id}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-wrap shrink-0 justify-end">
                <button onClick={() => setPreview(p => !p)} className="px-3 py-1.5 bg-zinc-100 hover:bg-zinc-200 rounded-lg text-sm text-zinc-700 flex items-center gap-1 whitespace-nowrap">
                  <Eye className="w-4 h-4" /> {preview ? 'HTML' : 'Preview'}
                </button>
                <button onClick={testDispatch} className="px-3 py-1.5 bg-white border border-[#E4E4E7] hover:bg-zinc-50 text-[#18181B] rounded-lg text-sm flex items-center gap-1 whitespace-nowrap">
                  <Send className="w-4 h-4" /> {t('adm_test')}
                </button>
                <button onClick={save} className="px-3 py-1.5 bg-[#18181B] hover:bg-[#27272A] text-white rounded-lg text-sm font-medium flex items-center gap-1 whitespace-nowrap">
                  <Save className="w-4 h-4" />{t('saveAction')}</button>
              </div>
            </div>

            <div className="p-4 sm:p-6 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-zinc-600 mb-1">{t('event')}</label>
                  <WhiteSelect disabled={!selected._new} value={selected.event} onChange={(e) => setSelected({ ...selected, event: e.target.value })} className="w-full disabled:opacity-60">
                    {Object.entries(EVENT_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </WhiteSelect>
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-600 mb-1">{t('adm_audience')}</label>
                  <WhiteSelect disabled={!selected._new} value={selected.audience} onChange={(e) => setSelected({ ...selected, audience: e.target.value })} className="w-full disabled:opacity-60">
                    {Object.entries(AUDIENCE_LABEL).map(([k, v]) => <option key={k} value={k}>{t(v.labelKey)}</option>)}
                  </WhiteSelect>
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-600 mb-1">{t('adm_language')}</label>
                  <WhiteSelect disabled={!selected._new} value={selected.lang} onChange={(e) => setSelected({ ...selected, lang: e.target.value })} className="w-full disabled:opacity-60">
                    <option value="ua">{t('adm_ua')}</option>
                    <option value="en">{t('adm_en')}</option>
                  </WhiteSelect>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-600 mb-1">{t('adm2_subject_e2f5e8da81')}</label>
                <input value={selected.subject || ''} onChange={(e) => setSelected({ ...selected, subject: e.target.value })} className="w-full px-3 py-2 border border-zinc-200 rounded-lg text-sm font-medium" />
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-600 mb-1">{t('htmlBody')}</label>
                {preview ? (
                  <div className="border border-zinc-200 rounded-lg p-4 max-h-96 overflow-y-auto bg-white" dangerouslySetInnerHTML={{ __html: selected.html || '' }} />
                ) : (
                  <textarea rows={12} value={selected.html || ''} onChange={(e) => setSelected({ ...selected, html: e.target.value })} className="w-full px-3 py-2 border border-zinc-200 rounded-lg text-sm font-mono" />
                )}
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-600 mb-1">{t('adm2_372a742777')}</label>
                <textarea rows={3} value={selected.text_template || ''} onChange={(e) => setSelected({ ...selected, text_template: e.target.value })} className="w-full px-3 py-2 border border-zinc-200 rounded-lg text-sm" />
              </div>

              <div className="bg-zinc-50 border border-zinc-100 rounded-lg p-3 text-xs text-zinc-500">
                <p className="font-medium text-zinc-700 mb-1">{t('adm_available_tokens')}</p>
                <code className="text-[11px] leading-relaxed block">
                  {'{{ customer.name }}  {{ customer.email }}  {{ invoice.id }}  {{ invoice.total_fmt }}  {{ invoice.currency }}'}
                  <br />{'{{ order.id }}  {{ order.steps_total }}  {{ manager.name }}  {{ manager.email }}'}
                </code>
              </div>
            </div>
          </aside>
        </div>,
        document.body
      )}
    </div>
  );
}
