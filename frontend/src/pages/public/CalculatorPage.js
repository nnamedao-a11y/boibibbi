/**
 *  CalculatorPage — Figma "CALCULATOR USA" 1:1 port (BIBI Cars).
 *
 *  All pixel-level dimensions (block 1720×1133, 374×45 buttons, 748×45 input,
 *  325×45 CTA, 72 px inner padding, 80 px column gap, 44 px between
 *  estimate sub-groups, 22 / 24 / 24 left-column field gaps, 56 px
 *  disclaimer→CTA, 128 px CTA→footer) live in `CalculatorPage.module.css`.
 *
 *  Typography (Mazzard H):
 *    "CALCULATOR"   – Bold 64
 *    Subtitle box   – Medium 24 (orange + white parts)
 *    Calculation Form / Cost Estimate – Semibold 18
 *    Body text      – Medium 14
 *    TOTAL approximate cost – Bold 20 orange
 *    CTA text       – Medium 14
 *
 *  Wired to backend:
 *    POST /api/calculator/calculate  – live recompute (350 ms debounce)
 *    POST /api/calculator/quote      – on CTA click
 *    POST /api/quick-leads           – fallback if quote endpoint missing
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { toast } from 'sonner';
import { useLang } from '../../i18n';
import styles from './CalculatorPage.module.css';
import PageHero from '../../components/public/PageHero';
import { trackCalculatorUse, trackLeadSubmit } from '../../lib/tracker';

const API = process.env.REACT_APP_BACKEND_URL || '';

const fmtEUR = (v) => `€${Math.round(Number(v) || 0).toLocaleString('en-US')}`;

/**
 * Vehicle-price input config.
 * MAX_PRICE_DIGITS = 7 → user can type up to 9 999 999 € (covers "million-class"
 * sums per product spec). Anything beyond is silently truncated. The state
 * holds only digits (no spaces) so `Number(priceStr)` keeps working for the
 * downstream API call; the spaces are inserted on display via
 * `formatThousands` (every 3 digits from the right, space separator).
 *
 * Examples:
 *      1      → "1"
 *     10      → "10"
 *    100      → "100"
 *   1000      → "1 000"
 *  10000      → "10 000"
 * 100000      → "100 000"
 * 1000000     → "1 000 000"
 */
const MAX_PRICE_DIGITS = 7;
const formatThousands = (digits) =>
  digits ? String(digits).replace(/\B(?=(\d{3})+(?!\d))/g, ' ') : '';

/* Bilingual UI labels (EN + BG). Numbers / formula labels keep €/% in both
 * languages — only words translate. */
const CALC_T = {
  en: {
    crumbHome: 'home',
    crumbCalc: 'calculator',
    pageTitle: 'calculator',
    subA: 'Calculate the approximate cost ',
    subB: 'of your car and send a request ',
    subC: 'for a consultation',
    calcForm: 'Calculation Form',
    countryLabel: 'Country of origin',
    vehicleLabel: 'Vehicle',
    priceLabel: 'Vehicle purchase price',
    pricePh: 'Fill the summ',
    damageLabel: 'Vehicle damage status',
    notDamaged: 'not damaged',
    damaged: 'damaged',
    costEstimate: 'Cost Estimate',
    purchasePrice: 'Vehicle purchase price',
    auctionFee: 'Auction fee',
    carAuctionTot: 'CAR & AUCTION',
    portLoading: (o) => `Port loading & handling (${o})`,
    oceanFreight: 'Ocean freight (vessel)',
    marineIns: 'Marine insurance',
    portHandling: 'Port handling in Bulgaria',
    logisticsTotBg: 'LOGISTICS TO BULGARIA',
    logisticsTotRo: 'LOGISTICS TO ROMANIA',
    customsDuty: 'Customs duty (import tax)',
    vat: 'VAT Bulgaria (20%)',
    bibiFee: 'BIBI service fee',
    transportBg: 'Transport to Bulgaria',
    technotest: 'Technotest (BG registration)',
    customsTot: 'CUSTOMS & FINAL FEES',
    grandTotal: 'total approximate cost',
    approxEm: 'Approximate estimate',
    approxRest: '. Final cost depends on actual auction result, current freight rates and individual customs assessment. Contact BIBI for a precise binding quote.',
    submitting: 'Submitting…',
    cta: 'I want a complete calculation',
    motorbike: 'motorbike', sedan: 'sedan', suv: 'SUV', pickup: 'Pick-up', van: 'Van',
    countryUSA: 'USA', countryKR: 'Korea',
    // toast messages
    toastPriceRequired: 'Please enter the vehicle purchase price first.',
    toastSuccessPrecise: 'Got it! Our team will reach out with a precise binding quote.',
    toastSuccessShort: 'Request received. We will be in touch shortly.',
    toastSubmitError: 'Could not submit your request. Please try again or contact us directly.',
  },
  bg: {
    crumbHome: 'начало',
    crumbCalc: 'калкулатор',
    pageTitle: 'калкулатор',
    subA: 'Изчислете приблизителната цена ',
    subB: 'на вашия автомобил и изпратете заявка ',
    subC: 'за консултация',
    calcForm: 'Форма за изчисление',
    countryLabel: 'Държава на произход',
    vehicleLabel: 'Превозно средство',
    priceLabel: 'Цена на закупуване',
    pricePh: 'Въведете сумата',
    damageLabel: 'Статус на повреда',
    notDamaged: 'без повреди',
    damaged: 'повредена',
    costEstimate: 'Оценка на разходите',
    purchasePrice: 'Цена на закупуване',
    auctionFee: 'Такса търг',
    carAuctionTot: 'КОЛА И ТЪРГ',
    portLoading: (o) => `Пристанище — товарене (${o})`,
    oceanFreight: 'Морски транспорт (кораб)',
    marineIns: 'Морска застраховка',
    portHandling: 'Пристанищни такси в България',
    logisticsTotBg: 'ЛОГИСТИКА ДО БЪЛГАРИЯ',
    logisticsTotRo: 'ЛОГИСТИКА ДО РУМЪНИЯ',
    customsDuty: 'Мито (импортна такса)',
    vat: 'ДДС България (20%)',
    bibiFee: 'BIBI сервизна такса',
    transportBg: 'Транспорт до България',
    technotest: 'Техно-тест (регистрация в БГ)',
    customsTot: 'МИТО И КРАЙНИ ТАКСИ',
    grandTotal: 'обща приблизителна цена',
    approxEm: 'Приблизителна оценка',
    approxRest: '. Крайната цена зависи от резултата на търга, актуалните навла и индивидуалното митническо оценяване. Свържете се с BIBI за точна оферта.',
    submitting: 'Изпращане…',
    cta: 'Искам пълно изчисление',
    motorbike: 'мотор', sedan: 'седан', suv: 'SUV', pickup: 'Пикап', van: 'Ван',
    countryUSA: 'САЩ', countryKR: 'Корея',
    // toast messages
    toastPriceRequired: 'Моля, въведете цената на автомобила.',
    toastSuccessPrecise: 'Получихме заявката! Нашият екип ще се свърже с вас с точна оферта.',
    toastSuccessShort: 'Заявката е получена. Скоро ще се свържем с вас.',
    toastSubmitError: 'Заявката не беше изпратена. Опитайте отново или се свържете с нас директно.',
  },
};

/* ──────────────────────────────────────────────────────────────────────── */
/*  Vehicle icons (40 × 40 design-system PNGs, single-tone)                  */
/*  Active state recolours the white silhouette to the card foreground       */
/*  (#000 on the orange selected card) using a CSS mask, see *.module.css.   */
/* ──────────────────────────────────────────────────────────────────────── */
const VEHICLE_TYPES = [
  { code: 'motorbike', label: 'motorbike', icon: '/figma/calc/veh-motorbike.png', apiType: 'motorcycle' },
  { code: 'sedan',     label: 'sedan',     icon: '/figma/calc/veh-sedan.png',     apiType: 'sedan'  },
  { code: 'suv',       label: 'SUV',       icon: '/figma/calc/veh-suv.png',       apiType: 'suv'    },
  { code: 'pickup',    label: 'Pick-up',   icon: '/figma/calc/veh-pickup.png',    apiType: 'pickup' },
  { code: 'van',       label: 'Van',       icon: '/figma/calc/veh-van.png',       apiType: 'bigSUV' },
];

const COUNTRIES = [
  { code: 'usa',   label: 'USA',   flag: '/figma/calc/usa-flag@2x.png' },
  { code: 'korea', label: 'Korea', flag: '/figma/calc/korea-flag@2x.png' },
];

/* Cost-estimate primitives */
const Row = ({ label, value }) => (
  <div className={styles.estRow}>
    <div className={styles.lbl}>{label}</div>
    <div className={styles.val}>{value}</div>
  </div>
);
const GroupTotal = ({ label, value }) => (
  <div className={styles.estGroupTotal}>
    <div className={styles.gtLbl}>{label}</div>
    <div className={styles.gtVal}>{value}</div>
  </div>
);

const EMPTY_CALC = {
  price: 0, auctionFee: 0, carAuction: 0,
  portLoading: 0, oceanFreight: 0, marineInsurance: 0, portHandlingBg: 0, logistics: 0,
  customsDuty: 0, vat: 0, bibiFee: 0, transportBg: 0, technotest: 0, customsFinal: 0,
  grand: 0,
};

/* ====================================================================== */

export default function CalculatorPage() {
  const navigate = useNavigate();
  const { search } = useLocation();
  const params = useMemo(() => new URLSearchParams(search), [search]);
  const { lang } = useLang();
  const T = lang === 'bg' ? CALC_T.bg : CALC_T.en;

  const initialPrice = (() => {
    const q = params.get('price');
    if (q == null || q === '') return '';
    const n = Number(q);
    if (!Number.isFinite(n) || n <= 0) return '';
    // Clamp to the same MAX_PRICE_DIGITS ceiling enforced in the input
    // handler, so a deep-link like ?price=99999999 doesn't bypass the cap.
    return String(Math.round(n)).slice(0, MAX_PRICE_DIGITS);
  })();
  const initialVin = (params.get('vin') || params.get('lot') || '').toUpperCase();

  const [origin, setOrigin] = useState('usa');
  // Default state per Figma: no vehicle pre-selected (matches reference design).
  // User explicitly selects one of the 5 vehicle types.
  const [vehicle, setVehicle] = useState(null);
  const [priceStr, setPriceStr] = useState(initialPrice);
  const [damaged, setDamaged] = useState(false);
  const [vin] = useState(initialVin);

  const [calc, setCalc] = useState(EMPTY_CALC);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  /* ── Live calculation (debounced) ───────────────────────────────────── */
  const debounceRef = useRef(null);
  const recompute = useCallback(() => {
    const price = Number(priceStr) || 0;
    if (price <= 0) { setCalc(EMPTY_CALC); return; }
    const apiType = (VEHICLE_TYPES.find(v => v.code === vehicle) || VEHICLE_TYPES[1]).apiType;

    const isKorea = origin === 'korea';
    const payload = {
      origin,
      price,
      port:        isKorea ? 'constanta' : 'burgas',
      auction:     isKorea ? 'korean'    : 'copart',
      vehicleType: apiType,
      damaged,
      vin: vin || undefined,
      // Korea-specific: pass invoice = price so customs_base = price (no
      // 30% undervalue reduction) and ask for the bundled logistics package.
      ...(isKorea ? { invoicePrice: price, useLogisticsPackage: true } : {}),
    };

    setLoading(true);
    trackCalculatorUse({ vin: vin || undefined });
    axios.post(`${API}/api/calculator/calculate`, payload)
      .then((r) => {
        // Backend response shape: { success, calculation: { ...all fields..., breakdown: [...] } }
        const c = r?.data?.calculation || {};
        const bd = Array.isArray(c.breakdown) ? c.breakdown : [];
        const byKey = bd.reduce((acc, row) => { acc[row.key] = Number(row.value) || 0; return acc; }, {});

        const auctionFee = Number(c.auctionTotal) || 0;
        let portLoading, oceanFreight, marineInsurance, portHandlingBg;
        let customsDuty, vat, bibiFee, transportBg, technotest;

        if (isKorea) {
          // Korea pipeline → Calc 2 (logistics package) → Calc 3 (customs + final fees)
          if (byKey.logisticsPackage > 0) {
            portLoading      = byKey.logisticsPackage;     // single bundle line
            oceanFreight     = 0;
            marineInsurance  = 0;
            portHandlingBg   = 0;
          } else {
            portLoading      = byKey.koreaInland || 0;
            oceanFreight     = byKey.seaShipping || 0;
            marineInsurance  = byKey.insurance || 0;
            portHandlingBg   = (byKey.forwarderFee || 0) + (byKey.documentsMail || 0);
          }
          customsDuty  = byKey.customsDuty || 0;
          vat          = byKey.vat || 0;
          bibiFee      = byKey.bibiServiceFee || 0;
          transportBg  = byKey.bgTransport || 0;
          technotest   = byKey.technicalInspection || 0;
        } else {
          // USA pipeline (legacy)
          portLoading      = byKey.usaInland || 0;
          oceanFreight     = byKey.ocean || 0;
          marineInsurance  = byKey.insurance || 0;
          portHandlingBg   = (byKey.portForwarding || 0) + (byKey.portParking || 0);
          customsDuty      = byKey.customs ? Math.max(0, byKey.customs - 100) : 0;
          vat              = price * 0.20;
          bibiFee          = byKey.companyServices || 0;
          transportBg      = byKey.euDelivery || 0;
          technotest       = 0;
        }

        const next = {
          price,
          auctionFee,
          carAuction: price + auctionFee,
          portLoading,
          oceanFreight,
          marineInsurance,
          portHandlingBg,
          logistics: portLoading + oceanFreight + marineInsurance + portHandlingBg,
          customsDuty,
          vat,
          bibiFee,
          transportBg,
          technotest,
          customsFinal: customsDuty + vat + bibiFee + transportBg + technotest,
          grand: Number(c.total) || 0,
        };
        setCalc(next);
      })
      .catch(() => {
        // Local fallback so the page never shows all-zeros when the API hiccups.
        const auctionFee = price * 0.05 + 300;
        const logistics  = origin === 'korea' ? 2400 : 3500;
        const vat        = price * 0.20;
        const bibiFee    = 940;
        const transport  = 1000;
        const customsDuty = origin === 'korea' ? price * 0.10 : 0;
        const customsFinal = vat + bibiFee + transport + customsDuty;
        setCalc({
          ...EMPTY_CALC,
          price,
          auctionFee,
          carAuction: price + auctionFee,
          portLoading: 280,
          oceanFreight: logistics - 280,
          marineInsurance: 0,
          portHandlingBg: 0,
          logistics,
          customsDuty,
          vat,
          bibiFee,
          transportBg: transport,
          technotest: 0,
          customsFinal,
          grand: price + auctionFee + logistics + customsFinal,
        });
      })
      .finally(() => setLoading(false));
  }, [origin, vehicle, priceStr, damaged, vin]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(recompute, 350);
    return () => debounceRef.current && clearTimeout(debounceRef.current);
  }, [recompute]);

  /* ── CTA submit ─────────────────────────────────────────────────────── */
  // The CTA does TWO things:
  //   1. Persist an immutable calculation snapshot via /api/calculations
  //      (this is the same snapshot the manager will see inside the deal).
  //   2. Attach a lead to that snapshot via /api/public/leads/from-quote.
  // Both calls fail-soft — if backend hiccups we still get the user to the
  // contact page so the conversation isn't lost.
  const handleCta = async () => {
    const price = Number(priceStr) || 0;
    if (!price || price <= 0) {
      toast.error(T.toastPriceRequired);
      return;
    }
    setSubmitting(true);
    const isKorea = origin === 'korea';
    const apiType = (VEHICLE_TYPES.find(v => v.code === vehicle) || VEHICLE_TYPES[1]).apiType;
    const snapshotPayload = {
      origin,
      vehicleType: apiType,
      price,
      damaged,
      vin: vin || undefined,
      source: 'public_calculator',
      port:    isKorea ? 'constanta' : 'burgas',
      auction: isKorea ? 'korean'    : 'copart',
      ...(isKorea ? { invoicePrice: price, useLogisticsPackage: true } : {}),
    };
    let calculationId = null;
    let computedTotal = calc?.grand || 0;
    try {
      const snap = await axios.post(`${API}/api/calculations`, snapshotPayload);
      calculationId = snap?.data?.calculation?.id || null;
      computedTotal = snap?.data?.calculation?.outputs?.total || computedTotal;
    } catch (_) { /* snapshot is nice-to-have; lead flow continues */ }

    try {
      await axios.post(`${API}/api/public/leads/from-quote`, {
        calculationId,
        origin,
        vehicleType: apiType,
        price,
        damaged,
        vin: vin || undefined,
        total: computedTotal,
        currency: 'USD',
        source: 'calculator',
        message: `Calculator request — ${origin.toUpperCase()} / ${vehicle} / $${price.toLocaleString()} / ${damaged ? 'damaged' : 'not damaged'}${vin ? ' / VIN ' + vin : ''}${calculationId ? ' / calc ' + calculationId : ''}`,
      });
      toast.success(T.toastSuccessPrecise);
      trackLeadSubmit({ vin: vin || undefined });
    } catch (_) {
      // Last-ditch fallback so the user is still captured
      try {
        await axios.post(`${API}/api/quick-leads`, {
          name: 'Calculator request',
          phone: '',
          message: `Calculator quote request — ${origin.toUpperCase()} / ${vehicle} / $${price} / ${damaged ? 'damaged' : 'not damaged'}${vin ? ' / VIN ' + vin : ''}${calculationId ? ' / calc ' + calculationId : ''}`,
          source: 'calculator',
        });
        toast.success(T.toastSuccessShort);
      } catch {
        toast.error(T.toastSubmitError);
        setSubmitting(false);
        return;
      }
    }
    navigate('/contacts', { state: { source: 'calculator', calculationId, payload: snapshotPayload } });
    setSubmitting(false);
  };

  /* ── Render ──────────────────────────────────────────────────────────── */
  return (
    <div className={styles.calcPage} data-testid="calculator-page">
      <PageHero
        home={T.crumbHome}
        crumbs={[{ label: T.crumbCalc }]}
        title={T.pageTitle}
        testId="calculator-hero"
      />
      <div className={styles.container}>

        {/* Subtitle "[ CALCULATE THE APPROXIMATE COST … ]" ─ 296 px from header.
            Phase B3.2.2: brackets switched from fixed-height CSS borders
            (80 px) to the same stretchable SVG used in the home page's
            VehicleDeals1 block, so the bracket frame grows naturally with
            the text (works for EN/BG/UA copies of any length). */}
        <div className={styles.subBox} data-testid="calculator-subtitle">
          <svg
            className={styles.bracketL}
            viewBox="0 0 17 80"
            preserveAspectRatio="none"
            aria-hidden="true"
            focusable="false"
          >
            <path
              d="M14.5264 1.5H1.5V77.5264H14.5264"
              stroke="#949494"
              strokeWidth="3"
              strokeLinecap="square"
              fill="none"
              vectorEffect="non-scaling-stroke"
            />
          </svg>
          <h2 className={styles.subText}>
            <span>{T.subA}</span><br />
            <span className={styles.subWhite}>
              {T.subB}<br />
              {T.subC}
            </span>
          </h2>
          <svg
            className={styles.bracketR}
            viewBox="0 0 17 80"
            preserveAspectRatio="none"
            aria-hidden="true"
            focusable="false"
          >
            <path
              d="M14.5264 1.5H1.5V77.5264H14.5264"
              stroke="#949494"
              strokeWidth="3"
              strokeLinecap="square"
              fill="none"
              vectorEffect="non-scaling-stroke"
            />
          </svg>
        </div>

        {/* THE 1720 × 1133 GRAY BLOCK ─ 480 px from header */}
        <div className={styles.calcBlock} data-testid="calc-block">

          {/* ─────────────────── LEFT — Calculation Form ─────────────── */}
          <section className={`${styles.col} ${styles.colLeft}`} data-testid="calc-left">
            <div className={styles.sectionHead}><h2>{T.calcForm}</h2></div>

            <div className={styles.formStack}>
              {/* Country of origin */}
              <div className={`${styles.field} ${styles.firstField}`}>
                <div className={styles.fieldLabel}>
                  {T.countryLabel} <span className={styles.req}>*</span>
                </div>
                <div className={styles.ctryRow} role="tablist" aria-label={T.countryLabel}>
                  {COUNTRIES.map((c, i) => {
                    const active = origin === c.code;
                    const cls = i === 0 ? styles.ctryBtn : styles.ctryBtn2;
                    const label = c.code === 'usa' ? T.countryUSA : T.countryKR;
                    return (
                      <button
                        key={c.code}
                        type="button"
                        role="tab"
                        aria-selected={active}
                        data-testid={`country-${c.code}`}
                        onClick={() => setOrigin(c.code)}
                        className={`${cls} ${active ? styles.ctryActive : ''}`}
                      >
                        <img className={styles.flag} src={c.flag} alt="" />
                        <span>{label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Vehicle icons — 24 px below country buttons */}
              <div className={styles.field}>
                <div className={styles.fieldLabel}>
                  {T.vehicleLabel} <span className={styles.req}>*</span>
                </div>
                <div className={styles.vehRow} role="radiogroup" aria-label={T.vehicleLabel}>
                  {VEHICLE_TYPES.map((v) => {
                    const active = vehicle === v.code;
                    return (
                      <button
                        key={v.code}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        data-testid={`vehicle-${v.code}`}
                        onClick={() => setVehicle(v.code)}
                        className={`${styles.vehCard} ${active ? styles.vehCardActive : ''}`}
                      >
                        <span
                          className={styles.vehIcon}
                          style={{ WebkitMaskImage: `url(${v.icon})`, maskImage: `url(${v.icon})` }}
                          aria-hidden="true"
                        />
                        <span className={styles.vehLabel}>{T[v.code] || v.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Vehicle purchase price — 24 px below vehicle icons */}
              <div className={styles.field}>
                <div className={styles.fieldLabel}>
                  {T.priceLabel} <span className={styles.req}>*</span>
                </div>
                <div className={styles.priceRow}>
                  <img className={styles.priceEuro} src="/figma/calc/euro-icon.svg" alt="" />
                  <input
                    className={styles.priceInput}
                    type="text"
                    inputMode="numeric"
                    placeholder={T.pricePh}
                    value={formatThousands(priceStr)}
                    onChange={(e) => {
                      // Strip everything except digits, then cap to MAX_PRICE_DIGITS
                      // so the user cannot exceed the 7-digit ceiling.
                      const digits = e.target.value.replace(/\D/g, '').slice(0, MAX_PRICE_DIGITS);
                      setPriceStr(digits);
                    }}
                    maxLength={MAX_PRICE_DIGITS + Math.floor((MAX_PRICE_DIGITS - 1) / 3)} /* "9 999 999" = 9 chars */
                    data-testid="calc-price-input"
                  />
                </div>
              </div>

              {/* Vehicle damage status — 24 px below price input */}
              <div className={styles.field}>
                <div className={styles.fieldLabel}>
                  {T.damageLabel} <span className={styles.req}>*</span>
                </div>
                <div className={styles.dmgRow} role="tablist" aria-label={T.damageLabel}>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={!damaged}
                    data-testid="dmg-not-damaged"
                    onClick={() => setDamaged(false)}
                    className={`${styles.dmgBtn} ${!damaged ? styles.dmgOk : ''}`}
                  >
                    {T.notDamaged}
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={damaged}
                    data-testid="dmg-damaged"
                    onClick={() => setDamaged(true)}
                    className={`${styles.dmgBtn2} ${damaged ? styles.dmgErr : ''}`}
                  >
                    {T.damaged}
                  </button>
                </div>
              </div>
            </div>
          </section>

          {/* ─────────────────── RIGHT — Cost Estimate ───────────────── */}
          <section
            className={`${styles.col} ${styles.colRight} ${loading ? styles.loading : ''}`}
            data-testid="calc-right"
          >
            <div className={styles.sectionHead}><h2>{T.costEstimate}</h2></div>

            <div className={styles.estStack}>
              {/* Group 1 — Car & Auction */}
              <div className={`${styles.estGroup} ${styles.firstEstGroup}`}>
                <Row label={T.purchasePrice} value={fmtEUR(calc.price)} />
                <Row label={T.auctionFee} value={fmtEUR(calc.auctionFee)} />
                <GroupTotal label={T.carAuctionTot} value={fmtEUR(calc.carAuction)} />
              </div>

              {/* Group 2 — Logistics */}
              <div className={styles.estGroup}>
                <Row label={T.portLoading(origin === 'usa' ? (lang === 'bg' ? 'САЩ' : 'USA') : (lang === 'bg' ? 'КОРЕЯ' : 'KOREA'))} value={fmtEUR(calc.portLoading)} />
                <Row label={T.oceanFreight} value={fmtEUR(calc.oceanFreight)} />
                <Row label={T.marineIns} value={fmtEUR(calc.marineInsurance)} />
                <Row label={T.portHandling} value={fmtEUR(calc.portHandlingBg)} />
                <GroupTotal
                  label={origin === 'korea' ? T.logisticsTotRo : T.logisticsTotBg}
                  value={fmtEUR(calc.logistics)}
                />
              </div>

              {/* Group 3 — Customs & Final Fees */}
              <div className={styles.estGroup}>
                <Row label={T.customsDuty} value={fmtEUR(calc.customsDuty)} />
                <Row label={T.vat} value={fmtEUR(calc.vat)} />
                <Row label={T.bibiFee} value={fmtEUR(calc.bibiFee)} />
                <Row label={T.transportBg} value={fmtEUR(calc.transportBg)} />
                <Row label={T.technotest} value={fmtEUR(calc.technotest)} />
                <GroupTotal label={T.customsTot} value={fmtEUR(calc.customsFinal)} />
              </div>

              {/* TOTAL approximate cost */}
              <div className={styles.grandTotal} data-testid="calc-grand-total">
                <h3>{T.grandTotal}</h3>
                <h3 className={styles.totalVal}>{fmtEUR(calc.grand)}</h3>
              </div>

              {/* Disclaimer */}
              <div className={styles.disclaimer}>
                <span className={styles.em}>{T.approxEm}</span>
                {T.approxRest}
              </div>

              {/* CTA */}
              <button
                type="button"
                className={styles.ctaBtn}
                onClick={handleCta}
                disabled={submitting}
                data-testid="calc-cta-submit"
              >
                {submitting ? T.submitting : T.cta}
              </button>
            </div>
          </section>

        </div>
      </div>
    </div>
  );
}
