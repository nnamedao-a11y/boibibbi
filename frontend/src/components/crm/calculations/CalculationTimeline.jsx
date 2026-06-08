/**
 * P2.7 — Inline timeline for a single calc.
 * GET /api/calculations/{id}/timeline (chronological events: created, status,
 * comments, deal events, child versions).
 */
import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { API_URL } from '../../../App';
import { useLang } from '../../../i18n';
import {
  Plus, Clock, ChatCircleText, ArrowRight, CheckCircle, FileText,
} from '@phosphor-icons/react';

const KIND_ICON = {
  created:    Plus,
  status:     ArrowRight,
  comment:    ChatCircleText,
  deal_event: CheckCircle,
  version:    FileText,
};
const KIND_COLOR = {
  created:    '#4F46E5',
  status:     '#0EA5E9',
  comment:    '#71717A',
  deal_event: '#16A34A',
  version:    '#B45309',
};

const fmtTime = (iso) => { try { return new Date(iso).toLocaleString(); } catch { return iso || ''; } };

export default function CalculationTimeline({ calcId }) {
  const { t } = useLang();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!calcId) return;
      setLoading(true);
      try {
        const res = await axios.get(`${API_URL}/api/calculations/${calcId}/timeline`);
        if (!cancelled) setItems(res.data?.items || []);
      } catch { /* fail-soft */ }
      finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [calcId]);

  return (
    <div className="space-y-1.5" data-testid="calc-timeline">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-[#71717A]">
        <Clock size={14} /> Timeline ({items.length})
      </div>
      {loading && <div className="text-xs text-[#A1A1AA]">{t('cmp_loading')}</div>}
      {!loading && items.length === 0 && <div className="text-xs text-[#A1A1AA] italic">{t('cmp_no_events')}</div>}
      <ol className="relative border-l border-[#E4E4E7] pl-4 space-y-2.5 max-h-72 overflow-y-auto">
        {items.map((e, i) => {
          const Icon = KIND_ICON[e.kind] || Clock;
          const colour = KIND_COLOR[e.kind] || '#71717A';
          return (
            <li key={i} className="relative" data-testid={`timeline-event-${i}`}>
              <span className="absolute -left-[22px] top-0 w-5 h-5 rounded-full flex items-center justify-center"
                    style={{ backgroundColor: colour }}>
                <Icon size={11} color="white" weight="bold" />
              </span>
              <div className="flex items-center gap-2 text-xs text-[#71717A]">
                <span className="font-semibold text-[#18181B]">{e.label}</span>
                <span>·</span>
                <span>{fmtTime(e.at)}</span>
                <span>·</span>
                <span>{e.by}</span>
              </div>
              {e.detail && (
                <div className="text-xs text-[#52525B] mt-0.5 whitespace-pre-wrap">
                  {typeof e.detail === 'string' ? e.detail : JSON.stringify(e.detail)}
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
