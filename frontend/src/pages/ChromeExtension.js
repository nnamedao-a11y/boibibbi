/**
 * Chrome Extension — Unified install + troubleshooting page (v4.1).
 *
 * The old v3.0/v4.0 page (Copart cookie-sync, bid.cars cookies, carfast
 * troubleshooting) was REMOVED. This page documents the clean multi-source
 * agent that replaces it.
 */

import React, { useEffect, useState } from 'react';
import {
  Download,
  CheckCircle,
  Browser,
  Plugs,
  Lightning,
  Robot,
  Copy,
  Check,
  Warning,
} from '@phosphor-icons/react';
import axios from 'axios';
import { AgentHealthChip } from '../components/AgentHealthChip';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Alert, AlertDescription } from '../components/ui/alert';
import { Separator } from '../components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { toast } from 'sonner';
import { useLang } from '../i18n';

const API_URL = process.env.REACT_APP_BACKEND_URL || '';

const SOURCES = [
  { id: 'poctra',             label: 'poctra.com',             role: 'CF · INDEX' },
  { id: 'carsfromwest',       label: 'carsfromwest.com',       role: 'CF · INDEX' },
  { id: 'autoauctionhistory', label: 'autoauctionhistory.com', role: 'CF · INDEX' },
  { id: 'salvagebid',         label: 'salvagebid.com',         role: 'CF · LIVE'  },
];

const ChromeExtensionPage = () => {
  const { t } = useLang();
  const [copied, setCopied] = useState(false);
  const [info, setInfo] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await axios.get(`${API_URL}/api/extension/info`);
        if (!cancelled) setInfo(r.data);
      } catch (_) { /* ok */ }
    })();
    return () => { cancelled = true; };
  }, []);

  const handleDownload = async () => {
    try {
      toast.info(t('adm_preparing_zip'));
      const res = await axios.get(`${API_URL}/api/extension/download`, {
        responseType: 'blob',
      });
      const blob = new Blob([res.data], { type: 'application/zip' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'bibi-cars-extension.zip';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(url), 1500);
      toast.success(`${t('r9_loaded')} ${(blob.size / 1024).toFixed(1)} KB`);
    } catch (err) {
      console.error('[ext-download]', err);
      toast.error(`${t('r9_loading_error_colon')} ${err?.response?.status || err.message}`);
    }
  };

  const copyToClipboard = (text, label = t('adm2_1be0a269d9')) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    toast.success(label);
    setTimeout(() => setCopied(false), 2000);
  };

  const fmtSize = (b) => {
    if (!b) return '~18 KB';
    if (b < 1024) return `${b} B`;
    if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
    return `${(b / (1024 * 1024)).toFixed(2)} MB`;
  };

  const backendUrl =
    typeof window !== 'undefined'
      ? window.location.origin
      : 'https://your-backend.example.com';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">
            {t('adm_chrome_extension')}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {t('adm_bibi_cars_parser')} <span className="font-mono">v{info?.version || '4.1.0'}</span> {t('adm_multisource_cloudflarebypass_agent')}
          </p>
        </div>
        <AgentHealthChip />
      </div>

      <Tabs defaultValue="download" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="download">{t('adm_download_and_install')}</TabsTrigger>
          <TabsTrigger value="features">{t('adm_features')}</TabsTrigger>
          <TabsTrigger value="troubleshooting">{t('adm_troubleshooting')}</TabsTrigger>
        </TabsList>

        {/* ─── DOWNLOAD ─────────────────────────────────────────── */}
        <TabsContent value="download" className="space-y-6">
          <Card data-testid="extension-download-card">
            <CardHeader>
              <div className="flex items-start justify-between flex-wrap gap-4">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Browser size={24} weight="duotone" />
                    {t('adm_chrome_extension_v41')}
                  </CardTitle>
                  <CardDescription className="mt-2 max-w-xl">
                    {t('adm3_a2ded1eff7')}
                  </CardDescription>
                  <p className="mt-3 text-xs font-mono text-muted-foreground">
                    {t('r9_zip_size')}: {fmtSize(info?.file_size)} · {t('r9_files_16')} · {t('r9_no_legacy')}
                  </p>
                </div>
                <Button
                  onClick={handleDownload}
                  size="lg"
                  data-testid="download-extension-button"
                  className="bg-emerald-600 hover:bg-emerald-700"
                >
                  <Download className="mr-2" size={18} />
                  {t('adm_download_zip')}
                </Button>
              </div>
            </CardHeader>
          </Card>

          {/* Install steps */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Lightning size={20} weight="duotone" />
                {t('adm3_d2554c9904')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ol className="space-y-3 list-decimal list-inside text-sm">
                <li>{t('adm_download_the_zip_using_the_button_above')}</li>
                <li>{t('adm_unpack_the_archive_into_any_convenient_folder')}</li>
                <li>
                  {t('r9_open')}{' '}
                  <code className="bg-muted px-1.5 py-0.5 rounded font-mono">
                    chrome://extensions/
                  </code>{' '}
                  {t('r9_in_chrome')}
                </li>
                <li>
                  {t('adm_enable')} <strong>{t('adm_developer_mode')}</strong> (top-right).
                </li>
                <li>
                  {t('adm_click')} <strong>{t('adm_download_unpacked')}</strong> {t('adm_and_select_the_unzipped_folder')}
                </li>
                <li>{t('adm_click_the_bibi_icon_in_the_toolbar_a_popup_will_op')}</li>
                <li>
                  {t('adm_in_the_popup_enter')}
                  <ul className="mt-2 ml-6 list-disc space-y-1.5 text-xs">
                    <li>
                      <strong>{t('adm_backend_url')}</strong> —
                      <span className="inline-flex items-center gap-1.5 ml-1">
                        <code className="bg-muted px-1.5 py-0.5 rounded font-mono">
                          {backendUrl}
                        </code>
                        <button
                          type="button"
                          onClick={() => copyToClipboard(backendUrl, t('adm2_backend_url_1dcced97e2'))}
                          className="text-emerald-600 hover:text-emerald-700"
                          title={t('adm_copy_2')}
                        >
                          {copied ? <Check size={14} /> : <Copy size={14} />}
                        </button>
                      </span>
                    </li>
                    <li>
                      <strong>{t('adm_client_label')}</strong> {t('adm2_777fb09b82')} <code>owner-laptop</code>)
                    </li>
                    <li>
                      <strong>{t('adm_hmac_secret')}</strong> —{' '}
                      {info?.hmac_secret ? (
                        <span className="inline-flex items-center gap-1.5 ml-1">
                          <code
                            className="bg-muted px-1.5 py-0.5 rounded font-mono"
                            data-testid="hmac-secret-value"
                          >
                            {info.hmac_secret}
                          </code>
                          <button
                            type="button"
                            onClick={() =>
                              copyToClipboard(info.hmac_secret, t('adm2_hmac_c78d733fba'))
                            }
                            className="text-emerald-600 hover:text-emerald-700"
                            title={t('adm_copy_2')}
                            data-testid="copy-hmac-secret"
                          >
                            <Copy size={14} />
                          </button>
                        </span>
                      ) : (
                        <>
                          {t('r9_value')}{' '}
                          <code className="bg-muted px-1 rounded font-mono">
                            EXT_SHARED_SECRET
                          </code>{' '}
                          {t('r9_with')}{' '}
                          <code className="bg-muted px-1 rounded font-mono">
                            {t('adm_backendenv')}
                          </code>
                        </>
                      )}
                    </li>
                  </ul>
                </li>
                <li>
                  {t('adm_click')} <strong>{t('adm_save_2')}</strong> {t('adm3_9306153145')}
                  <code className="bg-muted px-1 rounded font-mono">
                    /api/ext/register
                  </code>
                  {t('adm3_4cb4eddb75')}
                </li>
              </ol>

              <Alert className="mt-5 bg-emerald-50 border-emerald-200">
                <CheckCircle size={16} className="text-emerald-600" />
                <AlertDescription className="text-sm text-emerald-900">
                  {t('r9_after_successful_connection_on_page')}{' '}
                  <a href="/admin/parser" className="underline font-semibold">
                    /admin/parser
                  </a>{' '}
                  {t('r9_will_appear')} 1 online client {t('r9_with_last_seen_5s')} 4 Cloudflare
                  {t('r9_sources_exit_critical_state')}
                </AlertDescription>
              </Alert>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ─── FEATURES ──────────────────────────────────────────── */}
        <TabsContent value="features" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Robot size={20} weight="duotone" />
                {t('adm_architecture_v41_singlepurpose_agent')}
              </CardTitle>
              <CardDescription>
                {t('adm3_9566fde41b')}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="bg-muted rounded-lg p-4 font-mono text-xs leading-relaxed">
                Backend → /api/ext/jobs (poll)
                <br />
                {t('adm_extension_opens_hidden_tab_on_supported_domain')}
                <br />
                {t('adm_site_parser_parses_dom_posts_to_apiextobservation')}
                <br />
                {t('adm_backend_caches_result_resolves_vin_returns_to_call')}
              </div>

              <Separator />

              <div>
                <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
                  <Plugs size={16} weight="duotone" />
                  {t('adm_supported_sources')}
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {SOURCES.map((s) => (
                    <div
                      key={s.id}
                      className="flex items-center justify-between p-2.5 rounded-lg border bg-background"
                    >
                      <div className="flex items-center gap-2.5">
                        <CheckCircle size={16} weight="fill" className="text-emerald-500" />
                        <span className="text-sm font-medium">{s.label}</span>
                      </div>
                      <Badge variant="secondary" className="text-[10px] font-mono">
                        {s.role}
                      </Badge>
                    </div>
                  ))}
                </div>
              </div>

              <Separator />

              <div>
                <h3 className="font-semibold text-sm mb-2">{t('adm_whats_new_in_v41')}</h3>
                <ul className="text-sm space-y-1.5 list-disc list-inside text-muted-foreground">
                  <li>
                    {t('adm3_26fce00cd0')}
                  </li>
                  <li>
                    {t('r9_removed_phantom_api_calls_to')}{' '}
                    <code className="bg-muted px-1 rounded text-xs">
                      /api/copart/*
                    </code>{' '}
                    {t('r9_and')}{' '}
                    <code className="bg-muted px-1 rounded text-xs">
                      /api/bidcars/*
                    </code>{' '}
                    {t('r9_now_they_return')} 410 Gone.
                  </li>
                  <li>{t('adm_popup_rewritten_only_4_source_statuses_and_config')}</li>
                  <li>{t('adm_hmac_signature_of_observation_payloads_saved')}</li>
                  <li>{t('adm_size_reduced_from_29_kb_to_18_kb')}</li>
                </ul>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ─── TROUBLESHOOTING ───────────────────────────────────── */}
        <TabsContent value="troubleshooting" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Warning size={20} weight="duotone" />
                {t('adm_common_issues')}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-5 text-sm">
              <div>
                <p className="font-semibold mb-1">{t('adm_1_popup_shows_nothing')}</p>
                <ul className="list-disc list-inside text-muted-foreground space-y-1 ml-2">
                  <li>{t('adm_reload_the_extension_in_chromeextensions')}</li>
                  <li>
                    {t('adm3_fcfae95e8b')}
                  </li>
                  <li>
                    {t('adm3_6760cb717b')}
                  </li>
                </ul>
              </div>

              <div>
                <p className="font-semibold mb-1">{t('adm_2_on_adminparser_0_clients')}</p>
                <ul className="list-disc list-inside text-muted-foreground space-y-1 ml-2">
                  <li>
                    {t('r9_check_hmac_secret_matches_with')}{' '}
                    <code className="bg-muted px-1 rounded font-mono text-xs">
                      EXT_SHARED_SECRET
                    </code>{' '}
                    {t('r9_in')} backend/.env.
                  </li>
                  <li>
                    {t('r9_network_tab_post_to')}{' '}
                    <code className="bg-muted px-1 rounded font-mono text-xs">
                      /api/ext/heartbeat
                    </code>{' '}
                    {t('r9_every_60_s')} (200 OK).
                  </li>
                </ul>
              </div>

              <div>
                <p className="font-semibold mb-1">
                  {t('adm_3_json_parse_error_unexpected_nonwhitespace')}
                </p>
                <p className="text-muted-foreground ml-2">
                  {t('adm3_25e5d13864')}
                </p>
              </div>

              <div>
                <p className="font-semibold mb-1">
                  {t('adm_4_410_gone_on_old_endpoints')}
                </p>
                <p className="text-muted-foreground ml-2">
                  {t('r9_not_an_error_v41_legacy_routes')}{' '}
                  <code className="bg-muted px-1 rounded font-mono text-xs">
                    /api/copart/*
                  </code>
                  ,{' '}
                  <code className="bg-muted px-1 rounded font-mono text-xs">
                    /api/bidcars/*
                  </code>
                  ,{' '}
                  <code className="bg-muted px-1 rounded font-mono text-xs">
                    /api/carfast/*
                  </code>{' '}
                  {t('r9_return_json_410_gone_old_clients_see_that')}
                  {t('r9_they_need_to_update')}
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default ChromeExtensionPage;
