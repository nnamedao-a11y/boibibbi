/**
 * MostPopularBrandsBlock — 1–1 port of Figma reference (BIBICARS 5.zip)
 *
 *   File:   components/brand-logos1.module.css + brand-logos1.tsx
 *   Font:   Mazzard, weight 400
 *   Title:  32px uppercase, line-height 99.9%
 *   Card:   bg #000, padding 61.6px 132px 77.8px 161px, gap 86.4px
 *   Logos:  Audi · BMW · Jeep · Toyota · Ford · Hyundai (PNG, /public/figma/pngwing-com-*.png)
 *           divided by 1px amber verticals, logo strip height 88.6px
 *   Link:   other brands + (16px, orange #FEAE00, underline, uppercase)
 *   Outer:  popularBrands width 1706px, gap 80.5px (between card and link)
 *           .brandLogos wrapper: padding 0 24px 219px 20px  (we drop the 219px to keep page compact)
 */
import React from 'react';
import { Link } from 'react-router-dom';

const BRANDS = [
  { src: '/figma/pngwing-com-4-1@2x.webp', alt: 'Audi',    slug: 'Audi'    },
  { src: '/figma/pngwing-com-3-1@2x.webp', alt: 'BMW',     slug: 'BMW'     },
  { src: '/figma/pngwing-com-5-1@2x.webp', alt: 'Jeep',    slug: 'Jeep'    },
  { src: '/figma/pngwing-com-1-1@2x.webp', alt: 'Toyota',  slug: 'Toyota'  },
  { src: '/figma/pngwing-com-1@2x.webp',   alt: 'Ford',    slug: 'Ford'    },
  { src: '/figma/pngwing-com-6-1@2x.webp', alt: 'Hyundai', slug: 'Hyundai' },
];

export default function MostPopularBrandsBlock() {
  return (
    <section
      data-testid="most-popular-brands"
      style={{
        alignSelf: 'stretch',
        display: 'flex',
        justifyContent: 'center',
        padding: '0 24px 120px 20px',
        boxSizing: 'border-box',
        backgroundColor: '#1d1d1b', /* color-gray-200 — same subtle dark outer bg as reference */
        fontFamily: 'Mazzard, "Mazzard H", system-ui, sans-serif',
      }}
    >
      <div
        className="popular-brands-inner"
        style={{
          width: 1706,
          maxWidth: '100%',
          display: 'flex',
          flexDirection: 'column',
          gap: 80.5,
        }}
      >
        {/* Black card */}
        <div
          className="popular-brands-card"
          style={{
            alignSelf: 'stretch',
            backgroundColor: '#000',
            padding: '61.6px 132px 77.8px 161px',
            boxSizing: 'border-box',
            display: 'flex',
            flexDirection: 'column',
            gap: 86.4,
          }}
        >
          {/* Title row */}
          <div style={{ width: '100%', display: 'flex', justifyContent: 'center' }}>
            <h2
              style={{
                margin: 0,
                fontFamily: 'inherit',
                fontWeight: 400,
                fontSize: 32,
                lineHeight: '99.9%',
                color: '#FFFFFF',
                textTransform: 'uppercase',
              }}
            >
              most popular brands
            </h2>
          </div>

          {/* Logo row */}
          <div
            className="popular-brands-row"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 77.9,
              flexWrap: 'wrap',
              width: '100%',
            }}
          >
            {BRANDS.map((b, i) => (
              <React.Fragment key={b.slug}>
                <Link
                  to={`/catalog?make=${encodeURIComponent(b.slug)}`}
                  data-testid={`brand-${b.slug.toLowerCase()}`}
                  className="pop-brand-link"
                  style={{
                    flex: '1 1 0',
                    minWidth: 100,
                    height: 88.6,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    /* Clip any over-spill from the inner image (radial halo
                       baked into some PNGs + hover scale) so it cannot
                       cover the adjacent orange separators. */
                    overflow: 'hidden',
                    position: 'relative',
                    zIndex: 1,
                  }}
                >
                  <img
                    src={b.src}
                    alt={b.alt}
                    className="pop-brand-img"
                    style={{
                      maxWidth: '85%',
                      maxHeight: '85%',
                      width: 'auto',
                      height: 'auto',
                      objectFit: 'contain',
                      transition: 'transform 180ms ease, filter 180ms ease',
                      transformOrigin: 'center',
                    }}
                  />
                </Link>
                {i < BRANDS.length - 1 && (
                  <div
                    aria-hidden="true"
                    className="pop-brand-sep"
                    style={{
                      width: 1,
                      alignSelf: 'stretch',
                      backgroundColor: '#FEAE00',
                      flexShrink: 0,
                      position: 'relative',
                      zIndex: 5,
                    }}
                  />
                )}
              </React.Fragment>
            ))}
          </div>
        </div>

        {/* other brands + */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            fontSize: 16,
            color: '#FEAE00',
          }}
        >
          <Link
            to="/catalog"
            style={{
              position: 'relative',
              textDecoration: 'underline',
              lineHeight: '99.9%',
              textTransform: 'uppercase',
              cursor: 'pointer',
              color: 'inherit',
              fontFamily: 'inherit',
              fontWeight: 400,
            }}
          >
            other brands +
          </Link>
        </div>
      </div>

      {/* Responsive tweaks ported from brand-logos1.module.css */}
      <style>{`
        /* Hover effect applied to the inner image only. Logos are clipped
           by .pop-brand-link (overflow:hidden) so the scaled image can
           NEVER cover the adjacent orange separators (which sit at
           z-index 5 above their flex items). We use a tiny scale + a
           subtle brightness pop so the logo "lights up" without growing
           outside its slot. */
        [data-testid="most-popular-brands"] .pop-brand-link:hover .pop-brand-img,
        [data-testid="most-popular-brands"] .pop-brand-link:focus-visible .pop-brand-img {
          transform: scale(1.04);
          filter: brightness(1.15);
        }
        @media (max-width: 1350px) {
          [data-testid="most-popular-brands"] .popular-brands-card {
            padding: 61.6px 80px 77.8px 80px !important;
          }
        }
        @media (max-width: 925px) {
          [data-testid="most-popular-brands"] {
            padding: 0 20px 142px 20px !important;
          }
          [data-testid="most-popular-brands"] .popular-brands-inner { gap: 40px !important; }
          [data-testid="most-popular-brands"] .popular-brands-card {
            padding: 43px 33px 43px 40px !important;
            gap: 43px !important;
          }
          [data-testid="most-popular-brands"] .popular-brands-card h2 {
            font-size: 26px !important;
          }
          [data-testid="most-popular-brands"] .popular-brands-row {
            gap: 39px !important;
          }
          [data-testid="most-popular-brands"] .pop-brand-sep { display: none !important; }
          [data-testid="most-popular-brands"] .pop-brand-link { flex: 0 0 30% !important; height: 60px !important; }
        }
        @media (max-width: 450px) {
          [data-testid="most-popular-brands"] .popular-brands-inner { gap: 20px !important; }
          [data-testid="most-popular-brands"] .popular-brands-card {
            padding: 40px 20px 51px 20px !important;
            gap: 22px !important;
          }
          [data-testid="most-popular-brands"] .popular-brands-card h2 {
            font-size: 19px !important;
          }
          [data-testid="most-popular-brands"] .popular-brands-row {
            gap: 19px !important;
          }
        }
      `}</style>
    </section>
  );
}
