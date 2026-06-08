"""
BIBI Cars — Wave 16 — Executive Center backend test
======================================================

Verifies the 5 orchestrating endpoints under `/api/executive/*` and
checks that the Executive Center stays consistent with the underlying
360 modules (Wave 12C / 13 / 14 / 15).

Endpoints:
  1. /api/executive/dashboard   — 15-tile KPI surface + 30/60/90 horizons
  2. /api/executive/forecast    — outlook + 13-week cash flow + risk
  3. /api/executive/bottlenecks — unified Type/Severity/Owner/Impact/Reason/Action table
  4. /api/executive/risks       — Lead + Financial + Delivery + Contract merged
  5. /api/executive/team        — Wave14 team + forecast_accuracy + contracts_at_risk

Cross-checks (the whole point of Executive Center):
  * dashboard.tiles.active_deals       == company-dashboard.tiles.active_deals
  * dashboard.tiles.unsigned_contracts == contract-overview.totals.overdue_signature
  * dashboard.tiles.revenue_at_risk    == forecast/overview.derail.risk_total
  * executive/risks.total              >= risk-center.total
  * Wave 12C / 13 / 14 / 15 still return 200 (zero drift).
"""
import os
import sys
import requests

BASE_URL = os.environ.get("BIBI_BASE_URL", "http://localhost:8001/api")
ADMIN_EMAIL    = os.environ.get("BIBI_ADMIN_EMAIL", "admin@bibi.cars")
ADMIN_PASSWORD = os.environ.get("BIBI_ADMIN_PASSWORD", "Jp3FS_7ZuE2bhHp7rFkJm9B9T_TeiHxu")
MANAGER_EMAIL    = "manager@bibi.cars"
MANAGER_PASSWORD = "dFbYnse0L59DBE16Mn4kT6cCRaNBZFQR"


class Wave16Tester:
    def __init__(self):
        self.token = None
        self.role = None
        self.tests_run = 0
        self.tests_passed = 0
        self.tests_failed = 0
        self.failures = []
        self.cleanup_ids = []

    def log(self, msg, level="INFO"):
        prefix = "✅" if level == "PASS" else "❌" if level == "FAIL" else "🔍"
        print(f"{prefix} {msg}")

    def test(self, name, cond, detail=""):
        self.tests_run += 1
        if cond:
            self.tests_passed += 1
            self.log(f"PASS: {name}", "PASS")
            if detail: print(f"   └─ {detail}")
            return True
        self.tests_failed += 1
        self.failures.append(name)
        self.log(f"FAIL: {name}", "FAIL")
        if detail: print(f"   └─ {detail}")
        return False

    def _h(self):
        return {"Authorization": f"Bearer {self.token}", "Content-Type": "application/json"}

    def get(self, path, **kw):
        return requests.get(f"{BASE_URL}{path}", headers=self._h(), timeout=30, **kw)

    def post(self, path, body=None, **kw):
        return requests.post(f"{BASE_URL}{path}", json=body or {}, headers=self._h(), timeout=30, **kw)

    def login(self, email=None, password=None):
        e = email or ADMIN_EMAIL
        p = password or ADMIN_PASSWORD
        r = requests.post(f"{BASE_URL}/auth/login",
                          json={"email": e, "password": p}, timeout=15)
        if r.status_code != 200:
            self.test(f"login {e}", False, f"HTTP {r.status_code} {r.text[:200]}")
            return False
        body = r.json() or {}
        self.token = body.get("access_token")
        self.role = (body.get("user") or {}).get("role")
        return self.test(f"login {e}", bool(self.token), f"role={self.role}")

    # ---------------------------------------------------------------- #
    # 0. Auth gate
    # ---------------------------------------------------------------- #
    def test_auth(self):
        self.log("\n=== Auth gate ===")
        for ep in ("dashboard", "forecast", "bottlenecks", "risks", "team"):
            r = requests.get(f"{BASE_URL}/executive/{ep}", timeout=15)
            self.test(f"/executive/{ep} blocks unauth",
                      r.status_code in (401, 403),
                      f"HTTP {r.status_code}")

    # ---------------------------------------------------------------- #
    # 1. /executive/dashboard
    # ---------------------------------------------------------------- #
    def test_dashboard(self):
        self.log("\n=== GET /executive/dashboard ===")
        r = self.get("/executive/dashboard")
        if not self.test("dashboard 200", r.status_code == 200, f"HTTP {r.status_code}"):
            return None
        body = r.json() or {}
        self.test("dashboard.success", body.get("success") is True)
        data = body.get("data") or {}
        for k in ("as_of", "tiles", "horizons", "scope", "currency"):
            self.test(f"dashboard.{k} present", k in data)
        tiles = data.get("tiles") or {}
        for tile in (
            "active_leads", "active_customers", "active_deals",
            "revenue_mtd", "profit_mtd", "outstanding", "collections",
            "cars_in_transit", "critical_deliveries",
            "unsigned_contracts", "pending_approvals", "expiring_contracts",
            "active_contracts", "unsigned_value", "revenue_at_risk",
        ):
            self.test(f"dashboard.tiles.{tile} present", tile in tiles,
                      f"got {tiles.get(tile)}")
        self.test("dashboard.currency == EUR", data.get("currency") == "EUR")
        horizons = data.get("horizons") or {}
        for h in ("30", "60", "90"):
            self.test(f"dashboard.horizons[{h}] present", h in horizons)
            if h in horizons:
                for k in ("deals", "weighted", "gross", "profit"):
                    self.test(f"dashboard.horizons[{h}].{k} present", k in (horizons[h] or {}))
        self.test("admin scope.all == True",
                  (data.get("scope") or {}).get("all") is True)
        return data

    # ---------------------------------------------------------------- #
    # 2. /executive/forecast (proxies Wave 12C)
    # ---------------------------------------------------------------- #
    def test_forecast(self):
        self.log("\n=== GET /executive/forecast ===")
        r = self.get("/executive/forecast")
        if not self.test("forecast 200", r.status_code == 200):
            return None
        data = (r.json() or {}).get("data") or {}
        for k in ("horizons", "weeks", "cash_in_total", "cash_out_total",
                   "forecast_risk", "by_stage", "scope", "currency"):
            self.test(f"forecast.{k} present", k in data)
        horizons = data.get("horizons") or {}
        for h in ("30", "60", "90"):
            self.test(f"forecast.horizons[{h}] present", h in horizons)
            if h in horizons:
                for k in ("expected_revenue", "expected_profit", "weighted_revenue",
                          "pipeline_value", "deals"):
                    self.test(f"forecast.horizons[{h}].{k} present", k in horizons[h])
        weeks = data.get("weeks") or []
        self.test("forecast.weeks count == 13", len(weeks) == 13, f"got {len(weeks)}")
        risk = data.get("forecast_risk") or {}
        for k in ("value", "share_pct", "by_kind", "top_items"):
            self.test(f"forecast.forecast_risk.{k} present", k in risk)
        return data

    # ---------------------------------------------------------------- #
    # 3. /executive/bottlenecks
    # ---------------------------------------------------------------- #
    def test_bottlenecks(self):
        self.log("\n=== GET /executive/bottlenecks ===")
        r = self.get("/executive/bottlenecks")
        if not self.test("bottlenecks 200", r.status_code == 200):
            return None
        data = (r.json() or {}).get("data") or {}
        for k in ("items", "total", "by_type", "by_severity",
                   "impact_total", "impact_critical", "scope", "currency"):
            self.test(f"bottlenecks.{k} present", k in data)

        # Each row must have the canonical 7-column schema.
        for row in (data.get("items") or [])[:3]:
            for k in ("type", "severity", "owner", "label", "impact", "reason", "action"):
                self.test(f"bottlenecks.items[*].{k} present", k in row,
                          f"row={row}")
            self.test("bottlenecks.items[*].type valid",
                      row.get("type") in ("operations", "financial", "delivery", "contract", "lead"),
                      f"got {row.get('type')}")
        return data

    # ---------------------------------------------------------------- #
    # 4. /executive/risks
    # ---------------------------------------------------------------- #
    def test_risks(self):
        self.log("\n=== GET /executive/risks ===")
        r = self.get("/executive/risks")
        if not self.test("risks 200", r.status_code == 200):
            return None
        data = (r.json() or {}).get("data") or {}
        for k in ("items", "total", "by_kind", "by_segment", "summary", "scope"):
            self.test(f"risks.{k} present", k in data)
        summary = data.get("summary") or {}
        for k in ("critical", "at_risk", "warning"):
            self.test(f"risks.summary.{k} present", k in summary, f"got {summary.get(k)}")
        for row in (data.get("items") or [])[:3]:
            for k in ("entity_type", "entity_id", "label", "segment", "score",
                      "risk_kind", "reasons"):
                self.test(f"risks.items[*].{k} present", k in row, f"row={row}")
        return data

    # ---------------------------------------------------------------- #
    # 5. /executive/team
    # ---------------------------------------------------------------- #
    def test_team(self):
        self.log("\n=== GET /executive/team ===")
        r = self.get("/executive/team")
        if not self.test("team 200", r.status_code == 200):
            return None
        data = (r.json() or {}).get("data") or {}
        for k in ("items", "total", "scope", "currency"):
            self.test(f"team.{k} present", k in data)
        for row in (data.get("items") or [])[:3]:
            for k in ("manager_id", "manager_name", "leads", "deals",
                      "revenue", "profit", "outstanding", "collections",
                      "conversion_rate", "ops_score",
                      "forecast_accuracy", "contracts_at_risk"):
                self.test(f"team.items[*].{k} present", k in row, f"row={row}")
            ops = row.get("ops_score")
            if ops is not None:
                self.test("team.ops_score in [0,100]",
                          0 <= int(ops) <= 100, f"got {ops}")
            fa = row.get("forecast_accuracy")
            if fa is not None:
                self.test("team.forecast_accuracy in [0,100]",
                          0 <= float(fa) <= 100, f"got {fa}")

    # ---------------------------------------------------------------- #
    # 6. Cross-consistency (Executive ↔ source 360s)
    # ---------------------------------------------------------------- #
    def test_consistency(self):
        self.log("\n=== Consistency: Executive ↔ source 360s ===")
        d = (self.get("/executive/dashboard").json() or {}).get("data") or {}
        op = (self.get("/operations/dashboard").json() or {}).get("data") or {}
        co = (self.get("/contracts/overview").json() or {}).get("data") or {}
        fo = (self.get("/forecast/overview").json() or {}).get("data") or {}

        # active_deals identical to Operations360
        self.test("dashboard.active_deals == operations.active_deals",
                  (d.get("tiles") or {}).get("active_deals") ==
                  (op.get("tiles") or {}).get("active_deals"),
                  f"exec={(d.get('tiles') or {}).get('active_deals')} ops={(op.get('tiles') or {}).get('active_deals')}")
        # unsigned_contracts identical to Contract360
        self.test("dashboard.unsigned_contracts == contracts.totals.overdue_signature",
                  (d.get("tiles") or {}).get("unsigned_contracts") ==
                  (co.get("totals") or {}).get("overdue_signature"),
                  f"exec={(d.get('tiles') or {}).get('unsigned_contracts')} contracts={(co.get('totals') or {}).get('overdue_signature')}")
        # revenue_at_risk identical to forecast/overview.derail.risk_total
        self.test("dashboard.revenue_at_risk == forecast.derail.risk_total",
                  abs(float((d.get("tiles") or {}).get("revenue_at_risk") or 0) -
                      float((fo.get("derail") or {}).get("risk_total") or 0)) < 0.5,
                  f"exec={(d.get('tiles') or {}).get('revenue_at_risk')} forecast={(fo.get('derail') or {}).get('risk_total')}")

        # Risks union >= sources individually
        risks = (self.get("/executive/risks").json() or {}).get("data") or {}
        c_risk = (self.get("/contracts/risk").json() or {}).get("data") or {}
        self.test("executive/risks.total >= contracts/risk.total",
                  int(risks.get("total") or 0) >= int(c_risk.get("total") or 0),
                  f"exec={risks.get('total')} contracts={c_risk.get('total')}")

    # ---------------------------------------------------------------- #
    # 7. Scope (manager)
    # ---------------------------------------------------------------- #
    def test_scope_manager(self):
        self.log("\n=== Scope: manager ===")
        if not self.login(MANAGER_EMAIL, MANAGER_PASSWORD):
            return
        for ep in ("dashboard", "forecast", "bottlenecks", "risks", "team"):
            r = self.get(f"/executive/{ep}")
            self.test(f"manager /executive/{ep} 200", r.status_code == 200,
                      f"HTTP {r.status_code}")
        d = (self.get("/executive/dashboard").json() or {}).get("data") or {}
        scope = d.get("scope") or {}
        self.test("manager scope.all == False",
                  scope.get("all") is False, f"got {scope}")
        # IMPORTANT: should not blow up if no team rows
        team = (self.get("/executive/team").json() or {}).get("data") or {}
        self.test("manager team endpoint returns items list",
                  isinstance(team.get("items"), list))

    # ---------------------------------------------------------------- #
    # 8. Regression: 12A/12B/12C/13/14/15 still 200
    # ---------------------------------------------------------------- #
    def test_regression(self):
        self.log("\n=== Regression: prior waves ===")
        if not self.login(ADMIN_EMAIL, ADMIN_PASSWORD): return
        for ep in (
            "/finance/overview",          # 12A
            "/finance/risk",              # 12B
            "/forecast/overview",         # 12C
            "/forecast/cash-flow",        # 12C
            "/delivery/overview",         # 13
            "/operations/dashboard",      # 14
            "/operations/bottlenecks",    # 14
            "/contracts/overview",        # 15
            "/contracts/risk",            # 15
            "/contracts/templates",       # 15
        ):
            r = self.get(ep)
            self.test(f"regression {ep} still 200",
                      r.status_code == 200, f"HTTP {r.status_code}")

    # ---------------------------------------------------------------- #
    def run_all(self):
        print("\n" + "=" * 70)
        print("BIBI Cars — Wave 16 — Executive Center backend test")
        print("=" * 70)
        self.test_auth()
        if not self.login():
            return 1
        # seed a minimal contract so Contract360 numbers are non-zero (and we
        # actually exercise the Executive cross-checks).
        try:
            r = self.post("/contracts", {"template": "purchase", "title": "Wave16 seed", "amount": 5000})
            cid = (r.json() or {}).get("data", {}).get("id")
            if cid:
                self.cleanup_ids.append(cid)
                # push to pending_approval so it shows up in pending_approvals
                self.post(f"/contracts/{cid}/send")
        except Exception:
            pass

        self.test_dashboard()
        self.test_forecast()
        self.test_bottlenecks()
        self.test_risks()
        self.test_team()
        self.test_consistency()
        self.test_scope_manager()
        self.test_regression()

        # cleanup
        for cid in self.cleanup_ids:
            try:
                self.post(f"/contracts/{cid}/archive")
            except Exception:
                pass

        print("\n" + "=" * 70)
        print("TEST SUMMARY")
        print("=" * 70)
        print(f"Total: {self.tests_run}")
        print(f"✅ Passed: {self.tests_passed}")
        print(f"❌ Failed: {self.tests_failed}")
        if self.failures:
            print("\nFailed:")
            for f in self.failures:
                print("  -", f)
        rate = (self.tests_passed / self.tests_run * 100) if self.tests_run else 0
        print(f"\nSuccess rate: {rate:.1f}%")
        print("=" * 70 + "\n")
        return 0 if self.tests_failed == 0 else 1


if __name__ == "__main__":
    sys.exit(Wave16Tester().run_all())
