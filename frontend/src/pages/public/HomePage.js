/**
 * HomePage — BIBI Cars main landing page (Figma reference parity).
 *
 * Composes existing public blocks in the exact order requested by the Figma:
 *
 *   1. Hero                  → BibiHero
 *   2. Section heading       → SearchForCarsHeading
 *   3. Brand logos grid      → MostPopularBrandsBlock
 *   4. Top vehicle deals     → TopVehicleDealsBlock
 *   5. Calculator banner     → CalculateYourselfBlock
 *   6. How we work           → HowWeWorkBlock        (Standard / Turnkey / Sourcing)
 *   7. Have a question       → HaveAQuestionBlock    (centered phones)
 *   8. How to buy turnkey    → HowToBuyTurnkeyBlock  (USA / Korea / partners / steps)
 *   9. Before & after        → BeforeAndAfterHeading + BeforeAfterBlock
 *  10. Testimonials          → OurClientsSayBlock
 *  11. Dream car CTA         → DreamCarCTABlock
 *  12. FAQ                   → FAQBlock
 *
 * Header & footer come from BibiPublicLayout (one level up). This page only
 * renders the body sections.
 */
import React from 'react';

import BibiHero from '../../components/public/BibiHero';
import SearchForCarsHeading from '../../components/public/SearchForCarsHeading';
import MostPopularBrandsBlock from '../../components/public/MostPopularBrandsBlock';
import TopVehicleDealsBlock from '../../components/public/TopVehicleDealsBlock';
import CalculateYourselfBlock from '../../components/public/CalculateYourselfBlock';
import HowWeWorkBlock from '../../components/public/HowWeWorkBlock';
import HaveAQuestionBlock from '../../components/public/HaveAQuestionBlock';
import HowToBuyTurnkeyBlock from '../../components/public/HowToBuyTurnkeyBlock';
import BeforeAndAfterHeading from '../../components/public/BeforeAndAfterHeading';
import BeforeAfterBlock from '../../components/public/BeforeAfterBlock';
import OurClientsSayBlock from '../../components/public/OurClientsSayBlock';
import DreamCarCTABlock from '../../components/public/DreamCarCTABlock';
import FAQBlock from '../../components/public/FAQBlock';

export default function HomePage() {
  return (
    <div className="bg-black text-white" data-testid="home-page">
      {/* ─── 1. Hero ─────────────────────────────────────────────── */}
      <BibiHero />

      {/* ─── 2. Section heading bridging hero → catalog ─────────── */}
      <SearchForCarsHeading />

      {/* ─── 3. Most popular brands ─────────────────────────────── */}
      <MostPopularBrandsBlock />

      {/* ─── 4. Top vehicles deals of the week ──────────────────── */}
      <TopVehicleDealsBlock />

      {/* ─── 5. Calculator banner (yellow split) ────────────────── */}
      <CalculateYourselfBlock />

      {/* ─── 6. How we work (Standard / Turnkey / Sourcing) ─────── */}
      <HowWeWorkBlock />

      {/* ─── 7. Have a question · centered phones CTA ───────────── */}
      <section className="bg-black py-16">
        <HaveAQuestionBlock />
      </section>

      {/* ─── 8. How to buy a turnkey car (road / partners / steps) */}
      <HowToBuyTurnkeyBlock />

      {/* ─── 9. Before & after slider ───────────────────────────── */}
      <BeforeAndAfterHeading />
      <BeforeAfterBlock />

      {/* ─── 10. Testimonials ───────────────────────────────────── */}
      <OurClientsSayBlock />

      {/* ─── 11. Dream car CTA ──────────────────────────────────── */}
      <DreamCarCTABlock />

      {/* ─── 12. FAQ ────────────────────────────────────────────── */}
      <FAQBlock />
    </div>
  );
}
