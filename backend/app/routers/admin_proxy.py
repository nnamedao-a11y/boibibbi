"""
admin_proxy — /api/admin/proxy/* HTTP surface
=============================================

Wave 2B / Batch 3 / Commit 9 (sibling of admin_sources).

Mechanical 1:1 extraction from server.py.  Service-only domain — zero
Mongo writes, zero shared collections, single auth boundary (require_admin).
Zero-bridge router (no `import server`).

In line with Batch 1 (admin_kpi / admin_staff_sessions) discipline:
  * implementations preserved byte-for-byte
  * router-level require_admin dependency
  * no init(db) / app.state / lifespan changes

Future-Phase-3 owners can replace stubs with real proxy-manager wiring
once the proxy/network-control runtime is consolidated.
"""
from __future__ import annotations

from typing import Any, Dict

from fastapi import APIRouter, Body, Depends

from security import require_admin  # noqa: E402

router = APIRouter(
    prefix="/api/admin/proxy",
    tags=["admin-proxy"],
    dependencies=[Depends(require_admin)],
)


@router.get("/status")
async def proxy_status():
    return {
        "proxies": [],
        "activeCount": 0,
        "totalCount": 0,
    }


@router.post("/add")
async def proxy_add(data: Dict[str, Any] = Body(...)):
    return {"success": True, "id": "new-proxy"}


@router.post("/enable/{proxy_id}")
async def proxy_enable(proxy_id: str):
    return {"success": True}


@router.post("/disable/{proxy_id}")
async def proxy_disable(proxy_id: str):
    return {"success": True}


@router.post("/priority/{proxy_id}")
async def proxy_priority(proxy_id: str, data: Dict[str, Any] = Body(...)):
    return {"success": True}


@router.post("/test/{proxy_id}")
async def proxy_test(proxy_id: str):
    return {"success": True, "latency": 150, "status": "ok"}


@router.post("/reload")
async def proxy_reload():
    return {"success": True}
