"""
Customer domain service — Phase 5.5/D extraction
==================================================

Owns the customer-auth + customer-seed helpers previously hosted as
``server._require_customer`` and ``server._ensure_customer_seed``.

Extracted on 2026-05-19 as part of Phase 5.5/D — the **second
orchestration extraction** of the Phase 5 refactor cycle (after
5.5/C / order-creation). 5.5/D is intentionally scoped as a
**mechanical relocation + behavioural pinning** wave — see the
mandate locked at kickoff:

    auth semantics are business semantics
    → no "simplification of dependency graph"
    → no "unify customer resolution"
    → no "shared auth abstraction"
    → mechanical relocation + behavioural pinning ONLY

Public surface
————————
  * ``require_customer(authorization)``    — 5-line wrapper that resolves
    a Bearer session via ``_resolve_bearer`` and raises ``HTTPException(401,
    "Authentication required")`` on any miss / expiry. Renamed from
    ``_require_customer`` per D3 (public-on-extraction precedent set by
    5.5/C — ``create_order_from_invoice``).
  * ``ensure_customer_seed(customer_id)``  — 619-LOC idempotent seed
    that materialises the demo cabinet doc-set for a given customer ID:
    customer profile + 4 deals + 3 shipments + 8 shipment events +
    4 invoices + 3 contracts + 2 carfax reports + 8 notifications +
    2 leads + 2 deposits + financial breakdowns. Body moved 1:1 from
    ``server.py:18445-19064``. Renamed from ``_ensure_customer_seed``
    per D3.

Private sibling
—————————
  * ``_seed_customer_financials(customer_id, now)`` — 204-LOC helper
    that handles the financial-breakdown + payments seed slice. Only
    called from inside ``ensure_customer_seed``. Stays underscore-
    prefixed (module-private; no external consumers exist or will
    exist post-extraction).

Auxiliary bridges (D2 mandate)
——————————————————
  * ``_resolve_bearer``  — token → customer-doc resolver. Stays in
    ``server.py``; imported lazily here to keep token logic untouched
    (mandate forbids any auth-core changes). Tracked in
    ``EXTRACTION_AUX_BRIDGES`` under tier ``C-aux`` with
    ``kind="CUSTOMER_AUTH_DEP"`` (mirror of the 5.5/B calculator-
    extraction precedent).
  * ``generate_route``   — origin/destination → shipment route
    polyline. Used by the BMW/Tesla/Mercedes shipment fixtures inside
    ``ensure_customer_seed``. Same lazy-import + ``EXTRACTION_AUX_BRIDGES``
    treatment as ``_resolve_bearer``.

Forbidden in this extraction (mandate-locked)
——————————————————————————
  * no token-logic changes
  * no ``_resolve_bearer`` move
  * no auth abstraction
  * no seed data edits (619 + 204 LOC move verbatim)
  * no response-shape changes
  * no route signature changes
  * no compat shim in ``server.py``

Invariants asserted
——————————————————
  * ``tests/test_phase5_5_d_customer_helpers_golden.py`` — 8 G-scenarios
    (G1 valid bearer, G2-G5 401 surface, G6 cold-start collections,
    G7 idempotency, G8 customer-profile shape). Same suite runs
    UNCHANGED pre and post extraction via a single ``_resolve_helpers``
    switch point.
"""
from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional

from fastapi import HTTPException

# Canonical runtime DB accessor — published by server.py at module-load.
# Every ``_db()`` call resolves the live Motor handle, preserving the
# call-time semantics of the legacy ``db.X`` qualified pattern that
# the seed body relied on.
from app.core.db_runtime import get_db

logger = logging.getLogger("bibi.customers")


__all__ = ["require_customer", "ensure_customer_seed"]


def _db():
    """Lazy Motor handle resolver — mirrors the cabinet_financials.py
    pattern (Phase 5.4 / C-4h)."""
    return get_db()


async def _resolve_bearer(authorization: Optional[str]):
    """Lazy bridge — token logic stays in ``server.py`` per D2 mandate.

    Tracked in ``app.core.app_state_targets.EXTRACTION_AUX_BRIDGES``
    with ``kind="CUSTOMER_AUTH_DEP"`` (mirror of the 5.5/B
    calculator-extraction aux-bridge precedent). Retirement is
    explicitly deferred — the mandate forbids any restructuring of
    the auth core in this wave.
    """
    from server import _resolve_bearer as _server_resolve_bearer
    return await _server_resolve_bearer(authorization)


def generate_route(origin, destination):
    """Lazy bridge — used by shipment fixtures inside
    ``ensure_customer_seed``.

    Phase 5.5/I (2026-05-20) — canonical home is
    ``app.services.shipments.generate_route`` after the shipments-
    orchestration cluster retirement. The legacy ``from server import
    generate_route`` lazy bridge has been retired; this thin wrapper
    now reaches for the canonical home directly. Semantics
    byte-identical (the ``server.generate_route`` shim that survives
    delegates 1:1 to this same function).
    """
    from app.services.shipments import generate_route as _svc_generate_route
    return _svc_generate_route(origin, destination)


async def _seed_customer_financials(customer_id: str, now: datetime) -> None:
    """
    Seed proper financial breakdowns + payments for the cabinet view.

    Creates one `final` breakdown per major deal with mixed
    official/cash items, and 0..N confirmed payments per deal to
    demonstrate the four payment states: unpaid, partial, paid, overpaid.
    Idempotent.
    """
    # ── Deal 1 — BMW X5, in_transit, PARTIAL paid ──────────────────────
    bmw_id = f"deal_{customer_id}_1"
    bmw_breakdown_id = f"fin-final-{customer_id}-1"
    bmw_items = [
        {"key": "auction_price",  "label": "Ціна авто (auction)",      "amount": 42000, "payment_type": "bank",            "type": "input"},
        {"key": "auction_fees",   "label": "Збори аукціону",            "amount":  1850, "payment_type": "bank",            "type": "input"},
        {"key": "shipping",       "label": "Доставка US → BG",          "amount":  3200, "payment_type": "bank",            "type": "input"},
        {"key": "customs_duty",   "label": "Митні платежі (10%)",       "amount":  4200, "payment_type": "bank",            "type": "formula"},
        {"key": "vat",            "label": "ПДВ (20%)",                 "amount":  9450, "payment_type": "bank",            "type": "formula"},
        {"key": "service_fee",    "label": "Послуги BIBI Cars (cash)",  "amount":  2500, "payment_type": "cash_off_books",  "type": "input"},
    ]
    bmw_total_official = sum(i["amount"] for i in bmw_items if i["payment_type"] in ("bank", "stripe", "internal"))
    bmw_total_cash     = sum(i["amount"] for i in bmw_items if i["payment_type"] == "cash_off_books")
    bmw_total_all      = bmw_total_official + bmw_total_cash

    bmw_doc = {
        "id": bmw_breakdown_id,
        "customerId": customer_id,
        "dealId": bmw_id,
        "kind": "final",
        "items": bmw_items,
        "totals": {
            "total_all":      bmw_total_all,
            "total_official": bmw_total_official,
            "total_cash":     bmw_total_cash,
        },
        "amount":   bmw_total_all,
        "total":    bmw_total_all,
        "currency": "EUR",
        "status":   "active",
        "locked":   True,
        "sourceFinalBreakdownDealId": bmw_id,
        "created_at": now - timedelta(days=20),
        "updated_at": now - timedelta(days=20),
    }
    await _db().invoices.update_one(
        {"id": bmw_breakdown_id},
        {"$setOnInsert": bmw_doc},
        upsert=True,
    )

    # 2 confirmed payments — partial (€32,000 paid out of €63,200 = 50.6%)
    bmw_payments = [
        {
            "id": f"pay-{customer_id}-bmw-1",
            "deal_id": bmw_id,
            "customer_id": customer_id,
            "amount": 20000.00,
            "currency": "EUR",
            "method": "bank",
            "status": "confirmed",
            "note": "Перший банківський трансфер",
            "created_at": (now - timedelta(days=15)).isoformat(),
            "confirmed_at": (now - timedelta(days=15)).isoformat(),
        },
        {
            "id": f"pay-{customer_id}-bmw-2",
            "deal_id": bmw_id,
            "customer_id": customer_id,
            "amount": 12000.00,
            "currency": "EUR",
            "method": "stripe",
            "status": "confirmed",
            "note": "Stripe Checkout · auto-confirmed",
            "stripe_session_id": "cs_test_demo_bmw",
            "created_at": (now - timedelta(days=8)).isoformat(),
            "confirmed_at": (now - timedelta(days=8)).isoformat(),
        },
    ]
    for p in bmw_payments:
        await _db().payments.update_one({"id": p["id"]}, {"$setOnInsert": p}, upsert=True)

    # ── Deal 2 — Tesla Model 3, delivered, FULLY PAID ──────────────────
    tesla_id = f"deal_{customer_id}_2"
    tesla_breakdown_id = f"fin-final-{customer_id}-2"
    tesla_items = [
        {"key": "auction_price", "label": "Ціна авто (auction)",     "amount": 24500, "payment_type": "bank",           "type": "input"},
        {"key": "shipping",      "label": "Доставка US → BG",         "amount":  3400, "payment_type": "bank",           "type": "input"},
        {"key": "customs_duty",  "label": "Митні платежі",            "amount":  2450, "payment_type": "bank",           "type": "formula"},
        {"key": "vat",           "label": "ПДВ (20%)",                "amount":  4870, "payment_type": "bank",           "type": "formula"},
        {"key": "service_fee",   "label": "Послуги BIBI Cars (cash)", "amount":  1800, "payment_type": "cash_off_books", "type": "input"},
    ]
    tesla_total_official = sum(i["amount"] for i in tesla_items if i["payment_type"] in ("bank", "stripe", "internal"))
    tesla_total_cash     = sum(i["amount"] for i in tesla_items if i["payment_type"] == "cash_off_books")
    tesla_total_all      = tesla_total_official + tesla_total_cash

    tesla_doc = {
        "id": tesla_breakdown_id,
        "customerId": customer_id,
        "dealId": tesla_id,
        "kind": "final",
        "items": tesla_items,
        "totals": {
            "total_all":      tesla_total_all,
            "total_official": tesla_total_official,
            "total_cash":     tesla_total_cash,
        },
        "amount":   tesla_total_all,
        "total":    tesla_total_all,
        "currency": "EUR",
        "status":   "active",
        "locked":   True,
        "sourceFinalBreakdownDealId": tesla_id,
        "created_at": now - timedelta(days=80),
        "updated_at": now - timedelta(days=80),
    }
    await _db().invoices.update_one(
        {"id": tesla_breakdown_id},
        {"$setOnInsert": tesla_doc},
        upsert=True,
    )

    tesla_payments = [
        {
            "id": f"pay-{customer_id}-tesla-1",
            "deal_id": tesla_id,
            "customer_id": customer_id,
            "amount": tesla_total_official,
            "currency": "EUR",
            "method": "bank",
            "status": "confirmed",
            "note": "Single bank transfer (full official)",
            "created_at": (now - timedelta(days=75)).isoformat(),
            "confirmed_at": (now - timedelta(days=75)).isoformat(),
        },
        {
            "id": f"pay-{customer_id}-tesla-2",
            "deal_id": tesla_id,
            "customer_id": customer_id,
            "amount": tesla_total_cash,
            "currency": "EUR",
            "method": "cash_off_books",
            "status": "confirmed",
            "note": "Cash on delivery",
            "created_at": (now - timedelta(days=10)).isoformat(),
            "confirmed_at": (now - timedelta(days=10)).isoformat(),
        },
    ]
    for p in tesla_payments:
        await _db().payments.update_one({"id": p["id"]}, {"$setOnInsert": p}, upsert=True)

    # ── Deal 4 — Mercedes GLE, in_transit (auction_won), UNPAID ────────
    merc_id = f"deal_{customer_id}_4"
    merc_breakdown_id = f"fin-final-{customer_id}-4"
    merc_items = [
        {"key": "auction_price", "label": "Ціна авто (auction)",      "amount": 54300, "payment_type": "bank",           "type": "input"},
        {"key": "auction_fees",  "label": "Збори аукціону",            "amount":  2150, "payment_type": "bank",           "type": "input"},
        {"key": "shipping",      "label": "Доставка US → BG",          "amount":  3400, "payment_type": "bank",           "type": "input"},
        {"key": "customs_duty",  "label": "Митні платежі",             "amount":  5430, "payment_type": "bank",           "type": "formula"},
        {"key": "vat",           "label": "ПДВ (20%)",                 "amount": 12260, "payment_type": "bank",           "type": "formula"},
        {"key": "service_fee",   "label": "Послуги BIBI Cars (cash)",  "amount":  3000, "payment_type": "cash_off_books", "type": "input"},
    ]
    merc_total_official = sum(i["amount"] for i in merc_items if i["payment_type"] in ("bank", "stripe", "internal"))
    merc_total_cash     = sum(i["amount"] for i in merc_items if i["payment_type"] == "cash_off_books")
    merc_total_all      = merc_total_official + merc_total_cash

    merc_doc = {
        "id": merc_breakdown_id,
        "customerId": customer_id,
        "dealId": merc_id,
        "kind": "final",
        "items": merc_items,
        "totals": {
            "total_all":      merc_total_all,
            "total_official": merc_total_official,
            "total_cash":     merc_total_cash,
        },
        "amount":   merc_total_all,
        "total":    merc_total_all,
        "currency": "EUR",
        "status":   "active",
        "locked":   True,
        "sourceFinalBreakdownDealId": merc_id,
        "created_at": now - timedelta(days=3),
        "updated_at": now - timedelta(days=3),
    }
    await _db().invoices.update_one(
        {"id": merc_breakdown_id},
        {"$setOnInsert": merc_doc},
        upsert=True,
    )

    # No payments yet for Mercedes → cabinet will show "unpaid" with a
    # primary CTA "Pay €77,540 by card".

    # Recompute deal.payment_status / deal.payment_summary so the list
    # endpoint returns up-to-date snapshots without an extra round-trip.
    try:
        from payments_tracking import recompute_deal_payment_status
        for did in (bmw_id, tesla_id, merc_id):
            try:
                await recompute_deal_payment_status(did)
            except Exception:
                logger.exception(f"[CABINET-SEED] recompute failed for {did}")
    except Exception:
        logger.exception("[CABINET-SEED] payments_tracking import failed")


async def ensure_customer_seed(customer_id: str):
    """
    Create comprehensive mock data for the customer cabinet:
    customer + 4 deals (different stages) + 2 shipments + 4 invoices +
    3 contracts + 2 carfax + 8 notifications + 2 requests + 2 deposits +
    shipment events.
    Idempotent — uses upsert on 'id' keys.
    """
    now = datetime.now(timezone.utc)

    # 1. Customer profile
    existing = await _db().customers.find_one({'id': customer_id})
    if not existing:
        seed_customer = {
            'id': customer_id,
            'firstName': 'Alexander',
            'lastName': 'Demo',
            'name': 'Alexander Demo',
            'email': f'{customer_id}@bibi.cars',
            'phone': '+380671234567',
            'city': 'Kyiv',
            'telegram': '@bibi_demo',
            'avatar': None,
            'address': '12 Khreshchatyk St., Kyiv',
            'preferredLanguage': 'uk',
            'notificationChannels': ['email', 'sms', 'telegram'],
            'marketingOptIn': True,
            'emailVerified': True,
            'phoneVerified': True,
            'createdAt': now - timedelta(days=95),
            'updatedAt': now,
        }
        await _db().customers.insert_one(seed_customer)

    manager_info = {
        'managerId': 'mgr_001',
        'managerName': 'Iryna Petrenko',
        'managerPhone': '+380509876543',
        'managerEmail': 'irina@bibi.cars',
    }

    # 2. Deals (multiple — different stages for visual coverage)
    deals_seed = [
        {
            'id': f"deal_{customer_id}_1",
            'title': 'BMW X5 xDrive40i 2023',
            'vehicleTitle': 'BMW X5 xDrive40i 2023',
            'vin': 'WBAJA7C52KWW12345',
            'lot': '67823459',
            'status': 'in_transit',
            'clientPrice': 58400,
            'auctionPrice': 42000,
            'auctionName': 'Copart',
            'auctionDate': (now - timedelta(days=22)).isoformat(),
            'brand': 'BMW',
            'model': 'X5 xDrive40i',
            'year': 2023,
            'mileage': 48320,
            'color': 'Alpine White',
            'damage': 'Front End',
            'created_at': now - timedelta(days=30),
            'updated_at': now - timedelta(hours=6),
            'mainImage': 'https://images.unsplash.com/photo-1555215695-3004980ad54e?w=800',
            'stages': [
                {'code': 'selection',  'done': True,  'date': (now - timedelta(days=30)).isoformat()},
                {'code': 'contract',   'done': True,  'date': (now - timedelta(days=28)).isoformat()},
                {'code': 'payment',    'done': True,  'date': (now - timedelta(days=20)).isoformat()},
                {'code': 'shipping',   'done': False, 'date': None},
                {'code': 'received',   'done': False, 'date': None},
            ],
            **manager_info,
        },
        {
            'id': f"deal_{customer_id}_2",
            'title': 'Tesla Model 3 Long Range 2022',
            'vehicleTitle': 'Tesla Model 3 Long Range 2022',
            'vin': '5YJ3E1EB5NF123456',
            'lot': '55123478',
            'status': 'delivered',
            'clientPrice': 34900,
            'auctionPrice': 24500,
            'auctionName': 'IAAI',
            'auctionDate': (now - timedelta(days=88)).isoformat(),
            'brand': 'Tesla',
            'model': 'Model 3 Long Range',
            'year': 2022,
            'mileage': 28140,
            'color': 'Deep Blue Metallic',
            'damage': 'Minor (Rear)',
            'created_at': now - timedelta(days=90),
            'updated_at': now - timedelta(days=7),
            'deliveredAt': (now - timedelta(days=7)).isoformat(),
            'mainImage': 'https://images.unsplash.com/photo-1560958089-b8a1929cea89?w=800',
            'stages': [
                {'code': 'selection', 'done': True, 'date': (now - timedelta(days=90)).isoformat()},
                {'code': 'contract',  'done': True, 'date': (now - timedelta(days=88)).isoformat()},
                {'code': 'payment',   'done': True, 'date': (now - timedelta(days=75)).isoformat()},
                {'code': 'shipping',  'done': True, 'date': (now - timedelta(days=25)).isoformat()},
                {'code': 'received',  'done': True, 'date': (now - timedelta(days=7)).isoformat()},
            ],
            **manager_info,
        },
        {
            'id': f"deal_{customer_id}_3",
            'title': 'Audi Q7 Premium Plus 2024',
            'vehicleTitle': 'Audi Q7 Premium Plus 2024',
            'vin': 'WA1LAAF72RD012345',
            'lot': '71294851',
            'status': 'contract_pending',
            'clientPrice': 64200,
            'auctionPrice': 48500,
            'auctionName': 'Copart',
            'auctionDate': (now + timedelta(days=3)).isoformat(),
            'brand': 'Audi',
            'model': 'Q7 Premium Plus',
            'year': 2024,
            'mileage': 12840,
            'color': 'Mythos Black',
            'damage': 'Minor (Left Side)',
            'created_at': now - timedelta(days=5),
            'updated_at': now - timedelta(hours=2),
            'mainImage': 'https://images.unsplash.com/photo-1606664515524-ed2f786a0bd6?w=800',
            'stages': [
                {'code': 'selection', 'done': True,  'date': (now - timedelta(days=5)).isoformat()},
                {'code': 'contract',  'done': False, 'date': None},
                {'code': 'payment',   'done': False, 'date': None},
                {'code': 'shipping',  'done': False, 'date': None},
                {'code': 'received',  'done': False, 'date': None},
            ],
            **manager_info,
        },
        {
            'id': f"deal_{customer_id}_4",
            'title': 'Mercedes-Benz GLE 450 2023',
            'vehicleTitle': 'Mercedes-Benz GLE 450 2023',
            'vin': '4JGFB5KB4PB098765',
            'lot': '69185432',
            'status': 'auction_won',
            'clientPrice': 71800,
            'auctionPrice': 54300,
            'auctionName': 'IAAI',
            'auctionDate': (now - timedelta(days=1)).isoformat(),
            'brand': 'Mercedes-Benz',
            'model': 'GLE 450',
            'year': 2023,
            'mileage': 18920,
            'color': 'Obsidian Black',
            'damage': 'None',
            'created_at': now - timedelta(days=14),
            'updated_at': now - timedelta(hours=18),
            'mainImage': 'https://images.unsplash.com/photo-1618843479313-40f8afb4b4d8?w=800',
            'stages': [
                {'code': 'selection', 'done': True, 'date': (now - timedelta(days=14)).isoformat()},
                {'code': 'contract',  'done': True, 'date': (now - timedelta(days=10)).isoformat()},
                {'code': 'payment',   'done': True, 'date': (now - timedelta(days=5)).isoformat()},
                {'code': 'shipping',  'done': False, 'date': None},
                {'code': 'received',  'done': False, 'date': None},
            ],
            **manager_info,
        },
    ]
    for d in deals_seed:
        d['customerId'] = customer_id
        await _db().deals.update_one({'id': d['id']}, {'$setOnInsert': d}, upsert=True)

    # 3. Shipments — одна активная (BMW, real live vessel) + одна доставленная (Tesla) + одна у порту (Mercedes)
    # NOTE: BMW uses a REAL vessel (CMA CGM HARMONY, MMSI 256849000) which is
    # regularly present in VesselFinder data. This makes the live-tracking flow
    # work end-to-end in the customer cabinet as soon as VF cookies are synced.
    REAL_VESSEL = {
        'name': 'CMA CGM HARMONY',
        'mmsi': '256849000',
        'imo': None,
        'boundAt': now,
    }
    ship_id_bmw = f"ship_{customer_id}_1"
    existing_bmw = await _db().shipments.find_one({'id': ship_id_bmw})
    # One-time migration: replace the old fake vessel with the real one so
    # existing seeded accounts get live tracking too.
    if existing_bmw and (existing_bmw.get('vessel') or {}).get('mmsi') != REAL_VESSEL['mmsi']:
        # Update top-level vessel AND the vessel stage inside stages[]
        stage_vessel_clean = {k: v for k, v in REAL_VESSEL.items() if k != 'boundAt'}
        set_ops = {
            'vessel': REAL_VESSEL,
            'trackingActive': True,
            'trackingSource': existing_bmw.get('trackingSource') or 'simulated',
            'updatedAt': now,
        }
        stages_list = existing_bmw.get('stages') or []
        for idx, st in enumerate(stages_list):
            if (st or {}).get('type') == 'vessel':
                set_ops[f'stages.{idx}.vessel'] = stage_vessel_clean
        await _db().shipments.update_one({'id': ship_id_bmw}, {'$set': set_ops})
    if not existing_bmw:
        origin = {'name': 'Newark, NJ', 'lat': 40.687, 'lng': -74.172}
        destination = {'name': 'Odesa, UA', 'lat': 46.4825, 'lng': 30.7233}
        route = generate_route(origin, destination)
        # Atomic upsert: if another concurrent request already inserted this
        # shipment between our find_one() and this call, we just no-op.
        await _db().shipments.update_one(
            {'id': ship_id_bmw},
            {'$setOnInsert': {
                'id': ship_id_bmw,
                'dealId': f"deal_{customer_id}_1",
                'customerId': customer_id,
                'managerId': 'mgr_001',
                'vin': 'WBAJA7C52KWW12345',
                'vehicleTitle': 'BMW X5 xDrive40i 2023',
                'containerNumber': 'MSCU7894512',
                'carrier': 'CMA CGM',
                'vessel': REAL_VESSEL,
                'status': 'in_transit',
                'origin': origin,
                'destination': destination,
                'route': route,
                'currentPosition': {**origin, 'source': 'simulated'},
                'progress': 0.35,
                'lastEventProgress': 0.2,
                'originPort': 'Newark, NJ',
                'destinationPort': 'Odesa, UA',
                'estimatedPickupDate': (now - timedelta(days=22)).isoformat(),
                'estimatedDepartureDate': (now - timedelta(days=18)).isoformat(),
                'estimatedArrivalDate': (now + timedelta(days=14)).isoformat(),
                'estimatedDeliveryDate': (now + timedelta(days=18)).isoformat(),
                'trackingActive': True,
                'trackingSource': 'simulated',
                'liveEta': (now + timedelta(days=14)).isoformat().replace('+00:00', 'Z'),
                'created_at': now - timedelta(days=22),
            }},
            upsert=True,
        )

    ship_id_tesla = f"ship_{customer_id}_2"
    await _db().shipments.update_one(
        {'id': ship_id_tesla},
        {'$setOnInsert': {
            'id': ship_id_tesla,
            'dealId': f"deal_{customer_id}_2",
            'customerId': customer_id,
            'managerId': 'mgr_001',
            'vin': '5YJ3E1EB5NF123456',
            'vehicleTitle': 'Tesla Model 3 Long Range 2022',
            'containerNumber': 'HLCU4512378',
            'carrier': 'Hapag-Lloyd',
            'vessel': {'imo': '9320626', 'name': 'HANOVER BRIDGE'},
            'status': 'delivered',
            'origin': {'name': 'Long Beach, CA', 'lat': 33.77, 'lng': -118.19},
            'destination': {'name': 'Odesa, UA', 'lat': 46.4825, 'lng': 30.7233},
            'route': generate_route({'lat': 33.77, 'lng': -118.19, 'name': 'Long Beach, CA'},
                                    {'lat': 46.4825, 'lng': 30.7233, 'name': 'Odesa, UA'}),
            'currentPosition': {'lat': 46.4825, 'lng': 30.7233, 'source': 'delivered'},
            'progress': 1.0,
            'lastEventProgress': 1.0,
            'originPort': 'Long Beach, CA',
            'destinationPort': 'Odesa, UA',
            'estimatedArrivalDate': (now - timedelta(days=12)).isoformat(),
            'actualArrivalDate': (now - timedelta(days=10)).isoformat(),
            'deliveredDate': (now - timedelta(days=7)).isoformat(),
            'trackingActive': False,
            'trackingSource': 'delivered',
            'liveEta': None,
            'created_at': now - timedelta(days=75),
        }},
        upsert=True,
    )

    ship_id_merc = f"ship_{customer_id}_3"
    origin_m = {'name': 'Houston, TX', 'lat': 29.75, 'lng': -95.36}
    destination_m = {'name': 'Klaipeda, LT', 'lat': 55.71, 'lng': 21.13}
    await _db().shipments.update_one(
        {'id': ship_id_merc},
        {'$setOnInsert': {
            'id': ship_id_merc,
            'dealId': f"deal_{customer_id}_4",
            'customerId': customer_id,
            'managerId': 'mgr_001',
            'vin': '4JGFB5KB4PB098765',
            'vehicleTitle': 'Mercedes-Benz GLE 450 2023',
            'containerNumber': 'CMAU9812345',
            'carrier': 'CMA CGM',
            'vessel': {'imo': '9454436', 'name': 'CMA CGM MARCO POLO'},
            'status': 'at_port',
            'origin': origin_m,
            'destination': destination_m,
            'route': generate_route(origin_m, destination_m),
            'currentPosition': {**destination_m, 'source': 'simulated'},
            'progress': 0.95,
            'lastEventProgress': 0.8,
            'originPort': 'Houston, TX',
            'destinationPort': 'Klaipeda, LT',
            'estimatedArrivalDate': (now - timedelta(days=1)).isoformat(),
            'estimatedDeliveryDate': (now + timedelta(days=6)).isoformat(),
            'trackingActive': True,
            'trackingSource': 'simulated',
            'liveEta': (now + timedelta(days=6)).isoformat().replace('+00:00', 'Z'),
            'created_at': now - timedelta(days=14),
        }},
        upsert=True,
    )

    # 3b. Shipment events for timeline
    events_to_seed = [
        (ship_id_bmw, 'loaded_on_vessel', '📦 Завантажено на судно MSC OSCAR', 'Newark, NJ', -18, 0.05),
        (ship_id_bmw, 'departed', '🚢 Відплив з порту Newark', 'Newark, NJ', -17, 0.1),
        (ship_id_bmw, 'position_update', '🌊 Атлантичний океан', 'Atlantic Ocean', -10, 0.25),
        (ship_id_tesla, 'delivered', '✅ Автомобіль отримано', 'Odesa, UA', -7, 1.0),
        (ship_id_tesla, 'customs_cleared', '📋 Митниця пройдена', 'Odesa, UA', -9, 0.95),
        (ship_id_tesla, 'arrived_at_port', '⚓ Прибуття в порт', 'Odesa, UA', -10, 0.9),
        (ship_id_merc, 'arrived_at_port', '⚓ Прибуття в порт Клайпеда', 'Klaipeda, LT', -1, 0.95),
        (ship_id_merc, 'unloading', '🏗️ Розвантаження', 'Klaipeda, LT', 0, 0.95),
    ]
    for (sid, etype, title, loc, day_offset, progress) in events_to_seed:
        evt_key = f"evt_{sid}_{etype}"
        existing_event = await _db().shipment_events.find_one({'id': evt_key})
        if not existing_event:
            await _db().shipment_events.insert_one({
                'id': evt_key,
                'shipmentId': sid,
                'type': etype,
                'title': title,
                'description': title,
                'location': loc,
                'meta': {'progress': progress},
                'customerId': customer_id,
                'timestamp': now + timedelta(days=day_offset, hours=-3),
            })

    # 4. Invoices — 4 штуки (paid, paid, pending, overdue)
    invoices_seed = [
        {
            'id': f"inv_{customer_id}_1",
            'number': 'INV-2026-0412',
            'dealId': f"deal_{customer_id}_1",
            'amount': 58400,
            'currency': 'USD',
            'status': 'paid',
            'issueDate': (now - timedelta(days=20)).isoformat(),
            'dueDate': (now - timedelta(days=5)).isoformat(),
            'paidDate': (now - timedelta(days=14)).isoformat(),
            'description': 'Повна оплата за BMW X5 xDrive40i 2023',
            'items': [
                {'name': 'Вартість авто (auction)', 'amount': 42000},
                {'name': 'Послуги BIBI Cars', 'amount': 3500},
                {'name': 'Доставка та логістика', 'amount': 4200},
                {'name': 'Мито та збори', 'amount': 8700},
            ],
            'created_at': now - timedelta(days=20),
        },
        {
            'id': f"inv_{customer_id}_2",
            'number': 'INV-2026-0288',
            'dealId': f"deal_{customer_id}_2",
            'amount': 34900,
            'currency': 'USD',
            'status': 'paid',
            'issueDate': (now - timedelta(days=82)).isoformat(),
            'dueDate': (now - timedelta(days=67)).isoformat(),
            'paidDate': (now - timedelta(days=75)).isoformat(),
            'description': 'Повна оплата за Tesla Model 3 Long Range 2022',
            'items': [
                {'name': 'Вартість авто', 'amount': 24500},
                {'name': 'Послуги BIBI Cars', 'amount': 2800},
                {'name': 'Доставка', 'amount': 3400},
                {'name': 'Мито', 'amount': 4200},
            ],
            'created_at': now - timedelta(days=82),
        },
        {
            'id': f"inv_{customer_id}_3",
            'number': 'INV-2026-0508',
            'dealId': f"deal_{customer_id}_4",
            'amount': 71800,
            'currency': 'USD',
            'status': 'pending',
            'issueDate': (now - timedelta(days=4)).isoformat(),
            'dueDate': (now + timedelta(days=3)).isoformat(),
            'paidDate': None,
            'description': 'Передплата за Mercedes-Benz GLE 450 2023',
            'items': [
                {'name': 'Депозит (30%)', 'amount': 21540},
                {'name': 'Основна оплата (70%)', 'amount': 50260},
            ],
            'created_at': now - timedelta(days=4),
        },
        {
            'id': f"inv_{customer_id}_4",
            'number': 'INV-2026-0312',
            'dealId': f"deal_{customer_id}_3",
            'amount': 19260,
            'currency': 'USD',
            'status': 'pending',
            'issueDate': (now - timedelta(days=2)).isoformat(),
            'dueDate': (now + timedelta(days=5)).isoformat(),
            'paidDate': None,
            'description': 'Депозит за Audi Q7 Premium Plus 2024',
            'items': [
                {'name': 'Депозит (30% від $64,200)', 'amount': 19260},
            ],
            'created_at': now - timedelta(days=2),
        },
    ]
    for inv in invoices_seed:
        inv['customerId'] = customer_id
        await _db().invoices.update_one({'id': inv['id']}, {'$setOnInsert': inv}, upsert=True)

    # 5. Contracts — 3 штуки
    contracts_seed = [
        {
            'id': f"ctr_{customer_id}_1",
            'dealId': f"deal_{customer_id}_1",
            'number': 'BIB-2026-0328',
            'title': 'Договір поставки BMW X5 xDrive40i',
            'status': 'signed',
            'signedDate': (now - timedelta(days=28)).isoformat(),
            'url': None,
            'created_at': now - timedelta(days=29),
        },
        {
            'id': f"ctr_{customer_id}_2",
            'dealId': f"deal_{customer_id}_2",
            'number': 'BIB-2025-1178',
            'title': 'Договір поставки Tesla Model 3',
            'status': 'signed',
            'signedDate': (now - timedelta(days=88)).isoformat(),
            'url': None,
            'created_at': now - timedelta(days=89),
        },
        {
            'id': f"ctr_{customer_id}_3",
            'dealId': f"deal_{customer_id}_3",
            'number': 'BIB-2026-0487',
            'title': 'Договір поставки Audi Q7 Premium Plus',
            'status': 'pending',
            'signedDate': None,
            'url': None,
            'created_at': now - timedelta(days=4),
        },
    ]
    for c in contracts_seed:
        c['customerId'] = customer_id
        await _db().contracts.update_one({'id': c['id']}, {'$setOnInsert': c}, upsert=True)

    # 6. Carfax reports — 2 штуки
    carfax_seed = [
        {
            'id': f"carfax_{customer_id}_1",
            'dealId': f"deal_{customer_id}_1",
            'vin': 'WBAJA7C52KWW12345',
            'vehicleTitle': 'BMW X5 xDrive40i 2023',
            'status': 'ready',
            'issuedAt': (now - timedelta(days=24)).isoformat(),
            'reportUrl': None,
            'summary': {
                'ownersCount': 1,
                'accidents': 0,
                'mileage': 48320,
                'serviceRecords': 7,
                'titleBrand': 'Clean',
                'lastInspection': (now - timedelta(days=45)).isoformat(),
            },
        },
        {
            'id': f"carfax_{customer_id}_2",
            'dealId': f"deal_{customer_id}_2",
            'vin': '5YJ3E1EB5NF123456',
            'vehicleTitle': 'Tesla Model 3 Long Range 2022',
            'status': 'ready',
            'issuedAt': (now - timedelta(days=85)).isoformat(),
            'reportUrl': None,
            'summary': {
                'ownersCount': 2,
                'accidents': 1,
                'mileage': 28140,
                'serviceRecords': 4,
                'titleBrand': 'Clean',
                'lastInspection': (now - timedelta(days=92)).isoformat(),
            },
        },
    ]
    for cfx in carfax_seed:
        cfx['customerId'] = customer_id
        await _db().carfax_reports.update_one({'id': cfx['id']}, {'$setOnInsert': cfx}, upsert=True)

    # 7. Notifications — 8 штук (mix read/unread, different types)
    if await _db().notifications.count_documents({'customerId': customer_id}) == 0:
        await _db().notifications.insert_many([
            {
                'id': f"notif_{customer_id}_1",
                'customerId': customer_id,
                'title': 'Договір підписано',
                'message': 'Договір BIB-2026-0328 успішно підписано',
                'type': 'contract',
                'isRead': True,
                'createdAt': now - timedelta(days=28),
            },
            {
                'id': f"notif_{customer_id}_2",
                'customerId': customer_id,
                'title': 'Оплату отримано',
                'message': 'Платіж $58,400 за BMW X5 зараховано',
                'type': 'invoice',
                'isRead': True,
                'createdAt': now - timedelta(days=14),
            },
            {
                'id': f"notif_{customer_id}_3",
                'customerId': customer_id,
                'title': 'Авто завантажено на судно',
                'message': 'MSC OSCAR — Newark, NJ → Odesa',
                'type': 'shipping',
                'isRead': True,
                'createdAt': now - timedelta(days=18),
            },
            {
                'id': f"notif_{customer_id}_4",
                'customerId': customer_id,
                'title': 'Tesla Model 3 доставлено',
                'message': 'Автомобіль успішно передано. Дякуємо за вибір BIBI Cars!',
                'type': 'delivery',
                'isRead': True,
                'createdAt': now - timedelta(days=7),
            },
            {
                'id': f"notif_{customer_id}_5",
                'customerId': customer_id,
                'title': '⚓ Mercedes-Benz GLE 450 прибуло в порт',
                'message': 'Автомобіль у Клайпеді. Митне оформлення розпочато.',
                'type': 'shipping',
                'isRead': False,
                'createdAt': now - timedelta(days=1, hours=4),
            },
            {
                'id': f"notif_{customer_id}_6",
                'customerId': customer_id,
                'title': '🎉 Ви виграли аукціон!',
                'message': 'Лот Mercedes-Benz GLE 450 успішно придбано за $54,300',
                'type': 'auction',
                'isRead': False,
                'createdAt': now - timedelta(hours=18),
            },
            {
                'id': f"notif_{customer_id}_7",
                'customerId': customer_id,
                'title': 'Рахунок на депозит за Audi Q7',
                'message': 'Рахунок INV-2026-0312 на $19,260 — оплатіть до 23.04.2026',
                'type': 'invoice',
                'isRead': False,
                'createdAt': now - timedelta(days=2),
            },
            {
                'id': f"notif_{customer_id}_8",
                'customerId': customer_id,
                'title': '📝 Договір готовий до підпису',
                'message': 'BIB-2026-0487 на Audi Q7 Premium Plus очікує вашого підпису',
                'type': 'contract',
                'isRead': False,
                'createdAt': now - timedelta(hours=6),
            },
        ])

    # 8. Requests / leads — 2 штуки
    requests_seed = [
        {
            'id': f"lead_{customer_id}_1",
            'firstName': 'Alexander',
            'lastName': 'Demo',
            'vin': 'WDDWF4KB0KR234567',
            'status': 'new',
            'vehicleRequest': 'Looking for Mercedes-Benz C-Class 2020-2022',
            'budget': 30000,
            'createdAt': now - timedelta(days=7),
        },
        {
            'id': f"lead_{customer_id}_2",
            'firstName': 'Alexander',
            'lastName': 'Demo',
            'vin': None,
            'status': 'processing',
            'vehicleRequest': 'Porsche Macan S 2023 selection',
            'budget': 65000,
            'createdAt': now - timedelta(days=3),
        },
    ]
    for r in requests_seed:
        r['customerId'] = customer_id
        r['created_at'] = r['createdAt']
        await _db().leads.update_one({'id': r['id']}, {'$setOnInsert': r}, upsert=True)

    # 9. Deposits — 2 штуки
    deposits_seed = [
        {
            'id': f"dep_{customer_id}_1",
            'dealId': f"deal_{customer_id}_4",
            'amount': 5000,
            'currency': 'USD',
            'status': 'held',
            'purpose': 'Депозит на аукціон Mercedes-Benz GLE 450',
            'created_at': now - timedelta(days=14),
            'returnDate': (now - timedelta(days=5)).isoformat(),
        },
        {
            'id': f"dep_{customer_id}_2",
            'dealId': f"deal_{customer_id}_2",
            'amount': 3000,
            'currency': 'USD',
            'status': 'refunded',
            'purpose': 'Депозит на аукціон Tesla Model 3',
            'created_at': now - timedelta(days=92),
            'returnDate': (now - timedelta(days=88)).isoformat(),
        },
    ]
    for d in deposits_seed:
        d['customerId'] = customer_id
        await _db().deposits.update_one({'id': d['id']}, {'$setOnInsert': d}, upsert=True)

    # 10. Financial breakdowns (P1.2-cabinet) — proper schema for cabinet UI
    #     One `final` breakdown per deal that has reached at least 'auction_won'
    #     stage, plus matching `confirmed` payments to demonstrate the
    #     paid/partial/unpaid states in the customer cabinet.
    await _seed_customer_financials(customer_id, now)


async def require_customer(authorization: Optional[str]) -> Dict[str, Any]:
    """Resolve the Bearer session into a customer doc; 401 if missing/expired."""
    customer = await _resolve_bearer(authorization)
    if not customer:
        raise HTTPException(status_code=401, detail="Authentication required")
    return customer

