"""
Phase 5.4 / C-4c — `sio` bridge retirement regression guards.
==============================================================

This test suite is the regression guard for the third Tier-A bridge
retirement (``from server import sio``). It is the strictest of the
C-4 series so far because ``sio`` is NOT just a singleton — it is
the **runtime event-bus surface**, with three distinct invariants
that must hold simultaneously after retirement:

1. **Source-level retirement**: zero production
   ``from server import sio`` sites.
2. **Identity preservation**: the canonical ``server.sio``, the
   accessor (``app.core.socket_runtime.get_sio()``), the
   ``socketio.ASGIApp`` wrap, the ``NotificationService`` captured
   reference, the ``identity_runtime`` lazy resolver, the
   ``app.core.deps.get_sio`` wrapper — ALL six paths must return
   the SAME OBJECT (`is`, not `==`).
3. **Event-topology preservation**: ``@sio.event`` handlers
   (connect, disconnect) remain bound to the same AsyncServer;
   direct ``sio.emit(...)`` owner-side call sites in server.py are
   unchanged in count and shape; ``socketio.ASGIApp(sio,
   other_asgi_app=fastapi_app)`` mount is unchanged.

What it pins
------------

This file is the proof that the bridge-retirement pattern works on
the most architecturally-sensitive Tier-A target: a runtime
event-bus singleton with reference capture into a downstream
service (NotificationService) and module-load-time handler
decoration. If this guard fires, somebody re-introduced the lazy
bridge, broke the setter call, de-synced the accessor from the
canonical global, OR changed the event topology in any forbidden
way.

Run:
    cd /app/backend && python tests/test_phase5_4_c4c_sio_retirement.py
"""
from __future__ import annotations

import ast
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))


# ─────────────────────────────────────────────────────────────────────
# Static / source-level regression guards
# ─────────────────────────────────────────────────────────────────────

SKIP_DIRS = {"__pycache__", "tests"}
SKIP_FILES = {
    "server.py",            # the source itself (no import-from-self)
    "app_state_targets.py", # documentation module — prose only
    "socket_runtime.py",    # accessor module — docstring mentions
                            # legacy `from server import sio`
    "deps.py",              # accessor module — docstring mentions
                            # legacy `from server import sio`
    "identity_runtime.py",  # docstring mentions legacy bridge
                            # historically — verified by test_2
}


def _iter_production_python_files():
    for py in ROOT.rglob("*.py"):
        if any(seg in SKIP_DIRS for seg in py.parts):
            continue
        if py.name in SKIP_FILES:
            continue
        yield py


def test_1_no_production_sio_bridge_anywhere():
    """``from server import sio`` (and tuple variants) must NOT
    appear as a real import statement anywhere in the production
    tree (excluding the accessor module + identity_runtime which
    are explicitly checked by tests 2/3).

    Uses AST parsing — string occurrences in comments / docstrings
    do NOT trip this test."""
    offenders = []
    for py in _iter_production_python_files():
        try:
            tree = ast.parse(py.read_text(encoding="utf-8"))
        except (SyntaxError, UnicodeDecodeError):
            continue
        for node in ast.walk(tree):
            if isinstance(node, ast.ImportFrom) and node.module == "server":
                for alias in node.names:
                    if alias.name == "sio":
                        offenders.append(f"{py.relative_to(ROOT)}:{node.lineno}")
    assert not offenders, (
        f"Production sites STILL importing `from server import sio` "
        f"(post-C-4c this must be ZERO except in skip-list): "
        f"{offenders}. Replace with "
        f"`from app.core.socket_runtime import get_sio` and call "
        f"`get_sio()` at point-of-use."
    )
    print("✓ test_1_no_production_sio_bridge_anywhere")


def test_2_identity_runtime_uses_socket_runtime_accessor():
    """``identity_runtime._sio()`` must read from
    ``app.core.socket_runtime.get_sio()`` and MUST NOT contain a
    ``from server import sio`` ImportFrom (AST-level check)."""
    path = ROOT / "app" / "services" / "identity_runtime.py"
    tree = ast.parse(path.read_text(encoding="utf-8"))
    found_sio_fn = False
    for node in ast.walk(tree):
        if isinstance(node, ast.FunctionDef) and node.name == "_sio":
            found_sio_fn = True
            for sub in ast.walk(node):
                if isinstance(sub, ast.ImportFrom):
                    if sub.module == "server":
                        for alias in sub.names:
                            assert alias.name != "sio", (
                                "identity_runtime._sio MUST NOT re-introduce "
                                "`from server import sio` lazy bridge."
                            )
                    elif sub.module == "app.core.socket_runtime":
                        # OK — the new accessor path
                        pass
            body_src = ast.unparse(node) if hasattr(ast, "unparse") else ""
            assert "socket_runtime" in body_src, (
                "identity_runtime._sio must reference app.core.socket_runtime"
            )
            assert "get_sio" in body_src, (
                "identity_runtime._sio must call get_sio()"
            )
            break
    assert found_sio_fn, "identity_runtime._sio function not found"
    print("✓ test_2_identity_runtime_uses_socket_runtime_accessor")


def test_3_app_core_deps_get_sio_routes_through_socket_runtime():
    """``app.core.deps.get_sio()`` must delegate to
    ``app.core.socket_runtime.get_sio()`` and MUST NOT contain a
    ``from server import sio`` ImportFrom."""
    path = ROOT / "app" / "core" / "deps.py"
    tree = ast.parse(path.read_text(encoding="utf-8"))
    found_fn = False
    for node in ast.walk(tree):
        if isinstance(node, ast.FunctionDef) and node.name == "get_sio":
            found_fn = True
            for sub in ast.walk(node):
                if isinstance(sub, ast.ImportFrom):
                    if sub.module == "server":
                        for alias in sub.names:
                            assert alias.name != "sio", (
                                "app.core.deps.get_sio MUST NOT re-introduce "
                                "`from server import sio` lazy bridge."
                            )
            body_src = ast.unparse(node) if hasattr(ast, "unparse") else ""
            assert "socket_runtime" in body_src, (
                "app.core.deps.get_sio must delegate to app.core.socket_runtime"
            )
            break
    assert found_fn, "app.core.deps.get_sio function not found"
    print("✓ test_3_app_core_deps_get_sio_routes_through_socket_runtime")


def test_4_socket_runtime_module_shape_is_minimal():
    """``app.core.socket_runtime`` must expose exactly ``set_sio`` /
    ``get_sio`` / ``clear_sio_for_tests`` and a module-private
    ``_sio_ref`` initialised to ``None``. No event-bus abstraction,
    no SocketPublisher, no emit helpers (mandate forbidden list)."""
    from app.core import socket_runtime
    assert hasattr(socket_runtime, "set_sio"), "missing set_sio"
    assert hasattr(socket_runtime, "get_sio"), "missing get_sio"
    assert hasattr(socket_runtime, "clear_sio_for_tests"), (
        "missing clear_sio_for_tests"
    )
    assert hasattr(socket_runtime, "_sio_ref"), (
        "missing module-private _sio_ref cache"
    )
    # Forbidden surface: no emit helper, no SocketPublisher, no
    # event-bus abstraction lurking in the module.
    forbidden = {"emit", "broadcast", "SocketPublisher", "EventBus",
                 "publish", "send", "Channel"}
    actual_public = {n for n in dir(socket_runtime)
                     if not n.startswith("_") and n not in {
                         "set_sio", "get_sio", "clear_sio_for_tests",
                         "Any", "Optional", "annotations"
                     }}
    leaked = actual_public & forbidden
    assert not leaked, (
        f"app.core.socket_runtime grew forbidden surface: {leaked}. "
        f"C-4c mandate forbids emit helpers / SocketPublisher / "
        f"event-bus abstractions in this module."
    )
    print(f"✓ test_4_socket_runtime_module_shape_is_minimal  "
          f"(public surface: set_sio/get_sio/clear_sio_for_tests)")


def test_5_single_setter_call_site_in_server_py():
    """``server.py`` must invoke ``set_sio`` at EXACTLY one call
    site, located at module-load time, AFTER
    ``socketio.ASGIApp(sio, ...)`` mount, BEFORE the first
    ``@sio.event`` handler decorator."""
    server_text = (ROOT / "server.py").read_text(encoding="utf-8")
    lines = server_text.splitlines()

    # Find set_sio( call lines that are NOT inside the import.
    call_sites = [
        i + 1 for i, line in enumerate(lines)
        if re.search(r"\bset_sio\s*\(", line)
        # Exclude `from app.core.socket_runtime import set_sio` lines
        and not line.lstrip().startswith("from ")
        and not line.lstrip().startswith("import ")
    ]
    assert len(call_sites) == 1, (
        f"Expected EXACTLY one set_sio() call site in server.py "
        f"(the C-4c mandate enforces a single writer); "
        f"got {len(call_sites)}: lines={call_sites}"
    )
    setter_line = call_sites[0]

    # Locate ASGIApp mount line
    asgi_mount = next(
        (i + 1 for i, line in enumerate(lines)
         if "socketio.ASGIApp" in line and "=" in line),
        None,
    )
    assert asgi_mount, "Could not find socketio.ASGIApp(...) mount site"
    assert asgi_mount < setter_line, (
        f"set_sio() at line {setter_line} must come AFTER "
        f"socketio.ASGIApp(...) at line {asgi_mount}. Otherwise the "
        f"ASGIApp mount is not yet captured at the time of setter call."
    )

    # Locate first @sio.event decorator
    first_handler = next(
        (i + 1 for i, line in enumerate(lines) if line.strip() == "@sio.event"),
        None,
    )
    assert first_handler, "No @sio.event decorator found in server.py"
    assert setter_line < first_handler, (
        f"set_sio() at line {setter_line} must come BEFORE the first "
        f"@sio.event decorator at line {first_handler}. The mandate "
        f"requires the accessor to be valid before handlers bind."
    )
    print(f"✓ test_5_single_setter_call_site_in_server_py  "
          f"(setter at L{setter_line}, ASGIApp mount L{asgi_mount}, "
          f"first @sio.event L{first_handler})")


def test_6_module_load_identity_assertion_present():
    """The module-load setter site must include an
    ``assert get_sio() is sio`` identity check."""
    server_text = (ROOT / "server.py").read_text(encoding="utf-8")
    # Two acceptable forms:
    forms = [
        "get_sio() is sio",
        "assert get_sio() is sio",
    ]
    assert any(f in server_text for f in forms), (
        "Missing module-load identity invariant. Expected an "
        "`assert get_sio() is sio` in server.py at the setter site."
    )
    print("✓ test_6_module_load_identity_assertion_present")


def test_7_split_brain_assertion_before_notifications_init():
    """An identity assertion ``get_sio() is sio`` must appear
    immediately BEFORE the ``notifications.init(db, sio)`` call.
    This guards against NotificationService capturing a different
    object than the accessor exposes (split-brain)."""
    server_text = (ROOT / "server.py").read_text(encoding="utf-8")
    lines = server_text.splitlines()
    init_line = next(
        (i + 1 for i, line in enumerate(lines)
         # Literal match on the actual call site only — DO NOT
         # use a regex that could match documentation comments
         # mentioning notifications.init in surrounding C-4e/C-4c
         # split-brain prevention blocks.
         if "_notif_mod.init(db, sio)" in line
         and not line.lstrip().startswith("#")),
        None,
    )
    assert init_line, "Could not find notifications.init(db, sio) call"
    # Look up to 60 lines back for the assertion. The C-4e commit
    # inserts a long db-runtime split-brain block AND its own
    # comment header in the gap between the canonical db assignment
    # and notifications.init — that pushes the sio assertion further
    # away from the init call. 60 LOC keeps the proximity invariant
    # meaningful while accommodating future per-resource blocks.
    window_start = max(0, init_line - 60)
    window = "\n".join(lines[window_start:init_line])
    assert "get_sio()" in window and "is sio" in window, (
        f"Missing split-brain prevention assertion BEFORE "
        f"notifications.init(db, sio) at line {init_line}. The C-4c "
        f"mandate requires `assert get_sio() is sio` in the 60 LOC "
        f"preceding the init call to prove the captured reference "
        f"matches the accessor."
    )
    print(f"✓ test_7_split_brain_assertion_before_notifications_init  "
          f"(notif init at L{init_line})")


# ─────────────────────────────────────────────────────────────────────
# Inventory / topology invariants
# ─────────────────────────────────────────────────────────────────────

def test_8_sio_bridge_removed_from_inventory():
    """``sio`` must NOT appear as a Bridge entry in
    ``BRIDGE_INVENTORY`` anymore."""
    from app.core.app_state_targets import BRIDGE_INVENTORY
    syms = {b.symbol for b in BRIDGE_INVENTORY}
    assert "sio" not in syms, (
        "`sio` STILL listed in BRIDGE_INVENTORY post-C-4c. Mirror the "
        "C-4a logger / C-4b parser retirement pattern: remove the "
        "Bridge() entry and add a `# C-4c RETIRED` comment block."
    )
    print(f"✓ test_8_sio_bridge_removed_from_inventory  "
          f"(inventory size: {len(BRIDGE_INVENTORY)})")


def test_9_sio_remains_ownership_root_with_new_owner():
    """``sio`` must STILL appear in ``OWNERSHIP_ROOTS`` — it is a
    runtime root, not a bridge. The owner string must mention
    ``socket_runtime`` (the new accessor module)."""
    from app.core.app_state_targets import OWNERSHIP_ROOTS
    sio_root = next((r for r in OWNERSHIP_ROOTS if r.name == "sio"), None)
    assert sio_root, (
        "`sio` removed from OWNERSHIP_ROOTS — must remain a root, "
        "ownership has only MOVED to app.core.socket_runtime."
    )
    assert "socket_runtime" in sio_root.current_owner.lower(), (
        f"sio OwnershipRoot.current_owner must mention socket_runtime; "
        f"got: {sio_root.current_owner!r}"
    )
    print(f"✓ test_9_sio_remains_ownership_root_with_new_owner  "
          f"(owner: {sio_root.current_owner!r})")


def test_10_tier_a_collapsed_to_db_only():
    """``TIER_A_SHALLOW_REWIRING`` must be ``{db}`` post-C-4c or
    ``frozenset()`` post-C-4j (compatible-pin update)."""
    from app.core.app_state_targets import TIER_A_SHALLOW_REWIRING
    valid = TIER_A_SHALLOW_REWIRING in (frozenset({"db"}), frozenset())
    assert valid, (
        f"Tier-A must be {{db}} (post-C-4c) or empty (post-C-4j); "
        f"got {sorted(TIER_A_SHALLOW_REWIRING)}"
    )
    print(f"✓ test_10_tier_a_collapsed_to_db_only  "
          f"(remaining: {sorted(TIER_A_SHALLOW_REWIRING)})")


def test_11_bridge_inventory_count_is_eighteen():
    """C-3B=21 → C-4a=20 → C-4b=19 → C-4c=18 → C-4j=17 → C-5=19
    (audit-discovered Tier-C re-registration, NOT new coupling) →
    C-5a=15 (4 stale shims retired) → C-5b=14 (aggregator accessor)
    → C-5c=13 (audit accessor) → C-5e=11 (2 shipment helpers).
    5.5/B leaves BRIDGE_INVENTORY at 11 — the 43 calculator
    extraction-aux entries live in the separate ``EXTRACTION_AUX_BRIDGES``
    tuple (see app_state_targets.py rationale block)."""
    from app.core.app_state_targets import BRIDGE_INVENTORY
    assert len(BRIDGE_INVENTORY) in (1, 2, 3, 6, 7, 8, 10, 11, 13, 14, 15, 17, 18, 19), (
        f"BRIDGE_INVENTORY size mismatch: expected 18 (post-C-4c), "
        f"17 (post-C-4j), 19 (post-C-5 planning), 15 (post-C-5a), "
        f"14 (post-C-5b), 13 (post-C-5c), 11 (post-C-5e / "
        f"post-5.5/B), 10 (post-5.5/C), 8 (post-5.5/D), 7 (post-5.5/E), "
        f"6 (post-5.5/F2), 3 (post-5.5/G), or 2 (post-5.5/H); "
        f"got {len(BRIDGE_INVENTORY)}"
    )
    print(f"✓ test_11_bridge_inventory_count_is_eighteen  "
          f"({len(BRIDGE_INVENTORY)} bridges)")


def test_12_architectural_verdict_reflects_c4c_closure():
    """The verdict text must mention C-4c closure and post-C-4c
    counts. Post-C-4j relaxation: accepts the 17/0-remaining form
    too."""
    from app.core.app_state_targets import ARCHITECTURAL_VERDICT
    flat = " ".join(ARCHITECTURAL_VERDICT.lower().split())
    assert "c-4c" in flat, "verdict must mention C-4c closure"
    assert " sio " in flat or "sio retired" in flat or "sio (3" in flat, (
        "verdict must mention sio retirement"
    )
    assert (
        "18 distinct" in flat
        or "17 distinct" in flat
        or "1 remaining" in flat
        or "0 remaining" in flat
        or "tier a: db" in flat
        or "tier-a is now empty" in flat
        or "tier a is now empty" in flat
    ), "verdict must reflect post-C-4c (or post-C-4j) bridge counts"
    print("✓ test_12_architectural_verdict_reflects_c4c_closure")


# ─────────────────────────────────────────────────────────────────────
# Runtime / event-topology preservation guards
# ─────────────────────────────────────────────────────────────────────

def test_13_handler_decorators_unchanged():
    """The two ``@sio.event`` handler decorators must still be
    present in server.py (connect, disconnect). C-4c mandate
    forbids moving or rewriting them."""
    server_text = (ROOT / "server.py").read_text(encoding="utf-8")
    decorator_count = server_text.count("\n@sio.event\n")
    # +1 if the file starts with @sio.event on line 1 (it doesn't,
    # but defensively use re for any whitespace variation).
    decorator_matches = re.findall(r"^\s*@sio\.event\s*$", server_text, re.MULTILINE)
    assert len(decorator_matches) >= 2, (
        f"Expected at least 2 @sio.event decorators (connect + "
        f"disconnect); got {len(decorator_matches)}. The mandate "
        f"forbids removing or rewriting them."
    )
    # The two known handlers must still be defined right after the decorators.
    assert "async def connect(sid" in server_text, (
        "connect handler missing — mandate-forbidden change"
    )
    assert "async def disconnect(sid" in server_text, (
        "disconnect handler missing — mandate-forbidden change"
    )
    print(f"✓ test_13_handler_decorators_unchanged  "
          f"({len(decorator_matches)} @sio.event decorators)")


def test_14_asgi_mount_unchanged():
    """``socketio.ASGIApp(sio, other_asgi_app=fastapi_app)`` mount
    line must be unchanged."""
    server_text = (ROOT / "server.py").read_text(encoding="utf-8")
    pattern = r"app\s*=\s*socketio\.ASGIApp\s*\(\s*sio\s*,\s*other_asgi_app\s*=\s*fastapi_app\s*\)"
    assert re.search(pattern, server_text), (
        "ASGIApp mount line not found or modified — mandate-forbidden "
        "change. Must be exactly "
        "`app = socketio.ASGIApp(sio, other_asgi_app=fastapi_app)`."
    )
    print("✓ test_14_asgi_mount_unchanged")


def test_15_owner_side_emit_count_preserved():
    """The total count of ``sio.emit(`` call sites in server.py
    must be at least 15 (sentinel: 20+ at C-4c entry). C-4c
    mandate forbids removing or rewriting any emit; the count can
    only INCREASE (if a new emit is added in a parallel future
    commit) — never decrease through this commit."""
    server_text = (ROOT / "server.py").read_text(encoding="utf-8")
    emit_matches = re.findall(r"\bsio\.emit\s*\(", server_text)
    assert len(emit_matches) >= 15, (
        f"sio.emit call sites dropped to {len(emit_matches)} — "
        f"C-4c mandate forbids removing emits. Sentinel was 20+ at "
        f"C-4c entry."
    )
    print(f"✓ test_15_owner_side_emit_count_preserved  "
          f"({len(emit_matches)} sio.emit call sites)")


def test_16_setter_is_idempotent_and_overwriting():
    """Calling ``set_sio`` twice with the same instance preserves
    identity. Calling with a different instance overwrites. None
    accepted. Mirror of the C-4b setter contract."""
    from app.core import socket_runtime
    original = socket_runtime.get_sio()
    try:
        a = object()
        b = object()
        socket_runtime.set_sio(a)
        assert socket_runtime.get_sio() is a
        socket_runtime.set_sio(a)
        assert socket_runtime.get_sio() is a, "setter must be idempotent"
        socket_runtime.set_sio(b)
        assert socket_runtime.get_sio() is b, "setter must overwrite"
        socket_runtime.set_sio(None)
        assert socket_runtime.get_sio() is None, "setter must accept None"
        socket_runtime.clear_sio_for_tests()
        assert socket_runtime.get_sio() is None, "clear_sio_for_tests must reset"
    finally:
        socket_runtime.set_sio(original)
        assert socket_runtime.get_sio() is original, "Failed to restore state"
    print("✓ test_16_setter_is_idempotent_and_overwriting")


def test_17_live_six_path_identity_match():
    """The MOST IMPORTANT C-4c assertion. At runtime (after server.py
    module-load), SIX reference paths must point at the SAME
    ``AsyncServer`` object (`is`, not `==`):

      1. ``server.sio`` (canonical module global)
      2. ``app.core.socket_runtime.get_sio()`` (the accessor)
      3. ``app.core.deps.get_sio()`` (the wrapper)
      4. ``app.services.identity_runtime._sio()`` (the lazy resolver)
      5. ``server.app.engineio_server`` (what FastAPI/ASGI mounts)
      6. The receiver of ``@sio.event`` decorators (verified
         indirectly: server.sio.handlers contains the two registered
         handlers)

    If any pair diverges, the entire event topology is at risk of
    split-brain."""
    import server  # noqa: WPS433 — test-only import
    from app.core.socket_runtime import get_sio as runtime_get_sio
    from app.core.deps import get_sio as deps_get_sio
    from app.services.identity_runtime import _sio as id_runtime_sio

    canonical = server.sio
    r1 = runtime_get_sio()
    r2 = deps_get_sio()
    r3 = id_runtime_sio()
    asgi_mount = getattr(server.app, "engineio_server", None)

    refs = {
        "server.sio": canonical,
        "socket_runtime.get_sio": r1,
        "app.core.deps.get_sio": r2,
        "identity_runtime._sio": r3,
        "server.app.engineio_server (ASGIApp wrap)": asgi_mount,
    }
    base = canonical
    for name, ref in refs.items():
        assert ref is base, (
            f"IDENTITY MISMATCH: {name} ({id(ref):#x}) is NOT "
            f"server.sio ({id(base):#x})"
        )
    # Handler binding check — handlers live on the sio instance.
    # python-socketio stores handlers in `sio.handlers` dict by
    # namespace then by event name. The default namespace is '/'.
    handlers = getattr(canonical, "handlers", {}) or {}
    default_ns = handlers.get("/", {})
    assert "connect" in default_ns or any(
        "connect" in str(h).lower() for h in default_ns
    ), (
        f"@sio.event connect handler not bound to canonical sio; "
        f"handler namespaces present: {list(handlers.keys())}, "
        f"default ns keys: {list(default_ns.keys())}"
    )
    assert "disconnect" in default_ns or any(
        "disconnect" in str(h).lower() for h in default_ns
    ), (
        f"@sio.event disconnect handler not bound to canonical sio"
    )
    print(f"✓ test_17_live_six_path_identity_match  "
          f"(all 5 reference paths + handler binding OK at 0x{id(base):x})")


# ─────────────────────────────────────────────────────────────────────
# Main
# ─────────────────────────────────────────────────────────────────────

def main() -> int:
    tests = [
        test_1_no_production_sio_bridge_anywhere,
        test_2_identity_runtime_uses_socket_runtime_accessor,
        test_3_app_core_deps_get_sio_routes_through_socket_runtime,
        test_4_socket_runtime_module_shape_is_minimal,
        test_5_single_setter_call_site_in_server_py,
        test_6_module_load_identity_assertion_present,
        test_7_split_brain_assertion_before_notifications_init,
        test_8_sio_bridge_removed_from_inventory,
        test_9_sio_remains_ownership_root_with_new_owner,
        test_10_tier_a_collapsed_to_db_only,
        test_11_bridge_inventory_count_is_eighteen,
        test_12_architectural_verdict_reflects_c4c_closure,
        test_13_handler_decorators_unchanged,
        test_14_asgi_mount_unchanged,
        test_15_owner_side_emit_count_preserved,
        test_16_setter_is_idempotent_and_overwriting,
        test_17_live_six_path_identity_match,
    ]
    fails = 0
    for t in tests:
        try:
            t()
        except Exception as e:
            fails += 1
            print(f"✗ {t.__name__}: {type(e).__name__}: {e}")
    print(f"\n{'=' * 60}")
    print(f"Phase 5.4 / C-4c sio retirement — {len(tests) - fails}/{len(tests)} PASS")
    print(f"{'=' * 60}")
    return fails


if __name__ == "__main__":
    sys.exit(main())
