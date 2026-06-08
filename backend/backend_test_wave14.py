"""Wave 14 — Operations 360 e2e smoke test.
Run after Waves 12 + 13 seeders so we have data to aggregate.
"""
import sys
import requests

BASE  = "https://repo-setup-82.preview.emergentagent.com"
ADMIN = ("admin@bibi.cars", "Jp3FS_7ZuE2bhHp7rFkJm9B9T_TeiHxu")
MGR   = ("manager@bibi.cars", "dFbYnse0L59DBE16Mn4kT6cCRaNBZFQR")

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


def main():
    h_admin = {"Authorization": f"Bearer {login(*ADMIN)}"}
    h_mgr   = {"Authorization": f"Bearer {login(*MGR)}"}

    # 1. Dashboard
    r = requests.get(f"{BASE}/api/operations/dashboard", headers=h_admin, timeout=15).json()
    d = r.get("data") or {}
    tiles = d.get("tiles") or {}
    t("admin /operations/dashboard returns scope.all=True", d.get("scope", {}).get("all") is True)
    t("admin dashboard has active_deals >=1", tiles.get("active_deals", 0) >= 1, f"deals={tiles.get('active_deals')}")
    t("admin dashboard has cars_in_transit >=1", tiles.get("cars_in_transit", 0) >= 1, f"cars={tiles.get('cars_in_transit')}")
    t("admin dashboard outstanding > 0", tiles.get("outstanding", 0) > 0, f"out={tiles.get('outstanding')}")
    for k in ("active_leads", "new_leads_mtd", "revenue_mtd", "profit_mtd",
              "collections", "critical_deliveries", "at_risk_deals"):
        t(f"admin dashboard tile {k} present", k in tiles)

    # 2. Bottlenecks
    r = requests.get(f"{BASE}/api/operations/bottlenecks", headers=h_admin, timeout=15).json()
    b = r.get("data") or {}
    t("bottlenecks total_active_deals >=1", b.get("total_active_deals", 0) >= 1)
    t("bottlenecks ranked is sorted desc",
      all(b.get("ranked", [])[i]["count"] >= b.get("ranked", [])[i+1]["count"]
          for i in range(len(b.get("ranked", [])) - 1)))
    t("bottlenecks 'waiting_deposit' bucket present", "waiting_deposit" in (b.get("buckets") or {}))
    t("bottlenecks top is a real key or None", (b.get("top_bottleneck") is None) or (b["top_bottleneck"]["count"] > 0))

    # 3. Team
    r = requests.get(f"{BASE}/api/operations/team", headers=h_admin, timeout=15).json()
    items = r.get("items") or []
    t("team has at least 1 row (someone has deals)", len(items) >= 1, f"len={len(items)}")
    if items:
        row = items[0]
        for k in ("manager_name", "leads", "deals", "revenue", "outstanding",
                  "collections", "delivery_delays", "ops_score", "conversion_rate"):
            t(f"team row contains '{k}'", k in row)

    # 4. SLA
    r = requests.get(f"{BASE}/api/operations/sla", headers=h_admin, timeout=15).json()
    sla = r.get("data") or {}
    rules = sla.get("rules") or []
    t("sla has 5 rules", len(rules) == 5, f"len={len(rules)}")
    expected_ids = {"lead_response_15min", "deal_stuck_7d", "deposit_pending_3d",
                    "carrier_not_assigned_2d", "customs_14d"}
    t("sla rule ids match spec", {r["id"] for r in rules} == expected_ids)
    for r_ in rules:
        t(f"sla rule '{r_['id']}' has count + items",
          isinstance(r_.get("count"), int) and isinstance(r_.get("items"), list))

    # 5. Risk Center
    r = requests.get(f"{BASE}/api/operations/risk", headers=h_admin, timeout=15).json()
    items = r.get("items") or []
    by_kind = r.get("by_kind") or {}
    t("risk has at least 1 entry (Wave12/13 seeded shipments are delay_risk)",
      len(items) >= 1, f"len={len(items)} by_kind={by_kind}")
    t("risk has delivery entries", by_kind.get("delivery", 0) >= 1, f"delivery={by_kind.get('delivery')}")
    if items:
        i = items[0]
        for k in ("entity_type", "entity_id", "label", "segment", "score", "risk_kind", "reasons"):
            t(f"risk item contains '{k}'", k in i)

    # 6. Scope — manager sees only own (likely 0 since seeded deals are unassigned)
    r = requests.get(f"{BASE}/api/operations/dashboard", headers=h_mgr, timeout=15).json()
    md = r.get("data") or {}
    t("manager scope is not all",
      md.get("scope", {}).get("all") is False,
      f"managers={md.get('scope',{}).get('managers')}")

    print(f"\n========== Wave 14 e2e: {PASS} passed, {FAIL} failed ==========")
    return 0 if FAIL == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
