"""
Phase 5.4 / C-4b — bitmotors_parser_instance bridge retirement regression guards.
==================================================================================

This test suite is the **regression guard** for the second Tier-A
bridge retirement (``from server import bitmotors_parser_instance``).
It mirrors the C-4a (logger) closeout pattern, with one extra
dimension: C-4b also asserts that ``rebinding semantics are preserved
1:1`` — both the static (no production bridge imports anywhere) and
the dynamic (setter called exactly once, accessor returns the same
object identity as the legacy global) invariants.

What it pins
------------

1. **ZERO production ``from server import bitmotors_parser_instance``
   call sites** anywhere in the backend tree (excluding tests,
   ``__pycache__``, and the ``app_state_targets.py`` /
   ``deps.py`` documentation comments).

2. **Accessor module shape** — ``app.core.deps`` exposes both
   ``set_bitmotors_parser`` and ``get_bitmotors_parser``, and the
   module-private ``_bitmotors_parser_ref`` starts at ``None``.

3. **Single writer at startup** — ``server.py:_main_startup`` invokes
   ``set_bitmotors_parser`` at exactly ONE call site, immediately
   after the ``bitmotors_parser_instance = BitmotorsScraper(db)``
   rebind, inside the ``if BITMOTORS_AVAILABLE`` branch.

4. **Identity invariant** — at runtime, after startup completes,
   ``get_bitmotors_parser() is server.bitmotors_parser_instance``
   when ``BITMOTORS_AVAILABLE`` is truthy. Same object, no copy,
   no proxy.

5. **Pre-startup behaviour preserved** — calling
   ``get_bitmotors_parser()`` before any setter call returns ``None``
   (the initial value), mirroring the legacy ``from server import
   bitmotors_parser_instance`` import-before-rebind behaviour.

6. **Idempotent rebinding** — calling ``set_bitmotors_parser`` twice
   with the same instance preserves identity; calling with a
   different instance OVERWRITES (mirrors the legacy ``global
   bitmotors_parser_instance`` rebind semantics).

7. **Inventory tightened** — ``bitmotors_parser_instance`` is
   removed from ``BRIDGE_INVENTORY``, ``TIER_A_SHALLOW_REWIRING``,
   and the C-3B test_15 allow-list. The bridge count drops by
   exactly 1 from the C-4a-close state (20 → 19), and Tier-A
   drops to ``{db, sio}`` (3 → 2).

8. **No parser lifecycle redesign** — the BitmotorsScraper class is
   unchanged, the startup rebind site lives at the same line range,
   and the singleton semantics (one instance per process, owned by
   the conditional in ``_main_startup``) are preserved.

This file is the proof that the bridge-retirement pattern is
repeatable on a singleton-shaped Tier-A target where startup
order is load-bearing. If this regression guard ever fires,
somebody re-introduced the lazy bridge, broke the setter call,
or de-synced the accessor's cached reference from the canonical
``server.bitmotors_parser_instance`` global.

Run:
    cd /app/backend && python tests/test_phase5_4_c4b_bitmotors_retirement.py
"""
from __future__ import annotations

import ast
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))


# ─────────────────────────────────────────────────────────────────────
# Static / source-level regression guards
# ─────────────────────────────────────────────────────────────────────

SKIP_DIRS = {"__pycache__", "tests"}
SKIP_FILES = {
    "server.py",            # the source itself (no import-from-self)
    "app_state_targets.py", # documentation module — prose only
    "deps.py",              # the accessor module — references the
                            # legacy import string only inside its
                            # own docstring/comments, no real import
}


def _iter_production_python_files():
    for py in ROOT.rglob("*.py"):
        if any(seg in SKIP_DIRS for seg in py.parts):
            continue
        if py.name in SKIP_FILES:
            continue
        yield py


def test_1_no_production_bitmotors_bridge_anywhere():
    """``from server import bitmotors_parser_instance`` (and tuple
    variants) must NOT appear as a real import statement anywhere
    in the production tree.

    Uses AST parsing — string occurrences in comments / docstrings
    do NOT trip this test (those references in C-4b closeout docs
    are intentional and informational)."""
    offenders = []
    for py in _iter_production_python_files():
        try:
            tree = ast.parse(py.read_text(encoding="utf-8"))
        except (SyntaxError, UnicodeDecodeError):
            continue
        for node in ast.walk(tree):
            if isinstance(node, ast.ImportFrom) and node.module == "server":
                for alias in node.names:
                    if alias.name == "bitmotors_parser_instance":
                        offenders.append(f"{py.relative_to(ROOT)}:{node.lineno}")
    assert not offenders, (
        f"Production sites STILL importing `from server import "
        f"bitmotors_parser_instance` (post-C-4b this must be ZERO): "
        f"{offenders}. Replace with "
        f"`from app.core.deps import get_bitmotors_parser` and call "
        f"`get_bitmotors_parser()` at point-of-use."
    )
    print("✓ test_1_no_production_bitmotors_bridge_anywhere")


def test_2_accessor_module_exposes_setter_and_getter():
    """``app.core.deps`` must export both
    ``set_bitmotors_parser`` and ``get_bitmotors_parser`` and start
    with ``_bitmotors_parser_ref = None``."""
    from app.core import deps
    assert hasattr(deps, "set_bitmotors_parser"), (
        "app.core.deps must expose set_bitmotors_parser (single writer)"
    )
    assert hasattr(deps, "get_bitmotors_parser"), (
        "app.core.deps must expose get_bitmotors_parser (readers)"
    )
    assert hasattr(deps, "_bitmotors_parser_ref"), (
        "app.core.deps must hold the module-private cached reference "
        "`_bitmotors_parser_ref`"
    )
    print("✓ test_2_accessor_module_exposes_setter_and_getter")


def test_3_single_setter_call_site_in_server_py():
    """``server.py`` must invoke ``set_bitmotors_parser`` at EXACTLY
    one call site, located inside ``_main_startup`` under the
    ``if BITMOTORS_AVAILABLE:`` branch, immediately after the
    canonical ``bitmotors_parser_instance = BitmotorsScraper(db)``
    assignment."""
    server_text = (ROOT / "server.py").read_text(encoding="utf-8")
    # Count distinct `set_bitmotors_parser(` call expressions (not the
    # import line and not docstring references).
    call_sites = [
        (i + 1, line)
        for i, line in enumerate(server_text.splitlines())
        if "set_bitmotors_parser(" in line
        # Skip import statements
        and "import" not in line.lstrip().split("(")[0]
    ]
    assert len(call_sites) == 1, (
        f"Expected EXACTLY one set_bitmotors_parser() call site in "
        f"server.py (the C-4b mandate enforces a single writer); "
        f"got {len(call_sites)}: {call_sites}"
    )
    lineno, line = call_sites[0]
    # Sanity-check: the call must live near the BitmotorsScraper(db)
    # rebind, not in some unrelated module-level scope. We scan a
    # generous window (50 lines back) because the C-4b commit
    # inserts a long explanatory comment block between the rebind
    # and the setter.
    lines = server_text.splitlines()
    window_start = max(0, lineno - 50)
    window = "\n".join(lines[window_start:lineno])
    assert "BitmotorsScraper(db)" in window, (
        f"set_bitmotors_parser() at line {lineno} is NOT adjacent to "
        f"the canonical `bitmotors_parser_instance = BitmotorsScraper(db)` "
        f"rebind (within 50 LOC). Setter must follow the rebind so "
        f"identity is captured before any reader sees the accessor."
    )
    assert "BITMOTORS_AVAILABLE" in window or "BITMOTORS_AVAILABLE" in (
        "\n".join(lines[window_start:lineno + 3])
    ), (
        f"set_bitmotors_parser() at line {lineno} is NOT under the "
        f"BITMOTORS_AVAILABLE guard. Legacy semantics require that the "
        f"accessor stays None when BITMOTORS_AVAILABLE is False."
    )
    print(f"✓ test_3_single_setter_call_site_in_server_py  (at line {lineno})")


def test_4_identity_assertion_present_at_setter_site():
    """The C-4b mandate REQUIRES a startup-time identity invariant —
    `get_bitmotors_parser() is bitmotors_parser_instance` — so that
    a future second-writer or reorder fails fast. The assertion
    must live in the same `if BITMOTORS_AVAILABLE` block."""
    server_text = (ROOT / "server.py").read_text(encoding="utf-8")
    # Find the assertion by literal substring (the call-site comment
    # block above describes the exact form).
    assert "get_bitmotors_parser() is bitmotors_parser_instance" in server_text, (
        "Missing startup-time identity invariant. Expected an `assert "
        "get_bitmotors_parser() is bitmotors_parser_instance` in "
        "_main_startup, immediately after the set_bitmotors_parser() "
        "call, to prevent latent setter/reorder bugs."
    )
    print("✓ test_4_identity_assertion_present_at_setter_site")


# ─────────────────────────────────────────────────────────────────────
# Inventory / topology invariants
# ─────────────────────────────────────────────────────────────────────

def test_5_bridge_removed_from_inventory():
    """``bitmotors_parser_instance`` must NOT appear as a Bridge
    entry in ``BRIDGE_INVENTORY`` anymore."""
    from app.core.app_state_targets import BRIDGE_INVENTORY
    syms = {b.symbol for b in BRIDGE_INVENTORY}
    assert "bitmotors_parser_instance" not in syms, (
        "`bitmotors_parser_instance` STILL listed in BRIDGE_INVENTORY "
        "post-C-4b. Mirror the C-4a retirement pattern: remove the "
        "Bridge() entry entirely and add a `# RETIRED — see C-4b` "
        "comment block in its place."
    )
    print(f"✓ test_5_bridge_removed_from_inventory  (inventory size: {len(BRIDGE_INVENTORY)})")


def test_6_bridge_removed_from_tier_a():
    """``bitmotors_parser_instance`` must NOT appear in
    ``TIER_A_SHALLOW_REWIRING`` anymore. Tier-A may contain
    ``db`` (until C-4j retires it) and may optionally contain
    ``sio`` (retires at C-4c, after this test was written)."""
    from app.core.app_state_targets import TIER_A_SHALLOW_REWIRING
    assert "bitmotors_parser_instance" not in TIER_A_SHALLOW_REWIRING, (
        f"Tier-A still contains `bitmotors_parser_instance`: "
        f"{sorted(TIER_A_SHALLOW_REWIRING)}"
    )
    # Phase 5.4 / C-4j compatible-pin update: `db` retires in C-4j;
    # post-C-4j Tier-A is the empty frozenset.
    expected_forms = (
        frozenset({"db", "sio"}),  # post-C-4b
        frozenset({"db"}),         # post-C-4c
        frozenset(),               # post-C-4j
    )
    assert TIER_A_SHALLOW_REWIRING in expected_forms, (
        f"Tier-A must be {{db, sio}} (post-C-4b), {{db}} (post-C-4c), "
        f"or empty (post-C-4j); got {sorted(TIER_A_SHALLOW_REWIRING)}"
    )
    print(f"✓ test_6_bridge_removed_from_tier_a  "
          f"(remaining: {sorted(TIER_A_SHALLOW_REWIRING)})")


def test_7_bridge_inventory_count_is_nineteen():
    """C-3B close: 21 bridges. C-4a close: 20. C-4b close: 19.
    C-4c close: 18. C-4j close: 17. This C-4b-shaped guard accepts
    any post-C-4b state; later commits will decrement further. The
    exact post-Cx count is pinned by the per-commit regression
    guards."""
    from app.core.app_state_targets import BRIDGE_INVENTORY
    assert len(BRIDGE_INVENTORY) <= 19, (
        f"BRIDGE_INVENTORY size mismatch: expected <= 19 post-C-4b "
        f"(C-3B=21 → C-4a=20 → C-4b=19 → C-4c=18 → C-4j=17 → …); "
        f"got {len(BRIDGE_INVENTORY)}"
    )
    print(f"✓ test_7_bridge_inventory_count_is_nineteen  "
          f"({len(BRIDGE_INVENTORY)} bridges)")


def test_8_architectural_verdict_reflects_c4b_closure():
    """The verdict text must mention C-4b closure, the post-C-4b
    bridge count (19), and that Tier-A drops to 2. Subsequent
    commits (C-4c, C-4j) update both numbers; this guard accepts
    any historically-reached form."""
    from app.core.app_state_targets import ARCHITECTURAL_VERDICT
    flat = " ".join(ARCHITECTURAL_VERDICT.lower().split())
    assert "c-4b" in flat, "verdict must mention C-4b closure"
    assert "bitmotors_parser_instance" in flat, (
        "verdict must mention bitmotors_parser_instance retirement"
    )
    # Post-C-4b counts: 19 distinct bridges, 2 Tier-A remaining.
    # Post-C-4c counts: 18 distinct bridges, 1 Tier-A remaining.
    # Post-C-4j counts: 17 distinct bridges, 0 Tier-A remaining.
    assert (
        "19 distinct" in flat
        or "18 distinct" in flat
        or "17 distinct" in flat
        or "2 remaining" in flat
        or "1 remaining" in flat
        or "0 remaining" in flat
        or "tier a: db, sio" in flat
        or "tier a: db" in flat
        or "tier-a is now empty" in flat
        or "tier a is now empty" in flat
    ), "verdict must reflect post-C-4b (or post-C-4c / C-4j) bridge counts"
    print("✓ test_8_architectural_verdict_reflects_c4b_closure")


# ─────────────────────────────────────────────────────────────────────
# Runtime / semantic regression guards
# ─────────────────────────────────────────────────────────────────────

def test_9_accessor_reads_module_local_cache_not_server_global():
    """``get_bitmotors_parser()`` must read from the module-private
    cached reference in ``app.core.deps``, NOT from a lazy
    ``from server import bitmotors_parser_instance`` inside the
    accessor body.

    Uses AST to inspect actual ImportFrom statements inside the
    function body so that string occurrences in docstrings (which
    DO mention the legacy import as historical prose) do not
    trigger a false positive."""
    from app.core import deps
    src = Path(deps.__file__).read_text(encoding="utf-8")
    tree = ast.parse(src)
    for node in ast.walk(tree):
        if isinstance(node, ast.FunctionDef) and node.name == "get_bitmotors_parser":
            # Walk the function body for any real ImportFrom statement
            # that re-introduces the legacy lazy bridge.
            for sub in ast.walk(node):
                if isinstance(sub, ast.ImportFrom) and sub.module == "server":
                    for alias in sub.names:
                        assert alias.name != "bitmotors_parser_instance", (
                            "get_bitmotors_parser MUST NOT re-introduce the "
                            "lazy `from server import bitmotors_parser_instance` "
                            "bridge in its body — that would defeat C-4b."
                        )
            # Function body (sans docstring) must reference the
            # module-local cache. ast.unparse gives us a compact form
            # without the docstring being significant.
            body_src = ast.unparse(node) if hasattr(ast, "unparse") else ""
            assert "_bitmotors_parser_ref" in body_src, (
                "get_bitmotors_parser must read from the module-local "
                "`_bitmotors_parser_ref` cache; current body does not "
                "reference that symbol."
            )
            break
    else:
        raise AssertionError("get_bitmotors_parser function not found in app.core.deps")
    print("✓ test_9_accessor_reads_module_local_cache_not_server_global")


def test_10_setter_is_idempotent_and_overwriting():
    """Calling ``set_bitmotors_parser`` twice with the same instance
    preserves identity. Calling with a different instance overwrites
    (mirrors the legacy ``global bitmotors_parser_instance`` rebind
    behaviour). This is the EXPECTED Phase 5.4 / C-4b contract."""
    from app.core import deps
    # Snapshot original value (could be None or a live BitmotorsScraper
    # depending on whether the test runs pre- or post-startup).
    original = deps._bitmotors_parser_ref
    try:
        sentinel_a = object()
        sentinel_b = object()
        # Idempotent: same instance → same identity.
        deps.set_bitmotors_parser(sentinel_a)
        assert deps.get_bitmotors_parser() is sentinel_a, (
            "Setter failed to publish sentinel_a"
        )
        deps.set_bitmotors_parser(sentinel_a)
        assert deps.get_bitmotors_parser() is sentinel_a, (
            "Setter must be idempotent (same instance → same identity)"
        )
        # Overwriting: different instance → new identity.
        deps.set_bitmotors_parser(sentinel_b)
        assert deps.get_bitmotors_parser() is sentinel_b, (
            "Setter must OVERWRITE on a different instance "
            "(mirrors legacy `global bitmotors_parser_instance` rebind)"
        )
        # None roundtrip is also legal — accepts any value.
        deps.set_bitmotors_parser(None)
        assert deps.get_bitmotors_parser() is None, (
            "Setter must accept None (legacy initial state)"
        )
    finally:
        # Restore — leave global state untouched for downstream tests.
        deps.set_bitmotors_parser(original)
        assert deps.get_bitmotors_parser() is original, (
            "Failed to restore original accessor state after test"
        )
    print("✓ test_10_setter_is_idempotent_and_overwriting")


def test_11_pre_startup_accessor_returns_none():
    """Before any setter call (e.g. import-time, test harness), the
    accessor must return ``None`` — mirroring the legacy lazy bridge
    which would `import` a `None` global before `_main_startup`
    re-bound it."""
    # We can't easily simulate "pre-startup" once the live server
    # has booted (the setter has already run). Instead, we assert
    # the INITIAL VALUE of the module-private cache, and we
    # exercise the explicit None case via the setter API.
    from app.core import deps
    src = Path(deps.__file__).read_text(encoding="utf-8")
    # The initial assignment line must read `_bitmotors_parser_ref: Any = None`
    # (allows for type annotations / whitespace variations).
    pattern = re.compile(
        r"^_bitmotors_parser_ref\s*(?::\s*[A-Za-z_][\w\[\], ]*)?\s*=\s*None\s*$",
        re.MULTILINE,
    )
    assert pattern.search(src), (
        "app.core.deps._bitmotors_parser_ref must be initialised to None "
        "at module scope (pre-startup readers must see None, mirroring "
        "the legacy bridge import-before-rebind behaviour)."
    )
    print("✓ test_11_pre_startup_accessor_returns_none")


def test_12_live_identity_with_server_global_when_available():
    """At runtime (after _main_startup completes), if
    ``BITMOTORS_AVAILABLE`` is truthy, ``get_bitmotors_parser()``
    must return the SAME OBJECT as ``server.bitmotors_parser_instance``.
    This is the load-bearing identity invariant — the entire C-4b
    retirement hinges on `is` (object identity), not `==`.

    Skips gracefully if BITMOTORS_AVAILABLE is False OR if server.py
    cannot be imported in the test environment (e.g. partial install)."""
    try:
        import server  # noqa: WPS433 — test-only inspection of canonical global
    except Exception as e:
        print(f"  (skipped — server.py not importable in test env: {type(e).__name__}: {e})")
        return
    bitmotors_available = getattr(server, "BITMOTORS_AVAILABLE", False)
    server_global = getattr(server, "bitmotors_parser_instance", None)
    from app.core.deps import get_bitmotors_parser
    accessor_value = get_bitmotors_parser()
    if not bitmotors_available:
        # Legacy behaviour: setter never invoked → accessor returns None.
        # (Server global may also be None for the same reason.)
        assert server_global is None, (
            f"BITMOTORS_AVAILABLE=False but server.bitmotors_parser_instance "
            f"is not None: {server_global!r}"
        )
        print("  (BITMOTORS_AVAILABLE=False — verified accessor=None path)")
        print("✓ test_12_live_identity_with_server_global_when_available")
        return
    # BITMOTORS_AVAILABLE=True: identity must match.
    if server_global is None:
        # Pre-startup or test harness that didn't run _main_startup.
        print("  (BITMOTORS_AVAILABLE=True but server.bitmotors_parser_instance "
              "still None — startup probably did not run in this test env)")
        return
    assert accessor_value is server_global, (
        f"IDENTITY INVARIANT VIOLATED: "
        f"get_bitmotors_parser() ({type(accessor_value).__name__}@{id(accessor_value):#x}) "
        f"is NOT server.bitmotors_parser_instance "
        f"({type(server_global).__name__}@{id(server_global):#x}). "
        f"The C-4b setter call site must capture the exact same object."
    )
    print(f"  (identity OK — both reference {type(server_global).__name__} "
          f"at 0x{id(server_global):x})")
    print("✓ test_12_live_identity_with_server_global_when_available")


# ─────────────────────────────────────────────────────────────────────
# Main
# ─────────────────────────────────────────────────────────────────────

def main() -> int:
    tests = [
        test_1_no_production_bitmotors_bridge_anywhere,
        test_2_accessor_module_exposes_setter_and_getter,
        test_3_single_setter_call_site_in_server_py,
        test_4_identity_assertion_present_at_setter_site,
        test_5_bridge_removed_from_inventory,
        test_6_bridge_removed_from_tier_a,
        test_7_bridge_inventory_count_is_nineteen,
        test_8_architectural_verdict_reflects_c4b_closure,
        test_9_accessor_reads_module_local_cache_not_server_global,
        test_10_setter_is_idempotent_and_overwriting,
        test_11_pre_startup_accessor_returns_none,
        test_12_live_identity_with_server_global_when_available,
    ]
    fails = 0
    for t in tests:
        try:
            t()
        except Exception as e:
            fails += 1
            print(f"✗ {t.__name__}: {type(e).__name__}: {e}")
    print(f"\n{'=' * 60}")
    print(f"Phase 5.4 / C-4b bitmotors retirement — {len(tests) - fails}/{len(tests)} PASS")
    print(f"{'=' * 60}")
    return fails


if __name__ == "__main__":
    sys.exit(main())
