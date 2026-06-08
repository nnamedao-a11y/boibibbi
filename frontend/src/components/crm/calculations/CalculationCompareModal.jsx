/**
 * P2.7 — Side-by-side comparison of two calculations (v_a vs v_b).
 * Backed by GET /api/calculations/compare?a=&b=  (role-aware).
 */
import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { API_URL } from '../../../App';
import { X, ArrowsLeftRight } from '@phosphor-icons/react';
import CalculationDelta from './CalculationDelta';
import CalculationStatusBadge from './CalculationStatusBadge';
import { useLang } from '../../../i18n';

const fmt = (v, ccy = 'EUR') => {
  const sym = ccy === 'USD' ? '$' : '€';
  return `${sym}${Math.round(Number(v) || 0).toLocaleString()}`;
};

export default function CalculationCompareModal({ a, b, onClose }) {
  const { t } = useLang();
  const [data, setData]     = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const res = await axios.get(`${API_URL}/api/calculations-compare`, { params: { a, b } });
        if (!cancelled) setData(res.data);
      } catch (err) {
        if (!cancelled) setError(err?.response?.data?.detail || err.message);
      } finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [a, b]);

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" data-testid="calc-compare-modal">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-5xl max-h-[90vh] overflow-hidden flex flex-col">
        <div className="px-5 py-3 border-b border-[#E4E4E7] flex items-center justify-between">
          <div className="flex items-center gap-2 font-bold text-[#18181B]">
            <ArrowsLeftRight size={20} weight="duotone" className="text-[#4F46E5]" />
            {t('cmp_compare_calculations')}
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-[#F4F4F5]" data-testid="compare-close"><X size={20} /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {loading && <div className="text-sm text-[#71717A]">{t('cmp_loading')}</div>}
          {error && <div className="text-sm text-[#DC2626]">Error: {error}</div>}
          {data && data.success && (
            <>
              <div className="grid grid-cols-2 gap-3 mb-4">
                <VersionHeader label="A" v={data.a} />
                <VersionHeader label="B" v={data.b} />
              </div>

              <div className="rounded-lg border border-[#E4E4E7] overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-[#FAFAFA] text-[#71717A] uppercase text-xs tracking-wider">
                    <tr>
                      <th className="text-left  font-semibold px-3 py-2">{t('cmp_row')}</th>
                      <th className="text-right font-semibold px-3 py-2">A · v{data.a.version}</th>
                      <th className="text-right font-semibold px-3 py-2">B · v{data.b.version}</th>
                      <th className="text-right font-semibold px-3 py-2">{t('cmp_delta')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#F4F4F5]">
                    {data.rows.map((r) => {
                      const stripe = !r.in_a ? 'bg-[#ECFDF5]' : (!r.in_b ? 'bg-[#FEF2F2]' : '');
                      return (
                        <tr key={r.key} className={stripe} data-testid={`compare-row-${r.key}`}>
                          <td className="px-3 py-2 text-[#18181B]">
                            <div className="flex items-center gap-2">
                              <span>{r.label}</span>
                              {r.visibility && <span className="px-1 py-0.5 rounded text-[10px] uppercase font-semibold bg-[#F4F4F5] text-[#71717A]">{r.visibility}</span>}
                              {!r.in_a && <span className="text-[10px] text-[#16A34A] font-semibold">{t('cmp_added_in_b')}</span>}
                              {!r.in_b && <span className="text-[10px] text-[#DC2626] font-semibold">{t('cmp_missing_in_b')}</span>}
                            </div>
                          </td>
                          <td className="px-3 py-2 text-right font-mono tabular-nums">{r.in_a ? fmt(r.a, r.currency) : '—'}</td>
                          <td className="px-3 py-2 text-right font-mono tabular-nums">{r.in_b ? fmt(r.b, r.currency) : '—'}</td>
                          <td className="px-3 py-2 text-right"><CalculationDelta value={r.delta} currency={r.currency} /></td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="bg-[#FAFAFA] font-bold">
                      <td className="px-3 py-2">TOTAL</td>
                      <td className="px-3 py-2 text-right font-mono">{fmt(data.a.total)}</td>
                      <td className="px-3 py-2 text-right font-mono">{fmt(data.b.total)}</td>
                      <td className="px-3 py-2 text-right"><CalculationDelta value={data.delta_total} size="lg" /></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function VersionHeader({ label, v }) {
  return (
    <div className="rounded-lg border border-[#E4E4E7] p-3">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs uppercase font-bold tracking-wider text-[#71717A]">Version {label}</span>
        <CalculationStatusBadge status={v.status} />
      </div>
      <div className="text-sm font-bold text-[#18181B]">v{v.version}</div>
      <div className="text-xs text-[#71717A] font-mono">{v.id}</div>
    </div>
  );
}
