/**
 * Proxy Manager Page
 * 
 * Керування проксі серверами для парсерів
 * Тільки для MASTER_ADMIN
 */

import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { useAuth, API_URL } from '../App';
import { useNavigate } from 'react-router-dom';
import { useLang } from '../i18n';
import {
  ArrowLeft,
  Plus,
  Trash,
  Lightning,
  CheckCircle,
  XCircle,
  Clock,
  CircleNotch,
  Shield,
  Globe,
  ArrowsClockwise,
} from '@phosphor-icons/react';

const ProxyManager = () => {
  const { t } = useLang();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [proxyData, setProxyData] = useState({ proxies: [], total: 0, enabled: 0, available: 0 });
  const [loading, setLoading] = useState(true);
  const [testing, setTesting] = useState(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newProxy, setNewProxy] = useState({ server: '', username: '', password: '', priority: 1 });

  const isMasterAdmin = ['master_admin'].includes(user?.role);

  useEffect(() => {
    if (!isMasterAdmin) {
      navigate('/admin/parser');
      return;
    }
  }, [isMasterAdmin, navigate]);

  const fetchProxies = useCallback(async () => {
    try {
      const res = await axios.get(`${API_URL}/api/ingestion/admin/proxies`);
      setProxyData(res.data);
    } catch (error) {
      toast.error(t('adm_proxy_loading_error'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProxies();
  }, [fetchProxies]);

  const handleAddProxy = async (e) => {
    e.preventDefault();
    try {
      await axios.post(`${API_URL}/api/ingestion/admin/proxies`, newProxy);
      toast.success(t('adm_proxy_added'));
      setShowAddModal(false);
      setNewProxy({ server: '', username: '', password: '', priority: 1 });
      fetchProxies();
    } catch (error) {
      toast.error(error.response?.data?.message || t('adm2_696383def8'));
    }
  };

  const handleToggle = async (id, enabled) => {
    try {
      if (enabled) {
        await axios.post(`${API_URL}/api/ingestion/admin/proxies/${id}/disable`);
        toast.success(t('adm_proxy_disabled'));
      } else {
        await axios.post(`${API_URL}/api/ingestion/admin/proxies/${id}/enable`);
        toast.success(t('adm_proxy_enabled'));
      }
      fetchProxies();
    } catch (error) {
      toast.error(t('adm_status_change_error'));
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm(t('adm2_17c4b661f3'))) return;
    try {
      await axios.delete(`${API_URL}/api/ingestion/admin/proxies/${id}`);
      toast.success(t('adm_proxy_deleted'));
      fetchProxies();
    } catch (error) {
      toast.error(t('adm_deletion_error'));
    }
  };

  const handleTest = async (id) => {
    setTesting(id);
    try {
      const res = await axios.post(`${API_URL}/api/ingestion/admin/proxies/${id}/test`);
      const result = res.data.results?.[0];
      if (result) {
        const successCount = result.tests.filter(t => t.success).length;
        toast.success(`${t('r9_test_complete')}${successCount}/${result.tests.length}${t('r9_successfully')}`);
      }
      fetchProxies();
    } catch (error) {
      toast.error(t('adm_testing_error_2'));
    } finally {
      setTesting(null);
    }
  };

  const handleTestAll = async () => {
    setTesting('all');
    try {
      const res = await axios.post(`${API_URL}/api/ingestion/admin/proxies/test`);
      toast.success(`${t('r9_testing_complete_for')}${res.data.results?.length || 0}${t('r9_proxies')}`);
      fetchProxies();
    } catch (error) {
      toast.error(t('adm_testing_error_2'));
    } finally {
      setTesting(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <CircleNotch size={32} className="animate-spin text-[#18181B]" />
      </div>
    );
  }

  return (
    <div data-testid="proxy-manager-page">
      {/* Header - Mobile responsive */}
      <div className="mb-6">
        <div className="flex items-center gap-4 mb-4">
          <button
            onClick={() => navigate('/admin/parser')}
            className="p-2 hover:bg-[#F4F4F5] rounded-lg transition-colors"
          >
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-[#18181B]">{t('adm_proxy_manager')}</h1>
            <p className="text-[#71717A]">{t('adm_proxy_server_management')}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleTestAll}
            disabled={testing}
            className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2.5 border border-[#E4E4E7] rounded-xl hover:bg-[#F4F4F5] transition-colors disabled:opacity-50"
            data-testid="test-all-btn"
          >
            {testing === 'all' ? <CircleNotch size={18} className="animate-spin" /> : <ArrowsClockwise size={18} />}
            <span>{t('testAll') || t('adm2_92a1db6c15')}</span>
          </button>
          <button
            onClick={() => setShowAddModal(true)}
            className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2.5 bg-[#18181B] text-white rounded-xl hover:bg-[#27272A] transition-colors"
            data-testid="add-proxy-btn"
          >
            <Plus size={18} />
            <span>{t('addProxy') || t('adm2_ad0ed60042')}</span>
          </button>
        </div>
      </div>

      {/* Stats - 2x2 grid on mobile */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <div className="bg-white rounded-xl border border-[#E4E4E7] p-4 text-center">
          <p className="text-2xl sm:text-3xl font-bold text-[#18181B]">{proxyData.total}</p>
          <p className="text-xs sm:text-sm text-[#71717A]">{t('adm_total_3')}</p>
        </div>
        <div className="bg-white rounded-xl border border-[#E4E4E7] p-4 text-center">
          <p className="text-2xl sm:text-3xl font-bold text-green-600">{proxyData.enabled}</p>
          <p className="text-xs sm:text-sm text-[#71717A]">{t('adm_enabled')}</p>
        </div>
        <div className="bg-white rounded-xl border border-[#E4E4E7] p-4 text-center">
          <p className="text-2xl sm:text-3xl font-bold text-blue-600">{proxyData.available}</p>
          <p className="text-xs sm:text-sm text-[#71717A]">{t('adm_available')}</p>
        </div>
        <div className="bg-white rounded-xl border border-[#E4E4E7] p-4 text-center">
          <p className="text-2xl sm:text-3xl font-bold text-yellow-600">{proxyData.total - proxyData.available}</p>
          <p className="text-xs sm:text-sm text-[#71717A]">{t('adm_cooldown')}</p>
        </div>
      </div>

      {/* Proxy List - with horizontal scroll */}
      <div className="bg-white rounded-2xl border border-[#E4E4E7] overflow-x-auto">
        <table className="w-full min-w-[800px]">
          <thead className="bg-[#F4F4F5]">
            <tr>
              <th className="text-left px-6 py-3 text-xs font-medium text-[#71717A] uppercase">ID</th>
              <th className="text-left px-6 py-3 text-xs font-medium text-[#71717A] uppercase">{t('adm_server')}</th>
              <th className="text-left px-6 py-3 text-xs font-medium text-[#71717A] uppercase">{t('adm_priority')}</th>
              <th className="text-left px-6 py-3 text-xs font-medium text-[#71717A] uppercase">{t('adm_status_2')}</th>
              <th className="text-left px-6 py-3 text-xs font-medium text-[#71717A] uppercase">{t('adm_success')}</th>
              <th className="text-left px-6 py-3 text-xs font-medium text-[#71717A] uppercase">{t('adm_errors')}</th>
              <th className="text-left px-6 py-3 text-xs font-medium text-[#71717A] uppercase">{t('adm_actions_2')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#E4E4E7]">
            {proxyData.proxies?.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-6 py-12 text-center text-[#71717A]">
                  <Globe size={48} className="mx-auto mb-3 opacity-30" />
                  <p>{t('adm_no_configured_proxies')}</p>
                  <p className="text-sm">{t('adm_add_proxy_for_parsers_to_work')}</p>
                </td>
              </tr>
            ) : (
              proxyData.proxies?.map((proxy) => (
                <tr key={proxy.id} className="hover:bg-[#FAFAFA]" data-testid={`proxy-row-${proxy.id}`}>
                  <td className="px-6 py-4 text-sm">#{proxy.id}</td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <Shield size={16} className={proxy.has_auth ? 'text-green-500' : 'text-gray-300'} />
                      <span className="text-sm">{proxy.server}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className="px-2 py-1 bg-[#F4F4F5] rounded text-sm">{proxy.priority}</span>
                  </td>
                  <td className="px-6 py-4">
                    {proxy.enabled ? (
                      proxy.in_cooldown ? (
                        <span className="inline-flex items-center gap-1 px-2 py-1 bg-yellow-100 text-yellow-700 rounded-full text-xs">
                          <Clock size={12} />
                          {t('adm_cooldown')}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-1 bg-green-100 text-green-700 rounded-full text-xs">
                          <CheckCircle size={12} weight="fill" />
                          {t('adm_active')}
                        </span>
                      )
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-1 bg-gray-100 text-gray-600 rounded-full text-xs">
                        <XCircle size={12} />
                        {t('adm_disabled')}
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-green-600 font-medium">{proxy.success_count}</td>
                  <td className="px-6 py-4 text-red-500 font-medium">{proxy.error_count}</td>
                  <td className="px-6 py-4">
                    <div className="flex gap-1">
                      <button
                        onClick={() => handleTest(proxy.id)}
                        disabled={testing}
                        className="p-2 hover:bg-[#F4F4F5] rounded-lg transition-colors disabled:opacity-50"
                        title={t('adm_test_2')}
                      >
                        {testing === proxy.id ? (
                          <CircleNotch size={16} className="animate-spin" />
                        ) : (
                          <Lightning size={16} />
                        )}
                      </button>
                      <button
                        onClick={() => handleToggle(proxy.id, proxy.enabled)}
                        className="p-2 hover:bg-[#F4F4F5] rounded-lg transition-colors"
                        title={proxy.enabled ? t('disable') || 'Disable' : t('enable') || 'Enable'}
                      >
                        <ArrowsClockwise size={16} />
                      </button>
                      <button
                        onClick={() => handleDelete(proxy.id)}
                        className="p-2 hover:bg-red-50 text-red-500 rounded-lg transition-colors"
                        title={t('delete') || 'Delete'}
                      >
                        <Trash size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Add Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md">
            <h2 className="text-xl font-bold mb-4">{t('adm_add_proxy')}</h2>
            <form onSubmit={handleAddProxy} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">{t('adm_server_2')}</label>
                <input
                  type="text"
                  value={newProxy.server}
                  onChange={(e) => setNewProxy({ ...newProxy, server: e.target.value })}
                  placeholder="http://proxy.example.com:8080"
                  className="w-full px-4 py-2.5 border border-[#E4E4E7] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#18181B]"
                  required
                  data-testid="proxy-server-input"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">{t('adm_username')}</label>
                  <input
                    type="text"
                    value={newProxy.username}
                    onChange={(e) => setNewProxy({ ...newProxy, username: e.target.value })}
                    className="w-full px-4 py-2.5 border border-[#E4E4E7] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#18181B]"
                    data-testid="proxy-username-input"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">{t('adm_password')}</label>
                  <input
                    type="password"
                    value={newProxy.password}
                    onChange={(e) => setNewProxy({ ...newProxy, password: e.target.value })}
                    className="w-full px-4 py-2.5 border border-[#E4E4E7] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#18181B]"
                    data-testid="proxy-password-input"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">{t('adm_priority')}</label>
                <input
                  type="number"
                  value={newProxy.priority}
                  onChange={(e) => setNewProxy({ ...newProxy, priority: parseInt(e.target.value) || 1 })}
                  min={1}
                  className="w-full px-4 py-2.5 border border-[#E4E4E7] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#18181B]"
                  data-testid="proxy-priority-input"
                />
              </div>
              <div className="flex gap-2 pt-4">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="flex-1 px-4 py-2.5 border border-[#E4E4E7] rounded-xl hover:bg-[#F4F4F5]"
                >
                  {t('adm_cancel_3')}
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2.5 bg-[#18181B] text-white rounded-xl hover:bg-[#27272A]"
                  data-testid="save-proxy-btn"
                >
                  {t('adm_add')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProxyManager;
