"""
admin_resolver — /api/admin/resolver HTTP surface (read-only subset)
=====================================================================

Wave 2B / Batch 12 / Commit 18 — read-only shipments + resolver/queue (2/2).

Mechanical 1:1 extraction of the resolver "work queue" read endpoint.
Original at server.py:20652:
  * GET /api/admin/resolver/queue

────────────────────────────────────────────────────────────────────────
Audit verdict — PURE READ-ONLY (Phase 3 preview rule satisfied)
────────────────────────────────────────────────────────────────────────

Reads `db.shipments.find({trackingActive: True})` + in-memory filtering
through server.py helpers (ensure_shipment_stages, get_current_stage,
serialize_doc).  No mutation; no writer bridge.

Note: the original endpoint is called from `resolver_run_queue` (POST
resolver/run-queue) which IS a writer (Tier B, scheduled for Batch 14).
That consumer dependency means the `resolver_run_queue` handler will
need to lazy-import this router's `resolver_queue` function when it's
extracted in Batch 14.  Cross-router call is acceptable under Wave 2B
discipline (both routers live under `app/routers/`).

Residual edges (NOT in this router, stay in server.py):
  * `resolver/exceptions` (server.py:22550) and `resolver/identity/{id}`
    (server.py:22561) are TIER C aliases delegating to
    `admin_identity_*` handlers — strict Phase 3 blockers.
  * `resolver/run-queue` POST (server.py:20711) is TIER B — Batch 14.

Auth: `require_admin` (uniform).

Phase 5.4 / C-4a — ``logger`` bridge retired
────────────────────────────────────────────
This module now owns its own ``logger`` via standard
``logging.getLogger("bibi.admin_resolver")``. The previous
``_logger()`` lazy-bridge wrapper has been removed. Log
namespace "bibi.admin_resolver" inherits handlers + structured
formatter from the "bibi" root configured in server.py.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Dict, List

from fastapi import APIRouter, Depends

from security import require_admin


# Phase 5.4 / C-4a — module-local logger ownership.
logger = logging.getLogger("bibi.admin_resolver")


def _db():
    """Lazy bridge to the live Mongo handle in server.py."""
    from app.core.db_runtime import get_db  # noqa: E402 (C-4e: lazy-bridge → accessor)
    return get_db()


def _helpers():
    """Lazy bridge to the 3 pure helpers used by this handler.

    Phase 5.2 / C-1: `serialize_doc` migrated to
    `app.utils.serialization`.
    Phase 5.4 / C-5e: `get_current_stage` migrated to
    `app.utils.shipments` (Tier-B/C-adjacent shipment helper
    retirement). The verbatim canonical impl lives there; server.py
    keeps a thin compat shim for legacy callers.
    `ensure_shipment_stages` remains in server.py — Tier-C, requires
    business-logic refactor (out of C-5e scope).
    """
    from app.utils.serialization import serialize_doc  # Phase 5.2 / C-1
    from app.utils.shipments import get_current_stage  # Phase 5.4 / C-5e
    # Phase 5.5/I — canonical home is app/services/shipments.py
    from app.services.shipments import ensure_shipment_stages  # noqa: E402
    return ensure_shipment_stages, get_current_stage, serialize_doc


def _identity_runtime():
    """Direct accessor to the IdentityRuntimeService singleton.

    Phase 5.5/G — the legacy ``from server import identity_runtime``
    lazy bridge has been retired. The canonical home is
    ``app/services/identity_runtime.py``; the wrapper kept for
    backward-compatibility of the rest of this router's call sites.
    """
    from app.services.identity_runtime import identity_runtime  # noqa: E402
    return identity_runtime


def _ensure_shipment_stages_helper():
    """Lazy bridge to ``ensure_shipment_stages`` — canonical home is
    ``app/services/shipments.py`` after Phase 5.5/I shipments-
    orchestration cluster retirement (2026-05-20). The shim in
    ``server.ensure_shipment_stages`` still works (delegates 1:1), but
    we reach for the canonical name directly here per D2.
    """
    from app.services.shipments import ensure_shipment_stages  # noqa: E402
    return ensure_shipment_stages


router = APIRouter(
    prefix="/api/admin/resolver",
    tags=["admin-resolver"],
    dependencies=[Depends(require_admin)],
)


@router.get("/queue")
async def resolver_queue(limit: int = 50):
    """
    List shipments that need container/vessel resolution — shipments where
    tracking is active, active stage is vessel-type, but container or
    vessel identity is missing. This is the "work queue" for the auto
    resolver (either by worker or manual click).

    Each row includes the last resolver trace (if any) so the manager can
    see what was tried and why it failed.
    """
    db = _db()
    ensure_shipment_stages, get_current_stage, serialize_doc = _helpers()
    limit = max(1, min(int(limit), 200))
    cursor = db.shipments.find({"trackingActive": True})
    items: List[Dict[str, Any]] = []
    async for s in cursor:
        ensure_shipment_stages(s)
        cur = get_current_stage(s) or {}
        if cur.get("type") != "vessel":
            continue
        container = (cur.get("container") or {}).get("number") or (s.get("container") or {}).get("number") or s.get("containerNumber")
        vessel = cur.get("vessel") or s.get("vessel") or {}
        has_vessel_ident = bool(vessel.get("mmsi") or vessel.get("imo") or vessel.get("name"))
        if container and has_vessel_ident:
            continue
        trace = s.get("resolver") or {}
        items.append({
            "id":            s.get("id"),
            "vin":           s.get("vin"),
            "vehicleTitle":  s.get("vehicleTitle"),
            "customerId":    s.get("customerId"),
            "missing":       [k for k, v in [("container", container), ("vessel", has_vessel_ident)] if not v],
            "currentStage":  {"id": cur.get("id"), "label": cur.get("label")},
            "container":     container,
            "vessel":        {k: vessel.get(k) for k in ("name", "mmsi", "imo")},
            "resolver":      serialize_doc(trace) if trace else None,
            "containerConfidence": s.get("containerConfidence"),
            "vesselConfidence":    s.get("vesselConfidence"),
        })
        if len(items) >= limit:
            break
    # Summary counts
    buckets = {"missing_container": 0, "missing_vessel": 0, "missing_both": 0}
    for it in items:
        miss = it.get("missing") or []
        if "container" in miss and "vessel" in miss:
            buckets["missing_both"] += 1
        elif "container" in miss:
            buckets["missing_container"] += 1
        elif "vessel" in miss:
            buckets["missing_vessel"] += 1
    return {
        "ok":    True,
        "total": len(items),
        "items": items,
        "buckets": buckets,
        "computedAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
    }


# ─────────────────────────────────────────────────────────────
# Phase 3.3 / C-1 — Tier B writer extraction from server.py:20312
# Original: POST /api/admin/resolver/run-queue (lazy-imports resolver_queue)
# Behavioural-1:1: same per-item M-4/M-5 calls, same response shape.
# ─────────────────────────────────────────────────────────────
@router.post("/run-queue")
async def resolver_run_queue(limit: int = 10):
    """
    Batch-run the resolver over the current queue. Executes the resolver
    sequentially for up to ``limit`` shipments and returns an aggregated
    report. Useful for "Run all" button in Exceptions dashboard.
    """
    db = _db()
    runtime = _identity_runtime()
    ensure_shipment_stages = _ensure_shipment_stages_helper()
    # Phase 5.4 / C-4a — module-local logger now used directly
    limit = max(1, min(int(limit), 50))
    queue = await resolver_queue(limit=limit)
    results: List[Dict[str, Any]] = []
    resolved_count = 0
    for it in queue.get("items", []):
        sh = await db.shipments.find_one({"id": it["id"]})
        if not sh:
            continue
        ensure_shipment_stages(sh)
        try:
            rep = await runtime.run_auto_resolver(sh)
            diff = await runtime.persist_resolver_hits(sh, rep)
            if diff.get("containerChanged") or diff.get("vesselChanged"):
                resolved_count += 1
            results.append({
                "id": it["id"],
                "container": rep.get("container", {}).get("value"),
                "containerConfidence": rep.get("container", {}).get("confidence"),
                "vesselName": (rep.get("vessel", {}).get("value") or {}).get("name") if isinstance(rep.get("vessel", {}).get("value"), dict) else None,
                "diff": diff,
            })
        except Exception as e:
            logger.warning(f"[Resolver/queue] {it['id']} failed: {e}")
            results.append({"id": it["id"], "error": str(e)})
    return {"ok": True, "processed": len(results), "resolved": resolved_count, "results": results}
