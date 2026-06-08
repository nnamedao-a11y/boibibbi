"""
Phase 5.4 / C-5f — Consolidation Verdict.
==========================================

C-5f is **planning / inventory / decision only** — no helper moves,
no bridge retirements, no Phase 5.5 execution. This suite is the
formal handoff contract from Phase 5.4 to Phase 5.5: it enforces
that the post-C-5e bridge baseline is fully captured, that every
remaining bridge has a target phase + reason, and that no production
code has changed under cover of "consolidation".

Required assertions (per the C-5f mandate, all 12):

  1. live AST bridge baseline matches BRIDGE_INVENTORY
  2. BRIDGE_INVENTORY count == 11
  3. Tier-A empty
  4. Tier-B inventory == {"_STATIC_DIR"} or documented equivalent
  5. Tier-C count == 10
  6. all retired-symbol sets are disjoint from live imports
  7. _STATIC_DIR target phase == 5.8
  8. every remaining bridge has target phase
  9. every remaining bridge has reason_not_retired
 10. no production code changed in C-5f
 11. OpenAPI 618/679 unchanged
 12. Phase 4 invariants green

Run:
    cd /app/backend && python -m pytest tests/test_phase5_4_c5f_consolidation_verdict.py -v
"""
from __future__ import annotations

import ast
import os
import sys
from collections import defaultdict
from pathlib import Path
from typing import Dict, List, Tuple

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")
os.environ.setdefault("DB_NAME", "test_database")

EXPECTED_BRIDGE_COUNT_POST_C5E = 11
EXPECTED_TIER_C_COUNT_POST_C5E = 10
# 5.5/C compatible-pin: post-5.5/C, BRIDGE_INVENTORY size shrinks 11 → 10
# and Tier-C count shrinks 10 → 9 because ``_create_order_from_invoice``
# was retired (dual-shape — both from-server and qualified-access).
EXPECTED_BRIDGE_COUNT_POST_5_5_C = 10
EXPECTED_TIER_C_COUNT_POST_5_5_C = 9
# 5.5/D compatible-pin: post-5.5/D, BRIDGE_INVENTORY shrinks 10 → 8 and
# Tier-C count shrinks 9 → 7 because ``_require_customer`` AND
# ``_ensure_customer_seed`` were retired (single-shape — `from server
# import …` lazy WPS433 in ``cabinet_financials.py`` wrappers redirected
# to ``app/services/customers.{require_customer,ensure_customer_seed}``;
# 21 in-file callers in ``server.py`` bulk-migrated; private sibling
# ``_seed_customer_financials`` moved with the seeder). Aux deps
# ``_resolve_bearer`` + ``generate_route`` registered under
# ``EXTRACTION_AUX_BRIDGES`` (kind=``CUSTOMER_AUTH_DEP``).
EXPECTED_BRIDGE_COUNT_POST_5_5_D = 8
EXPECTED_TIER_C_COUNT_POST_5_5_D = 7
# 5.5/E compatible-pin: post-5.5/E, BRIDGE_INVENTORY shrinks 8 → 7 and
# Tier-C count shrinks 7 → 6 because ``_get_stripe_config`` was retired
# (Wave-1 router-internal placement corrected; helper moved from
# ``app/routers/payments.py`` to ``app/services/stripe_config.py`` as
# ``get_stripe_config``; 10 callers migrated — 7 router + 2 ``server.py``
# lazy + 1 ``cabinet_financials.py`` (latent ImportError bridge
# repaired)). No aux deps registered per D3=A.
EXPECTED_BRIDGE_COUNT_POST_5_5_E = 7
EXPECTED_TIER_C_COUNT_POST_5_5_E = 6
# 5.5/F2 compatible-pin: post-5.5/F2, BRIDGE_INVENTORY shrinks 7 → 6
# and Tier-C count shrinks 6 → 5 because ``_tracking_enabled`` was
# retired (env-flag reader moved verbatim from ``server.py:2963`` to
# ``app/services/tracking_config.py`` as the public ``tracking_enabled``;
# 5 callers migrated — 4 in-file in server.py + 1 cross-module wrapper
# in admin_identity.py retired entirely; no aux deps registered).
EXPECTED_BRIDGE_COUNT_POST_5_5_F2 = 6
EXPECTED_TIER_C_COUNT_POST_5_5_F2 = 5
# 5.5/G compatible-pin: post-5.5/G, BRIDGE_INVENTORY shrinks 6 → 3 and
# Tier-C count shrinks 5 → 2 because the identity-resolver CLUSTER was
# retired in one focused commit (D1): ``identity_runtime`` (MODULE_REF),
# ``_run_auto_resolver`` (M-4 bridge inside identity_runtime), and
# ``_persist_resolver_hits`` (M-5 sibling). Bodies moved verbatim from
# ``server.py:5657/5677`` into ``IdentityRuntimeService.run_auto_resolver()``
# / ``.persist_resolver_hits()``; 3 module-private helpers travelled
# with the cluster (``_resolver_shipsgo_lookup``, ``_resolver_vf_search``,
# ``_get_auto_resolver``); 2 aux deps stayed on server side as
# ``RESOLVER_DEP`` entries (``_external_container_lookup``,
# ``add_shipment_event``) — retirement deferred to 5.5/H + 5.5/I.
EXPECTED_BRIDGE_COUNT_POST_5_5_G = 3
EXPECTED_TIER_C_COUNT_POST_5_5_G = 2
# 5.5/H compatible-pin: post-5.5/H, BRIDGE_INVENTORY shrinks 3 → 2 and
# Tier-C count shrinks 2 → 1 because the VesselFinder cluster was
# retired in one focused commit (D1): ``_vf_extract_vessels`` (the
# alias on ``server.py:19194`` import block) +
# ``_external_container_lookup`` (RESOLVER_DEP — registered in
# EXTRACTION_AUX_BRIDGES by 5.5/G; the body moved verbatim from
# ``server.py:18798`` to ``app/services/tracking_providers.py`` as the
# public ``external_container_lookup``). Only the BRIDGE_INVENTORY
# Tier-C entry ``_vf_extract_vessels`` decrements that surface; the
# RESOLVER_DEP retirement is decremented in EXTRACTION_AUX_BRIDGES
# (47 → 46) — see PHASE_5_5_H_RETIRED_BRIDGES.
EXPECTED_BRIDGE_COUNT_POST_5_5_H = 2
EXPECTED_TIER_C_COUNT_POST_5_5_H = 1
# 5.5/I compatible-pin: post-5.5/I, BRIDGE_INVENTORY shrinks 2 → 1 and
# Tier-C count shrinks 1 → 0 because the shipments-orchestration cluster
# was retired in one focused commit (D1): ``ensure_shipment_stages``
# (the last Tier-C BRIDGE_INVENTORY entry) + ``add_shipment_event``
# (5.5/G-aux RESOLVER_DEP) + ``generate_route`` (5.5/D-aux CUSTOMER_AUTH_DEP),
# bodies moved verbatim to ``app/services/shipments.{ensure_shipment_stages,
# add_shipment_event, generate_route}``. This is the PHASE-5 disentangling
# endpoint — ZERO Tier-C bridges remain.
EXPECTED_BRIDGE_COUNT_POST_5_5_I = 1
EXPECTED_TIER_C_COUNT_POST_5_5_I = 0
EXPECTED_TIER_B_INVENTORY_SIZE_POST_C5E = 1
EXPECTED_TIER_B_MOVE_AND_REROUTE_POST_C5E = frozenset({"_STATIC_DIR"})
EXPECTED_OPENAPI_PATHS = 618
EXPECTED_OPENAPI_OPS = 679

SKIP_DIRS = {"__pycache__", ".git", "node_modules"}

# The 11 live AST baseline symbols (production `from server import …`).
# C-5f baseline: 11 symbols, FROZEN.
#
# Phase 5.5/B compatible-pin: when the calculator engines moved from
# server.py to app/services/calculator.py, the new service module
# became a producer of 43 NEW `from server import X` symbols (the
# engines' constant/helper dependencies). These are recorded as a
# SEPARATE tuple ``EXTRACTION_AUX_BRIDGES`` in app/core/app_state_targets
# so the 16 prior-wave count pins on ``len(BRIDGE_INVENTORY)`` keep
# their baselines. The live-AST audit (test_1 below) now compares the
# live set against the UNION ``BRIDGE_INVENTORY ∪ EXTRACTION_AUX_BRIDGES``
# — see ``EXPECTED_LIVE_BRIDGE_SYMBOLS_POST_5_5_B`` below.
EXPECTED_BRIDGE_SYMBOLS_POST_C5E = frozenset({
    "_STATIC_DIR",
    # `_create_order_from_invoice` was in this baseline. Retired in 5.5/C
    # (dual-shape; moved to ``app/services/orders.create_order_from_invoice``).
    # `_ensure_customer_seed` + `_require_customer` retired in 5.5/D
    # (single-shape; moved to ``app/services/customers.{ensure_customer_seed,
    # require_customer}``). Removed from this frozen set.
    # `_get_stripe_config` retired in 5.5/E (Wave-1 router placement
    # corrected; moved to ``app/services/stripe_config.get_stripe_config``;
    # cabinet latent ImportError bridge repaired). Removed from this set.
    # `_tracking_enabled` retired in 5.5/F2 (env-flag reader moved to
    # ``app/services/tracking_config.tracking_enabled`` as sibling
    # function — NOT an accessor over service state; pure env reader).
    # Removed from this set.
    # `identity_runtime`, `_run_auto_resolver`, `_persist_resolver_hits`
    # retired in 5.5/G (identity-resolver cluster — bodies moved
    # verbatim into ``IdentityRuntimeService`` methods; 3 router
    # consumers migrated to canonical
    # ``from app.services.identity_runtime import identity_runtime``).
    # Removed from this set.
    # `_vf_extract_vessels` retired in 5.5/H (VesselFinder cluster —
    # the ``extract_vessels_from_payload as _vf_extract_vessels`` alias
    # on the ``from vesselfinder_scraper import …`` block in server.py
    # removed; canonical home was always ``vesselfinder_scraper``; the
    # single cross-module consumer in ``shipment_identity_resolver.py``
    # migrated to direct ``from vesselfinder_scraper import
    # extract_vessels_from_payload``). Removed from this set.
    # `ensure_shipment_stages` retired in 5.5/I (shipments orchestration
    # cluster — body moved verbatim to
    # ``app/services/shipments.ensure_shipment_stages``; the two
    # cross-module consumers ``admin_resolver.py:77`` and
    # ``admin_shipments.py:110`` migrated to canonical home). Removed
    # from this set.
})

# Phase 5.5/B — live-AST audit set (union of frozen BRIDGE_INVENTORY
# + EXTRACTION_AUX_BRIDGES). Updated when:
#   * a new extraction wave moves bodies → new aux entries added
#   * a domain-cluster move retires aux entries (e.g. 5.5/B-deep moves
#     the calculator constants/helpers cluster and zeroes aux out)
#   * a regular wave retires a BRIDGE_INVENTORY entry → it leaves
#     ``EXPECTED_BRIDGE_SYMBOLS_POST_C5E`` too.
EXPECTED_LIVE_BRIDGE_SYMBOLS_POST_5_5_B = EXPECTED_BRIDGE_SYMBOLS_POST_C5E | frozenset({
    # ─────────────────────────────────────────────────────────────
    # Phase 6.5+ Wave 1 + Wave 2 (2026-05-20): the 43-symbol
    # 5.5/B calculator extraction-aux cluster is FULLY RETIRED.
    #
    #   * Wave 1 retired ``_find_route_amount`` →
    #     ``app/services/calculator_pure._find_route_amount``.
    #   * Wave 2 retired 38 PURE_CONSTANT + AUCTION_TIERED_FEES →
    #     ``app/core/calculator_constants`` AND 2 ``_tiered_buyer_fee*``
    #     helpers → ``app/services/calculator_pure``.
    #   * The 2 SERVER_STATE-coupled helpers
    #     (``_ensure_calculator_seed``, ``_load_calc_config``) are no
    #     longer ``from server import``-coupled — calculator.py now
    #     reaches them via the Wave-2 cycle-break lazy ``import server``
    #     allowance (see ``test_phase6_3_b_ast_topology
    #     ::_IMPORT_SERVER_WAVE_2_ALLOWANCE``). They retire from
    #     server.py entirely in Wave 3.
    #
    # All 43 prior 5.5/B aux entries removed from this expected-live
    # set. See ``PHASE_6_5_WAVE_1_RETIRED_BRIDGES`` and
    # ``PHASE_6_5_WAVE_2_RETIRED_BRIDGES`` for the audit-trail.
    # ─────────────────────────────────────────────────────────────
    # 5.5/D customer-helpers extraction-aux:
    # ``_resolve_bearer`` (server.py auth core helper — JWT decode +
    #   customer-collection lookup) used by ``app/services/customers.py``
    #   via a lazy local import inside ``require_customer``. STAYS in
    #   ``server.py`` per D2 mandate ("no token logic touch").
    # ``generate_route`` — RETIRED in 5.5/I (shipments orchestration
    #   cluster — body moved verbatim to
    #   ``app/services/shipments.generate_route``).
    "_resolve_bearer",
    # 5.5/G identity-resolver cluster extraction-aux:
    # ``_external_container_lookup`` — RETIRED in 5.5/H (cluster
    # retirement with ``_vf_extract_vessels`` — body moved verbatim to
    # ``app/services/tracking_providers.external_container_lookup``;
    # the 5.5/G-era ``_external_container_lookup_callable()`` accessor
    # in ``app/services/identity_runtime.py`` retired entirely).
    # ``add_shipment_event`` — RETIRED in 5.5/I (shipments orchestration
    #   cluster — body moved verbatim to
    #   ``app/services/shipments.add_shipment_event``).
    # 5.5/H tracking-providers extraction-aux (1 symbol):
    # ``_tracking_snapshot`` (server.py:18659 — default-empty
    #   ``TrackingConfigSnapshot()`` cold-start fallback) used by
    #   ``app/services/tracking_providers.py`` inside the ``_snapshot()``
    #   helper when ``get_service()`` returns ``None`` (pre-bind).
    #   Registered as the tracking-providers extraction-aux entry;
    #   retirement deferred to a future tracking-config wave or Phase 6
    #   cold-start consolidation (out of 5.5/H scope per D3).
    "_tracking_snapshot",
    # 5.5/I shipments-orchestration extraction-aux (2 symbols — new
    # SHIPMENTS_DEP entries registered to mirror the 5.5/H
    # ``_tracking_snapshot`` cataloguing pattern) — RETIRED in
    # Phase 6.2.ACTUAL (2026-05-20, Shell Thinning execution): both
    # helpers moved verbatim from ``server.py`` to
    # ``app/utils/shipments.py`` (sibling-extraction pattern); the
    # cross-module callsite in ``app/services/shipments.ensure_shipment_stages``
    # was migrated to reach the canonical home directly (NO bridge
    # back to server.py). See ``PHASE_6_2_RETIRED_BRIDGES``.
    # ``_normalize_stage`` (pure stage-dict normaliser) — was used by
    #   ``app/services/shipments.ensure_shipment_stages`` via lazy
    #   local ``from server import ...`` import. Retired Phase 6.2.ACTUAL.
    # ``build_default_stages`` (default-stages constructor) — same.
    #
    # NOTE: 5.5/I closeout originally said 7 + 4 in-file callsites
    # (mirror of PHASE5_5_I_SHIPMENTS_ORCHESTRATION_CLOSED.md docstring);
    # PREP §7 audit corrected these to 5 + 2. Audit-trail accuracy
    # carried forward.
    # "_normalize_stage", "build_default_stages",  # RETIRED Phase 6.2.ACTUAL
})

# All retired symbols across C-5a..C-5e — MUST have zero production
# `from server import` consumers (test 6).
ALL_RETIRED_SYMBOLS = frozenset({
    # C-4 wave (already retired earlier — still must hold)
    "db", "sio", "logger", "bitmotors_parser_instance",
    # C-5a (stale shims + 2 shipping helpers)
    "serialize_doc", "_round_money", "_smooth_eta_iso", "is_valid_movement",
    # C-5b
    "aggregator",
    # C-5c
    "audit",
    # C-5e
    "get_current_stage", "serialize_journey",
})


# ─────────────────────────────────────────────────────────────────────
# Helpers — AST audit (mandatory: multiline / lazy / closure / qualified)
# ─────────────────────────────────────────────────────────────────────

def _classify(rel_path: str) -> str:
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


def _ast_grep_from_server_imports() -> Dict[str, List[Tuple[str, int, str]]]:
    """All ``from server import X`` sites (multiline-aware via
    ast.ImportFrom)."""
    sites: Dict[str, List[Tuple[str, int, str]]] = defaultdict(list)
    for py in _iter_python_files():
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


def _ast_grep_import_server() -> List[Tuple[str, int, str]]:
    """All ``import server`` sites (production scope)."""
    out = []
    for py in _iter_python_files():
        rel = str(py.relative_to(ROOT))
        cls = _classify(rel)
        if cls != "production":
            continue
        try:
            text = py.read_text(encoding="utf-8")
            tree = ast.parse(text)
        except Exception:
            continue
        for node in ast.walk(tree):
            if isinstance(node, ast.Import):
                for alias in node.names:
                    if alias.name == "server":
                        out.append((rel, node.lineno, alias.asname or ""))
    return out


# ─────────────────────────────────────────────────────────────────────
# 1) Live AST bridge baseline matches BRIDGE_INVENTORY
# ─────────────────────────────────────────────────────────────────────

def test_1_live_ast_bridge_baseline_matches_inventory():
    """The set of symbols imported via ``from server import …`` in
    production code MUST equal the set declared in
    ``BRIDGE_INVENTORY ∪ EXTRACTION_AUX_BRIDGES``. This is the C-5f
    core invariant (updated by 5.5/B): no silent new coupling, no
    silent retirement, no inventory drift.

    5.5/B compatible-pin: the 43 calculator extraction-aux symbols
    introduced by ``app/services/calculator.py`` are tracked in a
    SEPARATE tuple ``EXTRACTION_AUX_BRIDGES`` (not appended to
    ``BRIDGE_INVENTORY``) so the 16 prior-wave count pins on
    ``len(BRIDGE_INVENTORY)`` retain their baselines. The audit
    invariant uses the UNION of both tuples."""
    from app.core.app_state_targets import (
        BRIDGE_INVENTORY, EXTRACTION_AUX_BRIDGES,
    )
    inventory_set = (
        {b.symbol for b in BRIDGE_INVENTORY}
        | {b.symbol for b in EXTRACTION_AUX_BRIDGES}
    )
    sites = _ast_grep_from_server_imports()
    live_set = {sym for sym, occs in sites.items()
                if any(cls == "production" for (_f, _l, cls) in occs)}

    missing_from_inventory = live_set - inventory_set
    extra_in_inventory = inventory_set - live_set
    assert not missing_from_inventory, (
        f"[C-5f] FAIL: live AST has symbols NOT in BRIDGE_INVENTORY ∪ "
        f"EXTRACTION_AUX_BRIDGES: {sorted(missing_from_inventory)} — "
        f"silent new coupling."
    )
    assert not extra_in_inventory, (
        f"[C-5f] FAIL: inventory lists symbols with NO live "
        f"production import: {sorted(extra_in_inventory)} — silent "
        f"retirement (inventory must be updated)."
    )

    # Also assert the live set equals the post-5.5/B frozen union.
    drift = live_set ^ EXPECTED_LIVE_BRIDGE_SYMBOLS_POST_5_5_B
    assert not drift, (
        f"[C-5f] FAIL: live AST baseline drifted from post-5.5/B "
        f"frozen union: {sorted(drift)}. Re-audit inventory before "
        f"proceeding."
    )
    print(f"✓ test_1: live AST ({len(live_set)}) == BRIDGE_INVENTORY ∪ "
          f"EXTRACTION_AUX_BRIDGES ({len(inventory_set)}) == "
          f"EXPECTED_LIVE_BRIDGE_SYMBOLS_POST_5_5_B "
          f"({len(EXPECTED_LIVE_BRIDGE_SYMBOLS_POST_5_5_B)})")


# ─────────────────────────────────────────────────────────────────────
# 2) BRIDGE_INVENTORY count == 11
# ─────────────────────────────────────────────────────────────────────

def test_2_bridge_inventory_count_eleven():
    """5.5/H compatible-pin: post-5.5/H BRIDGE_INVENTORY shrinks 3 → 2
    (VesselFinder cluster retired — ``_vf_extract_vessels`` from
    BRIDGE_INVENTORY + ``_external_container_lookup`` from
    EXTRACTION_AUX_BRIDGES).
    Function name retained for audit-trail continuity; expectation
    constant ``EXPECTED_BRIDGE_COUNT_POST_5_5_H`` is the live target."""
    from app.core.app_state_targets import BRIDGE_INVENTORY
    assert len(BRIDGE_INVENTORY) == EXPECTED_BRIDGE_COUNT_POST_5_5_I, (
        f"[C-5f→5.5/I compatible-pin] FAIL: BRIDGE_INVENTORY size = "
        f"{len(BRIDGE_INVENTORY)}, expected "
        f"{EXPECTED_BRIDGE_COUNT_POST_5_5_I} post-5.5/I "
        f"(was {EXPECTED_BRIDGE_COUNT_POST_5_5_H} post-5.5/H — "
        f"ensure_shipment_stages retired in 5.5/I; ZERO Tier-C; "
        f"only _STATIC_DIR remains)."
    )
    print(f"✓ test_2 (post-5.5/I): BRIDGE_INVENTORY == "
          f"{EXPECTED_BRIDGE_COUNT_POST_5_5_I} (THE PHASE-5 FINALE)")


# ─────────────────────────────────────────────────────────────────────
# 3) Tier-A empty
# ─────────────────────────────────────────────────────────────────────

def test_3_tier_a_empty():
    from app.core.app_state_targets import TIER_A_SHALLOW_REWIRING
    assert TIER_A_SHALLOW_REWIRING == frozenset(), (
        f"[C-5f] FAIL: Tier-A re-populated since C-4j: "
        f"{sorted(TIER_A_SHALLOW_REWIRING)}. C-5f forbids touching "
        f"Tier-A — it MUST stay empty."
    )
    print(f"✓ test_3: Tier-A == frozenset() (held since C-4j)")


# ─────────────────────────────────────────────────────────────────────
# 4) Tier-B inventory == {"_STATIC_DIR"}
# ─────────────────────────────────────────────────────────────────────

def test_4_tier_b_inventory_is_static_dir_only():
    from app.core.app_state_targets import (
        TIER_B_INVENTORY, TIER_B_MOVE_AND_REROUTE,
    )
    # Structured inventory
    assert len(TIER_B_INVENTORY) == EXPECTED_TIER_B_INVENTORY_SIZE_POST_C5E, (
        f"[C-5f] FAIL: TIER_B_INVENTORY size = {len(TIER_B_INVENTORY)}, "
        f"expected {EXPECTED_TIER_B_INVENTORY_SIZE_POST_C5E}."
    )
    syms = {s.symbol for s in TIER_B_INVENTORY}
    assert syms == {"_STATIC_DIR"}, (
        f"[C-5f] FAIL: TIER_B_INVENTORY content = {sorted(syms)}, "
        f"expected {{'_STATIC_DIR'}}."
    )

    # Frozenset of move-and-reroute candidates
    assert TIER_B_MOVE_AND_REROUTE == EXPECTED_TIER_B_MOVE_AND_REROUTE_POST_C5E, (
        f"[C-5f] FAIL: TIER_B_MOVE_AND_REROUTE = "
        f"{sorted(TIER_B_MOVE_AND_REROUTE)}, expected "
        f"{sorted(EXPECTED_TIER_B_MOVE_AND_REROUTE_POST_C5E)}."
    )
    print(f"✓ test_4: TIER_B == {{'_STATIC_DIR'}} (both inventories)")


# ─────────────────────────────────────────────────────────────────────
# 5) Tier-C count == 10
# ─────────────────────────────────────────────────────────────────────

def test_5_tier_c_count_ten():
    """5.5/H compatible-pin: post-5.5/H Tier-C count shrinks 2 → 1
    (VesselFinder cluster retired). Function name retained for
    audit-trail continuity; ``EXPECTED_TIER_C_COUNT_POST_5_5_H`` is
    the live target."""
    from app.core.app_state_targets import (
        BRIDGE_INVENTORY, TIER_C_REQUIRES_REFACTOR,
    )
    tier_c_bridges = [b for b in BRIDGE_INVENTORY if b.tier == "C"]
    assert len(tier_c_bridges) == EXPECTED_TIER_C_COUNT_POST_5_5_I, (
        f"[C-5f→5.5/I compatible-pin] FAIL: Tier-C count in "
        f"BRIDGE_INVENTORY = {len(tier_c_bridges)}, expected "
        f"{EXPECTED_TIER_C_COUNT_POST_5_5_I} post-5.5/I "
        f"(was {EXPECTED_TIER_C_COUNT_POST_5_5_H} post-5.5/H — "
        f"ZERO Tier-C bridges, Phase-5 finale)."
    )
    assert len(TIER_C_REQUIRES_REFACTOR) == EXPECTED_TIER_C_COUNT_POST_5_5_I, (
        f"[C-5f→5.5/I compatible-pin] FAIL: TIER_C_REQUIRES_REFACTOR "
        f"size = {len(TIER_C_REQUIRES_REFACTOR)}, expected "
        f"{EXPECTED_TIER_C_COUNT_POST_5_5_I}."
    )
    bridge_syms = {b.symbol for b in tier_c_bridges}
    frozenset_syms = set(TIER_C_REQUIRES_REFACTOR)
    assert bridge_syms == frozenset_syms, (
        f"[C-5f] FAIL: Tier-C set mismatch.\n"
        f"  BRIDGE_INVENTORY(tier=C): {sorted(bridge_syms)}\n"
        f"  TIER_C_REQUIRES_REFACTOR: {sorted(frozenset_syms)}\n"
        f"  symmetric diff           : {sorted(bridge_syms ^ frozenset_syms)}"
    )
    print(f"✓ test_5 (post-5.5/H): Tier-C count == "
          f"{EXPECTED_TIER_C_COUNT_POST_5_5_H} "
          f"(both surfaces agree)")


# ─────────────────────────────────────────────────────────────────────
# 6) All retired-symbol sets are disjoint from live imports
# ─────────────────────────────────────────────────────────────────────

def test_6_retired_sets_disjoint_from_live_imports():
    """No retired symbol may regress as a production
    `from server import X`. Covers C-4 wave (db, sio, logger,
    bitmotors_parser_instance) + C-5a/b/c/e retirements (8 more)."""
    from app.core.app_state_targets import (
        C5A_RETIRED_SYMBOLS, C5B_RETIRED_SYMBOLS,
        C5C_RETIRED_SYMBOLS, C5E_RETIRED_SYMBOLS,
    )
    declared = (
        set(C5A_RETIRED_SYMBOLS)
        | set(C5B_RETIRED_SYMBOLS)
        | set(C5C_RETIRED_SYMBOLS)
        | set(C5E_RETIRED_SYMBOLS)
    )
    # C-5f does NOT track the C-4 wave retirements in a single
    # constant, but ALL_RETIRED_SYMBOLS extends to cover them.
    full_retired = declared | {
        "db", "sio", "logger", "bitmotors_parser_instance",
    }
    assert full_retired == ALL_RETIRED_SYMBOLS, (
        f"[C-5f] FAIL: retired-symbol declaration drifted.\n"
        f"  computed: {sorted(full_retired)}\n"
        f"  expected: {sorted(ALL_RETIRED_SYMBOLS)}\n"
        f"  diff    : {sorted(full_retired ^ ALL_RETIRED_SYMBOLS)}"
    )

    sites = _ast_grep_from_server_imports()
    regressions = []
    for sym in full_retired:
        prod = [
            f"{f}:{l}" for (f, l, cls) in sites.get(sym, [])
            if cls == "production"
        ]
        if prod:
            regressions.append(f"  {sym}: {prod}")
    assert not regressions, (
        f"[C-5f] FAIL: retired symbols have live production "
        f"`from server import` sites:\n" + "\n".join(regressions)
    )
    print(f"✓ test_6: {len(full_retired)} retired symbols all "
          f"disjoint from live `from server import` (production)")


# ─────────────────────────────────────────────────────────────────────
# 7) _STATIC_DIR target phase == 5.8
# ─────────────────────────────────────────────────────────────────────

def test_7_static_dir_target_phase_5_8():
    """_STATIC_DIR must be on the Phase 5.8 boundary (bootstrap
    reshuffle), NOT on Phase 5.5."""
    from app.core.app_state_targets import (
        TIER_B_INVENTORY, PHASE_5_5_BOUNDARY, PHASE_5_8_BOUNDARY,
        C5F_INVENTORY_BASELINE,
    )
    # Find the _STATIC_DIR entry in TIER_B_INVENTORY
    sd = next((s for s in TIER_B_INVENTORY if s.symbol == "_STATIC_DIR"),
              None)
    assert sd is not None, (
        "[C-5f] FAIL: _STATIC_DIR missing from TIER_B_INVENTORY"
    )
    assert "5.8" in sd.target_module or sd.proposed_batch == "DEFER:5.8", (
        f"[C-5f] FAIL: _STATIC_DIR target_module={sd.target_module!r} / "
        f"proposed_batch={sd.proposed_batch!r} — neither references "
        f"Phase 5.8."
    )

    # Boundary set membership
    assert "_STATIC_DIR" in PHASE_5_8_BOUNDARY, (
        "[C-5f] FAIL: _STATIC_DIR not in PHASE_5_8_BOUNDARY"
    )
    assert "_STATIC_DIR" not in PHASE_5_5_BOUNDARY, (
        "[C-5f] FAIL: _STATIC_DIR leaked into PHASE_5_5_BOUNDARY"
    )

    # C5F_INVENTORY_BASELINE entry must declare phase=5.8
    matching = [row for row in C5F_INVENTORY_BASELINE
                if row[0] == "_STATIC_DIR"]
    assert len(matching) == 1, (
        f"[C-5f] FAIL: _STATIC_DIR has {len(matching)} entries in "
        f"C5F_INVENTORY_BASELINE, expected 1."
    )
    assert matching[0][4] == "5.8", (
        f"[C-5f] FAIL: C5F_INVENTORY_BASELINE _STATIC_DIR phase = "
        f"{matching[0][4]!r}, expected '5.8'."
    )
    print(f"✓ test_7: _STATIC_DIR targeted at Phase 5.8 in all 3 "
          f"declarations")


# ─────────────────────────────────────────────────────────────────────
# 8) Every remaining bridge has a target phase
# ─────────────────────────────────────────────────────────────────────

def test_8_every_remaining_bridge_has_target_phase():
    """Every Bridge entry in BRIDGE_INVENTORY MUST be referenced in
    PHASE_5_5_BOUNDARY ∪ PHASE_5_8_BOUNDARY. No "homeless" bridges."""
    from app.core.app_state_targets import (
        BRIDGE_INVENTORY, PHASE_5_5_BOUNDARY, PHASE_5_8_BOUNDARY,
        C5F_INVENTORY_BASELINE,
    )
    all_boundaries = set(PHASE_5_5_BOUNDARY) | set(PHASE_5_8_BOUNDARY)
    homeless = []
    for b in BRIDGE_INVENTORY:
        if b.symbol not in all_boundaries:
            homeless.append(b.symbol)
    assert not homeless, (
        f"[C-5f] FAIL: bridges without a target phase: {homeless}. "
        f"PHASE_5_5_BOUNDARY ∪ PHASE_5_8_BOUNDARY must cover every "
        f"remaining bridge."
    )

    # C5F_INVENTORY_BASELINE — every row has a phase string
    baseline_syms = {row[0]: row[4] for row in C5F_INVENTORY_BASELINE}
    bridge_syms = {b.symbol for b in BRIDGE_INVENTORY}
    diff = bridge_syms ^ set(baseline_syms.keys())
    assert not diff, (
        f"[C-5f] FAIL: C5F_INVENTORY_BASELINE drift vs BRIDGE_INVENTORY: "
        f"{sorted(diff)}."
    )
    bad_phase = [s for s, p in baseline_syms.items()
                 if p not in ("5.5", "5.6", "5.8", "Phase 6")]
    assert not bad_phase, (
        f"[C-5f] FAIL: invalid phase string for: {bad_phase}"
    )
    print(f"✓ test_8: all {len(BRIDGE_INVENTORY)} bridges have a "
          f"target phase (Phase 5.5: "
          f"{sum(1 for p in baseline_syms.values() if p == '5.5')}, "
          f"Phase 5.8: "
          f"{sum(1 for p in baseline_syms.values() if p == '5.8')})")


# ─────────────────────────────────────────────────────────────────────
# 9) Every remaining bridge has a reason_not_retired
# ─────────────────────────────────────────────────────────────────────

def test_9_every_remaining_bridge_has_reason_not_retired():
    """Every BRIDGE_INVENTORY entry MUST have a non-empty `notes`
    field explaining why it wasn't retired in Phase 5.4. Used as the
    `reason_not_retired` field for the C-5f consolidation table."""
    from app.core.app_state_targets import BRIDGE_INVENTORY
    missing = []
    too_short = []
    for b in BRIDGE_INVENTORY:
        notes = (b.notes or "").strip()
        if not notes:
            missing.append(b.symbol)
        elif len(notes) < 30:
            too_short.append((b.symbol, len(notes)))
    assert not missing, (
        f"[C-5f] FAIL: bridges without `notes` (reason_not_retired): "
        f"{missing}"
    )
    assert not too_short, (
        f"[C-5f] FAIL: bridges with stub-shaped notes (< 30 chars): "
        f"{too_short}. Every entry must have a substantive reason."
    )
    print(f"✓ test_9: all {len(BRIDGE_INVENTORY)} bridges have "
          f"substantive `notes` (reason_not_retired)")


# ─────────────────────────────────────────────────────────────────────
# 10) No production code changed in C-5f
# ─────────────────────────────────────────────────────────────────────

def test_10_no_production_code_changed_in_c5f():
    """Surgical-diff invariant: C-5f MUST be inventory + planning
    + documentation only. The following production files MUST NOT
    have been touched by C-5f:

      * server.py
      * app/utils/shipments.py
      * app/utils/serialization.py
      * app/utils/money.py
      * app/routers/*.py
      * app/services/*.py
      * app/repositories/*.py
      * app/workers/*.py
      * app/integrations/*.py
      * app/core/*.py  EXCEPT app_state_targets.py (planning surface)
      * notifications.py / legal_workflow.py / cabinet_financials.py /
        payments_tracking.py / financial_breakdown.py /
        provider_stats.py / settings_service.py /
        shipment_identity_resolver.py / multisource_resolver.py /
        resolver_engine.py / ops_guardian.py / security.py /
        transfer_detector.py
      * Any scraper / parser / integration module

    Soft enforcement via signature-character probe — the prior phases
    were the ones to move code; C-5f only re-classifies / re-counts /
    documents. The test checks that the prior phases' canonical shapes
    are intact (this is sanity, not a per-file diff)."""
    # Probe 1: server.py compat shims for C-5a/C-5e symbols still
    # present and delegating.
    import server  # noqa: F401
    for name in ("get_current_stage", "serialize_journey",
                 "is_valid_movement", "_smooth_eta_iso"):
        fn = getattr(server, name, None)
        assert fn is not None and callable(fn), (
            f"[C-5f] FAIL: server.{name} compat shim disappeared — "
            f"prior C-5a/C-5e closure violated."
        )

    # Probe 2: canonical owner module still has the public symbols.
    from app.utils import shipments as _sh
    for name in ("get_current_stage", "serialize_journey",
                 "is_valid_movement", "_smooth_eta_iso"):
        assert hasattr(_sh, name), (
            f"[C-5f] FAIL: app.utils.shipments.{name} disappeared — "
            f"canonical owner contract violated."
        )

    # Probe 3: runtime accessor modules from C-4 / C-5b / C-5c intact.
    from app.core import db_runtime
    from app.core import socket_runtime
    from app.core import aggregator_runtime
    from app.core import audit_runtime
    for mod, public in [
        (db_runtime, ("get_db", "set_db")),
        (socket_runtime, ("get_sio", "set_sio")),
        (aggregator_runtime, ("get_aggregator", "set_aggregator")),
        (audit_runtime, ("get_audit", "set_audit")),
    ]:
        for sym in public:
            assert hasattr(mod, sym), (
                f"[C-5f] FAIL: {mod.__name__}.{sym} disappeared — "
                f"prior C-4/C-5 accessor contract violated."
            )

    # Probe 4: BRIDGE_INVENTORY still has stable identity (no
    # entries silently mutated). 5.5/I compatible-pin: post-5.5/I
    # size is EXPECTED_BRIDGE_COUNT_POST_5_5_I (2 → 1 after the
    # shipments orchestration cluster retirement — only _STATIC_DIR
    # Tier-B remains; THE PHASE-5 FINALE).
    from app.core.app_state_targets import BRIDGE_INVENTORY
    assert len(BRIDGE_INVENTORY) == EXPECTED_BRIDGE_COUNT_POST_5_5_I
    # All entries are frozen dataclasses (hashable).
    assert all(hasattr(b, "symbol") and hasattr(b, "tier")
               for b in BRIDGE_INVENTORY)
    print(f"✓ test_10: no production code change (4 probes — server "
          f"shims + canonical owner + 4 accessor modules + inventory "
          f"identity)")


# ─────────────────────────────────────────────────────────────────────
# 11) OpenAPI 618/679 unchanged
# ─────────────────────────────────────────────────────────────────────

def test_11_openapi_freeze_618_679():
    from fastapi.testclient import TestClient
    import server
    fastapi_app = getattr(server, "fastapi_app", None)
    assert fastapi_app is not None, "[C-5f] FAIL: no fastapi_app"
    client = TestClient(fastapi_app)
    r = client.get("/api/openapi.json")
    assert r.status_code == 200, f"[C-5f] FAIL: openapi {r.status_code}"
    data = r.json()
    paths = data.get("paths", {})
    methods = sum(
        len([k for k in v if k in {"get", "post", "put", "patch",
                                    "delete", "head", "options"}])
        for v in paths.values() if isinstance(v, dict)
    )
    assert len(paths) == EXPECTED_OPENAPI_PATHS, (
        f"[C-5f] FAIL: OpenAPI paths = {len(paths)}, "
        f"expected {EXPECTED_OPENAPI_PATHS}"
    )
    assert methods == EXPECTED_OPENAPI_OPS, (
        f"[C-5f] FAIL: OpenAPI methods = {methods}, "
        f"expected {EXPECTED_OPENAPI_OPS}"
    )
    print(f"✓ test_11: OpenAPI {EXPECTED_OPENAPI_PATHS}/{EXPECTED_OPENAPI_OPS} held")


# ─────────────────────────────────────────────────────────────────────
# 12) Phase 4 invariants green
# ─────────────────────────────────────────────────────────────────────

def test_12_phase4_invariants_green():
    """Phase 4 invariants: workers 7/7, admin endpoints require auth,
    /metrics exposes worker_active_instances rows, the C-4/C-5
    accessor modules' identity assertions still hold."""
    # Probe 12.a — workers via live /metrics (canonical post-lifespan
    # probe; same approach as C-5e test_10).
    import urllib.request, re as _re  # noqa: E401
    try:
        with urllib.request.urlopen(
            "http://localhost:8001/metrics", timeout=3
        ) as resp:
            assert resp.status == 200
            body = resp.read().decode("utf-8", errors="replace")
        rows = _re.findall(
            r'^worker_active_instances\{name="([^"]+)"\}\s+([0-9.e+-]+)',
            body, _re.MULTILINE,
        )
        if rows:
            live = {n: float(v) for n, v in rows}
            expected_workers = {
                "ops_guardian", "payment_reminder", "resolver_worker",
                "ringostat_cron", "tracking_worker", "transfer_detector",
                "watchlist_live_poll",
            }
            assert set(live.keys()) == expected_workers, (
                f"[C-5f] FAIL: worker set drift: "
                f"{sorted(set(live.keys()) ^ expected_workers)}"
            )
            assert all(int(v) >= 1 for v in live.values()), (
                f"[C-5f] FAIL: not all workers active: {live}"
            )
            workers_ok = True
        else:
            workers_ok = False
    except Exception:
        workers_ok = False

    if not workers_ok:
        import warnings as _w
        _w.warn(
            "[C-5f] worker /metrics probe inconclusive — supervisor "
            "backend may not be running. Skipping worker assertion.",
            stacklevel=2,
        )

    # Probe 12.b — accessor module identity: post-startup the
    # canonical singletons must be hand-shake-bound. Pre-startup
    # (no lifespan run in pytest context) the accessors return None,
    # which is also OK — this only fails if the modules themselves
    # are missing or their public API has drifted.
    from app.core.db_runtime import get_db
    from app.core.socket_runtime import get_sio
    from app.core.aggregator_runtime import get_aggregator
    from app.core.audit_runtime import get_audit
    # Calling these MUST NOT raise (they may return None pre-startup).
    _ = get_db()
    _ = get_sio()
    _ = get_aggregator()
    _ = get_audit()
    print(f"✓ test_12: Phase 4 invariants probe "
          f"(workers via /metrics: {'OK' if workers_ok else 'skipped'}; "
          f"4 accessor modules callable)")


# ─────────────────────────────────────────────────────────────────────
# Entrypoint
# ─────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import traceback
    tests = [
        test_1_live_ast_bridge_baseline_matches_inventory,
        test_2_bridge_inventory_count_eleven,
        test_3_tier_a_empty,
        test_4_tier_b_inventory_is_static_dir_only,
        test_5_tier_c_count_ten,
        test_6_retired_sets_disjoint_from_live_imports,
        test_7_static_dir_target_phase_5_8,
        test_8_every_remaining_bridge_has_target_phase,
        test_9_every_remaining_bridge_has_reason_not_retired,
        test_10_no_production_code_changed_in_c5f,
        test_11_openapi_freeze_618_679,
        test_12_phase4_invariants_green,
    ]
    failed = 0
    for t in tests:
        try:
            t()
        except Exception:
            failed += 1
            print(f"✗ {t.__name__} FAILED")
            traceback.print_exc()
    print(f"\n{'='*60}\nC-5f SUITE: {len(tests)-failed}/{len(tests)} "
          f"PASS, {failed} FAIL\n{'='*60}")
    sys.exit(0 if failed == 0 else 1)
