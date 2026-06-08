/**
 * pages/public/SingleCarPage/components/FreshnessBadge.jsx
 *
 * Phase B2 — Truthful freshness indicator for the instant-shell render.
 *
 * Visual states (per stakeholder rule: "no fake completeness"):
 *   • phase="enriching"             → "Updating live data…" + dot pulse
 *   • phase="enriched"              → "Live · updated just now"
 *   • freshness="fresh"  (≤ 24 h)    → "Updated <Xh ago>"
 *   • freshness="stale"  (1–7 d)    → "Last updated X ago · refreshing…"
 *   • freshness="expired" (> 7 d)   → "Cached snapshot · refreshing live data"
 *   • freshness="unknown"           → "Live snapshot"
 *
 * The component is text-only — no shape changes around it — so it can be
 * dropped into any layout without affecting downstream styling.
 */

import React from "react";
import styles from "./FreshnessBadge.module.css";

function formatAge(seconds) {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) return null;
  if (seconds < 60) return "just now";
  if (seconds < 3600) {
    const m = Math.floor(seconds / 60);
    return `${m} min${m === 1 ? "" : "s"} ago`;
  }
  if (seconds < 86400) {
    const h = Math.floor(seconds / 3600);
    return `${h} hour${h === 1 ? "" : "s"} ago`;
  }
  const d = Math.floor(seconds / 86400);
  return `${d} day${d === 1 ? "" : "s"} ago`;
}

export default function FreshnessBadge({
  phase = "shell",
  freshness = "unknown",
  ageSeconds = null,
  missingFields = [],
  onRefresh = null,
}) {
  let label = "";
  let kind = "neutral";
  let pulsing = false;

  if (phase === "enriching") {
    label = "Updating live data…";
    kind = "loading";
    pulsing = true;
  } else if (phase === "enriched") {
    label = "Live · updated just now";
    kind = "fresh";
  } else if (freshness === "fresh") {
    const ago = formatAge(ageSeconds);
    label = ago ? `Updated ${ago}` : "Recently updated";
    kind = "fresh";
  } else if (freshness === "stale") {
    const ago = formatAge(ageSeconds);
    label = ago ? `Cached ${ago} · refreshing…` : "Cached · refreshing…";
    kind = "stale";
    pulsing = true;
  } else if (freshness === "expired") {
    label = "Cached snapshot · refreshing live data";
    kind = "expired";
    pulsing = true;
  } else {
    // unknown — happens on URL-index-only VINs (westmotors/lemon queue)
    label = missingFields.length > 0
      ? "Partial data · fetching full record…"
      : "Live snapshot";
    kind = "neutral";
    pulsing = missingFields.length > 0;
  }

  return (
    <div
      className={`${styles.badge} ${styles[kind] || ""} ${pulsing ? styles.pulsing : ""}`}
      role="status"
      aria-live="polite"
      data-testid="freshness-badge"
      data-phase={phase}
      data-freshness={freshness}
    >
      <span className={styles.dot} aria-hidden />
      <span className={styles.label}>{label}</span>
      {onRefresh && phase !== "enriching" && (
        <button
          type="button"
          className={styles.refreshBtn}
          onClick={onRefresh}
          aria-label="Refresh live data"
        >
          ↻
        </button>
      )}
    </div>
  );
}
