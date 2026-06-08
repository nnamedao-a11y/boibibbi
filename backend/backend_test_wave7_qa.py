"""
Wave 7 QA — Release Freeze Testing
===================================

Comprehensive QA pass for Wave 7 (manual workload rebalancing) before release.
Tests all backend APIs including the new staff.teamId feature.

Run: cd /app/backend && python backend_test_wave7_qa.py
"""
import sys
import requests
import time
from typing import Dict, Any, Optional, List

BASE_URL = "https://full-stack-deploy-93.preview.emergentagent.com"

# Test credentials
ADMIN_EMAIL = "admin@bibi.cars"
ADMIN_PASSWORD = "Jp3FS_7ZuE2bhHp7rFkJm9B9T_TeiHxu"

MANAGER_EMAIL = "manager@bibi.cars"
MANAGER_PASSWORD = "dFbYnse0L59DBE16Mn4kT6cCRaNBZFQR"

TEAMLEAD_EMAIL = "teamlead@bibi.cars"
TEAMLEAD_PASSWORD = "txXNMkj-lS2w1nv482aLlvKWuk9Y9eKE"


class Wave7QATester:
    def __init__(self):
        self.tests_run = 0
        self.tests_passed = 0
        self.admin_token: Optional[str] = None
        self.manager_token: Optional[str] = None
        self.teamlead_token: Optional[str] = None
        self.admin_id: Optional[str] = None
        self.manager_id: Optional[str] = None
        self.teamlead_id: Optional[str] = None
        
        # Test data
        self.test_staff_id: Optional[str] = None
        self.test_lead_id: Optional[str] = None
        
        self.tag = f"w7qa_{int(time.time())}"

    def log(self, msg: str, level: str = "INFO"):
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
                self.log(f"   Response: {response.text[:300]}", "FAIL")

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
            if "challenge" in response:
                self.log(f"⚠️  Login requires challenge: {response.get('challenge')}", "WARN")
                return None, None
            
            if "access_token" in response:
                staff_id = response.get("user", {}).get("id")
                self.log(f"✓ Logged in as {email} (id={staff_id})")
                return response["access_token"], staff_id
        return None, None

    def setup_auth(self) -> bool:
        """Login all test users"""
        self.log("\n" + "="*70)
        self.log("SETUP: Authenticating test users")
        self.log("="*70)
        
        self.admin_token, self.admin_id = self.login(ADMIN_EMAIL, ADMIN_PASSWORD)
        self.manager_token, self.manager_id = self.login(MANAGER_EMAIL, MANAGER_PASSWORD)
        self.teamlead_token, self.teamlead_id = self.login(TEAMLEAD_EMAIL, TEAMLEAD_PASSWORD)
        
        if not self.admin_token:
            self.log("❌ Failed to authenticate admin", "ERROR")
            return False
        
        self.log("✓ Authentication successful")
        return True

    # ========================================================================
    # BACKEND-1: Staff teamId API tests
    # ========================================================================
    
    def test_get_staff_teams(self) -> bool:
        """BACKEND-1a: GET /api/staff/teams returns sorted distinct teamIds"""
        self.log("\n" + "="*70)
        self.log("BACKEND-1a: GET /api/staff/teams")
        self.log("="*70)
        
        success, response = self.test(
            "GET /api/staff/teams",
            "GET",
            "/api/staff/teams",
            200,
            token=self.admin_token
        )
        
        if success:
            # Check response structure
            if "success" in response and "data" in response:
                teams = response["data"]
                if isinstance(teams, list):
                    self.log(f"✓ Got {len(teams)} teams: {teams}")
                    # Check if sorted
                    if teams == sorted(teams):
                        self.log("✓ Teams are sorted")
                        return True
                    else:
                        self.log("❌ Teams are not sorted", "FAIL")
                        return False
                else:
                    self.log(f"❌ Expected list, got {type(teams)}", "FAIL")
                    return False
            else:
                self.log(f"❌ Missing success/data in response", "FAIL")
                return False
        return False

    def test_create_staff_with_teamid(self) -> bool:
        """BACKEND-1b: POST /api/staff with teamId='korea' creates staff"""
        self.log("\n" + "="*70)
        self.log("BACKEND-1b: POST /api/staff with teamId")
        self.log("="*70)
        
        success, response = self.test(
            "POST /api/staff with teamId='korea'",
            "POST",
            "/api/staff",
            200,
            token=self.admin_token,
            data={
                "firstName": self.tag,
                "lastName": "TestStaff",
                "email": f"{self.tag}@test.com",
                "password": "TestPass123!",
                "role": "manager",
                "teamId": "korea"
            }
        )
        
        if success:
            staff = response.get("staff") or response.get("user")
            if staff and staff.get("teamId") == "korea":
                self.test_staff_id = staff.get("id")
                self.log(f"✓ Staff created with teamId='korea' (id={self.test_staff_id})")
                return True
            else:
                self.log(f"❌ teamId not set correctly: {staff.get('teamId') if staff else 'N/A'}", "FAIL")
                return False
        return False

    def test_update_staff_teamid(self) -> bool:
        """BACKEND-1c: PUT /api/staff/{id} with teamId='sofia' persists"""
        self.log("\n" + "="*70)
        self.log("BACKEND-1c: PUT /api/staff/{id} with teamId='sofia'")
        self.log("="*70)
        
        if not self.test_staff_id:
            self.log("❌ No test staff ID available", "ERROR")
            return False
        
        success, response = self.test(
            "PUT /api/staff/{id} with teamId='sofia'",
            "PUT",
            f"/api/staff/{self.test_staff_id}",
            200,
            token=self.admin_token,
            data={
                "teamId": "sofia"
            }
        )
        
        if success:
            staff = response.get("staff") or response.get("user")
            if staff and staff.get("teamId") == "sofia":
                self.log("✓ teamId updated to 'sofia'")
                return True
            else:
                self.log(f"❌ teamId not updated: {staff.get('teamId') if staff else 'N/A'}", "FAIL")
                return False
        return False

    def test_update_staff_empty_teamid(self) -> bool:
        """BACKEND-1d: PUT /api/staff/{id} with empty teamId becomes null"""
        self.log("\n" + "="*70)
        self.log("BACKEND-1d: PUT /api/staff/{id} with empty teamId → null")
        self.log("="*70)
        
        if not self.test_staff_id:
            self.log("❌ No test staff ID available", "ERROR")
            return False
        
        success, response = self.test(
            "PUT /api/staff/{id} with teamId=''",
            "PUT",
            f"/api/staff/{self.test_staff_id}",
            200,
            token=self.admin_token,
            data={
                "teamId": ""
            }
        )
        
        if success:
            staff = response.get("staff") or response.get("user")
            if staff:
                team_id = staff.get("teamId")
                if team_id is None or team_id == "":
                    self.log(f"✓ Empty teamId became null/empty: {team_id}")
                    return True
                else:
                    self.log(f"❌ teamId should be null, got: {team_id}", "FAIL")
                    return False
            else:
                self.log("❌ No staff in response", "FAIL")
                return False
        return False

    # ========================================================================
    # FLOW-1: Create lead
    # ========================================================================
    
    def test_create_lead(self) -> bool:
        """FLOW-1: Create lead with firstName=W7QA"""
        self.log("\n" + "="*70)
        self.log("FLOW-1: Create lead")
        self.log("="*70)
        
        success, response = self.test(
            "POST /api/leads - create W7QA lead",
            "POST",
            "/api/leads",
            200,
            token=self.admin_token,
            data={
                "firstName": "W7QA",
                "lastName": "Lead-1",
                "email": f"w7qa+1@example.com",
                "status": "new"
            }
        )
        
        if success:
            lead = response.get("lead")
            if lead:
                self.test_lead_id = lead.get("id")
                self.log(f"✓ Lead created: {self.test_lead_id}")
                self.log(f"   managerId: {lead.get('managerId') or 'unassigned'}")
                return True
            else:
                self.log("❌ No lead in response", "FAIL")
                return False
        return False

    # ========================================================================
    # FLOW-2: Assign manager via reassign
    # ========================================================================
    
    def test_assign_manager(self) -> bool:
        """FLOW-2: Assign manager to lead via reassign"""
        self.log("\n" + "="*70)
        self.log("FLOW-2: Assign manager to lead")
        self.log("="*70)
        
        if not self.test_lead_id:
            self.log("❌ No test lead ID", "ERROR")
            return False
        
        success, response = self.test(
            "POST /api/admin/reassign - assign manager",
            "POST",
            "/api/admin/reassign",
            200,
            token=self.admin_token,
            data={
                "entity": "lead",
                "ids": [self.test_lead_id],
                "toManagerId": self.manager_id,
                "reason": "QA assign"
            }
        )
        
        if success:
            if response.get("processed") == 1:
                self.log("✓ Manager assigned successfully")
                return True
            else:
                self.log(f"❌ Expected processed=1, got {response.get('processed')}", "FAIL")
                return False
        return False

    # ========================================================================
    # FLOW-3: Reassign existing lead
    # ========================================================================
    
    def test_reassign_lead(self) -> bool:
        """FLOW-3: Reassign lead to admin"""
        self.log("\n" + "="*70)
        self.log("FLOW-3: Reassign lead to admin")
        self.log("="*70)
        
        if not self.test_lead_id:
            self.log("❌ No test lead ID", "ERROR")
            return False
        
        success, response = self.test(
            "POST /api/admin/reassign - reassign to admin",
            "POST",
            "/api/admin/reassign",
            200,
            token=self.admin_token,
            data={
                "entity": "lead",
                "ids": [self.test_lead_id],
                "toManagerId": self.admin_id,
                "reason": "QA reassign"
            }
        )
        
        if success:
            if response.get("processed") == 1:
                self.log("✓ Lead reassigned to admin")
                return True
            else:
                self.log(f"❌ Expected processed=1, got {response.get('processed')}", "FAIL")
                return False
        return False

    # ========================================================================
    # Manager 403 test
    # ========================================================================
    
    def test_manager_403(self) -> bool:
        """FLOW-8: Manager cannot reassign (403)"""
        self.log("\n" + "="*70)
        self.log("FLOW-8: Manager 403 test")
        self.log("="*70)
        
        if not self.manager_token:
            self.log("⚠️  Manager token not available, skipping", "WARN")
            return True
        
        success, response = self.test(
            "POST /api/admin/reassign - as manager (403)",
            "POST",
            "/api/admin/reassign",
            403,
            token=self.manager_token,
            data={
                "entity": "lead",
                "ids": [self.test_lead_id] if self.test_lead_id else ["dummy"],
                "toManagerId": self.admin_id,
                "reason": "Should fail"
            }
        )
        
        if success:
            self.log("✓ Manager correctly blocked with 403")
            return True
        return False

    # ========================================================================
    # Cleanup
    # ========================================================================
    
    def cleanup(self):
        """Clean up test data"""
        self.log("\n" + "="*70)
        self.log("CLEANUP: Removing test data")
        self.log("="*70)
        
        # Delete test lead
        if self.test_lead_id:
            self.test("Delete test lead", "DELETE", f"/api/leads/{self.test_lead_id}", 
                     200, token=self.admin_token)
        
        # Delete test staff
        if self.test_staff_id:
            self.test("Delete test staff", "DELETE", f"/api/staff/{self.test_staff_id}", 
                     200, token=self.admin_token)
        
        self.log("✓ Cleanup completed")

    def run_all_tests(self) -> int:
        """Run all Wave 7 QA tests"""
        self.log("\n" + "="*70)
        self.log("WAVE 7 QA — RELEASE FREEZE TESTING")
        self.log("="*70)
        self.log(f"Backend URL: {BASE_URL}")
        self.log(f"Test tag: {self.tag}")
        
        try:
            # Setup
            if not self.setup_auth():
                return 1
            
            # Run backend tests
            self.test_get_staff_teams()
            self.test_create_staff_with_teamid()
            self.test_update_staff_teamid()
            self.test_update_staff_empty_teamid()
            
            # Run flow tests
            self.test_create_lead()
            self.test_assign_manager()
            self.test_reassign_lead()
            self.test_manager_403()
            
            # Cleanup
            self.cleanup()
            
            # Summary
            self.log("\n" + "="*70)
            self.log("TEST SUMMARY")
            self.log("="*70)
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
    tester = Wave7QATester()
    return tester.run_all_tests()


if __name__ == "__main__":
    sys.exit(main())
