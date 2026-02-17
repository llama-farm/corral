import React, { useState, useEffect } from 'react';
import { UpgradeButton } from './UpgradeButton';
import type { Plan, CorralConfig } from './types';

let useAuth: () => { user: any; loading: boolean };
try { useAuth = require('../auth').useAuth; } catch { useAuth = () => ({ user: null, loading: false }); }

export interface PricingTableProps {
  plans?: Plan[];
  config?: CorralConfig;
}

const c = { bg: '#161616', card: '#1a1a1a', border: '#222', text: '#e0e0e0', muted: '#888', accent: '#6366f1', highlight: '#6366f1' };

export function PricingTable({ plans: propPlans, config }: PricingTableProps) {
  const { user } = useAuth();
  const [plans, setPlans] = useState<Plan[]>(propPlans || config?.plans || []);
  const [annual, setAnnual] = useState(false);
  const [fetchError, setFetchError] = useState(false);

  useEffect(() => {
    if (propPlans || config?.plans) return;
    fetch('/api/corral/config')
      .then(r => r.json())
      .then(d => setPlans(d.plans || []))
      .catch(() => setFetchError(true));
  }, [propPlans, config]);

  const hasAnnual = plans.some(p => p.annualPrice != null);
  const userPlan = user?.plan;

  if (!plans.length && !fetchError) {
    return <div style={{ color: c.muted, textAlign: 'center', padding: 40 }}>Loading plans…</div>;
  }
  if (fetchError) {
    return <div style={{ color: '#f87171', textAlign: 'center', padding: 40 }}>Failed to load plans.</div>;
  }

  return (
    <div style={{ background: c.bg, padding: '32px 16px' }}>
      {hasAnnual && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: 12, marginBottom: 32, alignItems: 'center' }}>
          <span style={{ color: !annual ? '#fff' : c.muted, fontSize: 14 }}>Monthly</span>
          <button
            onClick={() => setAnnual(!annual)}
            style={{
              width: 48, height: 26, borderRadius: 13, border: 'none', background: annual ? c.accent : '#333',
              position: 'relative', cursor: 'pointer', transition: 'background 0.2s',
            }}
          >
            <span style={{
              position: 'absolute', top: 3, left: annual ? 25 : 3,
              width: 20, height: 20, borderRadius: '50%', background: '#fff', transition: 'left 0.2s',
            }} />
          </button>
          <span style={{ color: annual ? '#fff' : c.muted, fontSize: 14 }}>Annual</span>
        </div>
      )}
      <div style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${Math.min(plans.length, 4)}, 1fr)`,
        gap: 20,
        maxWidth: 1100,
        margin: '0 auto',
      }}>
        {plans.map(plan => {
          const isHighlighted = plan.highlighted || plan.popular;
          const isCurrent = userPlan === plan.id;
          const isEnterprise = plan.id === 'enterprise' || plan.name.toLowerCase() === 'enterprise';
          const isFree = plan.price === 0 && !isEnterprise;
          const price = annual && plan.annualPrice != null ? plan.annualPrice : plan.price;
          const period = annual && plan.annualPrice != null ? '/yr' : `/${plan.period || 'mo'}`;

          return (
            <div key={plan.id} style={{
              background: c.card, border: `1px solid ${isHighlighted ? c.accent : c.border}`,
              borderRadius: 12, padding: 28, display: 'flex', flexDirection: 'column',
              position: 'relative',
              boxShadow: isHighlighted ? `0 0 20px ${c.accent}33` : 'none',
            }}>
              {isHighlighted && (
                <div style={{
                  position: 'absolute', top: -12, left: '50%', transform: 'translateX(-50%)',
                  background: c.accent, color: '#fff', fontSize: 11, fontWeight: 700,
                  padding: '3px 14px', borderRadius: 10, textTransform: 'uppercase', letterSpacing: 1,
                }}>Popular</div>
              )}
              {isCurrent && (
                <div style={{
                  position: 'absolute', top: 12, right: 12,
                  background: '#22c55e22', color: '#22c55e', fontSize: 11, fontWeight: 600,
                  padding: '2px 10px', borderRadius: 8,
                }}>Current Plan</div>
              )}
              <h3 style={{ color: '#fff', fontSize: 20, margin: '0 0 8px', fontWeight: 700 }}>{plan.name}</h3>
              <div style={{ marginBottom: 20 }}>
                {isEnterprise ? (
                  <span style={{ color: c.text, fontSize: 28, fontWeight: 700 }}>Custom</span>
                ) : (
                  <>
                    <span style={{ color: '#fff', fontSize: 36, fontWeight: 800 }}>${price}</span>
                    <span style={{ color: c.muted, fontSize: 14 }}>{period}</span>
                  </>
                )}
              </div>
              <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 24px', flex: 1 }}>
                {plan.features.map((f, i) => (
                  <li key={i} style={{ color: c.text, fontSize: 14, padding: '5px 0', display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                    <span style={{ color: c.accent, flexShrink: 0 }}>✓</span> {f}
                  </li>
                ))}
              </ul>
              {isCurrent ? (
                <button disabled style={{
                  background: '#333', color: c.muted, border: 'none', borderRadius: 6,
                  padding: '10px 20px', fontSize: 14, fontWeight: 600, cursor: 'default',
                }}>Current Plan</button>
              ) : isEnterprise ? (
                <a href="mailto:sales@corral.dev" style={{
                  display: 'block', textAlign: 'center', background: 'transparent',
                  border: `1px solid ${c.accent}`, color: c.accent, borderRadius: 6,
                  padding: '10px 20px', fontSize: 14, fontWeight: 600, textDecoration: 'none',
                }}>Contact Sales</a>
              ) : isFree ? (
                <a href={user ? '#' : '/signup'} style={{
                  display: 'block', textAlign: 'center', background: '#333',
                  color: '#fff', borderRadius: 6, padding: '10px 20px', fontSize: 14,
                  fontWeight: 600, textDecoration: 'none', border: 'none',
                }}>{plan.cta || 'Get Started'}</a>
              ) : (
                <UpgradeButton plan={plan.id} label={plan.cta || `Upgrade to ${plan.name}`} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default PricingTable;
