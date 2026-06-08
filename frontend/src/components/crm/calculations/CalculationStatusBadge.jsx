/**
 * P2.7 — Calculation status badge
 * Mirrors the backend state machine (draft → sent_to_client → approved_by_client →
 * auction_mode → final → archived).
 */
import React from 'react';
import { useLang } from '../../../i18n';

const STYLE = {
  draft:               { bg: '#F4F4F5', fg: '#71717A', label: 'Draft' },
  sent_to_client:      { bg: '#FEF3C7', fg: '#B45309', label: 'Sent to client' },
  approved_by_client:  { bg: '#DCFCE7', fg: '#16A34A', label: 'Approved' },
  auction_mode:        { bg: '#DBEAFE', fg: '#1D4ED8', label: 'Auction mode' },
  final:               { bg: '#E0F2FE', fg: '#0369A1', label: 'Final' },
  archived:            { bg: '#E5E7EB', fg: '#4B5563', label: 'Archived' },
};

export default function CalculationStatusBadge({ status, size = 'sm', className = '' }) {
  const s = STYLE[status] || { bg: '#F4F4F5', fg: '#71717A', label: status || '—' };
  const pad = size === 'lg' ? 'px-3 py-1.5 text-sm' : 'px-2 py-0.5 text-xs';
  return (
    <span
      className={`inline-flex items-center rounded-full font-semibold ${pad} ${className}`}
      style={{ backgroundColor: s.bg, color: s.fg }}
      data-testid={`calc-status-${status}`}
    >
      {s.label}
    </span>
  );
}
