"""
BIBI Cars — Wave 11 Backend Test
=================================
Validates the Deal360 surface end-to-end against a live admin session.

Endpoints under test:
  GET    /api/deals/{id}/360            (one-shot bundle)
  GET    /api/deals/{id}/stage-progress (light progress bar payload)
  GET    /api/deals/{id}/documents      (documents tab)
  POST   /api/deals/{id}/documents      (add a document link)
  DELETE /api/deals/{id}/documents/{docId}
  POST   /api/deals/{id}/notes          (timeline note)

The test creates a fresh deal so it can run on any DB state without polluting
existing data, then cleans up the document it created.
"""
import os
import sys
import time
import requests

BASE_URL = os.environ.get("BIBI_BASE_URL", "http://localhost:8001/api")

ADMIN_EMAIL    = os.environ.get("BIBI_ADMIN_EMAIL", "admin@bibi.cars")
ADMIN_PASSWORD = os.environ.get("BIBI_ADMIN_PASSWORD", "Jp3FS_7ZuE2bhHp7rFkJm9B9T_TeiHxu")


class Wave11Tester:
    def __init__(self):
        self.token = None
        self.tests_run = 0
        self.tests_passed = 0
        self.tests_failed = 0
        self.failures = []
        self.deal_id = None
        self.customer_id = None
        self.doc_id = None

    # ── plumbing ────────────────────────────────────────────────────────
    def log(self, msg, level="INFO"):
        prefix = "✅" if level == "PASS" else "❌" if level == "FAIL" else "🔍"
        print(f"{prefix} {msg}")

    def test(self, name, condition, details=""):
        self.tests_run += 1
        if condition:
            self.tests_passed += 1
            self.log(f"PASS: {name}", "PASS")
            if details:
                print(f"   └─ {details}")
            return True
        else:
            self.tests_failed += 1
            self.failures.append(name)
            self.log(f"FAIL: {name}", "FAIL")
            if details:
                print(f"   └─ {details}")
            return False

    def _h(self):
        return {"Authorization": f"Bearer {self.token}", "Content-Type": "application/json"}

    def get(self, path, **kw):
        return requests.get(f"{BASE_URL}{path}", headers=self._h(), timeout=20, **kw)

    def post(self, path, **kw):
        return requests.post(f"{BASE_URL}{path}", headers=self._h(), timeout=20, **kw)

    def delete(self, path, **kw):
        return requests.delete(f"{BASE_URL}{path}", headers=self._h(), timeout=20, **kw)

    # ── steps ──────────────────────────────────────────────────────────
    def login(self):
        self.log(f"Logging in as {ADMIN_EMAIL}")
        r = requests.post(
            f"{BASE_URL}/auth/login",
            json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
            timeout=15,
        )
        if r.status_code != 200:
            self.test("login", False, f"HTTP {r.status_code} {r.text[:200]}")
            return False
        self.token = r.json().get("access_token") or r.json().get("token")
        return self.test("login", bool(self.token), "got JWT")

    def seed_fixture(self):
        self.log("Seeding customer + deal fixture")
        cust = self.post("/customers", json={
            "name": "Wave11 Tester",
            "email": f"wave11.{int(time.time())}@example.com",
            "phone": "+359888000111",
            "company": "Wave11 Co",
        })
        if not self.test("create customer", cust.status_code == 200, f"HTTP {cust.status_code}"):
            return False
        cb = cust.json()
        self.customer_id = (cb.get("customer") or cb.get("data") or {}).get("id")
        self.test("customer.id present", bool(self.customer_id), self.customer_id or "")

        deal = self.post("/deals", json={
            "title": "Wave11 backend test deal",
            "customerId": self.customer_id,
            "customer_id": self.customer_id,
            "clientPrice": 35000,
            "internal_cost": 27000,
            "profit": 8000,
            "currency": "EUR",
            "vin": "JN1AZ4EH0AM502222",
            "status": "negotiation",
            "stage":  "awaiting_deposit",
            "created_by": ADMIN_EMAIL,
        })
        if not self.test("create deal", deal.status_code == 200, f"HTTP {deal.status_code}"):
            return False
        db = deal.json()
        self.deal_id = (db.get("deal") or db.get("data") or {}).get("id")
        return self.test("deal.id present", bool(self.deal_id), self.deal_id or "")

    # ── /360 bundle ─────────────────────────────────────────────────────
    def test_deal_360_bundle(self):
        self.log("\n=== /api/deals/{id}/360 — full bundle ===")
        r = self.get(f"/deals/{self.deal_id}/360")
        if not self.test("/360 returns 200", r.status_code == 200, f"HTTP {r.status_code}"):
            return
        data = r.json()
        for key in [
            "deal", "customer", "manager", "pipeline_stage", "health",
            "stage_progress", "financials", "deposits", "contracts", "payments",
            "shipments", "documents", "timeline", "counts",
        ]:
            self.test(f"/360 has '{key}'", key in data, f"present={key in data}")

        self.test(
            "pipeline_stage = awaiting_deposit",
            data.get("pipeline_stage") == "awaiting_deposit",
            f"got={data.get('pipeline_stage')}",
        )

        h = data.get("health") or {}
        self.test(
            "health.state is healthy or blocked",
            h.get("state") in ("healthy", "blocked", "waiting_customer"),
            f"got={h.get('state')}",
        )

        sp = data.get("stage_progress") or {}
        self.test(
            "stage_progress.percent in [0,100]",
            isinstance(sp.get("percent"), int) and 0 <= sp.get("percent") <= 100,
            f"percent={sp.get('percent')}",
        )
        self.test(
            "stage_progress.blockers contains 'Deposit not confirmed'",
            any("deposit" in b.lower() for b in (sp.get("blockers") or [])),
            f"blockers={sp.get('blockers')}",
        )
        self.test(
            "stage_progress.stages has 9 entries (no cancelled)",
            isinstance(sp.get("stages"), list) and len(sp.get("stages") or []) == 9,
            f"stages={len(sp.get('stages') or [])}",
        )

        fin = data.get("financials") or {}
        self.test("financials.revenue == 35000",  fin.get("revenue") == 35000,  f"got {fin.get('revenue')}")
        self.test("financials.profit == 8000",    fin.get("profit") == 8000,    f"got {fin.get('profit')}")
        self.test("financials.balance_due > 0",   (fin.get("balance_due") or 0) > 0, f"got {fin.get('balance_due')}")

        cust = data.get("customer") or {}
        self.test("customer linked", cust.get("id") == self.customer_id, f"got {cust.get('id')}")

        counts = data.get("counts") or {}
        self.test("counts.timeline >= 1 (deal_created)", (counts.get("timeline") or 0) >= 1, f"got {counts.get('timeline')}")

    # ── stage-progress ─────────────────────────────────────────────────
    def test_stage_progress(self):
        self.log("\n=== /api/deals/{id}/stage-progress ===")
        r = self.get(f"/deals/{self.deal_id}/stage-progress")
        self.test("stage-progress 200", r.status_code == 200, f"HTTP {r.status_code}")
        if r.status_code == 200:
            sp = (r.json() or {}).get("data") or {}
            self.test("returns current_stage", bool(sp.get("current_stage")), sp.get("current_stage"))

    # ── documents ──────────────────────────────────────────────────────
    def test_documents_flow(self):
        self.log("\n=== /api/deals/{id}/documents ===")
        # list empty
        r = self.get(f"/deals/{self.deal_id}/documents")
        self.test("documents list 200", r.status_code == 200)
        # add
        add = self.post(f"/deals/{self.deal_id}/documents", json={
            "name": "Wave11 invoice.pdf",
            "url": "https://example.com/wave11.pdf",
            "kind": "invoice",
        })
        self.test("add document 200", add.status_code == 200, f"HTTP {add.status_code}")
        if add.status_code == 200:
            self.doc_id = (add.json().get("data") or {}).get("id")
            self.test("doc.id present", bool(self.doc_id), self.doc_id or "")
        # list with doc
        r2 = self.get(f"/deals/{self.deal_id}/documents")
        items = (r2.json() or {}).get("items") or []
        self.test("documents list contains new doc", any(d.get("id") == self.doc_id for d in items),
                  f"got {len(items)} item(s)")
        # bundle reflects doc count
        r3 = self.get(f"/deals/{self.deal_id}/360")
        if r3.status_code == 200:
            self.test("/360.counts.documents >= 1", (r3.json().get("counts") or {}).get("documents", 0) >= 1)

        # delete
        if self.doc_id:
            d = self.delete(f"/deals/{self.deal_id}/documents/{self.doc_id}")
            self.test("delete document 200", d.status_code == 200, f"HTTP {d.status_code}")

    # ── notes ──────────────────────────────────────────────────────────
    def test_notes(self):
        self.log("\n=== /api/deals/{id}/notes ===")
        r = self.post(f"/deals/{self.deal_id}/notes", json={"text": "Wave11 e2e note"})
        self.test("note add 200", r.status_code == 200, f"HTTP {r.status_code}")
        # verify it appears in /360 timeline
        b = self.get(f"/deals/{self.deal_id}/360")
        if b.status_code == 200:
            tl = b.json().get("timeline") or []
            self.test(
                "timeline contains the Wave11 note",
                any("Wave11 e2e note" in (e.get("message") or "") for e in tl),
                f"timeline events={len(tl)}",
            )

        # 400 on empty note
        r2 = self.post(f"/deals/{self.deal_id}/notes", json={"text": "   "})
        self.test("empty note rejected (400)", r2.status_code == 400, f"HTTP {r2.status_code}")

    # ── negative tests ─────────────────────────────────────────────────
    def test_negatives(self):
        self.log("\n=== negative tests ===")
        r = self.get("/deals/does-not-exist-xyz/360")
        self.test("missing deal → 404", r.status_code == 404, f"HTTP {r.status_code}")

    # ── Wave 11.1 — transitions, blockers, deposits, payments actions ──
    def test_pipeline_transitions(self):
        self.log("\n=== Wave 11.1 / Pipeline transitions ===")
        r = self.get(f"/deals/{self.deal_id}/transitions")
        self.test("GET /transitions 200", r.status_code == 200, f"HTTP {r.status_code}")
        opts = (r.json() or {}).get("items") or []
        self.test("transitions includes deposit_paid",
                  "deposit_paid" in opts, f"opts={opts}")
        self.test("transitions includes cancelled",
                  "cancelled" in opts, f"opts={opts}")

        # Forward
        r = self.post(f"/deals/{self.deal_id}/transition",
                      json={"to": "deposit_paid", "reason": "wave11 test"})
        self.test("transition forward 200", r.status_code == 200, f"HTTP {r.status_code}")
        # Bundle reflects
        b = self.get(f"/deals/{self.deal_id}/360").json()
        self.test("bundle.pipeline_stage = deposit_paid",
                  b.get("pipeline_stage") == "deposit_paid",
                  f"got {b.get('pipeline_stage')}")
        self.test("stage_progress.percent advanced",
                  (b.get("stage_progress") or {}).get("percent", 0) > 25,
                  f"got {(b.get('stage_progress') or {}).get('percent')}")
        # Invalid target
        r = self.post(f"/deals/{self.deal_id}/transition",
                      json={"to": "delivered", "reason": "x"})
        self.test("invalid transition rejected (409)", r.status_code == 409,
                  f"HTTP {r.status_code}")

    def test_blockers(self):
        self.log("\n=== Wave 11.1 / Blockers ===")
        r = self.post(f"/deals/{self.deal_id}/blockers",
                      json={"label": "Wave11.1 test blocker", "note": "from test"})
        self.test("blocker add 200", r.status_code == 200, f"HTTP {r.status_code}")
        blk_id = (r.json().get("data") or {}).get("id")
        self.test("blocker.id present", bool(blk_id), blk_id or "")

        # Empty label rejected
        r2 = self.post(f"/deals/{self.deal_id}/blockers",
                       json={"label": "   "})
        self.test("blocker empty label → 400", r2.status_code == 400, f"HTTP {r2.status_code}")

        # Bundle exposes the open blocker
        b = self.get(f"/deals/{self.deal_id}/360").json()
        open_blockers = (b.get("counts") or {}).get("blockers", 0)
        self.test("/360.counts.blockers >= 1", open_blockers >= 1, f"got {open_blockers}")
        merged = (b.get("stage_progress") or {}).get("blockers") or []
        self.test("stage_progress.blockers contains the manual one",
                  any("Wave11.1 test blocker" in m for m in merged),
                  f"merged={merged}")

        # Resolve
        r = self.delete(f"/deals/{self.deal_id}/blockers/{blk_id}")
        self.test("blocker resolve 200", r.status_code == 200, f"HTTP {r.status_code}")
        b = self.get(f"/deals/{self.deal_id}/360").json()
        self.test("/360.counts.blockers == 0",
                  (b.get("counts") or {}).get("blockers", 0) == 0,
                  f"got {(b.get('counts') or {}).get('blockers')}")

    def test_deposits_actions(self):
        self.log("\n=== Wave 11.1 / Deposits actions ===")
        # Register
        r = self.post(f"/deals/{self.deal_id}/deposits",
                      json={"amount": 3500, "method": "bank_transfer", "note": "10%"})
        self.test("deposit register 200", r.status_code == 200, f"HTTP {r.status_code}")
        dep_id = (r.json().get("data") or {}).get("id")
        self.test("deposit.id present", bool(dep_id), dep_id or "")

        # Bad: amount = 0
        r2 = self.post(f"/deals/{self.deal_id}/deposits", json={"amount": 0})
        self.test("zero deposit → 400", r2.status_code == 400, f"HTTP {r2.status_code}")

        # Confirm
        r = self.post(f"/deals/{self.deal_id}/deposits/{dep_id}/confirm",
                      json={"note": "ok"})
        self.test("deposit confirm 200", r.status_code == 200, f"HTTP {r.status_code}")

        # Bundle: financials.deposit_received increased
        b = self.get(f"/deals/{self.deal_id}/360").json()
        dr = (b.get("financials") or {}).get("deposit_received") or 0
        self.test("financials.deposit_received >= 3500", dr >= 3500, f"got {dr}")

        # Refund (allowed from confirmed)
        r = self.post(f"/deals/{self.deal_id}/deposits/{dep_id}/refund",
                      json={"note": "customer changed mind"})
        self.test("deposit refund 200", r.status_code == 200, f"HTTP {r.status_code}")

        # Bad action
        r2 = self.post(f"/deals/{self.deal_id}/deposits/{dep_id}/foo")
        self.test("unknown deposit action → 400", r2.status_code == 400, f"HTTP {r2.status_code}")

    def test_payments_actions(self):
        self.log("\n=== Wave 11.1 / Payments actions ===")
        r = self.post(f"/deals/{self.deal_id}/payments",
                      json={"amount": 12000, "type": "milestone", "status": "pending"})
        self.test("payment register pending 200", r.status_code == 200, f"HTTP {r.status_code}")
        pay_id = (r.json().get("data") or {}).get("id")

        # Confirm
        r = self.post(f"/deals/{self.deal_id}/payments/{pay_id}/confirm")
        self.test("payment confirm 200", r.status_code == 200, f"HTTP {r.status_code}")

        # Bundle: payments_received increased
        b = self.get(f"/deals/{self.deal_id}/360").json()
        pr = (b.get("financials") or {}).get("payments_received") or 0
        self.test("financials.payments_received >= 12000", pr >= 12000, f"got {pr}")

        # Refund a confirmed payment
        r = self.post(f"/deals/{self.deal_id}/payments/{pay_id}/refund",
                      json={"note": "credit back"})
        self.test("payment refund 200", r.status_code == 200, f"HTTP {r.status_code}")

        # Failing action on unknown
        r2 = self.post(f"/deals/{self.deal_id}/payments/nope/confirm")
        self.test("unknown payment id → 404", r2.status_code == 404, f"HTTP {r2.status_code}")

    # ── runner ─────────────────────────────────────────────────────────
    def run_all(self):
        print("\n" + "=" * 60)
        print("BIBI Cars — Wave 11 Backend Test")
        print("=" * 60)
        if not self.login():
            return 1
        if not self.seed_fixture():
            return 1
        self.test_deal_360_bundle()
        self.test_stage_progress()
        self.test_documents_flow()
        self.test_notes()
        # Wave 11.1
        self.test_blockers()
        self.test_deposits_actions()
        self.test_payments_actions()
        self.test_pipeline_transitions()  # last — moves the deal forward
        self.test_negatives()

        print("\n" + "=" * 60)
        print("TEST SUMMARY")
        print("=" * 60)
        print(f"Total tests:  {self.tests_run}")
        print(f"✅ Passed:    {self.tests_passed}")
        print(f"❌ Failed:    {self.tests_failed}")
        if self.failures:
            print("\nFailed tests:")
            for f in self.failures:
                print("  -", f)
        rate = (self.tests_passed / self.tests_run * 100) if self.tests_run else 0
        print(f"\nSuccess rate: {rate:.1f}%")
        print("=" * 60 + "\n")
        return 0 if self.tests_failed == 0 else 1


if __name__ == "__main__":
    sys.exit(Wave11Tester().run_all())
