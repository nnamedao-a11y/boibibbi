"""
admin_cache — /api/admin/cache HTTP surface
============================================

Wave 2B / Batch 8 / Commit 14 (Bottom singletons, 3/4).

Mechanical 1:1 extraction of the in-memory aggregator-cache reset
endpoint.  The original endpoint at server.py:15050 is preserved
byte-for-byte.

Phase 5.4 / C-5b update — aggregator bridge retired:
  The lazy ``from server import aggregator`` bridge was retired in
  C-5b. The endpoint now reads from the dedicated accessor module
  ``app.core.aggregator_runtime`` (set_aggregator / get_aggregator
  pattern, mirror of C-4b / C-4c). Object identity is preserved 1:1
  — ``get_aggregator()`` returns the exact same ``AggregatorService``
  instance that ``server.aggregator`` references and that
  ``queue_handler`` operates on.

NOTE on byte-for-byte preservation (latent bug intentionally kept):
  The original implementation calls ``aggregator.records.clear()``.
  The AggregatorService class in server.py actually stores its data
  in ``aggregator.store`` (line 1063), not ``.records``.  This appears
  to be a pre-existing latent bug — the endpoint would raise
  ``AttributeError`` on invocation — but extraction discipline forbids
  semantic mutation, so the call is preserved verbatim.  Fixing it
  belongs in a later session under "bug fix" discipline, not
  "mechanical extraction".

Auth: ``require_admin`` (hoisted via APIRouter ``dependencies=[]``).
"""
from __future__ import annotations

from fastapi import APIRouter, Depends

from security import require_admin
from app.core.aggregator_runtime import get_aggregator


def _aggregator():
    """Lazy accessor for the in-memory AggregatorService singleton.

    Phase 5.4 / C-5b: delegates to ``app.core.aggregator_runtime``
    (replaces the previous ``from server import aggregator`` lazy
    bridge). Object identity preserved 1:1 — see module docstring."""
    return get_aggregator()


router = APIRouter(
    prefix="/api/admin/cache",
    tags=["admin-cache"],
    dependencies=[Depends(require_admin)],
)


@router.post("/clear")
async def clear_cache():
    """Clear cache"""
    aggregator = _aggregator()
    aggregator.records.clear()  # preserved verbatim from server.py:15053
    return {"success": True, "message": "Cache cleared"}
