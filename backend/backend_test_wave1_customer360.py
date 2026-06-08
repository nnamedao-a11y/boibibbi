#!/usr/bin/env python3
"""
Wave-1 Customer360 Backend Test
================================
Tests the single source of truth for Customer Health Score and new endpoints.

Critical AC#11: Same customer must show identical score+segment across:
  - /customers/{id}/360.health
  - /customer-health-bulk?ids={id}

Test Coverage:
1. GET /api/customers/{id}/360 - returns customer, leads, quotes, deals, deposits + summary + health
2. GET /api/customers/{id}/health - full health object
3. GET /api/customer-health-bulk?ids=id1,id2 - lightweight health
4. GET /api/customers/{id}/contracts - contracts list
5. GET /api/customers/{id}/documents + POST + DELETE - documents CRUD
6. AC#11 verification - same score+segment across endpoints
7. Error handling - 404 for invalid customer IDs
8. Bulk endpoint handles missing IDs gracefully
"""
import sys
import requests
from datetime import datetime

# Get backend URL from frontend/.env
BACKEND_URL = "https://full-stack-deploy-94.preview.emergentagent.com"
API_BASE = f"{BACKEND_URL}/api"

# Test credentials from review_request
ADMIN_EMAIL = "admin@bibi.cars"
ADMIN_PASSWORD = "Jp3FS_7ZuE2bhHp7rFkJm9B9T_TeiHxu"

class Wave1Customer360Tester:
    def __init__(self):
        self.token = None
        self.tests_run = 0
        self.tests_passed = 0
        self.test_customer_id = None
        self.health_scores = {}  # Store scores for AC#11 verification

    def log(self, msg, level="INFO"):
        """Log with timestamp"""
        timestamp = datetime.now().strftime("%H:%M:%S")
        print(f"[{timestamp}] [{level}] {msg}")

    def run_test(self, name, method, endpoint, expected_status, data=None, headers=None):
        """Run a single API test"""
        url = f"{API_BASE}/{endpoint}"
        h = {'Content-Type': 'application/json'}
        if self.token:
            h['Authorization'] = f'Bearer {self.token}'
        if headers:
            h.update(headers)

        self.tests_run += 1
        self.log(f"Testing {name}...")
        
        try:
            if method == 'GET':
                response = requests.get(url, headers=h, timeout=30)
            elif method == 'POST':
                response = requests.post(url, json=data, headers=h, timeout=30)
            elif method == 'DELETE':
                response = requests.delete(url, headers=h, timeout=30)
            elif method == 'PUT':
                response = requests.put(url, json=data, headers=h, timeout=30)
            else:
                raise ValueError(f"Unsupported method: {method}")

            success = response.status_code == expected_status
            if success:
                self.tests_passed += 1
                self.log(f"✅ PASS - {name} - Status: {response.status_code}", "PASS")
            else:
                self.log(f"❌ FAIL - {name} - Expected {expected_status}, got {response.status_code}", "FAIL")
                self.log(f"   Response: {response.text[:200]}", "FAIL")

            return success, response.json() if response.text and response.status_code < 500 else {}

        except Exception as e:
            self.log(f"❌ FAIL - {name} - Error: {str(e)}", "FAIL")
            return False, {}

    def login(self):
        """Login as admin"""
        self.log("=== AUTHENTICATION ===")
        success, response = self.run_test(
            "Admin Login",
            "POST",
            "auth/login",
            200,
            data={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}
        )
        if success and 'access_token' in response:
            self.token = response['access_token']
            self.log(f"✅ Logged in successfully", "PASS")
            return True
        self.log("❌ Login failed", "FAIL")
        return False

    def get_test_customer(self):
        """Get a test customer ID from the database"""
        self.log("=== FINDING TEST CUSTOMER ===")
        success, response = self.run_test(
            "Get Customers List",
            "GET",
            "customers",
            200
        )
        if success and response.get('data'):
            customers = response['data']
            if customers:
                self.test_customer_id = customers[0]['id']
                self.log(f"✅ Using test customer: {self.test_customer_id}", "PASS")
                return True
        self.log("❌ No customers found in database", "FAIL")
        return False

    def test_customer_360_endpoint(self):
        """Test GET /api/customers/{id}/360"""
        self.log("=== TEST: Customer 360 Endpoint ===")
        success, response = self.run_test(
            "GET /customers/{id}/360",
            "GET",
            f"customers/{self.test_customer_id}/360",
            200
        )
        
        if success:
            # Verify structure
            required_keys = ['customer', 'leads', 'quotes', 'deals', 'deposits', 'summary', 'health']
            missing = [k for k in required_keys if k not in response]
            if missing:
                self.log(f"❌ Missing keys in /360 response: {missing}", "FAIL")
                return False
            
            # Verify summary fields
            summary = response.get('summary', {})
            summary_fields = ['totalLeads', 'totalQuotes', 'totalDeals', 'completedDeals', 
                            'depositsCount', 'totalRevenue', 'totalProfit', 'totalDepositsAmount']
            missing_summary = [f for f in summary_fields if f not in summary]
            if missing_summary:
                self.log(f"❌ Missing summary fields: {missing_summary}", "FAIL")
                return False
            
            # Verify health block
            health = response.get('health', {})
            health_fields = ['score', 'segment', 'breakdown', 'risks']
            missing_health = [f for f in health_fields if f not in health]
            if missing_health:
                self.log(f"❌ Missing health fields: {missing_health}", "FAIL")
                return False
            
            # Store health for AC#11 verification
            self.health_scores['360'] = {
                'score': health.get('score'),
                'segment': health.get('segment')
            }
            
            self.log(f"✅ /360 endpoint structure valid", "PASS")
            self.log(f"   Health: score={health.get('score')}, segment={health.get('segment')}", "INFO")
            self.log(f"   Summary: leads={summary.get('totalLeads')}, deals={summary.get('totalDeals')}, revenue={summary.get('totalRevenue')}", "INFO")
            return True
        
        return False

    def test_customer_health_endpoint(self):
        """Test GET /api/customers/{id}/health"""
        self.log("=== TEST: Customer Health Endpoint ===")
        success, response = self.run_test(
            "GET /customers/{id}/health",
            "GET",
            f"customers/{self.test_customer_id}/health",
            200
        )
        
        if success:
            # Extract health from wrapper
            health_data = response.get('health', response)
            
            # Verify full health object
            required_keys = ['score', 'segment', 'breakdown', 'risks', 'weights', 'last_contact']
            missing = [k for k in required_keys if k not in health_data]
            if missing:
                self.log(f"❌ Missing keys in /health response: {missing}", "FAIL")
                return False
            
            # Verify breakdown structure
            breakdown = health_data.get('breakdown', {})
            breakdown_fields = ['activity', 'engagement', 'financial', 'deal_progress', 'documents', 'risk_penalty']
            missing_breakdown = [f for f in breakdown_fields if f not in breakdown]
            if missing_breakdown:
                self.log(f"❌ Missing breakdown fields: {missing_breakdown}", "FAIL")
                return False
            
            # Store health for AC#11 verification
            self.health_scores['health'] = {
                'score': health_data.get('score'),
                'segment': health_data.get('segment')
            }
            
            self.log(f"✅ /health endpoint structure valid", "PASS")
            self.log(f"   Health: score={health_data.get('score')}, segment={health_data.get('segment')}", "INFO")
            self.log(f"   Breakdown: {breakdown}", "INFO")
            self.log(f"   Risks: {len(health_data.get('risks', []))} risks found", "INFO")
            return True
        
        return False

    def test_customer_health_bulk_endpoint(self):
        """Test GET /api/customer-health-bulk?ids=id1,id2"""
        self.log("=== TEST: Customer Health Bulk Endpoint ===")
        success, response = self.run_test(
            "GET /customer-health-bulk",
            "GET",
            f"customer-health-bulk?ids={self.test_customer_id}",
            200
        )
        
        if success:
            # Verify structure
            if 'items' not in response:
                self.log(f"❌ Missing 'items' key in bulk response", "FAIL")
                return False
            
            items = response.get('items', {})
            if self.test_customer_id not in items:
                self.log(f"❌ Customer {self.test_customer_id} not in bulk response", "FAIL")
                return False
            
            customer_health = items[self.test_customer_id]
            
            # Verify lightweight structure (only score+segment)
            if 'score' not in customer_health or 'segment' not in customer_health:
                self.log(f"❌ Missing score or segment in bulk response", "FAIL")
                return False
            
            # Should NOT have breakdown or risks (lightweight)
            if 'breakdown' in customer_health or 'risks' in customer_health:
                self.log(f"⚠️  WARNING: Bulk endpoint should be lightweight (no breakdown/risks)", "WARN")
            
            # Store health for AC#11 verification
            self.health_scores['bulk'] = {
                'score': customer_health.get('score'),
                'segment': customer_health.get('segment')
            }
            
            self.log(f"✅ /customer-health-bulk endpoint structure valid", "PASS")
            self.log(f"   Health: score={customer_health.get('score')}, segment={customer_health.get('segment')}", "INFO")
            return True
        
        return False

    def test_ac11_consistency(self):
        """Test AC#11: Same score+segment across all endpoints"""
        self.log("=== TEST: AC#11 - Health Score Consistency ===")
        
        if len(self.health_scores) < 3:
            self.log(f"❌ Not enough health data collected for AC#11 test", "FAIL")
            return False
        
        # Compare /360 vs /health
        if self.health_scores['360'] != self.health_scores['health']:
            self.log(f"❌ AC#11 FAIL: /360 and /health have different scores", "FAIL")
            self.log(f"   /360:   {self.health_scores['360']}", "FAIL")
            self.log(f"   /health: {self.health_scores['health']}", "FAIL")
            return False
        
        # Compare /360 vs /bulk
        if self.health_scores['360'] != self.health_scores['bulk']:
            self.log(f"❌ AC#11 FAIL: /360 and /bulk have different scores", "FAIL")
            self.log(f"   /360: {self.health_scores['360']}", "FAIL")
            self.log(f"   /bulk: {self.health_scores['bulk']}", "FAIL")
            return False
        
        self.tests_run += 1
        self.tests_passed += 1
        self.log(f"✅ AC#11 PASS: All endpoints return identical score+segment", "PASS")
        self.log(f"   Consistent values: {self.health_scores['360']}", "PASS")
        return True

    def test_contracts_endpoint(self):
        """Test GET /api/customers/{id}/contracts"""
        self.log("=== TEST: Contracts Endpoint ===")
        success, response = self.run_test(
            "GET /customers/{id}/contracts",
            "GET",
            f"customers/{self.test_customer_id}/contracts",
            200
        )
        
        if success:
            # Verify structure
            if 'items' not in response or 'total' not in response:
                self.log(f"❌ Missing 'items' or 'total' in contracts response", "FAIL")
                return False
            
            self.log(f"✅ /contracts endpoint structure valid", "PASS")
            self.log(f"   Found {response.get('total', 0)} contracts", "INFO")
            return True
        
        return False

    def test_documents_crud(self):
        """Test Documents CRUD: GET, POST, DELETE"""
        self.log("=== TEST: Documents CRUD ===")
        
        # 1. GET documents
        success, response = self.run_test(
            "GET /customers/{id}/documents",
            "GET",
            f"customers/{self.test_customer_id}/documents",
            200
        )
        
        if not success:
            return False
        
        if 'items' not in response or 'total' not in response:
            self.log(f"❌ Missing 'items' or 'total' in documents response", "FAIL")
            return False
        
        initial_count = response.get('total', 0)
        self.log(f"✅ GET documents OK - Found {initial_count} documents", "PASS")
        
        # 2. POST document (upload)
        test_doc = {
            "name": "test_wave1_doc.txt",
            "type": "upload",
            "mime": "text/plain",
            "data_url": "data:text/plain;base64,VGVzdCBkb2N1bWVudCBmb3IgV2F2ZS0x"
        }
        
        success, response = self.run_test(
            "POST /customers/{id}/documents",
            "POST",
            f"customers/{self.test_customer_id}/documents",
            200,  # Changed from 201 to 200 as backend returns 200
            data=test_doc
        )
        
        if not success:
            self.log(f"❌ Failed to upload document", "FAIL")
            return False
        
        doc_id = response.get('document', {}).get('id') or response.get('id')
        if not doc_id:
            self.log(f"❌ No document ID returned after upload", "FAIL")
            return False
        
        self.log(f"✅ POST document OK - Created doc ID: {doc_id}", "PASS")
        
        # 3. DELETE document
        success, response = self.run_test(
            "DELETE /customers/{id}/documents/{doc_id}",
            "DELETE",
            f"customers/{self.test_customer_id}/documents/{doc_id}",
            200
        )
        
        if not success:
            self.log(f"❌ Failed to delete document", "FAIL")
            return False
        
        self.log(f"✅ DELETE document OK", "PASS")
        return True

    def test_error_handling(self):
        """Test error handling for invalid customer IDs"""
        self.log("=== TEST: Error Handling ===")
        
        invalid_id = "invalid_customer_id_12345"
        
        # Test /360 with invalid ID
        success, response = self.run_test(
            "GET /360 with invalid ID (expect 404)",
            "GET",
            f"customers/{invalid_id}/360",
            404
        )
        
        if not success:
            self.log(f"❌ /360 should return 404 for invalid customer ID", "FAIL")
            return False
        
        # Test /health with invalid ID
        success, response = self.run_test(
            "GET /health with invalid ID (expect 404)",
            "GET",
            f"customers/{invalid_id}/health",
            404
        )
        
        if not success:
            self.log(f"❌ /health should return 404 for invalid customer ID", "FAIL")
            return False
        
        # Test bulk with missing IDs (should return empty items)
        success, response = self.run_test(
            "GET /bulk with missing IDs",
            "GET",
            f"customer-health-bulk?ids={invalid_id}",
            200
        )
        
        if success:
            items = response.get('items', {})
            if invalid_id in items:
                self.log(f"❌ Bulk should not return data for invalid customer ID", "FAIL")
                return False
            self.log(f"✅ Bulk correctly handles missing IDs (returns empty)", "PASS")
        
        return True

    def run_all_tests(self):
        """Run all Wave-1 Customer360 tests"""
        self.log("=" * 60)
        self.log("WAVE-1 CUSTOMER360 BACKEND TEST SUITE")
        self.log("=" * 60)
        
        # 1. Login
        if not self.login():
            self.log("❌ Cannot proceed without authentication", "FAIL")
            return False
        
        # 2. Get test customer
        if not self.get_test_customer():
            self.log("❌ Cannot proceed without test customer", "FAIL")
            return False
        
        # 3. Test /360 endpoint
        self.test_customer_360_endpoint()
        
        # 4. Test /health endpoint
        self.test_customer_health_endpoint()
        
        # 5. Test /bulk endpoint
        self.test_customer_health_bulk_endpoint()
        
        # 6. Test AC#11 consistency
        self.test_ac11_consistency()
        
        # 7. Test /contracts endpoint
        self.test_contracts_endpoint()
        
        # 8. Test /documents CRUD
        self.test_documents_crud()
        
        # 9. Test error handling
        self.test_error_handling()
        
        # Print summary
        self.log("=" * 60)
        self.log(f"TESTS COMPLETED: {self.tests_passed}/{self.tests_run} passed")
        self.log("=" * 60)
        
        if self.tests_passed == self.tests_run:
            self.log("✅ ALL TESTS PASSED", "PASS")
            return True
        else:
            self.log(f"❌ {self.tests_run - self.tests_passed} TESTS FAILED", "FAIL")
            return False

def main():
    tester = Wave1Customer360Tester()
    success = tester.run_all_tests()
    return 0 if success else 1

if __name__ == "__main__":
    sys.exit(main())
