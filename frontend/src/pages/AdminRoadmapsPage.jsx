/**
 * AdminRoadmapsPage — Sprint 3.5
 * --------------------------------
 * Master Admin / Team Lead view of all roadmaps in the company / team.
 * Surfaces:
 *   • KPI strip (total / completed / in progress / blocked / SLA breaches)
 *   • Distribution by stage (bar chart, simplified)
 *   • List of roadmaps with click-through to the underlying Customer360
 */
import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Link, useNavigate } from 'react-router-dom';
import {
  Compass,
  CheckCircle,
  WarningCircle,
  CircleNotch,
  Hourglass,
  ArrowSquareOut,
} from '@phosphor-icons/react';
import { useLang } from '../i18n';
import { useAuth } from '../App';
import RoadmapStepper from '../components/roadmap/RoadmapStepper';

const API_URL = process.env.REACT_APP_BACKEND_URL || '';

const authHeaders = () => {
  const tok = localStorage.getItem('token') || localStorage.getItem('access_token');
  return tok ? { Authorization: `Bearer ${tok}` } : {};
};

const Kpi = ({ icon: Icon, label, value, color = '#4F46E5', accent }) => (
  <div className="bg-white border border-zinc-200 rounded-2xl p-4">
    <div className="flex items-center gap-2 mb-2">
      <Icon size={18} weight="duotone" style={{ color }} />
      <span className="text-[11px] uppercase tracking-wider font-bold text-zinc-500">{label}</span>
    </div>
    <div className="text-2xl font-bold tabular-nums" style={{ color: accent || '#18181B' }}>{value}</div>
  </div>
);

const AdminRoadmapsPage = () => {
  const { lang } = useLang();
  const { user } = useAuth();
  const role = (user?.role || '').toLowerCase();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [stageTemplate, setStageTemplate] = useState([]);

  const endpoint = ['master_admin', 'owner', 'admin'].includes(role)
    ? '/api/admin/roadmaps'
    : '/api/team/roadmaps';

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await axios.get(`${API_URL}${endpoint}`, { headers: authHeaders() });
        if (!cancelled) {
          setData(res.data);
          setStageTemplate(res.data?.stage_template || []);
        }
      } catch {
        if (!cancelled) setData({ items: [], total: 0 });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [endpoint]);

  if (loading) {
    return <div className="flex items-center justify-center h-64"><div className="animate-spin w-8 h-8 border-2 border-[#4F46E5] border-t-transparent rounded-full" /></div>;
  }

  const items = data?.items || [];
  const total = data?.total || 0;
  const byStage = data?.by_stage || {};
  const stageMax = Math.max(1, ...Object.values(byStage));

  const tplByKey = Object.fromEntries(stageTemplate.map((s) => [s.key, s]));
  const stageLabel = (k) => {
    const tpl = tplByKey[k] || {};
    return tpl[`label_${lang}`] || tpl.label_en || k;
  };

  return (
    <div className="space-y-6" data-testid="admin-roadmaps-page">
      <header>
        <h1 className="text-2xl font-bold tracking-tight text-zinc-900">
          {lang === 'ru' ? 'Дорожные карты' : lang === 'bg' ? 'Пътни карти' : lang === 'uk' ? 'Дорожні карти' : 'Roadmaps'}
        </h1>
        <p className="text-sm text-zinc-500 mt-1">
          {lang === 'ru' ? 'Прогресс всех клиентских автомобилей от аукциона до передачи' : 'Vehicle progress from auction to handover, across the company.'}
        </p>
      </header>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <Kpi icon={Compass} label="Total" value={total} color="#4F46E5" />
        <Kpi icon={Hourglass} label="Pending" value={data?.pending || 0} color="#71717A" />
        <Kpi icon={CircleNotch} label="In progress" value={data?.in_progress || 0} color="#D97706" />
        <Kpi icon={WarningCircle} label="Blocked" value={data?.blocked || 0} color="#DC2626" accent="#DC2626" />
        <Kpi icon={CheckCircle} label="Completed" value={data?.completed || 0} color="#059669" accent="#059669" />
        <Kpi icon={WarningCircle} label="SLA breaches" value={data?.sla_breaches || 0} color="#DC2626" accent={(data?.sla_breaches || 0) > 0 ? '#DC2626' : '#18181B'} />
      </div>

      <div className="section-card">
        <h3 className="text-sm font-semibold text-zinc-700 mb-4">
          {lang === 'ru' ? 'Распределение по этапам' : 'Distribution by stage'}
        </h3>
        <div className="space-y-2">
          {stageTemplate.map((s) => {
            const count = byStage[s.key] || 0;
            const pct = Math.round((count / stageMax) * 100);
            return (
              <div key={s.key} className="flex items-center gap-3" data-testid={`stage-bar-${s.key}`}>
                <div className="w-44 text-sm text-zinc-700 truncate">{stageLabel(s.key)}</div>
                <div className="flex-1 h-2 bg-zinc-100 rounded-full overflow-hidden">
                  <div className="h-full bg-indigo-500" style={{ width: `${pct}%` }} />
                </div>
                <div className="w-10 text-right text-sm tabular-nums font-medium text-zinc-700">{count}</div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="section-card">
        <h3 className="text-sm font-semibold text-zinc-700 mb-4">{lang === 'ru' ? 'Список' : 'List'}</h3>
        {items.length === 0 ? (
          <p className="text-zinc-500 text-center py-8">No roadmaps yet.</p>
        ) : (
          <div className="space-y-4">
            {items.map((rm) => (
              <div key={rm.id} className="p-4 rounded-xl border border-zinc-200 hover:border-zinc-300 transition-colors" data-testid={`admin-roadmap-row-${rm.id}`}>
                <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                  <div className="min-w-0">
                    <p className="font-medium text-zinc-900">{rm.title || 'Vehicle roadmap'}</p>
                    <p className="text-xs text-zinc-500">
                      {rm.vehicle?.vin && <span className="font-mono mr-2">VIN {rm.vehicle.vin}</span>}
                      Customer: <Link to={`/admin/customers/${rm.customerId || rm.customer_id}/360?tab=roadmap`} className="text-indigo-600 hover:underline">{rm.customerId || rm.customer_id}</Link>
                      {rm.managerEmail && <span> · Manager: {rm.managerEmail}</span>}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm tabular-nums font-medium text-emerald-600">{rm.progress_pct || 0}%</span>
                    <button
                      onClick={() => navigate(`/admin/customers/${rm.customerId || rm.customer_id}/360?tab=roadmap`)}
                      className="inline-flex items-center gap-1 px-2 py-1 border border-zinc-200 rounded-lg text-xs hover:bg-zinc-50"
                    >
                      Open <ArrowSquareOut size={12} />
                    </button>
                  </div>
                </div>
                <RoadmapStepper roadmap={rm} stageTemplate={stageTemplate} lang={lang} compact />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminRoadmapsPage;
