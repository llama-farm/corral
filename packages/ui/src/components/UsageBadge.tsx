import React from "react";
import { useCorral, type CorralMeterUsage } from "../context/CorralProvider";

export interface UsageBadgeProps {
  className?: string;
  meterId?: string;
  meter?: CorralMeterUsage;
}

export function UsageBadge({ className = "", meterId, meter: propMeter }: UsageBadgeProps) {
  const { usage } = useCorral();
  const meter = propMeter || (meterId ? usage.find((m) => m.meterId === meterId) : usage[0]);

  if (!meter) return null;

  const pct = meter.limit > 0 ? (meter.current / meter.limit) * 100 : 0;
  const warningAt = meter.warningAt ?? 80;

  let colorClasses: string;
  if (pct >= 100) colorClasses = "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300";
  else if (pct >= warningAt) colorClasses = "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300";
  else colorClasses = "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300";

  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${colorClasses} ${className}`}>
      {meter.icon && <span>{meter.icon}</span>}
      {meter.current}/{meter.limit}
    </span>
  );
}
