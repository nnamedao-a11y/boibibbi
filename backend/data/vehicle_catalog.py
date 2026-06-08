"""
Comprehensive static catalogue of vehicle brands and models for the
public /catalog dropdowns.

Why it lives here
-----------------
The DB only contains the *currently available* listings. Showing only those
in the Brand/Model dropdowns hides the breadth of the marketplace from
visitors — a user who searches for "Toyota Camry" but doesn't see Camry in
the dropdown may assume we do not deal with that model at all.

The fix: render the full catalogue in the dropdown UI, but visually dim
options that have zero matching listings right now. The frontend uses the
`available` flag returned by /api/public/brands and /api/public/models
to grey-out unavailable rows.

Maintenance
-----------
* Keep brand keys consistent with the canonical spelling used by /api/public/brands
  (Mercedes-Benz, Land Rover, BMW, etc).
* Add new models any time the parser ingests a fresh one and you want it
  shown in the dropdown even before there is inventory.
"""

VEHICLE_CATALOG: dict[str, list[str]] = {
    # ───────── American ─────────
    "Acura":       ["CL", "ILX", "Integra", "MDX", "NSX", "RDX", "RL", "RLX", "RSX",
                    "TL", "TLX", "TSX", "ZDX"],
    "Buick":       ["Cascada", "Enclave", "Encore", "Envision", "Envista", "LaCrosse",
                    "Lucerne", "Regal", "Verano"],
    "Cadillac":    ["ATS", "CT4", "CT5", "CT6", "CTS", "DTS", "Eldorado", "Escalade",
                    "Escalade ESV", "Escalade EXT", "Lyriq", "SRX", "STS", "XLR", "XT4",
                    "XT5", "XT6", "XTS"],
    "Chevrolet":   ["Astro", "Avalanche", "Aveo", "Blazer", "Bolt EUV", "Bolt EV",
                    "Camaro", "Captiva Sport", "Cobalt", "Colorado", "Corvette", "Cruze",
                    "Equinox", "Express", "HHR", "Impala", "Malibu", "Monte Carlo",
                    "Silverado 1500", "Silverado 2500HD", "Silverado 3500HD", "Sonic",
                    "Spark", "SS", "Suburban", "Tahoe", "Trailblazer", "Traverse", "Trax",
                    "Uplander", "Venture", "Volt"],
    "Chrysler":    ["200", "300", "Aspen", "Crossfire", "PT Cruiser", "Pacifica", "Sebring",
                    "Town & Country", "Voyager"],
    "Dodge":       ["Avenger", "Caliber", "Caravan", "Challenger", "Charger", "Dakota",
                    "Dart", "Demon", "Durango", "Grand Caravan", "Hornet", "Journey",
                    "Magnum", "Neon", "Nitro", "Ram 1500", "Ram 2500", "Ram 3500",
                    "Stratus", "Viper"],
    "Ford":        ["Bronco", "Bronco Sport", "C-Max", "Crown Victoria", "EcoSport",
                    "Edge", "Escape", "Excursion", "Expedition", "Explorer", "F-150",
                    "F-250 Super Duty", "F-350 Super Duty", "Fiesta", "Five Hundred",
                    "Flex", "Focus", "Freestar", "Freestyle", "Fusion", "GT", "Maverick",
                    "Mustang", "Mustang Mach-E", "Ranger", "Taurus", "Thunderbird",
                    "Transit Connect", "Transit", "Windstar"],
    "GMC":         ["Acadia", "Canyon", "Envoy", "Hummer EV", "Jimmy", "Savana", "Sierra 1500",
                    "Sierra 2500HD", "Sierra 3500HD", "Sonoma", "Terrain", "Yukon",
                    "Yukon XL"],
    "Hummer":      ["H1", "H2", "H3", "H3T"],
    "Jeep":        ["Cherokee", "Commander", "Compass", "Gladiator", "Grand Cherokee",
                    "Grand Cherokee L", "Grand Wagoneer", "Liberty", "Patriot",
                    "Renegade", "Wagoneer", "Wrangler", "Wrangler 4xe", "Wrangler Unlimited"],
    "Lincoln":     ["Aviator", "Continental", "Corsair", "MKC", "MKS", "MKT", "MKX", "MKZ",
                    "Mark LT", "Navigator", "Nautilus", "Town Car", "Zephyr"],
    "Lucid":       ["Air", "Gravity"],
    "Mercury":     ["Cougar", "Grand Marquis", "Mariner", "Milan", "Montego", "Monterey",
                    "Mountaineer", "Sable"],
    "Plymouth":    ["Acclaim", "Breeze", "Neon", "Prowler"],
    "Pontiac":     ["Aztek", "Bonneville", "Firebird", "G3", "G5", "G6", "G8", "GTO",
                    "Grand Am", "Grand Prix", "Solstice", "Sunfire", "Torrent", "Vibe"],
    "Ram":         ["1500", "1500 Classic", "2500", "3500", "4500", "5500", "ProMaster",
                    "ProMaster City"],
    "Saturn":      ["Astra", "Aura", "Ion", "Outlook", "Relay", "Sky", "VUE"],
    "Scion":       ["FR-S", "iA", "iM", "iQ", "tC", "xA", "xB", "xD"],
    "Tesla":       ["Cybertruck", "Model 3", "Model S", "Model X", "Model Y", "Roadster",
                    "Semi"],

    # ───────── European – German ─────────
    "Audi":        ["A1", "A3", "A4", "A5", "A6", "A7", "A8", "Allroad", "e-tron",
                    "e-tron GT", "Q3", "Q4 e-tron", "Q5", "Q5 e", "Q5 Sportback", "Q7",
                    "Q8", "Q8 e-tron", "R8", "RS 3", "RS 4", "RS 5", "RS 6", "RS 7",
                    "RS e-tron GT", "RS Q3", "RS Q8", "S3", "S4", "S5", "S6", "S7", "S8",
                    "SQ5", "SQ7", "SQ8", "TT", "TT RS", "TTS"],
    "BMW":         ["1 Series", "2 Series", "3 Series", "4 Series", "5 Series", "6 Series",
                    "7 Series", "8 Series", "i3", "i4", "i5", "i7", "i8", "iX", "iX1",
                    "iX3", "M2", "M3", "M4", "M5", "M6", "M8", "X1", "X2", "X3", "X4",
                    "X5", "X5 M", "X6", "X6 M", "X7", "XM", "Z3", "Z4", "Z8"],
    "Mercedes-Benz": ["A-Class", "AMG GT", "B-Class", "C-Class", "CL-Class", "CLA-Class",
                      "CLK-Class", "CLS-Class", "E-Class", "EQA", "EQB", "EQC", "EQE",
                      "EQE SUV", "EQS", "EQS SUV", "EQV", "G-Class", "GL-Class", "GLA-Class",
                      "GLB-Class", "GLC-Class", "GLE-Class", "GLK-Class", "GLS-Class",
                      "M-Class", "Maybach", "Metris", "R-Class", "S-Class", "SL-Class",
                      "SLC-Class", "SLK-Class", "SLS AMG", "Sprinter"],
    "Mini":        ["Clubman", "Convertible", "Cooper", "Cooper Countryman", "Cooper SE",
                    "Cooper Works", "Coupe", "Hardtop 2 Door", "Hardtop 4 Door",
                    "Paceman", "Roadster"],
    "Porsche":     ["718 Boxster", "718 Cayman", "718 Spyder", "911", "918 Spyder",
                    "Boxster", "Carrera GT", "Cayenne", "Cayenne Coupe", "Cayman",
                    "Macan", "Panamera", "Taycan", "Taycan Cross Turismo"],
    "Smart":       ["Fortwo", "Forfour", "Roadster"],
    "Volkswagen":  ["Arteon", "Atlas", "Atlas Cross Sport", "Beetle", "CC", "Eos", "Golf",
                    "Golf GTI", "Golf R", "ID.4", "ID.7", "Jetta", "Passat", "Phaeton",
                    "Rabbit", "Routan", "Taos", "Tiguan", "Touareg"],

    # ───────── European – British ─────────
    "Aston Martin": ["DB9", "DB11", "DB12", "DBS", "DBS Superleggera", "DBX", "Rapide",
                     "Vanquish", "Vantage", "Virage"],
    "Bentley":      ["Arnage", "Azure", "Bentayga", "Continental", "Continental GT",
                     "Continental Flying Spur", "Flying Spur", "Mulsanne"],
    "Jaguar":       ["E-Pace", "F-Pace", "F-Type", "I-Pace", "S-Type", "X-Type", "XE",
                     "XF", "XJ", "XK", "XKR"],
    "Land Rover":   ["Defender", "Discovery", "Discovery Sport", "Freelander",
                     "LR2", "LR3", "LR4", "Range Rover", "Range Rover Evoque",
                     "Range Rover Sport", "Range Rover Velar"],
    "Lotus":        ["Elise", "Emira", "Eletre", "Evora", "Exige", "Esprit"],
    "McLaren":      ["540C", "570S", "570GT", "600LT", "650S", "675LT", "720S", "750S",
                     "765LT", "Artura", "GT", "MP4-12C", "P1", "Senna"],
    "Rolls-Royce":  ["Cullinan", "Dawn", "Ghost", "Phantom", "Silver Shadow", "Spectre",
                     "Wraith"],

    # ───────── European – Italian ─────────
    "Alfa Romeo":   ["4C", "8C", "Giulia", "Giulietta", "MiTo", "Spider", "Stelvio",
                     "Tonale"],
    "Ferrari":      ["296 GTB", "296 GTS", "308", "458 Italia", "458 Speciale", "488 GTB",
                     "488 Pista", "488 Spider", "599 GTB", "612 Scaglietti", "812 GTS",
                     "812 Superfast", "California", "California T", "Daytona SP3", "Enzo",
                     "F12 Berlinetta", "F430", "F8 Spider", "F8 Tributo", "FF", "GTC4Lusso",
                     "LaFerrari", "Portofino", "Portofino M", "Purosangue", "Roma",
                     "SF90 Spider", "SF90 Stradale"],
    "Fiat":         ["124 Spider", "500", "500e", "500L", "500X", "Panda"],
    "Lamborghini":  ["Aventador", "Diablo", "Gallardo", "Huracan", "Murcielago", "Revuelto",
                     "Urus", "Urus Performante"],
    "Maserati":     ["3200 GT", "Coupe", "Ghibli", "GranSport", "GranTurismo", "Grecale",
                     "Levante", "MC20", "Quattroporte", "Spyder"],

    # ───────── European – French / Swedish ─────────
    "Bugatti":      ["Chiron", "Divo", "Mistral", "Tourbillon", "Veyron"],
    "Polestar":     ["1", "2", "3", "4"],
    "Volvo":        ["C30", "C40", "C70", "EX30", "EX90", "S40", "S60", "S70", "S80",
                     "S90", "V40", "V50", "V60", "V70", "V90", "XC40", "XC60", "XC70",
                     "XC90"],

    # ───────── Japanese ─────────
    "Daihatsu":     ["Charade", "Copen", "Move", "Terios"],
    "Datsun":       ["240Z", "260Z", "280Z", "300ZX"],
    "Honda":        ["Accord", "Accord Hybrid", "Civic", "Civic Si", "Civic Type R",
                     "Clarity", "CR-V", "CR-V Hybrid", "CR-Z", "Crosstour", "Element",
                     "Fit", "HR-V", "Insight", "Odyssey", "Passport", "Pilot", "Prelude",
                     "Ridgeline", "S2000"],
    "Infiniti":     ["EX35", "EX37", "FX35", "FX37", "FX45", "FX50", "G20", "G25", "G35",
                     "G37", "JX35", "M35", "M37", "M45", "M56", "Q40", "Q45", "Q50", "Q60",
                     "Q70", "QX30", "QX50", "QX55", "QX56", "QX60", "QX70", "QX80"],
    "Isuzu":        ["Amigo", "Ascender", "Axiom", "Hombre", "i-280", "i-290", "i-350",
                     "i-370", "Rodeo", "Trooper", "VehiCROSS"],
    "Lexus":        ["CT200h", "ES", "ES Hybrid", "GS", "GS F", "GX", "HS", "IS", "IS F",
                     "LC", "LFA", "LS", "LX", "NX", "NX Hybrid", "RC", "RC F", "RX",
                     "RX Hybrid", "RZ", "SC", "TX", "UX", "UX Hybrid"],
    "Mazda":        ["2", "3", "5", "6", "626", "B-Series", "CX-3", "CX-30", "CX-5",
                     "CX-50", "CX-7", "CX-70", "CX-9", "CX-90", "MX-30", "MX-5 Miata",
                     "MPV", "Protege", "RX-7", "RX-8", "Tribute"],
    "Mitsubishi":   ["3000GT", "Diamante", "Eclipse", "Eclipse Cross", "Endeavor",
                     "Galant", "Lancer", "Lancer Evolution", "Mirage", "Mirage G4",
                     "Montero", "Montero Sport", "Outlander", "Outlander PHEV",
                     "Outlander Sport", "Raider"],
    "Nissan":       ["350Z", "370Z", "Altima", "Ariya", "Armada", "Cube", "Frontier",
                     "GT-R", "Juke", "Kicks", "Leaf", "Maxima", "Murano", "NV Cargo",
                     "NV Passenger", "Pathfinder", "Quest", "Rogue", "Rogue Select",
                     "Rogue Sport", "Sentra", "Titan", "Titan XD", "Versa", "Versa Note",
                     "Xterra", "Z"],
    "Subaru":       ["Ascent", "Baja", "BRZ", "Crosstrek", "Forester", "Impreza", "Legacy",
                     "Outback", "Solterra", "STI", "Tribeca", "WRX", "WRX STI"],
    "Suzuki":       ["Aerio", "Equator", "Forenza", "Grand Vitara", "Jimny", "Kizashi",
                     "Reno", "SX4", "Swift", "Verona", "XL-7"],
    "Toyota":       ["4Runner", "86", "Avalon", "Avalon Hybrid", "bZ4X", "C-HR", "Camry",
                     "Camry Hybrid", "Celica", "Corolla", "Corolla Cross", "Corolla Hatchback",
                     "Corolla Hybrid", "Corolla iM", "Crown", "Echo", "FJ Cruiser",
                     "Grand Highlander", "GR86", "GR Corolla", "GR Supra", "Highlander",
                     "Highlander Hybrid", "Land Cruiser", "Matrix", "Mirai", "MR2",
                     "Prius", "Prius C", "Prius Plug-in", "Prius Prime", "Prius V",
                     "RAV4", "RAV4 Hybrid", "RAV4 Prime", "Sequoia", "Sienna",
                     "Solara", "Supra", "Tacoma", "Tundra", "Venza", "Yaris", "Yaris iA"],

    # ───────── Korean ─────────
    "Genesis":      ["Electrified G80", "Electrified GV70", "G70", "G80", "G90", "GV60",
                     "GV70", "GV80"],
    "Hyundai":      ["Accent", "Azera", "Elantra", "Elantra GT", "Elantra Hybrid",
                     "Elantra N", "Entourage", "Equus", "Genesis", "Genesis Coupe",
                     "Ioniq", "Ioniq 5", "Ioniq 6", "Kona", "Kona Electric", "Kona N",
                     "Nexo", "Palisade", "Santa Cruz", "Santa Fe", "Santa Fe Hybrid",
                     "Sonata", "Sonata Hybrid", "Tiburon", "Tucson", "Tucson Hybrid",
                     "Veloster", "Veloster N", "Venue", "Veracruz", "XG350"],
    "Kia":          ["Amanti", "Borrego", "Cadenza", "Carnival", "EV6", "EV9", "Forte",
                     "K5", "K900", "Niro", "Niro EV", "Optima", "Optima Hybrid",
                     "Rio", "Rondo", "Sedona", "Seltos", "Sorento", "Sorento Hybrid",
                     "Soul", "Soul EV", "Spectra", "Sportage", "Sportage Hybrid",
                     "Stinger", "Telluride"],
    "SsangYong":    ["Actyon", "Korando", "Musso", "Rexton", "Tivoli"],

    # ───────── Other ─────────
    "Geely":        ["Atlas", "Coolray", "Emgrand", "Tugella"],
    "Rivian":       ["R1S", "R1T"],
}

# Reverse alias helper exported for shared use across endpoints.
BRAND_ALIASES_REVERSE: dict[str, list[str]] = {
    "Chevrolet":    ["Chevrolet", "Chev", "Chevy"],
    "Land Rover":   ["Land Rover", "Land"],
    "Nissan":       ["Nissan", "Niss"],
    "Mercedes-Benz": ["Mercedes-Benz", "MB", "Mercedes"],
    "Volkswagen":   ["Volkswagen", "VW"],
}


def all_brands() -> list[str]:
    """Sorted list of every catalogue brand."""
    return sorted(VEHICLE_CATALOG.keys(), key=lambda x: x.lower())


def all_models_for(brands: list[str]) -> list[str]:
    """De-duplicated alphabetically-sorted models for the given brands."""
    seen: set[str] = set()
    for b in brands:
        for m in VEHICLE_CATALOG.get(b, []):
            seen.add(m)
    return sorted(seen, key=lambda x: x.lower())
