"""
Phase 4 / C-5 — Invariant gate test suite.
==========================================

Executable rules that pin the architectural invariants Phase 4
delivered.  Any change that breaks one of these tests is a
regression and must be reverted or explicitly accepted with a
matching invariant update.

Structure (per user mandate option C + semantic (b)):

  PASS invariants (must always be green)
    1. OpenAPI paths == 618
    2. OpenAPI operations == 679
    3. worker registry count == 7
    4. no duplicate worker names
    5. worker_active_instances == 1.0 for all 7
    6. graceful drain semantics expressible (worker_drain_duration_ms
       histogram declared in /metrics)
    7. admin_router_count <= 27 (ratchet ceiling — tightened to live value)
    8. no live @on_event decorators in server.py
    9. /metrics returns 200
   10. structured JSON log writable + tail parses

  RATCHET invariants (current ceiling — must not grow)
   11. asyncio.create_task total <= CURRENT_BASELINE (31)

  SEMANTIC invariants (architectural — not grep)
   12. no orphan long-running unsupervised workers
   13. fastapi_app constructed with lifespan=lifespan

  XFAIL targets (Phase 5 cleanup goals — currently red on purpose)
   14. admin perimeter <= 6
   15. asyncio.create_task total == 0

Running
-------
    cd /app/backend && pytest tests/test_phase4_invariants.py -v

Or via the shell smoke (also covers the shutdown-cycle test that
cannot run inside a single pytest process):

    bash /app/tools/check_phase4_invariants.sh

Backend URL is read from ``BIBI_BACKEND_URL`` env var
(default ``http://localhost:8001``).
"""
from __future__ import annotations

import pytest

from tests._invariants_helpers import (
    # constants
    OPENAPI_PATHS_FREEZE,
    OPENAPI_OPERATIONS_FREEZE,
    WORKER_REGISTRY_COUNT_FREEZE,
    EXPECTED_WORKER_NAMES,
    ADMIN_ROUTER_CEILING,
    ASYNCIO_CREATE_TASK_CEILING,
    ADMIN_ROUTER_TARGET,
    ASYNCIO_CREATE_TASK_TARGET,
    # scrapers
    fetch_openapi,
    count_openapi_surface,
    fetch_metrics_text,
    parse_prometheus,
    # log
    structured_log_is_writable,
    # AST
    count_admin_router_mounts,
    count_total_create_task,
    find_live_on_event_decorators,
    find_unsupervised_hot_path_spawns,
    fastapi_app_has_lifespan_kwarg,
)


# ───────────────────────────────────────────────────────────────────
# Session-scoped fixtures — fetch live state ONCE per test session
# to keep total runtime well under 30s.
# ───────────────────────────────────────────────────────────────────
@pytest.fixture(scope="session")
def openapi_schema():
    return fetch_openapi()


@pytest.fixture(scope="session")
def metrics_text():
    return fetch_metrics_text()


@pytest.fixture(scope="session")
def metrics(metrics_text):
    return parse_prometheus(metrics_text)


# ═══════════════════════════════════════════════════════════════════
# PASS invariants (1–10) — must be green
# ═══════════════════════════════════════════════════════════════════

# I1 ────────────────────────────────────────────────────────────────
def test_openapi_paths_frozen(openapi_schema):
    """Phase 3.4 / C-3 closure pinned OpenAPI surface at 618 paths."""
    paths, _ = count_openapi_surface(openapi_schema)
    assert paths == OPENAPI_PATHS_FREEZE, (
        f"OpenAPI path count drifted: {paths} != {OPENAPI_PATHS_FREEZE}. "
        f"Phase 3.4 / 4 freeze must NOT change without a roadmap-level "
        f"decision and matching invariant update."
    )


# I2 ────────────────────────────────────────────────────────────────
def test_openapi_operations_frozen(openapi_schema):
    """Phase 3.4 / C-3 closure pinned OpenAPI surface at 679 operations."""
    _, ops = count_openapi_surface(openapi_schema)
    assert ops == OPENAPI_OPERATIONS_FREEZE, (
        f"OpenAPI operation count drifted: {ops} != {OPENAPI_OPERATIONS_FREEZE}."
    )


# I3 ────────────────────────────────────────────────────────────────
def test_worker_registry_count_is_seven(metrics):
    """Phase 3.4 / C-4 + C-7 settled the registry at exactly 7 supervised workers."""
    active = metrics.get("worker_active_instances", [])
    assert len(active) == WORKER_REGISTRY_COUNT_FREEZE, (
        f"worker count = {len(active)} (expected {WORKER_REGISTRY_COUNT_FREEZE}). "
        f"Adding / removing supervised workers requires a closure document."
    )


# I4 ────────────────────────────────────────────────────────────────
def test_no_duplicate_worker_names(metrics):
    """Every supervised worker name must be unique."""
    active = metrics.get("worker_active_instances", [])
    names = [s.labels.get("name") for s in active]
    assert len(names) == len(set(names)), (
        f"duplicate worker names in registry: {names}"
    )
    assert set(names) == EXPECTED_WORKER_NAMES, (
        f"worker name set drift: got {sorted(set(names))}, "
        f"expected {sorted(EXPECTED_WORKER_NAMES)}"
    )


# I5 ────────────────────────────────────────────────────────────────
def test_all_workers_active_instances_one(metrics):
    """Phase 3.4 invariant: every registered worker MUST have
    active_instances == 1.0 while the process is alive."""
    active = metrics.get("worker_active_instances", [])
    bad = [(s.labels.get("name"), s.value) for s in active if s.value != 1.0]
    assert not bad, f"workers with active_instances != 1.0: {bad}"


# I6 ────────────────────────────────────────────────────────────────
def test_graceful_drain_histogram_declared(metrics_text, metrics):
    """The drain-duration histogram must be declared so operators
    can grep / Prometheus can scrape it on the very first shutdown
    (i.e. before the first sample arrives).  Presence-is-truth.

    The cycle-test that asserts the COUNTER ACTUALLY INCREMENTS
    across a stop/start cycle lives in
    ``tools/check_phase4_invariants.sh`` (it requires SIGTERM-ing
    the backend, which cannot happen inside the pytest process)."""
    assert "worker_drain_duration_ms" in metrics_text, (
        "Histogram `worker_drain_duration_ms` not declared in /metrics output."
    )
    # The histogram must declare _count / _sum / at least one _bucket
    assert "worker_drain_duration_ms_bucket" in metrics_text
    assert "worker_drain_duration_ms_count" in metrics_text
    assert "worker_drain_duration_ms_sum" in metrics_text


# I7 ────────────────────────────────────────────────────────────────
def test_admin_router_count_under_ceiling():
    """RATCHET: admin perimeter must NOT grow beyond current baseline.
    Phase 5 cleanup will ratchet this downward toward the Phase 5 target.
    """
    count = count_admin_router_mounts()
    assert count <= ADMIN_ROUTER_CEILING, (
        f"admin router count = {count} exceeds ratchet ceiling "
        f"{ADMIN_ROUTER_CEILING}. New admin routers must NOT be mounted "
        f"directly in server.py — use module-level mounting in app/routers/."
    )


# I8 ────────────────────────────────────────────────────────────────
def test_no_live_on_event_decorators():
    """Phase 4 / C-1 replaced all legacy @on_event wiring with a
    single lifespan context manager.  Re-introducing a live
    @app.on_event decorator would silently fragment startup
    orchestration."""
    lines = find_live_on_event_decorators()
    assert not lines, (
        f"live @on_event decorators found at lines {lines} — "
        f"all startup/shutdown hooks must be orchestrated through "
        f"the `lifespan()` context manager."
    )


# I9 ────────────────────────────────────────────────────────────────
def test_metrics_endpoint_responds_200():
    """Phase 4 / C-4 mounted /metrics as a non-OpenAPI route."""
    import httpx
    from tests._invariants_helpers import DEFAULT_BACKEND_URL
    r = httpx.get(f"{DEFAULT_BACKEND_URL}/metrics", timeout=10.0)
    assert r.status_code == 200, f"GET /metrics returned {r.status_code}"
    assert "text/plain" in r.headers.get("content-type", ""), (
        f"unexpected content-type: {r.headers.get('content-type')}"
    )


# I10 ───────────────────────────────────────────────────────────────
def test_metrics_excluded_from_openapi(openapi_schema):
    """/metrics MUST stay out of the OpenAPI schema to preserve the
    618/679 freeze."""
    paths = list(openapi_schema.get("paths", {}).keys())
    assert "/metrics" not in paths, (
        "/metrics leaked into OpenAPI schema — would break 618/679 freeze."
    )


def test_structured_log_writable():
    """Phase 4 / C-3 — the JSONL feed must be alive and tail-parseable."""
    ok, diag = structured_log_is_writable()
    assert ok, f"structured log not writable: {diag}"


# ═══════════════════════════════════════════════════════════════════
# RATCHET invariants (11) — current ceiling, must not grow
# ═══════════════════════════════════════════════════════════════════

# I11 ───────────────────────────────────────────────────────────────
def test_asyncio_create_task_total_under_ratchet():
    """RATCHET: total ``asyncio.create_task(...)`` call sites in
    server.py must NOT exceed the current baseline.  Phase 5 cleanup
    will ratchet this downward toward 0 (the XFAIL target below).

    NOTE: this is a RAW count.  The architectural concern (orphan
    long-running supervisors) is captured separately by
    ``test_no_orphan_long_running_workers`` below — that test is the
    one that actually pins production safety.  This ratchet is a
    cosmetic ceiling that prevents accidental proliferation."""
    total = count_total_create_task()
    assert total <= ASYNCIO_CREATE_TASK_CEILING, (
        f"asyncio.create_task call count = {total} exceeds ratchet "
        f"ceiling {ASYNCIO_CREATE_TASK_CEILING}. New unmanaged spawns "
        f"should be avoided — prefer worker_registry.register(...) for "
        f"long-running coroutines, or document the spawn as a "
        f"short-lived fire-and-forget."
    )


# ═══════════════════════════════════════════════════════════════════
# SEMANTIC invariants (12–13) — architectural classification
# ═══════════════════════════════════════════════════════════════════

# I12 ───────────────────────────────────────────────────────────────
def test_no_orphan_long_running_workers():
    """SEMANTIC: every long-running coroutine spawned via
    ``asyncio.create_task(...)`` must be either:

      (a) supervised by worker_registry (the canonical primary path), or
      (b) a legacy-fallback inside an `except` branch of a `try/except`
          whose `try` body registers the same worker (the canonical
          defensive fallback path), or
      (c) NOT a long-running loop (short-lived ad-hoc task).

    The AST classifier identifies "long-running by name" via the
    pattern ``_loop|_worker|_cron|_poll|_supervised|_runner|_scheduler``.

    This is the PRODUCTION-CRITICAL invariant — orphan supervisors
    are what caused the runtime drift Phase 3.4 / 4 fixed."""
    orphans = find_unsupervised_hot_path_spawns()
    detail = ", ".join(f"L{s.line}:{s.callee_name}" for s in orphans)
    assert not orphans, (
        f"orphan long-running create_task spawns detected: {detail}. "
        f"Use `worker_registry.register(name, coro_factory)` instead, "
        f"or rename the coroutine so it does not match the hot-path "
        f"naming convention if it is genuinely short-lived."
    )


# I13 ───────────────────────────────────────────────────────────────
def test_fastapi_app_has_lifespan_kwarg():
    """SEMANTIC: ``fastapi_app = FastAPI(..., lifespan=lifespan)``
    must be present.  This is the canonical orchestrator that
    replaced the legacy @on_event wiring in Phase 4 / C-1."""
    assert fastapi_app_has_lifespan_kwarg(), (
        "FastAPI(...) constructor missing `lifespan=lifespan` kwarg. "
        "Reverting to @on_event would re-introduce the half-done "
        "startup state that Phase 4 / C-1 closed."
    )


# ═══════════════════════════════════════════════════════════════════
# XFAIL targets (14–15) — Phase 5 cleanup goals
# ═══════════════════════════════════════════════════════════════════

# I14 ───────────────────────────────────────────────────────────────
@pytest.mark.xfail(
    reason="Phase 5 cleanup target: admin perimeter <= 6 (currently 27). "
           "This test will be GREEN only after admin router consolidation.",
    strict=False,
)
def test_admin_perimeter_meets_phase5_target():
    """XFAIL: aspirational target for Phase 5 / architecture cleanup."""
    count = count_admin_router_mounts()
    assert count <= ADMIN_ROUTER_TARGET, (
        f"admin router count {count} still above Phase 5 target "
        f"{ADMIN_ROUTER_TARGET}"
    )


# I15 ───────────────────────────────────────────────────────────────
@pytest.mark.xfail(
    reason="Phase 5 cleanup target: zero raw asyncio.create_task in server.py. "
           "Every spawn should go through worker_registry. Currently 31.",
    strict=False,
)
def test_asyncio_create_task_total_meets_phase5_target():
    """XFAIL: aspirational target for Phase 5 / architecture cleanup."""
    total = count_total_create_task()
    assert total <= ASYNCIO_CREATE_TASK_TARGET, (
        f"asyncio.create_task count {total} still above Phase 5 target "
        f"{ASYNCIO_CREATE_TASK_TARGET}"
    )
