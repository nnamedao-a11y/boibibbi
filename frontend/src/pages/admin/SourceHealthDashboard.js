/**
 * Source Health Dashboard Page
 * 
 * Показує статус всіх джерел парсингу
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useLang } from '../../i18n';
import { 
  Spinner, 
  CheckCircle, 
  Warning, 
  XCircle, 
  Clock,
  TrendUp,
  Database,
  ArrowClockwise,
  Lightning,
  Database as DatabaseIcon,
} from '@phosphor-icons/react';
import { AdminPageHeader } from '../../components/ui/AdminPagePrimitives';

const API_URL = process.env.REACT_APP_BACKEND_URL || 'http://localhost:8001';

const SourceHealthDashboard = () => {
  const { t } = useLang();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [autoRefresh, setAutoRefresh] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/source-health`);
      if (!res.ok) throw new Error('Failed to fetch');
      const json = await res.json();
      setData(json);
      setError('');
    } catch (err) {
      setError('Failed to load health data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (autoRefresh) {
      const interval = setInterval(fetchData, 10000);
      return () => clearInterval(interval);
    }
  }, [autoRefresh, fetchData]);

  const getStatusColor = (status) => {
    switch (status) {
      case 'active': return 'bg-emerald-100 text-emerald-700';
      case 'degraded': return 'bg-amber-100 text-amber-700';
      case 'quarantine': return 'bg-red-100 text-red-700';
      case 'disabled': return 'bg-zinc-100 text-zinc-500';
      default: return 'bg-zinc-100 text-zinc-500';
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'active': return <CheckCircle weight="fill" className="text-emerald-500" />;
      case 'degraded': return <Warning weight="fill" className="text-amber-500" />;
      case 'quarantine': return <XCircle weight="fill" className="text-red-500" />;
      case 'disabled': return <XCircle className="text-zinc-400" />;
      default: return null;
    }
  };

  const getTierBadge = (tier) => {
    const colors = {
      1: 'bg-emerald-500',
      2: 'bg-blue-500',
      3: 'bg-purple-500',
      4: 'bg-zinc-400',
    };
    return (
      <span className={`px-2 py-0.5 text-xs text-white rounded ${colors[tier] || colors[4]}`}>
        Tier {tier}
      </span>
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-50 flex items-center justify-center">
        <Spinner size={48} className="animate-spin text-zinc-400" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FAFAFA] p-4 sm:p-6">
      <div className="max-w-6xl mx-auto space-y-4 sm:space-y-5">
        <AdminPageHeader
          icon={Database}
          title={t('sourceHealthDashboard')}
          subtitle={t('teamLoadControl')}
          testId="source-health-header"
          actions={(
            <>
              <label className="inline-flex items-center gap-1.5 text-[12.5px] text-[#3F3F46] font-medium">
                <input
                  type="checkbox"
                  checked={autoRefresh}
                  onChange={(e) => setAutoRefresh(e.target.checked)}
                  className="rounded accent-[#18181B]"
                />
                {t('realtime')}
              </label>
              <button
                onClick={fetchData}
                className="inline-flex items-center justify-center gap-1.5 h-9 px-3.5 rounded-xl bg-[#18181B] hover:bg-[#27272A] text-white text-[12.5px] font-semibold focus:outline-none focus-visible:ring-4 focus-visible:ring-black/10"
              >
                <ArrowClockwise size={14} />
                <span className="hidden sm:inline">Refresh</span>
              </button>
            </>
          )}
        />

        {/* Error */}
        {error && (
          <div className="bg-rose-50 border border-rose-200 text-rose-700 rounded-2xl p-4 text-[13px]">
            {error}
          </div>
        )}

        {/* Summary Cards */}
        {data && (
          <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 sm:gap-3">
            <SummaryCard
              icon={<CheckCircle weight="fill" className="text-emerald-500" />}
              label={t('activeStatusGeneric')}
              value={data.activeSources}
              total={data.totalSources}
              color="emerald"
            />
            <SummaryCard
              icon={<Warning weight="fill" className="text-amber-500" />}
              label={t('degraded')}
              value={data.degradedSources}
              total={data.totalSources}
              color="amber"
            />
            <SummaryCard
              icon={<TrendUp className="text-blue-500" />}
              label={t('hitRate')}
              value={`${Math.round(data.overallHitRate * 100)}%`}
              color="blue"
            />
            <SummaryCard
              icon={<Clock className="text-purple-500" />}
              label={t('avgLatency')}
              value={`${data.avgLatency}ms`}
              color="purple"
            />
          </div>

          {/* Sources Table */}
          <div className="bg-white rounded-xl border border-zinc-200 overflow-hidden">
            <div className="p-4 border-b border-zinc-100">
              <h2 className="font-semibold text-zinc-900">{t('sourceStatus')}</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-zinc-50 text-left text-sm text-zinc-500">
                  <tr>
                    <th className="px-4 py-3 font-medium">{t('tableSource')}</th>
                    <th className="px-4 py-3 font-medium">{t('tableStatus')}</th>
                    <th className="px-4 py-3 font-medium">{t('tier')}</th>
                    <th className="px-4 py-3 font-medium">{t('score')}</th>
                    <th className="px-4 py-3 font-medium">{t('hitRate')}</th>
                    <th className="px-4 py-3 font-medium">{t('latency')}</th>
                    <th className="px-4 py-3 font-medium">{t('requests')}</th>
                    <th className="px-4 py-3 font-medium">{t('lastSuccess')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {data.sources.map((source) => (
                    <tr key={source.name} className="hover:bg-zinc-50">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {getStatusIcon(source.status)}
                          <span className="font-medium text-zinc-900">{source.name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-1 text-xs rounded-full font-medium ${getStatusColor(source.status)}`}>
                          {source.status}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {getTierBadge(source.tier)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="w-16 h-2 bg-zinc-200 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-emerald-500 rounded-full"
                              style={{ width: `${Math.round(source.score * 100)}%` }}
                            />
                          </div>
                          <span className="text-sm text-zinc-600">
                            {Math.round(source.score * 100)}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-sm ${source.hitRate > 0.5 ? 'text-emerald-600' : 'text-zinc-500'}`}>
                          {Math.round(source.hitRate * 100)}%
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-zinc-600">
                        {source.avgLatency > 0 ? `${Math.round(source.avgLatency)}ms` : '-'}
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-sm text-zinc-600">
                          {source.successfulRequests}/{source.totalRequests}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-zinc-500">
                        {source.lastSuccess 
                          ? new Date(source.lastSuccess).toLocaleTimeString()
                          : '-'
                        }
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Tier Legend */}
          <div className="mt-6 p-4 bg-white rounded-xl border border-zinc-200">
            <h3 className="font-medium text-zinc-900 mb-3">{t('tierDefinitions')}</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                {getTierBadge(1)}
                <span className="ml-2 text-zinc-600">{t('trustedStable')}</span>
              </div>
              <div>
                {getTierBadge(2)}
                <span className="ml-2 text-zinc-600">{t('competitorAggregator')}</span>
              </div>
              <div>
                {getTierBadge(3)}
                <span className="ml-2 text-zinc-600">{t('publicFallback')}</span>
              </div>
              <div>
                {getTierBadge(4)}
                <span className="ml-2 text-zinc-600">{t('difficultOptional')}</span>
              </div>
            </div>
          </div>

          {/* Last Updated */}
          <div className="text-[11.5px] text-[#A1A1AA] text-right">
            Last updated: {new Date(data.lastUpdated).toLocaleString()}
          </div>
          </>
        )}
      </div>
    </div>
  );
};

const SummaryCard = ({ icon, label, value, total, color }) => {
  return (
    <div className="bg-white rounded-2xl border border-[#E4E4E7] p-3 sm:p-4">
      <div className="flex items-center gap-2 mb-1.5">
        {icon}
        <span className="text-[10.5px] sm:text-[11px] font-semibold uppercase tracking-[0.12em] text-[#71717A]">{label}</span>
      </div>
      <div className="text-[22px] sm:text-[26px] font-semibold text-[#18181B] tabular-nums leading-tight">
        {value}
        {total !== undefined && (
          <span className="text-[12px] font-normal text-[#A1A1AA]">/{total}</span>
        )}
      </div>
    </div>
  );
};

export default SourceHealthDashboard;
