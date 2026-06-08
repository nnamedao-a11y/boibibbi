"""
Test GET /api/admin/deals/{deal_id} for Wave 6 workspace
Tests that both new and backfilled legacy deals are accessible
"""
import requests
import sys

BASE_URL = "https://full-deploy-21.preview.emergentagent.com"

def test_deal_workspace():
    print("\n" + "="*70)
    print("🔧 Testing Wave 6 Deal Workspace Access")
    print("="*70)
    
    # Login as admin
    resp = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": "admin@bibi.cars", "password": "Jp3FS_7ZuE2bhHp7rFkJm9B9T_TeiHxu"},
        timeout=10
    )
    
    if resp.status_code != 200:
        print(f"❌ Admin login failed: {resp.status_code}")
        return False
    
    token = resp.json().get("access_token")
    headers = {"Authorization": f"Bearer {token}"}
    
    print("✅ Admin login successful")
    
    # Get list of deals
    resp = requests.get(f"{BASE_URL}/api/deals", headers=headers, timeout=10)
    if resp.status_code != 200:
        print(f"❌ GET /api/deals failed: {resp.status_code}")
        return False
    
    deals = resp.json().get("items", [])
    print(f"✅ Found {len(deals)} deals")
    
    # Test workspace access for each deal
    success_count = 0
    legacy_tested = False
    new_tested = False
    
    for deal in deals:
        deal_id = deal.get("id")
        deal_title = deal.get("title", "Untitled")
        is_legacy = "legacy" in deal_id.lower() or "legacy" in deal_title.lower()
        
        resp = requests.get(
            f"{BASE_URL}/api/admin/deals/{deal_id}",
            headers=headers,
            timeout=10
        )
        
        if resp.status_code == 200:
            data = resp.json()
            workspace_data = data.get("data", {})
            deal_data = workspace_data.get("deal", {})
            
            # Check required fields
            has_id = "id" in deal_data
            has_title = "title" in deal_data
            has_health = "health" in workspace_data
            has_counts = "counts" in workspace_data
            
            if has_id and has_title and has_health and has_counts:
                marker = "(LEGACY BACKFILLED)" if is_legacy else "(NEW)"
                print(f"✅ GET /api/admin/deals/{deal_id} → OK {marker}")
                print(f"   Title: {deal_data.get('title')}")
                print(f"   Health: {workspace_data.get('health', {}).get('state')}")
                print(f"   Timeline events: {workspace_data.get('counts', {}).get('timeline_events')}")
                success_count += 1
                
                if is_legacy:
                    legacy_tested = True
                else:
                    new_tested = True
            else:
                print(f"❌ GET /api/admin/deals/{deal_id} → Missing required fields")
                print(f"   has_id={has_id}, has_title={has_title}, has_health={has_health}, has_counts={has_counts}")
        else:
            print(f"❌ GET /api/admin/deals/{deal_id} → {resp.status_code}")
    
    print(f"\n📊 Workspace access: {success_count}/{len(deals)} deals accessible")
    print(f"   Legacy deal tested: {legacy_tested}")
    print(f"   New deal tested: {new_tested}")
    
    return success_count == len(deals) and legacy_tested and new_tested

if __name__ == "__main__":
    success = test_deal_workspace()
    sys.exit(0 if success else 1)
