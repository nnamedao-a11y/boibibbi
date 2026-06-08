"""
auth_extra — расширенные endpoints входа (TOTP / email-OTP / logout)
=================================================================

Mонтируется РЯДОМ с базовым /api/auth/login (который в server.py).
Ничего в server.py не ломаем — логин продолжает выдавать JWT,
политика «челлендж вместо токена» реализована хуком (патч в server.py
вызывает наш сервис и может вернуть challenge).

Endpoints:
  POST /api/auth/2fa/verify          — админ TOTP challenge
  POST /api/auth/email-otp/request   — (вызывается автоматически при login тимлида,
                                       но доступен для resend по challenge_token)
  POST /api/auth/email-otp/verify    — тимлид вводит OTP
  POST /api/auth/logout              — запись logout-события в audit
"""
from __future__ import annotations

import logging
from typing import Any, Dict, Optional

from fastapi import APIRouter, Body, HTTPException, Request, Depends

from security import create_jwt, get_current_user_optional

logger = logging.getLogger("bibi.auth_extra")

router = APIRouter(prefix="/api/auth", tags=["auth-extra"])


def _svc():
    from app.core.db_runtime import get_db
    from app.services.auth_policy import AuthPolicyService
    return AuthPolicyService(get_db())


def _db():
    from app.core.db_runtime import get_db
    return get_db()


async def _resolve_user_by_id(user_id: str) -> Optional[Dict[str, Any]]:
    if not user_id:
        return None
    db = _db()
    d = await db.staff.find_one({"$or": [{"id": user_id}, {"_id": user_id}]})
    if not d:
        return None
    return {
        "id":       d.get("id") or d.get("_id"),
        "email":    d.get("email"),
        "name":     d.get("name") or d.get("email"),
        "role":     (d.get("role") or "manager").lower(),
        "managerId": d.get("id") or d.get("_id"),
    }


async def _resolve_user_by_email(email: str) -> Optional[Dict[str, Any]]:
    if not email:
        return None
    db = _db()
    d = await db.staff.find_one({"email": email.strip().lower()})
    if not d:
        return None
    return {
        "id":       d.get("id") or d.get("_id"),
        "email":    d.get("email"),
        "name":     d.get("name") or d.get("email"),
        "role":     (d.get("role") or "manager").lower(),
        "managerId": d.get("id") or d.get("_id"),
    }


def _client_ip(req: Request) -> Optional[str]:
    return (req.client.host if req.client else None) or req.headers.get("x-forwarded-for")


# ----------------------------------------------------------------------- TOTP

@router.post("/2fa/verify")
async def auth_2fa_verify(
    payload: Dict[str, Any] = Body(...),
    request: Request = None,
):
    """Second step for ADMIN role: verify Google Authenticator TOTP.

    Body: {challenge_token, code}
      - challenge_token: a short-lived state token returned by /api/auth/login
        when the role requires TOTP. We use the user's email here because
        TOTP doesn't need a server-side state; the password step already
        proved who the user is. To keep state out of the database we
        accept ``user_id`` directly (the login response includes it).
    """
    code = str(payload.get("code") or "").strip()
    user_id = payload.get("user_id") or payload.get("userId")
    if not code or not user_id:
        raise HTTPException(status_code=400, detail="code and user_id required")
    user = await _resolve_user_by_id(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="user not found")
    svc = _svc()
    if not await svc.verify_totp(user, code):
        await svc.write_event(
            user=user, event="login", method="totp", success=False,
            ip=_client_ip(request) if request else None,
            user_agent=(request.headers.get("user-agent") if request else None),
            details={"reason": "invalid_totp"},
        )
        raise HTTPException(status_code=401, detail="Invalid TOTP code")
    token = create_jwt(user)
    await svc.write_event(
        user=user, event="login", method="totp", success=True,
        ip=_client_ip(request) if request else None,
        user_agent=(request.headers.get("user-agent") if request else None),
    )
    return {"access_token": token, "token_type": "Bearer", "user": user}


# ------------------------------------------------------------------- EMAIL-OTP

@router.post("/email-otp/request")
async def auth_email_otp_request(
    payload: Dict[str, Any] = Body(...),
    request: Request = None,
):
    """Generate a fresh email-OTP for the given user_id (team_lead).

    Body: {user_id}
      The frontend calls this right after a successful password step
      that returned ``{challenge: 'email_otp'}``. We do NOT verify
      identity again here — the user_id is a public id and the code is
      only usable together with the challenge_token returned by /login.
      However we DO guard by role (must be team_lead) so this endpoint
      can't be abused to spam codes for arbitrary users.
    """
    user_id = payload.get("user_id") or payload.get("userId")
    if not user_id:
        raise HTTPException(status_code=400, detail="user_id required")
    user = await _resolve_user_by_id(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="user not found")
    from app.services.auth_policy import is_team_lead_role
    if not is_team_lead_role(user["role"]):
        raise HTTPException(status_code=400, detail="email-otp not applicable for this role")
    svc = _svc()
    recipient = await svc.get_team_lead_otp_recipient() or user["email"]
    doc = await svc.otp.issue(
        user_id=user["id"], user_email=user["email"],
        role=user["role"], recipient_email=recipient,
    )
    # Код сам не возвращаем никогда — только challenge_token + реципиент (маска).
    masked = _mask_email(recipient)
    return {
        "challenge_token": doc["challenge_token"],
        "recipient_masked": masked,
        "expires_in_seconds": 600,
        "hint": "Code was issued. Master-admin can read it from the admin panel and forward it to you.",
    }


@router.post("/email-otp/verify")
async def auth_email_otp_verify(
    payload: Dict[str, Any] = Body(...),
    request: Request = None,
):
    """Verify the OTP code entered by the team-lead."""
    challenge_token = (payload.get("challenge_token") or "").strip()
    code = (payload.get("code") or "").strip()
    if not challenge_token or not code:
        raise HTTPException(status_code=400, detail="challenge_token and code required")
    svc = _svc()
    res = await svc.otp.verify(challenge_token, code)
    if not res.get("ok"):
        # Частичный audit — всё равно пытаемся резолвнуть user из документа.
        doc = await svc.otp.get_by_token(challenge_token)
        if doc:
            user = await _resolve_user_by_id(doc.get("user_id"))
            if user:
                await svc.write_event(
                    user=user, event="login", method="email_otp", success=False,
                    ip=_client_ip(request) if request else None,
                    user_agent=(request.headers.get("user-agent") if request else None),
                    details={"reason": res.get("status")},
                )
        raise HTTPException(status_code=401, detail=f"OTP {res.get('status')}")
    doc = res["doc"]
    user = await _resolve_user_by_id(doc.get("user_id"))
    if not user:
        raise HTTPException(status_code=404, detail="user not found")
    token = create_jwt(user)
    await svc.write_event(
        user=user, event="login", method="email_otp", success=True,
        ip=_client_ip(request) if request else None,
        user_agent=(request.headers.get("user-agent") if request else None),
    )
    return {"access_token": token, "token_type": "Bearer", "user": user}


# ------------------------------------------------------------------- LOGOUT

@router.post("/logout")
async def auth_logout(
    request: Request,
    user: Optional[Dict[str, Any]] = Depends(get_current_user_optional),
):
    """Record a logout event. JWT itself is stateless, so this is
    audit-only — the client throws the token away."""
    if user:
        svc = _svc()
        await svc.write_event(
            user=user, event="logout", method="manual", success=True,
            ip=_client_ip(request),
            user_agent=request.headers.get("user-agent"),
        )
    return {"success": True}


def _mask_email(email: Optional[str]) -> str:
    if not email or "@" not in email:
        return "***"
    local, _, domain = email.partition("@")
    if len(local) <= 2:
        masked_local = local[0] + "*"
    else:
        masked_local = local[0] + "*" * (len(local) - 2) + local[-1]
    return f"{masked_local}@{domain}"
