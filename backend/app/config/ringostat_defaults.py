"""
Ringostat default credentials (hardcoded baseline).

Phase IV-5 — Production hand-off.

These values are the *fallback* configuration: if the
``ringostat_config`` document in Mongo is missing fields (or the whole
document is absent), backend code uses what's here so the integration
keeps working even after a database wipe.

Admins can override every field at runtime through the admin UI
(`PATCH /api/admin/ringostat/settings`) — overrides are persisted in
``ringostat_config`` and take precedence over these defaults.

Reset to defaults: ``POST /api/admin/ringostat/settings/reset``.

DO NOT commit real production keys here long-term.  When you have a
secrets manager (Vault, AWS Secrets Manager, etc.), wire that in here
and keep this file as the read-through cache layer.
"""

from __future__ import annotations

import os
from typing import Any, Dict

# Hardcoded baseline credentials (handed off Jun-2026 by client).
# Overridable via env vars for staging/CI without code edits.
DEFAULT_API_KEY = os.environ.get(
    "RINGOSTAT_API_KEY",
    "CKHVjXFxovG3h6PxnKSJnbkr6SxmsrQm",
)
DEFAULT_PROJECT_ID = os.environ.get(
    "RINGOSTAT_PROJECT_ID",
    "145693",
)

# Webhook auth token — present so the Ringostat side can include
# ``?token=<value>`` in the webhook URL and we'll verify it.  Generated
# once at install time; admins can rotate it from the UI.
DEFAULT_WEBHOOK_SECRET = os.environ.get(
    "RINGOSTAT_WEBHOOK_SECRET",
    "pDaUlnxxMh0euseuLDJywlEUeAss2-RK2o_oCH7u4N0",
)

DEFAULT_AUTOMATION_RULES: Dict[str, Any] = {
    "auto_create_lead": True,
    "missed_call_task": True,
    "missed_call_task_minutes": 5,
    "require_outcome": True,
    "require_outcome_duration": 10,
}


def get_defaults() -> Dict[str, Any]:
    """Return a fresh copy of the default config dict."""
    return {
        "api_key": DEFAULT_API_KEY,
        "project_id": DEFAULT_PROJECT_ID,
        "webhook_secret": DEFAULT_WEBHOOK_SECRET,
        "enabled": True,
        "extension_mapping": {},
        "automation_rules": dict(DEFAULT_AUTOMATION_RULES),
    }


def merge_with_defaults(stored: Dict[str, Any] | None) -> Dict[str, Any]:
    """Return ``stored`` config with any missing field filled from defaults.

    ``stored`` wins on every key it actually holds (even an empty string
    will be respected — admin may *intentionally* blank a key).  Only
    missing-or-None keys fall through to defaults.
    """
    out = get_defaults()
    if not stored:
        return out
    for k, v in stored.items():
        if v is None:
            # ``None`` means "fall through"
            continue
        out[k] = v
    return out
