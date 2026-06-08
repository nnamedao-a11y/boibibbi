import React, { useEffect, useMemo, useRef, useState } from 'react';
import Button1 from './Button1';
import { useLang } from '../../../../i18n';
import { useSingleCarT } from '../i18n';
import { optimizeImage, ImageSize } from '../../../../lib/optimizeImage';
import styles from './ImageGrid.module.css';

/**
 * Single Car page — photo grid (LEFT) + info card (RIGHT).
 *
 * Pixel & typography spec (May 2026):
 *   • LEFT  — hero 848×636 + 2 rows of 4 thumbs (203×152, gap 12)
 *   • RIGHT — info card 848×964
 *   • TRADED button     : 156×34, Mazzard 14 SemiBold
 *   • Section titles    : Mazzard 18 SemiBold
 *   • Field labels      : Mazzard 14 Medium  white
 *   • Field values      : Mazzard 14 Bold    orange
 *   • Description text  : Mazzard 14 Regular #949494
 *   • CTA button        : 327×45, Mazzard 14 Medium
 *
 * Data is supplied by <SingleCarPage> from `/api/vin/<VIN>` via the
 * `useCarByVin` hook (see ../useCarByVin.js + ../formatters.js).
 */

const PLACEHOLDER = '/single-car/image-15@2x.png';

const ImageGrid = ({ className = '', car, onExactCostClick = () => {} }) => {
  const { vehicle, auction, status, images = [], imageCount, description } = car || {};
  const { lang } = useLang();
  const t = useSingleCarT(lang);

  // Lay out 1 hero + 2 rows × 4 thumbs (row 2's last cell = "ALL IMAGES" tile).
  // Show ONLY real images — never pad with placeholders. This keeps the
  // gallery honest: 1 real photo → only 1 photo rendered, 9+ real photos →
  // hero + 7 thumbs + "ALL IMAGES" tile.
  const hasImages = Array.isArray(images) && images.length > 0;
  const hero = hasImages ? images[0] : PLACEHOLDER;
  const thumbsRow1 = useMemo(() => {
    if (!hasImages) return [];
    return images.slice(1, 5);
  }, [images, hasImages]);
  const thumbsRow2 = useMemo(() => {
    if (!hasImages) return [];
    return images.slice(5, 8);
  }, [images, hasImages]);
  const realImageCount = hasImages ? images.length : 0;
  const totalImageCount = imageCount && imageCount > realImageCount ? imageCount : realImageCount;

  const [galleryOpen, setGalleryOpen] = useState(false);

  /* ── Mobile horizontal swipe gallery ───────────────────────────────────
   * On ≤ 768 px the desktop grid layout collapses into a single-column
   * stack where the photos become a horizontally-scrollable carousel
   * (360 × 240 cards, scroll-snap). The pagination dots below mirror the
   * currently snapped slide. */
  /* All images for the mobile carousel (cap 12 just for safety). */
  const mobileImages = useMemo(() => {
    const arr = Array.isArray(images) && images.length ? images : [PLACEHOLDER];
    return arr.slice(0, 12);
  }, [images]);
  const scrollerRef = useRef(null);
  const [activeSlide, setActiveSlide] = useState(0);
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return undefined;
    const onScroll = () => {
      const w = el.clientWidth || 1;
      const idx = Math.round(el.scrollLeft / w);
      setActiveSlide(Math.max(0, Math.min(mobileImages.length - 1, idx)));
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, [mobileImages.length]);

  /* Pagination dots — strict spec: MAX 8 dots, with windowed mapping when
   * total photos > 8 (e.g. 30 photos → 8 dots advance proportionally). */
  const totalSlides = mobileImages.length;
  const dotsCount = Math.min(totalSlides, 8);
  const activeDotIdx = totalSlides <= 8
    ? activeSlide
    : Math.min(dotsCount - 1, Math.floor((activeSlide / Math.max(1, totalSlides - 1)) * (dotsCount - 1) + 0.0001));

  return (
    <section className={[styles.imageGridWrapper, className].join(' ')}>
      <div className={styles.imageGrid}>
        {/* ── MOBILE: horizontal swipe gallery (visible ≤ 768 px) ──── */}
        <div className={styles.mobileGallery} data-testid="single-car-mobile-gallery">
          <div
            className={styles.mobileScroller}
            ref={scrollerRef}
            role="region"
            aria-label={t.photoGallery}
          >
            {mobileImages.map((src, i) => (
              <button
                type="button"
                key={`m-${i}`}
                className={styles.mobileSlide}
                onClick={() => setGalleryOpen(true)}
                aria-label={`${t.photo} ${i + 1}`}
              >
                <img
                  className={styles.mobileSlideImg}
                  loading="lazy"
                  alt=""
                  src={optimizeImage(src, ImageSize.cardMobile)}
                  onError={(e) => { e.currentTarget.src = PLACEHOLDER; }}
                />
              </button>
            ))}
          </div>
          <div className={styles.mobileDots} role="tablist" aria-label={t.galleryPagination}>
            {Array.from({ length: dotsCount }).map((_, i) => (
              <span
                key={`dot-${i}`}
                className={[styles.mobileDot, i === activeDotIdx ? styles.mobileDotActive : ''].join(' ')}
                data-testid={i === activeDotIdx ? 'mobile-dot-active' : 'mobile-dot'}
              />
            ))}
          </div>
        </div>

        {/* ── MOBILE: info card (visible ≤ 768 px, hidden on desktop) ─── */}
        <div className={styles.mobileInfoCard} data-testid="single-car-mobile-info">
          <div className={styles.mobileInfoInner}>
            {/* TRADED chip — right aligned, rounded 4 px */}
            <div className={styles.mobileTradedRow}>
              <button type="button" className={styles.mobileTradedBtn}>{t.tradedChip}</button>
            </div>

            {/* Vehicle Information */}
            <section className={styles.mobileSection}>
              <div className={styles.mobileSectionHeader}>
                <h3 className={styles.mobileSectionTitle}>{t.vehicleInformation}</h3>
              </div>
              <div className={styles.mobileVehicleGrid}>
                <MobRow label={t.brand} value={vehicle?.brand} />
                <MobRow label={t.model} value={vehicle?.model} />
                <MobRow label={t.year} value={vehicle?.year} />
                <MobRow label={t.mileage} value={vehicle?.mileage} />
                <MobRow label={t.damage} value={vehicle?.damage} />
                <MobRow label={t.fuel} value={vehicle?.fuel} />
                <MobRow label={t.transmission} value={vehicle?.transmission} />
                <MobRow label={t.bodyType} value={vehicle?.bodyType} />
                <MobRow label={t.driveType} value={vehicle?.driveType} />
                <MobRow label={t.engineVolume} value={vehicle?.engineVolume} />
                <MobRow label={t.location} value={vehicle?.location} weight="bold" span />
              </div>
            </section>

            {/* Auction Details */}
            <section className={styles.mobileSection}>
              <div className={styles.mobileSectionHeader}>
                <h3 className={styles.mobileSectionTitle}>{t.auctionDetails}</h3>
              </div>
              <div className={styles.mobileVehicleGrid}>
                <MobRow label={t.lot} value={auction?.lot} weight="regular" />
                <MobRow label={t.vin} value={auction?.vin} weight="regular" />
                <MobRow label={t.auction} value={auction?.auction} weight="regular" />
                <MobRow label={t.updated} value={auction?.updated} weight="regular" />
                <MobRow label={t.bidPrice} value={auction?.bidPrice} large />
                <MobRow label={t.estimatedTotalPrice} value={auction?.estimatedTotalPrice} large />
              </div>
            </section>

            {/* Description */}
            <section className={[styles.mobileSection, styles.mobileSectionDescription].join(' ')}>
              <div className={styles.mobileSectionHeader}>
                <h3 className={styles.mobileSectionTitle}>{t.description}</h3>
              </div>
              <div className={styles.mobileDescription}>{description}</div>
            </section>

            {/* CTA — solid orange button with 4 px radius */}
            <button
              type="button"
              className={styles.mobileCta}
              onClick={onExactCostClick}
              data-testid="mobile-exact-cost-btn"
            >
              {t.exactCostInBulgaria.toUpperCase()}
            </button>
          </div>
        </div>

        {/* ── LEFT: photos ─────────────────────────────────────────────── */}
        <div className={styles.imageColumn}>
          <button
            type="button"
            className={styles.heroButton}
            onClick={() => setGalleryOpen(true)}
            aria-label={t.openPhotoGallery}
          >
            <img
              className={styles.image15Icon}
              loading="lazy"
              width={848}
              height={636}
              alt={car?.title || ''}
              src={optimizeImage(hero, ImageSize.hero)}
              onError={(e) => { e.currentTarget.src = PLACEHOLDER; }}
            />
          </button>
          <div className={styles.thumbRow}>
            {thumbsRow1.map((src, i) => (
              <button
                type="button"
                key={`r1-${i}`}
                className={styles.thumbButton}
                onClick={() => setGalleryOpen(true)}
                aria-label={`${t.photo} ${i + 2}`}
              >
                <img
                  className={styles.image16Icon}
                  loading="lazy"
                  width={203}
                  height={152}
                  alt=""
                  src={optimizeImage(src, ImageSize.thumb)}
                  onError={(e) => { e.currentTarget.src = PLACEHOLDER; }}
                />
              </button>
            ))}
          </div>
          <div className={styles.thumbRow}>
            {thumbsRow2.map((src, i) => (
              <button
                type="button"
                key={`r2-${i}`}
                className={styles.thumbButton}
                onClick={() => setGalleryOpen(true)}
                aria-label={`${t.photo} ${i + 6}`}
              >
                <img
                  className={styles.image16Icon}
                  loading="lazy"
                  width={203}
                  height={152}
                  alt=""
                  src={optimizeImage(src, ImageSize.thumb)}
                  onError={(e) => { e.currentTarget.src = PLACEHOLDER; }}
                />
              </button>
            ))}
            {totalImageCount > 1 && (
              <button
                type="button"
                className={styles.allImagesCard}
                onClick={() => setGalleryOpen(true)}
                aria-label={t.showAllPhotos.replace('{count}', totalImageCount)}
                data-testid="all-images-tile"
              >
                <span className={styles.allImagesInner}>
                  <svg
                    className={styles.allImagesIcon}
                    viewBox="0 0 24 24"
                    fill="none"
                    aria-hidden="true"
                    focusable="false"
                  >
                    <path
                      d="M19 3H5C3.9 3 3 3.9 3 5V19C3 20.1 3.9 21 5 21H19C20.1 21 21 20.1 21 19V5C21 3.9 20.1 3 19 3ZM5 4.5H19C19.3 4.5 19.5 4.7 19.5 5V13.4L16.5 10.5C16.2 10.2 15.7 10.2 15.5 10.5L11.9 14L9 12C8.7 11.8 8.4 11.8 8.2 12L4.6 14.6V5C4.5 4.7 4.7 4.5 5 4.5ZM19 19.5H5C4.7 19.5 4.5 19.3 4.5 19V16.6L8.6 13.6L11.6 15.5C11.9 15.7 12.3 15.7 12.5 15.4L16 12L19.5 15.4V19C19.5 19.3 19.3 19.5 19 19.5Z"
                      fill="currentColor"
                    />
                  </svg>
                  <span className={styles.allImagesCount}>
                    {`${t.allImages} (${totalImageCount})`}
                  </span>
                </span>
              </button>
            )}
          </div>
        </div>

        {/* ── RIGHT: info card ────────────────────────────────────────── */}
        <div className={styles.infoCard}>
          <div className={styles.infoCardInner}>
            <div className={styles.infoBlocks}>
              {/* STATUS chip — TRADED per Figma design (fixed label) */}
              <div className={styles.tradedRow}>
                <button type="button" className={styles.tradedButton}>
                  <span className={styles.tradedText}>{t.tradedChip}</span>
                </button>
              </div>

              {/* VEHICLE INFORMATION */}
              <section className={styles.section}>
                <div className={styles.sectionHeader}>
                  <h3 className={styles.sectionTitle}>{t.vehicleInformation}</h3>
                </div>
                <div className={styles.detailsGrid}>
                  <div className={styles.detailsCol}>
                    <Row label={t.brand}    value={vehicle?.brand} />
                    <Row label={t.model}    value={vehicle?.model} />
                    <Row label={t.year}     value={vehicle?.year} />
                    <Row label={t.mileage}  value={vehicle?.mileage} />
                    <Row label={t.damage}   value={vehicle?.damage} />
                    <Row label={t.location} value={vehicle?.location} />
                  </div>
                  <div className={styles.detailsCol}>
                    <Row label={t.fuel}         value={vehicle?.fuel} />
                    <Row label={t.transmission} value={vehicle?.transmission} />
                    <Row label={t.bodyType}     value={vehicle?.bodyType} />
                    <Row label={t.driveType}    value={vehicle?.driveType} />
                    <Row label={t.engineVolume} value={vehicle?.engineVolume} />
                  </div>
                </div>
              </section>

              {/* AUCTION DETAILS */}
              <section className={styles.section}>
                <div className={styles.sectionHeader}>
                  <h3 className={styles.sectionTitle}>{t.auctionDetails}</h3>
                </div>
                <div className={styles.detailsGrid}>
                  <div className={styles.detailsCol}>
                    <Row label={t.lot}     value={auction?.lot} />
                    <Row label={t.vin}     value={auction?.vin} />
                    <Row label={t.auction} value={auction?.auction} />
                    <Row label={t.updated} value={auction?.updated} />
                  </div>
                  <div className={styles.detailsCol}>
                    <div className={styles.detailRow}>
                      <div className={styles.detailLabel}>{t.bidPrice}</div>
                      <h3 className={styles.detailValueLg}>{auction?.bidPrice || '—'}</h3>
                    </div>
                    <div className={styles.detailRow}>
                      <div className={styles.detailLabel}>{t.estimatedTotalPrice}</div>
                      <h3 className={styles.detailValueLg}>{auction?.estimatedTotalPrice || '—'}</h3>
                    </div>
                  </div>
                </div>
              </section>

              {/* DESCRIPTION */}
              <section className={styles.section}>
                <div className={styles.sectionHeader}>
                  <h3 className={styles.sectionTitle}>{t.description}</h3>
                </div>
                <div className={styles.description}>{description}</div>
              </section>
            </div>

            {/* CTA — single centered button per Figma spec (327×45) */}
            <div className={styles.ctaSlot}>
              <Button1
                property1="Default"
                cONTACTUS={t.exactCostInBulgaria}
                showBUTTON
                bUTTONWidth="327px"
                bUTTONBorder="none"
                cONTACTUSTextTransform="uppercase"
                onClick={onExactCostClick}
              />
            </div>
          </div>
        </div>
      </div>

      {galleryOpen && <Lightbox images={images} onClose={() => setGalleryOpen(false)} t={t} />}
    </section>
  );
};

/** Label + value row. Label = 14 Medium white, value = 14 Bold orange. */
const Row = ({ label, value }) => (
  <div className={styles.detailRow}>
    <div className={styles.detailLabel}>{label}</div>
    <div className={styles.detailValue}>{value || '—'}</div>
  </div>
);

/** Mobile two-col grid row — gray label on top, orange value below.
 *  `weight`  → value font-weight: 'regular' | 'medium' | 'bold' (default medium)
 *  `large`   → 20 px H Medium (Bid Price / Estimated Total Price)
 *  `span`    → row spans both grid columns (Location) */
const MobRow = ({ label, value, weight = 'medium', large = false, span = false }) => {
  const wClass = weight === 'bold'
    ? styles.mobValueBold
    : weight === 'regular'
      ? styles.mobValueRegular
      : styles.mobValueMedium;
  return (
    <div
      className={[
        styles.mobRow,
        span ? styles.mobRowSpan : '',
        large ? styles.mobRowLarge : '',
      ].join(' ')}
    >
      <div className={styles.mobLabel}>{label}</div>
      <div className={[styles.mobValue, wClass].join(' ')}>{value || '—'}</div>
    </div>
  );
};

/** Minimal full-screen image lightbox (keyboard navigable). */
const Lightbox = ({ images = [], onClose, t }) => {
  const [idx, setIdx] = useState(0);
  const total = images.length;
  React.useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') setIdx((i) => (i + 1) % total);
      if (e.key === 'ArrowLeft') setIdx((i) => (i - 1 + total) % total);
    };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [total, onClose]);

  if (!total) return null;
  return (
    <div className={styles.lightbox} role="dialog" aria-modal="true">
      <button type="button" className={styles.lightboxClose} onClick={onClose} aria-label={t?.closeGallery || 'Close gallery'}>
        ×
      </button>
      <button
        type="button"
        className={`${styles.lightboxNav} ${styles.lightboxPrev}`}
        onClick={() => setIdx((i) => (i - 1 + total) % total)}
        aria-label={t?.previousPhoto || 'Previous photo'}
      >
        ‹
      </button>
      <img className={styles.lightboxImg} src={optimizeImage(images[idx], ImageSize.hero)} alt="" />
      <button
        type="button"
        className={`${styles.lightboxNav} ${styles.lightboxNext}`}
        onClick={() => setIdx((i) => (i + 1) % total)}
        aria-label={t?.nextPhoto || 'Next photo'}
      >
        ›
      </button>
      <div className={styles.lightboxCount}>{idx + 1} / {total}</div>
    </div>
  );
};

export default ImageGrid;
