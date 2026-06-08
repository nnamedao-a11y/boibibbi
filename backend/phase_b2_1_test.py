"""
BIBI Cars Phase B2.1 — Operational Fixes Test Suite
====================================================
Tests the two parked issues from Phase B2:
1. /api/auth/login returning 500 (should be fixed)
2. /api/public/vehicles price_min/price_max filters (strict mode implementation)

Test against: https://full-deployment-2.preview.emergentagent.com
"""
import requests
import sys
from typing import Dict, Any, Optional

BASE_URL = "https://full-deployment-2.preview.emergentagent.com"

class PhaseB21Tester:
    def __init__(self):
        self.base_url = BASE_URL
        self.tests_run = 0
        self.tests_passed = 0
        self.tests_failed = 0
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

    # ═══════════════════════════════════════════════════════════════
    # AUTH LOGIN REGRESSION TESTS
    # ═══════════════════════════════════════════════════════════════
    
    def test_auth_login_regression(self):
        """Test auth login regression - must not return 500"""
        print("\n" + "="*70)
        print("🔐 AUTH LOGIN REGRESSION TESTS")
        print("="*70)
        
        # Test 1: Admin login with valid credentials
        try:
            resp = requests.post(
                f"{self.base_url}/api/auth/login",
                json={"email": "admin@bibi.cars", "password": "Jp3FS_7ZuE2bhHp7rFkJm9B9T_TeiHxu"},
                timeout=10
            )
            
            is_200 = resp.status_code == 200
            has_token = False
            has_role = False
            
            if is_200:
                data = resp.json()
                has_token = "access_token" in data
                user = data.get("user", {})
                has_role = user.get("role") == "admin"
            
            self.test(
                "POST /api/auth/login (admin@bibi.cars) → 200 + JWT + role=admin",
                is_200 and has_token and has_role,
                f"Status: {resp.status_code}, has_token: {has_token}, role: {data.get('user', {}).get('role') if is_200 else 'N/A'}",
                critical=True
            )
            
            if resp.status_code == 500:
                self.backend_errors.append({
                    "endpoint": "/api/auth/login",
                    "status": 500,
                    "error": resp.text[:200]
                })
                
        except Exception as e:
            self.test("POST /api/auth/login (admin)", False, f"Exception: {e}", critical=True)
        
        # Test 2: Manager login
        try:
            resp = requests.post(
                f"{self.base_url}/api/auth/login",
                json={"email": "manager@bibi.cars", "password": "dFbYnse0L59DBE16Mn4kT6cCRaNBZFQR"},
                timeout=10
            )
            
            is_200 = resp.status_code == 200
            has_token = False
            has_role = False
            
            if is_200:
                data = resp.json()
                has_token = "access_token" in data
                user = data.get("user", {})
                has_role = user.get("role") == "manager"
            
            self.test(
                "POST /api/auth/login (manager@bibi.cars) → 200 + role=manager",
                is_200 and has_token and has_role,
                f"Status: {resp.status_code}, has_token: {has_token}, role: {data.get('user', {}).get('role') if is_200 else 'N/A'}",
                critical=True
            )
            
            if resp.status_code == 500:
                self.backend_errors.append({
                    "endpoint": "/api/auth/login",
                    "status": 500,
                    "error": resp.text[:200]
                })
                
        except Exception as e:
            self.test("POST /api/auth/login (manager)", False, f"Exception: {e}", critical=True)
        
        # Test 3: Team lead login
        try:
            resp = requests.post(
                f"{self.base_url}/api/auth/login",
                json={"email": "teamlead@bibi.cars", "password": "txXNMkj-lS2w1nv482aLlvKWuk9Y9eKE"},
                timeout=10
            )
            
            is_200 = resp.status_code == 200
            has_token = False
            has_role = False
            
            if is_200:
                data = resp.json()
                has_token = "access_token" in data
                user = data.get("user", {})
                has_role = user.get("role") == "team_lead"
            
            self.test(
                "POST /api/auth/login (teamlead@bibi.cars) → 200 + role=team_lead",
                is_200 and has_token and has_role,
                f"Status: {resp.status_code}, has_token: {has_token}, role: {data.get('user', {}).get('role') if is_200 else 'N/A'}",
                critical=True
            )
            
            if resp.status_code == 500:
                self.backend_errors.append({
                    "endpoint": "/api/auth/login",
                    "status": 500,
                    "error": resp.text[:200]
                })
                
        except Exception as e:
            self.test("POST /api/auth/login (teamlead)", False, f"Exception: {e}", critical=True)
        
        # Test 4: Wrong password → 401
        try:
            resp = requests.post(
                f"{self.base_url}/api/auth/login",
                json={"email": "admin@bibi.cars", "password": "wrong_password"},
                timeout=10
            )
            
            is_401 = resp.status_code == 401
            
            self.test(
                "POST /api/auth/login (wrong password) → 401",
                is_401,
                f"Status: {resp.status_code} (expected 401)"
            )
            
            if resp.status_code == 500:
                self.backend_errors.append({
                    "endpoint": "/api/auth/login",
                    "status": 500,
                    "error": "Should return 401 for wrong password, not 500"
                })
                
        except Exception as e:
            self.test("POST /api/auth/login (wrong password)", False, f"Exception: {e}")
        
        # Test 5: Empty body → 400
        try:
            resp = requests.post(
                f"{self.base_url}/api/auth/login",
                json={},
                timeout=10
            )
            
            is_400 = resp.status_code == 400 or resp.status_code == 422
            
            self.test(
                "POST /api/auth/login (empty body) → 400/422",
                is_400,
                f"Status: {resp.status_code} (expected 400 or 422)"
            )
            
            if resp.status_code == 500:
                self.backend_errors.append({
                    "endpoint": "/api/auth/login",
                    "status": 500,
                    "error": "Should return 400/422 for empty body, not 500"
                })
                
        except Exception as e:
            self.test("POST /api/auth/login (empty body)", False, f"Exception: {e}")
        
        # Test 6: GET /api/auth/me with bearer token
        try:
            # First get a token
            login_resp = requests.post(
                f"{self.base_url}/api/auth/login",
                json={"email": "admin@bibi.cars", "password": "Jp3FS_7ZuE2bhHp7rFkJm9B9T_TeiHxu"},
                timeout=10
            )
            
            if login_resp.status_code == 200:
                token = login_resp.json().get("access_token")
                
                if token:
                    me_resp = requests.get(
                        f"{self.base_url}/api/auth/me",
                        headers={"Authorization": f"Bearer {token}"},
                        timeout=10
                    )
                    
                    is_200 = me_resp.status_code == 200
                    has_user = False
                    
                    if is_200:
                        data = me_resp.json()
                        has_user = "email" in data and data.get("email") == "admin@bibi.cars"
                    
                    self.test(
                        "GET /api/auth/me (with bearer token) → 200 + matching user",
                        is_200 and has_user,
                        f"Status: {me_resp.status_code}, email: {data.get('email') if is_200 else 'N/A'}"
                    )
                else:
                    self.test("GET /api/auth/me", False, "No token received from login")
            else:
                self.test("GET /api/auth/me", False, f"Login failed with status {login_resp.status_code}")
                
        except Exception as e:
            self.test("GET /api/auth/me", False, f"Exception: {e}")

    # ═══════════════════════════════════════════════════════════════
    # PRICE FILTER STRICT MODE TESTS (PRIMARY FIX)
    # ═══════════════════════════════════════════════════════════════
    
    def test_price_filter_strict_mode(self):
        """Test price_min/price_max strict mode implementation"""
        print("\n" + "="*70)
        print("💰 PRICE FILTER STRICT MODE TESTS (PRIMARY FIX)")
        print("="*70)
        
        # Test 1: Base query without filters → total=720, meta.price_filter_mode="strict"
        try:
            resp = requests.get(
                f"{self.base_url}/api/public/vehicles?limit=6",
                timeout=10
            )
            
            is_200 = resp.status_code == 200
            correct_total = False
            has_meta = False
            correct_mode = False
            no_hidden = False
            
            if is_200:
                data = resp.json()
                total = data.get("total", 0)
                correct_total = 710 <= total <= 730  # Allow ±10 as per spec
                
                meta = data.get("meta", {})
                has_meta = meta is not None
                correct_mode = meta.get("price_filter_mode") == "strict"
                no_hidden = "hidden_by_price_filter" not in meta or meta.get("hidden_by_price_filter") == 0
            
            self.test(
                "GET /api/public/vehicles?limit=6 → total≈720, meta.price_filter_mode='strict'",
                is_200 and correct_total and has_meta and correct_mode and no_hidden,
                f"Status: {resp.status_code}, total: {data.get('total') if is_200 else 'N/A'}, meta: {data.get('meta') if is_200 else 'N/A'}",
                critical=True
            )
            
        except Exception as e:
            self.test("GET /api/public/vehicles?limit=6", False, f"Exception: {e}", critical=True)
        
        # Test 2: price_min=5000 → total=0, meta.hidden_by_price_filter=720
        try:
            resp = requests.get(
                f"{self.base_url}/api/public/vehicles?price_min=5000&limit=3",
                timeout=10
            )
            
            is_200 = resp.status_code == 200
            correct_total = False
            has_meta = False
            correct_hidden = False
            
            if is_200:
                data = resp.json()
                total = data.get("total", 0)
                correct_total = total == 0
                
                meta = data.get("meta", {})
                has_meta = meta is not None
                hidden = meta.get("hidden_by_price_filter", 0)
                correct_hidden = 710 <= hidden <= 730  # Allow ±10
            
            self.test(
                "GET /api/public/vehicles?price_min=5000 → total=0, hidden≈720",
                is_200 and correct_total and has_meta and correct_hidden,
                f"Status: {resp.status_code}, total: {data.get('total') if is_200 else 'N/A'}, hidden: {meta.get('hidden_by_price_filter') if is_200 and has_meta else 'N/A'}",
                critical=True
            )
            
        except Exception as e:
            self.test("GET /api/public/vehicles?price_min=5000", False, f"Exception: {e}", critical=True)
        
        # Test 3: price_max=100000 → total=0, meta.hidden_by_price_filter=720
        try:
            resp = requests.get(
                f"{self.base_url}/api/public/vehicles?price_max=100000&limit=3",
                timeout=10
            )
            
            is_200 = resp.status_code == 200
            correct_total = False
            has_meta = False
            correct_hidden = False
            
            if is_200:
                data = resp.json()
                total = data.get("total", 0)
                correct_total = total == 0
                
                meta = data.get("meta", {})
                has_meta = meta is not None
                hidden = meta.get("hidden_by_price_filter", 0)
                correct_hidden = 710 <= hidden <= 730
            
            self.test(
                "GET /api/public/vehicles?price_max=100000 → total=0, hidden≈720",
                is_200 and correct_total and has_meta and correct_hidden,
                f"Status: {resp.status_code}, total: {data.get('total') if is_200 else 'N/A'}, hidden: {meta.get('hidden_by_price_filter') if is_200 and has_meta else 'N/A'}",
                critical=True
            )
            
        except Exception as e:
            self.test("GET /api/public/vehicles?price_max=100000", False, f"Exception: {e}", critical=True)
        
        # Test 4: make=Toyota&price_min=5000 → total=0, meta.hidden_by_price_filter≈98
        try:
            resp = requests.get(
                f"{self.base_url}/api/public/vehicles?make=Toyota&price_min=5000",
                timeout=10
            )
            
            is_200 = resp.status_code == 200
            correct_total = False
            has_meta = False
            correct_hidden = False
            
            if is_200:
                data = resp.json()
                total = data.get("total", 0)
                correct_total = total == 0
                
                meta = data.get("meta", {})
                has_meta = meta is not None
                hidden = meta.get("hidden_by_price_filter", 0)
                correct_hidden = 88 <= hidden <= 108  # Allow ±10 from 98
            
            self.test(
                "GET /api/public/vehicles?make=Toyota&price_min=5000 → total=0, hidden≈98",
                is_200 and correct_total and has_meta and correct_hidden,
                f"Status: {resp.status_code}, total: {data.get('total') if is_200 else 'N/A'}, hidden: {meta.get('hidden_by_price_filter') if is_200 and has_meta else 'N/A'}",
                critical=True
            )
            
        except Exception as e:
            self.test("GET /api/public/vehicles?make=Toyota&price_min=5000", False, f"Exception: {e}", critical=True)
        
        # Test 5: price_min=5000&price_filter_mode=liberal → total=720 (legacy compat)
        try:
            resp = requests.get(
                f"{self.base_url}/api/public/vehicles?price_min=5000&price_filter_mode=liberal",
                timeout=10
            )
            
            is_200 = resp.status_code == 200
            correct_total = False
            has_meta = False
            correct_mode = False
            
            if is_200:
                data = resp.json()
                total = data.get("total", 0)
                correct_total = 710 <= total <= 730
                
                meta = data.get("meta", {})
                has_meta = meta is not None
                correct_mode = meta.get("price_filter_mode") == "liberal"
            
            self.test(
                "GET /api/public/vehicles?price_min=5000&price_filter_mode=liberal → total≈720",
                is_200 and correct_total and has_meta and correct_mode,
                f"Status: {resp.status_code}, total: {data.get('total') if is_200 else 'N/A'}, mode: {meta.get('price_filter_mode') if is_200 and has_meta else 'N/A'}",
                critical=True
            )
            
        except Exception as e:
            self.test("GET /api/public/vehicles?price_min=5000&price_filter_mode=liberal", False, f"Exception: {e}", critical=True)
        
        # Test 6: price_min=5000&price_filter_mode=strict → total=0
        try:
            resp = requests.get(
                f"{self.base_url}/api/public/vehicles?price_min=5000&price_filter_mode=strict",
                timeout=10
            )
            
            is_200 = resp.status_code == 200
            correct_total = False
            has_meta = False
            correct_mode = False
            
            if is_200:
                data = resp.json()
                total = data.get("total", 0)
                correct_total = total == 0
                
                meta = data.get("meta", {})
                has_meta = meta is not None
                correct_mode = meta.get("price_filter_mode") == "strict"
            
            self.test(
                "GET /api/public/vehicles?price_min=5000&price_filter_mode=strict → total=0",
                is_200 and correct_total and has_meta and correct_mode,
                f"Status: {resp.status_code}, total: {data.get('total') if is_200 else 'N/A'}, mode: {meta.get('price_filter_mode') if is_200 and has_meta else 'N/A'}",
                critical=True
            )
            
        except Exception as e:
            self.test("GET /api/public/vehicles?price_min=5000&price_filter_mode=strict", False, f"Exception: {e}", critical=True)

    # ═══════════════════════════════════════════════════════════════
    # REGRESSION CHECKS
    # ═══════════════════════════════════════════════════════════════
    
    def test_regression_checks(self):
        """Test other regression checks"""
        print("\n" + "="*70)
        print("🔄 REGRESSION CHECKS")
        print("="*70)
        
        # Test 1: make=Toyota → ~98 results
        try:
            resp = requests.get(
                f"{self.base_url}/api/public/vehicles?make=Toyota",
                timeout=10
            )
            
            is_200 = resp.status_code == 200
            correct_total = False
            
            if is_200:
                data = resp.json()
                total = data.get("total", 0)
                correct_total = 88 <= total <= 108  # Allow ±10 from 98
            
            self.test(
                "GET /api/public/vehicles?make=Toyota → ≈98 results",
                is_200 and correct_total,
                f"Status: {resp.status_code}, total: {data.get('total') if is_200 else 'N/A'} (expected ≈98)"
            )
            
        except Exception as e:
            self.test("GET /api/public/vehicles?make=Toyota", False, f"Exception: {e}")
        
        # Test 2: year_min=2020 → ~241 results
        try:
            resp = requests.get(
                f"{self.base_url}/api/public/vehicles?year_min=2020",
                timeout=10
            )
            
            is_200 = resp.status_code == 200
            correct_total = False
            
            if is_200:
                data = resp.json()
                total = data.get("total", 0)
                correct_total = 231 <= total <= 251  # Allow ±10 from 241
            
            self.test(
                "GET /api/public/vehicles?year_min=2020 → ≈241 results",
                is_200 and correct_total,
                f"Status: {resp.status_code}, total: {data.get('total') if is_200 else 'N/A'} (expected ≈241)"
            )
            
        except Exception as e:
            self.test("GET /api/public/vehicles?year_min=2020", False, f"Exception: {e}")
        
        # Test 3: GET /api/public/brands
        try:
            resp = requests.get(
                f"{self.base_url}/api/public/brands",
                timeout=10
            )
            
            is_200 = resp.status_code == 200
            has_brands = False
            brands_count = 0
            
            if is_200:
                data = resp.json()
                # Handle both direct list and wrapped format
                if isinstance(data, list):
                    has_brands = len(data) > 0
                    brands_count = len(data)
                elif isinstance(data, dict) and "data" in data:
                    brands_list = data.get("data", [])
                    has_brands = len(brands_list) > 0
                    brands_count = len(brands_list)
            
            self.test(
                "GET /api/public/brands → 200, list of brands",
                is_200 and has_brands,
                f"Status: {resp.status_code}, brands count: {brands_count}"
            )
            
        except Exception as e:
            self.test("GET /api/public/brands", False, f"Exception: {e}")
        
        # Test 4: GET /api/public/models?brand=Toyota
        try:
            resp = requests.get(
                f"{self.base_url}/api/public/models?brand=Toyota",
                timeout=10
            )
            
            is_200 = resp.status_code == 200
            has_models = False
            models_count = 0
            
            if is_200:
                data = resp.json()
                # Handle both direct list and wrapped format
                if isinstance(data, list):
                    has_models = len(data) > 0
                    models_count = len(data)
                elif isinstance(data, dict) and "data" in data:
                    models_list = data.get("data", [])
                    has_models = len(models_list) > 0
                    models_count = len(models_list)
            
            self.test(
                "GET /api/public/models?brand=Toyota → 200, list of models",
                is_200 and has_models,
                f"Status: {resp.status_code}, models count: {models_count}"
            )
            
        except Exception as e:
            self.test("GET /api/public/models?brand=Toyota", False, f"Exception: {e}")
        
        # Test 5: GET /api/vin/{VIN}/shell
        # First get a valid VIN
        try:
            vehicles_resp = requests.get(
                f"{self.base_url}/api/public/vehicles?limit=1",
                timeout=10
            )
            
            if vehicles_resp.status_code == 200:
                vehicles_data = vehicles_resp.json()
                # Handle both "items" and "data" fields
                items = vehicles_data.get("items", vehicles_data.get("data", []))
                
                if items and len(items) > 0:
                    test_vin = items[0].get("vin")
                    
                    if test_vin:
                        shell_resp = requests.get(
                            f"{self.base_url}/api/vin/{test_vin}/shell",
                            timeout=10
                        )
                        
                        is_200 = shell_resp.status_code == 200
                        has_shell = False
                        
                        if is_200:
                            shell_data = shell_resp.json()
                            has_shell = shell_data.get("shell") == True
                        
                        self.test(
                            f"GET /api/vin/{test_vin}/shell → 200, shell:true",
                            is_200 and has_shell,
                            f"Status: {shell_resp.status_code}, shell: {shell_data.get('shell') if is_200 else 'N/A'}"
                        )
                    else:
                        self.test("GET /api/vin/{VIN}/shell", False, "No VIN found in vehicles list")
                else:
                    self.test("GET /api/vin/{VIN}/shell", False, "No vehicles found")
            else:
                self.test("GET /api/vin/{VIN}/shell", False, f"Failed to get vehicles list: {vehicles_resp.status_code}")
                
        except Exception as e:
            self.test("GET /api/vin/{VIN}/shell", False, f"Exception: {e}")

    # ═══════════════════════════════════════════════════════════════
    # MAIN TEST RUNNER
    # ═══════════════════════════════════════════════════════════════
    
    def run_all_tests(self):
        """Run all Phase B2.1 tests"""
        print("\n" + "="*70)
        print("BIBI CARS PHASE B2.1 — OPERATIONAL FIXES TEST SUITE")
        print("="*70)
        print(f"Base URL: {self.base_url}")
        print("="*70)
        
        # Run all test suites
        self.test_auth_login_regression()
        self.test_price_filter_strict_mode()
        self.test_regression_checks()
        
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
            for err in self.backend_errors[:5]:
                print(f"  - {err['endpoint']}: {err['status']} - {err['error'][:100]}")
        
        if self.failed_tests:
            print(f"\n❌ Failed tests ({len(self.failed_tests)}):")
            critical_count = sum(1 for ft in self.failed_tests if ft.get("critical"))
            print(f"   Critical failures: {critical_count}")
            for ft in self.failed_tests[:10]:
                critical = " [CRITICAL]" if ft.get("critical") else ""
                print(f"  - {ft['test']}{critical}")
                if ft['details']:
                    print(f"    {ft['details'][:150]}")
        
        print("="*70)


def main():
    tester = PhaseB21Tester()
    exit_code = tester.run_all_tests()
    sys.exit(exit_code)


if __name__ == "__main__":
    main()
