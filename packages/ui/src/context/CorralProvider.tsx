import React, { createContext, useContext, useState, useEffect, useCallback, useRef, type ReactNode } from "react";

// ── Types ──────────────────────────────────────────────────────────────────

export interface CorralUser {
  id: string;
  email: string;
  name?: string;
  image?: string;
  emailVerified?: boolean;
  createdAt?: string;
  role?: string;
}

export interface CorralSubscription {
  id: string;
  planId: string;
  planName: string;
  status: "active" | "trialing" | "past_due" | "canceled" | "incomplete";
  currentPeriodEnd?: string;
  cancelAtPeriodEnd?: boolean;
  trialEnd?: string;
}

export interface CorralMeterUsage {
  meterId: string;
  label: string;
  icon?: string;
  current: number;
  limit: number;
  warningAt?: number; // percentage 0-100
  unit?: string;
  resetsAt?: string;
}

export interface CorralPlan {
  id: string;
  name: string;
  price: number;
  interval: "month" | "year";
  currency?: string;
  features: string[];
  highlighted?: boolean;
  enterprise?: boolean;
  stripePriceId?: string;
}

export interface CorralNudge {
  id: string;
  type: "trial_ending" | "approaching_limit" | "payment_failed" | "upgrade" | "custom";
  title: string;
  message: string;
  style: "banner" | "toast";
  position?: "top" | "bottom" | "top-right" | "bottom-right";
  dismissible?: boolean;
  showOncePer?: "session" | "day" | "week" | "forever";
  ctaLabel?: string;
  ctaAction?: string;
}

export interface CorralConfig {
  plans?: CorralPlan[];
  meters?: Array<{ id: string; label: string; icon?: string; unit?: string; warningAt?: number }>;
  nudges?: CorralNudge[];
  features?: Record<string, string[]>;
  links?: {
    terms?: string;
    privacy?: string;
    support?: string;
  };
  branding?: {
    logo?: string;
    appName?: string;
    primaryColor?: string;
  };
}

export interface CorralSession {
  id: string;
  device?: string;
  ip?: string;
  lastActive?: string;
  current?: boolean;
}

export interface CorralContextValue {
  // Auth state
  user: CorralUser | null;
  session: CorralSession | null;
  loading: boolean;
  error: string | null;

  // Subscription
  subscription: CorralSubscription | null;
  plans: CorralPlan[];

  // Usage
  usage: CorralMeterUsage[];

  // Nudges
  nudges: CorralNudge[];

  // Config
  config: CorralConfig;
  serverUrl: string;

  // Auth actions
  signIn: (email: string, password: string) => Promise<{ error?: string }>;
  signUp: (email: string, password: string, name?: string) => Promise<{ error?: string }>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<{ error?: string }>;

  // Subscription actions
  changePlan: (planId: string) => Promise<{ checkoutUrl?: string; error?: string }>;
  cancelSubscription: (reason?: string) => Promise<{ error?: string }>;

  // Usage actions
  refreshUsage: () => Promise<void>;

  // Session actions
  getSessions: () => Promise<CorralSession[]>;
  revokeSession: (sessionId: string) => Promise<{ error?: string }>;

  // API key actions
  getApiKeys: () => Promise<Array<{ id: string; name: string; key?: string; createdAt: string; lastUsed?: string }>>;
  createApiKey: (name: string) => Promise<{ id: string; key: string } | { error: string }>;
  revokeApiKey: (keyId: string) => Promise<{ error?: string }>;

  // Profile actions
  updateProfile: (data: Partial<Pick<CorralUser, "name" | "image">>) => Promise<{ error?: string }>;
  changePassword: (current: string, newPassword: string) => Promise<{ error?: string }>;
  deleteAccount: () => Promise<{ error?: string }>;
}

// ── Context ────────────────────────────────────────────────────────────────

const CorralContext = createContext<CorralContextValue | null>(null);

export function useCorral(): CorralContextValue {
  const ctx = useContext(CorralContext);
  if (!ctx) {
    // Graceful fallback for standalone testing
    return {
      user: null,
      session: null,
      loading: false,
      error: null,
      subscription: null,
      plans: [],
      usage: [],
      nudges: [],
      config: {},
      serverUrl: "",
      signIn: async () => ({ error: "No CorralProvider" }),
      signUp: async () => ({ error: "No CorralProvider" }),
      signOut: async () => {},
      resetPassword: async () => ({ error: "No CorralProvider" }),
      changePlan: async () => ({ error: "No CorralProvider" }),
      cancelSubscription: async () => ({ error: "No CorralProvider" }),
      refreshUsage: async () => {},
      getSessions: async () => [],
      revokeSession: async () => ({ error: "No CorralProvider" }),
      getApiKeys: async () => [],
      createApiKey: async () => ({ error: "No CorralProvider" }),
      revokeApiKey: async () => ({ error: "No CorralProvider" }),
      updateProfile: async () => ({ error: "No CorralProvider" }),
      changePassword: async () => ({ error: "No CorralProvider" }),
      deleteAccount: async () => ({ error: "No CorralProvider" }),
    };
  }
  return ctx;
}

// ── Provider ───────────────────────────────────────────────────────────────

export interface CorralProviderProps {
  children: ReactNode;
  serverUrl: string;
  config?: CorralConfig;
  /** Pass an existing auth token for SSR or testing */
  initialToken?: string;
}

async function apiFetch(serverUrl: string, path: string, options?: RequestInit) {
  const res = await fetch(`${serverUrl}${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...((options?.headers as Record<string, string>) || {}) },
    ...options,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message || body.error || `Request failed: ${res.status}`);
  }
  return res.json();
}

export function CorralProvider({ children, serverUrl, config = {} }: CorralProviderProps) {
  const [user, setUser] = useState<CorralUser | null>(null);
  const [session, setSession] = useState<CorralSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [subscription, setSubscription] = useState<CorralSubscription | null>(null);
  const [usage, setUsage] = useState<CorralMeterUsage[]>([]);
  const refreshTimerRef = useRef<ReturnType<typeof setInterval>>();

  const plans = config.plans || [];
  const nudges = config.nudges || [];

  // Fetch current session on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await apiFetch(serverUrl, "/get-session");
        if (!cancelled) {
          setUser(data.user || null);
          setSession(data.session || null);
        }
      } catch {
        // Not authenticated
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [serverUrl]);

  // Fetch subscription + usage when user changes
  useEffect(() => {
    if (!user) {
      setSubscription(null);
      setUsage([]);
      return;
    }
    (async () => {
      try {
        const [sub, u] = await Promise.all([
          apiFetch(serverUrl, "/subscription").catch(() => null),
          apiFetch(serverUrl, "/usage").catch(() => ({ meters: [] })),
        ]);
        setSubscription(sub);
        setUsage(u.meters || []);
      } catch { /* ignore */ }
    })();
  }, [user, serverUrl]);

  // Token refresh every 10 minutes
  useEffect(() => {
    refreshTimerRef.current = setInterval(async () => {
      try {
        await apiFetch(serverUrl, "/refresh-session", { method: "POST" });
      } catch { /* ignore */ }
    }, 10 * 60 * 1000);
    return () => clearInterval(refreshTimerRef.current);
  }, [serverUrl]);

  const signIn = useCallback(async (email: string, password: string) => {
    try {
      setLoading(true);
      setError(null);
      const data = await apiFetch(serverUrl, "/sign-in/email", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      setUser(data.user);
      setSession(data.session);
      return {};
    } catch (e: any) {
      const msg = e.message || "Sign in failed";
      setError(msg);
      return { error: msg };
    } finally {
      setLoading(false);
    }
  }, [serverUrl]);

  const signUp = useCallback(async (email: string, password: string, name?: string) => {
    try {
      setLoading(true);
      setError(null);
      const data = await apiFetch(serverUrl, "/sign-up/email", {
        method: "POST",
        body: JSON.stringify({ email, password, name }),
      });
      setUser(data.user);
      setSession(data.session);
      return {};
    } catch (e: any) {
      const msg = e.message || "Sign up failed";
      setError(msg);
      return { error: msg };
    } finally {
      setLoading(false);
    }
  }, [serverUrl]);

  const signOut = useCallback(async () => {
    try {
      // LEARNING: Better Auth sign-out returns empty body — don't parse as JSON
      await fetch(`${serverUrl}/sign-out`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
      });
    } catch { /* ignore */ }
    setUser(null);
    setSession(null);
    setSubscription(null);
    setUsage([]);
  }, [serverUrl]);

  const resetPassword = useCallback(async (email: string) => {
    try {
      await apiFetch(serverUrl, "/forget-password", {
        method: "POST",
        body: JSON.stringify({ email }),
      });
      return {};
    } catch (e: any) {
      return { error: e.message || "Failed to send reset email" };
    }
  }, [serverUrl]);

  const changePlan = useCallback(async (planId: string) => {
    try {
      const data = await apiFetch(serverUrl, "/subscription/change", {
        method: "POST",
        body: JSON.stringify({ planId }),
      });
      if (data.checkoutUrl) return { checkoutUrl: data.checkoutUrl };
      setSubscription(data.subscription || null);
      return {};
    } catch (e: any) {
      return { error: e.message || "Failed to change plan" };
    }
  }, [serverUrl]);

  const cancelSubscription = useCallback(async (reason?: string) => {
    try {
      await apiFetch(serverUrl, "/subscription/cancel", {
        method: "POST",
        body: JSON.stringify({ reason }),
      });
      setSubscription((s) => s ? { ...s, cancelAtPeriodEnd: true } : null);
      return {};
    } catch (e: any) {
      return { error: e.message || "Failed to cancel" };
    }
  }, [serverUrl]);

  const refreshUsage = useCallback(async () => {
    try {
      const data = await apiFetch(serverUrl, "/usage");
      setUsage(data.meters || []);
    } catch { /* ignore */ }
  }, [serverUrl]);

  const getSessions = useCallback(async () => {
    try {
      const data = await apiFetch(serverUrl, "/sessions");
      return data.sessions || [];
    } catch {
      return [];
    }
  }, [serverUrl]);

  const revokeSession = useCallback(async (sessionId: string) => {
    try {
      await apiFetch(serverUrl, `/sessions/${sessionId}`, { method: "DELETE" });
      return {};
    } catch (e: any) {
      return { error: e.message };
    }
  }, [serverUrl]);

  const getApiKeys = useCallback(async () => {
    try {
      const data = await apiFetch(serverUrl, "/api-keys");
      return data.keys || [];
    } catch {
      return [];
    }
  }, [serverUrl]);

  const createApiKey = useCallback(async (name: string) => {
    try {
      return await apiFetch(serverUrl, "/api-keys", {
        method: "POST",
        body: JSON.stringify({ name }),
      });
    } catch (e: any) {
      return { error: e.message };
    }
  }, [serverUrl]);

  const revokeApiKey = useCallback(async (keyId: string) => {
    try {
      await apiFetch(serverUrl, `/api-keys/${keyId}`, { method: "DELETE" });
      return {};
    } catch (e: any) {
      return { error: e.message };
    }
  }, [serverUrl]);

  const updateProfile = useCallback(async (data: Partial<Pick<CorralUser, "name" | "image">>) => {
    try {
      const updated = await apiFetch(serverUrl, "/update-user", {
        method: "POST",
        body: JSON.stringify(data),
      });
      setUser((u) => u ? { ...u, ...updated.user } : null);
      return {};
    } catch (e: any) {
      return { error: e.message };
    }
  }, [serverUrl]);

  const changePassword = useCallback(async (currentPassword: string, newPassword: string) => {
    try {
      await apiFetch(serverUrl, "/change-password", {
        method: "POST",
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      return {};
    } catch (e: any) {
      return { error: e.message };
    }
  }, [serverUrl]);

  const deleteAccount = useCallback(async () => {
    try {
      await apiFetch(serverUrl, "/delete-user", { method: "POST" });
      setUser(null);
      setSession(null);
      return {};
    } catch (e: any) {
      return { error: e.message };
    }
  }, [serverUrl]);

  const value: CorralContextValue = {
    user, session, loading, error,
    subscription, plans, usage, nudges,
    config, serverUrl,
    signIn, signUp, signOut, resetPassword,
    changePlan, cancelSubscription,
    refreshUsage,
    getSessions, revokeSession,
    getApiKeys, createApiKey, revokeApiKey,
    updateProfile, changePassword, deleteAccount,
  };

  return <CorralContext.Provider value={value}>{children}</CorralContext.Provider>;
}
