"""
Block 3 — Meetings + Calendar (.ics) HTTP E2E test.
Validates: CRUD, .ics export (RFC 5545), calendar range, customer-scoped,
complete with result+nextStep, soft-cancel, timeline events.
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
log = logging.getLogger("block3")

BASE = "http://localhost:8001"


async def admin_token(db, client):
    email = f"block3_{uuid.uuid4().hex[:6]}@test.local"
    password = "Block3!23"
    pwd_hash = bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()
    await db.staff.insert_one({
        "id": f"staff_{uuid.uuid4().hex[:8]}",
        "email": email, "password_hash": pwd_hash,
        "name": "Block3 Admin", "role": "master_admin", "is_active": True,
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

        # Setup customer
        cust_id = f"cust_b3_{uuid.uuid4().hex[:6]}"
        await db.customers.insert_one({
            "id": cust_id,
            "firstName": "Meet", "lastName": "Tester",
            "email": f"b3_{uuid.uuid4().hex[:4]}@t.local",
            "phone": "+359222", "status": "active",
        })

        # ── Test 1: Create meeting (call) ─────────────────────────────
        start_iso = (datetime.now(timezone.utc) + timedelta(days=1, hours=2)).isoformat()
        r = await client.post(f"{BASE}/api/meetings", json={
            "customerId": cust_id,
            "title": "Discovery call",
            "startAt": start_iso,
            "durationMin": 30,
            "meetingType": "call",
            "location": "+359 888 000 111",
            "notes": "Discuss USA car options",
        }, headers=headers)
        assert r.status_code == 200, r.text
        m1 = r.json()["meeting"]
        assert m1["status"] == "scheduled"
        assert m1["meetingType"] == "call"
        assert m1["endAt"] is not None  # computed from duration
        log.info("✅ Test 1 — Meeting created (%s, endAt computed)", m1["id"])

        # ── Test 2: Validation — missing title ────────────────────────
        r = await client.post(f"{BASE}/api/meetings", json={
            "customerId": cust_id, "startAt": start_iso,
        }, headers=headers)
        assert r.status_code == 400
        log.info("✅ Test 2 — Validation rejects missing title")

        # ── Test 3: Validation — missing customer/lead/deal ───────────
        r = await client.post(f"{BASE}/api/meetings", json={
            "title": "Orphan", "startAt": start_iso,
        }, headers=headers)
        assert r.status_code == 400
        log.info("✅ Test 3 — Validation rejects missing customerId/leadId/dealId")

        # ── Test 4: Create more meetings for range test ───────────────
        for offset, t in [(2, "Follow-up"), (3, "Contract review"), (5, "Hand-over")]:
            await client.post(f"{BASE}/api/meetings", json={
                "customerId": cust_id,
                "title": t,
                "startAt": (datetime.now(timezone.utc) + timedelta(days=offset)).isoformat(),
                "durationMin": 45,
                "meetingType": "in_person",
            }, headers=headers)

        # ── Test 5: List all ──────────────────────────────────────────
        r = await client.get(f"{BASE}/api/meetings", headers=headers)
        cust_meetings = [m for m in r.json()["items"] if m["customerId"] == cust_id]
        assert len(cust_meetings) == 4, f"Expected 4 meetings, got {len(cust_meetings)}"
        log.info("✅ Test 5 — List returns %d meetings for customer", len(cust_meetings))

        # ── Test 6: Calendar range (next 2 days only) ─────────────────
        date_from = datetime.now(timezone.utc).isoformat()
        date_to = (datetime.now(timezone.utc) + timedelta(days=2, hours=23)).isoformat()
        r = await client.get(
            f"{BASE}/api/meetings/calendar",
            params={"from": date_from, "to": date_to},
            headers=headers,
        )
        assert r.status_code == 200, r.text
        in_range = [m for m in r.json()["items"] if m["customerId"] == cust_id]
        assert len(in_range) == 2, f"Expected 2 meetings in 2-day range, got {len(in_range)}"
        log.info("✅ Test 6 — Calendar range returns %d meetings", len(in_range))

        # ── Test 7: Customer-scoped read ──────────────────────────────
        r = await client.get(f"{BASE}/api/customers/{cust_id}/meetings", headers=headers)
        assert r.status_code == 200
        assert len(r.json()["items"]) == 4
        log.info("✅ Test 7 — Customer-scoped list returns all")

        # ── Test 8: .ics export ────────────────────────────────────────
        r = await client.get(f"{BASE}/api/meetings/{m1['id']}/ics")
        assert r.status_code == 200, r.text
        assert r.headers.get("content-type", "").startswith("text/calendar")
        ics = r.text
        assert "BEGIN:VCALENDAR" in ics
        assert "BEGIN:VEVENT" in ics
        assert "END:VEVENT" in ics
        assert "END:VCALENDAR" in ics
        assert f"UID:{m1['id']}@bibicars" in ics
        assert "SUMMARY:Discovery call" in ics
        assert "STATUS:CONFIRMED" in ics
        log.info("✅ Test 8 — .ics export RFC 5545-compliant")

        # ── Test 9: Complete meeting (with result+nextStep) ───────────
        r = await client.patch(
            f"{BASE}/api/meetings/{m1['id']}",
            json={"status": "completed", "result": "Client agreed to deposit", "nextStep": "Send invoice in 24h"},
            headers=headers,
        )
        assert r.status_code == 200
        completed = r.json()["meeting"]
        assert completed["status"] == "completed"
        assert completed["completedAt"] is not None
        assert completed["result"] == "Client agreed to deposit"
        assert completed["nextStep"] == "Send invoice in 24h"
        log.info("✅ Test 9 — Completed meeting carries result/nextStep + completedAt")

        # ── Test 10: Soft cancel ──────────────────────────────────────
        r = await client.delete(f"{BASE}/api/meetings/{cust_meetings[1]['id']}", headers=headers)
        assert r.status_code == 200
        r = await client.get(f"{BASE}/api/meetings/{cust_meetings[1]['id']}", headers=headers)
        assert r.json()["meeting"]["status"] == "cancelled"
        log.info("✅ Test 10 — Soft cancel preserves doc")

        # ── Test 11: Timeline events ──────────────────────────────────
        events = await db.customer_timeline_events.find(
            {"customer_id": cust_id, "kind": {"$in": ["meeting_scheduled", "meeting_completed", "meeting_cancelled"]}},
            {"_id": 0},
        ).to_list(length=20)
        assert any(e["kind"] == "meeting_scheduled" for e in events), "No meeting_scheduled event"
        assert any(e["kind"] == "meeting_completed" for e in events), "No meeting_completed event"
        log.info("✅ Test 11 — Timeline events: scheduled=%d, completed=%d, cancelled=%d",
                 len([e for e in events if e["kind"] == "meeting_scheduled"]),
                 len([e for e in events if e["kind"] == "meeting_completed"]),
                 len([e for e in events if e["kind"] == "meeting_cancelled"]))

        # ── Cleanup ────────────────────────────────────────────────────
        await db.meetings.delete_many({"customerId": cust_id})
        await db.customers.delete_one({"id": cust_id})
        await db.customer_timeline_events.delete_many({"customer_id": cust_id})

    print("\n" + "=" * 70)
    print("✅ BLOCK 3 — MEETINGS + CALENDAR (.ics): ALL 11 TESTS PASSED")
    print("=" * 70)
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
