"""
Phase 5.4 / C-5b — Aggregator runtime accessor extraction.
==========================================================

C-5b is **execution** — the ``aggregator`` Bridge entry has been
retired by routing all live readers through the dedicated
``app.core.aggregator_runtime`` accessor module (mirror of C-4b
``bitmotors_parser_instance`` and C-4c ``sio``).

This suite asserts:

  1. AST: no PRODUCTION ``from server import aggregator``.
  2. Canonical accessor resolves: ``app.core.aggregator_runtime``
     module exposes ``set_aggregator``, ``get_aggregator``,
     ``clear_aggregator_for_tests``.
  3. Identity invariant — ``get_aggregator() is server.aggregator``
     post-module-load (the canonical singleton has been published).
  4. Setter is idempotent — calling ``set_aggregator(x)`` then
     ``set_aggregator(x)`` keeps identity.
  5. Pre-load semantics — ``clear_aggregator_for_tests()`` reverts
     to ``None``; ``set_aggregator(instance)`` rebinds; identity
     restored in try/finally.
  6. admin_cache delegates to ``get_aggregator()`` (no
     ``from server import aggregator``); ``_aggregator()`` helper
     returns the canonical singleton.
  7. Bridge inventory delta landed: BRIDGE_INVENTORY 15 → 14.
  8. ``aggregator`` removed from TIER_B_INVENTORY (5 → 4) and
     from TIER_B_MOVE_AND_REROUTE (3 → 2).
  9. ``C5B_RETIRED_SYMBOLS`` constant lists exactly ``aggregator``.
 10. Module-load identity assertion in server.py runs successfully
     (any split-brain causes module-import-time AssertionError).
 11. OpenAPI 618/679 unchanged (no route surface touched).
 12. Workers 7/7 still registered (no startup ordering regression).
 13. Pre-C-5b micro-audit invariants — ``AggregatorService.__init__``
     captures only ``session_service``; class body has no db/sio
     refs; the singleton has no internal runtime handles.

Run:
    cd /app/backend && python tests/test_phase5_4_c5b_aggregator_runtime.py
"""
from __future__ import annotations

import ast
import inspect
import os
import sys
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")
os.environ.setdefault("DB_NAME", "test_database")


SKIP_DIRS = {"__pycache__"}
# Compat-pin update (Phase 5.4 / C-5c): retiring `audit` from
# BRIDGE_INVENTORY (14→13), TIER_B_INVENTORY (4→3), and
# TIER_B_MOVE_AND_REROUTE (2→1) is allowed per the C-5
# "compat-pin updates in prior C-3B/C-4/C-5 test suites" rule
# (see C5_FORBIDDEN_CHANGES docstring). These constants track
# the LIVE inventory state, not the POST-C5B historical snapshot.
EXPECTED_BRIDGE_COUNT_POST_C5B = {1, 2, 3, 6, 7, 8, 10, 11, 13, 14}            # 14 fresh post-C-5b, 13 post-C-5c, 11 post-C-5e, 10 post-5.5/C, 8 post-5.5/D, 7 post-5.5/E, 6 post-5.5/F2, 3 post-5.5/G, 2 post-5.5/H, 1 post-5.5/I
EXPECTED_TIER_B_INVENTORY_POST_C5B = {1, 3, 4}           # 4 fresh, 3 post-C-5c, 1 post-C-5e
EXPECTED_TIER_B_MOVE_AND_REROUTE_POST_C5B = 1            # was 2 pre-C-5c (frozen at 1 from C-5c onward)
EXPECTED_OPENAPI_PATHS = 618
EXPECTED_OPENAPI_OPS = 679


def _classify(rel_path: str) -> str:
    if rel_path.startswith("tests/") or "/tests/" in rel_path:
        return "test_suite"
    if rel_path.startswith("test_") and "/" not in rel_path:
        return "legacy_root_test"
    return "production"


def _ast_grep_from_server() -> dict:
    """Return ``{symbol: [(file, line, classification), …]}`` for
    every ``from server import …`` site."""
    sites = defaultdict(list)
    for py in ROOT.rglob("*.py"):
        if any(s in SKIP_DIRS for s in py.parts):
            continue
        rel = str(py.relative_to(ROOT))
        cls = _classify(rel)
        try:
            text = py.read_text(encoding="utf-8")
            tree = ast.parse(text)
        except Exception:
            continue
        for node in ast.walk(tree):
            if isinstance(node, ast.ImportFrom) and node.module == "server":
                for alias in node.names:
                    sites[alias.name].append((rel, node.lineno, cls))
    return sites


# ─────────────────────────────────────────────────────────────────────
# 1) No production `from server import aggregator`
# ─────────────────────────────────────────────────────────────────────

def test_1_no_production_aggregator_import():
    sites = _ast_grep_from_server()
    prod_sites = [
        f"{f}:{l}" for (f, l, cls) in sites.get("aggregator", [])
        if cls == "production"
    ]
    assert not prod_sites, (
        f"[C-5b] FAIL: production `from server import aggregator` "
        f"still present at: {prod_sites}"
    )
    print(f"✓ test_1_no_production_aggregator_import  "
          f"(0 production sites; total sites = {len(sites.get('aggregator', []))})")


# ─────────────────────────────────────────────────────────────────────
# 2) Canonical accessor resolves
# ─────────────────────────────────────────────────────────────────────

def test_2_canonical_accessor_resolves():
    from app.core import aggregator_runtime
    for name in ("set_aggregator", "get_aggregator", "clear_aggregator_for_tests"):
        assert hasattr(aggregator_runtime, name), (
            f"[C-5b] FAIL: app.core.aggregator_runtime missing `{name}`"
        )
        assert callable(getattr(aggregator_runtime, name)), (
            f"[C-5b] FAIL: app.core.aggregator_runtime.{name} not callable"
        )
    print("✓ test_2_canonical_accessor_resolves  "
          "(set/get/clear all callable)")


# ─────────────────────────────────────────────────────────────────────
# 3) Identity invariant — get_aggregator() is server.aggregator
# ─────────────────────────────────────────────────────────────────────

def test_3_identity_invariant_post_module_load():
    import server
    from app.core.aggregator_runtime import get_aggregator
    live = get_aggregator()
    assert live is not None, (
        "[C-5b] FAIL: get_aggregator() is None post-import — "
        "the module-load setter call in server.py was skipped"
    )
    assert live is server.aggregator, (
        f"[C-5b] FAIL: identity split-brain — "
        f"get_aggregator() = {id(live)}, "
        f"server.aggregator = {id(server.aggregator)}"
    )
    print(f"✓ test_3_identity_invariant_post_module_load  "
          f"(get_aggregator() is server.aggregator @ {id(live):#x})")


# ─────────────────────────────────────────────────────────────────────
# 4) Setter is idempotent
# ─────────────────────────────────────────────────────────────────────

def test_4_setter_idempotent():
    import server
    from app.core.aggregator_runtime import (
        set_aggregator, get_aggregator,
    )
    original = get_aggregator()
    assert original is server.aggregator
    # Calling set_aggregator with the same instance keeps identity
    set_aggregator(original)
    set_aggregator(original)
    assert get_aggregator() is original
    print("✓ test_4_setter_idempotent  (same instance, identity preserved)")


# ─────────────────────────────────────────────────────────────────────
# 5) Pre-load semantics — clear_aggregator_for_tests reverts to None
# ─────────────────────────────────────────────────────────────────────

def test_5_pre_load_semantics():
    from app.core.aggregator_runtime import (
        set_aggregator, get_aggregator,
        clear_aggregator_for_tests,
    )
    original = get_aggregator()
    assert original is not None
    try:
        clear_aggregator_for_tests()
        assert get_aggregator() is None, (
            "[C-5b] FAIL: clear_aggregator_for_tests() did not revert "
            "the cached reference to None"
        )
        # Rebind a sentinel and verify
        class _Sentinel:
            pass
        sentinel = _Sentinel()
        set_aggregator(sentinel)
        assert get_aggregator() is sentinel
    finally:
        # ALWAYS restore — every other test in this suite (and beyond)
        # assumes the canonical singleton is published.
        set_aggregator(original)
    assert get_aggregator() is original, (
        "[C-5b] FAIL: post-restore identity drift"
    )
    print("✓ test_5_pre_load_semantics  "
          "(clear→None, set→sentinel, restore→canonical)")


# ─────────────────────────────────────────────────────────────────────
# 6) admin_cache delegates to get_aggregator()
# ─────────────────────────────────────────────────────────────────────

def test_6_admin_cache_uses_accessor():
    import app.routers.admin_cache as admin_cache_module
    src_path = Path(admin_cache_module.__file__)
    tree = ast.parse(src_path.read_text(encoding="utf-8"))
    # AST-grep all `from X import …` statements
    from_imports = [
        (node.module, [a.name for a in node.names])
        for node in ast.walk(tree)
        if isinstance(node, ast.ImportFrom)
    ]
    # MUST NOT have a real `from server import aggregator` (docstring
    # references to that string are fine — we use AST not substring)
    for mod, names in from_imports:
        assert not (mod == "server" and "aggregator" in names), (
            f"[C-5b] FAIL: admin_cache.py still has a real "
            f"`from server import aggregator` ImportFrom node"
        )
    # MUST have `from app.core.aggregator_runtime import get_aggregator`
    has_canonical = any(
        mod == "app.core.aggregator_runtime" and "get_aggregator" in names
        for mod, names in from_imports
    )
    assert has_canonical, (
        "[C-5b] FAIL: admin_cache.py missing canonical accessor import "
        "(`from app.core.aggregator_runtime import get_aggregator`)"
    )
    # The _aggregator() helper exists and returns the canonical singleton
    import server
    from app.routers.admin_cache import _aggregator
    assert _aggregator() is server.aggregator, (
        "[C-5b] FAIL: admin_cache._aggregator() identity drift"
    )
    print("✓ test_6_admin_cache_uses_accessor  "
          "(AST: no server import; canonical singleton resolved)")


# ─────────────────────────────────────────────────────────────────────
# 7) Bridge inventory delta landed (15 → 14)
# ─────────────────────────────────────────────────────────────────────

def test_7_bridge_inventory_delta_landed():
    from app.core.app_state_targets import BRIDGE_INVENTORY
    assert len(BRIDGE_INVENTORY) in EXPECTED_BRIDGE_COUNT_POST_C5B, (
        f"[C-5b] FAIL: BRIDGE_INVENTORY size = "
        f"{len(BRIDGE_INVENTORY)}, expected one of "
        f"{sorted(EXPECTED_BRIDGE_COUNT_POST_C5B)} "
        f"(14 fresh post-C-5b, 13 post-C-5c, 11 post-C-5e)."
    )
    bridge_syms = {b.symbol for b in BRIDGE_INVENTORY}
    assert "aggregator" not in bridge_syms, (
        "[C-5b] FAIL: retired symbol `aggregator` still in "
        "BRIDGE_INVENTORY"
    )
    print(f"✓ test_7_bridge_inventory_delta_landed  "
          f"(15→{len(BRIDGE_INVENTORY)})")


# ─────────────────────────────────────────────────────────────────────
# 8) Tier-B inventory + TIER_B_MOVE_AND_REROUTE shrunk
# ─────────────────────────────────────────────────────────────────────

def test_8_tier_b_surfaces_shrunk():
    from app.core.app_state_targets import (
        TIER_B_INVENTORY, TIER_B_MOVE_AND_REROUTE,
    )
    assert len(TIER_B_INVENTORY) in EXPECTED_TIER_B_INVENTORY_POST_C5B, (
        f"[C-5b] FAIL: TIER_B_INVENTORY size = "
        f"{len(TIER_B_INVENTORY)}, expected one of "
        f"{sorted(EXPECTED_TIER_B_INVENTORY_POST_C5B)} "
        f"(4 fresh post-C-5b, 3 post-C-5c, 1 post-C-5e)."
    )
    tier_b_syms = {t.symbol for t in TIER_B_INVENTORY}
    assert "aggregator" not in tier_b_syms, (
        "[C-5b] FAIL: retired `aggregator` still in TIER_B_INVENTORY"
    )
    assert len(TIER_B_MOVE_AND_REROUTE) == EXPECTED_TIER_B_MOVE_AND_REROUTE_POST_C5B, (
        f"[C-5b] FAIL: TIER_B_MOVE_AND_REROUTE size = "
        f"{len(TIER_B_MOVE_AND_REROUTE)}, expected "
        f"{EXPECTED_TIER_B_MOVE_AND_REROUTE_POST_C5B}."
    )
    assert TIER_B_MOVE_AND_REROUTE == frozenset({"_STATIC_DIR"}), (
        f"[C-5b] FAIL: TIER_B_MOVE_AND_REROUTE composition: "
        f"got {sorted(TIER_B_MOVE_AND_REROUTE)}, "
        f"expected {{'_STATIC_DIR'}} (post-C-5c compat-pin update — "
        f"`audit` retired in C-5c)"
    )
    print(f"✓ test_8_tier_b_surfaces_shrunk  "
          f"(TIER_B_INVENTORY: 5→{len(TIER_B_INVENTORY)}; "
          f"TIER_B_MOVE_AND_REROUTE: {sorted(TIER_B_MOVE_AND_REROUTE)})")


# ─────────────────────────────────────────────────────────────────────
# 9) C5B_RETIRED_SYMBOLS constant
# ─────────────────────────────────────────────────────────────────────

def test_9_c5b_retired_symbols_constant():
    from app.core.app_state_targets import C5B_RETIRED_SYMBOLS
    assert set(C5B_RETIRED_SYMBOLS) == {"aggregator"}, (
        f"[C-5b] FAIL: C5B_RETIRED_SYMBOLS = "
        f"{sorted(C5B_RETIRED_SYMBOLS)}, expected {{'aggregator'}}"
    )
    print(f"✓ test_9_c5b_retired_symbols_constant  "
          f"({len(C5B_RETIRED_SYMBOLS)} retired)")


# ─────────────────────────────────────────────────────────────────────
# 10) Module-load identity assertion runs successfully
# ─────────────────────────────────────────────────────────────────────

def test_10_server_module_load_assertion_runs():
    """The identity assertion at server.py:1250-ish line block runs at
    module-load time. If a split-brain were introduced (e.g. someone
    reordered set_aggregator(aggregator) to BEFORE the actual
    construction), `import server` would raise AssertionError before
    any test could run.  By the time this test executes, the server
    module has been imported (other tests already used it), so the
    assertion already passed. Verify post-load state matches what the
    assertion would check."""
    import server
    from app.core.aggregator_runtime import get_aggregator
    assert get_aggregator() is server.aggregator, (
        "[C-5b] FAIL: the module-load identity assertion's "
        "post-state is broken — get_aggregator() and server.aggregator "
        "diverged."
    )
    # Also: the source code of server.py must contain the assertion
    # itself (regression guard against accidental deletion).
    src = Path(server.__file__).read_text(encoding="utf-8")
    assert "_c5b_get_aggregator() is aggregator" in src, (
        "[C-5b] FAIL: module-load identity assertion missing from "
        "server.py"
    )
    print("✓ test_10_server_module_load_assertion_runs  "
          "(assertion present + post-state consistent)")


# ─────────────────────────────────────────────────────────────────────
# 11) OpenAPI 618/679 unchanged
# ─────────────────────────────────────────────────────────────────────

def test_11_openapi_route_freeze():
    from fastapi.testclient import TestClient
    import server
    fastapi_app = getattr(server, "fastapi_app", None) or getattr(server, "app", None)
    assert fastapi_app is not None, "[C-5b] FAIL: cannot resolve FastAPI instance"
    client = TestClient(fastapi_app)
    r = client.get("/api/openapi.json")
    assert r.status_code == 200, f"[C-5b] FAIL: openapi HTTP {r.status_code}"
    data = r.json()
    paths = data.get("paths", {})
    n_paths = len(paths)
    n_ops = sum(
        len([k for k in v if k in ("get", "post", "put", "patch", "delete", "head", "options")])
        for v in paths.values()
    )
    assert n_paths == EXPECTED_OPENAPI_PATHS and n_ops == EXPECTED_OPENAPI_OPS, (
        f"[C-5b] FAIL: OpenAPI surface drifted. expected "
        f"{EXPECTED_OPENAPI_PATHS}/{EXPECTED_OPENAPI_OPS}, got "
        f"{n_paths}/{n_ops}"
    )
    print(f"✓ test_11_openapi_route_freeze  ({n_paths}/{n_ops})")


# ─────────────────────────────────────────────────────────────────────
# 12) Workers 7/7 still register
# ─────────────────────────────────────────────────────────────────────

def test_12_worker_registry_unchanged():
    """Workers are registered inside ``_main_startup`` (lifespan
    startup hook). Use TestClient as a context manager to trigger
    the startup → registration → ``worker_registry.start_all`` chain.
    After C-5b's setter publication, the worker count must remain 7."""
    from fastapi.testclient import TestClient
    import server
    from app.core.worker_registry import worker_registry
    fastapi_app = getattr(server, "fastapi_app", None) or getattr(server, "app", None)
    assert fastapi_app is not None
    with TestClient(fastapi_app) as _client:
        names = sorted(worker_registry.names())
    assert len(names) == 7, (
        f"[C-5b] FAIL: worker count = {len(names)}, expected 7. "
        f"Registered: {names}"
    )
    expected = {
        "ops_guardian", "payment_reminder", "resolver_worker",
        "ringostat_cron", "tracking_worker", "transfer_detector",
        "watchlist_live_poll",
    }
    actual = set(names)
    assert actual == expected, (
        f"[C-5b] FAIL: worker name set drift. "
        f"got {sorted(actual)}, expected {sorted(expected)}"
    )
    print(f"✓ test_12_worker_registry_unchanged  "
          f"(7/7 workers: {names})")


# ─────────────────────────────────────────────────────────────────────
# 13) Micro-audit invariants — AggregatorService topology
# ─────────────────────────────────────────────────────────────────────

def test_13_micro_audit_topology():
    """Per the C-5b mandate correction (`mandatory inventory
    micro-audit of aggregator construction topology`), assert the
    5 audit findings programmatically so any future drift fails
    the test:

      Q1. AggregatorService.__init__ has exactly 2 params (self,
          session_service) — no db, no sio.
      Q3. AggregatorService class body has no top-level reference
          to `db`, `sio`, `integration_configs`, `db_runtime`,
          `socket_runtime`.
      Q5. AggregatorService instance has no `.db`, `.sio`,
          `.integration_configs` attributes."""
    import server
    cls = type(server.aggregator)
    # Q1 — __init__ signature
    sig = inspect.signature(cls.__init__)
    params = list(sig.parameters)
    assert params == ["self", "session_service"], (
        f"[C-5b] FAIL: AggregatorService.__init__ signature drifted: "
        f"got {params}, expected ['self', 'session_service']"
    )
    # Q3 — class source body free of runtime handle refs
    src = inspect.getsource(cls)
    forbidden = ("self.db", "self.sio", "self.integration_configs",
                  "import db_runtime", "import socket_runtime")
    for fb in forbidden:
        assert fb not in src, (
            f"[C-5b] FAIL: AggregatorService body now references "
            f"`{fb}` — hidden runtime ownership chain introduced. "
            f"This breaks the C-5b micro-audit invariant."
        )
    # Q5 — instance attributes don't include runtime handles
    inst = server.aggregator
    for handle in ("db", "sio", "integration_configs"):
        assert not hasattr(inst, handle), (
            f"[C-5b] FAIL: server.aggregator now has attribute "
            f"`{handle}` — runtime capture introduced post-C-5b."
        )
    print("✓ test_13_micro_audit_topology  "
          "(__init__ pure, body clean, instance clean)")


# ─────────────────────────────────────────────────────────────────────
# Runner
# ─────────────────────────────────────────────────────────────────────

def _run_all():
    tests = [
        test_1_no_production_aggregator_import,
        test_2_canonical_accessor_resolves,
        test_3_identity_invariant_post_module_load,
        test_4_setter_idempotent,
        test_5_pre_load_semantics,
        test_6_admin_cache_uses_accessor,
        test_7_bridge_inventory_delta_landed,
        test_8_tier_b_surfaces_shrunk,
        test_9_c5b_retired_symbols_constant,
        test_10_server_module_load_assertion_runs,
        test_11_openapi_route_freeze,
        test_12_worker_registry_unchanged,
        test_13_micro_audit_topology,
    ]
    failed = 0
    for t in tests:
        try:
            t()
        except AssertionError as e:
            failed += 1
            print(f"✗ {t.__name__}\n   {e}")
        except Exception as e:
            failed += 1
            print(f"✗ {t.__name__}  UNEXPECTED ERROR\n   {type(e).__name__}: {e}")
    print()
    print("=" * 60)
    print(
        f"Phase 5.4 / C-5b aggregator runtime accessor extraction — "
        f"{len(tests) - failed}/{len(tests)} "
        f"{'PASS' if failed == 0 else 'FAIL'}"
    )
    print("=" * 60)
    return 0 if failed == 0 else 1


if __name__ == "__main__":
    sys.exit(_run_all())
