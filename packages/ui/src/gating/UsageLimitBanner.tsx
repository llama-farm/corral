import React from "react";
import { AlertTriangle } from "lucide-react";
import { useUsageGate } from "./useUsageGate";
import { useCorral } from "../context/CorralProvider";

export interface UsageLimitBannerProps {
  meterId: string;
  className?: string;
  onUpgrade?: () => void;
}

export function UsageLimitBanner({ meterId, className = "", onUpgrade }: UsageLimitBannerProps) {
  const { current, limit, percentage, isWarning, isExceeded, resetLabel } = useUsageGate(meterId);
  const { usage } = useCorral();
  const meter = usage.find((m) => m.meterId === meterId);
  const unit = meter?.unit ?? "requests";

  // Hidden when normal
  if (!isWarning && !isExceeded) return null;

  const barColor = isExceeded
    ? "bg-red-500"
    : "bg-amber-400";

  const borderColor = isExceeded
    ? "border-red-200 dark:border-red-900/50"
    : "border-amber-200 dark:border-amber-900/50";

  const bgColor = isExceeded
    ? "bg-red-50 dark:bg-red-950/30"
    : "bg-amber-50 dark:bg-amber-950/30";

  const textColor = isExceeded
    ? "text-red-700 dark:text-red-400"
    : "text-amber-700 dark:text-amber-400";

  return (
    <div className={`rounded-lg border ${borderColor} ${bgColor} p-3 space-y-2 ${className}`}>
      <div className="flex items-center gap-2">
        <AlertTriangle className={`w-4 h-4 shrink-0 ${textColor}`} />
        <span className={`text-sm font-medium ${textColor}`}>
          You've used {current} of {limit} {unit}
        </span>
        {resetLabel && (
          <span className="text-xs text-zinc-500 dark:text-zinc-400 ml-auto">{resetLabel}</span>
        )}
      </div>

      {/* Progress bar */}
      <div className="h-1.5 rounded-full bg-zinc-200 dark:bg-zinc-700 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${barColor}`}
          style={{ width: `${Math.min(100, percentage)}%` }}
        />
      </div>

      {isExceeded && onUpgrade && (
        <button
          onClick={onUpgrade}
          className="text-xs font-medium text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 underline underline-offset-2"
        >
          Upgrade for more {unit}
        </button>
      )}
    </div>
  );
}
