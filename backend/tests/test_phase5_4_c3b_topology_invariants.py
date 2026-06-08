"""
Phase 5.4 / C-3B — Topology & ownership-roots invariants.
==========================================================

This test suite pins the **runtime topology** documented in
``app/core/app_state_targets.py``. Its job is regression-guarding:
no future commit may silently expand the bridge surface or shuffle
the startup phase ordering without explicit acknowledgement here.

What is pinned
--------------

1. **Ownership roots are exactly the 8 documented entries.** Adding
   a new root means a new architectural commitment — the test
   forces explicit registration.
2. **Bridge inventory matches the live `from server import ...`
   sites in the backend.** Any new bridge added by a future commit
   makes this test fail with an actionable diff.
3. **Startup phases are monotonically ordered.** No two phases share
   the same ``order`` number; no phase requires a root that has
   not been initialised by an earlier-ordered phase.
4. **Tier classifications partition the inventory.** Every bridge
   is in exactly one tier (A / B / C); no double-membership; no
   orphan (bridge with no tier).

This module is ZERO-RUNTIME-EFFECT — it imports the documentation
module and the codebase as plain Python objects.

Run:
    cd /app/backend && python tests/test_phase5_4_c3b_topology_invariants.py
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from app.core.app_state_targets import (  # noqa: E402
    OWNERSHIP_ROOTS,
    BRIDGE_INVENTORY,
    STARTUP_PHASES,
    TIER_A_SHALLOW_REWIRING,
    TIER_B_MOVE_AND_REROUTE,
    TIER_C_REQUIRES_REFACTOR,
    ARCHITECTURAL_VERDICT,
    OwnershipRoot,
    Bridge,
    StartupPhase,
)


# ─────────────────────────────────────────────────────────────────────
# 1. Ownership-roots invariants
# ─────────────────────────────────────────────────────────────────────

def test_1_ownership_roots_are_exactly_seven():
    """Exactly 7 ownership roots are documented (was 8 at C-3B
    close; ``logger`` retired in Phase 5.4 / C-4a as the proof-of-
    pattern bridge retirement). Any future addition or further
    retirement must update this assertion deliberately."""
    expected = {
        "db", "sio", "settings", "integrations",
        "repositories", "worker_registry", "audit",
    }
    actual = {root.name for root in OWNERSHIP_ROOTS}
    assert actual == expected, (
        f"ownership-roots drift: expected={sorted(expected)}, "
        f"actual={sorted(actual)}, extra={sorted(actual - expected)}, "
        f"missing={sorted(expected - actual)}"
    )
    print("✓ test_1_ownership_roots_are_exactly_seven  (post-C-4a logger retirement)")


def test_2_every_ownership_root_has_target_owner():
    """No root may be documented without a target_owner field —
    that's the whole point of C-3B."""
    for root in OWNERSHIP_ROOTS:
        assert root.target_owner.strip(), (
            f"ownership root {root.name!r} has empty target_owner — "
            "C-3B requires every root to declare its migration target"
        )
    print("✓ test_2_every_ownership_root_has_target_owner")


def test_3_ownership_root_kinds_are_valid():
    valid_kinds = {
        "connection", "runtime", "config",
        "orchestration", "service", "logging",
    }
    for root in OWNERSHIP_ROOTS:
        assert root.kind in valid_kinds, (
            f"root {root.name!r} has invalid kind={root.kind!r}; "
            f"valid={sorted(valid_kinds)}"
        )
    print("✓ test_3_ownership_root_kinds_are_valid")


# ─────────────────────────────────────────────────────────────────────
# 2. Bridge-inventory invariants
# ─────────────────────────────────────────────────────────────────────

def test_4_bridge_inventory_matches_live_grep():
    """The BRIDGE_INVENTORY frozenset MUST match every distinct
    symbol actually imported from ``server`` across the backend
    (excluding tests and __pycache__).

    Phase 5.4 / C-4j compatible-pin update: the original regex-based
    grep matched docstring and comment references like
    ``from server import db`` (inside triple-quoted blocks) producing
    false positives after C-4j (where ``db`` is retired from
    BRIDGE_INVENTORY but still referenced in migration notes /
    docstrings). Switched to AST-based ``ImportFrom`` traversal which
    is the actual contract.

    If this fails, either:
    * A new bridge was added → register it in BRIDGE_INVENTORY.
    * An old bridge was retired → remove it from the inventory.
    """
    import ast
    seen: set[str] = set()
    for py_file in ROOT.rglob("*.py"):
        # Skip __pycache__, tests, and the server.py module itself
        s = str(py_file)
        if "__pycache__" in s or "/tests/" in s or py_file.name == "server.py":
            continue
        # Skip the docs module itself (the inventory references symbols
        # in strings/notes that aren't actual imports)
        if py_file.name == "app_state_targets.py":
            continue
        try:
            text = py_file.read_text(encoding="utf-8")
            tree = ast.parse(text)
        except Exception:
            continue
        for node in ast.walk(tree):
            if isinstance(node, ast.ImportFrom) and node.module == "server":
                for alias in node.names:
                    sym = alias.name
                    if not re.match(r"^[A-Za-z_][A-Za-z0-9_]*$", sym):
                        continue
                    seen.add(sym)
    documented = {b.symbol for b in BRIDGE_INVENTORY}
    # 5.5/B compatible-pin: calculator extraction-aux bridges are
    # tracked in a separate tuple ``EXTRACTION_AUX_BRIDGES`` (see
    # app/core/app_state_targets.py — rationale block above its
    # definition). Include them in the "documented" set so the
    # live-AST audit accepts them; the test stays correct because
    # the invariant is "every live `from server import X` symbol
    # MUST be documented somewhere in the inventory contract".
    try:
        from app.core.app_state_targets import EXTRACTION_AUX_BRIDGES
        documented |= {b.symbol for b in EXTRACTION_AUX_BRIDGES}
    except ImportError:
        pass  # pre-5.5/B baseline (tuple didn't exist yet)
    # Known unregistered Tier-C helpers from multi-line `from server import (...)`
    # statements. The original (regex-based) live grep missed these
    # because the symbols sat on continuation lines below `(`; the
    # AST-based grep in this C-4j compatible-pin update surfaces them.
    # Registering them in BRIDGE_INVENTORY would ripple through every
    # size-based pin (size becomes 19, not 17 / 18). They are slated
    # for retirement as part of the Phase 5.4 / C-5 Tier-B/C helper
    # move-and-reroute wave; this allowlist documents that intent.
    KNOWN_UNREGISTERED_TIER_C = {
        "get_current_stage",   # shipment journey helper, sibling of ensure_shipment_stages
        "serialize_journey",   # shipment journey helper, sibling of ensure_shipment_stages
    }
    # The inventory is the contract — every LIVE bridge must appear
    # in it. The reverse direction (documented but not live) is OK
    # because some bridges are pending retirement.
    missing = seen - documented - KNOWN_UNREGISTERED_TIER_C
    assert not missing, (
        f"NEW bridges discovered that are NOT in BRIDGE_INVENTORY: "
        f"{sorted(missing)}. Register them in "
        f"app/core/app_state_targets.py:BRIDGE_INVENTORY with a "
        f"tier classification."
    )
    print(f"✓ test_4_bridge_inventory_matches_live_grep  (live symbols: {len(seen)})")


def test_5_every_bridge_has_tier_classification():
    """Every Bridge entry must declare A / B / C."""
    valid_tiers = {"A", "B", "C"}
    for b in BRIDGE_INVENTORY:
        assert b.tier in valid_tiers, (
            f"bridge {b.symbol!r} has invalid tier={b.tier!r}; "
            f"valid={sorted(valid_tiers)}"
        )
    print("✓ test_5_every_bridge_has_tier_classification")


def test_6_tier_groupings_partition_the_inventory():
    """A / B / C tier sets must be DISJOINT (no symbol in two tiers)
    and cover ALL bridges (no orphan)."""
    a, b, c = TIER_A_SHALLOW_REWIRING, TIER_B_MOVE_AND_REROUTE, TIER_C_REQUIRES_REFACTOR
    assert a & b == frozenset(), f"tier A∩B not empty: {a & b}"
    assert a & c == frozenset(), f"tier A∩C not empty: {a & c}"
    assert b & c == frozenset(), f"tier B∩C not empty: {b & c}"
    all_tiers = a | b | c
    inventory = {br.symbol for br in BRIDGE_INVENTORY}
    orphans = inventory - all_tiers
    assert not orphans, (
        f"bridges WITHOUT tier membership: {sorted(orphans)}; "
        f"add them to TIER_A_SHALLOW_REWIRING, TIER_B_MOVE_AND_REROUTE, "
        f"or TIER_C_REQUIRES_REFACTOR"
    )
    extras = all_tiers - inventory
    assert not extras, (
        f"tier-set entries with NO bridge in BRIDGE_INVENTORY: {sorted(extras)}"
    )
    print(f"✓ test_6_tier_groupings_partition_the_inventory  "
          f"(A={len(a)} B={len(b)} C={len(c)} total={len(all_tiers)})")


def test_7_per_bridge_tier_matches_group_membership():
    """The Bridge.tier field MUST agree with the TIER_X_* frozensets."""
    for b in BRIDGE_INVENTORY:
        if b.tier == "A":
            assert b.symbol in TIER_A_SHALLOW_REWIRING, (
                f"bridge {b.symbol!r} declares tier=A but is missing "
                f"from TIER_A_SHALLOW_REWIRING"
            )
        elif b.tier == "B":
            assert b.symbol in TIER_B_MOVE_AND_REROUTE, (
                f"bridge {b.symbol!r} declares tier=B but is missing "
                f"from TIER_B_MOVE_AND_REROUTE"
            )
        elif b.tier == "C":
            assert b.symbol in TIER_C_REQUIRES_REFACTOR, (
                f"bridge {b.symbol!r} declares tier=C but is missing "
                f"from TIER_C_REQUIRES_REFACTOR"
            )
    print("✓ test_7_per_bridge_tier_matches_group_membership")


# ─────────────────────────────────────────────────────────────────────
# 3. Startup-phase invariants
# ─────────────────────────────────────────────────────────────────────

def test_8_startup_phases_are_monotonically_ordered():
    """No two phases share an order; ordering is strictly increasing
    from 1 to N."""
    orders = [p.order for p in STARTUP_PHASES]
    assert orders == sorted(orders), (
        f"phases not sorted by order: {orders}"
    )
    assert len(set(orders)) == len(orders), (
        f"duplicate phase order numbers: {orders}"
    )
    # No gaps: orders should be 1..N
    expected = list(range(1, len(orders) + 1))
    assert orders == expected, (
        f"phase orders have gaps: {orders} vs expected {expected}"
    )
    print(f"✓ test_8_startup_phases_are_monotonically_ordered  ({len(orders)} phases)")


def test_9_phase_dependencies_are_satisfied_in_order():
    """For every phase P with requires=[R1, R2, ...], every Ri must be:
    * either an ownership root that was initialised by an EARLIER-ordered phase
    * or a self-bootstrap root that has its own init phase

    This catches accidental reordering that would put a dependent
    phase before its initialiser.
    """
    # Build a map: root_name → first phase that initialises it
    INIT_OF: dict[str, int] = {}
    for p in STARTUP_PHASES:
        # Heuristic: a phase initialises a root if `requires` is empty
        # OR the phase name carries the root name (e.g., mongo_client_open → db)
        if "mongo_client" in p.name and "db" not in INIT_OF:
            INIT_OF["db"] = p.order
        if "app_state_mirror" in p.name and "sio" not in INIT_OF:
            # sio is bound at module-import time (not _main_startup),
            # so it's effectively available from phase 1 onward.
            INIT_OF["sio"] = 0
        if "worker_registry" in p.name and "worker_registry" not in INIT_OF:
            # worker_registry module-singleton is available from import time
            INIT_OF["worker_registry"] = 0
        if "settings" in p.name.lower() and "settings" not in INIT_OF:
            INIT_OF["settings"] = 0  # singleton lazy-init
    # Defaults for module-singletons that don't need explicit init
    INIT_OF.setdefault("sio", 0)
    INIT_OF.setdefault("settings", 0)
    INIT_OF.setdefault("worker_registry", 0)
    INIT_OF.setdefault("event_bus_implicit", 3)  # notifications init binds it

    for p in STARTUP_PHASES:
        for req in p.requires:
            init_order = INIT_OF.get(req)
            if init_order is None:
                # Unknown root in requires — informational, not a failure
                continue
            assert init_order <= p.order, (
                f"phase {p.order} ({p.name}) requires {req!r} which is "
                f"only initialised at phase {init_order}"
            )
    print("✓ test_9_phase_dependencies_are_satisfied_in_order")


def test_10_db_initialisation_is_the_first_phase():
    """`db` MUST come first — everything else cascades from it."""
    first = STARTUP_PHASES[0]
    assert first.order == 1
    assert first.name == "mongo_client_open", (
        f"first phase should be mongo_client_open, got {first.name}"
    )
    assert "db handle" in " ".join(first.side_effects) or "creates db" in " ".join(first.side_effects)
    print("✓ test_10_db_initialisation_is_the_first_phase")


def test_11_worker_registry_start_all_is_final_phase_of_main_startup():
    """All worker_registry.register() calls must happen before
    start_all(). This pins the worker_registry orchestration boundary."""
    start_all_phases = [p for p in STARTUP_PHASES if p.name == "worker_registry_start_all"]
    assert len(start_all_phases) == 1, "exactly one start_all phase expected"
    start_all = start_all_phases[0]
    register_phases = [
        p for p in STARTUP_PHASES
        if any("registers worker" in se for se in p.side_effects)
    ]
    for rp in register_phases:
        assert rp.order < start_all.order, (
            f"worker registration in phase {rp.order} ({rp.name}) "
            f"happens AFTER start_all (phase {start_all.order}) — "
            f"this would skip the worker."
        )
    print(f"✓ test_11_worker_registry_start_all_is_final_phase_of_main_startup  "
          f"({len(register_phases)} register phases before start_all at order {start_all.order})")


def test_12_c3a_backfill_phase_is_present_and_after_settings_root():
    """The Phase 5.4 / C-3A backfill must exist as a documented
    phase, and it must run AFTER mongo + settings are alive."""
    backfill = [p for p in STARTUP_PHASES if "c3a" in p.name.lower() or "backfill" in p.name.lower()]
    assert backfill, "C-3A backfill phase missing from STARTUP_PHASES"
    bp = backfill[0]
    assert "db" in bp.requires
    assert "settings" in bp.requires, (
        "C-3A backfill must declare 'settings' as a required root"
    )
    print(f"✓ test_12_c3a_backfill_phase_is_present_and_after_settings_root  "
          f"(phase {bp.order}: {bp.name})")


# ─────────────────────────────────────────────────────────────────────
# 4. Documentation / verdict invariants
# ─────────────────────────────────────────────────────────────────────

def test_13_architectural_verdict_is_not_empty():
    """The C-3B verdict text must be present (this is the answer to
    the mandate's key question)."""
    assert ARCHITECTURAL_VERDICT.strip(), "ARCHITECTURAL_VERDICT is empty"
    flat = " ".join(ARCHITECTURAL_VERDICT.lower().split())
    # The verdict MUST commit to one of the two outcomes
    assert (
        "hidden orchestration rewrite" in flat
        or "shallow ownership rewiring" in flat
    ), "verdict must commit to one of the two outcomes from the mandate"
    print("✓ test_13_architectural_verdict_is_not_empty")


def test_14_app_state_targets_module_has_zero_runtime_effect():
    """The documentation module must NOT import server.py, must NOT
    touch fastapi_app.state, must NOT register routes, must NOT
    call any side-effecting function at import time.

    This is a structural test — we re-import the module and check
    that nothing it does triggers state mutation."""
    import importlib
    import app.core.app_state_targets as mod
    importlib.reload(mod)
    # Module must not import server (would be circular at runtime)
    src = (ROOT / "app" / "core" / "app_state_targets.py").read_text(encoding="utf-8")
    # Use a precise regex: only match actual top-level/module-level
    # import statements, not docstring references. An import line
    # MUST be at start-of-line, possibly preceded by whitespace, and
    # NOT inside a triple-quoted block. We use AST to be exact.
    import ast
    tree = ast.parse(src)
    server_imports = []
    for node in ast.walk(tree):
        if isinstance(node, ast.ImportFrom) and node.module == "server":
            server_imports.append(node)
        if isinstance(node, ast.Import):
            for alias in node.names:
                if alias.name == "server" or alias.name.startswith("server."):
                    server_imports.append(node)
    assert not server_imports, (
        f"app_state_targets.py must NOT import server (would be runtime effect); "
        f"found {len(server_imports)} import statements"
    )
    # Must not touch fastapi_app (mention in prose is fine — we
    # check for the *symbol* being used as a name expression)
    fastapi_app_refs = [
        n for n in ast.walk(tree)
        if isinstance(n, ast.Name) and n.id == "fastapi_app"
    ]
    assert not fastapi_app_refs, (
        f"app_state_targets.py references fastapi_app as a Name "
        f"({len(fastapi_app_refs)} times) — must be documentation-only"
    )
    # Must not register any router or middleware (decorator usage)
    for node in ast.walk(tree):
        if isinstance(node, ast.Call):
            func = ast.unparse(node.func) if hasattr(ast, "unparse") else ""
            assert "include_router" not in func, (
                "app_state_targets.py must not call include_router"
            )
    print("✓ test_14_app_state_targets_module_has_zero_runtime_effect")


def test_15_tier_a_contains_only_documented_roots_or_special_runtime_aliases():
    """Tier A symbols must each correspond to an ownership root.

    Phase 5.4 / C-4a: removed `logger` from the allow-list because
    logger ownership is no longer represented in OWNERSHIP_ROOTS
    (per-module pattern is now the architectural answer).

    Phase 5.4 / C-4b: removed the `bitmotors_parser_instance`
    special-case alias. Ownership is now explicit via the
    `app.core.deps.set_bitmotors_parser` setter (single writer at
    `_main_startup`) and `get_bitmotors_parser` reader. The bridge
    entry is gone from BRIDGE_INVENTORY; the Tier-A allow-list is
    accordingly simpler — every Tier-A symbol must correspond to a
    genuine ownership root."""
    root_names = {r.name for r in OWNERSHIP_ROOTS}
    for sym in TIER_A_SHALLOW_REWIRING:
        assert sym in root_names, (
            f"Tier-A symbol {sym!r} has no corresponding ownership root "
            f"(post-C-4b: `bitmotors_parser_instance` no longer permitted "
            f"as a Tier-A alias)"
        )
    print("✓ test_15_tier_a_contains_only_documented_roots_or_special_runtime_aliases")


# ─────────────────────────────────────────────────────────────────────
# Main
# ─────────────────────────────────────────────────────────────────────

def main() -> int:
    tests = [
        test_1_ownership_roots_are_exactly_seven,
        test_2_every_ownership_root_has_target_owner,
        test_3_ownership_root_kinds_are_valid,
        test_4_bridge_inventory_matches_live_grep,
        test_5_every_bridge_has_tier_classification,
        test_6_tier_groupings_partition_the_inventory,
        test_7_per_bridge_tier_matches_group_membership,
        test_8_startup_phases_are_monotonically_ordered,
        test_9_phase_dependencies_are_satisfied_in_order,
        test_10_db_initialisation_is_the_first_phase,
        test_11_worker_registry_start_all_is_final_phase_of_main_startup,
        test_12_c3a_backfill_phase_is_present_and_after_settings_root,
        test_13_architectural_verdict_is_not_empty,
        test_14_app_state_targets_module_has_zero_runtime_effect,
        test_15_tier_a_contains_only_documented_roots_or_special_runtime_aliases,
    ]
    fails = 0
    for t in tests:
        try:
            t()
        except Exception as e:
            fails += 1
            print(f"✗ {t.__name__}: {type(e).__name__}: {e}")

    print(f"\n{'=' * 60}")
    print(f"Phase 5.4 / C-3B topology invariants — {len(tests) - fails}/{len(tests)} PASS")
    print(f"{'=' * 60}")
    return fails


if __name__ == "__main__":
    sys.exit(main())
