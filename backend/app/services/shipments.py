"""
app/services/shipments.py — Phase 5.5/I (cluster-owned)
========================================================

Canonical home for the **shipments orchestration cluster** retired
from ``server.py`` in Phase 5.5 / I (2026-05-20). This module hosts
the service-tier orchestration trio:

  * ``ensure_shipment_stages(shipment)`` — stage-lifecycle backfill +
    in-place normalization. Idempotent. Returns the (possibly
    mutated) shipment dict; caller persists via
    ``_persist_stages_backfill`` if ``_stages_backfilled`` flag set.
  * ``add_shipment_event(...)`` — async event-log writer with two
    side channels: (a) Motor ``$push`` + ``$slice -40`` to
    ``shipments.events[]`` + ``$set`` lastEvent/lastEventTime/updated_at
    keys; (b) Socket.IO ``shipment:event`` emit on ``user_{customer_id}``
    room. Schema preserved 1:1 (D5). Async shape preserved 1:1 (D6).
  * ``generate_route(origin, destination)`` — pure 5-point ocean route
    helper (origin + 3 waypoints + destination). No I/O, no async.

History
───────
  * Phase 5.5 / D — ``generate_route`` registered in
    ``EXTRACTION_AUX_BRIDGES`` as ``CUSTOMER_AUTH_DEP`` (consumer:
    ``app/services/customers.py``).
  * Phase 5.5 / G — ``add_shipment_event`` registered in
    ``EXTRACTION_AUX_BRIDGES`` as ``RESOLVER_DEP`` (consumer:
    ``app/services/identity_runtime.py`` via the thin
    ``_add_shipment_event`` async wrapper).
  * Phase 5.5 / I (2026-05-20) — **CLUSTER RETIRED**. All 3 symbols
    moved verbatim from ``server.py`` to this module under the
    cluster-retirement pattern established by 5.5/G and reproduced
    in 5.5/H. The two helper deps that ``ensure_shipment_stages``
    needs (``_normalize_stage`` + ``build_default_stages``) remain
    in ``server.py`` (they have 7+4 in-file callsites and belong to
    the orchestration shell that 5.5/I is decomposing — moving them
    is scope creep per D1). They are reached via lazy local imports
    inside ``ensure_shipment_stages`` and registered as the
    ``SHIPMENTS_DEP`` extraction-aux entries (kind=SHIPMENTS_DEP,
    tier=C-aux) — mirror of the 5.5/H ``_tracking_snapshot``
    cataloguing pattern.

Migration constraints (user-locked D-set, 2026-05-20)
─────────────────────────────────────────────────────

  * D1  cluster retirement ONLY (single focused commit)
  * D2  canonical home: this module (NEW)
  * D3  no worker-lifecycle refactor — workers untouched
  * D4  no provider-algorithm edits — stage state-machine + route
        algorithm + event writer preserved byte-for-byte
  * D5  no schema evolution — shipment + stages + events keys 1:1
  * D6  no async orchestration changes — signatures + ``$push``
        + ``$slice -40`` + ``$set`` shape + ``sio.emit`` room
        format preserved 1:1
  * D7  golden suite FIRST
        (``tests/test_phase5_5_i_shipments_orchestration.py``)
  * D8  no orchestration improvements — no stage redesign, no
        workflow simplification, no event-model cleanup, no route
        optimization, no async scheduling edits, no shipment
        schema changes

After 5.5/I closes
──────────────────

  ``server.py`` holds **ZERO Tier-C ``from server import …``
  bridges**. Phase 5 disentangling officially ends; Phase 6
  (Production hardening) starts.

This module sits next to the existing ``app/utils/shipments.py``
pure-utils tier (which hosts ``serialize_journey``,
``get_current_stage``, ``is_valid_movement``, ``_smooth_eta_iso``
since Phase 5.4 / C-5a–C-5e). The two-module pattern is
intentional: utils tier = pure functions over a shipment dict;
service tier = orchestration with I/O side effects (db.shipments
mutation + sio side channel).
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

logger = logging.getLogger("bibi-v3.2")


# ─────────────────────────────────────────────────────────────────────
# Live runtime accessors (db_runtime + socket_runtime)
# ─────────────────────────────────────────────────────────────────────
#
# Same pattern as ``app/services/identity_runtime.py``:
# resolve the live Motor handle + AsyncServer at call time, so
# startup ordering does not stale-lock this service module.

from app.core.db_runtime import get_db  # noqa: E402  (lazy-bridge → accessor)


def _db():
    """Live Motor handle — resolves at call-time, not at module-load.

    Phase 5.4 / C-4i pattern (``app.core.db_runtime.get_db()``).
    """
    return get_db()


def _sio():
    """Live ``python-socketio.AsyncServer`` from the socket runtime accessor.

    Phase 5.4 / C-4c pattern (``app.core.socket_runtime.get_sio()``).
    """
    from app.core.socket_runtime import get_sio  # noqa: E402
    return get_sio()


# ─────────────────────────────────────────────────────────────────────
# generate_route — pure 5-point ocean route helper
# ─────────────────────────────────────────────────────────────────────

def generate_route(origin, destination):
    """
    Generate realistic ocean route from origin to destination
    Adds waypoints for Atlantic crossing

    Phase 5.5/I — body MOVED VERBATIM from ``server.py:5078``. Pure
    function — no I/O, no async. Signature + 5-point waypoint shape
    preserved byte-for-byte (D4: no route optimization).
    """
    if not origin or not destination:
        return []

    # Calculate waypoints based on geographic logic
    start_lat, start_lng = origin["lat"], origin["lng"]
    end_lat, end_lng = destination["lat"], destination["lng"]

    # Simple 4-point route (can be improved with real shipping lanes)
    waypoints = [
        origin,
        {"lat": start_lat - 10, "lng": start_lng + 20},  # First turn
        {"lat": (start_lat + end_lat) / 2, "lng": (start_lng + end_lng) / 2},  # Mid-ocean
        {"lat": end_lat - 5, "lng": end_lng - 10},  # Approach
        destination,
    ]

    return waypoints


# ─────────────────────────────────────────────────────────────────────
# ensure_shipment_stages — stage-lifecycle backfill / normalization
# ─────────────────────────────────────────────────────────────────────

def ensure_shipment_stages(shipment: Dict[str, Any]) -> Dict[str, Any]:
    """
    Lazy backfill for old shipments that don't have a stages[] array yet.
    Returns the (possibly mutated) shipment dict. Caller must persist via
    db.shipments.update_one if backfill happened (flag `_stages_backfilled`).

    Phase 5.5/I — body MOVED VERBATIM from ``server.py:5472``. The two
    helper deps (``_normalize_stage`` + ``build_default_stages``) remain
    in ``server.py`` (7+4 in-file callsites in the orchestration shell);
    they are reached via lazy local imports here (registered as
    SHIPMENTS_DEP extraction-aux entries — mirror of the 5.5/H
    ``_tracking_snapshot`` cataloguing pattern).
    """
    if not shipment:
        return shipment
    # Phase 6.2.ACTUAL (2026-05-20) — Shell Thinning: the two helpers
    # below were retired from ``server.py`` as the last 2 SHIPMENTS_DEP
    # aux-bridges. They now live in ``app.utils.shipments`` (sibling of
    # ``get_current_stage`` + ``serialize_journey``). The lazy local
    # import is now to the canonical home — not back to server.py.
    # ZERO lazy-bridge to server remains in this module. The 5.5/I
    # SHIPMENTS_DEP bridges are formally retired.
    from app.utils.shipments import _normalize_stage, build_default_stages

    stages = shipment.get("stages")
    if isinstance(stages, list) and stages:
        # normalize in-place (idempotent)
        normalized = [_normalize_stage(s, i, len(stages)) for i, s in enumerate(stages)]
        shipment["stages"] = normalized
        current_id = shipment.get("currentStageId")
        valid_ids = {s["id"] for s in normalized}
        if current_id not in valid_ids:
            # pick first 'active' or first 'pending' or first
            active = next((s for s in normalized if s.get("status") == "active"), None)
            shipment["currentStageId"] = (active or normalized[0])["id"]
        return shipment

    # Build default stages from legacy shipment shape
    stages = build_default_stages(
        origin=shipment.get("origin"),
        destination=shipment.get("destination"),
        vessel=shipment.get("vessel"),
    )
    shipment["stages"] = stages
    shipment["currentStageId"] = stages[0]["id"]
    shipment["_stages_backfilled"] = True
    return shipment


# ─────────────────────────────────────────────────────────────────────
# add_shipment_event — async event-log writer + sio side channel
# ─────────────────────────────────────────────────────────────────────

async def add_shipment_event(
    shipment_id: str,
    event_type: str,
    label: str,
    meta: Optional[Dict[str, Any]] = None,
    customer_id: Optional[str] = None,
) -> None:
    """
    Append an event to shipment.events[]. Also persists the last 40 events and
    emits a Socket.IO 'shipment:event' side-channel the UI can subscribe to.

    Phase 5.5/I — body MOVED VERBATIM from ``server.py:5539``. Schema
    (``$push events`` + ``$slice -40`` + ``$set lastEvent / lastEventTime
    / updated_at``) preserved 1:1 (D5). Async shape (``await
    db.shipments.update_one`` + ``await sio.emit`` in separate
    try-except blocks — emit must run even when persist fails)
    preserved 1:1 (D6). The two module-global references (``db``, ``sio``)
    that the legacy body relied on are now resolved via the call-time
    ``_db()`` / ``_sio()`` accessors — semantics identical because both
    resolve to the same singletons that were ``server.db`` /
    ``server.sio`` previously.
    """
    now = datetime.now(timezone.utc)
    event = {
        "type": event_type,
        "label": label,
        "createdAt": now,
        "meta": meta or {},
    }
    try:
        await _db().shipments.update_one(
            {"id": shipment_id},
            {
                "$push": {"events": {"$each": [event], "$slice": -40}},
                "$set": {"lastEvent": event_type, "lastEventTime": now, "updated_at": now},
            },
        )
    except Exception as e:
        logger.warning(f"[JOURNEY] event persist failed {shipment_id}/{event_type}: {e}")
    try:
        if customer_id:
            await _sio().emit(
                "shipment:event",
                {"shipmentId": shipment_id, "type": event_type, "label": label,
                 "createdAt": now.isoformat().replace("+00:00", "Z")},
                room=f"user_{customer_id}",
            )
    except Exception:
        pass


# ─────────────────────────────────────────────────────────────────────
# Public surface
# ─────────────────────────────────────────────────────────────────────

__all__ = [
    "ensure_shipment_stages",
    "add_shipment_event",
    "generate_route",
]
