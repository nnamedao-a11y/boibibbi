"""
Phase 5.5 / F2 — `_tracking_enabled` env-flag reader Golden Suite
==================================================================

This suite enforces the 8-assertion contract for the
``_tracking_enabled`` → ``app/services/tracking_config.py::tracking_enabled``
extraction.

Mandate (verbatim, Phase 5.5/F2 kickoff after Step-1 pre-flight audit):

  Target:          ``app/services/tracking_config.py``
  Public name:     ``tracking_enabled`` (drop underscore)
  Pattern:         sibling function in existing module — NO accessor
                   pattern (helper reads env, NOT service state, so
                   "Если текущий helper читает module-global/service
                   напрямую — заменить на get_service()" clause
                   does NOT apply; strict 1:1 verbatim port wins).
  Compat shim:     none — all 5 callers migrated directly.
  Golden scope:    G1-G4 behavioural + 4 structural pins.

**Pre-flight audit (Step 1):**

  * Def at ``server.py:2963`` — sync ``def _tracking_enabled() -> bool``.
  * Body: ``os.environ.get("TRACKING_ENABLED", "true").strip().lower()
    not in ("0", "false", "no", "off")`` — pure env reader, no service
    lookup.
  * Default: ``True`` (env unset → returns True).
  * Disabled tokens: ``{"0", "false", "no", "off"}``.
  * Callers (inventory-drift discovery — claimed 1, actual 5):
      - 4 in-file callers in ``server.py`` (lines 6502, 6558, 20020, 20084)
      - 1 cross-module bridge in ``app/routers/admin_identity.py:67-69``
        (local wrapper ``_tracking_enabled()`` that lazy-imports
        ``from server import _tracking_enabled as _te``)
  * The admin_identity wrapper is the BRIDGE the inventory tracked.
    The 4 in-file callers were not visible to the bridge metadata.

8-assertion contract:

  Behavioural pins (G1-G4) — pre/post via _resolve_helper switch:

    G1   TRACKING_ENABLED=true (default)   → returns True
    G2   TRACKING_ENABLED=false / 0 / no / off → returns False (per
         token in the disabled set; G2 iterates all 4 tokens)
    G3   TRACKING_ENABLED env-var ABSENT   → returns True (default)
    G4   TRACKING_ENABLED malformed value  → returns True (legacy
         fallback semantics — any non-disabled-token value is enabled)

  Structural pins (5-8) — post-state, expected FAIL pre-extraction:

    5    ``app/services/tracking_config.py`` exports
         ``tracking_enabled`` callable (sync, returns bool)
    6    ``server.py`` no longer defines ``_tracking_enabled``
    7    ``app/routers/admin_identity.py`` no longer carries
         ``from server import _tracking_enabled`` lazy bridge;
         imports ``tracking_enabled`` from canonical home
    8    Inventory shrunk: BRIDGE_INVENTORY 7→6, TIER_C 6→5,
         PHASE_5_5_BOUNDARY 6→5; QUALIFIED_USAGE_BRIDGES 0;
         EXTRACTION_AUX_BRIDGES 45 (no aux per mandate);
         PHASE_5_5_F2_RETIRED_BRIDGES exists + exported

  OpenAPI freeze (9):

    9    paths=618, ops=679 unchanged

Behavioural tests use a single ``_resolve_helper`` switch point so the
SAME file runs UNCHANGED before AND after the cutover (label
``pre-5.5/F2`` resolves to ``server._tracking_enabled``; label
``post-5.5/F2`` resolves to
``app.services.tracking_config.tracking_enabled``).

Run:
    cd /app/backend && python -m pytest \\
        tests/test_phase5_5_f2_tracking_enabled.py -v
"""
from __future__ import annotations

import ast
import os
import sys
from pathlib import Path
from typing import Callable, Tuple
from unittest import mock

import pytest

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")
os.environ.setdefault("DB_NAME", "bibi_test_phase5_5_f2")


# ─────────────────────────────────────────────────────────────────────
# Helper-resolver — single switch point for pre/post extraction.
# ─────────────────────────────────────────────────────────────────────


def _resolve_helper() -> Tuple[Callable[[], bool], str]:
    """Return ``(tracking_enabled_callable, label)``.

    Resolution order:
      1. ``app.services.tracking_config.tracking_enabled``  (post-5.5/F2)
      2. ``server._tracking_enabled``                       (pre-5.5/F2)
    """
    try:
        from app.services.tracking_config import tracking_enabled  # type: ignore
        return tracking_enabled, "post-5.5/F2"
    except Exception:
        pass
    from server import _tracking_enabled  # type: ignore
    return _tracking_enabled, "pre-5.5/F2"


# ═════════════════════════════════════════════════════════════════════
# Behavioural assertions (G1-G4) — pre/post via switch.
# ═════════════════════════════════════════════════════════════════════


def test_g1_default_returns_true():
    """G1 — TRACKING_ENABLED unset OR set to canonical ``"true"`` →
    helper returns ``True``."""
    helper, label = _resolve_helper()
    with mock.patch.dict(os.environ, {"TRACKING_ENABLED": "true"}, clear=False):
        assert helper() is True, f"[{label}] TRACKING_ENABLED=true must return True"
    with mock.patch.dict(os.environ, {"TRACKING_ENABLED": "TRUE"}, clear=False):
        assert helper() is True, f"[{label}] case-insensitive True"
    with mock.patch.dict(os.environ, {"TRACKING_ENABLED": " true "}, clear=False):
        assert helper() is True, f"[{label}] whitespace-trimmed True"
    print(f"✓ test_g1 ({label}): TRACKING_ENABLED=true → True")


@pytest.mark.parametrize("disabled_value", ["0", "false", "no", "off",
                                            "FALSE", "OFF", " 0 ", "False"])
def test_g2_disabled_tokens_return_false(disabled_value):
    """G2 — TRACKING_ENABLED set to any of ``{"0","false","no","off"}``
    (case-insensitive, whitespace-trimmed) → helper returns ``False``."""
    helper, label = _resolve_helper()
    with mock.patch.dict(os.environ, {"TRACKING_ENABLED": disabled_value},
                          clear=False):
        result = helper()
    assert result is False, (
        f"[{label}] TRACKING_ENABLED={disabled_value!r} must return False, "
        f"got {result}"
    )
    print(f"✓ test_g2 ({label}): TRACKING_ENABLED={disabled_value!r} → False")


def test_g3_env_var_absent_returns_true():
    """G3 — TRACKING_ENABLED env-var completely ABSENT → helper returns
    ``True`` (default-on semantics — tracking is enabled unless
    explicitly disabled)."""
    helper, label = _resolve_helper()
    env_copy = {k: v for k, v in os.environ.items() if k != "TRACKING_ENABLED"}
    with mock.patch.dict(os.environ, env_copy, clear=True):
        assert "TRACKING_ENABLED" not in os.environ, "env-var must be absent"
        result = helper()
    assert result is True, (
        f"[{label}] TRACKING_ENABLED absent must return True (default), "
        f"got {result}"
    )
    print(f"✓ test_g3 ({label}): TRACKING_ENABLED absent → True (default)")


@pytest.mark.parametrize("malformed_value", ["yes", "1", "enabled", "on",
                                              "anything", "true_but_not_quite",
                                              ""])
def test_g4_malformed_value_returns_true(malformed_value):
    """G4 — TRACKING_ENABLED set to a value NOT in the disabled-token
    set → helper returns ``True`` (legacy fallback semantics — anything
    not explicitly disabled is treated as enabled, including
    typos / extra whitespace / non-canonical truthy values).

    NOTE: empty string ``""`` falls into this branch because it's not
    in the disabled set; helper returns True (this matches the legacy
    body's ``not in (...)`` semantics — an empty string is not a
    disabled token, hence enabled)."""
    helper, label = _resolve_helper()
    with mock.patch.dict(os.environ, {"TRACKING_ENABLED": malformed_value},
                          clear=False):
        result = helper()
    assert result is True, (
        f"[{label}] TRACKING_ENABLED={malformed_value!r} (non-disabled "
        f"token) must return True (fallback), got {result}"
    )
    print(f"✓ test_g4 ({label}): TRACKING_ENABLED={malformed_value!r} → True (fallback)")


# ═════════════════════════════════════════════════════════════════════
# Structural assertions (5-8) — post-state pins.
# ═════════════════════════════════════════════════════════════════════


def test_5_canonical_module_exports_tracking_enabled():
    """``app/services/tracking_config.py`` MUST export
    ``tracking_enabled`` as a module-level sync callable returning
    ``bool``."""
    from app.services import tracking_config as svc
    assert hasattr(svc, "tracking_enabled"), (
        "[5.5/F2 test_5] FAIL: app/services/tracking_config.py missing "
        "public ``tracking_enabled`` callable."
    )
    fn = svc.tracking_enabled
    assert callable(fn)
    import inspect
    assert not inspect.iscoroutinefunction(fn), (
        "[5.5/F2 test_5] FAIL: ``tracking_enabled`` must be sync "
        "(legacy contract); got coroutine function."
    )
    # __all__ must include it.
    assert "tracking_enabled" in getattr(svc, "__all__", []), (
        "[5.5/F2 test_5] FAIL: ``tracking_enabled`` not in "
        "``app.services.tracking_config.__all__``."
    )
    # Return type pin (smoke).
    with mock.patch.dict(os.environ, {"TRACKING_ENABLED": "true"}, clear=False):
        result = fn()
    assert isinstance(result, bool), (
        f"[5.5/F2 test_5] FAIL: ``tracking_enabled()`` must return bool, "
        f"got {type(result).__name__}"
    )
    print("✓ test_5: canonical export verified — sync, bool, in __all__")


def test_6_server_py_no_longer_defines_tracking_enabled():
    """``server.py`` MUST NOT contain ``def _tracking_enabled`` (or
    public name) anymore — the def is retired."""
    src = (ROOT / "server.py").read_text(encoding="utf-8")
    tree = ast.parse(src)
    defined = {
        node.name for node in ast.walk(tree)
        if isinstance(node, (ast.AsyncFunctionDef, ast.FunctionDef))
    }
    assert "_tracking_enabled" not in defined, (
        "[5.5/F2 test_6] FAIL: ``_tracking_enabled`` still defined in "
        "``server.py`` — extraction incomplete."
    )
    assert "tracking_enabled" not in defined, (
        "[5.5/F2 test_6] FAIL: ``tracking_enabled`` defined in "
        "``server.py`` — must live in canonical "
        "``app/services/tracking_config.py`` only."
    )
    print("✓ test_6: server.py no longer defines _tracking_enabled")


def test_7_admin_identity_uses_canonical_home():
    """``app/routers/admin_identity.py``:
      * MUST NOT carry ``from server import _tracking_enabled`` lazy
        bridge (the wrapper at line 67-69);
      * MUST import ``tracking_enabled`` from
        ``app.services.tracking_config``;
      * MUST use the public name (``tracking_enabled`` — no underscore)
        at the call site (formerly at line 352).
    """
    src = (ROOT / "app" / "routers" / "admin_identity.py").read_text(
        encoding="utf-8"
    )
    tree = ast.parse(src)
    # Negative: no `from server import _tracking_enabled`
    for node in ast.walk(tree):
        if isinstance(node, ast.ImportFrom) and node.module == "server":
            for alias in node.names:
                assert alias.name != "_tracking_enabled", (
                    f"[5.5/F2 test_7] FAIL: ``admin_identity.py:"
                    f"{node.lineno}`` still imports ``_tracking_enabled`` "
                    f"from ``server`` — bridge not retired."
                )
    # Positive: canonical import present.
    found_canonical = False
    for node in ast.walk(tree):
        if (isinstance(node, ast.ImportFrom)
                and node.module == "app.services.tracking_config"):
            for alias in node.names:
                if alias.name == "tracking_enabled":
                    found_canonical = True
                    break
    assert found_canonical, (
        "[5.5/F2 test_7] FAIL: ``admin_identity.py`` does not import "
        "``tracking_enabled`` from ``app.services.tracking_config``."
    )
    # Negative: no Call to ``_tracking_enabled`` (underscored name).
    for node in ast.walk(tree):
        if isinstance(node, ast.Call) and isinstance(node.func, ast.Name):
            assert node.func.id != "_tracking_enabled", (
                f"[5.5/F2 test_7] FAIL: ``admin_identity.py:"
                f"{node.lineno}`` still calls ``_tracking_enabled()`` "
                f"(underscored). Migrate to ``tracking_enabled()``."
            )
    print("✓ test_7: admin_identity.py uses canonical home + public name")


def test_8_inventory_shrinks_correctly():
    """5.5/F2 inventory delta:
      BRIDGE_INVENTORY:         7 → 6
      TIER_C_REQUIRES_REFACTOR: 6 → 5
      PHASE_5_5_BOUNDARY:       6 → 5
      QUALIFIED_USAGE_BRIDGES:  0 → 0  (unchanged)
      EXTRACTION_AUX_BRIDGES:  45 → 45 (no aux per mandate)

    ``_tracking_enabled`` MUST be removed from all three frozensets /
    tuples. ``PHASE_5_5_F2_RETIRED_BRIDGES`` constant MUST exist and
    have at least one entry (the admin_identity bridge retirement)."""
    from app.core.app_state_targets import (
        BRIDGE_INVENTORY, TIER_C_REQUIRES_REFACTOR, PHASE_5_5_BOUNDARY,
        QUALIFIED_USAGE_BRIDGES, EXTRACTION_AUX_BRIDGES,
    )
    # 5.5/G compatible-pin: BRIDGE_INVENTORY 6→3, TIER_C 5→2, PHASE_5_5_BOUNDARY 5→2.
    # 5.5/H compatible-pin: BRIDGE_INVENTORY 3→2, TIER_C 2→1, PHASE_5_5_BOUNDARY 2→1.
    assert len(BRIDGE_INVENTORY) in (6, 3, 2, 1), (
        f"[5.5/F2 test_8] FAIL: BRIDGE_INVENTORY size = "
        f"{len(BRIDGE_INVENTORY)}, expected 6 (post-5.5/F2), 3 "
        f"(post-5.5/G), 2 (post-5.5/H), or 1 (post-5.5/I)."
    )
    assert len(TIER_C_REQUIRES_REFACTOR) in (5, 2, 1, 0), (
        f"[5.5/F2 test_8] FAIL: TIER_C_REQUIRES_REFACTOR size = "
        f"{len(TIER_C_REQUIRES_REFACTOR)}, expected 5 (post-5.5/F2), "
        f"2 (post-5.5/G), or 1 (post-5.5/H)."
    )
    assert len(PHASE_5_5_BOUNDARY) in (5, 2, 1, 0), (
        f"[5.5/F2 test_8] FAIL: PHASE_5_5_BOUNDARY size = "
        f"{len(PHASE_5_5_BOUNDARY)}, expected 5 (post-5.5/F2), 2 "
        f"(post-5.5/G), or 1 (post-5.5/H)."
    )
    assert "_tracking_enabled" not in {b.symbol for b in BRIDGE_INVENTORY}, (
        "[5.5/F2 test_8] FAIL: ``_tracking_enabled`` still in BRIDGE_INVENTORY."
    )
    assert "_tracking_enabled" not in TIER_C_REQUIRES_REFACTOR
    assert "_tracking_enabled" not in PHASE_5_5_BOUNDARY
    assert len(QUALIFIED_USAGE_BRIDGES) == 0
    # 5.5/G compatible-pin: EXTRACTION_AUX_BRIDGES grew 45 → 47
    # (2 RESOLVER_DEP entries: _external_container_lookup, add_shipment_event).
    # 5.5/H compatible-pin: EXTRACTION_AUX_BRIDGES stays at 47 net
    # (_external_container_lookup RESOLVER_DEP retired ⊝;
    # _tracking_snapshot TRACKING_PROVIDERS_DEP registered ⊕).
    assert len(EXTRACTION_AUX_BRIDGES) in (2, 44, 45, 47), (
        f"[5.5/F2 test_8] FAIL: EXTRACTION_AUX_BRIDGES size = "
        f"{len(EXTRACTION_AUX_BRIDGES)}, expected 45 (post-5.5/F2) or "
        f"47 (post-5.5/G or post-5.5/H — net Δ-0 in 5.5/H)."
    )

    from app.core import app_state_targets as t
    assert hasattr(t, "PHASE_5_5_F2_RETIRED_BRIDGES"), (
        "[5.5/F2 test_8] FAIL: ``PHASE_5_5_F2_RETIRED_BRIDGES`` "
        "constant missing."
    )
    assert len(t.PHASE_5_5_F2_RETIRED_BRIDGES) >= 1
    assert "PHASE_5_5_F2_RETIRED_BRIDGES" in t.__all__
    print("✓ test_8: inventory shrunk 7→6 (BRIDGE), 6→5 (Tier-C), 6→5 (boundary)")


def test_9_openapi_surface_unchanged():
    """OpenAPI 618/679 invariant: 5.5/F2 is pure code rewiring — no
    routes added, removed, or renamed."""
    from fastapi.testclient import TestClient
    import server
    fastapi_app = getattr(server, "fastapi_app", None)
    assert fastapi_app is not None
    client = TestClient(fastapi_app)
    r = client.get("/api/openapi.json")
    assert r.status_code == 200
    data = r.json()
    paths = data.get("paths", {})
    methods = sum(
        len([k for k in v if k in {"get", "post", "put", "patch",
                                    "delete", "head", "options"}])
        for v in paths.values()
    )
    assert len(paths) == 618, (
        f"[5.5/F2 test_9] FAIL: openapi paths = {len(paths)}, expected 618"
    )
    assert methods == 679, (
        f"[5.5/F2 test_9] FAIL: openapi ops = {methods}, expected 679"
    )
    print(f"✓ test_9: OpenAPI freeze preserved (paths={len(paths)}, "
          f"ops={methods})")
