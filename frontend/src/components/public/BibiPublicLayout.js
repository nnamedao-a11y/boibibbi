/**
 * BIBI Cars — shared public-page Layout (Header + Footer).
 *
 * V5 (May 2026) — Header / Footer UNIFICATION (cleanup pass).
 *
 * Single source of truth for the public site chrome: we render the same
 * Figma `Header1` / `Footer1` on EVERY public route, scaled responsively via
 * `<ScaledChrome />`. There used to be a parallel "legacy" Bibi header/footer
 * that diverged visually from the Figma design — it has been deleted.
 *
 * All admin-managed data (phones, addresses, socials, viber community,
 * CTA labels, working hours) is consumed by `Header1` / `Footer1` themselves
 * via `/api/site-info`.
 *
 *   • Logo → `/`
 *   • CATALOG / CALCULATOR / ABOUT US / CONTACTS → React Router links
 *   • Search → `/vin/<query>`
 *   • Phones → `tel:` links (admin-controlled)
 *   • ENG / BG dropdown → LanguageContext
 *   • Profile icon → `/cabinet/login` (or active customer cabinet)
 *   • CONTACT US → opens "Reach Out To Us" modal (GetInTouchModal)
 *   • Footer "Get in touch" → opens shared modal
 */

import React, { useState } from 'react';
import { useLocation } from 'react-router-dom';
import Header1 from '../../figma_home/components/header1';
import Footer1 from '../../figma_home/components/footer1';
import useIsMobile from '../../figma_home/mobile/useIsMobile';
import MobileHeader from '../../figma_home/mobile/MobileHeader';
import MobileMenu from '../../figma_home/mobile/MobileMenu';
import MobileFooter from '../../figma_home/mobile/MobileFooter';
import ScaledChrome from './ScaledChrome';
import { useLang } from '../../i18n';
import './BibiPublicLayout.css';

export function BibiHeader() {
  const isMobile = useIsMobile(768);
  const { pathname } = useLocation();
  const { lang, setLang } = useLang();
  const [menuOpen, setMenuOpen] = useState(false);
  // On mobile homepage the dedicated <MobileHeader /> is rendered inside
  // <MobileHomePage />, so we'd duplicate it here. Skip on `/`.
  if (isMobile && pathname === '/') return null;

  // On mobile (≤768 px) every other public route uses the dedicated
  // 360 × 80 mobile header (logo + phones + hamburger).  The scaled
  // desktop chrome is reserved for ≥ 769 px viewports.
  if (isMobile) {
    return (
      <>
        <MobileHeader onMenuOpen={() => setMenuOpen(true)} />
        <MobileMenu
          open={menuOpen}
          onClose={() => setMenuOpen(false)}
          lang={lang}
          onLangChange={(next) => { setLang(next); }}
        />
      </>
    );
  }
  return (
    <ScaledChrome>
      <Header1 />
    </ScaledChrome>
  );
}

export function BibiFooter() {
  const isMobile = useIsMobile(768);
  const { pathname } = useLocation();
  // Same rationale as BibiHeader: on mobile homepage the MobileHomePage
  // renders its own footer, so skip the scaled desktop one.
  if (isMobile && pathname === '/') return null;

  // On mobile every other public route uses the dedicated 360 × 1219
  // mobile footer (identical to MobileHomePage's footer).  Desktop keeps
  // the scaled Figma 1920 footer.
  if (isMobile) return <MobileFooter />;

  return (
    <ScaledChrome>
      <Footer1 />
    </ScaledChrome>
  );
}

export default { BibiHeader, BibiFooter };
