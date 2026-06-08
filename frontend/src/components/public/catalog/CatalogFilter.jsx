/**
 * P-Catalog — left-side filter (Figma 1:1 — Vehicles Filter.png).
 *
 *  Layout (all blocks inside .filter):
 *    • Horizontal padding 32 px (left/right)
 *    • Vertical gap between blocks = 24 px (controlled by .block margin)
 *    • Vehicle type icons row → padding 0 (icons fill row), gap auto
 *    • Section headers ("SOURCE", "TECHNICAL SPECS") H SemiBold 14 px,
 *      collapsible (default = collapsed), chevron 17 × 17.
 *    • Labels (Brand, Model, Year, …) → H Medium 14 px, white.
 *    • Inputs / select values  → H Regular 14 px, white when filled,
 *      #5E5E5E when placeholder.
 *
 *  Vehicle icon cards (top row):
 *    • Icon proper:    32 × 32 (via CSS mask, recolorable)
 *    • Card padding:   6 px vertical, 12 px horizontal → outer 56 × 44
 *    • Inactive: transparent bg, icon white
 *    • Active:   solid yellow #FEAE00 bg, icon black (currentColor)
 *    • No border, no glow, no radius (Figma: rectangular fill)
 */
import React, { useState, useEffect } from 'react';
import axios from 'axios';
import styles from './CatalogFilter.module.css';
import CustomDropdown from './CustomDropdown';
import RangeSlider from './RangeSlider';
import RangeStepSelect from './RangeStepSelect';
import { useLang } from '../../../i18n';
import { API_URL } from '../../../App';

const VEHICLE_TYPES = [
  { code: 'motorbike', tKey: 'filterVehMotorbike', label: 'motorbike', icon: '/figma/calc/veh-motorbike.png' },
  { code: 'sedan',     tKey: 'filterVehSedan',     label: 'sedan',     icon: '/figma/calc/veh-sedan.png' },
  { code: 'suv',       tKey: 'filterVehSuv',       label: 'SUV',       icon: '/figma/calc/veh-suv.png' },
  { code: 'pickup',    tKey: 'filterVehPickup',    label: 'Pick-up',   icon: '/figma/calc/veh-pickup.png' },
  { code: 'van',       tKey: 'filterVehVan',       label: 'Van',       icon: '/figma/calc/veh-van.png' },
];

/* Year bounds — fully dynamic so the filter ages gracefully without
 * any code changes when the calendar rolls over.
 *
 *  • `YEAR_MIN`  : fixed lower bound, oldest supported model year.
 *  • `YEAR_MAX`  : `current calendar year + 1`. Auto-derived on every
 *                  render mount. The "+1" is intentional — automakers
 *                  release next-year model-year cars in Q4 of the
 *                  prior calendar year (e.g. a 2027 model first
 *                  appears at auctions in late 2026), so the slider
 *                  must already reach there.
 *  • Manual text-input keeps a 4-digit numeric mask, so a user can
 *    always type any year they want (the slider clamps thumbs into
 *    [MIN, MAX] while the typed value is preserved verbatim until the
 *    backend filter applies it).
 */
const CURRENT_YEAR = new Date().getFullYear();
const YEAR_MIN = 1990;
const YEAR_MAX = CURRENT_YEAR + 1;
const PRICE_MIN = 0;
const PRICE_MAX = 100_000;
const MILEAGE_MIN = 0;
const MILEAGE_MAX = 300_000;

/* Predefined step lists for the dropdown side of each range filter.
 * Users keep the freedom to type any value into the text input, and the
 * slider still spans the full range — the dropdown is just a quick-pick
 * shortcut that mirrors the "Any Year / 2025 / 2024 / …" pattern from
 * the homepage search box (which is the design users explicitly asked
 * us to align to). */
const YEAR_STEPS = (() => {
  const arr = [];
  for (let y = YEAR_MAX; y >= YEAR_MIN; y -= 1) arr.push({ value: y, label: String(y) });
  return arr;
})();
const PRICE_STEPS = [
  1_000, 2_500, 5_000, 7_500,
  10_000, 15_000, 20_000, 25_000, 30_000,
  40_000, 50_000, 60_000, 75_000, 90_000, 100_000,
].map((p) => ({ value: p, label: `€ ${p.toLocaleString('en-US')}` }));
const MILEAGE_STEPS = [
  5_000, 10_000, 25_000, 50_000, 75_000,
  100_000, 125_000, 150_000, 175_000, 200_000, 250_000, 300_000,
].map((m) => ({ value: m, label: `${m.toLocaleString('en-US')} km` }));

const BRANDS_FALLBACK = [
  'Acura', 'Alfa Romeo', 'Audi', 'BMW', 'Buick', 'Cadillac', 'Chevrolet', 'Chrysler',
  'Dodge', 'Ferrari', 'Ford', 'Genesis', 'GMC', 'Honda', 'Hyundai', 'Infiniti', 'Jaguar',
  'Jeep', 'Kia', 'Land Rover', 'Lexus', 'Lincoln', 'Lucid Motors', 'Maserati', 'Mazda',
  'Mercedes-Benz', 'Mini', 'Mitsubishi', 'Nissan', 'Porsche', 'Ram', 'Subaru', 'Tesla',
  'Toyota', 'Volkswagen', 'Volvo',
];

const num = (v) => {
  if (v == null || v === '') return null;
  const n = Number(String(v).replace(/[^0-9]/g, ''));
  return Number.isFinite(n) ? n : null;
};
const fmtPrice   = (n) => (n == null ? '' : `€ ${Number(n).toLocaleString()}`);
const fmtMileage = (n) => (n == null ? '' : Number(n).toLocaleString());

export default function CatalogFilter({ value, onChange }) {
  const v = value || {};
  const { t } = useLang();
  const set = (patch) => onChange({ ...v, ...patch });

  // Default both SOURCE and TECHNICAL SPECS to **collapsed** per Figma.
  const [sourceOpen, setSourceOpen] = useState(false);
  const [techOpen,   setTechOpen]   = useState(false);

  /* Real brand list pulled from /api/public/brands. Each item is
   * `{name, count, available}` so the dropdown can dim unavailable rows. */
  const [brands, setBrands] = useState(() => (
    BRANDS_FALLBACK.map((n) => ({ name: n, count: 0, available: true }))
  ));
  useEffect(() => {
    let cancelled = false;
    axios.get(`${API_URL}/api/public/brands`).then((res) => {
      if (cancelled) return;
      const arr = (res.data?.data || []).filter(Boolean);
      if (arr.length) setBrands(arr);
    }).catch(() => { /* keep fallback list */ });
    return () => { cancelled = true; };
  }, []);

  /* Real model list — refetched whenever the brand selection changes.
   * Empty array ⇒ Model dropdown shows "No models found" message.
   * Each item is `{name, count, available}` so unavailable models are
   * rendered dimmed by the dropdown. */
  const [models, setModels] = useState([]);
  const brandArr = Array.isArray(v.brand) ? v.brand : (v.brand ? [v.brand] : []);
  const brandKey = brandArr.join('|');
  useEffect(() => {
    if (!brandKey) { setModels([]); return undefined; }
    let cancelled = false;
    axios
      .get(`${API_URL}/api/public/models`, { params: { brand: brandKey } })
      .then((res) => {
        if (cancelled) return;
        const arr = (res.data?.data || []).filter(Boolean);
        setModels(arr);
      })
      .catch(() => { if (!cancelled) setModels([]); });
    return () => { cancelled = true; };
  }, [brandKey]);

  const toggleArr = (key, item) => {
    const arr = new Set(v[key] || []);
    if (arr.has(item)) arr.delete(item); else arr.add(item);
    set({ [key]: Array.from(arr) });
  };

  /* ── Slider state derived from filters (single source of truth) ── */
  const yearLo  = num(v.yearMin)   ?? YEAR_MIN;
  const yearHi  = num(v.yearMax)   ?? YEAR_MAX;
  const priceLo = num(v.priceMin)  ?? PRICE_MIN;
  const priceHi = num(v.priceMax)  ?? PRICE_MAX;
  const mileLo  = num(v.mileageMin) ?? MILEAGE_MIN;
  const mileHi  = num(v.mileageMax) ?? MILEAGE_MAX;

  return (
    <aside className={styles.filter} data-testid="catalog-filter">
      {/* ─── Vehicle type icons (5 cards) ────────────────────────────── */}
      <div className={styles.iconsRow} data-testid="catalog-filter-types">
        {VEHICLE_TYPES.map((tt) => {
          const active = v.vehicleType === tt.code;
          const localized = t(tt.tKey) || tt.label;
          return (
            <button
              key={tt.code}
              type="button"
              className={`${styles.vehCard} ${active ? styles.vehCardActive : ''}`}
              onClick={() => set({ vehicleType: active ? null : tt.code })}
              title={localized}
              aria-label={localized}
              aria-pressed={active}
              data-testid={`catalog-vehicle-${tt.code}`}
            >
              <span
                className={styles.vehIcon}
                style={{ WebkitMaskImage: `url(${tt.icon})`, maskImage: `url(${tt.icon})` }}
                aria-hidden="true"
              />
            </button>
          );
        })}
      </div>

      {/* ─── Brand (multi-select, checkmark variant + search) ───── */}
      <div className={styles.block}>
        <div className={styles.label}>{t('filterBrand') || 'Brand'}</div>
        <CustomDropdown
          value={Array.isArray(v.brand) ? v.brand : (v.brand ? [v.brand] : [])}
          options={brands}
          placeholder={t('filterAllBrands') || 'All brands'}
          multi
          variant="checkmark"
          clearLabel={t('filterClearSelection') || 'Clear selection'}
          onChange={(next) => set({ brand: next, model: [] })}
          testId="catalog-filter-brand"
        />
      </div>

      {/* ─── Model (multi-select, checkbox variant + Clear) ─────── */}
      <div className={styles.block}>
        <div className={styles.label}>{t('filterModel') || 'Model'}</div>
        <CustomDropdown
          value={Array.isArray(v.model) ? v.model : (v.model ? [v.model] : [])}
          options={models}
          placeholder={t('filterModelsPlaceholder') || 'Models'}
          disabledPlaceholder={t('filterSelectBrandFirst') || 'Select brand first'}
          emptyText={t('filterNoModelsFound') || 'No models found'}
          multi
          variant="checkbox"
          clearLabel={t('filterClearSelection') || 'Clear selection'}
          disabled={!brandArr.length}
          onChange={(next) => set({ model: next })}
          testId="catalog-filter-model"
        />
      </div>

      {/* ─── Year ─────────────────────────────────────────────────────
       *  Per Figma: no dropdown — just two manual text inputs paired
       *  with the dual-thumb slider (slider mutates the same state).
       * ──────────────────────────────────────────────────────────── */}
      <div className={styles.block}>
        <div className={styles.label}>{t('filterYear') || 'Year'}</div>
        <div className={styles.row2}>
          <RangeStepSelect
            value={v.yearMin || ''}
            onChange={(val) => set({ yearMin: val.slice(0, 4) })}
            placeholder={t('filterFromPh') || 'From'}
            steps={YEAR_STEPS}
            testId="catalog-filter-year-min"
          />
          <RangeStepSelect
            value={v.yearMax || ''}
            onChange={(val) => set({ yearMax: val.slice(0, 4) })}
            placeholder={t('filterToPh') || 'To'}
            steps={YEAR_STEPS}
            testId="catalog-filter-year-max"
          />
        </div>
        <RangeSlider
          min={YEAR_MIN}
          max={YEAR_MAX}
          step={1}
          value={[yearLo, yearHi]}
          onChange={([lo, hi]) => set({ yearMin: String(lo), yearMax: String(hi) })}
          testId="catalog-filter-year-slider"
          wrapClassName={styles.sliderWrap}
        />
      </div>

      {/* ─── Estimated total price ──────────────────────────────────── */}
      <div className={styles.block}>
        <div className={styles.label}>{t('filterEstimatedTotalPrice') || 'Estimated total price'}</div>
        <div className={styles.row2}>
          <RangeStepSelect
            value={v.priceMin || ''}
            onChange={(val) => set({ priceMin: val })}
            placeholder={t('filterPriceFromPh') || '€ From'}
            steps={PRICE_STEPS}
            formatValue={(raw) => (raw ? fmtPrice(raw) : '')}
            testId="catalog-filter-price-min"
          />
          <RangeStepSelect
            value={v.priceMax || ''}
            onChange={(val) => set({ priceMax: val })}
            placeholder={t('filterPriceToPh') || '€ To'}
            steps={PRICE_STEPS}
            formatValue={(raw) => (raw ? fmtPrice(raw) : '')}
            testId="catalog-filter-price-max"
          />
        </div>
        <RangeSlider
          min={PRICE_MIN}
          max={PRICE_MAX}
          step={500}
          value={[priceLo, priceHi]}
          onChange={([lo, hi]) => set({ priceMin: String(lo), priceMax: String(hi) })}
          testId="catalog-filter-price-slider"
          wrapClassName={styles.sliderWrap}
        />
      </div>

      {/* ─── Mileage ────────────────────────────────────────────────── */}
      <div className={styles.block}>
        <div className={styles.label}>{t('filterMileageKm') || 'Mileage, km'}</div>
        <div className={styles.row2}>
          <RangeStepSelect
            value={v.mileageMin || ''}
            onChange={(val) => set({ mileageMin: val })}
            placeholder="0"
            steps={MILEAGE_STEPS}
            formatValue={(raw) => (raw ? fmtMileage(raw) : '')}
            testId="catalog-filter-mileage-min"
          />
          <RangeStepSelect
            value={v.mileageMax || ''}
            onChange={(val) => set({ mileageMax: val })}
            placeholder={t('filterToPh') || 'To'}
            steps={MILEAGE_STEPS}
            formatValue={(raw) => (raw ? fmtMileage(raw) : '')}
            testId="catalog-filter-mileage-max"
          />
        </div>
        <RangeSlider
          min={MILEAGE_MIN}
          max={MILEAGE_MAX}
          step={1000}
          value={[mileLo, mileHi]}
          onChange={([lo, hi]) => set({ mileageMin: String(lo), mileageMax: String(hi) })}
          testId="catalog-filter-mileage-slider"
          wrapClassName={styles.sliderWrap}
        />
      </div>

      {/* ─── Vehicle damage status (segmented) ──────────────────────── */}
      <div className={styles.block}>
        <div className={styles.label}>{t('filterVehicleDamageStatus') || 'Vehicle damage status'}</div>
      </div>
      <div className={styles.damageRow}>
        <button
          type="button"
          className={`${styles.dmgBtn} ${v.damaged === false ? styles.dmgActiveOk : ''}`}
          onClick={() => set({ damaged: v.damaged === false ? null : false })}
          data-testid="catalog-filter-not-damaged"
        >
          {t('filterNotDamagedBtn') || 'NOT DAMAGED'}
        </button>
        <button
          type="button"
          className={`${styles.dmgBtn} ${v.damaged === true ? styles.dmgActiveBad : ''}`}
          onClick={() => set({ damaged: v.damaged === true ? null : true })}
          data-testid="catalog-filter-damaged"
        >
          {t('filterDamagedBtn') || 'DAMAGED'}
        </button>
      </div>

      <hr className={styles.divider} />

      {/* ─── SOURCE (collapsible, default closed) ───────────────────── */}
      <button
        type="button"
        className={styles.sectionHeader}
        onClick={() => setSourceOpen((s) => !s)}
        aria-expanded={sourceOpen}
        data-testid="catalog-filter-source-toggle"
      >
        <img
          src="/figma/icons/chevron-down-grey.svg"
          alt=""
          className={`${styles.sectionCaret} ${sourceOpen ? '' : styles.sectionCaretClosed}`}
          width={17}
          height={17}
        />
        <span>{t('filterSource') || 'SOURCE'}</span>
      </button>
      {sourceOpen && (
        <>
          <div className={styles.block}>
            <div className={styles.label}>{t('filterCountry') || 'Country'}</div>
            <div className={styles.pillRow}>
              {['USA', 'KOREA'].map((c) => (
                <button
                  key={c}
                  type="button"
                  className={`${styles.pill} ${v.country === c ? styles.pillActive : ''}`}
                  onClick={() => set({ country: v.country === c ? null : c })}
                  data-testid={`catalog-filter-country-${c.toLowerCase()}`}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>

          <div className={styles.block}>
            <div className={styles.label}>{t('filterAuctionType') || 'Auction type'}</div>
            <CustomDropdown
              value={Array.isArray(v.auctionType) ? v.auctionType : (v.auctionType ? [v.auctionType] : [])}
              options={[
                { label: 'IAA Partners', value: 'iaai',    available: true },
                { label: 'COPART',       value: 'copart',  available: true },
                { label: 'Manheim',      value: 'manheim', available: true },
                { label: 'Encar',        value: 'encar',   available: true },
              ]}
              placeholder={t('filterAllAuctions') || 'All auctions'}
              multi
              variant="checkbox"
              clearLabel={t('filterClearSelection') || 'Clear selection'}
              onChange={(next) => set({ auctionType: next })}
              testId="catalog-filter-auction-type"
            />
          </div>

          <div className={styles.block}>
            <div className={styles.label}>{t('filterAuctionStatus') || 'Auction status'}</div>
            <div className={styles.checkRow}>
              {[
                { code: 'within7',  tKey: 'filterEndedWithin7Days', fallback: 'Ended Within 7 Days' },
                { code: 'upcoming', tKey: 'filterUpcomingAuctions', fallback: 'Upcoming Auctions' },
                { code: 'buyNow',   tKey: 'filterBuyNow',           fallback: 'Buy Now' },
              ].map((row) => {
                const checked = (v.auctionStatus || []).includes(row.code);
                return (
                  <label
                    key={row.code}
                    className={styles.checkLabel}
                    data-testid={`catalog-filter-status-${row.code.toLowerCase()}`}
                  >
                    <span className={`${styles.checkbox} ${checked ? styles.checkboxOn : ''}`}>
                      {checked && (
                        <svg viewBox="0 0 16 16" width="12" height="12">
                          <path d="M3.5 8.5l3 3 6-6" fill="none" stroke="#FEAE00"
                                strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      )}
                    </span>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleArr('auctionStatus', row.code)}
                      hidden
                    />
                    <span className={`${styles.checkText} ${checked ? styles.checkTextOn : ''}`}>{t(row.tKey) || row.fallback}</span>
                  </label>
                );
              })}
            </div>
          </div>
        </>
      )}

      <hr className={styles.divider} />

      {/* ─── TECHNICAL SPECS (collapsible, default closed) ─────────── */}
      <button
        type="button"
        className={styles.sectionHeader}
        onClick={() => setTechOpen((s) => !s)}
        aria-expanded={techOpen}
        data-testid="catalog-filter-tech-toggle"
      >
        <img
          src="/figma/icons/chevron-down-grey.svg"
          alt=""
          className={`${styles.sectionCaret} ${techOpen ? '' : styles.sectionCaretClosed}`}
          width={17}
          height={17}
        />
        <span>{t('filterTechnicalSpecs') || 'TECHNICAL SPECS'}</span>
      </button>
      {techOpen && (
        <>
          <div className={styles.block}>
            <div className={styles.label}>{t('filterFuel') || 'Fuel'}</div>
            <div className={styles.pillRow}>
              {[
                { code: 'Gasoline', tKey: 'filterGasoline' },
                { code: 'Diesel',   tKey: 'filterDiesel' },
                { code: 'Hybrid',   tKey: 'filterHybrid' },
                { code: 'EV',       tKey: 'filterEV' },
              ].map((f) => (
                <button
                  key={f.code}
                  type="button"
                  className={`${styles.pill} ${(v.fuel || []).includes(f.code) ? styles.pillActive : ''}`}
                  onClick={() => toggleArr('fuel', f.code)}
                  data-testid={`catalog-filter-fuel-${f.code.toLowerCase()}`}
                >
                  {t(f.tKey) || f.code}
                </button>
              ))}
            </div>
          </div>

          <div className={styles.block}>
            <div className={styles.label}>{t('filterTransmission') || 'Transmission'}</div>
            <div className={styles.pillRow}>
              {[
                { code: 'Automatic', tKey: 'filterAutomatic' },
                { code: 'Manual',    tKey: 'filterManual' },
              ].map((tr) => (
                <button
                  key={tr.code}
                  type="button"
                  className={`${styles.pill} ${(v.transmission || []).includes(tr.code) ? styles.pillActive : ''}`}
                  onClick={() => toggleArr('transmission', tr.code)}
                  data-testid={`catalog-filter-trans-${tr.code.toLowerCase()}`}
                >
                  {t(tr.tKey) || tr.code}
                </button>
              ))}
            </div>
          </div>

          <div className={styles.block}>
            <div className={styles.label}>{t('filterBodyType') || 'Body type'}</div>
            <CustomDropdown
              value={v.bodyType || ''}
              options={[
                { label: t('filterSedan')       || 'Sedan',       value: 'sedan' },
                { label: t('filterSuv')         || 'SUV',         value: 'suv' },
                { label: t('filterHatchback')   || 'Hatchback',   value: 'hatchback' },
                { label: t('filterCoupe')       || 'Coupe',       value: 'coupe' },
                { label: t('filterWagon')       || 'Wagon',       value: 'wagon' },
                { label: t('filterConvertible') || 'Convertible', value: 'convertible' },
                { label: t('filterPickup')      || 'Pick-up',     value: 'pickup' },
                { label: t('filterVan')         || 'Van',         value: 'van' },
              ]}
              placeholder={t('filterAllTypesPh') || 'All types'}
              onChange={(next) => set({ bodyType: next })}
              testId="catalog-filter-body"
            />
          </div>

          <div className={styles.block}>
            <div className={styles.label}>{t('filterDriveType') || 'Drive type'}</div>
            <CustomDropdown
              value={v.driveType || ''}
              options={[
                { label: t('filterFrontWheel') || 'Front-wheel', value: 'FWD' },
                { label: t('filterRearWheel')  || 'Rear-wheel',  value: 'RWD' },
                { label: t('filterAllWheel')   || 'All-wheel',   value: 'AWD' },
              ]}
              placeholder={t('filterAllTypesPh') || 'All types'}
              onChange={(next) => set({ driveType: next })}
              testId="catalog-filter-drive"
            />
          </div>

          <div className={styles.block}>
            <div className={styles.label}>{t('filterEngineVolume') || 'Engine volume'}</div>
            <CustomDropdown
              value={v.engineVolume || ''}
              options={[
                { label: '1.0 – 1.6 L', value: '1.0-1.6' },
                { label: '1.6 – 2.0 L', value: '1.6-2.0' },
                { label: '2.0 – 3.0 L', value: '2.0-3.0' },
                { label: '3.0 L+',      value: '3.0+' },
              ]}
              placeholder={t('filterAllTypesPh') || 'All types'}
              onChange={(next) => set({ engineVolume: next })}
              testId="catalog-filter-engine"
            />
          </div>
        </>
      )}
    </aside>
  );
}
