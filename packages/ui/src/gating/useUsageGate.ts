import { useCorral } from "../context/CorralProvider";

export interface UsageGateResult {
  allowed: boolean;
  current: number;
  limit: number;
  remaining: number;
  percentage: number;
  isWarning: boolean;
  isExceeded: boolean;
  resetLabel: string;
}

function formatReset(resetsAt?: string): string {
  if (!resetsAt) return "";
  const diff = new Date(resetsAt).getTime() - Date.now();
  if (diff <= 0) return "Resets soon";
  const hours = Math.floor(diff / 3_600_000);
  if (hours < 1) return "Resets in less than an hour";
  if (hours < 24) return `Resets in ${hours} hour${hours === 1 ? "" : "s"}`;
  const days = Math.ceil(hours / 24);
  if (days === 1) return "Resets tomorrow";
  return `Resets in ${days} days`;
}

export function useUsageGate(meterId: string): UsageGateResult {
  const { usage } = useCorral();
  const meter = usage.find((m) => m.meterId === meterId);

  if (!meter) {
    return { allowed: true, current: 0, limit: Infinity, remaining: Infinity, percentage: 0, isWarning: false, isExceeded: false, resetLabel: "" };
  }

  const { current, limit, warningAt = 80, resetsAt } = meter;
  const percentage = limit > 0 ? Math.min(100, Math.round((current / limit) * 100)) : 0;
  const isExceeded = current >= limit;
  const isWarning = !isExceeded && percentage >= warningAt;

  return {
    allowed: !isExceeded,
    current,
    limit,
    remaining: Math.max(0, limit - current),
    percentage,
    isWarning,
    isExceeded,
    resetLabel: formatReset(resetsAt),
  };
}
