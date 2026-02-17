import React from "react";
import { useFeatureGate } from "./useFeatureGate";
import { UpgradePrompt } from "./UpgradePrompt";
import { LoginPrompt } from "./LoginPrompt";

export interface FeatureGateProps {
  /** Feature ID from corral.yaml features map */
  feature: string;
  children: React.ReactNode;
  /** Custom fallback for locked state. Auto-selects LoginPrompt or UpgradePrompt if not provided. */
  fallback?: React.ReactNode;
  /** Custom fallback specifically for auth-required state */
  authFallback?: React.ReactNode;
  /** Custom fallback specifically for plan-required state */
  planFallback?: React.ReactNode;
  /** Benefits shown in LoginPrompt when auth is required */
  authBenefits?: string[];
  /** Display mode: "block" replaces content, "blur" shows blurred with overlay */
  mode?: "block" | "blur";
  className?: string;
}

/**
 * FeatureGate — Wraps content with the right gate based on the user's state:
 *
 * - Anonymous user + feature needs auth → LoginPrompt
 * - Free user + feature needs paid plan → UpgradePrompt
 * - Paid user or admin → children rendered normally
 */
export function FeatureGate({
  feature,
  children,
  fallback,
  authFallback,
  planFallback,
  authBenefits,
  mode = "block",
  className,
}: FeatureGateProps) {
  const gate = useFeatureGate(feature);

  if (!gate.isLocked) return <>{children}</>;

  // Determine which prompt to show
  let prompt: React.ReactNode;

  if (gate.lockReason === "auth") {
    prompt = authFallback || fallback || (
      <LoginPrompt
        reason={`Sign in to access ${feature.replace(/[-_]/g, " ")}`}
        benefits={authBenefits}
        hasFree={gate.requiresAuthOnly}
      />
    );
  } else {
    prompt = planFallback || fallback || (
      <UpgradePrompt
        feature={feature}
        title={feature.replace(/[-_]/g, " ").replace(/\b\w/g, c => c.toUpperCase())}
        description={`This feature requires the ${gate.planName ?? "Pro"} plan.`}
        planId={gate.requiredPlan ?? undefined}
        planName={gate.planName ?? undefined}
      />
    );
  }

  // Blur mode
  if (mode === "blur") {
    return (
      <div className={`relative ${className || ""}`}>
        <div className="select-none pointer-events-none blur-sm opacity-60">
          {children}
        </div>
        <div className="absolute inset-0 flex items-center justify-center bg-black/20 dark:bg-black/40 backdrop-blur-[2px] rounded-lg">
          <div className="max-w-md w-full mx-4">
            {prompt}
          </div>
        </div>
      </div>
    );
  }

  // Block mode (default)
  return <div className={className}>{prompt}</div>;
}
