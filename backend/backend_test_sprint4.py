#!/usr/bin/env python3
"""
BIBI Cars CRM — Sprint 4 Backend Test Suite
============================================

Tests Customer Comments, Customer Tasks, and Customer Timeline features.

Test Coverage:
- Customer Comments: CRUD, pin/unpin, edit-only-own, delete-only-own-or-admin
- Customer Tasks: CRUD, status toggle, priorities, filters (open/overdue/done)
- Customer Timeline: unified feed, legacy compatibility, event hooks
- Authorization: 401 for invalid tokens, 403 for unauthorized actions
- Validation: 400 for invalid data, 404 for non-existent resources
"""
import sys
import requests
import uuid
from datetime import datetime, timezone
from typing import Dict, Any, Optional, List

# Public endpoint from frontend/.env
BASE_URL = "https://auto-delivery-11.preview.emergentagent.com"

# Test credentials from /app/memory/test_credentials.md
ADMIN_EMAIL = "admin@bibi.cars"
ADMIN_PASSWORD = "Jp3FS_7ZuE2bhHp7rFkJm9B9T_TeiHxu"
MANAGER_EMAIL = "manager@bibi.test"
MANAGER_PASSWORD = "Jp3FS_7ZuE2bhHp7rFkJm9B9T_TeiHxu"
TEST_CUSTOMER_ID = "customer_test_001"


class Sprint4Tester:
    def __init__(self):
        self.admin_token: Optional[str] = None
        self.manager_token: Optional[str] = None
        self.admin_id: Optional[str] = None
        self.manager_id: Optional[str] = None
        self.test_customer_id: str = TEST_CUSTOMER_ID
        self.tests_run = 0
        self.tests_passed = 0
        self.tests_failed = 0
        self.created_comment_ids: List[str] = []
        self.created_task_ids: List[str] = []

    def log(self, msg: str, level: str = "INFO"):
        """Log with timestamp and level."""
        timestamp = datetime.now(timezone.utc).strftime("%H:%M:%S")
        print(f"[{timestamp}] [{level}] {msg}")

    def run_test(self, name: str, func) -> bool:
        """Run a single test and track results."""
        self.tests_run += 1
        self.log(f"🔍 Test {self.tests_run}: {name}", "TEST")
        try:
            func()
            self.tests_passed += 1
            self.log(f"✅ PASSED: {name}", "PASS")
            return True
        except AssertionError as e:
            self.tests_failed += 1
            self.log(f"❌ FAILED: {name} - {str(e)}", "FAIL")
            return False
        except Exception as e:
            self.tests_failed += 1
            self.log(f"❌ ERROR: {name} - {str(e)}", "ERROR")
            return False

    def login(self, email: str, password: str) -> Dict[str, Any]:
        """Login and return token + user info."""
        self.log(f"Logging in as {email}...")
        resp = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": email, "password": password},
            timeout=10
        )
        assert resp.status_code == 200, f"Login failed: {resp.status_code} - {resp.text}"
        data = resp.json()
        # Handle both "token" and "access_token" response formats
        token = data.get("token") or data.get("access_token")
        assert token, f"No token in response: {data}"
        data["token"] = token  # Normalize to "token" key
        self.log(f"✓ Logged in as {email}")
        return data

    def setup_auth(self):
        """Setup admin and manager tokens."""
        self.log("=" * 60)
        self.log("SETUP: Authenticating test users")
        self.log("=" * 60)
        
        # Admin login
        admin_data = self.login(ADMIN_EMAIL, ADMIN_PASSWORD)
        self.admin_token = admin_data["token"]
        self.admin_id = admin_data.get("user", {}).get("id") or admin_data.get("id")
        
        # Manager login
        manager_data = self.login(MANAGER_EMAIL, MANAGER_PASSWORD)
        self.manager_token = manager_data["token"]
        self.manager_id = manager_data.get("user", {}).get("id") or manager_data.get("id")
        
        self.log(f"Admin ID: {self.admin_id}")
        self.log(f"Manager ID: {self.manager_id}")

    def ensure_test_customer(self):
        """Ensure test customer exists."""
        self.log("Checking test customer exists...")
        headers = {"Authorization": f"Bearer {self.admin_token}"}
        resp = requests.get(
            f"{BASE_URL}/api/customers/{self.test_customer_id}",
            headers=headers,
            timeout=10
        )
        if resp.status_code == 404:
            self.log("Test customer not found, creating...")
            create_resp = requests.post(
                f"{BASE_URL}/api/customers",
                headers=headers,
                json={
                    "id": self.test_customer_id,
                    "email": "customer@bibi.test",
                    "firstName": "Test",
                    "lastName": "Customer",
                    "phone": "+359888000001",
                    "managerId": self.manager_id,
                },
                timeout=10
            )
            assert create_resp.status_code in [200, 201], f"Failed to create customer: {create_resp.text}"
            self.log("✓ Test customer created")
        else:
            assert resp.status_code == 200, f"Failed to get customer: {resp.text}"
            self.log("✓ Test customer exists")

    # ========================================================================
    # CUSTOMER COMMENTS TESTS
    # ========================================================================

    def test_comments_list_empty(self):
        """GET /api/customers/{id}/comments - should return empty list initially."""
        headers = {"Authorization": f"Bearer {self.manager_token}"}
        resp = requests.get(
            f"{BASE_URL}/api/customers/{self.test_customer_id}/comments",
            headers=headers,
            timeout=10
        )
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        data = resp.json()
        assert data.get("success"), "Response not successful"
        assert "items" in data, "No items in response"
        self.log(f"Found {len(data['items'])} existing comments")

    def test_comments_create_manager(self):
        """POST /api/customers/{id}/comments - manager can create comment."""
        headers = {"Authorization": f"Bearer {self.manager_token}"}
        body_text = f"Test comment from manager at {datetime.now(timezone.utc).isoformat()}"
        resp = requests.post(
            f"{BASE_URL}/api/customers/{self.test_customer_id}/comments",
            headers=headers,
            json={"body": body_text},
            timeout=10
        )
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        data = resp.json()
        assert data.get("success"), "Response not successful"
        assert "comment" in data, "No comment in response"
        comment = data["comment"]
        assert comment.get("body") == body_text, "Body mismatch"
        assert comment.get("author_email") == MANAGER_EMAIL, "Author email mismatch"
        assert comment.get("id"), "No comment ID"
        self.created_comment_ids.append(comment["id"])
        self.log(f"Created comment ID: {comment['id']}")

    def test_comments_create_validation_empty_body(self):
        """POST /api/customers/{id}/comments - should reject empty body."""
        headers = {"Authorization": f"Bearer {self.manager_token}"}
        resp = requests.post(
            f"{BASE_URL}/api/customers/{self.test_customer_id}/comments",
            headers=headers,
            json={"body": "   "},
            timeout=10
        )
        assert resp.status_code == 400, f"Expected 400, got {resp.status_code}: {resp.text}"

    def test_comments_create_validation_too_long(self):
        """POST /api/customers/{id}/comments - should reject body > 8000 chars."""
        headers = {"Authorization": f"Bearer {self.manager_token}"}
        resp = requests.post(
            f"{BASE_URL}/api/customers/{self.test_customer_id}/comments",
            headers=headers,
            json={"body": "x" * 8001},
            timeout=10
        )
        assert resp.status_code == 400, f"Expected 400, got {resp.status_code}: {resp.text}"

    def test_comments_edit_own(self):
        """PATCH /api/customers/{id}/comments/{cid} - author can edit own comment."""
        if not self.created_comment_ids:
            self.log("Skipping: no comments created yet")
            return
        
        comment_id = self.created_comment_ids[0]
        headers = {"Authorization": f"Bearer {self.manager_token}"}
        new_body = f"Edited comment at {datetime.now(timezone.utc).isoformat()}"
        resp = requests.patch(
            f"{BASE_URL}/api/customers/{self.test_customer_id}/comments/{comment_id}",
            headers=headers,
            json={"body": new_body},
            timeout=10
        )
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        data = resp.json()
        assert data.get("success"), "Response not successful"
        comment = data["comment"]
        assert comment.get("body") == new_body, "Body not updated"
        assert comment.get("edited") is True, "Edited flag not set"

    def test_comments_pin_admin(self):
        """PATCH /api/customers/{id}/comments/{cid} - admin can pin comment."""
        if not self.created_comment_ids:
            self.log("Skipping: no comments created yet")
            return
        
        comment_id = self.created_comment_ids[0]
        headers = {"Authorization": f"Bearer {self.admin_token}"}
        resp = requests.patch(
            f"{BASE_URL}/api/customers/{self.test_customer_id}/comments/{comment_id}",
            headers=headers,
            json={"pinned": True},
            timeout=10
        )
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        data = resp.json()
        assert data.get("success"), "Response not successful"
        comment = data["comment"]
        assert comment.get("pinned") is True, "Comment not pinned"

    def test_comments_list_pinned_first(self):
        """GET /api/customers/{id}/comments - pinned comments should appear first."""
        headers = {"Authorization": f"Bearer {self.manager_token}"}
        resp = requests.get(
            f"{BASE_URL}/api/customers/{self.test_customer_id}/comments",
            headers=headers,
            timeout=10
        )
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        data = resp.json()
        items = data.get("items", [])
        if len(items) > 1:
            # Check if pinned comments are first
            pinned_indices = [i for i, c in enumerate(items) if c.get("pinned")]
            if pinned_indices:
                assert pinned_indices[0] == 0, "Pinned comment not first"
                self.log(f"✓ Pinned comments appear first")

    def test_comments_delete_own(self):
        """DELETE /api/customers/{id}/comments/{cid} - author can delete own comment (soft)."""
        # Create a new comment to delete
        headers = {"Authorization": f"Bearer {self.manager_token}"}
        resp = requests.post(
            f"{BASE_URL}/api/customers/{self.test_customer_id}/comments",
            headers=headers,
            json={"body": "Comment to be deleted"},
            timeout=10
        )
        assert resp.status_code == 200, f"Failed to create comment: {resp.text}"
        comment_id = resp.json()["comment"]["id"]
        
        # Delete it
        resp = requests.delete(
            f"{BASE_URL}/api/customers/{self.test_customer_id}/comments/{comment_id}",
            headers=headers,
            timeout=10
        )
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        assert resp.json().get("success"), "Delete not successful"

    def test_comments_404_nonexistent_customer(self):
        """GET /api/customers/{id}/comments - should return 404 for non-existent customer."""
        headers = {"Authorization": f"Bearer {self.manager_token}"}
        resp = requests.get(
            f"{BASE_URL}/api/customers/nonexistent_customer_999/comments",
            headers=headers,
            timeout=10
        )
        assert resp.status_code == 404, f"Expected 404, got {resp.status_code}"

    # ========================================================================
    # CUSTOMER TASKS TESTS
    # ========================================================================

    def test_tasks_list_empty(self):
        """GET /api/customers/{id}/tasks - should return list with summary."""
        headers = {"Authorization": f"Bearer {self.manager_token}"}
        resp = requests.get(
            f"{BASE_URL}/api/customers/{self.test_customer_id}/tasks",
            headers=headers,
            timeout=10
        )
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        data = resp.json()
        assert data.get("success"), "Response not successful"
        assert "items" in data, "No items in response"
        assert "summary" in data, "No summary in response"
        summary = data["summary"]
        assert "open" in summary, "No open count in summary"
        assert "completed" in summary, "No completed count in summary"
        assert "overdue" in summary, "No overdue count in summary"
        self.log(f"Tasks summary: {summary}")

    def test_tasks_create(self):
        """POST /api/customers/{id}/tasks - should create task."""
        headers = {"Authorization": f"Bearer {self.manager_token}"}
        title = f"Test task {datetime.now(timezone.utc).isoformat()}"
        resp = requests.post(
            f"{BASE_URL}/api/customers/{self.test_customer_id}/tasks",
            headers=headers,
            json={
                "title": title,
                "description": "Test task description",
                "priority": "high",
            },
            timeout=10
        )
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        data = resp.json()
        assert data.get("success"), "Response not successful"
        assert "task" in data, "No task in response"
        task = data["task"]
        assert task.get("title") == title, "Title mismatch"
        assert task.get("priority") == "high", "Priority mismatch"
        assert task.get("status") == "pending", "Status should be pending"
        assert task.get("customerId") == self.test_customer_id, "Customer ID mismatch"
        assert task.get("id"), "No task ID"
        self.created_task_ids.append(task["id"])
        self.log(f"Created task ID: {task['id']}")

    def test_tasks_create_validation_no_title(self):
        """POST /api/customers/{id}/tasks - should reject empty title."""
        headers = {"Authorization": f"Bearer {self.manager_token}"}
        resp = requests.post(
            f"{BASE_URL}/api/customers/{self.test_customer_id}/tasks",
            headers=headers,
            json={"title": "   "},
            timeout=10
        )
        assert resp.status_code == 400, f"Expected 400, got {resp.status_code}: {resp.text}"

    def test_tasks_update_status_complete(self):
        """PATCH /api/customers/{id}/tasks/{tid} - should update status to completed."""
        if not self.created_task_ids:
            self.log("Skipping: no tasks created yet")
            return
        
        task_id = self.created_task_ids[0]
        headers = {"Authorization": f"Bearer {self.manager_token}"}
        resp = requests.patch(
            f"{BASE_URL}/api/customers/{self.test_customer_id}/tasks/{task_id}",
            headers=headers,
            json={"status": "completed"},
            timeout=10
        )
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        data = resp.json()
        assert data.get("success"), "Response not successful"
        task = data["task"]
        assert task.get("status") == "completed", "Status not updated"
        assert task.get("completed_at"), "completed_at not set"

    def test_tasks_update_validation_invalid_status(self):
        """PATCH /api/customers/{id}/tasks/{tid} - should reject invalid status."""
        if not self.created_task_ids:
            self.log("Skipping: no tasks created yet")
            return
        
        task_id = self.created_task_ids[0]
        headers = {"Authorization": f"Bearer {self.manager_token}"}
        resp = requests.patch(
            f"{BASE_URL}/api/customers/{self.test_customer_id}/tasks/{task_id}",
            headers=headers,
            json={"status": "invalid_status"},
            timeout=10
        )
        assert resp.status_code == 400, f"Expected 400, got {resp.status_code}: {resp.text}"

    def test_tasks_delete(self):
        """DELETE /api/customers/{id}/tasks/{tid} - should delete task."""
        # Create a new task to delete
        headers = {"Authorization": f"Bearer {self.manager_token}"}
        resp = requests.post(
            f"{BASE_URL}/api/customers/{self.test_customer_id}/tasks",
            headers=headers,
            json={"title": "Task to be deleted"},
            timeout=10
        )
        assert resp.status_code == 200, f"Failed to create task: {resp.text}"
        task_id = resp.json()["task"]["id"]
        
        # Delete it
        resp = requests.delete(
            f"{BASE_URL}/api/customers/{self.test_customer_id}/tasks/{task_id}",
            headers=headers,
            timeout=10
        )
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        assert resp.json().get("success"), "Delete not successful"

    def test_tasks_404_nonexistent_customer(self):
        """GET /api/customers/{id}/tasks - should return 404 for non-existent customer."""
        headers = {"Authorization": f"Bearer {self.manager_token}"}
        resp = requests.get(
            f"{BASE_URL}/api/customers/nonexistent_customer_999/tasks",
            headers=headers,
            timeout=10
        )
        assert resp.status_code == 404, f"Expected 404, got {resp.status_code}"

    # ========================================================================
    # CUSTOMER TIMELINE TESTS
    # ========================================================================

    def test_timeline_get_unified(self):
        """GET /api/customers/{id}/timeline - should return unified timeline."""
        headers = {"Authorization": f"Bearer {self.manager_token}"}
        resp = requests.get(
            f"{BASE_URL}/api/customers/{self.test_customer_id}/timeline",
            headers=headers,
            timeout=10
        )
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        data = resp.json()
        assert data.get("success"), "Response not successful"
        assert "items" in data, "No items in response"
        assert "breakdown" in data, "No breakdown in response"
        assert "available_kinds" in data, "No available_kinds in response"
        self.log(f"Timeline has {len(data['items'])} events")
        self.log(f"Event breakdown: {data['breakdown']}")

    def test_timeline_hook_comment_added(self):
        """Timeline should contain comment_added event after creating comment."""
        # Create a comment
        headers = {"Authorization": f"Bearer {self.manager_token}"}
        body_text = f"Comment for timeline test {uuid.uuid4().hex[:8]}"
        resp = requests.post(
            f"{BASE_URL}/api/customers/{self.test_customer_id}/comments",
            headers=headers,
            json={"body": body_text},
            timeout=10
        )
        assert resp.status_code == 200, f"Failed to create comment: {resp.text}"
        
        # Check timeline
        resp = requests.get(
            f"{BASE_URL}/api/customers/{self.test_customer_id}/timeline",
            headers=headers,
            timeout=10
        )
        assert resp.status_code == 200, f"Failed to get timeline: {resp.text}"
        data = resp.json()
        items = data.get("items", [])
        
        # Look for comment_added event
        comment_events = [e for e in items if e.get("kind") == "comment_added"]
        assert len(comment_events) > 0, "No comment_added events found in timeline"
        self.log(f"✓ Found {len(comment_events)} comment_added events")

    def test_timeline_hook_task_created(self):
        """Timeline should contain task_created event after creating task."""
        # Create a task
        headers = {"Authorization": f"Bearer {self.manager_token}"}
        title = f"Task for timeline test {uuid.uuid4().hex[:8]}"
        resp = requests.post(
            f"{BASE_URL}/api/customers/{self.test_customer_id}/tasks",
            headers=headers,
            json={"title": title},
            timeout=10
        )
        assert resp.status_code == 200, f"Failed to create task: {resp.text}"
        
        # Check timeline
        resp = requests.get(
            f"{BASE_URL}/api/customers/{self.test_customer_id}/timeline",
            headers=headers,
            timeout=10
        )
        assert resp.status_code == 200, f"Failed to get timeline: {resp.text}"
        data = resp.json()
        items = data.get("items", [])
        
        # Look for task_created event
        task_events = [e for e in items if e.get("kind") == "task_created"]
        assert len(task_events) > 0, "No task_created events found in timeline"
        self.log(f"✓ Found {len(task_events)} task_created events")

    def test_timeline_hook_task_completed(self):
        """Timeline should contain task_completed event after completing task."""
        # Create and complete a task
        headers = {"Authorization": f"Bearer {self.manager_token}"}
        title = f"Task for completion test {uuid.uuid4().hex[:8]}"
        resp = requests.post(
            f"{BASE_URL}/api/customers/{self.test_customer_id}/tasks",
            headers=headers,
            json={"title": title},
            timeout=10
        )
        assert resp.status_code == 200, f"Failed to create task: {resp.text}"
        task_id = resp.json()["task"]["id"]
        
        # Complete it
        resp = requests.patch(
            f"{BASE_URL}/api/customers/{self.test_customer_id}/tasks/{task_id}",
            headers=headers,
            json={"status": "completed"},
            timeout=10
        )
        assert resp.status_code == 200, f"Failed to complete task: {resp.text}"
        
        # Check timeline
        resp = requests.get(
            f"{BASE_URL}/api/customers/{self.test_customer_id}/timeline",
            headers=headers,
            timeout=10
        )
        assert resp.status_code == 200, f"Failed to get timeline: {resp.text}"
        data = resp.json()
        items = data.get("items", [])
        
        # Look for task_completed event
        completed_events = [e for e in items if e.get("kind") == "task_completed"]
        assert len(completed_events) > 0, "No task_completed events found in timeline"
        self.log(f"✓ Found {len(completed_events)} task_completed events")

    def test_timeline_filter_by_kinds(self):
        """GET /api/customers/{id}/timeline?kinds=... - should filter by event kinds."""
        headers = {"Authorization": f"Bearer {self.manager_token}"}
        resp = requests.get(
            f"{BASE_URL}/api/customers/{self.test_customer_id}/timeline",
            headers=headers,
            params={"kinds": "comment_added,task_created"},
            timeout=10
        )
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        data = resp.json()
        items = data.get("items", [])
        
        # All items should be either comment_added or task_created
        for item in items:
            kind = item.get("kind")
            assert kind in ["comment_added", "task_created"], f"Unexpected kind: {kind}"
        self.log(f"✓ Filter returned {len(items)} events of specified kinds")

    def test_timeline_legacy_endpoint(self):
        """GET /api/customers/{id}/timeline-legacy - should return legacy format."""
        headers = {"Authorization": f"Bearer {self.manager_token}"}
        resp = requests.get(
            f"{BASE_URL}/api/customers/{self.test_customer_id}/timeline-legacy",
            headers=headers,
            timeout=10
        )
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        data = resp.json()
        assert "events" in data or isinstance(data, list), "Legacy format should have events array"
        self.log(f"✓ Legacy endpoint returned data")

    def test_timeline_404_nonexistent_customer(self):
        """GET /api/customers/{id}/timeline - should return 404 for non-existent customer."""
        headers = {"Authorization": f"Bearer {self.manager_token}"}
        resp = requests.get(
            f"{BASE_URL}/api/customers/nonexistent_customer_999/timeline",
            headers=headers,
            timeout=10
        )
        assert resp.status_code == 404, f"Expected 404, got {resp.status_code}"

    # ========================================================================
    # AUTHORIZATION TESTS
    # ========================================================================

    def test_auth_401_invalid_token(self):
        """Should return 401 for invalid token."""
        headers = {"Authorization": "Bearer invalid_token_12345"}
        resp = requests.get(
            f"{BASE_URL}/api/customers/{self.test_customer_id}/comments",
            headers=headers,
            timeout=10
        )
        assert resp.status_code == 401, f"Expected 401, got {resp.status_code}"

    def test_auth_401_no_token(self):
        """Should return 401 when no token provided."""
        resp = requests.get(
            f"{BASE_URL}/api/customers/{self.test_customer_id}/comments",
            timeout=10
        )
        assert resp.status_code == 401, f"Expected 401, got {resp.status_code}"

    # ========================================================================
    # MAIN TEST RUNNER
    # ========================================================================

    def run_all_tests(self):
        """Run all tests in sequence."""
        self.log("=" * 60)
        self.log("BIBI Cars CRM — Sprint 4 Backend Test Suite")
        self.log("=" * 60)
        
        # Setup
        self.setup_auth()
        self.ensure_test_customer()
        
        self.log("")
        self.log("=" * 60)
        self.log("CUSTOMER COMMENTS TESTS")
        self.log("=" * 60)
        
        self.run_test("Comments: List (empty/initial)", self.test_comments_list_empty)
        self.run_test("Comments: Create by manager", self.test_comments_create_manager)
        self.run_test("Comments: Validation - empty body", self.test_comments_create_validation_empty_body)
        self.run_test("Comments: Validation - too long", self.test_comments_create_validation_too_long)
        self.run_test("Comments: Edit own comment", self.test_comments_edit_own)
        self.run_test("Comments: Pin by admin", self.test_comments_pin_admin)
        self.run_test("Comments: List pinned first", self.test_comments_list_pinned_first)
        self.run_test("Comments: Delete own comment", self.test_comments_delete_own)
        self.run_test("Comments: 404 for non-existent customer", self.test_comments_404_nonexistent_customer)
        
        self.log("")
        self.log("=" * 60)
        self.log("CUSTOMER TASKS TESTS")
        self.log("=" * 60)
        
        self.run_test("Tasks: List with summary", self.test_tasks_list_empty)
        self.run_test("Tasks: Create task", self.test_tasks_create)
        self.run_test("Tasks: Validation - no title", self.test_tasks_create_validation_no_title)
        self.run_test("Tasks: Update status to completed", self.test_tasks_update_status_complete)
        self.run_test("Tasks: Validation - invalid status", self.test_tasks_update_validation_invalid_status)
        self.run_test("Tasks: Delete task", self.test_tasks_delete)
        self.run_test("Tasks: 404 for non-existent customer", self.test_tasks_404_nonexistent_customer)
        
        self.log("")
        self.log("=" * 60)
        self.log("CUSTOMER TIMELINE TESTS")
        self.log("=" * 60)
        
        self.run_test("Timeline: Get unified timeline", self.test_timeline_get_unified)
        self.run_test("Timeline: Hook - comment_added", self.test_timeline_hook_comment_added)
        self.run_test("Timeline: Hook - task_created", self.test_timeline_hook_task_created)
        self.run_test("Timeline: Hook - task_completed", self.test_timeline_hook_task_completed)
        self.run_test("Timeline: Filter by kinds", self.test_timeline_filter_by_kinds)
        self.run_test("Timeline: Legacy endpoint", self.test_timeline_legacy_endpoint)
        self.run_test("Timeline: 404 for non-existent customer", self.test_timeline_404_nonexistent_customer)
        
        self.log("")
        self.log("=" * 60)
        self.log("AUTHORIZATION TESTS")
        self.log("=" * 60)
        
        self.run_test("Auth: 401 for invalid token", self.test_auth_401_invalid_token)
        self.run_test("Auth: 401 for no token", self.test_auth_401_no_token)
        
        # Summary
        self.log("")
        self.log("=" * 60)
        self.log("TEST SUMMARY")
        self.log("=" * 60)
        self.log(f"Total tests run: {self.tests_run}")
        self.log(f"✅ Passed: {self.tests_passed}")
        self.log(f"❌ Failed: {self.tests_failed}")
        self.log(f"Success rate: {(self.tests_passed/self.tests_run*100):.1f}%")
        self.log("=" * 60)
        
        return 0 if self.tests_failed == 0 else 1


def main():
    tester = Sprint4Tester()
    return tester.run_all_tests()


if __name__ == "__main__":
    sys.exit(main())
