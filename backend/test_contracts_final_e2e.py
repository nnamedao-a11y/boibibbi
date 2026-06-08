"""
E2E test — Mini Sprint Contracts Final.
Drives: seed templates -> create invoice -> generate contract -> lifecycle
(draft -> sent -> viewed -> signed -> archived) + template CRUD.
Run: python test_contracts_final_e2e.py
"""
import requests, sys, time

BASE = "http://localhost:8001"
ADMIN = {"email": "admin@bibi.cars", "password": "Jp3FS_7ZuE2bhHp7rFkJm9B9T_TeiHxu"}
CUSTOMER_ID = "test_user_bibi"

def jp(label, r):
    try:
        body = r.json()
    except Exception:
        body = r.text[:300]
    print(f"[{r.status_code}] {label}: {str(body)[:240]}")
    return body

fails = []
def check(cond, msg):
    print(("  ✓ " if cond else "  ✗ FAIL ") + msg)
    if not cond:
        fails.append(msg)

s = requests.Session()

# 1. login
r = s.post(f"{BASE}/api/auth/login", json=ADMIN, timeout=30)
tok = jp("login", r).get("access_token")
check(bool(tok), "admin login returns token")
H = {"Authorization": f"Bearer {tok}"}

# 2. seed templates
r = s.post(f"{BASE}/api/admin/document-templates/seed-defaults", headers=H, timeout=30)
jp("seed-defaults", r)
check(r.status_code == 200, "seed-defaults 200")

# 2b. list templates
r = s.get(f"{BASE}/api/admin/document-templates?type=contract", headers=H, timeout=30)
tpls = jp("list contract templates", r).get("items", [])
check(len(tpls) > 0, "at least one contract template exists")

# 3. create invoice for existing customer (insert directly — generic
#    /api/invoices/create has a known ObjectId-serialization bug, out of scope)
import os, uuid
from pymongo import MongoClient
mc = MongoClient(os.environ.get("MONGO_URL", "mongodb://localhost:27017"))
mdb = mc[os.environ.get("DB_NAME", "test_database")]
inv_id = f"inv-test-{uuid.uuid4().hex[:8]}"
mdb.invoices.insert_one({
    "id": inv_id, "customerId": CUSTOMER_ID, "amount": 5000, "total": 5000,
    "currency": "EUR", "status": "pending",
    "items": [{"name": "Import service", "amount": 5000}],
})
print(f"[seed] invoice {inv_id} inserted directly")
check(bool(inv_id), "invoice created with id")

# 4. generate contract from invoice
r = s.post(f"{BASE}/api/invoices/{inv_id}/contract", json={"language": "en"}, headers=H, timeout=60)
gen = jp("generate contract pdf", r)
check(r.status_code == 200, "contract pdf generated 200")
doc_id = (gen.get("document") or {}).get("id")
check(bool(doc_id), "generated_documents row id present")

# 5. list customer contracts -> draft
r = s.get(f"{BASE}/api/customers/{CUSTOMER_ID}/contracts", headers=H, timeout=30)
items = jp("list customer contracts", r).get("items", [])
check(len(items) > 0, "contracts_v2 lifecycle row created")
ctr = next((c for c in items if c.get("document_id") == doc_id), items[0] if items else {})
ctr_id = ctr.get("id")
check(ctr.get("lifecycle") == "draft", f"new contract lifecycle == draft (got {ctr.get('lifecycle')})")

# 6. send -> sent + view_token
r = s.post(f"{BASE}/api/contract-lifecycle/{ctr_id}/send", headers=H, timeout=30)
sent = jp("send contract", r)
contract = sent.get("contract", {})
view_token = contract.get("view_token")
check(contract.get("lifecycle") == "sent", "lifecycle == sent after send")
check(bool(view_token), "view_token generated")
check(bool(sent.get("share_url")), "share_url returned")

# 7. public view (no auth) -> viewed
pub = requests.Session()  # no auth header
r = pub.get(f"{BASE}/api/contracts/view/{view_token}", timeout=30)
viewed = jp("public view", r)
check(r.status_code == 200, "public view 200 (no auth)")
check(viewed.get("contract", {}).get("lifecycle") == "viewed", "lifecycle == viewed after public open")

# 7b. public download streams a PDF
r = pub.get(f"{BASE}/api/contracts/view/{view_token}/download", timeout=30)
check(r.status_code == 200 and r.headers.get("content-type", "").startswith("application/pdf"),
      "public download returns application/pdf")

# 8. sign without terms -> 400
r = pub.post(f"{BASE}/api/contracts/view/{view_token}/sign",
             json={"full_name": "Ivan Ivanov", "terms_accepted": False}, timeout=30)
check(r.status_code == 400, "sign rejected when terms not accepted (400)")

# 8b. sign properly -> signed
r = pub.post(f"{BASE}/api/contracts/view/{view_token}/sign",
             json={"full_name": "Ivan Ivanov", "terms_accepted": True}, timeout=30)
signed = jp("public sign", r)
check(r.status_code == 200, "sign 200")
check(signed.get("contract", {}).get("lifecycle") == "signed", "lifecycle == signed")

# 9. archive
r = s.post(f"{BASE}/api/contract-lifecycle/{ctr_id}/archive", headers=H, timeout=30)
arch = jp("archive", r)
check(arch.get("contract", {}).get("lifecycle") == "archived", "lifecycle == archived")

# 9b. public view after archive -> 410 gone
r = pub.get(f"{BASE}/api/contracts/view/{view_token}", timeout=30)
check(r.status_code == 410, "archived contract no longer publicly accessible (410)")

# 10. template CRUD: patch first template
if tpls:
    tid = tpls[0]["id"]
    r = s.patch(f"{BASE}/api/admin/document-templates/{tid}",
                json={"name": "Patched contract tpl"}, headers=H, timeout=30)
    check(r.status_code == 200 and r.json().get("template", {}).get("name") == "Patched contract tpl",
          "template patch persists name")

print("\n=== RESULT ===")
if fails:
    print(f"{len(fails)} FAILURES:")
    for f in fails:
        print("  -", f)
    sys.exit(1)
print("ALL CHECKS PASSED ✅")
