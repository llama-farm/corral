import React from "react";
import { ArrowRight } from "lucide-react";
import { useCorral } from "../context/CorralProvider";

export interface UpgradeCTAProps {
  planId?: string;
  onUpgrade?: () => void;
  className?: string;
  variant?: "primary" | "secondary" | "ghost";
  size?: "sm" | "md" | "lg";
}

export function UpgradeCTA({ planId, onUpgrade, className = "", variant = "primary", size = "md" }: UpgradeCTAProps) {
  const { subscription, plans, changePlan } = useCorral();

  const plan = planId ? plans.find((p) => p.id === planId) : plans.find((p) => p.highlighted) ?? plans[0];
  const planName = plan?.name ?? "Pro";
  const price = plan?.price;

  // Determine state
  const isOnPlan = subscription?.planId === plan?.id && subscription?.status === "active";
  const isTrial = subscription?.status === "trialing";
  const trialEnd = subscription?.trialEnd ? new Date(subscription.trialEnd) : null;
  const trialDaysLeft = trialEnd ? Math.max(0, Math.ceil((trialEnd.getTime() - Date.now()) / 86_400_000)) : 0;
  const hasNoSub = !subscription;
  const trialAvailable = !subscription && plan && (plans as any).__trialDays; // fallback

  let text: string;
  let disabled = false;

  if (isOnPlan) {
    text = "Current Plan";
    disabled = true;
  } else if (isTrial && trialDaysLeft > 0) {
    text = `${trialDaysLeft} day${trialDaysLeft === 1 ? "" : "s"} left in trial`;
  } else if (price != null) {
    text = `Upgrade to ${planName} — $${price}/mo`;
  } else {
    text = `Upgrade to ${planName}`;
  }

  const handleClick = () => {
    if (disabled) return;
    if (onUpgrade) return onUpgrade();
    if (plan) changePlan(plan.id);
  };

  const variantClasses = {
    primary: "bg-indigo-600 hover:bg-indigo-700 text-white",
    secondary: "bg-zinc-100 hover:bg-zinc-200 text-zinc-800 dark:bg-zinc-800 dark:hover:bg-zinc-700 dark:text-zinc-200",
    ghost: "bg-transparent hover:bg-zinc-100 dark:hover:bg-zinc-800 text-indigo-600 dark:text-indigo-400",
  }[variant];

  const sizeClasses = {
    sm: "text-xs px-3 py-1.5",
    md: "text-sm px-4 py-2",
    lg: "text-base px-5 py-2.5",
  }[size];

  return (
    <button
      onClick={handleClick}
      disabled={disabled}
      className={`inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${variantClasses} ${sizeClasses} ${className}`}
    >
      {text}
      {!disabled && <ArrowRight className="w-4 h-4" />}
    </button>
  );
}
