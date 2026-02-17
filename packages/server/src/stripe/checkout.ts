/**
 * Server-side Stripe Checkout session creation for Corral.
 * Sets metadata that the webhook handler reads to update user.plan.
 *
 * Stripe is a peer dependency — pass your instance directly.
 */

import type Stripe from "stripe";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CheckoutUrlOpts {
  userId: string;
  userEmail: string;
  priceId: string;
  planId?: string;
  successUrl: string;
  cancelUrl: string;
  trialDays?: number;
  coupon?: string;
  metadata?: Record<string, string>;
}

export interface CheckoutResult {
  url: string;
  sessionId: string;
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Create a Stripe Checkout Session and return its URL.
 *
 * ```ts
 * const { url } = await createCheckoutUrl(stripe, {
 *   userId: "usr_123",
 *   userEmail: "rob@example.com",
 *   priceId: "price_abc",
 *   successUrl: "https://app.example.com/billing?ok=1",
 *   cancelUrl: "https://app.example.com/billing?cancelled=1",
 *   trialDays: 14,
 * });
 * ```
 */
export async function createCheckoutUrl(
  stripe: Stripe,
  opts: CheckoutUrlOpts,
): Promise<CheckoutResult> {
  const sessionParams: Stripe.Checkout.SessionCreateParams = {
    mode: "subscription",
    customer_email: opts.userEmail,
    line_items: [{ price: opts.priceId, quantity: 1 }],
    success_url: opts.successUrl,
    cancel_url: opts.cancelUrl,
    metadata: {
      userId: opts.userId,
      ...(opts.planId ? { planId: opts.planId } : {}),
      ...opts.metadata,
    },
    ...(opts.trialDays || opts.coupon
      ? {
          subscription_data: {
            ...(opts.trialDays ? { trial_period_days: opts.trialDays } : {}),
          },
          ...(opts.coupon
            ? { discounts: [{ coupon: opts.coupon }] }
            : {}),
        }
      : {}),
  };

  const session = await stripe.checkout.sessions.create(sessionParams);

  return {
    url: session.url!,
    sessionId: session.id,
  };
}
