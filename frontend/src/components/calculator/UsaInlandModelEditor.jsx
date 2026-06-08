/**
 * UsaInlandModelEditor
 * ====================
 *
 * Wave 4 — pricing model editor for USA inland transport.
 *
 * Flow rendered:
 *
 *     STATE → preferred export port → miles (DERIVED) →
 *     bucket (DERIVED) → vehicle multiplier → final $
 *
 * What the admin CAN edit:
 *   1. Distance buckets (min/max miles + sedan base price).
 *   2. Vehicle multipliers (×0.6 motorcycle … ×2.0 trailer).
 *   3. Auction → state fallback (legacy shim).
 *   4. **Preferred export port** per state.
 *
 * What the admin CANNOT edit (derived data):
 *   *  miles per (state, port) pair — comes from the static 51×8 matrix
 *      shipped from the backend (`stateDistances`).
 *   *  which bucket a row falls into — derived from miles.
 *   *  the final inland $ — derived from bucket × multiplier.
 *
 * This is intentional: miles is *physics*, not policy. Admin choices
 * are limited to PRICING knobs (buckets + multipliers) and ROUTING
 * decisions (preferred port per state). Distances follow automatically.
 *
 * Save lands in ``calculator_profile.usaInlandModel`` via the existing
 * PATCH ``/api/calculator/config/profile`` endpoint.
 */
import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { CaretDown, CaretUp, FloppyDisk, ArrowsClockwise, Truck, Info } from '@phosphor-icons/react';
import { API_URL } from '../../App';
import { US_STATES } from '../../data/usStates';

const VEHICLE_LABELS = {
  sedan:      'Sedan',
  suv:        'SUV / Crossover',
  bigSUV:     'Big SUV / 4x4',
  pickup:     'Pickup',
  van:        'Van',
  motorcycle: 'Motorcycle',
  trailer:    'Trailer',
};

const num = (v, fallback = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

const cloneDeep = (x) => JSON.parse(JSON.stringify(x ?? {}));

// Pick a bucket given miles + bucket ladder
const bucketForMiles = (miles, buckets) => {
  if (!buckets || !buckets.length) return null;
  const m = Math.max(0, Number(miles) || 0);
  for (const b of buckets) {
    const lo = num(b.minMiles, 0);
    const hi = num(b.maxMiles, 0);
    if (m >= lo && m < hi) return b;
  }
  return buckets[buckets.length - 1];
};

// ────────────────────────────────────────────────────────────────────────
// Section wrapper
// ────────────────────────────────────────────────────────────────────────
const Sub = ({ title, hint, children, defaultOpen = true }) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-[#E5E5E7] rounded-lg overflow-hidden bg-white">
      <button
        type="button"
        onClick={() => setOpen((p) => !p)}
        className="w-full flex items-center justify-between px-5 py-3 bg-[#FAFAFA] hover:bg-[#F4F4F5]"
      >
        <div className="text-left">
          <div className="font-semibold text-[14px] text-[#18181B]">{title}</div>
          {hint ? <div className="text-[12px] text-[#71717A] mt-0.5">{hint}</div> : null}
        </div>
        {open ? <CaretUp size={16} /> : <CaretDown size={16} />}
      </button>
      {open ? <div className="p-5">{children}</div> : null}
    </div>
  );
};

// ────────────────────────────────────────────────────────────────────────
// Live formula preview
// ────────────────────────────────────────────────────────────────────────
//
// Picks a state + vehicle and renders the full derivation:
//
//     Texas → Houston → 325 mi → Short bucket ($450) × Pickup ×1.5
//     = $675
//
// Lets the admin SEE the formula, not just trust the numbers.
// ────────────────────────────────────────────────────────────────────────
const FormulaPreview = ({ model, defaults }) => {
  const [stateCode, setStateCode] = useState('TX');
  const [vehicleCode, setVehicleCode] = useState('sedan');

  const portCode =
    (model.stateOverrides[stateCode] && model.stateOverrides[stateCode].port) || '';
  const portLabel = (defaults.exportPorts.find((p) => p.code === portCode) || { name: '—', state: '' });
  const distRow = defaults.stateDistances[stateCode] || {};
  const distOverride =
    (model.distanceOverrides && model.distanceOverrides[stateCode] && model.distanceOverrides[stateCode][portCode]) ||
    null;
  const miles = num(distOverride != null ? distOverride : distRow[portCode], 0);
  const bucket = bucketForMiles(miles, model.buckets);
  const base = bucket ? num(bucket.basePrice, 0) : 0;
  const mult = num(model.vehicleMultipliers[vehicleCode], 1.0);
  const total = Math.round(base * mult * 100) / 100;

  const stateName = (US_STATES.find((s) => s.code === stateCode) || {}).name || stateCode;

  return (
    <div className="border border-[#FEAE00]/40 bg-[#FFFBEA] rounded-lg p-5">
      <div className="flex items-center gap-2 mb-3">
        <Info size={16} className="text-[#FEAE00]" />
        <span className="text-[12px] uppercase tracking-wider font-semibold text-[#92400E]">
          Live formula preview
        </span>
      </div>
      <div className="flex flex-wrap items-end gap-3 mb-4">
        <div>
          <label className="block text-[11px] uppercase tracking-wider text-[#71717A] mb-1">State</label>
          <select
            value={stateCode}
            onChange={(e) => setStateCode(e.target.value)}
            className="px-2 py-1.5 border border-[#E5E5E7] rounded text-[13px] bg-white"
            data-testid="preview-state"
          >
            {US_STATES.map((s) => (
              <option key={s.code} value={s.code}>{s.code} — {s.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-[11px] uppercase tracking-wider text-[#71717A] mb-1">Vehicle</label>
          <select
            value={vehicleCode}
            onChange={(e) => setVehicleCode(e.target.value)}
            className="px-2 py-1.5 border border-[#E5E5E7] rounded text-[13px] bg-white"
            data-testid="preview-vehicle"
          >
            {Object.keys(model.vehicleMultipliers).map((code) => (
              <option key={code} value={code}>{VEHICLE_LABELS[code] || code}</option>
            ))}
          </select>
        </div>
      </div>
      <div className="text-[14px] text-[#18181B] leading-7 font-mono" data-testid="preview-formula">
        <span className="text-[#71717A]">{stateName}</span>
        <span className="mx-2 text-[#A1A1AA]">→</span>
        <span className="font-semibold">{portLabel.name}{portLabel.state ? ` (${portLabel.state})` : ''}</span>
        <span className="mx-2 text-[#A1A1AA]">→</span>
        <span className="font-semibold">{miles}&nbsp;mi</span>
        <span className="mx-2 text-[#A1A1AA]">→</span>
        <span className="font-semibold">{bucket ? bucket.name : '—'}</span>
        <span className="text-[#71717A]"> bucket (${base})</span>
        <span className="mx-2 text-[#A1A1AA]">×</span>
        <span className="font-semibold">{VEHICLE_LABELS[vehicleCode] || vehicleCode}</span>
        <span className="text-[#71717A]"> ×{mult}</span>
        <span className="mx-2 text-[#A1A1AA]">=</span>
        <span className="text-[#FEAE00] font-bold text-[18px]" data-testid="preview-total">
          ${total.toLocaleString()}
        </span>
      </div>
      <div className="text-[11px] text-[#92400E]/70 mt-2">
        Numbers update live as you edit buckets / multipliers / preferred ports above and below.
      </div>
    </div>
  );
};

// ────────────────────────────────────────────────────────────────────────
// Main editor
// ────────────────────────────────────────────────────────────────────────
const UsaInlandModelEditor = ({ profile, onProfileChange }) => {
  const [defaults, setDefaults] = useState(null);
  const [model, setModel] = useState(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [stateFilter, setStateFilter] = useState('');

  // ── Load defaults + overrides ────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const { data } = await axios.get(`${API_URL}/api/calculator/config/usa-inland-defaults`);
        if (cancelled) return;
        setDefaults(data);
        const ov = data.profileOverrides || {};
        // Build a working draft: every state has a row (defaults merged
        // with admin overrides). Distance is DERIVED, never stored.
        const stateRows = {};
        Object.entries(data.stateMatrix).forEach(([code, def]) => {
          const o = (ov.stateOverrides || {})[code] || {};
          stateRows[code] = { port: o.port || def.port };
        });
        const draft = {
          enabled: ov.enabled !== false,
          buckets: cloneDeep(ov.buckets && ov.buckets.length ? ov.buckets : data.buckets),
          vehicleMultipliers: { ...data.vehicleMultipliers, ...(ov.vehicleMultipliers || {}) },
          stateOverrides: stateRows,
          auctionFallback: { ...data.auctionFallback, ...(ov.auctionFallback || {}) },
          distanceOverrides: cloneDeep(ov.distanceOverrides || {}),
        };
        setModel(draft);
      } catch (e) {
        toast.error('Failed to load USA inland model defaults');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.code]);

  // ── Save (PATCH the profile) ─────────────────────────────────────────
  const save = async () => {
    if (!model || !profile?.code) return;
    setSaving(true);
    try {
      // Persist only deltas from defaults to keep the profile small.
      const stateDiff = {};
      Object.entries(model.stateOverrides || {}).forEach(([code, v]) => {
        const def = defaults.stateMatrix[code];
        if (!def || def.port !== v.port) {
          stateDiff[code] = { port: v.port };
        }
      });
      const payload = {
        code: profile.code,
        usaInlandModel: {
          enabled: !!model.enabled,
          buckets: model.buckets,
          vehicleMultipliers: model.vehicleMultipliers,
          stateOverrides: stateDiff,
          auctionFallback: model.auctionFallback,
          distanceOverrides: model.distanceOverrides || {},
        },
      };
      const { data } = await axios.patch(`${API_URL}/api/calculator/config/profile`, payload);
      if (onProfileChange) onProfileChange(data);
      toast.success('USA inland model saved');
    } catch (e) {
      toast.error('Failed to save USA inland model');
    } finally {
      setSaving(false);
    }
  };

  // ── Reset overrides (restore bundled defaults) ───────────────────────
  const resetToDefaults = () => {
    if (!defaults) return;
    const stateRows = {};
    Object.entries(defaults.stateMatrix).forEach(([code, def]) => {
      stateRows[code] = { port: def.port };
    });
    setModel({
      enabled: true,
      buckets: cloneDeep(defaults.buckets),
      vehicleMultipliers: { ...defaults.vehicleMultipliers },
      stateOverrides: stateRows,
      auctionFallback: { ...defaults.auctionFallback },
      distanceOverrides: {},
    });
    toast.info('Restored bundled defaults — click Save to persist');
  };

  // ── Bucket editors ───────────────────────────────────────────────────
  const updateBucket = (idx, key, value) => {
    setModel((prev) => {
      const next = cloneDeep(prev);
      next.buckets[idx][key] = key === 'code' || key === 'name' ? value : num(value);
      return next;
    });
  };

  // ── Multiplier editor ────────────────────────────────────────────────
  const updateMultiplier = (vehicleCode, value) => {
    setModel((prev) => {
      const next = cloneDeep(prev);
      next.vehicleMultipliers[vehicleCode] = num(value, 1.0);
      return next;
    });
  };

  // ── Preferred port editor (THE only state-row edit) ──────────────────
  const updateStatePort = (code, portCode) => {
    setModel((prev) => {
      const next = cloneDeep(prev);
      const row = next.stateOverrides[code] || {};
      row.port = portCode;
      next.stateOverrides[code] = row;
      return next;
    });
  };

  // ── Auction fallback editor ──────────────────────────────────────────
  const updateAuctionFallback = (auctionCode, stateCode) => {
    setModel((prev) => {
      const next = cloneDeep(prev);
      next.auctionFallback[auctionCode] = stateCode.toUpperCase();
      return next;
    });
  };

  // ── Filtered state rows ──────────────────────────────────────────────
  const filteredStates = useMemo(() => {
    if (!model) return [];
    const q = stateFilter.trim().toLowerCase();
    return US_STATES.filter((s) => {
      if (!q) return true;
      return s.code.toLowerCase().includes(q) || s.name.toLowerCase().includes(q);
    });
  }, [stateFilter, model]);

  if (loading || !model || !defaults) {
    return (
      <div className="p-8 text-center text-[#71717A]">Loading USA inland model…</div>
    );
  }

  const portOptions = (defaults.exportPorts || []).map((p) => ({
    code: p.code, label: `${p.name} (${p.state})`,
  }));

  return (
    <div className="space-y-5">
      {/* ── Header strip ──────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-4 flex-wrap bg-[#FAFAFA] border border-[#E5E5E7] rounded-lg px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-[#FEAE00]/10 flex items-center justify-center">
            <Truck size={18} className="text-[#FEAE00]" />
          </div>
          <div>
            <div className="font-semibold text-[15px] text-[#18181B]">USA Inland Transport — bucket model</div>
            <div className="text-[12px] text-[#71717A]">
              state → preferred export route → derived miles → bucket × vehicle multiplier
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={!!model.enabled}
              onChange={(e) => setModel((p) => ({ ...p, enabled: e.target.checked }))}
              data-testid="usa-inland-enabled"
            />
            <span className="text-[13px]">{model.enabled ? 'Bucket model · ON' : 'Bucket model · OFF (legacy fallback)'}</span>
          </label>
          <button
            type="button"
            onClick={resetToDefaults}
            className="px-3 py-2 text-[13px] border border-[#E5E5E7] rounded hover:bg-white"
          >
            <ArrowsClockwise size={14} className="inline mr-1" />
            Reset to defaults
          </button>
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="px-4 py-2 text-[13px] bg-[#18181B] text-white rounded hover:bg-[#27272A] disabled:opacity-50"
            data-testid="usa-inland-save"
          >
            <FloppyDisk size={14} className="inline mr-1" />
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>

      {/* ── Live formula preview ─────────────────────────────────── */}
      <FormulaPreview model={model} defaults={defaults} />

      {/* ── 1. Distance buckets ──────────────────────────────────── */}
      <Sub
        title="1 · Distance buckets"
        hint="Sedan-baseline price per distance band. Buckets are half-open [min, max) in miles."
      >
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="text-left text-[#71717A] border-b">
                <th className="py-2 pr-3">Code</th>
                <th className="py-2 pr-3">Name</th>
                <th className="py-2 pr-3">Min miles</th>
                <th className="py-2 pr-3">Max miles</th>
                <th className="py-2 pr-3">Base price (Sedan, USD)</th>
              </tr>
            </thead>
            <tbody>
              {model.buckets.map((b, idx) => (
                <tr key={b.code} className="border-b last:border-b-0">
                  <td className="py-2 pr-3 font-mono">{b.code}</td>
                  <td className="py-2 pr-3">
                    <input
                      className="w-full px-2 py-1.5 border border-[#E5E5E7] rounded text-[13px]"
                      value={b.name || ''}
                      onChange={(e) => updateBucket(idx, 'name', e.target.value)}
                      data-testid={`bucket-name-${b.code}`}
                    />
                  </td>
                  <td className="py-2 pr-3">
                    <input
                      type="number"
                      className="w-28 px-2 py-1.5 border border-[#E5E5E7] rounded text-[13px]"
                      value={b.minMiles}
                      onChange={(e) => updateBucket(idx, 'minMiles', e.target.value)}
                      data-testid={`bucket-min-${b.code}`}
                    />
                  </td>
                  <td className="py-2 pr-3">
                    <input
                      type="number"
                      className="w-28 px-2 py-1.5 border border-[#E5E5E7] rounded text-[13px]"
                      value={b.maxMiles}
                      onChange={(e) => updateBucket(idx, 'maxMiles', e.target.value)}
                      data-testid={`bucket-max-${b.code}`}
                    />
                  </td>
                  <td className="py-2 pr-3">
                    <input
                      type="number"
                      className="w-32 px-2 py-1.5 border border-[#E5E5E7] rounded text-[13px]"
                      value={b.basePrice}
                      onChange={(e) => updateBucket(idx, 'basePrice', e.target.value)}
                      data-testid={`bucket-price-${b.code}`}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Sub>

      {/* ── 2. Vehicle multipliers ───────────────────────────────── */}
      <Sub
        title="2 · Vehicle size multipliers"
        hint="Multiplier applied on top of the bucket's sedan base price. Sedan = 1.0 by convention."
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {Object.keys(model.vehicleMultipliers).map((code) => (
            <div key={code} className="border border-[#E5E5E7] rounded-lg px-3 py-3 flex items-center justify-between">
              <div>
                <div className="font-medium text-[13px]">{VEHICLE_LABELS[code] || code}</div>
                <div className="text-[11px] text-[#A1A1AA] font-mono">{code}</div>
              </div>
              <div className="flex items-center gap-1">
                <span className="text-[11px] text-[#A1A1AA]">×</span>
                <input
                  type="number"
                  step="0.05"
                  className="w-20 px-2 py-1.5 border border-[#E5E5E7] rounded text-[13px] text-right font-mono"
                  value={model.vehicleMultipliers[code]}
                  onChange={(e) => updateMultiplier(code, e.target.value)}
                  data-testid={`mult-${code}`}
                />
              </div>
            </div>
          ))}
        </div>
      </Sub>

      {/* ── 3. Auction fallback ──────────────────────────────────── */}
      <Sub
        title="3 · Auction → state fallback"
        hint="When the calculator payload has no explicit state (legacy callers), fall back to this state per auction id. Goes away once all callers send state."
        defaultOpen={false}
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {Object.keys(model.auctionFallback).map((auctionCode) => (
            <div key={auctionCode} className="border border-[#E5E5E7] rounded-lg px-3 py-3 flex items-center justify-between">
              <div>
                <div className="font-medium text-[13px] capitalize">{auctionCode}</div>
                <div className="text-[11px] text-[#A1A1AA] font-mono">→ state</div>
              </div>
              <select
                className="px-2 py-1.5 border border-[#E5E5E7] rounded text-[13px] font-mono"
                value={model.auctionFallback[auctionCode] || ''}
                onChange={(e) => updateAuctionFallback(auctionCode, e.target.value)}
                data-testid={`fallback-${auctionCode}`}
              >
                {US_STATES.map((s) => (
                  <option key={s.code} value={s.code}>{s.code} — {s.name}</option>
                ))}
              </select>
            </div>
          ))}
        </div>
      </Sub>

      {/* ── 4. State → preferred export route ─────────────────────── */}
      <Sub
        title="4 · State → preferred export route (51 rows)"
        hint={
          'Default logistics approximation per state — not a strict per-order dispatch rule. ' +
          'Miles are derived from the static state×port distance matrix (rounded to 25-mi increments) ' +
          'and update automatically when the preferred port changes.'
        }
      >
        <div className="flex items-center gap-3 mb-3">
          <input
            type="search"
            placeholder="Filter by state code or name…"
            value={stateFilter}
            onChange={(e) => setStateFilter(e.target.value)}
            className="px-3 py-2 border border-[#E5E5E7] rounded text-[13px] flex-1"
            data-testid="state-filter"
          />
          <span className="text-[12px] text-[#71717A]">{filteredStates.length} / {US_STATES.length}</span>
        </div>
        <div className="overflow-y-auto max-h-[480px] border border-[#E5E5E7] rounded">
          <table className="w-full text-[13px]">
            <thead className="sticky top-0 bg-[#FAFAFA] z-10">
              <tr className="text-left text-[#71717A] border-b">
                <th className="py-2 px-3">State</th>
                <th className="py-2 px-3">Preferred export route</th>
                <th className="py-2 px-3 text-right">Miles <span className="font-normal text-[11px] text-[#A1A1AA]">(auto)</span></th>
                <th className="py-2 px-3">Bucket <span className="font-normal text-[11px] text-[#A1A1AA]">(auto)</span></th>
              </tr>
            </thead>
            <tbody>
              {filteredStates.map((s) => {
                const row = model.stateOverrides[s.code] || { port: '' };
                const distRow = defaults.stateDistances[s.code] || {};
                const distOv =
                  (model.distanceOverrides && model.distanceOverrides[s.code] && model.distanceOverrides[s.code][row.port]) ||
                  null;
                const miles = num(distOv != null ? distOv : distRow[row.port], 0);
                const bucket = bucketForMiles(miles, model.buckets);
                return (
                  <tr key={s.code} className="border-b last:border-b-0 hover:bg-[#FAFAFA]">
                    <td className="py-2 px-3 font-mono whitespace-nowrap">
                      <span className="font-semibold">{s.code}</span>
                      <span className="text-[#A1A1AA] ml-2">{s.name}</span>
                    </td>
                    <td className="py-2 px-3">
                      <select
                        className="px-2 py-1 border border-[#E5E5E7] rounded text-[13px] w-full max-w-[220px]"
                        value={row.port || ''}
                        onChange={(e) => updateStatePort(s.code, e.target.value)}
                        data-testid={`state-port-${s.code}`}
                      >
                        <option value="">— pick a route —</option>
                        {portOptions.map((p) => (
                          <option key={p.code} value={p.code}>{p.label}</option>
                        ))}
                      </select>
                    </td>
                    <td className="py-2 px-3 text-right font-mono text-[#52525B]" data-testid={`state-miles-${s.code}`}>
                      {miles ? `${miles} mi` : '—'}
                    </td>
                    <td className="py-2 px-3">
                      {bucket ? (
                        <span
                          className="inline-block px-2 py-0.5 rounded text-[11px] uppercase tracking-wider bg-[#F4F4F5] text-[#52525B]"
                          data-testid={`state-bucket-${s.code}`}
                        >
                          {bucket.name}
                        </span>
                      ) : (
                        <span className="text-[#A1A1AA]">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Sub>
    </div>
  );
};

export default UsaInlandModelEditor;
