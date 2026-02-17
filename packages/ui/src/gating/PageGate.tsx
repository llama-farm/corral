import React from "react";
import { SkeletonPage } from "./SkeletonPage";
import { BlurOverlay } from "./BlurOverlay";
import { LoginPrompt } from "./LoginPrompt";
import { UpgradePrompt } from "./UpgradePrompt";

// Graceful import — works even if CorralProvider isn't available
let useCorralFn: (() => any) | undefined;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  useCorralFn = require("../context/CorralProvider").useCorral;
} catch {
  /* no provider */
}

export interface PageGateProps {
  children: React.ReactNode;
  /** What level of access is needed */
  require: "auth" | "plan" | "admin";
  /** For plan gating: which feature/plan is required */
  feature?: string;
  /** Display mode */
  mode?: "skeleton" | "blur" | "block";
  /** Custom fallback (overrides auto-generated prompt) */
  fallback?: React.ReactNode;
  /** For skeleton mode: number of skeleton rows */
  skeletonRows?: number;
  /** For skeleton mode: layout preset */
  skeletonLayout?: "dashboard" | "list" | "detail" | "settings" | "grid";
  /** Title shown on overlay */
  title?: string;
  /** Description on overlay */
  description?: string;
  /** Override: is the user gated? (bypasses context check) */
  gated?: boolean;
  className?: string;
}

/**
 * Hook: resolve whether the gate should block.
 * Uses CorralProvider context if available, otherwise always gates.
 */
function useGateCheck(level: PageGateProps["require"], feature?: string): boolean {
  if (!useCorralFn) return true;

  try {
    const ctx = useCorralFn();
    if (level === "auth") return !ctx?.user;
    if (level === "admin") return ctx?.user?.role !== "admin";
    if (feature && ctx?.entitlements) return !ctx.entitlements[feature];
    return !ctx?.user?.plan || ctx.user.plan === "free";
  } catch {
    return true;
  }
}

function DefaultPrompt({
  require: req,
  feature,
  title,
  description,
}: Pick<PageGateProps, "require" | "feature" | "title" | "description">) {
  if (req === "auth") {
    return <LoginPrompt title={title} reason={title || description} />;
  }
  return (
    <UpgradePrompt
      title={title || `Unlock ${feature || "this page"}`}
      description={description || "Upgrade your plan to access this content."}
      feature={feature}
    />
  );
}

export function PageGate({
  children,
  require: req,
  feature,
  mode = "blur",
  fallback,
  skeletonRows,
  skeletonLayout = "dashboard",
  title,
  description,
  gated: gatedOverride,
  className = "",
}: PageGateProps) {
  const autoGated = useGateCheck(req, feature);
  const gated = gatedOverride ?? autoGated;

  if (!gated) {
    return <>{children}</>;
  }

  const prompt = fallback ?? (
    <DefaultPrompt require={req} feature={feature} title={title} description={description} />
  );

  /* ── Block mode ──────────────────────────────────── */
  if (mode === "block") {
    return (
      <div className={`flex items-center justify-center min-h-[60vh] p-6 ${className}`}>
        {prompt}
      </div>
    );
  }

  /* ── Skeleton mode ───────────────────────────────── */
  if (mode === "skeleton") {
    return (
      <div className={`relative min-h-[60vh] ${className}`}>
        <div className="pointer-events-none select-none" aria-hidden>
          <SkeletonPage layout={skeletonLayout} rows={skeletonRows} showHeader showTabs />
        </div>
        <BlurOverlay intensity="light">{prompt}</BlurOverlay>
      </div>
    );
  }

  /* ── Blur mode (default) ─────────────────────────── */
  return (
    <div className={`relative min-h-[60vh] overflow-hidden ${className}`}>
      <div className="pointer-events-none select-none filter blur-[6px] opacity-70" aria-hidden>
        {children}
      </div>
      <BlurOverlay intensity="medium">{prompt}</BlurOverlay>
    </div>
  );
}
