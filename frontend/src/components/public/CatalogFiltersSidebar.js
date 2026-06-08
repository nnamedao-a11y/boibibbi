import React, { useEffect, useRef, useState } from 'react';
import { Car, Bike, Truck, Wrench, ChevronDown, Check } from 'lucide-react';
import { useLang } from '../../i18n';

const TYPES = [
  { id: 'car', label: 'Car', Icon: Car },
  { id: 'moto', label: 'Moto', Icon: Bike },
  { id: 'truck', label: 'Truck', Icon: Truck },
  { id: 'special', label: 'Special', Icon: Wrench },
];

const BRANDS = [
  'Audi', 'BMW', 'Mercedes-Benz', 'Porsche', 'Tesla', 'Lucid Motors',
  'Toyota', 'Honda', 'Lexus', 'Hyundai', 'Kia', 'Ford', 'Chevrolet',
  'Volkswagen', 'Nissan', 'Mazda', 'Subaru', 'Volvo', 'Land Rover', 'Jaguar',
];

const AUCTIONS = ['Copart', 'IAAI', 'Manheim', 'Mobile.de', 'Encar'];

// Translatable filter options (key = canonical English value sent to API).
const CONDITIONS_T = {
  en: { 'Run and Drive': 'Run and Drive', 'Enhanced': 'Enhanced', 'Salvage': 'Salvage', 'Stationary': 'Stationary', 'Engine Start': 'Engine Start' },
  bg: { 'Run and Drive': 'На ход', 'Enhanced': 'Подобрено', 'Salvage': 'Тотална щета', 'Stationary': 'Неподвижна', 'Engine Start': 'Стартира' },
};
const FUELS_T = {
  en: { 'Petrol': 'Petrol', 'Diesel': 'Diesel', 'Hybrid': 'Hybrid', 'Electric': 'Electric', 'LPG': 'LPG' },
  bg: { 'Petrol': 'Бензин', 'Diesel': 'Дизел', 'Hybrid': 'Хибрид', 'Electric': 'Електрическа', 'LPG': 'Газ (LPG)' },
};
const DAMAGES_T = {
  en: { 'Front': 'Front', 'Rear': 'Rear', 'Side': 'Side', 'Roof': 'Roof', 'Hail': 'Hail', 'Flood': 'Flood', 'Mechanical': 'Mechanical', 'No Damage': 'No Damage' },
  bg: { 'Front': 'Преден', 'Rear': 'Заден', 'Side': 'Страничен', 'Roof': 'Покрив', 'Hail': 'Градушка', 'Flood': 'Наводнение', 'Mechanical': 'Механична', 'No Damage': 'Без повреди' },
};
const CONDITIONS = Object.keys(CONDITIONS_T.en);
const FUELS = Object.keys(FUELS_T.en);
const DAMAGES = Object.keys(DAMAGES_T.en);

// Sidebar UI labels
const SIDEBAR_T = {
  en: {
    vehicleType: 'Vehicle type', car: 'Car', moto: 'Moto', truck: 'Truck', special: 'Special',
    brand: 'Brand', selectBrand: 'Select brand',
    model: 'Model', selectModel: 'Select model',
    year: 'Year',
    mileage: 'Mileage, km', from: 'From', to: 'To',
    auction: 'Auction', condition: 'Condition', fuel: 'Fuel', damage: 'Damage',
  },
  bg: {
    vehicleType: 'Тип превозно средство', car: 'Кола', moto: 'Мото', truck: 'Камион', special: 'Спец.',
    brand: 'Марка', selectBrand: 'Изберете марка',
    model: 'Модел', selectModel: 'Изберете модел',
    year: 'Година',
    mileage: 'Пробег, км', from: 'От', to: 'До',
    auction: 'Търг', condition: 'Състояние', fuel: 'Гориво', damage: 'Повреда',
  },
};

const MIN_YEAR = 1990;
const MAX_YEAR = 2026;

// =====================================================
// Two-thumb range slider (draggable)
// =====================================================
const RangeSlider = ({ min, max, value, onChange, suffix = '' }) => {
  const trackRef = useRef(null);
  const [drag, setDrag] = useState(null); // 'min' | 'max' | null
  const [low, high] = value;

  const pct = (v) => ((v - min) / (max - min)) * 100;

  useEffect(() => {
    if (!drag) return;
    const onMove = (e) => {
      const rect = trackRef.current?.getBoundingClientRect();
      if (!rect) return;
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
      const v = Math.round(min + ratio * (max - min));
      if (drag === 'min') {
        onChange([Math.min(v, high - 1), high]);
      } else {
        onChange([low, Math.max(v, low + 1)]);
      }
    };
    const onUp = () => setDrag(null);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    window.addEventListener('touchmove', onMove);
    window.addEventListener('touchend', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onUp);
    };
  }, [drag, low, high, min, max, onChange]);

  return (
    <div className="select-none">
      <div
        ref={trackRef}
        className="relative h-6 flex items-center cursor-pointer"
        role="group"
      >
        <div className="absolute left-0 right-0 h-[3px] bg-[#3A3A3A] rounded" />
        <div
          className="absolute h-[3px] bg-[#FEAE00] rounded"
          style={{ left: `${pct(low)}%`, right: `${100 - pct(high)}%` }}
        />
        <button
          type="button"
          onMouseDown={() => setDrag('min')}
          onTouchStart={() => setDrag('min')}
          aria-label="Min"
          className="absolute -translate-x-1/2 w-4 h-4 rounded-full bg-[#FEAE00] border-2 border-black cursor-grab active:cursor-grabbing"
          style={{ left: `${pct(low)}%` }}
          data-testid="range-thumb-min"
        />
        <button
          type="button"
          onMouseDown={() => setDrag('max')}
          onTouchStart={() => setDrag('max')}
          aria-label="Max"
          className="absolute -translate-x-1/2 w-4 h-4 rounded-full bg-[#FEAE00] border-2 border-black cursor-grab active:cursor-grabbing"
          style={{ left: `${pct(high)}%` }}
          data-testid="range-thumb-max"
        />
      </div>
      <div className="flex justify-between mt-3 text-[13px] text-[#C8C8C8]">
        <span>{low}{suffix}</span>
        <span>{high}{suffix}</span>
      </div>
    </div>
  );
};

// =====================================================
// Collapsible section
// =====================================================
const Section = ({ label, defaultOpen = false, children, count = 0 }) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-t border-[#2A2A2A]">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between py-4 text-left"
      >
        <span className="text-[14px] font-medium text-white capitalize flex items-center gap-2">
          {label}
          {count > 0 && (
            <span className="text-[11px] px-2 py-0.5 rounded-full bg-[#FEAE00] text-black font-bold">
              {count}
            </span>
          )}
        </span>
        <ChevronDown
          size={16}
          className={`text-[#FEAE00] transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>
      <div
        className={`grid transition-all duration-200 ease-out ${
          open ? 'grid-rows-[1fr] opacity-100 pb-5' : 'grid-rows-[0fr] opacity-0'
        }`}
      >
        <div className="overflow-hidden">{children}</div>
      </div>
    </div>
  );
};

// =====================================================
// Checkbox list — values are canonical EN, displayLabels translatable
// =====================================================
const CheckList = ({ options, value = [], onChange, displayLabels }) => (
  <div className="flex flex-col gap-3">
    {options.map((opt) => {
      const checked = value.includes(opt);
      return (
        <label
          key={opt}
          className="flex items-center gap-3 cursor-pointer text-[13px] text-[#C8C8C8] hover:text-white"
        >
          <span
            className={`w-4 h-4 rounded-sm border flex items-center justify-center transition-colors ${
              checked ? 'bg-[#FEAE00] border-[#FEAE00]' : 'border-[#555]'
            }`}
          >
            {checked && <Check size={12} className="text-black" strokeWidth={3} />}
          </span>
          <input
            type="checkbox"
            className="sr-only"
            checked={checked}
            onChange={() =>
              onChange(checked ? value.filter((v) => v !== opt) : [...value, opt])
            }
          />
          {displayLabels ? (displayLabels[opt] || opt) : opt}
        </label>
      );
    })}
  </div>
);

// =====================================================
// Main sidebar
// =====================================================
export const CatalogFiltersSidebar = ({ filters = {}, setFilters }) => {
  const set = (patch) => setFilters({ ...filters, ...patch });
  const yearVal = filters.yearRange || [MIN_YEAR, MAX_YEAR];
  const { lang } = useLang();
  const T = lang === 'bg' ? SIDEBAR_T.bg : SIDEBAR_T.en;
  const condLabels = (lang === 'bg' ? CONDITIONS_T.bg : CONDITIONS_T.en);
  const fuelLabels = (lang === 'bg' ? FUELS_T.bg : FUELS_T.en);
  const dmgLabels = (lang === 'bg' ? DAMAGES_T.bg : DAMAGES_T.en);

  return (
    <aside
      className="bg-[#0F0F0F] border border-[#1E1E1E] rounded-md p-6 lg:sticky lg:top-[104px] lg:max-h-[calc(100vh-120px)] lg:overflow-y-auto filter-sidebar-scroll"
      data-testid="catalog-filters-sidebar"
    >
      {/* Vehicle type */}
      <div className="text-[12px] uppercase tracking-[0.18em] text-white mb-4">{T.vehicleType}</div>
      <div className="grid grid-cols-4 gap-2 mb-6">
        {TYPES.map(({ id, Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => set({ vehicleType: id })}
            className={`h-12 rounded flex items-center justify-center transition-colors ${
              (filters.vehicleType || 'car') === id
                ? 'bg-[#FEAE00] text-black'
                : 'bg-[#1A1A1A] text-[#C8C8C8] hover:text-white border border-[#2A2A2A]'
            }`}
            data-testid={`filter-type-${id}`}
            aria-label={T[id] || id}
            title={T[id] || id}
          >
            <Icon size={20} />
          </button>
        ))}
      </div>

      {/* Brand */}
      <div className="mb-4">
        <label className="block text-[13px] text-white mb-2">{T.brand}</label>
        <div className="relative">
          <select
            value={filters.brand || ''}
            onChange={(e) => set({ brand: e.target.value || undefined, model: undefined })}
            className="w-full h-11 bg-[#1A1A1A] border border-[#2A2A2A] rounded px-3 pr-9 text-[13px] text-white appearance-none focus:outline-none focus:border-[#FEAE00] cursor-pointer"
            data-testid="filter-brand"
          >
            <option value="">{T.selectBrand}</option>
            {BRANDS.map((b) => (
              <option key={b} value={b}>{b}</option>
            ))}
          </select>
          <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#FEAE00] pointer-events-none" />
        </div>
      </div>

      {/* Model */}
      <div className="mb-5">
        <label className="block text-[13px] text-white mb-2">{T.model}</label>
        <div className="relative">
          <input
            value={filters.model || ''}
            onChange={(e) => set({ model: e.target.value })}
            placeholder={T.selectModel}
            className="w-full h-11 bg-[#1A1A1A] border border-[#2A2A2A] rounded px-3 pr-9 text-[13px] text-white placeholder-[#6A6A6A] focus:outline-none focus:border-[#FEAE00]"
            data-testid="filter-model"
          />
          <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#FEAE00] pointer-events-none" />
        </div>
      </div>

      {/* Year range */}
      <div className="mb-2">
        <label className="block text-[13px] text-white mb-3">{T.year}</label>
        <RangeSlider
          min={MIN_YEAR}
          max={MAX_YEAR}
          value={yearVal}
          onChange={(v) => set({ yearRange: v })}
        />
      </div>

      <div className="mt-2">
        <Section label={T.mileage} count={filters.mileageMax ? 1 : 0}>
          <div className="flex items-center gap-3">
            <input
              type="number"
              placeholder={T.from}
              value={filters.mileageMin || ''}
              onChange={(e) => set({ mileageMin: e.target.value })}
              className="w-1/2 h-10 bg-[#1A1A1A] border border-[#2A2A2A] rounded px-3 text-[13px] text-white focus:outline-none focus:border-[#FEAE00]"
            />
            <span className="text-[#555]">—</span>
            <input
              type="number"
              placeholder={T.to}
              value={filters.mileageMax || ''}
              onChange={(e) => set({ mileageMax: e.target.value })}
              className="w-1/2 h-10 bg-[#1A1A1A] border border-[#2A2A2A] rounded px-3 text-[13px] text-white focus:outline-none focus:border-[#FEAE00]"
            />
          </div>
        </Section>

        <Section label={T.auction} count={(filters.auctions || []).length}>
          <CheckList
            options={AUCTIONS}
            value={filters.auctions || []}
            onChange={(v) => set({ auctions: v })}
          />
        </Section>

        <Section label={T.condition} count={(filters.conditions || []).length}>
          <CheckList
            options={CONDITIONS}
            value={filters.conditions || []}
            onChange={(v) => set({ conditions: v })}
            displayLabels={condLabels}
          />
        </Section>

        <Section label={T.fuel} count={(filters.fuels || []).length}>
          <CheckList
            options={FUELS}
            value={filters.fuels || []}
            onChange={(v) => set({ fuels: v })}
            displayLabels={fuelLabels}
          />
        </Section>

        <Section label={T.damage} count={(filters.damages || []).length}>
          <CheckList
            options={DAMAGES}
            value={filters.damages || []}
            onChange={(v) => set({ damages: v })}
            displayLabels={dmgLabels}
          />
        </Section>
      </div>
    </aside>
  );
};

export default CatalogFiltersSidebar;
