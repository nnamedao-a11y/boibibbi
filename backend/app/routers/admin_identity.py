"""
admin_identity — /api/admin/identity/* + 3 legacy aliases
==========================================================

Phase 3.3 / C-1 — Mechanical extraction of the identity domain.

Migrated from server.py:
  * POST /api/admin/identity/shipments/{shipment_id}/resolve         (~21378)
  * GET  /api/admin/identity/exceptions                              (~21416)
  * GET  /api/admin/identity/exceptions/count                        (~21467)
  * POST /api/admin/identity/exceptions/{exc_id}/confirm             (~21476)
  * POST /api/admin/identity/exceptions/{exc_id}/reject              (~21580)
  * GET  /api/admin/identity/shipments/{shipment_id}                 (~21773)
  * GET  /api/admin/identity/tracking-status                         (~21786)
  * POST /api/admin/identity/shipments/{shipment_id}/transfer-check  (~21816)
  * GET  /api/admin/tracking/status              (legacy alias)      (~21860)
  * GET  /api/admin/resolver/exceptions          (legacy alias)      (~21867)
  * GET  /api/admin/resolver/identity/{id}       (legacy alias)      (~21878)

Behavioural-1:1 mechanical extraction — identical handlers, identical
auth (require_admin), identical response shapes, identical Mongo writes.

The 3 alias endpoints are co-located here because they delegate to the
identity handlers by Python name; keeping them in the same module avoids
cross-router lazy imports.  The aliases use **two separate APIRouter**
instances internally (one prefixed ``/api/admin/identity``, another with
no prefix carrying ``/api/admin/tracking/status`` + ``/api/admin/resolver/*``)
so that the path-prefix scheme matches the original endpoints exactly.

All handlers route resolver / detector / shipment-event traffic through
``identity_runtime`` (Phase 3.2 boundary — see PHASE3_2_CLOSED.md).

Lazy bridges to ``server.py`` (uniform with Wave 2B Batch 12 pattern):
  * _db()                — live Motor handle (db rebinds during startup)
  * _audit()             — server.audit async callable

NOTE: ``_tracking_enabled()`` local wrapper retired in Phase 5.5/F2
(2026-05-19). The canonical home is now
``app.services.tracking_config.tracking_enabled`` (public name) and
the import lives at module scope — no local wrapper, no compat shim.
"""
from __future__ import annotations

import os
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel

from security import require_admin


# ─────────────────────────────────────────────────────────────
# Lazy bridges — same pattern as app/routers/admin_resolver.py.
# ─────────────────────────────────────────────────────────────
def _db():
    from app.core.db_runtime import get_db  # noqa: E402 (C-4e: lazy-bridge → accessor)
    return get_db()


def _audit():
    # Phase 5.4 / C-5c: canonical accessor for the audit async callable
    # (replaces the previous `from server import audit` lazy bridge).
    # Object identity preserved 1:1 — get_audit() returns the exact
    # same `server.audit` callable the worker loops also invoke.
    from app.core.audit_runtime import get_audit  # noqa: E402
    return get_audit()


def _identity_runtime():
    """Direct accessor to the IdentityRuntimeService singleton.

    Phase 5.5/G — retired the legacy ``from server import identity_runtime``
    lazy bridge.  Canonical home: ``app/services/identity_runtime.py``.
    """
    from app.services.identity_runtime import identity_runtime  # noqa: E402
    return identity_runtime


# Phase 5.5 / F2 (2026-05-19) — local ``_tracking_enabled`` wrapper
# retired.  The ``from server import _tracking_enabled as _te`` lazy
# bridge it carried was the LAST Tier-C bridge into ``server.py`` for
# the TRACKING kill switch.  The canonical home now lives at
# ``app/services/tracking_config.tracking_enabled`` (public name, no
# underscore — mirror of 5.5/C/D/E precedent).  The single call site
# at the route handler below imports ``tracking_enabled`` directly
# from the service module — no compat shim, no local wrapper.
from app.services.tracking_config import tracking_enabled  # noqa: E402


# ─────────────────────────────────────────────────────────────
# Pydantic models — extracted from server.py (verbatim).
# ─────────────────────────────────────────────────────────────
class _TransferCandidate(BaseModel):
    name: Optional[str] = None
    mmsi: Optional[str] = None
    imo: Optional[str] = None
    confidence: Optional[float] = None
    position: Optional[Dict[str, float]] = None
    progress: Optional[float] = None


# ─────────────────────────────────────────────────────────────
# Primary router — /api/admin/identity/*
# ─────────────────────────────────────────────────────────────
router = APIRouter(
    prefix="/api/admin/identity",
    tags=["admin-identity"],
    dependencies=[Depends(require_admin)],
)


# ── 1/8 ───────────────────────────────────────────────────────
@router.post("/shipments/{shipment_id}/resolve")
async def admin_identity_resolve(
    shipment_id: str,
    request: Request,
    current_user: dict = Depends(require_admin),
):
    """Run the Shipment Identity Resolver (Phase A+B+C) on one shipment.

    Returns the attempt report (decision/confidence/evidence). On high
    confidence (>0.85) writes to shipment_identity_links; on medium
    (0.5–0.85) writes to resolver_exceptions. Never mutates stages.
    """
    db = _db()
    shipment = await db.shipments.find_one({"id": shipment_id})
    if not shipment:
        raise HTTPException(status_code=404, detail="Shipment not found")
    deal = None
    deal_id = shipment.get("dealId")
    if deal_id:
        try:
            deal = await db.deals.find_one({"id": deal_id})
        except Exception:
            deal = None
    attempt = await _identity_runtime().resolve(shipment, deal=deal)
    await _audit()(
        "resolver_manual_run",
        user=current_user,
        resource=f"shipment:{shipment_id}",
        meta={"decision": attempt.decision, "confidence": attempt.finalConfidence},
        request=request,
    )
    return {"ok": True, "attempt": attempt.to_dict()}


# ── 2/8 ───────────────────────────────────────────────────────
@router.get("/exceptions")
async def admin_identity_exceptions(
    status_filter: str = "pending",
    limit: int = 50,
    current_user: dict = Depends(require_admin),
):
    """List resolver exceptions (low-confidence auto-bind attempts + transfer rejects).

    Each row is **enriched** with shipment metadata (VIN, container, current
    vessel) so the UI can render without extra fetches.
    """
    db = _db()
    limit = max(1, min(int(limit or 50), 200))
    q: Dict[str, Any] = {}
    if status_filter and status_filter != "all":
        q["status"] = status_filter
    cursor = db.resolver_exceptions.find(q).sort("createdAt", -1).limit(limit)
    items: List[Dict[str, Any]] = []
    ship_cache: Dict[str, Dict[str, Any]] = {}
    async for d in cursor:
        d["_id"] = str(d.get("_id"))
        ship_id = d.get("shipmentId")
        if ship_id and ship_id not in ship_cache:
            ship_cache[ship_id] = (
                await db.shipments.find_one(
                    {"id": ship_id},
                    {"_id": 0, "id": 1, "vin": 1, "vehicleTitle": 1,
                     "container": 1, "vessel": 1, "currentStageId": 1,
                     "stages": 1, "customerId": 1},
                )
                or {}
            )
        ship = ship_cache.get(ship_id) or {}
        cur_stage = None
        for st in (ship.get("stages") or []):
            if st.get("id") == ship.get("currentStageId"):
                cur_stage = st
                break
        d["shipment"] = {
            "id": ship_id,
            "vin": ship.get("vin"),
            "vehicleTitle": ship.get("vehicleTitle"),
            "customerId": ship.get("customerId"),
            "container": (ship.get("container") or {}).get("number") or (
                (cur_stage or {}).get("container") or {}
            ).get("number"),
            "currentVessel": (cur_stage or {}).get("vessel") or ship.get("vessel") or {},
        }
        items.append(d)
    return {"ok": True, "count": len(items), "items": items}


# ── 3/8 ───────────────────────────────────────────────────────
@router.get("/exceptions/count")
async def admin_identity_exceptions_count(
    current_user: dict = Depends(require_admin),
):
    """Pending-count badge for the admin sidebar. Returns 0 when no queue."""
    db = _db()
    n = await db.resolver_exceptions.count_documents({"status": "pending"})
    return {"ok": True, "pending": n}


# ── 4/8 ───────────────────────────────────────────────────────
@router.post("/exceptions/{exc_id}/confirm")
async def admin_identity_exceptions_confirm(
    exc_id: str,
    request: Request,
    current_user: dict = Depends(require_admin),
):
    """Confirm a resolver exception — apply the stored attempt.

    Two code paths depending on exception kind:
      * ``low_confidence_vessel`` (Phase A+B+C): bind the candidate
        container+vessel to shipment_identity_links + shipment.vessel.
      * ``transfer_rejected`` (Phase D): run transfer_detector._apply_transfer
        using the stored candidate regardless of confidence / distance guards.
    """
    from bson import ObjectId  # local import to avoid top-level dep
    db = _db()
    runtime = _identity_runtime()
    try:
        oid = ObjectId(exc_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Bad exception id")

    exc = await db.resolver_exceptions.find_one({"_id": oid})
    if not exc:
        raise HTTPException(status_code=404, detail="Exception not found")
    if exc.get("status") != "pending":
        raise HTTPException(status_code=409, detail=f"Exception already {exc.get('status')}")

    shipment_id = exc.get("shipmentId")
    shipment = await db.shipments.find_one({"id": shipment_id})
    if not shipment:
        raise HTTPException(status_code=404, detail="Shipment not found")

    kind = exc.get("kind") or ""
    data = exc.get("data") or {}
    now_iso = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")

    applied: Dict[str, Any] = {"kind": kind}

    if kind == "transfer_rejected":
        cand = {
            "name": data.get("newName") or (data.get("vessel") or {}).get("name"),
            "mmsi": data.get("newMmsi") or (data.get("vessel") or {}).get("mmsi"),
            "imo": (data.get("vessel") or {}).get("imo"),
            "confidence": float(data.get("confidence") or 1.0),
            "position": data.get("to") or data.get("position"),
        }
        cur_stage = None
        for st in (shipment.get("stages") or []):
            if st.get("id") == shipment.get("currentStageId"):
                cur_stage = st
                break
        if not cur_stage:
            raise HTTPException(status_code=409, detail="No active stage")
        result = await runtime.apply_transfer(shipment, cur_stage, cand)
        applied["result"] = result
        await runtime.publish_shipment_update(
            {
                "shipmentId": shipment_id,
                "type": "vessel_transferred",
                "newStageId": result.get("newStageId"),
                "to": cand, "from": cur_stage.get("vessel"),
                "manualConfirm": True,
            },
            customer_id=shipment.get("customerId"),
            kind="manual_confirm",
        )
    else:
        attempt = await runtime.resolve(shipment)
        applied["resolver_attempt"] = attempt.to_dict()

    await db.resolver_exceptions.update_one(
        {"_id": oid},
        {"$set": {
            "status": "confirmed",
            "resolvedAt": now_iso,
            "resolvedBy": current_user.get("id"),
            "manualApplied": applied,
        }},
    )
    await _audit()(
        "exception_confirmed",
        user=current_user,
        resource=f"shipment:{shipment_id}",
        meta={"excId": exc_id, "kind": kind, "reason": exc.get("reason")},
        request=request,
    )
    return {"ok": True, "excId": exc_id, "applied": applied}


# ── 5/8 ───────────────────────────────────────────────────────
@router.post("/exceptions/{exc_id}/reject")
async def admin_identity_exceptions_reject(
    exc_id: str,
    request: Request,
    current_user: dict = Depends(require_admin),
):
    """Mark a resolver exception as rejected (no action taken on shipment)."""
    from bson import ObjectId
    db = _db()
    try:
        oid = ObjectId(exc_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Bad exception id")
    exc = await db.resolver_exceptions.find_one({"_id": oid})
    if not exc:
        raise HTTPException(status_code=404, detail="Exception not found")
    if exc.get("status") != "pending":
        raise HTTPException(status_code=409, detail=f"Already {exc.get('status')}")
    now_iso = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    await db.resolver_exceptions.update_one(
        {"_id": oid},
        {"$set": {
            "status": "rejected",
            "resolvedAt": now_iso,
            "resolvedBy": current_user.get("id"),
        }},
    )
    await _audit()(
        "exception_rejected",
        user=current_user,
        resource=f"shipment:{exc.get('shipmentId')}",
        meta={"excId": exc_id, "kind": exc.get("kind"), "reason": exc.get("reason")},
        request=request,
    )
    return {"ok": True, "excId": exc_id, "status": "rejected"}


# ── 6/8 ───────────────────────────────────────────────────────
@router.get("/shipments/{shipment_id}")
async def admin_identity_get(
    shipment_id: str,
    current_user: dict = Depends(require_admin),
):
    """Return the current identity_link for a shipment (for UI inspection)."""
    db = _db()
    doc = await db.shipment_identity_links.find_one({"shipmentId": shipment_id})
    if not doc:
        return {"ok": True, "found": False}
    doc["_id"] = str(doc.get("_id"))
    return {"ok": True, "found": True, "identity": doc}


# ── 7/8 ───────────────────────────────────────────────────────
@router.get("/tracking-status")
async def admin_identity_tracking_status(
    current_user: dict = Depends(require_admin),
):
    """Read-only view of the TRACKING_ENABLED kill switch + last heartbeat."""
    db = _db()
    hb = await db.ext_heartbeat.find_one({"provider": "vesselfinder"}) or {}
    return {
        "ok": True,
        "trackingEnabled": tracking_enabled(),
        "extensionLastHeartbeatAt": hb.get("lastHeartbeatAt"),
        "extensionVersion": hb.get("extensionVersion"),
        "resolverIntervalSec": int(os.environ.get("RESOLVER_INTERVAL_SEC", 300)),
        "enforceNonce": os.environ.get("ENFORCE_NONCE", "0") in ("1", "true", "yes", "on"),
        "hmacWindowSec": int(os.environ.get("HMAC_WINDOW_SEC", 60)),
        "transferDetectIntervalSec": int(os.environ.get("TRANSFER_DETECT_INTERVAL_SEC", 120)),
    }


# ── 8/8 ───────────────────────────────────────────────────────
@router.post("/shipments/{shipment_id}/transfer-check")
async def admin_transfer_check(
    shipment_id: str,
    candidate: _TransferCandidate,
    request: Request,
    current_user: dict = Depends(require_admin),
):
    """Run Phase D transfer guards against a candidate vessel.

    Returns the detector's decision. On ``status=transfer`` the DB has been
    mutated (old stage closed, new stage pushed). On ``exception`` a row was
    saved to ``resolver_exceptions`` for manual review.
    """
    db = _db()
    shipment = await db.shipments.find_one({"id": shipment_id})
    if not shipment:
        raise HTTPException(status_code=404, detail="Shipment not found")
    result = await _identity_runtime().process_transfer(
        shipment, candidate.dict(exclude_none=True)
    )
    await _audit()(
        "transfer_manual_check",
        user=current_user,
        resource=f"shipment:{shipment_id}",
        meta={"status": result.get("status"), "reason": result.get("reason")},
        request=request,
    )
    return {"ok": True, "result": result}


# ─────────────────────────────────────────────────────────────
# Legacy alias router — no prefix (paths are absolute).
# Three aliases that delegate to the identity handlers by Python
# name; co-located here to avoid cross-router lazy imports.
# ─────────────────────────────────────────────────────────────
alias_router = APIRouter(
    tags=["admin-identity-aliases"],
    dependencies=[Depends(require_admin)],
)


@alias_router.get("/api/admin/tracking/status")
async def admin_tracking_status_alias(
    current_user: dict = Depends(require_admin),
):
    """Legacy alias for /api/admin/identity/tracking-status."""
    return await admin_identity_tracking_status(current_user=current_user)


@alias_router.get("/api/admin/resolver/exceptions")
async def admin_resolver_exceptions_alias(
    status_filter: str = "pending",
    limit: int = 50,
    current_user: dict = Depends(require_admin),
):
    """Legacy alias for /api/admin/identity/exceptions."""
    return await admin_identity_exceptions(
        status_filter=status_filter, limit=limit, current_user=current_user,
    )


@alias_router.get("/api/admin/resolver/identity/{shipment_id}")
async def admin_resolver_identity_alias(
    shipment_id: str,
    current_user: dict = Depends(require_admin),
):
    """Legacy alias for /api/admin/identity/shipments/{shipment_id}."""
    return await admin_identity_get(shipment_id=shipment_id, current_user=current_user)
