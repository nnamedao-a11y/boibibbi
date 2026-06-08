import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { API_URL, useAuth } from '../App';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import { useLang } from '../i18n';
import { 
  Globe, 
  Plus, 
  Trash, 
  Check, 
  X,
  ArrowsClockwise,
  Lightning,
  ShieldCheck,
  Warning,
  Plugs,
  Eye,
  EyeSlash
} from '@phosphor-icons/react';
import WhiteSelect from '../components/ui/WhiteSelect';

const ProxySettings = () => {
  const { t } = useLang();
  const { user } = useAuth();
  const [proxies, setProxies] = useState([]);
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [testingId, setTestingId] = useState(null);
  const [showPasswords, setShowPasswords] = useState({});
  
  const [newProxy, setNewProxy] = useState({
    host: '',
    port: '',
    protocol: 'http',
    username: '',
    password: '',
    priority: 1
  });

  // Only master_admin can access
  const isMasterAdmin = ['master_admin'].includes(user?.role);

  useEffect(() => {
    if (isMasterAdmin) {
      fetchProxyStatus();
    }
  }, [isMasterAdmin]);

  const fetchProxyStatus = async () => {
    try {
      const res = await axios.get(`${API_URL}/api/admin/proxy/status`);
      setStatus(res.data);
      setProxies(res.data.proxies || []);
    } catch (err) {
      toast.error(t('proxyLoadError'));
    } finally {
      setLoading(false);
    }
  };

  const handleAddProxy = async (e) => {
    e.preventDefault();
    
    if (!newProxy.host || !newProxy.port) {
      toast.error(t('requiredFields') || 'Required fields');
      return;
    }

    try {
      await axios.post(`${API_URL}/api/admin/proxy/add`, {
        host: newProxy.host,
        port: parseInt(newProxy.port),
        protocol: newProxy.protocol,
        username: newProxy.username || undefined,
        password: newProxy.password || undefined,
        priority: parseInt(newProxy.priority) || 1
      });
      
      toast.success(t('proxyAdded'));
      setNewProxy({ host: '', port: '', protocol: 'http', username: '', password: '', priority: 1 });
      setShowAddForm(false);
      fetchProxyStatus();
    } catch (err) {
      toast.error(err.response?.data?.message || t('proxyAddError'));
    }
  };

  const handleRemoveProxy = async (id) => {
    if (!window.confirm(t('confirmDelete') || 'Delete?')) return;
    
    try {
      await axios.delete(`${API_URL}/api/admin/proxy/remove/${id}`);
      toast.success(t('proxyRemoved'));
      fetchProxyStatus();
    } catch (err) {
      toast.error(t('proxyDeleteError'));
    }
  };

  const handleToggleProxy = async (id, enabled) => {
    try {
      if (enabled) {
        await axios.post(`${API_URL}/api/admin/proxy/disable/${id}`);
      } else {
        await axios.post(`${API_URL}/api/admin/proxy/enable/${id}`);
      }
      toast.success(enabled ? t('proxyDisabled') : t('proxyEnabled'));
      fetchProxyStatus();
    } catch (err) {
      toast.error(t('proxyToggleError'));
    }
  };

  const handleTestProxy = async (id) => {
    setTestingId(id);
    try {
      const res = await axios.post(`${API_URL}/api/admin/proxy/test/${id}`);
      if (res.data.success) {
        toast.success(`${t('proxyWorking')} IP: ${res.data.ip || 'ok'}`);
      } else {
        toast.error(`${t('actionError')}: ${res.data.error || 'unknown'}`);
      }
      fetchProxyStatus();
    } catch (err) {
      toast.error(t('proxyTestError'));
    } finally {
      setTestingId(null);
    }
  };

  const handleSetPriority = async (id, priority) => {
    try {
      await axios.post(`${API_URL}/api/admin/proxy/priority/${id}`, { priority });
      toast.success(t('priorityUpdated'));
      fetchProxyStatus();
    } catch (err) {
      toast.error(t('actionError'));
    }
  };

  const handleReload = async () => {
    try {
      await axios.post(`${API_URL}/api/admin/proxy/reload`);
      toast.success(t('proxiesReloaded'));
      fetchProxyStatus();
    } catch (err) {
      toast.error(t('actionError'));
    }
  };

  const togglePasswordVisibility = (id) => {
    setShowPasswords(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const parseServer = (server) => {
    try {
      const url = new URL(server);
      return {
        protocol: url.protocol.replace(':', ''),
        host: url.hostname,
        port: url.port
      };
    } catch {
      return { protocol: 'http', host: server, port: '' };
    }
  };

  if (!isMasterAdmin) {
    return (
      <motion.div 
        initial={{ opacity: 0 }} 
        animate={{ opacity: 1 }}
        className="flex items-center justify-center h-[60vh]"
      >
        <div className="text-center">
          <ShieldCheck size={48} className="mx-auto text-[#71717A] mb-4" />
          <h2 className="text-lg font-semibold text-[#18181B] mb-2">{t('adm_access_denied')}</h2>
          <p className="text-sm text-[#71717A]">{t('adm_this_page_is_only_available_to_the_main_administra')}</p>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div 
      data-testid="proxy-settings-page"
      initial={{ opacity: 0, y: 10 }} 
      animate={{ opacity: 1, y: 0 }} 
      transition={{ duration: 0.3 }}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#18181B]" style={{ fontFamily: 'Mazzard, Mazzard H, Mazzard M, system-ui, sans-serif' }}>
            {t('adm_proxy_settings')}
          </h1>
          <p className="text-sm text-[#71717A] mt-1">{t('adm_proxy_server_management_for_parsers')}</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={handleReload}
            className="px-4 py-2 text-sm font-medium text-[#18181B] bg-[#F4F4F5] hover:bg-[#E4E4E7] rounded-lg flex items-center gap-2 transition-colors"
          >
            <ArrowsClockwise size={16} />
            {t('adm_reload_2')}
          </button>
          <button
            onClick={() => setShowAddForm(true)}
            className="px-4 py-2 text-sm font-medium text-white bg-[#0A0A0B] hover:bg-[#18181B] rounded-lg flex items-center gap-2 transition-colors"
          >
            <Plus size={16} />
            {t('adm_add_proxy')}
          </button>
        </div>
      </div>

      {/* Status Cards */}
      {status && (
        <div className="grid grid-cols-4 gap-4 mb-8">
          <div className="kpi-card">
            <div className="mb-3">
              <Globe size={24} weight="duotone" className="text-[#16A34A]" />
            </div>
            <div className="kpi-value">{status.total}</div>
            <div className="kpi-label">{t('adm_total_proxies')}</div>
          </div>
          
          <div className="kpi-card">
            <div className="mb-3">
              <Check size={24} weight="duotone" className="text-[#059669]" />
            </div>
            <div className="kpi-value text-[#059669]">{status.active}</div>
            <div className="kpi-label">{t('adm_active_4')}</div>
          </div>
          
          <div className="kpi-card">
            <div className="mb-3">
              <Warning size={24} weight="duotone" className="text-[#D97706]" />
            </div>
            <div className="kpi-value text-[#D97706]">{status.onCooldown}</div>
            <div className="kpi-label">{t('adm_on_cooldown')}</div>
          </div>
          
          <div className="kpi-card">
            <div className="mb-3">
              <Plugs size={24} weight="duotone" className="text-[#71717A]" />
            </div>
            <div className="kpi-value text-[#71717A]">{status.disabled}</div>
            <div className="kpi-label">{t('adm_disabled_2')}</div>
          </div>
        </div>
      )}

      {/* Add Proxy Form Modal */}
      <AnimatePresence>
        {showAddForm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
            onClick={() => setShowAddForm(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-2xl p-6 w-full max-w-md shadow-xl"
              onClick={e => e.stopPropagation()}
            >
              <h2 className="text-lg font-semibold text-[#18181B] mb-6">{t('adm_add_new_proxy')}</h2>
              
              <form onSubmit={handleAddProxy} className="space-y-4">
                {/* Protocol */}
                <div>
                  <label className="block text-sm font-medium text-[#18181B] mb-2">{t('adm_protocol')}</label>
                  <WhiteSelect value={newProxy.protocol} onChange={e => setNewProxy({ ...newProxy, protocol: e.target.value })} className="w-full">
                    <option value="http">HTTP</option>
                    <option value="https">HTTPS</option>
                    <option value="socks5">{t('adm_socks5')}</option>
                  </WhiteSelect>
                </div>

                {/* IP Address */}
                <div>
                  <label className="block text-sm font-medium text-[#18181B] mb-2">{t('adm_ip_address')}</label>
                  <input
                    type="text"
                    value={newProxy.host}
                    onChange={e => setNewProxy({ ...newProxy, host: e.target.value })}
                    placeholder="192.168.1.1"
                    className="w-full px-4 py-2.5 bg-[#F4F4F5] border-0 rounded-lg text-sm focus:ring-2 focus:ring-[#0A0A0B] outline-none"
                    required
                  />
                </div>

                {/* Port */}
                <div>
                  <label className="block text-sm font-medium text-[#18181B] mb-2">{t('adm_port_2')}</label>
                  <input
                    type="number"
                    value={newProxy.port}
                    onChange={e => setNewProxy({ ...newProxy, port: e.target.value })}
                    placeholder="8080"
                    className="w-full px-4 py-2.5 bg-[#F4F4F5] border-0 rounded-lg text-sm focus:ring-2 focus:ring-[#0A0A0B] outline-none"
                    required
                  />
                </div>

                {/* Username */}
                <div>
                  <label className="block text-sm font-medium text-[#18181B] mb-2">{t('adm2_4d5ec564c6')}</label>
                  <input
                    type="text"
                    value={newProxy.username}
                    onChange={e => setNewProxy({ ...newProxy, username: e.target.value })}
                    placeholder="username"
                    className="w-full px-4 py-2.5 bg-[#F4F4F5] border-0 rounded-lg text-sm focus:ring-2 focus:ring-[#0A0A0B] outline-none"
                  />
                </div>

                {/* Password */}
                <div>
                  <label className="block text-sm font-medium text-[#18181B] mb-2">{t('adm2_2cdff9ba86')}</label>
                  <input
                    type="password"
                    value={newProxy.password}
                    onChange={e => setNewProxy({ ...newProxy, password: e.target.value })}
                    placeholder="••••••••"
                    className="w-full px-4 py-2.5 bg-[#F4F4F5] border-0 rounded-lg text-sm focus:ring-2 focus:ring-[#0A0A0B] outline-none"
                  />
                </div>

                {/* Priority */}
                <div>
                  <label className="block text-sm font-medium text-[#18181B] mb-2">{t('adm2_1_10_f5dcf004c0')}</label>
                  <input
                    type="number"
                    min="1"
                    max="10"
                    value={newProxy.priority}
                    onChange={e => setNewProxy({ ...newProxy, priority: e.target.value })}
                    className="w-full px-4 py-2.5 bg-[#F4F4F5] border-0 rounded-lg text-sm focus:ring-2 focus:ring-[#0A0A0B] outline-none"
                  />
                  <p className="text-xs text-[#71717A] mt-1">{t('adm2_b979e3f52e')}</p>
                </div>

                {/* Actions */}
                <div className="flex gap-3 pt-4">
                  <button
                    type="button"
                    onClick={() => setShowAddForm(false)}
                    className="flex-1 px-4 py-2.5 text-sm font-medium text-[#18181B] bg-[#F4F4F5] hover:bg-[#E4E4E7] rounded-lg transition-colors"
                  >
                    {t('adm_cancel_3')}
                  </button>
                  <button
                    type="submit"
                    className="flex-1 px-4 py-2.5 text-sm font-medium text-white bg-[#0A0A0B] hover:bg-[#18181B] rounded-lg transition-colors"
                  >
                    {t('adm_add')}
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Proxies Table */}
      <div className="bg-white rounded-xl border border-[#E4E4E7] overflow-hidden">
        <table className="w-full">
          <thead className="bg-[#FAFAFA] border-b border-[#E4E4E7]">
            <tr>
              <th className="text-left px-6 py-4 text-xs font-semibold text-[#71717A] uppercase tracking-wider">ID</th>
              <th className="text-left px-6 py-4 text-xs font-semibold text-[#71717A] uppercase tracking-wider">{t('adm_server')}</th>
              <th className="text-left px-6 py-4 text-xs font-semibold text-[#71717A] uppercase tracking-wider">{t('adm_authorization')}</th>
              <th className="text-left px-6 py-4 text-xs font-semibold text-[#71717A] uppercase tracking-wider">{t('adm_priority_2')}</th>
              <th className="text-left px-6 py-4 text-xs font-semibold text-[#71717A] uppercase tracking-wider">{t('adm_statistics')}</th>
              <th className="text-left px-6 py-4 text-xs font-semibold text-[#71717A] uppercase tracking-wider">{t('adm_status_2')}</th>
              <th className="text-right px-6 py-4 text-xs font-semibold text-[#71717A] uppercase tracking-wider">{t('adm_actions_2')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#E4E4E7]">
            {loading ? (
              <tr>
                <td colSpan={7} className="px-6 py-12 text-center">
                  <div className="animate-spin w-6 h-6 border-2 border-[#0A0A0B] border-t-transparent rounded-full mx-auto"></div>
                </td>
              </tr>
            ) : proxies.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-6 py-12 text-center text-sm text-[#71717A]">
                  {t('adm_proxy_not_configured')}
                </td>
              </tr>
            ) : (
              proxies.map((proxy) => {
                const serverInfo = parseServer(proxy.server);
                const isOnCooldown = proxy.cooldown_until && proxy.cooldown_until > Date.now();
                
                return (
                  <tr key={proxy.id} className="hover:bg-[#FAFAFA] transition-colors">
                    <td className="px-6 py-4">
                      <span className="text-sm text-[#18181B]">#{proxy.id}</span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col">
                        <span className="text-sm font-medium text-[#18181B]">{serverInfo.host}</span>
                        <span className="text-xs text-[#71717A]">{serverInfo.protocol.toUpperCase()}:{serverInfo.port}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      {proxy.username ? (
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-[#18181B]">{proxy.username}</span>
                          <button
                            onClick={() => togglePasswordVisibility(proxy.id)}
                            className="text-[#71717A] hover:text-[#18181B]"
                          >
                            {showPasswords[proxy.id] ? <EyeSlash size={14} /> : <Eye size={14} />}
                          </button>
                          {showPasswords[proxy.id] && proxy.password && (
                            <span className="text-xs text-[#71717A]">/ {proxy.password}</span>
                          )}
                        </div>
                      ) : (
                        <span className="text-sm text-[#71717A]">—</span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <WhiteSelect value={proxy.priority} onChange={e => handleSetPriority(proxy.id, parseInt(e.target.value))}>
                        {[1,2,3,4,5,6,7,8,9,10].map(p => (
                          <option key={p} value={p}>{p}</option>
                        ))}
                      </WhiteSelect>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <span className="text-xs px-2 py-1 bg-[#ECFDF5] text-[#059669] rounded-full">
                          {proxy.success_count} ok
                        </span>
                        <span className="text-xs px-2 py-1 bg-[#FEF2F2] text-[#DC2626] rounded-full">
                          {proxy.error_count} err
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      {!proxy.enabled ? (
                        <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full bg-[#F4F4F5] text-[#71717A]">
                          <X size={12} />
                          {t('adm_disabled_3')}
                        </span>
                      ) : isOnCooldown ? (
                        <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full bg-[#FEF3C7] text-[#D97706]">
                          <Warning size={12} />
                          {t('adm_cooldown')}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full bg-[#ECFDF5] text-[#059669]">
                          <Check size={12} />
                          {t('adm_active_3')}
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => handleTestProxy(proxy.id)}
                          disabled={testingId === proxy.id}
                          className="p-2 text-[#71717A] hover:text-[#18181B] hover:bg-[#F4F4F5] rounded-lg transition-colors disabled:opacity-50"
                          title={t('adm_test_2')}
                        >
                          {testingId === proxy.id ? (
                            <ArrowsClockwise size={16} className="animate-spin" />
                          ) : (
                            <Lightning size={16} />
                          )}
                        </button>
                        <button
                          onClick={() => handleToggleProxy(proxy.id, proxy.enabled)}
                          className="p-2 text-[#71717A] hover:text-[#18181B] hover:bg-[#F4F4F5] rounded-lg transition-colors"
                          title={proxy.enabled ? t('adm2_69faf3d774') : t('adm2_c4af32cc2e')}
                        >
                          {proxy.enabled ? <X size={16} /> : <Check size={16} />}
                        </button>
                        <button
                          onClick={() => handleRemoveProxy(proxy.id)}
                          className="p-2 text-[#71717A] hover:text-[#DC2626] hover:bg-[#FEF2F2] rounded-lg transition-colors"
                          title={t('adm_delete_2')}
                        >
                          <Trash size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Info Block */}
      <div className="mt-6 bg-[#F0F9FF] rounded-xl p-5 border border-[#BAE6FD]">
        <div className="flex gap-3">
          <ShieldCheck size={24} weight="duotone" className="text-[#0EA5E9] flex-shrink-0" />
          <div>
            <h3 className="text-sm font-semibold text-[#0C4A6E] mb-1">{t('adm_how_proxies_work')}</h3>
            <p className="text-sm text-[#0369A1]">
              {t('adm3_46f1876bab')}
            </p>
          </div>
        </div>
      </div>
    </motion.div>
  );
};

export default ProxySettings;
