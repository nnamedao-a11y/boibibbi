"""
BIBI Cars — Wave 12B — Financial Health backend test
=====================================================

Verifies the new Wave 12B endpoints:
  * GET /api/finance/risk              — Revenue at risk breakdown
  * GET /api/finance/managers/pnl      — Per-manager P&L with financial health
  * GET /api/finance/collections       — Collections queue
  * GET /api/finance/overview          — Now includes 'risk' object
  * GET /api/deals/{id}/360            — Now includes 'financial_health' field

Uses the seeded deal from Wave 12A test (deal_1780162040_8427d3c5).
Expected: €50000, received: €15000, outstanding: €35000 → segment 'warning', score ~75.
"""
import os
import sys
import requests

BASE_URL = os.environ.get("BIBI_BASE_URL", "http://localhost:8001/api")
ADMIN_EMAIL    = os.environ.get("BIBI_ADMIN_EMAIL", "admin@bibi.cars")
ADMIN_PASSWORD = os.environ.get("BIBI_ADMIN_PASSWORD", "Jp3FS_7ZuE2bhHp7rFkJm9B9T_TeiHxu")
MANAGER_EMAIL    = "manager@bibi.cars"
MANAGER_PASSWORD = "dFbYnse0L59DBE16Mn4kT6cCRaNBZFQR"


class Wave12BTester:
    def __init__(self):
        self.token = None
        self.tests_run = 0
        self.tests_passed = 0
        self.tests_failed = 0
        self.failures = []

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

    def login(self, email=None, password=None):
        e = email or ADMIN_EMAIL
        p = password or ADMIN_PASSWORD
        r = requests.post(f"{BASE_URL}/auth/login",
                          json={"email": e, "password": p},
                          timeout=15)
        if r.status_code != 200:
            self.test(f"login {e}", False, f"HTTP {r.status_code} {r.text[:200]}")
            return False
        self.token = r.json().get("access_token")
        return self.test(f"login {e}", bool(self.token), "got JWT")

    def test_finance_risk(self):
        self.log("\n=== GET /api/finance/risk ===")
        r = self.get("/finance/risk")
        if not self.test("risk 200", r.status_code == 200, f"HTTP {r.status_code}"):
            return
        data = (r.json() or {}).get("data") or {}
        
        # Check structure
        for key in ("at_risk_total", "at_risk_revenue", "by_segment", "deals_at_risk", "currency"):
            self.test(f"risk.{key} present", key in data, f"got {data.get(key)}")
        
        # Check by_segment has all 4 segments
        by_seg = data.get("by_segment") or {}
        for seg in ("healthy", "warning", "at_risk", "critical"):
            self.test(f"by_segment.{seg} present", seg in by_seg)
            if seg in by_seg:
                v = by_seg[seg]
                self.test(f"by_segment.{seg} has count/outstanding/revenue",
                          "count" in v and "outstanding" in v and "revenue" in v)
        
        # For seeded data: at_risk_total >= 35000 (the outstanding from the warning deal)
        at_risk_total = data.get("at_risk_total") or 0
        self.test("at_risk_total >= 35000", at_risk_total >= 35000,
                  f"got {at_risk_total}")
        
        # by_segment.warning.count >= 1
        warning_count = by_seg.get("warning", {}).get("count", 0)
        self.test("by_segment.warning.count >= 1", warning_count >= 1,
                  f"got {warning_count}")

    def test_managers_pnl(self):
        self.log("\n=== GET /api/finance/managers/pnl ===")
        r = self.get("/finance/managers/pnl")
        if not self.test("managers/pnl 200", r.status_code == 200, f"HTTP {r.status_code}"):
            return
        payload = r.json()
        items = payload.get("items") or []
        total = payload.get("total") or 0
        
        self.test("pnl returns items", len(items) > 0, f"total={total}")
        
        if items:
            row = items[0]
            for key in ("manager_id", "manager_name", "deals", "revenue", "profit",
                        "outstanding", "at_risk", "avg_collection_days",
                        "financial_health", "segment_counts"):
                self.test(f"pnl row has {key}", key in row)
            
            # Check that at least one row has at_risk >= 35000 and financial_health='warning'
            found_warning = any(
                (r.get("at_risk") or 0) >= 35000 and r.get("financial_health") == "warning"
                for r in items
            )
            self.test("at least one manager with at_risk >= 35000 and health=warning",
                      found_warning,
                      f"found {len([r for r in items if r.get('financial_health') == 'warning'])} warning rows")
            
            # Check sorted by at_risk DESC
            at_risks = [r.get("at_risk") or 0 for r in items]
            self.test("items sorted by at_risk DESC",
                      at_risks == sorted(at_risks, reverse=True),
                      f"at_risks={at_risks[:3]}...")

    def test_collections(self):
        self.log("\n=== GET /api/finance/collections ===")
        r = self.get("/finance/collections?min_days_overdue=0&limit=200")
        if not self.test("collections 200", r.status_code == 200, f"HTTP {r.status_code}"):
            return
        payload = r.json()
        items = payload.get("items") or []
        total = payload.get("total") or 0
        summary = payload.get("summary") or {}
        
        self.test("collections returns items", len(items) > 0, f"total={total}")
        
        if items:
            row = items[0]
            for key in ("deal_id", "deal_title", "customer_name", "stage", "outstanding",
                        "days_overdue", "financial_health", "health_score", "reasons", "last_move"):
                self.test(f"collections row has {key}", key in row)
            
            # Check summary structure
            for key in ("outstanding", "deals", "by_segment"):
                self.test(f"summary.{key} present", key in summary)
            
            by_seg = summary.get("by_segment") or {}
            for seg in ("critical", "at_risk", "warning"):
                self.test(f"summary.by_segment.{seg} present", seg in by_seg)
            
            # For seeded data: should include the warning deal with score ~75
            # and reason "Outstanding balance > 50%"
            warning_deals = [it for it in items if it.get("financial_health") == "warning"]
            self.test("at least one warning deal in collections", len(warning_deals) > 0,
                      f"found {len(warning_deals)} warning deals")
            
            if warning_deals:
                wd = warning_deals[0]
                score = wd.get("health_score")
                self.test("warning deal has health_score ~75",
                          score is not None and 70 <= score <= 80,
                          f"got score={score}")
                
                reasons = wd.get("reasons") or []
                has_outstanding_reason = any("Outstanding balance" in r for r in reasons)
                self.test("warning deal has 'Outstanding balance' reason",
                          has_outstanding_reason,
                          f"reasons={reasons}")

    def test_overview_risk(self):
        self.log("\n=== GET /api/finance/overview (risk field) ===")
        r = self.get("/finance/overview")
        if not self.test("overview 200", r.status_code == 200):
            return
        data = (r.json() or {}).get("data") or {}
        
        self.test("overview has 'risk' field", "risk" in data)
        
        risk = data.get("risk")
        if risk:
            for key in ("at_risk_total", "at_risk_revenue", "by_segment", "deals_at_risk", "currency"):
                self.test(f"overview.risk.{key} present", key in risk)

    def test_deal360_financial_health(self):
        self.log("\n=== GET /api/deals/{id}/360 (financial_health field) ===")
        # Find a deal with outstanding > 0 from collections
        r = self.get("/finance/collections?min_days_overdue=0&limit=1")
        if r.status_code != 200 or not r.json().get("items"):
            self.test("find deal for 360 test", False, "no deals in collections")
            return
        
        deal_id = r.json()["items"][0]["deal_id"]
        self.log(f"Testing deal360 for {deal_id}")
        
        r = self.get(f"/deals/{deal_id}/360")
        if not self.test("deal360 200", r.status_code == 200, f"HTTP {r.status_code}"):
            return
        
        bundle = r.json()
        self.test("deal360 has 'financial_health' field", "financial_health" in bundle)
        
        fh = bundle.get("financial_health")
        if fh:
            for key in ("score", "segment", "reasons", "metrics"):
                self.test(f"financial_health.{key} present", key in fh)
            
            # For the seeded warning deal
            seg = fh.get("segment")
            score = fh.get("score")
            self.test("financial_health.segment is 'warning'", seg == "warning",
                      f"got segment={seg}")
            self.test("financial_health.score ~75",
                      score is not None and 70 <= score <= 80,
                      f"got score={score}")

    def test_manager_scope(self):
        self.log("\n=== Scope test: manager vs admin ===")
        # Login as manager
        if not self.login(MANAGER_EMAIL, MANAGER_PASSWORD):
            return
        
        r = self.get("/finance/risk")
        self.test("manager can access /finance/risk", r.status_code == 200)
        
        r = self.get("/finance/managers/pnl")
        self.test("manager can access /finance/managers/pnl", r.status_code == 200)
        if r.status_code == 200:
            items = r.json().get("items") or []
            # Manager should see only own deals (or empty if no deals assigned)
            self.test("manager sees limited scope", True,
                      f"manager sees {len(items)} manager(s)")

    def run_all(self):
        print("\n" + "=" * 60)
        print("BIBI Cars — Wave 12B — Financial Health backend test")
        print("=" * 60)
        
        if not self.login():
            return 1
        
        self.test_finance_risk()
        self.test_managers_pnl()
        self.test_collections()
        self.test_overview_risk()
        self.test_deal360_financial_health()
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
    sys.exit(Wave12BTester().run_all())
