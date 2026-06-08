"""
wishlist_deals — "Top vehicles deals of the week" curated wishlist
====================================================================

Public block on the homepage that previously paginated the FULL
`/api/public/vehicles` catalog is replaced by a manager-curated
weekly wishlist, gated by a team-lead approval workflow.

Data model
----------
Collection: `wishlist_deals`

    {
      _id:           ObjectId,
      id:            UUID-string  (stable client id),
      vin:           UPPER-CASE string,
      category:      "motorbike" | "sedan" | "suv" | "pickup" | "van",
      budget:        "10-15K" | "15-25K" | "30-50K",
      week_start:    ISO date string  YYYY-MM-DD  (Monday of the week),
      status:        "pending" | "approved" | "rejected",
      created_by:    staff user id (manager),
      created_by_name: cached display name,
      created_at:    ISO datetime,
      approved_by:   staff user id (team_lead) or None,
      approved_by_name: cached display name,
      approved_at:   ISO datetime or None,
      reject_reason: optional string,
      note:          optional free-text note from manager,
      # Cached vehicle snapshot at creation time so the public block
      # works even if the source row in vin_data later changes:
      snapshot:      {
        title, make, model, year, current_bid, odometer, odometer_unit,
        image, detail_url, auction_name, sale_date, lot_number,
      }
    }

Indexes (created in `ensure_indexes`):
  * unique compound on (vin, week_start, category, budget) — prevents
    duplicate cards for the same week/category/budget combo.
  * status + week_start (public read path).
  * created_by (manager-own list).

Endpoints
---------
PUBLIC (no auth):
  GET  /api/public/wishlist-deals?category=&budget=&week=current|next|YYYY-MM-DD
       → list of APPROVED items for the given week, default = current week.
       Defaults: category=any, budget=any, week=current.

MANAGER (require_manager_or_admin):
  GET  /api/manager/wishlist-deals               — own + their team's items
                                                    filterable by status/week
  POST /api/manager/wishlist-deals               — create from VIN
  DEL  /api/manager/wishlist-deals/{id}          — manager can delete OWN
  GET  /api/manager/wishlist-deals/vin-search    — quick lookup against vin_data

TEAM LEAD / ADMIN (require_admin — team_lead is in ADMIN_ROLES):
  GET  /api/team-lead/wishlist-deals             — pending queue + all
  POST /api/team-lead/wishlist-deals/approve     — bulk: {ids: [...]}
  POST /api/team-lead/wishlist-deals/reject      — bulk: {ids: [...], reason?}
  POST /api/team-lead/wishlist-deals/{id}/approve — single
  POST /api/team-lead/wishlist-deals/{id}/reject  — single
"""
from __future__ import annotations

import logging
import uuid
from datetime import datetime, timedelta, timezone, date
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Body, Depends, HTTPException, Query

from security import require_admin, require_manager_or_admin

logger = logging.getLogger("bibi.wishlist_deals")

VALID_CATEGORIES = {"motorbike", "sedan", "suv", "pickup", "van"}
VALID_BUDGETS = {"10-15K", "15-25K", "30-50K"}
VALID_STATUSES = {"pending", "approved", "rejected"}


def _db():
    from app.core.db_runtime import get_db
    return get_db()


def _iso(dt: Optional[datetime]) -> Optional[str]:
    if not dt:
        return None
    if isinstance(dt, str):
        return dt
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.isoformat()


def _monday_of(d: date) -> date:
    """Return the Monday of the ISO week that contains `d`."""
    return d - timedelta(days=d.weekday())


def _resolve_week(value: Optional[str]) -> str:
    """Return YYYY-MM-DD for the Monday of the requested week.

    Accepts: 'current' (default), 'next', 'prev', or a raw 'YYYY-MM-DD'.
    """
    today = datetime.now(timezone.utc).date()
    cur_monday = _monday_of(today)
    v = (value or "current").strip().lower()
    if v in ("current", "this", "now", "this-week", ""):
        return cur_monday.isoformat()
    if v in ("next", "next-week"):
        return (cur_monday + timedelta(days=7)).isoformat()
    if v in ("prev", "previous", "last-week"):
        return (cur_monday - timedelta(days=7)).isoformat()
    # Try raw YYYY-MM-DD
    try:
        parsed = datetime.strptime(v, "%Y-%m-%d").date()
        return _monday_of(parsed).isoformat()
    except Exception:
        return cur_monday.isoformat()


def _strip(doc: Dict[str, Any]) -> Dict[str, Any]:
    """Drop Mongo `_id`, normalize datetimes for JSON."""
    if not doc:
        return doc
    out = {k: v for k, v in doc.items() if k != "_id"}
    for k in ("created_at", "approved_at"):
        if k in out:
            out[k] = _iso(out[k])
    return out


async def _snapshot_for_vin(vin: str) -> Dict[str, Any]:
    """Pull the latest snapshot for a VIN from `vin_data`. Manager creates
    the card from a VIN so we cache the relevant fields for stable rendering.
    """
    db = _db()
    v = (vin or "").upper().strip()
    if not v:
        return {}
    doc = await db.vin_data.find_one(
        {"vin": v},
        {
            "_id": 0, "title": 1, "make": 1, "model": 1, "year": 1,
            "current_bid": 1, "odometer": 1, "odometer_unit": 1,
            "images": 1, "detail_url": 1, "auction_name": 1,
            "sale_date": 1, "lot_number": 1, "make_canonical": 1,
            "model_canonical": 1,
        },
    ) or {}
    return {
        "title": doc.get("title"),
        "make": doc.get("make_canonical") or doc.get("make"),
        "model": doc.get("model_canonical") or doc.get("model"),
        "year": doc.get("year"),
        "current_bid": doc.get("current_bid"),
        "odometer": doc.get("odometer"),
        "odometer_unit": doc.get("odometer_unit"),
        "image": (doc.get("images") or [None])[0],
        "detail_url": doc.get("detail_url"),
        "auction_name": doc.get("auction_name"),
        "sale_date": doc.get("sale_date"),
        "lot_number": doc.get("lot_number"),
    }


async def ensure_indexes() -> None:
    """Idempotent index ensure — invoked from server startup."""
    db = _db()
    try:
        await db.wishlist_deals.create_index(
            [("vin", 1), ("week_start", 1), ("category", 1), ("budget", 1)],
            unique=True, name="wld_unique",
        )
        await db.wishlist_deals.create_index(
            [("status", 1), ("week_start", 1), ("category", 1), ("budget", 1)],
            name="wld_status_week_cat_bud",
        )
        await db.wishlist_deals.create_index([("created_by", 1)], name="wld_created_by")
        logger.info("[wishlist_deals] indexes ensured")
    except Exception as e:
        logger.warning(f"[wishlist_deals] ensure_indexes failed: {e}")


# ───────────────────────────────────────────────────────────── PUBLIC

public_router = APIRouter(prefix="/api/public", tags=["public-wishlist-deals"])


@public_router.get("/wishlist-deals")
async def public_list(
    category: Optional[str] = Query(None),
    budget: Optional[str] = Query(None),
    week: Optional[str] = Query("current"),
    limit: int = Query(60, ge=1, le=200),
):
    """Approved wishlist items for the requested week — homepage block."""
    db = _db()
    week_start = _resolve_week(week)
    q: Dict[str, Any] = {"status": "approved", "week_start": week_start}
    if category and category in VALID_CATEGORIES:
        q["category"] = category
    if budget and budget in VALID_BUDGETS:
        q["budget"] = budget
    try:
        cursor = db.wishlist_deals.find(q).sort("created_at", -1).limit(limit)
        items = [_strip(d) async for d in cursor]
        return {
            "success": True,
            "week_start": week_start,
            "count": len(items),
            "data": items,
        }
    except Exception as e:
        logger.warning(f"[wishlist_deals/public_list] {e}")
        return {"success": False, "week_start": week_start, "count": 0, "data": []}


# ─────────────────────────────────────────────────────────── MANAGER

manager_router = APIRouter(
    prefix="/api/manager/wishlist-deals",
    tags=["manager-wishlist-deals"],
    dependencies=[Depends(require_manager_or_admin)],
)


@manager_router.get("/vin-search")
async def manager_vin_search(
    q: str = Query("", description="VIN prefix or free-text (year/make/model)"),
    limit: int = Query(10, ge=1, le=25),
):
    """Quick lookup against `vin_data` so manager can autocomplete a VIN
    without leaving the wishlist form."""
    db = _db()
    needle = (q or "").strip()
    if not needle:
        return []
    # VIN-shaped (≥6 chars alnum) → prefix search on indexed `vin`
    norm = "".join(ch for ch in needle.upper() if ch.isalnum())
    or_clauses: List[Dict[str, Any]] = []
    if len(norm) >= 3:
        or_clauses.append({"vin": {"$regex": f"^{norm}", "$options": "i"}})
        or_clauses.append({"lot_number": {"$regex": f"^{norm}", "$options": "i"}})
    if len(needle) >= 2:
        or_clauses.append({"search_title": {"$regex": needle, "$options": "i"}})
        or_clauses.append({"title": {"$regex": needle, "$options": "i"}})
    if not or_clauses:
        return []
    try:
        cursor = db.vin_data.find(
            {"$or": or_clauses},
            {
                "_id": 0, "vin": 1, "title": 1, "make": 1, "model": 1, "year": 1,
                "current_bid": 1, "odometer": 1, "odometer_unit": 1, "images": 1,
                "make_canonical": 1, "model_canonical": 1, "lot_number": 1,
                "auction_name": 1, "sale_date": 1, "detail_url": 1,
            },
        ).limit(limit)
        out: List[Dict[str, Any]] = []
        async for d in cursor:
            out.append({
                "vin": d.get("vin"),
                "title": d.get("title"),
                "make": d.get("make_canonical") or d.get("make"),
                "model": d.get("model_canonical") or d.get("model"),
                "year": d.get("year"),
                "current_bid": d.get("current_bid"),
                "odometer": d.get("odometer"),
                "odometer_unit": d.get("odometer_unit"),
                "image": (d.get("images") or [None])[0],
                "lot_number": d.get("lot_number"),
                "auction_name": d.get("auction_name"),
                "sale_date": d.get("sale_date"),
                "detail_url": d.get("detail_url"),
            })
        return out
    except Exception as e:
        logger.warning(f"[wishlist_deals/vin_search] {e}")
        return []


@manager_router.get("")
async def manager_list(
    user: dict = Depends(require_manager_or_admin),
    status: Optional[str] = Query(None),
    week: Optional[str] = Query(None),
    mine_only: bool = Query(False),
    limit: int = Query(200, ge=1, le=500),
):
    """List wishlist items visible to a manager. By default ALL items
    (so the manager can see what their colleagues already submitted),
    optionally filtered by status / week / mine_only."""
    db = _db()
    q: Dict[str, Any] = {}
    if status and status in VALID_STATUSES:
        q["status"] = status
    if week:
        q["week_start"] = _resolve_week(week)
    if mine_only:
        q["created_by"] = user.get("id") or user.get("_id") or user.get("user_id")
    try:
        cursor = db.wishlist_deals.find(q).sort("created_at", -1).limit(limit)
        return {"data": [_strip(d) async for d in cursor]}
    except Exception as e:
        logger.warning(f"[wishlist_deals/manager_list] {e}")
        return {"data": []}


@manager_router.post("")
async def manager_create(
    payload: Dict[str, Any] = Body(...),
    user: dict = Depends(require_manager_or_admin),
):
    """Create a new wishlist card for the given (VIN, category, budget, week).
    Status starts as `pending` — must be approved by a team lead to appear
    on the public homepage block.
    """
    db = _db()
    vin = (payload.get("vin") or "").upper().strip()
    category = (payload.get("category") or "").strip()
    budget = (payload.get("budget") or "").strip()
    week_start = _resolve_week(payload.get("week"))
    note = (payload.get("note") or "").strip() or None

    if not vin:
        raise HTTPException(status_code=400, detail="vin is required")
    if category not in VALID_CATEGORIES:
        raise HTTPException(status_code=400, detail=f"category must be one of {sorted(VALID_CATEGORIES)}")
    if budget not in VALID_BUDGETS:
        raise HTTPException(status_code=400, detail=f"budget must be one of {sorted(VALID_BUDGETS)}")

    snapshot = await _snapshot_for_vin(vin)
    # Soft-warn but allow if VIN not in our DB — manager may want to push a
    # card while ingestion catches up.
    if not snapshot.get("title"):
        snapshot["title"] = f"VIN {vin}"

    now = datetime.now(timezone.utc)
    doc = {
        "id": str(uuid.uuid4()),
        "vin": vin,
        "category": category,
        "budget": budget,
        "week_start": week_start,
        "status": "pending",
        "created_by": user.get("id") or user.get("_id") or user.get("user_id"),
        "created_by_name": user.get("name") or user.get("email") or "manager",
        "created_at": now,
        "approved_by": None,
        "approved_by_name": None,
        "approved_at": None,
        "reject_reason": None,
        "note": note,
        "snapshot": snapshot,
    }
    try:
        await db.wishlist_deals.insert_one(doc)
    except Exception as e:
        # Likely the unique compound — surface a friendly conflict.
        msg = str(e)
        if "duplicate" in msg.lower() or "E11000" in msg:
            raise HTTPException(
                status_code=409,
                detail="A wishlist item already exists for this VIN + category + budget + week.",
            )
        logger.warning(f"[wishlist_deals/manager_create] insert failed: {e}")
        raise HTTPException(status_code=500, detail="Failed to create wishlist item")
    return _strip(doc)


@manager_router.delete("/{item_id}")
async def manager_delete(
    item_id: str,
    user: dict = Depends(require_manager_or_admin),
):
    """Manager can delete an item they created. Team-lead/admin can
    delete anything (their role is in ADMIN_ROLES)."""
    db = _db()
    role = (user.get("role") or "").lower()
    is_admin_like = role in {"admin", "owner", "master_admin", "team_lead"}
    q: Dict[str, Any] = {"id": item_id}
    if not is_admin_like:
        q["created_by"] = user.get("id") or user.get("_id") or user.get("user_id")
    res = await db.wishlist_deals.delete_one(q)
    if not res.deleted_count:
        raise HTTPException(status_code=404, detail="Item not found or not yours")
    return {"deleted": True, "id": item_id}


# ──────────────────────────────────────────────────────── TEAM LEAD

team_lead_router = APIRouter(
    prefix="/api/team-lead/wishlist-deals",
    tags=["team-lead-wishlist-deals"],
    dependencies=[Depends(require_admin)],  # team_lead is in ADMIN_ROLES
)


@team_lead_router.get("")
async def tl_list(
    status: Optional[str] = Query(None),
    week: Optional[str] = Query(None),
    limit: int = Query(200, ge=1, le=500),
):
    """Approval queue — defaults to `status=pending` if not specified."""
    db = _db()
    q: Dict[str, Any] = {}
    if status and status in VALID_STATUSES:
        q["status"] = status
    elif status is None:
        q["status"] = "pending"
    if week:
        q["week_start"] = _resolve_week(week)
    try:
        cursor = db.wishlist_deals.find(q).sort("created_at", -1).limit(limit)
        items = [_strip(d) async for d in cursor]
        # Provide quick counters for the UI.
        try:
            pending = await db.wishlist_deals.count_documents({"status": "pending"})
            approved = await db.wishlist_deals.count_documents({"status": "approved"})
            rejected = await db.wishlist_deals.count_documents({"status": "rejected"})
        except Exception:
            pending = approved = rejected = 0
        return {
            "data": items,
            "counts": {"pending": pending, "approved": approved, "rejected": rejected},
        }
    except Exception as e:
        logger.warning(f"[wishlist_deals/tl_list] {e}")
        return {"data": [], "counts": {"pending": 0, "approved": 0, "rejected": 0}}


async def _set_status(ids: List[str], status: str, user: dict, reason: Optional[str] = None) -> int:
    if status not in {"approved", "rejected"}:
        raise HTTPException(status_code=400, detail="invalid status")
    if not ids:
        return 0
    db = _db()
    now = datetime.now(timezone.utc)
    update: Dict[str, Any] = {
        "status": status,
        "approved_at": now,
        "approved_by": user.get("id") or user.get("_id") or user.get("user_id"),
        "approved_by_name": user.get("name") or user.get("email") or "team_lead",
    }
    if status == "rejected":
        update["reject_reason"] = (reason or "").strip() or None
    else:
        update["reject_reason"] = None
    try:
        res = await db.wishlist_deals.update_many({"id": {"$in": ids}}, {"$set": update})
        return int(res.modified_count or 0)
    except Exception as e:
        logger.warning(f"[wishlist_deals/set_status] {e}")
        return 0


@team_lead_router.post("/approve")
async def tl_bulk_approve(
    payload: Dict[str, Any] = Body(...),
    user: dict = Depends(require_admin),
):
    """Bulk approve. Body: { ids: [...] }. Pass `all=true` to approve every
    pending item (UI "select all + approve" shortcut)."""
    db = _db()
    ids = payload.get("ids") or []
    if payload.get("all"):
        cursor = db.wishlist_deals.find({"status": "pending"}, {"id": 1})
        ids = [d["id"] async for d in cursor if d.get("id")]
    if not isinstance(ids, list):
        raise HTTPException(status_code=400, detail="ids must be a list")
    n = await _set_status(ids, "approved", user)
    return {"approved": n, "ids": ids}


@team_lead_router.post("/reject")
async def tl_bulk_reject(
    payload: Dict[str, Any] = Body(...),
    user: dict = Depends(require_admin),
):
    db = _db()
    ids = payload.get("ids") or []
    reason = payload.get("reason")
    if payload.get("all"):
        cursor = db.wishlist_deals.find({"status": "pending"}, {"id": 1})
        ids = [d["id"] async for d in cursor if d.get("id")]
    if not isinstance(ids, list):
        raise HTTPException(status_code=400, detail="ids must be a list")
    n = await _set_status(ids, "rejected", user, reason=reason)
    return {"rejected": n, "ids": ids}


@team_lead_router.post("/{item_id}/approve")
async def tl_approve_one(
    item_id: str,
    user: dict = Depends(require_admin),
):
    n = await _set_status([item_id], "approved", user)
    if not n:
        raise HTTPException(status_code=404, detail="Item not found")
    return {"approved": n, "id": item_id}


@team_lead_router.post("/{item_id}/reject")
async def tl_reject_one(
    item_id: str,
    payload: Optional[Dict[str, Any]] = Body(default=None),
    user: dict = Depends(require_admin),
):
    reason = (payload or {}).get("reason")
    n = await _set_status([item_id], "rejected", user, reason=reason)
    if not n:
        raise HTTPException(status_code=404, detail="Item not found")
    return {"rejected": n, "id": item_id}
