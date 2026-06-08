"""BIBI Cars — Wave 13 — Delivery360.

Public surface:
    GET    /api/delivery/overview          — fleet-wide overview (KPIs + queue + breakdown).
    GET    /api/delivery/shipments         — paginated shipments queue.
    GET    /api/delivery/{shipment_id}     — full Delivery360 bundle for one shipment.
    POST   /api/delivery/{shipment_id}/milestone           — add/advance a milestone.
    POST   /api/delivery/{shipment_id}/eta                 — set expected / actual ETA.
    POST   /api/delivery/{shipment_id}/carrier             — assign carrier.
    POST   /api/delivery/{shipment_id}/documents/upload    — multipart upload.
    DELETE /api/delivery/{shipment_id}/documents/{doc_id}  — delete document.
    GET    /api/delivery/carriers          — carrier center (perf table).
    POST   /api/delivery/carriers          — create carrier.
    GET    /api/delivery/risk              — at-risk shipments (delay_risk + delayed + critical).
    GET    /api/files/{key:path}           — stream file from object storage.

All mutating endpoints require manager-or-admin auth. Listings are
scope-aware (manager sees own deals, team_lead sees team, admin sees all).
"""
from .router import router as wave13_router
from .router import files_router as wave13_files_router

__all__ = ["wave13_router", "wave13_files_router"]
