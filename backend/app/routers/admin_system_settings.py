"""
admin_system_settings.py — /api/admin/system/settings (Phase IV-5).

One-stop admin control panel for runtime settings that previously required
editing ``.env`` and restarting the backend:

  • production_domain   — the canonical site URL ('https://bibi.cars'). Used
                          to render webhook URLs in the UI and OG-tags.
  • cors_origins        — exact-match allowlist for browser-side CORS.
  • cors_origin_regex   — optional wildcard regex (e.g. preview subdomains).
  • allow_subdomains    — when true, auto-derives a wildcard regex from the
                          production_domain (so *.bibi.cars also works).

Storage: a single ``system_settings`` Mongo document with ``_id="global"``.
Changes invalidate the ``DynamicCORSMiddleware`` cache so they take effect
on the very next preflight (no restart needed).

Endpoints:
  GET  /api/admin/system/settings          → current settings + env baseline
  PATCH /api/admin/system/settings         → upsert one or more fields
  POST  /api/admin/system/settings/jwt/rotate → generate fresh JWT_SECRET
                                              (admin must accept loss-of-sessions)

All endpoints require ``require_master_admin`` because misconfiguring CORS
can lock the admin team out of their own UI; we want a single, audited
chokepoint for these changes.
"""
from __future__ import annotations

import logging
import secrets
import re
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from urllib.parse import urlparse

from fastapi import APIRouter, Body, Depends, HTTPException

from security import (
    parse_cors_origins,
    parse_cors_origin_regex,
    require_master_admin,
)

logger = logging.getLogger("bibi.admin_system_settings")

router = APIRouter(prefix="/api/admin/system", tags=["admin-system"])

DOC_ID = "global"
DEFAULT_DOC: Dict[str, Any] = {
    "_id": DOC_ID,
    "production_domain": "",
    "cors_origins": [],
    "cors_origin_regex": None,
    "allow_subdomains": False,
    "updated_at": None,
    "updated_by": None,
}


def _db():
    from app.core.db_runtime import get_db
    return get_db()


def _normalize_origin(o: str) -> str:
    """Strip trailing slash + lowercase scheme."""
    o = (o or "").strip().rstrip("/")
    if "://" in o:
        scheme, rest = o.split("://", 1)
        o = f"{scheme.lower()}://{rest}"
    return o


def _derive_subdomain_regex(production_domain: str) -> Optional[str]:
    """Given ``https://bibi.cars``, return ``^https?://[^.]+\\.bibi\\.cars$``.

    Used when ``allow_subdomains=true`` so admins don't need to type a regex.
    """
    if not production_domain:
        return None
    try:
        parsed = urlparse(production_domain)
        host = parsed.hostname or ""
        if not host:
            return None
        # Strip leading 'www.' so the regex covers it too
        if host.startswith("www."):
            host = host[4:]
        escaped = re.escape(host)
        # Allow https/http both, with arbitrary 1-level subdomain prefix
        return rf"^https?://([^.]+\.)?{escaped}$"
    except Exception:
        return None


@router.get("/settings", dependencies=[Depends(require_master_admin)])
async def get_system_settings():
    """Return current settings + env baseline so the UI can show what's
    coming from .env (read-only) vs. DB (editable)."""
    db = _db()
    doc = await db.system_settings.find_one({"_id": DOC_ID}) or {}
    env_origins = parse_cors_origins()
    env_regex = parse_cors_origin_regex()

    return {
        "settings": {
            "production_domain": doc.get("production_domain", ""),
            "cors_origins": doc.get("cors_origins", []),
            "cors_origin_regex": doc.get("cors_origin_regex"),
            "allow_subdomains": bool(doc.get("allow_subdomains", False)),
            "updated_at": (
                doc["updated_at"].isoformat()
                if doc.get("updated_at") and hasattr(doc["updated_at"], "isoformat")
                else doc.get("updated_at")
            ),
            "updated_by": doc.get("updated_by"),
        },
        "env_baseline": {
            "cors_origins": env_origins,
            "cors_origin_regex": env_regex,
            "note": "These come from the .env file and act as a baseline; admin entries are merged on top.",
        },
        # Helpful pre-computed URLs the UI can copy/paste
        "computed": {
            "ringostat_webhook_url": (
                f"{doc.get('production_domain', '').rstrip('/')}/api/integrations/ringostat/webhook"
                if doc.get("production_domain") else None
            ),
            "site_origin": doc.get("production_domain") or None,
        },
    }


@router.patch("/settings", dependencies=[Depends(require_master_admin)])
async def update_system_settings(
    data: Dict[str, Any] = Body(default={}),
    current_user: Dict[str, Any] = Depends(require_master_admin),
):
    """Upsert one or more system settings.

    Body fields (all optional):
      - ``production_domain`` (str)   — e.g. ``https://bibi.cars``
      - ``cors_origins`` (list[str] | csv)
      - ``cors_origin_regex`` (str | null)
      - ``allow_subdomains`` (bool)   — derive a wildcard regex from production_domain

    Returns the updated settings (same shape as GET).
    """
    db = _db()
    patch: Dict[str, Any] = {}

    if "production_domain" in data:
        pd = _normalize_origin(str(data["production_domain"] or ""))
        if pd and not pd.startswith(("http://", "https://")):
            pd = f"https://{pd}"
        patch["production_domain"] = pd

    if "cors_origins" in data:
        origins_in = data["cors_origins"]
        if isinstance(origins_in, str):
            origins_in = [o.strip() for o in origins_in.replace(";", ",").split(",") if o.strip()]
        elif isinstance(origins_in, list):
            origins_in = [str(o).strip() for o in origins_in if str(o).strip()]
        else:
            origins_in = []
        patch["cors_origins"] = [_normalize_origin(o) for o in origins_in if _normalize_origin(o)]

    if "cors_origin_regex" in data:
        rx = (data["cors_origin_regex"] or "").strip() or None
        if rx:
            # Validate the regex compiles before saving
            try:
                re.compile(rx)
            except re.error as e:
                raise HTTPException(status_code=400, detail=f"Invalid regex: {e}")
        patch["cors_origin_regex"] = rx

    if "allow_subdomains" in data:
        patch["allow_subdomains"] = bool(data["allow_subdomains"])

    # If allow_subdomains is enabled and we have a production_domain (either
    # in the patch or already saved), auto-derive the regex.
    if patch.get("allow_subdomains") or (
        "allow_subdomains" not in data
        and (await db.system_settings.find_one({"_id": DOC_ID}) or {}).get("allow_subdomains")
    ):
        existing = await db.system_settings.find_one({"_id": DOC_ID}) or {}
        prod = patch.get("production_domain") or existing.get("production_domain") or ""
        derived = _derive_subdomain_regex(prod)
        if derived and not patch.get("cors_origin_regex"):
            patch["cors_origin_regex"] = derived

    # ── Auto-add production_domain into cors_origins ──────────────────
    # Admin should not have to type the same URL twice. If they save a
    # production_domain we make sure it appears in cors_origins (both the
    # bare host and the `www.` variant), so the browser can reach the
    # backend from that origin without any extra configuration step.
    existing_doc = await db.system_settings.find_one({"_id": DOC_ID}) or {}
    desired_prod = patch.get("production_domain", existing_doc.get("production_domain") or "")
    if desired_prod:
        merged = list(patch.get("cors_origins", existing_doc.get("cors_origins") or []))
        candidates = [desired_prod]
        try:
            parsed = urlparse(desired_prod)
            host = parsed.hostname or ""
            scheme = parsed.scheme or "https"
            if host:
                if host.startswith("www."):
                    candidates.append(f"{scheme}://{host[4:]}")
                else:
                    candidates.append(f"{scheme}://www.{host}")
        except Exception:
            pass
        for c in candidates:
            c_norm = _normalize_origin(c)
            if c_norm and c_norm not in merged:
                merged.append(c_norm)
        patch["cors_origins"] = merged

    patch["updated_at"] = datetime.now(timezone.utc)
    patch["updated_by"] = (current_user or {}).get("id") or (current_user or {}).get("_id")

    await db.system_settings.update_one(
        {"_id": DOC_ID},
        {"$set": patch, "$setOnInsert": {"_id": DOC_ID}},
        upsert=True,
    )

    # Invalidate the live CORS cache so changes take effect on next request
    try:
        from app.middleware.dynamic_cors import DynamicCORSMiddleware
        DynamicCORSMiddleware.invalidate_cache()
        await DynamicCORSMiddleware._refresh_from_db()
    except Exception as e:
        logger.warning(f"[admin/system/settings] cache invalidate failed: {e}")

    return await get_system_settings()


@router.post("/settings/jwt/rotate", dependencies=[Depends(require_master_admin)])
async def rotate_jwt_secret(
    data: Dict[str, Any] = Body(default={}),
    current_user: Dict[str, Any] = Depends(require_master_admin),
):
    """Generate a fresh JWT_SECRET and persist it to ``system_settings``.

    ⚠️  This invalidates every existing token immediately — all logged-in
    users (including you) will need to log back in.

    Body:
      - ``confirm`` (bool) — must be ``true`` to proceed (safety guard).

    The new secret is *also* written into ``backend/.env`` so it survives
    process restarts.  ``security.py`` reads from .env at import — call
    ``supervisorctl restart backend`` after rotation to pick up the new
    secret across all workers.
    """
    if not data.get("confirm"):
        raise HTTPException(
            status_code=400,
            detail="Confirm=true required: rotating JWT will log out everyone (including you).",
        )

    new_secret = secrets.token_urlsafe(48)  # 64 chars, URL-safe
    db = _db()

    # 1) Persist to DB for audit + future read by next-boot env loader
    await db.system_settings.update_one(
        {"_id": DOC_ID},
        {
            "$set": {
                "jwt_secret_rotated_at": datetime.now(timezone.utc),
                "jwt_secret_rotated_by": (current_user or {}).get("id"),
            },
            "$push": {
                "jwt_rotation_history": {
                    "ts": datetime.now(timezone.utc),
                    "by": (current_user or {}).get("id"),
                }
            },
            "$setOnInsert": {"_id": DOC_ID},
        },
        upsert=True,
    )

    # 2) Write to .env so it survives restart
    try:
        from pathlib import Path
        env_path = Path("/app/backend/.env")
        if env_path.exists():
            lines = env_path.read_text().splitlines()
            out_lines: List[str] = []
            replaced = False
            for line in lines:
                if line.startswith("JWT_SECRET="):
                    out_lines.append(f'JWT_SECRET="{new_secret}"')
                    replaced = True
                else:
                    out_lines.append(line)
            if not replaced:
                out_lines.append(f'JWT_SECRET="{new_secret}"')
            env_path.write_text("\n".join(out_lines) + "\n")
    except Exception as e:
        logger.warning(f"[admin/system/settings] .env write failed: {e}")

    return {
        "success": True,
        "message": "JWT_SECRET rotated. Restart backend to load it: `sudo supervisorctl restart backend`",
        "rotated_at": datetime.now(timezone.utc).isoformat(),
        "warning": "All existing JWT tokens are now invalid.",
    }
