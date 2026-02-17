/**
 * useAuthGate — Hook that checks if the user is authenticated.
 * Returns helpers to gate actions behind login.
 *
 * Usage:
 *   const { isAuthenticated, requireAuth } = useAuthGate();
 *   <button onClick={() => requireAuth(() => saveDocument())}>Save</button>
 *
 * When requireAuth is called and user isn't logged in, it triggers
 * the onAuthRequired callback (default: redirect to login).
 */

import { useCallback } from "react";

// Try to import from context — graceful fallback if no provider
let useCorral: () => any;
try {
  useCorral = require("../context/CorralProvider").useCorral;
} catch {
  useCorral = () => ({});
}

export interface AuthGateResult {
  /** Whether the user is currently authenticated */
  isAuthenticated: boolean;
  /** The current user (or null) */
  user: any | null;
  /** Wrap an action — if not authed, triggers login prompt instead */
  requireAuth: (action: () => void, reason?: string) => void;
  /** Gate a value — returns the value if authed, fallback otherwise */
  gateValue: <T>(value: T, fallback: T) => T;
}

export interface UseAuthGateOptions {
  /** Custom handler when auth is required. Default: redirect to /login */
  onAuthRequired?: (reason?: string) => void;
  /** Login URL to redirect to. Default: /login */
  loginUrl?: string;
  /** Include return URL so user comes back after login */
  returnTo?: boolean;
}

export function useAuthGate(options: UseAuthGateOptions = {}): AuthGateResult {
  const { loginUrl = "/login", returnTo = true } = options;
  const ctx = useCorral();
  const user = ctx?.user ?? null;
  const isAuthenticated = !!user;

  const onAuthRequired = useCallback(
    (reason?: string) => {
      if (options.onAuthRequired) {
        options.onAuthRequired(reason);
        return;
      }
      // Default: redirect to login with return URL
      const returnUrl = returnTo && typeof window !== "undefined" ? window.location.pathname + window.location.search : "";
      const url = returnUrl ? `${loginUrl}?returnTo=${encodeURIComponent(returnUrl)}${reason ? `&reason=${encodeURIComponent(reason)}` : ""}` : loginUrl;
      if (typeof window !== "undefined") {
        window.location.href = url;
      }
    },
    [loginUrl, returnTo, options.onAuthRequired]
  );

  const requireAuth = useCallback(
    (action: () => void, reason?: string) => {
      if (isAuthenticated) {
        action();
      } else {
        onAuthRequired(reason);
      }
    },
    [isAuthenticated, onAuthRequired]
  );

  const gateValue = useCallback(
    <T,>(value: T, fallback: T): T => {
      return isAuthenticated ? value : fallback;
    },
    [isAuthenticated]
  );

  return { isAuthenticated, user, requireAuth, gateValue };
}
