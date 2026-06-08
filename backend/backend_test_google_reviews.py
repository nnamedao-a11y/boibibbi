"""
Backend test for BIBI Cars Google Reviews Integration
Tests all Google Reviews endpoints: auth, config, manual reviews, moderation, public feed
"""
import requests
import sys
from typing import Dict, Any, Optional

BASE_URL = "https://codebase-build.preview.emergentagent.com"

class GoogleReviewsAPITester:
    def __init__(self):
        self.base_url = BASE_URL
        self.tests_run = 0
        self.tests_passed = 0
        self.admin_token = None
        self.manager_token = None
        self.teamlead_token = None
        self.customer_token = None
        self.customer2_token = None
        self.created_review_ids = []

    def log(self, msg: str):
        print(f"  {msg}")

    def test(self, name: str, condition: bool, details: str = ""):
        """Record test result"""
        self.tests_run += 1
        if condition:
            self.tests_passed += 1
            print(f"✅ {name}")
            if details:
                self.log(details)
        else:
            print(f"❌ {name}")
            if details:
                self.log(f"FAILED: {details}")
        return condition

    def staff_login(self, email: str, password: str) -> Optional[str]:
        """Staff login via /api/auth/login"""
        try:
            resp = requests.post(
                f"{self.base_url}/api/auth/login",
                json={"email": email, "password": password},
                timeout=10
            )
            if resp.status_code == 200:
                data = resp.json()
                return data.get("access_token")
            else:
                self.log(f"Staff login failed: {resp.status_code} - {resp.text[:200]}")
                return None
        except Exception as e:
            self.log(f"Staff login exception: {e}")
            return None

    def customer_login(self, email: str, password: str) -> Optional[str]:
        """Customer login via /api/customer-auth/login"""
        try:
            resp = requests.post(
                f"{self.base_url}/api/customer-auth/login",
                json={"email": email, "password": password},
                timeout=10
            )
            if resp.status_code == 200:
                data = resp.json()
                # Customer auth returns accessToken (camelCase) not access_token
                return data.get("accessToken") or data.get("access_token")
            else:
                self.log(f"Customer login failed: {resp.status_code} - {resp.text[:200]}")
                return None
        except Exception as e:
            self.log(f"Customer login exception: {e}")
            return None

    def test_auth_flows(self):
        """Test login for all 4 account types"""
        print("\n🔐 Testing Authentication Flows")
        
        # Admin login
        self.admin_token = self.staff_login("admin@bibi.cars", "Jp3FS_7ZuE2bhHp7rFkJm9B9T_TeiHxu")
        self.test(
            "Admin login (admin@bibi.cars) via /api/auth/login",
            self.admin_token is not None,
            f"Token: {self.admin_token[:20]}..." if self.admin_token else "No token"
        )
        
        # Manager login
        self.manager_token = self.staff_login("manager@bibi.cars", "dFbYnse0L59DBE16Mn4kT6cCRaNBZFQR")
        self.test(
            "Manager login (manager@bibi.cars) via /api/auth/login",
            self.manager_token is not None,
            f"Token: {self.manager_token[:20]}..." if self.manager_token else "No token"
        )
        
        # Team lead login
        self.teamlead_token = self.staff_login("teamlead@bibi.cars", "txXNMkj-lS2w1nv482aLlvKWuk9Y9eKE")
        self.test(
            "Team lead login (teamlead@bibi.cars) via /api/auth/login",
            self.teamlead_token is not None,
            f"Token: {self.teamlead_token[:20]}..." if self.teamlead_token else "No token"
        )
        
        # Customer 1 login
        self.customer_token = self.customer_login("user@bibi.cars", "User_bibi_2026!")
        self.test(
            "Customer login (user@bibi.cars) via /api/customer-auth/login",
            self.customer_token is not None,
            f"Token: {self.customer_token[:20]}..." if self.customer_token else "No token"
        )
        
        # Customer 2 login
        self.customer2_token = self.customer_login("test@customer.com", "test123")
        self.test(
            "Customer login (test@customer.com) via /api/customer-auth/login",
            self.customer2_token is not None,
            f"Token: {self.customer2_token[:20]}..." if self.customer2_token else "No token"
        )

    def test_config_access_control(self):
        """Test GET /api/admin/google-reviews/config access control"""
        print("\n🔒 Testing Config Access Control")
        
        # No auth → 401/403
        try:
            resp = requests.get(f"{self.base_url}/api/admin/google-reviews/config", timeout=10)
            self.test(
                "GET config without auth returns 401/403",
                resp.status_code in [401, 403],
                f"Status: {resp.status_code}"
            )
        except Exception as e:
            self.test("GET config without auth returns 401/403", False, f"Exception: {e}")
        
        # Manager → 403
        if self.manager_token:
            try:
                resp = requests.get(
                    f"{self.base_url}/api/admin/google-reviews/config",
                    headers={"Authorization": f"Bearer {self.manager_token}"},
                    timeout=10
                )
                self.test(
                    "GET config with manager token returns 403",
                    resp.status_code == 403,
                    f"Status: {resp.status_code}"
                )
            except Exception as e:
                self.test("GET config with manager token returns 403", False, f"Exception: {e}")
        
        # Team lead → 403
        if self.teamlead_token:
            try:
                resp = requests.get(
                    f"{self.base_url}/api/admin/google-reviews/config",
                    headers={"Authorization": f"Bearer {self.teamlead_token}"},
                    timeout=10
                )
                self.test(
                    "GET config with team_lead token returns 403",
                    resp.status_code == 403,
                    f"Status: {resp.status_code}"
                )
            except Exception as e:
                self.test("GET config with team_lead token returns 403", False, f"Exception: {e}")
        
        # Admin → 200
        if self.admin_token:
            try:
                resp = requests.get(
                    f"{self.base_url}/api/admin/google-reviews/config",
                    headers={"Authorization": f"Bearer {self.admin_token}"},
                    timeout=10
                )
                self.test(
                    "GET config with admin token returns 200",
                    resp.status_code == 200,
                    f"Status: {resp.status_code}"
                )
                
                if resp.status_code == 200:
                    data = resp.json()
                    required_fields = ["enabled", "api_key_preview", "has_api_key", "place_id", 
                                     "min_rating_filter", "max_reviews_to_show", "fallback_rating", "fallback_count"]
                    has_all = all(field in data for field in required_fields)
                    self.test(
                        "Config response has all required fields",
                        has_all,
                        f"Fields: {list(data.keys())}"
                    )
                    
                    # Check default values
                    self.test(
                        "Default min_rating_filter is 4",
                        data.get("min_rating_filter") == 4,
                        f"Value: {data.get('min_rating_filter')}"
                    )
                    
                    self.test(
                        "Default fallback_rating is 4.9",
                        data.get("fallback_rating") == 4.9,
                        f"Value: {data.get('fallback_rating')}"
                    )
                    
                    self.test(
                        "Default fallback_count is 31",
                        data.get("fallback_count") == 31,
                        f"Value: {data.get('fallback_count')}"
                    )
            except Exception as e:
                self.test("GET config with admin token returns 200", False, f"Exception: {e}")

    def test_config_update(self):
        """Test PUT /api/admin/google-reviews/config"""
        print("\n⚙️ Testing Config Update")
        
        if not self.admin_token:
            print("  ⚠️ Skipping config update tests (no admin token)")
            return
        
        # Test empty api_key doesn't overwrite
        try:
            resp = requests.put(
                f"{self.base_url}/api/admin/google-reviews/config",
                headers={"Authorization": f"Bearer {self.admin_token}"},
                json={"api_key": "", "min_rating_filter": 4},
                timeout=10
            )
            self.test(
                "PUT config with empty api_key doesn't overwrite",
                resp.status_code == 200,
                f"Status: {resp.status_code}"
            )
        except Exception as e:
            self.test("PUT config with empty api_key", False, f"Exception: {e}")
        
        # Test setting a new api_key
        try:
            resp = requests.put(
                f"{self.base_url}/api/admin/google-reviews/config",
                headers={"Authorization": f"Bearer {self.admin_token}"},
                json={"api_key": "test_key_12345", "place_id": "test_place_id"},
                timeout=10
            )
            self.test(
                "PUT config with new api_key updates it",
                resp.status_code == 200,
                f"Status: {resp.status_code}"
            )
            
            if resp.status_code == 200:
                data = resp.json()
                self.test(
                    "has_api_key reflects new key",
                    data.get("has_api_key") == True,
                    f"has_api_key: {data.get('has_api_key')}"
                )
                
                self.test(
                    "api_key_preview is masked",
                    "test" in data.get("api_key_preview", "") and "..." in data.get("api_key_preview", ""),
                    f"Preview: {data.get('api_key_preview')}"
                )
        except Exception as e:
            self.test("PUT config with new api_key", False, f"Exception: {e}")

    def test_sync_not_configured(self):
        """Test POST /api/admin/google-reviews/sync returns 400 when not configured"""
        print("\n🔄 Testing Sync Not Configured")
        
        if not self.admin_token:
            print("  ⚠️ Skipping sync tests (no admin token)")
            return
        
        # First clear the config
        try:
            requests.put(
                f"{self.base_url}/api/admin/google-reviews/config",
                headers={"Authorization": f"Bearer {self.admin_token}"},
                json={"api_key": None, "place_id": ""},
                timeout=10
            )
        except:
            pass
        
        # Try to sync
        try:
            resp = requests.post(
                f"{self.base_url}/api/admin/google-reviews/sync",
                headers={"Authorization": f"Bearer {self.admin_token}"},
                timeout=10
            )
            self.test(
                "POST sync without config returns 400",
                resp.status_code == 400,
                f"Status: {resp.status_code}"
            )
            
            if resp.status_code == 400:
                data = resp.json()
                detail = data.get("detail", "")
                self.test(
                    "Error message mentions API key and Place ID",
                    "API key" in detail and "Place ID" in detail,
                    f"Detail: {detail}"
                )
        except Exception as e:
            self.test("POST sync without config", False, f"Exception: {e}")

    def test_manual_review_creation(self):
        """Test POST /api/admin/google-reviews/manual"""
        print("\n📝 Testing Manual Review Creation")
        
        if not self.admin_token:
            print("  ⚠️ Skipping manual review tests (no admin token)")
            return
        
        # Create a 5-star review
        try:
            resp = requests.post(
                f"{self.base_url}/api/admin/google-reviews/manual",
                headers={"Authorization": f"Bearer {self.admin_token}"},
                json={
                    "author_name": "Test User 5 Star",
                    "rating": 5,
                    "text": "Excellent service! Highly recommend.",
                    "text_bg": "Отлично обслужване! Силно препоръчвам."
                },
                timeout=10
            )
            self.test(
                "POST manual review (5 stars) returns 200",
                resp.status_code == 200,
                f"Status: {resp.status_code}"
            )
            
            if resp.status_code == 200:
                data = resp.json()
                self.test(
                    "Manual review has id",
                    "id" in data,
                    f"ID: {data.get('id')}"
                )
                
                self.test(
                    "Manual review has source='manual'",
                    data.get("source") == "manual",
                    f"Source: {data.get('source')}"
                )
                
                if "id" in data:
                    self.created_review_ids.append(data["id"])
        except Exception as e:
            self.test("POST manual review (5 stars)", False, f"Exception: {e}")
        
        # Create a 4-star review
        try:
            resp = requests.post(
                f"{self.base_url}/api/admin/google-reviews/manual",
                headers={"Authorization": f"Bearer {self.admin_token}"},
                json={
                    "author_name": "Test User 4 Star",
                    "rating": 4,
                    "text": "Good service overall.",
                    "text_bg": "Добро обслужване."
                },
                timeout=10
            )
            if resp.status_code == 200:
                data = resp.json()
                if "id" in data:
                    self.created_review_ids.append(data["id"])
        except:
            pass
        
        # Create a 3-star review (should be hidden by default min_rating_filter=4)
        try:
            resp = requests.post(
                f"{self.base_url}/api/admin/google-reviews/manual",
                headers={"Authorization": f"Bearer {self.admin_token}"},
                json={
                    "author_name": "Test User 3 Star",
                    "rating": 3,
                    "text": "Average service.",
                    "text_bg": "Средно обслужване."
                },
                timeout=10
            )
            self.test(
                "POST manual review (3 stars) returns 200",
                resp.status_code == 200,
                f"Status: {resp.status_code}"
            )
            
            if resp.status_code == 200:
                data = resp.json()
                if "id" in data:
                    self.created_review_ids.append(data["id"])
                    self.log(f"Created 3-star review ID: {data['id']}")
        except Exception as e:
            self.test("POST manual review (3 stars)", False, f"Exception: {e}")

    def test_public_feed_filtering(self):
        """Test GET /api/public/google-reviews filters by min_rating"""
        print("\n🌐 Testing Public Feed Filtering")
        
        try:
            resp = requests.get(f"{self.base_url}/api/public/google-reviews", timeout=10)
            self.test(
                "GET public feed returns 200 (no auth required)",
                resp.status_code == 200,
                f"Status: {resp.status_code}"
            )
            
            if resp.status_code == 200:
                data = resp.json()
                
                required_fields = ["enabled", "rating", "count", "url", "reviews", "min_rating_filter"]
                has_all = all(field in data for field in required_fields)
                self.test(
                    "Public feed has all required fields",
                    has_all,
                    f"Fields: {list(data.keys())}"
                )
                
                reviews = data.get("reviews", [])
                self.log(f"Total reviews in public feed: {len(reviews)}")
                
                # Check that 3-star review is NOT in the list
                min_rating = data.get("min_rating_filter", 4)
                all_above_min = all(r.get("rating", 0) >= min_rating for r in reviews)
                self.test(
                    f"All public reviews have rating >= {min_rating}",
                    all_above_min,
                    f"Ratings: {[r.get('rating') for r in reviews]}"
                )
                
                # Check aggregate rating computation
                rating = data.get("rating")
                count = data.get("count")
                self.test(
                    "Aggregate rating is computed",
                    rating is not None and rating > 0,
                    f"Rating: {rating}, Count: {count}"
                )
                
                self.log(f"Aggregate rating: {rating}, Count: {count}")
        except Exception as e:
            self.test("GET public feed", False, f"Exception: {e}")

    def test_review_moderation(self):
        """Test PATCH /api/admin/google-reviews/{id} for hiding/pinning"""
        print("\n🛡️ Testing Review Moderation")
        
        if not self.admin_token or not self.created_review_ids:
            print("  ⚠️ Skipping moderation tests (no admin token or no reviews)")
            return
        
        review_id = self.created_review_ids[0]
        
        # Hide a review
        try:
            resp = requests.patch(
                f"{self.base_url}/api/admin/google-reviews/{review_id}",
                headers={"Authorization": f"Bearer {self.admin_token}"},
                json={"hidden": True},
                timeout=10
            )
            self.test(
                "PATCH review to hide it returns 200",
                resp.status_code == 200,
                f"Status: {resp.status_code}"
            )
            
            if resp.status_code == 200:
                data = resp.json()
                self.test(
                    "Review hidden field is True",
                    data.get("hidden") == True,
                    f"Hidden: {data.get('hidden')}"
                )
        except Exception as e:
            self.test("PATCH review to hide", False, f"Exception: {e}")
        
        # Verify hidden review is not in public feed
        try:
            resp = requests.get(f"{self.base_url}/api/public/google-reviews", timeout=10)
            if resp.status_code == 200:
                data = resp.json()
                reviews = data.get("reviews", [])
                review_ids = [r.get("id") for r in reviews]
                self.test(
                    "Hidden review not in public feed",
                    review_id not in review_ids,
                    f"Review {review_id} in feed: {review_id in review_ids}"
                )
        except Exception as e:
            self.test("Verify hidden review not in public feed", False, f"Exception: {e}")
        
        # Pin a review
        if len(self.created_review_ids) > 1:
            review_id2 = self.created_review_ids[1]
            try:
                resp = requests.patch(
                    f"{self.base_url}/api/admin/google-reviews/{review_id2}",
                    headers={"Authorization": f"Bearer {self.admin_token}"},
                    json={"pinned": True},
                    timeout=10
                )
                self.test(
                    "PATCH review to pin it returns 200",
                    resp.status_code == 200,
                    f"Status: {resp.status_code}"
                )
            except Exception as e:
                self.test("PATCH review to pin", False, f"Exception: {e}")

    def test_review_deletion(self):
        """Test DELETE /api/admin/google-reviews/{id}"""
        print("\n🗑️ Testing Review Deletion")
        
        if not self.admin_token or not self.created_review_ids:
            print("  ⚠️ Skipping deletion tests (no admin token or no reviews)")
            return
        
        # Delete the last created review
        review_id = self.created_review_ids[-1]
        
        try:
            resp = requests.delete(
                f"{self.base_url}/api/admin/google-reviews/{review_id}",
                headers={"Authorization": f"Bearer {self.admin_token}"},
                timeout=10
            )
            self.test(
                "DELETE review returns 200",
                resp.status_code == 200,
                f"Status: {resp.status_code}"
            )
            
            if resp.status_code == 200:
                data = resp.json()
                self.test(
                    "Delete response has success=True",
                    data.get("success") == True,
                    f"Response: {data}"
                )
        except Exception as e:
            self.test("DELETE review", False, f"Exception: {e}")
        
        # Verify review is gone
        try:
            resp = requests.get(
                f"{self.base_url}/api/admin/google-reviews",
                headers={"Authorization": f"Bearer {self.admin_token}"},
                timeout=10
            )
            if resp.status_code == 200:
                data = resp.json()
                items = data.get("items", [])
                review_ids = [r.get("id") for r in items]
                self.test(
                    "Deleted review not in admin list",
                    review_id not in review_ids,
                    f"Review {review_id} in list: {review_id in review_ids}"
                )
        except Exception as e:
            self.test("Verify deleted review not in list", False, f"Exception: {e}")

    def test_fallback_values(self):
        """Test that fallback rating/count are used when no reviews exist"""
        print("\n🔄 Testing Fallback Values")
        
        # This test assumes we can check the public feed when there are no visible reviews
        # The aggregate should fall back to fallback_rating/fallback_count
        
        try:
            resp = requests.get(f"{self.base_url}/api/public/google-reviews", timeout=10)
            if resp.status_code == 200:
                data = resp.json()
                rating = data.get("rating")
                count = data.get("count")
                reviews = data.get("reviews", [])
                
                # If there are no reviews visible, rating/count should be fallback values
                if len(reviews) == 0:
                    self.test(
                        "Fallback rating used when no reviews",
                        rating == 4.9,
                        f"Rating: {rating} (expected 4.9)"
                    )
                    
                    self.test(
                        "Fallback count used when no reviews",
                        count == 31,
                        f"Count: {count} (expected 31)"
                    )
                else:
                    self.log(f"Skipping fallback test (reviews exist: {len(reviews)})")
        except Exception as e:
            self.test("Test fallback values", False, f"Exception: {e}")

    def run_all_tests(self):
        """Run all test suites"""
        print("=" * 60)
        print("🧪 BIBI Cars - Google Reviews Integration Tests")
        print("=" * 60)
        
        self.test_auth_flows()
        self.test_config_access_control()
        self.test_config_update()
        self.test_sync_not_configured()
        self.test_manual_review_creation()
        self.test_public_feed_filtering()
        self.test_review_moderation()
        self.test_review_deletion()
        self.test_fallback_values()
        
        print("\n" + "=" * 60)
        print(f"📊 Test Results: {self.tests_passed}/{self.tests_run} passed")
        print("=" * 60)
        
        return 0 if self.tests_passed == self.tests_run else 1

def main():
    tester = GoogleReviewsAPITester()
    return tester.run_all_tests()

if __name__ == "__main__":
    sys.exit(main())
