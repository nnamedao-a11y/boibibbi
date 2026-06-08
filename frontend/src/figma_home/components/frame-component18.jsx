import { useState, useRef, useEffect, useMemo } from "react";
import axios from "axios";
import styles from "./frame-component18.module.css";
import { CAR_BRANDS, MODELS_BY_BRAND, GENERIC_MODELS, YEARS } from "../../data/cars";
import { useLang } from "../../i18n";
import { renderKpiWithRolling } from "../../components/RollingNumber";
import SplitText from "../../components/SplitText";

const API_URL = process.env.REACT_APP_BACKEND_URL || "";

// Original hardcoded copy + image — kept verbatim as the visual fallback
// so the site looks IDENTICAL to the Figma design until the admin
// changes anything in /admin/info → Hero Banner.
const ORIGINAL_HERO = {
  enabled: true,
  eyebrow_en: "america | Korea",
  eyebrow_bg: "америка | Корея",
  title_line1_en: "From auction",
  title_line1_bg: "От търг",
  title_line2_en: "to keys",
  title_line2_bg: "до ключове",
  title_line3_en: "in your hands",
  title_line3_bg: "във Вашите ръце",
  kpi1_en: "/ Over 5,000 cars",
  kpi1_bg: "/ Над 5,000 автомобила",
  kpi2_en: "/ Real-time bids",
  kpi2_bg: "/ Наддавания на живо",
  kpi3_en: "/ 500+ happy clients",
  kpi3_bg: "/ 500+ доволни клиенти",
  image_url: "/figma/image-60@2x.webp",
};

// Resolve relative `/api/static/...` paths to an absolute URL
const resolveImageUrl = (raw) => {
  if (!raw) return ORIGINAL_HERO.image_url;
  if (/^https?:\/\//i.test(raw)) return raw;
  if (raw.startsWith("/api/")) return `${API_URL}${raw}`;
  return raw; // relative `/figma/...` etc — served by the SPA itself
};

const Dropdown = ({ label, value, options, onSelect, isOpen, onToggle, searchable = true }) => {
  const [query, setQuery] = useState("");
  const inputRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      setQuery("");
      // small timeout so DOM mounts before we focus
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [isOpen]);

  /* `options` may be:
     • an array of strings (legacy)                          → no count, always available
     • an array of `{ name, count, available }` objects     → real DB-backed
     We normalise to the object shape so the render code stays simple. */
  const normalisedOptions = useMemo(() => (
    options.map((o) =>
      typeof o === "string"
        ? { name: o, count: null, available: true, isAnyOption: true }
        : o
    )
  ), [options]);

  const filtered = useMemo(() => {
    if (!query.trim()) return normalisedOptions;
    const q = query.trim().toLowerCase();
    return normalisedOptions.filter((o) => o.name.toLowerCase().includes(q));
  }, [query, normalisedOptions]);

  // i18n inline for the search placeholder + empty message
  const { lang } = useLang();
  const isBg = lang === "bg";
  const searchPlaceholder = isBg
    ? `Търсене ${label.toLowerCase()}...`
    : `Search ${label.toLowerCase()}...`;
  const noMatches = isBg ? "Няма съвпадения" : "No matches";

  return (
    <div className={styles.filterCellWrap}>
      <button
        type="button"
        className={`${styles.filterCell} ${isOpen ? styles.filterCellOpen : ""}`}
        onClick={onToggle}
      >
        <span className={styles.filterLabel}>{value || label}</span>
        <img
          className={`${styles.filterCaret} ${isOpen ? styles.filterCaretOpen : ""}`}
          alt=""
          src="/figma/lsicon-down-filled.svg"
        />
      </button>
      {isOpen && (
        <div className={styles.dropdownPanel} role="listbox">
          {searchable && (
            <div className={styles.dropdownSearchBox}>
              <img
                className={styles.dropdownSearchIcon}
                src="/figma/boxicons-search.svg"
                alt=""
              />
              <input
                ref={inputRef}
                className={styles.dropdownSearchInput}
                placeholder={searchPlaceholder}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onClick={(e) => e.stopPropagation()}
              />
            </div>
          )}
          <div className={styles.dropdownList}>
            {filtered.length === 0 ? (
              <div className={styles.dropdownEmpty}>{noMatches}</div>
            ) : (
              filtered.map((opt) => {
                // "Any …" option is always treated as available.
                const isDimmed = !opt.isAnyOption && opt.available === false;
                return (
                  <button
                    key={opt.name}
                    type="button"
                    className={[
                      styles.dropdownItem,
                      value === opt.name ? styles.dropdownItemActive : "",
                      isDimmed ? styles.dropdownItemUnavailable : "",
                    ].filter(Boolean).join(" ")}
                    onClick={() => onSelect(opt.name)}
                    title={isDimmed ? (isBg ? "Няма налични автомобили" : "No cars currently available") : undefined}
                  >
                    {opt.name}
                    {opt.count != null && opt.count > 0 && (
                      <span className={styles.dropdownItemCount}>({opt.count})</span>
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
};

const FrameComponent18 = ({ className = "" }) => {
  const { lang } = useLang();
  const isBg = lang === "bg";

  const [openMenu, setOpenMenu] = useState(null);
  const [brand, setBrand] = useState("");
  const [model, setModel] = useState("");
  const [year, setYear] = useState("");
  const [hero, setHero] = useState(ORIGINAL_HERO);
  const filterRef = useRef(null);

  // Real catalog data — distinct brands/models with live availability counts.
  // Falls back to the static `CAR_BRANDS`/`MODELS_BY_BRAND` lists if the
  // API is unreachable, so the dropdowns are never empty.
  const [brandsData, setBrandsData] = useState(null); // [{name,count,available}] | null
  const [modelsData, setModelsData] = useState(null); // [{name,count,available}] | null

  // Pull admin-configured hero copy + image (silently falls back to ORIGINAL_HERO)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await axios.get(`${API_URL}/api/site-info`);
        if (cancelled) return;
        const h = r?.data?.hero;
        if (h && typeof h === "object") {
          setHero({ ...ORIGINAL_HERO, ...h });
        }
      } catch {
        /* keep defaults */
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Load real brand availability from the catalog backend (same endpoint
  // the /catalog Brand filter uses, so the homepage and the catalog see
  // the exact same data set).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await axios.get(`${API_URL}/api/public/brands`);
        if (cancelled) return;
        if (Array.isArray(r?.data?.data)) {
          setBrandsData(r.data.data);
        }
      } catch {
        /* keep null → fallback to static list */
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Load models for the currently picked brand. Empty brand → no models.
  useEffect(() => {
    let cancelled = false;
    if (!brand) {
      setModelsData(null);
      return undefined;
    }
    (async () => {
      try {
        const r = await axios.get(`${API_URL}/api/public/models`, {
          params: { brand },
        });
        if (cancelled) return;
        if (Array.isArray(r?.data?.data)) {
          setModelsData(r.data.data);
        }
      } catch {
        setModelsData(null);
      }
    })();
    return () => { cancelled = true; };
  }, [brand]);

  // Pick a field with graceful fallback: current lang → other lang → original
  const pick = (key) => {
    const cur = hero[`${key}${isBg ? "_bg" : "_en"}`];
    const alt = hero[`${key}${isBg ? "_en" : "_bg"}`];
    return (cur && cur.trim()) || (alt && alt.trim()) || ORIGINAL_HERO[`${key}_en`] || "";
  };

  const eyebrow = pick("eyebrow");
  const t1 = pick("title_line1");
  const t2 = pick("title_line2");
  const t3 = pick("title_line3");
  const k1 = pick("kpi1");
  const k2 = pick("kpi2");
  const k3 = pick("kpi3");
  const heroImage = resolveImageUrl(hero.image_url);

  useEffect(() => {
    const onDocClick = (e) => {
      if (filterRef.current && !filterRef.current.contains(e.target)) {
        setOpenMenu(null);
      }
    };
    const onEsc = (e) => { if (e.key === "Escape") setOpenMenu(null); };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onEsc);
    };
  }, []);

  const toggle = (name) => setOpenMenu((cur) => (cur === name ? null : name));

  // ── Brand options: real DB-backed when available, static fallback otherwise.
  const brandOptions = useMemo(() => {
    const anyBrand = { name: isBg ? "Всички марки" : "Any Brand", isAnyOption: true, available: true, count: null };
    if (brandsData && brandsData.length) {
      return [anyBrand, ...brandsData];
    }
    return [anyBrand, ...CAR_BRANDS.map((n) => ({ name: n, available: true, count: null }))];
  }, [brandsData, isBg]);

  // ── Model options: real DB-backed when a brand is picked; otherwise show
  //    the static generic models list, all marked as available.
  const modelOptions = useMemo(() => {
    const anyModel = { name: isBg ? "Всички модели" : "Any Model", isAnyOption: true, available: true, count: null };
    if (modelsData && modelsData.length) {
      return [anyModel, ...modelsData];
    }
    if (brand && MODELS_BY_BRAND[brand]) {
      return [anyModel, ...MODELS_BY_BRAND[brand].map((n) => ({ name: n, available: true, count: null }))];
    }
    return [anyModel, ...GENERIC_MODELS.map((n) => ({ name: n, available: true, count: null }))];
  }, [modelsData, brand, isBg]);

  // ── Year options: the catalog has no per-year availability endpoint, so
  //    we keep the static list (last 30 years) and treat all as available.
  const yearOptions = useMemo(() => {
    const anyYear = { name: isBg ? "Всяка година" : "Any Year", isAnyOption: true, available: true, count: null };
    return [anyYear, ...YEARS.map((y) => ({ name: String(y), available: true, count: null }))];
  }, [isBg]);

  // FIND A CAR — redirect to /catalog with filters applied using the same
  // URL params the catalog page itself reads: `make` / `model` / `year_min`
  // + `year_max`.
  const onFind = () => {
    const params = new URLSearchParams();
    if (brand) params.set("make", brand);
    if (model && model !== "Any Model" && model !== "Всички модели") {
      params.set("model", model);
    }
    if (year && year !== "Any Year" && year !== "Всяка година") {
      params.set("year_min", year);
      params.set("year_max", year);
    }
    const qs = params.toString();
    window.location.href = `/catalog${qs ? "?" + qs : ""}`;
  };

  return (
    <section className={[styles.heroContentWrapper, className].join(" ")}>
      <div className={styles.heroContent}>
        <div className={styles.image60Parent}>
          <img
            className={styles.image60Icon}
            alt=""
            src={heroImage}
            onError={(e) => {
              if (e.currentTarget.src !== window.location.origin + ORIGINAL_HERO.image_url) {
                e.currentTarget.src = ORIGINAL_HERO.image_url;
              }
            }}
          />
        </div>

        {/* LEFT-HALF DARKENING — plain black rectangle (962×1012) at
            opacity 0.1, placed over the left half of the hero. NO
            image, no gradient, no inversion. */}
        <div className={styles.leftMirrorClip} aria-hidden="true" />

        <div className={styles.heroInner}>
          <div className={styles.heroTextStack}>
            <h3 className={styles.americaKorea}>
              <span className={styles.lineInner}>{eyebrow}</span>
            </h3>
            <div className={styles.heroHeadline}>
              <SplitText
                as="h2"
                className={styles.fromAuction}
                text={t1}
                baseDelay={260}
                stepMs={28}
                charClass={styles.charMask}
                innerClass={styles.charInner}
              />
              <SplitText
                as="h2"
                className={styles.toKeys}
                text={t2}
                baseDelay={420}
                stepMs={28}
                charClass={styles.charMask}
                innerClass={styles.charInner}
              />
              <SplitText
                as="h2"
                className={styles.inYourHands}
                text={t3}
                baseDelay={580}
                stepMs={28}
                charClass={styles.charMask}
                innerClass={styles.charInner}
              />
            </div>
            <div className={styles.clientStats}>
              <h3 className={styles.statItem}>
                <span className={styles.lineInner}>{renderKpiWithRolling(k1)}</span>
              </h3>
              <h3 className={styles.statItem}>
                <span className={styles.lineInner}>{k2}</span>
              </h3>
              <h3 className={styles.statItem}>
                <span className={styles.lineInner}>{renderKpiWithRolling(k3)}</span>
              </h3>
            </div>
          </div>

          <div className={styles.filterControlsWrapper}>
            <div className={styles.filterControls} ref={filterRef}>
              <Dropdown
                label={isBg ? "Марка" : "Brand"}
                value={brand}
                options={brandOptions}
                isOpen={openMenu === "brand"}
                onToggle={() => toggle("brand")}
                onSelect={(v) => {
                  setBrand(v === "Any Brand" || v === "Всички марки" ? "" : v);
                  setModel("");
                  setOpenMenu(null);
                }}
              />
              <div className={styles.filterDivider} />
              <Dropdown
                label={isBg ? "Модел" : "Model"}
                value={model}
                options={modelOptions}
                isOpen={openMenu === "model"}
                onToggle={() => toggle("model")}
                onSelect={(v) => {
                  setModel(v === "Any Model" || v === "Всички модели" ? "" : v);
                  setOpenMenu(null);
                }}
              />
              <div className={styles.filterDivider} />
              <Dropdown
                label={isBg ? "Всяка година" : "Any year"}
                value={year}
                options={yearOptions}
                isOpen={openMenu === "year"}
                onToggle={() => toggle("year")}
                onSelect={(v) => {
                  setYear(v === "Any Year" || v === "Всяка година" ? "" : v);
                  setOpenMenu(null);
                }}
              />
              <button type="button" className={styles.findBtn} onClick={onFind}>
                {isBg ? "НАМЕРИ АВТОМОБИЛ" : "FIND A CAR"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default FrameComponent18;
