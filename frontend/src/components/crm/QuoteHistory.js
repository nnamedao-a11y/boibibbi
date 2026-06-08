/**
 * Quote History Component
 * 
 * Відображає історію всіх розрахунків для ліда/VIN
 * + Scenario Pricing Selection
 * + Manager Price Override
 */

import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { API_URL } from '../../App';
import { toast } from 'sonner';
import { 
  Receipt, 
  CaretDown, 
  CaretUp,
  Clock,
  CurrencyDollar,
  CheckCircle,
  Warning,
  PencilSimple
} from '@phosphor-icons/react';
import { motion, AnimatePresence } from 'framer-motion';
import ManagerPriceOverride from './ManagerPriceOverride';
import { useLang, getLocale } from '../../i18n';

const QuoteHistory = ({ leadId, vin, onScenarioChange, showManagerOverride = true }) => {
  const { t } = useLang();
  const [quotes, setQuotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedQuote, setExpandedQuote] = useState(null);
  const [activeOverrideQuote, setActiveOverrideQuote] = useState(null);

  useEffect(() => {
    loadQuotes();
  }, [leadId, vin]);

  const loadQuotes = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (leadId) params.append('leadId', leadId);
      if (vin) params.append('vin', vin);
      params.append('limit', '20');

      const res = await axios.get(`${API_URL}/api/calculator/quotes?${params.toString()}`);
      setQuotes(res.data);
    } catch (err) {
      console.error('Failed to load quotes:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleScenarioChange = async (quoteId, selectedScenario) => {
    try {
      const res = await axios.patch(`${API_URL}/api/calculator/quote/${quoteId}/scenario`, {
        selectedScenario
      });
      
      setQuotes(prev => prev.map(q => 
        q._id === quoteId ? { ...q, selectedScenario, finalPrice: res.data.finalPrice } : q
      ));
      
      toast.success(`${t('r9_scenario_changed_to')} ${scenarioLabels[selectedScenario]}`);
      
      if (onScenarioChange) {
        onScenarioChange(res.data);
      }
    } catch (err) {
      toast.error(t('cmp_scenario_change_error'));
    }
  };

  const scenarioLabels = {
    minimum: t('adm3_6752e808c6'),
    recommended: t('adm3_39869ce85d'),
    aggressive: t('adm3_32390f3c90')
  };

  const scenarioColors = {
    minimum: 'text-[#059669] bg-[#DCFCE7]',
    recommended: 'text-[#2563EB] bg-[#DBEAFE]',
    aggressive: 'text-[#DC2626] bg-[#FEE2E2]',
    custom: 'text-[#7C3AED] bg-[#F3E8FF]'
  };

  const handleQuoteUpdate = (updatedQuote) => {
    setQuotes(prev => prev.map(q => 
      q._id === updatedQuote._id ? updatedQuote : q
    ));
    if (onScenarioChange) {
      onScenarioChange(updatedQuote);
    }
  };

  if (loading) {
    return (
      <div className="card p-4">
        <div className="flex items-center gap-2 text-[#71717A]">
          <div className="w-4 h-4 border-2 border-[#18181B] border-t-transparent rounded-full animate-spin"></div>
          {t('cmp_loading_history')}
        </div>
      </div>
    );
  }

  if (quotes.length === 0) {
    return (
      <div className="card p-4">
        <div className="flex items-center gap-2 text-[#71717A]">
          <Receipt size={18} />
          {t('cmp_no_calculation_history')}
        </div>
      </div>
    );
  }

  return (
    <div className="card p-4 space-y-4" data-testid="quote-history">
      <div className="flex items-center gap-2">
        <Receipt size={20} className="text-[#18181B]" />
        <h3 className="font-semibold text-[#18181B]">{t('cmp_payment_history')}</h3>
        <span className="text-xs text-[#71717A]">({quotes.length})</span>
      </div>

      <div className="space-y-3">
        {quotes.map((quote, index) => {
          const isExpanded = expandedQuote === quote._id;
          const selectedPrice = quote.scenarios?.[quote.selectedScenario || 'recommended'] || quote.visibleTotal;

          return (
            <motion.div
              key={quote._id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
              className="border border-[#E4E4E7] rounded-xl overflow-hidden"
              data-testid={`quote-item-${quote._id}`}
            >
              {/* Header */}
              <div 
                className="p-4 bg-[#F7F7F8] cursor-pointer flex items-center justify-between"
                onClick={() => setExpandedQuote(isExpanded ? null : quote._id)}
              >
                <div className="flex items-center gap-4">
                  <div>
                    <div className="font-mono text-sm font-medium text-[#18181B]">
                      {quote.quoteNumber}
                    </div>
                    <div className="text-xs text-[#71717A] flex items-center gap-1">
                      <Clock size={12} />
                      {new Date(quote.createdAt).toLocaleDateString(getLocale())}
                    </div>
                  </div>
                  
                  {quote.vin && (
                    <div className="text-xs font-mono text-[#71717A]">
                      VIN: {quote.vin}
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-4">
                  {/* Scenario Badge */}
                  <span className={`text-xs px-2 py-1 rounded-full ${scenarioColors[quote.selectedScenario || 'recommended']}`}>
                    {scenarioLabels[quote.selectedScenario || 'recommended']}
                  </span>

                  {/* Prices */}
                  <div className="text-right">
                    <div className="font-semibold text-[#059669]">
                      ${selectedPrice?.toLocaleString()}
                    </div>
                    <div className="text-xs text-[#71717A]">
                      internal: ${quote.internalTotal?.toLocaleString()}
                    </div>
                  </div>

                  {isExpanded ? <CaretUp size={18} /> : <CaretDown size={18} />}
                </div>
              </div>

              {/* Expanded Content */}
              <AnimatePresence>
                {isExpanded && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="border-t border-[#E4E4E7]"
                  >
                    <div className="p-4 space-y-4">
                      {/* Scenario Selection */}
                      <div className="grid grid-cols-3 gap-2">
                        {['minimum', 'recommended', 'aggressive'].map((scenario) => (
                          <button
                            key={scenario}
                            onClick={() => handleScenarioChange(quote._id, scenario)}
                            className={`p-3 rounded-lg border-2 transition-all ${
                              quote.selectedScenario === scenario
                                ? 'border-[#18181B] bg-[#18181B] text-white'
                                : 'border-[#E4E4E7] hover:border-[#71717A]'
                            }`}
                            data-testid={`scenario-${scenario}-${quote._id}`}
                          >
                            <div className="text-xs uppercase tracking-wider opacity-70">
                              {scenario === 'minimum' ? t('adm3_d41f5fed74') : scenario === 'recommended' ? t('adm3_39869ce85d') : t('adm3_81e223a99b')}
                            </div>
                            <div className="font-semibold mt-1">
                              ${quote.scenarios?.[scenario]?.toLocaleString() || 'N/A'}
                            </div>
                          </button>
                        ))}
                      </div>

                      {/* Breakdown */}
                      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 text-sm">
                        {Object.entries(quote.breakdown || {}).map(([key, value]) => (
                          <div key={key} className="p-2 bg-[#F7F7F8] rounded-lg">
                            <div className="text-xs text-[#71717A]">{humanize(key, t)}</div>
                            <div className="font-medium">${Number(value).toLocaleString()}</div>
                          </div>
                        ))}
                      </div>

                      {/* Hidden Fee Info */}
                      <div className="flex items-center gap-4 p-3 bg-[#F5F3FF] rounded-lg border border-[#7C3AED]">
                        <Warning size={20} className="text-[#7C3AED]" />
                        <div>
                          <div className="text-sm font-medium text-[#7C3AED]">{t('adm3_hidden_fee_ce800acd84')}</div>
                          <div className="text-xs text-[#71717A]">
                            Visible: ${quote.visibleTotal?.toLocaleString()} → Internal: ${quote.internalTotal?.toLocaleString()} 
                            <span className="text-[#7C3AED] ml-1">(+${quote.hiddenFee?.toLocaleString()})</span>
                          </div>
                        </div>
                      </div>

                      {/* Status */}
                      <div className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2">
                          <span className="text-[#71717A]">{t('cmp_status')}</span>
                          <span className={`badge status-${quote.status}`}>{quote.status}</span>
                        </div>
                        {quote.convertedToLead && (
                          <div className="flex items-center gap-1 text-[#059669]">
                            <CheckCircle size={16} />
                            {t('cmp_converted_to_lead')}
                          </div>
                        )}
                      </div>

                      {/* Manager Price Override Section */}
                      {showManagerOverride && (
                        <div className="border-t border-[#E4E4E7] pt-4 mt-4">
                          <button
                            onClick={() => setActiveOverrideQuote(activeOverrideQuote === quote._id ? null : quote._id)}
                            className="flex items-center gap-2 text-sm text-[#7C3AED] hover:underline"
                            data-testid={`manager-override-toggle-${quote._id}`}
                          >
                            <PencilSimple size={16} />
                            {activeOverrideQuote === quote._id ? t('adm3_3f5e012f83') : 'Manager Price Override'}
                          </button>
                          
                          {activeOverrideQuote === quote._id && (
                            <div className="mt-4">
                              <ManagerPriceOverride
                                quoteId={quote._id}
                                quote={quote}
                                onUpdate={handleQuoteUpdate}
                              />
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
};

// Humanize breakdown keys.  `t` is passed in because this helper lives at
// module scope (outside the React component) and therefore has no access
// to the `useLang()` hook.  Falls back to the raw key when no translation
// is provided.
function humanize(key, t) {
  const tr = typeof t === 'function' ? t : (k) => k;
  const map = {
    carPrice: tr('adm3_a2ef08d24c'),
    auctionFee: tr('adm3_652f34e38c'),
    insurance: tr('adm3_3b968e9953'),
    usaInland: tr('adm3_70a8e23df1'),
    ocean: tr('adm3_b6a743f168'),
    usaHandlingFee: tr('adm3_235c19fa70'),
    bankFee: tr('adm3_1964a880c6'),
    euPortHandlingFee: tr('adm3_8fcd3fe17e'),
    euDelivery: tr('adm3_51fcc97765'),
    companyFee: tr('adm3_864e0beea8'),
    customs: tr('adm3_88cf39486c'),
    documentationFee: tr('adm3_a0231d4110'),
    titleFee: tr('adm3_968e3bfe40'),
  };
  return map[key] || key;
}

export default QuoteHistory;
