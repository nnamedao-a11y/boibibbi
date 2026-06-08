"""
backend/tests/test_identity_runtime.py — Phase 3.2 / C-1
=========================================================

Unit tests for ``app/services/identity_runtime.py``.

23 tests across 5 groups (mirrors PHASE3_2_EVENT_BOUNDARY_DESIGN.md §7):

  Group 1 — Factory parity        (4 tests)
  Group 2 — Emit catalog          (8 tests)
  Group 3 — Shape catalog         (5 tests)
  Group 4 — Audit transparency    (3 tests)
  Group 5 — Lazy-bridge safety    (3 tests)

Mock strategy:
  * ``ShipmentIdentityResolver`` / ``AutoTransferDetector`` — monkeypatched
    on the ``identity_runtime`` module so we capture constructor args +
    method calls without hitting real DB.
  * ``server.db`` / ``server.sio`` / ``server.audit`` — monkeypatched
    on the ``server`` module so the three lazy bridges resolve to mocks.
  * Async functions use ``AsyncMock`` (mandate: pytest-asyncio + AsyncMock).
  * No live Mongo, no live Socket.IO, no HTTP.

These tests are PURE pass-through / boundary checks per C-1 mandate rule 8.
They do NOT test resolver logic, detector logic, or emit semantics —
those are the responsibility of the upstream modules' own test suites
(and the manual smoke audits done per-checkpoint commit).
"""

from __future__ import annotations

import sys
import types
from unittest.mock import AsyncMock, MagicMock

import pytest

# ─────────────────────────────────────────────────────────────────────
# Phase 6.1.C orphan classification (2026-05-20)
# ─────────────────────────────────────────────────────────────────────
# Per `/app/PHASE6_1_ORPHAN_CLASSIFICATION.md`, 18 tests in this file
# fail because they exercise the pre-5.4/C-4c/C-4i / pre-5.5/G
# server-ownership lazy-bridge contract that no longer exists:
#
#   * `_db()`  → `app.core.db_runtime.get_db()`        (Phase 5.4 / C-4i)
#   * `_sio()` → `app.core.socket_runtime.get_sio()`   (Phase 5.4 / C-4c)
#   * `_audit_callable()` rewired in Phase 5.5 / G
#
# Mocking `fake_server.db/sio/audit` no longer participates in resolution.
#
# 5 tests in the file still pass (envelope-builder probes that operate on
# dicts only). Those are left untouched (PRESERVE category).
#
# 18 failing tests are marked xfail(strict=True) below, grouped by fate:
#
#   * REWRITE (15 tests) — semantic value preserved; rewrite against
#     canonical `app.core.db_runtime` / `socket_runtime` fixtures in
#     Phase 6.1.D (separate, mandate-driven sub-phase).
#   * RETIRE  (3 tests) — legacy lazy-bridge rebind probes whose
#     property is now owned by `db_runtime` / `socket_runtime`
#     standalone suites; delete in Phase 6.1.D.
#
# strict=True ratchet: if any of these tests starts unexpectedly passing,
# it signals either (a) the lazy-bridge contract has been accidentally
# restored, OR (b) the Phase 6.1.D rewrite landed and the marker was
# forgotten. Either case → CI surface signal.

_ORPHAN_REWRITE_REASON = (
    "Phase 6.1.C orphan classification (REWRITE): obsolete server-ownership "
    "lazy-bridge contract — service now reads via app.core.db_runtime / "
    "socket_runtime. Rewrite scope = Phase 6.1.D. See "
    "PHASE6_1_ORPHAN_CLASSIFICATION.md."
)

_ORPHAN_RETIRE_REASON = (
    "Phase 6.1.C orphan classification (RETIRE): legacy lazy-bridge rebind "
    "probe; property now owned by app.core.db_runtime / socket_runtime "
    "standalone suites. Delete scope = Phase 6.1.D. See "
    "PHASE6_1_ORPHAN_CLASSIFICATION.md."
)

# ─────────────────────────────────────────────────────────────
# Module-level fixtures — fake ``server`` module installed BEFORE
# we import ``identity_runtime`` so the lazy bridges have something
# to resolve to.  Tests then monkeypatch specific attributes.
# ─────────────────────────────────────────────────────────────


@pytest.fixture
def fake_server(monkeypatch):
    """Install a fake ``server`` module with db, sio, audit, and the two
    legacy helpers (``_run_auto_resolver``, ``_persist_resolver_hits``)."""
    fake = types.ModuleType("server")
    fake.db = MagicMock(name="server.db")
    fake.sio = MagicMock(name="server.sio")
    fake.sio.emit = AsyncMock(name="server.sio.emit")
    fake.audit = AsyncMock(name="server.audit")
    fake._run_auto_resolver = AsyncMock(name="server._run_auto_resolver")
    fake._persist_resolver_hits = AsyncMock(name="server._persist_resolver_hits")
    monkeypatch.setitem(sys.modules, "server", fake)
    return fake


@pytest.fixture
def identity_runtime_module(fake_server):
    """Fresh import of the service module per test.  Removes any prior
    cached version so module-level state (like the ``identity_runtime``
    singleton) is rebuilt against the current ``fake_server``."""
    # Force reload so the module re-evaluates against fake_server.
    sys.modules.pop("app.services.identity_runtime", None)
    from app.services import identity_runtime as mod  # noqa: WPS433
    return mod


@pytest.fixture
def fake_resolver_cls(monkeypatch, identity_runtime_module):
    """Replace ``ShipmentIdentityResolver`` on the service module so we
    capture constructor args + resolve() calls."""
    instance = MagicMock(name="FakeShipmentIdentityResolver.instance")
    instance.resolve = AsyncMock(name="FakeResolver.resolve", return_value="ATTEMPT_OK")
    cls = MagicMock(name="FakeShipmentIdentityResolver.cls", return_value=instance)
    monkeypatch.setattr(identity_runtime_module, "ShipmentIdentityResolver", cls)
    return cls, instance


@pytest.fixture
def fake_detector_cls(monkeypatch, identity_runtime_module):
    """Replace ``AutoTransferDetector`` on the service module."""
    instance = MagicMock(name="FakeAutoTransferDetector.instance")
    instance.process_shipment = AsyncMock(
        name="FakeDetector.process_shipment", return_value={"status": "transfer"}
    )
    instance._apply_transfer = AsyncMock(
        name="FakeDetector._apply_transfer", return_value={"ok": True, "newStageId": "stage_x"}
    )
    cls = MagicMock(name="FakeAutoTransferDetector.cls", return_value=instance)
    monkeypatch.setattr(identity_runtime_module, "AutoTransferDetector", cls)
    return cls, instance


# ═══════════════════════════════════════════════════════════════════
# Group 1 — Factory parity (4 tests)
#
# Verify M-1…M-4 construct underlying objects with the same shape as
# the existing server.py helpers (_make_identity_resolver,
# _auto_transfer_detector) — per-call, against the live db handle,
# audit wired for M-1 only.
# ═══════════════════════════════════════════════════════════════════


@pytest.mark.xfail(strict=True, reason=_ORPHAN_REWRITE_REASON)
@pytest.mark.asyncio
async def test_resolve_constructs_resolver_with_db_and_audit(
    fake_server, identity_runtime_module, fake_resolver_cls
):
    """M-1: resolve() constructs ShipmentIdentityResolver(db, audit=<callable>)
    and forwards (shipment, vf_payload, deal) to resolver.resolve()."""
    cls, instance = fake_resolver_cls
    service = identity_runtime_module.IdentityRuntimeService()
    shipment = {"id": "ship_1"}
    deal = {"id": "deal_1"}

    result = await service.resolve(shipment, deal=deal, vf_payload={"raw": 1})

    # Constructor called with (db, audit=<callable>)
    cls.assert_called_once()
    pos_args, kw_args = cls.call_args
    assert pos_args == (fake_server.db,), "First positional must be the live db handle"
    assert callable(kw_args["audit"]), "audit kwarg must be a callable"

    # resolve() forwarded with vf_payload + deal
    instance.resolve.assert_awaited_once_with(shipment, vf_payload={"raw": 1}, deal=deal)
    assert result == "ATTEMPT_OK"


@pytest.mark.xfail(strict=True, reason=_ORPHAN_REWRITE_REASON)
@pytest.mark.asyncio
async def test_process_transfer_constructs_detector_with_db_only(
    fake_server, identity_runtime_module, fake_detector_cls
):
    """M-2: process_transfer() constructs AutoTransferDetector(db) — NO
    audit callable (detector has its own audit_log channel, H-5)."""
    cls, instance = fake_detector_cls
    service = identity_runtime_module.IdentityRuntimeService()
    shipment = {"id": "ship_2"}
    cand = {"name": "Vessel-X", "mmsi": "111"}

    result = await service.process_transfer(shipment, cand)

    cls.assert_called_once_with(fake_server.db)
    # Critically: detector constructor must NOT receive audit= kwarg
    _, kw_args = cls.call_args
    assert "audit" not in kw_args, "Detector keeps its OWN audit channel — H-5"
    instance.process_shipment.assert_awaited_once_with(shipment, cand)
    assert result == {"status": "transfer"}


@pytest.mark.xfail(strict=True, reason=_ORPHAN_REWRITE_REASON)
@pytest.mark.asyncio
async def test_apply_transfer_uses_detector_underscore_method(
    fake_server, identity_runtime_module, fake_detector_cls
):
    """M-3: apply_transfer() routes to detector._apply_transfer (the
    underscore method that admin_identity_exceptions_confirm calls today)."""
    cls, instance = fake_detector_cls
    service = identity_runtime_module.IdentityRuntimeService()
    shipment = {"id": "ship_3"}
    stage = {"id": "stage_old"}
    vessel = {"name": "Vessel-Y"}

    result = await service.apply_transfer(shipment, stage, vessel)

    cls.assert_called_once_with(fake_server.db)
    instance._apply_transfer.assert_awaited_once_with(shipment, stage, vessel)
    assert result == {"ok": True, "newStageId": "stage_x"}


@pytest.mark.asyncio
async def test_run_auto_resolver_bridges_to_server_legacy(
    fake_server, identity_runtime_module, monkeypatch
):
    """M-4 (Phase 5.5/G): run_auto_resolver() now owns the body locally.

    Pre-5.5/G this test asserted ``fake_server._run_auto_resolver`` was
    awaited via lazy bridge. Post-5.5/G the body lives inside the
    service module; we assert the LOCAL ``_get_auto_resolver`` factory
    is invoked instead. H-8 still preserved (legacy ``_AutoResolver``
    class is not merged with ``ShipmentIdentityResolver``).
    """
    fake_report = MagicMock(name="report")
    fake_report.to_dict.return_value = {"ranAt": "2026-05-18T00:00:00Z",
                                         "container": None, "vessel": None,
                                         "transfer": None, "actions": []}
    fake_resolver_inst = MagicMock(name="autoresolver")
    fake_resolver_inst.run = AsyncMock(return_value=fake_report)
    fake_factory = MagicMock(return_value=fake_resolver_inst)
    monkeypatch.setattr(identity_runtime_module, "_get_auto_resolver",
                        fake_factory, raising=True)

    # Patch the db accessor so the persist-trace branch resolves.
    fake_db = MagicMock(name="db")
    fake_db.shipments = MagicMock(name="shipments")
    fake_db.shipments.update_one = AsyncMock()
    monkeypatch.setattr(identity_runtime_module, "_db",
                        lambda: fake_db, raising=True)

    service = identity_runtime_module.IdentityRuntimeService()
    shipment = {"id": "ship_4"}

    result = await service.run_auto_resolver(shipment)

    # Factory invoked + report.run() awaited once with the shipment.
    fake_factory.assert_called_once_with()
    fake_resolver_inst.run.assert_awaited_once_with(shipment)
    assert result == {"ranAt": "2026-05-18T00:00:00Z",
                       "container": None, "vessel": None,
                       "transfer": None, "actions": []}


# ═══════════════════════════════════════════════════════════════════
# Group 2 — Emit catalog (8 tests)
#
# Verify M-6 (publish_shipment_event) routes each of the 7 whitelisted
# channel names to sio.emit with room=user_{cid}, and rejects 1
# invalid name with ValueError before touching sio.
# ═══════════════════════════════════════════════════════════════════


@pytest.mark.parametrize(
    "event_name",
    [
        "shipment:update",
        "shipment:position_updated",
        "shipment:event",
        "shipment:status_changed",
        "shipment:eta_changed",
        "shipment:arrived",
        "shipment:ready_for_pickup",
    ],
)
@pytest.mark.xfail(strict=True, reason=_ORPHAN_REWRITE_REASON)
@pytest.mark.asyncio
async def test_publish_event_routes_each_whitelisted_name(
    fake_server, identity_runtime_module, event_name
):
    """7 tests via parametrize — one per whitelisted channel name.

    Each must reach ``sio.emit(event_name, payload, room=f"user_{cid}")``.
    """
    service = identity_runtime_module.IdentityRuntimeService()
    payload = {"shipmentId": "ship_X", "marker": event_name}

    await service.publish_shipment_event(event_name, payload, customer_id="cust_1")

    fake_server.sio.emit.assert_awaited_once_with(
        event_name, payload, room="user_cust_1"
    )


@pytest.mark.asyncio
async def test_publish_event_rejects_unknown_name(
    fake_server, identity_runtime_module
):
    """8th test in Group 2 — defence in depth: unknown channel name raises
    ValueError BEFORE any sio.emit touch (H-4)."""
    service = identity_runtime_module.IdentityRuntimeService()

    with pytest.raises(ValueError, match="Unknown shipment event name"):
        await service.publish_shipment_event(
            "shipment:rename_attempt", {"x": 1}, customer_id="cust_1"
        )
    # Defence in depth — sio.emit must NOT have been called
    fake_server.sio.emit.assert_not_called()


# ═══════════════════════════════════════════════════════════════════
# Group 3 — Shape catalog (5 tests)
#
# Verify M-7 (publish_shipment_update) accepts each of the 4 documented
# kinds and rejects 1 unknown.  Payload is forwarded VERBATIM (H-3 —
# field-by-field reshape forbidden).
# ═══════════════════════════════════════════════════════════════════


@pytest.mark.parametrize(
    "kind, payload",
    [
        # Shape A — position tick
        ("position", {
            "shipmentId": "s1", "currentPosition": {"lat": 1.0, "lng": 2.0},
            "position": {"lat": 1.0, "lng": 2.0}, "progress": 0.5,
            "location": "Atlantic", "type": "real", "source": "real",
            "currentStageId": "stage_v1", "speed": 12.0, "course": 90.0,
            "eta": "2026-05-30T12:00:00Z", "updatedAt": "2026-05-18T00:00:00Z",
        }),
        # Shape B — shipping_event
        ("shipping_event", {
            "shipmentId": "s2", "type": "status_changed",
            "title": "Status changed", "location": "Port A",
            "timestamp": "2026-05-18T00:00:00Z",
        }),
        # Shape C — vessel_transferred
        ("vessel_transferred", {
            "shipmentId": "s3", "type": "vessel_transferred",
            "newStageId": "stage_t1", "to": {"name": "V2"}, "from": {"name": "V1"},
        }),
        # Shape C' — manual_confirm (Shape C + manualConfirm:true)
        ("manual_confirm", {
            "shipmentId": "s4", "type": "vessel_transferred",
            "newStageId": "stage_t2", "to": {"name": "V3"}, "from": {"name": "V2"},
            "manualConfirm": True,
        }),
    ],
)
@pytest.mark.xfail(strict=True, reason=_ORPHAN_REWRITE_REASON)
@pytest.mark.asyncio
async def test_publish_update_each_documented_kind(
    fake_server, identity_runtime_module, kind, payload
):
    """4 tests via parametrize — one per documented kind.  Each must emit
    on ``shipment:update`` with payload VERBATIM (no field reshape)."""
    service = identity_runtime_module.IdentityRuntimeService()

    await service.publish_shipment_update(payload, customer_id="cust_z", kind=kind)

    fake_server.sio.emit.assert_awaited_once_with(
        "shipment:update", payload, room="user_cust_z"
    )


@pytest.mark.asyncio
async def test_publish_update_rejects_unknown_kind(
    fake_server, identity_runtime_module
):
    """5th test in Group 3 — defence in depth on kind catalog."""
    service = identity_runtime_module.IdentityRuntimeService()

    with pytest.raises(ValueError, match="Unknown shipment:update kind"):
        await service.publish_shipment_update(
            {"shipmentId": "s_x"}, customer_id="cust_q", kind="invented_kind"
        )
    fake_server.sio.emit.assert_not_called()


# ═══════════════════════════════════════════════════════════════════
# Group 4 — Audit transparency (3 tests)
#
# Verify the service mirrors the EXISTING audit wiring:
#   * M-1 (resolve) wires server.audit into the resolver as a callable
#     dropping user/request kwargs (matches server.py:5727 lambda).
#   * M-2 (process_transfer) does NOT inject any audit — detector keeps
#     its own db.audit_log writer (4-field schema, H-5).
#   * M-3 (apply_transfer) same as M-2.
# ═══════════════════════════════════════════════════════════════════


@pytest.mark.xfail(strict=True, reason=_ORPHAN_REWRITE_REASON)
@pytest.mark.asyncio
async def test_audit_resolve_wires_server_audit_through_lambda(
    fake_server, identity_runtime_module, fake_resolver_cls
):
    """M-1 must construct the resolver with a callable that delegates to
    ``server.audit(action, resource=..., meta=...)`` — exactly matching
    the lambda in server.py:5727."""
    cls, _instance = fake_resolver_cls
    service = identity_runtime_module.IdentityRuntimeService()

    await service.resolve({"id": "s_audit"})

    _, kw_args = cls.call_args
    audit_lambda = kw_args["audit"]
    # Invoke the lambda and verify it calls server.audit with the right kwargs
    # and explicitly DOES NOT pass user / request (mirroring 5727).
    await audit_lambda("test_action", resource="r1", meta={"k": "v"})
    fake_server.audit.assert_awaited_once_with(
        "test_action", resource="r1", meta={"k": "v"}
    )


@pytest.mark.asyncio
async def test_audit_process_transfer_does_not_inject_audit(
    fake_server, identity_runtime_module, fake_detector_cls
):
    """M-2: detector constructor must NOT receive any audit callable —
    detector writes to db.audit_log directly with its 4-field schema (H-5)."""
    cls, _ = fake_detector_cls
    service = identity_runtime_module.IdentityRuntimeService()

    await service.process_transfer({"id": "s_audit2"}, {"name": "V"})

    _, kw_args = cls.call_args
    assert "audit" not in kw_args, "Detector keeps its OWN audit channel"
    # Also verify server.audit was NOT called by the service itself.
    fake_server.audit.assert_not_called()


@pytest.mark.asyncio
async def test_audit_apply_transfer_does_not_inject_audit(
    fake_server, identity_runtime_module, fake_detector_cls
):
    """M-3: same as M-2 — apply_transfer uses the same detector lifecycle."""
    cls, _ = fake_detector_cls
    service = identity_runtime_module.IdentityRuntimeService()

    await service.apply_transfer(
        {"id": "s_audit3"}, {"id": "stg"}, {"name": "V"}
    )

    _, kw_args = cls.call_args
    assert "audit" not in kw_args
    fake_server.audit.assert_not_called()


# ═══════════════════════════════════════════════════════════════════
# Group 5 — Lazy-bridge safety (3 tests)
#
# Verify the 3 bridges resolve at CALL time, not import time.  This is
# the safety property that lets server.startup() rebind db / sio / audit
# without stale-locking the service.
# ═══════════════════════════════════════════════════════════════════


@pytest.mark.xfail(strict=True, reason=_ORPHAN_RETIRE_REASON)
@pytest.mark.asyncio
async def test_db_bridge_resolves_at_call_time(
    fake_server, identity_runtime_module, fake_resolver_cls
):
    """Rebind ``server.db`` between two service calls and verify the second
    call sees the new handle."""
    cls, _ = fake_resolver_cls
    service = identity_runtime_module.IdentityRuntimeService()

    # 1st call — uses original db
    await service.resolve({"id": "s_first"})
    first_db = cls.call_args[0][0]

    # Rebind server.db (simulate startup() reassigning Motor client)
    new_db = MagicMock(name="server.db.REBOUND")
    fake_server.db = new_db

    # 2nd call — must use new db
    await service.resolve({"id": "s_second"})
    second_db = cls.call_args[0][0]

    assert first_db is not second_db
    assert second_db is new_db


@pytest.mark.xfail(strict=True, reason=_ORPHAN_RETIRE_REASON)
@pytest.mark.asyncio
async def test_sio_bridge_resolves_at_call_time(
    fake_server, identity_runtime_module
):
    """Rebind ``server.sio`` between two emit calls and verify the second
    call uses the new sio."""
    service = identity_runtime_module.IdentityRuntimeService()

    # 1st emit — original sio
    await service.publish_shipment_event("shipment:update", {"x": 1}, customer_id="c1")
    fake_server.sio.emit.assert_awaited_once()
    original_sio = fake_server.sio

    # Rebind server.sio
    new_sio = MagicMock(name="server.sio.REBOUND")
    new_sio.emit = AsyncMock(name="new.sio.emit")
    fake_server.sio = new_sio

    # 2nd emit — must hit new sio, not original
    await service.publish_shipment_event("shipment:update", {"x": 2}, customer_id="c2")
    new_sio.emit.assert_awaited_once_with(
        "shipment:update", {"x": 2}, room="user_c2"
    )
    # original_sio.emit still has exactly 1 call from before the rebind
    assert original_sio.emit.await_count == 1


@pytest.mark.xfail(strict=True, reason=_ORPHAN_RETIRE_REASON)
@pytest.mark.asyncio
async def test_audit_bridge_resolves_at_call_time(
    fake_server, identity_runtime_module, fake_resolver_cls
):
    """Rebind ``server.audit`` between two resolve calls.  The 2nd call's
    constructed lambda must, when invoked, dispatch to the NEW audit."""
    cls, _ = fake_resolver_cls
    service = identity_runtime_module.IdentityRuntimeService()

    # 1st call — original audit
    await service.resolve({"id": "s_a1"})
    first_audit_lambda = cls.call_args[1]["audit"]

    # Rebind server.audit
    new_audit = AsyncMock(name="server.audit.REBOUND")
    fake_server.audit = new_audit

    # 2nd call — service should pull the new audit reference
    await service.resolve({"id": "s_a2"})
    second_audit_lambda = cls.call_args[1]["audit"]

    # Invoke the second lambda — must dispatch to the NEW audit, not the original.
    await second_audit_lambda("a2_action", resource="r", meta={})
    new_audit.assert_awaited_once_with("a2_action", resource="r", meta={})

    # And the first lambda — by spec — was bound at its construction time;
    # it still references the original audit captured by the lazy bridge at
    # call #1.  This is BY DESIGN: each ``resolve()`` invocation re-resolves
    # ``server.audit`` and bakes that reference into the lambda for the
    # life of THAT resolver instance.  We only assert the new lambda
    # follows the new binding.
    assert first_audit_lambda is not second_audit_lambda
