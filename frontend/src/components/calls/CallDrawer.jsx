/**
 * BIBI Cars — Wave 2A — CallDrawer
 * =================================
 *
 * Right-side drawer for a single call. Read-only.
 *   * Header: phone / direction / timestamp
 *   * Audio player streaming via /api/calls/{id}/recording proxy
 *   * Call metadata (from/to, manager, duration, outcome, status, lead/deal/customer ids, utm)
 *   * Existing AI Block (intent / objection / suggested outcome) — NO new generation.
 */
import React, { useMemo, useState } from 'react';
import {
  X,
  PhoneIncoming,
  PhoneOutgoing,
  Phone,
  Clock,
  User,
  Hash,
  Tag,
  Brain,
  WarningOctagon,
  Target,
  Sparkle,
  Compass,
} from '@phosphor-icons/react';
import { API_URL } from '../../App';
import { useLang } from '../../i18n';
import MatchChips from './MatchChips';

const fmt = (iso) => {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleString(); } catch { return iso; }
};

const fmtDur = (sec) => {
  const s = Math.max(0, Math.floor(Number(sec) || 0));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}m ${r}s`;
};

const Row = ({ icon: Icon, label, value, copyable = false }) => (
  <div className="flex items-start gap-3 py-1.5">
    {Icon && <Icon size={16} weight="duotone" className="text-[#71717A] mt-0.5 shrink-0" />}
    <div className="flex-1 min-w-0">
      <div className="text-[11px] uppercase tracking-wide text-[#71717A]">{label}</div>
      <div className="text-sm text-[#18181B] break-words">{value || <span className="text-zinc-400">—</span>}</div>
    </div>
  </div>
);

const CallDrawer = ({ call, onClose }) => {
  const { t } = useLang();
  const [audioError, setAudioError] = useState(false);
  const ai = call?.aiAnalysis || {};

  // Token is already on axios.defaults but <audio> uses native fetch →
  // pass token via query-string so the same require_user dep accepts it.
  const audioSrc = useMemo(() => {
    if (!call?.recordingAvailable || !call?.id) return null;
    const token = (() => {
      try { return localStorage.getItem('token') || ''; } catch { return ''; }
    })();
    const url = `${API_URL}/api/calls/${encodeURIComponent(call.id)}/recording`;
    return token ? `${url}?token=${encodeURIComponent(token)}` : url;
  }, [call]);

  if (!call) return null;

  const directionLabel = call.direction === 'inbound'
    ? (t('w2a_inbound') || 'Inbound')
    : call.direction === 'outbound'
      ? (t('w2a_outbound') || 'Outbound')
      : call.direction;
  const DirIcon = call.direction === 'inbound' ? PhoneIncoming : call.direction === 'outbound' ? PhoneOutgoing : Phone;

  return (
    <>
      <div
        className="fixed inset-0 bg-black/40 z-40"
        onClick={onClose}
        data-testid="call-drawer-backdrop"
      />
      <aside
        className="fixed top-0 right-0 h-full w-full sm:w-[480px] bg-white shadow-2xl z-50 flex flex-col"
        data-testid="call-drawer"
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-[#E4E4E7] flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2">
              <DirIcon size={20} weight="duotone" className="text-[#4F46E5]" />
              <h3 className="text-base font-semibold text-[#18181B]">{directionLabel}</h3>
              <span className="text-xs px-2 py-0.5 rounded-md bg-zinc-100 text-zinc-700 uppercase">{call.status || '—'}</span>
            </div>
            <p className="text-xs text-[#71717A] mt-1">{fmt(call.startedAt)} · {fmtDur(call.duration)}</p>
            {call.matchedBy?.length > 0 && (
              <div className="mt-2" data-testid="call-drawer-matched-by">
                <span className="text-[10px] uppercase tracking-wide text-[#71717A] mr-2">
                  {t('w2a_col_match') || 'Matched by'}:
                </span>
                <span className="inline-block align-middle">
                  <MatchChips matchedBy={call.matchedBy} reasons={call.matchedReasons} />
                </span>
              </div>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-md hover:bg-zinc-100"
            data-testid="call-drawer-close"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-6">
          {/* Audio player */}
          <section data-testid="call-drawer-audio">
            <div className="text-[11px] uppercase tracking-wide text-[#71717A] mb-2">
              {t('w2a_recording') || 'Recording'}
            </div>
            {call.recordingAvailable && audioSrc && !audioError ? (
              <audio
                controls
                preload="metadata"
                src={audioSrc}
                onError={() => setAudioError(true)}
                className="w-full"
                data-testid="call-audio-player"
              >
                Your browser does not support audio playback.
              </audio>
            ) : audioError ? (
              <div className="text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-md p-3">
                {t('w2a_recording_error') || 'Failed to load recording.'}
              </div>
            ) : (
              <div className="text-sm text-[#71717A] bg-zinc-50 border border-dashed border-[#E4E4E7] rounded-md p-3">
                {t('w2a_no_recording') || 'No recording available for this call.'}
              </div>
            )}
          </section>

          {/* Metadata */}
          <section data-testid="call-drawer-meta">
            <div className="text-[11px] uppercase tracking-wide text-[#71717A] mb-2">
              {t('w2a_metadata') || 'Metadata'}
            </div>
            <div className="border border-[#E4E4E7] rounded-md p-3 space-y-1">
              <Row icon={Phone} label={t('w2a_from') || 'From'}    value={call.fromNumber} />
              <Row icon={Phone} label={t('w2a_to') || 'To'}        value={call.toNumber} />
              <Row icon={User}  label={t('w2a_manager') || 'Manager'} value={call.manager?.name} />
              <Row icon={Clock} label={t('w2a_duration') || 'Duration'} value={fmtDur(call.duration)} />
              <Row icon={Tag}   label={t('w2a_outcome') || 'Outcome'} value={call.outcome ? call.outcome.replace('_', ' ') : null} />
              {call.outcomeNote && (
                <Row label={t('w2a_outcome_note') || 'Outcome note'} value={call.outcomeNote} />
              )}
            </div>
          </section>

          {/* Linked entities */}
          <section data-testid="call-drawer-links">
            <div className="text-[11px] uppercase tracking-wide text-[#71717A] mb-2">
              {t('w2a_links') || 'Linked entities'}
            </div>
            <div className="border border-[#E4E4E7] rounded-md p-3 space-y-1">
              <Row icon={Hash} label="Call ID" value={call.callId || call.id} />
              <Row icon={Hash} label="Lead ID" value={call.meta?.leadId} />
              <Row icon={Hash} label="Deal ID" value={call.meta?.dealId} />
              <Row icon={Hash} label="Customer ID" value={call.meta?.customerId} />
              {(call.meta?.utmSource || call.meta?.utmCampaign || call.meta?.utmMedium) && (
                <div className="pt-2 mt-2 border-t border-[#F4F4F5]">
                  <Row icon={Compass} label="UTM source"   value={call.meta?.utmSource} />
                  <Row icon={Compass} label="UTM campaign" value={call.meta?.utmCampaign} />
                  <Row icon={Compass} label="UTM medium"   value={call.meta?.utmMedium} />
                </div>
              )}
            </div>
          </section>

          {/* Existing AI block (read-only) */}
          <section data-testid="call-drawer-ai">
            <div className="text-[11px] uppercase tracking-wide text-[#71717A] mb-2 flex items-center gap-1.5">
              <Brain size={14} weight="duotone" className="text-violet-600" />
              {t('w2a_ai_existing') || 'Existing AI analysis'}
            </div>
            <div className="border border-[#E4E4E7] rounded-md p-3 bg-gradient-to-br from-violet-50/40 to-white">
              {ai?.hasAnalysis ? (
                <div className="space-y-1">
                  <Row icon={Target}         label={t('w2a_ai_intent') || 'Intent'}    value={ai.intent} />
                  <Row icon={WarningOctagon} label={t('w2a_ai_objection') || 'Objection'} value={ai.objection} />
                  <Row icon={Sparkle}        label={t('w2a_ai_outcome') || 'Suggested outcome'} value={ai.suggestedOutcome} />
                  {typeof ai.interestLevel === 'number' && (
                    <Row label={t('w2a_ai_interest') || 'Interest level'} value={`${Math.round(ai.interestLevel * 100)}%`} />
                  )}
                  {ai.nextAction && (
                    <Row label={t('w2a_ai_next') || 'Next action'} value={ai.nextAction} />
                  )}
                </div>
              ) : (
                <p className="text-sm text-[#71717A]">
                  {t('w2a_ai_none') || 'No AI analysis available for this call yet.'}
                </p>
              )}
            </div>
          </section>
        </div>
      </aside>
    </>
  );
};

export default CallDrawer;
