"""
Phase 5.4 / C-4f — db retirement batch 2 regression guards.
============================================================

This test suite is the regression guard for the second db consumer
migration batch (4 low-risk Class-A.2 admin routers using the
``_repo()`` repository-factory shape). Mirror of C-4e structure
with the same contract — the actual ``db`` Bridge entry is NOT
retired here, only consumer migration progresses.

What it pins
------------

1. **C-4f migrated routers no longer import `db` from server** —
   the 4 listed Class-A.2 files use ``app.core.db_runtime.get_db()``
   inside their ``_repo()`` factory.
2. **C-4f migrated routers still construct the right repository**
   via the canonical ``RepositoryClass(get_db())`` pattern.
3. **Remaining `from server import db` production sites == 10**
   (14 - 4 just migrated).
4. **C-4e migrated entries remain `migrated=True`** (no regression
   on the previous batch).
5. **C-4f entries in DB_CONSUMER_INVENTORY are flipped to
   `migrated=True`** with `recommended_batch="C-4f"`.
6. **`db` Bridge entry still present** in BRIDGE_INVENTORY —
   retirement happens at C-4j, not here.
7. **TIER_A_SHALLOW_REWIRING == {"db"}** — unchanged.
8. **OpenAPI route freeze still 618/679** — no route signature drift.
9. **db_runtime accessor surface unchanged** — same 4 public symbols
   from C-4e, no expansion in C-4f.
10. **db_runtime setter site untouched** — exactly one call in
    server.py at the same post-canonical / post-app.state location.

Run:
    cd /app/backend && python tests/test_phase5_4_c4f_db_repo_batch2.py
"""
from __future__ import annotations

import ast
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))


# ─────────────────────────────────────────────────────────────────────
# Constants — C-4f batch contract
# ─────────────────────────────────────────────────────────────────────

# The 4 routers migrated in C-4f (Class-A.2 _repo()-shape).
C4F_BATCH_FILES = frozenset({
    "app/routers/admin_history_reports.py",
    "app/routers/admin_security.py",
    "app/routers/admin_services.py",
    "app/routers/admin_workflow_templates.py",
})

# The 12 routers migrated in C-4e (Class-A _db()-shape) — must remain
# migrated after C-4f. Identity guard: if any of these silently
# regresses to `from server import db`, this suite fails.
C4E_BATCH_FILES = frozenset({
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
})

# Total `from server import db` sites at C-4e close: 14.
# After C-4f migration of 4 routers: 10 sites remain.
REMAINING_BRIDGES_AFTER_C4F = 10

# Repository class expected inside each C-4f file's `_repo()` factory.
# Pinned so that the migration cannot silently change the repository
# constructor (mandate §Forbidden).
EXPECTED_REPO_CLASS = {
    "app/routers/admin_history_reports.py":    "HistoryReportRepository",
    "app/routers/admin_security.py":           "AdminSecurityRepository",
    "app/routers/admin_services.py":           "ServiceCatalogRepository",
    "app/routers/admin_workflow_templates.py": "WorkflowTemplateRepository",
}

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


def _file_text(rel: str) -> str:
    return (ROOT / rel).read_text(encoding="utf-8")


# ─────────────────────────────────────────────────────────────────────
# 1) C-4f routers no longer import `from server import db`
# ─────────────────────────────────────────────────────────────────────

def test_1_c4f_routers_no_longer_import_db_from_server():
    bad = []
    for rel in C4F_BATCH_FILES:
        text = _file_text(rel)
        tree = ast.parse(text)
        for node in ast.walk(tree):
            if isinstance(node, ast.ImportFrom) and node.module == "server":
                for alias in node.names:
                    if alias.name == "db":
                        bad.append(f"{rel}:{node.lineno}")
    assert not bad, (
        f"[C-4f] FAIL: these files still import `db` from server:\n"
        + "\n".join(f"  {b}" for b in bad)
    )
    print(f"✓ test_1_c4f_routers_no_longer_import_db_from_server  ({len(C4F_BATCH_FILES)} routers clean)")


# ─────────────────────────────────────────────────────────────────────
# 2) C-4f routers use `db_runtime.get_db()` and construct the right repo
# ─────────────────────────────────────────────────────────────────────

def test_2_c4f_routers_use_db_runtime_and_correct_repo_class():
    """Each _repo() factory must:
       (a) import `get_db` from `app.core.db_runtime`,
       (b) construct the EXPECTED repository class with `get_db()`.
    """
    failures = []
    for rel in C4F_BATCH_FILES:
        text = _file_text(rel)

        # (a) accessor import must be present
        if "from app.core.db_runtime import get_db" not in text:
            failures.append(f"{rel}: missing `from app.core.db_runtime import get_db`")
            continue

        # (b) the canonical pattern is `RepositoryClass(get_db())` —
        # constructor identity is preserved (mandate §Forbidden).
        expected_class = EXPECTED_REPO_CLASS[rel]
        expected_call = f"{expected_class}(get_db())"
        if expected_call not in text:
            failures.append(
                f"{rel}: expected `{expected_call}` pattern not found "
                f"(repository constructor must be untouched)"
            )

        # (c) negative — no legacy `from server import db` line survives
        if re.search(r"^\s*from\s+server\s+import\s+db\b", text, re.MULTILINE):
            failures.append(f"{rel}: legacy `from server import db` line still present")

    assert not failures, (
        "[C-4f] FAIL: _repo() factory shape issues:\n"
        + "\n".join(f"  {f}" for f in failures)
    )
    print(f"✓ test_2_c4f_routers_use_db_runtime_and_correct_repo_class  ({len(C4F_BATCH_FILES)} routers OK)")


# ─────────────────────────────────────────────────────────────────────
# 3) Remaining `from server import db` production sites == 10
# ─────────────────────────────────────────────────────────────────────

def test_3_remaining_bridge_count_is_at_most_ten():
    """C-4f milestone ceiling: <= 10 production `from server import db`
    sites must remain. Softened to a FLOOR invariant so subsequent
    batches (C-4g, C-4h, ...) can naturally drive the count lower
    without forcing per-suite pin updates beyond the ceiling.
    """
    sites = _collect_db_import_sites()
    assert len(sites) <= REMAINING_BRIDGES_AFTER_C4F, (
        f"[C-4f regression guard] expected <= {REMAINING_BRIDGES_AFTER_C4F} "
        f"remaining `from server import db` production sites after C-4f, "
        f"found {len(sites)}:\n"
        + "\n".join(f"  {s}" for s in sites)
    )
    # Sanity: NONE of them must be a C-4f or C-4e batch file
    overlap = set(sites) & (C4F_BATCH_FILES | C4E_BATCH_FILES)
    assert not overlap, (
        f"[C-4f] FAIL: previously-migrated files reappeared in the bridge "
        f"list (regression): {sorted(overlap)}"
    )
    print(f"✓ test_3_remaining_bridge_count_is_at_most_ten  ({len(sites)} remaining; ceiling {REMAINING_BRIDGES_AFTER_C4F})")


# ─────────────────────────────────────────────────────────────────────
# 4) C-4e migrated entries remain `migrated=True` (no regression)
# ─────────────────────────────────────────────────────────────────────

def test_4_c4e_batch_remains_migrated():
    from app.core.app_state_targets import DB_CONSUMER_INVENTORY

    c4e_entries = [c for c in DB_CONSUMER_INVENTORY if c.recommended_batch == "C-4e"]
    assert len(c4e_entries) == 12, (
        f"[C-4f] FAIL: expected 12 C-4e inventory entries, found {len(c4e_entries)}"
    )
    not_migrated = [c.file for c in c4e_entries if not c.migrated]
    assert not not_migrated, (
        "[C-4f] FAIL: C-4e entries silently reverted to migrated=False:\n"
        + "\n".join(f"  {f}" for f in not_migrated)
    )
    print(f"✓ test_4_c4e_batch_remains_migrated  ({len(c4e_entries)}/12 still migrated)")


# ─────────────────────────────────────────────────────────────────────
# 5) C-4f entries in inventory are flipped to migrated=True
# ─────────────────────────────────────────────────────────────────────

def test_5_c4f_inventory_flipped_to_migrated():
    from app.core.app_state_targets import DB_CONSUMER_INVENTORY

    c4f_entries = [c for c in DB_CONSUMER_INVENTORY if c.recommended_batch == "C-4f"]
    assert len(c4f_entries) == 4, (
        f"[C-4f] FAIL: expected 4 C-4f inventory entries, found {len(c4f_entries)}"
    )

    # Each C-4f entry must point at a file in our batch set
    inventoried = {c.file for c in c4f_entries}
    assert inventoried == C4F_BATCH_FILES, (
        f"[C-4f] FAIL: C-4f inventory file set mismatch.\n"
        f"  inventory: {sorted(inventoried)}\n"
        f"  expected:  {sorted(C4F_BATCH_FILES)}"
    )

    # All must be marked migrated=True
    not_migrated = [c.file for c in c4f_entries if not c.migrated]
    assert not not_migrated, (
        "[C-4f] FAIL: C-4f inventory entries not flipped to migrated=True:\n"
        + "\n".join(f"  {f}" for f in not_migrated)
    )

    # function must be _repo for all 4
    bad_func = [(c.file, c.function) for c in c4f_entries if c.function != "_repo"]
    assert not bad_func, (
        "[C-4f] FAIL: C-4f entries must all be _repo()-shape:\n"
        + "\n".join(f"  {f} fn={fn}" for f, fn in bad_func)
    )
    print(f"✓ test_5_c4f_inventory_flipped_to_migrated  (4/4 _repo entries migrated=True)")


# ─────────────────────────────────────────────────────────────────────
# 6) Bridge inventory unchanged — db Bridge still present, no retirement
# ─────────────────────────────────────────────────────────────────────

def test_6_bridge_inventory_unchanged():
    """Phase 5.4 / C-4j compatible-pin update: accepts the post-C-4j
    state (db retired, Tier-A empty). The strict post-retirement
    invariant is enforced by
    ``test_phase5_4_c4j_db_bridge_finale.py``."""
    from app.core.app_state_targets import BRIDGE_INVENTORY, TIER_A_SHALLOW_REWIRING

    symbols = {b.symbol for b in BRIDGE_INVENTORY}
    db_in = "db" in symbols
    tier_a = TIER_A_SHALLOW_REWIRING
    valid_pre  = db_in and tier_a == frozenset({"db"})
    valid_post = (not db_in) and tier_a == frozenset()
    assert valid_pre or valid_post, (
        f"[C-4f] FAIL: invalid bridge state. db_in_bridges={db_in}, "
        f"Tier-A={sorted(tier_a)}. Expected pre-C-4j or post-C-4j."
    )
    label = "post-C-4j" if valid_post else "pre-C-4j (db, Tier-A={db})"
    print(f"✓ test_6_bridge_inventory_unchanged  (size={len(BRIDGE_INVENTORY)}, {label})")


# ─────────────────────────────────────────────────────────────────────
# 7) db_runtime accessor surface unchanged from C-4e
# ─────────────────────────────────────────────────────────────────────

def test_7_db_runtime_surface_unchanged():
    from app.core import db_runtime

    expected_public = {"set_db", "get_db", "get_mongo_client", "clear_db_for_tests"}
    actual_all = set(getattr(db_runtime, "__all__", ()))
    assert actual_all == expected_public, (
        f"[C-4f] FAIL: db_runtime.__all__ drifted in C-4f.\n"
        f"  expected: {sorted(expected_public)}\n"
        f"  actual:   {sorted(actual_all)}"
    )

    # Each must still be callable
    for name in expected_public:
        sym = getattr(db_runtime, name)
        assert callable(sym), f"[C-4f] FAIL: db_runtime.{name} not callable"
    print(f"✓ test_7_db_runtime_surface_unchanged  ({len(expected_public)} symbols, all callable)")


# ─────────────────────────────────────────────────────────────────────
# 8) db_runtime setter site is still exactly ONE call in server.py
# ─────────────────────────────────────────────────────────────────────

def test_8_setter_call_site_unchanged():
    server_text = (ROOT / "server.py").read_text(encoding="utf-8")
    tree = ast.parse(server_text)

    setter_calls = []
    for node in ast.walk(tree):
        if isinstance(node, ast.Call):
            fn = node.func
            # match bare `set_db(...)` (after `from app.core.db_runtime import set_db`)
            if isinstance(fn, ast.Name) and fn.id == "set_db":
                setter_calls.append(node.lineno)
            # match qualified `db_runtime.set_db(...)`
            elif isinstance(fn, ast.Attribute) and fn.attr == "set_db":
                # filter out the `socket_runtime.set_sio` neighbour
                if isinstance(fn.value, ast.Name) and fn.value.id.endswith("db_runtime"):
                    setter_calls.append(node.lineno)

    assert len(setter_calls) == 1, (
        f"[C-4f] FAIL: expected exactly 1 `set_db(...)` call in server.py, "
        f"found {len(setter_calls)} at lines {setter_calls}"
    )

    # Sanity: setter must still be AFTER the canonical db assignment.
    canon_line = None
    for m in re.finditer(r"^\s*db\s*=\s*db_client\[DB_NAME\]", server_text, re.MULTILINE):
        canon_line = server_text[: m.start()].count("\n") + 1
    assert canon_line is not None, "[C-4f] FAIL: canonical `db = db_client[DB_NAME]` not found"
    assert setter_calls[0] > canon_line, (
        f"[C-4f] FAIL: set_db at line {setter_calls[0]} must come after "
        f"canonical assignment at line {canon_line}"
    )
    print(f"✓ test_8_setter_call_site_unchanged  (1 call at line {setter_calls[0]}; canonical at {canon_line})")


# ─────────────────────────────────────────────────────────────────────
# 9) Repository constructor signatures NOT changed (mandate-forbidden)
# ─────────────────────────────────────────────────────────────────────

def test_9_repository_constructors_unchanged():
    """For each repo class used by a C-4f file, parse its module and
    verify the constructor signature still accepts a single positional
    `db`-like argument. The migration MUST NOT change repository
    constructors (mandate §Forbidden)."""
    # Resolve the repository module the same way the routers do.
    repo_module_hints = {
        "HistoryReportRepository":   "app/repositories/history_reports.py",
        "AdminSecurityRepository":   "app/repositories/admin_security.py",
        "ServiceCatalogRepository":  "app/repositories",  # may be in __init__.py
        "WorkflowTemplateRepository": "app/repositories/workflow_templates.py",
    }
    failures = []
    for cls_name, hint in repo_module_hints.items():
        hint_path = ROOT / hint
        if hint_path.is_file():
            candidates = [hint_path]
        else:
            candidates = list((ROOT / "app" / "repositories").glob("*.py"))
        found = False
        for cand in candidates:
            try:
                tree = ast.parse(cand.read_text(encoding="utf-8"))
            except Exception:
                continue
            for node in ast.walk(tree):
                if isinstance(node, ast.ClassDef) and node.name == cls_name:
                    # find __init__
                    for sub in node.body:
                        if isinstance(sub, ast.FunctionDef) and sub.name == "__init__":
                            args = [a.arg for a in sub.args.args]
                            # expect (self, db) at minimum; tolerate extras
                            if len(args) < 2 or args[0] != "self":
                                failures.append(
                                    f"{cls_name} ({cand.name}): __init__ args={args}"
                                )
                            found = True
                            break
                    if found:
                        break
            if found:
                break
        if not found:
            failures.append(f"{cls_name}: __init__ not located in candidates")
    assert not failures, (
        "[C-4f] FAIL: repository constructor signature check failed:\n"
        + "\n".join(f"  {f}" for f in failures)
    )
    print(f"✓ test_9_repository_constructors_unchanged  (4/4 repo classes intact)")


# ─────────────────────────────────────────────────────────────────────
# 10) OpenAPI route freeze still 618 / 679
# ─────────────────────────────────────────────────────────────────────

def test_10_openapi_route_freeze_618_679():
    # Lazy import so server.py is parsed exactly once per test run.
    import os
    os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")
    os.environ.setdefault("DB_NAME", "test_database")

    from fastapi.testclient import TestClient

    # Try to import the FastAPI ASGI app. server.py exports both
    # `app` (the socketio.ASGIApp wrap) and `fastapi_app` (the underlying
    # FastAPI). For OpenAPI we need the FastAPI instance.
    import server
    fastapi_app = getattr(server, "fastapi_app", None) or getattr(server, "app", None)
    assert fastapi_app is not None, "[C-4f] FAIL: cannot resolve FastAPI instance from server"

    client = TestClient(fastapi_app)
    r = client.get("/api/openapi.json")
    assert r.status_code == 200, f"[C-4f] FAIL: openapi HTTP {r.status_code}"
    data = r.json()
    paths = data.get("paths", {})
    n_paths = len(paths)
    n_ops = sum(
        len([k for k in v if k in ("get", "post", "put", "patch", "delete", "head", "options")])
        for v in paths.values()
    )
    assert n_paths == 618 and n_ops == 679, (
        f"[C-4f] FAIL: OpenAPI surface drifted. expected 618/679, got {n_paths}/{n_ops}"
    )
    print(f"✓ test_10_openapi_route_freeze_618_679  ({n_paths}/{n_ops})")


# ─────────────────────────────────────────────────────────────────────
# Runner
# ─────────────────────────────────────────────────────────────────────

def _run_all():
    tests = [
        test_1_c4f_routers_no_longer_import_db_from_server,
        test_2_c4f_routers_use_db_runtime_and_correct_repo_class,
        test_3_remaining_bridge_count_is_at_most_ten,
        test_4_c4e_batch_remains_migrated,
        test_5_c4f_inventory_flipped_to_migrated,
        test_6_bridge_inventory_unchanged,
        test_7_db_runtime_surface_unchanged,
        test_8_setter_call_site_unchanged,
        test_9_repository_constructors_unchanged,
        test_10_openapi_route_freeze_618_679,
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
        f"Phase 5.4 / C-4f db retirement BATCH 2 — "
        f"{len(tests) - failed}/{len(tests)} "
        f"{'PASS' if failed == 0 else 'FAIL'}"
    )
    print("=" * 60)
    return 0 if failed == 0 else 1


if __name__ == "__main__":
    sys.exit(_run_all())
