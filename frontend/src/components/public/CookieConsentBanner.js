/**
 * BIBI Cars — Cookie Consent Banner (V4 — polished)
 *
 * Лёгкая, но содержательная плашка снизу экрана. Не блокирует контент.
 * Только базовая логика согласия (essential cookies). Никаких чекбоксов
 * или granular-настроек.
 *
 * Поведение:
 *   • Показывается на первом визите для публичного сайта
 *   • Одна кнопка «Accept» (+ «X» — эквивалент accept)
 *   • Согласие сохраняется в localStorage и больше не показывается
 *
 * Что обновили в V4 (по фидбеку):
 *   • Чёткое выравнивание по вертикальному центру: иконка ↔ контент ↔
 *     действия теперь всегда align-items:center на десктопе.
 *   • Контент разделён на ТРИ уровня вместо одного "плоского" абзаца:
 *       title  (h6, white, bold)
 *       body   (text-13, secondary grey, 1–2 предложения)
 *       link   (Learn more — теперь визуально отдельный «secondary CTA»)
 *   • Мобильный layout — full-stack (иконка наверху, потом текст, потом
 *     кнопка Accept на всю ширину). Без обрезаний и горизонтальных
 *     перетеканий, которые были заметны на скриншоте.
 *   • Лёгкий ambient-glow и slim 1px ring (#FEAE00) — лучше «парит» над
 *     контентом, не выглядит сломанным.
 *
 * Storage: bibi_cookie_consent = { essential: true, ts }
 */
import React, { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { X, Check, Cookie, ShieldCheck } from '@phosphor-icons/react';
import axios from 'axios';
import { useLang } from '../../i18n';
import { usePolicyModal } from './PolicyModal';

const API_URL = process.env.REACT_APP_BACKEND_URL || '';
const STORAGE_KEY = 'bibi_cookie_consent';

const hasConsent = () => {
  try {
    return !!localStorage.getItem(STORAGE_KEY);
  } catch {
    return false;
  }
};

const persist = () => {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ essential: true, ts: new Date().toISOString() }),
    );
  } catch {}
};

export default function CookieConsentBanner() {
  const { lang } = useLang();
  const { pathname } = useLocation();
  const { open: openPolicy } = usePolicyModal();
  const [open, setOpen] = useState(false);
  const [bannerCopy, setBannerCopy] = useState(null);
  const [enabled, setEnabled] = useState(true);

  // Hide on app/transactional routes (admin/team/manager + customer cabinet
  // & public contract-sign page). The cookie banner is a marketing-site
  // concern; on the focused /cabinet flows it would overlap primary CTAs
  // (e.g. the contract Sign button).
  const isPublicRoute =
    !pathname.startsWith('/admin') &&
    !pathname.startsWith('/team') &&
    !pathname.startsWith('/manager') &&
    !pathname.startsWith('/cabinet');

  useEffect(() => {
    if (!isPublicRoute) return;
    if (hasConsent()) return;
    let cancelled = false;
    (async () => {
      try {
        const r = await axios.get(`${API_URL}/api/site-info`);
        if (cancelled) return;
        const cb = r.data?.cookie_banner || {};
        setEnabled(cb.enabled !== false);
        setBannerCopy(cb);
        if (cb.enabled !== false) {
          setTimeout(() => !cancelled && setOpen(true), 600);
        }
      } catch {
        if (!cancelled) {
          setBannerCopy({});
          setTimeout(() => !cancelled && setOpen(true), 600);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isPublicRoute]);

  if (!isPublicRoute || !open || !enabled) return null;

  const isBg = lang === 'bg';

  /* ─────── i18n strings ─────── */
  const T = isBg
    ? {
        title: 'Уважаваме вашата поверителност',
        body:
          'Използваме само основни бисквитки, за да поддържаме сесията и да защитаваме акаунта ви. Без следящи скриптове, без реклама — само това, което е необходимо за коректната работа на сайта.',
        accept: 'Приемам',
        learnMore: 'Научете повече',
        close: 'Затвори',
        secure: 'GDPR съвместимо',
      }
    : {
        title: 'We value your privacy',
        body:
          'We only use essential cookies to keep your session secure and your preferences saved. No tracking pixels, no ad networks — just the minimum needed for BIBI Cars to work properly.',
        accept: 'Accept',
        learnMore: 'Learn more',
        close: 'Close',
        secure: 'GDPR-compliant',
      };

  /* Backend override (admin-controlled copy). Falls back to localised default. */
  const bodyOverride =
    (isBg ? bannerCopy?.body_bg : bannerCopy?.body_en) || null;
  const titleOverride =
    (isBg ? bannerCopy?.title_bg : bannerCopy?.title_en) || null;
  const title = titleOverride || T.title;
  const body = bodyOverride || T.body;

  const accept = () => {
    persist();
    setOpen(false);
  };

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-[100] px-3 pb-3 md:px-5 md:pb-5 pointer-events-none"
      data-testid="cookie-banner"
      role="dialog"
      aria-label={title}
    >
      <div
        className="relative mx-auto max-w-[1180px] pointer-events-auto rounded-2xl border border-[#27272A] bg-[#0F0F0E]/95 backdrop-blur-md shadow-[0_24px_56px_rgba(0,0,0,0.65)] animate-[bibi-cookie-in_0.4s_cubic-bezier(0.22,1,0.36,1)_both] overflow-hidden"
      >
        {/* Phase B3.1+: removed the amber top accent line + amber outer
            border + amber 1px ambient ring. The banner now sits in a clean
            neutral border so the cookie modal doesn't read as "warning"
            framing on the home page. Inner amber accents (icon, accept
            button, learn-more link, GDPR chip) are kept — they're part of
            the BIBI palette. */}

        {/* ── Desktop layout: 3-column grid (icon | content | actions) ───── */}
        <div className="hidden md:grid grid-cols-[auto_1fr_auto] items-center gap-5 px-5 py-4 lg:px-6 lg:py-5">
          {/* Cookie icon */}
          <div className="relative">
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-[#FEAE00] to-[#E69900] text-black flex items-center justify-center shrink-0 shadow-[0_8px_22px_rgba(254,174,0,0.35)]">
              <Cookie size={22} weight="fill" />
            </div>
          </div>

          {/* Content (title + body + learn more) */}
          <div className="min-w-0 flex flex-col gap-1.5">
            <div className="flex items-center gap-2.5 flex-wrap">
              <h3 className="m-0 text-[15px] lg:text-[16px] font-semibold text-white tracking-tight leading-tight">
                {title}
              </h3>
              <span className="inline-flex items-center gap-1 text-[10.5px] font-medium uppercase tracking-[0.08em] text-[#FEAE00] bg-[#FEAE00]/10 border border-[#FEAE00]/30 rounded-full px-2 py-0.5 leading-none">
                <ShieldCheck size={11} weight="bold" />
                {T.secure}
              </span>
            </div>
            <p className="m-0 text-[13px] lg:text-[13.5px] text-[#B5B5B5] leading-[1.55] max-w-[760px]">
              {body}
            </p>
            <button
              type="button"
              onClick={() => openPolicy('cookies')}
              className="self-start mt-0.5 text-[12.5px] font-medium text-[#FEAE00] underline underline-offset-[3px] decoration-[#FEAE00]/40 hover:decoration-[#FEAE00] hover:brightness-110 bg-transparent border-0 p-0 cursor-pointer transition-all"
              data-testid="cookie-banner-learn-more"
            >
              {T.learnMore} →
            </button>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={accept}
              className="inline-flex items-center gap-2 bg-[#FEAE00] hover:bg-[#FFBF2D] active:bg-[#E69900] text-black text-[13px] font-semibold uppercase tracking-[0.06em] rounded-lg px-5 h-10 transition-all shadow-[0_8px_22px_rgba(254,174,0,0.28)] hover:shadow-[0_10px_28px_rgba(254,174,0,0.36)] hover:-translate-y-px"
              data-testid="cookie-accept"
            >
              <Check size={15} weight="bold" />
              {T.accept}
            </button>
            <button
              type="button"
              onClick={accept}
              aria-label={T.close}
              className="shrink-0 w-9 h-9 rounded-lg text-[#9A9A9A] hover:text-[#FEAE00] hover:bg-white/[0.06] flex items-center justify-center transition-colors"
              data-testid="cookie-close"
            >
              <X size={17} />
            </button>
          </div>
        </div>

        {/* ── Mobile layout: stacked (icon+badge → title → body → actions) ── */}
        <div className="md:hidden flex flex-col gap-3 p-4 pb-3.5">
          {/* Top row: icon + GDPR badge + close (X) */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#FEAE00] to-[#E69900] text-black flex items-center justify-center shrink-0 shadow-[0_6px_18px_rgba(254,174,0,0.30)]">
                <Cookie size={20} weight="fill" />
              </div>
              <span className="inline-flex items-center gap-1 text-[10px] font-medium uppercase tracking-[0.08em] text-[#FEAE00] bg-[#FEAE00]/10 border border-[#FEAE00]/30 rounded-full px-2 py-0.5 leading-none">
                <ShieldCheck size={10} weight="bold" />
                {T.secure}
              </span>
            </div>
            <button
              type="button"
              onClick={accept}
              aria-label={T.close}
              className="shrink-0 w-8 h-8 -mr-1 rounded-lg text-[#9A9A9A] hover:text-[#FEAE00] hover:bg-white/[0.06] flex items-center justify-center transition-colors"
              data-testid="cookie-close-mobile"
            >
              <X size={16} />
            </button>
          </div>

          {/* Title */}
          <h3 className="m-0 text-[15px] font-semibold text-white tracking-tight leading-tight">
            {title}
          </h3>

          {/* Body */}
          <p className="m-0 text-[12.5px] text-[#B5B5B5] leading-[1.55]">
            {body}
          </p>

          {/* Bottom actions row: Learn more (link) + Accept (CTA fills remaining) */}
          <div className="flex items-center gap-2 mt-0.5">
            <button
              type="button"
              onClick={() => openPolicy('cookies')}
              className="text-[12.5px] font-medium text-[#FEAE00] underline underline-offset-[3px] decoration-[#FEAE00]/40 bg-transparent border-0 p-0 cursor-pointer shrink-0"
              data-testid="cookie-banner-learn-more-mobile"
            >
              {T.learnMore}
            </button>
            <button
              type="button"
              onClick={accept}
              className="ml-auto inline-flex items-center justify-center gap-1.5 bg-[#FEAE00] text-black text-[12.5px] font-semibold uppercase tracking-[0.06em] rounded-lg h-10 px-5 min-w-[140px] shadow-[0_6px_18px_rgba(254,174,0,0.28)]"
              data-testid="cookie-accept-mobile"
            >
              <Check size={14} weight="bold" />
              {T.accept}
            </button>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes bibi-cookie-in {
          from { opacity: 0; transform: translateY(28px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
