#!/usr/bin/env python3
"""
P2.7 Deal Calculator Panel Backend Test Suite
Tests all calculations endpoints for BIBI Cars CRM
"""

import requests
import sys
import json
from datetime import datetime
from typing import Dict, Any, Optional

class CalculationsBackendTester:
    def __init__(self, base_url: str = "https://project-review-120.preview.emergentagent.com"):
        self.base_url = base_url.rstrip("/")
        self.token: Optional[str] = None
        self.tests_run = 0
        self.tests_passed = 0
        self.tests_failed = 0
        self.failed_tests = []
        self.calc_id = None
        self.calc_id_v2 = None
        self.share_token = None
        self.deal_id = None
        
    def log(self, message: str, level: str = "INFO"):
        """Log test messages"""
        timestamp = datetime.now().strftime("%H:%M:%S")
        print(f"[{timestamp}] {level}: {message}")
    
    def run_test(
        self,
        name: str,
        method: str,
        endpoint: str,
        expected_status: int,
        data: Optional[Dict[str, Any]] = None,
        headers: Optional[Dict[str, str]] = None,
        check_response: Optional[callable] = None,
    ) -> tuple[bool, Any]:
        """Run a single API test"""
        url = f"{self.base_url}/{endpoint.lstrip('/')}"
        
        if headers is None:
            headers = {}
        
        headers.setdefault("Content-Type", "application/json")
        
        if self.token and "Authorization" not in headers:
            headers["Authorization"] = f"Bearer {self.token}"
        
        self.tests_run += 1
        self.log(f"Testing: {name}", "TEST")
        self.log(f"  → {method} {url}")
        
        try:
            if method == "GET":
                response = requests.get(url, headers=headers, timeout=30)
            elif method == "POST":
                response = requests.post(url, json=data, headers=headers, timeout=30)
            elif method == "PATCH":
                response = requests.patch(url, json=data, headers=headers, timeout=30)
            elif method == "DELETE":
                response = requests.delete(url, headers=headers, timeout=30)
            else:
                raise ValueError(f"Unsupported method: {method}")
            
            # Check status code
            status_match = response.status_code == expected_status
            
            # Try to parse JSON response
            try:
                response_data = response.json()
            except Exception:
                response_data = {"raw": response.text[:500]}
            
            # Run custom response checks if provided
            custom_check_passed = True
            custom_check_msg = ""
            if check_response and status_match:
                try:
                    custom_check_passed, custom_check_msg = check_response(response_data)
                except Exception as e:
                    custom_check_passed = False
                    custom_check_msg = f"Check function error: {str(e)}"
            
            success = status_match and custom_check_passed
            
            if success:
                self.tests_passed += 1
                self.log(f"  ✅ PASSED - Status: {response.status_code}", "PASS")
                if custom_check_msg:
                    self.log(f"     {custom_check_msg}")
            else:
                self.tests_failed += 1
                self.failed_tests.append(name)
                self.log(f"  ❌ FAILED", "FAIL")
                if not status_match:
                    self.log(f"     Expected status {expected_status}, got {response.status_code}")
                if not custom_check_passed:
                    self.log(f"     {custom_check_msg}")
                self.log(f"     Response: {json.dumps(response_data, indent=2)[:500]}")
            
            return success, response_data
            
        except Exception as e:
            self.tests_failed += 1
            self.failed_tests.append(name)
            self.log(f"  ❌ FAILED - Exception: {str(e)}", "FAIL")
            return False, {"error": str(e)}
    
    def test_login(self, email: str, password: str) -> bool:
        """Test login and store token"""
        self.log("=" * 60)
        self.log("AUTHENTICATION", "SECTION")
        self.log("=" * 60)
        
        success, response = self.run_test(
            name="Admin Login",
            method="POST",
            endpoint="/api/auth/login",
            expected_status=200,
            data={"email": email, "password": password},
            check_response=lambda r: (
                "access_token" in r or "token" in r,
                f"Token present: {'access_token' in r or 'token' in r}"
            )
        )
        
        token = response.get("access_token") or response.get("token")
        if success and token:
            self.token = token
            self.log(f"  Token acquired: {self.token[:20]}...")
            return True
        
        return False
    
    def test_get_deals(self) -> bool:
        """Get a deal ID for testing"""
        self.log("=" * 60)
        self.log("GET DEAL FOR TESTING", "SECTION")
        self.log("=" * 60)
        
        success, response = self.run_test(
            name="Get Deals List",
            method="GET",
            endpoint="/api/deals?limit=10",
            expected_status=200,
            check_response=lambda r: (
                "data" in r and isinstance(r.get("data"), list),
                f"Found {len(r.get('data', []))} deals"
            )
        )
        
        if success and response.get("data"):
            self.deal_id = response["data"][0]["id"]
            self.log(f"  Using deal_id: {self.deal_id}")
            return True
        
        return False
    
    def test_create_calculation(self) -> bool:
        """Test POST /api/calculations"""
        self.log("=" * 60)
        self.log("CREATE CALCULATION SNAPSHOT", "SECTION")
        self.log("=" * 60)
        
        def check_calc(r: Dict) -> tuple[bool, str]:
            checks = []
            checks.append(("success" in r, "success field present"))
            checks.append(("calculation" in r, "calculation object present"))
            
            if "calculation" in r:
                calc = r["calculation"]
                checks.append(("id" in calc, "calculation.id present"))
                checks.append(("share_token" in calc, "share_token present"))
                checks.append(("version" in calc, "version present"))
                checks.append(("status" in calc, "status present"))
                checks.append(("breakdown" in calc, "breakdown present"))
                checks.append(("outputs" in calc, "outputs present"))
                
                if "outputs" in calc:
                    checks.append(("total" in calc["outputs"], "outputs.total present"))
            
            all_passed = all(c[0] for c in checks)
            msg = "\n     ".join([f"{'✓' if c[0] else '✗'} {c[1]}" for c in checks])
            
            return all_passed, msg
        
        success, response = self.run_test(
            name="Create Calculation Snapshot",
            method="POST",
            endpoint="/api/calculations",
            expected_status=200,
            data={
                "origin": "usa",
                "price": 15000,
                "port": "NY",
                "auction": "Copart",
                "vehicleType": "sedan",
                "damaged": False,
                "deal_id": self.deal_id,
                "status": "draft"
            },
            check_response=check_calc
        )
        
        if success and response.get("calculation"):
            calc = response["calculation"]
            self.calc_id = calc.get("id")
            self.share_token = calc.get("share_token")
            self.log(f"  Created calc_id: {self.calc_id}")
            self.log(f"  Share token: {self.share_token}")
            return True
        
        return False
    
    def test_clone_calculation(self) -> bool:
        """Test POST /api/calculations/{id}/clone"""
        self.log("=" * 60)
        self.log("CLONE CALCULATION (NEW VERSION)", "SECTION")
        self.log("=" * 60)
        
        if not self.calc_id:
            self.log("  ⚠️  Skipping - no calc_id available", "WARN")
            return False
        
        def check_clone(r: Dict) -> tuple[bool, str]:
            checks = []
            checks.append(("success" in r, "success field present"))
            checks.append(("calculation" in r, "calculation object present"))
            
            if "calculation" in r:
                calc = r["calculation"]
                checks.append(("id" in calc, "calculation.id present"))
                checks.append(("parent_id" in calc, "parent_id present"))
                checks.append((calc.get("parent_id") == self.calc_id, f"parent_id matches original: {calc.get('parent_id')} == {self.calc_id}"))
                checks.append(("version" in calc, "version present"))
                checks.append((calc.get("version", 0) > 1, f"version incremented: {calc.get('version')}"))
            
            all_passed = all(c[0] for c in checks)
            msg = "\n     ".join([f"{'✓' if c[0] else '✗'} {c[1]}" for c in checks])
            
            return all_passed, msg
        
        success, response = self.run_test(
            name="Clone Calculation",
            method="POST",
            endpoint=f"/api/calculations/{self.calc_id}/clone",
            expected_status=200,
            data={},
            check_response=check_clone
        )
        
        if success and response.get("calculation"):
            self.calc_id_v2 = response["calculation"].get("id")
            self.log(f"  Created v2 calc_id: {self.calc_id_v2}")
            return True
        
        return False
    
    def test_status_transition(self) -> bool:
        """Test PATCH /api/calculations/{id}/status"""
        self.log("=" * 60)
        self.log("STATUS TRANSITION", "SECTION")
        self.log("=" * 60)
        
        if not self.calc_id:
            self.log("  ⚠️  Skipping - no calc_id available", "WARN")
            return False
        
        def check_status(r: Dict) -> tuple[bool, str]:
            checks = []
            checks.append(("success" in r, "success field present"))
            checks.append(("calculation" in r, "calculation object present"))
            
            if "calculation" in r:
                calc = r["calculation"]
                checks.append((calc.get("status") == "sent_to_client", f"status updated to sent_to_client: {calc.get('status')}"))
            
            all_passed = all(c[0] for c in checks)
            msg = "\n     ".join([f"{'✓' if c[0] else '✗'} {c[1]}" for c in checks])
            
            return all_passed, msg
        
        success, response = self.run_test(
            name="Update Status (draft → sent_to_client)",
            method="PATCH",
            endpoint=f"/api/calculations/{self.calc_id}/status",
            expected_status=200,
            data={"status": "sent_to_client"},
            check_response=check_status
        )
        
        return success
    
    def test_update_overrides(self) -> bool:
        """Test PATCH /api/calculations/{id}/overrides"""
        self.log("=" * 60)
        self.log("UPDATE OVERRIDES", "SECTION")
        self.log("=" * 60)
        
        if not self.calc_id_v2:
            self.log("  ⚠️  Skipping - no calc_id_v2 available", "WARN")
            return False
        
        def check_overrides(r: Dict) -> tuple[bool, str]:
            checks = []
            checks.append(("success" in r, "success field present"))
            checks.append(("calculation" in r, "calculation object present"))
            
            if "calculation" in r:
                calc = r["calculation"]
                checks.append(("outputs" in calc, "outputs present"))
                if "outputs" in calc:
                    # Total should be recalculated with discount
                    checks.append(("total" in calc["outputs"], "total present"))
            
            all_passed = all(c[0] for c in checks)
            msg = "\n     ".join([f"{'✓' if c[0] else '✗'} {c[1]}" for c in checks])
            
            return all_passed, msg
        
        success, response = self.run_test(
            name="Update Overrides (discount)",
            method="PATCH",
            endpoint=f"/api/calculations/{self.calc_id_v2}/overrides",
            expected_status=200,
            data={
                "overrides": {
                    "discount": 500
                }
            },
            check_response=check_overrides
        )
        
        return success
    
    def test_compare_calculations(self) -> bool:
        """Test GET /api/calculations-compare?a=&b="""
        self.log("=" * 60)
        self.log("COMPARE TWO CALCULATIONS", "SECTION")
        self.log("=" * 60)
        
        if not self.calc_id or not self.calc_id_v2:
            self.log("  ⚠️  Skipping - need two calc_ids", "WARN")
            return False
        
        def check_compare(r: Dict) -> tuple[bool, str]:
            checks = []
            checks.append(("success" in r, "success field present"))
            checks.append(("a" in r, "a object present"))
            checks.append(("b" in r, "b object present"))
            checks.append(("rows" in r and isinstance(r.get("rows"), list), "rows array present"))
            checks.append(("delta_total" in r, "delta_total present"))
            
            if "rows" in r and r["rows"]:
                row = r["rows"][0]
                checks.append(("key" in row, "row has key"))
                checks.append(("a" in row, "row has a value"))
                checks.append(("b" in row, "row has b value"))
                checks.append(("delta" in row, "row has delta"))
            
            all_passed = all(c[0] for c in checks)
            msg = "\n     ".join([f"{'✓' if c[0] else '✗'} {c[1]}" for c in checks])
            msg += f"\n     Found {len(r.get('rows', []))} rows, delta_total: {r.get('delta_total')}"
            
            return all_passed, msg
        
        success, response = self.run_test(
            name="Compare Calculations",
            method="GET",
            endpoint=f"/api/calculations-compare?a={self.calc_id}&b={self.calc_id_v2}",
            expected_status=200,
            check_response=check_compare
        )
        
        return success
    
    def test_timeline(self) -> bool:
        """Test GET /api/calculations/{id}/timeline"""
        self.log("=" * 60)
        self.log("CALCULATION TIMELINE", "SECTION")
        self.log("=" * 60)
        
        if not self.calc_id:
            self.log("  ⚠️  Skipping - no calc_id available", "WARN")
            return False
        
        def check_timeline(r: Dict) -> tuple[bool, str]:
            checks = []
            checks.append(("success" in r, "success field present"))
            checks.append(("items" in r and isinstance(r.get("items"), list), "items array present"))
            
            items = r.get("items", [])
            checks.append((len(items) >= 2, f"At least 2 events (created + status): {len(items)}"))
            
            if items:
                event = items[0]
                checks.append(("kind" in event, "event has kind"))
                checks.append(("at" in event, "event has timestamp"))
                checks.append(("label" in event, "event has label"))
            
            all_passed = all(c[0] for c in checks)
            msg = "\n     ".join([f"{'✓' if c[0] else '✗'} {c[1]}" for c in checks])
            
            return all_passed, msg
        
        success, response = self.run_test(
            name="Get Timeline",
            method="GET",
            endpoint=f"/api/calculations/{self.calc_id}/timeline",
            expected_status=200,
            check_response=check_timeline
        )
        
        return success
    
    def test_post_comment(self) -> bool:
        """Test POST /api/calculations/{id}/comments"""
        self.log("=" * 60)
        self.log("POST COMMENT", "SECTION")
        self.log("=" * 60)
        
        if not self.calc_id:
            self.log("  ⚠️  Skipping - no calc_id available", "WARN")
            return False
        
        def check_comment(r: Dict) -> tuple[bool, str]:
            checks = []
            checks.append(("success" in r, "success field present"))
            checks.append(("comment" in r, "comment object present"))
            
            if "comment" in r:
                cmt = r["comment"]
                checks.append(("id" in cmt, "comment.id present"))
                checks.append(("text" in cmt, "text present"))
                checks.append(("visibility" in cmt, "visibility present"))
                checks.append((cmt.get("visibility") == "shared", f"visibility is shared: {cmt.get('visibility')}"))
            
            all_passed = all(c[0] for c in checks)
            msg = "\n     ".join([f"{'✓' if c[0] else '✗'} {c[1]}" for c in checks])
            
            return all_passed, msg
        
        success, response = self.run_test(
            name="Post Comment (shared)",
            method="POST",
            endpoint=f"/api/calculations/{self.calc_id}/comments",
            expected_status=200,
            data={
                "text": "This is a test comment shared with client",
                "visibility": "shared"
            },
            check_response=check_comment
        )
        
        return success
    
    def test_list_comments(self) -> bool:
        """Test GET /api/calculations/{id}/comments"""
        self.log("=" * 60)
        self.log("LIST COMMENTS", "SECTION")
        self.log("=" * 60)
        
        if not self.calc_id:
            self.log("  ⚠️  Skipping - no calc_id available", "WARN")
            return False
        
        def check_list(r: Dict) -> tuple[bool, str]:
            checks = []
            checks.append(("success" in r, "success field present"))
            checks.append(("items" in r and isinstance(r.get("items"), list), "items array present"))
            checks.append((len(r.get("items", [])) >= 1, f"At least 1 comment: {len(r.get('items', []))}"))
            
            all_passed = all(c[0] for c in checks)
            msg = "\n     ".join([f"{'✓' if c[0] else '✗'} {c[1]}" for c in checks])
            
            return all_passed, msg
        
        success, response = self.run_test(
            name="List Comments",
            method="GET",
            endpoint=f"/api/calculations/{self.calc_id}/comments",
            expected_status=200,
            check_response=check_list
        )
        
        return success
    
    def test_public_share_view(self) -> bool:
        """Test GET /api/public/calculations/share/{token}"""
        self.log("=" * 60)
        self.log("PUBLIC SHARE VIEW", "SECTION")
        self.log("=" * 60)
        
        if not self.share_token:
            self.log("  ⚠️  Skipping - no share_token available", "WARN")
            return False
        
        def check_public(r: Dict) -> tuple[bool, str]:
            checks = []
            checks.append(("success" in r, "success field present"))
            checks.append(("calculation" in r, "calculation object present"))
            
            if "calculation" in r:
                calc = r["calculation"]
                checks.append(("breakdown" in calc, "breakdown present"))
                checks.append(("outputs" in calc, "outputs present"))
                checks.append(("comments" in calc, "comments array present"))
                # Should NOT have internal fields
                checks.append(("deal_id" not in calc, "deal_id stripped (internal)"))
                checks.append(("created_by" not in calc, "created_by stripped (internal)"))
            
            all_passed = all(c[0] for c in checks)
            msg = "\n     ".join([f"{'✓' if c[0] else '✗'} {c[1]}" for c in checks])
            
            return all_passed, msg
        
        # Test without auth (public endpoint)
        url = f"{self.base_url}/api/public/calculations/share/{self.share_token}"
        self.tests_run += 1
        self.log(f"Testing: Public Share View", "TEST")
        self.log(f"  → GET {url}")
        
        try:
            response = requests.get(url, timeout=30)
            status_match = response.status_code == 200
            response_data = response.json()
            
            custom_check_passed = True
            custom_check_msg = ""
            if status_match:
                custom_check_passed, custom_check_msg = check_public(response_data)
            
            success = status_match and custom_check_passed
            
            if success:
                self.tests_passed += 1
                self.log(f"  ✅ PASSED - Status: {response.status_code}", "PASS")
                if custom_check_msg:
                    self.log(f"     {custom_check_msg}")
            else:
                self.tests_failed += 1
                self.failed_tests.append("Public Share View")
                self.log(f"  ❌ FAILED", "FAIL")
                if not status_match:
                    self.log(f"     Expected status 200, got {response.status_code}")
                if not custom_check_passed:
                    self.log(f"     {custom_check_msg}")
            
            return success
            
        except Exception as e:
            self.tests_failed += 1
            self.failed_tests.append("Public Share View")
            self.log(f"  ❌ FAILED - Exception: {str(e)}", "FAIL")
            return False
    
    def test_public_approve(self) -> bool:
        """Test POST /api/public/calculations/share/{token}/approve"""
        self.log("=" * 60)
        self.log("PUBLIC APPROVE", "SECTION")
        self.log("=" * 60)
        
        if not self.share_token:
            self.log("  ⚠️  Skipping - no share_token available", "WARN")
            return False
        
        def check_approve(r: Dict) -> tuple[bool, str]:
            checks = []
            checks.append(("success" in r, "success field present"))
            checks.append(("status" in r, "status field present"))
            checks.append((r.get("status") == "approved_by_client", f"status is approved_by_client: {r.get('status')}"))
            checks.append(("approved_at" in r, "approved_at timestamp present"))
            
            all_passed = all(c[0] for c in checks)
            msg = "\n     ".join([f"{'✓' if c[0] else '✗'} {c[1]}" for c in checks])
            
            return all_passed, msg
        
        # Test without auth (public endpoint)
        url = f"{self.base_url}/api/public/calculations/share/{self.share_token}/approve"
        self.tests_run += 1
        self.log(f"Testing: Public Approve", "TEST")
        self.log(f"  → POST {url}")
        
        try:
            response = requests.post(url, json={"note": "Test approval from backend test"}, timeout=30)
            status_match = response.status_code == 200
            response_data = response.json()
            
            custom_check_passed = True
            custom_check_msg = ""
            if status_match:
                custom_check_passed, custom_check_msg = check_approve(response_data)
            
            success = status_match and custom_check_passed
            
            if success:
                self.tests_passed += 1
                self.log(f"  ✅ PASSED - Status: {response.status_code}", "PASS")
                if custom_check_msg:
                    self.log(f"     {custom_check_msg}")
            else:
                self.tests_failed += 1
                self.failed_tests.append("Public Approve")
                self.log(f"  ❌ FAILED", "FAIL")
                if not status_match:
                    self.log(f"     Expected status 200, got {response.status_code}")
                if not custom_check_passed:
                    self.log(f"     {custom_check_msg}")
            
            return success
            
        except Exception as e:
            self.tests_failed += 1
            self.failed_tests.append("Public Approve")
            self.log(f"  ❌ FAILED - Exception: {str(e)}", "FAIL")
            return False
    
    def test_notifications(self) -> bool:
        """Test GET /api/notifications/me - check for calculation_approved notification"""
        self.log("=" * 60)
        self.log("CHECK NOTIFICATIONS", "SECTION")
        self.log("=" * 60)
        
        def check_notifs(r: Dict) -> tuple[bool, str]:
            checks = []
            checks.append(("success" in r or "items" in r or "notifications" in r or isinstance(r, list), "response is valid"))
            
            # Handle both "items" and "notifications" keys
            items = r.get("items", r.get("notifications", [])) if isinstance(r, dict) else r
            checks.append((isinstance(items, list), "items/notifications is array"))
            
            # Look for calculation_approved notification
            calc_notif = None
            for item in items:
                if item.get("type") == "calculation_approved" or item.get("event") == "calculation_approved":
                    calc_notif = item
                    break
            
            checks.append((calc_notif is not None, f"Found calculation_approved notification: {calc_notif is not None}"))
            
            all_passed = all(c[0] for c in checks)
            msg = "\n     ".join([f"{'✓' if c[0] else '✗'} {c[1]}" for c in checks])
            msg += f"\n     Total notifications: {len(items)}"
            
            return all_passed, msg
        
        success, response = self.run_test(
            name="Check Notifications (calculation_approved)",
            method="GET",
            endpoint="/api/notifications/me",
            expected_status=200,
            check_response=check_notifs
        )
        
        return success
    
    def print_summary(self):
        """Print test summary"""
        self.log("=" * 60)
        self.log("TEST SUMMARY", "SUMMARY")
        self.log("=" * 60)
        self.log(f"Total Tests: {self.tests_run}")
        self.log(f"Passed: {self.tests_passed} ✅")
        self.log(f"Failed: {self.tests_failed} ❌")
        
        if self.tests_failed > 0:
            self.log("\nFailed Tests:")
            for test_name in self.failed_tests:
                self.log(f"  - {test_name}")
        
        success_rate = (self.tests_passed / self.tests_run * 100) if self.tests_run > 0 else 0
        self.log(f"\nSuccess Rate: {success_rate:.1f}%")
        self.log("=" * 60)
        
        return self.tests_failed == 0


def main():
    """Main test execution"""
    print("\n" + "=" * 60)
    print("BIBI Cars CRM - P2.7 Calculations Backend Test Suite")
    print("=" * 60 + "\n")
    
    tester = CalculationsBackendTester()
    
    # 1. Login as admin
    if not tester.test_login("admin@bibi.cars", "Jp3FS_7ZuE2bhHp7rFkJm9B9T_TeiHxu"):
        print("\n❌ Login failed - cannot proceed with authenticated tests")
        return 1
    
    # 2. Get a deal for testing
    if not tester.test_get_deals():
        print("\n❌ No deals available - cannot proceed")
        return 1
    
    # 3. Create calculation snapshot
    if not tester.test_create_calculation():
        print("\n❌ Failed to create calculation - cannot proceed")
        return 1
    
    # 4. Clone calculation (new version)
    tester.test_clone_calculation()
    
    # 5. Status transition
    tester.test_status_transition()
    
    # 6. Update overrides
    tester.test_update_overrides()
    
    # 7. Compare calculations
    tester.test_compare_calculations()
    
    # 8. Timeline
    tester.test_timeline()
    
    # 9. Post comment
    tester.test_post_comment()
    
    # 10. List comments
    tester.test_list_comments()
    
    # 11. Public share view
    tester.test_public_share_view()
    
    # 12. Public approve
    tester.test_public_approve()
    
    # 13. Check notifications
    tester.test_notifications()
    
    # Print summary
    all_passed = tester.print_summary()
    
    return 0 if all_passed else 1


if __name__ == "__main__":
    sys.exit(main())
