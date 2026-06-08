import { useState, useRef, useEffect, useLayoutEffect } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import BUTTON1 from "./b-u-t-t-o-n1";
import { useLang, PUBLIC_LANGUAGES } from "../../i18n";
import { useGetInTouch } from "../../components/public/GetInTouchModal";
import styles from "./frame-component17.module.css";

/**
 * Right-side controls of the header (language picker, profile icon, CONTACT US).
 *
 * Layout is taken VERBATIM from the Figma export (header1 family) so the
 * `header1.module.css` flex-end / margin trick keeps everything pixel-perfect.
 * Functionality wired on top WITHOUT changing the markup hierarchy:
 *   • ENG dropdown (EN / BG via LanguageContext)
 *   • Profile icon click → handler from parent
 *   • CONTACT US — opens the global "Reach Out To Us" modal (Get In Touch)
 *     directly, instead of navigating to /contacts. This matches the
 *     expected UX: a single-click path from any page header to the form.
 *     Falls back to /contacts#phone if the GetInTouchProvider is not in
 *     scope (defensive — shouldn't happen in production).
 */
const FrameComponent17 = ({ className = "", onProfileClick, onContactClick, isAuthed = false, customerName = "" }) => {
  const navigate = useNavigate();
  const { lang, changeLang, t } = useLang();
  const { open: openGetInTouch } = useGetInTouch();
  const [open, setOpen] = useState(false);
  const ddRef = useRef(null);
  const triggerRef = useRef(null);
  const [menuPos, setMenuPos] = useState({ top: 0, right: 8, width: 0 });

  // Recompute portal position whenever the dropdown opens, the window
  // resizes or the user scrolls. The header lives inside a transform-scaled
  // container (FigmaHomePage), so we rely solely on getBoundingClientRect
  // which already returns viewport coordinates after the scale.
  // The menu is right-aligned to the trigger so it never overlaps the
  // CONTACT US button that sits to the right of the language picker.
  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return undefined;
    const update = () => {
      const r = triggerRef.current.getBoundingClientRect();
      setMenuPos({
        top: r.bottom + window.scrollY + 6,
        right: Math.max(window.innerWidth - r.right - window.scrollX, 8),
        width: r.width,
      });
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const handler = (e) => {
      if (
        ddRef.current && !ddRef.current.contains(e.target) &&
        triggerRef.current && !triggerRef.current.contains(e.target)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const activeLabel = (() => {
    const l = PUBLIC_LANGUAGES.find((x) => x.code === lang);
    return l ? l.label : "ENG";
  })();

  const handleContactClick = () => {
    // Prefer the global "Get In Touch" modal — single-click path from any
    // page's header to the form. The parent's onContactClick (if passed)
    // wins so that callers can still override (analytics, custom presets).
    if (onContactClick) {
      onContactClick();
      return;
    }
    if (typeof openGetInTouch === "function") {
      openGetInTouch();
      return;
    }
    // Final fallback — navigate to the dedicated contacts page where the
    // "Reach Out To Us" button is visible.
    navigate("/contacts#phone");
  };

  return (
    <section className={[styles.languageSelectParent, className].join(" ")}>
      {/* Language selector — keeps original .languageSelect / .languageOptions
          flow. Dropdown is rendered via React Portal so the parent header's
          overflow:hidden does not clip it. */}
      <div className={styles.languageSelect} ref={triggerRef}>
        <div
          className={styles.languageOptions}
          onClick={() => setOpen((v) => !v)}
          role="button"
          tabIndex={0}
          aria-haspopup="listbox"
          aria-expanded={open}
          data-testid="header-language-toggle"
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setOpen((v) => !v); }
          }}
          style={{ cursor: "pointer", userSelect: "none" }}
        >
          <div className={styles.languageOption}>
            <div className={styles.eng}>{activeLabel}</div>
          </div>
          <img
            className={styles.lsicondownFilled}
            width={16}
            height={16}
            sizes="100vw"
            alt=""
            src="/figma/lsicon-down-filled.svg"
            style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform .15s" }}
          />
        </div>
      </div>
      {open && typeof document !== "undefined" && createPortal(
        <ul
          ref={ddRef}
          role="listbox"
          data-testid="header-language-menu"
          style={{
            position: "absolute",
            top: menuPos.top,
            right: menuPos.right,
            minWidth: 96,
            background: "#1d1d1b",
            border: "1px solid #2a2a28",
            borderRadius: 8,
            padding: 4,
            margin: 0,
            listStyle: "none",
            zIndex: 9999,
            boxShadow: "0 12px 28px rgba(0,0,0,0.45)",
            fontFamily: "var(--font-mazzard, system-ui, sans-serif)",
          }}
        >
          {PUBLIC_LANGUAGES.map((l) => {
            const active = l.code === lang;
            return (
              <li key={l.code}>
                <button
                  type="button"
                  onClick={() => { changeLang(l.code); setOpen(false); }}
                  data-testid={`header-language-option-${l.code}`}
                  title={l.name}
                  style={{
                    width: "100%",
                    textAlign: "left",
                    padding: "8px 12px",
                    background: active ? "#FEAE00" : "transparent",
                    color: active ? "#000" : "#E7E7E7",
                    border: 0,
                    borderRadius: 4,
                    cursor: "pointer",
                    fontFamily: "'Mazzard H', var(--font-mazzard, system-ui, sans-serif)",
                    fontSize: 14,            /* Mazzard H Regular 14 (matches trigger) */
                    fontWeight: 400,
                    lineHeight: "17px",
                    letterSpacing: 0,
                    textTransform: "uppercase",
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  {l.flag && <span style={{ fontSize: 14, lineHeight: 1 }}>{l.flag}</span>}
                  <span>{l.label}</span>
                </button>
              </li>
            );
          })}
        </ul>,
        document.body
      )}

      {/* Profile icon — wrapper kept exactly as exported (.iconamoonprofileLightWrapper).
          When the customer is signed in, we swap to the "authed" variant
          (filled amber silhouette + small green online dot). Tooltip shows
          the customer name so the user can tell the two states apart. */}
      <div
        className={styles.iconamoonprofileLightWrapper}
        onClick={() => onProfileClick && onProfileClick()}
        role="button"
        tabIndex={0}
        aria-label={isAuthed ? `Account — ${customerName || "signed in"}` : "Sign in"}
        title={isAuthed ? (customerName ? `Signed in as ${customerName}` : "Signed in") : "Sign in"}
        data-testid="header-profile-button"
        data-authed={isAuthed ? "true" : "false"}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onProfileClick && onProfileClick(); }
        }}
        style={{
          cursor: "pointer",
          position: "relative",
          borderRadius: "50%",
          transition: "filter 200ms ease, transform 200ms ease",
          ...(isAuthed ? { filter: "drop-shadow(0 0 6px rgba(254,174,0,0.45))" } : {}),
        }}
      >
        <img
          className={styles.iconamoonprofileLight}
          width={24}
          height={24}
          sizes="100vw"
          alt=""
          src={isAuthed ? "/figma/iconamoon-profile-authed.svg" : "/figma/iconamoon-profile-light.svg"}
        />
      </div>

      {/* CONTACT US action stack — preserves the original Figma column layout
          (one ghost outline button stacked on top of the solid yellow). */}
      <div className={styles.actionButtons}>
        <div
          className={styles.contactButtons}
          onClick={handleContactClick}
          role="button"
          tabIndex={0}
          data-testid="header-contact-us"
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") { e.preventDefault(); handleContactClick(); }
          }}
          style={{ cursor: "pointer" }}
        >
          <BUTTON1 property1="Default" cONTACTUS={t('contactUs') || 'CONTACT US'} showBUTTON />
        </div>
        <BUTTON1
          property1="Default"
          cONTACTUS={t('contactUs') || 'CONTACT US'}
          showBUTTON
          bUTTONBackgroundColor="#feae00"
          bUTTONBorder="unset"
          bUTTONAlignSelf="unset"
          cONTACTUSColor="#000"
          cONTACTUSTextTransform="unset"
          onClick={handleContactClick}
        />
      </div>
    </section>
  );
};

export default FrameComponent17;
