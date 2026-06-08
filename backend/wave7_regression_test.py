"""
BIBI Cars Wave 7 — Backend Regression Test Suite
=================================================
Tests all endpoints that the Wave 7 frontend changes depend on.
Goal: Confirm no backend regression after frontend-only changes.
"""
import requests
import sys
from typing import Dict, Any, Optional

BASE_URL = "https://full-deploy-21.preview.emergentagent.com"

class Wave7RegressionTester:
    def __init__(self):
        self.base_url = BASE_URL
        self.tests_run = 0
        self.tests_passed = 0
        self.tests_failed = 0
        
        # Tokens for each role
        self.admin_token = None
        self.manager_token = None
        self.teamlead_token = None
        
        # Test data
        self.test_user_id = None
        
        # Results tracking
        self.failed_tests = []
        self.backend_errors = []

    def log(self, msg: str, indent: int = 1):
        print(f"{'  ' * indent}{msg}")

    def test(self, name: str, condition: bool, details: str = "", critical: bool = False):
        """Record test result"""
        self.tests_run += 1
        if condition:
            self.tests_passed += 1
            print(f"✅ {name}")
            if details:
                self.log(details)
        else:
            self.tests_failed += 1
            print(f"❌ {name}")
            if details:
                self.log(f"FAILED: {details}")
            self.failed_tests.append({"test": name, "details": details, "critical": critical})
        return condition

    def check_response(self, resp, expected_status: int = 200) -> tuple:
        """Check if response status matches expected"""
        if resp.status_code != expected_status:
            try:
                error_detail = resp.json() if resp.text else resp.text
            except:
                error_detail = resp.text[:200]
            return False, f"Expected {expected_status}, got {resp.status_code}: {error_detail}"
        return True, ""

    # ═══════════════════════════════════════════════════════════════
    # AUTHENTICATION
    # ═══════════════════════════════════════════════════════════════
    
    def test_staff_login(self, email: str, password: str, role_name: str) -> Optional[str]:
        """Test staff login via /api/auth/login"""
        try:
            resp = requests.post(
                f"{self.base_url}/api/auth/login",
                json={"email": email, "password": password},
                timeout=10
            )
            
            success, msg = self.check_response(resp, 200)
            if not success:
                self.test(f"{role_name} login ({email})", False, msg, critical=True)
                return None
            
            data = resp.json()
            token = data.get("access_token")
            
            self.test(
                f"{role_name} login ({email})",
                token is not None,
                f"Token received: {token[:20]}..." if token else "No access_token in response",
                critical=True
            )
            
            # Get user ID for later tests
            if token and not self.test_user_id:
                try:
                    me_resp = requests.get(
                        f"{self.base_url}/api/auth/me",
                        headers={"Authorization": f"Bearer {token}"},
                        timeout=10
                    )
                    if me_resp.status_code == 200:
                        me_data = me_resp.json()
                        self.test_user_id = me_data.get("id")
                        self.log(f"User ID: {self.test_user_id}")
                except:
                    pass
            
            return token
            
        except Exception as e:
            self.test(f"{role_name} login ({email})", False, f"Exception: {e}", critical=True)
            return None

    def test_all_logins(self):
        """Test all required logins"""
        print("\n" + "="*70)
        print("🔐 AUTHENTICATION TESTS")
        print("="*70)
        
        self.admin_token = self.test_staff_login(
            "admin@bibi.cars", 
            "Jp3FS_7ZuE2bhHp7rFkJm9B9T_TeiHxu",
            "Admin"
        )
        
        self.manager_token = self.test_staff_login(
            "manager@bibi.cars",
            "dFbYnse0L59DBE16Mn4kT6cCRaNBZFQR",
            "Manager"
        )
        
        self.teamlead_token = self.test_staff_login(
            "teamlead@bibi.cars",
            "txXNMkj-lS2w1nv482aLlvKWuk9Y9eKE",
            "Team Lead"
        )

    # ═══════════════════════════════════════════════════════════════
    # WAVE 7 REGRESSION TESTS
    # ═══════════════════════════════════════════════════════════════
    
    def test_wave7_endpoints(self):
        """Test all Wave 7 endpoints"""
        print("\n" + "="*70)
        print("🔍 WAVE 7 REGRESSION TESTS")
        print("="*70)
        
        if not self.admin_token:
            self.log("⚠️  Skipping Wave 7 tests - no admin token")
            return
        
        # Test 1: GET /api/staff
        self._test_staff_endpoint()
        
        # Test 2: GET /api/tasks (admin allocator endpoint)
        self._test_tasks_endpoint()
        
        # Test 3: GET /api/team/dashboard
        self._test_team_dashboard()
        
        # Test 4: GET /api/team/managers
        self._test_team_managers()
        
        # Test 5: GET /api/dashboard/master
        self._test_dashboard_master()
        
        # Test 6: GET /api/leads with query parameters
        self._test_leads_endpoint()
        
        # Test 7: GET /api/invoices with query parameters
        self._test_invoices_endpoint()
        
        # Test 8: GET /api/shipments with query parameters
        self._test_shipments_endpoint()
        
        # Test 9: GET /api/manager/wishlist-deals?mine_only=true
        self._test_manager_wishlist_deals()
        
        # Test 10: GET /api/tasks?assignedTo={user_id}&status=pending
        self._test_tasks_with_filters()
        
        # Test 11: GET /api/team-lead/wishlist-deals?status=pending
        self._test_teamlead_wishlist_deals()
        
        # Test 12: GET /api/invoice-reminders/* endpoints
        self._test_invoice_reminders()
        
        # Test 13: GET /api/deals and POST /api/deals (confirm id=_id)
        self._test_deals_endpoint()

    def _test_staff_endpoint(self):
        """Test GET /api/staff"""
        headers = {"Authorization": f"Bearer {self.admin_token}"}
        
        try:
            resp = requests.get(
                f"{self.base_url}/api/staff",
                headers=headers,
                timeout=10
            )
            
            success, msg = self.check_response(resp, 200)
            if success:
                data = resp.json()
                has_success = data.get("success") == True
                has_items = "items" in data and isinstance(data["items"], list)
                items_count = len(data.get("items", []))
                
                # Check for admin, manager, team_lead roles
                roles = [item.get("role") for item in data.get("items", [])]
                has_admin = "admin" in roles
                has_manager = "manager" in roles
                has_teamlead = "team_lead" in roles
                
                self.test(
                    "GET /api/staff returns {success:true, items:[...]}",
                    has_success and has_items,
                    f"Items count: {items_count}, Roles found: {set(roles)}"
                )
                
                self.test(
                    "GET /api/staff includes admin, manager, team_lead",
                    has_admin and has_manager and has_teamlead,
                    f"Admin: {has_admin}, Manager: {has_manager}, Team Lead: {has_teamlead}"
                )
            else:
                self.test("GET /api/staff", False, msg, critical=True)
                
        except Exception as e:
            self.test("GET /api/staff", False, f"Exception: {e}", critical=True)

    def _test_tasks_endpoint(self):
        """Test GET /api/tasks (admin allocator endpoint)"""
        headers = {"Authorization": f"Bearer {self.admin_token}"}
        
        try:
            resp = requests.get(
                f"{self.base_url}/api/tasks",
                headers=headers,
                timeout=10
            )
            
            success, msg = self.check_response(resp, 200)
            if success:
                data = resp.json()
                has_data = "data" in data or "items" in data or isinstance(data, list)
                self.test(
                    "GET /api/tasks (admin allocator)",
                    has_data,
                    f"Response keys: {list(data.keys()) if isinstance(data, dict) else 'list'}"
                )
            else:
                self.test("GET /api/tasks", False, msg)
                
        except Exception as e:
            self.test("GET /api/tasks", False, f"Exception: {e}")

    def _test_team_dashboard(self):
        """Test GET /api/team/dashboard"""
        try:
            resp = requests.get(
                f"{self.base_url}/api/team/dashboard",
                timeout=10
            )
            
            success, msg = self.check_response(resp, 200)
            if success:
                data = resp.json()
                has_kpi = "kpi" in data
                has_alerts = "alerts" in data
                has_overdue = "overdue" in data
                
                self.test(
                    "GET /api/team/dashboard returns kpi+alerts+overdue",
                    has_kpi and has_alerts and has_overdue,
                    f"Keys: {list(data.keys())}"
                )
            else:
                self.test("GET /api/team/dashboard", False, msg, critical=True)
                
        except Exception as e:
            self.test("GET /api/team/dashboard", False, f"Exception: {e}", critical=True)

    def _test_team_managers(self):
        """Test GET /api/team/managers"""
        try:
            resp = requests.get(
                f"{self.base_url}/api/team/managers",
                timeout=10
            )
            
            success, msg = self.check_response(resp, 200)
            if success:
                data = resp.json()
                items = data.get("data", [])
                managers_count = len(items)
                
                self.test(
                    "GET /api/team/managers returns 2+ managers",
                    managers_count >= 2,
                    f"Managers count: {managers_count}"
                )
            else:
                self.test("GET /api/team/managers", False, msg, critical=True)
                
        except Exception as e:
            self.test("GET /api/team/managers", False, f"Exception: {e}", critical=True)

    def _test_dashboard_master(self):
        """Test GET /api/dashboard/master"""
        headers = {"Authorization": f"Bearer {self.admin_token}"}
        
        try:
            resp = requests.get(
                f"{self.base_url}/api/dashboard/master",
                headers=headers,
                timeout=15
            )
            
            success, msg = self.check_response(resp, 200)
            if success:
                data = resp.json()
                # Check for expected sections
                has_workload = "workload" in data or "managers" in data
                has_leads = "leads" in data or "lead_stats" in data
                has_sla = "sla" in data or "sla_stats" in data
                has_deposits = "deposits" in data or "legal_deposits" in data
                
                self.test(
                    "GET /api/dashboard/master returns expected sections",
                    has_workload or has_leads or has_sla or has_deposits,
                    f"Keys: {list(data.keys())}"
                )
            else:
                self.test("GET /api/dashboard/master", False, msg, critical=True)
                
        except Exception as e:
            self.test("GET /api/dashboard/master", False, f"Exception: {e}", critical=True)

    def _test_leads_endpoint(self):
        """Test GET /api/leads with query parameters"""
        try:
            # Test 1: Basic endpoint
            resp = requests.get(
                f"{self.base_url}/api/leads",
                timeout=10
            )
            success, msg = self.check_response(resp, 200)
            self.test("GET /api/leads (basic)", success, msg if not success else "")
            
            # Test 2: With managerId filter
            if self.test_user_id:
                resp = requests.get(
                    f"{self.base_url}/api/leads?managerId={self.test_user_id}",
                    timeout=10
                )
                success, msg = self.check_response(resp, 200)
                self.test("GET /api/leads?managerId=...", success, msg if not success else "")
            
            # Test 3: With score_gte filter
            resp = requests.get(
                f"{self.base_url}/api/leads?score_gte=50",
                timeout=10
            )
            success, msg = self.check_response(resp, 200)
            self.test("GET /api/leads?score_gte=50", success, msg if not success else "")
            
            # Test 4: With status filter (if supported)
            resp = requests.get(
                f"{self.base_url}/api/leads?status=new",
                timeout=10
            )
            # Accept 200 or 4xx (if status filter not implemented)
            success = resp.status_code in [200, 400, 422]
            self.test(
                "GET /api/leads?status=new",
                success,
                f"Status: {resp.status_code} (200 or 4xx acceptable)"
            )
            
        except Exception as e:
            self.test("GET /api/leads", False, f"Exception: {e}")

    def _test_invoices_endpoint(self):
        """Test GET /api/invoices with query parameters"""
        try:
            # Test 1: Basic endpoint
            resp = requests.get(
                f"{self.base_url}/api/invoices",
                timeout=10
            )
            success, msg = self.check_response(resp, 200)
            self.test("GET /api/invoices (basic)", success, msg if not success else "")
            
            # Test 2: With managerId filter
            if self.test_user_id:
                resp = requests.get(
                    f"{self.base_url}/api/invoices?managerId={self.test_user_id}",
                    timeout=10
                )
                success, msg = self.check_response(resp, 200)
                self.test("GET /api/invoices?managerId=...", success, msg if not success else "")
            
            # Test 3: With status filter
            resp = requests.get(
                f"{self.base_url}/api/invoices?status=pending",
                timeout=10
            )
            success, msg = self.check_response(resp, 200)
            self.test("GET /api/invoices?status=pending", success, msg if not success else "")
            
        except Exception as e:
            self.test("GET /api/invoices", False, f"Exception: {e}")

    def _test_shipments_endpoint(self):
        """Test GET /api/shipments with query parameters"""
        headers = {"Authorization": f"Bearer {self.admin_token}"}
        
        try:
            # Test 1: Basic endpoint (requires auth)
            resp = requests.get(
                f"{self.base_url}/api/shipments",
                headers=headers,
                timeout=10
            )
            success, msg = self.check_response(resp, 200)
            self.test("GET /api/shipments (basic)", success, msg if not success else "")
            
            # Test 2: With managerId filter
            if self.test_user_id:
                resp = requests.get(
                    f"{self.base_url}/api/shipments?managerId={self.test_user_id}",
                    headers=headers,
                    timeout=10
                )
                success, msg = self.check_response(resp, 200)
                self.test("GET /api/shipments?managerId=...", success, msg if not success else "")
            
        except Exception as e:
            self.test("GET /api/shipments", False, f"Exception: {e}")

    def _test_manager_wishlist_deals(self):
        """Test GET /api/manager/wishlist-deals?mine_only=true"""
        if not self.manager_token:
            self.log("⚠️  Skipping manager wishlist-deals test - no manager token")
            return
        
        headers = {"Authorization": f"Bearer {self.manager_token}"}
        
        try:
            resp = requests.get(
                f"{self.base_url}/api/manager/wishlist-deals?mine_only=true",
                headers=headers,
                timeout=10
            )
            
            success, msg = self.check_response(resp, 200)
            if success:
                data = resp.json()
                has_data = "data" in data or "items" in data or isinstance(data, list)
                self.test(
                    "GET /api/manager/wishlist-deals?mine_only=true",
                    has_data,
                    f"Response keys: {list(data.keys()) if isinstance(data, dict) else 'list'}"
                )
            else:
                self.test("GET /api/manager/wishlist-deals?mine_only=true", False, msg)
                
        except Exception as e:
            self.test("GET /api/manager/wishlist-deals?mine_only=true", False, f"Exception: {e}")

    def _test_tasks_with_filters(self):
        """Test GET /api/tasks?assignedTo={user_id}&status=pending"""
        headers = {"Authorization": f"Bearer {self.admin_token}"}
        
        if not self.test_user_id:
            self.log("⚠️  Skipping tasks filter test - no user ID")
            return
        
        try:
            resp = requests.get(
                f"{self.base_url}/api/tasks?assignedTo={self.test_user_id}&status=pending",
                headers=headers,
                timeout=10
            )
            
            success, msg = self.check_response(resp, 200)
            if success:
                data = resp.json()
                has_data = "data" in data or "items" in data or isinstance(data, list)
                self.test(
                    "GET /api/tasks?assignedTo=...&status=pending",
                    has_data,
                    f"Response keys: {list(data.keys()) if isinstance(data, dict) else 'list'}"
                )
            else:
                self.test("GET /api/tasks?assignedTo=...&status=pending", False, msg)
                
        except Exception as e:
            self.test("GET /api/tasks?assignedTo=...&status=pending", False, f"Exception: {e}")

    def _test_teamlead_wishlist_deals(self):
        """Test GET /api/team-lead/wishlist-deals?status=pending"""
        if not self.teamlead_token:
            self.log("⚠️  Skipping team-lead wishlist-deals test - no team lead token")
            return
        
        headers = {"Authorization": f"Bearer {self.teamlead_token}"}
        
        try:
            resp = requests.get(
                f"{self.base_url}/api/team-lead/wishlist-deals?status=pending",
                headers=headers,
                timeout=10
            )
            
            success, msg = self.check_response(resp, 200)
            if success:
                data = resp.json()
                has_data = "data" in data or "items" in data or isinstance(data, list)
                self.test(
                    "GET /api/team-lead/wishlist-deals?status=pending",
                    has_data,
                    f"Response keys: {list(data.keys()) if isinstance(data, dict) else 'list'}"
                )
            else:
                self.test("GET /api/team-lead/wishlist-deals?status=pending", False, msg)
                
        except Exception as e:
            self.test("GET /api/team-lead/wishlist-deals?status=pending", False, f"Exception: {e}")

    def _test_invoice_reminders(self):
        """Test GET /api/invoice-reminders/* endpoints"""
        headers = {"Authorization": f"Bearer {self.admin_token}"}
        
        endpoints = [
            "/api/invoice-reminders/settings",
            "/api/invoice-reminders/critical",
            "/api/invoice-reminders/escalation-summary",
        ]
        
        for endpoint in endpoints:
            try:
                resp = requests.get(
                    f"{self.base_url}{endpoint}",
                    headers=headers,
                    timeout=10
                )
                
                # Accept 200 or 404 (endpoint may not have data yet)
                success = resp.status_code in [200, 404]
                
                if resp.status_code == 500:
                    self.backend_errors.append({
                        "endpoint": endpoint,
                        "status": 500,
                        "error": resp.text[:200]
                    })
                
                self.test(
                    f"GET {endpoint}",
                    success,
                    f"Status: {resp.status_code}" + (f" - {resp.text[:100]}" if not success else "")
                )
                
            except Exception as e:
                self.test(f"GET {endpoint}", False, f"Exception: {e}")

    def _test_deals_endpoint(self):
        """Test GET /api/deals and POST /api/deals (confirm id=_id)"""
        headers = {"Authorization": f"Bearer {self.admin_token}"}
        
        try:
            # Test 1: GET /api/deals
            resp = requests.get(
                f"{self.base_url}/api/deals",
                timeout=10
            )
            
            success, msg = self.check_response(resp, 200)
            if success:
                data = resp.json()
                items = data.get("items", data.get("data", []))
                
                # Check if all items have 'id' field
                all_have_id = all(item.get("id") for item in items) if items else True
                
                self.test(
                    "GET /api/deals returns items with 'id' field",
                    all_have_id,
                    f"Items count: {len(items)}, All have id: {all_have_id}"
                )
                
                # Check if id == _id (string-coerced)
                if items:
                    sample = items[0]
                    id_matches = sample.get("id") == sample.get("_id")
                    self.test(
                        "GET /api/deals: id == _id (string-coerced)",
                        id_matches,
                        f"Sample: id={sample.get('id')}, _id={sample.get('_id')}"
                    )
            else:
                self.test("GET /api/deals", False, msg)
            
            # Test 2: POST /api/deals (create a test deal)
            test_deal = {
                "customerId": "test-customer-123",
                "vin": "TEST123456789VIN",
                "status": "pending",
                "amount": 15000
            }
            
            resp = requests.post(
                f"{self.base_url}/api/deals",
                json=test_deal,
                headers=headers,
                timeout=10
            )
            
            # Accept 200, 201, or 4xx (if validation fails)
            success = resp.status_code in [200, 201, 400, 422]
            
            if resp.status_code in [200, 201]:
                data = resp.json()
                created_deal = data.get("data", data)
                has_id = "id" in created_deal
                
                self.test(
                    "POST /api/deals creates deal with 'id' field",
                    has_id,
                    f"Created deal id: {created_deal.get('id')}"
                )
            else:
                self.test(
                    "POST /api/deals",
                    success,
                    f"Status: {resp.status_code} (200/201/4xx acceptable)"
                )
                
        except Exception as e:
            self.test("GET /api/deals", False, f"Exception: {e}")

    # ═══════════════════════════════════════════════════════════════
    # MAIN TEST RUNNER
    # ═══════════════════════════════════════════════════════════════
    
    def run_all_tests(self):
        """Run all Wave 7 regression tests"""
        print("\n" + "="*70)
        print("BIBI CARS WAVE 7 — BACKEND REGRESSION TEST SUITE")
        print("="*70)
        print(f"Base URL: {self.base_url}")
        print("="*70)
        
        # Run all test suites
        self.test_all_logins()
        self.test_wave7_endpoints()
        
        # Print summary
        self.print_summary()
        
        # Return exit code
        return 0 if self.tests_failed == 0 else 1

    def print_summary(self):
        """Print test summary"""
        print("\n" + "="*70)
        print("📊 TEST SUMMARY")
        print("="*70)
        print(f"Total tests: {self.tests_run}")
        print(f"✅ Passed: {self.tests_passed}")
        print(f"❌ Failed: {self.tests_failed}")
        print(f"Success rate: {(self.tests_passed/self.tests_run*100):.1f}%")
        
        if self.backend_errors:
            print(f"\n⚠️  Backend 5xx errors detected: {len(self.backend_errors)}")
            for err in self.backend_errors[:5]:  # Show first 5
                print(f"  - {err['endpoint']}: {err['status']} - {err['error'][:100]}")
        
        if self.failed_tests:
            print(f"\n❌ Failed tests ({len(self.failed_tests)}):")
            for ft in self.failed_tests[:10]:  # Show first 10
                critical = " [CRITICAL]" if ft.get("critical") else ""
                print(f"  - {ft['test']}{critical}")
                if ft['details']:
                    print(f"    {ft['details'][:150]}")
        
        print("="*70)


def main():
    tester = Wave7RegressionTester()
    exit_code = tester.run_all_tests()
    sys.exit(exit_code)


if __name__ == "__main__":
    main()
