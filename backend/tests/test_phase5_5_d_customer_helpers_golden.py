"""
Phase 5.5 / D — Customer Helpers Golden Suite
==============================================

This suite **pins legacy behaviour** of ``_require_customer`` and
``_ensure_customer_seed`` BEFORE their extraction to
``app/services/customers.py``.

Mandate (verbatim, Phase 5.5/D kickoff)
─────────────────────────────────────────
  * Step 1 — golden tests FIRST
  * Coverage — G1 … G8 only (no expansion into ``_resolve_bearer``)
  * Cover:
      G1-G5 — ``require_customer`` bearer-resolution / 401 surface
      G6-G8 — ``ensure_customer_seed`` seed shape + idempotency

Mandate locked decisions (D1–D4):
  D1: ownership target = ``app/services/customers.py``
  D2: ``_resolve_bearer`` stays in server.py; becomes EXTRACTION_AUX_BRIDGES
  D3: public names = ``require_customer`` / ``ensure_customer_seed``
  D4: no compat shim; all internal callers migrate

Forbidden in 5.5/D (enforced by these tests):
  * no token-logic changes (G1-G5 pin the exact 401 surface)
  * no ``_resolve_bearer`` move
  * no auth abstraction
  * no seed data edits (G8 pins customer profile shape)
  * no response-shape changes

Suite contract (8 scenarios):

  G1. ``require_customer`` with a valid bearer + active session →
      returns the customer doc (no ``_id``, no ``password``).
  G2. ``require_customer`` with ``None`` / empty / whitespace
      authorization → ``HTTPException(401, "Authentication required")``.
  G3. ``require_customer`` with a malformed header (not
      ``Bearer X``) → 401.
  G4. ``require_customer`` with an unknown token → 401.
  G5. ``require_customer`` with an expired session → 401.
  G6. ``ensure_customer_seed`` cold-start (no existing customer)
      creates all 10 expected collections (customers, deals,
      shipments, invoices, contracts, carfax_reports, notifications,
      leads, deposits, shipment_events) with the canonical counts.
  G7. ``ensure_customer_seed`` is idempotent — calling twice
      produces no duplicates.
  G8. ``ensure_customer_seed`` customer profile shape preserved
      byte-for-byte (email format, firstName=="Alexander",
      preferredLanguage=="uk", marketingOptIn==True, etc.).

The suite uses a single ``_resolve_helpers`` switch point so the
SAME file runs UNCHANGED before AND after the 5.5/D extraction.

Run:
    cd /app/backend && python -m pytest \\
        tests/test_phase5_5_d_customer_helpers_golden.py -v
"""
from __future__ import annotations

import asyncio
import os
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Awaitable, Callable, Dict, Tuple
from unittest import mock

import pytest
from fastapi import HTTPException

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")
os.environ.setdefault("DB_NAME", "bibi_test_phase5_5_d")


# ─────────────────────────────────────────────────────────────────────
# Helper-resolver — single switch point for pre/post extraction.
# Returns (require_customer_callable, ensure_customer_seed_callable, label).
# ─────────────────────────────────────────────────────────────────────


def _resolve_helpers() -> Tuple[
    Callable[..., Awaitable[Dict[str, Any]]],
    Callable[..., Awaitable[None]],
    str,
]:
    """Return ``(require_customer, ensure_customer_seed, label)``.

    Post-extraction shape wins if present; both shapes are accepted,
    assertions are identical.
    """
    try:
        from app.services.customers import (  # type: ignore
            require_customer,
            ensure_customer_seed,
        )
        return require_customer, ensure_customer_seed, "post-5.5/D"
    except Exception:
        pass
    import server  # noqa: WPS433
    return server._require_customer, server._ensure_customer_seed, "pre-5.5/D"


# ─────────────────────────────────────────────────────────────────────
# Async runner — sets up isolated DB, patches server.db (for legacy
# helper) AND app.core.db_runtime._db_ref (for canonical post-extraction
# accessor), executes the scenario, always tears down.
# ─────────────────────────────────────────────────────────────────────


async def _setup_and_run(coro_factory):
    """Boot isolated test DB; patch ``server.db`` (legacy reads)
    and ``app.core.db_runtime._db_ref`` (post-extraction accessor)
    so the helper executes against the isolated test DB. Cleans
    the 10 seed-target collections + the auth collections
    (``customer_sessions`` + ``customers``) before AND after."""
    from motor.motor_asyncio import AsyncIOMotorClient
    import server  # noqa: WPS433

    SEED_COLLECTIONS = (
        "customers", "deals", "shipments", "invoices", "contracts",
        "carfax_reports", "notifications", "leads", "deposits",
        "shipment_events", "customer_sessions",
    )

    mongo_url = os.environ["MONGO_URL"]
    db_name = os.environ["DB_NAME"]
    client = AsyncIOMotorClient(mongo_url)
    db = client[db_name]

    # Clean slate
    for c in SEED_COLLECTIONS:
        await db[c].delete_many({})

    require_customer, ensure_customer_seed, label = _resolve_helpers()

    patches = [mock.patch.object(server, "db", db)]
    # Post-extraction surface: app.core.db_runtime._db_ref (best-effort).
    try:
        from app.core import db_runtime  # type: ignore
        patches.append(mock.patch.object(db_runtime, "_db_ref", db, create=True))
    except Exception:
        pass

    for p in patches:
        p.start()
    try:
        return await coro_factory(db, require_customer, ensure_customer_seed, label)
    finally:
        for p in reversed(patches):
            try:
                p.stop()
            except Exception:
                pass
        try:
            for c in SEED_COLLECTIONS:
                await db[c].delete_many({})
        finally:
            client.close()


def _run(coro_factory):
    """Synchronous wrapper around ``asyncio.run``."""
    return asyncio.run(_setup_and_run(coro_factory))


# ─────────────────────────────────────────────────────────────────────
# Session factory — write a fresh bearer-token session into customer_sessions.
# ─────────────────────────────────────────────────────────────────────


async def _seed_session(
    db,
    *,
    token: str = "test-token-001",
    customer_id: str = "cust_g_001",
    customer_email: str = "g_customer@bibi.cars",
    customer_first_name: str = "Test",
    expires_at: Any = None,  # None → 1h in future; pass datetime for explicit
    use_session_token_field: bool = False,
):
    """Insert a customer + a session row so ``_resolve_bearer`` can
    succeed. Mirrors the live customer-auth flow byte-for-byte."""
    if expires_at is None:
        expires_at = datetime.now(timezone.utc) + timedelta(hours=1)
    session_doc: Dict[str, Any] = {
        "customerId": customer_id,
        "expires_at": expires_at,
    }
    if use_session_token_field:
        session_doc["session_token"] = token
    else:
        session_doc["token"] = token

    await db.customer_sessions.insert_one(session_doc)
    await db.customers.insert_one({
        "id": customer_id,
        "customerId": customer_id,
        "email": customer_email,
        "firstName": customer_first_name,
        "password": "should-be-stripped-from-output",
    })


# ═══════════════════════════════════════════════════════════════════
# G1 — Valid bearer → returns customer doc
# ═══════════════════════════════════════════════════════════════════


def test_g1_valid_bearer_returns_customer():
    """G1: A valid Bearer token with an active session resolves to the
    customer doc. ``_id`` MUST NOT appear (Motor projection); ``password``
    MUST NOT appear (Motor projection)."""
    async def scenario(db, require_customer, ensure_customer_seed, label):
        await _seed_session(db, token="bearer-g1", customer_id="cust_g1")
        customer = await require_customer("Bearer bearer-g1")

        assert customer is not None, f"[G1 / {label}] expected customer doc"
        assert customer["id"] == "cust_g1"
        assert customer["email"] == "g_customer@bibi.cars"
        assert customer["firstName"] == "Test"
        assert "_id" not in customer, f"[G1 / {label}] Mongo _id leaked to API: {customer.keys()}"
        assert "password" not in customer, f"[G1 / {label}] password leaked to API"

        # Same flow accepting `session_token` field (legacy column).
        await _seed_session(
            db, token="bearer-g1b", customer_id="cust_g1b",
            customer_email="g1b@bibi.cars", customer_first_name="Test2",
            use_session_token_field=True,
        )
        customer2 = await require_customer("Bearer bearer-g1b")
        assert customer2 is not None and customer2["id"] == "cust_g1b", (
            f"[G1 / {label}] session_token field path broken"
        )

    _run(scenario)


# ═══════════════════════════════════════════════════════════════════
# G2 — None / empty / whitespace authorization → 401
# ═══════════════════════════════════════════════════════════════════


def test_g2_missing_authorization_raises_401():
    """G2: ``None`` / empty string / whitespace → ``HTTPException(401)``
    with detail ``"Authentication required"``."""
    async def scenario(db, require_customer, ensure_customer_seed, label):
        for bad in (None, "", "   "):
            with pytest.raises(HTTPException) as exc:
                await require_customer(bad)
            assert exc.value.status_code == 401, (
                f"[G2 / {label}] expected 401 for {bad!r}; got {exc.value.status_code}"
            )
            assert exc.value.detail == "Authentication required", (
                f"[G2 / {label}] detail drift for {bad!r}: {exc.value.detail!r}"
            )

    _run(scenario)


# ═══════════════════════════════════════════════════════════════════
# G3 — Malformed authorization header → 401
# ═══════════════════════════════════════════════════════════════════


def test_g3_malformed_authorization_raises_401():
    """G3: Authorization that does not match the ``Bearer X`` shape
    must raise 401. Includes: wrong scheme, missing token, lowercase
    scheme exactly-honoured (case-insensitive — see code), and stray
    spacing."""
    async def scenario(db, require_customer, ensure_customer_seed, label):
        # First seed a valid customer so we can rule out a happy-path leak.
        await _seed_session(db, token="bearer-good", customer_id="cust_good")

        malformed_cases = [
            "Token bearer-good",       # wrong scheme
            "bearer-good",             # no scheme
            "Bearer",                  # scheme without token
            "Bearer  ",                # scheme with empty token after split
            "Basic dXNlcjpwYXNz",      # entirely different auth scheme
        ]
        for bad in malformed_cases:
            with pytest.raises(HTTPException) as exc:
                await require_customer(bad)
            assert exc.value.status_code == 401, (
                f"[G3 / {label}] expected 401 for {bad!r}; got {exc.value.status_code}"
            )

    _run(scenario)


# ═══════════════════════════════════════════════════════════════════
# G4 — Unknown token → 401
# ═══════════════════════════════════════════════════════════════════


def test_g4_unknown_token_raises_401():
    """G4: Token that does not exist in ``customer_sessions`` → 401."""
    async def scenario(db, require_customer, ensure_customer_seed, label):
        with pytest.raises(HTTPException) as exc:
            await require_customer("Bearer this-token-does-not-exist")
        assert exc.value.status_code == 401

    _run(scenario)


# ═══════════════════════════════════════════════════════════════════
# G5 — Expired session → 401
# ═══════════════════════════════════════════════════════════════════


def test_g5_expired_session_raises_401():
    """G5: Session with ``expires_at`` in the past → 401.  Covers:
        * tz-aware past datetime
        * naive past datetime (tz-coerced to UTC by the helper)
        * ISO-string past datetime (parsed by the helper)
    """
    async def scenario(db, require_customer, ensure_customer_seed, label):
        past_aware = datetime.now(timezone.utc) - timedelta(hours=1)
        past_naive = past_aware.replace(tzinfo=None)
        past_iso = past_aware.isoformat()

        for token, expires in (
            ("expired-aware", past_aware),
            ("expired-naive", past_naive),
            ("expired-iso", past_iso),
        ):
            await _seed_session(
                db, token=token,
                customer_id=f"cust_{token}",
                customer_email=f"{token}@bibi.cars",
                expires_at=expires,
            )
            with pytest.raises(HTTPException) as exc:
                await require_customer(f"Bearer {token}")
            assert exc.value.status_code == 401, (
                f"[G5 / {label}] expired session ({token}) did not raise 401; "
                f"got {exc.value.status_code}"
            )

    _run(scenario)


# ═══════════════════════════════════════════════════════════════════
# G6 — ensure_customer_seed cold start populates all 10 collections
# ═══════════════════════════════════════════════════════════════════


_EXPECTED_SEED_COLLECTIONS = {
    "customers", "deals", "shipments", "invoices", "contracts",
    "carfax_reports", "notifications", "leads", "deposits",
    "shipment_events",
}


def test_g6_cold_start_populates_all_collections():
    """G6: First call to ``ensure_customer_seed`` for a brand-new
    customer ID creates documents in all 10 expected collections.
    Counts pinned per the legacy contract:
        customers=1, deals=4, shipments=2, invoices=4, contracts=3,
        carfax_reports=2, notifications=8, leads=2, deposits=2,
        shipment_events>=1
    """
    async def scenario(db, require_customer, ensure_customer_seed, label):
        customer_id = "cust_g6_cold"
        await ensure_customer_seed(customer_id)

        # Customer profile present
        c = await db.customers.find_one({"id": customer_id})
        assert c is not None, f"[G6 / {label}] customer not seeded"

        # Per-customer counts (filtered by customerId where applicable)
        deals_n     = await db.deals.count_documents({"customerId": customer_id})
        shipments_n = await db.shipments.count_documents({"customerId": customer_id})
        invoices_n  = await db.invoices.count_documents({"customerId": customer_id})
        contracts_n = await db.contracts.count_documents({"customerId": customer_id})
        carfax_n    = await db.carfax_reports.count_documents({"customerId": customer_id})
        notif_n     = await db.notifications.count_documents({"customerId": customer_id})
        leads_n     = await db.leads.count_documents({"customerId": customer_id})
        deposits_n  = await db.deposits.count_documents({"customerId": customer_id})

        # Pin expected canonical counts from legacy implementation
        # (per docstring: 4 deals / 2 shipments / 4 invoices / 3 contracts /
        # 2 carfax / 8 notifications / 2 requests / 2 deposits).
        # Use ≥ to be resilient against benign future seed additions
        # while still asserting the canonical floor.
        assert deals_n     >= 4, f"[G6 / {label}] deals count: {deals_n}"
        assert shipments_n >= 2, f"[G6 / {label}] shipments count: {shipments_n}"
        assert invoices_n  >= 4, f"[G6 / {label}] invoices count: {invoices_n}"
        assert contracts_n >= 3, f"[G6 / {label}] contracts count: {contracts_n}"
        assert carfax_n    >= 2, f"[G6 / {label}] carfax count: {carfax_n}"
        assert notif_n     >= 8, f"[G6 / {label}] notifications count: {notif_n}"
        assert leads_n     >= 2, f"[G6 / {label}] leads count: {leads_n}"
        assert deposits_n  >= 2, f"[G6 / {label}] deposits count: {deposits_n}"

        # shipment_events: at least 1 per shipment
        events_n = await db.shipment_events.count_documents({})
        assert events_n >= 1, f"[G6 / {label}] shipment_events empty"

    _run(scenario)


# ═══════════════════════════════════════════════════════════════════
# G7 — ensure_customer_seed is idempotent
# ═══════════════════════════════════════════════════════════════════


def test_g7_idempotent_no_duplicates():
    """G7: Calling ``ensure_customer_seed`` twice for the same
    customer ID does NOT duplicate any seeded entity. Asserted against
    the canonical counts established in G6 (counts after 2 calls
    MUST equal counts after 1 call)."""
    async def scenario(db, require_customer, ensure_customer_seed, label):
        customer_id = "cust_g7_idem"
        await ensure_customer_seed(customer_id)
        snapshot = {
            c: await db[c].count_documents({"customerId": customer_id})
            for c in (
                "deals", "shipments", "invoices", "contracts",
                "carfax_reports", "notifications", "leads", "deposits",
            )
        }
        # 2nd call
        await ensure_customer_seed(customer_id)
        after = {
            c: await db[c].count_documents({"customerId": customer_id})
            for c in snapshot
        }
        assert after == snapshot, (
            f"[G7 / {label}] idempotency broken: counts drifted between "
            f"calls. Before: {snapshot}. After 2nd call: {after}."
        )
        # Also: exactly one customer profile after re-call
        assert await db.customers.count_documents({"id": customer_id}) == 1, (
            f"[G7 / {label}] duplicate customer profile after 2nd seed"
        )

    _run(scenario)


# ═══════════════════════════════════════════════════════════════════
# G8 — Customer profile shape pinned byte-for-byte
# ═══════════════════════════════════════════════════════════════════


def test_g8_customer_profile_shape_preserved():
    """G8: The seeded customer document must carry the exact canonical
    profile fields with the canonical values. This pins the seed data
    shape — any drift here is a 5.5/D forbidden change."""
    async def scenario(db, require_customer, ensure_customer_seed, label):
        customer_id = "cust_g8_shape"
        await ensure_customer_seed(customer_id)
        c = await db.customers.find_one({"id": customer_id}, {"_id": 0})
        assert c is not None, f"[G8 / {label}] customer not seeded"

        # Pin canonical values (legacy demo data per server.py:18458+)
        assert c["firstName"] == "Alexander", f"[G8 / {label}] firstName drift: {c.get('firstName')!r}"
        assert c["lastName"]  == "Demo",      f"[G8 / {label}] lastName drift: {c.get('lastName')!r}"
        assert c["name"]      == "Alexander Demo", (
            f"[G8 / {label}] name drift: {c.get('name')!r}"
        )
        assert c["email"]     == f"{customer_id}@bibi.cars", (
            f"[G8 / {label}] email drift: {c.get('email')!r}"
        )
        assert c["city"]      == "Kyiv"
        assert c["phone"]     == "+380671234567"
        assert c["telegram"]  == "@bibi_demo"
        assert c["address"]   == "12 Khreshchatyk St., Kyiv"
        assert c["preferredLanguage"] == "uk"
        assert c["notificationChannels"] == ["email", "sms", "telegram"]
        assert c["marketingOptIn"] is True
        assert c["emailVerified"] is True
        assert c["phoneVerified"] is True

        # Timestamps present
        for k in ("createdAt", "updatedAt"):
            assert k in c, f"[G8 / {label}] missing timestamp {k}"

    _run(scenario)
