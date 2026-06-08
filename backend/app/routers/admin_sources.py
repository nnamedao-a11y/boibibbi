"""
admin_sources — /api/admin/sources/* HTTP surface — REAL DB IMPLEMENTATION
==========================================================================

Phase 6.5+ Wave 3 follow-up: hard-coded ``IAAI 1500 / Copart 2200`` payloads
retired in favour of real ingestion-source counts.

Known source attribution paths:
  * db.vin_data            — primary (source: "bitmotors" mostly)
  * db.vin_data_lemon      — Lemon ingestion stream
  * db.vin_data_westmotors — WestMotors ingestion stream

Each physical collection becomes a "source" row; the inline ``source`` field
on documents is used as a fallback when the collection holds multi-source data.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, List

from fastapi import APIRouter, Body, Depends, HTTPException

from security import require_admin
from app.core.db_runtime import get_db

router = APIRouter(
    prefix="/api/admin/sources",
    tags=["admin-sources"],
    dependencies=[Depends(require_admin)],
)

# Physical ingestion stream → public name
SOURCE_COLLECTIONS: Dict[str, str] = {
    "vin_data": "Bitmotors",
    "vin_data_lemon": "Lemon",
    "vin_data_westmotors": "WestMotors",
}


async def _safe_count(db, coll: str, q: Dict[str, Any] | None = None) -> int:
    try:
        return await db[coll].count_documents(q or {})
    except Exception:
        return 0


async def _build_source_rows(db) -> List[Dict[str, Any]]:
    rows: List[Dict[str, Any]] = []
    for coll_name, label in SOURCE_COLLECTIONS.items():
        total = await _safe_count(db, coll_name)
        fresh = await _safe_count(db, coll_name, {"stale": {"$ne": True}})
        archived = await _safe_count(db, coll_name, {"archived": True})
        # last_seen — most recent document
        last_seen = None
        try:
            doc = await db[coll_name].find_one(sort=[("last_seen", -1)])
            if doc:
                last_seen = doc.get("last_seen") or doc.get("created_at")
        except Exception:
            pass

        # Toggle status — kept in app_settings.sources_disabled[]
        disabled = False
        try:
            s = await db.app_settings.find_one({"_id": "sources"}) or {}
            disabled = coll_name in (s.get("disabled") or [])
        except Exception:
            disabled = False

        rows.append({
            "id": coll_name,
            "name": label,
            "active": not disabled and total > 0,
            "count": total,
            "fresh": fresh,
            "archived": archived,
            "lastSeen": last_seen,
        })
    return rows


@router.get("")
async def admin_sources():
    db = get_db()
    return {"sources": await _build_source_rows(db)}


@router.post("/recompute")
async def sources_recompute():
    """Force-refresh — currently a no-op because counts are computed on read."""
    db = get_db()
    return {"success": True, "sources": await _build_source_rows(db)}


@router.get("/{source_id}")
async def get_source(source_id: str):
    db = get_db()
    rows = await _build_source_rows(db)
    for r in rows:
        if r["id"] == source_id:
            return r
    raise HTTPException(status_code=404, detail="source not found")


@router.put("/{source_id}")
async def update_source(source_id: str, data: Dict[str, Any] = Body(...)):
    """Enable / disable a source by upserting into app_settings.sources.disabled[]."""
    db = get_db()
    if source_id not in SOURCE_COLLECTIONS:
        raise HTTPException(status_code=404, detail="unknown source")
    enable = bool(data.get("active", True))
    try:
        s = await db.app_settings.find_one({"_id": "sources"}) or {"_id": "sources", "disabled": []}
        disabled = list(s.get("disabled") or [])
        if enable and source_id in disabled:
            disabled.remove(source_id)
        elif not enable and source_id not in disabled:
            disabled.append(source_id)
        await db.app_settings.update_one(
            {"_id": "sources"},
            {"$set": {"disabled": disabled, "updated_at": datetime.now(timezone.utc).isoformat()}},
            upsert=True,
        )
        return {"success": True, "active": enable}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
