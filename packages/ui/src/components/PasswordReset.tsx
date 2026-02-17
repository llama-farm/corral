import React, { useState, type FormEvent } from "react";
import { Mail, Lock, Loader2, AlertCircle, CheckCircle, ArrowLeft, Eye, EyeOff } from "lucide-react";

// ── Types ───────────────────────────────────────────────────────────

export interface PasswordResetProps {
  logo?: React.ReactNode;
  onBackToLogin?: () => void;
  serverUrl?: string;
  className?: string;
}

// ── Helpers ─────────────────────────────────────────────────────────

function getTokenFromURL(): string | null {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get("token");
}

// ── PasswordReset ───────────────────────────────────────────────────

export function PasswordReset({
  logo,
  onBackToLogin,
  serverUrl,
  className = "",
}: PasswordResetProps) {
  const token = getTokenFromURL();
  const isResetMode = !!token;
  const base = serverUrl || "/api/auth";

  // Request mode state
  const [email, setEmail] = useState("");
  // Reset mode state
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  // Shared state
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleRequestReset = async (e: FormEvent) => {
    e.preventDefault();
    if (!email) { setError("Email is required"); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setError("Invalid email address"); return; }

    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${base}/forget-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email, redirectTo: window.location.href }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || "Failed to send reset link");
      }
      setSuccess("Check your email for a password reset link.");
    } catch (err: any) {
      setError(err?.message || "Something went wrong. Please try again.");
    }
    setLoading(false);
  };

  const handleResetPassword = async (e: FormEvent) => {
    e.preventDefault();
    if (!password) { setError("Password is required"); return; }
    if (password.length < 8) { setError("Password must be at least 8 characters"); return; }
    if (password !== confirmPassword) { setError("Passwords do not match"); return; }

    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${base}/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ token, newPassword: password }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || "Failed to reset password");
      }
      setSuccess("Password reset successfully! You can now sign in.");
    } catch (err: any) {
      setError(err?.message || "Something went wrong. Please try again.");
    }
    setLoading(false);
  };

  return (
    <div className={`w-full max-w-md mx-auto ${className}`}>
      <div className="rounded-lg border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950 p-8">
        {/* Header */}
        <div className="text-center mb-6">
          {logo && <div className="flex justify-center mb-4">{logo}</div>}
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">
            {isResetMode ? "Set new password" : "Reset your password"}
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {isResetMode
              ? "Enter your new password below"
              : "Enter your email and we'll send you a reset link"}
          </p>
        </div>

        {/* Messages */}
        {error && (
          <div className="mb-4 flex items-center gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-400">
            <AlertCircle className="h-4 w-4 shrink-0" />{error}
          </div>
        )}
        {success && (
          <div className="mb-4 flex items-center gap-2 rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700 dark:border-green-900 dark:bg-green-950 dark:text-green-400">
            <CheckCircle className="h-4 w-4 shrink-0" />{success}
          </div>
        )}

        {!success && (
          <form onSubmit={isResetMode ? handleResetPassword : handleRequestReset} className="space-y-4">
            {isResetMode ? (
              <>
                {/* New Password */}
                <div>
                  <label htmlFor="reset-password" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    New Password
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <input
                      id="reset-password"
                      type={showPassword ? "text" : "password"}
                      autoComplete="new-password"
                      value={password}
                      onChange={(e) => { setPassword(e.target.value); setError(null); }}
                      placeholder="••••••••"
                      disabled={loading}
                      className="w-full rounded-md border border-slate-300 bg-white pl-10 pr-10 py-2 text-sm outline-none transition-colors placeholder:text-slate-400 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500 disabled:opacity-50"
                    />
                    <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600" tabIndex={-1}>
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
                {/* Confirm Password */}
                <div>
                  <label htmlFor="reset-confirm" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    Confirm Password
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <input
                      id="reset-confirm"
                      type={showPassword ? "text" : "password"}
                      autoComplete="new-password"
                      value={confirmPassword}
                      onChange={(e) => { setConfirmPassword(e.target.value); setError(null); }}
                      placeholder="••••••••"
                      disabled={loading}
                      className="w-full rounded-md border border-slate-300 bg-white pl-10 pr-3 py-2 text-sm outline-none transition-colors placeholder:text-slate-400 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500 disabled:opacity-50"
                    />
                  </div>
                </div>
              </>
            ) : (
              /* Email input */
              <div>
                <label htmlFor="reset-email" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  Email
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <input
                    id="reset-email"
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => { setEmail(e.target.value); setError(null); }}
                    placeholder="you@example.com"
                    disabled={loading}
                    className="w-full rounded-md border border-slate-300 bg-white pl-10 pr-3 py-2 text-sm outline-none transition-colors placeholder:text-slate-400 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500 disabled:opacity-50"
                  />
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-md bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-50 transition-colors dark:focus:ring-offset-slate-950"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {isResetMode ? "Resetting…" : "Sending…"}
                </span>
              ) : isResetMode ? "Reset password" : "Send reset link"}
            </button>
          </form>
        )}

        {/* Back to login */}
        {onBackToLogin && (
          <button
            type="button"
            onClick={onBackToLogin}
            className="mt-6 flex items-center justify-center gap-1.5 w-full text-sm text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300 transition-colors"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to sign in
          </button>
        )}
      </div>
    </div>
  );
}
