/**
 * OceanFreightModelEditor
 * =======================
 *
 * Wave 4.1 — Ocean Freight as a **route matrix**, not a layered pricing
 * system. One table, 8 USA export ports × 8 EU destination ports = 64
 * editable lane prices. Each cell is the sedan-baseline USD for that
 * lane. Shared vehicle multipliers (read-only here, edited on the
 * Inland section) scale bigger vehicles on top.
 *
 * What the admin DOES here:
 *   1. Edits any of the 64 lane prices directly.
 *   2. Toggles the bucket model on/off (legacy fallback when off).
 *   3. Watches the live formula preview update as they type.
 *
 * What's gone (vs Wave 4 bucket version):
 *   *  Bucket editor (`atlantic_short` / `atlantic_medium` / etc.) —
 *      buckets were a hidden engineer abstraction, not a freight-sales
 *      reality. Now removed entirely.
 *   *  Port → bucket assignment — same reason.
 *   *  Destination port USD adjustment — adjustments were derived from
 *      the lane, not a separate dimension. Now folded into the cell.
 *
 * Save lands in ``calculator_profile.oceanFreightModel.laneMatrix`` via
 * the existing PATCH ``/api/calculator/config/profile`` endpoint.
 * Only changed cells are persisted (sparse override on top of the
 * bundled defaults).
 */
import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { FloppyDisk, ArrowsClockwise, Boat, Info, LinkSimple } from '@phosphor-icons/react';
import { API_URL } from '../../App';
import { useLang } from '../../i18n';
import WhiteSelect from '../ui/WhiteSelect';

const interp = (tpl, vars) =>
  String(tpl ?? '').replace(/\{(\w+)\}/g, (_, k) => (vars[k] != null ? vars[k] : `{${k}}`));

const num = (v, fallback = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

const cloneDeep = (x) => JSON.parse(JSON.stringify(x ?? {}));

// ────────────────────────────────────────────────────────────────────────
// Live formula preview
// ────────────────────────────────────────────────────────────────────────
const FormulaPreview = ({ model, defaults, t }) => {
  const [exportPort, setExportPort] = useState('houston');
  const [destinationPort, setDestinationPort] = useState(model.defaultDestinationPort || 'rotterdam');
  const [vehicleCode, setVehicleCode] = useState('sedan');
  const [publicMode, setPublicMode] = useState(false);

  const effectiveDestination = publicMode
    ? (model.defaultDestinationPort || 'rotterdam')
    : destinationPort;

  const lane = (model.laneMatrix[exportPort] || {})[effectiveDestination];
  const lanePrice = num(lane, 0);
  const mult = num(defaults.sharedMultipliers[vehicleCode], 1.0);
  const total = Math.round(lanePrice * mult * 100) / 100;

  const exportLabel =
    (defaults.exportPorts.find((p) => p.code === exportPort) || { name: '—', state: '' });
  const destLabel =
    (defaults.destinationPorts.find((p) => p.code === effectiveDestination) || { name: '—', country: '' });

  return (
    <div className="border border-[#0EA5E9]/40 bg-[#F0F9FF] rounded-lg p-4 sm:p-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-3 mb-3">
        <div className="flex items-center gap-2">
          <Info size={16} className="text-[#0EA5E9] flex-shrink-0" />
          <span className="text-[11px] sm:text-[12px] uppercase tracking-wider font-semibold text-[#075985]">
            {t('calc_preview_title')}
          </span>
        </div>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={publicMode}
            onChange={(e) => setPublicMode(e.target.checked)}
            data-testid="ocean-preview-public-mode"
            className="rounded"
          />
          <span className="text-[12px] text-[#075985]">{t('calc_preview_public_mode')}</span>
        </label>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
        <div>
          <label className="block text-[11px] uppercase tracking-wider text-[#71717A] mb-1.5">{t('calc_preview_usa_port')}</label>
          <WhiteSelect
            value={exportPort}
            onChange={(e) => setExportPort(e.target.value)}
            data-testid="ocean-preview-export"
            options={defaults.exportPorts.map((p) => ({
              value: p.code,
              label: `${p.name} (${p.state})`,
            }))}
          />
        </div>
        <div>
          <label className="block text-[11px] uppercase tracking-wider text-[#71717A] mb-1.5">
            {t('calc_preview_eu_port')}
            {publicMode ? <span className="ml-1 normal-case">{t('calc_preview_destination_fixed')}</span> : null}
          </label>
          <WhiteSelect
            value={effectiveDestination}
            onChange={(e) => setDestinationPort(e.target.value)}
            disabled={publicMode}
            data-testid="ocean-preview-destination"
            options={defaults.destinationPorts.map((p) => ({
              value: p.code,
              label: `${p.name} (${p.country})${p.code === (model.defaultDestinationPort || 'rotterdam') ? ' · ' + t('calc_default_badge') : ''}`,
            }))}
          />
        </div>
        <div>
          <label className="block text-[11px] uppercase tracking-wider text-[#71717A] mb-1.5">{t('calc_preview_vehicle')}</label>
          <WhiteSelect
            value={vehicleCode}
            onChange={(e) => setVehicleCode(e.target.value)}
            data-testid="ocean-preview-vehicle"
            options={Object.keys(defaults.sharedMultipliers).map((code) => ({
              value: code,
              label: t(`calc_v_${code}`) || code,
            }))}
          />
        </div>
      </div>
      <div className="text-[13px] sm:text-[14px] text-[#18181B] leading-7 break-words" data-testid="ocean-preview-formula">
        <span className="text-[#71717A]">{exportLabel.name}{exportLabel.state ? ` (${exportLabel.state})` : ''}</span>
        <span className="mx-2 text-[#A1A1AA]">→</span>
        <span className="font-semibold">{destLabel.name}{destLabel.country ? ` (${destLabel.country})` : ''}</span>
        <span className="mx-2 text-[#A1A1AA]">=</span>
        <span className="text-[#71717A]">lane</span>
        <span className="font-semibold ml-1 font-mono tabular-nums">${lanePrice.toLocaleString()}</span>
        <span className="mx-2 text-[#A1A1AA]">×</span>
        <span className="font-semibold">{t(`calc_v_${vehicleCode}`) || vehicleCode}</span>
        <span className="text-[#71717A] font-mono"> ×{mult}</span>
        <span className="mx-2 text-[#A1A1AA]">=</span>
        <span className="text-[#0EA5E9] font-bold text-[17px] sm:text-[18px] font-mono tabular-nums" data-testid="ocean-preview-total">
          ${total.toLocaleString()}
        </span>
      </div>
      <div className="text-[11px] text-[#075985]/70 mt-2">
        {publicMode
          ? interp(t('calc_preview_destination_pinned'), { port: destLabel.name })
          : t('calc_preview_edit_hint')}
      </div>
    </div>
  );
};

// ────────────────────────────────────────────────────────────────────────
// Default destination port selector — public UI uses this single port
// ────────────────────────────────────────────────────────────────────────
const DefaultDestinationPicker = ({ model, defaults, onChange, t }) => {
  const current = model.defaultDestinationPort || 'rotterdam';
  return (
    <div className="border border-[#FEAE00]/40 bg-[#FFFBEA] rounded-lg p-4 sm:p-5">
      <div className="flex items-center gap-2 mb-2 sm:mb-3">
        <Info size={16} className="text-[#FEAE00] flex-shrink-0" />
        <span className="text-[11px] sm:text-[12px] uppercase tracking-wider font-semibold text-[#92400E]">
          {t('calc_default_dest_title')}
        </span>
      </div>
      <div className="text-[12px] text-[#92400E]/80 mb-4 leading-relaxed">
        {t('calc_default_dest_hint')}
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
                `text-left px-3 py-2 rounded border transition-all ` +
                (active
                  ? 'bg-[#FEAE00] border-[#FEAE00] text-white shadow'
                  : 'bg-white border-[#E5E5E7] text-[#18181B] hover:border-[#FEAE00]')
              }
              data-testid={`ocean-default-${p.code}`}
            >
              <div className="font-semibold text-[13px]">{p.name}</div>
              <div className={`text-[11px] ${active ? 'text-white/85' : 'text-[#A1A1AA]'} font-mono`}>
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
// Lane matrix grid (8 USA rows × 8 EU columns)
// ────────────────────────────────────────────────────────────────────────
const LaneMatrix = ({ model, defaults, onCellChange, t }) => {
  const defaultDest = model.defaultDestinationPort || 'rotterdam';
  return (
    <div className="border border-[#E5E5E7] rounded-lg overflow-hidden bg-white">
      <div className="px-4 sm:px-5 py-3 bg-[#FAFAFA] border-b border-[#E5E5E7]">
        <div className="font-semibold text-[13px] sm:text-[14px] text-[#18181B]">{t('calc_lane_matrix_title')}</div>
        <div className="text-[11px] sm:text-[12px] text-[#71717A] mt-0.5 leading-relaxed">
          {t('calc_lane_matrix_hint')} <span className="inline-block px-1.5 py-0.5 rounded bg-[#FEAE00]/15 text-[#92400E] font-semibold">{t('calc_default_badge')}</span> {t('calc_lane_matrix_hint_default')}
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[13px] min-w-[860px]">
          <thead>
            <tr className="bg-[#FAFAFA] border-b border-[#E5E5E7]">
              <th className="text-left py-2 px-3 sticky left-0 bg-[#FAFAFA] z-10 min-w-[180px] sm:min-w-[200px]">
                USA Port
              </th>
              {defaults.destinationPorts.map((d) => {
                const isDefault = d.code === defaultDest;
                return (
                  <th
                    key={d.code}
                    className={`text-right py-2 px-2 min-w-[110px] ${isDefault ? 'bg-[#FFFBEA]' : ''}`}
                  >
                    <div className="font-semibold text-[12px]">{d.name}</div>
                    <div className="text-[10px] text-[#A1A1AA] font-normal font-mono">{d.country}</div>
                    {isDefault ? (
                      <div className="inline-block mt-0.5 px-1.5 py-0.5 rounded bg-[#FEAE00] text-white text-[9px] uppercase tracking-wider font-semibold">
                        {t('calc_default_badge')}
                      </div>
                    ) : null}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {defaults.exportPorts.map((src) => (
              <tr key={src.code} className="border-b last:border-b-0 hover:bg-[#FAFAFA]/50">
                <td className="py-2 px-3 sticky left-0 bg-white z-10">
                  <div className="font-semibold text-[13px]">{src.name}</div>
                  <div className="text-[11px] text-[#A1A1AA] font-mono">{src.state} · {src.region}</div>
                </td>
                {defaults.destinationPorts.map((dst) => {
                  const cell = (model.laneMatrix[src.code] || {})[dst.code];
                  const value = cell != null ? cell : (defaults.laneMatrix[src.code] || {})[dst.code] || 0;
                  const isDefault = dst.code === defaultDest;
                  return (
                    <td key={dst.code} className={`py-1 px-1 ${isDefault ? 'bg-[#FFFBEA]' : ''}`}>
                      <div className="relative">
                        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[11px] text-[#A1A1AA] pointer-events-none">$</span>
                        <input
                          type="number"
                          className={
                            `w-full pl-5 pr-2 py-1.5 border rounded text-[13px] text-right font-mono tabular-nums ` +
                            (isDefault
                              ? 'border-[#FEAE00]/60 focus:border-[#FEAE00] focus:ring-1 focus:ring-[#FEAE00]/30 bg-white'
                              : 'border-[#E5E5E7] focus:border-[#0EA5E9] focus:ring-1 focus:ring-[#0EA5E9]/30')
                          }
                          value={value}
                          onChange={(e) => onCellChange(src.code, dst.code, e.target.value)}
                          data-testid={`ocean-cell-${src.code}-${dst.code}`}
                        />
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// ────────────────────────────────────────────────────────────────────────
// Main editor
// ────────────────────────────────────────────────────────────────────────
const OceanFreightModelEditor = ({ profile, onProfileChange }) => {
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
        const { data } = await axios.get(`${API_URL}/api/calculator/config/ocean-defaults`);
        if (cancelled) return;
        setDefaults(data);
        const ov = data.profileOverrides || {};
        const matrix = {};
        Object.entries(data.laneMatrix).forEach(([usaPort, row]) => {
          matrix[usaPort] = { ...row, ...((ov.laneMatrix || {})[usaPort] || {}) };
        });
        const draft = {
          enabled: ov.enabled !== false,
          laneMatrix: matrix,
          defaultDestinationPort:
            ov.defaultDestinationPort || data.defaultDestinationPort || 'rotterdam',
        };
        setModel(draft);
      } catch (e) {
        toast.error(t('calc_ocean_load_error'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.code]);

  const save = async () => {
    if (!model || !profile?.code) return;
    setSaving(true);
    try {
      const diff = {};
      Object.entries(model.laneMatrix || {}).forEach(([usaPort, row]) => {
        const defaultRow = defaults.laneMatrix[usaPort] || {};
        const cellDiff = {};
        Object.entries(row).forEach(([dst, val]) => {
          if (num(defaultRow[dst]) !== num(val)) cellDiff[dst] = num(val);
        });
        if (Object.keys(cellDiff).length > 0) diff[usaPort] = cellDiff;
      });
      const payload = {
        code: profile.code,
        oceanFreightModel: {
          enabled: !!model.enabled,
          laneMatrix: diff,
          defaultDestinationPort: model.defaultDestinationPort,
        },
      };
      const { data } = await axios.patch(`${API_URL}/api/calculator/config/profile`, payload);
      if (onProfileChange) onProfileChange(data);
      const overridden = Object.values(diff).reduce((sum, r) => sum + Object.keys(r).length, 0);
      toast.success(
        `${t('calc_ocean_saved')} · ${overridden} ${t('calc_ocean_cells_overridden')}`,
      );
    } catch (e) {
      toast.error(t('calc_ocean_save_error'));
    } finally {
      setSaving(false);
    }
  };

  const resetToDefaults = () => {
    if (!defaults) return;
    setModel({
      enabled: true,
      laneMatrix: cloneDeep(defaults.laneMatrix),
      defaultDestinationPort: defaults.defaultDestinationPort || 'rotterdam',
    });
    toast.info(t('calc_reset_restored'));
  };

  const updateCell = (usaPort, dstPort, value) => {
    setModel((prev) => {
      const next = cloneDeep(prev);
      if (!next.laneMatrix[usaPort]) next.laneMatrix[usaPort] = {};
      next.laneMatrix[usaPort][dstPort] = num(value);
      return next;
    });
  };

  const updateDefaultDestination = (portCode) => {
    setModel((prev) => ({ ...prev, defaultDestinationPort: portCode }));
  };

  const stats = useMemo(() => {
    if (!model || !defaults) return null;
    let overridden = 0;
    let total = 0;
    Object.entries(model.laneMatrix || {}).forEach(([usaPort, row]) => {
      const def = defaults.laneMatrix[usaPort] || {};
      Object.entries(row).forEach(([dst, val]) => {
        total += 1;
        if (num(def[dst]) !== num(val)) overridden += 1;
      });
    });
    return { total, overridden };
  }, [model, defaults]);

  if (loading || !model || !defaults) {
    return <div className="p-8 text-center text-[#71717A]">{t('calc_ocean_loading')}</div>;
  }

  const currentDefaultLabel =
    (defaults.destinationPorts.find((p) => p.code === (model.defaultDestinationPort || 'rotterdam')) || {}).name ||
    model.defaultDestinationPort;

  return (
    <div className="space-y-4 sm:space-y-5">
      {/* ── Header strip ──────────────────────────────────────────── */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 md:gap-4 bg-[#FAFAFA] border border-[#E5E5E7] rounded-lg px-4 sm:px-5 py-3 sm:py-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-full bg-[#0EA5E9]/10 flex items-center justify-center flex-shrink-0">
            <Boat size={18} className="text-[#0EA5E9]" />
          </div>
          <div className="min-w-0">
            <div className="font-semibold text-[14px] sm:text-[15px] text-[#18181B] truncate">{t('calc_ocean_title')}</div>
            <div className="text-[11px] sm:text-[12px] text-[#71717A] truncate">
              {stats ? `${stats.total} ${t('calc_ocean_lanes_count')} · ${stats.overridden} ${t('calc_ocean_overridden_count')} · ` : ''}
              {t('calc_ocean_public_default')} →{' '}
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
              data-testid="ocean-enabled"
              className="rounded"
            />
            <span className="text-[12px] sm:text-[13px]">{model.enabled ? t('calc_ocean_matrix_on') : t('calc_ocean_matrix_off')}</span>
          </label>
          <button
            type="button"
            onClick={resetToDefaults}
            className="px-3 py-2 text-[12px] sm:text-[13px] border border-[#E5E5E7] rounded-lg bg-white hover:bg-[#FAFAFA] inline-flex items-center gap-1.5"
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
            data-testid="ocean-save"
          >
            <FloppyDisk size={14} />
            {saving ? t('calc_saving') : t('calc_save')}
          </button>
        </div>
      </div>

      {/* ── Shared multipliers reference (read-only) ─────────────── */}
      <div className="border border-[#E5E5E7] rounded-lg p-4 bg-white">
        <div className="flex items-center gap-2 mb-3">
          <LinkSimple size={14} className="text-[#71717A]" />
          <span className="text-[11px] sm:text-[12px] uppercase tracking-wider font-semibold text-[#71717A]">
            {t('calc_shared_mult_title')}
          </span>
        </div>
        <div className="flex flex-wrap gap-2 mb-2">
          {Object.entries(defaults.sharedMultipliers).map(([code, m]) => (
            <span key={code} className="inline-flex items-center gap-1 px-2 py-1 rounded bg-[#F4F4F5] text-[12px]">
              <span className="font-semibold">{t(`calc_v_${code}`) || code}</span>
              <span className="text-[#71717A] font-mono">×{m}</span>
            </span>
          ))}
        </div>
        <div className="text-[11px] text-[#A1A1AA] leading-relaxed">{t('calc_shared_mult_hint')}</div>
      </div>

      {/* ── Default destination port (used by public UI) ─────────── */}
      <DefaultDestinationPicker
        model={model}
        defaults={defaults}
        onChange={updateDefaultDestination}
        t={t}
      />

      {/* ── Live formula preview ─────────────────────────────────── */}
      <FormulaPreview model={model} defaults={defaults} t={t} />

      {/* ── Lane matrix (8 × 8 = 64 cells) ───────────────────────── */}
      <LaneMatrix model={model} defaults={defaults} onCellChange={updateCell} t={t} />
    </div>
  );
};

export default OceanFreightModelEditor;
