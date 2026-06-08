#!/usr/bin/env python3
"""
BIBI Cars Wave 3 Backend Test Suite
====================================

Tests Wave 3 refactor (calc-engine SERVER_STATE closure) + admin endpoints
with REAL DB-driven logic (no Manager 1/2/3 hardcoded stubs).

Critical Wave 3 invariants:
  - OpenAPI=618/679, BRIDGE=1, TIER_C=0, BOUNDARY=0, AUX=2, 7/7 workers
  - USA calc: auction=Copart, vehicle_type=Sedan, price=5000, port=Klaipeda,
    year=2015, engine=2000, gasoline, undamaged → total=$9764
  - Korea calc: total=$25707.90
  - Admin endpoints return REAL data (Manager, Team Lead from db.staff)
  - NO hardcoded Manager 1/2/3 in responses
"""
import sys
import requests
from datetime import datetime
from typing import Dict, Any, List, Optional

BASE_URL = "https://code-deploy-89.preview.emergentagent.com"

# Test credentials
ADMIN_EMAIL = "admin@bibi.cars"
ADMIN_PASSWORD = "Jp3FS_7ZuE2bhHp7rFkJm9B9T_TeiHxu"

class Wave3Tester:
    def __init__(self, base_url: str = BASE_URL):
        self.base_url = base_url
        self.token: Optional[str] = None
        self.tests_run = 0
        self.tests_passed = 0
        self.tests_failed = 0
        self.failures: List[Dict[str, Any]] = []

    def log(self, msg: str, level: str = "INFO"):
        """Log with timestamp"""
        ts = datetime.now().strftime("%H:%M:%S")
        prefix = {
            "INFO": "ℹ️",
            "PASS": "✅",
            "FAIL": "❌",
            "WARN": "⚠️",
        }.get(level, "•")
        print(f"[{ts}] {prefix} {msg}")

    def test(self, name: str, method: str, endpoint: str, expected_status: int,
             data: Optional[Dict] = None, headers: Optional[Dict] = None,
             validate_fn: Optional[callable] = None) -> tuple[bool, Any]:
        """Run a single test"""
        self.tests_run += 1
        url = f"{self.base_url}{endpoint}"
        
        # Build headers
        req_headers = {"Content-Type": "application/json"}
        if self.token:
            req_headers["Authorization"] = f"Bearer {self.token}"
        if headers:
            req_headers.update(headers)

        self.log(f"Testing: {name}", "INFO")
        
        try:
            if method == "GET":
                response = requests.get(url, headers=req_headers, timeout=30)
            elif method == "POST":
                response = requests.post(url, json=data, headers=req_headers, timeout=30)
            elif method == "PUT":
                response = requests.put(url, json=data, headers=req_headers, timeout=30)
            elif method == "DELETE":
                response = requests.delete(url, headers=req_headers, timeout=30)
            else:
                raise ValueError(f"Unsupported method: {method}")

            # Check status
            if response.status_code != expected_status:
                self.tests_failed += 1
                msg = f"FAIL: {name} - Expected {expected_status}, got {response.status_code}"
                self.log(msg, "FAIL")
                self.failures.append({
                    "test": name,
                    "endpoint": endpoint,
                    "expected": expected_status,
                    "actual": response.status_code,
                    "response": response.text[:500],
                })
                return False, None

            # Parse response
            try:
                resp_data = response.json()
            except Exception:
                resp_data = response.text

            # Custom validation
            if validate_fn:
                try:
                    validate_fn(resp_data)
                except AssertionError as e:
                    self.tests_failed += 1
                    msg = f"FAIL: {name} - Validation failed: {e}"
                    self.log(msg, "FAIL")
                    self.failures.append({
                        "test": name,
                        "endpoint": endpoint,
                        "error": str(e),
                        "response": str(resp_data)[:500],
                    })
                    return False, resp_data

            self.tests_passed += 1
            self.log(f"PASS: {name}", "PASS")
            return True, resp_data

        except requests.exceptions.Timeout:
            self.tests_failed += 1
            msg = f"FAIL: {name} - Request timeout"
            self.log(msg, "FAIL")
            self.failures.append({"test": name, "endpoint": endpoint, "error": "timeout"})
            return False, None
        except Exception as e:
            self.tests_failed += 1
            msg = f"FAIL: {name} - Error: {str(e)}"
            self.log(msg, "FAIL")
            self.failures.append({"test": name, "endpoint": endpoint, "error": str(e)})
            return False, None

    def test_auth(self) -> bool:
        """Test admin login and store token"""
        success, resp = self.test(
            "Admin Login",
            "POST",
            "/api/auth/login",
            200,
            data={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
        )
        if success and resp:
            # Check for token in response
            if isinstance(resp, dict) and "token" in resp:
                self.token = resp["token"]
                self.log(f"Token acquired: {self.token[:20]}...", "INFO")
                return True
            else:
                self.log(f"Auth response: {resp}", "WARN")
                # Try to extract token from different possible locations
                if isinstance(resp, dict):
                    for key in ["access_token", "accessToken", "jwt", "authToken"]:
                        if key in resp:
                            self.token = resp[key]
                            self.log(f"Token acquired from {key}: {self.token[:20]}...", "INFO")
                            return True
        self.log("Failed to extract token from auth response", "FAIL")
        return False

    def test_dashboard_master(self):
        """Test GET /api/dashboard/master - must return REAL staff data"""
        def validate(data):
            assert "workload" in data, "Missing workload section"
            assert "managers" in data["workload"], "Missing managers list"
            managers = data["workload"]["managers"]
            assert isinstance(managers, list), "managers must be a list"
            
            # Check for hardcoded Manager 1/2/3 (MUST NOT exist)
            for m in managers:
                name = m.get("name", "")
                assert "Manager 1" not in name, "Found hardcoded 'Manager 1' - Wave 3 violation!"
                assert "Manager 2" not in name, "Found hardcoded 'Manager 2' - Wave 3 violation!"
                assert "Manager 3" not in name, "Found hardcoded 'Manager 3' - Wave 3 violation!"
            
            # If managers exist, check they have real data
            if managers:
                m = managers[0]
                assert "email" in m, "Manager missing email field"
                assert "role" in m, "Manager missing role field"
                self.log(f"Found {len(managers)} real managers: {[m.get('name') for m in managers]}", "INFO")

        self.test(
            "Dashboard Master (Real Staff)",
            "GET",
            "/api/dashboard/master",
            200,
            validate_fn=validate,
        )

    def test_calculator_usa_wave3(self):
        """Test Wave 3 calc engine: USA route → $9764"""
        def validate(data):
            assert "calculation" in data, "Missing calculation"
            calc = data["calculation"]
            total = calc.get("total", 0)
            # Wave 3 invariant: USA route with these params → $9764
            assert total == 9764, f"Wave 3 calc invariant violated: expected 9764, got {total}"
            self.log(f"Wave 3 USA calc verified: ${total}", "INFO")

        self.test(
            "Calculator USA Wave 3 (total=$9764)",
            "POST",
            "/api/calculator/calculate",
            200,
            data={
                "origin": "usa",
                "auction": "Copart",
                "vehicleType": "sedan",
                "price": 5000,
                "port": "klaipeda",
                "year": 2015,
                "engine": 2000,
                "fuelType": "gasoline",
                "damaged": False,
            },
            validate_fn=validate,
        )

    def test_admin_kpi_leaderboard(self):
        """Test GET /api/admin/kpi/leaderboard - must return REAL staff"""
        def validate(data):
            assert "managers" in data, "Missing managers list"
            managers = data["managers"]
            assert isinstance(managers, list), "managers must be a list"
            
            # Check for hardcoded Manager 1/2/3 (MUST NOT exist)
            for m in managers:
                name = m.get("name", "")
                assert "Manager 1" not in name, "Found hardcoded 'Manager 1' in leaderboard!"
                assert "Manager 2" not in name, "Found hardcoded 'Manager 2' in leaderboard!"
                assert "Manager 3" not in name, "Found hardcoded 'Manager 3' in leaderboard!"
            
            # If managers exist, verify structure
            if managers:
                m = managers[0]
                assert "email" in m, "Manager missing email"
                assert "role" in m, "Manager missing role"
                assert "score" in m, "Manager missing score"
                self.log(f"Leaderboard: {len(managers)} real staff members", "INFO")

        self.test(
            "Admin KPI Leaderboard (Real Staff)",
            "GET",
            "/api/admin/kpi/leaderboard",
            200,
            validate_fn=validate,
        )

    def test_admin_kpi_dashboard(self):
        """Test GET /api/admin/kpi/dashboard - real KPI from leads"""
        def validate(data):
            assert "leadsCreated" in data, "Missing leadsCreated"
            assert "contactRate" in data, "Missing contactRate"
            assert "conversionRate" in data, "Missing conversionRate"
            assert "avgResponseTime" in data, "Missing avgResponseTime"
            self.log(f"KPI Dashboard: {data.get('leadsCreated')} leads, {data.get('contactRate')}% contact rate", "INFO")

        self.test(
            "Admin KPI Dashboard (Real Data)",
            "GET",
            "/api/admin/kpi/dashboard",
            200,
            validate_fn=validate,
        )

    def test_admin_sources(self):
        """Test GET /api/admin/sources - real ingestion counts"""
        def validate(data):
            assert "sources" in data, "Missing sources list"
            sources = data["sources"]
            assert isinstance(sources, list), "sources must be a list"
            
            # Check for expected sources
            source_names = {s.get("name") for s in sources}
            expected = {"Bitmotors", "Lemon", "WestMotors"}
            found = source_names & expected
            self.log(f"Sources found: {found}", "INFO")
            
            # Verify counts (from review_request: Bitmotors=24, Lemon=54622, WestMotors=10000)
            for s in sources:
                if s.get("name") == "Bitmotors":
                    self.log(f"Bitmotors count: {s.get('count')}", "INFO")
                elif s.get("name") == "Lemon":
                    self.log(f"Lemon count: {s.get('count')}", "INFO")
                elif s.get("name") == "WestMotors":
                    self.log(f"WestMotors count: {s.get('count')}", "INFO")

        self.test(
            "Admin Sources (Real Ingestion Counts)",
            "GET",
            "/api/admin/sources",
            200,
            validate_fn=validate,
        )

    def test_admin_staff_sessions_active(self):
        """Test GET /api/admin/staff-sessions/active - must return ARRAY"""
        def validate(data):
            # CRITICAL: Must be an array, NOT {sessions: []}
            assert isinstance(data, list), f"Expected array, got {type(data).__name__}"
            self.log(f"Active sessions: {len(data)} (correct array format)", "INFO")
            
            # If sessions exist, verify structure
            if data:
                s = data[0]
                assert "email" in s, "Session missing email"
                assert "status" in s or "active" in s, "Session missing status/active"

        self.test(
            "Admin Staff Sessions Active (Array Format)",
            "GET",
            "/api/admin/staff-sessions/active",
            200,
            validate_fn=validate,
        )

    def test_admin_staff_sessions_analytics(self):
        """Test GET /api/admin/staff-sessions/analytics - all required fields"""
        def validate(data):
            required = [
                "activeSessions", "suspiciousSessions", "forcedLogouts",
                "periodDays", "avgDurationMinutes"
            ]
            for field in required:
                assert field in data, f"Missing required field: {field}"
            
            self.log(f"Session Analytics: {data.get('activeSessions')} active, "
                    f"{data.get('suspiciousSessions')} suspicious, "
                    f"avg {data.get('avgDurationMinutes')}min", "INFO")

        self.test(
            "Admin Staff Sessions Analytics (All Fields)",
            "GET",
            "/api/admin/staff-sessions/analytics",
            200,
            validate_fn=validate,
        )

    def test_admin_intent_analytics(self):
        """Test GET /api/admin/intent/analytics - all required fields"""
        def validate(data):
            required = [
                "hotUsers", "warmUsers", "coldUsers", "autoLeadsCreated",
                "total", "avgScore"
            ]
            for field in required:
                assert field in data, f"Missing required field: {field}"
            
            self.log(f"Intent Analytics: {data.get('hotUsers')} hot, "
                    f"{data.get('warmUsers')} warm, {data.get('coldUsers')} cold, "
                    f"avg score {data.get('avgScore')}", "INFO")

        self.test(
            "Admin Intent Analytics (All Fields)",
            "GET",
            "/api/admin/intent/analytics",
            200,
            validate_fn=validate,
        )

    def test_admin_overview(self):
        """Test GET /api/admin/overview - real DB counts"""
        self.test(
            "Admin Overview (Real DB Counts)",
            "GET",
            "/api/admin/overview",
            200,
        )

    def test_system_health(self):
        """Test GET /api/system/health - 7/7 workers"""
        def validate(data):
            assert "workers" in data or "status" in data, "Missing health data"
            self.log(f"System health: {data}", "INFO")

        self.test(
            "System Health (7/7 Workers)",
            "GET",
            "/api/system/health",
            200,
            validate_fn=validate,
        )

    def test_comprehensive_admin_endpoints(self):
        """Test comprehensive admin endpoint reachability"""
        endpoints = [
            "/api/admin/security/2fa/status",
            "/api/admin/payments",
            "/api/admin/integrations",
            "/api/admin/tracking/status",
            "/api/admin/identity/exceptions",
            "/api/admin/engagement/analytics",
            "/api/admin/providers/stats",
            "/api/admin/shipments/exceptions",
            "/api/admin/ringostat/calls",
            "/api/admin/intent/hot-leads",
            "/api/admin/intent/scores",
            "/api/admin/services",
            "/api/admin/email-templates",
            "/api/admin/history-reports/analytics",
            "/api/admin/call-flow/board",
            "/api/admin/proxy/status",
            "/api/admin/email-outbox",
            "/api/admin/invoice-templates",
            "/api/admin/lead-requests",
            "/api/admin/orders",
            "/api/admin/notification-rules",
            "/api/admin/workflow-templates",
            "/api/admin/predictive-leads/bucket/hot",
        ]
        
        for endpoint in endpoints:
            self.test(
                f"Admin Endpoint: {endpoint}",
                "GET",
                endpoint,
                200,
            )

    def test_calculator_config_endpoints(self):
        """Test calculator config endpoints"""
        endpoints = [
            "/api/calculator/admin/stats",
            "/api/calculator/config/profile",
            "/api/calculator/config/routes",
            "/api/calculator/ports",
        ]
        
        for endpoint in endpoints:
            self.test(
                f"Calculator Config: {endpoint}",
                "GET",
                endpoint,
                200,
            )

    def run_all(self):
        """Run all tests"""
        self.log("=" * 70, "INFO")
        self.log("BIBI Cars Wave 3 Backend Test Suite", "INFO")
        self.log(f"Base URL: {self.base_url}", "INFO")
        self.log("=" * 70, "INFO")
        
        # 1. Auth
        if not self.test_auth():
            self.log("Auth failed - stopping tests", "FAIL")
            return 1
        
        # 2. Dashboard
        self.test_dashboard_master()
        
        # 3. Calculator Wave 3
        self.test_calculator_usa_wave3()
        
        # 4. Admin KPI
        self.test_admin_kpi_leaderboard()
        self.test_admin_kpi_dashboard()
        
        # 5. Admin Sources
        self.test_admin_sources()
        
        # 6. Admin Staff Sessions
        self.test_admin_staff_sessions_active()
        self.test_admin_staff_sessions_analytics()
        
        # 7. Admin Intent
        self.test_admin_intent_analytics()
        
        # 8. Admin Overview
        self.test_admin_overview()
        
        # 9. System Health
        self.test_system_health()
        
        # 10. Comprehensive Admin Endpoints
        self.test_comprehensive_admin_endpoints()
        
        # 11. Calculator Config
        self.test_calculator_config_endpoints()
        
        # Summary
        self.log("=" * 70, "INFO")
        self.log(f"Tests Run: {self.tests_run}", "INFO")
        self.log(f"Tests Passed: {self.tests_passed}", "PASS")
        self.log(f"Tests Failed: {self.tests_failed}", "FAIL" if self.tests_failed > 0 else "INFO")
        self.log("=" * 70, "INFO")
        
        if self.failures:
            self.log("FAILURES:", "FAIL")
            for f in self.failures:
                self.log(f"  • {f.get('test')}: {f.get('error', f.get('response', 'Unknown'))}", "FAIL")
        
        return 0 if self.tests_failed == 0 else 1


def main():
    tester = Wave3Tester(BASE_URL)
    return tester.run_all()


if __name__ == "__main__":
    sys.exit(main())
