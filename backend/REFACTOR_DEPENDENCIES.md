# Router → legacy-server dependency map

> Tracked since 2026-05-17 (start of Controlled Modular Monolith refactoring).
> Update on every commit that touches `backend/app/routers/` or
> `backend/{legal_workflow,notifications,payments_tracking,cabinet_financials,financial_breakdown}.py`.
>
> Goal: make Phase 2 (`app.state` / DI migration) trivially scriptable.
> If a router has zero entries → it's a Phase 1 graduation candidate.
>
> **Post-Batch-10 (Wave 2B closeout planning):** see
> `backend/WAVE2B_TOPOLOGY_FREEZE.md` for the full dependency
> archaeology report — 64 remaining admin endpoints in server.py,
> 3-tier decision tree (A/B/C), and Phase 3 runtime-state ownership
> problems in priority order.

---

## Wave 1 routers (extracted from server.py during Wave 1)

| Router | server.py global / helper consumed | Use site | Notes |
|---|---|---|---|
| `app/routers/calculations.py` | `server.db` | every endpoint (Mongo CRUD) | via `import server`; lazy attr lookup |
| | `server.logger` | `public_approve_calculation_by_share` error path | single use |
| | `server.calculator_calculate` | `create_calculation_snapshot` | live engine (USA) |
| | `server._calculate_korea`      | `create_calculation_snapshot` | live engine (Korea) |
| `app/routers/payments.py` | `server.db` | every endpoint | via `import server` |
| | `server.logger` | refund / sync / record_payment / cabinet helpers | err paths |
| | `server._create_order_from_invoice` | `_record_payment_from_stripe` | order side-effect after paid invoice |
| `legal_workflow.py`<br/>(legacy location, not yet relocated) | `server.db` via `_db()` lazy resolver | every endpoint | unchanged pattern |
| | `server._round_money` | `approve_deposit` (v1 absorbed block) | invoice money rounding |
| | `server._create_order_from_invoice` | `approve_deposit` (v1 absorbed block) | auto-convert |
| `cabinet_financials.py`<br/>(legacy location, absorb-not-relocate) | `server.db` via `_db()` lazy resolver | every endpoint | unchanged pattern |
| | `server._require_customer` | customer-scoped GETs (financial endpoints) | session resolver |
| | `server._ensure_customer_seed` | seed helper | idempotent customer bootstrap |
| | `server._get_stripe_config` | `pay-intent` endpoint | Stripe creds |
| | `server.serialize_doc` | absorbed v1 block (`/cabinet/orders`, `/cabinet/deposits`) | Mongo `_id` → str |
| `notifications.py` (Commit 6) | `security.require_admin/require_master_admin/require_user` | router dependencies | direct security module import |
| | `from server import db` (lazy `_db()`) | every endpoint | unchanged Wave 1 bridge pattern |
| | `notifications.service` (own module global) | `test_dispatch` | service initialised by `notifications.init()` from server.startup() |

---

## Wave 2B routers (Batch 1 — admin singletons, Commit 7)

| Router | server.py global / helper consumed | Use site | Notes |
|---|---|---|---|
| `app/routers/admin_kpi.py` | **none** | — | service-only stub; **zero bridges** ← graduation candidate |
| | `security.require_admin` | router-level dependency | direct security module import |
| `app/routers/admin_staff_sessions.py` | **none** | — | service-only stub; **zero bridges** ← graduation candidate |
| | `security.require_admin` | router-level dependency | direct security module import |

## Wave 2B routers (Batch 2 — admin db-bridge singletons, Commit 8)

| Router | server.py global / helper consumed | Use site | Notes |
|---|---|---|---|
| `app/routers/admin_security.py` | `from server import db` (lazy `_db()`) | all 4 endpoints | Wave 1 bridge pattern. Owns `admin_security` Mongo collection. |
| | `security.require_admin` | router-level dependency | direct security module import |
| | (own deps: `pyotp`, `qrcode`, `BytesIO`, `base64`) | TOTP secret gen + QR PNG encoding | **own dependencies — migrated WITH the router** per ownership-transfer rule |
| `app/routers/admin_history_reports.py` | `from server import db` (lazy `_db()`) | 3 of 5 endpoints (pending/approve/deny) | analytics + abuse-check stubs are db-free |
| | `security.require_admin` | router-level dependency | direct security module import |

## Wave 2B routers (Batch 3 — admin zero-bridge stabiliser, Commit 9)

| Router | server.py global / helper consumed | Use site | Notes |
|---|---|---|---|
| `app/routers/admin_proxy.py` | **none** | — | service-only stub; **zero bridges** ← graduation candidate |
| | `security.require_admin` | router-level dependency | direct security module import |
| `app/routers/admin_sources.py` | **none** | — | service-only stub; **zero bridges** ← graduation candidate |
| | `security.require_admin` | router-level dependency | direct security module import |

## Wave 2B routers (Batch 4A — SOLO, Commit 10)

| Router | server.py global / helper consumed | Use site | Notes |
|---|---|---|---|
| `app/routers/admin_vesselfinder.py` | `from server import db` (lazy `_db()`) | `vf_debug_payloads`, `vf_debug_endpoint_probe` | Wave 1 lazy bridge. Owns `vf_payload_meta` Mongo collection. |
| | `from server import serialize_doc` (lazy `_serialize_doc()`) | `vf_debug_payloads` | **shared utility** used in 57 sites — bridge stays until Phase 5 utils-module extraction |
| | `security.require_admin` | router-level dependency | direct security module import |
| | `security.PAYLOAD_DEBUG_STORE` | `vf_debug_payloads` response field | **not a bridge** — config flag exported by `security` module |
| | (own assets: `chrome_extension_vf/`) | `vf_extension_download` | resolved via `Path(__file__).resolve().parents[2]` |

## Wave 2B routers (Batch 5 — SOLO, Commit 11)

| Router | server.py global / helper consumed | Use site | Notes |
|---|---|---|---|
| `app/routers/admin_call_flow.py` | **none** | — | service-only stub; **zero bridges** ← graduation candidate |
| | `security.require_admin` | router-level dependency | direct security module import |

4 endpoints extracted from two distant locations in server.py (lines
6797-6808 cluster of 3 + line 15031 standalone `/session/{id}`).
Originally a 3+1 split because of historical accretion patterns; in the
extracted router they form a single cohesive surface as
`/api/admin/call-flow/{board,due,stats,session/{id}}`.

Why SOLO (not batched with content cluster):
  * batch-size discipline at this point favours **risk localisation** over
    convention.  Each new batch carries its own coupling-discovery cost;
    bundling unrelated domains amplifies that.
  * follows the Batch 4A SOLO precedent established when `admin_tracking`
    was deferred — the discipline now is **coupling first, batching
    second**.

## Wave 2B routers (Batch 8 — Bottom singletons, Commit 14)

Four unrelated trivial single-endpoint domains extracted in one batch
for **cheap entropy reduction** before the MED-tier Batch 9 and the
auth-mixed Batch 10.  Each is its own bounded micro-domain; no shared
ownership across the batch.

| Router | server.py global / helper consumed | Use site | Notes |
|---|---|---|---|
| `app/routers/admin_orders.py` | `from server import db` (lazy `_db()`) | `admin_list_orders` | **READ-ONLY into Cluster #1 `orders`** — see "Phase 3 preview rule" below |
| | `security.require_admin` | router-level dependency | direct security module import |
| `app/routers/admin_search.py` | `from server import db` (lazy `_db()`) | `admin_search_analytics` | READ-ONLY aggregation over `search_logs`; collection is WRITTEN by other server.py sites — ownership stays in server.py until Phase 3 |
| | `logging.getLogger("bibi.admin_search")` | — | own logger, no bridge |
| | `security.require_admin` | router-level dependency | direct security module import |
| `app/routers/admin_cache.py` | `from server import aggregator` (lazy `_aggregator()`) | `clear_cache` | **NOT a Mongo bridge** — in-memory `AggregatorService` singleton. Phase 4 will replace with `app.state.aggregator`. |
| | `security.require_admin` | router-level dependency | direct security module import |
| `app/routers/admin_chrome_extension.py` | **none** | — | owns its asset bundle (`chrome_extension/` dir + `bibi-cars-extension.zip`). Path resolution via `Path(__file__).resolve().parents[2]` (same pattern as `admin_vesselfinder.vf_extension_download`). **Zero-bridge graduation candidate.** |
| | `security.require_admin` | router-level dependency | direct security module import |

### Path-resolution change (`admin_chrome_extension` only)

The ONLY non-byte-for-byte change in Batch 8: the original
`server.py:17804` endpoint resolved its assets via
`os.path.dirname(__file__)`, which is `/app/backend/` when run from
server.py.  After extraction, `__file__` becomes
`/app/backend/app/routers/admin_chrome_extension.py`, so the same
expression would resolve to `/app/backend/app/routers/` — wrong path.

Fix: `Path(__file__).resolve().parents[2]` walks up three levels
(`app/routers/` → `app/` → `backend/`), giving the backend root
unchanged regardless of caller location.  This is identical to the
pattern already used in `admin_vesselfinder.vf_extension_download`
(Batch 4A).  All downstream filesystem operations are unchanged.

### Latent bug preserved (`admin_cache.clear_cache`)

The original `server.py:15050` endpoint calls
`aggregator.records.clear()`, but `AggregatorService.__init__`
(server.py:1063) stores its data in `aggregator.store`, not `.records`.
This call would raise `AttributeError` at runtime — a pre-existing
latent bug.

Wave 2B discipline forbids semantic mutation, so the call is preserved
byte-for-byte.  The bug is now visible & isolated inside
`admin_cache.py` (instead of buried in a 23K-line server.py), and will
be fixed in a later session under "bug fix" discipline, not "mechanical
extraction".

This is a small but meaningful demonstration that the extraction
discipline does what it's supposed to: surface latent issues without
mixing them with structural change.

## Phase 3 preview rule — "read aggregation allowed, ownership mutation NOT" (ARCHITECTURAL DECISION)

> **Status:** OFFICIAL — applies to all future Wave 2B extractions that
> need to consume Cluster #1 collections.  Established here (alongside
> Batch 8) so that Batch 9 (`admin_metrics`) and any later cross-domain
> reader has a stable rule to follow.

### Rule

A router under `app/routers/` is **permitted** to read from a Mongo
collection it does NOT own iff ALL of the following hold:

1. **Read-only access path** — the router NEVER calls
   `db.<collection>.{insert*,update*,delete*,replace*,bulk_write,find_one_and_*}`.
   Only `find`, `find_one`, `count_documents`, `distinct`, `aggregate`,
   `estimated_document_count` are permitted.
2. **No index manipulation** — the router does NOT
   `create_index`/`drop_index` the foreign collection.
3. **No bridge to a writer** — the router does NOT call any helper
   from server.py whose internal implementation mutates the foreign
   collection.  Lazy `_db()` access is permitted, lazy
   `_get_or_create_order(...)` is NOT.
4. **No transactional coupling** — the router does NOT participate in
   a multi-doc transaction whose other side lives in server.py.

### Why this matters

Without this rule, "read-only" extractions slowly accumulate hidden
writes (e.g. lazy upserts inside aggregation pipelines, `find_one_and_update`
masquerading as a read, idempotent "ensure" helpers), and ownership
becomes ambiguous.  By the time Phase 3 starts the operational-core
decoupling, the ownership map is no longer truthful.

The rule is the structural complement of the `admin_tracking`
postponement rule: tracking is deferred because it MUTATES Cluster #1
state; admin_orders / admin_search / admin_metrics are allowed because
they only AGGREGATE Cluster #1 state.

### Currently-conforming routers

| Router | Foreign collection(s) read | Verified read-only? |
|---|---|---|
| `admin_orders` (Batch 8) | `orders` | ✅ `find`+`count_documents` only |
| `admin_search` (Batch 8) | `search_logs` | ✅ `count_documents`+`aggregate` only |
| `admin_metrics` (Batch 9) | `orders` + `invoices` | ✅ `count_documents` ×2 + `find` + `aggregate` only — **FIRST cross-domain reader** (proves the rule on multi-collection cross-domain aggregation) |

### Forbidden during Wave 2B

- ❌ NO `find_one_and_update` / `find_one_and_replace` from any router
  into a foreign collection.
- ❌ NO upserts disguised as reads.
- ❌ NO calls to server.py helpers that mutate state we're "just reading."
- ❌ NO writing audit/log/telemetry side-effects into a foreign
  collection from a "read-only" endpoint.

If a candidate endpoint needs to mutate a foreign collection, it gets
the same treatment as `admin_tracking`: **deferred to Phase 3**.

## Wave 2B routers (Batch 7 — Content cluster, Commit 13)

| Router | server.py global / helper consumed | Use site | Notes |
|---|---|---|---|
| `app/routers/content.py` (`site_info_router` + `blog_router`) | `from server import db` (lazy `_db()`) | all 14 endpoints | Wave 1 lazy bridge. Owns `site_info` + `blog_articles` Mongo collections. |
| | `from server import _STATIC_DIR` (lazy `_static_dir()`) | 4 image-upload endpoints (review / before-after / hero / blog-cover) | **shared utility** used in 9 sites across the codebase — bridge stays until Phase 5 utils-module extraction |
| | `security.require_user` | per-endpoint dependency (auth boundary mixed within router) | direct security module import |
| | (own seed: `DEFAULT_SITE_INFO` ≈322 LOC) | `_get_site_info_doc` first-hit insert | migrated WITH the router (cohesive ownership) |
| | (own helpers: `_blog_strip_html`, `_blog_read_minutes`, `_blog_slugify`, `_blog_unique_slug`, `_blog_serialize`) | every blog endpoint | migrated WITH the router (cohesive ownership) |

### Scope-widening note (architectural significance)

This is the **FIRST Wave 2B batch that extracts beyond the admin surface.**
The `blog_articles` and `site_info` collections have BOTH public AND admin
consumers in the original server.py.  Extracting only the admin endpoints
(the original Wave 2A Cluster #2 scope of 10 endpoints) would have left
4 public endpoints + `_get_site_info_doc()` + the seed data still in
server.py, creating **split collection ownership** across two locations
— exactly the runtime-coupling anti-pattern Wave 2B is designed to
prevent.

Scope was therefore widened from "admin Cluster #2" (10) to "full Content
domain" (14) for clean ownership transfer.  This is the Wave 2B
discipline's "ownership-first" rule applied automatically: when a shared
collection straddles auth boundaries, the whole domain moves together.

### Known residual edge (low-risk, documented for Phase 5)

| External writer | Collection | Trigger | Why acceptable |
|---|---|---|---|
| `blog_seeder.py` (`seed_blog_if_empty`) | `blog_articles` | server.py startup() handler | **idempotent SEED**, not runtime mutation; reads-then-conditional-inserts on first boot only. Same domain as content.py (blog) — Phase 5 will colocate `blog_seeder.py` into `content/` package alongside `content.py`. |

This residual edge is the BENIGN cousin of the `admin_tracking`
runtime-coupling problem: both involve external writers to a router-owned
collection, but `blog_seeder` is **bounded** (startup-only, idempotent,
no mutation graph) while tracking globals are **unbounded** (mutated at
runtime by configure endpoint + read by ≥10 sites including scraper
workers).

The discipline distinguishing these two cases is the **mutation graph
boundary**:
- Acceptable for Wave 2B: external writer is startup-only AND idempotent
  AND no shared runtime state.
- Forbidden for Wave 2B: external writer mutates module globals OR is
  invoked at runtime by other domains OR shares state with workers.

## Phase 3 blocker — `admin_tracking` (deliberately deferred — ARCHITECTURAL DECISION)

> **Status:** OFFICIAL — `admin_tracking` extraction is **blocked by
> runtime mutable global ownership** and is permanently postponed
> to **Phase 3 (operational-core disentangling)**.  Not "we'll see later".

`admin_tracking` is NOT a routing problem.  It is a **runtime control
plane** over scraper infrastructure, currently glued to server.py via
**runtime-mutable module-level globals**.  Extracting it under Wave 2B
mechanical discipline would create a *physically modular, runtime-coupled*
distributed monolith — strictly worse than the current god-file.

### Coupling violations (full inventory)

| Endpoint | Coupling violation |
|----------|-------------------|
| `POST /api/admin/tracking/providers/configure` | mutates 5 module-level globals in server.py: `VESSELFINDER_API_KEY`, `VESSELFINDER_FLEET_KEY`, `SHIPSGO_API_KEY`, `SHIPSGO_FLEET_KEY`, `AFTERSHIP_API_KEY` |
| `POST /api/admin/tracking/providers/test` | reads same globals + uses scraper helper functions defined in server.py |
| `GET  /api/admin/tracking/status` | legacy alias delegating to `admin_identity_tracking_status()` (Cluster #1 / identity domain) |

These globals are:
1. **Loaded at startup** from DB (server.py line 19897-19913).
2. **Read by ≥10 sites inside server.py** (scraper helpers, status endpoints,
   probe loops).
3. **Mutated at runtime** by the configure endpoint.
4. **Re-used by background workers / polling loops** that run on the same
   process.  Splitting the writer from the readers across modules
   introduces import-cycle + lifecycle-coupling that mechanical extraction
   cannot resolve.

This is **runtime ownership coupling**, not a routing problem. Extraction
under Wave 2B discipline would require `setattr(server, "VESSELFINDER_API_KEY", value)`
mutation patterns — **forbidden** (would create a distributed global-state
monolith, strictly worse than current state).

### Forbidden during Wave 2B (until Phase 3 lands)

- ❌ NO `setattr(server, "<GLOBAL>", value)` patterns from any router.
- ❌ NO moving scraper polling loops out of server.py.
- ❌ NO moving startup hydration (`startup()` → DB-load of API keys) out of server.py.
- ❌ NO moving scraper helper functions that read these globals.
- ❌ NO bridge that *writes* into server.py module state.

### Resolution path (Phase 3, sequenced)

1. Move scraper-provider config into a `TrackingProvidersService` singleton
   (or `app.state.tracking_config` — TBD when Phase 4 lifespan rewrite is
   on the table).
2. Move startup hydration (`startup()` API-key loader) into a dedicated
   bootstrap module owned by the same service.
3. Convert scraper helpers (`server.py` ≥10 sites) to read from the new
   ownership via service method, not module global.
4. Convert background workers / polling loops to the same ownership.
5. **Only then** extract `admin_tracking` router as a clean control-plane
   over that ownership.  At that point it becomes a normal Wave 2-style
   mechanical extraction.

### Architectural lesson preserved here

This deferral is an **architectural victory**, not a delay.  It demonstrates
that the topology-mapping process (Wave 2A scorecard + per-router
coupling audit) actively prevents `physical modularity + runtime coupling`
— the most dangerous monolith shape.  Strangler-fig migration exists
precisely to detect this class of edge before extraction, not after.

Until Phase 3: `admin_tracking` stays in server.py. No bridges, no
mutation patterns, no temporary hacks.

---

## Reverse edges (server.py → router)

> One-directional bridges from legacy code that REMAINS in server.py
> into the extracted router modules. These are acceptable transitional
> shapes; they will be cleaned up when the legacy callers themselves
> get extracted in later waves.

| Legacy in server.py | Imports lazily from | Functions |
|---|---|---|
| `stripe_webhook` (integration boundary) | `app.routers.payments` | `_get_stripe_config`, `_confirm_cabinet_payment`, `_record_payment_from_stripe` |
| `invoice_checkout` (invoices domain, Wave 2 candidate) | `app.routers.payments` | `_get_stripe_config`, `create_checkout_session` |

---

## Phase 2 migration order (derived from this map)

Routers with the **fewest** server.py edges graduate first:

### Zero-bridge / Phase-2 graduated by construction (no migration needed)
1. **`admin_kpi`** (Wave 2B, Batch 1) — 0 edges. Reference implementation.
2. **`admin_staff_sessions`** (Wave 2B, Batch 1) — 0 edges.
3. **`admin_proxy`** (Wave 2B, Batch 3) — 0 edges.
4. **`admin_sources`** (Wave 2B, Batch 3) — 0 edges.
5. **`admin_call_flow`** (Wave 2B, Batch 5) — 0 edges.

### Lazy-bridge / Phase 2-light (migrate `_db()` → `app.state.db` when Phase 4 lands)
6. **`admin_security`** (Batch 2) — 1 edge (lazy `_db()`). Owns its 2FA dep stack (`pyotp`, `qrcode`, `BytesIO`, `base64`) cohesively.
7. **`admin_history_reports`** (Batch 2) — 1 edge (lazy `_db()`, 3 of 5 endpoints).
8. **`admin_vesselfinder`** (Batch 4A) — 2 edges (lazy `_db()` + lazy `_serialize_doc()`). Latter is shared utility used in 57 sites, full graduation deferred to Phase 5 utils extraction.
9. **`content`** (Batch 7) — 2 edges (lazy `_db()` + lazy `_static_dir()`). Owns 2 collections (`site_info` + `blog_articles`) cohesively. First batch to extract BEYOND admin surface; one known residual edge (`blog_seeder.py` startup writer, see Batch 7 section).
10. **`admin_orders`** (Batch 8) — 1 edge (lazy `_db()`). **READ-ONLY into Cluster #1 `orders` collection** — pre-emptively applies the "read aggregation allowed, ownership mutation NOT" rule. Ownership stays in server.py until Phase 3.
11. **`admin_search`** (Batch 8) — 1 edge (lazy `_db()`). READ-ONLY analytics over `search_logs`. Collection is WRITTEN by other server.py endpoints (`log_vin_search`) — ownership stays in server.py until Phase 3.
12. **`admin_cache`** (Batch 8) — 1 edge (lazy `_aggregator()` for in-memory singleton). No Mongo collection. Phase 4 will replace with `app.state.aggregator`.
13. **`admin_metrics`** (Batch 9) — 1 edge (lazy `_db()`). **READ-ONLY into TWO Cluster #1 collections** (`invoices` + `orders`). FIRST cross-domain reader to extract cleanly under the "read aggregation allowed, ownership mutation NOT" rule — proves the rule works beyond single-collection cases. Ownership stays in server.py until Phase 3.
14. **`admin_services`** (Batch 10) — 1 edge (lazy `_db()`). **Mutation owner of `services` collection** (POST/PATCH/DELETE write). Auth-mixed yellow: GET=`require_admin`, writes=`require_master_admin` — per-endpoint deps preserved verbatim. Residual edges in server.py: startup seed (`_ensure_services_seed`, idempotent — Batch 7 analogue), public reader (`list_services_public` / `GET /api/services`), manager-invoice-builder cross-domain reader. All documented for Phase 3 ownership matrix.
15. **`admin_workflow_templates`** (Batch 10) — 1 edge (lazy `_db()`). Mutation owner of `workflow_templates` collection. Same auth-mixed-yellow fingerprint. Inline first-hit seed in GET (3 default templates) migrated WITH router. Residual edge: `public_workflow_templates` (`GET /api/workflow-templates`) public/manager reader stays in server.py.

### Zero-bridge / Phase-2 graduated by construction (Batch 8)
16. **`admin_chrome_extension`** (Batch 8) — 0 edges. Owns its asset bundle (`backend/chrome_extension/` + `bibi-cars-extension.zip`). Path resolution via `Path(__file__).resolve().parents[2]` pattern (same as `admin_vesselfinder.vf_extension_download`).

### Heavier bridge surface (need domain split first)
17. **`calculations`** — 4 edges. Migrate `server.calculator_calculate` + `server._calculate_korea` into `app/services/calculator.py` first, then `server.db` becomes `app.state.db`.
18. **`payments`** — 3 edges. Migrate `server._create_order_from_invoice` only after orders domain is extracted (Wave 2). `server.db` → `app.state.db`.
19. **`legal_workflow`** — 3 edges. Migrate `server._round_money` + `server._create_order_from_invoice` after orders domain is extracted.
20. **`notifications`** — 3 edges (lazy `db` + service singleton). Bridge accepted; full graduation deferred to Phase 4 (lifespan rewrite).
21. **`cabinet_financials`** — 5 edges. Heaviest bridge surface; needs `customer` domain split first.

Until then: `import server` + lazy `from server import ...` is the **approved temporary bridge**. Documented in every router's `!!! TEMP BRIDGE !!!` banner.

---

## Distributed god-file checklist

For each new router extraction:

- [ ] Cohesive helpers transferred TOGETHER with endpoints (ownership transfer).
- [ ] Zero re-import from `server.py` of helpers that should belong to the router's own domain.
- [ ] If a legacy server.py function needs the router's helper, the edge is **server.py → router** (lazy import), NOT the reverse.
- [ ] No `# noqa: F401` re-exports back into `server.py`.
- [ ] Banner `!!! TEMP BRIDGE !!!` present in the router header.
- [ ] Row added to this dependency map.
