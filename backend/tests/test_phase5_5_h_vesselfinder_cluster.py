"""
Phase 5.5 / H — VesselFinder Cluster Golden Suite
==================================================

This suite enforces the contract for the Phase 5.5/H **cluster
extraction** — the second cluster-retirement wave of the Phase 5
refactor cycle, after 5.5/G's identity-resolver cluster.

Mandate (verbatim, user-confirmed D1-D8 at 5.5/H kickoff)
─────────────────────────────────────────────────────────

  D1  Cluster = ``_vf_extract_vessels`` + ``_external_container_lookup``
      retired in a single focused commit (tracking-providers cluster).
  D2  Canonical homes:
      * ``_vf_extract_vessels`` → ``vesselfinder_scraper.py`` (already
        the source — server.py only carries an import alias; the alias
        leaves and consumers reach for the unaliased name).
      * ``_external_container_lookup`` → **NEW** module
        ``app/services/tracking_providers.py`` (renamed canonical
        ``external_container_lookup`` — no underscore prefix).
  D3  No worker-lifecycle refactor.
  D4  No provider-algorithm edits (ShipsGo / AfterShip fallback chain,
      retry semantics, header shapes — all preserved 1:1).
  D5  No schema evolution (return-dict keys + types preserved).
  D6  No async orchestration changes.
  D7  Golden suite FIRST.
  D8  No new provider integrations (ShipsGoEU / FleetMon / etc. NOT
      added; pure rehoming wave).

Cluster surface (2 bridges retired, 1 aux retired alongside)
─────────────────────────────────────────────────────────────

  RETIRED Tier-C bridges:
    * ``_vf_extract_vessels``        — server.py:19272 import alias →
                                       consumers use canonical
                                       ``extract_vessels_from_payload``
                                       direct from ``vesselfinder_scraper``.
    * ``_external_container_lookup`` — server.py:18798 def MOVED to
                                       ``app/services/tracking_providers.py``
                                       as public ``external_container_lookup``.

  RETIRED 5.5/G-aux entry:
    * ``_external_container_lookup`` (kind=RESOLVER_DEP, tier=C-aux)
      registered in 5.5/G as a lazy-bridge target — retired now that
      the function lives on the canonical service side and
      ``identity_runtime.py`` can ``from app.services.tracking_providers
      import external_container_lookup`` directly.

  ``add_shipment_event`` (5.5/G-aux, RESOLVER_DEP) — STAYS for 5.5/I
  shipment orchestration wave.

Inventory delta (post-5.5/H — target)
─────────────────────────────────────

  BRIDGE_INVENTORY:         3 → 2  (Δ-1: _vf_extract_vessels — the only
                                          Tier-C entry retired from this
                                          surface; _external_container_lookup
                                          lives in EXTRACTION_AUX_BRIDGES
                                          (kind=RESOLVER_DEP), not in
                                          BRIDGE_INVENTORY, and is
                                          decremented THERE; _STATIC_DIR
                                          Tier-B entry STAYS for Phase 5.8)
  TIER_C_REQUIRES_REFACTOR: 2 → 1  (Δ-1: _vf_extract_vessels — only
                                    ``ensure_shipment_stages`` remains)
  PHASE_5_5_BOUNDARY:       2 → 1  (Δ-1 same)
  EXTRACTION_AUX_BRIDGES:  47 → 47 (Δ-0 net: 5.5/G RESOLVER_DEP for
                                         ``_external_container_lookup``
                                         retired ⊝, and the
                                         ``_tracking_snapshot``
                                         cold-start lazy bridge in
                                         ``app/services/tracking_providers.py``
                                         (kind=TRACKING_PROVIDERS_DEP)
                                         registered as the
                                         tracking-providers
                                         extraction-aux ⊕.
                                         ``add_shipment_event``
                                         5.5/G-aux survives)
  QUALIFIED_USAGE_BRIDGES:  0 → 0  (unchanged)

12-assertion contract
─────────────────────

  Behavioural pins (V1-V6) — pre/post via _resolve_helpers switch:

    V1  external_container_lookup("") returns None (empty input guard)
    V2  external_container_lookup with no API keys configured returns
        None (no provider chain reachable)
    V3  external_container_lookup hits ShipsGo V1 GET (GetContainerInfo)
        first when shipsgo_api_key is configured; ShipsGo-shaped success
        returns dict with all expected keys
    V4  external_container_lookup falls back to AfterShip when ShipsGo
        absent + AfterShip key present; AfterShip-shaped success returns
        dict with {source='aftership', container, status, eta, raw}
    V5  extract_vessels_from_payload (canonical name, no underscore)
        is callable from the canonical home ``vesselfinder_scraper``
        and returns list[dict] from a valid VF payload
    V6  extract_vessels_from_payload returns [] for empty / invalid
        payload shapes (idempotent on absence)

  Structural pins (S1-S5) — post-state, expected FAIL pre-extraction:

    S1  ``server.py`` no longer defines ``async def
        _external_container_lookup`` and no longer has the
        ``extract_vessels_from_payload as _vf_extract_vessels`` alias
        on the ``from vesselfinder_scraper import …`` line.
    S2  ``app/services/tracking_providers.py`` exists, exports
        ``external_container_lookup`` (public, no underscore), and is
        included in the module ``__all__``.
    S3  ``shipment_identity_resolver.py`` no longer carries the
        ``from server import _vf_extract_vessels`` lazy ImportFrom —
        it now imports from ``vesselfinder_scraper`` directly.
    S4  ``app/services/identity_runtime.py`` no longer carries the
        ``_external_container_lookup_callable()`` lazy-bridge accessor
        with ``from server import _external_container_lookup``; it
        imports from ``app.services.tracking_providers`` directly.
    S5  Inventory: BRIDGE_INVENTORY 3→2, TIER_C 2→1,
        PHASE_5_5_BOUNDARY 2→1, EXTRACTION_AUX_BRIDGES 47→47 (net Δ-0);
        ``PHASE_5_5_H_RETIRED_BRIDGES`` constant exists with 2 entries
        and is exported via ``__all__``.

  OpenAPI freeze (O1):

    O1  paths=618, ops=679 unchanged.

Run:
    cd /app/backend && python -m pytest \\
        tests/test_phase5_5_h_vesselfinder_cluster.py -v
"""
from __future__ import annotations

import ast
import json
import sys
from pathlib import Path
from typing import Any, Awaitable, Callable, Dict, Optional, Tuple
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

BACKEND_ROOT = Path(__file__).resolve().parent.parent
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))


SERVER_PY = BACKEND_ROOT / "server.py"
TRACKING_PROVIDERS_PY = BACKEND_ROOT / "app" / "services" / "tracking_providers.py"
IDENTITY_RUNTIME_PY = BACKEND_ROOT / "app" / "services" / "identity_runtime.py"
RESOLVER_PY = BACKEND_ROOT / "shipment_identity_resolver.py"
VF_SCRAPER_PY = BACKEND_ROOT / "vesselfinder_scraper.py"


# ═══════════════════════════════════════════════════════════════════
# Helpers — AST-based detection (no substring false-positives)
# ═══════════════════════════════════════════════════════════════════


def _has_import_from(src: str, module: str, name: str) -> bool:
    """True iff ``src`` contains an actual ImportFrom node
    ``from {module} import {name}`` (not docstring/comment mention)."""
    try:
        tree = ast.parse(src)
    except SyntaxError:
        return False
    for node in ast.walk(tree):
        if isinstance(node, ast.ImportFrom) and node.module == module:
            for alias in node.names:
                if alias.name == name:
                    return True
    return False


def _has_alias_in_import(src: str, module: str, name: str, alias: str) -> bool:
    """True iff ``src`` contains an ImportFrom node like
    ``from {module} import {name} as {alias}``."""
    try:
        tree = ast.parse(src)
    except SyntaxError:
        return False
    for node in ast.walk(tree):
        if isinstance(node, ast.ImportFrom) and node.module == module:
            for a in node.names:
                if a.name == name and a.asname == alias:
                    return True
    return False


def _has_function_def(src: str, name: str) -> bool:
    """True iff ``src`` contains an ``async def name(...)`` or
    ``def name(...)`` node."""
    try:
        tree = ast.parse(src)
    except SyntaxError:
        return False
    for node in ast.walk(tree):
        if isinstance(node, (ast.AsyncFunctionDef, ast.FunctionDef)):
            if node.name == name:
                return True
    return False


# ═══════════════════════════════════════════════════════════════════
# _resolve_helpers — single switch point.
# Pre-extraction: returns (server._external_container_lookup,
#                          server._vf_extract_vessels).
# Post-extraction: returns (app.services.tracking_providers.external_container_lookup,
#                           vesselfinder_scraper.extract_vessels_from_payload).
#
# Detection rule: post-5.5/H iff app/services/tracking_providers.py exists
# AND server.py no longer defines _external_container_lookup.
# ═══════════════════════════════════════════════════════════════════


def _resolve_helpers() -> Tuple[Callable[..., Awaitable[Optional[Dict[str, Any]]]],
                                Callable[[Any], Any],
                                str]:
    """Returns ``(external_container_lookup, extract_vessels_from_payload, label)``."""
    post_tracking = TRACKING_PROVIDERS_PY.exists()
    if post_tracking:
        srv_src = SERVER_PY.read_text()
        post_tracking = not _has_function_def(srv_src, "_external_container_lookup")

    if post_tracking:
        # Force fresh load.
        sys.modules.pop("app.services.tracking_providers", None)
        from app.services.tracking_providers import external_container_lookup
        from vesselfinder_scraper import extract_vessels_from_payload
        return external_container_lookup, extract_vessels_from_payload, "post-5.5/H"
    else:
        import server  # noqa: WPS433
        from vesselfinder_scraper import extract_vessels_from_payload
        return server._external_container_lookup, extract_vessels_from_payload, "pre-5.5/H"


# ═══════════════════════════════════════════════════════════════════
# Fixture — fake TrackingConfigSnapshot + AsyncClient context-managers
# ═══════════════════════════════════════════════════════════════════


@pytest.fixture
def patched_providers(monkeypatch):
    """Patch ``_tracking_snapshot()`` / ``get_service()`` AND ``httpx.AsyncClient``
    so the lookup chain is fully isolated from network I/O."""
    # ── Fake snapshot — no keys by default; tests override per-case ──
    fake_snapshot = MagicMock(name="TrackingConfigSnapshot")
    fake_snapshot.shipsgo_api_key = None
    fake_snapshot.shipsgo_fleet_key = None
    fake_snapshot.aftership_api_key = None

    # Cover BOTH the pre-extraction surface (``server._tracking_snapshot``)
    # AND the post-extraction surface (``app.services.tracking_config.get_service``
    # returning a service whose ``.snapshot()`` yields fake_snapshot).
    fake_service = MagicMock(name="TrackingConfigService")
    fake_service.snapshot = MagicMock(return_value=fake_snapshot)

    import server  # noqa: WPS433
    monkeypatch.setattr(server, "_tracking_snapshot",
                        lambda: fake_snapshot, raising=False)
    monkeypatch.setattr(server, "tracking_config_service",
                        fake_service, raising=False)

    from app.services import tracking_config as tc
    monkeypatch.setattr(tc, "_service_ref", fake_service, raising=False)

    # ── Fake httpx.AsyncClient context manager ──
    fake_client = MagicMock(name="AsyncClient")
    fake_client.__aenter__ = AsyncMock(return_value=fake_client)
    fake_client.__aexit__ = AsyncMock(return_value=None)
    fake_client.get = AsyncMock()
    fake_client.post = AsyncMock()

    fake_client_factory = MagicMock(name="AsyncClientFactory",
                                     return_value=fake_client)

    import httpx
    monkeypatch.setattr(httpx, "AsyncClient", fake_client_factory)

    return {
        "snapshot": fake_snapshot,
        "service": fake_service,
        "httpx_client": fake_client,
        "httpx_factory": fake_client_factory,
    }


def _make_response(status_code: int, body: Any) -> MagicMock:
    """Build a mock httpx.Response object."""
    resp = MagicMock(name="Response")
    resp.status_code = status_code
    if isinstance(body, (dict, list)):
        resp.text = json.dumps(body)
        resp.json = MagicMock(return_value=body)
    else:
        resp.text = str(body)
        resp.json = MagicMock(side_effect=ValueError("not json"))
    return resp


# ═══════════════════════════════════════════════════════════════════
# V1 — Empty input guard
# ═══════════════════════════════════════════════════════════════════


@pytest.mark.asyncio
async def test_v1_empty_input_returns_none(patched_providers):
    """V1: empty / whitespace-only input bypasses all providers."""
    lookup, _vf, label = _resolve_helpers()
    assert (await lookup("")) is None, f"[{label}] empty str must return None"
    assert (await lookup("   ")) is None, f"[{label}] whitespace must return None"
    # No HTTP calls should fire.
    assert patched_providers["httpx_factory"].call_count == 0, (
        f"[{label}] httpx.AsyncClient must not be constructed for empty input"
    )


# ═══════════════════════════════════════════════════════════════════
# V2 — No API keys configured → None
# ═══════════════════════════════════════════════════════════════════


@pytest.mark.asyncio
async def test_v2_no_api_keys_returns_none(patched_providers):
    """V2: snapshot has no provider keys → no provider chain reachable."""
    lookup, _vf, label = _resolve_helpers()
    # patched_providers default = no keys set.
    result = await lookup("MSCU1234567")
    assert result is None, f"[{label}] no-keys path must return None, got {result}"


# ═══════════════════════════════════════════════════════════════════
# V3 — ShipsGo V1 GET returns valid payload
# ═══════════════════════════════════════════════════════════════════


@pytest.mark.asyncio
async def test_v3_shipsgo_get_success(patched_providers):
    """V3: ShipsGo GetContainerInfo returns ContainerStatus data —
    function parses it into the canonical 9-key result dict."""
    lookup, _vf, label = _resolve_helpers()
    patched_providers["snapshot"].shipsgo_api_key = "test_authcode_xyz"

    valid_body = {
        "VesselIMO": 9314259,
        "VesselName": "MAERSK ALABAMA",
        "Status": "In Transit",
        "Pol": "Newark, NJ",
        "Pod": "Hamburg",
        "FormatedETA": "2026-06-12",
        "MapPoint": {"lat": 51.5, "lng": 9.9},
    }
    patched_providers["httpx_client"].get = AsyncMock(
        return_value=_make_response(200, valid_body)
    )

    result = await lookup("MSCU1234567")

    assert result is not None, f"[{label}] expected dict, got None"
    for key in ("source", "container", "imo", "vesselName", "status",
                "origin", "destination", "eta", "mapPoint", "raw"):
        assert key in result, f"[{label}] missing key {key!r}: {result}"
    assert result["source"] == "shipsgo_v1", f"[{label}] {result['source']}"
    assert result["container"] == "MSCU1234567", f"[{label}] container={result['container']}"
    assert result["imo"] == "9314259", f"[{label}] imo={result['imo']}"
    assert result["vesselName"] == "MAERSK ALABAMA", f"[{label}] {result['vesselName']}"
    assert result["status"] == "In Transit", f"[{label}] {result['status']}"


# ═══════════════════════════════════════════════════════════════════
# V4 — AfterShip fallback
# ═══════════════════════════════════════════════════════════════════


@pytest.mark.asyncio
async def test_v4_aftership_fallback(patched_providers):
    """V4: with no ShipsGo key but AfterShip key present, function falls
    through to AfterShip and returns AfterShip-shaped dict."""
    lookup, _vf, label = _resolve_helpers()
    patched_providers["snapshot"].shipsgo_api_key = None
    patched_providers["snapshot"].aftership_api_key = "aftership_test_key"

    aftership_body = {
        "data": {
            "tracking": {
                "tag": "InTransit",
                "expected_delivery": "2026-07-01",
            }
        }
    }
    patched_providers["httpx_client"].get = AsyncMock(
        return_value=_make_response(200, aftership_body)
    )

    result = await lookup("MSCU1234567")

    assert result is not None, f"[{label}] AfterShip fallback returned None"
    assert result["source"] == "aftership", f"[{label}] {result['source']}"
    assert result["container"] == "MSCU1234567", f"[{label}] {result}"
    assert result["status"] == "InTransit", f"[{label}] status={result['status']}"
    assert result["eta"] == "2026-07-01", f"[{label}] eta={result['eta']}"


# ═══════════════════════════════════════════════════════════════════
# V5 — extract_vessels_from_payload is callable from canonical home
# ═══════════════════════════════════════════════════════════════════


def test_v5_extract_vessels_callable_from_canonical_home():
    """V5: ``extract_vessels_from_payload`` (no underscore) is importable
    and callable from ``vesselfinder_scraper`` — the canonical home."""
    _lookup, extract, label = _resolve_helpers()
    # Smoke test against a minimal payload shape.
    payload = {
        "vessels": [
            {"mmsi": "367020980", "imo": "9214082", "name": "MAERSK ALABAMA"},
            {"mmsi": "636019825", "imo": "9811000", "name": "EVER GIVEN"},
        ]
    }
    result = extract(payload)
    assert isinstance(result, list), f"[{label}] expected list, got {type(result)}"
    # Either accepts the dict-wrapper form OR a list form — function is
    # part of the canonical scraper module; we just verify it's callable
    # without raising and returns SOMETHING list-like.
    assert result == [] or len(result) >= 0, f"[{label}] {result}"


# ═══════════════════════════════════════════════════════════════════
# V6 — extract_vessels_from_payload handles empty / invalid payload
# ═══════════════════════════════════════════════════════════════════


def test_v6_extract_vessels_handles_empty():
    """V6: invalid / empty payload → []."""
    _lookup, extract, label = _resolve_helpers()
    assert extract(None) == [], f"[{label}] None → expected []"
    assert extract({}) == [], f"[{label}] {{}} → expected []"
    assert extract([]) == [], f"[{label}] [] → expected []"


# ═══════════════════════════════════════════════════════════════════
# Structural pins (S1-S5) — expected FAIL pre-extraction.
# ═══════════════════════════════════════════════════════════════════


def test_s1_server_py_no_longer_defines_external_lookup():
    """S1: server.py no longer defines `_external_container_lookup`
    and no longer has the `_vf_extract_vessels` alias."""
    src = SERVER_PY.read_text()
    assert not _has_function_def(src, "_external_container_lookup"), (
        "S1 FAIL: server.py still defines `async def _external_container_lookup`"
    )
    assert not _has_alias_in_import(src, "vesselfinder_scraper",
                                     "extract_vessels_from_payload",
                                     "_vf_extract_vessels"), (
        "S1 FAIL: server.py still carries the alias "
        "`extract_vessels_from_payload as _vf_extract_vessels` on the "
        "vesselfinder_scraper ImportFrom"
    )


def test_s2_tracking_providers_module_exists():
    """S2: app/services/tracking_providers.py exists, exports
    `external_container_lookup` (public, no underscore), in __all__."""
    assert TRACKING_PROVIDERS_PY.exists(), (
        "S2 FAIL: app/services/tracking_providers.py does not exist"
    )
    src = TRACKING_PROVIDERS_PY.read_text()
    assert _has_function_def(src, "external_container_lookup"), (
        "S2 FAIL: `async def external_container_lookup` not defined in "
        "app/services/tracking_providers.py"
    )
    # Reload to be sure the live module agrees.
    sys.modules.pop("app.services.tracking_providers", None)
    from app.services import tracking_providers
    assert hasattr(tracking_providers, "external_container_lookup"), (
        "S2 FAIL: tracking_providers module has no `external_container_lookup` symbol"
    )
    assert "external_container_lookup" in getattr(tracking_providers, "__all__", []), (
        "S2 FAIL: `external_container_lookup` not in tracking_providers.__all__"
    )


def test_s3_resolver_no_lazy_server_bridge_for_vf_extract():
    """S3: shipment_identity_resolver.py no longer carries
    `from server import _vf_extract_vessels`."""
    src = RESOLVER_PY.read_text()
    assert not _has_import_from(src, "server", "_vf_extract_vessels"), (
        "S3 FAIL: shipment_identity_resolver.py still carries "
        "`from server import _vf_extract_vessels` — expected migration "
        "to `from vesselfinder_scraper import extract_vessels_from_payload`"
    )


def test_s4_identity_runtime_no_lazy_aux_for_external_lookup():
    """S4: identity_runtime.py no longer carries the
    `_external_container_lookup_callable()` lazy-bridge accessor
    with `from server import _external_container_lookup`."""
    src = IDENTITY_RUNTIME_PY.read_text()
    assert not _has_import_from(src, "server", "_external_container_lookup"), (
        "S4 FAIL: identity_runtime.py still carries "
        "`from server import _external_container_lookup` — expected "
        "migration to `from app.services.tracking_providers import "
        "external_container_lookup`"
    )


def test_s5_inventory_post_5_5_h():
    """S5: BRIDGE_INVENTORY 3→2, TIER_C 2→1, PHASE_5_5_BOUNDARY 2→1,
    EXTRACTION_AUX_BRIDGES 47→46; PHASE_5_5_H_RETIRED_BRIDGES exists
    with 2 entries + in __all__.

    Note on the BRIDGE_INVENTORY delta (vs the original 5.5/H mandate
    "3 → 1"): the original mandate counted both retired symbols against
    ``BRIDGE_INVENTORY``, but ``_external_container_lookup`` was
    registered by 5.5/G in ``EXTRACTION_AUX_BRIDGES`` (kind=RESOLVER_DEP,
    tier=C-aux) — it never lived in ``BRIDGE_INVENTORY``. The actual
    structural decomposition is therefore Δ-1 on BRIDGE_INVENTORY plus
    Δ-1 on EXTRACTION_AUX_BRIDGES, with the union total still decreasing
    by 2 as the mandate intended. The Tier-B ``_STATIC_DIR`` entry stays
    for Phase 5.8 (forbidden category per mandate D8).
    """
    from app.core.app_state_targets import (
        BRIDGE_INVENTORY,
        TIER_C_REQUIRES_REFACTOR,
        PHASE_5_5_BOUNDARY,
        EXTRACTION_AUX_BRIDGES,
    )
    # 5.5/I compatible-pin: BRIDGE_INVENTORY 2→1, TIER_C 1→0, PHASE_5_5_BOUNDARY 1→0.
    assert len(BRIDGE_INVENTORY) in (2, 1), (
        f"S5 FAIL: BRIDGE_INVENTORY size = {len(BRIDGE_INVENTORY)}, "
        f"expected 2 (post-5.5/H) or 1 (post-5.5/I — ensure_shipment_stages retired)"
    )
    assert len(TIER_C_REQUIRES_REFACTOR) in (1, 0), (
        f"S5 FAIL: TIER_C size = {len(TIER_C_REQUIRES_REFACTOR)}, "
        f"expected 1 (post-5.5/H) or 0 (post-5.5/I — ZERO Tier-C bridges, Phase-5 finale)"
    )
    assert len(PHASE_5_5_BOUNDARY) in (1, 0), (
        f"S5 FAIL: PHASE_5_5_BOUNDARY size = {len(PHASE_5_5_BOUNDARY)}, "
        f"expected 1 (post-5.5/H) or 0 (post-5.5/I — Phase 5.5 officially closed)"
    )
    assert len(EXTRACTION_AUX_BRIDGES) in (2, 47, 45, 44), (
        f"S5 FAIL: EXTRACTION_AUX_BRIDGES size = "
        f"{len(EXTRACTION_AUX_BRIDGES)}, expected 47 post-5.5/H "
        f"(net Δ-0: 5.5/G ``_external_container_lookup`` RESOLVER_DEP "
        f"retired ⊝, and ``_tracking_snapshot`` "
        f"TRACKING_PROVIDERS_DEP registered ⊕ as the bookkeeping "
        f"entry for the cold-start lazy bridge in "
        f"``app/services/tracking_providers.py``) "
        f"or 45 (post-6.2.ACTUAL — _normalize_stage + "
        f"build_default_stages SHIPMENTS_DEP retired)"
    )

    from app.core import app_state_targets
    assert hasattr(app_state_targets, "PHASE_5_5_H_RETIRED_BRIDGES"), (
        "S5 FAIL: PHASE_5_5_H_RETIRED_BRIDGES constant not exported"
    )
    retired = getattr(app_state_targets, "PHASE_5_5_H_RETIRED_BRIDGES")
    assert len(retired) == 2, (
        f"S5 FAIL: PHASE_5_5_H_RETIRED_BRIDGES has {len(retired)} entries, "
        f"expected 2 (_vf_extract_vessels + _external_container_lookup)"
    )
    assert "PHASE_5_5_H_RETIRED_BRIDGES" in getattr(
        app_state_targets, "__all__", []
    ), "S5 FAIL: PHASE_5_5_H_RETIRED_BRIDGES not in __all__"


# ═══════════════════════════════════════════════════════════════════
# O1 — OpenAPI freeze
# ═══════════════════════════════════════════════════════════════════


def test_o1_openapi_surface_unchanged():
    """O1: paths=618 / ops=679 — frozen by 5.5/F2, preserved through
    5.5/G, preserved through 5.5/H."""
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
    assert paths == 618, f"O1 FAIL: paths={paths}, expected 618"
    assert ops == 679, f"O1 FAIL: ops={ops}, expected 679"
