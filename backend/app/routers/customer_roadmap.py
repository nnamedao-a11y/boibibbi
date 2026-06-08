"""
Customer Roadmap router — Sprint 3.5
=====================================

REST surface for the client-facing journey tracker.

Endpoints
---------
Public (cabinet, no auth — keyed by customer id):
    GET    /api/customer-cabinet/{customer_id}/roadmaps        — read-only list
    GET    /api/customer-cabinet/{customer_id}/roadmaps/{rid}  — read-only detail

Authenticated CRM (manager / team_lead / master_admin):
    GET    /api/customers/{customer_id}/roadmaps               — list for one customer
    POST   /api/customers/{customer_id}/roadmaps               — create
    GET    /api/roadmaps/{roadmap_id}                          — detail
    PATCH  /api/roadmaps/{roadmap_id}/stages/{stage_key}       — update stage
    DELETE /api/roadmaps/{roadmap_id}                          — soft delete (admin only)

Analytics (team lead + master admin):
    GET    /api/team/roadmaps                                  — my team analytics
    GET    /api/admin/roadmaps                                 — full company analytics
    GET    /api/admin/roadmaps/stages                          — stage template metadata
"""
from __future__ import annotations

from typing import Any, Dict, Optional

from fastapi import APIRouter, Body, Depends, HTTPException

from app.core.db_runtime import get_db
from app.services import customer_roadmap as svc
from security import (
    require_admin,
    require_manager_or_admin,
)

router = APIRouter(tags=["customer-roadmap"])


# ---------------------------------------------------------------------
# Public cabinet endpoints (read-only)
# ---------------------------------------------------------------------


@router.get("/api/customer-cabinet/{customer_id}/roadmaps")
async def cabinet_list_roadmaps(customer_id: str):
    """Client-facing list of roadmaps — strictly read-only."""
    items = await svc.list_customer_roadmaps(customer_id)
    return {"success": True, "items": items, "stage_template": svc.DEFAULT_STAGES}


@router.get("/api/customer-cabinet/{customer_id}/roadmaps/{roadmap_id}")
async def cabinet_get_roadmap(customer_id: str, roadmap_id: str):
    doc = await svc.get_roadmap(roadmap_id)
    if not doc:
        raise HTTPException(404, "Roadmap not found")
    if (doc.get("customerId") or doc.get("customer_id")) != customer_id:
        raise HTTPException(403, "This roadmap belongs to another customer")
    return {"success": True, "roadmap": doc, "stage_template": svc.DEFAULT_STAGES}


# ---------------------------------------------------------------------
# Manager / team_lead / admin CRUD
# ---------------------------------------------------------------------


@router.get("/api/customers/{customer_id}/roadmaps",
            dependencies=[Depends(require_manager_or_admin)])
async def list_customer_roadmaps(customer_id: str):
    db = get_db()
    customer = await db.customers.find_one({"id": customer_id}, {"_id": 0})
    if not customer:
        raise HTTPException(404, "Customer not found")
    items = await svc.list_customer_roadmaps(customer_id)
    return {
        "success": True,
        "customer": {
            "id": customer.get("id"),
            "firstName": customer.get("firstName"),
            "lastName": customer.get("lastName"),
            "email": customer.get("email"),
        },
        "items": items,
        "stage_template": svc.DEFAULT_STAGES,
    }


@router.post("/api/customers/{customer_id}/roadmaps",
             dependencies=[Depends(require_manager_or_admin)])
async def create_customer_roadmap(
    customer_id: str,
    data: Dict[str, Any] = Body(default_factory=dict),
    user: dict = Depends(require_manager_or_admin),
):
    db = get_db()
    customer = await db.customers.find_one({"id": customer_id}, {"_id": 0})
    if not customer:
        raise HTTPException(404, "Customer not found")

    initial_stage = (data.get("initial_stage") or "vehicle_found").lower()
    if initial_stage not in {s["key"] for s in svc.DEFAULT_STAGES}:
        raise HTTPException(400, f"Unknown initial_stage '{initial_stage}'")

    doc = await svc.create_roadmap(
        customer_id=customer_id,
        title=data.get("title"),
        vehicle=data.get("vehicle") or {},
        deal_id=data.get("deal_id") or data.get("dealId"),
        invoice_id=data.get("invoice_id") or data.get("invoiceId"),
        order_id=data.get("order_id") or data.get("orderId"),
        manager_id=(user.get("id") if (user.get("role") or "").lower() == "manager"
                    else (data.get("manager_id") or data.get("managerId") or customer.get("managerId"))),
        manager_email=user.get("email"),
        initial_stage=initial_stage,
        created_by=user.get("id"),
        created_by_email=user.get("email"),
    )
    return {"success": True, "roadmap": doc}


@router.get("/api/roadmaps/{roadmap_id}",
            dependencies=[Depends(require_manager_or_admin)])
async def get_single_roadmap(roadmap_id: str, user: dict = Depends(require_manager_or_admin)):
    doc = await svc.get_roadmap(roadmap_id)
    if not doc:
        raise HTTPException(404, "Roadmap not found")
    role = (user.get("role") or "").lower()
    if role == "manager" and doc.get("managerId") and doc.get("managerId") != user.get("id"):
        raise HTTPException(403, "Forbidden")
    return {"success": True, "roadmap": doc, "stage_template": svc.DEFAULT_STAGES}


@router.patch("/api/roadmaps/{roadmap_id}/stages/{stage_key}",
              dependencies=[Depends(require_manager_or_admin)])
async def patch_stage(
    roadmap_id: str,
    stage_key: str,
    data: Dict[str, Any] = Body(default_factory=dict),
    user: dict = Depends(require_manager_or_admin),
):
    doc = await svc.get_roadmap(roadmap_id)
    if not doc:
        raise HTTPException(404, "Roadmap not found")
    role = (user.get("role") or "").lower()
    if role == "manager" and doc.get("managerId") and doc.get("managerId") != user.get("id"):
        raise HTTPException(403, "Forbidden — not your customer")

    try:
        fresh = await svc.update_stage(
            roadmap_id,
            stage_key,
            status=data.get("status"),
            eta=data.get("eta"),
            sla_days=data.get("sla_days"),
            note_body=(data.get("note") or data.get("note_body") or "").strip() or None,
            updated_by=user.get("id"),
            updated_by_email=user.get("email"),
        )
    except ValueError as e:
        raise HTTPException(400, str(e))
    if not fresh:
        raise HTTPException(404, "Roadmap or stage not found")

    # Emit a socket event so the customer cabinet can refresh live
    try:
        from app.core.socket_runtime import get_sio
        sio = get_sio()
        if sio is not None:
            await sio.emit("roadmap:updated", {
                "roadmapId": roadmap_id,
                "customerId": fresh.get("customerId") or fresh.get("customer_id"),
                "stage": stage_key,
                "status": fresh.get("status"),
                "progress_pct": fresh.get("progress_pct"),
                "current_stage": fresh.get("current_stage"),
            })
    except Exception:
        pass

    return {"success": True, "roadmap": fresh}


@router.delete("/api/roadmaps/{roadmap_id}",
               dependencies=[Depends(require_admin)])
async def delete_road(roadmap_id: str):
    ok = await svc.delete_roadmap(roadmap_id)
    if not ok:
        raise HTTPException(404, "Roadmap not found")
    return {"success": True}


# ---------------------------------------------------------------------
# Analytics
# ---------------------------------------------------------------------


@router.get("/api/team/roadmaps",
            dependencies=[Depends(require_manager_or_admin)])
async def team_roadmaps(user: dict = Depends(require_manager_or_admin)):
    """Team Lead view: aggregates across the user's team.

    For a team lead we pull all manager ids under them.
    Master admin / owner / admin sees everything.
    """
    role = (user.get("role") or "").lower()
    db = get_db()

    if role in {"master_admin", "owner", "admin"}:
        summary = await svc.analytics_summary()
    elif role == "team_lead":
        team_ids = []
        async for u in db.users.find({"team_lead_id": user.get("id")}, {"id": 1, "_id": 0}):
            if u.get("id"):
                team_ids.append(u["id"])
        team_ids.append(user.get("id"))  # include self if doubles as manager
        summary = await svc.analytics_summary(team_manager_ids=team_ids)
    else:
        # plain manager — only their own roadmaps
        summary = await svc.analytics_summary(manager_id=user.get("id"))

    return {"success": True, **summary, "stage_template": svc.DEFAULT_STAGES}


@router.get("/api/admin/roadmaps", dependencies=[Depends(require_admin)])
async def admin_roadmaps():
    summary = await svc.analytics_summary()
    return {"success": True, **summary, "stage_template": svc.DEFAULT_STAGES}


@router.get("/api/admin/roadmaps/stages", dependencies=[Depends(require_admin)])
async def admin_stage_template():
    return {"success": True, "stages": svc.DEFAULT_STAGES}
