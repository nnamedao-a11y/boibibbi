# Wave 2B Final Topology Freeze + Dependency Archaeology

> **Status:** READ-ONLY archaeological report. No code mutated to produce
> this document. Established immediately after Batch 10 / Commit 16.
>
> **Established:** 2026-05-17 (post-Batch-10 closeout).
>
> **Purpose:** Fix the actual topology of the post-Batch-10 admin surface
> before any further extraction. Produce a decision tree for the
> remaining 64 admin endpoints and prioritise Phase 3 runtime-state
> problems.

---

## 0. Route count snapshot (post-Batch-10)

```
@fastapi_app.* decorators in server.py        :  517
@fastapi_app.* decorators consuming /api/admin :   64
server.py LOC                                  :  23,251
Wave 2B routers under app/routers/             :   16
Wave 1 legacy modules at backend/ root         :    5
OpenAPI total method-routes                    :  679 ← invariant held
OpenAPI unique paths                           :  618 ← invariant held
Admin surface extracted from monolith          :   55%
```

Invariant `OpenAPI 679 method-routes / 618 unique paths` has now been
held for **15 consecutive commits** (every Wave 2B batch + Wave 1
closeout).

---

## 1. Full inventory — 64 remaining /api/admin/* endpoints in server.py

### 1.1 Sub-prefix distribution

| Sub-prefix | Count | First line | Cluster |
|---|---:|---:|---|
| `ringostat`         | 11 | 21516 | Cluster #1 (integrations / telephony) |
| `integrations`      |  9 |  3798 | Cluster #1 (integrations) |
| `identity`          |  8 | 22324 | Cluster #1 (operational core) |
| `engagement`        |  8 |  3626 | analytics / read-only |
| `ext-clients`       |  5 | 22564 | own collection + audit |
| `shipments`         |  4 | 20690 | Cluster #1 (logistics) |
| `resolver`          |  4 | 20891 | Cluster #1 (resolver/identity) |
| `intent`            |  4 |  3534 | analytics / read-only |
| `tracking`          |  3 | 20119 | **PHASE 3 BLOCKER (runtime globals)** |
| `settings`          |  2 | 10767 | clean (service singleton) |
| `providers`         |  2 | 14800 | analytics / read-only |
| `lead-requests`     |  2 | 23110 | Cluster #1 (CRM leads write) |
| `predictive-leads`  |  1 | 14879 | analytics / read-only |
| `overview`          |  1 | 14866 | analytics / read-only |
| **TOTAL**           | **64** |  |  |

### 1.2 Auth-pattern distribution (no normalisation — observation only)

| Auth pattern | Count | Used by sub-prefixes |
|---|---:|---|
| Style A — `@fastapi_app.X(..., dependencies=[Depends(require_admin)])` | 46 | most clusters |
| Style B — bare decorator + `current_user: dict = Depends(require_admin)` in handler signature | 18 | `identity` (8), `ext-clients` (5), `tracking/status` (1), `resolver/exceptions` (1), `resolver/identity/*` (1), `lead-requests` (2) |

Style B endpoints declare auth in the function signature instead of the
decorator because they USE `current_user` inside the handler (for
`audit()` logging or attribution). Functionally equivalent to Style A —
same 401-gating, same dependency-cache behavior.  **No normalisation
required for extraction** — FastAPI router syntax preserves both forms
1:1.

---

## 2. Writer/Reader matrix — per-cluster Mongo footprint

> All `db.<collection>.<op>` calls inside admin endpoint bodies, grouped
> by the cluster they live in.

| Cluster | #EP | WRITES | READS | Side-effects |
|---|---:|---|---|---|
| `engagement` | 8 | — | `compare`, `customers`, multiple analytics colls | — |
| `ext-clients` | 5 | `ext_clients(insert+update)` | `ext_clients`, `staff` | `audit()×4` |
| `identity` | 8 | `resolver_exceptions(update)` | `deals`, `ext_heartbeat`, `resolver_exceptions`, `shipments` | `audit()×4`, `sio.emit×1` (shipment:update), `_make_identity_resolver()` |
| `integrations` | 9 | `integration_configs(update)`, `ringostat_config(update)` | `integration_configs`, `ringostat_config` | — |
| `intent` | 4 | — | (analytics) | — |
| `lead-requests` | 2 | `lead_requests(update)`, **`leads(insert)`** ⚠️ | `lead_requests`, `staff` | — |
| `overview` | 1 | — | `customers`, `deals`, `leads`, `vin_data` (count_documents only) | — |
| `predictive-leads` | 1 | — | `leads(find)` | — |
| `providers` | 2 | — | `staff`, `users` | — |
| `resolver` | 4 | — | `shipments(find)` | `serialize_doc` |
| `ringostat` | 11 | `ringostat_calls(insert)`, `ringostat_config(insert+update)` | `deals`, `leads`, `ringostat_calls`, `ringostat_config` | `serialize_doc` |
| `settings` | 2 | `integration_configs(update)` | (via `get_settings_service()`) | — |
| `shipments` | 4 | — | `shipments(find)` | `serialize_doc` |
| `tracking` | 3 | `tracking_config(update)` | (mostly reads module globals) | — |

⚠️ Single endpoint that writes Cluster #1 `leads` collection:
`POST /api/admin/lead-requests/{req_id}/action` (server.py:23146).
This is the **only** admin endpoint that performs runtime mutation on
the canonical CRM `leads` collection.

---

## 3. Cluster #1 collection access density (cross-server.py)

| Collection | Total `db.<col>.*` sites in server.py | Owner (per ROADMAP.md) |
|---|---:|---|
| `shipments`           | 85 | Logistics |
| `vin_data`            | 46 | Ingestion |
| `customers`           | 38 | Customer |
| `leads`               | 37 | CRM |
| `staff`               | 34 | Identity / HR |
| `deals`               | 30 | Legal / Operations |
| `ringostat_calls`     | 26 | Integrations / Telephony |
| `ringostat_config`    | 20 | Integrations / Telephony |
| `integration_configs` | 10 | Integrations |

Each of these is a **multi-owner collection** today — written from
multiple sub-domains, read from even more. Phase 3 ownership assignment
is what converts this into a clean DAG.

---

## 4. Reverse import audit

### 4.1 server.py → app/routers (mount blocks + lazy helper imports)

Mount blocks (16, all under `try/except` for safety):

| Router | Mounted at | Owns collection(s) |
|---|---:|---|
| `admin_kpi`              | 2479 | (none — service-only) |
| `admin_staff_sessions`   | 2487 | (none — service-only) |
| `admin_security`         | 2501 | `admin_security` |
| `admin_history_reports`  | 2509 | `history_reports` |
| `admin_proxy`            | 2523 | (none) |
| `admin_sources`          | 2531 | (none) |
| `admin_vesselfinder`     | 2548 | `vf_payload_meta` |
| `admin_call_flow`        | 2562 | (none) |
| `content`                | 2583 | `site_info`, `blog_articles` |
| `admin_orders`           | 2606 | (read-only into `orders`) |
| `admin_search`           | 2614 | (read-only into `search_logs`) |
| `admin_cache`            | 2622 | (in-memory aggregator) |
| `admin_chrome_extension` | 2630 | (own asset bundle) |
| `admin_metrics`          | 2652 | (read-only into `invoices`+`orders`) |
| `admin_services`         | 2683 | `services` |
| `admin_workflow_templates` | 2691 | `workflow_templates` |

Plus Wave 1 mount blocks for `legal_workflow`, `notifications`,
`payments_tracking`, `cabinet_financials`, `financial_breakdown`,
`calculations`, `payments` (at various lines earlier in the file).

### 4.2 Reverse edge: server.py → app/routers/payments (lazy helper import)

Single legacy reverse edge from a non-extracted server.py endpoint into
an extracted router:

```python
# server.py:12381 (inside stripe_webhook handler)
from app.routers.payments import _get_stripe_config, create_checkout_session
```

This is the documented `stripe_webhook` legacy boundary that the
extraction playbook explicitly permitted (see
REFACTOR_DEPENDENCIES.md → "Reverse edges" section). Lines 13694–13782
are tombstone comments documenting other moved invoice endpoints —
**no actual reverse imports**, just documentation.

### 4.3 NO `setattr(server, ...)` from any router

Audited: ZERO occurrences in all `app/routers/*.py`. The only literal
match is a comment inside `admin_vesselfinder.py` documenting that the
admin_tracking deferral was triggered specifically to AVOID this
pattern.  Discipline holds.

### 4.4 NO routers write back into the server module

Audited: ZERO `server.X = ...` mutations from any router. Clean.

---

## 5. Runtime mutation audit (module-level globals)

### 5.1 The ONLY admin handler that uses Python `global` keyword

| Line | Endpoint | Globals mutated |
|---:|---|---|
| 20126 | `POST /api/admin/tracking/providers/configure` | `VESSELFINDER_API_KEY`, `VESSELFINDER_FLEET_KEY`, `SHIPSGO_API_KEY`, `SHIPSGO_FLEET_KEY`, `AFTERSHIP_API_KEY` |

Global definitions:
- `VESSELFINDER_API_KEY` / `VESSELFINDER_FLEET_KEY` at server.py:4595–4596
- `SHIPSGO_API_KEY` / `SHIPSGO_FLEET_KEY` / `AFTERSHIP_API_KEY` at server.py:19726–19728

**Read sites** for these 5 globals across server.py: **70 occurrences**.

Most read sites are scraper helper functions and background polling
loops that run on the same Python process as the FastAPI server. They
read these globals at runtime, not at startup.

→ This is THE archetype Phase 3 blocker. Extraction under Wave 2B
mechanical discipline is impossible without first solving runtime
ownership of these globals.

### 5.2 No other module-global mutations in admin endpoints

Detected `CAPITAL_LETTER = ...` assignments inside admin handler bodies:
- `tracking/providers/configure` — true module mutation (above) ⚠️
- `integrations` GET — assigns to local `PUBLIC_DEFAULTS`, `SECRET_FIELDS` (local-scope dicts, NOT module globals — false positive)
- `settings/auth` PATCH — assigns to local `ALLOWED` (local frozenset, NOT module global — false positive)

→ Only **one** truly hot Phase 3 blocker.

---

## 6. Realtime / worker coupling audit

| Surface | Result |
|---|---|
| `sio.emit` from admin handlers | **1 occurrence**: `POST /api/admin/identity/exceptions/{exc_id}/confirm` emits `'shipment:update'` |
| `asyncio.create_task` / `ensure_future` from admin handlers | **0 occurrences** |
| `BackgroundTasks` from admin handlers | **0 occurrences** |
| `event_bus` / `EventBus` from admin handlers | **0 occurrences** |

→ Admin surface has **minimal realtime/worker coupling**. The single
sio.emit site is in the `identity` cluster — already classified as
Cluster #1 / Phase 3.

---

## 7. Lazy bridge audit (existing routers)

| Router | Bridges to server.py |
|---|---|
| `admin_kpi`              | none (zero-bridge) |
| `admin_staff_sessions`   | none |
| `admin_proxy`            | none |
| `admin_sources`          | none |
| `admin_call_flow`        | none |
| `admin_chrome_extension` | none |
| `admin_security`         | lazy `_db()` |
| `admin_history_reports`  | lazy `_db()` (3 of 5 endpoints) |
| `admin_orders`           | lazy `_db()` (read-only) |
| `admin_search`           | lazy `_db()` (read-only) |
| `admin_metrics`          | lazy `_db()` (read-only, cross-domain) |
| `admin_services`         | lazy `_db()` (writer) |
| `admin_workflow_templates` | lazy `_db()` (writer) |
| `admin_cache`            | lazy `_aggregator()` (in-memory singleton) |
| `admin_vesselfinder`     | lazy `_db()` + lazy `_serialize_doc()` |
| `content`                | lazy `_db()` + lazy `_static_dir()` |
| `calculations`           | lazy `db` + `calculator_calculate` + `_calculate_korea` + `logger` (4 edges) |
| `payments`               | lazy `db` + `_create_order_from_invoice` + `logger` (3 edges) |

→ Two bridge classes in use, all benign:
  - **Mongo handle** (`_db()`, 12 routers): replaced uniformly by
    `app.state.db` during Phase 4 lifespan rewrite.
  - **In-memory singleton** (`_aggregator()`, 1 router): replaced by
    `app.state.aggregator` during Phase 4.

The two utility helpers (`_serialize_doc`, `_static_dir`) are heavier —
they're shared across 50+ sites. Phase 5 utils-module extraction.

---

## 8. Helper-dependency footprint per cluster (for extraction cost)

| Cluster | Helpers from server.py required for extraction |
|---|---|
| `engagement`        | (none — pure aggregations) |
| `ext-clients`       | `audit()` (×4) |
| `identity`          | `audit()` (×4), `_make_identity_resolver()` (×3), `sio.emit` (×1) |
| `integrations`      | (none — pure CRUD on `integration_configs`) |
| `intent`            | (none) |
| `lead-requests`     | (none) — but mutates `leads` ⚠️ |
| `overview`          | (none) |
| `predictive-leads`  | (none) |
| `providers`         | (none) |
| `resolver`          | `serialize_doc()` |
| `ringostat`         | `serialize_doc()` |
| `settings`          | `get_settings_service()` (settings_service.py — already its own module) |
| `shipments`         | `serialize_doc()` |
| `tracking`          | module globals (5) — **Phase 3 blocker** |

`audit()` is defined at server.py:2299. It is an `async def audit(...)`
that writes to `db.audit_log`. Currently 8 admin endpoints depend on it
(ext-clients ×4 + identity ×4). For Wave 2B extraction it would need
either:
  - migration to a `backend/app/utils/audit.py` module (cleanest), OR
  - lazy `from server import audit` bridge (same pattern as `_db()`).

Same calculus for `serialize_doc` (used in 4 clusters), already a known
Phase 5 utils extraction target.

---

## 9. Decision tree — what to do with the 64 remaining endpoints

The clusters split into **three tiers** based on the audit data.

### TIER A — Safe to extract in Wave 2B (still controlled-monolith mechanical discipline)

These have NO runtime-global mutation, NO worker coupling, NO Cluster
#1 mutation, and either no helper bridges or only the documented
`_db()` / `serialize_doc()` / `audit()` bridges.

| Cluster | #EP | Pattern | Bridges needed | Recommended batch |
|---|---:|---|---|---|
| `intent` (all 4) | 4 | Pure read-only aggregator (Phase 3 preview rule applies) | `_db()` | Batch 11 — read-only candidate |
| `engagement` (all 8) | 8 | Pure read-only aggregator (Phase 3 preview rule applies) | `_db()` | Batch 11 or split (8 endpoints — could go solo) |
| `overview` (1) | 1 | Pure read-only counter (`count_documents` on 4 Cluster #1 collections) | `_db()` | Batch 11 — bundled |
| `predictive-leads` (1) | 1 | Pure read-only filter on `leads.find` | `_db()` | Batch 11 — bundled |
| `providers/stats` (2) | 2 | Pure read-only aggregations on `staff`+`users` | `_db()` | Batch 11 — bundled |
| `shipments/search` + `shipments/exceptions` (2 of 4) | 2 | Pure read-only `shipments.find` | `_db()` + lazy `_serialize_doc()` | Batch 12 — clean read-only shipments split (auth-mixed yellow: both Style A) |
| `resolver/queue` + `resolver/exceptions` + `resolver/identity/{id}` (3 of 4) | 3 | Pure read-only on `shipments` | `_db()` + lazy `_serialize_doc()` | Batch 12 — bundled with shipments reads |
| `ringostat` GETs (6 of 11): `health`, `settings GET`, `mappings GET`, `calls`, `calls/{id}`, `events` | 6 | Pure read-only on `ringostat_*`/`deals`/`leads` | `_db()` + lazy `_serialize_doc()` | Batch 13 — large read-only cluster |
| `integrations` GETs (5 of 9): `GET /integrations`, `GET /health`, `GET /{id}`, `GET /ringostat/config`, `GET /ringostat/configure` (read variant) | 5 | Pure read on `integration_configs` | `_db()` | Batch 14 — read-only integrations |
| `settings/auth` (2) | 2 | Uses `get_settings_service()` singleton (no Mongo direct access in handler) | `settings_service` import | Batch 15 — clean (already abstracted via service) |

**Tier A total: ~34 endpoints** safely extractable under current Wave 2B discipline.

### TIER B — Wave 2B extractable with own-collection ownership transfer (auth-mixed yellow / Batch-10 analogue)

These mutate their own collection but the collection is NOT Cluster #1
or the mutation graph is bounded.  Same discipline as Batch 10:
per-endpoint auth preserved verbatim, residual edges documented.

| Cluster | #EP | Owns | Extraction caveats |
|---|---:|---|---|
| `ext-clients` (all 5) | 5 | `ext_clients` collection | needs `audit()` helper (4×) — either migrate audit to utils or lazy bridge from server.py |
| `integrations` writes (4 of 9): `PUT /{id}`, `PATCH /{provider}`, `POST /ringostat/configure`, `POST /{provider}/test`, `POST /{provider}/toggle` | 5 | `integration_configs` | clean — no helpers beyond `_db()` |
| `ringostat` writes (5 of 11): `settings PATCH`, `test-connection POST`, `test-webhook POST`, `mappings POST`, `mappings DELETE` | 5 | `ringostat_config`, `ringostat_calls` | clean |
| `shipments/{id}/resolver/run` + `shipments/{id}/resolver/status` (2 of 4) | 2 | reads `shipments`, may write `resolver_exceptions` | needs Tier-A `resolver` extraction to land first |
| `resolver/run-queue` (1 of 4) | 1 | reads `shipments`, may write `resolver_exceptions` | bundles with shipments/{id}/resolver* |

**Tier B total: ~18 endpoints** extractable with ownership-transfer
discipline (similar to Batch 10).

### TIER C — Phase 3 BLOCKERS (strictly NOT extracted in Wave 2B)

These require runtime-state ownership re-architecture FIRST.

| Cluster | #EP | Blocker reason |
|---|---:|---|
| `tracking/providers/configure` + `tracking/providers/test` + `tracking/status` | 3 | **Runtime module-global mutation** of 5 API keys (`VESSELFINDER_*`, `SHIPSGO_*`, `AFTERSHIP_*`) read at 70 sites. Hard Phase 3 blocker. |
| `identity` (all 8) | 8 | Heavy Cluster #1 coupling: writes `resolver_exceptions`, reads `deals`+`shipments`+`ext_heartbeat`, uses `_make_identity_resolver()` (shared with workers), one endpoint emits `sio.emit('shipment:update')`. This is operational-core runtime control. |
| `lead-requests/{id}/action` (1 of 2) | 1 | Mutates Cluster #1 `leads` collection via `leads.insert_one()`. CRM domain ownership must be assigned before this can be safely owned by an admin router. The sibling `GET /api/admin/lead-requests` is Tier A (read-only on `lead_requests`+`staff`) and can be split out. |

**Tier C total: 12 endpoints** stay in server.py until Phase 3.

---

## 10. Wave 2B-residual map (post-tier-extraction projection)

If Tier A + Tier B are extracted across ~5 future batches (Batches
11–15), the remaining server.py admin surface drops to:

```
Tier A extracted   : ~34 endpoints
Tier B extracted   : ~18 endpoints
Tier C (Phase 3)   :  12 endpoints

server.py admin surface after Wave 2B closeout:  12 endpoints (was 64)
server.py admin surface extracted               :  ~93% (was 55%)
server.py @fastapi_app.* decorators projection  :  ~465 (was 517)
server.py LOC projection                        :  ~21,500 (was 23,251)
```

The 12 Tier-C endpoints are the **operational-core control plane** —
they will only leave server.py once Phase 3 runtime-ownership is done.

---

## 11. Phase 3 prep — runtime/state ownership problems to solve FIRST

The audit surfaces five concrete problems, in priority order:

### Problem 1 (HOTTEST) — Tracking API-key globals

**Symptom:** 5 module-level `os.environ`-bootstrapped strings, mutated
by 1 endpoint, read at 70 sites across server.py.

**Resolution path:**
1. Create `app/services/tracking_config.py` with a `TrackingConfigService`
   class that owns the 5 keys.
2. Migrate startup hydration (server.py loads from `db.tracking_config`
   on `startup()`) into the service's `init(db)` lifecycle.
3. Replace each of the 70 module-global READ sites with
   `tracking_config.get(provider)` calls. This MUST be done in batches
   to keep each commit reviewable.
4. ONLY THEN extract `admin_tracking` router as a clean control plane
   over the service. At that point the extraction becomes a normal
   Wave-2-style mechanical move.

**Risk:** scraper polling loops and background workers read these
globals; they must be migrated to the same ownership.

### Problem 2 — Identity / Resolver runtime ownership

**Symptom:** `_make_identity_resolver()` factory creates a new resolver
instance per call sharing the global `db` handle. Used by 3 admin
handlers + worker polling loops + `shipment_identity_resolver.py`
module. One endpoint emits `sio.emit('shipment:update')`.

**Resolution path:**
1. Decide: is the resolver a singleton (one per app) or per-request?
   Audit suggests singleton is sufficient (no per-user state).
2. Move to `app/services/identity_resolver.py` owned by `app.state`.
3. Define `app/events/shipment_events.py` for `shipment:update` event
   contract.
4. Replace direct `sio.emit('shipment:update', payload)` calls (the
   single admin-handler site + however many other sites in server.py)
   with `event_bus.emit(ShipmentUpdated(...))`. Defer realtime fan-out
   to an event handler in `app/realtime/`.
5. ONLY THEN extract `admin_identity` router as a thin control plane.

### Problem 3 — Cluster #1 collection ownership matrix (formal assignment)

The 9 hottest Cluster #1 collections (`shipments` 85, `vin_data` 46,
`customers` 38, `leads` 37, `staff` 34, `deals` 30, `ringostat_calls`
26, `ringostat_config` 20, `integration_configs` 10) have NO canonical
owner today. Phase 3 must:

| Collection | Proposed owner module | Read DTO consumers |
|---|---|---|
| `leads` | `app/services/crm_leads.py` | `lead-requests`, `predictive-leads`, scraper ingestion, manager dashboard |
| `deals` | `app/services/deals.py` | `identity` resolver, cabinet, payments, legal_workflow |
| `shipments` | `app/services/shipments.py` | `identity`, `resolver`, `tracking`, manager dashboard |
| `customers` | `app/services/customers.py` | cabinet, admin overview, engagement |
| `staff` | `app/services/staff.py` | auth, manager, lead-requests, providers |
| `vin_data` | `app/services/ingestion_vin.py` | public search, ingestion workers, admin overview |
| `ringostat_calls` + `ringostat_config` | `app/services/ringostat.py` (integration domain) | admin ringostat router |
| `integration_configs` | `app/services/integrations.py` | admin integrations router, settings |
| `tracking_config` + tracking API-keys | `app/services/tracking_config.py` (see Problem 1) | scraper helpers, vessel finder, identity |

After this assignment, **only the owner writes**; readers consume
projections/DTOs. This is the rule that allows Tier C endpoints to be
extracted safely.

### Problem 4 — `audit()` helper extraction (Phase 5 cleanup, NOT a Phase 3 blocker)

**Symptom:** Currently 8 admin handlers (`ext-clients`×4 + `identity`×4)
call `await audit(...)` from server.py:2299. To extract them under
Wave 2B, the helper either:
  - moves to `backend/app/utils/audit.py` (cleanest), OR
  - is added as a lazy bridge `from server import audit` in each
    router (Wave-1 pattern).

**Recommendation:** lazy bridge for Wave 2B Tier B extraction (no
disruption); migrate to `app/utils/audit.py` in Phase 5 utils cleanup.

### Problem 5 — sio singleton lifecycle (Phase 4 lifespan rewrite)

**Symptom:** `sio` (Socket.IO server) is a module-level singleton in
server.py, used by 14 broadcast sites + 1 admin handler. Currently
benign but blocks `app.state.sio` migration.

**Recommendation:** Phase 4 lifespan rewrite migrates ALL 14 sites at
once. Not a Phase 3 blocker; it's a Phase 4 cleanup. Wave 2B Tier B
extractions that need broadcasts can use the lazy `from server import
sio` bridge in the meantime.

---

## 12. Final answers to the three audit questions

### A) What can still be safely extracted in Wave 2B (no Phase-3-style risk)?

→ **~52 endpoints across 5 future batches (Tier A + Tier B):**

  - **Batch 11 (proposed):** `intent` + `engagement` + `overview` +
    `predictive-leads` + `providers/stats` — **16 read-only
    aggregators**. Bridges: `_db()` only. Discipline: Phase 3 preview
    rule (already proven by Batch 9). Single SOLO extraction is too
    aggressive — split into 2 sub-batches if the diff is too noisy.
  - **Batch 12 (proposed):** `shipments` reads (2) + `resolver` reads
    (3) — **5 read-only endpoints on `shipments` collection**. Same
    discipline.
  - **Batch 13 (proposed):** `ringostat` reads (6) — **larger
    read-only cluster**, still mechanically safe.
  - **Batch 14 (proposed):** `ringostat` writes (5) + `integrations`
    writes (5) — Tier B auth-mixed-yellow analogue of Batch 10.
    Mutation owners of their own integration collections. Needs
    documented partial-ownership pattern (residual edges to startup
    seeders or service singletons).
  - **Batch 15 (proposed):** `ext-clients` (5) + `settings/auth` (2)
    + `lead-requests GET` (1, the read-only one) — **last clean
    cluster**. Needs `audit()` lazy bridge.

After Batch 15, server.py admin surface drops from 64 endpoints to
12 (Tier C only). Wave 2B closeout possible.

### B) What is strictly Phase 3 (NEVER extracted in Wave 2B)?

→ **12 endpoints** stay in server.py until Phase 3:
  - `tracking/providers/configure` (1) — module-global mutation
  - `tracking/providers/test` (1) — reads same globals
  - `tracking/status` (1) — reads same globals
  - `identity/*` (8) — operational-core runtime control plane
  - `lead-requests/{id}/action` (1) — direct CRM `leads` mutation

These 12 endpoints together represent the operational-core "Cluster
#1 control plane" that the ROADMAP.md Phase 3 plan addresses head-on.

### C) Runtime / state ownership problems to solve first (Phase 3 prep priority)

1. **Tracking API-key globals** (5 vars × 70 read sites) — highest
   urgency, blocks 3 endpoints and infinite scraper coupling.
2. **Identity resolver lifecycle + shipment-event contract** — blocks
   8 endpoints and unlocks future `app.state.identity_resolver`.
3. **Cluster #1 ownership matrix** — formal canonical-owner
   assignment for 9 hottest collections. Unblocks all future operational
   core work.
4. **`audit()` helper relocation** — Phase 5 cleanup; lazy bridge in
   the meantime is acceptable.
5. **`sio` singleton lifecycle** — Phase 4 lifespan rewrite; not a
   Wave 2B blocker.

---

## 13. Disciplinary recap — what THIS topology freeze does NOT do

- **NO code mutated.** This is a read-only archaeological report.
- **NO new batch attempted.** Batch 11+ planning recorded; execution
  pending architectural review.
- **NO Phase 3 work started.** Phase 3 prep priorities documented;
  actual execution requires explicit phase transition.
- **NO Cluster #1 ownership transferred.** The 9 hottest collections
  remain in server.py as today.
- **NO new lazy bridges introduced.** Existing 18 bridges audited;
  no additions.

The artifact's job is to make the next 5 batches predictable and to
make Phase 3 entry decisions data-driven, not vibes-driven.

---

## 14. Snapshot for next session

Recommended next action by descending priority:

1. **Architectural review of this report** — confirm tier assignments
   match the strangler-fig migration philosophy.
2. **Decide Batch 11 scope** — read-only aggregators bundle (16
   endpoints in one batch is feasible; or split 8/8 by cluster).
3. **NOT yet:** Phase 3 prep work (problems 1–3). That requires a
   dedicated phase transition, not a continuation of Wave 2B.

End of report.
