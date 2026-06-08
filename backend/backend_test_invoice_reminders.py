"""
BIBI Cars — Invoice Reminders Backend Test Suite
=================================================
Tests invoice CRUD operations and invoice reminders functionality:
- GET /api/invoices/{invoice_id}
- PATCH /api/invoices/{invoice_id}/mark-paid
- PATCH /api/invoices/{invoice_id}/send
- PATCH /api/invoices/{invoice_id}/cancel
- GET /api/invoice-reminders/critical
- GET /api/invoice-reminders/escalation-summary
"""
import requests
import sys
import time
from typing import Dict, Any, Optional

BASE_URL = "https://full-deploy-21.preview.emergentagent.com"

class InvoiceRemindersAPITester:
    def __init__(self):
        self.base_url = BASE_URL
        self.tests_run = 0
        self.tests_passed = 0
        self.tests_failed = 0
        
        self.admin_token = None
        self.failed_tests = []
        self.backend_errors = []
        
        # Test data
        self.test_invoice_id = "inv_9d"  # Will be re-seeded to overdue
        self.baseline_critical_count = 0
        self.baseline_escalation = {}

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
                json={
                    "email": "admin@bibi.cars",
                    "password": "Jp3FS_7ZuE2bhHp7rFkJm9B9T_TeiHxu"
                },
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
    # RE-SEED TEST DATA
    # ═══════════════════════════════════════════════════════════════
    
    def reseed_test_invoice(self):
        """Find an unpaid invoice for testing"""
        print("\n" + "="*70)
        print("🔄 FIND UNPAID INVOICE FOR TESTING")
        print("="*70)
        
        if not self.admin_token:
            self.log("⚠️  Skipping - no admin token")
            return False
        
        headers = {"Authorization": f"Bearer {self.admin_token}"}
        
        # First, check if inv_9d exists and is unpaid
        try:
            resp = requests.get(
                f"{self.base_url}/api/invoices/{self.test_invoice_id}",
                headers=headers,
                timeout=10
            )
            
            if resp.status_code == 200:
                data = resp.json().get("data", {})
                current_status = data.get("status")
                self.log(f"Invoice {self.test_invoice_id} status: {current_status}")
                
                # If unpaid, use it
                if current_status in ["overdue", "pending", "sent", "draft"]:
                    self.log(f"✓ Using {self.test_invoice_id} (status: {current_status})")
                    return True
                else:
                    self.log(f"Invoice {self.test_invoice_id} is '{current_status}' (paid/cancelled)")
            else:
                self.log(f"Invoice {self.test_invoice_id} not found")
        except Exception as e:
            self.log(f"Error checking {self.test_invoice_id}: {e}")
        
        # Try to find any unpaid invoice from critical list
        try:
            resp = requests.get(
                f"{self.base_url}/api/invoice-reminders/critical?limit=10",
                headers=headers,
                timeout=10
            )
            if resp.status_code == 200:
                critical_invoices = resp.json()
                if critical_invoices and len(critical_invoices) > 0:
                    # Find first unpaid invoice
                    for inv in critical_invoices:
                        inv_id = inv.get("id")
                        inv_status = inv.get("status")
                        if inv_status in ["overdue", "pending", "sent", "draft"]:
                            self.test_invoice_id = inv_id
                            self.log(f"✓ Found unpaid invoice: {inv_id} (status: {inv_status})")
                            return True
        except Exception as e:
            self.log(f"Error finding critical invoices: {e}")
        
        # Try known invoice IDs
        for inv_id in ["inv_2d", "inv_4d", "inv_6d", "inv-test"]:
            try:
                resp = requests.get(
                    f"{self.base_url}/api/invoices/{inv_id}",
                    headers=headers,
                    timeout=10
                )
                if resp.status_code == 200:
                    data = resp.json().get("data", {})
                    status = data.get("status")
                    if status in ["overdue", "pending", "sent", "draft"]:
                        self.test_invoice_id = inv_id
                        self.log(f"✓ Found unpaid invoice: {inv_id} (status: {status})")
                        return True
            except:
                continue
        
        self.log("⚠️  No unpaid invoice found - will test with paid invoice (limited testing)")
        return False

    # ═══════════════════════════════════════════════════════════════
    # BASELINE MEASUREMENTS
    # ═══════════════════════════════════════════════════════════════
    
    def get_baseline_counts(self):
        """Get baseline counts before testing"""
        print("\n" + "="*70)
        print("📊 BASELINE MEASUREMENTS")
        print("="*70)
        
        if not self.admin_token:
            self.log("⚠️  Skipping baseline - no admin token")
            return False
        
        headers = {"Authorization": f"Bearer {self.admin_token}"}
        
        # Get critical invoices count
        try:
            resp = requests.get(
                f"{self.base_url}/api/invoice-reminders/critical",
                headers=headers,
                timeout=10
            )
            success, msg = self.check_response(resp, 200)
            if success:
                critical_invoices = resp.json()
                self.baseline_critical_count = len(critical_invoices)
                self.test(
                    "GET /api/invoice-reminders/critical (baseline)",
                    True,
                    f"Critical invoices count: {self.baseline_critical_count}"
                )
            else:
                self.test("GET /api/invoice-reminders/critical (baseline)", False, msg)
        except Exception as e:
            self.test("GET /api/invoice-reminders/critical (baseline)", False, f"Exception: {e}")
        
        # Get escalation summary
        try:
            resp = requests.get(
                f"{self.base_url}/api/invoice-reminders/escalation-summary",
                headers=headers,
                timeout=10
            )
            success, msg = self.check_response(resp, 200)
            if success:
                data = resp.json()
                self.baseline_escalation = {
                    "level1Count": data.get("level1Count", 0),
                    "level2Count": data.get("level2Count", 0),
                    "level3Count": data.get("level3Count", 0),
                    "criticalCount": data.get("criticalCount", 0),
                    "unpaidInvoices": data.get("unpaidInvoices", 0)
                }
                self.test(
                    "GET /api/invoice-reminders/escalation-summary (baseline)",
                    True,
                    f"Counts - L1: {self.baseline_escalation['level1Count']}, "
                    f"L2: {self.baseline_escalation['level2Count']}, "
                    f"L3: {self.baseline_escalation['level3Count']}, "
                    f"Critical: {self.baseline_escalation['criticalCount']}, "
                    f"Unpaid: {self.baseline_escalation['unpaidInvoices']}"
                )
            else:
                self.test("GET /api/invoice-reminders/escalation-summary (baseline)", False, msg)
        except Exception as e:
            self.test("GET /api/invoice-reminders/escalation-summary (baseline)", False, f"Exception: {e}")
        
        return True

    # ═══════════════════════════════════════════════════════════════
    # INVOICE CRUD TESTS
    # ═══════════════════════════════════════════════════════════════
    
    def test_get_invoice(self):
        """Test GET /api/invoices/{invoice_id}"""
        print("\n" + "="*70)
        print("📄 GET INVOICE")
        print("="*70)
        
        if not self.admin_token:
            self.log("⚠️  Skipping - no admin token")
            return
        
        headers = {"Authorization": f"Bearer {self.admin_token}"}
        
        # Test 1: Get existing invoice
        try:
            resp = requests.get(
                f"{self.base_url}/api/invoices/{self.test_invoice_id}",
                headers=headers,
                timeout=10
            )
            success, msg = self.check_response(resp, 200)
            if success:
                data = resp.json()
                has_success = data.get("success") == True
                has_data = "data" in data
                invoice_data = data.get("data", {})
                has_id = invoice_data.get("id") == self.test_invoice_id
                
                self.test(
                    f"GET /api/invoices/{self.test_invoice_id}",
                    has_success and has_data and has_id,
                    f"Invoice found - Status: {invoice_data.get('status')}, "
                    f"Customer: {invoice_data.get('customerId', 'N/A')}"
                )
            else:
                self.test(f"GET /api/invoices/{self.test_invoice_id}", False, msg)
        except Exception as e:
            self.test(f"GET /api/invoices/{self.test_invoice_id}", False, f"Exception: {e}")
        
        # Test 2: Get non-existent invoice (should return 404)
        try:
            resp = requests.get(
                f"{self.base_url}/api/invoices/inv_nonexistent_12345",
                headers=headers,
                timeout=10
            )
            success, msg = self.check_response(resp, 404)
            self.test(
                "GET /api/invoices/inv_nonexistent_12345 (404 expected)",
                success,
                f"Status: {resp.status_code}" if success else msg
            )
        except Exception as e:
            self.test("GET /api/invoices/inv_nonexistent_12345", False, f"Exception: {e}")

    # ═══════════════════════════════════════════════════════════════
    # MARK-PAID TESTS
    # ═══════════════════════════════════════════════════════════════
    
    def test_mark_paid(self):
        """Test PATCH /api/invoices/{invoice_id}/mark-paid"""
        print("\n" + "="*70)
        print("💰 MARK-PAID TESTS")
        print("="*70)
        
        if not self.admin_token:
            self.log("⚠️  Skipping - no admin token")
            return
        
        headers = {"Authorization": f"Bearer {self.admin_token}"}
        
        # Test 1: Mark invoice as paid
        try:
            resp = requests.patch(
                f"{self.base_url}/api/invoices/{self.test_invoice_id}/mark-paid",
                json={"method": "manual", "note": "Test payment"},
                headers=headers,
                timeout=10
            )
            success, msg = self.check_response(resp, 200)
            if success:
                data = resp.json()
                has_success = data.get("success") == True
                invoice = data.get("invoice", {})
                is_paid = invoice.get("status") == "paid"
                has_paid_at = "paidAt" in invoice
                
                self.test(
                    f"PATCH /api/invoices/{self.test_invoice_id}/mark-paid",
                    has_success and is_paid and has_paid_at,
                    f"Invoice marked as paid - Status: {invoice.get('status')}, "
                    f"Method: {invoice.get('paymentMethod')}, "
                    f"PaidBy: {invoice.get('paidBy', 'N/A')}"
                )
            else:
                self.test(f"PATCH /api/invoices/{self.test_invoice_id}/mark-paid", False, msg, critical=True)
        except Exception as e:
            self.test(f"PATCH /api/invoices/{self.test_invoice_id}/mark-paid", False, f"Exception: {e}", critical=True)
        
        # Test 2: Verify invoice no longer in critical list
        try:
            time.sleep(0.5)  # Brief pause for DB consistency
            resp = requests.get(
                f"{self.base_url}/api/invoice-reminders/critical",
                headers=headers,
                timeout=10
            )
            success, msg = self.check_response(resp, 200)
            if success:
                critical_invoices = resp.json()
                invoice_ids = [inv.get("id") for inv in critical_invoices]
                not_in_critical = self.test_invoice_id not in invoice_ids
                new_count = len(critical_invoices)
                
                self.test(
                    f"Invoice {self.test_invoice_id} removed from critical list",
                    not_in_critical,
                    f"Critical count: {self.baseline_critical_count} → {new_count} "
                    f"(expected decrease by 1)"
                )
            else:
                self.test("Verify invoice removed from critical list", False, msg)
        except Exception as e:
            self.test("Verify invoice removed from critical list", False, f"Exception: {e}")
        
        # Test 3: Verify escalation summary counts decreased
        try:
            resp = requests.get(
                f"{self.base_url}/api/invoice-reminders/escalation-summary",
                headers=headers,
                timeout=10
            )
            success, msg = self.check_response(resp, 200)
            if success:
                data = resp.json()
                new_unpaid = data.get("unpaidInvoices", 0)
                new_critical = data.get("criticalCount", 0)
                
                unpaid_decreased = new_unpaid < self.baseline_escalation.get("unpaidInvoices", 0)
                
                self.test(
                    "Escalation summary counts decreased after mark-paid",
                    unpaid_decreased,
                    f"Unpaid: {self.baseline_escalation.get('unpaidInvoices', 0)} → {new_unpaid}, "
                    f"Critical: {self.baseline_escalation.get('criticalCount', 0)} → {new_critical}"
                )
            else:
                self.test("Verify escalation summary decreased", False, msg)
        except Exception as e:
            self.test("Verify escalation summary decreased", False, f"Exception: {e}")
        
        # Test 4: Idempotency - mark-paid again on already-paid invoice
        try:
            resp = requests.patch(
                f"{self.base_url}/api/invoices/{self.test_invoice_id}/mark-paid",
                json={"method": "manual", "note": "Second attempt"},
                headers=headers,
                timeout=10
            )
            success, msg = self.check_response(resp, 200)
            if success:
                data = resp.json()
                has_success = data.get("success") == True
                already_paid = data.get("already_paid") == True
                
                self.test(
                    f"PATCH /api/invoices/{self.test_invoice_id}/mark-paid (idempotency)",
                    has_success and already_paid,
                    f"Idempotent response - already_paid: {already_paid}"
                )
            else:
                # Accept 4xx error as valid idempotency behavior
                is_4xx = 400 <= resp.status_code < 500
                self.test(
                    f"PATCH /api/invoices/{self.test_invoice_id}/mark-paid (idempotency)",
                    is_4xx,
                    f"Status: {resp.status_code} (4xx acceptable for idempotency)"
                )
        except Exception as e:
            self.test("mark-paid idempotency test", False, f"Exception: {e}")
        
        # Test 5: Mark-paid on non-existent invoice (should return 404)
        try:
            resp = requests.patch(
                f"{self.base_url}/api/invoices/inv_nonexistent_12345/mark-paid",
                json={"method": "manual"},
                headers=headers,
                timeout=10
            )
            success, msg = self.check_response(resp, 404)
            self.test(
                "PATCH /api/invoices/inv_nonexistent_12345/mark-paid (404 expected)",
                success,
                f"Status: {resp.status_code}" if success else msg
            )
        except Exception as e:
            self.test("mark-paid on non-existent invoice", False, f"Exception: {e}")

    # ═══════════════════════════════════════════════════════════════
    # SEND & CANCEL TESTS
    # ═══════════════════════════════════════════════════════════════
    
    def test_send_and_cancel(self):
        """Test PATCH /api/invoices/{invoice_id}/send and /cancel"""
        print("\n" + "="*70)
        print("📤 SEND & CANCEL TESTS")
        print("="*70)
        
        if not self.admin_token:
            self.log("⚠️  Skipping - no admin token")
            return
        
        headers = {"Authorization": f"Bearer {self.admin_token}"}
        
        # Find an unpaid invoice to test with (not the one we just marked as paid)
        test_invoice_for_send = None
        try:
            resp = requests.get(
                f"{self.base_url}/api/invoice-reminders/critical?limit=5",
                headers=headers,
                timeout=10
            )
            if resp.status_code == 200:
                critical_invoices = resp.json()
                for inv in critical_invoices:
                    if inv.get("id") != self.test_invoice_id and inv.get("status") in ["overdue", "pending", "draft"]:
                        test_invoice_for_send = inv.get("id")
                        break
        except:
            pass
        
        if not test_invoice_for_send:
            # Try other known invoice IDs
            for inv_id in ["inv_2d", "inv_4d", "inv_6d", "inv-test"]:
                try:
                    resp = requests.get(
                        f"{self.base_url}/api/invoices/{inv_id}",
                        headers=headers,
                        timeout=10
                    )
                    if resp.status_code == 200:
                        data = resp.json().get("data", {})
                        if data.get("status") in ["overdue", "pending", "draft"]:
                            test_invoice_for_send = inv_id
                            break
                except:
                    continue
        
        if not test_invoice_for_send:
            self.log("⚠️  No unpaid invoice found for send/cancel tests")
            return
        
        self.log(f"Using invoice {test_invoice_for_send} for send/cancel tests")
        
        # Test 1: Send invoice
        try:
            resp = requests.patch(
                f"{self.base_url}/api/invoices/{test_invoice_for_send}/send",
                headers=headers,
                timeout=10
            )
            success, msg = self.check_response(resp, 200)
            if success:
                data = resp.json()
                has_success = data.get("success") == True
                invoice = data.get("invoice", {})
                is_sent = invoice.get("status") in ["sent", "pending"]
                has_sent_at = "sentAt" in invoice
                
                self.test(
                    f"PATCH /api/invoices/{test_invoice_for_send}/send",
                    has_success and is_sent and has_sent_at,
                    f"Invoice sent - Status: {invoice.get('status')}, SentAt: {invoice.get('sentAt', 'N/A')[:19]}"
                )
            else:
                self.test(f"PATCH /api/invoices/{test_invoice_for_send}/send", False, msg)
        except Exception as e:
            self.test(f"PATCH /api/invoices/{test_invoice_for_send}/send", False, f"Exception: {e}")
        
        # Test 2: Cancel invoice
        try:
            resp = requests.patch(
                f"{self.base_url}/api/invoices/{test_invoice_for_send}/cancel",
                headers=headers,
                timeout=10
            )
            success, msg = self.check_response(resp, 200)
            if success:
                data = resp.json()
                has_success = data.get("success") == True
                invoice = data.get("invoice", {})
                is_cancelled = invoice.get("status") == "cancelled"
                has_cancelled_at = "cancelledAt" in invoice
                
                self.test(
                    f"PATCH /api/invoices/{test_invoice_for_send}/cancel",
                    has_success and is_cancelled and has_cancelled_at,
                    f"Invoice cancelled - Status: {invoice.get('status')}, CancelledAt: {invoice.get('cancelledAt', 'N/A')[:19]}"
                )
            else:
                self.test(f"PATCH /api/invoices/{test_invoice_for_send}/cancel", False, msg)
        except Exception as e:
            self.test(f"PATCH /api/invoices/{test_invoice_for_send}/cancel", False, f"Exception: {e}")
        
        # Test 3: Send on non-existent invoice (should return 404)
        try:
            resp = requests.patch(
                f"{self.base_url}/api/invoices/inv_nonexistent_12345/send",
                headers=headers,
                timeout=10
            )
            success, msg = self.check_response(resp, 404)
            self.test(
                "PATCH /api/invoices/inv_nonexistent_12345/send (404 expected)",
                success,
                f"Status: {resp.status_code}" if success else msg
            )
        except Exception as e:
            self.test("send on non-existent invoice", False, f"Exception: {e}")
        
        # Test 4: Cancel on non-existent invoice (should return 404)
        try:
            resp = requests.patch(
                f"{self.base_url}/api/invoices/inv_nonexistent_12345/cancel",
                headers=headers,
                timeout=10
            )
            success, msg = self.check_response(resp, 404)
            self.test(
                "PATCH /api/invoices/inv_nonexistent_12345/cancel (404 expected)",
                success,
                f"Status: {resp.status_code}" if success else msg
            )
        except Exception as e:
            self.test("cancel on non-existent invoice", False, f"Exception: {e}")

    # ═══════════════════════════════════════════════════════════════
    # MAIN TEST RUNNER
    # ═══════════════════════════════════════════════════════════════
    
    def run_all_tests(self):
        """Run all invoice reminders tests"""
        print("\n" + "="*70)
        print("BIBI CARS — INVOICE REMINDERS BACKEND TEST SUITE")
        print("="*70)
        print(f"Base URL: {self.base_url}")
        print("="*70)
        
        # Run test suites in order
        if not self.test_admin_login():
            print("\n❌ CRITICAL: Admin login failed - cannot proceed with tests")
            self.print_summary()
            return 1
        
        self.reseed_test_invoice()
        self.get_baseline_counts()
        self.test_get_invoice()
        self.test_mark_paid()
        self.test_send_and_cancel()
        
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
        print(f"Success rate: {(self.tests_passed/self.tests_run*100):.1f}%" if self.tests_run > 0 else "N/A")
        
        if self.backend_errors:
            print(f"\n⚠️  Backend 5xx errors detected: {len(self.backend_errors)}")
            for err in self.backend_errors[:5]:
                print(f"  - {err['endpoint']}: {err['status']} - {err['error'][:100]}")
        
        if self.failed_tests:
            print(f"\n❌ Failed tests ({len(self.failed_tests)}):")
            critical_failures = [ft for ft in self.failed_tests if ft.get("critical")]
            non_critical_failures = [ft for ft in self.failed_tests if not ft.get("critical")]
            
            if critical_failures:
                print("\n  CRITICAL FAILURES:")
                for ft in critical_failures:
                    print(f"  - {ft['test']}")
                    if ft['details']:
                        print(f"    {ft['details'][:150]}")
            
            if non_critical_failures:
                print("\n  NON-CRITICAL FAILURES:")
                for ft in non_critical_failures[:10]:
                    print(f"  - {ft['test']}")
                    if ft['details']:
                        print(f"    {ft['details'][:150]}")
        
        print("="*70)


def main():
    tester = InvoiceRemindersAPITester()
    exit_code = tester.run_all_tests()
    sys.exit(exit_code)


if __name__ == "__main__":
    main()
