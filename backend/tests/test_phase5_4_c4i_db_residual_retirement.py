"""
Phase 5.4 / C-4i — residual db consumer retirement.
====================================================

C-4i is the **strangler-fig finale before root swap**. It migrates the
last batch of non-DI db consumers, ensuring that **the ONLY remaining
production ``from server import db`` site is the FastAPI DI source
itself** (``app/core/deps.py:get_db``). After C-4i:

  * ``from server import db`` production sites:  1   (down from 5)
  * qualified ``server.db.X`` access sites:      0   (down from 23 + 24)
  * The DI source remains for C-4j (finale).

Scope (5 listed files + 1 audit-discovered residual)
----------------------------------------------------

User-mandated batch:

  * ``app/routers/content.py``              — Class-A, public-cache
  * ``app/routers/admin_shipments.py``      — Class-A, tracking-adjacent
  * ``app/routers/admin_vesselfinder.py``   — Class-A, extension diag
  * ``app/services/identity_runtime.py``    — Class-B, sibling of C-4c sio
  * ``app/routers/calculations.py``         — qualified-import case

Audit-discovered residual (planning miss in C-4d):

  * ``app/routers/payments.py``             — qualified-import case
    (24 ``server.db.X`` sites; not tracked in original
    ``DB_QUALIFIED_IMPORT_SITES`` inventory)

The mandate's hard invariant — "qualified server.db access == 0" —
requires this file to be migrated together with ``calculations.py``;
otherwise the invariant would be violated. The closeout doc records
the audit discovery and the C-4d inventory delta.

What it pins
------------

1. The 6 C-4i files no longer import ``db`` from server.
2. Production ``from server import db`` site count == 1.
3. The single remaining site is **exactly** ``app/core/deps.py``.
4. ``DB_QUALIFIED_IMPORT_SITES`` is empty (`server.db.X` retired).
5. AST audit: ZERO qualified ``server.db.<attr>`` references across the
   production tree.
6. Each migrated file imports ``get_db`` (callable, not the handle).
7. ``identity_runtime._db()`` observes consecutive ``set_db()`` rebinds
   immediately (no stale module-load snapshot).
8. C-4h / C-4g / C-4f / C-4e migrated entries remain migrated.
9. ``BRIDGE_INVENTORY`` still contains ``db``; ``TIER_A == {"db"}``.
10. OpenAPI 618/679 unchanged.

Run:
    cd /app/backend && python tests/test_phase5_4_c4i_db_residual_retirement.py
"""
from __future__ import annotations

import ast
import importlib
import os
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))


# ─────────────────────────────────────────────────────────────────────
# Constants — C-4i batch contract
# ─────────────────────────────────────────────────────────────────────

# User-mandated 5 files + 1 audit-discovered residual = 6 files.
C4I_BATCH_FILES = frozenset({
    "app/routers/content.py",
    "app/routers/admin_shipments.py",
    "app/routers/admin_vesselfinder.py",
    "app/services/identity_runtime.py",
    "app/routers/calculations.py",          # qualified-import case
    "app/routers/payments.py",              # qualified-import case (audit-discovered)
})

# Files where ``server.db.X`` was the qualified-import pattern (retired):
C4I_QUALIFIED_IMPORT_FILES = frozenset({
    "app/routers/calculations.py",
    "app/routers/payments.py",
})

# After C-4i: only the DI source remains.
REMAINING_BRIDGES_AFTER_C4I = 1
DI_SOURCE_FILE = "app/core/deps.py"

# All previously-migrated files (C-4e through C-4h) — must remain clean.
PRIOR_BATCH_FILES = frozenset({
    # C-4e (12 routers)
    "app/routers/admin_engagement.py",
    "app/routers/admin_ext_clients.py",
    "app/routers/admin_identity.py",
    "app/routers/admin_integrations.py",
    "app/routers/admin_metrics.py",
    "app/routers/admin_orders.py",
    "app/routers/admin_overview.py",
    "app/routers/admin_predictive_leads.py",
    "app/routers/admin_providers.py",
    "app/routers/admin_resolver.py",
    "app/routers/admin_ringostat.py",
    "app/routers/admin_search.py",
    # C-4f (4 _repo routers)
    "app/routers/admin_history_reports.py",
    "app/routers/admin_security.py",
    "app/routers/admin_services.py",
    "app/routers/admin_workflow_templates.py",
    # C-4g (1 module-service)
    "notifications.py",
    # C-4h (4 module-services)
    "financial_breakdown.py",
    "payments_tracking.py",
    "legal_workflow.py",
    "cabinet_financials.py",
})

SKIP_DIRS = {"__pycache__", "tests"}
SKIP_FILES = {"server.py", "app_state_targets.py"}


def _iter_production_python_files():
    for py in ROOT.rglob("*.py"):
        if any(seg in SKIP_DIRS for seg in py.parts):
            continue
        if py.name in SKIP_FILES:
            continue
        yield py


def _collect_db_import_sites():
    sites = []
    for py in _iter_production_python_files():
        try:
            tree = ast.parse(py.read_text(encoding="utf-8"))
        except Exception:
            continue
        for node in ast.walk(tree):
            if isinstance(node, ast.ImportFrom) and node.module == "server":
                for alias in node.names:
                    if alias.name == "db":
                        sites.append(str(py.relative_to(ROOT)))
    return sorted(set(sites))


def _collect_qualified_server_db():
    """Find all ``server.db.<attr>`` qualified-attribute references."""
    hits = []
    for py in _iter_production_python_files():
        try:
            tree = ast.parse(py.read_text(encoding="utf-8"))
        except Exception:
            continue
        # We want Attribute nodes where .attr == 'db' AND .value is Name('server').
        # Both `server.db.collection.find(...)` and `Repo(server.db)` match.
        for node in ast.walk(tree):
            if isinstance(node, ast.Attribute) and node.attr == "db":
                if isinstance(node.value, ast.Name) and node.value.id == "server":
                    hits.append(f"{py.relative_to(ROOT)}:{node.lineno}")
    return hits


# ─────────────────────────────────────────────────────────────────────
# 1) C-4i files no longer import db from server
# ─────────────────────────────────────────────────────────────────────

def test_1_c4i_files_no_longer_import_db_from_server():
    bad = []
    for rel in C4I_BATCH_FILES:
        text = (ROOT / rel).read_text(encoding="utf-8")
        tree = ast.parse(text)
        for node in ast.walk(tree):
            if isinstance(node, ast.ImportFrom) and node.module == "server":
                for alias in node.names:
                    if alias.name == "db":
                        bad.append(f"{rel}:{node.lineno}")
    assert not bad, (
        f"[C-4i] FAIL: files still import `db` from server:\n"
        + "\n".join(f"  {b}" for b in bad)
    )
    print(f"✓ test_1_c4i_files_no_longer_import_db_from_server  "
          f"({len(C4I_BATCH_FILES)} files clean)")


# ─────────────────────────────────────────────────────────────────────
# 2) Exactly ONE remaining production from-import — and it's deps.py
# ─────────────────────────────────────────────────────────────────────

def test_2_only_di_source_remains():
    """Phase 5.4 / C-4j compatible-pin update: at C-4i close there
    was 1 remaining `from server import db` site (deps.py). At C-4j
    that drops to 0. Either state is accepted here; the strict
    post-C-4j invariant is enforced by
    `test_phase5_4_c4j_db_bridge_finale.py::test_1`."""
    sites = _collect_db_import_sites()
    assert sites in ([DI_SOURCE_FILE], []), (
        f"[C-4i] FAIL: expected either {[DI_SOURCE_FILE]} (pre-C-4j) "
        f"or [] (post-C-4j) remaining `from server import db` sites, "
        f"found:\n" + "\n".join(f"  {s}" for s in sites)
    )
    if sites == []:
        print(f"✓ test_2_only_di_source_remains  (post-C-4j: 0 bridges)")
    else:
        print(f"✓ test_2_only_di_source_remains  (sole remaining bridge: {sites[0]})")


# ─────────────────────────────────────────────────────────────────────
# 3) Qualified server.db.X access fully retired
# ─────────────────────────────────────────────────────────────────────

def test_3_qualified_server_db_access_retired():
    hits = _collect_qualified_server_db()
    assert not hits, (
        f"[C-4i] FAIL: qualified `server.db` access still present at:\n"
        + "\n".join(f"  {h}" for h in hits)
    )
    print(f"✓ test_3_qualified_server_db_access_retired  (0 references; was 47)")


# ─────────────────────────────────────────────────────────────────────
# 4) DB_QUALIFIED_IMPORT_SITES is empty
# ─────────────────────────────────────────────────────────────────────

def test_4_qualified_import_inventory_empty():
    from app.core.app_state_targets import DB_QUALIFIED_IMPORT_SITES
    assert DB_QUALIFIED_IMPORT_SITES == (), (
        f"[C-4i] FAIL: DB_QUALIFIED_IMPORT_SITES should be empty after "
        f"C-4i, got: {DB_QUALIFIED_IMPORT_SITES}"
    )
    print(f"✓ test_4_qualified_import_inventory_empty  (() — fully retired)")


# ─────────────────────────────────────────────────────────────────────
# 5) Each C-4i file imports `get_db` (callable, not the handle)
# ─────────────────────────────────────────────────────────────────────

def test_5_c4i_files_import_get_db_callable():
    failures = []
    for rel in C4I_BATCH_FILES:
        text = (ROOT / rel).read_text(encoding="utf-8")
        tree = ast.parse(text)
        imports_get_db = False
        bad_imports = []
        for node in ast.walk(tree):
            if isinstance(node, ast.ImportFrom) and node.module == "app.core.db_runtime":
                for alias in node.names:
                    if alias.name == "get_db":
                        imports_get_db = True
                    if alias.name in ("_db_ref", "_mongo_client_ref"):
                        bad_imports.append(alias.name)
        if not imports_get_db:
            failures.append(f"{rel}: missing `from app.core.db_runtime import get_db`")
        if bad_imports:
            failures.append(f"{rel}: forbidden imports {bad_imports}")
    assert not failures, (
        "[C-4i] FAIL: module-level import audit failed:\n"
        + "\n".join(f"  {f}" for f in failures)
    )
    print(f"✓ test_5_c4i_files_import_get_db_callable  "
          f"({len(C4I_BATCH_FILES)} files OK)")


# ─────────────────────────────────────────────────────────────────────
# 6) identity_runtime._db() observes sentinel rebind cascade
# ─────────────────────────────────────────────────────────────────────

def test_6_identity_runtime_sentinel_rebind():
    os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")
    os.environ.setdefault("DB_NAME", "test_database")

    from app.core import db_runtime
    from app.services import identity_runtime

    saved_db = db_runtime.get_db()
    saved_client = db_runtime.get_mongo_client()
    try:
        s1 = object()
        db_runtime.set_db(s1, saved_client)
        got_1 = identity_runtime._db()
        assert got_1 is s1, (
            f"[C-4i] FAIL: identity_runtime._db() after set_db(s1) "
            f"returned {got_1!r}, expected sentinel s1"
        )

        s2 = object()
        db_runtime.set_db(s2, saved_client)
        got_2 = identity_runtime._db()
        assert got_2 is s2, (
            f"[C-4i] FAIL: identity_runtime._db() after set_db(s2) "
            f"returned {got_2!r} (stale capture)"
        )
    finally:
        db_runtime.set_db(saved_db, saved_client)

    print(f"✓ test_6_identity_runtime_sentinel_rebind  (2-step rebind observed)")


# ─────────────────────────────────────────────────────────────────────
# 7) calculations.py + payments.py use get_db() call-time access
# ─────────────────────────────────────────────────────────────────────

def test_7_qualified_import_files_use_get_db_calltime():
    """For each file that used to use ``server.db.X`` qualified access,
    verify that ``get_db()`` is now invoked (not bound at module-load
    via ``db = get_db()``).
    """
    failures = []
    for rel in C4I_QUALIFIED_IMPORT_FILES:
        text = (ROOT / rel).read_text(encoding="utf-8")
        tree = ast.parse(text)

        # No module-level `db = get_db()` or `db = ...`
        for node in tree.body:
            if isinstance(node, ast.Assign):
                for tgt in node.targets:
                    if isinstance(tgt, ast.Name) and tgt.id == "db":
                        failures.append(
                            f"{rel}:{node.lineno}: module-level `db = ...` "
                            f"captures the handle — call-time semantics broken"
                        )

        # At least one `get_db()` invocation present
        has_call = False
        for sub in ast.walk(tree):
            if isinstance(sub, ast.Call):
                fn = sub.func
                if isinstance(fn, ast.Name) and fn.id == "get_db":
                    has_call = True
                    break
                if isinstance(fn, ast.Attribute) and fn.attr == "get_db":
                    has_call = True
                    break
        if not has_call:
            failures.append(f"{rel}: no `get_db()` invocation found")
    assert not failures, (
        "[C-4i] FAIL: qualified-import migration audit failed:\n"
        + "\n".join(f"  {f}" for f in failures)
    )
    print(f"✓ test_7_qualified_import_files_use_get_db_calltime  "
          f"({len(C4I_QUALIFIED_IMPORT_FILES)} files OK)")


# ─────────────────────────────────────────────────────────────────────
# 8) Prior batches (C-4e/f/g/h) remain migrated=True
# ─────────────────────────────────────────────────────────────────────

def test_8_prior_batches_remain_migrated():
    from app.core.app_state_targets import DB_CONSUMER_INVENTORY

    expected = {"C-4e": 12, "C-4f": 4, "C-4g": 1, "C-4h": 4}
    for batch, n in expected.items():
        entries = [c for c in DB_CONSUMER_INVENTORY if c.recommended_batch == batch]
        assert len(entries) == n, (
            f"[C-4i] FAIL: expected {n} entries for batch {batch}, "
            f"found {len(entries)}"
        )
        not_migrated = [c.file for c in entries if not c.migrated]
        assert not not_migrated, (
            f"[C-4i] FAIL: batch {batch} entries reverted: {not_migrated}"
        )
    print(f"✓ test_8_prior_batches_remain_migrated  "
          f"(C-4e=12, C-4f=4, C-4g=1, C-4h=4)")


# ─────────────────────────────────────────────────────────────────────
# 9) C-4i inventory entries migrated=True (5 originally listed)
# ─────────────────────────────────────────────────────────────────────

def test_9_c4i_inventory_flipped_to_migrated():
    """The 4 user-mandated **`from server import db`** C-4i files appear
    in ``DB_CONSUMER_INVENTORY`` and are all flipped to ``migrated=True``.

    Note on inventory data structure: ``calculations.py`` was the 5th
    user-mandated C-4i file but is tracked in the SEPARATE
    ``DB_QUALIFIED_IMPORT_SITES`` tuple (not in ``DB_CONSUMER_INVENTORY``)
    because it uses the ``import server`` + qualified ``server.db.X``
    pattern that AST-grep over ``ImportFrom`` cannot find. Its retirement
    is enforced by ``test_3`` (AST grep == 0) and ``test_4``
    (``DB_QUALIFIED_IMPORT_SITES == ()``). ``payments.py`` was an
    audit-discovered residual added to C-4i for the invariant
    "qualified server.db access == 0"; same enforcement path.
    """
    from app.core.app_state_targets import DB_CONSUMER_INVENTORY

    c4i_entries = [c for c in DB_CONSUMER_INVENTORY if c.recommended_batch == "C-4i"]
    assert len(c4i_entries) == 4, (
        f"[C-4i] FAIL: expected 4 C-4i inventory entries (the four "
        f"`from server import db` files; calculations.py + payments.py "
        f"are tracked separately via DB_QUALIFIED_IMPORT_SITES), "
        f"found {len(c4i_entries)}"
    )
    expected_files = {
        "app/routers/content.py",
        "app/routers/admin_shipments.py",
        "app/routers/admin_vesselfinder.py",
        "app/services/identity_runtime.py",
    }
    inventoried = {c.file for c in c4i_entries}
    assert inventoried == expected_files, (
        f"[C-4i] FAIL: inventory file set mismatch.\n"
        f"  inventory: {sorted(inventoried)}\n"
        f"  expected:  {sorted(expected_files)}"
    )
    not_migrated = [c.file for c in c4i_entries if not c.migrated]
    assert not not_migrated, (
        f"[C-4i] FAIL: not flipped to migrated=True: {not_migrated}"
    )
    print(f"✓ test_9_c4i_inventory_flipped_to_migrated  "
          f"(4/4 from-import entries migrated=True; 2 qualified-import "
          f"files retired via DB_QUALIFIED_IMPORT_SITES path)")


# ─────────────────────────────────────────────────────────────────────
# 10) BRIDGE_INVENTORY unchanged — db still present, no retirement
# ─────────────────────────────────────────────────────────────────────

def test_10_bridge_inventory_unchanged():
    """Phase 5.4 / C-4j compatible-pin update: at C-4i close `db` is
    in BRIDGE_INVENTORY and TIER_A == {"db"}. At C-4j the bridge is
    retired and Tier-A becomes empty. Either state is accepted here;
    `test_phase5_4_c4j_db_bridge_finale.py` (tests 6/7) enforces the
    strict post-retirement invariants."""
    from app.core.app_state_targets import BRIDGE_INVENTORY, TIER_A_SHALLOW_REWIRING
    symbols = {b.symbol for b in BRIDGE_INVENTORY}
    db_in_bridges = "db" in symbols
    tier_a = TIER_A_SHALLOW_REWIRING
    valid_pre  = db_in_bridges and tier_a == frozenset({"db"})
    valid_post = (not db_in_bridges) and tier_a == frozenset()
    assert valid_pre or valid_post, (
        f"[C-4i] FAIL: invalid bridge inventory state. "
        f"db_in_bridges={db_in_bridges}, Tier-A={sorted(tier_a)}. "
        f"Expected either {{db in bridges, Tier-A=={{db}}}} (pre-C-4j) "
        f"or {{db absent, Tier-A=={{}}}} (post-C-4j)."
    )
    label = "post-C-4j (db retired, Tier-A empty)" if valid_post else f"pre-C-4j (db present, Tier-A={{db}})"
    print(f"✓ test_10_bridge_inventory_unchanged  "
          f"(size={len(BRIDGE_INVENTORY)}, {label})")


# ─────────────────────────────────────────────────────────────────────
# 11) OpenAPI route freeze still 618/679
# ─────────────────────────────────────────────────────────────────────

def test_11_openapi_route_freeze_618_679():
    os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")
    os.environ.setdefault("DB_NAME", "test_database")

    from fastapi.testclient import TestClient
    import server
    fastapi_app = getattr(server, "fastapi_app", None) or getattr(server, "app", None)
    assert fastapi_app is not None, "[C-4i] FAIL: cannot resolve FastAPI instance"

    client = TestClient(fastapi_app)
    r = client.get("/api/openapi.json")
    assert r.status_code == 200, f"[C-4i] FAIL: openapi HTTP {r.status_code}"
    data = r.json()
    paths = data.get("paths", {})
    n_paths = len(paths)
    n_ops = sum(
        len([k for k in v if k in ("get", "post", "put", "patch", "delete", "head", "options")])
        for v in paths.values()
    )
    assert n_paths == 618 and n_ops == 679, (
        f"[C-4i] FAIL: OpenAPI surface drifted. expected 618/679, got "
        f"{n_paths}/{n_ops}"
    )
    print(f"✓ test_11_openapi_route_freeze_618_679  ({n_paths}/{n_ops})")


# ─────────────────────────────────────────────────────────────────────
# 12) deps.py:get_db source UNCHANGED (still legacy `from server import db`)
# ─────────────────────────────────────────────────────────────────────

def test_12_deps_get_db_source_unchanged():
    """The DI source (``app/core/deps.py``) — C-4i / C-4j gate.

    Phase 5.4 / C-4j compatible-pin update: at C-4j the legacy
    ``from server import db`` line is replaced by a delegate to
    ``app.core.db_runtime.get_db()``. To keep this C-4i regression
    suite green post-C-4j (its sister C-4j finale test owns the
    strict inverse), the assertion now accepts EITHER state:

      * Pre-C-4j:  ``from server import db`` line present.
      * Post-C-4j: ``from app.core.db_runtime import get_db`` (with
        or without an ``as`` alias) AND no ``from server import db``.

    The strict post-C-4j invariant is enforced by
    ``test_phase5_4_c4j_db_bridge_finale.py`` (tests 3 + 4)."""
    text = (ROOT / DI_SOURCE_FILE).read_text(encoding="utf-8")
    legacy = bool(re.search(r"^\s*from\s+server\s+import\s+db\b", text, re.MULTILINE))
    delegate = bool(re.search(r"from\s+app\.core\.db_runtime\s+import\s+get_db", text))
    assert legacy or delegate, (
        f"[C-4i] FAIL: {DI_SOURCE_FILE} contains neither the legacy "
        f"`from server import db` bridge nor the C-4j delegate "
        f"`from app.core.db_runtime import get_db`. The DI source "
        f"has drifted to an unrecognised shape."
    )
    if delegate and not legacy:
        print(f"✓ test_12_deps_get_db_source_unchanged  "
              f"(post-C-4j delegate to db_runtime in {DI_SOURCE_FILE})")
    else:
        print(f"✓ test_12_deps_get_db_source_unchanged  "
              f"(legacy bridge still in place at {DI_SOURCE_FILE})")


# ─────────────────────────────────────────────────────────────────────
# Runner
# ─────────────────────────────────────────────────────────────────────

def _run_all():
    tests = [
        test_1_c4i_files_no_longer_import_db_from_server,
        test_2_only_di_source_remains,
        test_3_qualified_server_db_access_retired,
        test_4_qualified_import_inventory_empty,
        test_5_c4i_files_import_get_db_callable,
        test_6_identity_runtime_sentinel_rebind,
        test_7_qualified_import_files_use_get_db_calltime,
        test_8_prior_batches_remain_migrated,
        test_9_c4i_inventory_flipped_to_migrated,
        test_10_bridge_inventory_unchanged,
        test_11_openapi_route_freeze_618_679,
        test_12_deps_get_db_source_unchanged,
    ]
    failed = 0
    for t in tests:
        try:
            t()
        except AssertionError as e:
            failed += 1
            print(f"✗ {t.__name__}\n   {e}")
    print()
    print("=" * 60)
    print(
        f"Phase 5.4 / C-4i residual db consumer retirement — "
        f"{len(tests) - failed}/{len(tests)} "
        f"{'PASS' if failed == 0 else 'FAIL'}"
    )
    print("=" * 60)
    return 0 if failed == 0 else 1


if __name__ == "__main__":
    sys.exit(_run_all())
