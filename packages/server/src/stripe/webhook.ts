/**
 * Stripe webhook handler for Corral auth/billing.
 * Listens for Stripe events and auto-updates user.plan via the auth instance.
 *
 * Stripe is a peer dependency — pass your stripe instance directly.
 */

import type Stripe from "stripe";
import type { IncomingMessage, ServerResponse } from "node:http";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PlanConfig {
  id: string;
  stripePriceId?: string;
}

export interface WebhookConfig {
  /** Known plans with optional Stripe price-ID mapping */
  plans: PlanConfig[];
  /** Stripe webhook signing secret (whsec_…) */
  webhookSecret: string;
}

/** Minimal auth interface — keeps us decoupled from any concrete auth lib */
export interface AuthInstance {
  api: {
    /** Look up a user by email. Returns at least { id, email, plan? } */
    findUserByEmail?(email: string): Promise<{ id: string } | null>;
    /** Look up a user by ID */
    findUserById?(id: string): Promise<{ id: string } | null>;
    /** Update arbitrary user fields */
    updateUser?(userId: string, data: Record<string, unknown>): Promise<void>;
  };
}

export interface CheckoutSessionOpts {
  userId: string;
  userEmail: string;
  planId: string;
  priceId: string;
  successUrl: string;
  cancelUrl: string;
  trialDays?: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Resolve a plan ID from a Stripe price ID using the config mapping */
function planFromPriceId(priceId: string, plans: PlanConfig[]): string | undefined {
  return plans.find((p) => p.stripePriceId === priceId)?.id;
}

/** Update a user's plan via the auth instance */
async function setUserPlan(auth: AuthInstance, userId: string, plan: string): Promise<void> {
  if (auth.api.updateUser) {
    await auth.api.updateUser(userId, { plan });
    console.log(`[corral/stripe] ✅ user ${userId} plan → "${plan}"`);
  } else {
    console.warn("[corral/stripe] auth.api.updateUser not available — skipping plan update");
  }
}

/** Resolve a userId from checkout session metadata or customer email */
async function resolveUserId(
  auth: AuthInstance,
  metadata: Stripe.Metadata | null,
  customerEmail?: string | null,
): Promise<string | undefined> {
  if (metadata?.userId) return metadata.userId;
  if (customerEmail && auth.api.findUserByEmail) {
    const user = await auth.api.findUserByEmail(customerEmail);
    return user?.id;
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Webhook handler
// ---------------------------------------------------------------------------

/**
 * Creates an Express-compatible request handler for Stripe webhooks.
 *
 * Usage:
 * ```ts
 * app.post("/api/stripe/webhook", express.raw({ type: "application/json" }), createWebhookHandler(stripe, auth, config));
 * ```
 */
export function createWebhookHandler(
  stripe: Stripe,
  auth: AuthInstance,
  config: WebhookConfig,
) {
  return async (req: IncomingMessage & { body?: Buffer | string }, res: ServerResponse) => {
    const sig = req.headers["stripe-signature"] as string | undefined;
    if (!sig) {
      console.warn("[corral/stripe] ⚠️  Missing stripe-signature header");
      res.writeHead(400).end("Missing stripe-signature header");
      return;
    }

    // The body must be the raw buffer (e.g. via express.raw())
    const rawBody = (req as any).body ?? "";

    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(rawBody, sig, config.webhookSecret);
    } catch (err: any) {
      console.error("[corral/stripe] ❌ Signature verification failed:", err.message);
      res.writeHead(400).end(`Webhook signature verification failed: ${err.message}`);
      return;
    }

    console.log(`[corral/stripe] 📩 Event received: ${event.type} (${event.id})`);

    try {
      switch (event.type) {
        // ----- Checkout completed -----
        case "checkout.session.completed": {
          const session = event.data.object as Stripe.Checkout.Session;
          console.log("[corral/stripe] checkout.session.completed", {
            sessionId: session.id,
            customerEmail: session.customer_email,
            metadata: session.metadata,
          });

          const userId = await resolveUserId(auth, session.metadata, session.customer_email);
          const planId = session.metadata?.planId;

          if (userId && planId) {
            await setUserPlan(auth, userId, planId);
          } else {
            console.warn("[corral/stripe] ⚠️  Could not resolve userId or planId from checkout session");
          }
          break;
        }

        // ----- Subscription updated -----
        case "customer.subscription.updated": {
          const sub = event.data.object as Stripe.Subscription;
          const priceId = sub.items.data[0]?.price?.id;
          const userId = sub.metadata?.userId;
          console.log("[corral/stripe] customer.subscription.updated", {
            subscriptionId: sub.id,
            status: sub.status,
            priceId,
            userId,
          });

          if (userId && priceId) {
            const plan = planFromPriceId(priceId, config.plans);
            if (plan) {
              await setUserPlan(auth, userId, plan);
            } else {
              console.warn(`[corral/stripe] ⚠️  No plan mapped for priceId ${priceId}`);
            }
          }
          break;
        }

        // ----- Subscription deleted (cancelled) -----
        case "customer.subscription.deleted": {
          const sub = event.data.object as Stripe.Subscription;
          const userId = sub.metadata?.userId;
          console.log("[corral/stripe] customer.subscription.deleted", {
            subscriptionId: sub.id,
            userId,
          });

          if (userId) {
            await setUserPlan(auth, userId, "free");
          }
          break;
        }

        // ----- Payment failed -----
        case "invoice.payment_failed": {
          const invoice = event.data.object as Stripe.Invoice;
          const customerEmail =
            typeof invoice.customer_email === "string" ? invoice.customer_email : undefined;
          console.log("[corral/stripe] invoice.payment_failed", {
            invoiceId: invoice.id,
            customerEmail,
            attemptCount: invoice.attempt_count,
          });

          // Optional: flag the user so UI can show a banner
          const userId = await resolveUserId(auth, (invoice as any).subscription_details?.metadata, customerEmail);
          if (userId && auth.api.updateUser) {
            await auth.api.updateUser(userId, { paymentFailed: true });
            console.log(`[corral/stripe] 🚩 user ${userId} flagged paymentFailed`);
          }
          break;
        }

        // ----- Trial ending soon -----
        case "customer.subscription.trial_will_end": {
          const sub = event.data.object as Stripe.Subscription;
          console.log("[corral/stripe] customer.subscription.trial_will_end", {
            subscriptionId: sub.id,
            trialEnd: sub.trial_end,
            userId: sub.metadata?.userId,
          });
          // TODO: nudge system will hook in here later
          break;
        }

        default:
          console.log(`[corral/stripe] ℹ️  Unhandled event type: ${event.type}`);
      }

      res.writeHead(200).end(JSON.stringify({ received: true }));
    } catch (err) {
      console.error("[corral/stripe] ❌ Error processing webhook:", err);
      res.writeHead(500).end("Internal error");
    }
  };
}

// ---------------------------------------------------------------------------
// Checkout session helper (convenience — lives here so webhook + checkout
// share the same metadata contract)
// ---------------------------------------------------------------------------

/**
 * Create a Stripe Checkout Session with the metadata the webhook expects.
 */
export async function createCheckoutSession(
  stripe: Stripe,
  opts: CheckoutSessionOpts,
): Promise<{ url: string; sessionId: string }> {
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer_email: opts.userEmail,
    line_items: [{ price: opts.priceId, quantity: 1 }],
    success_url: opts.successUrl,
    cancel_url: opts.cancelUrl,
    metadata: {
      userId: opts.userId,
      planId: opts.planId,
    },
    ...(opts.trialDays
      ? { subscription_data: { trial_period_days: opts.trialDays } }
      : {}),
  });

  return { url: session.url!, sessionId: session.id };
}
