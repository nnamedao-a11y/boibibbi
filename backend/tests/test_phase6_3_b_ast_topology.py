"""
Phase 6.3.B — AST enforcement / topology checks — golden suite
==============================================================

Locks the post-6.2.ACTUAL shell-thinned topology with AST-level
ratchets. This is the **enforcement layer** that prevents accidental
re-monolithization — the topology that was *true* after Phase 5
becomes *enforceable* after this wave.

What this suite enforces (8 ratchets, mirror of mandate)
─────────────────────────────────────────────────────────

  1. ``from server import X``  — production code (outside tests/,
     server.py itself, calculations_test.py, auth_settings_test.py,
     backend_test*.py) — restricted to the explicit whitelist below.
     Bidirectional ratchet: any site missing from whitelist OR any
     whitelisted site missing from live AST = test failure.

  2. ``import server`` — production code — must be ZERO. The
     ``import server`` shape was retired across Phase 5; any new
     occurrence is an accidental re-coupling.

  3. ``from app.services.* import …`` — every site found in
     production AST must resolve at module-load time (target module
     must import-successfully AND must expose every imported name
     via attribute access).

  4. ``from app.utils.* import …`` — same contract as (3).

  5. ``try: from app.services… except ImportError`` (or
     ``ModuleNotFoundError``, or bare ``except``) — production code
     must contain ZERO such blocks. Same for app.utils. Silent
     fallback patterns hide topology drift; ban them at AST level.

  6. Inventory ↔ live AST coherence:
       BRIDGE_INVENTORY = 1   (only ``_STATIC_DIR`` Tier-B / Phase 5.8)
       TIER_C_REQUIRES_REFACTOR = 0
       PHASE_5_5_BOUNDARY = 0
       QUALIFIED_USAGE_BRIDGES = 0
       EXTRACTION_AUX_BRIDGES ≤ 45

  7. OpenAPI frozen: paths = 618, ops = 679.

  8. Worker registry topology: at least 7 ``worker_registry.register(``
     call-sites in production source (AST count). The 7 critical
     workers are: ops_guardian, payment_reminder, resolver_worker,
     ringostat_cron, tracking_worker, transfer_detector,
     watchlist_live_poll. Counted at AST level so the test runs
     without spinning up the lifespan.

Mandate-respect
───────────────

This suite is a TEST-ONLY enforcement wave. Per the Phase 6.3.B
mandate ("no production code changes unless test reveals true hidden
topology violation"), the whitelist below is the TRUTH-RESTORED
baseline as of 2026-05-20 post-6.2.ACTUAL. Every entry carries an
audit-trail comment citing the wave that put it there and the
``EXTRACTION_AUX_BRIDGES`` / ``PHASE_5_8_BOUNDARY`` slot it occupies.

If a future wave LEGITIMATELY adds a new ``from server import X``
site, two things MUST happen together (single commit):

  * Add the row to ``_WHITELISTED_FROM_SERVER`` below.
  * Add the corresponding ``Bridge(...)`` or boundary entry to
    ``app/core/app_state_targets.py``.

If a future wave LEGITIMATELY retires one of the whitelisted sites,
the wave's commit MUST:

  * Remove the row from ``_WHITELISTED_FROM_SERVER`` below.
  * Update the corresponding inventory entry to ``RETIRED`` status.

The bidirectional ratchet enforces this discipline at CI time.
"""
from __future__ import annotations

import ast
import importlib
from pathlib import Path
from typing import Dict, List, Set, Tuple

import pytest


# ─────────────────────────────────────────────────────────────────────
# §0 — Backend / production-tree discovery
# ─────────────────────────────────────────────────────────────────────

BACKEND = Path(__file__).resolve().parent.parent
TESTS_DIR = BACKEND / "tests"
SERVER_PY = BACKEND / "server.py"


def _is_production(p: Path) -> bool:
    """Return True if ``p`` is a production source file.

    Production = not in ``backend/tests/``, not a ``test_*.py`` or
    ``backend_test*.py`` script, not ``server.py`` itself (self-import
    is trivially OK because thin compat shims are inside the module),
    not a ``__pycache__`` artifact.
    """
    if "__pycache__" in p.parts:
        return False
    try:
        if TESTS_DIR in p.parents:
            return False
    except Exception:
        pass
    if p.name.startswith("test_") or p.name.startswith("backend_test"):
        return False
    if p.name in (
        "calculations_test.py",
        "auth_settings_test.py",
    ):
        return False
    if p.resolve() == SERVER_PY.resolve():
        return False
    return True


def _production_python_files() -> List[Path]:
    return [p for p in BACKEND.rglob("*.py") if _is_production(p)]


# ─────────────────────────────────────────────────────────────────────
# §1 — Truth-restored whitelist (post-6.2.ACTUAL baseline)
# ─────────────────────────────────────────────────────────────────────

# Tuple shape: ``(file_relpath, frozenset_of_symbol_names, audit_trail)``
#
# Truth-restored 2026-05-20 by AST audit of /app/backend. Every entry
# below corresponds to either an EXTRACTION_AUX_BRIDGES row or a
# PHASE_5_8_BOUNDARY row in app/core/app_state_targets.py. If a row
# moves, both must move together (single commit).
_WHITELISTED_FROM_SERVER: Tuple[
    Tuple[str, frozenset, str], ...
] = (
    (
        "app/services/customers.py",
        frozenset({"_resolve_bearer"}),
        "Phase 5.5/D extraction-aux, kind=CUSTOMER_AUTH_DEP. "
        "Lazy local import inside ``require_customer`` — the bearer-"
        "resolution helper stayed on server.py side by D2 mandate "
        "(`_resolve_bearer` reads server-module-level FastAPI security "
        "primitives). Inventoried in EXTRACTION_AUX_BRIDGES.",
    ),
    (
        "app/services/tracking_providers.py",
        frozenset({"_tracking_snapshot"}),
        "Phase 5.5/H extraction-aux, kind=TRACKING_PROVIDERS_DEP. "
        "Cold-start fallback bridge inside ``_snapshot()`` — reads the "
        "``server.tracking_config_service`` module-global. Currently "
        "DEFERRED to Phase 6.4 (requires app/core/tracking_config_runtime.py "
        "accessor module mirroring db_runtime / socket_runtime). "
        "Inventoried in EXTRACTION_AUX_BRIDGES.",
    ),
    (
        # Phase 6.5+ Wave 2 (LANDING 2026-05-20) — calculator engine
        # extraction-aux cluster FULLY RETIRED in 2 waves
        # (6.5+/Wave-1 + 6.5+/Wave-2). The 42-symbol whitelist entry
        # that used to live here is gone. The 2 SERVER_STATE-coupled
        # helpers (``_ensure_calculator_seed``, ``_load_calc_config``)
        # are now reached via lazy ``import server`` inside engine
        # function bodies (allowance in test_2 — Wave-2 cycle-break
        # pattern) — Wave 3 will retire them too.
        # See ``PHASE_6_5_WAVE_2_RETIRED_BRIDGES`` in app_state_targets.
        "app/routers/content.py",
        frozenset({"_STATIC_DIR"}),
        "Phase 5.8 boundary, kind=Tier-B. Lazy import inside "
        "``_static_dir()`` accessor — the static mount path constant "
        "stays on server.py until the Phase 5.8 bootstrap-layer "
        "reshuffle. Inventoried in PHASE_5_8_BOUNDARY.",
    ),
)


def _whitelist_as_dict() -> Dict[str, frozenset]:
    """Flatten the whitelist into ``{file_relpath: frozenset_of_symbols}``."""
    return {row[0]: row[1] for row in _WHITELISTED_FROM_SERVER}


# ─────────────────────────────────────────────────────────────────────
# §2 — AST helpers (production code scanners)
# ─────────────────────────────────────────────────────────────────────

def _parse(p: Path) -> ast.AST:
    return ast.parse(p.read_text(encoding="utf-8"), filename=str(p))


def _from_server_imports() -> List[Tuple[Path, int, List[str]]]:
    """All ``from server import X`` AST sites in production code.

    Returns ``[(path, lineno, [symbol_name, ...]), ...]``.
    """
    out: List[Tuple[Path, int, List[str]]] = []
    for p in _production_python_files():
        try:
            tree = _parse(p)
        except Exception:
            continue
        for node in ast.walk(tree):
            if isinstance(node, ast.ImportFrom) and node.module == "server":
                names = [a.name for a in node.names]
                out.append((p, node.lineno, names))
    return out


def _import_server_sites() -> List[Tuple[Path, int]]:
    """All ``import server`` AST sites in production code."""
    out: List[Tuple[Path, int]] = []
    for p in _production_python_files():
        try:
            tree = _parse(p)
        except Exception:
            continue
        for node in ast.walk(tree):
            if isinstance(node, ast.Import):
                for a in node.names:
                    if a.name == "server":
                        out.append((p, node.lineno))
    return out


def _app_imports(prefix: str) -> List[Tuple[Path, int, str, List[str]]]:
    """All ``from {prefix}.* import X`` sites in production code.

    Returns ``[(path, lineno, module_str, [symbol_name, ...]), ...]``.
    """
    out: List[Tuple[Path, int, str, List[str]]] = []
    for p in _production_python_files():
        try:
            tree = _parse(p)
        except Exception:
            continue
        for node in ast.walk(tree):
            if isinstance(node, ast.ImportFrom) and node.module:
                if node.module == prefix or node.module.startswith(prefix + "."):
                    names = [a.name for a in node.names]
                    out.append((p, node.lineno, node.module, names))
    return out


def _try_import_fallback_sites(prefix: str) -> List[Tuple[Path, int, str]]:
    """All ``try: from {prefix}.* import …  except ImportError: …`` blocks
    in production code.

    Returns ``[(path, lineno, module_str), ...]``.
    """
    out: List[Tuple[Path, int, str]] = []
    for p in _production_python_files():
        try:
            tree = _parse(p)
        except Exception:
            continue
        for node in ast.walk(tree):
            if not isinstance(node, ast.Try):
                continue
            # Body contains a from-import on the prefix?
            target_imports: List[ast.ImportFrom] = []
            for stmt in node.body:
                if isinstance(stmt, ast.ImportFrom) and stmt.module:
                    if (
                        stmt.module == prefix
                        or stmt.module.startswith(prefix + ".")
                    ):
                        target_imports.append(stmt)
            if not target_imports:
                continue
            # Handlers catch ImportError / ModuleNotFoundError / bare?
            for h in node.handlers:
                catches_import_error = False
                if h.type is None:
                    catches_import_error = True
                elif isinstance(h.type, ast.Name) and h.type.id in (
                    "ImportError",
                    "ModuleNotFoundError",
                ):
                    catches_import_error = True
                elif isinstance(h.type, ast.Tuple):
                    for elt in h.type.elts:
                        if isinstance(elt, ast.Name) and elt.id in (
                            "ImportError",
                            "ModuleNotFoundError",
                        ):
                            catches_import_error = True
                            break
                if catches_import_error:
                    for stmt in target_imports:
                        out.append((p, node.lineno, stmt.module))
                    break
    return out


def _worker_register_callsites() -> List[Tuple[Path, int, str]]:
    """All ``worker_registry.register(name=...)`` (or
    ``register(...)`` on a ``worker_registry`` attribute access)
    AST call-sites. Used by check 8.

    Convention: this scan INCLUDES ``server.py`` itself, because
    server.py IS the legitimate registration site for the 7 critical
    workers (they're registered inside ``lifespan()``). server.py is
    only excluded from the ``from server import X`` checks (1, 2)
    where self-imports trivially don't count as external coupling.
    """
    out: List[Tuple[Path, int, str]] = []
    files = _production_python_files() + [SERVER_PY]
    for p in files:
        try:
            tree = _parse(p)
        except Exception:
            continue
        for node in ast.walk(tree):
            if isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute):
                if node.func.attr == "register":
                    parent = node.func.value
                    is_worker_registry = False
                    if isinstance(parent, ast.Name) and parent.id == "worker_registry":
                        is_worker_registry = True
                    elif (
                        isinstance(parent, ast.Attribute)
                        and parent.attr == "worker_registry"
                    ):
                        is_worker_registry = True
                    if is_worker_registry:
                        # Try to read the ``name=`` kwarg OR first positional arg
                        name_val = "<unknown>"
                        for kw in node.keywords:
                            if kw.arg == "name" and isinstance(kw.value, ast.Constant):
                                name_val = str(kw.value.value)
                                break
                        if name_val == "<unknown>" and node.args:
                            first = node.args[0]
                            if isinstance(first, ast.Constant):
                                name_val = str(first.value)
                        out.append((p, node.lineno, name_val))
    return out


# ═══════════════════════════════════════════════════════════════════
# Check 1 — `from server import X` confined to whitelist (bidirectional)
# ═══════════════════════════════════════════════════════════════════

def test_1_from_server_imports_match_whitelist_exactly() -> None:
    """Bidirectional ratchet: every production ``from server import X``
    site must be in ``_WHITELISTED_FROM_SERVER`` AND every whitelisted
    entry must correspond to a real production site.

    Pre-6.3.B baseline (truth-restored): 4 sites — customers.py
    (_resolve_bearer), tracking_providers.py (_tracking_snapshot),
    calculator.py (41 calc-engine constants), content.py (_STATIC_DIR).

    Violation modes detected by this test:
      * silent new coupling (new site appears, whitelist not updated)
      * silent retirement   (whitelisted site vanishes, inventory drift)
      * symbol drift        (site exists but imports a name not in
                              the whitelisted frozen set)
    """
    actual = _from_server_imports()
    actual_by_file: Dict[str, Set[str]] = {}
    for path, _ln, names in actual:
        rel = str(path.relative_to(BACKEND))
        actual_by_file.setdefault(rel, set()).update(names)

    whitelist_by_file: Dict[str, Set[str]] = {
        row[0]: set(row[1]) for row in _WHITELISTED_FROM_SERVER
    }

    # 1a — every actual site must be in the whitelist
    unauthorized_files = set(actual_by_file) - set(whitelist_by_file)
    assert not unauthorized_files, (
        f"[6.3.B] FAIL: unauthorized `from server import X` site(s) "
        f"detected outside whitelist: {sorted(unauthorized_files)}. "
        f"Either retire the import OR add the site to "
        f"_WHITELISTED_FROM_SERVER (with an inventory entry in "
        f"app/core/app_state_targets.py) in the same commit."
    )

    # 1b — every whitelisted site must exist in production
    missing_files = set(whitelist_by_file) - set(actual_by_file)
    assert not missing_files, (
        f"[6.3.B] FAIL: silent retirement — whitelist lists "
        f"{sorted(missing_files)} but production AST has no such "
        f"`from server import X` site. Remove the row from the "
        f"whitelist AND retire the inventory entry."
    )

    # 1c — symbol set drift per file
    for rel, allowed in whitelist_by_file.items():
        live = actual_by_file.get(rel, set())
        unauthorized_symbols = live - allowed
        missing_symbols = allowed - live
        assert not unauthorized_symbols, (
            f"[6.3.B] FAIL: {rel} imports unauthorized symbol(s) "
            f"{sorted(unauthorized_symbols)} from server. Either retire "
            f"OR update the frozenset in _WHITELISTED_FROM_SERVER."
        )
        assert not missing_symbols, (
            f"[6.3.B] FAIL: {rel} no longer imports {sorted(missing_symbols)} "
            f"from server, but whitelist still lists them. Update both "
            f"the whitelist and the inventory entry."
        )


# ═══════════════════════════════════════════════════════════════════
# Check 2 — `import server` allowance for Wave-2 cycle-break pattern
# ═══════════════════════════════════════════════════════════════════

# Phase 6.5+ Wave 3 (LANDING 2026-05-20) — the Wave-2 cycle-break
# ``import server`` allowance for ``app/services/calculator.py`` is
# RETIRED. Wave 3 moved the 2 remaining SERVER_STATE-coupled helpers
# (``_ensure_calculator_seed``, ``_load_calc_config``) to their
# canonical home ``app/services/calculator_config_cache.py``, so
# calculator.py now reaches them directly via
# ``from app.services.calculator_config_cache import …`` at module
# load — zero need for the ``import server`` access pattern.
_IMPORT_SERVER_WAVE_2_ALLOWANCE: frozenset = frozenset()


def test_2_import_server_zero_in_production() -> None:
    """Pre-6.3.B baseline: 0 sites. Phase 6.5+ Wave 2 allowance:
    ``app/services/calculator.py`` (cycle-break pattern — see
    ``_IMPORT_SERVER_WAVE_2_ALLOWANCE``).

    Any other production occurrence is an accidental re-coupling.
    """
    sites = _import_server_sites()
    unauthorized = [
        (str(p.relative_to(BACKEND)), ln)
        for p, ln in sites
        if str(p.relative_to(BACKEND)) not in _IMPORT_SERVER_WAVE_2_ALLOWANCE
    ]
    assert not unauthorized, (
        f"[6.3.B] FAIL: ``import server`` detected in production at "
        f"{unauthorized}. The qualified-name access pattern "
        f"(``server.X``) is forbidden outside tests/ except for the "
        f"Wave-2 cycle-break allowance "
        f"({sorted(_IMPORT_SERVER_WAVE_2_ALLOWANCE)}). "
        f"Convert to ``from server import X`` with a whitelist entry "
        f"OR (preferred) reach the canonical home in ``app/...``."
    )


# ═══════════════════════════════════════════════════════════════════
# Check 3 — All `from app.services.* import …` resolve at module-load
# ═══════════════════════════════════════════════════════════════════

def test_3_app_services_imports_resolve() -> None:
    """For every ``from app.services.X import Y`` site found in
    production AST, the module ``app.services.X`` must
    ``importlib.import_module`` successfully AND every imported name
    ``Y`` must be accessible via ``getattr(mod, Y)``.

    Convention: ``server`` is pre-loaded FIRST to mirror the production
    boot order. Several ``app.services.*`` modules are currently
    co-dependent with ``server`` via inventoried aux-bridges (notably
    ``app.services.calculator`` — 41 CALC_ENGINE_DEP symbols in
    EXTRACTION_AUX_BRIDGES, retirement deferred to Phase 6.5+).
    Pre-loading ``server`` mirrors the production sequence where
    server.py is the boot entry point. The pre-load is itself a
    smoke-check: if server.py won't import cleanly, every downstream
    assertion fails.

    This catches:
      * package-layout breakage  (the module went missing)
      * silent re-export drift   (the symbol was renamed/retired)
      * circular-import latent in production boot order (≠ standalone)
    """
    # Pre-load server first (mirrors production lifespan entry order).
    import server  # noqa: WPS433, F401

    sites = _app_imports("app.services")
    assert sites, "[6.3.B] sanity: expected at least one app.services import in production"
    failures: List[str] = []
    for path, ln, module, names in sites:
        try:
            mod = importlib.import_module(module)
        except Exception as exc:
            failures.append(
                f"  {path.relative_to(BACKEND)}:{ln} "
                f"`from {module} import {names}` — "
                f"module FAILED to import: {type(exc).__name__}: {exc}"
            )
            continue
        for name in names:
            if name == "*":
                continue
            if not hasattr(mod, name):
                failures.append(
                    f"  {path.relative_to(BACKEND)}:{ln} "
                    f"`from {module} import {name}` — "
                    f"module loaded but name '{name}' not exposed"
                )
    assert not failures, (
        "[6.3.B] FAIL: app.services imports do not resolve cleanly:\n"
        + "\n".join(failures)
    )


# ═══════════════════════════════════════════════════════════════════
# Check 4 — All `from app.utils.* import …` resolve at module-load
# ═══════════════════════════════════════════════════════════════════

def test_4_app_utils_imports_resolve() -> None:
    """Same contract as test 3, for the ``app.utils.*`` package tree.
    ``server`` pre-load applies for symmetry (see test 3 docstring).

    Post-6.2.ACTUAL, the relevant entries include:
      * ``from app.utils.shipments import _normalize_stage,
         build_default_stages, JOURNEY_STAGE_TYPES,
         JOURNEY_STAGE_STATUSES, get_current_stage, serialize_journey,
         _smooth_eta_iso, is_valid_movement``
      * ``from app.utils.serialization import …``
      * ``from app.utils.money import …``
    """
    # Pre-load server (same convention as test 3 — production boot order).
    import server  # noqa: WPS433, F401

    sites = _app_imports("app.utils")
    assert sites, "[6.3.B] sanity: expected at least one app.utils import in production"
    failures: List[str] = []
    for path, ln, module, names in sites:
        try:
            mod = importlib.import_module(module)
        except Exception as exc:
            failures.append(
                f"  {path.relative_to(BACKEND)}:{ln} "
                f"`from {module} import {names}` — "
                f"module FAILED to import: {type(exc).__name__}: {exc}"
            )
            continue
        for name in names:
            if name == "*":
                continue
            if not hasattr(mod, name):
                failures.append(
                    f"  {path.relative_to(BACKEND)}:{ln} "
                    f"`from {module} import {name}` — "
                    f"module loaded but name '{name}' not exposed"
                )
    assert not failures, (
        "[6.3.B] FAIL: app.utils imports do not resolve cleanly:\n"
        + "\n".join(failures)
    )


# ═══════════════════════════════════════════════════════════════════
# Check 5 — No `try: from app.services… except ImportError` fallbacks
# ═══════════════════════════════════════════════════════════════════

def test_5_no_try_except_fallback_for_app_services_or_utils() -> None:
    """Silent fallback patterns hide topology drift and prevent the
    AST ratchet from doing its job. Pre-6.3.B baseline: 0 sites.

    Detected pattern shape::

        try:
            from app.services.X import Y     # or app.utils.X
        except ImportError:
            ...
    """
    sites_services = _try_import_fallback_sites("app.services")
    sites_utils = _try_import_fallback_sites("app.utils")
    sites = sites_services + sites_utils
    assert not sites, (
        f"[6.3.B] FAIL: forbidden try/except ImportError fallback(s) "
        f"detected: "
        f"{[(str(p.relative_to(BACKEND)), ln, mod) for p, ln, mod in sites]}. "
        f"Imports of app.services.* and app.utils.* must succeed on "
        f"module-load — silent fallbacks hide topology drift."
    )


# ═══════════════════════════════════════════════════════════════════
# Check 6 — Inventory ↔ live AST coherence
# ═══════════════════════════════════════════════════════════════════

def test_6_inventory_coherence_post_6_2() -> None:
    """Inventory snapshot post-6.2.ACTUAL must hold the following
    invariants. Mirrors the 6.3.A live-runtime composite assertion
    but at the AST/inventory level (no FastAPI app needed).
    """
    from app.core.app_state_targets import (
        BRIDGE_INVENTORY,
        TIER_C_REQUIRES_REFACTOR,
        PHASE_5_5_BOUNDARY,
        QUALIFIED_USAGE_BRIDGES,
        EXTRACTION_AUX_BRIDGES,
    )
    assert len(BRIDGE_INVENTORY) == 1, (
        f"[6.3.B] FAIL: BRIDGE_INVENTORY size = {len(BRIDGE_INVENTORY)}, "
        f"expected exactly 1 (only ``_STATIC_DIR`` Tier-B / Phase 5.8). "
        f"Live: {[b.symbol for b in BRIDGE_INVENTORY]}"
    )
    assert BRIDGE_INVENTORY[0].symbol == "_STATIC_DIR", (
        f"[6.3.B] FAIL: BRIDGE_INVENTORY's single entry should be "
        f"``_STATIC_DIR``, got {BRIDGE_INVENTORY[0].symbol!r}"
    )
    assert len(TIER_C_REQUIRES_REFACTOR) == 0, (
        f"[6.3.B] FAIL: TIER_C_REQUIRES_REFACTOR size = "
        f"{len(TIER_C_REQUIRES_REFACTOR)}, expected 0 "
        f"(disentangling endpoint must hold)"
    )
    assert len(PHASE_5_5_BOUNDARY) == 0, (
        f"[6.3.B] FAIL: PHASE_5_5_BOUNDARY size = "
        f"{len(PHASE_5_5_BOUNDARY)}, expected 0 (Phase 5.5 closed)"
    )
    assert len(QUALIFIED_USAGE_BRIDGES) == 0, (
        f"[6.3.B] FAIL: QUALIFIED_USAGE_BRIDGES size = "
        f"{len(QUALIFIED_USAGE_BRIDGES)}, expected 0 "
        f"(qualified-import cleanup is complete)"
    )
    assert len(EXTRACTION_AUX_BRIDGES) <= 45, (
        f"[6.3.B] FAIL: EXTRACTION_AUX_BRIDGES size = "
        f"{len(EXTRACTION_AUX_BRIDGES)}, expected <= 45 "
        f"(post-6.2.ACTUAL ratchet-down floor). Future shrinkage "
        f"is allowed; growth is forbidden."
    )


def test_6b_inventory_aux_bridges_match_live_from_server_sites() -> None:
    """Cross-check: every symbol in EXTRACTION_AUX_BRIDGES that
    targets server-side (``CUSTOMER_AUTH_DEP``, ``CALC_ENGINE_DEP``,
    ``TRACKING_PROVIDERS_DEP``) must have a corresponding live
    ``from server import X`` site OR be explicitly documented as
    ``consumers_count=0`` (orphan-aux, kept for audit-trail).

    Mirror of test_phase5_4_c5f_consolidation_verdict.test_1's
    inventory ↔ AST symmetry check, applied to the post-6.2.ACTUAL
    state.
    """
    from app.core.app_state_targets import EXTRACTION_AUX_BRIDGES

    aux_symbols = {b.symbol for b in EXTRACTION_AUX_BRIDGES}
    live_symbols: Set[str] = set()
    for _p, _ln, names in _from_server_imports():
        live_symbols.update(names)

    # Subset check: aux ⊇ live (every live import has an aux entry)
    # — but only for symbols that aren't Phase 5.8 boundary entries.
    from app.core.app_state_targets import PHASE_5_8_BOUNDARY
    boundary = set(PHASE_5_8_BOUNDARY)
    live_non_boundary = live_symbols - boundary

    untracked = live_non_boundary - aux_symbols
    assert not untracked, (
        f"[6.3.B] FAIL: live ``from server import`` symbols "
        f"{sorted(untracked)} are not tracked by EXTRACTION_AUX_BRIDGES "
        f"or PHASE_5_8_BOUNDARY — silent new coupling."
    )


# ═══════════════════════════════════════════════════════════════════
# Check 7 — OpenAPI surface freeze
# ═══════════════════════════════════════════════════════════════════

def test_7_openapi_618_paths_679_ops_frozen() -> None:
    """The OpenAPI surface must remain at 618 paths / 679 ops.
    Frozen across every Phase 5 wave + every Phase 6 sub-wave.
    """
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
    assert n_paths == 618, (
        f"[6.3.B] FAIL: OpenAPI paths drifted: {n_paths} != 618"
    )
    assert n_ops == 679, (
        f"[6.3.B] FAIL: OpenAPI ops drifted: {n_ops} != 679"
    )


# ═══════════════════════════════════════════════════════════════════
# Check 8 — Worker registry topology (AST-level, no lifespan needed)
# ═══════════════════════════════════════════════════════════════════

# The 7 critical worker names the 6.3.A live-boot composite expects.
# Source of truth: ``worker_registry.start_all complete — workers:
# [ops_guardian, payment_reminder, resolver_worker, ringostat_cron,
# tracking_worker, transfer_detector, watchlist_live_poll]`` in the
# startup log.
_EXPECTED_CRITICAL_WORKERS: frozenset = frozenset({
    "ops_guardian",
    "payment_reminder",
    "resolver_worker",
    "ringostat_cron",
    "tracking_worker",
    "transfer_detector",
    "watchlist_live_poll",
})


def test_8_worker_registry_topology_seven_critical_workers() -> None:
    """The 7 critical worker names must each appear at least once
    as the ``name=`` kwarg of a ``worker_registry.register(...)``
    AST call-site in production code.

    AST-level check (no FastAPI lifespan required); complements the
    6.3.A live-runtime composite that reports the boot count.
    """
    callsites = _worker_register_callsites()
    registered_names = {name for (_p, _ln, name) in callsites if name != "<unknown>"}
    missing = _EXPECTED_CRITICAL_WORKERS - registered_names
    assert not missing, (
        f"[6.3.B] FAIL: critical worker(s) {sorted(missing)} not found "
        f"in any production ``worker_registry.register(name=...)`` "
        f"AST call-site. Registered (AST): {sorted(registered_names)}"
    )


# ═══════════════════════════════════════════════════════════════════
# Bonus — Live-runtime probe (bridges 6.3.A composite + 6.3.B AST)
# ═══════════════════════════════════════════════════════════════════

def test_9_live_runtime_composite_still_passes() -> None:
    """Cross-link to 6.3.A: the live runtime composite assertion must
    still pass against the FastAPI app after 6.3.B lands. This is the
    "contracts-first" invariant the post-6.1 mandate insisted on —
    AST ratchets MUST NOT break runtime contracts.
    """
    from app.core.architecture_invariants import (
        run_all_phase_5_endpoint_assertions,
    )
    import server  # noqa: WPS433
    run_all_phase_5_endpoint_assertions(fastapi_app=server.fastapi_app)
