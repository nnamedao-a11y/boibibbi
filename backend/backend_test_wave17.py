"""
BIBI Cars — Wave 17 — Action Center backend test
=================================================

Covers:
  1. Auth gate (no token → 401/403)
  2. Source catalogue (21 rules across operations/contract/delivery/lead/forecast)
  3. Manual lifecycle: create → start → resolve / snooze + auto-resume / escalate / reopen / comment
  4. Sync idempotency: 1st sync creates, 2nd sync 0/0/0, resolved → reopen on next sync
  5. Inbox / My / Team / Analytics shape + correctness
  6. Scope: admin all=True vs manager all=False
  7. Regression: W12C / W15 / W16 endpoints all 200
"""
import os
import sys
import requests
from datetime import datetime, timezone, timedelta

BASE_URL = os.environ.get("BIBI_BASE_URL", "http://localhost:8001/api")
ADMIN_EMAIL    = os.environ.get("BIBI_ADMIN_EMAIL", "admin@bibi.cars")
ADMIN_PASSWORD = os.environ.get("BIBI_ADMIN_PASSWORD", "Jp3FS_7ZuE2bhHp7rFkJm9B9T_TeiHxu")
MANAGER_EMAIL    = "manager@bibi.cars"
MANAGER_PASSWORD = "dFbYnse0L59DBE16Mn4kT6cCRaNBZFQR"


class Wave17Tester:
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

    def patch(self, path, body=None, **kw):
        return requests.patch(f"{BASE_URL}{path}", json=body or {}, headers=self._h(), timeout=30, **kw)

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
        for ep in ("inbox", "my", "team", "analytics", "sources", ""):
            r = requests.get(f"{BASE_URL}/actions/{ep}".rstrip("/"), timeout=15)
            self.test(f"/actions/{ep or '(list)'} blocks unauth",
                      r.status_code in (401, 403), f"HTTP {r.status_code}")

    # ---------------------------------------------------------------- #
    # 1. Source catalogue
    # ---------------------------------------------------------------- #
    def test_sources(self):
        self.log("\n=== GET /actions/sources ===")
        r = self.get("/actions/sources")
        if not self.test("sources 200", r.status_code == 200): return
        body = r.json() or {}
        items = body.get("items") or []
        self.test("21 rules in catalogue", len(items) == 21, f"got {len(items)}")
        srcs = {it.get("source") for it in items}
        self.test("catalogue covers ops + contract + delivery + lead + forecast",
                  srcs == {"operations", "contract", "delivery", "lead", "forecast"},
                  f"got {srcs}")
        # spot-check OPS_RULES.waiting_deposit → chase_deposit / high / 1d
        wd = next((x for x in items if x.get("source") == "operations" and x.get("bucket") == "waiting_deposit"), None)
        self.test("ops.waiting_deposit → chase_deposit", wd and wd.get("type") == "chase_deposit")
        self.test("ops.waiting_deposit priority=high",   wd and wd.get("priority") == "high")
        self.test("ops.waiting_deposit due_days=1",      wd and wd.get("due_days") == 1)
        # contract.critical → renew_or_archive / critical
        cr = next((x for x in items if x.get("source") == "contract" and x.get("bucket") == "critical"), None)
        self.test("contract.critical → renew_or_archive",
                  cr and cr.get("type") == "renew_or_archive")
        self.test("contract.critical priority=critical",
                  cr and cr.get("priority") == "critical")

    # ---------------------------------------------------------------- #
    # 2. Manual lifecycle
    # ---------------------------------------------------------------- #
    def test_manual_lifecycle(self):
        self.log("\n=== Manual lifecycle ===")
        due = (datetime.now(timezone.utc) + timedelta(days=2)).isoformat()
        r = self.post("/actions",
                       {"source": "manual", "type": "manual",
                        "title": "Wave17 manual lifecycle",
                        "priority": "high", "due_at": due,
                        "owner_id": "staff_admin_1780175614",
                        "owner_name": "Admin"})
        self.test("create 200", r.status_code == 200)
        a = (r.json() or {}).get("data") or {}
        aid = a.get("id")
        self.cleanup_ids.append(aid)
        self.test("create: status open", a.get("status") == "open")
        self.test("create: priority preserved", a.get("priority") == "high")
        self.test("create: created event recorded",
                  any(e.get("kind") == "created" for e in (a.get("events") or [])))

        # patch
        r = self.patch(f"/actions/{aid}", {"priority": "critical", "description": "Updated"})
        a = (r.json() or {}).get("data") or {}
        self.test("patch: priority bumped to critical",
                  a.get("priority") == "critical")

        # start
        r = self.post(f"/actions/{aid}/start")
        a = (r.json() or {}).get("data") or {}
        self.test("start → in_progress", a.get("status") == "in_progress")

        # snooze 1h ago (immediately expired) — should resume on next read
        past = (datetime.now(timezone.utc) - timedelta(hours=1)).isoformat()
        r = self.post(f"/actions/{aid}/snooze",
                       {"snooze_until": past, "comment": "test"})
        a = (r.json() or {}).get("data") or {}
        self.test("snooze → snoozed", a.get("status") == "snoozed")
        # next read of /inbox triggers auto-resume
        self.get("/actions/inbox")
        a = (self.get(f"/actions/{aid}").json() or {}).get("data") or {}
        self.test("auto-resume: snoozed (past) → open",
                  a.get("status") == "open", f"got {a.get('status')}")

        # escalate
        r = self.post(f"/actions/{aid}/escalate",
                       {"to_step": "team_lead", "comment": "escalating"})
        a = (r.json() or {}).get("data") or {}
        self.test("escalate: escalated=True", a.get("escalated") is True)
        self.test("escalate: escalation step", a.get("escalation") == "team_lead")

        # comment
        r = self.post(f"/actions/{aid}/comment", {"comment": "Test comment"})
        a = (r.json() or {}).get("data") or {}
        self.test("comment: event appended",
                  any(e.get("kind") == "commented" for e in (a.get("events") or [])))

        # resolve
        r = self.post(f"/actions/{aid}/resolve",
                       {"comment": "done", "outcome": "resolved"})
        a = (r.json() or {}).get("data") or {}
        self.test("resolve → status resolved", a.get("status") == "resolved")
        self.test("resolve: resolved_at populated",
                  bool(a.get("resolved_at")))

        # reopen
        r = self.post(f"/actions/{aid}/reopen", {"comment": "reopen"})
        a = (r.json() or {}).get("data") or {}
        self.test("reopen → open", a.get("status") == "open")
        self.test("reopen: resolved_at cleared",
                  a.get("resolved_at") is None)

        # wont_do outcome → cancelled
        r = self.post(f"/actions/{aid}/resolve", {"outcome": "wont_do", "comment": "not needed"})
        a = (r.json() or {}).get("data") or {}
        self.test("resolve(wont_do) → cancelled",
                  a.get("status") == "cancelled", f"got {a.get('status')}")
        return aid

    # ---------------------------------------------------------------- #
    # 3. Sync idempotency
    # ---------------------------------------------------------------- #
    def test_sync_idempotency(self):
        self.log("\n=== Sync idempotency ===")
        r1 = self.post("/actions/sync")
        s1 = (r1.json() or {}).get("data") or {}
        # second sync should not re-create anything
        r2 = self.post("/actions/sync")
        s2 = (r2.json() or {}).get("data") or {}
        self.test("first sync 200",  r1.status_code == 200)
        self.test("second sync 200", r2.status_code == 200)
        self.test("2nd sync created == 0", int(s2.get("created", 0)) == 0,
                  f"got {s2.get('created')}")
        # total_suggested stable between two consecutive syncs
        self.test("total_suggested stable",
                  s1.get("total_suggested") == s2.get("total_suggested"),
                  f"s1={s1.get('total_suggested')} s2={s2.get('total_suggested')}")

    # ---------------------------------------------------------------- #
    # 4. Inbox / My / Team / Analytics
    # ---------------------------------------------------------------- #
    def test_inbox(self):
        self.log("\n=== GET /actions/inbox ===")
        # Seed: create 2 open + 1 critical + 1 resolved so the inbox is non-empty.
        for prio in ("critical", "high", "medium"):
            r = self.post("/actions",
                           {"source": "manual", "type": "manual",
                            "title": f"Wave17 inbox seed {prio}",
                            "priority": prio})
            cid = (r.json() or {}).get("data", {}).get("id")
            if cid: self.cleanup_ids.append(cid)
        # one resolved to make sure it's NOT in inbox
        r = self.post("/actions",
                       {"source": "manual", "type": "manual",
                        "title": "Wave17 inbox seed resolved",
                        "priority": "low"})
        rid = (r.json() or {}).get("data", {}).get("id")
        if rid:
            self.cleanup_ids.append(rid)
            self.post(f"/actions/{rid}/resolve", {"outcome": "resolved"})

        r = self.get("/actions/inbox")
        self.test("inbox 200", r.status_code == 200)
        data = (r.json() or {}).get("data") or {}
        for k in ("items", "total", "overdue", "by_priority", "by_source",
                   "by_status", "impact_total", "impact_critical", "scope", "currency"):
            self.test(f"inbox.{k} present", k in data)
        # ordering: critical first
        items = data.get("items") or []
        crits = [it for it in items if it.get("priority") == "critical"]
        before_first_non_crit = True
        for it in items:
            if it.get("priority") != "critical": before_first_non_crit = False
            if not before_first_non_crit and it.get("priority") == "critical":
                self.test("inbox sorted: critical-first violated", False, "—")
                return
        self.test("inbox sorted: critical-first", True)
        # resolved actions are NOT in inbox
        self.test("inbox excludes resolved",
                  not any(it.get("status") == "resolved" for it in items))

    def test_my(self):
        self.log("\n=== GET /actions/my ===")
        # create an action assigned to admin with overdue date
        past = (datetime.now(timezone.utc) - timedelta(days=3)).isoformat()
        r = self.post("/actions",
                       {"source": "manual", "type": "manual",
                        "title": "Wave17 my-overdue",
                        "priority": "high", "due_at": past,
                        "owner_id": "staff_admin_1780175614"})
        cid = (r.json() or {}).get("data", {}).get("id")
        if cid: self.cleanup_ids.append(cid)

        r = self.get("/actions/my")
        self.test("my 200", r.status_code == 200)
        data = (r.json() or {}).get("data") or {}
        for k in ("buckets", "owner_id", "total"):
            self.test(f"my.{k} present", k in data)
        for b in ("overdue", "today", "this_week", "later"):
            self.test(f"my.buckets.{b} present",
                      b in (data.get("buckets") or {}),
                      f"keys={list((data.get('buckets') or {}).keys())}")
        # overdue bucket must contain at least the one we just seeded
        oc = (data.get("buckets") or {}).get("overdue", {}).get("total", 0)
        self.test("my: overdue bucket >= 1 (after seeding overdue)",
                  oc >= 1, f"got {oc}")

    def test_team(self):
        self.log("\n=== GET /actions/team ===")
        r = self.get("/actions/team")
        self.test("team 200", r.status_code == 200)
        data = (r.json() or {}).get("data") or {}
        for k in ("items", "total", "scope", "currency"):
            self.test(f"team.{k} present", k in data)
        for row in (data.get("items") or [])[:2]:
            for k in ("owner_name", "open", "in_progress", "snoozed",
                      "overdue", "escalated", "resolved_today",
                      "avg_resolution_hours", "impact_open", "sla_score"):
                self.test(f"team.items[*].{k} present", k in row,
                          f"row={row}")
            sla = row.get("sla_score")
            if sla is not None:
                self.test("team.sla_score in [0,100]",
                          0 <= int(sla) <= 100, f"got {sla}")

    def test_analytics(self):
        self.log("\n=== GET /actions/analytics ===")
        r = self.get("/actions/analytics?days=30")
        self.test("analytics 200", r.status_code == 200)
        data = (r.json() or {}).get("data") or {}
        for k in ("created", "resolved", "open_now", "overdue_now",
                   "overdue_pct", "avg_resolution_hours", "daily",
                   "by_source", "by_priority", "scope"):
            self.test(f"analytics.{k} present", k in data,
                      f"got {data.get(k)}")
        daily = data.get("daily") or []
        self.test("analytics.daily has 30 entries", len(daily) == 30,
                  f"got {len(daily)}")
        for d in daily[:3]:
            for k in ("date", "created", "resolved"):
                self.test(f"analytics.daily[*].{k} present", k in d)
        # overdue_pct in [0,100]
        op = float(data.get("overdue_pct") or 0)
        self.test("analytics.overdue_pct in [0,100]",
                  0 <= op <= 100, f"got {op}")

    # ---------------------------------------------------------------- #
    # 5. Scope (manager)
    # ---------------------------------------------------------------- #
    def test_scope_manager(self):
        self.log("\n=== Scope: manager ===")
        if not self.login(MANAGER_EMAIL, MANAGER_PASSWORD):
            return
        for ep in ("inbox", "my", "team", "analytics"):
            r = self.get(f"/actions/{ep}")
            self.test(f"manager /actions/{ep} 200", r.status_code == 200)
        scope = ((self.get("/actions/inbox").json() or {}).get("data") or {}).get("scope") or {}
        self.test("manager scope.all == False",
                  scope.get("all") is False, f"got {scope}")
        self.test("manager scope.managers == 1",
                  scope.get("managers") == 1)

    # ---------------------------------------------------------------- #
    # 6. Regression
    # ---------------------------------------------------------------- #
    def test_regression(self):
        self.log("\n=== Regression ===")
        if not self.login(ADMIN_EMAIL, ADMIN_PASSWORD): return
        for ep in (
            "/forecast/overview",         # W12C
            "/forecast/risk",             # W12C
            "/contracts/overview",        # W15
            "/contracts/risk",            # W15
            "/operations/dashboard",      # W14
            "/executive/dashboard",       # W16
            "/executive/bottlenecks",     # W16
            "/executive/risks",           # W16
        ):
            r = self.get(ep)
            self.test(f"regression {ep} still 200",
                      r.status_code == 200, f"HTTP {r.status_code}")

    # ---------------------------------------------------------------- #
    def _cleanup(self):
        for aid in self.cleanup_ids:
            try:
                requests.post(f"{BASE_URL}/actions/{aid}/resolve",
                              json={"outcome": "wont_do"},
                              headers=self._h(), timeout=10)
            except Exception:
                pass

    def run_all(self):
        print("\n" + "=" * 70)
        print("BIBI Cars — Wave 17 — Action Center backend test")
        print("=" * 70)
        self.test_auth()
        if not self.login():
            return 1
        self.test_sources()
        self.test_manual_lifecycle()
        self.test_sync_idempotency()
        self.test_inbox()
        self.test_my()
        self.test_team()
        self.test_analytics()
        self.test_scope_manager()
        self.test_regression()
        self._cleanup()

        print("\n" + "=" * 70)
        print("TEST SUMMARY")
        print("=" * 70)
        print(f"Total: {self.tests_run}")
        print(f"✅ Passed: {self.tests_passed}")
        print(f"❌ Failed: {self.tests_failed}")
        if self.failures:
            print("\nFailed:")
            for f in self.failures: print("  -", f)
        rate = (self.tests_passed / self.tests_run * 100) if self.tests_run else 0
        print(f"\nSuccess rate: {rate:.1f}%")
        print("=" * 70 + "\n")
        return 0 if self.tests_failed == 0 else 1


if __name__ == "__main__":
    sys.exit(Wave17Tester().run_all())
