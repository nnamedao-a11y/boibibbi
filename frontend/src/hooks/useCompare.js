/**
 * useCompare Hook
 *
 * Compare list state for the customer cabinet. The backend
 * (`/api/compare/me`) returns an **array** of compare items — same shape
 * as `/api/favorites/me` — so we normalize it here into a stable
 * `{ items, count, isFull }` interface for consumers.
 */

import { useEffect, useMemo, useState, useCallback } from 'react';
import { userEngagementApi } from '../lib/api';

const MAX_COMPARE = 3;

function normalizeList(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  if (Array.isArray(raw.items)) return raw.items;
  return [];
}

export function useCompare() {
  const [items, setItems] = useState([]);
  const [resolved, setResolved] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const mine = await userEngagementApi.compare.getMine();
      const list = normalizeList(mine);
      setItems(list);

      if (list.length) {
        try {
          const data = await userEngagementApi.compare.resolve();
          setResolved(data?.comparison || []);
        } catch (resErr) {
          // Resolve is best-effort; fall back to snapshot data if it fails
          console.warn('Compare resolve failed, falling back to snapshots:', resErr);
          setResolved(
            list.map((it) => ({
              vehicleId: it.vehicleId || it.vin,
              vin: it.vin,
              ...(it.snapshot || {}),
            })),
          );
        }
      } else {
        setResolved([]);
      }
    } catch (err) {
      // 401/403 → user not authenticated; treat as empty list silently
      if (err?.status !== 401 && err?.status !== 403) {
        console.error('Compare load error:', err);
      }
      setItems([]);
      setResolved([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const add = useCallback(async (vehicle) => {
    const res = await userEngagementApi.compare.add(vehicle);
    await load();
    return res;
  }, [load]);

  const remove = useCallback(async (vehicleId) => {
    await userEngagementApi.compare.remove(vehicleId);
    await load();
  }, [load]);

  const clear = useCallback(async () => {
    await userEngagementApi.compare.clear();
    await load();
  }, [load]);

  useEffect(() => {
    load();
  }, [load]);

  const vehicleSet = useMemo(
    () => new Set(
      items
        .map((x) => String(x.vehicleId || x.vin || '').toUpperCase())
        .filter(Boolean),
    ),
    [items],
  );

  const count = items.length;

  // Backwards-compat: legacy callers used `list?.items?.length`
  const list = useMemo(() => ({ items }), [items]);

  return {
    list,
    items,
    resolved,
    loading,
    reload: load,
    add,
    remove,
    clear,
    vehicleSet,
    count,
    isFull: count >= MAX_COMPARE,
    needsMore: count > 0 && count < 2,
  };
}

export default useCompare;
