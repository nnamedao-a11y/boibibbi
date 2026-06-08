/**
 * EuDeliveryModelEditor — Wave 4.2 (i18n + mobile + default-port picker)
 * =====================================================================
 *
 * After the ocean leg lands the car at an EU port, this matrix prices
 * the trucking leg from that port to **Sofia (BG)**, our single business
 * endpoint. 8 EU ports × 7 vehicle types = 56 editable EUR cells.
 *
 * Wave 4.2b additions:
 *   • Default EU start port picker (mirror of Ocean's default destination
 *     picker) — public calculator collapses to one port unless the
 *     ocean leg already resolved a specific landing port.
 *   • i18n via useLang() — UK / EN / BG.
 *   • Branded WhiteSelect dropdowns instead of native <select>.
 *   • Mobile-responsive layout — header strip wraps, FX strip / matrix
 *     scroll horizontally where needed.
 */
import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import {
  FloppyDisk,
  ArrowsClockwise,
  Airplane,
  Info,
  MapPin,
  CurrencyEur,
} from '@phosphor-icons/react';
import { API_URL } from '../../App';
import { useLang } from '../../i18n';
import WhiteSelect from '../ui/WhiteSelect';

const num = (v, fallback = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

const cloneDeep = (x) => JSON.parse(JSON.stringify(x ?? {}));

const interp = (tpl, vars) =>
  String(tpl ?? '').replace(/\{(\w+)\}/g, (_, k) => (vars[k] != null ? vars[k] : `{${k}}`));

// ────────────────────────────────────────────────────────────────────────
// Live preview — pick port + vehicle, see EUR + converted USD
// ────────────────────────────────────────────────────────────────────────
const FormulaPreview = ({ model, defaults, t }) => {
  const [euPort, setEuPort] = useState(
    model.defaultEuPort || defaults.defaultEuPort || 'rotterdam',
  );
  const [vehicleCode, setVehicleCode] = useState('sedan');
  const [publicMode, setPublicMode] = useState(false);

  const effectivePort = publicMode
    ? (model.defaultEuPort || defaults.defaultEuPort || 'rotterdam')
    : euPort;

  const row = (model.matrix || {})[effectivePort] || {};
  const eur = num(row[vehicleCode], 0);
  const fx = num(model.fxUsdToEur, defaults.fxUsdToEur || 0.91);
  const usd = fx > 0 ? Math.round((eur / fx) * 100) / 100 : 0;

  const portLabel =
    defaults.destinationPorts.find((p) => p.code === effectivePort) || {
      name: '—',
      country: '',
    };
  const vehicleLabel =
    defaults.vehicleTypes.find((v) => v.code === vehicleCode) || { name: vehicleCode };

  return (
    <div className="border border-[#0EA5E9]/40 bg-[#F0F9FF] rounded-lg p-4 sm:p-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-3 mb-3">
        <div className="flex items-center gap-2">
          <Info size={16} className="text-[#0EA5E9] flex-shrink-0" />
          <span className="text-[11px] sm:text-[12px] uppercase tracking-wider font-semibold text-[#075985]">
            {t('calc_eu_preview_title')}
          </span>
        </div>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={publicMode}
            onChange={(e) => setPublicMode(e.target.checked)}
            data-testid="eu-preview-public-mode"
            className="rounded"
          />
          <span className="text-[12px] text-[#075985]">
            {t('calc_preview_public_mode')}
          </span>
        </label>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
        <div>
          <label className="block text-[11px] uppercase tracking-wider text-[#71717A] mb-1.5">
            {t('calc_eu_preview_eu_port')}
            {publicMode ? <span className="ml-1 normal-case">{t('calc_preview_destination_fixed')}</span> : null}
          </label>
          <WhiteSelect
            value={effectivePort}
            onChange={(e) => setEuPort(e.target.value)}
            disabled={publicMode}
            data-testid="eu-preview-port"
            options={defaults.destinationPorts.map((p) => ({
              value: p.code,
              label: `${p.name} (${p.country})${p.code === (model.defaultEuPort || defaults.defaultEuPort || 'rotterdam') ? ' · ' + t('calc_default_badge') : ''}`,
            }))}
          />
        </div>
        <div>
          <label className="block text-[11px] uppercase tracking-wider text-[#71717A] mb-1.5">
            {t('calc_preview_vehicle')}
          </label>
          <WhiteSelect
            value={vehicleCode}
            onChange={(e) => setVehicleCode(e.target.value)}
            data-testid="eu-preview-vehicle"
            options={defaults.vehicleTypes.map((v) => ({
              value: v.code,
              label: t(`calc_v_${v.code}`) || v.name,
            }))}
          />
        </div>
      </div>
      <div
        className="text-[13px] sm:text-[14px] text-[#18181B] leading-7 break-words"
        data-testid="eu-preview-formula"
      >
        <span className="text-[#71717A]">
          {portLabel.name}
          {portLabel.country ? ` (${portLabel.country})` : ''}
        </span>
        <span className="mx-2 text-[#A1A1AA]">→</span>
        <span className="font-semibold">{defaults.finalHubLabel || 'Sofia (BG)'}</span>
        <span className="mx-2 text-[#A1A1AA]">·</span>
        <span className="font-semibold">{t(`calc_v_${vehicleCode}`) || vehicleLabel.name}</span>
        <span className="mx-2 text-[#A1A1AA]">=</span>
        <span
          className="text-[#0EA5E9] font-bold text-[17px] sm:text-[18px] font-mono tabular-nums"
          data-testid="eu-preview-eur"
        >
          €{eur.toLocaleString()}
        </span>
        <span className="mx-2 text-[#A1A1AA]">≈</span>
        <span className="text-[#71717A] font-semibold font-mono tabular-nums" data-testid="eu-preview-usd">
          ${usd.toLocaleString()}
        </span>
        <span className="text-[11px] text-[#A1A1AA] ml-2 font-mono">@ FX {fx}</span>
      </div>
      <div className="text-[11px] text-[#075985]/70 mt-2">
        {publicMode
          ? interp(t('calc_preview_destination_pinned'), { port: portLabel.name })
          : `${t('calc_eu_preview_edit_hint')} ${defaults.finalHubLabel || 'Sofia (BG)'}.`}
      </div>
    </div>
  );
};

// ────────────────────────────────────────────────────────────────────────
// Default EU port picker — same UX as Ocean's destination picker
// ────────────────────────────────────────────────────────────────────────
const DefaultEuPortPicker = ({ model, defaults, onChange, t }) => {
  const current = model.defaultEuPort || defaults.defaultEuPort || 'rotterdam';
  return (
    <div className="border border-[#FEAE00]/40 bg-[#FFFBEA] rounded-lg p-4 sm:p-5">
      <div className="flex items-center gap-2 mb-2 sm:mb-3">
        <Info size={16} className="text-[#FEAE00] flex-shrink-0" />
        <span className="text-[11px] sm:text-[12px] uppercase tracking-wider font-semibold text-[#92400E]">
          {t('calc_eu_default_port_title')}
        </span>
      </div>
      <div className="text-[12px] text-[#92400E]/80 mb-4 leading-relaxed">
        {t('calc_eu_default_port_hint')}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {defaults.destinationPorts.map((p) => {
          const active = p.code === current;
          return (
            <button
              type="button"
              key={p.code}
              onClick={() => onChange(p.code)}
              className={
                'text-left px-3 py-2 rounded border transition-all ' +
                (active
                  ? 'bg-[#FEAE00] border-[#FEAE00] text-white shadow'
                  : 'bg-white border-[#E5E5E7] text-[#18181B] hover:border-[#FEAE00]')
              }
              data-testid={`eu-default-${p.code}`}
            >
              <div className="font-semibold text-[13px]">{p.name}</div>
              <div
                className={
                  'text-[11px] ' + (active ? 'text-white/85' : 'text-[#A1A1AA]') + ' font-mono'
                }
              >
                {p.country} · {p.tier}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};

// ────────────────────────────────────────────────────────────────────────
// FX rate strip (read-only, from profile)
// ────────────────────────────────────────────────────────────────────────
const FxStrip = ({ model, defaults, onFxChange, t }) => {
  const fx = num(model.fxUsdToEur, defaults.fxUsdToEur || 0.91);
  return (
    <div className="border border-[#FEAE00]/40 bg-[#FFFBEA] rounded-lg p-4 sm:p-5">
      <div className="flex items-center gap-2 mb-2 sm:mb-3">
        <CurrencyEur size={16} className="text-[#FEAE00] flex-shrink-0" />
        <span className="text-[11px] sm:text-[12px] uppercase tracking-wider font-semibold text-[#92400E]">
          {t('calc_eu_fx_title')}
        </span>
      </div>
      <div className="text-[12px] text-[#92400E]/80 mb-4 leading-relaxed">
        {t('calc_eu_fx_hint')}
      </div>
      <div className="flex items-center gap-3 flex-wrap">
        <input
          type="number"
          step="0.0001"
          value={fx}
          onChange={(e) => onFxChange(num(e.target.value, fx))}
          className="px-3 py-2.5 border border-[#FEAE00]/40 rounded-xl text-[14px] font-mono tabular-nums w-32 sm:w-40 bg-white focus:outline-none focus:border-[#FEAE00] focus:ring-2 focus:ring-[#FEAE00]/30"
          data-testid="eu-fx-input"
        />
        <span className="text-[12px] text-[#92400E]">
          {t('calc_eu_fx_saves_to')}{' '}
          <code className="font-mono bg-white/60 px-1 py-0.5 rounded">profile.fxUsdToEur</code>)
        </span>
      </div>
    </div>
  );
};

// ────────────────────────────────────────────────────────────────────────
// Final-hub strip (Sofia BG — fixed, informational only)
// ────────────────────────────────────────────────────────────────────────
const FinalHubStrip = ({ defaults, t }) => (
  <div className="border border-[#10B981]/40 bg-[#ECFDF5] rounded-lg p-4 sm:p-5">
    <div className="flex items-center gap-2 mb-2">
      <MapPin size={16} className="text-[#10B981] flex-shrink-0" />
      <span className="text-[11px] sm:text-[12px] uppercase tracking-wider font-semibold text-[#065F46]">
        {t('calc_eu_final_hub_title')}
      </span>
    </div>
    <div className="text-[12px] sm:text-[13px] text-[#065F46] leading-relaxed">
      {interp(t('calc_eu_final_hub_hint'), {
        hub: defaults.finalHubLabel || 'Sofia (BG)',
      })}
    </div>
  </div>
);

// ────────────────────────────────────────────────────────────────────────
// Matrix grid (8 EU ports × 7 vehicle types = 56 cells)
// ────────────────────────────────────────────────────────────────────────
const DeliveryMatrix = ({ model, defaults, onCellChange, t }) => {
  const defaultPort = model.defaultEuPort || defaults.defaultEuPort || 'rotterdam';
  return (
    <div className="border border-[#E5E5E7] rounded-lg overflow-hidden bg-white">
      <div className="px-4 sm:px-5 py-3 bg-[#FAFAFA] border-b border-[#E5E5E7]">
        <div className="font-semibold text-[13px] sm:text-[14px] text-[#18181B]">
          {interp(t('calc_eu_matrix_title_template'), {
            hub: defaults.finalHubLabel || 'Sofia (BG)',
          })}
        </div>
        <div className="text-[11px] sm:text-[12px] text-[#71717A] mt-0.5 leading-relaxed">
          {t('calc_eu_matrix_hint')}{' '}
          <span className="inline-block px-1.5 py-0.5 rounded bg-[#FEAE00]/15 text-[#92400E] font-semibold">
            {t('calc_default_badge')}
          </span>{' '}
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[13px] min-w-[760px]">
          <thead>
            <tr className="bg-[#FAFAFA] border-b border-[#E5E5E7]">
              <th className="text-left py-2 px-3 sticky left-0 bg-[#FAFAFA] z-10 min-w-[170px] sm:min-w-[220px]">
                {t('calc_eu_port_label')}
              </th>
              {defaults.vehicleTypes.map((v) => (
                <th key={v.code} className="text-right py-2 px-2 min-w-[110px]">
                  <div className="font-semibold text-[12px]">{t(`calc_v_${v.code}`) || v.name}</div>
                  <div className="text-[10px] text-[#A1A1AA] font-normal font-mono">
                    {v.code}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {defaults.destinationPorts.map((port) => {
              const isDefault = port.code === defaultPort;
              return (
                <tr key={port.code} className="border-b last:border-b-0 hover:bg-[#FAFAFA]/50">
                  <td
                    className={
                      'py-2 px-3 sticky left-0 z-10 ' +
                      (isDefault ? 'bg-[#FFFBEA]' : 'bg-white')
                    }
                  >
                    <div className="flex items-center gap-2">
                      <div>
                        <div className="font-semibold text-[13px]">{port.name}</div>
                        <div className="text-[11px] text-[#A1A1AA] font-mono">
                          {port.country} · {port.region}
                        </div>
                      </div>
                      {isDefault ? (
                        <span className="px-1.5 py-0.5 rounded bg-[#FEAE00] text-white text-[9px] uppercase tracking-wider font-semibold">
                          {t('calc_default_badge')}
                        </span>
                      ) : null}
                    </div>
                  </td>
                  {defaults.vehicleTypes.map((v) => {
                    const row = (model.matrix || {})[port.code] || {};
                    const defaultRow = (defaults.matrix || {})[port.code] || {};
                    const value = row[v.code] != null ? row[v.code] : defaultRow[v.code] || 0;
                    const isOverridden =
                      num(row[v.code]) !== num(defaultRow[v.code]) && row[v.code] != null;
                    return (
                      <td key={v.code} className={'py-1 px-1 ' + (isDefault ? 'bg-[#FFFBEA]/50' : '')}>
                        <div className="relative">
                          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[11px] text-[#A1A1AA] pointer-events-none">
                            €
                          </span>
                          <input
                            type="number"
                            className={
                              'w-full pl-5 pr-2 py-1.5 border rounded text-[13px] text-right font-mono tabular-nums ' +
                              (isOverridden
                                ? 'border-[#FEAE00]/60 focus:border-[#FEAE00] focus:ring-1 focus:ring-[#FEAE00]/30 bg-[#FFFBEA]'
                                : 'border-[#E5E5E7] focus:border-[#0EA5E9] focus:ring-1 focus:ring-[#0EA5E9]/30')
                            }
                            value={value}
                            onChange={(e) =>
                              onCellChange(port.code, v.code, e.target.value)
                            }
                            data-testid={`eu-cell-${port.code}-${v.code}`}
                          />
                        </div>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="px-4 sm:px-5 py-2 bg-[#FAFAFA] border-t border-[#E5E5E7] text-[11px] text-[#71717A]">
        <span className="inline-block w-3 h-3 rounded bg-[#FFFBEA] border border-[#FEAE00]/60 mr-1 align-middle" />
        {t('calc_overridden_legend')}
      </div>
    </div>
  );
};

// ────────────────────────────────────────────────────────────────────────
// Main editor
// ────────────────────────────────────────────────────────────────────────
const EuDeliveryModelEditor = ({ profile, onProfileChange }) => {
  const { t } = useLang();
  const [defaults, setDefaults] = useState(null);
  const [model, setModel] = useState(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const { data } = await axios.get(
          `${API_URL}/api/calculator/config/eu-delivery-defaults`,
        );
        if (cancelled) return;
        setDefaults(data);
        const ov = data.profileOverrides || {};
        const matrix = {};
        Object.entries(data.matrix || {}).forEach(([port, row]) => {
          matrix[port] = { ...row, ...((ov.matrix || {})[port] || {}) };
        });
        const draft = {
          enabled: ov.enabled !== false,
          matrix,
          defaultEuPort: ov.defaultEuPort || data.defaultEuPort || 'rotterdam',
          fxUsdToEur: data.fxUsdToEur || 0.91,
        };
        setModel(draft);
      } catch (e) {
        toast.error(t('calc_eu_load_error'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.code]);

  const save = async () => {
    if (!model || !profile?.code) return;
    setSaving(true);
    try {
      const diff = {};
      Object.entries(model.matrix || {}).forEach(([port, row]) => {
        const defaultRow = (defaults.matrix || {})[port] || {};
        const cellDiff = {};
        Object.entries(row).forEach(([v, val]) => {
          if (num(defaultRow[v]) !== num(val)) cellDiff[v] = num(val);
        });
        if (Object.keys(cellDiff).length > 0) diff[port] = cellDiff;
      });
      const payload = {
        code: profile.code,
        euDeliveryModel: {
          enabled: !!model.enabled,
          matrix: diff,
          defaultEuPort: model.defaultEuPort,
        },
        fxUsdToEur: num(model.fxUsdToEur, defaults.fxUsdToEur || 0.91),
      };
      const { data } = await axios.patch(
        `${API_URL}/api/calculator/config/profile`,
        payload,
      );
      if (onProfileChange) onProfileChange(data);
      const overridden = Object.values(diff).reduce(
        (sum, r) => sum + Object.keys(r).length,
        0,
      );
      toast.success(
        `${t('calc_eu_saved')} · ${overridden} ${t('calc_ocean_cells_overridden')}`,
      );
    } catch (e) {
      toast.error(t('calc_eu_save_error'));
    } finally {
      setSaving(false);
    }
  };

  const resetToDefaults = () => {
    if (!defaults) return;
    setModel({
      enabled: true,
      matrix: cloneDeep(defaults.matrix || {}),
      defaultEuPort: defaults.defaultEuPort || 'rotterdam',
      fxUsdToEur: defaults.fxUsdToEur || 0.91,
    });
    toast.info(t('calc_reset_restored'));
  };

  const updateCell = (port, vehicle, value) => {
    setModel((prev) => {
      const next = cloneDeep(prev);
      if (!next.matrix[port]) next.matrix[port] = {};
      next.matrix[port][vehicle] = num(value);
      return next;
    });
  };

  const updateFx = (value) => {
    setModel((prev) => ({ ...prev, fxUsdToEur: num(value, 0.91) }));
  };

  const updateDefaultPort = (portCode) => {
    setModel((prev) => ({ ...prev, defaultEuPort: portCode }));
  };

  const stats = useMemo(() => {
    if (!model || !defaults) return null;
    let overridden = 0;
    let total = 0;
    Object.entries(model.matrix || {}).forEach(([port, row]) => {
      const def = (defaults.matrix || {})[port] || {};
      Object.entries(row).forEach(([v, val]) => {
        total += 1;
        if (num(def[v]) !== num(val)) overridden += 1;
      });
    });
    return { total, overridden };
  }, [model, defaults]);

  if (loading || !model || !defaults) {
    return (
      <div className="p-8 text-center text-[#71717A]">{t('calc_eu_loading')}</div>
    );
  }

  const currentDefault = model.defaultEuPort || defaults.defaultEuPort || 'rotterdam';
  const currentDefaultLabel =
    (defaults.destinationPorts.find((p) => p.code === currentDefault) || {}).name ||
    currentDefault;

  return (
    <div className="space-y-4 sm:space-y-5">
      {/* ── Header strip ──────────────────────────────────────────── */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 md:gap-4 bg-[#FAFAFA] border border-[#E5E5E7] rounded-lg px-4 sm:px-5 py-3 sm:py-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-full bg-[#10B981]/10 flex items-center justify-center flex-shrink-0">
            <Airplane size={18} className="text-[#10B981]" />
          </div>
          <div className="min-w-0">
            <div className="font-semibold text-[14px] sm:text-[15px] text-[#18181B] truncate">
              {t('calc_eu_title')}
            </div>
            <div className="text-[11px] sm:text-[12px] text-[#71717A] truncate">
              {stats
                ? `${stats.total} ${t('calc_eu_cells')} · ${stats.overridden} ${t('calc_ocean_overridden_count')} · `
                : ''}
              {t('calc_eu_final_hub')} →{' '}
              <strong className="text-[#065F46]">
                {defaults.finalHubLabel || 'Sofia (BG)'}
              </strong>{' '}
              · {t('calc_ocean_public_default')} →{' '}
              <strong className="text-[#92400E]">{currentDefaultLabel}</strong>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={!!model.enabled}
              onChange={(e) => setModel((p) => ({ ...p, enabled: e.target.checked }))}
              data-testid="eu-enabled"
              className="rounded"
            />
            <span className="text-[12px] sm:text-[13px]">
              {model.enabled ? t('calc_ocean_matrix_on') : t('calc_ocean_matrix_off')}
            </span>
          </label>
          <button
            type="button"
            onClick={resetToDefaults}
            className="px-3 py-2 text-[12px] sm:text-[13px] border border-[#E5E5E7] rounded-lg bg-white hover:bg-[#FAFAFA] inline-flex items-center gap-1.5"
            data-testid="eu-reset"
          >
            <ArrowsClockwise size={14} />
            <span className="hidden sm:inline">{t('calc_reset_to_defaults')}</span>
            <span className="sm:hidden">Reset</span>
          </button>
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="px-3 sm:px-4 py-2 text-[12px] sm:text-[13px] bg-[#18181B] text-white rounded-lg hover:bg-[#27272A] disabled:opacity-50 inline-flex items-center gap-1.5"
            data-testid="eu-save"
          >
            <FloppyDisk size={14} />
            {saving ? t('calc_saving') : t('calc_save')}
          </button>
        </div>
      </div>

      {/* ── Final hub strip (Sofia BG fixed) ─────────────────────── */}
      <FinalHubStrip defaults={defaults} t={t} />

      {/* ── Default EU port picker (Wave 4.2b) ───────────────────── */}
      <DefaultEuPortPicker
        model={model}
        defaults={defaults}
        onChange={updateDefaultPort}
        t={t}
      />

      {/* ── FX rate (EUR ↔ USD conversion) ───────────────────────── */}
      <FxStrip model={model} defaults={defaults} onFxChange={updateFx} t={t} />

      {/* ── Live preview ─────────────────────────────────────────── */}
      <FormulaPreview model={model} defaults={defaults} t={t} />

      {/* ── Matrix (8 ports × 7 vehicles = 56 cells) ─────────────── */}
      <DeliveryMatrix model={model} defaults={defaults} onCellChange={updateCell} t={t} />
    </div>
  );
};

export default EuDeliveryModelEditor;
