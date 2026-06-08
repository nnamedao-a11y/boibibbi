/**
 * P2.7 — Delta indicator. Shows + / − value with semantic colour.
 * Used in version list ("+ €1200 vs v1") and in compare table.
 */
import React from 'react';
import { ArrowUp, ArrowDown, Minus } from '@phosphor-icons/react';
import { useLang } from '../../../i18n';

const fmt = (v, ccy = 'EUR') => {
  if (v === 0 || v === null || v === undefined) return '—';
  const n = Math.abs(Math.round(Number(v) || 0));
  const sym = ccy === 'USD' ? '$' : '€';
  return `${sym}${n.toLocaleString()}`;
};

export default function CalculationDelta({ value, currency = 'EUR', size = 'sm', invert = false, showZero = false }) {
  const { t } = useLang();
  const v = Number(value || 0);
  const isPos = v > 0;
  const isNeg = v < 0;
  // invert: when used for "discount" — a positive number is a *good* thing, so swap colours
  const good = invert ? isPos : isNeg;
  const bad  = invert ? isNeg : isPos;
  if (v === 0 && !showZero) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-[#A1A1AA]">
        <Minus size={12} /> {t('cmp_no_change')}
      </span>
    );
  }
  const colour = good ? '#16A34A' : (bad ? '#DC2626' : '#71717A');
  const Icon   = isPos ? ArrowUp : (isNeg ? ArrowDown : Minus);
  const sign   = isPos ? '+' : (isNeg ? '−' : '');
  const ts = size === 'lg' ? 'text-sm' : 'text-xs';
  return (
    <span className={`inline-flex items-center gap-1 font-semibold ${ts}`} style={{ color: colour }}>
      <Icon size={size === 'lg' ? 14 : 12} weight="bold" />
      {sign}{fmt(value, currency)}
    </span>
  );
}
