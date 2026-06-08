"""AggregatorService runtime accessor — Phase 5.4 / C-5b.

This module is the **owning location** for the live
``AggregatorService`` singleton at runtime (V3.2 Field-Level
Intelligence merger; in-memory VIN record cache).

Pattern (mirror of ``app.core.socket_runtime`` from C-4c and
``app.core.deps.set_bitmotors_parser`` from C-4b)
─────────────────────────────────────────────────────────────────

* Single writer  ``set_aggregator(instance)`` — invoked exactly
  once at the module-load-time creation site in ``server.py``
  (immediately after ``aggregator = AggregatorService(session_service)``
  in the `GLOBAL SERVICES` block).
* Many readers  ``get_aggregator()`` — module-private cached
  reference, fresh on every call so any in-process rebind
  (forbidden but defensively allowed) is visible.
* Test escape hatch  ``clear_aggregator_for_tests()`` — restores
  the ``None`` initial state.

Semantics preserved 1:1 with the legacy ``from server import
aggregator`` lazy bridge:

* Pre-load → returns ``None``.
* Post-load → returns the EXACT same ``AggregatorService`` instance
  that ``server.aggregator`` references and that ``queue_handler``
  (``server.py:1259``) calls ``ingest()`` on.

Pre-C-5b audit summary (mandate ``mandatory inventory micro-audit``)
────────────────────────────────────────────────────────────────────

The C-5b mandate required a 5-question topology audit before
proceeding with execution. All five came back clean:

  Q1. Pure singleton?              ✅ YES
       ``AggregatorService(session_service)`` — captures only the
       SessionService (itself an in-memory dict store with no
       runtime handles).
  Q2. Late-bound runtime?          ✅ NO
       Instantiated at module-load time (``server.py:1249``) in the
       ``GLOBAL SERVICES`` block, synchronous with module import.
       Not constructed inside ``_main_startup``.
  Q3. Captures db internally?      ✅ NO
       ``__init__`` takes only ``session_service``. Class body has
       no ``db`` / ``sio`` / ``integration_configs`` references.
       All methods (``ingest``, ``get``, ``get_stats``, ``_smart_merge``)
       operate on ``self.store`` (in-memory Dict).
  Q4. Instantiated before set_db?  ✅ YES — and irrelevant
       Module-load precedes ``_main_startup`` by design. Since the
       singleton does NOT need ``db``, the ordering is not a
       constraint.
  Q5. Referenced by workers?       ✅ NO
       None of the 7 registered workers (ops_guardian,
       payment_reminder, resolver_worker, ringostat_cron,
       tracking_worker, transfer_detector, watchlist_live_poll)
       reference ``aggregator``. The only "loop" caller is
       ``queue_handler`` at ``server.py:1259``, which runs in
       request-handler scope (popped off ``ingestion_queue``).

Verdict: ``aggregator`` is pure-in-memory, no hidden ownership chain,
no startup-sequencing risk, no worker capture. C-5b proceeds with
**execution** (accessor extraction), not planning-first.

Why a dedicated module (not ``app.core.deps``)
────────────────────────────────────────────────

The C-4b parser accessor lives in ``app.core.deps`` because it shares
the "lazy DI for routers" shape. ``AggregatorService`` is a
domain-service singleton with a different concern (in-memory VIN
record cache, not request DI), and follows the C-4c socket_runtime
pattern: a dedicated tiny module that owns one thing.

Forbidden in this module (by C-5b mandate)
─────────────────────────────────────────────

* No business-logic wrapping (``AggregatorWrapper``, ``ServiceRegistry``).
* No mutation graph abstraction (``.records.clear()`` patch — that's
  a documented latent bug in ``admin_cache`` preserved verbatim).
* No DI registration (this is NOT a FastAPI ``Depends`` source).
* No ``app.state`` mutation.
* No worker registration.

This module's surface is exactly: ``set_aggregator``,
``get_aggregator``, ``clear_aggregator_for_tests`` — and the
module-private cached reference they manipulate.
"""
from __future__ import annotations

from typing import Any, Optional


# ─────────────────────────────────────────────────────────────────────
# Module-private cached reference. Single writer, many readers.
# Initial value is None — pre-load readers see the legacy "import a
# global that hasn't been bound yet" semantics. Once set_aggregator
# runs at module-load time in server.py (right after the canonical
# `aggregator = AggregatorService(session_service)` line), this
# points to the exact AggregatorService instance used by
# queue_handler and by every admin-cache reader.
# ─────────────────────────────────────────────────────────────────────
_aggregator_ref: Optional[Any] = None


def set_aggregator(instance: Any) -> None:
    """One-shot setter for the ``AggregatorService`` singleton.

    Called exactly once from ``server.py`` at module-load time,
    immediately after the canonical ``aggregator = AggregatorService(
    session_service)`` creation line in the ``GLOBAL SERVICES`` block.
    Accepts ``None`` so test harnesses can reset state via
    ``clear_aggregator_for_tests`` (which is a one-line wrapper).

    Rebinding semantics: idempotent — calling ``set_aggregator`` twice
    with the same instance keeps the same identity; calling it with
    a different instance OVERWRITES (this is the contract because
    ``server.aggregator`` itself is a mutable module-level global;
    we mirror that semantics exactly).

    The C-5b contract is that production code calls this EXACTLY
    ONCE. A module-load-time identity assertion in ``server.py``
    (``assert get_aggregator() is aggregator``) enforces this.
    """
    global _aggregator_ref
    _aggregator_ref = instance


def get_aggregator() -> Any:
    """Return the live ``AggregatorService`` instance, or ``None``
    pre-load.

    The legacy ``from server import aggregator`` lazy bridge has
    been retired (C-5b). Consumers must now read from this
    accessor. Object identity is preserved 1:1 with the legacy
    bridge: the setter is invoked exactly once with the same
    object that ``server.aggregator`` holds and that
    ``queue_handler`` calls ``ingest()`` on.

    Lazy semantics (call at point-of-use, not at import) are
    preserved by NOT caching the return value at the consumer
    side — every caller invokes ``get_aggregator()`` fresh.
    """
    return _aggregator_ref


def clear_aggregator_for_tests() -> None:
    """Reset the accessor to ``None``. TEST USE ONLY.

    Production code MUST NOT call this. It exists because the
    C-5b regression test suite needs to verify pre-load behaviour
    (``get_aggregator() is None``) without rebooting the Python
    process. Always pair with ``set_aggregator(original)`` in a
    try/finally to restore live state for any downstream test.
    """
    global _aggregator_ref
    _aggregator_ref = None


__all__ = ["set_aggregator", "get_aggregator", "clear_aggregator_for_tests"]
