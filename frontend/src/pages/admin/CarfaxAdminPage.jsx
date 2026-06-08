/**
 * Admin Carfax Queue Page
 * 
 * /admin/carfax
 * 
 * Manager can:
 * - View pending requests queue
 * - Approve/Processing/Upload PDF
 * - Reject with reason
 * - View analytics
 */

import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { 
  FileText, 
  Clock, 
  CheckCircle, 
  Warning,
  Upload,
  X,
  Eye,
  CaretRight,
  ArrowClockwise,
  ChartBar,
  Users,
  Coins,
  Hourglass
} from '@phosphor-icons/react';
import { toast } from 'sonner';

import { useLang, getLocale } from '../../i18n';
const API_URL = process.env.REACT_APP_BACKEND_URL || 'http://localhost:8001';

// Status Badge
const StatusBadge = ({ status }) => {
  const { t } = useLang();
  const config = {
    pending: { color: 'amber', label: t('statusPending') },
    processing: { color: 'blue', label: t('adm_in_processing') },
    uploaded: { color: 'emerald', label: t('adm_loaded') },
    rejected: { color: 'red', label: t('statusRejected') },
  };
  const { color, label } = config[status] || config.pending;
  return (
    <span className={`px-2 py-1 rounded-full text-xs font-medium bg-${color}-100 text-${color}-700`}>
      {label}
    </span>
  );
};

// Upload Modal
const UploadModal = ({ request, onClose, onUpload }) => {
  const { t } = useLang();
  const [pdfUrl, setPdfUrl] = useState('');
  const [actualCost, setActualCost] = useState(45);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!pdfUrl.trim()) {
      toast.error(t('adm_enter_pdf_file_url'));
      return;
    }
    setLoading(true);
    try {
      await onUpload(request.id, pdfUrl, actualCost);
      onClose();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl max-w-md w-full p-6" onClick={e => e.stopPropagation()}>
        <h3 className="text-lg font-bold mb-4">{t('adm3_pdf_0a095f9cae')} {request.vin}</h3>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1">{t('adm_pdf_file_url')}</label>
            <input
              type="url"
              value={pdfUrl}
              onChange={(e) => setPdfUrl(e.target.value)}
              placeholder="https://..."
              className="w-full px-3 py-2 border rounded-lg"
              data-testid="pdf-url-input"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1">{t('adm3_e535cfc34d')}</label>
            <input
              type="number"
              value={actualCost}
              onChange={(e) => setActualCost(Number(e.target.value))}
              className="w-full px-3 py-2 border rounded-lg"
            />
          </div>
          <div className="flex gap-3">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-2 border rounded-lg">{t('cancelAction')}</button>
            <button 
              type="submit" 
              disabled={loading}
              className="flex-1 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50"
              data-testid="upload-pdf-submit"
            >
              {loading ? t('adm3_1fcad6dc13') : t('adm3_226da39f12')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// Reject Modal
const RejectModal = ({ request, onClose, onReject }) => {
  const { t } = useLang();
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!reason.trim()) {
      toast.error(t('adm_specify_rejection_reason'));
      return;
    }
    setLoading(true);
    try {
      await onReject(request.id, reason);
      onClose();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl max-w-md w-full p-6" onClick={e => e.stopPropagation()}>
        <h3 className="text-lg font-bold mb-4">{t('adm3_506f69de2f')} {request.vin}</h3>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1">{t('adm_reason_for_rejection')}</label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={t('adm_enter_reason')}
              rows={3}
              className="w-full px-3 py-2 border rounded-lg"
              data-testid="reject-reason-input"
            />
          </div>
          <div className="flex gap-3">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-2 border rounded-lg">{t('cancelAction')}</button>
            <button 
              type="submit" 
              disabled={loading}
              className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
              data-testid="reject-submit"
            >
              {loading ? '...' : t('adm3_4090f35a99')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// Main Component
export default function CarfaxAdminPage() {
  const { t } = useLang();
  const [requests, setRequests] = useState([]);
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('queue'); // queue, all
  const [uploadModal, setUploadModal] = useState(null);
  const [rejectModal, setRejectModal] = useState(null);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [queueRes, analyticsRes] = await Promise.all([
        axios.get(`${API_URL}/api/carfax/admin/queue`),
        axios.get(`${API_URL}/api/carfax/admin/analytics`),
      ]);
      setRequests(Array.isArray(queueRes.data) ? queueRes.data : []);
      setAnalytics(analyticsRes.data);
    } catch (err) {
      console.error('Failed to load data:', err);
      toast.error(t('loadingError'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleApprove = async (id) => {
    try {
      await axios.patch(`${API_URL}/api/carfax/${id}/approve`);
      toast.success(t('adm_request_accepted_for_processing'));
      loadData();
    } catch (err) {
      toast.error(t('errorGeneric'));
    }
  };

  const handleUpload = async (id, pdfUrl, actualCost) => {
    try {
      await axios.post(`${API_URL}/api/carfax/${id}/upload-pdf`, { pdfUrl, actualCost });
      toast.success(t('adm_pdf_uploaded_successfully'));
      loadData();
    } catch (err) {
      toast.error(t('loadingError'));
      throw err;
    }
  };

  const handleReject = async (id, reason) => {
    try {
      await axios.patch(`${API_URL}/api/carfax/${id}/reject`, { reason });
      toast.success(t('adm_request_declined'));
      loadData();
    } catch (err) {
      toast.error(t('errorGeneric'));
      throw err;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin w-8 h-8 border-2 border-zinc-900 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="carfax-admin-page">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-xl bg-blue-100">
            <FileText size={24} weight="fill" className="text-blue-700" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-zinc-900">{t('adm_carfax_queue')}</h1>
            <p className="text-zinc-500">{t('adm_processing_report_requests')}</p>
          </div>
        </div>
        <button
          onClick={loadData}
          className="p-2 rounded-xl hover:bg-zinc-100 transition-colors"
        >
          <ArrowClockwise size={20} className="text-zinc-600" />
        </button>
      </div>

      {/* Analytics Cards */}
      {analytics && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <div className="bg-white rounded-xl p-4 border">
            <div className="flex items-center gap-2 text-zinc-500 text-sm mb-1">
              <ChartBar size={16} />
              {t('adm_total_3')}
            </div>
            <p className="text-2xl font-bold">{analytics.totalRequests}</p>
          </div>
          <div className="bg-amber-50 rounded-xl p-4 border border-amber-200">
            <div className="flex items-center gap-2 text-amber-600 text-sm mb-1">
              <Hourglass size={16} />
              {t('adm_in_queue')}
            </div>
            <p className="text-2xl font-bold text-amber-700">{analytics.pendingRequests}</p>
          </div>
          <div className="bg-blue-50 rounded-xl p-4 border border-blue-200">
            <div className="flex items-center gap-2 text-blue-600 text-sm mb-1">
              <Clock size={16} />
              {t('adm_in_processing')}
            </div>
            <p className="text-2xl font-bold text-blue-700">{analytics.processingRequests}</p>
          </div>
          <div className="bg-emerald-50 rounded-xl p-4 border border-emerald-200">
            <div className="flex items-center gap-2 text-emerald-600 text-sm mb-1">
              <CheckCircle size={16} />{t('done')}</div>
            <p className="text-2xl font-bold text-emerald-700">{analytics.uploadedRequests}</p>
          </div>
          <div className="bg-zinc-50 rounded-xl p-4 border">
            <div className="flex items-center gap-2 text-zinc-500 text-sm mb-1">
              <Coins size={16} />
              {t('adm_expenses')}
            </div>
            <p className="text-2xl font-bold">${analytics.totalCost}</p>
            {analytics.costSaved > 0 && (
              <p className="text-xs text-emerald-600">{t('adm3_1db72e482f')}{analytics.costSaved}</p>
            )}
          </div>
        </div>
      )}

      {/* Queue Table */}
      <div className="bg-white rounded-2xl border overflow-hidden">
        <div className="px-6 py-4 border-b bg-zinc-50">
          <h2 className="font-semibold">{t('adm_request_queue')}</h2>
        </div>
        
        {requests.length === 0 ? (
          <div className="text-center py-12 text-zinc-500">
            <CheckCircle size={48} className="mx-auto mb-3 text-emerald-300" />
            <p>{t('queueEmpty')}</p>
          </div>
        ) : (
          <div className="divide-y">
            {requests.map(request => (
              <div key={request.id} className="px-6 py-4 hover:bg-zinc-50 transition-colors">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div>
                      <p className="font-mono font-semibold">{request.vin}</p>
                      <p className="text-sm text-zinc-500">
                        {request.userName} • {new Date(request.createdAt).toLocaleString(getLocale())}
                      </p>
                    </div>
                    <StatusBadge status={request.status} />
                  </div>
                  
                  <div className="flex items-center gap-2">
                    {request.status === 'pending' && (
                      <>
                        <button
                          onClick={() => handleApprove(request.id)}
                          className="px-3 py-1.5 bg-blue-100 text-blue-700 rounded-lg text-sm hover:bg-blue-200"
                          data-testid={`approve-${request.id}`}
                        >
                          {t('adm_for_processing')}
                        </button>
                        <button
                          onClick={() => setRejectModal(request)}
                          className="px-3 py-1.5 bg-red-100 text-red-700 rounded-lg text-sm hover:bg-red-200"
                          data-testid={`reject-btn-${request.id}`}
                        >
                          {t('adm_reject')}
                        </button>
                      </>
                    )}
                    {request.status === 'processing' && (
                      <>
                        <button
                          onClick={() => setUploadModal(request)}
                          className="flex items-center gap-1 px-3 py-1.5 bg-emerald-100 text-emerald-700 rounded-lg text-sm hover:bg-emerald-200"
                          data-testid={`upload-btn-${request.id}`}
                        >
                          <Upload size={14} />
                          {t('adm_download_pdf')}
                        </button>
                        <button
                          onClick={() => setRejectModal(request)}
                          className="px-3 py-1.5 bg-red-100 text-red-700 rounded-lg text-sm hover:bg-red-200"
                        >
                          {t('adm_reject')}
                        </button>
                      </>
                    )}
                    {request.status === 'uploaded' && request.pdfUrl && (
                      <a
                        href={request.pdfUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 px-3 py-1.5 bg-zinc-100 text-zinc-700 rounded-lg text-sm hover:bg-zinc-200"
                      >
                        <Eye size={14} />
                        {t('adm_view_2')}
                      </a>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Manager Stats */}
      {analytics?.byManager?.length > 0 && (
        <div className="bg-white rounded-2xl border overflow-hidden">
          <div className="px-6 py-4 border-b bg-zinc-50">
            <h2 className="font-semibold flex items-center gap-2">
              <Users size={18} />
              {t('adm_statistics_by_managers')}
            </h2>
          </div>
          <div className="divide-y">
            {analytics.byManager.map(m => (
              <div key={m._id} className="px-6 py-3 flex items-center justify-between">
                <span className="font-medium">{m.managerName || m._id}</span>
                <div className="flex items-center gap-4 text-sm">
                  <span className="text-zinc-500">{t('adm3_fdfbb7a2aa')} {m.processed}</span>
                  <span className="text-emerald-600">{t('adm3_627ce58368')} {m.uploaded}</span>
                  <span className="text-red-600">{t('adm3_ca877ce88a')} {m.rejected}</span>
                  <span className="font-medium">${m.totalCost}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Modals */}
      {uploadModal && (
        <UploadModal
          request={uploadModal}
          onClose={() => setUploadModal(null)}
          onUpload={handleUpload}
        />
      )}
      {rejectModal && (
        <RejectModal
          request={rejectModal}
          onClose={() => setRejectModal(null)}
          onReject={handleReject}
        />
      )}
    </div>
  );
}
