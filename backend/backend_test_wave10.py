"""
BIBI Cars — Wave 10A/10B Backend Test
======================================
Tests Lead Intelligence features:
  - Priority scoring (A/B/C/D buckets)
  - Smart Filters (7 presets)
  - Heatmap (green/yellow/orange/red/success/neutral)
  - Days since contact
"""
import requests
import sys
from datetime import datetime

BASE_URL = "https://full-deploy-22.preview.emergentagent.com/api"

# Test credentials from /app/memory/test_credentials.md
ADMIN_EMAIL = "admin@bibi.cars"
ADMIN_PASSWORD = "Jp3FS_7ZuE2bhHp7rFkJm9B9T_TeiHxu"

class Wave10Tester:
    def __init__(self):
        self.token = None
        self.tests_run = 0
        self.tests_passed = 0
        self.tests_failed = 0
        self.failures = []

    def log(self, msg, level="INFO"):
        prefix = "✅" if level == "PASS" else "❌" if level == "FAIL" else "🔍"
        print(f"{prefix} {msg}")

    def test(self, name, condition, details=""):
        self.tests_run += 1
        if condition:
            self.tests_passed += 1
            self.log(f"PASS: {name}", "PASS")
            if details:
                print(f"   └─ {details}")
            return True
        else:
            self.tests_failed += 1
            self.failures.append(name)
            self.log(f"FAIL: {name}", "FAIL")
            if details:
                print(f"   └─ {details}")
            return False

    def login(self):
        """Login and get token"""
        self.log(f"Logging in as {ADMIN_EMAIL}...")
        try:
            r = requests.post(
                f"{BASE_URL}/auth/login",
                json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
                timeout=10
            )
            if r.status_code == 200:
                data = r.json()
                self.token = data.get("access_token") or data.get("token")
                if self.token:
                    self.log("Login successful", "PASS")
                    return True
                else:
                    self.log(f"Login response missing token. Response: {data}", "FAIL")
                    return False
            else:
                self.log(f"Login failed: {r.status_code} - {r.text[:200]}", "FAIL")
                return False
        except Exception as e:
            self.log(f"Login error: {e}", "FAIL")
            return False

    def get(self, endpoint, params=None):
        """GET request with auth"""
        headers = {"Authorization": f"Bearer {self.token}"}
        r = requests.get(f"{BASE_URL}{endpoint}", headers=headers, params=params, timeout=15)
        return r

    def test_smart_filters(self):
        """Test GET /api/leads/smart-filters returns 7 presets"""
        self.log("\n=== Testing Smart Filters Endpoint ===")
        try:
            r = self.get("/leads/smart-filters")
            self.test(
                "Smart filters endpoint returns 200",
                r.status_code == 200,
                f"Status: {r.status_code}"
            )
            
            if r.status_code == 200:
                data = r.json()
                items = data.get("items", [])
                
                self.test(
                    "Smart filters returns 7 presets",
                    len(items) == 7,
                    f"Got {len(items)} presets"
                )
                
                # Check required fields
                if items:
                    first = items[0]
                    has_fields = all(k in first for k in ["id", "name", "description", "icon", "color", "query"])
                    self.test(
                        "Smart filter has required fields",
                        has_fields,
                        f"Fields: {list(first.keys())}"
                    )
                    
                    # Check specific presets exist
                    preset_ids = [item["id"] for item in items]
                    expected = ["needs_contact_today", "no_contact_7d", "hot_no_task", 
                               "ready_to_convert", "stuck_negotiation", "no_manager", "high_budget_active"]
                    
                    for exp_id in expected:
                        self.test(
                            f"Smart filter '{exp_id}' exists",
                            exp_id in preset_ids,
                            f"Found: {exp_id in preset_ids}"
                        )
                
        except Exception as e:
            self.test("Smart filters endpoint", False, f"Error: {e}")

    def test_kanban_enrichment(self):
        """Test GET /api/leads/kanban returns enriched items"""
        self.log("\n=== Testing Kanban Enrichment ===")
        try:
            r = self.get("/leads/kanban")
            self.test(
                "Kanban endpoint returns 200",
                r.status_code == 200,
                f"Status: {r.status_code}"
            )
            
            if r.status_code == 200:
                data = r.json()
                columns = data.get("columns", [])
                
                self.test(
                    "Kanban returns columns",
                    len(columns) > 0,
                    f"Got {len(columns)} columns"
                )
                
                # Check first item in first column
                if columns and columns[0].get("items"):
                    item = columns[0]["items"][0]
                    
                    # Check priority enrichment
                    has_priority = "priorityBucket" in item
                    self.test(
                        "Kanban item has priorityBucket",
                        has_priority,
                        f"priorityBucket: {item.get('priorityBucket', 'MISSING')}"
                    )
                    
                    if has_priority:
                        bucket = item.get("priorityBucket")
                        self.test(
                            "priorityBucket is A/B/C/D",
                            bucket in ["A", "B", "C", "D"],
                            f"Got: {bucket}"
                        )
                    
                    # Check heatmap enrichment
                    has_heat = "heatColor" in item
                    self.test(
                        "Kanban item has heatColor",
                        has_heat,
                        f"heatColor: {item.get('heatColor', 'MISSING')}"
                    )
                    
                    if has_heat:
                        heat = item.get("heatColor")
                        valid_colors = ["green", "yellow", "orange", "red", "success", "neutral"]
                        self.test(
                            "heatColor is valid",
                            heat in valid_colors,
                            f"Got: {heat}"
                        )
                    
                    # Check days since contact
                    has_days = "daysSinceContact" in item
                    self.test(
                        "Kanban item has daysSinceContact",
                        has_days,
                        f"daysSinceContact: {item.get('daysSinceContact', 'MISSING')}"
                    )
                    
                    # Check healthBucket
                    has_health = "healthBucket" in item
                    self.test(
                        "Kanban item has healthBucket",
                        has_health,
                        f"healthBucket: {item.get('healthBucket', 'MISSING')}"
                    )
                    
        except Exception as e:
            self.test("Kanban enrichment", False, f"Error: {e}")

    def test_priority_filter(self):
        """Test GET /api/leads/kanban?priority=A filters correctly"""
        self.log("\n=== Testing Priority Filter ===")
        try:
            # Get all leads first
            r_all = self.get("/leads/kanban")
            if r_all.status_code != 200:
                self.test("Priority filter - get all leads", False, "Failed to get all leads")
                return
            
            all_data = r_all.json()
            all_columns = all_data.get("columns", [])
            all_items = []
            for col in all_columns:
                all_items.extend(col.get("items", []))
            
            # Count A-bucket leads
            a_count = sum(1 for item in all_items if item.get("priorityBucket") == "A")
            
            self.test(
                "Found A-bucket leads in dataset",
                a_count > 0,
                f"Found {a_count} A-bucket leads"
            )
            
            # Filter by priority=A
            r_a = self.get("/leads/kanban", params={"priority": "A"})
            self.test(
                "Priority filter endpoint returns 200",
                r_a.status_code == 200,
                f"Status: {r_a.status_code}"
            )
            
            if r_a.status_code == 200:
                a_data = r_a.json()
                a_columns = a_data.get("columns", [])
                a_items = []
                for col in a_columns:
                    a_items.extend(col.get("items", []))
                
                # All returned items should be A-bucket
                all_are_a = all(item.get("priorityBucket") == "A" for item in a_items)
                self.test(
                    "All filtered items are A-bucket",
                    all_are_a,
                    f"Got {len(a_items)} items, all A-bucket: {all_are_a}"
                )
                
                # Test B-bucket filter
                r_b = self.get("/leads/kanban", params={"priority": "B"})
                if r_b.status_code == 200:
                    b_data = r_b.json()
                    b_columns = b_data.get("columns", [])
                    b_items = []
                    for col in b_columns:
                        b_items.extend(col.get("items", []))
                    
                    all_are_b = all(item.get("priorityBucket") == "B" for item in b_items)
                    self.test(
                        "Priority=B filter works",
                        all_are_b,
                        f"Got {len(b_items)} B-bucket items"
                    )
                
        except Exception as e:
            self.test("Priority filter", False, f"Error: {e}")

    def test_list_priority_filter(self):
        """Test GET /api/leads?priority=B"""
        self.log("\n=== Testing List Priority Filter ===")
        try:
            r = self.get("/leads", params={"priority": "B"})
            self.test(
                "List priority filter returns 200",
                r.status_code == 200,
                f"Status: {r.status_code}"
            )
            
            if r.status_code == 200:
                data = r.json()
                items = data.get("items", [])
                
                if items:
                    all_are_b = all(item.get("priorityBucket") == "B" for item in items)
                    self.test(
                        "All list items are B-bucket",
                        all_are_b,
                        f"Got {len(items)} items"
                    )
                else:
                    self.log("   └─ No B-bucket leads in dataset (OK if true)")
                
        except Exception as e:
            self.test("List priority filter", False, f"Error: {e}")

    def test_lead_360_priority(self):
        """Test GET /api/leads/{id}/360 includes priority object"""
        self.log("\n=== Testing Lead360 Priority ===")
        try:
            # Get first lead ID
            r_list = self.get("/leads", params={"limit": 1})
            if r_list.status_code != 200:
                self.test("Lead360 - get lead list", False, "Failed to get leads")
                return
            
            leads = r_list.json().get("items", [])
            if not leads:
                self.test("Lead360 - find lead", False, "No leads in system")
                return
            
            lead_id = leads[0].get("id")
            self.log(f"Testing Lead360 for lead: {lead_id}")
            
            r = self.get(f"/leads/{lead_id}/360")
            self.test(
                "Lead360 endpoint returns 200",
                r.status_code == 200,
                f"Status: {r.status_code}"
            )
            
            if r.status_code == 200:
                data = r.json()
                
                # Check priority object
                has_priority = "priority" in data
                self.test(
                    "Lead360 has priority object",
                    has_priority,
                    f"Keys: {list(data.keys())}"
                )
                
                if has_priority:
                    priority = data["priority"]
                    required_fields = ["score", "bucket", "label", "reasons"]
                    has_all = all(k in priority for k in required_fields)
                    
                    self.test(
                        "Priority object has required fields",
                        has_all,
                        f"Fields: {list(priority.keys())}"
                    )
                    
                    if has_all:
                        # Validate values
                        score = priority.get("score")
                        bucket = priority.get("bucket")
                        
                        self.test(
                            "Priority score is 0-100",
                            isinstance(score, int) and 0 <= score <= 100,
                            f"Score: {score}"
                        )
                        
                        self.test(
                            "Priority bucket is A/B/C/D",
                            bucket in ["A", "B", "C", "D"],
                            f"Bucket: {bucket}"
                        )
                        
                        self.test(
                            "Priority reasons is list",
                            isinstance(priority.get("reasons"), list),
                            f"Reasons: {len(priority.get('reasons', []))} items"
                        )
                
                # Check lead enrichment
                lead = data.get("lead", {})
                self.test(
                    "Lead has heatColor",
                    "heatColor" in lead,
                    f"heatColor: {lead.get('heatColor', 'MISSING')}"
                )
                
                self.test(
                    "Lead has priorityBucket",
                    "priorityBucket" in lead,
                    f"priorityBucket: {lead.get('priorityBucket', 'MISSING')}"
                )
                
        except Exception as e:
            self.test("Lead360 priority", False, f"Error: {e}")

    def test_smart_filter_application(self):
        """Test applying smart filter 'ready_to_convert'"""
        self.log("\n=== Testing Smart Filter Application ===")
        try:
            # ready_to_convert: status=decision, healthStatus=healthy
            r = self.get("/leads/kanban", params={"status": "decision", "healthStatus": "healthy"})
            self.test(
                "Smart filter application returns 200",
                r.status_code == 200,
                f"Status: {r.status_code}"
            )
            
            if r.status_code == 200:
                data = r.json()
                columns = data.get("columns", [])
                items = []
                for col in columns:
                    items.extend(col.get("items", []))
                
                # All items should match filter (at least healthStatus)
                if items:
                    all_healthy = all(item.get("healthBucket") == "healthy" for item in items)
                    decision_count = sum(1 for item in items if item.get("status") == "decision")
                    self.test(
                        "Filtered items match health criteria",
                        all_healthy,
                        f"Got {len(items)} items, {decision_count} in decision status, all healthy: {all_healthy}"
                    )
                else:
                    self.log("   └─ No leads match 'ready_to_convert' filter (OK if true)")
                
        except Exception as e:
            self.test("Smart filter application", False, f"Error: {e}")

    def test_priority_bucket_logic(self):
        """Test priority bucket logic validation"""
        self.log("\n=== Testing Priority Bucket Logic ===")
        try:
            # Get all leads
            r = self.get("/leads/kanban")
            if r.status_code != 200:
                self.test("Priority logic - get leads", False, "Failed to get leads")
                return
            
            data = r.json()
            columns = data.get("columns", [])
            items = []
            for col in columns:
                items.extend(col.get("items", []))
            
            # Count distribution
            distribution = {"A": 0, "B": 0, "C": 0, "D": 0}
            for item in items:
                bucket = item.get("priorityBucket")
                if bucket in distribution:
                    distribution[bucket] += 1
            
            total = sum(distribution.values())
            self.test(
                "All leads have priority bucket",
                total == len(items),
                f"Distribution: A={distribution['A']}, B={distribution['B']}, C={distribution['C']}, D={distribution['D']}"
            )
            
            # Check high-budget lead in negotiation should be A or B
            high_budget_negotiation = [
                item for item in items 
                if item.get("status") == "negotiation" and 
                   (item.get("budgetEur", 0) >= 30000 or item.get("budgetUsd", 0) >= 30000)
            ]
            
            if high_budget_negotiation:
                item = high_budget_negotiation[0]
                bucket = item.get("priorityBucket")
                self.test(
                    "High-budget negotiation lead is A or B",
                    bucket in ["A", "B"],
                    f"Budget: {item.get('budgetEur', 0)}, Status: {item.get('status')}, Bucket: {bucket}"
                )
            
            # Check new lead with no budget should be C or D
            new_no_budget = [
                item for item in items 
                if item.get("status") == "new" and 
                   (item.get("budgetEur", 0) == 0 and item.get("budgetUsd", 0) == 0)
            ]
            
            if new_no_budget:
                item = new_no_budget[0]
                bucket = item.get("priorityBucket")
                self.test(
                    "New lead with no budget is C or D",
                    bucket in ["C", "D"],
                    f"Status: {item.get('status')}, Budget: 0, Bucket: {bucket}"
                )
            
        except Exception as e:
            self.test("Priority bucket logic", False, f"Error: {e}")

    def run_all(self):
        """Run all tests"""
        print("\n" + "="*60)
        print("BIBI Cars — Wave 10A/10B Backend Test")
        print("="*60)
        
        if not self.login():
            print("\n❌ Login failed. Cannot proceed with tests.")
            return 1
        
        # Run all test suites
        self.test_smart_filters()
        self.test_kanban_enrichment()
        self.test_priority_filter()
        self.test_list_priority_filter()
        self.test_lead_360_priority()
        self.test_smart_filter_application()
        self.test_priority_bucket_logic()
        
        # Summary
        print("\n" + "="*60)
        print("TEST SUMMARY")
        print("="*60)
        print(f"Total tests:  {self.tests_run}")
        print(f"✅ Passed:    {self.tests_passed}")
        print(f"❌ Failed:    {self.tests_failed}")
        
        if self.failures:
            print("\nFailed tests:")
            for failure in self.failures:
                print(f"  - {failure}")
        
        success_rate = (self.tests_passed / self.tests_run * 100) if self.tests_run > 0 else 0
        print(f"\nSuccess rate: {success_rate:.1f}%")
        print("="*60 + "\n")
        
        return 0 if self.tests_failed == 0 else 1

if __name__ == "__main__":
    tester = Wave10Tester()
    sys.exit(tester.run_all())
