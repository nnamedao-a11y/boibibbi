"""
app/services/identity_runtime.py — Phase 5.5/G + 5.5/H (cluster-owned)
=====================================================================

Boundary wrapper around the identity / transfer / shipment-event runtime,
**now owning the legacy auto-resolver cluster verbatim** (Phase 5.5/G,
2026-05-20) **with the VesselFinder-providers aux retired in 5.5/H**.

History
───────
  * Phase 3.2 / C-1 — module created as a thin boundary wrapper around
    ``ShipmentIdentityResolver``, ``AutoTransferDetector`` and the
    legacy ``_AutoResolver`` path that lived in ``server.py``.
    Methods M-4 and M-5 lazy-bridged to ``server._run_auto_resolver``
    and ``server._persist_resolver_hits``.
  * Phase 5.5 / G — the legacy cluster moved here verbatim (D4: no
    algorithm edits, D5: no schema evolution, D6: no async
    orchestration changes). M-4 / M-5 now hold the function bodies
    directly; the ``from server import _run_auto_resolver`` /
    ``_persist_resolver_hits`` lazy-bridge tokens have been retired.
    Three module-private helpers travel with the cluster:
    ``_resolver_shipsgo_lookup``, ``_resolver_vf_search``,
    ``_get_auto_resolver``. Two aux deps remained on the server side
    (lazy-imported at call time):
       - ``_external_container_lookup`` — ShipsGo / API lookup
         co-located with admin tracking surface (RETIRED in 5.5/H).
       - ``add_shipment_event`` — shipment-events writer with sio
         side-channel (belongs to the upcoming 5.5/I shipment
         orchestration wave — STAYS).
  * Phase 5.5 / H (2026-05-20) — ``_external_container_lookup`` retired
    from server.py and rehomed at ``app/services/tracking_providers.py``
    as the public ``external_container_lookup`` (no underscore).
    The ``_external_container_lookup_callable()`` lazy-bridge accessor
    introduced here in 5.5/G has been retired entirely; the local shim
    ``_resolver_shipsgo_lookup`` now imports the canonical function
    directly from its new home. Only ``add_shipment_event`` remains as
    a RESOLVER_DEP — registered in ``EXTRACTION_AUX_BRIDGES`` with
    ``kind="RESOLVER_DEP"`` and ``tier="C-aux"``, retirement target
    5.5/I.

Hard contract (locked in ``/app/PHASE3_2_EVENT_BOUNDARY_DESIGN.md``)
─────────────────────────────────────────────────────────────────────

    H-1  Resolver modules remain Socket.IO-free.
    H-2  This service is a BOUNDARY WRAPPER, never a replacement of
         resolver logic.
    H-3  ``shipment:update`` payload shapes — unchanged.
    H-4  All 7 shipment event names — unchanged.
    H-5  Audit schemas (server.audit 8-field vs transfer_detector._audit
         4-field) — NOT normalized.
    H-6  ``shipments`` collection — NOT moved in 3.2 (or in 5.5/G).
    H-7  ``resolver_exceptions`` multi-writer — documented only.
    H-8  Legacy ``_AutoResolver`` (resolver_engine) — NOT merged with
         ``ShipmentIdentityResolver``. ✓ preserved through 5.5/G —
         the bodies live here side-by-side, but the two resolvers
         remain distinct classes from distinct upstream modules.

Lifecycle rules (matches Phase 3.1 pattern)
────────────────────────────────────────────

    * No state on the instance — methods are effectively static.
    * No singleton at module level — every call constructs fresh
      ``ShipmentIdentityResolver`` / ``AutoTransferDetector`` against
      the current ``db`` handle.
    * No DI, no ``app.state``, no ``init(sio)`` — three lazy bridges
      (``_db``, ``_sio``, ``_audit_callable``) resolve at call time.

See ``PHASE3_2_EVENT_BOUNDARY_DESIGN.md`` §3, §4, §5 for the original
contract; see ``PHASE5_5_G_IDENTITY_CLUSTER_CLOSED.md`` for the
cluster-extraction record.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Awaitable, Callable, Dict, FrozenSet, List, Optional

# Resolver / detector classes — pure Python, Socket.IO-free (H-1).
# These imports are safe at module load (verified in archaeology §1).
from shipment_identity_resolver import ShipmentIdentityResolver
from transfer_detector import AutoTransferDetector

# Phase 5.5/G — legacy AutoResolver moved with the cluster.
# H-8 preserved: this class stays distinct from ShipmentIdentityResolver.
from resolver_engine import (
    AutoResolver as _AutoResolver,
    MIN_CONFIDENCE as _RESOLVER_MIN_CONF,
)

logger = logging.getLogger("bibi.identity_runtime")


# ═══════════════════════════════════════════════════════════════════
# Whitelisted Socket.IO channels — H-4: do not extend.
# Catalog mirrors PHASE3_2_ARCHAEOLOGY.md §4.
# ═══════════════════════════════════════════════════════════════════
SHIPMENT_EVENT_NAMES: FrozenSet[str] = frozenset({
    "shipment:update",
    "shipment:position_updated",
    "shipment:event",
    "shipment:status_changed",
    "shipment:eta_changed",
    "shipment:arrived",
    "shipment:ready_for_pickup",
})

# Polymorphic kinds for the overloaded ``shipment:update`` channel.
# See PHASE3_2_EVENT_BOUNDARY_DESIGN.md §4.
SHIPMENT_UPDATE_KINDS: FrozenSet[str] = frozenset({
    "position",
    "shipping_event",
    "vessel_transferred",
    "manual_confirm",
})


# ═══════════════════════════════════════════════════════════════════
# Lazy bridges — resolve at call time so the live db / sio rebind
# during startup() does NOT stale-lock the service.
# Mirrors the Phase 3.1 ``_db()`` pattern (app/routers/admin_resolver.py).
# ═══════════════════════════════════════════════════════════════════

# Phase 5.4 / C-4i — db_runtime accessor (module-level function reference).
# Only the `get_db` CALLABLE is imported at module-load time. Every
# `_db()` call resolves the live Motor handle via `get_db()`, preserving
# the call-time semantics of the legacy `from server import db` bridge.
from app.core.db_runtime import get_db  # noqa: E402 (C-4i: lazy-bridge → accessor)


def _db():
    """Live Motor handle — resolves at call-time, not at module-load.

    Phase 5.4 / C-4i — migrated to ``app.core.db_runtime.get_db()``.
    """
    return get_db()


def _sio():
    """Live ``python-socketio.AsyncServer`` from the socket runtime accessor.

    Phase 5.4 / C-4c — retired the legacy ``from server import sio`` bridge;
    we now resolve via ``app.core.socket_runtime.get_sio()``.
    """
    from app.core.socket_runtime import get_sio  # noqa: E402  (lazy-bridge → accessor)
    return get_sio()


def _audit_callable() -> Callable[..., Awaitable[None]]:
    """Reference to the canonical ``audit`` async callable — preserves the
    8-field schema verbatim (H-5: do not normalize).

    Phase 5.4 / C-5c: canonical accessor via ``app.core.audit_runtime``.
    """
    from app.core.audit_runtime import get_audit  # noqa: E402  (lazy-bridge → accessor)
    return get_audit()


# ═══════════════════════════════════════════════════════════════════
# Phase 5.5/H (2026-05-20) — VesselFinder cluster retirement
# ═══════════════════════════════════════════════════════════════════
#
# ``_external_container_lookup`` has been retired from server.py and
# rehomed verbatim to ``app/services/tracking_providers.py`` as the
# public ``external_container_lookup`` (no underscore). The previous
# ``_external_container_lookup_callable()`` lazy-bridge accessor that
# lived here in 5.5/G has therefore also been retired — the resolver
# shim ``_resolver_shipsgo_lookup`` below now imports the canonical
# function directly from its new home.
#
# Phase 5.5/I (2026-05-20) — ``add_shipment_event`` retired. The body
# moved verbatim from ``server.py:5539`` to
# ``app/services/shipments.add_shipment_event``. The 5.5/G-era
# ``_add_shipment_event`` async wrapper below is updated to reach for
# the canonical home directly; the ``from server import
# add_shipment_event`` lazy bridge has been retired.
# ═══════════════════════════════════════════════════════════════════


async def _add_shipment_event(*args: Any, **kwargs: Any) -> None:
    """Lazy bridge to ``app.services.shipments.add_shipment_event``.

    Per D6 (no async orchestration changes) the call shape is preserved
    1:1; this thin async wrapper exists only to keep the import lazy.

    Phase 5.5/I (2026-05-20) — rewired from
    ``from server import add_shipment_event`` to the canonical home
    after the shipments-orchestration cluster retirement. Semantics
    byte-identical because ``server.add_shipment_event`` is now a
    shim that delegates 1:1 to this same canonical function.
    """
    from app.services.shipments import add_shipment_event  # noqa: E402, WPS433
    return await add_shipment_event(*args, **kwargs)


# ═══════════════════════════════════════════════════════════════════
# Phase 5.5/G — Legacy AutoResolver cluster, MOVED VERBATIM from server.py
# (D4: no algorithm edits, D5: no schema evolution, D6: no async
# orchestration changes).
#
# These three module-private helpers were previously at:
#   server.py:5628  _resolver_shipsgo_lookup
#   server.py:5640  _resolver_vf_search
#   server.py:5647  _get_auto_resolver
#
# Module-private (single leading underscore) preserved from the legacy
# names — they are NOT part of the public surface; only the service-
# class methods (run_auto_resolver / persist_resolver_hits) and the
# ``identity_runtime`` singleton are public.
# ═══════════════════════════════════════════════════════════════════


async def _resolver_shipsgo_lookup(container: str):
    """Thin wrapper so VesselResolver can call the canonical
    ``external_container_lookup`` without circular imports.

    Pre-5.5/G this used ``globals().get("_external_container_lookup")``
    against server.py's module globals (the symbol was defined later in
    the same file — a forward reference inside server.py). 5.5/G
    replaced that with an ``_external_container_lookup_callable()``
    lazy-bridge accessor. Phase 5.5/H retires that accessor entirely:
    the helper now lives at its canonical home and we import it
    directly. Semantics are byte-identical (D4: no provider-algorithm
    edits, D5: no schema evolution, D6: no async orchestration
    changes).
    """
    try:
        from app.services.tracking_providers import (  # noqa: WPS433
            external_container_lookup,
        )
    except Exception as _imp_err:
        logger.warning(
            f"[Resolver/ShipsGo] tracking_providers import failed: {_imp_err}"
        )
        return None
    try:
        return await external_container_lookup(container)
    except Exception as _e:
        logger.warning(f"[Resolver/ShipsGo] {container} failed: {_e}")
        return None


async def _resolver_vf_search(hint: str):
    """Reserved for V5: vessel-by-name search via VF. Returns None unless
    the VF search helper is available; keeps the resolver standalone even
    when VF session is not configured."""
    return None


def _get_auto_resolver() -> _AutoResolver:
    """AutoResolver factory — constructed per-call so we pick up updated
    API keys after /admin/integrations changes them in the DB."""
    return _AutoResolver(
        db=_db(),
        shipsgo_lookup=_resolver_shipsgo_lookup,
        vf_search=_resolver_vf_search,
    )


# ═══════════════════════════════════════════════════════════════════
# IdentityRuntimeService — class-style boundary, no instance state.
# ═══════════════════════════════════════════════════════════════════
class IdentityRuntimeService:
    """Phase 3.2 boundary wrapper around the identity runtime.

    Wraps three underlying components without changing behaviour:

      1. ``ShipmentIdentityResolver`` (Phase A+B+C orchestrator).
      2. ``AutoTransferDetector``    (Phase D guard).
      3. Socket.IO ``shipment:*`` channels (7 names whitelisted).

    Plus the legacy ``_AutoResolver`` cluster (Phase 5.5/G).
    """

    # ── M-1 ───────────────────────────────────────────────────
    async def resolve(
        self,
        shipment: Dict[str, Any],
        *,
        deal: Optional[Dict[str, Any]] = None,
        vf_payload: Optional[Any] = None,
    ):
        """1:1 wrap of ``server._make_identity_resolver().resolve(...)``."""
        audit_fn = _audit_callable()
        resolver = ShipmentIdentityResolver(
            _db(),
            audit=lambda action, resource=None, meta=None: audit_fn(
                action, resource=resource, meta=meta
            ),
        )
        return await resolver.resolve(shipment, vf_payload=vf_payload, deal=deal)

    # ── M-2 ───────────────────────────────────────────────────
    async def process_transfer(
        self,
        shipment: Dict[str, Any],
        candidate: Dict[str, Any],
    ) -> Dict[str, Any]:
        """1:1 wrap of ``server._auto_transfer_detector().process_shipment(...)``."""
        detector = AutoTransferDetector(_db())
        return await detector.process_shipment(shipment, candidate)

    # ── M-3 ───────────────────────────────────────────────────
    async def apply_transfer(
        self,
        shipment: Dict[str, Any],
        current_stage: Dict[str, Any],
        new_vessel: Dict[str, Any],
    ) -> Dict[str, Any]:
        """Expose ``AutoTransferDetector._apply_transfer`` on the boundary."""
        detector = AutoTransferDetector(_db())
        return await detector._apply_transfer(shipment, current_stage, new_vessel)

    # ── M-4 ───────────────────────────────────────────────────
    # Phase 5.5/G: BODY MOVED VERBATIM from server.py:5657.
    # The legacy ``from server import _run_auto_resolver`` lazy bridge
    # has been retired.
    async def run_auto_resolver(self, shipment: Dict[str, Any]) -> Dict[str, Any]:
        """Run the AutoResolver, persist a trace snapshot, return the report.

        Phase 5.5/G — was previously a lazy bridge to
        ``server._run_auto_resolver``. The body is the verbatim port of
        the legacy implementation; behaviour parity is asserted by
        ``tests/test_phase5_5_g_identity_cluster.py`` (G1, G2).

        H-8 preserved: the legacy ``_AutoResolver`` (from
        ``resolver_engine``) stays distinct from
        ``ShipmentIdentityResolver``; they live side-by-side in this
        module without merge.
        """
        report = await _get_auto_resolver().run(shipment)
        rep_d = report.to_dict()
        try:
            await _db().shipments.update_one(
                {"id": shipment.get("id")},
                {"$set": {"resolver": {
                    "lastRun":   rep_d.get("ranAt"),
                    "container": rep_d.get("container"),
                    "vessel":    rep_d.get("vessel"),
                    "transfer":  rep_d.get("transfer"),
                    "actions":   rep_d.get("actions"),
                }}},
            )
        except Exception as _e:
            logger.warning(f"[Resolver] persist trace failed: {_e}")
        return rep_d

    # ── M-5 ───────────────────────────────────────────────────
    # Phase 5.5/G: BODY MOVED VERBATIM from server.py:5677.
    # The legacy ``from server import _persist_resolver_hits`` lazy
    # bridge has been retired.
    async def persist_resolver_hits(
        self,
        shipment: Dict[str, Any],
        report: Dict[str, Any],
    ) -> Dict[str, Any]:
        """Apply resolver results to the shipment if confidence is
        sufficient and current active stage lacks container/vessel
        identity. Returns diff dict.

        Phase 5.5/G — was previously a lazy bridge to
        ``server._persist_resolver_hits``. Body is the verbatim port;
        behaviour parity asserted by golden suite (G3-G6).
        """
        diff = {"containerChanged": False, "vesselChanged": False,
                "container": None, "vesselName": None,
                "vesselMmsi": None, "vesselImo": None}
        container_hit = report.get("container") or {}
        vessel_hit = report.get("vessel") or {}
        now = datetime.now(timezone.utc)
        ship_id = shipment.get("id")

        stages = list(shipment.get("stages") or [])
        cur_id = shipment.get("currentStageId")
        cur_idx = next(
            (i for i, st in enumerate(stages) if st.get("id") == cur_id),
            None,
        )

        update_set: Dict[str, Any] = {}
        events_to_add: List[Dict[str, Any]] = []

        cnum = container_hit.get("value")
        ccon = float(container_hit.get("confidence") or 0.0)
        if cnum and ccon >= _RESOLVER_MIN_CONF:
            existing = None
            if cur_idx is not None:
                existing = (stages[cur_idx].get("container") or {}).get("number")
            existing = existing or (shipment.get("container") or {}).get("number") or shipment.get("containerNumber")
            if not existing:
                new_container = {
                    "number": cnum,
                    "source": container_hit.get("source"),
                    "confidence": ccon,
                    "resolvedAt": now,
                    "autoResolved": True,
                }
                if cur_idx is not None and stages[cur_idx].get("type") == "vessel":
                    stages[cur_idx] = {**stages[cur_idx], "container": new_container}
                    update_set["stages"] = stages
                update_set["container"] = new_container
                update_set["containerSource"] = container_hit.get("source")
                update_set["containerConfidence"] = ccon
                update_set["containerAutoResolved"] = True
                diff["containerChanged"] = True
                diff["container"] = cnum
                events_to_add.append({
                    "type": "container_resolved",
                    "label": f"Контейнер визначено автоматично: {cnum} "
                             f"(джерело: {container_hit.get('source')}, впевненість {int(ccon * 100)}%)",
                    "meta": {"container": cnum, "evidence": container_hit.get("evidence")},
                })

        vval = vessel_hit.get("value") if isinstance(vessel_hit.get("value"), dict) else None
        vcon = float(vessel_hit.get("confidence") or 0.0)
        if vval and vcon >= _RESOLVER_MIN_CONF:
            have_v = False
            if cur_idx is not None:
                cv = stages[cur_idx].get("vessel") or {}
                have_v = bool(cv.get("mmsi") or cv.get("imo") or cv.get("name"))
            if not have_v:
                tv = shipment.get("vessel") or {}
                have_v = bool(tv.get("mmsi") or tv.get("imo") or tv.get("name"))
            if not have_v:
                new_vessel = {
                    "name": vval.get("name"),
                    "mmsi": vval.get("mmsi"),
                    "imo":  vval.get("imo"),
                    "source": vessel_hit.get("source"),
                    "confidence": vcon,
                    "resolvedAt": now,
                    "autoResolved": True,
                }
                if cur_idx is not None and stages[cur_idx].get("type") == "vessel":
                    stages[cur_idx] = {**stages[cur_idx], "vessel": new_vessel}
                    update_set["stages"] = stages
                update_set["vessel"] = new_vessel
                update_set["vesselSource"] = vessel_hit.get("source")
                update_set["vesselConfidence"] = vcon
                update_set["vesselAutoResolved"] = True
                diff["vesselChanged"] = True
                diff["vesselName"] = new_vessel["name"]
                diff["vesselMmsi"] = new_vessel["mmsi"]
                diff["vesselImo"] = new_vessel["imo"]
                events_to_add.append({
                    "type": "vessel_resolved",
                    "label": f"Судно визначено автоматично: "
                             f"{new_vessel.get('name') or '—'} "
                             f"(MMSI {new_vessel.get('mmsi') or '—'}, "
                             f"джерело: {vessel_hit.get('source')}, "
                             f"впевненість {int(vcon * 100)}%)",
                    "meta": {"vessel": new_vessel, "evidence": vessel_hit.get("evidence")},
                })

        if not update_set:
            return diff

        await _db().shipments.update_one({"id": ship_id}, {"$set": update_set})

        for ev in events_to_add:
            try:
                await _add_shipment_event(
                    ship_id, ev["type"], ev["label"],
                    meta=ev.get("meta") or {},
                    customer_id=shipment.get("customerId"),
                )
            except Exception:
                pass

        logger.info(f"[Resolver] {ship_id} persisted: {diff}")
        return diff

    # ── M-6 ───────────────────────────────────────────────────
    async def publish_shipment_event(
        self,
        event_name: str,
        payload: Dict[str, Any],
        *,
        customer_id: Optional[str],
    ) -> None:
        """Unified shipment-event emit boundary (H-4 whitelist enforced)."""
        if event_name not in SHIPMENT_EVENT_NAMES:
            raise ValueError(
                f"Unknown shipment event name: {event_name!r}. "
                f"Allowed: {sorted(SHIPMENT_EVENT_NAMES)}"
            )
        if not customer_id:
            return
        try:
            await _sio().emit(event_name, payload, room=f"user_{customer_id}")
        except Exception as e:
            logger.warning(
                "[identity_runtime] sio.emit %s failed for user_%s: %s",
                event_name, customer_id, e,
            )

    # ── M-7 ───────────────────────────────────────────────────
    async def publish_shipment_update(
        self,
        payload: Dict[str, Any],
        *,
        customer_id: Optional[str],
        kind: str,
    ) -> None:
        """Typed convenience over M-6 for the polymorphic ``shipment:update`` channel."""
        if kind not in SHIPMENT_UPDATE_KINDS:
            raise ValueError(
                f"Unknown shipment:update kind: {kind!r}. "
                f"Allowed: {sorted(SHIPMENT_UPDATE_KINDS)}"
            )
        await self.publish_shipment_event(
            "shipment:update", payload, customer_id=customer_id
        )


# ═══════════════════════════════════════════════════════════════════
# Module-level singleton instance — convenience export.
# ═══════════════════════════════════════════════════════════════════
identity_runtime = IdentityRuntimeService()


__all__ = [
    "IdentityRuntimeService",
    "identity_runtime",
    "SHIPMENT_EVENT_NAMES",
    "SHIPMENT_UPDATE_KINDS",
]
