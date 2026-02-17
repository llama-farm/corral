/**
 * LoginPrompt — Inline prompt encouraging anonymous users to sign in/up.
 * NOT a modal. Renders in the content area like UpgradePrompt.
 *
 * Emphasizes what the user gets for free, not what they're missing.
 * Feels like an invitation, not a wall.
 */

import React from "react";
import { LogIn, Check, ArrowRight, Zap } from "lucide-react";

export interface LoginPromptProps {
  /** Why the user should log in */
  reason?: string;
  /** What they get by signing up (free tier benefits) */
  benefits?: string[];
  /** Show "Free plan available" badge */
  hasFree?: boolean;
  /** Title override */
  title?: string;
  /** CTA text override */
  ctaText?: string;
  /** Login URL */
  loginUrl?: string;
  /** Signup URL (if different from login) */
  signupUrl?: string;
  /** Custom action instead of redirect */
  onLogin?: () => void;
  /** Custom action for signup */
  onSignup?: () => void;
  /** Additional CSS classes */
  className?: string;
}

export function LoginPrompt({
  reason = "Sign in to continue",
  benefits,
  hasFree = true,
  title,
  ctaText,
  loginUrl = "/login",
  signupUrl,
  onLogin,
  onSignup,
  className = "",
}: LoginPromptProps) {
  const defaultBenefits = [
    "Save your progress and preferences",
    "Access all free features",
    "Get started in seconds",
  ];

  const items = benefits || defaultBenefits;

  const handleLogin = () => {
    if (onLogin) {
      onLogin();
      return;
    }
    if (typeof window !== "undefined") {
      const returnTo = window.location.pathname + window.location.search;
      window.location.href = `${loginUrl}?returnTo=${encodeURIComponent(returnTo)}`;
    }
  };

  const handleSignup = () => {
    if (onSignup) {
      onSignup();
      return;
    }
    const url = signupUrl || loginUrl?.replace("/login", "/signup") || "/signup";
    if (typeof window !== "undefined") {
      const returnTo = window.location.pathname + window.location.search;
      window.location.href = `${url}?returnTo=${encodeURIComponent(returnTo)}`;
    }
  };

  return (
    <div className={`max-w-md mx-auto ${className}`}>
      <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/80 shadow-lg overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-500 to-indigo-600 px-6 py-5 text-white">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-lg bg-white/20 flex items-center justify-center">
              <LogIn className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-semibold text-lg">{title || reason}</h3>
              {hasFree && (
                <span className="inline-flex items-center gap-1 text-xs bg-white/20 rounded-full px-2 py-0.5 mt-1">
                  <Zap className="w-3 h-3" />
                  Free plan available
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Benefits */}
        <div className="px-6 py-4 space-y-3">
          {items.map((item, i) => (
            <div key={i} className="flex items-start gap-3">
              <Check className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
              <span className="text-sm text-slate-600 dark:text-slate-300">{item}</span>
            </div>
          ))}
        </div>

        {/* Actions */}
        <div className="px-6 pb-5 space-y-2">
          <button
            onClick={handleSignup}
            className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg bg-gradient-to-r from-blue-500 to-indigo-600 text-white font-medium text-sm hover:from-blue-600 hover:to-indigo-700 transition-all shadow-md hover:shadow-lg"
          >
            {ctaText || "Create free account"}
            <ArrowRight className="w-4 h-4" />
          </button>
          <button
            onClick={handleLogin}
            className="w-full flex items-center justify-center gap-2 py-2 px-4 rounded-lg text-sm text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
          >
            Already have an account? Sign in
          </button>
        </div>
      </div>
    </div>
  );
}
