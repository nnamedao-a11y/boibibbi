/**
 * Master-Admin  →  Notification Rules
 * Toggle each event on/off. For each event decide which audiences receive
 * it and through which channels. Simple, declarative.
 */
import React, { useEffect, useState, useCallback } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { useLang } from '../../i18n';
import RefreshButton from '../../components/ui/RefreshButton';
import {
  Bell,
  RefreshCw,
  Mail,
  Smartphone,
  ToggleLeft,
  ToggleRight,
  Play,
  Users,
  UserCircle,
  Shield,
  Crown,
  Cable,
} from 'lucide-react';
import IntegrationsPage from './IntegrationsPage';

const API_URL = process.env.REACT_APP_BACKEND_URL || '';

const EVENT_LABEL = {
  invoice_sent:          'Invoice sent to client',
  payment_confirmed:     'Payment confirmed',
  order_started:         'Order launched',
  order_finished:        'Order completed',
  payment_reminder:      'Payment reminder',
  provider_tier_changed: 'Provider tier changed',
};

// Fallback humanizer for any event without an explicit label.
// Turns `provider_tier_changed` → `Provider tier changed`.
const humanizeEvent = (key = '') =>
  String(key)
    .replace(/[_-]+/g, ' ')
    .trim()
    .replace(/^./, (c) => c.toUpperCase());

const AUDIENCE = {
  customer:     { labelKey: 'customer',         icon: UserCircle, color: '#18181B' },
  manager:      { labelKey: 'roleManager',      icon: Users,      color: '#18181B' },
  team_lead:    { labelKey: 'roleTeamLead',     icon: Shield,     color: '#18181B' },
  master_admin: { labelKey: 'roleMasterAdmin',  icon: Crown,      color: '#18181B' },
};

const CHANNELS = {
  email:  { labelKey: 'emailLabel',  icon: Mail },
  in_app: { labelKey: 'inAppChannel', icon: Bell },
  sms:    { labelKey: 'smsChannel',   icon: Smartphone },
};

const authHeaders = () => {
  const token = localStorage.getItem('token');
  return token ? { Authorization: `Bearer ${token}` } : {};
};

export default function NotificationRulesPage() {
  const { t } = useLang();
  const [rules, setRules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [testing, setTesting] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await axios.get(`${API_URL}/api/admin/notification-rules`, { headers: authHeaders() });
      setRules(r.data?.items || []);
    } catch {
      toast.error(t('loadingError'));
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const saveRule = async (event, patch) => {
    try {
      const r = await axios.patch(`${API_URL}/api/admin/notification-rules/${event}`, patch, { headers: authHeaders() });
      setRules((prev) => prev.map((x) => (x.event === event ? r.data.rule : x)));
      toast.success(t('saved'));
    } catch (e) {
      toast.error(e.response?.data?.detail || t('adm2_fd77287f02'));
    }
  };

  const toggleEnabled = async (rule) => {
    await saveRule(rule.event, { enabled: !rule.enabled, targets: rule.targets || [] });
  };

  const toggleChannel = async (rule, audience, channel) => {
    const targets = [...(rule.targets || [])];
    let target = targets.find((t) => t.audience === audience);
    if (!target) {
      targets.push({ audience, channels: [channel] });
    } else {
      const has = target.channels.includes(channel);
      target.channels = has ? target.channels.filter((c) => c !== channel) : [...target.channels, channel];
      if (target.channels.length === 0) {
        // drop empty target
        const idx = targets.indexOf(target);
        targets.splice(idx, 1);
      }
    }
    await saveRule(rule.event, { enabled: rule.enabled, targets });
  };

  const testDispatch = async (event) => {
    setTesting(event);
    try {
      const r = await axios.post(`${API_URL}/api/admin/notifications/test-dispatch`, { event }, { headers: authHeaders() });
      toast.success(`${t('r9_sent')} · ${t('r9_recipients_label')}: ${r.data?.dispatch?.total || 0}`);
    } catch (e) {
      toast.error(e.response?.data?.detail || t('adm2_fd77287f02'));
    } finally {
      setTesting('');
    }
  };

  const hasChannel = (rule, audience, channel) => {
    const t = (rule.targets || []).find((x) => x.audience === audience);
    return !!t && t.channels.includes(channel);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-row items-start justify-between gap-3 sm:gap-4 mb-6">
        <div className="flex items-start gap-3 flex-1 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-[#18181B] text-white flex items-center justify-center shrink-0">
            <Bell className="w-[18px] h-[18px]" />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[#18181B] leading-tight break-words"
                style={{ fontFamily: 'Mazzard, Mazzard H, Mazzard M, system-ui, sans-serif' }}>
              {t('adm_notification_settings')}
            </h1>
            <p className="text-xs sm:text-sm text-[#71717A] mt-1 break-words">
              {t('adm_for_each_business_event_choose_who_receives_notifi')}
            </p>
          </div>
        </div>
        <div className="shrink-0">
          <RefreshButton
            onClick={load}
            loading={loading}
            ariaLabel={t('adm_refresh_3')}
            testId="notification-rules-refresh-button"
          />
        </div>
      </div>

      <div className="space-y-4">
        {rules.map((rule) => (
          <div
            key={rule.event}
            className={`bg-white border rounded-2xl overflow-hidden transition-opacity ${
              rule.enabled ? 'border-[#E4E4E7]' : 'border-[#E4E4E7] opacity-60'
            }`}
            data-testid={`notification-rule-card-${rule.event}`}
          >
            {/* Header: event meta + actions */}
            <div className="px-5 sm:px-6 py-4 flex flex-wrap items-center justify-between gap-3 border-b border-[#E4E4E7] bg-zinc-50/40">
              <div className="min-w-0 flex-1">
                <p className="text-base sm:text-lg font-semibold text-[#18181B] leading-tight break-words">
                  {EVENT_LABEL[rule.event] || humanizeEvent(rule.event)}
                </p>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  onClick={() => testDispatch(rule.event)}
                  disabled={testing === rule.event || !rule.enabled}
                  className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg bg-white border border-[#E4E4E7] hover:bg-[#FAFAFA] text-[#18181B] text-xs font-medium disabled:opacity-50 transition-colors"
                  data-testid={`notification-rule-test-button-${rule.event}`}
                >
                  <Play className="w-3.5 h-3.5" />
                  {t('adm_test')}
                </button>
                <button
                  onClick={() => toggleEnabled(rule)}
                  className={`inline-flex items-center gap-1.5 h-9 px-3 rounded-lg text-xs font-medium transition-colors ${
                    rule.enabled
                      ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                      : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
                  }`}
                  data-testid={`notification-rule-enabled-toggle-${rule.event}`}
                >
                  {rule.enabled ? <ToggleRight className="w-4 h-4" /> : <ToggleLeft className="w-4 h-4" />}
                  {rule.enabled ? t('adm2_26841eb416') : t('adm2_7e9d3ee2f5')}
                </button>
              </div>
            </div>

            {/* Audience rows — flat stack, hairline divided, no card-in-card */}
            <ul className="divide-y divide-[#F4F4F5]" data-testid="notification-audience-list">
              {Object.entries(AUDIENCE).map(([audKey, aud]) => {
                const Icon = aud.icon;
                return (
                  <li
                    key={audKey}
                    className="flex flex-wrap items-center gap-x-4 gap-y-3 px-5 sm:px-6 py-4"
                    data-testid={`notification-audience-row-${audKey}`}
                  >
                    {/* Identity: icon + audience name */}
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <div
                        className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
                        style={{ backgroundColor: `${aud.color}15` }}
                      >
                        <Icon className="w-5 h-5" style={{ color: aud.color }} />
                      </div>
                      <p className="text-sm sm:text-base font-medium text-[#18181B] truncate">
                        {t(aud.labelKey)}
                      </p>
                    </div>
                    {/* Channels — fixed pill width, never wraps text */}
                    <div className="flex items-center gap-2 flex-wrap">
                      {Object.entries(CHANNELS).map(([chKey, ch]) => {
                        const ChIcon = ch.icon;
                        const active = hasChannel(rule, audKey, chKey);
                        return (
                          <button
                            key={chKey}
                            onClick={() => toggleChannel(rule, audKey, chKey)}
                            disabled={!rule.enabled}
                            aria-pressed={active}
                            className={`inline-flex items-center gap-1.5 h-9 px-3.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                              active
                                ? 'bg-[#18181B] text-white border border-[#18181B] shadow-sm hover:bg-[#27272A]'
                                : 'bg-white border border-[#E4E4E7] text-zinc-600 hover:bg-zinc-50'
                            }`}
                            title={t(ch.labelKey)}
                            data-testid={`notification-channel-button-${rule.event}-${audKey}-${chKey}`}
                          >
                            <ChIcon className="w-3.5 h-3.5" />
                            {t(ch.labelKey)}
                          </button>
                        );
                      })}
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
        {rules.length === 0 && !loading && (
          <div className="text-center py-12 text-zinc-400 text-sm bg-white border border-dashed border-[#E4E4E7] rounded-2xl">
            {t('adm_no_rules_found')}
          </div>
        )}
      </div>

      {/* ─── Channel integrations (Resend / Email-SMTP / SMS-TextBelt) ───
         Перенесено сюда из старой страницы /admin/integrations — ключи
         настраиваются в той же вкладке, где живёт логика оповещений. */}
      <div className="mt-10">
        <div className="flex items-start gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-[#18181B] text-white flex items-center justify-center shrink-0">
            <Cable className="w-[18px] h-[18px]" />
          </div>
          <div className="min-w-0">
            <h2 className="text-lg sm:text-xl font-bold text-gray-900 leading-tight">
              Channel Integrations
            </h2>
            <p className="text-xs sm:text-sm text-gray-500 mt-1">
              API-ключи и настройки каналов, через которые уходят уведомления выше.
            </p>
          </div>
        </div>
        <IntegrationsPage embedded filterProviders={['resend', 'email', 'sms']} />
      </div>
    </div>
  );
}
