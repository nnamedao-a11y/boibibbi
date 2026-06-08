/**
 * hooks/usePublicVehicles.js — React Query hook for the public catalogue.
 *
 * Phase B1 — Frontend cache/pagination layer.
 *
 * Responsibilities
 * ----------------
 * • Builds a normalised query-string from `(filters, sort, page, pageSize)`.
 * • Uses React Query so back-navigation, "Show more +" and filter toggles
 *   don't trigger redundant fetches. Cached pages are reused for 5 minutes.
 * • Returns a stable shape regardless of fetch state:
 *      { items, total, isLoading, isFetching, isError, error }
 *
 * Pagination contract (matches the backend after Phase A1)
 * --------------------------------------------------------
 * The backend reads `?skip=N&limit=M`. There is **no** `offset` parameter
 * (the legacy welcome block used to send `offset` which the backend
 * silently ignored — fixed in this phase).
 *
 * Append vs replace
 * -----------------
 * This hook fetches ONE page at a time. The caller is responsible for
 * accumulating pages in its own state when implementing "Show more +".
 * That keeps the cache key stable per page so React Query can dedupe and
 * back-nav keeps every loaded page warm.
 */

import { useQuery } from "@tanstack/react-query";
import axios from "axios";

const API = process.env.REACT_APP_BACKEND_URL || "";

/**
 * Build the axios params object from UI filter state. Empty/null/undefined
 * values are stripped so the cache key stays stable as the user toggles
 * controls.
 */
export function buildVehiclesParams(filters = {}, sort = "popular", skip = 0, limit = 24) {
  const p = { skip, limit, sort };
  const f = filters || {};

  // Brand / Model — accept array or string. Backend takes `|`/`,` separated.
  const escape = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const brandArr = Array.isArray(f.brand) ? f.brand : f.brand ? [f.brand] : [];
  const modelArr = Array.isArray(f.model) ? f.model : f.model ? [f.model] : [];
  if (brandArr.length) p.make = brandArr.map(escape).join("|");
  if (modelArr.length) p.model = modelArr.map(escape).join("|");

  if (f.yearMin) p.year_min = Number(f.yearMin);
  if (f.yearMax) p.year_max = Number(f.yearMax);
  if (f.priceMin) p.price_min = Number(f.priceMin);
  if (f.priceMax) p.price_max = Number(f.priceMax);
  if (f.mileageMin) p.mileage_min = Number(f.mileageMin);
  if (f.mileageMax) p.mileage_max = Number(f.mileageMax);
  if (f.damaged === true) p.damaged = "true";
  if (f.damaged === false) p.damaged = "false";
  if (f.vehicleType) p.vehicle_type = f.vehicleType;
  if (f.country) p.country = f.country;
  if (f.bodyType) p.body_type = f.bodyType;
  if (f.driveType) p.drive_type = f.driveType;
  if (f.engineVolume) p.engine_volume = f.engineVolume;

  if (f.auctionType) {
    const arr = Array.isArray(f.auctionType) ? f.auctionType : [f.auctionType];
    if (arr.length) p.auction_name = arr.join("|");
  }
  if (Array.isArray(f.fuel) && f.fuel.length) p.fuel = f.fuel.join(",");
  if (Array.isArray(f.transmission) && f.transmission.length) p.transmission = f.transmission.join(",");
  if (Array.isArray(f.auctionStatus) && f.auctionStatus.length) p.auction_status = f.auctionStatus.join(",");

  return p;
}

/**
 * Stable key for the React Query cache. Encodes the params object as a
 * sorted-keys JSON string so semantically-equal queries collide.
 */
function _stableKey(params) {
  const keys = Object.keys(params || {}).sort();
  const obj = {};
  for (const k of keys) obj[k] = params[k];
  return JSON.stringify(obj);
}

/**
 * usePublicVehicles({ filters, sort, page, pageSize, enabled, keepPreviousData })
 *
 * Returns the catalogue page for the given query. Cache key is derived
 * from the normalised params, so two components asking for the same page
 * share a single HTTP request.
 */
export default function usePublicVehicles({
  filters = {},
  sort = "popular",
  page = 1,
  pageSize = 24,
  enabled = true,
  keepPreviousData = true,
} = {}) {
  const skip = Math.max(0, (page - 1) * pageSize);
  const params = buildVehiclesParams(filters, sort, skip, pageSize);
  const key = ["public/vehicles", _stableKey(params)];

  const q = useQuery({
    queryKey: key,
    enabled,
    placeholderData: keepPreviousData ? (prev) => prev : undefined,
    queryFn: async ({ signal }) => {
      const res = await axios.get(`${API}/api/public/vehicles`, {
        params,
        signal,
        timeout: 20000,
      });
      const data = res?.data || {};
      return {
        items: Array.isArray(data.data) ? data.data : Array.isArray(data.items) ? data.items : [],
        total: Number.isFinite(data.total) ? Number(data.total) : 0,
        limit: data.limit ?? pageSize,
        skip: data.skip ?? skip,
      };
    },
  });

  return {
    items: q.data?.items || [],
    total: q.data?.total || 0,
    isLoading: q.isLoading,
    isFetching: q.isFetching,
    isError: q.isError,
    error: q.error,
    refetch: q.refetch,
  };
}
