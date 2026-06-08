/**
 * Public shareable Quote view — /quote/:shareToken
 *
 * Customer lands here from a Viber / Telegram / WhatsApp message the manager
 * sends out. Shows ONLY client-visible breakdown rows + totals + shared
 * comments + an "Approve" button if the calculation is in `sent_to_client`
 * status.
 *
 * No auth required — addressed by an unguessable share_token.
 */
import React, { useEffect, useState, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import axios from 'axios';
import { toast } from 'sonner';

const API = process.env.REACT_APP_BACKEND_URL || '';

const STATUS_LABEL = {
  draft:               { text: 'Draft',                color: '#71717A', bg: '#F4F4F5' },
  sent_to_client:      { text: 'Awaiting your review', color: '#F59E0B', bg: '#FEF3C7' },
  approved_by_client:  { text: 'Approved by you',      color: '#16A34A', bg: '#DCFCE7' },
  auction_mode:        { text: 'Auction in progress',  color: '#3B82F6', bg: '#DBEAFE' },
  final:               { text: 'Final',                color: '#0EA5E9', bg: '#E0F2FE' },
  archived:            { text: 'Archived',             color: '#71717A', bg: '#F4F4F5' },
};

const fmt = (v, ccy = 'USD') => {
  const sym = ccy === 'EUR' ? '€' : '$';
  return `${sym}${Math.round(Number(v) || 0).toLocaleString()}`;
};

export default function QuoteSharePage() {
  const { shareToken } = useParams();
  const [calc, setCalc]   = useState(null);
  const [loading, setLoading] = useState(true);
  const [approving, setApproving] = useState(false);
  const [error, setError] = useState(null);

  const fetchCalc = useCallback(async () => {
    try {
      const r = await axios.get(`${API}/api/public/calculations/share/${shareToken}`);
      setCalc(r.data?.calculation);
      setError(null);
    } catch (e) {
      setError(e?.response?.data?.detail || 'Calculation not found');
    } finally {
      setLoading(false);
    }
  }, [shareToken]);

  useEffect(() => { fetchCalc(); }, [fetchCalc]);

  const approve = async () => {
    setApproving(true);
    try {
      const r = await axios.post(`${API}/api/public/calculations/share/${shareToken}/approve`, {});
      if (r.data?.already_approved) {
        toast.info('Already approved — thank you!');
      } else {
        toast.success('Approved! Your manager has been notified.');
      }
      await fetchCalc();
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Failed to approve');
    } finally {
      setApproving(false);
    }
  };

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: '#0F0F12', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ opacity: 0.6 }}>Loading your calculation…</div>
      </div>
    );
  }

  if (error || !calc) {
    return (
      <div style={{ minHeight: '100vh', background: '#0F0F12', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <div style={{ maxWidth: 540, textAlign: 'center' }}>
          <h1 style={{ fontSize: 36, fontWeight: 700, marginBottom: 16 }}>Calculation unavailable</h1>
          <p style={{ opacity: 0.6, marginBottom: 24 }}>{error || 'This link is no longer valid or the calculation has been archived.'}</p>
          <Link to="/" style={{ color: '#F59E0B', textDecoration: 'underline' }}>← Back to BIBI Cars home</Link>
        </div>
      </div>
    );
  }

  const status = calc.status || 'draft';
  const statusMeta = STATUS_LABEL[status] || STATUS_LABEL.draft;
  const outputs = calc.outputs || {};
  const breakdown = calc.breakdown || [];
  const comments = calc.comments || [];
  const inputs = calc.inputs || {};
  const isApproved = status === 'approved_by_client' || status === 'final';
  const canApprove = status === 'sent_to_client' || status === 'draft';

  return (
    <div style={{ minHeight: '100vh', background: '#0F0F12', color: '#fff', padding: '40px 20px 80px' }} data-testid="quote-share-page">
      <div style={{ maxWidth: 980, margin: '0 auto' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 32, flexWrap: 'wrap', gap: 12 }}>
          <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: 12, textDecoration: 'none', color: 'inherit' }}>
            <div style={{ fontFamily: 'Mazzard H, sans-serif', fontWeight: 700, fontSize: 28, color: '#F59E0B' }}>BIBI</div>
            <div style={{ fontFamily: 'Mazzard H, sans-serif', fontSize: 14, opacity: 0.6 }}>cars</div>
          </Link>
          <span style={{ padding: '6px 14px', borderRadius: 12, fontSize: 12, fontWeight: 600, color: statusMeta.color, background: statusMeta.bg, textTransform: 'uppercase', letterSpacing: 1 }}>
            {statusMeta.text}
          </span>
        </div>

        {/* Hero */}
        <div style={{ marginBottom: 40 }}>
          <div style={{ opacity: 0.5, fontSize: 12, letterSpacing: 3, marginBottom: 8, textTransform: 'uppercase' }}>Your Import Estimate · v{calc.version || 1}</div>
          <h1 style={{ fontFamily: 'Mazzard H, sans-serif', fontSize: 48, fontWeight: 700, margin: '0 0 12px', lineHeight: 1.1 }}>
            {(inputs.origin || 'usa').toUpperCase()} · {(inputs.vehicleType || 'sedan').toUpperCase()}
            {inputs.damaged ? ' · DAMAGED' : ''}
          </h1>
          <div style={{ opacity: 0.5, fontSize: 14 }}>
            Vehicle purchase price: <span style={{ color: '#fff', fontWeight: 600 }}>{fmt(inputs.price)}</span>
            {inputs.vin ? <> · VIN <span style={{ color: '#fff', fontFamily: 'monospace' }}>{inputs.vin}</span></> : null}
          </div>
        </div>

        {/* Breakdown table */}
        <div style={{ background: '#18181B', borderRadius: 16, padding: 32, marginBottom: 24 }}>
          <div style={{ fontSize: 12, letterSpacing: 3, opacity: 0.5, marginBottom: 20, textTransform: 'uppercase' }}>Cost breakdown</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {breakdown.map((row, i) => (
              <div key={row.key || i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', borderBottom: '1px solid #27272A', paddingBottom: 12 }}>
                <span style={{ fontSize: 15, opacity: row.value < 0 ? 0.9 : 0.85, color: row.value < 0 ? '#22c55e' : '#fff' }}>
                  {row.label || row.key}
                  {row.overridden && <span style={{ marginLeft: 8, fontSize: 10, opacity: 0.5 }}>(edited)</span>}
                </span>
                <span style={{ fontSize: 16, fontWeight: 600, color: row.value < 0 ? '#22c55e' : '#fff' }}>
                  {row.value < 0 ? '−' : ''}{fmt(Math.abs(row.value), row.currency)}
                </span>
              </div>
            ))}
          </div>

          {/* Total */}
          <div style={{ marginTop: 28, padding: '20px 0 0', borderTop: '2px solid #F59E0B' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <span style={{ fontSize: 14, opacity: 0.6, textTransform: 'uppercase', letterSpacing: 2 }}>Total approximate cost</span>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontFamily: 'Mazzard H, sans-serif', fontSize: 40, fontWeight: 700, color: '#F59E0B' }}>{fmt(outputs.total)}</div>
                {outputs.totalEur ? <div style={{ opacity: 0.6, fontSize: 14, marginTop: 4 }}>≈ {fmt(outputs.totalEur, 'EUR')}</div> : null}
              </div>
            </div>
          </div>
        </div>

        {/* Comments thread (shared only) */}
        {comments.length > 0 && (
          <div style={{ background: '#18181B', borderRadius: 16, padding: 24, marginBottom: 24 }}>
            <div style={{ fontSize: 12, letterSpacing: 3, opacity: 0.5, marginBottom: 16, textTransform: 'uppercase' }}>Notes from your manager</div>
            {comments.map((c) => (
              <div key={c.id} style={{ padding: '12px 0', borderBottom: '1px solid #27272A' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontSize: 13, color: '#F59E0B', fontWeight: 600 }}>{c.author_name}</span>
                  <span style={{ fontSize: 11, opacity: 0.4 }}>{new Date(c.created_at).toLocaleString()}</span>
                </div>
                <div style={{ fontSize: 14, lineHeight: 1.5, opacity: 0.9 }}>{c.text}</div>
              </div>
            ))}
          </div>
        )}

        {/* Approve CTA */}
        {canApprove && (
          <div style={{ textAlign: 'center', padding: '32px 0' }}>
            <button
              onClick={approve}
              disabled={approving}
              data-testid="approve-calculation-btn"
              style={{
                padding: '18px 48px',
                borderRadius: 12,
                background: '#F59E0B',
                color: '#0F0F12',
                fontWeight: 700,
                fontSize: 16,
                textTransform: 'uppercase',
                letterSpacing: 2,
                border: 0,
                cursor: approving ? 'wait' : 'pointer',
                opacity: approving ? 0.7 : 1,
                transition: 'opacity 120ms, transform 120ms',
              }}
              onMouseDown={(e) => { e.currentTarget.style.transform = 'scale(0.98)'; }}
              onMouseUp={(e) => { e.currentTarget.style.transform = ''; }}
            >
              {approving ? 'Approving…' : 'Approve this calculation'}
            </button>
            <div style={{ opacity: 0.5, fontSize: 13, marginTop: 12 }}>
              Your approval is non-binding — you can still contact your manager to adjust the order.
            </div>
          </div>
        )}

        {isApproved && (
          <div style={{ textAlign: 'center', padding: 24, background: 'rgba(34, 197, 94, 0.10)', borderRadius: 12, color: '#22c55e' }}>
            ✓ You approved this calculation. Your manager has been notified and will be in touch.
          </div>
        )}

        {/* Footer disclaimer */}
        <div style={{ marginTop: 40, opacity: 0.4, fontSize: 12, textAlign: 'center', lineHeight: 1.6 }}>
          This calculation is indicative and may vary depending on customs, logistics and currency conditions.
          <br />
          FX snapshot: 1 USD ≈ {Number(calc.fx_snapshot || 1).toFixed(3)} EUR · Calculation ID: <span style={{ fontFamily: 'monospace' }}>{calc.id}</span>
        </div>
      </div>
    </div>
  );
}
