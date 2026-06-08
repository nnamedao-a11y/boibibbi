"""
admin_shipments — /api/admin/shipments HTTP surface (read-only subset)
=====================================================================

Wave 2B / Batch 12 / Commit 18 — read-only shipments + resolver/queue (1/2).

Mechanical 1:1 extraction of 3 read-only admin endpoints that operate
on the Cluster #1 `shipments` collection.  Originals at server.py:
  * 20451  GET /api/admin/shipments/search
  * 20519  GET /api/admin/shipments/exceptions
  * 20638  GET /api/admin/shipments/{shipment_id}/resolver/status

────────────────────────────────────────────────────────────────────────
Audit verdict — PURE READ-ONLY (Phase 3 preview rule satisfied)
────────────────────────────────────────────────────────────────────────

| Probe                                          | Result |
|------------------------------------------------|--------|
| update_*/insert_*/delete_*/find_one_and_*      | NONE   |
| create_index / drop_index                      | NONE   |
| Lazy writer bridges                            | NONE   |
| Server.py mutation helpers (_persist_*, etc.)  | NONE   |
| Operations used                                | `find()`, `find_one()`, `to_list()` |
| Foreign collections READ                       | shipments (Cluster #1) |
| Foreign collections WRITTEN                    | NONE   |

→ All 4 conditions of the Phase 3 preview rule hold.

────────────────────────────────────────────────────────────────────────
Bridge surface — 4 lazy bridges (Wave-1 read-only helper pattern)
────────────────────────────────────────────────────────────────────────

The original handlers use 4 server.py helpers that are PURE FUNCTIONS
(no Mongo mutation, no global mutation, no side effects):

  * `ensure_shipment_stages(sh)` — in-memory mutator on the dict only
    (not on the DB).  Normalises the `stages` array shape.
  * `get_current_stage(sh)`     — in-memory accessor.
  * `serialize_journey(sh)`     — pure read transformation.
  * `serialize_doc(doc)`        — standard utility (used in 57 sites,
    deferred to Phase 5 utils extraction).

All 4 are lazy-imported via the `_helpers()` accessor below.  Same
pattern as `_db()` / `_aggregator()` / `_serialize_doc()` in prior
batches; no new bridge class introduced.

────────────────────────────────────────────────────────────────────────
Residual edges — documented, NOT extracted (narrow scope mandate)
────────────────────────────────────────────────────────────────────────

The `shipments/{id}/resolver/run` POST endpoint (server.py:20610) and
`resolver/run-queue` POST endpoint (server.py:20711) are TIER B —
they call `_persist_resolver_hits` (writer) and are scheduled for
Batch 14 (mutation owners + service-delegated extraction).

The `resolver/exceptions` and `resolver/identity/{id}` GET endpoints
(server.py:22550, 22561) are TIER C aliases that delegate to
`admin_identity_*` handlers — strict Phase 3 blockers (operational
core identity domain).  Stay in server.py.

Auth: `require_admin` (uniform across all 3 endpoints).
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException

from security import require_admin

# Phase 5.4 / C-4i — db_runtime accessor (module-level function reference).
# Only the `get_db` CALLABLE is imported at module-load time. Every
# `_db()` call resolves the live Motor handle via `get_db()`, preserving
# the call-time semantics of the legacy `from server import db` bridge.
# Tracking-worker-adjacent module (resolver/run uses identity_runtime).
from app.core.db_runtime import get_db  # noqa: E402 (C-4i: lazy-bridge → accessor)


def _db():
    """Return the live Mongo handle — resolves at call-time.

    Phase 5.4 / C-4i — migrated to ``app.core.db_runtime.get_db()``.
    Read-only shipments search/exceptions + resolver-status surface.
    The `_identity_runtime()` and `_helpers()` non-db bridges remain
    untouched per C-4i scope (they're outside the `from server import db`
    set).
    """
    return get_db()


def _helpers():
    """Lazy bridge to the 4 pure helpers used by these handlers.
    All 4 are read/transform-only — no Mongo mutation, no global mutation.

    Phase 5.2 / C-1: `serialize_doc` migrated to
    `app.utils.serialization`.
    Phase 5.4 / C-5e: `get_current_stage` and `serialize_journey`
    migrated to `app.utils.shipments` (Tier-B/C-adjacent shipment
    helper retirement). The verbatim canonical impl lives there;
    server.py keeps a thin compat shim for legacy callers.
    `ensure_shipment_stages` remains in server.py — Tier-C, requires
    business-logic refactor (out of C-5e scope).
    """
    from app.utils.serialization import serialize_doc  # Phase 5.2 / C-1
    from app.utils.shipments import (  # Phase 5.4 / C-5e
        get_current_stage,
        serialize_journey,
    )
    # Phase 5.5/I — canonical home is app/services/shipments.py
    from app.services.shipments import ensure_shipment_stages  # noqa: E402
    return ensure_shipment_stages, get_current_stage, serialize_doc, serialize_journey


router = APIRouter(
    prefix="/api/admin/shipments",
    tags=["admin-shipments"],
    dependencies=[Depends(require_admin)],
)


@router.get("/search")
async def search_shipments(q: str = '', limit: int = 50):
    """
    Search across: VIN, shipment.id, shipment.dealId,
    vessel (top-level and inside every stage) name/mmsi/imo,
    container (top-level and inside every stage) number/sealNumber.

    Powers the manager's search bar. Case-insensitive substring match.
    """
    db = _db()
    ensure_shipment_stages, _get_current_stage, _serialize_doc, serialize_journey = _helpers()
    q_raw = (q or '').strip()
    if not q_raw:
        return {"ok": True, "results": [], "total": 0}
    import re as _re
    pattern = _re.escape(q_raw)
    rx = {"$regex": pattern, "$options": "i"}

    query = {
        "$or": [
            {"id":              rx},
            {"vin":             rx},
            {"dealId":          rx},
            {"customerId":      rx},
            {"vehicleTitle":    rx},
            # top-level vessel
            {"vessel.name":     rx},
            {"vessel.mmsi":     rx},
            {"vessel.imo":      rx},
            # top-level container
            {"container.number":     rx},
            {"container.sealNumber": rx},
            # inside stages
            {"stages.vessel.name":        rx},
            {"stages.vessel.mmsi":        rx},
            {"stages.vessel.imo":         rx},
            {"stages.container.number":   rx},
            {"stages.container.sealNumber": rx},
        ],
    }

    raw = await db.shipments.find(query).limit(max(1, min(int(limit), 200))).to_list(None)
    results = []
    for sh in raw:
        ensure_shipment_stages(sh)  # so currentStage/currentVessel/etc work
        j = serialize_journey(sh)
        # Compact result — enough for a search row; full details load on click.
        results.append({
            "id":              j["id"],
            "vin":             j["vin"],
            "customerId":      j["customerId"],
            "vehicleTitle":    sh.get('vehicleTitle'),
            "status":          sh.get('status'),
            "currentVessel":   j.get("currentVessel"),
            "currentContainer": j.get("currentContainer"),
            "origin":          j.get("origin"),
            "destination":     j.get("destination"),
            "progress":        j.get("progress"),
            "trackingHealth":  j.get("trackingHealth"),
            "trackingSource":  j.get("trackingSource"),
            "liveEta":         j.get("liveEta"),
            "location":        j.get("location"),
            "lastTrackingUpdate": j.get("lastTrackingUpdate"),
        })
    return {"ok": True, "results": results, "total": len(results), "query": q_raw}


@router.get("/exceptions")
async def shipments_exceptions():
    """
    Lists shipments that currently need manual review, grouped by reason.

    Reasons:
      • stale         — tracking update > 3 h old
      • no_data       — trackingActive=true but no source / no position
      • no_vessel     — active stage is 'vessel' but no mmsi/imo/name bound
      • no_container  — active stage is 'vessel' but no container bound (soft)
      • stuck_progress — progress > 0.99 for > 24 h and not delivered
    """
    db = _db()
    ensure_shipment_stages, get_current_stage, serialize_doc, _serialize_journey = _helpers()
    tracked = await db.shipments.find(
        {"trackingActive": True}
    ).to_list(None)
    now_ts = datetime.now(timezone.utc)
    buckets: Dict[str, List[Dict[str, Any]]] = {
        "stale": [], "no_data": [], "no_vessel": [],
        "no_container": [], "stuck_progress": [],
    }
    total = 0

    def _age_sec(dt_val) -> Optional[float]:
        if isinstance(dt_val, datetime):
            if dt_val.tzinfo is None:
                dt_val = dt_val.replace(tzinfo=timezone.utc)
            return (now_ts - dt_val).total_seconds()
        if isinstance(dt_val, str):
            try:
                dt_val = datetime.fromisoformat(dt_val.replace('Z', '+00:00'))
                return (now_ts - dt_val).total_seconds()
            except Exception:
                return None
        return None

    for sh in tracked:
        ensure_shipment_stages(sh)
        issues: List[str] = []
        cur = get_current_stage(sh) or {}
        # Last update age
        age = _age_sec(sh.get('lastTrackingUpdate') or (sh.get('currentPosition') or {}).get('updatedAt'))
        if age is not None and age > 3 * 3600:
            issues.append('stale')
        src = sh.get('trackingSource') or (sh.get('currentPosition') or {}).get('source')
        if not src or not sh.get('currentPosition'):
            issues.append('no_data')
        # Vessel-stage requirements
        if cur.get('type') == 'vessel':
            cv = cur.get('vessel') or {}
            if not (cv.get('mmsi') or cv.get('imo') or cv.get('name')):
                issues.append('no_vessel')
            if not (cur.get('container') or {}).get('number'):
                issues.append('no_container')
        # Stuck near destination for long time
        if (sh.get('progress') or 0) >= 0.99 and sh.get('status') != 'delivered':
            if age is not None and age > 24 * 3600:
                issues.append('stuck_progress')
        if not issues:
            continue
        total += 1
        compact = {
            "id":             sh.get('id'),
            "vin":            sh.get('vin'),
            "customerId":     sh.get('customerId'),
            "vehicleTitle":   sh.get('vehicleTitle'),
            "origin":         (sh.get('origin') or {}).get('name'),
            "destination":    (sh.get('destination') or {}).get('name'),
            "progress":       sh.get('progress') or 0,
            "currentStageId": sh.get('currentStageId'),
            "currentStageType": cur.get('type'),
            "currentVessel":  cur.get('vessel') or sh.get('vessel'),
            "currentContainer": cur.get('container') or sh.get('container'),
            "trackingSource": src,
            "lastTrackingUpdate": sh.get('lastTrackingUpdate'),
            "ageHours":       round((age or 0) / 3600, 1) if age is not None else None,
            "issues":         issues,
        }
        for bucket in issues:
            buckets[bucket].append(serialize_doc(compact))
    return {
        "ok":     True,
        "total":  total,
        "buckets": {k: v for k, v in buckets.items()},
        "counts": {k: len(v) for k, v in buckets.items()},
        "computedAt": now_ts.isoformat().replace('+00:00', 'Z'),
    }


@router.get("/{shipment_id}/resolver/status")
async def shipment_resolver_status(shipment_id: str):
    """Returns the last stored resolver trace for a shipment."""
    db = _db()
    _ens, _cur, serialize_doc, _j = _helpers()
    shipment = await db.shipments.find_one(
        {"id": shipment_id},
        {"_id": 0, "id": 1, "resolver": 1, "container": 1, "vessel": 1,
         "containerConfidence": 1, "vesselConfidence": 1,
         "containerAutoResolved": 1, "vesselAutoResolved": 1},
    )
    if not shipment:
        raise HTTPException(status_code=404, detail="Shipment not found")
    return {"ok": True, **serialize_doc(shipment)}


# ─────────────────────────────────────────────────────────────
# Phase 3.3 / C-1 — Tier B writer extraction from server.py:20269
# Original: POST /api/admin/shipments/{shipment_id}/resolver/run
# Behavioural-1:1: same M-4/M-5 lazy bridges, same response shape.
# ─────────────────────────────────────────────────────────────
def _identity_runtime():
    """Direct accessor to the IdentityRuntimeService singleton.

    Phase 5.5/G — retired the legacy ``from server import identity_runtime``
    lazy bridge.  Canonical home: ``app/services/identity_runtime.py``.
    """
    from app.services.identity_runtime import identity_runtime  # noqa: E402
    return identity_runtime


@router.post("/{shipment_id}/resolver/run")
async def shipment_resolver_run(shipment_id: str):
    """
    Manually trigger the Auto Resolver for one shipment.
    Returns the full report + diff of what was persisted.
    """
    db = _db()
    ensure_shipment_stages, _cur, serialize_doc, _j = _helpers()
    runtime = _identity_runtime()
    shipment = await db.shipments.find_one({"id": shipment_id})
    if not shipment:
        raise HTTPException(status_code=404, detail="Shipment not found")
    ensure_shipment_stages(shipment)
    report = await runtime.run_auto_resolver(shipment)
    persisted = await runtime.persist_resolver_hits(shipment, report)
    fresh = await db.shipments.find_one({"id": shipment_id}) or shipment
    return {
        "ok": True,
        "shipmentId": shipment_id,
        "report": serialize_doc(report),
        "persisted": persisted,
        "shipment": {
            "container": (fresh.get("container") or {}).get("number"),
            "vessel": fresh.get("vessel"),
            "containerConfidence": fresh.get("containerConfidence"),
            "vesselConfidence": fresh.get("vesselConfidence"),
        },
    }
