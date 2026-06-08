"""
Phase 5.4 / C-4h — db retirement batch 4: remaining Class-B module-services.
==============================================================================

C-4h migrates the **remaining 4 Class-B module-service consumers** onto
the canonical ``db_runtime`` accessor introduced in C-4e:

  * ``financial_breakdown.py``    — invoice templates + breakdown engine
  * ``payments_tracking.py``      — payments CRUD + refund cron deps
  * ``legal_workflow.py``         — 38-route legal/deal staging surface
  * ``cabinet_financials.py``     — customer-facing read API

Higher risk than C-4g because each module is orchestration-adjacent:
``payments_tracking`` hosts refund cron + payment-reminder dependencies,
``legal_workflow`` provides the ``_audit(...)`` sink that other modules
delegate into, and ``cabinet_financials`` is the customer-facing read path
gating Stripe checkout flow. The C-4h test suite therefore exercises
**per-module sentinel rebind proofs** to verify that none of the four
captured the db handle at module-load time.

What it pins
------------

 1. Each of the 4 C-4h files no longer imports ``db`` from server.
 2. Each of the 4 files imports ``get_db`` (callable, not the cached
    handle) at module-load time from ``app.core.db_runtime``.
 3. Each ``_db()`` resolver is a function (not a module-level binding)
    and calls ``get_db()`` inside its body.
 4. Production ``from server import db`` site count == 5.
 5. Each of the 4 inventory entries is flipped to ``migrated=True``
    with ``recommended_batch="C-4h"``.
 6. All prior C-4e/C-4f/C-4g migrated entries remain ``migrated=True``.
 7. Runtime identity: each migrated module's ``_db()`` resolves to
    ``db_runtime.get_db()`` and observes consecutive ``set_db()`` rebinds
    immediately (no stale module-load snapshot).
 8. ``BRIDGE_INVENTORY`` still contains ``db``; ``TIER_A == {"db"}``.
 9. OpenAPI 618/679 unchanged.
10. ``NotificationService.__init__`` and ``notifications.init`` still
    untouched (defensive regression — C-4h MUST NOT have leaked into
    C-4g's surfaces).

Run:
    cd /app/backend && python tests/test_phase5_4_c4h_db_module_batch.py
"""
from __future__ import annotations

import ast
import importlib
import inspect
import os
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))


# ─────────────────────────────────────────────────────────────────────
# Constants — C-4h batch contract
# ─────────────────────────────────────────────────────────────────────

# The 4 module-service files migrated in C-4h.
C4H_BATCH_FILES = frozenset({
    "financial_breakdown.py",
    "payments_tracking.py",
    "legal_workflow.py",
    "cabinet_financials.py",
})

# Module names (importable form, parallel to the file list above)
C4H_BATCH_MODULES = (
    "financial_breakdown",
    "payments_tracking",
    "legal_workflow",
    "cabinet_financials",
)

# Total `from server import db` sites at C-4g close: 9.
# After C-4h migration of the 4 module-services: 5 sites remain.
REMAINING_BRIDGES_AFTER_C4H = 5

# Previously-migrated files — MUST remain migrated (no regression).
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


# ─────────────────────────────────────────────────────────────────────
# 1) C-4h files no longer import `db` from server
# ─────────────────────────────────────────────────────────────────────

def test_1_c4h_files_no_longer_import_db_from_server():
    bad = []
    for rel in C4H_BATCH_FILES:
        text = (ROOT / rel).read_text(encoding="utf-8")
        tree = ast.parse(text)
        for node in ast.walk(tree):
            if isinstance(node, ast.ImportFrom) and node.module == "server":
                for alias in node.names:
                    if alias.name == "db":
                        bad.append(f"{rel}:{node.lineno}")
    assert not bad, (
        f"[C-4h] FAIL: these files still import `db` from server:\n"
        + "\n".join(f"  {b}" for b in bad)
    )
    print(f"✓ test_1_c4h_files_no_longer_import_db_from_server  "
          f"({len(C4H_BATCH_FILES)} files clean)")


# ─────────────────────────────────────────────────────────────────────
# 2) Each file imports `get_db` callable at module scope
# ─────────────────────────────────────────────────────────────────────

def test_2_c4h_files_import_get_db_at_module_scope():
    """Each C-4h file must have a module-level
    ``from app.core.db_runtime import get_db`` (or equivalent ImportFrom)
    so the callable is available without per-call import overhead.
    Importing forbidden cache symbols (`_db_ref`, `_mongo_client_ref`)
    would defeat lazy semantics and is explicitly rejected.
    """
    failures = []
    for rel in C4H_BATCH_FILES:
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
        "[C-4h] FAIL: module-level import audit failed:\n"
        + "\n".join(f"  {f}" for f in failures)
    )
    print(f"✓ test_2_c4h_files_import_get_db_at_module_scope  "
          f"({len(C4H_BATCH_FILES)} files OK)")


# ─────────────────────────────────────────────────────────────────────
# 3) Each `_db()` is a function calling get_db(), no module-level db=
# ─────────────────────────────────────────────────────────────────────

def test_3_c4h_db_resolvers_lazy_and_callable():
    failures = []
    for rel in C4H_BATCH_FILES:
        text = (ROOT / rel).read_text(encoding="utf-8")
        tree = ast.parse(text)

        # (a) Find top-level `_db` FunctionDef
        db_func = None
        for node in tree.body:
            if isinstance(node, ast.FunctionDef) and node.name == "_db":
                db_func = node
                break
        if db_func is None:
            failures.append(f"{rel}: top-level `def _db()` not found")
            continue

        # (b) Body must invoke get_db()
        calls_get_db = False
        for sub in ast.walk(db_func):
            if isinstance(sub, ast.Call):
                fn = sub.func
                if isinstance(fn, ast.Name) and fn.id == "get_db":
                    calls_get_db = True
                    break
                if isinstance(fn, ast.Attribute) and fn.attr == "get_db":
                    calls_get_db = True
                    break
        if not calls_get_db:
            failures.append(f"{rel}: `_db()` does not invoke `get_db()`")

        # (c) No module-level `db = ...` snapshot
        for node in tree.body:
            if isinstance(node, ast.Assign):
                for tgt in node.targets:
                    if isinstance(tgt, ast.Name) and tgt.id == "db":
                        failures.append(
                            f"{rel}: module-level `db = ...` at line "
                            f"{node.lineno} captures the handle"
                        )

    assert not failures, (
        "[C-4h] FAIL: lazy-callable audit failed:\n"
        + "\n".join(f"  {f}" for f in failures)
    )
    print(f"✓ test_3_c4h_db_resolvers_lazy_and_callable  "
          f"({len(C4H_BATCH_FILES)} resolvers verified)")


# ─────────────────────────────────────────────────────────────────────
# 4) Remaining `from server import db` count == 5
# ─────────────────────────────────────────────────────────────────────

def test_4_remaining_bridge_count_is_at_most_five():
    """C-4h milestone ceiling: <= 5 production `from server import db`
    sites must remain. Softened to a FLOOR invariant — subsequent
    batches (C-4i, C-4j) can drive the count lower without breaking
    this pin.
    """
    sites = _collect_db_import_sites()
    assert len(sites) <= REMAINING_BRIDGES_AFTER_C4H, (
        f"[C-4h regression guard] expected <= {REMAINING_BRIDGES_AFTER_C4H} "
        f"remaining `from server import db` production sites after C-4h, "
        f"found {len(sites)}:\n" + "\n".join(f"  {s}" for s in sites)
    )
    # Previously-migrated and C-4h files MUST NOT reappear
    overlap = set(sites) & (PRIOR_BATCH_FILES | C4H_BATCH_FILES)
    assert not overlap, (
        f"[C-4h] FAIL: previously-migrated files reappeared in the bridge "
        f"list (regression): {sorted(overlap)}"
    )
    print(f"✓ test_4_remaining_bridge_count_is_at_most_five  "
          f"({len(sites)} remaining; ceiling {REMAINING_BRIDGES_AFTER_C4H})")


# ─────────────────────────────────────────────────────────────────────
# 5) Inventory: all 4 C-4h entries flipped to migrated=True
# ─────────────────────────────────────────────────────────────────────

def test_5_c4h_inventory_flipped_to_migrated():
    from app.core.app_state_targets import DB_CONSUMER_INVENTORY

    c4h_entries = [c for c in DB_CONSUMER_INVENTORY if c.recommended_batch == "C-4h"]
    assert len(c4h_entries) == 4, (
        f"[C-4h] FAIL: expected 4 C-4h inventory entries, found "
        f"{len(c4h_entries)}"
    )
    inventoried = {c.file for c in c4h_entries}
    assert inventoried == C4H_BATCH_FILES, (
        f"[C-4h] FAIL: C-4h inventory file set mismatch.\n"
        f"  inventory: {sorted(inventoried)}\n"
        f"  expected:  {sorted(C4H_BATCH_FILES)}"
    )
    not_migrated = [c.file for c in c4h_entries if not c.migrated]
    assert not not_migrated, (
        "[C-4h] FAIL: C-4h inventory entries not flipped to migrated=True:\n"
        + "\n".join(f"  {f}" for f in not_migrated)
    )
    # All Class-B with _db function
    for c in c4h_entries:
        assert c.access_class == "B", f"{c.file}: expected access_class=B, got {c.access_class}"
        assert c.function == "_db", f"{c.file}: expected function=_db, got {c.function}"
    print(f"✓ test_5_c4h_inventory_flipped_to_migrated  "
          f"(4/4 module-service entries migrated=True)")


# ─────────────────────────────────────────────────────────────────────
# 6) Prior batches (C-4e/C-4f/C-4g) remain migrated=True
# ─────────────────────────────────────────────────────────────────────

def test_6_prior_batches_remain_migrated():
    from app.core.app_state_targets import DB_CONSUMER_INVENTORY

    for batch, expected_count in (("C-4e", 12), ("C-4f", 4), ("C-4g", 1)):
        entries = [c for c in DB_CONSUMER_INVENTORY if c.recommended_batch == batch]
        assert len(entries) == expected_count, (
            f"[C-4h] FAIL: expected {expected_count} entries for batch "
            f"{batch}, found {len(entries)}"
        )
        not_migrated = [c.file for c in entries if not c.migrated]
        assert not not_migrated, (
            f"[C-4h] FAIL: batch {batch} entries silently reverted: "
            f"{not_migrated}"
        )
    print(f"✓ test_6_prior_batches_remain_migrated  (C-4e=12, C-4f=4, C-4g=1)")


# ─────────────────────────────────────────────────────────────────────
# 7) Per-module runtime sentinel rebind proof
# ─────────────────────────────────────────────────────────────────────

def test_7_per_module_runtime_sentinel_rebind():
    """For each migrated module, confirm that two consecutive
    ``set_db()`` rebinds are observed by ``module._db()`` immediately.
    This is the canonical proof that the module did NOT capture the db
    handle at module-load time.
    """
    os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")
    os.environ.setdefault("DB_NAME", "test_database")
    from app.core import db_runtime

    failures = []
    saved_db = db_runtime.get_db()
    saved_client = db_runtime.get_mongo_client()
    try:
        for mod_name in C4H_BATCH_MODULES:
            try:
                mod = importlib.import_module(mod_name)
            except Exception as e:
                failures.append(f"{mod_name}: import failed — {e}")
                continue

            if not hasattr(mod, "_db"):
                failures.append(f"{mod_name}: no `_db` attribute on module")
                continue

            # Sentinel #1
            s1 = object()
            db_runtime.set_db(s1, saved_client)
            got_1 = mod._db()
            if got_1 is not s1:
                failures.append(
                    f"{mod_name}: after set_db(s1), _db() returned "
                    f"{got_1!r}, expected sentinel s1"
                )
                continue
            # Sentinel #2 (proves no stale capture)
            s2 = object()
            db_runtime.set_db(s2, saved_client)
            got_2 = mod._db()
            if got_2 is not s2:
                failures.append(
                    f"{mod_name}: after set_db(s2), _db() still returned "
                    f"{got_1!r} (stale capture)"
                )
    finally:
        db_runtime.set_db(saved_db, saved_client)

    assert not failures, (
        "[C-4h] FAIL: runtime sentinel rebind audit failed:\n"
        + "\n".join(f"  {f}" for f in failures)
    )
    print(f"✓ test_7_per_module_runtime_sentinel_rebind  "
          f"({len(C4H_BATCH_MODULES)} modules; 2-step rebind observed in each)")


# ─────────────────────────────────────────────────────────────────────
# 8) BRIDGE_INVENTORY unchanged — db still present, no retirement
# ─────────────────────────────────────────────────────────────────────

def test_8_bridge_inventory_unchanged():
    """Phase 5.4 / C-4j compatible-pin update: accepts the post-C-4j
    state (db retired, Tier-A empty)."""
    from app.core.app_state_targets import BRIDGE_INVENTORY, TIER_A_SHALLOW_REWIRING
    symbols = {b.symbol for b in BRIDGE_INVENTORY}
    db_in = "db" in symbols
    tier_a = TIER_A_SHALLOW_REWIRING
    valid_pre  = db_in and tier_a == frozenset({"db"})
    valid_post = (not db_in) and tier_a == frozenset()
    assert valid_pre or valid_post, (
        f"[C-4h] FAIL: invalid bridge state. db_in_bridges={db_in}, "
        f"Tier-A={sorted(tier_a)}."
    )
    label = "post-C-4j" if valid_post else "pre-C-4j"
    print(f"✓ test_8_bridge_inventory_unchanged  "
          f"(size={len(BRIDGE_INVENTORY)}, {label})")


# ─────────────────────────────────────────────────────────────────────
# 9) OpenAPI route freeze still 618 / 679
# ─────────────────────────────────────────────────────────────────────

def test_9_openapi_route_freeze_618_679():
    os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")
    os.environ.setdefault("DB_NAME", "test_database")

    from fastapi.testclient import TestClient
    import server
    fastapi_app = getattr(server, "fastapi_app", None) or getattr(server, "app", None)
    assert fastapi_app is not None, "[C-4h] FAIL: cannot resolve FastAPI instance"

    client = TestClient(fastapi_app)
    r = client.get("/api/openapi.json")
    assert r.status_code == 200, f"[C-4h] FAIL: openapi HTTP {r.status_code}"
    data = r.json()
    paths = data.get("paths", {})
    n_paths = len(paths)
    n_ops = sum(
        len([k for k in v if k in ("get", "post", "put", "patch", "delete", "head", "options")])
        for v in paths.values()
    )
    assert n_paths == 618 and n_ops == 679, (
        f"[C-4h] FAIL: OpenAPI surface drifted. expected 618/679, got "
        f"{n_paths}/{n_ops}"
    )
    print(f"✓ test_9_openapi_route_freeze_618_679  ({n_paths}/{n_ops})")


# ─────────────────────────────────────────────────────────────────────
# 10) notifications.init / NotificationService unchanged (C-4g surfaces)
# ─────────────────────────────────────────────────────────────────────

def test_10_c4g_notifications_surfaces_unchanged():
    """C-4h must NOT leak into the C-4g surfaces. Defensive guard."""
    import notifications
    init_sig = inspect.signature(notifications.init)
    params = list(init_sig.parameters.values())
    assert [p.name for p in params] == ["db", "sio"], (
        f"[C-4h] FAIL: notifications.init signature drifted: "
        f"{[p.name for p in params]}"
    )

    ns_sig = inspect.signature(notifications.NotificationService.__init__)
    ns_params = [p.name for p in ns_sig.parameters.values()]
    assert ns_params[:3] == ["self", "db", "sio"], (
        f"[C-4h] FAIL: NotificationService.__init__ signature drifted: "
        f"{ns_params}"
    )
    print("✓ test_10_c4g_notifications_surfaces_unchanged")


# ─────────────────────────────────────────────────────────────────────
# Runner
# ─────────────────────────────────────────────────────────────────────

def _run_all():
    tests = [
        test_1_c4h_files_no_longer_import_db_from_server,
        test_2_c4h_files_import_get_db_at_module_scope,
        test_3_c4h_db_resolvers_lazy_and_callable,
        test_4_remaining_bridge_count_is_at_most_five,
        test_5_c4h_inventory_flipped_to_migrated,
        test_6_prior_batches_remain_migrated,
        test_7_per_module_runtime_sentinel_rebind,
        test_8_bridge_inventory_unchanged,
        test_9_openapi_route_freeze_618_679,
        test_10_c4g_notifications_surfaces_unchanged,
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
        f"Phase 5.4 / C-4h db retirement BATCH 4 — "
        f"{len(tests) - failed}/{len(tests)} "
        f"{'PASS' if failed == 0 else 'FAIL'}"
    )
    print("=" * 60)
    return 0 if failed == 0 else 1


if __name__ == "__main__":
    sys.exit(_run_all())
