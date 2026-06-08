"""
BIBI Cars — Wave 15 — Contract Lifecycle Management backend test
==================================================================

Full e2e for Contract360:

  1. Static surface           — GET /api/contracts/templates (4 templates)
                              — GET /api/contracts/overview (admin scope)
  2. Lifecycle happy path     — create → send → approve×N → send → sign → active
  3. Health scorer transitions — draft / pending_approval / unsigned / missing_annex
                                  / wrong_version / critical (expired) / archived
  4. Amend                    — produces v2 draft, parent → amended, parent.current = False
  5. Attachments              — add → remove → audit trail in events
  6. Reject path              — pending_approval → rejected
  7. Scope                    — admin = all · manager scope.all = False
  8. Auth gate                — no token → 401/403
  9. Regression               — Wave 12A/12B/12C/13/14 unchanged (200)
"""
import os
import sys
import requests
from datetime import datetime, timedelta, timezone

BASE_URL = os.environ.get("BIBI_BASE_URL", "http://localhost:8001/api")
ADMIN_EMAIL    = os.environ.get("BIBI_ADMIN_EMAIL", "admin@bibi.cars")
ADMIN_PASSWORD = os.environ.get("BIBI_ADMIN_PASSWORD", "Jp3FS_7ZuE2bhHp7rFkJm9B9T_TeiHxu")
MANAGER_EMAIL    = "manager@bibi.cars"
MANAGER_PASSWORD = "dFbYnse0L59DBE16Mn4kT6cCRaNBZFQR"


class Wave15Tester:
    def __init__(self):
        self.token = None
        self.role  = None
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

    def delete(self, path, **kw):
        return requests.delete(f"{BASE_URL}{path}", headers=self._h(), timeout=30, **kw)

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
        self.role  = (body.get("user") or {}).get("role")
        return self.test(f"login {e}", bool(self.token), f"role={self.role}")

    # ---------------------------------------------------------------- #
    # 0. Auth gate
    # ---------------------------------------------------------------- #
    def test_auth_required(self):
        self.log("\n=== Auth gate: no token → 401/403 ===")
        for ep in ("templates", "overview", "risk", ""):
            r = requests.get(f"{BASE_URL}/contracts/{ep}".rstrip("/"), timeout=15)
            self.test(f"/contracts/{ep or '(list)'} blocks unauth",
                      r.status_code in (401, 403),
                      f"HTTP {r.status_code}")

    # ---------------------------------------------------------------- #
    # 1. Static surface
    # ---------------------------------------------------------------- #
    def test_templates(self):
        self.log("\n=== GET /api/contracts/templates ===")
        r = self.get("/contracts/templates")
        if not self.test("templates 200", r.status_code == 200, f"HTTP {r.status_code}"):
            return
        body = r.json() or {}
        self.test("templates.success", body.get("success") is True)
        items = body.get("items") or []
        self.test("4 templates returned", len(items) == 4, f"got {len(items)}")
        keys = {t.get("key") for t in items}
        self.test("templates: purchase + agency + transport + custom",
                  keys == {"purchase", "agency", "transport", "custom"},
                  f"got {keys}")
        for t in items:
            for k in ("key", "name", "type", "approval_chain", "required_annexes", "valid_days"):
                self.test(f"template[{t.get('key')}].{k} present", k in t)

    def test_overview_empty_or_real(self):
        self.log("\n=== GET /api/contracts/overview ===")
        r = self.get("/contracts/overview")
        if not self.test("overview 200", r.status_code == 200, f"HTTP {r.status_code}"):
            return
        body = r.json() or {}
        self.test("overview.success", body.get("success") is True)
        data = body.get("data") or {}
        for k in ("totals", "by_status", "by_type", "by_segment", "top_at_risk", "scope", "currency"):
            self.test(f"overview.{k} present", k in data)
        totals = data.get("totals") or {}
        for k in ("contracts", "total_value", "active_value", "unsigned_value",
                   "healthy_count", "overdue_signature", "pending_approvals", "expiring_soon"):
            self.test(f"overview.totals.{k} present", k in totals,
                      f"got {totals.get(k)}")
        self.test("admin scope.all is True", (data.get("scope") or {}).get("all") is True,
                  f"got {data.get('scope')}")

    # ---------------------------------------------------------------- #
    # 2. Lifecycle happy path (manager → 4 approvals → sign → active)
    # ---------------------------------------------------------------- #
    def _create(self, template="purchase", title="Wave15 e2e", amount=50000):
        r = self.post("/contracts",
                       {"template": template, "title": title, "amount": amount})
        if not self.test(f"create {template} 200", r.status_code == 200, f"HTTP {r.status_code} {r.text[:200]}"):
            return None
        c = (r.json() or {}).get("data") or {}
        self.cleanup_ids.append(c.get("id"))
        return c

    def test_lifecycle_happy(self):
        self.log("\n=== Lifecycle: create → send → approve×N → send → sign → active ===")
        c = self._create(template="purchase", title="Wave15 happy path", amount=75000)
        if not c: return
        cid = c["id"]
        self.test("create: status == draft", c.get("status") == "draft", f"got {c.get('status')}")
        self.test("create: version == 1", c.get("version") == 1)
        self.test("create: current == True", c.get("current") is True)
        self.test("create: approval_chain == purchase 4-step",
                  c.get("approval_chain") == ["manager", "team_lead", "admin", "customer"],
                  f"got {c.get('approval_chain')}")
        self.test("create: health.segment == draft",
                  (c.get("health") or {}).get("segment") == "draft")
        self.test("create: created event recorded",
                  any(e.get("kind") == "created" for e in (c.get("events") or [])))

        # send → pending_approval
        r = self.post(f"/contracts/{cid}/send")
        c = (r.json() or {}).get("data") or {}
        self.test("send → pending_approval", c.get("status") == "pending_approval",
                  f"got {c.get('status')}")
        self.test("approvals pre-populated (4 steps pending)",
                  len(c.get("approvals") or []) == 4 and
                  all((a.get("status") == "pending") for a in c["approvals"]))

        # approve 4 steps
        steps_left = 4
        for i in range(4):
            r = self.post(f"/contracts/{cid}/approve", {"comment": f"step {i+1} ok"})
            self.test(f"approve step {i+1} 200", r.status_code == 200, f"HTTP {r.status_code}")
            c = (r.json() or {}).get("data") or {}
            steps_left -= 1
            pending_now = sum(1 for a in c.get("approvals", []) if a.get("status") == "pending")
            self.test(f"after approve {i+1}: pending == {steps_left}",
                      pending_now == steps_left, f"got {pending_now}")
            if i < 3:
                self.test(f"after approve {i+1}: status == pending_approval",
                          c.get("status") == "pending_approval", f"got {c.get('status')}")
            else:
                self.test("all approvals collected → status == approved",
                          c.get("status") == "approved", f"got {c.get('status')}")

        # send to customer
        r = self.post(f"/contracts/{cid}/send")
        c = (r.json() or {}).get("data") or {}
        self.test("send (approved → sent)", c.get("status") == "sent")
        self.test("sent_at populated", bool(c.get("sent_at")))
        self.test("after-send segment is healthy (not unsigned yet)",
                  (c.get("health") or {}).get("segment") in ("healthy", "pending_approval"),
                  f"got {(c.get('health') or {}).get('segment')}")

        # sign → active
        r = self.post(f"/contracts/{cid}/sign",
                       {"signer_name": "Test Customer", "signer_email": "t@x.com"})
        c = (r.json() or {}).get("data") or {}
        self.test("sign → active", c.get("status") == "active", f"got {c.get('status')}")
        self.test("signed_at populated", bool(c.get("signed_at")))
        sig = c.get("signature") or {}
        self.test("signature.signer_name preserved", sig.get("signer_name") == "Test Customer")
        self.test("signature.method default == electronic",
                  sig.get("method") == "electronic")
        # missing_annex expected because no annexes uploaded
        seg = (c.get("health") or {}).get("segment")
        self.test("active without annexes → segment 'missing_annex'",
                  seg == "missing_annex", f"got {seg}")

        return cid

    # ---------------------------------------------------------------- #
    # 3. Attachments fix missing_annex segment
    # ---------------------------------------------------------------- #
    def test_attachments(self, cid: str):
        if not cid: return
        self.log("\n=== Attachments: upload annex → segment improves ===")
        # multipart upload with NO file, just metadata
        url = f"{BASE_URL}/contracts/{cid}/attachments"
        r = requests.post(url,
                          data={"filename": "vehicle_specification.pdf",
                                "kind": "annex",
                                "kind_key": "vehicle_specification"},
                          headers={"Authorization": f"Bearer {self.token}"},
                          timeout=20)
        if not self.test("upload annex (form-only) 200", r.status_code == 200, f"HTTP {r.status_code} {r.text[:200]}"):
            return
        c = (r.json() or {}).get("data") or {}
        atts = c.get("attachments") or []
        self.test("attachment recorded", len(atts) == 1, f"got {len(atts)}")
        # add the two remaining annexes
        for k in ("price_breakdown", "customs_disclosure"):
            r = requests.post(url,
                              data={"filename": f"{k}.pdf", "kind": "annex", "kind_key": k},
                              headers={"Authorization": f"Bearer {self.token}"},
                              timeout=20)
            self.test(f"upload {k} 200", r.status_code == 200)
        # after all annexes the segment should become healthy
        c = (self.get(f"/contracts/{cid}").json() or {}).get("data") or {}
        seg = (c.get("health") or {}).get("segment")
        self.test("after all annexes → segment healthy",
                  seg == "healthy", f"got {seg}")

        # remove one — should regress to missing_annex
        att_id = (c.get("attachments") or [])[0].get("id")
        r = self.delete(f"/contracts/{cid}/attachments/{att_id}")
        self.test("delete attachment 200", r.status_code == 200)
        c = (r.json() or {}).get("data") or {}
        seg = (c.get("health") or {}).get("segment")
        self.test("after removing annex → segment missing_annex again",
                  seg == "missing_annex", f"got {seg}")

    # ---------------------------------------------------------------- #
    # 4. Amend creates v2 draft, parent becomes amended
    # ---------------------------------------------------------------- #
    def test_amend(self, parent_id: str):
        if not parent_id: return
        self.log("\n=== Amend: active → amended + new v2 draft ===")
        r = self.post(f"/contracts/{parent_id}/amend", {"reason": "price adjustment"})
        new = (r.json() or {}).get("data") or {}
        self.cleanup_ids.append(new.get("id"))
        self.test("amend 200", r.status_code == 200, f"HTTP {r.status_code}")
        self.test("amend: new contract has parent_contract_id",
                  new.get("parent_contract_id") == parent_id)
        self.test("amend: new version == 2", new.get("version") == 2)
        self.test("amend: new status == draft", new.get("status") == "draft")

        # parent should be marked amended + current=False
        parent = (self.get(f"/contracts/{parent_id}").json() or {}).get("data") or {}
        self.test("amend: parent.status == amended",
                  parent.get("status") == "amended", f"got {parent.get('status')}")
        self.test("amend: parent.current == False",
                  parent.get("current") is False)
        self.test("amend: parent health.segment == wrong_version",
                  (parent.get("health") or {}).get("segment") == "wrong_version")

    # ---------------------------------------------------------------- #
    # 5. Reject path
    # ---------------------------------------------------------------- #
    def test_reject(self):
        self.log("\n=== Reject path ===")
        c = self._create(template="agency", title="Wave15 reject", amount=10000)
        if not c: return
        cid = c["id"]
        self.post(f"/contracts/{cid}/send")  # → pending_approval
        r = self.post(f"/contracts/{cid}/reject", {"comment": "no thanks"})
        c = (r.json() or {}).get("data") or {}
        self.test("reject → status rejected", c.get("status") == "rejected")
        rejected = next((a for a in c.get("approvals", []) if a.get("status") == "rejected"), None)
        self.test("reject: at least one approvals row marked rejected", rejected is not None)
        seg = (c.get("health") or {}).get("segment")
        self.test("rejected → segment critical", seg == "critical", f"got {seg}")

    # ---------------------------------------------------------------- #
    # 6. Expired
    # ---------------------------------------------------------------- #
    def test_expiry(self):
        self.log("\n=== Expired: valid_to in past → critical ===")
        past = (datetime.now(timezone.utc) - timedelta(days=5)).isoformat()
        future = (datetime.now(timezone.utc) - timedelta(days=1)).isoformat()
        c = self._create(template="custom", title="Wave15 expired", amount=1000)
        if not c: return
        cid = c["id"]
        # patch valid_to to the past
        r = self.patch(f"/contracts/{cid}", {"valid_from": past, "valid_to": future})
        self.test("patch valid_to → past 200", r.status_code == 200, f"HTTP {r.status_code}")
        # send through approval to make it active
        self.post(f"/contracts/{cid}/send")
        for _ in range(2):
            self.post(f"/contracts/{cid}/approve", {})
        self.post(f"/contracts/{cid}/send")
        self.post(f"/contracts/{cid}/sign", {})
        c = (self.get(f"/contracts/{cid}").json() or {}).get("data") or {}
        seg = (c.get("health") or {}).get("segment")
        self.test("active + valid_to in past → segment critical",
                  seg == "critical", f"got {seg}")

    # ---------------------------------------------------------------- #
    # 7. Archive
    # ---------------------------------------------------------------- #
    def test_archive(self):
        self.log("\n=== Archive ===")
        c = self._create(template="custom", title="Wave15 archive", amount=500)
        if not c: return
        cid = c["id"]
        r = self.post(f"/contracts/{cid}/archive")
        c = (r.json() or {}).get("data") or {}
        self.test("archive → status archived", c.get("status") == "archived")
        self.test("archived → segment archived",
                  (c.get("health") or {}).get("segment") == "archived")

    # ---------------------------------------------------------------- #
    # 8. List + filters + risk
    # ---------------------------------------------------------------- #
    def test_list_and_risk(self):
        self.log("\n=== List + filters + risk ===")
        r = self.get("/contracts")
        self.test("list 200", r.status_code == 200)
        body = r.json() or {}
        items = body.get("items") or []
        self.test("list returns recent contracts", len(items) >= 3, f"got {len(items)}")
        # filter by status
        r = self.get("/contracts?status=archived")
        items2 = (r.json() or {}).get("items") or []
        self.test("filter status=archived returns archived only",
                  all(i.get("status") == "archived" for i in items2),
                  f"statuses={ {i.get('status') for i in items2} }")
        # filter by type
        r = self.get("/contracts?type=custom")
        items3 = (r.json() or {}).get("items") or []
        self.test("filter type=custom returns custom only",
                  all(i.get("type") == "custom" for i in items3))
        # risk
        r = self.get("/contracts/risk")
        self.test("risk 200", r.status_code == 200)
        data = (r.json() or {}).get("data") or {}
        for k in ("items", "total", "by_segment", "risk_value", "scope", "currency"):
            self.test(f"risk.{k} present", k in data)
        # /me endpoint backward compat
        r = self.get("/contracts/me")
        self.test("/contracts/me 200 (replaced legacy stub)", r.status_code == 200,
                  f"HTTP {r.status_code}")
        body = r.json() or {}
        self.test("/contracts/me returns contracts array",
                  "contracts" in body and isinstance(body["contracts"], list))

    # ---------------------------------------------------------------- #
    # 9. Scope: manager
    # ---------------------------------------------------------------- #
    def test_scope_manager(self):
        self.log("\n=== Scope: manager ===")
        if not self.login(MANAGER_EMAIL, MANAGER_PASSWORD):
            return
        r = self.get("/contracts/overview")
        self.test("manager overview 200", r.status_code == 200)
        scope = ((r.json() or {}).get("data") or {}).get("scope") or {}
        self.test("manager scope.all == False", scope.get("all") is False)
        self.test("manager scope.managers == 1", scope.get("managers") == 1)

        # manager creates a contract → must be in own scope
        r = self.post("/contracts",
                       {"template": "custom", "title": "Wave15 manager", "amount": 100})
        if r.status_code == 200:
            cid = (r.json() or {}).get("data", {}).get("id")
            self.cleanup_ids.append(cid)
            r = self.get(f"/contracts/{cid}")
            self.test("manager can fetch own contract", r.status_code == 200)
        else:
            self.test("manager create succeeds OR is gated",
                       r.status_code in (200, 403),
                       f"HTTP {r.status_code}")

    # ---------------------------------------------------------------- #
    # 10. Regression: 12A/12B/12C/13/14 still 200
    # ---------------------------------------------------------------- #
    def test_regression(self):
        self.log("\n=== Regression: prior waves ===")
        if not self.login(ADMIN_EMAIL, ADMIN_PASSWORD): return
        for ep in (
            "/finance/overview",        # 12A
            "/finance/risk",            # 12B
            "/forecast/overview",       # 12C
            "/forecast/revenue",        # 12C
            "/delivery/overview",       # 13
            "/operations/dashboard",    # 14
        ):
            r = self.get(ep)
            self.test(f"regression {ep} still 200",
                      r.status_code == 200, f"HTTP {r.status_code}")

    # ---------------------------------------------------------------- #
    def _cleanup(self):
        # Best-effort cleanup so repeat runs don't pollute Contract360
        for cid in self.cleanup_ids:
            try:
                requests.post(f"{BASE_URL}/contracts/{cid}/archive",
                              headers=self._h(), timeout=10)
            except Exception:
                pass

    def run_all(self):
        print("\n" + "=" * 70)
        print("BIBI Cars — Wave 15 — Contract Lifecycle Management — backend test")
        print("=" * 70)
        self.test_auth_required()
        if not self.login():
            return 1
        self.test_templates()
        self.test_overview_empty_or_real()
        happy_cid = self.test_lifecycle_happy()
        self.test_attachments(happy_cid)
        self.test_amend(happy_cid)
        self.test_reject()
        self.test_expiry()
        self.test_archive()
        self.test_list_and_risk()
        self.test_scope_manager()
        self.test_regression()
        self._cleanup()

        print("\n" + "=" * 70)
        print("TEST SUMMARY")
        print("=" * 70)
        print(f"Total:  {self.tests_run}")
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
    sys.exit(Wave15Tester().run_all())
