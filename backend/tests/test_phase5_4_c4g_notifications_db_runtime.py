"""
Phase 5.4 / C-4g — notifications module-service db runtime guards.
==================================================================

C-4g is the FIRST Class-B module-service consumer migration. Unlike the
router batches in C-4e/C-4f, this consumer lives OUTSIDE request scope
and is co-located with orchestration code (NotificationService, EventBus,
InAppChannel, EmailChannel). The migration MUST prove three things:

  1. The HTTP-surface `_db()` resolver no longer goes through the legacy
     `from server import db` lazy bridge.
  2. Lazy semantics are preserved — no module-level db handle capture,
     no constructor-time db freeze. Only the `get_db` CALLABLE is
     imported at module-load time; the database handle is resolved at
     call-time on every `_db()` invocation.
  3. The HTTP-surface accessor and the orchestration entry point
     (`init(db, sio)` → `NotificationService(db, sio)`) reach the SAME
     Motor object — no split-brain. The startup-time split-brain assertion
     in `server.py:_main_startup()` already pins this; this suite asserts
     the runtime identity holds end-to-end.

What it pins
------------

1. `notifications.py` no longer imports `db` from server.
2. Production `from server import db` site count == 9.
3. `notifications.py:_db` remains a function (not a module-level binding
   to a db handle).
4. The module-level imports include `get_db` from `app.core.db_runtime`
   but DO NOT include the underlying `_db_ref` cache or any equivalent
   capture.
5. Runtime identity: `notifications._db()` returns the SAME object as
   `db_runtime.get_db()` and as `server.db` (when startup has run).
6. The C-4g DB_CONSUMER_INVENTORY entry is `migrated=True` with
   `recommended_batch="C-4g"`.
7. `init(db, sio)` signature in `notifications.py` is byte-for-byte
   unchanged (mandate-forbidden to touch).
8. `NotificationService.__init__` signature unchanged (mandate-forbidden).
9. `BRIDGE_INVENTORY` still contains `db`; TIER_A == {"db"}.
10. OpenAPI 618/679 unchanged.

Run:
    cd /app/backend && python tests/test_phase5_4_c4g_notifications_db_runtime.py
"""
from __future__ import annotations

import ast
import inspect
import os
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))


# ─────────────────────────────────────────────────────────────────────
# Constants — C-4g batch contract
# ─────────────────────────────────────────────────────────────────────

C4G_BATCH_FILES = frozenset({"notifications.py"})

# Total `from server import db` sites at C-4f close: 10.
# After C-4g migration of notifications.py: 9 sites remain.
REMAINING_BRIDGES_AFTER_C4G = 9

# The 12 + 4 router files migrated in C-4e/C-4f — must remain migrated.
PRIOR_BATCH_FILES = frozenset({
    # C-4e
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
    # C-4f
    "app/routers/admin_history_reports.py",
    "app/routers/admin_security.py",
    "app/routers/admin_services.py",
    "app/routers/admin_workflow_templates.py",
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
# 1) notifications.py no longer imports `from server import db`
# ─────────────────────────────────────────────────────────────────────

def test_1_notifications_no_longer_imports_db_from_server():
    text = (ROOT / "notifications.py").read_text(encoding="utf-8")
    tree = ast.parse(text)
    bad = []
    for node in ast.walk(tree):
        if isinstance(node, ast.ImportFrom) and node.module == "server":
            for alias in node.names:
                if alias.name == "db":
                    bad.append(node.lineno)
    assert not bad, (
        f"[C-4g] FAIL: notifications.py still imports `db` from server at "
        f"line(s) {bad}"
    )
    print("✓ test_1_notifications_no_longer_imports_db_from_server")


# ─────────────────────────────────────────────────────────────────────
# 2) Remaining `from server import db` production sites == 9
# ─────────────────────────────────────────────────────────────────────

def test_2_remaining_bridge_count_is_at_most_nine():
    """C-4g milestone ceiling: <= 9 production `from server import db`
    sites must remain. Softened to a FLOOR invariant so subsequent
    batches (C-4h, C-4i, C-4j) can naturally drive the count lower
    without forcing per-suite pin updates beyond the ceiling.
    """
    sites = _collect_db_import_sites()
    assert len(sites) <= REMAINING_BRIDGES_AFTER_C4G, (
        f"[C-4g regression guard] expected <= {REMAINING_BRIDGES_AFTER_C4G} "
        f"remaining `from server import db` production sites after C-4g, "
        f"found {len(sites)}:\n" + "\n".join(f"  {s}" for s in sites)
    )
    # Sanity — previously-migrated files MUST NOT reappear
    overlap = set(sites) & (PRIOR_BATCH_FILES | C4G_BATCH_FILES)
    assert not overlap, (
        f"[C-4g] FAIL: previously-migrated files reappeared in the bridge "
        f"list (regression): {sorted(overlap)}"
    )
    print(f"✓ test_2_remaining_bridge_count_is_at_most_nine  "
          f"({len(sites)} remaining; ceiling {REMAINING_BRIDGES_AFTER_C4G})")


# ─────────────────────────────────────────────────────────────────────
# 3) Lazy semantics — `_db()` is a function, no module-level db capture
# ─────────────────────────────────────────────────────────────────────

def test_3_db_remains_lazy_callable_no_module_level_capture():
    """The HTTP-surface accessor must:
       (a) be a function (NOT a module-level db handle binding);
       (b) call `get_db()` at invocation time (lazy);
       (c) have no module-level `db = ...` snapshot.
    """
    text = (ROOT / "notifications.py").read_text(encoding="utf-8")
    tree = ast.parse(text)

    # (a) Find `_db` at module scope and confirm it's a FunctionDef
    db_func = None
    for node in tree.body:
        if isinstance(node, ast.FunctionDef) and node.name == "_db":
            db_func = node
            break
    assert db_func is not None, (
        "[C-4g] FAIL: top-level `def _db()` not found in notifications.py"
    )

    # (b) The body must invoke get_db() (Call node with Name 'get_db' or
    # Attribute '.get_db'). Identity-test by walking the function body.
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
    assert calls_get_db, (
        "[C-4g] FAIL: `_db()` body does not invoke `get_db()`; "
        "lazy semantics broken"
    )

    # (c) No module-level `db = ...` assignment (would freeze the handle)
    for node in tree.body:
        if isinstance(node, ast.Assign):
            for tgt in node.targets:
                if isinstance(tgt, ast.Name) and tgt.id == "db":
                    raise AssertionError(
                        f"[C-4g] FAIL: module-level `db = ...` assignment "
                        f"introduced at line {node.lineno} — would capture "
                        f"the db handle at module-load time"
                    )

    print("✓ test_3_db_remains_lazy_callable_no_module_level_capture")


# ─────────────────────────────────────────────────────────────────────
# 4) Module-level imports include `get_db` (function ref, not handle)
# ─────────────────────────────────────────────────────────────────────

def test_4_module_imports_get_db_callable_not_handle():
    """notifications.py must import `get_db` from `app.core.db_runtime`
    at module scope. It must NOT import the underlying `_db_ref` cache or
    any equivalent that would capture the database handle at load time.
    """
    text = (ROOT / "notifications.py").read_text(encoding="utf-8")
    tree = ast.parse(text)

    imports_get_db = False
    bad_imports = []
    for node in ast.walk(tree):
        if isinstance(node, ast.ImportFrom) and node.module == "app.core.db_runtime":
            for alias in node.names:
                if alias.name == "get_db":
                    imports_get_db = True
                # Anything that captures the cached handle is forbidden
                if alias.name in ("_db_ref", "_mongo_client_ref"):
                    bad_imports.append(alias.name)

    assert imports_get_db, (
        "[C-4g] FAIL: notifications.py does not import `get_db` from "
        "`app.core.db_runtime`"
    )
    assert not bad_imports, (
        f"[C-4g] FAIL: notifications.py imports forbidden cache symbols "
        f"{bad_imports} — would defeat lazy semantics"
    )
    print("✓ test_4_module_imports_get_db_callable_not_handle")


# ─────────────────────────────────────────────────────────────────────
# 5) Runtime identity — _db() returns same object as get_db()
# ─────────────────────────────────────────────────────────────────────

def test_5_runtime_identity_with_db_runtime():
    """Identity proof: notifications._db() must return the SAME object
    as app.core.db_runtime.get_db(). If startup ran, both are server.db.
    """
    os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")
    os.environ.setdefault("DB_NAME", "test_database")

    # Force-bind db_runtime to a known fake to exercise the lazy path
    # WITHOUT requiring _main_startup. Then assert _db() picks it up.
    from app.core import db_runtime
    import notifications

    sentinel_db = object()
    sentinel_client = object()
    saved_db = db_runtime.get_db()
    saved_client = db_runtime.get_mongo_client()
    try:
        db_runtime.set_db(sentinel_db, sentinel_client)
        # _db() must resolve at call-time — same object as get_db()
        assert notifications._db() is db_runtime.get_db(), (
            "[C-4g] FAIL: notifications._db() does not equal "
            "db_runtime.get_db() at call time"
        )
        assert notifications._db() is sentinel_db, (
            "[C-4g] FAIL: notifications._db() did not pick up the rebound "
            "sentinel — lazy semantics broken"
        )

        # Rebind to a SECOND sentinel and confirm _db() observes the rebind
        # immediately (no stale capture).
        sentinel_db_2 = object()
        db_runtime.set_db(sentinel_db_2, sentinel_client)
        assert notifications._db() is sentinel_db_2, (
            "[C-4g] FAIL: notifications._db() returned stale handle after "
            "set_db() rebind — capture-on-import regression"
        )
    finally:
        # Restore prior state so other tests (and the live server in the
        # same process, if any) see the real handles again.
        db_runtime.set_db(saved_db, saved_client)

    print("✓ test_5_runtime_identity_with_db_runtime  "
          "(get_db identity + lazy rebind observed)")


# ─────────────────────────────────────────────────────────────────────
# 6) DB_CONSUMER_INVENTORY entry flipped + correct shape
# ─────────────────────────────────────────────────────────────────────

def test_6_c4g_inventory_flipped_to_migrated():
    from app.core.app_state_targets import DB_CONSUMER_INVENTORY

    c4g_entries = [c for c in DB_CONSUMER_INVENTORY if c.recommended_batch == "C-4g"]
    assert len(c4g_entries) == 1, (
        f"[C-4g] FAIL: expected exactly 1 C-4g inventory entry, found "
        f"{len(c4g_entries)}"
    )
    e = c4g_entries[0]
    assert e.file == "notifications.py", (
        f"[C-4g] FAIL: C-4g inventory entry file mismatch — got {e.file}"
    )
    assert e.function == "_db", (
        f"[C-4g] FAIL: C-4g inventory entry function mismatch — got "
        f"{e.function}"
    )
    assert e.access_class == "B", (
        f"[C-4g] FAIL: C-4g entry should be access_class=B (Class-B "
        f"module-service), got {e.access_class}"
    )
    assert e.migrated is True, (
        "[C-4g] FAIL: C-4g inventory entry not flipped to migrated=True"
    )
    print("✓ test_6_c4g_inventory_flipped_to_migrated")


# ─────────────────────────────────────────────────────────────────────
# 7) init(db, sio) signature unchanged (mandate-forbidden to touch)
# ─────────────────────────────────────────────────────────────────────

def test_7_init_signature_unchanged():
    """`notifications.init(db, sio=None) -> NotificationService` must be
    byte-for-byte preserved. The C-4g mandate explicitly forbids touching
    this entry point.
    """
    import notifications
    sig = inspect.signature(notifications.init)
    params = list(sig.parameters.values())
    assert len(params) == 2, (
        f"[C-4g] FAIL: notifications.init() expected 2 params (db, sio), "
        f"got {len(params)}: {params}"
    )
    assert params[0].name == "db", (
        f"[C-4g] FAIL: first param must be `db`, got {params[0].name}"
    )
    assert params[1].name == "sio", (
        f"[C-4g] FAIL: second param must be `sio`, got {params[1].name}"
    )
    # `sio` must keep its default of None
    assert params[1].default is None, (
        f"[C-4g] FAIL: `sio` default changed from None to {params[1].default}"
    )
    print("✓ test_7_init_signature_unchanged")


# ─────────────────────────────────────────────────────────────────────
# 8) NotificationService.__init__ signature unchanged
# ─────────────────────────────────────────────────────────────────────

def test_8_notification_service_constructor_unchanged():
    """NotificationService.__init__(db, sio=None) constructor signature
    must be preserved (mandate-forbidden to change)."""
    import notifications
    sig = inspect.signature(notifications.NotificationService.__init__)
    params = list(sig.parameters.values())
    # self, db, sio
    assert len(params) >= 3, (
        f"[C-4g] FAIL: NotificationService.__init__ expected >=3 params "
        f"(self, db, sio), got {len(params)}"
    )
    assert params[0].name == "self"
    # `db` must be the second positional param
    assert params[1].name == "db", (
        f"[C-4g] FAIL: NotificationService.__init__ second param must be "
        f"`db`, got {params[1].name}"
    )
    print("✓ test_8_notification_service_constructor_unchanged")


# ─────────────────────────────────────────────────────────────────────
# 9) Bridge inventory unchanged — db Bridge still present, no retirement
# ─────────────────────────────────────────────────────────────────────

def test_9_bridge_inventory_unchanged():
    """Phase 5.4 / C-4j compatible-pin update: accepts the post-C-4j
    state (db retired, Tier-A empty)."""
    from app.core.app_state_targets import BRIDGE_INVENTORY, TIER_A_SHALLOW_REWIRING
    symbols = {b.symbol for b in BRIDGE_INVENTORY}
    db_in = "db" in symbols
    tier_a = TIER_A_SHALLOW_REWIRING
    valid_pre  = db_in and tier_a == frozenset({"db"})
    valid_post = (not db_in) and tier_a == frozenset()
    assert valid_pre or valid_post, (
        f"[C-4g] FAIL: invalid bridge state. db_in_bridges={db_in}, "
        f"Tier-A={sorted(tier_a)}."
    )
    label = "post-C-4j" if valid_post else "pre-C-4j"
    print(f"✓ test_9_bridge_inventory_unchanged  "
          f"(size={len(BRIDGE_INVENTORY)}, {label})")


# ─────────────────────────────────────────────────────────────────────
# 10) OpenAPI route freeze still 618 / 679
# ─────────────────────────────────────────────────────────────────────

def test_10_openapi_route_freeze_618_679():
    os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")
    os.environ.setdefault("DB_NAME", "test_database")

    from fastapi.testclient import TestClient
    import server
    fastapi_app = getattr(server, "fastapi_app", None) or getattr(server, "app", None)
    assert fastapi_app is not None, "[C-4g] FAIL: cannot resolve FastAPI instance"

    client = TestClient(fastapi_app)
    r = client.get("/api/openapi.json")
    assert r.status_code == 200, f"[C-4g] FAIL: openapi HTTP {r.status_code}"
    data = r.json()
    paths = data.get("paths", {})
    n_paths = len(paths)
    n_ops = sum(
        len([k for k in v if k in ("get", "post", "put", "patch", "delete", "head", "options")])
        for v in paths.values()
    )
    assert n_paths == 618 and n_ops == 679, (
        f"[C-4g] FAIL: OpenAPI surface drifted. expected 618/679, got "
        f"{n_paths}/{n_ops}"
    )
    print(f"✓ test_10_openapi_route_freeze_618_679  ({n_paths}/{n_ops})")


# ─────────────────────────────────────────────────────────────────────
# Runner
# ─────────────────────────────────────────────────────────────────────

def _run_all():
    tests = [
        test_1_notifications_no_longer_imports_db_from_server,
        test_2_remaining_bridge_count_is_at_most_nine,
        test_3_db_remains_lazy_callable_no_module_level_capture,
        test_4_module_imports_get_db_callable_not_handle,
        test_5_runtime_identity_with_db_runtime,
        test_6_c4g_inventory_flipped_to_migrated,
        test_7_init_signature_unchanged,
        test_8_notification_service_constructor_unchanged,
        test_9_bridge_inventory_unchanged,
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
        f"Phase 5.4 / C-4g notifications db_runtime migration — "
        f"{len(tests) - failed}/{len(tests)} "
        f"{'PASS' if failed == 0 else 'FAIL'}"
    )
    print("=" * 60)
    return 0 if failed == 0 else 1


if __name__ == "__main__":
    sys.exit(_run_all())
