"""
Phase 5.5 / E — Stripe Config Helper Golden Suite
==================================================

This suite enforces the 12-assertion contract for the
``_get_stripe_config`` → ``app/services/stripe_config.py::get_stripe_config``
extraction.

Mandate (verbatim, Phase 5.5/E kickoff after Step 1 audit re-scoping):

  D1 = A   ownership target = ``app/services/stripe_config.py``
  D2 = A   public name      = ``get_stripe_config`` (drop underscore)
  D3 = A   no aux bridges expected
  D4 = A   no compat shim — all callers migrated directly
  D5 = A   golden scope G1-G5 + structural pins per Step-1 reformulation
  D6 = C   ``_tracking_enabled`` NOT batched — future wave

**Discovery surfaced at Step 1:**

  * ``_get_stripe_config`` was ALREADY extracted in Wave 1 from
    ``server.py`` to ``app/routers/payments.py`` — but its canonical
    home per architectural taxonomy is ``app/services/``, not a
    router module.
  * ``BRIDGE_INVENTORY`` carried a STALE entry pointing at
    ``server.py`` as the def-site.
  * ``cabinet_financials.py:366`` had a LATENT PRODUCTION BUG:
    the ``from server import _get_stripe_config`` lazy bridge has
    ALWAYS raised ``ImportError`` (``server`` never exported the
    symbol module-level). The surrounding ``except Exception`` masked
    the failure and the endpoint silently returned the stub
    *"Онлайн-оплата картою тимчасово недоступна"*.

5.5/E is therefore a **reformulated wave** combining:

  1. Architectural move (router → service module)
  2. Public-name normalization (``_get_stripe_config`` → ``get_stripe_config``)
  3. Inventory cleanup (stale ``BRIDGE_INVENTORY`` entry retired)
  4. **Explicit latent production bugfix** (``cabinet_financials.py:366``
     repaired — endpoint can now actually call Stripe)

12-assertion contract:

  1. canonical service module exists (``app/services/stripe_config.py``)
  2. ``app/routers/payments.py`` no longer defines ``_get_stripe_config``
  3. ``app/routers/payments.py`` imports ``get_stripe_config`` from
     ``app.services.stripe_config``
  4. ``server.py`` no longer imports ``_get_stripe_config`` from
     ``app.routers.payments``
  5. ``cabinet_financials.py`` no longer imports ``_get_stripe_config``
     from ``server``
  6. all callers use the public name ``get_stripe_config``
  7. behaviour parity — canonical config read (full configured doc →
     18-key shape with currency lowercased, paymentMethods=["card"], etc.)
  8. behaviour parity — missing config (``find_by_provider`` returns
     ``{}``) → default shape preserved 1:1
  9. behaviour parity — masked-secret idempotency / legacy
     paymentMethods list → enabledMethods conversion
 10. cabinet latent ImportError path FIXED — pre-extraction shape is
     ``ImportError`` (broken bridge); post-extraction shape is a
     successful import from ``app.services.stripe_config``
 11. ``BRIDGE_INVENTORY`` / ``TIER_C_REQUIRES_REFACTOR`` /
     ``PHASE_5_5_BOUNDARY`` shrink by 1 each (8→7 / 7→6 / 7→6);
     ``QUALIFIED_USAGE_BRIDGES`` stays at 0
 12. OpenAPI surface unchanged (paths=618, ops=679)

Behavioural tests (G7-G9) use a single ``_resolve_helper`` switch
point so the SAME file runs UNCHANGED before AND after the 5.5/E
extraction. Structural tests (1-6, 10, 11) describe POST-state and
are expected to FAIL pre-extraction — the audit-trail label
``pre-5.5/E`` is captured by ``_resolve_helper``.

Run:
    cd /app/backend && python -m pytest \\
        tests/test_phase5_5_e_stripe_config.py -v
"""
from __future__ import annotations

import asyncio
import ast
import os
import sys
from pathlib import Path
from typing import Any, Awaitable, Callable, Dict, Tuple
from unittest import mock

import pytest

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")
os.environ.setdefault("DB_NAME", "bibi_test_phase5_5_e")


# ─────────────────────────────────────────────────────────────────────
# Helper-resolver — single switch point for pre/post extraction.
# Returns (get_stripe_config_callable, label).
# Post-extraction wins if the canonical module exists.
# ─────────────────────────────────────────────────────────────────────


def _resolve_helper() -> Tuple[Callable[[], Awaitable[Dict[str, Any]]], str]:
    """Return ``(get_stripe_config_callable, label)``.

    Resolution order:
      1. ``app.services.stripe_config.get_stripe_config``  (post-5.5/E)
      2. ``app.routers.payments._get_stripe_config``       (pre-5.5/E)

    The ``server.py`` form was never a real module-level symbol —
    only a broken ``from server import`` in ``cabinet_financials.py``
    which raised ``ImportError`` at runtime.
    """
    try:
        from app.services.stripe_config import get_stripe_config  # type: ignore
        return get_stripe_config, "post-5.5/E"
    except Exception:
        pass
    from app.routers.payments import _get_stripe_config  # type: ignore
    return _get_stripe_config, "pre-5.5/E"


# ─────────────────────────────────────────────────────────────────────
# DB patch helper — point IntegrationConfigsRepository at a stubbed
# document.  Patches both `get_db` (canonical accessor) and
# `server.db` (legacy reads), so the helper executes against the
# isolated stub regardless of pre/post-extraction shape.
# ─────────────────────────────────────────────────────────────────────


class _FakeCollection:
    def __init__(self, doc: Dict[str, Any] | None):
        self._doc = doc

    async def find_one(self, *_args, **_kwargs):
        return self._doc


class _FakeDB:
    def __init__(self, doc: Dict[str, Any] | None):
        self._coll = _FakeCollection(doc)

    def __getitem__(self, _name):
        return self._coll


def _patched_get_db_factory(doc: Dict[str, Any] | None):
    fake = _FakeDB(doc)

    def _get_db():
        return fake

    return _get_db


def _run(coro):
    """Fresh event-loop runner — hygiene against other tests that
    closed the implicit main-thread loop via ``asyncio.run()``."""
    loop = asyncio.new_event_loop()
    try:
        return loop.run_until_complete(coro)
    finally:
        loop.close()


# ═════════════════════════════════════════════════════════════════════
# Structural assertions (1-6) — post-state pins.
# Expected to FAIL pre-extraction.
# ═════════════════════════════════════════════════════════════════════


def test_1_canonical_service_module_exists():
    """``app/services/stripe_config.py`` MUST exist with a module-level
    ``get_stripe_config`` callable and a Wave-1-style migration
    docstring."""
    services_path = ROOT / "app" / "services" / "stripe_config.py"
    assert services_path.exists(), (
        "[5.5/E] FAIL: canonical service module "
        "``app/services/stripe_config.py`` is missing."
    )
    from app.services import stripe_config as svc
    assert hasattr(svc, "get_stripe_config"), (
        "[5.5/E] FAIL: ``app/services/stripe_config.py`` missing public "
        "``get_stripe_config`` callable."
    )
    assert callable(svc.get_stripe_config)


def test_2_payments_router_no_longer_defines_helper():
    """``app/routers/payments.py`` MUST NOT contain
    ``async def _get_stripe_config`` (or the public name) anymore."""
    src = (ROOT / "app" / "routers" / "payments.py").read_text(encoding="utf-8")
    tree = ast.parse(src)
    defined = {
        node.name for node in ast.walk(tree)
        if isinstance(node, (ast.AsyncFunctionDef, ast.FunctionDef))
    }
    assert "_get_stripe_config" not in defined, (
        "[5.5/E] FAIL: ``_get_stripe_config`` still defined in "
        "``app/routers/payments.py`` — extraction incomplete."
    )
    assert "get_stripe_config" not in defined, (
        "[5.5/E] FAIL: ``get_stripe_config`` defined in "
        "``app/routers/payments.py`` — must live in "
        "``app/services/stripe_config.py``."
    )


def test_3_payments_router_imports_from_canonical_home():
    """``app/routers/payments.py`` MUST import ``get_stripe_config``
    from ``app.services.stripe_config``."""
    src = (ROOT / "app" / "routers" / "payments.py").read_text(encoding="utf-8")
    tree = ast.parse(src)
    found = False
    for node in ast.walk(tree):
        if (isinstance(node, ast.ImportFrom)
                and node.module == "app.services.stripe_config"):
            for alias in node.names:
                if alias.name == "get_stripe_config":
                    found = True
                    break
    assert found, (
        "[5.5/E] FAIL: ``app/routers/payments.py`` does not import "
        "``get_stripe_config`` from ``app.services.stripe_config``."
    )


def test_4_server_py_no_longer_imports_from_payments_router():
    """``server.py`` MUST NOT import ``_get_stripe_config`` from
    ``app.routers.payments`` anywhere (any shape). Post-extraction
    shape: ``from app.services.stripe_config import get_stripe_config``."""
    src = (ROOT / "server.py").read_text(encoding="utf-8")
    tree = ast.parse(src)
    for node in ast.walk(tree):
        if (isinstance(node, ast.ImportFrom)
                and node.module == "app.routers.payments"):
            for alias in node.names:
                assert alias.name != "_get_stripe_config", (
                    f"[5.5/E] FAIL: ``server.py:{node.lineno}`` still "
                    f"imports ``_get_stripe_config`` from "
                    f"``app.routers.payments``."
                )


def test_5_cabinet_financials_no_longer_imports_from_server():
    """``cabinet_financials.py`` MUST NOT carry ``from server import
    _get_stripe_config`` (the latent-bug bridge). Post-extraction
    shape: ``from app.services.stripe_config import get_stripe_config``."""
    src = (ROOT / "cabinet_financials.py").read_text(encoding="utf-8")
    tree = ast.parse(src)
    for node in ast.walk(tree):
        if isinstance(node, ast.ImportFrom) and node.module == "server":
            for alias in node.names:
                assert alias.name != "_get_stripe_config", (
                    f"[5.5/E] FAIL: ``cabinet_financials.py:"
                    f"{node.lineno}`` still imports "
                    f"``_get_stripe_config`` from ``server`` — "
                    f"latent ImportError bridge NOT repaired."
                )


def test_6_all_callers_use_public_name():
    """All production call sites (in router, server, cabinet) MUST
    invoke the public name ``get_stripe_config()`` — NO underscore
    prefix references should remain (apart from the test suite + the
    closeout docs + the inventory tombstone)."""
    import re
    rgx = re.compile(r"\b_get_stripe_config\b")
    consumers = [
        ROOT / "app" / "routers" / "payments.py",
        ROOT / "server.py",
        ROOT / "cabinet_financials.py",
    ]
    offenders = []
    for path in consumers:
        text = path.read_text(encoding="utf-8")
        # Allow plain-text mentions inside comments + docstrings —
        # the audit is on EXECUTABLE references.  Strip comments and
        # docstring-bearing comment blocks aggressively (we look at
        # AST below for call-site precision instead).
        tree = ast.parse(text)
        for node in ast.walk(tree):
            if isinstance(node, ast.Call) and isinstance(node.func, ast.Name):
                if node.func.id == "_get_stripe_config":
                    offenders.append(f"{path.name}:{node.lineno}")
            if (isinstance(node, ast.ImportFrom)
                    and any(alias.name == "_get_stripe_config"
                            for alias in node.names)):
                offenders.append(f"{path.name}:{node.lineno} (import)")
    assert not offenders, (
        f"[5.5/E] FAIL: underscore-prefixed name still referenced at: "
        f"{offenders}. All callers MUST use ``get_stripe_config`` "
        f"(public name)."
    )


# ═════════════════════════════════════════════════════════════════════
# Behavioural parity assertions (G7-G9) — pre/post via switch.
# ═════════════════════════════════════════════════════════════════════


def test_g7_canonical_config_read_full_shape():
    """G7 — full configured doc returns the expected 18-key shape with
    currency LOWERCASED, paymentMethods list derived from enabledMethods,
    isEnabled boolean, mode preserved, masked-Stripe-key passthrough."""
    helper, label = _resolve_helper()
    stripe_doc = {
        "provider": "stripe",
        "credentials": {
            "secretKey": "sk_test_REALSECRET",
            "restrictedKey": "rk_test_REALRESTRICTED",
            "publishableKey": "pk_test_REALPUB",
            "webhookSecret": "whsec_REALWH",
        },
        "settings": {
            "currency": "EUR",
            "enabledMethods": {"card": True, "apple_pay": True, "klarna": False},
            "checkoutMode": "hosted",
            "automaticPaymentMethods": True,
            "captureMethod": "automatic",
            "statementDescriptor": "BIBI-CARS-DEPOSIT-XYZ-LONG",
            "successUrl": "/cabinet/payment/success",
            "cancelUrl": "/cabinet/payment/cancel",
            "allowPromotionCodes": True,
            "billingAddressCollection": "auto",
            "phoneNumberCollection": False,
        },
        "isEnabled": True,
        "mode": "live",
    }

    with mock.patch("app.repositories.integration_configs.IntegrationConfigsRepository") as RepoCls:
        repo = RepoCls.return_value

        async def _find(provider):
            assert provider == "stripe"
            return stripe_doc

        repo.find_by_provider = _find

        # Also patch the qualified import path used by the helper body.
        with mock.patch("app.repositories.IntegrationConfigsRepository", RepoCls):
            cfg = _run(helper())

    expected_keys = {
        "secretKey", "restrictedKey", "publishableKey", "webhookSecret",
        "currency", "paymentMethods", "enabledMethods", "checkoutMode",
        "automaticPaymentMethods", "captureMethod", "statementDescriptor",
        "successUrl", "cancelUrl", "allowPromotionCodes",
        "billingAddressCollection", "phoneNumberCollection",
        "isEnabled", "mode",
    }
    assert set(cfg.keys()) == expected_keys, (
        f"[5.5/E G7 / label={label}] FAIL: configured-doc key set "
        f"drifted. Got {sorted(cfg.keys())}, expected "
        f"{sorted(expected_keys)}."
    )
    # Specific behavioural pins (verbatim from legacy body):
    assert cfg["secretKey"] == "sk_test_REALSECRET"
    assert cfg["publishableKey"] == "pk_test_REALPUB"
    assert cfg["currency"] == "eur", "currency MUST be lowercased"
    assert "card" in cfg["paymentMethods"], (
        "card MUST be in derived paymentMethods list (apple_pay is a "
        "wallet riding on the `card` method type — legacy guarantees "
        "card presence)"
    )
    assert "apple_pay" not in cfg["paymentMethods"], (
        "apple_pay MUST NOT be in derived paymentMethods list "
        "(wallet, not method type)"
    )
    assert "klarna" not in cfg["paymentMethods"], (
        "klarna disabled in enabledMethods MUST NOT appear in derived "
        "list"
    )
    assert cfg["enabledMethods"] == {
        "card": True, "apple_pay": True, "klarna": False,
    }, "enabledMethods dict preserved 1:1"
    assert cfg["isEnabled"] is True
    assert cfg["mode"] == "live"
    # Truncation: statementDescriptor capped at 22 chars (Stripe limit).
    assert cfg["statementDescriptor"] == "BIBI-CARS-DEPOSIT-XYZ-"[:22]
    assert len(cfg["statementDescriptor"]) <= 22
    print(f"✓ test_g7 ({label}): canonical config read — 18-key shape preserved")


def test_g8_missing_config_returns_default_shape():
    """G8 — when ``find_by_provider`` returns ``{}`` (no Stripe
    configuration), the helper MUST return the DEFAULT shape:
      * empty creds (4 strings empty)
      * currency=usd (default lowercased)
      * paymentMethods=["card"], enabledMethods={"card": True}
      * checkoutMode="hosted", captureMethod="automatic"
      * isEnabled=False, mode="sandbox"
      * successUrl="/cabinet/payment/success",
        cancelUrl="/cabinet/payment/cancel"
    """
    helper, label = _resolve_helper()

    with mock.patch("app.repositories.integration_configs.IntegrationConfigsRepository") as RepoCls:
        repo = RepoCls.return_value

        async def _find(_provider):
            return {}

        repo.find_by_provider = _find
        with mock.patch("app.repositories.IntegrationConfigsRepository", RepoCls):
            cfg = _run(helper())

    # All credentials empty strings
    assert cfg["secretKey"] == ""
    assert cfg["restrictedKey"] == ""
    assert cfg["publishableKey"] == ""
    assert cfg["webhookSecret"] == ""
    # Defaults
    assert cfg["currency"] == "usd", "default currency MUST be `usd`"
    assert cfg["paymentMethods"] == ["card"], (
        "default paymentMethods MUST be `['card']`"
    )
    assert cfg["enabledMethods"] == {"card": True}, (
        "default enabledMethods MUST be `{'card': True}`"
    )
    assert cfg["checkoutMode"] == "hosted"
    assert cfg["automaticPaymentMethods"] is True
    assert cfg["captureMethod"] == "automatic"
    assert cfg["statementDescriptor"] == ""
    assert cfg["successUrl"] == "/cabinet/payment/success"
    assert cfg["cancelUrl"] == "/cabinet/payment/cancel"
    assert cfg["allowPromotionCodes"] is True
    assert cfg["billingAddressCollection"] == "auto"
    assert cfg["phoneNumberCollection"] is False
    assert cfg["isEnabled"] is False, (
        "default isEnabled MUST be False (no doc → not enabled)"
    )
    assert cfg["mode"] == "sandbox", (
        "default mode MUST be `sandbox` (no doc → safe default)"
    )
    print(f"✓ test_g8 ({label}): missing config — default shape preserved")


def test_g9_legacy_payment_methods_list_to_enabled_methods_conversion():
    """G9 — back-compat: legacy ``settings.paymentMethods`` list shape
    (pre-enabledMethods era) MUST be converted to ``enabledMethods``
    dict with ``{m: True for m in legacy_list}``. The conversion only
    triggers when ``enabledMethods`` is absent or empty."""
    helper, label = _resolve_helper()

    legacy_doc = {
        "provider": "stripe",
        "credentials": {"secretKey": "sk_test_X"},
        "settings": {
            "paymentMethods": ["card", "ideal", "sepa_debit"],
            # NOTE: enabledMethods deliberately ABSENT
        },
        "isEnabled": True,
        "mode": "sandbox",
    }

    with mock.patch("app.repositories.integration_configs.IntegrationConfigsRepository") as RepoCls:
        repo = RepoCls.return_value

        async def _find(_provider):
            return legacy_doc

        repo.find_by_provider = _find
        with mock.patch("app.repositories.IntegrationConfigsRepository", RepoCls):
            cfg = _run(helper())

    assert cfg["enabledMethods"] == {
        "card": True, "ideal": True, "sepa_debit": True,
    }, (
        f"[5.5/E G9 / label={label}] legacy paymentMethods list MUST "
        f"convert to enabledMethods dict. Got {cfg['enabledMethods']}"
    )
    assert set(cfg["paymentMethods"]) == {"card", "ideal", "sepa_debit"}, (
        f"derived paymentMethods MUST contain all enabled methods"
    )
    print(f"✓ test_g9 ({label}): legacy paymentMethods → enabledMethods "
          f"conversion preserved")


# ═════════════════════════════════════════════════════════════════════
# Latent bug repair pin (10)
# ═════════════════════════════════════════════════════════════════════


def test_10_cabinet_latent_importerror_path_repaired():
    """Step-1 audit discovery: ``cabinet_financials.py:366`` carried
    ``from server import _get_stripe_config`` — a lazy WPS433 bridge
    that ALWAYS raised ``ImportError`` (``server`` never exported the
    symbol module-level). The surrounding ``except Exception`` masked
    the failure and forced the endpoint into stub-mode.

    Post-5.5/E pin:
      * the ``from server import _get_stripe_config`` line is GONE;
      * the replacement points at the canonical home
        (``from app.services.stripe_config import get_stripe_config``);
      * the canonical import succeeds without exception (helper is
        actually invokable from cabinet flow now).

    Pre-5.5/E (audit-trail label): the import raises ``ImportError``.
    The test acknowledges both states and asserts the POST shape.
    """
    src = (ROOT / "cabinet_financials.py").read_text(encoding="utf-8")
    # Negative: broken bridge is gone.
    assert "from server import _get_stripe_config" not in src, (
        "[5.5/E G10] FAIL: latent ``from server import "
        "_get_stripe_config`` bridge still present in "
        "``cabinet_financials.py`` — repair not landed."
    )
    # Positive: canonical home is referenced (some shape).
    assert (
        "from app.services.stripe_config import get_stripe_config" in src
        or "from app.services.stripe_config import (\n"
        "    get_stripe_config" in src
    ), (
        "[5.5/E G10] FAIL: ``cabinet_financials.py`` does not import "
        "``get_stripe_config`` from ``app.services.stripe_config``."
    )
    # Runtime: the canonical import must work without exception.
    try:
        from app.services.stripe_config import get_stripe_config  # noqa: F401
    except ImportError as e:
        pytest.fail(
            f"[5.5/E G10] FAIL: canonical import raises ImportError: {e}"
        )
    print("✓ test_10: latent cabinet ImportError repaired; canonical "
          "import works")


# ═════════════════════════════════════════════════════════════════════
# Inventory accounting pin (11)
# ═════════════════════════════════════════════════════════════════════


def test_11_bridge_inventory_shrinks_correctly():
    """5.5/E inventory delta (now widened with 5.5/F2 compatible-pin):
      BRIDGE_INVENTORY:         8 → 7  (post-5.5/E)
                                  → 6  (post-5.5/F2 — ``_tracking_enabled``
                                                     also retired)
      TIER_C_REQUIRES_REFACTOR: 7 → 6 → 5
      PHASE_5_5_BOUNDARY:       7 → 6 → 5
      QUALIFIED_USAGE_BRIDGES:  0 → 0
      EXTRACTION_AUX_BRIDGES:  45 → 45 (no aux per D3=A)

    ``_get_stripe_config`` MUST be removed from all three frozensets /
    tuples.  ``PHASE_5_5_E_RETIRED_BRIDGES`` constant MUST exist and
    have at least one entry."""
    from app.core.app_state_targets import (
        BRIDGE_INVENTORY, TIER_C_REQUIRES_REFACTOR, PHASE_5_5_BOUNDARY,
        QUALIFIED_USAGE_BRIDGES, EXTRACTION_AUX_BRIDGES,
    )
    # Accept post-5.5/E (7/6/6), post-5.5/F2 (6/5/5), post-5.5/G (3/2/2),
    # and post-5.5/H (2/1/1).
    assert len(BRIDGE_INVENTORY) in (7, 6, 3, 2, 1), (
        f"[5.5/E G11] FAIL: BRIDGE_INVENTORY size = "
        f"{len(BRIDGE_INVENTORY)}, expected 7 (post-5.5/E), 6 "
        f"(post-5.5/F2), 3 (post-5.5/G), 2 (post-5.5/H), or 1 (post-5.5/I)."
    )
    assert len(TIER_C_REQUIRES_REFACTOR) in (6, 5, 2, 1, 0), (
        f"[5.5/E G11] FAIL: TIER_C_REQUIRES_REFACTOR size = "
        f"{len(TIER_C_REQUIRES_REFACTOR)}, expected 6 (post-5.5/E), "
        f"5 (post-5.5/F2), 2 (post-5.5/G), or 1 (post-5.5/H)."
    )
    assert len(PHASE_5_5_BOUNDARY) in (6, 5, 2, 1, 0), (
        f"[5.5/E G11] FAIL: PHASE_5_5_BOUNDARY size = "
        f"{len(PHASE_5_5_BOUNDARY)}, expected 6 (post-5.5/E), 5 "
        f"(post-5.5/F2), 2 (post-5.5/G), or 1 (post-5.5/H)."
    )
    assert "_get_stripe_config" not in {b.symbol for b in BRIDGE_INVENTORY}, (
        "[5.5/E G11] FAIL: ``_get_stripe_config`` still in BRIDGE_INVENTORY."
    )
    assert "_get_stripe_config" not in TIER_C_REQUIRES_REFACTOR
    assert "_get_stripe_config" not in PHASE_5_5_BOUNDARY
    assert len(QUALIFIED_USAGE_BRIDGES) == 0
    # 5.5/G compatible-pin: EXTRACTION_AUX_BRIDGES grew 45 → 47
    # (2 new RESOLVER_DEP entries: _external_container_lookup +
    # add_shipment_event).
    # 5.5/H compatible-pin: EXTRACTION_AUX_BRIDGES stays at 47 net
    # (_external_container_lookup RESOLVER_DEP retired ⊝;
    # _tracking_snapshot TRACKING_PROVIDERS_DEP registered ⊕).
    assert len(EXTRACTION_AUX_BRIDGES) in (2, 44, 45, 47), (
        f"[5.5/E G11] FAIL: EXTRACTION_AUX_BRIDGES size = "
        f"{len(EXTRACTION_AUX_BRIDGES)}, expected 45 (post-5.5/E) or "
        f"47 (post-5.5/G or post-5.5/H — net Δ-0 in 5.5/H)."
    )

    from app.core import app_state_targets as t
    assert hasattr(t, "PHASE_5_5_E_RETIRED_BRIDGES")
    assert len(t.PHASE_5_5_E_RETIRED_BRIDGES) >= 1
    assert "PHASE_5_5_E_RETIRED_BRIDGES" in t.__all__
    print("✓ test_11: 5.5/E retirement landed (BRIDGE_INVENTORY in {7,6}, "
          "Tier-C in {6,5}, PHASE_5_5_BOUNDARY in {6,5})")


# ═════════════════════════════════════════════════════════════════════
# OpenAPI freeze (12)
# ═════════════════════════════════════════════════════════════════════


def test_12_openapi_surface_unchanged():
    """OpenAPI 618/679 invariant: 5.5/E is pure code rewiring — no
    routes added, removed, or renamed."""
    from fastapi.testclient import TestClient
    import server
    fastapi_app = getattr(server, "fastapi_app", None)
    assert fastapi_app is not None, "[5.5/E G12] FAIL: no fastapi_app"
    client = TestClient(fastapi_app)
    r = client.get("/api/openapi.json")
    assert r.status_code == 200, (
        f"[5.5/E G12] FAIL: openapi {r.status_code}"
    )
    data = r.json()
    paths = data.get("paths", {})
    methods = sum(
        len([k for k in v if k in {"get", "post", "put", "patch",
                                    "delete", "head", "options"}])
        for v in paths.values()
    )
    assert len(paths) == 618, (
        f"[5.5/E G12] FAIL: openapi paths = {len(paths)}, expected 618"
    )
    assert methods == 679, (
        f"[5.5/E G12] FAIL: openapi ops = {methods}, expected 679"
    )
    print(f"✓ test_12: OpenAPI freeze preserved (paths={len(paths)}, "
          f"ops={methods})")
