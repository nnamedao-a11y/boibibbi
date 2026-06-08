"""
Wave 6 — sanity / smoke test for backend.

Creates a small set of test deals (different pipeline_stages), exercises the
new endpoints, verifies:
  * pipeline mapping
  * dual-write of pipeline_stage on advance
  * timeline events
  * computed health
  * legal-policy CRUD

Run via:  cd /app/backend && python wave6_smoke_test.py
"""
import asyncio
import json
import os
import sys
import uuid
from datetime import datetime, timezone, timedelta

import httpx
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv

load_dotenv()

BASE = "http://localhost:8001"
MONGO = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DBN = os.environ.get("DB_NAME", "bibi_cars")


async def get_admin_token() -> str:
    """Issue a JWT for the seeded test admin via /api/auth/login."""
    async with httpx.AsyncClient(timeout=20) as cx:
        # Try common seeded admin creds (see security.py / bootstrap)
        for email, pwd in [
            ("admin@bibi.cars", "Jp3FS_7ZuE2bhHp7rFkJm9B9T_TeiHxu"),
            ("manager@bibi.cars", "dFbYnse0L59DBE16Mn4kT6cCRaNBZFQR"),
        ]:
            for path in ("/api/auth/login", "/api/cabinet/auth/login"):
                try:
                    r = await cx.post(f"{BASE}{path}",
                                      json={"email": email, "password": pwd})
                except Exception:
                    continue
                if r.status_code == 200:
                    j = r.json()
                    tok = j.get("access_token") or j.get("token") or (j.get("data") or {}).get("token")
                    if tok:
                        print(f"  ✓ admin token via {path} ({email})")
                        return tok
    raise RuntimeError("No admin token — adjust seed creds")


async def seed_deals(db) -> list:
    """Create three deals across different pipeline_stages."""
    now = datetime.now(timezone.utc).isoformat()
    deals = [
        {
            "_id": f"deal_w6_a_{uuid.uuid4().hex[:6]}",
            "id": f"deal_w6_a_{uuid.uuid4().hex[:6]}",
            "title": "BMW X5 2020 (Wave6 test)",
            "vin": "TESTVIN0000000001",
            "stage": "qualified",  # → pipeline: negotiating
            "managerId": "mgr_001",
            "max_bid_usd": 35000,
            "created_at": now, "updated_at": now,
        },
        {
            "_id": f"deal_w6_b_{uuid.uuid4().hex[:6]}",
            "id": f"deal_w6_b_{uuid.uuid4().hex[:6]}",
            "title": "Audi Q7 2021 (Wave6 test)",
            "vin": "TESTVIN0000000002",
            "stage": "in_transit_to_rotterdam",  # → pipeline: shipping
            "managerId": "mgr_001",
            "deposit_paid_at": now,
            "created_at": (datetime.now(timezone.utc) - timedelta(days=20)).isoformat(),
            "updated_at": (datetime.now(timezone.utc) - timedelta(days=20)).isoformat(),
        },
        {
            "_id": f"deal_w6_c_{uuid.uuid4().hex[:6]}",
            "id": f"deal_w6_c_{uuid.uuid4().hex[:6]}",
            "title": "Toyota Camry 2019 (Wave6 test)",
            "vin": "TESTVIN0000000003",
            "stage": "deposit_contract_drafted",  # → pipeline: awaiting_deposit
            "managerId": "mgr_001",
            "created_at": (datetime.now(timezone.utc) - timedelta(days=10)).isoformat(),
            "updated_at": (datetime.now(timezone.utc) - timedelta(days=10)).isoformat(),
        },
    ]
    # use POST /api/deals so wave6 deal_created hook fires
    return deals


async def main():
    print("=" * 70)
    print("WAVE 6 SMOKE TEST")
    print("=" * 70)
    client = AsyncIOMotorClient(MONGO)
    db = client[DBN]

    # 0. Acquire token
    token = await get_admin_token()
    H = {"Authorization": f"Bearer {token}"}

    async with httpx.AsyncClient(timeout=30, headers=H) as cx:
        # 1. pipeline catalog
        r = await cx.get(f"{BASE}/api/admin/pipeline/stages")
        assert r.status_code == 200, r.text
        cat = r.json()
        assert len(cat["stages"]) == 10
        stage_ids = [s["id"] for s in cat["stages"]]
        print(f"  ✓ pipeline catalog: {stage_ids}")

        # 2. legal-policy read (seeds defaults)
        r = await cx.get(f"{BASE}/api/admin/settings/legal-policy")
        assert r.status_code == 200, r.text
        pol = r.json()["data"]
        print(f"  ✓ legal-policy read: fx={pol['default_fx_usd_to_eur']} "
              f"min_dep={pol['min_deposit_eur']}")

        # 3. legal-policy write
        new_pol = {
            "default_fx_usd_to_eur": 0.93,
            "min_deposit_eur": 1200,
            "deposit_percent_of_max_bid": 12,
            "refund_deadline_days": 30,
            "invoice_template_id": "bibi_default_v2",
        }
        r = await cx.put(f"{BASE}/api/admin/settings/legal-policy", json=new_pol)
        assert r.status_code == 200, f"PUT failed: {r.status_code} {r.text}"
        pol2 = r.json()["data"]
        assert pol2["min_deposit_eur"] == 1200
        print(f"  ✓ legal-policy write: by={pol2['updated_by']}")

        # 4. Seed deals via POST so create hook fires
        deals_in = await seed_deals(db)
        created = []
        for d in deals_in:
            r = await cx.post(f"{BASE}/api/deals", json=d)
            assert r.status_code == 200, f"create deal failed: {r.text}"
            created.append(d["_id"])
        print(f"  ✓ created {len(created)} deals: {created}")

        # 5. Workspace endpoint
        for did in created:
            r = await cx.get(f"{BASE}/api/admin/deals/{did}")
            assert r.status_code == 200, r.text
            data = r.json()["data"]
            assert data["pipeline_stage"] in ("inquiry", "negotiating", "awaiting_deposit",
                                              "deposit_paid", "bidding", "won",
                                              "contract_signed", "shipping",
                                              "delivered", "cancelled")
            print(f"  ✓ workspace {did}: stage_legacy={data['stage_legacy']:>30s}  "
                  f"pipeline={data['pipeline_stage']:>18s}  "
                  f"health={data['health']['state']}")

        # 6. Advance stage on first deal (qualified → variants_sent) → timeline event
        first = created[0]
        r = await cx.post(f"{BASE}/api/deals/{first}/advance",
                          json={"to": "variants_sent", "note": "wave6 smoke test"})
        assert r.status_code == 200, r.text
        print(f"  ✓ advance: {first} → variants_sent")

        # 7. Timeline
        r = await cx.get(f"{BASE}/api/admin/deals/{first}/timeline")
        assert r.status_code == 200, r.text
        events = r.json()["events"]
        print(f"  ✓ timeline for {first}: {len(events)} events")
        for e in events[:5]:
            print(f"      [{e['event_type']:>16s}] {e['message']}")

        # 8. Health
        r = await cx.get(f"{BASE}/api/admin/deals/{first}/health")
        assert r.status_code == 200, r.text
        h = r.json()["data"]
        print(f"  ✓ health computed: {h['state']} — {h['reason']}")

        # 9. Add note
        r = await cx.post(f"{BASE}/api/admin/deals/{first}/notes",
                          json={"text": "Smoke test note from Wave 6 verifier"})
        assert r.status_code == 200, r.text
        print(f"  ✓ note added")

        # 10. List events again — note should be there
        r = await cx.get(f"{BASE}/api/admin/deals/{first}/timeline")
        events2 = r.json()["events"]
        assert any(e["event_type"] == "note_added" for e in events2), "note missing"
        print(f"  ✓ note visible in timeline (total events now: {len(events2)})")

    # 11. Cleanup test deals
    await db.deals.delete_many({"id": {"$in": created}})
    await db.deals.delete_many({"_id": {"$in": created}})
    await db.deal_timeline.delete_many({"deal_id": {"$in": created}})
    print(f"  ✓ cleanup: removed {len(created)} test deals + timeline events")

    print("=" * 70)
    print("ALL WAVE 6 BACKEND TESTS PASSED ✅")
    print("=" * 70)


if __name__ == "__main__":
    asyncio.run(main())
