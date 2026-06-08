"""
Block 1 — Workflow Binding smoke test.
Tests: service.workflow_template_id → invoice.items[].workflow → order.steps

Pure-DB level test (no auth, no HTTP) — drives the underlying mutation
and resolution paths the production routes use.
"""
import asyncio
import os
import sys
import uuid
import logging
from datetime import datetime, timezone

# Bootstrap path/env BEFORE importing server modules
sys.path.insert(0, "/app/backend")
os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")
os.environ.setdefault("DB_NAME", "test_database")

from motor.motor_asyncio import AsyncIOMotorClient  # noqa: E402

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s %(message)s")
log = logging.getLogger("block1")


async def main():
    client = AsyncIOMotorClient(os.environ["MONGO_URL"])
    db = client[os.environ["DB_NAME"]]

    # Patch db_runtime so resolver/order helpers see this connection
    from app.core import db_runtime
    db_runtime.set_db(db)

    # Seed default templates if empty
    from app.repositories.workflow_templates import WorkflowTemplateRepository
    repo = WorkflowTemplateRepository(db)
    items = await repo.list_templates(order="desc")
    if not items:
        await repo.seed_default_templates()
        items = await repo.list_templates(order="desc")
    log.info("Found %d workflow templates", len(items))

    # Pick the 'Import USA' template (6 steps)
    tpl = next((t for t in items if t.get("category") == "import_usa"), items[0])
    log.info("Using template %s (%s) with %d steps", tpl["id"], tpl.get("name"), len(tpl["steps"]))

    # ── Test 1: resolver picks template steps via template_id ─────────
    from app.services.workflow_resolver import resolve_workflow_for_service
    svc_with_tpl = {
        "id": "svc_test_block1",
        "name": "Test Service",
        "workflow_template_id": tpl["id"],
        "workflow": [{"key": "legacy", "label": "legacy step"}],  # should be ignored
    }
    resolved = await resolve_workflow_for_service(svc_with_tpl, db)
    assert len(resolved) == len(tpl["steps"]), f"Expected {len(tpl['steps'])} steps, got {len(resolved)}"
    assert resolved[0]["key"] == tpl["steps"][0]["key"], "First step key mismatch"
    assert resolved[0]["key"] != "legacy", "Resolver returned LEGACY inline instead of template"
    log.info("✅ Test 1 — template_id resolution works (%d steps)", len(resolved))

    # ── Test 2: resolver falls back to inline workflow ────────────────
    svc_legacy = {
        "id": "svc_legacy",
        "name": "Legacy",
        "workflow": [{"key": "step_a", "label": "A"}, {"key": "step_b", "label": "B"}],
    }
    resolved = await resolve_workflow_for_service(svc_legacy, db)
    assert len(resolved) == 2 and resolved[0]["key"] == "step_a"
    log.info("✅ Test 2 — inline workflow fallback works")

    # ── Test 3: resolver default for None service ─────────────────────
    resolved = await resolve_workflow_for_service(None, db)
    assert len(resolved) == 3 and resolved[0]["key"] == "pending"
    log.info("✅ Test 3 — default 3-step fallback works")

    # ── Test 4: resolver fallback when template_id is invalid ─────────
    svc_bad_tpl = {
        "id": "svc_bad",
        "workflow_template_id": "wft_nonexistent_xxx",
        "workflow": [{"key": "fallback", "label": "FB"}],
    }
    resolved = await resolve_workflow_for_service(svc_bad_tpl, db)
    assert resolved[0]["key"] == "fallback", f"Expected fallback, got {resolved[0]['key']}"
    log.info("✅ Test 4 — bad template_id gracefully falls back to inline")

    # ── Test 5: End-to-end invoice → order with template binding ──────
    # Insert a real service with workflow_template_id
    svc_id = f"svc_e2e_{uuid.uuid4().hex[:6]}"
    await db.services.insert_one({
        "id": svc_id,
        "code": "test_e2e",
        "name": "E2E Test Service",
        "category": "import",
        "default_price": 500.0,
        "currency": "USD",
        "default_qty": 1,
        "workflow_template_id": tpl["id"],
        "workflow": [],  # empty inline — template MUST be used
        "is_active": True,
        "created_at": datetime.now(timezone.utc).isoformat(),
    })

    # Simulate the manager invoice builder path
    items_in = [{"service_id": svc_id, "qty": 1}]
    services_index = {svc_id: await db.services.find_one({"id": svc_id}, {"_id": 0})}

    norm_items = []
    for raw in items_in:
        sid = raw["service_id"]
        svc = services_index.get(sid)
        wf = await resolve_workflow_for_service(svc, db)
        norm_items.append({
            "id": str(uuid.uuid4()),
            "service_id": sid,
            "service_code": svc.get("code"),
            "name": svc.get("name"),
            "category": svc.get("category"),
            "price": svc.get("default_price"),
            "qty": raw["qty"],
            "line_total": svc.get("default_price") * raw["qty"],
            "workflow": wf,
            "workflow_template_id": svc.get("workflow_template_id"),
        })

    inv_id = f"inv_block1_{uuid.uuid4().hex[:6]}"
    invoice = {
        "id": inv_id,
        "customerId": "test_customer",
        "managerId": "test_manager",
        "items": norm_items,
        "amount": 500.0,
        "total": 500.0,
        "currency": "USD",
        "status": "paid",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.invoices.insert_one(invoice)
    log.info("Inserted invoice %s with item workflow_template_id=%s, %d steps",
             inv_id, norm_items[0]["workflow_template_id"], len(norm_items[0]["workflow"]))
    assert norm_items[0]["workflow_template_id"] == tpl["id"]
    assert len(norm_items[0]["workflow"]) == len(tpl["steps"])

    # Now drive create_order_from_invoice
    from app.services.orders import create_order_from_invoice
    order = await create_order_from_invoice(invoice)
    assert order, "Order was not created"
    log.info("Created order %s with %d steps", order["id"], len(order["steps"]))

    # Steps come from invoice items[].workflow → from template
    assert len(order["steps"]) == len(tpl["steps"]), \
        f"Order has {len(order['steps'])} steps, template has {len(tpl['steps'])}"
    # Verify summary items carry workflow_template_id
    assert order["items"][0]["workflow_template_id"] == tpl["id"]
    log.info("✅ Test 5 — E2E Service→Invoice→Order steps from template (%d steps)", len(order["steps"]))

    # ── Cleanup ───────────────────────────────────────────────────────
    await db.services.delete_one({"id": svc_id})
    await db.invoices.delete_one({"id": inv_id})
    await db.orders.delete_one({"id": order["id"]})
    log.info("Cleaned up test data")

    print("\n" + "=" * 60)
    print("✅ BLOCK 1 — WORKFLOW BINDING: ALL 5 TESTS PASSED")
    print("=" * 60)
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
