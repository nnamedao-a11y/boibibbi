/**
 * Customer360 — TasksTab (Sprint 4)
 * -----------------------------------
 * Customer-scoped to-do list. Reuses the global ``db.tasks`` collection
 * via the customer wrapper API; SLA Engine + notifications keep working.
 *
 * Filters: All / Open / Overdue / Done.
 * Quick-toggle status with a click. Inline edit of title + due date.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import {
  CheckSquare,
  Square,
  Calendar,
  Plus,
  Trash,
  WarningCircle,
  Clock,
  Flag,
} from '@phosphor-icons/react';
import { useAuth } from '../../App';

const API_URL = process.env.REACT_APP_BACKEND_URL || '';

const authHeaders = () => {
  const tok = localStorage.getItem('token') || localStorage.getItem('access_token');
  return tok ? { Authorization: `Bearer ${tok}` } : {};
};

const priorityClass = {
  low:      'text-zinc-500',
  medium:   'text-amber-500',
  high:     'text-orange-500',
  critical: 'text-red-500',
};

const FILTERS = [
  { key: 'all',     label: 'Все' },
  { key: 'open',    label: 'Открытые' },
  { key: 'overdue', label: 'Просроченные' },
  { key: 'done',    label: 'Готово' },
];

const fmtDate = (iso) => {
  if (!iso) return '';
  try { return new Date(iso).toLocaleDateString(); } catch { return ''; }
};

const TasksTab = ({ customerId }) => {
  const { user } = useAuth();
  const [items, setItems] = useState([]);
  const [summary, setSummary] = useState({ open: 0, completed: 0, overdue: 0 });
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [showNew, setShowNew] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API_URL}/api/customers/${customerId}/tasks`, { headers: authHeaders() });
      setItems(res.data?.items || []);
      setSummary(res.data?.summary || { open: 0, completed: 0, overdue: 0 });
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to load tasks');
    } finally {
      setLoading(false);
    }
  }, [customerId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await axios.get(`${API_URL}/api/customers/${customerId}/tasks`, { headers: authHeaders() });
        if (!cancelled) {
          setItems(res.data?.items || []);
          setSummary(res.data?.summary || { open: 0, completed: 0, overdue: 0 });
        }
      } catch (e) {
        if (!cancelled) toast.error(e.response?.data?.detail || 'Failed to load tasks');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [customerId]);

  const toggle = async (task) => {
    const next = (task.status || '').toLowerCase() === 'completed' ? 'pending' : 'completed';
    try {
      await axios.patch(
        `${API_URL}/api/customers/${customerId}/tasks/${task.id || task.taskId}`,
        { status: next },
        { headers: authHeaders() },
      );
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed');
    }
  };

  const remove = async (task) => {
    if (!window.confirm('Удалить задачу?')) return;
    try {
      await axios.delete(`${API_URL}/api/customers/${customerId}/tasks/${task.id || task.taskId}`, { headers: authHeaders() });
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed');
    }
  };

  const filtered = useMemo(() => {
    return items.filter((t) => {
      const st = (t.status || '').toLowerCase();
      if (filter === 'open')    return st === 'pending' || st === 'in_progress';
      if (filter === 'overdue') return !!t.overdue;
      if (filter === 'done')    return st === 'completed';
      return true;
    });
  }, [items, filter]);

  if (loading) return <div className="flex items-center justify-center h-32" data-testid="tasks-loading"><div className="animate-spin w-7 h-7 border-2 border-[#4F46E5] border-t-transparent rounded-full" /></div>;

  return (
    <div className="space-y-4" data-testid="customer360-tasks-tab">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-4 text-sm">
          <span className="text-zinc-500">Открытых: <span className="font-bold text-zinc-900">{summary.open}</span></span>
          <span className="text-red-500">Просрочено: <span className="font-bold">{summary.overdue}</span></span>
          <span className="text-emerald-600">Готово: <span className="font-bold">{summary.completed}</span></span>
        </div>
        <button onClick={() => setShowNew(true)} className="inline-flex items-center gap-2 px-3 py-2 bg-[#18181B] text-white rounded-xl hover:bg-[#27272A] text-sm font-medium" data-testid="task-new-btn">
          <Plus size={14} weight="bold" /> Новая задача
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${filter === f.key ? 'bg-[#18181B] text-white border-[#18181B]' : 'bg-white text-zinc-600 border-zinc-200 hover:bg-zinc-50'}`}
            data-testid={`tasks-filter-${f.key}`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="section-card text-center py-12" data-testid="tasks-empty">
          <CheckSquare size={32} className="mx-auto text-[#A1A1AA] mb-2" />
          <p className="text-[#71717A]">Задач нет. Нажмите «Новая задача», чтобы создать.</p>
        </div>
      )}

      <div className="space-y-2">
        {filtered.map((t) => {
          const done = (t.status || '').toLowerCase() === 'completed';
          return (
            <div key={t.id || t.taskId} className={`section-card flex items-start gap-3 ${t.overdue && !done ? 'border-l-4 border-red-400' : ''}`} data-testid={`task-row-${t.id || t.taskId}`}>
              <button onClick={() => toggle(t)} className="shrink-0 mt-0.5" title={done ? 'Reopen' : 'Mark complete'}>
                {done ? <CheckSquare size={20} weight="fill" className="text-emerald-500" /> : <Square size={20} className="text-zinc-300 hover:text-zinc-500" />}
              </button>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`font-medium text-sm ${done ? 'line-through text-zinc-400' : 'text-zinc-900'}`}>{t.title}</span>
                  {t.priority && t.priority !== 'medium' && (
                    <span className={`inline-flex items-center gap-1 text-[10px] uppercase tracking-wider font-bold ${priorityClass[t.priority] || 'text-zinc-400'}`}>
                      <Flag size={10} weight="fill" /> {t.priority}
                    </span>
                  )}
                  {t.overdue && !done && (
                    <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-red-100 text-red-700 border border-red-200 font-bold uppercase">
                      <WarningCircle size={10} weight="fill" /> overdue
                    </span>
                  )}
                </div>
                {t.description && <p className="text-xs text-zinc-500 mt-1 line-clamp-2">{t.description}</p>}
                <div className="mt-2 flex items-center gap-3 text-[11px] text-zinc-500">
                  {t.dueDate && (
                    <span className="inline-flex items-center gap-1">
                      <Calendar size={11} /> Due: {fmtDate(t.dueDate)}
                    </span>
                  )}
                  {t.assigneeName && (
                    <span className="inline-flex items-center gap-1">
                      <Clock size={11} /> {t.assigneeName}
                    </span>
                  )}
                </div>
              </div>
              <button onClick={() => remove(t)} className="shrink-0 p-1.5 hover:bg-red-50 rounded-md" title="Delete">
                <Trash size={14} className="text-red-400" />
              </button>
            </div>
          );
        })}
      </div>

      {showNew && (
        <NewTaskModal customerId={customerId} onClose={() => setShowNew(false)} onCreated={() => { setShowNew(false); load(); }} />
      )}
    </div>
  );
};

const NewTaskModal = ({ customerId, onClose, onCreated }) => {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [priority, setPriority] = useState('medium');
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    const t = title.trim();
    if (!t) return;
    setSaving(true);
    try {
      await axios.post(
        `${API_URL}/api/customers/${customerId}/tasks`,
        {
          title: t,
          description: description.trim() || undefined,
          dueDate: dueDate || undefined,
          priority,
        },
        { headers: authHeaders() },
      );
      toast.success('Задача создана');
      onCreated?.();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" data-testid="task-new-modal">
      <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6">
        <h3 className="text-lg font-semibold text-zinc-900 mb-4">Новая задача</h3>
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1">Название</label>
            <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} className="w-full border border-zinc-200 rounded-lg px-3 py-2 text-sm" autoFocus data-testid="task-title-input" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1">Описание</label>
            <textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} className="w-full border border-zinc-200 rounded-lg px-3 py-2 text-sm" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1">Дедлайн</label>
              <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="w-full border border-zinc-200 rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1">Приоритет</label>
              <select value={priority} onChange={(e) => setPriority(e.target.value)} className="w-full border border-zinc-200 rounded-lg px-3 py-2 text-sm">
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="critical">Critical</option>
              </select>
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onClose} className="px-4 py-2 text-sm text-zinc-600 hover:bg-zinc-100 rounded-lg">Отмена</button>
          <button onClick={submit} disabled={saving || !title.trim()} className="px-4 py-2 bg-[#18181B] text-white text-sm rounded-lg hover:bg-[#27272A] disabled:opacity-50" data-testid="task-save-btn">
            {saving ? '…' : 'Создать'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default TasksTab;
