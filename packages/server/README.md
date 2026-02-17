# 🦙 @llamafarm/corral

> Auth, billing, and API scaffolding for SaaS apps — batteries included.

[![npm version](https://img.shields.io/npm/v/@llamafarm/corral)](https://www.npmjs.com/package/@llamafarm/corral)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## What it does

`@llamafarm/corral` is the server-side core of the Corral SaaS toolkit. Drop it into any [Hono](https://hono.dev/) app to get:

- 🔐 **Authentication** — email/password, OAuth, magic links via [better-auth](https://better-auth.com)
- 💳 **Billing** — Stripe subscriptions, usage-based metering, webhooks, and portal links
- 🗄️ **Database adapters** — SQLite, PostgreSQL, MySQL
- 🔒 **API gating** — plan-aware route protection with `corralGate()`
- 📊 **Usage tracking** — increment counters, enforce limits, expose usage APIs

## Install

```bash
npm install @llamafarm/corral
```

## Quick Setup

```ts
import { Hono } from 'hono';
import { corral } from '@llamafarm/corral';

const app = new Hono();

app.use('/api/*', corral({
  auth: {
    secret: process.env.BETTER_AUTH_SECRET!,
    database: { provider: 'sqlite', url: './corral.db' },
  },
  stripe: {
    secretKey: process.env.STRIPE_SECRET_KEY!,
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET!,
  },
}));

export default app;
```

## Exports

| Export | Description |
|--------|-------------|
| `@llamafarm/corral` | Server middleware, auth, billing, gating |
| `@llamafarm/corral/client` | Browser-safe client utilities |

## Docs

📖 Full documentation at **[llama-farm.github.io/corral](https://llama-farm.github.io/corral/)**

## License

MIT © [llama-farm](https://github.com/llama-farm)
