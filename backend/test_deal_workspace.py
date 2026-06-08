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
    for deal in deals[:5]:  # Test first 5 deals
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
            deal_data = data.get("deal", {})
            has_required_fields = all(k in deal_data for k in ["id", "title"])
            
            if has_required_fields:
                print(f"✅ GET /api/admin/deals/{deal_id} → OK {'(LEGACY)' if is_legacy else '(NEW)'}")
                print(f"   Title: {deal_data.get('title')}")
                success_count += 1
            else:
                print(f"❌ GET /api/admin/deals/{deal_id} → Missing required fields")
        else:
            print(f"❌ GET /api/admin/deals/{deal_id} → {resp.status_code}")
    
    print(f"\n📊 Workspace access: {success_count}/{len(deals[:5])} deals accessible")
    return success_count == len(deals[:5])

if __name__ == "__main__":
    success = test_deal_workspace()
    sys.exit(0 if success else 1)
