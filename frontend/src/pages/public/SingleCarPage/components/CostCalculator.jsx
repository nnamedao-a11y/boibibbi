import React, { useState } from 'react';
import Button1 from './Button1';
import { useLang } from '../../../../i18n';
import { useSingleCarT } from '../i18n';
import styles from './CostCalculator.module.css';

/**
 * FrameComponent4 — "Cost calculator for this car" block. EN/BG i18n.
 */
const CostCalculator = ({
  className = '',
  preFilled = {
    auction: 'COPART',
    car: 'LUcid air pure 2025',
    fuelType: 'Electric (EV)',
    mileage: '23,840 km',
  },
  costs = {
    carAuction: '€4,868',
    portLoadingHandling: '€280',
    oceanFreight: '€0',
    marineInsurance: '€0',
    portHandlingBg: '€0',
    logisticsTotal: '€3,549',
    customsDuty: '€0',
    vat: '€583',
    bibiServiceFee: '€940',
    transportBg: '€1,000',
    technotest: '€0',
    customsTotal: '€1,127',
    totalApproximate: '€9,544',
  },
  onFullCalculationClick = () => {},
}) => {
  const [purchasePrice, setPurchasePrice] = useState('');
  const { lang } = useLang();
  const t = useSingleCarT(lang);
  return (
    <main className={[styles.calculatorContainerWrapper, className].join(' ')}>
      <div className={styles.calculatorContainer}>
        {/* Header */}
        <div className={styles.calculatorHeader}>
          <h1 className={styles.costCalculatorForContainer}>
            <span>{t.costCalculatorPart1}</span>
            <span className={styles.calculator}>
              {t.costCalculatorPart2}
              <br />
            </span>
            <span>{t.costCalculatorPart3}</span>
          </h1>
          <div className={styles.allKeyParameters}>
            {t.allKeyParameters}
          </div>
        </div>

        <div className={styles.auctionParameters}>
          {/* LEFT — Pre-filled from auction */}
          <section className={styles.frameParent}>
            <div className={styles.preFilledFromAuctionWrapper}>
              <div className={styles.preFilledFromAuction}>{t.preFilledFromAuction}</div>
            </div>
            <div className={styles.frameGroup}>
              <Pair label={t.auctionLbl} value={preFilled.auction} />
              <Pair label={t.carLbl} value={preFilled.car} />
              <Pair label={t.fuelTypeLbl} value={preFilled.fuelType} />
              <Pair label={t.mileageLbl} value={preFilled.mileage} />
            </div>
          </section>

          {/* RIGHT — Cost estimate */}
          <div className={styles.estimationHeaderParent}>
            <div className={styles.preFilledFromAuctionWrapper}>
              <div className={styles.preFilledFromAuction}>{t.costEstimate}</div>
            </div>
            <div className={styles.costBreakdown}>
              {/* CAR & AUCTION subtotal block */}
              <section className={styles.frameContainer}>
                <div className={styles.vehiclePurchasePriceParent}>
                  <div className={styles.vehiclePurchasePriceContainer}>
                    <span>{t.vehiclePurchasePrice}</span>
                    <span className={styles.calculator}>*</span>
                  </div>
                  <div className={styles.priceEntry}>
                    <img
                      className={styles.priceCurrency}
                      src="/single-car/euro-icon.svg"
                      alt="€"
                      width={14}
                      height={14}
                    />
                    <input
                      className={styles.fillTheSumm}
                      placeholder={t.fillTheSum}
                      type="text"
                      inputMode="numeric"
                      value={
                        purchasePrice
                          ? String(purchasePrice).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
                          : ''
                      }
                      onChange={(e) => {
                        // Digits only, cap at 7 digits (covers million-class
                        // sums). Display formatting (thousand-spacing) is
                        // applied above via the `value` expression.
                        const digits = e.target.value.replace(/\D/g, '').slice(0, 7);
                        setPurchasePrice(digits);
                      }}
                      maxLength={9} /* "9 999 999" → 9 chars including spaces */
                      data-testid="single-car-price-input"
                    />
                  </div>
                </div>
                <div className={styles.frameWrapper}>
                  <div className={styles.auctionFeeWrapper}>
                    <div className={styles.auctionFee}>{t.auctionFee}</div>
                  </div>
                </div>
                <div className={styles.frameDiv}>
                  <div className={styles.carAuctionWrapper}>
                    <div className={styles.auctionFee}>{t.carAndAuction}</div>
                  </div>
                  <div className={styles.subTotal}>{costs.carAuction}</div>
                </div>
              </section>

              {/* LOGISTICS subtotal block */}
              <section className={styles.frameContainer}>
                <Line label={t.portLoadingHandling} value={costs.portLoadingHandling} />
                <Line label={t.oceanFreight} value={costs.oceanFreight} />
                <Line label={t.marineInsurance} value={costs.marineInsurance} />
                <Line label={t.portHandlingBulgaria} value={costs.portHandlingBg} />
                <div className={styles.frameDiv}>
                  <div className={styles.logisticsToBulgariaWrapper}>
                    <div className={styles.auctionFee}>{t.logisticsToBulgaria}</div>
                  </div>
                  <div className={styles.subTotal}>{costs.logisticsTotal}</div>
                </div>
              </section>

              {/* CUSTOMS subtotal block */}
              <section className={styles.frameContainer}>
                <Line label={t.customsDuty} value={costs.customsDuty} />
                <Line label={t.vatBulgaria} value={costs.vat} />
                <Line label={t.bibiServiceFee} value={costs.bibiServiceFee} />
                <Line label={t.transportToBulgaria} value={costs.transportBg} />
                <Line label={t.technotest} value={costs.technotest} />
                <div className={styles.frameParent4}>
                  <div className={styles.customsFinalFeesWrapper}>
                    <div className={styles.auctionFee}>{t.customsAndFinalFees}</div>
                  </div>
                  <div className={styles.subTotal}>{costs.customsTotal}</div>
                </div>
              </section>

              {/* TOTAL */}
              <div className={styles.totalCost}>
                <h3 className={styles.totalApproximateCost}>{t.totalApproximateCost}</h3>
                <h3 className={styles.totalApproximateCost}>{costs.totalApproximate}</h3>
              </div>

              {/* Disclaimer */}
              <div className={styles.estimateDisclaimer}>
                <div className={styles.approximateEstimateFinalContainer}>
                  <span className={styles.approximateEstimateFinalCo}>
                    <span className={styles.approximateEstimate}>{t.approximateEstimate}</span>
                    <span>
                      {t.approximateEstimateRest}
                    </span>
                  </span>
                </div>
              </div>
            </div>

            <div className={styles.ctaRow}>
              <Button1
                property1="Default"
                cONTACTUS={t.iWantCompleteCalculation}
                showBUTTON
                bUTTONWidth="327px"
                bUTTONBorder="none"
                cONTACTUSTextTransform="uppercase"
                onClick={onFullCalculationClick}
              />
            </div>
          </div>
        </div>
      </div>
    </main>
  );
};

const Pair = ({ label, value }) => (
  <div className={styles.auctionParent}>
    <div className={styles.auction}>{label}</div>
    <div className={styles.copart}>{value}</div>
  </div>
);

const Line = ({ label, value }) => (
  <div className={styles.portLoadingHandlingUsaParent}>
    <div className={styles.auctionFee}>{label}</div>
    <div className={styles.lineValue}>{value}</div>
  </div>
);

export default CostCalculator;
