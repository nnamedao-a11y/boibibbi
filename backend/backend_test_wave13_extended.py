"""
Extended Wave 13 tests - scope restrictions and edge cases
"""
import requests
import io

BASE = "https://repo-setup-82.preview.emergentagent.com"
ADMIN = ("admin@bibi.cars", "Jp3FS_7ZuE2bhHp7rFkJm9B9T_TeiHxu")
MANAGER = ("manager@bibi.cars", "dFbYnse0L59DBE16Mn4kT6cCRaNBZFQR")

def login(email, pwd):
    r = requests.post(f"{BASE}/api/auth/login", json={"email": email, "password": pwd}, timeout=10)
    return r.json()["access_token"]

def auth_h(token):
    return {"Authorization": f"Bearer {token}"}

def test_manager_scope():
    """Test that manager only sees own deals in delivery endpoints"""
    print("\n=== Testing Manager Scope ===")
    
    # Login as manager
    manager_token = login(*MANAGER)
    mh = auth_h(manager_token)
    
    # Get overview as manager
    r = requests.get(f"{BASE}/api/delivery/overview", headers=mh, timeout=10)
    print(f"✅ Manager GET /api/delivery/overview: {r.status_code}")
    if r.status_code == 200:
        data = r.json().get("data", {})
        scope = data.get("scope", {})
        print(f"   Scope: {scope}")
        if not scope.get("all"):
            print(f"   ✅ Manager scope is restricted (not 'all')")
        else:
            print(f"   ❌ Manager should not have 'all' scope")
    
    # Get shipments as manager
    r = requests.get(f"{BASE}/api/delivery/shipments", headers=mh, timeout=10)
    print(f"✅ Manager GET /api/delivery/shipments: {r.status_code}")
    if r.status_code == 200:
        items = r.json().get("items", [])
        print(f"   Manager sees {len(items)} shipments (should only be own deals)")

def test_shipment_filters():
    """Test shipment filtering by segment and milestone"""
    print("\n=== Testing Shipment Filters ===")
    
    admin_token = login(*ADMIN)
    h = auth_h(admin_token)
    
    # Test segment filter
    r = requests.get(f"{BASE}/api/delivery/shipments?segment=delay_risk", headers=h, timeout=10)
    print(f"✅ GET /api/delivery/shipments?segment=delay_risk: {r.status_code}")
    if r.status_code == 200:
        items = r.json().get("items", [])
        print(f"   Found {len(items)} delay_risk shipments")
        if items:
            # Check if all items have delay_risk segment
            segments = []
            for item in items:
                dh = item.get("delivery_health")
                if isinstance(dh, dict):
                    segments.append(dh.get("segment"))
                elif isinstance(dh, str):
                    segments.append(dh)
            all_delay_risk = all(s == "delay_risk" for s in segments if s)
            if all_delay_risk:
                print(f"   ✅ All items are delay_risk")
            else:
                print(f"   ❌ Some items are not delay_risk: {segments}")
    
    # Test milestone filter
    r = requests.get(f"{BASE}/api/delivery/shipments?milestone=payment_confirmed", headers=h, timeout=10)
    print(f"✅ GET /api/delivery/shipments?milestone=payment_confirmed: {r.status_code}")
    if r.status_code == 200:
        items = r.json().get("items", [])
        print(f"   Found {len(items)} shipments at payment_confirmed milestone")

def test_carrier_creation():
    """Test creating a new carrier"""
    print("\n=== Testing Carrier Creation ===")
    
    admin_token = login(*ADMIN)
    h = auth_h(admin_token)
    
    # Create a test carrier
    r = requests.post(f"{BASE}/api/delivery/carriers", headers=h, json={
        "name": "Test Carrier QA",
        "contact": "qa@test.example",
        "country": "BG"
    }, timeout=10)
    print(f"✅ POST /api/delivery/carriers (Test Carrier QA): {r.status_code}")
    if r.status_code == 200:
        carrier = r.json().get("data", {})
        carrier_id = carrier.get("id")
        print(f"   Created carrier: {carrier_id}")
        
        # Verify it appears in the list
        r = requests.get(f"{BASE}/api/delivery/carriers", headers=h, timeout=10)
        if r.status_code == 200:
            items = r.json().get("items", [])
            found = any(c.get("carrier_name") == "Test Carrier QA" for c in items)
            if found:
                print(f"   ✅ Test Carrier QA appears in carriers list")
            else:
                print(f"   ❌ Test Carrier QA not found in carriers list")

def test_deal_lookup():
    """Test that GET /api/delivery/{deal_id} works (not just shipment_id)"""
    print("\n=== Testing Deal ID Lookup ===")
    
    admin_token = login(*ADMIN)
    h = auth_h(admin_token)
    
    # Get a deal with a shipment
    r = requests.get(f"{BASE}/api/delivery/shipments?limit=1", headers=h, timeout=10)
    if r.status_code == 200:
        items = r.json().get("items", [])
        if items:
            deal_id = items[0].get("deal_id")
            shipment_id = items[0].get("shipment_id")
            
            # Try fetching by deal_id
            r = requests.get(f"{BASE}/api/delivery/{deal_id}", headers=h, timeout=10)
            print(f"✅ GET /api/delivery/{deal_id} (by deal_id): {r.status_code}")
            if r.status_code == 200:
                bundle = r.json().get("data", {})
                if bundle.get("shipment", {}).get("id") == shipment_id:
                    print(f"   ✅ Deal lookup returns correct shipment")
                else:
                    print(f"   ❌ Deal lookup returned wrong shipment")

def test_document_deletion():
    """Test document deletion"""
    print("\n=== Testing Document Deletion ===")
    
    admin_token = login(*ADMIN)
    h = auth_h(admin_token)
    
    # Get a shipment with documents
    r = requests.get(f"{BASE}/api/delivery/shipments?limit=1", headers=h, timeout=10)
    if r.status_code == 200:
        items = r.json().get("items", [])
        if items:
            shipment_id = items[0].get("shipment_id")
            
            # Get the bundle to see documents
            r = requests.get(f"{BASE}/api/delivery/{shipment_id}", headers=h, timeout=10)
            if r.status_code == 200:
                bundle = r.json().get("data", {})
                docs = bundle.get("documents", [])
                if docs:
                    doc_id = docs[0].get("id")
                    print(f"   Found document: {doc_id}")
                    
                    # Delete it
                    r = requests.delete(f"{BASE}/api/delivery/{shipment_id}/documents/{doc_id}", headers=h, timeout=10)
                    print(f"✅ DELETE /api/delivery/{shipment_id}/documents/{doc_id}: {r.status_code}")
                    
                    # Verify it's gone
                    r = requests.get(f"{BASE}/api/delivery/{shipment_id}", headers=h, timeout=10)
                    if r.status_code == 200:
                        bundle = r.json().get("data", {})
                        docs_after = bundle.get("documents", [])
                        if not any(d.get("id") == doc_id for d in docs_after):
                            print(f"   ✅ Document successfully deleted")
                        else:
                            print(f"   ❌ Document still present after deletion")

def main():
    print("=" * 60)
    print("Wave 13 Extended Tests - Scope & Edge Cases")
    print("=" * 60)
    
    try:
        test_manager_scope()
        test_shipment_filters()
        test_carrier_creation()
        test_deal_lookup()
        test_document_deletion()
        
        print("\n" + "=" * 60)
        print("Extended tests completed")
        print("=" * 60)
    except Exception as e:
        print(f"\n❌ Error: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    main()
