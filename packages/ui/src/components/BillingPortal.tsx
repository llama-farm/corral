import React, { useState, useEffect } from "react";
import {
  CreditCard,
  Calendar,
  Receipt,
  ArrowUpRight,
  AlertCircle,
  Loader2,
  XCircle,
  CheckCircle,
  ExternalLink,
} from "lucide-react";
import { useCorral } from "../context/CorralProvider";

// ── Types ───────────────────────────────────────────────────────────

export interface BillingPortalProps {
  onChangePlan?: (planId: string) => void;
  onCancel?: () => void;
  className?: string;
}

interface Invoice {
  id: string;
  date: string;
  amount: string;
  status: string;
  url?: string;
}

// ── BillingPortal ───────────────────────────────────────────────────

export function BillingPortal({
  onChangePlan,
  onCancel,
  className = "",
}: BillingPortalProps) {
  const ctx = useCorral();
  const { user, config } = ctx;
  const subscription = (ctx as any).subscription as any | undefined;
  const serverUrl = (config as any)?.serverUrl || "/api/auth";

  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loadingInvoices, setLoadingInvoices] = useState(false);
  const [cancelConfirm, setCancelConfirm] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Fetch invoices on mount
  useEffect(() => {
    setLoadingInvoices(true);
    fetch(`${serverUrl}/subscription/invoices`, {
      credentials: "include",
    })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data) => setInvoices((data.invoices || data || []).slice(0, 5)))
      .catch(() => {}) // silently fail — invoices are optional
      .finally(() => setLoadingInvoices(false));
  }, [serverUrl]);

  const handleUpdatePayment = async () => {
    try {
      const res = await fetch(`${serverUrl}/subscription/portal`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ returnUrl: window.location.href }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      if (data.url) window.location.href = data.url;
    } catch {
      setError("Failed to open payment portal. Please try again.");
    }
  };

  const handleCancel = async () => {
    setCancelling(true);
    setError(null);
    try {
      const res = await fetch(`${serverUrl}/subscription/cancel`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
      });
      if (!res.ok) throw new Error();
      setSuccess("Subscription cancelled. You'll retain access until the end of your billing period.");
      setCancelConfirm(false);
      onCancel?.();
    } catch {
      setError("Failed to cancel subscription. Please try again.");
    }
    setCancelling(false);
  };

  const plan = subscription?.plan || (ctx as any).plan;
  const planName = plan?.name || subscription?.planName || "Free";
  const planPrice = plan?.price || subscription?.price;
  const nextBilling = subscription?.currentPeriodEnd || subscription?.nextBillingDate;

  return (
    <div className={`w-full max-w-lg mx-auto ${className}`}>
      <div className="rounded-lg border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <Receipt className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
            Billing & Subscription
          </h2>
        </div>

        <div className="p-6 space-y-6">
          {/* Messages */}
          {error && (
            <div className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-400">
              <AlertCircle className="h-4 w-4 shrink-0" />{error}
            </div>
          )}
          {success && (
            <div className="flex items-center gap-2 rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700 dark:border-green-900 dark:bg-green-950 dark:text-green-400">
              <CheckCircle className="h-4 w-4 shrink-0" />{success}
            </div>
          )}

          {/* Current Plan */}
          <div className="rounded-md border border-slate-200 dark:border-slate-800 p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500 dark:text-slate-400">Current Plan</p>
                <p className="text-xl font-semibold text-slate-900 dark:text-slate-100 mt-0.5">
                  {planName}
                </p>
                {planPrice && (
                  <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                    {typeof planPrice === "number" ? `$${(planPrice / 100).toFixed(2)}/mo` : planPrice}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center rounded-full bg-indigo-50 dark:bg-indigo-950 px-2.5 py-0.5 text-xs font-medium text-indigo-700 dark:text-indigo-300">
                  {subscription?.status === "active" ? "Active" : subscription?.status || "Active"}
                </span>
              </div>
            </div>

            {nextBilling && (
              <div className="mt-3 flex items-center gap-1.5 text-sm text-slate-500 dark:text-slate-400">
                <Calendar className="h-3.5 w-3.5" />
                Next billing: {new Date(nextBilling).toLocaleDateString()}
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {onChangePlan && (
              <button
                type="button"
                onClick={() => onChangePlan(plan?.id || "")}
                className="flex items-center justify-center gap-2 rounded-md border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 transition-colors dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                <ArrowUpRight className="h-4 w-4" />
                Change Plan
              </button>
            )}
            <button
              type="button"
              onClick={handleUpdatePayment}
              className="flex items-center justify-center gap-2 rounded-md border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 transition-colors dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              <CreditCard className="h-4 w-4" />
              Update Payment
            </button>
          </div>

          {/* Cancel */}
          {!cancelConfirm ? (
            <button
              type="button"
              onClick={() => setCancelConfirm(true)}
              className="w-full text-sm text-slate-400 hover:text-red-500 dark:text-slate-500 dark:hover:text-red-400 transition-colors"
            >
              Cancel subscription
            </button>
          ) : (
            <div className="rounded-md border border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950 p-4">
              <p className="text-sm text-red-700 dark:text-red-400 mb-3">
                Are you sure? You'll lose access to premium features at the end of your billing period.
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleCancel}
                  disabled={cancelling}
                  className="flex-1 rounded-md bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-500 disabled:opacity-50 transition-colors"
                >
                  {cancelling ? (
                    <span className="flex items-center justify-center gap-1.5">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" /> Cancelling…
                    </span>
                  ) : "Yes, cancel"}
                </button>
                <button
                  type="button"
                  onClick={() => setCancelConfirm(false)}
                  className="flex-1 rounded-md border border-slate-300 dark:border-slate-700 px-3 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                >
                  Keep plan
                </button>
              </div>
            </div>
          )}

          {/* Invoices */}
          <div>
            <h3 className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-3">
              Recent Invoices
            </h3>
            {loadingInvoices ? (
              <div className="flex items-center justify-center py-4 text-slate-400">
                <Loader2 className="h-5 w-5 animate-spin" />
              </div>
            ) : invoices.length === 0 ? (
              <p className="text-sm text-slate-400 dark:text-slate-500 text-center py-4">
                No invoices yet
              </p>
            ) : (
              <div className="space-y-2">
                {invoices.map((inv) => (
                  <div
                    key={inv.id}
                    className="flex items-center justify-between rounded-md border border-slate-200 dark:border-slate-800 px-3 py-2"
                  >
                    <div className="flex items-center gap-3">
                      <Receipt className="h-4 w-4 text-slate-400" />
                      <div>
                        <p className="text-sm text-slate-700 dark:text-slate-300">
                          {inv.amount}
                        </p>
                        <p className="text-xs text-slate-400 dark:text-slate-500">
                          {new Date(inv.date).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span
                        className={`text-xs font-medium ${
                          inv.status === "paid"
                            ? "text-green-600 dark:text-green-400"
                            : "text-slate-500"
                        }`}
                      >
                        {inv.status}
                      </span>
                      {inv.url && (
                        <a
                          href={inv.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-slate-400 hover:text-indigo-500 transition-colors"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
