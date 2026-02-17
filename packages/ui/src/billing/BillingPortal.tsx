import React, { useState, useEffect } from 'react';
import type { BillingData, Invoice } from './types';

let useAuth: () => { user: any; loading: boolean };
try { useAuth = require('../auth').useAuth; } catch { useAuth = () => ({ user: null, loading: false }); }

const c = { bg: '#161616', card: '#1a1a1a', border: '#222', text: '#e0e0e0', muted: '#888', accent: '#6366f1' };

const statusColors: Record<string, string> = {
  active: '#22c55e', trialing: '#f59e0b', past_due: '#f87171', canceled: '#888',
};

const statusLabels: Record<string, string> = {
  active: 'Active', trialing: 'Trial', past_due: 'Past Due', canceled: 'Canceled', incomplete: 'Incomplete',
};

export interface BillingPortalProps {
  onChangePlan?: () => void;
}

export function BillingPortal({ onChangePlan }: BillingPortalProps) {
  const { user, loading: authLoading } = useAuth();
  const [data, setData] = useState<BillingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [cancelConfirm, setCancelConfirm] = useState(false);
  const [actionLoading, setActionLoading] = useState('');

  useEffect(() => {
    fetch('/api/corral/billing')
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(() => { setError('Failed to load billing data'); setLoading(false); });
  }, []);

  const handlePaymentUpdate = async () => {
    setActionLoading('payment');
    try {
      const res = await fetch('/api/corral/billing-portal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ flow: 'payment_method_update' }),
      });
      const { url } = await res.json();
      if (url) window.open(url, '_blank');
    } catch { setError('Failed to open billing portal'); }
    setActionLoading('');
  };

  const handleCancel = async () => {
    setActionLoading('cancel');
    try {
      await fetch('/api/corral/billing', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
      });
      // Refresh
      const res = await fetch('/api/corral/billing');
      setData(await res.json());
      setCancelConfirm(false);
    } catch { setError('Failed to cancel subscription'); }
    setActionLoading('');
  };

  if (loading || authLoading) {
    return <div style={{ color: c.muted, textAlign: 'center', padding: 60 }}>Loading billing…</div>;
  }

  if (error) {
    return <div style={{ color: '#f87171', textAlign: 'center', padding: 40 }}>{error}</div>;
  }

  const sub = data?.subscription;
  const invoices = data?.invoices || [];
  const isFree = !sub;

  const btnBase = {
    border: 'none', borderRadius: 6, padding: '8px 18px', fontSize: 13,
    fontWeight: 600 as const, cursor: 'pointer', transition: 'opacity 0.15s',
  };

  return (
    <div style={{ background: c.bg, padding: 32, maxWidth: 720, margin: '0 auto' }}>
      {/* Current Plan */}
      <div style={{ background: c.card, border: `1px solid ${c.border}`, borderRadius: 12, padding: 24, marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 style={{ color: '#fff', fontSize: 18, margin: 0, fontWeight: 700 }}>Subscription</h2>
          {sub && (
            <span style={{
              background: `${statusColors[sub.status] || c.muted}22`,
              color: statusColors[sub.status] || c.muted,
              fontSize: 12, fontWeight: 600, padding: '3px 12px', borderRadius: 8,
            }}>
              {statusLabels[sub.status] || sub.status}
            </span>
          )}
        </div>

        {isFree ? (
          <div>
            <p style={{ color: c.text, margin: '0 0 16px', fontSize: 14 }}>You're on the <strong style={{ color: '#fff' }}>Free</strong> plan.</p>
            <button onClick={onChangePlan} style={{ ...btnBase, background: c.accent, color: '#fff' }}>
              Upgrade
            </button>
          </div>
        ) : (
          <div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
              <div>
                <div style={{ color: c.muted, fontSize: 12, marginBottom: 4 }}>Plan</div>
                <div style={{ color: '#fff', fontSize: 16, fontWeight: 600 }}>{sub!.planName}</div>
              </div>
              <div>
                <div style={{ color: c.muted, fontSize: 12, marginBottom: 4 }}>Next billing date</div>
                <div style={{ color: c.text, fontSize: 14 }}>
                  {sub!.cancelAtPeriodEnd
                    ? <span style={{ color: '#f87171' }}>Cancels {new Date(sub!.currentPeriodEnd).toLocaleDateString()}</span>
                    : new Date(sub!.currentPeriodEnd).toLocaleDateString()
                  }
                </div>
              </div>
              {sub!.status === 'trialing' && sub!.trialEnd && (
                <div>
                  <div style={{ color: c.muted, fontSize: 12, marginBottom: 4 }}>Trial ends</div>
                  <div style={{ color: '#f59e0b', fontSize: 14 }}>{new Date(sub!.trialEnd).toLocaleDateString()}</div>
                </div>
              )}
            </div>

            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button onClick={onChangePlan} style={{ ...btnBase, background: c.accent, color: '#fff' }}>
                Change Plan
              </button>
              <button
                onClick={handlePaymentUpdate}
                disabled={actionLoading === 'payment'}
                style={{ ...btnBase, background: '#333', color: c.text }}
              >
                {actionLoading === 'payment' ? 'Opening…' : 'Update Payment Method'}
              </button>
              {!sub!.cancelAtPeriodEnd && (
                <button
                  onClick={() => setCancelConfirm(true)}
                  style={{ ...btnBase, background: 'transparent', color: '#f87171', border: '1px solid #f8717133' }}
                >
                  Cancel Subscription
                </button>
              )}
            </div>
          </div>
        )}

        {sub?.status === 'past_due' && (
          <div style={{ marginTop: 16, padding: 12, background: '#f8717111', borderRadius: 8, color: '#f87171', fontSize: 13 }}>
            ⚠ Your payment is past due. Please update your payment method to avoid service interruption.
          </div>
        )}
      </div>

      {/* Cancel confirmation */}
      {cancelConfirm && (
        <div style={{
          background: c.card, border: '1px solid #f8717144', borderRadius: 12,
          padding: 24, marginBottom: 20,
        }}>
          <h3 style={{ color: '#f87171', fontSize: 16, margin: '0 0 8px' }}>Cancel Subscription?</h3>
          <p style={{ color: c.text, fontSize: 13, margin: '0 0 16px' }}>
            Your subscription will remain active until the end of the current billing period
            ({sub ? new Date(sub.currentPeriodEnd).toLocaleDateString() : ''}). You won't be charged again.
          </p>
          <div style={{ display: 'flex', gap: 10 }}>
            <button
              onClick={handleCancel}
              disabled={actionLoading === 'cancel'}
              style={{ ...btnBase, background: '#f87171', color: '#fff' }}
            >
              {actionLoading === 'cancel' ? 'Canceling…' : 'Confirm Cancellation'}
            </button>
            <button onClick={() => setCancelConfirm(false)} style={{ ...btnBase, background: '#333', color: c.text }}>
              Keep Subscription
            </button>
          </div>
        </div>
      )}

      {/* Invoices */}
      {invoices.length > 0 && (
        <div style={{ background: c.card, border: `1px solid ${c.border}`, borderRadius: 12, padding: 24 }}>
          <h2 style={{ color: '#fff', fontSize: 18, margin: '0 0 16px', fontWeight: 700 }}>Invoice History</h2>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {['Date', 'Amount', 'Status', ''].map(h => (
                  <th key={h} style={{ color: c.muted, fontSize: 11, fontWeight: 600, textAlign: 'left', padding: '8px 12px', borderBottom: `1px solid ${c.border}`, textTransform: 'uppercase', letterSpacing: 1 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {invoices.map((inv: Invoice) => (
                <tr key={inv.id}>
                  <td style={{ color: c.text, fontSize: 13, padding: '10px 12px', borderBottom: `1px solid ${c.border}` }}>
                    {new Date(inv.date).toLocaleDateString()}
                  </td>
                  <td style={{ color: '#fff', fontSize: 13, padding: '10px 12px', borderBottom: `1px solid ${c.border}`, fontWeight: 600 }}>
                    ${(inv.amount / 100).toFixed(2)} {inv.currency?.toUpperCase()}
                  </td>
                  <td style={{ fontSize: 13, padding: '10px 12px', borderBottom: `1px solid ${c.border}`, color: inv.status === 'paid' ? '#22c55e' : c.muted }}>
                    {inv.status}
                  </td>
                  <td style={{ padding: '10px 12px', borderBottom: `1px solid ${c.border}` }}>
                    {inv.pdfUrl && (
                      <a href={inv.pdfUrl} target="_blank" rel="noopener noreferrer" style={{ color: c.accent, fontSize: 13, textDecoration: 'none' }}>PDF</a>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default BillingPortal;
