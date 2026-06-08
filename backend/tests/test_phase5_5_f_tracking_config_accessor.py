"""
Phase 5.5 / F — Tracking config service qualified-access RETIREMENT.
=====================================================================

Single-site, low-risk retirement of the last non-payments
qualified-access bridge. The closure-local
``getattr(server, "tracking_config_service", None)`` inside
``app/routers/admin_integrations.py::_tracking_env_keys`` was migrated
to ``app.services.tracking_config.get_service`` — a new module-level
accessor that follows the established C-5b/C-5c runtime-accessor
pattern (mirror of ``app.core.aggregator_runtime.get_aggregator`` and
``app.core.audit_runtime.get_audit``).

Mandate (verbatim):
  * убрать ``getattr(server, "tracking_config_service", ...)``
  * заменить на canonical accessor / import
  * не трогать tracking logic
  * не трогать tracking config semantics
  * не трогать service lifecycle

Expected post-state:
  * QUALIFIED_USAGE_BRIDGES: 2 → **1** (only ``_create_order_from_invoice``
    in payments.py remains)
  * PHASE_5_5_BOUNDARY: 11 → **10** (``tracking_config_service`` gone)
  * Function-local ``import server`` in ``_tracking_env_keys`` removed
  * OpenAPI 618/679 — invariant holds
  * Cold-start semantics ("service not yet bound → all-empty dict")
    PRESERVED 1:1

Test surface (8 contract clauses):

  1. ``app.services.tracking_config`` exports ``set_service``,
     ``get_service``, and ``clear_service_for_tests`` callables.
  2. ``app.services.tracking_config`` has a module-private
     ``_service_ref`` reference cell, initial value None at
     module-load time (verified via ``clear_service_for_tests``).
  3. ``set_service`` + ``get_service`` round-trip preserves object
     identity (the cell stores the same object, not a copy).
  4. ``app/routers/admin_integrations.py::_tracking_env_keys`` no
     longer has any ``server.X`` qualified attribute access; no
     ``import server`` line anywhere in the file.
  5. ``_tracking_env_keys`` imports ``get_service`` from the
     canonical home (AST-level check on the ``ImportFrom`` shape).
  6. Cold-start parity: with ``clear_service_for_tests`` called,
     ``_tracking_env_keys()`` returns the 5-key all-empty dict
     (identical to the pre-5.5/F fallback shape).
  7. Bound parity: with a stub TrackingConfigService bound via
     ``set_service``, ``_tracking_env_keys()`` returns the same
     5-key UPPER_SNAKE dict that ``service.snapshot().as_legacy_env_dict()``
     returns directly (no transformation, no key drift).
  8. Inventory invariants — ``QUALIFIED_USAGE_BRIDGES`` count = 1,
     ``PHASE_5_5_F_RETIRED_QUALIFIED_SITES`` records the
     ``(tracking_config_service, app/routers/admin_integrations.py)``
     tuple, ``tracking_config_service`` removed from
     ``PHASE_5_5_BOUNDARY``.
  9. OpenAPI freeze: 618 paths / 679 methods.

Run:
    cd /app/backend && python -m pytest tests/test_phase5_5_f_tracking_config_accessor.py -v
"""
from __future__ import annotations

import ast
import os
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")
os.environ.setdefault("DB_NAME", "test_database")

ADMIN_INTEGRATIONS_PY = ROOT / "app" / "routers" / "admin_integrations.py"
TRACKING_CONFIG_PY = ROOT / "app" / "services" / "tracking_config.py"


def _read(p: Path) -> str:
    return p.read_text(encoding="utf-8")


# ─────────────────────────────────────────────────────────────────────
# 1) Accessor module exports
# ─────────────────────────────────────────────────────────────────────

def test_1_tracking_config_module_exports_accessor_trio():
    """``app.services.tracking_config`` must publish the three
    accessor functions ``set_service``, ``get_service``, and
    ``clear_service_for_tests`` (matching the C-5b/C-5c precedent)."""
    import server  # noqa: F401 — ensure import order is server-first
    import app.services.tracking_config as tc

    for name in ("set_service", "get_service", "clear_service_for_tests"):
        fn = getattr(tc, name, None)
        assert callable(fn), (
            f"[5.5/F] FAIL: app.services.tracking_config.{name} is not "
            f"callable: {fn!r}"
        )

    # __all__ contract
    assert hasattr(tc, "__all__"), (
        "[5.5/F] FAIL: tracking_config has no __all__ — accessor "
        "publication contract incomplete."
    )
    for name in ("set_service", "get_service", "clear_service_for_tests",
                 "TrackingConfigService", "TrackingConfigSnapshot"):
        assert name in tc.__all__, (
            f"[5.5/F] FAIL: {name!r} missing from "
            f"tracking_config.__all__"
        )

    print("✓ test_1: set_service / get_service / clear_service_for_tests "
          "exported from app.services.tracking_config")


# ─────────────────────────────────────────────────────────────────────
# 2) Module-private cell, initial None
# ─────────────────────────────────────────────────────────────────────

def test_2_module_private_service_ref_initial_none():
    """The module-private ``_service_ref`` cell starts at None and
    can be reset to None via ``clear_service_for_tests``."""
    import server  # noqa: F401
    import app.services.tracking_config as tc

    # Save current state, reset, verify
    original = tc.get_service()
    try:
        tc.clear_service_for_tests()
        assert tc.get_service() is None, (
            "[5.5/F] FAIL: clear_service_for_tests() did NOT reset the "
            "cell to None"
        )
    finally:
        # Restore live state for downstream tests
        tc.set_service(original)

    print("✓ test_2: _service_ref cell resets to None via "
          "clear_service_for_tests()")


# ─────────────────────────────────────────────────────────────────────
# 3) set/get round-trip preserves object identity
# ─────────────────────────────────────────────────────────────────────

def test_3_set_get_roundtrip_preserves_identity():
    """``set_service(x)`` followed by ``get_service()`` returns the
    SAME object (no copy, no wrapper). Identity preservation is the
    contract — admin_integrations._tracking_env_keys needs to call
    ``.snapshot()`` on the live service, not a clone."""
    import server  # noqa: F401
    import app.services.tracking_config as tc

    original = tc.get_service()
    try:
        # Use a plain sentinel — we're testing identity preservation,
        # not service behaviour.
        sentinel = object()
        tc.set_service(sentinel)  # type: ignore[arg-type]
        assert tc.get_service() is sentinel, (
            "[5.5/F] FAIL: set_service / get_service round-trip lost "
            "identity (got copy / wrapper instead of same object)"
        )
    finally:
        tc.set_service(original)

    print("✓ test_3: set_service / get_service round-trip preserves "
          "object identity")


# ─────────────────────────────────────────────────────────────────────
# 4) admin_integrations.py has no `server.X` qualified access
# ─────────────────────────────────────────────────────────────────────

def test_4_admin_integrations_has_no_server_qualified_access():
    """Zero ``server.X`` qualified attribute access AND zero
    ``import server`` statements anywhere in admin_integrations.py."""
    src = _read(ADMIN_INTEGRATIONS_PY)
    tree = ast.parse(src)

    qualified_sites = []
    for node in ast.walk(tree):
        if isinstance(node, ast.Attribute) and isinstance(node.value, ast.Name):
            if node.value.id == "server":
                qualified_sites.append((node.lineno, node.attr))
    assert not qualified_sites, (
        f"[5.5/F] FAIL: `server.X` qualified-access sites still in "
        f"admin_integrations.py: {qualified_sites}. Mandate forbids: "
        f"must be migrated to canonical accessor (get_service)."
    )

    # `import server` lines (both module-level and function-local)
    import_server_lines = []
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for a in node.names:
                if a.name == "server":
                    import_server_lines.append(node.lineno)
    assert not import_server_lines, (
        f"[5.5/F] FAIL: `import server` lines still in "
        f"admin_integrations.py at lines {import_server_lines}. "
        f"The 5.5/F retirement removes all such imports."
    )

    print("✓ test_4: admin_integrations.py has 0 `server.X` qualified "
          "access + 0 `import server` lines (was 1 + 1 pre-5.5/F)")


# ─────────────────────────────────────────────────────────────────────
# 5) `_tracking_env_keys` imports `get_service` from the canonical home
# ─────────────────────────────────────────────────────────────────────

def test_5_tracking_env_keys_imports_canonical_accessor():
    """The migrated ``_tracking_env_keys`` function must contain an
    ``ImportFrom`` of ``get_service`` from
    ``app.services.tracking_config`` (the canonical home). This guards
    against accidental regression to ``getattr(server, ...)`` or to
    a different / wrong module."""
    src = _read(ADMIN_INTEGRATIONS_PY)
    tree = ast.parse(src)

    # Find the _tracking_env_keys function and verify its body
    target_fn = None
    for node in ast.walk(tree):
        if isinstance(node, ast.FunctionDef) and node.name == "_tracking_env_keys":
            target_fn = node
            break
    assert target_fn is not None, (
        "[5.5/F] FAIL: function `_tracking_env_keys` missing from "
        "admin_integrations.py"
    )

    # Walk the function body for ImportFrom(module="app.services.tracking_config", names=["get_service"])
    found = False
    for sub in ast.walk(target_fn):
        if isinstance(sub, ast.ImportFrom) and sub.module == "app.services.tracking_config":
            if any(a.name == "get_service" for a in sub.names):
                found = True
                break
    assert found, (
        "[5.5/F] FAIL: _tracking_env_keys does NOT import "
        "`get_service` from `app.services.tracking_config`. The "
        "function must use the canonical accessor."
    )

    # Verify NO `getattr(server, ...)` calls inside the function body
    bad_getattrs = []
    for sub in ast.walk(target_fn):
        if isinstance(sub, ast.Call) and isinstance(sub.func, ast.Name) and sub.func.id == "getattr":
            if sub.args and isinstance(sub.args[0], ast.Name) and sub.args[0].id == "server":
                bad_getattrs.append(sub.lineno)
    assert not bad_getattrs, (
        f"[5.5/F] FAIL: legacy `getattr(server, ...)` still present "
        f"in _tracking_env_keys at lines {bad_getattrs}"
    )

    print("✓ test_5: _tracking_env_keys imports `get_service` from "
          "`app.services.tracking_config`; no `getattr(server, ...)` "
          "remains")


# ─────────────────────────────────────────────────────────────────────
# 6) Cold-start parity — None service → all-empty dict
# ─────────────────────────────────────────────────────────────────────

def test_6_cold_start_parity_returns_all_empty_dict():
    """With ``get_service()`` returning None (cold start), the
    ``_tracking_env_keys`` function must return the 5-key UPPER_SNAKE
    dict with every value being the empty string. This is byte-
    identical to the pre-5.5/F fallback dict."""
    import server  # noqa: F401
    import app.services.tracking_config as tc
    from app.routers.admin_integrations import _tracking_env_keys

    original = tc.get_service()
    try:
        tc.clear_service_for_tests()
        assert tc.get_service() is None
        result = _tracking_env_keys()
    finally:
        tc.set_service(original)

    expected = {
        "VESSELFINDER_API_KEY":   "",
        "VESSELFINDER_FLEET_KEY": "",
        "SHIPSGO_API_KEY":        "",
        "SHIPSGO_FLEET_KEY":      "",
        "AFTERSHIP_API_KEY":      "",
    }
    assert result == expected, (
        f"[5.5/F] FAIL: cold-start fallback drifted from byte-identical "
        f"5-key all-empty dict. Got: {result}. Expected: {expected}."
    )
    print("✓ test_6: cold-start (get_service() is None) returns the "
          "5-key all-empty dict (byte-identical to pre-5.5/F fallback)")


# ─────────────────────────────────────────────────────────────────────
# 7) Bound parity — service.snapshot().as_legacy_env_dict() pass-through
# ─────────────────────────────────────────────────────────────────────

def test_7_bound_service_returns_snapshot_legacy_dict_passthrough():
    """With a service bound, ``_tracking_env_keys()`` must return
    EXACTLY what ``service.snapshot().as_legacy_env_dict()`` returns
    — no transformation, no key drift, no value mangling. This pins
    the "Phase 3.1 / Commit 24+26 — sole consumer, legacy dict shape
    preserved" contract through the 5.5/F migration."""
    import server  # noqa: F401
    import app.services.tracking_config as tc
    from app.routers.admin_integrations import _tracking_env_keys
    from app.services.tracking_config import (
        TrackingConfigService, TrackingConfigSnapshot,
    )

    # Build an isolated stub service whose snapshot returns a known
    # 5-key dict. We construct the snapshot directly (frozen dataclass)
    # and inject it via the service's internal cache attribute.
    class _StubService:
        def __init__(self):
            self._snap = TrackingConfigSnapshot(
                vesselfinder_api_key="VF_API_X",
                vesselfinder_fleet_key="VF_FLEET_Y",
                shipsgo_api_key="SHIPSGO_API_Z",
                shipsgo_fleet_key="SHIPSGO_FLEET_W",
                aftership_api_key="AFTERSHIP_V",
                source="test",
            )

        def snapshot(self) -> TrackingConfigSnapshot:
            return self._snap

    stub = _StubService()
    expected = stub.snapshot().as_legacy_env_dict()
    assert expected == {
        "VESSELFINDER_API_KEY":   "VF_API_X",
        "VESSELFINDER_FLEET_KEY": "VF_FLEET_Y",
        "SHIPSGO_API_KEY":        "SHIPSGO_API_Z",
        "SHIPSGO_FLEET_KEY":      "SHIPSGO_FLEET_W",
        "AFTERSHIP_API_KEY":      "AFTERSHIP_V",
    }, "[5.5/F] sanity FAIL: snapshot.as_legacy_env_dict() shape drift"

    original = tc.get_service()
    try:
        tc.set_service(stub)  # type: ignore[arg-type]
        result = _tracking_env_keys()
    finally:
        tc.set_service(original)

    assert result == expected, (
        f"[5.5/F] FAIL: bound-service pass-through drifted from "
        f"service.snapshot().as_legacy_env_dict(). Got: {result}. "
        f"Expected: {expected}."
    )
    print("✓ test_7: bound-service path returns exactly "
          "service.snapshot().as_legacy_env_dict() (byte-identical "
          "pass-through, no transformation)")


# ─────────────────────────────────────────────────────────────────────
# 8) Inventory invariants
# ─────────────────────────────────────────────────────────────────────

def test_8_phase_5_5_f_inventory_invariants():
    """At 5.5/F close, QUALIFIED_USAGE_BRIDGES count == 1 (only
    _create_order_from_invoice remained). PHASE_5_5_F_RETIRED_QUALIFIED_SITES
    records the tracking_config_service tuple. PHASE_5_5_BOUNDARY no
    longer contains ``tracking_config_service``.

    5.5/C compatible-pin: ``_create_order_from_invoice`` retired in
    the following wave (5.5/C, 2026-05-19) — both `from server import`
    and `server.X qualified` shapes closed. QUALIFIED_USAGE_BRIDGES
    is now empty (1 → 0). The 5.5/F invariant flips its
    `_create_order_from_invoice` clauses from "MUST EXIST" to
    "MUST NOT EXIST" while preserving the 5.5/F retirement record."""
    from app.core.app_state_targets import (
        QUALIFIED_USAGE_BRIDGES,
        PHASE_5_5_F_RETIRED_QUALIFIED_SITES,
        PHASE_5_5_BOUNDARY,
    )

    # 5.5/C compatible-pin: post-5.5/C QUALIFIED_USAGE_BRIDGES is empty.
    assert len(QUALIFIED_USAGE_BRIDGES) == 0, (
        f"[5.5/F→C compatible-pin] FAIL: QUALIFIED_USAGE_BRIDGES size = "
        f"{len(QUALIFIED_USAGE_BRIDGES)}, expected 0 post-5.5/C "
        f"(``_create_order_from_invoice`` retired in 5.5/C — was the "
        f"last surviving entry)."
    )

    expected_retired = (("tracking_config_service",
                         "app/routers/admin_integrations.py"),)
    assert PHASE_5_5_F_RETIRED_QUALIFIED_SITES == expected_retired, (
        f"[5.5/F] FAIL: PHASE_5_5_F_RETIRED_QUALIFIED_SITES = "
        f"{PHASE_5_5_F_RETIRED_QUALIFIED_SITES}, expected "
        f"{expected_retired}"
    )

    assert "tracking_config_service" not in PHASE_5_5_BOUNDARY, (
        "[5.5/F] FAIL: `tracking_config_service` still in "
        "PHASE_5_5_BOUNDARY — should be removed after 5.5/F."
    )

    # 5.5/C compatible-pin: `_create_order_from_invoice` MUST NOT be
    # in PHASE_5_5_BOUNDARY anymore (retired in 5.5/C).
    assert "_create_order_from_invoice" not in PHASE_5_5_BOUNDARY, (
        "[5.5/F→C compatible-pin] FAIL: `_create_order_from_invoice` "
        "still in PHASE_5_5_BOUNDARY — should be removed after 5.5/C."
    )

    print(f"✓ test_8 (post-5.5/C): QUALIFIED_USAGE_BRIDGES count = 0; "
          f"PHASE_5_5_F_RETIRED_QUALIFIED_SITES records "
          f"tracking_config_service; PHASE_5_5_BOUNDARY shrank "
          f"to {len(PHASE_5_5_BOUNDARY)} symbols")


# ─────────────────────────────────────────────────────────────────────
# 9) OpenAPI 618/679 freeze invariant
# ─────────────────────────────────────────────────────────────────────

def test_9_openapi_freeze_618_679():
    from fastapi.testclient import TestClient
    import server
    fa = getattr(server, "fastapi_app", None)
    assert fa is not None
    client = TestClient(fa)
    r = client.get("/api/openapi.json")
    assert r.status_code == 200
    data = r.json()
    paths = data.get("paths", {})
    methods = sum(
        len([k for k in v if k in {"get", "post", "put", "patch",
                                    "delete", "head", "options"}])
        for v in paths.values() if isinstance(v, dict)
    )
    assert len(paths) == 618, (
        f"[5.5/F] FAIL: OpenAPI paths = {len(paths)}, expected 618"
    )
    assert methods == 679, (
        f"[5.5/F] FAIL: OpenAPI methods = {methods}, expected 679"
    )
    print(f"✓ test_9: OpenAPI 618 paths / 679 methods invariant held")


# ─────────────────────────────────────────────────────────────────────
# Entrypoint
# ─────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import traceback
    tests = [
        test_1_tracking_config_module_exports_accessor_trio,
        test_2_module_private_service_ref_initial_none,
        test_3_set_get_roundtrip_preserves_identity,
        test_4_admin_integrations_has_no_server_qualified_access,
        test_5_tracking_env_keys_imports_canonical_accessor,
        test_6_cold_start_parity_returns_all_empty_dict,
        test_7_bound_service_returns_snapshot_legacy_dict_passthrough,
        test_8_phase_5_5_f_inventory_invariants,
        test_9_openapi_freeze_618_679,
    ]
    failed = 0
    for t in tests:
        try:
            t()
        except Exception:
            failed += 1
            print(f"✗ {t.__name__} FAILED")
            traceback.print_exc()
    print(f"\n{'='*60}\n5.5/F SUITE: {len(tests)-failed}/{len(tests)} "
          f"PASS, {failed} FAIL\n{'='*60}")
    sys.exit(0 if failed == 0 else 1)
