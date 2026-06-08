/**
 * BlogArticlePage — public single article view ( /blog/:slug ).
 *
 * Pixel-precise Figma reference (May 2026, 1920) per user spec session 30:
 *   • Page L/R padding ............................. 100 px
 *   • Breadcrumb HOME / BLOG / TITLE ............... H Semibold 20 (TITLE = #FEAE00)
 *   • Anchor: breadcrumb top → header bottom ....... 52 px
 *   • Title (H Bold 64 white, wraps) ............... 148 px from header
 *   • Category pill + Date (24 gap) + min-read (gray) → 332 px from header
 *   • Pill ......................................... H Regular 14, border-radius 20
 *   • Cover image (1720 × 640) ..................... 422 px from header
 *   • Body block (1720 × 950 gray) ................. 128 px top + 128 px bottom padding
 *   • Body paragraph ............................... H Regular 20 #FFFFFF / #D6D6D6
 *   • Body headings ................................ H Regular 32 #FFFFFF
 *   • YOU MAY ALSO BE INTERESTED IN ................ heading → cards = 72 px
 *   • Related grid ................................. horizontal scroll, 100 px left,
 *                                                    right edge open ("боковой скролл"),
 *                                                    card 560 px, gap 24 px
 *   • Card padding 24, image → text 24, date → title 32, title → excerpt 24
 *   • Pagination = arrow buttons + numbered counter "01 / 10"
 */
import React, { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import DOMPurify from 'isomorphic-dompurify';
import { useLang } from '../../i18n';
import Breadcrumbs from '../../components/public/Breadcrumbs';
import styles from './BlogPage.module.css';
import singleStyles from './BlogArticlePage.module.css';

const API_URL = process.env.REACT_APP_BACKEND_URL || '';

const CATEGORY_TAG = {
  en: {
    analysis: 'MARKET ANALYSIS',
    guides:   'IMPORT GUIDES',
    news:     'NEWS',
    reviews:  'CAR REVIEWS',
    tips:     'AUCTION TIPS',
    costs:    'COSTS',
  },
  bg: {
    analysis: 'ПАЗАРЕН АНАЛИЗ',
    guides:   'РЪКОВОДСТВА',
    news:     'НОВИНИ',
    reviews:  'РЕВЮТА',
    tips:     'СЪВЕТИ',
    costs:    'РАЗХОДИ',
  },
};
const fallbackTag = (locale) => (locale === 'bg' ? 'НОВИНИ' : 'NEWS');

function formatDate(iso, locale) {
  if (!iso) return '';
  try {
    const lc = locale === 'bg' ? 'bg-BG' : 'en-US';
    return new Date(iso).toLocaleDateString(lc, { month: 'short', day: '2-digit', year: 'numeric' });
  } catch { return ''; }
}
function resolveImage(url) {
  if (!url) return '';
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  if (url.startsWith('/api/')) return `${API_URL}${url}`;
  return url;
}

const ArrowLeftCircle = ({ disabled }) => (
  <svg width="40" height="40" viewBox="0 0 40 40" aria-hidden="true">
    <circle cx="20" cy="20" r="19.5" stroke={disabled ? '#5E5E5E' : '#FEAE00'} fill="none" />
    <path d="M23 13 16 20l7 7" stroke={disabled ? '#5E5E5E' : '#FEAE00'} strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
const ArrowRightCircle = ({ disabled }) => (
  <svg width="40" height="40" viewBox="0 0 40 40" aria-hidden="true">
    <circle cx="20" cy="20" r="19.5" fill={disabled ? 'transparent' : '#FEAE00'} stroke={disabled ? '#5E5E5E' : '#FEAE00'} />
    <path d="M17 13l7 7-7 7" stroke={disabled ? '#5E5E5E' : '#18181B'} strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
const ArrowRightSm = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M5 12h14M13 5l7 7-7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const RELATED_CARD_W = 560;
const RELATED_CARD_GAP = 24;
/* Mobile spec (≤768 px): related card is 396 wide, gap between cards 16 px.
 * The pager + scroll-to-card use these values at runtime when the viewport
 * is mobile so the carousel still snaps to whole-card positions. */
const RELATED_CARD_W_MOBILE = 396;
const RELATED_CARD_GAP_MOBILE = 16;
const MOBILE_BREAKPOINT = 768;

/* "70 % activator" per user spec — index advances only when 70 % of the
 * next card is visible.  Implemented via Math.floor((scrollLeft + 0.7*step)
 * / step) so a swipe that exposes 70 % of card N + 1 → setRelatedIndex(N+1). */
function indexFromScroll(scrollLeft, step) {
  return Math.max(0, Math.floor((scrollLeft + 0.7 * step) / step));
}

export default function BlogArticlePage() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const { lang } = useLang();
  const tLocale = lang === 'bg' ? 'bg' : 'en';

  const [article, setArticle] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [relatedIndex, setRelatedIndex] = useState(0);
  /* Track mobile vs desktop so we can use the right card width/gap when
   * paginating the related-articles scroller.  Updates on resize. */
  const [isMobile, setIsMobile] = useState(
    typeof window !== 'undefined' && window.innerWidth <= MOBILE_BREAKPOINT
  );
  const scrollerRef = useRef(null);

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth <= MOBILE_BREAKPOINT);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const cardStep = isMobile
    ? RELATED_CARD_W_MOBILE + RELATED_CARD_GAP_MOBILE
    : RELATED_CARD_W + RELATED_CARD_GAP;

  /* Scroll all containers to top whenever the article changes.  Necessary
   * because PublicLayout / ScaledChrome may wrap the page in a transformed
   * scrollable element. */
  useEffect(() => {
    const reset = () => {
      try {
        window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
        document.documentElement.scrollTop = 0;
        document.body.scrollTop = 0;
        document.querySelectorAll('[data-scaled-chrome], main, [class*="scaledChrome"], [class*="layout"]').forEach((el) => {
          if (el && typeof el.scrollTop === 'number') el.scrollTop = 0;
        });
      } catch { /* ignore */ }
    };
    reset();
    const t = setTimeout(reset, 30);
    return () => clearTimeout(t);
  }, [slug]);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setNotFound(false);
    setRelatedIndex(0);
    axios
      .get(`${API_URL}/api/public/blog/articles/${encodeURIComponent(slug)}`, { params: { lang: tLocale } })
      .then((r) => { if (alive) setArticle(r.data); })
      .catch(() => { if (alive) setNotFound(true); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [slug, tLocale]);

  const breadcrumbT = useMemo(() => ({
    home: tLocale === 'bg' ? 'НАЧАЛО' : 'HOME',
    blog: tLocale === 'bg' ? 'БЛОГ'   : 'BLOG',
  }), [tLocale]);

  const related = article?.related || [];
  const totalRelated = related.length;

  const goRelated = useCallback((r) => navigate(`/blog/${r.slug || r.id}`), [navigate]);

  const scrollToCard = useCallback((newIndex) => {
    const safeIndex = Math.max(0, Math.min(totalRelated - 1, newIndex));
    setRelatedIndex(safeIndex);
    const el = scrollerRef.current;
    if (el) {
      el.scrollTo({
        left: safeIndex * cardStep,
        behavior: 'smooth',
      });
    }
  }, [totalRelated, cardStep]);

  const onPrev = () => scrollToCard(relatedIndex - 1);
  const onNext = () => scrollToCard(relatedIndex + 1);

  if (loading) {
    return (
      <div className={styles.page}>
        <div className={singleStyles.shell}>
          <div className={singleStyles.skeleton}>
            {tLocale === 'bg' ? 'Зареждане на статия…' : 'Loading article…'}
          </div>
        </div>
      </div>
    );
  }

  if (notFound || !article) {
    return (
      <div className={styles.page}>
        <div className={singleStyles.shell}>
          <div className={singleStyles.notFound}>
            <h1>{tLocale === 'bg' ? 'СТАТИЯТА НЕ Е НАМЕРЕНА' : 'ARTICLE NOT FOUND'}</h1>
            <p>
              {tLocale === 'bg'
                ? 'Тази статия може да е премахната или все още да не е публикувана.'
                : 'This article may have been removed or is not yet published.'}
            </p>
            <button onClick={() => navigate('/blog')} className={singleStyles.backBtn} data-testid="blog-back-btn">
              ← {tLocale === 'bg' ? 'НАЗАД КЪМ БЛОГА' : 'BACK TO BLOG'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  const safeBody = DOMPurify.sanitize(article.body || '', {
    ADD_ATTR: ['target', 'rel', 'allow', 'allowfullscreen', 'frameborder'],
  });
  const tagLabel = (CATEGORY_TAG[tLocale] || CATEGORY_TAG.en)[article.category] || fallbackTag(tLocale);

  return (
    <div className={styles.page} data-testid="blog-article-page">
      {/* Shell with 100 px L/R padding so every header-anchored block lines
       * up with the rest of the site. */}
      <div className={singleStyles.shell}>
        <div className={singleStyles.breadcrumb}>
          <Breadcrumbs
            items={[
              { label: breadcrumbT.home, to: '/' },
              { label: breadcrumbT.blog, to: '/blog' },
              { label: (article.title || '').slice(0, 80) },
            ]}
          />
        </div>

        <header className={singleStyles.header}>
          <h1 className={singleStyles.title}>{article.title}</h1>
          <div className={singleStyles.metaRow}>
            <span className={singleStyles.pill}>{tagLabel}</span>
            <div className={singleStyles.dateRow}>
              <span>{formatDate(article.published_at, tLocale)}</span>
              <span className={singleStyles.minRead}>
                {article.read_time_minutes} {tLocale === 'bg' ? 'мин. четене' : 'min read'}
              </span>
            </div>
          </div>
        </header>

        {article.cover_image_url && (
          <figure className={singleStyles.cover}>
            <img
              src={resolveImage(article.cover_image_url)}
              alt={article.title}
              onError={(e) => { e.target.style.display = 'none'; }}
            />
          </figure>
        )}

        <article className={singleStyles.bodyWrap}>
          <div
            className={singleStyles.bodyContent}
            dangerouslySetInnerHTML={{ __html: safeBody }}
            data-testid="blog-article-body"
          />
          {Array.isArray(article.tags) && article.tags.length > 0 && (
            <div className={singleStyles.tagList} data-testid="blog-article-tags">
              {article.tags.map((t) => (
                <span key={t} className={singleStyles.tagChip}>#{t}</span>
              ))}
            </div>
          )}
        </article>
      </div>

      {/* YOU MAY ALSO BE INTERESTED IN — horizontal scroll, full-bleed */}
      {totalRelated > 0 && (
        <section className={singleStyles.interestWrap}>
          <div className={singleStyles.interestInner}>
            <div className={singleStyles.interestHeader}>
              <h2 className={singleStyles.interestTitle}>
                {tLocale === 'bg' ? (
                  <>МОЖЕ ДА ВИ <span className={singleStyles.accent}>БЪДЕ ИНТЕРЕСНО</span></>
                ) : (
                  <>YOU MAY ALSO <span className={singleStyles.accent}>BE INTERESTED</span> IN</>
                )}
              </h2>
              {/* Desktop: VIEW ALL sits in the header next to the title.
                  Mobile: this is hidden via CSS and replaced by the standalone
                  link below the pager (centered between pager and CTA). */}
              <button
                type="button"
                className={`${singleStyles.viewAllBtn} ${singleStyles.viewAllBtnDesktop}`}
                onClick={() => navigate('/blog')}
                data-testid="blog-view-all-btn"
              >
                {tLocale === 'bg' ? 'ВСИЧКИ СТАТИИ' : 'VIEW ALL ARTICLES'}
                <ArrowRightSm />
              </button>
            </div>

            <div className={singleStyles.scrollerOuter}>
              <div
                ref={scrollerRef}
                className={singleStyles.scroller}
                onScroll={(e) => {
                  const idx = indexFromScroll(e.target.scrollLeft, cardStep);
                  const capped = Math.min(idx, totalRelated - 1);
                  if (capped !== relatedIndex) setRelatedIndex(capped);
                }}
              >
                {related.map((r) => (
                  <article
                    key={r.id}
                    className={singleStyles.relatedCard}
                    onClick={() => goRelated(r)}
                    data-testid={`blog-related-${r.id}`}
                  >
                    <img
                      className={singleStyles.relatedImg}
                      src={resolveImage(r.cover_image_url) || '/figma/blog/image-151@2x.png'}
                      alt={r.title}
                      onError={(e) => { e.target.src = '/figma/blog/image-151@2x.png'; }}
                    />
                    <div className={singleStyles.relatedMeta}>
                      <span className={singleStyles.pill}>{(CATEGORY_TAG[tLocale] || CATEGORY_TAG.en)[r.category] || fallbackTag(tLocale)}</span>
                      <div className={singleStyles.dateRow}>
                        <span>{formatDate(r.published_at, tLocale)}</span>
                        <span className={singleStyles.minRead}>
                          {r.read_time_minutes} {tLocale === 'bg' ? 'мин.' : 'min read'}
                        </span>
                      </div>
                    </div>
                    <h3 className={singleStyles.relatedTitle}>{r.title}</h3>
                    <p className={singleStyles.relatedExcerpt}>{r.excerpt}</p>
                  </article>
                ))}
              </div>
            </div>

            {totalRelated > 1 && (
              <div className={singleStyles.pager}>
                <button
                  type="button"
                  onClick={onPrev}
                  disabled={relatedIndex === 0}
                  className={singleStyles.pagerBtn}
                  aria-label="Previous"
                  data-testid="blog-related-prev"
                >
                  <ArrowLeftCircle disabled={relatedIndex === 0} />
                </button>
                <div className={singleStyles.pagerLabel}>
                  {String(relatedIndex + 1).padStart(2, '0')} / {String(totalRelated).padStart(2, '0')}
                </div>
                <button
                  type="button"
                  onClick={onNext}
                  disabled={relatedIndex >= totalRelated - 1}
                  className={singleStyles.pagerBtn}
                  aria-label="Next"
                  data-testid="blog-related-next"
                >
                  <ArrowRightCircle disabled={relatedIndex >= totalRelated - 1} />
                </button>
              </div>
            )}

            {/* Mobile-only: standalone "VIEW ALL ARTICLES" centered between
             *  the pager and the CTA block.  Spec: 128 px above & below.
             *  Hidden on desktop where the button lives in the header. */}
            <button
              type="button"
              className={`${singleStyles.viewAllBtn} ${singleStyles.viewAllBtnMobile}`}
              onClick={() => navigate('/blog')}
              data-testid="blog-view-all-btn-mobile"
            >
              {tLocale === 'bg' ? 'ВСИЧКИ СТАТИИ' : 'VIEW ALL ARTICLES'}
            </button>
          </div>
        </section>
      )}

      {/* CTA — Stop reading. Start driving. */}
      <section className={singleStyles.ctaWrap}>
        <div className={singleStyles.ctaInner}>
          <div className={singleStyles.ctaText}>
            <h3 className={singleStyles.ctaSmallTitle}>
              {tLocale === 'bg' ? 'ГОТОВИ ЛИ СТЕ ДА ВНЕСЕТЕ КОЛАТА СИ?' : 'READY TO IMPORT YOUR CAR?'}
            </h3>
            <div className={singleStyles.ctaBigTitle}>
              <div>{tLocale === 'bg' ? 'СПРИ ДА ЧЕТЕШ.' : 'STOP READING.'}</div>
              <div className={singleStyles.accent}>{tLocale === 'bg' ? 'ЗАПОЧНИ ДА КАРАШ.' : 'START DRIVING.'}</div>
            </div>
            <p className={singleStyles.ctaDesc}>
              {tLocale === 'bg'
                ? 'Нашите мениджъри ще намерят подходящата кола за вашия бюджет, ще се погрижат за целия процес на вноса и ще ви я доставят пред вратата. Без скрити такси — само ясна цена от първия ден.'
                : 'Our managers will find the right car for your budget, handle the entire import process, and deliver it to your door. No hidden fees — just a clear cost from day one.'}
            </p>
          </div>
          <div className={singleStyles.ctaButtons}>
            <button
              type="button"
              className={singleStyles.ctaPrimary}
              onClick={() => navigate('/contacts')}
              data-testid="blog-article-cta-primary"
            >
              {tLocale === 'bg' ? 'ЗАЯВЕТЕ КОЛА' : 'REQUEST A VEHICLE'}
            </button>
            <button
              type="button"
              className={singleStyles.ctaSecondary}
              onClick={() => navigate('/calculator')}
              data-testid="blog-article-cta-secondary"
            >
              {tLocale === 'bg' ? 'ИЗПОЛЗВАЙТЕ КАЛКУЛАТОРА' : 'USE OUR CALCULATOR'}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
