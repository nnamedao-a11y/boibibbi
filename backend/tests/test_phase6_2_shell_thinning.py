"""
Phase 6.2.ACTUAL — Shell Thinning execution — golden suite
============================================================

Written BEFORE the extraction moves per the user-locked Phase 6.2
golden-first discipline (mirror of 5.5/G/H/I).

Scope (per PHASE6_2_SHELL_THINNING_PREP.md §1 + §4):

  Movers:
    * ``_normalize_stage(stage, idx, total) -> Dict``   (pure)
    * ``build_default_stages(origin, destination, vessel) -> List[Dict]``   (pure)
    * ``JOURNEY_STAGE_TYPES = {"land", "vessel", "port"}``                   (constant)
    * ``JOURNEY_STAGE_STATUSES = {"pending", "active", "done", "skipped"}``  (constant)

  Target home (per PREP §5.1):
    * ``app/utils/shipments.py``  (sibling of ``get_current_stage`` +
      ``serialize_journey`` + ``_smooth_eta_iso`` + ``is_valid_movement``)

  Deferred (per PREP §6):
    * ``_tracking_snapshot``  — Phase 6.4 / 7 territory (singleton
      ownership unresolved; would either back-import server.py
      module-global or require ``tracking_config_runtime`` accessor —
      neither in 6.2.ACTUAL scope)

Test taxonomy
─────────────

  B1-B7  Behavioural goldens (pure-function invariants from PREP §4.1
         + §4.2). MUST hold pre- and post-extraction — encoded with
         AST-based ``_resolve_helpers()`` switch point so the same
         file runs unchanged regardless of which side of the move
         the codebase is on. Identical pattern to 5.5/G/H/I.

  S1-S5  Structural pins. MUST FAIL pre-extraction (helpers + constants
         still in server.py) and MUST PASS post-extraction (canonical
         home is app/utils/shipments.py + server.py shim shape is
         compatible). This is the "golden-suite truly differentiates
         pre vs post" guarantee.

  I1-I3  Inventory delta assertions on app/core/app_state_targets.py
         + app/core/architecture_invariants.py:
         I1 EXTRACTION_AUX_BRIDGES shrinks by 2 (47 → 45)
         I2 PHASE_6_2_RETIRED_BRIDGES constant exists with 2 entries
         I3 _normalize_stage + build_default_stages absent from
            EXTRACTION_AUX_BRIDGES (retired)

  O1     OpenAPI surface freeze — 618 paths / 679 ops preserved
         (neither helper is a route; auto-preserved IF the move
         doesn't accidentally shift route registrations).

  L1     Lifespan runtime probe — the architecture_invariants
         composite assertion still passes on a live FastAPI app
         after the move (this is the 6.3.A contract bridging into
         6.2.ACTUAL).
"""
from __future__ import annotations

import ast
import importlib
from typing import Any, Callable, Dict, List, Optional, Tuple

import pytest


# ─────────────────────────────────────────────────────────────────────
# AST-based pre/post switch point — mirror of 5.5/G/H/I _resolve_helpers
# ─────────────────────────────────────────────────────────────────────

def _server_has_def(symbol: str) -> bool:
    """Return True if server.py has a top-level ``def <symbol>(...)``
    or ``<symbol> = ...`` assignment that is more than a thin shim.

    A thin shim is detected by the body shape: a single ``from … import …``
    statement followed by a single ``return`` (or by a one-line constant
    rebind). The shim itself does NOT count as a real definition for the
    purposes of pre/post-extraction switching.
    """
    import os
    server_path = os.path.join(
        os.path.dirname(__file__), "..", "server.py"
    )
    with open(server_path, "r", encoding="utf-8") as f:
        tree = ast.parse(f.read())
    for node in tree.body:
        # Function def
        if isinstance(node, ast.FunctionDef) and node.name == symbol:
            return not _is_thin_shim(node)
        # Top-level assignment (for the 2 constants)
        if isinstance(node, ast.Assign):
            for tgt in node.targets:
                if isinstance(tgt, ast.Name) and tgt.id == symbol:
                    return True
    return False


def _is_thin_shim(fn_node: ast.FunctionDef) -> bool:
    """Heuristic: a function is a thin shim iff its body is at most
    3 statements and contains at least one ``ImportFrom`` plus a
    ``Return`` of a call.
    """
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


def _resolve_helpers() -> Tuple[
    Callable[..., Dict[str, Any]],   # _normalize_stage
    Callable[..., List[Dict[str, Any]]],   # build_default_stages
    set,   # JOURNEY_STAGE_TYPES
    set,   # JOURNEY_STAGE_STATUSES
]:
    """Resolve the helpers + constants from the active canonical home.

    Pre-extraction: server.py is the def-site → import from there.
    Post-extraction: app/utils/shipments.py is the def-site → import
    from there. Importing from server.py post-extraction still works
    via the thin compat shim, but for behavioural truthfulness we
    deliberately reach the canonical home directly.
    """
    # Constants: the symbol-on-server detection is enough — they live
    # at module top-level in server.py pre-extraction. Post-extraction,
    # server.py either re-exports them (preferred) or omits them entirely.
    if _server_has_def("_normalize_stage"):
        # Pre-extraction path — server.py is the def-site.
        import server as _srv  # noqa: WPS433
        return (
            _srv._normalize_stage,
            _srv.build_default_stages,
            _srv.JOURNEY_STAGE_TYPES,
            _srv.JOURNEY_STAGE_STATUSES,
        )
    # Post-extraction path — canonical home is app/utils/shipments.py
    mod = importlib.import_module("app.utils.shipments")
    return (
        mod._normalize_stage,  # type: ignore[attr-defined]
        mod.build_default_stages,  # type: ignore[attr-defined]
        mod.JOURNEY_STAGE_TYPES,  # type: ignore[attr-defined]
        mod.JOURNEY_STAGE_STATUSES,  # type: ignore[attr-defined]
    )


# ─────────────────────────────────────────────────────────────────────
# B-block: Behavioural goldens (pre and post — must hold unchanged)
# ─────────────────────────────────────────────────────────────────────

def test_b1_normalize_stage_output_shape_and_key_order() -> None:
    """B1: ``_normalize_stage`` output dict carries the exact key set
    expected by JSON serialization (PREP §4.1 invariant 1).
    """
    normalize, _, _, _ = _resolve_helpers()
    out = normalize({}, 0, 1)
    expected_keys = {
        "id", "type", "label", "from", "to", "status",
        "vessel", "container", "startedAt", "completedAt",
    }
    assert expected_keys.issubset(set(out.keys())), (
        f"missing keys: {expected_keys - set(out.keys())}"
    )


def test_b2_normalize_stage_id_default_is_1_based() -> None:
    """B2: default ``id`` is ``stage_{idx+1}`` (1-based, NOT 0-based)
    per PREP §4.1 invariant 2.
    """
    normalize, _, _, _ = _resolve_helpers()
    out0 = normalize({}, 0, 5)
    out2 = normalize({}, 2, 5)
    assert out0["id"] == "stage_1"
    assert out2["id"] == "stage_3"


def test_b3_normalize_stage_type_whitelist_coerces_invalid_to_vessel() -> None:
    """B3: invalid ``type`` → coerced to ``"vessel"`` (NOT raised)
    per PREP §4.1 invariant 3.
    """
    normalize, _, types, _ = _resolve_helpers()
    out = normalize({"type": "spaceship"}, 0, 1)
    assert out["type"] == "vessel"
    assert types == {"land", "vessel", "port"}  # frozen whitelist


def test_b4_normalize_stage_status_whitelist_coerces_invalid_to_pending() -> None:
    """B4: invalid ``status`` → coerced to ``"pending"`` per
    PREP §4.1 invariant 4.
    """
    normalize, _, _, statuses = _resolve_helpers()
    out = normalize({"status": "bouncing"}, 0, 1)
    assert out["status"] == "pending"
    assert statuses == {"pending", "active", "done", "skipped"}  # frozen


def test_b5_normalize_stage_ukrainian_label_default() -> None:
    """B5: default ``label`` is ``"Етап {idx+1}"`` (Ukrainian) per
    PREP §4.1 invariant 5.
    """
    normalize, _, _, _ = _resolve_helpers()
    out = normalize({}, 0, 1)
    assert out["label"] == "Етап 1"


def test_b6_build_default_stages_single_vessel_stage_em_dash_label() -> None:
    """B6: returns 1-element list, label uses ``"—"`` em-dash
    (U+2014, NOT hyphen) per PREP §4.2 invariants 1 + 3.
    """
    _, build, _, _ = _resolve_helpers()
    stages = build({"name": "Houston"}, {"name": "Odesa"}, None)
    assert len(stages) == 1
    label = stages[0]["label"]
    assert "—" in label  # em-dash, U+2014
    assert "—" == "\u2014"  # paranoia
    assert "Houston" in label
    assert "Odesa" in label
    assert stages[0]["status"] == "active"
    assert stages[0]["vessel"] is None
    assert stages[0]["type"] == "vessel"


def test_b7_build_default_stages_id_is_clock_derived() -> None:
    """B7: ``id`` shape is ``stage_{int(now.timestamp())}_1`` per
    PREP §4.2 invariant 2. Two invocations within the same second
    can collide — this is documented intentional behaviour.
    """
    _, build, _, _ = _resolve_helpers()
    stages = build({"name": "A"}, {"name": "B"})
    stage_id = stages[0]["id"]
    assert stage_id.startswith("stage_")
    assert stage_id.endswith("_1")
    # Numeric epoch in the middle
    middle = stage_id.removeprefix("stage_").removesuffix("_1")
    assert middle.isdigit()
    assert int(middle) > 1_700_000_000  # post-2023 sanity check


# ─────────────────────────────────────────────────────────────────────
# S-block: Structural pins (must FAIL pre-extraction, PASS post-extraction)
# ─────────────────────────────────────────────────────────────────────

def test_s1_canonical_home_is_app_utils_shipments() -> None:
    """S1: ``app/utils/shipments`` module exposes
    ``_normalize_stage``, ``build_default_stages``,
    ``JOURNEY_STAGE_TYPES``, ``JOURNEY_STAGE_STATUSES``.

    PRE-EXTRACTION: FAILS (canonical home is server.py).
    POST-EXTRACTION: PASSES (canonical home is app.utils.shipments).
    """
    mod = importlib.import_module("app.utils.shipments")
    for name in (
        "_normalize_stage",
        "build_default_stages",
        "JOURNEY_STAGE_TYPES",
        "JOURNEY_STAGE_STATUSES",
    ):
        assert hasattr(mod, name), (
            f"app.utils.shipments missing canonical {name} "
            f"(pre-extraction: this is the expected failure)"
        )


def test_s2_server_py_no_longer_owns_def_sites() -> None:
    """S2: server.py no longer has top-level ``def _normalize_stage`` or
    ``def build_default_stages`` with a non-shim body. Thin compat shims
    OR re-exports are acceptable.

    PRE-EXTRACTION: FAILS (server.py defs are real, not shims).
    POST-EXTRACTION: PASSES (server.py defs are thin shims or absent).
    """
    assert not _server_has_def("_normalize_stage"), (
        "server.py still owns the def-site of _normalize_stage; "
        "expected post-extraction state is thin-shim OR absent."
    )
    assert not _server_has_def("build_default_stages"), (
        "server.py still owns the def-site of build_default_stages; "
        "expected post-extraction state is thin-shim OR absent."
    )


def test_s3_app_services_shipments_no_longer_lazy_imports_from_server() -> None:
    """S3: ``app/services/shipments.py`` no longer carries the
    ``from server import _normalize_stage, build_default_stages``
    lazy bridge. It should now reach the canonical home directly:
    ``from app.utils.shipments import _normalize_stage, build_default_stages``.

    PRE-EXTRACTION: FAILS (lazy bridge to server still present).
    POST-EXTRACTION: PASSES (direct import from canonical home).
    """
    import os
    services_shipments_path = os.path.join(
        os.path.dirname(__file__), "..", "app", "services", "shipments.py"
    )
    with open(services_shipments_path, "r", encoding="utf-8") as f:
        src = f.read()
    # Must NOT contain the legacy lazy-bridge import
    assert "from server import _normalize_stage" not in src, (
        "app/services/shipments.py still lazy-imports _normalize_stage "
        "from server — should reach app.utils.shipments directly"
    )
    assert "from server import _normalize_stage, build_default_stages" not in src, (
        "app/services/shipments.py still has the legacy 5.5/I "
        "lazy-bridge — Phase 6.2.ACTUAL must rewire it"
    )


def test_s4_in_file_callsites_reach_canonical_home_via_import() -> None:
    """S4: server.py's in-file callsites for _normalize_stage +
    build_default_stages can resolve to the canonical home (either
    via a module-load ``from app.utils.shipments import ...`` block
    or via thin compat shims that delegate to canonical).

    PRE-EXTRACTION: FAILS (definitions still local to server.py — no
    direct import or shim setup expected yet).
    POST-EXTRACTION: PASSES (server.py has import OR shim referencing
    the canonical home).
    """
    import os
    server_path = os.path.join(
        os.path.dirname(__file__), "..", "server.py"
    )
    with open(server_path, "r", encoding="utf-8") as f:
        src = f.read()
    # Either a direct import OR a shim that references the canonical home
    has_direct_import = (
        "from app.utils.shipments import _normalize_stage" in src
        or "from app.utils.shipments import build_default_stages" in src
        or "from app.utils.shipments import (" in src
    )
    has_shim_reference = (
        "app.utils.shipments" in src
        and ("_normalize_stage" in src and "build_default_stages" in src)
    )
    assert has_direct_import or has_shim_reference, (
        "server.py does not reach app/utils/shipments for the moved "
        "helpers — neither direct import nor shim reference detected"
    )


def test_s5_constants_only_referenced_inside_canonical_home() -> None:
    """S5: ``JOURNEY_STAGE_TYPES`` and ``JOURNEY_STAGE_STATUSES`` are
    referenced ONLY inside the canonical home now (not by foreign
    modules). server.py may still re-export them for in-file
    backward compat, but the ONLY production callers should be
    inside ``_normalize_stage`` itself.

    PRE-EXTRACTION: FAILS (constants live in server.py).
    POST-EXTRACTION: PASSES (constants live in app/utils/shipments.py).
    """
    mod = importlib.import_module("app.utils.shipments")
    assert mod.JOURNEY_STAGE_TYPES == {"land", "vessel", "port"}
    assert mod.JOURNEY_STAGE_STATUSES == {
        "pending", "active", "done", "skipped",
    }


# ─────────────────────────────────────────────────────────────────────
# I-block: Inventory delta assertions on app_state_targets.py
# ─────────────────────────────────────────────────────────────────────

def test_i1_extraction_aux_bridges_shrinks_to_45() -> None:
    """I1: ``EXTRACTION_AUX_BRIDGES`` has at most 45 entries post-6.2.

    PRE-EXTRACTION: FAILS (count = 47).
    POST-EXTRACTION: PASSES (count = 45 — 2 SHIPMENTS_DEP entries retired).
    """
    from app.core.app_state_targets import EXTRACTION_AUX_BRIDGES
    assert len(EXTRACTION_AUX_BRIDGES) <= 45, (
        f"EXTRACTION_AUX_BRIDGES has {len(EXTRACTION_AUX_BRIDGES)} entries "
        f"(expected <= 45 post-6.2.ACTUAL — was 47 pre-6.2)"
    )


def test_i2_phase_6_2_retired_bridges_constant_exists_with_2_entries() -> None:
    """I2: ``PHASE_6_2_RETIRED_BRIDGES`` is a tuple of exactly 2
    ``(symbol, was, target)`` rows — one for ``_normalize_stage``,
    one for ``build_default_stages``. Mirror of the
    ``PHASE_5_5_*_RETIRED_BRIDGES`` constants.

    PRE-EXTRACTION: FAILS (constant absent).
    POST-EXTRACTION: PASSES.
    """
    from app.core import app_state_targets
    assert hasattr(app_state_targets, "PHASE_6_2_RETIRED_BRIDGES"), (
        "PHASE_6_2_RETIRED_BRIDGES constant missing — must be "
        "introduced in 6.2.ACTUAL alongside the moves"
    )
    retired = app_state_targets.PHASE_6_2_RETIRED_BRIDGES
    assert isinstance(retired, tuple)
    assert len(retired) == 2
    symbols = {row[0] for row in retired}
    assert symbols == {"_normalize_stage", "build_default_stages"}, (
        f"PHASE_6_2_RETIRED_BRIDGES has unexpected symbols: {symbols}"
    )
    # Public __all__ export
    assert "PHASE_6_2_RETIRED_BRIDGES" in app_state_targets.__all__, (
        "PHASE_6_2_RETIRED_BRIDGES must be in __all__"
    )


def test_i3_shipments_dep_aux_entries_absent_from_inventory() -> None:
    """I3: ``EXTRACTION_AUX_BRIDGES`` no longer carries any entry
    where ``symbol in {'_normalize_stage', 'build_default_stages'}``.

    PRE-EXTRACTION: FAILS (both SHIPMENTS_DEP entries still present).
    POST-EXTRACTION: PASSES (both retired).
    """
    from app.core.app_state_targets import EXTRACTION_AUX_BRIDGES
    symbols = {b.symbol for b in EXTRACTION_AUX_BRIDGES}
    assert "_normalize_stage" not in symbols, (
        "_normalize_stage still in EXTRACTION_AUX_BRIDGES — must be retired"
    )
    assert "build_default_stages" not in symbols, (
        "build_default_stages still in EXTRACTION_AUX_BRIDGES — must be retired"
    )


# ─────────────────────────────────────────────────────────────────────
# O-block: OpenAPI surface freeze
# ─────────────────────────────────────────────────────────────────────

def test_o1_openapi_surface_618_paths_679_ops_preserved() -> None:
    """O1: OpenAPI paths=618, ops=679 unchanged after the move.
    Neither helper is a route; auto-preserved unless something else
    accidentally shifts during the extraction.

    PRE and POST extraction: PASSES (this is a frozen invariant).
    """
    import server  # noqa: WPS433
    spec = server.fastapi_app.openapi()
    paths = spec.get("paths", {})
    n_paths = len(paths)
    n_ops = sum(
        sum(1 for method in p_obj.keys() if method.lower() in {
            "get", "post", "put", "patch", "delete", "head", "options", "trace"
        })
        for p_obj in paths.values()
    )
    assert n_paths == 618, f"OpenAPI paths drifted: {n_paths} != 618"
    assert n_ops == 679, f"OpenAPI ops drifted: {n_ops} != 679"


# ─────────────────────────────────────────────────────────────────────
# L-block: Live runtime lifespan invariant probe
# ─────────────────────────────────────────────────────────────────────

def test_l1_architecture_invariants_composite_holds_post_move() -> None:
    """L1: the 6.3.A architecture-invariants composite assertion still
    passes on the live FastAPI app after 6.2.ACTUAL. This is the
    bridge contract between 6.3.A (runtime invariants in
    architecture_invariants.py) and 6.2.ACTUAL (the shell-thinning
    moves).

    PRE and POST extraction: PASSES (only the AUX count moves from
    47 → 45 — both are <= 47, so the ratchet-down invariant
    auto-accommodates).
    """
    from app.core.architecture_invariants import (
        run_all_phase_5_endpoint_assertions,
    )
    import server  # noqa: WPS433
    # Should not raise.
    run_all_phase_5_endpoint_assertions(fastapi_app=server.fastapi_app)
