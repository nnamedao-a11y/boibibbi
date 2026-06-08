import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import axios from 'axios';
import NavigationHeader from './components/NavigationHeader';
import ImageGrid from './components/ImageGrid';
import CostCalculator from './components/CostCalculator';
import NavigationFooter from './components/NavigationFooter';
import SimilarCars from './components/SimilarCars';
// FreshnessBadge intentionally hidden in production UI (no Live/updated chip)
// import FreshnessBadge from './components/FreshnessBadge';
import useCarByVin from './useCarByVin';
import { useLang } from '../../../i18n';
import { useSingleCarT } from './i18n';
import './single-car.tokens.css';
import styles from './SingleCarPage.module.css';
import { trackEvent, EVENT_NAMES } from '../../../hooks/useTrackEvent';
import { trackVehicleView } from '../../../lib/tracker';

const API_URL = process.env.REACT_APP_BACKEND_URL || '';

/**
 * BIBI Cars — Single Car page (EN/BG i18n).
 */
const SingleCarPage = () => {
  const params = useParams();
  const vinOrSlug = params.slug || params.query || params.vin;
  const navigate = useNavigate();
  // phase/freshness/ageSeconds/missingFields intentionally not destructured —
  // production UI no longer surfaces freshness chips.
  const { loading, error, car } = useCarByVin(vinOrSlug);
  const { lang } = useLang();
  const t = useSingleCarT(lang);

  /* ── Cost calculator state — derived from the car's auction price ── */
  const [calc, setCalc] = useState(null);
  const [calcLoading, setCalcLoading] = useState(false);

  // Vehicle classification → calculator `vehicleType`
  const vehicleType = useMemo(() => {
    const body = (car?.vehicle?.bodyType || '').toLowerCase();
    if (body.includes('suv') && /(big|full)/i.test(car?.vehicle?.bodyType || '')) return 'bigSUV';
    if (body.includes('suv')) return 'suv';
    if (body.includes('pickup')) return 'pickup';
    return 'sedan';
  }, [car]);

  // Phase B3 — detail view + bounce observation (Wave 3 freeze).
  // We fire `detail_view` once the shell is rendered, and `detail_bounce`
  // if the user leaves within 3 s (low-intent visit). Both are
  // privacy-respecting: only the redacted VIN suffix reaches the backend.
  useEffect(() => {
    if (!car?.vehicle?.vin) return undefined;
    const vin = car.vehicle.vin;
    const enteredAt = Date.now();
    trackEvent(EVENT_NAMES.DETAIL_VIEW, {
      vin,
      make: car.vehicle.make || null,
      year: car.vehicle.year || null,
    });
    trackVehicleView({ vin, vehicle_id: vin });
    return () => {
      const dwellMs = Date.now() - enteredAt;
      if (dwellMs < 3000) {
        trackEvent(EVENT_NAMES.DETAIL_BOUNCE, { vin, dwell_ms: dwellMs });
      }
    };
  }, [car?.vehicle?.vin, car?.vehicle?.make, car?.vehicle?.year]);

  const runCalc = useCallback(async (priceUsd, auction) => {
    if (!priceUsd || priceUsd <= 0) {
      setCalc(null);
      return;
    }
    setCalcLoading(true);
    try {
      const res = await axios.post(
        `${API_URL}/api/calculator/calculate`,
        {
          origin: 'usa',
          price: priceUsd,
          port: 'burgas',
          auction: (auction || 'copart').toLowerCase(),
          vehicleType,
        },
        { timeout: 12000 },
      );
      setCalc(res.data);
    } catch {
      setCalc(null);
    } finally {
      setCalcLoading(false);
    }
  }, [vehicleType]);

  // Auto-run calculator with parsed bid price on car load.
  useEffect(() => {
    if (!car) return;
    runCalc(car.auction.bidPriceRaw || 0, car.auction.auction);
  }, [car, runCalc]);

  /* ── handlers ── */
  const handleExactCost = () => {
    if (typeof window !== 'undefined') {
      const el = document.getElementById('cost-calculator');
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };
  const handleBackToCatalog = () => navigate('/catalog');

  /* ── derived view-model ── */
  const title = car?.title
    || (loading
        ? t.loading
        : (error === 'not_found' ? t.vinNotFound : t.vehicle));
  const breadcrumb = [t.home, t.catalog];

  const preFilled = car
    ? {
        auction: car.auction.auction,
        car: `${(car.vehicle.brand || '').toUpperCase()} ${(car.vehicle.model || '').toUpperCase()} ${car.vehicle.year || ''}`.trim(),
        fuelType: car.vehicle.fuel,
        mileage: car.vehicle.mileage,
      }
    : undefined;

  const fmt = (v) => (v == null ? '€0' : `€${Math.round(Number(v) || 0).toLocaleString('en-US')}`);
  // Calculator response shape: { calculation: { total, vehiclePrice, auctionFees, ... }, formattedBreakdown: [{key,label,value}, ...] }
  const breakdown = Array.isArray(calc?.formattedBreakdown) ? calc.formattedBreakdown : (calc?.calculation?.breakdown || []);
  const pick = (k) => {
    const item = breakdown.find((b) => b.key === k);
    return Number(item?.value || 0);
  };
  const calculation = calc?.calculation || {};
  const vehiclePrice = Number(calculation.vehiclePrice || 0);
  const auctionFeesTotal = pick('auctionBuyerFee') + pick('auctionGateFee') + pick('auctionTitleFee');
  const logisticsTotal = pick('usaInland') + pick('ocean') + pick('portForwarding') + pick('portParking') + pick('parkingBG');
  const vat = Math.round(vehiclePrice * 0.20);             // 20 % VAT on vehicle value
  const customsTotalDisplay = pick('customs') + vat;
  const costs = calc
    ? {
        carAuction: fmt(vehiclePrice + auctionFeesTotal),
        portLoadingHandling: fmt(pick('usaInland')),
        oceanFreight: fmt(pick('ocean')),
        marineInsurance: fmt(pick('insurance')),
        portHandlingBg: fmt(pick('portForwarding') + pick('portParking') + pick('parkingBG')),
        logisticsTotal: fmt(logisticsTotal),
        customsDuty: fmt(pick('customs')),
        vat: fmt(vat),
        bibiServiceFee: fmt(pick('companyServices')),
        transportBg: fmt(pick('euDelivery')),
        technotest: fmt(0),
        customsTotal: fmt(customsTotalDisplay),
        totalApproximate: fmt((calculation.total || 0) + vat),
      }
    : undefined;

  return (
    <div className={`singleCarRoot ${styles.singleCar}`}>
      <NavigationHeader
        breadcrumb={breadcrumb}
        title={title}
        vin={car?.auction?.vin || car?.vehicle?.vin || (vinOrSlug ? String(vinOrSlug).toUpperCase() : '')}
        loading={loading}
        shareSnapshot={car ? {
          title: car.title,
          make: car.vehicle?.brand,
          model: car.vehicle?.model,
          year: car.vehicle?.year,
          price: car.auction?.bidPriceRaw,
          currency: 'EUR',
          image: Array.isArray(car.images) && car.images.length ? car.images[0] : undefined,
          lot_number: car.auction?.lot,
          auction_name: car.auction?.auction,
          odometer: (() => {
            const raw = car.raw?.data?.odometer;
            const n = typeof raw === 'number' ? raw : parseInt(String(raw || '').replace(/[^\d]/g, ''), 10);
            return Number.isFinite(n) && n > 0 ? n : undefined;
          })(),
          odometer_unit: car.raw?.data?.odometer_unit,
          description: car.description,
        } : null}
      />

      {loading && !car && (
        <div className={styles.stateBox}>
          <div className={styles.spinner} />
          <div className={styles.stateText}>
            {t.loadingVehicleData} <code>{String(vinOrSlug || '').toUpperCase()}</code>…
          </div>
        </div>
      )}

      {!loading && error === 'not_found' && (
        <div className={styles.stateBox}>
          <div className={styles.stateTitle}>{t.vinNotFound}</div>
          <div className={styles.stateText}>
            {t.vinNotFoundDesc.split('{vin}').map((chunk, i, arr) => (
              <React.Fragment key={i}>
                {chunk}
                {i < arr.length - 1 && (
                  <code>{String(vinOrSlug || '').toUpperCase()}</code>
                )}
              </React.Fragment>
            ))}
          </div>
          <button type="button" className={styles.stateBtn} onClick={handleBackToCatalog}>
            {t.browseCatalog}
          </button>
        </div>
      )}

      {!loading && error && error !== 'not_found' && (
        <div className={styles.stateBox}>
          <div className={styles.stateTitle}>{t.couldNotLoad}</div>
          <div className={styles.stateText}>{typeof error === 'string' ? error : t.unexpectedErr}</div>
          <button type="button" className={styles.stateBtn} onClick={() => window.location.reload()}>
            {t.tryAgain}
          </button>
        </div>
      )}

      {!loading && car && (() => {
        const grand = Math.round((calc?.calculation?.total || 0) + (calc?.calculation?.vehiclePrice ? calc.calculation.vehiclePrice * 0.2 : 0));
        const carWithTotal = grand > 0
          ? { ...car, auction: { ...car.auction, estimatedTotalPrice: `€${grand.toLocaleString('en-US')}` } }
          : car;
        return (
          <>
            {/* Freshness/Live badge hidden by product decision (no production
                status chips on the customer-facing page). */}
            <ImageGrid car={carWithTotal} onExactCostClick={handleExactCost} />
            <div id="cost-calculator">
              <CostCalculator
                preFilled={preFilled}
                costs={costs}
                loading={calcLoading}
                onFullCalculationClick={handleExactCost}
              />
            </div>
            <NavigationFooter />
            <SimilarCars />
          </>
        );
      })()}
    </div>
  );
};

export default SingleCarPage;
