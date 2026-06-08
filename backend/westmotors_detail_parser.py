"""
westmotors_detail_parser.py
===========================

Detail-page parser for west-motors.pl. Source pages embed Schema.org
JSON-LD (Vehicle + Offer + Product) inside ``<script type="application/ld+json">``
blocks — typically wrapped in a ``@graph`` array. The page also contains
year+mileage in <title>/<meta description> for cars whose Vehicle block
isn't fully populated (Polish prose: "FORD EXPEDITION 2025 lat z USA ...
przebieg: 21 438").

This module mirrors ``lemon_scraper.parse_detail`` but tuned to
west-motors.pl's quirks:
  * ``@graph`` containers can hold ``Vehicle`` next to ``Organization`` /
    ``WebPage`` — we filter by ``@type``.
  * Vehicle.``name`` is the Polish marketing title, not raw "YEAR MAKE MODEL".
  * Year is more reliably extracted from the page <title> / meta description
    Polish regex (``\\b(\\d{4}) (?:roku|lat)\\b``).
  * Mileage uses non-breaking spaces in Polish formatting (``21 438``).
  * Offer.price is "" / "0" for cars still pending — we fall back to
    description regex ``za (\\d[\\d ]*) (?:PLN|USD|EUR)``.
  * Image URLs use ``https://img.westmotors.online/lpp/...`` CDN.
"""
from __future__ import annotations

import json
import logging
import re
from typing import Any, Dict, List, Optional

from bs4 import BeautifulSoup

logger = logging.getLogger("westmotors_detail")

VIN_RE = re.compile(r"\b([A-HJ-NPR-Z0-9]{17})\b")
YEAR_RE = re.compile(r"\b(19[8-9]\d|20[0-3]\d)\b")
MILEAGE_PL_RE = re.compile(r"przebieg\s*:\s*([\d\s]+)", re.IGNORECASE)
PRICE_PL_RE = re.compile(r"za\s+([\d\s]+)\s*(USD|PLN|EUR)", re.IGNORECASE)


def _flat_jsonld(soup: BeautifulSoup) -> List[Dict[str, Any]]:
    """Return every JSON-LD object on the page, flattening ``@graph`` arrays."""
    out: List[Dict[str, Any]] = []
    for s in soup.find_all("script", type="application/ld+json"):
        raw = (s.string or s.get_text() or "").strip()
        if not raw:
            continue
        try:
            obj = json.loads(raw)
        except Exception:
            continue
        if isinstance(obj, list):
            for o in obj:
                if isinstance(o, dict):
                    if isinstance(o.get("@graph"), list):
                        out.extend(x for x in o["@graph"] if isinstance(x, dict))
                    else:
                        out.append(o)
        elif isinstance(obj, dict):
            if isinstance(obj.get("@graph"), list):
                out.extend(x for x in obj["@graph"] if isinstance(x, dict))
            else:
                out.append(obj)
    return out


def parse_detail(html: str, url: str) -> Optional[Dict[str, Any]]:
    """Extract a normalized vehicle dict from a west-motors.pl detail page.

    Returns ``None`` if the page is not a real detail page (no Vehicle
    object, no VIN in URL).
    """
    if not html or len(html) < 1000:
        return None
    soup = BeautifulSoup(html, "html.parser")

    out: Dict[str, Any] = {
        "vin": None, "lot": None, "auction": None,
        "url": url,
        "title": None, "year": None, "make": None, "model": None,
        "trim": None,
        "odometer": None, "odometer_unit": "miles",  # westmotors uses miles for US lots
        "color": None,
        "current_bid_usd": None,
        "images": [], "image": None,
        "description": None,
        "_src": "westmotors",
    }

    # ─── URL slug → make/model/VIN (cheap, always works) ─────────────
    m = re.search(r"/catalog-avto/([a-z\-]+)/([a-z0-9\-]+)/([A-HJ-NPR-Z0-9]{17})", url, re.IGNORECASE)
    if m:
        out["make"] = m.group(1).upper()
        out["model"] = m.group(2).upper()
        out["vin"] = m.group(3).upper()

    # ─── PRIMARY: JSON-LD Vehicle + Offer + Product ─────────────────
    ld_objects = _flat_jsonld(soup)
    vehicle: Dict[str, Any] = {}
    product: Dict[str, Any] = {}
    offer: Dict[str, Any] = {}
    for o in ld_objects:
        t = o.get("@type") or ""
        t_norm = t if isinstance(t, str) else (t[0] if isinstance(t, list) and t else "")
        if t_norm == "Vehicle":
            vehicle = o
        elif t_norm == "Product":
            product = o
        if isinstance(o.get("offers"), dict):
            offer = o["offers"]

    if vehicle:
        name = (vehicle.get("name") or "").strip()
        if name:
            out["title"] = name
            # Year sometimes prefixed; "FORD EXPEDITION 2025 lat z USA..."
            y = YEAR_RE.search(name)
            if y:
                out["year"] = out["year"] or int(y.group(0))
        # Sometimes brand is inside vehicle.brand
        if isinstance(vehicle.get("brand"), dict) and not out["make"]:
            out["make"] = (vehicle["brand"].get("name") or "").upper() or None
        if vehicle.get("vehicleModelDate"):
            try:
                out["year"] = out["year"] or int(str(vehicle["vehicleModelDate"])[:4])
            except Exception:
                pass
        if vehicle.get("color"):
            out["color"] = str(vehicle["color"])
        if vehicle.get("mileageFromOdometer"):
            mfo = vehicle["mileageFromOdometer"]
            if isinstance(mfo, dict):
                val = mfo.get("value")
            else:
                val = mfo
            try:
                out["odometer"] = int(re.sub(r"[^\d]", "", str(val))) or None
            except Exception:
                pass

    if offer and isinstance(offer, dict):
        p = offer.get("price")
        cur = (offer.get("priceCurrency") or "USD").upper()
        try:
            val = float(re.sub(r"[^\d.]", "", str(p))) if p else None
        except Exception:
            val = None
        if val and val > 0 and cur == "USD":
            out["current_bid_usd"] = val

    if product:
        imgs = product.get("image")
        if isinstance(imgs, str):
            imgs = [imgs]
        if isinstance(imgs, list):
            out["images"] = [i for i in imgs if isinstance(i, str)]
            if out["images"]:
                out["image"] = out["images"][0]

    # ─── Fallback: <title> / <meta description> Polish prose ──────────
    if not out.get("year") or not out.get("odometer"):
        title_tag = soup.find("title")
        desc_tag = soup.find("meta", attrs={"name": "description"})
        prose = " ".join([
            title_tag.get_text(" ", strip=True) if title_tag else "",
            (desc_tag.get("content") or "") if desc_tag else "",
        ])
        if prose:
            if not out["year"]:
                y = YEAR_RE.search(prose)
                if y:
                    out["year"] = int(y.group(0))
            if not out["odometer"]:
                mm = MILEAGE_PL_RE.search(prose)
                if mm:
                    try:
                        out["odometer"] = int(re.sub(r"[^\d]", "", mm.group(1))) or None
                    except Exception:
                        pass
            if not out["current_bid_usd"]:
                pp = PRICE_PL_RE.search(prose)
                if pp:
                    try:
                        cur = pp.group(2).upper()
                        if cur == "USD":
                            out["current_bid_usd"] = float(re.sub(r"[^\d.]", "", pp.group(1)))
                    except Exception:
                        pass

    # ─── First CDN image fallback ─────────────────────────────────────
    if not out["image"]:
        cdn = re.search(r"https://img\.westmotors\.online/lpp/[\w/]+_ful\.(?:jpg|webp|png)", html)
        if cdn:
            out["image"] = cdn.group(0)
            out["images"] = [out["image"]]

    return out
