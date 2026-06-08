"""
Block 4 — Tasks Final E2E test.
Validates:
  - /api/tasks filters: today, tomorrow, overdue, no_deadline, week
  - /api/tasks/reports/leads-without-tasks
  - /api/tasks/reports/customers-without-tasks
  - mandatory comment + next-action guard on customer close
"""
import asyncio
import os
import sys
import uuid
import logging
from datetime import datetime, timezone, timedelta

sys.path.insert(0, "/app/backend")
os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")
os.environ.setdefault("DB_NAME", "test_database")

import httpx  # noqa: E402
import bcrypt  # noqa: E402
from motor.motor_asyncio import AsyncIOMotorClient  # noqa: E402

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
log = logging.getLogger("block4")

BASE = "http://localhost:8001"


async def admin_token(db, client, role="admin"):
    email = f"block4_{role}_{uuid.uuid4().hex[:6]}@test.local"
    password = "Block4!23"
    pwd_hash = bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()
    await db.staff.insert_one({
        "id": f"staff_{uuid.uuid4().hex[:8]}",
        "email": email, "password_hash": pwd_hash,
        "name": f"Block4 {role}", "role": role, "is_active": True,
    })
    r = await client.post(f"{BASE}/api/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200, r.text
    return r.json().get("token") or r.json().get("access_token")


async def main():
    cmongo = AsyncIOMotorClient(os.environ["MONGO_URL"])
    db = cmongo[os.environ["DB_NAME"]]

    async with httpx.AsyncClient(timeout=15.0) as client:
        token = await admin_token(db, client, role="admin")
        headers = {"Authorization": f"Bearer {token}"}

        # Setup customer + lead
        cust_id = f"cust_b4_{uuid.uuid4().hex[:6]}"
        await db.customers.insert_one({
            "id": cust_id,
            "firstName": "Block4", "lastName": "Tester",
            "email": f"b4_{uuid.uuid4().hex[:4]}@t.local",
            "status": "active", "managerId": "test_mgr",
        })
        lead_id = f"lead_b4_{uuid.uuid4().hex[:6]}"
        await db.leads.insert_one({
            "id": lead_id, "status": "new", "managerId": "test_mgr",
            "firstName": "Lead4", "phone": "+111",
        })

        # Seed test tasks
        now = datetime.now(timezone.utc)
        # Use future hour for "today" so it doesn't collide with "overdue"
        today_due = (now + timedelta(hours=2)).replace(minute=0, second=0, microsecond=0)
        # If today_due crossed midnight, push to noon tomorrow instead — handled by callers
        if today_due.date() != now.date():
            today_due = now.replace(hour=23, minute=30, second=0, microsecond=0)
        tomorrow_due = (now + timedelta(days=1)).replace(hour=10, minute=0, second=0, microsecond=0)
        next_week_due = (now + timedelta(days=5)).replace(hour=10, minute=0, second=0, microsecond=0)
        overdue_due = now - timedelta(days=2)
        tasks_seed = [
            {"id": f"t_today_{uuid.uuid4().hex[:6]}",     "title": "Today task",     "dueDate": today_due.isoformat(),     "status": "todo", "customerId": cust_id},
            {"id": f"t_tomorrow_{uuid.uuid4().hex[:6]}",  "title": "Tomorrow task",  "dueDate": tomorrow_due.isoformat(),  "status": "todo", "customerId": cust_id},
            {"id": f"t_week_{uuid.uuid4().hex[:6]}",      "title": "Next week task", "dueDate": next_week_due.isoformat(), "status": "todo", "customerId": cust_id},
            {"id": f"t_overdue_{uuid.uuid4().hex[:6]}",   "title": "Overdue task",   "dueDate": overdue_due.isoformat(),   "status": "todo", "customerId": cust_id},
            {"id": f"t_nodate_{uuid.uuid4().hex[:6]}",    "title": "No deadline",    "dueDate": None,                       "status": "todo", "customerId": cust_id},
        ]
        await db.tasks.insert_many([{**t, "created_at": now.isoformat(), "assigneeId": "test_mgr"} for t in tasks_seed])

        # ── Test 1: filter=today ──────────────────────────────────────
        r = await client.get(f"{BASE}/api/tasks", params={"filter": "today", "limit": 200}, headers=headers)
        assert r.status_code == 200
        today_items = [t for t in r.json()["items"] if t["customerId"] == cust_id]
        assert len(today_items) == 1 and today_items[0]["title"] == "Today task"
        log.info("✅ Test 1 — filter=today returns 1 task")

        # ── Test 2: filter=tomorrow ───────────────────────────────────
        r = await client.get(f"{BASE}/api/tasks", params={"filter": "tomorrow", "limit": 200}, headers=headers)
        tomorrow_items = [t for t in r.json()["items"] if t["customerId"] == cust_id]
        assert len(tomorrow_items) == 1 and tomorrow_items[0]["title"] == "Tomorrow task"
        log.info("✅ Test 2 — filter=tomorrow returns 1 task")

        # ── Test 3: filter=overdue ─────────────────────────────────────
        r = await client.get(f"{BASE}/api/tasks", params={"filter": "overdue", "limit": 200}, headers=headers)
        overdue_items = [t for t in r.json()["items"] if t["customerId"] == cust_id]
        assert len(overdue_items) == 1 and overdue_items[0]["title"] == "Overdue task"
        log.info("✅ Test 3 — filter=overdue returns 1 task")

        # ── Test 4: filter=no_deadline ─────────────────────────────────
        r = await client.get(f"{BASE}/api/tasks", params={"filter": "no_deadline", "limit": 200}, headers=headers)
        nodate_items = [t for t in r.json()["items"] if t["customerId"] == cust_id]
        assert len(nodate_items) == 1 and nodate_items[0]["title"] == "No deadline"
        log.info("✅ Test 4 — filter=no_deadline returns 1 task")

        # ── Test 5: filter=week ────────────────────────────────────────
        r = await client.get(f"{BASE}/api/tasks", params={"filter": "week", "limit": 200}, headers=headers)
        week_items = [t for t in r.json()["items"] if t["customerId"] == cust_id]
        # today + tomorrow + next week (5 days) within next 7 days
        assert len(week_items) == 3, f"Expected 3 tasks in week, got {len(week_items)}"
        log.info("✅ Test 5 — filter=week returns %d tasks", len(week_items))

        # ── Test 6: leads-without-tasks ────────────────────────────────
        r = await client.get(f"{BASE}/api/tasks/reports/leads-without-tasks", headers=headers)
        assert r.status_code == 200, r.text
        orphan_leads = r.json()["items"]
        assert any(l["id"] == lead_id for l in orphan_leads), "Lead without tasks not detected"
        log.info("✅ Test 6 — leads-without-tasks finds orphan lead")

        # ── Test 7: customers-without-tasks (cust has tasks, NOT in list) ─
        r = await client.get(f"{BASE}/api/tasks/reports/customers-without-tasks", headers=headers)
        assert r.status_code == 200
        orphan_custs = r.json()["items"]
        assert not any(c["id"] == cust_id for c in orphan_custs), "Customer with tasks wrongly reported as orphan"
        log.info("✅ Test 7 — customers-without-tasks correctly excludes busy customer")

        # ── Test 8: Close guard — block missing comment ───────────────
        r = await client.put(f"{BASE}/api/customers/{cust_id}", json={"status": "closed"}, headers=headers)
        assert r.status_code == 422, f"Expected 422, got {r.status_code}: {r.text}"
        assert "no_comment" in r.json()["detail"]
        log.info("✅ Test 8 — Close blocked without recent comment")

        # ── Test 9: Add comment, close still blocked (no next action) ─
        await db.customer_comments.insert_one({
            "id": f"cmt_{uuid.uuid4().hex[:8]}",
            "customer_id": cust_id,
            "text": "Test comment",
            "created_at": datetime.now(timezone.utc).isoformat(),
            "created_by": "test_mgr",
        })
        # Mark all existing tasks completed so the next-action check fails
        await db.tasks.update_many({"customerId": cust_id}, {"$set": {"status": "completed"}})
        r = await client.put(f"{BASE}/api/customers/{cust_id}", json={"status": "closed"}, headers=headers)
        assert r.status_code == 422, f"Expected 422, got {r.status_code}: {r.text}"
        assert "no_next_action" in r.json()["detail"]
        log.info("✅ Test 9 — Close blocked without next-action (with comment)")

        # ── Test 10: Add open task, close succeeds ────────────────────
        await db.tasks.insert_one({
            "id": f"t_next_{uuid.uuid4().hex[:6]}",
            "title": "Follow up next month",
            "status": "todo",
            "customerId": cust_id,
            "assigneeId": "test_mgr",
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
        r = await client.put(f"{BASE}/api/customers/{cust_id}", json={"status": "closed"}, headers=headers)
        assert r.status_code == 200, f"Close failed unexpectedly: {r.text}"
        log.info("✅ Test 10 — Close allowed with comment + next action")

        # ── Test 11: master_admin bypass ──────────────────────────────
        token_ma = await admin_token(db, client, role="master_admin")
        headers_ma = {"Authorization": f"Bearer {token_ma}"}
        cust2_id = f"cust_b4b_{uuid.uuid4().hex[:6]}"
        await db.customers.insert_one({
            "id": cust2_id, "firstName": "Bypass", "lastName": "Test",
            "status": "active", "managerId": "test_mgr",
            "email": f"b4bypass_{uuid.uuid4().hex[:4]}@t.local",
        })
        r = await client.put(f"{BASE}/api/customers/{cust2_id}", json={"status": "closed"}, headers=headers_ma)
        assert r.status_code == 200, f"master_admin bypass failed: {r.text}"
        log.info("✅ Test 11 — master_admin can close without comment/next-action")

        # ── Cleanup ────────────────────────────────────────────────────
        await db.tasks.delete_many({"customerId": cust_id})
        await db.customers.delete_many({"id": {"$in": [cust_id, cust2_id]}})
        await db.leads.delete_one({"id": lead_id})
        await db.customer_comments.delete_many({"customer_id": cust_id})

    print("\n" + "=" * 70)
    print("✅ BLOCK 4 — TASKS FINAL: ALL 11 TESTS PASSED")
    print("=" * 70)
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
