// Corral API Router — Express-compatible request handler
// Handles: /checkout, /billing, /billing-portal, /config, /device/*, /apikeys, /devices, /usage/*
//
// Usage:
//   import { createCorralRoutes } from '@llamafarm/corral/routes';
//   app.use('/api/corral', createCorralRoutes(auth, stripe, config, db));

import type { IncomingMessage, ServerResponse } from 'node:http';

interface CorralConfig {
  plans: Array<{
    id: string;
    name: string;
    price: number;
    period: string;
    stripePriceId?: string;
    features: string[];
    highlighted?: boolean;
    trialDays?: number;
  }>;
  webhookSecret?: string;
  successUrl?: string;
  cancelUrl?: string;
  meters?: Record<string, { limit?: number }>;
}

interface CorralAuth {
  api: {
    getSession: (opts: { headers: any }) => Promise<any>;
  };
}

type StripeInstance = any; // Avoid hard dep on stripe types

// Better-sqlite3 Database type (sync interface)
type SqliteDb = {
  prepare: (sql: string) => {
    run: (...params: any[]) => any;
    get: (...params: any[]) => any;
    all: (...params: any[]) => any[];
  };
  exec: (sql: string) => void;
  pragma: (pragma: string) => any;
};

// ─── Bootstrap ────────────────────────────────────────────────────────────────

const CORRAL_TABLES_SQLITE = `
  CREATE TABLE IF NOT EXISTS "device_authorization" (
    id TEXT PRIMARY KEY,
    deviceCode TEXT NOT NULL UNIQUE,
    userCode TEXT NOT NULL UNIQUE,
    userId TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    clientId TEXT,
    scope TEXT DEFAULT '*',
    expiresAt TEXT NOT NULL,
    createdAt TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS "device_token" (
    id TEXT PRIMARY KEY,
    token TEXT NOT NULL UNIQUE,
    refreshToken TEXT NOT NULL UNIQUE,
    userId TEXT NOT NULL REFERENCES "user"(id),
    deviceName TEXT,
    lastUsed TEXT,
    expiresAt TEXT NOT NULL,
    refreshExpiresAt TEXT,
    createdAt TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS "api_key" (
    id TEXT PRIMARY KEY,
    key TEXT NOT NULL UNIQUE,
    prefix TEXT NOT NULL,
    userId TEXT NOT NULL REFERENCES "user"(id),
    name TEXT,
    permissions TEXT DEFAULT '*',
    lastUsed TEXT,
    expiresAt TEXT,
    createdAt TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS "usage" (
    id TEXT PRIMARY KEY,
    userId TEXT NOT NULL,
    meterId TEXT NOT NULL,
    count INTEGER DEFAULT 0,
    periodStart TEXT NOT NULL,
    periodEnd TEXT NOT NULL,
    UNIQUE(userId, meterId, periodStart)
  );

  CREATE INDEX IF NOT EXISTS idx_device_auth_code ON "device_authorization"(deviceCode);
  CREATE INDEX IF NOT EXISTS idx_device_auth_user ON "device_authorization"(userCode);
  CREATE INDEX IF NOT EXISTS idx_device_token_token ON "device_token"(token);
  CREATE INDEX IF NOT EXISTS idx_device_token_refresh ON "device_token"(refreshToken);
  CREATE INDEX IF NOT EXISTS idx_device_token_user ON "device_token"(userId);
  CREATE INDEX IF NOT EXISTS idx_api_key_key ON "api_key"(key);
  CREATE INDEX IF NOT EXISTS idx_api_key_user ON "api_key"(userId);
  CREATE INDEX IF NOT EXISTS idx_usage_user_meter_period ON "usage"(userId, meterId, periodStart);
`;

/**
 * Bootstrap all Corral-specific tables. Idempotent — safe to call on every startup.
 * Call after bootstrapDatabase() which creates the "user" table first.
 */
export function bootstrapCorralTables(db: SqliteDb): void {
  try {
    db.pragma('journal_mode = WAL');
    db.exec(CORRAL_TABLES_SQLITE);
  } catch (e: any) {
    console.error('[Corral] Failed to bootstrap Corral tables:', e.message);
  }
}

// ─── Route factory ────────────────────────────────────────────────────────────

export function createCorralRoutes(
  auth: CorralAuth,
  stripe: StripeInstance | null,
  config: CorralConfig,
  db?: SqliteDb
) {
  // Simple router — matches method + path (with optional :param segments)
  const routes: Array<{ method: string; path: string; pattern: RegExp; paramNames: string[]; handler: RouteHandler }> = [];

  type RouteHandler = (req: ParsedRequest, res: ResponseHelper) => Promise<void>;

  interface ParsedRequest {
    method: string;
    path: string;
    body: any;
    headers: any;
    query: Record<string, string>;
    params: Record<string, string>;
    raw: IncomingMessage;
    user: any | null;
    session: any | null;
  }

  interface ResponseHelper {
    json: (data: any, status?: number) => void;
    error: (message: string, status?: number) => void;
    raw: ServerResponse;
  }

  // ─── In-memory fallback stores (used when no db provided) ─────────────────
  const deviceAuthorizations = new Map<string, {
    userCode: string;
    userId: string | null;
    status: 'pending' | 'authorized' | 'denied';
    expiresAt: string;
  }>();

  const deviceTokens = new Map<string, {
    userId: string;
    refreshToken: string;
    expiresAt: string;
    refreshExpiresAt?: string;
  }>();

  const refreshTokenMap = new Map<string, string>(); // refreshToken → accessToken

  // ─── DB helpers ───────────────────────────────────────────────────────────

  function currentPeriod(): { start: string; end: string } {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    return {
      start: start.toISOString().slice(0, 10),
      end: end.toISOString().slice(0, 10),
    };
  }

  function lookupUserById(userId: string): any | null {
    if (!db) return null;
    try {
      return db.prepare('SELECT id, email, name, role FROM "user" WHERE id = ?').get(userId) ?? null;
    } catch { return null; }
  }

  function lookupUserByToken(token: string): any | null {
    if (!db) {
      const mem = deviceTokens.get(token);
      if (mem && new Date(mem.expiresAt) > new Date()) {
        return { id: mem.userId, plan: 'free' };
      }
      return null;
    }

    // Check device_token table
    try {
      const row = db.prepare(
        'SELECT userId, expiresAt FROM "device_token" WHERE token = ?'
      ).get(token) as any;
      if (row && new Date(row.expiresAt) > new Date()) {
        // Update lastUsed
        db.prepare('UPDATE "device_token" SET lastUsed = ? WHERE token = ?')
          .run(new Date().toISOString(), token);
        return lookupUserById(row.userId);
      }
    } catch {}

    // Check api_key table (keys start with sk_)
    if (token.startsWith('sk_')) {
      try {
        const row = db.prepare(
          'SELECT userId, expiresAt FROM "api_key" WHERE key = ?'
        ).get(token) as any;
        if (row && (!row.expiresAt || new Date(row.expiresAt) > new Date())) {
          db.prepare('UPDATE "api_key" SET lastUsed = ? WHERE key = ?')
            .run(new Date().toISOString(), token);
          return lookupUserById(row.userId);
        }
      } catch {}
    }

    return null;
  }

  // ─── Route registration helper (supports :param segments) ─────────────────
  function addRoute(method: string, path: string, handler: RouteHandler) {
    const paramNames: string[] = [];
    const patternStr = path.replace(/:([^/]+)/g, (_: string, name: string) => {
      paramNames.push(name);
      return '([^/]+)';
    });
    const pattern = new RegExp(`^${patternStr}$`);
    routes.push({ method, path, pattern, paramNames, handler });
  }

  // ─── GET /config ──────────────────────────────────────────────────────────
  addRoute('GET', '/config', async (_req, res) => {
    res.json({
      plans: config.plans.map(p => ({
        id: p.id,
        name: p.name,
        price: p.price,
        period: p.period,
        features: p.features,
        highlighted: p.highlighted,
        trialDays: p.trialDays,
      })),
    });
  });

  // ─── POST /checkout ───────────────────────────────────────────────────────
  addRoute('POST', '/checkout', async (req, res) => {
    if (!stripe) return res.error('Stripe not configured', 503);
    if (!req.user) return res.error('Authentication required', 401);

    const { planId } = req.body || {};
    const plan = config.plans.find(p => p.id === planId);
    if (!plan) return res.error(`Unknown plan: ${planId}`, 400);
    if (!plan.stripePriceId) return res.error(`Plan ${planId} has no Stripe price`, 400);

    try {
      const sessionOpts: any = {
        mode: 'subscription' as const,
        line_items: [{ price: plan.stripePriceId, quantity: 1 }],
        success_url: (config.successUrl || req.headers.origin || 'http://localhost:3000') + '/?checkout=success&plan=' + planId,
        cancel_url: (config.cancelUrl || req.headers.origin || 'http://localhost:3000') + '/?checkout=cancel',
        customer_email: req.user.email,
        metadata: { userId: req.user.id, planId: plan.id },
        subscription_data: { metadata: { userId: req.user.id, planId: plan.id } },
      };
      if (plan.trialDays) sessionOpts.subscription_data.trial_period_days = plan.trialDays;

      const session = await stripe.checkout.sessions.create(sessionOpts);
      res.json({ url: session.url, sessionId: session.id });
    } catch (err: any) {
      console.error('[Corral] Checkout error:', err.message);
      res.error(err.message, 500);
    }
  });

  // ─── GET /billing ─────────────────────────────────────────────────────────
  addRoute('GET', '/billing', async (req, res) => {
    if (!stripe) return res.error('Stripe not configured', 503);
    if (!req.user) return res.error('Authentication required', 401);

    try {
      const customers = await stripe.customers.list({ email: req.user.email, limit: 1 });
      if (!customers.data.length) {
        return res.json({
          subscription: null,
          invoices: [],
          plan: config.plans.find(p => p.id === (req.user.plan || 'free')) || null,
        });
      }

      const customer = customers.data[0];
      const subs = await stripe.subscriptions.list({
        customer: customer.id,
        status: 'all',
        limit: 1,
        expand: ['data.default_payment_method'],
      });
      const sub = subs.data[0] || null;

      const invoicesResp = await stripe.invoices.list({ customer: customer.id, limit: 10 });
      const invoices = invoicesResp.data.map((inv: any) => ({
        id: inv.id,
        date: inv.created,
        amount: inv.amount_paid / 100,
        currency: inv.currency,
        status: inv.status,
        pdfUrl: inv.invoice_pdf,
        hostedUrl: inv.hosted_invoice_url,
      }));

      let currentPlan = config.plans.find(p => p.id === (req.user.plan || 'free'));
      if (sub) {
        const priceId = sub.items?.data[0]?.price?.id;
        currentPlan = config.plans.find(p => p.stripePriceId === priceId) || currentPlan;
      }

      res.json({
        subscription: sub ? {
          id: sub.id,
          status: sub.status,
          currentPeriodStart: sub.current_period_start,
          currentPeriodEnd: sub.current_period_end,
          cancelAtPeriodEnd: sub.cancel_at_period_end,
          trialEnd: sub.trial_end,
          paymentMethod: sub.default_payment_method ? {
            brand: sub.default_payment_method.card?.brand,
            last4: sub.default_payment_method.card?.last4,
          } : null,
        } : null,
        invoices,
        plan: currentPlan,
      });
    } catch (err: any) {
      console.error('[Corral] Billing fetch error:', err.message);
      res.error(err.message, 500);
    }
  });

  // ─── POST /billing-portal ─────────────────────────────────────────────────
  addRoute('POST', '/billing-portal', async (req, res) => {
    if (!stripe) return res.error('Stripe not configured', 503);
    if (!req.user) return res.error('Authentication required', 401);

    try {
      const customers = await stripe.customers.list({ email: req.user.email, limit: 1 });
      if (!customers.data.length) return res.error('No billing account found', 404);

      const session = await stripe.billingPortal.sessions.create({
        customer: customers.data[0].id,
        return_url: (req.headers.origin || 'http://localhost:3000') + '/billing',
      });
      res.json({ url: session.url });
    } catch (err: any) {
      console.error('[Corral] Portal error:', err.message);
      res.error(err.message, 500);
    }
  });

  // ─── POST /cancel ─────────────────────────────────────────────────────────
  addRoute('POST', '/cancel', async (req, res) => {
    if (!stripe) return res.error('Stripe not configured', 503);
    if (!req.user) return res.error('Authentication required', 401);

    try {
      const customers = await stripe.customers.list({ email: req.user.email, limit: 1 });
      if (!customers.data.length) return res.error('No billing account', 404);

      const subs = await stripe.subscriptions.list({ customer: customers.data[0].id, status: 'active', limit: 1 });
      if (!subs.data.length) return res.error('No active subscription', 404);

      const updated = await stripe.subscriptions.update(subs.data[0].id, { cancel_at_period_end: true });
      res.json({
        canceled: true,
        cancelAt: updated.current_period_end,
        message: 'Subscription will cancel at end of billing period',
      });
    } catch (err: any) {
      res.error(err.message, 500);
    }
  });

  // ─── POST /reactivate ─────────────────────────────────────────────────────
  addRoute('POST', '/reactivate', async (req, res) => {
    if (!stripe) return res.error('Stripe not configured', 503);
    if (!req.user) return res.error('Authentication required', 401);

    try {
      const customers = await stripe.customers.list({ email: req.user.email, limit: 1 });
      if (!customers.data.length) return res.error('No billing account', 404);

      const subs = await stripe.subscriptions.list({ customer: customers.data[0].id, limit: 1 });
      if (!subs.data.length) return res.error('No subscription', 404);

      await stripe.subscriptions.update(subs.data[0].id, { cancel_at_period_end: false });
      res.json({ reactivated: true });
    } catch (err: any) {
      res.error(err.message, 500);
    }
  });

  // ─── Device Authorization Flow ────────────────────────────────────────────

  // POST /device/authorize — CLI calls this to start device auth
  addRoute('POST', '/device/authorize', async (req, res) => {
    const deviceCode = randomId(32);
    const userCode = randomUserCode();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString(); // 10 min
    const clientId = req.body?.clientId ?? null;

    if (db) {
      db.prepare(
        `INSERT INTO "device_authorization" (id, deviceCode, userCode, status, clientId, expiresAt)
         VALUES (?, ?, ?, 'pending', ?, ?)`
      ).run(crypto.randomUUID(), deviceCode, userCode, clientId, expiresAt);
    } else {
      deviceAuthorizations.set(deviceCode, {
        userCode,
        userId: null,
        status: 'pending',
        expiresAt,
      });
    }

    res.json({
      deviceCode,
      userCode,
      verificationUrl: '/device/verify',
      expiresIn: 600,
      interval: 2,
    });
  });

  // POST /device/token — CLI polls this until authorized
  addRoute('POST', '/device/token', async (req, res) => {
    const { deviceCode } = req.body || {};
    if (!deviceCode) return res.error('deviceCode required', 400);

    if (db) {
      const authz = db.prepare(
        `SELECT * FROM "device_authorization" WHERE deviceCode = ?`
      ).get(deviceCode) as any;

      if (!authz) return res.error('Invalid device code', 400);
      if (new Date(authz.expiresAt) < new Date()) {
        db.prepare(`DELETE FROM "device_authorization" WHERE deviceCode = ?`).run(deviceCode);
        return res.error('Device code expired', 410);
      }
      if (authz.status === 'denied') {
        db.prepare(`DELETE FROM "device_authorization" WHERE deviceCode = ?`).run(deviceCode);
        return res.error('Authorization denied', 403);
      }
      if (authz.status === 'pending') {
        return res.json({ error: 'authorization_pending' }, 202);
      }
      if (authz.status === 'authorized' && authz.userId) {
        db.prepare(`DELETE FROM "device_authorization" WHERE deviceCode = ?`).run(deviceCode);

        const token = randomId(48);
        const refreshToken = randomId(48);
        const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
        const refreshExpiresAt = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString();

        db.prepare(
          `INSERT INTO "device_token" (id, token, refreshToken, userId, expiresAt, refreshExpiresAt)
           VALUES (?, ?, ?, ?, ?, ?)`
        ).run(crypto.randomUUID(), token, refreshToken, authz.userId, expiresAt, refreshExpiresAt);

        return res.json({ accessToken: token, refreshToken, expiresAt, tokenType: 'Bearer' });
      }
    } else {
      // In-memory fallback
      const authz = deviceAuthorizations.get(deviceCode);
      if (!authz) return res.error('Invalid device code', 400);
      if (new Date(authz.expiresAt) < new Date()) {
        deviceAuthorizations.delete(deviceCode);
        return res.error('Device code expired', 410);
      }
      if (authz.status === 'denied') {
        deviceAuthorizations.delete(deviceCode);
        return res.error('Authorization denied', 403);
      }
      if (authz.status === 'pending') {
        return res.json({ error: 'authorization_pending' }, 202);
      }
      if (authz.status === 'authorized' && authz.userId) {
        deviceAuthorizations.delete(deviceCode);

        const token = randomId(48);
        const refreshToken = randomId(48);
        const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
        const refreshExpiresAt = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString();

        deviceTokens.set(token, { userId: authz.userId, refreshToken, expiresAt, refreshExpiresAt });
        refreshTokenMap.set(refreshToken, token);

        return res.json({ accessToken: token, refreshToken, expiresAt, tokenType: 'Bearer' });
      }
    }
  });

  // POST /device/verify — Browser calls this to approve/deny a device
  addRoute('POST', '/device/verify', async (req, res) => {
    if (!req.user) return res.error('Login required', 401);

    const { userCode, action } = req.body || {};
    if (!userCode) return res.error('userCode required', 400);

    if (db) {
      const authz = db.prepare(
        `SELECT * FROM "device_authorization" WHERE userCode = ?`
      ).get(userCode) as any;
      if (!authz) return res.error('Invalid or expired code', 404);

      if (action === 'approve') {
        db.prepare(
          `UPDATE "device_authorization" SET status = 'authorized', userId = ? WHERE userCode = ?`
        ).run(req.user.id, userCode);
        res.json({ approved: true });
      } else {
        db.prepare(
          `UPDATE "device_authorization" SET status = 'denied' WHERE userCode = ?`
        ).run(userCode);
        res.json({ denied: true });
      }
    } else {
      let found: string | null = null;
      for (const [code, authz] of deviceAuthorizations.entries()) {
        if (authz.userCode === userCode) { found = code; break; }
      }
      if (!found) return res.error('Invalid or expired code', 404);

      const authz = deviceAuthorizations.get(found)!;
      if (action === 'approve') {
        authz.status = 'authorized';
        authz.userId = req.user.id;
        res.json({ approved: true });
      } else {
        authz.status = 'denied';
        res.json({ denied: true });
      }
    }
  });

  // POST /device/refresh — Rotate refresh token, get new access token
  addRoute('POST', '/device/refresh', async (req, res) => {
    const { refreshToken } = req.body || {};
    if (!refreshToken) return res.error('refreshToken required', 400);

    const now = new Date();
    const newAccessToken = randomId(48);
    const newRefreshToken = randomId(48);
    const newAccessExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    const newRefreshExpiresAt = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString();

    if (db) {
      const row = db.prepare(
        `SELECT * FROM "device_token" WHERE refreshToken = ?`
      ).get(refreshToken) as any;

      if (!row) return res.error('Invalid refresh token', 401);
      if (row.refreshExpiresAt && new Date(row.refreshExpiresAt) < now) {
        return res.error('Refresh token expired', 401);
      }

      // Rotate: update with new tokens
      db.prepare(
        `UPDATE "device_token"
         SET token = ?, refreshToken = ?, expiresAt = ?, refreshExpiresAt = ?, lastUsed = ?
         WHERE refreshToken = ?`
      ).run(newAccessToken, newRefreshToken, newAccessExpiresAt, newRefreshExpiresAt, now.toISOString(), refreshToken);

      return res.json({ accessToken: newAccessToken, refreshToken: newRefreshToken, expiresAt: newAccessExpiresAt });
    } else {
      // In-memory fallback
      const oldAccessToken = refreshTokenMap.get(refreshToken);
      if (!oldAccessToken) return res.error('Invalid refresh token', 401);

      const tokenData = deviceTokens.get(oldAccessToken);
      if (!tokenData) return res.error('Invalid refresh token', 401);
      if (tokenData.refreshExpiresAt && new Date(tokenData.refreshExpiresAt) < now) {
        return res.error('Refresh token expired', 401);
      }

      // Invalidate old tokens
      deviceTokens.delete(oldAccessToken);
      refreshTokenMap.delete(refreshToken);

      // Store new tokens
      deviceTokens.set(newAccessToken, {
        userId: tokenData.userId,
        refreshToken: newRefreshToken,
        expiresAt: newAccessExpiresAt,
        refreshExpiresAt: newRefreshExpiresAt,
      });
      refreshTokenMap.set(newRefreshToken, newAccessToken);

      return res.json({ accessToken: newAccessToken, refreshToken: newRefreshToken, expiresAt: newAccessExpiresAt });
    }
  });

  // ─── GET /subscription/status ─────────────────────────────────────────────
  addRoute('GET', '/subscription/status', async (req, res) => {
    if (!req.user) return res.error('Authentication required', 401);
    res.json({
      plan: req.user.plan || 'free',
      role: req.user.role || 'user',
    });
  });

  // ─── API Key endpoints ────────────────────────────────────────────────────

  // POST /apikeys — Create API key (shown once, prefix stored)
  addRoute('POST', '/apikeys', async (req, res) => {
    if (!req.user) return res.error('Authentication required', 401);

    const { name, permissions } = req.body || {};
    const id = crypto.randomUUID();
    const rawKey = 'sk_' + randomId(40);
    const prefix = rawKey.slice(0, 8); // e.g. sk_ABCDEF
    const permStr = Array.isArray(permissions) ? JSON.stringify(permissions) : '*';
    const now = new Date().toISOString();

    if (db) {
      db.prepare(
        `INSERT INTO "api_key" (id, key, prefix, userId, name, permissions, createdAt)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).run(id, rawKey, prefix, req.user.id, name ?? null, permStr, now);
    }

    res.json({ id, key: rawKey, prefix, name: name ?? null });
  });

  // GET /apikeys — List API keys (prefix only, never full key)
  addRoute('GET', '/apikeys', async (req, res) => {
    if (!req.user) return res.error('Authentication required', 401);

    if (!db) return res.json([]);

    const rows = db.prepare(
      `SELECT id, prefix, name, lastUsed, createdAt FROM "api_key" WHERE userId = ? ORDER BY createdAt DESC`
    ).all(req.user.id);

    res.json(rows);
  });

  // DELETE /apikeys/:id — Revoke API key (owner only)
  addRoute('DELETE', '/apikeys/:id', async (req, res) => {
    if (!req.user) return res.error('Authentication required', 401);

    const { id } = req.params;
    if (!db) return res.error('Database not configured', 503);

    const row = db.prepare(`SELECT userId FROM "api_key" WHERE id = ?`).get(id) as any;
    if (!row) return res.error('API key not found', 404);
    if (row.userId !== req.user.id) return res.error('Forbidden', 403);

    db.prepare(`DELETE FROM "api_key" WHERE id = ?`).run(id);
    res.json({ revoked: true });
  });

  // ─── Device Management endpoints ──────────────────────────────────────────

  // GET /devices — List authorized devices for current user
  addRoute('GET', '/devices', async (req, res) => {
    if (!req.user) return res.error('Authentication required', 401);

    if (!db) return res.json([]);

    const rows = db.prepare(
      `SELECT id, deviceName, lastUsed, createdAt FROM "device_token"
       WHERE userId = ? ORDER BY createdAt DESC`
    ).all(req.user.id);

    res.json(rows);
  });

  // DELETE /devices/:id — Revoke device token (owner only)
  addRoute('DELETE', '/devices/:id', async (req, res) => {
    if (!req.user) return res.error('Authentication required', 401);

    const { id } = req.params;
    if (!db) return res.error('Database not configured', 503);

    const row = db.prepare(`SELECT userId FROM "device_token" WHERE id = ?`).get(id) as any;
    if (!row) return res.error('Device not found', 404);
    if (row.userId !== req.user.id) return res.error('Forbidden', 403);

    db.prepare(`DELETE FROM "device_token" WHERE id = ?`).run(id);
    res.json({ revoked: true });
  });

  // ─── Usage endpoints ──────────────────────────────────────────────────────

  // POST /usage/track — Increment usage counter
  addRoute('POST', '/usage/track', async (req, res) => {
    if (!req.user) return res.error('Authentication required', 401);

    const { meterId, count = 1 } = req.body || {};
    if (!meterId) return res.error('meterId required', 400);

    if (!db) return res.json({ tracked: true });

    const { start, end } = currentPeriod();
    const id = crypto.randomUUID();

    db.prepare(
      `INSERT INTO "usage" (id, userId, meterId, count, periodStart, periodEnd)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT (userId, meterId, periodStart)
       DO UPDATE SET count = count + excluded.count`
    ).run(id, req.user.id, meterId, count, start, end);

    res.json({ tracked: true, meterId, count });
  });

  // GET /usage/:meterId — Get usage for a specific meter
  addRoute('GET', '/usage/:meterId', async (req, res) => {
    if (!req.user) return res.error('Authentication required', 401);

    const { meterId } = req.params;
    if (!db) return res.json({ meterId, used: 0, limit: null, remaining: null, resetAt: null });

    const { start, end } = currentPeriod();
    const row = db.prepare(
      `SELECT count FROM "usage" WHERE userId = ? AND meterId = ? AND periodStart = ?`
    ).get(req.user.id, meterId, start) as any;

    const used = row?.count ?? 0;
    const meterConfig = config.meters?.[meterId];
    const limit = meterConfig?.limit ?? null;
    const remaining = limit !== null ? Math.max(0, limit - used) : null;

    res.json({ meterId, used, limit, remaining, resetAt: end });
  });

  // GET /usage — Get all usage meters for current user
  addRoute('GET', '/usage', async (req, res) => {
    if (!req.user) return res.error('Authentication required', 401);

    if (!db) return res.json([]);

    const { start, end } = currentPeriod();
    const rows = db.prepare(
      `SELECT meterId, count FROM "usage" WHERE userId = ? AND periodStart = ?`
    ).all(req.user.id, start) as any[];

    const result = rows.map(row => {
      const meterConfig = config.meters?.[row.meterId];
      const limit = meterConfig?.limit ?? null;
      const remaining = limit !== null ? Math.max(0, limit - row.count) : null;
      return { meterId: row.meterId, used: row.count, limit, remaining, resetAt: end };
    });

    res.json(result);
  });

  // ─── Request handler ──────────────────────────────────────────────────────
  return async function corralHandler(req: IncomingMessage, res: ServerResponse) {
    // Parse URL
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    const path = url.pathname.replace(/^\/api\/corral/, '') || '/';
    const method = req.method || 'GET';
    const query: Record<string, string> = {};
    url.searchParams.forEach((v, k) => { query[k] = v; });

    // Parse body for POST / DELETE with body
    let body: any = null;
    if (method === 'POST' || method === 'DELETE' || method === 'PUT' || method === 'PATCH') {
      try {
        const chunks: Buffer[] = [];
        for await (const chunk of req) chunks.push(chunk as Buffer);
        const rawBody = Buffer.concat(chunks).toString();
        body = rawBody ? JSON.parse(rawBody) : {};
      } catch {
        body = {};
      }
    }

    // Get session (optional — some routes are public)
    let user: any = null;
    let session: any = null;
    try {
      const result = await auth.api.getSession({ headers: req.headers as any });
      if (result) {
        user = result.user;
        session = result.session;
      }
    } catch {}

    // Also check for Bearer token (device tokens / API keys)
    if (!user) {
      const authHeader = req.headers.authorization;
      if (authHeader?.startsWith('Bearer ')) {
        const token = authHeader.slice(7);
        user = lookupUserByToken(token);
      }
    }

    // Build helpers
    const parsed: ParsedRequest = { method, path, body, headers: req.headers, query, params: {}, raw: req, user, session };
    const helper: ResponseHelper = {
      json: (data, status = 200) => {
        res.writeHead(status, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(data));
      },
      error: (message, status = 400) => {
        res.writeHead(status, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: message }));
      },
      raw: res,
    };

    // Match route (exact match first, then pattern match for :params)
    let matched = false;
    for (const route of routes) {
      if (route.method !== method) continue;
      const m = path.match(route.pattern);
      if (m) {
        // Extract named params
        const params: Record<string, string> = {};
        route.paramNames.forEach((name, i) => { params[name] = m[i + 1]; });
        parsed.params = params;
        matched = true;
        try {
          await route.handler(parsed, helper);
        } catch (err: any) {
          console.error(`[Corral] Error in ${method} ${path}:`, err);
          helper.error('Internal server error', 500);
        }
        break;
      }
    }

    if (!matched) {
      helper.error('Not found', 404);
    }
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function randomId(length: number): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  for (let i = 0; i < length; i++) result += chars[bytes[i] % chars.length];
  return result;
}

function randomUserCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // No I, O (ambiguous)
  const nums = '23456789'; // No 0, 1 (ambiguous)
  let code = '';
  for (let i = 0; i < 4; i++) code += chars[Math.floor(Math.random() * chars.length)];
  code += '-';
  for (let i = 0; i < 4; i++) code += nums[Math.floor(Math.random() * nums.length)];
  return code;
}
