/**
 * FrameComponent20 — "Top vehicles deals" filter row.
 *
 *   [🏍][🚗][🚙][🛻][🚐]   |  [10-15K] [15-25K] [30-50K]              PROPOSALS - 46
 *
 * Two segmented controls (vehicle type and price tier) and a
 * right-aligned proposals counter.  Active state is filled amber.
 * Icons reuse the EXACT same 5 PNG assets as the Calculator page
 * (motorbike/sedan/SUV/pick-up/van) so users get a consistent
 * vehicle-type taxonomy across Welcome, Calculator and Catalog.
 */
import { useEffect, useRef, useState } from "react";
import axios from "axios";
import { useLang } from "../../i18n";
import useInView from "../../components/useInView";
import styles from "./frame-component20.module.css";

const API = process.env.REACT_APP_BACKEND_URL || "";

/**
 * Vehicle types — kept 1:1 in sync with /pages/public/CalculatorPage.js
 * `VEHICLES`.  When the user clicks a type here, the SAME apiType is
 * later forwarded to the backend (catalog & top-deals filtering)
 * so the result-set across Welcome / Calculator / Catalog matches.
 */
const VEHICLE_TYPES = [
  { id: "motorbike", icon: "/figma/calc/veh-motorbike.png", alt_en: "Motorbike", alt_bg: "Мотоциклет", apiType: "motorcycle" },
  { id: "sedan",     icon: "/figma/calc/veh-sedan.png",     alt_en: "Sedan",     alt_bg: "Седан",      apiType: "sedan" },
  { id: "suv",       icon: "/figma/calc/veh-suv.png",       alt_en: "SUV",       alt_bg: "Джип",       apiType: "suv" },
  { id: "pickup",    icon: "/figma/calc/veh-pickup.png",    alt_en: "Pick-up",   alt_bg: "Пикап",      apiType: "pickup" },
  { id: "van",       icon: "/figma/calc/veh-van.png",       alt_en: "Van",       alt_bg: "Ван",        apiType: "bigSUV" },
];
/* Price-tier labels mapped to the numeric range (in EUR — matches the
 * displayed card pricing). Sent to `/api/public/vehicles` as
 * `price_min` / `price_max` so the counter mirrors what the catalog
 * would actually return. */
const PRICE_TIERS = [
  { label: "10-15K", min: 10000, max: 15000 },
  { label: "15-25K", min: 15000, max: 25000 },
  { label: "30-50K", min: 30000, max: 50000 },
];

const FrameComponent20 = ({ className = "", onChange, countOverride }) => {
  const { lang } = useLang();
  const isBg = lang === "bg";
  const [vehicle, setVehicle] = useState("sedan");
  const [tierLabel, setTierLabel] = useState("10-15K");
  /* Real-time count of curated wishlist picks matching the current
   * vehicle + tier filter. When the parent passes `countOverride` we
   * use it directly (lock-step with the FrameComponent21 grid). If
   * the parent doesn't supply it (legacy usage) we fall back to the
   * full-catalogue total so the counter is never blank. */
  const [count, setCount] = useState(null);

  const selectVehicle = (id) => {
    setVehicle(id);
    const apiType = VEHICLE_TYPES.find((v) => v.id === id)?.apiType;
    if (typeof onChange === "function") onChange({ vehicleId: id, apiType, tier: tierLabel });
  };

  /* ── Real proposals count ────────────────────────────────────────
   * Pulled from the SAME endpoint that feeds the cards grid below
   * (`/api/public/featured`). This way the counter always matches
   * what the user actually sees on the page:
   *   • Parser working → counter = # of cars returned from the live
   *     scrape (≥ 6 when at least one row of cards is visible).
   *   • Parser failed / network error → counter = 0.
   * We deliberately do NOT filter the count by the vehicle-type chip,
   * because the cards grid itself is not chip-filtered either (the
   * chip is a hint that scopes the future /catalog navigation). So
   * counter and cards stay in lock-step.
   */
  useEffect(() => {
    const controller = new AbortController();
    (async () => {
      try {
        // Use /api/public/vehicles?limit=1 — we just need the `total`
        // field which is the real, live count of vehicles in the DB.
        // Previously we hit /api/public/featured which returns a max of
        // ~24 items and undercounts the catalogue.
        const { data } = await axios.get(`${API}/api/public/vehicles`, {
          params: { limit: 1 },
          signal: controller.signal,
          timeout: 15000,
        });
        const apiTotal = Number.isFinite(data?.total) ? Number(data.total) : 0;
        setCount(apiTotal);
      } catch (e) {
        if (e?.name !== "CanceledError" && e?.code !== "ERR_CANCELED") {
          // Parser failed → truthful 0 per spec.
          setCount(0);
        }
      }
    })();
    return () => controller.abort();
  }, []);

  /* Render count safely: dash while loading, otherwise the real number.
   * Prefer the parent-supplied `countOverride` so the counter mirrors
   * exactly what the curated wishlist grid renders. */
  const countLabel = countOverride != null
    ? String(countOverride)
    : (count == null ? "—" : String(count));

  /* Site-wide reveal: animate the chips + counter when the filter row
   * scrolls into view. Uses the same `data-stagger` + `is-visible`
   * pattern as the hero / cards grid, so the motion language stays
   * consistent across the page. */
  const [rowRef, rowInView] = useInView();

  return (
    <section
      ref={rowRef}
      className={[styles.frameWrapper, className, rowInView ? "is-visible" : ""].join(" ")}
    >
      <div className={styles.frameParent} data-stagger="80" style={{ "--stagger-step": "120ms" }}>
        <div className={styles.frameGroup} data-stagger="80" style={{ "--stagger-step": "80ms" }}>
          {/* Vehicle type segmented control — 5 PNG icons (calculator parity) */}
          <div className={styles.segment} role="tablist" aria-label={isBg ? "Тип превозно средство" : "Vehicle type"}>
            {VEHICLE_TYPES.map(({ id, icon, alt_en, alt_bg }) => {
              const altLabel = isBg ? alt_bg : alt_en;
              return (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={vehicle === id}
                  aria-label={altLabel}
                  data-testid={`top-deals-type-${id}`}
                  className={`${styles.segmentBtn} ${vehicle === id ? styles.segmentBtnActive : ""}`}
                  onClick={() => selectVehicle(id)}
                >
                  {/* Recolour the silhouette via CSS mask so the same PNG can
                   *  appear white on dark bg and black on the amber active bg. */}
                  <span
                    aria-hidden="true"
                    className={styles.segmentIcon}
                    style={{
                      WebkitMaskImage: `url(${icon})`,
                      maskImage: `url(${icon})`,
                    }}
                  />
                </button>
              );
            })}
          </div>

          {/* Price tier segmented control */}
          <div className={styles.segment} role="tablist" aria-label={isBg ? "Ценови диапазон" : "Price range"}>
            {PRICE_TIERS.map((p) => (
              <button
                key={p.label}
                type="button"
                role="tab"
                aria-selected={tierLabel === p.label}
                className={`${styles.tierBtn} ${tierLabel === p.label ? styles.tierBtnActive : ""}`}
                onClick={() => {
                  setTierLabel(p.label);
                  const apiType = VEHICLE_TYPES.find((v) => v.id === vehicle)?.apiType;
                  if (typeof onChange === "function") onChange({ vehicleId: vehicle, apiType, tier: p.label });
                }}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        <div className={styles.proposalsBlock}>
          <div
            className={styles.proposals}
            data-testid="top-deals-proposals-count"
            aria-live="polite"
          >
            <span className={styles.proposalsLabel}>
              {isBg ? "оферти" : "proposals"}
            </span>
            <span className={styles.proposalsSep} aria-hidden="true">-</span>
            <span className={styles.proposalsCount}>{countLabel}</span>
          </div>
        </div>
      </div>
    </section>
  );
};

export default FrameComponent20;
