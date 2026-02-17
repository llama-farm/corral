import React, { useState, useEffect, useCallback } from 'react';

// Auth hook expected from consuming app
let useAuth: () => { user: any; loading: boolean };
try {
  useAuth = require('../auth').useAuth;
} catch {
  useAuth = () => ({ user: null, loading: false });
}

export interface UpgradeButtonProps {
  plan: string;
  label?: string;
  className?: string;
  onSuccess?: () => void;
}

const styles = {
  button: {
    background: '#6366f1',
    color: '#fff',
    border: 'none',
    borderRadius: '6px',
    padding: '10px 20px',
    fontSize: '14px',
    fontWeight: 600 as const,
    cursor: 'pointer',
    transition: 'opacity 0.15s',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '8px',
  },
  disabled: {
    opacity: 0.6,
    cursor: 'not-allowed' as const,
  },
};

export function UpgradeButton({ plan, label, className, onSuccess }: UpgradeButtonProps) {
  const { user, loading: authLoading } = useAuth();
  const [loading, setLoading] = useState(false);

  // Detect checkout success from URL
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('checkout') === 'success') {
      // Clean URL
      const url = new URL(window.location.href);
      url.searchParams.delete('checkout');
      window.history.replaceState({}, '', url.toString());
      onSuccess?.();
    }
  }, [onSuccess]);

  const handleClick = useCallback(async () => {
    if (loading || authLoading) return;

    if (!user) {
      window.location.href = `/login?returnTo=/?upgrade=${encodeURIComponent(plan)}`;
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/corral/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planId: plan }),
      });
      const data = await res.json();
      if (data.url) {
        window.open(data.url, '_blank');
      }
    } catch (err) {
      console.error('Checkout failed:', err);
    } finally {
      setLoading(false);
    }
  }, [plan, user, loading, authLoading]);

  const buttonStyle = {
    ...styles.button,
    ...(loading ? styles.disabled : {}),
  };

  return (
    <button
      onClick={handleClick}
      disabled={loading}
      className={className}
      style={buttonStyle}
    >
      {loading ? (
        <>
          <span style={{ display: 'inline-block', width: 14, height: 14, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.6s linear infinite' }} />
          Creating checkout…
        </>
      ) : (
        label || `Upgrade to ${plan}`
      )}
    </button>
  );
}

export default UpgradeButton;
