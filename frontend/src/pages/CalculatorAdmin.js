/**
 * Calculator Admin Page
 * 
 * Повна панель керування ставками, комісіями та hidden fee
 * Master Admin може міняти всі параметри без коду
 * 
 * Updates:
 * - Live Preview перенесено вгору
 * - Блоки можуть згортатись/розгортатись
 * - Профіль в режимі перегляду з можливістю редагування
 */

import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import { API_URL } from '../App';
import { toast } from 'sonner';
import { useLang } from '../i18n';
import CustomSelect from '../components/ui/CustomSelect';
import RefreshButton from '../components/ui/RefreshButton';
import { 
  Gear, 
  Calculator, 
  Truck, 
  Anchor, 
  Airplane,
  CurrencyDollar,
  Eye,
  EyeSlash,
  FloppyDisk,
  Trash,
  Plus,
  ArrowsClockwise,
  ChartLine,
  CaretDown,
  CaretUp,
  PencilSimple,
  X
} from '@phosphor-icons/react';
import { motion, AnimatePresence } from 'framer-motion';
import WhiteSelect from '../components/ui/WhiteSelect';
import UsaInlandModelEditor from '../components/calculator/UsaInlandModelEditor';
import OceanFreightModelEditor from '../components/calculator/OceanFreightModelEditor';
import EuDeliveryModelEditor from '../components/calculator/EuDeliveryModelEditor';

const CalculatorAdmin = () => {
  const { t } = useLang();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  
  // Data states
  const [profile, setProfile] = useState(null);
  const [routes, setRoutes] = useState([]);
  const [auctionRules, setAuctionRules] = useState([]);
  const [stats, setStats] = useState(null);
  // Korea profile + routes (Korea → Romania → Bulgaria pipeline)
  const [koreaProfile, setKoreaProfile] = useState(null);
  const [editedKoreaProfile, setEditedKoreaProfile] = useState(null);
  const [isEditingKorea, setIsEditingKorea] = useState(false);
  const [koreaRoutes, setKoreaRoutes] = useState([]);
  // Dynamic catalogs (ports / vehicle types / auctions) — loaded from backend
  // so adding a new option becomes a one-line change in server.py rather than
  // requiring a UI redeploy.
  const [portsCatalog, setPortsCatalog] = useState([]);
  const [vehicleTypesCatalog, setVehicleTypesCatalog] = useState([]);
  const [auctionsCatalog, setAuctionsCatalog] = useState([]);
  
  // Collapsible states - all collapsed by default
  const [expandedSections, setExpandedSections] = useState({
    profile: false,
    usaInland: false,
    ocean: false,
    euDelivery: false,
    auctionRules: false,
    koreaProfile: false,
    koreaInland: false,
    koreaSea: false,
    koreaBgTransport: false
  });
  
  // Profile editing mode
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [editedProfile, setEditedProfile] = useState(null);
  
  // Preview state — uses real backend port codes and auction selector.
  const [previewInput, setPreviewInput] = useState({
    price: 15000,
    port: 'burgas',
    auction: 'copart',
    vehicleType: 'sedan'
  });
  const [previewResult, setPreviewResult] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  // Korea preview state
  const [koreaPreviewInput, setKoreaPreviewInput] = useState({
    price: 20000,
    invoicePrice: 0,
    additionalFees: 0,
    vehicleType: 'sedan',
    useLogisticsPackage: true,
  });
  const [koreaPreviewResult, setKoreaPreviewResult] = useState(null);
  const [koreaPreviewLoading, setKoreaPreviewLoading] = useState(false);

  useEffect(() => {
    loadAllData();
  }, []);

  const toggleSection = (section) => {
    setExpandedSections(prev => ({
      ...prev,
      [section]: !prev[section]
    }));
  };

  const loadAllData = async () => {
    setLoading(true);
    try {
      const [profileRes, statsRes, optsRes, koreaProfileRes, koreaRoutesRes] = await Promise.all([
        axios.get(`${API_URL}/api/calculator/config/profile`),
        axios.get(`${API_URL}/api/calculator/admin/stats`),
        axios.get(`${API_URL}/api/calculator/ports`),
        axios.get(`${API_URL}/api/calculator/config/profile?code=korea_bg`).catch(() => ({ data: null })),
        axios.get(`${API_URL}/api/calculator/config/routes/korea_bg`).catch(() => ({ data: [] })),
      ]);
      
      setProfile(profileRes.data);
      setEditedProfile(profileRes.data);
      setStats(statsRes.data);

      // Korea profile + routes
      if (koreaProfileRes?.data) {
        setKoreaProfile(koreaProfileRes.data);
        setEditedKoreaProfile(koreaProfileRes.data);
      }
      if (Array.isArray(koreaRoutesRes?.data)) {
        setKoreaRoutes(koreaRoutesRes.data);
      }

      // Hydrate catalogs (ports / vehicleTypes / auctions). Tolerate the
      // older response shape `{ports, vehicleTypes, auctions}` directly under
      // the response root.
      const opts = optsRes?.data || {};
      setPortsCatalog(Array.isArray(opts.ports) ? opts.ports : []);
      setVehicleTypesCatalog(Array.isArray(opts.vehicleTypes) ? opts.vehicleTypes : []);
      setAuctionsCatalog(Array.isArray(opts.auctions) ? opts.auctions : []);
      
      if (profileRes.data?.code) {
        const [routesRes, rulesRes] = await Promise.all([
          axios.get(`${API_URL}/api/calculator/config/routes/${profileRes.data.code}`),
          axios.get(`${API_URL}/api/calculator/config/auction-fees/${profileRes.data.code}`)
        ]);
        setRoutes(routesRes.data);
        setAuctionRules(rulesRes.data);
      }
    } catch (err) {
      toast.error(t('adm_data_loading_error'));
    } finally {
      setLoading(false);
    }
  };

  // Group routes by type
  const groupedRoutes = useMemo(() => {
    return {
      usa_inland: routes.filter(r => r.rateType === 'usa_inland'),
      ocean: routes.filter(r => r.rateType === 'ocean'),
      eu_delivery: routes.filter(r => r.rateType === 'eu_delivery')
    };
  }, [routes]);

  // Group Korea routes by type
  const groupedKoreaRoutes = useMemo(() => {
    return {
      korea_inland: koreaRoutes.filter(r => r.rateType === 'korea_inland'),
      korea_sea: koreaRoutes.filter(r => r.rateType === 'korea_sea'),
      korea_bg_transport: koreaRoutes.filter(r => r.rateType === 'korea_bg_transport'),
    };
  }, [koreaRoutes]);

  // Korea profile edit handlers
  const startEditingKorea = () => {
    setEditedKoreaProfile({ ...koreaProfile });
    setIsEditingKorea(true);
    setExpandedSections(prev => ({ ...prev, koreaProfile: true }));
  };
  const cancelEditingKorea = () => {
    setEditedKoreaProfile(koreaProfile);
    setIsEditingKorea(false);
  };
  const saveKoreaProfile = async () => {
    setSaving(true);
    try {
      const res = await axios.patch(`${API_URL}/api/calculator/config/profile`, {
        ...editedKoreaProfile,
        code: 'korea_bg',
      });
      setKoreaProfile(res.data);
      setEditedKoreaProfile(res.data);
      setIsEditingKorea(false);
      toast.success(t('adm_korea_profile_saved'));
    } catch (err) {
      toast.error(t('adm_failed_to_save_korea_profile'));
    } finally {
      setSaving(false);
    }
  };

  // Save / delete Korea route
  const saveKoreaRoute = async (route) => {
    try {
      const res = await axios.post(`${API_URL}/api/calculator/config/routes`, {
        ...route,
        profileCode: 'korea_bg',
      });
      setKoreaRoutes(prev => {
        const newId = res.data._id ?? res.data.id;
        const idx = prev.findIndex(r => (r._id ?? r.id) === newId);
        if (idx >= 0) {
          const clone = [...prev];
          clone[idx] = res.data;
          return clone;
        }
        return [...prev, res.data];
      });
      toast.success(t('adm_korea_rate_saved'));
    } catch (err) {
      toast.error(t('adm_failed_to_save_korea_rate'));
    }
  };
  const deleteKoreaRoute = async (id) => {
    if (!window.confirm('Delete this rate?')) return;
    try {
      await axios.delete(`${API_URL}/api/calculator/config/routes/${id}`);
      setKoreaRoutes(prev => prev.filter(r => (r._id ?? r.id) !== id));
      toast.success(t('adm_korea_rate_deleted'));
    } catch (err) {
      toast.error(t('adm_failed_to_delete'));
    }
  };

  // Run Korea preview
  const runKoreaPreview = async () => {
    setKoreaPreviewLoading(true);
    try {
      const res = await axios.post(`${API_URL}/api/calculator/calculate`, {
        origin: 'korea',
        ...koreaPreviewInput,
      });
      setKoreaPreviewResult(res.data);
    } catch (err) {
      toast.error(t('adm_korea_calculation_failed'));
    } finally {
      setKoreaPreviewLoading(false);
    }
  };

  // Start editing profile
  const startEditingProfile = () => {
    setEditedProfile({...profile});
    setIsEditingProfile(true);
    setExpandedSections(prev => ({...prev, profile: true}));
  };

  // Cancel editing
  const cancelEditingProfile = () => {
    setEditedProfile(profile);
    setIsEditingProfile(false);
  };

  // Save profile
  const saveProfile = async () => {
    setSaving(true);
    try {
      const res = await axios.patch(`${API_URL}/api/calculator/config/profile`, editedProfile);
      setProfile(res.data);
      setEditedProfile(res.data);
      setIsEditingProfile(false);
      toast.success(t('adm_profile_saved'));
    } catch (err) {
      toast.error(t('adm_profile_saving_error'));
    } finally {
      setSaving(false);
    }
  };

  // Save route rate
  const saveRoute = async (route) => {
    try {
      const res = await axios.post(`${API_URL}/api/calculator/config/routes`, route);
      setRoutes(prev => {
        const newId = res.data._id ?? res.data.id;
        const idx = prev.findIndex(r => (r._id ?? r.id) === newId);
        if (idx >= 0) {
          const clone = [...prev];
          clone[idx] = res.data;
          return clone;
        }
        return [...prev, res.data];
      });
      toast.success(t('adm_bid_saved'));
    } catch (err) {
      toast.error(t('adm_bid_saving_error'));
    }
  };

  // Delete route
  const deleteRoute = async (id) => {
    if (!window.confirm(t('adm2_132d19caa7'))) return;
    try {
      await axios.delete(`${API_URL}/api/calculator/config/routes/${id}`);
      setRoutes(prev => prev.filter(r => (r._id ?? r.id) !== id));
      toast.success(t('adm_bid_deleted'));
    } catch (err) {
      toast.error(t('adm_deletion_error'));
    }
  };

  // Save auction rule
  const saveAuctionRule = async (rule) => {
    try {
      const res = await axios.post(`${API_URL}/api/calculator/config/auction-fees`, rule);
      setAuctionRules(prev => {
        const newId = res.data._id ?? res.data.id;
        const idx = prev.findIndex(r => (r._id ?? r.id) === newId);
        if (idx >= 0) {
          const clone = [...prev];
          clone[idx] = res.data;
          return clone.sort((a, b) => a.minBid - b.minBid);
        }
        return [...prev, res.data].sort((a, b) => a.minBid - b.minBid);
      });
      toast.success(t('adm_rule_saved'));
    } catch (err) {
      toast.error(t('adm_rule_saving_error'));
    }
  };

  // Delete auction rule
  const deleteAuctionRule = async (id) => {
    if (!window.confirm(t('adm2_4e3e8cac4a'))) return;
    try {
      await axios.delete(`${API_URL}/api/calculator/config/auction-fees/${id}`);
      setAuctionRules(prev => prev.filter(r => (r._id ?? r.id) !== id));
      toast.success(t('adm_rule_deleted'));
    } catch (err) {
      toast.error(t('adm_deletion_error'));
    }
  };

  // Run preview calculation
  const runPreview = async () => {
    setPreviewLoading(true);
    try {
      const res = await axios.post(`${API_URL}/api/calculator/calculate`, previewInput);
      setPreviewResult(res.data);
    } catch (err) {
      toast.error(t('adm_calculation_error'));
    } finally {
      setPreviewLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-[#18181B] border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-[#71717A]">{t('adm_loading_2')}</p>
        </div>
      </div>
    );
  }

  return (
    <motion.div 
      className="space-y-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      data-testid="calculator-admin-page"
    >
      {/* Header — unified standard: dark icon block + title, refresh is the canonical black-square icon-only button in the top-right. */}
      <div className="flex flex-row items-start justify-between gap-3 sm:gap-4">
        <div className="flex items-start gap-3 flex-1 min-w-0">
          <div className="w-10 h-10 rounded-2xl bg-[#18181B] text-white flex items-center justify-center shrink-0">
            <Calculator size={20} weight="bold" />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[#18181B] leading-tight break-words" style={{ fontFamily: 'Mazzard, Mazzard H, Mazzard M, system-ui, sans-serif' }}>
              {t('adm_calculator_settings')}
            </h1>
            <p className="text-xs sm:text-sm text-[#71717A] mt-1 break-words">
              {t('adm_bid_commission_and_hidden_fee_management')}
            </p>
          </div>
        </div>
        <div className="shrink-0">
          <RefreshButton onClick={loadAllData} ariaLabel={t('adm_refresh_3')} testId="refresh-btn" />
        </div>
      </div>

      {/* Stats - compact */}
      {stats && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
          <StatCard
            icon={ChartLine}
            label={t('adm_calculations')}
            value={Number(stats.totalQuotes ?? stats.quotes ?? 0)}
            compact
          />
          <StatCard
            icon={CurrencyDollar}
            label={t('adm_amount')}
            value={(() => {
              const v = Number(stats.totalQuotedValue ?? 0);
              if (!isFinite(v) || v === 0) return '$0';
              if (v >= 1000) return `$${(v / 1000).toFixed(1)}k`;
              return `$${v.toFixed(0)}`;
            })()}
            compact
          />
          <StatCard
            icon={Gear}
            label={t('adm_profiles')}
            value={Number(stats.profiles ?? stats.profileActive ?? 0)}
            compact
          />
          <StatCard
            icon={Calculator}
            label={t('adm_active_3')}
            value={stats.activeProfile || 'Standard'}
            compact
          />
        </div>
      )}

      {/* Live Preview - MOVED TO TOP */}
      <div className="card p-4 space-y-4 bg-gradient-to-r from-[#F0FDF4] to-[#ECFDF5] border-[#86EFAC]" data-testid="preview-section">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-[#059669] rounded-lg">
            <Eye size={20} className="text-white" />
          </div>
          <div>
            <h2 className="font-semibold text-[#18181B]">{t('adm_live_preview')}</h2>
            <p className="text-xs text-[#71717A]">{t('adm_test_calculation_with_current_settings')}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          <NumberField 
            label={t('adm2_6d819ac544')} 
            value={previewInput.price} 
            onChange={(v) => setPreviewInput({...previewInput, price: v})}
          />
          <CustomSelect
            label={t('adm_port')}
            value={previewInput.port}
            onChange={(val) => setPreviewInput({...previewInput, port: val})}
            options={(portsCatalog.length
              ? portsCatalog
              : [{ code: 'burgas', name: t('adm_burgas'), country: 'BG' }]
            ).map((p) => ({
              value: p.code || p.id,
              label: `${p.name}${p.country ? ` (${p.country})` : ''}`,
            }))}
            testId="preview-port"
          />
          <CustomSelect
            label={t('adm_auction_2')}
            value={previewInput.auction}
            onChange={(val) => setPreviewInput({...previewInput, auction: val})}
            options={(auctionsCatalog.length
              ? auctionsCatalog
              : [{ code: 'copart', name: t('adm_copart') }, { code: 'iaai', name: 'IAAI' }]
            ).map((a) => ({ value: a.code, label: a.name }))}
            testId="preview-auction"
          />
          <CustomSelect
            label={t('adm_car_type')}
            value={previewInput.vehicleType}
            onChange={(val) => setPreviewInput({...previewInput, vehicleType: val})}
            options={(vehicleTypesCatalog.length
              ? vehicleTypesCatalog
              : [{ code: 'sedan', name: t('adm_sedan') }]
            ).map((v) => ({ value: v.code, label: v.name }))}
            testId="preview-vehicle-type"
          />
          <div className="flex items-end">
            <button
              onClick={runPreview}
              disabled={previewLoading}
              className="btn-primary w-full flex items-center justify-center gap-2"
              data-testid="run-preview-btn"
            >
              <Calculator size={18} />
              {previewLoading ? t('adm2_788a664f43') : t('adm2_b965c37ae7')}
            </button>
          </div>
        </div>

        {previewResult && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 pt-3 border-t border-[#86EFAC]">
            {/* Client View */}
            <div className="bg-white border border-[#E4E4E7] rounded-xl p-3">
              <h3 className="font-semibold text-[#18181B] mb-2 flex items-center gap-2 text-sm">
                <Eye size={14} />
                {t('adm_client_view')}
              </h3>
              <div className="space-y-1 text-sm max-h-[220px] overflow-y-auto">
                {(previewResult.formattedBreakdown || previewResult.calculation?.breakdown || []).map((item, i) => (
                  <div key={i} className="flex justify-between py-0.5 border-b border-[#F4F4F5]">
                    <span className="text-[#71717A] text-xs">{item.label}</span>
                    <span className="font-medium text-xs">${Number(item.value || 0).toLocaleString()}</span>
                  </div>
                ))}
              </div>
              <div className="mt-2 pt-2 border-t-2 border-[#18181B] flex justify-between items-center">
                <span className="font-semibold text-sm">{t('adm_customer_sees')}</span>
                <span className="font-bold text-lg text-[#059669]" data-testid="preview-visible-total">
                  ${Number(previewResult.totals?.visible ?? previewResult.calculation?.total ?? 0).toLocaleString()}
                </span>
              </div>
            </div>

            {/* Manager View */}
            <div className="bg-[#F5F3FF] border border-[#7C3AED] rounded-xl p-3">
              <h3 className="font-semibold text-[#18181B] mb-2 flex items-center gap-2 text-sm">
                <EyeSlash size={14} className="text-[#7C3AED]" />
                {t('adm_manager_view')}
              </h3>
              <div className="space-y-1 text-sm">
                <div className="flex justify-between py-0.5">
                  <span className="text-[#71717A] text-xs">{t('adm_vehicle_price')}</span>
                  <span className="font-medium text-xs">
                    ${Number(previewResult.calculation?.vehiclePrice || 0).toLocaleString()}
                  </span>
                </div>
                <div className="flex justify-between py-0.5">
                  <span className="text-[#71717A] text-xs">{t('adm_auction_total')}</span>
                  <span className="font-medium text-xs">
                    ${Number(previewResult.calculation?.auctionTotal || 0).toLocaleString()}
                  </span>
                </div>
                <div className="flex justify-between py-0.5">
                  <span className="text-[#71717A] text-xs">{t('adm_delivery_total')}</span>
                  <span className="font-medium text-xs">
                    ${Number(previewResult.calculation?.deliveryTotal || 0).toLocaleString()}
                  </span>
                </div>
                <div className="flex justify-between py-0.5">
                  <span className="text-[#71717A] text-xs">{t('adm_hidden_fee')}</span>
                  <span className="font-medium text-[#7C3AED] text-xs">
                    +${Number(previewResult.hiddenBreakdown?.hiddenFee || 0).toLocaleString()}
                  </span>
                </div>
              </div>
              <div className="mt-2 pt-2 border-t-2 border-[#7C3AED] flex justify-between items-center">
                <span className="font-semibold text-sm">{t('adm_manager')}</span>
                <span className="font-bold text-lg text-[#7C3AED]" data-testid="preview-internal-total">
                  ${Number(previewResult.totals?.internal ?? previewResult.calculation?.total ?? 0).toLocaleString()}
                </span>
              </div>
              <div className="mt-2 p-1.5 bg-white rounded-lg">
                <div className="flex justify-between text-xs">
                  <span className="text-[#71717A]">{t('adm_margin')}</span>
                  <span className="font-semibold text-[#059669]">
                    ${Number(previewResult.margin?.controllableMargin || 0).toLocaleString()}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Profile Settings - COLLAPSIBLE with EDIT MODE */}
      {profile && (
        <CollapsibleSection
          title={t('adm_profile_settings')}
          subtitle={`${profile.name} • ${profile.destinationCountry}`}
          icon={Gear}
          isExpanded={expandedSections.profile}
          onToggle={() => toggleSection('profile')}
          headerAction={
            !isEditingProfile && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  startEditingProfile();
                }}
                className="p-2 hover:bg-[#F4F4F5] rounded-lg transition-colors"
                title={t('adm_edit_2')}
              >
                <PencilSimple size={16} className="text-[#71717A]" />
              </button>
            )
          }
        >
          {isEditingProfile ? (
            // Edit Mode
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                <InputField 
                  label={t('adm_profile_name')} 
                  value={editedProfile?.name || ''} 
                  onChange={(v) => setEditedProfile({...editedProfile, name: v})}
                />
                <InputField 
                  label={t('adm_country')} 
                  value={editedProfile?.destinationCountry || ''} 
                  onChange={(v) => setEditedProfile({...editedProfile, destinationCountry: v})}
                />
                <InputField 
                  label={t('adm_currency')} 
                  value={editedProfile?.currency || ''} 
                  onChange={(v) => setEditedProfile({...editedProfile, currency: v})}
                />
                <NumberField 
                  label="Insurance Rate (%)" 
                  value={Number((editedProfile?.insuranceRate || 0) * 100)} 
                  onChange={(v) => setEditedProfile({...editedProfile, insuranceRate: (Number(v) || 0) / 100})}
                />
                <NumberField 
                  label="Customs Duty Rate (%)" 
                  value={Number((editedProfile?.customsDutyRate || 0) * 100)} 
                  onChange={(v) => setEditedProfile({...editedProfile, customsDutyRate: (Number(v) || 0) / 100})}
                />
                <NumberField 
                  label="Port Forwarding ($)" 
                  value={Number(editedProfile?.portForwarding || 0)} 
                  onChange={(v) => setEditedProfile({...editedProfile, portForwarding: Number(v) || 0})}
                />
                <NumberField 
                  label="Port Parking ($)" 
                  value={Number(editedProfile?.portParking || 0)} 
                  onChange={(v) => setEditedProfile({...editedProfile, portParking: Number(v) || 0})}
                />
                <NumberField 
                  label="Parking Bulgaria ($)" 
                  value={Number(editedProfile?.parkingBulgaria || 0)} 
                  onChange={(v) => setEditedProfile({...editedProfile, parkingBulgaria: Number(v) || 0})}
                />
                <NumberField 
                  label="Company Services ($)" 
                  value={Number(editedProfile?.companyServices || 0)} 
                  onChange={(v) => setEditedProfile({...editedProfile, companyServices: Number(v) || 0})}
                />
                <NumberField 
                  label="Customs Documentation ($)" 
                  value={Number(editedProfile?.customsDocumentation || 0)} 
                  onChange={(v) => setEditedProfile({...editedProfile, customsDocumentation: Number(v) || 0})}
                />
                <NumberField
                  label={t('adm_damaged_customs_factor')}
                  value={Number(editedProfile?.damagedCustomsFactor ?? 0.7)}
                  step={0.01}
                  onChange={(v) => setEditedProfile({...editedProfile, damagedCustomsFactor: Number(v) || 0})}
                />
                <NumberField
                  label="Damage Handling Fee ($)"
                  value={Number(editedProfile?.damageHandlingFeeUsd ?? 200)}
                  onChange={(v) => setEditedProfile({...editedProfile, damageHandlingFeeUsd: Number(v) || 0})}
                />
                <NumberField
                  label="Official Fees ($)"
                  value={Number(editedProfile?.officialFees || 0)}
                  onChange={(v) => setEditedProfile({...editedProfile, officialFees: Number(v) || 0})}
                />
              </div>

              {/* Per-auction fees (Copart / IAAI) */}
              <div className="pt-3 border-t border-[#E4E4E7]">
                <h3 className="font-medium text-[#18181B] mb-3 flex items-center gap-2 text-sm">
                  <CurrencyDollar size={16} className="text-[#D97706]" />
                  Auction Fees (Copart / IAAI)
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                  {['copart', 'iaai'].map((auc) => {
                    const af = (editedProfile?.auctionFees || {})[auc] || {};
                    const setField = (field, v) => {
                      const next = { ...(editedProfile?.auctionFees || {}) };
                      next[auc] = { ...(next[auc] || {}), [field]: Number(v) || 0 };
                      setEditedProfile({ ...editedProfile, auctionFees: next });
                    };
                    return (
                      <React.Fragment key={auc}>
                        <NumberField
                          label={`${auc.toUpperCase()} Buyer (%)`}
                          value={Number(af.buyer_fee_percent || 0)}
                          onChange={(v) => setField('buyer_fee_percent', v)}
                        />
                        <NumberField
                          label={`${auc.toUpperCase()} Gate ($)`}
                          value={Number(af.gate_fee || 0)}
                          onChange={(v) => setField('gate_fee', v)}
                        />
                        <NumberField
                          label={`${auc.toUpperCase()} Title ($)`}
                          value={Number(af.title_fee || 0)}
                          onChange={(v) => setField('title_fee', v)}
                        />
                      </React.Fragment>
                    );
                  })}
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  onClick={saveProfile}
                  disabled={saving}
                  className="btn-primary flex items-center gap-2"
                  data-testid="save-profile-btn"
                >
                  <FloppyDisk size={16} />
                  {saving ? t('adm2_034bf16d6c') : t('adm2_79d9f1b64d')}
                </button>
                <button
                  onClick={cancelEditingProfile}
                  className="px-4 py-2 border border-[#E4E4E7] rounded-xl hover:bg-[#F4F4F5] flex items-center gap-2"
                >
                  <X size={16} />
                  {t('adm_cancel_3')}
                </button>
              </div>
            </div>
          ) : (
            // View Mode - Compact display
            <div className="space-y-3">
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
                <ViewField label={t('adm_name_2')} value={profile.name || '—'} />
                <ViewField label={t('adm_country')} value={profile.destinationCountry || '—'} />
                <ViewField label={t('adm_currency')} value={profile.currency || 'USD'} />
                <ViewField label={t('adm_insurance')} value={`${((profile.insuranceRate || 0) * 100).toFixed(2)}%`} />
                <ViewField label={t('adm_customs_duty')} value={`${((profile.customsDutyRate || 0) * 100).toFixed(2)}%`} />
                <ViewField label={t('adm_port_forwarding')} value={`$${Number(profile.portForwarding || 0).toLocaleString()}`} />
                <ViewField label={t('adm_port_parking')} value={`$${Number(profile.portParking || 0).toLocaleString()}`} />
                <ViewField label={t('adm_parking_bg')} value={`$${Number(profile.parkingBulgaria || 0).toLocaleString()}`} />
                <ViewField label={t('adm_company_services')} value={`$${Number(profile.companyServices || 0).toLocaleString()}`} />
                <ViewField label={t('adm_customs_docs')} value={`$${Number(profile.customsDocumentation || 0).toLocaleString()}`} />
                <ViewField label={t('adm_damaged_factor')} value={`×${Number(profile.damagedCustomsFactor ?? 0.7).toFixed(2)}`} />
                <ViewField label={t('adm_damage_handling')} value={`$${Number(profile.damageHandlingFeeUsd ?? 200).toLocaleString()}`} />
                <ViewField label={t('adm_official_fees')} value={`$${Number(profile.officialFees || 0).toLocaleString()}`} />
                <ViewField
                  label={t('adm_copart_title')}
                  value={`$${Number(((profile.auctionFees || {}).copart || {}).title_fee || 0).toLocaleString()}`}
                />
                <ViewField
                  label={t('adm_iaai_title')}
                  value={`$${Number(((profile.auctionFees || {}).iaai || {}).title_fee || 0).toLocaleString()}`}
                />
              </div>
              <div className="pt-2 border-t border-[#E4E4E7]">
                <p className="text-xs text-[#71717A] mb-2">Buyer Fee Tiers (auction):</p>
                <div className="flex gap-4 flex-wrap text-sm">
                  <span>
                    {t('adm_copart_2')} <strong>{((profile.auctionFees || {}).copart || {}).buyer_fee_percent || 0}%</strong>
                  </span>
                  <span>
                    {t('adm_iaai')} <strong>{((profile.auctionFees || {}).iaai || {}).buyer_fee_percent || 0}%</strong>
                  </span>
                </div>
              </div>
            </div>
          )}
        </CollapsibleSection>
      )}

      {/* USA Inland Transport — Wave 4 BUCKET MODEL (replaces the
          legacy flat per-port routes table). Sits in the same admin
          location and the same collapsible shell so the surrounding UI
          stays familiar.  Editor handles its own save/load via
          /api/calculator/config/usa-inland-defaults + the PATCH
          /api/calculator/config/profile endpoint. */}
      <CollapsibleSection
        title={t('adm_usa_inland_delivery')}
        subtitle={
          profile?.usaInlandModel?.enabled === false
            ? 'Bucket model OFF · legacy routes'
            : 'Bucket model · state → port × multiplier'
        }
        icon={Truck}
        isExpanded={expandedSections.usaInland}
        onToggle={() => toggleSection('usaInland')}
      >
        <UsaInlandModelEditor
          profile={profile}
          onProfileChange={(p) => { setProfile(p); setEditedProfile(p); }}
        />
      </CollapsibleSection>

      {/* Ocean Freight — Wave 4 BUCKET MODEL (export port → ocean
          bucket × shared multiplier + destination delta). Replaces the
          legacy flat per-(port,vehicle) routes table. Lives in the same
          collapsible shell so the surrounding admin UI is unchanged.
          Editor handles its own save/load via
          /api/calculator/config/ocean-defaults + PATCH
          /api/calculator/config/profile. */}
      <CollapsibleSection
        title={t('adm_ocean_freight')}
        subtitle={
          profile?.oceanFreightModel?.enabled === false
            ? 'Bucket model OFF · legacy routes'
            : 'Bucket model · export port → lane × multiplier'
        }
        icon={Anchor}
        isExpanded={expandedSections.ocean}
        onToggle={() => toggleSection('ocean')}
      >
        <OceanFreightModelEditor
          profile={profile}
          onProfileChange={(p) => { setProfile(p); setEditedProfile(p); }}
        />
      </CollapsibleSection>

      {/* EU Delivery — Wave 4.2 MATRIX MODEL (port × vehicle EUR → USD,
          all routed to Sofia BG). Replaces the legacy flat
          per-(destinationCode, vehicleType) routes table for the
          eu_delivery rateType. Sparse overrides land in
          ``calculator_profile.euDeliveryModel.matrix`` via PATCH
          /api/calculator/config/profile. */}
      <CollapsibleSection
        title={t('adm_eu_delivery')}
        subtitle={
          profile?.euDeliveryModel?.enabled === false
            ? 'Matrix OFF · legacy routes'
            : 'Matrix · EU port → Sofia (BG) per vehicle (EUR)'
        }
        icon={Airplane}
        isExpanded={expandedSections.euDelivery}
        onToggle={() => toggleSection('euDelivery')}
      >
        <EuDeliveryModelEditor
          profile={profile}
          onProfileChange={(p) => { setProfile(p); setEditedProfile(p); }}
        />
      </CollapsibleSection>

      {/* Auction Fee Rules - COLLAPSIBLE */}
      <CollapsibleSection
        title={t('adm_auction_fee_rules')}
        subtitle={`${auctionRules.length} ${t('adm3_rules_count')}`}
        icon={CurrencyDollar}
        isExpanded={expandedSections.auctionRules}
        onToggle={() => toggleSection('auctionRules')}
      >
        <div className="overflow-x-auto">
          <table className="table-premium w-full min-w-[400px]" data-testid="auction-rules-table">
            <thead>
              <tr>
                <th>Min ($)</th>
                <th>Max ($)</th>
                <th>Fee ($)</th>
                <th className="text-right">{t('adm_actions_2')}</th>
              </tr>
            </thead>
            <tbody>
              {auctionRules.map(rule => (
                <AuctionRuleRow
                  key={rule._id ?? rule.id}
                  rule={rule}
                  profileCode={profile?.code}
                  onSave={saveAuctionRule}
                  onDelete={deleteAuctionRule}
                />
              ))}
              <NewAuctionRuleRow
                profileCode={profile?.code}
                onSave={saveAuctionRule}
              />
            </tbody>
          </table>
        </div>
      </CollapsibleSection>

      {/* ════════════════════════════════════════════════════════════ */}
      {/* KOREA → ROMANIA → BULGARIA route                              */}
      {/* ════════════════════════════════════════════════════════════ */}
      <div className="mt-8 mb-2 flex items-center gap-3">
        <div className="flex-1 h-px bg-gradient-to-r from-transparent via-[#E4E4E7] to-transparent" />
        <h2 className="text-lg font-bold text-[#18181B] flex items-center gap-2 px-4 py-2 rounded-full bg-[#FEF3C7] border border-[#F59E0B]">
          {t('adm_korea_romania_bulgaria')}
        </h2>
        <div className="flex-1 h-px bg-gradient-to-r from-transparent via-[#E4E4E7] to-transparent" />
      </div>

      {/* Korea Live Preview */}
      <div className="card p-4 space-y-4 bg-gradient-to-r from-[#FEF3C7] to-[#FEE2E2] border-[#FBBF24]" data-testid="korea-preview-section">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-[#D97706] rounded-lg">
            <Eye size={20} className="text-white" />
          </div>
          <div>
            <h2 className="font-semibold text-[#18181B]">{t('adm_korea_live_preview')}</h2>
            <p className="text-xs text-[#71717A]">{t('adm_korea_romania_bulgaria_pipeline')}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
          <NumberField
            label="Vehicle Price ($)"
            value={koreaPreviewInput.price}
            onChange={(v) => setKoreaPreviewInput({ ...koreaPreviewInput, price: v })}
          />
          <NumberField
            label="Invoice Price ($)"
            value={koreaPreviewInput.invoicePrice}
            onChange={(v) => setKoreaPreviewInput({ ...koreaPreviewInput, invoicePrice: v })}
          />
          <NumberField
            label="Additional Fees (€)"
            value={koreaPreviewInput.additionalFees}
            onChange={(v) => setKoreaPreviewInput({ ...koreaPreviewInput, additionalFees: v })}
          />
          <CustomSelect
            label={t('adm_vehicle_type')}
            value={koreaPreviewInput.vehicleType}
            onChange={(val) => setKoreaPreviewInput({ ...koreaPreviewInput, vehicleType: val })}
            options={(vehicleTypesCatalog.length
              ? vehicleTypesCatalog
              : [{ code: 'sedan', name: t('adm_sedan') }]
            ).map((v) => ({ value: v.code, label: v.name }))}
            testId="korea-preview-vehicle-type"
          />
          <CustomSelect
            label={t('adm_logistics')}
            value={koreaPreviewInput.useLogisticsPackage ? 'package' : 'itemized'}
            onChange={(val) => setKoreaPreviewInput({ ...koreaPreviewInput, useLogisticsPackage: val === 'package' })}
            options={[
              { value: 'package', label: 'Fixed package ($3850)' },
              { value: 'itemized', label: t('adm_itemized') },
            ]}
            testId="korea-preview-logistics-mode"
          />
          <div className="flex items-end">
            <button
              onClick={runKoreaPreview}
              disabled={koreaPreviewLoading}
              className="btn-primary w-full flex items-center justify-center gap-2"
              data-testid="run-korea-preview-btn"
            >
              <Calculator size={18} />
              {koreaPreviewLoading ? '...' : 'Calculate'}
            </button>
          </div>
        </div>

        {koreaPreviewResult && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 pt-3 border-t border-[#FBBF24]">
            <div className="bg-white border border-[#E4E4E7] rounded-xl p-3">
              <h3 className="font-semibold text-[#18181B] mb-2 flex items-center gap-2 text-sm">
                <Eye size={14} /> {t('adm_breakdown')}
              </h3>
              <div className="space-y-1 text-sm max-h-[260px] overflow-y-auto">
                {(koreaPreviewResult.calculation?.breakdown || []).map((item, i) => (
                  <div key={i} className="flex justify-between py-0.5 border-b border-[#F4F4F5]">
                    <span className="text-[#71717A] text-xs">{item.label}</span>
                    <span className="font-medium text-xs">${Number(item.value || 0).toLocaleString()}</span>
                  </div>
                ))}
              </div>
              <div className="mt-2 pt-2 border-t-2 border-[#18181B] flex justify-between items-center">
                <span className="font-semibold text-sm">{t('adm_final_total_2')}</span>
                <span className="font-bold text-lg text-[#D97706]" data-testid="korea-preview-total">
                  ${Number(koreaPreviewResult.calculation?.total ?? 0).toLocaleString()}
                </span>
              </div>
            </div>
            <div className="bg-[#FFF7ED] border border-[#F59E0B] rounded-xl p-3">
              <h3 className="font-semibold text-[#18181B] mb-2 text-sm">{t('adm_calculation_blocks')}</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between p-2 bg-white rounded-lg">
                  <span className="text-[#71717A]">Calc 1 (Price + 5% auction)</span>
                  <span className="font-bold">${Number(koreaPreviewResult.calculation?.calc1Total ?? 0).toLocaleString()}</span>
                </div>
                <div className="flex justify-between p-2 bg-white rounded-lg">
                  <span className="text-[#71717A]">Calc 2 (Logistics)</span>
                  <span className="font-bold">${Number(koreaPreviewResult.calculation?.calc2Total ?? 0).toLocaleString()}</span>
                </div>
                <div className="flex justify-between p-2 bg-white rounded-lg">
                  <span className="text-[#71717A]">Calc 3 (Customs + VAT + fees)</span>
                  <span className="font-bold">${Number(koreaPreviewResult.calculation?.calc3Total ?? 0).toLocaleString()}</span>
                </div>
                <div className="flex justify-between p-2 bg-[#D97706] text-white rounded-lg">
                  <span className="font-semibold">{t('adm_final_total')}</span>
                  <span className="font-bold">
                    ${Number(koreaPreviewResult.calculation?.total ?? 0).toLocaleString()}
                    {' '}({Number(koreaPreviewResult.calculation?.totalEur ?? 0).toLocaleString()}€)
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Korea Profile Settings - COLLAPSIBLE with EDIT MODE */}
      {koreaProfile && (
        <CollapsibleSection
          title={t('adm_korea_profile_settings')}
          subtitle={`${koreaProfile.name} • Origin: KR → BG`}
          icon={Gear}
          isExpanded={expandedSections.koreaProfile}
          onToggle={() => toggleSection('koreaProfile')}
          headerAction={
            !isEditingKorea && (
              <button
                onClick={(e) => { e.stopPropagation(); startEditingKorea(); }}
                className="p-2 hover:bg-[#F4F4F5] rounded-lg transition-colors"
                title={t('adm_edit')}
              >
                <PencilSimple size={16} className="text-[#71717A]" />
              </button>
            )
          }
        >
          {isEditingKorea ? (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                <NumberField
                  label="Auction Fee (%)"
                  value={Number(editedKoreaProfile?.auctionFeePercent || 0)}
                  onChange={(v) => setEditedKoreaProfile({ ...editedKoreaProfile, auctionFeePercent: Number(v) || 0 })}
                />
                <NumberField
                  label="Logistics Package ($)"
                  value={Number(editedKoreaProfile?.logisticsPackage || 0)}
                  onChange={(v) => setEditedKoreaProfile({ ...editedKoreaProfile, logisticsPackage: Number(v) || 0 })}
                />
                <div>
                  <label className="block text-xs font-medium text-[#71717A] uppercase tracking-wider mb-1">
                    {t('adm_use_package')}
                  </label>
                  <WhiteSelect
                    value={editedKoreaProfile?.useLogisticsPackage ? 'true' : 'false'}
                    onChange={(e) => setEditedKoreaProfile({ ...editedKoreaProfile, useLogisticsPackage: e.target.value === 'true' })}
                    className="input"
                  >
                    <option value="true">{t('adm_fixed_3850_package')}</option>
                    <option value="false">{t('adm_itemized')}</option>
                  </WhiteSelect>
                </div>
                <NumberField
                  label="Korea Inland ($)"
                  value={Number(editedKoreaProfile?.koreaInlandTransport || 0)}
                  onChange={(v) => setEditedKoreaProfile({ ...editedKoreaProfile, koreaInlandTransport: Number(v) || 0 })}
                />
                <NumberField
                  label="Sea Shipping ($)"
                  value={Number(editedKoreaProfile?.seaShipping || 0)}
                  onChange={(v) => setEditedKoreaProfile({ ...editedKoreaProfile, seaShipping: Number(v) || 0 })}
                />
                <NumberField
                  label="Insurance ($)"
                  value={Number(editedKoreaProfile?.insurance || 0)}
                  onChange={(v) => setEditedKoreaProfile({ ...editedKoreaProfile, insurance: Number(v) || 0 })}
                />
                <NumberField
                  label="Forwarder Fee ($)"
                  value={Number(editedKoreaProfile?.forwarderFee || 0)}
                  onChange={(v) => setEditedKoreaProfile({ ...editedKoreaProfile, forwarderFee: Number(v) || 0 })}
                />
                <NumberField
                  label="Documents/Mail ($)"
                  value={Number(editedKoreaProfile?.documentsMailFee || 0)}
                  onChange={(v) => setEditedKoreaProfile({ ...editedKoreaProfile, documentsMailFee: Number(v) || 0 })}
                />
                <NumberField
                  label="Customs Duty (%)"
                  value={Number((editedKoreaProfile?.customsDutyRate || 0) * 100)}
                  onChange={(v) => setEditedKoreaProfile({ ...editedKoreaProfile, customsDutyRate: (Number(v) || 0) / 100 })}
                />
                <NumberField
                  label="VAT (%)"
                  value={Number((editedKoreaProfile?.vatRate || 0) * 100)}
                  onChange={(v) => setEditedKoreaProfile({ ...editedKoreaProfile, vatRate: (Number(v) || 0) / 100 })}
                />
                <NumberField
                  label="Undervalue (%)"
                  value={Number((editedKoreaProfile?.undervaluePercent || 0) * 100)}
                  onChange={(v) => setEditedKoreaProfile({ ...editedKoreaProfile, undervaluePercent: (Number(v) || 0) / 100 })}
                />
                <NumberField
                  label={t('adm_fx_usd_eur')}
                  value={Number(editedKoreaProfile?.fxUsdToEur || 0)}
                  onChange={(v) => setEditedKoreaProfile({ ...editedKoreaProfile, fxUsdToEur: Number(v) || 0 })}
                />
                <NumberField
                  label="BIBI Service Fee ($)"
                  value={Number(editedKoreaProfile?.bibiServiceFee || 0)}
                  onChange={(v) => setEditedKoreaProfile({ ...editedKoreaProfile, bibiServiceFee: Number(v) || 0 })}
                />
                <NumberField
                  label="BG Transport (€)"
                  value={Number(editedKoreaProfile?.bgTransportEur || 0)}
                  onChange={(v) => setEditedKoreaProfile({ ...editedKoreaProfile, bgTransportEur: Number(v) || 0 })}
                />
                <NumberField
                  label="Tech Inspection (€)"
                  value={Number(editedKoreaProfile?.technicalInspectionEur || 0)}
                  onChange={(v) => setEditedKoreaProfile({ ...editedKoreaProfile, technicalInspectionEur: Number(v) || 0 })}
                />
                <NumberField
                  label="BB Cars Commission (€)"
                  value={Number(editedKoreaProfile?.bbCarsCommissionEur || 0)}
                  onChange={(v) => setEditedKoreaProfile({ ...editedKoreaProfile, bbCarsCommissionEur: Number(v) || 0 })}
                />
                <NumberField
                  label="Additional Fees (€)"
                  value={Number(editedKoreaProfile?.additionalFeesEur || 0)}
                  onChange={(v) => setEditedKoreaProfile({ ...editedKoreaProfile, additionalFeesEur: Number(v) || 0 })}
                />
                <NumberField
                  label={t('adm_damaged_customs_factor')}
                  value={Number(editedKoreaProfile?.damagedCustomsFactor ?? 0.7)}
                  step={0.01}
                  onChange={(v) => setEditedKoreaProfile({ ...editedKoreaProfile, damagedCustomsFactor: Number(v) || 0 })}
                />
                <NumberField
                  label="Damage Handling ($)"
                  value={Number(editedKoreaProfile?.damageHandlingFeeKoreaUsd ?? 250)}
                  onChange={(v) => setEditedKoreaProfile({ ...editedKoreaProfile, damageHandlingFeeKoreaUsd: Number(v) || 0 })}
                />
                <NumberField
                  label="Official Fees ($)"
                  value={Number(editedKoreaProfile?.officialFeesUsd || 0)}
                  onChange={(v) => setEditedKoreaProfile({ ...editedKoreaProfile, officialFeesUsd: Number(v) || 0 })}
                />
              </div>
              <div className="flex gap-2 pt-2">
                <button
                  onClick={saveKoreaProfile}
                  disabled={saving}
                  className="btn-primary flex items-center gap-2"
                  data-testid="save-korea-profile-btn"
                >
                  <FloppyDisk size={16} />
                  {saving ? 'Saving...' : 'Save'}
                </button>
                <button
                  onClick={cancelEditingKorea}
                  className="px-4 py-2 border border-[#E4E4E7] rounded-xl hover:bg-[#F4F4F5] flex items-center gap-2"
                >
                  <X size={16} /> {t('adm_cancel')}
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
                <ViewField label={t('adm_auction_fee')} value={`${(koreaProfile.auctionFeePercent || 0).toFixed(1)}%`} />
                <ViewField label={t('adm_use_package')} value={koreaProfile.useLogisticsPackage ? 'Yes ($3850)' : 'Itemized'} />
                <ViewField label={t('adm_logistics_pkg')} value={`$${Number(koreaProfile.logisticsPackage || 0).toLocaleString()}`} />
                <ViewField label={t('adm_korea_inland')} value={`$${Number(koreaProfile.koreaInlandTransport || 0).toLocaleString()}`} />
                <ViewField label={t('adm_sea_shipping')} value={`$${Number(koreaProfile.seaShipping || 0).toLocaleString()}`} />
                <ViewField label={t('adm_insurance')} value={`$${Number(koreaProfile.insurance || 0).toLocaleString()}`} />
                <ViewField label={t('adm_forwarder')} value={`$${Number(koreaProfile.forwarderFee || 0).toLocaleString()}`} />
                <ViewField label={t('adm_docsmail')} value={`$${Number(koreaProfile.documentsMailFee || 0).toLocaleString()}`} />
                <ViewField label={t('adm_customs_duty')} value={`${((koreaProfile.customsDutyRate || 0) * 100).toFixed(1)}%`} />
                <ViewField label="VAT" value={`${((koreaProfile.vatRate || 0) * 100).toFixed(1)}%`} />
                <ViewField label={t('adm_undervalue')} value={`${((koreaProfile.undervaluePercent || 0) * 100).toFixed(1)}%`} />
                <ViewField label={t('adm_fx_usdeur')} value={(koreaProfile.fxUsdToEur || 0).toFixed(3)} />
                <ViewField label={t('adm_bibi_service')} value={`$${Number(koreaProfile.bibiServiceFee || 0).toLocaleString()}`} />
                <ViewField label={t('adm_bg_transport')} value={`€${Number(koreaProfile.bgTransportEur || 0).toLocaleString()}`} />
                <ViewField label={t('adm_tech_inspection')} value={`€${Number(koreaProfile.technicalInspectionEur || 0).toLocaleString()}`} />
                <ViewField label={t('adm_bb_cars_comm')} value={`€${Number(koreaProfile.bbCarsCommissionEur || 0).toLocaleString()}`} />
                <ViewField label={t('adm_add_fees')} value={`€${Number(koreaProfile.additionalFeesEur || 0).toLocaleString()}`} />
                <ViewField label={t('adm_damaged_factor')} value={`×${Number(koreaProfile.damagedCustomsFactor ?? 0.7).toFixed(2)}`} />
                <ViewField label={t('adm_damage_handling')} value={`$${Number(koreaProfile.damageHandlingFeeKoreaUsd ?? 250).toLocaleString()}`} />
                <ViewField label={t('adm_official_fees')} value={`$${Number(koreaProfile.officialFeesUsd || 0).toLocaleString()}`} />
              </div>
            </div>
          )}
        </CollapsibleSection>
      )}

      {/* Korea Inland Transport - COLLAPSIBLE */}
      <CollapsibleSection
        title={t('adm_korea_inland_transport')}
        subtitle={`${groupedKoreaRoutes.korea_inland.length} rates (per vehicle type)`}
        icon={Truck}
        isExpanded={expandedSections.koreaInland}
        onToggle={() => toggleSection('koreaInland')}
      >
        <RateSectionContent
          rates={groupedKoreaRoutes.korea_inland}
          profileCode={'korea_bg'}
          rateType="korea_inland"
          onSave={saveKoreaRoute}
          onDelete={deleteKoreaRoute}
          locationField="originCode"
          vehicleTypesCatalog={vehicleTypesCatalog}
        />
      </CollapsibleSection>

      {/* Korea → Romania Sea Shipping - COLLAPSIBLE */}
      <CollapsibleSection
        title={t('adm_korea_romania_sea_shipping')}
        subtitle={`${groupedKoreaRoutes.korea_sea.length} rates`}
        icon={Anchor}
        isExpanded={expandedSections.koreaSea}
        onToggle={() => toggleSection('koreaSea')}
      >
        <RateSectionContent
          rates={groupedKoreaRoutes.korea_sea}
          profileCode={'korea_bg'}
          rateType="korea_sea"
          onSave={saveKoreaRoute}
          onDelete={deleteKoreaRoute}
          locationField="destinationCode"
          vehicleTypesCatalog={vehicleTypesCatalog}
        />
      </CollapsibleSection>

      {/* Romania → Bulgaria Transport - COLLAPSIBLE */}
      <CollapsibleSection
        title={t('adm_romania_bulgaria_transport')}
        subtitle={`${groupedKoreaRoutes.korea_bg_transport.length} rates (EUR)`}
        icon={Airplane}
        isExpanded={expandedSections.koreaBgTransport}
        onToggle={() => toggleSection('koreaBgTransport')}
      >
        <RateSectionContent
          rates={groupedKoreaRoutes.korea_bg_transport}
          profileCode={'korea_bg'}
          rateType="korea_bg_transport"
          onSave={saveKoreaRoute}
          onDelete={deleteKoreaRoute}
          locationField="destinationCode"
          vehicleTypesCatalog={vehicleTypesCatalog}
        />
      </CollapsibleSection>
    </motion.div>
  );
};

// Collapsible Section Component
const CollapsibleSection = ({ title, subtitle, icon: Icon, isExpanded, onToggle, headerAction, children }) => (
  <div className="card overflow-hidden" data-testid={`section-${title.toLowerCase().replace(/\s/g, '-')}`}>
    <button
      type="button"
      onClick={onToggle}
      className="w-full px-4 py-3 flex items-center justify-between hover:bg-[#FAFAFA] transition-colors focus:outline-none"
      style={{ outline: 'none', boxShadow: 'none' }}
    >
      <div className="flex items-center gap-3">
        <div className="p-2 bg-[#F4F4F5] rounded-lg flex items-center justify-center">
          <Icon size={18} className="text-[#18181B]" />
        </div>
        <div className="text-left">
          <h2 className="font-semibold text-[#18181B] text-sm leading-tight">{title}</h2>
          <p className="text-xs text-[#71717A] leading-tight mt-0.5">{subtitle}</p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        {headerAction}
        {isExpanded ? (
          <CaretUp size={18} className="text-[#71717A]" />
        ) : (
          <CaretDown size={18} className="text-[#71717A]" />
        )}
      </div>
    </button>
    {isExpanded && (
      <div className="px-4 py-3 border-t border-[#E4E4E7]">
        {children}
      </div>
    )}
  </div>
);

// Stat Card Component - compact version
const StatCard = ({ icon: Icon, label, value, compact }) => (
  <div className={`kpi-card ${compact ? 'p-3' : ''}`}>
    <div className="flex items-center gap-2">
      <Icon size={compact ? 16 : 24} weight="duotone" className="text-[#18181B]" />
      <div>
        <div className={`font-bold text-[#18181B] ${compact ? 'text-base' : 'text-xl'}`}>{value}</div>
        <div className="text-xs text-[#71717A]">{label}</div>
      </div>
    </div>
  </div>
);

// View Field Component (read-only)
const ViewField = ({ label, value }) => (
  <div className="bg-[#F4F4F5] rounded-lg px-3 py-2">
    <div className="text-[10px] text-[#71717A] uppercase tracking-wider">{label}</div>
    <div className="font-medium text-sm text-[#18181B]">{value}</div>
  </div>
);

// Input Field Component
const InputField = ({ label, value, onChange }) => (
  <div>
    <label className="block text-xs font-medium text-[#71717A] uppercase tracking-wider mb-1">{label}</label>
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="input"
    />
  </div>
);

// Number Field Component
const NumberField = ({ label, value, onChange, step }) => (
  <div>
    <label className="block text-xs font-medium text-[#71717A] uppercase tracking-wider mb-1">{label}</label>
    <input
      type="number"
      step={step ?? 'any'}
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      className="input"
    />
  </div>
);

// Rate Section Content Component
const RateSectionContent = ({
  rates,
  profileCode,
  rateType,
  onSave,
  onDelete,
  locationField,
  vehicleTypesCatalog = [],
  portsCatalog = [],
}) => {
  const { t } = useLang();
  const vehicleTypes = (vehicleTypesCatalog.length
    ? vehicleTypesCatalog
    : [
        { code: 'sedan', name: t('adm_sedan') },
        { code: 'suv', name: 'SUV' },
        { code: 'bigSUV', name: t('adm_big_suv') },
        { code: 'pickup', name: t('adm_pickup') },
      ]
  ).map((v) => ({ value: v.code, label: v.name }));

  const portOptions = (portsCatalog || []).map((p) => ({
    value: p.code || p.id,
    label: `${p.name}${p.country ? ` (${p.country})` : ''}`,
  }));

  const [newRate, setNewRate] = useState({ location: '', vehicleType: 'sedan', amount: 0 });

  const addNewRate = () => {
    if (!newRate.location || !newRate.amount) {
      toast.error(t('adm_fill_in_all_fields'));
      return;
    }
    onSave({
      profileCode,
      rateType,
      [locationField]: newRate.location,
      vehicleType: newRate.vehicleType,
      amount: newRate.amount
    });
    setNewRate({ location: '', vehicleType: 'sedan', amount: 0 });
  };

  return (
    <div className="overflow-x-auto">
      <table className="table-premium w-full min-w-[450px]">
        <thead>
          <tr>
            <th>{locationField === 'originCode' ? 'Port' : 'Destination'}</th>
            <th>{t('adm_vehicle_type')}</th>
            <th>Amount ($)</th>
            <th className="text-right">{t('adm_actions_2')}</th>
          </tr>
        </thead>
        <tbody>
          {rates.map(rate => (
            <RateRow
              key={rate._id ?? rate.id}
              rate={rate}
              profileCode={profileCode}
              rateType={rateType}
              locationField={locationField}
              onSave={onSave}
              onDelete={onDelete}
            />
          ))}
          {/* New Rate Row */}
          <tr className="bg-[#F4F4F5]">
            <td className="overflow-visible">
              {portOptions.length ? (
                <CustomSelect
                  value={newRate.location}
                  onChange={(val) => setNewRate({...newRate, location: val})}
                  options={portOptions}
                  placeholder={t('adm_select_port')}
                />
              ) : (
                <input
                  type="text"
                  value={newRate.location}
                  onChange={(e) => setNewRate({...newRate, location: e.target.value})}
                  placeholder={rateType === 'eu_delivery' ? 'BG' : 'NJ, GA…'}
                  className="input w-full max-w-[120px]"
                />
              )}
            </td>
            <td className="overflow-visible">
              <CustomSelect
                value={newRate.vehicleType}
                onChange={(val) => setNewRate({...newRate, vehicleType: val})}
                options={vehicleTypes}
                placeholder={t('adm_sedan')}
              />
            </td>
            <td>
              <input
                type="number"
                value={newRate.amount}
                onChange={(e) => setNewRate({...newRate, amount: Number(e.target.value)})}
                className="input w-full max-w-[100px]"
              />
            </td>
            <td>
              <button
                onClick={addNewRate}
                className="p-2 bg-[#18181B] text-white rounded-lg hover:bg-[#27272A]"
              >
                <Plus size={14} />
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
};

// Rate Row Component
const RateRow = ({ rate, profileCode, rateType, locationField, onSave, onDelete }) => {
  const [editing, setEditing] = useState(false);
  const [editedAmount, setEditedAmount] = useState(rate.amount);

  const handleSave = () => {
    onSave({
      ...rate,
      profileCode,
      rateType,
      amount: editedAmount
    });
    setEditing(false);
  };

  return (
    <tr>
      <td className="font-mono text-sm">{rate[locationField] || '—'}</td>
      <td className="text-sm">{rate.vehicleType}</td>
      <td>
        {editing ? (
          <input
            type="number"
            value={editedAmount}
            onChange={(e) => setEditedAmount(Number(e.target.value))}
            className="input w-20"
            autoFocus
          />
        ) : (
          <span className="font-medium text-sm">${rate.amount?.toLocaleString()}</span>
        )}
      </td>
      <td>
        <div className="flex items-center justify-end gap-1">
          {editing ? (
            <button onClick={handleSave} className="p-1.5 bg-[#059669] text-white rounded-lg">
              <FloppyDisk size={12} />
            </button>
          ) : (
            <button onClick={() => setEditing(true)} className="p-1.5 hover:bg-[#F4F4F5] rounded-lg">
              <Gear size={12} className="text-[#71717A]" />
            </button>
          )}
          <button onClick={() => onDelete(rate._id ?? rate.id)} className="p-1.5 hover:bg-[#FEE2E2] rounded-lg">
            <Trash size={12} className="text-[#DC2626]" />
          </button>
        </div>
      </td>
    </tr>
  );
};

// Auction Rule Row Component
const AuctionRuleRow = ({ rule, profileCode, onSave, onDelete }) => {
  const [editing, setEditing] = useState(false);
  const [editedFee, setEditedFee] = useState(rule.fee);

  const handleSave = () => {
    onSave({
      ...rule,
      profileCode,
      fee: editedFee
    });
    setEditing(false);
  };

  return (
    <tr>
      <td className="font-mono text-sm">${rule.minBid?.toLocaleString()}</td>
      <td className="font-mono text-sm">${rule.maxBid?.toLocaleString()}</td>
      <td>
        {editing ? (
          <input
            type="number"
            value={editedFee}
            onChange={(e) => setEditedFee(Number(e.target.value))}
            className="input w-20"
            autoFocus
          />
        ) : (
          <span className="font-medium text-[#D97706] text-sm">${rule.fee?.toLocaleString()}</span>
        )}
      </td>
      <td>
        <div className="flex items-center justify-end gap-1">
          {editing ? (
            <button onClick={handleSave} className="p-1.5 bg-[#059669] text-white rounded-lg">
              <FloppyDisk size={12} />
            </button>
          ) : (
            <button onClick={() => setEditing(true)} className="p-1.5 hover:bg-[#F4F4F5] rounded-lg">
              <Gear size={12} className="text-[#71717A]" />
            </button>
          )}
          <button onClick={() => onDelete(rule._id ?? rule.id)} className="p-1.5 hover:bg-[#FEE2E2] rounded-lg">
            <Trash size={12} className="text-[#DC2626]" />
          </button>
        </div>
      </td>
    </tr>
  );
};

// New Auction Rule Row Component
const NewAuctionRuleRow = ({ profileCode, onSave }) => {
  const { t } = useLang();
  const [newRule, setNewRule] = useState({ minBid: 0, maxBid: 0, fee: 0 });

  const handleAdd = () => {
    if (!newRule.maxBid || !newRule.fee) {
      toast.error(t('adm_fill_in_all_fields'));
      return;
    }
    onSave({
      profileCode,
      ...newRule
    });
    setNewRule({ minBid: 0, maxBid: 0, fee: 0 });
  };

  return (
    <tr className="bg-[#F4F4F5]">
      <td>
        <input
          type="number"
          value={newRule.minBid}
          onChange={(e) => setNewRule({...newRule, minBid: Number(e.target.value)})}
          className="input w-full"
          placeholder="0"
        />
      </td>
      <td>
        <input
          type="number"
          value={newRule.maxBid}
          onChange={(e) => setNewRule({...newRule, maxBid: Number(e.target.value)})}
          className="input w-full"
          placeholder="999"
        />
      </td>
      <td>
        <input
          type="number"
          value={newRule.fee}
          onChange={(e) => setNewRule({...newRule, fee: Number(e.target.value)})}
          className="input w-full"
          placeholder="0"
        />
      </td>
      <td>
        <button
          onClick={handleAdd}
          className="p-1.5 bg-[#059669] text-white rounded-lg hover:bg-[#047857]"
        >
          <Plus size={14} />
        </button>
      </td>
    </tr>
  );
};

export default CalculatorAdmin;
