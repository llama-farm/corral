import React, { useState } from "react";
import { Check, Star, Loader2, ExternalLink } from "lucide-react";
import { useCorral, type CorralPlan } from "../context/CorralProvider";

export interface PlanPickerProps {
  className?: string;
  plans?: CorralPlan[];
  onPlanSelect?: (plan: CorralPlan) => void;
  onContactSales?: () => void;
  currentPlanId?: string;
  compact?: boolean;
}

export function PlanPicker({ className = "", plans: propPlans, onPlanSelect, onContactSales, currentPlanId: propCurrentPlanId, compact = false }: PlanPickerProps) {
  const { plans: ctxPlans, subscription, changePlan } = useCorral();
  const plans = propPlans || ctxPlans;
  const currentPlanId = propCurrentPlanId || subscription?.planId;
  const [loadingPlan, setLoadingPlan] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSelect = async (plan: CorralPlan) => {
    if (plan.enterprise) {
      onContactSales?.();
      return;
    }
    if (onPlanSelect) {
      onPlanSelect(plan);
      return;
    }
    setLoadingPlan(plan.id);
    setError(null);
    const result = await changePlan(plan.id);
    setLoadingPlan(null);
    if (result.error) setError(result.error);
    else if (result.checkoutUrl && typeof window !== "undefined") {
      window.location.href = result.checkoutUrl;
    }
  };

  const formatPrice = (plan: CorralPlan) => {
    const currency = plan.currency || "USD";
    if (plan.price === 0) return "Free";
    try {
      return new Intl.NumberFormat("en-US", { style: "currency", currency, minimumFractionDigits: 0 }).format(plan.price);
    } catch {
      return `$${plan.price}`;
    }
  };

  if (!plans.length) {
    return (
      <div className={`text-center py-8 text-sm text-slate-500 dark:text-slate-400 ${className}`}>
        No plans configured.
      </div>
    );
  }

  return (
    <div className={className}>
      {error && (
        <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-400">
          {error}
        </div>
      )}
      <div className={`grid gap-4 ${compact ? "grid-cols-1" : "grid-cols-1 md:grid-cols-2 lg:grid-cols-3"}`}>
        {plans.map((plan) => {
          const isCurrent = plan.id === currentPlanId;
          return (
            <div
              key={plan.id}
              className={`relative rounded-lg border p-6 transition-shadow ${
                plan.highlighted
                  ? "border-indigo-500 shadow-md ring-1 ring-indigo-500 dark:border-indigo-400"
                  : "border-slate-200 dark:border-slate-700"
              } bg-white dark:bg-slate-950`}
            >
              {plan.highlighted && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <span className="inline-flex items-center gap-1 rounded-full bg-indigo-600 px-3 py-0.5 text-xs font-semibold text-white">
                    <Star className="h-3 w-3" /> Most Popular
                  </span>
                </div>
              )}

              <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{plan.name}</h3>
              <div className="mt-2">
                <span className="text-3xl font-bold text-slate-900 dark:text-slate-100">{formatPrice(plan)}</span>
                {plan.price > 0 && (
                  <span className="text-sm text-slate-500 dark:text-slate-400">/{plan.interval}</span>
                )}
              </div>

              <ul className="mt-4 space-y-2">
                {plan.features.map((feat, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-slate-600 dark:text-slate-400">
                    <Check className="h-4 w-4 shrink-0 text-green-500 mt-0.5" />
                    {feat}
                  </li>
                ))}
              </ul>

              <div className="mt-6">
                {isCurrent ? (
                  <div className="w-full rounded-md border border-slate-300 bg-slate-50 px-4 py-2 text-center text-sm font-medium text-slate-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-400">
                    Current Plan
                  </div>
                ) : plan.enterprise ? (
                  <button
                    onClick={() => handleSelect(plan)}
                    className="flex w-full items-center justify-center gap-1 rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
                  >
                    Contact Sales <ExternalLink className="h-3.5 w-3.5" />
                  </button>
                ) : (
                  <button
                    onClick={() => handleSelect(plan)}
                    disabled={loadingPlan === plan.id}
                    className={`w-full rounded-md px-4 py-2 text-sm font-medium shadow-sm transition-colors disabled:opacity-50 ${
                      plan.highlighted
                        ? "bg-indigo-600 text-white hover:bg-indigo-500"
                        : "bg-slate-900 text-white hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-200"
                    }`}
                  >
                    {loadingPlan === plan.id ? (
                      <span className="flex items-center justify-center gap-2"><Loader2 className="h-4 w-4 animate-spin" />Processing…</span>
                    ) : currentPlanId ? "Switch Plan" : "Get Started"}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
