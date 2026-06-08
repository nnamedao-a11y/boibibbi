/**
 * Cabinet Carfax Page
 * 
 * /cabinet/carfax
 * 
 * User can:
 * - Request Carfax by VIN
 * - View request status
 * - Download PDF when ready
 */

import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { useLang, getLocale } from '../../i18n';
import RefreshButton from '../../components/ui/RefreshButton';
import { 
  FileText, 
  Clock, 
  CheckCircle, 
  Warning,
  Download,
  Plus,
  ArrowClockwise,
  MagnifyingGlass,
  Car,
  Hourglass,
  X
} from '@phosphor-icons/react';
import { toast } from 'sonner';

const API_URL = process.env.REACT_APP_BACKEND_URL || 'http://localhost:8001';

// Status Badge Component
const StatusBadge = ({ status }) => {
  const { t } = useLang();
  const config = {
    pending: { color: 'amber', icon: Hourglass, label: t('adm3_2dbeb02be1') },
    processing: { color: 'blue', icon: Clock, label: t('adm3_870f9ac840') },
    uploaded: { color: 'emerald', icon: CheckCircle, label: t('adm3_34e1413d65') },
    rejected: { color: 'red', icon: X, label: t('adm3_f8591051d0') },
    expired: { color: 'zinc', icon: Warning, label: t('adm3_86ad3da2c7') },
  };

  const { color, icon: Icon, label } = config[status] || config.pending;

  return (
    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium
      bg-${color}-100 text-${color}-700`}
      data-testid={`carfax-status-${status}`}
    >
      <Icon size={14} weight="fill" />
      {label}
    </span>
  );
};

// Request Card Component
const RequestCard = ({ request, onDownload }) => {
  const { t } = useLang();
  const isReady = request.status === 'uploaded';
  const isPending = request.status === 'pending' || request.status === 'processing';
  
  return (
    <div 
      className={`bg-white rounded-2xl border transition-all 
        ${isReady ? 'border-emerald-200 hover:shadow-md' : 'border-zinc-200'}`}
      data-testid={`carfax-request-${request.vin}`}
    >
      {/* Header */}
      <div className={`px-6 py-4 border-b ${isReady ? 'bg-emerald-50' : 'bg-zinc-50'}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-xl ${isReady ? 'bg-emerald-200' : 'bg-zinc-200'}`}>
              <Car size={20} className={isReady ? 'text-emerald-700' : 'text-zinc-600'} weight="fill" />
            </div>
            <div>
              <p className="font-mono font-semibold text-zinc-900">{request.vin}</p>
              <p className="text-xs text-zinc-500">
                {new Date(request.createdAt).toLocaleDateString(getLocale())}
              </p>
            </div>
          </div>
          <StatusBadge status={request.status} />
        </div>
      </div>

      {/* Content */}
      <div className="p-6">
        {/* Status Messages */}
        {isPending && (
          <div className="flex items-center gap-3 p-4 bg-amber-50 rounded-xl mb-4">
            <Hourglass size={24} className="text-amber-500 animate-pulse" />
            <div>
              <p className="font-medium text-amber-800">{t('adm3_1_2_136172558e')}</p>
              <p className="text-sm text-amber-600">{t('adm3_207aefc8c8')}</p>
            </div>
          </div>
        )}

        {request.status === 'rejected' && (
          <div className="flex items-start gap-3 p-4 bg-red-50 rounded-xl mb-4">
            <Warning size={24} className="text-red-500 mt-0.5" />
            <div>
              <p className="font-medium text-red-800">{t('adm3_d06ab0717c')}</p>
              <p className="text-sm text-red-600">{request.rejectReason || t('adm3_16433ac1e8')}</p>
            </div>
          </div>
        )}

        {isReady && (
          <div className="flex items-center justify-between p-4 bg-emerald-50 rounded-xl mb-4">
            <div className="flex items-center gap-3">
              <FileText size={24} className="text-emerald-600" />
              <div>
                <p className="font-medium text-emerald-800">{t('adm3_0e1c6e3333')}</p>
                <p className="text-sm text-emerald-600">{request.pdfFilename || 'carfax-report.pdf'}</p>
              </div>
            </div>
            <button
              onClick={() => onDownload(request)}
              className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-xl 
                hover:bg-emerald-700 transition-colors"
              data-testid={`download-carfax-${request.vin}`}
            >
              <Download size={18} />
              {t('adm3_226da39f12')}
            </button>
          </div>
        )}

        {/* Meta Info */}
        <div className="flex items-center justify-between text-sm text-zinc-500 pt-4 border-t">
          <span>
            {request.managerName && `${t('r9_manager_label')} ${request.managerName}`}
          </span>
          {request.expiresAt && (
            <span>
              {t('r9_valid_until')} {new Date(request.expiresAt).toLocaleDateString(getLocale())}
            </span>
          )}
        </div>
      </div>
    </div>
  );
};

// New Request Modal
const NewRequestModal = ({ onClose, onSubmit }) => {
  const { t } = useLang();
  const [vin, setVin] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (vin.length !== 17) {
      toast.error(t('adm3_40049a1c16'));
      return;
    }

    setLoading(true);
    try {
      await onSubmit(vin);
      onClose();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div 
        className="bg-white rounded-2xl max-w-md w-full p-6"
        onClick={e => e.stopPropagation()}
      >
        <h2 className="text-xl font-bold text-zinc-900 mb-4">{t('adm3_carfax_9c7f0cd944')}</h2>
        
        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label className="block text-sm font-medium text-zinc-700 mb-2">
              {t('adm3_0cd1680a29')}
            </label>
            <input
              type="text"
              value={vin}
              onChange={(e) => setVin(e.target.value.toUpperCase().slice(0, 17))}
              placeholder={t('adm3_57e94a61ea')}
              className="w-full px-4 py-3 rounded-xl border border-zinc-200 focus:border-zinc-400 outline-none
                font-mono text-lg tracking-wide"
              data-testid="carfax-vin-input"
            />
            <p className="text-xs text-zinc-500 mt-1">{vin.length}{t('adm3_17_acab7e37cc')}</p>
          </div>

          <div className="bg-amber-50 rounded-xl p-4 mb-6">
            <p className="text-sm text-amber-800">
              <strong>{t('adm3_b30d8108a3')}</strong> {t('adm3_da31b62b2e')}
            </p>
          </div>

          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-3 border border-zinc-200 rounded-xl hover:bg-zinc-50 transition-colors"
            >
              {t('adm3_d9cfba143c')}
            </button>
            <button
              type="submit"
              disabled={vin.length !== 17 || loading}
              className="flex-1 px-4 py-3 bg-zinc-900 text-white rounded-xl hover:bg-zinc-800 
                transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              data-testid="submit-carfax-request"
            >
              {loading ? t('adm3_e1089fa4a3') : t('adm3_019240eed9')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// Main Component
export default function CarfaxPage() {
  const { t } = useLang();
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showNewRequest, setShowNewRequest] = useState(false);

  const loadRequests = useCallback(async () => {
    try {
      setLoading(true);
      const res = await axios.get(`${API_URL}/api/carfax/me`);
      setRequests(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      console.error('Failed to load Carfax requests:', err);
      toast.error(t('adm3_60b3407c30'));
      setRequests([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadRequests();
  }, [loadRequests]);

  const handleCreateRequest = async (vin) => {
    try {
      const res = await axios.post(`${API_URL}/api/carfax/request`, { vin });
      toast.success(t('adm3_d247938311'));
      loadRequests();
    } catch (err) {
      toast.error(err.response?.data?.message || t('adm3_eee4597860'));
      throw err;
    }
  };

  const handleDownload = (request) => {
    if (request.pdfUrl) {
      window.open(request.pdfUrl, '_blank');
    } else {
      toast.error(t('adm3_21a37e2f50'));
    }
  };

  const pendingCount = requests.filter(r => r.status === 'pending' || r.status === 'processing').length;
  const readyCount = requests.filter(r => r.status === 'uploaded').length;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin w-8 h-8 border-2 border-zinc-900 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="carfax-cabinet-page">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-xl bg-blue-100">
            <FileText size={24} weight="fill" className="text-blue-700" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-zinc-900">{t('adm3_carfax_52ee7e5f51')}</h1>
            <p className="text-zinc-500">{t('adm3_4154dac865')}</p>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          <RefreshButton
            onClick={loadRequests}
            ariaLabel="Refresh"
            testId="refresh-carfax"
          />
          <button
            onClick={() => setShowNewRequest(true)}
            className="flex items-center gap-2 px-4 py-2 bg-zinc-900 text-white rounded-xl 
              hover:bg-zinc-800 transition-colors"
            data-testid="new-carfax-request"
          >
            <Plus size={18} />
            {t('adm3_e4dbc88ae0')}
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl p-4 border border-zinc-200">
          <p className="text-2xl font-bold text-zinc-900">{requests.length}</p>
          <p className="text-sm text-zinc-500">{t('adm3_570cae4561')}</p>
        </div>
        <div className="bg-amber-50 rounded-xl p-4 border border-amber-200">
          <p className="text-2xl font-bold text-amber-700">{pendingCount}</p>
          <p className="text-sm text-amber-600">{t('adm3_870f9ac840')}</p>
        </div>
        <div className="bg-emerald-50 rounded-xl p-4 border border-emerald-200">
          <p className="text-2xl font-bold text-emerald-700">{readyCount}</p>
          <p className="text-sm text-emerald-600">{t('adm3_e4ddf859cb')}</p>
        </div>
        <div className="bg-blue-50 rounded-xl p-4 border border-blue-200">
          <p className="text-2xl font-bold text-blue-700">$45</p>
          <p className="text-sm text-blue-600">{t('adm3_9233b20784')}</p>
        </div>
      </div>

      {/* Requests List */}
      {requests.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-2xl border border-zinc-200">
          <FileText size={48} className="mx-auto mb-4 text-zinc-300" />
          <h3 className="text-lg font-medium text-zinc-700 mb-2">{t('adm3_23c9ed6fca')}</h3>
          <p className="text-zinc-500 mb-6">{t('adm3_vin_d1cea5c797')}</p>
          <button
            onClick={() => setShowNewRequest(true)}
            className="inline-flex items-center gap-2 px-6 py-3 bg-zinc-900 text-white rounded-xl 
              hover:bg-zinc-800 transition-colors"
          >
            <Plus size={18} />
            {t('adm3_6bf640b38e')}
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {requests.map(request => (
            <RequestCard
              key={request.id}
              request={request}
              onDownload={handleDownload}
            />
          ))}
        </div>
      )}

      {/* New Request Modal */}
      {showNewRequest && (
        <NewRequestModal
          onClose={() => setShowNewRequest(false)}
          onSubmit={handleCreateRequest}
        />
      )}
    </div>
  );
}
