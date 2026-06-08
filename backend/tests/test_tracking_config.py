"""
Unit tests for ``app.services.tracking_config``.

Mocks the Mongo handle so the service can be exercised in isolation
without a running database.  Run with::

    cd /app/backend && python3 -m pytest tests/test_tracking_config.py -v
"""
from __future__ import annotations

import asyncio
import sys
from pathlib import Path
from typing import Any, Optional

import pytest

# Make backend/ importable
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.services.tracking_config import (  # noqa: E402
    TrackingConfigService,
    TrackingConfigSnapshot,
)


# ── Mock Mongo handle ─────────────────────────────────────────────────


class _MockCollection:
    """In-memory single-doc collection that mimics motor's
    AsyncIOMotorCollection for the two methods we use."""

    def __init__(self) -> None:
        self.doc: Optional[dict[str, Any]] = None
        self.find_one_should_raise: Optional[Exception] = None
        self.update_one_should_raise: Optional[Exception] = None

    async def find_one(self, filt: dict[str, Any]) -> Optional[dict[str, Any]]:
        if self.find_one_should_raise:
            raise self.find_one_should_raise
        if not self.doc:
            return None
        if all(self.doc.get(k) == v for k, v in filt.items()):
            return dict(self.doc)
        return None

    async def update_one(
        self, filt: dict[str, Any], update: dict[str, Any], upsert: bool = False
    ) -> None:
        if self.update_one_should_raise:
            raise self.update_one_should_raise
        # Apply $set
        if "$set" in update:
            if self.doc is None:
                if not upsert:
                    raise RuntimeError("no doc and upsert=False")
                self.doc = dict(filt)
            self.doc.update(update["$set"])


class _MockDB:
    """Minimal motor-like database — just ``db[collection_name]``."""

    def __init__(self) -> None:
        self._cols: dict[str, _MockCollection] = {}

    def __getitem__(self, name: str) -> _MockCollection:
        if name not in self._cols:
            self._cols[name] = _MockCollection()
        return self._cols[name]


# ── Fixtures ──────────────────────────────────────────────────────────


@pytest.fixture
def db():
    return _MockDB()


@pytest.fixture
def env_empty():
    return {}


@pytest.fixture
def env_full():
    return {
        "VESSELFINDER_API_KEY":   "vf-env",
        "VESSELFINDER_FLEET_KEY": "vff-env",
        "SHIPSGO_API_KEY":        "sg-env",
        "SHIPSGO_FLEET_KEY":      "sgf-env",
        "AFTERSHIP_API_KEY":      "as-env",
    }


# ── Snapshot dataclass ────────────────────────────────────────────────


class TestSnapshot:
    def test_default_is_all_empty(self):
        s = TrackingConfigSnapshot()
        assert s.vesselfinder_api_key == ""
        assert s.shipsgo_api_key == ""
        assert s.any_configured is False
        assert s.source == "unset"

    def test_predicates(self):
        s = TrackingConfigSnapshot(vesselfinder_api_key="x")
        assert s.vesselfinder_configured is True
        assert s.shipsgo_configured is False
        assert s.aftership_configured is False
        assert s.any_configured is True

        s2 = TrackingConfigSnapshot(shipsgo_fleet_key="y")
        assert s2.shipsgo_configured is True
        assert s2.any_configured is True

    def test_legacy_env_dict_shape(self):
        s = TrackingConfigSnapshot(
            vesselfinder_api_key="a",
            vesselfinder_fleet_key="b",
            shipsgo_api_key="c",
            shipsgo_fleet_key="d",
            aftership_api_key="e",
        )
        d = s.as_legacy_env_dict()
        assert d == {
            "VESSELFINDER_API_KEY":   "a",
            "VESSELFINDER_FLEET_KEY": "b",
            "SHIPSGO_API_KEY":        "c",
            "SHIPSGO_FLEET_KEY":      "d",
            "AFTERSHIP_API_KEY":      "e",
        }

    def test_is_frozen(self):
        s = TrackingConfigSnapshot()
        with pytest.raises(Exception):
            # Frozen dataclass → AttributeError or FrozenInstanceError
            s.vesselfinder_api_key = "boom"  # type: ignore[misc]


# ── load() ────────────────────────────────────────────────────────────


class TestLoad:
    @pytest.mark.asyncio
    async def test_empty_env_empty_db(self, db, env_empty):
        svc = TrackingConfigService(db, env=env_empty)
        snap = await svc.load()
        assert snap.vesselfinder_api_key == ""
        assert snap.shipsgo_api_key == ""
        assert snap.source == "env"
        assert snap.any_configured is False
        # snapshot() returns same instance
        assert svc.snapshot() is snap

    @pytest.mark.asyncio
    async def test_env_only(self, db, env_full):
        svc = TrackingConfigService(db, env=env_full)
        snap = await svc.load()
        assert snap.vesselfinder_api_key == "vf-env"
        assert snap.shipsgo_api_key == "sg-env"
        assert snap.aftership_api_key == "as-env"
        assert snap.source == "env"

    @pytest.mark.asyncio
    async def test_db_overrides_env(self, db, env_full):
        # Seed DB doc
        db["tracking_config"].doc = {
            "_id": "providers",
            "vesselfinder":       "vf-db",
            "shipsgo":            "sg-db",
            # vesselfinder_fleet missing → env wins
            # shipsgo_fleet missing → env wins
            # aftership empty → env wins
            "aftership":          "",
        }
        svc = TrackingConfigService(db, env=env_full)
        snap = await svc.load()
        assert snap.vesselfinder_api_key == "vf-db"          # DB win
        assert snap.vesselfinder_fleet_key == "vff-env"      # env win
        assert snap.shipsgo_api_key == "sg-db"               # DB win
        assert snap.shipsgo_fleet_key == "sgf-env"           # env win
        assert snap.aftership_api_key == "as-env"            # empty DB → env win
        assert snap.source == "db"

    @pytest.mark.asyncio
    async def test_db_only(self, db, env_empty):
        db["tracking_config"].doc = {
            "_id": "providers",
            "vesselfinder":       "vf-db",
            "vesselfinder_fleet": "vff-db",
            "shipsgo":            "sg-db",
            "shipsgo_fleet":      "sgf-db",
            "aftership":          "as-db",
        }
        svc = TrackingConfigService(db, env=env_empty)
        snap = await svc.load()
        assert snap.vesselfinder_api_key == "vf-db"
        assert snap.aftership_api_key == "as-db"
        assert snap.source == "db"

    @pytest.mark.asyncio
    async def test_db_doc_present_but_all_empty_env_wins(self, db, env_full):
        db["tracking_config"].doc = {
            "_id": "providers",
            "vesselfinder":       "",
            "vesselfinder_fleet": "",
            "shipsgo":            "",
            "shipsgo_fleet":      "",
            "aftership":          "",
        }
        svc = TrackingConfigService(db, env=env_full)
        snap = await svc.load()
        # Env baseline wins because DB has no non-empty overrides
        assert snap.vesselfinder_api_key == "vf-env"
        assert snap.source == "env"

    @pytest.mark.asyncio
    async def test_db_failure_falls_back_to_env(self, db, env_full):
        db["tracking_config"].find_one_should_raise = RuntimeError("mongo down")
        svc = TrackingConfigService(db, env=env_full)
        snap = await svc.load()
        # Env baseline preserved
        assert snap.vesselfinder_api_key == "vf-env"
        assert snap.source == "env"

    @pytest.mark.asyncio
    async def test_load_is_idempotent(self, db, env_full):
        svc = TrackingConfigService(db, env=env_full)
        snap1 = await svc.load()
        snap2 = await svc.load()
        # Different instances (loaded_at differs) but values equal
        assert snap1.vesselfinder_api_key == snap2.vesselfinder_api_key
        assert snap1.source == snap2.source

    @pytest.mark.asyncio
    async def test_env_values_are_stripped(self, db):
        env = {"VESSELFINDER_API_KEY": "  vf-padded  "}
        svc = TrackingConfigService(db, env=env)
        snap = await svc.load()
        assert snap.vesselfinder_api_key == "vf-padded"

    @pytest.mark.asyncio
    async def test_none_env_values_become_empty(self, db):
        # Real os.environ never has None values, but a custom mapping might
        env = {"VESSELFINDER_API_KEY": None}  # type: ignore[dict-item]
        svc = TrackingConfigService(db, env=env)
        snap = await svc.load()
        assert snap.vesselfinder_api_key == ""


# ── update() ──────────────────────────────────────────────────────────


class TestUpdate:
    @pytest.mark.asyncio
    async def test_partial_update_only_touches_named_keys(self, db, env_full):
        svc = TrackingConfigService(db, env=env_full)
        await svc.load()

        new = await svc.update({"vesselfinder": "new-vf"})
        assert new.vesselfinder_api_key == "new-vf"
        # Others unchanged
        assert new.vesselfinder_fleet_key == "vff-env"
        assert new.shipsgo_api_key == "sg-env"
        assert new.aftership_api_key == "as-env"
        assert new.source == "admin"

        # DB doc reflects FULL upsert (all 5 fields)
        doc = db["tracking_config"].doc
        assert doc is not None
        assert doc["vesselfinder"] == "new-vf"
        assert doc["vesselfinder_fleet"] == "vff-env"  # preserved
        assert doc["shipsgo"] == "sg-env"
        assert doc["aftership"] == "as-env"

    @pytest.mark.asyncio
    async def test_empty_string_clears_key(self, db, env_full):
        svc = TrackingConfigService(db, env=env_full)
        await svc.load()

        new = await svc.update({"shipsgo": ""})
        assert new.shipsgo_api_key == ""
        # Others unchanged
        assert new.vesselfinder_api_key == "vf-env"

    @pytest.mark.asyncio
    async def test_none_value_clears_key(self, db, env_full):
        svc = TrackingConfigService(db, env=env_full)
        await svc.load()

        new = await svc.update({"aftership": None})
        assert new.aftership_api_key == ""

    @pytest.mark.asyncio
    async def test_missing_key_in_payload_preserves_value(self, db, env_full):
        svc = TrackingConfigService(db, env=env_full)
        await svc.load()

        before = svc.snapshot()
        new = await svc.update({})  # empty payload
        assert new.vesselfinder_api_key == before.vesselfinder_api_key
        assert new.shipsgo_api_key == before.shipsgo_api_key
        assert new.source == "admin"  # source still changes

    @pytest.mark.asyncio
    async def test_update_propagates_db_failure_and_snapshot_unchanged(self, db, env_full):
        svc = TrackingConfigService(db, env=env_full)
        await svc.load()
        before = svc.snapshot()

        db["tracking_config"].update_one_should_raise = RuntimeError("mongo write fail")

        with pytest.raises(RuntimeError, match="mongo write fail"):
            await svc.update({"vesselfinder": "would-not-persist"})

        # Snapshot must NOT have been mutated — atomicity invariant.
        assert svc.snapshot().vesselfinder_api_key == before.vesselfinder_api_key

    @pytest.mark.asyncio
    async def test_value_is_stripped(self, db, env_full):
        svc = TrackingConfigService(db, env=env_full)
        await svc.load()

        new = await svc.update({"vesselfinder": "  trimmed  "})
        assert new.vesselfinder_api_key == "trimmed"


# ── subscribe() / broadcast ───────────────────────────────────────────


class TestSubscribe:
    @pytest.mark.asyncio
    async def test_subscriber_receives_update(self, db, env_empty):
        svc = TrackingConfigService(db, env=env_empty)
        await svc.load()

        q = svc.subscribe()
        assert svc.subscriber_count() == 1

        await svc.update({"vesselfinder": "broadcast-test"})
        snap = await asyncio.wait_for(q.get(), timeout=1.0)
        assert snap.vesselfinder_api_key == "broadcast-test"
        assert snap.source == "admin"

    @pytest.mark.asyncio
    async def test_subscribe_does_not_send_current_snapshot(self, db, env_full):
        svc = TrackingConfigService(db, env=env_full)
        await svc.load()  # snapshot has values now

        q = svc.subscribe()
        # No update yet — queue is empty.
        assert q.empty()

    @pytest.mark.asyncio
    async def test_multiple_subscribers_all_receive(self, db, env_empty):
        svc = TrackingConfigService(db, env=env_empty)
        await svc.load()

        q1 = svc.subscribe()
        q2 = svc.subscribe()
        q3 = svc.subscribe()

        await svc.update({"shipsgo": "fanout"})

        for q in (q1, q2, q3):
            snap = await asyncio.wait_for(q.get(), timeout=1.0)
            assert snap.shipsgo_api_key == "fanout"

    @pytest.mark.asyncio
    async def test_unsubscribe_stops_receiving(self, db, env_empty):
        svc = TrackingConfigService(db, env=env_empty)
        await svc.load()

        q = svc.subscribe()
        svc.unsubscribe(q)
        assert svc.subscriber_count() == 0

        await svc.update({"vesselfinder": "should-not-arrive"})
        assert q.empty()

    @pytest.mark.asyncio
    async def test_unsubscribe_unknown_queue_is_silent(self, db, env_empty):
        svc = TrackingConfigService(db, env=env_empty)
        stray: asyncio.Queue = asyncio.Queue()
        # Should not raise
        svc.unsubscribe(stray)

    @pytest.mark.asyncio
    async def test_full_subscriber_drops_silently(self, db, env_empty):
        """A subscriber that doesn't drain its queue must NOT block
        update() — overflowed entries are dropped."""
        svc = TrackingConfigService(db, env=env_empty)
        await svc.load()

        q = svc.subscribe()
        # Fill the queue beyond maxsize=8 without ever consuming.
        for i in range(20):
            await svc.update({"vesselfinder": f"v{i}"})

        # update() never raised, snapshot is the last value.
        assert svc.snapshot().vesselfinder_api_key == "v19"
        # Queue still has at most maxsize entries.
        assert q.qsize() <= 8


# ── snapshot() ────────────────────────────────────────────────────────


class TestSnapshotAccess:
    @pytest.mark.asyncio
    async def test_snapshot_before_load_is_default(self, db, env_full):
        svc = TrackingConfigService(db, env=env_full)
        snap = svc.snapshot()  # NOT awaited load()
        assert snap.source == "unset"
        assert snap.any_configured is False

    @pytest.mark.asyncio
    async def test_snapshot_after_load_reflects_state(self, db, env_full):
        svc = TrackingConfigService(db, env=env_full)
        await svc.load()
        snap = svc.snapshot()
        assert snap.vesselfinder_api_key == "vf-env"

    @pytest.mark.asyncio
    async def test_snapshot_after_update_reflects_state(self, db, env_full):
        svc = TrackingConfigService(db, env=env_full)
        await svc.load()
        await svc.update({"shipsgo": "after-update"})
        assert svc.snapshot().shipsgo_api_key == "after-update"


# ── Concurrency invariant ─────────────────────────────────────────────


class TestConcurrency:
    @pytest.mark.asyncio
    async def test_concurrent_updates_are_serialized(self, db, env_empty):
        """Many concurrent updates must all land; the final snapshot
        equals one of them (no torn writes)."""
        svc = TrackingConfigService(db, env=env_empty)
        await svc.load()

        async def w(i: int):
            await svc.update({"vesselfinder": f"v{i:03d}"})

        await asyncio.gather(*(w(i) for i in range(50)))

        final = svc.snapshot().vesselfinder_api_key
        # Must be ONE of the values we wrote
        assert final in {f"v{i:03d}" for i in range(50)}
        # DB doc must also reflect that exact value
        assert db["tracking_config"].doc is not None
        assert db["tracking_config"].doc["vesselfinder"] == final
