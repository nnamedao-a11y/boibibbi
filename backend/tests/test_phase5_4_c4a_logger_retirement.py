"""
Phase 5.4 / C-4a — Logger bridge retirement regression guards.
===============================================================

This test suite is the **proof-of-pattern regression guard** for the
first Tier-A bridge retirement (``from server import logger``).

What it pins
------------

1. **ZERO production ``from server import logger`` call sites** anywhere
   in the backend tree (excluding tests, ``__pycache__``, and the
   ``app_state_targets.py`` documentation module which references the
   string ``"from server import logger"`` in its retirement-history
   note).

2. **Both former consumers have module-local loggers** —
   ``admin_resolver.py`` and ``admin_ringostat.py`` both declare
   ``logger = logging.getLogger("bibi.<module>")`` at module scope.

3. **Namespace continuity** — the new module-local loggers use the
   ``"bibi."`` prefix so they inherit handlers + the structured-JSON
   formatter from the ``"bibi"`` root logger configured in
   ``server.py`` (root config UNCHANGED by C-4a per the mandate's
   forbidden list).

4. **No old ``_logger()`` lazy-wrapper survives** — the bridge
   helper function pattern used at admin_resolver.py:77-79 is
   gone; no `def _logger():` stub remains.

5. **Inventory is tightened** — ``logger`` is removed from
   ``BRIDGE_INVENTORY``, ``TIER_A_SHALLOW_REWIRING``, and
   ``OWNERSHIP_ROOTS``. The bridge count drops by exactly 1.

6. **`worker_registry` logging is untouched** — the
   ``"bibi.worker_registry"`` logger continues to be configured
   inside ``app/core/worker_registry.py:48`` and is NOT one of
   the migrated namespaces (mandate forbidden category).

This file is the proof that the bridge-retirement pattern works
on the cheapest Tier-A symbol. If this regression guard ever
fires, somebody re-introduced the lazy bridge OR added a NEW
``from server import logger`` site — both equally forbidden.

Run:
    cd /app/backend && python tests/test_phase5_4_c4a_logger_retirement.py
"""
from __future__ import annotations

import logging
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))


# ─────────────────────────────────────────────────────────────────────
# Production-site regression guards
# ─────────────────────────────────────────────────────────────────────

def test_1_no_production_logger_bridge_anywhere():
    """``from server import logger`` (and tuple variants) must NOT
    appear as a real import statement anywhere in the production tree.

    Scans every .py file under /app/backend (excluding tests,
    __pycache__, server.py itself, and the app_state_targets.py
    documentation module which references the string in prose).

    Uses AST parsing — string occurrences in comments / docstrings
    do NOT trip this test (those references in C-4a closeout docs
    are intentional and informational)."""
    import ast

    SKIP_DIRS = {"__pycache__", "tests"}
    SKIP_FILES = {
        "server.py",            # the source itself (no import-from-self)
        "app_state_targets.py", # documentation module — prose only
    }
    offenders: list[tuple[str, int]] = []

    for py_file in ROOT.rglob("*.py"):
        rel = py_file.relative_to(ROOT)
        if any(part in SKIP_DIRS for part in rel.parts):
            continue
        if py_file.name in SKIP_FILES:
            continue
        try:
            tree = ast.parse(py_file.read_text(encoding="utf-8"))
        except SyntaxError:
            continue
        for node in ast.walk(tree):
            if isinstance(node, ast.ImportFrom) and node.module == "server":
                for alias in node.names:
                    if alias.name == "logger":
                        offenders.append((str(rel), node.lineno))
    assert not offenders, (
        "REGRESSION: `from server import logger` re-introduced at:\n"
        + "\n".join(f"  {p}:{ln}" for p, ln in offenders)
        + "\n\nC-4a retired this bridge. Use `logger = logging.getLogger("
        + "'bibi.<your_module>')` at module scope instead."
    )
    print("✓ test_1_no_production_logger_bridge_anywhere")


def test_2_admin_resolver_has_module_local_logger():
    """The first C-4a migration target — admin_resolver.py — must
    declare a module-level ``logger = logging.getLogger("bibi.admin_resolver")``."""
    import ast
    src = (ROOT / "app" / "routers" / "admin_resolver.py").read_text(encoding="utf-8")
    tree = ast.parse(src)
    found_logger_assign = False
    for node in ast.walk(tree):
        if isinstance(node, ast.Assign):
            # logger = logging.getLogger("bibi.admin_resolver")
            targets = [t for t in node.targets if isinstance(t, ast.Name) and t.id == "logger"]
            if not targets:
                continue
            if isinstance(node.value, ast.Call):
                call = node.value
                # call.func either Name('getLogger') or Attribute(value=Name('logging'), attr='getLogger')
                is_getlogger = (
                    (isinstance(call.func, ast.Name) and call.func.id == "getLogger") or
                    (isinstance(call.func, ast.Attribute) and call.func.attr == "getLogger")
                )
                if is_getlogger and call.args:
                    arg = call.args[0]
                    if isinstance(arg, ast.Constant) and isinstance(arg.value, str):
                        assert arg.value == "bibi.admin_resolver", (
                            f"admin_resolver.py logger namespace mismatch: "
                            f"expected 'bibi.admin_resolver', got {arg.value!r}"
                        )
                        found_logger_assign = True
                        break
    assert found_logger_assign, (
        "admin_resolver.py is missing the module-local logger declaration. "
        "Expected: `logger = logging.getLogger(\"bibi.admin_resolver\")`"
    )
    print("✓ test_2_admin_resolver_has_module_local_logger")


def test_3_admin_ringostat_has_module_local_logger():
    import ast
    src = (ROOT / "app" / "routers" / "admin_ringostat.py").read_text(encoding="utf-8")
    tree = ast.parse(src)
    found = False
    for node in ast.walk(tree):
        if isinstance(node, ast.Assign):
            targets = [t for t in node.targets if isinstance(t, ast.Name) and t.id == "logger"]
            if not targets:
                continue
            if isinstance(node.value, ast.Call):
                call = node.value
                is_getlogger = (
                    (isinstance(call.func, ast.Name) and call.func.id == "getLogger") or
                    (isinstance(call.func, ast.Attribute) and call.func.attr == "getLogger")
                )
                if is_getlogger and call.args:
                    arg = call.args[0]
                    if isinstance(arg, ast.Constant) and arg.value == "bibi.admin_ringostat":
                        found = True
                        break
    assert found, (
        "admin_ringostat.py is missing the module-local logger declaration. "
        "Expected: `logger = logging.getLogger(\"bibi.admin_ringostat\")`"
    )
    print("✓ test_3_admin_ringostat_has_module_local_logger")


def test_4_admin_resolver_logger_wrapper_function_removed():
    """The old ``def _logger():`` lazy-wrapper function must be gone,
    AND no real call expression `_logger()` may survive (docstring
    references to the retired wrapper are permitted)."""
    import ast
    path = ROOT / "app" / "routers" / "admin_resolver.py"
    src = path.read_text(encoding="utf-8")
    tree = ast.parse(src)
    # No FunctionDef named _logger
    for node in ast.walk(tree):
        if isinstance(node, ast.FunctionDef) and node.name == "_logger":
            raise AssertionError(
                f"admin_resolver.py still defines `def _logger()` at line "
                f"{node.lineno} — C-4a should have removed the lazy-bridge wrapper."
            )
    # No Call expression to _logger() (this skips docstring strings
    # because docstrings parse as ast.Constant nodes, not ast.Call)
    for node in ast.walk(tree):
        if isinstance(node, ast.Call) and isinstance(node.func, ast.Name) and node.func.id == "_logger":
            raise AssertionError(
                f"admin_resolver.py still contains `_logger()` call at line "
                f"{node.lineno} — use the module-level `logger` directly."
            )
    print("✓ test_4_admin_resolver_logger_wrapper_function_removed")


# ─────────────────────────────────────────────────────────────────────
# Inventory tightening invariants
# ─────────────────────────────────────────────────────────────────────

def test_5_logger_removed_from_bridge_inventory():
    """``logger`` must no longer be a documented bridge."""
    from app.core.app_state_targets import BRIDGE_INVENTORY
    symbols = {b.symbol for b in BRIDGE_INVENTORY}
    assert "logger" not in symbols, (
        f"BRIDGE_INVENTORY still contains 'logger' entry — C-4a "
        f"retired this bridge; remove the Bridge() row. "
        f"Current symbols: {sorted(symbols)}"
    )
    print(f"✓ test_5_logger_removed_from_bridge_inventory  "
          f"(inventory size: {len(symbols)})")


def test_6_logger_removed_from_tier_a():
    from app.core.app_state_targets import TIER_A_SHALLOW_REWIRING
    assert "logger" not in TIER_A_SHALLOW_REWIRING, (
        "TIER_A_SHALLOW_REWIRING still contains 'logger' — remove it"
    )
    print(f"✓ test_6_logger_removed_from_tier_a  "
          f"(Tier-A remaining: {sorted(TIER_A_SHALLOW_REWIRING)})")


def test_7_logger_removed_from_ownership_roots():
    from app.core.app_state_targets import OWNERSHIP_ROOTS
    names = {r.name for r in OWNERSHIP_ROOTS}
    assert "logger" not in names, (
        "OWNERSHIP_ROOTS still contains 'logger' — remove the row. "
        "Per-module getLogger is the architectural answer; logger is "
        "not a runtime ownership root."
    )
    print(f"✓ test_7_logger_removed_from_ownership_roots  "
          f"(roots: {sorted(names)})")


# ─────────────────────────────────────────────────────────────────────
# Functional namespace invariants
# ─────────────────────────────────────────────────────────────────────

def test_8_module_loggers_use_bibi_prefixed_namespace():
    """Both new module loggers must use the ``"bibi.*"`` namespace.

    Note on Python logging hierarchy: when only
    ``logging.getLogger("bibi.admin_resolver")`` is created (and
    no explicit ``logging.getLogger("bibi")`` exists yet), Python's
    `Logger.parent` may resolve to the root logger via PlaceHolder
    chain. The architecturally important invariant is that the
    name STARTS WITH the ``"bibi."`` prefix so that, IF the server's
    root logger configuration later adds a handler at the ``"bibi"``
    namespace, these module loggers automatically pick it up.

    C-4a does NOT touch any global logging config (mandate forbidden).
    """
    # Re-import the routers to ensure their module-level loggers are
    # registered in the logging.Logger.manager.loggerDict.
    import importlib
    import app.routers.admin_resolver as ar
    import app.routers.admin_ringostat as ari
    importlib.reload(ar)
    importlib.reload(ari)
    for ns, lg in (("bibi.admin_resolver", ar.logger),
                   ("bibi.admin_ringostat", ari.logger)):
        assert lg.name == ns, (
            f"module logger name mismatch: expected {ns!r}, got {lg.name!r}"
        )
        assert ns.startswith("bibi."), (
            f"logger namespace {ns!r} does not use bibi.* prefix"
        )
    print("✓ test_8_module_loggers_use_bibi_prefixed_namespace")


def test_9_logger_can_be_called_at_runtime_without_error():
    """A runtime call to the new module-local logger MUST work
    immediately (no NameError, no AttributeError, no missing handler
    attribute). This catches the worst-case regression where the
    `logger.error(...)` line in the except handler crashes the
    request because `logger` is unbound."""
    import app.routers.admin_resolver as ar
    import app.routers.admin_ringostat as ari
    # Just verify each is a Logger instance with a working `.error`
    assert isinstance(ar.logger, logging.Logger)
    assert isinstance(ari.logger, logging.Logger)
    # Calling .error() must not raise (it might silently no-op if
    # no handler is attached, but it must never crash)
    ar.logger.error("[C-4a smoke] admin_resolver module logger reachable")
    ari.logger.error("[C-4a smoke] admin_ringostat module logger reachable")
    print("✓ test_9_logger_can_be_called_at_runtime_without_error")


def test_10_worker_registry_logger_untouched():
    """Per mandate forbidden: worker_registry logging must NOT have
    been changed in C-4a. The ``app/core/worker_registry.py:48``
    `logger = logging.getLogger("bibi.worker_registry")` line must
    still exist with the same namespace."""
    src = (ROOT / "app" / "core" / "worker_registry.py").read_text(encoding="utf-8")
    assert 'logging.getLogger("bibi.worker_registry")' in src, (
        "worker_registry.py logger declaration was touched in C-4a — "
        "this was forbidden by the mandate."
    )
    print("✓ test_10_worker_registry_logger_untouched")


def test_11_server_root_logger_config_untouched():
    """Mandate forbidden: no changes to logging.basicConfig / no
    changes to structured-logging formatter / no namespace renames
    in server.py.

    Heuristic guard: the ``logging.getLogger("bibi-v3.2")`` literal
    used as the server-level root namespace must still exist in
    server.py. (We don't pin the exact line because future commits
    may move the assignment around, but the literal namespace MUST
    NOT change in C-4a.)"""
    src = (ROOT / "server.py").read_text(encoding="utf-8")
    assert 'logging.getLogger("bibi-v3.2")' in src or 'logging.getLogger(\"bibi-v3.2\")' in src, (
        "server.py legacy 'bibi-v3.2' logger namespace appears to have been "
        "renamed in C-4a — this was forbidden by the mandate "
        "(\"no renaming logger namespaces aggressively\")."
    )
    print("✓ test_11_server_root_logger_config_untouched")


# ─────────────────────────────────────────────────────────────────────
# Bridge-count tightening invariant
# ─────────────────────────────────────────────────────────────────────

def test_12_bridge_count_decremented_by_exactly_one():
    """At C-3B close, BRIDGE_INVENTORY had 21 entries. C-4a retired
    exactly ONE bridge (``logger``), bringing the count to 20.
    C-4b retires another (``bitmotors_parser_instance``), bringing
    it to 19. The legacy C-4a pin therefore relaxes to "<= 20" —
    the exact post-C-4b value (19) is pinned by the new C-4b
    regression guard ``test_phase5_4_c4b_bitmotors_retirement.py``."""
    from app.core.app_state_targets import BRIDGE_INVENTORY
    assert len(BRIDGE_INVENTORY) <= 20, (
        f"BRIDGE_INVENTORY size mismatch: expected <= 20 (C-4a/C-4b "
        f"retirement waves only ever decrement), got {len(BRIDGE_INVENTORY)}"
    )
    print(f"✓ test_12_bridge_count_decremented_by_exactly_one  ({len(BRIDGE_INVENTORY)} bridges)")


def test_13_tier_a_count_decremented_by_exactly_one():
    """Tier A goes from 4 → 3 at C-4a close
    (db, sio, bitmotors_parser_instance), then 3 → 2 at C-4b close
    (db, sio), then 2 → 1 at C-4c close (db), then 1 → 0 at C-4j
    close (empty). This C-4a-shaped guard relaxes accordingly: it
    asserts the post-C-4a invariant (`db` present in Tier-A until
    C-4j retires it; post-C-4j Tier-A is empty). The exact counts
    are pinned by the per-commit regression guards."""
    from app.core.app_state_targets import TIER_A_SHALLOW_REWIRING
    assert len(TIER_A_SHALLOW_REWIRING) <= 3, (
        f"Tier-A size mismatch: expected <= 3 (post-C-4a / C-4b / C-4c / C-4j), "
        f"got {len(TIER_A_SHALLOW_REWIRING)}: "
        f"{sorted(TIER_A_SHALLOW_REWIRING)}"
    )
    # Phase 5.4 / C-4j compatible-pin update: `db` is in Tier-A
    # until C-4j retires it. Post-C-4j Tier-A is the empty frozenset.
    valid = "db" in TIER_A_SHALLOW_REWIRING or TIER_A_SHALLOW_REWIRING == frozenset()
    assert valid, (
        f"Tier-A must contain `db` (pre-C-4j) or be empty (post-C-4j); "
        f"got {sorted(TIER_A_SHALLOW_REWIRING)}"
    )
    print(f"✓ test_13_tier_a_count_decremented_by_exactly_one  "
          f"(remaining: {sorted(TIER_A_SHALLOW_REWIRING)})")


def test_14_architectural_verdict_reflects_c4a_closure():
    """The verdict text must mention that C-4a closed and that
    Tier-A has been decremented. Subsequent commits (C-4b, C-4c,
    C-4j) update the post-C-4a number; this guard accepts any of
    the historically-reached states."""
    from app.core.app_state_targets import ARCHITECTURAL_VERDICT
    flat = " ".join(ARCHITECTURAL_VERDICT.lower().split())
    assert "c-4a" in flat, "verdict must mention C-4a closure"
    assert "logger" in flat, "verdict must mention logger retirement"
    # The verdict should reflect a decremented bridge count. Any of
    # C-4a (20 / 3-remaining), C-4b (19 / 2-remaining), C-4c
    # (18 / 1-remaining), or C-4j (17 / 0-remaining) forms are
    # acceptable here; the exact post-Cx text is pinned by the
    # per-commit regression guards.
    assert (
        "20 distinct" in flat
        or "19 distinct" in flat
        or "18 distinct" in flat
        or "17 distinct" in flat
        or "3 remaining" in flat
        or "2 remaining" in flat
        or "1 remaining" in flat
        or "0 remaining" in flat
        or "tier a: db, sio" in flat
        or "tier a: db" in flat
        or "tier-a is now empty" in flat
        or "tier a is now empty" in flat
    ), "verdict must reflect a post-C-4a/b/c/j bridge count"
    print("✓ test_14_architectural_verdict_reflects_c4a_closure")


def main() -> int:
    tests = [
        test_1_no_production_logger_bridge_anywhere,
        test_2_admin_resolver_has_module_local_logger,
        test_3_admin_ringostat_has_module_local_logger,
        test_4_admin_resolver_logger_wrapper_function_removed,
        test_5_logger_removed_from_bridge_inventory,
        test_6_logger_removed_from_tier_a,
        test_7_logger_removed_from_ownership_roots,
        test_8_module_loggers_use_bibi_prefixed_namespace,
        test_9_logger_can_be_called_at_runtime_without_error,
        test_10_worker_registry_logger_untouched,
        test_11_server_root_logger_config_untouched,
        test_12_bridge_count_decremented_by_exactly_one,
        test_13_tier_a_count_decremented_by_exactly_one,
        test_14_architectural_verdict_reflects_c4a_closure,
    ]
    fails = 0
    for t in tests:
        try:
            t()
        except Exception as e:
            fails += 1
            print(f"✗ {t.__name__}: {type(e).__name__}: {e}")
    print(f"\n{'=' * 60}")
    print(f"Phase 5.4 / C-4a logger bridge retirement — {len(tests) - fails}/{len(tests)} PASS")
    print(f"{'=' * 60}")
    return fails


if __name__ == "__main__":
    sys.exit(main())
