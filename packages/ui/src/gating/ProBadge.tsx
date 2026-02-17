import React from "react";
import { Lock } from "lucide-react";
import { useFeatureGate } from "./useFeatureGate";

export interface ProBadgeProps {
  show?: boolean;
  feature?: string;
  label?: string;
  size?: "sm" | "md";
  className?: string;
}

export function ProBadge({ show, feature, label = "PRO", size = "sm", className = "" }: ProBadgeProps) {
  const gate = feature ? useFeatureGate(feature) : null;
  const visible = show ?? (gate ? gate.isLocked : false);

  if (!visible) return null;

  const sizeClasses = size === "sm"
    ? "text-[10px] px-1.5 py-0.5 gap-0.5"
    : "text-xs px-2 py-0.5 gap-1";

  return (
    <span
      className={`inline-flex items-center font-semibold rounded-full bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300 ${sizeClasses} ${className}`}
    >
      <Lock className={size === "sm" ? "w-2.5 h-2.5" : "w-3 h-3"} />
      {label}
    </span>
  );
}
