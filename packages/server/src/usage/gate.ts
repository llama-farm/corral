import type { CorralConfig, MeterConfig } from "../config/schema.js";

export interface GateResult {
  allowed: boolean;
  current: number;
  limit: number;
  resetAt: string;
  upgradeUrl?: string;
  meter: MeterConfig;
}

function getCurrentPeriod(resetPeriod: "day" | "month"): string {
  const now = new Date();
  if (resetPeriod === "day") {
    return now.toISOString().slice(0, 10); // YYYY-MM-DD
  }
  return now.toISOString().slice(0, 7); // YYYY-MM
}

function getResetAt(resetPeriod: "day" | "month"): string {
  const now = new Date();
  if (resetPeriod === "day") {
    const tomorrow = new Date(now);
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    tomorrow.setUTCHours(0, 0, 0, 0);
    return tomorrow.toISOString();
  }
  const nextMonth = new Date(now.getUTCFullYear(), now.getUTCMonth() + 1, 1);
  return nextMonth.toISOString();
}

export function createUsageGate(config: CorralConfig, db: any) {
  return async function checkUsage(
    userId: string,
    meter: string,
    quantity: number = 1,
    userPlan: string = "free"
  ): Promise<GateResult> {
    const meterConfig = config.meters[meter];
    if (!meterConfig) {
      throw new Error(`Unknown meter: ${meter}`);
    }

    const limit = meterConfig.limits[userPlan] ?? 0;
    const period = getCurrentPeriod(meterConfig.reset_period);

    // Query current usage for this period
    let current = 0;
    try {
      const result = await db
        .selectFrom("usage_events")
        .select(db.fn.sum("quantity").as("total"))
        .where("user_id", "=", userId)
        .where("meter", "=", meter)
        .where("period", "=", period)
        .executeTakeFirst();
      current = Number(result?.total ?? 0);
    } catch {
      // Table may not exist yet
      current = 0;
    }

    const allowed = meterConfig.type === "flag"
      ? limit > 0
      : current + quantity <= limit;

    return {
      allowed,
      current,
      limit,
      resetAt: getResetAt(meterConfig.reset_period),
      upgradeUrl: `${config.app.domain}/pricing`,
      meter: meterConfig,
    };
  };
}
