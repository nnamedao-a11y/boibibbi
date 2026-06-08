/**
 * BibiHero — admin-configurable hero banner for the BIBI Cars homepage.
 *
 *   Layout (1920 desktop):
 *     left  : copy block  (eyebrow, big 3-line display title, three slash KPIs)
 *     right : large bleed background photo
 *     bottom: Brand / Model / Year filter row + yellow "FIND A CAR" CTA
 *
 *   Content source:
 *     GET /api/site-info → site.hero {
 *        enabled,
 *        eyebrow_en/_bg,
 *        title_line1_en/_bg, title_line2_en/_bg, title_line3_en/_bg,
 *        kpi1_en/_bg, kpi2_en/_bg, kpi3_en/_bg,
 *        image_url,
 *     }
 *   The current language is taken from the public language context
 *   (`useLang` from ../../i18n) so the same component renders EN or BG.
 */
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { CaretDown, MagnifyingGlass } from '@phosphor-icons/react';
import { useLang } from '../../i18n';

const API_URL = process.env.REACT_APP_BACKEND_URL || '';

// Built-in fallback photo used when the admin hasn't uploaded one.
// Matches the original Figma layout (yellow AMG bleed) so the homepage
// looks identical to the reference until an admin uploads a custom image.
const DEFAULT_HERO_CAR = '/figma/image-60@2x.webp';

// Build absolute URL for relative `/api/static/...` paths.
const resolveImageUrl = (raw) => {
  if (!raw) return DEFAULT_HERO_CAR;
  if (/^https?:\/\//i.test(raw)) return raw;
  if (raw.startsWith('/')) return `${API_URL}${raw}`;
  return raw;
};

// Default hero copy (used as fallback before /api/site-info responds).
const DEFAULT_HERO = {
  enabled: true,
  eyebrow_en: 'AMERICA | KOREA',
  eyebrow_bg: 'АМЕРИКА | КОРЕЯ',
  title_line1_en: 'From auction',
  title_line1_bg: 'От търг',
  title_line2_en: 'to keys',
  title_line2_bg: 'до ключове',
  title_line3_en: 'in your hands',
  title_line3_bg: 'във Вашите ръце',
  kpi1_en: 'Over 5,000 cars',
  kpi1_bg: 'Над 5,000 автомобила',
  kpi2_en: 'Real-time bids',
  kpi2_bg: 'Наддавания на живо',
  kpi3_en: '500+ happy clients',
  kpi3_bg: '500+ доволни клиенти',
  image_url: '',
};

const BRANDS_EN = [
  'Any brand', 'Audi', 'BMW', 'Mercedes-Benz', 'Toyota', 'Lexus',
  'Hyundai', 'Kia', 'Tesla', 'Volkswagen', 'Volvo', 'Porsche',
];
const BRANDS_BG = [
  'Всяка марка', 'Audi', 'BMW', 'Mercedes-Benz', 'Toyota', 'Lexus',
  'Hyundai', 'Kia', 'Tesla', 'Volkswagen', 'Volvo', 'Porsche',
];
const MODELS_EN = ['Any model'];
const MODELS_BG = ['Всеки модел'];
const YEARS_EN = ['Any year', '2026', '2025', '2024', '2023', '2022', '2021', '2020'];
const YEARS_BG = ['Всяка година', '2026', '2025', '2024', '2023', '2022', '2021', '2020'];

const Dropdown = ({ label, options, value, onChange, testId }) => {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative flex-1 min-w-0" data-testid={testId}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full h-[58px] flex items-center justify-between gap-2 px-5 text-left text-[15px] text-white bg-[#0e0e0e] border border-[#3a3a38] rounded-md hover:border-[#FEAE00]/60 transition-colors"
      >
        <span className={value ? 'text-white' : 'text-[#9a9a98]'}>
          {value || label}
        </span>
        <CaretDown
          size={16}
          weight="fill"
          className={`text-[#9a9a98] transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-[#141414] border border-[#3a3a38] rounded-md max-h-72 overflow-auto z-30 shadow-xl">
          {options.map((opt) => (
            <button
              key={opt}
              type="button"
              onClick={() => { onChange(opt); setOpen(false); }}
              className="block w-full text-left px-5 py-2.5 text-[14px] text-white hover:bg-[#FEAE00] hover:text-black transition-colors"
            >
              {opt}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default function BibiHero() {
  const navigate = useNavigate();
  const { lang } = useLang();
  const isBg = lang === 'bg';
  const suffix = isBg ? '_bg' : '_en';

  const [hero, setHero] = useState(DEFAULT_HERO);
  const [brand, setBrand] = useState('');
  const [model, setModel] = useState('');
  const [year, setYear] = useState('');

  // Pull admin-configured hero copy + image
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await axios.get(`${API_URL}/api/site-info`);
        if (cancelled) return;
        const h = r?.data?.hero;
        if (h && typeof h === 'object') {
          setHero({ ...DEFAULT_HERO, ...h });
        }
      } catch {
        // keep defaults silently
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (hero.enabled === false) return null;

  const submit = (e) => {
    e.preventDefault();
    const params = new URLSearchParams();
    if (brand && !['Any brand', 'Всяка марка'].includes(brand)) params.set('make', brand);
    if (model && !['Any model', 'Всеки модел'].includes(model)) params.set('model', model);
    if (year && !['Any year', 'Всяка година'].includes(year)) params.set('year', year);
    navigate(`/catalog${params.toString() ? `?${params.toString()}` : ''}`);
  };

  // Resolve copy with graceful fallback to the other language, then default.
  const pick = (key) =>
    hero[`${key}${suffix}`] ||
    hero[`${key}${isBg ? '_en' : '_bg'}`] ||
    DEFAULT_HERO[`${key}${suffix}`] ||
    DEFAULT_HERO[`${key}_en`] ||
    '';

  const eyebrow = pick('eyebrow');
  const t1 = pick('title_line1');
  const t2 = pick('title_line2');
  const t3 = pick('title_line3');
  const k1 = pick('kpi1');
  const k2 = pick('kpi2');
  const k3 = pick('kpi3');
  const photo = resolveImageUrl(hero.image_url);

  // Pretty-print the eyebrow: replace `|` with the amber accent separator.
  const renderEyebrow = (txt) => {
    if (!txt) return null;
    const parts = txt.split('|');
    if (parts.length === 1) return parts[0];
    return parts.map((p, i) => (
      <React.Fragment key={i}>
        {i > 0 && <span className="mx-1 text-[#FEAE00]">|</span>}
        <span>{p.trim()}</span>{i < parts.length - 1 ? ' ' : ''}
      </React.Fragment>
    ));
  };

  return (
    <section
      className="relative w-full overflow-hidden bg-black text-white"
      data-testid="bibi-hero"
      style={{ minHeight: 720 }}
    >
      {/* Background photo — right-anchored bleed */}
      <div className="absolute inset-0">
        <img
          src={photo}
          alt=""
          className="w-full h-full object-cover object-center opacity-90"
          loading="eager"
          onError={(e) => {
            // graceful fallback if the configured URL is broken
            if (e.currentTarget.src !== DEFAULT_HERO_CAR) {
              e.currentTarget.src = DEFAULT_HERO_CAR;
            }
          }}
        />
        {/* Dark gradient sweep so left copy stays readable */}
        <div
          className="absolute inset-0"
          style={{
            background:
              'linear-gradient(90deg, rgba(0,0,0,0.92) 0%, rgba(0,0,0,0.78) 28%, rgba(0,0,0,0.45) 50%, rgba(0,0,0,0.18) 72%, rgba(0,0,0,0.05) 100%)',
          }}
        />
        {/* Bottom blackout for filter bar */}
        <div className="absolute inset-x-0 bottom-0 h-[260px] bg-gradient-to-t from-black via-black/85 to-transparent" />
      </div>

      {/* Content */}
      <div className="relative max-w-[1920px] mx-auto px-6 lg:px-[100px] pt-[110px] pb-[60px]">
        <div className="max-w-[820px]">
          {/* Eyebrow */}
          {eyebrow && (
            <div className="text-[18px] tracking-[0.18em] text-white/80 mb-3 uppercase">
              {renderEyebrow(eyebrow)}
            </div>
          )}

          {/* Big display title (line 2 = amber accent) */}
          <h1
            className="font-[Mazzard] tracking-tight"
            style={{ fontSize: 'clamp(48px, 7vw, 110px)', lineHeight: 0.95, letterSpacing: '-0.01em' }}
          >
            {t1 && <span className="block text-white font-bold">{t1}</span>}
            {t2 && <span className="block text-[#FEAE00] font-bold">{t2}</span>}
            {t3 && <span className="block text-white font-bold">{t3}</span>}
          </h1>

          {/* KPI strip */}
          <div className="mt-10 flex flex-col sm:flex-row gap-x-10 gap-y-2 text-[18px] text-white/85">
            {k1 && <span><span className="text-[#FEAE00] mr-1">/</span> {k1}</span>}
            {k2 && <span><span className="text-[#FEAE00] mr-1">/</span> {k2}</span>}
            {k3 && <span><span className="text-[#FEAE00] mr-1">/</span> {k3}</span>}
          </div>
        </div>

        {/* Filter bar (desktop) */}
        <form
          onSubmit={submit}
          className="mt-16 hidden md:flex items-stretch gap-3 max-w-[1100px]"
          data-testid="bibi-hero-filter"
        >
          <Dropdown label={isBg ? 'Марка' : 'Brand'}      options={isBg ? BRANDS_BG : BRANDS_EN} value={brand} onChange={setBrand} testId="hero-brand" />
          <Dropdown label={isBg ? 'Модел' : 'Model'}      options={isBg ? MODELS_BG : MODELS_EN} value={model} onChange={setModel} testId="hero-model" />
          <Dropdown label={isBg ? 'Година' : 'Any year'}  options={isBg ? YEARS_BG  : YEARS_EN}  value={year}  onChange={setYear}  testId="hero-year" />
          <button
            type="submit"
            className="h-[58px] px-7 inline-flex items-center justify-center gap-2 bg-[#FEAE00] hover:bg-[#FFBF2D] active:bg-[#E89D00] text-black text-[14px] font-medium uppercase tracking-[0.06em] rounded-md transition-colors whitespace-nowrap"
            data-testid="hero-find-car"
          >
            <MagnifyingGlass size={18} weight="bold" />
            {isBg ? 'Намери кола' : 'Find a car'}
          </button>
        </form>

        {/* Mobile fallback */}
        <button
          onClick={() => navigate('/catalog')}
          className="mt-10 md:hidden inline-flex items-center justify-center gap-2 h-[52px] px-7 bg-[#FEAE00] hover:bg-[#FFBF2D] text-black uppercase font-medium tracking-[0.06em] rounded-md w-full"
        >
          <MagnifyingGlass size={18} weight="bold" />
          {isBg ? 'Намери кола' : 'Find a car'}
        </button>
      </div>
    </section>
  );
}
