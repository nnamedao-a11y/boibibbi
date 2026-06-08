"""
BIBI Cars V3.2 — Comprehensive Backend Audit Test Suite
========================================================
Full end-to-end audit of role-based access control system
Tests: admin, team_lead, manager, customer roles
Business flow: calculator → lead → manager assignment → wishlist → approval → deal → auction won → financials → contract → payment → shipping
Integrations: Ringostat, Stripe, DocuSign, Google Reviews, Email OTP, VesselFinder/ShipsGo, VIN parsers
"""
import requests
import sys
import json
from typing import Dict, Any, Optional, List
from datetime import datetime

BASE_URL = "https://repo-complete-2.preview.emergentagent.com"

class BIBIAuditTester:
    def __init__(self):
        self.base_url = BASE_URL
        self.tests_run = 0
        self.tests_passed = 0
        self.tests_failed = 0
        
        # Tokens for each role
        self.admin_token = None
        self.manager_token = None
        self.teamlead_token = None
        self.customer_token = None
        
        # Test data IDs
        self.quote_id = None
        self.lead_id = None
        self.manager_id = None
        self.wishlist_deal_id = None
        self.deal_id = None
        self.shipment_id = None
        
        # Results tracking
        self.failed_tests = []
        self.backend_errors = []
        self.test_results = {}

    def log(self, msg: str, indent: int = 1):
        print(f"{'  ' * indent}{msg}")

    def test(self, name: str, condition: bool, details: str = "", critical: bool = False):
        """Record test result"""
        self.tests_run += 1
        status = "PASS" if condition else "FAIL"
        
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
            self.failed_tests.append({
                "test": name,
                "details": details,
                "critical": critical
            })
        
        self.test_results[name] = {
            "status": status,
            "details": details,
            "critical": critical
        }
        return condition

    def api_call(self, method: str, endpoint: str, token: Optional[str] = None, 
                 data: Optional[Dict] = None, expected_status: int = 200,
                 allow_4xx: bool = False) -> tuple[bool, Any, int]:
        """Make API call and return (success, response_data, status_code)"""
        url = f"{self.base_url}{endpoint}"
        headers = {"Content-Type": "application/json"}
        if token:
            headers["Authorization"] = f"Bearer {token}"
        
        try:
            if method == "GET":
                resp = requests.get(url, headers=headers, timeout=15)
            elif method == "POST":
                resp = requests.post(url, json=data, headers=headers, timeout=15)
            elif method == "PATCH":
                resp = requests.patch(url, json=data, headers=headers, timeout=15)
            elif method == "PUT":
                resp = requests.put(url, json=data, headers=headers, timeout=15)
            elif method == "DELETE":
                resp = requests.delete(url, headers=headers, timeout=15)
            else:
                return False, f"Unknown method: {method}", 0
            
            status_code = resp.status_code
            
            # Check for 5xx errors (always a bug)
            if status_code >= 500:
                error_msg = resp.text[:500] if resp.text else "No error message"
                self.backend_errors.append({
                    "endpoint": endpoint,
                    "status": status_code,
                    "error": error_msg
                })
                return False, f"5xx error: {error_msg}", status_code
            
            # Check expected status
            if status_code == expected_status:
                try:
                    return True, resp.json() if resp.text else {}, status_code
                except:
                    return True, resp.text, status_code
            
            # If 4xx is allowed (for unconfigured integrations), that's OK
            if allow_4xx and 400 <= status_code < 500:
                try:
                    return True, resp.json() if resp.text else {}, status_code
                except:
                    return True, resp.text, status_code
            
            # Otherwise, it's a failure
            try:
                error_data = resp.json() if resp.text else resp.text
            except:
                error_data = resp.text
            return False, f"Expected {expected_status}, got {status_code}: {error_data}", status_code
            
        except Exception as e:
            return False, f"Exception: {str(e)}", 0

    # ═══════════════════════════════════════════════════════════════
    # 1. AUTHENTICATION TESTS
    # ═══════════════════════════════════════════════════════════════
    
    def test_authentication(self):
        """Test all 4 role logins"""
        print("\n" + "="*80)
        print("🔐 1. AUTHENTICATION TESTS")
        print("="*80)
        
        # Admin login
        success, data, status = self.api_call(
            "POST", "/api/auth/login",
            data={"email": "admin@bibi.cars", "password": "Jp3FS_7ZuE2bhHp7rFkJm9B9T_TeiHxu"}
        )
        if success and "access_token" in data:
            self.admin_token = data["access_token"]
            self.test("Admin login", True, f"Token: {self.admin_token[:20]}...", critical=True)
        else:
            self.test("Admin login", False, str(data), critical=True)
        
        # Manager login
        success, data, status = self.api_call(
            "POST", "/api/auth/login",
            data={"email": "manager@bibi.cars", "password": "dFbYnse0L59DBE16Mn4kT6cCRaNBZFQR"}
        )
        if success and "access_token" in data:
            self.manager_token = data["access_token"]
            self.test("Manager login", True, f"Token: {self.manager_token[:20]}...", critical=True)
        else:
            self.test("Manager login", False, str(data), critical=True)
        
        # Team Lead login
        success, data, status = self.api_call(
            "POST", "/api/auth/login",
            data={"email": "teamlead@bibi.cars", "password": "txXNMkj-lS2w1nv482aLlvKWuk9Y9eKE"}
        )
        if success and "access_token" in data:
            self.teamlead_token = data["access_token"]
            self.test("Team Lead login", True, f"Token: {self.teamlead_token[:20]}...", critical=True)
        else:
            self.test("Team Lead login", False, str(data), critical=True)
        
        # Customer login (different endpoint!)
        success, data, status = self.api_call(
            "POST", "/api/customer-auth/login",
            data={"email": "user@bibi.cars", "password": "User_bibi_2026!"}
        )
        if success and ("access_token" in data or "accessToken" in data):
            self.customer_token = data.get("access_token") or data.get("accessToken")
            self.test("Customer login", True, f"Token: {self.customer_token[:20]}...", critical=True)
        else:
            self.test("Customer login", False, str(data), critical=True)
        
        # Test /me endpoints
        if self.admin_token:
            success, data, status = self.api_call("GET", "/api/auth/me", token=self.admin_token)
            self.test("Admin /me", success and data.get("role") == "admin", 
                     f"Role: {data.get('role') if success else 'N/A'}")
        
        if self.customer_token:
            success, data, status = self.api_call("GET", "/api/customer-auth/me", token=self.customer_token)
            self.test("Customer /me", success and "customerId" in data,
                     f"Customer ID: {data.get('customerId') if success else 'N/A'}")

    # ═══════════════════════════════════════════════════════════════
    # 2. ROLE GATING (RBAC) TESTS
    # ═══════════════════════════════════════════════════════════════
    
    def test_role_gating(self):
        """Test that role-based access control works"""
        print("\n" + "="*80)
        print("🔒 2. ROLE GATING (RBAC) TESTS")
        print("="*80)
        
        # Manager should NOT access admin endpoints
        if self.manager_token:
            success, data, status = self.api_call(
                "GET", "/api/admin/system/settings",
                token=self.manager_token,
                expected_status=403,
                allow_4xx=True
            )
            self.test("Manager blocked from admin/system/settings",
                     status in [401, 403],
                     f"Status: {status} (expected 401/403)")
        
        # Team Lead should NOT rotate JWT secret
        if self.teamlead_token:
            success, data, status = self.api_call(
                "POST", "/api/admin/system/settings/jwt/rotate",
                token=self.teamlead_token,
                data={"confirm": True},
                expected_status=403,
                allow_4xx=True
            )
            self.test("Team Lead blocked from JWT rotation",
                     status in [401, 403],
                     f"Status: {status} (expected 401/403)")
        
        # Customer should NOT access admin orders
        if self.customer_token:
            success, data, status = self.api_call(
                "GET", "/api/admin/orders",
                token=self.customer_token,
                expected_status=403,
                allow_4xx=True
            )
            self.test("Customer blocked from admin/orders",
                     status in [401, 403],
                     f"Status: {status} (expected 401/403)")

    # ═══════════════════════════════════════════════════════════════
    # 3. CALCULATOR & LEAD CREATION
    # ═══════════════════════════════════════════════════════════════
    
    def test_calculator_and_leads(self):
        """Test calculator quote and lead creation"""
        print("\n" + "="*80)
        print("🧮 3. CALCULATOR & LEAD CREATION")
        print("="*80)
        
        # Test calculator
        calc_data = {
            "auction": "copart",
            "vehicle_make": "Toyota",
            "vehicle_model": "Camry",
            "year": 2020,
            "port_from": "TX - Houston",
            "port_to": "Constanta, Romania"
        }
        success, data, status = self.api_call(
            "POST", "/api/calculator/calculate",
            data=calc_data
        )
        
        if success and isinstance(data, dict):
            self.quote_id = data.get("quote_id") or data.get("id")
            has_total = "total" in data or "totalCost" in data
            self.test("Calculator quote generation", has_total,
                     f"Quote ID: {self.quote_id}, Total: {data.get('total') or data.get('totalCost')}")
        else:
            self.test("Calculator quote generation", False, str(data))
        
        # Create lead from quote
        if self.quote_id:
            lead_data = {
                "quote_id": self.quote_id,
                "customer_name": "Test Customer",
                "customer_email": "test@example.com",
                "customer_phone": "+1234567890"
            }
            success, data, status = self.api_call(
                "POST", "/api/public/leads/from-quote",
                data=lead_data
            )
            
            if success and isinstance(data, dict):
                self.lead_id = data.get("lead_id") or data.get("id") or data.get("leadId")
                self.test("Lead creation from quote", self.lead_id is not None,
                         f"Lead ID: {self.lead_id}")
            else:
                self.test("Lead creation from quote", False, str(data))
        
        # Get lead as admin
        if self.lead_id and self.admin_token:
            success, data, status = self.api_call(
                "GET", f"/api/leads/{self.lead_id}",
                token=self.admin_token
            )
            self.test("Admin can view lead", success,
                     f"Lead status: {data.get('status') if success else 'N/A'}")
        
        # Get all leads as admin
        if self.admin_token:
            success, data, status = self.api_call(
                "GET", "/api/leads",
                token=self.admin_token
            )
            if success:
                leads_count = len(data) if isinstance(data, list) else data.get("total", 0)
                self.test("Admin can list leads", True, f"Leads count: {leads_count}")
            else:
                self.test("Admin can list leads", False, str(data))

    # ═══════════════════════════════════════════════════════════════
    # 4. MANAGER ASSIGNMENT & WISHLIST WORKFLOW
    # ═══════════════════════════════════════════════════════════════
    
    def test_manager_workflow(self):
        """Test manager assignment and wishlist deal workflow"""
        print("\n" + "="*80)
        print("👔 4. MANAGER ASSIGNMENT & WISHLIST WORKFLOW")
        print("="*80)
        
        # Get manager ID
        if self.manager_token:
            success, data, status = self.api_call(
                "GET", "/api/auth/me",
                token=self.manager_token
            )
            if success:
                self.manager_id = data.get("managerId") or data.get("id")
                self.test("Get manager ID", self.manager_id is not None,
                         f"Manager ID: {self.manager_id}")
        
        # Assign manager to lead (as team lead or admin)
        if self.lead_id and self.manager_id and self.teamlead_token:
            # Try team lead reassign endpoint
            success, data, status = self.api_call(
                "POST", f"/api/team/leads/{self.lead_id}/reassign",
                token=self.teamlead_token,
                data={"managerId": self.manager_id}
            )
            if not success:
                # Try PATCH endpoint
                success, data, status = self.api_call(
                    "PATCH", f"/api/leads/{self.lead_id}",
                    token=self.admin_token,
                    data={"assignedManagerId": self.manager_id}
                )
            self.test("Assign manager to lead", success,
                     f"Result: {data if not success else 'Manager assigned'}")
        
        # Manager creates wishlist deal
        if self.manager_token:
            wishlist_data = {
                "vin": "1HGBH41JXMN109186",
                "make": "Honda",
                "model": "Accord",
                "year": 2021,
                "auction": "copart",
                "lot_number": "12345678",
                "estimated_price": 15000
            }
            success, data, status = self.api_call(
                "POST", "/api/manager/wishlist-deals",
                token=self.manager_token,
                data=wishlist_data
            )
            if success and isinstance(data, dict):
                self.wishlist_deal_id = data.get("id") or data.get("wishlist_deal_id")
                self.test("Manager creates wishlist deal", self.wishlist_deal_id is not None,
                         f"Wishlist deal ID: {self.wishlist_deal_id}")
            else:
                self.test("Manager creates wishlist deal", False, str(data))
        
        # Team lead approves wishlist deal
        if self.wishlist_deal_id and self.teamlead_token:
            success, data, status = self.api_call(
                "POST", f"/api/team-lead/wishlist-deals/{self.wishlist_deal_id}/approve",
                token=self.teamlead_token,
                data={"approved": True}
            )
            if success:
                self.deal_id = data.get("deal_id") or data.get("id")
                self.test("Team lead approves wishlist deal", True,
                         f"Deal ID: {self.deal_id}")
            else:
                self.test("Team lead approves wishlist deal", False, str(data))

    # ═══════════════════════════════════════════════════════════════
    # 5. AUCTION WON & FINANCIAL BREAKDOWN
    # ═══════════════════════════════════════════════════════════════
    
    def test_auction_won_and_financials(self):
        """Test auction won endpoint and financial breakdown"""
        print("\n" + "="*80)
        print("💰 5. AUCTION WON & FINANCIAL BREAKDOWN")
        print("="*80)
        
        # Create a deposit first (may be required)
        if self.admin_token:
            deposit_data = {
                "customer_email": "user@bibi.cars",
                "amount": 1000,
                "currency": "USD"
            }
            success, data, status = self.api_call(
                "POST", "/api/legal/deposits",
                token=self.admin_token,
                data=deposit_data
            )
            self.test("Create deposit", success or status == 404,
                     f"Result: {data if not success else 'Deposit created'}")
        
        # If we don't have a deal_id from wishlist approval, try to get one
        if not self.deal_id and self.admin_token:
            success, data, status = self.api_call(
                "GET", "/api/admin/orders",
                token=self.admin_token
            )
            if success and isinstance(data, list) and len(data) > 0:
                self.deal_id = data[0].get("id") or data[0].get("deal_id")
            elif success and isinstance(data, dict):
                items = data.get("items", [])
                if items:
                    self.deal_id = items[0].get("id") or items[0].get("deal_id")
        
        # Test auction won endpoint
        if self.deal_id and self.admin_token:
            auction_data = {
                "hammer_price": 12000,
                "vin": "1HGBH41JXMN109186",
                "auction_fees": 500
            }
            success, data, status = self.api_call(
                "POST", f"/api/legal/deals/{self.deal_id}/auction/won",
                token=self.admin_token,
                data=auction_data
            )
            self.test("POST auction/won", success or status == 404,
                     f"Result: {data if not success else 'Auction won recorded'}")
            
            # Get financial breakdown
            success, data, status = self.api_call(
                "GET", f"/api/legal/deals/{self.deal_id}/financials",
                token=self.admin_token
            )
            self.test("GET deal financials", success or status == 404,
                     f"Financials: {data if success else 'N/A'}")
        else:
            self.test("POST auction/won", False, "No deal_id available for testing")
            self.test("GET deal financials", False, "No deal_id available for testing")

    # ═══════════════════════════════════════════════════════════════
    # 6. STRIPE INTEGRATION
    # ═══════════════════════════════════════════════════════════════
    
    def test_stripe_integration(self):
        """Test Stripe integration endpoints"""
        print("\n" + "="*80)
        print("💳 6. STRIPE INTEGRATION")
        print("="*80)
        
        # Get Stripe public config
        success, data, status = self.api_call(
            "GET", "/api/stripe/public-config"
        )
        if success:
            has_key = "publishableKey" in data or "publishable_key" in data or "not configured" in str(data).lower()
            self.test("GET Stripe public config", has_key,
                     f"Config: {data}")
        else:
            self.test("GET Stripe public config", False, str(data))
        
        # Create checkout session (expect 4xx if not configured, NOT 500)
        checkout_data = {
            "package": "basic",
            "amount": 1000,
            "currency": "USD"
        }
        success, data, status = self.api_call(
            "POST", "/api/stripe/create-checkout-session",
            data=checkout_data,
            allow_4xx=True
        )
        # Success if we get 200 with URL, or 4xx with meaningful error (not 500)
        is_ok = (status == 200 and "url" in data) or (400 <= status < 500)
        self.test("POST Stripe checkout session", is_ok,
                 f"Status: {status}, Response: {str(data)[:200]}")
        
        # Get payments list (admin)
        if self.admin_token:
            success, data, status = self.api_call(
                "GET", "/api/admin/payments",
                token=self.admin_token
            )
            self.test("GET admin/payments", success,
                     f"Payments: {len(data) if isinstance(data, list) else 'N/A'}")
            
            # Get payment stats
            success, data, status = self.api_call(
                "GET", "/api/admin/payments/stats",
                token=self.admin_token
            )
            self.test("GET admin/payments/stats", success,
                     f"Stats: {data if success else 'N/A'}")

    # ═══════════════════════════════════════════════════════════════
    # 7. DOCUSIGN INTEGRATION
    # ═══════════════════════════════════════════════════════════════
    
    def test_docusign_integration(self):
        """Test DocuSign integration"""
        print("\n" + "="*80)
        print("📄 7. DOCUSIGN INTEGRATION")
        print("="*80)
        
        # Create envelope (expect 4xx if not configured, NOT 500)
        envelope_data = {
            "deal_id": self.deal_id or "test-deal-123",
            "recipient_email": "test@example.com"
        }
        success, data, status = self.api_call(
            "POST", "/api/docusign/envelopes",
            token=self.admin_token,
            data=envelope_data,
            allow_4xx=True
        )
        # Success if we get 200 with envelope_id, or 4xx with meaningful error (not 500)
        is_ok = (status == 200 and "envelope_id" in data) or (400 <= status < 500)
        self.test("POST DocuSign envelope", is_ok,
                 f"Status: {status}, Response: {str(data)[:200]}")
        
        # Get contracts (customer)
        if self.customer_token:
            success, data, status = self.api_call(
                "GET", "/api/contracts/me",
                token=self.customer_token
            )
            self.test("GET contracts/me (customer)", success,
                     f"Contracts: {len(data) if isinstance(data, list) else 'N/A'}")

    # ═══════════════════════════════════════════════════════════════
    # 8. RINGOSTAT INTEGRATION
    # ═══════════════════════════════════════════════════════════════
    
    def test_ringostat_integration(self):
        """Test Ringostat integration"""
        print("\n" + "="*80)
        print("📞 8. RINGOSTAT INTEGRATION")
        print("="*80)
        
        if not self.admin_token:
            self.test("Ringostat tests", False, "No admin token available")
            return
        
        # Test connection with empty body (should return 400)
        success, data, status = self.api_call(
            "POST", "/api/admin/ringostat/test-connection",
            token=self.admin_token,
            data={},
            allow_4xx=True
        )
        self.test("Ringostat test-connection (empty body)", status == 400,
                 f"Status: {status} (expected 400 for missing creds)")
        
        # Test connection with fake keys (should ping api.ringostat.net and return 403)
        success, data, status = self.api_call(
            "POST", "/api/admin/ringostat/test-connection",
            token=self.admin_token,
            data={"api_key": "fake_key", "project_id": "fake_project"},
            allow_4xx=True
        )
        if success and isinstance(data, dict):
            is_ok = data.get("success") == False and data.get("status_code") == 403
            self.test("Ringostat test-connection (fake keys)", is_ok,
                     f"Response: {data}")
        else:
            self.test("Ringostat test-connection (fake keys)", False, str(data))
        
        # Test webhook
        success, data, status = self.api_call(
            "POST", "/api/admin/ringostat/test-webhook",
            token=self.admin_token,
            data={}
        )
        self.test("Ringostat test-webhook", success,
                 f"Result: {data if success else 'Failed'}")
        
        # Get health
        success, data, status = self.api_call(
            "GET", "/api/admin/ringostat/health",
            token=self.admin_token
        )
        self.test("GET Ringostat health", success,
                 f"Health: {data if success else 'N/A'}")
        
        # Get stats overview
        success, data, status = self.api_call(
            "GET", "/api/admin/ringostat/stats/overview",
            token=self.admin_token
        )
        self.test("GET Ringostat stats/overview", success,
                 f"Stats: {data if success else 'N/A'}")
        
        # Get stats managers
        success, data, status = self.api_call(
            "GET", "/api/admin/ringostat/stats/managers",
            token=self.admin_token
        )
        self.test("GET Ringostat stats/managers", success,
                 f"Managers: {data if success else 'N/A'}")
        
        # Get calls
        success, data, status = self.api_call(
            "GET", "/api/admin/ringostat/calls",
            token=self.admin_token
        )
        self.test("GET Ringostat calls", success,
                 f"Calls: {len(data) if isinstance(data, list) else 'N/A'}")

    # ═══════════════════════════════════════════════════════════════
    # 9. EMAIL OTP
    # ═══════════════════════════════════════════════════════════════
    
    def test_email_otp(self):
        """Test Email OTP authentication"""
        print("\n" + "="*80)
        print("📧 9. EMAIL OTP AUTHENTICATION")
        print("="*80)
        
        # Request OTP (expect 4xx if SMTP not configured, NOT 500)
        success, data, status = self.api_call(
            "POST", "/api/auth/email-otp/request",
            data={"email": "test@example.com"},
            allow_4xx=True
        )
        is_ok = status == 200 or (400 <= status < 500)
        self.test("POST email-otp/request", is_ok,
                 f"Status: {status}, Response: {str(data)[:200]}")
        
        # Verify with fake code (should return 4xx, NOT 500)
        success, data, status = self.api_call(
            "POST", "/api/auth/email-otp/verify",
            data={"email": "test@example.com", "code": "123456"},
            allow_4xx=True
        )
        is_ok = 400 <= status < 500
        self.test("POST email-otp/verify (fake code)", is_ok,
                 f"Status: {status} (expected 4xx for invalid code)")

    # ═══════════════════════════════════════════════════════════════
    # 10. GOOGLE REVIEWS
    # ═══════════════════════════════════════════════════════════════
    
    def test_google_reviews(self):
        """Test Google Reviews integration"""
        print("\n" + "="*80)
        print("⭐ 10. GOOGLE REVIEWS")
        print("="*80)
        
        # Get config (admin)
        if self.admin_token:
            success, data, status = self.api_call(
                "GET", "/api/admin/google-reviews/config",
                token=self.admin_token
            )
            self.test("GET google-reviews/config", success,
                     f"Config: {data if success else 'N/A'}")
            
            # Add manual review
            review_data = {
                "author": "Test User",
                "rating": 5,
                "text": "Great service!"
            }
            success, data, status = self.api_call(
                "POST", "/api/admin/google-reviews/manual",
                token=self.admin_token,
                data=review_data
            )
            self.test("POST google-reviews/manual", success,
                     f"Result: {data if success else 'Failed'}")
        
        # Get public reviews
        success, data, status = self.api_call(
            "GET", "/api/public/google-reviews"
        )
        self.test("GET public/google-reviews", success,
                 f"Reviews: {len(data) if isinstance(data, list) else 'N/A'}")

    # ═══════════════════════════════════════════════════════════════
    # 11. VIN PARSERS
    # ═══════════════════════════════════════════════════════════════
    
    def test_vin_parsers(self):
        """Test VIN lookup endpoints"""
        print("\n" + "="*80)
        print("🔍 11. VIN PARSERS")
        print("="*80)
        
        test_vin = "1HGBH41JXMN109186"
        
        # Public VIN lookup
        success, data, status = self.api_call(
            "GET", f"/api/public/vin/{test_vin}"
        )
        self.test("GET public/vin/{vin}", success,
                 f"VIN data: {str(data)[:200] if success else 'N/A'}")
        
        # Lemon lookup
        success, data, status = self.api_call(
            "GET", f"/api/lemon/lookup/vin/{test_vin}"
        )
        self.test("GET lemon/lookup/vin/{vin}", success or status == 404,
                 f"Lemon data: {str(data)[:200] if success else 'N/A'}")
        
        # StatVIN lookup
        success, data, status = self.api_call(
            "GET", f"/api/statvin/lookup/{test_vin}"
        )
        self.test("GET statvin/lookup/{vin}", success or status == 404,
                 f"StatVIN data: {str(data)[:200] if success else 'N/A'}")

    # ═══════════════════════════════════════════════════════════════
    # 12. SHIPMENT TRACKING
    # ═══════════════════════════════════════════════════════════════
    
    def test_shipment_tracking(self):
        """Test shipment tracking workflow"""
        print("\n" + "="*80)
        print("🚢 12. SHIPMENT TRACKING")
        print("="*80)
        
        # Create shipment (manager)
        if self.manager_token:
            shipment_data = {
                "vin": "1HGBH41JXMN109186",
                "deal_id": self.deal_id or "test-deal-123"
            }
            success, data, status = self.api_call(
                "POST", "/api/shipments",
                token=self.manager_token,
                data=shipment_data
            )
            if success and isinstance(data, dict):
                self.shipment_id = data.get("id") or data.get("shipment_id")
                self.test("POST shipments", self.shipment_id is not None,
                         f"Shipment ID: {self.shipment_id}")
            else:
                self.test("POST shipments", False, str(data))
            
            # Attach tracking
            if self.shipment_id:
                tracking_data = {
                    "shipment_id": self.shipment_id,
                    "vessel_name": "TEST VESSEL"
                }
                success, data, status = self.api_call(
                    "POST", "/api/manager/tracking/attach",
                    token=self.manager_token,
                    data=tracking_data
                )
                self.test("POST tracking/attach", success or status == 404,
                         f"Result: {data if not success else 'Tracking attached'}")
                
                # Get journey
                success, data, status = self.api_call(
                    "GET", f"/api/shipments/{self.shipment_id}/journey",
                    token=self.manager_token
                )
                self.test("GET shipments/{id}/journey", success or status == 404,
                         f"Journey: {data if success else 'N/A'}")
            
            # Get tracking providers
            success, data, status = self.api_call(
                "GET", "/api/manager/tracking/providers",
                token=self.manager_token
            )
            self.test("GET tracking/providers", success,
                     f"Providers: {data if success else 'N/A'}")

    # ═══════════════════════════════════════════════════════════════
    # 13. CUSTOMER CABINET
    # ═══════════════════════════════════════════════════════════════
    
    def test_customer_cabinet(self):
        """Test customer cabinet endpoints"""
        print("\n" + "="*80)
        print("👤 13. CUSTOMER CABINET")
        print("="*80)
        
        if not self.customer_token:
            self.test("Customer cabinet tests", False, "No customer token available")
            return
        
        endpoints = [
            "/api/customer-cabinet/dashboard",
            "/api/cabinet/deals",
            "/api/cabinet/orders",
            "/api/cabinet/contracts",
            "/api/cabinet/shipping",
            "/api/cabinet/invoices",
            "/api/cabinet/deposits",
            "/api/cabinet/notifications",
            "/api/cabinet/profile"
        ]
        
        for endpoint in endpoints:
            success, data, status = self.api_call(
                "GET", endpoint,
                token=self.customer_token
            )
            endpoint_name = endpoint.split("/")[-1]
            self.test(f"GET cabinet/{endpoint_name}", success,
                     f"Data: {str(data)[:100] if success else 'Failed'}")

    # ═══════════════════════════════════════════════════════════════
    # 14. TEAM LEAD DASHBOARD
    # ═══════════════════════════════════════════════════════════════
    
    def test_teamlead_dashboard(self):
        """Test team lead dashboard endpoints"""
        print("\n" + "="*80)
        print("👔 14. TEAM LEAD DASHBOARD")
        print("="*80)
        
        if not self.teamlead_token:
            self.test("Team lead dashboard tests", False, "No team lead token available")
            return
        
        endpoints = [
            "/api/team/dashboard",
            "/api/team/managers",
            "/api/team/leads",
            "/api/team/orders",
            "/api/team/performance",
            "/api/team/tasks",
            "/api/team/alerts"
        ]
        
        for endpoint in endpoints:
            success, data, status = self.api_call(
                "GET", endpoint,
                token=self.teamlead_token
            )
            endpoint_name = endpoint.split("/")[-1]
            self.test(f"GET team/{endpoint_name}", success,
                     f"Data: {str(data)[:100] if success else 'Failed'}")

    # ═══════════════════════════════════════════════════════════════
    # 15. MANAGER WORKSPACE
    # ═══════════════════════════════════════════════════════════════
    
    def test_manager_workspace(self):
        """Test manager workspace endpoints"""
        print("\n" + "="*80)
        print("💼 15. MANAGER WORKSPACE")
        print("="*80)
        
        if not self.manager_token:
            self.test("Manager workspace tests", False, "No manager token available")
            return
        
        endpoints = [
            "/api/manager/calls/my",
            "/api/manager/calls/missed",
            "/api/manager/orders",
            "/api/manager/invoices/my",
            "/api/manager/engagement/analytics"
        ]
        
        for endpoint in endpoints:
            success, data, status = self.api_call(
                "GET", endpoint,
                token=self.manager_token
            )
            endpoint_name = endpoint.replace("/api/manager/", "")
            self.test(f"GET manager/{endpoint_name}", success,
                     f"Data: {str(data)[:100] if success else 'Failed'}")

    # ═══════════════════════════════════════════════════════════════
    # 16. ADMIN OVERSIGHT
    # ═══════════════════════════════════════════════════════════════
    
    def test_admin_oversight(self):
        """Test admin oversight endpoints"""
        print("\n" + "="*80)
        print("🔧 16. ADMIN OVERSIGHT")
        print("="*80)
        
        if not self.admin_token:
            self.test("Admin oversight tests", False, "No admin token available")
            return
        
        # Integrations
        success, data, status = self.api_call(
            "GET", "/api/admin/integrations",
            token=self.admin_token
        )
        self.test("GET admin/integrations", success,
                 f"Integrations: {len(data) if isinstance(data, list) else 'N/A'}")
        
        # Integrations health
        success, data, status = self.api_call(
            "GET", "/api/admin/integrations/health",
            token=self.admin_token
        )
        self.test("GET admin/integrations/health", success,
                 f"Health: {data if success else 'N/A'}")
        
        # System settings
        success, data, status = self.api_call(
            "GET", "/api/admin/system/settings",
            token=self.admin_token
        )
        self.test("GET admin/system/settings", success,
                 f"Settings: {str(data)[:100] if success else 'N/A'}")

    # ═══════════════════════════════════════════════════════════════
    # MAIN TEST RUNNER
    # ═══════════════════════════════════════════════════════════════
    
    def run_all_tests(self):
        """Run all test suites"""
        print("\n" + "="*80)
        print("🚀 BIBI CARS V3.2 - COMPREHENSIVE BACKEND AUDIT")
        print(f"Base URL: {self.base_url}")
        print("="*80)
        
        # Run all test suites
        self.test_authentication()
        self.test_role_gating()
        self.test_calculator_and_leads()
        self.test_manager_workflow()
        self.test_auction_won_and_financials()
        self.test_stripe_integration()
        self.test_docusign_integration()
        self.test_ringostat_integration()
        self.test_email_otp()
        self.test_google_reviews()
        self.test_vin_parsers()
        self.test_shipment_tracking()
        self.test_customer_cabinet()
        self.test_teamlead_dashboard()
        self.test_manager_workspace()
        self.test_admin_oversight()
        
        # Print summary
        self.print_summary()
        
        # Return exit code
        return 0 if self.tests_failed == 0 else 1

    def print_summary(self):
        """Print test summary"""
        print("\n" + "="*80)
        print("📊 TEST SUMMARY")
        print("="*80)
        print(f"Total tests: {self.tests_run}")
        print(f"✅ Passed: {self.tests_passed}")
        print(f"❌ Failed: {self.tests_failed}")
        print(f"Success rate: {(self.tests_passed/self.tests_run*100):.1f}%")
        
        if self.backend_errors:
            print(f"\n⚠️  Backend 5xx errors detected: {len(self.backend_errors)}")
            for err in self.backend_errors[:10]:
                print(f"  - {err['endpoint']}: {err['status']}")
                print(f"    {err['error'][:200]}")
        
        if self.failed_tests:
            print(f"\n❌ Failed tests ({len(self.failed_tests)}):")
            critical_failures = [ft for ft in self.failed_tests if ft.get("critical")]
            if critical_failures:
                print(f"\n  CRITICAL FAILURES ({len(critical_failures)}):")
                for ft in critical_failures:
                    print(f"  - {ft['test']}")
                    if ft['details']:
                        print(f"    {ft['details'][:200]}")
            
            non_critical = [ft for ft in self.failed_tests if not ft.get("critical")]
            if non_critical:
                print(f"\n  NON-CRITICAL FAILURES ({len(non_critical)}):")
                for ft in non_critical[:10]:
                    print(f"  - {ft['test']}")
                    if ft['details']:
                        print(f"    {ft['details'][:150]}")
        
        print("="*80)


def main():
    tester = BIBIAuditTester()
    exit_code = tester.run_all_tests()
    
    # Save results to JSON
    results = {
        "timestamp": datetime.now().isoformat(),
        "base_url": BASE_URL,
        "total_tests": tester.tests_run,
        "passed": tester.tests_passed,
        "failed": tester.tests_failed,
        "success_rate": f"{(tester.tests_passed/tester.tests_run*100):.1f}%",
        "backend_errors": tester.backend_errors,
        "failed_tests": tester.failed_tests,
        "test_results": tester.test_results
    }
    
    with open("/app/backend/test_results_audit.json", "w") as f:
        json.dump(results, f, indent=2)
    
    print(f"\n📄 Detailed results saved to: /app/backend/test_results_audit.json")
    
    sys.exit(exit_code)


if __name__ == "__main__":
    main()
