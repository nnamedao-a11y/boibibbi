"""
Sprint 3.5 / Customer Roadmap — POC test script.

Exercises the full lifecycle:
  1. Create roadmap directly via service (simulating order auto-creation).
  2. Verify the public /api/customer-cabinet/.../roadmaps surface.
  3. Advance stages and verify auto-advance behaviour.
  4. Verify SLA breach detection.
  5. Hit the analytics endpoint.
"""
import asyncio
import os
import sys
from datetime import datetime, timedelta, timezone

sys.path.insert(0, "/app/backend")

# Ensure runtime accessors point at the real Mongo connection
os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")
os.environ.setdefault("DB_NAME", "bibi_cars")

from motor.motor_asyncio import AsyncIOMotorClient
from app.core import db_runtime
from app.services import customer_roadmap as roadmap_svc


async def main():
    print("→ Connecting to Mongo …")
    client = AsyncIOMotorClient(os.environ["MONGO_URL"])
    db = client[os.environ["DB_NAME"]]
    db_runtime.set_db(db)
    print("   ✓ connected")

    # Clean previous test data
    await db.customer_roadmaps.delete_many({"customer_id": "test_sprint35_customer"})
    await db.customer_roadmaps.delete_many({"customerId": "test_sprint35_customer"})

    # 1. Create roadmap
    print("\n→ 1. Creating roadmap")
    rm = await roadmap_svc.create_roadmap(
        customer_id="test_sprint35_customer",
        title="BMW X5 — Test journey",
        vehicle={"vin": "5UXTEST12345", "make": "BMW", "model": "X5", "year": 2022},
        invoice_id="inv_test_001",
        order_id="ord_test_001",
        manager_id="mgr_001",
        manager_email="manager@bibi.test",
        initial_stage="delivery_europe",
    )
    assert rm["id"]
    print(f"   ✓ created id={rm['id']}, progress={rm['progress_pct']}%, current={rm['current_stage']}")
    assert rm["current_stage"] == "delivery_europe", rm["current_stage"]
    # vehicle_found + vehicle_purchased pre-marked
    assert rm["stages"][0]["status"] == "done"
    assert rm["stages"][1]["status"] == "done"
    assert rm["stages"][2]["status"] == "in_progress"

    # 2. List customer roadmaps
    print("\n→ 2. Listing customer roadmaps")
    items = await roadmap_svc.list_customer_roadmaps("test_sprint35_customer")
    assert len(items) == 1
    print(f"   ✓ {len(items)} roadmap(s) returned")

    # 3. Advance through stages: delivery_europe → done, then arrived_bulgaria should auto-start
    print("\n→ 3. Advancing stages (auto-advance test)")
    rm2 = await roadmap_svc.update_stage(
        rm["id"], "delivery_europe",
        status="done",
        note_body="Vessel arrived at Varna port",
        updated_by="mgr_001",
        updated_by_email="manager@bibi.test",
    )
    arrived = next(s for s in rm2["stages"] if s["key"] == "arrived_bulgaria")
    assert arrived["status"] == "in_progress", f"expected auto-advance, got {arrived['status']}"
    assert rm2["progress_pct"] > rm["progress_pct"]
    print(f"   ✓ delivery_europe → done; arrived_bulgaria auto-started. progress={rm2['progress_pct']}%")

    # 4. Test SLA breach: set sla_days to 0 then back-date started_at to force breach
    print("\n→ 4. Testing SLA breach detection")
    await db.customer_roadmaps.update_one(
        {"id": rm["id"], "stages.key": "arrived_bulgaria"},
        {"$set": {
            "stages.$.deadline_at": (datetime.now(timezone.utc) - timedelta(days=1)).isoformat(),
        }},
    )
    rm3 = await roadmap_svc.get_roadmap(rm["id"])
    arrived = next(s for s in rm3["stages"] if s["key"] == "arrived_bulgaria")
    assert arrived["sla_breached"] is True, "SLA breach should be detected"
    print(f"   ✓ SLA breach flagged on arrived_bulgaria")

    # 5. Block a stage
    print("\n→ 5. Blocking adaptation stage")
    rm4 = await roadmap_svc.update_stage(
        rm["id"], "adaptation",
        status="blocked",
        note_body="Waiting for client documents",
    )
    adapt = next(s for s in rm4["stages"] if s["key"] == "adaptation")
    assert adapt["status"] == "blocked"
    print(f"   ✓ adaptation blocked; overall_status={rm4['status']}")

    # 6. Analytics summary
    print("\n→ 6. Running analytics summary")
    summary = await roadmap_svc.analytics_summary()
    print(f"   ✓ total={summary['total']}, completed={summary['completed']}, in_progress={summary['in_progress']}, breaches={summary['sla_breaches']}")
    assert summary["total"] >= 1

    # 7. Soft delete
    print("\n→ 7. Soft-delete (cancel) test")
    ok = await roadmap_svc.delete_roadmap(rm["id"])
    assert ok
    final = await roadmap_svc.get_roadmap(rm["id"])
    assert final["status"] == "cancelled"
    print(f"   ✓ roadmap cancelled (status={final['status']})")

    # Clean up
    await db.customer_roadmaps.delete_many({"id": rm["id"]})

    # 8. Test auto-create from order (idempotency)
    print("\n→ 8. Auto-create-from-order (idempotency check)")
    order = {
        "id": "ord_idemp_001",
        "managerId": "mgr_001",
        "managerEmail": "manager@bibi.test",
        "items": [{"name": "BMW X5 import service"}],
    }
    invoice = {"id": "inv_idemp_001", "vin": "WBATEST98765", "customerId": "test_sprint35_customer"}
    r1 = await roadmap_svc.auto_create_from_order(
        customer_id="test_sprint35_customer",
        order=order,
        invoice=invoice,
    )
    r2 = await roadmap_svc.auto_create_from_order(
        customer_id="test_sprint35_customer",
        order=order,
        invoice=invoice,
    )
    assert r1["id"] == r2["id"], "auto_create must be idempotent"
    print(f"   ✓ idempotent — same id={r1['id']} on second call")

    await db.customer_roadmaps.delete_many({"customer_id": "test_sprint35_customer"})
    await db.customer_roadmaps.delete_many({"customerId": "test_sprint35_customer"})

    print("\n🎉 ALL SPRINT 3.5 TESTS PASSED")


if __name__ == "__main__":
    asyncio.run(main())
