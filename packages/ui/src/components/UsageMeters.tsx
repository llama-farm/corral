import React from "react";
import { AlertTriangle, ArrowUpCircle } from "lucide-react";
import { useCorral, type CorralMeterUsage } from "../context/CorralProvider";

export interface UsageMetersProps {
  className?: string;
  meters?: CorralMeterUsage[];
  compact?: boolean;
  onUpgrade?: () => void;
}

function formatResetDate(dateStr?: string): string {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = d.getTime() - now.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays <= 0) return "Resets soon";
  if (diffDays === 1) return "Resets tomorrow";
  if (diffDays <= 7) return `Resets in ${diffDays} days`;
  return `Resets ${d.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
}

function getBarColor(pct: number, warningAt: number): string {
  if (pct >= 100) return "bg-red-500";
  if (pct >= warningAt) return "bg-amber-500";
  return "bg-green-500";
}

function getTextColor(pct: number, warningAt: number): string {
  if (pct >= 100) return "text-red-600 dark:text-red-400";
  if (pct >= warningAt) return "text-amber-600 dark:text-amber-400";
  return "text-slate-600 dark:text-slate-400";
}

export function UsageMeters({ className = "", meters: propMeters, compact = false, onUpgrade }: UsageMetersProps) {
  const { usage } = useCorral();
  const meters = propMeters || usage;

  if (!meters.length) {
    return (
      <div className={`text-sm text-slate-500 dark:text-slate-400 ${className}`}>
        No usage data available.
      </div>
    );
  }

  return (
    <div className={`space-y-${compact ? "2" : "4"} ${className}`}>
      {meters.map((meter) => {
        const pct = meter.limit > 0 ? Math.min((meter.current / meter.limit) * 100, 100) : 0;
        const warningAt = meter.warningAt ?? 80;
        const atLimit = pct >= 100;
        const unit = meter.unit || "units";

        return (
          <div key={meter.meterId} className={compact ? "" : "rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-950"}>
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-2">
                {meter.icon && <span className="text-base">{meter.icon}</span>}
                <span className={`font-medium ${compact ? "text-xs" : "text-sm"} text-slate-700 dark:text-slate-300`}>
                  {meter.label}
                </span>
              </div>
              <span className={`${compact ? "text-xs" : "text-sm"} font-medium ${getTextColor(pct, warningAt)}`}>
                {meter.current.toLocaleString()} / {meter.limit.toLocaleString()} {unit}
              </span>
            </div>

            {/* Progress bar */}
            <div className={`w-full rounded-full bg-slate-100 dark:bg-slate-800 ${compact ? "h-1.5" : "h-2"}`}>
              <div
                className={`rounded-full transition-all duration-500 ${compact ? "h-1.5" : "h-2"} ${getBarColor(pct, warningAt)}`}
                style={{ width: `${Math.max(pct, 1)}%` }}
              />
            </div>

            {!compact && (
              <div className="flex items-center justify-between mt-1.5">
                <span className="text-xs text-slate-400">{formatResetDate(meter.resetsAt)}</span>
                {atLimit && onUpgrade && (
                  <button
                    onClick={onUpgrade}
                    className="flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-500 dark:text-indigo-400"
                  >
                    <ArrowUpCircle className="h-3.5 w-3.5" /> Upgrade for more
                  </button>
                )}
                {atLimit && !onUpgrade && (
                  <span className="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400">
                    <AlertTriangle className="h-3.5 w-3.5" /> Limit reached
                  </span>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
