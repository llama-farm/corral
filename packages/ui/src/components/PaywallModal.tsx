import React from "react";
import { X, Lock, ArrowRight, Check } from "lucide-react";
import { useCorral, type CorralPlan } from "../context/CorralProvider";

export interface PaywallModalProps {
  className?: string;
  open: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  action?: string;
  suggestedPlan?: CorralPlan;
  onUpgrade?: (plan: CorralPlan) => void;
}

export function PaywallModal({
  className = "",
  open,
  onClose,
  title = "Upgrade Required",
  description = "You've reached the limit on your current plan.",
  action,
  suggestedPlan,
  onUpgrade,
}: PaywallModalProps) {
  const { subscription, plans, changePlan } = useCorral();

  if (!open) return null;

  const recommended = suggestedPlan || plans.find((p) => p.highlighted) || plans.find((p) => p.id !== subscription?.planId && !p.enterprise);
  const currentPlan = plans.find((p) => p.id === subscription?.planId);

  const handleUpgrade = async () => {
    if (!recommended) return;
    if (onUpgrade) {
      onUpgrade(recommended);
      return;
    }
    const result = await changePlan(recommended.id);
    if (result.checkoutUrl && typeof window !== "undefined") {
      window.location.href = result.checkoutUrl;
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className={`relative w-full max-w-lg rounded-xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-700 dark:bg-slate-950 ${className}`}>
        <button onClick={onClose} className="absolute right-4 top-4 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">
          <X className="h-5 w-5" />
        </button>

        <div className="text-center mb-6">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900">
            <Lock className="h-6 w-6 text-amber-600 dark:text-amber-400" />
          </div>
          <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">{title}</h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{description}</p>
          {action && (
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
              You tried to: <span className="font-medium">{action}</span>
            </p>
          )}
        </div>

        {/* Plan comparison */}
        {currentPlan && recommended && (
          <div className="grid grid-cols-2 gap-4 mb-6">
            {[currentPlan, recommended].map((plan, i) => (
              <div key={plan.id} className={`rounded-lg border p-4 ${i === 1 ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-950 dark:border-indigo-400" : "border-slate-200 dark:border-slate-700"}`}>
                <div className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">{i === 0 ? "Current" : "Recommended"}</div>
                <div className="text-lg font-bold text-slate-900 dark:text-slate-100">{plan.name}</div>
                <div className="text-sm text-slate-500 dark:text-slate-400">${plan.price}/{plan.interval}</div>
                <ul className="mt-3 space-y-1">
                  {plan.features.slice(0, 4).map((f, j) => (
                    <li key={j} className="flex items-center gap-1 text-xs text-slate-600 dark:text-slate-400">
                      <Check className="h-3 w-3 text-green-500" /> {f}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}

        <div className="flex gap-3">
          <button onClick={onClose}
            className="flex-1 rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800">
            Maybe later
          </button>
          {recommended && (
            <button onClick={handleUpgrade}
              className="flex-1 flex items-center justify-center gap-2 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500">
              Upgrade to {recommended.name} <ArrowRight className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
