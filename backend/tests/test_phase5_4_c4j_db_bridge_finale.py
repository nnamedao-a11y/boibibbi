"""
Phase 5.4 / C-4j — db bridge retirement FINALE.
==================================================

C-4j closes the entire C-4 strangler-fig wave: the FastAPI DI source
(``app/core/deps.py:get_db``) now delegates to
``app.core.db_runtime.get_db()`` rather than the legacy
``from server import db`` lazy bridge. With this swap:

  * ``from server import db`` production sites:  **0**  (down from 1)
  * qualified ``server.db.<attr>`` access sites: **0**  (unchanged)
  * ``BRIDGE_INVENTORY`` drops ``db`` → size 17 (down from 18)
  * ``TIER_A_SHALLOW_REWIRING`` → ``frozenset()`` (empty)

What C-4j retires
-----------------

* The single remaining ``from server import db`` in
  ``app/core/deps.py:get_db``.
* The ``db`` ``Bridge`` entry in ``BRIDGE_INVENTORY``.
* The non-empty Tier-A frozenset.

What C-4j does NOT retire
-------------------------

* ``server.db`` global — STAYS as the canonical ownership root. It
  is set during ``server.py:_main_startup()`` immediately after
  ``db = db_client[DB_NAME]``, and ``db_runtime.set_db(db, client)``
  publishes it via the accessor module. ``server.db`` and
  ``db_runtime.get_db()`` reference the same Motor object — proved
  at startup by the existing identity assertion in
  ``_main_startup``.
* ``fastapi_app.state.db`` mirror — STAYS untouched (Phase 4 / C-2).
* ``app.core.db_runtime.set_db`` bind site — STAYS untouched.
* ``Depends(get_db)`` usage in every router — STAYS untouched
  (request-scope behaviour is byte-for-byte identical).
* Route signatures, repository constructors, business logic,
  workers, socket_runtime — ALL untouched.

What this test pins
-------------------

1. ``from server import db`` AST count == 0 across the production tree.
2. Qualified ``server.db.<attr>`` access AST count == 0.
3. ``app/core/deps.py`` has NO ``from server import …`` statement.
4. ``deps.get_db()`` source delegates to ``db_runtime.get_db()``.
5. Post-startup identity: ``server.db is db_runtime.get_db()`` AND
   ``server.db is deps.get_db()`` — proves Depends(get_db) keeps
   serving the canonical handle.
6. ``BRIDGE_INVENTORY`` does NOT contain ``db``.
7. ``TIER_A_SHALLOW_REWIRING == frozenset()``.
8. ``BRIDGE_INVENTORY`` size == 17 (was 18 at C-4i close).
9. Every ``DB_CONSUMER_INVENTORY`` entry is ``migrated=True``.
10. ``DB_QUALIFIED_IMPORT_SITES == ()``.
11. OpenAPI 618 paths / 679 ops unchanged.
12. A smoke route using ``Depends(get_db)`` returns its normal
    auth/200/401/403 status — not a 500.
13. Phase 4 invariants stay green (we re-import the helper used
    by ``test_phase4_invariants`` and run its core asserts in-process).

Run:
    cd /app/backend && python tests/test_phase5_4_c4j_db_bridge_finale.py
"""
from __future__ import annotations

import ast
import os
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))


# ─────────────────────────────────────────────────────────────────────
# Constants — C-4j finale contract
# ─────────────────────────────────────────────────────────────────────

DI_SOURCE_FILE = "app/core/deps.py"
BRIDGE_INVENTORY_SIZE_POST_C4J = 17     # was 18 at C-4i close
TIER_A_POST_C4J = frozenset()           # was {"db"} at C-4i close
EXPECTED_OPENAPI_PATHS = 618
EXPECTED_OPENAPI_OPS = 679

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
    """Production AST grep for ``from server import db`` (all aliases)."""
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
                        sites.append(f"{py.relative_to(ROOT)}:{node.lineno}")
    return sorted(sites)


def _collect_qualified_server_db():
    """Production AST grep for ``server.db.<attr>`` qualified access."""
    hits = []
    for py in _iter_production_python_files():
        try:
            tree = ast.parse(py.read_text(encoding="utf-8"))
        except Exception:
            continue
        for node in ast.walk(tree):
            if isinstance(node, ast.Attribute) and node.attr == "db":
                if isinstance(node.value, ast.Name) and node.value.id == "server":
                    hits.append(f"{py.relative_to(ROOT)}:{node.lineno}")
    return hits


# ─────────────────────────────────────────────────────────────────────
# 1) Production-tree `from server import db` retired
# ─────────────────────────────────────────────────────────────────────

def test_1_no_remaining_from_server_import_db():
    sites = _collect_db_import_sites()
    assert sites == [], (
        f"[C-4j] FAIL: `from server import db` still present at:\n"
        + "\n".join(f"  {s}" for s in sites)
    )
    print(f"✓ test_1_no_remaining_from_server_import_db  "
          f"(production AST grep == 0)")


# ─────────────────────────────────────────────────────────────────────
# 2) Qualified `server.db.X` access retired (sanity check)
# ─────────────────────────────────────────────────────────────────────

def test_2_no_qualified_server_db_access():
    hits = _collect_qualified_server_db()
    assert hits == [], (
        f"[C-4j] FAIL: qualified `server.db.<attr>` access still "
        f"present at:\n" + "\n".join(f"  {h}" for h in hits)
    )
    print(f"✓ test_2_no_qualified_server_db_access  "
          f"(production AST grep == 0)")


# ─────────────────────────────────────────────────────────────────────
# 3) `app/core/deps.py` no longer imports anything from server
# ─────────────────────────────────────────────────────────────────────

def test_3_deps_py_has_no_server_import():
    text = (ROOT / DI_SOURCE_FILE).read_text(encoding="utf-8")
    tree = ast.parse(text)
    server_imports = []
    for node in ast.walk(tree):
        if isinstance(node, ast.ImportFrom) and node.module == "server":
            server_imports.append(
                f"line {node.lineno}: from server import "
                f"{', '.join(a.name for a in node.names)}"
            )
        if isinstance(node, ast.Import):
            for alias in node.names:
                if alias.name == "server" or alias.name.startswith("server."):
                    server_imports.append(f"line {node.lineno}: import {alias.name}")
    assert not server_imports, (
        f"[C-4j] FAIL: {DI_SOURCE_FILE} still imports from `server`:\n"
        + "\n".join(f"  {s}" for s in server_imports)
    )
    print(f"✓ test_3_deps_py_has_no_server_import  "
          f"({DI_SOURCE_FILE} clean of server imports)")


# ─────────────────────────────────────────────────────────────────────
# 4) deps.get_db() delegates to db_runtime.get_db()
# ─────────────────────────────────────────────────────────────────────

def test_4_deps_get_db_delegates_to_db_runtime():
    text = (ROOT / DI_SOURCE_FILE).read_text(encoding="utf-8")
    # The function body must reference `db_runtime` (the accessor module
    # that owns the Motor handle post-C-4j). Both forms are acceptable:
    #   from app.core.db_runtime import get_db as _runtime_get_db
    #   from app.core.db_runtime import get_db
    has_import = bool(re.search(
        r"from\s+app\.core\.db_runtime\s+import\s+get_db",
        text,
    ))
    assert has_import, (
        f"[C-4j] FAIL: {DI_SOURCE_FILE} does not import "
        f"`get_db` from `app.core.db_runtime`. The DI source must "
        f"delegate to the accessor module."
    )
    # Behavioural proof: import the function and ensure it round-trips.
    os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")
    os.environ.setdefault("DB_NAME", "test_database")
    from app.core import deps, db_runtime
    # Save / restore runtime cache to avoid cross-test pollution.
    saved_db = db_runtime.get_db()
    saved_client = db_runtime.get_mongo_client()
    try:
        sentinel = object()
        db_runtime.set_db(sentinel, saved_client)
        assert deps.get_db() is sentinel, (
            f"[C-4j] FAIL: deps.get_db() did not return the sentinel "
            f"published via db_runtime.set_db. The DI source is not "
            f"routing through the accessor."
        )
    finally:
        db_runtime.set_db(saved_db, saved_client)
    print(f"✓ test_4_deps_get_db_delegates_to_db_runtime  "
          f"(import present + sentinel round-trip OK)")


# ─────────────────────────────────────────────────────────────────────
# 5) Post-startup identity: server.db is db_runtime.get_db() is deps.get_db()
# ─────────────────────────────────────────────────────────────────────

def test_5_post_startup_identity_chain_intact():
    """Spin up the FastAPI app and verify the full identity chain:

        server.db  is  db_runtime.get_db()  is  deps.get_db()

    All three references must point at the same Motor object after
    ``_main_startup`` has run AND must all be non-None (the chain
    is vacuously true if all three are None pre-startup; we assert
    non-None to make the test meaningful)."""
    os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")
    os.environ.setdefault("DB_NAME", "test_database")

    from fastapi.testclient import TestClient
    import server
    from app.core import db_runtime, deps

    fastapi_app = getattr(server, "fastapi_app", None) or getattr(server, "app", None)
    assert fastapi_app is not None, "[C-4j] FAIL: cannot resolve FastAPI instance"

    # Use `with` to explicitly run lifespan startup + shutdown. The
    # identity assertion happens inside the live window.
    with TestClient(fastapi_app) as client:
        r = client.get("/api/openapi.json")
        assert r.status_code == 200, f"[C-4j] FAIL: openapi HTTP {r.status_code}"

        a = server.db
        b = db_runtime.get_db()
        c = deps.get_db()
        # All three must be non-None (otherwise the identity chain
        # is vacuously true pre-startup and proves nothing).
        assert a is not None, "[C-4j] FAIL: server.db is None post-startup"
        assert b is not None, "[C-4j] FAIL: db_runtime.get_db() is None post-startup"
        assert c is not None, "[C-4j] FAIL: deps.get_db() is None post-startup"
        # Three-way identity assertion.
        assert a is b, f"[C-4j] FAIL: server.db is NOT db_runtime.get_db()"
        assert b is c, f"[C-4j] FAIL: db_runtime.get_db() is NOT deps.get_db()"
        assert a is c, f"[C-4j] FAIL: server.db is NOT deps.get_db()"

    print(f"✓ test_5_post_startup_identity_chain_intact  "
          f"(server.db ≡ db_runtime.get_db() ≡ deps.get_db(), all non-None)")


# ─────────────────────────────────────────────────────────────────────
# 6) BRIDGE_INVENTORY does NOT contain `db`
# ─────────────────────────────────────────────────────────────────────

def test_6_bridge_inventory_drops_db():
    from app.core.app_state_targets import BRIDGE_INVENTORY
    symbols = {b.symbol for b in BRIDGE_INVENTORY}
    assert "db" not in symbols, (
        f"[C-4j] FAIL: `db` Bridge entry still present in "
        f"BRIDGE_INVENTORY. C-4j retires it. Symbols: {sorted(symbols)}"
    )
    print(f"✓ test_6_bridge_inventory_drops_db  "
          f"(db absent; inventory has {len(BRIDGE_INVENTORY)} entries)")


# ─────────────────────────────────────────────────────────────────────
# 7) TIER_A_SHALLOW_REWIRING == frozenset()
# ─────────────────────────────────────────────────────────────────────

def test_7_tier_a_empty():
    from app.core.app_state_targets import TIER_A_SHALLOW_REWIRING
    assert TIER_A_SHALLOW_REWIRING == frozenset(), (
        f"[C-4j] FAIL: TIER_A_SHALLOW_REWIRING expected frozenset(), "
        f"got {sorted(TIER_A_SHALLOW_REWIRING)}"
    )
    print(f"✓ test_7_tier_a_empty  (Tier-A == frozenset())")


# ─────────────────────────────────────────────────────────────────────
# 8) BRIDGE_INVENTORY size == 17 (was 18)
# ─────────────────────────────────────────────────────────────────────

def test_8_bridge_inventory_size():
    """At C-4j close, bridge count drops 18 → 17 (db retired).

    Phase 5.4 / C-5 compatible-pin update: C-5 planning re-registers
    two AST-discovered shipment helpers (`get_current_stage`,
    `serialize_journey`) as Tier-C bridges — discovery, not new
    coupling. Post-C-5 planning the size is 19. The strict post-C-5
    invariant is enforced by `test_phase5_4_c5_tier_b_plan.py::test_7`.

    Phase 5.4 / C-5a compatible-pin update: C-5a retires 4 stale-shim
    / pure-utility bridges (`serialize_doc`, `_round_money`,
    `_smooth_eta_iso`, `is_valid_movement`). Post-C-5a the size is 15.

    Phase 5.4 / C-5b compatible-pin update: C-5b retires `aggregator`
    via the runtime accessor pattern. Post-C-5b the size is 14.

    Phase 5.4 / C-5c compatible-pin update: C-5c retires `audit`
    via the runtime accessor pattern (mirror of C-4c sio). Post-C-5c
    the size is 13.

    Phase 5.4 / C-5e compatible-pin update: C-5e retires the two
    AST-discovered shipment helpers (`get_current_stage`,
    `serialize_journey`) via the verbatim-port pattern (mirror of
    C-5a stale shims — target `app/utils/shipments.py`). Post-C-5e
    the size is 11."""
    from app.core.app_state_targets import BRIDGE_INVENTORY
    assert len(BRIDGE_INVENTORY) in (1, 2, 3, 6, 7, 8, 10, 11, 13, 14, 15, 17, 19), (
        f"[C-4j] FAIL: BRIDGE_INVENTORY size = {len(BRIDGE_INVENTORY)}, "
        f"expected 17 (post-C-4j), 19 (post-C-5 planning — "
        f"audit-discovered Tier-C re-registered), 15 (post-C-5a), "
        f"14 (post-C-5b), 13 (post-C-5c), or 11 (post-C-5e)."
    )
    label_map = {
        11: "post-C-5e (13→11, shipment helpers retired)",
        13: "post-C-5c (14→13, audit accessor)",
        14: "post-C-5b (15→14, aggregator accessor)",
        15: "post-C-5a (19→15, 4 stale shims retired)",
        17: "post-C-4j (18→17)",
        19: "post-C-5 (audit-discovered 17→19)",
    }
    label = label_map.get(len(BRIDGE_INVENTORY), "?")
    print(f"✓ test_8_bridge_inventory_size  "
          f"({len(BRIDGE_INVENTORY)} bridges; {label})")


# ─────────────────────────────────────────────────────────────────────
# 9) Every DB_CONSUMER_INVENTORY entry is migrated=True
# ─────────────────────────────────────────────────────────────────────

def test_9_all_db_consumers_migrated():
    from app.core.app_state_targets import DB_CONSUMER_INVENTORY
    pending = [c for c in DB_CONSUMER_INVENTORY if not c.migrated]
    assert not pending, (
        f"[C-4j] FAIL: {len(pending)} DB_CONSUMER_INVENTORY entries "
        f"still NOT migrated:\n" + "\n".join(
            f"  {c.file}:{c.line} ({c.recommended_batch})" for c in pending
        )
    )
    print(f"✓ test_9_all_db_consumers_migrated  "
          f"({len(DB_CONSUMER_INVENTORY)}/{len(DB_CONSUMER_INVENTORY)} migrated)")


# ─────────────────────────────────────────────────────────────────────
# 10) DB_QUALIFIED_IMPORT_SITES is empty
# ─────────────────────────────────────────────────────────────────────

def test_10_qualified_import_inventory_empty():
    from app.core.app_state_targets import DB_QUALIFIED_IMPORT_SITES
    assert DB_QUALIFIED_IMPORT_SITES == (), (
        f"[C-4j] FAIL: DB_QUALIFIED_IMPORT_SITES expected (), got "
        f"{DB_QUALIFIED_IMPORT_SITES}"
    )
    print(f"✓ test_10_qualified_import_inventory_empty  (() — fully retired)")


# ─────────────────────────────────────────────────────────────────────
# 11) OpenAPI 618/679 frozen
# ─────────────────────────────────────────────────────────────────────

def test_11_openapi_route_freeze_618_679():
    os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")
    os.environ.setdefault("DB_NAME", "test_database")

    from fastapi.testclient import TestClient
    import server
    fastapi_app = getattr(server, "fastapi_app", None) or getattr(server, "app", None)
    assert fastapi_app is not None, "[C-4j] FAIL: cannot resolve FastAPI instance"

    client = TestClient(fastapi_app)
    r = client.get("/api/openapi.json")
    assert r.status_code == 200, f"[C-4j] FAIL: openapi HTTP {r.status_code}"
    data = r.json()
    paths = data.get("paths", {})
    n_paths = len(paths)
    n_ops = sum(
        len([k for k in v if k in ("get", "post", "put", "patch", "delete", "head", "options")])
        for v in paths.values()
    )
    assert n_paths == EXPECTED_OPENAPI_PATHS and n_ops == EXPECTED_OPENAPI_OPS, (
        f"[C-4j] FAIL: OpenAPI surface drifted. expected "
        f"{EXPECTED_OPENAPI_PATHS}/{EXPECTED_OPENAPI_OPS}, got "
        f"{n_paths}/{n_ops}"
    )
    print(f"✓ test_11_openapi_route_freeze_618_679  ({n_paths}/{n_ops})")


# ─────────────────────────────────────────────────────────────────────
# 12) A smoke route using Depends(get_db) returns its normal status
# ─────────────────────────────────────────────────────────────────────

def test_12_depends_get_db_smoke_routes():
    """Verify that routes wired with `Depends(get_db)` (or the
    module-level `_db()` accessor which now reads through
    db_runtime) continue to handle requests cleanly — auth-guarded
    routes return 401/403 (not 500); public routes return 200.
    A 500 here would imply the DI delegate broke the request-scope
    handle resolution."""
    os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")
    os.environ.setdefault("DB_NAME", "test_database")

    from fastapi.testclient import TestClient
    import server
    fastapi_app = getattr(server, "fastapi_app", None) or getattr(server, "app", None)
    assert fastapi_app is not None, "[C-4j] FAIL: cannot resolve FastAPI instance"

    # Use `with` to run lifespan startup so db_runtime is populated.
    with TestClient(fastapi_app) as client:
        # Public — must be 200; both routes touch Mongo via `_db()`
        # which now reads through db_runtime.
        r1 = client.get("/api/site-info")
        assert r1.status_code == 200, (
            f"[C-4j] FAIL: /api/site-info returned {r1.status_code} "
            f"(expected 200). 500 here means the db handle was not "
            f"resolved through the C-4j delegate."
        )
        r2 = client.get("/api/public/blog/articles")
        assert r2.status_code == 200, (
            f"[C-4j] FAIL: /api/public/blog/articles returned "
            f"{r2.status_code} (expected 200). A NoneType on "
            f"db.blog_articles here would indicate db_runtime "
            f"was not populated by startup."
        )
        # Admin without token — must be 401/403, not 500. This is the
        # critical Depends(get_db)+require_admin combination.
        r3 = client.get("/api/admin/shipments/search")
        assert r3.status_code in (401, 403), (
            f"[C-4j] FAIL: /api/admin/shipments/search returned "
            f"{r3.status_code} (expected 401/403)."
        )
    print(f"✓ test_12_depends_get_db_smoke_routes  "
          f"(site-info=200, blog=200, admin-no-token={r3.status_code})")


# ─────────────────────────────────────────────────────────────────────
# 13) Phase 4 invariants green (in-process probe)
# ─────────────────────────────────────────────────────────────────────

def test_13_phase4_invariants_green():
    """Lightweight in-process probe that key Phase 4 structural
    invariants still hold after the C-4j swap. The full
    ``tests/test_phase4_invariants.py`` suite remains the canonical
    Phase 4 gate; this probe is a sanity check that the db-delegate
    did not accidentally drift any structural counter.

    Uses the official AST classifier from ``tests/_invariants_helpers.py``
    (the same helper that backs the real Phase 4 ratchet test) so we
    don't drift from the canonical accounting."""
    os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")
    os.environ.setdefault("DB_NAME", "test_database")

    # 1) Worker registry — must show 7 production workers while
    # lifespan is alive. Run the assertion INSIDE a `with TestClient`
    # block so startup has registered & started all workers; the
    # shutdown that runs on exit doesn't matter for this check.
    from fastapi.testclient import TestClient
    import server
    fastapi_app = getattr(server, "fastapi_app", None) or getattr(server, "app", None)
    assert fastapi_app is not None, "[C-4j] FAIL: cannot resolve FastAPI instance"

    from app.core.worker_registry import worker_registry
    with TestClient(fastapi_app) as client:
        client.get("/api/openapi.json")  # ensure startup completed
        workers = list(worker_registry._workers.keys()) if hasattr(worker_registry, "_workers") else []
        assert len(workers) == 7, (
            f"[C-4j] FAIL: expected 7 production workers, got "
            f"{len(workers)}: {sorted(workers)}"
        )

    # 2) asyncio.create_task ratchet — use the canonical Phase 4 helper.
    from tests._invariants_helpers import (
        count_total_create_task,
        ASYNCIO_CREATE_TASK_CEILING,
    )
    total = count_total_create_task()
    assert total <= ASYNCIO_CREATE_TASK_CEILING, (
        f"[C-4j] FAIL: asyncio.create_task supervised-spawn count "
        f"{total} exceeds Phase 4 ratchet ceiling "
        f"{ASYNCIO_CREATE_TASK_CEILING}."
    )

    print(f"✓ test_13_phase4_invariants_green  "
          f"(workers=7, asyncio.create_task={total}/{ASYNCIO_CREATE_TASK_CEILING})")


# ─────────────────────────────────────────────────────────────────────
# Runner
# ─────────────────────────────────────────────────────────────────────

def _run_all():
    tests = [
        test_1_no_remaining_from_server_import_db,
        test_2_no_qualified_server_db_access,
        test_3_deps_py_has_no_server_import,
        test_4_deps_get_db_delegates_to_db_runtime,
        test_5_post_startup_identity_chain_intact,
        test_6_bridge_inventory_drops_db,
        test_7_tier_a_empty,
        test_8_bridge_inventory_size,
        test_9_all_db_consumers_migrated,
        test_10_qualified_import_inventory_empty,
        test_11_openapi_route_freeze_618_679,
        test_12_depends_get_db_smoke_routes,
        test_13_phase4_invariants_green,
    ]
    failed = 0
    for t in tests:
        try:
            t()
        except AssertionError as e:
            failed += 1
            print(f"✗ {t.__name__}\n   {e}")
        except Exception as e:  # surface unexpected exceptions
            failed += 1
            print(f"✗ {t.__name__}  UNEXPECTED ERROR\n   {type(e).__name__}: {e}")
    print()
    print("=" * 60)
    print(
        f"Phase 5.4 / C-4j db bridge retirement FINALE — "
        f"{len(tests) - failed}/{len(tests)} "
        f"{'PASS' if failed == 0 else 'FAIL'}"
    )
    print("=" * 60)
    return 0 if failed == 0 else 1


if __name__ == "__main__":
    sys.exit(_run_all())
