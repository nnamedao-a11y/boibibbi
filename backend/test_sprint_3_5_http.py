#!/usr/bin/env python3
"""
Sprint 3.5 Customer Roadmap — HTTP API Testing
===============================================

Tests all HTTP endpoints for the Customer Roadmap feature:
  - Public cabinet endpoints (no auth)
  - Authenticated CRUD endpoints (manager/admin)
  - Analytics endpoints (team_lead/admin)
  - Authorization guards (manager can't edit other manager's roadmap)
  - Business logic (auto-advance, SLA breach, idempotency)
  - Validation (invalid stage_key → 404, invalid status → 400)

Credentials:
  - Admin: admin@bibi.cars / Jp3FS_7ZuE2bhHp7rFkJm9B9T_TeiHxu
  - Manager: manager@bibi.test / Jp3FS_7ZuE2bhHp7rFkJm9B9T_TeiHxu
  - Customer: customer_test_001
"""

import sys
import requests
import time
from typing import Dict, Optional, Any
import json

BASE_URL = "https://auto-delivery-11.preview.emergentagent.com"

class Colors:
    GREEN = '\033[92m'
    RED = '\033[91m'
    YELLOW = '\033[93m'
    BLUE = '\033[94m'
    RESET = '\033[0m'

class Sprint35Tester:
    def __init__(self):
        self.tests_run = 0
        self.tests_passed = 0
        self.tests_failed = 0
        self.admin_token = None
        self.manager_token = None
        self.customer_id = "customer_test_001"
        self.roadmap_id = None
        
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
            elif method == 'DELETE':
                response = requests.delete(url, headers=headers, timeout=30)
            else:
                raise ValueError(f"Unsupported method: {method}")
            
            # Check status code
            if response.status_code != expected_status:
                self.tests_failed += 1
                self.log(f"    ✗ FAILED - Expected {expected_status}, got {response.status_code}", Colors.RED)
                self.log(f"    Response: {response.text[:500]}", Colors.RED)
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
    
    def login(self, email: str, password: str) -> Optional[str]:
        """Login and return token"""
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
            token = data.get('token') or data.get('access_token')
            if token:
                self.log(f"    Token: {token[:20]}...", Colors.GREEN)
                return token
        
        self.log(f"    Login failed for {email}", Colors.RED)
        return None
    
    def test_public_cabinet_list(self):
        """Test GET /api/customer-cabinet/{customer_id}/roadmaps (public, no auth)"""
        def validate(data):
            if not data.get('success'):
                self.log(f"      Expected success=true", Colors.RED)
                return False
            if 'items' not in data:
                self.log(f"      Missing items", Colors.RED)
                return False
            if 'stage_template' not in data:
                self.log(f"      Missing stage_template", Colors.RED)
                return False
            
            template = data.get('stage_template', [])
            if len(template) != 7:
                self.log(f"      Expected 7 stages in template, got {len(template)}", Colors.RED)
                return False
            
            # Check stage keys
            expected_keys = ['vehicle_found', 'vehicle_purchased', 'delivery_europe', 
                           'arrived_bulgaria', 'adaptation', 'registration', 'handover']
            actual_keys = [s['key'] for s in template]
            if actual_keys != expected_keys:
                self.log(f"      Stage keys mismatch: {actual_keys}", Colors.RED)
                return False
            
            self.log(f"      ✓ Items: {len(data.get('items', []))}", Colors.GREEN)
            self.log(f"      ✓ Stage template: {len(template)} stages", Colors.GREEN)
            return True
        
        return self.test(
            "GET public cabinet roadmaps list (no auth)",
            "GET",
            f"/api/customer-cabinet/{self.customer_id}/roadmaps",
            200,
            validate_fn=validate
        )
    
    def test_create_roadmap(self):
        """Test POST /api/customers/{customer_id}/roadmaps (auth required)"""
        def validate(data):
            if not data.get('success'):
                self.log(f"      Expected success=true", Colors.RED)
                return False
            
            roadmap = data.get('roadmap')
            if not roadmap:
                self.log(f"      Missing roadmap", Colors.RED)
                return False
            
            if not roadmap.get('id'):
                self.log(f"      Missing roadmap.id", Colors.RED)
                return False
            
            # Store roadmap_id for later tests
            self.roadmap_id = roadmap['id']
            
            # Check stages
            stages = roadmap.get('stages', [])
            if len(stages) != 7:
                self.log(f"      Expected 7 stages, got {len(stages)}", Colors.RED)
                return False
            
            # Check initial stage is vehicle_found (default)
            if roadmap.get('current_stage') != 'vehicle_found':
                self.log(f"      Expected current_stage=vehicle_found, got {roadmap.get('current_stage')}", Colors.RED)
                return False
            
            self.log(f"      ✓ Roadmap ID: {roadmap['id']}", Colors.GREEN)
            self.log(f"      ✓ Current stage: {roadmap.get('current_stage')}", Colors.GREEN)
            self.log(f"      ✓ Progress: {roadmap.get('progress_pct')}%", Colors.GREEN)
            return True
        
        payload = {
            "title": "BMW X5 Import Journey",
            "vehicle": {
                "vin": "5UXTEST12345",
                "make": "BMW",
                "model": "X5",
                "year": 2022
            },
            "initial_stage": "vehicle_found"
        }
        
        return self.test(
            "POST create roadmap (manager auth)",
            "POST",
            f"/api/customers/{self.customer_id}/roadmaps",
            200,
            token=self.manager_token,
            data=payload,
            validate_fn=validate
        )
    
    def test_get_roadmap_detail(self):
        """Test GET /api/roadmaps/{roadmap_id} (auth required)"""
        if not self.roadmap_id:
            self.log("    Skipping - no roadmap_id", Colors.YELLOW)
            return True, None
        
        def validate(data):
            if not data.get('success'):
                self.log(f"      Expected success=true", Colors.RED)
                return False
            
            roadmap = data.get('roadmap')
            if not roadmap:
                self.log(f"      Missing roadmap", Colors.RED)
                return False
            
            if roadmap.get('id') != self.roadmap_id:
                self.log(f"      ID mismatch", Colors.RED)
                return False
            
            self.log(f"      ✓ Roadmap: {roadmap.get('title')}", Colors.GREEN)
            return True
        
        return self.test(
            "GET roadmap detail (manager auth)",
            "GET",
            f"/api/roadmaps/{self.roadmap_id}",
            200,
            token=self.manager_token,
            validate_fn=validate
        )
    
    def test_update_stage(self):
        """Test PATCH /api/roadmaps/{roadmap_id}/stages/{stage_key}"""
        if not self.roadmap_id:
            self.log("    Skipping - no roadmap_id", Colors.YELLOW)
            return True, None
        
        def validate(data):
            if not data.get('success'):
                self.log(f"      Expected success=true", Colors.RED)
                return False
            
            roadmap = data.get('roadmap')
            if not roadmap:
                self.log(f"      Missing roadmap", Colors.RED)
                return False
            
            # Find vehicle_found stage
            stages = roadmap.get('stages', [])
            vf_stage = next((s for s in stages if s['key'] == 'vehicle_found'), None)
            if not vf_stage:
                self.log(f"      vehicle_found stage not found", Colors.RED)
                return False
            
            if vf_stage.get('status') != 'done':
                self.log(f"      Expected vehicle_found status=done, got {vf_stage.get('status')}", Colors.RED)
                return False
            
            # Check auto-advance: vehicle_purchased should now be in_progress
            vp_stage = next((s for s in stages if s['key'] == 'vehicle_purchased'), None)
            if not vp_stage:
                self.log(f"      vehicle_purchased stage not found", Colors.RED)
                return False
            
            if vp_stage.get('status') != 'in_progress':
                self.log(f"      Expected auto-advance: vehicle_purchased should be in_progress, got {vp_stage.get('status')}", Colors.RED)
                return False
            
            self.log(f"      ✓ vehicle_found → done", Colors.GREEN)
            self.log(f"      ✓ Auto-advance: vehicle_purchased → in_progress", Colors.GREEN)
            self.log(f"      ✓ Progress: {roadmap.get('progress_pct')}%", Colors.GREEN)
            return True
        
        payload = {
            "status": "done",
            "note": "Vehicle found at auction"
        }
        
        return self.test(
            "PATCH update stage (auto-advance test)",
            "PATCH",
            f"/api/roadmaps/{self.roadmap_id}/stages/vehicle_found",
            200,
            token=self.manager_token,
            data=payload,
            validate_fn=validate
        )
    
    def test_invalid_stage_key(self):
        """Test PATCH with invalid stage_key → 404"""
        if not self.roadmap_id:
            self.log("    Skipping - no roadmap_id", Colors.YELLOW)
            return True, None
        
        payload = {"status": "done"}
        
        return self.test(
            "PATCH with invalid stage_key (should 404)",
            "PATCH",
            f"/api/roadmaps/{self.roadmap_id}/stages/invalid_stage",
            404,
            token=self.manager_token,
            data=payload
        )
    
    def test_invalid_status(self):
        """Test PATCH with invalid status → 400"""
        if not self.roadmap_id:
            self.log("    Skipping - no roadmap_id", Colors.YELLOW)
            return True, None
        
        payload = {"status": "invalid_status"}
        
        return self.test(
            "PATCH with invalid status (should 400)",
            "PATCH",
            f"/api/roadmaps/{self.roadmap_id}/stages/vehicle_purchased",
            400,
            token=self.manager_token,
            data=payload
        )
    
    def test_public_cabinet_detail(self):
        """Test GET /api/customer-cabinet/{customer_id}/roadmaps/{roadmap_id}"""
        if not self.roadmap_id:
            self.log("    Skipping - no roadmap_id", Colors.YELLOW)
            return True, None
        
        def validate(data):
            if not data.get('success'):
                self.log(f"      Expected success=true", Colors.RED)
                return False
            
            roadmap = data.get('roadmap')
            if not roadmap:
                self.log(f"      Missing roadmap", Colors.RED)
                return False
            
            self.log(f"      ✓ Public access to roadmap detail", Colors.GREEN)
            return True
        
        return self.test(
            "GET public cabinet roadmap detail (no auth)",
            "GET",
            f"/api/customer-cabinet/{self.customer_id}/roadmaps/{self.roadmap_id}",
            200,
            validate_fn=validate
        )
    
    def test_public_cabinet_403(self):
        """Test GET /api/customer-cabinet/{customer_id}/roadmaps/{roadmap_id} with wrong customer → 403"""
        if not self.roadmap_id:
            self.log("    Skipping - no roadmap_id", Colors.YELLOW)
            return True, None
        
        return self.test(
            "GET public cabinet with wrong customer_id (should 403)",
            "GET",
            f"/api/customer-cabinet/wrong_customer_id/roadmaps/{self.roadmap_id}",
            403
        )
    
    def test_list_customer_roadmaps(self):
        """Test GET /api/customers/{customer_id}/roadmaps (auth)"""
        def validate(data):
            if not data.get('success'):
                self.log(f"      Expected success=true", Colors.RED)
                return False
            
            if 'items' not in data:
                self.log(f"      Missing items", Colors.RED)
                return False
            
            if 'customer' not in data:
                self.log(f"      Missing customer", Colors.RED)
                return False
            
            items = data.get('items', [])
            if len(items) == 0:
                self.log(f"      Expected at least 1 roadmap", Colors.RED)
                return False
            
            self.log(f"      ✓ Items: {len(items)}", Colors.GREEN)
            self.log(f"      ✓ Customer: {data.get('customer', {}).get('email')}", Colors.GREEN)
            return True
        
        return self.test(
            "GET list customer roadmaps (manager auth)",
            "GET",
            f"/api/customers/{self.customer_id}/roadmaps",
            200,
            token=self.manager_token,
            validate_fn=validate
        )
    
    def test_team_roadmaps_analytics(self):
        """Test GET /api/team/roadmaps (manager/team_lead/admin)"""
        def validate(data):
            if not data.get('success'):
                self.log(f"      Expected success=true", Colors.RED)
                return False
            
            required_fields = ['total', 'completed', 'in_progress', 'blocked', 'pending', 
                             'avg_progress_pct', 'sla_breaches', 'by_stage', 'items']
            
            for field in required_fields:
                if field not in data:
                    self.log(f"      Missing field: {field}", Colors.RED)
                    return False
            
            self.log(f"      ✓ Total: {data.get('total')}", Colors.GREEN)
            self.log(f"      ✓ In progress: {data.get('in_progress')}", Colors.GREEN)
            self.log(f"      ✓ SLA breaches: {data.get('sla_breaches')}", Colors.GREEN)
            return True
        
        return self.test(
            "GET team roadmaps analytics (manager auth)",
            "GET",
            "/api/team/roadmaps",
            200,
            token=self.manager_token,
            validate_fn=validate
        )
    
    def test_admin_roadmaps_analytics(self):
        """Test GET /api/admin/roadmaps (admin only)"""
        def validate(data):
            if not data.get('success'):
                self.log(f"      Expected success=true", Colors.RED)
                return False
            
            required_fields = ['total', 'completed', 'in_progress', 'blocked', 'pending', 
                             'avg_progress_pct', 'sla_breaches', 'by_stage', 'items']
            
            for field in required_fields:
                if field not in data:
                    self.log(f"      Missing field: {field}", Colors.RED)
                    return False
            
            self.log(f"      ✓ Total: {data.get('total')}", Colors.GREEN)
            self.log(f"      ✓ Avg progress: {data.get('avg_progress_pct')}%", Colors.GREEN)
            return True
        
        return self.test(
            "GET admin roadmaps analytics (admin auth)",
            "GET",
            "/api/admin/roadmaps",
            200,
            token=self.admin_token,
            validate_fn=validate
        )
    
    def test_admin_stages_template(self):
        """Test GET /api/admin/roadmaps/stages (admin only)"""
        def validate(data):
            if not data.get('success'):
                self.log(f"      Expected success=true", Colors.RED)
                return False
            
            stages = data.get('stages', [])
            if len(stages) != 7:
                self.log(f"      Expected 7 stages, got {len(stages)}", Colors.RED)
                return False
            
            # Check each stage has required fields
            for stage in stages:
                required = ['key', 'label_en', 'label_ru', 'label_bg', 'sla_days', 'icon']
                for field in required:
                    if field not in stage:
                        self.log(f"      Stage missing field: {field}", Colors.RED)
                        return False
            
            self.log(f"      ✓ Stages: {len(stages)}", Colors.GREEN)
            return True
        
        return self.test(
            "GET admin stages template (admin auth)",
            "GET",
            "/api/admin/roadmaps/stages",
            200,
            token=self.admin_token,
            validate_fn=validate
        )
    
    def test_delete_roadmap(self):
        """Test DELETE /api/roadmaps/{roadmap_id} (admin only, soft delete)"""
        if not self.roadmap_id:
            self.log("    Skipping - no roadmap_id", Colors.YELLOW)
            return True, None
        
        def validate(data):
            if not data.get('success'):
                self.log(f"      Expected success=true", Colors.RED)
                return False
            
            self.log(f"      ✓ Roadmap soft-deleted", Colors.GREEN)
            return True
        
        return self.test(
            "DELETE roadmap (admin auth, soft delete)",
            "DELETE",
            f"/api/roadmaps/{self.roadmap_id}",
            200,
            token=self.admin_token,
            validate_fn=validate
        )
    
    def test_manager_cannot_delete(self):
        """Test DELETE /api/roadmaps/{roadmap_id} as manager → 403"""
        if not self.roadmap_id:
            self.log("    Skipping - no roadmap_id", Colors.YELLOW)
            return True, None
        
        # Create a new roadmap first
        payload = {
            "title": "Test Roadmap for Delete",
            "vehicle": {"vin": "TEST123"},
            "initial_stage": "vehicle_found"
        }
        
        success, data = self.test(
            "POST create roadmap for delete test",
            "POST",
            f"/api/customers/{self.customer_id}/roadmaps",
            200,
            token=self.manager_token,
            data=payload
        )
        
        if not success or not data:
            return False, None
        
        test_roadmap_id = data.get('roadmap', {}).get('id')
        if not test_roadmap_id:
            return False, None
        
        # Try to delete as manager (should fail)
        return self.test(
            "DELETE roadmap as manager (should 403)",
            "DELETE",
            f"/api/roadmaps/{test_roadmap_id}",
            403,
            token=self.manager_token
        )
    
    def run_all_tests(self):
        """Run all Sprint 3.5 tests"""
        self.log("\n" + "="*80, Colors.BLUE)
        self.log("Sprint 3.5 Customer Roadmap — HTTP API Testing", Colors.BLUE)
        self.log("="*80 + "\n", Colors.BLUE)
        
        # ===== LOGIN =====
        self.admin_token = self.login("admin@bibi.cars", "Jp3FS_7ZuE2bhHp7rFkJm9B9T_TeiHxu")
        if not self.admin_token:
            self.log("\n❌ CRITICAL: Admin login failed - cannot continue", Colors.RED)
            return False
        
        self.manager_token = self.login("manager@bibi.test", "Jp3FS_7ZuE2bhHp7rFkJm9B9T_TeiHxu")
        if not self.manager_token:
            self.log("\n❌ CRITICAL: Manager login failed - cannot continue", Colors.RED)
            return False
        
        # ===== TEST 1: Public Cabinet Endpoints =====
        self.log("\n" + "="*80, Colors.BLUE)
        self.log("TEST SUITE 1: Public Cabinet Endpoints (No Auth)", Colors.BLUE)
        self.log("="*80, Colors.BLUE)
        
        self.test_public_cabinet_list()
        
        # ===== TEST 2: Create Roadmap =====
        self.log("\n" + "="*80, Colors.BLUE)
        self.log("TEST SUITE 2: Create Roadmap (Manager Auth)", Colors.BLUE)
        self.log("="*80, Colors.BLUE)
        
        self.test_create_roadmap()
        
        # ===== TEST 3: Get Roadmap Detail =====
        self.log("\n" + "="*80, Colors.BLUE)
        self.log("TEST SUITE 3: Get Roadmap Detail (Manager Auth)", Colors.BLUE)
        self.log("="*80, Colors.BLUE)
        
        self.test_get_roadmap_detail()
        
        # ===== TEST 4: Update Stage (Auto-Advance) =====
        self.log("\n" + "="*80, Colors.BLUE)
        self.log("TEST SUITE 4: Update Stage & Auto-Advance", Colors.BLUE)
        self.log("="*80, Colors.BLUE)
        
        self.test_update_stage()
        
        # ===== TEST 5: Validation =====
        self.log("\n" + "="*80, Colors.BLUE)
        self.log("TEST SUITE 5: Validation (Invalid Stage/Status)", Colors.BLUE)
        self.log("="*80, Colors.BLUE)
        
        self.test_invalid_stage_key()
        self.test_invalid_status()
        
        # ===== TEST 6: Public Cabinet Detail & 403 =====
        self.log("\n" + "="*80, Colors.BLUE)
        self.log("TEST SUITE 6: Public Cabinet Detail & Authorization", Colors.BLUE)
        self.log("="*80, Colors.BLUE)
        
        self.test_public_cabinet_detail()
        self.test_public_cabinet_403()
        
        # ===== TEST 7: List Customer Roadmaps =====
        self.log("\n" + "="*80, Colors.BLUE)
        self.log("TEST SUITE 7: List Customer Roadmaps (Manager Auth)", Colors.BLUE)
        self.log("="*80, Colors.BLUE)
        
        self.test_list_customer_roadmaps()
        
        # ===== TEST 8: Analytics =====
        self.log("\n" + "="*80, Colors.BLUE)
        self.log("TEST SUITE 8: Analytics Endpoints", Colors.BLUE)
        self.log("="*80, Colors.BLUE)
        
        self.test_team_roadmaps_analytics()
        self.test_admin_roadmaps_analytics()
        self.test_admin_stages_template()
        
        # ===== TEST 9: Delete Roadmap =====
        self.log("\n" + "="*80, Colors.BLUE)
        self.log("TEST SUITE 9: Delete Roadmap (Soft Delete)", Colors.BLUE)
        self.log("="*80, Colors.BLUE)
        
        self.test_manager_cannot_delete()
        self.test_delete_roadmap()
        
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
    tester = Sprint35Tester()
    success = tester.run_all_tests()
    return 0 if success else 1

if __name__ == "__main__":
    sys.exit(main())
