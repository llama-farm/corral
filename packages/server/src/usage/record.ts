import type { CorralConfig } from "../config/schema.js";

function getCurrentPeriod(resetPeriod: "day" | "month"): string {
  const now = new Date();
  if (resetPeriod === "day") return now.toISOString().slice(0, 10);
  return now.toISOString().slice(0, 7);
}

export function createUsageRecorder(config: CorralConfig, db: any, stripeClient?: any) {
  return async function recordUsage(
    userId: string,
    meter: string,
    quantity: number = 1,
    metadata?: Record<string, any>
  ): Promise<void> {
    const meterConfig = config.meters[meter];
    if (!meterConfig) throw new Error(`Unknown meter: ${meter}`);

    const period = getCurrentPeriod(meterConfig.reset_period);

    // Local DB write
    await db
      .insertInto("usage_events")
      .values({
        id: crypto.randomUUID(),
        user_id: userId,
        meter,
        quantity,
        metadata: metadata ? JSON.stringify(metadata) : null,
        created_at: new Date().toISOString(),
        period,
      })
      .execute();

    // Stripe meter event (fire and forget)
    if (stripeClient && meterConfig.stripe_meter) {
      try {
        await stripeClient.billing.meterEvents.create({
          event_name: meterConfig.stripe_meter,
          payload: {
            value: String(quantity),
            stripe_customer_id: userId, // caller should pass stripe customer id
          },
        });
      } catch (err) {
        console.warn(`[corral] Stripe meter event failed for ${meter}:`, err);
      }
    }
  };
}
