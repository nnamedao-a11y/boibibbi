"""
BIBI Cars — Wave 13 — Delivery360 aggregations
================================================

Scope-aware aggregations on top of:
  * `shipments`         — one per deal (extended with `delivery` sub-object)
  * `carriers`          — new collection (Wave 13)
  * `delivery_documents`— new collection (Wave 13, scoped to a shipment)
  * `deals`             — for stage / customer / manager join

None of these functions mutate state; all writes happen in the router.
The pure scorer lives in `app/services/delivery_health.py`.
"""
from __future__ import annotations
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

from app.services.delivery_health import (
    compute_delivery_health,
    MILESTONE_ORDER,
    MILESTONE_LABEL,
)

# ---- scope helper ---------------------------------------------------------


async def _scope_filter(db, user: Dict[str, Any]) -> Tuple[Optional[Dict[str, Any]], Dict[str, Any]]:
    """Return (shipment_filter, scope_meta).

    A None filter means "company-wide" (admin/owner).
    """
    role = (user or {}).get("role")
    if role in ("master_admin", "admin", "owner"):
        return None, {"all": True, "managers": 0}

    # team_lead → own deals + team members'
    if role == "team_lead":
        own_id = user.get("id") or user.get("managerId") or user.get("sub")
        team_ids = await db.staff.find(
            {"team_lead_id": own_id}, {"id": 1, "_id": 0}
        ).to_list(length=500)
        ids = [own_id] + [t.get("id") for t in team_ids if t.get("id")]
        ids = [i for i in ids if i]
        return ({"$or": [{"managerId": {"$in": ids}}, {"manager_id": {"$in": ids}}]},
                {"all": False, "managers": len(ids)})

    # manager / default → own only
    mgr = user.get("id") or user.get("managerId") or user.get("sub")
    return ({"$or": [{"managerId": mgr}, {"manager_id": mgr}]},
            {"all": False, "managers": 1})


def _enrich_shipment_row(sh: Dict[str, Any], deal: Optional[Dict[str, Any]],
                        documents: List[Dict[str, Any]]) -> Dict[str, Any]:
    health = compute_delivery_health(sh, documents=documents, deal=deal)
    delivery = sh.get("delivery") or {}
    return {
        "shipment_id":  sh.get("id"),
        "deal_id":      sh.get("deal_id") or sh.get("dealId"),
        "deal_title":   (deal or {}).get("title")
                        or (deal or {}).get("vehicle_label")
                        or sh.get("vehicleLabel"),
        "customer_name":(deal or {}).get("customer_name"),
        "manager_id":   sh.get("managerId") or sh.get("manager_id")
                        or (deal or {}).get("managerId"),
        "manager_name": (deal or {}).get("manager_name"),
        "vin":          sh.get("vin") or (deal or {}).get("vin"),
        "stage":        (deal or {}).get("stage"),
        "carrier_id":   delivery.get("carrier_id"),
        "carrier_name": delivery.get("carrier_name"),
        "current_milestone":      health["metrics"]["current_milestone"],
        "current_milestone_label":
            MILESTONE_LABEL.get(health["metrics"]["current_milestone"], ""),
        "eta_expected":      health["metrics"]["eta_expected"],
        "eta_actual":        health["metrics"]["eta_actual"],
        "eta_variance_days": health["metrics"]["eta_variance_days"],
        "days_since_milestone": health["metrics"]["days_since_milestone"],
        "milestones_done":   health["metrics"]["milestones_done"],
        "milestones_total":  health["metrics"]["milestones_total"],
        "delivery_health":   health["segment"],
        "delivery_score":    health["score"],
        "reasons":           health["reasons"],
        "missing_documents": health["metrics"]["missing_documents"],
        "documents_count":   len(documents),
    }


async def _load_documents_for_shipments(db, shipment_ids: List[str]) -> Dict[str, List[Dict[str, Any]]]:
    if not shipment_ids:
        return {}
    rows = await db.delivery_documents.find(
        {"shipment_id": {"$in": shipment_ids}}, {"_id": 0}
    ).to_list(length=10_000)
    by_ship: Dict[str, List[Dict[str, Any]]] = {sid: [] for sid in shipment_ids}
    for d in rows:
        sid = d.get("shipment_id")
        if sid in by_ship:
            by_ship[sid].append(d)
    return by_ship


async def _load_deals_for_shipments(db, deal_ids: List[str]) -> Dict[str, Dict[str, Any]]:
    if not deal_ids:
        return {}
    rows = await db.deals.find({"id": {"$in": deal_ids}}, {"_id": 0}).to_list(length=10_000)
    return {d.get("id"): d for d in rows if d.get("id")}


# ============================================================================
# 1. OVERVIEW — fleet-wide KPIs
# ============================================================================
async def compute_delivery_overview(db, user: Dict[str, Any]) -> Dict[str, Any]:
    scope_filter, scope_meta = await _scope_filter(db, user)
    sh_query = scope_filter or {}
    shipments = await db.shipments.find(sh_query, {"_id": 0}).to_list(length=5000)

    deal_ids = [s.get("deal_id") or s.get("dealId") for s in shipments]
    deal_ids = [d for d in deal_ids if d]
    deals = await _load_deals_for_shipments(db, deal_ids)

    ship_ids = [s.get("id") for s in shipments if s.get("id")]
    docs_by_ship = await _load_documents_for_shipments(db, ship_ids)

    rows = [_enrich_shipment_row(s, deals.get(s.get("deal_id") or s.get("dealId") or ""),
                                 docs_by_ship.get(s.get("id"), []))
            for s in shipments]

    # ---- aggregate ---------------------------------------------------------
    by_segment = {"on_track": 0, "delay_risk": 0, "delayed": 0, "critical": 0,
                  "delivered": 0, "cancelled": 0}
    by_milestone: Dict[str, int] = {k: 0 for k in MILESTONE_ORDER}
    delayed_count = 0
    delivered_count = 0
    in_transit_count = 0
    variance_samples: List[int] = []

    for r in rows:
        seg = r["delivery_health"]
        by_segment[seg] = by_segment.get(seg, 0) + 1
        m = r["current_milestone"]
        if m in by_milestone:
            by_milestone[m] += 1
        if seg in ("delay_risk", "delayed", "critical"):
            delayed_count += 1
        if seg == "delivered":
            delivered_count += 1
        if m and m not in ("delivered", "") and seg != "cancelled":
            in_transit_count += 1
        v = r["eta_variance_days"]
        if isinstance(v, int) and v >= 0:
            variance_samples.append(v)

    avg_variance = round(sum(variance_samples) / len(variance_samples), 1) if variance_samples else 0.0

    return {
        "counts": {
            "shipments_total":    len(rows),
            "in_transit":         in_transit_count,
            "delivered":          delivered_count,
            "delayed_or_worse":   delayed_count,
        },
        "by_segment":   by_segment,
        "by_milestone": by_milestone,
        "avg_eta_variance_days": avg_variance,
        "scope":        scope_meta,
    }


# ============================================================================
# 2. SHIPMENTS QUEUE — paginated, sortable
# ============================================================================
async def list_shipments(
    db,
    user: Dict[str, Any],
    *,
    limit: int = 200,
    segment: Optional[str] = None,
    milestone: Optional[str] = None,
    only_at_risk: bool = False,
) -> List[Dict[str, Any]]:
    scope_filter, _ = await _scope_filter(db, user)
    sh_query = scope_filter or {}
    shipments = await db.shipments.find(sh_query, {"_id": 0}).to_list(length=limit * 4)

    deal_ids = [s.get("deal_id") or s.get("dealId") for s in shipments if s.get("deal_id") or s.get("dealId")]
    deals = await _load_deals_for_shipments(db, deal_ids)

    ship_ids = [s.get("id") for s in shipments if s.get("id")]
    docs_by_ship = await _load_documents_for_shipments(db, ship_ids)

    rows: List[Dict[str, Any]] = []
    for s in shipments:
        r = _enrich_shipment_row(s, deals.get(s.get("deal_id") or s.get("dealId") or ""),
                                 docs_by_ship.get(s.get("id"), []))
        if segment and r["delivery_health"] != segment:
            continue
        if milestone and r["current_milestone"] != milestone:
            continue
        if only_at_risk and r["delivery_health"] not in ("delay_risk", "delayed", "critical"):
            continue
        rows.append(r)

    # Worst first, then largest variance
    seg_rank = {"critical": 0, "delayed": 1, "delay_risk": 2, "on_track": 3,
                "delivered": 4, "cancelled": 5}
    rows.sort(key=lambda r: (seg_rank.get(r["delivery_health"], 9),
                              -(r["eta_variance_days"] or 0)))
    return rows[:limit]


# ============================================================================
# 3. CARRIER CENTER — perf table
# ============================================================================
async def compute_carriers(db, user: Dict[str, Any]) -> List[Dict[str, Any]]:
    scope_filter, _ = await _scope_filter(db, user)
    sh_query = scope_filter or {}
    shipments = await db.shipments.find(sh_query, {"_id": 0}).to_list(length=5000)

    deal_ids = [s.get("deal_id") or s.get("dealId") for s in shipments]
    deals = await _load_deals_for_shipments(db, [d for d in deal_ids if d])

    ship_ids = [s.get("id") for s in shipments if s.get("id")]
    docs_by_ship = await _load_documents_for_shipments(db, ship_ids)

    rows = [_enrich_shipment_row(s, deals.get(s.get("deal_id") or s.get("dealId") or ""),
                                 docs_by_ship.get(s.get("id"), []))
            for s in shipments]

    # Bucket by carrier
    buckets: Dict[str, Dict[str, Any]] = {}
    for r in rows:
        cid = r["carrier_id"] or "__unassigned__"
        b = buckets.setdefault(cid, {
            "carrier_id":      r["carrier_id"],
            "carrier_name":    r["carrier_name"] or "Unassigned",
            "loads":           0,
            "delivered":       0,
            "on_time":         0,
            "delayed":         0,
            "eta_variances":   [],
        })
        b["loads"] += 1
        if r["delivery_health"] == "delivered":
            b["delivered"] += 1
            if (r["eta_variance_days"] or 0) <= 0:
                b["on_time"] += 1
        if r["delivery_health"] in ("delayed", "critical"):
            b["delayed"] += 1
        v = r["eta_variance_days"]
        if isinstance(v, int):
            b["eta_variances"].append(v)

    # Also include carriers that exist but have zero loads in scope
    for c in await db.carriers.find({}, {"_id": 0}).to_list(length=500):
        cid = c.get("id")
        if cid and cid not in buckets:
            buckets[cid] = {
                "carrier_id":   cid,
                "carrier_name": c.get("name") or cid,
                "loads":        0,
                "delivered":    0,
                "on_time":      0,
                "delayed":      0,
                "eta_variances":[],
            }

    out: List[Dict[str, Any]] = []
    for b in buckets.values():
        variances = b.pop("eta_variances")
        avg = round(sum(variances) / len(variances), 1) if variances else None
        denom = b["delivered"] or b["loads"]
        on_time_rate = round(b["on_time"] / denom * 100, 1) if denom else None
        # Simple 0–5 rating: 5 = perfect on-time, drop for delays / variance
        rating = 5.0
        if on_time_rate is not None:
            rating -= (100 - on_time_rate) * 0.04
        if avg is not None and avg > 0:
            rating -= min(avg * 0.1, 2.0)
        if b["delayed"]:
            rating -= min(b["delayed"] * 0.3, 2.0)
        rating = round(max(0.0, min(5.0, rating)), 1)
        out.append({
            **b,
            "avg_eta_variance_days": avg,
            "on_time_rate":          on_time_rate,
            "rating":                rating,
        })

    # Worst first (most delayed, lowest rating)
    out.sort(key=lambda x: (-(x["delayed"] or 0), -(x["loads"] or 0)))
    return out


# ============================================================================
# 4. DELIVERY360 BUNDLE — one shipment
# ============================================================================
async def build_delivery_bundle(db, shipment_id: str, *, user: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    sh = await db.shipments.find_one({"id": shipment_id}, {"_id": 0})
    if not sh:
        # Look up by deal_id instead
        sh = await db.shipments.find_one(
            {"$or": [{"dealId": shipment_id}, {"deal_id": shipment_id}]},
            {"_id": 0},
        )
        if not sh:
            return None

    deal = None
    deal_id = sh.get("deal_id") or sh.get("dealId")
    if deal_id:
        deal = await db.deals.find_one({"id": deal_id}, {"_id": 0})

    documents = await db.delivery_documents.find(
        {"shipment_id": sh.get("id")}, {"_id": 0}
    ).sort("uploaded_at", -1).to_list(length=200)

    carrier = None
    cid = (sh.get("delivery") or {}).get("carrier_id")
    if cid:
        carrier = await db.carriers.find_one({"id": cid}, {"_id": 0})

    health = compute_delivery_health(sh, documents=documents, deal=deal)
    delivery = sh.get("delivery") or {}
    milestones_log = delivery.get("milestones") or []
    done = {m.get("key"): m for m in milestones_log if m.get("key")}

    # Build canonical timeline (all 9 stages, with status + when)
    current = health["metrics"]["current_milestone"]
    found_current = False
    timeline = []
    for key in MILESTONE_ORDER:
        if key in done:
            status = "done"
        elif key == current:
            status = "current"
            found_current = True
        elif found_current:
            status = "pending"
        else:
            status = "pending"
        timeline.append({
            "key":   key,
            "label": MILESTONE_LABEL.get(key, key),
            "status": status,
            "at":     done.get(key, {}).get("at"),
            "by":     done.get(key, {}).get("by"),
            "note":   done.get(key, {}).get("note"),
        })

    return {
        "shipment":   sh,
        "deal":       deal,
        "carrier":    carrier,
        "delivery_health":  health,
        "timeline":   timeline,
        "documents":  documents,
    }


__all__ = [
    "compute_delivery_overview",
    "list_shipments",
    "compute_carriers",
    "build_delivery_bundle",
]
