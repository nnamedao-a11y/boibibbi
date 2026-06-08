"""
BIBI Cars — Wave 12A — Finance360 backend test
==============================================

Verifies the operational money control center end-to-end:
  * GET /api/finance/overview      — KPIs aggregate correctly across scope
  * GET /api/finance/transactions  — unified journal, filters work
  * GET /api/finance/refunds       — alias filtered to type=refund
  * GET /api/finance/outstanding   — non-terminal deals owing money,
                                     sorted by days_overdue desc
  * GET /api/finance/managers      — scope-aware managers list

Uses the existing seeded admin from /app/memory/test_credentials.md.
Adds a fresh deal + customer + deposit + payment so the test runs on any
DB state without depending on pre-existing data.
"""
import os
import sys
import time
import requests

BASE_URL = os.environ.get("BIBI_BASE_URL", "https://repo-setup-82.preview.emergentagent.com/api")
ADMIN_EMAIL    = os.environ.get("BIBI_ADMIN_EMAIL", "admin@bibi.cars")
ADMIN_PASSWORD = os.environ.get("BIBI_ADMIN_PASSWORD", "Jp3FS_7ZuE2bhHp7rFkJm9B9T_TeiHxu")


class Wave12Tester:
    def __init__(self):
        self.token = None
        self.tests_run = 0
        self.tests_passed = 0
        self.tests_failed = 0
        self.failures = []
        self.deal_id = None
        self.customer_id = None
        self.dep_id = None
        self.pay_id = None

    # plumbing ------------------------------------------------------------
    def log(self, msg, level="INFO"):
        prefix = "✅" if level == "PASS" else "❌" if level == "FAIL" else "🔍"
        print(f"{prefix} {msg}")

    def test(self, name, cond, detail=""):
        self.tests_run += 1
        if cond:
            self.tests_passed += 1
            self.log(f"PASS: {name}", "PASS")
            if detail:
                print(f"   └─ {detail}")
            return True
        self.tests_failed += 1
        self.failures.append(name)
        self.log(f"FAIL: {name}", "FAIL")
        if detail:
            print(f"   └─ {detail}")
        return False

    def _h(self):
        return {"Authorization": f"Bearer {self.token}", "Content-Type": "application/json"}

    def get(self, path, **kw):
        return requests.get(f"{BASE_URL}{path}", headers=self._h(), timeout=30, **kw)

    def post(self, path, **kw):
        return requests.post(f"{BASE_URL}{path}", headers=self._h(), timeout=30, **kw)

    # setup ---------------------------------------------------------------
    def login(self):
        r = requests.post(f"{BASE_URL}/auth/login",
                          json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
                          timeout=15)
        if r.status_code != 200:
            self.test("login", False, f"HTTP {r.status_code} {r.text[:200]}")
            return False
        self.token = r.json().get("access_token")
        return self.test("login", bool(self.token), "got JWT")

    def seed(self):
        cust = self.post("/customers", json={
            "name": "Wave12 Tester",
            "email": f"wave12.{int(time.time())}@example.com",
            "phone": "+359888000222",
            "company": "Wave12 Co",
        })
        if not self.test("seed customer", cust.status_code == 200, f"HTTP {cust.status_code}"):
            return False
        self.customer_id = (cust.json().get("customer") or cust.json().get("data") or {}).get("id")

        deal = self.post("/deals", json={
            "title": "Wave12 e2e deal",
            "customerId":  self.customer_id,
            "customer_id": self.customer_id,
            "clientPrice": 50000,
            "internal_cost": 38000,
            "profit": 12000,
            "currency": "EUR",
            "vin": "WP0AB29927S730666",
            "status": "negotiation",
            "stage":  "awaiting_deposit",
            "created_by": ADMIN_EMAIL,
        })
        if not self.test("seed deal", deal.status_code == 200, f"HTTP {deal.status_code}"):
            return False
        self.deal_id = (deal.json().get("deal") or deal.json().get("data") or {}).get("id")

        # Register + confirm a deposit
        r = self.post(f"/deals/{self.deal_id}/deposits",
                      json={"amount": 5000, "method": "bank_transfer", "note": "Wave12 deposit"})
        if not self.test("seed deposit", r.status_code == 200): return False
        self.dep_id = (r.json().get("data") or {}).get("id")
        r = self.post(f"/deals/{self.deal_id}/deposits/{self.dep_id}/confirm",
                      json={"note": "confirmed by wave12 test"})
        self.test("confirm deposit", r.status_code == 200)

        # Register a pending payment + a confirmed one + a refunded one
        for status, amt in (("confirmed", 15000), ("pending", 8000)):
            r = self.post(f"/deals/{self.deal_id}/payments",
                          json={"amount": amt, "type": "milestone", "status": status})
            self.test(f"seed payment ({status})", r.status_code == 200)

        return True

    # tests ---------------------------------------------------------------
    def test_overview(self):
        self.log("\n=== /api/finance/overview ===")
        r = self.get("/finance/overview")
        if not self.test("overview 200", r.status_code == 200, f"HTTP {r.status_code}"):
            return
        data = (r.json() or {}).get("data") or {}
        for key in ("scope", "currency", "counts", "totals", "by_stage"):
            self.test(f"overview.{key} present", key in data)

        t = data.get("totals") or {}
        # Revenue >= our seed (50000)
        self.test("totals.revenue >= 50000",
                  (t.get("revenue") or 0) >= 50000,
                  f"got {t.get('revenue')}")
        # Deposit received >= 5000 (the one we just confirmed)
        self.test("totals.deposit_received >= 5000",
                  (t.get("deposit_received") or 0) >= 5000,
                  f"got {t.get('deposit_received')}")
        # Payment received >= 15000 (the confirmed one)
        self.test("totals.payment_received >= 15000",
                  (t.get("payment_received") or 0) >= 15000,
                  f"got {t.get('payment_received')}")
        # Payment pending >= 8000
        self.test("totals.payment_pending >= 8000",
                  (t.get("payment_pending") or 0) >= 8000,
                  f"got {t.get('payment_pending')}")
        # Outstanding > 0
        self.test("totals.outstanding > 0",
                  (t.get("outstanding") or 0) > 0,
                  f"got {t.get('outstanding')}")

    def test_transactions(self):
        self.log("\n=== /api/finance/transactions ===")
        r = self.get("/finance/transactions?limit=100")
        if not self.test("transactions 200", r.status_code == 200): return
        payload = r.json()
        items = payload.get("items") or []
        self.test("transactions returns items", len(items) > 0, f"total={payload.get('total')}")

        # Type filter
        r = self.get("/finance/transactions?type=deposit&limit=100")
        items = r.json().get("items") or []
        self.test("filter type=deposit returns only deposits",
                  all(it["type"] == "deposit" for it in items),
                  f"{len(items)} items")
        self.test("at least one deposit visible",
                  any(it.get("ref_id") == self.dep_id for it in items),
                  f"deposit {self.dep_id} present")

        # Type=payment
        r = self.get("/finance/transactions?type=payment&limit=100")
        items = r.json().get("items") or []
        self.test("filter type=payment returns only payments",
                  all(it["type"] == "payment" for it in items),
                  f"{len(items)} items")

        # Status filter
        r = self.get("/finance/transactions?status=pending&limit=100")
        items = r.json().get("items") or []
        self.test("filter status=pending all pending",
                  all(it["status"] == "pending" for it in items),
                  f"{len(items)} items")

        # Search filter on title
        r = self.get("/finance/transactions?q=Wave12+e2e&limit=100")
        items = r.json().get("items") or []
        self.test("search q=Wave12+e2e returns rows",
                  any("Wave12 e2e" in (it.get("deal_title") or "") for it in items),
                  f"{len(items)} items match")

    def test_refunds(self):
        self.log("\n=== /api/finance/refunds ===")
        # Refund the confirmed deposit so refunds appear
        r = self.post(f"/deals/{self.deal_id}/deposits/{self.dep_id}/refund",
                      json={"note": "Wave12 refund test"})
        self.test("refund deposit 200", r.status_code == 200)

        r = self.get("/finance/refunds?limit=100")
        if not self.test("refunds 200", r.status_code == 200): return
        items = r.json().get("items") or []
        self.test("refunds list contains the just-refunded one",
                  any(it.get("ref_id") == self.dep_id for it in items),
                  f"{len(items)} refund(s)")
        self.test("refunds all have type=refund",
                  all(it["type"] == "refund" for it in items),
                  f"{len(items)} items")

    def test_outstanding(self):
        self.log("\n=== /api/finance/outstanding ===")
        r = self.get("/finance/outstanding?limit=100")
        if not self.test("outstanding 200", r.status_code == 200): return
        items = r.json().get("items") or []
        summary = r.json().get("summary") or {}
        self.test("outstanding returns deals", len(items) > 0, f"{len(items)} deal(s)")
        # Our seed deal should appear (revenue 50000 - 15000 confirmed payment - now-refunded deposit = 35000)
        seed = next((it for it in items if it.get("deal_id") == self.deal_id), None)
        self.test("seed deal in outstanding list", seed is not None)
        if seed:
            self.test("seed deal expected = 50000", seed.get("expected") == 50000,
                      f"got {seed.get('expected')}")
            self.test("seed deal outstanding > 0",
                      (seed.get("outstanding") or 0) > 0,
                      f"got {seed.get('outstanding')}")
        self.test("summary.outstanding > 0", (summary.get("outstanding") or 0) > 0,
                  f"got {summary.get('outstanding')}")

        # Sort: items must be in descending order by days_overdue (None last)
        seq = [it.get("days_overdue") or 0 for it in items]
        self.test("items sorted by days_overdue desc",
                  seq == sorted(seq, reverse=True),
                  f"seq={seq[:5]}…")

    def test_managers(self):
        self.log("\n=== /api/finance/managers ===")
        r = self.get("/finance/managers")
        if not self.test("managers 200", r.status_code == 200): return
        items = r.json().get("items") or []
        # Admin sees ALL → at least the 2 seeded staff (manager + team_lead)
        self.test("admin sees >= 2 managers", len(items) >= 2,
                  f"got {len(items)}: {[m.get('email') for m in items]}")

    def test_manager_scope(self):
        """As a manager-role user, finance should only see own deals."""
        self.log("\n=== Scope: manager-only ===")
        r = requests.post(f"{BASE_URL}/auth/login",
                          json={"email": "manager@bibi.cars",
                                "password": "dFbYnse0L59DBE16Mn4kT6cCRaNBZFQR"},
                          timeout=15)
        if not self.test("manager login", r.status_code == 200, f"HTTP {r.status_code}"):
            return
        mtok = r.json().get("access_token")
        H = {"Authorization": f"Bearer {mtok}"}
        r = requests.get(f"{BASE_URL}/finance/overview", headers=H, timeout=15)
        self.test("manager overview 200", r.status_code == 200)
        if r.status_code == 200:
            scope = (r.json().get("data") or {}).get("scope") or {}
            self.test("manager scope is NOT all", scope.get("all") is False,
                      f"got scope.all={scope.get('all')}")

    # runner --------------------------------------------------------------
    def run_all(self):
        print("\n" + "=" * 60)
        print("BIBI Cars — Wave 12A — Finance360 backend test")
        print("=" * 60)
        if not self.login(): return 1
        if not self.seed():  return 1
        self.test_overview()
        self.test_transactions()
        self.test_refunds()
        self.test_outstanding()
        self.test_managers()
        self.test_manager_scope()

        print("\n" + "=" * 60)
        print("TEST SUMMARY")
        print("=" * 60)
        print(f"Total: {self.tests_run}")
        print(f"✅ Passed: {self.tests_passed}")
        print(f"❌ Failed: {self.tests_failed}")
        if self.failures:
            print("\nFailed:")
            for f in self.failures:
                print("  -", f)
        rate = (self.tests_passed / self.tests_run * 100) if self.tests_run else 0
        print(f"\nSuccess rate: {rate:.1f}%")
        print("=" * 60 + "\n")
        return 0 if self.tests_failed == 0 else 1


if __name__ == "__main__":
    sys.exit(Wave12Tester().run_all())
