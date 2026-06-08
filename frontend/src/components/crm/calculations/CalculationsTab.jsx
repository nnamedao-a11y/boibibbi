/**
 * P2.7 — Tab wrapper for LegalWorkflowPage.
 * Lets the manager pick which deal to view calculations for.
 */
import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { API_URL } from '../../../App';
import { Wallet } from '@phosphor-icons/react';
import DealCalculationsPanel from './DealCalculationsPanel';
import { useLang } from '../../../i18n';
import WhiteSelect from '../../../components/ui/WhiteSelect';

export default function CalculationsTab({ deals = [] }) {
  const { t } = useLang();
  const [selectedDealId, setSelectedDealId] = useState(deals[0]?.id || '');
  const [allDeals, setAllDeals] = useState(deals);

  // Pre-populate from prop, also fetch lazily if list is empty
  useEffect(() => {
    if (deals.length) { setAllDeals(deals); setSelectedDealId(s => s || deals[0]?.id || ''); return; }
    (async () => {
      try {
        const res = await axios.get(`${API_URL}/api/deals?limit=200`);
        const arr = res.data?.data || res.data || [];
        setAllDeals(arr);
        setSelectedDealId((s) => s || arr[0]?.id || '');
      } catch { /* ignore */ }
    })();
  }, [deals]);

  const selected = allDeals.find(d => d.id === selectedDealId);

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-[#E4E4E7] bg-white p-3 flex items-center gap-3">
        <Wallet size={18} weight="duotone" className="text-[#18181B] shrink-0" />
        <label className="text-xs uppercase font-semibold tracking-wider text-[#71717A] shrink-0">{t('cmp_deal')}</label>
        <div className="relative flex-1 min-w-0">
          <WhiteSelect value={selectedDealId} onChange={(e) => setSelectedDealId(e.target.value)} className="w-full" data-testid="calc-tab-deal-select">
            {!allDeals.length && <option value="">{t('cmp_no_deals_available')}</option>}
            {allDeals.map(d => (
              <option key={d.id} value={d.id}>
                {d.id} — {d.customer_name || d.customer_id || 'Unknown'} · {d.stage || d.status || '—'}
              </option>
            ))}
          </WhiteSelect>
        </div>
        {selected && (
          <div className="text-xs text-[#71717A] hidden sm:block">
            customer: <b className="text-[#18181B]">{selected.customer_id || '—'}</b>
          </div>
        )}
      </div>

      {selectedDealId
        ? <DealCalculationsPanel dealId={selectedDealId} customerId={selected?.customer_id} leadId={selected?.lead_id} />
        : <div className="p-6 rounded-lg border border-dashed border-[#E4E4E7] text-center text-[#71717A] text-sm">
            {t('cmp_pick_a_deal_to_load_its_calculations')}
          </div>}
    </div>
  );
}
