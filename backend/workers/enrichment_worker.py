"""
workers/enrichment_worker.py
============================

Phase A2 — Background freshness layer for the public catalogue.

Why
---
After Phase A1 we removed live enrichment from the `/api/public/vehicles`
listing path (it added +4 s per page load). After Phase B2 we exposed
`/api/vin/{vin}/enrich` as a user-triggered fallback. What was still
missing: docs in `vin_data` permanently have `current_bid`,
`engine`, `drivetrain`, `fuel_type`, `transmission` populated to NULL
because the catalogue scrape never carried them. This worker fixes that
in the background — quietly, slowly, without external coordination —
so the shell endpoint over time stops needing the user-triggered enrich
at all.

Design rules (mirror B2's "never blocking" mandate)
---------------------------------------------------
1. **Operational, not architectural** — this is a freshness layer, not a
   new pipeline. It uses the existing `enrich_one_from_detail()` helper
   from `bitmotors_scraper.py` — no new fetch logic, no new schema.
2. **Idempotent + lock-free** — selection scoped by a stale window. Two
   workers running in parallel would do redundant work but never corrupt
   data (`enrich_one_from_detail` only writes missing fields).
3. **Polite to the source** — 3 concurrent in-flight at most, 1 s spacing
   between batches, hard stop on consecutive failures (circuit breaker).
4. **Self-throttling** — sleeps when there's nothing to do. No CPU spin.
5. **Telemetry** — writes `db.enrichment_stats` row on every cycle so the
   admin dashboard can show progress without log scraping.
6. **No new endpoints** — worker reads/writes `vin_data` directly.

Selection (per cycle)
---------------------
    db.vin_data.find({
      archived:    {$ne: true},
      status:      {$in: ["published", "active", None]},
      source_url:  {$ne: null},
      $or: [
        {current_bid:  None}, {current_bid:  {$exists: False}},
        {engine:       None}, {engine:       {$exists: False}},
        {drivetrain:   None}, {drivetrain:   {$exists: False}},
        {fuel_type:    None}, {fuel_type:    {$exists: False}},
        {transmission: None}, {transmission: {$exists: False}},
      ],
      $or: [   # stale OR never enriched
        {last_enriched_at: {$exists: False}},
        {last_enriched_at: {$lt: now - 24h}},
      ],
      enrich_failed_count: {$lt: 3},  # circuit breaker
    }).sort({last_seen: -1}).limit(20)

Failure handling
----------------
- Network failure → `enrich_failed_count++` and `enrich_last_error` set.
- 3 consecutive failures → row is dropped from worker selection until
  a future `_save_batch()` upsert resets the counter (next discovery).
"""

from __future__ import annotations

import asyncio
import logging
import time
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional

logger = logging.getLogger("enrichment_worker")

# Conservative defaults — change via env if scaling
BATCH_SIZE = 20
CONCURRENCY = 3
CYCLE_SLEEP_SEC = 30.0          # gap between cycles when there's work
IDLE_SLEEP_SEC = 300.0          # 5 min gap when there's nothing to do
STALE_WINDOW_SEC = 24 * 3600     # re-enrich anything older than 24 h
MAX_FAILED_COUNT = 3            # circuit breaker per VIN
PER_REQUEST_TIMEOUT = 6.0       # per-detail-page HTTP timeout


async def enrichment_worker_loop(db, get_client) -> None:
    """Forever-loop that scans for stale/incomplete docs and enriches them.

    Parameters
    ----------
    db
        Motor DB handle (`AsyncIOMotorDatabase`).
    get_client
        Callable returning an `httpx.AsyncClient` (lazy so we don't keep a
        client open across long idle sleeps).
    """
    # Lazy import — keeps the worker module loadable in environments
    # without the bitmotors scraper (e.g. unit tests).
    try:
        from bitmotors_scraper import enrich_one_from_detail
    except Exception as e:
        logger.warning("[enrich-worker] cannot import enrich_one_from_detail: %s", e)
        return

    logger.info("[enrich-worker] started (batch=%d, concurrency=%d)",
                BATCH_SIZE, CONCURRENCY)

    while True:
        try:
            batch = await _select_batch(db)
        except asyncio.CancelledError:
            raise
        except Exception as e:
            logger.warning("[enrich-worker] selection failed: %s", e)
            await asyncio.sleep(IDLE_SLEEP_SEC)
            continue

        if not batch:
            await _stats(db, scanned=0, enriched=0, failed=0, idle=True)
            await asyncio.sleep(IDLE_SLEEP_SEC)
            continue

        # Process the batch with limited concurrency.
        sem = asyncio.Semaphore(CONCURRENCY)
        async with get_client() as client:
            results = await asyncio.gather(
                *(_enrich_with_sem(sem, client, db, doc, enrich_one_from_detail)
                  for doc in batch),
                return_exceptions=True,
            )

        enriched = sum(1 for r in results if r is True)
        failed = sum(1 for r in results if r is False or isinstance(r, Exception))
        skipped = len(results) - enriched - failed
        await _stats(db, scanned=len(batch), enriched=enriched,
                     failed=failed, skipped=skipped, idle=False)

        await asyncio.sleep(CYCLE_SLEEP_SEC)


async def _select_batch(db) -> List[Dict[str, Any]]:
    """Pick up to BATCH_SIZE docs needing enrichment, ordered by recency."""
    now = datetime.now(timezone.utc)
    stale_threshold = now - timedelta(seconds=STALE_WINDOW_SEC)

    # Build the query with TWO separate AND-ed groups to avoid mixing
    # $or clauses (Mongo handles this cleanly via top-level $and).
    missing_field_clause = {"$or": [
        {"current_bid":  None}, {"current_bid":  {"$exists": False}},
        {"engine":       None}, {"engine":       {"$exists": False}},
        {"drivetrain":   None}, {"drivetrain":   {"$exists": False}},
        {"fuel_type":    None}, {"fuel_type":    {"$exists": False}},
        {"transmission": None}, {"transmission": {"$exists": False}},
    ]}
    fresh_due_clause = {"$or": [
        {"last_enriched_at": {"$exists": False}},
        {"last_enriched_at": None},
        {"last_enriched_at": {"$lt": stale_threshold}},
    ]}
    query = {
        "$and": [
            missing_field_clause,
            fresh_due_clause,
            # Circuit breaker — but treat missing field as "0 failures",
            # otherwise the $lt clause excludes every freshly-discovered
            # doc (Mongo's $lt does not match against absent fields).
            {"$or": [
                {"enrich_failed_count": {"$exists": False}},
                {"enrich_failed_count": {"$lt": MAX_FAILED_COUNT}},
            ]},
            # Need at least ONE detail-page URL to fetch
            {"$or": [
                {"source_url": {"$exists": True, "$ne": None}},
                {"detail_url": {"$exists": True, "$ne": None}},
            ]},
        ],
        # NOTE: do NOT filter by `archived:{$ne:true}` here — the public
        # catalogue includes docs flagged archived=true (they get archived
        # automatically by staleness sweep but stay visible until the
        # `status` field flips). The shell endpoint serves them, so the
        # worker enriches them too. We match exactly what /api/public/vehicles
        # serves.
        "status": {"$in": ["published", "active", None]},
    }
    proj = {
        "_id": 0, "vin": 1, "source_url": 1, "detail_url": 1,
        "current_bid": 1, "engine": 1, "drivetrain": 1, "fuel_type": 1,
        "transmission": 1, "last_enriched_at": 1, "enrich_failed_count": 1,
    }
    cursor = db.vin_data.find(query, proj).sort("last_seen", -1).limit(BATCH_SIZE)
    return await cursor.to_list(length=BATCH_SIZE)


async def _enrich_with_sem(sem, client, db, doc, enrich_fn) -> bool:
    """Wrap one enrichment call with the concurrency semaphore + failure book-keeping.

    Returns True on success (something new was written), False on failure /
    skip (no new data).
    """
    async with sem:
        vin = doc.get("vin")
        if not vin:
            return False
        started = time.time()
        try:
            merged = await enrich_fn(client, db, doc, timeout=PER_REQUEST_TIMEOUT)
            # If enrich_one_from_detail learned anything, last_enriched_at
            # was already written. We still want to bump it on the doc when
            # the enrichment succeeded but found nothing new — so we don't
            # re-scan the same doc forever.
            now = datetime.now(timezone.utc)
            picked_up_new = any(
                merged.get(f) and not doc.get(f)
                for f in ("current_bid", "engine", "drivetrain", "fuel_type", "transmission")
            )
            update = {"last_enriched_at": now}
            if not picked_up_new:
                # touch the marker so we don't re-scan immediately
                update["enrich_last_attempt"] = now
            await db.vin_data.update_one(
                {"vin": vin},
                {"$set": update, "$unset": {"enrich_last_error": ""}},
            )
            elapsed = time.time() - started
            logger.debug("[enrich-worker] vin=%s elapsed=%.2fs new=%s", vin, elapsed, picked_up_new)
            return bool(picked_up_new)
        except asyncio.CancelledError:
            raise
        except Exception as e:
            # Bump failure counter — circuit breaker.
            try:
                await db.vin_data.update_one(
                    {"vin": vin},
                    {
                        "$inc": {"enrich_failed_count": 1},
                        "$set": {
                            "enrich_last_error": str(e)[:240],
                            "enrich_last_attempt": datetime.now(timezone.utc),
                        },
                    },
                )
            except Exception:
                pass
            logger.warning("[enrich-worker] vin=%s failed: %s", vin, e)
            return False


async def _stats(db, *, scanned: int, enriched: int, failed: int,
                 skipped: int = 0, idle: bool = False) -> None:
    """Persist a cycle summary so the admin dashboard can show progress.

    Writes to `db.enrichment_stats` (capped collection is overkill for
    this volume — a plain time-series collection is sufficient).
    """
    try:
        doc = {
            "ts": datetime.now(timezone.utc),
            "scanned": scanned,
            "enriched": enriched,
            "failed": failed,
            "skipped": skipped,
            "idle": idle,
        }
        await db.enrichment_stats.insert_one(doc)
        # Lightweight log so operators can grep the cycle outcome
        if not idle and (scanned or enriched):
            logger.info("[enrich-worker] cycle scanned=%d enriched=%d failed=%d skipped=%d",
                        scanned, enriched, failed, skipped)
    except Exception as e:
        logger.debug("[enrich-worker] stats write failed: %s", e)


__all__ = ["enrichment_worker_loop"]
