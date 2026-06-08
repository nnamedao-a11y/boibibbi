"""
scripts/migrate_a1_canonical_and_indexes.py
============================================
Phase A1 migration — Canonical fields + Mongo indexes on vin_data.

ABSOLUTELY IDEMPOTENT. Safe to re-run any number of times.

What it does
------------
1. Adds (NEVER removes) canonical fields on every `vin_data` document:
     - make_canonical    (catalogue brand name)
     - model_canonical   (catalogue model name, trim-stripped)
     - model_full        (mirror of the raw `model` field, for display)
     - search_title      (lowercase searchable composite)
     - canonical_version (schema marker for future re-migrations)

2. Re-runs the canonical mapper on docs that have NO canonical fields yet,
   or whose `canonical_version` is older than CURRENT_VERSION.

3. Creates indexes on `vin_data` (idempotent — `create_index` is no-op if
   the index already exists):

     - vin (unique, sparse)
     - make_canonical
     - model_canonical
     - year
     - current_bid
     - odometer
     - auction_name
     - damage_primary
     - status + last_seen (compound)
     - make_canonical + model_canonical (compound)
     - make_canonical + year (compound)
     - current_bid + year (compound)
     - search_title (single-key for partial / regex performance)

4. Before/after report:
     - total docs
     - docs with make_canonical
     - docs with model_canonical
     - distinct canonical brand count
     - distinct canonical model count
     - indexes on vin_data

Rollback plan
-------------
The migration is purely additive: nothing in the existing schema is
mutated or removed. To roll back:

    db.vin_data.update_many(
        {},
        {"$unset": {
            "make_canonical": "",
            "model_canonical": "",
            "model_full": "",
            "search_title": "",
            "canonical_version": ""
        }}
    )
    # plus drop the new indexes by name (see _NEW_INDEX_NAMES below)

Usage
-----
    python3 -m scripts.migrate_a1_canonical_and_indexes
    # or
    DRY_RUN=1 python3 -m scripts.migrate_a1_canonical_and_indexes
"""

from __future__ import annotations

import asyncio
import logging
import os
import sys
import time
from typing import Any, Dict, List, Optional

# Ensure backend root on path so `from data.canonical import ...` works
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

from motor.motor_asyncio import AsyncIOMotorClient  # noqa: E402

from data.canonical import (  # noqa: E402
    canonical_make,
    canonical_model,
    parse_title_to_canonical,
    build_search_title,
)

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("migrate_a1")

CURRENT_VERSION = 2
DRY_RUN = os.environ.get("DRY_RUN", "0") == "1"

_NEW_INDEX_NAMES = (
    "vin_unique_sparse",
    "make_canonical_1",
    "model_canonical_1",
    "year_1",
    "current_bid_1",
    "odometer_1",
    "auction_name_1",
    "damage_primary_1",
    "status_last_seen",
    "make_model_canonical",
    "make_year_canonical",
    "price_year",
    "search_title_1",
)


async def _report(db, label: str) -> Dict[str, Any]:
    coll = db.vin_data
    total = await coll.count_documents({})
    with_can_make = await coll.count_documents({"make_canonical": {"$ne": None, "$exists": True}})
    with_can_model = await coll.count_documents({"model_canonical": {"$ne": None, "$exists": True}})

    pipeline_make = [
        {"$match": {"make_canonical": {"$ne": None, "$exists": True}}},
        {"$group": {"_id": "$make_canonical"}},
        {"$count": "n"},
    ]
    pipeline_model = [
        {"$match": {"model_canonical": {"$ne": None, "$exists": True}}},
        {"$group": {"_id": {"m": "$make_canonical", "x": "$model_canonical"}}},
        {"$count": "n"},
    ]
    pipeline_raw_make = [
        {"$group": {"_id": "$make"}},
        {"$count": "n"},
    ]
    pipeline_raw_model = [
        {"$group": {"_id": {"m": "$make", "x": "$model"}}},
        {"$count": "n"},
    ]
    distinct_can_make = next(iter(await coll.aggregate(pipeline_make).to_list(1)), {}).get("n", 0)
    distinct_can_model = next(iter(await coll.aggregate(pipeline_model).to_list(1)), {}).get("n", 0)
    distinct_raw_make = next(iter(await coll.aggregate(pipeline_raw_make).to_list(1)), {}).get("n", 0)
    distinct_raw_model = next(iter(await coll.aggregate(pipeline_raw_model).to_list(1)), {}).get("n", 0)

    indexes = await coll.list_indexes().to_list(length=None)
    idx_names = sorted(i["name"] for i in indexes)

    snap = {
        "label": label,
        "total": total,
        "with_make_canonical": with_can_make,
        "with_model_canonical": with_can_model,
        "distinct_make_raw": distinct_raw_make,
        "distinct_make_canonical": distinct_can_make,
        "distinct_model_raw": distinct_raw_model,
        "distinct_model_canonical": distinct_can_model,
        "indexes": idx_names,
    }
    logger.info("─── %s ───", label)
    for k, v in snap.items():
        if k == "indexes":
            logger.info("  indexes (%d): %s", len(v), ", ".join(v))
        elif k != "label":
            logger.info("  %s: %s", k, v)
    return snap


async def _canonicalise_one(doc: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """Compute canonical fields for a single doc. Returns None if nothing changed."""
    raw_make = doc.get("make")
    raw_model = doc.get("model")
    raw_title = doc.get("title")
    raw_year = doc.get("year")

    # Try title first — handles "Land Rover" / "Mercedes-Benz" / "Alfa Romeo"
    y_t, mk_t, mkc_t, mdc_t = parse_title_to_canonical(raw_title) if raw_title else (None, None, None, None)

    # Make: prefer raw `make` canonicalisation, fall back to title
    make_canonical_val = canonical_make(raw_make) if raw_make else None
    if make_canonical_val is None or make_canonical_val == "Land":
        # Title-based recovery for broken makes (Land Rover bug)
        make_canonical_val = mkc_t

    # Model: try catalogue prefix match against raw model first,
    # then fall back to title-derived canonical
    model_canonical_val = canonical_model(raw_model, make_canonical_val) if raw_model else None
    if not model_canonical_val and mdc_t and make_canonical_val == mkc_t:
        model_canonical_val = mdc_t

    # Search-title for free-text search (lowercase, normalised)
    search_title = build_search_title(
        year=raw_year if isinstance(raw_year, int) else y_t,
        make_canonical_value=make_canonical_val,
        model_canonical_value=model_canonical_val,
        raw_model=raw_model,
    )

    updates: Dict[str, Any] = {}
    if make_canonical_val and doc.get("make_canonical") != make_canonical_val:
        updates["make_canonical"] = make_canonical_val
    if model_canonical_val and doc.get("model_canonical") != model_canonical_val:
        updates["model_canonical"] = model_canonical_val
    if raw_model and doc.get("model_full") != raw_model:
        updates["model_full"] = raw_model
    if search_title and doc.get("search_title") != search_title:
        updates["search_title"] = search_title
    if doc.get("canonical_version") != CURRENT_VERSION:
        updates["canonical_version"] = CURRENT_VERSION
    return updates or None


async def _migrate_docs(db) -> Dict[str, int]:
    """Run the canonical mapper over every vin_data doc whose canonical_version
    is missing or older than CURRENT_VERSION."""
    coll = db.vin_data
    selector = {
        "$or": [
            {"canonical_version": {"$exists": False}},
            {"canonical_version": {"$lt": CURRENT_VERSION}},
        ]
    }
    cursor = coll.find(selector, projection={
        "_id": 1, "make": 1, "model": 1, "title": 1, "year": 1,
        "make_canonical": 1, "model_canonical": 1,
        "model_full": 1, "search_title": 1, "canonical_version": 1,
    })

    stats = {"scanned": 0, "updated": 0, "skipped": 0, "fixed_land_rover": 0}
    pending = []
    BATCH = 200

    async for doc in cursor:
        stats["scanned"] += 1
        upd = await _canonicalise_one(doc)
        if upd is None:
            stats["skipped"] += 1
            continue
        if doc.get("make") == "Land" and upd.get("make_canonical") == "Land Rover":
            stats["fixed_land_rover"] += 1
        pending.append((doc["_id"], upd))
        if len(pending) >= BATCH:
            await _flush(coll, pending)
            stats["updated"] += len(pending)
            pending.clear()

    if pending:
        await _flush(coll, pending)
        stats["updated"] += len(pending)

    return stats


async def _flush(coll, batch):
    if DRY_RUN:
        return
    for _id, upd in batch:
        await coll.update_one({"_id": _id}, {"$set": upd})


async def _ensure_indexes(db) -> List[str]:
    """Create the vin_data indexes idempotently. Returns names of indexes
    that were newly created (or attempted)."""
    coll = db.vin_data
    created: List[str] = []

    if DRY_RUN:
        logger.info("[DRY_RUN] skipping index creation")
        return created

    async def _safe_create(keys, name, **opts):
        try:
            await coll.create_index(keys, name=name, **opts)
            created.append(name)
        except Exception as e:
            logger.warning("[index] %s failed: %s", name, e)

    await _safe_create([("vin", 1)], "vin_unique_sparse", unique=True, sparse=True)
    await _safe_create([("make_canonical", 1)], "make_canonical_1")
    await _safe_create([("model_canonical", 1)], "model_canonical_1")
    await _safe_create([("year", 1)], "year_1")
    await _safe_create([("current_bid", 1)], "current_bid_1")
    await _safe_create([("odometer", 1)], "odometer_1")
    await _safe_create([("auction_name", 1)], "auction_name_1")
    await _safe_create([("damage_primary", 1)], "damage_primary_1")
    await _safe_create([("status", 1), ("last_seen", -1)], "status_last_seen")
    await _safe_create([("make_canonical", 1), ("model_canonical", 1)], "make_model_canonical")
    await _safe_create([("make_canonical", 1), ("year", 1)], "make_year_canonical")
    await _safe_create([("current_bid", 1), ("year", 1)], "price_year")
    await _safe_create([("search_title", 1)], "search_title_1")
    return created


async def main() -> int:
    mongo_url = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
    db_name = os.environ.get("DB_NAME", "test_database")
    logger.info("connecting to %s db=%s (DRY_RUN=%s)", mongo_url, db_name, DRY_RUN)

    client = AsyncIOMotorClient(mongo_url)
    db = client[db_name]

    started = time.time()
    before = await _report(db, "BEFORE")
    doc_stats = await _migrate_docs(db)
    created_idx = await _ensure_indexes(db)
    after = await _report(db, "AFTER")
    elapsed = time.time() - started

    logger.info("─── MIGRATION STATS ───")
    for k, v in doc_stats.items():
        logger.info("  %s: %s", k, v)
    logger.info("  indexes_touched: %s", created_idx or "(none new)")
    logger.info("  elapsed: %.2f s", elapsed)
    logger.info("─── DONE ───")
    return 0 if (before["total"] == after["total"]) else 1


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
