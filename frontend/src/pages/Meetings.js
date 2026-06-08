/**
 * Meetings — calendar / list view.
 *
 * Phase Final / Block 3 (Meetings + Calendar, .ics export only).
 *
 * Two views:
 *   - List (default): scheduled+completed+cancelled with filters
 *   - Week: 7-day grid showing scheduled meetings (lightweight)
 *
 * Each meeting has an .ics download button and a "Mark complete" form
 * (result + nextStep mandatory). No Google Calendar / OAuth.
 */
import React, { useEffect, useState, useCallback, useMemo } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import {
  CalendarCheck, Plus, RefreshCw, X, Save, Download, CheckCircle2,
  XCircle, Phone, Users, Globe, MapPin, Filter, Calendar,
} from 'lucide-react';

const API_URL = process.env.REACT_APP_BACKEND_URL || '';

const STATUS_BADGE = {
  scheduled: { bg: 'bg-amber-100',   text: 'text-amber-700',   label: 'Scheduled' },
  completed: { bg: 'bg-emerald-100', text: 'text-emerald-700', label: 'Completed' },
  cancelled: { bg: 'bg-rose-100',    text: 'text-rose-700',    label: 'Cancelled' },
  no_show:   { bg: 'bg-zinc-100',    text: 'text-zinc-700',    label: 'No-show' },
};

const TYPES = [
  { value: 'call',      label: 'Call',      icon: Phone },
  { value: 'in_person', label: 'In person', icon: Users },
  { value: 'online',    label: 'Online',    icon: Globe },
  { value: 'other',     label: 'Other',     icon: MapPin },
];

const emptyMeeting = () => ({
  id: null,
  customerId: '',
  leadId: '',
  dealId: '',
  managerId: '',
  title: '',
  startAt: '',
  durationMin: 30,
  meetingType: 'call',
  location: '',
  notes: '',
});

function toLocalInput(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const tz = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - tz).toISOString().slice(0, 16);
}
function fromLocalInput(local) {
  if (!local) return '';
  return new Date(local).toISOString();
}

export default function Meetings() {
  const [items, setItems] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('');
  const [view, setView] = useState('list');
  const [editor, setEditor] = useState(null);
  const [completeFor, setCompleteFor] = useState(null); // meeting being completed
  const [completePayload, setCompletePayload] = useState({ result: '', nextStep: '' });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (status) params.status = status;
      const [mtR, cR] = await Promise.all([
        axios.get(`${API_URL}/api/meetings`, { params }),
        axios.get(`${API_URL}/api/customers`).catch(() => ({ data: { items: [] } })),
      ]);
      setItems(mtR.data?.items || []);
      const cs = cR.data?.items || cR.data?.customers || [];
      setCustomers(Array.isArray(cs) ? cs : []);
    } catch (e) {
      toast.error('Failed to load meetings');
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => { load(); }, [load]);

  const saveMeeting = async () => {
    if (!editor.title) { toast.error('Title is required'); return; }
    if (!editor.startAt) { toast.error('Start date/time is required'); return; }
    if (!editor.customerId && !editor.leadId && !editor.dealId) {
      toast.error('Pick at least one of Customer / Lead / Deal'); return;
    }
    const payload = {
      ...editor,
      startAt: fromLocalInput(editor.startAt),
    };
    try {
      if (editor.id) {
        await axios.patch(`${API_URL}/api/meetings/${editor.id}`, payload);
        toast.success('Meeting updated');
      } else {
        await axios.post(`${API_URL}/api/meetings`, payload);
        toast.success('Meeting scheduled');
      }
      setEditor(null);
      await load();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to save');
    }
  };

  const downloadIcs = (m) => {
    const url = `${API_URL}/api/meetings/${m.id}/ics`;
    window.open(url, '_blank');
  };

  const completeMeeting = async () => {
    if (!completePayload.result.trim()) { toast.error('Result is required'); return; }
    if (!completePayload.nextStep.trim()) { toast.error('Next step is required'); return; }
    try {
      await axios.patch(`${API_URL}/api/meetings/${completeFor.id}`, {
        status: 'completed',
        result: completePayload.result,
        nextStep: completePayload.nextStep,
      });
      toast.success('Meeting completed');
      setCompleteFor(null);
      setCompletePayload({ result: '', nextStep: '' });
      await load();
    } catch (e) { toast.error('Failed to complete'); }
  };

  const cancelMeeting = async (m) => {
    if (!window.confirm(`Cancel meeting "${m.title}"?`)) return;
    try {
      await axios.delete(`${API_URL}/api/meetings/${m.id}`);
      toast.success('Meeting cancelled');
      await load();
    } catch (e) { toast.error('Failed to cancel'); }
  };

  // ── Week grid view (lightweight) ────────────────────────────────────
  const today = useMemo(() => new Date(), []);
  const weekDays = useMemo(() => {
    const start = new Date(today);
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - start.getDay() + 1); // Monday
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      return d;
    });
  }, [today]);
  const itemsByDay = useMemo(() => {
    const map = {};
    weekDays.forEach((d) => { map[d.toDateString()] = []; });
    items.forEach((m) => {
      const d = new Date(m.startAt);
      const key = d.toDateString();
      if (map[key]) map[key].push(m);
    });
    return map;
  }, [items, weekDays]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start gap-3 flex-wrap">
        <div className="w-10 h-10 rounded-xl bg-[#18181B] text-white flex items-center justify-center shrink-0">
          <CalendarCheck className="w-[18px] h-[18px]" />
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-[17px] sm:text-[19px] font-semibold tracking-tight text-[#18181B] leading-tight">
            Meetings
          </h1>
          <p className="mt-1 text-[12.5px] sm:text-[13px] text-[#71717A] leading-relaxed">
            Calendar of client meetings (calls, in-person, online). Each meeting exports to .ics.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => setEditor(emptyMeeting())}
            data-testid="new-meeting-btn"
            className="inline-flex items-center gap-2 h-9 px-3.5 rounded-xl bg-[#18181B] hover:bg-[#27272A] text-white text-[12.5px] font-semibold"
          >
            <Plus className="w-4 h-4" /> New Meeting
          </button>
          <button
            onClick={load}
            aria-label="Refresh"
            className="h-9 w-9 rounded-xl border border-[#E4E4E7] bg-white hover:bg-zinc-50 inline-flex items-center justify-center text-zinc-600"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Filter + view toggle */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-1.5 p-1 bg-zinc-100 rounded-xl">
          <button
            onClick={() => setView('list')}
            className={`h-8 px-3 rounded-lg text-[12px] font-medium transition-colors ${view === 'list' ? 'bg-white shadow-sm text-zinc-900' : 'text-zinc-600'}`}
          >List</button>
          <button
            onClick={() => setView('week')}
            className={`h-8 px-3 rounded-lg text-[12px] font-medium transition-colors ${view === 'week' ? 'bg-white shadow-sm text-zinc-900' : 'text-zinc-600'}`}
          >Week</button>
        </div>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="h-9 px-2 rounded-xl border border-[#E4E4E7] bg-white text-[12.5px]"
          data-testid="meetings-status-filter"
        >
          <option value="">All statuses</option>
          <option value="scheduled">Scheduled</option>
          <option value="completed">Completed</option>
          <option value="cancelled">Cancelled</option>
          <option value="no_show">No-show</option>
        </select>
      </div>

      {/* LIST VIEW */}
      {view === 'list' && (
        <div className="bg-white border border-zinc-200 rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-zinc-50 text-zinc-600 text-[11.5px] uppercase">
                <tr>
                  <th className="text-left px-4 py-2.5 font-semibold">When</th>
                  <th className="text-left px-4 py-2.5 font-semibold">Title</th>
                  <th className="text-left px-4 py-2.5 font-semibold">Type</th>
                  <th className="text-left px-4 py-2.5 font-semibold">Location</th>
                  <th className="text-left px-4 py-2.5 font-semibold">Status</th>
                  <th className="text-right px-4 py-2.5 font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {loading && items.length === 0 && (
                  <tr><td colSpan={6} className="text-center py-10 text-zinc-400">Loading…</td></tr>
                )}
                {!loading && items.length === 0 && (
                  <tr><td colSpan={6} className="text-center py-10 text-zinc-400">No meetings scheduled.</td></tr>
                )}
                {items.map((m) => {
                  const badge = STATUS_BADGE[m.status] || STATUS_BADGE.scheduled;
                  const tdef = TYPES.find((t) => t.value === m.meetingType) || TYPES[0];
                  const TypeIcon = tdef.icon;
                  return (
                    <tr key={m.id} className="hover:bg-zinc-50" data-testid={`meeting-row-${m.id}`}>
                      <td className="px-4 py-3 text-zinc-900">
                        <div className="font-medium">{new Date(m.startAt).toLocaleString()}</div>
                        <div className="text-[11px] text-zinc-500">{m.durationMin || 30} min</div>
                      </td>
                      <td className="px-4 py-3 text-zinc-900 font-medium">{m.title}</td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-1.5 text-[12px] text-zinc-700">
                          <TypeIcon className="w-3.5 h-3.5" />
                          {tdef.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-[12px] text-zinc-600">{m.location || '—'}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold ${badge.bg} ${badge.text}`}>
                          {badge.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="inline-flex items-center gap-1">
                          <button
                            onClick={() => downloadIcs(m)}
                            title=".ics export"
                            className="h-8 w-8 rounded-lg border border-[#E4E4E7] bg-white hover:bg-zinc-50 text-zinc-600 inline-flex items-center justify-center"
                            data-testid={`meeting-ics-${m.id}`}
                          >
                            <Download className="w-3.5 h-3.5" />
                          </button>
                          {m.status === 'scheduled' && (
                            <button
                              onClick={() => setCompleteFor(m)}
                              title="Mark complete"
                              className="h-8 w-8 rounded-lg border border-emerald-100 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 inline-flex items-center justify-center"
                              data-testid={`meeting-complete-${m.id}`}
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                          {m.status !== 'cancelled' && (
                            <button
                              onClick={() => cancelMeeting(m)}
                              title="Cancel"
                              className="h-8 w-8 rounded-lg border border-rose-100 bg-rose-50 hover:bg-rose-100 text-rose-700 inline-flex items-center justify-center"
                              data-testid={`meeting-cancel-${m.id}`}
                            >
                              <XCircle className="w-3.5 h-3.5" />
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
      )}

      {/* WEEK VIEW */}
      {view === 'week' && (
        <div className="grid grid-cols-1 sm:grid-cols-7 gap-2">
          {weekDays.map((d) => {
            const key = d.toDateString();
            const dayItems = itemsByDay[key] || [];
            const isToday = d.toDateString() === today.toDateString();
            return (
              <div key={key} className={`bg-white border rounded-xl p-2 min-h-[120px] ${isToday ? 'border-indigo-300 ring-2 ring-indigo-100' : 'border-zinc-200'}`}>
                <div className="text-[11px] uppercase text-zinc-500 font-semibold mb-1">{d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric' })}</div>
                <div className="space-y-1.5">
                  {dayItems.length === 0 && (
                    <div className="text-[11px] text-zinc-300">—</div>
                  )}
                  {dayItems.map((m) => {
                    const badge = STATUS_BADGE[m.status] || STATUS_BADGE.scheduled;
                    return (
                      <div key={m.id} className={`px-2 py-1 rounded-md text-[11px] ${badge.bg} ${badge.text} truncate`} title={`${m.title} — ${new Date(m.startAt).toLocaleTimeString()}`}>
                        {new Date(m.startAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} — {m.title}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Editor Modal */}
      {editor && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" data-testid="meeting-editor-modal">
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[92vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-zinc-200 px-6 py-4 flex items-center justify-between z-10">
              <h2 className="text-lg font-semibold text-zinc-900">
                {editor.id ? 'Edit Meeting' : 'New Meeting'}
              </h2>
              <button onClick={() => setEditor(null)} className="h-8 w-8 rounded-lg hover:bg-zinc-100 inline-flex items-center justify-center"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-2">Title*</label>
                <input
                  value={editor.title}
                  onChange={(e) => setEditor({ ...editor, title: e.target.value })}
                  placeholder="Discovery call with John Smith"
                  className="w-full h-10 px-3 rounded-xl border border-zinc-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-black/10"
                  data-testid="meeting-editor-title"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium text-zinc-700 mb-2">Start*</label>
                  <input
                    type="datetime-local"
                    value={toLocalInput(editor.startAt)}
                    onChange={(e) => setEditor({ ...editor, startAt: e.target.value })}
                    className="w-full h-10 px-3 rounded-xl border border-zinc-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-black/10"
                    data-testid="meeting-editor-start"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-2">Duration (min)</label>
                  <input
                    type="number"
                    min="5" step="5"
                    value={editor.durationMin}
                    onChange={(e) => setEditor({ ...editor, durationMin: parseInt(e.target.value || 30, 10) })}
                    className="w-full h-10 px-3 rounded-xl border border-zinc-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-black/10"
                    data-testid="meeting-editor-duration"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-2">Type</label>
                <div className="flex gap-2 flex-wrap">
                  {TYPES.map((t) => {
                    const Icon = t.icon;
                    return (
                      <button
                        key={t.value}
                        onClick={() => setEditor({ ...editor, meetingType: t.value })}
                        className={`inline-flex items-center gap-1.5 h-9 px-3 rounded-xl border text-[12.5px] font-medium transition-colors ${
                          editor.meetingType === t.value
                            ? 'bg-[#18181B] text-white border-[#18181B]'
                            : 'bg-white text-zinc-700 border-[#E4E4E7] hover:bg-zinc-50'
                        }`}
                        data-testid={`meeting-type-${t.value}`}
                      >
                        <Icon className="w-3.5 h-3.5" /> {t.label}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-2">Customer</label>
                <select
                  value={editor.customerId}
                  onChange={(e) => setEditor({ ...editor, customerId: e.target.value })}
                  className="w-full h-10 px-3 rounded-xl border border-zinc-300 bg-white text-sm"
                  data-testid="meeting-editor-customer"
                >
                  <option value="">— None —</option>
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.firstName || ''} {c.lastName || ''} {c.email ? `(${c.email})` : ''}
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-zinc-500 mt-1">Pick at least one of Customer / Lead / Deal.</p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-2">Lead ID</label>
                  <input
                    value={editor.leadId}
                    onChange={(e) => setEditor({ ...editor, leadId: e.target.value })}
                    placeholder="lead_..."
                    className="w-full h-10 px-3 rounded-xl border border-zinc-300 bg-white text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-2">Deal ID</label>
                  <input
                    value={editor.dealId}
                    onChange={(e) => setEditor({ ...editor, dealId: e.target.value })}
                    placeholder="deal_..."
                    className="w-full h-10 px-3 rounded-xl border border-zinc-300 bg-white text-sm"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-2">Location / Link</label>
                <input
                  value={editor.location || ''}
                  onChange={(e) => setEditor({ ...editor, location: e.target.value })}
                  placeholder="Zoom URL / phone / address"
                  className="w-full h-10 px-3 rounded-xl border border-zinc-300 bg-white text-sm"
                  data-testid="meeting-editor-location"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-2">Notes</label>
                <textarea
                  value={editor.notes || ''}
                  onChange={(e) => setEditor({ ...editor, notes: e.target.value })}
                  rows={3}
                  className="w-full px-3 py-2 rounded-xl border border-zinc-300 bg-white text-sm"
                  data-testid="meeting-editor-notes"
                />
              </div>
            </div>
            <div className="sticky bottom-0 bg-white border-t border-zinc-200 px-6 py-4 flex items-center justify-end gap-2">
              <button onClick={() => setEditor(null)} className="h-10 px-4 rounded-xl border border-zinc-300 bg-white hover:bg-zinc-50 text-sm font-medium">Cancel</button>
              <button
                onClick={saveMeeting}
                className="h-10 px-5 rounded-xl bg-[#18181B] hover:bg-[#27272A] text-sm font-semibold text-white inline-flex items-center gap-2"
                data-testid="meeting-editor-save"
              >
                <Save className="w-4 h-4" /> {editor.id ? 'Save changes' : 'Schedule meeting'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Complete Modal */}
      {completeFor && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" data-testid="meeting-complete-modal">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full">
            <div className="px-6 py-4 border-b border-zinc-200">
              <h3 className="text-base font-semibold text-zinc-900">Complete meeting</h3>
              <p className="text-[12px] text-zinc-500 mt-0.5">{completeFor.title}</p>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-2">Result*</label>
                <textarea
                  value={completePayload.result}
                  onChange={(e) => setCompletePayload({ ...completePayload, result: e.target.value })}
                  rows={3}
                  placeholder="What was discussed / agreed?"
                  className="w-full px-3 py-2 rounded-xl border border-zinc-300 bg-white text-sm"
                  data-testid="meeting-complete-result"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-2">Next step*</label>
                <textarea
                  value={completePayload.nextStep}
                  onChange={(e) => setCompletePayload({ ...completePayload, nextStep: e.target.value })}
                  rows={2}
                  placeholder="What's the next action / when?"
                  className="w-full px-3 py-2 rounded-xl border border-zinc-300 bg-white text-sm"
                  data-testid="meeting-complete-nextstep"
                />
              </div>
            </div>
            <div className="px-6 py-4 border-t border-zinc-200 flex items-center justify-end gap-2">
              <button onClick={() => setCompleteFor(null)} className="h-10 px-4 rounded-xl border border-zinc-300 bg-white text-sm font-medium">Cancel</button>
              <button
                onClick={completeMeeting}
                className="h-10 px-5 rounded-xl bg-[#18181B] hover:bg-[#27272A] text-sm font-semibold text-white inline-flex items-center gap-2"
                data-testid="meeting-complete-submit"
              >
                <CheckCircle2 className="w-4 h-4" /> Complete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
