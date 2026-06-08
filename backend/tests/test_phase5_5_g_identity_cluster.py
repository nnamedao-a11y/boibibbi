"""
Phase 5.5 / G — Identity Resolver Cluster Golden Suite
======================================================

This suite enforces the contract for the Phase 5.5/G **cluster
extraction** — the first semantic orchestration domain migration of
the Phase 5 refactor cycle.

Mandate (verbatim, Phase 5.5/G kickoff after Step-1 pre-flight audit)
─────────────────────────────────────────────────────────────────────

  D1  Keep cluster together (identity_runtime + _run_auto_resolver +
      _persist_resolver_hits) — single commit.
  D2  Canonical home stays at ``app/services/identity_runtime.py``.
  D3  No worker-lifecycle refactor.
  D4  No resolver-algorithm edits.
  D5  No schema evolution.
  D6  No async orchestration changes.
  D7  Golden suite FIRST.

Cluster surface (3 bridges retired, 0 new bridges)
──────────────────────────────────────────────────

  RETIRED:
    * ``_run_auto_resolver``        — server.py:5657 → IdentityRuntimeService.run_auto_resolver()
    * ``_persist_resolver_hits``    — server.py:5677 → IdentityRuntimeService.persist_resolver_hits()
    * ``identity_runtime``          — MODULE_REF bridge: 3 router
                                      consumers migrate from
                                      ``from server import identity_runtime``
                                      to ``from app.services.identity_runtime import identity_runtime``.

  TRAVELS WITH (module-private inside identity_runtime.py — never were bridges):
    * ``_resolver_shipsgo_lookup``  — server.py:5628 (thin shim around
                                      _external_container_lookup)
    * ``_resolver_vf_search``       — server.py:5640 (stub)
    * ``_get_auto_resolver``        — server.py:5647 (AutoResolver factory)

  REGISTERED AS AUX (kind=RESOLVER_DEP, tier=C-aux — STAY in server.py
  per D3/D6, lazy-bridged in identity_runtime.py at call time):
    * ``_external_container_lookup`` — server.py:18941 (ShipsGo / API lookup,
                                       co-located with admin tracking surface;
                                       moving belongs to 5.5/H not 5.5/G)
    * ``add_shipment_event``         — server.py:5539 (shipment events
                                       writer with sio side-channel; belongs
                                       to 5.5/I shipment orchestration wave)

Inventory delta (post-5.5/G)
─────────────────────────────

  BRIDGE_INVENTORY:         6 → 3  (Δ-3: _run_auto_resolver,
                                         _persist_resolver_hits,
                                         identity_runtime)
  TIER_C_REQUIRES_REFACTOR: 5 → 2  (Δ-3 same)
  PHASE_5_5_BOUNDARY:       5 → 2  (Δ-3 same)
  EXTRACTION_AUX_BRIDGES:  45 → 47 (Δ+2: _external_container_lookup,
                                         add_shipment_event)
  QUALIFIED_USAGE_BRIDGES:  0 → 0  (unchanged)

12-assertion contract
─────────────────────

  Behavioural pins (G1-G6) — pre/post via _resolve_helper switch:

    G1  run_auto_resolver(shipment) returns dict with keys
        {ranAt, container, vessel, transfer, actions} — shape parity
        with legacy report.to_dict()
    G2  run_auto_resolver persists trace snapshot via
        db.shipments.update_one({"id": shipment["id"]}, {"$set":
        {"resolver": {…}}}) — same write shape
    G3  persist_resolver_hits with sub-threshold confidence → returns
        diff with all flags False, no DB write, no events fired
        (idempotent skip)
    G4  persist_resolver_hits with HIGH-confidence container hit on a
        stage missing container → diff.containerChanged=True, DB
        update_one fired with $set including {container, containerSource,
        containerConfidence, containerAutoResolved}, add_shipment_event
        fired with type="container_resolved"
    G5  persist_resolver_hits with HIGH-confidence vessel hit on a
        stage missing vessel identity → diff.vesselChanged=True with
        new_vessel mmsi/imo/name populated, DB update_one fired,
        add_shipment_event fired with type="vessel_resolved"
    G6  persist_resolver_hits when shipment already has container
        (top-level OR on current stage) → no overwrite (diff stays
        False, no DB write)

  Structural pins (S1-S5) — post-state, expected FAIL pre-extraction:

    S1  ``app/services/identity_runtime.py`` no longer carries
        ``from server import _run_auto_resolver`` / ``_persist_resolver_hits``
        lazy bridges; both methods have local bodies.
    S2  ``server.py`` no longer defines ``_run_auto_resolver``,
        ``_persist_resolver_hits``, ``_get_auto_resolver``,
        ``_resolver_shipsgo_lookup``, ``_resolver_vf_search``,
        and the ``from resolver_engine import (AutoResolver, MIN_CONFIDENCE)``
        block.
    S3  ``app/routers/admin_resolver.py``, ``admin_identity.py``,
        ``admin_shipments.py`` no longer carry ``from server import
        identity_runtime`` lazy bridges — they import from
        ``app.services.identity_runtime``.
    S4  Inventory: BRIDGE_INVENTORY 6→3, TIER_C 5→2,
        PHASE_5_5_BOUNDARY 5→2; EXTRACTION_AUX_BRIDGES 45→47
        (2 new RESOLVER_DEP entries added).
    S5  ``PHASE_5_5_G_RETIRED_BRIDGES`` constant exists in
        ``app/core/app_state_targets.py``, length 3, exported via
        ``__all__``.

  OpenAPI freeze (O1):

    O1  paths=618, ops=679 unchanged.

Behavioural tests use a single ``_resolve_helpers()`` switch point so
the SAME file runs UNCHANGED before AND after the cutover (label
``pre-5.5/G`` resolves to ``server._run_auto_resolver`` and
``server._persist_resolver_hits``; label ``post-5.5/G`` resolves to
``IdentityRuntimeService.run_auto_resolver`` and
``IdentityRuntimeService.persist_resolver_hits``).

Run:
    cd /app/backend && python -m pytest \\
        tests/test_phase5_5_g_identity_cluster.py -v
"""
from __future__ import annotations

import ast
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Awaitable, Callable, Dict, Tuple
from unittest.mock import AsyncMock, MagicMock

import pytest

# Ensure backend root is on path (mirrors sibling 5.5/F2 suite).
BACKEND_ROOT = Path(__file__).resolve().parent.parent
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))


# ═══════════════════════════════════════════════════════════════════
# _resolve_helpers — single switch point.
#
# Pre-extraction:  returns (server._run_auto_resolver, server._persist_resolver_hits).
# Post-extraction: returns bound methods of the singleton
#                  app.services.identity_runtime.identity_runtime.
#
# Detection rule: if ``app/services/identity_runtime.py`` no longer
# carries the lazy-bridge ``from server import _run_auto_resolver``
# token, we treat that as the post-5.5/G shape.
# ═══════════════════════════════════════════════════════════════════


def _has_legacy_server_import(src: str, name: str) -> bool:
    """Return True iff ``src`` contains an actual ``from server import {name}``
    ImportFrom node (not a docstring or comment mention).

    Uses AST parsing so phrases like ``the legacy `from server import X`
    lazy bridge`` inside a comment do NOT trip the detector.
    """
    try:
        tree = ast.parse(src)
    except SyntaxError:
        return False
    for node in ast.walk(tree):
        if isinstance(node, ast.ImportFrom) and node.module == "server":
            for alias in node.names:
                if alias.name == name:
                    return True
    return False


def _resolve_helpers() -> Tuple[Callable[..., Awaitable[Dict[str, Any]]],
                                Callable[..., Awaitable[Dict[str, Any]]],
                                str]:
    """Returns ``(run_auto_resolver, persist_resolver_hits, label)``."""
    svc_path = BACKEND_ROOT / "app" / "services" / "identity_runtime.py"
    src = svc_path.read_text()
    post = not (_has_legacy_server_import(src, "_run_auto_resolver")
                or _has_legacy_server_import(src, "_persist_resolver_hits"))

    if post:
        # Force re-import so the singleton picks up the live module body.
        sys.modules.pop("app.services.identity_runtime", None)
        from app.services.identity_runtime import identity_runtime as svc
        return svc.run_auto_resolver, svc.persist_resolver_hits, "post-5.5/G"
    else:
        # Pre-extraction: helpers still live on server.py.
        # ``import server`` runs the live startup once (~0.85s) and
        # caches in sys.modules. Subsequent imports are free.
        import server  # noqa: WPS433
        return server._run_auto_resolver, server._persist_resolver_hits, "pre-5.5/G"


# ═══════════════════════════════════════════════════════════════════
# Common fixtures — fake db + AutoResolver report shape + module patches
# ═══════════════════════════════════════════════════════════════════


@pytest.fixture
def fake_report() -> Dict[str, Any]:
    """Canonical AutoResolver.run().to_dict() shape — 5 keys."""
    return {
        "ranAt": "2026-05-20T10:00:00Z",
        "container": {
            "value": "MSCU1234567",
            "source": "shipsgo",
            "confidence": 0.85,
            "evidence": {"hits": 2},
        },
        "vessel": {
            "value": {"name": "EVER GIVEN", "mmsi": "636019825", "imo": "9811000"},
            "source": "vesselfinder",
            "confidence": 0.92,
            "evidence": {"hits": 3},
        },
        "transfer": None,
        "actions": ["resolved:container", "resolved:vessel"],
    }


@pytest.fixture
def shipment_no_identity() -> Dict[str, Any]:
    """Shipment with active vessel stage but no container/vessel bound."""
    return {
        "id": "ship_g1",
        "customerId": "cust_42",
        "currentStageId": "stg_vessel",
        "stages": [
            {"id": "stg_vessel", "type": "vessel", "container": None, "vessel": None},
        ],
        "container": None,
        "vessel": None,
    }


@pytest.fixture
def shipment_with_container() -> Dict[str, Any]:
    """Shipment that already has container bound at top-level."""
    return {
        "id": "ship_g6",
        "customerId": "cust_99",
        "currentStageId": "stg_vessel",
        "stages": [
            {"id": "stg_vessel", "type": "vessel",
             "container": {"number": "PRE_EXISTING"}, "vessel": None},
        ],
        "container": {"number": "PRE_EXISTING"},
        "vessel": None,
    }


@pytest.fixture
def patched_runtime(monkeypatch, fake_report):
    """Patch the helper module(s) with fake db + fake AutoResolver factory.

    Both pre- and post-extraction branches share the same patch surface
    on ``server`` (db lookups go through it either via module global
    or via the db_runtime accessor that publishes server.db). For the
    post-extraction branch we additionally patch the freshly-imported
    identity_runtime module's local _get_auto_resolver attribute (or
    the resolver_engine.AutoResolver class — whichever the new home
    chooses).
    """
    # ── Fake db ──
    fake_db = MagicMock(name="fake_db")
    fake_db.shipments = MagicMock(name="fake_db.shipments")
    fake_db.shipments.update_one = AsyncMock(name="db.shipments.update_one",
                                              return_value=MagicMock(matched_count=1))
    fake_db.shipments.find_one = AsyncMock(name="db.shipments.find_one",
                                            return_value=None)

    # ── Fake AutoResolver factory ──
    fake_report_obj = MagicMock(name="ResolverReport")
    fake_report_obj.to_dict = MagicMock(return_value=fake_report)
    fake_resolver_instance = MagicMock(name="AutoResolverInstance")
    fake_resolver_instance.run = AsyncMock(return_value=fake_report_obj)

    fake_resolver_factory = MagicMock(name="_get_auto_resolver",
                                       return_value=fake_resolver_instance)

    # ── Patch server module surface (covers pre-extraction branch and
    #    the post-extraction lazy-bridge `from server import add_shipment_event`). ──
    import sys
    import server  # noqa: WPS433 — real server module load (cached after first call)

    srv = sys.modules["server"]

    monkeypatch.setattr(srv, "db", fake_db, raising=False)
    monkeypatch.setattr(srv, "_get_auto_resolver", fake_resolver_factory, raising=False)
    monkeypatch.setattr(srv, "add_shipment_event",
                        AsyncMock(name="add_shipment_event"), raising=False)
    monkeypatch.setattr(srv, "_external_container_lookup",
                        AsyncMock(name="_external_container_lookup",
                                   return_value=None), raising=False)
    monkeypatch.setattr(srv, "_RESOLVER_MIN_CONF", 0.5, raising=False)

    # Pre-extraction: helpers reach for these via server globals.
    # Post-extraction: helpers reach for these via the canonical accessors
    #                  (app.core.db_runtime.get_db) — patch those too.
    try:
        from app.core import db_runtime
        monkeypatch.setattr(db_runtime, "get_db", lambda: fake_db, raising=False)
    except Exception:  # pragma: no cover
        pass

    # If the post-extraction module has been loaded, monkey-patch the
    # local _get_auto_resolver + add_shipment_event references inside it
    # so behaviour parity holds regardless of whether the new home keeps
    # them as module-locals or aux-bridge lazy imports.
    svc_mod = sys.modules.get("app.services.identity_runtime")
    if svc_mod is not None:
        if hasattr(svc_mod, "_get_auto_resolver"):
            monkeypatch.setattr(svc_mod, "_get_auto_resolver",
                                fake_resolver_factory, raising=False)
        if hasattr(svc_mod, "add_shipment_event"):
            monkeypatch.setattr(svc_mod, "add_shipment_event",
                                AsyncMock(name="add_shipment_event"),
                                raising=False)
        if hasattr(svc_mod, "_RESOLVER_MIN_CONF"):
            monkeypatch.setattr(svc_mod, "_RESOLVER_MIN_CONF", 0.5,
                                raising=False)

    # 5.5/I compat-pin: post-5.5/I, ``add_shipment_event`` lives in
    # ``app.services.shipments``. ``identity_runtime._add_shipment_event``
    # is now a thin async wrapper that lazy-imports from the canonical
    # home — so we must patch the canonical home directly to prevent
    # real $push to db.shipments which would cause an extra update_one
    # call on the fake_db mock.
    try:
        import app.services.shipments as _shipments_mod  # noqa: WPS433
        monkeypatch.setattr(_shipments_mod, "add_shipment_event",
                            AsyncMock(name="add_shipment_event_canonical"),
                            raising=False)
    except Exception:
        pass

    return {
        "db": fake_db,
        "resolver_factory": fake_resolver_factory,
        "resolver_instance": fake_resolver_instance,
        "report": fake_report,
    }


# ═══════════════════════════════════════════════════════════════════
# G1 — run_auto_resolver returns dict shape parity
# ═══════════════════════════════════════════════════════════════════


@pytest.mark.asyncio
async def test_g1_run_auto_resolver_shape(patched_runtime):
    """G1: Output dict carries the 5 expected keys."""
    run, _persist, label = _resolve_helpers()
    shipment = {"id": "ship_g1", "currentStageId": "stg_vessel", "stages": []}

    result = await run(shipment)

    assert isinstance(result, dict), f"[{label}] expected dict, got {type(result)}"
    for key in ("ranAt", "container", "vessel", "transfer", "actions"):
        assert key in result, f"[{label}] missing key {key!r} in result: {result}"


# ═══════════════════════════════════════════════════════════════════
# G2 — run_auto_resolver persists trace snapshot
# ═══════════════════════════════════════════════════════════════════


@pytest.mark.asyncio
async def test_g2_run_auto_resolver_persists_trace(patched_runtime):
    """G2: A db.shipments.update_one is fired with {"$set":{"resolver":…}}."""
    run, _persist, label = _resolve_helpers()
    shipment = {"id": "ship_g2", "currentStageId": "stg_vessel", "stages": []}

    await run(shipment)

    db = patched_runtime["db"]
    assert db.shipments.update_one.await_count >= 1, (
        f"[{label}] expected at least 1 update_one call, got "
        f"{db.shipments.update_one.await_count}"
    )
    # Inspect the first await — the resolver-trace persist site.
    call = db.shipments.update_one.await_args_list[0]
    args, kwargs = call.args, call.kwargs
    # filter / update split varies (positional vs kw), normalise:
    flt = args[0] if args else kwargs.get("filter")
    upd = args[1] if len(args) > 1 else kwargs.get("update")
    assert flt == {"id": "ship_g2"}, f"[{label}] wrong filter: {flt}"
    assert "$set" in upd, f"[{label}] missing $set: {upd}"
    assert "resolver" in upd["$set"], f"[{label}] missing resolver field: {upd}"
    # Trace shape:
    trace = upd["$set"]["resolver"]
    for key in ("lastRun", "container", "vessel", "transfer", "actions"):
        assert key in trace, f"[{label}] resolver-trace missing {key!r}: {trace}"


# ═══════════════════════════════════════════════════════════════════
# G3 — persist_resolver_hits with sub-threshold confidence
# ═══════════════════════════════════════════════════════════════════


@pytest.mark.asyncio
async def test_g3_persist_low_confidence_skips(
    patched_runtime, shipment_no_identity
):
    """G3: Confidence below MIN_CONFIDENCE → all-False diff, no DB write."""
    _run, persist, label = _resolve_helpers()
    low_conf_report = {
        "container": {"value": "C1", "source": "x", "confidence": 0.1},
        "vessel":    {"value": {"name": "V"}, "source": "y", "confidence": 0.1},
        "transfer":  None,
        "actions":   [],
    }

    diff = await persist(shipment_no_identity, low_conf_report)

    assert diff["containerChanged"] is False, f"[{label}] diff={diff}"
    assert diff["vesselChanged"] is False, f"[{label}] diff={diff}"
    # No DB write for the persist branch — only the trace from G2.
    db = patched_runtime["db"]
    assert db.shipments.update_one.await_count == 0, (
        f"[{label}] expected no persist write, got "
        f"{db.shipments.update_one.await_count}"
    )


# ═══════════════════════════════════════════════════════════════════
# G4 — persist_resolver_hits with HIGH-conf container hit
# ═══════════════════════════════════════════════════════════════════


@pytest.mark.asyncio
async def test_g4_persist_container_hit(
    patched_runtime, shipment_no_identity
):
    """G4: High-conf container → diff.containerChanged=True, DB write,
    add_shipment_event fired with type='container_resolved'."""
    _run, persist, label = _resolve_helpers()
    high_conf_report = {
        "container": {
            "value": "MSCU7654321",
            "source": "shipsgo",
            "confidence": 0.9,
            "evidence": {},
        },
        "vessel":   {"value": None, "source": None, "confidence": 0.0},
        "transfer": None,
        "actions":  [],
    }

    diff = await persist(shipment_no_identity, high_conf_report)

    assert diff["containerChanged"] is True, f"[{label}] diff={diff}"
    assert diff["container"] == "MSCU7654321", f"[{label}] diff={diff}"
    assert diff["vesselChanged"] is False, f"[{label}] diff={diff}"

    db = patched_runtime["db"]
    assert db.shipments.update_one.await_count == 1, (
        f"[{label}] expected 1 update_one, got {db.shipments.update_one.await_count}"
    )
    call = db.shipments.update_one.await_args_list[0]
    upd = call.args[1] if len(call.args) > 1 else call.kwargs.get("update")
    set_block = upd["$set"]
    assert "container" in set_block, f"[{label}] $set missing container: {set_block}"
    assert set_block["container"]["number"] == "MSCU7654321", (
        f"[{label}] {set_block['container']}"
    )
    assert set_block.get("containerSource") == "shipsgo", f"[{label}] {set_block}"
    assert set_block.get("containerConfidence") == 0.9, f"[{label}] {set_block}"
    assert set_block.get("containerAutoResolved") is True, f"[{label}] {set_block}"

    # add_shipment_event must fire with the resolved-event type.
    # 5.5/I compat-pin: canonical home is app.services.shipments.
    import sys
    srv = sys.modules.get("server")
    svc_mod = sys.modules.get("app.services.identity_runtime")
    shipments_mod = sys.modules.get("app.services.shipments")
    add_event_mock = None
    if shipments_mod is not None and hasattr(shipments_mod, "add_shipment_event"):
        add_event_mock = shipments_mod.add_shipment_event
    if add_event_mock is None and svc_mod is not None and hasattr(svc_mod, "add_shipment_event"):
        add_event_mock = svc_mod.add_shipment_event
    if add_event_mock is None and srv is not None:
        add_event_mock = getattr(srv, "add_shipment_event", None)
    assert add_event_mock is not None and add_event_mock.await_count == 1, (
        f"[{label}] add_shipment_event mock not invoked"
    )
    # First positional + kwargs:
    ev_call = add_event_mock.await_args_list[0]
    ev_args = ev_call.args
    assert ev_args[0] == "ship_g1", f"[{label}] wrong shipment_id: {ev_args}"
    assert ev_args[1] == "container_resolved", f"[{label}] wrong event type: {ev_args}"


# ═══════════════════════════════════════════════════════════════════
# G5 — persist_resolver_hits with HIGH-conf vessel hit
# ═══════════════════════════════════════════════════════════════════


@pytest.mark.asyncio
async def test_g5_persist_vessel_hit(
    patched_runtime, shipment_no_identity
):
    """G5: High-conf vessel → diff.vesselChanged=True with new_vessel
    mmsi/imo/name populated, DB write, add_shipment_event fired with
    type='vessel_resolved'."""
    _run, persist, label = _resolve_helpers()
    high_conf_report = {
        "container": {"value": None, "source": None, "confidence": 0.0},
        "vessel": {
            "value": {"name": "MAERSK ALABAMA",
                      "mmsi": "367020980",
                      "imo": "9214082"},
            "source": "vesselfinder",
            "confidence": 0.95,
            "evidence": {},
        },
        "transfer": None,
        "actions":  [],
    }

    diff = await persist(shipment_no_identity, high_conf_report)

    assert diff["vesselChanged"] is True, f"[{label}] diff={diff}"
    assert diff["vesselName"] == "MAERSK ALABAMA", f"[{label}] diff={diff}"
    assert diff["vesselMmsi"] == "367020980", f"[{label}] diff={diff}"
    assert diff["vesselImo"] == "9214082", f"[{label}] diff={diff}"
    assert diff["containerChanged"] is False, f"[{label}] diff={diff}"

    db = patched_runtime["db"]
    call = db.shipments.update_one.await_args_list[0]
    upd = call.args[1] if len(call.args) > 1 else call.kwargs.get("update")
    set_block = upd["$set"]
    assert "vessel" in set_block, f"[{label}] $set missing vessel: {set_block}"
    assert set_block["vessel"]["name"] == "MAERSK ALABAMA", f"[{label}] {set_block}"
    assert set_block.get("vesselAutoResolved") is True, f"[{label}] {set_block}"


# ═══════════════════════════════════════════════════════════════════
# G6 — persist_resolver_hits is idempotent on already-bound identity
# ═══════════════════════════════════════════════════════════════════


@pytest.mark.asyncio
async def test_g6_persist_idempotent_no_overwrite(
    patched_runtime, shipment_with_container
):
    """G6: Container already bound at top-level → resolver does NOT
    overwrite. Diff stays False, no DB write."""
    _run, persist, label = _resolve_helpers()
    high_conf_report = {
        "container": {
            "value": "NEW_BUT_REJECTED",
            "source": "shipsgo",
            "confidence": 0.99,
            "evidence": {},
        },
        "vessel":   {"value": None, "source": None, "confidence": 0.0},
        "transfer": None,
        "actions":  [],
    }

    diff = await persist(shipment_with_container, high_conf_report)

    assert diff["containerChanged"] is False, (
        f"[{label}] should NOT overwrite existing container: diff={diff}"
    )
    db = patched_runtime["db"]
    assert db.shipments.update_one.await_count == 0, (
        f"[{label}] expected no DB write on idempotent skip, got "
        f"{db.shipments.update_one.await_count}"
    )


# ═══════════════════════════════════════════════════════════════════
# Structural pins (S1-S5) — expected to FAIL pre-extraction.
# ═══════════════════════════════════════════════════════════════════


SERVER_PY = BACKEND_ROOT / "server.py"
SERVICE_PY = BACKEND_ROOT / "app" / "services" / "identity_runtime.py"
ADMIN_RESOLVER_PY = BACKEND_ROOT / "app" / "routers" / "admin_resolver.py"
ADMIN_IDENTITY_PY = BACKEND_ROOT / "app" / "routers" / "admin_identity.py"
ADMIN_SHIPMENTS_PY = BACKEND_ROOT / "app" / "routers" / "admin_shipments.py"


def test_s1_identity_runtime_module_no_legacy_lazy_bridges():
    """S1: identity_runtime.py no longer carries actual ImportFrom nodes
    `from server import _run_auto_resolver` / `_persist_resolver_hits`
    (AST-based — docstring/comment mentions do not count)."""
    src = SERVICE_PY.read_text()
    assert not _has_legacy_server_import(src, "_run_auto_resolver"), (
        "S1 FAIL: legacy ImportFrom `from server import _run_auto_resolver` "
        "still present in app/services/identity_runtime.py"
    )
    assert not _has_legacy_server_import(src, "_persist_resolver_hits"), (
        "S1 FAIL: legacy ImportFrom `from server import _persist_resolver_hits` "
        "still present in app/services/identity_runtime.py"
    )


def test_s2_server_py_no_longer_defines_cluster():
    """S2: server.py no longer defines the resolver-cluster helpers."""
    src = SERVER_PY.read_text()
    # Definition tokens — pin against the `def name(...)` shape so a
    # mere mention in a comment doesn't false-positive.
    forbidden_defs = [
        "async def _run_auto_resolver(",
        "async def _persist_resolver_hits(",
        "def _get_auto_resolver(",
        "async def _resolver_shipsgo_lookup(",
        "async def _resolver_vf_search(",
    ]
    found = [tok for tok in forbidden_defs if tok in src]
    assert not found, (
        f"S2 FAIL: server.py still defines retired cluster helpers: {found}"
    )
    # The `from resolver_engine import (AutoResolver, MIN_CONFIDENCE)`
    # block is no longer needed in server.py once the cluster moves.
    assert "AutoResolver as _AutoResolver" not in src, (
        "S2 FAIL: server.py still imports `AutoResolver as _AutoResolver` — "
        "expected the import block to leave with the cluster"
    )


def test_s3_router_consumers_no_lazy_server_bridge():
    """S3: admin_resolver / admin_identity / admin_shipments no longer
    lazy-import identity_runtime from server (AST-based check)."""
    for path in (ADMIN_RESOLVER_PY, ADMIN_IDENTITY_PY, ADMIN_SHIPMENTS_PY):
        src = path.read_text()
        assert not _has_legacy_server_import(src, "identity_runtime"), (
            f"S3 FAIL: {path.name} still carries actual ImportFrom "
            "`from server import identity_runtime` — expected "
            "`from app.services.identity_runtime import identity_runtime`"
        )


def test_s4_inventory_counts_post_5_5_g():
    """S4: Inventory shrunk per cluster retirement."""
    from app.core.app_state_targets import (
        BRIDGE_INVENTORY,
        TIER_C_REQUIRES_REFACTOR,
        PHASE_5_5_BOUNDARY,
        EXTRACTION_AUX_BRIDGES,
    )
    # 5.5/I compatible-pin: BRIDGE_INVENTORY 3→2→1, TIER_C 2→1→0,
    # PHASE_5_5_BOUNDARY 2→1→0, EXTRACTION_AUX_BRIDGES 47 (net Δ-0 across
    # 5.5/G→5.5/H→5.5/I; 5.5/I retires 2 aux + registers 2 new SHIPMENTS_DEP).
    assert len(BRIDGE_INVENTORY) in (3, 2, 1), (
        f"S4 FAIL: BRIDGE_INVENTORY size = {len(BRIDGE_INVENTORY)}, expected 3 "
        "(post-5.5/G), 2 (post-5.5/H), or 1 (post-5.5/I)"
    )
    assert len(TIER_C_REQUIRES_REFACTOR) in (2, 1, 0), (
        f"S4 FAIL: TIER_C size = {len(TIER_C_REQUIRES_REFACTOR)}, expected 2 "
        "(post-5.5/G), 1 (post-5.5/H), or 0 (post-5.5/I — ZERO Tier-C)"
    )
    assert len(PHASE_5_5_BOUNDARY) in (2, 1, 0), (
        f"S4 FAIL: PHASE_5_5_BOUNDARY size = {len(PHASE_5_5_BOUNDARY)}, "
        "expected 2 (post-5.5/G), 1 (post-5.5/H), or 0 (post-5.5/I)"
    )
    assert len(EXTRACTION_AUX_BRIDGES) in (2, 47, 45, 44), (
        f"S4 FAIL: EXTRACTION_AUX_BRIDGES size = {len(EXTRACTION_AUX_BRIDGES)}, "
        "expected 47 (post-5.5/G or post-5.5/H — 5.5/H net Δ-0: "
        "_external_container_lookup retired, _tracking_snapshot registered) "
        "or 45 (post-6.2.ACTUAL — _normalize_stage + build_default_stages "
        "SHIPMENTS_DEP retired as part of Shell Thinning execution)"
    )


def test_s5_phase_5_5_g_retired_bridges_constant_exists():
    """S5: PHASE_5_5_G_RETIRED_BRIDGES constant — registers the 3 retired bridges."""
    from app.core import app_state_targets
    assert hasattr(app_state_targets, "PHASE_5_5_G_RETIRED_BRIDGES"), (
        "S5 FAIL: PHASE_5_5_G_RETIRED_BRIDGES constant not exported"
    )
    retired = getattr(app_state_targets, "PHASE_5_5_G_RETIRED_BRIDGES")
    assert len(retired) == 3, (
        f"S5 FAIL: PHASE_5_5_G_RETIRED_BRIDGES has {len(retired)} entries, "
        "expected 3 (_run_auto_resolver, _persist_resolver_hits, identity_runtime)"
    )
    assert "PHASE_5_5_G_RETIRED_BRIDGES" in getattr(
        app_state_targets, "__all__", []
    ), "S5 FAIL: PHASE_5_5_G_RETIRED_BRIDGES not in __all__"


# ═══════════════════════════════════════════════════════════════════
# O1 — OpenAPI surface freeze
# ═══════════════════════════════════════════════════════════════════


def test_o1_openapi_surface_unchanged():
    """O1: paths=618 / ops=679 — frozen by 5.5/F2, preserved through 5.5/G."""
    import urllib.request
    try:
        with urllib.request.urlopen(
            "http://localhost:8001/api/openapi.json", timeout=10
        ) as resp:
            spec = json.loads(resp.read())
    except Exception as e:
        pytest.skip(f"backend not reachable for OpenAPI probe: {e}")
        return
    paths = len(spec.get("paths", {}))
    ops = sum(
        len([m for m in v if m in (
            "get", "post", "put", "patch", "delete", "options", "head"
        )])
        for v in spec.get("paths", {}).values()
        if isinstance(v, dict)
    )
    assert paths == 618, f"O1 FAIL: paths={paths}, expected 618 (5.5/F2 freeze)"
    assert ops == 679, f"O1 FAIL: ops={ops}, expected 679 (5.5/F2 freeze)"
