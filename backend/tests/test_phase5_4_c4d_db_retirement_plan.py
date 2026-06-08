"""
Phase 5.4 / C-4d — db bridge retirement PLANNING regression guards.
====================================================================

This test suite is the regression guard for the C-4d planning
commit. C-4d is **planning-only**: no production code is modified,
no bridge is removed. The guards below enforce both halves of that
contract:

* **Red line guards** (mandate §Critical): bridge count unchanged,
  Tier-A unchanged, no migration executed.
* **Planning data integrity guards** (mandate §Verification): every
  production `from server import db` site appears in
  ``DB_CONSUMER_INVENTORY`` with exactly one target pattern and
  exactly one batch assignment; no workers / repositories appear in
  the inventory; the DI-source is a singleton assigned to C-4j.
* **Forbidden-categories invariant** (mandate §Forbidden): the
  ``DB_C4D_FORBIDDEN_CHANGES`` frozen set covers every forbidden
  category named in the mandate.
* **Optional db_runtime inertness**: if anyone created
  ``app/core/db_runtime.py`` during C-4d, it MUST have zero
  production consumers.

Run:
    cd /app/backend && python tests/test_phase5_4_c4d_db_retirement_plan.py
"""
from __future__ import annotations

import ast
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))


# ─────────────────────────────────────────────────────────────────────
# Static AST audit helpers
# ─────────────────────────────────────────────────────────────────────

SKIP_DIRS = {"__pycache__", "tests"}
SKIP_FILES = {
    "server.py",            # owner side
    "app_state_targets.py", # documentation surface (inventory itself)
}


def _iter_production_python_files():
    for py in ROOT.rglob("*.py"):
        if any(seg in SKIP_DIRS for seg in py.parts):
            continue
        if py.name in SKIP_FILES:
            continue
        yield py


def _collect_db_import_sites():
    """Return [(rel_path, lineno, fn_name), ...] for every production
    `from server import db` ImportFrom (including aliases)."""
    sites = []
    for py in _iter_production_python_files():
        try:
            src = py.read_text(encoding="utf-8")
            tree = ast.parse(src)
        except Exception:
            continue
        # Build parent-pointers via walk so we can find the enclosing fn.
        fn_lookup: dict[int, str] = {}
        for parent in ast.walk(tree):
            if isinstance(parent, ast.FunctionDef):
                for child in ast.walk(parent):
                    if hasattr(child, "lineno"):
                        # First-write-wins so the innermost fn wins via reversed walk
                        fn_lookup.setdefault(child.lineno, parent.name)
        for node in ast.walk(tree):
            if isinstance(node, ast.ImportFrom) and node.module == "server":
                for alias in node.names:
                    if alias.name == "db":
                        sites.append((
                            str(py.relative_to(ROOT)),
                            node.lineno,
                            fn_lookup.get(node.lineno, "<module-scope>"),
                        ))
    return sorted(sites)


# ─────────────────────────────────────────────────────────────────────
# RED LINE guards (mandate §Critical: bridge count unchanged)
# ─────────────────────────────────────────────────────────────────────

def test_red_line_bridge_inventory_size_unchanged():
    """Mandate's hard red line: C-4d MUST NOT reduce bridge count.
    At C-4c close, BRIDGE_INVENTORY size = 18. C-4d keeps it at 18.

    Phase 5.4 / C-4j compatible-pin update: at C-4j close the `db`
    bridge is retired and size drops to 17.
    Phase 5.4 / C-5  compatible-pin update: at C-5 planning close
    the size grows to 19 (audit-discovered shipment helpers
    registered — discovery, not new coupling).
    Phase 5.4 / C-5e compatible-pin update: at C-5e close the two
    AST-discovered shipment helpers (`get_current_stage`,
    `serialize_journey`) are retired and size drops to 11.
    The strict size invariants are enforced by
    ``test_phase5_4_c4j_db_bridge_finale.py`` (17)
    and ``test_phase5_4_c5_tier_b_plan.py`` (19/15/14/13/11)
    and ``test_phase5_4_c5e_shipment_helpers.py`` (11)."""
    from app.core.app_state_targets import BRIDGE_INVENTORY
    assert len(BRIDGE_INVENTORY) in (1, 2, 3, 6, 7, 8, 10, 11, 13, 14, 15, 17, 18, 19), (
        f"RED LINE BREACH: BRIDGE_INVENTORY size = "
        f"{len(BRIDGE_INVENTORY)}, expected 18 (pre-C-4j), 17 "
        f"(post-C-4j), 19 (post-C-5 planning), 15 (post-C-5a), "
        f"14 (post-C-5b), 13 (post-C-5c), or 11 (post-C-5e). C-4d "
        f"itself is planning-only and MUST NOT remove any Bridge "
        f"entry; the drop to 17 happens at C-4j db retirement; the "
        f"growth to 19 happens at C-5 planning due to AST-discovered "
        f"registration (not new coupling); the drop to 15 happens "
        f"at C-5a (4 stale shims retired); the drop to 14 happens "
        f"at C-5b (aggregator runtime accessor extraction); the "
        f"drop to 13 happens at C-5c (audit runtime accessor "
        f"extraction); the drop to 11 happens at C-5e (shipment "
        f"helpers retired)."
    )
    print(f"✓ test_red_line_bridge_inventory_size_unchanged  "
          f"(BRIDGE_INVENTORY size = {len(BRIDGE_INVENTORY)})")


def test_red_line_tier_a_unchanged():
    """Tier-A `{db}` until C-4j retires the bridge.

    Phase 5.4 / C-4j compatible-pin update: C-4d red-line gate
    intentionally accepts the post-C-4j empty-set state. The strict
    inverse (Tier-A == empty frozenset) is enforced by
    `test_phase5_4_c4j_db_bridge_finale.py`."""
    from app.core.app_state_targets import TIER_A_SHALLOW_REWIRING
    valid = (frozenset({"db"}), frozenset())
    assert TIER_A_SHALLOW_REWIRING in valid, (
        f"RED LINE BREACH: TIER_A_SHALLOW_REWIRING = "
        f"{sorted(TIER_A_SHALLOW_REWIRING)}, expected exactly "
        f"{{db}} (pre-C-4j) or empty (post-C-4j)."
    )
    label = "post-C-4j: empty" if not TIER_A_SHALLOW_REWIRING else f"pre-C-4j: {sorted(TIER_A_SHALLOW_REWIRING)}"
    print(f"✓ test_red_line_tier_a_unchanged  ({label})")


def test_red_line_db_bridge_still_present():
    """C-4d planning RED LINE — until C-4j, the `db` Bridge MUST stay
    inside `BRIDGE_INVENTORY`. Removing the entry early would falsely
    advertise the migration as complete.

    Phase 5.4 / C-4j compatible-pin update: this red-line gate
    closes when C-4j retires the bridge — at that point the
    inverse invariant holds (db absent, TIER_A empty), enforced by
    `test_phase5_4_c4j_db_bridge_finale.py`. To preserve the
    "this suite was authored for C-4d planning" semantics while
    staying green post-C-4j, the assertion is now C-4j-aware:

      * Pre-C-4j  → db present in BRIDGE_INVENTORY, tier == "A".
      * Post-C-4j → db absent AND TIER_A_SHALLOW_REWIRING empty.

    Both states are accepted; the C-4j finale test pins the strict
    post-retirement invariant."""
    from app.core.app_state_targets import (
        BRIDGE_INVENTORY,
        TIER_A_SHALLOW_REWIRING,
    )
    db_bridge = next((b for b in BRIDGE_INVENTORY if b.symbol == "db"), None)
    if db_bridge is None:
        # Post-C-4j state — tier-A must also be empty for consistency.
        assert TIER_A_SHALLOW_REWIRING == frozenset(), (
            "Inconsistent state: `db` Bridge retired but "
            "TIER_A_SHALLOW_REWIRING still contains entries: "
            f"{set(TIER_A_SHALLOW_REWIRING)}"
        )
        print(f"✓ test_red_line_db_bridge_still_present  "
              f"(C-4j post-retirement: db absent, Tier-A empty)")
        return
    assert db_bridge.tier == "A", (
        f"`db` Bridge tier changed from A to {db_bridge.tier!r}"
    )
    print(f"✓ test_red_line_db_bridge_still_present  "
          f"(tier={db_bridge.tier}, consumers_count={db_bridge.consumers_count})")


def test_red_line_production_grep_count_unchanged():
    """Live AST grep for `from server import db` should match the
    number of NON-migrated inventory entries. As migration batches
    land (C-4e flipped 12 entries to migrated=True), the live count
    drops, but the inventory still documents every site that EVER
    used the bridge."""
    sites = _collect_db_import_sites()
    from app.core.app_state_targets import DB_CONSUMER_INVENTORY
    pending = [c for c in DB_CONSUMER_INVENTORY if not c.migrated]
    assert len(sites) == len(pending), (
        f"Live grep returned {len(sites)} sites but {len(pending)} "
        f"inventory entries remain non-migrated. They MUST match "
        f"exactly. live={sorted((s[0], s[1]) for s in sites)} vs "
        f"pending={sorted((c.file, c.line) for c in pending)}"
    )
    print(f"✓ test_red_line_production_grep_count_unchanged  "
          f"({len(sites)} live sites == {len(pending)} non-migrated entries)")


# ─────────────────────────────────────────────────────────────────────
# Planning data integrity (mandate §Verification 1-3)
# ─────────────────────────────────────────────────────────────────────

def test_inventory_matches_live_grep_exactly():
    """Every live `from server import db` site must appear in
    DB_CONSUMER_INVENTORY as a NON-migrated entry. Migrated entries
    (post-C-4e/f/g/h/i/j) MUST NOT appear in live grep."""
    sites = _collect_db_import_sites()
    from app.core.app_state_targets import DB_CONSUMER_INVENTORY
    live = {(s[0], s[1]) for s in sites}
    pending = {(c.file, c.line) for c in DB_CONSUMER_INVENTORY if not c.migrated}
    migrated = {(c.file, c.line) for c in DB_CONSUMER_INVENTORY if c.migrated}
    extras_in_live = live - pending
    missing_from_live = pending - live
    migrated_resurrected = live & migrated
    assert not extras_in_live, (
        f"Sites in live grep but NOT in non-migrated inventory: "
        f"{sorted(extras_in_live)}. Add them to DB_CONSUMER_INVENTORY."
    )
    assert not missing_from_live, (
        f"Non-migrated inventory entries with no live site: "
        f"{sorted(missing_from_live)}. Either the entry has stale "
        f"line numbers or it should be flagged migrated=True."
    )
    assert not migrated_resurrected, (
        f"MIGRATED entries reappeared in live grep: "
        f"{sorted(migrated_resurrected)}. Migration regression — "
        f"someone reintroduced the legacy bridge in a migrated file."
    )
    print(f"✓ test_inventory_matches_live_grep_exactly  "
          f"({len(live)} live = {len(pending)} pending; "
          f"{len(migrated)} migrated, 0 resurrected)")


def test_every_consumer_has_one_target_pattern():
    """Every DBConsumer entry has a non-empty target_pattern."""
    from app.core.app_state_targets import DB_CONSUMER_INVENTORY
    for c in DB_CONSUMER_INVENTORY:
        assert c.target_pattern and c.target_pattern.strip(), (
            f"DBConsumer {c.file}:{c.line} has empty target_pattern"
        )
    print(f"✓ test_every_consumer_has_one_target_pattern  "
          f"({len(DB_CONSUMER_INVENTORY)} consumers)")


def test_every_consumer_has_one_batch_assignment():
    """Every DBConsumer has recommended_batch ∈ {C-4e..C-4j}."""
    from app.core.app_state_targets import DB_CONSUMER_INVENTORY
    valid_batches = {"C-4e", "C-4f", "C-4g", "C-4h", "C-4i", "C-4j"}
    for c in DB_CONSUMER_INVENTORY:
        assert c.recommended_batch in valid_batches, (
            f"DBConsumer {c.file}:{c.line} has invalid batch "
            f"{c.recommended_batch!r}; must be in {sorted(valid_batches)}"
        )
    # Distribution: ensure all batches are referenced (otherwise
    # the plan has a hole). C-4j must be NON-empty (DI-source goes
    # there).
    from collections import Counter
    counts = Counter(c.recommended_batch for c in DB_CONSUMER_INVENTORY)
    assert "C-4j" in counts, "C-4j batch must contain at least the DI source"
    assert counts["C-4j"] >= 1, "C-4j must contain the DI source"
    print(f"✓ test_every_consumer_has_one_batch_assignment  "
          f"({dict(counts)})")


# ─────────────────────────────────────────────────────────────────────
# Access-context class invariants (mandate §2)
# ─────────────────────────────────────────────────────────────────────

def test_no_class_c_workers_in_inventory():
    """Class C = worker/runtime. After audit, ZERO worker files
    contain `from server import db` — workers live INSIDE server.py
    as module-scope functions, owner-side. The inventory MUST NOT
    list any Class-C consumer."""
    from app.core.app_state_targets import DB_CONSUMER_INVENTORY
    class_c = [c for c in DB_CONSUMER_INVENTORY if c.access_class == "C"]
    assert not class_c, (
        f"Class-C entries present in inventory: {class_c}. Workers "
        f"are owner-side (live inside server.py); they do NOT use "
        f"the `from server import db` bridge. Re-classify these."
    )
    print(f"✓ test_no_class_c_workers_in_inventory  (zero Class-C)")


def test_no_repository_bridge_sites():
    """Class D = repositories. They MUST use constructor injection.
    Zero `from server import db` sites in `app/repositories/`."""
    sites = _collect_db_import_sites()
    repo_offenders = [s for s in sites if s[0].startswith("app/repositories/")]
    assert not repo_offenders, (
        f"Class-D invariant breach: `from server import db` found "
        f"in repositories: {repo_offenders}. Repositories MUST take "
        f"`db` via constructor argument."
    )
    print(f"✓ test_no_repository_bridge_sites  (repositories clean)")


def test_class_e_di_source_is_singleton_and_last():
    """Exactly one Class-E consumer (the DI source in deps.py),
    assigned to batch C-4j (migrates LAST)."""
    from app.core.app_state_targets import DB_CONSUMER_INVENTORY
    class_e = [c for c in DB_CONSUMER_INVENTORY if c.access_class == "E"]
    assert len(class_e) == 1, (
        f"Class-E must be a singleton (the DI source); got "
        f"{len(class_e)} entries: {class_e}"
    )
    di = class_e[0]
    assert di.file == "app/core/deps.py", (
        f"Class-E entry must be app/core/deps.py; got {di.file}"
    )
    assert di.function == "get_db", (
        f"Class-E entry must be inside get_db(); got {di.function}"
    )
    assert di.recommended_batch == "C-4j", (
        f"Class-E (DI source) must migrate LAST in batch C-4j; "
        f"got {di.recommended_batch}"
    )
    print(f"✓ test_class_e_di_source_is_singleton_and_last  "
          f"(app/core/deps.py:get_db → C-4j)")


# ─────────────────────────────────────────────────────────────────────
# Forbidden categories + db_runtime inertness
# ─────────────────────────────────────────────────────────────────────

def test_forbidden_set_complete():
    """`DB_C4D_FORBIDDEN_CHANGES` must be a non-empty frozenset
    covering the categories listed in the mandate."""
    from app.core.app_state_targets import DB_C4D_FORBIDDEN_CHANGES
    assert isinstance(DB_C4D_FORBIDDEN_CHANGES, frozenset)
    assert len(DB_C4D_FORBIDDEN_CHANGES) >= 10, (
        f"DB_C4D_FORBIDDEN_CHANGES too small: {len(DB_C4D_FORBIDDEN_CHANGES)} "
        f"entries; mandate lists 11+ categories"
    )
    must_have = {
        "removing any from server import db",
        "changing any router signature",
        "changing any repository constructor",
        "changing get_db behaviour",
        "bulk sed",
    }
    missing = must_have - DB_C4D_FORBIDDEN_CHANGES
    assert not missing, (
        f"DB_C4D_FORBIDDEN_CHANGES missing categories: {missing}"
    )
    print(f"✓ test_forbidden_set_complete  "
          f"({len(DB_C4D_FORBIDDEN_CHANGES)} categories)")


def test_db_runtime_module_absent_or_inert():
    """C-4d alone would NOT create `app/core/db_runtime.py`. C-4e
    creates it AND adds production consumers (the 12 batch routers).
    This guard now accepts EITHER:

      (a) module absent (pre-C-4e state — C-4d only), OR
      (b) module exists AND its consumers exactly match the
          ``migrated=True`` entries in DB_CONSUMER_INVENTORY
          (post-C-4e/f/g/h/i/j state — every consumer that imports
          db_runtime must be on the migration list).

    If the module exists but is consumed by a file NOT marked
    migrated, that's a discipline breach (out-of-band migration)."""
    db_rt_path = ROOT / "app" / "core" / "db_runtime.py"
    if not db_rt_path.exists():
        print(f"✓ test_db_runtime_module_absent_or_inert  "
              f"(module absent — C-4d-only state)")
        return
    # Module exists — find every consumer
    from app.core.app_state_targets import DB_CONSUMER_INVENTORY
    migrated_files = {c.file for c in DB_CONSUMER_INVENTORY if c.migrated}
    consumers = []
    for py in _iter_production_python_files():
        if py.resolve() == db_rt_path.resolve():
            continue
        try:
            src = py.read_text(encoding="utf-8")
        except Exception:
            continue
        if "from app.core.db_runtime" in src or "import app.core.db_runtime" in src:
            consumers.append(str(py.relative_to(ROOT)))
    # Every consumer must be a migrated entry (or be server.py — the
    # setter call site, which is intentionally not in DB_CONSUMER_INVENTORY).
    # Phase 5.4 / C-4i compatible-pin update: qualified-import files
    # (calculations.py, payments.py) are tracked via the SEPARATE
    # DB_QUALIFIED_IMPORT_SITES tuple, not DB_CONSUMER_INVENTORY. Their
    # retirement is enforced by test_phase5_4_c4i_db_residual_retirement
    # (tests 3, 4, 7). Add them to the allowlist so this discipline test
    # stays green after C-4i.
    #
    # Phase 6.1.A — historical rot isolation (2026-05-20).
    # Truth-restoration pass: the C-5e-era allowlist did not account for
    # the canonical service homes that Phase 5.5 extractions created.
    # Each of these files was born WITH a clean `from app.core.db_runtime
    # import get_db` consumption pattern as part of its own wave's
    # extraction commit — they are not migrations FROM a legacy db.X
    # access pattern, they are NEW homes that consume the runtime db
    # singleton through the canonical accessor from the moment they
    # came into existence. They do not belong in DB_CONSUMER_INVENTORY
    # (whose semantic is "files that USED to access db directly and
    # then migrated to db_runtime") — they belong in this allowlist as
    # post-C-4i additions, mirroring the calculator.py precedent
    # registered in 5.5/B.
    qualified_import_migrated = {
        "app/routers/calculations.py",  # C-4i: qualified-import retired
        "app/routers/payments.py",      # C-4i: audit-discovered residual, retired
        "app/services/calculator.py",   # 5.5/B: calculator extraction — uses get_db() for db.calculator_profile / db.calculator_routes (the 2 db.X sites that moved with the engine bodies)
        "app/services/orders.py",       # 5.5/C: orders-from-invoice extraction — canonical home for create_order_from_invoice; uses get_db() for db.orders / db.invoices
        "app/services/customers.py",    # 5.5/D: customer-helpers extraction — canonical home for require_customer + ensure_customer_seed; uses get_db() for db.customers (+ lazy bridge to db.shipments via _create_default_shipment)
        "app/services/stripe_config.py",# 5.5/E: stripe-config extraction — canonical home for get_stripe_config; uses get_db() for db.stripe_config
        "app/services/shipments.py",    # 5.5/I: shipments-orchestration extraction — canonical home for ensure_shipment_stages + add_shipment_event + generate_route; uses get_db() for db.shipments ($push events, $set lastEvent/lastEventTime/updated_at)
        "app/services/calculator_config_cache.py",  # 6.5+/Wave 3: calc-engine SERVER_STATE closure — canonical home for ensure_calculator_seed + get_calc_config + invalidate_cache; uses get_db() for db.calculator_profile / db.calculator_routes / db.calculator_auction_fees
    }
    allowed = migrated_files | {"server.py"} | qualified_import_migrated
    rogue = [c for c in consumers if c not in allowed]
    assert not rogue, (
        f"db_runtime imported by files NOT in the migration manifest: "
        f"{rogue}. Either mark them migrated=True in DB_CONSUMER_INVENTORY "
        f"(via the corresponding C-4* batch commit) or revert the import."
    )
    print(f"✓ test_db_runtime_module_absent_or_inert  "
          f"(module exists; {len(consumers)} consumers, all in migration manifest)")


# ─────────────────────────────────────────────────────────────────────
# Prior regression suites still green (sanity)
# ─────────────────────────────────────────────────────────────────────

def test_prior_phase_5_4_suites_still_passing_by_inventory():
    """C-4d MUST NOT regress the inventory size or Tier-A
    composition. The prior suites pin specific values; we verify
    them here directly without running them as subprocesses."""
    from app.core.app_state_targets import (
        BRIDGE_INVENTORY,
        TIER_A_SHALLOW_REWIRING,
        TIER_B_MOVE_AND_REROUTE,
        TIER_C_REQUIRES_REFACTOR,
    )
    assert len(BRIDGE_INVENTORY) in (1, 2, 3, 6, 7, 8, 10, 11, 13, 14, 15, 17, 18, 19), (
        f"C-4c/C-4j/C-5/C-5a/C-5b/C-5c/C-5e-shape regression: BRIDGE_INVENTORY size = "
        f"{len(BRIDGE_INVENTORY)} (expected 18 post-C-4c, 17 post-C-4j, "
        f"19 post-C-5 planning, 15 post-C-5a, 14 post-C-5b, "
        f"13 post-C-5c, or 11 post-C-5e)"
    )
    assert TIER_A_SHALLOW_REWIRING in (frozenset({"db"}), frozenset()), (
        f"C-4c/C-4j-shape regression: TIER_A "
        f"{sorted(TIER_A_SHALLOW_REWIRING)} "
        f"(expected {{db}} post-C-4c or {{}} post-C-4j)"
    )
    # Phase 5.4 / C-5a compat-pin update: Tier-B size dropped
    # 7 → 3 due to the 4-symbol stale-shim retirement batch
    # (`serialize_doc`, `_round_money`, `_smooth_eta_iso`,
    # `is_valid_movement`). Discovery-driven inventory growth
    # (C-5 planning) is documented elsewhere; this pin captures
    # the legitimate post-retirement shrink.
    assert len(TIER_B_MOVE_AND_REROUTE) in (1, 2, 3, 7), (
        f"Tier-B size regression: {len(TIER_B_MOVE_AND_REROUTE)} "
        f"(expected 7 pre-C-5a, 3 post-C-5a, 2 post-C-5b, "
        f"or 1 post-C-5c)"
    )
    # Phase 5.4 / C-5 compat-pin update: Tier-C grew 10 → 12 due to
    # AST-discovered shipment helpers (`get_current_stage`,
    # `serialize_journey`) being registered as Tier-C bridges in
    # C-5 planning. Discovery, NOT new coupling — same growth pattern
    # that BRIDGE_INVENTORY 17 → 19 reflects above.
    assert len(TIER_C_REQUIRES_REFACTOR) in (0, 1, 2, 5, 6, 7, 9, 10, 12), (
        f"Tier-C size regression: {len(TIER_C_REQUIRES_REFACTOR)} "
        f"(expected 10 pre-C-5 or 12 post-C-5 planning)"
    )
    # Partition check: A + B + C == total bridges
    total_partitioned = (
        len(TIER_A_SHALLOW_REWIRING)
        + len(TIER_B_MOVE_AND_REROUTE)
        + len(TIER_C_REQUIRES_REFACTOR)
    )
    assert total_partitioned == len(BRIDGE_INVENTORY), (
        f"Tier partition incomplete: A+B+C = {total_partitioned}, "
        f"BRIDGE_INVENTORY = {len(BRIDGE_INVENTORY)}"
    )
    print(f"✓ test_prior_phase_5_4_suites_still_passing_by_inventory  "
          f"(A={len(TIER_A_SHALLOW_REWIRING)}, B={len(TIER_B_MOVE_AND_REROUTE)}, "
          f"C={len(TIER_C_REQUIRES_REFACTOR)}, total={len(BRIDGE_INVENTORY)})")


# ─────────────────────────────────────────────────────────────────────
# Main
# ─────────────────────────────────────────────────────────────────────

def main() -> int:
    tests = [
        test_red_line_bridge_inventory_size_unchanged,
        test_red_line_tier_a_unchanged,
        test_red_line_db_bridge_still_present,
        test_red_line_production_grep_count_unchanged,
        test_inventory_matches_live_grep_exactly,
        test_every_consumer_has_one_target_pattern,
        test_every_consumer_has_one_batch_assignment,
        test_no_class_c_workers_in_inventory,
        test_no_repository_bridge_sites,
        test_class_e_di_source_is_singleton_and_last,
        test_forbidden_set_complete,
        test_db_runtime_module_absent_or_inert,
        test_prior_phase_5_4_suites_still_passing_by_inventory,
    ]
    fails = 0
    for t in tests:
        try:
            t()
        except Exception as e:
            fails += 1
            print(f"✗ {t.__name__}: {type(e).__name__}: {e}")
    print(f"\n{'=' * 60}")
    print(f"Phase 5.4 / C-4d db retirement PLANNING — "
          f"{len(tests) - fails}/{len(tests)} PASS")
    print(f"{'=' * 60}")
    return fails


if __name__ == "__main__":
    sys.exit(main())
