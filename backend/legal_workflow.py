"""
BIBI Cars — Legal & Pipeline workflow (P0.1–P0.4)

Implements, without breaking the existing 22k-line server.py:

  • Customer legal fields (name/EGN/ID-card/address) + validator
  • Extended deal pipeline (20 stages) + transition helper
  • Mandatory deposit calculation (max_bid_usd → required_eur)
  • Contracts (type=deposit|final|purchase, 5-phase lifecycle)

All endpoints live under /api/legal/* and /api/contracts2/* so they
do not clash with the older /api/contracts and /api/deposits routes.
"""

from __future__ import annotations

import os
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Body, Depends, HTTPException, UploadFile, File
from pydantic import BaseModel, Field, validator

from security import require_manager_or_admin, require_admin

from app.repositories import InvoiceTemplateRepository


# ════════════════════════════════════════════════════════════════════════════
#   1.  STAGES & STATUSES
# ════════════════════════════════════════════════════════════════════════════

#: Full deal pipeline — matches BIBI Cars product logic.
DEAL_STAGES: List[str] = [
    "lead",
    "qualified",
    "variants_sent",
    "deposit_contract_drafted",
    "deposit_contract_signed",
    "deposit_paid",
    "searching_at_auction",
    "auction_lost",
    "auction_won",
    "final_contract_sent",
    "final_contract_signed",
    "after_win_payment_paid",
    "in_transit_to_rotterdam",
    "arrived_rotterdam",
    "customs_calculated",
    "final_payment_paid",
    "in_transit_to_bg",
    "delivered",
    "closed",
    "cancelled",
]

#: Allowed "forward" transitions. Any backward transition (rollback) is
#: admin-only. A transition to `cancelled` is allowed at any time for any
#: role >= manager.
DEAL_STAGE_FORWARD: Dict[str, List[str]] = {
    "lead":                       ["qualified", "cancelled"],
    "qualified":                  ["variants_sent", "cancelled"],
    "variants_sent":              ["deposit_contract_drafted", "cancelled"],
    "deposit_contract_drafted":   ["deposit_contract_signed", "cancelled"],
    "deposit_contract_signed":    ["deposit_paid", "cancelled"],
    "deposit_paid":               ["searching_at_auction", "cancelled"],
    "searching_at_auction":       ["auction_won", "auction_lost", "cancelled"],
    "auction_lost":               ["searching_at_auction", "cancelled"],          # one more attempt
    "auction_won":                ["final_contract_sent", "cancelled"],
    "final_contract_sent":        ["final_contract_signed", "cancelled"],
    "final_contract_signed":      ["after_win_payment_paid", "cancelled"],
    "after_win_payment_paid":     ["in_transit_to_rotterdam", "cancelled"],
    "in_transit_to_rotterdam":    ["arrived_rotterdam"],
    "arrived_rotterdam":          ["customs_calculated"],
    "customs_calculated":         ["final_payment_paid"],
    "final_payment_paid":         ["in_transit_to_bg"],
    "in_transit_to_bg":           ["delivered"],
    "delivered":                  ["closed"],
    "closed":                     [],
    "cancelled":                  [],
}

#: 8 UI groups on top of the 20 stages so managers can navigate easily.
#: Group order matches the deal flow.
#: Each group exposes `labels: {en, bg, uk}` for i18n; `label` keeps EN
#: as a backward-compatible default for legacy frontend code.
DEAL_STAGE_GROUPS: List[Dict[str, Any]] = [
    {"id": "lead",        "label": "Lead",        "labels": {"en": "Lead",        "bg": "Лийд",         "uk": "Лід"},
     "stages": ["lead"]},
    {"id": "preparation", "label": "Preparation", "labels": {"en": "Preparation", "bg": "Подготовка",   "uk": "Підготовка"},
     "stages": ["qualified", "variants_sent"]},
    {"id": "deposit",     "label": "Deposit",     "labels": {"en": "Deposit",     "bg": "Депозит",      "uk": "Депозит"},
     "stages": ["deposit_contract_drafted", "deposit_contract_signed", "deposit_paid"]},
    {"id": "search",      "label": "Search",      "labels": {"en": "Search",      "bg": "Търсене",      "uk": "Пошук"},
     "stages": ["searching_at_auction", "auction_lost"]},
    {"id": "auction",     "label": "Auction",     "labels": {"en": "Auction",     "bg": "Търг",         "uk": "Аукціон"},
     "stages": ["auction_won"]},
    {"id": "payment",     "label": "Payment",     "labels": {"en": "Payment",     "bg": "Плащане",      "uk": "Оплата"},
     "stages": ["final_contract_sent", "final_contract_signed", "after_win_payment_paid"]},
    {"id": "delivery",    "label": "Delivery",    "labels": {"en": "Delivery",    "bg": "Доставка",     "uk": "Доставка"},
     "stages": ["in_transit_to_rotterdam", "arrived_rotterdam", "customs_calculated", "final_payment_paid", "in_transit_to_bg"]},
    {"id": "done",        "label": "Completed",   "labels": {"en": "Completed",   "bg": "Приключено",   "uk": "Завершено"},
     "stages": ["delivered", "closed", "cancelled"]},
]


def _stage_group_of(stage: str) -> Optional[str]:
    for g in DEAL_STAGE_GROUPS:
        if stage in g["stages"]:
            return g["id"]
    return None

#: Deposit: extended set of statuses + forfeit/refund reasons.
DEPOSIT_STATUSES: List[str] = [
    "pending",                       # created; payment not yet confirmed
    "paid_confirmed",                # manager confirmed funds received
    "refund_pending_voluntary",      # client requested refund before winning
    "refund_pending_30d",            # 30 days without a car — automatic via cron
    "refund_approved",               # admin approved refund — waiting for execution
    "refund_rejected",               # admin rejected the refund
    "refunded",                      # refund executed
    "forfeit_pending_teamlead",      # client backed out after winning — awaiting team-lead
    "forfeit_pending_admin",         # team-lead approved — awaiting final admin approval
    "forfeited",                     # forfeited toward the auction penalty
]

#: Stages after which refund is FORBIDDEN (only forfeit is allowed).
STAGES_AFTER_AUCTION_WIN: List[str] = [
    "auction_won",
    "final_contract_sent",
    "final_contract_signed",
    "after_win_payment_paid",
    "in_transit_to_rotterdam",
    "arrived_rotterdam",
    "customs_calculated",
    "final_payment_paid",
    "in_transit_to_bg",
    "delivered",
    "closed",
]

#: Contract: 5-phase lifecycle.
CONTRACT_TYPES: List[str] = ["deposit", "final", "purchase"]
CONTRACT_LIFECYCLE: List[str] = [
    "draft",
    "sent_to_client",
    "client_signed",
    "company_signed_stamped",
    "finalized",
]
CONTRACT_LIFECYCLE_FORWARD: Dict[str, List[str]] = {
    "draft":                  ["sent_to_client", "cancelled"],
    "sent_to_client":         ["client_signed", "cancelled"],
    "client_signed":          ["company_signed_stamped", "cancelled"],
    "company_signed_stamped": ["finalized", "cancelled"],
    "finalized":              [],
    "cancelled":              [],
}


# ════════════════════════════════════════════════════════════════════════════
#   2.  PYDANTIC MODELS
# ════════════════════════════════════════════════════════════════════════════

# --- P0.1 Customer legal fields --------------------------------------------
class CustomerLegalIn(BaseModel):
    """Fields required to generate the Bulgarian deposit contract."""
    first_name: str = Field(..., min_length=1, max_length=120)
    last_name: str = Field(..., min_length=1, max_length=120)
    egn: str = Field(..., min_length=10, max_length=10, description="Bulgarian EGN — exactly 10 digits")
    national_id_no: str = Field(..., min_length=4, max_length=32, description="Personal ID-card number")
    id_card_address: str = Field(..., min_length=4, max_length=500)
    id_card_issued_by: str = Field(..., min_length=2, max_length=200)
    id_card_issue_date: str = Field(..., description="ISO date (YYYY-MM-DD)")

    @validator("egn")
    def _egn_digits(cls, v: str) -> str:
        if not v.isdigit() or len(v) != 10:
            raise ValueError("EGN must be exactly 10 digits")
        return v

    @validator("id_card_issue_date")
    def _iso_date(cls, v: str) -> str:
        try:
            datetime.strptime(v, "%Y-%m-%d")
        except ValueError:
            raise ValueError("id_card_issue_date must be in YYYY-MM-DD format")
        return v


# --- P0.3 Deposit calculation -----------------------------------------------
class DepositCalcIn(BaseModel):
    max_bid_usd: float = Field(..., ge=0)
    fx_rate_usd_to_eur: Optional[float] = Field(None, gt=0, description="If omitted, the system FX rate is used")


class DepositCreateIn(BaseModel):
    customer_id: str
    deal_id: Optional[str] = None
    max_bid_usd: float = Field(..., ge=0)
    fx_rate_usd_to_eur: Optional[float] = Field(None, gt=0)
    paid_amount_eur: float = Field(0.0, ge=0)
    note: Optional[str] = None


class DepositConfirmIn(BaseModel):
    bank_received_at: Optional[str] = None
    note: Optional[str] = None


# --- P0.4 Contract v2 -------------------------------------------------------
class ContractV2CreateIn(BaseModel):
    deal_id: str
    customer_id: str
    type: str = Field(..., description="deposit | final | purchase")
    items: List[Dict[str, Any]] = Field(default_factory=list, description="Optional line items (for the final contract)")
    notes: Optional[str] = None

    @validator("type")
    def _type_valid(cls, v: str) -> str:
        if v not in CONTRACT_TYPES:
            raise ValueError(f"type must be one of {CONTRACT_TYPES}")
        return v


class ContractV2TransitionIn(BaseModel):
    to: str = Field(..., description="Target lifecycle status")
    note: Optional[str] = None


# ════════════════════════════════════════════════════════════════════════════
#   3.  HELPERS
# ════════════════════════════════════════════════════════════════════════════

DEFAULT_FX_USD_TO_EUR: float = float(os.environ.get("BIBI_FX_USD_TO_EUR") or 0.92)
MIN_DEPOSIT_EUR: float = 1000.0
DEPOSIT_PCT_THRESHOLD_USD: float = 10000.0
DEPOSIT_PCT: float = 0.10
REFUND_DEADLINE_DAYS: int = int(os.environ.get("BIBI_REFUND_DEADLINE_DAYS") or 30)
REFUND_CRON_INTERVAL_SEC: int = int(os.environ.get("BIBI_REFUND_CRON_INTERVAL_SEC") or 6 * 60 * 60)


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _required_deposit_eur(max_bid_usd: float, fx: float) -> Dict[str, float]:
    """
    required = max(1000 EUR, 10% × max_bid_usd × fx)  — only when
    max_bid_usd > 10 000. Otherwise always the 1000 EUR floor.
    """
    if max_bid_usd > DEPOSIT_PCT_THRESHOLD_USD:
        pct_eur = round(max_bid_usd * DEPOSIT_PCT * fx, 2)
        required = max(MIN_DEPOSIT_EUR, pct_eur)
    else:
        required = MIN_DEPOSIT_EUR
    return {
        "required_amount_eur": round(required, 2),
        "min_floor_eur": MIN_DEPOSIT_EUR,
        "pct_eur": round(max_bid_usd * DEPOSIT_PCT * fx, 2) if max_bid_usd > 0 else 0.0,
        "fx_rate_usd_to_eur": fx,
        "calculated_from_bid": max_bid_usd > DEPOSIT_PCT_THRESHOLD_USD,
    }


def _can_advance_deal(current: str, target: str) -> bool:
    if target == current:
        return False
    return target in DEAL_STAGE_FORWARD.get(current, [])


def _can_advance_contract(current: str, target: str) -> bool:
    if target == current:
        return False
    return target in CONTRACT_LIFECYCLE_FORWARD.get(current, [])


# ─── P1.3.1 HARDENING HELPERS ────────────────────────────────────────────

async def _audit(
    event_type: str,
    entity_type: str,
    entity_id: str,
    user: Optional[Dict[str, Any]] = None,
    payload: Optional[Dict[str, Any]] = None,
    deal_id: Optional[str] = None,
    customer_id: Optional[str] = None,
) -> None:
    """
    Append-only audit trail. Никогда не роняет основной запрос.
    Коллекция: db.audit_events.

    Зачем: бухгалтерия, юр. споры, RCA при инцидентах. После prod-deploy
    эту коллекцию нельзя редактировать вручную.
    """
    try:
        db = _db()
        doc = {
            "id": f"audit_{int(datetime.now(timezone.utc).timestamp() * 1000)}_{uuid.uuid4().hex[:8]}",
            "type": event_type,
            "entity_type": entity_type,
            "entity_id": entity_id,
            "deal_id": deal_id,
            "customer_id": customer_id,
            "user_id": (user or {}).get("id"),
            "user_email": (user or {}).get("email"),
            "user_role": (user or {}).get("role"),
            "payload": payload or {},
            "at": _now_iso(),
            "ts": datetime.now(timezone.utc),
        }
        # Phase 5.3 / C-11 — db.audit_events ownership routes through
        # AuditEventsRepository. The helper retains the doc composition
        # (deterministic id, dual timestamp encoding, entity model);
        # only the Mongo round-trip migrates.
        from app.repositories import AuditEventsRepository
        await AuditEventsRepository(db).record_domain_event(doc)
    except Exception:
        import logging as _lg
        _lg.getLogger("bibi.legal.audit").warning(
            "[audit] failed to write event=%s entity=%s/%s",
            event_type, entity_type, entity_id, exc_info=True,
        )


def _ensure_deal_not_locked_after_win(deal: Dict[str, Any], action: str) -> None:
    """
    Защитный guard: после auction_won сделка заморожена для определённых
    действий (новый депозит, изменение max_bid, voluntary refund).
    Forfeit — единственный разрешённый «выход» из этого состояния.

    Args:
      deal:   документ сделки из db.deals
      action: человекочитаемое имя действия для error message

    Raises:
      HTTPException 409 если сделка locked.
    """
    if deal.get("is_locked_after_win"):
        raise HTTPException(
            409,
            f"Deal {deal.get('id')} is locked after auction win. "
            f"Action '{action}' is forbidden. Use forfeit flow instead.",
        )


# ════════════════════════════════════════════════════════════════════════════
#   4.  ROUTERS
# ════════════════════════════════════════════════════════════════════════════

router = APIRouter(prefix="/api", tags=["legal-workflow"])


# Phase 5.4 / C-4h — db_runtime accessor (module-level function reference).
# Only the `get_db` CALLABLE is imported at module-load time. Every
# `_db()` call resolves the live Motor handle via `get_db()`, preserving
# the call-time semantics of the legacy `from server import db` bridge.
# The legal_workflow module is orchestration-heavy (deal staging, audit
# sink, contract workflow) — capture timing matters more here than in
# request-scope routers.
from app.core.db_runtime import get_db  # noqa: E402 (C-4h: lazy-bridge → accessor)


def _db():
    """Lazy Mongo handle — resolves at call-time, not at module-load time.

    Phase 5.4 / C-4h — migrated to ``app.core.db_runtime.get_db()``.
    The legal_workflow module owns 38 routes (the largest non-server
    router in the project) and provides the `_audit(...)` sink that
    `financial_breakdown._audit_safe` and `payments_tracking._audit_safe`
    delegate into. Lazy semantics preserved 1:1 — only the ``get_db``
    callable is imported at top-of-file, the database handle is resolved
    fresh on every ``_db()`` invocation.
    """
    return get_db()


# ─────────── P0.1  Customer legal ──────────────────────────────────────────

@router.put("/customers/{customer_id}/legal", dependencies=[Depends(require_manager_or_admin)])
async def upsert_customer_legal(customer_id: str, payload: CustomerLegalIn = Body(...)):
    """
    Сохранить юридические поля клиента (обязательные для депозитного
    договора). Идемпотентно — повторный вызов перетирает поля.
    """
    db = _db()
    customer = await db.customers.find_one({"id": customer_id})
    if not customer:
        raise HTTPException(404, f"Customer {customer_id} not found")

    legal = payload.dict()
    legal["updated_at"] = _now_iso()

    await db.customers.update_one(
        {"id": customer_id},
        {"$set": {"legal": legal, "updated_at": _now_iso()}},
    )
    return {"success": True, "customer_id": customer_id, "legal": legal}


@router.get("/customers/{customer_id}/legal", dependencies=[Depends(require_manager_or_admin)])
async def get_customer_legal(customer_id: str):
    db = _db()
    customer = await db.customers.find_one({"id": customer_id}, {"_id": 0, "legal": 1})
    if not customer:
        raise HTTPException(404, f"Customer {customer_id} not found")
    return {"success": True, "customer_id": customer_id, "legal": customer.get("legal") or None}


@router.get("/customers/{customer_id}/legal/validate", dependencies=[Depends(require_manager_or_admin)])
async def validate_customer_legal(customer_id: str):
    """
    Проверить, что клиент готов к генерации депозитного договора:
    все 7 юридических полей заполнены и корректны.
    """
    db = _db()
    customer = await db.customers.find_one({"id": customer_id}, {"_id": 0})
    if not customer:
        raise HTTPException(404, f"Customer {customer_id} not found")

    legal = customer.get("legal") or {}
    missing: List[str] = []
    for key in ("first_name", "last_name", "egn", "national_id_no",
                "id_card_address", "id_card_issued_by", "id_card_issue_date"):
        if not legal.get(key):
            missing.append(key)

    ok = len(missing) == 0
    return {
        "success": True,
        "customer_id": customer_id,
        "ready_for_deposit_contract": ok,
        "missing_fields": missing,
    }


# ─────────── P0.2  Deal stages catalog + transition ────────────────────────

@router.get("/legal/deal-stages")
async def list_deal_stages():
    """Catalogue of all allowed stages + the transition matrix."""
    return {
        "success": True,
        "stages": DEAL_STAGES,
        "forward_transitions": DEAL_STAGE_FORWARD,
    }


@router.post("/deals/{deal_id}/advance", dependencies=[Depends(require_manager_or_admin)])
async def advance_deal_stage(
    deal_id: str,
    body: Dict[str, Any] = Body(...),
    user: Dict[str, Any] = Depends(require_manager_or_admin),
):
    """
    Перевести сделку на следующую стадию.  Body: { "to": "<stage>", "note": "..." }
    Forward-переход проверяется по DEAL_STAGE_FORWARD.  Rollback (назад)
    допустим только для admin (Wave 5: `master_admin` / `owner` упразднены —
    `admin` это top-level операционная роль BIBI).
    """
    db = _db()
    target = (body or {}).get("to")
    if not target or target not in DEAL_STAGES:
        raise HTTPException(400, f"`to` must be one of {DEAL_STAGES}")

    # find both id keys (legacy)
    deal = await db.deals.find_one({"$or": [{"id": deal_id}, {"_id": deal_id}]})
    if not deal:
        raise HTTPException(404, f"Deal {deal_id} not found")

    current = deal.get("stage") or deal.get("status") or "lead"
    role = (user.get("role") or "").lower()
    # Legacy roles (`master_admin`, `owner`) are still tolerated for back-compat
    # tokens but no new code should issue them. Canonical set is just `admin`.
    is_admin = role in ("admin", "master_admin", "owner")

    if not _can_advance_deal(current, target):
        # Backwards rollback only for admin
        if not is_admin:
            raise HTTPException(
                409,
                f"Forbidden transition {current} → {target}. "
                f"Allowed forward: {DEAL_STAGE_FORWARD.get(current, [])}",
            )

    history_entry = {
        "from": current,
        "to": target,
        "by": user.get("email") or user.get("id"),
        "by_role": role,
        "at": _now_iso(),
        "note": (body or {}).get("note"),
    }

    await db.deals.update_one(
        {"$or": [{"id": deal_id}, {"_id": deal_id}]},
        {
            "$set": {"stage": target, "status": target, "updated_at": _now_iso()},
            "$push": {"stage_history": history_entry},
        },
    )

    # ─── Wave 6: dual-write pipeline_stage + timeline event ──────────────
    try:
        from app.wave6.pipeline import map_legacy_to_pipeline as _map_pl
        from app.wave6.timeline import write_event as _tl_write, render_stage_change as _rsc

        new_pipeline = _map_pl(target)
        old_pipeline = _map_pl(current)
        await db.deals.update_one(
            {"$or": [{"id": deal_id}, {"_id": deal_id}]},
            {"$set": {"pipeline_stage": new_pipeline}},
        )

        # Mark special operational moments
        extras: Dict[str, Any] = {}
        if target == "deposit_paid":
            extras["deposit_paid_at"] = _now_iso()
        if target == "delivered":
            extras["delivered_at"] = _now_iso()
        if extras:
            await db.deals.update_one(
                {"$or": [{"id": deal_id}, {"_id": deal_id}]},
                {"$set": extras},
            )

        # Always write a "stage_changed" event (key event for the timeline)
        actor_email = user.get("email") or user.get("id") or "system"
        await _tl_write(
            db,
            deal_id=deal_id,
            event_type="stage_changed",
            message=_rsc(from_stage=current, to_stage=target, by_email=actor_email),
            i18n_key="timeline.stage_changed",
            data={
                "from_stage": current,
                "to_stage": target,
                "from_pipeline": old_pipeline,
                "to_pipeline": new_pipeline,
                "note": (body or {}).get("note"),
            },
            actor={"email": actor_email, "role": role},
        )

        # Specific pseudo-events for milestone stages so the timeline reads
        # operationally even if the legacy `advance` is the only API used.
        if target == "auction_won":
            await _tl_write(
                db, deal_id=deal_id, event_type="auction_won",
                message=f"Auction won (by {actor_email})",
                i18n_key="timeline.auction_won",
                data={}, actor={"email": actor_email, "role": role},
            )
        elif target == "auction_lost":
            await _tl_write(
                db, deal_id=deal_id, event_type="auction_lost",
                message=f"Auction lost (by {actor_email})",
                i18n_key="timeline.auction_lost",
                data={}, actor={"email": actor_email, "role": role},
            )
        elif target == "in_transit_to_rotterdam":
            await _tl_write(
                db, deal_id=deal_id, event_type="shipping_started",
                message=f"Shipping started — heading to Rotterdam (by {actor_email})",
                i18n_key="timeline.shipping_started",
                data={}, actor={"email": actor_email, "role": role},
            )
        elif target == "customs_calculated":
            await _tl_write(
                db, deal_id=deal_id, event_type="customs_cleared",
                message=f"Customs calculated (by {actor_email})",
                i18n_key="timeline.customs_cleared",
                data={}, actor={"email": actor_email, "role": role},
            )
        elif target == "delivered":
            await _tl_write(
                db, deal_id=deal_id, event_type="delivered",
                message=f"Vehicle delivered (by {actor_email})",
                i18n_key="timeline.delivered",
                data={}, actor={"email": actor_email, "role": role},
            )
        elif target == "cancelled":
            await _tl_write(
                db, deal_id=deal_id, event_type="cancelled",
                message=f"Deal cancelled (by {actor_email})",
                i18n_key="timeline.cancelled",
                data={"note": (body or {}).get("note")},
                actor={"email": actor_email, "role": role},
            )
    except Exception as _w6_err:
        # Wave 6 hooks MUST NEVER break the underlying transition.
        import logging as _lg
        _lg.getLogger("bibi.wave6.hook").warning(
            "[wave6] advance_deal_stage hook failed: %s", _w6_err,
        )

    return {"success": True, "deal_id": deal_id, "from": current, "to": target}


# ─────────── P0.3  Deposit calculation & lifecycle ─────────────────────────

@router.post("/legal/deposit/calculate")
async def calculate_required_deposit(payload: DepositCalcIn = Body(...)):
    """
    Чистая утилита: посчитать обязательный депозит по правилу
      required_eur = max(1000, max_bid_usd × 0.10 × fx)  — если max_bid > $10k
      required_eur = 1000                                — иначе.
    """
    fx = payload.fx_rate_usd_to_eur or DEFAULT_FX_USD_TO_EUR
    return {
        "success": True,
        "input": payload.dict(),
        **_required_deposit_eur(payload.max_bid_usd, fx),
    }


@router.post("/legal/deposits", dependencies=[Depends(require_manager_or_admin)])
async def create_legal_deposit(
    payload: DepositCreateIn = Body(...),
    user: Dict[str, Any] = Depends(require_manager_or_admin),
):
    """
    Создать депозит с расчётом required_amount_eur.  Не подтверждает оплату —
    статус остаётся `pending` пока менеджер не вызовет /confirm-payment.
    """
    db = _db()
    customer = await db.customers.find_one({"id": payload.customer_id})
    if not customer:
        raise HTTPException(404, f"Customer {payload.customer_id} not found")

    # P1.3.1 — block new deposits on locked deals
    if payload.deal_id:
        deal = await db.deals.find_one(
            {"$or": [{"id": payload.deal_id}, {"_id": payload.deal_id}]},
            {"is_locked_after_win": 1, "id": 1, "stage": 1},
        )
        if deal:
            _ensure_deal_not_locked_after_win(deal, "create new deposit")

    fx = payload.fx_rate_usd_to_eur or DEFAULT_FX_USD_TO_EUR
    calc = _required_deposit_eur(payload.max_bid_usd, fx)

    deposit_id = f"dep_{int(datetime.now(timezone.utc).timestamp())}_{uuid.uuid4().hex[:8]}"
    deposit = {
        "id": deposit_id,
        "customer_id": payload.customer_id,
        "deal_id": payload.deal_id,
        "currency": "EUR",
        "max_bid_usd": payload.max_bid_usd,
        "fx_rate_usd_to_eur": fx,
        "required_amount_eur": calc["required_amount_eur"],
        "calculated_from_bid": calc["calculated_from_bid"],
        "paid_amount_eur": payload.paid_amount_eur,
        "status": "pending",
        "note": payload.note,
        "created_by": user.get("email") or user.get("id"),
        "created_at": _now_iso(),
        "updated_at": _now_iso(),
        "history": [
            {"event": "created", "at": _now_iso(),
             "by": user.get("email") or user.get("id"), "data": calc},
        ],
    }

    # Помечаем клиента и сделку максимальной ставкой
    await db.customers.update_one(
        {"id": payload.customer_id},
        {"$set": {"max_bid_usd": payload.max_bid_usd, "updated_at": _now_iso()}},
    )
    if payload.deal_id:
        await db.deals.update_one(
            {"$or": [{"id": payload.deal_id}, {"_id": payload.deal_id}]},
            {"$set": {"max_bid_usd": payload.max_bid_usd, "updated_at": _now_iso()}},
        )

    await db.legal_deposits.insert_one(deposit)
    deposit.pop("_id", None)
    await _audit(
        event_type="deposit_created", entity_type="legal_deposit", entity_id=deposit_id,
        user=user, deal_id=payload.deal_id, customer_id=payload.customer_id,
        payload={"max_bid_usd": payload.max_bid_usd, "fx": fx,
                 "required_eur": calc["required_amount_eur"],
                 "paid_amount_eur": payload.paid_amount_eur},
    )

    # ─── Wave 6: timeline event — deposit_requested ────────────────────────
    if payload.deal_id:
        try:
            from app.wave6.timeline import write_event as _tl_write
            await _tl_write(
                db,
                deal_id=payload.deal_id,
                event_type="deposit_requested",
                message=f"Deposit requested: €{calc['required_amount_eur']:,.2f} (max bid ${payload.max_bid_usd:,.0f})",
                i18n_key="timeline.deposit_requested",
                data={
                    "deposit_id": deposit_id,
                    "required_eur": calc["required_amount_eur"],
                    "max_bid_usd": payload.max_bid_usd,
                },
                actor={"email": user.get("email"), "role": user.get("role")},
            )
        except Exception:
            pass

    # Wave 4 — auto-convert any open leads tied to this customer.
    # When a deposit is created, the contact is, by definition, no longer a
    # "potential". Back-link any leads matching by email / phone / explicit
    # customerId to this customer card and mark them as `won` (converted).
    # Silent best-effort — never blocks deposit creation.
    try:
        match_clauses: List[Dict[str, Any]] = [{"customerId": payload.customer_id}]
        if customer.get("email"):
            match_clauses.append({"email": customer["email"]})
        if customer.get("phone"):
            match_clauses.append({"phone": customer["phone"]})
        await db.leads.update_many(
            {
                "$or": match_clauses,
                # don't downgrade already-closed leads (lost/archived)
                "status": {"$nin": ["won", "lost", "archived"]},
            },
            {"$set": {
                "customerId": payload.customer_id,
                "status": "won",
                "convertedAt": _now_iso(),
                "convertedVia": "deposit_created",
                "updated_at": _now_iso(),
            }},
        )
    except Exception as _e:
        import logging as _logging
        _logging.getLogger("bibi.legal").warning(
            f"[deposit→lead auto-convert] best-effort failed: {_e}"
        )

    return {"success": True, "deposit": deposit}


@router.get("/legal/deposits/{deposit_id}", dependencies=[Depends(require_manager_or_admin)])
async def get_legal_deposit(deposit_id: str):
    db = _db()
    d = await db.legal_deposits.find_one({"id": deposit_id}, {"_id": 0})
    if not d:
        raise HTTPException(404, f"Deposit {deposit_id} not found")
    return {"success": True, "deposit": d}


@router.put("/legal/deposits/{deposit_id}/confirm-payment", dependencies=[Depends(require_manager_or_admin)])
async def confirm_deposit_payment(
    deposit_id: str,
    payload: DepositConfirmIn = Body(default={}),
    user: Dict[str, Any] = Depends(require_manager_or_admin),
):
    """
    Менеджер вручную подтверждает: «деньги пришли в банк».
    Запрещает подтверждать, если paid_amount_eur < required_amount_eur.
    Стартует 30-дневный таймер поиска авто.
    """
    db = _db()
    d = await db.legal_deposits.find_one({"id": deposit_id})
    if not d:
        raise HTTPException(404, f"Deposit {deposit_id} not found")

    if d.get("status") != "pending":
        raise HTTPException(409, f"Deposit is in status `{d.get('status')}` — cannot confirm")

    # P1.3.1 — block confirm on locked deals (post-win freeze)
    if d.get("deal_id"):
        deal = await db.deals.find_one(
            {"$or": [{"id": d["deal_id"]}, {"_id": d["deal_id"]}]},
            {"is_locked_after_win": 1, "id": 1, "stage": 1},
        )
        if deal:
            _ensure_deal_not_locked_after_win(deal, "confirm deposit payment")

    paid = float(d.get("paid_amount_eur") or 0)
    required = float(d.get("required_amount_eur") or 0)
    if paid + 0.01 < required:
        raise HTTPException(
            422,
            f"Paid amount ({paid} EUR) is below required ({required} EUR). "
            f"Update paid_amount_eur first.",
        )

    bank_at = (payload.bank_received_at or _now_iso())
    now = _now_iso()

    # 30-дневный таймер стартует ОТ момента поступления денег
    refund_eligible_at = (datetime.fromisoformat(bank_at.replace("Z", "+00:00"))
                          if "Z" in bank_at else datetime.fromisoformat(bank_at))
    refund_eligible_iso = (refund_eligible_at.replace(tzinfo=refund_eligible_at.tzinfo
                                                       or timezone.utc)
                            ).isoformat()
    # REFUND_DEADLINE_DAYS days
    from datetime import timedelta as _td
    deadline = (refund_eligible_at + _td(days=REFUND_DEADLINE_DAYS))
    if deadline.tzinfo is None:
        deadline = deadline.replace(tzinfo=timezone.utc)

    await db.legal_deposits.update_one(
        {"id": deposit_id},
        {
            "$set": {
                "status": "paid_confirmed",
                "bank_received_at": bank_at,
                "search_timer_started_at": refund_eligible_iso,
                "search_timer_deadline_at": deadline.isoformat(),
                "confirmed_by": user.get("email") or user.get("id"),
                "confirmed_at": now,
                "updated_at": now,
            },
            "$push": {
                "history": {
                    "event": "paid_confirmed",
                    "at": now,
                    "by": user.get("email") or user.get("id"),
                    "data": {"bank_received_at": bank_at, "note": payload.note},
                }
            },
        },
    )

    # Best-effort: подвинуть сделку в стадию `deposit_paid`
    if d.get("deal_id"):
        await db.deals.update_one(
            {"$or": [{"id": d["deal_id"]}, {"_id": d["deal_id"]}]},
            {
                "$set": {
                    "stage": "deposit_paid",
                    "status": "deposit_paid",
                    "pipeline_stage": "deposit_paid",
                    "deposit_paid_at": now,
                    "updated_at": now,
                },
                "$push": {"stage_history": {
                    "from": "deposit_contract_signed", "to": "deposit_paid",
                    "by": user.get("email") or user.get("id"), "by_role": user.get("role"),
                    "at": now, "note": "auto-advance after deposit confirmed",
                }},
            },
        )

        # ─── Wave 6: timeline event — deposit_confirmed ────────────────
        try:
            from app.wave6.timeline import write_event as _tl_write, render_deposit_confirmed as _rdc
            await _tl_write(
                db,
                deal_id=d["deal_id"],
                event_type="deposit_confirmed",
                message=_rdc(amount_eur=paid, by_email=user.get("email") or "manager"),
                i18n_key="timeline.deposit_confirmed",
                data={
                    "deposit_id": deposit_id,
                    "paid_eur": paid,
                    "required_eur": required,
                    "bank_received_at": bank_at,
                },
                actor={"email": user.get("email"), "role": user.get("role")},
            )
        except Exception:
            pass

    await _audit(
        event_type="deposit_paid_confirmed", entity_type="legal_deposit",
        entity_id=deposit_id, user=user,
        deal_id=d.get("deal_id"), customer_id=d.get("customer_id"),
        payload={
            "paid_amount_eur": paid,
            "required_amount_eur": required,
            "bank_received_at": bank_at,
            "search_timer_deadline_at": deadline.isoformat(),
            "fx_rate_usd_to_eur": d.get("fx_rate_usd_to_eur"),
            "note": payload.note,
        },
    )
    return {"success": True, "deposit_id": deposit_id, "status": "paid_confirmed",
            "search_timer_deadline_at": deadline.isoformat()}


@router.post("/legal/deposits/{deposit_id}/forfeit/request", dependencies=[Depends(require_manager_or_admin)])
async def request_deposit_forfeit(
    deposit_id: str,
    body: Dict[str, Any] = Body(default={}),
    user: Dict[str, Any] = Depends(require_manager_or_admin),
):
    """Менеджер запрашивает сгорание депозита (клиент отказался ПОСЛЕ выигрыша).
    Переводит в `forfeit_pending_teamlead`."""
    db = _db()
    d = await db.legal_deposits.find_one({"id": deposit_id})
    if not d:
        raise HTTPException(404, f"Deposit {deposit_id} not found")
    if d.get("status") != "paid_confirmed":
        raise HTTPException(409, f"Forfeit allowed only from `paid_confirmed`, current: {d.get('status')}")

    now = _now_iso()
    await db.legal_deposits.update_one(
        {"id": deposit_id},
        {
            "$set": {"status": "forfeit_pending_teamlead", "forfeit_reason": body.get("reason"),
                     "forfeit_requested_by": user.get("email") or user.get("id"),
                     "forfeit_requested_at": now, "updated_at": now},
            "$push": {"history": {"event": "forfeit_requested", "at": now,
                                  "by": user.get("email") or user.get("id"),
                                  "data": {"reason": body.get("reason")}}}},
    )
    await _audit(
        event_type="deposit_forfeit_requested", entity_type="legal_deposit",
        entity_id=deposit_id, user=user,
        deal_id=d.get("deal_id"), customer_id=d.get("customer_id"),
        payload={"reason": body.get("reason"), "from_status": "paid_confirmed"},
    )
    return {"success": True, "deposit_id": deposit_id, "status": "forfeit_pending_teamlead"}


@router.post("/legal/deposits/{deposit_id}/forfeit/teamlead-approve", dependencies=[Depends(require_admin)])
async def teamlead_approve_forfeit(
    deposit_id: str,
    user: Dict[str, Any] = Depends(require_admin),
):
    """Тимлид (или admin) подтверждает сгорание → ждём финального админ-апрува."""
    db = _db()
    d = await db.legal_deposits.find_one({"id": deposit_id})
    if not d:
        raise HTTPException(404, f"Deposit {deposit_id} not found")
    if d.get("status") != "forfeit_pending_teamlead":
        raise HTTPException(409, f"Wrong state: {d.get('status')}")
    now = _now_iso()
    await db.legal_deposits.update_one(
        {"id": deposit_id},
        {"$set": {"status": "forfeit_pending_admin", "teamlead_approved_by": user.get("email") or user.get("id"),
                  "teamlead_approved_at": now, "updated_at": now},
         "$push": {"history": {"event": "teamlead_approved_forfeit", "at": now,
                               "by": user.get("email") or user.get("id"), "data": None}}},
    )
    await _audit(
        event_type="deposit_forfeit_teamlead_approved", entity_type="legal_deposit",
        entity_id=deposit_id, user=user,
        deal_id=d.get("deal_id"), customer_id=d.get("customer_id"),
        payload={"prev_status": "forfeit_pending_teamlead"},
    )
    return {"success": True, "deposit_id": deposit_id, "status": "forfeit_pending_admin"}


@router.post("/legal/deposits/{deposit_id}/forfeit/admin-finalize", dependencies=[Depends(require_admin)])
async def admin_finalize_forfeit(
    deposit_id: str,
    user: Dict[str, Any] = Depends(require_admin),
):
    """Финальное админ-подтверждение → депозит сгорает.

    Wave 5: BIBI canonical roles = {admin, team_lead, manager, customer}.
    There is no `master_admin` — admin is the top-level operator and
    signs off the burn after team-lead approval (two-eyes principle).
    """
    db = _db()
    d = await db.legal_deposits.find_one({"id": deposit_id})
    if not d:
        raise HTTPException(404, f"Deposit {deposit_id} not found")
    if d.get("status") != "forfeit_pending_admin":
        raise HTTPException(409, f"Wrong state: {d.get('status')}")
    now = _now_iso()
    await db.legal_deposits.update_one(
        {"id": deposit_id},
        {"$set": {"status": "forfeited", "admin_finalized_by": user.get("email") or user.get("id"),
                  "admin_finalized_at": now, "updated_at": now},
         "$push": {"history": {"event": "forfeited", "at": now,
                               "by": user.get("email") or user.get("id"), "data": None}}},
    )
    await _audit(
        event_type="deposit_forfeited", entity_type="legal_deposit",
        entity_id=deposit_id, user=user,
        deal_id=d.get("deal_id"), customer_id=d.get("customer_id"),
        payload={"paid_amount_eur": float(d.get("paid_amount_eur") or 0)},
    )
    return {"success": True, "deposit_id": deposit_id, "status": "forfeited"}


# ═════════════════════════════════════════════════════════════════════════
#   P1.1  REFUND FLOW  (30-day cron + voluntary + approve + execute)
# ═════════════════════════════════════════════════════════════════════════
#
#   Statuses (добавлены в DEPOSIT_STATUSES):
#     paid_confirmed → refund_pending_30d   (AUTO, cron, 30 дней без auction_won)
#     paid_confirmed → refund_pending_voluntary (manager, до auction_won)
#     refund_pending_*  → refund_approved    (admin)
#     refund_pending_*  → refund_rejected    (admin)
#     refund_approved   → refunded           (admin/manager, execute)
#
#   Rule: если deal.stage ∈ STAGES_AFTER_AUCTION_WIN → refund ЗАПРЕЩЁН,
#         только forfeit flow (уже реализован выше).

class _RefundRequestIn(BaseModel):
    reason: Optional[str] = None
    note: Optional[str] = None


class _RefundApproveIn(BaseModel):
    note: Optional[str] = None


class _RefundRejectIn(BaseModel):
    reason: str = Field(..., min_length=2, max_length=500)


class _RefundExecuteIn(BaseModel):
    method: str = Field("bank_manual", description="stripe | bank_manual")
    stripe_payment_intent_id: Optional[str] = None
    bank_proof_url: Optional[str] = None
    note: Optional[str] = None


async def _emit_safe(event: str, payload: Dict[str, Any]) -> None:
    """Best-effort emit to notifications.bus; никогда не роняет транзакцию."""
    try:
        from notifications import bus as _bus  # type: ignore
        await _bus.emit(event, payload)
    except Exception:
        import logging
        logging.getLogger("bibi.legal").warning(
            "[legal] notifications.bus.emit(%s) failed", event, exc_info=True
        )


def _deal_is_after_win(deal: Optional[Dict[str, Any]]) -> bool:
    if not deal:
        return False
    stage = deal.get("stage") or deal.get("status") or ""
    return stage in STAGES_AFTER_AUCTION_WIN


@router.post("/legal/deposits/{deposit_id}/refund/request",
             dependencies=[Depends(require_manager_or_admin)])
async def request_deposit_refund(
    deposit_id: str,
    body: _RefundRequestIn = Body(default=_RefundRequestIn()),
    user: Dict[str, Any] = Depends(require_manager_or_admin),
):
    """
    Добровольный возврат депозита ДО выигрыша авто.
    Разрешён только если deal.stage < auction_won и status=paid_confirmed.
    Переводит депозит в refund_pending_voluntary.
    """
    db = _db()
    d = await db.legal_deposits.find_one({"id": deposit_id})
    if not d:
        raise HTTPException(404, f"Deposit {deposit_id} not found")

    if d.get("status") != "paid_confirmed":
        raise HTTPException(409, f"Voluntary refund allowed only from `paid_confirmed`, current: {d.get('status')}")

    # Если сделка уже после auction_won — только forfeit flow
    if d.get("deal_id"):
        deal = await db.deals.find_one(
            {"$or": [{"id": d["deal_id"]}, {"_id": d["deal_id"]}]}, {"stage": 1, "status": 1}
        )
        if _deal_is_after_win(deal):
            raise HTTPException(
                422,
                "Deal is already past auction_won. Voluntary refund is forbidden — use forfeit flow.",
            )

    now = _now_iso()
    await db.legal_deposits.update_one(
        {"id": deposit_id},
        {"$set": {
            "status": "refund_pending_voluntary",
            "refund_reason": body.reason or "client_voluntary",
            "refund_requested_by": user.get("email") or user.get("id"),
            "refund_requested_at": now,
            "updated_at": now,
         },
         "$push": {"history": {"event": "refund_requested_voluntary", "at": now,
                               "by": user.get("email") or user.get("id"),
                               "data": {"reason": body.reason, "note": body.note}}}},
    )
    await _emit_safe("deposit_refund_requested", {
        "depositId": deposit_id, "dealId": d.get("deal_id"),
        "customerId": d.get("customer_id"), "kind": "voluntary",
        "reason": body.reason, "by": user.get("email") or user.get("id"),
    })
    await _audit(
        event_type="deposit_refund_requested_voluntary", entity_type="legal_deposit",
        entity_id=deposit_id, user=user,
        deal_id=d.get("deal_id"), customer_id=d.get("customer_id"),
        payload={"reason": body.reason, "note": body.note,
                 "paid_amount_eur": float(d.get("paid_amount_eur") or 0)},
    )
    return {"success": True, "deposit_id": deposit_id, "status": "refund_pending_voluntary"}


@router.post("/legal/deposits/{deposit_id}/refund/approve",
             dependencies=[Depends(require_admin)])
async def approve_deposit_refund(
    deposit_id: str,
    body: _RefundApproveIn = Body(default=_RefundApproveIn()),
    user: Dict[str, Any] = Depends(require_admin),
):
    """Admin одобряет возврат (из любого refund_pending_*). Статус → refund_approved."""
    db = _db()
    d = await db.legal_deposits.find_one({"id": deposit_id})
    if not d:
        raise HTTPException(404, f"Deposit {deposit_id} not found")

    if d.get("status") not in ("refund_pending_30d", "refund_pending_voluntary"):
        raise HTTPException(409, f"Approve allowed only from refund_pending_*, current: {d.get('status')}")

    now = _now_iso()
    await db.legal_deposits.update_one(
        {"id": deposit_id},
        {"$set": {
            "status": "refund_approved",
            "refund_approved_by": user.get("email") or user.get("id"),
            "refund_approved_at": now,
            "updated_at": now,
         },
         "$push": {"history": {"event": "refund_approved", "at": now,
                               "by": user.get("email") or user.get("id"),
                               "data": {"note": body.note}}}},
    )
    await _emit_safe("deposit_refund_approved", {
        "depositId": deposit_id, "dealId": d.get("deal_id"),
        "customerId": d.get("customer_id"),
        "by": user.get("email") or user.get("id"),
    })
    await _audit(
        event_type="deposit_refund_approved", entity_type="legal_deposit",
        entity_id=deposit_id, user=user,
        deal_id=d.get("deal_id"), customer_id=d.get("customer_id"),
        payload={"note": body.note},
    )
    return {"success": True, "deposit_id": deposit_id, "status": "refund_approved"}


@router.post("/legal/deposits/{deposit_id}/refund/reject",
             dependencies=[Depends(require_admin)])
async def reject_deposit_refund(
    deposit_id: str,
    body: _RefundRejectIn = Body(...),
    user: Dict[str, Any] = Depends(require_admin),
):
    """Admin отклоняет возврат. Депозит возвращается в paid_confirmed."""
    db = _db()
    d = await db.legal_deposits.find_one({"id": deposit_id})
    if not d:
        raise HTTPException(404, f"Deposit {deposit_id} not found")

    if d.get("status") not in ("refund_pending_30d", "refund_pending_voluntary"):
        raise HTTPException(409, f"Reject allowed only from refund_pending_*, current: {d.get('status')}")

    now = _now_iso()
    await db.legal_deposits.update_one(
        {"id": deposit_id},
        {"$set": {
            "status": "paid_confirmed",  # откат
            "refund_rejected_by": user.get("email") or user.get("id"),
            "refund_rejected_at": now,
            "refund_rejection_reason": body.reason,
            "updated_at": now,
         },
         "$push": {"history": {"event": "refund_rejected", "at": now,
                               "by": user.get("email") or user.get("id"),
                               "data": {"reason": body.reason}}}},
    )
    await _emit_safe("deposit_refund_rejected", {
        "depositId": deposit_id, "dealId": d.get("deal_id"),
        "customerId": d.get("customer_id"),
        "reason": body.reason,
        "by": user.get("email") or user.get("id"),
    })
    await _audit(
        event_type="deposit_refund_rejected", entity_type="legal_deposit",
        entity_id=deposit_id, user=user,
        deal_id=d.get("deal_id"), customer_id=d.get("customer_id"),
        payload={"reason": body.reason, "rolled_back_to": "paid_confirmed"},
    )
    return {"success": True, "deposit_id": deposit_id, "status": "paid_confirmed", "reason": body.reason}


@router.post("/legal/deposits/{deposit_id}/refund/execute",
             dependencies=[Depends(require_admin)])
async def execute_deposit_refund(
    deposit_id: str,
    body: _RefundExecuteIn = Body(default=_RefundExecuteIn()),
    user: Dict[str, Any] = Depends(require_admin),
):
    """
    Выполнить фактический возврат:
      method="stripe" → вызвать Stripe Refund API (async, isolated)
      method="bank_manual" → просто пометить refunded с proof-ссылкой
    Допустимо только из refund_approved.
    Идемпотентно: повтор возврата на status=refunded → 409.
    """
    db = _db()
    d = await db.legal_deposits.find_one({"id": deposit_id})
    if not d:
        raise HTTPException(404, f"Deposit {deposit_id} not found")

    if d.get("status") == "refunded":
        raise HTTPException(409, "Already refunded")
    if d.get("status") != "refund_approved":
        raise HTTPException(409, f"Execute allowed only from refund_approved, current: {d.get('status')}")

    now = _now_iso()
    paid_eur = float(d.get("paid_amount_eur") or 0)

    stripe_refund_id: Optional[str] = None
    stripe_error: Optional[str] = None

    if body.method == "stripe":
        pi_id = body.stripe_payment_intent_id or d.get("stripe_payment_intent_id")
        if not pi_id:
            raise HTTPException(422, "stripe_payment_intent_id is required for method=stripe")
        try:
            import stripe as _stripe  # type: ignore
            # Ключ берётся либо из env, либо из БД настроек (как в server.py)
            key = (os.environ.get("STRIPE_SECRET_KEY")
                   or os.environ.get("STRIPE_API_KEY"))
            if not key:
                cfg = await db.settings.find_one({"key": "stripe"}) or {}
                key = (cfg.get("secretKey") if cfg else None)
            if not key:
                raise RuntimeError("Stripe secret key not configured")
            _stripe.api_key = key
            import asyncio as _asyncio
            refund = await _asyncio.to_thread(
                lambda: _stripe.Refund.create(
                    payment_intent=pi_id,
                    amount=int(round(paid_eur * 100)),
                )
            )
            stripe_refund_id = getattr(refund, "id", None) or (refund.get("id") if isinstance(refund, dict) else None)
        except Exception as ex:
            stripe_error = str(ex)
            # Статус остаётся refund_approved, пишем ошибку — ручная доразборка
            await db.legal_deposits.update_one(
                {"id": deposit_id},
                {"$set": {"refund_last_error": stripe_error, "updated_at": now},
                 "$push": {"history": {"event": "refund_execute_failed", "at": now,
                                        "by": user.get("email") or user.get("id"),
                                        "data": {"method": body.method, "error": stripe_error}}}},
            )
            raise HTTPException(502, f"Stripe refund failed: {stripe_error}")

    # Успех → status = refunded
    set_doc: Dict[str, Any] = {
        "status": "refunded",
        "refund_method": body.method,
        "refunded_at": now,
        "refunded_by": user.get("email") or user.get("id"),
        "refund_bank_proof_url": body.bank_proof_url,
        "stripe_refund_id": stripe_refund_id,
        "refund_last_error": None,
        "updated_at": now,
    }
    await db.legal_deposits.update_one(
        {"id": deposit_id},
        {"$set": set_doc,
         "$push": {"history": {"event": "refunded", "at": now,
                               "by": user.get("email") or user.get("id"),
                               "data": {"method": body.method,
                                        "stripe_refund_id": stripe_refund_id,
                                        "bank_proof_url": body.bank_proof_url,
                                        "note": body.note}}}},
    )
    await _emit_safe("deposit_refunded", {
        "depositId": deposit_id, "dealId": d.get("deal_id"),
        "customerId": d.get("customer_id"),
        "amount_eur": paid_eur, "method": body.method,
        "stripe_refund_id": stripe_refund_id,
    })
    await _audit(
        event_type="deposit_refunded", entity_type="legal_deposit",
        entity_id=deposit_id, user=user,
        deal_id=d.get("deal_id"), customer_id=d.get("customer_id"),
        payload={"method": body.method, "amount_eur": paid_eur,
                 "stripe_refund_id": stripe_refund_id,
                 "bank_proof_url": body.bank_proof_url},
    )
    return {"success": True, "deposit_id": deposit_id, "status": "refunded",
            "method": body.method, "stripe_refund_id": stripe_refund_id}


# ────── REFUND CRON — 30 days without car ──────────────────────────────
async def scan_refund_eligible_deposits() -> Dict[str, Any]:
    """
    Проходит по всем депозитам status=paid_confirmed,
    у которых search_timer_deadline_at <= now и сделка ещё не после выигрыша.
    Переводит в refund_pending_30d. Идемпотентно (использует $set на конкретный статус).
    """
    db = _db()
    now = datetime.now(timezone.utc)
    promoted = 0
    skipped_after_win = 0
    checked = 0

    # Берём iso-строки (у нас search_timer_deadline_at хранится как iso)
    query = {
        "status": "paid_confirmed",
        "search_timer_deadline_at": {"$lte": now.isoformat()},
    }
    async for dep in db.legal_deposits.find(query):
        checked += 1
        deal = None
        if dep.get("deal_id"):
            deal = await db.deals.find_one(
                {"$or": [{"id": dep["deal_id"]}, {"_id": dep["deal_id"]}]},
                {"stage": 1, "status": 1},
            )
        if _deal_is_after_win(deal):
            skipped_after_win += 1
            continue

        # Идемпотентность: обновляем только если статус всё ещё paid_confirmed
        res = await db.legal_deposits.update_one(
            {"id": dep["id"], "status": "paid_confirmed"},
            {"$set": {
                "status": "refund_pending_30d",
                "refund_reason": "no_car_found_30_days",
                "refund_eligible_at": now.isoformat(),
                "updated_at": now.isoformat(),
             },
             "$push": {"history": {"event": "auto_refund_eligible", "at": now.isoformat(),
                                    "by": "cron", "data": {"days": REFUND_DEADLINE_DAYS}}}},
        )
        if res.modified_count:
            promoted += 1
            await _emit_safe("deposit_refund_eligible", {
                "depositId": dep["id"], "dealId": dep.get("deal_id"),
                "customerId": dep.get("customer_id"),
                "days": REFUND_DEADLINE_DAYS,
            })

    return {"checked": checked, "promoted": promoted, "skipped_after_win": skipped_after_win,
            "at": now.isoformat()}


_cron_started = False


async def refund_eligibility_cron_loop():
    """Фоновый цикл: сканирует депозиты каждые REFUND_CRON_INTERVAL_SEC."""
    import asyncio as _asyncio
    import logging as _lg
    log = _lg.getLogger("bibi.legal.refund-cron")
    log.info("[refund-cron] starting (every %ss, deadline=%sd)",
             REFUND_CRON_INTERVAL_SEC, REFUND_DEADLINE_DAYS)
    # Небольшая задержка чтобы сервер поднялся
    await _asyncio.sleep(15)
    while True:
        try:
            r = await scan_refund_eligible_deposits()
            if r.get("promoted"):
                log.info("[refund-cron] promoted=%s checked=%s skipped_after_win=%s",
                         r["promoted"], r["checked"], r["skipped_after_win"])
        except Exception:
            log.exception("[refund-cron] scan failed")
        await _asyncio.sleep(REFUND_CRON_INTERVAL_SEC)


def start_refund_cron_once():
    """Запустить cron один раз (идемпотентно)."""
    global _cron_started
    if _cron_started:
        return
    _cron_started = True
    import asyncio as _asyncio
    _asyncio.create_task(refund_eligibility_cron_loop())


@router.post("/legal/refund/scan-now", dependencies=[Depends(require_admin)])
async def refund_scan_now(_: Dict[str, Any] = Depends(require_admin)):
    """Ручной запуск сканирования (для отладки и E2E-тестов)."""
    res = await scan_refund_eligible_deposits()
    return {"success": True, **res}


# ─────────── P0.4  Contracts v2 ────────────────────────────────────────────

@router.post("/contracts2", dependencies=[Depends(require_manager_or_admin)])
async def create_contract_v2(
    payload: ContractV2CreateIn = Body(...),
    user: Dict[str, Any] = Depends(require_manager_or_admin),
):
    """
    Создать контракт.  Если type=='deposit' — обязательно требуем, чтобы
    у клиента были заполнены legal-поля (P0.1).
    """
    db = _db()
    customer = await db.customers.find_one({"id": payload.customer_id})
    if not customer:
        raise HTTPException(404, f"Customer {payload.customer_id} not found")

    if payload.type == "deposit":
        legal = customer.get("legal") or {}
        missing = [k for k in ("first_name", "last_name", "egn", "national_id_no",
                                "id_card_address", "id_card_issued_by", "id_card_issue_date")
                   if not legal.get(k)]
        if missing:
            raise HTTPException(
                422,
                f"Customer is missing legal fields, cannot create deposit contract. Missing: {missing}",
            )

    contract_id = f"contract2_{int(datetime.now(timezone.utc).timestamp())}_{uuid.uuid4().hex[:8]}"
    now = _now_iso()
    contract = {
        "id": contract_id,
        "type": payload.type,
        "deal_id": payload.deal_id,
        "customer_id": payload.customer_id,
        "lifecycle": "draft",
        "items": payload.items,
        "notes": payload.notes,
        "pdf_url": None,
        "signed_pdf_url": None,
        "company_signed_pdf_url": None,
        "snapshot_customer_legal": customer.get("legal") if payload.type == "deposit" else None,
        "history": [{"event": "created", "lifecycle": "draft",
                     "by": user.get("email") or user.get("id"), "at": now}],
        "created_by": user.get("email") or user.get("id"),
        "created_at": now,
        "updated_at": now,
    }
    await db.contracts_v2.insert_one(contract)
    contract.pop("_id", None)

    # Привязываем contract id к сделке
    if payload.deal_id:
        if payload.type == "deposit":
            field = "deposit_contract_id"
            stage_target = "deposit_contract_drafted"
        elif payload.type == "final":
            field = "final_contract_id"
            stage_target = "final_contract_sent"
        else:
            field = "purchase_contract_id"
            stage_target = None

        update: Dict[str, Any] = {"$set": {field: contract_id, "updated_at": now}}
        if stage_target:
            update["$set"]["stage"] = stage_target
            update["$set"]["status"] = stage_target
            update.setdefault("$push", {})["stage_history"] = {
                "from": None, "to": stage_target,
                "by": user.get("email") or user.get("id"), "by_role": user.get("role"),
                "at": now, "note": f"contract2 {payload.type} draft created",
            }
        await db.deals.update_one({"$or": [{"id": payload.deal_id}, {"_id": payload.deal_id}]}, update)

    await _audit(
        event_type="contract_created", entity_type="contract_v2",
        entity_id=contract_id, user=user,
        deal_id=payload.deal_id, customer_id=payload.customer_id,
        payload={"type": payload.type, "lifecycle": "draft",
                 "items_count": len(payload.items or [])},
    )
    return {"success": True, "contract": contract}


@router.get("/contracts2/{contract_id}", dependencies=[Depends(require_manager_or_admin)])
async def get_contract_v2(contract_id: str):
    db = _db()
    c = await db.contracts_v2.find_one({"id": contract_id}, {"_id": 0})
    if not c:
        raise HTTPException(404, f"Contract {contract_id} not found")
    return {"success": True, "contract": c}


@router.get("/contracts2", dependencies=[Depends(require_manager_or_admin)])
async def list_contracts_v2(deal_id: Optional[str] = None, customer_id: Optional[str] = None,
                              type: Optional[str] = None, lifecycle: Optional[str] = None,
                              limit: int = 50):
    db = _db()
    q: Dict[str, Any] = {}
    if deal_id:
        q["deal_id"] = deal_id
    if customer_id:
        q["customer_id"] = customer_id
    if type:
        q["type"] = type
    if lifecycle:
        q["lifecycle"] = lifecycle
    cursor = db.contracts_v2.find(q, {"_id": 0}).sort("created_at", -1).limit(limit)
    items = await cursor.to_list(length=limit)
    return {"success": True, "data": items, "total": len(items)}


@router.post("/contracts2/{contract_id}/transition", dependencies=[Depends(require_manager_or_admin)])
async def transition_contract_v2(
    contract_id: str,
    payload: ContractV2TransitionIn = Body(...),
    user: Dict[str, Any] = Depends(require_manager_or_admin),
):
    """
    Перевести контракт в новый lifecycle-статус с проверкой матрицы переходов.
    Допустимые: draft → sent_to_client → client_signed → company_signed_stamped → finalized.
    """
    db = _db()
    c = await db.contracts_v2.find_one({"id": contract_id})
    if not c:
        raise HTTPException(404, f"Contract {contract_id} not found")

    target = payload.to
    if target not in CONTRACT_LIFECYCLE and target != "cancelled":
        raise HTTPException(400, f"`to` must be one of {CONTRACT_LIFECYCLE} (or cancelled)")

    current = c.get("lifecycle") or "draft"
    role = (user.get("role") or "").lower()
    is_admin = role in ("admin", "master_admin", "owner")

    if not _can_advance_contract(current, target):
        if not is_admin:
            raise HTTPException(
                409,
                f"Forbidden transition {current} → {target}. "
                f"Allowed forward: {CONTRACT_LIFECYCLE_FORWARD.get(current, [])}",
            )

    now = _now_iso()
    await db.contracts_v2.update_one(
        {"id": contract_id},
        {"$set": {"lifecycle": target, "updated_at": now},
         "$push": {"history": {"event": "transition", "from": current, "to": target,
                               "at": now, "by": user.get("email") or user.get("id"),
                               "note": payload.note}}},
    )

    # ═══════ HARD SYNC: contract lifecycle → deal.stage ═══════
    # Жёсткая связь, чтобы менеджер никогда не видел "контракт подписан,
    # но сделка в variants_sent". История пишется в stage_history.
    deal_id = c.get("deal_id")
    contract_type = c.get("type")
    if deal_id and contract_type:
        deal_target: Optional[str] = None
        if contract_type == "deposit":
            if target == "sent_to_client":
                deal_target = "deposit_contract_drafted"
            elif target in ("client_signed", "company_signed_stamped", "finalized"):
                deal_target = "deposit_contract_signed"
        elif contract_type == "final":
            if target == "sent_to_client":
                deal_target = "final_contract_sent"
            elif target in ("client_signed", "company_signed_stamped", "finalized"):
                deal_target = "final_contract_signed"

        if deal_target:
            deal = await db.deals.find_one(
                {"$or": [{"id": deal_id}, {"_id": deal_id}]}, {"stage": 1, "status": 1}
            )
            cur_stage = (deal or {}).get("stage") or (deal or {}).get("status")
            # Не откатываем сделку назад если она уже ушла дальше
            target_idx = DEAL_STAGES.index(deal_target) if deal_target in DEAL_STAGES else -1
            cur_idx = DEAL_STAGES.index(cur_stage) if cur_stage in DEAL_STAGES else -1
            if target_idx > cur_idx:
                await db.deals.update_one(
                    {"$or": [{"id": deal_id}, {"_id": deal_id}]},
                    {
                        "$set": {"stage": deal_target, "status": deal_target, "updated_at": now},
                        "$push": {"stage_history": {
                            "from": cur_stage, "to": deal_target,
                            "by": user.get("email") or user.get("id"),
                            "by_role": user.get("role"),
                            "at": now,
                            "note": f"auto: contract2 {contract_type} → {target}",
                            "source": "contract_sync",
                            "contract_id": contract_id,
                        }},
                    },
                )

    await _audit(
        event_type="contract_transition", entity_type="contract_v2",
        entity_id=contract_id, user=user,
        deal_id=c.get("deal_id"), customer_id=c.get("customer_id"),
        payload={"from": current, "to": target, "type": c.get("type"),
                 "note": payload.note},
    )
    return {"success": True, "contract_id": contract_id, "from": current, "to": target}


@router.post("/contracts2/{contract_id}/upload-signed", dependencies=[Depends(require_manager_or_admin)])
async def upload_signed_pdf(
    contract_id: str,
    file: UploadFile = File(...),
    user: Dict[str, Any] = Depends(require_manager_or_admin),
):
    """
    Загрузить уже подписанный PDF.  Файл сохраняется в /static/contracts/.
    Поле `signed_pdf_url` обновляется.  Lifecycle вручную через /transition.
    """
    db = _db()
    c = await db.contracts_v2.find_one({"id": contract_id})
    if not c:
        raise HTTPException(404, f"Contract {contract_id} not found")

    if not (file.filename or "").lower().endswith((".pdf",)):
        raise HTTPException(415, "Only PDF allowed")

    base_dir = "/app/backend/static/contracts"
    os.makedirs(base_dir, exist_ok=True)
    safe_name = f"{contract_id}_{uuid.uuid4().hex[:8]}.pdf"
    abs_path = os.path.join(base_dir, safe_name)
    body = await file.read()
    with open(abs_path, "wb") as f:
        f.write(body)
    url = f"/static/contracts/{safe_name}"

    now = _now_iso()
    await db.contracts_v2.update_one(
        {"id": contract_id},
        {"$set": {"signed_pdf_url": url, "updated_at": now},
         "$push": {"history": {"event": "signed_pdf_uploaded", "at": now,
                               "by": user.get("email") or user.get("id"),
                               "data": {"url": url, "size_bytes": len(body)}}}},
    )
    await _audit(
        event_type="contract_signed_pdf_uploaded", entity_type="contract_v2",
        entity_id=contract_id, user=user,
        deal_id=c.get("deal_id"), customer_id=c.get("customer_id"),
        payload={"url": url, "size_bytes": len(body), "type": c.get("type")},
    )
    return {"success": True, "contract_id": contract_id, "signed_pdf_url": url}


# ════════════════════════════════════════════════════════════════════════════
#   6.  AUCTION EVENTS (P1.3)
# ════════════════════════════════════════════════════════════════════════════
#
#   Atomic event "we won the car" — mark deal, auto-create final contract
#   draft, auto-create after_win_package invoice, fan-out notifications.
#   Idempotent: повторный вызов на сделке уже в auction_won никаких новых
#   артефактов НЕ создаёт, возвращает существующие.
#
#   Что НЕ делаем здесь (по решению P1.3 scope):
#     • polling Copart/IAA — оставлено на P1.4
#     • автоматический выпуск (lifecycle = sent_to_client) — менеджер сам
#     • email/PDF generation — оставлено на P1.5
# ────────────────────────────────────────────────────────────────────────────

DEFAULT_AUCTION_FEE_EUR: float = float(os.environ.get("BIBI_DEFAULT_AUCTION_FEE_EUR") or 500.0)
DEFAULT_DELIVERY_TO_ROTTERDAM_EUR: float = float(os.environ.get("BIBI_DEFAULT_DELIVERY_EUR") or 800.0)
DEFAULT_SERVICE_FEE_EUR: float = float(os.environ.get("BIBI_DEFAULT_SERVICE_FEE_EUR") or 1000.0)

#: Стадии сделки, ИЗ которых разрешён переход в auction_won.
#: deposit_paid допустим — менеджер мог сразу зафиксировать выигрыш не двигая
#: сделку через searching_at_auction (бывает на «горячих» лотах).
STAGES_ALLOWING_AUCTION_WON: tuple = ("searching_at_auction", "auction_lost", "deposit_paid")

#: Статусы депозита, которые считаются «деньги приняты» — нужен хотя бы
#: один такой депозит на сделке, иначе auction_won запрещён.
DEPOSIT_STATUSES_FUNDED: tuple = ("paid_confirmed", "refund_pending_30d", "refund_pending_voluntary")


class _AuctionWonIn(BaseModel):
    """Payload события auction_won."""
    price_usd: float = Field(..., gt=0, description="Hammer price в USD")
    auction: str = Field(..., min_length=1, max_length=64,
                         description="Название аукциона (Copart, IAA, Manheim, etc.)")
    lot_number: Optional[str] = Field(None, max_length=64)
    auction_fee_eur: Optional[float] = Field(None, ge=0,
                                              description="Override default 500 EUR")
    delivery_eur: Optional[float] = Field(None, ge=0,
                                           description="Override default 800 EUR")
    service_fee_eur: Optional[float] = Field(None, ge=0,
                                              description="Override default 1000 EUR")
    fx_usd_to_eur: Optional[float] = Field(None, gt=0,
                                            description="Override default 0.92")
    won_at: Optional[str] = Field(None, description="ISO datetime; default = now")
    note: Optional[str] = Field(None, max_length=500)


def _after_win_package_items(
    price_eur: float,
    auction_fee: float,
    delivery: float,
    service_fee: float,
    deposit_eur: float,
) -> List[Dict[str, Any]]:
    """
    Базовый шаблон после-победного инвойса.
      Vehicle price + auction fee + delivery to Rotterdam + service fee
      − deposit applied (если есть).
    Все суммы в EUR.
    """
    items: List[Dict[str, Any]] = [
        {"name": "Vehicle price",           "amount": round(price_eur, 2),    "currency": "EUR"},
        {"name": "Auction fee",             "amount": round(auction_fee, 2),  "currency": "EUR"},
        {"name": "Delivery to Rotterdam",   "amount": round(delivery, 2),     "currency": "EUR"},
        {"name": "Service fee",             "amount": round(service_fee, 2),  "currency": "EUR"},
    ]
    if deposit_eur and deposit_eur > 0:
        items.append({"name": "Deposit applied", "amount": -round(deposit_eur, 2), "currency": "EUR"})
    return items


@router.post("/legal/deals/{deal_id}/auction/won",
             dependencies=[Depends(require_manager_or_admin)])
async def mark_auction_won(
    deal_id: str,
    payload: _AuctionWonIn = Body(...),
    user: Dict[str, Any] = Depends(require_manager_or_admin),
):
    """
    Атомарное событие «мы выиграли авто».

    Что делает:
      1. Двигает deal.stage → auction_won (с записью в stage_history).
      2. Создаёт final contract (draft) — если на сделке его ещё нет.
      3. Создаёт invoice (after_win_package, status=pending) — если нет.
      4. Эмитит события: auction_won, auction_won_customer, auction_won_manager.

    Гарантии (edge cases):
      • Идемпотентно: повтор на уже-auction_won сделке возвращает существующие
        contract/invoice без дублей.
      • Без подтверждённого депозита (paid_confirmed) → 409 Conflict.
      • Из стадии `lead`, `qualified`, `closed` etc. → 400 Bad Request.
      • Параллельный вызов: уникальный индекс по (deal_id, type) на contracts_v2
        + проверка `sourceAuctionWonDealId` на invoices гарантируют отсутствие
        дублей даже при race condition.

    Returns:
      {
        success, idempotent, deal_id, stage, contract, invoice, total_eur,
      }
    """
    db = _db()

    deal = await db.deals.find_one({"$or": [{"id": deal_id}, {"_id": deal_id}]})
    if not deal:
        raise HTTPException(404, f"Deal {deal_id} not found")

    current_stage = deal.get("stage") or deal.get("status")
    already_won = current_stage == "auction_won"

    # ─── Idempotent shortcut ─────────────────────────────────────────────
    # Если сделка УЖЕ в auction_won — просто возвращаем существующие
    # contract+invoice. Не делаем никаких записей в БД, не эмитим заново.
    if already_won:
        existing_contract = await db.contracts_v2.find_one(
            {"deal_id": deal_id, "type": "final"}, {"_id": 0}
        ) or {}
        existing_invoice = await db.invoices.find_one(
            {"sourceAuctionWonDealId": deal_id}, {"_id": 0}
        ) or {}
        return {
            "success": True,
            "idempotent": True,
            "deal_id": deal_id,
            "stage": "auction_won",
            "contract": existing_contract,
            "contract_created": False,
            "invoice": existing_invoice,
            "invoice_created": False,
            "total_eur": float(existing_invoice.get("amount") or 0),
            "items": existing_invoice.get("items") or [],
            "auction": deal.get("auction") or {},
        }

    # Stage gate
    if current_stage not in STAGES_ALLOWING_AUCTION_WON:
        raise HTTPException(
            400,
            f"Deal stage is '{current_stage}'. auction_won allowed only from "
            f"{list(STAGES_ALLOWING_AUCTION_WON)}.",
        )

    # Deposit gate — нужен хотя бы один funded депозит на сделке
    funded_deposit = await db.legal_deposits.find_one(
        {"deal_id": deal_id, "status": {"$in": list(DEPOSIT_STATUSES_FUNDED)}}
    )
    if not funded_deposit:
        raise HTTPException(
            409,
            "auction_won requires at least one paid_confirmed deposit on this deal.",
        )

    deposit_eur = float(funded_deposit.get("paid_amount_eur") or 0)
    deposit_id = funded_deposit.get("id")
    fx = float(payload.fx_usd_to_eur or DEFAULT_FX_USD_TO_EUR)
    price_eur = float(payload.price_usd) * fx
    auction_fee = (payload.auction_fee_eur if payload.auction_fee_eur is not None
                   else DEFAULT_AUCTION_FEE_EUR)
    delivery = (payload.delivery_eur if payload.delivery_eur is not None
                else DEFAULT_DELIVERY_TO_ROTTERDAM_EUR)
    service_fee = (payload.service_fee_eur if payload.service_fee_eur is not None
                   else DEFAULT_SERVICE_FEE_EUR)

    # ─── P1.2 — Use invoice_templates if present, fallback to hardcoded ────
    # Breakdown engine is centralised in financial_breakdown.py; we pull the
    # active after_win template and plug in per-deal context. If the template
    # is missing (first-boot, migration gap), we fall back to the legacy
    # _after_win_package_items() so auction_won never breaks.
    template_snapshot: Optional[Dict[str, Any]] = None
    calculation_snapshot: Optional[Dict[str, Any]] = None
    totals: Dict[str, float] = {}
    try:
        import financial_breakdown as _fb
        # Phase 5.3 / C-5: cross-domain READ via the invoice_templates
        # repository (Type B / shared read-model per ownership map).
        # READS across domains are permitted by §7.1 — only WRITES
        # are restricted to the canonical owner.
        tpl = await InvoiceTemplateRepository(db).get_active_by_kind("after_win")
        if tpl:
            ctx = {
                "vehicle_price": round(price_eur, 2),
                "vehicle_price_eur": round(price_eur, 2),
                "auction_fee": round(auction_fee, 2),
                "delivery_to_rotterdam": round(delivery, 2),
                "service_fee": round(service_fee, 2),
                "deposit_applied": -round(deposit_eur, 2) if deposit_eur > 0 else 0.0,
                "fx_rate_snapshot": fx,
            }
            engine_result = _fb._compute_items_and_totals(tpl["items"], ctx, {})
            items = [
                {"name": i["label"], "amount": i["amount"], "currency": i["currency"],
                 "key": i["key"], "payment_type": i["payment_type"],
                 "is_official": i["is_official"], "type": i["type"]}
                for i in engine_result["items"]
            ]
            totals = engine_result["totals"]
            template_snapshot = tpl
            calculation_snapshot = engine_result["calc"]
        else:
            items = _after_win_package_items(price_eur, auction_fee, delivery, service_fee, deposit_eur)
    except Exception as _e:
        import logging as _lg
        _lg.getLogger("bibi.legal").warning(
            "[auction_won] template engine failed, falling back to legacy items: %s", _e,
        )
        items = _after_win_package_items(price_eur, auction_fee, delivery, service_fee, deposit_eur)

    total_eur = round(sum(i["amount"] for i in items), 2)
    if not totals:
        # Legacy path: compute the 3 totals from the plain items list
        totals = {
            "total_all": total_eur,
            "total_official": round(sum(
                i["amount"] for i in items
                if i.get("is_official", True)
            ), 2) if any("is_official" in i for i in items) else total_eur,
            "total_cash": round(sum(
                i["amount"] for i in items
                if i.get("payment_type") == "cash_off_books"
            ), 2),
        }

    now = _now_iso()
    auction_meta = {
        "price_usd": float(payload.price_usd),
        "price_eur": round(price_eur, 2),
        "fx": fx,
        "fx_rate_snapshot": fx,                # P1.3.1 — explicit, never recomputed
        "auction": payload.auction,
        "lot_number": payload.lot_number,
        "won_at": payload.won_at or now,
        "note": payload.note,
        "registered_by": user.get("email") or user.get("id"),
        "registered_at": now,
    }

    # ─── Step 1. ATOMIC CAS LOCK + stage transition (P1.3.1) ───────────────
    # Гарантирует: даже если 2 запроса прилетят одновременно, только один
    # выиграет CAS и пройдёт дальше. Второй попадёт в idempotent-ветку.
    # Условия CAS: стадия из STAGES_ALLOWING_AUCTION_WON И auction_locked != True.
    cas_filter = {
        "$or": [{"id": deal_id}, {"_id": deal_id}],
        "$and": [
            {"$or": [
                {"stage": {"$in": list(STAGES_ALLOWING_AUCTION_WON)}},
                {"status": {"$in": list(STAGES_ALLOWING_AUCTION_WON)}},
            ]},
            {"$or": [{"auction_locked": {"$exists": False}},
                      {"auction_locked": False}]},
        ],
    }
    cas_update = {
        "$set": {
            "stage": "auction_won",
            "status": "auction_won",
            "auction": auction_meta,
            "auction_locked": True,
            "auction_locked_at": now,
            "auction_locked_by": user.get("email") or user.get("id"),
            "is_locked_after_win": True,
            "fx_rate_snapshot": fx,            # P1.3.1
            "updated_at": now,
        },
        "$push": {"stage_history": {
            "from": current_stage, "to": "auction_won",
            "by": user.get("email") or user.get("id"),
            "by_role": user.get("role"),
            "at": now,
            "note": (f"auction_won: {payload.auction}"
                     + (f" lot {payload.lot_number}" if payload.lot_number else "")),
            "source": "auction_event",
        }},
    }
    cas_result = await db.deals.update_one(cas_filter, cas_update)
    if cas_result.modified_count != 1:
        # CAS не сработал → кто-то параллельно опередил, либо сделка изменилась.
        # Re-fetch и решаем как реагировать.
        deal_re = await db.deals.find_one({"$or": [{"id": deal_id}, {"_id": deal_id}]})
        if deal_re and (deal_re.get("stage") or deal_re.get("status")) == "auction_won":
            # Другой запрос победил гонку — возвращаем idempotent-ответ
            existing_contract = await db.contracts_v2.find_one(
                {"deal_id": deal_id, "type": "final"}, {"_id": 0}
            ) or {}
            existing_invoice = await db.invoices.find_one(
                {"sourceAuctionWonDealId": deal_id}, {"_id": 0}
            ) or {}
            return {
                "success": True, "idempotent": True, "deal_id": deal_id,
                "stage": "auction_won",
                "contract": existing_contract, "contract_created": False,
                "invoice": existing_invoice, "invoice_created": False,
                "total_eur": float(existing_invoice.get("amount") or 0),
                "items": existing_invoice.get("items") or [],
                "auction": deal_re.get("auction") or {},
                "race_resolved": True,
            }
        # Странный кейс — лок занят, но не auction_won
        raise HTTPException(
            409,
            "Deal is currently being processed (auction_locked). Try again in a few seconds.",
        )

    # ─── Step 2. Find or create final contract (draft) ──────────────────────
    contract = await db.contracts_v2.find_one(
        {"deal_id": deal_id, "type": "final"}, {"_id": 0}
    )
    contract_created = False
    if not contract:
        contract_id = (f"contract2_{int(datetime.now(timezone.utc).timestamp())}"
                        f"_{uuid.uuid4().hex[:8]}")
        customer = await db.customers.find_one(
            {"id": deal.get("customerId") or deal.get("customer_id")}, {"legal": 1}
        )
        contract = {
            "id": contract_id,
            "type": "final",
            "deal_id": deal_id,
            "customer_id": deal.get("customerId") or deal.get("customer_id"),
            "lifecycle": "draft",
            "items": items,
            "notes": (f"Auto-created from auction_won event. "
                      f"Auction={payload.auction}, lot={payload.lot_number or '—'}, "
                      f"hammer=${float(payload.price_usd):,.0f}."),
            "pdf_url": None,
            "signed_pdf_url": None,
            "company_signed_pdf_url": None,
            "snapshot_customer_legal": (customer or {}).get("legal"),
            "auto_created_from": "auction_won",
            "auction": auction_meta,
            "fx_rate_snapshot": fx,            # P1.3.1
            "linked_deposit_id": deposit_id,   # P1.3.1
            "history": [{
                "event": "created", "lifecycle": "draft",
                "by": "system:auction_won", "at": now,
                "data": {"source": "auction_won",
                         "auction": payload.auction,
                         "lot_number": payload.lot_number,
                         "fx_rate_snapshot": fx}
            }],
            "created_by": "system:auction_won",
            "created_at": now,
            "updated_at": now,
        }
        await db.contracts_v2.insert_one(contract)
        contract.pop("_id", None)
        contract_created = True

        # Привязать contract id к сделке
        await db.deals.update_one(
            {"$or": [{"id": deal_id}, {"_id": deal_id}]},
            {"$set": {"final_contract_id": contract["id"], "updated_at": now}},
        )

    # ─── Step 3. Find or create invoice (after_win_package, draft) ──────────
    invoice = await db.invoices.find_one(
        {"sourceAuctionWonDealId": deal_id}, {"_id": 0}
    )
    invoice_created = False
    if not invoice:
        invoice_id = (f"inv-aw-{int(datetime.now(timezone.utc).timestamp())}"
                       f"-{uuid.uuid4().hex[:6]}")
        invoice = {
            "id": invoice_id,
            "customerId": deal.get("customerId") or deal.get("customer_id"),
            "dealId": deal_id,
            "amount": total_eur,
            "total": total_eur,
            "currency": "EUR",
            "status": "pending",
            "kind": "after_win",                          # P1.2 — canonical kind
            "template": "after_win_package",              # legacy field
            "template_id": (template_snapshot or {}).get("id") or "tpl_after_win_package",
            "template_snapshot": template_snapshot,       # P1.2 — immutable copy
            "calculation_snapshot": calculation_snapshot, # P1.2 — full trace
            "totals": totals,                             # P1.2 — 3 totals
            "items": items,
            "auction": auction_meta,
            "fx_rate_snapshot": fx,                       # P1.3.1
            # P1.3.1 — hard link deposit → invoice (для бухгалтерии и аудита)
            "deposit_id": deposit_id if deposit_eur > 0 else None,
            "deposit_applied_eur": round(deposit_eur, 2),
            "sourceAuctionWonDealId": deal_id,
            "auto_created_from": "auction_won",
            "linked_contract_id": contract.get("id"),
            "locked": True,                               # P1.2 — immutable
            "due_date": None,
            "dueDate": None,
            "created_at": now,
            "updated_at": now,
        }
        await db.invoices.insert_one(invoice)
        invoice.pop("_id", None)
        invoice_created = True

        # ─ обратный линк: на депозите ставим invoice_id (двусторонняя связь)
        if deposit_id and deposit_eur > 0:
            await db.legal_deposits.update_one(
                {"id": deposit_id},
                {"$set": {
                    "applied_to_invoice_id": invoice_id,
                    "applied_at": now,
                    "updated_at": now,
                 },
                 "$push": {"history": {
                     "event": "applied_to_invoice", "at": now,
                     "by": "system:auction_won",
                     "data": {"invoice_id": invoice_id,
                              "amount_eur": round(deposit_eur, 2)},
                 }}},
            )

    # ─── Step 4. Notifications ──────────────────────────────────────────────
    customer_id = deal.get("customerId") or deal.get("customer_id")
    await _emit_safe("auction_won", {
        "dealId": deal_id, "customerId": customer_id,
        "contractId": contract.get("id"), "invoiceId": invoice.get("id"),
        "auction": payload.auction, "lot_number": payload.lot_number,
        "price_usd": float(payload.price_usd), "price_eur": round(price_eur, 2),
        "fx_rate_snapshot": fx,
        "by": user.get("email") or user.get("id"),
        "idempotent": False,
        "contract_created": contract_created, "invoice_created": invoice_created,
    })
    # Customer-facing event — title/message rendered in EN (i18n is done client-side
    # in the cabinet via `t('cab_auction_won_*')`; the strings here are the EN fallback)
    await _emit_safe("auction_won_customer", {
        "customerId": customer_id, "dealId": deal_id,
        "title": "You won the auction 🎉",
        "message": (f"Deal {deal_id}: next step — final contract and payment. "
                    f"Amount due: €{total_eur:,.0f}."),
        "contractId": contract.get("id"), "invoiceId": invoice.get("id"),
        "kind": "auction_won",
        # Multilingual variants so cabinet (or email worker) can pick by user lang
        "i18n": {
            "en": {
                "title": "You won the auction 🎉",
                "message": (f"Deal {deal_id}: next step — final contract and payment. "
                            f"Amount due: €{total_eur:,.0f}."),
            },
            "bg": {
                "title": "Вие спечелихте търга 🎉",
                "message": (f"Сделка {deal_id}: следваща стъпка — финален договор и плащане. "
                            f"Сума за плащане: €{total_eur:,.0f}."),
            },
            "uk": {
                "title": "Ви виграли аукціон 🎉",
                "message": (f"Угода {deal_id}: наступний крок — фінальний договір та оплата. "
                            f"Сума до сплати: €{total_eur:,.0f}."),
            },
        },
    })
    # Manager-facing event (English — managers use EN-mode CRM)
    await _emit_safe("auction_won_manager", {
        "dealId": deal_id, "customerId": customer_id,
        "title": f"Deal {deal_id} → auction_won",
        "message": (f"Contract {contract.get('id')} + invoice {invoice.get('id')} "
                    f"created automatically. Amount due: €{total_eur:,.0f}."),
        "contractId": contract.get("id"), "invoiceId": invoice.get("id"),
        "kind": "auction_won",
    })

    # ─── Step 5. Audit log (P1.3.1) ────────────────────────────────────────
    await _audit(
        event_type="auction_won", entity_type="deal", entity_id=deal_id,
        user=user, deal_id=deal_id, customer_id=customer_id,
        payload={
            "from_stage": current_stage,
            "auction": payload.auction,
            "lot_number": payload.lot_number,
            "price_usd": float(payload.price_usd),
            "price_eur": round(price_eur, 2),
            "fx_rate_snapshot": fx,
            "total_eur": total_eur,
            "deposit_id": deposit_id,
            "deposit_applied_eur": round(deposit_eur, 2),
            "contract_id": contract.get("id"),
            "contract_created": contract_created,
            "invoice_id": invoice.get("id"),
            "invoice_created": invoice_created,
        },
    )

    return {
        "success": True,
        "idempotent": False,
        "deal_id": deal_id,
        "stage": "auction_won",
        "contract": contract,
        "contract_created": contract_created,
        "invoice": invoice,
        "invoice_created": invoice_created,
        "total_eur": total_eur,
        "items": items,
        "auction": auction_meta,
        "fx_rate_snapshot": fx,
        "deposit_id": deposit_id,
        "deposit_applied_eur": round(deposit_eur, 2),
        "is_locked_after_win": True,
    }


# ════════════════════════════════════════════════════════════════════════════
#   7.  AUDIT TRAIL READ API (P1.3.1)
# ════════════════════════════════════════════════════════════════════════════
#
#   Public read endpoints для бухгалтерии, юр.отдела и менеджеров.
#   Запись в audit_events НЕ выполняется через API — только через _audit()
#   из доменных endpoints. Это append-only: ни PUT, ни DELETE здесь нет.
#

@router.get("/legal/audit", dependencies=[Depends(require_manager_or_admin)])
async def list_audit_events(
    deal_id: Optional[str] = None,
    customer_id: Optional[str] = None,
    entity_type: Optional[str] = None,
    entity_id: Optional[str] = None,
    type: Optional[str] = None,
    user_email: Optional[str] = None,
    limit: int = 100,
):
    """
    Прочитать audit_events с фильтрами. Сортировка: новые сверху.
    Все параметры опциональны — без фильтров возвращает последние `limit` событий.
    Защита: только manager/admin/master_admin.
    """
    db = _db()
    q: Dict[str, Any] = {}
    if deal_id:
        q["deal_id"] = deal_id
    if customer_id:
        q["customer_id"] = customer_id
    if entity_type:
        q["entity_type"] = entity_type
    if entity_id:
        q["entity_id"] = entity_id
    if type:
        q["type"] = type
    if user_email:
        q["user_email"] = user_email

    limit = max(1, min(limit, 500))
    # Phase 5.3 / C-11 — db.audit_events ownership routes through
    # AuditEventsRepository. The router retains the ts datetime → ISO
    # post-processing (legacy serialization quirk preserved at the
    # router layer, NOT the repository).
    from app.repositories import AuditEventsRepository
    items = await AuditEventsRepository(db).list_filtered(
        deal_id=deal_id,
        customer_id=customer_id,
        entity_type=entity_type,
        entity_id=entity_id,
        type=type,
        user_email=user_email,
        limit=limit,
    )
    # Сериализуем datetime ts -> isoformat (чтобы JSON не падал)
    for it in items:
        ts = it.get("ts")
        if isinstance(ts, datetime):
            it["ts"] = ts.isoformat()
    return {"success": True, "data": items, "total": len(items), "filters": q}


@router.get("/legal/deals/{deal_id}/audit", dependencies=[Depends(require_manager_or_admin)])
async def get_deal_audit_trail(deal_id: str, limit: int = 200):
    """Полный audit-trail по конкретной сделке (timeline для UI)."""
    db = _db()
    limit = max(1, min(limit, 500))
    # Phase 5.3 / C-11 — db.audit_events ownership routes through
    # AuditEventsRepository.list_for_deal preserves the legacy default
    # limit of 200 (note: differs from list_audit_events default of 100).
    from app.repositories import AuditEventsRepository
    items = await AuditEventsRepository(db).list_for_deal(deal_id, limit=limit)
    for it in items:
        ts = it.get("ts")
        if isinstance(ts, datetime):
            it["ts"] = ts.isoformat()
    return {"success": True, "deal_id": deal_id, "data": items, "total": len(items)}


# ════════════════════════════════════════════════════════════════════════════
#   5.  STATIC CATALOG  (для UI)
# ════════════════════════════════════════════════════════════════════════════

@router.get("/legal/catalog")
async def legal_catalog():
    """
    Один эндпоинт для фронта — отдаёт все справочники сразу:
    стадии сделки, статусы депозита, типы и lifecycle контракта.
    """
    return {
        "success": True,
        "deal_stages": DEAL_STAGES,
        "deal_stage_forward": DEAL_STAGE_FORWARD,
        "deal_stage_groups": DEAL_STAGE_GROUPS,
        "stages_after_auction_win": STAGES_AFTER_AUCTION_WIN,
        "deposit_statuses": DEPOSIT_STATUSES,
        "contract_types": CONTRACT_TYPES,
        "contract_lifecycle": CONTRACT_LIFECYCLE,
        "contract_lifecycle_forward": CONTRACT_LIFECYCLE_FORWARD,
        "deposit_rules": {
            "min_eur": MIN_DEPOSIT_EUR,
            "pct_threshold_usd": DEPOSIT_PCT_THRESHOLD_USD,
            "pct": DEPOSIT_PCT,
            "default_fx_usd_to_eur": DEFAULT_FX_USD_TO_EUR,
            "refund_deadline_days": REFUND_DEADLINE_DAYS,
        },
        "auction_defaults": {
            "auction_fee_eur": DEFAULT_AUCTION_FEE_EUR,
            "delivery_to_rotterdam_eur": DEFAULT_DELIVERY_TO_ROTTERDAM_EUR,
            "service_fee_eur": DEFAULT_SERVICE_FEE_EUR,
            "default_fx_usd_to_eur": DEFAULT_FX_USD_TO_EUR,
            "stages_allowing_auction_won": list(STAGES_ALLOWING_AUCTION_WON),
        },
    }


# ════════════════════════════════════════════════════════════════════════════
#   5.  LEGACY v1 ENDPOINTS — absorbed from server.py on 2026-05-17
# ════════════════════════════════════════════════════════════════════════════
#
# These 12 endpoints lived in server.py until the Wave 1 refactor.  They are
# the *v1* legal-domain surface (predecessor of /api/legal/* and /api/contracts2/*),
# kept for backwards-compatibility with frontend clients that still call them.
#
# Discipline: absorbed VERBATIM (movement-only).  No semantic expansion,
# no DI rework, no repository introduction.  Behaviour preserved byte-for-byte.
#
# !!! TEMP BRIDGE !!!  Same controlled anti-pattern as other Wave 1 routers:
# uses ``_db()`` lazy resolver + lazy ``from app.utils.money import _round_money``
# for the cross-domain helper.
# Phase 5.5 / C — the legacy ``from server import _create_order_from_invoice``
# bridge has been retired: order creation orchestration now lives in
# ``app/services/orders.py`` and is imported via
# ``from app.services.orders import create_order_from_invoice``.
#
# Known latent issue (preserved, NOT fixed in this commit):
#   ``GET /api/contracts/{contract_id}`` is registered twice -- as a stub
#   (returning {"id": id, "status": "pending"}) and as a real DB lookup.
#   Current behavior: stub wins (registration order).  Cleanup deferred
#   to a dedicated commit so this extraction stays zero-drift.
# ════════════════════════════════════════════════════════════════════════════


# ─────────── A. Customer contracts stubs — RETIRED in Wave 15 ──────────────
# The legacy stubs `GET /contracts/me` and `GET /contracts/{contract_id}`
# were placeholders returning fake data ({"contracts": []} and {"id":..,"status":"pending"}).
# Wave 15 (Contract360) ships the real implementation under the same paths.
# Their removal here is the "dedicated commit" the original code comment
# (see Phase 5 absorption note) deferred. No other surface references them
# except a smoke check in backend_test_audit.py which is updated alongside.


# ─────────── B. Deposits v1 CRUD ────────────────────────────────────────────

@router.get("/deposits")
async def list_deposits(status: Optional[str] = None, limit: int = 50):
    """List deposits"""
    db = _db()
    query: Dict[str, Any] = {}
    if status:
        query["status"] = status
    cursor = db.deposits.find(query, {'_id': 0}).sort('created_at', -1).limit(limit)
    items = await cursor.to_list(length=limit)
    total = await db.deposits.count_documents(query)
    return {"success": True, "data": items, "total": total}


@router.post("/deposits")
async def create_deposit(data: Dict[str, Any] = Body(...)):
    """Create deposit"""
    db = _db()
    deposit = {
        "id": f"dep-{datetime.now(timezone.utc).timestamp()}",
        "customerId": data.get("customerId"),
        "managerId": data.get("managerId"),
        "amount": float(data.get("amount") or 0),
        "currency": (data.get("currency") or "USD").upper(),
        "method": data.get("method"),
        "note": data.get("note"),
        "status": "pending",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.deposits.insert_one(deposit)
    return {"success": True, "id": deposit["id"], "deposit": {k: v for k, v in deposit.items() if k != "_id"}}


@router.put("/deposits/{deposit_id}/approve")
async def approve_deposit(deposit_id: str, data: Dict[str, Any] = Body(default={}), user: dict = Depends(require_manager_or_admin)):
    """Approve a deposit. Optional: ``auto_convert=True`` creates an invoice +
    order from this deposit (same code path as a paid invoice)."""
    db = _db()
    d = await db.deposits.find_one({"id": deposit_id})
    if not d:
        raise HTTPException(404, "Deposit not found")

    await db.deposits.update_one(
        {"id": deposit_id},
        {"$set": {"status": "approved", "approved_at": datetime.now(timezone.utc).isoformat(),
                   "approvedBy": user.get("email") or user.get("id")}}
    )

    if not (data or {}).get("auto_convert", True):
        return {"success": True}

    # ─── Deposit → Invoice (single-line) → Order auto ────────────
    # Lazy imports:
    #   * _round_money — Phase 5.2 / C-2: moved to app/utils/money.py
    #   * create_order_from_invoice — Phase 5.5 / C (2026-05-19):
    #     moved to ``app/services/orders.py`` (was previously a
    #     ``from server import _create_order_from_invoice`` lazy
    #     bridge — see CONTRIBUTING § "Wave 1 lazy bridges").
    try:
        from app.utils.money import _round_money  # Phase 5.2 / C-2
        from app.services.orders import create_order_from_invoice  # Phase 5.5 / C

        already = await db.invoices.find_one({"sourceDepositId": deposit_id}, {"_id": 0})
        if already:
            return {"success": True, "invoice": already, "already_converted": True}

        inv_id = f"inv_{int(datetime.now(timezone.utc).timestamp())}_{uuid.uuid4().hex[:6]}"
        amount = float(d.get("amount") or 0)
        currency = (d.get("currency") or "USD").upper()
        line = {
            "id": str(uuid.uuid4()),
            "service_id": None,
            "service_code": None,
            "name": f"Депозит · {d.get('method') or 'manual'}",
            "description": d.get("note") or "",
            "category": "deposit",
            "price": amount,
            "qty": 1,
            "line_total": amount,
            "workflow": [
                {"key": "received",  "label": "Депозит отримано"},
                {"key": "applied",   "label": "Зарахований у замовлення"},
            ],
        }
        invoice = {
            "id": inv_id,
            "customerId": d.get("customerId"),
            "managerId": d.get("managerId") or user.get("id"),
            "managerEmail": user.get("email"),
            "items": [line],
            "amount": _round_money(amount),
            "total": _round_money(amount),
            "currency": currency,
            "status": "paid",
            "description": line["name"],
            "sourceDepositId": deposit_id,
            "paymentMethod": d.get("method") or "deposit",
            "paidAt": datetime.now(timezone.utc).isoformat(),
            "created_at": datetime.now(timezone.utc).isoformat(),
            "created_by": user.get("email") or user.get("id"),
        }
        await db.invoices.insert_one(invoice)
        invoice.pop("_id", None)

        # Link the deposit back
        await db.deposits.update_one(
            {"id": deposit_id},
            {"$set": {"invoiceId": inv_id, "convertedAt": datetime.now(timezone.utc).isoformat()}},
        )

        # Auto-create order (this emits payment_confirmed + order_started)
        order = await create_order_from_invoice(invoice)
        return {"success": True, "invoice": invoice, "order": order, "converted": True}
    except Exception:
        import logging as _lg
        _lg.getLogger("bibi.legal").exception("[deposit] auto-convert failed")
        return {"success": True, "converted": False}


@router.put("/deposits/{deposit_id}/reject")
async def reject_deposit(deposit_id: str, user: dict = Depends(require_manager_or_admin)):
    """Reject deposit"""
    db = _db()
    r = await db.deposits.update_one(
        {"id": deposit_id},
        {"$set": {"status": "rejected", "rejectedBy": user.get("email") or user.get("id"),
                   "rejected_at": datetime.now(timezone.utc).isoformat()}}
    )
    if r.matched_count == 0:
        raise HTTPException(404, "Deposit not found")
    return {"success": True}


# ─────────── C. Contracts v1 CRUD — RETIRED in Wave 15 ─────────────────────
# The legacy v1 endpoints `GET/POST /contracts`, `GET /contracts/{id}` and
# `GET /contracts/template/{template_name}` returned stub or minimal-shape
# documents. They are superseded by the Wave 15 (Contract360) router under
# the same paths with the full lifecycle surface (templates, approvals,
# signatures, attachments, amend/archive, health scorer). Removal here is
# the "dedicated commit" the earlier comment deferred. Admin reporting
# endpoints below (/admin/contracts/accounting, /admin/contracts/export)
# stay because they live in a different namespace.
@router.get("/admin/contracts/accounting", dependencies=[Depends(require_admin)])
async def contracts_accounting():
    """Contracts accounting"""
    return {"success": True, "data": []}


@router.get("/admin/contracts/export", dependencies=[Depends(require_admin)])
async def contracts_export():
    """Export contracts"""
    return {"success": True, "url": ""}
