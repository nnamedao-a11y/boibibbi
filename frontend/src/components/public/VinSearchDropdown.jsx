/**
 * VinSearchDropdown — typeahead/autocomplete for VIN or lot-number search.
 *
 * Used by:
 *   • Public header (figma_home/components/header1.jsx)
 *   • Welcome page "Calculate a car yourself" hero (figma_home/components/frame-component22.jsx)
 *
 * Behaviour:
 *   • Debounces input (320 ms) and queries `/api/public/search/suggest?q=<q>`
 *     (LIVE BidMotors search + stale-DB fallback inside backend `vin_service`).
 *   • Min 2 chars to fire — single character noise is filtered.
 *   • Each suggestion renders as a mini-card (image, title, lot/year, mileage, location);
 *     click navigates to /cars/<VIN> — the canonical SingleCarPage route.
 *   • Keyboard: ArrowUp/Down moves selection, Enter opens the highlighted item
 *     (or the first one if none highlighted), Escape closes the dropdown.
 *   • Click outside closes the dropdown without navigation.
 *   • Visual: dark-themed panel matching BIBI public site (Mazzard + #FEAE00 accents).
 *
 * The component is a thin overlay anchored to the wrapper provided by the parent,
 * so it doesn't disrupt the surrounding Figma-exact layout.
 */
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { useLang } from "../../i18n";
import "./VinSearchDropdown.css";

const API_URL = process.env.REACT_APP_BACKEND_URL || "";
const DEBOUNCE_MS = 320;
const MIN_LEN = 2;
const MAX_ITEMS = 8;

const fmtMileage = (n, unit) => {
  if (!n) return null;
  const num = typeof n === "number" ? n : parseInt(String(n).replace(/[^\d]/g, ""), 10);
  if (!Number.isFinite(num) || num <= 0) return null;
  const u = (unit || "km").toLowerCase() === "mi" ? "mi" : "km";
  return `${num.toLocaleString("en-US")} ${u}`;
};

const titleCase = (s) =>
  String(s || "")
    .toLowerCase()
    .replace(/\b([a-z])/g, (m) => m.toUpperCase())
    .replace(/\bUsa\b/g, "USA");

const fmtTitle = (it) => {
  if (it?.title) {
    const parts = it.title.split(/\s+/);
    const y = /^\d{4}$/.test(parts[0]) ? parts[0] : null;
    const rest = y ? parts.slice(1).join(" ") : it.title;
    return y ? `${y} ${titleCase(rest)}` : titleCase(rest);
  }
  return [it?.year, titleCase(it?.make || ""), titleCase(it?.model || "")].filter(Boolean).join(" ");
};

const VinSearchDropdown = ({
  query,
  open,
  onClose,
  onSelectQuery,
  align = "left",
  width = "100%",
  variant = "dark", // 'dark' | 'light'
}) => {
  const navigate = useNavigate();
  const { t } = useLang();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [hoverIdx, setHoverIdx] = useState(-1);
  const lastReqRef = useRef(0);
  const wrapperRef = useRef(null);

  /* ── Debounced fetch ─────────────────────────────────────────────── */
  useEffect(() => {
    const q = (query || "").trim();
    if (!open || q.length < MIN_LEN) {
      setItems([]);
      setError(null);
      setLoading(false);
      return undefined;
    }
    const reqId = ++lastReqRef.current;
    const t = setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const { data } = await axios.get(`${API_URL}/api/public/search/suggest`, {
          params: { q, limit: MAX_ITEMS },
          timeout: 8000,
        });
        if (lastReqRef.current !== reqId) return;
        const arr = Array.isArray(data?.items) ? data.items : [];
        setItems(arr.slice(0, MAX_ITEMS));
      } catch (e) {
        if (lastReqRef.current !== reqId) return;
        // Never set error to a non-string (e.g. Pydantic 422 detail array) — would crash React.
        const data = e?.response?.data;
        let msg = t("vinSearchUnavailable") || "Search unavailable. Please try again.";
        if (data) {
          if (typeof data === "string") msg = data;
          else if (Array.isArray(data?.detail)) {
            const m = data.detail.map((d) => (typeof d === "string" ? d : d?.msg)).filter(Boolean).join("; ");
            if (m) msg = m;
          } else if (typeof data?.detail === "string") msg = data.detail;
          else if (typeof data?.detail?.msg === "string") msg = data.detail.msg;
        } else if (typeof e?.message === "string") {
          msg = e.message;
        }
        setError(msg);
        setItems([]);
      } finally {
        if (lastReqRef.current === reqId) setLoading(false);
      }
    }, DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [query, open]);

  /* ── Reset selection when items refresh ─────────────────────────── */
  useEffect(() => { setHoverIdx(-1); }, [items]);

  /* ── Click outside closes ───────────────────────────────────────── */
  useEffect(() => {
    if (!open) return undefined;
    const handler = (e) => {
      if (!wrapperRef.current) return;
      if (!wrapperRef.current.contains(e.target)) onClose?.();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open, onClose]);

  /* ── Keyboard navigation forwarded by parent via window-level listener ─ */
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape") { onClose?.(); return; }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setHoverIdx((i) => Math.min((items.length - 1), (i < 0 ? 0 : i + 1)));
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setHoverIdx((i) => Math.max(0, i - 1));
      }
      if (e.key === "Enter") {
        const target = items[hoverIdx >= 0 ? hoverIdx : 0];
        if (target?.vin) {
          e.preventDefault();
          navigate(`/cars/${encodeURIComponent(target.vin)}`);
          onClose?.();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, items, hoverIdx, navigate, onClose]);

  const q = (query || "").trim();
  const visible = open && q.length >= MIN_LEN;
  const panelClass = useMemo(() => [
    "vinsd-panel",
    `vinsd-${variant}`,
    `vinsd-align-${align}`,
  ].join(" "), [variant, align]);

  if (!visible) return null;

  return (
    <div
      ref={wrapperRef}
      className={panelClass}
      style={{ width }}
      role="listbox"
      aria-label={t("vinSearchAria") || "VIN search suggestions"}
      data-testid="vin-search-dropdown"
    >
      {loading && (
        <div className="vinsd-state">
          <span className="vinsd-spinner" /> {t("vinSearchSearching") || "Searching auctions…"}
        </div>
      )}
      {!loading && error && (
        <div className="vinsd-state vinsd-state--error">{error}</div>
      )}
      {!loading && !error && items.length === 0 && (
        <div className="vinsd-state">
          {t("vinSearchNoMatchesPart1") || "No matches for"} <span className="vinsd-q">{q.toUpperCase()}</span>.{' '}
          {t("vinSearchNoMatchesPart2") || "Press Enter to open full lookup."}
        </div>
      )}
      {!loading && !error && items.length > 0 && (
        <ul className="vinsd-list">
          {items.map((it, idx) => {
            const subtitleBits = [
              it.lot_number && `${t("vinSearchLotPrefix") || "Lot"} ${it.lot_number}`,
              it.year,
              fmtMileage(it.odometer, it.odometer_unit),
              titleCase(it.location || ""),
            ].filter(Boolean);
            return (
              <li
                key={it.vin || idx}
                role="option"
                aria-selected={hoverIdx === idx}
                className={`vinsd-item${hoverIdx === idx ? " is-hover" : ""}`}
                onMouseEnter={() => setHoverIdx(idx)}
                onClick={() => {
                  if (!it.vin) return;
                  navigate(`/cars/${encodeURIComponent(it.vin)}`);
                  onClose?.();
                }}
                data-testid={`vin-suggestion-${it.vin || idx}`}
              >
                <div className="vinsd-thumb">
                  {it.image ? (
                    <img src={it.image} alt="" loading="lazy" onError={(e) => { e.currentTarget.style.visibility = "hidden"; }} />
                  ) : (
                    <span className="vinsd-thumb-fallback">VIN</span>
                  )}
                </div>
                <div className="vinsd-body">
                  <div className="vinsd-title">{fmtTitle(it)}</div>
                  <div className="vinsd-sub">{subtitleBits.join(" · ")}</div>
                  <div className="vinsd-vin">{it.vin}</div>
                </div>
                {it._src === "live" && <span className="vinsd-chip vinsd-chip--live">LIVE</span>}
                {it._src === "stale" && <span className="vinsd-chip vinsd-chip--stale">CACHE</span>}
              </li>
            );
          })}
        </ul>
      )}
      <div className="vinsd-footer">
        <button
          type="button"
          className="vinsd-cta"
          onClick={() => {
            if (q && onSelectQuery) {
              onSelectQuery(q);
            } else if (q) {
              navigate(`/vin/${encodeURIComponent(q)}`);
              onClose?.();
            }
          }}
        >
          {t("vinSearchOpenFullFor") || "Open full lookup for"} <strong>{q.toUpperCase()}</strong>
        </button>
      </div>
    </div>
  );
};

export default VinSearchDropdown;
