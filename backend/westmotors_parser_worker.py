"""
westmotors_parser_worker.py — Lazy JSON-LD parser worker for west-motors.pl.

Mirrors lemon_sync's LazyParseWorker but tuned for west-motors:

  • Picks unparsed (or stale) ``vin_data_westmotors`` rows ordered by lastmod desc.
  • For each row: fetch detail HTML → run ``westmotors_detail_parser.parse_detail``
    (JSON-LD first, Polish-prose fallback) → store the result under
    ``parsed_data`` so the promotion worker can pick it up.
  • Concurrency 3-4 with polite 0.3 s delay (≈10 URLs/sec).
  • Tracks ``parse_failed_count`` for blacklisting after N failures.
  • Self-rate-limits when nothing to do.

Why a separate module:
  - westmotors_scraper.py already stores fetch results under ``prefetched_data``
    for the live-lookup path; promotion needs ``parsed_data``.  We keep both
    fields in sync so the lookup path keeps working unchanged.

This is intentionally minimal — it does NOT try to replace any architecture;
it just fills the 10k URL-only docs so promotion can ship them to the catalog.
"""
from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timedelta, timezone
from typing import Any, Awaitable, Callable, Dict, List, Optional

from westmotors_detail_parser import parse_detail as parse_detail_jsonld
from westmotors_scraper import _fetch as wm_fetch  # reuse polite httpx client + backoff

logger = logging.getLogger("westmotors.parser")

COLL = "vin_data_westmotors"

DEFAULTS = {
    "enabled": True,
    "concurrency": 3,
    "delay_per_request_sec": 0.30,
    "batch_size": 50,
    "idle_sleep_sec": 60,
    "max_failures": 3,
    "stale_after_hours": 168,   # 7 days
    "fetch_timeout_sec": 8.0,
    "startup_delay_sec": 90,
}


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _has_useful_payload(parsed: Optional[Dict[str, Any]]) -> bool:
    """A parsed_data is 'useful' if it has enough to promote to partial.

    The promotion worker needs at least year + make + model + detail_url.
    URL slug back-fill handles year/make/model when JSON-LD doesn't expose
    them, so even a minimal payload (image or price) is worth storing.
    """
    if not parsed or not isinstance(parsed, dict):
        return False
    return bool(
        parsed.get("year")
        or parsed.get("image")
        or parsed.get("current_bid_usd")
        or parsed.get("odometer")
        or parsed.get("title")
        or (parsed.get("images") and len(parsed["images"]) > 0)
    )


# ─────────────────────────────────────────────────────────────────
# Single-row parser
# ─────────────────────────────────────────────────────────────────
async def parse_one_row(db, row: Dict[str, Any], fetch_timeout_sec: float = 8.0) -> Dict[str, Any]:
    """Fetch + parse a single row. Updates Mongo in-place. Returns counters."""
    out = {"ok": False, "failed": False, "skipped": False, "no_payload": False}
    url = row.get("url")
    vin = row.get("vin")
    if not url:
        out["skipped"] = True
        return out

    try:
        html = await asyncio.wait_for(wm_fetch(url), timeout=fetch_timeout_sec)
    except asyncio.TimeoutError:
        html = None
    except Exception as e:
        logger.debug(f"[wm.parser] fetch err vin={vin} url={url}: {e}")
        html = None

    if not html:
        await db[COLL].update_one(
            {"_id": row["_id"]},
            {
                "$inc": {"parse_failed_count": 1},
                "$set": {"last_parse_attempt_at": _now()},
            },
        )
        out["failed"] = True
        return out

    try:
        parsed = parse_detail_jsonld(html, url)
    except Exception as e:
        logger.debug(f"[wm.parser] parse_detail err vin={vin}: {e}")
        parsed = None

    if not _has_useful_payload(parsed):
        await db[COLL].update_one(
            {"_id": row["_id"]},
            {
                "$inc": {"parse_failed_count": 1},
                "$set": {
                    "last_parse_attempt_at": _now(),
                    "parsed_data": parsed or None,  # store even an empty parse for visibility
                },
            },
        )
        out["no_payload"] = True
        return out

    # Always backfill VIN from URL/row if missing in parse
    parsed["vin"] = parsed.get("vin") or vin or None
    parsed["region"] = parsed.get("region") or row.get("region")
    parsed["_src"] = "westmotors"

    await db[COLL].update_one(
        {"_id": row["_id"]},
        {
            "$set": {
                "parsed_data": parsed,
                "parsed_at": _now(),
                "last_parse_attempt_at": _now(),
                "parse_failed_count": 0,
            }
        },
    )
    out["ok"] = True
    return out


# ─────────────────────────────────────────────────────────────────
# Batch + worker loop
# ─────────────────────────────────────────────────────────────────
class WestMotorsParserWorker:
    """Continuous worker: pick → parse → store.

    Designed to run alongside ``WestMotorsSync``.  Idempotent and safe to
    start/stop multiple times.
    """

    def __init__(
        self,
        db,
        on_parsed: Optional[Callable[[Dict[str, Any]], Awaitable[None]]] = None,
    ):
        self.db = db
        self.on_parsed = on_parsed
        self.settings: Dict[str, Any] = dict(DEFAULTS)
        self._task: Optional[asyncio.Task] = None
        self._cancel = asyncio.Event()
        self._busy = False
        self._counters: Dict[str, Any] = {
            "ok": 0, "failed": 0, "no_payload": 0, "skipped": 0,
            "cycles": 0, "last_cycle_at": None, "current_url": None,
        }

    # ─────────── Settings ───────────
    async def configure(self, **patch):
        for k, v in patch.items():
            if k in DEFAULTS:
                self.settings[k] = v
        return self.settings

    # ─────────── Stats ───────────
    async def get_stats(self) -> Dict[str, Any]:
        total = parsed = unparsed = failed = 0
        if self.db is not None:
            try:
                total = await self.db[COLL].count_documents({"archived": {"$ne": True}})
                parsed = await self.db[COLL].count_documents(
                    {"archived": {"$ne": True},
                     "parsed_data": {"$ne": None, "$exists": True}}
                )
                unparsed = await self.db[COLL].count_documents(
                    {"archived": {"$ne": True},
                     "parsed_data": {"$in": [None, {}]}}
                )
                failed = await self.db[COLL].count_documents(
                    {"parse_failed_count": {"$gte": int(self.settings.get("max_failures", 3))}}
                )
            except Exception:
                pass
        return {
            "settings": self.settings,
            "busy": self._busy,
            "worker_active": self._task is not None and not self._task.done(),
            "counters": self._counters,
            "db": {
                "total_active": total,
                "parsed": parsed,
                "unparsed": unparsed,
                "blacklisted": failed,
                "parsed_pct": round(parsed / total * 100, 1) if total else 0.0,
            },
        }

    # ─────────── Pick + run batch ───────────
    async def _pick_next_batch(self) -> List[Dict[str, Any]]:
        max_fail = int(self.settings.get("max_failures", 3))
        batch = int(self.settings.get("batch_size", 50))

        # Phase 1 — never-parsed (newest lastmod first)
        cur = (
            self.db[COLL]
            .find(
                {
                    "archived": {"$ne": True},
                    "parsed_data": {"$in": [None, {}]},
                    "$or": [
                        {"parse_failed_count": {"$exists": False}},
                        {"parse_failed_count": {"$lt": max_fail}},
                    ],
                }
            )
            .sort([("lastmod", -1), ("hit_count", -1)])
            .limit(batch)
        )
        rows = await cur.to_list(length=batch)
        if rows:
            return rows

        # Phase 2 — stale (re-parse old payloads)
        stale_hours = int(self.settings.get("stale_after_hours", 168))
        if stale_hours > 0:
            cutoff = _now() - timedelta(hours=stale_hours)
            cur = (
                self.db[COLL]
                .find(
                    {
                        "archived": {"$ne": True},
                        "parsed_data": {"$ne": None},
                        "parsed_at": {"$lt": cutoff},
                    }
                )
                .sort([("parsed_at", 1)])  # oldest first
                .limit(batch)
            )
            rows = await cur.to_list(length=batch)
        return rows

    async def run_once(self) -> Dict[str, Any]:
        """Pick one batch + parse it concurrently. Returns this-batch counters."""
        if self._busy:
            return {"status": "busy"}
        self._busy = True
        try:
            rows = await self._pick_next_batch()
            if not rows:
                return {"status": "idle", "picked": 0}
            sem = asyncio.Semaphore(int(self.settings.get("concurrency", 3)))
            delay = float(self.settings.get("delay_per_request_sec", 0.30))
            timeout = float(self.settings.get("fetch_timeout_sec", 8.0))
            results: Dict[str, int] = {"ok": 0, "failed": 0, "no_payload": 0, "skipped": 0}

            async def _bound(row):
                async with sem:
                    self._counters["current_url"] = row.get("url")
                    res = await parse_one_row(self.db, row, fetch_timeout_sec=timeout)
                    for k in results:
                        if res.get(k):
                            results[k] += 1
                    if res.get("ok") and self.on_parsed:
                        try:
                            await self.on_parsed({
                                "source": "westmotors",
                                "vin": row.get("vin"),
                                "url": row.get("url"),
                            })
                        except Exception:
                            pass
                    await asyncio.sleep(delay)

            await asyncio.gather(*[_bound(r) for r in rows], return_exceptions=True)
            self._counters["cycles"] += 1
            self._counters["last_cycle_at"] = _now().isoformat()
            for k in results:
                self._counters[k] = self._counters.get(k, 0) + results[k]
            return {"status": "ok", "picked": len(rows), **results}
        finally:
            self._busy = False
            self._counters["current_url"] = None

    async def _loop(self):
        try:
            await asyncio.sleep(int(self.settings.get("startup_delay_sec", 90)))
        except asyncio.CancelledError:
            return
        while not self._cancel.is_set():
            try:
                if not self.settings.get("enabled", True):
                    await asyncio.sleep(60)
                    continue
                res = await self.run_once()
                if res.get("status") == "idle" or res.get("picked", 0) == 0:
                    # Nothing to do — back off
                    try:
                        await asyncio.wait_for(
                            self._cancel.wait(),
                            timeout=int(self.settings.get("idle_sleep_sec", 60)),
                        )
                        break
                    except asyncio.TimeoutError:
                        continue
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"[wm.parser] loop error: {e}")
                try:
                    await asyncio.wait_for(self._cancel.wait(), timeout=30)
                    break
                except asyncio.TimeoutError:
                    continue

    def start(self):
        if self._task is None or self._task.done():
            self._cancel.clear()
            self._task = asyncio.create_task(self._loop())
            logger.info(
                "[wm.parser] worker started "
                f"(concurrency={self.settings.get('concurrency')}, "
                f"batch={self.settings.get('batch_size')})"
            )

    def stop(self):
        self._cancel.set()
        if self._task and not self._task.done():
            self._task.cancel()
        self._task = None
        logger.info("[wm.parser] worker stopped")
