/**
 * P2.7 — Profitability widget (Teamlead / Admin only).
 *
 * Shows real BIBI revenue & margin after manager overrides. Server only sends
 * the `profitability` object to staff with role in {teamlead, admin}, so we
 * silently render nothing if it's absent.
 */
import React from 'react';
import { ChartLineUp, ShieldCheck, Warning } from '@phosphor-icons/react';
import { useLang } from '../../../i18n';

const fmt = (v, ccy = 'EUR') => {
  const sym = ccy === 'USD' ? '$' : '€';
  return `${sym}${Math.round(Number(v) || 0).toLocaleString()}`;
};

export default function CalculationProfitability({ calc }) {
  const { t } = useLang();
  const p = calc?.outputs?.profitability || calc?.profitability;
  if (!p) return null;

  const margin    = Number(p.controllableMargin || 0);
  const realCost  = Number(p.realCost || p.real_cost || 0);
  const netRev    = Number(p.netRevenue || p.net_revenue || 0);
  const total     = Number(p.total || calc?.outputs?.total || 0);
  const marginPct = Number(p.marginPercent || p.margin_percent || 0);
  const discount  = Number((calc?.overrides?.discount) || 0);

  const healthy = marginPct >= 5;

  return (
    <div className="rounded-lg border border-[#A7F3D0] bg-gradient-to-br from-[#ECFDF5] to-white p-4" data-testid="calc-profitability">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 text-sm font-bold text-[#065F46]">
          <ChartLineUp size={18} weight="duotone" />
          Profitability (teamlead / admin)
        </div>
        {healthy
          ? <span className="inline-flex items-center gap-1 text-xs font-semibold text-[#065F46] bg-[#A7F3D0] px-2 py-0.5 rounded"><ShieldCheck size={12} /> {t('cmp_healthy')}</span>
          : <span className="inline-flex items-center gap-1 text-xs font-semibold text-[#9F1239] bg-[#FECDD3] px-2 py-0.5 rounded"><Warning size={12} /> {t('cmp_low_margin')}</span>}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
        <Stat label={t('cmp_client_total')}        value={fmt(total)}    accent="#18181B" />
        <Stat label={t('cmp_real_cost')}           value={fmt(realCost)} accent="#71717A" />
        <Stat label={t('cmp_net_revenue')}         value={fmt(netRev)}   accent="#0369A1" />
        <Stat label={t('cmp_margin')}            value={`${marginPct.toFixed(2)} %`} accent={healthy ? '#16A34A' : '#DC2626'} />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-[#71717A]">
        <span>{t('cmp_controllable_margin')} <b className="text-[#18181B]">{fmt(margin)}</b></span>
        {discount > 0 && <span className="text-[#9F1239] font-semibold">Manager discount applied: −{fmt(discount)}</span>}
      </div>
    </div>
  );
}

function Stat({ label, value, accent = '#18181B' }) {
  return (
    <div className="flex flex-col">
      <span className="text-[10px] uppercase tracking-wider text-[#71717A] font-semibold">{label}</span>
      <span className="font-mono text-base font-bold" style={{ color: accent }}>{value}</span>
    </div>
  );
}
