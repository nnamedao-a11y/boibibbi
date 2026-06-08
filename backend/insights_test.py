"""
Backend API Tests for Insights Hub (Wave 8)
============================================

Tests all endpoints used by the new /admin/insights consolidated hub:
  - System health
  - Auth (admin, manager, team_lead)
  - KPI dashboard & leaderboard
  - Owner dashboard
  - Journey funnel, bottlenecks, durations
  - Alerts (critical)
  - Escalations & stats
  - Intent hot leads
  - Engagement analytics, top users, top vehicles
  - Contracts accounting
  - Documents & verification queue
  - Team endpoints (stale leads, overdue payments, stalled shipping, managers, performance)
  - Login audit
  - Analytics dashboard & marketing campaigns

Usage:
    python insights_test.py
"""

import requests
import sys
import json
from datetime import datetime
from typing import Dict, Any, Optional, List

# Configuration - use REACT_APP_BACKEND_URL from frontend/.env
API_URL = "https://code-review-301.preview.emergentagent.com/api"

# Test credentials from /app/memory/test_credentials.md
ADMIN_EMAIL = "admin@bibi.cars"
ADMIN_PASSWORD = "Jp3FS_7ZuE2bhHp7rFkJm9B9T_TeiHxu"
MANAGER_EMAIL = "manager@bibi.cars"
MANAGER_PASSWORD = "dFbYnse0L59DBE16Mn4kT6cCRaNBZFQR"
TEAMLEAD_EMAIL = "teamlead@bibi.cars"
TEAMLEAD_PASSWORD = "txXNMkj-lS2w1nv482aLlvKWuk9Y9eKE"


class InsightsAPITester:
    """Test suite for Insights hub backend APIs"""

    def __init__(self, base_url: str = API_URL):
        self.base_url = base_url
        self.token: Optional[str] = None
        self.tests_run = 0
        self.tests_passed = 0
        self.tests_failed = 0
        self.failures: List[Dict] = []
        self.role: Optional[str] = None

    def log(self, message: str, level: str = "INFO"):
        """Log a message with timestamp"""
        timestamp = datetime.now().strftime("%H:%M:%S")
        prefix = {
            "INFO": "ℹ️ ",
            "SUCCESS": "✅",
            "ERROR": "❌",
            "WARNING": "⚠️ ",
        }.get(level, "  ")
        print(f"[{timestamp}] {prefix} {message}")

    def run_test(
        self,
        name: str,
        method: str,
        endpoint: str,
        expected_status: int,
        data: Optional[Dict] = None,
        params: Optional[Dict] = None,
        validate_fn: Optional[callable] = None,
        allow_empty: bool = True,
    ) -> tuple[bool, Any]:
        """Run a single API test"""
        url = f"{self.base_url}/{endpoint}"
        headers = {"Content-Type": "application/json"}
        if self.token:
            headers["Authorization"] = f"Bearer {self.token}"

        self.tests_run += 1
        self.log(f"Test #{self.tests_run}: {name}", "INFO")

        try:
            if method == "GET":
                response = requests.get(url, headers=headers, params=params, timeout=30)
            elif method == "POST":
                response = requests.post(url, json=data, headers=headers, params=params, timeout=30)
            else:
                raise ValueError(f"Unsupported method: {method}")

            # Check status code
            if response.status_code != expected_status:
                self.tests_failed += 1
                msg = f"Expected status {expected_status}, got {response.status_code}"
                self.log(f"FAILED: {msg}", "ERROR")
                self.log(f"Response: {response.text[:300]}", "ERROR")
                self.failures.append({"test": name, "reason": msg, "response": response.text[:300]})
                return False, None

            # Parse response
            try:
                response_data = response.json()
            except Exception:
                response_data = response.text

            # Run custom validation if provided
            if validate_fn:
                try:
                    validate_fn(response_data)
                except AssertionError as e:
                    self.tests_failed += 1
                    msg = f"Validation failed: {str(e)}"
                    self.log(f"FAILED: {msg}", "ERROR")
                    self.failures.append({"test": name, "reason": msg})
                    return False, response_data

            self.tests_passed += 1
            self.log(f"PASSED (status={response.status_code})", "SUCCESS")
            return True, response_data

        except requests.exceptions.Timeout:
            self.tests_failed += 1
            msg = "Request timeout (30s)"
            self.log(f"FAILED: {msg}", "ERROR")
            self.failures.append({"test": name, "reason": msg})
            return False, None
        except Exception as e:
            self.tests_failed += 1
            msg = f"Exception: {str(e)}"
            self.log(f"FAILED: {msg}", "ERROR")
            self.failures.append({"test": name, "reason": msg})
            return False, None

    def login(self, email: str, password: str, role_name: str) -> bool:
        """Authenticate and get JWT token"""
        self.log(f"Authenticating as {role_name} ({email})...", "INFO")
        success, response = self.run_test(
            f"{role_name} Login",
            "POST",
            "auth/login",
            200,
            data={"email": email, "password": password},
        )
        if success and response:
            token = response.get("token") or response.get("access_token") or response.get("data", {}).get("token")
            if token:
                self.token = token
                self.role = role_name
                self.log(f"Authentication successful as {role_name}", "SUCCESS")
                return True
            else:
                self.log(f"Token not found in response: {json.dumps(response, indent=2)[:300]}", "ERROR")
        self.log(f"Authentication failed for {role_name}", "ERROR")
        return False

    def test_system_health(self) -> bool:
        """Test system health endpoint"""
        success, _ = self.run_test(
            "GET /api/system/health",
            "GET",
            "system/health",
            200,
        )
        return success

    def test_kpi_dashboard(self) -> bool:
        """Test KPI dashboard endpoint"""
        success, response = self.run_test(
            "GET /api/admin/kpi/dashboard",
            "GET",
            "admin/kpi/dashboard",
            200,
            validate_fn=lambda r: (
                assert_true(isinstance(r, dict), "response should be a dict"),
            ),
        )
        return success

    def test_kpi_leaderboard(self) -> bool:
        """Test KPI leaderboard endpoint"""
        success, response = self.run_test(
            "GET /api/admin/kpi/leaderboard",
            "GET",
            "admin/kpi/leaderboard",
            200,
            validate_fn=lambda r: (
                assert_true(isinstance(r, dict), "response should be a dict"),
            ),
        )
        return success

    def test_owner_dashboard(self) -> bool:
        """Test owner dashboard endpoint"""
        success, response = self.run_test(
            "GET /api/owner-dashboard",
            "GET",
            "owner-dashboard",
            200,
            params={"days": 30},
            validate_fn=lambda r: (
                assert_true(isinstance(r, dict), "response should be a dict"),
            ),
        )
        return success

    def test_journey_funnel(self) -> bool:
        """Test journey funnel endpoint"""
        success, response = self.run_test(
            "GET /api/journey/funnel",
            "GET",
            "journey/funnel",
            200,
            validate_fn=lambda r: (
                assert_true(isinstance(r, (dict, list)), "response should be dict or list"),
            ),
        )
        return success

    def test_journey_bottlenecks(self) -> bool:
        """Test journey bottlenecks endpoint"""
        success, response = self.run_test(
            "GET /api/journey/bottlenecks",
            "GET",
            "journey/bottlenecks",
            200,
            validate_fn=lambda r: (
                assert_true(isinstance(r, (dict, list)), "response should be dict or list"),
            ),
        )
        return success

    def test_journey_durations(self) -> bool:
        """Test journey durations endpoint"""
        success, response = self.run_test(
            "GET /api/journey/durations",
            "GET",
            "journey/durations",
            200,
            validate_fn=lambda r: (
                assert_true(isinstance(r, (dict, list)), "response should be dict or list"),
            ),
        )
        return success

    def test_alerts_critical(self) -> bool:
        """Test critical alerts endpoint"""
        success, response = self.run_test(
            "GET /api/alerts/critical",
            "GET",
            "alerts/critical",
            200,
            params={"limit": 100},
            validate_fn=lambda r: (
                assert_true(isinstance(r, (dict, list)), "response should be dict or list"),
            ),
        )
        return success

    def test_escalations(self) -> bool:
        """Test escalations endpoint"""
        success, response = self.run_test(
            "GET /api/escalations",
            "GET",
            "escalations",
            200,
            validate_fn=lambda r: (
                assert_true(isinstance(r, (dict, list)), "response should be dict or list"),
            ),
        )
        return success

    def test_escalations_stats(self) -> bool:
        """Test escalations stats endpoint"""
        success, response = self.run_test(
            "GET /api/escalations/stats",
            "GET",
            "escalations/stats",
            200,
            validate_fn=lambda r: (
                assert_true(isinstance(r, dict), "response should be a dict"),
            ),
        )
        return success

    def test_intent_hot_leads(self) -> bool:
        """Test intent hot leads endpoint"""
        success, response = self.run_test(
            "GET /api/admin/intent/hot-leads",
            "GET",
            "admin/intent/hot-leads",
            200,
            validate_fn=lambda r: (
                assert_true(isinstance(r, (dict, list)), "response should be dict or list"),
            ),
        )
        return success

    def test_engagement_analytics(self) -> bool:
        """Test engagement analytics endpoint"""
        success, response = self.run_test(
            "GET /api/admin/engagement/analytics",
            "GET",
            "admin/engagement/analytics",
            200,
            validate_fn=lambda r: (
                assert_true(isinstance(r, dict), "response should be a dict"),
            ),
        )
        return success

    def test_engagement_top_users(self) -> bool:
        """Test engagement top users endpoint"""
        success, response = self.run_test(
            "GET /api/admin/engagement/top-users",
            "GET",
            "admin/engagement/top-users",
            200,
            validate_fn=lambda r: (
                assert_true(isinstance(r, (dict, list)), "response should be dict or list"),
            ),
        )
        return success

    def test_engagement_top_vehicles(self) -> bool:
        """Test engagement top vehicles endpoint"""
        success, response = self.run_test(
            "GET /api/admin/engagement/top-vehicles",
            "GET",
            "admin/engagement/top-vehicles",
            200,
            validate_fn=lambda r: (
                assert_true(isinstance(r, (dict, list)), "response should be dict or list"),
            ),
        )
        return success

    def test_contracts_accounting(self) -> bool:
        """Test contracts accounting endpoint"""
        success, response = self.run_test(
            "GET /api/admin/contracts/accounting",
            "GET",
            "admin/contracts/accounting",
            200,
            validate_fn=lambda r: (
                assert_true(isinstance(r, (dict, list)), "response should be dict or list"),
            ),
        )
        return success

    def test_documents(self) -> bool:
        """Test documents endpoint"""
        success, response = self.run_test(
            "GET /api/documents",
            "GET",
            "documents",
            200,
            validate_fn=lambda r: (
                assert_true(isinstance(r, (dict, list)), "response should be dict or list"),
            ),
        )
        return success

    def test_documents_verification_queue(self) -> bool:
        """Test documents verification queue endpoint"""
        success, response = self.run_test(
            "GET /api/documents/queue/pending-verification",
            "GET",
            "documents/queue/pending-verification",
            200,
            validate_fn=lambda r: (
                assert_true(isinstance(r, (dict, list)), "response should be dict or list"),
            ),
        )
        return success

    def test_team_leads_stale(self) -> bool:
        """Test team stale leads endpoint"""
        success, response = self.run_test(
            "GET /api/team/leads/stale",
            "GET",
            "team/leads/stale",
            200,
            validate_fn=lambda r: (
                assert_true(isinstance(r, (dict, list)), "response should be dict or list"),
            ),
        )
        return success

    def test_team_payments_overdue(self) -> bool:
        """Test team overdue payments endpoint"""
        success, response = self.run_test(
            "GET /api/team/payments/overdue",
            "GET",
            "team/payments/overdue",
            200,
            validate_fn=lambda r: (
                assert_true(isinstance(r, (dict, list)), "response should be dict or list"),
            ),
        )
        return success

    def test_team_shipping_stalled(self) -> bool:
        """Test team stalled shipping endpoint"""
        success, response = self.run_test(
            "GET /api/team/shipping/stalled",
            "GET",
            "team/shipping/stalled",
            200,
            validate_fn=lambda r: (
                assert_true(isinstance(r, (dict, list)), "response should be dict or list"),
            ),
        )
        return success

    def test_team_managers(self) -> bool:
        """Test team managers endpoint"""
        success, response = self.run_test(
            "GET /api/team/managers",
            "GET",
            "team/managers",
            200,
            validate_fn=lambda r: (
                assert_true(isinstance(r, (dict, list)), "response should be dict or list"),
            ),
        )
        return success

    def test_team_performance(self) -> bool:
        """Test team performance endpoint"""
        success, response = self.run_test(
            "GET /api/team/performance",
            "GET",
            "team/performance",
            200,
            validate_fn=lambda r: (
                assert_true(isinstance(r, (dict, list)), "response should be dict or list"),
            ),
        )
        return success

    def test_login_audit(self) -> bool:
        """Test login audit endpoint"""
        success, response = self.run_test(
            "GET /api/admin/login-audit",
            "GET",
            "admin/login-audit",
            200,
            validate_fn=lambda r: (
                assert_true(isinstance(r, (dict, list)), "response should be dict or list"),
            ),
        )
        return success

    def test_analytics_dashboard(self) -> bool:
        """Test analytics dashboard endpoint"""
        success, response = self.run_test(
            "GET /api/analytics/dashboard",
            "GET",
            "analytics/dashboard",
            200,
            validate_fn=lambda r: (
                assert_true(isinstance(r, dict), "response should be a dict"),
            ),
        )
        return success

    def test_analytics_marketing_campaigns(self) -> bool:
        """Test analytics marketing campaigns endpoint"""
        success, response = self.run_test(
            "GET /api/analytics/marketing-campaigns",
            "GET",
            "analytics/marketing-campaigns",
            200,
            validate_fn=lambda r: (
                assert_true(isinstance(r, (dict, list)), "response should be dict or list"),
            ),
        )
        return success

    def run_all_tests(self) -> int:
        """Run all tests and return exit code"""
        self.log("=" * 80, "INFO")
        self.log("Insights Hub Backend API Test Suite (Wave 8)", "INFO")
        self.log("=" * 80, "INFO")

        # Test system health first (no auth required)
        self.log("\n=== System Health ===", "INFO")
        self.test_system_health()

        # Test with admin credentials
        self.log("\n=== Admin Role Tests ===", "INFO")
        if not self.login(ADMIN_EMAIL, ADMIN_PASSWORD, "admin"):
            self.log("Cannot proceed without admin authentication", "ERROR")
            return 1

        # Run all endpoint tests
        self.log("\n=== KPI & Dashboard Endpoints ===", "INFO")
        self.test_kpi_dashboard()
        self.test_kpi_leaderboard()
        self.test_owner_dashboard()

        self.log("\n=== Journey & Pipeline Endpoints ===", "INFO")
        self.test_journey_funnel()
        self.test_journey_bottlenecks()
        self.test_journey_durations()

        self.log("\n=== Risk & Alerts Endpoints ===", "INFO")
        self.test_alerts_critical()
        self.test_escalations()
        self.test_escalations_stats()

        self.log("\n=== Traffic & Engagement Endpoints ===", "INFO")
        self.test_intent_hot_leads()
        self.test_engagement_analytics()
        self.test_engagement_top_users()
        self.test_engagement_top_vehicles()

        self.log("\n=== Revenue Endpoints ===", "INFO")
        self.test_contracts_accounting()
        self.test_documents()
        self.test_documents_verification_queue()

        self.log("\n=== Team Endpoints ===", "INFO")
        self.test_team_leads_stale()
        self.test_team_payments_overdue()
        self.test_team_shipping_stalled()
        self.test_team_managers()
        self.test_team_performance()

        self.log("\n=== Admin Endpoints ===", "INFO")
        self.test_login_audit()
        self.test_analytics_dashboard()
        self.test_analytics_marketing_campaigns()

        # Test with manager credentials
        self.log("\n=== Manager Role Tests ===", "INFO")
        if self.login(MANAGER_EMAIL, MANAGER_PASSWORD, "manager"):
            self.log("Testing manager access to KPI dashboard...", "INFO")
            self.test_kpi_dashboard()
            self.test_owner_dashboard()

        # Print summary
        self.log("", "INFO")
        self.log("=" * 80, "INFO")
        self.log("Test Summary", "INFO")
        self.log("=" * 80, "INFO")
        self.log(f"Total tests run: {self.tests_run}", "INFO")
        self.log(f"Tests passed: {self.tests_passed}", "SUCCESS")
        self.log(f"Tests failed: {self.tests_failed}", "ERROR" if self.tests_failed > 0 else "INFO")

        if self.failures:
            self.log("", "INFO")
            self.log("Failed tests:", "ERROR")
            for i, failure in enumerate(self.failures, 1):
                self.log(f"{i}. {failure['test']}: {failure['reason']}", "ERROR")

        self.log("=" * 80, "INFO")

        return 0 if self.tests_failed == 0 else 1


# Helper assertion functions
def assert_true(condition, message):
    """Assert that condition is true"""
    if not condition:
        raise AssertionError(message)


def main():
    """Main entry point"""
    tester = InsightsAPITester()
    exit_code = tester.run_all_tests()
    sys.exit(exit_code)


if __name__ == "__main__":
    main()
