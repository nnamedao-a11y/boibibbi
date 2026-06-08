"""
admin_vesselfinder — /api/admin/vesselfinder/* HTTP surface
============================================================

Wave 2B / Batch 4A / Commit 10 (solo — admin_tracking deliberately
deferred to Phase 3 due to runtime-mutable-global ownership coupling).

Mechanical 1:1 extraction from server.py.  Owns `vf_payload_meta`
Mongo collection and the on-disk `chrome_extension_vf/` source tree.

Why this router is safe in Wave 2B:
  * own collection (`vf_payload_meta`) — bounded ownership
  * own assets (`chrome_extension_vf/` directory) — co-located on disk
  * NO module-level mutable state
  * NO scraper / worker / polling / cron dependency
  * NO startup hydration ownership

Why admin_tracking is NOT here:
  * tracking control plane mutates 5 module-level globals
    (VESSELFINDER_API_KEY, VESSELFINDER_FLEET_KEY, SHIPSGO_API_KEY,
     SHIPSGO_FLEET_KEY, AFTERSHIP_API_KEY) shared with scraper helpers
    inside server.py.  Extracting would require `setattr(server, ...)`
    mutation — a forbidden new pattern at this phase.
  * tracking belongs to Phase 3 (operational-core disentangling).

Bridges accepted (Wave 1 pattern):
  * `def _db()` → lazy `from server import db`
  * `from server import serialize_doc` → shared utility (used in 57
    places across the codebase, not vesselfinder-owned)
  * `PAYLOAD_DEBUG_STORE` → direct import from `security` (not a bridge,
    it's a config flag exported by the security module)
"""
from __future__ import annotations

import io
import os
import zipfile
from pathlib import Path
from typing import Any, Dict

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import Response

from security import PAYLOAD_DEBUG_STORE, require_admin  # noqa: E402

# Phase 5.4 / C-4i — db_runtime accessor (module-level function reference).
# Only the `get_db` CALLABLE is imported at module-load time. Every
# `_db()` call resolves the live Motor handle via `get_db()`, preserving
# the call-time semantics of the legacy `from server import db` bridge.
from app.core.db_runtime import get_db  # noqa: E402 (C-4i: lazy-bridge → accessor)

router = APIRouter(
    prefix="/api/admin/vesselfinder",
    tags=["admin-vesselfinder"],
    dependencies=[Depends(require_admin)],
)

# Resolve the on-disk extension source folder once at import time.
# `__file__` here = backend/app/routers/admin_vesselfinder.py
# We need to climb two levels back to reach backend/.
_BACKEND_DIR = Path(__file__).resolve().parents[2]
_VF_EXT_DIR = _BACKEND_DIR / "chrome_extension_vf"


def _db():
    """Return the live Mongo handle — resolves at call-time.

    Phase 5.4 / C-4i — migrated to ``app.core.db_runtime.get_db()`` from
    the legacy ``from server import db as _server_db`` bridge. Owns
    ``vf_payload_meta`` collection (Chrome extension payload diagnostics).
    Lazy semantics preserved 1:1.
    """
    return get_db()


def _serialize_doc(doc):
    """Lazy bridge to the shared `serialize_doc` helper.

    Phase 5.2 / C-1: relocated to `app/utils/serialization.py`.
    This wrapper is kept for now to preserve the existing call
    contract inside this router; a follow-up cleanup will switch
    callers to `from app.utils.serialization import serialize_doc`
    directly (it does not need lazy resolution any more).
    """
    from app.utils.serialization import serialize_doc as _server_serialize
    return _server_serialize(doc)


@router.get("/extension/download")
async def vf_extension_download(request: Request):
    """
    Download the VesselFinder Chrome extension as a ZIP.

    Starting from v3.0.0 the CRM backend URL is NOT hardcoded at download time.
    The manager types / pastes it in the popup, the value is stored in
    chrome.storage.local.backendUrl, and the service worker reads it on
    every tick. The download endpoint just packs the source folder as-is.
    """
    if not _VF_EXT_DIR.is_dir():
        raise HTTPException(status_code=404, detail="Extension source missing")
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for root, _dirs, files in os.walk(str(_VF_EXT_DIR)):
            for f in files:
                full = os.path.join(root, f)
                rel = os.path.relpath(full, str(_VF_EXT_DIR))
                # Skip caches / editor junk
                if any(part.startswith('.') or part == '__pycache__' for part in rel.split(os.sep)):
                    continue
                with open(full, "rb") as fh:
                    content = fh.read()
                # Use posix separators in zip entries
                zf.writestr(rel.replace(os.sep, "/"), content)
    buf.seek(0)
    return Response(
        content=buf.read(),
        media_type="application/zip",
        headers={
            "Content-Disposition": 'attachment; filename="bibi-vesselfinder-extension.zip"',
            "X-Extension-Version": "3.0.0",
        },
    )


@router.get("/debug/payloads")
async def vf_debug_payloads(limit: int = 20):
    """
    Last N captured payload metadata (from extension). Full raw snippets are
    only available if PAYLOAD_DEBUG_STORE=1 (prod default: off).
    """
    db = _db()
    limit = max(1, min(limit, 50))
    items = []
    cursor = db.vf_payload_meta.find({}).sort("storedAt", -1).limit(limit)
    async for d in cursor:
        d.pop("_id", None)
        items.append(_serialize_doc(d))
    return {"ok": True, "count": len(items), "payloads": items, "rawAvailable": bool(PAYLOAD_DEBUG_STORE)}


@router.get("/debug/endpoint-probe")
async def vf_debug_endpoint_probe():
    """
    Quick summary over the last 50 payload meta records: which extension
    endpoint (mp2, sfl, refresh, mapapi-mp, api-pub-map, api-pub-vessels, …)
    returned useful data vs 404/error.
    """
    db = _db()
    cursor = db.vf_payload_meta.find({}).sort("storedAt", -1).limit(50)
    summary: Dict[str, Dict[str, Any]] = {}
    async for d in cursor:
        src = d.get("source") or "unknown"
        st = d.get("status_code") or 0
        ct = d.get("contentTypeHint") or "?"
        row = summary.setdefault(src, {"attempts": 0, "http_counts": {}, "content_types": {}, "any_json": False, "any_vessels": 0})
        row["attempts"] += 1
        row["http_counts"][str(st)] = row["http_counts"].get(str(st), 0) + 1
        row["content_types"][ct] = row["content_types"].get(ct, 0) + 1
        if ct == "json":
            row["any_json"] = True
        row["any_vessels"] = max(row["any_vessels"], d.get("vesselsInPayload", 0) or 0)
    # rank candidates by usefulness
    ranked = sorted(
        summary.items(),
        key=lambda kv: (-int(kv[1]["any_json"]), -kv[1]["any_vessels"], -kv[1]["attempts"]),
    )
    return {
        "ok": True,
        "candidates": [{"source": k, **v} for k, v in ranked],
        "recommendation": ranked[0][0] if ranked and ranked[0][1]["any_json"] else None,
    }
