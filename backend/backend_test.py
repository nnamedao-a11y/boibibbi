#!/usr/bin/env python3
"""
Phase IV-6 Role-Aware UX Testing
=================================

Tests the new Ringostat role-based UI preferences and supervision endpoints:
  - GET /api/me/preferences/ringostat-ui (role-based defaults)
  - PATCH /api/me/preferences/ringostat-ui (user overrides + manager hard guards)
  - GET /api/teamlead/calls/overview (team/company aggregation)
  - GET /api/teamlead/calls/managers (per-manager breakdown)
  - GET /api/admin/ringostat/oversight (admin oversight dashboard)
  - Regression: existing endpoints still work

Credentials:
  - Admin: admin@bibi.cars / Jp3FS_7ZuE2bhHp7rFkJm9B9T_TeiHxu
  - Team Lead: teamlead@bibi.cars / Jp3FS_7ZuE2bhHp7rFkJm9B9T_TeiHxu
  - Manager: manager@bibi.cars / Jp3FS_7ZuE2bhHp7rFkJm9B9T_TeiHxu
"""

import sys
import requests
from typing import Dict, Optional, Any
import json

BASE_URL = "https://bibi-deploy.preview.emergentagent.com"

class Colors:
    GREEN = '\033[92m'
    RED = '\033[91m'
    YELLOW = '\033[93m'
    BLUE = '\033[94m'
    RESET = '\033[0m'

class PhaseIV6Tester:
    def __init__(self):
        self.tests_run = 0
        self.tests_passed = 0
        self.tests_failed = 0
        self.admin_token = None
        self.team_lead_token = None
        self.manager_token = None
        self.admin_role = None
        self.team_lead_role = None
        self.manager_role = None
        
    def log(self, msg: str, color: str = Colors.RESET):
        print(f"{color}{msg}{Colors.RESET}")
    
    def test(self, name: str, method: str, endpoint: str, expected_status: int, 
             token: Optional[str] = None, data: Optional[Dict] = None, 
             validate_fn: Optional[callable] = None) -> tuple[bool, Any]:
        """Run a single test"""
        self.tests_run += 1
        url = f"{BASE_URL}{endpoint}"
        headers = {'Content-Type': 'application/json'}
        if token:
            headers['Authorization'] = f'Bearer {token}'
        
        self.log(f"\n[{self.tests_run}] Testing: {name}", Colors.BLUE)
        self.log(f"    {method} {endpoint}")
        
        try:
            if method == 'GET':
                response = requests.get(url, headers=headers, timeout=30)
            elif method == 'POST':
                response = requests.post(url, json=data, headers=headers, timeout=30)
            elif method == 'PATCH':
                response = requests.patch(url, json=data, headers=headers, timeout=30)
            else:
                raise ValueError(f"Unsupported method: {method}")
            
            # Check status code
            if response.status_code != expected_status:
                self.tests_failed += 1
                self.log(f"    ✗ FAILED - Expected {expected_status}, got {response.status_code}", Colors.RED)
                self.log(f"    Response: {response.text[:200]}", Colors.RED)
                return False, None
            
            # Parse response
            try:
                response_data = response.json()
            except:
                response_data = response.text
            
            # Run custom validation if provided
            if validate_fn:
                try:
                    validation_result = validate_fn(response_data)
                    if not validation_result:
                        self.tests_failed += 1
                        self.log(f"    ✗ FAILED - Validation failed", Colors.RED)
                        self.log(f"    Response: {json.dumps(response_data, indent=2)[:500]}", Colors.YELLOW)
                        return False, response_data
                except Exception as e:
                    self.tests_failed += 1
                    self.log(f"    ✗ FAILED - Validation error: {e}", Colors.RED)
                    return False, response_data
            
            self.tests_passed += 1
            self.log(f"    ✓ PASSED - Status {response.status_code}", Colors.GREEN)
            return True, response_data
            
        except requests.exceptions.Timeout:
            self.tests_failed += 1
            self.log(f"    ✗ FAILED - Request timeout", Colors.RED)
            return False, None
        except Exception as e:
            self.tests_failed += 1
            self.log(f"    ✗ FAILED - Error: {str(e)}", Colors.RED)
            return False, None
    
    def login(self, email: str, password: str) -> tuple[Optional[str], Optional[str]]:
        """Login and return (token, role)"""
        self.log(f"\n{'='*60}", Colors.BLUE)
        self.log(f"Logging in as: {email}", Colors.BLUE)
        self.log(f"{'='*60}", Colors.BLUE)
        
        success, data = self.test(
            f"Login as {email}",
            "POST",
            "/api/auth/login",
            200,
            data={"email": email, "password": password}
        )
        
        if success and data:
            # Try both 'token' and 'access_token' keys
            token = data.get('token') or data.get('access_token')
            role = data.get('user', {}).get('role') or data.get('role')
            if token:
                self.log(f"    Token: {token[:20]}...", Colors.GREEN)
                self.log(f"    Role: {role}", Colors.GREEN)
                return token, role
            else:
                self.log(f"    Login response missing token: {json.dumps(data, indent=2)[:300]}", Colors.RED)
        
        self.log(f"    Login failed for {email}", Colors.RED)
        return None, None
    
    def test_preferences_get(self, role_name: str, token: str, expected_role: str, 
                            expected_effective: Dict[str, bool]):
        """Test GET /api/me/preferences/ringostat-ui"""
        def validate(data):
            if data.get('role') != expected_role:
                self.log(f"      Expected role={expected_role}, got {data.get('role')}", Colors.RED)
                return False
            
            effective = data.get('effective', {})
            for key, expected_val in expected_effective.items():
                actual_val = effective.get(key)
                if actual_val != expected_val:
                    self.log(f"      Expected effective.{key}={expected_val}, got {actual_val}", Colors.RED)
                    return False
            
            # Check role_defaults is populated
            if not data.get('role_defaults'):
                self.log(f"      Missing role_defaults", Colors.RED)
                return False
            
            # Check saved is present (can be empty dict)
            if 'saved' not in data:
                self.log(f"      Missing saved field", Colors.RED)
                return False
            
            self.log(f"      ✓ Role: {data.get('role')}", Colors.GREEN)
            self.log(f"      ✓ Effective: {json.dumps(effective, indent=8)[:200]}", Colors.GREEN)
            return True
        
        return self.test(
            f"GET preferences as {role_name}",
            "GET",
            "/api/me/preferences/ringostat-ui",
            200,
            token=token,
            validate_fn=validate
        )
    
    def test_preferences_patch(self, role_name: str, token: str, payload: Dict, 
                              should_persist: Dict[str, bool], should_drop: list = None):
        """Test PATCH /api/me/preferences/ringostat-ui"""
        def validate(data):
            if not data.get('success'):
                self.log(f"      Expected success=true", Colors.RED)
                return False
            
            saved = data.get('saved', {})
            effective = data.get('effective', {})
            
            # Check keys that should persist
            for key, expected_val in should_persist.items():
                if saved.get(key) != expected_val:
                    self.log(f"      Expected saved.{key}={expected_val}, got {saved.get(key)}", Colors.RED)
                    return False
                if effective.get(key) != expected_val:
                    self.log(f"      Expected effective.{key}={expected_val}, got {effective.get(key)}", Colors.RED)
                    return False
            
            # Check keys that should be dropped (hard guard)
            if should_drop:
                for key in should_drop:
                    if key in saved:
                        self.log(f"      Expected {key} to be dropped from saved, but found it", Colors.RED)
                        return False
            
            self.log(f"      ✓ Saved: {json.dumps(saved, indent=8)[:200]}", Colors.GREEN)
            self.log(f"      ✓ Effective: {json.dumps(effective, indent=8)[:200]}", Colors.GREEN)
            return True
        
        return self.test(
            f"PATCH preferences as {role_name} with {payload}",
            "PATCH",
            "/api/me/preferences/ringostat-ui",
            200,
            token=token,
            data=payload,
            validate_fn=validate
        )
    
    def test_teamlead_overview(self, role_name: str, token: str, days: int, 
                               expected_scope: str, min_totals: int = 0):
        """Test GET /api/teamlead/calls/overview"""
        def validate(data):
            if data.get('scope') != expected_scope:
                self.log(f"      Expected scope={expected_scope}, got {data.get('scope')}", Colors.RED)
                return False
            
            totals = data.get('totals', {})
            if totals.get('all', 0) < min_totals:
                self.log(f"      Expected totals.all >= {min_totals}, got {totals.get('all')}", Colors.RED)
                return False
            
            # Check required fields
            required = ['all', 'answered', 'missed', 'answer_rate', 'pending_outcome', 'unassigned']
            for field in required:
                if field not in totals:
                    self.log(f"      Missing totals.{field}", Colors.RED)
                    return False
            
            # Check alerts dict
            if 'alerts' not in data:
                self.log(f"      Missing alerts", Colors.RED)
                return False
            
            # Check today field when days=1
            if days == 1 and 'today' not in totals:
                self.log(f"      Missing totals.today for days=1", Colors.RED)
                return False
            
            self.log(f"      ✓ Scope: {data.get('scope')}", Colors.GREEN)
            self.log(f"      ✓ Totals.all: {totals.get('all')}", Colors.GREEN)
            self.log(f"      ✓ Answer rate: {totals.get('answer_rate')}%", Colors.GREEN)
            return True
        
        return self.test(
            f"GET teamlead/calls/overview as {role_name} (days={days})",
            "GET",
            f"/api/teamlead/calls/overview?days={days}",
            200,
            token=token,
            validate_fn=validate
        )
    
    def test_teamlead_managers(self, role_name: str, token: str, days: int):
        """Test GET /api/teamlead/calls/managers"""
        def validate(data):
            if 'rows' not in data:
                self.log(f"      Missing rows", Colors.RED)
                return False
            
            rows = data.get('rows', [])
            if len(rows) > 0:
                # Check first row has required fields
                row = rows[0]
                required = ['manager_id', 'manager_name', 'total', 'answered', 'missed', 
                           'pending_outcome', 'answer_rate', 'avg_duration_sec', 'last_call_at']
                for field in required:
                    if field not in row:
                        self.log(f"      Missing row.{field}", Colors.RED)
                        return False
            
            self.log(f"      ✓ Rows: {len(rows)}", Colors.GREEN)
            if len(rows) > 0:
                self.log(f"      ✓ First row: {rows[0].get('manager_name')} - {rows[0].get('total')} calls", Colors.GREEN)
            return True
        
        return self.test(
            f"GET teamlead/calls/managers as {role_name} (days={days})",
            "GET",
            f"/api/teamlead/calls/managers?days={days}",
            200,
            token=token,
            validate_fn=validate
        )
    
    def test_admin_oversight(self, token: str, days: int):
        """Test GET /api/admin/ringostat/oversight"""
        def validate(data):
            # Check company_totals
            if 'company_totals' not in data:
                self.log(f"      Missing company_totals", Colors.RED)
                return False
            
            totals = data.get('company_totals', {})
            required = ['all', 'answered', 'missed', 'answer_rate', 'pending_outcome', 'unassigned']
            for field in required:
                if field not in totals:
                    self.log(f"      Missing company_totals.{field}", Colors.RED)
                    return False
            
            # Check top_volume (max 5)
            if 'top_volume' not in data:
                self.log(f"      Missing top_volume", Colors.RED)
                return False
            
            # Check top_pending_outcome (max 5)
            if 'top_pending_outcome' not in data:
                self.log(f"      Missing top_pending_outcome", Colors.RED)
                return False
            
            # Check team_leads array
            if 'team_leads' not in data:
                self.log(f"      Missing team_leads", Colors.RED)
                return False
            
            # Check sync_health
            if 'sync_health' not in data:
                self.log(f"      Missing sync_health", Colors.RED)
                return False
            
            sync = data.get('sync_health', {})
            if 'last_sync_at' not in sync or 'stale_minutes' not in sync:
                self.log(f"      Missing sync_health fields", Colors.RED)
                return False
            
            self.log(f"      ✓ Company totals.all: {totals.get('all')}", Colors.GREEN)
            self.log(f"      ✓ Top volume: {len(data.get('top_volume', []))} managers", Colors.GREEN)
            self.log(f"      ✓ Team leads: {len(data.get('team_leads', []))}", Colors.GREEN)
            self.log(f"      ✓ Sync health: stale_minutes={sync.get('stale_minutes')}", Colors.GREEN)
            return True
        
        return self.test(
            f"GET admin/ringostat/oversight (days={days})",
            "GET",
            f"/api/admin/ringostat/oversight?days={days}",
            200,
            token=token,
            validate_fn=validate
        )
    
    def test_regression_endpoints(self, token: str):
        """Test existing endpoints still work"""
        endpoints = [
            ("GET", "/api/admin/ringostat/health", 200),
            ("GET", "/api/admin/ringostat/settings", 200),
            ("GET", "/api/admin/ringostat/webhook-info", 200),
            ("GET", "/api/admin/ringostat/calls?period=today", 200),
            ("GET", "/api/admin/ringostat/stats/overview?days=7", 200),
            ("GET", "/api/system/health", 200),
        ]
        
        for method, endpoint, expected_status in endpoints:
            self.test(
                f"Regression: {endpoint}",
                method,
                endpoint,
                expected_status,
                token=token
            )
    
    def run_all_tests(self):
        """Run all Phase IV-6 tests"""
        self.log("\n" + "="*80, Colors.BLUE)
        self.log("Phase IV-6 Role-Aware UX Testing", Colors.BLUE)
        self.log("="*80 + "\n", Colors.BLUE)
        
        # ===== LOGIN =====
        self.admin_token, self.admin_role = self.login("admin@bibi.cars", "Jp3FS_7ZuE2bhHp7rFkJm9B9T_TeiHxu")
        if not self.admin_token:
            self.log("\n❌ CRITICAL: Admin login failed - cannot continue", Colors.RED)
            return False
        
        # Try team_lead login (may fail if account doesn't exist)
        self.team_lead_token, self.team_lead_role = self.login("teamlead@bibi.cars", "txXNMkj-lS2w1nv482aLlvKWuk9Y9eKE")
        
        # Try manager login (may fail if account doesn't exist)
        self.manager_token, self.manager_role = self.login("manager@bibi.cars", "dFbYnse0L59DBE16Mn4kT6cCRaNBZFQR")
        
        # ===== TEST 1: GET preferences as admin =====
        self.log("\n" + "="*80, Colors.BLUE)
        self.log("TEST SUITE 1: GET /api/me/preferences/ringostat-ui", Colors.BLUE)
        self.log("="*80, Colors.BLUE)
        
        self.test_preferences_get(
            "admin",
            self.admin_token,
            self.admin_role or "master_admin",
            {
                "show_incoming_popup": False,
                "show_outcome_banner": False,
                "show_aggregate_summary": True
            }
        )
        
        # Test team_lead if available
        if self.team_lead_token:
            self.test_preferences_get(
                "team_lead",
                self.team_lead_token,
                "team_lead",
                {
                    "show_incoming_popup": False,
                    "show_aggregate_summary": True
                }
            )
        
        # Test manager if available
        if self.manager_token:
            self.test_preferences_get(
                "manager",
                self.manager_token,
                "manager",
                {
                    "force_outcome_blocking": True,
                    "show_outcome_banner": True
                }
            )
        
        # ===== TEST 2: PATCH preferences =====
        self.log("\n" + "="*80, Colors.BLUE)
        self.log("TEST SUITE 2: PATCH /api/me/preferences/ringostat-ui", Colors.BLUE)
        self.log("="*80, Colors.BLUE)
        
        # Admin can override
        self.test_preferences_patch(
            "admin",
            self.admin_token,
            {"show_incoming_popup": True},
            {"show_incoming_popup": True}
        )
        
        # Verify persistence
        self.test_preferences_get(
            "admin (after override)",
            self.admin_token,
            self.admin_role or "master_admin",
            {"show_incoming_popup": True}
        )
        
        # Manager CANNOT override force_outcome_blocking (hard guard)
        if self.manager_token:
            self.test_preferences_patch(
                "manager",
                self.manager_token,
                {"force_outcome_blocking": False},
                {},  # Should be empty - key dropped
                should_drop=["force_outcome_blocking"]
            )
            
            # Verify force_outcome_blocking still true
            success, data = self.test_preferences_get(
                "manager (after attempted override)",
                self.manager_token,
                "manager",
                {"force_outcome_blocking": True}
            )
            
            # Manager CANNOT override show_outcome_banner (hard guard)
            self.test_preferences_patch(
                "manager",
                self.manager_token,
                {"show_outcome_banner": False},
                {},  # Should be empty - key dropped
                should_drop=["show_outcome_banner"]
            )
        
        # Invalid keys should return 400
        self.test(
            "PATCH with invalid keys",
            "PATCH",
            "/api/me/preferences/ringostat-ui",
            400,
            token=self.admin_token,
            data={"foo": "bar"}
        )
        
        # ===== TEST 3: Team lead overview =====
        self.log("\n" + "="*80, Colors.BLUE)
        self.log("TEST SUITE 3: GET /api/teamlead/calls/overview", Colors.BLUE)
        self.log("="*80, Colors.BLUE)
        
        # Admin sees company scope
        self.test_teamlead_overview("admin", self.admin_token, 7, "company", min_totals=0)
        
        # Test days=1 (should have today field)
        self.test_teamlead_overview("admin", self.admin_token, 1, "company", min_totals=0)
        
        # Team lead sees team scope
        if self.team_lead_token:
            self.test_teamlead_overview("team_lead", self.team_lead_token, 7, "team", min_totals=0)
        
        # Manager sees self scope
        if self.manager_token:
            self.test_teamlead_overview("manager", self.manager_token, 7, "self", min_totals=0)
        
        # ===== TEST 4: Team lead managers breakdown =====
        self.log("\n" + "="*80, Colors.BLUE)
        self.log("TEST SUITE 4: GET /api/teamlead/calls/managers", Colors.BLUE)
        self.log("="*80, Colors.BLUE)
        
        self.test_teamlead_managers("admin", self.admin_token, 7)
        
        if self.team_lead_token:
            self.test_teamlead_managers("team_lead", self.team_lead_token, 7)
        
        # ===== TEST 5: Admin oversight =====
        self.log("\n" + "="*80, Colors.BLUE)
        self.log("TEST SUITE 5: GET /api/admin/ringostat/oversight", Colors.BLUE)
        self.log("="*80, Colors.BLUE)
        
        self.test_admin_oversight(self.admin_token, 7)
        
        # Manager should get 403
        if self.manager_token:
            self.test(
                "GET admin/ringostat/oversight as manager (should 403)",
                "GET",
                "/api/admin/ringostat/oversight?days=7",
                403,
                token=self.manager_token
            )
        
        # ===== TEST 6: Regression =====
        self.log("\n" + "="*80, Colors.BLUE)
        self.log("TEST SUITE 6: Regression - Existing Endpoints", Colors.BLUE)
        self.log("="*80, Colors.BLUE)
        
        self.test_regression_endpoints(self.admin_token)
        
        # ===== SUMMARY =====
        self.log("\n" + "="*80, Colors.BLUE)
        self.log("TEST SUMMARY", Colors.BLUE)
        self.log("="*80, Colors.BLUE)
        self.log(f"Total tests: {self.tests_run}", Colors.BLUE)
        self.log(f"Passed: {self.tests_passed}", Colors.GREEN)
        self.log(f"Failed: {self.tests_failed}", Colors.RED)
        
        success_rate = (self.tests_passed / self.tests_run * 100) if self.tests_run > 0 else 0
        self.log(f"Success rate: {success_rate:.1f}%", Colors.GREEN if success_rate >= 90 else Colors.YELLOW)
        
        return self.tests_failed == 0

def main():
    tester = PhaseIV6Tester()
    success = tester.run_all_tests()
    return 0 if success else 1

if __name__ == "__main__":
    sys.exit(main())
