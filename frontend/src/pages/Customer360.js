/**
 * Customer 360 Page
 * 
 * Повна картка клієнта:
 * - Контактна інформація
 * - Агреговані метрики (leads, quotes, deals)
 * - Timeline всіх подій
 * - LTV tracking
 */

import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { API_URL, useAuth } from '../App';
import { toast } from 'sonner';
import { motion } from 'framer-motion';
import { useLang } from '../i18n';
import RefreshButton from '../components/ui/RefreshButton';
import ReassignDialog from '../components/ui/ReassignDialog';
import useManagersMap from '../hooks/useManagersMap';
import {
  ArrowLeft,
  User,
  Phone,
  Envelope,
  Buildings,
  MapPin,
  CurrencyCircleDollar,
  TrendUp,
  Receipt,
  Handshake,
  Coins,
  ClockCounterClockwise,
  CaretRight,
  CheckCircle,
  XCircle,
  ArrowSquareOut,
  Wallet,
  ArrowsClockwise,
  FileText,
  FilePdf,
  UploadSimple,
  Trash,
  Eye,
} from '@phosphor-icons/react';
import HealthChip from '../components/health/HealthChip';
import Overview360 from '../components/overview360/Overview360';
import CallsTab from '../components/calls/CallsTab';
import InvoicesTab from '../components/customer360/InvoicesTab';
import OrdersTab from '../components/customer360/OrdersTab';
import PaymentsTab from '../components/customer360/PaymentsTab';
import FileManagerTab from '../components/customer360/FileManagerTab';
import RoadmapTab from '../components/customer360/RoadmapTab';
import CommentsTab from '../components/customer360/CommentsTab';
import TasksTab from '../components/customer360/TasksTab';
import TimelineTab from '../components/customer360/TimelineTab';

const Customer360 = () => {
  const { t } = useLang();
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const role = (user?.role || '').toLowerCase();
  const canReassign = ['admin', 'owner', 'master_admin', 'team_lead'].includes(role);
  const { managers: managersMap, invalidate: invalidateManagers } = useManagersMap();
  const [data, setData] = useState(null);
  const [timeline, setTimeline] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState(() => searchParams.get('tab') || 'overview');
  const [showReassign, setShowReassign] = useState(false);

  // React to ?tab=... param changes (e.g. when navigating from /admin/roadmaps)
  useEffect(() => {
    const t = searchParams.get('tab');
    if (t) setActiveTab(t);
  }, [searchParams]);

  useEffect(() => {
    fetchData();
  }, [id]);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [fullRes, timelineRes] = await Promise.all([
        axios.get(`${API_URL}/api/customers/${id}/360`),
        axios.get(`${API_URL}/api/customers/${id}/timeline`),
      ]);
      setData(fullRes.data);
      setTimeline(timelineRes.data || []);
    } catch (err) {
      toast.error(t('adm_customer_data_loading_error'));
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleRefreshStats = async () => {
    try {
      await axios.patch(`${API_URL}/api/customers/${id}/refresh-stats`);
      toast.success(t('adm_statistics_updated'));
      fetchData();
    } catch (err) {
      toast.error(t('adm_statistics_update_error'));
    }
  };

  if (loading || !data) {
    return (
      <div className="flex items-center justify-center h-64" data-testid="customer-360-loading">
        <div className="animate-spin w-8 h-8 border-2 border-[#4F46E5] border-t-transparent rounded-full"></div>
      </div>
    );
  }

  const { customer, leads, quotes, deals, deposits = [], summary, health } = data;

  const statusColors = {
    active: 'bg-[#D1FAE5] text-[#059669]',
    inactive: 'bg-[#F4F4F5] text-[#71717A]',
    vip: 'bg-[#FEF3C7] text-[#D97706]',
    blacklisted: 'bg-[#FEE2E2] text-[#DC2626]',
  };

  const dealStatusColors = {
    new: 'bg-[#E0E7FF] text-[#4F46E5]',
    negotiation: 'bg-[#FEF3C7] text-[#D97706]',
    waiting_deposit: 'bg-[#FEE2E2] text-[#DC2626]',
    deposit_paid: 'bg-[#D1FAE5] text-[#059669]',
    purchased: 'bg-[#DBEAFE] text-[#2563EB]',
    in_delivery: 'bg-[#E0E7FF] text-[#7C3AED]',
    completed: 'bg-[#D1FAE5] text-[#059669]',
    cancelled: 'bg-[#F4F4F5] text-[#71717A]',
  };

  return (
    <motion.div
      data-testid="customer-360-page"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="space-y-6"
    >
      {/* Header — mobile-friendly (wraps on small screens) */}
      <div className="flex items-start sm:items-center gap-3 flex-wrap">
        <button
          onClick={() => navigate('/admin/customers')}
          className="p-2 hover:bg-[#F4F4F5] rounded-lg transition-colors shrink-0"
          data-testid="back-btn"
        >
          <ArrowLeft size={20} className="text-[#71717A]" />
        </button>
        <div className="flex-1 min-w-[160px]">
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[#18181B] leading-tight break-words" style={{ fontFamily: 'Mazzard, Mazzard H, Mazzard M, system-ui, sans-serif' }}>
            {customer.firstName} {customer.lastName}
          </h1>
          <p className="text-[12px] sm:text-sm text-[#71717A] mt-0.5">{t('adm_customer_360_view')}</p>
        </div>
        {/* Wave 7 — Owner badge + Change owner */}
        <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[#F4F4F5] border border-[#E4E4E7]" data-testid="customer-owner-badge">
          <User size={14} className="text-[#71717A]" />
          <span className="text-xs text-[#71717A]">Owner:</span>
          {customer.managerId && managersMap[customer.managerId] ? (
            <span className="text-sm font-semibold text-[#18181B]">{managersMap[customer.managerId].name || managersMap[customer.managerId].email}</span>
          ) : (
            <span className="text-sm font-medium text-[#A1A1AA] italic">unassigned</span>
          )}
          {canReassign && (
            <button
              onClick={() => setShowReassign(true)}
              className="ml-1 p-1.5 hover:bg-white rounded-lg transition-colors"
              title="Change owner"
              data-testid="customer-change-owner-btn"
            >
              <ArrowsClockwise size={14} className="text-[#4F46E5]" />
            </button>
          )}
        </div>
        <span className={`px-2.5 py-1 sm:px-3 sm:py-1.5 rounded-full text-[11px] sm:text-sm font-medium ${statusColors[customer.status] || statusColors.active}`}>
          {customer.status || 'active'}
        </span>
        {health && (
          <HealthChip
            size="md"
            score={health.score}
            segment={health.segment}
            risks={health.risks}
            breakdown={health.breakdown}
          />
        )}
        <RefreshButton
          onClick={handleRefreshStats}
          ariaLabel={t('adm_refresh_statistics')}
          testId="refresh-stats-btn"
        />
      </div>

      {/* Contact Info + KPIs */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Contact Card */}
        <div className="section-card lg:col-span-1">
          <div className="section-title-clean">
            <User size={22} weight="duotone" className="text-[#4F46E5]" />
            <span>{t('adm_contact_information')}</span>
          </div>
          
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-16 h-16 bg-gradient-to-br from-[#18181B] to-[#3F3F46] rounded-2xl flex items-center justify-center text-xl font-bold text-white">
                {customer.firstName?.[0]}{customer.lastName?.[0]}
              </div>
              <div>
                <p className="font-semibold text-[#18181B]">{customer.firstName} {customer.lastName}</p>
                <p className="text-sm text-[#71717A]">{customer.company || 'Individual'}</p>
              </div>
            </div>
            
            <div className="space-y-3 pt-3 border-t border-[#E4E4E7]">
              <ContactItem icon={Envelope} label={t('adm_email')} value={customer.email} />
              <ContactItem icon={Phone} label={t('adm_phone_2')} value={customer.phone || '—'} />
              <ContactItem icon={Buildings} label={t('adm_company')} value={customer.company || '—'} />
              <ContactItem icon={MapPin} label={t('adm_city')} value={customer.city || '—'} />
            </div>
            
            {customer.source && (
              <div className="pt-3 border-t border-[#E4E4E7]">
                <p className="text-xs text-[#71717A] uppercase tracking-wider">{t('adm_source')}</p>
                <p className="font-medium text-[#18181B] mt-1">{customer.source}</p>
              </div>
            )}
          </div>
        </div>

        {/* KPIs Grid */}
        <div className="lg:col-span-2 grid grid-cols-2 md:grid-cols-3 gap-4">
          <KpiCard icon={Receipt} label={t('adm_leads')} value={summary.totalLeads} color="#4F46E5" />
          <KpiCard icon={Receipt} label={t('adm_quotes')} value={summary.totalQuotes} color="#7C3AED" />
          <KpiCard icon={Handshake} label={t('adm_deals')} value={summary.totalDeals} color="#D97706" />
          <KpiCard icon={CheckCircle} label={t('adm_completed')} value={summary.completedDeals} color="#059669" />
          <KpiCard icon={Wallet} label={t('adm_deposits')} value={summary.depositsCount || deposits.length} color="#2563EB" />
          <KpiCard icon={CurrencyCircleDollar} label={t('adm_revenue')} value={`$${summary.totalRevenue.toLocaleString()}`} color="#059669" />
          <KpiCard icon={Coins} label={t('adm_profit')} value={`$${summary.totalProfit.toLocaleString()}`} color="#059669" highlight />
          <KpiCard icon={Wallet} label={t('adm_deposits_sum')} value={`$${(summary.totalDepositsAmount || 0).toLocaleString()}`} color="#2563EB" />
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-[#E4E4E7] overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0" style={{ scrollbarWidth: 'none' }}>
        {['overview', 'roadmap', 'comments', 'tasks', 'legal', 'leads', 'quotes', 'deals', 'invoices', 'orders', 'payments', 'deposits', 'calls', 'contracts', 'documents', 'timeline'].map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-3 sm:px-4 py-2.5 sm:py-3 text-[12.5px] sm:text-sm font-medium whitespace-nowrap shrink-0 transition-colors ${
              activeTab === tab
                ? 'text-[#18181B] border-b-2 border-[#18181B]'
                : 'text-[#71717A] hover:text-[#18181B] border-b-2 border-transparent'
            }`}
            data-testid={`tab-${tab}`}
          >
            {tab === 'calls'
              ? (t('w2a_calls_tab_title') || 'Calls & AI')
              : tab.charAt(0).toUpperCase() + tab.slice(1)}
            {tab === 'deposits' && deposits.length > 0 && (
              <span className="ml-1 text-[10px] sm:text-xs bg-[#E4E4E7] text-[#18181B] px-1.5 py-0.5 rounded-full">{deposits.length}</span>
            )}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="min-h-[400px]">
        {activeTab === 'overview' && (
          <Overview360
            health={health}
            lastContact={
              health?.last_contact
                ? { at: health.last_contact, channel: 'auto', manager: null, outcome: null }
                : null
            }
            nextAction={
              health?.risks?.length
                ? { text: `${health.risks[0]} — ${t('overview_next_action_followup')}`, source: 'rule' }
                : null
            }
            openTasks={[]}
            openDeals={(deals || [])
              .filter((d) => !['won', 'completed', 'cancelled', 'purchased'].includes((d.status || '').toLowerCase()))
              .map((d) => ({
                id: d.id,
                title: d.title || d.vin || 'Deal',
                stage: d.status || d.stage,
                amount: d.clientPrice || d.total_price || d.totalValue,
                currency: d.currency || 'EUR',
              }))}
            recentActivity={[
              ...((deals || []).slice(0, 3).map((d) => ({
                at: d.updated_at || d.created_at,
                type: 'deal',
                title: `${t('adm_deals')}: ${d.title || d.vin || d.id}`,
                meta: d.status,
              }))),
              ...((deposits || []).slice(0, 3).map((dep) => ({
                at: dep.created_at,
                type: 'deposit',
                title: `${t('adm_deposits')}: ${(dep.amount || 0).toLocaleString()} ${dep.currency || 'EUR'}`,
                meta: dep.status,
              }))),
            ].sort((a, b) => String(b.at).localeCompare(String(a.at))).slice(0, 5)}
          />
        )}

        {activeTab === 'legal' && (
          <CustomerLegalSection customerId={id} />
        )}

        {activeTab === 'leads' && (
          <EntitySection
            title={`Leads (${leads.length})`}
            items={leads}
            emptyMessage={t('adm_no_leads')}
            renderItem={(item) => (
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-[#18181B]">{item.firstName} {item.lastName}</p>
                  <p className="text-sm text-[#71717A]">VIN: {item.vin || '—'} | {new Date(item.createdAt).toLocaleDateString()}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`px-2 py-1 rounded text-xs font-medium ${dealStatusColors[item.status] || 'bg-[#F4F4F5] text-[#71717A]'}`}>
                    {item.status}
                  </span>
                  <ArrowSquareOut size={16} className="text-[#71717A]" />
                </div>
              </div>
            )}
          />
        )}

        {activeTab === 'quotes' && (
          <EntitySection
            title={`Quotes (${quotes.length})`}
            items={quotes}
            emptyMessage={t('adm_no_miscalculations')}
            renderItem={(item) => (
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-[#18181B]">{item.quoteNumber || item.vehicleTitle}</p>
                  <p className="text-sm text-[#71717A]">VIN: {item.vin} | {item.selectedScenario}</p>
                </div>
                <div className="text-right">
                  <p className="font-semibold text-[#18181B]">${(item.visibleTotal || 0).toLocaleString()}</p>
                  <p className="text-xs text-[#059669]">Margin: ${(item.hiddenFee || 0).toLocaleString()}</p>
                </div>
              </div>
            )}
          />
        )}

        {activeTab === 'deals' && (
          <EntitySection
            title={`Deals (${deals.length})`}
            items={deals}
            emptyMessage={t('adm_no_deals')}
            renderItem={(item) => (
              <div
                className="flex items-center justify-between cursor-pointer hover:bg-[#F4F4F5] -mx-2 px-2 py-1 rounded transition-colors"
                onClick={() => item.id && navigate(`/admin/deals/${item.id}/360`)}
                data-testid={`customer360-deal-row-${item.id}`}
              >
                <div>
                  <p className="font-medium text-[#18181B]">{item.title}</p>
                  <p className="text-sm text-[#71717A]">VIN: {item.vin || '—'} | {item.createdAt ? new Date(item.createdAt).toLocaleDateString() : ''}</p>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <p className="font-semibold text-[#18181B]">${(item.clientPrice || 0).toLocaleString()}</p>
                    <p className={`text-xs ${(item.realProfit || item.estimatedMargin || 0) >= 0 ? 'text-[#059669]' : 'text-[#DC2626]'}`}>
                      Profit: ${(item.realProfit || item.estimatedMargin || 0).toLocaleString()}
                    </p>
                  </div>
                  <span className={`px-2 py-1 rounded text-xs font-medium ${dealStatusColors[item.status] || 'bg-[#F4F4F5] text-[#71717A]'}`}>
                    {item.status}
                  </span>
                  <CaretRight size={14} className="text-[#A1A1AA]" />
                </div>
              </div>
            )}
          />
        )}

        {activeTab === 'invoices' && (
          <InvoicesTab customerId={id} />
        )}

        {activeTab === 'orders' && (
          <OrdersTab customerId={id} />
        )}

        {activeTab === 'roadmap' && (
          <RoadmapTab customerId={id} />
        )}

        {activeTab === 'comments' && (
          <CommentsTab customerId={id} />
        )}

        {activeTab === 'tasks' && (
          <TasksTab customerId={id} />
        )}

        {activeTab === 'payments' && (
          <PaymentsTab customerId={id} />
        )}

        {activeTab === 'deposits' && (
          <EntitySection
            title={`Deposits (${deposits.length})`}
            items={deposits}
            emptyMessage={t('adm_no_deposits')}
            renderItem={(item) => (
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-[#18181B]">{t('adm3_847d692257')}{item.id?.slice(-8) || '—'}</p>
                  <p className="text-sm text-[#71717A]">
                    {item.paymentMethod || t('adm2_bad55fa1e6')} | {new Date(item.createdAt).toLocaleDateString()}
                  </p>
                  {item.description && (
                    <p className="text-xs text-[#A1A1AA] mt-1">{item.description}</p>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <p className="font-semibold text-[#18181B]">${(item.amount || 0).toLocaleString()}</p>
                    {item.confirmedAt && (
                      <p className="text-xs text-[#059669]">
                        {t('r9_confirmed_at')}: {new Date(item.confirmedAt).toLocaleDateString()}
                      </p>
                    )}
                  </div>
                  <span className={`px-2 py-1 rounded text-xs font-medium ${
                    item.status === 'confirmed' || item.status === 'completed' 
                      ? 'bg-[#D1FAE5] text-[#059669]' 
                      : item.status === 'pending' 
                        ? 'bg-[#FEF3C7] text-[#D97706]'
                        : 'bg-[#F4F4F5] text-[#71717A]'
                  }`}>
                    {item.status}
                  </span>
                </div>
              </div>
            )}
          />
        )}

        {activeTab === 'contracts' && (
          <ContractsSection customerId={id} />
        )}

        {activeTab === 'calls' && (
          <CallsTab customerId={id} customerRole={role} />
        )}

        {activeTab === 'documents' && (
          <FileManagerTab customerId={id} />
        )}

        {activeTab === 'timeline' && (
          <TimelineTab customerId={id} />
        )}
      </div>
      {/* Wave 7 — Reassign owner dialog */}
      {canReassign && showReassign && (
        <ReassignDialog
          open={showReassign}
          onClose={() => setShowReassign(false)}
          entity="customer"
          ids={[id]}
          currentManagerId={customer.managerId}
          onSuccess={() => {
            invalidateManagers();
            fetchData();
          }}
        />
      )}
    </motion.div>
  );
};

// Helper Components
const ContactItem = ({ icon: Icon, label, value }) => (
  <div className="flex items-center gap-3">
    <Icon size={18} className="text-[#71717A]" />
    <div>
      <p className="text-xs text-[#71717A]">{label}</p>
      <p className="text-sm text-[#18181B]">{value}</p>
    </div>
  </div>
);

const KpiCard = ({ icon: Icon, label, value, color, highlight }) => (
  <div className={`kpi-card ${highlight ? 'border-[#059669] bg-[#F0FDF4]' : ''}`}>
    <div className="mb-3">
      <Icon size={24} weight="duotone" style={{ color }} />
    </div>
    <div className={`kpi-value ${highlight ? 'text-[#059669]' : ''}`}>{value}</div>
    <div className="kpi-label">{label}</div>
  </div>
);

const EntitySection = ({ title, items, emptyMessage, renderItem }) => (
  <div className="section-card">
    <div className="section-title-clean">
      <span>{title}</span>
    </div>
    
    <div className="space-y-3">
      {items.length === 0 ? (
        <p className="text-[#71717A] text-center py-8">{emptyMessage}</p>
      ) : (
        items.map((item, idx) => (
          <div 
            key={item._id || item.id || idx} 
            className="p-4 rounded-xl border border-[#E4E4E7] hover:border-[#4F46E5]/30 transition-colors cursor-pointer"
          >
            {renderItem(item)}
          </div>
        ))
      )}
    </div>
  </div>
);

export default Customer360;

// ───────────────── Wave-1: Contracts & Documents Sections ──────────

const LIFECYCLE_BADGE = {
  draft:     { cls: 'bg-zinc-100 text-zinc-700 border-zinc-200',     label: 'Draft' },
  sent:      { cls: 'bg-amber-100 text-amber-700 border-amber-200',  label: 'Sent' },
  viewed:    { cls: 'bg-sky-100 text-sky-700 border-sky-200',        label: 'Viewed' },
  signed:    { cls: 'bg-emerald-100 text-emerald-700 border-emerald-200', label: 'Signed' },
  archived:  { cls: 'bg-zinc-100 text-zinc-500 border-zinc-200',     label: 'Archived' },
  cancelled: { cls: 'bg-red-100 text-red-700 border-red-200',        label: 'Cancelled' },
};
const _authHeaders = () => {
  const tok = localStorage.getItem('token') || localStorage.getItem('access_token');
  return tok ? { Authorization: `Bearer ${tok}` } : {};
};

const ContractsSection = ({ customerId }) => {
  const { t } = useLang();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(null);
  const [shareUrl, setShareUrl] = useState(null);

  const load = React.useCallback(async () => {
    try {
      const { data } = await axios.get(`${API_URL}/api/customers/${customerId}/contracts`, { headers: _authHeaders() });
      setItems(data.items || []);
    } catch {
      try {
        // Fallback to legacy endpoint for older bundles
        const { data } = await axios.get(`${API_URL}/api/customers/${customerId}/contracts-legacy`);
        setItems(data.items || []);
      } catch {
        // ignore
      }
    } finally {
      setLoading(false);
    }
  }, [customerId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await axios.get(`${API_URL}/api/customers/${customerId}/contracts`, { headers: _authHeaders() });
        if (!cancelled) setItems(data.items || []);
      } catch {
        try {
          const { data } = await axios.get(`${API_URL}/api/customers/${customerId}/contracts-legacy`);
          if (!cancelled) setItems(data.items || []);
        } catch { /* ignore */ }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [customerId]);

  const handleSend = async (c) => {
    if (!window.confirm(`Отправить договор клиенту? Будет сгенерирована ссылка для подписания.`)) return;
    setActing(c.id);
    try {
      const { data } = await axios.post(`${API_URL}/api/contract-lifecycle/${c.id}/send`, {}, { headers: _authHeaders() });
      setShareUrl(data.share_url);
      load();
    } catch (e) {
      alert(e.response?.data?.detail || 'Send failed');
    } finally {
      setActing(null);
    }
  };

  const handleArchive = async (c) => {
    if (!window.confirm('Архивировать договор?')) return;
    setActing(c.id);
    try {
      await axios.post(`${API_URL}/api/contract-lifecycle/${c.id}/archive`, {}, { headers: _authHeaders() });
      load();
    } catch (e) {
      alert(e.response?.data?.detail || 'Archive failed');
    } finally {
      setActing(null);
    }
  };

  const copyShare = (url) => {
    navigator.clipboard?.writeText(url).then(() => alert('Ссылка скопирована'));
  };

  if (loading) return <p className="text-sm text-[#71717A]">{t('adm_loading_5')}</p>;
  if (!items.length) {
    return (
      <div className="section-card">
        <div className="section-title-clean">
          <FileText size={22} weight="duotone" className="text-[#4F46E5]" />
          <span>{t('contracts_section_title')}</span>
        </div>
        <p className="text-center py-8 text-[#71717A]">{t('contracts_empty')}</p>
      </div>
    );
  }
  return (
    <div className="section-card">
      <div className="section-title-clean">
        <FileText size={22} weight="duotone" className="text-[#4F46E5]" />
        <span>{t('contracts_section_title')} <span className="text-zinc-400 font-normal">({items.length})</span></span>
      </div>

      {shareUrl && (
        <div className="mb-4 p-3 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-between gap-3" data-testid="contract-share-banner">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-bold uppercase tracking-wider text-emerald-700">Ссылка для подписания</p>
            <p className="text-sm font-mono text-emerald-900 truncate">{shareUrl}</p>
          </div>
          <button onClick={() => copyShare(shareUrl)} className="px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-xs hover:bg-emerald-700 shrink-0">Копировать</button>
          <button onClick={() => setShareUrl(null)} className="p-1 hover:bg-emerald-100 rounded text-emerald-700 shrink-0">×</button>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm" data-testid="contracts-table">
          <thead>
            <tr className="border-b border-zinc-200 text-[11px] uppercase tracking-wider text-zinc-500">
              <th className="px-4 py-2 text-left font-medium">{t('contracts_col_number')}</th>
              <th className="px-4 py-2 text-left font-medium">Title</th>
              <th className="px-4 py-2 text-left font-medium">Version</th>
              <th className="px-4 py-2 text-left font-medium">{t('contracts_col_status')}</th>
              <th className="px-4 py-2 text-left font-medium">{t('contracts_col_signed')}</th>
              <th className="px-4 py-2 text-right font-medium">{t('contracts_col_actions')}</th>
            </tr>
          </thead>
          <tbody>
            {items.map((c) => {
              const lc = (c.lifecycle || c.status || 'draft').toLowerCase();
              const badge = LIFECYCLE_BADGE[lc] || LIFECYCLE_BADGE.draft;
              const canSend = ['draft', 'sent'].includes(lc);
              const canArchive = !['archived'].includes(lc);
              return (
                <tr key={c.id} className="border-b border-zinc-50 hover:bg-zinc-50" data-testid={`contract-row-${c.id}`}>
                  <td className="px-4 py-2 font-mono text-xs text-[#71717A]">{c.id?.slice(-8)}</td>
                  <td className="px-4 py-2 font-medium text-[#18181B]">{c.title || '—'}</td>
                  <td className="px-4 py-2 text-xs text-[#71717A]">v{c.version || 1}</td>
                  <td className="px-4 py-2">
                    <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium border ${badge.cls}`} data-testid={`contract-lifecycle-${c.id}`}>
                      {badge.label}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-xs text-[#71717A]">
                    {c.signed_at ? (
                      <span>{new Date(c.signed_at).toLocaleDateString()}<br/><span className="text-[10px] text-zinc-400">{c.signed_full_name}</span></span>
                    ) : '—'}
                  </td>
                  <td className="px-4 py-2">
                    <div className="flex items-center justify-end gap-1">
                      {c.download_url && (
                        <a
                          href={`${API_URL}${c.download_url}`}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-zinc-200 hover:bg-zinc-50 text-xs"
                          title="Open PDF"
                        >
                          <FilePdf size={12} /> PDF
                        </a>
                      )}
                      {canSend && (
                        <button
                          onClick={() => handleSend(c)}
                          disabled={acting === c.id}
                          className="px-2 py-1 rounded-md bg-[#18181B] text-white text-xs hover:bg-[#27272A] disabled:opacity-50"
                          data-testid={`contract-send-${c.id}`}
                        >
                          {lc === 'sent' ? 'Resend' : 'Send'}
                        </button>
                      )}
                      {c.view_token && (
                        <button
                          onClick={() => copyShare(`${window.location.origin}/cabinet/contracts/${c.view_token}`)}
                          className="px-2 py-1 rounded-md border border-zinc-200 hover:bg-zinc-50 text-xs"
                          title="Copy share link"
                        >
                          🔗
                        </button>
                      )}
                      {canArchive && (
                        <button
                          onClick={() => handleArchive(c)}
                          disabled={acting === c.id}
                          className="px-2 py-1 rounded-md border border-zinc-200 hover:bg-zinc-50 text-xs"
                          data-testid={`contract-archive-${c.id}`}
                        >
                          Archive
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const DocumentsSection = ({ customerId }) => {
  const { t } = useLang();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const fileRef = React.useRef(null);

  const load = async () => {
    try {
      const { data } = await axios.get(`${API_URL}/api/customers/${customerId}/documents`);
      setItems(data.items || []);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [customerId]);

  const onUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 6 * 1024 * 1024) {
      toast.error(t('documents_too_large'));
      return;
    }
    setUploading(true);
    try {
      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (ev) => resolve(ev.target.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      await axios.post(`${API_URL}/api/customers/${customerId}/documents`, {
        name: file.name,
        type: 'upload',
        mime: file.type,
        data_url: dataUrl,
      });
      toast.success(t('documents_uploaded'));
      await load();
    } catch (err) {
      toast.error(err?.response?.data?.detail || t('documents_upload_failed'));
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const onDelete = async (docId) => {
    try {
      await axios.delete(`${API_URL}/api/customers/${customerId}/documents/${docId}`);
      setItems((prev) => prev.filter((x) => x.id !== docId));
      toast.success(t('documents_deleted'));
    } catch (err) {
      toast.error(err?.response?.data?.detail || t('error'));
    }
  };

  // Group by type
  const groups = items.reduce((acc, d) => {
    const key = d.type || 'other';
    (acc[key] ||= []).push(d);
    return acc;
  }, {});

  return (
    <div className="section-card">
      <div className="section-title-clean flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileText size={22} weight="duotone" className="text-[#4F46E5]" />
          <span>{t('documents_section_title')} <span className="text-zinc-400 font-normal">({items.length})</span></span>
        </div>
        <div>
          <input
            ref={fileRef}
            type="file"
            className="hidden"
            onChange={onUpload}
            data-testid="documents-upload-input"
            accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx"
          />
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="inline-flex items-center gap-2 px-3 py-1.5 bg-[#18181B] hover:bg-[#27272A] text-white rounded-lg text-sm font-medium disabled:opacity-50"
            data-testid="documents-upload-btn"
          >
            <UploadSimple size={14} />
            {uploading ? t('documents_uploading') : t('documents_upload')}
          </button>
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-[#71717A]">{t('adm_loading_5')}</p>
      ) : items.length === 0 ? (
        <p className="text-center py-8 text-[#71717A]">{t('documents_empty')}</p>
      ) : (
        <div className="space-y-4">
          {Object.entries(groups).map(([group, docs]) => (
            <div key={group}>
              <div className="text-[11px] uppercase tracking-wider text-[#71717A] font-semibold mb-2">
                {group} ({docs.length})
              </div>
              <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {docs.map((d) => (
                  <li
                    key={d.id}
                    className="flex items-center justify-between gap-2 p-3 rounded-xl border border-zinc-200 bg-white"
                    data-testid={`document-row-${d.id}`}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-[#18181B] truncate">{d.name}</p>
                      <p className="text-[11px] text-[#71717A]">
                        {d.mime?.split('/')[1] || d.type} · {d.created_at && new Date(d.created_at).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {d.file_url && (
                        <a
                          href={d.file_url}
                          target="_blank"
                          rel="noreferrer"
                          className="p-1.5 hover:bg-zinc-100 rounded-md"
                          title={t('documents_open')}
                        >
                          <Eye size={14} className="text-[#4F46E5]" />
                        </a>
                      )}
                      <button
                        onClick={() => onDelete(d.id)}
                        className="p-1.5 hover:bg-red-50 rounded-md"
                        title={t('documents_delete')}
                        data-testid={`document-delete-${d.id}`}
                      >
                        <Trash size={14} className="text-[#DC2626]" />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// ───────────────── P0.1 Customer Legal Section ─────────────────
const CustomerLegalSection = ({ customerId }) => {
  const { t } = useLang();
  const [legal, setLegal] = useState({
    first_name: '', last_name: '', egn: '', national_id_no: '',
    id_card_address: '', id_card_issued_by: '', id_card_issue_date: '',
  });
  const [validation, setValidation] = useState(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const [r1, r2] = await Promise.all([
        axios.get(`${API_URL}/api/customers/${customerId}/legal`),
        axios.get(`${API_URL}/api/customers/${customerId}/legal/validate`),
      ]);
      if (r1.data?.legal) setLegal(prev => ({ ...prev, ...r1.data.legal }));
      setValidation(r2.data);
    } catch (e) {
      // ignore — new customer
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [customerId]);

  const save = async () => {
    if (!/^\d{10}$/.test(legal.egn || '')) return toast.error(t('adm_egn_must_be_exactly_10_digits'));
    if (!/^\d{4}-\d{2}-\d{2}$/.test(legal.id_card_issue_date || ''))
      return toast.error(t('adm_issue_date_in_yyyymmdd_format'));
    setSaving(true);
    try {
      await axios.put(`${API_URL}/api/customers/${customerId}/legal`, legal);
      toast.success(t('adm_legal_fields_saved'));
      await load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || t('adm2_4d86bed39c'));
    } finally {
      setSaving(false);
    }
  };

  const F = (key, label, opts = {}) => (
    <div>
      <label className="block text-xs font-semibold uppercase tracking-wider text-[#71717A] mb-2">
        {label}<span className="text-[#DC2626]"> *</span>
      </label>
      <input
        type={opts.type || 'text'}
        value={legal[key] || ''}
        onChange={(e) => setLegal({ ...legal, [key]: e.target.value })}
        maxLength={opts.maxLength}
        placeholder={opts.placeholder}
        className="input w-full"
        data-testid={`c360-legal-${key}`}
      />
    </div>
  );

  if (loading) return <p className="text-sm text-[#71717A]">{t('adm_loading_5')}</p>;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2 section-card">
        <div className="section-title-clean">
          <User size={22} weight="duotone" className="text-[#4F46E5]" />
          <span>{t('adm2_c1725cceb5')}</span>
        </div>
        <div className="space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {F('first_name', t('adm2_1b2b542aeb'), { placeholder: t('adm_ivan') })}
            {F('last_name',  t('adm2_db93f7d0fb'), { placeholder: t('adm_ivanov') })}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {F('egn', t('adm2_10_106b2ae400'), { maxLength: 10, placeholder: '9901011234' })}
            {F('national_id_no', t('adm2_d9063bb8cb'), { placeholder: t('adm_bg1234567') })}
          </div>
          {F('id_card_address', t('adm2_ecebe5fec5'), { placeholder: t('adm_sofia_str') })}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {F('id_card_issued_by', t('adm2_82a99b398f'), { placeholder: t('adm_ministry_of_interior_sofia') })}
            {F('id_card_issue_date', t('adm2_7803e296c0'), { type: 'date' })}
          </div>
          <div className="flex gap-3 pt-2">
            <button onClick={save} disabled={saving} className="btn-primary" data-testid="c360-legal-save">
              {saving ? t('adm2_73dba4fd6c') : t('adm2_74ea58b6a8')}
            </button>
            <button onClick={load} className="btn-secondary">{t('adm_reset_2')}</button>
          </div>
        </div>
      </div>

      <div className="section-card">
        <div className="section-title-clean">
          <CheckCircle size={22} weight="duotone" className="text-[#059669]" />
          <span>{t('adm_readiness')}</span>
        </div>
        {validation?.ready_for_deposit_contract ? (
          <div className="bg-[#D1FAE5] border border-[#059669]/30 rounded-xl p-4">
            <div className="flex items-center gap-2 text-[#059669] font-semibold">
              <CheckCircle size={22} weight="fill" /> {t('adm_all_fields_ok')}
            </div>
            <p className="text-sm text-[#047857] mt-2">
              {t('adm3_7126961db5')}
            </p>
          </div>
        ) : (
          <div className="bg-[#FEF3C7] border border-[#D97706]/30 rounded-xl p-4">
            <div className="flex items-center gap-2 text-[#D97706] font-semibold">
              <XCircle size={22} weight="fill" /> {t('adm_missing_fields')}
            </div>
            <ul className="text-sm text-[#92400E] mt-2 list-disc pl-5 space-y-1">
              {(validation?.missing_fields || []).map(f => <li key={f}>{f}</li>)}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
};
