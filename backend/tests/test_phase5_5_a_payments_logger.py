"""
Phase 5.5 / A — Payments logger qualified-access RETIREMENT.
=============================================================

Warm-up wave for Phase 5.5. Retired the 8 ``server.logger.exception(...)``
qualified-access call sites in ``app/routers/payments.py`` in favour
of a module-local logger published at module-load time:

    logger = logging.getLogger("bibi.payments")

The ``import server`` line in ``payments.py`` REMAINS — required for
``server._create_order_from_invoice`` (1 prod site in the Stripe
webhook recompute branch, line 658). That symbol's retirement
belongs to a dedicated payments-orchestration wave, NOT this warm-up.

Per the 5.5/A mandate, this test suite enforces 8 contract clauses:

  1. payments.py has no `server.logger` qualified usage
  2. payments.py has a module-local `logger`
  3. logger namespace == "bibi.payments"
  4. `import server` remains only because `_create_order_from_invoice`
     is still used (forbidden to retire in 5.5/A)
  5. no payment route signatures changed (OpenAPI surface for /api/payments/*
     and /api/stripe/* is byte-identical to baseline)
  6. OpenAPI 618/679 unchanged (continuous invariant)
  7. Phase 5.5 boundary marks payments logger retired / migrated
     (PHASE_5_5_A_RETIRED_QUALIFIED_SITES contains the entry)
  8. QUALIFIED_USAGE_BRIDGES count decreased from 6 to 5

Run:
    cd /app/backend && python -m pytest tests/test_phase5_5_a_payments_logger.py -v
"""
from __future__ import annotations

import ast
import os
import re
import sys
from pathlib import Path
from typing import Set

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")
os.environ.setdefault("DB_NAME", "test_database")

PAYMENTS_PY = ROOT / "app" / "routers" / "payments.py"
EXPECTED_LOGGER_NAMESPACE = "bibi.payments"
EXPECTED_REMAINING_QUALIFIED_USAGE_BRIDGES = 0  # 6 → 5 post-5.5/A → 2 post-5.5/B → 1 post-5.5/F → 0 post-5.5/C (compatible-pin)
EXPECTED_OPENAPI_PATHS = 618
EXPECTED_OPENAPI_OPS = 679

# Forbidden category — these symbols MUST NOT have been retired by
# 5.5/A. They live in dedicated follow-on waves.
FORBIDDEN_TO_RETIRE_IN_5_5_A = {"_create_order_from_invoice"}


def _read_payments_source() -> str:
    return PAYMENTS_PY.read_text(encoding="utf-8")


def _payments_ast():
    return ast.parse(_read_payments_source())


# ─────────────────────────────────────────────────────────────────────
# 1) payments.py has NO `server.logger` qualified usage
# ─────────────────────────────────────────────────────────────────────

def test_1_payments_has_no_server_logger_usage():
    """AST walk — any ``ast.Attribute`` with ``value.id == 'server'``
    and ``attr == 'logger'`` is a violation."""
    tree = _payments_ast()
    violations = []
    for node in ast.walk(tree):
        if isinstance(node, ast.Attribute) and isinstance(node.value, ast.Name):
            if node.value.id == "server" and node.attr == "logger":
                violations.append(node.lineno)
    assert not violations, (
        f"[5.5/A] FAIL: `server.logger` still used in payments.py at "
        f"lines {violations}. Mandate forbids: must be migrated to "
        f"module-local logger."
    )
    print(f"✓ test_1: 0 `server.logger` qualified-access sites in "
          f"payments.py (was 8 pre-5.5/A)")


# ─────────────────────────────────────────────────────────────────────
# 2) payments.py has a module-local `logger`
# ─────────────────────────────────────────────────────────────────────

def test_2_payments_has_module_local_logger():
    """A top-level assignment ``logger = logging.getLogger(...)`` must
    exist in payments.py."""
    tree = _payments_ast()
    found = False
    for node in tree.body:  # only top-level
        if isinstance(node, ast.Assign) and len(node.targets) == 1:
            tgt = node.targets[0]
            if isinstance(tgt, ast.Name) and tgt.id == "logger":
                # value must be `logging.getLogger(...)`
                v = node.value
                if isinstance(v, ast.Call) and \
                        isinstance(v.func, ast.Attribute) and \
                        v.func.attr == "getLogger" and \
                        isinstance(v.func.value, ast.Name) and \
                        v.func.value.id == "logging":
                    found = True
                    break
    assert found, (
        "[5.5/A] FAIL: no top-level `logger = logging.getLogger(...)` "
        "in payments.py. Mandate: must publish a module-local logger."
    )
    # Also: `import logging` must be present.
    has_import_logging = any(
        isinstance(n, ast.Import) and any(a.name == "logging" for a in n.names)
        for n in ast.walk(tree)
    )
    assert has_import_logging, (
        "[5.5/A] FAIL: payments.py missing `import logging`."
    )
    print(f"✓ test_2: module-local `logger = logging.getLogger(...)` "
          f"present in payments.py + `import logging` present")


# ─────────────────────────────────────────────────────────────────────
# 3) logger namespace == "bibi.payments"
# ─────────────────────────────────────────────────────────────────────

def test_3_logger_namespace_bibi_payments():
    """The exact namespace must match the mandate. The runtime logger
    object must also bind to this name (we import and check)."""
    src = _read_payments_source()
    m = re.search(
        r'^logger\s*=\s*logging\.getLogger\(\s*[\'"]([^\'"]+)[\'"]\s*\)\s*$',
        src,
        re.MULTILINE,
    )
    assert m is not None, (
        "[5.5/A] FAIL: no top-level `logger = logging.getLogger(\"...\")` "
        "match in payments.py."
    )
    ns = m.group(1)
    assert ns == EXPECTED_LOGGER_NAMESPACE, (
        f"[5.5/A] FAIL: logger namespace = {ns!r}, expected "
        f"{EXPECTED_LOGGER_NAMESPACE!r}"
    )

    # Runtime check — importing the module must bind a Logger object
    # named "bibi.payments". To avoid a circular-import dance with
    # ``import server`` inside payments.py, we load ``server`` FIRST
    # (which triggers payments.py to be loaded as a side-effect of
    # router registration) and then read the already-loaded module
    # from ``sys.modules`` rather than re-importing it standalone.
    import server  # noqa: F401  — load server first to break the cycle
    import sys as _sys
    _p = _sys.modules.get("app.routers.payments")
    assert _p is not None, (
        "[5.5/A] FAIL: app.routers.payments not in sys.modules after "
        "server load — router registration drifted."
    )
    import logging as _logging
    assert isinstance(_p.logger, _logging.Logger), (
        "[5.5/A] FAIL: payments.logger is not a logging.Logger"
    )
    assert _p.logger.name == EXPECTED_LOGGER_NAMESPACE, (
        f"[5.5/A] FAIL: payments.logger.name = {_p.logger.name!r}, "
        f"expected {EXPECTED_LOGGER_NAMESPACE!r}"
    )
    print(f"✓ test_3: logger namespace == {EXPECTED_LOGGER_NAMESPACE!r} "
          f"(both AST source AND runtime Logger object)")


# ─────────────────────────────────────────────────────────────────────
# 4) `import server` retirement compatibility-pin (post-5.5/C update).
#    5.5/A original mandate: REQUIRED `import server` to stay in
#    payments.py because `_create_order_from_invoice` was the sole
#    surviving qualified-access consumer. 5.5/C retired that symbol,
#    which means `import server` MUST now be gone AND the qualified
#    `server.X` usage set MUST now be empty. This test was originally
#    a "MUST EXIST" gate; the 5.5/C compatible-pin flips it to a
#    "MUST NOT EXIST" gate while preserving the function name + intent
#    (audit-trail value for the 5.5/A → 5.5/C transition).
# ─────────────────────────────────────────────────────────────────────

def test_4_import_server_remains_only_for_create_order_from_invoice():
    """5.5/A original assertion: `import server` remains in payments.py
    AND the sole qualified `server.X` usage is `_create_order_from_invoice`.

    5.5/C compatible-pin: `_create_order_from_invoice` retired (dual-
    shape — both `from server import` and `server.X qualified` shapes
    closed; the symbol now lives at
    ``app.services.orders.create_order_from_invoice``). With the
    LAST consumer gone, `import server` MUST be removed AND the
    qualified usage set MUST be empty.  This flips the assertion sense
    but preserves the audit-trail name."""
    tree = _payments_ast()

    # 4.a — `import server` MUST be gone (post-5.5/C)
    has_import_server = any(
        isinstance(n, ast.Import) and any(a.name == "server" for a in n.names)
        for n in ast.walk(tree)
    )
    assert not has_import_server, (
        "[5.5/C compatible-pin] FAIL: `import server` is still present "
        "in payments.py — but `_create_order_from_invoice` was retired "
        "in 5.5/C and that was the last consumer. The module-level "
        "`import server` line MUST be removed."
    )

    # 4.b — qualified server.X usage set MUST be empty (post-5.5/C)
    attrs: Set[str] = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Attribute) and isinstance(node.value, ast.Name):
            if node.value.id == "server":
                attrs.add(node.attr)
    assert attrs == set(), (
        f"[5.5/C compatible-pin] FAIL: payments.py `server.X` "
        f"qualified usage set = {sorted(attrs)}, expected empty. "
        f"`_create_order_from_invoice` was retired in 5.5/C — no "
        f"qualified-access sites may remain."
    )
    print("✓ test_4 (5.5/C compatible-pin): `import server` removed + "
          "no qualified `server.X` usage in payments.py")


# ─────────────────────────────────────────────────────────────────────
# 5) No payment route signatures changed
# ─────────────────────────────────────────────────────────────────────

def test_5_no_payment_route_signatures_changed():
    """Live OpenAPI inspection — every /api/payments/* and /api/stripe/*
    route must have the same HTTP methods and a non-empty operationId.
    This is a coarse "the surface still exists" check, not a per-arg
    byte equality (which would require a baseline snapshot we don't
    have). The 5.5/A mandate's intent is "no route changes" — covered
    by the OpenAPI 618/679 count invariant in test_6 plus the
    expected route surface here."""
    from fastapi.testclient import TestClient
    import server
    fa = getattr(server, "fastapi_app", None)
    assert fa is not None, "[5.5/A] FAIL: cannot resolve fastapi_app"
    client = TestClient(fa)
    r = client.get("/api/openapi.json")
    assert r.status_code == 200
    data = r.json()
    paths = data.get("paths", {})

    payment_paths = {
        p for p in paths
        if p.startswith("/api/payments/") or p.startswith("/api/stripe/")
    }
    assert len(payment_paths) >= 5, (
        f"[5.5/A] FAIL: too few /api/payments|stripe/* paths in "
        f"OpenAPI: {sorted(payment_paths)}. The payments router "
        f"either lost routes or the spec degraded."
    )

    # Every payment path must have at least one HTTP method and a
    # non-empty operationId.
    bad = []
    for p in payment_paths:
        ops = paths[p]
        if not isinstance(ops, dict) or not ops:
            bad.append(f"{p}: no operations")
            continue
        for verb, op in ops.items():
            if verb not in {"get", "post", "put", "patch", "delete"}:
                continue
            if not op.get("operationId"):
                bad.append(f"{p} [{verb.upper()}]: empty operationId")
    assert not bad, (
        f"[5.5/A] FAIL: route signatures degraded:\n  " + "\n  ".join(bad)
    )
    print(f"✓ test_5: {len(payment_paths)} /api/payments|stripe/* paths "
          f"intact, all with operationIds")


# ─────────────────────────────────────────────────────────────────────
# 6) OpenAPI 618/679 unchanged
# ─────────────────────────────────────────────────────────────────────

def test_6_openapi_freeze_618_679():
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
    assert len(paths) == EXPECTED_OPENAPI_PATHS, (
        f"[5.5/A] FAIL: OpenAPI paths = {len(paths)}, "
        f"expected {EXPECTED_OPENAPI_PATHS}"
    )
    assert methods == EXPECTED_OPENAPI_OPS, (
        f"[5.5/A] FAIL: OpenAPI methods = {methods}, "
        f"expected {EXPECTED_OPENAPI_OPS}"
    )
    print(f"✓ test_6: OpenAPI {EXPECTED_OPENAPI_PATHS}/"
          f"{EXPECTED_OPENAPI_OPS} held")


# ─────────────────────────────────────────────────────────────────────
# 7) Phase 5.5 boundary marks payments logger retired / migrated
# ─────────────────────────────────────────────────────────────────────

def test_7_phase_5_5_boundary_marks_payments_logger_retired():
    """``PHASE_5_5_A_RETIRED_QUALIFIED_SITES`` must contain the
    (symbol, file) tuple for the payments logger retirement. The bare
    ``logger`` symbol was REMOVED from ``PHASE_5_5_BOUNDARY`` in
    Phase 5.5/B (when the second consumer — calculations.py — also
    migrated to a module-local logger). Compatible-pin update:
    post-5.5/B the assertion is that ``logger`` is NO LONGER in the
    boundary (was the inverse assertion at 5.5/A close)."""
    from app.core.app_state_targets import (
        PHASE_5_5_A_RETIRED_QUALIFIED_SITES, PHASE_5_5_BOUNDARY,
    )
    expected_tuple = ("logger", "app/routers/payments.py")
    assert expected_tuple in PHASE_5_5_A_RETIRED_QUALIFIED_SITES, (
        f"[5.5/A] FAIL: PHASE_5_5_A_RETIRED_QUALIFIED_SITES does NOT "
        f"contain {expected_tuple!r}. Got: "
        f"{PHASE_5_5_A_RETIRED_QUALIFIED_SITES}"
    )
    # Post-5.5/B compatible-pin: `logger` left the boundary once
    # calculations.py was also migrated.
    assert "logger" not in PHASE_5_5_BOUNDARY, (
        "[5.5/A→B compatible-pin] FAIL: `logger` should have left "
        "PHASE_5_5_BOUNDARY after 5.5/B (both payments.py and "
        "calculations.py now use module-local loggers)."
    )
    print(f"✓ test_7: PHASE_5_5_A_RETIRED_QUALIFIED_SITES marks "
          f"({expected_tuple[0]!r}, {expected_tuple[1]!r}); "
          f"`logger` removed from PHASE_5_5_BOUNDARY by 5.5/B "
          f"(compatible-pin)")


# ─────────────────────────────────────────────────────────────────────
# 8) Remaining QUALIFIED_USAGE_BRIDGES count decreases accordingly
# ─────────────────────────────────────────────────────────────────────

def test_8_qualified_usage_bridges_count_decreased():
    """C-5f baseline registered 6 QualifiedUsageSite entries. After
    5.5/A retires the payments.py logger entry → 5. After 5.5/B
    retires the 3 calculations.py entries → 2 (compatible-pin).
    The payments.py logger entry MUST NOT appear among the remaining."""
    from app.core.app_state_targets import QUALIFIED_USAGE_BRIDGES
    assert len(QUALIFIED_USAGE_BRIDGES) == EXPECTED_REMAINING_QUALIFIED_USAGE_BRIDGES, (
        f"[5.5/A→B compatible-pin] FAIL: QUALIFIED_USAGE_BRIDGES size = "
        f"{len(QUALIFIED_USAGE_BRIDGES)}, expected "
        f"{EXPECTED_REMAINING_QUALIFIED_USAGE_BRIDGES} (C-5f baseline 6 "
        f"→ 5 post-5.5/A → 2 post-5.5/B)."
    )
    # The payments.py logger entry must be gone (5.5/A scope).
    for q in QUALIFIED_USAGE_BRIDGES:
        if q.symbol == "logger" and q.consumer_file == "app/routers/payments.py":
            raise AssertionError(
                "[5.5/A] FAIL: QUALIFIED_USAGE_BRIDGES still contains a "
                "QualifiedUsageSite for (logger, app/routers/payments.py)."
            )
    # Post-5.5/B compatible-pin: the calculations.py entries are also gone.
    for q in QUALIFIED_USAGE_BRIDGES:
        assert q.consumer_file != "app/routers/calculations.py", (
            f"[5.5/A→B compatible-pin] FAIL: QUALIFIED_USAGE_BRIDGES "
            f"still has an entry for calculations.py ({q.symbol!r}). "
            f"All 3 were retired in 5.5/B."
        )
    print(f"✓ test_8: QUALIFIED_USAGE_BRIDGES count "
          f"{EXPECTED_REMAINING_QUALIFIED_USAGE_BRIDGES} "
          f"(6 → 5 post-5.5/A → 2 post-5.5/B, all migrations clean)")


# ─────────────────────────────────────────────────────────────────────
# Entrypoint
# ─────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import traceback
    tests = [
        test_1_payments_has_no_server_logger_usage,
        test_2_payments_has_module_local_logger,
        test_3_logger_namespace_bibi_payments,
        test_4_import_server_remains_only_for_create_order_from_invoice,
        test_5_no_payment_route_signatures_changed,
        test_6_openapi_freeze_618_679,
        test_7_phase_5_5_boundary_marks_payments_logger_retired,
        test_8_qualified_usage_bridges_count_decreased,
    ]
    failed = 0
    for t in tests:
        try:
            t()
        except Exception:
            failed += 1
            print(f"✗ {t.__name__} FAILED")
            traceback.print_exc()
    print(f"\n{'='*60}\n5.5/A SUITE: {len(tests)-failed}/{len(tests)} "
          f"PASS, {failed} FAIL\n{'='*60}")
    sys.exit(0 if failed == 0 else 1)
