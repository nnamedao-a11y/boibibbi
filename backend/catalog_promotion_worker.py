"""
catalog_promotion_worker.py
===========================

PROMOTION PIPELINE: vin_data_westmotors / vin_data_lemon  →  vin_data

Architectural decision (per PRD wave 4 — Parser Truth):
  • vin_data is the ONLY collection /api/public/vehicles reads from.
  • Source-specific collections (westmotors, lemon, etc.) are URL/VIN
    indexes with raw scraped payloads of varying completeness.
  • A doc is "catalog-ready" only when it carries a minimum viable set:
        vin OR lot  +  source  +  make_canonical  +  model_canonical
        +  year   +  detail_url   +   (image OR price)
  • The promotion worker iterates source collections in batches, classifies
    each record's data_quality, optionally enriches it (re-parsing JSON-LD
    from cached HTML or fetching live), then upserts into vin_data with
    full provenance metadata.

Classification:
    full      — has every required field + image + price
    partial   — has core fields (year+make+model+detail_url) + at least
                one of {image, price}
    shell     — only URL/VIN/LOT index, no extracted product data
                ⇒ NOT promoted; stays in source collection.

Dedupe priority:
    1) vin  (17-char canonical VIN)
    2) lot+source  (auction lot number scoped to the auction host)
    3) source_url hash (last-resort canonical URL)

Promotion record schema (vin_data fields written/updated):
    {
      vin, lot, source, source_priority, detail_url,
      make_canonical, model_canonical, year,
      title, image, images, current_bid_usd, engine_volume,
      data_quality, catalog_ready, last_promoted_at,
      promoted_from   ← {source_collection, source_doc_id}
    }
"""
from __future__ import annotations

import asyncio
import hashlib
import logging
import re
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

logger = logging.getLogger("catalog_promotion")

# Higher number = stronger source. When two source collections both have the
# same VIN, the higher-priority one wins on upsert tie-breaks.
SOURCE_PRIORITY = {
    "bitmotors": 100,       # original, hand-tuned scraper
    "lemon": 70,            # JSON-LD parsed
    "westmotors": 60,       # sitemap index
    "bidcars": 40,          # Playwright (offline)
    "autoastat": 30,        # extension push (offline)
}

REQUIRED_FOR_FULL = ["year", "make_canonical", "model_canonical", "detail_url", "image", "current_bid_usd"]
REQUIRED_FOR_PARTIAL = ["year", "make_canonical", "model_canonical", "detail_url"]

VIN_RE = re.compile(r"\b([A-HJ-NPR-Z0-9]{17})\b")


def _classify(record: Dict[str, Any]) -> str:
    """Returns ``full`` / ``partial`` / ``shell``."""
    has = lambda k: record.get(k) not in (None, "", 0, [], {})
    if all(has(k) for k in REQUIRED_FOR_FULL):
        return "full"
    if all(has(k) for k in REQUIRED_FOR_PARTIAL) and (has("image") or has("current_bid_usd")):
        return "partial"
    return "shell"


def _url_hash(url: str) -> str:
    """Stable canonical hash for source_url-based dedupe."""
    if not url:
        return ""
    # Strip trailing slashes / query strings for canonical form
    canon = url.rstrip("/").split("?", 1)[0].lower()
    return hashlib.sha1(canon.encode("utf-8")).hexdigest()[:16]


def _canon_make(raw: str) -> str:
    """Title-case + strip a brand string. Server's _BRAND_CANONICAL has
    more aliases — we keep this conservative; the public ``/brands``
    endpoint already collapses casing on read."""
    if not raw:
        return ""
    s = str(raw).strip()
    if not s:
        return ""
    # ALL-CAPS → Title Case so it joins gracefully with VEHICLE_CATALOG
    if s.isupper() and len(s) > 1:
        # Special: "BMW" stays uppercase. Heuristic — keep 2-3 char acronyms
        return s if len(s) <= 3 else s.title()
    return s


def _canon_model(raw: str) -> str:
    if not raw:
        return ""
    s = str(raw).strip()
    if s.isupper() and len(s) > 1:
        return s.title()
    return s


def _extract_year_from_url(url: str) -> Optional[int]:
    """Lemon URLs encode the year: /catalog/usa/2017-nissan-armada-sv-... ."""
    m = re.search(r"/(\d{4})-[a-z0-9\-]+-\d+-p/?", url, re.IGNORECASE)
    if m:
        try:
            y = int(m.group(1))
            if 1980 <= y <= datetime.now(timezone.utc).year + 1:
                return y
        except Exception:
            pass
    return None


def _extract_make_model_from_url(url: str) -> Tuple[Optional[str], Optional[str]]:
    """Best-effort make/model from URL slug for lemon/westmotors."""
    # lemon:  /catalog/usa/2017-nissan-armada-sv-7416599-p/
    m = re.search(r"/(\d{4})-([a-z]+)-([a-z0-9\-]+?)-\d+-p/?", url, re.IGNORECASE)
    if m:
        make = m.group(2).upper()
        model = m.group(3).replace("-", " ").upper().strip()
        return make, model
    # westmotors: /catalog-avto/nissan/sentra/3N1AB7APXFY358291
    m = re.search(r"/catalog-avto/([a-z\-]+)/([a-z0-9\-]+)/", url, re.IGNORECASE)
    if m:
        return m.group(1).upper(), m.group(2).upper()
    return None, None


def _build_catalog_record(src_doc: Dict[str, Any], source: str) -> Dict[str, Any]:
    """Normalise a source doc into the vin_data schema.

    Pulls primary fields from ``parsed_data`` (lemon) or top-level fields
    (westmotors), then back-fills missing year/make/model from URL slug.
    """
    parsed = src_doc.get("parsed_data") or {}
    url = src_doc.get("url") or parsed.get("url") or ""

    rec: Dict[str, Any] = {
        "vin": (parsed.get("vin") or src_doc.get("vin") or "").upper() or None,
        "lot": parsed.get("lot") or src_doc.get("lot"),
        "source": source,
        "source_priority": SOURCE_PRIORITY.get(source, 50),
        "detail_url": url,
        "title": parsed.get("title") or src_doc.get("title"),
        "make_canonical": _canon_make(parsed.get("make") or src_doc.get("make") or ""),
        "model_canonical": _canon_model(parsed.get("model") or src_doc.get("model") or ""),
        "year": parsed.get("year") or src_doc.get("year"),
        "image": parsed.get("image") or src_doc.get("image"),
        "images": parsed.get("images") or src_doc.get("images") or [],
        "current_bid_usd": parsed.get("current_bid_usd") or src_doc.get("current_bid_usd"),
        "engine_volume": parsed.get("engine_volume") or src_doc.get("engine_volume"),
        "color": parsed.get("color") or src_doc.get("color"),
        "odometer": parsed.get("odometer") or src_doc.get("odometer"),
        "auction_name": parsed.get("auction") or src_doc.get("auction") or source,
        "promoted_from": {
            "source_collection": f"vin_data_{source}",
            "source_doc_id": str(src_doc.get("_id", "")),
            "source_url_hash": _url_hash(url),
        },
    }

    # URL-slug back-fill (always — cheap, deterministic)
    if not rec["year"]:
        rec["year"] = _extract_year_from_url(url)
    if not rec["make_canonical"] or not rec["model_canonical"]:
        m, mo = _extract_make_model_from_url(url)
        if m and not rec["make_canonical"]:
            rec["make_canonical"] = _canon_make(m)
        if mo and not rec["model_canonical"]:
            rec["model_canonical"] = _canon_model(mo)

    # Synthetic VIN-key for dedupe when no real VIN is present
    if not rec["vin"]:
        if rec["lot"]:
            rec["_dedupe_key"] = f"lot:{rec['lot']}@{source}"
        else:
            rec["_dedupe_key"] = f"url:{_url_hash(url)}"
    else:
        rec["_dedupe_key"] = f"vin:{rec['vin']}"

    rec["data_quality"] = _classify(rec)
    rec["catalog_ready"] = rec["data_quality"] in ("full", "partial")
    rec["last_promoted_at"] = datetime.now(timezone.utc)

    # ── Legacy-shape compatibility (frontend reads `item.make` / `item.model`
    # / `item.current_bid`). Mirror canonical → flat so old card components
    # don't have to be rewritten. Bitmotors docs already have these keys.
    rec["make"] = rec.get("make_canonical") or rec.get("make")
    rec["model"] = rec.get("model_canonical") or rec.get("model")
    if rec.get("current_bid_usd") and not rec.get("current_bid"):
        rec["current_bid"] = rec["current_bid_usd"]
    return rec


async def promote_batch(
    db,
    source: str,
    batch_size: int = 500,
    skip: int = 0,
    only_quality: Optional[List[str]] = None,
) -> Dict[str, Any]:
    """Promote one batch from ``vin_data_{source}`` into ``vin_data``.

    Returns counters: ``{seen, promoted_full, promoted_partial, shell,
    duplicates, errors}``.

    ``only_quality`` — if provided, only docs reaching this quality bar are
    upserted (e.g. ``["full"]`` to skip partials).
    """
    src_coll = db[f"vin_data_{source}"]
    seen = 0
    promoted_full = 0
    promoted_partial = 0
    shell = 0
    duplicates = 0
    errors = 0

    quality_filter = set(only_quality or ["full", "partial"])

    # ── Source-specific find filter ──────────────────────────────────
    # For lemon: skip URL-only shells (parsed_data is null) — they will
    # be promoted later, once the lazy parser worker has visited them.
    # For westmotors: same — skip until detail-page parser has populated.
    if source in ("lemon", "westmotors"):
        find_filter = {"parsed_data": {"$ne": None}}
    else:
        find_filter = {}

    cursor = src_coll.find(find_filter).skip(skip).limit(batch_size)
    async for src_doc in cursor:
        seen += 1
        try:
            rec = _build_catalog_record(src_doc, source)
            q = rec.get("data_quality")
            if q == "shell":
                shell += 1
                continue
            if q not in quality_filter:
                continue

            dedupe_key = rec.pop("_dedupe_key", "")
            # ── Mongo sparse-index quirk ─────────────────────────────────
            # vin_data has a UNIQUE SPARSE index on `vin`. Sparse indexes
            # SKIP docs that don't have the field, but they DO index docs
            # where vin=null → causing E11000 duplicate-key on every
            # subsequent null-VIN promotion. So we strip the field when
            # there's no real VIN.
            if not rec.get("vin"):
                rec.pop("vin", None)
            # Same defensive cleanup for lot (if any sparse-unique appears later)
            if not rec.get("lot"):
                rec.pop("lot", None)

            # Build the upsert filter — prefer real VIN, then lot+source, then url-hash
            if rec.get("vin"):
                upsert_filter = {"vin": rec["vin"]}
            elif rec.get("lot"):
                upsert_filter = {"lot": rec["lot"], "source": source}
            else:
                # url-hash based
                upsert_filter = {
                    "promoted_from.source_url_hash": rec["promoted_from"]["source_url_hash"],
                }

            # Don't downgrade higher-priority records. If existing doc has
            # source=bitmotors (priority 100), don't let lemon (70) clobber it.
            existing = await db.vin_data.find_one(upsert_filter)
            if existing:
                existing_prio = int(existing.get("source_priority") or 0)
                if existing_prio > rec["source_priority"]:
                    duplicates += 1
                    continue

            update_doc = {
                "$set": rec,
                "$setOnInsert": {
                    "created_at": datetime.now(timezone.utc),
                },
            }
            res = await db.vin_data.update_one(upsert_filter, update_doc, upsert=True)
            if res.upserted_id:
                if q == "full":
                    promoted_full += 1
                else:
                    promoted_partial += 1
            else:
                duplicates += 1
        except Exception as e:
            errors += 1
            logger.debug(f"[promote/{source}] failed doc={src_doc.get('_id')}: {e}")

    return {
        "source": source,
        "seen": seen,
        "promoted_full": promoted_full,
        "promoted_partial": promoted_partial,
        "shell": shell,
        "duplicates": duplicates,
        "errors": errors,
    }


async def promote_all(
    db,
    sources: Optional[List[str]] = None,
    max_per_source: int = 5000,
    batch: int = 500,
    only_quality: Optional[List[str]] = None,
) -> Dict[str, Any]:
    """Iterate every source collection in batches up to ``max_per_source``.

    Used by ``/api/ingestion/admin/parsers/promote/run-once``.
    """
    sources = sources or ["lemon", "westmotors"]
    started = datetime.now(timezone.utc)
    out: List[Dict[str, Any]] = []
    for src in sources:
        coll_name = f"vin_data_{src}"
        if coll_name not in await db.list_collection_names():
            logger.warning(f"[promote] collection {coll_name} not found — skipping")
            continue
        total = 0
        agg = {"source": src, "seen": 0, "promoted_full": 0, "promoted_partial": 0, "shell": 0, "duplicates": 0, "errors": 0}
        skip = 0
        while total < max_per_source:
            stats = await promote_batch(db, src, batch_size=batch, skip=skip, only_quality=only_quality)
            for k, v in stats.items():
                if k != "source":
                    agg[k] += v
            total += stats["seen"]
            skip += batch
            if stats["seen"] < batch:
                break  # exhausted
        out.append(agg)

    # Persist run history for auditability
    try:
        await db.promotion_runs.insert_one({
            "started_at": started,
            "finished_at": datetime.now(timezone.utc),
            "sources": sources,
            "max_per_source": max_per_source,
            "batch": batch,
            "results": out,
        })
    except Exception:
        pass

    return {"started_at": started, "results": out}


class CatalogPromotionWorker:
    """Background loop. Runs every ``interval_seconds`` (default 30 min)
    and promotes a small batch from each source.
    """

    def __init__(self, db, interval_seconds: int = 1800, batch_per_source: int = 1000):
        self.db = db
        self.interval_seconds = max(60, int(interval_seconds))
        self.batch_per_source = max(100, int(batch_per_source))
        self.running = False
        self.task: Optional[asyncio.Task] = None
        self._stop = asyncio.Event()
        self.last_result: Optional[Dict[str, Any]] = None
        self.last_run_at: Optional[datetime] = None

    async def _loop(self):
        # 60s grace period at boot so we don't fight with sync workers
        try:
            await asyncio.wait_for(self._stop.wait(), timeout=60)
            return
        except asyncio.TimeoutError:
            pass
        while self.running:
            try:
                self.last_result = await promote_all(
                    self.db,
                    sources=["lemon", "westmotors"],
                    max_per_source=self.batch_per_source,
                    batch=500,
                )
                self.last_run_at = datetime.now(timezone.utc)
                r = self.last_result.get("results", [])
                summary = " · ".join(
                    f"{x['source']} +{x['promoted_full'] + x['promoted_partial']}" for x in r
                )
                logger.info(f"[promotion] cycle done — {summary}")
            except Exception as e:
                logger.error(f"[promotion] cycle failed: {e}")
            try:
                await asyncio.wait_for(self._stop.wait(), timeout=self.interval_seconds)
                break
            except asyncio.TimeoutError:
                continue

    def start(self):
        if self.running:
            return
        self.running = True
        self._stop.clear()
        self.task = asyncio.create_task(self._loop())
        logger.info(
            f"[promotion] worker started (interval={self.interval_seconds}s, "
            f"batch={self.batch_per_source}/source)"
        )

    def stop(self):
        if not self.running:
            return
        self.running = False
        self._stop.set()
        if self.task:
            self.task.cancel()
            self.task = None
        logger.info("[promotion] worker stopped")

    def get_stats(self) -> Dict[str, Any]:
        return {
            "running": self.running,
            "interval_seconds": self.interval_seconds,
            "batch_per_source": self.batch_per_source,
            "last_run_at": self.last_run_at.isoformat() if self.last_run_at else None,
            "last_result": self.last_result,
        }
