import React, { useState, type FormEvent } from "react";
import { Mail, Lock, User, Loader2, AlertCircle, Eye, EyeOff, CheckCircle2 } from "lucide-react";
import { useCorral } from "../context/CorralProvider";

export interface SignUpProps {
  className?: string;
  onSuccess?: () => void;
  redirectAfter?: string;
  onSignInClick?: () => void;
  logo?: React.ReactNode;
  title?: string;
  subtitle?: string;
  termsUrl?: string;
  privacyUrl?: string;
  requireTerms?: boolean;
}

export function SignUp({
  className = "",
  onSuccess,
  redirectAfter,
  onSignInClick,
  logo,
  title = "Create an account",
  subtitle = "Get started for free",
  termsUrl,
  privacyUrl,
  requireTerms = false,
}: SignUpProps) {
  const { signUp, loading: ctxLoading, config } = useCorral();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const tUrl = termsUrl || config.links?.terms;
  const pUrl = privacyUrl || config.links?.privacy;

  const validate = () => {
    const errs: Record<string, string> = {};
    if (!name.trim()) errs.name = "Name is required";
    if (!email) errs.email = "Email is required";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errs.email = "Invalid email";
    if (!password) errs.password = "Password is required";
    else if (password.length < 8) errs.password = "Password must be at least 8 characters";
    if (requireTerms && !termsAccepted) errs.terms = "You must accept the terms";
    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    setError(null);
    setLoading(true);
    const result = await signUp(email, password, name);
    setLoading(false);
    if (result.error) {
      setError(result.error);
    } else {
      setSuccess(true);
      onSuccess?.();
      if (redirectAfter && typeof window !== "undefined") {
        window.location.href = redirectAfter;
      }
    }
  };

  const isLoading = loading || ctxLoading;

  if (success) {
    return (
      <div className={`w-full max-w-md mx-auto ${className}`}>
        <div className="rounded-lg border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950 p-8 text-center">
          <CheckCircle2 className="h-12 w-12 text-green-500 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Account created!</h2>
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
            Check your email to verify your account.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={`w-full max-w-md mx-auto ${className}`}>
      <div className="rounded-lg border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950 p-8">
        <div className="text-center mb-8">
          {logo && <div className="flex justify-center mb-4">{logo}</div>}
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">{title}</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{subtitle}</p>
        </div>

        {error && (
          <div className="mb-4 flex items-center gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-400">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Name */}
          <div>
            <label htmlFor="signup-name" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Name</label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input id="signup-name" type="text" autoComplete="name" value={name}
                onChange={(e) => { setName(e.target.value); setFieldErrors((f) => ({ ...f, name: "" })); }}
                placeholder="John Doe" disabled={isLoading}
                className={`w-full rounded-md border bg-white pl-10 pr-3 py-2 text-sm outline-none transition-colors placeholder:text-slate-400 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 dark:bg-slate-900 dark:text-slate-100 disabled:opacity-50 ${fieldErrors.name ? "border-red-500" : "border-slate-300 dark:border-slate-700"}`}
              />
            </div>
            {fieldErrors.name && <p className="mt-1 text-xs text-red-500">{fieldErrors.name}</p>}
          </div>

          {/* Email */}
          <div>
            <label htmlFor="signup-email" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Email</label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input id="signup-email" type="email" autoComplete="email" value={email}
                onChange={(e) => { setEmail(e.target.value); setFieldErrors((f) => ({ ...f, email: "" })); }}
                placeholder="you@example.com" disabled={isLoading}
                className={`w-full rounded-md border bg-white pl-10 pr-3 py-2 text-sm outline-none transition-colors placeholder:text-slate-400 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 dark:bg-slate-900 dark:text-slate-100 disabled:opacity-50 ${fieldErrors.email ? "border-red-500" : "border-slate-300 dark:border-slate-700"}`}
              />
            </div>
            {fieldErrors.email && <p className="mt-1 text-xs text-red-500">{fieldErrors.email}</p>}
          </div>

          {/* Password */}
          <div>
            <label htmlFor="signup-password" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Password</label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input id="signup-password" type={showPassword ? "text" : "password"} autoComplete="new-password" value={password}
                onChange={(e) => { setPassword(e.target.value); setFieldErrors((f) => ({ ...f, password: "" })); }}
                placeholder="Min. 8 characters" disabled={isLoading}
                className={`w-full rounded-md border bg-white pl-10 pr-10 py-2 text-sm outline-none transition-colors placeholder:text-slate-400 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 dark:bg-slate-900 dark:text-slate-100 disabled:opacity-50 ${fieldErrors.password ? "border-red-500" : "border-slate-300 dark:border-slate-700"}`}
              />
              <button type="button" onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600" tabIndex={-1}>
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {fieldErrors.password && <p className="mt-1 text-xs text-red-500">{fieldErrors.password}</p>}
          </div>

          {/* Terms */}
          {(tUrl || pUrl || requireTerms) && (
            <div>
              <label className="flex items-start gap-2">
                <input type="checkbox" checked={termsAccepted} onChange={(e) => { setTermsAccepted(e.target.checked); setFieldErrors((f) => ({ ...f, terms: "" })); }}
                  className="mt-0.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500" />
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  I agree to the{" "}
                  {tUrl ? <a href={tUrl} target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:underline dark:text-indigo-400">Terms of Service</a> : "Terms of Service"}
                  {pUrl && <> and <a href={pUrl} target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:underline dark:text-indigo-400">Privacy Policy</a></>}
                </span>
              </label>
              {fieldErrors.terms && <p className="mt-1 text-xs text-red-500">{fieldErrors.terms}</p>}
            </div>
          )}

          <button type="submit" disabled={isLoading}
            className="w-full rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-50 transition-colors dark:focus:ring-offset-slate-950">
            {isLoading ? (
              <span className="flex items-center justify-center gap-2"><Loader2 className="h-4 w-4 animate-spin" />Creating account…</span>
            ) : "Create account"}
          </button>
        </form>

        {onSignInClick && (
          <p className="mt-6 text-center text-sm text-slate-500 dark:text-slate-400">
            Already have an account?{" "}
            <button type="button" onClick={onSignInClick} className="font-medium text-indigo-600 hover:text-indigo-500 dark:text-indigo-400">Sign in</button>
          </p>
        )}
      </div>
    </div>
  );
}
