"""
app/services/tracking_providers.py — Phase 5.5/H (cluster-owned)
================================================================

Canonical home of the on-demand external **container/VIN → vessel
tracking** lookup chain. Owns the provider-fallback orchestration
(ShipsGo V1 authCode → AfterShip), but **not** the provider keys
themselves — those continue to live on the ``TrackingConfigService``
snapshot accessed via ``app.services.tracking_config.get_service``.

History
───────

  * Phase 5.5 / G (2026-05-20) — registered as ``_external_container_lookup``
    in ``EXTRACTION_AUX_BRIDGES`` (kind=RESOLVER_DEP, tier=C-aux) while
    the identity-resolver cluster moved to
    ``app/services/identity_runtime.py``. At that point the function
    still lived in ``server.py:18798`` and was lazy-bridged at call time
    via ``identity_runtime._external_container_lookup_callable()``.
  * Phase 5.5 / H (2026-05-20) — body MOVED VERBATIM from
    ``server.py:18798`` to this module as the public
    ``external_container_lookup`` (no underscore prefix; renamed per
    D2 to the canonical no-prefix form). The ``_resolver_shipsgo_lookup``
    shim in ``identity_runtime.py`` now imports directly from here.
    The legacy ``server._external_container_lookup`` symbol has been
    retired together with the aux-bridge accessor.

Mandate satisfaction (Phase 5.5/H, D1-D8)
─────────────────────────────────────────

    D1  cluster = ``_vf_extract_vessels`` + ``_external_container_lookup``
        retired in a single focused commit (this module + the
        ``vesselfinder_scraper`` re-home of ``extract_vessels_from_payload``).
    D2  canonical home = ``app/services/tracking_providers.py``
        (NEW module) — renamed ``_external_container_lookup`` →
        ``external_container_lookup``.
    D3  no worker-lifecycle refactor — ``tracking_worker`` untouched.
    D4  no provider-algorithm edits — ShipsGo V1 GET-first / POST-second
        / AfterShip fallback chain is byte-for-byte the legacy body.
        Retry semantics + header shapes + timeout values preserved 1:1.
    D5  no schema evolution — return-dict keys
        ``{source, container, imo, vesselName, status, origin, destination,
        eta, mapPoint, raw}`` + AfterShip shape
        ``{source, container, status, eta, raw}`` preserved 1:1.
    D6  no async orchestration changes — function signature
        ``async def(container_or_vin: str) -> Optional[Dict[str, Any]]``
        + ``httpx.AsyncClient`` context-manager shape preserved.
    D7  golden suite FIRST — see
        ``tests/test_phase5_5_h_vesselfinder_cluster.py`` (12 assertions;
        V1-V6 behavioural + S1-S5 structural + O1 OpenAPI freeze).
    D8  no new provider integrations — only the existing
        ShipsGo + AfterShip path; ShipsGoEU / FleetMon / etc. are NOT
        added.

Public surface
──────────────

    * ``external_container_lookup(container_or_vin: str) -> Optional[Dict[str, Any]]``

That's it. The legacy underscored name ``_external_container_lookup``
exists nowhere in the codebase post-5.5/H.

Why NOT a wrapper around ``TrackingConfigService``?
───────────────────────────────────────────────────

Two reasons:

  1. ``TrackingConfigService`` owns the keys / config snapshot — it is
     NOT a tracking-providers orchestrator. Conflating the two surfaces
     would make config-cache invalidation, schema audit, and provider
     fan-out share a single service module (anti-modular).
  2. 5.5/H discipline forbids ``while we're here`` refactors (D8). The
     simplest move is a new module that pulls in the snapshot via the
     existing canonical accessor — no service-boundary changes.

Future extensions (out of 5.5/H scope)
──────────────────────────────────────

This module is the natural home for any new tracking-provider
adapter: AfterShip v5, ShipsGoEU, FleetMon, MarineTraffic Pro, etc.
None are added in 5.5/H — see D8.
"""

from __future__ import annotations

import logging
from typing import Any, Dict, Optional

import httpx

logger = logging.getLogger("bibi.tracking_providers")


def _snapshot():
    """Lazy accessor for the live ``TrackingConfigSnapshot``.

    Phase 5.5/H — resolves the snapshot via the canonical
    ``app.services.tracking_config.get_service()`` accessor (introduced
    in Phase 5.5/F). The two-step indirection (get_service →
    .snapshot()) preserves the cold-start semantic: pre-bind,
    ``get_service()`` returns ``None`` and we fall back to an "empty"
    snapshot via the ``server._tracking_snapshot`` legacy helper.

    The legacy helper still exists in ``server.py:18659`` because it
    encodes the cold-start fallback shape ``TrackingConfigSnapshot()``
    (default-constructed = all keys ``None``). Moving that fallback
    constructor into 5.5/H would tangle the snapshot lifecycle with
    the providers module — out of scope per D3.
    """
    from app.services.tracking_config import get_service  # noqa: E402
    svc = get_service()
    if svc is not None:
        return svc.snapshot()
    # Cold-start: fall through to the legacy helper which constructs
    # a default-empty snapshot. Lazy import keeps server.py off our
    # module-load path.
    try:
        from server import _tracking_snapshot  # noqa: E402, WPS433
        return _tracking_snapshot()
    except Exception:
        # Last-resort: import the snapshot dataclass and return default.
        from app.services.tracking_config import TrackingConfigSnapshot  # noqa: E402
        return TrackingConfigSnapshot()


# ═══════════════════════════════════════════════════════════════════
# external_container_lookup — VERBATIM port from server.py:18798
# (Phase 5.5/H, 2026-05-20). D4: no algorithm edits. D5: no schema
# evolution. D6: no async orchestration changes.
# ═══════════════════════════════════════════════════════════════════


async def external_container_lookup(
    container_or_vin: str,
) -> Optional[Dict[str, Any]]:
    """
    On-demand container tracking via ShipsGo V1 authCode API.
    Returns {imo, vessel_name, status, origin, destination, eta, last_event} or None.

    ShipsGo V1 flow:
      1. POST PostContainerInfo with containerNumber + shippingLine + authCode
      2. GET GetContainerInfo with requestId (returned by step 1) + mapPoint=true
    """
    cn = (container_or_vin or '').strip().upper()
    if not cn:
        return None

    base = "https://shipsgo.com/api/v1.2"
    _tc = _snapshot()

    # ── ShipsGo V1 (authCode) — principal container tracking
    if _tc.shipsgo_api_key:
        try:
            async with httpx.AsyncClient(timeout=20.0) as client:
                # 1) direct GET by number (works when container already tracked before)
                url_get = f"{base}/ContainerService/GetContainerInfo/"
                res = await client.get(url_get, params={
                    'authCode': _tc.shipsgo_api_key,
                    'requestId': cn,
                    'mapPoint': 'true',
                })
                text = res.text or ''
                if res.status_code == 200 and 'Invalid' not in text:
                    try:
                        data = res.json()
                        if isinstance(data, list):
                            data = data[0] if data else {}
                        vessel_imo = data.get('VesselIMO') or data.get('LastVesselIMO') or data.get('LoadingVesselIMO')
                        vessel_name = data.get('VesselName') or data.get('LastVesselName') or data.get('LoadingVesselName')
                        return {
                            'source': 'shipsgo_v1',
                            'container': cn,
                            'imo': str(vessel_imo) if vessel_imo else None,
                            'vesselName': vessel_name,
                            'status': data.get('Status') or data.get('ContainerStatus'),
                            'origin': data.get('Pol') or data.get('LoadingPort') or data.get('FromPort'),
                            'destination': data.get('Pod') or data.get('DischargePort') or data.get('ToPort'),
                            'eta': data.get('FormatedETA') or data.get('ETA') or data.get('EstimatedTimeOfArrival'),
                            'mapPoint': data.get('MapPoint') or data.get('Coordinates'),
                            'raw': data,
                        }
                    except Exception as parse_err:
                        logger.warning(f"[SHIPSGO/V1] parse error: {parse_err} body={text[:200]}")

                # 2) if not found — POST to initiate new tracking
                url_post = f"{base}/ContainerService/PostContainerInfo/"
                post_res = await client.post(url_post, data={
                    'authCode': _tc.shipsgo_api_key,
                    'containerNumber': cn,
                    'shippingLine': 'OTHERS',
                })
                post_text = post_res.text or ''
                if 'Invalid' in post_text:
                    logger.warning(f"[SHIPSGO/V1] Invalid key — check account/api activation")
                    return {
                        'source': 'shipsgo_v1',
                        'container': cn,
                        'error': 'Invalid authCode — ShipsGo вважає ключ недійсним. Перевірте активацію API в панелі ShipsGo.',
                        'raw': post_text[:300],
                    }
                return {
                    'source': 'shipsgo_v1',
                    'container': cn,
                    'status': 'submitted_for_tracking',
                    'note': 'Контейнер доданий у ShipsGo для трекінгу — повторіть запит за ~1-5 хв',
                    'raw': post_text[:300],
                }
        except Exception as e:
            logger.error(f"[SHIPSGO/V1] error: {e}")

    # ── AfterShip fallback
    if _tc.aftership_api_key:
        try:
            url = f"https://api.aftership.com/v4/trackings/container/{cn}"
            headers = {'aftership-api-key': _tc.aftership_api_key}
            async with httpx.AsyncClient(timeout=15.0) as client:
                res = await client.get(url, headers=headers)
                if res.status_code == 200:
                    data = (res.json() or {}).get('data', {}).get('tracking', {})
                    return {
                        'source': 'aftership',
                        'container': cn,
                        'status': data.get('tag'),
                        'eta': data.get('expected_delivery'),
                        'raw': data,
                    }
                else:
                    logger.warning(f"[AFTERSHIP] {res.status_code} for {cn}")
        except Exception as e:
            logger.error(f"[AFTERSHIP] error: {e}")

    return None


__all__ = [
    "external_container_lookup",
]
