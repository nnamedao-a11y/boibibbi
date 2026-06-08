"""
Debug GET /api/admin/deals/{deal_id} response
"""
import requests
import json

BASE_URL = "https://full-deploy-21.preview.emergentagent.com"

# Login as admin
resp = requests.post(
    f"{BASE_URL}/api/auth/login",
    json={"email": "admin@bibi.cars", "password": "Jp3FS_7ZuE2bhHp7rFkJm9B9T_TeiHxu"},
    timeout=10
)

token = resp.json().get("access_token")
headers = {"Authorization": f"Bearer {token}"}

# Get first deal
resp = requests.get(f"{BASE_URL}/api/deals", headers=headers, timeout=10)
deals = resp.json().get("items", [])
if deals:
    deal_id = deals[0].get("id")
    print(f"Testing deal_id: {deal_id}")
    
    # Get workspace data
    resp = requests.get(
        f"{BASE_URL}/api/admin/deals/{deal_id}",
        headers=headers,
        timeout=10
    )
    
    print(f"Status: {resp.status_code}")
    print(f"Response keys: {list(resp.json().keys())}")
    print(f"Full response:\n{json.dumps(resp.json(), indent=2)[:1000]}")
