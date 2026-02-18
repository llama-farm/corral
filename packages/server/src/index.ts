import { Hono } from "hono";
import { loadConfig } from "./config/loader.js";
import { createAuth } from "./auth/setup.js";
import { createUsageGate } from "./usage/gate.js";
import { createUsageRecorder } from "./usage/record.js";
import { migrateUsageTables } from "./usage/migrate.js";
import { seedData } from "./seed/index.js";
import type { CorralConfig, MeterConfig, PlanConfig } from "./config/schema.js";
import type { GateResult } from "./usage/gate.js";
import type { DatabaseAdapter } from "./db/adapters.js";

export type { CorralConfig, MeterConfig, PlanConfig, GateResult, DatabaseAdapter };

export interface CorralInstance {
  auth: any;
  config: CorralConfig;
  checkUsage: (userId: string, meter: string, quantity?: number, userPlan?: string) => Promise<GateResult>;
  recordUsage: (userId: string, meter: string, quantity?: number, metadata?: Record<string, any>) => Promise<void>;
  getSession: (headers: Headers) => Promise<any>;
  /** Hono sub-app for /api/auth/* */
  authRoutes: Hono;
  /** Hono sub-app for /api/usage/* */
  usageRoutes: Hono;
  /** Next.js-style handler */
  handlers: {
    GET: (req: Request) => Promise<Response>;
    POST: (req: Request) => Promise<Response>;
  };
  /** Seed the database with config data */
  seed: () => Promise<void>;
}

export async function createCorral(
  configPathOrObject: string | Record<string, unknown>
): Promise<CorralInstance> {
  const config = loadConfig(configPathOrObject);
  const auth = await createAuth(config);

  // Get the internal DB from Better Auth for usage tables
  let db: any = null;
  let stripeClient: any = null;

  // Initialize Stripe if configured
  const stripeKey = config.billing.stripe?.secret_key || process.env.STRIPE_SECRET_KEY;
  if (config.billing.provider === "stripe" && stripeKey) {
    try {
      const stripeMod = await import("stripe" as string);
      const Stripe = stripeMod.default ?? stripeMod;
      stripeClient = new Stripe(stripeKey);
    } catch {
      console.warn("[corral] Stripe SDK not available, billing disabled");
    }
  }

  // Try to get Kysely instance from Better Auth internals
  // Better Auth exposes db through its internal context
  try {
    db = (auth as any).options?.database?.db ?? (auth as any).$context?.db ?? null;
  } catch {
    // Will be null, usage features won't work
  }

  // Migrate usage tables if we have DB access
  if (db && config.database.auto_migrate) {
    try {
      await migrateUsageTables(db);
    } catch (err) {
      console.warn("[corral] Usage table migration failed:", err);
    }
  }

  const checkUsage = createUsageGate(config, db);
  const recordUsage = createUsageRecorder(config, db, stripeClient);

  // Auth routes for Hono
  const authRoutes = new Hono();
  authRoutes.all("/api/auth/*", (c) => {
    return auth.handler(c.req.raw);
  });

  // Usage routes for Hono
  const usageRoutes = new Hono();
  usageRoutes.post("/api/usage/check", async (c) => {
    const body = await c.req.json();
    const result = await checkUsage(body.userId, body.meter, body.quantity, body.plan);
    return c.json(result);
  });
  usageRoutes.post("/api/usage/record", async (c) => {
    const body = await c.req.json();
    await recordUsage(body.userId, body.meter, body.quantity, body.metadata);
    return c.json({ ok: true });
  });

  // Next.js handlers
  const handlers = {
    GET: (req: Request) => auth.handler(req),
    POST: (req: Request) => auth.handler(req),
  };

  // Session helper
  const getSession = async (headers: Headers) => {
    return auth.api.getSession({ headers });
  };

  return {
    auth,
    config,
    checkUsage,
    recordUsage,
    getSession,
    authRoutes,
    usageRoutes,
    handlers,
    seed: () => seedData(config, auth),
  };
}

export { loadConfig, loadConfigAsync } from "./config/loader.js";
export { corralConfigSchema } from "./config/schema.js";
export { createAdapter, registerAdapter, d1Adapter } from "./db/adapters.js";
export { bootstrapDatabase } from "./db/bootstrap.js";
export type { AdapterFactory } from "./db/adapters.js";
