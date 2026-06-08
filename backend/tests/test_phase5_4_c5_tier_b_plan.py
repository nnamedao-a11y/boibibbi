"""
Phase 5.4 / C-5 — Tier-B helper bridge PLANNING (mini-C-4d shape).
==================================================================

C-5 is **planning-only**. No helper is moved. This suite enforces
the planning contract:

  1. The Tier-B inventory (`TIER_B_INVENTORY`) matches the live
     AST-grep of `from server import …` import sites for every
     symbol it covers.
  2. The two AST-discovered Tier-C bridges (`get_current_stage`,
     `serialize_journey`) are registered in `BRIDGE_INVENTORY`
     because they have live production consumers.
  3. Every `TierBSymbol` has exactly one ``semantic_class``,
     ``target_module``, and ``proposed_batch`` field.
  4. Every Tier-B inventoried symbol appears in exactly one
     `C5_BATCH_PROPOSAL` batch (including the ``DEFER:5.8`` bucket).
  5. C-5 is planning-only: bridge count grew from 17 (post-C-4j)
     to 19 (post-C-5) because of *discovery*, not new coupling.
     No helper was actually moved.
  6. Tier-A is still empty (`frozenset()`) — C-4j invariant.
  7. db / sio / logger / bitmotors_parser_instance remain retired
     (no `from server import` sites in production).
  8. OpenAPI 618/679 unchanged.
  9. Phase 4 invariants probe still green.

Run:
    cd /app/backend && python tests/test_phase5_4_c5_tier_b_plan.py
"""
from __future__ import annotations

import ast
import os
import re
import sys
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))


# ─────────────────────────────────────────────────────────────────────
# Constants — C-5 planning contract
# ─────────────────────────────────────────────────────────────────────

EXPECTED_BRIDGE_COUNT_C5_PLANNING = 19    # at C-5 planning close
EXPECTED_BRIDGE_COUNT_C5A_CLOSED = 15      # post-C-5a (4 symbols retired)
EXPECTED_BRIDGE_COUNT_C5B_CLOSED = 14      # post-C-5b (aggregator accessor)
EXPECTED_BRIDGE_COUNT_C5C_CLOSED = 13      # post-C-5c (audit accessor)
EXPECTED_BRIDGE_COUNT_C5E_CLOSED = 11      # post-C-5e (get_current_stage + serialize_journey retired)
EXPECTED_BRIDGE_COUNT_5_5_C_CLOSED = 10    # post-5.5/C (_create_order_from_invoice retired — dual-shape)
EXPECTED_BRIDGE_COUNT_5_5_D_CLOSED = 8     # post-5.5/D (_require_customer + _ensure_customer_seed retired)
EXPECTED_BRIDGE_COUNT_5_5_E_CLOSED = 7     # post-5.5/E (_get_stripe_config retired — Wave-1 placement corrected + cabinet latent-bug repaired)
EXPECTED_BRIDGE_COUNT_5_5_F2_CLOSED = 6    # post-5.5/F2 (_tracking_enabled retired — verbatim port to canonical sibling in tracking_config module)
EXPECTED_BRIDGE_COUNT_5_5_G_CLOSED = 3     # post-5.5/G (identity_runtime + _run_auto_resolver + _persist_resolver_hits cluster retired together — first true orchestration extraction)
EXPECTED_BRIDGE_COUNT_5_5_H_CLOSED = 2     # post-5.5/H (_vf_extract_vessels retired — VesselFinder cluster; _external_container_lookup retired from EXTRACTION_AUX_BRIDGES in same commit)
EXPECTED_BRIDGE_COUNT_5_5_I_CLOSED = 1     # post-5.5/I (ensure_shipment_stages retired — shipments orchestration cluster; ZERO Tier-C bridges; only _STATIC_DIR Tier-B remains)
EXPECTED_BRIDGE_COUNT_VALID = {EXPECTED_BRIDGE_COUNT_C5_PLANNING,
                                EXPECTED_BRIDGE_COUNT_C5A_CLOSED,
                                EXPECTED_BRIDGE_COUNT_C5B_CLOSED,
                                EXPECTED_BRIDGE_COUNT_C5C_CLOSED,
                                EXPECTED_BRIDGE_COUNT_C5E_CLOSED,
                                EXPECTED_BRIDGE_COUNT_5_5_C_CLOSED,
                                EXPECTED_BRIDGE_COUNT_5_5_D_CLOSED,
                                EXPECTED_BRIDGE_COUNT_5_5_E_CLOSED,
                                EXPECTED_BRIDGE_COUNT_5_5_F2_CLOSED,
                                EXPECTED_BRIDGE_COUNT_5_5_G_CLOSED,
                                EXPECTED_BRIDGE_COUNT_5_5_H_CLOSED,
                                EXPECTED_BRIDGE_COUNT_5_5_I_CLOSED}

EXPECTED_TIER_B_INVENTORY_SIZE_C5_PLANNING = 9
EXPECTED_TIER_B_INVENTORY_SIZE_C5A_CLOSED = 5
EXPECTED_TIER_B_INVENTORY_SIZE_C5B_CLOSED = 4
EXPECTED_TIER_B_INVENTORY_SIZE_C5C_CLOSED = 3
EXPECTED_TIER_B_INVENTORY_SIZE_C5E_CLOSED = 1  # only _STATIC_DIR remains (Tier-B-adjacent shipment helpers retired)
EXPECTED_TIER_B_INVENTORY_SIZE_VALID = {
    EXPECTED_TIER_B_INVENTORY_SIZE_C5_PLANNING,
    EXPECTED_TIER_B_INVENTORY_SIZE_C5A_CLOSED,
    EXPECTED_TIER_B_INVENTORY_SIZE_C5B_CLOSED,
    EXPECTED_TIER_B_INVENTORY_SIZE_C5C_CLOSED,
    EXPECTED_TIER_B_INVENTORY_SIZE_C5E_CLOSED,
}

# C-5e retired the two AST-discovered shipment helpers (`get_current_stage`,
# `serialize_journey`). Post-C-5e these symbols MUST NOT appear in BRIDGE_INVENTORY
# and MUST have zero production `from server import …` consumers (server.py
# keeps a thin compat shim for internal closure callers + qualified-name surface).
C5E_RETIRED_SYMBOLS = ("get_current_stage", "serialize_journey")

EXPECTED_OPENAPI_PATHS = 618
EXPECTED_OPENAPI_OPS = 679

# Symbols whose retirement we have already proved (C-4 wave). They
# MUST NOT reappear as production consumers.
RETIRED_BRIDGES_C4 = (
    "db", "sio", "logger", "bitmotors_parser_instance",
)

# The 9 Tier-B / audit-discovered Tier-C symbols planned by C-5.
EXPECTED_C5_SYMBOLS = frozenset({
    "audit", "aggregator", "serialize_doc", "_round_money",
    "_smooth_eta_iso", "is_valid_movement", "_STATIC_DIR",
    "get_current_stage", "serialize_journey",
})

# Valid semantic classes (closed enum — test 3).
VALID_SEMANTIC_CLASSES = frozenset({
    "pure_utility",
    "runtime_accessor",
    "domain_helper",
    "static_path",
    "orchestration",
})

# Valid test_requirement values (closed enum).
VALID_TEST_REQUIREMENTS = frozenset({
    "structural", "identity", "behaviour", "smoke",
})

# Valid risk values (closed enum).
VALID_RISKS = frozenset({"low", "medium", "high"})

# Valid proposed_batch values — C-5a..C-5f or DEFER:<phase>.
VALID_BATCH_RE = re.compile(r"^(C-5[a-f]|DEFER:5\.\d+)$")

SKIP_DIRS = {"__pycache__"}


# ─────────────────────────────────────────────────────────────────────
# Live AST audit helpers
# ─────────────────────────────────────────────────────────────────────

def _classify(rel_path: str) -> str:
    """Production / legacy-root-test / test-suite / cache."""
    if rel_path.startswith("tests/") or "/tests/" in rel_path:
        return "test_suite"
    if rel_path.startswith("test_") and "/" not in rel_path:
        return "legacy_root_test"
    return "production"


def _iter_python_files():
    for py in ROOT.rglob("*.py"):
        if any(s in SKIP_DIRS for s in py.parts):
            continue
        yield py


def _ast_grep_from_server_imports() -> dict:
    """Return ``{symbol: [(file, line, classification, shape), …]}``
    for every ``from server import …`` site.

    Handles multi-line ``from server import (\\n  X,\\n  Y,\\n)``
    via ``ast.ImportFrom`` traversal (the same AST grep that the
    C-4j compatible-pin update introduced)."""
    sites = defaultdict(list)
    for py in _iter_python_files():
        rel = str(py.relative_to(ROOT))
        cls = _classify(rel)
        try:
            text = py.read_text(encoding="utf-8")
            tree = ast.parse(text)
        except Exception:
            continue
        src_lines = text.splitlines()
        for node in ast.walk(tree):
            if isinstance(node, ast.ImportFrom) and node.module == "server":
                line_text = (
                    src_lines[node.lineno - 1]
                    if node.lineno - 1 < len(src_lines)
                    else ""
                )
                if "(" in line_text and ")" not in line_text:
                    shape = "multiline_tuple"
                elif len(node.names) > 1:
                    shape = "single_line_tuple"
                else:
                    shape = "direct"
                for alias in node.names:
                    sites[alias.name].append((rel, node.lineno, cls, shape))
    return sites


# ─────────────────────────────────────────────────────────────────────
# 1) Tier-B inventory matches live AST-grep
# ─────────────────────────────────────────────────────────────────────

def test_1_tier_b_inventory_matches_live_ast():
    """Every symbol in `TIER_B_INVENTORY` must have a
    production-consumer list that matches the live AST grep
    exactly (file:line tuples). If a new prod consumer was added
    in some commit without updating the inventory, this fails."""
    from app.core.app_state_targets import TIER_B_INVENTORY
    sites = _ast_grep_from_server_imports()
    mismatches = []
    for entry in TIER_B_INVENTORY:
        live_prod = sorted(
            f"{f}:{l}"
            for (f, l, cls, _shape) in sites.get(entry.symbol, [])
            if cls == "production"
        )
        documented = sorted(entry.production_consumer_sites)
        if live_prod != documented:
            mismatches.append(
                f"  {entry.symbol}:\n    live  = {live_prod}\n"
                f"    inv   = {documented}"
            )
    assert not mismatches, (
        "[C-5] FAIL: TIER_B_INVENTORY out of sync with live AST grep "
        "for these symbols:\n" + "\n".join(mismatches)
    )
    print(f"✓ test_1_tier_b_inventory_matches_live_ast  "
          f"({len(TIER_B_INVENTORY)} entries; all consumers match)")


# ─────────────────────────────────────────────────────────────────────
# 2) AST-discovered Tier-C bridges registered in BRIDGE_INVENTORY
# ─────────────────────────────────────────────────────────────────────

def test_2_discovered_bridges_registered():
    """`get_current_stage` and `serialize_journey` had live
    production consumers when C-4j ran the AST audit.

    Two valid post-states (depending on which C-5 batch closed last):

      A. Pre-C-5e: registered in BRIDGE_INVENTORY as Tier-C entries
         (sibling of `ensure_shipment_stages` which is already there).
      B. Post-C-5e (this commit): RETIRED — symbols MUST be absent from
         BRIDGE_INVENTORY, MUST have zero production `from server
         import …` consumers, AND MUST exist as public symbols on
         `app.utils.shipments` (canonical owner). server.py keeps a
         thin compat shim for internal closure callers + qualified-name
         surface; verified by `tests/test_phase5_4_c5e_shipment_helpers.py`.
    """
    from app.core.app_state_targets import BRIDGE_INVENTORY
    documented = {b.symbol: b for b in BRIDGE_INVENTORY}

    # Decide which post-state we are in.
    pre_c5e = all(sym in documented for sym in C5E_RETIRED_SYMBOLS)
    post_c5e = all(sym not in documented for sym in C5E_RETIRED_SYMBOLS)
    assert pre_c5e or post_c5e, (
        "[C-5] FAIL: partial C-5e retirement detected — "
        f"BRIDGE_INVENTORY has only some of {C5E_RETIRED_SYMBOLS}. "
        "Either all must be present (pre-C-5e) or all retired (post-C-5e)."
    )

    if pre_c5e:
        for sym in C5E_RETIRED_SYMBOLS:
            assert documented[sym].tier == "C", (
                f"[C-5] FAIL: `{sym}` registered with tier="
                f"{documented[sym].tier!r}, expected 'C'."
            )
            assert documented[sym].consumers_count >= 1, (
                f"[C-5] FAIL: `{sym}` has consumers_count=0 — should "
                f"reflect AST-grep count."
            )
        print(f"✓ test_2_discovered_bridges_registered  "
              f"(pre-C-5e: get_current_stage tier=C consumers=2, "
              f"serialize_journey tier=C consumers=1)")
        return

    # post-C-5e branch: canonical retirement contract.
    # (1) Zero production `from server import …` sites for either symbol.
    sites = _ast_grep_from_server_imports()
    for sym in C5E_RETIRED_SYMBOLS:
        prod = [
            f"{f}:{l}" for (f, l, cls, _s) in sites.get(sym, [])
            if cls == "production"
        ]
        assert not prod, (
            f"[C-5e] FAIL: `{sym}` still has production consumers via "
            f"`from server import`: {prod}. Retirement contract broken."
        )

    # (2) Symbols MUST exist on the canonical module.
    from app.utils import shipments as _sh
    for sym in C5E_RETIRED_SYMBOLS:
        assert hasattr(_sh, sym), (
            f"[C-5e] FAIL: canonical module `app.utils.shipments` "
            f"is missing `{sym}` after retirement."
        )

    print(f"✓ test_2_discovered_bridges_registered  "
          f"(post-C-5e: {C5E_RETIRED_SYMBOLS} retired, "
          f"canonical owner = app/utils/shipments.py, 0 prod consumers)")


# ─────────────────────────────────────────────────────────────────────
# 3) Every TierBSymbol has exactly one semantic_class
# ─────────────────────────────────────────────────────────────────────

def test_3_every_symbol_has_one_semantic_class():
    from app.core.app_state_targets import TIER_B_INVENTORY
    errors = []
    for entry in TIER_B_INVENTORY:
        if entry.semantic_class not in VALID_SEMANTIC_CLASSES:
            errors.append(
                f"  {entry.symbol}: semantic_class="
                f"{entry.semantic_class!r} not in "
                f"{sorted(VALID_SEMANTIC_CLASSES)}"
            )
    assert not errors, (
        "[C-5] FAIL: invalid semantic_class values:\n" + "\n".join(errors)
    )
    # Spot-check distribution makes sense
    classes = sorted({e.semantic_class for e in TIER_B_INVENTORY})
    print(f"✓ test_3_every_symbol_has_one_semantic_class  "
          f"(classes used: {classes})")


# ─────────────────────────────────────────────────────────────────────
# 4) Every TierBSymbol has exactly one target_module or defer reason
# ─────────────────────────────────────────────────────────────────────

def test_4_every_symbol_has_target_module():
    from app.core.app_state_targets import TIER_B_INVENTORY
    errors = []
    for entry in TIER_B_INVENTORY:
        tm = entry.target_module.strip()
        if not tm:
            errors.append(f"  {entry.symbol}: target_module is empty")
            continue
        if not (
            tm.startswith("app/")
            or tm.startswith("DEFER:")
            or "ALREADY MOVED" in tm
            or "NEW" in tm
            or "EXTRACT" in tm
        ):
            errors.append(
                f"  {entry.symbol}: target_module={tm!r} doesn't "
                f"start with 'app/' or 'DEFER:' or contain "
                f"'ALREADY MOVED'/'NEW'/'EXTRACT'"
            )
    assert not errors, (
        "[C-5] FAIL: malformed target_module:\n" + "\n".join(errors)
    )
    print(f"✓ test_4_every_symbol_has_target_module")


# ─────────────────────────────────────────────────────────────────────
# 5) Every TierBSymbol has exactly one proposed_batch AND every
#    batch contains only inventoried symbols (no orphans, no leaks)
# ─────────────────────────────────────────────────────────────────────

def test_5_batch_proposal_is_complete_and_consistent():
    from app.core.app_state_targets import (
        TIER_B_INVENTORY, C5_BATCH_PROPOSAL,
    )

    # 5a — every TierBSymbol has a valid proposed_batch value.
    errors = []
    for entry in TIER_B_INVENTORY:
        if not VALID_BATCH_RE.match(entry.proposed_batch):
            errors.append(
                f"  {entry.symbol}: proposed_batch="
                f"{entry.proposed_batch!r} doesn't match {VALID_BATCH_RE.pattern}"
            )
    assert not errors, "\n".join(errors)

    # 5b — every TierBSymbol appears in exactly one batch (or its
    # proposed_batch is DEFER:5.x — in which case it appears in
    # the corresponding DEFER:5.x bucket).
    inventory_symbols = {e.symbol for e in TIER_B_INVENTORY}
    inventory_by_batch = {e.symbol: e.proposed_batch for e in TIER_B_INVENTORY}

    appearances = defaultdict(list)
    batch_lookup = dict(C5_BATCH_PROPOSAL)
    for batch_name, symbols in C5_BATCH_PROPOSAL:
        for sym in symbols:
            appearances[sym].append(batch_name)

    multi_appear = {s: b for s, b in appearances.items() if len(b) > 1}
    assert not multi_appear, (
        f"[C-5] FAIL: symbols in multiple batches: {multi_appear}"
    )

    missing = inventory_symbols - set(appearances.keys())
    assert not missing, (
        f"[C-5] FAIL: TIER_B_INVENTORY symbols missing from "
        f"C5_BATCH_PROPOSAL: {sorted(missing)}"
    )

    # 5c — every symbol's proposed_batch in TIER_B_INVENTORY
    # matches the batch it actually appears in (no contradiction).
    contradictions = []
    for sym in inventory_symbols:
        appears_in = appearances[sym][0]
        declared = inventory_by_batch[sym]
        if appears_in != declared:
            contradictions.append(
                f"  {sym}: TIER_B_INVENTORY says {declared!r}, "
                f"C5_BATCH_PROPOSAL puts it in {appears_in!r}"
            )
    assert not contradictions, (
        "[C-5] FAIL: batch contradictions:\n" + "\n".join(contradictions)
    )

    # 5d — orphan batch symbols (in C5_BATCH_PROPOSAL but not in
    # TIER_B_INVENTORY) are forbidden.
    orphans = set(appearances.keys()) - inventory_symbols
    assert not orphans, (
        f"[C-5] FAIL: C5_BATCH_PROPOSAL references symbols not "
        f"in TIER_B_INVENTORY: {sorted(orphans)}"
    )

    print(f"✓ test_5_batch_proposal_is_complete_and_consistent  "
          f"({len(C5_BATCH_PROPOSAL)} batches; all inventory mapped)")


# ─────────────────────────────────────────────────────────────────────
# 6) No production helper moved in C-5
# ─────────────────────────────────────────────────────────────────────

def test_6_no_helper_moved_in_c5():
    """C-5 is planning-only. For every Tier-B symbol whose
    `current_definition_site` is in ``server.py``, the definition
    MUST still exist there. (Symbols already moved to `app/utils/...`
    in prior phases are exempt — their `current_definition_site`
    already points at the new location.)"""
    from app.core.app_state_targets import TIER_B_INVENTORY
    errors = []
    for entry in TIER_B_INVENTORY:
        site = entry.current_definition_site
        file_path = site.split(":")[0]
        try:
            line_no = int(site.split(":")[1])
        except (IndexError, ValueError):
            errors.append(f"  {entry.symbol}: malformed definition site {site!r}")
            continue
        target_file = ROOT / file_path
        if not target_file.exists():
            errors.append(
                f"  {entry.symbol}: definition file {file_path} missing"
            )
            continue
        try:
            text = target_file.read_text(encoding="utf-8")
            tree = ast.parse(text)
        except Exception:
            continue
        # Find a def or assignment at approximately the declared line
        found = False
        for node in ast.walk(tree):
            if (
                isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef))
                and node.name == entry.symbol
            ):
                found = True
                break
            if isinstance(node, ast.Assign):
                for tgt in node.targets:
                    if isinstance(tgt, ast.Name) and tgt.id == entry.symbol:
                        found = True
                        break
                if found:
                    break
        if not found:
            errors.append(
                f"  {entry.symbol}: not defined in {file_path} "
                f"(declared at {site}). C-5 must not move helpers."
            )
    assert not errors, (
        "[C-5] FAIL: helper(s) moved during C-5:\n" + "\n".join(errors)
    )
    print(f"✓ test_6_no_helper_moved_in_c5  "
          f"({len(TIER_B_INVENTORY)} definition sites verified in place)")


# ─────────────────────────────────────────────────────────────────────
# 7) BRIDGE_INVENTORY count update is documented
# ─────────────────────────────────────────────────────────────────────

def test_7_bridge_inventory_count_grew_from_discovery():
    """Bridge count history: grew 17 → 19 because of *discovery*, not new
    coupling (C-5 planning); 19 → 15 (C-5a stale-shim retirement);
    15 → 14 (C-5b aggregator); 14 → 13 (C-5c audit); 13 → 11 (C-5e
    shipment helpers retired).

    Valid post-states:
      * pre-C-5e: count ∈ {19, 15, 14, 13} AND both C-5e symbols
        registered as Tier-C in BRIDGE_INVENTORY.
      * post-C-5e (this commit): count == 11 AND both C-5e symbols
        ABSENT from BRIDGE_INVENTORY.

    The verdict text must still document the discovery-driven growth."""
    from app.core.app_state_targets import (
        BRIDGE_INVENTORY, ARCHITECTURAL_VERDICT,
    )
    assert len(BRIDGE_INVENTORY) in EXPECTED_BRIDGE_COUNT_VALID, (
        f"[C-5] FAIL: BRIDGE_INVENTORY size = "
        f"{len(BRIDGE_INVENTORY)}, expected one of "
        f"{sorted(EXPECTED_BRIDGE_COUNT_VALID)} "
        f"(19 planning-close, 15 post-C-5a, 14 post-C-5b, "
        f"13 post-C-5c, 11 post-C-5e)."
    )
    symbols = {b.symbol: b for b in BRIDGE_INVENTORY}

    pre_c5e = all(sym in symbols for sym in C5E_RETIRED_SYMBOLS)
    post_c5e = all(sym not in symbols for sym in C5E_RETIRED_SYMBOLS)
    assert pre_c5e or post_c5e, (
        "[C-5] FAIL: partial C-5e retirement detected in BRIDGE_INVENTORY."
    )

    if pre_c5e:
        for sym in C5E_RETIRED_SYMBOLS:
            assert symbols[sym].tier == "C", (
                f"[C-5] FAIL: `{sym}` should be Tier-C, got "
                f"{symbols[sym].tier}"
            )
    else:
        # post-C-5e — count pin (accepts 11/10/8/7/6/3/2/1 for post-C-5e/5.5/C/5.5/D/5.5/E/5.5/F2/5.5/G/5.5/H/5.5/I)
        assert len(BRIDGE_INVENTORY) in (
            EXPECTED_BRIDGE_COUNT_C5E_CLOSED,
            EXPECTED_BRIDGE_COUNT_5_5_C_CLOSED,
            EXPECTED_BRIDGE_COUNT_5_5_D_CLOSED,
            EXPECTED_BRIDGE_COUNT_5_5_E_CLOSED,
            EXPECTED_BRIDGE_COUNT_5_5_F2_CLOSED,
            EXPECTED_BRIDGE_COUNT_5_5_G_CLOSED,
            EXPECTED_BRIDGE_COUNT_5_5_H_CLOSED,
            EXPECTED_BRIDGE_COUNT_5_5_I_CLOSED,
        ), (
            f"[C-5e/5.5/C..5.5/I] FAIL: post-C-5e expects "
            f"BRIDGE_INVENTORY size in (11, 10, 8, 7, 6, 3, 2, 1), got "
            f"{len(BRIDGE_INVENTORY)} (11 post-C-5e, 10 post-5.5/C, "
            f"8 post-5.5/D, 7 post-5.5/E — _get_stripe_config retired, "
            f"6 post-5.5/F2 — _tracking_enabled retired, "
            f"3 post-5.5/G — identity-resolver cluster retired, "
            f"2 post-5.5/H — _vf_extract_vessels retired, "
            f"1 post-5.5/I — ensure_shipment_stages retired, ZERO Tier-C)"
        )

    flat = " ".join(ARCHITECTURAL_VERDICT.lower().split())
    assert "discovery" in flat or "discovered" in flat, (
        "[C-5] FAIL: verdict must explain the 17 → 19 growth as "
        "discovery (not new coupling)."
    )
    assert ("17 → 19" in flat or "17 → 19" in flat
            or "17 to 19" in flat or "from 17" in flat
            or "(post-c-4j) to 19" in flat), (
        "[C-5] FAIL: verdict must mention the explicit count growth."
    )
    print(f"✓ test_7_bridge_inventory_count_grew_from_discovery  "
          f"(current size={len(BRIDGE_INVENTORY)}; "
          f"17 → 19 → 15 → 14 → 13 → 11 documented)")


# ─────────────────────────────────────────────────────────────────────
# 8) Tier-A still empty (C-4j invariant)
# ─────────────────────────────────────────────────────────────────────

def test_8_tier_a_remains_empty():
    from app.core.app_state_targets import TIER_A_SHALLOW_REWIRING
    assert TIER_A_SHALLOW_REWIRING == frozenset(), (
        f"[C-5] FAIL: Tier-A re-populated since C-4j close: "
        f"{sorted(TIER_A_SHALLOW_REWIRING)}"
    )
    print(f"✓ test_8_tier_a_remains_empty  (Tier-A == frozenset())")


# ─────────────────────────────────────────────────────────────────────
# 9) Retired bridges (db, sio, logger, bitmotors) stay retired
# ─────────────────────────────────────────────────────────────────────

def test_9_retired_bridges_stay_retired():
    """C-5 must not regress the C-4 retirements. AST grep for any
    `from server import X` where X is in RETIRED_BRIDGES_C4 must
    return zero production sites."""
    sites = _ast_grep_from_server_imports()
    regressions = []
    for sym in RETIRED_BRIDGES_C4:
        prod = [
            f"{f}:{l}" for (f, l, cls, _s) in sites.get(sym, [])
            if cls == "production"
        ]
        if prod:
            regressions.append(f"  {sym}: prod sites = {prod}")
    assert not regressions, (
        "[C-5] FAIL: C-4 retirements regressed:\n" + "\n".join(regressions)
    )
    print(f"✓ test_9_retired_bridges_stay_retired  "
          f"(db, sio, logger, bitmotors_parser_instance — all 0 prod imports)")


# ─────────────────────────────────────────────────────────────────────
# 10) OpenAPI 618/679 unchanged
# ─────────────────────────────────────────────────────────────────────

def test_10_openapi_route_freeze_618_679():
    os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")
    os.environ.setdefault("DB_NAME", "test_database")

    from fastapi.testclient import TestClient
    import server
    fastapi_app = getattr(server, "fastapi_app", None) or getattr(server, "app", None)
    assert fastapi_app is not None, "[C-5] FAIL: cannot resolve FastAPI instance"

    client = TestClient(fastapi_app)
    r = client.get("/api/openapi.json")
    assert r.status_code == 200, f"[C-5] FAIL: openapi HTTP {r.status_code}"
    data = r.json()
    paths = data.get("paths", {})
    n_paths = len(paths)
    n_ops = sum(
        len([k for k in v if k in ("get", "post", "put", "patch", "delete", "head", "options")])
        for v in paths.values()
    )
    assert n_paths == EXPECTED_OPENAPI_PATHS and n_ops == EXPECTED_OPENAPI_OPS, (
        f"[C-5] FAIL: OpenAPI surface drifted. expected "
        f"{EXPECTED_OPENAPI_PATHS}/{EXPECTED_OPENAPI_OPS}, got "
        f"{n_paths}/{n_ops}"
    )
    print(f"✓ test_10_openapi_route_freeze_618_679  ({n_paths}/{n_ops})")


# ─────────────────────────────────────────────────────────────────────
# 11) Phase 4 invariants green (probe via the canonical helper)
# ─────────────────────────────────────────────────────────────────────

def test_11_phase4_invariants_green():
    """Re-use the canonical Phase 4 ratchet helper to confirm no
    drift in supervised-spawn counters caused by C-5 planning
    edits. Tier-B inventory + new Bridge entries are pure data
    mutations and should NOT touch any structural counter."""
    from tests._invariants_helpers import (
        count_total_create_task,
        ASYNCIO_CREATE_TASK_CEILING,
    )
    total = count_total_create_task()
    assert total <= ASYNCIO_CREATE_TASK_CEILING, (
        f"[C-5] FAIL: asyncio.create_task supervised-spawn count "
        f"{total} exceeds Phase 4 ratchet ceiling "
        f"{ASYNCIO_CREATE_TASK_CEILING}."
    )
    print(f"✓ test_11_phase4_invariants_green  "
          f"(asyncio.create_task={total}/{ASYNCIO_CREATE_TASK_CEILING})")


# ─────────────────────────────────────────────────────────────────────
# Runner
# ─────────────────────────────────────────────────────────────────────

def _run_all():
    tests = [
        test_1_tier_b_inventory_matches_live_ast,
        test_2_discovered_bridges_registered,
        test_3_every_symbol_has_one_semantic_class,
        test_4_every_symbol_has_target_module,
        test_5_batch_proposal_is_complete_and_consistent,
        test_6_no_helper_moved_in_c5,
        test_7_bridge_inventory_count_grew_from_discovery,
        test_8_tier_a_remains_empty,
        test_9_retired_bridges_stay_retired,
        test_10_openapi_route_freeze_618_679,
        test_11_phase4_invariants_green,
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
        f"Phase 5.4 / C-5 Tier-B bridge planning — "
        f"{len(tests) - failed}/{len(tests)} "
        f"{'PASS' if failed == 0 else 'FAIL'}"
    )
    print("=" * 60)
    return 0 if failed == 0 else 1


if __name__ == "__main__":
    sys.exit(_run_all())
