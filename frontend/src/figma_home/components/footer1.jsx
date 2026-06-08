/**
 * BIBI Cars — Footer1 (pixel-perfect, anchored to a 1920 × 1017 Figma frame).
 *
 * The wrapper <ScaledChrome> renders this footer at its native 1920px width
 * and `transform: scale(...)`s it down on smaller viewports. All children are
 * therefore absolutely positioned inside the 1920 × 1017 frame using the exact
 * pixel offsets from the Figma spec:
 *
 *   • Address column (label + Bulgaria addresses) : left 958, right 588
 *   • Working hours                               : bottom 466.55
 *   • Viber icon                                  : bottom 301
 *   • Registration address                        : bottom 142.24
 *   • "Get in touch" button                       : right 358.5
 *
 * All right-column textual blocks share the same left=958 anchor so they line
 * up vertically along a single column edge.
 */
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import axios from "axios";
import BUTTON1 from "./b-u-t-t-o-n1";
import { useGetInTouch } from "../../components/public/GetInTouchModal";
import { usePolicyModal } from "../../components/public/PolicyModal";
import { useLang } from "../../i18n";
import styles from "./footer1.module.css";

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

const FOOTER_T = {
  en: {
    phoneLabel: "Phone number:",
    addressLabel: "Address:",
    workingHours: "Working hours",
    viberLabel: "Join our group and get the hottest offers:",
    socialLabel: "Social media:",
    copyright: "All right reserved. BIBI CARS",
    conditions: "Conditions",
    privacy: "Privacy Policy",
    cookies: "Cookies",
    credit: "/ Website design - O.la /",
    cta: "Get in touch",
    menu: { catalog: "CATALOG", calculator: "CALCULATOR", about: "ABOUT US", blog: "BLOG" },
    defaultHours: "Mon - Fri, 10.00 - 19.00",
    evaxCredit: "/ Website made with Eva-X /",
    registrationLabel: "Registration address:",
    defaultRegistrationAddress: "Republic of Bulgaria, 1415, Sofia, Cherni Vrah Blvd., 230",
  },
  bg: {
    phoneLabel: "Телефонен номер:",
    addressLabel: "Адрес:",
    workingHours: "Работно време",
    viberLabel: "Присъединете се към нашата група и получете най-горещите оферти:",
    socialLabel: "Социални мрежи:",
    copyright: "Всички права запазени. BIBI CARS",
    conditions: "Общи условия",
    privacy: "Политика за поверителност",
    cookies: "Бисквитки",
    credit: "/ Дизайн на сайта - O.la /",
    cta: "Свържете се с нас",
    menu: { catalog: "КАТАЛОГ", calculator: "КАЛКУЛАТОР", about: "ЗА НАС", blog: "БЛОГ" },
    defaultHours: "Пн - Пт, 10.00 - 19.00",
    evaxCredit: "/ Сайтът е създаден с Eva-X /",
    registrationLabel: "Адрес на регистрация:",
    defaultRegistrationAddress: "Република България, 1415, София, бул. Черни връх 230",
  },
};

const Footer1 = ({ className = "" }) => {
  const { open } = useGetInTouch();
  const { open: openPolicy } = usePolicyModal();
  const { lang } = useLang();
  const T = lang === "bg" ? FOOTER_T.bg : FOOTER_T.en;
  const [siteInfo, setSiteInfo] = useState(null);

  useEffect(() => {
    let cancelled = false;
    fetchSiteInfo().then((d) => {
      if (!cancelled) setSiteInfo(d);
    });
    return () => { cancelled = true; };
  }, []);

  const phones = useMemo(() => {
    const fromFooter = (siteInfo?.footer?.contacts?.phones || []).filter(Boolean);
    if (fromFooter.length) return fromFooter;
    return ["+359 875 313 158", "+359 897 884 804"];
  }, [siteInfo]);

  const addresses = useMemo(() => {
    const langKey = lang === "bg" ? "bg" : "en";
    // 1) Admin-set localized list takes top priority.
    const langList = (siteInfo?.footer?.contacts?.[`addresses_${langKey}`] || []).filter(Boolean);
    if (langList.length) return langList;
    // 2) For BG, prefer the canonical BG translation over plain (likely EN)
    //    list to keep the locale clean. Admin must set addresses_bg to override.
    if (langKey === "bg") {
      return [
        "България, София, Драгалевци, бул. Витоша № 230",
        "България, София, бул. България № 81",
      ];
    }
    // 3) EN — use admin-set plain list if any, otherwise EN fallback.
    const list = (siteInfo?.footer?.contacts?.addresses || []).filter(Boolean);
    if (list.length) return list;
    return [
      "Bulgaria, Sofia, Dragalevtsi, Vitosha Blvd. No. 230",
      "Bulgaria, Sofia, Bulgaria Blvd., No. 81",
    ];
  }, [siteInfo, lang]);

  const workingHours = (() => {
    const langKey = lang === "bg" ? "bg" : "en";
    const localized = siteInfo?.footer?.contacts?.[`working_hours_${langKey}`];
    if (localized) return localized;
    if (langKey === "bg") return T.defaultHours || "Пн - Пт, 10.00 - 19.00";
    return siteInfo?.footer?.contacts?.working_hours || T.defaultHours;
  })();

  const viber = siteInfo?.footer?.viber_community || {};
  const showViber = viber.enabled !== false && viber.url;

  // Viber label is admin-managed (per-language) with a sensible i18n fallback.
  const viberLabel = (lang === "bg"
    ? (viber.label_bg || viber.label_en)
    : (viber.label_en || viber.label_bg)) || T.viberLabel;

  // Helper for socials
  const socialUrl = (k) => {
    const raw = siteInfo?.footer?.socials?.[k];
    if (!raw) return "";
    if (typeof raw === "string") return raw;
    if (raw.enabled === false) return "";
    return raw.url || "";
  };

  const registrationAddress = (() => {
    const langKey = lang === "bg" ? "bg" : "en";
    const localized = siteInfo?.footer?.contacts?.[`registration_address_${langKey}`];
    if (localized) return localized;
    if (langKey === "bg") {
      return T.defaultRegistrationAddress || "Република България, 1415, София, бул. Черни връх 230";
    }
    return siteInfo?.footer?.contacts?.registration_address || T.defaultRegistrationAddress;
  })();

  return (
    <section className={[styles.footer, className].join(" ")}>
      {/* ── BIBI logo (top-left) ─────────────────────────────────────────── */}
      <div className={styles.logoBlock}>
        <img
          className={styles.bibiLogo021Icon}
          width={427}
          height={145.9}
          sizes="100vw"
          alt="BIBI Cars"
          src="/figma/BiBi-logo-02-1.svg"
        />
      </div>

      {/* ── Phone block (top, x=958) ─────────────────────────────────────── */}
      <div className={styles.phoneBlock}>
        <div className={styles.phoneLabel}>{T.phoneLabel}</div>
        <div className={styles.phoneNumbers}>
          {phones.map((p, i) => (
            <span key={p}>
              <a href={`tel:${p.replace(/\s+/g, "")}`}>{p}</a>
              {i < phones.length - 1 && <br />}
            </span>
          ))}
        </div>
      </div>

      {/* ── Get in Touch CTA (top-right, right=358.5) ────────────────────── */}
      <div className={styles.ctaButton}>
        <BUTTON1
          property1="Default"
          cONTACTUS={T.cta}
          showBUTTON
          bUTTONBackgroundColor="#feae00"
          bUTTONWidth="171px"
          bUTTONBorder="none"
          bUTTONAlignSelf="unset"
          cONTACTUSColor="#000"
          cONTACTUSTextTransform="unset"
          onClick={() => open()}
        />
      </div>

      {/* ── Menu links (left middle) ─────────────────────────────────────── */}
      <nav className={styles.menuLinks}>
        <Link to="/catalog" className={styles.menuLink}>{T.menu.catalog}</Link>
        <Link to="/calculator" className={styles.menuLink}>{T.menu.calculator}</Link>
        <Link to="/about" className={styles.menuLink}>{T.menu.about}</Link>
        <Link to="/blog" className={styles.menuLink}>{T.menu.blog}</Link>
      </nav>

      {/* ── Address column — left=958, working hours bottom=466.55 ───────── */}
      <div className={styles.addressColumn}>
        <div className={styles.addressLabel}>{T.addressLabel}</div>
        <h2 className={styles.addressLines}>
          {addresses.map((a, i) => (
            <span key={`${a}-${i}`}>{a}</span>
          ))}
        </h2>
        <div className={styles.workingHours}>
          {T.workingHours}: {workingHours}
        </div>
      </div>

      {/* ── Viber column — left=958, icon bottom=301 ─────────────────────── */}
      {showViber && (
        <div className={styles.viberColumn}>
          <div className={styles.viberLabel}>{viberLabel}</div>
          <a
            href={viber.url}
            aria-label="Viber community"
            target="_blank"
            rel="noreferrer noopener"
            data-testid="footer-viber-link"
            className={styles.viberIconLink}
          >
            <img
              className={styles.viberIcon}
              width={45}
              height={45}
              sizes="100vw"
              alt=""
              src="/figma/basil-viber-outline.svg"
            />
          </a>
        </div>
      )}

      {/* ── Social media — right=358.5, bottom=301 ───────────────────────── */}
      <div className={styles.socialColumn}>
        <div className={styles.socialLabel}>{T.socialLabel}</div>
        <div className={styles.socialIconsRow}>
          {socialUrl("instagram") && (
            <a
              href={socialUrl("instagram")}
              target="_blank"
              rel="noreferrer noopener"
              aria-label="Instagram"
              data-testid="footer-social-instagram"
            >
              <img
                className={styles.socialIcon}
                loading="lazy"
                width={32}
                height={32}
                sizes="100vw"
                alt=""
                src="/figma/ri-instagram-line.svg"
              />
            </a>
          )}
          {socialUrl("facebook") && (
            <a
              href={socialUrl("facebook")}
              target="_blank"
              rel="noreferrer noopener"
              aria-label="Facebook"
              data-testid="footer-social-facebook"
            >
              <img
                className={styles.socialIcon}
                loading="lazy"
                width={32}
                height={32}
                sizes="100vw"
                alt=""
                src="/figma/ic-twotone-facebook.svg"
              />
            </a>
          )}
          {socialUrl("telegram") && (
            <a
              href={socialUrl("telegram")}
              target="_blank"
              rel="noreferrer noopener"
              aria-label="Telegram"
              data-testid="footer-social-telegram"
            >
              <img
                className={styles.socialIcon}
                loading="lazy"
                width={32}
                height={32}
                sizes="100vw"
                alt=""
                src="/figma/ic-round-telegram.svg"
              />
            </a>
          )}
        </div>
      </div>

      {/* ── Registration address — left=958, bottom=142.24 ───────────────── */}
      <div
        className={styles.registrationBlock}
        data-testid="footer-registration-address"
      >
        <div>{T.registrationLabel}</div>
        <div>{registrationAddress}</div>
      </div>

      {/* ── Bottom legal bar ─────────────────────────────────────────────── */}
      <footer className={styles.footerBottom}>
        <div className={styles.copyrightInfo}>
          <img
            className={styles.antDesigncopyrightCircleOuIcon}
            width={18}
            height={18}
            sizes="100vw"
            alt=""
            src="/figma/ant-design-copyright-circle-outlined.svg"
          />
          <div className={styles.allRightReserved}>2026. {T.copyright}</div>
        </div>
        <div className={styles.companyInfo}>
          <div className={styles.vatBg206637283Parent}>
            <div className={styles.conditions}>VAT BG206637283</div>
            <div className={styles.conditions}>ID 206637283</div>
            <div className={styles.pmAutoGroup}>PM AUTO GROUP LTD</div>
            <div className={styles.policyLinks}>
              <button
                type="button"
                className={`${styles.conditions} ${styles.policyLinkBtn}`}
                onClick={() => openPolicy("conditions")}
                data-testid="footer-policy-conditions"
              >
                {T.conditions}
              </button>
              <button
                type="button"
                className={`${styles.conditions} ${styles.policyLinkBtn}`}
                onClick={() => openPolicy("privacy")}
                data-testid="footer-policy-privacy"
              >
                {T.privacy}
              </button>
              <button
                type="button"
                className={`${styles.conditions} ${styles.policyLinkBtn}`}
                onClick={() => openPolicy("cookies")}
                data-testid="footer-policy-cookies"
              >
                {T.cookies}
              </button>
            </div>
          </div>
        </div>
        <div className={styles.websiteCredits}>
          <a
            href="https://www.olhalazarieva.com"
            target="_blank"
            rel="noreferrer noopener"
            className={styles.websiteDesign}
            data-testid="footer-credit-design"
          >
            {T.credit}
          </a>
        </div>
      </footer>
    </section>
  );
};

export default Footer1;
