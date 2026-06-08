/**
 * CabinetRoadmap — Sprint 3.5
 * ----------------------------
 * Customer-facing READ-ONLY view of the vehicle journey roadmap.
 * Routed under /cabinet/:customerId/roadmap.
 */
import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useParams } from 'react-router-dom';
import { Car, CheckCircle } from '@phosphor-icons/react';
import RoadmapStepper from '../roadmap/RoadmapStepper';
import { useLang } from '../../i18n';

const API_URL = process.env.REACT_APP_BACKEND_URL || '';

const CabinetRoadmap = () => {
  const { customerId } = useParams();
  const { lang } = useLang();
  const [items, setItems] = useState([]);
  const [stageTemplate, setStageTemplate] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await axios.get(`${API_URL}/api/customer-cabinet/${customerId}/roadmaps`);
        if (!cancelled) {
          setItems(res.data?.items || []);
          setStageTemplate(res.data?.stage_template || []);
        }
      } catch {
        if (!cancelled) setItems([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [customerId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-40" data-testid="cabinet-roadmap-loading">
        <div className="animate-spin w-8 h-8 border-2 border-[#4F46E5] border-t-transparent rounded-full" />
      </div>
    );
  }

  const title = lang === 'bg' ? 'Път на моя автомобил' : 'My Vehicle Journey';
  const subtitle = lang === 'bg'
    ? 'Следвайте прогреса на вашата поръчка на живо — от търга до предаването на ключовете.'
    : 'Track your order progress live — from auction to handing over the keys.';

  return (
    <div className="space-y-6" data-testid="cabinet-roadmap-page">
      <header>
        <h1 className="text-2xl font-bold tracking-tight text-[#18181B]">{title}</h1>
        <p className="text-sm text-[#71717A] mt-1">{subtitle}</p>
      </header>

      {items.length === 0 && (
        <div className="section-card text-center py-16" data-testid="cabinet-roadmap-empty">
          <Car size={40} className="mx-auto text-[#A1A1AA] mb-3" />
          <p className="text-[#71717A]">
            {lang === 'bg'
              ? 'Още нямате активна пътна карта. Нова ще се създаде, след като платите първата си фактура.'
              : 'You don\'t have an active roadmap yet. A new one is created once you pay your first invoice.'}
          </p>
        </div>
      )}

      {items.map((rm) => (
        <div key={rm.id} className="section-card" data-testid={`cabinet-roadmap-card-${rm.id}`}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-lg font-semibold text-zinc-900">{rm.title || (lang === 'bg' ? 'Моят автомобил' : 'My vehicle')}</h2>
              {rm.vehicle?.vin && <p className="text-xs font-mono text-zinc-500">VIN: {rm.vehicle.vin}</p>}
            </div>
            <div className="text-right">
              <div className="text-3xl font-bold tabular-nums text-emerald-600">{rm.progress_pct || 0}%</div>
              <p className="text-[11px] uppercase tracking-wider text-zinc-500">
                {lang === 'bg' ? 'завършено' : 'completed'}
              </p>
            </div>
          </div>
          <div className="mt-6">
            <RoadmapStepper roadmap={rm} stageTemplate={stageTemplate} lang={lang} />
          </div>
          {rm.status === 'completed' && (
            <div className="mt-5 p-4 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center gap-3">
              <CheckCircle size={22} weight="fill" className="text-emerald-600" />
              <p className="text-sm text-emerald-800 font-medium">
                {lang === 'bg' ? 'Честито — вашият автомобил вече е във ваши ръце. Приятно каране!' : 'Congratulations — your vehicle has been handed over. Enjoy the road!'}
              </p>
            </div>
          )}
        </div>
      ))}
    </div>
  );
};

export default CabinetRoadmap;
