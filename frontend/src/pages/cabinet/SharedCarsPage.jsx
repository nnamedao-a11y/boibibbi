/**
 * Shared Cars Page (Customer Cabinet)
 * -----------------------------------
 * /cabinet/:customerId/shared
 *
 * Lists every car the authenticated customer has shared from the
 * SingleCarPage Share modal (Facebook / Viber / Telegram / Copy-link).
 *
 * Backend: GET /api/shares/me, DELETE /api/shares/{shareId}.
 *
 * UI matches the BIBI cabinet light theme used by FavoritesPage —
 * white cards, neutral borders, amber accents.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import {
  ShareNetwork,
  Trash,
  Eye,
  CarSimple,
  Hash,
  Copy,
  CheckCircle,
  ArrowsClockwise,
} from '@phosphor-icons/react';

import { userEngagementApi } from '../../lib/api';
import { getLocale } from '../../i18n';

const fmtPrice = (v, currency) => {
  if (v == null || v === '') return null;
  const n = typeof v === 'number' ? v : parseFloat(String(v).replace(/[^\d.]/g, ''));
  if (!Number.isFinite(n) || n <= 0) return null;
  const sym = (String(currency || 'EUR').toUpperCase() === 'USD') ? '$' : '€';
  return `${sym}${Math.round(n).toLocaleString('en-US')}`;
};

const fmtDate = (s) => {
  if (!s) return '';
  try {
    return new Date(s).toLocaleDateString(getLocale(), { day: '2-digit', month: 'short', year: 'numeric' });
  } catch { return ''; }
};

const channelMeta = {
  facebook: { label: 'Facebook', color: 'bg-[#1877F2]/10 text-[#1877F2] ring-[#1877F2]/30' },
  viber:    { label: 'Viber',    color: 'bg-[#7360F2]/10 text-[#7360F2] ring-[#7360F2]/30' },
  telegram: { label: 'Telegram', color: 'bg-[#2AABEE]/10 text-[#2AABEE] ring-[#2AABEE]/30' },
  copy:     { label: 'Link',     color: 'bg-amber-100 text-amber-800 ring-amber-300' },
};

function CardSkeleton() {
  return (
    <div className="animate-pulse rounded-2xl bg-white border border-[#E4E4E7] overflow-hidden">
      <div className="aspect-[16/10] bg-[#F4F4F5]" />
      <div className="p-4 space-y-2">
        <div className="h-4 bg-[#F4F4F5] rounded w-3/4" />
        <div className="h-3 bg-[#F4F4F5] rounded w-1/2" />
        <div className="h-3 bg-[#F4F4F5] rounded w-2/3" />
      </div>
    </div>
  );
}

function ShareCard({ item, onRemove, onOpen, onCopy }) {
  const title =
    item.title ||
    [item.year, item.make, item.model, item.trim].filter(Boolean).join(' ') ||
    item.vin;
  const price = fmtPrice(item.price, item.currency);
  const created = fmtDate(item.createdAt);
  const meta = channelMeta[item.channel] || channelMeta.copy;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={{ duration: 0.2 }}
      className="group rounded-2xl bg-white border border-[#E4E4E7] hover:border-[#18181B] hover:shadow-md overflow-hidden transition-all"
      data-testid={`share-card-${item.id}`}
    >
      {/* Image */}
      <div className="relative aspect-[16/10] bg-[#F4F4F5] overflow-hidden cursor-pointer" onClick={onOpen}>
        {item.image ? (
          <img
            src={item.image}
            alt={title}
            loading="lazy"
            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
            onError={(e) => { e.currentTarget.style.display = 'none'; }}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-[#A1A1AA]">
            <CarSimple size={56} weight="duotone" />
          </div>
        )}

        {/* Top-left: channel chip */}
        <div className={`absolute top-2.5 left-2.5 inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-semibold ring-1 ${meta.color}`}>
          <ShareNetwork size={13} weight="bold" />
          {meta.label}
        </div>

        {/* Bottom-right: price */}
        {price ? (
          <div className="absolute bottom-2.5 right-2.5 px-2.5 py-1 rounded-md bg-amber-400 text-[#18181B] text-[12px] font-bold shadow">
            {price}
          </div>
        ) : null}
      </div>

      {/* Body */}
      <div className="p-4">
        <h3 className="text-[#18181B] font-semibold leading-tight line-clamp-1 group-hover:text-amber-600 transition-colors cursor-pointer" onClick={onOpen}>
          {title}
        </h3>
        <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[12px] text-[#71717A]">
          {item.vin ? (
            <span className="inline-flex items-center gap-1">
              <Hash size={12} className="text-amber-500" />
              <span className="font-mono">{item.vin}</span>
            </span>
          ) : null}
          {item.lot_number ? <span>LOT {item.lot_number}</span> : null}
          {item.auction_name ? <span>{String(item.auction_name).toUpperCase()}</span> : null}
        </div>
        {created ? <p className="mt-2 text-[11px] text-[#A1A1AA]">Shared: {created}</p> : null}

        {/* Link row */}
        {item.shareUrl ? (
          <div className="mt-3 flex items-center gap-2 rounded-md border border-[#E4E4E7] bg-[#FAFAFA] px-2.5 py-1.5">
            <span className="text-[11px] text-[#52525B] font-mono truncate flex-1">{item.shareUrl}</span>
            <button
              type="button"
              onClick={() => onCopy(item.shareUrl)}
              className="text-amber-600 hover:text-amber-700"
              title="Copy share link"
              data-testid={`share-copy-${item.id}`}
            >
              <Copy size={14} />
            </button>
          </div>
        ) : null}

        <div className="mt-3 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={onOpen}
            className="inline-flex items-center gap-1.5 text-sm text-[#18181B] hover:text-amber-600 font-medium"
            data-testid={`share-view-${item.id}`}
          >
            <Eye size={16} />
            Open car
          </button>
          <button
            type="button"
            onClick={() => onRemove(item)}
            className="inline-flex items-center gap-1.5 text-sm text-[#A1A1AA] hover:text-rose-500 transition-colors"
            data-testid={`share-trash-${item.id}`}
            title="Delete share record"
          >
            <Trash size={16} />
          </button>
        </div>
      </div>
    </motion.div>
  );
}

export default function SharedCarsPage() {
  const navigate = useNavigate();
  const { customerId } = useParams();

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const data = await userEngagementApi.shares.getMine();
      const arr = Array.isArray(data) ? data : [];
      setItems(arr);
    } catch (e) {
      console.error('[shared] fetch failed:', e);
      if (e?.status === 401 || e?.status === 403) {
        toast.error('Please sign in to view your shares');
        navigate('/cabinet/login');
        return;
      }
      toast.error('Could not load your shares — please try again later');
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [navigate]);

  useEffect(() => { fetchData(); }, [fetchData, reloadKey]);

  const handleRemove = useCallback(async (item) => {
    try {
      await userEngagementApi.shares.remove(item.id);
      setItems((prev) => prev.filter((x) => x.id !== item.id));
      toast.success('Share removed');
    } catch (e) {
      console.error('[shared] remove failed:', e);
      toast.error('Could not remove share');
    }
  }, []);

  const handleOpen = useCallback((item) => {
    if (item?.vin) navigate(`/cars/${encodeURIComponent(item.vin)}`);
  }, [navigate]);

  const handleCopy = useCallback(async (url) => {
    try {
      await navigator.clipboard.writeText(url);
      toast.success('Link copied');
    } catch {
      toast.error('Clipboard blocked');
    }
  }, []);

  return (
    <div className="p-4 md:p-6">
      <header className="flex items-center justify-between gap-3 mb-5">
        <div>
          <h1 className="text-[20px] md:text-[24px] font-bold text-[#18181B] flex items-center gap-2">
            <ShareNetwork size={24} weight="duotone" className="text-amber-500" />
            My shared cars
          </h1>
          <p className="mt-1 text-[13px] text-[#71717A]">
            Cars you have shared via Facebook, Viber, Telegram or copy-link.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setReloadKey((k) => k + 1)}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md border border-[#E4E4E7] bg-white text-[13px] text-[#18181B] hover:bg-[#F4F4F5]"
          data-testid="shared-refresh"
        >
          <ArrowsClockwise size={14} />
          Refresh
        </button>
      </header>

      {loading ? (
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => <CardSkeleton key={i} />)}
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[#E4E4E7] bg-white p-10 text-center">
          <ShareNetwork size={48} weight="duotone" className="text-amber-300 mx-auto" />
          <h2 className="mt-3 text-[16px] font-semibold text-[#18181B]">You haven't shared any cars yet</h2>
          <p className="mt-1 text-[13px] text-[#71717A]">
            Open any car from the catalog and tap the <strong>Share</strong> icon in the page header to send the listing to a friend.
          </p>
          <Link
            to="/catalog"
            className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 rounded-md bg-[#FEAE00] hover:bg-[#FFC233] text-[#1A1A1A] text-[13px] font-semibold"
            data-testid="shared-empty-cta"
          >
            <CheckCircle size={14} weight="bold" />
            Browse catalog
          </Link>
        </div>
      ) : (
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
          <AnimatePresence mode="popLayout">
            {items.map((it) => (
              <ShareCard
                key={it.id}
                item={it}
                onRemove={handleRemove}
                onOpen={() => handleOpen(it)}
                onCopy={handleCopy}
              />
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
