"""
tests/test_phase5_5_i_shipments_orchestration.py
=================================================

Phase 5.5 / I — Shipments Orchestration Cluster Retirement (GOLDEN SUITE)

This is the **golden-first** test suite for the FINAL Phase-5
cluster-retirement wave. It is designed to:

  * **PASS pre-extraction**  — V1-V8 behavioural + O1 OpenAPI freeze
                               (7/8 + O1 PASS pre, S1-S5 FAIL by design)
  * **PASS post-extraction** — 14/14 PASS

Cluster scope (D1 mandate, user-locked at 5.5/I kickoff):
    1. ``ensure_shipment_stages``  — BRIDGE_INVENTORY, Tier-C
                                       (HELPER_FUNCTION → stage lifecycle)
    2. ``add_shipment_event``      — EXTRACTION_AUX_BRIDGES RESOLVER_DEP
                                       (async event writer + sio side-channel)
    3. ``generate_route``          — EXTRACTION_AUX_BRIDGES CUSTOMER_AUTH_DEP
                                       (pure 5-point route helper)

Canonical home (D2):
    ``app/services/shipments.py`` (NEW module — natural shipments-domain
    service tier; sibling to the existing ``app/utils/shipments.py``
    pure-utils tier that hosts ``serialize_journey``, ``get_current_stage``,
    ``is_valid_movement`` since Phase 5.4 / C-5e).

Migration constraints (user-locked D-set at 5.5/I kickoff):

  * D1  cluster retirement ONLY (single focused commit)
  * D2  canonical home: NEW ``app/services/shipments.py``
  * D3  no worker-lifecycle refactor — ``tracking_worker`` /
        ``resolver_worker`` / ``transfer_detector`` untouched
  * D4  no provider-algorithm edits — stage state-machine + route
        algorithm + event writer preserved byte-for-byte
  * D5  no schema evolution — shipment doc shape, stages[] array,
        events[] array, ``$push`` + ``$slice -40`` + ``lastEvent`` /
        ``lastEventTime`` / ``updated_at`` keys preserved 1:1
  * D6  no async orchestration changes — function signatures,
        ``await db.shipments.update_one(...)`` + ``await sio.emit(...)``
        shape preserved 1:1
  * D7  golden suite FIRST (this file)
  * D8  no orchestration improvements — no stage redesign, no workflow
        simplification, no event-model cleanup, no route optimization,
        no async scheduling edits, no shipment schema changes

Test taxonomy
─────────────

  V1-V8  Behavioural — pure-function + async-callable parity (pass pre + post)
  S1-S5  Structural   — module presence + lazy-bridge migration (FAIL pre, PASS post)
  O1     OpenAPI       — paths=618, ops=679 still frozen (pass pre + post)
"""

from __future__ import annotations

import ast
import json
import sys
from pathlib import Path
from typing import Any, Dict
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

BACKEND_ROOT = Path(__file__).resolve().parents[1]
SERVER_PY = BACKEND_ROOT / "server.py"
SHIPMENTS_SVC_PY = BACKEND_ROOT / "app" / "services" / "shipments.py"


# ─────────────────────────────────────────────────────────────────────
# Helpers — resolve callable from either canonical home (post) or
# server.py shim (pre + post via delegation)
# ─────────────────────────────────────────────────────────────────────

def _has_function_def(src: str, name: str) -> bool:
    tree = ast.parse(src)
    for n in ast.walk(tree):
        if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef)) and n.name == name:
            return True
    return False


def _has_function_body(src: str, name: str, min_loc: int) -> bool:
    """True iff function has a real body (>= min_loc lines), not a shim
    wrapper. A shim is typically <8 LOC (signature + 1-2-line docstring
    + return delegation)."""
    tree = ast.parse(src)
    for n in ast.walk(tree):
        if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef)) and n.name == name:
            loc = (n.end_lineno or n.lineno) - n.lineno + 1
            return loc >= min_loc
    return False


def _resolve_helpers():
    """Return the trio (generate_route, ensure_shipment_stages,
    add_shipment_event) from either canonical home (post-extraction) or
    server.py (pre-extraction). The shim pattern means server.py keeps
    the SAME callable name for the in-file caller chain (mirror of the
    Phase 5.4 / C-5e ``get_current_stage`` shim) — so resolving via
    ``server.*`` works in both shapes."""
    srv_src = SERVER_PY.read_text()
    post_extraction = (
        SHIPMENTS_SVC_PY.exists()
        and not _has_function_body(srv_src, "ensure_shipment_stages", min_loc=15)
        and not _has_function_body(srv_src, "add_shipment_event", min_loc=20)
        and not _has_function_body(srv_src, "generate_route", min_loc=15)
    )
    if post_extraction:
        from app.services.shipments import (
            ensure_shipment_stages,
            add_shipment_event,
            generate_route,
        )
        return generate_route, ensure_shipment_stages, add_shipment_event
    # pre-extraction (or shim-via-server delegation) — both work via server
    from server import (
        ensure_shipment_stages,
        add_shipment_event,
        generate_route,
    )
    return generate_route, ensure_shipment_stages, add_shipment_event


# ═════════════════════════════════════════════════════════════════════
# V1-V8 — Behavioural parity (pass pre + post)
# ═════════════════════════════════════════════════════════════════════

def test_v1_generate_route_empty_returns_empty_list():
    """V1: generate_route(None, *) and (*, None) return []."""
    generate_route, *_ = _resolve_helpers()
    assert generate_route(None, None) == []
    assert generate_route(None, {"lat": 1, "lng": 2}) == []
    assert generate_route({"lat": 1, "lng": 2}, None) == []


def test_v2_generate_route_returns_5_point_path():
    """V2: generate_route returns 5-element list with origin first /
    destination last, ordered semantic of the Atlantic-crossing
    waypoints preserved (D4)."""
    generate_route, *_ = _resolve_helpers()
    origin = {"lat": 25.7617, "lng": -80.1918}      # Miami
    dest = {"lat": 51.5074, "lng": -0.1278}         # London
    route = generate_route(origin, dest)
    assert isinstance(route, list)
    assert len(route) == 5
    assert route[0] == origin
    assert route[-1] == dest
    # Middle waypoint = mid-ocean (average)
    assert route[2]["lat"] == pytest.approx((25.7617 + 51.5074) / 2)
    assert route[2]["lng"] == pytest.approx((-80.1918 + -0.1278) / 2)


def test_v3_ensure_shipment_stages_empty_input():
    """V3: ensure_shipment_stages({}) returns {} (early-return guard
    for empty/None shipments)."""
    _, ensure_shipment_stages, _ = _resolve_helpers()
    assert ensure_shipment_stages({}) == {}
    assert ensure_shipment_stages(None) is None


def test_v4_ensure_shipment_stages_builds_default_when_no_stages():
    """V4: shipment with no stages[] gets a default stage list built,
    currentStageId set to first stage id, _stages_backfilled = True."""
    _, ensure_shipment_stages, _ = _resolve_helpers()
    shipment = {
        "id": "ship_v4",
        "origin": {"lat": 25.7, "lng": -80.0, "name": "Miami"},
        "destination": {"lat": 51.5, "lng": -0.1, "name": "London"},
        "vessel": {"name": "MV Test"},
    }
    result = ensure_shipment_stages(shipment)
    assert isinstance(result["stages"], list)
    assert len(result["stages"]) > 0
    assert result["currentStageId"] == result["stages"][0]["id"]
    assert result["_stages_backfilled"] is True


def test_v5_ensure_shipment_stages_normalizes_existing_stages():
    """V5: shipment with existing stages[] gets normalized in place;
    currentStageId reconciled to first active or first overall."""
    _, ensure_shipment_stages, _ = _resolve_helpers()
    shipment = {
        "id": "ship_v5",
        "stages": [
            {"id": "s1", "name": "Loading", "status": "completed"},
            {"id": "s2", "name": "Transit", "status": "active"},
            {"id": "s3", "name": "Arrival", "status": "pending"},
        ],
        "currentStageId": "wrong_id",  # invalid — should reconcile
    }
    result = ensure_shipment_stages(shipment)
    assert len(result["stages"]) == 3
    # currentStageId reconciled to first active
    assert result["currentStageId"] == "s2"
    # Idempotent — second call doesn't break anything
    result2 = ensure_shipment_stages(result)
    assert result2["currentStageId"] == "s2"


@pytest.mark.asyncio
async def test_v6_add_shipment_event_persists_and_emits():
    """V6: add_shipment_event awaits db.shipments.update_one with the
    correct $push/$slice/$set shape AND awaits sio.emit when
    customer_id is present (D5 schema-parity, D6 async-shape-parity)."""
    _, _, add_shipment_event = _resolve_helpers()

    # Patch db (motor-async) + sio. The shipments service uses lazy
    # accessors (_db, _sio) — patch them.
    from app.services import shipments as _svc
    mock_db = MagicMock()
    mock_db.shipments.update_one = AsyncMock(return_value=None)
    mock_sio = MagicMock()
    mock_sio.emit = AsyncMock(return_value=None)

    with patch.object(_svc, "_db", return_value=mock_db), \
         patch.object(_svc, "_sio", return_value=mock_sio):
        await add_shipment_event(
            shipment_id="ship_v6",
            event_type="customs_clear",
            label="Customs cleared",
            meta={"port": "Hamburg"},
            customer_id="cust_v6",
        )

    # Db write happened with the right $push payload shape
    assert mock_db.shipments.update_one.called
    call = mock_db.shipments.update_one.call_args
    filter_arg, update_arg = call.args[0], call.args[1]
    assert filter_arg == {"id": "ship_v6"}
    assert "$push" in update_arg
    assert "events" in update_arg["$push"]
    assert update_arg["$push"]["events"]["$slice"] == -40
    assert "$set" in update_arg
    assert update_arg["$set"]["lastEvent"] == "customs_clear"
    assert "lastEventTime" in update_arg["$set"]
    assert "updated_at" in update_arg["$set"]
    # Sio emit happened on user room
    assert mock_sio.emit.called
    emit_call = mock_sio.emit.call_args
    assert emit_call.args[0] == "shipment:event"
    assert emit_call.kwargs.get("room") == "user_cust_v6"


@pytest.mark.asyncio
async def test_v7_add_shipment_event_no_sio_when_no_customer_id():
    """V7: add_shipment_event skips sio.emit when customer_id is None."""
    _, _, add_shipment_event = _resolve_helpers()
    from app.services import shipments as _svc
    mock_db = MagicMock()
    mock_db.shipments.update_one = AsyncMock(return_value=None)
    mock_sio = MagicMock()
    mock_sio.emit = AsyncMock(return_value=None)
    with patch.object(_svc, "_db", return_value=mock_db), \
         patch.object(_svc, "_sio", return_value=mock_sio):
        await add_shipment_event(
            shipment_id="ship_v7",
            event_type="loaded",
            label="Loaded",
            customer_id=None,  # no customer — no emit
        )
    assert mock_db.shipments.update_one.called
    assert not mock_sio.emit.called


@pytest.mark.asyncio
async def test_v8_add_shipment_event_swallows_db_errors():
    """V8: add_shipment_event swallows db.update_one exceptions (graceful
    — matches legacy logger.warning + continue semantics, D6 no async
    orchestration changes)."""
    _, _, add_shipment_event = _resolve_helpers()
    from app.services import shipments as _svc
    mock_db = MagicMock()
    mock_db.shipments.update_one = AsyncMock(side_effect=RuntimeError("db down"))
    mock_sio = MagicMock()
    mock_sio.emit = AsyncMock(return_value=None)
    with patch.object(_svc, "_db", return_value=mock_db), \
         patch.object(_svc, "_sio", return_value=mock_sio):
        # Must NOT raise
        await add_shipment_event(
            shipment_id="ship_v8",
            event_type="err_test",
            label="x",
            customer_id="cust_v8",
        )
    # Sio still emits even when db fails (legacy semantics — separate try blocks)
    assert mock_sio.emit.called


# ═════════════════════════════════════════════════════════════════════
# S1-S5 — Structural (FAIL pre, PASS post)
# ═════════════════════════════════════════════════════════════════════

def test_s1_app_services_shipments_module_exists():
    """S1: ``app/services/shipments.py`` exists with all 3 cluster
    functions defined."""
    assert SHIPMENTS_SVC_PY.exists(), (
        f"S1 FAIL: {SHIPMENTS_SVC_PY} missing — canonical home for "
        "5.5/I cluster (D2)"
    )
    src = SHIPMENTS_SVC_PY.read_text()
    for name in ("ensure_shipment_stages", "add_shipment_event", "generate_route"):
        assert _has_function_def(src, name), (
            f"S1 FAIL: ``{name}`` not defined in {SHIPMENTS_SVC_PY}"
        )


def test_s2_server_py_bodies_retired_or_shimmed():
    """S2: server.py no longer hosts the FULL bodies — only thin
    delegation shims are allowed (LOC<=10 each). Mirrors the C-5e
    ``get_current_stage`` shim pattern."""
    src = SERVER_PY.read_text()
    # Cluster members may remain as shim wrappers; body LOC must be tiny.
    for name, real_loc in (
        ("ensure_shipment_stages", 15),
        ("add_shipment_event", 20),
        ("generate_route", 15),
    ):
        assert not _has_function_body(src, name, min_loc=real_loc), (
            f"S2 FAIL: ``{name}`` in server.py still has real body "
            f">= {real_loc} LOC — must be a thin shim or removed "
            f"post-5.5/I"
        )


def test_s3_cross_module_consumers_migrated():
    """S3: the 3 known cross-module consumers no longer
    ``from server import …`` the cluster symbols. Sites:
       * app/routers/admin_resolver.py     → ensure_shipment_stages
       * app/services/identity_runtime.py  → add_shipment_event
       * app/services/customers.py         → generate_route
    """
    sites = [
        (BACKEND_ROOT / "app" / "routers" / "admin_resolver.py",
         "ensure_shipment_stages"),
        (BACKEND_ROOT / "app" / "services" / "identity_runtime.py",
         "add_shipment_event"),
        (BACKEND_ROOT / "app" / "services" / "customers.py",
         "generate_route"),
    ]
    for path, sym in sites:
        src = path.read_text()
        # Forbid `from server import <sym>` for this symbol.
        tree = ast.parse(src)
        bad_imports = [
            n for n in ast.walk(tree)
            if isinstance(n, ast.ImportFrom)
            and n.module == "server"
            and any(a.name == sym for a in n.names)
        ]
        assert not bad_imports, (
            f"S3 FAIL: {path.name} still does ``from server import {sym}`` "
            f"at line(s) {[n.lineno for n in bad_imports]} — must migrate "
            f"to ``from app.services.shipments import {sym}``"
        )


def test_s4_phase_5_5_i_retired_bridges_constant_exists():
    """S4: ``PHASE_5_5_I_RETIRED_BRIDGES`` constant exists in
    ``app_state_targets`` with 3 entries and is exported."""
    from app.core import app_state_targets as t
    assert hasattr(t, "PHASE_5_5_I_RETIRED_BRIDGES"), (
        "S4 FAIL: PHASE_5_5_I_RETIRED_BRIDGES constant not defined"
    )
    assert "PHASE_5_5_I_RETIRED_BRIDGES" in getattr(t, "__all__", ()), (
        "S4 FAIL: PHASE_5_5_I_RETIRED_BRIDGES not in __all__"
    )
    retired = t.PHASE_5_5_I_RETIRED_BRIDGES
    syms = {row[0] for row in retired}
    assert syms == {
        "ensure_shipment_stages", "add_shipment_event", "generate_route",
    }, f"S4 FAIL: PHASE_5_5_I_RETIRED_BRIDGES symbols = {syms}, expected the 3 cluster members"


def test_s5_inventory_post_5_5_i():
    """S5: post-5.5/I inventory — BRIDGE_INVENTORY 2 → 1 (only
    ``_STATIC_DIR`` remains; THIS IS THE PHASE-5 FINALE — ZERO Tier-C
    bridges left); TIER_C_REQUIRES_REFACTOR 1 → 0;
    PHASE_5_5_BOUNDARY 1 → 0; EXTRACTION_AUX_BRIDGES net delta depends
    on whether ``_normalize_stage`` + ``build_default_stages`` lazy
    bridges are registered (target: 47 → 47 net = −2 (generate_route,
    add_shipment_event RESOLVER_DEP/CUSTOMER_AUTH_DEP retired) + 2
    (_normalize_stage, build_default_stages new SHIPMENTS_DEP entries)
    OR 47 → 45 if helpers are also moved)."""
    from app.core.app_state_targets import (
        BRIDGE_INVENTORY,
        TIER_C_REQUIRES_REFACTOR,
        PHASE_5_5_BOUNDARY,
        EXTRACTION_AUX_BRIDGES,
        QUALIFIED_USAGE_BRIDGES,
    )
    bridge_syms = {b.symbol for b in BRIDGE_INVENTORY}
    assert "ensure_shipment_stages" not in bridge_syms, (
        f"S5 FAIL: ``ensure_shipment_stages`` still in BRIDGE_INVENTORY"
    )
    assert len(BRIDGE_INVENTORY) == 1, (
        f"S5 FAIL: BRIDGE_INVENTORY size = {len(BRIDGE_INVENTORY)}, "
        f"expected 1 post-5.5/I (was 2 post-5.5/H — only ``_STATIC_DIR`` "
        f"Tier-B should remain; THIS IS THE PHASE-5 FINALE)"
    )
    assert len(TIER_C_REQUIRES_REFACTOR) == 0, (
        f"S5 FAIL: TIER_C_REQUIRES_REFACTOR size = "
        f"{len(TIER_C_REQUIRES_REFACTOR)}, expected 0 post-5.5/I "
        f"(ZERO Tier-C bridges — the Phase-5 disentangling endpoint)"
    )
    assert len(PHASE_5_5_BOUNDARY) == 0, (
        f"S5 FAIL: PHASE_5_5_BOUNDARY size = {len(PHASE_5_5_BOUNDARY)}, "
        f"expected 0 post-5.5/I (Phase 5.5 officially closed)"
    )
    aux_syms = {b.symbol for b in EXTRACTION_AUX_BRIDGES}
    assert "add_shipment_event" not in aux_syms, (
        "S5 FAIL: ``add_shipment_event`` still in EXTRACTION_AUX_BRIDGES "
        "(5.5/G RESOLVER_DEP — must be retired in 5.5/I)"
    )
    assert "generate_route" not in aux_syms, (
        "S5 FAIL: ``generate_route`` still in EXTRACTION_AUX_BRIDGES "
        "(5.5/D CUSTOMER_AUTH_DEP — must be retired in 5.5/I)"
    )
    # QUALIFIED_USAGE_BRIDGES stays 0 (no regression).
    assert len(QUALIFIED_USAGE_BRIDGES) == 0


# ═════════════════════════════════════════════════════════════════════
# O1 — OpenAPI surface freeze (pass pre + post)
# ═════════════════════════════════════════════════════════════════════

def test_o1_openapi_surface_frozen():
    """O1: paths=618 ops=679 (no surface drift — D5/D6 mandates)."""
    # Use a subprocess to avoid heavy startup conflicts inside the
    # same pytest worker. The /api/openapi.json endpoint is the
    # authoritative source.
    import urllib.request
    try:
        o = json.loads(urllib.request.urlopen(
            "http://localhost:8001/api/openapi.json", timeout=10
        ).read())
    except Exception as e:
        pytest.skip(f"backend not reachable on localhost:8001 ({e})")
    paths = len(o.get("paths", {}))
    ops = sum(
        len([m for m in v.keys()
             if m in ("get", "post", "put", "delete", "patch", "head", "options")])
        for v in o.get("paths", {}).values()
    )
    assert paths == 618, f"O1 FAIL: paths={paths}, expected 618"
    assert ops == 679, f"O1 FAIL: ops={ops}, expected 679"
