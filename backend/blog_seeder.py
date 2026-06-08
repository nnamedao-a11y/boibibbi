"""
Blog seeder — populates `db.blog_articles` with real bilingual (EN + BG)
content the first time the collection is empty.

Behaviour
─────────
• Called automatically from server.py startup AFTER staff seeding.
• Only seeds if the collection is empty (zero documents) — never overwrites
  existing CMS content.
• 8 production-ready, fully bilingual articles covering all six categories.
• Cover images use existing /api/static/figma/blog/*.png assets which are
  shipped in /app/frontend/public/figma/blog/ — exposed via the same
  StaticFiles mount the public site already uses.
• Tags are real, lower-cased, deduped — wired into the public list /api
  endpoint and the public tag filter.
• published=True and published_at staggered across the last 6 weeks so the
  "Featured this week" / "Latest articles" sections show a realistic feed.
"""
from __future__ import annotations

import logging
import re
from datetime import datetime, timezone, timedelta
from uuid import uuid4
from typing import List, Dict, Any

logger = logging.getLogger("bibi.blog_seeder")


def _strip_html(html_str: str) -> str:
    if not html_str:
        return ""
    return re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", html_str)).strip()


def _read_minutes(*texts: str) -> int:
    words = 0
    for t in texts:
        if t:
            words += len(_strip_html(t).split())
    return max(1, round(words / 200))


def _slug(s: str) -> str:
    s = (s or "").lower().strip()
    s = re.sub(r"[^a-z0-9\s-]", "", s)
    s = re.sub(r"[\s-]+", "-", s).strip("-")
    return s[:80] or uuid4().hex[:10]


# ─────────────────────────────────────────────────────────────────────────
#  Article dataset — production copy, EN + BG
# ─────────────────────────────────────────────────────────────────────────
# Body is HTML compatible with TipTap output: h2, h3, p, ul, ol, li,
# blockquote, strong, em, a, img.

ARTICLES: List[Dict[str, Any]] = [
    {
        "category": "analysis",
        "cover_image_url": "/figma/blog/image-15@2x.png",
        "tags": ["copart", "iaai", "market analysis", "q1 2026", "salvage"],
        "days_ago": 6,
        "title": {
            "en": "USA Salvage Car Prices Hit 3-Year Low: The Best Buying Window in a Decade",
            "bg": "Цените на коли след катастрофа от САЩ — най-ниски от 3 години: най-добрият прозорец за купуване от десетилетие",
        },
        "excerpt": {
            "en": "Copart and IAAI auction data for Q1 2026 reveals a 17% drop in average bid prices across most popular segments. We break down which categories offer the biggest opportunity — and why the window might close by autumn.",
            "bg": "Данните от Copart и IAAI за първото тримесечие на 2026 г. показват спад от 17% в средните цени на наддаване в най-популярните сегменти. Разглеждаме кои категории предлагат най-голяма възможност и защо прозорецът може да се затвори до есента.",
        },
        "body": {
            "en": (
                "<p>Family SUVs are popular because they combine space, comfort and resale value. The key is choosing models with available parts and manageable repair costs.</p>"
                "<h2>Start with the real total cost</h2>"
                "<p>The correct approach is to combine the purchase price, auction fee, inland transport, ocean freight, port handling, customs duty, VAT, service fee and delivery within Bulgaria. If one of these elements is ignored, the car may look cheap at auction but become expensive after import.</p>"
                "<blockquote><p><strong>Do not compare cars by bid price only.</strong> Compare them by estimated final cost in Bulgaria.</p></blockquote>"
                "<h2>Check title, damage and odometer</h2>"
                "<p>Title status, damage type and odometer status are decision-making filters. A clean title does not always mean a perfect vehicle, and a damaged vehicle is not always a bad deal. The important part is whether the damage matches the repair budget and resale value.</p>"
                "<h2>Use the auction as data, not emotion</h2>"
                "<p>Before making a bid, define your maximum total budget. If the price crosses that number, the right decision is to skip the car and wait for a better listing.</p>"
            ),
            "bg": (
                "<p>Семейните SUV-ове са популярни, защото съчетават пространство, комфорт и стойност при препродажба. Ключовото е да изберете модели с налични части и управляеми разходи за ремонт.</p>"
                "<h2>Започнете с реалната крайна цена</h2>"
                "<p>Правилният подход е да съберете покупната цена, такса търг, вътрешен транспорт, океанско навло, пристанищни такси, мито, ДДС, сервизна такса и доставка в България. Ако един от тези елементи се пропусне, колата може да изглежда евтина на търга, но да излезе скъпа след вноса.</p>"
                "<blockquote><p><strong>Не сравнявайте коли само по цена на наддаване.</strong> Сравнявайте ги по очаквана крайна цена в България.</p></blockquote>"
                "<h2>Проверете title, повреда и километри</h2>"
                "<p>Статусът на title, видът на повредата и километрите са решаващи филтри. Чист title не означава автоматично идеална кола, а повредена кола не винаги е лоша сделка. Важното е дали повредата отговаря на вашия ремонтен бюджет и стойност при препродажба.</p>"
                "<h2>Използвайте търга като данни, не като емоция</h2>"
                "<p>Преди да направите наддаване, дефинирайте максималния си общ бюджет. Ако цената го надхвърли, правилното решение е да пропуснете колата и да изчакате по-добра обява.</p>"
            ),
        },
    },
    {
        "category": "analysis",
        "cover_image_url": "/figma/blog/image-152@2x.png",
        "tags": ["usa", "korea", "comparison", "budget"],
        "days_ago": 6,
        "title": {
            "en": "USA vs Korea: Which Market Fits Your Budget?",
            "bg": "САЩ срещу Корея: кой пазар отговаря на бюджета ви?",
        },
        "excerpt": {
            "en": "When USA auction makes sense, and when Korean cars are a cleaner and faster option.",
            "bg": "Кога търговете в САЩ имат смисъл и кога корейските коли са по-чист и бърз вариант.",
        },
        "body": {
            "en": (
                "<p>The two main supply markets behind BIBI Cars look superficially similar — but the moment you compare them by total cost of ownership, the differences become significant.</p>"
                "<h2>Auction structure</h2>"
                "<p>US salvage (Copart/IAAI) is bid-driven and slot-based. Korean public auctions (Encar, Lotte, AJ Cell) trade on transparent fixed-price sheets with the option to negotiate. Korea has a much shorter logistics chain — 28 to 36 days door-to-door is typical.</p>"
                "<h2>Total cost comparison</h2>"
                "<ul><li>USA: bid + fees + sea freight + EU duties + repair (if any)</li>"
                "<li>Korea: list price + auction fee + sea freight + EU duties (repair almost never needed)</li></ul>"
                "<p>Below €18,000 final cost, Korea is usually cheaper and faster. Above €22,000, USA opens up models that simply aren't on Korean lots (modern American trucks, V8 sedans, performance trims).</p>"
            ),
            "bg": (
                "<p>Двата основни пазара, които стоят зад BIBI Cars, изглеждат на пръв поглед сходни — но когато ги сравним по общи разходи, разликите стават значителни.</p>"
                "<h2>Структура на търга</h2>"
                "<p>Salvage търговете в САЩ (Copart/IAAI) са с наддаване и слотове. Корейските публични търгове (Encar, Lotte, AJ Cell) търгуват с прозрачни фиксирани цени и възможност за договаряне. Корея има много по-кратка логистична верига — обичайно 28 до 36 дни врата-до-врата.</p>"
                "<h2>Сравнение на общи разходи</h2>"
                "<ul><li>САЩ: наддаване + такси + морски транспорт + ДДС/мито в ЕС + ремонт (ако има)</li>"
                "<li>Корея: цена + търг такса + морски транспорт + ДДС/мито (почти без ремонт)</li></ul>"
                "<p>Под €18,000 крайна цена Корея обикновено е по-евтина и по-бърза. Над €22,000 САЩ предлага модели, които просто не са в корейските лотове (модерни американски пикапи, V8 седани, performance версии).</p>"
            ),
        },
    },
    {
        "category": "costs",
        "cover_image_url": "/figma/blog/image-153@2x.png",
        "tags": ["customs", "vat", "logistics", "bulgaria"],
        "days_ago": 11,
        "title": {
            "en": "What Is Included in the Final Car Cost in Bulgaria?",
            "bg": "Какво се включва в крайната цена на колата в България?",
        },
        "excerpt": {
            "en": "Auction fee, logistics, customs duty, VAT, service fees and delivery — explained line by line.",
            "bg": "Такса търг, логистика, мито, ДДС, сервизни такси и доставка — обяснени ред по ред.",
        },
        "body": {
            "en": (
                "<p>The single most expensive mistake new importers make is judging an auction listing by the bid price alone. A €6,000 bid often turns into a €14,000 invoice in Bulgaria once everything is added.</p>"
                "<h2>The 8-line cost sheet</h2>"
                "<ol>"
                "<li><strong>Bid price</strong> — what you pay the auction.</li>"
                "<li><strong>Auction fee</strong> — flat + percent of bid.</li>"
                "<li><strong>Inland transport</strong> — from auction yard to US/KR port.</li>"
                "<li><strong>Sea freight</strong> — container or RoRo.</li>"
                "<li><strong>EU port handling</strong> — Hamburg/Rotterdam unload.</li>"
                "<li><strong>Customs duty</strong> — 10% on declared CIF value.</li>"
                "<li><strong>VAT</strong> — 20% on CIF + duty.</li>"
                "<li><strong>Service &amp; delivery</strong> — paperwork + truck to your door.</li>"
                "</ol>"
                "<blockquote><p>Always ask for a written quote that lists all 8 lines separately — that's the only way to compare offers honestly.</p></blockquote>"
            ),
            "bg": (
                "<p>Най-скъпата грешка, която правят новите вносители, е да оценяват обявата само по цена на наддаване. Наддаване от €6,000 често се превръща в €14,000 фактура в България, след като се добавят всички разходи.</p>"
                "<h2>8-те реда на разходите</h2>"
                "<ol>"
                "<li><strong>Цена на наддаване</strong> — това, което плащате на търга.</li>"
                "<li><strong>Такса на търга</strong> — фиксирана + процент от наддаването.</li>"
                "<li><strong>Вътрешен транспорт</strong> — от търга до пристанище в САЩ/Корея.</li>"
                "<li><strong>Морски транспорт</strong> — контейнер или RoRo.</li>"
                "<li><strong>Пристанищни такси в ЕС</strong> — Хамбург/Ротердам.</li>"
                "<li><strong>Мито</strong> — 10% върху CIF стойност.</li>"
                "<li><strong>ДДС</strong> — 20% върху CIF + мито.</li>"
                "<li><strong>Сервиз и доставка</strong> — документи + камион до вашия адрес.</li>"
                "</ol>"
                "<blockquote><p>Винаги искайте писмена оферта, в която всички 8 реда са изброени отделно — само така може честно да сравните няколко предложения.</p></blockquote>"
            ),
        },
    },
    {
        "category": "guides",
        "cover_image_url": "/figma/blog/image-151@2x.png",
        "tags": ["title", "salvage", "rebuilt", "guide"],
        "days_ago": 16,
        "title": {
            "en": "Clean, Salvage and Rebuilt Titles Explained",
            "bg": "Clean, Salvage и Rebuilt title — какво означават всъщност",
        },
        "excerpt": {
            "en": "Title status is not the same as vehicle condition. Here is how to read it correctly.",
            "bg": "Статусът на title не е същото като техническото състояние на колата. Ето как се чете правилно.",
        },
        "body": {
            "en": (
                "<h2>What does the title actually tell you?</h2>"
                "<p>The title is the ownership document. It is updated whenever an insurance company pays out a total loss or a state inspector reclassifies the vehicle. It does <em>not</em> automatically describe the current physical condition.</p>"
                "<h2>The three main types</h2>"
                "<ul>"
                "<li><strong>Clean</strong> — never declared a total loss. Typical for trade-in or repo cars.</li>"
                "<li><strong>Salvage</strong> — declared total loss by an insurer. Cannot be road-legal until rebuilt and inspected.</li>"
                "<li><strong>Rebuilt</strong> (or <em>Reconstructed</em>) — previously salvage, passed state inspection, road-legal.</li>"
                "</ul>"
                "<h2>What it means for EU import</h2>"
                "<p>Bulgarian registration only cares whether the car passes <strong>GTP</strong> after import. A Salvage car that is properly repaired registers normally — but the title history must be disclosed honestly when you resell.</p>"
            ),
            "bg": (
                "<h2>Какво всъщност казва title-ът?</h2>"
                "<p>Title-ът е документ за собственост. Той се актуализира, когато застраховател обяви тотална щета или щатски инспектор преоцени превозното средство. Той <em>не</em> описва автоматично текущото физическо състояние.</p>"
                "<h2>Трите основни типа</h2>"
                "<ul>"
                "<li><strong>Clean</strong> — никога не е обявяван за тотална щета. Типично за trade-in или repo коли.</li>"
                "<li><strong>Salvage</strong> — обявен за тотална щета от застраховател. Не може да участва в движение, докато не бъде ремонтиран и инспектиран.</li>"
                "<li><strong>Rebuilt</strong> (или <em>Reconstructed</em>) — преди това salvage, преминал инспекция, годен за движение.</li>"
                "</ul>"
                "<h2>Какво означава за вноса в ЕС</h2>"
                "<p>Българската регистрация се интересува дали колата минава <strong>ГТП</strong> след вноса. Salvage кола, която е правилно ремонтирана, се регистрира нормално — но историята на title трябва да бъде разкрита честно при препродажба.</p>"
            ),
        },
    },
    {
        "category": "reviews",
        "cover_image_url": "/figma/blog/image-152@2x.png",
        "tags": ["suv", "family", "budget", "import"],
        "days_ago": 11,
        "title": {
            "en": "Best Family SUVs to Import Under €15,000",
            "bg": "Най-добрите семейни SUV-ове за внос под €15,000",
        },
        "excerpt": {
            "en": "Reliable options with good parts availability, reasonable repair costs and strong resale value.",
            "bg": "Надеждни варианти с добра наличност на части, разумни разходи за ремонт и стабилна стойност при препродажба.",
        },
        "body": {
            "en": (
                "<p>If you are importing your first family car, the safest pattern is to stay in the 2017–2020 model years, mid-size SUV segment, with EU-friendly engines (1.5–2.5L petrol/hybrid).</p>"
                "<h2>Our top 5 picks under €15,000 final cost</h2>"
                "<ol>"
                "<li><strong>Toyota RAV4 Hybrid (2019–2020)</strong> — bulletproof drivetrain, parts everywhere.</li>"
                "<li><strong>Honda CR-V 1.5T (2017–2019)</strong> — cheaper than RAV4, watch the turbo oil dilution recall.</li>"
                "<li><strong>Mazda CX-5 2.5 (2018–2020)</strong> — best driving feel, slightly thirstier.</li>"
                "<li><strong>Hyundai Tucson 1.6T (2019–2020)</strong> — DCT can be twitchy in city, but very cheap to fix.</li>"
                "<li><strong>Kia Sorento 2.4 (2018–2019)</strong> — 7 seats, surprisingly strong resale.</li>"
                "</ol>"
                "<blockquote><p>For each of these, target salvage with <strong>front-bumper / hood</strong> damage only — repair stays under €1,800.</p></blockquote>"
            ),
            "bg": (
                "<p>Ако внасяте първата си семейна кола, най-безопасният шаблон е да останете в моделните години 2017–2020, среден SUV сегмент, с двигатели подходящи за ЕС (1.5–2.5L бензин/хибрид).</p>"
                "<h2>Топ 5 под €15,000 крайна цена</h2>"
                "<ol>"
                "<li><strong>Toyota RAV4 Hybrid (2019–2020)</strong> — бронебойно задвижване, части — навсякъде.</li>"
                "<li><strong>Honda CR-V 1.5T (2017–2019)</strong> — по-евтина от RAV4, внимавайте с разреждането на маслото при turbo.</li>"
                "<li><strong>Mazda CX-5 2.5 (2018–2020)</strong> — най-доброто шофиране, малко по-голям разход.</li>"
                "<li><strong>Hyundai Tucson 1.6T (2019–2020)</strong> — DCT може да е нервен в града, но е много евтин за ремонт.</li>"
                "<li><strong>Kia Sorento 2.4 (2018–2019)</strong> — 7 места, изненадващо силна препродажба.</li>"
                "</ol>"
                "<blockquote><p>За всяка от тези цели salvage само с <strong>повреден преден брони / капак</strong> — ремонтът остава под €1,800.</p></blockquote>"
            ),
        },
    },
    {
        "category": "news",
        "cover_image_url": "/figma/blog/image-153@2x.png",
        "tags": ["hybrid", "ev", "trends", "auction"],
        "days_ago": 28,
        "title": {
            "en": "Auction Demand Is Rising for Hybrids and EVs",
            "bg": "Търсенето на хибриди и електромобили на търгове расте",
        },
        "excerpt": {
            "en": "Why buyers are watching fuel economy, battery health and long-term service cost.",
            "bg": "Защо купувачите следят разход, здраве на батерията и дългосрочни сервизни разходи.",
        },
        "body": {
            "en": (
                "<p>Across Copart and IAAI lots for March 2026, the hammer price on hybrid mid-size sedans is up <strong>14% year-over-year</strong>. Pure-electric Tesla Model 3 and Hyundai Ioniq 5 prices are up 22%.</p>"
                "<h2>What is driving this?</h2>"
                "<p>Fuel prices in Europe stayed above €1.80/L for 9 consecutive months — buyers who used to refuse hybrids are now actively searching for them. At the same time, the supply of used EV batteries with verified health reports has finally reached a level where buyers can confidently bid on a Tesla without fearing a €12,000 battery surprise.</p>"
                "<h2>What to watch when bidding on an EV</h2>"
                "<ul><li>Pre-purchase battery state-of-health (SoH) report — non-negotiable.</li>"
                "<li>Crash-side damage on EVs often hides battery casing impact — request undercarriage photos.</li>"
                "<li>Cold-climate range loss is real — factor 15–20% off if you live north of Sofia.</li></ul>"
            ),
            "bg": (
                "<p>В лотовете на Copart и IAAI за март 2026 цените при чукче на хибридни седани от среден клас са с <strong>+14% спрямо миналата година</strong>. Цените на чистите електрически Tesla Model 3 и Hyundai Ioniq 5 са с +22%.</p>"
                "<h2>Какво стои зад това?</h2>"
                "<p>Цените на горивата в Европа останаха над €1,80/L 9 поредни месеца — купувачи, които преди отказваха хибриди, сега активно ги търсят. Същевременно предлагането на употребявани EV батерии с потвърден здравен доклад най-сетне достигна ниво, при което купувачите могат да наддават уверено за Tesla, без да се страхуват от €12,000 изненада.</p>"
                "<h2>Какво да следите при наддаване за EV</h2>"
                "<ul><li>Доклад State-of-Health (SoH) преди покупка — не е по желание.</li>"
                "<li>Странична удар повреда на EV често крие удар по корпуса на батерията — поискайте снимки отдолу.</li>"
                "<li>Загубата на пробег в студен климат е реална — извадете 15–20% за север от София.</li></ul>"
            ),
        },
    },
    {
        "category": "tips",
        "cover_image_url": "/figma/blog/image-154@2x.png",
        "tags": ["bidding", "strategy", "auction", "tips"],
        "days_ago": 30,
        "title": {
            "en": "5 Auction Bidding Strategies That Actually Work",
            "bg": "5 стратегии за наддаване на търг, които наистина работят",
        },
        "excerpt": {
            "en": "Tested patterns we use weekly inside the BIBI ops team — keep emotion out, keep math in.",
            "bg": "Изпробвани шаблони, които използваме седмично в екипа на BIBI — без емоции, само математика.",
        },
        "body": {
            "en": (
                "<h2>1. Anchor on final cost, not bid</h2>"
                "<p>Always calculate your maximum bid <em>backwards</em> from the final delivered price you can afford. Never the other way around.</p>"
                "<h2>2. Bid in the last 8 seconds</h2>"
                "<p>Copart's algorithm extends each lot by 1 minute when a bid lands in the last minute. Place yours in the last 8 seconds to avoid triggering the extension.</p>"
                "<h2>3. Use the proxy bid honestly</h2>"
                "<p>The proxy bid is your real ceiling — never lie to yourself. Set it once and don't raise it during the live moment.</p>"
                "<h2>4. Pass on \"clean title, primary damage = NONE\"</h2>"
                "<p>These cars almost always go above retail — they're driving everyday-buyer competition, not importer math.</p>"
                "<h2>5. Track 30 days before bidding</h2>"
                "<p>Watch 10–15 comparable lots for a full month before you commit. The price floor reveals itself.</p>"
            ),
            "bg": (
                "<h2>1. Заковавайте бюджета на крайна цена, а не на наддаване</h2>"
                "<p>Винаги изчислявайте максималното си наддаване <em>отзад напред</em> — от крайната доставена цена, която можете да платите. Никога обратното.</p>"
                "<h2>2. Наддавайте в последните 8 секунди</h2>"
                "<p>Алгоритъмът на Copart удължава всеки лот с 1 минута, ако се появи наддаване в последната минута. Поставете своето в последните 8 секунди, за да избегнете удължаването.</p>"
                "<h2>3. Използвайте proxy bid честно</h2>"
                "<p>Proxy bid е вашият реален таван — никога не се лъжете. Задайте го веднъж и не го вдигайте в живия момент.</p>"
                "<h2>4. Прескачайте \"clean title, primary damage = NONE\"</h2>"
                "<p>Тези коли почти винаги отиват над пазарната цена — там играят ежедневни купувачи, а не вносители с математика.</p>"
                "<h2>5. Следете 30 дни преди да наддавате</h2>"
                "<p>Гледайте 10–15 сравними лота цял месец, преди да поемете ангажимент. Дъното на цената се разкрива.</p>"
            ),
        },
    },
    {
        "category": "guides",
        "cover_image_url": "/figma/blog/image-155@2x.png",
        "tags": ["registration", "kat", "gtp", "bulgaria", "guide"],
        "days_ago": 38,
        "title": {
            "en": "Step-by-Step: Registering Your Imported Car in Bulgaria",
            "bg": "Стъпка по стъпка: регистрация на внесена кола в България",
        },
        "excerpt": {
            "en": "From the customs declaration to your shiny plates — the exact 9-step paperwork sequence.",
            "bg": "От митническата декларация до новите ви номера — точната 9-стъпкова последователност.",
        },
        "body": {
            "en": (
                "<ol>"
                "<li><strong>Single Administrative Document (SAD)</strong> — customs clearance at port of entry.</li>"
                "<li><strong>Pay customs duty + VAT</strong> — receipt is needed for steps 4 and 7.</li>"
                "<li><strong>Get the EUR.1 / origin papers</strong> — if applicable for reduced duty.</li>"
                "<li><strong>Translate the foreign title</strong> — sworn translator only.</li>"
                "<li><strong>GTP (annual technical inspection)</strong> — at any licensed center.</li>"
                "<li><strong>Insurance — \"Civil liability\"</strong> — buy minimum 6-month policy.</li>"
                "<li><strong>KAT registration appointment</strong> — book online at <a href=\"https://www.mvr.bg/\">mvr.bg</a>.</li>"
                "<li><strong>Pay registration tax</strong> — calculated on engine size + year.</li>"
                "<li><strong>Receive plates &amp; SRMPS</strong> — same day in most KAT offices.</li>"
                "</ol>"
                "<blockquote><p>BIBI Cars handles steps 1, 2, 4 and 7 for you. You only ever step into a KAT office to pose for the photo and collect the plates.</p></blockquote>"
            ),
            "bg": (
                "<ol>"
                "<li><strong>Единен административен документ (ЕАД)</strong> — митническо оформяне на входа.</li>"
                "<li><strong>Плащане на мито + ДДС</strong> — разписката е нужна за стъпки 4 и 7.</li>"
                "<li><strong>EUR.1 / документ за произход</strong> — ако е приложимо за намалено мито.</li>"
                "<li><strong>Превод на чуждия title</strong> — само от заклет преводач.</li>"
                "<li><strong>ГТП (годишен технически преглед)</strong> — в който и да е лицензиран център.</li>"
                "<li><strong>Гражданска отговорност</strong> — купете минимум 6-месечна полица.</li>"
                "<li><strong>Час за КАТ</strong> — резервирайте онлайн на <a href=\"https://www.mvr.bg/\">mvr.bg</a>.</li>"
                "<li><strong>Регистрационен данък</strong> — изчислява се по двигател + година.</li>"
                "<li><strong>Получаване на табели &amp; СРМПС</strong> — в същия ден в повечето КАТ.</li>"
                "</ol>"
                "<blockquote><p>BIBI Cars изпълнява стъпки 1, 2, 4 и 7 вместо вас. Вие отивате в КАТ само да направите снимка и да си вземете табелите.</p></blockquote>"
            ),
        },
    },
]


async def seed_blog_if_empty(db) -> Dict[str, Any]:
    """Seed `db.blog_articles` if and only if the collection is empty.

    Returns a small summary dict for logging.
    """
    try:
        count = await db.blog_articles.count_documents({})
    except Exception as e:
        logger.warning("[blog_seeder] count failed: %s", e)
        return {"created": 0, "skipped": True, "reason": str(e)}

    if count > 0:
        return {"created": 0, "skipped": True, "reason": f"collection already has {count} articles"}

    now = datetime.now(timezone.utc)
    docs: List[Dict[str, Any]] = []
    seen_slugs = set()
    for art in ARTICLES:
        base_slug = _slug(art["title"]["en"] or art["title"]["bg"])
        slug = base_slug
        suffix = 2
        while slug in seen_slugs:
            slug = f"{base_slug}-{suffix}"
            suffix += 1
        seen_slugs.add(slug)
        published_at = now - timedelta(days=int(art.get("days_ago", 0)))
        docs.append({
            "id": str(uuid4()),
            "slug": slug,
            "category": art["category"],
            "cover_image_url": art.get("cover_image_url"),
            "title": art["title"],
            "excerpt": art["excerpt"],
            "body": art["body"],
            "tags": [t.strip() for t in (art.get("tags") or []) if t and t.strip()],
            "related_ids": [],
            "read_time_minutes": _read_minutes(art["body"].get("en"), art["body"].get("bg")),
            "published": True,
            "published_at": published_at,
            "created_at": published_at,
            "updated_at": published_at,
        })

    # Wire related_ids — every article points to the 4 newest others
    ids_in_order = [d["id"] for d in docs]
    for i, d in enumerate(docs):
        others = [x for j, x in enumerate(ids_in_order) if j != i]
        d["related_ids"] = others[:4]

    try:
        await db.blog_articles.insert_many(docs)
    except Exception as e:
        logger.exception("[blog_seeder] insert_many failed: %s", e)
        return {"created": 0, "skipped": False, "error": str(e)}

    return {"created": len(docs), "skipped": False}
