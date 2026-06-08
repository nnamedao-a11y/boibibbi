"""
sales — /api/sales HTTP surface  (Phase Final / Block 2)
==========================================================

Sales entity for BIBI Cars — represents a SOLD vehicle and its
attached commercial / legal context. Independent of ``deals`` (catalog
items) and ``invoices`` (services billing).

Resource model
--------------
::

    db.sales
    {
      id:               "sale_<10hex>",
      customerId:       str,                # required
      managerId:        str,                # required (assignment)
      source:           "manual" | "deal" | "vin",
      # vehicle identity
      vin:              str | None,
      lot:              str | None,
      auction:          "copart" | "iaai" | "manheim" | "korea_auction" | "other" | None,
      country:          "USA" | "KOREA" | "OTHER",   # origin country
      brand:            str | None,
      model:            str | None,
      year:             int | None,
      # Commercial
      saleAmount:       float,              # in saleCurrency
      saleCurrency:     "USD" | "EUR" | "BGN" | "UAH" | "GBP",
      # Links
      dealId:           str | None,         # link to db.deals (when source=deal)
      contractId:       str | None,         # link to db.contracts (Phase 1)
      invoiceIds:       list[str],          # related invoices
      acceptanceActId:  str | None,         # link to generated act PDF
      # Status
      status:           "draft" | "active" | "sold" | "cancelled",
      soldAt:           ISO8601 | None,
      cancelledAt:      ISO8601 | None,
      cancelReason:     str | None,
      notes:            str | None,
      # Attribution
      utm:              {utm_source, utm_medium, utm_campaign, utm_content, utm_term, source},
      # Audit
      created_at:       ISO8601,
      created_by:       str (email),
      updated_at:       ISO8601,
      updated_by:       str (email),
    }

Auth model
----------
* Public list/get inside cabinet → mounted separately in
  ``/api/customer-cabinet/{cid}/sales``; that view is a thin wrapper
  on ``list_sales(customer_id=cid)`` and lives in server.py to keep
  the cabinet bouquet co-located.

* Manager / team_lead / admin → full CRUD here via
  ``require_manager_or_admin``.

Inputs are validated at the HTTP layer with pydantic-style dicts
(matching the rest of the codebase). The router owns NO domain
logic — it composes data and delegates writes to
``app.repositories.sales.SalesRepository``.

Customer cabinet visibility
---------------------------
Sales with ``status in {"active","sold"}`` are visible in
``/customer-cabinet/{cid}/sales`` (the customer-facing view).
``draft`` and ``cancelled`` are hidden.
"""
from __future__ import annotations

import logging
import re
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Body, Depends, HTTPException, Query

from security import require_manager_or_admin, require_user
from app.core.db_runtime import get_db

logger = logging.getLogger("bibi.sales")

router = APIRouter(prefix="/api/sales", tags=["sales"])

ALLOWED_COUNTRIES = {"USA", "KOREA", "OTHER"}
ALLOWED_STATUSES = {"draft", "active", "sold", "cancelled"}
ALLOWED_SOURCES = {"manual", "deal", "vin"}
ALLOWED_CURRENCIES = {"USD", "EUR", "BGN", "UAH", "GBP"}
ALLOWED_AUCTIONS = {"copart", "iaai", "manheim", "korea_auction", "mobile_de", "autoscout24", "other"}

VIN_RE = re.compile(r"^[A-HJ-NPR-Z0-9]{11,17}$", re.IGNORECASE)


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _gen_id() -> str:
    return f"sale_{uuid.uuid4().hex[:10]}"


def _normalize(data: Dict[str, Any], *, partial: bool = False) -> Dict[str, Any]:
    """Whitelist + validate Sales fields. Drops unknown keys.

    Args:
        data: caller-supplied payload.
        partial: True for PATCH; permits missing required fields.
    """
    out: Dict[str, Any] = {}

    # Required (on create)
    if "customerId" in data:
        out["customerId"] = str(data["customerId"]).strip()
    if "managerId" in data:
        out["managerId"] = str(data["managerId"]).strip()

    # Vehicle identity
    if "vin" in data:
        vin = (data.get("vin") or "").strip().upper()
        if vin and not VIN_RE.match(vin):
            # accept short VINs but log; production data has dirty VINs
            logger.warning("[sales] vin %r does not match canonical VIN regex (allowing)", vin)
        out["vin"] = vin or None
    if "lot" in data:
        out["lot"] = (str(data.get("lot") or "").strip() or None)
    if "auction" in data:
        auc = (data.get("auction") or "").strip().lower() or None
        if auc and auc not in ALLOWED_AUCTIONS:
            # tolerate unknown — store as-is
            pass
        out["auction"] = auc
    if "country" in data:
        c = (data.get("country") or "").strip().upper()
        if c and c not in ALLOWED_COUNTRIES:
            raise HTTPException(400, f"country must be one of {sorted(ALLOWED_COUNTRIES)}")
        out["country"] = c or "OTHER"
    if "brand" in data:
        out["brand"] = (str(data.get("brand") or "").strip() or None)
    if "model" in data:
        out["model"] = (str(data.get("model") or "").strip() or None)
    if "year" in data:
        y = data.get("year")
        try:
            out["year"] = int(y) if y is not None and str(y).strip() != "" else None
        except (ValueError, TypeError):
            raise HTTPException(400, "year must be an integer")

    # Commercial
    if "saleAmount" in data:
        try:
            out["saleAmount"] = float(data.get("saleAmount") or 0)
        except (ValueError, TypeError):
            raise HTTPException(400, "saleAmount must be numeric")
    if "saleCurrency" in data:
        cur = (data.get("saleCurrency") or "USD").strip().upper()
        if cur not in ALLOWED_CURRENCIES:
            raise HTTPException(400, f"saleCurrency must be one of {sorted(ALLOWED_CURRENCIES)}")
        out["saleCurrency"] = cur

    # Links
    if "dealId" in data:
        out["dealId"] = (str(data.get("dealId") or "").strip() or None)
    if "contractId" in data:
        out["contractId"] = (str(data.get("contractId") or "").strip() or None)
    if "invoiceIds" in data:
        ids = data.get("invoiceIds") or []
        if not isinstance(ids, list):
            raise HTTPException(400, "invoiceIds must be a list")
        out["invoiceIds"] = [str(x).strip() for x in ids if x]
    if "acceptanceActId" in data:
        out["acceptanceActId"] = (str(data.get("acceptanceActId") or "").strip() or None)

    # Source
    if "source" in data:
        src = (data.get("source") or "manual").strip().lower()
        if src not in ALLOWED_SOURCES:
            raise HTTPException(400, f"source must be one of {sorted(ALLOWED_SOURCES)}")
        out["source"] = src

    # Status (driven by transitions, but allow direct write for admin)
    if "status" in data:
        st = (data.get("status") or "draft").strip().lower()
        if st not in ALLOWED_STATUSES:
            raise HTTPException(400, f"status must be one of {sorted(ALLOWED_STATUSES)}")
        out["status"] = st

    if "notes" in data:
        out["notes"] = (str(data.get("notes") or "").strip() or None)

    if "soldAt" in data:
        out["soldAt"] = data.get("soldAt")
    if "cancelledAt" in data:
        out["cancelledAt"] = data.get("cancelledAt")
    if "cancelReason" in data:
        out["cancelReason"] = (str(data.get("cancelReason") or "").strip() or None)

    return out


@router.get("", dependencies=[Depends(require_manager_or_admin)])
async def list_sales(
    customer_id: Optional[str] = Query(None, alias="customerId"),
    country: Optional[str] = None,
    status: Optional[str] = None,
    manager_id: Optional[str] = Query(None, alias="managerId"),
    limit: int = 200,
    current_user: Dict[str, Any] = Depends(require_manager_or_admin),
):
    """List Sales with optional filters.

    Visibility:
      * admin / master_admin / owner / team_lead → see everything
      * manager → only their own sales (managerId == self)
    """
    db = get_db()
    q: Dict[str, Any] = {}
    role = (current_user.get("role") or "").lower()
    if role == "manager":
        q["managerId"] = current_user.get("id")
    if customer_id:
        q["customerId"] = customer_id
    if country:
        q["country"] = country.strip().upper()
    if status:
        q["status"] = status.strip().lower()
    if manager_id and role != "manager":
        q["managerId"] = manager_id
    cursor = db.sales.find(q, {"_id": 0}).sort("created_at", -1).limit(int(limit))
    items = await cursor.to_list(length=int(limit))
    return {"success": True, "items": items, "count": len(items)}


@router.get("/{sale_id}", dependencies=[Depends(require_manager_or_admin)])
async def get_sale(sale_id: str):
    db = get_db()
    doc = await db.sales.find_one({"id": sale_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Sale not found")
    return {"success": True, "sale": doc}


@router.post("", dependencies=[Depends(require_manager_or_admin)])
async def create_sale(
    data: Dict[str, Any] = Body(...),
    user: Dict[str, Any] = Depends(require_manager_or_admin),
):
    """Create a Sale (manual / from deal / from VIN — same endpoint).

    Required: ``customerId`` + at least one of ``vin``, ``lot``, ``dealId``.

    If ``dealId`` is set, the helper enriches vin/lot/auction/brand/model/year
    from the linked deal doc (best-effort; missing fields stay None).
    """
    db = get_db()
    payload = _normalize(data, partial=False)

    # Required
    if not payload.get("customerId"):
        raise HTTPException(400, "customerId is required")
    # At least one identity
    if not payload.get("vin") and not payload.get("lot") and not payload.get("dealId"):
        raise HTTPException(400, "At least one of vin, lot or dealId is required")

    # Enrich from deal if dealId is set and we're missing core vehicle data
    if payload.get("dealId"):
        deal = await db.deals.find_one({"id": payload["dealId"]}, {"_id": 0}) \
            or await db.vin_data.find_one({"id": payload["dealId"]}, {"_id": 0})
        if deal:
            payload.setdefault("vin", deal.get("vin"))
            payload.setdefault("lot", deal.get("lot") or deal.get("lot_number"))
            payload.setdefault("auction", (deal.get("source") or "").lower() or None)
            payload.setdefault("brand", deal.get("brand") or deal.get("make"))
            payload.setdefault("model", deal.get("model"))
            payload.setdefault("year", deal.get("year"))

    # Source inference if not provided
    if not payload.get("source"):
        if payload.get("dealId"):
            payload["source"] = "deal"
        elif payload.get("vin"):
            payload["source"] = "vin"
        else:
            payload["source"] = "manual"

    # Default manager to current user
    payload.setdefault("managerId", user.get("id"))

    # Country default
    payload.setdefault("country", "OTHER")

    # Build doc
    doc = {
        "id": _gen_id(),
        "status": payload.get("status") or "draft",
        "vin": payload.get("vin"),
        "lot": payload.get("lot"),
        "auction": payload.get("auction"),
        "country": payload.get("country"),
        "brand": payload.get("brand"),
        "model": payload.get("model"),
        "year": payload.get("year"),
        "saleAmount": float(payload.get("saleAmount") or 0),
        "saleCurrency": payload.get("saleCurrency") or "USD",
        "customerId": payload["customerId"],
        "managerId": payload.get("managerId"),
        "dealId": payload.get("dealId"),
        "contractId": payload.get("contractId"),
        "invoiceIds": payload.get("invoiceIds") or [],
        "acceptanceActId": payload.get("acceptanceActId"),
        "source": payload["source"],
        "notes": payload.get("notes"),
        "soldAt": payload.get("soldAt"),
        "created_at": _now_iso(),
        "created_by": user.get("email") or user.get("id"),
        "updated_at": _now_iso(),
        "updated_by": user.get("email") or user.get("id"),
    }

    # UTM stamping (best-effort)
    try:
        from app.services.utm_propagation import extract_utm, stamp_utm
        utm = await extract_utm(db, customer_id=doc["customerId"])
        stamp_utm(doc, utm)
    except Exception:
        logger.exception("[sales] utm stamping failed (non-fatal)")

    await db.sales.insert_one(doc)
    doc.pop("_id", None)

    # Customer timeline event (best-effort)
    try:
        from app.services.customer_timeline import record_event
        await record_event(
            customer_id=doc["customerId"],
            kind="sale_created",
            title=f"Sale created — {doc.get('vin') or doc.get('lot') or doc['id']}",
            body=f"Amount: {doc.get('saleAmount')} {doc.get('saleCurrency')}",
            ref={"sale_id": doc["id"], "vin": doc.get("vin"), "lot": doc.get("lot")},
            actor={"id": user.get("id"), "email": user.get("email")},
            meta={"amount": doc.get("saleAmount"), "currency": doc.get("saleCurrency"), "country": doc.get("country")},
        )
    except Exception:
        logger.debug("[sales] timeline event write skipped", exc_info=True)

    return {"success": True, "sale": doc}


@router.patch("/{sale_id}", dependencies=[Depends(require_manager_or_admin)])
async def update_sale(
    sale_id: str,
    data: Dict[str, Any] = Body(...),
    user: Dict[str, Any] = Depends(require_manager_or_admin),
):
    db = get_db()
    upd = _normalize(data, partial=True)
    if not upd:
        raise HTTPException(400, "Nothing to update")
    upd["updated_at"] = _now_iso()
    upd["updated_by"] = user.get("email") or user.get("id")

    # Status transition side effects
    if upd.get("status") == "sold" and not upd.get("soldAt"):
        upd["soldAt"] = _now_iso()
    if upd.get("status") == "cancelled" and not upd.get("cancelledAt"):
        upd["cancelledAt"] = _now_iso()

    res = await db.sales.update_one({"id": sale_id}, {"$set": upd})
    if res.matched_count == 0:
        raise HTTPException(404, "Sale not found")

    doc = await db.sales.find_one({"id": sale_id}, {"_id": 0})
    return {"success": True, "sale": doc}


@router.delete("/{sale_id}", dependencies=[Depends(require_manager_or_admin)])
async def delete_sale(
    sale_id: str,
    user: Dict[str, Any] = Depends(require_manager_or_admin),
):
    """Soft-cancel a Sale (status=cancelled). Historical records preserved."""
    db = get_db()
    res = await db.sales.update_one(
        {"id": sale_id},
        {"$set": {
            "status": "cancelled",
            "cancelledAt": _now_iso(),
            "updated_at": _now_iso(),
            "updated_by": user.get("email") or user.get("id"),
        }},
    )
    if res.matched_count == 0:
        raise HTTPException(404, "Sale not found")
    return {"success": True}


# ── Customer-scoped helpers (mounted under /api/customers) ─────────
customers_router = APIRouter(prefix="/api/customers", tags=["sales"])


@customers_router.get("/{customer_id}/sales", dependencies=[Depends(require_user)])
async def list_customer_sales(
    customer_id: str,
    current_user: Dict[str, Any] = Depends(require_user),
):
    """Sales for a single customer — used by Customer360 tab."""
    db = get_db()
    cursor = db.sales.find({"customerId": customer_id}, {"_id": 0}).sort("created_at", -1)
    items = await cursor.to_list(length=500)
    return {"success": True, "items": items, "count": len(items)}


__all__ = ["router", "customers_router"]
