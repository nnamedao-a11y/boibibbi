"""
Block 1 — HTTP-level E2E test for Workflow Binding.

Drives the LIVE API to verify the binding from admin Service UI through
to Order step generation.
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
from motor.motor_asyncio import AsyncIOMotorClient  # noqa: E402

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
log = logging.getLogger("block1_http")

BASE = "http://localhost:8001"


async def get_admin_jwt(db, client: httpx.AsyncClient) -> str:
    """Seed a master_admin user (if missing) and get a JWT."""
    import bcrypt
    email = f"block1_admin_{uuid.uuid4().hex[:6]}@test.local"
    password = "BlockOne!23"
    # Hash via bcrypt (matches security.py)
    pwd_hash = bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()
    await db.staff.insert_one({
        "id": f"staff_{uuid.uuid4().hex[:8]}",
        "email": email,
        "password_hash": pwd_hash,
        "name": "Block1 Admin",
        "role": "master_admin",
        "is_active": True,
    })
    # Try login
    r = await client.post(f"{BASE}/api/auth/login", json={"email": email, "password": password})
    log.info("Login status: %s", r.status_code)
    if r.status_code != 200:
        log.error("Login response: %s", r.text[:500])
        raise RuntimeError("Login failed")
    return r.json().get("token") or r.json().get("access_token")


async def main():
    client_mongo = AsyncIOMotorClient(os.environ["MONGO_URL"])
    db = client_mongo[os.environ["DB_NAME"]]

    async with httpx.AsyncClient(timeout=15.0) as client:
        # ── Step 1: Login as master_admin ─────────────────────────────
        token = await get_admin_jwt(db, client)
        headers = {"Authorization": f"Bearer {token}"}
        log.info("✅ Got admin JWT")

        # ── Step 2: List templates ─────────────────────────────────────
        r = await client.get(f"{BASE}/api/admin/workflow-templates", headers=headers)
        assert r.status_code == 200, r.text
        templates = r.json()["items"]
        log.info("Got %d templates", len(templates))
        tpl = next((t for t in templates if t.get("category") == "import_korea"), templates[0])
        log.info("Using template %s (%s, %d steps)", tpl["id"], tpl["name"], len(tpl["steps"]))

        # ── Step 3: Create service WITH workflow_template_id ──────────
        svc_payload = {
            "name": "Block1 E2E Service",
            "code": f"block1_{uuid.uuid4().hex[:6]}",
            "category": "import",
            "default_price": 1000,
            "currency": "USD",
            "workflow_template_id": tpl["id"],
            "workflow": [],  # empty inline; should be IGNORED in favour of template
        }
        r = await client.post(f"{BASE}/api/admin/services", json=svc_payload, headers=headers)
        assert r.status_code == 200, r.text
        svc = r.json()["service"]
        assert svc.get("workflow_template_id") == tpl["id"], \
            f"Service did not persist workflow_template_id: {svc}"
        log.info("✅ Service created with workflow_template_id=%s", svc["workflow_template_id"])

        # ── Step 4: Create a customer ─────────────────────────────────
        cust_id = f"cust_block1_{uuid.uuid4().hex[:6]}"
        await db.customers.insert_one({
            "id": cust_id,
            "firstName": "Block1",
            "lastName": "Test",
            "email": f"block1cust_{uuid.uuid4().hex[:4]}@test.local",
            "phone": "+359888000000",
            "status": "active",
            "managerId": "test_mgr",
        })

        # ── Step 5: Create invoice via manager API ────────────────────
        inv_payload = {
            "customerId": cust_id,
            "currency": "USD",
            "items": [
                {"service_id": svc["id"], "qty": 1, "price": 1000},
            ],
        }
        r = await client.post(f"{BASE}/api/manager/invoices", json=inv_payload, headers=headers)
        assert r.status_code == 200, r.text
        invoice = r.json()["invoice"]
        item = invoice["items"][0]
        log.info("Invoice item workflow has %d steps; template has %d steps",
                 len(item["workflow"]), len(tpl["steps"]))
        assert len(item["workflow"]) == len(tpl["steps"]), \
            f"Workflow steps mismatch: {len(item['workflow'])} vs {len(tpl['steps'])}"
        assert item.get("workflow_template_id") == tpl["id"]
        log.info("✅ Invoice item has correct %d steps from template", len(item["workflow"]))

        # ── Step 6: Patch service to UNBIND template ───────────────────
        r = await client.patch(
            f"{BASE}/api/admin/services/{svc['id']}",
            json={"workflow_template_id": None, "workflow": [
                {"key": "custom_a", "label": "Custom A"},
                {"key": "custom_b", "label": "Custom B"},
            ]},
            headers=headers,
        )
        assert r.status_code == 200, r.text
        updated = r.json()["service"]
        assert updated.get("workflow_template_id") is None
        log.info("✅ Service unbound from template")

        # ── Step 7: Create second invoice — should use inline custom ──
        r = await client.post(f"{BASE}/api/manager/invoices", json=inv_payload, headers=headers)
        assert r.status_code == 200, r.text
        invoice2 = r.json()["invoice"]
        item2 = invoice2["items"][0]
        assert len(item2["workflow"]) == 2, f"Expected 2 custom steps, got {len(item2['workflow'])}"
        assert item2["workflow"][0]["key"] == "custom_a"
        log.info("✅ Unbound service uses inline custom workflow (%d steps)", len(item2["workflow"]))

        # ── Cleanup ───────────────────────────────────────────────────
        await db.services.delete_one({"id": svc["id"]})
        await db.customers.delete_one({"id": cust_id})
        await db.invoices.delete_many({"customerId": cust_id})
        await db.orders.delete_many({"customerId": cust_id})

    print("\n" + "=" * 70)
    print("✅ BLOCK 1 HTTP E2E — Workflow Binding works end-to-end!")
    print("=" * 70)
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
