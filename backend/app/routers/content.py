"""
content — Content domain HTTP surface (site-info + blog)
=========================================================

Wave 2B / Batch 7 / Commit 13 (Content cluster).

Architectural scope:
   This is the FIRST Wave 2B batch that extracts BEYOND the admin surface.
   The blog_articles and site_info collections have both PUBLIC and ADMIN
   consumers; extracting only the admin endpoints would split collection
   ownership across two files (server.py + admin_content.py), which
   contradicts the Wave 2B invariant "no router owns more than one Mongo
   collection AND no collection is owned by more than one location".

   Cluster #2 in WAVE2_ADMIN_MAPPING.md was therefore widened from the
   admin-only scope (10 endpoints, blog 6 + site-info 4) to the FULL
   Content domain (14 endpoints + helpers + default seed):

   Two co-mounted APIRouter instances are exposed:
     * site_info_router  → /api/site-info/*    (public, 2)
                           /api/admin/site-info/* (admin, 4)
     * blog_router       → /api/admin/blog/*  (admin, 6)
                           /api/public/blog/* (public, 2)

   Auth boundaries are preserved per-endpoint (mixed public/admin within
   the same APIRouter), matching the original server.py shape byte-for-byte.

Owned data:
   * Mongo collection `site_info`     — singleton document with site-wide config
   * Mongo collection `blog_articles` — bilingual CMS articles
   * Module-level constant SITE_INFO_DOC_ID
   * Module-level seed DEFAULT_SITE_INFO (≈322 LOC of admin-editable content)
   * Module-level constant BLOG_CATEGORIES
   * 7 helpers transferred WITH the router (ownership-transfer rule):
        _get_site_info_doc, _blog_strip_html, _blog_read_minutes,
        _blog_slugify, _blog_unique_slug, _blog_serialize

Bridges accepted (Wave 1 pattern):
   * `def _db()`            → lazy `from server import db`
   * `def _static_dir()`    → lazy `from server import _STATIC_DIR`
     (shared utility, used in 9 sites across the codebase, full graduation
      deferred to Phase 5 utils-module extraction)
   * `security.require_user` → direct import (auth dep at endpoint level
     because auth boundary is mixed inside this router)

Discipline preserved:
   * mechanical 1:1 extraction (no signature / contract / payload changes)
   * no auth normalisation (still per-endpoint role check)
   * no schema change (BLOG_CATEGORIES + DEFAULT_SITE_INFO byte-equivalent)
   * frontend untouched (URLs identical)
"""
from __future__ import annotations

import html as _blog_html
import logging
import re as _blog_re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Optional
from uuid import uuid4 as _blog_uuid4

from fastapi import (
    APIRouter,
    Body,
    Depends,
    File,
    HTTPException,
    Query,
    UploadFile,
)

from security import require_user  # auth boundary stays per-endpoint

# Phase 5.4 / C-4i — db_runtime accessor (module-level function reference).
# Only the `get_db` CALLABLE is imported at module-load time. Every
# `_db()` call resolves the live Motor handle via `get_db()`, preserving
# the call-time semantics of the legacy `from server import db` bridge.
from app.core.db_runtime import get_db  # noqa: E402 (C-4i: lazy-bridge → accessor)

logger = logging.getLogger("bibi.content")


# ─────────────────────────────────────────────────────────────────────────
#  Lazy bridges  (Wave-1 pattern: avoid import cycle with server.py)
# ─────────────────────────────────────────────────────────────────────────

def _db():
    """Return the live Mongo handle — resolves at call-time.

    Phase 5.4 / C-4i — migrated to ``app.core.db_runtime.get_db()``.
    Public-cache content router: serves site-info (public + admin) and
    blog (public + admin). Lazy semantics preserved 1:1.
    """
    return get_db()


def _static_dir() -> Path:
    """Return the shared `_STATIC_DIR` path defined in server.py.

    Used in 5 image-upload endpoints inside this router (reviews / hero /
    before_after / blog / generic). This is a *shared utility* (Phase 5
    utils-module extraction will graduate it); same bridge style as
    `serialize_doc` in admin_vesselfinder.
    """
    from server import _STATIC_DIR  # noqa: E402
    return _STATIC_DIR


# ═════════════════════════════════════════════════════════════════════════
#  SITE INFO domain
# ═════════════════════════════════════════════════════════════════════════

SITE_INFO_DOC_ID = "singleton"

DEFAULT_SITE_INFO: Dict[str, Any] = {
    "_id": SITE_INFO_DOC_ID,
    "policies": {
        "privacy": {
            "en": {
                "title": "Privacy Policy",
                "content": "<h2>Privacy Policy</h2><p>BIBI Cars values your privacy. This document explains how we collect, use and protect your personal data when you use our services.</p><p><em>Full policy text will be provided here.</em></p>",
            },
            "bg": {
                "title": "Политика за поверителност",
                "content": "<h2>Политика за поверителност</h2><p>BIBI Cars цени Вашата поверителност. Този документ обяснява как събираме, използваме и защитаваме Вашите лични данни.</p><p><em>Пълният текст на политиката ще бъде предоставен тук.</em></p>",
            },
        },
        "terms": {
            "en": {
                "title": "Terms of Use",
                "content": "<h2>Terms of Use</h2><p>By using BIBI Cars services, you agree to the following terms and conditions.</p><p><em>Full terms text will be provided here.</em></p>",
            },
            "bg": {
                "title": "Условия за ползване",
                "content": "<h2>Условия за ползване</h2><p>С използването на услугите на BIBI Cars Вие приемате следните общи условия.</p><p><em>Пълният текст на условията ще бъде предоставен тук.</em></p>",
            },
        },
        "cookies": {
            "en": {
                "title": "Cookie Policy",
                "content": "<h2>Cookie Policy</h2><p>We use cookies to provide you with the best experience on our website. Essential cookies are required for the platform to function correctly, while analytical cookies help us improve our services.</p>",
            },
            "bg": {
                "title": "Политика за бисквитки",
                "content": "<h2>Политика за бисквитки</h2><p>Използваме бисквитки, за да Ви осигурим най-доброто изживяване на нашия уебсайт. Основните бисквитки са необходими за правилното функциониране на платформата.</p>",
            },
        },
        "conditions": {
            "en": {
                "title": "Conditions",
                "content": "<h2>Service Conditions</h2><p>BIBI Cars provides turnkey vehicle import services from auctions worldwide. Please review the following service conditions carefully.</p>",
            },
            "bg": {
                "title": "Условия за услугата",
                "content": "<h2>Условия за услугата</h2><p>BIBI Cars предоставя комплексни услуги за внос на автомобили от търгове по целия свят.</p>",
            },
        },
    },
    "header": {
        "phones": ["+359 875 313 158", "+359 897 884 804"],
        "cta_label_en": "Contact Us",
        "cta_label_bg": "Свържете се с нас",
    },
    "hero": {
        "enabled": True,
        "eyebrow_en": "america | Korea",
        "eyebrow_bg": "америка | Корея",
        "title_line1_en": "From auction",
        "title_line1_bg": "От търг",
        "title_line2_en": "to keys",
        "title_line2_bg": "до ключове",
        "title_line3_en": "in your hands",
        "title_line3_bg": "във Вашите ръце",
        "kpi1_en": "/ Over 5,000 cars",
        "kpi1_bg": "/ Над 5,000 автомобила",
        "kpi2_en": "/ Real-time bids",
        "kpi2_bg": "/ Наддавания на живо",
        "kpi3_en": "/ 500+ happy clients",
        "kpi3_bg": "/ 500+ доволни клиенти",
        # Background photos for the hero. ``image_url`` is the desktop / web
        # version (16:9, recommended 1920x1080). ``image_url_mobile`` is the
        # mobile-landing portrait variant (recommended aspect ≈ 361:326, e.g.
        # 720x650 or 1080x976). When ``sync_mobile_with_web`` is true, the
        # mobile landing falls back to ``image_url`` and ignores
        # ``image_url_mobile`` — useful when the same shot works on both
        # form-factors.
        "image_url": "",
        "image_url_mobile": "",
        "sync_mobile_with_web": False,
    },
    "footer": {
        "contacts": {
            "phones": ["+359 875 313 158", "+359 897 884 804"],
            "email": "info@bibicars.bg",
            "addresses": [
                "Bulgaria, Sofia, Dragalevtsi, Vitosha Blvd. No. 230",
                "Bulgaria, Sofia, Bulgaria Blvd., No. 81",
            ],
            "addresses_bg": [
                "България, София, Драгалевци, бул. Витоша № 230",
                "България, София, бул. България № 81",
            ],
            "working_hours": "Mon - Fri, 10.00 - 19.00",
            "working_hours_bg": "Пн - Пт, 10.00 - 19.00",
            "registration_address": "Republic of Bulgaria, 1415, Sofia, Cherni Vrah Blvd., 230",
            "registration_address_bg": "Република България, 1415, София, бул. Черни връх 230",
        },
        "socials": {
            "instagram": {"enabled": True,  "url": "https://instagram.com/"},
            "facebook":  {"enabled": True,  "url": "https://facebook.com/"},
            "telegram":  {"enabled": True,  "url": "https://t.me/"},
            "tiktok":    {"enabled": False, "url": ""},
            "whatsapp":  {"enabled": False, "url": ""},
            "viber":     {"enabled": True,  "url": "viber://chat?number=%2B359875313158"},
        },
        "viber_community": {
            "enabled": True,
            "url": "viber://chat?number=%2B359875313158",
            "label_en": "Join Our Group And Get The Hottest Offers",
            "label_bg": "Присъединете се към нашата група и получавайте най-горещите оферти",
        },
    },
    "cookie_banner": {
        "enabled": True,
        "title_en": "We value your privacy",
        "title_bg": "Уважаваме вашата поверителност",
        "body_en": "We only use essential cookies to keep your session secure and your preferences saved. No tracking pixels, no ad networks — just the minimum needed for BIBI Cars to work properly.",
        "body_bg": "Използваме само основни бисквитки, за да поддържаме сесията и да защитаваме акаунта ви. Без следящи скриптове, без реклама — само това, което е необходимо за коректната работа на сайта.",
    },
    "faq": {
        "enabled": True,
        "title_en": "FAQ",
        "title_bg": "Често задавани въпроси",
        "items": [
            {
                "id": "faq-1",
                "enabled": True,
                "question_en": "How to choose and buy a car from America?",
                "question_bg": "Как да изберете и купите автомобил от Америка?",
                "answer_en": (
                    "<p>To choose and buy a car from the USA, follow these basic steps:</p>"
                    "<ol>"
                    "<li>Set your budget – include car price, auction fees, delivery, customs, and repairs.</li>"
                    "<li>Pick a platform – popular options are Copart and IAAI.</li>"
                    "<li>Check the car history – use Carfax or AutoCheck.</li>"
                    "<li>Choose a reliable broker – they handle bidding, documents, and shipping.</li>"
                    "<li>Arrange delivery and customs clearance – shipping usually takes 4–8 weeks.</li>"
                    "<li>Repair and register the car in your country.</li>"
                    "</ol>"
                ),
                "answer_bg": (
                    "<p>За да изберете и купите автомобил от САЩ, следвайте тези основни стъпки:</p>"
                    "<ol>"
                    "<li>Определете бюджета си – включете цена, такси на търга, доставка, мита и ремонт.</li>"
                    "<li>Изберете платформа – популярни са Copart и IAAI.</li>"
                    "<li>Проверете историята на автомобила – чрез Carfax или AutoCheck.</li>"
                    "<li>Изберете надежден брокер – той се грижи за наддаването, документите и транспорта.</li>"
                    "<li>Уредете доставка и митническо оформяне – обикновено отнема 4–8 седмици.</li>"
                    "<li>Ремонтирайте и регистрирайте автомобила в България.</li>"
                    "</ol>"
                ),
            },
            {
                "id": "faq-2",
                "enabled": True,
                "question_en": "Where do you ship to?",
                "question_bg": "Къде доставяте?",
                "answer_en": (
                    "<p>We deliver vehicles worldwide. Our primary destinations include Bulgaria, "
                    "Ukraine, Romania, Moldova and other EU countries. Door-to-door and port-to-port "
                    "options are available — final delivery method is confirmed during order processing.</p>"
                ),
                "answer_bg": (
                    "<p>Доставяме автомобили по целия свят. Основните дестинации са България, "
                    "Украйна, Румъния, Молдова и други страни от ЕС. Възможни са доставки от врата до "
                    "врата и от пристанище до пристанище — методът се уточнява при обработката на поръчката.</p>"
                ),
            },
            {
                "id": "faq-3",
                "enabled": True,
                "question_en": "How long will it take for my order to arrive?",
                "question_bg": "Колко време ще отнеме доставката?",
                "answer_en": (
                    "<p>Average end-to-end timeline is <strong>4–8 weeks</strong> from the moment of "
                    "winning the auction:</p>"
                    "<ol>"
                    "<li>Auction → US warehouse: 3–7 days.</li>"
                    "<li>Inland transport to the port: 7–14 days.</li>"
                    "<li>Ocean freight: 18–30 days (Atlantic) / 35–45 days (Pacific).</li>"
                    "<li>Customs clearance + final delivery: 5–10 days.</li>"
                    "</ol>"
                ),
                "answer_bg": (
                    "<p>Средното време от край до край е <strong>4–8 седмици</strong> от момента на "
                    "спечелване на търга:</p>"
                    "<ol>"
                    "<li>Търг → склад в САЩ: 3–7 дни.</li>"
                    "<li>Сухопътен транспорт до пристанището: 7–14 дни.</li>"
                    "<li>Морски транспорт: 18–30 дни (Атлантик) / 35–45 дни (Тихи океан).</li>"
                    "<li>Митническо оформяне + крайна доставка: 5–10 дни.</li>"
                    "</ol>"
                ),
            },
            {
                "id": "faq-4",
                "enabled": True,
                "question_en": "How do I change or cancel my order?",
                "question_bg": "Как мога да променя или откажа поръчка?",
                "answer_en": (
                    "<p>You can change or cancel your order before the auction bid is placed — "
                    "contact your manager via phone or the personal cabinet. After the vehicle is "
                    "won at auction, cancellation is no longer possible per Copart/IAAI rules; "
                    "however, the title can be re-assigned to another buyer for an additional fee.</p>"
                ),
                "answer_bg": (
                    "<p>Можете да промените или откажете поръчката си преди да бъде направена офертата "
                    "на търга — свържете се с Вашия мениджър по телефон или през личния кабинет. След "
                    "като автомобилът е спечелен, отказ не е възможен съгласно правилата на Copart/IAAI; "
                    "автомобилът може да бъде преотстъпен на друг купувач срещу допълнителна такса.</p>"
                ),
            },
            {
                "id": "faq-5",
                "enabled": True,
                "question_en": "How can I track my order?",
                "question_bg": "Как мога да проследя поръчката си?",
                "answer_en": (
                    "<p>Every order has a real-time status in your <strong>personal cabinet</strong> — "
                    "auction won, picked up, in port, on water, customs, delivered. You will receive "
                    "notifications at every stage by email, Viber and Telegram.</p>"
                ),
                "answer_bg": (
                    "<p>Всяка поръчка има статус в реално време във Вашия <strong>личен кабинет</strong> — "
                    "спечелен търг, взет, в пристанище, в открито море, митница, доставен. Ще получавате "
                    "известия на всеки етап по имейл, Viber и Telegram.</p>"
                ),
            },
        ],
    },
    # Reviews — admin-managed testimonials shown in the "OUR CLIENTS SAY"
    # block on the public homepage.
    "reviews": {
        "enabled": True,
        "title_en": "Our Clients Say",
        "title_bg": "Какво казват нашите клиенти",
        "subtitle_en": "What customers say when they work with us",
        "subtitle_bg": "Какво казват клиентите след работа с нас",
        "google_rating": 4.9,
        "google_reviews_count": 31,
        "google_reviews_url": "",
        "baseline_happy_customers": 455,
        "items": [
            {
                "id": "rev-1",
                "enabled": True,
                "name": "Georgi",
                "name_bg": "Георги",
                "image_url": "",
                "rating": 5,
                "text_en": "I really liked the approach — everything was clear, transparent, and without \u201Csurprises.\u201D The car was chosen to fit my budget and wishes, and they were constantly in touch. I\u2019m already recommending it to my friends!",
                "text_bg": "Хареса ми подходът — всичко беше ясно, прозрачно и без \u201Eизненади\u201C. Колата беше избрана според бюджета и желанията ми, екипът поддържаше постоянна връзка. Вече препоръчвам на приятели!",
            },
            {
                "id": "rev-2",
                "enabled": True,
                "name": "Dimitar",
                "name_bg": "Димитър",
                "image_url": "",
                "rating": 5,
                "text_en": "I bought a car from an auction — the team really knows their stuff. They explained all the nuances, helped me win the bid, and organized delivery. The result — top value for money.",
                "text_bg": "Купих кола от търг — екипът наистина знае работата си. Обясниха ми всички нюанси, помогнаха ми да спечеля наддаването и организираха доставката. Резултатът — отлично съотношение цена/качество.",
            },
            {
                "id": "rev-3",
                "enabled": True,
                "name": "Ivan",
                "name_bg": "Иван",
                "image_url": "",
                "rating": 5,
                "text_en": "Excellent service from start to finish. They handled all the paperwork, customs, and delivery without any hiccups. The car arrived exactly as described, on time and in pristine condition.",
                "text_bg": "Отлично обслужване от начало до край. Поеха документите, митниците и доставката без никакви проблеми. Колата пристигна точно както беше описана — навреме и в перфектно състояние.",
            },
        ],
    },
    # Before / After — admin-managed gallery on the public homepage.
    "before_after": {
        "enabled": True,
        "title_en": "Before and after",
        "title_bg": "Преди и след",
        "subtitle_yellow_en": "Our clients receive",
        "subtitle_yellow_bg": "Нашите клиенти получават",
        "subtitle_white_en": "the best service",
        "subtitle_white_bg": "най-добрата услуга",
        "items": [
            {
                "id": "ba-1",
                "enabled": True,
                "model": "BMV 328",
                "order_date": "12.12.2025",
                "finished_date": "12.04.2026",
                "price": "6,500 EURO",
                "before_image_url": "/figma/DT-Klausen-LS-135-12@2x.webp",
                "after_image_url": "/figma/DT-Klausen-LS-135-22@2x.webp",
            },
            {
                "id": "ba-2",
                "enabled": True,
                "model": "BMV 328",
                "order_date": "12.12.2025",
                "finished_date": "12.04.2026",
                "price": "6,500 EURO",
                "before_image_url": "/figma/DT-Klausen-LS-135-11@2x.webp",
                "after_image_url": "/figma/DT-Klausen-LS-135-32@2x.webp",
            },
            {
                "id": "ba-3",
                "enabled": True,
                "model": "BMV 328",
                "order_date": "12.12.2025",
                "finished_date": "12.04.2026",
                "price": "6,500 EURO",
                "before_image_url": "/figma/DT-Klausen-LS-135-1@2x.webp",
                "after_image_url": "/figma/DT-Klausen-LS-135-3@2x.webp",
            },
            {
                "id": "ba-4",
                "enabled": True,
                "model": "Audi Q5",
                "order_date": "03.03.2026",
                "finished_date": "11.06.2026",
                "price": "12,900 EURO",
                "before_image_url": "/figma/DT-Klausen-LS-135-12@2x.webp",
                "after_image_url": "/figma/DT-Klausen-LS-135-22@2x.webp",
            },
            {
                "id": "ba-5",
                "enabled": True,
                "model": "Mercedes-Benz GLC",
                "order_date": "18.01.2026",
                "finished_date": "22.05.2026",
                "price": "18,400 EURO",
                "before_image_url": "/figma/DT-Klausen-LS-135-11@2x.webp",
                "after_image_url": "/figma/DT-Klausen-LS-135-32@2x.webp",
            },
            {
                "id": "ba-6",
                "enabled": True,
                "model": "Toyota Camry",
                "order_date": "07.02.2026",
                "finished_date": "30.05.2026",
                "price": "9,200 EURO",
                "before_image_url": "/figma/DT-Klausen-LS-135-1@2x.webp",
                "after_image_url": "/figma/DT-Klausen-LS-135-3@2x.webp",
            },
            {
                "id": "ba-7",
                "enabled": True,
                "model": "Jeep Grand Cherokee",
                "order_date": "25.10.2025",
                "finished_date": "08.03.2026",
                "price": "15,750 EURO",
                "before_image_url": "/figma/DT-Klausen-LS-135-12@2x.webp",
                "after_image_url": "/figma/DT-Klausen-LS-135-22@2x.webp",
            },
            {
                "id": "ba-8",
                "enabled": True,
                "model": "Volkswagen Tiguan",
                "order_date": "02.11.2025",
                "finished_date": "19.02.2026",
                "price": "11,200 EURO",
                "before_image_url": "/figma/DT-Klausen-LS-135-11@2x.webp",
                "after_image_url": "/figma/DT-Klausen-LS-135-32@2x.webp",
            },
        ],
    },
    "updated_at": None,
    "updated_by": None,
}


async def _get_site_info_doc():
    """Fetch site_info doc; create with defaults if missing."""
    db = _db()
    if db is None:
        return DEFAULT_SITE_INFO
    doc = await db.site_info.find_one({"_id": SITE_INFO_DOC_ID})
    if not doc:
        seed = dict(DEFAULT_SITE_INFO)
        seed["updated_at"] = datetime.now(timezone.utc).isoformat()
        try:
            await db.site_info.insert_one(seed)
        except Exception as e:
            logger.warning(f"[site_info] seed insert failed: {e}")
        return seed
    # Merge defaults for any missing keys (forward-compat)
    merged = {**DEFAULT_SITE_INFO, **doc}
    for k in ("policies", "footer", "cookie_banner", "header", "faq", "reviews", "before_after", "hero"):
        if k in DEFAULT_SITE_INFO:
            merged[k] = {**DEFAULT_SITE_INFO[k], **(doc.get(k) or {})}
    # Deep-merge `footer.contacts` so newly-introduced BG-localized keys
    # (addresses_bg, working_hours_bg, registration_address_bg) are surfaced
    # for already-persisted docs that pre-date this schema extension.
    try:
        default_contacts = (DEFAULT_SITE_INFO.get("footer") or {}).get("contacts") or {}
        existing_contacts = (doc.get("footer") or {}).get("contacts") or {}
        merged_contacts = {**default_contacts, **existing_contacts}
        merged["footer"]["contacts"] = merged_contacts
    except Exception as e:
        logger.warning(f"[site_info] contacts deep-merge failed: {e}")
    # Deep-merge `reviews.items` so newly-introduced bilingual fields flow
    # through to already-persisted documents that pre-date the schema extension.
    try:
        default_items = (DEFAULT_SITE_INFO.get("reviews") or {}).get("items") or []
        existing_items = (merged.get("reviews") or {}).get("items") or []
        if existing_items:
            by_id = {it.get("id"): it for it in default_items if it.get("id")}
            patched = []
            for it in existing_items:
                d = by_id.get(it.get("id"))
                if d:
                    fill = {k: v for k, v in d.items() if k not in it}
                    patched.append({**fill, **it})
                else:
                    patched.append(it)
            merged["reviews"]["items"] = patched
    except Exception as e:
        logger.warning(f"[site_info] reviews deep-merge failed: {e}")
    # Deep-merge `before_after.items`: keep admin-edited items but APPEND
    # any default items whose `id` is missing from the persisted document.
    # This is how new default cards (ba-4 … ba-8) reach already-seeded DBs
    # without overwriting customer-tweaked entries.
    try:
        default_ba_items = (DEFAULT_SITE_INFO.get("before_after") or {}).get("items") or []
        existing_ba_items = (merged.get("before_after") or {}).get("items") or []
        existing_ids = {it.get("id") for it in existing_ba_items if it.get("id")}
        appended = list(existing_ba_items)
        for d in default_ba_items:
            if d.get("id") and d["id"] not in existing_ids:
                appended.append(d)
        merged["before_after"]["items"] = appended
    except Exception as e:
        logger.warning(f"[site_info] before_after deep-merge failed: {e}")
    # Backward-compat: socials may be stored as flat strings { ig: "url" } —
    # normalize to { ig: {enabled, url} } so the frontend has a single shape.
    try:
        socials = (merged.get("footer") or {}).get("socials") or {}
        norm = {}
        default_socials = (DEFAULT_SITE_INFO["footer"]["socials"] or {})
        for key in default_socials.keys():
            v = socials.get(key, default_socials[key])
            if isinstance(v, str):
                norm[key] = {"enabled": bool(v), "url": v}
            elif isinstance(v, dict):
                norm[key] = {
                    "enabled": bool(v.get("enabled", bool(v.get("url")))),
                    "url": v.get("url", ""),
                }
            else:
                norm[key] = {"enabled": False, "url": ""}
        merged["footer"]["socials"] = norm
    except Exception as e:
        logger.warning(f"[site_info] socials normalize failed: {e}")
    return merged


site_info_router = APIRouter(tags=["site-info"])


@site_info_router.get("/api/site-info")
async def get_site_info_public():
    """Public endpoint — returns full site info (used by footer, cookie banner, policy pages)."""
    doc = await _get_site_info_doc()
    # Strip internal fields
    return {k: v for k, v in doc.items() if not k.startswith("_")}


@site_info_router.get("/api/site-info/policy/{key}")
async def get_site_policy_public(key: str, lang: str = "en"):
    """Public endpoint — returns one policy section in given language (en|bg)."""
    if key not in ("privacy", "terms", "cookies", "conditions"):
        raise HTTPException(status_code=404, detail="Unknown policy key")
    if lang not in ("en", "bg"):
        lang = "en"
    doc = await _get_site_info_doc()
    policy = (doc.get("policies") or {}).get(key) or {}
    return policy.get(lang) or policy.get("en") or {"title": key.title(), "content": ""}


@site_info_router.put("/api/admin/site-info")
async def update_site_info_admin(
    payload: Dict[str, Any] = Body(...),
    user: dict = Depends(require_user),
):
    """Admin endpoint — update site info. Requires master_admin / admin."""
    role = (user or {}).get("role", "")
    if role not in ("master_admin", "admin"):
        raise HTTPException(status_code=403, detail="Forbidden")
    db = _db()
    if db is None:
        raise HTTPException(status_code=503, detail="DB not available")

    update = {}
    for key in ("policies", "footer", "cookie_banner", "header", "faq", "reviews", "before_after", "hero"):
        if key in payload and isinstance(payload[key], dict):
            update[key] = payload[key]
    if not update:
        raise HTTPException(status_code=400, detail="Nothing to update")

    update["updated_at"] = datetime.now(timezone.utc).isoformat()
    update["updated_by"] = user.get("email") or user.get("id")

    await db.site_info.update_one(
        {"_id": SITE_INFO_DOC_ID},
        {"$set": update},
        upsert=True,
    )
    return await _get_site_info_doc()


@site_info_router.post("/api/admin/site-info/upload-review-image")
async def upload_review_image_admin(
    image: UploadFile = File(...),
    user: dict = Depends(require_user),
):
    role = (user or {}).get("role", "")
    if role not in ("master_admin", "admin"):
        raise HTTPException(status_code=403, detail="Forbidden")

    ctype = (image.content_type or "").lower()
    allowed = {
        "image/jpeg": "jpg",
        "image/png": "png",
        "image/webp": "webp",
        "image/gif": "gif",
    }
    if ctype not in allowed:
        raise HTTPException(status_code=400, detail=f"Unsupported image type: {ctype}")

    ext = allowed[ctype]
    content = await image.read()
    if len(content) > 5 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="Image too large (max 5MB)")

    reviews_dir = _static_dir() / "reviews"
    reviews_dir.mkdir(parents=True, exist_ok=True)

    fname = f"rev_{int(datetime.now(timezone.utc).timestamp() * 1000)}.{ext}"
    dest = reviews_dir / fname
    with open(dest, "wb") as f:
        f.write(content)

    url = f"/api/static/reviews/{fname}"
    return {"success": True, "url": url}


@site_info_router.post("/api/admin/site-info/upload-before-after-image")
async def upload_before_after_image_admin(
    image: UploadFile = File(...),
    user: dict = Depends(require_user),
):
    role = (user or {}).get("role", "")
    if role not in ("master_admin", "admin"):
        raise HTTPException(status_code=403, detail="Forbidden")

    ctype = (image.content_type or "").lower()
    allowed = {
        "image/jpeg": "jpg",
        "image/png": "png",
        "image/webp": "webp",
        "image/gif": "gif",
    }
    if ctype not in allowed:
        raise HTTPException(status_code=400, detail=f"Unsupported image type: {ctype}")

    ext = allowed[ctype]
    content = await image.read()
    if len(content) > 10 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="Image too large (max 10MB)")

    ba_dir = _static_dir() / "before_after"
    ba_dir.mkdir(parents=True, exist_ok=True)

    fname = f"ba_{int(datetime.now(timezone.utc).timestamp() * 1000)}.{ext}"
    dest = ba_dir / fname
    with open(dest, "wb") as f:
        f.write(content)

    url = f"/api/static/before_after/{fname}"
    return {"success": True, "url": url}


@site_info_router.post("/api/admin/site-info/upload-hero-image")
async def upload_hero_image_admin(
    image: UploadFile = File(...),
    variant: str = "web",
    user: dict = Depends(require_user),
):
    """Upload a hero banner image.

    Query param ``variant`` selects the form-factor:
      - ``web``    — desktop 16:9 banner (default, backwards compatible).
      - ``mobile`` — mobile landing portrait variant (≈ 361:326 / 9:8).

    Files are stored under ``static/hero/`` with a variant-suffixed filename
    so the two never collide. The returned ``url`` should be saved into
    ``hero.image_url`` (web) or ``hero.image_url_mobile`` (mobile).
    """
    role = (user or {}).get("role", "")
    if role not in ("master_admin", "admin"):
        raise HTTPException(status_code=403, detail="Forbidden")

    variant_norm = (variant or "web").strip().lower()
    if variant_norm not in ("web", "mobile"):
        raise HTTPException(
            status_code=400,
            detail="Unsupported variant. Allowed: 'web' or 'mobile'.",
        )

    ctype = (image.content_type or "").lower()
    allowed = {
        "image/jpeg": "jpg",
        "image/png":  "png",
        "image/webp": "webp",
    }
    if ctype not in allowed:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported image type: {ctype}. Allowed: JPG, PNG, WebP.",
        )

    ext = allowed[ctype]
    content = await image.read()
    max_bytes = 5 * 1024 * 1024  # 5 MB
    if len(content) > max_bytes:
        raise HTTPException(
            status_code=413,
            detail="Image too large (max 5 MB). Please optimize the file.",
        )

    hero_dir = _static_dir() / "hero"
    hero_dir.mkdir(parents=True, exist_ok=True)

    suffix = "" if variant_norm == "web" else "_mobile"
    fname = (
        f"hero{suffix}_"
        f"{int(datetime.now(timezone.utc).timestamp() * 1000)}.{ext}"
    )
    dest = hero_dir / fname
    with open(dest, "wb") as f:
        f.write(content)

    url = f"/api/static/hero/{fname}"
    return {
        "success": True,
        "url": url,
        "size": len(content),
        "format": ext,
        "variant": variant_norm,
    }


# ═════════════════════════════════════════════════════════════════════════
#  BLOG ARTICLES domain
# ═════════════════════════════════════════════════════════════════════════

BLOG_CATEGORIES = [
    "analysis",   # MARKET ANALYSIS
    "guides",     # IMPORT GUIDES
    "news",       # NEWS
    "reviews",    # CAR REVIEWS
    "tips",       # AUCTION TIPS
    "costs",      # COSTS
]


def _blog_strip_html(html_str: str) -> str:
    """Strip HTML tags and unescape entities — used for read-time + slug."""
    if not html_str:
        return ""
    txt = _blog_re.sub(r"<[^>]+>", " ", html_str)
    txt = _blog_html.unescape(txt)
    return _blog_re.sub(r"\s+", " ", txt).strip()


def _blog_read_minutes(*texts: str) -> int:
    """200 words / minute, minimum 1 minute, combines all language bodies."""
    total_words = 0
    for t in texts:
        if t:
            total_words += len(_blog_strip_html(t).split())
    return max(1, round(total_words / 200))


def _blog_slugify(title: str) -> str:
    """ASCII slug from EN title (fallback: random uuid)."""
    if not title:
        return _blog_uuid4().hex[:10]
    s = title.lower().strip()
    s = _blog_re.sub(r"[^a-z0-9\s-]", "", s)
    s = _blog_re.sub(r"[\s-]+", "-", s).strip("-")
    return s[:80] or _blog_uuid4().hex[:10]


async def _blog_unique_slug(base: str, current_id: str = "") -> str:
    """Append -2 / -3 / … if base slug already exists for a different article."""
    db = _db()
    slug = base
    suffix = 2
    while True:
        existing = await db.blog_articles.find_one(
            {"slug": slug, **({"id": {"$ne": current_id}} if current_id else {})},
            {"_id": 1},
        )
        if not existing:
            return slug
        slug = f"{base}-{suffix}"
        suffix += 1


def _blog_serialize(doc: dict, public: bool = False, lang: str = "en") -> dict:
    """Convert MongoDB document → JSON.  Public mode returns lang-specific fields."""
    if not doc:
        return {}
    d = dict(doc)
    d.pop("_id", None)
    # ensure ISO-formatted timestamps
    for k in ("created_at", "updated_at", "published_at"):
        v = d.get(k)
        if hasattr(v, "isoformat"):
            d[k] = v.isoformat()
    if public:
        lang = lang if lang in ("en", "bg") else "en"
        return {
            "id": d.get("id"),
            "slug": d.get("slug"),
            "category": d.get("category"),
            "cover_image_url": d.get("cover_image_url"),
            "title": (d.get("title", {}) or {}).get(lang) or (d.get("title", {}) or {}).get("en", ""),
            "excerpt": (d.get("excerpt", {}) or {}).get(lang) or (d.get("excerpt", {}) or {}).get("en", ""),
            "body": (d.get("body", {}) or {}).get(lang) or (d.get("body", {}) or {}).get("en", ""),
            "read_time_minutes": d.get("read_time_minutes", 1),
            "related_ids": d.get("related_ids", []),
            "tags": d.get("tags", []) or [],
            "published": bool(d.get("published", False)),
            "published_at": d.get("published_at") or d.get("created_at"),
            "created_at": d.get("created_at"),
        }
    # ensure tags always present in admin payload too
    d["tags"] = d.get("tags", []) or []
    return d


blog_router = APIRouter(tags=["blog"])


# ── Admin: list / create ──────────────────────────────────────────────────
@blog_router.get("/api/admin/blog/articles")
async def admin_blog_list(
    user: dict = Depends(require_user),
    category: Optional[str] = None,
    q: Optional[str] = None,
):
    role = (user or {}).get("role", "")
    if role not in ("master_admin", "admin"):
        raise HTTPException(status_code=403, detail="Forbidden")
    db = _db()
    query = {}
    if category and category != "all":
        query["category"] = category
    if q:
        query["$or"] = [
            {"title.en": {"$regex": q, "$options": "i"}},
            {"title.bg": {"$regex": q, "$options": "i"}},
        ]
    items = []
    cursor = db.blog_articles.find(query).sort("created_at", -1)
    async for d in cursor:
        items.append(_blog_serialize(d))
    return {"items": items, "count": len(items)}


@blog_router.post("/api/admin/blog/articles")
async def admin_blog_create(
    payload: Dict[str, Any] = Body(...),
    user: dict = Depends(require_user),
):
    role = (user or {}).get("role", "")
    if role not in ("master_admin", "admin"):
        raise HTTPException(status_code=403, detail="Forbidden")

    db = _db()
    category = (payload.get("category") or "news").strip()
    if category not in BLOG_CATEGORIES:
        raise HTTPException(status_code=400, detail=f"Invalid category: {category}")

    title = payload.get("title") or {}
    excerpt = payload.get("excerpt") or {}
    body = payload.get("body") or {}

    title_en = (title.get("en") or "").strip()
    title_bg = (title.get("bg") or "").strip()
    if not title_en and not title_bg:
        raise HTTPException(status_code=400, detail="title.en or title.bg required")

    base_slug = _blog_slugify(payload.get("slug") or title_en or title_bg)
    slug = await _blog_unique_slug(base_slug)

    now = datetime.now(timezone.utc)
    published = bool(payload.get("published", False))
    raw_tags = payload.get("tags") or []
    if isinstance(raw_tags, str):
        raw_tags = [t for t in _blog_re.split(r"[,\n]", raw_tags) if t]
    seen_tags = set()
    norm_tags: list = []
    for t in raw_tags:
        if not isinstance(t, str):
            continue
        s = t.strip()[:40]
        if not s:
            continue
        k = s.lower()
        if k in seen_tags:
            continue
        seen_tags.add(k)
        norm_tags.append(s)
        if len(norm_tags) >= 12:
            break
    doc = {
        "id": str(_blog_uuid4()),
        "slug": slug,
        "category": category,
        "cover_image_url": (payload.get("cover_image_url") or "").strip() or None,
        "title":   {"en": title_en,   "bg": title_bg},
        "excerpt": {"en": (excerpt.get("en") or "").strip(),
                    "bg": (excerpt.get("bg") or "").strip()},
        "body":    {"en": body.get("en") or "",
                    "bg": body.get("bg") or ""},
        "tags": norm_tags,
        "related_ids": [str(x) for x in (payload.get("related_ids") or [])][:5],
        "read_time_minutes": _blog_read_minutes(body.get("en"), body.get("bg")),
        "published": published,
        "published_at": now if published else None,
        "created_at": now,
        "updated_at": now,
    }
    await db.blog_articles.insert_one(doc)
    return _blog_serialize(doc)


# ── Admin: get / update / delete single ───────────────────────────────────
@blog_router.get("/api/admin/blog/articles/{article_id}")
async def admin_blog_get(article_id: str, user: dict = Depends(require_user)):
    role = (user or {}).get("role", "")
    if role not in ("master_admin", "admin"):
        raise HTTPException(status_code=403, detail="Forbidden")
    db = _db()
    doc = await db.blog_articles.find_one({"id": article_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Article not found")
    return _blog_serialize(doc)


@blog_router.put("/api/admin/blog/articles/{article_id}")
async def admin_blog_update(
    article_id: str,
    payload: Dict[str, Any] = Body(...),
    user: dict = Depends(require_user),
):
    role = (user or {}).get("role", "")
    if role not in ("master_admin", "admin"):
        raise HTTPException(status_code=403, detail="Forbidden")
    db = _db()
    existing = await db.blog_articles.find_one({"id": article_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Article not found")

    update: Dict[str, Any] = {}
    if "category" in payload:
        cat = (payload.get("category") or "").strip()
        if cat not in BLOG_CATEGORIES:
            raise HTTPException(status_code=400, detail=f"Invalid category: {cat}")
        update["category"] = cat
    if "cover_image_url" in payload:
        update["cover_image_url"] = (payload.get("cover_image_url") or "").strip() or None
    if "title" in payload:
        t = payload.get("title") or {}
        update["title"] = {
            "en": (t.get("en") or existing.get("title", {}).get("en") or "").strip(),
            "bg": (t.get("bg") or existing.get("title", {}).get("bg") or "").strip(),
        }
    if "excerpt" in payload:
        e = payload.get("excerpt") or {}
        update["excerpt"] = {
            "en": (e.get("en") or existing.get("excerpt", {}).get("en") or "").strip(),
            "bg": (e.get("bg") or existing.get("excerpt", {}).get("bg") or "").strip(),
        }
    if "body" in payload:
        b = payload.get("body") or {}
        update["body"] = {
            "en": b.get("en") or existing.get("body", {}).get("en") or "",
            "bg": b.get("bg") or existing.get("body", {}).get("bg") or "",
        }
        update["read_time_minutes"] = _blog_read_minutes(update["body"]["en"], update["body"]["bg"])
    if "related_ids" in payload:
        update["related_ids"] = [str(x) for x in (payload.get("related_ids") or [])][:5]
    if "tags" in payload:
        raw_tags = payload.get("tags") or []
        if isinstance(raw_tags, str):
            raw_tags = [t for t in _blog_re.split(r"[,\n]", raw_tags) if t]
        seen_tags = set()
        norm_tags: list = []
        for t in raw_tags:
            if not isinstance(t, str):
                continue
            s = t.strip()[:40]
            if not s:
                continue
            k = s.lower()
            if k in seen_tags:
                continue
            seen_tags.add(k)
            norm_tags.append(s)
            if len(norm_tags) >= 12:
                break
        update["tags"] = norm_tags
    if "published_at" in payload and payload.get("published_at"):
        try:
            pa = payload.get("published_at")
            if isinstance(pa, str):
                if len(pa) == 10:
                    pa = pa + "T00:00:00+00:00"
                update["published_at"] = datetime.fromisoformat(pa.replace("Z", "+00:00"))
        except Exception:
            pass
    if "slug" in payload and payload.get("slug"):
        base = _blog_slugify(payload.get("slug"))
        update["slug"] = await _blog_unique_slug(base, current_id=article_id)
    if "published" in payload:
        update["published"] = bool(payload.get("published"))
        if update["published"] and not existing.get("published_at"):
            update["published_at"] = datetime.now(timezone.utc)

    update["updated_at"] = datetime.now(timezone.utc)
    await db.blog_articles.update_one({"id": article_id}, {"$set": update})
    new_doc = await db.blog_articles.find_one({"id": article_id})
    return _blog_serialize(new_doc)


@blog_router.delete("/api/admin/blog/articles/{article_id}")
async def admin_blog_delete(article_id: str, user: dict = Depends(require_user)):
    role = (user or {}).get("role", "")
    if role not in ("master_admin", "admin"):
        raise HTTPException(status_code=403, detail="Forbidden")
    db = _db()
    res = await db.blog_articles.delete_one({"id": article_id})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Article not found")
    return {"success": True}


# ── Admin: cover-image upload ─────────────────────────────────────────────
@blog_router.post("/api/admin/blog/upload-image")
async def admin_blog_upload_image(
    image: UploadFile = File(...),
    user: dict = Depends(require_user),
):
    role = (user or {}).get("role", "")
    if role not in ("master_admin", "admin"):
        raise HTTPException(status_code=403, detail="Forbidden")

    ctype = (image.content_type or "").lower()
    allowed = {
        "image/jpeg": "jpg",
        "image/png":  "png",
        "image/webp": "webp",
        "image/gif":  "gif",
    }
    if ctype not in allowed:
        raise HTTPException(status_code=400, detail=f"Unsupported image type: {ctype}")
    ext = allowed[ctype]
    content = await image.read()
    if len(content) > 8 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="Image too large (max 8MB)")

    blog_dir = _static_dir() / "blog"
    blog_dir.mkdir(parents=True, exist_ok=True)
    fname = f"blog_{int(datetime.now(timezone.utc).timestamp() * 1000)}.{ext}"
    dest = blog_dir / fname
    with open(dest, "wb") as f:
        f.write(content)
    return {"success": True, "url": f"/api/static/blog/{fname}", "size": len(content)}


# ── Public: list / single ─────────────────────────────────────────────────
@blog_router.get("/api/public/blog/articles")
async def public_blog_list(
    lang: str = Query("en"),
    category: str = Query("all"),
    tag: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
):
    lang = lang if lang in ("en", "bg") else "en"
    db = _db()
    query: Dict[str, Any] = {"published": True}
    if category and category != "all":
        if category not in BLOG_CATEGORIES:
            raise HTTPException(status_code=400, detail=f"Invalid category: {category}")
        query["category"] = category
    if tag:
        # case-insensitive tag filter
        query["tags"] = {"$regex": f"^{_blog_re.escape(tag.strip())}$", "$options": "i"}

    skip = (page - 1) * limit
    total = await db.blog_articles.count_documents(query)
    items = []
    cursor = (
        db.blog_articles.find(query)
        .sort([("published_at", -1), ("created_at", -1)])
        .skip(skip)
        .limit(limit)
    )
    async for d in cursor:
        items.append(_blog_serialize(d, public=True, lang=lang))

    # collect a unique sorted list of all tags currently used by published articles
    all_tags = await db.blog_articles.distinct("tags", {"published": True})
    all_tags = sorted([t for t in (all_tags or []) if isinstance(t, str) and t.strip()])

    return {
        "items": items,
        "total": total,
        "page": page,
        "limit": limit,
        "categories": BLOG_CATEGORIES,
        "tags": all_tags,
    }


@blog_router.get("/api/public/blog/articles/{slug}")
async def public_blog_single(slug: str, lang: str = Query("en")):
    lang = lang if lang in ("en", "bg") else "en"
    db = _db()
    doc = await db.blog_articles.find_one({"slug": slug, "published": True})
    if not doc:
        raise HTTPException(status_code=404, detail="Article not found")
    main = _blog_serialize(doc, public=True, lang=lang)
    # Resolve related
    related_full = []
    for rid in (doc.get("related_ids") or [])[:5]:
        r = await db.blog_articles.find_one({"id": rid, "published": True})
        if r:
            related_full.append(_blog_serialize(r, public=True, lang=lang))
    main["related"] = related_full
    return main
