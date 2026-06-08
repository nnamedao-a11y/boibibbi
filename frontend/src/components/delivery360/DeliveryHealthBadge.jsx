import React from 'react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip';

/**
 * Wave 13 — Delivery Health Badge
 *
 *  on_track   — green   — score >= 80
 *  delay_risk — amber   — score >= 60
 *  delayed    — orange  — score >= 40
 *  critical   — red     — score <  40
 *  delivered  — navy    — terminal positive
 *  cancelled  — zinc    — terminal negative
 */
export const DELIVERY_HEALTH_CFG = {
  on_track:   { label: 'Delivery · On track',   cls: 'bg-emerald-50 text-emerald-700 border-emerald-200', dot: '#10B981' },
  delay_risk: { label: 'Delivery · Delay risk', cls: 'bg-amber-50 text-amber-800 border-amber-200',       dot: '#F59E0B' },
  delayed:    { label: 'Delivery · Delayed',    cls: 'bg-orange-50 text-orange-800 border-orange-200',    dot: '#EA580C' },
  critical:   { label: 'Delivery · Critical',   cls: 'bg-red-50 text-red-700 border-red-200',             dot: '#DC2626' },
  delivered:  { label: 'Delivery · Delivered',  cls: 'bg-sky-50 text-sky-700 border-sky-200',             dot: '#0284C7' },
  cancelled:  { label: 'Delivery · Cancelled',  cls: 'bg-zinc-100 text-zinc-700 border-zinc-200',         dot: '#71717A' },
};

const SIZE = {
  sm: { px: 'px-1.5 py-0.5', text: 'text-[10px]' },
  md: { px: 'px-2 py-0.5',   text: 'text-[11px]' },
  lg: { px: 'px-2.5 py-1',   text: 'text-xs' },
};

const DeliveryHealthBadge = ({ health, size = 'md', testId }) => {
  if (!health || !health.segment) return null;
  const cfg = DELIVERY_HEALTH_CFG[health.segment] || DELIVERY_HEALTH_CFG.on_track;
  const s   = SIZE[size] || SIZE.md;
  const score = typeof health.score === 'number' ? health.score : null;
  const reasons = Array.isArray(health.reasons) ? health.reasons : [];
  const metrics = health.metrics || {};

  const inner = (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border font-semibold uppercase tracking-wider ${cfg.cls} ${s.px} ${s.text}`}
      data-testid={testId || `del-health-${health.segment}`}
    >
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: cfg.dot }} />
      {cfg.label}
      {score != null ? <span className="tabular-nums opacity-70">{score}</span> : null}
    </span>
  );

  if (reasons.length === 0 && !metrics.current_milestone) return inner;

  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild><span>{inner}</span></TooltipTrigger>
        <TooltipContent
          side="bottom"
          align="start"
          className="max-w-xs bg-white border border-[#E4E4E7] rounded-lg shadow-lg p-3"
        >
          <div className="text-[11px] font-bold uppercase tracking-wider text-[#52525B] mb-1.5">
            Delivery Health · {score != null ? `${score} / 100` : cfg.label}
          </div>
          {metrics.current_milestone ? (
            <div className="text-[12px] text-[#52525B] mb-1">
              Stage: <span className="font-semibold text-[#18181B]">{(metrics.current_milestone || '').replace(/_/g, ' ')}</span>
              {' · '}
              {metrics.milestones_done}/{metrics.milestones_total} done
            </div>
          ) : null}
          {typeof metrics.eta_variance_days === 'number' ? (
            <div className="text-[12px] text-[#52525B] mb-1">
              ETA variance: <span className={`font-semibold tabular-nums ${metrics.eta_variance_days > 0 ? 'text-red-700' : 'text-emerald-700'}`}>{metrics.eta_variance_days > 0 ? '+' : ''}{metrics.eta_variance_days}d</span>
            </div>
          ) : null}
          {reasons.length > 0 ? (
            <ul className="space-y-0.5 mt-1">
              {reasons.map((r, i) => (
                <li key={i} className="text-[12px] text-[#18181B] flex items-start gap-1.5">
                  <span className="text-[#A1A1AA] mt-0.5">•</span>
                  <span>{r}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};

export default DeliveryHealthBadge;
