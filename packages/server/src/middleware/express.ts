// Corral Express Middleware — One-line integration
//
// Usage:
//   import { corral } from '@llamafarm/corral/middleware/express';
//   app.use(corral({ auth, stripe, config }));
//
// This mounts:
//   /api/auth/*     — Better Auth (login, signup, session, etc.)
//   /api/corral/*   — Corral API (checkout, billing, device auth, etc.)
//   /webhook/stripe — Stripe webhook handler

import type { Request, Response, NextFunction } from 'express';
import { toNodeHandler } from 'better-auth/node';
import { createCorralRoutes } from '../routes/corral-router.js';
import { createWebhookHandler } from '../stripe/webhook.js';

interface CorralMiddlewareConfig {
  auth: any;              // Better Auth instance
  stripe?: any;           // Stripe instance (optional)
  config: {
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
  };
  cors?: {
    origin: string | string[];
    credentials?: boolean;
  };
}

export function corral(opts: CorralMiddlewareConfig) {
  const authHandler = toNodeHandler(opts.auth);
  const corralHandler = createCorralRoutes(opts.auth, opts.stripe || null, opts.config);
  const webhookHandler = opts.stripe && opts.config.webhookSecret
    ? createWebhookHandler(opts.stripe, opts.auth, {
        plans: opts.config.plans || [],
        webhookSecret: opts.config.webhookSecret || '',
      })
    : null;

  return function corralMiddleware(req: Request, res: Response, next: NextFunction) {
    const path = req.path || req.url || '';

    // Better Auth routes
    if (path.startsWith('/api/auth')) {
      return authHandler(req, res);
    }

    // Corral API routes
    if (path.startsWith('/api/corral')) {
      return corralHandler(req, res);
    }

    // Stripe webhook (raw body required)
    if (path === '/webhook/stripe' && webhookHandler) {
      return webhookHandler(req, res);
    }

    next();
  };
}
