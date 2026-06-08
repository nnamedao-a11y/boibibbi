import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import styles from './ShareModal.module.css';
import { userEngagementApi } from '../../lib/api';

/**
 * ShareModal — opens from the SingleCarPage header "Share" icon.
 *
 * Dark single-car theme, no gradients, native shadcn-equivalent components.
 *
 * Flow:
 *   1. On mount, POST /api/shares with vin + snapshot → server returns a
 *      canonical shareUrl (`/cars/<VIN>?share=<id>`) + persists the share
 *      so the customer can later see it in `/cabinet/:id/shared`.
 *   2. User can copy the link or open one of three social channels
 *      (Facebook, Viber, Telegram). Each social click increments a fresh
 *      share record with the channel attribution.
 *
 * Props:
 *   open       — boolean
 *   onClose    — () => void
 *   vin        — car VIN (required)
 *   snapshot   — { title, image, price, currency, lot_number, auction_name,
 *                  odometer, odometer_unit, year, make, model, description }
 */
const FB = (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
    <path d="M22 12.06C22 6.5 17.52 2 12 2S2 6.5 2 12.06c0 5.02 3.66 9.18 8.44 9.94v-7.03H7.9v-2.91h2.54V9.85c0-2.51 1.49-3.9 3.78-3.9 1.09 0 2.24.2 2.24.2v2.47h-1.26c-1.24 0-1.63.77-1.63 1.56v1.88h2.78l-.44 2.91h-2.34V22c4.78-.76 8.43-4.92 8.43-9.94z" />
  </svg>
);
const VIBER = (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
    <path d="M18.66 5.34a8.94 8.94 0 0 0-13.32 0 9.07 9.07 0 0 0-1.94 6.04c.04 1.57.58 3.04 1.52 4.27v3.83l3.6-1.16c1.04.53 2.2.83 3.4.83 5.05 0 9.12-4.08 9.12-9.12 0-2.46-.99-4.77-2.38-6.7zm-1.21 7.96c-.21.6-.97 1.16-1.62 1.3-.45.1-1.03.18-3-.62-2.55-1.05-4.18-3.66-4.31-3.83-.13-.18-1.03-1.37-1.03-2.61s.65-1.85.88-2.11c.23-.26.5-.32.67-.32.16 0 .33 0 .47.01.16.01.36-.06.56.43.21.51.71 1.76.77 1.89.06.13.1.28.02.45-.08.18-.13.28-.26.43-.13.16-.27.34-.39.46-.13.13-.27.27-.12.52.16.26.7 1.15 1.5 1.86 1.03.91 1.9 1.2 2.16 1.32.26.13.41.11.56-.06.16-.16.65-.75.82-1.01.17-.26.34-.21.57-.13.23.09 1.47.7 1.72.82.26.13.43.19.49.3.06.1.06.61-.15 1.2zm-5.2-9.5c.16 0 1.93.13 3.36 1.55a4.62 4.62 0 0 1 1.37 3.36" stroke="currentColor" stroke-width="0.8" fill="none" stroke-linecap="round"/>
  </svg>
);
const TG = (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
    <path d="M9.78 18.65l.28-4.23 7.68-6.92c.34-.31-.07-.46-.52-.19L7.74 13.24 3.64 11.95c-.88-.25-.89-.86.2-1.3l15.97-6.16c.73-.33 1.43.18 1.15 1.3l-2.72 12.81c-.19.91-.74 1.13-1.5.71L12.6 16.3l-1.99 1.93c-.23.23-.42.42-.83.42z" />
  </svg>
);

function fmtPrice(price, currency) {
  if (price == null || price === '') return null;
  const num = typeof price === 'number' ? price : parseFloat(String(price).replace(/[^\d.]/g, ''));
  if (!Number.isFinite(num) || num <= 0) return null;
  const cur = (currency || 'EUR').toUpperCase();
  const sym = cur === 'EUR' ? '€' : cur === 'USD' ? '$' : `${cur} `;
  return `${sym}${Math.round(num).toLocaleString('en-US')}`;
}

function buildShortDescription(snap) {
  if (!snap) return '';
  if (snap.description) return String(snap.description).slice(0, 160);
  const parts = [];
  if (snap.year) parts.push(snap.year);
  if (snap.make) parts.push(String(snap.make));
  if (snap.model) parts.push(String(snap.model));
  if (snap.trim) parts.push(String(snap.trim));
  let head = parts.join(' ');
  if (!head && snap.title) head = String(snap.title);
  const extras = [];
  if (snap.odometer) extras.push(`${Number(snap.odometer).toLocaleString('en-US')} ${snap.odometer_unit || 'mi'}`);
  if (snap.auction_name) extras.push(snap.auction_name);
  const price = fmtPrice(snap.price, snap.currency);
  if (price) extras.push(price);
  return `${head}${extras.length ? ' — ' + extras.join(' · ') : ''}`.trim().slice(0, 200);
}

const ShareModal = ({ open, onClose, vin, snapshot }) => {
  const [shareUrl, setShareUrl] = useState('');
  const [shareId, setShareId] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);
  const linkInputRef = useRef(null);
  const requestedRef = useRef(false);

  const title = snapshot?.title || [snapshot?.year, snapshot?.make, snapshot?.model].filter(Boolean).join(' ') || vin;
  const price = fmtPrice(snapshot?.price, snapshot?.currency);
  const description = useMemo(() => buildShortDescription(snapshot), [snapshot]);

  /* Create the canonical share record on first open. Anonymous-friendly. */
  const ensureShare = useCallback(async (channel) => {
    if (!vin) return null;
    setCreating(true);
    setError(null);
    try {
      const payload = {
        vin,
        channel: channel || 'copy',
        snapshot: {
          title: snapshot?.title,
          make: snapshot?.make,
          model: snapshot?.model,
          year: snapshot?.year,
          trim: snapshot?.trim,
          price: snapshot?.price,
          currency: snapshot?.currency,
          image: snapshot?.image,
          lot_number: snapshot?.lot_number,
          auction_name: snapshot?.auction_name,
          odometer: snapshot?.odometer,
          odometer_unit: snapshot?.odometer_unit,
          description: snapshot?.description,
        },
        sourcePage: typeof window !== 'undefined' ? window.location.pathname : '',
      };
      const data = await userEngagementApi.shares.create(payload);
      // Prefer client-side absolute URL (origin + path returned) so social
      // unfurl crawlers can always resolve it.
      let url = data?.shareUrl || '';
      if (url && url.startsWith('/') && typeof window !== 'undefined') {
        url = `${window.location.origin}${url}`;
      } else if (!url && typeof window !== 'undefined') {
        url = `${window.location.origin}/cars/${vin}`;
      }
      setShareUrl(url);
      setShareId(data?.id || '');
      return { url, data };
    } catch (e) {
      // Anonymous shares allowed server-side — but if the endpoint completely
      // failed (network), fall back to a client-side URL so the user can
      // still copy + share.
      const fallback = typeof window !== 'undefined'
        ? `${window.location.origin}/cars/${vin}`
        : `/cars/${vin}`;
      setShareUrl(fallback);
      setError(e?.message || 'Sharing service is offline — using direct car URL.');
      return { url: fallback, data: null };
    } finally {
      setCreating(false);
    }
  }, [vin, snapshot]);

  useEffect(() => {
    if (open && vin && !requestedRef.current) {
      requestedRef.current = true;
      ensureShare('copy');
    }
    if (!open) {
      requestedRef.current = false;
      setCopied(false);
      setError(null);
    }
  }, [open, vin, ensureShare]);

  /* ESC closes the modal */
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') onClose && onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  /* Focus + select the link when ready (so Cmd-C just works) */
  useEffect(() => {
    if (shareUrl && linkInputRef.current) {
      try { linkInputRef.current.select(); } catch (_) {}
    }
  }, [shareUrl]);

  const handleCopy = useCallback(async () => {
    if (!shareUrl) return;
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(shareUrl);
      } else if (linkInputRef.current) {
        linkInputRef.current.select();
        document.execCommand('copy');
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
      // Best-effort: log a copy channel record too (only if first record was copy too — avoid dup).
    } catch (_) {
      setError('Browser blocked clipboard access — please copy manually.');
    }
  }, [shareUrl]);

  const openChannel = useCallback(async (channel) => {
    let urlForChannel = shareUrl;
    if (!urlForChannel) {
      const r = await ensureShare(channel);
      urlForChannel = r?.url || '';
    } else {
      // Fire-and-forget: record this channel share too. Don't await the
      // network round-trip — opening the social window is the priority.
      ensureShare(channel).catch(() => {});
    }
    if (!urlForChannel) return;
    const encodedUrl = encodeURIComponent(urlForChannel);
    const encodedTitle = encodeURIComponent(title);
    const encodedText = encodeURIComponent(`${title}${description ? ' — ' + description : ''}\n`);
    let target = '';
    if (channel === 'facebook') {
      target = `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}&quote=${encodedTitle}`;
    } else if (channel === 'viber') {
      // viber://forward is the universal mobile deeplink; for desktop fall back to web share.
      target = `viber://forward?text=${encodedText}${encodedUrl}`;
    } else if (channel === 'telegram') {
      target = `https://t.me/share/url?url=${encodedUrl}&text=${encodedText}`;
    }
    if (target) {
      try {
        window.open(target, '_blank', 'noopener,noreferrer,width=720,height=620');
      } catch (_) {
        window.location.href = target;
      }
    }
  }, [shareUrl, title, description, ensureShare]);

  if (!open) return null;

  /* Render through a React Portal so the modal mounts directly to
   * <body>.  This avoids being clipped/transformed by any ancestor
   * with `overflow:hidden` or CSS `transform` (e.g. cards on the
   * Welcome page that wrap the share-button trigger). */
  const node = (
    <div className={styles.backdrop} role="dialog" aria-modal="true" aria-label="Share this car" onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()} data-testid="share-modal">
        <button type="button" className={styles.closeBtn} aria-label="Close" onClick={onClose}>×</button>

        <header className={styles.header}>
          <h3 className={styles.title}>Share this car</h3>
          <p className={styles.subtitle}>
            Send the link via Facebook, Viber, Telegram or copy it to share it on any other channel.
          </p>
        </header>

        <section className={styles.vehicleCard} aria-label="Car preview">
          <div className={styles.vehicleImageWrap}>
            {snapshot?.image ? (
              <img
                className={styles.vehicleImage}
                src={snapshot.image}
                alt={title}
                loading="lazy"
                onError={(e) => { e.currentTarget.style.display = 'none'; e.currentTarget.parentElement.classList.add(styles.vehicleImagePlaceholderShown); }}
              />
            ) : (
              <span className={styles.vehicleImagePlaceholder}>No image</span>
            )}
          </div>
          <div className={styles.vehicleInfo}>
            <h4 className={styles.vehicleTitle}>{title}</h4>
            <div className={styles.vehicleMeta}>
              {vin ? <span>VIN {vin}</span> : null}
              {snapshot?.lot_number ? <span>LOT {snapshot.lot_number}</span> : null}
              {snapshot?.auction_name ? <span>{String(snapshot.auction_name).toUpperCase()}</span> : null}
            </div>
            {price ? <div className={styles.vehiclePrice}>{price}</div> : null}
          </div>
        </section>

        <div className={styles.linkRow}>
          <input
            ref={linkInputRef}
            type="text"
            className={styles.linkInput}
            readOnly
            value={creating && !shareUrl ? 'Generating share link…' : (shareUrl || `${typeof window !== 'undefined' ? window.location.origin : ''}/cars/${vin}`)}
            data-testid="share-modal-link-input"
            onFocus={(e) => e.target.select()}
          />
          <button
            type="button"
            onClick={handleCopy}
            disabled={!shareUrl}
            className={[styles.copyBtn, copied ? styles.copyBtnCopied : ''].join(' ')}
            data-testid="share-modal-copy"
          >
            {copied ? '✓ Copied' : 'Copy link'}
          </button>
        </div>

        <div className={styles.channels} role="group" aria-label="Share via social">
          <button
            type="button"
            data-channel="facebook"
            className={styles.channelBtn}
            onClick={() => openChannel('facebook')}
            data-testid="share-modal-facebook"
          >
            <span className={styles.channelIcon}>{FB}</span>
            <span className={styles.channelLabel}>Facebook</span>
          </button>
          <button
            type="button"
            data-channel="viber"
            className={styles.channelBtn}
            onClick={() => openChannel('viber')}
            data-testid="share-modal-viber"
          >
            <span className={styles.channelIcon}>{VIBER}</span>
            <span className={styles.channelLabel}>Viber</span>
          </button>
          <button
            type="button"
            data-channel="telegram"
            className={styles.channelBtn}
            onClick={() => openChannel('telegram')}
            data-testid="share-modal-telegram"
          >
            <span className={styles.channelIcon}>{TG}</span>
            <span className={styles.channelLabel}>Telegram</span>
          </button>
        </div>

        {error ? (
          <div className={[styles.statusNote, styles.statusNoteError].join(' ')} role="status">{error}</div>
        ) : copied ? (
          <div className={[styles.statusNote, styles.statusNoteSuccess].join(' ')} role="status">Link copied to clipboard</div>
        ) : (
          <div className={styles.statusNote} aria-hidden="true">{description}</div>
        )}
      </div>
    </div>
  );

  /* Guard for SSR / very-early-render: only portal when document is
   * available (typeof window === 'undefined' would crash in Node). */
  if (typeof document === 'undefined') return null;
  return ReactDOM.createPortal(node, document.body);
};

export default ShareModal;
