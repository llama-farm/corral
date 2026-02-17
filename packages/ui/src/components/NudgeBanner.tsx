import React, { useState, useEffect } from "react";
import { X, AlertTriangle, Clock, CreditCard, ArrowUpCircle, Info } from "lucide-react";
import { useCorral, type CorralNudge } from "../context/CorralProvider";

export interface NudgeBannerProps {
  className?: string;
  nudges?: CorralNudge[];
  onCtaClick?: (nudge: CorralNudge) => void;
}

const NUDGE_ICONS: Record<string, React.ReactNode> = {
  trial_ending: <Clock className="h-4 w-4" />,
  approaching_limit: <AlertTriangle className="h-4 w-4" />,
  payment_failed: <CreditCard className="h-4 w-4" />,
  upgrade: <ArrowUpCircle className="h-4 w-4" />,
  custom: <Info className="h-4 w-4" />,
};

function getDismissKey(nudge: CorralNudge): string {
  return `corral-nudge-dismissed-${nudge.id}`;
}

function isDismissed(nudge: CorralNudge): boolean {
  if (typeof window === "undefined") return false;
  const raw = localStorage.getItem(getDismissKey(nudge));
  if (!raw) return false;
  const { at, per } = JSON.parse(raw);
  const dismissedAt = new Date(at);
  const now = new Date();
  switch (per) {
    case "forever": return true;
    case "session": return false; // Session-based handled by sessionStorage
    case "day": return now.getTime() - dismissedAt.getTime() < 86400000;
    case "week": return now.getTime() - dismissedAt.getTime() < 604800000;
    default: return false;
  }
}

function isSessionDismissed(nudge: CorralNudge): boolean {
  if (typeof window === "undefined") return false;
  if (nudge.showOncePer !== "session") return false;
  return sessionStorage.getItem(getDismissKey(nudge)) === "1";
}

export function NudgeBanner({ className = "", nudges: propNudges, onCtaClick }: NudgeBannerProps) {
  const { nudges: ctxNudges } = useCorral();
  const nudges = propNudges || ctxNudges;
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  useEffect(() => {
    const d = new Set<string>();
    nudges.forEach((n) => {
      if (isDismissed(n) || isSessionDismissed(n)) d.add(n.id);
    });
    setDismissed(d);
  }, [nudges]);

  const handleDismiss = (nudge: CorralNudge) => {
    if (nudge.showOncePer === "session") {
      sessionStorage.setItem(getDismissKey(nudge), "1");
    } else if (nudge.showOncePer) {
      localStorage.setItem(getDismissKey(nudge), JSON.stringify({ at: new Date().toISOString(), per: nudge.showOncePer }));
    }
    setDismissed((prev) => new Set([...prev, nudge.id]));
  };

  const visible = nudges.filter((n) => !dismissed.has(n.id));
  if (!visible.length) return null;

  return (
    <div className={className}>
      {visible.map((nudge) => {
        const isBanner = nudge.style === "banner";
        const isTop = nudge.position === "top" || !nudge.position;

        if (isBanner) {
          return (
            <div
              key={nudge.id}
              className={`w-full px-4 py-2.5 flex items-center justify-center gap-3 text-sm ${
                nudge.type === "payment_failed"
                  ? "bg-red-600 text-white"
                  : nudge.type === "trial_ending"
                  ? "bg-amber-500 text-white"
                  : "bg-indigo-600 text-white"
              }`}
            >
              {NUDGE_ICONS[nudge.type] || NUDGE_ICONS.custom}
              <span>
                <strong>{nudge.title}:</strong> {nudge.message}
              </span>
              {nudge.ctaLabel && (
                <button
                  onClick={() => onCtaClick?.(nudge)}
                  className="ml-2 rounded-md bg-white/20 px-3 py-1 text-xs font-medium hover:bg-white/30 transition-colors"
                >
                  {nudge.ctaLabel}
                </button>
              )}
              {nudge.dismissible !== false && (
                <button onClick={() => handleDismiss(nudge)} className="ml-auto text-white/70 hover:text-white">
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          );
        }

        // Toast style
        return (
          <div
            key={nudge.id}
            className={`fixed z-50 ${
              nudge.position === "bottom-right" ? "bottom-4 right-4" :
              nudge.position === "bottom" ? "bottom-4 right-4" :
              "top-4 right-4"
            } w-80 rounded-lg border border-slate-200 bg-white p-4 shadow-lg dark:border-slate-700 dark:bg-slate-900`}
          >
            <div className="flex items-start gap-3">
              <div className="shrink-0 mt-0.5 text-slate-500 dark:text-slate-400">
                {NUDGE_ICONS[nudge.type] || NUDGE_ICONS.custom}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{nudge.title}</p>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{nudge.message}</p>
                {nudge.ctaLabel && (
                  <button
                    onClick={() => onCtaClick?.(nudge)}
                    className="mt-2 text-xs font-medium text-indigo-600 hover:text-indigo-500 dark:text-indigo-400"
                  >
                    {nudge.ctaLabel} →
                  </button>
                )}
              </div>
              {nudge.dismissible !== false && (
                <button onClick={() => handleDismiss(nudge)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
