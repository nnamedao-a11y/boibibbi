"""
admin_providers — /api/admin/providers HTTP surface
=====================================================

Wave 2B / Batch 11 / Commit 17 — read-only aggregators bundle (5/5).

Mechanical 1:1 extraction of the admin providers-stats surface
(2 endpoints).  The originals at server.py:14800-14840 are preserved
byte-for-byte (only `db = _db()` lazy line added inside the GET handler).

────────────────────────────────────────────────────────────────────────
Audit verdict — orchestrator over already-extracted `provider_stats`
service; NO direct Cluster #1 mutation, NO writer bridges
────────────────────────────────────────────────────────────────────────

  * GET  /api/admin/providers/stats             → `_ps.service.list_all()` +
                                                  enrichment via
                                                  `db.users.find` +
                                                  `db.staff.find`
                                                  (READ-ONLY for Cluster #1)
  * POST /api/admin/providers/stats/recompute   → `_ps.service.recompute()`
                                                  or `recompute_all()`

The POST endpoint LOOKS like a write, but the mutation it triggers is
encapsulated inside the **already-extracted Wave-1 `provider_stats.py`
module** (which owns its `provider_stats` Mongo collection internally).
The endpoint body itself does NOT call `db.<col>.update/insert/delete`
directly — it's a thin orchestrator over a service-owned mutation.

This is the FIRST batch to extract a POST endpoint whose mutation is
*delegated to an extracted service*.  Acceptable under Wave 2B discipline
because:
  1. The service (`provider_stats.py`) is already a single-owner module
     (Wave 1 extraction predecessor).
  2. No `db.*` mutation site lives in the endpoint body.
  3. No cross-domain writer bridge.
  4. Reads of `users` + `staff` collections are projection-only.

────────────────────────────────────────────────────────────────────────
Local helper `_ps_service_or_503` re-defined (NOT bridged)
────────────────────────────────────────────────────────────────────────

The original 7-line helper `_ps_service_or_503` at server.py:14762
guards against `provider_stats.service is None` (singleton not yet
initialised at startup).  It is re-defined here verbatim — NOT lazy-
imported — because:
  * 2 sibling public endpoints (`/api/providers/me/stats`,
    `/api/providers/{id}/stats` at server.py:14775, 14786) STILL use
    the helper from server.py; removing it would break them.
  * The helper has zero coupling to server.py state — it only imports
    `provider_stats` and checks `.service is None`.
  * Re-definition is cleaner than introducing a 1-purpose lazy bridge.

Same pattern as Batch 8 / `admin_chrome_extension` owning its own
utility (no bridge for trivial helpers that don't share state).

Auth: `require_admin` (router-level, uniform across both endpoints).
"""
from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException

from security import require_admin


def _db():
    """Lazy bridge to the live Mongo handle in server.py (Wave 1 pattern)."""
    from app.core.db_runtime import get_db  # noqa: E402 (C-4e: lazy-bridge → accessor)
    return get_db()


def _ps_service_or_503():
    """Return provider_stats singleton or raise 503.

    Re-defined verbatim from server.py:14762 — see module docstring for
    the rationale (sibling public endpoints still use the helper in
    server.py, and the helper has zero coupling to server.py state).
    """
    try:
        import provider_stats as _ps
        if _ps.service is None:
            raise HTTPException(503, "Provider stats engine not yet initialised")
        return _ps
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(503, f"Provider stats engine unavailable: {e}")


router = APIRouter(
    prefix="/api/admin/providers",
    tags=["admin-providers"],
    dependencies=[Depends(require_admin)],
)


@router.get("/stats")
async def provider_stats_admin_list(limit: int = 500):
    """Admin: all providers ranked by score (desc). Enriches with staff name/email
    so the dashboard can render a human-friendly table."""
    db = _db()
    _ps = _ps_service_or_503()
    docs = await _ps.service.list_all(sort_by_score=True)
    # Enrich with staff/user names (best-effort, no N+1 blocking)
    pids = [d.get("providerId") for d in docs if d.get("providerId")]
    users_map = {}
    staff_map = {}
    if pids:
        async for u in db.users.find({"id": {"$in": pids}}, {"_id": 0, "id": 1, "email": 1, "name": 1, "role": 1}):
            users_map[u["id"]] = u
        async for s in db.staff.find({"id": {"$in": pids}}, {"_id": 0, "id": 1, "email": 1, "name": 1, "role": 1}):
            staff_map[s["id"]] = s
    items = []
    for d in docs[:limit]:
        pid = d.get("providerId")
        u = users_map.get(pid) or staff_map.get(pid) or {}
        items.append({
            **d,
            "providerName":  u.get("name") or u.get("email") or pid,
            "providerEmail": u.get("email"),
            "providerRole":  u.get("role"),
        })
    return {"success": True, "items": items, "total": len(items)}


@router.post("/stats/recompute")
async def provider_stats_admin_recompute(provider_id: Optional[str] = None):
    """Admin: recompute one provider (if query param given) or all.

    Unified response shape:
        { "success": true, "count": N, "providers": [ids], "stats": { ... or null } }
    """
    _ps = _ps_service_or_503()
    if provider_id:
        doc = await _ps.service.recompute(provider_id)
        return {"success": True, "count": 1, "providers": [provider_id], "stats": doc}
    result = await _ps.service.recompute_all()
    return {"success": True, **result, "stats": None}
