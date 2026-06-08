"""
BIBI Cars — Wave 13 Delivery360 — seed + smoke test.
Adds:
  - 3 sample carriers
  - 2 shipments tied to existing deals (one on-track, one at_risk)
  - 2 sample delivery documents
Then exercises the full Wave 13 surface end-to-end.
Run:  cd /app/backend && python backend_test_wave13.py
"""
import asyncio
import os
import sys
import requests
import io
from datetime import datetime, timezone, timedelta

ROOT  = os.path.dirname(os.path.abspath(__file__))
BASE  = "https://repo-setup-82.preview.emergentagent.com"
ADMIN = ("admin@bibi.cars", "Jp3FS_7ZuE2bhHp7rFkJm9B9T_TeiHxu")

PASS = 0
FAIL = 0


def t(name, ok, detail=""):
    global PASS, FAIL
    icon = "✅" if ok else "❌"
    print(f"{icon} {name}" + (f"  [{detail}]" if detail else ""))
    PASS += 1 if ok else 0
    FAIL += 0 if ok else 1


def login(email, pwd):
    r = requests.post(f"{BASE}/api/auth/login", json={"email": email, "password": pwd}, timeout=10)
    return r.json()["access_token"]


def auth_h(token):
    return {"Authorization": f"Bearer {token}"}


def main():
    token = login(*ADMIN)
    t("admin login", bool(token))
    h = auth_h(token)

    # Make sure we have at least one deal — the Wave 12 test already created one
    r = requests.get(f"{BASE}/api/deals?limit=2", headers=h, timeout=10).json()
    deals = r.get("items") or r.get("data") or []
    if not deals:
        # Fallback: create a tiny deal so Wave 13 has something to attach to
        r2 = requests.post(f"{BASE}/api/deals", headers=h, json={
            "title": "Wave13 e2e deal",
            "vin":   "WP0AB29927S730777",
            "currency": "EUR",
            "stage":  "deposit",
        }, timeout=10)
        deals = [r2.json().get("data") or r2.json().get("deal") or {}]
    deal = deals[0]
    deal_id = deal.get("id")
    t("have at least one deal", bool(deal_id), deal_id)

    # ---- 1. carriers -------------------------------------------------------
    carriers_in = [
        {"name": "Black Sea Logistics", "contact": "office@bsl.example", "country": "BG"},
        {"name": "Adria Transport",     "contact": "+359 88 000 0000",     "country": "BG"},
        {"name": "Marmara Carriers",    "contact": "ops@marmara.example",  "country": "TR"},
    ]
    carrier_ids = []
    for c in carriers_in:
        rr = requests.post(f"{BASE}/api/delivery/carriers", json=c, headers=h, timeout=10)
        ok = rr.status_code == 200 and rr.json().get("success")
        if ok:
            carrier_ids.append(rr.json()["data"]["id"])
        t(f"create carrier {c['name']}", ok, rr.text[:120] if not ok else "")
    rr = requests.get(f"{BASE}/api/delivery/carriers", headers=h, timeout=10).json()
    t("GET /api/delivery/carriers >= 3", rr.get("total", 0) >= 3, f"total={rr.get('total')}")

    # ---- 2. create a primary shipment for the deal ------------------------
    rr = requests.post(f"{BASE}/api/delivery/shipments", headers=h, json={
        "deal_id":     deal_id,
        "vehicleLabel": deal.get("title") or "Wave12 e2e deal",
        "current_milestone": "payment_confirmed",
        "eta_expected": (datetime.now(timezone.utc) + timedelta(days=14)).isoformat(),
        "carrier_id":   carrier_ids[0] if carrier_ids else None,
    }, timeout=10)
    ok = rr.status_code == 200 and rr.json().get("success")
    shipment_id = rr.json().get("data", {}).get("id") if ok else None
    t("POST /api/delivery/shipments", ok and bool(shipment_id), shipment_id or rr.text[:120])

    # Add some milestones
    for key, days_ago in [("auction_won", 14), ("payment_confirmed", 10)]:
        rr = requests.post(f"{BASE}/api/delivery/{shipment_id}/milestone", headers=h, json={
            "key": key,
            "at": (datetime.now(timezone.utc) - timedelta(days=days_ago)).isoformat(),
            "note": "Seeded for e2e",
        }, timeout=10)
        t(f"POST milestone {key}", rr.status_code == 200 and rr.json().get("success"), rr.text[:80] if rr.status_code != 200 else "")

    # ---- 3. set ETA so we get variance ------------------------------------
    rr = requests.post(f"{BASE}/api/delivery/{shipment_id}/eta", headers=h, json={
        "eta_expected": (datetime.now(timezone.utc) - timedelta(days=3)).isoformat(),  # already overdue!
    }, timeout=10)
    t("POST /eta (overdue)", rr.status_code == 200 and rr.json().get("success"), rr.text[:80] if rr.status_code != 200 else "")

    # ---- 4. upload a document (CMR) ---------------------------------------
    fake = io.BytesIO(b"PDF-FAKE-CMR-CONTENT-FOR-E2E")
    files = {"file": ("cmr.pdf", fake, "application/pdf")}
    rr = requests.post(
        f"{BASE}/api/delivery/{shipment_id}/documents/upload",
        headers=h,
        files=files,
        data={"kind": "cmr", "note": "Seeded CMR for e2e"},
        timeout=15,
    )
    ok = rr.status_code == 200 and rr.json().get("success")
    doc_url = (rr.json().get("data") or {}).get("url") if ok else None
    doc_id  = (rr.json().get("data") or {}).get("id") if ok else None
    t("POST documents/upload (cmr)", ok and bool(doc_url), rr.text[:120] if not ok else doc_url)

    # ---- 5. download the file --------------------------------------------
    if doc_url:
        rr = requests.get(f"{BASE}{doc_url}", headers=h, timeout=10)
        t("GET file via /api/files/...", rr.status_code == 200 and rr.content.startswith(b"PDF-FAKE-CMR"), f"status={rr.status_code} bytes={len(rr.content)}")

    # ---- 6. fetch the Delivery360 bundle ----------------------------------
    rr = requests.get(f"{BASE}/api/delivery/{shipment_id}", headers=h, timeout=10).json()
    bundle = rr.get("data") or {}
    health = bundle.get("delivery_health") or {}
    timeline = bundle.get("timeline") or []
    t("GET /api/delivery/{shipment_id} returns bundle",
      bundle.get("shipment", {}).get("id") == shipment_id,
      f"shipment_id={shipment_id}")
    t("bundle.delivery_health.segment in (delay_risk|delayed|critical)",
      health.get("segment") in ("delay_risk", "delayed", "critical"),
      f"segment={health.get('segment')} score={health.get('score')}")
    t("bundle.timeline has all 9 milestones",
      len(timeline) == 9,
      f"len={len(timeline)}")
    done_keys = {m["key"] for m in timeline if m["status"] == "done"}
    t("bundle.timeline 'auction_won' + 'payment_confirmed' are done",
      done_keys >= {"auction_won", "payment_confirmed"},
      f"done={sorted(done_keys)}")
    t("bundle.documents has 1 cmr",
      len(bundle.get("documents") or []) >= 1,
      f"len={len(bundle.get('documents') or [])}")

    # ---- 7. overview ------------------------------------------------------
    rr = requests.get(f"{BASE}/api/delivery/overview", headers=h, timeout=10).json()
    data = rr.get("data") or {}
    t("/api/delivery/overview shipments_total >=1",
      data.get("counts", {}).get("shipments_total", 0) >= 1)
    t("/api/delivery/overview has by_segment + by_milestone",
      "by_segment" in data and "by_milestone" in data)

    # ---- 8. risk queue -----------------------------------------------------
    rr = requests.get(f"{BASE}/api/delivery/risk", headers=h, timeout=10).json()
    t("/api/delivery/risk returns at-risk shipment",
      rr.get("total", 0) >= 1,
      f"total={rr.get('total')} by_segment={rr.get('by_segment')}")

    # ---- 9. carriers perf table -------------------------------------------
    rr = requests.get(f"{BASE}/api/delivery/carriers", headers=h, timeout=10).json()
    items = rr.get("items") or []
    assigned_row = next((c for c in items if c.get("carrier_id") == carrier_ids[0]), None)
    t("/api/delivery/carriers includes assigned carrier with loads >=1",
      bool(assigned_row) and assigned_row.get("loads", 0) >= 1,
      f"row={assigned_row}")

    # ---- 10. Deal360 bundle now exposes delivery_health -------------------
    rr = requests.get(f"{BASE}/api/deals/{deal_id}/360", headers=h, timeout=15).json()
    dh = rr.get("delivery_health") or rr.get("data", {}).get("delivery_health") or {}
    t("Deal360 bundle includes delivery_health",
      isinstance(dh, dict) and dh.get("segment") in ("on_track", "delay_risk", "delayed", "critical", "delivered", "cancelled"),
      f"segment={dh.get('segment')} score={dh.get('score')}")

    # ---- summary ----------------------------------------------------------
    print(f"\n=========== Wave 13 e2e: {PASS} passed, {FAIL} failed ===========")
    return 0 if FAIL == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
