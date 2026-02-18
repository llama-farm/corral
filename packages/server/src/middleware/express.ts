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
  // Lazy-init: the dynamic import runs once on the first request, then
  // the resolved handler is reused for all subsequent requests.
  let _handler: ((req: Request, res: Response, next: NextFunction) => void) | null = null;
  let _initPromise: Promise<void> | null = null;

  async function init() {
    const { toNodeHandler } = await import('better-auth/node');
    const authHandler = toNodeHandler(opts.auth);
    const corralHandler = createCorralRoutes(opts.auth, opts.stripe || null, opts.config);
    const webhookHandler = opts.stripe && opts.config.webhookSecret
      ? createWebhookHandler(opts.stripe, opts.auth, {
          plans: opts.config.plans || [],
          webhookSecret: opts.config.webhookSecret || '',
        })
      : null;

    _handler = function corralMiddleware(req: Request, res: Response, next: NextFunction) {
      const path = req.path || req.url || '';

      if (path.startsWith('/api/auth')) {
        return authHandler(req, res);
      }

      if (path.startsWith('/api/corral')) {
        return corralHandler(req, res);
      }

      if (path === '/webhook/stripe' && webhookHandler) {
        return webhookHandler(req, res);
      }

      next();
    };
  }

  return function corralMiddleware(req: Request, res: Response, next: NextFunction) {
    if (_handler) {
      return _handler(req, res, next);
    }
    // First request triggers the async init; subsequent requests wait on the same promise.
    if (!_initPromise) {
      _initPromise = init();
    }
    _initPromise
      .then(() => _handler!(req, res, next))
      .catch(next);
  };
}
