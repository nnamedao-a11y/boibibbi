"""Seed permanent demo data for test_customer_001 so the portal renders content."""
import asyncio, os, uuid
from datetime import datetime, timedelta, timezone
from motor.motor_asyncio import AsyncIOMotorClient

MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "test_database")
CID = "test_customer_001"
DID = "demo_deal_w19_001"


async def main():
    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]
    now = datetime.now(timezone.utc)

    # Clean prior demo rows so this script is idempotent
    await db.deals.delete_many({"id": DID})
    await db.invoices.delete_many({"dealId": DID})
    await db.deal_documents.delete_many({"dealId": DID})
    await db.notifications.delete_many({"recipientId": CID, "dealId": DID})

    await db.deals.insert_one({
        "id": DID, "customerId": CID,
        "make": "BMW", "model": "X5", "year": 2021,
        "vin": "WBAJA9C50KBPORTAL",
        "lot": "LOT-W19-DEMO",
        "auction": "Copart Newark",
        "status": "in_transit",
        "photo": "https://images.unsplash.com/photo-1555215695-3004980ad54e?w=800",
        "photos": [
            "https://images.unsplash.com/photo-1555215695-3004980ad54e?w=1200",
            "https://images.unsplash.com/photo-1606664515524-ed2f786a0bd6?w=1200",
        ],
        "milestones": {
            "auction_won": (now - timedelta(days=30)).isoformat(),
            "payment_confirmed": (now - timedelta(days=28)).isoformat(),
            "picked_up": (now - timedelta(days=22)).isoformat(),
            "port_arrived": (now - timedelta(days=14)).isoformat(),
            "loaded": (now - timedelta(days=10)).isoformat(),
        },
        "eta": (now + timedelta(days=12)).isoformat(),
        "created_at": (now - timedelta(days=31)).isoformat(),
    })

    await db.invoices.insert_many([
        {"id": "inv_w19_01", "customerId": CID, "dealId": DID, "number": "INV-W19-001",
         "amount": 4500, "currency": "USD", "status": "paid",
         "issuedAt": (now - timedelta(days=28)).isoformat(),
         "paidAt": (now - timedelta(days=28)).isoformat()},
        {"id": "inv_w19_02", "customerId": CID, "dealId": DID, "number": "INV-W19-002",
         "amount": 3200, "currency": "USD", "status": "paid",
         "issuedAt": (now - timedelta(days=14)).isoformat(),
         "paidAt": (now - timedelta(days=13)).isoformat()},
        {"id": "inv_w19_03", "customerId": CID, "dealId": DID, "number": "INV-W19-003",
         "amount": 2800, "currency": "USD", "status": "open",
         "issuedAt": (now - timedelta(days=3)).isoformat(),
         "dueDate": (now + timedelta(days=4)).isoformat()},
    ])

    await db.deal_documents.insert_many([
        {"id": "doc_w19_contract", "dealId": DID, "customerId": CID,
         "kind": "contract", "label": "Vehicle Sale Contract",
         "filename": "contract-bmw-x5.pdf", "sizeBytes": 245000,
         "url": "https://example.test/contract.pdf",
         "uploadedAt": (now - timedelta(days=28)).isoformat()},
        {"id": "doc_w19_invoice", "dealId": DID, "customerId": CID,
         "kind": "invoice", "label": "Auction Invoice",
         "filename": "invoice-copart.pdf", "sizeBytes": 132000,
         "url": "https://example.test/invoice.pdf",
         "uploadedAt": (now - timedelta(days=28)).isoformat()},
        {"id": "doc_w19_transport", "dealId": DID, "customerId": CID,
         "kind": "transport", "label": "Bill of Lading",
         "filename": "bol-grimaldi.pdf", "sizeBytes": 89000,
         "url": "https://example.test/bol.pdf",
         "uploadedAt": (now - timedelta(days=10)).isoformat()},
    ])

    await db.notifications.insert_many([
        {"id": "ntf_w19_01", "recipientId": CID, "customerId": CID, "dealId": DID,
         "event": "new_eta", "title": "New ETA: arrival in 12 days",
         "body": "Your BMW X5 is now scheduled to arrive at the destination port on " + (now + timedelta(days=12)).strftime("%b %d, %Y"),
         "created_at": now - timedelta(hours=2), "read_at": None},
        {"id": "ntf_w19_02", "recipientId": CID, "customerId": CID, "dealId": DID,
         "event": "payment_received", "title": "Payment received: $3,200",
         "body": "Thank you — Invoice INV-W19-002 has been settled.",
         "created_at": now - timedelta(days=13), "read_at": None},
        {"id": "ntf_w19_03", "recipientId": CID, "customerId": CID, "dealId": DID,
         "event": "contract_ready", "title": "Contract ready to sign",
         "body": "Your sale contract is now available for review in the Documents block.",
         "created_at": now - timedelta(days=28), "read_at": (now - timedelta(days=27)).isoformat()},
    ])
    print("✓ Seeded demo data for", CID, "→ deal", DID)
    client.close()


if __name__ == "__main__":
    asyncio.run(main())
