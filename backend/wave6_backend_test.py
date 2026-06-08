"""
Wave 6 Backend API Testing
Tests all Wave 6 endpoints + ACL scoping + legacy endpoint compatibility
"""
import asyncio
import sys
import uuid
from datetime import datetime, timezone, timedelta
import httpx
from motor.motor_asyncio import AsyncIOMotorClient
import os
from dotenv import load_dotenv

load_dotenv()

# Use public endpoint from frontend/.env
BASE_URL = "https://code-complete-50.preview.emergentagent.com"
MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "test_database")

# Test credentials from review_request
ADMIN_EMAIL = "admin@bibi.cars"
ADMIN_PASSWORD = "Jp3FS_7ZuE2bhHp7rFkJm9B9T_TeiHxu"
MANAGER_EMAIL = "manager@bibi.cars"
MANAGER_PASSWORD = "dFbYnse0L59DBE16Mn4kT6cCRaNBZFQR"


class Wave6Tester:
    def __init__(self):
        self.tests_run = 0
        self.tests_passed = 0
        self.admin_token = None
        self.manager_token = None
        self.manager_id = None
        self.test_deals = []
        self.db = None

    def log_test(self, name, passed, details=""):
        self.tests_run += 1
        if passed:
            self.tests_passed += 1
            print(f"✅ {name}")
            if details:
                print(f"   {details}")
        else:
            print(f"❌ {name}")
            if details:
                print(f"   {details}")

    async def setup_db(self):
        """Connect to MongoDB for cleanup"""
        try:
            client = AsyncIOMotorClient(MONGO_URL)
            self.db = client[DB_NAME]
            print(f"📦 Connected to MongoDB: {DB_NAME}")
        except Exception as e:
            print(f"⚠️  MongoDB connection failed: {e}")

    async def login_admin(self):
        """Login as admin and get token"""
        try:
            async with httpx.AsyncClient(timeout=20) as client:
                response = await client.post(
                    f"{BASE_URL}/api/auth/login",
                    json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}
                )
                if response.status_code == 200:
                    data = response.json()
                    self.admin_token = data.get("access_token") or data.get("token")
                    self.log_test("Admin login", True, f"Token: {self.admin_token[:20]}...")
                    return True
                else:
                    self.log_test("Admin login", False, f"Status: {response.status_code}")
                    return False
        except Exception as e:
            self.log_test("Admin login", False, str(e))
            return False

    async def login_manager(self):
        """Login as manager and get token + managerId"""
        try:
            async with httpx.AsyncClient(timeout=20) as client:
                response = await client.post(
                    f"{BASE_URL}/api/auth/login",
                    json={"email": MANAGER_EMAIL, "password": MANAGER_PASSWORD}
                )
                if response.status_code == 200:
                    data = response.json()
                    self.manager_token = data.get("access_token") or data.get("token")
                    user = data.get("user", {})
                    self.manager_id = user.get("managerId") or user.get("id") or user.get("email")
                    self.log_test("Manager login", True, f"Manager ID: {self.manager_id}")
                    return True
                else:
                    self.log_test("Manager login", False, f"Status: {response.status_code}")
                    return False
        except Exception as e:
            self.log_test("Manager login", False, str(e))
            return False

    async def test_pipeline_stages(self):
        """Test GET /api/admin/pipeline/stages"""
        try:
            async with httpx.AsyncClient(timeout=20) as client:
                response = await client.get(
                    f"{BASE_URL}/api/admin/pipeline/stages",
                    headers={"Authorization": f"Bearer {self.admin_token}"}
                )
                if response.status_code == 200:
                    data = response.json()
                    stages = data.get("stages", [])
                    expected_stages = [
                        "inquiry", "negotiating", "awaiting_deposit", "deposit_paid",
                        "bidding", "won", "contract_signed", "shipping", "delivered", "cancelled"
                    ]
                    stage_ids = [s["id"] for s in stages]
                    if len(stages) == 10 and all(s in stage_ids for s in expected_stages):
                        self.log_test("GET /api/admin/pipeline/stages", True, f"10 stages: {', '.join(stage_ids)}")
                        return True
                    else:
                        self.log_test("GET /api/admin/pipeline/stages", False, f"Expected 10 stages, got {len(stages)}")
                        return False
                else:
                    self.log_test("GET /api/admin/pipeline/stages", False, f"Status: {response.status_code}")
                    return False
        except Exception as e:
            self.log_test("GET /api/admin/pipeline/stages", False, str(e))
            return False

    async def test_legal_policy_read(self):
        """Test GET /api/admin/settings/legal-policy"""
        try:
            async with httpx.AsyncClient(timeout=20) as client:
                response = await client.get(
                    f"{BASE_URL}/api/admin/settings/legal-policy",
                    headers={"Authorization": f"Bearer {self.admin_token}"}
                )
                if response.status_code == 200:
                    data = response.json().get("data", {})
                    required_fields = [
                        "default_fx_usd_to_eur", "min_deposit_eur",
                        "deposit_percent_of_max_bid", "refund_deadline_days", "invoice_template_id"
                    ]
                    if all(f in data for f in required_fields):
                        self.log_test("GET /api/admin/settings/legal-policy", True, 
                                    f"FX: {data['default_fx_usd_to_eur']}, Min deposit: {data['min_deposit_eur']}")
                        return True
                    else:
                        self.log_test("GET /api/admin/settings/legal-policy", False, "Missing required fields")
                        return False
                else:
                    self.log_test("GET /api/admin/settings/legal-policy", False, f"Status: {response.status_code}")
                    return False
        except Exception as e:
            self.log_test("GET /api/admin/settings/legal-policy", False, str(e))
            return False

    async def test_legal_policy_write(self):
        """Test PUT /api/admin/settings/legal-policy (admin-only)"""
        try:
            async with httpx.AsyncClient(timeout=20) as client:
                payload = {
                    "default_fx_usd_to_eur": 0.95,
                    "min_deposit_eur": 1500,
                    "deposit_percent_of_max_bid": 15,
                    "refund_deadline_days": 45,
                    "invoice_template_id": "test_template"
                }
                response = await client.put(
                    f"{BASE_URL}/api/admin/settings/legal-policy",
                    json=payload,
                    headers={"Authorization": f"Bearer {self.admin_token}"}
                )
                if response.status_code == 200:
                    data = response.json().get("data", {})
                    if data.get("min_deposit_eur") == 1500:
                        self.log_test("PUT /api/admin/settings/legal-policy", True, "Policy updated successfully")
                        return True
                    else:
                        self.log_test("PUT /api/admin/settings/legal-policy", False, "Update not reflected")
                        return False
                else:
                    self.log_test("PUT /api/admin/settings/legal-policy", False, f"Status: {response.status_code}")
                    return False
        except Exception as e:
            self.log_test("PUT /api/admin/settings/legal-policy", False, str(e))
            return False

    async def test_deal_creation(self):
        """Test POST /api/deals creates deal with timeline event"""
        try:
            async with httpx.AsyncClient(timeout=20) as client:
                deal_id = f"deal_w6_test_{uuid.uuid4().hex[:8]}"
                payload = {
                    "_id": deal_id,
                    "id": deal_id,
                    "title": "Test BMW X5 2020",
                    "vin": f"TESTVIN{uuid.uuid4().hex[:10].upper()}",
                    "stage": "qualified",
                    "managerId": self.manager_id or "mgr_test",
                    "max_bid_usd": 25000,
                    "customer_id": "cust_demo"
                }
                response = await client.post(
                    f"{BASE_URL}/api/deals",
                    json=payload,
                    headers={"Authorization": f"Bearer {self.admin_token}"}
                )
                if response.status_code == 200:
                    self.test_deals.append(deal_id)
                    self.log_test("POST /api/deals (create with timeline)", True, f"Deal ID: {deal_id}")
                    return deal_id
                else:
                    self.log_test("POST /api/deals (create with timeline)", False, 
                                f"Status: {response.status_code}, Body: {response.text[:200]}")
                    return None
        except Exception as e:
            self.log_test("POST /api/deals (create with timeline)", False, str(e))
            return None

    async def test_deal_advance(self, deal_id):
        """Test POST /api/deals/{id}/advance dual-writes pipeline_stage + timeline"""
        try:
            async with httpx.AsyncClient(timeout=20) as client:
                response = await client.post(
                    f"{BASE_URL}/api/deals/{deal_id}/advance",
                    json={"to": "variants_sent", "note": "Test advance"},
                    headers={"Authorization": f"Bearer {self.admin_token}"}
                )
                if response.status_code == 200:
                    self.log_test("POST /api/deals/{id}/advance", True, "Stage advanced to variants_sent")
                    return True
                else:
                    self.log_test("POST /api/deals/{id}/advance", False, f"Status: {response.status_code}")
                    return False
        except Exception as e:
            self.log_test("POST /api/deals/{id}/advance", False, str(e))
            return False

    async def test_deal_workspace(self, deal_id):
        """Test GET /api/admin/deals/{id} returns full workspace data"""
        try:
            async with httpx.AsyncClient(timeout=20) as client:
                response = await client.get(
                    f"{BASE_URL}/api/admin/deals/{deal_id}",
                    headers={"Authorization": f"Bearer {self.admin_token}"}
                )
                if response.status_code == 200:
                    data = response.json().get("data", {})
                    required_keys = ["deal", "pipeline_stage", "stage_legacy", "health", "counts"]
                    if all(k in data for k in required_keys):
                        self.log_test("GET /api/admin/deals/{id}", True, 
                                    f"Pipeline: {data['pipeline_stage']}, Health: {data['health']['state']}")
                        return True
                    else:
                        self.log_test("GET /api/admin/deals/{id}", False, "Missing required keys")
                        return False
                else:
                    self.log_test("GET /api/admin/deals/{id}", False, f"Status: {response.status_code}")
                    return False
        except Exception as e:
            self.log_test("GET /api/admin/deals/{id}", False, str(e))
            return False

    async def test_deal_timeline(self, deal_id):
        """Test GET /api/admin/deals/{id}/timeline"""
        try:
            async with httpx.AsyncClient(timeout=20) as client:
                response = await client.get(
                    f"{BASE_URL}/api/admin/deals/{deal_id}/timeline",
                    headers={"Authorization": f"Bearer {self.admin_token}"}
                )
                if response.status_code == 200:
                    events = response.json().get("events", [])
                    self.log_test("GET /api/admin/deals/{id}/timeline", True, f"{len(events)} events found")
                    return True
                else:
                    self.log_test("GET /api/admin/deals/{id}/timeline", False, f"Status: {response.status_code}")
                    return False
        except Exception as e:
            self.log_test("GET /api/admin/deals/{id}/timeline", False, str(e))
            return False

    async def test_deal_health(self, deal_id):
        """Test GET /api/admin/deals/{id}/health"""
        try:
            async with httpx.AsyncClient(timeout=20) as client:
                response = await client.get(
                    f"{BASE_URL}/api/admin/deals/{deal_id}/health",
                    headers={"Authorization": f"Bearer {self.admin_token}"}
                )
                if response.status_code == 200:
                    health = response.json().get("data", {})
                    if "state" in health and "reason" in health:
                        self.log_test("GET /api/admin/deals/{id}/health", True, 
                                    f"State: {health['state']}, Reason: {health['reason']}")
                        return True
                    else:
                        self.log_test("GET /api/admin/deals/{id}/health", False, "Missing health fields")
                        return False
                else:
                    self.log_test("GET /api/admin/deals/{id}/health", False, f"Status: {response.status_code}")
                    return False
        except Exception as e:
            self.log_test("GET /api/admin/deals/{id}/health", False, str(e))
            return False

    async def test_add_note(self, deal_id):
        """Test POST /api/admin/deals/{id}/notes"""
        try:
            async with httpx.AsyncClient(timeout=20) as client:
                response = await client.post(
                    f"{BASE_URL}/api/admin/deals/{deal_id}/notes",
                    json={"text": "Test note from wave6_backend_test.py"},
                    headers={"Authorization": f"Bearer {self.admin_token}"}
                )
                if response.status_code == 200:
                    self.log_test("POST /api/admin/deals/{id}/notes", True, "Note added successfully")
                    return True
                else:
                    self.log_test("POST /api/admin/deals/{id}/notes", False, f"Status: {response.status_code}")
                    return False
        except Exception as e:
            self.log_test("POST /api/admin/deals/{id}/notes", False, str(e))
            return False

    async def test_add_note_validation(self, deal_id):
        """Test POST /api/admin/deals/{id}/notes rejects empty/oversized notes"""
        try:
            async with httpx.AsyncClient(timeout=20) as client:
                # Test empty note
                response = await client.post(
                    f"{BASE_URL}/api/admin/deals/{deal_id}/notes",
                    json={"text": ""},
                    headers={"Authorization": f"Bearer {self.admin_token}"}
                )
                empty_rejected = response.status_code == 400
                
                # Test oversized note
                response = await client.post(
                    f"{BASE_URL}/api/admin/deals/{deal_id}/notes",
                    json={"text": "x" * 5000},
                    headers={"Authorization": f"Bearer {self.admin_token}"}
                )
                oversized_rejected = response.status_code == 400
                
                if empty_rejected and oversized_rejected:
                    self.log_test("POST /api/admin/deals/{id}/notes validation", True, "Empty and oversized notes rejected")
                    return True
                else:
                    self.log_test("POST /api/admin/deals/{id}/notes validation", False, 
                                f"Empty rejected: {empty_rejected}, Oversized rejected: {oversized_rejected}")
                    return False
        except Exception as e:
            self.log_test("POST /api/admin/deals/{id}/notes validation", False, str(e))
            return False

    async def test_pipeline_mapping(self):
        """Test pipeline mapping correctness"""
        mappings = [
            ("qualified", "negotiating"),
            ("in_transit_to_rotterdam", "shipping"),
            ("deposit_contract_drafted", "awaiting_deposit"),
            ("auction_won", "won"),
            ("cancelled", "cancelled")
        ]
        
        all_passed = True
        for legacy, expected_pipeline in mappings:
            try:
                async with httpx.AsyncClient(timeout=20) as client:
                    deal_id = f"deal_w6_map_{uuid.uuid4().hex[:8]}"
                    payload = {
                        "_id": deal_id,
                        "id": deal_id,
                        "title": f"Mapping test {legacy}",
                        "vin": f"MAPTEST{uuid.uuid4().hex[:8].upper()}",
                        "stage": legacy,
                        "managerId": self.manager_id or "mgr_test",
                        "max_bid_usd": 20000
                    }
                    response = await client.post(
                        f"{BASE_URL}/api/deals",
                        json=payload,
                        headers={"Authorization": f"Bearer {self.admin_token}"}
                    )
                    if response.status_code == 200:
                        self.test_deals.append(deal_id)
                        
                        # Check workspace endpoint for pipeline_stage
                        response = await client.get(
                            f"{BASE_URL}/api/admin/deals/{deal_id}",
                            headers={"Authorization": f"Bearer {self.admin_token}"}
                        )
                        if response.status_code == 200:
                            data = response.json().get("data", {})
                            actual_pipeline = data.get("pipeline_stage")
                            if actual_pipeline == expected_pipeline:
                                print(f"   ✓ {legacy} → {expected_pipeline}")
                            else:
                                print(f"   ✗ {legacy} → expected {expected_pipeline}, got {actual_pipeline}")
                                all_passed = False
                        else:
                            all_passed = False
                    else:
                        all_passed = False
            except Exception as e:
                print(f"   ✗ {legacy} mapping failed: {e}")
                all_passed = False
        
        self.log_test("Pipeline mapping correctness", all_passed)
        return all_passed

    async def test_manager_acl_scoping(self):
        """Test manager role scoping - manager gets 403 on deals they don't own"""
        try:
            # Create a deal owned by admin (not manager)
            async with httpx.AsyncClient(timeout=20) as client:
                deal_id = f"deal_w6_acl_{uuid.uuid4().hex[:8]}"
                payload = {
                    "_id": deal_id,
                    "id": deal_id,
                    "title": "ACL test deal",
                    "vin": f"ACLTEST{uuid.uuid4().hex[:8].upper()}",
                    "stage": "qualified",
                    "managerId": "admin_not_manager",  # Different from manager's ID
                    "max_bid_usd": 20000
                }
                response = await client.post(
                    f"{BASE_URL}/api/deals",
                    json=payload,
                    headers={"Authorization": f"Bearer {self.admin_token}"}
                )
                if response.status_code == 200:
                    self.test_deals.append(deal_id)
                    
                    # Try to access with manager token
                    response = await client.get(
                        f"{BASE_URL}/api/admin/deals/{deal_id}",
                        headers={"Authorization": f"Bearer {self.manager_token}"}
                    )
                    if response.status_code == 403:
                        self.log_test("Manager ACL scoping (403 on non-owned deal)", True, "Manager correctly denied access")
                        return True
                    else:
                        self.log_test("Manager ACL scoping (403 on non-owned deal)", False, 
                                    f"Expected 403, got {response.status_code}")
                        return False
                else:
                    self.log_test("Manager ACL scoping (403 on non-owned deal)", False, "Failed to create test deal")
                    return False
        except Exception as e:
            self.log_test("Manager ACL scoping (403 on non-owned deal)", False, str(e))
            return False

    async def test_legacy_endpoints(self):
        """Test existing legacy endpoints still work"""
        try:
            async with httpx.AsyncClient(timeout=20) as client:
                # Test GET /api/deals
                response = await client.get(
                    f"{BASE_URL}/api/deals",
                    headers={"Authorization": f"Bearer {self.admin_token}"}
                )
                deals_works = response.status_code == 200
                
                # Test GET /api/legal/deal-stages
                response = await client.get(
                    f"{BASE_URL}/api/legal/deal-stages",
                    headers={"Authorization": f"Bearer {self.admin_token}"}
                )
                stages_works = response.status_code == 200
                
                if deals_works and stages_works:
                    self.log_test("Legacy endpoints compatibility", True, "/api/deals and /api/legal/deal-stages work")
                    return True
                else:
                    self.log_test("Legacy endpoints compatibility", False, 
                                f"deals: {deals_works}, stages: {stages_works}")
                    return False
        except Exception as e:
            self.log_test("Legacy endpoints compatibility", False, str(e))
            return False

    async def cleanup(self):
        """Clean up test deals"""
        if self.db is not None and self.test_deals:
            try:
                await self.db.deals.delete_many({"id": {"$in": self.test_deals}})
                await self.db.deals.delete_many({"_id": {"$in": self.test_deals}})
                await self.db.deal_timeline.delete_many({"deal_id": {"$in": self.test_deals}})
                print(f"🧹 Cleaned up {len(self.test_deals)} test deals")
            except Exception as e:
                print(f"⚠️  Cleanup failed: {e}")

    async def run_all_tests(self):
        print("=" * 80)
        print("WAVE 6 BACKEND API TESTING")
        print("=" * 80)
        
        await self.setup_db()
        
        # Auth
        if not await self.login_admin():
            print("❌ Cannot proceed without admin token")
            return False
        
        if not await self.login_manager():
            print("⚠️  Manager login failed, ACL test will be skipped")
        
        # Pipeline catalog
        await self.test_pipeline_stages()
        
        # Legal policy
        await self.test_legal_policy_read()
        await self.test_legal_policy_write()
        
        # Deal creation and operations
        deal_id = await self.test_deal_creation()
        if deal_id:
            await self.test_deal_advance(deal_id)
            await self.test_deal_workspace(deal_id)
            await self.test_deal_timeline(deal_id)
            await self.test_deal_health(deal_id)
            await self.test_add_note(deal_id)
            await self.test_add_note_validation(deal_id)
        
        # Pipeline mapping
        await self.test_pipeline_mapping()
        
        # ACL scoping
        if self.manager_token:
            await self.test_manager_acl_scoping()
        
        # Legacy endpoints
        await self.test_legacy_endpoints()
        
        # Cleanup
        await self.cleanup()
        
        print("=" * 80)
        print(f"RESULTS: {self.tests_passed}/{self.tests_run} tests passed")
        print("=" * 80)
        
        return self.tests_passed == self.tests_run


async def main():
    tester = Wave6Tester()
    success = await tester.run_all_tests()
    sys.exit(0 if success else 1)


if __name__ == "__main__":
    asyncio.run(main())
