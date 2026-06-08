"""
BIBI Cars — Wave 12C — Forecasting 360 backend test
=====================================================

Verifies the 6 deterministic Forecasting 360 endpoints (no AI / ML / LLM):

  * GET /api/forecast/overview   — How much / When / Derail risk
  * GET /api/forecast/revenue    — Weighted revenue × stage probability
  * GET /api/forecast/cash-flow  — 13 weekly cash-in / cash-out buckets
  * GET /api/forecast/pipeline   — Stage / month / quarter buckets
  * GET /api/forecast/capacity   — Manager + carrier utilisation
  * GET /api/forecast/risk       — Forecast at risk by health segment

Acceptance criteria (from kickoff):
  1. overview shows expected revenue / cash / forecast risk for 30/60/90.
  2. revenue computes weighted revenue by deal × stage probability.
  3. cash-flow lays out cash-in / cash-out per week.
  4. pipeline shows stage buckets + conversion estimate.
  5. capacity shows manager / carrier load.
  6. risk shows forecast-at-risk with reasons.
  7. Role scope identical to Finance360 / Operations360 (admin = all,
     team_lead = team, manager = own).
  8. Wave 12A/12B/13/14 regression intact (no schema break).
"""
import os
import sys
import requests

BASE_URL = os.environ.get("BIBI_BASE_URL", "http://localhost:8001/api")
ADMIN_EMAIL    = os.environ.get("BIBI_ADMIN_EMAIL", "admin@bibi.cars")
ADMIN_PASSWORD = os.environ.get("BIBI_ADMIN_PASSWORD", "Jp3FS_7ZuE2bhHp7rFkJm9B9T_TeiHxu")
MANAGER_EMAIL    = "manager@bibi.cars"
MANAGER_PASSWORD = "dFbYnse0L59DBE16Mn4kT6cCRaNBZFQR"


class Wave12CTester:
    def __init__(self):
        self.token = None
        self.role = None
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
        body = r.json() or {}
        self.token = body.get("access_token")
        self.role  = (body.get("user") or {}).get("role")
        return self.test(f"login {e}", bool(self.token), f"role={self.role}")

    # ------------------------------------------------------------------ #
    # 1. /api/forecast/overview                                          #
    # ------------------------------------------------------------------ #
    def test_overview(self):
        self.log("\n=== GET /api/forecast/overview ===")
        r = self.get("/forecast/overview")
        if not self.test("overview 200", r.status_code == 200, f"HTTP {r.status_code}"):
            return
        body = r.json() or {}
        self.test("overview.success", body.get("success") is True)
        data = body.get("data") or {}

        for key in ("as_of", "how_much", "when", "derail", "scope", "currency"):
            self.test(f"overview.{key} present", key in data, f"got {type(data.get(key)).__name__}")

        # how_much: 30/60/90 horizons with weighted/gross/profit per bucket
        hm = data.get("how_much") or {}
        self.test("overview.how_much.horizons present", "horizons" in hm)
        horizons = hm.get("horizons") or {}
        for h in ("30", "60", "90"):
            self.test(f"overview.horizons[{h}] present", h in horizons,
                      f"got keys {list(horizons.keys())}")
            if h in horizons:
                bucket = horizons[h]
                for k in ("deals", "weighted", "gross", "profit"):
                    self.test(f"overview.horizons[{h}].{k} present", k in bucket,
                              f"got {bucket.get(k)}")

        # when: 13 weeks
        when = data.get("when") or {}
        weeks = when.get("weeks") or []
        self.test("overview.when.weeks has 13 entries", len(weeks) == 13,
                  f"got {len(weeks)}")
        if weeks:
            w0 = weeks[0]
            for k in ("week", "start", "end", "cash_in", "cash_out", "net"):
                self.test(f"overview.when.weeks[0].{k} present", k in w0,
                          f"got {w0.get(k)}")

        # derail: forecast risk packaging
        derail = data.get("derail") or {}
        for k in ("risk_total", "risk_share_pct", "by_kind", "top_items"):
            self.test(f"overview.derail.{k} present", k in derail)
        self.test("overview.derail.by_kind has financial+delivery",
                  set((derail.get("by_kind") or {}).keys()) >= {"financial", "delivery"})
        self.test("overview.currency == EUR", data.get("currency") == "EUR")

    # ------------------------------------------------------------------ #
    # 2. /api/forecast/revenue                                           #
    # ------------------------------------------------------------------ #
    def test_revenue(self):
        self.log("\n=== GET /api/forecast/revenue ===")
        r = self.get("/forecast/revenue")
        if not self.test("revenue 200", r.status_code == 200, f"HTTP {r.status_code}"):
            return
        body = r.json() or {}
        data = body.get("data") or {}

        for k in ("horizons", "by_stage", "items", "total_deals", "scope", "currency"):
            self.test(f"revenue.{k} present", k in data)

        horizons = data.get("horizons") or {}
        for h in ("30", "60", "90"):
            self.test(f"revenue.horizons[{h}] present", h in horizons)

        items = data.get("items") or []
        self.test("revenue.items is list", isinstance(items, list))
        if items:
            it = items[0]
            for k in ("deal_id", "stage", "gross", "probability", "weighted",
                      "expected_close", "days_out"):
                self.test(f"revenue.items[0].{k} present", k in it,
                          f"got {it.get(k)}")
            # mathematical invariant: weighted == gross * probability (within tolerance)
            gross = float(it.get("gross") or 0)
            prob  = float(it.get("probability") or 0)
            weight = float(it.get("weighted") or 0)
            self.test("revenue.items[0].weighted ≈ gross × probability",
                      abs(weight - gross * prob) < 1.0,
                      f"weighted={weight}, gross={gross}, prob={prob}")
            # probability is in [0,1]
            self.test("revenue.items[0].probability in [0,1]",
                      0 <= prob <= 1, f"got {prob}")

        by_stage = data.get("by_stage") or {}
        self.test("revenue.by_stage is dict", isinstance(by_stage, dict))

    # ------------------------------------------------------------------ #
    # 3. /api/forecast/cash-flow                                         #
    # ------------------------------------------------------------------ #
    def test_cashflow(self):
        self.log("\n=== GET /api/forecast/cash-flow ===")
        r = self.get("/forecast/cash-flow")
        if not self.test("cashflow 200", r.status_code == 200, f"HTTP {r.status_code}"):
            return
        data = (r.json() or {}).get("data") or {}

        weeks = data.get("weeks") or []
        self.test("cashflow has 13 weeks", len(weeks) == 13, f"got {len(weeks)}")

        if weeks:
            w0 = weeks[0]
            for k in ("week", "start", "end", "cash_in", "cash_out", "net", "running_balance"):
                self.test(f"cashflow.weeks[0].{k} present", k in w0,
                          f"got {w0.get(k)}")
            # net == cash_in - cash_out for every week
            ok = all(
                abs(float(w.get("net") or 0) -
                    (float(w.get("cash_in") or 0) - float(w.get("cash_out") or 0))) < 0.5
                for w in weeks
            )
            self.test("cashflow.weeks: net == cash_in - cash_out", ok)
            # running_balance is monotonic-cumulative
            running = 0.0
            ok_run = True
            for w in weeks:
                running += float(w.get("net") or 0)
                if abs(running - float(w.get("running_balance") or 0)) > 0.5:
                    ok_run = False
                    break
            self.test("cashflow.weeks.running_balance is cumulative net", ok_run)

        totals = data.get("totals") or {}
        for k in ("cash_in", "cash_out", "net"):
            self.test(f"cashflow.totals.{k} present", k in totals,
                      f"got {totals.get(k)}")
        self.test("cashflow.currency == EUR", data.get("currency") == "EUR")

    # ------------------------------------------------------------------ #
    # 4. /api/forecast/pipeline                                          #
    # ------------------------------------------------------------------ #
    def test_pipeline(self):
        self.log("\n=== GET /api/forecast/pipeline ===")
        r = self.get("/forecast/pipeline")
        if not self.test("pipeline 200", r.status_code == 200, f"HTTP {r.status_code}"):
            return
        data = (r.json() or {}).get("data") or {}

        for k in ("by_stage", "by_month", "by_quarter", "scope", "currency"):
            self.test(f"pipeline.{k} present", k in data)

        for k in ("by_stage", "by_month", "by_quarter"):
            v = data.get(k)
            self.test(f"pipeline.{k} is list", isinstance(v, list),
                      f"got {type(v).__name__}")

        # stage rows must include probability
        for row in data.get("by_stage") or []:
            for k in ("stage", "probability", "deals", "gross", "weighted"):
                self.test(f"pipeline.by_stage[*].{k} present", k in row, f"row={row}")
            # weighted == gross * probability (aggregate invariant per stage)
            g, p, w = float(row.get("gross") or 0), float(row.get("probability") or 0), float(row.get("weighted") or 0)
            self.test(f"pipeline.by_stage[{row.get('stage')}] weighted≈gross×p",
                      abs(w - g * p) < max(1.0, g * 0.05),  # rounding tolerance
                      f"w={w}, g={g}, p={p}")
            break  # only sanity-check first row

        # by_month/by_quarter periods are sortable strings
        months = [r.get("period") for r in (data.get("by_month") or [])]
        self.test("pipeline.by_month sorted", months == sorted(months),
                  f"got {months[:5]}")

    # ------------------------------------------------------------------ #
    # 5. /api/forecast/capacity                                          #
    # ------------------------------------------------------------------ #
    def test_capacity(self):
        self.log("\n=== GET /api/forecast/capacity ===")
        r = self.get("/forecast/capacity")
        if not self.test("capacity 200", r.status_code == 200, f"HTTP {r.status_code}"):
            return
        data = (r.json() or {}).get("data") or {}

        for k in ("managers", "carriers", "manager_target", "carrier_target", "scope"):
            self.test(f"capacity.{k} present", k in data)

        mgrs = data.get("managers") or []
        self.test("capacity.managers is list", isinstance(mgrs, list))
        for m in mgrs[:3]:
            for k in ("open_deals", "target", "utilization", "status",
                      "weighted_pipeline"):
                self.test(f"capacity.managers[*].{k} present", k in m,
                          f"row={m}")
            util = float(m.get("utilization") or 0)
            self.test("capacity.managers[*].utilization in [0,100]",
                      0 <= util <= 100, f"got {util}")
            self.test("capacity.managers[*].status valid",
                      m.get("status") in ("overloaded", "high", "healthy", "low"),
                      f"got {m.get('status')}")

        for c in (data.get("carriers") or [])[:3]:
            for k in ("open_loads", "target", "utilization", "status"):
                self.test(f"capacity.carriers[*].{k} present", k in c)

        self.test("capacity.manager_target == 8",
                  data.get("manager_target") == 8,
                  f"got {data.get('manager_target')}")
        self.test("capacity.carrier_target == 12",
                  data.get("carrier_target") == 12,
                  f"got {data.get('carrier_target')}")

    # ------------------------------------------------------------------ #
    # 6. /api/forecast/risk                                              #
    # ------------------------------------------------------------------ #
    def test_risk(self):
        self.log("\n=== GET /api/forecast/risk ===")
        r = self.get("/forecast/risk")
        if not self.test("risk 200", r.status_code == 200, f"HTTP {r.status_code}"):
            return
        data = (r.json() or {}).get("data") or {}

        for k in ("forecast_total", "risk_total", "risk_share_pct",
                   "by_kind", "items", "total", "scope", "currency"):
            self.test(f"risk.{k} present", k in data)

        ft = float(data.get("forecast_total") or 0)
        rt = float(data.get("risk_total") or 0)
        self.test("risk.risk_total <= forecast_total",
                  rt <= ft + 0.01, f"rt={rt}, ft={ft}")

        share = float(data.get("risk_share_pct") or 0)
        self.test("risk.risk_share_pct in [0,100]",
                  0 <= share <= 100, f"got {share}")

        by_kind = data.get("by_kind") or {}
        self.test("risk.by_kind has financial+delivery",
                  set(by_kind.keys()) >= {"financial", "delivery"})

        for it in (data.get("items") or [])[:3]:
            for k in ("deal_id", "weighted", "at_risk", "risk_kind",
                      "reasons", "financial_health", "delivery_health"):
                self.test(f"risk.items[*].{k} present", k in it,
                          f"row={it}")
            self.test("risk.items[*].risk_kind valid",
                      it.get("risk_kind") in ("financial", "delivery"),
                      f"got {it.get('risk_kind')}")

    # ------------------------------------------------------------------ #
    # 7. Scope                                                           #
    # ------------------------------------------------------------------ #
    def test_scope_admin(self):
        self.log("\n=== Scope: admin sees scope.all=True ===")
        r = self.get("/forecast/revenue")
        if r.status_code != 200:
            self.test("admin revenue 200", False, f"HTTP {r.status_code}")
            return
        scope = ((r.json() or {}).get("data") or {}).get("scope") or {}
        self.test("admin: scope.all is True",
                  scope.get("all") is True, f"got {scope}")

    def test_scope_manager(self):
        self.log("\n=== Scope: manager sees scope.all=False ===")
        if not self.login(MANAGER_EMAIL, MANAGER_PASSWORD):
            return
        for ep in ("overview", "revenue", "cash-flow", "pipeline", "capacity", "risk"):
            r = self.get(f"/forecast/{ep}")
            self.test(f"manager can access /forecast/{ep}",
                      r.status_code == 200, f"HTTP {r.status_code}")
        r = self.get("/forecast/revenue")
        if r.status_code == 200:
            scope = ((r.json() or {}).get("data") or {}).get("scope") or {}
            self.test("manager: scope.all is False",
                      scope.get("all") is False, f"got {scope}")
            self.test("manager: scope.managers == 1",
                      scope.get("managers") == 1, f"got {scope}")

    # ------------------------------------------------------------------ #
    # 8. Regression: 12A / 12B / 13 / 14 still reachable                 #
    # ------------------------------------------------------------------ #
    def test_regression(self):
        self.log("\n=== Regression: Wave 12A / 12B / 13 / 14 endpoints ===")
        # re-login as admin
        if not self.login(ADMIN_EMAIL, ADMIN_PASSWORD):
            return
        for ep in (
            "/finance/overview",         # 12A
            "/finance/transactions",     # 12A
            "/finance/outstanding",      # 12A
            "/finance/risk",             # 12B
            "/finance/managers/pnl",     # 12B
            "/finance/collections",      # 12B
            "/delivery/overview",        # 13
            "/operations/dashboard",     # 14
        ):
            r = self.get(ep)
            self.test(f"regression {ep} reachable",
                      r.status_code in (200, 401, 403),
                      f"HTTP {r.status_code}")
        # Forecast endpoints must NOT have created new collections
        # (we can't really query mongo here, but we can at least make sure
        #  the forecast endpoints stay idempotent — call twice and compare totals)
        a = self.get("/forecast/risk").json().get("data") or {}
        b = self.get("/forecast/risk").json().get("data") or {}
        self.test("forecast/risk is idempotent (read-only)",
                  a.get("forecast_total") == b.get("forecast_total"),
                  f"a={a.get('forecast_total')} b={b.get('forecast_total')}")

    # ------------------------------------------------------------------ #
    # 9. Auth gate                                                       #
    # ------------------------------------------------------------------ #
    def test_auth_required(self):
        self.log("\n=== Auth gate: no token → 401/403 ===")
        for ep in ("overview", "revenue", "cash-flow", "pipeline", "capacity", "risk"):
            r = requests.get(f"{BASE_URL}/forecast/{ep}", timeout=15)
            self.test(f"/forecast/{ep} blocks unauth",
                      r.status_code in (401, 403),
                      f"HTTP {r.status_code}")

    # ------------------------------------------------------------------ #
    def run_all(self):
        print("\n" + "=" * 70)
        print("BIBI Cars — Wave 12C — Forecasting 360 backend test")
        print("=" * 70)

        self.test_auth_required()

        if not self.login():
            return 1

        self.test_overview()
        self.test_revenue()
        self.test_cashflow()
        self.test_pipeline()
        self.test_capacity()
        self.test_risk()
        self.test_scope_admin()
        self.test_scope_manager()
        self.test_regression()

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
    sys.exit(Wave12CTester().run_all())
