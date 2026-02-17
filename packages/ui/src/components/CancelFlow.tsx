import React, { useState } from "react";
import { AlertTriangle, Check, X, Loader2, Gift, MessageSquare } from "lucide-react";
import { useCorral } from "../context/CorralProvider";

export interface CancelFlowProps {
  className?: string;
  open: boolean;
  onClose: () => void;
  onCanceled?: () => void;
  features?: string[];
  retentionOffer?: {
    discount: number; // percentage
    duration: string; // e.g. "3 months"
    message?: string;
  };
  reasons?: string[];
}

const DEFAULT_REASONS = [
  "Too expensive",
  "Not using it enough",
  "Missing features I need",
  "Found a better alternative",
  "Technical issues",
  "Other",
];

export function CancelFlow({
  className = "",
  open,
  onClose,
  onCanceled,
  features,
  retentionOffer,
  reasons = DEFAULT_REASONS,
}: CancelFlowProps) {
  const { subscription, config, cancelSubscription } = useCorral();
  const [step, setStep] = useState(1);
  const [selectedReason, setSelectedReason] = useState("");
  const [feedback, setFeedback] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const planFeatures = features || config.features?.[subscription?.planId || ""] || [
    "Access to all features",
    "Priority support",
    "Usage limits",
  ];

  const handleCancel = async () => {
    setLoading(true);
    setError(null);
    const result = await cancelSubscription(selectedReason ? `${selectedReason}: ${feedback}` : feedback || undefined);
    setLoading(false);
    if (result.error) {
      setError(result.error);
    } else {
      onCanceled?.();
      onClose();
    }
  };

  const handleClose = () => {
    setStep(1);
    setSelectedReason("");
    setFeedback("");
    setError(null);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={handleClose} />
      <div className={`relative w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-700 dark:bg-slate-950 ${className}`}>
        <button onClick={handleClose} className="absolute right-4 top-4 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">
          <X className="h-5 w-5" />
        </button>

        {/* Step indicators */}
        <div className="flex items-center justify-center gap-2 mb-6">
          {[1, 2, 3].map((s) => (
            <div key={s} className={`h-1.5 w-8 rounded-full transition-colors ${s <= step ? "bg-indigo-600" : "bg-slate-200 dark:bg-slate-700"}`} />
          ))}
        </div>

        {/* Step 1: What you'll lose */}
        {step === 1 && (
          <div>
            <div className="text-center mb-6">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900">
                <AlertTriangle className="h-6 w-6 text-amber-600 dark:text-amber-400" />
              </div>
              <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Before you go…</h2>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Here's what you'll lose with cancellation:</p>
            </div>
            <ul className="space-y-2 mb-6">
              {planFeatures.map((feat, i) => (
                <li key={i} className="flex items-center gap-2 text-sm">
                  <X className="h-4 w-4 text-red-500 shrink-0" />
                  <span className="text-slate-600 dark:text-slate-400 line-through">{feat}</span>
                </li>
              ))}
            </ul>
            <div className="flex gap-3">
              <button onClick={handleClose}
                className="flex-1 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500">
                Keep my plan
              </button>
              <button onClick={() => setStep(retentionOffer ? 2 : 3)}
                className="flex-1 rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800">
                Continue canceling
              </button>
            </div>
          </div>
        )}

        {/* Step 2: Retention offer */}
        {step === 2 && retentionOffer && (
          <div>
            <div className="text-center mb-6">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-green-100 dark:bg-green-900">
                <Gift className="h-6 w-6 text-green-600 dark:text-green-400" />
              </div>
              <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">We'd hate to see you go!</h2>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                {retentionOffer.message || `How about ${retentionOffer.discount}% off for the next ${retentionOffer.duration}?`}
              </p>
            </div>
            <div className="rounded-lg border border-green-200 bg-green-50 p-4 mb-6 text-center dark:border-green-800 dark:bg-green-950">
              <div className="text-2xl font-bold text-green-700 dark:text-green-400">{retentionOffer.discount}% OFF</div>
              <div className="text-sm text-green-600 dark:text-green-500">for {retentionOffer.duration}</div>
            </div>
            <div className="flex gap-3">
              <button onClick={handleClose}
                className="flex-1 rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-500">
                Accept offer
              </button>
              <button onClick={() => setStep(3)}
                className="flex-1 rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800">
                No thanks
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Reason survey + confirm */}
        {step === 3 && (
          <div>
            <div className="text-center mb-6">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800">
                <MessageSquare className="h-6 w-6 text-slate-500 dark:text-slate-400" />
              </div>
              <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Help us improve</h2>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Why are you canceling?</p>
            </div>

            <div className="space-y-2 mb-4">
              {reasons.map((reason) => (
                <label key={reason} className="flex items-center gap-2 rounded-md border border-slate-200 px-3 py-2 cursor-pointer hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800">
                  <input type="radio" name="cancel-reason" value={reason} checked={selectedReason === reason}
                    onChange={() => setSelectedReason(reason)}
                    className="text-indigo-600 focus:ring-indigo-500" />
                  <span className="text-sm text-slate-700 dark:text-slate-300">{reason}</span>
                </label>
              ))}
            </div>

            <textarea
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              placeholder="Any additional feedback? (optional)"
              rows={3}
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm placeholder:text-slate-400 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 mb-4"
            />

            {error && <p className="text-sm text-red-500 mb-4">{error}</p>}

            <div className="flex gap-3">
              <button onClick={handleClose}
                className="flex-1 rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800">
                Keep my plan
              </button>
              <button onClick={handleCancel} disabled={loading}
                className="flex-1 rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-500 disabled:opacity-50">
                {loading ? <span className="flex items-center justify-center gap-2"><Loader2 className="h-4 w-4 animate-spin" />Canceling…</span> : "Cancel subscription"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
