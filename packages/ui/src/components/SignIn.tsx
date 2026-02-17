import React, { useState, type FormEvent } from "react";
import { Mail, Lock, Loader2, AlertCircle, Eye, EyeOff, Wand2, KeyRound } from "lucide-react";
import { useCorral } from "../context/CorralProvider";

// ── Social Provider Icons (inline SVGs for zero deps) ──────────────

const SocialIcons: Record<string, React.ReactNode> = {
  google: <svg viewBox="0 0 24 24" className="w-4 h-4"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>,
  github: <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z"/></svg>,
  apple: <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current"><path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/></svg>,
  discord: <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current"><path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03z"/></svg>,
  microsoft: <svg viewBox="0 0 24 24" className="w-4 h-4"><rect x="1" y="1" width="10" height="10" fill="#F25022"/><rect x="13" y="1" width="10" height="10" fill="#7FBA00"/><rect x="1" y="13" width="10" height="10" fill="#00A4EF"/><rect x="13" y="13" width="10" height="10" fill="#FFB900"/></svg>,
  twitter: <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>,
  facebook: <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>,
  gitlab: <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current"><path d="m23.6 9.8.1.3-3.4 8.8-2.3-7h-11.8l-2.3 7-3.4-8.8.1-.3L12 22.7z" fill="#E24329"/></svg>,
  linkedin: <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>,
};

const ProviderNames: Record<string, string> = {
  google: "Google", github: "GitHub", apple: "Apple", discord: "Discord",
  microsoft: "Microsoft", twitter: "X", facebook: "Facebook", gitlab: "GitLab", linkedin: "LinkedIn",
};

export interface SignInProps {
  className?: string;
  onSuccess?: () => void;
  redirectAfter?: string;
  /** Social providers to show. Default: reads from CorralProvider config. Pass explicitly to override. */
  socialProviders?: string[];
  /** Enable magic link tab */
  showMagicLink?: boolean;
  /** Enable email OTP tab */
  showEmailOTP?: boolean;
  onForgotPassword?: () => void;
  onSignUpClick?: () => void;
  logo?: React.ReactNode;
  title?: string;
  subtitle?: string;
}

type AuthMode = "password" | "magic-link" | "email-otp";

export function SignIn({
  className = "",
  onSuccess,
  redirectAfter,
  socialProviders: socialProvidersProp,
  showMagicLink = false,
  showEmailOTP = false,
  onForgotPassword,
  onSignUpClick,
  logo,
  title = "Welcome back",
  subtitle = "Sign in to your account",
}: SignInProps) {
  const ctx = useCorral();
  const { signIn, loading: ctxLoading, config } = ctx;
  const [mode, setMode] = useState<AuthMode>("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({});

  // Detect enabled social providers from config or props
  const socialProviders = socialProvidersProp || (config as any)?.socialProviders || [];
  const hasSocial = socialProviders.length > 0;
  const hasPasswordless = showMagicLink || showEmailOTP;
  const modes: AuthMode[] = ["password", ...(showMagicLink ? ["magic-link" as const] : []), ...(showEmailOTP ? ["email-otp" as const] : [])];

  const validate = () => {
    const errs: typeof fieldErrors = {};
    if (!email) errs.email = "Email is required";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errs.email = "Invalid email";
    if (mode === "password" && !password) errs.password = "Password is required";
    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    setError(null);
    setSuccess(null);
    setLoading(true);

    try {
      if (mode === "password") {
        const result = await signIn(email, password);
        if (result.error) { setError(result.error); }
        else { onSuccess?.(); if (redirectAfter) window.location.href = redirectAfter; }
      } else if (mode === "magic-link") {
        const res = await fetch((config as any)?.serverUrl || "/api/auth" + "/sign-in/magic-link", {
          method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include",
          body: JSON.stringify({ email, callbackURL: redirectAfter || "/" }),
        });
        if (res.ok) { setSuccess("Check your email for a sign-in link!"); }
        else { setError("Failed to send magic link. Try again."); }
      } else if (mode === "email-otp") {
        const res = await fetch((config as any)?.serverUrl || "/api/auth" + "/sign-in/email-otp", {
          method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include",
          body: JSON.stringify({ email }),
        });
        if (res.ok) { setSuccess("Check your email for a verification code!"); }
        else { setError("Failed to send code. Try again."); }
      }
    } catch {
      setError("Something went wrong. Please try again.");
    }
    setLoading(false);
  };

  const handleSocialSignIn = (provider: string) => {
    const serverUrl = (config as any)?.serverUrl || "/api/auth";
    const callbackURL = encodeURIComponent(redirectAfter || "/");
    window.location.href = `${serverUrl}/sign-in/social?provider=${provider}&callbackURL=${callbackURL}`;
  };

  const isLoading = loading || ctxLoading;

  return (
    <div className={`w-full max-w-md mx-auto ${className}`}>
      <div className="rounded-lg border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950 p-8">
        {/* Header */}
        <div className="text-center mb-6">
          {logo && <div className="flex justify-center mb-4">{logo}</div>}
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">{title}</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{subtitle}</p>
        </div>

        {/* Social Providers */}
        {hasSocial && (
          <>
            <div className={`grid ${socialProviders.length === 1 ? "grid-cols-1" : socialProviders.length === 2 ? "grid-cols-2" : "grid-cols-3"} gap-2 mb-4`}>
              {socialProviders.map((provider: string) => (
                <button
                  key={provider}
                  type="button"
                  onClick={() => handleSocialSignIn(provider)}
                  className="flex items-center justify-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2.5 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 transition-colors dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  {SocialIcons[provider] || null}
                  {socialProviders.length <= 3 ? (ProviderNames[provider] || provider) : null}
                </button>
              ))}
            </div>
            <div className="relative my-4">
              <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-slate-200 dark:border-slate-800" /></div>
              <div className="relative flex justify-center text-xs"><span className="bg-white px-2 text-slate-500 dark:bg-slate-950 dark:text-slate-400">Or continue with</span></div>
            </div>
          </>
        )}

        {/* Mode tabs (if multiple auth methods) */}
        {modes.length > 1 && (
          <div className="flex gap-1 mb-4 p-1 bg-slate-100 dark:bg-slate-900 rounded-lg">
            {modes.map((m) => (
              <button key={m} type="button" onClick={() => { setMode(m); setError(null); setSuccess(null); }}
                className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-md text-xs font-medium transition-colors ${
                  mode === m ? "bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm" : "text-slate-500 dark:text-slate-400 hover:text-slate-700"
                }`}
              >
                {m === "password" && <><Lock className="w-3 h-3" /> Password</>}
                {m === "magic-link" && <><Wand2 className="w-3 h-3" /> Magic Link</>}
                {m === "email-otp" && <><KeyRound className="w-3 h-3" /> Email Code</>}
              </button>
            ))}
          </div>
        )}

        {/* Messages */}
        {error && (
          <div className="mb-4 flex items-center gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-400">
            <AlertCircle className="h-4 w-4 shrink-0" />{error}
          </div>
        )}
        {success && (
          <div className="mb-4 flex items-center gap-2 rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700 dark:border-green-900 dark:bg-green-950 dark:text-green-400">
            <Mail className="h-4 w-4 shrink-0" />{success}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Email (all modes) */}
          <div>
            <label htmlFor="signin-email" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Email</label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input id="signin-email" type="email" autoComplete="email" value={email}
                onChange={(e) => { setEmail(e.target.value); setFieldErrors((f) => ({ ...f, email: undefined })); }}
                placeholder="you@example.com" disabled={isLoading}
                className={`w-full rounded-md border bg-white pl-10 pr-3 py-2 text-sm outline-none transition-colors placeholder:text-slate-400 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500 disabled:opacity-50 ${fieldErrors.email ? "border-red-500" : "border-slate-300 dark:border-slate-700"}`}
              />
            </div>
            {fieldErrors.email && <p className="mt-1 text-xs text-red-500">{fieldErrors.email}</p>}
          </div>

          {/* Password (password mode only) */}
          {mode === "password" && (
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label htmlFor="signin-password" className="block text-sm font-medium text-slate-700 dark:text-slate-300">Password</label>
                {onForgotPassword && (
                  <button type="button" onClick={onForgotPassword} className="text-xs text-indigo-600 hover:text-indigo-500 dark:text-indigo-400">Forgot password?</button>
                )}
              </div>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <input id="signin-password" type={showPassword ? "text" : "password"} autoComplete="current-password" value={password}
                  onChange={(e) => { setPassword(e.target.value); setFieldErrors((f) => ({ ...f, password: undefined })); }}
                  placeholder="••••••••" disabled={isLoading}
                  className={`w-full rounded-md border bg-white pl-10 pr-10 py-2 text-sm outline-none transition-colors placeholder:text-slate-400 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500 disabled:opacity-50 ${fieldErrors.password ? "border-red-500" : "border-slate-300 dark:border-slate-700"}`}
                />
                <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600" tabIndex={-1}>
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {fieldErrors.password && <p className="mt-1 text-xs text-red-500">{fieldErrors.password}</p>}
            </div>
          )}

          {/* Submit */}
          <button type="submit" disabled={isLoading}
            className="w-full rounded-md bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-50 transition-colors dark:focus:ring-offset-slate-950"
          >
            {isLoading ? (
              <span className="flex items-center justify-center gap-2"><Loader2 className="h-4 w-4 animate-spin" />Signing in…</span>
            ) : mode === "password" ? "Sign in" : mode === "magic-link" ? "Send magic link" : "Send code"}
          </button>
        </form>

        {/* Footer */}
        {onSignUpClick && (
          <p className="mt-6 text-center text-sm text-slate-500 dark:text-slate-400">
            Don&apos;t have an account?{" "}
            <button type="button" onClick={onSignUpClick} className="font-medium text-indigo-600 hover:text-indigo-500 dark:text-indigo-400">Sign up</button>
          </p>
        )}
      </div>
    </div>
  );
}
