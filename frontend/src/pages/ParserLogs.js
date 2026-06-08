/**
 * Parser Logs Page
 * 
 * Перегляд логів парсерів
 * Тільки для MASTER_ADMIN
 */

import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { useAuth, API_URL } from '../App';
import { useLang, getLocale } from '../i18n';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Funnel,
  Info,
  Warning,
  XCircle,
  CircleNotch,
  Clock,
  CaretLeft,
  CaretRight,
  ListBullets,
} from '@phosphor-icons/react';
import WhiteSelect from '../components/ui/WhiteSelect';

const ParserLogs = () => {
  const { t } = useLang();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pagination, setPagination] = useState({ page: 1, limit: 50, total: 0, totalPages: 0 });
  const [filters, setFilters] = useState({ source: '', level: '' });
  const [selectedLog, setSelectedLog] = useState(null);

  const isMasterAdmin = ['master_admin'].includes(user?.role);

  useEffect(() => {
    if (!isMasterAdmin) {
      navigate('/admin/parser');
      return;
    }
  }, [isMasterAdmin, navigate]);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: pagination.page.toString(),
        limit: pagination.limit.toString(),
      });
      if (filters.source) params.append('source', filters.source);
      if (filters.level) params.append('level', filters.level);

      const res = await axios.get(`${API_URL}/api/ingestion/admin/logs?${params}`);
      setLogs(res.data.items || []);
      setPagination(prev => ({
        ...prev,
        total: res.data.total || 0,
        totalPages: res.data.totalPages || 0,
      }));
    } catch (error) {
      toast.error(t('loadError'));
    } finally {
      setLoading(false);
    }
  }, [pagination.page, pagination.limit, filters]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const levelConfig = {
    info: { icon: Info, color: 'text-blue-500', bg: 'bg-blue-50' },
    warn: { icon: Warning, color: 'text-yellow-500', bg: 'bg-yellow-50' },
    error: { icon: XCircle, color: 'text-red-500', bg: 'bg-red-50' },
  };

  const formatDate = (date) => {
    return new Date(date).toLocaleString(getLocale(), {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  if (loading && logs.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <CircleNotch size={32} className="animate-spin text-[#18181B]" />
      </div>
    );
  }

  return (
    <div data-testid="parser-logs-page">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => navigate('/admin/parser')}
          className="p-2 hover:bg-[#F4F4F5] rounded-lg transition-colors"
        >
          <ArrowLeft size={20} />
        </button>
        <div className="w-10 h-10 rounded-2xl bg-[#18181B] text-white flex items-center justify-center shrink-0">
          <ListBullets size={20} weight="bold" />
        </div>
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-[#18181B] leading-tight">{t('parserLogsTitle')}</h1>
          <p className="text-[12px] text-[#71717A] mt-0.5">{t('parserLogsSubtitle')}</p>
        </div>
      </div>

      {/* Filters - Mobile responsive */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <Funnel size={18} className="text-[#71717A]" />
        <WhiteSelect value={filters.source} onChange={(e) => { setFilters({ ...filters, source: e.target.value }); setPagination(prev => ({ ...prev, page: 1 })); }} className="flex-1 min-w-[140px]" style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%2371717A' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 12px center', paddingRight: '40px' }} data-testid="source-filter">
          <option value="">{t('allSources')}</option>
          <option value="bitmotors">{t('adm_bitmotors')}</option>
          <option value="westmotors">{t('adm_westmotors')}</option>
          <option value="lemon">{t('adm_lemon')}</option>
          <option value="auctionauto">{t('adm_auctionauto')}</option>
          <option value="poctra">{t('adm_poctra')}</option>
          <option value="carsfromwest">{t('adm_carsfromwest')}</option>
          <option value="autoauctionhistory">{t('adm_autoauctionhistory')}</option>
          <option value="salvagebid">{t('adm_salvagebid')}</option>
          <option value="system">{t('adm_system')}</option>
        </WhiteSelect>
        <WhiteSelect value={filters.level} onChange={(e) => { setFilters({ ...filters, level: e.target.value }); setPagination(prev => ({ ...prev, page: 1 })); }} className="flex-1 min-w-[140px]" style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%2371717A' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 12px center', paddingRight: '40px' }} data-testid="level-filter">
          <option value="">{t('allStatuses')}</option>
          <option value="info">{t('adm_info')}</option>
          <option value="warn">{t('adm_warning')}</option>
          <option value="error">{t('adm_error')}</option>
        </WhiteSelect>
      </div>

      {/* Logs Table - with horizontal scroll */}
      <div className="bg-white rounded-2xl border border-[#E4E4E7] overflow-x-auto mb-4">
        <table className="w-full min-w-[700px]">
          <thead className="bg-[#F4F4F5]">
            <tr>
              <th className="text-left px-6 py-3 text-xs font-medium text-[#71717A] uppercase">{t('date')}</th>
              <th className="text-left px-6 py-3 text-xs font-medium text-[#71717A] uppercase">{t('status')}</th>
              <th className="text-left px-6 py-3 text-xs font-medium text-[#71717A] uppercase">{t('source')}</th>
              <th className="text-left px-6 py-3 text-xs font-medium text-[#71717A] uppercase">{t('type')}</th>
              <th className="text-left px-6 py-3 text-xs font-medium text-[#71717A] uppercase">{t('description')}</th>
              <th className="text-left px-6 py-3 text-xs font-medium text-[#71717A] uppercase"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#E4E4E7]">
            {logs.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-6 py-12 text-center text-[#71717A]">
                  <Clock size={48} className="mx-auto mb-3 opacity-30" />
                  <p>{t('noLogs')}</p>
                </td>
              </tr>
            ) : (
              logs.map((log) => {
                const config = levelConfig[log.level] || levelConfig.info;
                const Icon = config.icon;
                return (
                  <tr key={log.id || log._id} className="hover:bg-[#FAFAFA]" data-testid={`log-row-${log.id || log._id}`}>
                    <td className="px-6 py-3 text-sm text-[#71717A] whitespace-nowrap">
                      {formatDate(log.createdAt)}
                    </td>
                    <td className="px-6 py-3">
                      <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${config.bg} ${config.color}`}>
                        <Icon size={12} weight="bold" />
                        {log.level?.toUpperCase()}
                      </span>
                    </td>
                    <td className="px-6 py-3 uppercase text-sm font-medium">{log.source}</td>
                    <td className="px-6 py-3 text-sm">{log.event}</td>
                    <td className="px-6 py-3 text-sm max-w-xs truncate">{log.message || '-'}</td>
                    <td className="px-6 py-3">
                      {log.meta && Object.keys(log.meta).length > 0 && (
                        <button
                          onClick={() => setSelectedLog(log)}
                          className="text-xs px-2 py-1 bg-[#F4F4F5] rounded hover:bg-[#E4E4E7]"
                        >
                        {t('adm_details')}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {pagination.totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-[#71717A]">
            {t('r9_shown')} {((pagination.page - 1) * pagination.limit) + 1} - {Math.min(pagination.page * pagination.limit, pagination.total)} {t('r9_of')} {pagination.total}
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setPagination(prev => ({ ...prev, page: prev.page - 1 }))}
              disabled={pagination.page <= 1}
              className="p-2 border border-[#E4E4E7] rounded-lg hover:bg-[#F4F4F5] disabled:opacity-50"
            >
              <CaretLeft size={16} />
            </button>
            <span className="px-4 py-2 text-sm">
              {pagination.page} / {pagination.totalPages}
            </span>
            <button
              onClick={() => setPagination(prev => ({ ...prev, page: prev.page + 1 }))}
              disabled={pagination.page >= pagination.totalPages}
              className="p-2 border border-[#E4E4E7] rounded-lg hover:bg-[#F4F4F5] disabled:opacity-50"
            >
              <CaretRight size={16} />
            </button>
          </div>
        </div>
      )}

      {/* Detail Modal */}
      {selectedLog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-6 w-full max-w-2xl max-h-[80vh] overflow-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold">{t('details')}</h2>
              <button
                onClick={() => setSelectedLog(null)}
                className="p-2 hover:bg-[#F4F4F5] rounded-lg"
              >
                <XCircle size={20} />
              </button>
            </div>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-[#71717A]">{t('date')}</p>
                  <p className="font-medium">{formatDate(selectedLog.createdAt)}</p>
                </div>
                <div>
                  <p className="text-xs text-[#71717A]">{t('source')}</p>
                  <p className="font-medium uppercase">{selectedLog.source}</p>
                </div>
                <div>
                  <p className="text-xs text-[#71717A]">{t('status')}</p>
                  <p className="font-medium uppercase">{selectedLog.level}</p>
                </div>
                <div>
                  <p className="text-xs text-[#71717A]">{t('type')}</p>
                  <p className="">{selectedLog.event}</p>
                </div>
              </div>
              {selectedLog.message && (
                <div>
                  <p className="text-xs text-[#71717A]">{t('description')}</p>
                  <p className="font-medium">{selectedLog.message}</p>
                </div>
              )}
              {selectedLog.meta && (
                <div>
                  <p className="text-xs text-[#71717A] mb-2">{t('adm_metadata')}</p>
                  <pre className="bg-[#F4F4F5] p-4 rounded-xl text-sm overflow-auto">
                    {JSON.stringify(selectedLog.meta, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ParserLogs;
