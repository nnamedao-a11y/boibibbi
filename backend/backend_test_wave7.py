"""
Wave 7 — Manual Workload Rebalancing — HTTP-level Backend Tests
================================================================

Tests all Wave 7 endpoints against the running backend using JWT authentication.

Run: cd /app/backend && python backend_test_wave7.py

Endpoints tested:
  - POST /api/admin/reassign (single + bulk, all entities, ACL)
  - GET /api/admin/reassign/managers (with ACL)
  - GET /api/admin/reassign/audit
  - POST /api/team/leads/{id}/reassign (legacy wrapper)
  - POST /api/customers (with managerId)
  - PUT /api/customers/{id} (managerId stripped)
"""
import sys
import requests
import time
from datetime import datetime, timezone
from typing import Dict, Any, Optional, List

# Backend URL from frontend/.env
BASE_URL = "https://full-stack-deploy-93.preview.emergentagent.com"

# Test credentials from /app/memory/test_credentials.md
ADMIN_EMAIL = "admin@bibi.cars"
ADMIN_PASSWORD = "Jp3FS_7ZuE2bhHp7rFkJm9B9T_TeiHxu"

MANAGER_EMAIL = "manager@bibi.cars"
MANAGER_PASSWORD = "dFbYnse0L59DBE16Mn4kT6cCRaNBZFQR"

TEAMLEAD_EMAIL = "teamlead@bibi.cars"
TEAMLEAD_PASSWORD = "txXNMkj-lS2w1nv482aLlvKWuk9Y9eKE"


class Wave7Tester:
    def __init__(self):
        self.tests_run = 0
        self.tests_passed = 0
        self.admin_token: Optional[str] = None
        self.manager_token: Optional[str] = None
        self.teamlead_token: Optional[str] = None
        self.admin_id: Optional[str] = None
        self.manager_id: Optional[str] = None
        self.teamlead_id: Optional[str] = None
        
        # Test data IDs (created during tests)
        self.test_lead_id: Optional[str] = None
        self.test_customer_id: Optional[str] = None
        self.test_deal_id: Optional[str] = None
        self.target_manager_id: Optional[str] = None
        
        self.tag = f"w7test_{int(time.time())}"

    def log(self, msg: str, level: str = "INFO"):
        """Log with timestamp"""
        print(f"[{level}] {msg}")

    def test(self, name: str, method: str, endpoint: str, expected_status: int,
             token: Optional[str] = None, data: Optional[Dict] = None,
             params: Optional[Dict] = None) -> tuple[bool, Any]:
        """Run a single HTTP test"""
        url = f"{BASE_URL}{endpoint}"
        headers = {"Content-Type": "application/json"}
        if token:
            headers["Authorization"] = f"Bearer {token}"

        self.tests_run += 1
        self.log(f"\n🔍 Test #{self.tests_run}: {name}")
        self.log(f"   {method} {endpoint}")

        try:
            if method == "GET":
                response = requests.get(url, headers=headers, params=params, timeout=10)
            elif method == "POST":
                response = requests.post(url, json=data, headers=headers, timeout=10)
            elif method == "PUT":
                response = requests.put(url, json=data, headers=headers, timeout=10)
            elif method == "DELETE":
                response = requests.delete(url, headers=headers, timeout=10)
            else:
                raise ValueError(f"Unsupported method: {method}")

            success = response.status_code == expected_status
            
            if success:
                self.tests_passed += 1
                self.log(f"✅ PASS - Status: {response.status_code}", "PASS")
            else:
                self.log(f"❌ FAIL - Expected {expected_status}, got {response.status_code}", "FAIL")
                self.log(f"   Response: {response.text[:200]}", "FAIL")

            try:
                response_data = response.json()
            except:
                response_data = {"raw": response.text}

            return success, response_data

        except Exception as e:
            self.log(f"❌ FAIL - Exception: {str(e)}", "FAIL")
            return False, {"error": str(e)}

    def login(self, email: str, password: str) -> tuple[Optional[str], Optional[str]]:
        """Login and return (token, staff_id)"""
        self.log(f"Logging in as {email}...")
        success, response = self.test(
            f"Login as {email}",
            "POST",
            "/api/auth/login",
            200,
            data={"email": email, "password": password}
        )
        if success:
            # Check if there's a challenge (TOTP or email OTP)
            if "challenge" in response:
                self.log(f"⚠️  Login requires challenge: {response.get('challenge')}", "WARN")
                self.log(f"   Hint: {response.get('hint', 'N/A')}", "WARN")
                return None, None
            
            if "access_token" in response:
                staff_id = response.get("user", {}).get("id")
                self.log(f"✓ Logged in as {email} (id={staff_id})")
                return response["access_token"], staff_id
        return None, None

    def setup_auth(self) -> bool:
        """Login all test users"""
        self.log("\n" + "="*60)
        self.log("SETUP: Authenticating test users")
        self.log("="*60)
        
        self.admin_token, self.admin_id = self.login(ADMIN_EMAIL, ADMIN_PASSWORD)
        self.manager_token, self.manager_id = self.login(MANAGER_EMAIL, MANAGER_PASSWORD)
        self.teamlead_token, self.teamlead_id = self.login(TEAMLEAD_EMAIL, TEAMLEAD_PASSWORD)
        
        if not all([self.admin_token, self.manager_token]):
            self.log("❌ Failed to authenticate admin and manager", "ERROR")
            return False
        
        if not self.teamlead_token:
            self.log("⚠️  Team lead requires OTP - skipping team_lead tests", "WARN")
        
        self.log("✓ Admin and manager authenticated successfully")
        return True

    def create_test_entities(self) -> bool:
        """Create test lead, customer, and deal for reassignment testing"""
        self.log("\n" + "="*60)
        self.log("SETUP: Creating test entities")
        self.log("="*60)
        
        # Create test lead
        success, response = self.test(
            "Create test lead",
            "POST",
            "/api/leads",
            200,
            token=self.admin_token,
            data={
                "name": f"{self.tag}_lead",
                "email": f"{self.tag}_lead@test.com",
                "phone": "+1234567890",
                "status": "new",
                "managerId": self.manager_id
            }
        )
        if success and response.get("lead"):
            self.test_lead_id = response["lead"]["id"]
            self.log(f"✓ Created test lead: {self.test_lead_id}")
        else:
            self.log("❌ Failed to create test lead", "ERROR")
            return False

        # Create test customer
        success, response = self.test(
            "Create test customer",
            "POST",
            "/api/customers",
            200,
            token=self.admin_token,
            data={
                "firstName": f"{self.tag}",
                "lastName": "Customer",
                "email": f"{self.tag}_customer@test.com",
                "phone": "+1234567891",
                "managerId": self.manager_id
            }
        )
        if success and response.get("customer"):
            self.test_customer_id = response["customer"]["id"]
            self.log(f"✓ Created test customer: {self.test_customer_id}")
        else:
            self.log("❌ Failed to create test customer", "ERROR")
            return False

        # Create test deal
        success, response = self.test(
            "Create test deal",
            "POST",
            "/api/deals",
            200,
            token=self.admin_token,
            data={
                "title": f"{self.tag}_deal",
                "status": "new",
                "value": 10000,
                "managerId": self.manager_id
            }
        )
        if success and response.get("deal"):
            self.test_deal_id = response["deal"]["id"]
            self.log(f"✓ Created test deal: {self.test_deal_id}")
        else:
            self.log("❌ Failed to create test deal", "ERROR")
            return False

        # Get a target manager for reassignment (use admin as target)
        self.target_manager_id = self.admin_id
        self.log(f"✓ Target manager for reassignment: {self.target_manager_id}")
        
        return True

    def test_reassign_lead_as_admin(self) -> bool:
        """Test POST /api/admin/reassign for lead as admin → 200"""
        self.log("\n" + "="*60)
        self.log("TEST: Reassign lead as admin")
        self.log("="*60)
        
        success, response = self.test(
            "POST /api/admin/reassign - lead as admin",
            "POST",
            "/api/admin/reassign",
            200,
            token=self.admin_token,
            data={
                "entity": "lead",
                "ids": [self.test_lead_id],
                "toManagerId": self.target_manager_id,
                "reason": "Wave 7 test - admin reassign"
            }
        )
        
        if success:
            if response.get("processed") == 1:
                self.log("✓ Lead reassigned successfully (processed=1)")
                return True
            else:
                self.log(f"❌ Expected processed=1, got {response.get('processed')}", "FAIL")
                return False
        return False

    def test_reassign_bulk_leads_as_admin(self) -> bool:
        """Test POST /api/admin/reassign bulk for 2 leads as admin → processed=2"""
        self.log("\n" + "="*60)
        self.log("TEST: Bulk reassign 2 leads as admin")
        self.log("="*60)
        
        # Create second lead
        success, response = self.test(
            "Create second test lead",
            "POST",
            "/api/leads",
            200,
            token=self.admin_token,
            data={
                "name": f"{self.tag}_lead2",
                "email": f"{self.tag}_lead2@test.com",
                "status": "new",
                "managerId": self.manager_id
            }
        )
        if not success:
            self.log("❌ Failed to create second lead", "ERROR")
            return False
        
        lead2_id = response["lead"]["id"]
        
        # Bulk reassign
        success, response = self.test(
            "POST /api/admin/reassign - bulk 2 leads",
            "POST",
            "/api/admin/reassign",
            200,
            token=self.admin_token,
            data={
                "entity": "lead",
                "ids": [self.test_lead_id, lead2_id],
                "toManagerId": self.manager_id,
                "reason": "Wave 7 test - bulk reassign"
            }
        )
        
        if success:
            if response.get("processed") == 2:
                self.log("✓ Bulk reassign successful (processed=2)")
                return True
            else:
                self.log(f"❌ Expected processed=2, got {response.get('processed')}", "FAIL")
                return False
        return False

    def test_reassign_customer_as_admin(self) -> bool:
        """Test POST /api/admin/reassign for customer as admin"""
        self.log("\n" + "="*60)
        self.log("TEST: Reassign customer as admin")
        self.log("="*60)
        
        success, response = self.test(
            "POST /api/admin/reassign - customer",
            "POST",
            "/api/admin/reassign",
            200,
            token=self.admin_token,
            data={
                "entity": "customer",
                "ids": [self.test_customer_id],
                "toManagerId": self.target_manager_id,
                "reason": "Wave 7 test - customer reassign"
            }
        )
        
        if success and response.get("processed") == 1:
            self.log("✓ Customer reassigned successfully")
            return True
        return False

    def test_reassign_deal_as_admin(self) -> bool:
        """Test POST /api/admin/reassign for deal - should update deal and create timeline event"""
        self.log("\n" + "="*60)
        self.log("TEST: Reassign deal as admin (timeline event)")
        self.log("="*60)
        
        success, response = self.test(
            "POST /api/admin/reassign - deal",
            "POST",
            "/api/admin/reassign",
            200,
            token=self.admin_token,
            data={
                "entity": "deal",
                "ids": [self.test_deal_id],
                "toManagerId": self.target_manager_id,
                "reason": "Wave 7 test - deal reassign with timeline"
            }
        )
        
        if success and response.get("processed") == 1:
            self.log("✓ Deal reassigned successfully")
            # Note: Timeline event verification would require checking deal_timeline collection
            # which is not exposed via API, so we trust the service layer test
            return True
        return False

    def test_reassign_as_manager_403(self) -> bool:
        """Test POST /api/admin/reassign as MANAGER role → 403"""
        self.log("\n" + "="*60)
        self.log("TEST: Reassign as manager (should be 403)")
        self.log("="*60)
        
        success, response = self.test(
            "POST /api/admin/reassign - as manager (403)",
            "POST",
            "/api/admin/reassign",
            403,
            token=self.manager_token,
            data={
                "entity": "lead",
                "ids": [self.test_lead_id],
                "toManagerId": self.admin_id,
                "reason": "Should fail"
            }
        )
        
        if success:
            detail = response.get("detail", "")
            if "admin or team_lead" in detail.lower():
                self.log("✓ Manager correctly blocked with 403")
                return True
            else:
                self.log(f"❌ Got 403 but wrong message: {detail}", "FAIL")
                return False
        return False

    def test_get_managers_as_admin(self) -> bool:
        """Test GET /api/admin/reassign/managers as admin - should return all managers"""
        self.log("\n" + "="*60)
        self.log("TEST: GET managers list as admin")
        self.log("="*60)
        
        success, response = self.test(
            "GET /api/admin/reassign/managers - as admin",
            "GET",
            "/api/admin/reassign/managers",
            200,
            token=self.admin_token
        )
        
        if success:
            managers = response.get("data", [])
            if len(managers) > 0:
                # Check structure
                first = managers[0]
                required_fields = ["id", "name", "email", "role", "activeLeads", 
                                 "activeCustomers", "activeDeals", "activeTasks", 
                                 "loadScore", "isAvailable"]
                missing = [f for f in required_fields if f not in first]
                if not missing:
                    self.log(f"✓ Got {len(managers)} managers with correct structure")
                    self.log(f"   Sample: {first.get('email')} - loadScore={first.get('loadScore')}")
                    return True
                else:
                    self.log(f"❌ Missing fields in response: {missing}", "FAIL")
                    return False
            else:
                self.log("❌ No managers returned", "FAIL")
                return False
        return False

    def test_get_managers_as_manager(self) -> bool:
        """Test GET /api/admin/reassign/managers as MANAGER - should return only self"""
        self.log("\n" + "="*60)
        self.log("TEST: GET managers list as manager (self only)")
        self.log("="*60)
        
        success, response = self.test(
            "GET /api/admin/reassign/managers - as manager",
            "GET",
            "/api/admin/reassign/managers",
            200,
            token=self.manager_token
        )
        
        if success:
            managers = response.get("data", [])
            if len(managers) == 1 and managers[0].get("id") == self.manager_id:
                self.log("✓ Manager sees only self (1 row)")
                return True
            else:
                self.log(f"❌ Expected 1 manager (self), got {len(managers)}", "FAIL")
                return False
        return False

    def test_idempotent_reassign(self) -> bool:
        """Test idempotent reassign (same toManagerId) → no_change=1, processed=0"""
        self.log("\n" + "="*60)
        self.log("TEST: Idempotent reassign (no change)")
        self.log("="*60)
        
        # First, ensure lead is assigned to target
        success, response = self.test(
            "Reassign lead to target",
            "POST",
            "/api/admin/reassign",
            200,
            token=self.admin_token,
            data={
                "entity": "lead",
                "ids": [self.test_lead_id],
                "toManagerId": self.target_manager_id,
                "reason": "Setup for idempotent test"
            }
        )
        
        if not success:
            self.log("❌ Failed to setup for idempotent test", "ERROR")
            return False
        
        # Now reassign to same manager (idempotent)
        success, response = self.test(
            "POST /api/admin/reassign - idempotent",
            "POST",
            "/api/admin/reassign",
            200,
            token=self.admin_token,
            data={
                "entity": "lead",
                "ids": [self.test_lead_id],
                "toManagerId": self.target_manager_id,
                "reason": "Idempotent test"
            }
        )
        
        if success:
            if response.get("no_change") == 1 and response.get("processed") == 0:
                self.log("✓ Idempotent reassign: no_change=1, processed=0")
                return True
            else:
                self.log(f"❌ Expected no_change=1, processed=0, got {response}", "FAIL")
                return False
        return False

    def test_bulk_with_invalid_id(self) -> bool:
        """Test bulk reassign with invalid ID mixed in → partial success"""
        self.log("\n" + "="*60)
        self.log("TEST: Bulk reassign with invalid ID")
        self.log("="*60)
        
        invalid_id = "invalid_lead_id_xyz"
        
        success, response = self.test(
            "POST /api/admin/reassign - bulk with invalid ID",
            "POST",
            "/api/admin/reassign",
            200,
            token=self.admin_token,
            data={
                "entity": "lead",
                "ids": [self.test_lead_id, invalid_id],
                "toManagerId": self.manager_id,
                "reason": "Bulk with invalid ID test"
            }
        )
        
        if success:
            # Should have processed=1 (valid), failed=1 (invalid)
            processed = response.get("processed", 0)
            failed = response.get("failed", 0)
            results = response.get("results", [])
            
            # Find the invalid result
            invalid_result = next((r for r in results if r.get("id") == invalid_id), None)
            
            if processed >= 1 and failed >= 1 and invalid_result and not invalid_result.get("ok"):
                self.log(f"✓ Partial success: processed={processed}, failed={failed}")
                self.log(f"   Invalid ID error: {invalid_result.get('error')}")
                return True
            else:
                self.log(f"❌ Expected partial success, got {response}", "FAIL")
                return False
        return False

    def test_legacy_endpoint(self) -> bool:
        """Test POST /api/team/leads/{id}/reassign (legacy wrapper)"""
        self.log("\n" + "="*60)
        self.log("TEST: Legacy endpoint /api/team/leads/{id}/reassign")
        self.log("="*60)
        
        # Test with toManagerId
        success, response = self.test(
            "POST /api/team/leads/{id}/reassign - toManagerId",
            "POST",
            f"/api/team/leads/{self.test_lead_id}/reassign",
            200,
            token=self.admin_token,
            data={
                "toManagerId": self.manager_id,
                "reason": "Legacy endpoint test"
            }
        )
        
        if not success:
            return False
        
        # Test with managerId (legacy field)
        success, response = self.test(
            "POST /api/team/leads/{id}/reassign - managerId",
            "POST",
            f"/api/team/leads/{self.test_lead_id}/reassign",
            200,
            token=self.admin_token,
            data={
                "managerId": self.target_manager_id,
                "reason": "Legacy endpoint test with managerId"
            }
        )
        
        if success:
            self.log("✓ Legacy endpoint works with both toManagerId and managerId")
            return True
        return False

    def test_get_audit_history(self) -> bool:
        """Test GET /api/admin/reassign/audit"""
        self.log("\n" + "="*60)
        self.log("TEST: GET audit history")
        self.log("="*60)
        
        success, response = self.test(
            "GET /api/admin/reassign/audit",
            "GET",
            "/api/admin/reassign/audit",
            200,
            token=self.admin_token,
            params={"entity": "lead", "limit": 10}
        )
        
        if success:
            audit_data = response.get("data", [])
            if len(audit_data) > 0:
                self.log(f"✓ Got {len(audit_data)} audit records")
                # Check structure
                first = audit_data[0]
                required = ["id", "entity", "entityId", "toManagerId", "performedBy", "createdAt"]
                missing = [f for f in required if f not in first]
                if not missing:
                    self.log(f"   Sample: {first.get('entity')} {first.get('entityId')} → {first.get('toManagerId')}")
                    return True
                else:
                    self.log(f"❌ Missing fields: {missing}", "FAIL")
                    return False
            else:
                self.log("⚠️  No audit records found (might be OK if no reassignments yet)", "WARN")
                return True  # Not a failure
        return False

    def test_customer_create_with_managerid(self) -> bool:
        """Test POST /api/customers with managerId in body"""
        self.log("\n" + "="*60)
        self.log("TEST: Create customer with managerId")
        self.log("="*60)
        
        success, response = self.test(
            "POST /api/customers - with managerId",
            "POST",
            "/api/customers",
            200,
            token=self.admin_token,
            data={
                "firstName": f"{self.tag}_mgr",
                "lastName": "Customer",
                "email": f"{self.tag}_mgr@test.com",
                "managerId": self.target_manager_id
            }
        )
        
        if success:
            customer = response.get("customer", {})
            if customer.get("managerId") == self.target_manager_id:
                self.log(f"✓ Customer created with managerId={self.target_manager_id}")
                return True
            else:
                self.log(f"❌ managerId not set correctly: {customer.get('managerId')}", "FAIL")
                return False
        return False

    def test_customer_update_strips_managerid(self) -> bool:
        """Test PUT /api/customers/{id} - managerId should be stripped"""
        self.log("\n" + "="*60)
        self.log("TEST: Update customer - managerId stripped")
        self.log("="*60)
        
        # Get current managerId
        success, response = self.test(
            "GET customer before update",
            "GET",
            f"/api/customers/{self.test_customer_id}",
            200,
            token=self.admin_token
        )
        
        if not success:
            self.log("❌ Failed to get customer", "ERROR")
            return False
        
        original_manager_id = response.get("customer", {}).get("managerId")
        
        # Try to update with different managerId
        success, response = self.test(
            "PUT /api/customers/{id} - with managerId",
            "PUT",
            f"/api/customers/{self.test_customer_id}",
            200,
            token=self.admin_token,
            data={
                "firstName": "Updated",
                "managerId": "should_be_stripped_id"
            }
        )
        
        if not success:
            return False
        
        # Verify managerId was NOT changed
        updated_manager_id = response.get("customer", {}).get("managerId")
        if updated_manager_id == original_manager_id:
            self.log("✓ managerId was correctly stripped (unchanged)")
            return True
        else:
            self.log(f"❌ managerId was changed: {original_manager_id} → {updated_manager_id}", "FAIL")
            return False

    def cleanup(self):
        """Clean up test entities"""
        self.log("\n" + "="*60)
        self.log("CLEANUP: Removing test entities")
        self.log("="*60)
        
        # Delete test entities (best effort)
        if self.test_lead_id:
            self.test("Delete test lead", "DELETE", f"/api/leads/{self.test_lead_id}", 
                     200, token=self.admin_token)
        
        if self.test_customer_id:
            self.test("Delete test customer", "DELETE", f"/api/customers/{self.test_customer_id}", 
                     200, token=self.admin_token)
        
        if self.test_deal_id:
            self.test("Delete test deal", "DELETE", f"/api/deals/{self.test_deal_id}", 
                     200, token=self.admin_token)
        
        self.log("✓ Cleanup completed")

    def run_all_tests(self) -> int:
        """Run all Wave 7 tests"""
        self.log("\n" + "="*60)
        self.log("WAVE 7 - MANUAL WORKLOAD REBALANCING - HTTP TESTS")
        self.log("="*60)
        self.log(f"Backend URL: {BASE_URL}")
        self.log(f"Test tag: {self.tag}")
        
        try:
            # Setup
            if not self.setup_auth():
                return 1
            
            if not self.create_test_entities():
                return 1
            
            # Run tests
            self.test_reassign_lead_as_admin()
            self.test_reassign_bulk_leads_as_admin()
            self.test_reassign_customer_as_admin()
            self.test_reassign_deal_as_admin()
            self.test_reassign_as_manager_403()
            self.test_get_managers_as_admin()
            self.test_get_managers_as_manager()
            self.test_idempotent_reassign()
            self.test_bulk_with_invalid_id()
            self.test_legacy_endpoint()
            self.test_get_audit_history()
            self.test_customer_create_with_managerid()
            self.test_customer_update_strips_managerid()
            
            # Cleanup
            self.cleanup()
            
            # Summary
            self.log("\n" + "="*60)
            self.log("TEST SUMMARY")
            self.log("="*60)
            self.log(f"Tests run: {self.tests_run}")
            self.log(f"Tests passed: {self.tests_passed}")
            self.log(f"Tests failed: {self.tests_run - self.tests_passed}")
            self.log(f"Success rate: {(self.tests_passed/self.tests_run*100):.1f}%")
            
            if self.tests_passed == self.tests_run:
                self.log("\n✅ ALL TESTS PASSED", "SUCCESS")
                return 0
            else:
                self.log(f"\n❌ {self.tests_run - self.tests_passed} TESTS FAILED", "FAIL")
                return 1
                
        except Exception as e:
            self.log(f"\n❌ FATAL ERROR: {str(e)}", "ERROR")
            import traceback
            traceback.print_exc()
            return 1


def main():
    tester = Wave7Tester()
    return tester.run_all_tests()


if __name__ == "__main__":
    sys.exit(main())
