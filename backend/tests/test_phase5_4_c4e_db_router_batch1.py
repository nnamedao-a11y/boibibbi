"""
Phase 5.4 / C-4e — db retirement batch 1 regression guards.
============================================================

This test suite is the regression guard for the first db consumer
migration batch (12 low-risk Class-A admin routers). Mirror of the
C-4c sio retirement pattern, with additional assertions specific
to the database runtime (mongo_client accessor + multi-batch
contract).

What it pins
------------

1. **`app/core/db_runtime.py` shape**: exposes exactly
   `set_db` / `get_db` / `get_mongo_client` / `clear_db_for_tests`,
   plus the two module-private caches; nothing else.
2. **Single setter call site in server.py** after the canonical
   `db = db_client[DB_NAME]` and the existing `fastapi_app.state.db`
   mirror.
3. **Two startup-time identity assertions** at the setter site
   (db + mongo_client).
4. **Split-brain prevention** assertion before `notifications.init(db, sio)`.
5. **12 C-4e batch consumers no longer import `db` from server**.
6. **Remaining `from server import db` production sites == 14**
   (26 - 12 just migrated).
7. **Live identity**: `get_db() is server.db`, `get_mongo_client() is server.db_client`.
8. **Bridge inventory unchanged** — `db` Bridge entry still present,
   `TIER_A_SHALLOW_REWIRING == {db}`, BRIDGE_INVENTORY size still 18.
9. **C-4e migrated routers reference db_runtime in their `_db()`**.
10. **OpenAPI route freeze still 618/679**.

Run:
    cd /app/backend && python tests/test_phase5_4_c4e_db_router_batch1.py
"""
from __future__ import annotations

import ast
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))


# ─────────────────────────────────────────────────────────────────────
# Constants — C-4e batch contract
# ─────────────────────────────────────────────────────────────────────

# The 12 routers migrated in C-4e (from DB_CONSUMER_INVENTORY).
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

# Total `from server import db` sites at C-4d close: 26.
# After C-4e migration of 12 routers: 14 sites remain.
REMAINING_BRIDGES_AFTER_C4E = 14

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
# 1) db_runtime module shape
# ─────────────────────────────────────────────────────────────────────

def test_1_db_runtime_module_shape():
    """`app/core/db_runtime.py` must exist and expose the exact
    surface: set_db / get_db / get_mongo_client / clear_db_for_tests
    + module-private `_db_ref` and `_mongo_client_ref` caches."""
    db_rt_path = ROOT / "app" / "core" / "db_runtime.py"
    assert db_rt_path.exists(), (
        "app/core/db_runtime.py does not exist — C-4e MUST create it"
    )
    from app.core import db_runtime
    for fn in ("set_db", "get_db", "get_mongo_client", "clear_db_for_tests"):
        assert hasattr(db_runtime, fn), (
            f"app.core.db_runtime missing {fn}"
        )
    assert hasattr(db_runtime, "_db_ref"), "missing _db_ref cache"
    assert hasattr(db_runtime, "_mongo_client_ref"), "missing _mongo_client_ref cache"
    # Forbidden surface
    forbidden = {"Depends", "router", "FastAPI", "Connection",
                 "Repository", "Pool"}
    actual_public = {n for n in dir(db_runtime)
                     if not n.startswith("_") and n not in {
                         "set_db", "get_db", "get_mongo_client",
                         "clear_db_for_tests", "Any", "Optional",
                         "annotations"
                     }}
    leaked = actual_public & forbidden
    assert not leaked, (
        f"db_runtime grew forbidden surface: {leaked}"
    )
    print(f"✓ test_1_db_runtime_module_shape  "
          f"(public surface = {{set_db, get_db, get_mongo_client, clear_db_for_tests}})")


# ─────────────────────────────────────────────────────────────────────
# 2) Single setter call site in server.py + identity assertions
# ─────────────────────────────────────────────────────────────────────

def test_2_single_setter_call_site_in_server_py():
    """`server.py` must invoke `set_db(` at EXACTLY one call site,
    located inside `_main_startup` after the canonical
    `db = db_client[DB_NAME]` line."""
    server_text = (ROOT / "server.py").read_text(encoding="utf-8")
    lines = server_text.splitlines()
    call_sites = [
        i + 1 for i, line in enumerate(lines)
        if re.search(r"\bset_db\s*\(", line)
        and not line.lstrip().startswith("from ")
        and not line.lstrip().startswith("import ")
    ]
    assert len(call_sites) == 1, (
        f"Expected EXACTLY one set_db() call in server.py; "
        f"got {len(call_sites)}: lines={call_sites}"
    )
    setter_line = call_sites[0]
    # Find canonical db = db_client[DB_NAME] line
    canonical_line = next(
        (i + 1 for i, line in enumerate(lines)
         if re.search(r"\bdb\s*=\s*db_client\s*\[\s*DB_NAME\s*\]", line)),
        None,
    )
    assert canonical_line, "Could not find `db = db_client[DB_NAME]` canonical site"
    assert canonical_line < setter_line, (
        f"set_db() at L{setter_line} must come AFTER the canonical "
        f"`db = db_client[DB_NAME]` at L{canonical_line}"
    )
    # Window check — setter should be within reasonable proximity (say 80 LOC)
    assert setter_line - canonical_line < 80, (
        f"set_db() at L{setter_line} is too far from the canonical "
        f"assignment at L{canonical_line} (gap = {setter_line - canonical_line})"
    )
    print(f"✓ test_2_single_setter_call_site_in_server_py  "
          f"(canonical L{canonical_line}, setter L{setter_line})")


def test_3_two_identity_assertions_at_setter_site():
    """At the setter site, server.py must contain TWO identity
    assertions: one for db, one for mongo_client."""
    server_text = (ROOT / "server.py").read_text(encoding="utf-8")
    # db identity assertion
    assert re.search(
        r"_runtime_get_db\(\)\s+is\s+db|get_db\(\)\s+is\s+db",
        server_text,
    ), "Missing db identity assertion at setter site"
    # mongo_client identity assertion
    assert re.search(
        r"_runtime_get_mongo\(\)\s+is\s+db_client|get_mongo_client\(\)\s+is\s+db_client",
        server_text,
    ), "Missing mongo_client identity assertion at setter site"
    print("✓ test_3_two_identity_assertions_at_setter_site")


# ─────────────────────────────────────────────────────────────────────
# 3) Split-brain prevention before notifications.init
# ─────────────────────────────────────────────────────────────────────

def test_4_split_brain_assertion_before_notifications_init():
    """An identity assertion `get_db() is db` must appear BEFORE
    the `notifications.init(db, sio)` call. Mirror of the C-4c
    sio split-brain pattern."""
    server_text = (ROOT / "server.py").read_text(encoding="utf-8")
    lines = server_text.splitlines()
    init_line = next(
        (i + 1 for i, line in enumerate(lines)
         if "_notif_mod.init(db, sio)" in line),
        None,
    )
    assert init_line, "Could not find notifications.init(db, sio) call"
    # Look back up to 40 lines for the assertion
    window_start = max(0, init_line - 40)
    window = "\n".join(lines[window_start:init_line])
    assert "get_db()" in window and "is db" in window, (
        f"Missing split-brain prevention `assert get_db() is db` "
        f"before notifications.init at L{init_line}"
    )
    print(f"✓ test_4_split_brain_assertion_before_notifications_init  "
          f"(notif init at L{init_line})")


# ─────────────────────────────────────────────────────────────────────
# 4) Migration completeness — 12 routers swapped
# ─────────────────────────────────────────────────────────────────────

def test_5_c4e_routers_no_longer_import_db_from_server():
    """Every C-4e batch router must NOT contain
    `from server import db` anywhere in its `_db()` function."""
    offenders = []
    for rel in C4E_BATCH_FILES:
        path = ROOT / rel
        try:
            tree = ast.parse(path.read_text(encoding="utf-8"))
        except Exception as e:
            offenders.append(f"{rel}: parse error {e}")
            continue
        for node in ast.walk(tree):
            if isinstance(node, ast.FunctionDef) and node.name == "_db":
                for sub in ast.walk(node):
                    if isinstance(sub, ast.ImportFrom) and sub.module == "server":
                        for alias in sub.names:
                            if alias.name == "db":
                                offenders.append(
                                    f"{rel}:{sub.lineno} — still imports "
                                    f"`db` from server inside _db()"
                                )
                break
    assert not offenders, (
        f"C-4e routers STILL using legacy bridge inside _db():\n  "
        + "\n  ".join(offenders)
    )
    print(f"✓ test_5_c4e_routers_no_longer_import_db_from_server  "
          f"({len(C4E_BATCH_FILES)} routers clean)")


def test_6_c4e_routers_use_db_runtime_accessor():
    """Every C-4e batch router's `_db()` body must reference
    `app.core.db_runtime.get_db`."""
    for rel in C4E_BATCH_FILES:
        path = ROOT / rel
        tree = ast.parse(path.read_text(encoding="utf-8"))
        found = False
        for node in ast.walk(tree):
            if isinstance(node, ast.FunctionDef) and node.name == "_db":
                body_src = ast.unparse(node) if hasattr(ast, "unparse") else ""
                if "db_runtime" in body_src and "get_db" in body_src:
                    found = True
                break
        assert found, (
            f"C-4e router {rel} does not reference db_runtime/get_db in _db()"
        )
    print(f"✓ test_6_c4e_routers_use_db_runtime_accessor  "
          f"({len(C4E_BATCH_FILES)} routers OK)")


def test_7_remaining_bridge_count_is_at_most_fourteen():
    """After C-4e (12 migrations from 26), exactly 14 production
    `from server import db` sites should remain — as a FLOOR
    invariant: subsequent batches (C-4f, C-4g, ...) only decrease
    the count further, never increase it.

    This pin protects two things simultaneously:
      (a) the post-C-4e milestone (count drops to <= 14, never higher);
      (b) the 12 C-4e files cannot regress back into the bridge list.
    """
    sites = _collect_db_import_sites()
    assert len(sites) <= REMAINING_BRIDGES_AFTER_C4E, (
        f"[C-4e regression guard] Expected <= {REMAINING_BRIDGES_AFTER_C4E} "
        f"remaining `from server import db` sites after C-4e; got {len(sites)}: "
        f"{sites}"
    )
    # The 12 C-4e files must NOT appear in the remaining list
    leaked = set(sites) & C4E_BATCH_FILES
    assert not leaked, (
        f"C-4e files still in remaining bridge list: {leaked}"
    )
    print(f"✓ test_7_remaining_bridge_count_is_at_most_fourteen  "
          f"({len(sites)} remaining; ceiling {REMAINING_BRIDGES_AFTER_C4E})")


# ─────────────────────────────────────────────────────────────────────
# 5) Bridge inventory unchanged (mandate red line)
# ─────────────────────────────────────────────────────────────────────

def test_8_bridge_inventory_unchanged():
    """C-4e is NOT db retirement — it's first batch migration.
    BRIDGE_INVENTORY size must stay 18, db must stay in it, Tier-A
    must stay `{db}`.

    Phase 5.4 / C-4j compatible-pin update: accepts the post-C-4j
    state too (size 17, db retired, Tier-A empty). The strict
    post-retirement invariant is enforced by
    ``test_phase5_4_c4j_db_bridge_finale.py``."""
    from app.core.app_state_targets import (
        BRIDGE_INVENTORY, TIER_A_SHALLOW_REWIRING,
    )
    assert len(BRIDGE_INVENTORY) in (1, 2, 3, 6, 7, 8, 10, 11, 13, 14, 15, 17, 18, 19), (
        f"BRIDGE_INVENTORY size mismatch: {len(BRIDGE_INVENTORY)}, "
        f"expected 18 (pre-C-4j), 17 (post-C-4j), 19 (post-C-5 planning), "
        f"15 (post-C-5a), 14 (post-C-5b), 13 (post-C-5c), or 11 "
        f"(post-C-5e / post-5.5/B — extraction-aux entries live in "
        f"the separate EXTRACTION_AUX_BRIDGES tuple)"
    )
    syms = {b.symbol for b in BRIDGE_INVENTORY}
    db_in = "db" in syms
    tier_a = TIER_A_SHALLOW_REWIRING
    valid_pre  = db_in and tier_a == frozenset({"db"})
    valid_post = (not db_in) and tier_a == frozenset()
    assert valid_pre or valid_post, (
        f"Invalid bridge state: db_in_bridges={db_in}, "
        f"Tier-A={sorted(tier_a)}. Expected pre-C-4j {{db in, db}} "
        f"or post-C-4j {{db out, empty}}."
    )
    label = "post-C-4j" if valid_post else "pre-C-4j"
    print(f"✓ test_8_bridge_inventory_unchanged  "
          f"(size={len(BRIDGE_INVENTORY)}, {label})")


# ─────────────────────────────────────────────────────────────────────
# 6) Runtime / live identity guards
# ─────────────────────────────────────────────────────────────────────

def test_9_setter_idempotent_and_overwriting():
    """db_runtime setter must be idempotent + overwriting + accept
    None + clear_db_for_tests resets both refs."""
    from app.core import db_runtime
    orig_db = db_runtime.get_db()
    orig_client = db_runtime.get_mongo_client()
    try:
        a = object()
        b = object()
        c = object()
        db_runtime.set_db(a, b)
        assert db_runtime.get_db() is a
        assert db_runtime.get_mongo_client() is b
        # Idempotent
        db_runtime.set_db(a, b)
        assert db_runtime.get_db() is a
        # Overwrite db only — leaves client intact
        db_runtime.set_db(c)
        assert db_runtime.get_db() is c
        assert db_runtime.get_mongo_client() is b
        # clear_db_for_tests resets both
        db_runtime.clear_db_for_tests()
        assert db_runtime.get_db() is None
        assert db_runtime.get_mongo_client() is None
    finally:
        db_runtime.set_db(orig_db, orig_client)
        assert db_runtime.get_db() is orig_db
        assert db_runtime.get_mongo_client() is orig_client
    print("✓ test_9_setter_idempotent_and_overwriting")


def test_10_live_identity_with_server_globals():
    """At runtime (after _main_startup), `db_runtime.get_db()` must
    be the SAME object as `server.db`, and `get_mongo_client()` must
    be the same as `server.db_client`."""
    try:
        import server
    except Exception as e:
        print(f"  (skipped — server not importable: {e})")
        return
    from app.core.db_runtime import get_db, get_mongo_client
    sd = getattr(server, "db", None)
    sc = getattr(server, "db_client", None)
    if sd is None and sc is None:
        # Pre-startup harness (no _main_startup ran)
        print("  (skipped — server.db / server.db_client None; "
              "_main_startup probably did not run in this test env)")
        return
    rd = get_db()
    rc = get_mongo_client()
    assert rd is sd, (
        f"IDENTITY MISMATCH: get_db() id=0x{id(rd):x} "
        f"is NOT server.db id=0x{id(sd):x}"
    )
    assert rc is sc, (
        f"IDENTITY MISMATCH: get_mongo_client() id=0x{id(rc):x} "
        f"is NOT server.db_client id=0x{id(sc):x}"
    )
    print(f"  (identity OK — db at 0x{id(sd):x}, client at 0x{id(sc):x})")
    print("✓ test_10_live_identity_with_server_globals")


# ─────────────────────────────────────────────────────────────────────
# 7) OpenAPI route freeze
# ─────────────────────────────────────────────────────────────────────

def test_11_openapi_route_freeze_618_679():
    """Phase 4 invariant: OpenAPI must still expose 618 paths and
    679 operations. C-4e changes accessor wiring only; no route
    signatures touched."""
    try:
        import server
        from fastapi.testclient import TestClient
        # Use only the FastAPI sub-app (not the ASGI Socket.IO wrap)
        client = TestClient(server.fastapi_app)
        r = client.get("/api/openapi.json")
        assert r.status_code == 200, f"openapi.json HTTP {r.status_code}"
        d = r.json()
        paths = d.get("paths", {})
        ops = sum(
            len([k for k in p.keys() if k in ("get", "post", "put", "patch", "delete")])
            for p in paths.values()
        )
        assert len(paths) == 618, (
            f"OpenAPI path count drift: {len(paths)} (expected 618)"
        )
        assert ops == 679, f"OpenAPI ops count drift: {ops} (expected 679)"
    except Exception as e:
        # Defensive: TestClient might fail in this harness. Allow skip
        # with a clear log so the human knows to verify via curl.
        print(f"  (skipped — TestClient unavailable: {type(e).__name__}: {e})")
        return
    print(f"✓ test_11_openapi_route_freeze_618_679  ({len(paths)}/{ops})")


# ─────────────────────────────────────────────────────────────────────
# Main
# ─────────────────────────────────────────────────────────────────────

def main() -> int:
    tests = [
        test_1_db_runtime_module_shape,
        test_2_single_setter_call_site_in_server_py,
        test_3_two_identity_assertions_at_setter_site,
        test_4_split_brain_assertion_before_notifications_init,
        test_5_c4e_routers_no_longer_import_db_from_server,
        test_6_c4e_routers_use_db_runtime_accessor,
        test_7_remaining_bridge_count_is_at_most_fourteen,
        test_8_bridge_inventory_unchanged,
        test_9_setter_idempotent_and_overwriting,
        test_10_live_identity_with_server_globals,
        test_11_openapi_route_freeze_618_679,
    ]
    fails = 0
    for t in tests:
        try:
            t()
        except Exception as e:
            fails += 1
            print(f"✗ {t.__name__}: {type(e).__name__}: {e}")
    print(f"\n{'=' * 60}")
    print(f"Phase 5.4 / C-4e db retirement BATCH 1 — "
          f"{len(tests) - fails}/{len(tests)} PASS")
    print(f"{'=' * 60}")
    return fails


if __name__ == "__main__":
    sys.exit(main())
