"""
Phase 5.4 / C-5c — Audit runtime accessor extraction.
======================================================

C-5c is **execution** — the ``audit`` Bridge entry has been retired
by routing all live ``from server import audit`` readers through
the dedicated ``app.core.audit_runtime`` accessor module (mirror of
C-4c ``sio`` — async side-effect callable shape).

This suite asserts (13 invariants — required by the C-5c mandate):

  1. AST: no PRODUCTION ``from server import audit``.
  2. Exact consumer set migrated (admin_identity, admin_ext_clients,
     identity_runtime — and only those).
  3. Identity invariant — ``get_audit() is server.audit`` post-load.
  4. Setter is a single production call (server.py module-load) —
     idempotent on repeated invocation with the same callable.
  5. ``clear_audit_for_tests()`` pre-load semantics — reverts to
     ``None``; setter rebinds; identity restored in try/finally.
  6. No module-level cached audit callable in consumers
     (every helper reads fresh via ``get_audit()`` at call time).
  7. All migrated call-sites still ``await audit(...)`` (async
     contract preserved).
  8. Representative schema call preserves args/order/meta/request —
     the 8-field write doc shape is byte-for-byte the same.
  9. Bridge inventory delta landed: BRIDGE_INVENTORY 14 → 13.
 10. TIER_B inventory delta: TIER_B_INVENTORY 4 → 3,
     TIER_B_MOVE_AND_REROUTE 2 → 1.
 11. ``C5C_RETIRED_SYMBOLS == ("audit",)``.
 12. OpenAPI 618/679 unchanged (no route surface touched).
 13. Workers 7/7 still register (no startup ordering regression).

Run:
    cd /app/backend && python tests/test_phase5_4_c5c_audit_runtime.py
"""
from __future__ import annotations

import ast
import asyncio
import inspect
import os
import re
import sys
from collections import defaultdict
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")
os.environ.setdefault("DB_NAME", "test_database")


SKIP_DIRS = {"__pycache__"}
EXPECTED_BRIDGE_COUNT_POST_C5C = {1, 2, 3, 6, 7, 8, 10, 11, 13}              # 13 fresh post-C-5c, 11 post-C-5e, 10 post-5.5/C, 8 post-5.5/D, 7 post-5.5/E, 6 post-5.5/F2, 3 post-5.5/G, 2 post-5.5/H, 1 post-5.5/I
EXPECTED_TIER_B_INVENTORY_POST_C5C = {1, 3}            # 3 fresh post-C-5c, 1 post-C-5e
EXPECTED_TIER_B_MOVE_AND_REROUTE_POST_C5C = 1
EXPECTED_OPENAPI_PATHS = 618
EXPECTED_OPENAPI_OPS = 679

# Production consumer set (mandate §Consumers). Mandate explicitly
# names three. The exact migration target is `from app.core.audit_runtime
# import get_audit`.
EXPECTED_MIGRATED_CONSUMERS = {
    "app/routers/admin_identity.py",
    "app/routers/admin_ext_clients.py",
    "app/services/identity_runtime.py",
}


def _classify(rel_path: str) -> str:
    if rel_path.startswith("tests/") or "/tests/" in rel_path:
        return "test_suite"
    if rel_path.startswith("test_") and "/" not in rel_path:
        return "legacy_root_test"
    return "production"


def _ast_grep_from_server() -> dict:
    """Return ``{symbol: [(file, line, classification), …]}`` for
    every ``from server import …`` site."""
    sites = defaultdict(list)
    for py in ROOT.rglob("*.py"):
        if any(s in SKIP_DIRS for s in py.parts):
            continue
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


def _ast_grep_from_audit_runtime() -> list:
    """Return list of (rel_file, lineno, imported_names) for every
    ``from app.core.audit_runtime import …`` site."""
    out = []
    for py in ROOT.rglob("*.py"):
        if any(s in SKIP_DIRS for s in py.parts):
            continue
        rel = str(py.relative_to(ROOT))
        try:
            text = py.read_text(encoding="utf-8")
            tree = ast.parse(text)
        except Exception:
            continue
        for node in ast.walk(tree):
            if (
                isinstance(node, ast.ImportFrom)
                and node.module == "app.core.audit_runtime"
            ):
                out.append((rel, node.lineno, tuple(a.name for a in node.names)))
    return out


# ─────────────────────────────────────────────────────────────────────
# 1) No production `from server import audit`
# ─────────────────────────────────────────────────────────────────────

def test_1_no_production_audit_import():
    sites = _ast_grep_from_server()
    prod_sites = [
        f"{f}:{l}" for (f, l, cls) in sites.get("audit", [])
        if cls == "production"
    ]
    assert not prod_sites, (
        f"[C-5c] FAIL: production `from server import audit` "
        f"still present at: {prod_sites}"
    )
    print(f"✓ test_1_no_production_audit_import  "
          f"(0 production sites; total sites = "
          f"{len(sites.get('audit', []))})")


# ─────────────────────────────────────────────────────────────────────
# 2) Exact consumer set migrated
# ─────────────────────────────────────────────────────────────────────

def test_2_exact_consumer_set_migrated():
    """Mandate names three production consumers. Verify by AST-grep
    that those files (and ONLY those production files) import
    `get_audit` from app.core.audit_runtime."""
    sites = _ast_grep_from_audit_runtime()
    production_get_audit_files = {
        rel for (rel, lineno, names) in sites
        if "get_audit" in names and _classify(rel) == "production"
    }
    # Drop the publisher itself (server.py imports set_audit, not
    # get_audit; the server.py post-bind block uses get_audit only
    # transiently — but the AST shows both names in the
    # `from app.core.audit_runtime import (...)` block, so we must
    # exclude server.py here since it is the OWNER, not a consumer.)
    production_get_audit_files.discard("server.py")
    missing = EXPECTED_MIGRATED_CONSUMERS - production_get_audit_files
    unexpected = production_get_audit_files - EXPECTED_MIGRATED_CONSUMERS
    assert not missing, (
        f"[C-5c] FAIL: expected consumers missing get_audit import: "
        f"{sorted(missing)}"
    )
    assert not unexpected, (
        f"[C-5c] FAIL: unexpected consumers importing get_audit "
        f"(scope drift): {sorted(unexpected)}"
    )
    print(f"✓ test_2_exact_consumer_set_migrated  "
          f"({sorted(production_get_audit_files)})")


# ─────────────────────────────────────────────────────────────────────
# 3) Identity invariant — get_audit() is server.audit
# ─────────────────────────────────────────────────────────────────────

def test_3_identity_invariant_post_module_load():
    import server
    from app.core.audit_runtime import get_audit
    live = get_audit()
    assert live is not None, (
        "[C-5c] FAIL: get_audit() is None post-import — "
        "the module-load setter call in server.py was skipped"
    )
    assert live is server.audit, (
        f"[C-5c] FAIL: identity split-brain — "
        f"get_audit() = {id(live)}, "
        f"server.audit = {id(server.audit)}"
    )
    print(f"✓ test_3_identity_invariant_post_module_load  "
          f"(get_audit() is server.audit @ {id(live):#x})")


# ─────────────────────────────────────────────────────────────────────
# 4) Setter is a single production call + idempotent
# ─────────────────────────────────────────────────────────────────────

def test_4_setter_single_production_call_and_idempotent():
    """The mandate says: `set_audit` must be called exactly once in
    production. Verify by AST-grep that exactly one call site exists
    in server.py and zero call sites in non-test production code.
    Then verify idempotency at runtime."""
    set_audit_call_sites = []
    for py in ROOT.rglob("*.py"):
        if any(s in SKIP_DIRS for s in py.parts):
            continue
        rel = str(py.relative_to(ROOT))
        if _classify(rel) != "production":
            continue
        # Skip the accessor module itself (which DEFINES set_audit).
        if rel == "app/core/audit_runtime.py":
            continue
        try:
            text = py.read_text(encoding="utf-8")
            tree = ast.parse(text)
        except Exception:
            continue
        for node in ast.walk(tree):
            if isinstance(node, ast.Call):
                fn = node.func
                # `set_audit(x)`
                if isinstance(fn, ast.Name) and fn.id == "set_audit":
                    set_audit_call_sites.append((rel, node.lineno))
                # `set_audit as _c5c_set_audit` → call via _c5c_set_audit(...)
                if isinstance(fn, ast.Name) and fn.id == "_c5c_set_audit":
                    set_audit_call_sites.append((rel, node.lineno))
                # qualified: `audit_runtime.set_audit(x)` (defensive)
                if (
                    isinstance(fn, ast.Attribute)
                    and fn.attr == "set_audit"
                ):
                    set_audit_call_sites.append((rel, node.lineno))
    # Mandate: exactly one production call site, and it MUST be in server.py
    prod_set_audit = [(f, l) for (f, l) in set_audit_call_sites
                      if f == "server.py"]
    other_prod = [(f, l) for (f, l) in set_audit_call_sites
                   if f != "server.py"]
    assert len(prod_set_audit) == 1, (
        f"[C-5c] FAIL: expected exactly 1 production set_audit call "
        f"in server.py, got {len(prod_set_audit)}: {prod_set_audit}"
    )
    assert not other_prod, (
        f"[C-5c] FAIL: unexpected set_audit production call sites "
        f"outside server.py: {other_prod}"
    )
    # Runtime: idempotency
    import server
    from app.core.audit_runtime import set_audit, get_audit
    original = get_audit()
    assert original is server.audit
    set_audit(original)
    set_audit(original)
    assert get_audit() is original, (
        "[C-5c] FAIL: setter idempotency drift"
    )
    print(f"✓ test_4_setter_single_production_call_and_idempotent  "
          f"(1 prod call @ {prod_set_audit[0]}; idempotent)")


# ─────────────────────────────────────────────────────────────────────
# 5) clear_audit_for_tests pre-load semantics
# ─────────────────────────────────────────────────────────────────────

def test_5_clear_audit_for_tests_pre_load_semantics():
    from app.core.audit_runtime import (
        set_audit, get_audit, clear_audit_for_tests,
    )
    original = get_audit()
    assert original is not None
    try:
        clear_audit_for_tests()
        assert get_audit() is None, (
            "[C-5c] FAIL: clear_audit_for_tests() did not revert "
            "the cached reference to None"
        )
        # Rebind a sentinel coroutine and verify
        async def _sentinel(*args, **kwargs):
            return None
        set_audit(_sentinel)
        assert get_audit() is _sentinel
    finally:
        # ALWAYS restore — every other test assumes the canonical
        # callable is published.
        set_audit(original)
    assert get_audit() is original, (
        "[C-5c] FAIL: post-restore identity drift"
    )
    print("✓ test_5_clear_audit_for_tests_pre_load_semantics  "
          "(clear→None, set→sentinel, restore→canonical)")


# ─────────────────────────────────────────────────────────────────────
# 6) No module-level cached audit callable in consumers
# ─────────────────────────────────────────────────────────────────────

def test_6_no_module_level_audit_cache_in_consumers():
    """Mandate §Consumers: `do not cache audit at module load`.
    AST-walk each consumer file and verify there's no
    module-scope assignment of `audit = get_audit()` or similar.
    Reads MUST go through a helper (`_audit()` /
    `_audit_callable()`) that calls `get_audit()` per-invocation."""
    failures = []
    for consumer_rel in sorted(EXPECTED_MIGRATED_CONSUMERS):
        src_path = ROOT / consumer_rel
        text = src_path.read_text(encoding="utf-8")
        tree = ast.parse(text)
        for node in tree.body:  # only top-level (module-scope) nodes
            if isinstance(node, ast.Assign):
                # Check RHS is a `get_audit()` call
                if (
                    isinstance(node.value, ast.Call)
                    and isinstance(node.value.func, ast.Name)
                    and node.value.func.id == "get_audit"
                ):
                    failures.append(
                        f"{consumer_rel}:{node.lineno} — module-scope "
                        f"`= get_audit()` cache"
                    )
                # Or aliasing the function itself at module scope:
                # `audit = get_audit` (without parens — still a cache)
                if (
                    isinstance(node.value, ast.Name)
                    and node.value.id == "get_audit"
                ):
                    for tgt in node.targets:
                        if isinstance(tgt, ast.Name) and tgt.id == "audit":
                            failures.append(
                                f"{consumer_rel}:{node.lineno} — module-scope "
                                f"`audit = get_audit` alias"
                            )
    assert not failures, (
        f"[C-5c] FAIL: module-level cached audit references "
        f"discovered: {failures}"
    )
    print("✓ test_6_no_module_level_audit_cache_in_consumers  "
          "(all reads go through per-call helpers)")


# ─────────────────────────────────────────────────────────────────────
# 7) All migrated call-sites still `await audit(...)`
# ─────────────────────────────────────────────────────────────────────

def test_7_all_call_sites_still_await_audit():
    """Mandate §Critical preservation: `async/await behaviour` must
    be unchanged. AST-walk each consumer and verify every invocation
    of the audit callable is either:
      (a) wrapped in an `await` expression, OR
      (b) the body of a `lambda` (the lambda's caller awaits the
          returned coroutine — preserves original pre-C-5c shape
          where the lambda was already wrapping bare ``audit(...)``).
    Both shapes preserve async/await semantics 1:1."""
    failures = []
    helper_names = {"_audit", "_audit_callable"}
    for consumer_rel in sorted(EXPECTED_MIGRATED_CONSUMERS):
        src_path = ROOT / consumer_rel
        text = src_path.read_text(encoding="utf-8")
        tree = ast.parse(text)
        # Pass 1: collect names bound from a helper call:
        #     audit = _audit()       or
        #     audit_fn = _audit_callable()
        # Both module-scope AND function-scope assignments are
        # collected (test_6 already enforces no module-scope cache
        # of get_audit; the helper indirection is allowed and
        # required by the mandate).
        bound_audit_names: set[str] = set()
        for node in ast.walk(tree):
            if (
                isinstance(node, ast.Assign)
                and isinstance(node.value, ast.Call)
                and isinstance(node.value.func, ast.Name)
                and node.value.func.id in helper_names
            ):
                for tgt in node.targets:
                    if isinstance(tgt, ast.Name):
                        bound_audit_names.add(tgt.id)
        # Pass 2: build parent map AND lambda-ancestor set so we
        # can determine whether an audit invocation is forwarded
        # through a lambda body (shape (b) above).
        parent_of: dict[int, ast.AST] = {}
        for node in ast.walk(tree):
            for child in ast.iter_child_nodes(node):
                parent_of[id(child)] = node

        def _is_inside_lambda(call_node: ast.Call) -> bool:
            cur = parent_of.get(id(call_node))
            # Walk up; if we hit a Lambda before hitting a function-def
            # boundary, the call is inside the lambda body.
            while cur is not None:
                if isinstance(cur, ast.Lambda):
                    return True
                if isinstance(cur, (ast.FunctionDef, ast.AsyncFunctionDef)):
                    return False
                cur = parent_of.get(id(cur))
            return False

        for parent in ast.walk(tree):
            for child in ast.iter_child_nodes(parent):
                if isinstance(child, ast.Call):
                    is_audit_invocation = False
                    fn = child.func
                    # case (a): `_audit()(...)`
                    if (
                        isinstance(fn, ast.Call)
                        and isinstance(fn.func, ast.Name)
                        and fn.func.id in helper_names
                    ):
                        is_audit_invocation = True
                    # case (b): bound name from pass 1
                    if (
                        isinstance(fn, ast.Name)
                        and fn.id in bound_audit_names
                    ):
                        is_audit_invocation = True
                    if is_audit_invocation:
                        in_await = isinstance(parent, ast.Await)
                        in_lambda = _is_inside_lambda(child)
                        if not (in_await or in_lambda):
                            failures.append(
                                f"{consumer_rel}:{child.lineno} — "
                                f"audit invocation neither awaited "
                                f"nor inside a lambda body"
                            )
    assert not failures, (
        f"[C-5c] FAIL: unawaited audit invocations: {failures}"
    )
    print("✓ test_7_all_call_sites_still_await_audit  "
          "(every audit call awaited OR forwarded via lambda body)")


# ─────────────────────────────────────────────────────────────────────
# 8) Representative schema call preserves args/order/meta/request
# ─────────────────────────────────────────────────────────────────────

def test_8_representative_schema_call_preserves_shape():
    """Mandate §Critical preservation: 8-field schema is load-bearing
    (H-5). Call the canonical audit callable end-to-end with a
    sentinel set of args; intercept the `SecurityAuditRepository(db).
    record_security_event(...)` write; verify the doc shape:
      keys == {ts, action, user_id, user_email, user_role, resource, meta, ip}
      values map 1:1 to the call arguments."""
    import server
    from app.core.audit_runtime import get_audit

    audit_fn = get_audit()
    assert audit_fn is server.audit

    captured: dict = {}

    class _FakeRequest:
        class _Client:
            host = "203.0.113.42"
        client = _Client()

    class _FakeRepo:
        def __init__(self, db):
            captured["db_arg"] = db
        async def record_security_event(self, doc):
            captured["doc"] = doc
            captured["doc_keys"] = sorted(doc.keys())

    # Patch the SecurityAuditRepository the audit body imports lazily.
    with patch("app.repositories.SecurityAuditRepository", _FakeRepo):
        # Use a fresh event loop — `asyncio.get_event_loop()` raises
        # "no current event loop" after other test modules call
        # `asyncio.run()` (which closes the implicit main-thread loop).
        # The 5.5/D customer-helpers golden suite uses `asyncio.run()`,
        # so this test must self-host an isolated loop.
        loop = asyncio.new_event_loop()
        try:
            loop.run_until_complete(
                audit_fn(
                    "c5c_smoke_action",
                    user={"id": "u-1", "email": "u@example.com", "role": "admin"},
                    resource="c5c_resource",
                    meta={"k": "v", "n": 42},
                    request=_FakeRequest(),
                )
            )
        finally:
            loop.close()

    # 8-field schema (H-5)
    assert captured.get("doc_keys") == [
        "action", "ip", "meta", "resource", "ts", "user_email",
        "user_id", "user_role",
    ], (
        f"[C-5c] FAIL: audit doc key set drifted from 8-field "
        f"schema. Got: {captured.get('doc_keys')}"
    )
    d = captured["doc"]
    assert d["action"] == "c5c_smoke_action"
    assert d["user_id"] == "u-1"
    assert d["user_email"] == "u@example.com"
    assert d["user_role"] == "admin"
    assert d["resource"] == "c5c_resource"
    assert d["meta"] == {"k": "v", "n": 42}
    assert d["ip"] == "203.0.113.42"
    # ts is an ISO-8601 UTC string
    assert isinstance(d["ts"], str) and "T" in d["ts"], (
        f"[C-5c] FAIL: audit ts not ISO-8601 string: {d['ts']!r}"
    )
    print("✓ test_8_representative_schema_call_preserves_shape  "
          "(8-field H-5 doc shape preserved 1:1)")


# ─────────────────────────────────────────────────────────────────────
# 9) BRIDGE_INVENTORY delta 14 → 13
# ─────────────────────────────────────────────────────────────────────

def test_9_bridge_inventory_delta_landed():
    from app.core.app_state_targets import BRIDGE_INVENTORY
    assert len(BRIDGE_INVENTORY) in EXPECTED_BRIDGE_COUNT_POST_C5C, (
        f"[C-5c] FAIL: BRIDGE_INVENTORY size = "
        f"{len(BRIDGE_INVENTORY)}, expected one of "
        f"{sorted(EXPECTED_BRIDGE_COUNT_POST_C5C)} "
        f"(13 fresh post-C-5c, 11 post-C-5e)."
    )
    bridge_syms = {b.symbol for b in BRIDGE_INVENTORY}
    assert "audit" not in bridge_syms, (
        "[C-5c] FAIL: retired symbol `audit` still in BRIDGE_INVENTORY"
    )
    print(f"✓ test_9_bridge_inventory_delta_landed  "
          f"(14→{len(BRIDGE_INVENTORY)})")


# ─────────────────────────────────────────────────────────────────────
# 10) TIER_B inventory + TIER_B_MOVE_AND_REROUTE shrunk
# ─────────────────────────────────────────────────────────────────────

def test_10_tier_b_surfaces_shrunk():
    from app.core.app_state_targets import (
        TIER_B_INVENTORY, TIER_B_MOVE_AND_REROUTE,
    )
    assert len(TIER_B_INVENTORY) in EXPECTED_TIER_B_INVENTORY_POST_C5C, (
        f"[C-5c] FAIL: TIER_B_INVENTORY size = "
        f"{len(TIER_B_INVENTORY)}, expected one of "
        f"{sorted(EXPECTED_TIER_B_INVENTORY_POST_C5C)} "
        f"(3 fresh post-C-5c, 1 post-C-5e)."
    )
    tier_b_syms = {t.symbol for t in TIER_B_INVENTORY}
    assert "audit" not in tier_b_syms, (
        "[C-5c] FAIL: retired `audit` still in TIER_B_INVENTORY"
    )
    assert len(TIER_B_MOVE_AND_REROUTE) == EXPECTED_TIER_B_MOVE_AND_REROUTE_POST_C5C, (
        f"[C-5c] FAIL: TIER_B_MOVE_AND_REROUTE size = "
        f"{len(TIER_B_MOVE_AND_REROUTE)}, expected "
        f"{EXPECTED_TIER_B_MOVE_AND_REROUTE_POST_C5C}."
    )
    assert TIER_B_MOVE_AND_REROUTE == frozenset({"_STATIC_DIR"}), (
        f"[C-5c] FAIL: TIER_B_MOVE_AND_REROUTE composition: "
        f"got {sorted(TIER_B_MOVE_AND_REROUTE)}, "
        f"expected {{'_STATIC_DIR'}}"
    )
    print(f"✓ test_10_tier_b_surfaces_shrunk  "
          f"(TIER_B_INVENTORY: 4→{len(TIER_B_INVENTORY)}; "
          f"TIER_B_MOVE_AND_REROUTE: {sorted(TIER_B_MOVE_AND_REROUTE)})")


# ─────────────────────────────────────────────────────────────────────
# 11) C5C_RETIRED_SYMBOLS constant
# ─────────────────────────────────────────────────────────────────────

def test_11_c5c_retired_symbols_constant():
    from app.core.app_state_targets import C5C_RETIRED_SYMBOLS
    assert C5C_RETIRED_SYMBOLS == ("audit",), (
        f"[C-5c] FAIL: C5C_RETIRED_SYMBOLS = "
        f"{C5C_RETIRED_SYMBOLS}, expected ('audit',)"
    )
    print(f"✓ test_11_c5c_retired_symbols_constant  "
          f"({C5C_RETIRED_SYMBOLS})")


# ─────────────────────────────────────────────────────────────────────
# 12) OpenAPI 618/679 unchanged
# ─────────────────────────────────────────────────────────────────────

def test_12_openapi_route_freeze():
    from fastapi.testclient import TestClient
    import server
    fastapi_app = getattr(server, "fastapi_app", None) or getattr(server, "app", None)
    assert fastapi_app is not None, "[C-5c] FAIL: cannot resolve FastAPI instance"
    client = TestClient(fastapi_app)
    r = client.get("/api/openapi.json")
    assert r.status_code == 200, f"[C-5c] FAIL: openapi HTTP {r.status_code}"
    data = r.json()
    paths = data.get("paths", {})
    n_paths = len(paths)
    n_ops = sum(
        len([k for k in v if k in ("get", "post", "put", "patch", "delete", "head", "options")])
        for v in paths.values()
    )
    assert n_paths == EXPECTED_OPENAPI_PATHS and n_ops == EXPECTED_OPENAPI_OPS, (
        f"[C-5c] FAIL: OpenAPI surface drifted. expected "
        f"{EXPECTED_OPENAPI_PATHS}/{EXPECTED_OPENAPI_OPS}, got "
        f"{n_paths}/{n_ops}"
    )
    print(f"✓ test_12_openapi_route_freeze  ({n_paths}/{n_ops})")


# ─────────────────────────────────────────────────────────────────────
# 13) Workers 7/7 still register + module-load identity assertion
# ─────────────────────────────────────────────────────────────────────

def test_13_workers_healthy_and_module_load_assertion_present():
    from fastapi.testclient import TestClient
    import server
    from app.core.worker_registry import worker_registry
    fastapi_app = getattr(server, "fastapi_app", None) or getattr(server, "app", None)
    assert fastapi_app is not None
    with TestClient(fastapi_app) as _client:
        names = sorted(worker_registry.names())
    assert len(names) == 7, (
        f"[C-5c] FAIL: worker count = {len(names)}, expected 7. "
        f"Registered: {names}"
    )
    expected = {
        "ops_guardian", "payment_reminder", "resolver_worker",
        "ringostat_cron", "tracking_worker", "transfer_detector",
        "watchlist_live_poll",
    }
    assert set(names) == expected, (
        f"[C-5c] FAIL: worker name set drift. "
        f"got {sorted(names)}, expected {sorted(expected)}"
    )
    # Regression guard against accidental deletion of the module-load
    # identity assertion (mirror of test_10 in C-5b suite).
    src = Path(server.__file__).read_text(encoding="utf-8")
    assert "_c5c_get_audit() is audit" in src, (
        "[C-5c] FAIL: module-load identity assertion missing "
        "from server.py"
    )
    print(f"✓ test_13_workers_healthy_and_module_load_assertion_present  "
          f"(7/7 workers; identity assertion present)")


# ─────────────────────────────────────────────────────────────────────
# Runner
# ─────────────────────────────────────────────────────────────────────

def _run_all():
    tests = [
        test_1_no_production_audit_import,
        test_2_exact_consumer_set_migrated,
        test_3_identity_invariant_post_module_load,
        test_4_setter_single_production_call_and_idempotent,
        test_5_clear_audit_for_tests_pre_load_semantics,
        test_6_no_module_level_audit_cache_in_consumers,
        test_7_all_call_sites_still_await_audit,
        test_8_representative_schema_call_preserves_shape,
        test_9_bridge_inventory_delta_landed,
        test_10_tier_b_surfaces_shrunk,
        test_11_c5c_retired_symbols_constant,
        test_12_openapi_route_freeze,
        test_13_workers_healthy_and_module_load_assertion_present,
    ]
    failed = 0
    for t in tests:
        try:
            t()
        except AssertionError as e:
            failed += 1
            print(f"✗ {t.__name__}\n   {e}")
        except Exception as e:
            failed += 1
            print(f"✗ {t.__name__}  UNEXPECTED ERROR\n   "
                  f"{type(e).__name__}: {e}")
    print()
    print("=" * 60)
    print(
        f"Phase 5.4 / C-5c audit runtime accessor extraction — "
        f"{len(tests) - failed}/{len(tests)} "
        f"{'PASS' if failed == 0 else 'FAIL'}"
    )
    print("=" * 60)
    return 0 if failed == 0 else 1


if __name__ == "__main__":
    sys.exit(_run_all())
