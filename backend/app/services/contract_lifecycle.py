"""
Contract Lifecycle service — Mini Sprint Contracts Final
=========================================================

Manages the state-machine of every contract from the moment a manager
generates the PDF up to the moment the customer signs it.

Lifecycle
---------
      ╔═══════╗      ╔══════╗      ╔═══════╗      ╔════════╗      ╔══════════╗
   ---║ draft ╟──────╬ sent ╟──────╬ viewed ╟──────╬ signed ╟──────╬ archived ║
      ╚═══╦═══╝      ╚══════╝      ╚═══════╝      ╚═══╦════╝      ╚══════════╝
          │                                  │
          ╚═ cancel  (admin only)             ╚═ archive (admin)

Key points
----------
* Every contract carries a stable, opaque ``view_token`` that grants
  read+sign access to the customer **without** authentication. The
  token is generated when the contract transitions from draft → sent.
* Visiting the public viewer flips ``viewed_at`` exactly once (we
  don't churn the state-machine on subsequent re-views).
* Signing requires explicit terms acceptance + a typed full name.
  We record the requester's IP and user-agent for audit.
* Idempotent ``record_view`` / ``ensure_view_token`` helpers so
  webhook retries don't multiply events.
* Emits ``contract_signed`` event to the Customer Timeline.
"""
from __future__ import annotations

import logging
import secrets
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from app.core.db_runtime import get_db

logger = logging.getLogger("bibi.contract_lifecycle")

COLLECTION = "contracts_v2"

LIFECYCLE_STATES = ("draft", "sent", "viewed", "signed", "archived", "cancelled")
# Allowed forward transitions. Backward moves are admin-only and bypass this map.
ALLOWED_TRANSITIONS = {
    "draft":     {"sent", "cancelled", "archived"},
    "sent":      {"viewed", "signed", "cancelled", "archived"},
    "viewed":    {"signed", "cancelled", "archived"},
    "signed":    {"archived"},
    "archived":  set(),
    "cancelled": {"archived"},
}


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _new_id() -> str:
    return f"ctr_{uuid.uuid4().hex[:14]}"


def _new_view_token() -> str:
    # 32 url-safe chars — hard to brute-force, easy to embed in mailer
    return secrets.token_urlsafe(24)


async def create_from_generation(
    *,
    customer_id: str,
    invoice_id: Optional[str],
    deal_id: Optional[str],
    file_id: str,
    document_id: str,
    template_id: Optional[str],
    language: str = "en",
    title: Optional[str] = None,
    version: int = 1,
    generated_by: Optional[str] = None,
    generated_by_email: Optional[str] = None,
) -> Dict[str, Any]:
    """Spawn a contracts_v2 row right after the PDF is generated.

    Idempotency: if a contract for the same ``document_id`` already
    exists we return it unchanged (so re-generating the same PDF
    twice doesn't duplicate the lifecycle record).
    """
    db = get_db()
    existing = await db[COLLECTION].find_one({"document_id": document_id}, {"_id": 0})
    if existing:
        return existing

    doc = {
        "id": _new_id(),
        "customerId": customer_id,
        "customer_id": customer_id,
        "invoiceId": invoice_id,
        "dealId": deal_id,
        "file_id": file_id,
        "document_id": document_id,
        "template_id": template_id,
        "language": language,
        "title": title or f"Contract {version}",
        "version": version,
        "lifecycle": "draft",
        "view_token": None,
        "sent_at": None,
        "viewed_at": None,
        "signed_at": None,
        "signed_by": None,
        "signed_ip": None,
        "signed_user_agent": None,
        "signed_full_name": None,
        "archived_at": None,
        "cancelled_at": None,
        "created_at": _now(),
        "updated_at": _now(),
        "created_by": generated_by,
        "created_by_email": generated_by_email,
    }
    await db[COLLECTION].insert_one(dict(doc))
    doc.pop("_id", None)
    return doc


async def list_for_customer(customer_id: str, *, include_archived: bool = True) -> List[Dict[str, Any]]:
    db = get_db()
    flt: Dict[str, Any] = {
        "$or": [{"customerId": customer_id}, {"customer_id": customer_id}],
    }
    if not include_archived:
        flt["lifecycle"] = {"$ne": "archived"}
    cursor = db[COLLECTION].find(flt, {"_id": 0}).sort("created_at", -1)
    return await cursor.to_list(length=300)


async def get_by_id(contract_id: str) -> Optional[Dict[str, Any]]:
    db = get_db()
    return await db[COLLECTION].find_one({"id": contract_id}, {"_id": 0})


async def get_by_view_token(token: str) -> Optional[Dict[str, Any]]:
    if not token:
        return None
    db = get_db()
    return await db[COLLECTION].find_one({"view_token": token}, {"_id": 0})


def _transition_ok(current: str, target: str) -> bool:
    return target in ALLOWED_TRANSITIONS.get(current or "draft", set())


async def mark_sent(contract_id: str, *, by: Optional[Dict[str, Any]] = None) -> Optional[Dict[str, Any]]:
    db = get_db()
    doc = await get_by_id(contract_id)
    if not doc:
        return None
    if doc.get("lifecycle") not in {"draft", "sent"}:
        # Sending again from a later state is meaningless
        raise ValueError(f"Cannot send from lifecycle '{doc.get('lifecycle')}'")
    token = doc.get("view_token") or _new_view_token()
    await db[COLLECTION].update_one(
        {"id": contract_id},
        {"$set": {
            "lifecycle": "sent",
            "view_token": token,
            "sent_at": doc.get("sent_at") or _now(),
            "sent_by": (by or {}).get("id"),
            "sent_by_email": (by or {}).get("email"),
            "updated_at": _now(),
        }},
    )
    return await get_by_id(contract_id)


async def record_view(view_token: str) -> Optional[Dict[str, Any]]:
    """Idempotently bump viewed_at on first public open."""
    db = get_db()
    doc = await get_by_view_token(view_token)
    if not doc:
        return None
    if doc.get("lifecycle") in {"sent"}:
        await db[COLLECTION].update_one(
            {"id": doc["id"]},
            {"$set": {"lifecycle": "viewed", "viewed_at": _now(), "updated_at": _now()}},
        )
        return await get_by_id(doc["id"])
    # Already viewed/signed/archived — leave alone
    return doc


async def sign(
    view_token: str,
    *,
    full_name: str,
    terms_accepted: bool,
    ip: Optional[str] = None,
    user_agent: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    if not terms_accepted:
        raise ValueError("Terms must be accepted before signing")
    if not (full_name and full_name.strip()):
        raise ValueError("Full name is required")
    db = get_db()
    doc = await get_by_view_token(view_token)
    if not doc:
        return None
    cur = doc.get("lifecycle")
    if cur not in {"sent", "viewed"}:
        raise ValueError(f"Cannot sign from lifecycle '{cur}'")

    await db[COLLECTION].update_one(
        {"id": doc["id"]},
        {"$set": {
            "lifecycle": "signed",
            "signed_at": _now(),
            "signed_full_name": full_name.strip(),
            "signed_by": doc.get("customerId") or doc.get("customer_id"),
            "signed_ip": ip,
            "signed_user_agent": user_agent,
            "updated_at": _now(),
        }},
    )
    fresh = await get_by_id(doc["id"])

    # Emit timeline event
    try:
        from app.services import customer_timeline
        await customer_timeline.record_event(
            customer_id=doc.get("customerId") or doc.get("customer_id"),
            kind="contract_signed",
            title=f"Contract signed by {full_name.strip()}",
            ref={"collection": COLLECTION, "id": doc["id"]},
            actor={"name": full_name.strip(), "email": None, "role": "customer"},
            meta={"ip": ip, "user_agent": user_agent, "version": doc.get("version")},
        )
    except Exception:
        logger.exception("[contract_lifecycle] timeline emit failed")
    return fresh


async def archive(contract_id: str, *, by: Optional[Dict[str, Any]] = None) -> Optional[Dict[str, Any]]:
    db = get_db()
    doc = await get_by_id(contract_id)
    if not doc:
        return None
    await db[COLLECTION].update_one(
        {"id": contract_id},
        {"$set": {
            "lifecycle": "archived",
            "archived_at": _now(),
            "archived_by": (by or {}).get("id"),
            "updated_at": _now(),
        }},
    )
    return await get_by_id(contract_id)


async def cancel(contract_id: str, *, by: Optional[Dict[str, Any]] = None, reason: Optional[str] = None) -> Optional[Dict[str, Any]]:
    db = get_db()
    doc = await get_by_id(contract_id)
    if not doc:
        return None
    if doc.get("lifecycle") in {"archived", "signed"}:
        raise ValueError(f"Cannot cancel from lifecycle '{doc.get('lifecycle')}'")
    await db[COLLECTION].update_one(
        {"id": contract_id},
        {"$set": {
            "lifecycle": "cancelled",
            "cancelled_at": _now(),
            "cancelled_by": (by or {}).get("id"),
            "cancellation_reason": reason,
            "updated_at": _now(),
        }},
    )
    return await get_by_id(contract_id)


__all__ = [
    "LIFECYCLE_STATES",
    "create_from_generation",
    "list_for_customer",
    "get_by_id",
    "get_by_view_token",
    "mark_sent",
    "record_view",
    "sign",
    "archive",
    "cancel",
]
