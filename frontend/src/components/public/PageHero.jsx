import React from 'react';
import { Link } from 'react-router-dom';
import AnimatedHeading from '../AnimatedHeading';
import styles from './PageHero.module.css';

/**
 * BIBI Cars — **shared public-page hero** (breadcrumb + page title).
 *
 * Used by /catalog, /calculator, /about, /contacts (and any future public
 * page that needs the same top section). Replaces the previous per-page
 * implementations so the typography, colour and spacing are **byte-identical**
 * across all public pages on desktop (≥ 769 px).
 *
 * STRICT desktop spec (≥ 769 px):
 *   • container padding L/R     : 100 px
 *   • header bottom → breadcrumb: 52 px (handled by .hero padding-top)
 *   • breadcrumb font           : Mazzard H SemiBold 20, uppercase
 *       – return links + slash  : #5E5E5E (grey)
 *       – current crumb         : #FEAE00 (orange)
 *   • breadcrumb → title gap    : 76 px (margin-top on .title)
 *   • title font                : Mazzard H Bold 80, white, uppercase
 *
 * Mobile (≤ 768 px) styling is **deliberately preserved as-is** by each
 * consuming page's CSS — this component only emits a stable, semantic DOM
 * (`.pageHero`, `.crumbs`, `.crumbLink`, `.crumbSep`, `.crumbActive`,
 * `.title`, `.titleRow`) that pages can scope-style further if they need
 * to override mobile bits without breaking the desktop unity.
 *
 * Props
 * ─────
 *   • home          : string — first breadcrumb label (default "HOME")
 *   • homeTo        : string — link target for the first crumb (default "/")
 *   • crumbs        : array of {label, to?} for intermediate crumbs.
 *                     The LAST one is rendered as the active orange crumb
 *                     (no link). Items before the last are rendered as
 *                     navigable grey links separated by `/`.
 *   • title         : string — H1 text
 *   • rightSlot     : optional ReactNode — rendered to the right of the
 *                     title on desktop (used by /catalog for the inline
 *                     search bar). Stacks below the title on mobile.
 *   • testId        : string — root data-testid (default "page-hero")
 */
const PageHero = ({
  home = 'HOME',
  homeTo = '/',
  crumbs = [],
  title = '',
  rightSlot = null,
  className = '',
  testId = 'page-hero',
}) => {
  const lastIdx = crumbs.length - 1;
  return (
    <section className={[styles.hero, className].join(' ')} data-testid={testId}>
      <div className={styles.container}>
        <nav className={styles.crumbs} aria-label="Breadcrumb">
          <Link to={homeTo} className={styles.crumbLink} data-testid="hero-crumb-home">
            {home}
          </Link>
          {crumbs.map((c, i) => {
            const isLast = i === lastIdx;
            return (
              <React.Fragment key={`${c.label}-${i}`}>
                <span className={styles.crumbSep}>/</span>
                {isLast ? (
                  <span
                    className={styles.crumbActive}
                    aria-current="page"
                    data-testid={`hero-crumb-current`}
                  >
                    {c.label}
                  </span>
                ) : (
                  <Link
                    to={c.to || '/'}
                    className={styles.crumbLink}
                    data-testid={`hero-crumb-${i}`}
                  >
                    {c.label}
                  </Link>
                )}
              </React.Fragment>
            );
          })}
        </nav>
        <div className={styles.titleRow}>
          <AnimatedHeading
            as="h1"
            className={styles.title}
            text={title}
            data-testid="hero-title"
          />
          {rightSlot ? <div className={styles.rightSlot}>{rightSlot}</div> : null}
        </div>
      </div>
    </section>
  );
};

export default PageHero;
