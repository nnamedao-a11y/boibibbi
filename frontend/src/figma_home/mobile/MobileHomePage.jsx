import React, { useEffect, useState, useRef, useMemo } from 'react';
import axios from 'axios';
import { Link } from 'react-router-dom';
import { Car, Bike } from 'lucide-react';
import { Clock, ArrowRight } from '@phosphor-icons/react';
import MobileHeader from './MobileHeader';
import MobileMenu from './MobileMenu';
import ShareModal from '../../components/public/ShareModal';
import { CAR_BRANDS, MODELS_BY_BRAND } from '../../data/cars';
import { useGetInTouch } from '../../components/public/GetInTouchModal';
import { usePolicyModal } from '../../components/public/PolicyModal';
import { useLang } from '../../i18n';
import { renderKpiWithRolling } from '../../components/RollingNumber';
import { useTiltParallax } from '../../components/useTiltParallax';
import AnimatedHeading from '../../components/AnimatedHeading';
import { optimizeImage, ImageSize } from '../../lib/optimizeImage';

const API = process.env.REACT_APP_BACKEND_URL || '';

/**
 * MobileHomePage — mobile version of the BIBI Cars homepage matching the
 * Figma mobile design at the 360px breakpoint. Renders below 768px.
 *
 * Sections (per Figma "Home page" mobile mock):
 *  1. Header (logo + phones + hamburger)
 *  2. Hero (FROM AUCTION TO KEYS / IN YOUR HANDS) + KPI
 *  3. Search/filter form (Brand · Model · Year · Find a car)
 *  4. Application steps 1–5
 *  5. How to buy a turnkey car (USA/Korea brand grid)
 *  6. We have perfect service
 *  7. Why you pay less — and get more
 *  8. Before & after
 *  9. Our clients say (reviews)
 * 10. Want to drive your dream car? CTA
 * 11. FAQ
 * 12. Footer (viber community, contacts, socials)
 */

const FALLBACK_PHONES = ['+359 875 313 158', '+359 897 884 804'];

const FALLBACK_HERO = {
  en: {
    eyebrow: 'america | Korea',
    title_line1: 'From auction',
    title_line2: 'to keys',
    title_line3: 'in your hands',
    kpi1: '/ Over 5,000 cars',
    kpi2: '/ Real-time bids',
    kpi3: '/ 500+ happy clients',
  },
  bg: {
    eyebrow: 'америка | Корея',
    title_line1: 'От търг',
    title_line2: 'до ключове',
    title_line3: 'във Вашите ръце',
    kpi1: '/ Над 5,000 автомобила',
    kpi2: '/ Наддавания на живо',
    kpi3: '/ 500+ доволни клиенти',
  },
};

const FALLBACK_FAQ = {
  en: [
    { question: 'How to choose and buy a car from America?' },
    { question: 'Where do you ship to?' },
    { question: 'How long will it take for my order to arrive?' },
    { question: 'How do I change or cancel my order?' },
    { question: 'How can I track my order?' },
  ],
  bg: [
    { question: 'Как да изберете и купите автомобил от Америка?' },
    { question: 'Къде доставяте?' },
    { question: 'Колко време ще отнеме доставката на моята поръчка?' },
    { question: 'Как мога да променя или анулирам поръчката си?' },
    { question: 'Как мога да проследя поръчката си?' },
  ],
};

const FALLBACK_REVIEWS = {
  en: [
    { name: 'Georgi', rating: 5, text: 'Loved the approach — clear, transparent, no surprises. The car matched my budget and they were always in touch.' },
    { name: 'Dimitar', rating: 5, text: 'Bought a car from auction — they really know their stuff. Great value for money.' },
  ],
  bg: [
    { name: 'Георги', rating: 5, text: 'Хареса ми подходът — ясен, прозрачен, без изненади. Колата отговаряше на бюджета и винаги бяха на разположение.' },
    { name: 'Димитър', rating: 5, text: 'Купих автомобил от аукцион — наистина си разбират от работата. Страхотно съотношение цена/качество.' },
  ],
};

const I18N = {
  en: {
    searchForCars: 'Search for cars',
    fromAmericaAndKorea: 'from America and Korea',
    searchForCarsFromAmericaKorea: 'Search for cars from America and Korea',
    mostPopularBrands: 'Most popular brands',
    otherBrandsPlus: 'Other brands +',
    hideBrandsMinus: 'Hide brands −',
    topVehiclesDeals: 'Top vehicles deals',
    ofTheWeek: 'of the week',
    thousandsOfListings: 'Thousands of listings.',
    onlyBestMakeCut: 'Only the best make the cut.',
    updatedWeekly: 'Updated weekly',
    wantToDrive: 'Want to drive',
    yourDreamCar: 'your dream car?',
    fillOutApplication: 'Fill out the application and we will find the best offer for you',
    contactUs: 'Contact us',
    faqTitle: 'FAQ',
    phoneNumber: 'Phone number:',
    getInTouch: 'Get in touch',
    address: 'Address:',
    workingHours: 'Working hours',
    workingHoursDefault: 'Mon - Fri, 10.00 - 19.00',
    registrationAddress: 'Registration address:',
    registrationAddressDefault: 'Republic of Bulgaria, 1415, Sofia, Cherni Vrah Blvd., 230',
    socialMedia: 'Social media:',
    joinOurGroupHottest: 'Join our group and get the hottest offers',
    navCatalog: 'CATALOG',
    navCalculator: 'CALCULATOR',
    navAboutUs: 'ABOUT US',
    navBlog: 'BLOG',
    legalConditions: 'CONDITIONS',
    legalPrivacy: 'PRIVACY POLICY',
    legalCookies: 'COOKIES',
    allRightReserved: 'All right reserved. BIBI CARS',
    vehicleType: 'Vehicle type',
    motorbike: 'Motorbike',
    sedan: 'Sedan',
    suv: 'SUV',
    pickup: 'Pick-up',
    van: 'Van',
    // Hero filter form
    carSearch: 'Car Search',
    brand: 'Brand',
    model: 'Model',
    year: 'Year',
    allBrands: 'All brands',
    allModels: 'All models',
    fromShort: 'From',
    toShort: 'To',
    findCar: 'Find a car',
    searchBrand: 'Search brand...',
    noBrandsFound: 'No brands found',
    // Filter chips / pricing
    priceRange: 'Price range',
    proposalsLabel: 'Proposals',
    // Top deals
    moreVehiclesPlus: 'More vehicles +',
    lessVehiclesMinus: 'Less vehicles −',
    moreDetails: 'More details',
    tradingDate: 'Trading date',
    purchasePriceLabel: 'Purchase price',
    mileageLabel: 'Mileage',
    engineLabel: 'Engine',
    driveLabel: 'Drive',
    estimatedFinal: 'Estimated final',
    costToBulgaria: 'cost to Bulgaria:',
    driveAllWheel: 'All-wheel',
    enginePetrol: 'Petrol',
    engineDiesel: 'Diesel',
    engineHybrid: 'Hybrid',
    engineElectric: 'Electric',
    // Calculator block
    calculateCarYourself: 'Calculate a car yourself',
    withPriceGuarantee: 'with a price guarantee',
    fromUsaKorea: 'From the USA and Korea',
    searchByVin: 'Search by VIN or lot number',
    calculate: 'Calculate',
    allCatalogPlus: 'All catalog +',
    // Bracketed bilingual subtitles
    ourClientsReceive: 'Our clients receive',
    theBestService: 'the best service',
    satisfiedClients: 'Satisfied clients',
    areOurPriority: 'are our priority',
    beforeAndAfter: 'Before and after',
    ourClientsSay: 'Our clients say',
    whatCustomersSay: 'What customers say',
    whenTheyWorkWithUs: 'when they work with us',
    googleReviews: 'Google reviews',
    websiteDesignBy: 'Website design - O.la',
    websiteMadeWith: 'Website made with Eva-X',
  },
  bg: {
    searchForCars: 'Търсене на автомобили',
    fromAmericaAndKorea: 'от Америка и Корея',
    searchForCarsFromAmericaKorea: 'Търсене на автомобили от Америка и Корея',
    mostPopularBrands: 'Най-популярни марки',
    otherBrandsPlus: 'Други марки +',
    hideBrandsMinus: 'Скрий марките −',
    topVehiclesDeals: 'Топ автомобилни оферти',
    ofTheWeek: 'на седмицата',
    thousandsOfListings: 'Хиляди обяви.',
    onlyBestMakeCut: 'Само най-добрите преминават.',
    updatedWeekly: 'Актуализирано седмично',
    wantToDrive: 'Искате да карате',
    yourDreamCar: 'колата на мечтите си?',
    fillOutApplication: 'Попълнете формуляра и ние ще намерим най-добрата оферта за вас',
    contactUs: 'Свържете се с нас',
    faqTitle: 'Често задавани въпроси',
    phoneNumber: 'Телефонен номер:',
    getInTouch: 'Свържете се с нас',
    address: 'Адрес:',
    workingHours: 'Работно време',
    workingHoursDefault: 'Пон - Пет, 10.00 - 19.00',
    registrationAddress: 'Адрес на регистрация:',
    registrationAddressDefault: 'Република България, 1415, София, бул. Черни връх, 230',
    socialMedia: 'Социални мрежи:',
    joinOurGroupHottest: 'Присъединете се към нашата група и получете най-горещите оферти',
    navCatalog: 'КАТАЛОГ',
    navCalculator: 'КАЛКУЛАТОР',
    navAboutUs: 'ЗА НАС',
    navBlog: 'БЛОГ',
    legalConditions: 'УСЛОВИЯ',
    legalPrivacy: 'ПОЛИТИКА ЗА ПОВЕРИТЕЛНОСТ',
    legalCookies: 'БИСКВИТКИ',
    allRightReserved: 'Всички права запазени. BIBI CARS',
    vehicleType: 'Тип автомобил',
    motorbike: 'Мотоциклет',
    sedan: 'Седан',
    suv: 'Джип',
    pickup: 'Пикап',
    van: 'Ван',
    // Hero filter form
    carSearch: 'Търсене на автомобил',
    brand: 'Марка',
    model: 'Модел',
    year: 'Година',
    allBrands: 'Всички марки',
    allModels: 'Всички модели',
    fromShort: 'От',
    toShort: 'До',
    findCar: 'Намери автомобил',
    searchBrand: 'Търси марка...',
    noBrandsFound: 'Няма намерени марки',
    // Filter chips / pricing
    priceRange: 'Ценови диапазон',
    proposalsLabel: 'Оферти',
    // Top deals
    moreVehiclesPlus: 'Още автомобили +',
    lessVehiclesMinus: 'По-малко автомобили −',
    moreDetails: 'Повече детайли',
    tradingDate: 'Дата на търг',
    purchasePriceLabel: 'Покупна цена',
    mileageLabel: 'Пробег',
    engineLabel: 'Двигател',
    driveLabel: 'Задвижване',
    estimatedFinal: 'Прогнозна крайна',
    costToBulgaria: 'цена до България:',
    driveAllWheel: 'Всички колела',
    enginePetrol: 'Бензин',
    engineDiesel: 'Дизел',
    engineHybrid: 'Хибрид',
    engineElectric: 'Електрически',
    // Calculator block
    calculateCarYourself: 'Изчислете автомобила сами',
    withPriceGuarantee: 'с гарантирана цена',
    fromUsaKorea: 'От САЩ и Корея',
    searchByVin: 'Търсене по VIN или лот номер',
    calculate: 'Изчисли',
    allCatalogPlus: 'Целият каталог +',
    // Bracketed bilingual subtitles
    ourClientsReceive: 'Нашите клиенти получават',
    theBestService: 'най-добрата услуга',
    satisfiedClients: 'Доволни клиенти',
    areOurPriority: 'са наш приоритет',
    beforeAndAfter: 'Преди и след',
    ourClientsSay: 'Какво казват нашите клиенти',
    whatCustomersSay: 'Какво казват клиентите',
    whenTheyWorkWithUs: 'когато работят с нас',
    googleReviews: 'отзива в Google',
    websiteDesignBy: 'Дизайн на сайта - O.la',
    websiteMadeWith: 'Сайтът е създаден с Eva-X',
  },
};

const fmtLang = (val, lang = 'en') => {
  if (val == null) return '';
  if (typeof val === 'string') return val;
  return val[lang] || val.en || val.bg || '';
};

/**
 * translateEngine / translateDrive — light client-side normalizers that
 * translate the engine-fuel & drivetrain keywords used in mock vehicle
 * fixtures (e.g. "4.6L / Patrol", "All-wheel") to the active language.
 * EN is the canonical baseline; BG re-writes the recognisable tokens.
 * Anything we don't recognise is returned untouched (model-specific
 * markers like "V8 Bi-Turbo", "Triple-Motor EV" stay as-is).
 */
function translateEngine(value, t) {
  if (!value || !t) return value || '';
  // Replace whole words case-insensitively
  return value
    .replace(/\bPatrol\b/gi, t.enginePetrol)
    .replace(/\bPetrol\b/gi, t.enginePetrol)
    .replace(/\bGasoline\b/gi, t.enginePetrol)
    .replace(/\bDiesel\b/gi, t.engineDiesel)
    .replace(/\bHybrid\b/gi, t.engineHybrid)
    .replace(/\bElectric\b/gi, t.engineElectric);
}
function translateDrive(value, t) {
  if (!value || !t) return value || '';
  return value
    .replace(/\bAll-wheel\b/gi, t.driveAllWheel)
    .replace(/\bAll wheel\b/gi, t.driveAllWheel);
}

export default function MobileHomePage() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [siteInfo, setSiteInfo] = useState(null);
  const [openFaq, setOpenFaq] = useState(null);
  const [filterBrand, setFilterBrand] = useState('');
  const [filterModel, setFilterModel] = useState('');
  const [yearFrom, setYearFrom] = useState('');
  const [yearTo, setYearTo] = useState('');
  const [reviewIdx, setReviewIdx] = useState(0);
  const [beforeAfterIdx, setBeforeAfterIdx] = useState(0);
  const { lang, changeLang } = useLang();
  const { open: openGetInTouch } = useGetInTouch();
  const { open: openPolicy } = usePolicyModal();

  useEffect(() => {
    let cancelled = false;
    axios
      .get(`${API}/api/site-info`)
      .then((r) => {
        if (!cancelled) setSiteInfo(r.data || null);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  // Derived
  const phones = siteInfo?.header?.phones || siteInfo?.footer?.contacts?.phones || FALLBACK_PHONES;
  const langKey = (lang || 'en').toLowerCase().startsWith('bg') ? 'bg' : 'en';
  // Localized address fallback — if admin hasn't supplied a BG list, fall
  // back to the canonical BG translation so the menu drawer never shows
  // mixed-locale content.
  const _ctxContacts = siteInfo?.footer?.contacts || {};
  const _langAddrList = _ctxContacts[`addresses_${langKey}`];
  const _plainAddrList = _ctxContacts.addresses;
  const addresses = (Array.isArray(_langAddrList) && _langAddrList.length > 0)
    ? _langAddrList
    : (langKey === 'bg'
        ? [
            'България, София, Драгалевци, бул. Витоша № 230',
            'България, София, бул. България № 81',
          ]
        : (Array.isArray(_plainAddrList) && _plainAddrList.length > 0
            ? _plainAddrList
            : [
                'Bulgaria, Sofia, Dragalevtsi, Vitosha Blvd. No. 230',
                'Bulgaria, Sofia, Bulgaria Blvd., No. 81',
              ]));
  const socials = siteInfo?.footer?.socials || {};
  const t = I18N[langKey] || I18N.en;
  const fallbackHero = FALLBACK_HERO[langKey] || FALLBACK_HERO.en;
  const fallbackFaq = FALLBACK_FAQ[langKey] || FALLBACK_FAQ.en;
  const fallbackReviews = FALLBACK_REVIEWS[langKey] || FALLBACK_REVIEWS.en;
  const hero = siteInfo?.hero || {};
  const heroEyebrow = fmtLang(hero[`eyebrow_${langKey}`] || hero.eyebrow, langKey) || fallbackHero.eyebrow;
  const heroL1 = fmtLang(hero[`title_line1_${langKey}`] || hero.title_line1, langKey) || fallbackHero.title_line1;
  const heroL2 = fmtLang(hero[`title_line2_${langKey}`] || hero.title_line2, langKey) || fallbackHero.title_line2;
  const heroL3 = fmtLang(hero[`title_line3_${langKey}`] || hero.title_line3, langKey) || fallbackHero.title_line3;
  // Hero image priority on mobile:
  //   1) hero.image_url_mobile  (admin-uploaded mobile-format variant)
  //   2) hero.image_url         (only when admin opted into web/mobile sync)
  //   3) /mobile/image-103@2x.png  (Figma default)
  const heroImageUrl = (() => {
    const m = hero.image_url_mobile;
    if (m) return m;
    if (hero.sync_mobile_with_web && hero.image_url) return hero.image_url;
    return '/mobile/image-103@2x.png';
  })();
  const kpi1 = fmtLang(hero[`kpi1_${langKey}`] || hero.kpi1, langKey) || fallbackHero.kpi1;
  const kpi2 = fmtLang(hero[`kpi2_${langKey}`] || hero.kpi2, langKey) || fallbackHero.kpi2;
  const kpi3 = fmtLang(hero[`kpi3_${langKey}`] || hero.kpi3, langKey) || fallbackHero.kpi3;

  // FAQ
  const faqEnabled = siteInfo?.faq?.enabled !== false;
  const faqItems = (siteInfo?.faq?.items || []).filter((i) => i?.enabled !== false);
  const faqList = faqItems.length
    ? faqItems.map((it, i) => ({
        id: it.id || `faq-${i}`,
        question: fmtLang(it[`question_${langKey}`] || it.question, langKey),
        answer: fmtLang(it[`answer_${langKey}`] || it.answer, langKey),
      }))
    : fallbackFaq.map((f, i) => ({ id: `f-${i}`, question: f.question, answer: '' }));

  // Reviews
  const reviewsEnabled = siteInfo?.reviews?.enabled !== false;
  const reviewItems = (siteInfo?.reviews?.items || []).filter((r) => r?.enabled !== false);
  const reviews = reviewItems.length
    ? reviewItems.map((r) => ({
        // Prefer locale-specific name (e.g. cyrillic "Георги" on BG) so the
        // review card matches the surrounding language. Falls back to the
        // canonical EN-spelled `name` when no localised variant exists.
        name: (langKey === 'bg' ? (r.name_bg || r.name) : (r.name_en || r.name)) || '',
        rating: r.rating || 5,
        text: fmtLang(r[`text_${langKey}`] || r.text, langKey),
        image_url: r.image_url || '',
      }))
    : fallbackReviews;

  // Before & after
  const baEnabled = siteInfo?.before_after?.enabled !== false;
  const baItems = (siteInfo?.before_after?.items || []).filter((i) => i?.enabled !== false);

  const googleRating = siteInfo?.reviews?.google_rating ?? 4.9;
  const googleReviewsCount = siteInfo?.reviews?.google_reviews_count ?? 31;

  const viberCommunity = siteInfo?.footer?.viber_community || {};
  const viberLabel = fmtLang(viberCommunity[`label_${langKey}`] || viberCommunity.label, langKey) || t.joinOurGroupHottest;
  const viberUrl = viberCommunity.url || 'viber://chat?number=%2B359875313158';

  // Helpers
  const onFindCar = () => {
    const params = new URLSearchParams();
    if (filterBrand) params.set('make', filterBrand);
    if (filterModel) params.set('model', filterModel);
    if (yearFrom) params.set('year_min', yearFrom);
    if (yearTo) params.set('year_max', yearTo);
    window.location.href = `/catalog${params.toString() ? `?${params}` : ''}`;
  };

  return (
    <div
      className="bg-black text-white min-h-screen"
      style={{
        fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif",
        overflowX: 'hidden',
        width: '100%',
        maxWidth: '100vw',
      }}
    >
      <MobileHeader phones={phones} onMenuOpen={() => setMenuOpen(true)} />
      <MobileMenu
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        phones={phones}
        addresses={addresses}
        socials={socials}
        lang={lang}
        onLangChange={changeLang}
      />

      {/* ═════════ HERO ═════════ */}
      <section className="relative pt-6 overflow-hidden">
        {/* AMERICA | KOREA — 119×12 H Medium 12px, centered */}
        <div
          className="text-white text-center uppercase mx-auto"
          style={{
            fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif",
            fontWeight: 500,
            fontSize: 12,
            lineHeight: '12px',
            letterSpacing: '0.18em',
            width: 'fit-content',
            height: 12,
          }}
        >
          {heroEyebrow}
        </div>

        {/* Title block — three centered lines (40 / 32 / 40 px) */}
        <div className="mt-3 text-center">
          <AnimatedHeading
            as="div"
            text={heroL1}
            className="uppercase text-[#FEAE00]"
            style={{
              fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif",
              fontWeight: 700,
              fontSize: 40,
              lineHeight: '40px',
              letterSpacing: '0',
            }}
          />
          <AnimatedHeading
            as="div"
            text={heroL2}
            className="uppercase text-white"
            baseDelay={(heroL1 || '').replace(/\s/g, '').length * 28}
            style={{
              fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif",
              fontWeight: 700,
              fontSize: 32,
              lineHeight: '32px',
              marginTop: 4,
              letterSpacing: '0',
            }}
          />
          <AnimatedHeading
            as="div"
            text={heroL3}
            className="uppercase text-[#FEAE00]"
            baseDelay={(heroL1 + heroL2 || '').replace(/\s/g, '').length * 28}
            style={{
              fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif",
              fontWeight: 700,
              fontSize: 40,
              lineHeight: '40px',
              marginTop: 4,
              letterSpacing: '0',
            }}
          />
        </div>

        {/* KPIs — 3 chips per row, exact Figma sizes 93×13, H Semibold 11px,
            text is sentence-case (NOT uppercase), middle one is centered. */}
        <div
          className="mt-6 px-4"
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr 1fr',
            alignItems: 'center',
            justifyItems: 'center',
            gap: 8,
          }}
        >
          {[
            { val: kpi1, align: 'flex-start', roll: true },
            { val: kpi2, align: 'center' },
            { val: kpi3, align: 'flex-end' },
          ].map((k, i) => (
            <div
              key={i}
              className="text-white"
              style={{
                fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif",
                fontWeight: 600,
                // Adaptive font size — shrinks slightly on very narrow screens
                // and for long localized strings (BG/UK can be ~2x longer than EN).
                fontSize: 'clamp(9.5px, 2.6vw, 11px)',
                lineHeight: 1.25,
                letterSpacing: 0,
                textTransform: 'none',
                width: '100%',
                minWidth: 0,
                // Allow soft wrap inside each cell instead of overflowing — keeps
                // grid layout intact when localized text is longer than EN.
                whiteSpace: 'normal',
                overflowWrap: 'anywhere',
                wordBreak: 'normal',
                textAlign: i === 0 ? 'left' : i === 1 ? 'center' : 'right',
              }}
            >
              {k.roll ? renderKpiWithRolling(k.val) : k.val}
            </div>
          ))}
        </div>

        {/* Hero image — FULL WIDTH within the viewport (no horizontal padding). */}
        <div className="mt-7 w-full" style={{ lineHeight: 0, overflow: 'hidden' }}>
          <img
            src={heroImageUrl?.startsWith('/') ? heroImageUrl : optimizeImage(heroImageUrl, ImageSize.hero)}
            alt=""
            style={{
              width: '100%',
              maxWidth: '100%',
              aspectRatio: '361 / 326',
              objectFit: 'cover',
              display: 'block',
              border: 0,
              outline: 0,
              clipPath: 'inset(0 0 5px 0)',
              marginBottom: -5,
              backgroundColor: '#000',
            }}
            loading="eager"
            decoding="async"
            fetchPriority="high"
            onError={(e) => {
              e.currentTarget.src = '/mobile/image-103@2x.png';
            }}
          />
        </div>
      </section>

      {/* ═════════ CAR SEARCH / FILTER ═════════ */}
      {/* Per Figma: section box is 360 × 621 — title + 4 fields + button +
         vertical breathing room top/bottom so the card never overlaps the
         hero image above. Brand is a real dropdown (click → searchable list);
         Model is disabled until a brand is picked; Year From/To are
         year selects with sane ranges. */}
      <MobileCarSearch
        filterBrand={filterBrand}
        setFilterBrand={setFilterBrand}
        filterModel={filterModel}
        setFilterModel={setFilterModel}
        yearFrom={yearFrom}
        setYearFrom={setYearFrom}
        yearTo={yearTo}
        setYearTo={setYearTo}
        onFindCar={onFindCar}
        t={t}
      />

      {/* ═════════ SEARCH FOR CARS FROM AMERICA AND KOREA ═════════ */}
      <MobileSearchFromAmericaKorea t={t} />
      {/* ═════════ END ═════════ */}

      {/* ═════════ TOP VEHICLES DEALS — placeholder (next iteration) ═════════ */}
      {/* The duplicate "How to buy a turnkey car / USA / Korea" block was
         removed: its functionality is already covered by the
         <MobileSearchFromAmericaKorea /> block above. The next block to
         implement here is "Top vehicles deals of the week". */}

      {/* ═════════ TOP VEHICLES DEALS OF THE WEEK ═════════ */}
      <MobileTopVehicleDeals t={t} />

      {/* ═════════ CALCULATE A CAR YOURSELF ═════════ */}
      <MobileCalculateCar t={t} />

      {/* ═════════ HOW WE WORK ═════════ */}
      <MobileHowWeWork />

      {/* ═════════ HOW TO BUY A TURNKEY CAR — replaces Before & After ═════════ */}
      <MobileHowToBuyTurnkey />

      {/* ═════════ WE HAVE PERFECT SERVICE — replaces former Reviews block ═════════ */}
      <MobileWeHavePerfectService />

      {/* ═════════ TURNKEY SERVICES — 8 yellow cards ═════════
           Per Figma DevMode (Frame 1707479342, 331 × 1142):
             • 8 cards, all 331 wide
             • Card heights: 151, 136, 153, 134, 117, 117, 134, 151 (Σ=1093 + 7×7=49 ⇒ 1142)
             • Inter-card gap: 7 px
             • Card padding (inner): 24 top, 24 bottom, 10 left, 10 right
             • Side margin from screen edge: 16 / 16 (same as other sections)
             • Card text: /N + TITLE on top row, body text below
             • Number "/N" — H Medium 24
             • Title — H Medium 16, uppercase
             • Body — H Regular 14
             • Colours: black text on #FEAE00 (yellow) cards, black gaps between cards
       ═════════════════════════════════ */}
      <MobileTurnkeyServices />

      {/* ═════════ BEFORE AND AFTER — horizontal-scroll carousel ═════════
           Per Figma mobile mock:
             • Title          "BEFORE AND AFTER"       — H Bold 24, #FEAE00
             • Subtitle       "OUR CLIENTS RECEIVE"    — H Medium 16, #FEAE00 (line 1)
                              "THE BEST SERVICE"       — H Medium 16, #FFFFFF (line 2)
             • Card           328 × 317, side margins 16/16
             • /before        H Medium 12, white,    inset-left 62.5 inside card
             • /after         H Medium 12, #FEAE00,  inset-right 61.5 inside card
             • Photos         150 × 144 each, side-by-side
             • BMV / model    H Bold 16,    white
             • Info rows      H Regular 12, gray label · white value · price #FEAE00
             • Pagination     ← 01/10 →   block side insets 116 / 115
       ═════════════════════════════════════════════════════════════════ */}
      <MobileBeforeAndAfter
        items={siteInfo?.before_after?.items}
        activeIdx={beforeAfterIdx}
        setActiveIdx={setBeforeAfterIdx}
        t={t}
      />

      {/* ═════════ OUR CLIENTS SAY — reviews carousel ═════════
           Per Figma mobile mock (361 × 815):
             • Title  "OUR CLIENTS SAY"           — H Bold   24, #FEAE00, centered (76 px side insets, top 73)
             • Subtitle line 1 "SATISFIED CLIENTS"— H Medium 16, #FEAE00, centered
             • Subtitle line 2 "ARE OUR PRIORITY" — H Medium 16, #FFFFFF, centered
             • Google row (logo left @ 17, rating right @ 17):
                 — Google logo
                 — "4.9"                           H Bold   14, #FFFFFF
                 — 5 yellow stars                  block 80 × 16
                 — "31 Google reviews"             H Medium 12, #FFFFFF, underline
             • Heading "What customers say…"      — H Bold   24, #FFFFFF, left @ 17
             • Card (review)                       — 330 × 324, side insets 16
                 — Avatar                          40 × 40
                 — Name                            H Bold   24, #FEAE00
                 — Avatar ↔ name gap               27 px
                 — Body text                       H Regular 16, #FFFFFF
             • Pagination                          identical to Before/After block
       ═════════════════════════════════════════════════════════════════════ */}
      <MobileOurClientsSay
        reviews={reviews}
        googleRating={googleRating}
        googleReviewsCount={googleReviewsCount}
        activeIdx={reviewIdx}
        setActiveIdx={setReviewIdx}
        t={t}
      />

      {/* ═════════ WHY YOU PAY LESS — AND GET MORE ═════════
           Per Figma mobile mock (359 × 834):
             • Title  "WHY YOU PAY LESS"  — H Bold 24, #FEAE00, centered (top 47, side insets 65)
             •         "— AND GET MORE"   — H Bold 24, dash yellow + words white
             • Car illustration            — 328 × 328, side insets 16 / 16
             • 4 benefit blocks (298 × 433 total):
                 / LARGE SELECTION        — H Bold    16, #FEAE00, uppercase
                 More trim levels...      — H Regular 16, #FFFFFF
                 (gap title→body = 8 px;   gap between blocks = 49 px)
             • Distance title → first block = 251 px (car image fits inside)
       ═════════════════════════════════════════════════════════════════════ */}
      <MobileWhyPayLess />

      {/* ═════════ DREAM CAR CTA ═════════
           Full‑bleed card 360 × 583 (per Figma DevMode), composed of:
             • Image area (top 0 → 334) — full‑bleed photo
             • Logo  77 × 26.25 px  →  left 139, right 144, top 203
             • Title frame 231 × 48 →  left 68, right 61, top ≈ 263 (was bottom 23 of the 334-px image)
             • Title H Bold Mazzard 24 px
             • CTA text "Fill out the application…"  → top 398, left 16, right 21 — H Bold 16px
             • CTA button "Contact us"                → 294 × 45, top 477, centred (≈33 / 33), H Medium 14px
       ═════════════════════════════════ */}
      <section>
        <div
          data-testid="mobile-dream-car-cta"
          style={{
            position: 'relative',
            width: '100%',
            aspectRatio: '360 / 583',
            overflow: 'hidden',
            background: '#000',
          }}
        >
          {/* Background photo — sits in the top 334 px of the 583 px card */}
          <img
            src="/mobile/young-woman-with-salesman-carshowroom-1@2x.png"
            alt=""
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              // 334 / 583 of the card height → reproduces the original 360 × 334 photo
              height: 'calc(100% * (334 / 583))',
              objectFit: 'cover',
              display: 'block',
            }}
            loading="lazy"
            onError={(e) => { e.currentTarget.style.display = 'none'; }}
          />

          {/* BIBI logo — 77 × 26.25, top 203 of a 583‑px frame */}
          <img
            src="/mobile/BiBi-logo-02-1.svg"
            alt="BIBI"
            data-testid="mobile-dream-car-cta-logo"
            style={{
              position: 'absolute',
              top: 'calc(100% * (203 / 583))',
              left: 'calc(100% * (139 / 360))',
              width: 'calc(100% * (77 / 360))',
              height: 'auto',
              aspectRatio: '77 / 26.25',
              zIndex: 2,
            }}
          />

          {/* Headline "Want to drive / your dream car?" — frame 231 × 48,
              previously anchored to bottom 23 of the 334‑px image →
              top ≈ 263 of the 583‑px card. */}
          <h2
            data-testid="mobile-dream-car-cta-title"
            style={{
              position: 'absolute',
              top: 'calc(100% * (263 / 583))',
              left: 'calc(100% * (56 / 360))',          /* slightly wider gutter for BG */
              right: 'calc(100% * (49 / 360))',
              margin: 0,
              fontFamily: "'Mazzard', 'Mazzard H', system-ui, -apple-system, sans-serif",
              fontWeight: 700,
              fontSize: lang === 'bg' ? 19 : 24,         /* "колата на мечтите си?" is 20% wider than "your dream car?" — drop one size step in BG */
              lineHeight: lang === 'bg' ? '24px' : '24px',
              textTransform: 'uppercase',
              textAlign: 'center',
              letterSpacing: 0,
              zIndex: 2,
            }}
          >
            <AnimatedHeading
              as="span"
              text={t.wantToDrive}
              style={{ color: '#FEAE00', display: 'block', whiteSpace: 'nowrap' }}
            />
            <AnimatedHeading
              as="span"
              text={t.yourDreamCar}
              baseDelay={(t.wantToDrive || '').replace(/\s/g, '').length * 28}
              style={{ color: '#FFFFFF', display: 'block', whiteSpace: 'nowrap' }}
            />
          </h2>

          {/* "Fill out the application and we will find the best offer for you"
              — H Bold 16 px, white, centred. Top 398 / 583.
              Per Figma side padding is 16 / 21 — we equalise to 18 / 18 so the
              block sits perfectly centred (within the 16…21 tolerance). */}
          <p
            data-testid="mobile-dream-car-cta-subtitle"
            style={{
              position: 'absolute',
              top: 'calc(100% * (398 / 583))',
              left: 'calc(100% * (18 / 360))',
              right: 'calc(100% * (18 / 360))',
              margin: 0,
              fontFamily: "'Mazzard', 'Mazzard H', system-ui, -apple-system, sans-serif",
              fontWeight: 700,
              fontSize: 16,
              lineHeight: '20px',
              letterSpacing: 0,
              color: '#FFFFFF',
              textAlign: 'center',
              zIndex: 2,
            }}
          >
            {t.fillOutApplication}
          </p>

          {/* Contact us button — 294 × 45, top 477 / 583, horizontally centred
              (≈33 / 33 px → "выровнено по пикселям слева/справа для центровки").
              Opens the shared GetInTouchModal (same "Reach Out To Us" form
              available under the contacts-page map). */}
          <button
            type="button"
            onClick={() => {
              if (typeof openGetInTouch === 'function') openGetInTouch();
              else window.location.href = '/contacts#reach-out';
            }}
            data-testid="mobile-dream-car-cta-button"
            style={{
              position: 'absolute',
              top: 'calc(100% * (477 / 583))',
              left: '50%',
              transform: 'translateX(-50%)',
              width: 'calc(100% * (294 / 360))',
              maxWidth: 294,
              height: 45,
              background: '#FEAE00',
              color: '#000',
              border: 'none',
              borderRadius: 4,
              fontFamily: "'Mazzard', 'Mazzard H', system-ui, -apple-system, sans-serif",
              fontWeight: 500,
              fontSize: 14,
              lineHeight: '14px',
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
              textAlign: 'center',
              textDecoration: 'none',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 2,
              boxSizing: 'border-box',
              transition: 'filter 150ms ease',
              cursor: 'pointer',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.filter = 'brightness(1.1)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.filter = 'none'; }}
          >
            {t.contactUs}
          </button>
        </div>
      </section>

      {/* ═════════ FAQ ═════════
           Per Figma DevMode (Frame 1707479369):
             • Card 361 × 502, full‑width, black background
             • Title "FAQ" — H Bold Mazzard 24px, colour #FEAE00,
               horizontally centred (≈157 / 156 side padding), top 46
             • Gap title → first item: 54px
             • Items block 276 × 252 (5 items, hugging content)
             • Item text — H Medium Mazzard 14px, ALL WHITE (incl. "1/", "2/"…)
             • Vertical gap between items: 29px
             • Item starts at left 16, plus icon sits flush against right edge
             • Bottom space from item 5 baseline to card bottom (per Figma)
       ═════════════════════════════════ */}
      {faqEnabled ? (
        <section
          data-testid="mobile-faq"
          style={{
            position: 'relative',
            width: '100%',
            background: '#000',
            color: '#fff',
            overflow: 'visible',
          }}
        >
          {/* FAQ title — centred horizontally, top 46 */}
          <AnimatedHeading
            as="h2"
            data-testid="mobile-faq-title"
            text={t.faqTitle}
            style={{
              position: 'absolute',
              top: 46,
              left: 0,
              right: 0,
              margin: 0,
              textAlign: 'center',
              fontFamily: "'Mazzard', 'Mazzard H', system-ui, -apple-system, sans-serif",
              fontWeight: 700,
              fontSize: 24,
              lineHeight: '24px',
              letterSpacing: 0,
              color: '#FEAE00',
              textTransform: 'uppercase',
            }}
          />

          {/* Items list — top 46 + 24 + 54 = 124, side 16 / 16.
              Bottom padding 69: total gap to footer LOGO becomes
              69 + 53 (logo top inside footer) = 122 — per Figma DevMode. */}
          <div
            data-testid="mobile-faq-list"
            style={{
              position: 'relative',
              paddingTop: 124,
              paddingLeft: 12,                    /* user spec: 12 L/R on welcome mobile */
              paddingRight: 12,
              paddingBottom: 69,
              boxSizing: 'border-box',
            }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 29 }}>
              {faqList.map((it, i) => {
                const isOpen = openFaq === it.id;
                return (
                  <div key={it.id}>
                    <button
                      type="button"
                      onClick={() => setOpenFaq(isOpen ? null : it.id)}
                      data-testid={`mobile-faq-toggle-${i}`}
                      style={{
                        width: '100%',
                        background: 'transparent',
                        border: 'none',
                        padding: 0,
                        margin: 0,
                        textAlign: 'left',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'flex-start',
                        justifyContent: 'space-between',
                        gap: 12,
                      }}
                    >
                      <span
                        style={{
                          flex: '1 1 auto',
                          fontFamily: "'Mazzard', 'Mazzard H', system-ui, -apple-system, sans-serif",
                          fontWeight: 500,
                          fontSize: 14,
                          lineHeight: '17px',
                          letterSpacing: 0,
                          color: '#FFFFFF',
                        }}
                      >
                        {i + 1}/ {it.question}
                      </span>
                      <span
                        aria-hidden
                        style={{
                          flex: '0 0 auto',
                          width: 18,
                          height: 18,
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: '#FFFFFF',
                          transform: isOpen ? 'rotate(45deg)' : 'none',
                          transition: 'transform 200ms ease',
                          marginTop: 0,
                        }}
                      >
                        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                          <path d="M7 1v12M1 7h12" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                        </svg>
                      </span>
                    </button>
                    {isOpen && it.answer ? (
                      <div
                        style={{
                          marginTop: 10,
                          paddingRight: 30,
                          fontFamily: "'Mazzard', 'Mazzard H', system-ui, -apple-system, sans-serif",
                          fontWeight: 400,
                          fontSize: 13,
                          lineHeight: '20px',
                          color: 'rgba(255,255,255,0.8)',
                        }}
                        dangerouslySetInnerHTML={{ __html: it.answer }}
                      />
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      ) : null}

      {/* ═════════ FOOTER ═════════
           Per Figma DevMode: card 360 × 1207, black background.
           Uses the SAME SVG iconography (viber/instagram/facebook/telegram/copyright)
           and copy strings as the desktop Footer1 component
           (see /app/frontend/src/figma_home/components/footer1.jsx).
           Layout matches the mobile Figma frame exactly:
             • Yellow #FEAE00 for primary values & icons
             • White for section labels & nav links
             • Muted gray for legal/copyright lines
             • Outline yellow "Get in touch" button (transparent fill)
       ═════════════════════════════════ */}
      <footer
        data-testid="mobile-footer"
        style={{
          position: 'relative',
          width: '100%',
          height: 1219,
          background: '#000',
          color: '#FFFFFF',
          fontFamily: "'Mazzard', 'Mazzard H', system-ui, -apple-system, sans-serif",
          overflow: 'hidden',
        }}
      >
        {/* 1 — LOGO BIBI — 133 × 46, left 16, top 53 */}
        <img
          src="/figma/BiBi-logo-02-1.svg"
          alt="BIBI Cars"
          data-testid="footer-logo"
          style={{
            position: 'absolute',
            left: 16,
            top: 53,
            width: 133,
            height: 46,
            objectFit: 'contain',
          }}
        />

        {/* 2 — PHONE NUMBER block — centred horizontally
              Label 12 H-Medium white, value 18 H-Medium yellow,
              gap label → number = 16. TOP = 141 (per Figma DevMode:
              card_height 1159 − 1018 distance-to-bottom = 141). */}
        <div
          data-testid="footer-phone-block"
          style={{
            position: 'absolute',
            top: 141,
            left: 0,
            right: 0,
            textAlign: 'center',
          }}
        >
          <div
            style={{
              fontWeight: 500,
              fontSize: 12,
              lineHeight: '14px',
              color: '#FFFFFF',
              letterSpacing: 0,
            }}
          >
            {t.phoneNumber}
          </div>
          <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 4 }}>
            {phones.map((p, i) => (
              <a
                key={i}
                href={`tel:${p.replace(/\s+/g, '')}`}
                data-testid={`footer-phone-${i}`}
                style={{
                  fontWeight: 500,
                  fontSize: 18,
                  lineHeight: '22px',
                  color: '#FEAE00',
                  textDecoration: 'none',
                }}
              >
                {p}
              </a>
            ))}
          </div>
        </div>

        {/* 3 — GET IN TOUCH — outline yellow button, 328 × 45,
              top = phone block bottom (141+78=219) + 48 gap = 267.
              Opens the shared GetInTouchModal (same as desktop footer1). */}
        <button
          type="button"
          data-testid="footer-get-in-touch"
          onClick={() => openGetInTouch()}
          style={{
            position: 'absolute',
            top: 267,
            left: 16,
            right: 16,
            width: 'auto',
            height: 45,
            background: 'transparent',
            color: '#FEAE00',
            border: '1px solid #FEAE00',
            borderRadius: 4,
            padding: '10px 32px',
            boxSizing: 'border-box',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontFamily: "'Mazzard', 'Mazzard H', system-ui, -apple-system, sans-serif",
            fontWeight: 500,
            fontSize: 14,
            lineHeight: '17px',
            letterSpacing: '0.02em',
            cursor: 'pointer',
            transition: 'background 150ms ease, color 150ms ease',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = '#FEAE00'; e.currentTarget.style.color = '#000'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#FEAE00'; }}
        >
          {t.getInTouch}
        </button>

        {/* 4 — ADDRESS — left 16, label 12 H-Medium white, value 18 H-Medium yellow.
              Gap label → address = 16. Top 386.6 (back-derived from divider 567.6
              with WH→divider gap 35, address→WH gap 18, address height ≈ 110). */}
        <div
          data-testid="footer-address-block"
          style={{
            position: 'absolute',
            top: 386.6,
            left: 16,
            right: 16,
          }}
        >
          <div
            style={{
              fontWeight: 500,
              fontSize: 12,
              lineHeight: '14px',
              color: '#FFFFFF',
            }}
          >
            {t.address}
          </div>
          <div
            style={{
              marginTop: 16,
              fontWeight: 500,
              fontSize: 18,
              lineHeight: '24px',
              color: '#FEAE00',
            }}
          >
            {addresses.map((a, i) => (
              <div key={i} style={{ marginTop: i === 0 ? 0 : 8 }}>{a}</div>
            ))}
          </div>
        </div>

        {/* 5 — WORKING HOURS — single line with parentheses, gray #949494,
              H-Medium 14. Address→WH gap = 18 → WH top = 514.6.
              WH bottom = 532.6. */}
        <div
          data-testid="footer-working-hours"
          style={{
            position: 'absolute',
            top: 514.6,
            left: 16,
            right: 16,
            fontWeight: 500,
            fontSize: 14,
            lineHeight: '18px',
            color: '#949494',
          }}
        >
          ( {t.workingHours}: {(lang === 'bg'
              ? siteInfo?.footer?.contacts?.working_hours_bg
              : siteInfo?.footer?.contacts?.working_hours)
              || siteInfo?.footer?.contacts?.working_hours
              || t.workingHoursDefault} )
        </div>

        {/* 5b — REGISTRATION ADDRESS — gray #949494, H-Medium 14, 2 logical
              lines (label + value). Symmetric vertical gap (~10 px) to the
              working hours above and to the divider below. */}
        <div
          data-testid="footer-registration-address"
          style={{
            position: 'absolute',
            top: 542.6,
            left: 16,
            right: 16,
            fontWeight: 500,
            fontSize: 14,
            lineHeight: '18px',
            color: '#949494',
          }}
        >
          <div>{t.registrationAddress}</div>
          <div>
            {(lang === 'bg'
              ? siteInfo?.footer?.contacts?.registration_address_bg
              : siteInfo?.footer?.contacts?.registration_address)
              || siteInfo?.footer?.contacts?.registration_address
              || t.registrationAddressDefault}
          </div>
        </div>

        {/* 6 — DIVIDER — gray line. Shifted +60 from original 567.6 to make
              room for the registration-address block introduced above. */}
        <div
          aria-hidden
          style={{
            position: 'absolute',
            left: 16,
            right: 16,
            top: 627.6,
            height: 1,
            background: '#3a3a38',
          }}
        />

        {/* 7a — JOIN OUR GROUP — left 16, top 592.6 (sits below divider).
              Text 12 H-Medium white, gap 14 to Viber icon 42×42. */}
        <div
          data-testid="footer-join-our-group"
          style={{
            position: 'absolute',
            top: 652.6,
            left: 16,
            maxWidth: 196,
            display: 'flex',
            flexDirection: 'column',
            gap: 14,
            alignItems: 'flex-start',
          }}
        >
          <span
            style={{
              fontWeight: 500,
              fontSize: 12,
              lineHeight: '15px',
              color: '#FFFFFF',
              letterSpacing: 0,
            }}
          >
            {viberLabel}
          </span>
          <a
            href={viberCommunity?.url || 'viber://chat?number=%2B359875313158'}
            target="_blank"
            rel="noreferrer noopener"
            aria-label="Viber community"
            data-testid="footer-viber-link"
            style={{ display: 'inline-flex' }}
          >
            <img
              src="/figma/basil-viber-outline.svg"
              alt=""
              width={42}
              height={42}
              style={{ display: 'block' }}
            />
          </a>
        </div>

        {/* 7b — SOCIAL MEDIA — same level (top 592.6), right 16.
              Label 12 H-Medium white, aligned LEFT (visually under Instagram).
              Gap 32 to icon row. Icons 32×32, gap 22 between. */}
        <div
          data-testid="footer-social-media"
          style={{
            position: 'absolute',
            top: 652.6,
            right: 16,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-start',
          }}
        >
          <span
            style={{
              fontWeight: 500,
              fontSize: 12,
              lineHeight: '14px',
              color: '#FFFFFF',
              letterSpacing: 0,
            }}
          >
            {t.socialMedia}
          </span>
          <div style={{ marginTop: 32, display: 'flex', alignItems: 'center', gap: 22 }}>
            <a
              href={socials?.instagram?.url || '#'}
              target="_blank"
              rel="noreferrer noopener"
              aria-label="Instagram"
              data-testid="footer-social-instagram"
              style={{ display: 'inline-flex' }}
            >
              <img src="/figma/ri-instagram-line.svg" alt="" width={32} height={32} style={{ display: 'block' }} />
            </a>
            <a
              href={socials?.facebook?.url || '#'}
              target="_blank"
              rel="noreferrer noopener"
              aria-label="Facebook"
              data-testid="footer-social-facebook"
              style={{ display: 'inline-flex' }}
            >
              <img src="/figma/ic-twotone-facebook.svg" alt="" width={32} height={32} style={{ display: 'block' }} />
            </a>
            <a
              href={socials?.telegram?.url || '#'}
              target="_blank"
              rel="noreferrer noopener"
              aria-label="Telegram"
              data-testid="footer-social-telegram"
              style={{ display: 'inline-flex' }}
            >
              <img src="/figma/ic-round-telegram.svg" alt="" width={32} height={32} style={{ display: 'block' }} />
            </a>
          </div>
        </div>

        {/* 8 — NAV (Catalog / Calculator / About Us / Blog) — top 732.6,
              left/right 41, items H-Regular 16, white, gap 24, centred. */}
        <nav
          data-testid="footer-nav"
          style={{
            position: 'absolute',
            top: 792.6,
            left: 41,
            right: 41,
            display: 'flex',
            flexDirection: 'column',
            gap: 24,
            alignItems: 'center',
          }}
        >
          {[
            { label: t.navCatalog,    href: '/catalog' },
            { label: t.navCalculator, href: '/calculator' },
            { label: t.navAboutUs,    href: '/about' },
            { label: t.navBlog,       href: '/blog' },
          ].map((it) => (
            <a
              key={it.label}
              href={it.href}
              data-testid={`footer-nav-${it.label.toLowerCase().replace(' ', '-')}`}
              style={{
                fontWeight: 400,
                fontSize: 16,
                lineHeight: '20px',
                letterSpacing: '0.04em',
                color: '#FFFFFF',
                textDecoration: 'none',
                transition: 'color 150ms ease',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.color = '#FEAE00'; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = '#FFFFFF'; }}
            >
              {it.label}
            </a>
          ))}
        </nav>

        {/* 9 — LEGAL ROW (Conditions / Privacy Policy / Cookies) — top 946.48,
              left/right 16, 12 H-Medium white, justify between.
              Opens the shared PolicyModal (same as desktop footer1). */}
        <div
          data-testid="footer-legal-row"
          style={{
            position: 'absolute',
            top: 1006.48,
            left: 16,
            right: 16,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          {[
            { label: t.legalConditions, key: 'conditions' },
            { label: t.legalPrivacy,    key: 'privacy' },
            { label: t.legalCookies,    key: 'cookies' },
          ].map((it) => (
            <button
              key={it.key}
              type="button"
              data-testid={`footer-policy-${it.key}`}
              onClick={() => openPolicy(it.key)}
              style={{
                background: 'transparent',
                border: 'none',
                padding: 0,
                margin: 0,
                cursor: 'pointer',
                fontFamily: "'Mazzard', 'Mazzard H', system-ui, -apple-system, sans-serif",
                fontWeight: 500,
                fontSize: lang === 'bg' ? 11 : 12,        /* BG "ПОЛИТИКА ЗА ПОВЕРИТЕЛНОСТ" is ~25% wider — drop one step so 3 pills fit the 328 px row */
                lineHeight: '14px',
                letterSpacing: lang === 'bg' ? '0.02em' : '0.04em',
                color: '#FFFFFF',
                textDecoration: 'none',
                whiteSpace: 'nowrap',
                transition: 'color 150ms ease',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.color = '#FEAE00'; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = '#FFFFFF'; }}
            >
              {it.label}
            </button>
          ))}
        </div>

        {/* 10 — VAT / ID / COMPANY — top 981.601, left/right 16,
              10 H-Medium muted gray #5E5E5E, 3 columns justify-between. */}
        <div
          data-testid="footer-vat-id"
          style={{
            position: 'absolute',
            top: 1041.601,
            left: 16,
            right: 16,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            fontWeight: 500,
            fontSize: 10,
            lineHeight: '14px',
            letterSpacing: '0.04em',
            color: '#5E5E5E',
          }}
        >
          <span>VAT BG206637283</span>
          <span>ID 206637283</span>
          <span>PM AUTO GROUP LTD</span>
        </div>

        {/* 11 — WEBSITE CREDITS — top 1076.06.
              Two centred links: "/ Website design - O.la /" + "/ Website made with Eva-X /"
              both H-Medium 12, white, with hover to yellow.
              Same destinations as desktop footer1. */}
        <div
          data-testid="footer-website-credits"
          style={{
            position: 'absolute',
            top: 1136.06,
            left: 16,
            right: 16,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 4,
          }}
        >
          <a
            href="https://www.olhalazarieva.com"
            target="_blank"
            rel="noreferrer noopener"
            data-testid="footer-credit-design"
            style={{
              fontWeight: 500,
              fontSize: 12,
              lineHeight: '14px',
              letterSpacing: '0.04em',
              color: '#FFFFFF',
              textDecoration: 'none',
              whiteSpace: 'nowrap',
              transition: 'color 150ms ease',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = '#FEAE00'; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = '#FFFFFF'; }}
          >
            / {t.websiteDesignBy} /
          </a>
        </div>

        {/* 12 — © ALL RIGHT RESERVED — bottom 19, left/right 72.
              Copyright SVG 18×18 + gap 7 + H-Medium 10 WHITE text. */}
        <div
          data-testid="footer-copyright"
          style={{
            position: 'absolute',
            bottom: 19,
            left: 72,
            right: 72,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 7,
            color: '#FFFFFF',
          }}
        >
          <img
            src="/figma/ant-design-copyright-circle-outlined.svg"
            alt=""
            width={18}
            height={18}
            style={{ display: 'block' }}
            aria-hidden="true"
          />
          <span
            style={{
              fontWeight: 500,
              fontSize: 10,
              lineHeight: '14px',
              letterSpacing: '0.04em',
              color: '#FFFFFF',
              whiteSpace: 'nowrap',
            }}
          >
            {new Date().getFullYear()}. {t.allRightReserved}
          </span>
        </div>
      </footer>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────── */
/* Reusable mobile field component                                         */
/* Typography (per Figma):                                                  */
/*   • label       → Helvetica Medium 14px                                  */
/*   • input value → Helvetica Regular 14px                                 */
/*   • chevron 12×12 right-aligned (dropdown-style affordance)              */
/* ─────────────────────────────────────────────────────────────────────── */

function Field({ label, value, onChange, placeholder, type = 'text', inputMode, maxLength }) {
  const FONT = "'Helvetica Neue', Helvetica, Arial, sans-serif";
  return (
    <label className="block">
      <span
        className="block"
        style={{
          fontFamily: FONT,
          fontSize: 14,
          fontWeight: 500,
          lineHeight: '18px',
          color: '#fff',
          marginBottom: 6,
        }}
      >
        {label}
      </span>
      <div className="relative">
        <input
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          type={type}
          inputMode={inputMode}
          maxLength={maxLength}
          className="w-full bg-transparent border border-[#555452] rounded text-white focus:outline-none focus:border-[#FEAE00]"
          style={{
            height: 45,
            paddingLeft: 16,
            paddingRight: 36,
            fontFamily: FONT,
            fontSize: 14,
            fontWeight: 400, // H Regular for the value/placeholder
            letterSpacing: 0,
          }}
        />
        <span
          aria-hidden
          className="absolute pointer-events-none text-white/80"
          style={{ right: 14, top: '50%', transform: 'translateY(-50%)' }}
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path
              d="M2 4l4 4 4-4"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
      </div>
    </label>
  );
}

/* ─────────────────────────────────────────────────────────────────────── */
/* MobileSearchFromAmericaKorea                                            */
/* 1‑to‑1 port of the Figma mobile mock for the "Search for cars from      */
/* America and Korea / Most popular brands" block.                         */
/*                                                                         */
/* Layout:                                                                  */
/*   • Outer section uses GRAY (#1d1d1b) background — same as desktop      */
/*     catalog-header — so the inner BLACK card visibly separates.         */
/*   • No horizontal padding on the section: the heading is full-width,    */
/*     center-aligned, and spans across the screen (not a narrow column).  */
/*                                                                         */
/* Typography (Mazzard H — exact weights requested):                       */
/*   • "Search for cars / from America and Korea" → H Bold 24px, #FEAE00   */
/*   • "Most Popular Brands"                       → H Regular 14px, #fff  */
/*   • "Other Brands +"                            → H Medium 14px, #FEAE00*/
/*                                                                         */
/* Brand grid:                                                              */
/*   • 3 columns × N rows, 1px #1c1c1c dividers between every cell         */
/*     (top + left on the wrapper, bottom + right on each cell — same      */
/*     trick as desktop so internal lines never duplicate).                */
/*   • Featured 6 use the original Figma pngwing assets in /mobile/.       */
/*   • Additional brands (expanded) use /figma/brands/<slug>.webp.         */
/*                                                                         */
/* "Other brands +" toggle:                                                 */
/*   • Click reveals 6 more brands per click (same logic as desktop        */
/*     BrandLogos1).                                                       */
/*   • When the full list is visible the label switches to "Hide brands −".*/
/* ─────────────────────────────────────────────────────────────────────── */

const MOBILE_FEATURED_BRANDS = [
  { slug: 'audi',    name: 'Audi',    src: '/mobile/pngwing-com-4-1@2x.png' },
  { slug: 'bmw',     name: 'BMW',     src: '/mobile/pngwing-com-3-1@2x.png' },
  { slug: 'jeep',    name: 'Jeep',    src: '/mobile/pngwing-com-5-1@2x.png' },
  { slug: 'toyota',  name: 'Toyota',  src: '/mobile/pngwing-com-1-1@2x.png' },
  { slug: 'ford',    name: 'Ford',    src: '/mobile/pngwing-com-6-2@2x.png' },
  { slug: 'hyundai', name: 'Hyundai', src: '/mobile/pngwing-com-1@2x.png' },
];

const MOBILE_EXTRA_BRANDS = [
  'acura','alfa-romeo','aston-martin','bentley','buick','cadillac',
  'chevrolet','chrysler','dodge','ferrari','fiat','genesis','gmc',
  'honda','hummer','infiniti','international','isuzu','jaguar','kia',
  'lamborghini','land-rover','lexus','lincoln','lotus','maserati',
  'mazda','mercedes','mg','mini','mitsubishi','nissan','polestar',
  'pontiac','porsche','ram','rolls-royce','saab','smart','subaru',
  'suzuki','tesla','volkswagen','volvo','yamaha',
].map((slug) => ({
  slug,
  name: slug
    .split('-')
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(' '),
  src: `/figma/brands/${slug}.webp`,
}));

const MOBILE_ALL_BRANDS = [...MOBILE_FEATURED_BRANDS, ...MOBILE_EXTRA_BRANDS];
const MOBILE_PAGE = 6;

function MobileSearchFromAmericaKorea({ t }) {
  const FONT = "'Mazzard', 'Mazzard H', system-ui, -apple-system, sans-serif";

  // June 2026 — only show the 6 popular brands; "Other brands +" links
  // straight to the full catalog (the in-place expand behaviour was removed).
  const BRANDS_TO_SHOW = MOBILE_FEATURED_BRANDS;

  return (
    <section
      data-testid="mobile-search-from-america-korea"
      style={{
        backgroundColor: '#1d1d1b',
        padding: '40px 12px 48px',             /* user spec: 12 L/R on welcome mobile */
        boxSizing: 'border-box',
        width: '100%',
      }}
    >
      {/* Title — full‑width, centered, both lines amber */}
      <AnimatedHeading
        as="h2"
        text={t?.searchForCarsFromAmericaKorea || 'Search for cars from America and Korea'}
        style={{
          margin: '0 0 28px 0',
          textAlign: 'center',
          fontFamily: FONT,
          fontWeight: 700,
          fontSize: 24,
          lineHeight: '120%',
          letterSpacing: 0,
          textTransform: 'uppercase',
          color: '#FEAE00',
          width: '100%',
        }}
      />

      {/* Black card */}
      <div
        style={{
          backgroundColor: '#000',
          border: '1px solid #1c1c1c',
          borderRadius: 6,
          padding: '26px 16px 24px',
        }}
      >
        {/* Subtitle — H Regular 14 */}
        <div
          style={{
            textAlign: 'center',
            fontFamily: FONT,
            fontWeight: 400,
            fontSize: 14,
            lineHeight: '99.9%',
            color: '#FFFFFF',
            textTransform: 'uppercase',
            marginBottom: 22,
          }}
        >
          {t?.mostPopularBrands || 'Most popular brands'}
        </div>

        {/* Brand grid (3 cols, dividers via outer top+left and per-cell bottom+right) */}
        <div
          className="grid grid-cols-3"
          style={{
            borderTop: '1px solid #1c1c1c',
            borderLeft: '1px solid #1c1c1c',
          }}
        >
          {BRANDS_TO_SHOW.map((b) => (
            <a
              key={b.slug}
              // Pre-filter the catalogue by this brand on tap (parity with
              // desktop BrandLogos1). CatalogPage's `initialFilters` reads
              // ?make= on first mount and seeds filters.brand → user lands
              // on, e.g., all BMW cars immediately.
              href={`/catalog?make=${encodeURIComponent(b.name)}`}
              data-testid={`mobile-brand-${b.slug}`}
              className="flex items-center justify-center"
              aria-label={b.name}
              style={{
                height: 78,
                borderRight: '1px solid #1c1c1c',
                borderBottom: '1px solid #1c1c1c',
                padding: 10,
                boxSizing: 'border-box',
              }}
            >
              <img
                src={b.src}
                alt={b.name}
                style={{
                  maxHeight: 44,
                  maxWidth: '100%',
                  width: 'auto',
                  height: 'auto',
                  objectFit: 'contain',
                }}
                loading="lazy"
                onError={(e) => {
                  e.currentTarget.style.display = 'none';
                  if (e.currentTarget.nextSibling) {
                    e.currentTarget.nextSibling.style.display = 'inline';
                  }
                }}
              />
              <span
                style={{
                  display: 'none',
                  fontFamily: FONT,
                  fontSize: 12,
                  color: '#fff',
                  textTransform: 'uppercase',
                }}
              >
                {b.name}
              </span>
            </a>
          ))}
        </div>
      </div>

      {/* Other brands + → links to the full catalog (single-action, no toggle). */}
      <div style={{ marginTop: 22, display: 'flex', justifyContent: 'center' }}>
        <a
          href="/catalog"
          data-testid="mobile-other-brands"
          style={{
            background: 'transparent',
            border: 'none',
            padding: '4px 8px',
            cursor: 'pointer',
            fontFamily: FONT,
            fontWeight: 500,
            fontSize: 14,
            lineHeight: '99.9%',
            color: '#FEAE00',
            textTransform: 'uppercase',
            textDecoration: 'underline',
            textUnderlineOffset: 3,
          }}
        >
          {t?.otherBrandsPlus || 'Other brands +'}
        </a>
      </div>
    </section>
  );
}

/* ─────────────────────────────────────────────────────────────────────── */
/* MobileTopVehicleDeals                                                   */
/* 1‑to‑1 port of the Figma mobile mock — "Top vehicles deals of the week" */
/*                                                                         */
/* Section structure (top→bottom):                                          */
/*   1. Title (2 lines)         — "TOP VEHICLES DEALS" / "OF THE WEEK"     */
/*                                Mazzard H Bold 24, orange + white        */
/*   2. Subtitle (3 lines)      — Mazzard H Medium 16, 258×57              */
/*   3. Vehicle-type filter     — 4 icons (car/moto/truck/van), 294×24,    */
/*                                horizontal hairline above & below         */
/*   4. Price-range tabs        — 10-15K · 15-25K · 30-50K · PROPOSALS-46  */
/*                                Mazzard H Regular 12                     */
/*   5. Vehicle card            — image 336.5×… with "Trading date" strip, */
/*                                yellow timer chip, compare/favorite      */
/*                                round buttons, model title, purchase     */
/*                                price box, mileage/engine/drive grid,    */
/*                                estimated final cost, MORE DETAILS CTA   */
/*   6. Pager                   — ‹ 01/47 ›  (130×24)                      */
/*   7. MORE VEHICLES +         — Mazzard H Medium 14, 127×17, underlined  */
/* ─────────────────────────────────────────────────────────────────────── */

// Hardcoded TOP_DEALS_CARS removed — the mobile welcome carousel now reads
// live data from `/api/public/vehicles` exactly like the desktop version
// (see figma_home/components/frame-component21.jsx).  When the request is
// in-flight the carousel collapses to a single shimmer card instead of
// rendering the placeholder Lucid / BMW / AMG mock.

/**
 * VEHICLE_TYPES — 5 types reused from /pages/public/CalculatorPage.js
 * so Welcome → Calculator → Catalog all use the SAME taxonomy of
 * motorbike / sedan / SUV / pick-up / van.  The PNG assets live under
 * /figma/calc/ and are rendered via CSS mask so the silhouette can be
 * recoloured (white on dark bg, black on the amber active bg — matching
 * the Calculator's vehCardActive style).
 */
const VEHICLE_TYPES = [
  { id: 'motorbike', kind: 'mask', src: '/figma/calc/veh-motorbike.png', label: 'Motorbike', apiType: 'motorbike' },
  { id: 'sedan',     kind: 'mask', src: '/figma/calc/veh-sedan.png',     label: 'Sedan',     apiType: 'sedan' },
  { id: 'suv',       kind: 'mask', src: '/figma/calc/veh-suv.png',       label: 'SUV',       apiType: 'suv' },
  { id: 'pickup',    kind: 'mask', src: '/figma/calc/veh-pickup.png',    label: 'Pick-up',   apiType: 'pickup' },
  { id: 'van',       kind: 'mask', src: '/figma/calc/veh-van.png',       label: 'Van',       apiType: 'van' },
];

const PRICE_TABS = [
  { id: 'all',    label: 'ALL',    min: null,  max: null  },
  { id: '10-15k', label: '10-15K', min: 10000, max: 15000 },
  { id: '15-25k', label: '15-25K', min: 15000, max: 25000 },
  { id: '30-50k', label: '30-50K', min: 30000, max: 50000 },
];

const DEALS_PAGE_SIZE = 24;
const DEALS_PREFETCH_GAP = 6;

function MobileTopVehicleDeals({ t }) {
  const FONT = "'Mazzard', 'Mazzard H', system-ui, -apple-system, sans-serif";
  /* Default selection matches calculator's first non-trivial vehicle (sedan)
   * so the icons read coherently across Welcome → Calculator. */
  const [vehicleType, setVehicleType] = useState('sedan');
  // Default tab: 'all' → no price filter → counter shows full catalogue.
  const [priceTab, setPriceTab] = useState('all');
  const [idx, setIdx] = useState(0);
  const [favorited, setFavorited] = useState({});
  const [compared, setCompared] = useState({});

  /* Live carousel data — server-driven pagination keyed off the active
   * filters. Re-fetches from scratch whenever vehicleType or priceTab
   * change. The pager counter `01/<total>` always mirrors the SERVER's
   * filtered total (not just what's been streamed into memory). */
  const [liveCars, setLiveCars] = useState([]);
  const [liveTotal, setLiveTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  // Token used to cancel-out stale responses when the user rapidly
  // toggles filters (prevents an older fetch from overwriting newer data).
  const fetchTokenRef = useRef(0);

  // Resolve current price-tab definition once.
  const activeTab = useMemo(
    () => PRICE_TABS.find((p) => p.id === priceTab) || PRICE_TABS[0],
    [priceTab],
  );
  const activeVehicleType = useMemo(
    () => VEHICLE_TYPES.find((v) => v.id === vehicleType) || VEHICLE_TYPES[0],
    [vehicleType],
  );

  // Normalise a single API vehicle → carousel card shape used by JSX below.
  const normalize = (v) => {
    const imgArr = Array.isArray(v.images) ? v.images.filter(Boolean) : [];
    const km = Number.isFinite(v.odometer)
      ? `${Number(v.odometer).toLocaleString()} ${(v.odometer_unit || 'km').toUpperCase()}`
      : '—';
    const bidCur = (v.current_bid_currency || 'USD').toUpperCase();
    const bidSym = bidCur === 'USD' ? '$' : bidCur === 'EUR' ? '€' : '';
    const purchase = Number.isFinite(Number(v.current_bid))
      ? `${bidSym}${Number(v.current_bid).toLocaleString('en-US')}${bidSym ? '' : ' ' + bidCur}`
      : (v.price ? String(v.price) : '—');
    return {
      id: v.vin || v.lot_number,
      vin: v.vin,
      name: v.title || `${v.year || ''} ${v.make || ''} ${v.model || ''}`.trim(),
      img: imgArr[0] || '/mobile/image-15@2x.png',
      tradingDate: v.lot_number ? `Lot ${v.lot_number}` : (v.auction_name || ''),
      timer: v.sale_date || null,
      purchasePrice: purchase,
      mileage: km,
      engine: v.engine || '—',
      drive: (v.drivetrain || '—').toString(),
      finalCost: null,
    };
  };

  // Build query params from current filter state. skip→page offset.
  const buildParams = (skip = 0) => {
    const params = { limit: DEALS_PAGE_SIZE, skip };
    if (activeVehicleType?.apiType) params.vehicle_type = activeVehicleType.apiType;
    if (activeTab.min != null) params.price_min = activeTab.min;
    if (activeTab.max != null) params.price_max = activeTab.max;
    return params;
  };

  // Initial load + reload whenever filters change.
  useEffect(() => {
    const token = ++fetchTokenRef.current;
    let cancelled = false;
    setLoading(true);
    setLiveCars([]);
    setLiveTotal(0);
    setHasMore(true);
    setIdx(0);
    (async () => {
      try {
        const r = await axios.get(`${API}/api/public/vehicles`, {
          params: buildParams(0),
          timeout: 18000,
        });
        if (cancelled || fetchTokenRef.current !== token) return;
        const arr = Array.isArray(r.data?.data) ? r.data.data : [];
        const total = Number.isFinite(r.data?.total) ? Number(r.data.total) : arr.length;
        setLiveCars(arr.map(normalize));
        setLiveTotal(total);
        setHasMore(arr.length < total);
      } catch (_) {
        if (cancelled || fetchTokenRef.current !== token) return;
        setLiveCars([]);
        setLiveTotal(0);
        setHasMore(false);
      } finally {
        if (!cancelled && fetchTokenRef.current === token) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vehicleType, priceTab]);

  // Lazy paging — when the user gets close to the end of what's loaded,
  // fetch the next batch in the background. Counter still reflects the
  // SERVER total, so users see the real "out of N" number from the start.
  const prefetchNextPage = async () => {
    if (loading || !hasMore) return;
    const token = fetchTokenRef.current;
    const skip = liveCars.length;
    setLoading(true);
    try {
      const r = await axios.get(`${API}/api/public/vehicles`, {
        params: buildParams(skip),
        timeout: 18000,
      });
      if (fetchTokenRef.current !== token) return;
      const arr = Array.isArray(r.data?.data) ? r.data.data : [];
      const total = Number.isFinite(r.data?.total) ? Number(r.data.total) : liveTotal;
      setLiveCars((prev) => {
        const seen = new Set(prev.map((p) => p.id));
        return [...prev, ...arr.map(normalize).filter((c) => !seen.has(c.id))];
      });
      setLiveTotal(total);
      setHasMore(skip + arr.length < total);
    } catch (_) {
      // Keep what we have; user can keep browsing what's loaded.
    } finally {
      if (fetchTokenRef.current === token) setLoading(false);
    }
  };

  /* Share modal state — Welcome top-deal cards now have a share icon
   * (parity with SingleCarPage + Catalog cards per user spec). */
  const [shareOpen, setShareOpen] = useState(false);

  // Pager / counter / index — backed by the loaded cards. `total` is the
  // SERVER total (filtered) so the user immediately sees the real count.
  const visible = liveCars;
  const loadedCount = visible.length;
  const total = liveTotal;
  const safeIdx = loadedCount ? Math.min(idx, loadedCount - 1) : 0;
  const current = visible[safeIdx];
  const proposals = total;
  const counter = total > 0
    ? `${String(safeIdx + 1).padStart(2, '0')}/${total}`
    : '00/00';

  // Trigger lazy paging when approaching the loaded-tail edge.
  useEffect(() => {
    if (idx >= loadedCount - DEALS_PREFETCH_GAP && hasMore && !loading) {
      prefetchNextPage();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx, loadedCount, hasMore, loading]);

  const goPrev = () => setIdx((v) => Math.max(0, v - 1));
  const goNext = () => setIdx((v) => {
    if (!loadedCount) return 0;
    if (v + 1 < loadedCount) return v + 1;
    if (!hasMore) return loadedCount - 1; // hold at last
    return v; // wait for prefetch
  });

  // Apply BIBI tilt-parallax to the single visible deal card. Lives on the
  // carousel scope so it gets re-attached when the user swipes to a new
  // card (the article key changes with `current.id`).
  const carouselScopeRef = useRef(null);
  useTiltParallax(carouselScopeRef, {
    cardsSelector: ":scope > article[data-tilt-card]",
  });

  // Touch-swipe handlers (real horizontal pagination)
  const touchRef = useRef({ x: 0, y: 0, active: false });
  const onTouchStart = (e) => {
    const t = e.touches[0];
    touchRef.current = { x: t.clientX, y: t.clientY, active: true };
  };
  const onTouchEnd = (e) => {
    if (!touchRef.current.active) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - touchRef.current.x;
    const dy = t.clientY - touchRef.current.y;
    touchRef.current.active = false;
    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) {
      if (dx < 0) goNext(); else goPrev();
    }
  };

  if (!loadedCount && !loading) return null;

  return (
    <section
      data-testid="mobile-top-vehicles-deals"
      style={{
        backgroundColor: '#000',
        /* user spec: bottom +10 px → 48 → 58 */
        padding: '40px 12px 58px',
        fontFamily: FONT,
        color: '#fff',
      }}
    >
      {/* 1 — Title */}
      <div style={{ textAlign: 'center', marginBottom: 24 }}>
        <h2
          style={{
            margin: 0,
            fontFamily: FONT,
            fontWeight: 700,
            fontSize: 24,
            lineHeight: '120%',
            letterSpacing: 0,
            textTransform: 'uppercase',
          }}
        >
          <AnimatedHeading
            as="span"
            text={t?.topVehiclesDeals || 'Top vehicles deals'}
            style={{ color: '#FEAE00', display: 'block' }}
          />
          <AnimatedHeading
            as="span"
            text={t?.ofTheWeek || 'of the week'}
            baseDelay={(t?.topVehiclesDeals || 'Top vehicles deals').replace(/\s/g, '').length * 28}
            style={{ color: '#FFFFFF', display: 'block', marginTop: 4 }}
          />
        </h2>
      </div>

      {/* 2 — Subtitle (Mazzard H Medium 16, 258×57) */}
      <div
        style={{
          textAlign: 'center',
          /* user spec: +10 px breathing room between subtitle and sort row */
          margin: '0 auto 38px',
          width: 258,
          maxWidth: '100%',
          fontFamily: FONT,
          fontWeight: 500,
          fontSize: 16,
          lineHeight: '20px',
          textTransform: 'uppercase',
          letterSpacing: 0,
        }}
      >
        <span style={{ color: '#FEAE00' }}>{t?.thousandsOfListings || 'Thousands of listings.'}</span>
        <br />
        <span style={{ color: '#FFFFFF' }}>{t?.onlyBestMakeCut || 'Only the best make the cut.'}</span>
        <br />
        <span style={{ color: '#FFFFFF' }}>{t?.updatedWeekly || 'Updated weekly'}</span>
      </div>

      {/* 3 — Vehicle-type filter row (294×24) — same icons as web (lucide-react) */}
      <div
        style={{
          borderTop: '1px solid #2a2a28',
          borderBottom: '1px solid #2a2a28',
          /* user spec: +10 px breathing room between icons and the grey
             divider below (top 14, bottom 14+10=24) */
          padding: '14px 0 24px',
          marginBottom: 18,
        }}
      >
        <div
          role="tablist"
          aria-label={t?.vehicleType || "Vehicle type"}
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            maxWidth: 336,                       /* 5 buttons × 44 + 4 gaps × 12 = 268 (fits within 336) */
            margin: '0 auto',
            height: 36,
          }}
        >
          {VEHICLE_TYPES.map((v) => {
            const active = vehicleType === v.id;
            /* Active style — amber bg + black icon (calculator parity).
             * Inactive — transparent bg + white icon. */
            const fg = active ? '#000000' : '#FFFFFF';
            const bg = active ? '#FEAE00' : 'transparent';
            return (
              <button
                key={v.id}
                type="button"
                role="tab"
                aria-selected={active}
                aria-label={v.label}
                onClick={() => setVehicleType(v.id)}
                data-testid={`mobile-deals-type-${v.id}`}
                style={{
                  background: bg,
                  border: 'none',
                  padding: 0,
                  cursor: 'pointer',
                  width: 44,                              /* a bit wider so the rounded pill is comfortable */
                  height: 36,
                  borderRadius: 6,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: fg,
                  transition: 'background-color 150ms ease, color 150ms ease',
                }}
              >
                {v.kind === 'lucide' ? (
                  <v.Icon size={22} strokeWidth={1.6} />
                ) : (
                  <span
                    aria-hidden="true"
                    style={{
                      display: 'inline-block',
                      width: 24,
                      height: 24,
                      backgroundColor: fg,
                      WebkitMaskImage: `url(${v.src})`,
                      maskImage: `url(${v.src})`,
                      WebkitMaskRepeat: 'no-repeat',
                      maskRepeat: 'no-repeat',
                      WebkitMaskPosition: 'center',
                      maskPosition: 'center',
                      WebkitMaskSize: 'contain',
                      maskSize: 'contain',
                      transition: 'background-color 150ms ease',
                    }}
                  />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* 4 — Price-range tabs + proposals counter (181×12 / 83×12) */}
      <div
        role="tablist"
        aria-label={t?.priceRange || "Price range"}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
          /* user spec: match the bottom gap (28 px to card) — expand
             UPWARD so the price-range tabs sit visually centred between
             the grey divider above and the card below. */
          marginTop: 28,
          marginBottom: 28,
          fontFamily: FONT,
          fontWeight: 400,
          fontSize: 12,
          lineHeight: '12px',
          letterSpacing: '0.04em',
          textTransform: 'uppercase',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'nowrap' }}>
          {PRICE_TABS.map((tab) => {
            const active = priceTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setPriceTab(tab.id)}
                data-testid={`mobile-deals-price-${tab.id}`}
                style={{
                  background: 'transparent',
                  border: 'none',
                  padding: 0,
                  cursor: 'pointer',
                  fontFamily: FONT,
                  fontWeight: active ? 500 : 400,
                  fontSize: 12,
                  letterSpacing: '0.04em',
                  textTransform: 'uppercase',
                  color: active ? '#FEAE00' : '#FFFFFF',
                  whiteSpace: 'nowrap',
                  transition: 'color 150ms ease',
                }}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
        <span style={{ color: '#FFFFFF', whiteSpace: 'nowrap' }}>{t?.proposalsLabel || 'Proposals'} - {proposals}</span>
      </div>

      {/* 5 — Vehicle card (with real touch swipe).
          While the API request is in flight (`current` is undefined), we
          render a neutral skeleton — never the legacy Lucid/BMW mock. */}
      <div ref={carouselScopeRef} className="tilt-scope-mobile" style={{ width: '100%' }}>
      {!current ? (
        <div style={{
          backgroundColor: '#1d1d1b', borderRadius: 8, height: 420,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#71717A', fontSize: 13, letterSpacing: '0.06em',
        }}>
          {t?.loadingLabel || 'Loading vehicles…'}
        </div>
      ) : (
      <article
        data-tilt-card
        data-testid={`mobile-deal-${current.id}`}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        style={{
          backgroundColor: '#1d1d1b',
          borderRadius: 8,
          overflow: 'hidden',
          /* user spec: 12 top / 12 left / 12 right, 24 bottom — doubles the
             breathing room between the MORE DETAILS button and the bottom
             edge of the card */
          padding: '12px 12px 24px',
          width: '100%',
          maxWidth: 336.5,
          margin: '0 auto',
          touchAction: 'pan-y',
        }}
      >
        {/* Image with overlays — square corners (no inner rounding, per spec) */}
        <div
          style={{
            position: 'relative',
            width: '100%',
            aspectRatio: '312 / 220',
            overflow: 'hidden',
            borderRadius: 0,
            backgroundColor: '#0a0a0a',
          }}
        >
          <img
            src={optimizeImage(current.img, ImageSize.cardMobile)}
            alt={current.name}
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
            loading="lazy"
            decoding="async"
            onError={(e) => { e.currentTarget.src = '/mobile/image-15@2x.png'; }}
          />

          {/* Trading date chip — aligned LEFT, parallel to the timer chip below.
              Both chips share the same `left: 12px` and width 160px, so they
              line up geometrically (one at top, one at bottom of the image). */}
          <div
            style={{
              position: 'absolute',
              top: 12,
              left: 12,
              width: 160,
              height: 20,
              padding: '0 8px',
              boxSizing: 'border-box',
              background: 'rgba(255,255,255,0.7)',
              backdropFilter: 'blur(2px)',
              WebkitBackdropFilter: 'blur(2px)',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontFamily: FONT,
              fontWeight: 500,
              fontSize: 12,
              lineHeight: '14px',
              color: '#0B0B0B',
              whiteSpace: 'nowrap',
            }}
          >
            {t.tradingDate} - {current.tradingDate}
          </div>

          {/* Timer chip — Figma spec: 138 × 32, #FEAE00CC, SQUARE corners,
              new clock icon (iconoir-clock.png 18 × 18).  Width is FIXED. */}
          <div
            style={{
              position: 'absolute',
              left: 12,
              bottom: 12,
              width: 138,
              height: 32,
              padding: '0 12px',
              boxSizing: 'border-box',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              background: '#FEAE00CC',
              color: '#000',
              fontFamily: FONT,
              fontWeight: 500,
              fontSize: 14,
              lineHeight: 1,
              borderRadius: 0,
              whiteSpace: 'nowrap',
            }}
          >
            <img src="/single-car/iconoir-clock.png" alt="" width={18} height={18} style={{ display: 'block', flex: '0 0 auto' }} />
            {current.timer || '—'}
          </div>

          {/* Round action buttons (bottom-right) — exact Figma SVGs.
              The SVGs themselves include the 24×24 white outline ring + a
              16×16 inner glyph, so the button has NO additional border.
              Layout: SHARE → COMPARE → FAVORITE (parity with SingleCarPage). */}
          <div style={{ position: 'absolute', right: 12, bottom: 12, display: 'flex', gap: 8, alignItems: 'center', height: 24 }}>
            <button
              type="button"
              aria-label="Share"
              onClick={() => setShareOpen(true)}
              data-testid={`mobile-deal-share-${current.id}`}
              style={{
                width: 24,
                height: 24,
                padding: 0,
                border: 'none',
                background: 'transparent',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                opacity: 0.95,
              }}
            >
              <img src="/figma/Frame-1707479189.svg" alt="" width={24} height={24} style={{ display: 'block' }} />
            </button>
            <button
              type="button"
              aria-label="Compare"
              onClick={() => setCompared((s) => ({ ...s, [current.id]: !s[current.id] }))}
              data-testid={`mobile-deal-compare-${current.id}`}
              style={{
                width: 24,
                height: 24,
                padding: 0,
                border: 'none',
                background: 'transparent',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                opacity: compared[current.id] ? 1 : 0.95,
                filter: compared[current.id]
                  ? 'drop-shadow(0 0 4px rgba(254,174,0,0.9))'
                  : 'none',
              }}
            >
              <img src="/figma/Frame-1707479176.svg" alt="" width={24} height={24} style={{ display: 'block' }} />
            </button>
            <button
              type="button"
              aria-label="Favorite"
              onClick={() => setFavorited((s) => ({ ...s, [current.id]: !s[current.id] }))}
              data-testid={`mobile-deal-favorite-${current.id}`}
              style={{
                width: 24,
                height: 24,
                padding: 0,
                border: 'none',
                background: 'transparent',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                opacity: favorited[current.id] ? 1 : 0.95,
                filter: favorited[current.id]
                  ? 'drop-shadow(0 0 4px rgba(254,174,0,0.9))'
                  : 'none',
              }}
            >
              <img src="/figma/Frame-1707479182.svg" alt="" width={24} height={24} style={{ display: 'block' }} />
            </button>
          </div>
        </div>

        {/* Title — Mazzard H Bold 14 (per Figma spec) */}
        <h3
          style={{
            margin: '16px 0 14px',
            fontFamily: FONT,
            fontWeight: 700,
            fontSize: 14,
            lineHeight: '18px',
            color: '#FFFFFF',
          }}
        >
          {current.name}
        </h3>

        {/* Spec block — Purchase price box (left) + spec rows (right).
            Typography per Figma:
              • "Purchase price" label    → H Medium 12px, white
              • Price value (orange)      → H Bold 12px
              • Spec keys (Mileage etc.)  → H Medium 12px, white
              • Spec values               → H Bold 12px, orange */}
        <div style={{ display: 'flex', gap: 12, alignItems: 'stretch' }}>
          <div
            style={{
              flex: '1 1 0',
              backgroundColor: '#000',
              borderRadius: 4,
              padding: '12px 14px',
              minHeight: 88,
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
            }}
          >
            <div
              style={{
                fontFamily: FONT,
                fontWeight: 500,
                fontSize: 12,
                lineHeight: '14px',
                color: '#FFFFFF',
                marginBottom: 6,
              }}
            >
              {t.purchasePriceLabel}
            </div>
            <div
              style={{
                fontFamily: FONT,
                fontWeight: 700,
                fontSize: 12,
                lineHeight: '16px',
                color: '#FEAE00',
              }}
            >
              {current.purchasePrice}
            </div>
          </div>

          <dl
            style={{
              flex: '1 1 0',
              margin: 0,
              display: 'grid',
              gridTemplateColumns: 'auto 1fr',
              gap: '6px 12px',
              alignContent: 'center',
              fontFamily: FONT,
              fontSize: 12,
              lineHeight: '14px',
            }}
          >
            <dt style={{ color: '#FFFFFF', fontWeight: 500 }}>{t.mileageLabel}</dt>
            <dd style={{ margin: 0, color: '#FEAE00', fontWeight: 700, textAlign: 'right' }}>{current.mileage}</dd>
            <dt style={{ color: '#FFFFFF', fontWeight: 500 }}>{t.engineLabel}</dt>
            <dd style={{ margin: 0, color: '#FEAE00', fontWeight: 700, textAlign: 'right' }}>{translateEngine(current.engine, t)}</dd>
            <dt style={{ color: '#FFFFFF', fontWeight: 500 }}>{t.driveLabel}</dt>
            <dd style={{ margin: 0, color: '#FEAE00', fontWeight: 700, textAlign: 'right' }}>{translateDrive(current.drive, t)}</dd>
          </dl>
        </div>

        {/* Estimated final cost + MORE DETAILS button (162 × 45, H Medium 12px) */}
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', marginTop: 14 }}>
          <div style={{ flex: '1 1 0', minWidth: 0 }}>
            <div style={{ fontFamily: FONT, fontWeight: 500, fontSize: 12, lineHeight: '14px', color: '#949494' }}>
              {t.estimatedFinal}
            </div>
            <div style={{ fontFamily: FONT, fontWeight: 500, fontSize: 12, lineHeight: '14px', color: '#949494' }}>
              {t.costToBulgaria}
            </div>
            <div style={{ fontFamily: FONT, fontWeight: 700, fontSize: 12, lineHeight: '16px', color: '#FEAE00', marginTop: 6 }}>
              {current.finalCost}
            </div>
          </div>
          <button
            type="button"
            data-testid={`mobile-deal-more-${current.id}`}
            onClick={() => {
              /* Navigate to the single-car page for the currently visible deal.
               * Falls back to the catalog if the deal stub has no VIN yet
               * (placeholder fixtures during development). */
              const targetVin = current.vin || current.id;
              window.location.href = targetVin ? `/cars/${encodeURIComponent(targetVin)}` : '/catalog';
            }}
            style={{
              flex: '0 0 auto',
              width: 162,
              height: 45,
              padding: '0 16px',
              border: 'none',
              borderRadius: 4,
              background: '#FEAE00',
              color: '#000',
              fontFamily: FONT,
              fontWeight: 500,
              fontSize: 12,
              lineHeight: '14px',
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
            }}
          >
            {t?.moreDetails || 'More details'}
            <ArrowRight size={14} weight="bold" />
          </button>
        </div>
      </article>
      )}
      </div>

      {/* 6 — Pager (130×24) — counter follows real card count 1:1 */}
      <div
        style={{
          /* user spec: 40 px breathing room between the deal card and the pager */
          marginTop: 40,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 16,
          height: 24,
        }}
      >
        <button
          type="button"
          aria-label="Previous"
          onClick={goPrev}
          data-testid="mobile-deals-prev"
          disabled={total <= 1}
          style={{
            width: 32,
            height: 32,
            borderRadius: 999,
            border: '1.5px solid #FEAE00',
            background: 'transparent',
            color: '#FEAE00',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: total <= 1 ? 'default' : 'pointer',
            opacity: total <= 1 ? 0.4 : 1,
          }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M15 6l-6 6 6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <div
          style={{
            fontFamily: FONT,
            fontWeight: 500,
            fontSize: 14,
            color: '#FFFFFF',
            tabSize: 2,
            minWidth: 56,
            textAlign: 'center',
          }}
        >
          {counter}
        </div>
        <button
          type="button"
          aria-label="Next"
          onClick={goNext}
          data-testid="mobile-deals-next"
          className="bibi-swipe-hint"
          disabled={total <= 1 || safeIdx >= total - 1}
          style={{
            width: 32,
            height: 32,
            borderRadius: 999,
            border: '1.5px solid #FEAE00',
            background: '#FEAE00',
            color: '#000',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: total <= 1 || safeIdx >= total - 1 ? 'default' : 'pointer',
            opacity: total <= 1 || safeIdx >= total - 1 ? 0.4 : 1,
            transition: 'opacity 150ms ease',
          }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>

      {/* 7 — MORE VEHICLES + (Mazzard H Medium 14) */}
      <div style={{ marginTop: 40 /* symmetric to card↔pager gap */, display: 'flex', justifyContent: 'center' }}>
        <a
          href="/catalog"
          data-testid="mobile-deals-more-vehicles"
          style={{
            fontFamily: FONT,
            fontWeight: 500,
            fontSize: 14,
            lineHeight: '17px',
            letterSpacing: '0.04em',
            color: '#FEAE00',
            textTransform: 'uppercase',
            textDecoration: 'underline',
            textUnderlineOffset: 3,
          }}
        >
          {t?.moreVehiclesPlus || 'More vehicles +'}
        </a>
      </div>

      {/* ── Share modal — mounted at the section level so it overlays the
       *    entire page when opened.  Uses the currently-visible card's data. */}
      {current && (
        <ShareModal
          open={shareOpen}
          onClose={() => setShareOpen(false)}
          vin={String(current.vin || current.id || '')}
          snapshot={{
            title: current.name,
            image: current.img,
            price: current.purchasePrice,
            auction_name: current.auction || 'BidMotors',
          }}
        />
      )}
    </section>
  );
}


/* ─────────────────────────────────────────────────────────────────────── */
/* MobileCarSearch                                                         */
/* Real dropdown filter (mirrors the web HeroFilter behaviour):            */
/*   • Brand:  click → searchable list of CAR_BRANDS.                      */
/*   • Model:  DISABLED until brand is picked, then lists models for it.   */
/*   • Year From / Year To: native <select> 1990 → currentYear+1.          */
/*   • Section sized 360 × 621 (Figma): card never overlaps hero above.    */
/* ─────────────────────────────────────────────────────────────────────── */
function MobileCarSearch({
  filterBrand, setFilterBrand,
  filterModel, setFilterModel,
  yearFrom, setYearFrom,
  yearTo, setYearTo,
  onFindCar,
  t,
}) {
  const FONT = "'Helvetica Neue', Helvetica, Arial, sans-serif";
  const [openWhich, setOpenWhich] = useState(null);
  const [brandQuery, setBrandQuery] = useState('');
  const rootRef = useRef(null);

  const currentYear = new Date().getFullYear();
  const YEARS = useMemo(() => {
    const out = [];
    for (let y = currentYear + 1; y >= 1990; y--) out.push(String(y));
    return out;
  }, [currentYear]);

  const brandOptions = useMemo(() => {
    const q = brandQuery.trim().toLowerCase();
    const list = q ? CAR_BRANDS.filter((b) => b.toLowerCase().includes(q)) : CAR_BRANDS;
    return [t?.allBrands || 'Any Brand', ...list];
  }, [brandQuery, t]);

  const modelOptions = useMemo(() => {
    if (!filterBrand) return [];
    return [t?.allModels || 'Any model', ...(MODELS_BY_BRAND[filterBrand] || [])];
  }, [filterBrand, t]);

  useEffect(() => {
    const onDoc = (e) => {
      if (!rootRef.current) return;
      if (!rootRef.current.contains(e.target)) setOpenWhich(null);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('touchstart', onDoc);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('touchstart', onDoc);
    };
  }, []);

  const pickBrand = (b) => {
    setFilterBrand(b === 'Any Brand' || b === (t?.allBrands || '') ? '' : b);
    setFilterModel('');
    setOpenWhich(null);
    setBrandQuery('');
  };
  const pickModel = (m) => {
    setFilterModel(m === 'Any model' || m === (t?.allModels || '') ? '' : m);
    setOpenWhich(null);
  };

  const fieldStyleBase = {
    width: '100%',
    height: 48,
    background: '#000',
    border: '1px solid #2a2a28',
    borderRadius: 6,
    color: '#fff',
    fontFamily: FONT,
    fontSize: 14,
    padding: '0 14px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    cursor: 'pointer',
    boxSizing: 'border-box',
  };

  return (
    <section
      ref={rootRef}
      data-testid="mobile-car-search"
      className="flex justify-center"
      style={{ minHeight: 621, paddingTop: 56, paddingBottom: 56, boxSizing: 'border-box' }}
    >
      <div style={{ width: 336, maxWidth: '100%' }}>     {/* 360 − 12 L − 12 R = 336 (user spec: 12 L/R) */}
        <h3
          className="text-center uppercase"
          style={{
            color: '#FEAE00',
            fontFamily: FONT,
            fontWeight: 700,
            fontSize: 24,
            lineHeight: '28px',
            letterSpacing: '0.04em',
            marginBottom: 28,
          }}
        >
          {t?.carSearch || 'Car Search'}
        </h3>

        {/* BRAND */}
        <label style={{ display: 'block', color: '#fff', fontFamily: FONT, fontSize: 14, fontWeight: 500, marginBottom: 8 }}>
          {t?.brand || 'Brand'}
        </label>
        <div style={{ position: 'relative', marginBottom: 16 }}>
          <button
            type="button"
            data-testid="mobile-brand-trigger"
            onClick={() => setOpenWhich(openWhich === 'brand' ? null : 'brand')}
            style={{ ...fieldStyleBase, borderColor: openWhich === 'brand' ? '#FEAE00' : '#2a2a28' }}
          >
            <span style={{ color: filterBrand ? '#fff' : '#7a7a78' }}>{filterBrand || (t?.allBrands || 'All brands')}</span>
            <Caret open={openWhich === 'brand'} />
          </button>

          {openWhich === 'brand' && (
            <div
              data-testid="mobile-brand-panel"
              style={{
                position: 'absolute', top: 'calc(100% + 6px)', left: 0, right: 0,
                background: '#0a0a0a', border: '1px solid #FEAE00', borderRadius: 6,
                zIndex: 60, maxHeight: 280, display: 'flex', flexDirection: 'column', overflow: 'hidden',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', borderBottom: '1px solid #2a2a28' }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <circle cx="11" cy="11" r="7" stroke="#7a7a78" strokeWidth="1.6" />
                  <path d="M20 20l-3.5-3.5" stroke="#7a7a78" strokeWidth="1.6" strokeLinecap="round" />
                </svg>
                <input
                  data-testid="mobile-brand-search"
                  type="text"
                  value={brandQuery}
                  onChange={(e) => setBrandQuery(e.target.value)}
                  placeholder={t?.searchBrand || 'Search brand...'}
                  style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', color: '#fff', fontFamily: FONT, fontSize: 16 /* >=16px prevents iOS auto-zoom */ }}
                />
              </div>
              <div style={{ overflowY: 'auto', maxHeight: 230 }}>
                {brandOptions.map((b) => (
                  <button
                    key={b}
                    type="button"
                    onClick={() => pickBrand(b)}
                    data-testid={`mobile-brand-option-${b}`}
                    style={{ display: 'block', width: '100%', textAlign: 'left', padding: '12px 16px', background: 'transparent', border: 'none', color: '#fff', fontFamily: FONT, fontSize: 14, cursor: 'pointer' }}
                  >
                    {b}
                  </button>
                ))}
                {brandOptions.length === 1 && (
                  <div style={{ padding: '12px 16px', color: '#7a7a78', fontFamily: FONT, fontSize: 13 }}>{t?.noBrandsFound || 'No brands found'}</div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* MODEL (locked until brand selected) */}
        <label style={{ display: 'block', color: filterBrand ? '#fff' : '#5a5a58', fontFamily: FONT, fontSize: 14, fontWeight: 500, marginBottom: 8 }}>
          {t?.model || 'Model'}
        </label>
        <div style={{ position: 'relative', marginBottom: 16 }}>
          <button
            type="button"
            data-testid="mobile-model-trigger"
            disabled={!filterBrand}
            onClick={() => filterBrand && setOpenWhich(openWhich === 'model' ? null : 'model')}
            style={{
              ...fieldStyleBase,
              cursor: filterBrand ? 'pointer' : 'not-allowed',
              opacity: filterBrand ? 1 : 0.5,
              borderColor: openWhich === 'model' ? '#FEAE00' : '#2a2a28',
            }}
          >
            <span style={{ color: filterModel ? '#fff' : '#7a7a78' }}>{filterModel || (t?.allModels || 'All models')}</span>
            <Caret open={openWhich === 'model'} />
          </button>

          {openWhich === 'model' && filterBrand && (
            <div
              data-testid="mobile-model-panel"
              style={{
                position: 'absolute', top: 'calc(100% + 6px)', left: 0, right: 0,
                background: '#0a0a0a', border: '1px solid #FEAE00', borderRadius: 6,
                zIndex: 60, maxHeight: 260, overflowY: 'auto',
              }}
            >
              {modelOptions.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => pickModel(m)}
                  data-testid={`mobile-model-option-${m}`}
                  style={{ display: 'block', width: '100%', textAlign: 'left', padding: '12px 16px', background: 'transparent', border: 'none', color: '#fff', fontFamily: FONT, fontSize: 14, cursor: 'pointer' }}
                >
                  {m}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* YEAR FROM */}
        <label style={{ display: 'block', color: '#fff', fontFamily: FONT, fontSize: 14, fontWeight: 500, marginBottom: 8 }}>{t?.year || 'Year'}</label>
        <YearSelect value={yearFrom} onChange={setYearFrom} placeholder={t?.fromShort || 'From'} years={YEARS} testid="mobile-year-from" />

        {/* YEAR TO */}
        <label style={{ display: 'block', color: '#fff', fontFamily: FONT, fontSize: 14, fontWeight: 500, marginBottom: 8, marginTop: 16 }}>{t?.year || 'Year'}</label>
        <YearSelect value={yearTo} onChange={setYearTo} placeholder={t?.toShort || 'To'} years={YEARS} testid="mobile-year-to" />

        {/* FIND A CAR */}
        <button
          type="button"
          onClick={onFindCar}
          data-testid="mobile-find-car"
          style={{
            display: 'block', width: '100%', height: 45, marginTop: 28,
            background: '#FEAE00', color: '#000', border: 'none', borderRadius: 4,
            fontFamily: FONT, fontWeight: 600, fontSize: 14, letterSpacing: '0.06em',
            textTransform: 'uppercase', cursor: 'pointer',
          }}
        >
          {t?.findCar || 'Find a car'}
        </button>
      </div>
    </section>
  );
}

function Caret({ open }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true"
         style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 150ms' }}>
      <path d="M6 9l6 6 6-6" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function YearSelect({ value, onChange, placeholder, years, testid }) {
  const FONT = "'Helvetica Neue', Helvetica, Arial, sans-serif";
  return (
    <div style={{ position: 'relative' }}>
      <select
        data-testid={testid}
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        style={{
          width: '100%', height: 48, background: '#000', border: '1px solid #2a2a28',
          borderRadius: 6, color: value ? '#fff' : '#7a7a78',
          fontFamily: FONT, fontSize: 16 /* >=16px prevents iOS auto-zoom on select */, padding: '0 36px 0 14px',
          appearance: 'none', WebkitAppearance: 'none', MozAppearance: 'none',
          cursor: 'pointer', boxSizing: 'border-box',
        }}
      >
        <option value="">{placeholder}</option>
        {years.map((y) => (<option key={y} value={y}>{y}</option>))}
      </select>
      <span style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}>
        <Caret open={false} />
      </span>
    </div>
  );
}


/* ─────────────────────────────────────────────────────────────────────── */
/* MobileCalculateCar — "Calculate a car yourself / with a price guarantee" */
/*                                                                         */
/* Layout (1-to-1 with Figma mobile mock):                                  */
/*   • Outer frame: solid #FEAE00 background, rounded card.                */
/*   • Inner card:  #000 with image at top (Ford F-150, ratio 334.92/188). */
/*   • Title:       "Calculate a car yourself" (orange) +                  */
/*                  "with a price guarantee" (white), Mazzard H Bold 24px. */
/*   • Subtitle:    "From the USA and Korea", H Medium 14px, white.        */
/*   • VIN input:   294 wide, "Search by VIN or lot number", H Medium 14.  */
/*   • CALCULATE:   #FEAE00 button, Helvetica Now Display 14, black text.  */
/*   • ALL CATALOG +: orange underlined link, H Medium 14.                 */
/* ─────────────────────────────────────────────────────────────────────── */
function MobileCalculateCar({ t }) {
  const FONT = "'Mazzard', 'Mazzard H', system-ui, -apple-system, sans-serif";
  const FONT_BTN = "'Helvetica Now Display', 'Helvetica Neue', Helvetica, Arial, sans-serif";
  const [vin, setVin] = useState('');

  const submit = (e) => {
    e?.preventDefault?.();
    const q = vin.trim();
    if (q) {
      window.location.href = `/calculator?vin=${encodeURIComponent(q)}`;
    } else {
      window.location.href = '/calculator';
    }
  };

  return (
    <section
      data-testid="mobile-calculate-car"
      style={{
        padding: 0,
        margin: 0,
        boxSizing: 'border-box',
        background: '#000',
        width: '100%',
      }}
    >
      {/* ── Yellow outer frame — FULL VIEWPORT WIDTH (no black side margins)
       *
       *   Padding: 13 px (left) | 13 px (right) | 55 px (top) | 55 px (bottom)
       *
       *   Inside (top → bottom):
       *     • Image            full inner width × aspect 335 / 188
       *     • Black card       full inner width, content below:
       *         – 39 px top padding to title
       *         – Title (2 lines) Mazzard H Bold 24 px (yellow + white)
       *         – 19 px gap to subtitle
       *         – Subtitle "From the USA and Korea" 14 px white
       *         – flex spacer (lots of black breathing room)
       *         – Search input 317 × 40 (centered, icon 24×24, font 14)
       *         – 42 px gap
       *         – CALCULATE button 294 × 45 (centered, yellow CTA)
       *         – flex spacer
       *         – ALL CATALOG + (centered, underlined yellow)
       *         – 30 px bottom padding
       * ──────────────────────────────────────────────────────────────── */}
      <div
        style={{
          backgroundColor: '#FEAE00',
          width: '100%',
          boxSizing: 'border-box',
          padding: '55px 13px',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Hero image — full inner width, aspect 335 / 188 */}
        <div
          style={{
            width: '100%',
            aspectRatio: '335 / 188',
            overflow: 'hidden',
            lineHeight: 0,
            flexShrink: 0,
          }}
        >
          <img
            src="/mobile/image-93@2x.png"
            alt="Ford pickup ready for delivery"
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              objectPosition: 'center',
              display: 'block',
            }}
            loading="lazy"
          />
        </div>

        {/* Black inner card — full inner width, holds all calculator content */}
        <div
          style={{
            backgroundColor: '#000',
            width: '100%',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            minHeight: 409,
          }}
        >
          {/* Title block — 39 px top padding, 30 px sides */}
          <div
            style={{
              padding: '39px 30px 0',
              textAlign: 'center',
              width: '100%',
              boxSizing: 'border-box',
              flexShrink: 0,
            }}
          >
            <h2
              style={{
                margin: 0,
                fontFamily: FONT,
                fontWeight: 700,
                fontSize: 24,
                lineHeight: '28px',
                letterSpacing: '-0.005em',
              }}
            >
              <AnimatedHeading
                as="span"
                text={t?.calculateCarYourself || "Calculate a car yourself"}
                style={{ color: '#FEAE00', display: 'block' }}
              />
              <AnimatedHeading
                as="span"
                text={t?.withPriceGuarantee || "with a price guarantee"}
                baseDelay={(t?.calculateCarYourself || 'Calculate a car yourself').replace(/\s/g, '').length * 28}
                style={{
                  color: '#FFFFFF',
                  display: 'block',
                  marginTop: 4,
                }}
              />
            </h2>

            {/* Subtitle — 19 px gap from title */}
            <p
              style={{
                margin: '19px 0 0',
                fontFamily: FONT,
                fontWeight: 500,
                fontSize: 14,
                lineHeight: '18px',
                color: '#FFFFFF',
              }}
            >
              {t?.fromUsaKorea || 'From the USA and Korea'}
            </p>
          </div>

          {/* spacer — lots of black breathing room above the form */}
          <div style={{ flex: 1, minHeight: 60 }} />

          {/* Search input — 317 × 40, centered */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              width: 317,
              height: 40,
              padding: '0 12px',
              background: 'transparent',
              border: '1px solid #3a3a36',
              borderRadius: 6,
              boxSizing: 'border-box',
              flexShrink: 0,
              maxWidth: 'calc(100% - 18px)',
            }}
          >
            {/* Icon — exact 24 × 24 */}
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              aria-hidden="true"
              style={{ flexShrink: 0 }}
            >
              <circle cx="11" cy="11" r="7" stroke="#9a9a96" strokeWidth="1.7" />
              <path
                d="M20 20l-3.5-3.5"
                stroke="#9a9a96"
                strokeWidth="1.7"
                strokeLinecap="round"
              />
            </svg>
            <input
              data-testid="mobile-calc-vin"
              type="text"
              value={vin}
              onChange={(e) => setVin(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && submit(e)}
              placeholder={t?.searchByVin || "Search by VIN or lot number"}
              style={{
                flex: 1,
                background: 'transparent',
                border: 'none',
                outline: 'none',
                color: '#FFFFFF',
                /* Helvetica Now Display Regular 14 px (placeholder spec) */
                fontFamily: FONT_BTN,
                fontWeight: 400,
                fontSize: 14,
                lineHeight: '21px',
                minWidth: 0,
              }}
            />
          </div>

          {/* 42 px gap between input and CALCULATE button */}
          <div style={{ height: 42, flexShrink: 0 }} />

          {/* CALCULATE button — 294 × 45, centered yellow CTA */}
          <button
            type="button"
            onClick={submit}
            data-testid="mobile-calc-submit"
            style={{
              display: 'block',
              width: 294,
              height: 45,
              maxWidth: 'calc(100% - 41px)',
              background: '#FEAE00',
              color: '#000',
              border: 'none',
              borderRadius: 6,
              fontFamily: FONT_BTN,
              fontWeight: 600,
              fontSize: 14,
              lineHeight: '18px',
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              cursor: 'pointer',
              flexShrink: 0,
            }}
          >
            {t?.calculate || 'Calculate'}
          </button>

          {/* spacer — pushes ALL CATALOG towards the bottom */}
          <div style={{ flex: 1, minHeight: 60 }} />

          {/* ALL CATALOG + — centered, 30 px bottom padding */}
          <div
            style={{
              padding: '0 0 30px',
              textAlign: 'center',
              width: '100%',
              boxSizing: 'border-box',
              flexShrink: 0,
            }}
          >
            <a
              href="/catalog"
              data-testid="mobile-calc-all-catalog"
              style={{
                fontFamily: FONT,
                fontWeight: 500,
                fontSize: 14,
                lineHeight: '18px',
                color: '#FEAE00',
                textTransform: 'uppercase',
                textDecoration: 'underline',
                textUnderlineOffset: 4,
                textDecorationThickness: '1px',
                letterSpacing: '0.06em',
              }}
            >
              {t?.allCatalogPlus || 'All catalog +'}
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}



/* ─────────────────────────────────────────────────────────────────────── */
/* MobileHowWeWork — "HOW WE WORK / WE WORK FOR EACH CLIENT" mobile section
 *
 * Geometry (per Figma DevMode):
 *   • 62 px  top padding (gap from end of Calculator block)
 *   • 63.5 px side padding around the centered title block
 *   • 24 px  gap between "HOW WE WORK" (24 px) and "WE WORK FOR EACH CLIENT
 *            / DEPENDING ON THE BUDGET" (16 px) sub-title
 *   • 17 px  side padding around cards
 *   • 17 px  vertical gap between cards
 *   • 43 px  bottom padding (gap to next section)
 *
 * Cards (3 plans, stacked vertically on mobile):
 *   1. Standard               328 × 279  black bg, yellow border
 *   2. Turnkey [popular]      327 × 274  yellow bg, black text
 *   3. Sourcing + Delivery
 *      + Support              335 × 283  black bg, yellow border, gray desc
 *
 * Description text in cards 2 & 3 uses the gray color #555452.
 * ─────────────────────────────────────────────────────────────────────── */
function MobileHowWeWork() {
  const FONT = "'Mazzard', 'Mazzard H', system-ui, -apple-system, sans-serif";
  // Helvetica Now / New Display — corporate body font for cards.
  // Local face is not bundled, so we fall back to Helvetica Neue / Helvetica /
  // Arial which match the metrics closely on iOS/macOS/Android.
  const HELV =
    "'Helvetica Now Display', 'Helvetica Neue', Helvetica, Arial, sans-serif";

  const { lang } = useLang();
  const isBg = (lang || 'en').toLowerCase().startsWith('bg');
  const L = isBg
    ? {
        title: 'Как работим',
        weWorkForEachClient: 'Работим за всеки клиент',
        dependingOnBudget: 'според бюджета',
        haveAQuestion: 'Имате въпрос?',
        contactUs: 'Свържете се с нас',
        popular: 'популярен',
        plans: [
          {
            key: 'standard',
            tag: 'Стандарт',
            desc: 'Намиране, инспекция, наддаване, покупка\nи доставка до България.',
            accent: 'Останалите стъпки\nизвършвате сами.',
          },
          {
            key: 'turnkey',
            tag: 'На ключ',
            desc:
              'Пълно обслужване без ваше участие:\nнамиране, инспекция, покупка,\nдоставка, адаптация, технически\nпреглед и регистрация.',
            accent: 'Получавате готов за карaне\nавтомобил.',
          },
          {
            key: 'sourcing',
            tag: 'Намиране + Доставка\n+ Поддръжка',
            desc: 'Намиране, инспекция, покупка\nи доставка.',
            accent:
              'Регистрацията поемате сами —\nние ви свързваме с доверени\nсервизни партньори.',
          },
        ],
      }
    : {
        title: 'How we work',
        weWorkForEachClient: 'We work for each client',
        dependingOnBudget: 'depending on the budget',
        haveAQuestion: 'Have a question?',
        contactUs: 'Contact us',
        popular: 'popular',
        plans: [
          {
            key: 'standard',
            tag: 'Standard',
            desc: 'Sourcing, inspection, bidding, purchase,\nand delivery to Bulgaria.',
            accent: 'From there, you handle\neverything yourself.',
          },
          {
            key: 'turnkey',
            tag: 'Turnkey',
            desc:
              'Full-service with zero involvement\nrequired: sourcing, inspection,\npurchase, delivery, adaptation,\ntechnical inspection, and registration.',
            accent: 'You simply pick up\na ready-to-drive car.',
          },
          {
            key: 'sourcing',
            tag: 'Sourcing + Delivery\n+ Support',
            desc: 'Sourcing, inspection, purchase, and\ndelivery.',
            accent:
              'You handle registration - we\nconnect you with trusted service\npartners.',
          },
        ],
      };

  // Shared BIBI tilt-parallax for the 3 plan cards (Standard / Turnkey /
  // Sourcing). Cards stay statically aligned until a finger presses one.
  const cardsRef = useRef(null);
  useTiltParallax(cardsRef, { cardsSelector: ":scope > [data-tilt-card]" });

  const PLANS = L.plans.map((p, idx) => ({
    ...p,
    num: idx + 1,
    popular: p.key === 'turnkey',
    yellow: p.key === 'turnkey',
  }));

  return (
    <section
      data-testid="mobile-how-we-work"
      style={{
        padding: '62px 0 0',
        background: '#000',
        boxSizing: 'border-box',
        width: '100%',
      }}
    >
      {/* ── Title block — 63.5 px side padding, centered ─────────────── */}
      <div
        style={{
          padding: '0 63.5px',
          textAlign: 'center',
          boxSizing: 'border-box',
        }}
      >
        <AnimatedHeading
          as="h2"
          text={L.title}
          style={{
            margin: 0,
            fontFamily: FONT,
            fontWeight: 700,
            fontSize: 24,
            lineHeight: '28px',
            color: '#FEAE00',
            textTransform: 'uppercase',
            letterSpacing: '0.02em',
          }}
        />

        <p
          style={{
            margin: '24px 0 0',
            fontFamily: FONT,
            fontWeight: 500,
            fontSize: 16,
            lineHeight: '20px',
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
          }}
        >
          <span style={{ color: '#FEAE00', display: 'block' }}>
            {L.weWorkForEachClient}
          </span>
          <span style={{ color: '#FFFFFF', display: 'block', marginTop: 2 }}>
            {L.dependingOnBudget}
          </span>
        </p>
      </div>

      {/* ── Cards — 17 px sides, 17 px gap between (symmetric), 91 px gap from sub-title ─ */}
      <div
        ref={cardsRef}
        className="tilt-scope-mobile"
        style={{
          marginTop: 91,
          padding: '0 12px',                      /* user spec: 12 L/R on welcome mobile */
          display: 'flex',
          flexDirection: 'column',
          gap: 17,
          boxSizing: 'border-box',
        }}
      >
        {PLANS.map((p) => {
          const bg = p.yellow ? '#FEAE00' : '#0E0E0E';
          const border = p.yellow ? 'none' : '1px solid #FEAE00';
          const numColor = p.yellow ? 'rgba(0,0,0,0.55)' : '#FEAE00';
          const titleColor = p.yellow ? '#000000' : '#FEAE00';
          const descColor = p.yellow
            ? '#000000'
            : p.key === 'sourcing'
              ? '#FFFFFF'
              : '#FFFFFF';
          const accentColor = p.yellow ? '#000000' : '#FEAE00';

          return (
            <div
              key={p.key}
              data-tilt-card
              data-testid={`mobile-plan-card-${p.key}`}
              style={{
                background: bg,
                border,
                borderRadius: 0,
                padding: '24px 24px 26px',
                position: 'relative',
                boxSizing: 'border-box',
                fontFamily: FONT,
                /* leather-like noise on dark cards (subtle) */
                backgroundImage: p.yellow
                  ? undefined
                  : 'radial-gradient(circle at 30% 0%, rgba(254,174,0,0.04), transparent 50%)',
              }}
            >
              {/* Top row: [N] number + optional [popular] pill */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: 20,
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 14,
                  }}
                >
                  <span
                    style={{
                      width: 39,
                      height: 25,
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      color: numColor,
                      fontFamily: FONT,
                      lineHeight: 1,
                      flexShrink: 0,
                      letterSpacing: 0,
                    }}
                  >
                    <span style={{ fontWeight: 400, fontSize: 25, lineHeight: 1 }}>[</span>
                    <span style={{ fontWeight: 600, fontSize: 13, lineHeight: 1 }}>{p.num}</span>
                    <span style={{ fontWeight: 400, fontSize: 25, lineHeight: 1 }}>]</span>
                  </span>
                  <h3
                    style={{
                      margin: 0,
                      fontFamily: FONT,
                      fontWeight: 700,
                      fontSize: 24,
                      lineHeight: '28px',
                      color: titleColor,
                      whiteSpace: 'pre-line',
                      letterSpacing: '-0.005em',
                    }}
                  >
                    {p.tag}
                  </h3>
                </div>

                {p.popular && (
                  <span
                    style={{
                      width: 64,
                      height: 32,
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      border: '1px solid rgba(0,0,0,0.85)',
                      borderRadius: 16,
                      color: '#000000',
                      fontFamily: FONT,
                      fontWeight: 500,
                      fontSize: 12,
                      lineHeight: '14px',
                      textTransform: 'lowercase',
                      letterSpacing: '0.02em',
                      flexShrink: 0,
                      boxSizing: 'border-box',
                    }}
                  >
                    {L.popular}
                  </span>
                )}
              </div>

              {/* Description (Helvetica Now/New Display Regular 18) */}
              <p
                style={{
                  margin: '0 0 22px',
                  fontFamily: HELV,
                  fontWeight: 400,
                  fontSize: 18,
                  lineHeight: '24px',
                  color: descColor,
                  whiteSpace: 'pre-line',
                }}
              >
                {p.desc}
              </p>

              {/* Accent highlight (Helvetica Now/New Display Bold 18) */}
              <p
                style={{
                  margin: 0,
                  fontFamily: HELV,
                  fontWeight: 700,
                  fontSize: 18,
                  lineHeight: '24px',
                  color: accentColor,
                  whiteSpace: 'pre-line',
                }}
              >
                {p.accent}
              </p>
            </div>
          );
        })}

        {/* ── "Have a question? / Contact us" card ───────────────────────
         * Black bg, yellow border, large rounded corners.
         * Centered: title + sub + two phone numbers (yellow).
         * ──────────────────────────────────────────────────────────── */}
        {/* ── "Have a question? / Contact us" card ───────────────────────
         * Rounded corners (8 px) — the ONLY card with rounding.
         * Spec (Figma DevMode):
         *   • borderRadius 8
         *   • padding: 35 top | 97 sides | 42 bottom
         *   • Have a question?  → Mazzard H Bold 16  (white)
         *   • 22 px gap
         *   • Contact us        → Mazzard H Bold 16  (white)
         *   • 11 px gap
         *   • Phone #1          → Mazzard H Bold 16  (yellow)
         *   • 8 px gap
         *   • Phone #2          → Mazzard H Bold 16  (yellow)
         * ──────────────────────────────────────────────────────────── */}
        <div
          data-testid="mobile-have-a-question"
          style={{
            marginTop: 57, /* 17 (gap) + 57 = 74 px from end of last plan card */
            marginBottom: 43, /* bottom padding to next section */
            background: '#000000',
            border: '1px solid #FEAE00',
            borderRadius: 8,
            padding: '35px 97px 42px',
            textAlign: 'center',
            fontFamily: FONT,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            boxSizing: 'border-box',
          }}
        >
          <div
            style={{
              fontFamily: FONT,
              fontWeight: 700,
              fontSize: 16,
              lineHeight: '20px',
              color: '#FFFFFF',
            }}
          >
            {L.haveAQuestion}
          </div>

          <div
            style={{
              marginTop: 22,
              fontFamily: FONT,
              fontWeight: 700,
              fontSize: 16,
              lineHeight: '20px',
              color: '#FFFFFF',
            }}
          >
            {L.contactUs}
          </div>

          <a
            href="tel:+359875313158"
            style={{
              marginTop: 11,
              fontFamily: FONT,
              fontWeight: 700,
              fontSize: 16,
              lineHeight: '20px',
              color: '#FEAE00',
              textDecoration: 'none',
              whiteSpace: 'nowrap',
            }}
          >
            +359 875 313 158
          </a>

          <a
            href="tel:+359897884804"
            style={{
              marginTop: 8,
              fontFamily: FONT,
              fontWeight: 700,
              fontSize: 16,
              lineHeight: '20px',
              color: '#FEAE00',
              textDecoration: 'none',
              whiteSpace: 'nowrap',
            }}
          >
            +359 897 884 804
          </a>
        </div>
      </div>
    </section>
  );
}


/* ─────────────────────────────────────────────────────────────────────── */
/* MobileHowToBuyTurnkey — "How to buy a turnkey car" mobile adaptation
 * of the desktop section (`figma_home/components/turnkey-banner1.jsx`).
 * Uses the SAME assets as the web version:
 *   • /figma/image-57@2x.webp  — aerial road background
 *   • /figma/image-65@2x.webp  — Copart logo (94 × 40)
 *   • /figma/image-71@2x.webp  — CARFAX logo (93 × 17)
 *   • /figma/image-73@2x.webp  — IAA logo (51 × 29)
 *   • /figma/image-76@2x.webp  — Manheim logo (118 × 29)
 *   • /figma/image-81@2x.webp  — Encar logo (73 × 24)
 *   • /figma/basil-viber-outline.svg — Viber icon (42 × 42)
 *
 * Mobile geometry (per Figma DevMode @ 368 × 1256):
 *   • 28 px  top padding
 *   • 82 px  side padding around the title (Mazzard H Bold 32)
 *   • Title "How to buy / a turnkey car"
 *   • Aerial photo of a car driving down the road shows through the bg
 *   • "from"          — Mazzard H Bold 14, yellow
 *   • "USA/Korea"     — Mazzard H Bold 32, white
 *   • Auction logos: 2 rows centred on the road
 *   • 5 numbered steps (block 328 × 276):
 *       — yellow numerals "1/" — Mazzard H ExtraBold 20
 *       — white step text      — Mazzard H Bold 20
 *       — 40 px left, 13 px gap, 18 px between items
 *   • "Pick up the car" CTA — 294 × 45, Mazzard H Medium 14, 34/33 pads
 *   • "Join our group and get the hottest offers" — Bold 16, 57/55 pads
 *   • Viber icon 42 × 42, 16 px after caption
 *   • 39 px bottom padding
 * ─────────────────────────────────────────────────────────────────────── */
function MobileHowToBuyTurnkey() {
  const FONT = "'Mazzard', 'Mazzard H', system-ui, -apple-system, sans-serif";

  const { lang } = useLang();
  const isBg = (lang || 'en').toLowerCase().startsWith('bg');
  const L = isBg
    ? {
        titleLine1: 'Как да купите',
        titleLine2: 'автомобил на ключ',
        joinOurGroup: 'Присъединете се\nкъм нашата група',
        pickUpTheCar: 'Получете автомобила',
        steps: [
          'Изпращаме заявка',
          'Обсъждаме детайлите',
          'Търсим автомобила',
          'Купуваме и доставяме до\nевропейско пристанище',
          'Митническо оформяне и\nдоставка до България',
        ],
      }
    : {
        titleLine1: 'How to buy',
        titleLine2: 'a turnkey car',
        joinOurGroup: 'Join our group',
        pickUpTheCar: 'Pick up the car',
        steps: [
          'We send an application',
          'We discuss the details',
          'We look for a car',
          'We buy and deliver to a\nEuropean port',
          'We clear customs and\ndeliver the car to Bulgaria',
        ],
      };

  const STEPS = L.steps;

  // Figma DevMode geometry (card 368 × 1256):
  //   • Title padding-top                = 28
  //   • Title side padding (left/right)  = 82
  //   • Title font-size                  = 32
  //   • USA/Korea: top=412, left=94, width=180 (right edge = 87 from card edge)
  //   • Steps inter-item gap             = 18
  //   • "Join our group" caption — comes AFTER steps
  //   • Viber icon gap from caption      = 16
  //   • "Pick up the car" button gap from caption/icon block = 53
  //   • Pick up the car BUTTON absolute top from card start  = 1023
  //   • Bottom padding                   = 39
  return (
    <section
      data-testid="mobile-how-to-buy-turnkey"
      style={{
        position: 'relative',
        background: '#0A0A0A',
        padding: '28px 0 39px',
        overflow: 'hidden',
        boxSizing: 'border-box',
        width: '100%',
        // Total card height per Figma = 1262 px:
        //   button top 1023 + 45 + 53 (gap) + 44 (2-line caption) + 16 (gap)
        //   + 42 (viber) + 39 (bottom padding) = 1262
        minHeight: 1262,
      }}
    >
      {/* ── Aerial road photo as full-bleed background ─────────────────
       *    User-supplied mobile background (session 36): aerial shot of a
       *    white car on a dark asphalt road with yellow lane markings.
       *    The image is centred horizontally and stretched to fill the
       *    fixed 1262 px card height (object-fit: cover preserves the
       *    aspect ratio while ensuring full coverage). */}
      <img
        src="/figma/turnkey-road-mobile.png"
        alt=""
        aria-hidden="true"
        style={{
          position: 'absolute',
          top: 0,
          left: '50%',
          transform: 'translateX(-50%)',
          height: '100%',
          width: 'auto',
          minWidth: '100%',
          objectFit: 'cover',
          objectPosition: 'center top',
          pointerEvents: 'none',
          userSelect: 'none',
        }}
      />
      {/* Top fade so the title remains legible on light asphalt */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: 220,
          background:
            'linear-gradient(180deg, rgba(10,10,10,0.85) 0%, rgba(10,10,10,0.55) 60%, rgba(10,10,10,0) 100%)',
          pointerEvents: 'none',
        }}
      />
      {/* Bottom fade for the CTA / Join card legibility */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          height: 320,
          background:
            'linear-gradient(0deg, rgba(10,10,10,0.92) 0%, rgba(10,10,10,0.65) 55%, rgba(10,10,10,0) 100%)',
          pointerEvents: 'none',
        }}
      />

      {/* ── Content (above bg) ───────────────────────────────────────── */}
      <div style={{ position: 'relative', zIndex: 1 }}>
        {/* Title */}
        <h2
          style={{
            margin: 0,
            padding: '0 82px',
            textAlign: 'center',
            fontFamily: FONT,
            fontWeight: 700,
            fontSize: 32,
            lineHeight: '36px',
            color: '#FEAE00',
            letterSpacing: '-0.005em',
          }}
        >
          <AnimatedHeading as="span" text={L.titleLine1} style={{ display: 'block' }} />
          <AnimatedHeading
            as="span"
            text={L.titleLine2}
            baseDelay={L.titleLine1.replace(/\s/g, '').length * 28}
            style={{ display: 'block' }}
          />
        </h2>

        {/* Spacer where the car photo of the bg image sits.
           Figma: "from"/USA/Korea block is absolutely positioned at top:412
           from section start (rendered as a direct child of the relative
           section — see below). The flow spacer reserves the same vertical
           space so that the auction-logos row stays at its Figma offset.
           +60 px additional drop so the bottom of step 5 lands exactly 77 px
           above the "Pick up the car" button (1023 − 77 = 946 px). */}
        <div aria-hidden style={{ height: 345 + 60 }} />

        {/* ── Auction logos — real SVG assets, exact Figma positioning ─
             Row 1 (Copart 94×40 · IAAI 51×29 · CARFAX 93×17):
               • Copart  → padding-left  35 px from section edge
               • CARFAX  → padding-right 31 px from section edge
               • IAAI    → centred between (159 / 151), vertically centred
                            with Copart (40 px tall row baseline)
             Row 2 (Manheim 118×30 · Encar 74×22), 33 px below row 1:
               • Manheim → padding-left  43 px
               • Encar   → padding-right 60 px
             Vertical position from section start: 493 px (Figma).
          ────────────────────────────────────────────────────────────── */}
        <div style={{ marginTop: 38 }}>
          {/* Row 1 — fixed 40 px height so all three are vertically centred */}
          <div
            style={{
              padding: '0 31px 0 35px',
              height: 40,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              boxSizing: 'border-box',
            }}
          >
            <img
              src="/figma/copart-logo.svg"
              alt="Copart"
              width={94}
              height={40}
              style={{ width: 94, height: 40, display: 'block', flexShrink: 0 }}
            />
            <img
              src="/figma/iaai-logo.svg"
              alt="IAA — Insurance Auto Auctions"
              width={51}
              height={29}
              style={{ width: 51, height: 29, display: 'block', flexShrink: 0 }}
            />
            <img
              src="/figma/carfax-logo.svg"
              alt="CARFAX"
              width={93}
              height={17}
              style={{ width: 93, height: 17, display: 'block', flexShrink: 0 }}
            />
          </div>
          {/* Row 2 — 33 px gap from row 1, fixed 30 px height */}
          <div
            style={{
              marginTop: 33,
              padding: '0 60px 0 43px',
              height: 30,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              boxSizing: 'border-box',
            }}
          >
            <img
              src="/figma/manheim-logo.svg"
              alt="Manheim"
              width={118}
              height={30}
              style={{ width: 118, height: 30, display: 'block', flexShrink: 0 }}
            />
            <img
              src="/figma/encar-logo.svg"
              alt="Encar"
              width={74}
              height={22}
              style={{ width: 74, height: 22, display: 'block', flexShrink: 0 }}
            />
          </div>
        </div>

        {/* ── Steps block — 328 × 276 (40 left, 18 gap, 13 num↔text) ── */}
        <div
          style={{
            marginTop: 60,
            padding: '0 20px 0 40px',
            display: 'flex',
            flexDirection: 'column',
            gap: 18,
            boxSizing: 'border-box',
          }}
        >
          {STEPS.map((s, i) => (
            <div
              key={i}
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 13,
              }}
            >
              <span
                style={{
                  fontFamily: FONT,
                  fontWeight: 800,
                  fontSize: 20,
                  lineHeight: '24px',
                  color: '#FEAE00',
                  flexShrink: 0,
                  minWidth: 22,
                }}
              >
                {i + 1}/
              </span>
              <span
                style={{
                  fontFamily: FONT,
                  fontWeight: 700,
                  fontSize: 20,
                  lineHeight: '24px',
                  color: '#FFFFFF',
                  whiteSpace: 'pre-line',
                }}
              >
                {s}
              </span>
            </div>
          ))}
        </div>

      </div>

      {/* ── "Pick up the car" CTA — absolutely positioned per Figma spec
           Layout (user spec session 36):
             • Top:    1023 px from card start
             • Left:   34 px from section edge
             • Right:  33 px from section edge  (width = 360 − 34 − 33 = 293)
             • Height: fixed 45 px
             • Radius: 6 px
           Typography: Mazzard H Medium 14, uppercase, amber bg. ── */}
      <div
        style={{
          position: 'absolute',
          top: 1023,
          left: 34,
          right: 33,                              /* exact pixel per user spec */
          height: 45,
          zIndex: 3,
        }}
      >
        <Link
          to="/calculator"
          data-testid="mobile-pick-up-the-car"
          style={{
            width: '100%',
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: '#FEAE00',
            border: 'none',
            borderRadius: 6,
            color: '#000000',
            fontFamily: FONT,
            fontWeight: 500,
            fontSize: 14,
            lineHeight: '17px',
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
            textDecoration: 'none',
            boxSizing: 'border-box',
          }}
        >
          {L.pickUpTheCar}
        </Link>
      </div>

      {/* ── "Join our group" caption — 53 px BELOW the Pick-up-the-car
           button (button top = 1023, height 45 → text top = 1023+45+53 = 1121).
           Absolutely positioned so it sits AFTER the button per Figma. ── */}
      <div
        data-testid="mobile-join-our-group"
        style={{
          position: 'absolute',
          top: 1023 + 45 + 53,
          left: 0,
          right: 0,
          padding: '0 55px 0 57px',
          textAlign: 'center',
          fontFamily: FONT,
          fontWeight: 700,
          fontSize: 16,
          lineHeight: '22px',
          color: '#FFFFFF',
          zIndex: 3,
          boxSizing: 'border-box',
        }}
      >
        {isBg
          ? 'Присъединете се към нашата група и получете най-горещите оферти'
          : 'Join our group and get the hottest offers'}
      </div>

      {/* ── Viber icon — 42 × 42, exactly 16 px BELOW the caption.
           Caption (2 lines × 22 px = 44 px) → icon top = 1121 + 44 + 16 = 1181.
           After icon (42 px) → bottom of icon at 1181 + 42 = 1223.
           Section bottom = 1223 + 39 (bottom padding) = 1262 (matches Figma). ── */}
      <div
        data-testid="mobile-viber-icon"
        style={{
          position: 'absolute',
          top: 1023 + 45 + 53 + 44 + 16, // 1181
          left: 0,
          right: 0,
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 3,
        }}
      >
        <a
          href="viber://chat?number=%2B359875313158"
          aria-label="Join our Viber group"
          style={{
            width: 42,
            height: 42,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            textDecoration: 'none',
          }}
        >
          <img
            src="/figma/basil-viber-outline.svg"
            alt=""
            width={42}
            height={42}
            style={{ display: 'block' }}
          />
        </a>
      </div>

      {/* ── "from / USA/Korea" — absolutely positioned per Figma ──
           • Top:    412 px from card (section) start (user spec)
           • Left:    94 px from section edge (user spec)
           • Right:   87 px from section edge (user spec)
           • Content width = 360 − 94 − 87 = 179 px
           • "from"   Mazzard H Bold 14 px, #FEAE00, centered, sits directly
                      above USA/Korea.
           • "USA/Korea" Mazzard H Bold 32 px, #FFFFFF, centered.
           Rendered as a DIRECT child of the relative <section>, therefore
           `top` is measured from the section's padding-box top (= card top).
         ─────────────────────────────────────────────────────────── */}
      <div
        data-testid="mobile-from-usa-korea"
        style={{
          position: 'absolute',
          top: 436,                                /* 412 (initial) + 24 (user spec, session 36 follow-up) */
          left: 94,                                /* exact pixel per user spec */
          right: 87,                               /* exact pixel per user spec */
          zIndex: 2,
          pointerEvents: 'none',
        }}
      >
        <div
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: '100%',
            marginBottom: 2,
            fontFamily: FONT,
            fontWeight: 700,
            fontSize: 14,
            lineHeight: '17px',
            color: '#FEAE00',
            letterSpacing: '0.04em',
            textAlign: 'center',
          }}
        >
          {isBg ? 'от' : 'from'}
        </div>
        <h3
          style={{
            margin: 0,
            width: '100%',                         /* fill 179 px column → naturally centred */
            height: 38,
            fontFamily: FONT,
            fontWeight: 700,
            fontSize: 32,
            lineHeight: '38px',
            color: '#FFFFFF',
            letterSpacing: '-0.005em',
            textAlign: 'center',
            whiteSpace: 'nowrap',
          }}
        >
          {isBg ? 'САЩ/Корея' : 'USA/Korea'}
        </h3>
      </div>
    </section>
  );
}


/* ─────────────────────────────────────────────────────────────────────── */
/* MobileWeHavePerfectService                                              */
/*                                                                         */
/* Mobile adaptation of FrameComponent24 ("WE HAVE PERFECT SERVICE").      */
/* Reuses the exact same content (titles, subtitles, map-pin icon) and     */
/* typography family as the desktop version, but with the mobile geometry  */
/* given by Figma DevMode (card 360 × 901):                                */
/*                                                                         */
/*   • Card                       360 × 901, padding-top 59                */
/*   • Title block "We have perfect / service"                             */
/*       - 274 × 109, centred                                              */
/*       - "WE HAVE PERFECT SERVICE" — H Bold 24 px, #FEAE00, uppercase    */
/*       - "JUST A FEW STEPS / TO YOUR DREAM CAR" — H Medium 16 px, white  */
/*       - Side padding 43 / 43                                            */
/*   • 4 step blocks                                                       */
/*       - Each block 328 × 114.47                                         */
/*       - Map-pin icon (28 × 28, #FEAE00), centred above an orange        */
/*         hairline that spans the full width of the block                 */
/*       - Title text — H Bold 16 px, uppercase, white                     */
/*       - Subtitle  — H Medium 14 px, #FEAE00                             */
/*       - 16 px gap between map-pin/line and title                        */
/*       - 16 px gap between title and subtitle                            */
/*       - 48 px gap between each step block                               */
/* ─────────────────────────────────────────────────────────────────────── */

const PERFECT_SERVICE_STEPS = [
  {
    title: 'Choose your perfect car',
    subtitle: 'Find a vehicle that matches your style and budget',
  },
  {
    title: 'Pay quickly and effortlessly',
    subtitle: 'A simple, transparent process with no complications',
  },
  {
    title: 'Track your car\nin real time',
    subtitle: 'Stay updated on every step of the journey in your personal account',
  },
  {
    title: 'Get the keys and enjoy your new car',
    subtitle: 'Our manager will hand over the vehicle and take care of every detail',
  },
];

function MobileWeHavePerfectService() {
  const FONT = "'Mazzard', 'Mazzard H', system-ui, -apple-system, sans-serif";

  const { lang } = useLang();
  const isBg = (lang || 'en').toLowerCase().startsWith('bg');
  const L = isBg
    ? {
        title: 'Имаме перфектен сервиз',
        sub1: 'Само няколко стъпки',
        sub2: 'до автомобила на мечтите ви',
        steps: [
          {
            title: 'Изберете перфектния автомобил',
            subtitle: 'Намерете автомобил, който отговаря на вашия стил и бюджет',
          },
          {
            title: 'Платете бързо и без усилия',
            subtitle: 'Прост, прозрачен процес без усложнения',
          },
          {
            title: 'Проследявайте автомобила\nв реално време',
            subtitle: 'Бъдете в крак с всяка стъпка чрез личния си кабинет',
          },
          {
            title: 'Получете ключовете и се насладете\nна новия автомобил',
            subtitle: 'Нашият мениджър ще предаде автомобила и ще се погрижи за всеки детайл',
          },
        ],
      }
    : {
        title: 'We have perfect service',
        sub1: 'Just a few steps',
        sub2: 'to your dream car',
        steps: PERFECT_SERVICE_STEPS,
      };

  const STEPS = L.steps;
  return (
    <section
      data-testid="mobile-perfect-service"
      style={{
        position: 'relative',
        background: '#000000',
        width: '100%',
        minHeight: 901,
        paddingTop: 59,
        paddingBottom: 48,
        boxSizing: 'border-box',
        color: '#FFFFFF',
        fontFamily: FONT,
      }}
    >
      {/* ── Title block — 274 × 109, centred, 43 px side padding ── */}
      <div
        data-testid="mobile-perfect-service-title-block"
        style={{
          width: '100%',
          padding: '0 43px',
          boxSizing: 'border-box',
          textAlign: 'center',
        }}
      >
        <AnimatedHeading
          as="h2"
          text={L.title}
          style={{
            margin: 0,
            fontFamily: FONT,
            fontWeight: 700,
            fontSize: 24,
            lineHeight: '28px',
            letterSpacing: 0,
            textTransform: 'uppercase',
            color: '#FEAE00',
          }}
        />
        <div
          style={{
            marginTop: 16,
            fontFamily: FONT,
            fontWeight: 500,
            fontSize: 16,
            lineHeight: '20px',
            letterSpacing: 0,
            textTransform: 'uppercase',
            color: '#FFFFFF',
          }}
        >
          {L.sub1}
          <br />
          {L.sub2}
        </div>
      </div>

      {/* ── 4 step blocks — 328 × 114.47, 48 px gap between ── */}
      <div
        data-testid="mobile-perfect-service-steps"
        style={{
          marginTop: 59,
          display: 'flex',
          flexDirection: 'column',
          gap: 48,
          alignItems: 'center',
        }}
      >
        {STEPS.map((step, i) => (
          <div
            key={i}
            data-testid={`mobile-perfect-service-step-${i + 1}`}
            style={{
              width: 328,
              maxWidth: 'calc(100% - 32px)',
              boxSizing: 'border-box',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              textAlign: 'center',
            }}
          >
            {/* Map-pin — exact Figma asset (Vector.svg) with native dimensions
                18.27 × 23.31 px. The cut-out hole is already baked into the
                SVG (fill-rule="evenodd"), so it stays the proper Figma size
                without any additional overlay. */}
            <img
              src="/figma/pin-vector.svg"
              alt=""
              width={18.27}
              height={23.31}
              style={{
                display: 'block',
                width: 18.27,
                height: 23.31,
                marginBottom: 4,
                flexShrink: 0,
              }}
              aria-hidden="true"
            />

            {/* Horizontal hairline — full width of the 328-px block */}
            <div
              aria-hidden="true"
              style={{
                width: '100%',
                height: 1,
                background: '#FEAE00',
              }}
            />

            {/* Title — Bold 16, white, uppercase. 16 px below the hairline. */}
            <h3
              style={{
                margin: '16px 0 0 0',
                fontFamily: FONT,
                fontWeight: 700,
                fontSize: 16,
                lineHeight: '20px',
                letterSpacing: 0,
                textTransform: 'uppercase',
                color: '#FFFFFF',
                whiteSpace: 'pre-line',
              }}
            >
              {step.title}
            </h3>

            {/* Subtitle — Medium 14, amber. 16 px below the title. */}
            <p
              style={{
                margin: '16px 0 0 0',
                fontFamily: FONT,
                fontWeight: 500,
                fontSize: 14,
                lineHeight: '18px',
                letterSpacing: 0,
                color: '#FEAE00',
              }}
            >
              {step.subtitle}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}


/* ─────────────────────────────────────────────────────────────────────── */
/* MobileTurnkeyServices                                                   */
/*                                                                         */
/* Yellow 8-card services list — sits AFTER MobileWeHavePerfectService     */
/* (after the "GET THE KEYS AND ENJOY YOUR NEW CAR" map-pin step) and      */
/* BEFORE the "Want to drive your dream car?" CTA.                         */
/*                                                                         */
/* Per Figma DevMode (Frame 1707479342) — yellow block 331 × 1142:         */
/*   • 8 cards, all 331 wide (we render full-width inside 16 px side pads) */
/*   • Card heights are content-driven (Hug):                              */
/*       151 / 136 / 153 / 134 / 117 / 117 / 134 / 151                     */
/*   • Inter-card gap:           7 px                                      */
/*   • Internal card padding:    24 (top) / 24 (bottom) / 10 (left) / 10 (right) */
/*   • Numerals "/N"             — Mazzard H Medium 24, black              */
/*   • Section title             — Mazzard H Medium 16, black, uppercase   */
/*   • Body                      — Mazzard H Regular 14, black             */
/* ─────────────────────────────────────────────────────────────────────── */
function MobileTurnkeyServices() {
  const FONT = "'Mazzard H', 'Mazzard', system-ui, -apple-system, sans-serif";
  const listRef = useRef(null);

  /* ─────────────────────────────────────────────────────────────────────
   * Mobile parallax for the 8 turnkey-service cards.
   *
   * Mobile mirrors the desktop philosophy: the grid is rock-steady at
   * rest, and the depth effect only fires while the user is actively
   * interacting with a card. On a touch device "interaction" means a
   * finger pressed on a card — we use pointer/touch events to drive a
   * 3D tilt, a soft lift, and a small parallax of the title/body text
   * inside the pressed card. All other cards stay still.
   *
   * Additionally, a one-shot IntersectionObserver triggers a staggered
   * fade-in the first time the list scrolls into view — a clean reveal
   * that doubles as the introduction of the depth layer.
   *
   * Everything is driven via CSS variables / class toggles so React
   * never re-renders during the live interaction — keeps the animation
   * pegged to 60 fps even on older phones.
   * ─────────────────────────────────────────────────────────────────── */
  useEffect(() => {
    const root = listRef.current;
    if (!root) return;
    const reduceMotion = window.matchMedia?.(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const cards = Array.from(
      root.querySelectorAll('[data-testid^="mobile-turnkey-service-card-"]'),
    );
    if (cards.length === 0) return;

    cards.forEach((card, i) => {
      card.classList.add("mts-card");
      card.style.setProperty("--mts-stagger", String(i));
    });

    // ── One-shot stagger fade-in ─────────────────────────────────────
    if (!reduceMotion && typeof IntersectionObserver !== "undefined") {
      const io = new IntersectionObserver(
        (entries) => {
          entries.forEach((e) => {
            if (e.isIntersecting) {
              e.target.classList.add("mts-entered");
              io.unobserve(e.target);
            }
          });
        },
        { threshold: 0.18, rootMargin: "0px 0px -8% 0px" },
      );
      cards.forEach((c) => io.observe(c));
      root.__mtsIo = io;
    } else {
      cards.forEach((c) => c.classList.add("mts-entered"));
    }

    if (reduceMotion) return undefined;

    // ── Live touch-driven 3D tilt on the pressed card ────────────────
    const handlers = [];
    cards.forEach((card) => {
      let raf = 0;
      let cx = 0;
      let cy = 0;
      const apply = () => {
        raf = 0;
        card.style.setProperty("--mts-cx", cx.toFixed(4));
        card.style.setProperty("--mts-cy", cy.toFixed(4));
      };
      const press = (e) => {
        const point = e.touches?.[0] ?? e;
        const rect = card.getBoundingClientRect();
        cx = (point.clientX - rect.left) / rect.width - 0.5;
        cy = (point.clientY - rect.top) / rect.height - 0.5;
        card.classList.add("mts-pressed");
        if (!raf) raf = requestAnimationFrame(apply);
      };
      const move = (e) => {
        const point = e.touches?.[0] ?? e;
        const rect = card.getBoundingClientRect();
        cx = (point.clientX - rect.left) / rect.width - 0.5;
        cy = (point.clientY - rect.top) / rect.height - 0.5;
        if (!raf) raf = requestAnimationFrame(apply);
      };
      const release = () => {
        card.classList.remove("mts-pressed");
        cx = 0;
        cy = 0;
        if (!raf) raf = requestAnimationFrame(apply);
      };
      card.addEventListener("touchstart", press, { passive: true });
      card.addEventListener("touchmove", move, { passive: true });
      card.addEventListener("touchend", release, { passive: true });
      card.addEventListener("touchcancel", release, { passive: true });
      // Pointer events as a fallback (covers tap with stylus / hybrid devices)
      card.addEventListener("pointerdown", press);
      card.addEventListener("pointermove", (e) => {
        // Only track when the pointer is held down
        if (e.pressure > 0 || e.buttons > 0) move(e);
      });
      card.addEventListener("pointerup", release);
      card.addEventListener("pointercancel", release);
      card.addEventListener("pointerleave", release);
      handlers.push({ card, press, move, release });
    });

    return () => {
      if (root.__mtsIo) {
        root.__mtsIo.disconnect();
        delete root.__mtsIo;
      }
      handlers.forEach(({ card, press, move, release }) => {
        card.removeEventListener("touchstart", press);
        card.removeEventListener("touchmove", move);
        card.removeEventListener("touchend", release);
        card.removeEventListener("touchcancel", release);
        card.removeEventListener("pointerdown", press);
        card.removeEventListener("pointerup", release);
        card.removeEventListener("pointercancel", release);
        card.removeEventListener("pointerleave", release);
      });
    };
  }, []);

  const { lang } = useLang();
  const isBg = (lang || 'en').toLowerCase().startsWith('bg');

  const CARDS = isBg
    ? [
        {
          num: '1',
          title: 'ВНОС',
          body:
            'Помагаме ви да намерите подходящия автомобил според вашия бюджет, стил и нужди — поемаме инспекцията, покупката и доставката от САЩ до България.',
        },
        {
          num: '2',
          title: 'АДАПТАЦИЯ КЪМ ЕВРОПЕЙСКИТЕ СТАНДАРТИ',
          body:
            'Адаптираме автомобила към стандартите на ЕС и гарантираме, че е готов за безпроблемна регистрация.',
        },
        {
          num: '3',
          title: 'РЕГИСТРАЦИЯ И СЕРТИФИКАЦИЯ',
          body:
            'Поемаме пълната регистрация в България, включително КАТ, документи и транзитни номера — подкрепяме ви на всяка стъпка.',
        },
        {
          num: '4',
          title: 'ФИНАНСИРАНЕ',
          body:
            'Свързваме ви с TBI Bank и UniCredit Bulbank и ви водим през процеса на финансиране.',
        },
        {
          num: '5',
          title: 'НАМИРАНЕ И ДОСТАВКА НА ЧАСТИ',
          body:
            'Намираме и поръчваме качествени части от САЩ, помагайки ви да спестите без компромиси.',
        },
        {
          num: '6',
          title: 'АВТО СЕРВИЗ',
          body:
            'Поемаме всички ремонти и техническа работа чрез доверен партньорски сервиз.',
        },
        {
          num: '7',
          title: 'ДЕТАЙЛИНГ И ПОЧИСТВАНЕ',
          body:
            'Предлагаме професионално почистване и възстановяване на интериор и екстериор. Правим автомобила ви като нов.',
        },
        {
          num: '8',
          title: 'ДОСТАВКА ДО ДОМА',
          body:
            'Организираме доставката на автомобила до всеки град в България. Получавате готов за карaне автомобил направо пред дома си — без усложнения, без излишни пътувания.',
        },
      ]
    : [
    {
      num: '1',
      title: 'IMPORT',
      body:
        'We help you find the right car based on your budget, style, and needs - handling the inspection, purchase, and delivery from the USA to Bulgaria.',
    },
    {
      num: '2',
      title: 'ADAPTATION TO EUROPEAN STANDARDST',
      body:
        "We adapt the vehicle to EU standards and ensure it's ready for smooth registration.",
    },
    {
      num: '3',
      title: 'REGISTRATION AND CERTIFICATION',
      body:
        'We handle full registration in Bulgaria, including KAT, documents, and transit plates - supporting you every step.',
    },
    {
      num: '4',
      title: 'FINANCING',
      body:
        'We connect you with TBI Bank and UniCredit Bulbank and guide you through the financing process.',
    },
    {
      num: '5',
      title: 'PARTS SOURCING AND DELIVERY',
      body:
        'We source and order quality parts from the USA, helping you save without compromise.',
    },
    {
      num: '6',
      title: 'AUTO SERVICE',
      body:
        'We handle all repairs and technical work through a trusted partner service.',
    },
    {
      num: '7',
      title: 'DETAILING AND CLEANING',
      body:
        'We provide professional cleaning and restoration of both exterior and interior. We make your car look and feel like new..',
    },
    {
      num: '8',
      title: 'HOME DELIVERY',
      body:
        'We arrange delivery of your vehicle to any city in Bulgaria. You receive a ready-to-drive car right at your doorstep — no hassle, no extra trips.',
    },
  ];

  return (
    <section
      data-testid="mobile-turnkey-services"
      style={{
        width: '100%',
        background: '#000000',
        padding: '0 12px',                        /* user spec: 12 L/R on welcome mobile */
        boxSizing: 'border-box',
        fontFamily: FONT,
      }}
    >
      {/* Scoped styles for the mobile parallax. Kept inline so the section
          stays self-contained — no CSS module changes required. */}
      <style>{`
        .mts-card {
          /* Establish the 3D context for the title/body to float inside. */
          --mts-cx: 0;
          --mts-cy: 0;
          --mts-stagger: 0;
          --mts-tilt: 0;
          --mts-lift: 0;
          position: relative;
          transform-style: preserve-3d;
          will-change: transform, box-shadow;

          /* Pre-entry state — invisible + a tiny lift. */
          opacity: 0;
          transform: translate3d(0, 12px, 0);
          transition:
            transform 620ms cubic-bezier(0.16, 1, 0.3, 1),
            opacity 540ms cubic-bezier(0.22, 0.61, 0.36, 1),
            box-shadow 380ms cubic-bezier(0.16, 1, 0.3, 1);
          transition-delay: calc(var(--mts-stagger) * 60ms);
        }
        .mts-card.mts-entered {
          opacity: 1;
          transform:
            translate3d(0, calc(var(--mts-lift) * 1px), calc(var(--mts-lift) * 1px))
            rotateX(calc(var(--mts-cy) * var(--mts-tilt) * -1deg))
            rotateY(calc(var(--mts-cx) * var(--mts-tilt) * 1deg));
        }
        /* Pressed: the card tilts + lifts as a single rigid surface.
           Inner content (title, body) stays put — no parallax-inside-
           parallax. Tuned for clear visibility without overlapping the
           neighbouring cards: 6° tilt, 14 px Z lift, 1.015 scale. */
        .mts-card.mts-pressed {
          --mts-tilt: 6;
          --mts-lift: -4;
          z-index: 2;
          transition:
            transform 300ms cubic-bezier(0.22, 1, 0.36, 1),
            box-shadow 240ms cubic-bezier(0.22, 1, 0.36, 1);
          transform:
            translate3d(0, calc(var(--mts-lift) * 1px), 14px)
            rotateX(calc(var(--mts-cy) * var(--mts-tilt) * -1deg))
            rotateY(calc(var(--mts-cx) * var(--mts-tilt) * 1deg))
            scale(1.015);
          box-shadow:
            0 20px 34px -16px rgba(0, 0, 0, 0.45),
            0 8px 16px -10px rgba(0, 0, 0, 0.32);
        }
        @media (prefers-reduced-motion: reduce) {
          .mts-card,
          .mts-card * {
            opacity: 1 !important;
            transform: none !important;
            transition: none !important;
          }
        }
      `}</style>
      <div
        ref={listRef}
        data-testid="mobile-turnkey-services-list"
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 7,
          /* Single perspective shared by all 8 cards so they tilt toward
             a consistent vanishing point. 900 px makes the tilt clearly
             readable on a phone screen. */
          perspective: '900px',
          perspectiveOrigin: '50% 50%',
        }}
      >
        {CARDS.map((c, i) => (
          <div
            key={c.num}
            data-testid={`mobile-turnkey-service-card-${c.num}`}
            style={{
              background: '#FEAE00',
              padding: '24px 10px',
              boxSizing: 'border-box',
              color: '#000000',
            }}
          >
            {/* Header row: "/N" + TITLE */}
            <div
              className="mts-head"
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 16,
              }}
            >
              <span
                style={{
                  flex: '0 0 auto',
                  fontFamily: "'Mazzard H', 'Mazzard', system-ui, sans-serif",
                  fontWeight: 500,
                  fontSize: 24,
                  lineHeight: '28px',
                  height: 28,
                  display: 'inline-flex',
                  alignItems: 'center',
                  letterSpacing: 0,
                  color: '#000000',
                  whiteSpace: 'nowrap',
                }}
              >
                /{c.num}
              </span>
              <h3
                style={{
                  flex: '1 1 auto',
                  margin: 0,
                  alignSelf: 'center',
                  fontFamily: "'Mazzard H', 'Mazzard', system-ui, sans-serif",
                  fontWeight: 500,
                  fontSize: 16,
                  lineHeight: '20px',
                  letterSpacing: 0,
                  textTransform: 'uppercase',
                  color: '#000000',
                }}
              >
                {c.title}
              </h3>
            </div>

            {/* Body */}
            <p
              className="mts-body"
              data-testid={`mobile-turnkey-service-body-${c.num}`}
              style={{
                margin: '16px 0 0 0',
                fontFamily: "'Mazzard H', 'Mazzard', system-ui, sans-serif",
                fontWeight: 400,
                fontSize: 14,
                lineHeight: '18px',
                letterSpacing: 0,
                color: '#000000',
              }}
            >
              {c.body}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}


/* ─────────────────────────────────────────────────────────────────────── */
/* MobileBeforeAndAfter                                                    */
/*                                                                         */
/* Horizontal-scroll carousel that replaces the old "Before & After" block */
/* on the mobile homepage. Sits AFTER `MobileTurnkeyServices` (8 yellow    */
/* service cards) and BEFORE the "Want to drive your dream car?" CTA.      */
/*                                                                         */
/* Figma DevMode (mobile, 360 wide):                                       */
/*   • Section background           — #000000                              */
/*   • Title "BEFORE AND AFTER"     — Mazzard H Bold 24, #FEAE00           */
/*   • Subtitle line 1 "OUR ..."    — Mazzard H Medium 16, #FEAE00         */
/*   • Subtitle line 2 "THE BEST .."— Mazzard H Medium 16, #FFFFFF         */
/*   • Title → subtitle gap         — 24 px                                */
/*   • Subtitle → card gap          — 32 px                                */
/*   • Card                         — 328 × 317, #1A1A1A, side insets 16 px*/
/*       — /before                  — H Medium 12, white  , inset-L 62.5  */
/*       — /after                   — H Medium 12, #FEAE00, inset-R 61.5  */
/*       — Photos (before / after)  — 150 × 144 each, 8 px gap            */
/*       — Model "BMV 328"          — H Bold 16, white                    */
/*       — Order date / finished / Turnkey price — H Regular 12          */
/*       — Price value              — H Regular 12 #FEAE00                */
/*   • Card → pagination gap        — 24 px                                */
/*   • Pagination row               — insets 116 (left) / 115 (right)      */
/*       — Arrow circle             — 36 × 36                              */
/*       — "01/10" counter          — H Medium 12, white                   */
/*       — Arrows ↔ counter gap     — 24 px                                */
/* ─────────────────────────────────────────────────────────────────────── */
function MobileBeforeAndAfter({ items, activeIdx, setActiveIdx, t }) {
  const FONT = "'Mazzard H', 'Mazzard', system-ui, -apple-system, sans-serif";

  // Real data ONLY — fed straight from /api/site-info → before_after.items.
  // No demo fallbacks: the section won't render until the API responds with
  // at least one card, which keeps the carousel's count honest.
  const list = Array.isArray(items)
    ? items.filter((c) => c && c.enabled !== false)
    : [];
  const total = list.length;

  // Active index is clamped to the real list length so the counter (e.g.
  // 03/03) always matches what's actually scrollable.
  const idx = total > 0 ? Math.min(Math.max(0, activeIdx || 0), total - 1) : 0;
  const counter =
    total > 0
      ? `${String(idx + 1).padStart(2, '0')}/${String(total).padStart(2, '0')}`
      : '00/00';

  const trackRef = useRef(null);

  // Programmatic scroll to the active card — used ONLY by the prev/next
  // arrow buttons. We intentionally do NOT mirror this from an effect on
  // `idx`, because that would fight against native scroll-snap during a
  // user swipe (the JS scroll would yank the user back to the previous
  // card mid-gesture). Manual swipes rely on scroll-snap + IO sticky 70 %
  // to update the counter; arrows call this directly.
  //
  // NOTE: the track contains a leading `<style>` tag (for CSS hover rules)
  // so we MUST resolve the target card via the `data-card-idx` attribute
  // rather than `track.children[i]` — otherwise idx=0 would point at the
  // `<style>` node whose offsetLeft is 0, scrolling the track back to the
  // beginning and clobbering the user's swipe.
  const scrollToIdx = (targetIdx) => {
    const track = trackRef.current;
    if (!track) return;
    const card = track.querySelector(`[data-card-idx="${targetIdx}"]`);
    if (!card) return;
    const left = card.offsetLeft - (track.clientWidth - card.offsetWidth) / 2;
    track.scrollTo({ left, behavior: 'smooth' });
  };

  // ── Active-card detection: "STICKY 70 %"
  //
  // Rule (as agreed with the client):
  //   • While the currently-active card is still ≥ 70 % visible → counter
  //     stays the same. This guarantees that while two cards are partially
  //     visible mid-swipe the number does NOT flicker.
  //   • Only when the active card drops below 70 % AND a different card has
  //     reached ≥ 70 % visibility, the counter flips to that other card.
  //
  // We keep `idxRef` so the IO callback always reads the *latest* active
  // index instead of the stale value captured in closure.
  const idxRef = useRef(idx);
  useEffect(() => { idxRef.current = idx; }, [idx]);

  useEffect(() => {
    const track = trackRef.current;
    if (!track || total === 0) return;
    if (typeof IntersectionObserver === 'undefined') return;

    const ratios = new Map();
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          const cardIdx = Number(e.target.getAttribute('data-card-idx'));
          ratios.set(cardIdx, e.intersectionRatio);
        });

        const cur = idxRef.current;
        // Sticky: if current card is still ≥ 70 % visible — don't switch.
        if ((ratios.get(cur) || 0) >= 0.7) return;

        // Otherwise pick the most visible card — but only if it crosses
        // the 70 % threshold (else stay put).
        let bestI = -1;
        let bestR = 0.7;
        ratios.forEach((r, i) => {
          if (r > bestR) { bestR = r; bestI = i; }
        });
        if (bestI >= 0 && bestI !== cur) setActiveIdx(bestI);
      },
      {
        root: track,
        threshold: [0, 0.3, 0.5, 0.7, 0.85, 1],
      },
    );

    const cards = Array.from(track.children).filter(
      (n) => n.nodeType === 1 && n.hasAttribute && n.hasAttribute('data-card-idx'),
    );
    cards.forEach((c) => observer.observe(c));
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [total]);

  const prev = () => {
    if (total <= 0) return;
    const ni = (idx - 1 + total) % total;
    setActiveIdx(ni);
    scrollToIdx(ni);
  };
  const next = () => {
    if (total <= 0) return;
    const ni = (idx + 1) % total;
    setActiveIdx(ni);
    scrollToIdx(ni);
  };

  // Resolve a media URL coming from the backend payload.
  //   • absolute http(s)     → use as-is
  //   • /figma/*  /mobile/*  → frontend public asset (served by CRA)
  //   • other /api or relative paths → prefix the backend API origin
  //
  // We also rewrite the legacy `.png` extension used in old seeds to `.webp`
  // because the actual files shipped under /public/figma are webp-encoded.
  // This keeps any historical/in-flight data working without a DB migration.
  const fullMediaUrl = (u) => {
    if (!u) return '';
    let v = u;
    if (v.startsWith('/figma/') && v.toLowerCase().endsWith('.png')) {
      v = v.slice(0, -4) + '.webp';
    }
    if (/^https?:\/\//i.test(v)) return v;
    if (v.startsWith('/figma/') || v.startsWith('/mobile/')) return v;
    if (v.startsWith('/')) return `${API}${v}`;
    return `${API}/${v}`;
  };

  // Don't render the section at all when there's no data — better UX than
  // showing an empty carousel with broken counter.
  if (total === 0) return null;

  return (
    <section
      data-testid="mobile-before-and-after"
      style={{
        width: '100%',
        background: '#000000',
        fontFamily: FONT,
        // Top spacing keeps a clean 40 px breathing room from the last Turnkey
        // card (#8 HOME DELIVERY) and a 40 px gap to the Dream-car CTA below.
        padding: '40px 0',
        boxSizing: 'border-box',
      }}
    >
      {/* ── Section title ───────────────────────────────────────────────── */}
      <AnimatedHeading
        as="h2"
        data-testid="mobile-before-and-after-title"
        text={t?.beforeAndAfter || "Before and after"}
        style={{
          margin: '0 12px',                       /* user spec: 12 L/R on welcome mobile */
          fontFamily: FONT,
          fontWeight: 700,
          fontSize: 24,
          lineHeight: '28px',
          textAlign: 'center',
          textTransform: 'uppercase',
          color: '#FEAE00',
          letterSpacing: 0,
        }}
      />

      {/* ── Subtitle (orange + white) ───────────────────────────────────── */}
      <div
        data-testid="mobile-before-and-after-subtitle"
        style={{
          margin: '24px 12px 0',                  /* user spec: 12 L/R on welcome mobile */
          fontFamily: FONT,
          fontWeight: 500,
          fontSize: 16,
          lineHeight: '20px',
          textAlign: 'center',
          textTransform: 'uppercase',
          letterSpacing: 0,
        }}
      >
        <span style={{ color: '#FEAE00' }}>{t?.ourClientsReceive || 'Our clients receive'}</span>
        <br />
        <span style={{ color: '#FFFFFF' }}>{t?.theBestService || 'the best service'}</span>
      </div>

      {/* ── Cards track (horizontal scroll + snap) ──────────────────────── */}
      <div
        ref={trackRef}
        data-testid="mobile-before-and-after-track"
        style={{
          marginTop: 32,
          display: 'flex',
          gap: 16,
          overflowX: 'auto',
          overflowY: 'hidden',
          scrollSnapType: 'x mandatory',
          WebkitOverflowScrolling: 'touch',
          touchAction: 'pan-x',
          overscrollBehaviorX: 'contain',
          /* user spec: 12 L/R on welcome mobile (peek of next card preserved) */
          paddingLeft: 12,
          paddingRight: 12,
          scrollbarWidth: 'none',
          cursor: 'grab',
        }}
      >
        <style>{`
          [data-testid="mobile-before-and-after-track"]::-webkit-scrollbar { display: none; }
        `}</style>

        {list.map((c, i) => (
          <article
            key={c.id || i}
            data-card-idx={i}
            data-testid={`mobile-before-and-after-card-${i + 1}`}
            style={{
              flex: '0 0 auto',
              width: 328,
              height: 317,
              boxSizing: 'border-box',
              background: '#1A1A1A',
              scrollSnapAlign: 'center',
              position: 'relative',
              padding: '16px 10px 18px',
              display: 'flex',
              flexDirection: 'column',
              color: '#FFFFFF',
            }}
          >
            {/* /before /after labels — absolute, exact insets per Figma */}
            <span
              style={{
                position: 'absolute',
                top: 16,
                left: 62.5,
                fontFamily: FONT,
                fontWeight: 500,
                fontSize: 12,
                lineHeight: '14px',
                color: '#FFFFFF',
                whiteSpace: 'nowrap',
              }}
            >
              / before
            </span>
            <span
              style={{
                position: 'absolute',
                top: 16,
                right: 61.5,
                fontFamily: FONT,
                fontWeight: 500,
                fontSize: 12,
                lineHeight: '14px',
                color: '#FEAE00',
                whiteSpace: 'nowrap',
              }}
            >
              / after
            </span>

            {/* Photos row — 150 × 144 each */}
            <div
              style={{
                marginTop: 22, // 16 (top inset) + 14 (label line) − ~8 visual
                display: 'flex',
                gap: 8,
                justifyContent: 'center',
              }}
            >
              <img
                src={optimizeImage(fullMediaUrl(c.before_image_url), ImageSize.beforeAfter)}
                alt="before"
                data-testid={`mobile-before-img-${i + 1}`}
                style={{
                  width: 150,
                  height: 144,
                  objectFit: 'cover',
                  filter: 'grayscale(1)',
                  display: 'block',
                }}
                loading="lazy"
                decoding="async"
                onError={(e) => { e.currentTarget.style.opacity = 0.3; }}
              />
              <img
                src={optimizeImage(fullMediaUrl(c.after_image_url), ImageSize.beforeAfter)}
                alt="after"
                data-testid={`mobile-after-img-${i + 1}`}
                style={{
                  width: 150,
                  height: 144,
                  objectFit: 'cover',
                  display: 'block',
                }}
                loading="lazy"
                decoding="async"
                onError={(e) => { e.currentTarget.style.opacity = 0.3; }}
              />
            </div>

            {/* Model title (BMV 328) */}
            <h3
              data-testid={`mobile-before-and-after-model-${i + 1}`}
              style={{
                margin: '14px 10px 0',
                fontFamily: FONT,
                fontWeight: 700,
                fontSize: 16,
                lineHeight: '20px',
                color: '#FFFFFF',
                letterSpacing: 0,
              }}
            >
              {c.model || 'BMV 328'}
            </h3>

            {/* Info rows — labels: H Regular 12 / gray;  values: H Medium 14 / white */}
            <dl
              style={{
                margin: '12px 10px 0',
                padding: 0,
                display: 'grid',
                gridTemplateColumns: '1fr auto',
                rowGap: 8,
                columnGap: 12,
                fontFamily: FONT,
                letterSpacing: 0,
              }}
            >
              <dt
                style={{
                  margin: 0,
                  fontFamily: FONT,
                  fontWeight: 400,
                  fontSize: 12,
                  lineHeight: '16px',
                  color: '#9B9B9B',
                }}
              >
                Order date
              </dt>
              <dd
                data-testid={`mobile-before-and-after-order-${i + 1}`}
                style={{
                  margin: 0,
                  textAlign: 'right',
                  fontFamily: FONT,
                  fontWeight: 500,
                  fontSize: 14,
                  lineHeight: '18px',
                  color: '#FFFFFF',
                }}
              >
                {c.order_date || ''}
              </dd>

              <dt
                style={{
                  margin: 0,
                  fontFamily: FONT,
                  fontWeight: 400,
                  fontSize: 12,
                  lineHeight: '16px',
                  color: '#9B9B9B',
                }}
              >
                The date of the finished car
              </dt>
              <dd
                data-testid={`mobile-before-and-after-finished-${i + 1}`}
                style={{
                  margin: 0,
                  textAlign: 'right',
                  fontFamily: FONT,
                  fontWeight: 500,
                  fontSize: 14,
                  lineHeight: '18px',
                  color: '#FFFFFF',
                }}
              >
                {c.finished_date || ''}
              </dd>

              <dt
                style={{
                  margin: 0,
                  fontFamily: FONT,
                  fontWeight: 400,
                  fontSize: 12,
                  lineHeight: '16px',
                  color: '#9B9B9B',
                }}
              >
                Turnkey price in Bulgaria
              </dt>
              <dd
                data-testid={`mobile-before-and-after-price-${i + 1}`}
                style={{
                  margin: 0,
                  textAlign: 'right',
                  fontFamily: FONT,
                  fontWeight: 500,
                  fontSize: 14,
                  lineHeight: '18px',
                  color: '#FFFFFF',
                }}
              >
                {c.price || ''}
              </dd>
            </dl>
          </article>
        ))}
      </div>

      {/* ── Pagination row: ← 01/10 → ──────────────────────────────────── */}
      <div
        data-testid="mobile-before-and-after-pagination"
        style={{
          marginTop: 24,
          // Side insets 116 / 115 centre the 36 + 24 + ~44 + 24 + 36 = 164 px
          // pagination block inside a 396 px target row. On a 360-wide screen
          // we clamp this to a sensible 0-edge fallback so it stays visible.
          padding: '0 max(0px, calc((100% - 360px) / 2))',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 24,
        }}
      >
        <button
          type="button"
          aria-label="Previous"
          onClick={prev}
          data-testid="mobile-before-and-after-prev"
          style={{
            width: 40,
            height: 40,
            borderRadius: '50%',
            border: '1.5px solid #FEAE00',
            background: 'transparent',
            color: '#FEAE00',
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 0,
            lineHeight: 1,
          }}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M15 4l-8 8 8 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>

        <span
          data-testid="mobile-before-and-after-counter"
          style={{
            fontFamily: FONT,
            fontWeight: 500,
            fontSize: 12,
            lineHeight: '16px',
            color: '#FFFFFF',
            letterSpacing: 0,
            minWidth: 44,
            textAlign: 'center',
          }}
        >
          {counter}
        </span>

        <button
          type="button"
          aria-label="Next"
          onClick={next}
          data-testid="mobile-before-and-after-next"
          className="bibi-swipe-hint"
          style={{
            width: 40,
            height: 40,
            borderRadius: '50%',
            border: 'none',
            background: '#FEAE00',
            color: '#000000',
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 0,
            lineHeight: 1,
          }}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M9 4l8 8-8 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>
    </section>
  );
}

/* ─────────────────────────────────────────────────────────────────────── */
/* MobileOurClientsSay                                                     */
/*                                                                         */
/* Reviews block on the mobile homepage. Sits AFTER `MobileBeforeAndAfter` */
/* and BEFORE the "Want to drive your dream car?" CTA. Built from the      */
/* same `/api/site-info` payload that drives the desktop block:            */
/*   • reviews.items[]   — list of customer reviews                        */
/*   • reviews.google_rating         — e.g. 4.9                            */
/*   • reviews.google_reviews_count  — e.g. 31                             */
/*                                                                         */
/* Section frame: 361 × 815 (mobile Figma).                                */
/* Carousel uses the SAME IntersectionObserver + dominance ≥ 55% logic     */
/* as the Before / After block so the counter is honest and stable.        */
/* ─────────────────────────────────────────────────────────────────────── */
function MobileOurClientsSay({ reviews, googleRating, googleReviewsCount, activeIdx, setActiveIdx, t }) {
  const FONT = "'Mazzard H', 'Mazzard', system-ui, -apple-system, sans-serif";

  const list = Array.isArray(reviews) ? reviews : [];
  const total = list.length;
  const idx = total > 0 ? Math.min(Math.max(0, activeIdx || 0), total - 1) : 0;
  const counter =
    total > 0
      ? `${String(idx + 1).padStart(2, '0')}/${String(total).padStart(2, '0')}`
      : '00/00';

  const trackRef = useRef(null);

  // Programmatic scroll — ONLY used by the arrow buttons. Mirroring this
  // from an effect on `idx` would fight against scroll-snap during a user
  // swipe (the JS scroll would yank the user back). Manual swipes rely on
  // scroll-snap + IO sticky 70 % to update the counter; arrows call this
  // directly.
  //
  // NOTE: the track contains a leading `<style>` tag (for CSS hover rules)
  // so we MUST resolve the target via the `data-card-idx` attribute, not
  // via `track.children[i]` — otherwise idx=0 would map to the `<style>`
  // node and snap the carousel back to scrollLeft=0, clobbering the user.
  const scrollToIdx = (targetIdx) => {
    const track = trackRef.current;
    if (!track) return;
    const card = track.querySelector(`[data-card-idx="${targetIdx}"]`);
    if (!card) return;
    const left = card.offsetLeft - (track.clientWidth - card.offsetWidth) / 2;
    track.scrollTo({ left, behavior: 'smooth' });
  };

  // Dominant-card detection — STICKY 70 %: counter stays on the current
  // card while it's ≥ 70 % visible, and only flips when a DIFFERENT card
  // crosses ≥ 70 % visibility (identical rule to the Before / After block).
  const idxRef = useRef(idx);
  useEffect(() => { idxRef.current = idx; }, [idx]);

  useEffect(() => {
    const track = trackRef.current;
    if (!track || total === 0) return;
    if (typeof IntersectionObserver === 'undefined') return;

    const ratios = new Map();
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          const ci = Number(e.target.getAttribute('data-card-idx'));
          ratios.set(ci, e.intersectionRatio);
        });
        const cur = idxRef.current;
        if ((ratios.get(cur) || 0) >= 0.7) return;
        let bestI = -1;
        let bestR = 0.7;
        ratios.forEach((r, i) => { if (r > bestR) { bestR = r; bestI = i; } });
        if (bestI >= 0 && bestI !== cur) setActiveIdx(bestI);
      },
      { root: track, threshold: [0, 0.3, 0.5, 0.7, 0.85, 1] },
    );

    const cards = Array.from(track.children).filter(
      (n) => n.nodeType === 1 && n.hasAttribute && n.hasAttribute('data-card-idx'),
    );
    cards.forEach((c) => observer.observe(c));
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [total]);

  const prev = () => {
    if (total <= 0) return;
    const ni = (idx - 1 + total) % total;
    setActiveIdx(ni);
    scrollToIdx(ni);
  };
  const next = () => {
    if (total <= 0) return;
    const ni = (idx + 1) % total;
    setActiveIdx(ni);
    scrollToIdx(ni);
  };

  // ── 5 yellow stars used in the Google rating block (80 × 16 block) ───
  const Star = ({ size = 16 }) => (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true">
      <path
        d="M8 1.2l2.06 4.18 4.61.67-3.34 3.26.79 4.6L8 11.74l-4.12 2.17.79-4.6L1.33 6.05l4.61-.67L8 1.2z"
        fill="#FEAE00"
      />
    </svg>
  );

  // Resolve avatar image (backend-served / public / absolute http(s) URLs).
  const fullMediaUrl = (u) => {
    if (!u) return '';
    if (/^https?:\/\//i.test(u)) return u;
    if (u.startsWith('/figma/') || u.startsWith('/mobile/')) return u;
    if (u.startsWith('/')) return `${API}${u}`;
    return `${API}/${u}`;
  };

  return (
    <section
      data-testid="mobile-our-clients-say"
      style={{
        width: '100%',
        background: '#000000',
        fontFamily: FONT,
        padding: '73px 0 40px',
        boxSizing: 'border-box',
      }}
    >
      {/* ── Section title "OUR CLIENTS SAY" (centered, 76 px side insets) */}
      <AnimatedHeading
        as="h2"
        data-testid="mobile-our-clients-say-title"
        text={t?.ourClientsSay || "Our clients say"}
        style={{
          margin: '0 76px',
          fontFamily: FONT,
          fontWeight: 700,
          fontSize: 24,
          lineHeight: '28px',
          textAlign: 'center',
          textTransform: 'uppercase',
          color: '#FEAE00',
          letterSpacing: 0,
        }}
      />

      {/* ── Subtitle (yellow + white), 24 px below title */}
      <div
        data-testid="mobile-our-clients-say-subtitle"
        style={{
          margin: '24px 76px 0',
          fontFamily: FONT,
          fontWeight: 500,
          fontSize: 16,
          lineHeight: '20px',
          textAlign: 'center',
          textTransform: 'uppercase',
          letterSpacing: 0,
        }}
      >
        <span style={{ color: '#FEAE00' }}>{t?.satisfiedClients || 'Satisfied clients'}</span>
        <br />
        <span style={{ color: '#FFFFFF' }}>{t?.areOurPriority || 'are our priority'}</span>
      </div>

      {/* ── Google trust row — logo left @17, rating block right @17 */}
      <div
        data-testid="mobile-our-clients-say-google"
        style={{
          marginTop: 44,
          padding: '0 17px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 12,
        }}
      >
        <img
          src="/figma/google-logo.svg"
          alt="Google"
          style={{ height: 26, width: 'auto', display: 'block' }}
          onError={(e) => { e.currentTarget.style.display = 'none'; }}
        />

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span
              data-testid="mobile-our-clients-say-rating"
              style={{
                fontFamily: FONT,
                fontWeight: 700,
                fontSize: 14,
                lineHeight: '16px',
                color: '#FFFFFF',
              }}
            >
              {googleRating ?? 4.9}
            </span>
            <span
              aria-label={`${googleRating ?? 4.9} out of 5 stars`}
              style={{
                width: 80,
                height: 16,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <Star /><Star /><Star /><Star /><Star />
            </span>
          </div>
          <a
            href="https://g.page/r/bibicars/review"
            target="_blank"
            rel="noopener noreferrer"
            data-testid="mobile-our-clients-say-reviews-link"
            style={{
              fontFamily: FONT,
              fontWeight: 500,
              fontSize: 12,
              lineHeight: '14px',
              color: '#FFFFFF',
              textDecoration: 'underline',
              textUnderlineOffset: '2px',
            }}
          >
            {googleReviewsCount ?? 31} {t?.googleReviews || 'Google reviews'}
          </a>
        </div>
      </div>

      {/* ── "What customers say when they work with us" heading (left @17) */}
      <h3
        data-testid="mobile-our-clients-say-heading"
        style={{
          margin: '47px 17px 0',
          fontFamily: FONT,
          fontWeight: 700,
          fontSize: 24,
          lineHeight: '28px',
          color: '#FFFFFF',
          letterSpacing: 0,
        }}
      >
        {t?.whatCustomersSay || 'What customers say'}
        <br />
        {t?.whenTheyWorkWithUs || 'when they work with us'}
      </h3>

      {/* ── Reviews track (horizontal scroll + snap) ────────────────────── */}
      <div
        ref={trackRef}
        data-testid="mobile-our-clients-say-track"
        style={{
          marginTop: 24,
          display: 'flex',
          gap: 16,
          overflowX: 'auto',
          overflowY: 'hidden',
          scrollSnapType: 'x mandatory',
          WebkitOverflowScrolling: 'touch',
          touchAction: 'pan-x',
          overscrollBehaviorX: 'contain',
          paddingLeft: 12,                        /* user spec: 12 L/R on welcome mobile */
          paddingRight: 12,
          scrollbarWidth: 'none',
          cursor: 'grab',
        }}
      >
        <style>{`
          [data-testid="mobile-our-clients-say-track"]::-webkit-scrollbar { display: none; }
        `}</style>

        {total === 0 ? (
          <div
            style={{
              width: '100%',
              padding: '40px 16px',
              textAlign: 'center',
              color: '#9B9B9B',
              fontFamily: FONT,
              fontWeight: 400,
              fontSize: 14,
            }}
          >
            No reviews yet.
          </div>
        ) : (
          list.map((r, i) => (
            <article
              key={r.id || `${r.name}-${i}`}
              data-card-idx={i}
              data-testid={`mobile-our-clients-say-card-${i + 1}`}
              style={{
                flex: '0 0 auto',
                width: 330,
                height: 324,
                boxSizing: 'border-box',
                background: '#1A1A1A',
                scrollSnapAlign: 'center',
                padding: '24px 20px',
                display: 'flex',
                flexDirection: 'column',
                color: '#FFFFFF',
              }}
            >
              {/* Header: avatar + name (gap 27) */}
              <header style={{ display: 'flex', alignItems: 'center', gap: 27 }}>
                {r.image_url ? (
                  <img
                    src={optimizeImage(fullMediaUrl(r.image_url), ImageSize.avatar)}
                    alt={r.name || ''}
                    width={40}
                    height={40}
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: '50%',
                      objectFit: 'cover',
                      display: 'block',
                      flex: '0 0 auto',
                    }}
                    loading="lazy"
                    decoding="async"
                    onError={(e) => {
                      // Fall back to a neutral initial-avatar circle
                      e.currentTarget.style.display = 'none';
                    }}
                  />
                ) : (
                  <div
                    aria-hidden="true"
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: '50%',
                      background: '#3A3A3A',
                      flex: '0 0 auto',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#FFFFFF',
                      fontFamily: FONT,
                      fontWeight: 700,
                      fontSize: 16,
                    }}
                  >
                    {(r.name || '?').slice(0, 1).toUpperCase()}
                  </div>
                )}
                <h4
                  data-testid={`mobile-our-clients-say-name-${i + 1}`}
                  style={{
                    margin: 0,
                    fontFamily: FONT,
                    fontWeight: 700,
                    fontSize: 24,
                    lineHeight: '28px',
                    color: '#FEAE00',
                    letterSpacing: 0,
                  }}
                >
                  {r.name || ''}
                </h4>
              </header>

              {/* Review body */}
              <p
                data-testid={`mobile-our-clients-say-text-${i + 1}`}
                style={{
                  margin: '16px 0 0 0',
                  fontFamily: FONT,
                  fontWeight: 400,
                  fontSize: 16,
                  lineHeight: '22px',
                  color: '#FFFFFF',
                  letterSpacing: 0,
                  overflow: 'hidden',
                }}
              >
                {r.text || ''}
              </p>
            </article>
          ))
        )}
      </div>

      {/* ── Pagination ← 01/10 → ─────────────────────────────────────────── */}
      {total > 0 && (
        <div
          data-testid="mobile-our-clients-say-pagination"
          style={{
            marginTop: 24,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 24,
          }}
        >
          <button
            type="button"
            aria-label="Previous"
            onClick={prev}
            data-testid="mobile-our-clients-say-prev"
            style={{
              width: 40,
              height: 40,
              borderRadius: '50%',
              border: '1.5px solid #FEAE00',
              background: 'transparent',
              color: '#FEAE00',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 0,
              lineHeight: 1,
            }}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M15 4l-8 8 8 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>

          <span
            data-testid="mobile-our-clients-say-counter"
            style={{
              fontFamily: FONT,
              fontWeight: 500,
              fontSize: 12,
              lineHeight: '16px',
              color: '#FFFFFF',
              letterSpacing: 0,
              minWidth: 44,
              textAlign: 'center',
            }}
          >
            {counter}
          </span>

          <button
            type="button"
            aria-label="Next"
            onClick={next}
            data-testid="mobile-our-clients-say-next"
            className="bibi-swipe-hint"
            style={{
              width: 40,
              height: 40,
              borderRadius: '50%',
              border: 'none',
              background: '#FEAE00',
              color: '#000000',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 0,
              lineHeight: 1,
            }}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M9 4l8 8-8 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
      )}
    </section>
  );
}


/* ─────────────────────────────────────────────────────────────────────── */
/* MobileWhyPayLess                                                        */
/*                                                                         */
/* "Why you pay less — and get more" benefits block, sits between the      */
/* `MobileOurClientsSay` reviews carousel and the Dream-car CTA.           */
/*                                                                         */
/* Figma mobile mock (frame 359 × 834):                                    */
/*   • Section bg                       — #000000                          */
/*   • Title (centered, side insets 65, top 47):                           */
/*       "WHY YOU PAY LESS"             — H Bold 24, #FEAE00               */
/*       "— AND GET MORE"               — H Bold 24, dash yellow + words   */
/*                                        white. Rendered as two coloured  */
/*                                        spans on one line.               */
/*   • Hero illustration                 — /figma/why-pay-less-car.svg     */
/*                                        (328 × 328, side insets 16 / 16) */
/*   • Benefit list (4 items, total 298 × 433):                            */
/*       Header  /TEXT                   — H Bold    16, #FEAE00, upper    */
/*       Body                            — H Regular 16, #FFFFFF           */
/*       Header → body gap               — 8 px                            */
/*       Block-to-block gap              — 49 px                           */
/* ─────────────────────────────────────────────────────────────────────── */
function MobileWhyPayLess() {
  const FONT = "'Mazzard H', 'Mazzard', system-ui, -apple-system, sans-serif";

  const { lang } = useLang();
  const isBg = (lang || 'en').toLowerCase().startsWith('bg');
  const L = isBg
    ? {
        titleOrange: 'Защо плащате по-малко',
        titleWhite: '— и получавате повече',
        items: [
          {
            title: 'Голям избор',
            body: 'Повече комплектации, цветове, редки модели',
          },
          {
            title: 'По-добри комплектации',
            body: 'Повече опции\nПо-добра мултимедия\nПо-високо ниво на комфорт',
          },
          {
            title: 'Много по-евтино',
            body:
              'Дори с включена доставка и митническо оформяне,\nавтомобилът често излиза 20–50% по-евтин',
          },
          {
            title: 'Прозрачна история',
            body: 'VIN проверки (Carfax, AutoCheck)',
          },
        ],
      }
    : {
        titleOrange: 'Why you pay less',
        titleWhite: '— and get more',
        items: [
          {
            title: 'Large selection',
            body: 'More trim levels, colors, rare models',
          },
          {
            title: 'Better trim levels',
            body: 'More options\nBetter multimedia\nHigher level of comfort',
          },
          {
            title: 'Much cheaper',
            body:
              'Even taking into account delivery and customs clearance,\nthe car often comes out 20–50% cheaper',
          },
          {
            title: 'Transparent history',
            body: 'VIN checks (Carfax, AutoCheck)',
          },
        ],
      };

  const ITEMS = L.items;

  return (
    <section
      data-testid="mobile-why-pay-less"
      style={{
        width: '100%',
        background: '#000000',
        fontFamily: FONT,
        // Top inset 47 per Figma. Bottom inset 100 keeps a clear breathing
        // gap between the last benefit ("/ TRANSPARENT HISTORY · VIN checks")
        // and the Dream-car CTA image below — analysed from the Figma mock.
        padding: '47px 0 100px',
        boxSizing: 'border-box',
      }}
    >
      {/* ── Title: two-tone "WHY YOU PAY LESS — AND GET MORE" ──────────── */}
      <h2
        data-testid="mobile-why-pay-less-title"
        style={{
          margin: '0 65px',
          fontFamily: FONT,
          fontWeight: 700,
          fontSize: 24,
          lineHeight: '28px',
          textAlign: 'center',
          textTransform: 'uppercase',
          letterSpacing: 0,
        }}
      >
        <AnimatedHeading
          as="span"
          text={L.titleOrange}
          style={{ color: '#FEAE00', display: 'block' }}
        />
        <AnimatedHeading
          as="span"
          text={L.titleWhite}
          baseDelay={L.titleOrange.replace(/\s/g, '').length * 28}
          style={{ color: '#FFFFFF', display: 'block' }}
        />
      </h2>

      {/* ── Hero illustration — 328 × 328, side insets 16 / 16 ─────────── */}
      <div
        data-testid="mobile-why-pay-less-hero"
        style={{
          margin: '24px 16px 0',
          width: 'calc(100% - 32px)',
          maxWidth: 328,
          marginLeft: 'auto',
          marginRight: 'auto',
        }}
      >
        <img
          src="/figma/why-pay-less-car.png"
          alt="Audi"
          width={328}
          height={328}
          style={{
            display: 'block',
            width: '100%',
            height: 'auto',
            aspectRatio: '328 / 328',
            objectFit: 'contain',
          }}
          loading="lazy"
          onError={(e) => {
            // Hard fallback to the bundled SVG illustration if PNG missing.
            const t = e.currentTarget;
            if (t && !t.dataset.fallback) {
              t.dataset.fallback = '1';
              t.src = '/figma/why-pay-less-car.svg';
            } else {
              t.style.display = 'none';
            }
          }}
        />
      </div>

      {/* ── Benefits list ──────────────────────────────────────────────── */}
      <div
        data-testid="mobile-why-pay-less-list"
        style={{
          // Block width 298 inside a 360-wide screen → side insets ≈ 31 / 31
          // ("Подпись внизу" lives in the same 298-wide column as the title)
          margin: '24px auto 0',
          width: 298,
          maxWidth: 'calc(100% - 32px)',
          display: 'flex',
          flexDirection: 'column',
          // Block-to-block gap per Figma — 49 px between the bottoms of one
          // benefit's body and the next benefit's yellow header.
          rowGap: 49,
        }}
      >
        {ITEMS.map((it, i) => (
          <div
            key={it.title}
            data-testid={`mobile-why-pay-less-item-${i + 1}`}
            style={{ display: 'flex', flexDirection: 'column' }}
          >
            <h3
              data-testid={`mobile-why-pay-less-item-title-${i + 1}`}
              style={{
                margin: 0,
                fontFamily: FONT,
                fontWeight: 700,
                fontSize: 16,
                lineHeight: '20px',
                color: '#FEAE00',
                textTransform: 'uppercase',
                letterSpacing: 0,
              }}
            >
              / {it.title}
            </h3>
            <p
              data-testid={`mobile-why-pay-less-item-body-${i + 1}`}
              style={{
                // 8 px between yellow header and white body, per Figma.
                margin: '8px 0 0 0',
                fontFamily: FONT,
                fontWeight: 400,
                fontSize: 16,
                lineHeight: '22px',
                color: '#FFFFFF',
                whiteSpace: 'pre-line',
                letterSpacing: 0,
              }}
            >
              {it.body}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}

