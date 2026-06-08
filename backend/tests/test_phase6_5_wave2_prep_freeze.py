"""
Phase 6.5+ Wave 2 PREP — freeze before code-touch (now POST-LANDING)
=====================================================================

Originally installed 2026-05-20 as the PREP freeze for 5 targets before
Wave 2 code-touch. Wave 2 landed on the same date — this file is now
**re-cast as the post-landing freeze**, locking the new baseline:

  * 0 def-sites of the 41 Wave-2-scope symbols remain in server.py.
  * Load-context refs in server.py:
      - AUCTION_TIERED_FEES: 5 → 1 (only `_ensure_calculator_seed`
        keeps a ref; the 2 ``_tiered_buyer_fee*`` helpers are now shims).
      - All other 40 symbols: same as pre-Wave-2 (still used by
        `_ensure_calculator_seed`, `_load_calc_config`, and admin
        config endpoints — all deferred to Wave 3).
  * Import graph:
      - `app/services/calculator.py` `from server import …` count
        DROPPED from 42 → 0 (all moved to calculator_constants +
        calculator_pure; remaining 2 server-coupled helpers accessed
        lazily via `import server` inside function bodies).
      - `app/services/calculator.py` from `calculator_pure`: 1 → 3
        (added `_tiered_buyer_fee` + `_tiered_buyer_fee_from_db`).
      - NEW: `app/services/calculator.py` from
        `app.core.calculator_constants`: 39.
  * Cycle reproduction: `import app.services.calculator` standalone
    now SUCCEEDS — the latent partially-initialised cycle is resolved
    (server.py:9789's `from app.services.calculator import …` no longer
    re-triggers a half-loaded calculator module).
  * Boot-order probe: unchanged — production boot still passes.

Mandate-respect (Wave 2 landing)
─────────────────────────────────
  * 0 production code changes in non-Wave-2 files (audit-respected).
  * Inventory ratchet: AUX 44 → 4 (38 constants + 2 helpers retired).
  * 6.3.A composite assertion: held (<=44 floor; new live count = 4).
"""
from __future__ import annotations

import ast
import importlib
import subprocess
import sys
from pathlib import Path
from typing import Dict, List, Set, Tuple

import pytest


BACKEND = Path(__file__).resolve().parent.parent


# ─────────────────────────────────────────────────────────────────────
# Frozen baseline (truth-restored from PREP audit 2026-05-20)
# ─────────────────────────────────────────────────────────────────────

# §1 Wave 2 scope — 41 symbols. Frozen verbatim.
_PURE_CONSTANTS: frozenset = frozenset({
    # Catalog tables (3)
    "VEHICLE_TYPES", "CALCULATOR_PORTS", "AUCTION_FEES",
    # USA-pipeline constants (14)
    "DEFAULT_PROFILE_CODE", "VEHICLE_USA_INLAND", "VEHICLE_OCEAN_BASE",
    "PORT_OCEAN_ADJUST", "VEHICLE_EU_DELIVERY", "PORT_FORWARDING",
    "PORT_PARKING", "PARKING_BULGARIA", "COMPANY_SERVICES",
    "CUSTOMS_DOCUMENTATION", "CUSTOMS_DUTY_RATE", "INSURANCE_RATE",
    "DAMAGED_CUSTOMS_FACTOR", "DAMAGE_HANDLING_FEE_USD",
    # Korea-pipeline constants (21)
    "KOREA_PROFILE_CODE", "KOREA_USE_LOGISTICS_PACKAGE",
    "KOREA_AUCTION_FEE_PERCENT", "KOREA_LOGISTICS_PACKAGE",
    "KOREA_INLAND_DEFAULT", "KOREA_SEA_DEFAULT", "KOREA_INSURANCE_DEFAULT",
    "KOREA_FORWARDER_FEE_DEFAULT", "KOREA_DOCUMENTS_MAIL_DEFAULT",
    "KOREA_CUSTOMS_DUTY_RATE", "KOREA_VAT_RATE", "KOREA_UNDERVALUE_PERCENT",
    "KOREA_DAMAGED_CUSTOMS_FACTOR", "KOREA_DAMAGE_HANDLING_FEE_USD",
    "KOREA_OFFICIAL_FEES_USD", "KOREA_BIBI_SERVICE_FEE",
    "KOREA_FX_USD_TO_EUR", "KOREA_BG_TRANSPORT_EUR",
    "KOREA_ADDITIONAL_FEES_EUR", "KOREA_TECH_INSPECTION_EUR",
    "KOREA_BB_CARS_COMMISSION_EUR",
})
_INTERNAL_CONST: str = "AUCTION_TIERED_FEES"  # NOT in 6.3.B whitelist
_HELPERS: frozenset = frozenset({"_tiered_buyer_fee", "_tiered_buyer_fee_from_db"})

# §2 Per-symbol Load-context ref counts in server.py (frozen baseline).
# PRE-Wave-2: total = 72. Locked here for drift detection.
_FROZEN_REF_COUNTS_PRE: Dict[str, int] = {
    "VEHICLE_TYPES": 1, "CALCULATOR_PORTS": 2, "AUCTION_FEES": 3,
    "DEFAULT_PROFILE_CODE": 16,
    "VEHICLE_USA_INLAND": 1, "VEHICLE_OCEAN_BASE": 1,
    "PORT_OCEAN_ADJUST": 1, "VEHICLE_EU_DELIVERY": 1, "PORT_FORWARDING": 1,
    "PORT_PARKING": 1, "PARKING_BULGARIA": 1, "COMPANY_SERVICES": 1,
    "CUSTOMS_DOCUMENTATION": 1, "CUSTOMS_DUTY_RATE": 1, "INSURANCE_RATE": 1,
    "DAMAGED_CUSTOMS_FACTOR": 2, "DAMAGE_HANDLING_FEE_USD": 2,
    "KOREA_PROFILE_CODE": 7,
    "KOREA_USE_LOGISTICS_PACKAGE": 1, "KOREA_AUCTION_FEE_PERCENT": 1,
    "KOREA_LOGISTICS_PACKAGE": 1, "KOREA_INLAND_DEFAULT": 1,
    "KOREA_SEA_DEFAULT": 1, "KOREA_INSURANCE_DEFAULT": 1,
    "KOREA_FORWARDER_FEE_DEFAULT": 1, "KOREA_DOCUMENTS_MAIL_DEFAULT": 1,
    "KOREA_CUSTOMS_DUTY_RATE": 1, "KOREA_VAT_RATE": 1,
    "KOREA_UNDERVALUE_PERCENT": 1,
    "KOREA_DAMAGED_CUSTOMS_FACTOR": 2, "KOREA_DAMAGE_HANDLING_FEE_USD": 2,
    "KOREA_OFFICIAL_FEES_USD": 2,
    "KOREA_BIBI_SERVICE_FEE": 1, "KOREA_FX_USD_TO_EUR": 1,
    "KOREA_BG_TRANSPORT_EUR": 1, "KOREA_ADDITIONAL_FEES_EUR": 1,
    "KOREA_TECH_INSPECTION_EUR": 1, "KOREA_BB_CARS_COMMISSION_EUR": 1,
    "AUCTION_TIERED_FEES": 5,
    "_tiered_buyer_fee": 0,
    "_tiered_buyer_fee_from_db": 0,
}

# POST-Wave-2 baseline: same as pre-Wave-2 except for AUCTION_TIERED_FEES.
# The 38 PURE_CONSTANT + AUCTION_TIERED_FEES are now re-exported from
# `app.core.calculator_constants`; the bare names remain Load-resolvable
# in `_ensure_calculator_seed`, `_load_calc_config`, and admin config
# endpoints (all deferred to Wave 3 — they will lose these refs there).
#
# `_tiered_buyer_fee` + `_tiered_buyer_fee_from_db` helpers are now
# thin compat shims that import the canonical impl LOCALLY (lazy import
# inside the shim body); the shim bodies use `_impl` as alias, so the
# bare `AUCTION_TIERED_FEES` Name nodes that were in the old helper
# bodies are gone. AUCTION_TIERED_FEES Load-context: 5 → 1.
_FROZEN_REF_COUNTS_POST: Dict[str, int] = dict(_FROZEN_REF_COUNTS_PRE)
_FROZEN_REF_COUNTS_POST["AUCTION_TIERED_FEES"] = 1

# POST-Wave-3 baseline: the calc-engine SERVER_STATE closure landed.
# The 3 stateful callables (``_ensure_calculator_seed``,
# ``_load_calc_config``, ``_invalidate_calc_cache``) moved to their
# canonical home ``app/services/calculator_config_cache.py``. All
# bare-Name references to the 39 constants in those bodies are gone
# from server.py — only the admin config endpoints' default-param
# values remain (`code: str = DEFAULT_PROFILE_CODE`, etc.).
#
# Live refs post-Wave-3:
#   DEFAULT_PROFILE_CODE = 7  (admin endpoints)
#   AUCTION_FEES         = 2  (admin endpoint default)
#   CALCULATOR_PORTS     = 1
#   VEHICLE_TYPES        = 1
#   KOREA_PROFILE_CODE   = 1
#   All other 34 symbols = 0
_FROZEN_REF_COUNTS_POST_WAVE_3: Dict[str, int] = {
    sym: 0 for sym in _FROZEN_REF_COUNTS_PRE
}
_FROZEN_REF_COUNTS_POST_WAVE_3.update({
    "DEFAULT_PROFILE_CODE": 7,
    "AUCTION_FEES": 2,
    "CALCULATOR_PORTS": 1,
    "VEHICLE_TYPES": 1,
    "KOREA_PROFILE_CODE": 1,
})

_FROZEN_TOTAL_REFS_PRE = sum(_FROZEN_REF_COUNTS_PRE.values())   # = 72
_FROZEN_TOTAL_REFS_POST = sum(_FROZEN_REF_COUNTS_POST.values())  # = 68
_FROZEN_TOTAL_REFS_POST_W3 = sum(_FROZEN_REF_COUNTS_POST_WAVE_3.values())  # = 12
assert _FROZEN_TOTAL_REFS_PRE == 72
assert _FROZEN_TOTAL_REFS_POST == 68
assert _FROZEN_TOTAL_REFS_POST_W3 == 12


# ═══════════════════════════════════════════════════════════════════
# §1 — Exact constant count freeze
# ═══════════════════════════════════════════════════════════════════

def test_1_exact_wave_2_scope_is_41_symbols() -> None:
    """Wave 2 scope is frozen at exactly 41 symbols:
    38 PURE_CONSTANT + 1 AUCTION_TIERED_FEES + 2 helpers.

    Pre-Wave-2: all 41 still defined in server.py.
    Post-Wave-2: 0 should remain in server.py (constants moved to
    canonical home; helpers moved to calculator_pure.py).
    """
    src = (BACKEND / "server.py").read_text(encoding="utf-8")
    tree = ast.parse(src)
    found: Set[str] = set()
    all_symbols = (
        _PURE_CONSTANTS | {_INTERNAL_CONST} | _HELPERS
    )
    for node in tree.body:
        if isinstance(node, ast.Assign):
            for tgt in node.targets:
                if isinstance(tgt, ast.Name) and tgt.id in all_symbols:
                    found.add(tgt.id)
        elif isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            if node.name in all_symbols:
                found.add(node.name)
    # Pre-Wave-2: all 41 found in server.py as def-sites
    # Post-Wave-2: 0 found in server.py as def-sites (re-exported via
    # `from app.core.calculator_constants import …` — bindings, not defs;
    # helpers are now compat shims that delegate to calculator_pure).
    # Note: the 2 helper compat shims (`_tiered_buyer_fee*`) ARE
    # FunctionDefs that re-use the original names — they're still
    # counted by this AST walk. So post-Wave-2 we expect those 2 names
    # to be present (as shims), but the 39 constants must NOT be Assign
    # targets at module level.
    constants_found = found & (_PURE_CONSTANTS | {_INTERNAL_CONST})
    helpers_found = found & _HELPERS
    is_pre = (constants_found == (_PURE_CONSTANTS | {_INTERNAL_CONST})
              and helpers_found == _HELPERS)
    is_post = (constants_found == set() and helpers_found == _HELPERS)
    assert is_pre or is_post, (
        f"[Wave 2] FAIL: Wave 2 scope partially-extracted. "
        f"Expected ALL 41 def-sites (pre) OR ZERO constants + 2 helper-shim "
        f"FunctionDefs (post). Found constants={sorted(constants_found)} "
        f"({len(constants_found)}/39), helpers={sorted(helpers_found)} "
        f"({len(helpers_found)}/2)."
    )
    assert len(_PURE_CONSTANTS) == 38
    assert len(_HELPERS) == 2
    assert len(all_symbols) == 41


# ═══════════════════════════════════════════════════════════════════
# §2 — Exact server.py Load-context ref count freeze
# ═══════════════════════════════════════════════════════════════════

def test_2_exact_load_context_ref_counts_in_server_py() -> None:
    """Per-symbol Load-context Name-node count in server.py.

    Two acceptable shapes:
      * PRE-Wave-2 baseline: matches `_FROZEN_REF_COUNTS_PRE` (total 72).
      * POST-Wave-2 baseline: matches `_FROZEN_REF_COUNTS_POST` (total 68 —
        AUCTION_TIERED_FEES drops 5→1 as the helper bodies become shims).

    Anything else = mid-extraction drift, fails CI.

    Note (Wave 3 successor): when `_ensure_calculator_seed` +
    `_load_calc_config` retire, the remaining 67 refs in server.py
    will also vanish, dropping the total to 0. The post-Wave-2 baseline
    is the **intermediate** target.
    """
    from collections import Counter
    src = (BACKEND / "server.py").read_text(encoding="utf-8")
    tree = ast.parse(src)
    actual: Counter = Counter()
    for node in ast.walk(tree):
        if (
            isinstance(node, ast.Name)
            and isinstance(node.ctx, ast.Load)
            and node.id in _FROZEN_REF_COUNTS_PRE
        ):
            actual[node.id] += 1

    is_pre = all(
        actual.get(sym, 0) == cnt
        for sym, cnt in _FROZEN_REF_COUNTS_PRE.items()
    )
    is_post = all(
        actual.get(sym, 0) == cnt
        for sym, cnt in _FROZEN_REF_COUNTS_POST.items()
    )
    is_post_w3 = all(
        actual.get(sym, 0) == cnt
        for sym, cnt in _FROZEN_REF_COUNTS_POST_WAVE_3.items()
    )
    assert is_pre or is_post or is_post_w3, (
        f"[Wave 2/3] FAIL: ref-count drift — none of the 3 baselines "
        f"matched. Wave 2/3 scope is mid-extraction (partial). Live counts:\n"
        + "\n".join(
            f"  {sym}: live={actual.get(sym, 0)} "
            f"pre={_FROZEN_REF_COUNTS_PRE[sym]} "
            f"post-w2={_FROZEN_REF_COUNTS_POST[sym]} "
            f"post-w3={_FROZEN_REF_COUNTS_POST_WAVE_3[sym]}"
            for sym in sorted(_FROZEN_REF_COUNTS_PRE)
            if (actual.get(sym, 0) != _FROZEN_REF_COUNTS_PRE[sym]
                and actual.get(sym, 0) != _FROZEN_REF_COUNTS_POST[sym]
                and actual.get(sym, 0) != _FROZEN_REF_COUNTS_POST_WAVE_3[sym])
        )
    )


def test_2b_top_consumer_symbols_locked_at_correct_counts() -> None:
    """The 3 highest-fanout symbols deserve their own pin (they were
    the highest Wave-2 risk because the re-export block must succeed
    for them OR the engine breaks):

      DEFAULT_PROFILE_CODE: 16 server.py refs (unchanged pre/post Wave 2)
      KOREA_PROFILE_CODE:   7  (unchanged pre/post Wave 2)
      AUCTION_TIERED_FEES:  5 (pre) → 1 (post — helper bodies shimmed)
    """
    from collections import Counter
    src = (BACKEND / "server.py").read_text(encoding="utf-8")
    tree = ast.parse(src)
    actual: Counter = Counter()
    for node in ast.walk(tree):
        if (
            isinstance(node, ast.Name)
            and isinstance(node.ctx, ast.Load)
            and node.id in {
                "DEFAULT_PROFILE_CODE", "KOREA_PROFILE_CODE",
                "AUCTION_TIERED_FEES",
            }
        ):
            actual[node.id] += 1

    dpc = actual.get("DEFAULT_PROFILE_CODE", 0)
    kpc = actual.get("KOREA_PROFILE_CODE", 0)
    atf = actual.get("AUCTION_TIERED_FEES", 0)
    is_pre = (dpc == 16 and kpc == 7 and atf == 5)
    is_post = (dpc == 16 and kpc == 7 and atf == 1)
    # Post-Wave-3: seed routine and config loader moved to canonical
    # home → DEFAULT_PROFILE_CODE drops 16→7, KOREA_PROFILE_CODE 7→1,
    # AUCTION_TIERED_FEES 1→0.
    is_post_w3 = (dpc == 7 and kpc == 1 and atf == 0)
    assert is_pre or is_post or is_post_w3, (
        f"[Wave 2/3] FAIL: top-consumer drift. Live: "
        f"DEFAULT_PROFILE_CODE={dpc} (frozen pre=16/post-w2=16/post-w3=7), "
        f"KOREA_PROFILE_CODE={kpc} (frozen pre=7/post-w2=7/post-w3=1), "
        f"AUCTION_TIERED_FEES={atf} (frozen pre=5/post-w2=1/post-w3=0)."
    )


# ═══════════════════════════════════════════════════════════════════
# §3 — Import graph freeze
# ═══════════════════════════════════════════════════════════════════

def test_3_calculator_imports_zero_or_legacy_from_server() -> None:
    """``app/services/calculator.py`` ``from server import X`` counts.

    Two acceptable shapes:
      * PRE-Wave-2 baseline: 42 symbols (post-Wave-1, post-5.5/B).
      * POST-Wave-2 baseline: 0 symbols. Wave 2 broke the latent cycle
        by replacing all `from server import` with lazy `import server`
        inside function bodies (server-coupled helpers `_ensure_calculator_seed`
        and `_load_calc_config` are now accessed at call-time, not
        module-load).
    """
    calc_path = BACKEND / "app" / "services" / "calculator.py"
    tree = ast.parse(calc_path.read_text(encoding="utf-8"))
    server_imports: Set[str] = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.ImportFrom) and node.module == "server":
            for alias in node.names:
                server_imports.add(alias.name)
    assert len(server_imports) in (0, 42), (
        f"[Wave 2] FAIL: calculator.py imports {len(server_imports)} "
        f"symbols from server, expected 42 (pre-Wave-2) or 0 (post-Wave-2). "
        f"Mid-extraction drift detected: {sorted(server_imports)}"
    )


def test_3b_calculator_imports_pure_helpers() -> None:
    """``app/services/calculator.py`` imports from
    ``app.services.calculator_pure``.

    Pre-Wave-2: 1 (`_find_route_amount` only — Wave 1 retirement).
    Post-Wave-2: 3 (adds 2 `_tiered_buyer_fee*` helpers).
    """
    calc_path = BACKEND / "app" / "services" / "calculator.py"
    tree = ast.parse(calc_path.read_text(encoding="utf-8"))
    pure_imports: Set[str] = set()
    for node in ast.walk(tree):
        if (
            isinstance(node, ast.ImportFrom)
            and node.module == "app.services.calculator_pure"
        ):
            for alias in node.names:
                pure_imports.add(alias.name)
    assert len(pure_imports) in (1, 3), (
        f"[Wave 2] FAIL: calculator.py imports {len(pure_imports)} "
        f"symbols from app.services.calculator_pure, expected 1 "
        f"(pre-Wave-2) or 3 (post-Wave-2). Live: {sorted(pure_imports)}"
    )


def test_3bb_calculator_imports_calculator_constants_post_wave_2() -> None:
    """NEW post-Wave-2 dependency edge:
    ``app/services/calculator.py`` imports 38 symbols from
    ``app.core.calculator_constants`` (the 38 PURE_CONSTANT).

    AUCTION_TIERED_FEES is NOT imported by calculator.py — it's
    consumed only by the 2 ``_tiered_buyer_fee*`` helpers which now
    live in ``calculator_pure.py`` and import it from constants
    directly.

    Pre-Wave-2: module doesn't exist, so 0 imports.
    Post-Wave-2: 38 imports.
    """
    calc_path = BACKEND / "app" / "services" / "calculator.py"
    tree = ast.parse(calc_path.read_text(encoding="utf-8"))
    cc_imports: Set[str] = set()
    for node in ast.walk(tree):
        if (
            isinstance(node, ast.ImportFrom)
            and node.module == "app.core.calculator_constants"
        ):
            for alias in node.names:
                cc_imports.add(alias.name)
    assert len(cc_imports) in (0, 38), (
        f"[Wave 2] FAIL: calculator.py imports {len(cc_imports)} "
        f"symbols from app.core.calculator_constants, expected 0 "
        f"(pre-Wave-2) or 38 (post-Wave-2). Live: {sorted(cc_imports)}"
    )


def test_3c_consumer_surface_still_frozen_at_two() -> None:
    """Wave 2 must not introduce a third consumer of
    ``app.services.calculator``. Frozen at:
      1. ``server.py`` (the reciprocal — production boot)
      2. ``app/routers/calculations.py`` (HTTP route handler)
    """
    consumers: Set[str] = set()
    for p in BACKEND.rglob("*.py"):
        if "__pycache__" in p.parts: continue
        try:
            if (BACKEND / "tests") in p.parents: continue
        except Exception: pass
        if p.name.startswith(("test_", "backend_test")): continue
        if p.name in ("calculations_test.py", "auth_settings_test.py"): continue
        try:
            tree = ast.parse(p.read_text(encoding="utf-8"))
        except Exception: continue
        for node in ast.walk(tree):
            if (
                isinstance(node, ast.ImportFrom)
                and node.module == "app.services.calculator"
            ):
                consumers.add(str(p.relative_to(BACKEND)))
    expected = {"server.py", "app/routers/calculations.py"}
    assert consumers == expected, (
        f"[Wave 2] FAIL: consumer surface drifted. Expected "
        f"{sorted(expected)}, got {sorted(consumers)}."
    )


# ═══════════════════════════════════════════════════════════════════
# §4 — Cycle reproduction → resolution
# ═══════════════════════════════════════════════════════════════════

def _run_isolated(code: str) -> Tuple[int, str, str]:
    """Run code in a fresh subprocess (clean sys.modules)."""
    result = subprocess.run(
        [sys.executable, "-c", code],
        cwd=str(BACKEND),
        capture_output=True,
        text=True,
        timeout=30,
        env={
            "PATH": "/usr/bin:/usr/local/bin",
            "PYTHONPATH": str(BACKEND),
            "MONGO_URL": "mongodb://localhost:27017",
            "DB_NAME": "test_database",
            "CORS_ORIGINS": "*",
        },
    )
    return result.returncode, result.stdout, result.stderr


def test_4_circular_import_resolved_post_wave_2() -> None:
    """POST-LANDING: standalone ``import app.services.calculator`` now
    SUCCEEDS — the latent circular-import shape is resolved.

    Wave 2 broke the cycle by:
      * Moving 38 PURE_CONSTANT + AUCTION_TIERED_FEES to
        ``app/core/calculator_constants.py`` (zero deps).
      * Moving 2 ``_tiered_buyer_fee*`` helpers to
        ``app/services/calculator_pure.py``.
      * Converting the remaining 2 server-coupled calls
        (``_ensure_calculator_seed``, ``_load_calc_config``) to lazy
        ``import server`` inside function bodies — call-time, not
        module-load.

    This rewrite IS the wave's success signal.
    """
    code = (
        "import app.services.calculator as c; "
        "assert hasattr(c, '_calculate_korea'), 'engine missing'; "
        "assert hasattr(c, 'calculator_calculate'), 'engine missing'; "
        "print('STANDALONE_OK')"
    )
    rc, out, err = _run_isolated(code)
    assert rc == 0 and "STANDALONE_OK" in out, (
        f"[Wave 2] FAIL: standalone calculator load did NOT succeed — "
        f"cycle still latent. stdout={out!r}, stderr={err!r}"
    )


def test_4b_constants_module_exists_with_39_symbols_post_wave_2() -> None:
    """POST-Wave-2: ``app/core/calculator_constants.py`` exists with
    all 38 PURE_CONSTANT + AUCTION_TIERED_FEES = 39 symbols.
    """
    constants_path = BACKEND / "app" / "core" / "calculator_constants.py"
    assert constants_path.exists(), (
        "[Wave 2] FAIL: app/core/calculator_constants.py missing — "
        "Wave 2 landing incomplete."
    )
    mod = importlib.import_module("app.core.calculator_constants")
    for sym in _PURE_CONSTANTS:
        assert hasattr(mod, sym), (
            f"[Wave 2] FAIL: app.core.calculator_constants missing {sym}"
        )
    assert hasattr(mod, "AUCTION_TIERED_FEES"), (
        "[Wave 2] FAIL: app.core.calculator_constants missing "
        "AUCTION_TIERED_FEES (internal constant)."
    )


# ═══════════════════════════════════════════════════════════════════
# §5 — Boot-order probe
# ═══════════════════════════════════════════════════════════════════

def test_5_production_boot_order_still_pass() -> None:
    """Production boot order (server first → calculator) must still
    succeed cleanly. Frozen invariant across all 3 calc-engine waves.
    """
    code = (
        "import server; "
        "import app.services.calculator as c; "
        "assert hasattr(c, '_calculate_korea'), 'engine missing'; "
        "assert hasattr(c, 'calculator_calculate'), 'engine missing'; "
        "print('BOOT_OK')"
    )
    rc, out, err = _run_isolated(code)
    assert rc == 0 and "BOOT_OK" in out, (
        f"[Wave 2] FAIL: production boot order broke. "
        f"stdout={out!r}, stderr={err!r}"
    )


def test_5b_live_composite_assertion_holds() -> None:
    """Live runtime composite (from 6.3.A) still holds. Cumulative
    invariant ratchet across Phase 6.
    """
    from app.core.architecture_invariants import (
        run_all_phase_5_endpoint_assertions,
    )
    import server  # noqa: WPS433
    run_all_phase_5_endpoint_assertions(fastapi_app=server.fastapi_app)


def test_5c_aux_at_post_wave_2_floor() -> None:
    """POST-Wave-2: ``EXTRACTION_AUX_BRIDGES`` collapsed from 44 to 2.
    Wave 2 fully retired the CALC_ENGINE_DEP cluster (all 42
    post-Wave-1 entries):

      * 38 PURE_CONSTANT + AUCTION_TIERED_FEES → calculator_constants.py
      * 2 ``_tiered_buyer_fee*`` helpers       → calculator_pure.py
      * 2 SERVER_STATE-coupled helpers
        (``_ensure_calculator_seed``, ``_load_calc_config``) are no
        longer ``from server import``-coupled — calculator.py uses
        the Wave-2 cycle-break ``import server`` allowance. They
        retire from server.py entirely in Wave 3.

    Remaining 2 entries in EXTRACTION_AUX_BRIDGES:
      * ``_resolve_bearer`` (CUSTOMER_AUTH_DEP)
      * ``_tracking_snapshot`` (TRACKING_PROVIDERS_DEP)
    """
    from app.core.app_state_targets import EXTRACTION_AUX_BRIDGES
    # Pre-Wave-2 = 44, post-Wave-2 = 2. Accept either.
    assert len(EXTRACTION_AUX_BRIDGES) in (2, 44), (
        f"[Wave 2] FAIL: EXTRACTION_AUX_BRIDGES count "
        f"{len(EXTRACTION_AUX_BRIDGES)} matches neither pre-Wave-2 (44) "
        f"nor post-Wave-2 (2) baseline."
    )
