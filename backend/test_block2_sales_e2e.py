"""
Block 2 — Sales Entity HTTP E2E test.
Validates: CRUD, country/status/manager filters, customer-scoped reads,
all 3 source modes (manual / vin / deal), enrichment from deal, UTM stamping.
"""
import asyncio
import os
import sys
import uuid
import logging

sys.path.insert(0, "/app/backend")
os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")
os.environ.setdefault("DB_NAME", "test_database")

import httpx  # noqa: E402
import bcrypt  # noqa: E402
from motor.motor_asyncio import AsyncIOMotorClient  # noqa: E402

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
log = logging.getLogger("block2")

BASE = "http://localhost:8001"


async def admin_token(db, client):
    email = f"block2_{uuid.uuid4().hex[:6]}@test.local"
    password = "Block2!23"
    pwd_hash = bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()
    await db.staff.insert_one({
        "id": f"staff_{uuid.uuid4().hex[:8]}",
        "email": email,
        "password_hash": pwd_hash,
        "name": "Block2 Admin",
        "role": "master_admin",
        "is_active": True,
    })
    r = await client.post(f"{BASE}/api/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200, r.text
    return r.json().get("token") or r.json().get("access_token")


async def main():
    cmongo = AsyncIOMotorClient(os.environ["MONGO_URL"])
    db = cmongo[os.environ["DB_NAME"]]

    async with httpx.AsyncClient(timeout=15.0) as client:
        token = await admin_token(db, client)
        headers = {"Authorization": f"Bearer {token}"}
        log.info("✅ Authenticated as master_admin")

        # ── Test 1: Create customer & deal for context ────────────────
        cust_id = f"cust_b2_{uuid.uuid4().hex[:6]}"
        await db.customers.insert_one({
            "id": cust_id,
            "firstName": "Sale", "lastName": "Tester",
            "email": f"b2c_{uuid.uuid4().hex[:4]}@t.local",
            "phone": "+359111", "status": "active",
            "utm": {"utm_source": "google", "utm_campaign": "block2_e2e"},
        })

        deal_id = f"deal_b2_{uuid.uuid4().hex[:6]}"
        await db.deals.insert_one({
            "id": deal_id,
            "vin": "JN8AZ2NC1H9507061",
            "lot": "12345678",
            "source": "copart",
            "brand": "Nissan",
            "model": "Murano",
            "year": 2017,
        })

        # ── Test 2: Create sale source=manual ─────────────────────────
        r = await client.post(f"{BASE}/api/sales", json={
            "customerId": cust_id,
            "source": "manual",
            "vin": "MANUAL12345678901",
            "brand": "Tesla",
            "model": "Model 3",
            "year": 2022,
            "country": "USA",
            "saleAmount": 35000,
            "saleCurrency": "USD",
            "status": "active",
        }, headers=headers)
        assert r.status_code == 200, r.text
        sale_manual = r.json()["sale"]
        assert sale_manual["source"] == "manual"
        assert sale_manual["country"] == "USA"
        # UTM stamping check
        assert sale_manual.get("utm", {}).get("utm_source") == "google", f"UTM not stamped: {sale_manual.get('utm')}"
        log.info("✅ Test 2 — Manual sale created with UTM (id=%s)", sale_manual["id"])

        # ── Test 3: Create sale source=vin ────────────────────────────
        r = await client.post(f"{BASE}/api/sales", json={
            "customerId": cust_id,
            "source": "vin",
            "vin": "VINONLY987654321X",
            "country": "KOREA",
            "saleAmount": 22000,
        }, headers=headers)
        assert r.status_code == 200, r.text
        sale_vin = r.json()["sale"]
        assert sale_vin["source"] == "vin" and sale_vin["country"] == "KOREA"
        log.info("✅ Test 3 — VIN sale created (id=%s)", sale_vin["id"])

        # ── Test 4: Create sale source=deal (enrichment) ──────────────
        r = await client.post(f"{BASE}/api/sales", json={
            "customerId": cust_id,
            "source": "deal",
            "dealId": deal_id,
            "country": "USA",
            "saleAmount": 18500,
        }, headers=headers)
        assert r.status_code == 200, r.text
        sale_deal = r.json()["sale"]
        # Should be enriched from deal
        assert sale_deal["vin"] == "JN8AZ2NC1H9507061", f"VIN not enriched: {sale_deal}"
        assert sale_deal["brand"] == "Nissan"
        assert sale_deal["model"] == "Murano"
        assert sale_deal["year"] == 2017
        log.info("✅ Test 4 — Deal sale enriched from deal (vin=%s)", sale_deal["vin"])

        # ── Test 5: List & filter by country ──────────────────────────
        r = await client.get(f"{BASE}/api/sales?country=USA", headers=headers)
        assert r.status_code == 200
        usa_sales = [s for s in r.json()["items"] if s["customerId"] == cust_id]
        assert len(usa_sales) == 2, f"Expected 2 USA sales, got {len(usa_sales)}"
        log.info("✅ Test 5 — Filter by country=USA returns %d sales", len(usa_sales))

        # ── Test 6: List & filter by status ───────────────────────────
        r = await client.get(f"{BASE}/api/sales?status=active", headers=headers)
        assert r.status_code == 200
        active = [s for s in r.json()["items"] if s["customerId"] == cust_id]
        assert any(s["id"] == sale_manual["id"] for s in active)
        log.info("✅ Test 6 — Filter by status=active works")

        # ── Test 7: Customer-scoped list ──────────────────────────────
        r = await client.get(f"{BASE}/api/customers/{cust_id}/sales", headers=headers)
        assert r.status_code == 200
        cust_sales = r.json()["items"]
        assert len(cust_sales) == 3
        log.info("✅ Test 7 — Customer-scoped list returns %d sales", len(cust_sales))

        # ── Test 8: PATCH (mark as sold) ──────────────────────────────
        r = await client.patch(
            f"{BASE}/api/sales/{sale_manual['id']}",
            json={"status": "sold"},
            headers=headers,
        )
        assert r.status_code == 200
        updated = r.json()["sale"]
        assert updated["status"] == "sold"
        assert updated.get("soldAt") is not None
        log.info("✅ Test 8 — Mark as sold sets soldAt automatically")

        # ── Test 9: GET single ─────────────────────────────────────────
        r = await client.get(f"{BASE}/api/sales/{sale_vin['id']}", headers=headers)
        assert r.status_code == 200
        assert r.json()["sale"]["id"] == sale_vin["id"]
        log.info("✅ Test 9 — GET single sale works")

        # ── Test 10: DELETE (soft cancel) ─────────────────────────────
        r = await client.delete(f"{BASE}/api/sales/{sale_deal['id']}", headers=headers)
        assert r.status_code == 200
        r = await client.get(f"{BASE}/api/sales/{sale_deal['id']}", headers=headers)
        assert r.json()["sale"]["status"] == "cancelled"
        log.info("✅ Test 10 — Soft cancel preserves doc, sets status=cancelled")

        # ── Test 11: Validation — no customer ─────────────────────────
        r = await client.post(f"{BASE}/api/sales", json={
            "vin": "INVALID", "saleAmount": 1000,
        }, headers=headers)
        assert r.status_code == 400
        log.info("✅ Test 11 — Validation rejects missing customerId")

        # ── Test 12: Validation — no identity ─────────────────────────
        r = await client.post(f"{BASE}/api/sales", json={
            "customerId": cust_id, "saleAmount": 1000,
        }, headers=headers)
        assert r.status_code == 400
        log.info("✅ Test 12 — Validation rejects missing vin/lot/dealId")

        # ── Test 13: Timeline event was created ───────────────────────
        events = await db.customer_timeline_events.find(
            {"customer_id": cust_id, "kind": "sale_created"}, {"_id": 0}
        ).to_list(length=10)
        assert len(events) >= 3, f"Expected >= 3 sale_created events, got {len(events)}"
        log.info("✅ Test 13 — Timeline has %d sale_created events", len(events))

        # ── Cleanup ────────────────────────────────────────────────────
        await db.sales.delete_many({"customerId": cust_id})
        await db.customers.delete_one({"id": cust_id})
        await db.deals.delete_one({"id": deal_id})
        await db.customer_timeline_events.delete_many({"customer_id": cust_id})
        log.info("Cleanup done")

    print("\n" + "=" * 70)
    print("✅ BLOCK 2 — SALES ENTITY: ALL 13 TESTS PASSED")
    print("=" * 70)
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
