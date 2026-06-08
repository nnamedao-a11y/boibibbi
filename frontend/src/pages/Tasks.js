import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import { API_URL } from '../App';
import { useLang, getLocale } from '../i18n';
import { toast } from 'sonner';
import WhiteDatePicker from '../components/ui/WhiteDatePicker';
import { Plus, Clock, Warning, ListChecks, User, ShieldCheck } from '@phosphor-icons/react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { motion } from 'framer-motion';
import RefreshButton from '../components/ui/RefreshButton';
import RoleZoneBadge from '../components/ui/RoleZoneBadge';

const TASK_STATUSES = ['pending', 'in_progress', 'completed', 'cancelled'];
const TASK_PRIORITIES = ['low', 'medium', 'high', 'urgent'];

// Build an axios config that always carries the JWT — without it the new
// RBAC layer rejects every call.
function authHeaders() {
  const token = (typeof window !== 'undefined' && window.localStorage)
    ? window.localStorage.getItem('token')
    : null;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// Read the current user from localStorage (same key the auth context uses).
function readMe() {
  if (typeof window === 'undefined' || !window.localStorage) return null;
  try { return JSON.parse(window.localStorage.getItem('user') || 'null'); } catch { return null; }
}

const ROLE_BADGE = {
  admin:       { label: 'Admin',       bg: '#FEF3C7', fg: '#92400E' },
  master_admin:{ label: 'Master',      bg: '#FEF3C7', fg: '#92400E' },
  owner:       { label: 'Owner',       bg: '#FEF3C7', fg: '#92400E' },
  team_lead:   { label: 'Team Lead',   bg: '#E0E7FF', fg: '#4338CA' },
  manager:     { label: 'Manager',     bg: '#DCFCE7', fg: '#166534' },
};

// Lightweight i18n fallback: project's t() returns the key itself when the
// translation is missing, which breaks the `||` fallback pattern. Use this
// helper so unknown keys read as the supplied default text.
function tt(t, key, fallback) {
  const v = t(key);
  return (!v || v === key) ? fallback : v;
}

const Tasks = () => {
  const { t } = useLang();
  const me = useMemo(() => readMe(), []);
  const myRole = (me?.role || '').toLowerCase();
  const canCreateTasks = ['admin', 'master_admin', 'owner', 'team_lead'].includes(myRole);

  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [assigneeOptions, setAssigneeOptions] = useState([]);
  const [formData, setFormData] = useState({
    title: '', description: '', priority: 'medium', dueDate: '', assigneeId: '',
  });

  useEffect(() => { fetchTasks(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [statusFilter]);

  const fetchTasks = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.append('status', statusFilter);
      const res = await axios.get(`${API_URL}/api/tasks?${params}`, { headers: authHeaders() });
      setTasks(res.data.data || res.data.items || []);
    } catch (err) {
      const status = err?.response?.status;
      if (status === 401) toast.error(t('sessionExpired') || 'Session expired — please log in again.');
      else toast.error(err?.response?.data?.detail || t('error'));
    } finally { setLoading(false); }
  };

  // Lazy-load eligible assignees only when the user opens the create modal
  // (avoids leaking the staff list on the public route + skips for managers).
  const loadAssignees = async () => {
    if (!canCreateTasks) return;
    try {
      const res = await axios.get(`${API_URL}/api/tasks/eligible-assignees`, { headers: authHeaders() });
      const items = res.data?.items || [];
      setAssigneeOptions(items);
      // Auto-select the first eligible assignee if nothing is picked yet.
      if (items.length && !formData.assigneeId) {
        setFormData(prev => ({ ...prev, assigneeId: items[0].id }));
      }
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Failed to load assignees');
    }
  };

  const openCreateModal = async () => {
    if (!canCreateTasks) {
      toast.error('Your role cannot create tasks. Only admin and team_lead can.');
      return;
    }
    setShowModal(true);
    await loadAssignees();
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (submitting) return;
    if (!formData.title.trim()) { toast.error(t('taskTitle') + ' — required'); return; }
    if (!formData.assigneeId)   { toast.error('Please pick an assignee'); return; }
    setSubmitting(true);
    try {
      await axios.post(`${API_URL}/api/tasks`, formData, { headers: authHeaders() });
      toast.success(t('taskCreated') || 'Task created');
      setShowModal(false);
      setFormData({ title: '', description: '', priority: 'medium', dueDate: '', assigneeId: '' });
      fetchTasks();
    } catch (err) {
      toast.error(err?.response?.data?.detail || t('error') || 'Failed to create task');
    } finally { setSubmitting(false); }
  };

  const handleStatusChange = async (id, status) => {
    try {
      await axios.patch(`${API_URL}/api/tasks/${id}`, { status }, { headers: authHeaders() });
      toast.success(t('statusUpdated') || 'Status updated');
      fetchTasks();
    } catch (err) {
      toast.error(err?.response?.data?.detail || t('error'));
    }
  };

  const statusLabels = {
    pending: t('taskTodo') || 'Pending',
    todo: t('taskTodo') || 'Pending',
    in_progress: t('taskInProgress') || 'In progress',
    completed: t('taskCompleted') || 'Completed',
    cancelled: t('taskCancelled') || 'Cancelled',
  };
  const priorityLabels = {
    low: t('priorityLow') || 'Low',
    medium: t('priorityMedium') || 'Medium',
    high: t('priorityHigh') || 'High',
    urgent: t('priorityUrgent') || 'Urgent',
  };
  const priorityColors = {
    low:    { bg: '#F4F4F5', text: '#71717A' },
    medium: { bg: '#DBEAFE', text: '#2563EB' },
    high:   { bg: '#FEF3C7', text: '#D97706' },
    urgent: { bg: '#FEE2E2', text: '#DC2626' },
  };
  const isOverdue = (dueDate) => dueDate && new Date(dueDate) < new Date();

  return (
    <motion.div data-testid="tasks-page" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
      {/* ─── Page header ─────────────────────────────────────────────── */}
      <div className="flex flex-row items-start justify-between gap-3 sm:gap-4 mb-6 lg:mb-8">
        <div className="flex items-start gap-3 flex-1 min-w-0">
          <div className="w-10 h-10 rounded-2xl bg-[#18181B] text-white flex items-center justify-center shrink-0">
            <ListChecks size={20} weight="bold" />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[#18181B] leading-tight break-words" style={{ fontFamily: 'Mazzard, Mazzard H, Mazzard M, system-ui, sans-serif' }}>
              {t('tasksTitle') || 'Tasks'}
            </h1>
            <p className="text-xs sm:text-sm text-[#71717A] mt-1 break-words">
              {t('taskManagement') || 'Task management'}
              {myRole && (
                <span className="ml-2 inline-flex items-center gap-1 align-middle">
                  <ShieldCheck size={12} weight="bold" />
                  <span className="text-[10px] uppercase tracking-wider text-[#A1A1AA]">{myRole}</span>
                </span>
              )}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <RefreshButton onClick={fetchTasks} loading={loading} ariaLabel={t('adm_refresh_3') || 'Refresh'} testId="tasks-refresh-btn" />
          {canCreateTasks && (
            <button onClick={openCreateModal} className="btn-primary shrink-0 whitespace-nowrap" data-testid="create-task-btn">
              <Plus size={18} weight="bold" />
              <span className="hidden sm:inline ml-1">{t('newTask') || 'New task'}</span>
            </button>
          )}
        </div>
      </div>

      {/* Shared Tasks zone marker — same `tasks` collection across roles */}
      <div className="mb-5">
        <RoleZoneBadge
          variant="tasks"
          link={{ href: '/team/tasks', label: 'Open team-lead view' }}
        />
      </div>

      {/* ─── Filter card ─────────────────────────────────────────────── */}
      <div className="card p-4 sm:p-5 mb-5">
        <Select value={statusFilter || 'all'} onValueChange={(v) => setStatusFilter(v === 'all' ? '' : v)}>
          <SelectTrigger className="w-full sm:w-[220px] input" data-testid="tasks-status-filter">
            <SelectValue placeholder={t('allStatuses') || 'All statuses'} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('allStatuses') || 'All statuses'}</SelectItem>
            {TASK_STATUSES.map(s => (<SelectItem key={s} value={s}>{statusLabels[s]}</SelectItem>))}
          </SelectContent>
        </Select>
      </div>

      {/* ─── List ────────────────────────────────────────────────────── */}
      <div className="space-y-3 sm:space-y-4">
        {loading ? (
          <div className="text-center py-12 text-[#71717A]">{t('loading') || 'Loading…'}</div>
        ) : tasks.length === 0 ? (
          <div className="text-center py-12 text-[#71717A]">{t('noTasks') || 'No tasks yet'}</div>
        ) : tasks.map(task => {
          const overdue = isOverdue(task.dueDate) && task.status !== 'completed';
          const pri = priorityColors[task.priority] || priorityColors.medium;
          const assigneeBadge = ROLE_BADGE[(task.assigneeRole || '').toLowerCase()] || null;
          return (
            <div
              key={task.id}
              className={`card p-4 sm:p-5 ${overdue ? 'border-l-4 border-l-[#DC2626]' : ''}`}
              data-testid={`task-card-${task.id}`}
            >
              {/* On mobile we stack everything; on sm+ we put status on the right */}
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 sm:gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-2">
                    <h3 className="font-semibold text-[#18181B] break-words">{task.title}</h3>
                    <span className="badge" style={{ backgroundColor: pri.bg, color: pri.text }}>
                      {priorityLabels[task.priority]}
                    </span>
                    {assigneeBadge && (
                      <span className="badge" style={{ backgroundColor: assigneeBadge.bg, color: assigneeBadge.fg }}>
                        <User size={11} weight="bold" />
                        <span className="ml-1">{task.assigneeName || assigneeBadge.label}</span>
                      </span>
                    )}
                  </div>
                  {task.description && (
                    <p className="text-sm text-[#71717A] mb-3 break-words">{task.description}</p>
                  )}
                  {task.dueDate && (
                    <div className={`flex items-center gap-2 text-sm ${overdue ? 'text-[#DC2626]' : 'text-[#71717A]'}`}>
                      {overdue ? <Warning size={16} /> : <Clock size={16} />}
                      <span>{new Date(task.dueDate).toLocaleDateString(getLocale())}</span>
                    </div>
                  )}
                  {task.createdByName && (
                    <div className="text-xs text-[#A1A1AA] mt-2 break-words">
                      {t('createdBy') || 'Created by'}: {task.createdByName}
                    </div>
                  )}
                </div>
                <div className="sm:w-[180px] shrink-0">
                  <Select value={task.status} onValueChange={(v) => handleStatusChange(task.id, v)}>
                    <SelectTrigger className="w-full input" data-testid={`task-status-${task.id}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TASK_STATUSES.map(s => (<SelectItem key={s} value={s}>{statusLabels[s]}</SelectItem>))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* ─── Create-task modal ───────────────────────────────────────── */}
      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent
          className="w-[calc(100%-24px)] sm:max-w-md bg-white rounded-2xl border border-[#E4E4E7] p-4 sm:p-6"
          data-testid="task-modal"
        >
          <DialogHeader>
            <DialogTitle
              className="text-lg sm:text-xl font-bold text-[#18181B]"
              style={{ fontFamily: 'Mazzard, Mazzard H, Mazzard M, system-ui, sans-serif' }}
            >
              {t('newTask') || 'New task'}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-5 mt-3 sm:mt-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-[#71717A] mb-2">
                {t('taskTitle') || 'Title'} *
              </label>
              <input
                type="text"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                required
                className="input w-full"
                data-testid="task-title-input"
              />
            </div>

            {/* Assignee — the heart of the role hierarchy. */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-[#71717A] mb-2">
                {t('assignee') || 'Assignee'} *
              </label>
              <Select
                value={formData.assigneeId || ''}
                onValueChange={(v) => setFormData({ ...formData, assigneeId: v })}
              >
                <SelectTrigger className="input w-full" data-testid="task-assignee-select">
                  <SelectValue placeholder={tt(t, 'pickAssignee', 'Pick an assignee')} />
                </SelectTrigger>
                <SelectContent>
                  {assigneeOptions.length === 0 && (
                    <SelectItem value="__none__" disabled>
                      {t('noEligibleAssignees') || 'No eligible assignees'}
                    </SelectItem>
                  )}
                  {assigneeOptions.map(opt => (
                    <SelectItem key={opt.id} value={opt.id}>
                      {opt.displayName || opt.name || opt.email} · {ROLE_BADGE[opt.role]?.label || opt.role}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-[#A1A1AA] mt-1">
                {myRole === 'team_lead'
                  ? tt(t, 'teamLeadAssigneeHint', 'Team leads can assign tasks to managers only.')
                  : tt(t, 'adminAssigneeHint',    'Admins can assign tasks to team leads and managers.')}
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-[#71717A] mb-2">
                  {t('priority') || 'Priority'}
                </label>
                <Select
                  value={formData.priority}
                  onValueChange={(v) => setFormData({ ...formData, priority: v })}
                >
                  <SelectTrigger className="input w-full" data-testid="task-priority-select">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TASK_PRIORITIES.map(p => (<SelectItem key={p} value={p}>{priorityLabels[p]}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-[#71717A] mb-2">
                  {t('deadline') || 'Deadline'}
                </label>
                <WhiteDatePicker
                  value={formData.dueDate}
                  onChange={(e) => setFormData({ ...formData, dueDate: e.target.value })}
                  data-testid="task-duedate-input"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-[#71717A] mb-2">
                {t('description') || 'Description'}
              </label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                rows={3}
                className="input w-full resize-none"
                data-testid="task-description-input"
              />
            </div>

            {/* Action row stacks on mobile, side-by-side on sm+ */}
            <div className="flex flex-col-reverse sm:flex-row gap-2 sm:gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="btn-secondary w-full sm:flex-1"
                disabled={submitting}
              >
                {t('cancel') || 'Cancel'}
              </button>
              <button
                type="submit"
                className="btn-primary w-full sm:flex-1"
                data-testid="task-submit-btn"
                disabled={submitting}
              >
                {submitting ? (t('saving') || 'Saving…') : (t('create') || 'Create')}
              </button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </motion.div>
  );
};

export default Tasks;
