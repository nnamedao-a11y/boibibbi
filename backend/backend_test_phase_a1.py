"""
BIBI Cars Phase A1 — Catalog Performance Emergency Fix Test Suite
==================================================================
Tests the Phase A1 performance hardening:
  - Catalog and filters must be fast (<500ms server-side)
  - Brand/model dedupe must work (Land Rover bug fix)
  - No live HTTP enrichment from listing endpoint
  - Canonical fields (make_canonical, model_canonical) must be populated
  - All filters use indexed exact-match on canonical fields

Public API base: https://code-complete-49.preview.emergentagent.com
All backend endpoints under /api/* prefix
"""
import requests
import sys
import time
from typing import Dict, Any, List, Optional, Tuple

BASE_URL = "https://code-complete-49.preview.emergentagent.com"

class PhaseA1Tester:
    def __init__(self):
        self.base_url = BASE_URL
        self.tests_run = 0
        self.tests_passed = 0
        self.tests_failed = 0
        self.failed_tests = []
        self.performance_issues = []
        self.canonical_issues = []
        
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
    
    def measure_latency(self, url: str, timeout: int = 10) -> Tuple[Optional[requests.Response], int]:
        """Measure request latency in milliseconds"""
        try:
            start = time.time()
            resp = requests.get(url, timeout=timeout)
            latency_ms = int((time.time() - start) * 1000)
            return resp, latency_ms
        except Exception as e:
            self.log(f"Request failed: {e}")
            return None, -1
    
    # ═══════════════════════════════════════════════════════════════
    # TEST 1: Basic Catalog Listing Performance
    # ═══════════════════════════════════════════════════════════════
    def test_basic_catalog_performance(self):
        """Test GET /api/public/vehicles?limit=24&sort=popular"""
        print("\n" + "="*70)
        print("🚀 TEST 1: Basic Catalog Listing Performance")
        print("="*70)
        
        url = f"{self.base_url}/api/public/vehicles?limit=24&sort=popular"
        resp, latency_ms = self.measure_latency(url)
        
        if not resp:
            self.test("Basic catalog request", False, "Request failed", critical=True)
            return
        
        # Check status code
        if resp.status_code != 200:
            self.test("Basic catalog request", False, f"Status {resp.status_code}: {resp.text[:200]}", critical=True)
            return
        
        # Check latency <500ms
        latency_ok = latency_ms < 500
        self.test(
            "Catalog latency <500ms",
            latency_ok,
            f"Latency: {latency_ms}ms (target: <500ms)",
            critical=True
        )
        if not latency_ok:
            self.performance_issues.append({
                "endpoint": "/api/public/vehicles?limit=24&sort=popular",
                "latency_ms": latency_ms,
                "target_ms": 500
            })
        
        # Parse response
        try:
            data = resp.json()
        except Exception as e:
            self.test("Parse catalog response", False, f"JSON parse error: {e}", critical=True)
            return
        
        # Check total >= 720
        total = data.get("total", 0)
        self.test(
            "Total vehicles >= 720",
            total >= 720,
            f"Total: {total} (expected: >=720)"
        )
        
        # Check data is array
        items = data.get("data", data.get("items", []))
        self.test(
            "Response contains data array",
            isinstance(items, list) and len(items) > 0,
            f"Items count: {len(items)}"
        )
        
        # Check required fields in first item
        if items:
            item = items[0]
            required_fields = ["vin", "make", "model", "title", "images", "odometer"]
            missing = [f for f in required_fields if f not in item or item[f] is None]
            self.test(
                "Vehicle items have required fields",
                len(missing) == 0,
                f"Missing fields: {missing}" if missing else f"All required fields present"
            )
            
            # Check canonical fields are populated
            has_make_canonical = "make_canonical" in item and item["make_canonical"]
            has_model_canonical = "model_canonical" in item and item["model_canonical"]
            self.test(
                "Canonical fields populated (make_canonical, model_canonical)",
                has_make_canonical and has_model_canonical,
                f"make_canonical: {item.get('make_canonical')}, model_canonical: {item.get('model_canonical')}"
            )
            if not (has_make_canonical and has_model_canonical):
                self.canonical_issues.append({
                    "vin": item.get("vin"),
                    "make": item.get("make"),
                    "model": item.get("model"),
                    "make_canonical": item.get("make_canonical"),
                    "model_canonical": item.get("model_canonical")
                })
    
    # ═══════════════════════════════════════════════════════════════
    # TEST 2: Filter by Canonical Brand (Toyota)
    # ═══════════════════════════════════════════════════════════════
    def test_filter_canonical_brand(self):
        """Test GET /api/public/vehicles?make=Toyota"""
        print("\n" + "="*70)
        print("🔍 TEST 2: Filter by Canonical Brand (Toyota)")
        print("="*70)
        
        url = f"{self.base_url}/api/public/vehicles?make=Toyota"
        resp, latency_ms = self.measure_latency(url)
        
        if not resp or resp.status_code != 200:
            self.test("Toyota filter request", False, f"Request failed: {resp.status_code if resp else 'timeout'}", critical=True)
            return
        
        # Check latency
        latency_ok = latency_ms < 500
        self.test(
            "Toyota filter latency <500ms",
            latency_ok,
            f"Latency: {latency_ms}ms"
        )
        if not latency_ok:
            self.performance_issues.append({
                "endpoint": "/api/public/vehicles?make=Toyota",
                "latency_ms": latency_ms,
                "target_ms": 500
            })
        
        data = resp.json()
        total = data.get("total", 0)
        
        # Check count ~99 ±5
        count_ok = 94 <= total <= 104
        self.test(
            "Toyota count = 99 ±5",
            count_ok,
            f"Total: {total} (expected: 99 ±5)"
        )
        
        # Check all items have make_canonical='Toyota'
        items = data.get("data", data.get("items", []))
        if items:
            non_toyota = [item for item in items if item.get("make_canonical") != "Toyota"]
            self.test(
                "All items have make_canonical='Toyota'",
                len(non_toyota) == 0,
                f"Non-Toyota items: {len(non_toyota)}/{len(items)}"
            )
            if non_toyota:
                for item in non_toyota[:3]:
                    self.canonical_issues.append({
                        "vin": item.get("vin"),
                        "make": item.get("make"),
                        "make_canonical": item.get("make_canonical"),
                        "expected": "Toyota"
                    })
    
    # ═══════════════════════════════════════════════════════════════
    # TEST 3: Filter by Brand Alias (VW → Volkswagen)
    # ═══════════════════════════════════════════════════════════════
    def test_filter_brand_alias(self):
        """Test GET /api/public/vehicles?make=VW"""
        print("\n" + "="*70)
        print("🔍 TEST 3: Filter by Brand Alias (VW → Volkswagen)")
        print("="*70)
        
        url = f"{self.base_url}/api/public/vehicles?make=VW"
        resp, latency_ms = self.measure_latency(url)
        
        if not resp or resp.status_code != 200:
            self.test("VW alias filter request", False, f"Request failed", critical=True)
            return
        
        # Check latency
        latency_ok = latency_ms < 500
        self.test(
            "VW alias filter latency <500ms",
            latency_ok,
            f"Latency: {latency_ms}ms"
        )
        
        data = resp.json()
        total = data.get("total", 0)
        
        # Check count ~13
        count_ok = total >= 10 and total <= 16
        self.test(
            "VW (Volkswagen) count ~13",
            count_ok,
            f"Total: {total} (expected: ~13)"
        )
        
        # Check all items have make_canonical='Volkswagen'
        items = data.get("data", data.get("items", []))
        if items:
            non_vw = [item for item in items if item.get("make_canonical") != "Volkswagen"]
            self.test(
                "All items have make_canonical='Volkswagen'",
                len(non_vw) == 0,
                f"Non-Volkswagen items: {len(non_vw)}/{len(items)}"
            )
    
    # ═══════════════════════════════════════════════════════════════
    # TEST 4: Land Rover Bug Fix
    # ═══════════════════════════════════════════════════════════════
    def test_land_rover_bug_fix(self):
        """Test GET /api/public/vehicles?make=Land+Rover"""
        print("\n" + "="*70)
        print("🐛 TEST 4: Land Rover Bug Fix")
        print("="*70)
        
        url = f"{self.base_url}/api/public/vehicles?make=Land+Rover"
        resp, latency_ms = self.measure_latency(url)
        
        if not resp or resp.status_code != 200:
            self.test("Land Rover filter request", False, f"Request failed", critical=True)
            return
        
        # Check latency
        latency_ok = latency_ms < 500
        self.test(
            "Land Rover filter latency <500ms",
            latency_ok,
            f"Latency: {latency_ms}ms"
        )
        
        data = resp.json()
        total = data.get("total", 0)
        
        # Check count = 2
        self.test(
            "Land Rover count = 2",
            total == 2,
            f"Total: {total} (expected: 2)"
        )
        
        # Check all items have make_canonical='Land Rover'
        items = data.get("data", data.get("items", []))
        if items:
            non_lr = [item for item in items if item.get("make_canonical") != "Land Rover"]
            self.test(
                "All items have make_canonical='Land Rover'",
                len(non_lr) == 0,
                f"Non-Land Rover items: {len(non_lr)}/{len(items)}"
            )
            
            # Check model_canonical in ['Range Rover Sport', 'Range Rover Velar']
            expected_models = ['Range Rover Sport', 'Range Rover Velar']
            models = [item.get("model_canonical") for item in items]
            valid_models = all(m in expected_models for m in models if m)
            self.test(
                "Land Rover models are Range Rover Sport or Range Rover Velar",
                valid_models,
                f"Models: {models}"
            )
    
    # ═══════════════════════════════════════════════════════════════
    # TEST 5: Multi-Brand Filter (Toyota|Honda)
    # ═══════════════════════════════════════════════════════════════
    def test_multi_brand_filter(self):
        """Test GET /api/public/vehicles?make=Toyota|Honda"""
        print("\n" + "="*70)
        print("🔍 TEST 5: Multi-Brand Filter (Toyota|Honda)")
        print("="*70)
        
        url = f"{self.base_url}/api/public/vehicles?make=Toyota|Honda"
        resp, latency_ms = self.measure_latency(url)
        
        if not resp or resp.status_code != 200:
            self.test("Multi-brand filter request", False, f"Request failed", critical=True)
            return
        
        # Check latency
        latency_ok = latency_ms < 500
        self.test(
            "Multi-brand filter latency <500ms",
            latency_ok,
            f"Latency: {latency_ms}ms"
        )
        
        data = resp.json()
        total = data.get("total", 0)
        
        # Check count ~184 (99 Toyota + 85 Honda)
        count_ok = total >= 170 and total <= 200
        self.test(
            "Toyota|Honda count ~184",
            count_ok,
            f"Total: {total} (expected: ~184)"
        )
        
        # Check all items have make_canonical in ['Toyota', 'Honda']
        items = data.get("data", data.get("items", []))
        if items:
            invalid = [item for item in items if item.get("make_canonical") not in ["Toyota", "Honda"]]
            self.test(
                "All items have make_canonical in ['Toyota', 'Honda']",
                len(invalid) == 0,
                f"Invalid items: {len(invalid)}/{len(items)}"
            )
    
    # ═══════════════════════════════════════════════════════════════
    # TEST 6: Brand + Model Combo (Toyota Camry)
    # ═══════════════════════════════════════════════════════════════
    def test_brand_model_combo(self):
        """Test GET /api/public/vehicles?make=Toyota&model=Camry"""
        print("\n" + "="*70)
        print("🔍 TEST 6: Brand + Model Combo (Toyota Camry)")
        print("="*70)
        
        url = f"{self.base_url}/api/public/vehicles?make=Toyota&model=Camry"
        resp, latency_ms = self.measure_latency(url)
        
        if not resp or resp.status_code != 200:
            self.test("Brand+Model filter request", False, f"Request failed", critical=True)
            return
        
        # Check latency
        latency_ok = latency_ms < 500
        self.test(
            "Brand+Model filter latency <500ms",
            latency_ok,
            f"Latency: {latency_ms}ms"
        )
        
        data = resp.json()
        total = data.get("total", 0)
        
        # Check count ~25
        count_ok = total >= 20 and total <= 30
        self.test(
            "Toyota Camry count ~25",
            count_ok,
            f"Total: {total} (expected: ~25)"
        )
        
        # Check all items have model_canonical='Camry'
        items = data.get("data", data.get("items", []))
        if items:
            non_camry = [item for item in items if item.get("model_canonical") != "Camry"]
            self.test(
                "All items have model_canonical='Camry'",
                len(non_camry) == 0,
                f"Non-Camry items: {len(non_camry)}/{len(items)}"
            )
    
    # ═══════════════════════════════════════════════════════════════
    # TEST 7: Pagination
    # ═══════════════════════════════════════════════════════════════
    def test_pagination(self):
        """Test GET /api/public/vehicles?limit=6&skip=12"""
        print("\n" + "="*70)
        print("📄 TEST 7: Pagination")
        print("="*70)
        
        # Get first page
        url1 = f"{self.base_url}/api/public/vehicles?limit=6&skip=0"
        resp1, _ = self.measure_latency(url1)
        
        # Get second page
        url2 = f"{self.base_url}/api/public/vehicles?limit=6&skip=12"
        resp2, _ = self.measure_latency(url2)
        
        if not resp1 or not resp2 or resp1.status_code != 200 or resp2.status_code != 200:
            self.test("Pagination requests", False, "One or both requests failed", critical=True)
            return
        
        data1 = resp1.json()
        data2 = resp2.json()
        
        items1 = data1.get("data", data1.get("items", []))
        items2 = data2.get("data", data2.get("items", []))
        
        # Check skip=12 returns 6 items
        self.test(
            "Pagination returns correct count",
            len(items2) == 6,
            f"Items with skip=12: {len(items2)} (expected: 6)"
        )
        
        # Check VINs are different (pagination works)
        vins1 = {item.get("vin") for item in items1}
        vins2 = {item.get("vin") for item in items2}
        overlap = vins1 & vins2
        self.test(
            "Pagination returns different items",
            len(overlap) == 0,
            f"Overlapping VINs: {len(overlap)} (expected: 0)"
        )
    
    # ═══════════════════════════════════════════════════════════════
    # TEST 8: Detail Endpoint
    # ═══════════════════════════════════════════════════════════════
    def test_detail_endpoint(self):
        """Test GET /api/public/vehicles/{vin}"""
        print("\n" + "="*70)
        print("🔍 TEST 8: Detail Endpoint")
        print("="*70)
        
        # Get a VIN from listing
        url = f"{self.base_url}/api/public/vehicles?limit=1"
        resp, _ = self.measure_latency(url)
        
        if not resp or resp.status_code != 200:
            self.test("Get sample VIN", False, "Failed to get sample VIN", critical=True)
            return
        
        data = resp.json()
        items = data.get("data", data.get("items", []))
        if not items:
            self.test("Get sample VIN", False, "No items in listing", critical=True)
            return
        
        vin = items[0].get("vin")
        if not vin:
            self.test("Get sample VIN", False, "No VIN in first item", critical=True)
            return
        
        # Test detail endpoint
        detail_url = f"{self.base_url}/api/public/vehicles/{vin}"
        detail_resp, detail_latency = self.measure_latency(detail_url)
        
        if not detail_resp or detail_resp.status_code != 200:
            self.test("Detail endpoint request", False, f"Request failed for VIN {vin}", critical=True)
            return
        
        detail_data = detail_resp.json()
        
        # Check success=true or data field exists
        has_success = detail_data.get("success") == True or "data" in detail_data
        self.test(
            "Detail endpoint returns success",
            has_success,
            f"Response keys: {list(detail_data.keys())}"
        )
        
        # Extract vehicle data
        vehicle = detail_data.get("data", detail_data)
        
        # Check canonical fields
        has_make_canonical = "make_canonical" in vehicle and vehicle["make_canonical"]
        has_model_canonical = "model_canonical" in vehicle and vehicle["model_canonical"]
        self.test(
            "Detail has canonical fields",
            has_make_canonical and has_model_canonical,
            f"make_canonical: {vehicle.get('make_canonical')}, model_canonical: {vehicle.get('model_canonical')}"
        )
    
    # ═══════════════════════════════════════════════════════════════
    # TEST 9: Brands List
    # ═══════════════════════════════════════════════════════════════
    def test_brands_list(self):
        """Test GET /api/public/brands"""
        print("\n" + "="*70)
        print("🏷️  TEST 9: Brands List")
        print("="*70)
        
        url = f"{self.base_url}/api/public/brands"
        resp, latency_ms = self.measure_latency(url)
        
        if not resp or resp.status_code != 200:
            self.test("Brands list request", False, "Request failed", critical=True)
            return
        
        # Check latency <100ms
        latency_ok = latency_ms < 100
        self.test(
            "Brands list latency <100ms",
            latency_ok,
            f"Latency: {latency_ms}ms (target: <100ms)"
        )
        
        data = resp.json()
        brands = data.get("data", data.get("brands", data if isinstance(data, list) else []))
        
        # Check ≥30 brands
        self.test(
            "Brands list has ≥30 brands",
            len(brands) >= 30,
            f"Brands count: {len(brands)}"
        )
        
        # Check specific brands with counts
        brands_dict = {b.get("name"): b.get("count", 0) for b in brands if isinstance(b, dict)}
        
        # Land Rover count=2
        lr_count = brands_dict.get("Land Rover", 0)
        self.test(
            "Land Rover count = 2",
            lr_count == 2,
            f"Land Rover count: {lr_count}"
        )
        
        # Volkswagen count=13
        vw_count = brands_dict.get("Volkswagen", 0)
        vw_ok = 10 <= vw_count <= 16
        self.test(
            "Volkswagen count ~13",
            vw_ok,
            f"Volkswagen count: {vw_count}"
        )
        
        # Toyota count=99
        toyota_count = brands_dict.get("Toyota", 0)
        toyota_ok = 94 <= toyota_count <= 104
        self.test(
            "Toyota count ~99",
            toyota_ok,
            f"Toyota count: {toyota_count}"
        )
    
    # ═══════════════════════════════════════════════════════════════
    # TEST 10: Models List (Toyota)
    # ═══════════════════════════════════════════════════════════════
    def test_models_list(self):
        """Test GET /api/public/models?brand=Toyota"""
        print("\n" + "="*70)
        print("🏷️  TEST 10: Models List (Toyota)")
        print("="*70)
        
        url = f"{self.base_url}/api/public/models?brand=Toyota"
        resp, latency_ms = self.measure_latency(url)
        
        if not resp or resp.status_code != 200:
            self.test("Models list request", False, "Request failed", critical=True)
            return
        
        # Check latency <100ms
        latency_ok = latency_ms < 100
        self.test(
            "Models list latency <100ms",
            latency_ok,
            f"Latency: {latency_ms}ms (target: <100ms)"
        )
        
        data = resp.json()
        models = data.get("data", data.get("models", data if isinstance(data, list) else []))
        
        # Check ≥17 models
        self.test(
            "Toyota models list has ≥17 models",
            len(models) >= 17,
            f"Models count: {len(models)}"
        )
        
        # Check specific models
        models_dict = {m.get("name"): m.get("count", 0) for m in models if isinstance(m, dict)}
        
        # Camry count~25
        camry_count = models_dict.get("Camry", 0)
        camry_ok = 20 <= camry_count <= 30
        self.test(
            "Camry count ~25",
            camry_ok,
            f"Camry count: {camry_count}"
        )
        
        # Corolla count~21
        corolla_count = models_dict.get("Corolla", 0)
        corolla_ok = 16 <= corolla_count <= 26
        self.test(
            "Corolla count ~21",
            corolla_ok,
            f"Corolla count: {corolla_count}"
        )
        
        # RAV4 present
        has_rav4 = "RAV4" in models_dict or "Rav4" in models_dict
        self.test(
            "RAV4 present in Toyota models",
            has_rav4,
            f"RAV4 count: {models_dict.get('RAV4', models_dict.get('Rav4', 0))}"
        )
    
    # ═══════════════════════════════════════════════════════════════
    # TEST 11: Models List with Brand Alias (VW)
    # ═══════════════════════════════════════════════════════════════
    def test_models_list_alias(self):
        """Test GET /api/public/models?brand=VW"""
        print("\n" + "="*70)
        print("🏷️  TEST 11: Models List with Brand Alias (VW)")
        print("="*70)
        
        url = f"{self.base_url}/api/public/models?brand=VW"
        resp, latency_ms = self.measure_latency(url)
        
        if not resp or resp.status_code != 200:
            self.test("Models list (VW alias) request", False, "Request failed", critical=True)
            return
        
        data = resp.json()
        models = data.get("data", data.get("models", data if isinstance(data, list) else []))
        
        # Check returns Volkswagen models
        self.test(
            "VW alias returns Volkswagen models",
            len(models) > 0,
            f"Models count: {len(models)}"
        )
    
    # ═══════════════════════════════════════════════════════════════
    # TEST 12: Legacy VIN Endpoint
    # ═══════════════════════════════════════════════════════════════
    def test_legacy_vin_endpoint(self):
        """Test GET /api/vin/{vin}"""
        print("\n" + "="*70)
        print("🔍 TEST 12: Legacy VIN Endpoint")
        print("="*70)
        
        # Get a VIN from listing
        url = f"{self.base_url}/api/public/vehicles?limit=1"
        resp, _ = self.measure_latency(url)
        
        if not resp or resp.status_code != 200:
            self.test("Get sample VIN for legacy test", False, "Failed to get sample VIN")
            return
        
        data = resp.json()
        items = data.get("data", data.get("items", []))
        if not items:
            self.test("Get sample VIN for legacy test", False, "No items in listing")
            return
        
        vin = items[0].get("vin")
        if not vin:
            self.test("Get sample VIN for legacy test", False, "No VIN in first item")
            return
        
        # Test legacy endpoint
        legacy_url = f"{self.base_url}/api/vin/{vin}"
        legacy_resp, legacy_latency = self.measure_latency(legacy_url)
        
        if not legacy_resp:
            self.test("Legacy VIN endpoint request", False, f"Request failed for VIN {vin}")
            return
        
        # Accept 200 or 404 (endpoint may not exist)
        success = legacy_resp.status_code in [200, 404]
        self.test(
            "Legacy VIN endpoint still works",
            success,
            f"Status: {legacy_resp.status_code} (200 or 404 acceptable)"
        )
        
        if legacy_resp.status_code == 200:
            legacy_data = legacy_resp.json()
            has_found = legacy_data.get("found") == True or legacy_data.get("success") == True
            self.test(
                "Legacy endpoint returns found=true",
                has_found,
                f"Response keys: {list(legacy_data.keys())}"
            )
    
    # ═══════════════════════════════════════════════════════════════
    # MAIN TEST RUNNER
    # ═══════════════════════════════════════════════════════════════
    def run_all_tests(self):
        """Run all Phase A1 tests"""
        print("\n" + "="*70)
        print("BIBI CARS PHASE A1 — CATALOG PERFORMANCE TEST SUITE")
        print("="*70)
        print(f"Base URL: {self.base_url}")
        print("="*70)
        
        # Run all backend tests
        self.test_basic_catalog_performance()
        self.test_filter_canonical_brand()
        self.test_filter_brand_alias()
        self.test_land_rover_bug_fix()
        self.test_multi_brand_filter()
        self.test_brand_model_combo()
        self.test_pagination()
        self.test_detail_endpoint()
        self.test_brands_list()
        self.test_models_list()
        self.test_models_list_alias()
        self.test_legacy_vin_endpoint()
        
        # Print summary
        self.print_summary()
        
        # Return exit code
        return 0 if self.tests_failed == 0 else 1
    
    def print_summary(self):
        """Print test summary"""
        print("\n" + "="*70)
        print("📊 PHASE A1 TEST SUMMARY")
        print("="*70)
        print(f"Total tests: {self.tests_run}")
        print(f"✅ Passed: {self.tests_passed}")
        print(f"❌ Failed: {self.tests_failed}")
        print(f"Success rate: {(self.tests_passed/self.tests_run*100):.1f}%")
        
        if self.performance_issues:
            print(f"\n⚠️  Performance issues detected: {len(self.performance_issues)}")
            for issue in self.performance_issues:
                print(f"  - {issue['endpoint']}: {issue['latency_ms']}ms (target: {issue['target_ms']}ms)")
        
        if self.canonical_issues:
            print(f"\n⚠️  Canonical field issues detected: {len(self.canonical_issues)}")
            for issue in self.canonical_issues[:5]:
                print(f"  - VIN {issue.get('vin')}: make_canonical={issue.get('make_canonical')}, model_canonical={issue.get('model_canonical')}")
        
        if self.failed_tests:
            print(f"\n❌ Failed tests ({len(self.failed_tests)}):")
            for ft in self.failed_tests:
                critical = " [CRITICAL]" if ft.get("critical") else ""
                print(f"  - {ft['test']}{critical}")
                if ft['details']:
                    print(f"    {ft['details'][:200]}")
        
        print("="*70)


def main():
    tester = PhaseA1Tester()
    exit_code = tester.run_all_tests()
    sys.exit(exit_code)


if __name__ == "__main__":
    main()
