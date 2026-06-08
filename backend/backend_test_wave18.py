"""
BIBI Cars — Wave 18 — Communication & Notification Center backend test
========================================================================

Closes the loop:  Risk → Action → Notification → Escalation → Resolution → Analytics

Covers:
  1. Auth gate — every /api/notifications endpoint requires a token
  2. /rules catalogue — 11 events, expected SLA thresholds, DISPATCH rule shapes
  3. Preferences GET → defaults shape
  4. Preferences PATCH — channels merge, digest, mute_until round-trip
  5. Inbox empty state
  6. Action lifecycle wiring — creating an Action assigned to a recipient
     produces an in_app notification (Wave 17 → Wave 18 handler chain)
  7. Mark-read / Mark-all-read / Dismiss state transitions
  8. Unread-count cheap badge endpoint
  9. SLA Escalation Engine — overdue action seeded → 1st scan reminds + escalates,
     2nd scan is **idempotent** (0 deltas)
 10. Analytics shape — totals/by_event/by_channel populated after dispatch
 11. Regression — Wave 17 endpoints (/api/actions/sources, /api/actions/inbox)
     and notification customer endpoints still respond
"""
import os
import sys
import time
import uuid
import requests
from datetime import datetime, timezone, timedelta

BASE_URL       = os.environ.get("BIBI_BASE_URL", "http://localhost:8001/api")
ADMIN_EMAIL    = os.environ.get("BIBI_ADMIN_EMAIL",    "admin@bibi.cars")
ADMIN_PASSWORD = os.environ.get("BIBI_ADMIN_PASSWORD", "Jp3FS_7ZuE2bhHp7rFkJm9B9T_TeiHxu")


class Wave18Tester:
    def __init__(self):
        self.token = None
        self.user  = {}
        self.tests_run = 0
        self.tests_passed = 0
        self.tests_failed = 0
        self.failures = []
        self.cleanup_action_ids = []

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

    def _h(self, extra=None):
        h = {"Content-Type": "application/json"}
        if self.token:
            h["Authorization"] = f"Bearer {self.token}"
        if extra:
            h.update(extra)
        return h

    def get(self, path, **kw):
        return requests.get(f"{BASE_URL}{path}", headers=self._h(), timeout=30, **kw)

    def post(self, path, body=None, **kw):
        return requests.post(f"{BASE_URL}{path}", json=body or {}, headers=self._h(), timeout=30, **kw)

    def patch(self, path, body=None, **kw):
        return requests.patch(f"{BASE_URL}{path}", json=body or {}, headers=self._h(), timeout=30, **kw)

    def delete(self, path, **kw):
        return requests.delete(f"{BASE_URL}{path}", headers=self._h(), timeout=30, **kw)

    # ---------------------------------------------------------------- #
    # Setup
    # ---------------------------------------------------------------- #
    def login(self):
        self.log("\n=== Login (admin) ===")
        r = requests.post(f"{BASE_URL}/auth/login",
                          json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
                          timeout=15)
        ok = self.test("login admin", r.status_code == 200,
                       f"HTTP {r.status_code}")
        if not ok:
            return False
        body = r.json() or {}
        self.token = body.get("access_token")
        self.user  = body.get("user") or {}
        self.test("token issued",    bool(self.token))
        self.test("user.id present", bool(self.user.get("id")),
                  f"id={self.user.get('id')}, role={self.user.get('role')}")
        return True

    # ---------------------------------------------------------------- #
    # 1. Auth gate
    # ---------------------------------------------------------------- #
    def test_auth_gate(self):
        self.log("\n=== Auth gate ===")
        endpoints = [
            ("GET",   "/notifications/inbox"),
            ("GET",   "/notifications/unread-count"),
            ("GET",   "/notifications/rules"),
            ("GET",   "/notifications/preferences"),
            ("PATCH", "/notifications/preferences"),
            ("GET",   "/notifications/analytics"),
            ("POST",  "/notifications/escalation/scan"),
        ]
        for method, ep in endpoints:
            r = requests.request(method, f"{BASE_URL}{ep}",
                                 json={} if method in ("POST", "PATCH") else None,
                                 timeout=10)
            self.test(f"{method:5} {ep} blocks unauth",
                      r.status_code in (401, 403),
                      f"HTTP {r.status_code}")

    # ---------------------------------------------------------------- #
    # 2. Rules catalogue
    # ---------------------------------------------------------------- #
    def test_rules(self):
        self.log("\n=== GET /notifications/rules ===")
        r = self.get("/notifications/rules")
        if not self.test("rules 200", r.status_code == 200):
            return
        body = r.json() or {}
        events = body.get("events") or []
        rules  = body.get("rules")  or []
        sla    = body.get("sla_thresholds_hours") or {}

        expected_events = {
            "action_created", "action_assigned", "action_started",
            "action_snoozed", "action_escalated", "action_reopened",
            "action_resolved", "action_cancelled", "action_commented",
            "action_overdue", "action_critical_overdue",
        }
        self.test("11 events in catalogue",
                  set(events) == expected_events,
                  f"got {len(events)} events")
        self.test("rules list non-empty", len(rules) >= 12,
                  f"got {len(rules)} rules")
        # action_critical_overdue must have 3 audiences (owner + tl + admin)
        crit = [r for r in rules if r.get("event") == "action_critical_overdue"]
        self.test("action_critical_overdue has 3 recipients",
                  len(crit) == 3,
                  f"got {len(crit)}: {[r.get('recipient') for r in crit]}")
        # SLA thresholds
        self.test("SLA remind_owner == 24h",         sla.get("remind_owner")        == 24)
        self.test("SLA escalate_team_lead == 72h",   sla.get("escalate_team_lead")  == 72)
        self.test("SLA escalate_admin == 168h",      sla.get("escalate_admin")      == 168)
        # Rule shape
        first = rules[0] if rules else {}
        self.test("rule shape {event,recipient,channels}",
                  all(k in first for k in ("event", "recipient", "channels")),
                  f"keys={list(first.keys())}")

    # ---------------------------------------------------------------- #
    # 3. Preferences GET + PATCH
    # ---------------------------------------------------------------- #
    def test_preferences(self):
        self.log("\n=== GET / PATCH /notifications/preferences ===")
        r = self.get("/notifications/preferences")
        if not self.test("prefs GET 200", r.status_code == 200):
            return
        p = (r.json() or {}).get("data") or {}
        self.test("prefs has channels.in_app == True",
                  (p.get("channels") or {}).get("in_app") is True)
        self.test("prefs has digest field",
                  p.get("digest") in ("realtime", "daily", "weekly"))

        # PATCH digest
        r = self.patch("/notifications/preferences", {"digest": "daily"})
        self.test("prefs PATCH digest=daily 200", r.status_code == 200)
        d = (r.json() or {}).get("data") or {}
        self.test("digest persisted", d.get("digest") == "daily")

        # PATCH channels — merge, not replace
        r = self.patch("/notifications/preferences", {"channels": {"telegram": True}})
        d = (r.json() or {}).get("data") or {}
        self.test("channels.telegram=True merged",
                  (d.get("channels") or {}).get("telegram") is True)
        self.test("channels.in_app remained True (merge, not replace)",
                  (d.get("channels") or {}).get("in_app") is True)

        # mute_until round-trip
        until_iso = (datetime.now(timezone.utc) + timedelta(hours=2)).isoformat()
        r = self.patch("/notifications/preferences", {"mute_until": until_iso})
        d = (r.json() or {}).get("data") or {}
        self.test("mute_until stored", d.get("mute_until") == until_iso)

        # Unmute
        self.patch("/notifications/preferences", {"channels": {"telegram": False}, "digest": "realtime"})

    # ---------------------------------------------------------------- #
    # 4. Inbox empty-state + unread-count
    # ---------------------------------------------------------------- #
    def test_inbox_empty(self):
        self.log("\n=== GET /notifications/inbox (initial) ===")
        r = self.get("/notifications/inbox?limit=10")
        if not self.test("inbox 200", r.status_code == 200):
            return
        d = (r.json() or {}).get("data") or {}
        # shape
        for k in ("items", "total", "unread", "by_event", "by_priority", "as_of"):
            self.test(f"inbox.{k} present", k in d)
        # unread-count
        r = self.get("/notifications/unread-count")
        self.test("unread-count 200", r.status_code == 200)
        body = r.json() or {}
        self.test("unread-count int", isinstance(body.get("unread"), int))

    # ---------------------------------------------------------------- #
    # 5. Action lifecycle → notification chain
    # ---------------------------------------------------------------- #
    def _create_action(self, owner_id, title="Wave18 test action", priority="high", due_offset_h=24):
        due = (datetime.now(timezone.utc) + timedelta(hours=due_offset_h)).isoformat()
        body = {
            "title": title,
            "description": "Created by backend_test_wave18",
            "source": "manual",
            "type": "custom",
            "priority": priority,
            "owner_id": owner_id,
            "due_at": due,
        }
        r = self.post("/actions", body)
        return r

    def test_action_to_notification(self):
        self.log("\n=== Wave 17 → Wave 18 dispatch chain ===")
        uid = self.user.get("id") or self.user.get("sub")

        # Snapshot current unread
        pre_count = (self.get("/notifications/unread-count").json() or {}).get("unread") or 0

        # Create action assigned to ME — should produce action_created (in_app) + action_assigned (in_app + email)
        r = self._create_action(owner_id=uid, title="Notif-chain action")
        ok = self.test("create action 200/201",
                       r.status_code in (200, 201),
                       f"HTTP {r.status_code} {r.text[:200]}")
        if not ok:
            return
        action = (r.json() or {}).get("data") or r.json() or {}
        aid = action.get("id") or action.get("action_id")
        self.cleanup_action_ids.append(aid)

        # Give the in-process dispatcher a beat to write the docs
        time.sleep(0.4)

        # Unread now increased (in_app channel only counts toward inbox)
        post_count = (self.get("/notifications/unread-count").json() or {}).get("unread") or 0
        self.test("unread-count increased after action_created",
                  post_count > pre_count,
                  f"pre={pre_count} → post={post_count}")

        # Inbox contains a row with event=action_created OR action_assigned
        r = self.get("/notifications/inbox?limit=20")
        items = ((r.json() or {}).get("data") or {}).get("items") or []
        action_rows = [n for n in items if n.get("action_id") == aid]
        self.test("inbox has rows for our action",
                  len(action_rows) >= 1,
                  f"matched {len(action_rows)} rows")
        events_seen = {n.get("event") for n in action_rows}
        self.test("event=action_created OR action_assigned dispatched",
                  bool(events_seen & {"action_created", "action_assigned"}),
                  f"events={events_seen}")
        # Each in_app row has the standard envelope
        for n in action_rows[:3]:
            self.test(f"notif row has title/body/href ({n.get('id')})",
                      bool(n.get("title")) and bool(n.get("body")) and bool(n.get("href")))

        # 6. Mark single notification as read
        if action_rows:
            nid = action_rows[0]["id"]
            r = self.post(f"/notifications/{nid}/read")
            ok = self.test("mark single read 200", r.status_code == 200)
            if ok:
                n = (r.json() or {}).get("data") or {}
                self.test("notification has read_at set", bool(n.get("read_at")))

        # 7. Mark-all-read
        r = self.post("/notifications/read-all")
        self.test("read-all 200", r.status_code == 200,
                  f"marked={(r.json() or {}).get('marked')}")
        r = self.get("/notifications/unread-count")
        unread = (r.json() or {}).get("unread") or 0
        self.test("unread-count == 0 after read-all", unread == 0,
                  f"unread={unread}")

        # 8. Dismiss
        if action_rows:
            nid = action_rows[0]["id"]
            r = self.post(f"/notifications/{nid}/dismiss")
            self.test("dismiss 200", r.status_code == 200)
            # default inbox excludes dismissed
            r = self.get("/notifications/inbox?limit=50")
            items = ((r.json() or {}).get("data") or {}).get("items") or []
            self.test("dismissed row no longer in default inbox",
                      not any(n.get("id") == nid for n in items))
            # include_dismissed=True shows it
            r = self.get("/notifications/inbox?limit=50&include_dismissed=true")
            items = ((r.json() or {}).get("data") or {}).get("items") or []
            self.test("dismissed row visible with include_dismissed",
                      any(n.get("id") == nid for n in items))

    # ---------------------------------------------------------------- #
    # 9. SLA Escalation Engine — Wave 18.1 idempotency
    # ---------------------------------------------------------------- #
    def test_sla_escalation(self):
        self.log("\n=== POST /notifications/escalation/scan (Wave 18.1) ===")
        uid = self.user.get("id") or self.user.get("sub")

        # Create an action with due_at deep in the past (10 days)
        long_overdue_due = (datetime.now(timezone.utc) - timedelta(days=10)).isoformat()
        body = {
            "title": "SLA scan target — 10d overdue",
            "description": "Wave 18.1 escalation test",
            "source": "manual",
            "type": "custom",
            "priority": "medium",
            "owner_id": uid,
            "due_at": long_overdue_due,
        }
        r = self.post("/actions", body)
        ok = self.test("create overdue action 200/201", r.status_code in (200, 201))
        if not ok:
            return
        a = (r.json() or {}).get("data") or r.json() or {}
        aid = a.get("id") or a.get("action_id")
        self.cleanup_action_ids.append(aid)

        # 1st scan — should remind + escalate to TL + escalate to admin (all three tiers triggered for 10d-overdue)
        r = self.post("/notifications/escalation/scan")
        ok = self.test("1st scan 200", r.status_code == 200)
        if not ok:
            return
        d1 = (r.json() or {}).get("data") or {}
        self.test("1st scan scanned >= 1",       d1.get("scanned", 0) >= 1, f"scanned={d1.get('scanned')}")
        self.test("1st scan reminded >= 1",      d1.get("reminded", 0) >= 1, f"reminded={d1.get('reminded')}")
        # Team lead escalation may or may not happen depending on staff.team_lead_id wiring.
        # Admin escalation is guaranteed because we have an admin user in staff (this test user).
        self.test("1st scan escalated_to_admin >= 1",
                  d1.get("escalated_to_admin", 0) >= 1,
                  f"escalated_to_admin={d1.get('escalated_to_admin')}")

        # 2nd scan — must be fully idempotent (0/0/0 for reminded/tl/admin on the same action)
        r = self.post("/notifications/escalation/scan")
        d2 = (r.json() or {}).get("data") or {}
        self.test("2nd scan 200", r.status_code == 200)
        self.test("2nd scan reminded == 0 (idempotent)",
                  d2.get("reminded", 0) == 0,
                  f"reminded={d2.get('reminded')}")
        self.test("2nd scan escalated_to_admin == 0 (idempotent)",
                  d2.get("escalated_to_admin", 0) == 0,
                  f"escalated_to_admin={d2.get('escalated_to_admin')}")

        # Verify the action_overdue / action_critical_overdue notifications now exist for us
        time.sleep(0.3)
        r = self.get("/notifications/inbox?limit=100&include_dismissed=true")
        items = ((r.json() or {}).get("data") or {}).get("items") or []
        events_seen = {n.get("event") for n in items if n.get("action_id") == aid}
        self.test("action_overdue notification dispatched by SLA scan",
                  "action_overdue" in events_seen,
                  f"events_seen={events_seen}")
        self.test("action_critical_overdue notification dispatched (>=7d)",
                  "action_critical_overdue" in events_seen,
                  f"events_seen={events_seen}")

        # And the action document itself has escalation_log markers
        r = self.get(f"/actions/{aid}")
        if r.status_code == 200:
            doc = (r.json() or {}).get("data") or r.json() or {}
            log = doc.get("escalation_log") or {}
            self.test("escalation_log.reminded_at set on action",
                      bool(log.get("reminded_at")),
                      f"log={list(log.keys())}")
            self.test("escalation_log.escalated_to_admin_at set",
                      bool(log.get("escalated_to_admin_at")))
            self.test("action.priority promoted to critical after 7d escalation",
                      doc.get("priority") == "critical",
                      f"priority={doc.get('priority')}")

    # ---------------------------------------------------------------- #
    # 10. Analytics
    # ---------------------------------------------------------------- #
    def test_analytics(self):
        self.log("\n=== GET /notifications/analytics ===")
        r = self.get("/notifications/analytics?days=30")
        if not self.test("analytics 200", r.status_code == 200):
            return
        d = (r.json() or {}).get("data") or {}
        for k in ("total", "delivered", "failed", "read",
                  "delivery_rate", "read_rate",
                  "by_channel", "by_event", "by_status",
                  "window_days"):
            self.test(f"analytics.{k} present", k in d)
        self.test("window_days == 30",       d.get("window_days") == 30)
        self.test("analytics.total >= 1 (we dispatched some)",
                  (d.get("total") or 0) >= 1,
                  f"total={d.get('total')}")
        self.test("analytics.by_channel.in_app present",
                  "in_app" in (d.get("by_channel") or {}))
        self.test("delivery_rate is a number in [0,100]",
                  isinstance(d.get("delivery_rate"), (int, float))
                  and 0 <= d.get("delivery_rate") <= 100)

    # ---------------------------------------------------------------- #
    # 11. Regression — Wave 17 + legacy notifications still respond
    # ---------------------------------------------------------------- #
    def test_regression(self):
        self.log("\n=== Regression / cross-wave ===")
        r = self.get("/actions/sources")
        self.test("Wave 17 /actions/sources still 200", r.status_code == 200)
        if r.status_code == 200:
            body = r.json() or {}
            items = body.get("items") or []
            self.test("Wave 17 sources catalogue has 21 rules",
                      len(items) == 21, f"got {len(items)}")
        r = self.get("/actions/inbox")
        self.test("Wave 17 /actions/inbox still 200", r.status_code == 200)
        # Legacy customer notifications
        r = self.get("/notifications/customer/unread-count")
        self.test("legacy /notifications/customer/unread-count responds",
                  r.status_code in (200, 401, 403),
                  f"HTTP {r.status_code}")

    # ---------------------------------------------------------------- #
    # Cleanup
    # ---------------------------------------------------------------- #
    def cleanup(self):
        self.log("\n=== Cleanup ===")
        for aid in self.cleanup_action_ids:
            try:
                # cancel/resolve — uses Wave 17 lifecycle
                self.post(f"/actions/{aid}/resolve", {"outcome": "wont_do", "note": "cleanup wave18"})
            except Exception:
                pass

    # ---------------------------------------------------------------- #
    # Entry point
    # ---------------------------------------------------------------- #
    def run(self):
        print(f"\n{'='*70}")
        print(f"BIBI Cars — Wave 18 Notification Center & SLA Engine — backend test")
        print(f"BASE_URL = {BASE_URL}")
        print(f"{'='*70}\n")

        if not self.login():
            self.summarise()
            sys.exit(1)

        self.test_auth_gate()
        self.test_rules()
        self.test_preferences()
        self.test_inbox_empty()
        self.test_action_to_notification()
        self.test_sla_escalation()
        self.test_analytics()
        self.test_regression()
        self.cleanup()
        self.summarise()

    def summarise(self):
        print(f"\n{'='*70}")
        rate = (self.tests_passed / self.tests_run * 100) if self.tests_run else 0
        print(f"Tests:  {self.tests_passed}/{self.tests_run} PASS  ({rate:.0f}%)")
        if self.failures:
            print(f"\nFailures ({len(self.failures)}):")
            for f in self.failures:
                print(f"  ✗ {f}")
        print(f"{'='*70}\n")
        if self.tests_failed:
            sys.exit(1)


if __name__ == "__main__":
    Wave18Tester().run()
