"""
BIBI Cars Bug-fix Wave Backend Test Suite
==========================================
Tests three bug fixes:
1. Deal ID bug: POST/GET /api/deals always writes/returns id field
2. Invoice Reminders: Real data wiring (no mock stubs)
3. Backfill: Legacy deals get id field on startup

Testing against: https://full-deploy-21.preview.emergentagent.com
"""
import requests
import sys
from datetime import datetime, timezone, timedelta
from typing import Dict, Any, List
import pymongo

BASE_URL = "https://full-deploy-21.preview.emergentagent.com"
MONGO_URL = "mongodb://localhost:27017"
DB_NAME = "test_database"

class BugfixWaveTester:
    def __init__(self):
        self.base_url = BASE_URL
        self.tests_run = 0
        self.tests_passed = 0
        self.tests_failed = 0
        self.admin_token = None
        self.failed_tests = []
        self.backend_errors = []
        
        # MongoDB client for direct data seeding
        self.mongo_client = pymongo.MongoClient(MONGO_URL)
        self.db = self.mongo_client[DB_NAME]

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
    
    def test_admin_login(self):
        """Test admin login"""
        print("\n" + "="*70)
        print("🔐 AUTHENTICATION")
        print("="*70)
        
        try:
            resp = requests.post(
                f"{self.base_url}/api/auth/login",
                json={"email": "admin@bibi.cars", "password": "Jp3FS_7ZuE2bhHp7rFkJm9B9T_TeiHxu"},
                timeout=10
            )
            
            success, msg = self.check_response(resp, 200)
            if not success:
                self.test("Admin login", False, msg, critical=True)
                return False
            
            data = resp.json()
            self.admin_token = data.get("access_token")
            
            self.test(
                "Admin login",
                self.admin_token is not None,
                f"Token received: {self.admin_token[:20]}..." if self.admin_token else "No access_token",
                critical=True
            )
            return self.admin_token is not None
            
        except Exception as e:
            self.test("Admin login", False, f"Exception: {e}", critical=True)
            return False

    # ═══════════════════════════════════════════════════════════════
    # BUG FIX 1: DEAL ID
    # ═══════════════════════════════════════════════════════════════
    
    def test_deal_id_bug_fix(self):
        """Test Deal ID bug fix: POST/GET /api/deals always writes/returns id field"""
        print("\n" + "="*70)
        print("🔧 BUG FIX 1: DEAL ID")
        print("="*70)
        
        if not self.admin_token:
            self.log("⚠️  Skipping deal tests - no admin token")
            return
        
        headers = {"Authorization": f"Bearer {self.admin_token}"}
        
        # Test 1: POST /api/deals → response.deal.id present, equals deal._id
        try:
            deal_data = {
                "title": f"Test Deal {datetime.now(timezone.utc).timestamp()}",
                "vin": "TEST123456789",
                "stage": "qualified",
                "customer_id": "test-customer-001"
            }
            
            resp = requests.post(
                f"{self.base_url}/api/deals",
                json=deal_data,
                headers=headers,
                timeout=10
            )
            
            success, msg = self.check_response(resp, 200)
            if success:
                data = resp.json()
                deal = data.get("deal", {})
                
                has_id = "id" in deal
                has_underscore_id = "_id" in deal
                ids_match = deal.get("id") == deal.get("_id") if (has_id and has_underscore_id) else False
                
                self.test(
                    "POST /api/deals → response.deal.id present",
                    has_id,
                    f"deal.id = {deal.get('id')}"
                )
                
                self.test(
                    "POST /api/deals → response.deal.id equals deal._id",
                    ids_match,
                    f"id={deal.get('id')}, _id={deal.get('_id')}"
                )
                
                # Store for later verification
                self.created_deal_id = deal.get("id")
            else:
                self.test("POST /api/deals", False, msg, critical=True)
                
        except Exception as e:
            self.test("POST /api/deals", False, f"Exception: {e}", critical=True)
        
        # Test 2: GET /api/deals → every item has top-level 'id' field
        try:
            resp = requests.get(
                f"{self.base_url}/api/deals",
                headers=headers,
                timeout=10
            )
            
            success, msg = self.check_response(resp, 200)
            if success:
                data = resp.json()
                items = data.get("items", data.get("data", []))
                
                all_have_id = all("id" in item for item in items)
                freshly_created_present = any(item.get("id") == getattr(self, 'created_deal_id', None) for item in items)
                
                self.test(
                    "GET /api/deals → every item has 'id' field",
                    all_have_id,
                    f"Total deals: {len(items)}, All have id: {all_have_id}"
                )
                
                if hasattr(self, 'created_deal_id'):
                    self.test(
                        "GET /api/deals → freshly-created deal appears in list",
                        freshly_created_present,
                        f"Looking for id={self.created_deal_id}"
                    )
                
                # Check for legacy_deal_001 (should be backfilled)
                legacy_deal = next((d for d in items if "legacy" in d.get("id", "").lower() or "legacy" in d.get("title", "").lower()), None)
                if legacy_deal:
                    self.test(
                        "Legacy deal has 'id' field (backfilled)",
                        "id" in legacy_deal,
                        f"Legacy deal id: {legacy_deal.get('id')}"
                    )
                else:
                    self.log("⚠️  No legacy deal found in list (may not exist)")
                    
            else:
                self.test("GET /api/deals", False, msg, critical=True)
                
        except Exception as e:
            self.test("GET /api/deals", False, f"Exception: {e}", critical=True)
        
        # Test 3: Verify backfill worked by checking MongoDB directly
        try:
            deals_without_id = list(self.db.deals.find(
                {"$or": [{"id": {"$exists": False}}, {"id": None}, {"id": ""}]},
                {"_id": 1, "id": 1, "title": 1}
            ).limit(5))
            
            self.test(
                "MongoDB: No deals missing 'id' field (backfill complete)",
                len(deals_without_id) == 0,
                f"Deals without id: {len(deals_without_id)}" + (f" - {deals_without_id}" if deals_without_id else "")
            )
            
        except Exception as e:
            self.test("MongoDB backfill check", False, f"Exception: {e}")

    # ═══════════════════════════════════════════════════════════════
    # BUG FIX 3: INVOICE REMINDERS
    # ═══════════════════════════════════════════════════════════════
    
    def test_invoice_reminders_empty_state(self):
        """Test Invoice Reminders with empty state (no invoices)"""
        print("\n" + "="*70)
        print("🔧 BUG FIX 3: INVOICE REMINDERS (Empty State)")
        print("="*70)
        
        if not self.admin_token:
            self.log("⚠️  Skipping invoice reminders tests - no admin token")
            return
        
        headers = {"Authorization": f"Bearer {self.admin_token}"}
        
        # Purge invoices collection to test empty state
        try:
            result = self.db.invoices.delete_many({})
            self.log(f"Purged {result.deleted_count} invoices for clean test")
        except Exception as e:
            self.log(f"⚠️  Failed to purge invoices: {e}")
        
        # Test 1: GET /api/invoice-reminders/escalation-summary → hasData=false
        try:
            resp = requests.get(
                f"{self.base_url}/api/invoice-reminders/escalation-summary",
                headers=headers,
                timeout=10
            )
            
            success, msg = self.check_response(resp, 200)
            if success:
                data = resp.json()
                
                has_data_flag = data.get("hasData") == False
                total_invoices = data.get("totalInvoices", -1)
                
                self.test(
                    "GET /api/invoice-reminders/escalation-summary → hasData=false (empty state)",
                    has_data_flag,
                    f"hasData={data.get('hasData')}, totalInvoices={total_invoices}"
                )
                
                # Verify all counts are 0
                counts_zero = (
                    data.get("level1Count", -1) == 0 and
                    data.get("level2Count", -1) == 0 and
                    data.get("level3Count", -1) == 0 and
                    data.get("criticalCount", -1) == 0
                )
                
                self.test(
                    "Escalation summary: all counts are 0 (empty state)",
                    counts_zero,
                    f"level1={data.get('level1Count')}, level2={data.get('level2Count')}, level3={data.get('level3Count')}, critical={data.get('criticalCount')}"
                )
            else:
                self.test("GET /api/invoice-reminders/escalation-summary", False, msg, critical=True)
                
        except Exception as e:
            self.test("GET /api/invoice-reminders/escalation-summary", False, f"Exception: {e}", critical=True)
        
        # Test 2: GET /api/invoice-reminders/critical → returns empty array
        try:
            resp = requests.get(
                f"{self.base_url}/api/invoice-reminders/critical",
                headers=headers,
                timeout=10
            )
            
            success, msg = self.check_response(resp, 200)
            if success:
                data = resp.json()
                
                is_array = isinstance(data, list)
                is_empty = len(data) == 0 if is_array else False
                
                self.test(
                    "GET /api/invoice-reminders/critical → returns array (not wrapped)",
                    is_array,
                    f"Response type: {type(data).__name__}"
                )
                
                self.test(
                    "GET /api/invoice-reminders/critical → empty array (no data)",
                    is_empty,
                    f"Array length: {len(data) if is_array else 'N/A'}"
                )
            else:
                self.test("GET /api/invoice-reminders/critical", False, msg, critical=True)
                
        except Exception as e:
            self.test("GET /api/invoice-reminders/critical", False, f"Exception: {e}", critical=True)
    
    def seed_test_invoices(self):
        """Seed test invoices directly in MongoDB"""
        print("\n" + "="*70)
        print("🌱 SEEDING TEST INVOICES")
        print("="*70)
        
        now = datetime.now(timezone.utc)
        
        # Create invoices with different overdue levels
        test_invoices = [
            # Level 1: 2 days overdue (≥1 day)
            {
                "id": f"inv-test-level1-{now.timestamp()}",
                "invoiceNumber": "INV-TEST-001",
                "customerId": "test-customer-001",
                "managerId": "manager-001",
                "amount": 1000.00,
                "status": "overdue",
                "dueDate": (now - timedelta(days=2)).isoformat(),
                "created_at": (now - timedelta(days=10)).isoformat(),
            },
            # Level 2: 4 days overdue (≥3 days)
            {
                "id": f"inv-test-level2-{now.timestamp()}",
                "invoiceNumber": "INV-TEST-002",
                "customerId": "test-customer-002",
                "managerId": "manager-001",
                "amount": 2000.00,
                "status": "overdue",
                "dueDate": (now - timedelta(days=4)).isoformat(),
                "created_at": (now - timedelta(days=15)).isoformat(),
            },
            # Level 3: 6 days overdue (≥5 days) - CRITICAL
            {
                "id": f"inv-test-level3-{now.timestamp()}",
                "invoiceNumber": "INV-TEST-003",
                "customerId": "test-customer-003",
                "managerId": "manager-001",
                "amount": 3000.00,
                "status": "overdue",
                "dueDate": (now - timedelta(days=6)).isoformat(),
                "created_at": (now - timedelta(days=20)).isoformat(),
            },
            # Critical: 8 days overdue (≥7 days)
            {
                "id": f"inv-test-critical-{now.timestamp()}",
                "invoiceNumber": "INV-TEST-004",
                "customerId": "test-customer-004",
                "managerId": "manager-001",
                "amount": 5000.00,
                "status": "overdue",
                "dueDate": (now - timedelta(days=8)).isoformat(),
                "created_at": (now - timedelta(days=25)).isoformat(),
            },
            # Paid invoice (should not appear in reminders)
            {
                "id": f"inv-test-paid-{now.timestamp()}",
                "invoiceNumber": "INV-TEST-005",
                "customerId": "test-customer-005",
                "managerId": "manager-001",
                "amount": 1500.00,
                "status": "paid",
                "dueDate": (now - timedelta(days=10)).isoformat(),
                "created_at": (now - timedelta(days=30)).isoformat(),
            },
        ]
        
        try:
            result = self.db.invoices.insert_many(test_invoices)
            self.test(
                "Seed test invoices",
                len(result.inserted_ids) == len(test_invoices),
                f"Inserted {len(result.inserted_ids)} invoices"
            )
            self.log(f"Invoice IDs: {[inv['id'] for inv in test_invoices]}")
        except Exception as e:
            self.test("Seed test invoices", False, f"Exception: {e}", critical=True)
    
    def test_invoice_reminders_with_data(self):
        """Test Invoice Reminders with real data"""
        print("\n" + "="*70)
        print("🔧 BUG FIX 3: INVOICE REMINDERS (With Data)")
        print("="*70)
        
        if not self.admin_token:
            self.log("⚠️  Skipping invoice reminders tests - no admin token")
            return
        
        headers = {"Authorization": f"Bearer {self.admin_token}"}
        
        # Test 1: GET /api/invoice-reminders/escalation-summary → hasData=true, counts > 0
        try:
            resp = requests.get(
                f"{self.base_url}/api/invoice-reminders/escalation-summary",
                headers=headers,
                timeout=10
            )
            
            success, msg = self.check_response(resp, 200)
            if success:
                data = resp.json()
                
                has_data_flag = data.get("hasData") == True
                total_invoices = data.get("totalInvoices", 0)
                
                self.test(
                    "GET /api/invoice-reminders/escalation-summary → hasData=true",
                    has_data_flag,
                    f"hasData={data.get('hasData')}, totalInvoices={total_invoices}"
                )
                
                # Verify counts match expected levels
                level1 = data.get("level1Count", 0)
                level2 = data.get("level2Count", 0)
                level3 = data.get("level3Count", 0)
                critical = data.get("criticalCount", 0)
                
                self.test(
                    "Escalation summary: level1Count ≥ 4 (all overdue invoices)",
                    level1 >= 4,
                    f"level1Count={level1} (expected ≥4)"
                )
                
                self.test(
                    "Escalation summary: level2Count ≥ 3 (≥3 days overdue)",
                    level2 >= 3,
                    f"level2Count={level2} (expected ≥3)"
                )
                
                self.test(
                    "Escalation summary: level3Count ≥ 2 (≥5 days overdue)",
                    level3 >= 2,
                    f"level3Count={level3} (expected ≥2)"
                )
                
                self.test(
                    "Escalation summary: criticalCount ≥ 1 (≥7 days overdue)",
                    critical >= 1,
                    f"criticalCount={critical} (expected ≥1)"
                )
                
                self.log(f"Full summary: level1={level1}, level2={level2}, level3={level3}, critical={critical}")
                
            else:
                self.test("GET /api/invoice-reminders/escalation-summary", False, msg, critical=True)
                
        except Exception as e:
            self.test("GET /api/invoice-reminders/escalation-summary", False, f"Exception: {e}", critical=True)
        
        # Test 2: GET /api/invoice-reminders/critical → returns invoices ≥5 days overdue
        try:
            resp = requests.get(
                f"{self.base_url}/api/invoice-reminders/critical",
                headers=headers,
                timeout=10
            )
            
            success, msg = self.check_response(resp, 200)
            if success:
                data = resp.json()
                
                is_array = isinstance(data, list)
                has_items = len(data) >= 2 if is_array else False
                
                self.test(
                    "GET /api/invoice-reminders/critical → returns array with items",
                    is_array and has_items,
                    f"Response type: {type(data).__name__}, Items: {len(data) if is_array else 'N/A'}"
                )
                
                if is_array and len(data) > 0:
                    # Verify all returned invoices are unpaid
                    all_unpaid = all(inv.get("status") not in ["paid", "void", "cancelled", "refunded"] for inv in data)
                    self.test(
                        "Critical invoices: all are unpaid",
                        all_unpaid,
                        f"Statuses: {[inv.get('status') for inv in data[:3]]}"
                    )
                    
            else:
                self.test("GET /api/invoice-reminders/critical", False, msg, critical=True)
                
        except Exception as e:
            self.test("GET /api/invoice-reminders/critical", False, f"Exception: {e}", critical=True)
        
        # Test 3: POST /api/invoice-reminders/process → returns processed > 0, reminders > 0
        try:
            resp = requests.post(
                f"{self.base_url}/api/invoice-reminders/process",
                headers=headers,
                timeout=30  # May take longer
            )
            
            success, msg = self.check_response(resp, 200)
            if success:
                data = resp.json()
                
                processed = data.get("processed", 0)
                reminders = data.get("reminders", 0)
                ran_at = data.get("ranAt")
                
                self.test(
                    "POST /api/invoice-reminders/process → processed > 0",
                    processed > 0,
                    f"processed={processed}"
                )
                
                self.test(
                    "POST /api/invoice-reminders/process → reminders > 0",
                    reminders > 0,
                    f"reminders={reminders}"
                )
                
                self.test(
                    "POST /api/invoice-reminders/process → ranAt timestamp present",
                    ran_at is not None,
                    f"ranAt={ran_at}"
                )
                
                self.log(f"Process result: processed={processed}, reminders={reminders}, ranAt={ran_at}")
                
            else:
                self.test("POST /api/invoice-reminders/process", False, msg, critical=True)
                
        except Exception as e:
            self.test("POST /api/invoice-reminders/process", False, f"Exception: {e}", critical=True)
        
        # Test 4: Verify lastProcessedAt is updated after process runs
        try:
            import time
            time.sleep(2)  # Wait for DB to update
            
            resp = requests.get(
                f"{self.base_url}/api/invoice-reminders/escalation-summary",
                headers=headers,
                timeout=10
            )
            
            success, msg = self.check_response(resp, 200)
            if success:
                data = resp.json()
                last_processed_at = data.get("lastProcessedAt")
                
                self.test(
                    "After process: lastProcessedAt is not null",
                    last_processed_at is not None,
                    f"lastProcessedAt={last_processed_at}"
                )
            else:
                self.test("GET escalation-summary after process", False, msg)
                
        except Exception as e:
            self.test("GET escalation-summary after process", False, f"Exception: {e}")

    # ═══════════════════════════════════════════════════════════════
    # MAIN TEST RUNNER
    # ═══════════════════════════════════════════════════════════════
    
    def run_all_tests(self):
        """Run all bug-fix wave tests"""
        print("\n" + "="*70)
        print("BIBI CARS BUG-FIX WAVE — BACKEND TEST SUITE")
        print("="*70)
        print(f"Base URL: {self.base_url}")
        print(f"MongoDB: {MONGO_URL}/{DB_NAME}")
        print("="*70)
        
        # Authentication
        if not self.test_admin_login():
            print("\n❌ CRITICAL: Admin login failed. Cannot proceed with tests.")
            return 1
        
        # Run all test suites
        self.test_deal_id_bug_fix()
        self.test_invoice_reminders_empty_state()
        self.seed_test_invoices()
        self.test_invoice_reminders_with_data()
        
        # Print summary
        self.print_summary()
        
        # Cleanup
        try:
            self.mongo_client.close()
        except:
            pass
        
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
            for err in self.backend_errors[:5]:
                print(f"  - {err['endpoint']}: {err['status']} - {err['error'][:100]}")
        
        if self.failed_tests:
            print(f"\n❌ Failed tests ({len(self.failed_tests)}):")
            for ft in self.failed_tests[:10]:
                critical = " [CRITICAL]" if ft.get("critical") else ""
                print(f"  - {ft['test']}{critical}")
                if ft['details']:
                    print(f"    {ft['details'][:200]}")
        
        print("="*70)


def main():
    tester = BugfixWaveTester()
    exit_code = tester.run_all_tests()
    sys.exit(exit_code)


if __name__ == "__main__":
    main()
