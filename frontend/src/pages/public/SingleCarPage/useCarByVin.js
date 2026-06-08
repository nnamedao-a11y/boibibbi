/**
 * pages/public/SingleCarPage/useCarByVin.js
 *
 * Phase B2 — Instant-shell hydration pattern.
 *
 * Two-phase data flow:
 *   1.  GET  /api/vin/{vin}/shell    DB-only, never blocks, target <150 ms.
 *       Renders the car page IMMEDIATELY with whatever the DB has.
 *       Missing fields are returned in `missing_fields[]` — the UI shows
 *       honest skeletons for them, not fake defaults.
 *
 *   2.  GET  /api/vin/{vin}/enrich   Optional live enhancement, runs in
 *       background AFTER the shell painted. Result is merged into the
 *       same `car` view-model, the freshness badge becomes "fresh" and
 *       the page re-renders without losing user scroll position.
 *
 *   Legacy GET /api/vin/{vin} is untouched — kept for direct API
 *   consumers and as a single-shot fallback if /shell explicitly fails.
 *
 * Return shape (stable for downstream components):
 *   { loading, error, car, raw,
 *     phase: "shell"|"enriching"|"enriched"|"error"|"not_found",
 *     freshness: "fresh"|"stale"|"expired"|"unknown",
 *     ageSeconds: number|null,
 *     missingFields: string[],
 *     enrich: ()=>void   // manual trigger if user wants to re-pull live
 *   }
 */

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import axios from "axios";
import { API_URL } from "../../../App";
import {
  formatPrice,
  formatMileage,
  formatEngine,
  formatDrivetrain,
  formatBodyStyle,
  formatUpdated,
} from "./formatters";

/* ──────────────────────────────────────────────────────────────────────
 * View-model adaptor — same shape as before so all SingleCarPage
 * components keep working without further refactors.
 * Accepts both shell + legacy/enrich payloads.
 * ──────────────────────────────────────────────────────────────────── */
function toCarVM(payload) {
  if (!payload) return null;
  // Shell payload uses `data` directly. Legacy uses `data` too.
  const d = payload.data || {};
  const h = payload.history || null;
  if (!d || !d.vin) return null;
  // Image source: shell uses image_urls (DB field), live BidMotors
  // detail parse returns `images` instead — we accept both so the
  // detail page shows the full gallery as soon as /enrich resolves.
  const rawImages = Array.isArray(d.image_urls) && d.image_urls.length
    ? d.image_urls
    : (Array.isArray(d.images) ? d.images : []);
  return {
    title: d.title || `${d.year || ""} ${d.make || ""} ${d.model || ""}`.trim(),
    images: rawImages,
    imageCount: d.image_count || rawImages.length,
    price: {
      currentBid: d.current_bid ?? d.price ?? h?.sale_price_usd ?? null,
      currency: "USD",
    },
    vehicle: {
      brand: d.make || "—",
      model: d.model || "—",
      year: d.year || "—",
      mileage: formatMileage(d.odometer),
      fuel: d.fuel_type || h?.fuel_type || "—",
      transmission: d.transmission || h?.transmission || "—",
      bodyType: formatBodyStyle(d.body_style, d),
      driveType: formatDrivetrain(d.drivetrain),
      engineVolume: formatEngine(d.engine),
    },
    auction: {
      lot: d.lot_number || h?.lot_number || "—",
      vin: d.vin,
      auction: (d.auction_name || h?.auction_name || "—").toString().toUpperCase(),
      updated: formatUpdated(d.sale_date || h?.sale_date),
      bidPrice: formatPrice(d.current_bid ?? d.price ?? h?.sale_price_usd, d),
      bidPriceRaw: Number(d.current_bid ?? d.price ?? 0) || 0,
      estimatedTotalPrice: null,
    },
    description: buildDescription(d, h),
    raw: payload,
  };
}

/* Tiny description builder kept here to avoid pulling formatters bloat. */
function buildDescription(d, h) {
  if (!d) return "";
  const bits = [];
  if (d.title) bits.push(d.title);
  if (d.damage_primary) bits.push(`Damage: ${d.damage_primary}`);
  if (d.location) bits.push(`Location: ${d.location}`);
  if (h?.sale_date) bits.push(`Last sale: ${h.sale_date}`);
  return bits.join(" • ");
}

export default function useCarByVin(vinOrSlug) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [car, setCar] = useState(null);
  const [raw, setRaw] = useState(null);
  const [phase, setPhase] = useState("shell"); // "shell"|"enriching"|"enriched"|"error"|"not_found"
  const [freshness, setFreshness] = useState("unknown");
  const [ageSeconds, setAgeSeconds] = useState(null);
  const [missingFields, setMissingFields] = useState([]);
  const reqIdRef = useRef(0);
  const enrichFiredRef = useRef(false);

  const fetchShell = useCallback(async (vin, reqId) => {
    // Phase 1 — never-blocking DB read
    const { data } = await axios.get(
      `${API_URL}/api/vin/${encodeURIComponent(vin)}/shell`,
      { timeout: 5000 },
    );
    if (reqIdRef.current !== reqId) return null; // stale
    setRaw(data);
    setFreshness(data?.freshness || "unknown");
    setAgeSeconds(data?.age_seconds ?? null);
    setMissingFields(data?.missing_fields || []);

    if (!data || data.found === false) {
      setCar(null);
      setError("not_found");
      setPhase("not_found");
      return null;
    }
    setCar(toCarVM(data));
    setPhase("shell");
    return data;
  }, []);

  const fetchEnrich = useCallback(async (vin, reqId, shellData) => {
    // Phase 2 — fire-and-forget live fallback, then merge.
    if (enrichFiredRef.current) return;
    enrichFiredRef.current = true;
    setPhase("enriching");
    try {
      const { data } = await axios.get(
        `${API_URL}/api/vin/${encodeURIComponent(vin)}/enrich`,
        { timeout: 25000 },
      );
      if (reqIdRef.current !== reqId) return; // stale
      // Merge enriched data on top of the shell view-model. If enrich
      // returned not_found but shell DID find something, keep the shell.
      if (data && data.found) {
        // Carry forward image_urls/images from shell if enrich's payload
        // dropped them. Live BidMotors detail parse returns `images`,
        // shell returns `image_urls` — merge both lists so the gallery
        // always shows the richest available set.
        const liveImages = data.data?.images?.length ? data.data.images : null;
        const shellImages = shellData?.data?.image_urls?.length ? shellData.data.image_urls : null;
        const mergedImageUrls = (liveImages && liveImages.length >= (shellImages?.length || 0))
          ? liveImages
          : (shellImages || liveImages || []);
        const merged = {
          ...data,
          data: {
            ...(shellData?.data || {}),
            ...(data.data || {}),
            image_urls: mergedImageUrls,
            images: mergedImageUrls,
            image_count: mergedImageUrls.length,
          },
        };
        setRaw(merged);
        setCar(toCarVM(merged));
      }
      setFreshness("fresh");
      setAgeSeconds(0);
      setMissingFields([]); // assume enrich filled everything it could
      setPhase("enriched");
    } catch (e) {
      // Enrich failure is NON-FATAL — user keeps the shell render.
      // We just stay on phase=shell and don't surface a hard error.
      setPhase("shell");
    }
  }, []);

  // Manual trigger if user clicks "Refresh data" badge
  const manualEnrich = useCallback(() => {
    if (!vinOrSlug) return;
    enrichFiredRef.current = false;
    const v = String(vinOrSlug).trim().toUpperCase();
    const reqId = reqIdRef.current;
    fetchEnrich(v, reqId, raw);
  }, [vinOrSlug, fetchEnrich, raw]);

  useEffect(() => {
    if (!vinOrSlug) {
      setLoading(false);
      setError("Missing VIN");
      setCar(null);
      setPhase("error");
      return;
    }
    const v = String(vinOrSlug).trim().toUpperCase();
    const reqId = ++reqIdRef.current;
    enrichFiredRef.current = false;
    setLoading(true);
    setError(null);
    setPhase("shell");

    (async () => {
      try {
        const shell = await fetchShell(v, reqId);
        if (reqIdRef.current !== reqId) return;
        setLoading(false);

        // Phase 2 — fire enrich IF shell was partial or stale.
        // Skip enrich when shell already has everything AND data is fresh.
        const partial =
          !shell?.found ||
          (shell?.missing_fields && shell.missing_fields.length > 0) ||
          shell?.freshness === "stale" ||
          shell?.freshness === "expired" ||
          shell?.data?._pending_enrich ||
          shell?.source === "WESTMOTORS_INDEX" ||
          shell?.source === "LEMON_INDEX" ||
          shell?.source === "NOT_FOUND";

        if (partial) {
          // Defer enrich slightly so the shell paint isn't competing with
          // the live fetch for network bandwidth on slow connections.
          setTimeout(() => fetchEnrich(v, reqId, shell), 50);
        }
      } catch (e) {
        if (reqIdRef.current !== reqId) return;
        setLoading(false);
        setError(extractErrorMessage(e));
        setPhase("error");
      }
    })();
  }, [vinOrSlug, fetchShell, fetchEnrich]);

  return useMemo(
    () => ({
      loading,
      error,
      car,
      raw,
      phase,
      freshness,
      ageSeconds,
      missingFields,
      enrich: manualEnrich,
    }),
    [loading, error, car, raw, phase, freshness, ageSeconds, missingFields, manualEnrich],
  );
}

/* ──────────────────────────────────────────────────────────────────────
 * Error message extractor — converts axios/Pydantic detail objects to a
 * single string so React never renders a raw object.
 * ──────────────────────────────────────────────────────────────────── */
function extractErrorMessage(err) {
  if (!err) return "Unknown error";
  const data = err?.response?.data;
  const status = err?.response?.status;
  if (data) {
    if (typeof data === "string") return data;
    if (Array.isArray(data?.detail)) {
      const msgs = data.detail
        .map((d) => (typeof d === "string" ? d : (d?.msg || d?.message || "")))
        .filter(Boolean);
      if (msgs.length) return msgs.join("; ");
    }
    if (typeof data?.detail === "string") return data.detail;
    if (typeof data?.detail === "object") return data.detail?.msg || JSON.stringify(data.detail);
    if (typeof data?.message === "string") return data.message;
    if (typeof data?.error === "string") return data.error;
  }
  if (typeof err?.message === "string") return err.message;
  if (status) return `Request failed (HTTP ${status})`;
  return "Network error";
}
