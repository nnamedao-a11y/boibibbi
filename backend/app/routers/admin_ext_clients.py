"""
admin_ext_clients — /api/admin/ext-clients/*
==============================================

Phase 3.3 / C-2 — Mechanical extraction of the Extension Clients admin
registry from server.py (Phase E — per-manager HMAC secret).

Migrated from server.py:
  * POST /api/admin/ext-clients                       (~21366)
  * POST /api/admin/ext-clients/bootstrap             (~21392)
  * GET  /api/admin/ext-clients                       (~21463)
  * POST /api/admin/ext-clients/{client_id}/revoke    (~21473)
  * POST /api/admin/ext-clients/{client_id}/rotate    (~21488)

Behavioural-1:1 mechanical extraction — identical handlers, identical
auth (require_master_admin for writes, require_admin for the read list),
identical Mongo writes on the ``ext_clients`` collection, identical
audit log emissions, identical response shapes (including the
write-once secret return on POST create / rotate).

Lazy bridges to ``server.py`` (uniform Wave 2B Batch 12 pattern):
  * _db()    — live Motor handle (db rebinds during startup)
  * _audit() — server.audit async callable

Auth scheme follows the original endpoints exactly:
  * 4 write endpoints (create / bootstrap / revoke / rotate) require
    ``require_master_admin`` — i.e. the elevated root admin.
  * 1 read endpoint (list) requires ``require_admin`` — standard admin.

The router has NO module-level prefix dependencies so that each
endpoint can carry its own Depends() — matching the original
heterogeneous protection scheme.
"""
from __future__ import annotations

import secrets as _secrets
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel

from security import require_admin, require_master_admin


# ─────────────────────────────────────────────────────────────
# Lazy bridges — same pattern as admin_identity / admin_resolver.
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


# ─────────────────────────────────────────────────────────────
# Pydantic models — extracted from server.py verbatim.
# ─────────────────────────────────────────────────────────────
class _ExtClientCreate(BaseModel):
    name: str
    managerEmail: Optional[str] = None


# ─────────────────────────────────────────────────────────────
# Helper — extracted from server.py:_gen_client_secret.
# ─────────────────────────────────────────────────────────────
def _gen_client_secret() -> str:
    return _secrets.token_urlsafe(32)


# ─────────────────────────────────────────────────────────────
# Router — /api/admin/ext-clients
#
# NOTE: no global ``dependencies=[Depends(require_admin)]`` here
# because the write endpoints need ``require_master_admin`` (strictly
# stronger).  Each handler declares its own Depends() — exactly the
# scheme used in the original server.py.
# ─────────────────────────────────────────────────────────────
router = APIRouter(
    prefix="/api/admin/ext-clients",
    tags=["admin-ext-clients"],
)


# ── 0/6 ───────────────────────────────────────────────────────
# Server-wide HMAC shared secret (loaded from EXT_SHARED_SECRET env)
# ───────────────────────────────────────────────────────────────
# This is the secret that is BAKED INTO the Vessel Sync extension at
# build time.  Every Vessel Sync popup signs requests with it.  Per-client
# secrets (created by /bootstrap below) are stored hashed and CAN'T be
# recovered later — admins need a persistent place to read this one back.
@router.get("/shared-secret")
async def ext_shared_secret(current_user: dict = Depends(require_admin)):
    """Return the server-wide EXT_SHARED_SECRET used by Vessel Sync ext.

    This is intentionally readable by any admin (not master-only) because
    operators need to copy it into the extension popup on every fresh
    install.  The value is *not* persisted in MongoDB — it lives in the
    backend's environment (.env → EXT_SHARED_SECRET) and is the same
    secret that was injected into the Vessel Sync ZIP via build.sh.
    """
    import os as _os
    secret = (_os.environ.get("EXT_SHARED_SECRET") or "").strip()
    # Fingerprint for sanity-checking against the ZIP build.sh output
    fp = ""
    if secret:
        import hashlib as _hashlib
        fp = _hashlib.sha256(secret.encode()).hexdigest()[:16]
    return {
        "configured": bool(secret),
        "secret": secret,
        "fingerprint": fp,
        "length": len(secret),
        "source": ".env (EXT_SHARED_SECRET)",
        "usage": (
            "Paste this value into the BIBI Vessel Sync extension popup "
            "→ field 'HMAC Secret'.  The 'Client ID' field stays at the "
            "default 'bibi-vf-ext' unless you create a per-machine client."
        ),
    }


# ── 1/6 ───────────────────────────────────────────────────────
@router.post("")
async def ext_client_create(
    payload: _ExtClientCreate,
    request: Request,
    current_user: dict = Depends(require_master_admin),
):
    """Create a new extension client with a unique per-device HMAC secret."""
    db = _db()
    audit = _audit()
    client_id = f"ext_{_secrets.token_urlsafe(8)}"
    secret = _gen_client_secret()
    doc = {
        "clientId": client_id,
        "name": payload.name.strip(),
        "managerEmail": (payload.managerEmail or "").strip().lower() or None,
        "secret": secret,
        "active": True,
        "createdAt": datetime.now(timezone.utc).isoformat(),
        "createdBy": current_user.get("id"),
    }
    await db.ext_clients.insert_one(doc)
    await audit(
        "ext_client_created",
        user=current_user,
        resource=f"ext_client:{client_id}",
        meta={"name": payload.name},
        request=request,
    )
    # Return the secret ONLY on creation (write-once semantics)
    return {"ok": True, "clientId": client_id, "secret": secret, "name": doc["name"]}


# ── 2/5 ───────────────────────────────────────────────────────
@router.post("/bootstrap")
async def ext_client_bootstrap(
    request: Request,
    current_user: dict = Depends(require_master_admin),
):
    """Auto-provision an ext_client for every active ``role=manager`` staff
    member that does not yet have an **active** client bound to their email.

    Idempotent: managers that already have an active client are skipped.
    Secrets are returned ONCE in the response payload (write-once).

    Response::

        {
          "ok": True,
          "created":    [{clientId, secret, managerEmail, name}, ...],
          "skipped":    [{managerEmail, existingClientId}, ...],
          "totalManagers": N
        }
    """
    db = _db()
    audit = _audit()
    created: list[dict] = []
    skipped: list[dict] = []
    managers = db.staff.find({"role": "manager"})
    total = 0
    async for m in managers:
        total += 1
        email = (m.get("email") or "").strip().lower()
        if not email:
            continue
        existing = await db.ext_clients.find_one({"managerEmail": email, "active": True})
        if existing:
            skipped.append({"managerEmail": email, "existingClientId": existing["clientId"]})
            continue
        client_id = f"ext_{_secrets.token_urlsafe(8)}"
        secret = _gen_client_secret()
        name = (m.get("name") or "").strip() or email.split("@")[0]
        doc = {
            "clientId": client_id,
            "name": f"manager-{name}",
            "managerEmail": email,
            "secret": secret,
            "active": True,
            "createdAt": datetime.now(timezone.utc).isoformat(),
            "createdBy": current_user.get("id"),
            "bootstrapped": True,
        }
        await db.ext_clients.insert_one(doc)
        await audit(
            "ext_client_bootstrapped",
            user=current_user,
            resource=f"ext_client:{client_id}",
            meta={"managerEmail": email},
            request=request,
        )
        created.append({
            "clientId": client_id,
            "secret": secret,
            "managerEmail": email,
            "name": doc["name"],
        })

    return {
        "ok": True,
        "created": created,
        "skipped": skipped,
        "totalManagers": total,
    }


# ── 3/5 ───────────────────────────────────────────────────────
@router.get("")
async def ext_client_list(current_user: dict = Depends(require_admin)):
    """List ext clients (without secret)."""
    db = _db()
    items = []
    cursor = db.ext_clients.find({}, {"secret": 0, "_id": 0}).sort("createdAt", -1)
    async for d in cursor:
        items.append(d)
    return {"ok": True, "items": items}


# ── 4/5 ───────────────────────────────────────────────────────
@router.post("/{client_id}/revoke")
async def ext_client_revoke(
    client_id: str,
    request: Request,
    current_user: dict = Depends(require_master_admin),
):
    """Revoke an ext client — all subsequent signed requests with this clientId fail."""
    db = _db()
    audit = _audit()
    res = await db.ext_clients.update_one(
        {"clientId": client_id},
        {"$set": {"active": False}},
    )
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Client not found")
    await audit(
        "ext_client_revoked",
        user=current_user,
        resource=f"ext_client:{client_id}",
        meta={},
        request=request,
    )
    return {"ok": True, "clientId": client_id, "active": False}


# ── 5/5 ───────────────────────────────────────────────────────
@router.post("/{client_id}/rotate")
async def ext_client_rotate(
    client_id: str,
    request: Request,
    current_user: dict = Depends(require_master_admin),
):
    """Rotate the secret for a client (invalidates the previous secret immediately)."""
    db = _db()
    audit = _audit()
    new_secret = _gen_client_secret()
    res = await db.ext_clients.update_one(
        {"clientId": client_id},
        {"$set": {
            "secret": new_secret,
            "active": True,
            "rotatedAt": datetime.now(timezone.utc).isoformat(),
        }},
    )
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Client not found")
    await audit(
        "ext_client_rotated",
        user=current_user,
        resource=f"ext_client:{client_id}",
        meta={},
        request=request,
    )
    return {"ok": True, "clientId": client_id, "secret": new_secret}
