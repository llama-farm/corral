# Corral Usage Layer — Flexible Metering, Analytics & Feature Gating

## The Problem

Each product has different things to track and bill for:

| Product | Billable Metrics | Limits | Upsells |
|---------|-----------------|--------|---------|
| **DemoFly** | Videos/month, TTS minutes, video length, quality tier | Free: 1/day, watermark, 720p, 30s max | Remove watermark, 1080p, longer videos, voice clone |
| **Lyric Gen** | Generations/month, export format, AI model tier | Free: 5/day, text only | PDF export, better models, batch generation |
| **LlamaFarm** | API calls, model inference minutes, storage | Free: 100 calls/day | Higher rate limits, GPU models, persistent storage |

We can't hardcode this per-product. The system needs to be **declare what you track, and everything else adapts**.

## Architecture Decision: Usage Events Table + Stripe Meters

**Two sources of truth, each for what it's good at:**

| Concern | Where | Why |
|---------|-------|-----|
| **Billing** | Stripe Meters | Stripe handles invoicing, proration, overages, dunning. Don't reinvent this. |
| **Analytics/Dashboard** | Local usage_events table | Need fast queries, custom aggregations, per-product breakdowns. Stripe's reporting API is too limited for custom dashboards. |
| **Feature gating** | Computed at request time | Query usage_events for current period, compare to plan limits. Fast. |

**NOT a separate database.** Same PostgreSQL that Better Auth uses. One extra table.

### Why Not Just Stripe?

- Stripe Meters are great for billing but **you can't query them flexibly** — no "show me this user's video count by day for the last 30 days"
- Stripe doesn't know about non-billable metrics (page views, feature usage, engagement)
- Stripe meter events are processed async — not suitable for real-time gating ("you've hit your limit")
- Dashboard needs sub-second queries across millions of events

### Why Not Just Local DB?

- Billing logic (proration, failed payments, dunning, invoices) is insanely complex
- Stripe does this perfectly, don't rebuild it
- Stripe is the legal/financial source of truth

### The Pattern: Write to Both

```
User action (create video, generate lyrics, etc.)
    │
    ├──→ INSERT INTO usage_events (userId, appId, event, quantity, metadata, ts)
    │    → Dashboard, analytics, real-time gating
    │
    └──→ stripe.billing.meterEvents.create({ event_name, customer, value })
         → Billing, invoicing, overages
```

Simple. Dual-write on every billable action. The local table is the fast queryable truth for your dashboard. Stripe is the billing truth.

## Schema

### usage_events table

```sql
CREATE TABLE usage_events (
    id          TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     TEXT NOT NULL REFERENCES "user"(id),
    app_id      TEXT NOT NULL,              -- 'demofly', 'lyric-gen', 'llamafarm'
    event       TEXT NOT NULL,              -- 'video.created', 'tts.minutes', 'generation.completed'
    quantity    NUMERIC NOT NULL DEFAULT 1, -- 1 video, 3.5 minutes, etc.
    metadata    JSONB,                      -- { quality: '1080p', duration_s: 45, voice: 'alloy' }
    period      TEXT NOT NULL,              -- '2026-02' (billing period, for fast aggregation)
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_usage_user_app_period ON usage_events(user_id, app_id, period);
CREATE INDEX idx_usage_app_event ON usage_events(app_id, event);
```

That's it. One table. The `metadata` JSONB column handles per-product specifics without schema changes.

### product_config table (what each product tracks)

```sql
CREATE TABLE product_config (
    app_id      TEXT PRIMARY KEY,           -- 'demofly'
    config      JSONB NOT NULL              -- See below
);
```

```jsonc
// product_config for DemoFly
{
  "name": "DemoFly",
  "meters": {
    "video.created": {
      "label": "Videos Created",
      "unit": "videos",
      "stripe_meter": "demofly_videos",    // maps to Stripe meter name
      "limits": {
        "free": { "per": "day", "max": 1 },
        "pro": { "per": "month", "max": 100 },
        "team": { "per": "month", "max": 1000 },
        "enterprise": null                  // unlimited
      }
    },
    "tts.minutes": {
      "label": "TTS Minutes",
      "unit": "minutes",
      "stripe_meter": "demofly_tts_minutes",
      "limits": {
        "free": { "per": "month", "max": 5 },
        "pro": { "per": "month", "max": 120 },
        "team": { "per": "month", "max": 500 },
        "enterprise": null
      }
    },
    "video.max_duration_s": {
      "label": "Max Video Length",
      "type": "cap",                        // not metered, just a limit
      "limits": {
        "free": 30,
        "pro": 300,
        "team": 600,
        "enterprise": null
      }
    },
    "video.quality": {
      "label": "Max Quality",
      "type": "tier",                       // feature tier, not counted
      "limits": {
        "free": "720p",
        "pro": "1080p",
        "team": "4k",
        "enterprise": "4k"
      }
    },
    "video.watermark": {
      "label": "Watermark",
      "type": "flag",                       // boolean feature flag
      "limits": {
        "free": true,                       // has watermark
        "pro": false,                       // no watermark
        "team": false,
        "enterprise": false
      }
    }
  },
  "dashboard_widgets": [
    { "type": "counter", "meter": "video.created", "period": "month" },
    { "type": "counter", "meter": "tts.minutes", "period": "month" },
    { "type": "timeseries", "meter": "video.created", "period": "30d" },
    { "type": "breakdown", "meter": "video.created", "by": "metadata.quality" }
  ]
}
```

**The agent writes this config when setting up a new product.** The dashboard, gating middleware, and Stripe meter setup all derive from it.

## Feature Gating Middleware

```typescript
// packages/server/src/usage/gate.ts

import { db } from '../db';

interface GateResult {
  allowed: boolean;
  current: number;
  limit: number | null;
  resetAt?: string;
  upgradeUrl?: string;
}

export async function checkUsage(
  userId: string,
  appId: string,
  event: string,
  plan: string,
  quantity: number = 1
): Promise<GateResult> {
  // Load product config
  const config = await getProductConfig(appId);
  const meter = config.meters[event];
  if (!meter || !meter.limits[plan]) {
    return { allowed: true, current: 0, limit: null }; // unlimited
  }

  const limit = meter.limits[plan];
  if (limit === null) {
    return { allowed: true, current: 0, limit: null };
  }

  // Calculate current period
  const period = limit.per === 'day'
    ? new Date().toISOString().slice(0, 10)   // '2026-02-16'
    : new Date().toISOString().slice(0, 7);    // '2026-02'

  // Query current usage
  const result = await db
    .selectFrom('usage_events')
    .where('user_id', '=', userId)
    .where('app_id', '=', appId)
    .where('event', '=', event)
    .where('period', '=', period)
    .select(db.fn.sum('quantity').as('total'))
    .executeTakeFirst();

  const current = Number(result?.total ?? 0);

  return {
    allowed: current + quantity <= limit.max,
    current,
    limit: limit.max,
    resetAt: limit.per === 'day'
      ? 'tomorrow'
      : `start of next month`,
    upgradeUrl: `https://app.${appId}.dev/upgrade`,
  };
}
```

```typescript
// How a product uses it:

// DemoFly CLI — before creating a video
const gate = await checkUsage(userId, 'demofly', 'video.created', userPlan);
if (!gate.allowed) {
  console.log(`You've created ${gate.current}/${gate.limit} videos this ${period}.`);
  console.log(`Resets ${gate.resetAt}. Upgrade: ${gate.upgradeUrl}`);
  process.exit(1);
}

// After successful creation — record usage
await recordUsage(userId, 'demofly', 'video.created', 1, { quality: '1080p', duration_s: 45 });
// This writes to both local DB and Stripe meter
```

## Recording Usage (Dual-Write)

```typescript
// packages/server/src/usage/record.ts

export async function recordUsage(
  userId: string,
  appId: string,
  event: string,
  quantity: number = 1,
  metadata?: Record<string, any>
) {
  const period = new Date().toISOString().slice(0, 7); // '2026-02'

  // 1. Local DB (fast, queryable)
  await db.insertInto('usage_events').values({
    user_id: userId,
    app_id: appId,
    event,
    quantity,
    metadata: metadata ? JSON.stringify(metadata) : null,
    period,
  }).execute();

  // 2. Stripe Meter (for billing)
  const config = await getProductConfig(appId);
  const meter = config.meters[event];
  if (meter?.stripe_meter) {
    const stripeCustomerId = await getStripeCustomerId(userId);
    await stripeClient.billing.meterEvents.create({
      event_name: meter.stripe_meter,
      payload: {
        stripe_customer_id: stripeCustomerId,
        value: String(quantity),
      },
    });
  }
}
```

## Admin Dashboard — Dynamic Per-Product

The dashboard reads `product_config` and renders widgets dynamically:

```
┌─────────────────────────────────────────────────────────┐
│  Corral Admin — DemoFly                    [Switch App ▾] │
├─────────────────────────────────────────────────────────┤
│                                                           │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────┐  │
│  │ Videos Today  │  │ TTS Minutes  │  │  Active Users │  │
│  │     147       │  │   23.5 min   │  │      42       │  │
│  │  ↑12% vs avg  │  │  ↑8% vs avg  │  │  ↑3 new today │  │
│  └──────────────┘  └──────────────┘  └───────────────┘  │
│                                                           │
│  ┌─────────────────────────────────────────────────────┐ │
│  │  Videos Created (30 days)           [daily ▾]       │ │
│  │  ████▇▆▇████▇▆▇████▇▆▇████▇▆▇██                   │ │
│  └─────────────────────────────────────────────────────┘ │
│                                                           │
│  ┌──────────────────────┐  ┌──────────────────────────┐ │
│  │ Plan Distribution    │  │ Quality Breakdown        │ │
│  │ ■ Free: 78%          │  │ ■ 720p: 45%              │ │
│  │ ■ Pro: 18%           │  │ ■ 1080p: 42%             │ │
│  │ ■ Team: 4%           │  │ ■ 4k: 13%                │ │
│  └──────────────────────┘  └──────────────────────────┘ │
│                                                           │
│  Users Approaching Limits                                 │
│  ┌─────────────────────────────────────────────────────┐ │
│  │ user@example.com  │ free │ 1/1 videos today │ ⚡ AT LIMIT │
│  │ dev@startup.io    │ pro  │ 89/100 videos    │ ⚠️ 89%    │
│  └─────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
```

All driven by `product_config.dashboard_widgets`. When you add a new product, the agent writes its config and the dashboard auto-renders the right widgets.

## How a New Product Gets Set Up

This is what the agent does (via skill or manually):

```bash
# 1. Define product config
corral product add lyric-gen \
  --meter "generation.completed:Generations:generations:lyric_gen_generations" \
  --meter "export.pdf:PDF Exports:exports:lyric_gen_exports" \
  --limit "generation.completed:free:day:5" \
  --limit "generation.completed:pro:month:500" \
  --flag "export.pdf:free:false" \
  --flag "export.pdf:pro:true"

# 2. Create Stripe meters (auto)
corral stripe sync lyric-gen

# 3. Create Stripe plans (auto from config)
corral stripe plans lyric-gen \
  --free "price_free" \
  --pro "price_pro_2900" \
  --team "price_team_9900"

# Done. Gating, billing, and dashboard all work for lyric-gen.
```

Or the agent just writes the JSON config directly — same result.

## Summary: Where Things Live

```
Better Auth DB (PostgreSQL)
├── user, session, account     ← WHO (identity)
├── subscription               ← WHAT PLAN (via Stripe plugin)
├── apiKey                     ← API ACCESS (keys, rate limits)
├── usage_events               ← HOW MUCH (our table, fast queries)
└── product_config             ← WHAT TO TRACK (per-product definition)

Stripe
├── Customer                   ← payment method, invoices
├── Subscription               ← plan, status, renewal
├── Billing Meters             ← usage-based billing aggregation
└── Invoices                   ← actual charges

The Rule:
  Local DB  = fast reads, analytics, gating, dashboard
  Stripe    = billing, payments, financial truth
  Both get written on every billable action
```
