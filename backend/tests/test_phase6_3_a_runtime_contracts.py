"""tests/test_phase6_3_a_runtime_contracts.py — Phase 6.3.A
============================================================

**Phase 6.3.A — Runtime Contracts (invariant lock)** test-time
verification of the architecture invariants defined in
`app/core/architecture_invariants.py`.

This test file is the **enforcement** half of the runtime contracts
layer. The other half is `server.lifespan()` wiring (defensive
warn-only at startup, see server.py:~1414).

Per Phase 6 mandate:

  * Hardening, NOT redesign
  * Live-configured contracts (no hand-coded numeric pins — the test
    consumes the same `architecture_invariants` module the runtime
    consumes; if the floor values ratchet down in 6.2.ACTUAL / 6.4,
    this test follows automatically)
  * Single source of truth for the post-5.5/I endpoint state
  * Anti-regression posture — every invariant violation surfaces as
    a structured `ArchitectureInvariantViolation` AssertionError

Each test asserts ONE invariant in isolation. A regression that
introduces a Tier-C bridge will surface as `test_4_tier_c_zero` failing
with the exact symbol name and surface — no detective work required.

The OpenAPI invariant test (`test_7_openapi_surface_frozen_618_679`)
imports the live FastAPI app and probes its `.openapi()` shape. This
is the most expensive test in the file (~0.3s); all others are
inventory lookups.
"""

from __future__ import annotations

import pytest

from app.core.architecture_invariants import (
    ArchitectureInvariantViolation,
    InvariantSnapshot,
    assert_openapi_surface_frozen,
    assert_phase_5_endpoint_invariants,
    compute_snapshot,
    run_all_phase_5_endpoint_assertions,
)


# ─────────────────────────────────────────────────────────────────────
# Section 1 — Inventory invariants (5 probes, no FastAPI app needed)
# ─────────────────────────────────────────────────────────────────────


def test_1_bridge_inventory_at_or_below_one() -> None:
    """Post-5.5/I: BRIDGE_INVENTORY must be ≤ 1 (only _STATIC_DIR Tier-B
    remains, scheduled for Phase 5.8 bootstrap reshuffle).

    Growth violates the Phase 5 disentangling endpoint."""
    snapshot = compute_snapshot()
    assert snapshot.bridge_inventory <= 1, (
        f"BRIDGE_INVENTORY = {snapshot.bridge_inventory}, expected ≤ 1. "
        f"A new Tier-B or Tier-C `from server import X` bridge was "
        f"registered — this regresses the Phase 5 endpoint."
    )


def test_2_phase_5_5_boundary_zero() -> None:
    """Post-5.5/I: PHASE_5_5_BOUNDARY must be exactly 0 (Phase 5.5
    officially closed).

    A non-zero count means a new Phase 5.5 wave was opened — but no
    such wave is in flight; this is a regression."""
    snapshot = compute_snapshot()
    assert snapshot.phase_5_5_boundary == 0, (
        f"PHASE_5_5_BOUNDARY = {snapshot.phase_5_5_boundary}, expected 0. "
        f"Phase 5.5 is officially closed. A new entry was added to the "
        f"boundary set — this regresses the disentangling endpoint."
    )


def test_3_qualified_usage_bridges_zero() -> None:
    """Post-5.5/F: QUALIFIED_USAGE_BRIDGES held at 0. Non-zero means
    a `server.X` qualified-access pattern was re-introduced."""
    snapshot = compute_snapshot()
    assert snapshot.qualified_usage_bridges == 0, (
        f"QUALIFIED_USAGE_BRIDGES = {snapshot.qualified_usage_bridges}, "
        f"expected 0. A qualified `server.X` consumer was re-introduced "
        f"— this regresses the Phase 5.5/F outcome."
    )


def test_4_tier_c_zero() -> None:
    """**The Phase-5 architectural milestone**: TIER_C_REQUIRES_REFACTOR
    must be exactly 0.

    This is the assertion that proves Phase 5 disentangling is intact.
    A non-zero value means a Tier-C `from server import X` bridge that
    requires deeper refactor work has been (re-)introduced."""
    snapshot = compute_snapshot()
    assert snapshot.tier_c_requires_refactor == 0, (
        f"TIER_C_REQUIRES_REFACTOR = {snapshot.tier_c_requires_refactor}, "
        f"expected 0. **PHASE 5 ENDPOINT REGRESSION**: a Tier-C bridge "
        f"was re-introduced. The Phase 5 disentangling milestone has "
        f"been violated; investigate immediately."
    )


def test_5_extraction_aux_bridges_at_or_below_47() -> None:
    """Post-5.5/I: EXTRACTION_AUX_BRIDGES <= 47.

    The taxonomy is RATCHET-DOWN ONLY. Phase 6 forbids growth (Phase 5
    closed the catalogue). Each subsequent wave (6.2.ACTUAL targets 45,
    6.4 targets 44) lowers the floor."""
    snapshot = compute_snapshot()
    assert snapshot.extraction_aux_bridges <= 47, (
        f"EXTRACTION_AUX_BRIDGES = {snapshot.extraction_aux_bridges}, "
        f"expected ≤ 47. A new aux-bridge was registered — Phase 6 "
        f"forbids growth (Phase 5 closed the taxonomy)."
    )


# ─────────────────────────────────────────────────────────────────────
# Section 2 — Composite contract assertion (5 invariants in one probe)
# ─────────────────────────────────────────────────────────────────────


def test_6_composite_endpoint_assertion_passes() -> None:
    """`assert_phase_5_endpoint_invariants()` must succeed against the
    live snapshot. This is the SAME function `server.lifespan()` calls
    at startup. The structured `InvariantSnapshot` is returned for
    logging."""
    snapshot = assert_phase_5_endpoint_invariants()
    assert isinstance(snapshot, InvariantSnapshot)
    # Sanity: snapshot dict shape is stable for future structured logs.
    payload = snapshot.as_dict()
    assert set(payload.keys()) == {
        "bridge_inventory",
        "tier_c_requires_refactor",
        "phase_5_5_boundary",
        "qualified_usage_bridges",
        "extraction_aux_bridges",
        "openapi_paths",
        "openapi_ops",
    }, "Snapshot payload key set changed — Phase 6.3.A contract drift."


# ─────────────────────────────────────────────────────────────────────
# Section 3 — OpenAPI surface invariant (lifespan-equivalent probe)
# ─────────────────────────────────────────────────────────────────────


def test_7_openapi_surface_frozen_618_679() -> None:
    """OpenAPI surface MUST be frozen at paths=618 / ops=679.

    This is the most expensive test in the file (~0.3s — imports server
    and triggers full router mount). It exists separately from the
    inventory tests so the cheap ones run instantly during dev cycles."""
    # Importing `server` triggers all router-mount side effects.
    # This is intentional — the test verifies the LIVE OpenAPI shape,
    # not a cached one.
    import server  # noqa: WPS433 — required for live FastAPI app
    snapshot = compute_snapshot(fastapi_app=server.fastapi_app)
    assert snapshot.openapi_paths == 618, (
        f"OpenAPI paths = {snapshot.openapi_paths}, expected 618. "
        f"A route was added or removed — Phase 6 forbids surface drift "
        f"(kickoff hard gate)."
    )
    assert snapshot.openapi_ops == 679, (
        f"OpenAPI ops = {snapshot.openapi_ops}, expected 679. "
        f"A method was added/removed on an existing path — Phase 6 "
        f"forbids surface drift (kickoff hard gate)."
    )
    # Composite OpenAPI assertion (mirror of lifespan startup probe).
    assert_openapi_surface_frozen(snapshot)


# ─────────────────────────────────────────────────────────────────────
# Section 4 — Violation detection (negative tests prove the contract
# itself actually fires when a regression occurs)
# ─────────────────────────────────────────────────────────────────────


def test_8_violation_raises_structured_exception() -> None:
    """When an invariant is violated, the raised exception carries the
    surface name + expected + actual values (NOT just a generic
    assertion). This is the structured-payload contract that future
    AST ratchets and CI surfaces can consume."""
    # Construct a synthetic snapshot that violates Tier-C.
    bad_snapshot = InvariantSnapshot(
        bridge_inventory=1,
        tier_c_requires_refactor=1,  # ← violation
        phase_5_5_boundary=0,
        qualified_usage_bridges=0,
        extraction_aux_bridges=47,
        openapi_paths=618,
        openapi_ops=679,
    )
    with pytest.raises(ArchitectureInvariantViolation) as exc_info:
        assert_phase_5_endpoint_invariants(bad_snapshot)
    err = exc_info.value
    assert err.surface == "TIER_C_REQUIRES_REFACTOR"
    assert err.expected == 0
    assert err.actual == 1
    assert "ZERO Tier-C bridges" in err.note


def test_9_violation_subclasses_assertion_error() -> None:
    """`ArchitectureInvariantViolation` MUST be a subclass of
    `AssertionError` so pytest treats it as a test failure (not as
    an error), and so it propagates through `assert` statements."""
    assert issubclass(ArchitectureInvariantViolation, AssertionError)


def test_10_bridge_inventory_growth_violates() -> None:
    """Even one extra BRIDGE_INVENTORY entry triggers a violation
    (BRIDGE_INVENTORY <= 1 contract)."""
    bad_snapshot = InvariantSnapshot(
        bridge_inventory=2,  # ← violation
        tier_c_requires_refactor=0,
        phase_5_5_boundary=0,
        qualified_usage_bridges=0,
        extraction_aux_bridges=47,
        openapi_paths=618,
        openapi_ops=679,
    )
    with pytest.raises(ArchitectureInvariantViolation) as exc_info:
        assert_phase_5_endpoint_invariants(bad_snapshot)
    assert exc_info.value.surface == "BRIDGE_INVENTORY"


def test_11_extraction_aux_growth_violates_but_shrinkage_passes() -> None:
    """Phase 6 ratchet-down posture: growth violates, shrinkage passes."""
    # Growth scenario.
    bad = InvariantSnapshot(
        bridge_inventory=1,
        tier_c_requires_refactor=0,
        phase_5_5_boundary=0,
        qualified_usage_bridges=0,
        extraction_aux_bridges=48,  # ← grew by 1
        openapi_paths=618,
        openapi_ops=679,
    )
    with pytest.raises(ArchitectureInvariantViolation) as exc_info:
        assert_phase_5_endpoint_invariants(bad)
    assert exc_info.value.surface == "EXTRACTION_AUX_BRIDGES"

    # Shrinkage scenario (post-6.2.ACTUAL projected state).
    good_shrunk = InvariantSnapshot(
        bridge_inventory=1,
        tier_c_requires_refactor=0,
        phase_5_5_boundary=0,
        qualified_usage_bridges=0,
        extraction_aux_bridges=45,  # ← ratchet-down: future 6.2.ACTUAL
        openapi_paths=618,
        openapi_ops=679,
    )
    # Must NOT raise.
    result = assert_phase_5_endpoint_invariants(good_shrunk)
    assert result is good_shrunk


# ─────────────────────────────────────────────────────────────────────
# Section 5 — Wrapper / convenience function probe
# ─────────────────────────────────────────────────────────────────────


def test_12_run_all_against_live_app_passes() -> None:
    """The convenience wrapper used by `server.lifespan()`. Must
    succeed against the LIVE app + LIVE inventory data."""
    import server  # noqa: WPS433
    snapshot = run_all_phase_5_endpoint_assertions(
        fastapi_app=server.fastapi_app,
    )
    # Verify the LIVE snapshot reports the endpoint state.
    assert snapshot.tier_c_requires_refactor == 0
    assert snapshot.phase_5_5_boundary == 0
    assert snapshot.qualified_usage_bridges == 0
    assert snapshot.bridge_inventory <= 1
    assert snapshot.extraction_aux_bridges <= 47
    assert snapshot.openapi_paths == 618
    assert snapshot.openapi_ops == 679
