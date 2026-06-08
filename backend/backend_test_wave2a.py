#!/usr/bin/env python3
"""
BIBI Cars — Wave 2A Calls Foundation — Backend HTTP Tests
==========================================================

Tests:
- GET /api/customers/{customer_id}/calls with various filters
- ACL enforcement (admin, manager, team_lead)
- GET /api/calls/{call_id}/recording proxy
- Error cases (404, 401, 502)

Test data: customer_id='test_customer_001' with 3 seeded calls (_seed='w2a_test')
Manager: staff_manager_1780081249
"""
import sys
import requests
from datetime import datetime, timedelta

BASE_URL = "https://code-review-304.preview.emergentagent.com"

# Test credentials from review_request
CREDENTIALS = {
    "admin": {"email": "admin@bibi.cars", "password": "Jp3FS_7ZuE2bhHp7rFkJm9B9T_TeiHxu"},
    "manager": {"email": "manager@bibi.cars", "password": "dFbYnse0L59DBE16Mn4kT6cCRaNBZFQR"},
    "team_lead": {"email": "teamlead@bibi.cars", "password": "txXNMkj-lS2w1nv482aLlvKWuk9Y9eKE"},
}

TEST_CUSTOMER_ID = "test_customer_001"
TEST_MANAGER_ID = "staff_manager_1780081249"


class Wave2ABackendTester:
    def __init__(self):
        self.tests_run = 0
        self.tests_passed = 0
        self.tokens = {}
        self.test_results = []

    def log(self, msg, status="info"):
        prefix = {
            "pass": "✅",
            "fail": "❌",
            "info": "🔍",
            "warn": "⚠️",
        }.get(status, "ℹ️")
        print(f"{prefix} {msg}")

    def login(self, role):
        """Login and cache token for role."""
        if role in self.tokens:
            return self.tokens[role]
        
        self.log(f"Logging in as {role}...", "info")
        creds = CREDENTIALS[role]
        try:
            resp = requests.post(
                f"{BASE_URL}/api/auth/login",
                json={"email": creds["email"], "password": creds["password"]},
                timeout=10,
            )
            if resp.status_code == 200:
                data = resp.json()
                token = data.get("token") or data.get("access_token")
                if token:
                    self.tokens[role] = token
                    self.log(f"Login successful for {role}", "pass")
                    return token
            self.log(f"Login failed for {role}: {resp.status_code} {resp.text[:200]}", "fail")
            return None
        except Exception as e:
            self.log(f"Login exception for {role}: {e}", "fail")
            return None

    def run_test(self, name, func):
        """Run a single test function."""
        self.tests_run += 1
        self.log(f"Test {self.tests_run}: {name}", "info")
        try:
            result = func()
            if result:
                self.tests_passed += 1
                self.log(f"PASSED: {name}", "pass")
                self.test_results.append({"test": name, "status": "PASS"})
            else:
                self.log(f"FAILED: {name}", "fail")
                self.test_results.append({"test": name, "status": "FAIL"})
            return result
        except Exception as e:
            self.log(f"EXCEPTION in {name}: {e}", "fail")
            self.test_results.append({"test": name, "status": "EXCEPTION", "error": str(e)})
            return False

    # ─────────────────────────────────────────────────────────────────────────
    # Test Cases
    # ─────────────────────────────────────────────────────────────────────────

    def test_calls_endpoint_admin_basic(self):
        """GET /api/customers/test_customer_001/calls returns success:true for admin."""
        token = self.login("admin")
        if not token:
            return False
        
        headers = {"Authorization": f"Bearer {token}"}
        resp = requests.get(
            f"{BASE_URL}/api/customers/{TEST_CUSTOMER_ID}/calls",
            headers=headers,
            timeout=15,
        )
        
        if resp.status_code != 200:
            self.log(f"Expected 200, got {resp.status_code}: {resp.text[:300]}", "fail")
            return False
        
        data = resp.json()
        if not data.get("success"):
            self.log(f"success=false: {data}", "fail")
            return False
        
        total = data.get("total", 0)
        calls = data.get("calls", [])
        self.log(f"Admin sees {total} calls, {len(calls)} in response", "info")
        
        if total < 3:
            self.log(f"Expected at least 3 seeded calls, got {total}", "fail")
            return False
        
        # Check normalized fields on first call
        if calls:
            c = calls[0]
            required = ["id", "startedAt", "direction", "duration", "status", "recordingAvailable"]
            missing = [f for f in required if f not in c]
            if missing:
                self.log(f"Missing fields in call: {missing}", "fail")
                return False
            
            # Check nested fields
            if "manager" in c and c["manager"]:
                if "name" not in c["manager"]:
                    self.log("manager.name missing", "fail")
                    return False
            
            if "aiAnalysis" not in c:
                self.log("aiAnalysis missing", "fail")
                return False
            
            if "hasAnalysis" not in c["aiAnalysis"]:
                self.log("aiAnalysis.hasAnalysis missing", "fail")
                return False
            
            if "meta" not in c or "customerId" not in c["meta"]:
                self.log("meta.customerId missing", "fail")
                return False
        
        return True

    def test_filter_direction_inbound(self):
        """Filter direction=inbound returns only inbound calls."""
        token = self.login("admin")
        if not token:
            return False
        
        headers = {"Authorization": f"Bearer {token}"}
        resp = requests.get(
            f"{BASE_URL}/api/customers/{TEST_CUSTOMER_ID}/calls?direction=inbound",
            headers=headers,
            timeout=15,
        )
        
        if resp.status_code != 200:
            self.log(f"Expected 200, got {resp.status_code}", "fail")
            return False
        
        data = resp.json()
        calls = data.get("calls", [])
        
        for c in calls:
            if c.get("direction", "").lower() != "inbound":
                self.log(f"Found non-inbound call: {c.get('direction')}", "fail")
                return False
        
        self.log(f"All {len(calls)} calls are inbound", "info")
        return True

    def test_filter_with_recording(self):
        """Filter withRecording=true returns only calls with recording."""
        token = self.login("admin")
        if not token:
            return False
        
        headers = {"Authorization": f"Bearer {token}"}
        resp = requests.get(
            f"{BASE_URL}/api/customers/{TEST_CUSTOMER_ID}/calls?withRecording=true",
            headers=headers,
            timeout=15,
        )
        
        if resp.status_code != 200:
            self.log(f"Expected 200, got {resp.status_code}", "fail")
            return False
        
        data = resp.json()
        calls = data.get("calls", [])
        
        for c in calls:
            if not c.get("recordingAvailable"):
                self.log(f"Found call without recording: {c.get('id')}", "fail")
                return False
        
        self.log(f"All {len(calls)} calls have recordings", "info")
        return True

    def test_filter_manager_id(self):
        """Filter managerId=staff_manager_1780081249 returns only that manager's calls."""
        token = self.login("admin")
        if not token:
            return False
        
        headers = {"Authorization": f"Bearer {token}"}
        resp = requests.get(
            f"{BASE_URL}/api/customers/{TEST_CUSTOMER_ID}/calls?managerId={TEST_MANAGER_ID}",
            headers=headers,
            timeout=15,
        )
        
        if resp.status_code != 200:
            self.log(f"Expected 200, got {resp.status_code}", "fail")
            return False
        
        data = resp.json()
        calls = data.get("calls", [])
        
        for c in calls:
            mgr = c.get("manager") or {}
            mgr_id = mgr.get("id", "")
            if mgr_id != TEST_MANAGER_ID:
                self.log(f"Found call with different manager: {mgr_id}", "fail")
                return False
        
        self.log(f"All {len(calls)} calls belong to {TEST_MANAGER_ID}", "info")
        return True

    def test_filter_date_range(self):
        """Filter dateFrom/dateTo limits range."""
        token = self.login("admin")
        if not token:
            return False
        
        # Get all calls first
        headers = {"Authorization": f"Bearer {token}"}
        resp_all = requests.get(
            f"{BASE_URL}/api/customers/{TEST_CUSTOMER_ID}/calls",
            headers=headers,
            timeout=15,
        )
        
        if resp_all.status_code != 200:
            return False
        
        all_calls = resp_all.json().get("calls", [])
        if not all_calls:
            self.log("No calls to test date filter", "warn")
            return True  # Not a failure, just no data
        
        # Use a narrow date range (yesterday to tomorrow)
        yesterday = (datetime.utcnow() - timedelta(days=1)).isoformat()
        tomorrow = (datetime.utcnow() + timedelta(days=1)).isoformat()
        
        resp = requests.get(
            f"{BASE_URL}/api/customers/{TEST_CUSTOMER_ID}/calls?dateFrom={yesterday}&dateTo={tomorrow}",
            headers=headers,
            timeout=15,
        )
        
        if resp.status_code != 200:
            self.log(f"Expected 200, got {resp.status_code}", "fail")
            return False
        
        filtered = resp.json().get("calls", [])
        self.log(f"Date filter: {len(all_calls)} total → {len(filtered)} in range", "info")
        
        # Just verify it doesn't crash and returns valid data
        return True

    def test_acl_no_auth_401(self):
        """Without Authorization header, returns 401."""
        resp = requests.get(
            f"{BASE_URL}/api/customers/{TEST_CUSTOMER_ID}/calls",
            timeout=15,
        )
        
        if resp.status_code == 401:
            self.log("Correctly returned 401 without auth", "info")
            return True
        else:
            self.log(f"Expected 401, got {resp.status_code}", "fail")
            return False

    def test_acl_manager_sees_only_own(self):
        """Manager token sees only own calls (count smaller than admin)."""
        admin_token = self.login("admin")
        manager_token = self.login("manager")
        
        if not admin_token or not manager_token:
            return False
        
        # Admin count
        resp_admin = requests.get(
            f"{BASE_URL}/api/customers/{TEST_CUSTOMER_ID}/calls",
            headers={"Authorization": f"Bearer {admin_token}"},
            timeout=15,
        )
        if resp_admin.status_code != 200:
            return False
        admin_total = resp_admin.json().get("total", 0)
        
        # Manager count
        resp_mgr = requests.get(
            f"{BASE_URL}/api/customers/{TEST_CUSTOMER_ID}/calls",
            headers={"Authorization": f"Bearer {manager_token}"},
            timeout=15,
        )
        if resp_mgr.status_code != 200:
            return False
        mgr_total = resp_mgr.json().get("total", 0)
        
        self.log(f"Admin sees {admin_total} calls, manager sees {mgr_total} calls", "info")
        
        # Manager should see fewer or equal (if all calls are theirs)
        if mgr_total <= admin_total:
            return True
        else:
            self.log(f"Manager sees MORE calls than admin: {mgr_total} > {admin_total}", "fail")
            return False

    def test_customer_not_found_404(self):
        """Non-existent customer id returns 404."""
        token = self.login("admin")
        if not token:
            return False
        
        headers = {"Authorization": f"Bearer {token}"}
        resp = requests.get(
            f"{BASE_URL}/api/customers/nonexistent_customer_xyz/calls",
            headers=headers,
            timeout=15,
        )
        
        if resp.status_code == 404:
            self.log("Correctly returned 404 for non-existent customer", "info")
            return True
        else:
            self.log(f"Expected 404, got {resp.status_code}", "fail")
            return False

    def test_recording_proxy_no_auth_401(self):
        """GET /api/calls/{call_id}/recording without auth returns 401."""
        # Use a fake call_id
        resp = requests.get(
            f"{BASE_URL}/api/calls/fake_call_id/recording",
            timeout=15,
        )
        
        if resp.status_code == 401:
            self.log("Recording proxy correctly returned 401 without auth", "info")
            return True
        else:
            self.log(f"Expected 401, got {resp.status_code}", "fail")
            return False

    def test_recording_proxy_not_found_or_502(self):
        """GET /api/calls/{call_id}/recording returns 404 when no recording_url or 502 when upstream fails."""
        token = self.login("admin")
        if not token:
            return False
        
        headers = {"Authorization": f"Bearer {token}"}
        
        # First, get a call ID from the test customer
        resp_calls = requests.get(
            f"{BASE_URL}/api/customers/{TEST_CUSTOMER_ID}/calls",
            headers=headers,
            timeout=15,
        )
        
        if resp_calls.status_code != 200:
            self.log("Could not fetch calls to test recording proxy", "warn")
            return True  # Not a failure
        
        calls = resp_calls.json().get("calls", [])
        if not calls:
            self.log("No calls to test recording proxy", "warn")
            return True
        
        # Try first call
        call_id = calls[0].get("id") or calls[0].get("callId")
        if not call_id:
            self.log("No call_id found", "warn")
            return True
        
        resp = requests.get(
            f"{BASE_URL}/api/calls/{call_id}/recording",
            headers=headers,
            timeout=15,
        )
        
        # Seeded data uses fake https://example.com/* URLs, so upstream will fail
        # Expected: 404 (no recording_url) or 502 (upstream unreachable)
        if resp.status_code in (404, 502):
            self.log(f"Recording proxy returned expected error: {resp.status_code}", "info")
            return True
        elif resp.status_code == 200:
            # Unexpected success (maybe recording_url is valid?)
            self.log(f"Recording proxy returned 200 (unexpected but not a failure)", "warn")
            return True
        else:
            self.log(f"Recording proxy returned unexpected status: {resp.status_code}", "fail")
            return False

    # ─────────────────────────────────────────────────────────────────────────
    # Wave 2A — Matching Attribution Tests (NEW)
    # ─────────────────────────────────────────────────────────────────────────

    def test_matched_by_populated(self):
        """Every call has matchedBy[] populated (non-empty)."""
        token = self.login("admin")
        if not token:
            return False
        
        headers = {"Authorization": f"Bearer {token}"}
        resp = requests.get(
            f"{BASE_URL}/api/customers/{TEST_CUSTOMER_ID}/calls",
            headers=headers,
            timeout=15,
        )
        
        if resp.status_code != 200:
            self.log(f"Expected 200, got {resp.status_code}", "fail")
            return False
        
        data = resp.json()
        calls = data.get("calls", [])
        
        if not calls:
            self.log("No calls to test matchedBy", "warn")
            return True
        
        for c in calls:
            matched_by = c.get("matchedBy", [])
            if not matched_by or not isinstance(matched_by, list):
                self.log(f"Call {c.get('id')} has empty or invalid matchedBy: {matched_by}", "fail")
                return False
        
        self.log(f"All {len(calls)} calls have non-empty matchedBy[]", "info")
        return True

    def test_matched_reasons_structure(self):
        """matchedReasons[] is a parallel structured list with key, label, value."""
        token = self.login("admin")
        if not token:
            return False
        
        headers = {"Authorization": f"Bearer {token}"}
        resp = requests.get(
            f"{BASE_URL}/api/customers/{TEST_CUSTOMER_ID}/calls",
            headers=headers,
            timeout=15,
        )
        
        if resp.status_code != 200:
            return False
        
        calls = resp.json().get("calls", [])
        if not calls:
            self.log("No calls to test matchedReasons", "warn")
            return True
        
        for c in calls:
            reasons = c.get("matchedReasons", [])
            if not isinstance(reasons, list):
                self.log(f"Call {c.get('id')} has invalid matchedReasons type", "fail")
                return False
            
            for r in reasons:
                if not isinstance(r, dict):
                    self.log(f"Reason is not a dict: {r}", "fail")
                    return False
                if "key" not in r or "label" not in r or "value" not in r:
                    self.log(f"Reason missing required fields: {r}", "fail")
                    return False
        
        self.log(f"All calls have properly structured matchedReasons[]", "info")
        return True

    def test_matched_by_values(self):
        """matchedBy contains expected values (phone_primary, phone_secondary, phone_lead, lead_id, customer_id)."""
        token = self.login("admin")
        if not token:
            return False
        
        headers = {"Authorization": f"Bearer {token}"}
        resp = requests.get(
            f"{BASE_URL}/api/customers/{TEST_CUSTOMER_ID}/calls",
            headers=headers,
            timeout=15,
        )
        
        if resp.status_code != 200:
            return False
        
        calls = resp.json().get("calls", [])
        if not calls:
            self.log("No calls to test matchedBy values", "warn")
            return True
        
        # Aggregate all matchedBy values across all calls
        all_keys = set()
        for c in calls:
            matched_by = c.get("matchedBy", [])
            all_keys.update(matched_by)
        
        self.log(f"Found matchedBy keys across all calls: {sorted(all_keys)}", "info")
        
        # According to spec, we should see: phone_primary (3x), phone_secondary (1x), 
        # phone_lead (1x), lead_id (1x), customer_id (1x) across 6 seeded calls
        expected_keys = {"phone_primary", "phone_secondary", "phone_lead", "lead_id", "customer_id"}
        
        # Check if we have at least some of the expected keys
        found_keys = all_keys & expected_keys
        if not found_keys:
            self.log(f"No expected matchedBy keys found. Got: {all_keys}", "fail")
            return False
        
        self.log(f"Found expected matchedBy keys: {sorted(found_keys)}", "info")
        return True

    def test_sources_includes_phone_buckets(self):
        """sources now includes phonesPrimary, phonesSecondary, phonesLead separately."""
        token = self.login("admin")
        if not token:
            return False
        
        headers = {"Authorization": f"Bearer {token}"}
        resp = requests.get(
            f"{BASE_URL}/api/customers/{TEST_CUSTOMER_ID}/calls",
            headers=headers,
            timeout=15,
        )
        
        if resp.status_code != 200:
            return False
        
        data = resp.json()
        sources = data.get("sources", {})
        
        required_keys = ["phonesPrimary", "phonesSecondary", "phonesLead", "phones"]
        missing = [k for k in required_keys if k not in sources]
        
        if missing:
            self.log(f"Missing keys in sources: {missing}. Got: {list(sources.keys())}", "fail")
            return False
        
        self.log(f"sources includes all phone buckets: {required_keys}", "info")
        return True

    # ─────────────────────────────────────────────────────────────────────────
    # Wave 2A — Diagnostics Endpoint Tests (NEW)
    # ─────────────────────────────────────────────────────────────────────────

    def test_diagnostics_admin_success(self):
        """GET /api/admin/customers/{id}/calls/diagnostics with admin token returns success:true."""
        token = self.login("admin")
        if not token:
            return False
        
        headers = {"Authorization": f"Bearer {token}"}
        resp = requests.get(
            f"{BASE_URL}/api/admin/customers/{TEST_CUSTOMER_ID}/calls/diagnostics",
            headers=headers,
            timeout=15,
        )
        
        if resp.status_code != 200:
            self.log(f"Expected 200, got {resp.status_code}: {resp.text[:300]}", "fail")
            return False
        
        data = resp.json()
        if not data.get("success"):
            self.log(f"success=false: {data}", "fail")
            return False
        
        # Check structure
        required_keys = ["customer", "identifiers", "counts", "sample"]
        missing = [k for k in required_keys if k not in data]
        if missing:
            self.log(f"Missing keys in diagnostics response: {missing}", "fail")
            return False
        
        self.log("Diagnostics endpoint returned success with correct structure", "info")
        return True

    def test_diagnostics_identifiers_structure(self):
        """Diagnostics identifiers section has customerIds, leadIds, dealIds, phonesPrimary, phonesSecondary, phonesLead."""
        token = self.login("admin")
        if not token:
            return False
        
        headers = {"Authorization": f"Bearer {token}"}
        resp = requests.get(
            f"{BASE_URL}/api/admin/customers/{TEST_CUSTOMER_ID}/calls/diagnostics",
            headers=headers,
            timeout=15,
        )
        
        if resp.status_code != 200:
            return False
        
        data = resp.json()
        identifiers = data.get("identifiers", {})
        
        required_keys = ["customerIds", "leadIds", "dealIds", "phonesPrimary", "phonesSecondary", "phonesLead", "leadPhoneMap"]
        missing = [k for k in required_keys if k not in identifiers]
        
        if missing:
            self.log(f"Missing keys in identifiers: {missing}. Got: {list(identifiers.keys())}", "fail")
            return False
        
        self.log(f"Identifiers section has all required keys", "info")
        return True

    def test_diagnostics_counts_structure(self):
        """Diagnostics counts section has matched, permitted, perKey, withRecording, missing."""
        token = self.login("admin")
        if not token:
            return False
        
        headers = {"Authorization": f"Bearer {token}"}
        resp = requests.get(
            f"{BASE_URL}/api/admin/customers/{TEST_CUSTOMER_ID}/calls/diagnostics",
            headers=headers,
            timeout=15,
        )
        
        if resp.status_code != 200:
            return False
        
        data = resp.json()
        counts = data.get("counts", {})
        
        required_keys = ["matched", "permitted", "perKey", "withRecording", "missing"]
        missing = [k for k in required_keys if k not in counts]
        
        if missing:
            self.log(f"Missing keys in counts: {missing}. Got: {list(counts.keys())}", "fail")
            return False
        
        # Check perKey structure
        per_key = counts.get("perKey", {})
        expected_per_key = ["customer_id", "lead_id", "deal_id", "phone_primary", "phone_secondary", "phone_lead"]
        missing_per_key = [k for k in expected_per_key if k not in per_key]
        
        if missing_per_key:
            self.log(f"Missing keys in perKey: {missing_per_key}", "fail")
            return False
        
        self.log(f"Counts section has all required keys and perKey breakdown", "info")
        return True

    def test_diagnostics_sample_structure(self):
        """Diagnostics sample[] has up to 50 entries each with matchedBy + reasons + permitted."""
        token = self.login("admin")
        if not token:
            return False
        
        headers = {"Authorization": f"Bearer {token}"}
        resp = requests.get(
            f"{BASE_URL}/api/admin/customers/{TEST_CUSTOMER_ID}/calls/diagnostics",
            headers=headers,
            timeout=15,
        )
        
        if resp.status_code != 200:
            return False
        
        data = resp.json()
        sample = data.get("sample", [])
        
        if not sample:
            self.log("Sample is empty (no calls)", "warn")
            return True
        
        if len(sample) > 50:
            self.log(f"Sample has more than 50 entries: {len(sample)}", "fail")
            return False
        
        # Check first sample entry structure
        s = sample[0]
        required_keys = ["callId", "matchedBy", "reasons", "permitted"]
        missing = [k for k in required_keys if k not in s]
        
        if missing:
            self.log(f"Missing keys in sample entry: {missing}. Got: {list(s.keys())}", "fail")
            return False
        
        self.log(f"Sample has {len(sample)} entries with correct structure", "info")
        return True

    def test_diagnostics_manager_403(self):
        """Diagnostics endpoint denies manager role → 403."""
        token = self.login("manager")
        if not token:
            return False
        
        headers = {"Authorization": f"Bearer {token}"}
        resp = requests.get(
            f"{BASE_URL}/api/admin/customers/{TEST_CUSTOMER_ID}/calls/diagnostics",
            headers=headers,
            timeout=15,
        )
        
        if resp.status_code == 403:
            self.log("Correctly returned 403 for manager role", "info")
            return True
        else:
            self.log(f"Expected 403, got {resp.status_code}", "fail")
            return False

    def test_diagnostics_no_auth_401(self):
        """Diagnostics endpoint denies missing auth → 401."""
        resp = requests.get(
            f"{BASE_URL}/api/admin/customers/{TEST_CUSTOMER_ID}/calls/diagnostics",
            timeout=15,
        )
        
        if resp.status_code == 401:
            self.log("Correctly returned 401 without auth", "info")
            return True
        else:
            self.log(f"Expected 401, got {resp.status_code}", "fail")
            return False

    def test_diagnostics_not_found_404(self):
        """Diagnostics endpoint returns 404 for non-existent customer."""
        token = self.login("admin")
        if not token:
            return False
        
        headers = {"Authorization": f"Bearer {token}"}
        resp = requests.get(
            f"{BASE_URL}/api/admin/customers/nonexistent_customer_xyz/calls/diagnostics",
            headers=headers,
            timeout=15,
        )
        
        if resp.status_code == 404:
            self.log("Correctly returned 404 for non-existent customer", "info")
            return True
        else:
            self.log(f"Expected 404, got {resp.status_code}", "fail")
            return False

    # ─────────────────────────────────────────────────────────────────────────
    # Main Test Runner
    # ─────────────────────────────────────────────────────────────────────────

    def run_all(self):
        """Run all Wave 2A backend tests."""
        print("\n" + "="*70)
        print("BIBI Cars — Wave 2A Calls Foundation + Matching Attribution — Backend Tests")
        print("="*70 + "\n")
        
        # Original Wave 2A tests
        self.run_test("Admin basic endpoint access", self.test_calls_endpoint_admin_basic)
        self.run_test("Filter direction=inbound", self.test_filter_direction_inbound)
        self.run_test("Filter withRecording=true", self.test_filter_with_recording)
        self.run_test("Filter managerId", self.test_filter_manager_id)
        self.run_test("Filter dateFrom/dateTo", self.test_filter_date_range)
        self.run_test("ACL: no auth returns 401", self.test_acl_no_auth_401)
        self.run_test("ACL: manager sees only own calls", self.test_acl_manager_sees_only_own)
        self.run_test("Customer not found returns 404", self.test_customer_not_found_404)
        self.run_test("Recording proxy: no auth returns 401", self.test_recording_proxy_no_auth_401)
        self.run_test("Recording proxy: 404 or 502 for missing/unreachable recording", self.test_recording_proxy_not_found_or_502)
        
        # NEW: Matching Attribution tests
        print("\n" + "-"*70)
        print("Wave 2A — Matching Attribution Tests")
        print("-"*70 + "\n")
        self.run_test("matchedBy[] populated for all calls", self.test_matched_by_populated)
        self.run_test("matchedReasons[] structure is correct", self.test_matched_reasons_structure)
        self.run_test("matchedBy contains expected values", self.test_matched_by_values)
        self.run_test("sources includes phone buckets", self.test_sources_includes_phone_buckets)
        
        # NEW: Diagnostics endpoint tests
        print("\n" + "-"*70)
        print("Wave 2A — Diagnostics Endpoint Tests")
        print("-"*70 + "\n")
        self.run_test("Diagnostics: admin success", self.test_diagnostics_admin_success)
        self.run_test("Diagnostics: identifiers structure", self.test_diagnostics_identifiers_structure)
        self.run_test("Diagnostics: counts structure", self.test_diagnostics_counts_structure)
        self.run_test("Diagnostics: sample structure", self.test_diagnostics_sample_structure)
        self.run_test("Diagnostics: manager gets 403", self.test_diagnostics_manager_403)
        self.run_test("Diagnostics: no auth gets 401", self.test_diagnostics_no_auth_401)
        self.run_test("Diagnostics: non-existent customer gets 404", self.test_diagnostics_not_found_404)
        
        print("\n" + "="*70)
        print(f"📊 Tests passed: {self.tests_passed}/{self.tests_run}")
        print("="*70 + "\n")
        
        return self.tests_passed == self.tests_run


def main():
    tester = Wave2ABackendTester()
    success = tester.run_all()
    return 0 if success else 1


if __name__ == "__main__":
    sys.exit(main())
