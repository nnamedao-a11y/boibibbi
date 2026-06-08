"""
BIBI Cars — Wave 15 — Contract Lifecycle Service
================================================

All state-mutating business logic lives here. Router stays thin.

Lifecycle:
    draft
      │ send()                          (manager+ → attaches approval chain)
      ▼
    pending_approval
      │ approve(step)                    (each step in approval_chain)
      ▼
    approved
      │ send()                           (push to customer)
      ▼
    sent  → opened  → signed  → active
      │ amend()                          (creates new version, marks current=False)
      ▼
    amended  → archived  → expired  → rejected
"""
from __future__ import annotations
import uuid
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional, Tuple

from motor.motor_asyncio import AsyncIOMotorDatabase

from app.wave15.contract_health import compute_contract_health
from app.wave15.templates import get_template


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _add_days(iso_or_now: Optional[str], days: int) -> str:
    base = datetime.now(timezone.utc)
    if iso_or_now:
        try:
            base = datetime.fromisoformat(iso_or_now.replace("Z", "+00:00"))
        except Exception:
            pass
    return (base + timedelta(days=days)).isoformat()


def _ev(kind: str, *, user: Optional[Dict[str, Any]] = None, note: str | None = None, meta: dict | None = None) -> Dict[str, Any]:
    user = user or {}
    return {
        "kind":       kind,
        "at":         _now_iso(),
        "actor_id":   user.get("id") or user.get("sub"),
        "actor_name": user.get("name") or user.get("email"),
        "note":       note,
        "meta":       meta or {},
    }


async def get_contract(db: AsyncIOMotorDatabase, contract_id: str) -> Optional[Dict[str, Any]]:
    return await db.contracts.find_one({"id": contract_id}, {"_id": 0})


async def list_contracts(
    db: AsyncIOMotorDatabase,
    scope_filter: Optional[Dict[str, Any]],
    *,
    status:   Optional[str] = None,
    type_:    Optional[str] = None,
    deal_id:  Optional[str] = None,
    only_at_risk: bool = False,
    limit:    int = 500,
) -> List[Dict[str, Any]]:
    q: Dict[str, Any] = {}
    if scope_filter:
        q.update(scope_filter)
    if status:
        q["status"] = status
    if type_:
        q["type"] = type_
    if deal_id:
        q["deal_id"] = deal_id
    rows = await db.contracts.find(q, {"_id": 0}).sort("updated_at", -1).to_list(length=limit)
    if only_at_risk:
        # exclude healthy + archived (handled via post-filter w/ health scorer)
        out = []
        for r in rows:
            h = compute_contract_health(r)
            if h["segment"] not in ("healthy", "archived"):
                r["health"] = h
                out.append(r)
        return out
    # attach health for the list view (cheap, in-memory)
    for r in rows:
        r["health"] = compute_contract_health(r)
    return rows


async def create_contract(
    db: AsyncIOMotorDatabase,
    user: Dict[str, Any],
    payload: Dict[str, Any],
) -> Dict[str, Any]:
    tpl_key = (payload.get("template") or "purchase").lower()
    tpl = get_template(tpl_key)
    now = _now_iso()
    contract_id = f"contract_{uuid.uuid4().hex[:12]}"
    valid_days = int(tpl.get("valid_days") or 30)

    # Derive deal/customer info if a deal_id was given so the contract
    # auto-fills the parties section instead of asking the user twice.
    deal_id = payload.get("deal_id")
    deal_doc: Optional[Dict[str, Any]] = None
    if deal_id:
        deal_doc = await db.deals.find_one({"id": deal_id}, {"_id": 0})

    parties = payload.get("parties") or []
    if not parties and deal_doc:
        parties = [{
            "role":    "buyer",
            "name":    deal_doc.get("customer_name") or deal_doc.get("customerName"),
            "email":   deal_doc.get("customer_email"),
            "phone":   deal_doc.get("customer_phone"),
            "company": deal_doc.get("customer_company"),
        }, {
            "role":    "seller",
            "name":    "BIBI Cars",
            "company": "BIBI Cars",
        }]

    contract = {
        "id":              contract_id,
        "deal_id":         deal_id,
        "customer_id":     payload.get("customer_id") or (deal_doc or {}).get("customer_id"),
        "managerId":       (deal_doc or {}).get("managerId") or user.get("id") or user.get("managerId") or user.get("sub"),
        "manager_id":      (deal_doc or {}).get("managerId") or user.get("id") or user.get("managerId") or user.get("sub"),
        "manager_name":    user.get("name") or user.get("email"),
        "template":        tpl_key,
        "type":            payload.get("type") or tpl["type"],
        "title":           payload.get("title") or f"{tpl['name']} — {deal_id or contract_id}",
        "status":          "draft",
        "version":         1,
        "current":         True,
        "amount":          float(payload.get("amount") or (deal_doc or {}).get("price") or 0.0) or None,
        "currency":        payload.get("currency") or (deal_doc or {}).get("currency") or "EUR",
        "valid_from":      payload.get("valid_from") or now,
        "valid_to":        payload.get("valid_to") or _add_days(now, valid_days),
        "parties":         parties,
        "required_annexes": payload.get("required_annexes") or tpl.get("required_annexes", []),
        "terms":           {**(tpl.get("terms") or {}), **(payload.get("terms") or {})},
        "notes":           payload.get("notes"),
        "approval_chain":  tpl.get("approval_chain", []),
        "approvals":       [],   # filled when send() is called
        "attachments":     [],
        "events":          [_ev("created", user=user, note=f"Created from template {tpl_key}")],
        "versions":        [],   # populated on amend()
        "sent_at":         None,
        "opened_at":       None,
        "signed_at":       None,
        "signature":       None,
        "created_at":      now,
        "updated_at":      now,
        "created_by":      user.get("id") or user.get("sub"),
    }
    await db.contracts.insert_one(dict(contract))
    return contract


async def patch_contract(db, contract_id: str, user: Dict[str, Any], patch: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    contract = await get_contract(db, contract_id)
    if not contract:
        return None
    if contract.get("status") in ("archived", "amended"):
        return contract
    update = {k: v for k, v in (patch or {}).items() if v is not None}
    if not update:
        return contract
    update["updated_at"] = _now_iso()
    await db.contracts.update_one(
        {"id": contract_id},
        {"$set": update, "$push": {"events": _ev("updated", user=user, meta={"fields": list(update.keys())})}},
    )
    return await get_contract(db, contract_id)


async def send_contract(db, contract_id: str, user: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """Send to next stage:
      * draft        → pending_approval (attach approval chain)
      * approved     → sent (delivered to customer)
      * sent/opened  → idempotent (refreshes sent_at)
    """
    c = await get_contract(db, contract_id)
    if not c: return None
    status = c.get("status")
    chain = c.get("approval_chain") or []
    now   = _now_iso()

    if status == "draft":
        approvals = [
            {"step": step, "status": "pending", "actor_id": None, "actor_name": None, "comment": None, "at": None}
            for step in chain
        ]
        await db.contracts.update_one(
            {"id": contract_id},
            {"$set": {"status": "pending_approval", "approvals": approvals, "updated_at": now},
             "$push": {"events": _ev("sent", user=user, note="Sent for internal approval")}}
        )
        return await get_contract(db, contract_id)

    if status in ("approved", "sent", "opened"):
        await db.contracts.update_one(
            {"id": contract_id},
            {"$set": {"status": "sent", "sent_at": now, "updated_at": now},
             "$push": {"events": _ev("sent", user=user, note="Delivered to customer")}}
        )
        return await get_contract(db, contract_id)

    # already signed/active/archived/amended/etc — ignore
    return c


def _next_pending_step(approvals: List[Dict[str, Any]]) -> Optional[str]:
    for a in approvals or []:
        if (a.get("status") or "pending") == "pending":
            return a.get("step")
    return None


async def approve_contract(
    db, contract_id: str, user: Dict[str, Any],
    *, step: Optional[str] = None, comment: Optional[str] = None,
) -> Tuple[Optional[Dict[str, Any]], Optional[str]]:
    c = await get_contract(db, contract_id)
    if not c: return None, "not_found"
    if c.get("status") != "pending_approval":
        return c, "not_in_pending_approval"

    approvals = c.get("approvals") or []
    target_step = step or _next_pending_step(approvals)
    if not target_step:
        return c, "nothing_to_approve"

    # role-gating: which roles can satisfy which step
    role = (user.get("role") or "").lower()
    role_ok = {
        "manager":    {"manager", "team_lead", "admin", "master_admin", "owner"},
        "team_lead":  {"team_lead", "admin", "master_admin", "owner"},
        "admin":      {"admin", "master_admin", "owner"},
        "customer":   {"customer", "admin", "master_admin", "owner"},
    }.get(target_step, {"admin", "master_admin", "owner"})
    if role not in role_ok:
        return c, f"role_{role}_cannot_approve_{target_step}"

    now = _now_iso()
    new_approvals = []
    advanced = False
    for a in approvals:
        if not advanced and a.get("step") == target_step and (a.get("status") or "pending") == "pending":
            new_approvals.append({
                **a,
                "status": "approved",
                "actor_id":   user.get("id") or user.get("sub"),
                "actor_name": user.get("name") or user.get("email"),
                "comment":    comment,
                "at":         now,
            })
            advanced = True
        else:
            new_approvals.append(a)

    next_pending = _next_pending_step(new_approvals)
    if next_pending is None:
        new_status = "approved"
    else:
        new_status = "pending_approval"

    await db.contracts.update_one(
        {"id": contract_id},
        {"$set": {"approvals": new_approvals, "status": new_status, "updated_at": now},
         "$push": {"events": _ev("approved", user=user, note=f"Approved step {target_step}",
                                  meta={"step": target_step})}}
    )
    return await get_contract(db, contract_id), None


async def reject_contract(
    db, contract_id: str, user: Dict[str, Any], *, comment: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    c = await get_contract(db, contract_id)
    if not c: return None
    if c.get("status") not in ("pending_approval",):
        return c
    approvals = c.get("approvals") or []
    target = _next_pending_step(approvals)
    now = _now_iso()
    new_approvals = [
        ({"step": a.get("step"), "status": "rejected",
          "actor_id":   user.get("id") or user.get("sub"),
          "actor_name": user.get("name") or user.get("email"),
          "comment":    comment,
          "at":         now}
         if (target and a.get("step") == target)
         else a)
        for a in approvals
    ]
    await db.contracts.update_one(
        {"id": contract_id},
        {"$set": {"status": "rejected", "approvals": new_approvals, "updated_at": now},
         "$push": {"events": _ev("rejected", user=user, note=comment or "Rejected")}}
    )
    return await get_contract(db, contract_id)


async def sign_contract(
    db, contract_id: str, user: Dict[str, Any], *, signer: Optional[Dict[str, Any]] = None,
) -> Optional[Dict[str, Any]]:
    c = await get_contract(db, contract_id)
    if not c: return None
    if c.get("status") in ("draft", "pending_approval"):
        return c   # cannot sign before approved
    if c.get("status") in ("archived", "amended", "expired", "rejected"):
        return c
    signer = signer or {}
    now = _now_iso()
    signature = {
        "signer_name":  signer.get("signer_name")  or user.get("name")  or user.get("email"),
        "signer_email": signer.get("signer_email") or user.get("email"),
        "signed_at":    signer.get("signed_at")    or now,
        "method":       signer.get("method")       or "electronic",
        "ip":           signer.get("ip"),
    }
    # if customer is one of the approvers, mark them approved too
    approvals = c.get("approvals") or []
    new_approvals = [
        ({**a, "status": "approved", "actor_name": signature["signer_name"],
          "at": now} if a.get("step") == "customer" and a.get("status") != "approved" else a)
        for a in approvals
    ]
    await db.contracts.update_one(
        {"id": contract_id},
        {"$set": {"status": "active", "signed_at": signature["signed_at"],
                  "signature": signature, "approvals": new_approvals,
                  "updated_at": now},
         "$push": {"events": _ev("signed", user=user, note=f"Signed by {signature['signer_name']}",
                                  meta={"method": signature["method"]})}}
    )
    return await get_contract(db, contract_id)


async def amend_contract(
    db, contract_id: str, user: Dict[str, Any], *, reason: Optional[str] = None, terms: Optional[Dict[str, Any]] = None,
) -> Optional[Dict[str, Any]]:
    c = await get_contract(db, contract_id)
    if not c: return None
    if c.get("status") in ("draft",):
        # no need to amend a draft — just patch it
        return c
    now = _now_iso()
    # Snapshot current version into versions[] and mark current=False on it.
    snapshot = {k: v for k, v in c.items() if k not in ("versions",)}
    version_record = {
        "version": c.get("version", 1),
        "status":  c.get("status"),
        "snapshot": snapshot,
        "at":      now,
        "by":      user.get("id") or user.get("sub"),
        "reason":  reason,
    }
    # Mark old contract as amended/non-current.
    await db.contracts.update_one(
        {"id": contract_id},
        {"$set": {"status": "amended", "current": False, "updated_at": now},
         "$push": {"events": _ev("amended", user=user, note=reason or "Amended")}}
    )
    # Create a new contract (next version) that supersedes the old one.
    new_id = f"contract_{uuid.uuid4().hex[:12]}"
    new_contract = {
        **c,
        "id":           new_id,
        "version":      int(c.get("version", 1)) + 1,
        "current":      True,
        "status":       "draft",
        "signed_at":    None,
        "sent_at":      None,
        "opened_at":    None,
        "signature":    None,
        "approvals":    [],
        "events":       [_ev("created", user=user, note=f"Amended from {contract_id}")],
        "versions":     (c.get("versions") or []) + [version_record],
        "parent_contract_id": contract_id,
        "terms":        {**(c.get("terms") or {}), **(terms or {})},
        "created_at":   now,
        "updated_at":   now,
        "created_by":   user.get("id") or user.get("sub"),
    }
    await db.contracts.insert_one(dict(new_contract))
    return new_contract


async def archive_contract(db, contract_id: str, user: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    c = await get_contract(db, contract_id)
    if not c: return None
    if c.get("status") == "archived":
        return c
    await db.contracts.update_one(
        {"id": contract_id},
        {"$set": {"status": "archived", "current": False, "updated_at": _now_iso()},
         "$push": {"events": _ev("archived", user=user)}}
    )
    return await get_contract(db, contract_id)


async def add_attachment(
    db, contract_id: str, user: Dict[str, Any],
    *, filename: str, kind: str = "annex", size: Optional[int] = None,
    content_type: Optional[str] = None, storage_key: Optional[str] = None,
    kind_key: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    c = await get_contract(db, contract_id)
    if not c: return None
    att = {
        "id":           f"att_{uuid.uuid4().hex[:10]}",
        "filename":     filename,
        "kind":         kind,
        "kind_key":     (kind_key or kind).lower(),
        "size":         size,
        "content_type": content_type,
        "storage_key":  storage_key,
        "uploaded_by":  user.get("id") or user.get("sub"),
        "uploaded_at":  _now_iso(),
    }
    await db.contracts.update_one(
        {"id": contract_id},
        {"$set": {"updated_at": _now_iso()},
         "$push": {"attachments": att,
                   "events":      _ev("attachment_added", user=user, note=filename,
                                       meta={"kind": kind, "size": size})}}
    )
    return await get_contract(db, contract_id)


async def remove_attachment(db, contract_id: str, user: Dict[str, Any], att_id: str) -> Optional[Dict[str, Any]]:
    c = await get_contract(db, contract_id)
    if not c: return None
    att = next((a for a in (c.get("attachments") or []) if a.get("id") == att_id), None)
    if not att:
        return c
    await db.contracts.update_one(
        {"id": contract_id},
        {"$set": {"updated_at": _now_iso()},
         "$pull": {"attachments": {"id": att_id}},
         "$push": {"events": _ev("attachment_removed", user=user, note=att.get("filename"))}}
    )
    return await get_contract(db, contract_id)


async def mark_opened(db, contract_id: str, user: Optional[Dict[str, Any]] = None) -> Optional[Dict[str, Any]]:
    """Optional helper — customer opened the contract email/link."""
    c = await get_contract(db, contract_id)
    if not c: return None
    if c.get("status") not in ("sent",):
        return c
    now = _now_iso()
    await db.contracts.update_one(
        {"id": contract_id},
        {"$set": {"status": "opened", "opened_at": now, "updated_at": now},
         "$push": {"events": _ev("opened", user=user)}}
    )
    return await get_contract(db, contract_id)


__all__ = [
    "get_contract", "list_contracts", "create_contract", "patch_contract",
    "send_contract", "approve_contract", "reject_contract", "sign_contract",
    "amend_contract", "archive_contract", "add_attachment", "remove_attachment",
    "mark_opened",
]
