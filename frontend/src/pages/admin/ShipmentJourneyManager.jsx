/**
 * Manager view for Shipment Journey controls:
 *   • bind vessel (mmsi/imo/name) to active stage
 *   • advance to next stage / activate specific stage
 *   • force tick
 *   • replace stages wholesale
 *   • see current journey + recent events
 */

import React, { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import {
  MagnifyingGlass,
  ArrowsClockwise,
  SkipForward,
  Plus,
  CheckCircle,
  Anchor,
  Truck,
  Package,
  Lightning,
} from '@phosphor-icons/react';
import JourneyPanel from '../../components/shipping/JourneyPanel';

import { useLang } from '../../i18n';
const API_URL = process.env.REACT_APP_BACKEND_URL || 'http://localhost:8001';

const STAGE_TYPE_LABEL = { land: 'Ground', vessel: 'Sea', port: 'Port' };

function EmptyState({ text }) {
  return (
    <div className="text-center py-10 text-sm text-zinc-500">{text}</div>
  );
}

export default function ShipmentJourneyManager() {
  const { t } = useLang();
  const [list, setList] = useState([]);
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const [journey, setJourney] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const loadShipments = useCallback(async () => {
    try {
      const { data } = await axios.get(`${API_URL}/api/shipments`);
      // the backend returns {success, data:[...]} in some routes and [...] in others
      const arr = Array.isArray(data) ? data : (data?.data || data?.shipments || []);
      setList(arr);
    } catch (e) {
      toast.error(t('adm_failed_to_load_shipment_list'));
    }
  }, []);

  const loadJourney = useCallback(async (id) => {
    if (!id) { setJourney(null); return; }
    try {
      const { data } = await axios.get(`${API_URL}/api/shipments/${id}/journey`);
      if (data?.ok && data.shipment) setJourney(data.shipment);
    } catch (e) {
      toast.error(t('adm_failed_to_load_journey'));
    }
  }, []);

  useEffect(() => { loadShipments(); }, [loadShipments]);
  useEffect(() => { if (selectedId) loadJourney(selectedId); }, [selectedId, loadJourney, refreshKey]);

  const filtered = list.filter((s) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      String(s.id || '').toLowerCase().includes(q) ||
      String(s.vin || '').toLowerCase().includes(q) ||
      String(s.vehicleTitle || '').toLowerCase().includes(q) ||
      String(s.containerNumber || '').toLowerCase().includes(q)
    );
  });

  const currentStage = (journey?.stages || []).find((s) => s.id === journey?.currentStageId) || null;

  const bump = () => setRefreshKey((k) => k + 1);

  const onAdvance = async () => {
    if (!journey) return;
    try {
      const { data } = await axios.post(`${API_URL}/api/shipments/${journey.id}/stages/advance`);
      if (data?.ok) { toast.success(t('adm_go_to_the_next_stage')); bump(); }
    } catch (e) {
      toast.error(e?.response?.data?.detail || t('adm3_e40073a22b'));
    }
  };

  const onActivate = async (stageId) => {
    if (!journey) return;
    try {
      const { data } = await axios.post(`${API_URL}/api/shipments/${journey.id}/stages/${stageId}/activate`);
      if (data?.ok) { toast.success(t('adm_stage_activated')); bump(); }
    } catch (e) {
      toast.error(e?.response?.data?.detail || t('adm3_f4866953d8'));
    }
  };

  const onForceTick = async () => {
    if (!journey) return;
    try {
      await axios.post(`${API_URL}/api/shipments/${journey.id}/tick`);
      toast.success(t('adm_tick_launched'));
      bump();
    } catch (e) {
      toast.error(t('adm_failed_to_start_tick'));
    }
  };

  const onBindVessel = async (stageId, form) => {
    if (!journey) return;
    if (!form.name && !form.mmsi && !form.imo) {
      toast.error(t('adm_specify_at_least_one_field_name_mmsi_imo'));
      return;
    }
    try {
      const { data } = await axios.put(`${API_URL}/api/shipments/${journey.id}/stages/${stageId}`, {
        vessel: {
          name: form.name || null,
          mmsi: form.mmsi || null,
          imo: form.imo || null,
        },
      });
      if (data?.ok) { toast.success(t('adm_vessel_linked')); bump(); }
    } catch (e) {
      toast.error(e?.response?.data?.detail || t('adm3_fd77287f02'));
    }
  };

  return (
    <div className="space-y-6" data-testid="shipment-journey-manager">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-zinc-900">{t('adm_delivery_route_management')}</h1>
        <p className="text-zinc-500 text-sm mt-1">{t('adm_stages_vessels_position_and_manual_switches')}</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* List */}
        <div className="lg:col-span-4">
          <div className="bg-white rounded-2xl border border-zinc-200 p-4 sticky top-4">
            <div className="flex items-center gap-2 mb-3">
              <MagnifyingGlass size={16} className="text-zinc-400" />
              <input
                data-testid="sjm-search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t('adm_search_vin_id_container')}
                className="flex-1 bg-transparent outline-none text-sm"
              />
              <button
                onClick={loadShipments}
                className="p-1 text-zinc-500 hover:text-zinc-800"
                title={t('adm_refresh_3')}
                data-testid="sjm-refresh-list"
              >
                <ArrowsClockwise size={14} />
              </button>
            </div>
            <div className="space-y-1 max-h-[75vh] overflow-y-auto">
              {filtered.length === 0 ? (
                <EmptyState text={t('adm3_250b47cecd')} />
              ) : filtered.map((s) => (
                <button
                  key={s.id}
                  data-testid={`sjm-item-${s.id}`}
                  onClick={() => setSelectedId(s.id)}
                  className={`w-full text-left p-3 rounded-lg border text-sm transition-colors ${
                    selectedId === s.id
                      ? 'border-blue-400 bg-blue-50'
                      : 'border-zinc-200 hover:border-zinc-300 bg-white'
                  }`}
                >
                  <div className="font-medium text-zinc-900 truncate">{s.vehicleTitle || s.vin || s.id}</div>
                  <div className="text-xs text-zinc-500 truncate">{s.id}</div>
                  {s.trackingSource && (
                    <div className="text-[10px] text-zinc-400 mt-1">src: {s.trackingSource}</div>
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Detail */}
        <div className="lg:col-span-8 space-y-4">
          {!selectedId && (
            <div className="bg-white rounded-2xl border border-zinc-200 p-12 text-center text-zinc-500">
              {t('adm_select_shipment_from_the_left')}
            </div>
          )}
          {selectedId && journey && (
            <>
              {/* Controls bar */}
              <div className="flex flex-wrap items-center gap-2 bg-white rounded-2xl border border-zinc-200 p-3" data-testid="sjm-controls">
                <button
                  onClick={onAdvance}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#18181B] text-white text-sm font-medium hover:bg-[#27272A] active:bg-black"
                  data-testid="sjm-advance"
                >
                  <SkipForward size={16} /> {t('adm_next_step')}
                </button>
                <button
                  onClick={onForceTick}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-zinc-900 text-white text-sm font-medium hover:bg-zinc-700"
                  data-testid="sjm-tick"
                >
                  <Lightning size={16} /> {t('adm_force_tick')}
                </button>
                <button
                  onClick={bump}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white border border-zinc-200 text-sm text-zinc-700 hover:bg-zinc-50"
                  data-testid="sjm-reload"
                >
                  <ArrowsClockwise size={16} /> {t('adm_refresh_3')}
                </button>
                {currentStage && (
                  <div className="ml-auto text-sm text-zinc-600">
                    <span className="text-zinc-400">{t('adm_current_stage')} </span>
                    <span className="font-medium">{STAGE_TYPE_LABEL[currentStage.type] || currentStage.type}</span>
                    <span className="text-zinc-400"> — </span>
                    <span>{currentStage.label}</span>
                  </div>
                )}
              </div>

              {/* Vessel binder (only if current stage is vessel) */}
              {currentStage?.type === 'vessel' && (
                <VesselBindCard
                  stage={currentStage}
                  onSubmit={(form) => onBindVessel(currentStage.id, form)}
                />
              )}

              {/* Stage quick-activate pills */}
              <div className="bg-white rounded-2xl border border-zinc-200 p-4">
                <div className="text-sm font-medium text-zinc-900 mb-2">{t('adm_go_to_stage')}</div>
                <div className="flex flex-wrap gap-2">
                  {(journey.stages || []).map((s) => {
                    const active = s.id === journey.currentStageId;
                    const Icon = s.type === 'vessel' ? Anchor : (s.type === 'land' ? Truck : Package);
                    return (
                      <button
                        key={s.id}
                        onClick={() => !active && onActivate(s.id)}
                        disabled={active}
                        data-testid={`sjm-activate-${s.id}`}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs border ${
                          active
                            ? 'bg-blue-50 border-blue-300 text-blue-700 cursor-not-allowed'
                            : 'bg-white border-zinc-200 text-zinc-700 hover:border-zinc-300'
                        }`}
                      >
                        <Icon size={14} />
                        {s.label || s.type}
                        {s.status === 'done' && <CheckCircle size={12} className="text-emerald-500" />}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Visual journey */}
              <JourneyPanel shipmentId={selectedId} initialJourney={journey} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function VesselBindCard({ stage, onSubmit }) {
  const { t } = useLang();
  const [form, setForm] = useState({
    name: stage?.vessel?.name || '',
    mmsi: stage?.vessel?.mmsi || '',
    imo: stage?.vessel?.imo || '',
  });
  useEffect(() => {
    setForm({
      name: stage?.vessel?.name || '',
      mmsi: stage?.vessel?.mmsi || '',
      imo: stage?.vessel?.imo || '',
    });
  }, [stage?.id, stage?.vessel?.name, stage?.vessel?.mmsi, stage?.vessel?.imo]);
  return (
    <div className="bg-white rounded-2xl border border-zinc-200 p-4" data-testid="sjm-vessel-bind">
      <div className="flex items-center gap-2 mb-3">
        <Anchor size={18} className="text-blue-600" />
        <h3 className="font-semibold text-zinc-900">{t('adm_bind_vessel_to_current_stage')}</h3>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
        <input
          data-testid="sjm-vessel-name"
          value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          placeholder={t('adm3_1153a09c67')}
          className="px-3 py-2 rounded-lg border border-zinc-200 text-sm"
        />
        <input
          data-testid="sjm-vessel-mmsi"
          value={form.mmsi}
          onChange={(e) => setForm((f) => ({ ...f, mmsi: e.target.value }))}
          placeholder="MMSI"
          className="px-3 py-2 rounded-lg border border-zinc-200 text-sm"
        />
        <input
          data-testid="sjm-vessel-imo"
          value={form.imo}
          onChange={(e) => setForm((f) => ({ ...f, imo: e.target.value }))}
          placeholder="IMO"
          className="px-3 py-2 rounded-lg border border-zinc-200 text-sm"
        />
      </div>
      <div className="flex justify-end mt-3">
        <button
          onClick={() => onSubmit(form)}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#18181B] text-white text-sm font-medium hover:bg-[#27272A] active:bg-black"
          data-testid="sjm-vessel-submit"
        >
          <Plus size={14} />{t('saveAction')}</button>
      </div>
    </div>
  );
}
