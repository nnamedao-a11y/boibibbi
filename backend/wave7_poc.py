"""
Wave 7 POC — Manual Workload Rebalancing
==========================================

Runs against the live MongoDB connection from /app/backend/.env and validates:

  1. reassignment_service.reassign() works for lead/customer/deal (bulk).
  2. ACL: admin → ok, team_lead within team → ok, cross-team → 403,
          manager → 403.
  3. Audit: every successful per-id reassignment writes a row into
     ``db.reassignments``.
  4. Deal timeline: deal reassignment appends an ``owner_changed`` event.
  5. Idempotent: reassigning to same manager returns ok with noChange=True
     and DOES NOT write an audit row.
  6. get_managers_with_workload() returns the correct shape and counts.

Run: `cd /app/backend && python -m wave7_poc`
"""
from __future__ import annotations

import asyncio
import os
import sys
import traceback
from datetime import datetime, timezone

from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient

# Make sure we can import app.* from /app/backend
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.services import reassignment as rs  # noqa: E402

load_dotenv("/app/backend/.env")

MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "bibi_cars")

# Scope all test docs under a unique tag so we can clean up safely.
TAG = f"wave7_poc_{int(datetime.now(timezone.utc).timestamp())}"


def _ok(label: str) -> None:
    print(f"  ✓ {label}")


def _fail(label: str, err: Exception | str) -> None:
    print(f"  ✗ {label}: {err}")
    raise AssertionError(label)


async def _seed(db) -> dict:
    """Insert minimal staff + entities for the test. All carry ``_tag = TAG``."""
    now = datetime.now(timezone.utc).isoformat()

    staff = [
        # team A
        {"id": f"{TAG}_admin",   "name": "Admin",   "email": f"{TAG}_admin@x",   "role": "admin",     "is_active": True, "teamId": None, "_tag": TAG},
        {"id": f"{TAG}_tlA",     "name": "TL-A",    "email": f"{TAG}_tla@x",     "role": "team_lead", "is_active": True, "teamId": "team_a", "_tag": TAG},
        {"id": f"{TAG}_mA1",     "name": "MgrA1",   "email": f"{TAG}_ma1@x",     "role": "manager",   "is_active": True, "teamId": "team_a", "_tag": TAG},
        {"id": f"{TAG}_mA2",     "name": "MgrA2",   "email": f"{TAG}_ma2@x",     "role": "manager",   "is_active": True, "teamId": "team_a", "_tag": TAG},
        # team B
        {"id": f"{TAG}_mB1",     "name": "MgrB1",   "email": f"{TAG}_mb1@x",     "role": "manager",   "is_active": True, "teamId": "team_b", "_tag": TAG},
        # rogue manager (used to test 403)
        {"id": f"{TAG}_mRogue",  "name": "MgrRogue","email": f"{TAG}_rogue@x",   "role": "manager",   "is_active": True, "teamId": "team_a", "_tag": TAG},
    ]
    await db.staff.insert_many(staff)

    leads = [
        {"id": f"{TAG}_lead_1", "name": "Lead 1", "email": "l1@x", "status": "new",       "managerId": f"{TAG}_mA1", "_tag": TAG, "created_at": now},
        {"id": f"{TAG}_lead_2", "name": "Lead 2", "email": "l2@x", "status": "contacted", "managerId": f"{TAG}_mA1", "_tag": TAG, "created_at": now},
        {"id": f"{TAG}_lead_3", "name": "Lead 3", "email": "l3@x", "status": "archived",  "managerId": f"{TAG}_mA1", "_tag": TAG, "created_at": now},
    ]
    await db.leads.insert_many(leads)

    customers = [
        {"id": f"{TAG}_cust_1", "name": "Cust 1", "email": "c1@x", "managerId": f"{TAG}_mA1", "_tag": TAG, "created_at": now},
        {"id": f"{TAG}_cust_2", "name": "Cust 2", "email": "c2@x",                              "_tag": TAG, "created_at": now},
    ]
    await db.customers.insert_many(customers)

    deals = [
        {"id": f"{TAG}_deal_1", "title": "Deal 1", "status": "new",            "managerId": f"{TAG}_mA1", "_tag": TAG, "created_at": now},
        {"id": f"{TAG}_deal_2", "title": "Deal 2", "status": "in_progress",    "managerId": f"{TAG}_mA1", "_tag": TAG, "created_at": now},
    ]
    await db.deals.insert_many(deals)

    # A few tasks for workload calc
    tasks = [
        {"id": f"{TAG}_t1", "assigneeId": f"{TAG}_mA1", "status": "open",      "_tag": TAG},
        {"id": f"{TAG}_t2", "assigneeId": f"{TAG}_mA1", "status": "done",      "_tag": TAG},
        {"id": f"{TAG}_t3", "assigneeId": f"{TAG}_mA2", "status": "open",      "_tag": TAG},
    ]
    await db.tasks.insert_many(tasks)

    return {
        "leads":     [d["id"] for d in leads],
        "customers": [d["id"] for d in customers],
        "deals":     [d["id"] for d in deals],
    }


async def _cleanup(db) -> None:
    for coll in ("staff", "leads", "customers", "deals", "tasks",
                 "reassignments", "deal_timeline"):
        # reassignments / deal_timeline rows don't carry _tag — clean by ids
        if coll == "reassignments":
            await db[coll].delete_many({"performedByEmail": {"$regex": TAG}})
            await db[coll].delete_many({"entityId": {"$regex": TAG}})
        elif coll == "deal_timeline":
            await db[coll].delete_many({"deal_id": {"$regex": TAG}})
        else:
            await db[coll].delete_many({"_tag": TAG})


# ---------------------------------------------------------------------------
# Test cases
# ---------------------------------------------------------------------------
async def test_admin_bulk_reassign_leads(db, ids):
    actor = {"id": f"{TAG}_admin", "email": f"{TAG}_admin@x", "role": "admin"}
    res = await rs.reassign(
        db, entity="lead", ids=ids["leads"],
        to_manager_id=f"{TAG}_mA2", reason="POC bulk",
        actor=actor,
    )
    assert res["success"] is True, res
    assert res["processed"] == 3, f"expected 3 processed, got {res}"
    # All 3 leads now point to mA2
    docs = await db.leads.find({"_tag": TAG}, {"_id": 0, "id": 1, "managerId": 1}).to_list(10)
    for d in docs:
        assert d["managerId"] == f"{TAG}_mA2", d
    # 3 audit rows written
    audit_n = await db.reassignments.count_documents({"entityId": {"$regex": f"{TAG}_lead_"}, "toManagerId": f"{TAG}_mA2"})
    assert audit_n == 3, f"expected 3 audit rows, got {audit_n}"
    _ok("admin bulk reassign 3 leads → mA2 (3 processed, 3 audit rows)")


async def test_admin_reassign_customer(db, ids):
    actor = {"id": f"{TAG}_admin", "email": f"{TAG}_admin@x", "role": "admin"}
    res = await rs.reassign(
        db, entity="customer", ids=ids["customers"],
        to_manager_id=f"{TAG}_mB1", reason="customer test",
        actor=actor,
    )
    assert res["processed"] == 2, res
    docs = await db.customers.find({"_tag": TAG}, {"_id": 0, "managerId": 1}).to_list(10)
    for d in docs:
        assert d["managerId"] == f"{TAG}_mB1", d
    _ok("admin reassign 2 customers (cust_2 had no manager) → mB1")


async def test_admin_reassign_deal_writes_timeline(db, ids):
    actor = {"id": f"{TAG}_admin", "email": f"{TAG}_admin@x", "role": "admin"}
    res = await rs.reassign(
        db, entity="deal", ids=ids["deals"],
        to_manager_id=f"{TAG}_mA2", reason="quarterly rebalance",
        actor=actor,
    )
    assert res["processed"] == 2, res
    tl_n = await db.deal_timeline.count_documents({
        "deal_id": {"$regex": f"{TAG}_deal_"},
        "event_type": "owner_changed",
    })
    assert tl_n == 2, f"expected 2 timeline events, got {tl_n}"
    one = await db.deal_timeline.find_one({"deal_id": {"$regex": f"{TAG}_deal_"}, "event_type": "owner_changed"})
    assert "Owner changed from" in (one or {}).get("message", ""), one
    _ok("admin reassign 2 deals → timeline events written")


async def test_team_lead_within_team_ok(db, ids):
    # team_lead A reassigns within team A (mA2 → mA1)
    actor = {"id": f"{TAG}_tlA", "email": f"{TAG}_tla@x", "role": "team_lead", "teamId": "team_a"}
    # First flip lead_1 to mA2 (already done by prev test). Move to mA1.
    res = await rs.reassign(
        db, entity="lead", ids=[f"{TAG}_lead_1"],
        to_manager_id=f"{TAG}_mA1", reason="tl within team",
        actor=actor,
    )
    assert res["success"] is True and res["processed"] == 1, res
    _ok("team_lead reassigns lead within team_a → ok")


async def test_team_lead_cross_team_blocked(db, ids):
    actor = {"id": f"{TAG}_tlA", "email": f"{TAG}_tla@x", "role": "team_lead", "teamId": "team_a"}
    # Attempt cross-team to mB1
    res = await rs.reassign(
        db, entity="lead", ids=[f"{TAG}_lead_2"],
        to_manager_id=f"{TAG}_mB1", reason="should fail",
        actor=actor,
    )
    # Per-id failure (not raise) — failed=1
    assert res["failed"] == 1 and res["processed"] == 0, res
    assert "team" in str(res["results"][0]["error"]).lower(), res["results"][0]
    _ok("team_lead cross-team blocked (per-id 403)")


async def test_manager_role_blocked(db, ids):
    actor = {"id": f"{TAG}_mA1", "email": f"{TAG}_ma1@x", "role": "manager", "teamId": "team_a"}
    try:
        await rs.reassign(
            db, entity="lead", ids=[f"{TAG}_lead_1"],
            to_manager_id=f"{TAG}_mA2", reason="should be blocked",
            actor=actor,
        )
        _fail("manager role should raise 403", "but did not")
    except Exception as e:
        assert "403" in str(getattr(e, "status_code", "")) or "Only admin" in str(getattr(e, "detail", e)), e
    _ok("manager role gets 403")


async def test_idempotent_no_change(db, ids):
    actor = {"id": f"{TAG}_admin", "email": f"{TAG}_admin@x", "role": "admin"}
    audit_before = await db.reassignments.count_documents({"entityId": f"{TAG}_lead_1"})
    # lead_1 currently mA1. Reassign again to mA1 → no_change=1, no new audit.
    res = await rs.reassign(
        db, entity="lead", ids=[f"{TAG}_lead_1"],
        to_manager_id=f"{TAG}_mA1", reason="idempotent",
        actor=actor,
    )
    assert res["no_change"] == 1 and res["processed"] == 0, res
    audit_after = await db.reassignments.count_documents({"entityId": f"{TAG}_lead_1"})
    assert audit_before == audit_after, f"audit must NOT grow on no-change: {audit_before} → {audit_after}"
    _ok("idempotent reassign (no_change=1, no new audit row)")


async def test_workload_payload(db):
    actor = {"id": f"{TAG}_admin", "email": f"{TAG}_admin@x", "role": "admin"}
    items = await rs.get_managers_with_workload(db, actor=actor)
    # We expect the test staff to be in the result (mA1, mA2, mB1, mRogue, tlA)
    ids_in = {x["id"] for x in items if x["id"].startswith(TAG)}
    assert ids_in >= {f"{TAG}_mA1", f"{TAG}_mA2", f"{TAG}_mB1", f"{TAG}_tlA"}, ids_in
    # mA1 should have leads/deals counted (after prior tests: 1 active lead + 0 deals + 1 task active)
    mA1 = next(x for x in items if x["id"] == f"{TAG}_mA1")
    assert mA1["activeLeads"] >= 1, mA1
    assert mA1["loadScore"] >= 1.0, mA1
    assert "isAvailable" in mA1
    _ok(f"workload payload returns enriched managers (mA1 loadScore={mA1['loadScore']})")


async def test_team_lead_sees_only_own_team(db):
    actor = {"id": f"{TAG}_tlA", "email": f"{TAG}_tla@x", "role": "team_lead", "teamId": "team_a"}
    items = await rs.get_managers_with_workload(db, actor=actor)
    teams = {x["teamId"] for x in items if x["id"].startswith(TAG)}
    assert teams == {"team_a"}, f"team_lead must see only own team, got: {teams}"
    _ok("team_lead sees only own team in workload list")


# ---------------------------------------------------------------------------
async def main() -> int:
    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]
    print(f"\n[WAVE 7 POC] db={DB_NAME} TAG={TAG}")
    try:
        ids = await _seed(db)
        await test_admin_bulk_reassign_leads(db, ids)
        await test_admin_reassign_customer(db, ids)
        await test_admin_reassign_deal_writes_timeline(db, ids)
        await test_team_lead_within_team_ok(db, ids)
        await test_team_lead_cross_team_blocked(db, ids)
        await test_manager_role_blocked(db, ids)
        await test_idempotent_no_change(db, ids)
        await test_workload_payload(db)
        await test_team_lead_sees_only_own_team(db)
        print("\n[WAVE 7 POC] ✅ ALL TESTS PASSED")
        return 0
    except Exception:
        traceback.print_exc()
        print("\n[WAVE 7 POC] ❌ FAILED")
        return 1
    finally:
        try:
            await _cleanup(db)
            print(f"[WAVE 7 POC] cleanup done (TAG={TAG})")
        except Exception as e:
            print(f"[WAVE 7 POC] cleanup warning: {e}")
        client.close()


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
