import { useState, useMemo, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import axios from "axios";
import CONTACTS1 from "./c-o-n-t-a-c-t-s1";
import FrameComponent17 from "./frame-component17";
import { useCustomerAuth } from "../../pages/public/CustomerAuth";
import { useLang } from "../../i18n";
import VinSearchDropdown from "../../components/public/VinSearchDropdown";
import { useGetInTouch } from "../../components/public/GetInTouchModal";
import styles from "./header1.module.css";

const API_URL = process.env.REACT_APP_BACKEND_URL || "";
const SITE_INFO_CACHE = "__bibi_site_info_promise__";

function fetchSiteInfo() {
  if (typeof window === "undefined") return Promise.resolve(null);
  if (!window[SITE_INFO_CACHE]) {
    window[SITE_INFO_CACHE] = axios
      .get(`${API_URL}/api/site-info`)
      .then((r) => r.data)
      .catch(() => null);
  }
  return window[SITE_INFO_CACHE];
}

/**
 * Top header — keeps the EXACT Figma export layout (header1.module.css with
 * its flex-end / margin tricks). Functionality is wired on top WITHOUT
 * altering the markup hierarchy:
 *
 *   • Logo            → /
 *   • CATALOG         → /catalog
 *   • CALCULATOR      → /calculator
 *   • ABOUT US        → /about
 *   • CONTACTS        → /contacts
 *   • Search          → /vin/<query>
 *   • Phones          → tel: links
 *   • ENG dropdown    → switches public language (handled inside FrameComponent17)
 *   • Profile icon    → /cabinet/login (or cabinet root if customer is signed in)
 *   • CONTACT US      → opens the global "Reach Out To Us" modal
 *                       (GetInTouchModal), matching the contacts page CTA.
 */
const Header1 = ({ className = "" }) => {
  const navigate = useNavigate();
  const { customer } = useCustomerAuth();
  const { lang } = useLang();
  const { open: openGetInTouch } = useGetInTouch();
  const [siteInfo, setSiteInfo] = useState(null);

  useEffect(() => {
    let cancelled = false;
    fetchSiteInfo().then((d) => {
      if (!cancelled) setSiteInfo(d);
    });
    return () => { cancelled = true; };
  }, []);

  // Admin-managed phones (with sensible default)
  const phones = useMemo(() => {
    const fromHeader = (siteInfo?.header?.phones || []).filter(Boolean);
    if (fromHeader.length) return fromHeader;
    const fromFooter = (siteInfo?.footer?.contacts?.phones || []).filter(Boolean);
    if (fromFooter.length) return fromFooter;
    return ["+359 875 313 158", "+359 897 884 804"];
  }, [siteInfo]);

  // Original Figma export uses fixed widths for nav pills — we keep them so
  // the layout never wraps. Labels translate based on language. For BG we
  // override the widths to fit the wider cyrillic glyphs (measured live:
  // "КАЛКУЛАТОР" ≈ 114px, "КОНТАКТИ" ≈ 94px, "КАТАЛОГ" ≈ 80px, "ЗА НАС" ≈ 64px).
  const navItems = useMemo(() => {
    const isBg = lang === "bg";
    return isBg
      ? [
          { key: "catalog",    label: "КАТАЛОГ",    path: "/catalog",    cONTACTSWidth: "80px",  cONTACTSWidth1: "82px"  },
          { key: "calculator", label: "КАЛКУЛАТОР", path: "/calculator", cONTACTSWidth: "116px", cONTACTSWidth1: "118px" },
          { key: "about",      label: "ЗА НАС",     path: "/about",      cONTACTSWidth: "70px",  cONTACTSWidth1: "70px"  },
          { key: "contacts",   label: "КОНТАКТИ",   path: "/contacts",   cONTACTSWidth: "96px",  cONTACTSWidth1: "98px"  },
        ]
      : [
          { key: "catalog",    label: "CATALOG",    path: "/catalog",    cONTACTSWidth: "69px",  cONTACTSWidth1: "78px"  },
          { key: "calculator", label: "CALCULATOR", path: "/calculator", cONTACTSWidth: "100px", cONTACTSWidth1: "110px" },
          { key: "about",      label: "ABOUT US",   path: "/about",      cONTACTSWidth: "82px",  cONTACTSWidth1: "84px"  },
          { key: "contacts",   label: "CONTACTS",   path: "/contacts",   cONTACTSWidth: "82px",  cONTACTSWidth1: "91px"  },
        ];
  }, [lang]);

  const [vinQuery, setVinQuery] = useState("");
  const [vinOpen, setVinOpen] = useState(false);

  const handleVinSubmit = (e) => {
    e.preventDefault();
    const q = (vinQuery || "").trim();
    if (!q) return;
    setVinOpen(false);
    navigate(`/vin/${encodeURIComponent(q)}`);
  };

  const handleProfileClick = () => {
    let sess = null;
    try { sess = JSON.parse(localStorage.getItem("customer_session") || "null"); } catch { /* ignore */ }
    const id = customer?.customerId || sess?.customerId;
    navigate(id ? `/cabinet/${id}` : "/cabinet/login");
  };

  // CONTACT US (header) — single click opens the same "Reach Out To Us"
  // modal that lives under the map on the Contacts page. Falls back to the
  // contacts page anchor if the provider is, for any reason, not mounted.
  const handleContactClick = () => {
    if (typeof openGetInTouch === "function") {
      openGetInTouch();
      return;
    }
    navigate("/contacts#reach-out");
  };

  return (
    <header className={[styles.header, className].join(" ")}>
      <div className={styles.bibiLogo021Parent}>
        <Link to="/" aria-label="BIBI Cars — Home" style={{ display: "inline-flex" }}>
          <img
            className={styles.bibiLogo021Icon}
            loading="lazy"
            width={141}
            height={48.2}
            sizes="100vw"
            alt="BIBI Cars"
            src="/figma/BiBi-logo-02-1.svg"
          />
        </Link>
        <div className={styles.frameWrapper}>
          <nav className={styles.contactsParent} aria-label="Primary">
            {navItems.map((item) => (
              <CONTACTS1
                key={item.key}
                cONTACTS={item.label}
                cONTACTSWidth={item.cONTACTSWidth}
                cONTACTSWidth1={item.cONTACTSWidth1}
                to={item.path}
                navKey={item.key}
              />
            ))}
          </nav>
        </div>
      </div>

      <div className={styles.headerInner}>
        <div className={styles.searchInputParent}>
          {/* Original .searchInput is a <div> — we render it as <form> so
              Enter submits without changing the visual structure. The
              <VinSearchDropdown> is anchored to this form (position:relative
              applied inline so the dropdown can absolute-position below). */}
          <form
            className={styles.searchInput}
            onSubmit={handleVinSubmit}
            role="search"
            data-testid="header-vin-search"
            style={{ position: "relative" }}
          >
            <div className={styles.searchInputChild} />
            <div className={styles.boxiconssearchParent}>
              <img
                className={styles.boxiconssearch}
                width={24}
                height={24}
                sizes="100vw"
                alt=""
                src="/figma/boxicons-search.svg"
                onClick={handleVinSubmit}
                style={{ cursor: "pointer" }}
              />
              <input
                className={styles.searchByVin}
                placeholder={lang === "bg" ? "Търсене по VIN или № на лот" : "Search by VIN or lot number"}
                type="text"
                value={vinQuery}
                onChange={(e) => { setVinQuery(e.target.value); setVinOpen(true); }}
                onFocus={() => setVinOpen(true)}
                autoComplete="off"
                data-testid="header-vin-input"
              />
            </div>
            <div className={styles.searchInputItem} />
            <VinSearchDropdown
              query={vinQuery}
              open={vinOpen}
              onClose={() => setVinOpen(false)}
              align="left"
              variant="dark"
            />
          </form>
          <div className={styles.placeholder}>
            {phones[0] && (
              <a
                href={`tel:${(phones[0] || "").replace(/\s+/g, "")}`}
                className={styles.placeholderContent}
                style={{ color: "inherit", textDecoration: "none" }}
              >
                {phones[0]}
                <br />
              </a>
            )}
            {phones[1] && (
              <a
                href={`tel:${(phones[1] || "").replace(/\s+/g, "")}`}
                className={styles.placeholderContent2}
                style={{ color: "inherit", textDecoration: "none" }}
              >
                {phones[1]}
              </a>
            )}
          </div>
        </div>
      </div>

      <FrameComponent17
        onProfileClick={handleProfileClick}
        onContactClick={handleContactClick}
        isAuthed={!!(customer?.customerId || (() => {
          try { return JSON.parse(localStorage.getItem("customer_session") || "null")?.customerId; }
          catch { return null; }
        })())}
        customerName={customer?.name || customer?.email || ""}
      />
    </header>
  );
};

export default Header1;
