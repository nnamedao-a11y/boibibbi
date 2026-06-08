"""
Phase 6.5+ Wave 1 — calculator-pure helper retirement — golden suite
=====================================================================

Written BEFORE the extraction per the user-locked golden-first
discipline. Wave 1 scope was reduced from 4 helpers (PREP-projected)
to 1 helper (truth-restored at body-inspection time):

  * ``_find_route_amount(routes, rate_type, vehicle_type, *,
    destination_code, origin_code, default)`` — TRULY PURE.
    Zero module-globals. Only reads from positional args + dict.

Why the other 3 helpers got DEFERRED (audit-trail correction)
─────────────────────────────────────────────────────────────

  * ``_tiered_buyer_fee`` + ``_tiered_buyer_fee_from_db`` —
    use ``AUCTION_TIERED_FEES`` (server.py:9308, NOT in the
    43-symbol CALC_ENGINE_DEP whitelist). Moving them mechanically
    requires either bringing AUCTION_TIERED_FEES along (scope creep;
    has 5 server.py refs at 9531/9704/9707/9725/9728) OR creating
    a new ``from server import AUCTION_TIERED_FEES`` bridge (violates
    6.3.B "shrinking only"). Deferred to Wave 1.5 or folded into
    Wave 2 (constants wave) where AUCTION_TIERED_FEES gets handled
    alongside the other 38.

  * ``_load_calc_config`` — deeply SERVER_STATE-coupled:
    uses ``_CALC_CACHE`` (module-global cache dict),
    ``_CALC_CACHE_TTL`` (module constant), ``_ensure_calculator_seed``
    (lives in server.py per Wave 3 plan), ``db`` (server module-
    global), ``logger`` (server module-global),
    ``DEFAULT_PROFILE_CODE`` (whitelisted CALC_ENGINE_DEP constant).
    Belongs in Wave 3 alongside ``_ensure_calculator_seed`` — they
    are tightly coupled (the cache wraps the seed function).

PREP classification refinement (logged in closeout doc §audit-trail)
──────────────────────────────────────────────────────────────────────

This is an honest audit-trail correction, mirror of the 6.5+ PREP
"41 → 43" cluster-size correction. The PREP doc bucket counts
(PURE_FUNCTION = 4) are amended to (PURE_FUNCTION = 1,
PURE_WITH_INTERNAL_CONST = 2, SERVER_STATE_COUPLED = 1). The 5-bucket
partition still holds; only the bucket-membership of 3 symbols
shifted.

Test taxonomy (mirror of 6.2.ACTUAL golden suite shape)
────────────────────────────────────────────────────────

  B1-B3   Behavioural goldens for ``_find_route_amount`` (pure-function
          invariants: matching, defaulting, type coercion).

  S1-S3   Structural pins: canonical home is
          ``app/services/calculator_pure.py``; server.py is a thin
          shim; ``app/services/calculator.py`` reaches the canonical
          home (split import block).

  I1-I3   Inventory deltas:
          I1 EXTRACTION_AUX_BRIDGES <= 44 (was <= 45)
          I2 PHASE_6_5_WAVE_1_RETIRED_BRIDGES constant exists
          I3 _find_route_amount absent from 6.3.B whitelist for
             ``app/services/calculator.py`` (retired)

  O1      OpenAPI surface freeze 618/679.

  L1      Live composite assertion still passes (6.3.A bridge).
"""
from __future__ import annotations

import ast
import importlib
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional, Tuple

import pytest


BACKEND = Path(__file__).resolve().parent.parent


# ─────────────────────────────────────────────────────────────────────
# AST-based pre/post switch point
# ─────────────────────────────────────────────────────────────────────

def _server_has_def(symbol: str) -> bool:
    """Return True if server.py has a top-level non-shim def for ``symbol``."""
    server_path = BACKEND / "server.py"
    tree = ast.parse(server_path.read_text(encoding="utf-8"))
    for node in tree.body:
        if isinstance(node, ast.FunctionDef) and node.name == symbol:
            return not _is_thin_shim(node)
    return False


def _is_thin_shim(fn_node: ast.FunctionDef) -> bool:
    """Heuristic: function is a thin shim iff body is at most 3 statements
    and contains at least one ImportFrom plus a Return of a call."""
    body = fn_node.body
    if not body:
        return False
    has_import = any(isinstance(s, ast.ImportFrom) for s in body)
    has_return_call = any(
        isinstance(s, ast.Return)
        and s.value is not None
        and isinstance(s.value, ast.Call)
        for s in body
    )
    return len(body) <= 4 and has_import and has_return_call


def _resolve_helper() -> Callable[..., float]:
    """Resolve ``_find_route_amount`` from its current canonical home.

    Pre-extraction: server.py owns the def-site (returns it).
    Post-extraction: app.services.calculator_pure owns the def-site.
    Both routes always pre-load server first to mirror production
    boot order (per 6.3.B test_3/test_4 convention).
    """
    import server  # noqa: WPS433, F401 — production boot order
    if _server_has_def("_find_route_amount"):
        return server._find_route_amount  # pre-extraction path
    mod = importlib.import_module("app.services.calculator_pure")
    return mod._find_route_amount


# ─────────────────────────────────────────────────────────────────────
# B-block: Behavioural goldens (pre and post — must hold unchanged)
# ─────────────────────────────────────────────────────────────────────

def test_b1_find_route_amount_matches_first_rate_type_hit() -> None:
    """B1: returns the ``amount`` of the first row whose ``rateType``
    matches; ignores rows with non-matching rateType."""
    fn = _resolve_helper()
    routes = [
        {"rateType": "ocean", "vehicleType": "sedan", "amount": 1500.0},
        {"rateType": "inland", "vehicleType": "sedan", "amount": 800.0},
    ]
    assert fn(routes, "ocean", "sedan") == 1500.0
    assert fn(routes, "inland", "sedan") == 800.0


def test_b2_find_route_amount_vehicle_type_wildcard() -> None:
    """B2: a row with ``vehicleType=None`` matches ANY vehicle_type;
    a row with explicit vehicleType matches only that vehicle_type."""
    fn = _resolve_helper()
    routes = [
        {"rateType": "ocean", "vehicleType": None, "amount": 1200.0},
        {"rateType": "ocean", "vehicleType": "suv", "amount": 1800.0},
    ]
    # First row (None) matches "sedan" → 1200.0
    assert fn(routes, "ocean", "sedan") == 1200.0
    # First row also matches "suv" → 1200.0 (first-hit wins, not best-match)
    assert fn(routes, "ocean", "suv") == 1200.0


def test_b3_find_route_amount_default_fallback_and_type_coercion() -> None:
    """B3: no row matches → returns ``default`` (coerced to float);
    matched ``amount`` is also coerced to float."""
    fn = _resolve_helper()
    assert fn([], "ocean", "sedan", default=999.5) == 999.5
    assert fn([], "ocean", "sedan") == 0.0  # default=0.0
    # Integer amount → float coercion
    routes = [{"rateType": "ocean", "vehicleType": "sedan", "amount": 1500}]
    val = fn(routes, "ocean", "sedan")
    assert val == 1500.0
    assert isinstance(val, float)


# ─────────────────────────────────────────────────────────────────────
# S-block: Structural pins (FAIL pre-extraction, PASS post-extraction)
# ─────────────────────────────────────────────────────────────────────

def test_s1_canonical_home_is_app_services_calculator_pure() -> None:
    """S1: ``app/services/calculator_pure`` module exposes
    ``_find_route_amount``. FAILS pre-extraction (module doesn't
    exist); PASSES post-extraction.
    """
    mod = importlib.import_module("app.services.calculator_pure")
    assert hasattr(mod, "_find_route_amount"), (
        "app.services.calculator_pure missing canonical _find_route_amount"
    )


def test_s2_server_py_no_longer_owns_def_site() -> None:
    """S2: server.py no longer has a top-level non-shim
    ``def _find_route_amount``. Thin compat shim OK.
    """
    assert not _server_has_def("_find_route_amount"), (
        "server.py still owns the def-site of _find_route_amount; "
        "expected post-extraction state is thin compat shim."
    )


def test_s3_app_services_calculator_reaches_calculator_pure_for_find_route() -> None:
    """S3: ``app/services/calculator.py`` no longer imports
    ``_find_route_amount`` from server. It imports from
    ``app.services.calculator_pure`` instead.

    PRE-EXTRACTION: FAILS (still imported from server).
    POST-EXTRACTION: PASSES (split import block).
    """
    calc_path = BACKEND / "app" / "services" / "calculator.py"
    tree = ast.parse(calc_path.read_text(encoding="utf-8"))

    from_server_syms: set = set()
    from_calc_pure_syms: set = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.ImportFrom):
            if node.module == "server":
                from_server_syms.update(a.name for a in node.names)
            elif node.module == "app.services.calculator_pure":
                from_calc_pure_syms.update(a.name for a in node.names)

    # Should NOT be in the server-import block anymore
    assert "_find_route_amount" not in from_server_syms, (
        "app/services/calculator.py still imports _find_route_amount "
        "from server — Wave 1 must move it to canonical home"
    )
    # SHOULD be in the calculator_pure-import block
    assert "_find_route_amount" in from_calc_pure_syms, (
        "app/services/calculator.py does not import _find_route_amount "
        "from app.services.calculator_pure — split import block missing"
    )


# ─────────────────────────────────────────────────────────────────────
# I-block: Inventory delta assertions
# ─────────────────────────────────────────────────────────────────────

def test_i1_extraction_aux_bridges_shrinks_to_44_or_less() -> None:
    """I1: ``EXTRACTION_AUX_BRIDGES`` <= 44 post-Wave-1 (was <= 45).
    PRE: count = 45. POST: count = 44 (or less if other waves landed).
    """
    from app.core.app_state_targets import EXTRACTION_AUX_BRIDGES
    assert len(EXTRACTION_AUX_BRIDGES) <= 44, (
        f"EXTRACTION_AUX_BRIDGES has {len(EXTRACTION_AUX_BRIDGES)} "
        f"entries; expected <= 44 post-6.5+/Wave-1"
    )


def test_i2_phase_6_5_wave_1_retired_bridges_constant_exists() -> None:
    """I2: ``PHASE_6_5_WAVE_1_RETIRED_BRIDGES`` constant exists with
    1 entry (``_find_route_amount``). Mirror of
    ``PHASE_6_2_RETIRED_BRIDGES`` shape.
    """
    from app.core import app_state_targets
    assert hasattr(app_state_targets, "PHASE_6_5_WAVE_1_RETIRED_BRIDGES"), (
        "PHASE_6_5_WAVE_1_RETIRED_BRIDGES constant missing — "
        "must be introduced in Wave 1 alongside the move"
    )
    retired = app_state_targets.PHASE_6_5_WAVE_1_RETIRED_BRIDGES
    assert isinstance(retired, tuple)
    assert len(retired) == 1
    symbols = {row[0] for row in retired}
    assert symbols == {"_find_route_amount"}
    assert "PHASE_6_5_WAVE_1_RETIRED_BRIDGES" in app_state_targets.__all__


def test_i3_find_route_amount_absent_from_6_3_b_calculator_whitelist() -> None:
    """I3: the 6.3.B AST whitelist for ``app/services/calculator.py``
    no longer lists ``_find_route_amount`` (retired). Bidirectional
    ratchet from 6.3.B still passes.

    Phase 6.5+ Wave 2 update (2026-05-20): the entire
    ``app/services/calculator.py`` row is now retired from the 6.3.B
    whitelist (Wave 2 dropped ``from server import …`` count to 0,
    so the row was removed entirely — silent-retirement check passes
    because no production AST site exists either). This test still
    holds: ``_find_route_amount`` is not in ANY whitelist entry.
    """
    from tests.test_phase6_3_b_ast_topology import _WHITELISTED_FROM_SERVER
    for filerel, symbols, _audit in _WHITELISTED_FROM_SERVER:
        assert "_find_route_amount" not in symbols, (
            f"6.3.B whitelist still lists _find_route_amount under "
            f"{filerel} — retire it from the frozenset alongside the move."
        )


# ─────────────────────────────────────────────────────────────────────
# O-block: OpenAPI surface freeze
# ─────────────────────────────────────────────────────────────────────

def test_o1_openapi_618_paths_679_ops_frozen() -> None:
    """OpenAPI surface unchanged across Wave 1."""
    import server  # noqa: WPS433
    spec = server.fastapi_app.openapi()
    paths = spec.get("paths", {})
    n_paths = len(paths)
    n_ops = sum(
        sum(
            1
            for method in p_obj.keys()
            if method.lower()
            in {"get", "post", "put", "patch", "delete", "head", "options", "trace"}
        )
        for p_obj in paths.values()
    )
    assert n_paths == 618, f"OpenAPI paths drifted: {n_paths} != 618"
    assert n_ops == 679, f"OpenAPI ops drifted: {n_ops} != 679"


# ─────────────────────────────────────────────────────────────────────
# L-block: Live runtime composite probe
# ─────────────────────────────────────────────────────────────────────

def test_l1_architecture_invariants_composite_still_holds() -> None:
    """L1: the 6.3.A runtime composite passes against the live app
    after Wave 1 (cumulative ratchet 6.3.A → 6.2.ACTUAL → 6.3.B →
    Wave 1 still mechanically holds)."""
    from app.core.architecture_invariants import (
        run_all_phase_5_endpoint_assertions,
    )
    import server  # noqa: WPS433
    run_all_phase_5_endpoint_assertions(fastapi_app=server.fastapi_app)
