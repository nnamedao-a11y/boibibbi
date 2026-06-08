"""
data/canonical.py — Brand + model canonicalisation (Phase A1).

This module is the SINGLE SOURCE OF TRUTH for converting the raw, dirty
strings coming out of auction scrapers into stable canonical values used
for filtering, faceting and de-duplication on the public catalogue.

Why
---
The auction sources spit out:

    "Audi" / "AUDI" / "audi"                              ← same brand
    "VW" / "Volkswagen" / "VOLKSWAGEN"                    ← same brand
    "Land" / "Land Rover" / "Range Rover" / "LANDROVER"   ← same brand
    "Malibu Fwd Lt" / "Malibu LT" / "Malibu Premier"      ← same MODEL (Malibu)

If we filter the catalogue by the RAW strings, every trim variant explodes
into a separate "model" in the dropdown, and "Land Rover" loses to "Land".

Design
------
Two stable canonical fields, written alongside the originals (additive,
never destructive):

    make_canonical       — exact value from VEHICLE_CATALOG keys
    model_canonical      — exact value from VEHICLE_CATALOG[make] list,
                            or the longest catalogue prefix match against
                            the raw model string (handles "Malibu Fwd Lt"
                            → "Malibu"). Falls back to the raw token #1
                            when no catalogue entry matches.

Idempotent: calling canonicalise() twice produces the same result. Safe
to re-run on every ingestion + migration.

NOTE: The legacy `make` / `model` / `title` fields are NEVER mutated.
They are preserved for display (`model_full` mirrors them) and for the
historical search index. Only the new `_canonical` fields participate
in filtering.
"""

from __future__ import annotations

import re
from typing import Optional, Tuple

from data.vehicle_catalog import VEHICLE_CATALOG, BRAND_ALIASES_REVERSE


# ─────────────────────────────────────────────────────────────────────
# Build forward alias map from BRAND_ALIASES_REVERSE
#     {"Land": "Land Rover", "VW": "Volkswagen", "MB": "Mercedes-Benz", ...}
# Case-insensitive keys (lowercased).
# ─────────────────────────────────────────────────────────────────────
_ALIAS_TO_CANONICAL: dict[str, str] = {}
for canonical, aliases in BRAND_ALIASES_REVERSE.items():
    for a in aliases:
        _ALIAS_TO_CANONICAL[a.strip().lower()] = canonical

# Extra one-off aliases we know about that aren't in BRAND_ALIASES_REVERSE
_EXTRA_ALIASES = {
    "mercedes benz": "Mercedes-Benz",
    "mercedesbenz": "Mercedes-Benz",
    "mercedes": "Mercedes-Benz",
    "landrover": "Land Rover",
    "range rover": "Land Rover",
    "rolls royce": "Rolls-Royce",
    "rollsroyce": "Rolls-Royce",
    "alfa romeo": "Alfa Romeo",
    "aston martin": "Aston Martin",
    "general motors": "GMC",
    "gm": "GMC",
}
for k, v in _EXTRA_ALIASES.items():
    _ALIAS_TO_CANONICAL.setdefault(k, v)

# Lower-case lookup of every canonical brand name
_CANONICAL_LC = {b.lower(): b for b in VEHICLE_CATALOG.keys()}

# Brand keys that contain whitespace (must be matched as multi-token prefix
# in raw titles like "2020 Land Rover Range Rover Sport").
_MULTI_WORD_BRANDS = sorted(
    [b for b in VEHICLE_CATALOG.keys() if " " in b],
    key=lambda x: -len(x),  # longest first so "Aston Martin" beats "Aston"
)

# Pre-build a lowercase models map for prefix matching: { brand_canonical : [ (lowercase_model, original_model_name), ... ] }
# Sorted by descending length so longer prefixes win ("Range Rover Sport"
# beats "Range Rover" beats "Range").
_MODELS_BY_BRAND: dict[str, list[tuple[str, str]]] = {}
for brand, models in VEHICLE_CATALOG.items():
    _MODELS_BY_BRAND[brand] = sorted(
        [(m.lower(), m) for m in models],
        key=lambda pair: -len(pair[0]),
    )


def canonical_make(raw_make: Optional[str]) -> Optional[str]:
    """Resolve an auction-stamped brand string to its canonical form.

    Returns None when the input is empty / unrecognisable.
    """
    if not raw_make:
        return None
    s = str(raw_make).strip()
    if not s:
        return None
    lc = s.lower()

    # 1. Exact alias hit ("VW" → "Volkswagen", "Land" → "Land Rover")
    if lc in _ALIAS_TO_CANONICAL:
        return _ALIAS_TO_CANONICAL[lc]

    # 2. Already a canonical brand (case-insensitive)
    if lc in _CANONICAL_LC:
        return _CANONICAL_LC[lc]

    # 3. Multi-word brand contained in the raw string
    for mw in _MULTI_WORD_BRANDS:
        if lc.startswith(mw.lower() + " ") or lc == mw.lower():
            return mw

    # 4. Unrecognised — return Title-Case version of the raw token so the
    #    UI shows something stable (won't conflict with canonical names
    #    because we never wrote them to VEHICLE_CATALOG).
    return s.title()


def canonical_model(raw_model: Optional[str],
                    make_canonical_value: Optional[str]) -> Optional[str]:
    """Resolve a raw model string to the catalogue model name when possible.

    Strategy:
      - If we know the brand: try longest-prefix match against catalogue
        models. "Malibu Fwd Lt" → "Malibu", "Range Rover Sport Hse" →
        "Range Rover Sport".
      - If no catalogue hit (or no brand): take the first whitespace-
        separated token, Title-Case it ("malibu fwd lt" → "Malibu") so
        we still group trims of the same family together.
      - Additionally try a "contains" pass against the catalogue (handles
        polluted raw models like "Rover Range Rover Sport" where the
        canonical name lives mid-string after a leftover prefix).
    """
    if not raw_model:
        return None
    s = str(raw_model).strip()
    if not s:
        return None
    lc = s.lower()

    if make_canonical_value and make_canonical_value in _MODELS_BY_BRAND:
        # 1. Exact / prefix match (fast path, longest first)
        for model_lc, model_orig in _MODELS_BY_BRAND[make_canonical_value]:
            if lc == model_lc or lc.startswith(model_lc + " "):
                return model_orig
        # 2. Substring match (handles broken parser leftovers like
        #    "Rover Range Rover Sport" → "Range Rover Sport"). Longest
        #    catalogue model wins so we never pick "Range" over
        #    "Range Rover Sport".
        for model_lc, model_orig in _MODELS_BY_BRAND[make_canonical_value]:
            if (" " + model_lc + " ") in (" " + lc + " "):
                return model_orig

    # 3. Fallback — first token, Title-Cased. Strips obvious trim noise
    #    by stopping at the first whitespace.
    first = re.split(r"[\s/\-]", s, maxsplit=1)[0]
    if not first:
        return None
    return first[:1].upper() + first[1:].lower() if len(first) > 1 else first.upper()


def parse_title_to_canonical(title: Optional[str]) -> Tuple[Optional[int], Optional[str], Optional[str], Optional[str]]:
    """Extract `(year, make_raw, make_canonical, model_canonical)` from a
    raw auction title like:

        "2020 Land Rover Range Rover Sport Hse"
        "2022 Chevrolet Malibu Fwd Lt"
        "2015 BMW 3 Series 328i"

    Returns Nones when parsing fails. Never raises.
    """
    if not title:
        return None, None, None, None
    t = str(title).strip()
    if not t:
        return None, None, None, None

    parts = t.split()
    year = None
    if parts and parts[0].isdigit() and len(parts[0]) == 4:
        try:
            y = int(parts[0])
            if 1900 <= y <= 2099:
                year = y
            parts = parts[1:]
        except Exception:
            pass

    if not parts:
        return year, None, None, None

    # Multi-word brand detection (longest-prefix wins)
    remainder = " ".join(parts)
    rem_lc = remainder.lower()
    make_raw: Optional[str] = None
    make_can: Optional[str] = None
    model_part: str = ""

    for mw in _MULTI_WORD_BRANDS:
        mw_lc = mw.lower()
        if rem_lc == mw_lc:
            make_raw = mw
            make_can = mw
            model_part = ""
            break
        if rem_lc.startswith(mw_lc + " "):
            make_raw = mw
            make_can = mw
            model_part = remainder[len(mw):].strip()
            break

    if make_can is None:
        # Single-token brand → first word
        make_raw = parts[0]
        make_can = canonical_make(make_raw)
        model_part = " ".join(parts[1:])

    model_can = canonical_model(model_part, make_can) if model_part else None

    return year, make_raw, make_can, model_can


def build_search_title(year: Optional[int],
                       make_canonical_value: Optional[str],
                       model_canonical_value: Optional[str],
                       raw_model: Optional[str] = None) -> str:
    """Compose a normalised lowercase search-title used for free-text
    queries / search index ingestion. Indexed verbatim (no regex)."""
    bits: list[str] = []
    if year:
        bits.append(str(year))
    if make_canonical_value:
        bits.append(make_canonical_value)
    if model_canonical_value:
        bits.append(model_canonical_value)
    if raw_model and raw_model.lower() != (model_canonical_value or "").lower():
        bits.append(str(raw_model))
    return " ".join(bits).lower().strip()


__all__ = [
    "canonical_make",
    "canonical_model",
    "parse_title_to_canonical",
    "build_search_title",
]
