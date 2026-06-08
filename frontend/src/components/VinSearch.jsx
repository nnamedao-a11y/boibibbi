/**
 * VIN Search Component
 * 
 * Пошук по VIN з результатами:
 * - Дані про авто
 * - Ціни та рекомендації
 * - Deal status
 * - CTA для покупки
 * - A/B Testing support
 */

import React, { useState, useCallback, useMemo } from 'react';
import { Search, Loader2, AlertCircle, Car, CheckCircle } from 'lucide-react';
import VinPriceResult from './VinPriceResult';
import { useLang } from '../i18n';

const API_URL = process.env.REACT_APP_BACKEND_URL || '';

// A/B Test variant (persistent per session)
const getVariant = () => {
  let variant = sessionStorage.getItem('ab_variant');
  if (!variant) {
    variant = Math.random() > 0.5 ? 'A' : 'B';
    sessionStorage.setItem('ab_variant', variant);
  }
  return variant;
};

export default function VinSearch({ onLeadCreate }) {
  const { t } = useLang();
  const [vin, setVin] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const [leadCreated, setLeadCreated] = useState(false);
  
  const variant = useMemo(() => getVariant(), []);

  const searchVin = useCallback(async () => {
    if (!vin || vin.length !== 17) {
      setError(t('i18n_vin_must_be_17_characters_322898'));
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);
    setLeadCreated(false);

    try {
      const response = await fetch(`${API_URL}/api/vin-price/${vin.toUpperCase()}`);
      
      if (!response.ok) {
        throw new Error(t('i18n_failed_to_find_data_by_vin_c95c45'));
      }

      const data = await response.json();
      setResult(data);
    } catch (err) {
      setError(err.message || t('i18n_search_error_76ad85'));
    } finally {
      setLoading(false);
    }
  }, [vin]);

  const handleBuy = async () => {
    if (!result) return;

    try {
      const response = await fetch(`${API_URL}/api/leads/from-vin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vin: result.vin,
          maxBid: result.bid.maxBid,
          finalPrice: result.bid.finalPrice,
          marketPrice: result.market.estimatedPrice,
          dealStatus: result.dealStatus.status,
          vehicle: result.vehicle,
          variant: variant,
        }),
      });

      if (response.ok) {
        const lead = await response.json();
        setLeadCreated(true);
        if (onLeadCreate) {
          onLeadCreate(lead);
        }
      }
    } catch (err) {
      alert(t('i18n_error_creating_request_a43ad4'));
    }
  };

  const handleContact = () => {
    window.open('https://t.me/bibi_cars_support', '_blank');
  };

  const handleSave = () => {
    const saved = JSON.parse(localStorage.getItem('savedVins') || '[]');
    saved.push({
      vin: result.vin,
      vehicle: result.vehicle,
      market: result.market,
      savedAt: new Date().toISOString(),
    });
    localStorage.setItem('savedVins', JSON.stringify(saved));
    alert(t('i18n_saved_7ff1ee'));
  };

  // A/B Variant specific copy
  const ctaCopy = variant === 'B' 
    ? { button: t('i18n_take_this_option_efd884'), subtext: t('i18n_we_can_get_the_price_right_now_8176f6') }
    : { button: t('i18n_get_a_consultation_d27bec'), subtext: t('i18n_the_manager_will_check_the_car_a583d2') };

  return (
    <div className="w-full max-w-4xl mx-auto">
      {/* Lead Created Success */}
      {leadCreated && (
        <div className="mb-6 p-6 bg-green-500/10 border border-green-500/50 rounded-2xl">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-green-500/20 rounded-full flex items-center justify-center">
              <CheckCircle className="w-6 h-6 text-green-400" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-green-400">{t('i18n_application_created_f5f86c')}</h3>
              <p className="text-green-300">
                {t('i18n_manager_will_contact_you_withi_ced015')}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Search Box */}
      <div className="mb-8">
        <div className="relative">
          <div className="absolute inset-0 bg-gradient-to-r from-blue-600 to-purple-600 rounded-2xl blur-xl opacity-30"></div>
          <div className="relative bg-gray-900/90 backdrop-blur-sm rounded-2xl border border-gray-700 p-6">
            <h2 className="text-2xl font-bold text-white mb-4 flex items-center gap-2">
              <Car className="w-7 h-7 text-blue-400" />
              {t('i18n_vin_search_with_price_calculat_8285bc')}
            </h2>
            
            <div className="flex gap-3">
              <input
                type="text"
                value={vin}
                onChange={(e) => setVin(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
                placeholder={t('i18n_enter_17_digit_vin_code_5778e0')}
                maxLength={17}
                className="flex-1 px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono text-lg tracking-wider"
              />
              
              <button
                onClick={searchVin}
                disabled={loading || vin.length !== 17}
                className="px-6 py-3 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white font-semibold rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {loading ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <Search className="w-5 h-5" />
                )}
                {t('i18n_search_314d49')}
              </button>
            </div>

            <div className="mt-2 flex justify-between items-center">
              <p className="text-gray-500 text-sm">
                {vin.length}/17 {t('i18n_characters_c5e039')}
              </p>
              {vin.length === 17 && (
                <p className="text-green-400 text-sm flex items-center gap-1">
                  <span className="w-2 h-2 bg-green-400 rounded-full"></span>
                  {t('i18n_vin_is_valid_584ac6')}
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="mb-6 p-4 bg-red-500/10 border border-red-500/50 rounded-xl flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-red-400" />
          <p className="text-red-300">{error}</p>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="text-center py-12">
          <Loader2 className="w-12 h-12 animate-spin text-blue-400 mx-auto mb-4" />
          <p className="text-gray-400">{t('i18n_searching_for_data_and_calcula_79a694')}</p>
          <p className="text-gray-500 text-sm mt-1">{t('i18n_this_may_take_up_to_15_seconds_c550d8')}</p>
        </div>
      )}

      {/* Result */}
      {result && !loading && (
        <VinPriceResult
          data={result}
          onBuy={handleBuy}
          onContact={handleContact}
          onSave={handleSave}
          variant={variant}
          ctaCopy={ctaCopy}
          leadCreated={leadCreated}
        />
      )}

      {/* Empty state */}
      {!result && !loading && !error && (
        <div className="text-center py-12 text-gray-500">
          <Car className="w-16 h-16 mx-auto mb-4 opacity-30" />
          <p>{t('i18n_enter_vin_code_to_get_price_ca_975065')}</p>
          <p className="text-sm mt-2">
            {t('i18n_example_5yjsa1dn2cfp09123_tesl_f507d3')}
          </p>
        </div>
      )}
    </div>
  );
}
