/**
 * AuthGate — Component that wraps content requiring authentication.
 *
 * Three modes:
 * 1. `mode="block"` — Shows fallback (login prompt) instead of children
 * 2. `mode="blur"` — Shows children blurred/dimmed with login overlay
 * 3. `mode="action"` — Shows children normally, but gates a specific action (use with useAuthGate)
 *
 * Usage:
 *   <AuthGate fallback={<LoginPrompt reason="Save your work" />}>
 *     <SaveButton />
 *   </AuthGate>
 *
 *   <AuthGate mode="blur" reason="Sign in to view full results">
 *     <SearchResults />
 *   </AuthGate>
 */

import React from "react";
import { useAuthGate, type UseAuthGateOptions } from "./useAuthGate";
import { LoginPrompt, type LoginPromptProps } from "./LoginPrompt";

export interface AuthGateProps extends UseAuthGateOptions {
  children: React.ReactNode;
  /** What to show when not authenticated. Default: LoginPrompt */
  fallback?: React.ReactNode;
  /** Display mode */
  mode?: "block" | "blur" | "action";
  /** Reason shown to user for why login is needed */
  reason?: string;
  /** Features/benefits shown in the login prompt */
  benefits?: string[];
  /** Whether free plan is available (shown in prompt) */
  hasFree?: boolean;
  className?: string;
}

export function AuthGate({
  children,
  fallback,
  mode = "block",
  reason,
  benefits,
  hasFree = true,
  className = "",
  ...authOptions
}: AuthGateProps) {
  const { isAuthenticated } = useAuthGate(authOptions);

  // Authenticated — show everything
  if (isAuthenticated) {
    return <>{children}</>;
  }

  const defaultFallback = (
    <LoginPrompt
      reason={reason}
      benefits={benefits}
      hasFree={hasFree}
      loginUrl={authOptions.loginUrl}
    />
  );

  // Block mode — replace content entirely
  if (mode === "block") {
    return <div className={className}>{fallback || defaultFallback}</div>;
  }

  // Blur mode — show content blurred with overlay
  if (mode === "blur") {
    return (
      <div className={`relative ${className}`}>
        <div className="select-none pointer-events-none blur-sm opacity-60">
          {children}
        </div>
        <div className="absolute inset-0 flex items-center justify-center bg-black/20 dark:bg-black/40 backdrop-blur-[2px] rounded-lg">
          <div className="max-w-sm w-full mx-4">
            {fallback || defaultFallback}
          </div>
        </div>
      </div>
    );
  }

  // Action mode — show content as-is (gating happens at action level via useAuthGate)
  return <>{children}</>;
}
