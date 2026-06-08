import React, { useState } from 'react';
import { Check, Circle, Truck, MapPin, Package, ShieldCheck, Boat, Warehouse, Flag } from '@phosphor-icons/react';
import { toast } from 'sonner';
import axios from 'axios';
import { API_URL } from '../../App';

const MILESTONE_ICON = {
  auction_won:        Flag,
  payment_confirmed:  ShieldCheck,
  picked_up:          Truck,
  port_arrived:       Warehouse,
  loaded:             Package,
  in_transit:         Boat,
  customs:            ShieldCheck,
  ready_for_delivery: MapPin,
  delivered:          Check,
};

const fmtDate = (iso) => {
  if (!iso) return null;
  try {
    const d = new Date(iso);
    return d.toLocaleString();
  } catch { return null; }
};

const nextOf = (timeline) => {
  const currentIdx = timeline.findIndex((m) => m.status === 'current');
  if (currentIdx === -1) {
    // Pick first pending
    return timeline.find((m) => m.status === 'pending') || null;
  }
  return timeline[currentIdx];
};

const ShipmentTimeline = ({ shipmentId, timeline = [], onChanged }) => {
  const [busy, setBusy] = useState(null);
  const current = nextOf(timeline);

  const advance = async (key) => {
    if (!shipmentId) return;
    setBusy(key);
    try {
      await axios.post(`${API_URL}/api/delivery/${shipmentId}/milestone`, { key });
      toast.success(`Milestone “${key.replace(/_/g, ' ')}” recorded`);
      onChanged?.();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to add milestone');
    } finally { setBusy(null); }
  };

  return (
    <div className="bg-white border border-[#E4E4E7] rounded-2xl p-4" data-testid="shipment-timeline">
      <div className="flex items-center justify-between mb-3">
        <div className="text-[11px] uppercase tracking-wider font-bold text-[#71717A]">Shipment timeline</div>
        {current && current.status !== 'done' ? (
          <button
            disabled={busy === current.key}
            onClick={() => advance(current.key)}
            className="inline-flex items-center gap-1.5 text-[12px] font-semibold rounded-full bg-[#18181B] text-white px-3 py-1 hover:bg-[#27272A] disabled:opacity-60"
            data-testid="timeline-advance"
          >
            Mark current done
          </button>
        ) : null}
      </div>

      <ol className="relative">
        {/* connector spine */}
        <span className="absolute left-[15px] top-1 bottom-1 w-px bg-[#E4E4E7]" />
        {timeline.map((m, idx) => {
          const Icon = MILESTONE_ICON[m.key] || Circle;
          const done    = m.status === 'done';
          const isCurrent = m.status === 'current';
          const ring = done
            ? 'bg-emerald-600 text-white border-emerald-600'
            : isCurrent
            ? 'bg-white text-amber-700 border-amber-500 ring-4 ring-amber-100'
            : 'bg-white text-[#A1A1AA] border-[#E4E4E7]';
          return (
            <li key={m.key || idx} className="relative pl-10 pb-4 last:pb-0" data-testid={`timeline-row-${m.key}`}>
              <div className={`absolute left-0 top-0 w-8 h-8 rounded-full border-2 flex items-center justify-center ${ring}`}>
                <Icon size={14} weight={done ? 'bold' : 'regular'} />
              </div>
              <div className="flex items-baseline gap-2 flex-wrap">
                <div className={`text-[13px] font-semibold ${done ? 'text-[#18181B]' : isCurrent ? 'text-amber-800' : 'text-[#71717A]'}`}>
                  {m.label || m.key.replace(/_/g, ' ')}
                </div>
                {done && m.at ? <div className="text-[11px] text-[#71717A]">· {fmtDate(m.at)}</div> : null}
                {isCurrent ? <span className="text-[10px] uppercase font-bold tracking-wider text-amber-700">in progress</span> : null}
              </div>
              {m.by ? <div className="text-[11px] text-[#A1A1AA]">by {m.by}</div> : null}
              {m.note ? <div className="text-[12px] text-[#52525B] mt-0.5">{m.note}</div> : null}
              {!done && !isCurrent ? (
                <button
                  disabled={busy === m.key}
                  onClick={() => advance(m.key)}
                  className="mt-1 text-[11px] text-[#52525B] hover:text-[#18181B] underline underline-offset-2 disabled:opacity-60"
                  data-testid={`timeline-mark-${m.key}`}
                >
                  mark done
                </button>
              ) : null}
            </li>
          );
        })}
      </ol>
    </div>
  );
};

export default ShipmentTimeline;
