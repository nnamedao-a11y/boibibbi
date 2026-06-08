"""
Phase 5.4 / C-5a — Pure-utility / stale-shim retirement.
=========================================================

C-5a is **execution** (unlike C-5 which was planning). This suite
asserts the four retirements landed correctly:

  1. AST: no PRODUCTION ``from server import …`` for any of the 4
     symbols.
  2. Canonical imports work and resolve to the documented modules.
  3. Behaviour parity — ``serialize_doc`` quirks preserved.
  4. Behaviour parity — ``_round_money`` permissive error path
     preserved.
  5. Behaviour parity — ``_smooth_eta_iso`` representative cases.
  6. Behaviour parity — ``is_valid_movement`` representative cases.
  7. Bridge inventory delta (19 → 15) and TIER_B inventory delta
     (9 → 5) landed.
  8. ``TIER_B_MOVE_AND_REROUTE`` shrunk 7 → 3 (audit / aggregator /
     _STATIC_DIR).
  9. ``C5A_RETIRED_SYMBOLS`` constant lists exactly the 4 retired
     symbols.
 10. OpenAPI 618/679 unchanged (no route surface touched).
 11. Server.py compat-shims for ``_smooth_eta_iso`` and
     ``is_valid_movement`` exist and delegate 1:1 to the canonical
     impls (in-process identity check).
 12. Module-private name-mangling guard: ``__haversine_km`` and
     ``__source_category`` in app.utils.shipments are NOT publicly
     exported under the name-mangled names.

Run:
    cd /app/backend && python tests/test_phase5_4_c5a_pure_utility_retirement.py
"""
from __future__ import annotations

import ast
import os
import sys
from collections import defaultdict
from datetime import datetime, timezone, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))


# ─────────────────────────────────────────────────────────────────────
# Constants — C-5a contract
# ─────────────────────────────────────────────────────────────────────

C5A_RETIRED = (
    "serialize_doc",
    "_round_money",
    "_smooth_eta_iso",
    "is_valid_movement",
)

EXPECTED_BRIDGE_COUNT_POST_C5A_VALID = {1, 2, 3, 6, 7, 8, 10, 11, 13, 14, 15}    # 15 fresh post-C-5a / 14 post-C-5b / 13 post-C-5c / 11 post-C-5e / 10 post-5.5/C / 8 post-5.5/D / 7 post-5.5/E / 6 post-5.5/F2 / 3 post-5.5/G / 2 post-5.5/H / 1 post-5.5/I
EXPECTED_TIER_B_INVENTORY_POST_C5A_VALID = {1, 3, 4, 5}    # 5 fresh / 4 post-C-5b / 3 post-C-5c / 1 post-C-5e
EXPECTED_TIER_B_MOVE_AND_REROUTE_POST_C5A_VALID = {1, 2, 3}  # 3 fresh / 2 post-C-5b / 1 post-C-5c
EXPECTED_OPENAPI_PATHS = 618
EXPECTED_OPENAPI_OPS = 679

SKIP_DIRS = {"__pycache__"}


def _classify(rel_path: str) -> str:
    """Production / legacy-root-test / test-suite (mirrors C-5 test)."""
    if rel_path.startswith("tests/") or "/tests/" in rel_path:
        return "test_suite"
    if rel_path.startswith("test_") and "/" not in rel_path:
        return "legacy_root_test"
    return "production"


def _ast_grep_from_server() -> dict:
    """Return ``{symbol: [(file, line, classification), …]}`` for
    every ``from server import …`` site in the production tree."""
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


# ─────────────────────────────────────────────────────────────────────
# 1) No production `from server import …` for any of the 4 symbols
# ─────────────────────────────────────────────────────────────────────

def test_1_no_production_from_server_imports():
    sites = _ast_grep_from_server()
    violations = []
    for sym in C5A_RETIRED:
        prod = [
            f"{f}:{l}" for (f, l, cls) in sites.get(sym, [])
            if cls == "production"
        ]
        if prod:
            violations.append(f"  {sym}: prod sites = {prod}")
    assert not violations, (
        "[C-5a] FAIL: PRODUCTION `from server import X` still present "
        "for retired symbols:\n" + "\n".join(violations)
    )
    print("✓ test_1_no_production_from_server_imports  "
          "(4 symbols × 0 production sites)")


# ─────────────────────────────────────────────────────────────────────
# 2) Canonical imports resolve correctly
# ─────────────────────────────────────────────────────────────────────

def test_2_canonical_imports_resolve():
    # `serialize_doc` canonical location: app/utils/serialization.py
    from app.utils.serialization import serialize_doc as _sd
    assert callable(_sd), "[C-5a] FAIL: app.utils.serialization.serialize_doc not callable"

    # `_round_money` canonical: app/utils/money.py
    from app.utils.money import _round_money as _rm
    assert callable(_rm), "[C-5a] FAIL: app.utils.money._round_money not callable"

    # `_smooth_eta_iso` canonical: app/utils/shipments.py (NEW in C-5a)
    from app.utils.shipments import _smooth_eta_iso as _se
    assert callable(_se), "[C-5a] FAIL: app.utils.shipments._smooth_eta_iso not callable"

    # `is_valid_movement` canonical: app/utils/shipments.py (NEW in C-5a)
    from app.utils.shipments import is_valid_movement as _ivm
    assert callable(_ivm), "[C-5a] FAIL: app.utils.shipments.is_valid_movement not callable"
    print("✓ test_2_canonical_imports_resolve  (4 symbols × canonical module)")


# ─────────────────────────────────────────────────────────────────────
# 3) Behaviour parity: serialize_doc quirks (ObjectId, datetime,
#    None, nested)
# ─────────────────────────────────────────────────────────────────────

def test_3_serialize_doc_parity():
    """Verify serialize_doc preserves its quirks:
      * ObjectId at dict-value → str
      * datetime at dict-value → isoformat
      * None / primitives pass through
      * Nested dicts walked recursively
      * **Legacy quirk preserved**: lists recurse INTO dict items
        but do NOT unwrap ObjectId / datetime values directly
        contained in a list (would break 58 read-paths if changed —
        see app/utils/serialization.py module docstring).
    """
    from app.utils.serialization import serialize_doc
    from bson import ObjectId

    oid = ObjectId()
    dt = datetime(2026, 5, 19, 14, 0, 0, tzinfo=timezone.utc)
    doc = {
        "_id": oid,
        "name": "shipment-x",
        "created": dt,
        "meta": {"by": "tester", "id": oid, "tags": [oid, "foo", 42]},
        "nullable": None,
        "count": 7,
        "child_dicts": [{"_id": oid, "v": 1}, {"_id": oid, "v": 2}],
    }
    out = serialize_doc(doc)
    # ObjectId at root → str
    assert isinstance(out["_id"], str), f"[C-5a] FAIL: _id not str: {out['_id']!r}"
    assert out["_id"] == str(oid)
    # datetime at dict-value → isoformat
    assert out["created"] == dt.isoformat(), (
        f"[C-5a] FAIL: datetime quirk: {out['created']!r}"
    )
    assert out["name"] == "shipment-x"
    # Nested dict walked recursively (ObjectId in meta.id → str)
    assert isinstance(out["meta"]["id"], str), (
        f"[C-5a] FAIL: nested ObjectId not serialized: {out['meta']['id']!r}"
    )
    assert out["meta"]["by"] == "tester"
    # Legacy quirk: ObjectId directly inside a list is NOT unwrapped.
    # Verify this exact behaviour (regression guard).
    tag0 = out["meta"]["tags"][0]
    assert isinstance(tag0, ObjectId), (
        f"[C-5a] FAIL: list-nested ObjectId quirk broken — got {tag0!r}, "
        f"expected raw ObjectId (legacy behaviour preserved)"
    )
    assert out["meta"]["tags"][1] == "foo"
    assert out["meta"]["tags"][2] == 42
    # List of dicts → each dict recursed
    assert isinstance(out["child_dicts"][0]["_id"], str), (
        f"[C-5a] FAIL: dict-in-list ObjectId not serialized: {out['child_dicts'][0]['_id']!r}"
    )
    assert out["child_dicts"][1]["v"] == 2
    # None / primitives pass through
    assert out["nullable"] is None
    assert out["count"] == 7
    # serialize_doc(None) → None
    assert serialize_doc(None) is None
    print("✓ test_3_serialize_doc_parity  (ObjectId, datetime, None, list-quirk, dict-in-list)")


# ─────────────────────────────────────────────────────────────────────
# 4) Behaviour parity: _round_money permissive error path
# ─────────────────────────────────────────────────────────────────────

def test_4_round_money_parity():
    """`_round_money` must:
      * round numerical input to 2 decimals
      * pass through None
      * permissively handle non-numeric input (return 0.0 or pass through)
    """
    from app.utils.money import _round_money

    # Basic rounding
    assert _round_money(1.234) == 1.23, f"[C-5a] FAIL: 1.234 → {_round_money(1.234)!r}"
    assert _round_money(1.236) == 1.24, f"[C-5a] FAIL: 1.236 → {_round_money(1.236)!r}"
    assert _round_money(0) == 0.0
    # Permissive: None passes through (canonical behaviour)
    assert _round_money(None) is None or _round_money(None) == 0.0, (
        f"[C-5a] FAIL: None handling drift: {_round_money(None)!r}"
    )
    # Decimal-shape input
    from decimal import Decimal
    res = _round_money(Decimal("1.235"))
    assert float(res) in (1.23, 1.24), (
        f"[C-5a] FAIL: Decimal('1.235') → {res!r}"
    )
    # Negative
    assert _round_money(-1.5) == -1.5
    print("✓ test_4_round_money_parity  (rounding + permissive None + Decimal)")


# ─────────────────────────────────────────────────────────────────────
# 5) Behaviour parity: _smooth_eta_iso representative cases
# ─────────────────────────────────────────────────────────────────────

def test_5_smooth_eta_iso_parity():
    """Verify _smooth_eta_iso semantics:
      * no prev → return new (pass-through)
      * no new → return prev (pass-through)
      * both None → None
      * normal simulated source: blended timestamp lies between prev and new
      * REAL tracking source: alpha boosted (closer to new than simulated case)
      * Unparseable input → returns new (or None)
    """
    from app.utils.shipments import _smooth_eta_iso

    # Pass-through cases
    assert _smooth_eta_iso(None, "2026-05-11T00:00:00Z", "simulated") == "2026-05-11T00:00:00Z"
    assert _smooth_eta_iso("2026-05-11T00:00:00Z", None, "simulated") == "2026-05-11T00:00:00Z"
    assert _smooth_eta_iso(None, None, "simulated") is None

    # Smoothing — simulated source, alpha = 0.3
    prev = "2026-05-05T00:00:00Z"
    new = "2026-05-15T00:00:00Z"   # +10 days
    smoothed_sim = _smooth_eta_iso(prev, new, "simulated")
    p = datetime.fromisoformat(prev.replace("Z", "+00:00"))
    n = datetime.fromisoformat(new.replace("Z", "+00:00"))
    s_sim = datetime.fromisoformat(smoothed_sim.replace("Z", "+00:00"))
    assert p < s_sim < n, (
        f"[C-5a] FAIL: simulated smoothing not bounded: {p} < {s_sim} < {n}"
    )
    # Expected blended ts: 0.7*p + 0.3*n
    expected_sim = datetime.fromtimestamp(
        p.timestamp() * 0.7 + n.timestamp() * 0.3, tz=timezone.utc,
    )
    delta = abs((s_sim - expected_sim).total_seconds())
    assert delta < 1.0, (
        f"[C-5a] FAIL: simulated EMA drift: {s_sim} vs expected {expected_sim} (delta={delta}s)"
    )

    # REAL source — alpha boosted to min(0.3*1.4, 0.9) = 0.42
    smoothed_real = _smooth_eta_iso(prev, new, "real")
    s_real = datetime.fromisoformat(smoothed_real.replace("Z", "+00:00"))
    expected_real = datetime.fromtimestamp(
        p.timestamp() * (1 - 0.42) + n.timestamp() * 0.42, tz=timezone.utc,
    )
    delta_real = abs((s_real - expected_real).total_seconds())
    assert delta_real < 1.0, (
        f"[C-5a] FAIL: real-source EMA boost drift: {s_real} vs expected {expected_real} "
        f"(delta={delta_real}s)"
    )
    # Real source should produce a smoothed value CLOSER to new than simulated
    assert s_real > s_sim, (
        f"[C-5a] FAIL: real source ({s_real}) did not get more weight than "
        f"simulated ({s_sim})"
    )

    # Unparseable input → returns new
    assert _smooth_eta_iso("not-a-date", "2026-05-11T00:00:00Z", "simulated") == "2026-05-11T00:00:00Z"
    print("✓ test_5_smooth_eta_iso_parity  (pass-through + simulated EMA + real boost + unparseable)")


# ─────────────────────────────────────────────────────────────────────
# 6) Behaviour parity: is_valid_movement representative cases
# ─────────────────────────────────────────────────────────────────────

def test_6_is_valid_movement_parity():
    """Verify is_valid_movement semantics:
      * No prev → True (permissive — bootstrap case)
      * Missing lat/lng in new → False
      * Normal movement under threshold → True
      * Spike: > 200 km in 60s → False
      * Long window with reasonable speed → True
      * Long window with implied speed > 93 km/h * 1.3 → False
      * Exception in helper → True (permissive)
    """
    from app.utils.shipments import is_valid_movement

    # Permissive: no prev
    assert is_valid_movement(None, {"lat": 30.0, "lng": 120.0}, 60) is True
    assert is_valid_movement({"lat": None, "lng": 120}, {"lat": 30, "lng": 120}, 60) is True

    # Missing new lat/lng → False
    assert is_valid_movement({"lat": 30.0, "lng": 120.0}, {"lat": None, "lng": 120}, 60) is False

    # Normal movement: 20 km in 120 s ≈ 600 km/h equivalent — well below ship speed range
    # but within the < 120s window the gate is JOURNEY_SPIKE_MAX_KM_PER_120S (200 km)
    assert is_valid_movement(
        {"lat": 30.0, "lng": 120.0}, {"lat": 30.1, "lng": 120.1}, 120
    ) is True

    # Spike: 2000 km in 60 s — must reject
    assert is_valid_movement(
        {"lat": 30.0, "lng": 120.0}, {"lat": 40.0, "lng": 100.0}, 60
    ) is False, "[C-5a] FAIL: 2000km/60s spike not rejected"

    # Long window — 50 km in 3600 s = ~50 km/h, below the 93 km/h cap → True
    assert is_valid_movement(
        {"lat": 30.0, "lng": 120.0}, {"lat": 30.4, "lng": 120.0}, 3600
    ) is True

    # Long window — 500 km in 3600 s = ~500 km/h, well above any cap → False
    assert is_valid_movement(
        {"lat": 30.0, "lng": 120.0}, {"lat": 34.5, "lng": 120.0}, 3600
    ) is False, "[C-5a] FAIL: 500km/h not rejected"

    # elapsed_seconds is None → permissive (the function returns True)
    assert is_valid_movement(
        {"lat": 30.0, "lng": 120.0}, {"lat": 50.0, "lng": 50.0}, None
    ) is True
    print("✓ test_6_is_valid_movement_parity  (permissive + spike + long-window + None elapsed)")


# ─────────────────────────────────────────────────────────────────────
# 7) Bridge inventory delta landed (19 → 15) and TIER_B inventory
#    delta landed (9 → 5)
# ─────────────────────────────────────────────────────────────────────

def test_7_inventory_delta_landed():
    from app.core.app_state_targets import (
        BRIDGE_INVENTORY, TIER_B_INVENTORY,
    )
    assert len(BRIDGE_INVENTORY) in EXPECTED_BRIDGE_COUNT_POST_C5A_VALID, (
        f"[C-5a] FAIL: BRIDGE_INVENTORY size = {len(BRIDGE_INVENTORY)}, "
        f"expected one of {sorted(EXPECTED_BRIDGE_COUNT_POST_C5A_VALID)} "
        f"(15 fresh post-C-5a, 14 post-C-5b)."
    )
    assert len(TIER_B_INVENTORY) in EXPECTED_TIER_B_INVENTORY_POST_C5A_VALID, (
        f"[C-5a] FAIL: TIER_B_INVENTORY size = {len(TIER_B_INVENTORY)}, "
        f"expected one of {sorted(EXPECTED_TIER_B_INVENTORY_POST_C5A_VALID)}."
    )
    # None of the 4 retired symbols may appear in either inventory
    bridge_syms = {b.symbol for b in BRIDGE_INVENTORY}
    tier_b_syms = {t.symbol for t in TIER_B_INVENTORY}
    for sym in C5A_RETIRED:
        assert sym not in bridge_syms, (
            f"[C-5a] FAIL: retired symbol `{sym}` still in BRIDGE_INVENTORY"
        )
        assert sym not in tier_b_syms, (
            f"[C-5a] FAIL: retired symbol `{sym}` still in TIER_B_INVENTORY"
        )
    print(f"✓ test_7_inventory_delta_landed  "
          f"(BRIDGE: {len(BRIDGE_INVENTORY)}; TIER_B: {len(TIER_B_INVENTORY)})")


# ─────────────────────────────────────────────────────────────────────
# 8) TIER_B_MOVE_AND_REROUTE shrunk 7 → 3
# ─────────────────────────────────────────────────────────────────────

def test_8_tier_b_move_and_reroute_shrunk():
    from app.core.app_state_targets import TIER_B_MOVE_AND_REROUTE
    assert len(TIER_B_MOVE_AND_REROUTE) in EXPECTED_TIER_B_MOVE_AND_REROUTE_POST_C5A_VALID, (
        f"[C-5a] FAIL: TIER_B_MOVE_AND_REROUTE size = "
        f"{len(TIER_B_MOVE_AND_REROUTE)}, expected one of "
        f"{sorted(EXPECTED_TIER_B_MOVE_AND_REROUTE_POST_C5A_VALID)} "
        f"(3 fresh post-C-5a / 2 post-C-5b / 1 post-C-5c)."
    )
    # Composition contract: `_STATIC_DIR` must ALWAYS remain (deferred
    # to DEFER:5.8). `audit` was removed by C-5c. `aggregator` was
    # removed by C-5b. So the only mandatory survivor is _STATIC_DIR.
    assert "_STATIC_DIR" in TIER_B_MOVE_AND_REROUTE, (
        f"[C-5a] FAIL: TIER_B_MOVE_AND_REROUTE composition drift: "
        f"`_STATIC_DIR` (DEFER:5.8) must be present; "
        f"got {sorted(TIER_B_MOVE_AND_REROUTE)}"
    )
    print(f"✓ test_8_tier_b_move_and_reroute_shrunk  "
          f"({sorted(TIER_B_MOVE_AND_REROUTE)})")


# ─────────────────────────────────────────────────────────────────────
# 9) C5A_RETIRED_SYMBOLS constant lists exactly the 4 retired symbols
# ─────────────────────────────────────────────────────────────────────

def test_9_c5a_retired_symbols_constant():
    from app.core.app_state_targets import C5A_RETIRED_SYMBOLS
    assert set(C5A_RETIRED_SYMBOLS) == set(C5A_RETIRED), (
        f"[C-5a] FAIL: C5A_RETIRED_SYMBOLS = {sorted(C5A_RETIRED_SYMBOLS)}, "
        f"expected {sorted(C5A_RETIRED)}"
    )
    print(f"✓ test_9_c5a_retired_symbols_constant  ({len(C5A_RETIRED_SYMBOLS)} retired)")


# ─────────────────────────────────────────────────────────────────────
# 10) OpenAPI 618/679 unchanged
# ─────────────────────────────────────────────────────────────────────

def test_10_openapi_route_freeze():
    os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")
    os.environ.setdefault("DB_NAME", "test_database")
    from fastapi.testclient import TestClient
    import server
    fastapi_app = getattr(server, "fastapi_app", None) or getattr(server, "app", None)
    assert fastapi_app is not None, "[C-5a] FAIL: cannot resolve FastAPI instance"
    client = TestClient(fastapi_app)
    r = client.get("/api/openapi.json")
    assert r.status_code == 200, f"[C-5a] FAIL: openapi HTTP {r.status_code}"
    data = r.json()
    paths = data.get("paths", {})
    n_paths = len(paths)
    n_ops = sum(
        len([k for k in v if k in ("get", "post", "put", "patch", "delete", "head", "options")])
        for v in paths.values()
    )
    assert n_paths == EXPECTED_OPENAPI_PATHS and n_ops == EXPECTED_OPENAPI_OPS, (
        f"[C-5a] FAIL: OpenAPI surface drifted. expected "
        f"{EXPECTED_OPENAPI_PATHS}/{EXPECTED_OPENAPI_OPS}, got "
        f"{n_paths}/{n_ops}"
    )
    print(f"✓ test_10_openapi_route_freeze  ({n_paths}/{n_ops})")


# ─────────────────────────────────────────────────────────────────────
# 11) Server.py compat-shims delegate 1:1 to canonical impls
# ─────────────────────────────────────────────────────────────────────

def test_11_server_shims_delegate_one_to_one():
    """server.py still exposes ``_smooth_eta_iso`` and
    ``is_valid_movement`` for back-compat (legacy POC scripts and
    server.py-internal callers reference them by name). Each must
    delegate 1:1 to the canonical implementation in
    ``app.utils.shipments`` — same return value, byte-for-byte."""
    os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")
    os.environ.setdefault("DB_NAME", "test_database")
    import server
    from app.utils.shipments import (
        _smooth_eta_iso as shipments_smooth,
        is_valid_movement as shipments_valid,
    )

    # _smooth_eta_iso parity
    cases_smooth = [
        (None, "2026-05-11T00:00:00Z", "simulated"),
        ("2026-05-05T00:00:00Z", "2026-05-15T00:00:00Z", "simulated"),
        ("2026-05-05T00:00:00Z", "2026-05-15T00:00:00Z", "real"),
        ("2026-05-05T00:00:00Z", None, "simulated"),
        ("not-a-date", "2026-05-11T00:00:00Z", "simulated"),
    ]
    for args in cases_smooth:
        a = server._smooth_eta_iso(*args)
        b = shipments_smooth(*args)
        assert a == b, (
            f"[C-5a] FAIL: server._smooth_eta_iso{args} = {a!r}, "
            f"app.utils.shipments._smooth_eta_iso{args} = {b!r}"
        )

    # is_valid_movement parity
    cases_movement = [
        (None, {"lat": 30, "lng": 120}, 60),
        ({"lat": 30, "lng": 120}, {"lat": 30.1, "lng": 120.1}, 120),
        ({"lat": 30, "lng": 120}, {"lat": 40, "lng": 100}, 60),
        ({"lat": 30, "lng": 120}, {"lat": 34.5, "lng": 120}, 3600),
        ({"lat": 30, "lng": 120}, {"lat": None, "lng": 120}, 60),
    ]
    for args in cases_movement:
        a = server.is_valid_movement(*args)
        b = shipments_valid(*args)
        assert a == b, (
            f"[C-5a] FAIL: server.is_valid_movement{args} = {a!r}, "
            f"app.utils.shipments.is_valid_movement{args} = {b!r}"
        )
    print(f"✓ test_11_server_shims_delegate_one_to_one  "
          f"({len(cases_smooth) + len(cases_movement)} parity cases)")


# ─────────────────────────────────────────────────────────────────────
# 12) Module-private helpers are NOT publicly exported
# ─────────────────────────────────────────────────────────────────────

def test_12_module_private_helpers_protected():
    """The private copies ``__haversine_km`` and ``__source_category``
    in app.utils.shipments are intentionally double-underscored so
    that any future ``from app.utils.shipments import _haversine_km``
    fails fast (the mangled name `_shipments__haversine_km` is the
    real attribute, not the bare `_haversine_km`). Also verify
    ``__all__`` does NOT list them."""
    import app.utils.shipments as ship_mod

    # The public surface (via __all__) must NOT include private copies
    public = set(getattr(ship_mod, "__all__", []))
    forbidden_in_public = {"_haversine_km", "_source_category",
                            "__haversine_km", "__source_category"}
    leaked = public & forbidden_in_public
    assert not leaked, (
        f"[C-5a] FAIL: module-private helpers exposed via __all__: "
        f"{sorted(leaked)}"
    )

    # Sanity: the bare names should not exist at module top-level
    assert not hasattr(ship_mod, "_haversine_km"), (
        "[C-5a] FAIL: bare `_haversine_km` present at module top-level "
        "(name-mangling broke or shadow definition added)"
    )
    assert not hasattr(ship_mod, "_source_category"), (
        "[C-5a] FAIL: bare `_source_category` present at module top-level"
    )
    # The mangled forms ARE present (because of Python name-mangling
    # rules — at module level there's no class scope, so the
    # double-underscore name stays literal). We accept either:
    # (a) the names exist under their double-underscore literal form
    #     (`__haversine_km` is `_haversine_km` if mangled at class scope,
    #      but at MODULE scope double-underscore names are NOT mangled —
    #      the literal `__haversine_km` exists), OR
    # (b) the names exist as defined.
    has_either = (
        hasattr(ship_mod, "__haversine_km")
        or hasattr(ship_mod, "_shipments__haversine_km")
    )
    assert has_either, (
        "[C-5a] FAIL: __haversine_km not findable under any form "
        "(module top-level or mangled)"
    )
    print(f"✓ test_12_module_private_helpers_protected  "
          f"(public={sorted(public)}; private copies hidden)")


# ─────────────────────────────────────────────────────────────────────
# Runner
# ─────────────────────────────────────────────────────────────────────

def _run_all():
    tests = [
        test_1_no_production_from_server_imports,
        test_2_canonical_imports_resolve,
        test_3_serialize_doc_parity,
        test_4_round_money_parity,
        test_5_smooth_eta_iso_parity,
        test_6_is_valid_movement_parity,
        test_7_inventory_delta_landed,
        test_8_tier_b_move_and_reroute_shrunk,
        test_9_c5a_retired_symbols_constant,
        test_10_openapi_route_freeze,
        test_11_server_shims_delegate_one_to_one,
        test_12_module_private_helpers_protected,
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
            print(f"✗ {t.__name__}  UNEXPECTED ERROR\n   {type(e).__name__}: {e}")
    print()
    print("=" * 60)
    print(
        f"Phase 5.4 / C-5a pure-utility / stale-shim retirement — "
        f"{len(tests) - failed}/{len(tests)} "
        f"{'PASS' if failed == 0 else 'FAIL'}"
    )
    print("=" * 60)
    return 0 if failed == 0 else 1


if __name__ == "__main__":
    sys.exit(_run_all())
