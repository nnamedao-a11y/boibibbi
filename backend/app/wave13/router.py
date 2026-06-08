"""
BIBI Cars — Wave 13 — Delivery360 HTTP surface
================================================

Mounted at `/api/delivery/*` (most endpoints) + `/api/files/*` (file streaming).

Auth:
  * Listings are scope-aware via `app.services.auth_policy.get_current_user`.
  * Mutations + carrier CRUD require manager-or-admin (we'll defensively
    allow all authenticated staff to write since the existing surface
    already permits manager-driven workflows).

This router is intentionally side-effect free apart from the explicit
mutations — it never autocreates shipments. Shipments are created via
the existing wave-2 surface or by `POST /api/delivery/shipments`.
"""
from __future__ import annotations
import os
import uuid
import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import (APIRouter, Depends, HTTPException, Query, UploadFile, File, Form, Body, Request)
from fastapi.responses import FileResponse
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.services.delivery_health import (
    MILESTONE_ORDER, MILESTONE_LABEL, DOC_LABEL,
)
from app.services.object_storage import get_storage
from app.wave13.aggregations import (
    compute_delivery_overview,
    list_shipments,
    compute_carriers,
    build_delivery_bundle,
)

logger = logging.getLogger("bibi.wave13")

router       = APIRouter(prefix="/api/delivery", tags=["Wave13:Delivery360"])
files_router = APIRouter(prefix="/api/files",    tags=["Wave13:Files"])

from security import require_user, require_manager_or_admin  # type: ignore


def _db(request: Request) -> AsyncIOMotorDatabase:
    db = getattr(request.app.state, "db", None)
    if db is None:
        raise HTTPException(500, "Database not initialised on app.state")
    return db


# ============================================================================
# OVERVIEW + QUEUES
# ============================================================================
@router.get("/overview")
async def overview_endpoint(
    request: Request,
    current_user: Dict[str, Any] = Depends(require_user),
):
    db = _db(request)
    data = await compute_delivery_overview(db, current_user)
    return {"success": True, "data": data}


@router.get("/shipments")
async def shipments_endpoint(
    request: Request,
    segment:      Optional[str] = Query(None),
    milestone:    Optional[str] = Query(None),
    only_at_risk: bool          = Query(False),
    limit:        int           = Query(200, ge=1, le=1000),
    current_user: Dict[str, Any] = Depends(require_user),
):
    db = _db(request)
    items = await list_shipments(
        db, current_user,
        limit=limit, segment=segment, milestone=milestone, only_at_risk=only_at_risk,
    )
    return {"success": True, "items": items, "total": len(items)}


@router.get("/risk")
async def risk_endpoint(
    request: Request,
    current_user: Dict[str, Any] = Depends(require_user),
):
    db = _db(request)
    items = await list_shipments(db, current_user, only_at_risk=True, limit=500)
    by_segment = {"delay_risk": 0, "delayed": 0, "critical": 0}
    for r in items:
        by_segment[r["delivery_health"]] = by_segment.get(r["delivery_health"], 0) + 1
    return {"success": True, "items": items, "total": len(items), "by_segment": by_segment}


# ============================================================================
# CARRIERS
# ============================================================================
@router.get("/carriers")
async def carriers_endpoint(
    request: Request,
    current_user: Dict[str, Any] = Depends(require_user),
):
    db = _db(request)
    rows = await compute_carriers(db, current_user)
    return {"success": True, "items": rows, "total": len(rows)}


@router.post("/carriers")
async def create_carrier_endpoint(
    request: Request,
    payload: Dict[str, Any] = Body(...),
    current_user: Dict[str, Any] = Depends(require_manager_or_admin),
):
    db = _db(request)
    name = (payload.get("name") or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Carrier name is required")
    doc = {
        "id":         f"carrier_{int(datetime.now(timezone.utc).timestamp())}_{uuid.uuid4().hex[:6]}",
        "name":       name,
        "contact":    (payload.get("contact") or "").strip(),
        "country":    (payload.get("country") or "").strip(),
        "notes":      (payload.get("notes") or "").strip(),
        "created_at": datetime.now(timezone.utc),
        "created_by": current_user.get("id") or current_user.get("sub"),
    }
    await db.carriers.insert_one(doc)
    doc.pop("_id", None)
    return {"success": True, "data": doc}


# ============================================================================
# ONE SHIPMENT — full Delivery360 bundle
# ============================================================================
@router.get("/{shipment_or_deal_id}")
async def delivery_bundle_endpoint(
    request: Request,
    shipment_or_deal_id: str,
    current_user: Dict[str, Any] = Depends(require_user),
):
    db = _db(request)
    bundle = await build_delivery_bundle(db, shipment_or_deal_id, user=current_user)
    if not bundle:
        raise HTTPException(status_code=404, detail="Shipment not found")
    return {"success": True, "data": bundle}


# ============================================================================
# WRITES — milestones / ETA / carrier assignment / create shipment
# ============================================================================
@router.post("/shipments")
async def create_shipment_endpoint(
    request: Request,
    payload: Dict[str, Any] = Body(...),
    current_user: Dict[str, Any] = Depends(require_manager_or_admin),
):
    """Create a brand-new shipment row attached to a deal. We only fill the
    minimal `delivery` sub-object — vessel/AIS tracking is layered on top by
    the existing wave-2 surface."""
    db = _db(request)
    deal_id = (payload.get("deal_id") or payload.get("dealId") or "").strip()
    if not deal_id:
        raise HTTPException(status_code=400, detail="deal_id is required")
    deal = await db.deals.find_one({"id": deal_id}, {"_id": 0})
    if not deal:
        raise HTTPException(status_code=404, detail="Deal not found")

    # Resolve carrier_name if only carrier_id is supplied (and vice-versa).
    carrier_id   = payload.get("carrier_id")
    carrier_name = payload.get("carrier_name")
    if carrier_id and not carrier_name:
        c = await db.carriers.find_one({"id": carrier_id}, {"_id": 0})
        if c:
            carrier_name = c.get("name")

    sid = f"shipment_{int(datetime.now(timezone.utc).timestamp())}_{uuid.uuid4().hex[:6]}"
    doc = {
        "id":          sid,
        "deal_id":     deal_id,
        "dealId":      deal_id,
        "managerId":   deal.get("managerId") or deal.get("manager_id"),
        "manager_id":  deal.get("managerId") or deal.get("manager_id"),
        "vin":         payload.get("vin") or deal.get("vin"),
        "vehicleLabel": payload.get("vehicleLabel") or deal.get("title") or deal.get("vehicle_label"),
        "created_at":  datetime.now(timezone.utc),
        "created_by":  current_user.get("id") or current_user.get("sub"),
        "delivery": {
            "current_milestone": (payload.get("current_milestone") or "auction_won"),
            "milestones":        [],
            "eta_expected":      payload.get("eta_expected"),
            "eta_actual":        None,
            "carrier_id":        carrier_id,
            "carrier_name":      carrier_name,
            "pickup_at":         None,
            "delivered_at":      None,
            "cancelled":         False,
        },
    }
    await db.shipments.insert_one(doc)
    doc.pop("_id", None)
    return {"success": True, "data": doc}


async def _load_shipment_or_404(db, shipment_id: str) -> Dict[str, Any]:
    sh = await db.shipments.find_one({"id": shipment_id}, {"_id": 0})
    if not sh:
        # Allow callers to pass the deal_id and we resolve.
        sh = await db.shipments.find_one(
            {"$or": [{"dealId": shipment_id}, {"deal_id": shipment_id}]},
            {"_id": 0},
        )
        if not sh:
            raise HTTPException(status_code=404, detail="Shipment not found")
    return sh


@router.post("/{shipment_id}/milestone")
async def add_milestone_endpoint(
    request: Request,
    shipment_id: str,
    payload: Dict[str, Any] = Body(...),
    current_user: Dict[str, Any] = Depends(require_manager_or_admin),
):
    db = _db(request)
    sh = await _load_shipment_or_404(db, shipment_id)
    key = (payload.get("key") or "").strip()
    if key not in MILESTONE_ORDER and key != "cancelled":
        raise HTTPException(status_code=400, detail=f"Unknown milestone '{key}'")
    when = payload.get("at") or datetime.now(timezone.utc)
    if isinstance(when, str):
        try:
            when = datetime.fromisoformat(when.replace("Z", "+00:00"))
        except Exception:
            when = datetime.now(timezone.utc)
    entry = {
        "key":  key,
        "label": MILESTONE_LABEL.get(key, key),
        "at":   when,
        "by":   current_user.get("name") or current_user.get("email")
                 or current_user.get("id"),
        "note": (payload.get("note") or "").strip(),
    }

    # Update doc — dedupe by `key` (advancing == replacing the existing entry's time)
    delivery = sh.get("delivery") or {}
    log = [m for m in (delivery.get("milestones") or []) if m.get("key") != key]
    log.append(entry)
    delivery["milestones"] = log
    delivery["current_milestone"] = key
    if key == "picked_up":
        delivery["pickup_at"] = when
    if key == "delivered":
        delivery["delivered_at"] = when
        delivery["eta_actual"]   = when
    if key == "cancelled":
        delivery["cancelled"] = True

    await db.shipments.update_one(
        {"id": sh["id"]},
        {"$set": {"delivery": delivery, "updated_at": datetime.now(timezone.utc)}},
    )
    return {"success": True, "data": {"shipment_id": sh["id"], "current_milestone": key}}


@router.post("/{shipment_id}/eta")
async def set_eta_endpoint(
    request: Request,
    shipment_id: str,
    payload: Dict[str, Any] = Body(...),
    current_user: Dict[str, Any] = Depends(require_manager_or_admin),
):
    db = _db(request)
    sh = await _load_shipment_or_404(db, shipment_id)
    delivery = sh.get("delivery") or {}
    update: Dict[str, Any] = {}

    def _coerce(v: Any) -> Optional[datetime]:
        if not v:
            return None
        if isinstance(v, datetime):
            return v
        try:
            return datetime.fromisoformat(str(v).replace("Z", "+00:00"))
        except Exception:
            return None

    if "eta_expected" in payload:
        update["eta_expected"] = _coerce(payload.get("eta_expected"))
    if "eta_actual" in payload:
        update["eta_actual"]   = _coerce(payload.get("eta_actual"))

    if not update:
        raise HTTPException(status_code=400, detail="Provide eta_expected and/or eta_actual")

    delivery.update(update)
    await db.shipments.update_one(
        {"id": sh["id"]},
        {"$set": {"delivery": delivery, "updated_at": datetime.now(timezone.utc)}},
    )
    return {"success": True, "data": {"shipment_id": sh["id"], **{k: (v.isoformat() if isinstance(v, datetime) else v) for k, v in update.items()}}}


@router.post("/{shipment_id}/carrier")
async def assign_carrier_endpoint(
    request: Request,
    shipment_id: str,
    payload: Dict[str, Any] = Body(...),
    current_user: Dict[str, Any] = Depends(require_manager_or_admin),
):
    db = _db(request)
    sh = await _load_shipment_or_404(db, shipment_id)
    cid = (payload.get("carrier_id") or "").strip() or None
    cname = (payload.get("carrier_name") or "").strip() or None
    if cid:
        c = await db.carriers.find_one({"id": cid}, {"_id": 0})
        if not c:
            raise HTTPException(status_code=404, detail="Carrier not found")
        cname = cname or c.get("name")
    if not cid and not cname:
        raise HTTPException(status_code=400, detail="Provide carrier_id or carrier_name")

    delivery = sh.get("delivery") or {}
    delivery["carrier_id"]   = cid
    delivery["carrier_name"] = cname
    await db.shipments.update_one(
        {"id": sh["id"]},
        {"$set": {"delivery": delivery, "updated_at": datetime.now(timezone.utc)}},
    )
    return {"success": True, "data": {"shipment_id": sh["id"], "carrier_id": cid, "carrier_name": cname}}


# ============================================================================
# DOCUMENTS
# ============================================================================
@router.post("/{shipment_id}/documents/upload")
async def upload_document_endpoint(
    request: Request,
    shipment_id: str,
    file: UploadFile = File(...),
    kind: str = Form("other"),
    note: str = Form(""),
    current_user: Dict[str, Any] = Depends(require_manager_or_admin),
):
    db = _db(request)
    sh = await _load_shipment_or_404(db, shipment_id)
    storage = get_storage()
    raw = await file.read()
    if not raw:
        raise HTTPException(status_code=400, detail="Empty file")
    if len(raw) > 25 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="File too large (max 25 MB)")
    kind = (kind or "other").lower()
    if kind not in DOC_LABEL:
        kind = "other"

    info = await storage.put(
        prefix=f"delivery/{sh['id']}",
        filename=file.filename or "file",
        data=raw,
        content_type=file.content_type,
    )
    doc = {
        "id":           f"doc_{int(datetime.now(timezone.utc).timestamp())}_{uuid.uuid4().hex[:6]}",
        "shipment_id":  sh["id"],
        "deal_id":      sh.get("deal_id") or sh.get("dealId"),
        "kind":         kind,
        "label":        DOC_LABEL.get(kind, "Other"),
        "name":         info["filename"],
        "url":          info["url"],
        "key":          info["key"],
        "size":         info["size"],
        "content_type": info["content_type"],
        "note":         (note or "").strip(),
        "uploaded_at":  datetime.now(timezone.utc),
        "uploaded_by":  current_user.get("name") or current_user.get("email"),
    }
    await db.delivery_documents.insert_one(doc)
    doc.pop("_id", None)
    return {"success": True, "data": doc}


@router.delete("/{shipment_id}/documents/{doc_id}")
async def delete_document_endpoint(
    request: Request,
    shipment_id: str,
    doc_id: str,
    current_user: Dict[str, Any] = Depends(require_manager_or_admin),
):
    db = _db(request)
    sh = await _load_shipment_or_404(db, shipment_id)
    doc = await db.delivery_documents.find_one({"id": doc_id, "shipment_id": sh["id"]})
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    storage = get_storage()
    if doc.get("key"):
        storage.delete(doc["key"])
    await db.delivery_documents.delete_one({"id": doc_id})
    return {"success": True, "data": {"deleted": doc_id}}


# ============================================================================
# FILE STREAMING (token-protected)
# ============================================================================
@files_router.get("/{key:path}")
async def get_file_endpoint(
    request: Request,
    key: str,
    current_user: Dict[str, Any] = Depends(require_user),
):
    storage = get_storage()
    try:
        path = storage.path(key)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="File not found")
    except ValueError:
        raise HTTPException(status_code=400, detail="Bad key")
    return FileResponse(str(path))


__all__ = ["router", "files_router"]
