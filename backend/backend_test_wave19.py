"""
BIBI Cars — Wave 19 — Customer Portal View backend test (staff-side)
====================================================================

End-to-end coverage for `/api/customer-portal/*` — the staff-facing
read-only view of a customer's order experience.

Run:  python3 backend_test_wave19.py
"""
from __future__ import annotations
import asyncio
import os
import sys
import uuid
from datetime import datetime, timedelta, timezone

import httpx
from motor.motor_asyncio import AsyncIOMotorClient

BASE = os.environ.get("BIBI_TEST_BASE", "http://localhost:8001")
MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "test_database")

ADMIN_EMAIL = "admin@bibi.cars"
ADMIN_PASSWORD = "Jp3FS_7ZuE2bhHp7rFkJm9B9T_TeiHxu"
MANAGER_EMAIL = "manager@bibi.cars"
MANAGER_PASSWORD = "dFbYnse0L59DBE16Mn4kT6cCRaNBZFQR"

PASS, FAIL = [], []


def check(name: str, ok: bool, detail: str = "") -> None:
    if ok:
        PASS.append(name)
        print(f"  ✅ {name}")
    else:
        FAIL.append((name, detail))
        print(f"  ❌ {name}  ← {detail}")


def H(token):
    return {"Authorization": f"Bearer {token}"}


def staff_login(c, email, password):
    r = c.post(f"{BASE}/api/auth/login", json={"email": email, "password": password})
    if r.status_code == 200:
        return r.json().get("access_token") or r.json().get("token")
    raise RuntimeError(f"staff login failed {r.status_code} {r.text[:120]}")


async def seed(db):
    now = datetime.now(timezone.utc)
    cust_a_id = f"w19_cust_a_{uuid.uuid4().hex[:8]}"
    cust_b_id = f"w19_cust_b_{uuid.uuid4().hex[:8]}"
    deal_a_id = f"deal_a_{uuid.uuid4().hex[:8]}"
    deal_b_id = f"deal_b_{uuid.uuid4().hex[:8]}"

    for cid, name in ((cust_a_id, "Alice T"), (cust_b_id, "Bob T")):
        await db.customers.insert_one({
            "id": cid, "customerId": cid, "user_id": cid,
            "email": f"{cid}@test.local", "name": name,
            "phone": "+10000000000", "role": "customer",
            "status": "active", "created_at": now.isoformat(),
        })

    await db.deals.insert_one({
        "id": deal_a_id, "customerId": cust_a_id,
        "make": "BMW", "model": "X5", "year": 2021,
        "vin": "WBAJA9C50K00ALICE", "status": "in_transit",
        "photo": "https://example.test/a.jpg",
        "milestones": {
            "auction_won": now.isoformat(),
            "payment_confirmed": now.isoformat(),
            "picked_up": now.isoformat(),
            "port_arrived": now.isoformat(),
        },
        "eta": (now + timedelta(days=14)).isoformat(),
        "created_at": now.isoformat(),
    })
    await db.deals.insert_one({
        "id": deal_b_id, "customerId": cust_b_id,
        "make": "Toyota", "model": "Camry", "year": 2022,
        "vin": "BOBVIN111", "status": "auction_won",
        "created_at": now.isoformat(),
    })

    await db.invoices.insert_many([
        {"id": f"inv_{uuid.uuid4().hex[:8]}", "customerId": cust_a_id, "dealId": deal_a_id,
         "number": "INV-A-001", "amount": 5000, "currency": "USD", "status": "paid",
         "issuedAt": now.isoformat(), "paidAt": now.isoformat()},
        {"id": f"inv_{uuid.uuid4().hex[:8]}", "customerId": cust_a_id, "dealId": deal_a_id,
         "number": "INV-A-002", "amount": 3500, "currency": "USD", "status": "open",
         "issuedAt": now.isoformat(), "dueDate": (now + timedelta(days=7)).isoformat()},
        {"id": f"inv_{uuid.uuid4().hex[:8]}", "customerId": cust_b_id, "dealId": deal_b_id,
         "number": "INV-B-001", "amount": 7000, "currency": "USD", "status": "open",
         "issuedAt": now.isoformat()},
    ])

    doc_id = f"doc_{uuid.uuid4().hex[:8]}"
    await db.deal_documents.insert_many([
        {"id": doc_id, "dealId": deal_a_id, "customerId": cust_a_id,
         "kind": "contract", "label": "Vehicle Sale Contract", "filename": "contract.pdf",
         "url": "https://example.test/contract.pdf", "sizeBytes": 102400,
         "uploadedAt": now.isoformat()},
        {"id": f"doc_{uuid.uuid4().hex[:8]}", "dealId": deal_a_id, "customerId": cust_a_id,
         "kind": "invoice", "label": "Auction Invoice", "filename": "invoice.pdf",
         "url": "https://example.test/invoice.pdf", "uploadedAt": now.isoformat()},
        {"id": f"doc_{uuid.uuid4().hex[:8]}", "dealId": deal_b_id, "customerId": cust_b_id,
         "kind": "contract", "label": "Bob's Contract", "filename": "bob.pdf",
         "url": "https://example.test/bob.pdf", "uploadedAt": now.isoformat()},
    ])

    notif_unread_id = f"notif_{uuid.uuid4().hex[:8]}"
    await db.notifications.insert_many([
        {"id": notif_unread_id, "recipientId": cust_a_id, "customerId": cust_a_id,
         "event": "new_eta", "title": "New ETA available",
         "body": "Your vehicle will arrive in 14 days",
         "created_at": now, "read_at": None, "dealId": deal_a_id},
        {"id": f"notif_{uuid.uuid4().hex[:8]}", "recipientId": cust_a_id, "customerId": cust_a_id,
         "event": "contract_ready", "title": "Contract ready", "body": "",
         "created_at": now, "read_at": None, "dealId": deal_a_id},
        {"id": f"notif_{uuid.uuid4().hex[:8]}", "recipientId": cust_a_id, "customerId": cust_a_id,
         "event": "payment_received", "title": "Payment received", "body": "",
         "created_at": now, "read_at": None, "dealId": deal_a_id},
        {"id": f"notif_{uuid.uuid4().hex[:8]}", "recipientId": cust_b_id, "customerId": cust_b_id,
         "event": "new_eta", "title": "Bob's notification", "body": "",
         "created_at": now, "read_at": None, "dealId": deal_b_id},
    ])

    return {"cust_a": cust_a_id, "cust_b": cust_b_id,
            "deal_a": deal_a_id, "deal_b": deal_b_id,
            "doc_id": doc_id, "notif_unread_id": notif_unread_id}


async def cleanup(db, seeded):
    for cid in (seeded["cust_a"], seeded["cust_b"]):
        await db.customers.delete_many({"customerId": cid})
        await db.deals.delete_many({"customerId": cid})
        await db.invoices.delete_many({"customerId": cid})
        await db.deal_documents.delete_many({"customerId": cid})
        await db.notifications.delete_many({"customerId": cid})


async def run():
    print("══════ Wave 19 — Customer Portal View (staff-side) tests ══════\n")
    mongo = AsyncIOMotorClient(MONGO_URL)
    db = mongo[DB_NAME]
    seeded = await seed(db)

    try:
        with httpx.Client(timeout=10.0) as c:
            # ── 1. AUTH GATE ───────────────────────────────────────
            print("\n[1] Auth gate — staff-only")
            for ep in (
                "/api/customer-portal/customers",
                f"/api/customer-portal/{seeded['cust_a']}",
                f"/api/customer-portal/{seeded['cust_a']}/home",
                f"/api/customer-portal/{seeded['cust_a']}/deals",
            ):
                r = c.get(BASE + ep)
                check(f"GET {ep} without token → 401", r.status_code == 401, f"got {r.status_code}")

            r = c.get(BASE + f"/api/customer-portal/{seeded['cust_a']}/home", headers=H("bogus_admin_token_xx"))
            check("Bogus admin token → 401", r.status_code == 401, f"got {r.status_code}")

            # ── 2. STAFF LOGIN ─────────────────────────────────────
            print("\n[2] Login admin + manager")
            admin_tok = staff_login(c, ADMIN_EMAIL, ADMIN_PASSWORD)
            check("Admin login OK", bool(admin_tok))
            manager_tok = staff_login(c, MANAGER_EMAIL, MANAGER_PASSWORD)
            check("Manager login OK", bool(manager_tok))

            # ── 3. CUSTOMERS PICKER ────────────────────────────────
            print("\n[3] Customer picker")
            r = c.get(BASE + "/api/customer-portal/customers", headers=H(admin_tok))
            check("GET /customers → 200 (admin)", r.status_code == 200, f"got {r.status_code}")
            items = r.json().get("items", [])
            ids = {x["customerId"] for x in items}
            check("Picker contains seeded Alice", seeded["cust_a"] in ids, f"missing in {len(ids)} ids")
            check("Picker contains seeded Bob", seeded["cust_b"] in ids, "missing")
            alice_entry = next((x for x in items if x["customerId"] == seeded["cust_a"]), None)
            check("Alice has dealsCount=1", alice_entry and alice_entry["dealsCount"] == 1, str(alice_entry))

            r = c.get(BASE + "/api/customer-portal/customers", headers=H(admin_tok), params={"q": "Alice"})
            check("Search 'Alice' → 200", r.status_code == 200, f"got {r.status_code}")
            check("Search finds Alice", any(x["customerId"] == seeded["cust_a"] for x in r.json()["items"]), "not found")

            # Manager (lower role) can ALSO use the picker — Wave 19 is cross-cutting
            r = c.get(BASE + "/api/customer-portal/customers", headers=H(manager_tok))
            check("Manager GET /customers → 200 (cross-cutting)", r.status_code == 200, f"got {r.status_code}")

            # ── 4. CUSTOMER SUMMARY ────────────────────────────────
            print("\n[4] Customer summary")
            r = c.get(BASE + f"/api/customer-portal/{seeded['cust_a']}", headers=H(admin_tok))
            check("GET /{cust_a} → 200", r.status_code == 200, f"got {r.status_code}")
            summary = r.json()
            check("Summary returns Alice", summary["customerId"] == seeded["cust_a"], str(summary))
            check("Summary trimmed (no password)", "password" not in summary)

            r = c.get(BASE + "/api/customer-portal/__does_not_exist__", headers=H(admin_tok))
            check("Non-existent customer → 404", r.status_code == 404, f"got {r.status_code}")

            # ── 5. DEALS (path-scoped to customer_id) ──────────────
            print("\n[5] Deals scoped by customer_id in path")
            r = c.get(BASE + f"/api/customer-portal/{seeded['cust_a']}/deals", headers=H(admin_tok))
            check("Alice deals → 200", r.status_code == 200, f"got {r.status_code}")
            deals = r.json()["items"]
            check("Alice deals list contains her deal", any(d["id"] == seeded["deal_a"] for d in deals), str([d["id"] for d in deals]))
            check("Alice deals list does NOT contain Bob's deal", not any(d["id"] == seeded["deal_b"] for d in deals), "TENANT LEAK")

            r = c.get(BASE + f"/api/customer-portal/{seeded['cust_a']}/deals/{seeded['deal_a']}", headers=H(admin_tok))
            check("Alice's deal detail via her path → 200", r.status_code == 200, f"got {r.status_code}")

            r = c.get(BASE + f"/api/customer-portal/{seeded['cust_a']}/deals/{seeded['deal_b']}", headers=H(admin_tok))
            check("Bob's deal under Alice's path → 404", r.status_code == 404, f"got {r.status_code}")

            # ── 6. DELIVERY ────────────────────────────────────────
            print("\n[6] Delivery timeline (Wave 13 trimmed)")
            r = c.get(BASE + f"/api/customer-portal/{seeded['cust_a']}/deals/{seeded['deal_a']}/delivery", headers=H(admin_tok))
            check("Delivery → 200", r.status_code == 200, f"got {r.status_code}")
            tl = r.json()
            check("9 milestones returned", len(tl["milestones"]) == 9, f"got {len(tl['milestones'])}")
            done = [m for m in tl["milestones"] if m["state"] == "done"]
            check("4 milestones done", len(done) == 4, f"got {len(done)}")
            check("currentMilestone is port_arrived", tl["currentMilestone"] == "port_arrived", str(tl["currentMilestone"]))

            r = c.get(BASE + f"/api/customer-portal/{seeded['cust_a']}/deals/{seeded['deal_b']}/delivery", headers=H(admin_tok))
            check("Bob's delivery under Alice's path → 404", r.status_code == 404, f"got {r.status_code}")

            # ── 7. DOCUMENTS ───────────────────────────────────────
            print("\n[7] Documents")
            r = c.get(BASE + f"/api/customer-portal/{seeded['cust_a']}/deals/{seeded['deal_a']}/documents", headers=H(admin_tok))
            check("Documents → 200", r.status_code == 200, f"got {r.status_code}")
            docs = r.json()["items"]
            check("Alice has 2 docs", len(docs) == 2, f"got {len(docs)}")
            for d in docs:
                check(f"Doc downloadUrl points to /api/customer-portal/{seeded['cust_a']}/documents/",
                      d["downloadUrl"].startswith(f"/api/customer-portal/{seeded['cust_a']}/documents/"),
                      str(d["downloadUrl"]))
                check("No internal _storage_collection key", not any(k.startswith("_") for k in d.keys()))

            r = c.get(BASE + f"/api/customer-portal/{seeded['cust_a']}/documents/{seeded['doc_id']}/download", headers=H(admin_tok))
            check("Download Alice's doc via her path → 200", r.status_code == 200, f"got {r.status_code}")

            r = c.get(BASE + f"/api/customer-portal/{seeded['cust_b']}/documents/{seeded['doc_id']}/download", headers=H(admin_tok))
            check("Download Alice's doc via Bob's path → 404", r.status_code == 404, f"got {r.status_code}")

            # ── 8. PAYMENTS ────────────────────────────────────────
            print("\n[8] Payments")
            r = c.get(BASE + f"/api/customer-portal/{seeded['cust_a']}/deals/{seeded['deal_a']}/payments", headers=H(admin_tok))
            check("Payments → 200", r.status_code == 200, f"got {r.status_code}")
            pay = r.json()
            check("total=8500", abs(pay["totalAmount"] - 8500) < 0.01, str(pay))
            check("paid=5000", abs(pay["paidAmount"] - 5000) < 0.01, str(pay))
            check("outstanding=3500", abs(pay["outstandingAmount"] - 3500) < 0.01, str(pay))
            check("2 history rows", len(pay["history"]) == 2, str(len(pay["history"])))
            check("Bob's invoice NOT in Alice's payments", not any(inv["number"] == "INV-B-001" for inv in pay["history"]), "TENANT LEAK")

            # ── 9. NOTIFICATIONS ───────────────────────────────────
            print("\n[9] Notifications")
            r = c.get(BASE + f"/api/customer-portal/{seeded['cust_a']}/notifications", headers=H(admin_tok))
            check("Notifications → 200", r.status_code == 200, f"got {r.status_code}")
            inbox = r.json()
            check("Alice has 3 notifications", inbox["total"] == 3, f"got {inbox['total']}")
            check("Alice has 3 unread", inbox["unread"] == 3, f"got {inbox['unread']}")
            check("Bob's notification NOT visible", not any("Bob" in n["title"] for n in inbox["items"]), "TENANT LEAK")

            r = c.get(BASE + f"/api/customer-portal/{seeded['cust_a']}/notifications/unread-count", headers=H(admin_tok))
            check("unread-count → 3", r.json().get("unread") == 3, str(r.json()))

            r = c.post(BASE + f"/api/customer-portal/{seeded['cust_a']}/notifications/{seeded['notif_unread_id']}/read", headers=H(admin_tok))
            check("Mark read → 200", r.status_code == 200, f"got {r.status_code}")

            r = c.get(BASE + f"/api/customer-portal/{seeded['cust_a']}/notifications/unread-count", headers=H(admin_tok))
            check("After mark read, unread → 2", r.json().get("unread") == 2, str(r.json()))

            r = c.post(BASE + f"/api/customer-portal/{seeded['cust_b']}/notifications/{seeded['notif_unread_id']}/read", headers=H(admin_tok))
            check("Mark Alice's notification via Bob's path → 404", r.status_code == 404, f"got {r.status_code}")

            # ── 10. HOME AGGREGATOR ────────────────────────────────
            print("\n[10] /home aggregator")
            r = c.get(BASE + f"/api/customer-portal/{seeded['cust_a']}/home", headers=H(admin_tok))
            check("Home → 200", r.status_code == 200, f"got {r.status_code}")
            home = r.json()
            check("home.customer is Alice", home["customer"]["customerId"] == seeded["cust_a"])
            check("home.activeDeal is BMW", home["activeDeal"]["vehicle"].startswith("2021 BMW"))
            check("home.delivery has 9 milestones", len(home["delivery"]["milestones"]) == 9)
            check("home.documents 2 items, staff URLs",
                  len(home["documents"]["items"]) == 2 and home["documents"]["items"][0]["downloadUrl"].startswith(f"/api/customer-portal/{seeded['cust_a']}/documents/"),
                  str(home["documents"]["items"][0]["downloadUrl"]))
            check("home.payments paid=5000 outstanding=3500",
                  home["payments"]["paidAmount"] == 5000 and home["payments"]["outstandingAmount"] == 3500)
            check("home.notifications.unread == 2 (after mark-read)",
                  home["notifications"]["unread"] == 2, str(home["notifications"]["unread"]))
            check("home.allDeals is a list", isinstance(home["allDeals"], list))

            # Manager can also call /home (cross-cutting role)
            r = c.get(BASE + f"/api/customer-portal/{seeded['cust_a']}/home", headers=H(manager_tok))
            check("Manager GET /home → 200 (cross-cutting)", r.status_code == 200, f"got {r.status_code}")

            # ── 11. NO MUTATION SURFACE ────────────────────────────
            print("\n[11] No mutation endpoints exposed under /api/customer-portal/* (except mark-read)")
            forbidden = [
                ("POST",  f"/api/customer-portal/{seeded['cust_a']}/deals", {"vehicle": "evil"}),
                ("PUT",   f"/api/customer-portal/{seeded['cust_a']}/deals/{seeded['deal_a']}", {}),
                ("DELETE",f"/api/customer-portal/{seeded['cust_a']}/deals/{seeded['deal_a']}", None),
                ("POST",  f"/api/customer-portal/{seeded['cust_a']}/messages", {}),
                ("POST",  f"/api/customer-portal/{seeded['cust_a']}/tickets", {}),
                ("PATCH", f"/api/customer-portal/{seeded['cust_a']}", {"name": "x"}),
            ]
            for method, path, body in forbidden:
                r = c.request(method, BASE + path, headers=H(admin_tok), json=body)
                check(f"{method} {path} → 4xx (not 2xx)", 400 <= r.status_code < 500, f"got {r.status_code}")

    finally:
        await cleanup(db, seeded)
        mongo.close()

    total = len(PASS) + len(FAIL)
    print(f"\n══════ Result: {len(PASS)}/{total} PASS ══════")
    if FAIL:
        print("\nFailures:")
        for n, d in FAIL:
            print(f"  • {n}  ← {d}")
        sys.exit(1)
    print("\n✅ Wave 19 (staff-side) ALL GREEN.")
    sys.exit(0)


if __name__ == "__main__":
    asyncio.run(run())
