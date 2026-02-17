import React, { useState, useCallback } from "react";
import { X, Loader2, AlertCircle, CreditCard } from "lucide-react";
import { useCorral } from "../context/CorralProvider";

// ── Types ───────────────────────────────────────────────────────────

export interface CheckoutModalProps {
  isOpen: boolean;
  onClose: () => void;
  planId: string;
  planName?: string;
  clientSecret?: string;
  onSuccess?: () => void;
  className?: string;
}

// ── useCheckout hook ────────────────────────────────────────────────

export function useCheckout(serverUrl?: string) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const checkout = useCallback(
    async (
      planId: string,
      options?: { successUrl?: string; cancelUrl?: string }
    ) => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(
          `${serverUrl || "/api/auth"}/subscription/upgrade`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({
              plan: planId,
              ...options,
              disableRedirect: true,
            }),
          }
        );
        if (!res.ok) {
          const msg = await res.text().catch(() => "Checkout failed");
          throw new Error(msg);
        }
        const data = await res.json();
        return {
          clientSecret: data.clientSecret as string | undefined,
          sessionId: data.id as string | undefined,
          url: data.url as string | undefined,
        };
      } catch (err: any) {
        setError(err?.message || "Failed to create checkout session");
        return { clientSecret: undefined, sessionId: undefined, url: undefined };
      } finally {
        setLoading(false);
      }
    },
    [serverUrl]
  );

  return { checkout, loading, error };
}

// ── Stripe lazy loader ──────────────────────────────────────────────

let stripeModuleCache: any = null;

function useStripeModule() {
  const [mod, setMod] = React.useState<any>(stripeModuleCache);
  const [failed, setFailed] = React.useState(false);

  React.useEffect(() => {
    if (stripeModuleCache) return;
    import("@stripe/react-stripe-js")
      .then((m) => {
        stripeModuleCache = m;
        setMod(m);
      })
      .catch(() => setFailed(true));
  }, []);

  return { mod, failed };
}

// ── CheckoutModal ───────────────────────────────────────────────────

export function CheckoutModal({
  isOpen,
  onClose,
  planId,
  planName,
  clientSecret,
  onSuccess,
  className = "",
}: CheckoutModalProps) {
  const { mod: stripeMod, failed: stripeFailed } = useStripeModule();

  if (!isOpen) return null;

  const handleComplete = () => {
    onSuccess?.();
    onClose();
  };

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center ${className}`}
      role="dialog"
      aria-modal="true"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Container */}
      <div className="relative w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-xl dark:border-slate-800 dark:bg-slate-950">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 px-6 py-4">
          <div className="flex items-center gap-2">
            <CreditCard className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              {planName ? `Upgrade to ${planName}` : "Checkout"}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:text-slate-300 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6">
          {stripeFailed ? (
            <div className="flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-400">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>
                Stripe library not available. Install{" "}
                <code className="font-mono text-xs bg-amber-100 dark:bg-amber-900 px-1 py-0.5 rounded">
                  @stripe/react-stripe-js
                </code>{" "}
                and{" "}
                <code className="font-mono text-xs bg-amber-100 dark:bg-amber-900 px-1 py-0.5 rounded">
                  @stripe/stripe-js
                </code>{" "}
                to enable embedded checkout.
              </span>
            </div>
          ) : !clientSecret ? (
            <div className="flex flex-col items-center justify-center py-12 text-slate-500 dark:text-slate-400">
              <Loader2 className="h-8 w-8 animate-spin mb-3" />
              <p className="text-sm">Preparing checkout…</p>
            </div>
          ) : !stripeMod ? (
            <div className="flex flex-col items-center justify-center py-12 text-slate-500 dark:text-slate-400">
              <Loader2 className="h-8 w-8 animate-spin mb-3" />
              <p className="text-sm">Loading payment form…</p>
            </div>
          ) : (
            <EmbeddedCheckoutWrapper
              stripeMod={stripeMod}
              clientSecret={clientSecret}
              onComplete={handleComplete}
            />
          )}
        </div>
      </div>
    </div>
  );
}

// ── Internal wrapper to render Stripe Embedded Checkout ─────────────

function EmbeddedCheckoutWrapper({
  stripeMod,
  clientSecret,
  onComplete,
}: {
  stripeMod: any;
  clientSecret: string;
  onComplete: () => void;
}) {
  const { EmbeddedCheckoutProvider, EmbeddedCheckout } = stripeMod;

  return (
    <EmbeddedCheckoutProvider
      stripe={null as any} // Consumer must wrap with stripe instance at app level
      options={{ clientSecret, onComplete }}
    >
      <EmbeddedCheckout />
    </EmbeddedCheckoutProvider>
  );
}
