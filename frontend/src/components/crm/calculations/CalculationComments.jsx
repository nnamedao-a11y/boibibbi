/**
 * P2.7 — Calculation comments.
 * Manager can post internal (manager-only) or shared (visible in public quote) notes.
 * Endpoints:
 *   GET  /api/calculations/{id}/comments   (role-filtered)
 *   POST /api/calculations/{id}/comments   (manager+)
 */
import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { API_URL } from '../../../App';
import { ChatCircleText, Lock, Globe, PaperPlaneRight } from '@phosphor-icons/react';
import { useLang } from '../../../i18n';

const fmtTime = (iso) => {
  if (!iso) return '';
  try { return new Date(iso).toLocaleString(); } catch { return iso; }
};

export default function CalculationComments({ calcId }) {
  const { t } = useLang();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState('');
  const [visibility, setVisibility] = useState('internal');
  const [posting, setPosting] = useState(false);

  const load = useCallback(async () => {
    if (!calcId) return;
    setLoading(true);
    try {
      const res = await axios.get(`${API_URL}/api/calculations/${calcId}/comments`);
      setItems(res.data?.items || []);
    } catch { /* fail-soft */ }
    finally { setLoading(false); }
  }, [calcId]);

  useEffect(() => { load(); }, [load]);

  const submit = async () => {
    const t = text.trim();
    if (!t) return;
    setPosting(true);
    try {
      const res = await axios.post(`${API_URL}/api/calculations/${calcId}/comments`, { text: t, visibility });
      if (res.data?.comment) {
        setItems((prev) => [...prev, res.data.comment]);
        setText('');
        toast.success(visibility === 'shared' ? 'Posted (visible to client)' : 'Posted (internal)');
      }
    } catch (err) {
      const msg = err?.response?.data?.detail || err.message;
      toast.error(`Comment failed: ${msg}`);
    } finally { setPosting(false); }
  };

  return (
    <div className="space-y-2" data-testid="calc-comments">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-[#71717A]">
        <ChatCircleText size={14} /> Comments ({items.length})
      </div>

      <div className="space-y-1.5 max-h-64 overflow-y-auto">
        {loading && <div className="text-xs text-[#A1A1AA]">{t('cmp_loading')}</div>}
        {!loading && items.length === 0 && <div className="text-xs text-[#A1A1AA] italic">{t('cmp_no_comments_yet')}</div>}
        {items.map((c) => (
          <div key={c.id}
               className={`p-2 rounded text-sm border ${c.visibility === 'shared' ? 'bg-[#FFFBEB] border-[#FDE68A]' : 'bg-[#F9FAFB] border-[#E5E7EB]'}`}
               data-testid={`comment-${c.id}`}>
            <div className="flex items-center gap-2 text-xs text-[#71717A] mb-1">
              <span className="font-semibold text-[#18181B]">{c.author_name || 'Manager'}</span>
              <span>·</span>
              <span>{fmtTime(c.created_at)}</span>
              <span>·</span>
              {c.visibility === 'shared'
                ? <span className="inline-flex items-center gap-1 text-[#B45309]"><Globe size={12} /> shared with client</span>
                : <span className="inline-flex items-center gap-1 text-[#71717A]"><Lock size={12} /> internal</span>}
            </div>
            <div className="text-[#18181B] whitespace-pre-wrap">{c.text}</div>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-1.5 border-t border-[#E4E4E7] pt-2">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={2}
          placeholder={t('cmp_note_for_the_team_or_for_the_client')}
          className="w-full px-2 py-1.5 border border-[#D4D4D8] rounded text-sm focus:outline-none focus:ring-1 focus:ring-[#4F46E5]"
          data-testid="comment-input"
        />
        <div className="flex items-center justify-between gap-2">
          <label className="flex items-center gap-1.5 text-xs text-[#71717A]">
            <input type="radio" checked={visibility === 'internal'} onChange={() => setVisibility('internal')} />
            <Lock size={12} /> {t('cmp_internal')}
            <input type="radio" className="ml-3" checked={visibility === 'shared'} onChange={() => setVisibility('shared')} />
            <Globe size={12} /> {t('cmp_shared_with_client')}
          </label>
          <button
            onClick={submit}
            disabled={posting || !text.trim()}
            className="px-3 py-1.5 text-sm font-semibold rounded bg-[#4F46E5] text-white hover:bg-[#3730A3] disabled:opacity-50 flex items-center gap-1.5"
            data-testid="comment-submit"
          >
            <PaperPlaneRight size={14} /> {t('cmp_post')}
          </button>
        </div>
      </div>
    </div>
  );
}
