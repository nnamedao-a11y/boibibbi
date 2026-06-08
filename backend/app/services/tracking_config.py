"""
TrackingConfigService — Phase 3.1 entry point
===============================================

Single source of truth for the 5 tracking provider keys that used to
live as module-level globals in ``server.py``:

    VESSELFINDER_API_KEY
    VESSELFINDER_FLEET_KEY
    SHIPSGO_API_KEY
    SHIPSGO_FLEET_KEY
    AFTERSHIP_API_KEY

Design contract — see ``PHASE3_1_TRACKING_CONFIG_SERVICE.md``.

This module is the SKELETON of the service (Commit 22 of Phase 3.1).
It is NOT yet wired into ``server.py`` — that happens in Commit 23.
The skeleton ships with full unit-test coverage in
``backend/tests/test_tracking_config.py`` so behaviour is locked in
before any read/write site migration begins.

Key invariants:

  * Reads are SYNCHRONOUS against an in-memory cache (``snapshot()``).
    Safe to call from any context (async handler, sync helper, tight
    loop, scraper worker).
  * Writes are ASYNCHRONOUS (``load()`` / ``update()``) because they
    hit Mongo.  Protected by an asyncio.Lock so the cache mutation
    is atomic with the DB write.
  * The cache is a ``TrackingConfigSnapshot`` — a frozen dataclass.
    Readers cannot accidentally mutate it; replacement is atomic.
  * Pub-sub via ``subscribe()`` returns an ``asyncio.Queue`` that
    yields every new snapshot.  Designed for long-lived workers
    (scrapers) that need to reconfigure on config change without
    polling.
"""
from __future__ import annotations

import asyncio
import logging
import os
from dataclasses import dataclass, replace
from datetime import datetime, timezone
from typing import Any, Mapping, Optional

logger = logging.getLogger("bibi.tracking_config")


# Note: ``__all__`` is defined at the bottom of this module (after the
# Phase 5.5/F module-level accessor functions so they are included in
# the public surface).


# ── Snapshot ──────────────────────────────────────────────────────────


@dataclass(frozen=True)
class TrackingConfigSnapshot:
    """Immutable snapshot of all tracking provider keys at one instant.

    Frozen so that readers cannot mutate state by accident.  Use
    :func:`dataclasses.replace` to derive a modified copy.

    All key fields default to empty string (the existing semantic
    "not configured" — preserved from the original module-global
    behaviour where ``os.environ.get('X', '').strip()`` gave "" when
    unset).
    """

    vesselfinder_api_key: str = ""
    vesselfinder_fleet_key: str = ""
    shipsgo_api_key: str = ""
    shipsgo_fleet_key: str = ""
    aftership_api_key: str = ""

    # Provenance — useful for /tracking/status and debug surfaces.
    loaded_at: Optional[datetime] = None
    source: str = "unset"  # "unset" | "env" | "db" | "admin"

    # ── Convenience predicates — keep call-site logic DRY ────────────

    @property
    def vesselfinder_configured(self) -> bool:
        return bool(self.vesselfinder_api_key or self.vesselfinder_fleet_key)

    @property
    def shipsgo_configured(self) -> bool:
        return bool(self.shipsgo_api_key or self.shipsgo_fleet_key)

    @property
    def aftership_configured(self) -> bool:
        return bool(self.aftership_api_key)

    @property
    def any_configured(self) -> bool:
        return (
            self.vesselfinder_configured
            or self.shipsgo_configured
            or self.aftership_configured
        )

    def as_legacy_env_dict(self) -> dict[str, str]:
        """Return the same shape as the old ``_tracking_env_keys()``
        bridge.  Used during the migration so existing call sites need
        zero changes (Commit 24)."""
        return {
            "VESSELFINDER_API_KEY":   self.vesselfinder_api_key,
            "VESSELFINDER_FLEET_KEY": self.vesselfinder_fleet_key,
            "SHIPSGO_API_KEY":        self.shipsgo_api_key,
            "SHIPSGO_FLEET_KEY":      self.shipsgo_fleet_key,
            "AFTERSHIP_API_KEY":      self.aftership_api_key,
        }


# ── Internal mapping helpers ──────────────────────────────────────────


# DB / payload key  →  snapshot attribute name.  Same names used by the
# legacy ``/api/admin/tracking/providers/configure`` endpoint AND the
# legacy ``db.tracking_config`` document, so no data migration is
# required.
_KEY_MAP: dict[str, str] = {
    "vesselfinder":        "vesselfinder_api_key",
    "vesselfinder_fleet":  "vesselfinder_fleet_key",
    "shipsgo":             "shipsgo_api_key",
    "shipsgo_fleet":       "shipsgo_fleet_key",
    "aftership":           "aftership_api_key",
}

# ENV variable name  →  snapshot attribute name.
_ENV_MAP: dict[str, str] = {
    "VESSELFINDER_API_KEY":   "vesselfinder_api_key",
    "VESSELFINDER_FLEET_KEY": "vesselfinder_fleet_key",
    "SHIPSGO_API_KEY":        "shipsgo_api_key",
    "SHIPSGO_FLEET_KEY":      "shipsgo_fleet_key",
    "AFTERSHIP_API_KEY":      "aftership_api_key",
}


def _strip_or_empty(v: Any) -> str:
    """Normalize an incoming value to a non-None stripped string.

    Matches the legacy behaviour in ``server.py``:
        VESSELFINDER_API_KEY = os.environ.get('VESSELFINDER_API_KEY', '').strip()
        VESSELFINDER_API_KEY = str(payload['vesselfinder'] or '').strip()
    """
    if v is None:
        return ""
    return str(v).strip()


# ── Service ───────────────────────────────────────────────────────────


class TrackingConfigService:
    """Owns the 5 tracking provider keys.

    Construct once at app startup, call :meth:`load` to initialize from
    env + DB, then expose :meth:`snapshot` to readers and
    :meth:`update` to the admin reconfigure endpoint.

    Parameters
    ----------
    db
        AsyncIOMotorDatabase handle — the service reads/writes the
        ``tracking_config`` collection on it (single doc with
        ``_id == "providers"``).
    env
        Optional mapping used in place of ``os.environ`` — useful in
        unit tests to inject a deterministic env baseline.
    """

    DB_COLLECTION = "tracking_config"
    DB_DOC_ID = "providers"

    def __init__(self, db: Any, *, env: Optional[Mapping[str, str]] = None) -> None:
        self._db = db
        self._env = env if env is not None else os.environ
        self._snapshot: TrackingConfigSnapshot = TrackingConfigSnapshot()
        self._lock = asyncio.Lock()
        self._subscribers: list[asyncio.Queue[TrackingConfigSnapshot]] = []

    # ── Read side — sync, no I/O, no lock ────────────────────────────

    def snapshot(self) -> TrackingConfigSnapshot:
        """Return the current in-memory snapshot.

        Sync, lock-free, O(1).  Safe to call from any context.  The
        returned object is immutable.
        """
        return self._snapshot

    # ── Lifecycle ────────────────────────────────────────────────────

    async def load(self) -> TrackingConfigSnapshot:
        """Initial / forced reload: env baseline, then DB overrides.

        Idempotent — calling multiple times is safe and produces the
        same snapshot for the same inputs.

        Order matches the legacy startup sequence in ``server.py``:

          1. Module-level globals are bound to ``os.environ.get(...)``.
          2. ``_load_tracking_keys_from_db()`` overrides each non-empty
             field with the DB value.

        Failure mode: if the DB read raises, the service falls back to
        the env baseline (logged as warning).  Service still becomes
        usable.

        Returns the freshly-loaded snapshot.
        """
        async with self._lock:
            # 1) ENV baseline
            env_kwargs: dict[str, Any] = {}
            for env_name, attr in _ENV_MAP.items():
                env_kwargs[attr] = _strip_or_empty(self._env.get(env_name))
            env_snap = TrackingConfigSnapshot(
                **env_kwargs,
                loaded_at=datetime.now(timezone.utc),
                source="env",
            )
            self._snapshot = env_snap

            # 2) DB overrides (each non-empty field wins)
            try:
                doc = await self._db[self.DB_COLLECTION].find_one(
                    {"_id": self.DB_DOC_ID}
                )
            except Exception as e:
                logger.warning(
                    "[tracking_config] DB load failed, env-only: %s", e
                )
                return self._snapshot

            if not doc:
                # No DB doc yet — env is authoritative.
                return self._snapshot

            overrides: dict[str, Any] = {}
            for db_key, attr in _KEY_MAP.items():
                v = _strip_or_empty(doc.get(db_key))
                if v:
                    overrides[attr] = v
            if not overrides:
                # DB doc exists but no non-empty values — env wins.
                return self._snapshot

            db_snap = replace(
                env_snap,
                **overrides,
                loaded_at=datetime.now(timezone.utc),
                source="db",
            )
            self._snapshot = db_snap
            logger.info(
                "[tracking_config] loaded: vf=%s vf_fleet=%s sg=%s "
                "sg_fleet=%s as=%s source=%s",
                bool(db_snap.vesselfinder_api_key),
                bool(db_snap.vesselfinder_fleet_key),
                bool(db_snap.shipsgo_api_key),
                bool(db_snap.shipsgo_fleet_key),
                bool(db_snap.aftership_api_key),
                db_snap.source,
            )
            return self._snapshot

    # ── Write side ───────────────────────────────────────────────────

    async def update(
        self, payload: Mapping[str, Any]
    ) -> TrackingConfigSnapshot:
        """Apply a partial update to the snapshot and persist to DB.

        Behaviour 1:1 with the legacy
        ``POST /api/admin/tracking/providers/configure`` handler:

          * Only keys present in ``payload`` are touched.
          * Empty / None values CLEAR that key (matches legacy
            ``str(payload['x'] or '').strip()``).
          * Missing keys leave the existing value intact.
          * The DB doc is fully upserted with the new snapshot
            (matches legacy ``$set`` of all 5 fields).
          * Subscribers are notified with the new snapshot.

        Atomicity: the lock ensures the snapshot mutation and the DB
        write happen as a single critical section.  If the DB write
        fails, the snapshot is NOT updated (the exception propagates
        out and the caller decides).
        """
        async with self._lock:
            current = self._snapshot
            new_attrs: dict[str, Any] = {
                attr: getattr(current, attr) for attr in _KEY_MAP.values()
            }
            for db_key, attr in _KEY_MAP.items():
                if db_key in payload:
                    new_attrs[attr] = _strip_or_empty(payload[db_key])

            new = replace(
                current,
                **new_attrs,
                loaded_at=datetime.now(timezone.utc),
                source="admin",
            )

            await self._db[self.DB_COLLECTION].update_one(
                {"_id": self.DB_DOC_ID},
                {
                    "$set": {
                        "vesselfinder":       new.vesselfinder_api_key,
                        "vesselfinder_fleet": new.vesselfinder_fleet_key,
                        "shipsgo":            new.shipsgo_api_key,
                        "shipsgo_fleet":      new.shipsgo_fleet_key,
                        "aftership":          new.aftership_api_key,
                        "updatedAt":          new.loaded_at,
                    }
                },
                upsert=True,
            )

            self._snapshot = new
            self._broadcast(new)
            logger.info("[tracking_config] updated via admin")
            return new

    # ── Pub-sub for long-lived workers ───────────────────────────────

    def subscribe(self) -> "asyncio.Queue[TrackingConfigSnapshot]":
        """Return an asyncio.Queue that yields every NEW snapshot.

        Workers typically:

            queue = service.subscribe()
            while True:
                snap = await queue.get()
                # reconfigure self with snap...

        The queue has a small maxsize (8) — if a worker can't keep up,
        older snapshots are dropped with a warning.  This is
        intentional: the worker only cares about the LATEST config,
        not the history.

        Note: the current snapshot is NOT sent on subscribe.  Workers
        should call ``service.snapshot()`` first to seed their state,
        then await the queue for changes.
        """
        q: asyncio.Queue[TrackingConfigSnapshot] = asyncio.Queue(maxsize=8)
        self._subscribers.append(q)
        return q

    def unsubscribe(self, queue: "asyncio.Queue[TrackingConfigSnapshot]") -> None:
        """Remove a previously-subscribed queue.  Idempotent — silently
        ignored if the queue was never subscribed or already removed.
        """
        try:
            self._subscribers.remove(queue)
        except ValueError:
            pass

    def _broadcast(self, snap: TrackingConfigSnapshot) -> None:
        """Push a snapshot to every subscriber.  Best-effort,
        non-blocking — drops on queue overflow."""
        dropped = 0
        for q in list(self._subscribers):
            try:
                q.put_nowait(snap)
            except asyncio.QueueFull:
                dropped += 1
        if dropped:
            logger.warning(
                "[tracking_config] %d subscriber queue(s) full; "
                "dropped a snapshot delivery",
                dropped,
            )

    # ── Introspection (useful for /tracking/status, tests) ───────────

    def subscriber_count(self) -> int:
        """Number of active subscribers — for diagnostics / metrics."""
        return len(self._subscribers)


# ─────────────────────────────────────────────────────────────────────
# Phase 5.5/F — Module-level runtime accessor for the live singleton
# ─────────────────────────────────────────────────────────────────────
# Mirror of the C-5b ``app.core.aggregator_runtime`` and C-5c
# ``app.core.audit_runtime`` accessor pattern. Replaces the legacy
# ``getattr(server, "tracking_config_service", None)`` qualified-access
# shape in ``app/routers/admin_integrations.py`` with a canonical
# ``from app.services.tracking_config import get_service`` import.
#
# Contract:
#   * Single writer  — ``set_service(instance)`` called exactly once at
#                      module-load / startup time from ``server.py``
#                      immediately after
#                      ``tracking_config_service = TrackingConfigService(db)``
#                      + ``await tracking_config_service.load()``
#                      (server.py:2484-2487).
#   * Many readers   — ``get_service()`` returns the live instance or
#                      ``None`` pre-bind. The cold-start "None means
#                      not configured" semantic is identical to what
#                      the legacy ``getattr(server, ..., None)`` shape
#                      provided.
#   * Test helper    — ``clear_service_for_tests()`` resets to None.
#
# The setter accepts ``None`` to support test reset patterns. Rebinding
# semantics: idempotent — calling ``set_service`` twice with the same
# instance keeps the same identity; calling it with a different
# instance OVERWRITES (matches the legacy module-global semantics of
# ``server.tracking_config_service``).
# ─────────────────────────────────────────────────────────────────────
_service_ref: Optional["TrackingConfigService"] = None


def set_service(instance: Optional["TrackingConfigService"]) -> None:
    """One-shot setter for the live ``TrackingConfigService`` singleton.

    Called from ``server.py`` during the tracking-config bootstrap
    block (server.py:2484-2487, immediately after
    ``await tracking_config_service.load()`` succeeds). The lifecycle
    is owned by ``server.py``; this accessor is purely a publication
    surface so non-server consumers can stop using
    ``getattr(server, "tracking_config_service", None)``.

    Accepts ``None`` so test harnesses can reset state via
    ``clear_service_for_tests`` (which is a one-line wrapper).

    Rebinding semantics: idempotent — calling ``set_service`` twice
    with the same instance keeps the same identity; calling it with a
    different instance OVERWRITES. This mirrors the legacy
    ``server.tracking_config_service = TrackingConfigService(db)``
    behaviour exactly (the module-global is reassignable).
    """
    global _service_ref
    _service_ref = instance


def get_service() -> Optional["TrackingConfigService"]:
    """Return the live ``TrackingConfigService`` instance, or ``None``
    pre-bind.

    The cold-start semantic ("service not yet bound — caller falls
    back to its own default") is identical to what the legacy
    ``getattr(server, "tracking_config_service", None)`` shape
    provided in ``admin_integrations.py::_tracking_env_keys``. Object
    identity is preserved 1:1 with the legacy bridge: the setter is
    invoked exactly once with the same object that
    ``server.tracking_config_service`` holds.

    Lazy semantics (call at point-of-use, not at import) are
    preserved by NOT caching the return value at the consumer side
    — every caller invokes ``get_service()`` fresh.
    """
    return _service_ref


def clear_service_for_tests() -> None:
    """Reset the accessor to ``None``. TEST USE ONLY.

    Production code MUST NOT call this. It exists because the 5.5/F
    regression test suite needs to verify pre-load behaviour
    (``get_service() is None``) without rebooting the Python process.
    Always pair with ``set_service(original)`` in a try/finally to
    restore live state for any downstream test.
    """
    global _service_ref
    _service_ref = None


# ═════════════════════════════════════════════════════════════════════
# Phase 5.5 / F2 — TRACKING_ENABLED env-flag reader
# ═════════════════════════════════════════════════════════════════════
#
# This is a SIBLING function to the TrackingConfigService API above —
# NOT an accessor that consults service state.  Moved verbatim from
# ``server.py:2963`` during Phase 5.5/F2 (2026-05-19) per the user-
# approved mandate: ``Сохранить сигнатуру/поведение 1:1``.
#
# Pre-flight audit established that the helper reads the
# ``TRACKING_ENABLED`` env-var ONLY — it does NOT (and did not) invoke
# ``get_service()`` or read any module-global service state.  The
# mandate's conditional clause *"Если текущий helper читает module-
# global/service напрямую — заменить на get_service()"* therefore
# does not apply; the strict 1:1 port wins.  No accessor pattern,
# no service lifecycle coupling — just a pure env reader living in
# the same module as a topical sibling.
#
# Migration history:
#
#   * Pre-5.5/F2:  ``server._tracking_enabled`` (private, env-only).
#                  4 in-file callers in ``server.py``; 1 cross-module
#                  bridge in ``app/routers/admin_identity.py:67-69``
#                  (a local wrapper that lazy-imported
#                  ``from server import _tracking_enabled as _te``).
#                  ``BRIDGE_INVENTORY`` claimed ``consumers_count=1``
#                  (inventory drift — 5 callers actual).
#   * Phase 5.5/F2 (2026-05-19): moved HERE as the public
#                  ``tracking_enabled`` (no underscore — mirror of
#                  5.5/C ``create_order_from_invoice``, 5.5/D
#                  ``require_customer`` / ``ensure_customer_seed``,
#                  5.5/E ``get_stripe_config``). All 5 callers
#                  migrated to the canonical name. The
#                  ``admin_identity.py`` local wrapper retired
#                  entirely (no compat shim per D4).

def tracking_enabled() -> bool:
    """TRACKING_ENABLED kill switch reader.

    Returns ``True`` unless the ``TRACKING_ENABLED`` env-var is
    explicitly set to a disabled token (case-insensitive, whitespace-
    trimmed):

      * ``"0"``
      * ``"false"``
      * ``"no"``
      * ``"off"``

    Default (env-var unset) → ``True``.  Any other value (including
    typos, empty string, ``"yes"``, ``"1"``, etc.) → ``True``.

    Used by:
      * ``server.py`` × 4 sites — VesselFinder scraper dispatch +
        tracking worker entry guards.
      * ``app/routers/admin_identity.py`` × 1 site — admin tracking-
        status badge.

    Sync by design — safe to call from any context (async handlers,
    sync helpers, tight resolver loops, scraper workers).  Reads
    ``os.environ`` directly so a runtime env mutation in tests / dev
    is reflected without service restart.

    Notes
    -----
    This function intentionally does NOT consult
    ``TrackingConfigService`` / ``get_service()``.  The env-flag is a
    legacy kill switch for the entire VesselFinder + tracking-worker
    subsystem; the service is for runtime-mutable per-provider keys.
    Coupling the two would change semantics (a missing service would
    flip the kill switch — a forbidden behaviour change).
    """
    return os.environ.get("TRACKING_ENABLED", "true").strip().lower() not in (
        "0", "false", "no", "off",
    )


__all__ = [
    "TrackingConfigSnapshot",
    "TrackingConfigService",
    "set_service",
    "get_service",
    "clear_service_for_tests",
    # Phase 5.5/F2 (2026-05-19) — env-flag reader
    "tracking_enabled",
]
