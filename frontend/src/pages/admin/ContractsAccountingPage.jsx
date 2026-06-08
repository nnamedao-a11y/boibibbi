/**
 * Contracts Accounting Page (Admin)
 * 
 * /admin/contracts/accounting
 * 
 * For Owner/Team Lead - signature control and accounting overview
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useLang } from '../../i18n';
import {
  FileSignature,
  CheckCircle,
  Clock,
  XCircle,
  TrendingUp,
  AlertTriangle,
  Download,
  Filter,
  RefreshCw,
  Eye,
  ChevronRight,
  Calendar,
  DollarSign,
  Users,
  FileText,
} from 'lucide-react';
import WhiteSelect from '../../components/ui/WhiteSelect';
import RefreshButton from '../../components/ui/RefreshButton';
import {
  AdminPageHeader,
  AdminCard,
} from '../../components/ui/AdminPagePrimitives';

const API_URL = process.env.REACT_APP_BACKEND_URL;

// Status config
const STATUS_CONFIG = {
  draft: { color: 'zinc', icon: FileText, label: { uk: 'Draft', en: 'Draft', bg: 'Draft' } },
  sent: { color: 'blue', icon: Clock, label: { uk: 'Sent', en: 'Sent', bg: 'Sent' } },
  viewed: { color: 'amber', icon: Eye, label: { uk: 'Viewed', en: 'Viewed', bg: 'Reviewed' } },
  signed: { color: 'emerald', icon: CheckCircle, label: { uk: 'Signed', en: 'Signed', bg: 'Signed' } },
  rejected: { color: 'red', icon: XCircle, label: { uk: 'Rejected', en: 'Rejected', bg: 'Rejected' } },
  expired: { color: 'zinc', icon: AlertTriangle, label: { uk: 'Overdue', en: 'Expired', bg: 'Expired' } },
};

export default function ContractsAccountingPage() {
  const { lang, t } = useLang();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState('30');
  const [statusFilter, setStatusFilter] = useState('');
  const [selectedContract, setSelectedContract] = useState(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const params = new URLSearchParams({ period });
      if (statusFilter) params.append('status', statusFilter);
      
      const res = await fetch(`${API_URL}/api/admin/contracts/accounting?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const result = await res.json();
      setData(result);
    } catch (error) {
      console.error('Failed to fetch accounting data:', error);
    } finally {
      setLoading(false);
    }
  }, [period, statusFilter]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleExport = async () => {
    try {
      const token = localStorage.getItem('token');
      const params = new URLSearchParams();
      if (statusFilter) params.append('status', statusFilter);
      
      const res = await fetch(`${API_URL}/api/admin/contracts/export?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const exportData = await res.json();
      
      // Convert to CSV
      const headers = ['ID', t('adm2_d6d264ff0e'), t('adm2_313ec9c7c2'), 'Email', t('adm2_345805b88b'), t('adm2_7203f7a4ff'), t('adm2_3bed8fba01'), 'VIN', t('adm2_6c12ce55e8'), t('adm2_6268a9fafc'), t('adm2_0dc2b733c3')];
      const rows = exportData.contracts.map(c => [
        c.id,
        c.contractNumber || '',
        c.customerName || '',
        c.customerEmail || '',
        c.type || '',
        c.status || '',
        c.price || '',
        c.vin || '',
        c.vehicleTitle || '',
        c.createdAt ? new Date(c.createdAt).toLocaleDateString() : '',
        c.signedAt ? new Date(c.signedAt).toLocaleDateString() : '',
      ]);
      
      const csv = [headers.join(','), ...rows.map(r => r.map(v => `"${v}"`).join(','))].join('\n');
      
      // Download
      const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `contracts_${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Export failed:', error);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="w-8 h-8 animate-spin text-gray-400" />
      </div>
    );
  }

  const summary = data?.summary || {};
  const priceStats = data?.priceStats || {};

  return (
    <div className="space-y-4 sm:space-y-5" data-testid="contracts-accounting-page">
      {/*
        Header — custom inline layout (June 2026).
        Mobile/Desktop:  [icon] Title + subtitle  ←—————→  [Refresh]
        Then a toolbar row below: [30 days] [All statuses] [Export]
        Refresh is always pinned top-right; the wider controls live in
        the toolbar row so they never squeeze the title into letter-wrap.
      */}
      <header
        className="bg-white border border-[#E4E4E7] rounded-2xl p-4 sm:p-5"
        data-testid="contracts-header"
      >
        <div className="flex items-start gap-3 sm:gap-4">
          <div className="w-10 h-10 rounded-xl bg-[#18181B] text-white flex items-center justify-center shrink-0">
            <FileSignature size={18} weight="duotone" />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-[17px] sm:text-[19px] font-semibold tracking-tight text-[#18181B] leading-tight break-words">
              {lang === 'uk' ? t('adm2_48f16e3532') : lang === 'bg' ? t('adm2_ae67832aaf') : 'Contracts accounting'}
            </h1>
            <p className="mt-1 text-[12.5px] sm:text-[13px] text-[#71717A] leading-relaxed break-words">
              {lang === 'uk' ? t('adm2_bfa494e8c3') : 'Signature control & statistics'}
            </p>
          </div>
          <div className="shrink-0">
            <RefreshButton
              onClick={fetchData}
              ariaLabel={lang === 'uk' ? t('adm2_b6bf91f845') : 'Refresh'}
              testId="contracts-refresh-btn"
            />
          </div>
        </div>
        {/* Toolbar row: [days] [status] [export]. Wraps cleanly on mobile,
            inline on desktop. Period+status are roughly 50/50, Export
            stays compact on the right. */}
        <div className="mt-4 grid grid-cols-2 sm:flex sm:flex-wrap sm:items-center gap-2 sm:gap-3">
          <div className="w-full sm:w-[120px] shrink-0">
            <WhiteSelect
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
            >
              <option value="7">7 {lang === 'uk' ? t('adm2_e85d4cee49') : 'days'}</option>
              <option value="30">30 {lang === 'uk' ? t('adm2_e85d4cee49') : 'days'}</option>
              <option value="90">90 {lang === 'uk' ? t('adm2_e85d4cee49') : 'days'}</option>
            </WhiteSelect>
          </div>
          <div className="w-full sm:w-[150px] shrink-0">
            <WhiteSelect
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="">{lang === 'uk' ? t('adm2_602a3f7399') : 'All statuses'}</option>
              <option value="signed">{lang === 'uk' ? t('adm2_d9fbeffdf6') : 'Signed'}</option>
              <option value="sent">{lang === 'uk' ? t('adm2_cecde526be') : 'Pending'}</option>
              <option value="rejected">{lang === 'uk' ? t('adm2_49c59ac5d0') : 'Rejected'}</option>
            </WhiteSelect>
          </div>
          <button
            onClick={handleExport}
            className="col-span-2 sm:col-span-1 inline-flex items-center justify-center gap-1.5 h-10 px-4 rounded-xl border border-[#E4E4E7] bg-white hover:bg-[#FAFAFA] text-[13px] font-medium text-[#18181B] whitespace-nowrap focus:outline-none focus-visible:ring-4 focus-visible:ring-black/10"
          >
            <Download className="w-3.5 h-3.5" />
            <span>{lang === 'uk' ? t('adm2_b51156b39b') : 'Export'}</span>
          </button>
        </div>
      </header>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <StatCard
          title={lang === 'uk' ? t('adm2_b2d00a1144') : 'Total'}
          value={summary.total || 0}
          icon={FileText}
          color="gray"
        />
        <StatCard
          title={lang === 'uk' ? t('adm2_0dc2b733c3') : 'Signed'}
          value={summary.signed || 0}
          icon={CheckCircle}
          color="emerald"
          trend={summary.conversionRate}
        />
        <StatCard
          title={lang === 'uk' ? t('adm2_cecde526be') : 'Pending'}
          value={summary.pending || 0}
          icon={Clock}
          color="blue"
        />
        <StatCard
          title={lang === 'uk' ? t('adm2_b6337485cc') : 'Overdue'}
          value={summary.overdue || 0}
          icon={AlertTriangle}
          color="red"
          alert={summary.overdue > 0}
        />
        <StatCard
          title={lang === 'uk' ? t('adm2_6ae34c7ae6') : 'Total Value'}
          value={`$${Math.round(priceStats.totalValue || 0).toLocaleString()}`}
          icon={DollarSign}
          color="indigo"
        />
      </div>

      {/* Two-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Pending Contracts - Need Action */}
        <div className="bg-white rounded-lg border border-gray-200">
          <div className="p-4 border-b border-gray-200 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
              <Clock className="w-5 h-5 text-blue-500" />
              {lang === 'uk' ? t('adm2_dd52fb6913') : 'Awaiting Signature'}
              {data?.pendingContracts?.length > 0 && (
                <span className="px-2 py-0.5 text-xs bg-blue-100 text-blue-600 rounded-md">
                  {data.pendingContracts.length}
                </span>
              )}
            </h2>
          </div>
          
          <div className="divide-y divide-gray-100 max-h-96 overflow-y-auto">
            {data?.pendingContracts?.length === 0 ? (
              <div className="p-8 text-center text-gray-500">
                {lang === 'uk' ? t('adm2_500446dffa') : 'No pending contracts'}
              </div>
            ) : (
              data?.pendingContracts?.map((contract) => (
                <ContractRow
                  key={contract.id}
                  contract={contract}
                  lang={lang}
                  onClick={() => setSelectedContract(contract)}
                />
              ))
            )}
          </div>
        </div>

        {/* Recently Signed */}
        <div className="bg-white rounded-lg border border-gray-200">
          <div className="p-4 border-b border-gray-200 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-emerald-500" />
              {lang === 'uk' ? t('adm2_383568d594') : 'Recently Signed'}
            </h2>
          </div>
          
          <div className="divide-y divide-gray-100 max-h-96 overflow-y-auto">
            {data?.recentlySigned?.length === 0 ? (
              <div className="p-8 text-center text-gray-500">
                {lang === 'uk' ? t('adm2_cecc950bf9') : 'No signed contracts'}
              </div>
            ) : (
              data?.recentlySigned?.map((contract) => (
                <ContractRow
                  key={contract.id}
                  contract={contract}
                  lang={lang}
                  onClick={() => setSelectedContract(contract)}
                />
              ))
            )}
          </div>
        </div>
      </div>

      {/* Overdue Contracts Alert */}
      {data?.overdueContracts?.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-center gap-3 mb-3">
            <AlertTriangle className="w-5 h-5 text-red-600" />
            <h3 className="font-semibold text-red-900">
              {lang === 'uk' ? t('adm2_993c268aae') : 'Overdue Contracts'} ({data.overdueContracts.length})
            </h3>
          </div>
          <div className="space-y-2">
            {data.overdueContracts.map((contract) => (
              <div 
                key={contract.id}
                className="flex items-center justify-between bg-white rounded-lg p-3 border border-red-200"
              >
                <div>
                  <div className="font-medium text-gray-900">{contract.customerName}</div>
                  <div className="text-sm text-gray-500">{contract.title}</div>
                </div>
                <button
                  onClick={() => setSelectedContract(contract)}
                  className="px-3 py-1 text-sm bg-red-100 text-red-700 rounded-lg hover:bg-red-200"
                >
                  {lang === 'uk' ? t('adm2_08036eee72') : 'View'}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Contract Detail Modal */}
      {selectedContract && (
        <ContractDetailModal
          contract={selectedContract}
          lang={lang}
          onClose={() => setSelectedContract(null)}
        />
      )}
    </div>
  );
}

function StatCard({ title, value, icon: Icon, color, trend, alert }) {
  const colorClasses = {
    gray: 'bg-gray-50 border-gray-200 text-gray-600',
    emerald: 'bg-emerald-50 border-emerald-200 text-emerald-600',
    blue: 'bg-blue-50 border-blue-200 text-blue-600',
    red: 'bg-red-50 border-red-200 text-red-600',
    indigo: 'bg-indigo-50 border-indigo-200 text-indigo-600',
  };

  return (
    <div className={`p-4 rounded-lg border ${colorClasses[color]} ${alert ? 'animate-pulse' : ''}`}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm opacity-80">{title}</p>
          <p className="text-2xl font-bold">{value}</p>
          {trend && (
            <p className="text-xs flex items-center gap-1 mt-1">
              <TrendingUp className="w-3 h-3" />
              {trend}
            </p>
          )}
        </div>
        <Icon className="w-8 h-8 opacity-50" />
      </div>
    </div>
  );
}

function ContractRow({ contract, lang, onClick }) {
  const { t } = useLang();
  const status = STATUS_CONFIG[contract.status] || STATUS_CONFIG.draft;
  const StatusIcon = status.icon;

  return (
    <div
      className="p-4 hover:bg-gray-50 cursor-pointer transition flex items-center justify-between"
      onClick={onClick}
      data-testid={`contract-row-${contract.id}`}
    >
      <div className="flex items-center gap-3">
        <div className={`p-2 rounded-lg bg-${status.color}-100`}>
          <StatusIcon className={`w-4 h-4 text-${status.color}-600`} />
        </div>
        <div>
          <div className="font-medium text-gray-900">{contract.customerName || t('adm2_a11056e526')}</div>
          <div className="text-sm text-gray-500">{contract.title}</div>
          {contract.price && (
            <div className="text-sm font-semibold text-gray-700">${contract.price.toLocaleString()}</div>
          )}
        </div>
      </div>
      <div className="flex items-center gap-3">
        <div className="text-right">
          <span className={`px-2 py-1 text-xs rounded-md bg-${status.color}-100 text-${status.color}-700`}>
            {status.label[lang] || status.label.en}
          </span>
          <div className="text-xs text-gray-400 mt-1">
            {contract.createdAt && new Date(contract.createdAt).toLocaleDateString()}
          </div>
        </div>
        <ChevronRight className="w-4 h-4 text-gray-400" />
      </div>
    </div>
  );
}

function ContractDetailModal({ contract, lang, onClose }) {
  const { t } = useLang();
  const status = STATUS_CONFIG[contract.status] || STATUS_CONFIG.draft;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div 
        className="bg-white rounded-lg max-w-lg w-full overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className={`p-4 bg-${status.color}-50 border-b`}>
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">{contract.title}</h3>
            <span className={`px-2 py-1 text-xs rounded-md bg-${status.color}-200 text-${status.color}-700`}>
              {status.label[lang] || status.label.en}
            </span>
          </div>
        </div>
        
        <div className="p-4 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-gray-500">{lang === 'uk' ? t('adm2_313ec9c7c2') : 'Customer'}</p>
              <p className="font-medium">{contract.customerName || '-'}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">{t("emailLabel")}</p>
              <p className="font-medium">{contract.customerEmail || '-'}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">{lang === 'uk' ? t('adm2_345805b88b') : 'Type'}</p>
              <p className="font-medium">{contract.type?.replace(/_/g, ' ')}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">{lang === 'uk' ? t('adm2_3bed8fba01') : 'Amount'}</p>
              <p className="font-medium text-lg">${contract.price?.toLocaleString() || '0'}</p>
            </div>
          </div>
          
          {contract.vehicleTitle && (
            <div className="bg-gray-50 rounded-lg p-3">
              <p className="text-sm text-gray-500">{lang === 'uk' ? t('adm2_6c12ce55e8') : 'Vehicle'}</p>
              <p className="font-medium">{contract.vehicleTitle}</p>
              {contract.vin && <p className="text-sm text-gray-500 font-mono">VIN: {contract.vin}</p>}
            </div>
          )}
          
          <div className="border-t pt-4 space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">{lang === 'uk' ? t('adm2_6268a9fafc') : 'Created'}</span>
              <span>{contract.createdAt && new Date(contract.createdAt).toLocaleString()}</span>
            </div>
            {contract.sentAt && (
              <div className="flex justify-between">
                <span className="text-gray-500">{lang === 'uk' ? t('adm2_9551a2a022') : 'Sent'}</span>
                <span>{new Date(contract.sentAt).toLocaleString()}</span>
              </div>
            )}
            {contract.signedAt && (
              <div className="flex justify-between text-emerald-600">
                <span>{lang === 'uk' ? t('adm2_0dc2b733c3') : 'Signed'}</span>
                <span>{new Date(contract.signedAt).toLocaleString()}</span>
              </div>
            )}
          </div>
        </div>
        
        <div className="p-4 bg-gray-50 border-t flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
          >
            {lang === 'uk' ? t('adm2_41a707dea9') : 'Close'}
          </button>
        </div>
      </div>
    </div>
  );
}
