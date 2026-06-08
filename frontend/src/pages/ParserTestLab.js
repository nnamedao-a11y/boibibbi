/**
 * Parser Test Lab Page
 * 
 * /admin/parser-mesh/test
 * 
 * Позволяет админу:
 * - Тестировать VIN через все источники
 * - Видеть какие источники сработали
 * - Видеть что вернули
 * - Видеть merged result
 * - Видеть confidence
 */

import React, { useState } from 'react';
import { useLang, getLocale } from '../i18n';
import { 
  MagnifyingGlass, 
  CheckCircle, 
  XCircle, 
  Warning,
  Clock,
  CaretDown,
  CaretUp,
  ArrowsClockwise,
  Database,
  Globe,
  ChartBar,
  Shield,
  CurrencyDollar,
  MapPin,
  Calendar,
  Gauge,
  Car,
  Images as ImagesIcon,
  Check,
  X
} from '@phosphor-icons/react';
import axios from 'axios';

const API_URL = process.env.REACT_APP_BACKEND_URL || 'http://localhost:8001';

// Status badge component
const StatusBadge = ({ status }) => {
  const { t } = useLang();
  const colors = {
    ACTIVE_AUCTION: 'bg-green-100 text-green-800 border-green-200',
    AUCTION_FINISHED: 'bg-blue-100 text-blue-800 border-blue-200',
    HISTORICAL_RECORD: 'bg-yellow-100 text-yellow-800 border-yellow-200',
    NOT_FOUND: 'bg-red-100 text-red-800 border-red-200',
  };
  
  const labels = {
    ACTIVE_AUCTION: t('adm2_1a398044b4'),
    AUCTION_FINISHED: t('adm2_06da621719'),
    HISTORICAL_RECORD: t('adm2_3700fa45b6'),
    NOT_FOUND: t('adm2_c846d3c129'),
  };
  
  return (
    <span className={`px-3 py-1 rounded-full text-sm font-medium border ${colors[status] || 'bg-gray-100'}`}>
      {labels[status] || status}
    </span>
  );
};

// Deal status badge
const DealBadge = ({ status }) => {
  const { t } = useLang();
  const colors = {
    EXCELLENT_DEAL: 'bg-green-500 text-white',
    GOOD_DEAL: 'bg-green-400 text-white',
    FAIR_DEAL: 'bg-yellow-400 text-black',
    RISKY_DEAL: 'bg-orange-400 text-white',
    OVERPRICED: 'bg-red-500 text-white',
    UNKNOWN: 'bg-gray-400 text-white',
  };
  
  const labels = {
    EXCELLENT_DEAL: t('adm2_91a9e42993'),
    GOOD_DEAL: t('adm2_4a3d36df07'),
    FAIR_DEAL: t('adm2_07e905f389'),
    RISKY_DEAL: t('adm2_71d216e38e'),
    OVERPRICED: t('adm2_4fc206615a'),
    UNKNOWN: t('adm2_75a71cd677'),
  };
  
  return (
    <span className={`px-3 py-1 rounded-full text-sm font-medium ${colors[status] || 'bg-gray-400'}`}>
      {labels[status] || status}
    </span>
  );
};

// Confidence bar
const ConfidenceBar = ({ value }) => {
  const percent = Math.round(value * 100);
  const color = percent >= 70 ? 'bg-green-500' : percent >= 40 ? 'bg-yellow-500' : 'bg-red-500';
  
  return (
    <div className="flex items-center gap-3">
      <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
        <div 
          className={`h-full ${color} transition-all duration-500`}
          style={{ width: `${percent}%` }}
        />
      </div>
      <span className="text-sm font-medium w-12">{percent}%</span>
    </div>
  );
};

// Source breakdown item
const SourceItem = ({ source, expanded, onToggle }) => {
  const statusIcon = source.status === 'success' 
    ? <CheckCircle size={20} className="text-green-500" weight="fill" />
    : source.status === 'empty'
    ? <Warning size={20} className="text-yellow-500" weight="fill" />
    : <XCircle size={20} className="text-red-500" weight="fill" />;
  
  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between p-3 hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-3">
          {statusIcon}
          <span className="font-medium">{source.source}</span>
          {source.fieldsProvided?.length > 0 && (
            <span className="text-xs text-gray-500">
              ({source.fieldsProvided.length} {t('r9_fields_plural_9a8b7c')})
            </span>
          )}
        </div>
        {expanded ? <CaretUp size={16} /> : <CaretDown size={16} />}
      </button>
      
      {expanded && source.fieldsProvided?.length > 0 && (
        <div className="px-3 pb-3 pt-0">
          <div className="flex flex-wrap gap-2">
            {source.fieldsProvided.map(field => (
              <span 
                key={field}
                className="px-2 py-1 bg-green-50 text-green-700 text-xs rounded"
              >
                {field}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

// Field confidence item
const FieldConfidenceItem = ({ field }) => (
  <div className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
    <div className="flex items-center gap-2">
      <span className="text-sm font-medium text-gray-700">{field.field}</span>
      <span className="text-xs text-gray-400">({field.source})</span>
    </div>
    <div className="flex items-center gap-2">
      <span className="text-sm text-gray-600 max-w-[200px] truncate">
        {typeof field.value === 'object' ? JSON.stringify(field.value) : field.value}
      </span>
      <ConfidenceBar value={field.confidence} />
    </div>
  </div>
);

const ParserTestLab = () => {
  const { t } = useLang();
  const [vin, setVin] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [expandedSources, setExpandedSources] = useState({});

  const handleSearch = async () => {
    if (!vin || vin.length < 11) {
      setError(t('adm2_vin_11_cecac6ff1e'));
      return;
    }

    setLoading(true);
    setError('');
    setResult(null);

    try {
      const res = await axios.get(`${API_URL}/api/vin-resolver/${vin.toUpperCase()}/test`);
      setResult(res.data);
    } catch (err) {
      setError(err.response?.data?.message || t('adm2_76ad8569c3'));
    } finally {
      setLoading(false);
    }
  };

  const toggleSource = (source) => {
    setExpandedSources(prev => ({
      ...prev,
      [source]: !prev[source]
    }));
  };

  const r = result?.result;
  const v = r?.vehicle;
  const p = r?.pricing;

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-start gap-3 mb-8">
          <div className="w-10 h-10 rounded-2xl bg-[#18181B] text-white flex items-center justify-center shrink-0">
            <Database size={20} weight="bold" />
          </div>
          <div className="min-w-0">
            <h1 className="text-2xl font-bold text-[#18181B] leading-tight">
              {t('adm_parser_test_lab')}
            </h1>
            <p className="text-[12px] text-[#71717A] mt-0.5">
              {t('adm_vin_testing_through_all_parsing_mesh_sources')}
            </p>
          </div>
        </div>

        {/* Search */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 mb-6">
          <div className="flex gap-4">
            <div className="flex-1 relative">
              <MagnifyingGlass 
                size={20} 
                className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" 
              />
              <input
                type="text"
                value={vin}
                onChange={(e) => setVin(e.target.value.toUpperCase())}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                placeholder={t('adm2_vin_17_67bc493249')}
                className="w-full pl-12 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-lg"
                maxLength={17}
              />
            </div>
            <button
              onClick={handleSearch}
              disabled={loading}
              className="px-6 py-3 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center gap-2"
            >
              {loading ? (
                <ArrowsClockwise size={20} className="animate-spin" />
              ) : (
                <MagnifyingGlass size={20} />
              )}
              {t('r9_test_d3e4f5')}
            </button>
          </div>
          
          {error && (
            <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700">
              {error}
            </div>
          )}
        </div>

        {/* Results */}
        {r && (
          <div className="space-y-6">
            {/* Status Card */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
              <div className="flex items-center justify-between flex-wrap gap-4">
                <div>
                  <div className="text-sm text-gray-500 mb-1">VIN</div>
                  <div className="text-xl font-bold">{r.vin}</div>
                </div>
                <div className="flex items-center gap-4">
                  <StatusBadge status={r.status} />
                  {p?.dealStatus && <DealBadge status={p.dealStatus} />}
                </div>
              </div>
              
              <div className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="p-4 bg-gray-50 rounded-xl">
                  <div className="text-xs text-gray-500 mb-1">{t('adm_confidence')}</div>
                  <ConfidenceBar value={r.confidence} />
                </div>
                <div className="p-4 bg-gray-50 rounded-xl">
                  <div className="text-xs text-gray-500 mb-1">{t('adm_sources')}</div>
                  <div className="text-xl font-bold">{r.sourcesUsed?.length || 0}</div>
                </div>
                <div className="p-4 bg-gray-50 rounded-xl">
                  <div className="text-xs text-gray-500 mb-1">{t('adm_search_time')}</div>
                  <div className="text-xl font-bold">{r.searchDurationMs}ms</div>
                </div>
                <div className="p-4 bg-gray-50 rounded-xl">
                  <div className="text-xs text-gray-500 mb-1">{t('adm_status_2')}</div>
                  <div className="text-sm font-medium">{r.message}</div>
                </div>
              </div>
            </div>

            {/* Vehicle Data */}
            {v && (
              <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
                <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                  <Car size={24} />
                  {t('adm_car_data')}
                </h2>
                
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {v.title && (
                    <div className="col-span-full p-4 bg-blue-50 rounded-xl">
                      <div className="text-xs text-blue-600 mb-1">{t('adm_name_2')}</div>
                      <div className="text-lg font-semibold">{v.title}</div>
                    </div>
                  )}
                  
                  {v.year && (
                    <div className="p-4 bg-gray-50 rounded-xl">
                      <div className="text-xs text-gray-500 mb-1">{t('adm_year')}</div>
                      <div className="font-semibold">{v.year}</div>
                    </div>
                  )}
                  
                  {v.make && (
                    <div className="p-4 bg-gray-50 rounded-xl">
                      <div className="text-xs text-gray-500 mb-1">{t('adm_make')}</div>
                      <div className="font-semibold">{v.make}</div>
                    </div>
                  )}
                  
                  {v.model && (
                    <div className="p-4 bg-gray-50 rounded-xl">
                      <div className="text-xs text-gray-500 mb-1">{t('adm_model_2')}</div>
                      <div className="font-semibold">{v.model}</div>
                    </div>
                  )}
                  
                  {v.mileage && (
                    <div className="p-4 bg-gray-50 rounded-xl flex items-center gap-2">
                      <Gauge size={20} className="text-gray-400" />
                      <div>
                        <div className="text-xs text-gray-500">{t('adm_mileage')}</div>
                        <div className="font-semibold">{v.mileage?.toLocaleString()} mi</div>
                      </div>
                    </div>
                  )}
                  
                  {v.location && (
                    <div className="p-4 bg-gray-50 rounded-xl flex items-center gap-2">
                      <MapPin size={20} className="text-gray-400" />
                      <div>
                        <div className="text-xs text-gray-500">{t('adm_location')}</div>
                        <div className="font-semibold">{v.location}</div>
                      </div>
                    </div>
                  )}
                  
                  {v.saleDate && (
                    <div className="p-4 bg-gray-50 rounded-xl flex items-center gap-2">
                      <Calendar size={20} className="text-gray-400" />
                      <div>
                        <div className="text-xs text-gray-500">{t('adm_auction_date')}</div>
                        <div className="font-semibold">
                          {new Date(v.saleDate).toLocaleDateString(getLocale())}
                        </div>
                      </div>
                    </div>
                  )}
                  
                  {v.damageType && (
                    <div className="p-4 bg-orange-50 rounded-xl">
                      <div className="text-xs text-orange-600 mb-1">{t('adm_damage')}</div>
                      <div className="font-semibold text-orange-800">{v.damageType}</div>
                    </div>
                  )}
                  
                  {v.lotNumber && (
                    <div className="p-4 bg-gray-50 rounded-xl">
                      <div className="text-xs text-gray-500 mb-1">{t('adm_lot')}</div>
                      <div className="font-semibold">{v.lotNumber}</div>
                    </div>
                  )}
                  
                  {v.source && (
                    <div className="p-4 bg-gray-50 rounded-xl">
                      <div className="text-xs text-gray-500 mb-1">{t('adm_source')}</div>
                      <div className="font-semibold">{v.source}</div>
                    </div>
                  )}
                </div>

                {/* Images */}
                {v.images?.length > 0 && (
                  <div className="mt-6">
                    <div className="text-sm text-gray-500 mb-3 flex items-center gap-2">
                      <ImagesIcon size={16} />
                      {t('r9_photos_f0a1b2')} ({v.images.length})
                    </div>
                    <div className="flex gap-2 overflow-x-auto pb-2">
                      {v.images.slice(0, 5).map((img, i) => (
                        <img 
                          key={i}
                          src={img} 
                          alt={`Photo ${i + 1}`}
                          className="h-24 w-32 object-cover rounded-lg flex-shrink-0"
                          onError={(e) => e.target.style.display = 'none'}
                        />
                      ))}
                      {v.images.length > 5 && (
                        <div className="h-24 w-32 bg-gray-100 rounded-lg flex items-center justify-center text-gray-500 flex-shrink-0">
                          +{v.images.length - 5}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Pricing */}
            {p && (p.marketPrice || p.auctionPrice) && (
              <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
                <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                  <CurrencyDollar size={24} />
                  {t('adm_pricing')}
                </h2>
                
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {p.auctionPrice && (
                    <div className="p-4 bg-blue-50 rounded-xl">
                      <div className="text-xs text-blue-600 mb-1">{t('adm_current_bid')}</div>
                      <div className="text-xl font-bold text-blue-700">
                        ${p.auctionPrice?.toLocaleString()}
                      </div>
                    </div>
                  )}
                  
                  {p.marketPrice && (
                    <div className="p-4 bg-green-50 rounded-xl">
                      <div className="text-xs text-green-600 mb-1">{t('adm_market_price')}</div>
                      <div className="text-xl font-bold text-green-700">
                        ${p.marketPrice?.toLocaleString()}
                      </div>
                    </div>
                  )}
                  
                  {p.recommendedMaxBid && (
                    <div className="p-4 bg-purple-50 rounded-xl">
                      <div className="text-xs text-purple-600 mb-1">{t('adm_recommended_bid')}</div>
                      <div className="text-xl font-bold text-purple-700">
                        ${p.recommendedMaxBid?.toLocaleString()}
                      </div>
                    </div>
                  )}
                  
                  {p.finalAllInPrice && (
                    <div className="p-4 bg-gray-900 rounded-xl">
                      <div className="text-xs text-gray-400 mb-1">{t('adm_final_allin_price')}</div>
                      <div className="text-xl font-bold text-white">
                        ${p.finalAllInPrice?.toLocaleString()}
                      </div>
                    </div>
                  )}
                </div>

                {/* Cost breakdown */}
                <div className="mt-4 p-4 bg-gray-50 rounded-xl">
                  <div className="text-sm text-gray-500 mb-2">{t('adm_cost_breakdown')}</div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                    {p.deliveryCost && (
                      <div>
                        <span className="text-gray-500">{t('adm_delivery_2')}</span>{' '}
                        <span className="font-medium">${p.deliveryCost?.toLocaleString()}</span>
                      </div>
                    )}
                    {p.customsCost && (
                      <div>
                        <span className="text-gray-500">{t('adm_customs_2')}</span>{' '}
                        <span className="font-medium">${p.customsCost?.toLocaleString()}</span>
                      </div>
                    )}
                    {p.repairEstimate && (
                      <div>
                        <span className="text-gray-500">{t('adm_repair')}</span>{' '}
                        <span className="font-medium">${p.repairEstimate?.toLocaleString()}</span>
                      </div>
                    )}
                    {p.platformMargin && (
                      <div>
                        <span className="text-gray-500">{t('adm_margin_2')}</span>{' '}
                        <span className="font-medium">${p.platformMargin?.toLocaleString()}</span>
                      </div>
                    )}
                  </div>
                </div>
                
                <div className="mt-4">
                  <div className="text-xs text-gray-500 mb-1">{t('adm_price_confidence')}</div>
                  <ConfidenceBar value={p.priceConfidence || 0} />
                </div>
              </div>
            )}

            {/* Source Breakdown */}
            {r.sourceBreakdown?.length > 0 && (
              <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
                <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                  <Globe size={24} />
                  {t('r9_sources_c5d6e7')} ({r.sourceBreakdown.length})
                </h2>
                
                <div className="space-y-2">
                  {r.sourceBreakdown.map((source, i) => (
                    <SourceItem 
                      key={i}
                      source={source}
                      expanded={expandedSources[source.source]}
                      onToggle={() => toggleSource(source.source)}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Field Confidence */}
            {r.fieldConfidence?.length > 0 && (
              <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
                <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                  <ChartBar size={24} />
                  {t('adm_field_confidence')}
                </h2>
                
                <div className="space-y-1">
                  {r.fieldConfidence.map((field, i) => (
                    <FieldConfidenceItem key={i} field={field} />
                  ))}
                </div>
              </div>
            )}

            {/* Raw JSON (collapsible) */}
            <details className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
              <summary className="p-6 cursor-pointer hover:bg-gray-50 font-semibold">
                {t('adm_raw_json_response')}
              </summary>
              <div className="p-6 pt-0">
                <pre className="bg-gray-900 text-green-400 p-4 rounded-xl overflow-x-auto text-xs">
                  {JSON.stringify(result, null, 2)}
                </pre>
              </div>
            </details>
          </div>
        )}

        {/* Empty state */}
        {!result && !loading && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-12 text-center">
            <Database size={64} className="mx-auto text-gray-300 mb-4" />
            <h2 className="text-xl font-semibold text-gray-700 mb-2">
              {t('adm_enter_vin_for_testing')}
            </h2>
            <p className="text-gray-500">
              {t('adm_the_system_will_check_all_parsing_mesh_sources_and')}
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default ParserTestLab;
