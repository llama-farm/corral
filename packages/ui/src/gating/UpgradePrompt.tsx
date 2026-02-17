import React from "react";
import { Shield, ArrowRight, Star, Check } from "lucide-react";

export interface UpgradePromptProps {
  feature?: string;
  title: string;
  description: string;
  icon?: React.ReactNode;
  bullets?: string[];
  planId?: string;
  planName?: string;
  price?: number;
  interval?: string;
  trialDays?: number;
  onUpgrade?: () => void;
  className?: string;
}

export function UpgradePrompt({
  title,
  description,
  icon,
  bullets,
  planName,
  price,
  interval = "mo",
  trialDays,
  onUpgrade,
  className = "",
}: UpgradePromptProps) {
  const ctaText = trialDays
    ? `Start ${trialDays}-day free trial`
    : planName && price != null
      ? `Upgrade to ${planName} — $${price}/${interval}`
      : "Upgrade";

  const subText = trialDays && planName && price != null
    ? `${planName} plan · $${price}/${interval} after trial · Cancel anytime`
    : planName
      ? `${planName} plan · Cancel anytime`
      : undefined;

  return (
    <div className={`rounded-xl border border-zinc-200 dark:border-zinc-700 overflow-hidden ${className}`}>
      {/* Header */}
      <div className="bg-gradient-to-r from-indigo-500 to-purple-600 px-5 py-4 flex items-center gap-3">
        <div className="text-white/90">{icon ?? <Star className="w-5 h-5" />}</div>
        <div className="flex-1">
          <h3 className="text-white font-semibold text-sm">{title}</h3>
        </div>
        {planName && (
          <span className="text-xs font-medium bg-white/20 text-white px-2 py-0.5 rounded-full">
            {planName}
          </span>
        )}
      </div>

      {/* Body */}
      <div className="px-5 py-4 bg-white dark:bg-zinc-900 space-y-3">
        <p className="text-sm text-zinc-600 dark:text-zinc-400">{description}</p>

        {bullets && bullets.length > 0 && (
          <ul className="space-y-1.5">
            {bullets.map((b, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-zinc-700 dark:text-zinc-300">
                <Check className="w-4 h-4 text-indigo-500 mt-0.5 shrink-0" />
                <span>{b}</span>
              </li>
            ))}
          </ul>
        )}

        <button
          onClick={onUpgrade}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium transition-colors"
        >
          <Shield className="w-4 h-4" />
          {ctaText}
          <ArrowRight className="w-4 h-4" />
        </button>

        {subText && (
          <p className="text-xs text-center text-zinc-400 dark:text-zinc-500">{subText}</p>
        )}
      </div>
    </div>
  );
}
