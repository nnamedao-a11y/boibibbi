"""
Phase 5.5 / B — Calculator engine EXTRACTION + qualified-access RETIREMENT.
===========================================================================

Two-function calculator extraction wave. Both engine bodies
(``_calculate_korea`` + ``calculator_calculate``) moved byte-identically
from ``server.py:9872`` and ``server.py:10126`` to a new canonical home
``app/services/calculator.py``. The only mechanical substitutions
applied during the move are the established C-4i pattern
(``db.X`` → ``get_db().X``) and the 5.5/A pattern (module-local
``logger = logging.getLogger("bibi.calculator")``).

In ``app/routers/calculations.py``, three qualified-access sites were
retired (1:1 substitutions):

  * ``server.logger.warning(...)`` (1 site, line 733)
    → ``logger.warning(...)`` (module-local, ``bibi.calculations``)
  * ``server._calculate_korea(...)`` (1 site, line 369)
    → ``_calculate_korea(...)`` (direct import from canonical home)
  * ``server.calculator_calculate(...)`` (1 site, line 371)
    → ``calculator_calculate(...)`` (direct import from canonical home)

The ``import server`` line was removed from calculations.py entirely
(zero ``server.X`` qualified usage survives).

The FastAPI route ``POST /api/calculator/calculate`` continues to be
registered against the (now-extracted) ``calculator_calculate``, via
imperative ``fastapi_app.post(...)`` in ``server.py``. Function
``__name__`` is unchanged, so the OpenAPI operationId is preserved
byte-identically. OpenAPI 618/679 invariant holds.

This test suite enforces 10 contract clauses:

  1. ``app/routers/calculations.py`` has ZERO ``server.X`` qualified
     access (any of the 3 retired symbols + the ``import server`` line).
  2. ``app/routers/calculations.py`` has a module-local ``logger``
     bound to ``logging.getLogger("bibi.calculations")``.
  3. ``app/routers/calculations.py`` has NO ``import server`` line.
  4. ``app/services/calculator.py`` publishes both engines as
     module-level callables with the expected names.
  5. ``server.py`` retains back-compat module attributes
     ``server._calculate_korea`` and ``server.calculator_calculate``
     (via re-import from the canonical home). Both resolve to the
     SAME function objects exposed by ``app.services.calculator``.
  6. ``POST /api/calculator/calculate`` route is intact: present in
     OpenAPI, ``operationId == "calculator_calculate"``.
  7. OpenAPI freeze: 618 paths / 679 methods (mandate invariant).
  8. ``QUALIFIED_USAGE_BRIDGES`` count = 2 (was 5 at start of 5.5/B
     after 5.5/A had taken it from 6 → 5). The 3 calc.py entries are
     gone; the 2 remaining are
     ``(_create_order_from_invoice, payments.py)`` and
     ``(tracking_config_service, admin_integrations.py)``.
  9. ``PHASE_5_5_B_RETIRED_QUALIFIED_SITES`` records exactly the 3
     retired tuples. ``PHASE_5_5_BOUNDARY`` lost ``logger``,
     ``_calculate_korea``, ``calculator_calculate`` (14 → 11 symbols).
 10. GOLDEN PARITY — 18 representative inputs (10 USA + 8 Korea)
     hashed pre-extraction against the live ``/api/calculator/calculate``
     endpoint produce byte-identical responses post-extraction
     (canonical JSON with ``sort_keys=True, separators=(',', ':')``).

Run:
    cd /app/backend && python -m pytest tests/test_phase5_5_b_calculator_extraction.py -v
"""
from __future__ import annotations

import ast
import asyncio
import hashlib
import json
import os
import re
import sys
from pathlib import Path
from typing import Set

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")
os.environ.setdefault("DB_NAME", "test_database")

CALC_PY = ROOT / "app" / "routers" / "calculations.py"
CALC_SVC_PY = ROOT / "app" / "services" / "calculator.py"
EXPECTED_LOGGER_NAMESPACE = "bibi.calculations"
EXPECTED_CALC_SVC_LOGGER_NAMESPACE = "bibi.calculator"
EXPECTED_REMAINING_QUALIFIED_USAGE_BRIDGES = 0  # 5 at start of 5.5/B → 2 post-5.5/B → 1 post-5.5/F → 0 post-5.5/C (compatible-pin)
EXPECTED_OPENAPI_PATHS = 618
EXPECTED_OPENAPI_OPS = 679

# Symbols that must NOT appear as qualified access in calculations.py
FORBIDDEN_QUALIFIED_SYMBOLS = {"logger", "_calculate_korea", "calculator_calculate"}


# ─────────────────────────────────────────────────────────────────────
# Pinned golden hashes captured pre-extraction (2026-05-19) via
# POST /api/calculator/calculate against the live backend. See
# /tmp/capture_golden.py for the capture script. SHA-256 over
# json.dumps(response, sort_keys=True, separators=(",", ":")).
# ─────────────────────────────────────────────────────────────────────
PINNED_HASHES = {
    "usa_cheap_sedan_copart_burgas": "63171284247a0ad983cf429784102566e9c0572a5c867ca4b557264c6c5765e3",
    "usa_expensive_bigsuv_iaai_varna": "094648523d9b121093672093618c6dd979002c7de00b13428a4a697e70b0588d",
    "usa_damaged_sedan_copart_burgas": "494b1b4b61d1b10a3483745a02e29b68892eb8e788dd00b2001254be8d47d88b",
    "usa_default_origin_omitted": "057efe1caf74e37274f2031e243e380cd79bd5343bcbf317ad3d1bef5841de5b",
    "usa_invalid_port_fallback_burgas": "e7462b8bfc5473c2caef20b6b66e7f5932f347eccb47a21a06cbde313d452dcd",
    "usa_invalid_auction_fallback_copart": "e7462b8bfc5473c2caef20b6b66e7f5932f347eccb47a21a06cbde313d452dcd",
    "usa_invalid_vehicletype_fallback_sedan": "e7462b8bfc5473c2caef20b6b66e7f5932f347eccb47a21a06cbde313d452dcd",
    "usa_pickup_copart_burgas": "32f00d3316016169a3b47f1b9d516e0ced859114e84af256f7f800263411f3e2",
    "usa_zero_price_edge": "b60092dee07511ae1f762487615b2adeb1e04bf9381e994daa3ae45d8f6c6e56",
    "usa_above_10k_tier_check": "327009af979953b36f4bf2234eb8770b40f8ec13b3fc91a2e0eba888b9f7181e",
    "korea_sedan_package": "c210b3df7de3145f86427c7560c8299449f09184e8516701f5fcb48a1c29bae7",
    "korea_suv_itemized": "9415a1ab1baba85fe208d0e730b6e0a6facb329ff070c402ab62ecde2c7fdee7",
    "korea_with_invoice_price": "57c4f8f873b4410558a1da149e4e29916366d3b555974c664a989bcc21e42499",
    "korea_damaged_sedan": "dbed06a402ca98c90933798e864207eaa49241fd62a2dfbdd84773fe26b86fb7",
    "korea_additional_fees_eur": "84f3b00c53cbbae136c98e8efac969dab1019f7b2a7fca2e8ace21f441cf7b29",
    "korea_bigsuv_itemized": "489571c21b229f1a4a193afc5e269f5f0bd27668e1bc10417b7f36bfdd130335",
    "korea_alias_kr": "a9483fa72359301687ae4ab9e36107f4d10dbd8f6073f2b76ed4743479caac1d",
    "korea_alias_korea_bg": "a9483fa72359301687ae4ab9e36107f4d10dbd8f6073f2b76ed4743479caac1d",
}

INPUT_FIXTURES = [
    ("usa_cheap_sedan_copart_burgas",         {"origin": "usa", "price": 5000,  "vehicleType": "sedan",  "port": "burgas", "auction": "copart"}),
    ("usa_expensive_bigsuv_iaai_varna",       {"origin": "usa", "price": 45000, "vehicleType": "bigSUV", "port": "varna",  "auction": "iaai"}),
    ("usa_damaged_sedan_copart_burgas",       {"origin": "usa", "price": 12000, "vehicleType": "sedan",  "port": "burgas", "auction": "copart", "damaged": True}),
    ("usa_default_origin_omitted",            {                 "price": 8000,  "vehicleType": "suv",    "port": "burgas", "auction": "copart"}),
    ("usa_invalid_port_fallback_burgas",      {"origin": "usa", "price": 9000,  "vehicleType": "sedan",  "port": "nowhere_xyz", "auction": "copart"}),
    ("usa_invalid_auction_fallback_copart",   {"origin": "usa", "price": 9000,  "vehicleType": "sedan",  "port": "burgas", "auction": "blackmarket"}),
    ("usa_invalid_vehicletype_fallback_sedan",{"origin": "usa", "price": 9000,  "vehicleType": "ufo",    "port": "burgas", "auction": "copart"}),
    ("usa_pickup_copart_burgas",              {"origin": "usa", "price": 22000, "vehicleType": "pickup", "port": "burgas", "auction": "copart"}),
    ("usa_zero_price_edge",                   {"origin": "usa", "price": 0,     "vehicleType": "sedan",  "port": "burgas", "auction": "copart"}),
    ("usa_above_10k_tier_check",              {"origin": "usa", "price": 15000, "vehicleType": "sedan",  "port": "burgas", "auction": "copart"}),
    ("korea_sedan_package",                   {"origin": "korea",    "price": 18000, "vehicleType": "sedan",  "useLogisticsPackage": True}),
    ("korea_suv_itemized",                    {"origin": "korea",    "price": 24000, "vehicleType": "suv",    "useLogisticsPackage": False}),
    ("korea_with_invoice_price",              {"origin": "korea",    "price": 30000, "invoicePrice": 12000, "vehicleType": "sedan", "useLogisticsPackage": True}),
    ("korea_damaged_sedan",                   {"origin": "korea",    "price": 14000, "vehicleType": "sedan",  "damaged": True, "useLogisticsPackage": True}),
    ("korea_additional_fees_eur",             {"origin": "korea",    "price": 20000, "vehicleType": "sedan",  "additionalFees": 500, "useLogisticsPackage": False}),
    ("korea_bigsuv_itemized",                 {"origin": "korea",    "price": 35000, "vehicleType": "bigSUV", "useLogisticsPackage": False}),
    ("korea_alias_kr",                        {"origin": "kr",       "price": 16000, "vehicleType": "sedan",  "useLogisticsPackage": True}),
    ("korea_alias_korea_bg",                  {"origin": "korea_bg", "price": 16000, "vehicleType": "sedan",  "useLogisticsPackage": True}),
]


def _read(p: Path) -> str:
    return p.read_text(encoding="utf-8")


def _calc_ast():
    return ast.parse(_read(CALC_PY))


def _calc_svc_ast():
    return ast.parse(_read(CALC_SVC_PY))


def _canonical_hash(obj) -> str:
    return hashlib.sha256(
        json.dumps(obj, sort_keys=True, separators=(",", ":")).encode("utf-8")
    ).hexdigest()


# ─────────────────────────────────────────────────────────────────────
# 1) calculations.py has ZERO qualified `server.X` access
# ─────────────────────────────────────────────────────────────────────

def test_1_calculations_has_no_qualified_server_usage():
    """No ``server.X`` qualified attribute access anywhere in
    calculations.py. The 3 retired symbols (logger, _calculate_korea,
    calculator_calculate) all had to migrate to direct imports."""
    tree = _calc_ast()
    violations = []
    for node in ast.walk(tree):
        if isinstance(node, ast.Attribute) and isinstance(node.value, ast.Name):
            if node.value.id == "server":
                violations.append((node.lineno, node.attr))
    assert not violations, (
        f"[5.5/B] FAIL: `server.X` still used in calculations.py at "
        f"{violations}. Mandate forbids: must be migrated to canonical "
        f"imports (logger → module-local; engines → app.services.calculator)."
    )
    print("✓ test_1: 0 `server.X` qualified-access sites in "
          "calculations.py (was 3 pre-5.5/B)")


# ─────────────────────────────────────────────────────────────────────
# 2) calculations.py has a module-local ``logger`` ("bibi.calculations")
# ─────────────────────────────────────────────────────────────────────

def test_2_calculations_has_module_local_logger():
    """A top-level assignment ``logger = logging.getLogger("bibi.calculations")``
    must exist in calculations.py."""
    src = _read(CALC_PY)
    m = re.search(
        r'^logger\s*=\s*logging\.getLogger\(\s*[\'"]([^\'"]+)[\'"]\s*\)\s*$',
        src, re.MULTILINE,
    )
    assert m is not None, (
        "[5.5/B] FAIL: no top-level `logger = logging.getLogger(\"...\")` "
        "match in calculations.py."
    )
    ns = m.group(1)
    assert ns == EXPECTED_LOGGER_NAMESPACE, (
        f"[5.5/B] FAIL: logger namespace = {ns!r}, expected "
        f"{EXPECTED_LOGGER_NAMESPACE!r}"
    )

    # `import logging` must be present
    tree = _calc_ast()
    has_import_logging = any(
        isinstance(n, ast.Import) and any(a.name == "logging" for a in n.names)
        for n in ast.walk(tree)
    )
    assert has_import_logging, (
        "[5.5/B] FAIL: calculations.py missing `import logging`."
    )

    # Runtime check — the logger object must bind to "bibi.calculations"
    import server  # noqa: F401 — load server first to avoid cycle
    import sys as _sys
    _c = _sys.modules.get("app.routers.calculations")
    assert _c is not None, (
        "[5.5/B] FAIL: app.routers.calculations not in sys.modules "
        "after server load."
    )
    import logging as _logging
    assert isinstance(_c.logger, _logging.Logger), (
        "[5.5/B] FAIL: calculations.logger is not a logging.Logger"
    )
    assert _c.logger.name == EXPECTED_LOGGER_NAMESPACE, (
        f"[5.5/B] FAIL: calculations.logger.name = {_c.logger.name!r}, "
        f"expected {EXPECTED_LOGGER_NAMESPACE!r}"
    )
    print(f"✓ test_2: module-local logger ({EXPECTED_LOGGER_NAMESPACE!r}) "
          f"published in calculations.py (source AST + runtime)")


# ─────────────────────────────────────────────────────────────────────
# 3) calculations.py has NO `import server` line
# ─────────────────────────────────────────────────────────────────────

def test_3_import_server_removed_from_calculations():
    """``import server`` must be GONE from calculations.py — there
    are zero remaining qualified-access sites that would justify it."""
    tree = _calc_ast()
    has_import_server = any(
        isinstance(n, ast.Import) and any(a.name == "server" for a in n.names)
        for n in ast.walk(tree)
    )
    assert not has_import_server, (
        "[5.5/B] FAIL: `import server` line still present in calculations.py. "
        "Mandate: remove the `import server` line — no qualified usage left."
    )

    # Also: no `from server import X` shape allowed for the retired symbols
    bad_from_server = []
    for n in ast.walk(tree):
        if isinstance(n, ast.ImportFrom) and n.module == "server":
            for a in n.names:
                if a.name in FORBIDDEN_QUALIFIED_SYMBOLS:
                    bad_from_server.append(a.name)
    assert not bad_from_server, (
        f"[5.5/B] FAIL: `from server import` for retired symbols "
        f"{bad_from_server} found in calculations.py. Must import "
        f"engines from app.services.calculator and use module-local logger."
    )
    print("✓ test_3: `import server` removed from calculations.py; "
          "no `from server import` for retired symbols")


# ─────────────────────────────────────────────────────────────────────
# 4) app/services/calculator.py publishes both engines
# ─────────────────────────────────────────────────────────────────────

def test_4_calculator_service_publishes_engines():
    """The new canonical home must exist and publish both engines as
    callable module attributes."""
    assert CALC_SVC_PY.exists(), (
        f"[5.5/B] FAIL: {CALC_SVC_PY} does not exist — extraction target "
        f"missing."
    )

    import server  # noqa: F401 — load order
    import app.services.calculator as svc

    for name in ("_calculate_korea", "calculator_calculate"):
        fn = getattr(svc, name, None)
        assert callable(fn), (
            f"[5.5/B] FAIL: app.services.calculator.{name} is not callable: "
            f"{fn!r}"
        )
        assert asyncio.iscoroutinefunction(fn), (
            f"[5.5/B] FAIL: app.services.calculator.{name} must be async "
            f"(was async in server.py pre-extraction)."
        )

    # The service module must also have a module-local logger
    src = _read(CALC_SVC_PY)
    m = re.search(
        r'^logger\s*=\s*logging\.getLogger\(\s*[\'"]([^\'"]+)[\'"]\s*\)\s*$',
        src, re.MULTILINE,
    )
    assert m is not None, (
        "[5.5/B] FAIL: app/services/calculator.py missing module-local "
        "logger."
    )
    assert m.group(1) == EXPECTED_CALC_SVC_LOGGER_NAMESPACE, (
        f"[5.5/B] FAIL: calculator service logger ns = {m.group(1)!r}, "
        f"expected {EXPECTED_CALC_SVC_LOGGER_NAMESPACE!r}"
    )
    print("✓ test_4: app/services/calculator.py exposes both engines "
          "as async callables; module-local logger "
          f"({EXPECTED_CALC_SVC_LOGGER_NAMESPACE!r}) present")


# ─────────────────────────────────────────────────────────────────────
# 5) server.py retains back-compat module attributes
# ─────────────────────────────────────────────────────────────────────

def test_5_server_back_compat_attributes():
    """``server._calculate_korea`` and ``server.calculator_calculate``
    must still resolve as module attributes (back-compat), and they
    must be the SAME function objects as the canonical home's exports."""
    import server
    import app.services.calculator as svc

    for name in ("_calculate_korea", "calculator_calculate"):
        srv_attr = getattr(server, name, None)
        svc_attr = getattr(svc, name, None)
        assert srv_attr is not None, (
            f"[5.5/B] FAIL: back-compat broken — server.{name} is None. "
            f"Re-import the symbol from app.services.calculator at the "
            f"location of the old definition in server.py."
        )
        assert srv_attr is svc_attr, (
            f"[5.5/B] FAIL: server.{name} is NOT the same object as "
            f"app.services.calculator.{name}. The re-import must "
            f"establish identity (not a wrapped copy)."
        )

    # The two function definitions must be GONE from server.py at the
    # AST level (i.e., not redefined locally).
    tree = ast.parse((ROOT / "server.py").read_text(encoding="utf-8"))
    local_defs = [
        n.name for n in ast.walk(tree)
        if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef))
        and n.name in {"_calculate_korea", "calculator_calculate"}
    ]
    assert not local_defs, (
        f"[5.5/B] FAIL: server.py still defines local versions of "
        f"{local_defs}. Bodies must be extracted to "
        f"app/services/calculator.py and only re-imported in server.py."
    )
    print("✓ test_5: server._calculate_korea / server.calculator_calculate "
          "are back-compat re-exports (identity preserved); no local "
          "redefinitions in server.py")


# ─────────────────────────────────────────────────────────────────────
# 6) POST /api/calculator/calculate route intact
# ─────────────────────────────────────────────────────────────────────

def test_6_calculator_route_intact():
    """The route ``POST /api/calculator/calculate`` must still exist
    with ``operationId == "calculator_calculate"`` (driven by the
    function ``__name__``, which is unchanged by the extraction)."""
    from fastapi.testclient import TestClient
    import server
    fa = getattr(server, "fastapi_app", None)
    assert fa is not None
    client = TestClient(fa)
    r = client.get("/api/openapi.json")
    assert r.status_code == 200
    data = r.json()
    paths = data.get("paths", {})
    p = paths.get("/api/calculator/calculate")
    assert p is not None, (
        "[5.5/B] FAIL: /api/calculator/calculate missing from OpenAPI."
    )
    post = p.get("post")
    assert post is not None, (
        "[5.5/B] FAIL: POST method on /api/calculator/calculate missing."
    )
    op_id = post.get("operationId", "")
    assert op_id and op_id.startswith("calculator_calculate"), (
        f"[5.5/B] FAIL: operationId for POST /api/calculator/calculate "
        f"= {op_id!r}, expected to start with 'calculator_calculate'."
    )
    print(f"✓ test_6: POST /api/calculator/calculate intact "
          f"(operationId={op_id!r})")


# ─────────────────────────────────────────────────────────────────────
# 7) OpenAPI 618/679 freeze invariant
# ─────────────────────────────────────────────────────────────────────

def test_7_openapi_freeze_618_679():
    from fastapi.testclient import TestClient
    import server
    fa = getattr(server, "fastapi_app", None)
    assert fa is not None
    client = TestClient(fa)
    r = client.get("/api/openapi.json")
    assert r.status_code == 200
    data = r.json()
    paths = data.get("paths", {})
    methods = sum(
        len([k for k in v if k in {"get", "post", "put", "patch",
                                    "delete", "head", "options"}])
        for v in paths.values() if isinstance(v, dict)
    )
    assert len(paths) == EXPECTED_OPENAPI_PATHS, (
        f"[5.5/B] FAIL: OpenAPI paths = {len(paths)}, "
        f"expected {EXPECTED_OPENAPI_PATHS}"
    )
    assert methods == EXPECTED_OPENAPI_OPS, (
        f"[5.5/B] FAIL: OpenAPI methods = {methods}, "
        f"expected {EXPECTED_OPENAPI_OPS}"
    )
    print(f"✓ test_7: OpenAPI {EXPECTED_OPENAPI_PATHS}/"
          f"{EXPECTED_OPENAPI_OPS} held")


# ─────────────────────────────────────────────────────────────────────
# 8) QUALIFIED_USAGE_BRIDGES count decreased 5 → 2
# ─────────────────────────────────────────────────────────────────────

def test_8_qualified_usage_bridges_count_decreased():
    """5.5/B retires 3 entries from the calc.py cluster. Starting
    count was 5 (after 5.5/A took it from 6 → 5). Post-5.5/B count
    must be 2 — and NONE of the entries may be for calculations.py."""
    from app.core.app_state_targets import QUALIFIED_USAGE_BRIDGES
    assert len(QUALIFIED_USAGE_BRIDGES) == EXPECTED_REMAINING_QUALIFIED_USAGE_BRIDGES, (
        f"[5.5/B] FAIL: QUALIFIED_USAGE_BRIDGES size = "
        f"{len(QUALIFIED_USAGE_BRIDGES)}, expected "
        f"{EXPECTED_REMAINING_QUALIFIED_USAGE_BRIDGES}."
    )
    for q in QUALIFIED_USAGE_BRIDGES:
        assert q.consumer_file != "app/routers/calculations.py", (
            f"[5.5/B] FAIL: QUALIFIED_USAGE_BRIDGES still has an entry for "
            f"calculations.py ({q.symbol!r}). All 3 should be retired."
        )
    # The 2 remaining are predictable at end of 5.5/B; after 5.5/F
    # this assertion is compatibly-pinned to the post-5.5/F state
    # (just _create_order_from_invoice). 5.5/C compatible-pin: that
    # symbol is now retired too, leaving the set EMPTY.
    remaining = {(q.symbol, q.consumer_file) for q in QUALIFIED_USAGE_BRIDGES}
    # 5.5/B expected 2 entries; 5.5/F took it to 1; 5.5/C took it to 0:
    acceptable_supersets = (
        {  # post-5.5/B state (kept for historical reference):
            ("_create_order_from_invoice", "app/routers/payments.py"),
            ("tracking_config_service", "app/routers/admin_integrations.py"),
        },
        {  # post-5.5/F state:
            ("_create_order_from_invoice", "app/routers/payments.py"),
        },
        set(),  # post-5.5/C state (current — empty)
    )
    assert remaining in acceptable_supersets, (
        f"[5.5/B→F→C compatible-pin] FAIL: remaining QUALIFIED_USAGE_BRIDGES "
        f"set drift. Got: {sorted(remaining)}. Expected one of: "
        f"{[sorted(s) for s in acceptable_supersets]}."
    )
    print(f"✓ test_8: QUALIFIED_USAGE_BRIDGES count "
          f"{EXPECTED_REMAINING_QUALIFIED_USAGE_BRIDGES} "
          f"(5 → 0, calc.py cluster + tracking_config + create_order all cleared)")


# ─────────────────────────────────────────────────────────────────────
# 9) PHASE_5_5_B_RETIRED_QUALIFIED_SITES + PHASE_5_5_BOUNDARY shrinkage
# ─────────────────────────────────────────────────────────────────────

def test_9_phase_5_5_b_boundary_updates():
    """The retirement record must list exactly the 3 calc.py sites.
    PHASE_5_5_BOUNDARY must have lost `logger`, `_calculate_korea`,
    and `calculator_calculate` (all 3 retired qualified-access symbols)."""
    from app.core.app_state_targets import (
        PHASE_5_5_B_RETIRED_QUALIFIED_SITES,
        PHASE_5_5_BOUNDARY,
    )
    expected = {
        ("logger", "app/routers/calculations.py"),
        ("_calculate_korea", "app/routers/calculations.py"),
        ("calculator_calculate", "app/routers/calculations.py"),
    }
    got = set(PHASE_5_5_B_RETIRED_QUALIFIED_SITES)
    assert got == expected, (
        f"[5.5/B] FAIL: PHASE_5_5_B_RETIRED_QUALIFIED_SITES = "
        f"{sorted(got)}, expected {sorted(expected)}."
    )

    # PHASE_5_5_BOUNDARY shrunk: the 3 retired symbols must be GONE.
    for sym in ("logger", "_calculate_korea", "calculator_calculate"):
        assert sym not in PHASE_5_5_BOUNDARY, (
            f"[5.5/B] FAIL: {sym!r} still in PHASE_5_5_BOUNDARY — should "
            f"be removed after 5.5/B (all consumer sites migrated to "
            f"canonical homes)."
        )

    # Boundary must still hold the un-retired symbols (sanity).
    # 5.5/F compatible-pin: `tracking_config_service` was also retired
    # in 5.5/F (it's no longer in scope for sanity check) — drop it
    # from the assertion list.
    # 5.5/C compatible-pin: `_create_order_from_invoice` was also
    # retired in 5.5/C — drop it from the sanity check too.
    # 5.5/G compatible-pin: ``identity_runtime`` retired in 5.5/G
    # (cluster — moved with _run_auto_resolver + _persist_resolver_hits)
    # — drop it from the sanity check as well.
    # 5.5/I compatible-pin: ``ensure_shipment_stages`` retired in 5.5/I
    # (shipments orchestration cluster — PHASE_5_5_BOUNDARY now empty;
    # Phase 5.5 officially closed). Sanity assertion vacuous post-5.5/I.

    print("✓ test_9: PHASE_5_5_B_RETIRED_QUALIFIED_SITES records 3 sites; "
          "PHASE_5_5_BOUNDARY shrank by 3 symbols "
          "(logger, _calculate_korea, calculator_calculate gone)")


# ─────────────────────────────────────────────────────────────────────
# 10) GOLDEN PARITY — 18 pinned hashes must match post-extraction
# ─────────────────────────────────────────────────────────────────────

def test_10_calculator_golden_parity():
    """Pinned baseline hashes captured pre-extraction must reproduce
    byte-identically post-extraction. Hashes are SHA-256 over canonical
    JSON (sort_keys=True, separators=(',', ':')) of the response from
    ``POST /api/calculator/calculate``.

    18 inputs: 10 USA-pipeline (calculator_calculate) + 8 Korea
    (_calculate_korea via the same route). Covers: undamaged + damaged,
    package vs itemized, invoicePrice override, alias dispatch (kr,
    korea_bg), invalid-input fallbacks (port, auction, vehicleType),
    tiered-fee threshold, zero-price edge.

    Uses TestClient as a context manager so FastAPI's startup events
    (``@on_event("startup")``) fire — without this, the module-level
    ``db`` global stays ``None`` and the calculator engines blow up
    on ``db.calculator_profile.find_one(...)``."""
    from fastapi.testclient import TestClient
    import server
    fa = getattr(server, "fastapi_app", None)
    assert fa is not None

    mismatches = []
    with TestClient(fa) as client:
        for label, payload in INPUT_FIXTURES:
            r = client.post("/api/calculator/calculate", json=payload)
            assert r.status_code == 200, (
                f"[5.5/B] FAIL: {label}: HTTP {r.status_code} "
                f"(payload={payload}, body={r.text[:200]})"
            )
            body = r.json()
            h = _canonical_hash(body)
            expected = PINNED_HASHES[label]
            if h != expected:
                mismatches.append((label, expected, h))

    assert not mismatches, (
        "[5.5/B] FAIL: GOLDEN PARITY BROKEN — "
        f"{len(mismatches)}/{len(INPUT_FIXTURES)} hashes mismatch:\n  "
        + "\n  ".join(
            f"{lbl}: expected {exp[:16]}…, got {got[:16]}…"
            for lbl, exp, got in mismatches
        )
    )
    print(f"✓ test_10: GOLDEN PARITY — {len(INPUT_FIXTURES)}/"
          f"{len(INPUT_FIXTURES)} pinned hashes match (byte-identical "
          "responses across both engines pre/post extraction)")


# ─────────────────────────────────────────────────────────────────────
# Entrypoint
# ─────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import traceback
    tests = [
        test_1_calculations_has_no_qualified_server_usage,
        test_2_calculations_has_module_local_logger,
        test_3_import_server_removed_from_calculations,
        test_4_calculator_service_publishes_engines,
        test_5_server_back_compat_attributes,
        test_6_calculator_route_intact,
        test_7_openapi_freeze_618_679,
        test_8_qualified_usage_bridges_count_decreased,
        test_9_phase_5_5_b_boundary_updates,
        test_10_calculator_golden_parity,
    ]
    failed = 0
    for t in tests:
        try:
            t()
        except Exception:
            failed += 1
            print(f"✗ {t.__name__} FAILED")
            traceback.print_exc()
    print(f"\n{'='*60}\n5.5/B SUITE: {len(tests)-failed}/{len(tests)} "
          f"PASS, {failed} FAIL\n{'='*60}")
    sys.exit(0 if failed == 0 else 1)
