# Corral — Shared Auth & Payments SDK

*Embedded auth + billing + admin for all LlamaFarm/Rownd projects. Not a service — a library.*

## The Problem

We're shipping multiple products (DemoFly, lyric generator, LlamaFarm tools) as both local CLIs and cloud platforms. Each needs auth, billing, usage tracking, and admin. Building this per-project is insane.

## The Solution: Embedded Library, Not a Service

Corral is **not a separate server.** It's an npm package you install into your existing app. One `import`, one config file, zero Docker containers.

```
❌ Microservice model (what we're NOT doing):
  Your App → network call → Auth Service (separate container) → Auth DB

✅ Embedded model (what we ARE doing):
  Your App
    ├── your routes
    ├── /api/auth/*    ← Corral route handler (mounted inline)
    ├── /api/usage/*   ← Corral usage API (mounted inline)
    └── your database  ← Corral tables live alongside your tables
```

**One deploy. One database. One process.** Corral adds tables to your existing DB and mounts routes in your existing server.

## Architecture

```
┌───────────────────────────────────────────────────────┐
│                    Your Application                    │
│                                                       │
│  ┌─────────────┐  ┌──────────────────────────────┐   │
│  │  Your App   │  │         Corral (embedded)     │   │
│  │  Routes     │  │                               │   │
│  │             │  │  Better Auth + Plugins         │   │
│  │  /dashboard │  │  ├── Email/Password           │   │
│  │  /create    │  │  ├── API Key                  │   │
│  │  /settings  │  │  ├── Device Authorization     │   │
│  │  /admin     │  │  ├── Stripe (subscriptions)   │   │
│  │             │  │  └── Admin (user management)  │   │
│  │             │  │                               │   │
│  │             │  │  Usage Layer                   │   │
│  │             │  │  ├── checkUsage()             │   │
│  │             │  │  ├── recordUsage()            │   │
│  │             │  │  └── Stripe Meter sync        │   │
│  └──────┬──────┘  └──────────────┬────────────────┘   │
│         │                        │                     │
│         └────────┬───────────────┘                     │
│                  │                                     │
│         ┌────────┴────────┐                            │
│         │    Database     │                            │
│         │  (your tables   │                            │
│         │  + corral tables│                            │
│         │  side by side)  │                            │
│         └─────────────────┘                            │
└───────────────────────────────────────────────────────┘
```

## Database: Flexible, Not Opinionated

Corral uses Better Auth's database layer, which supports multiple adapters out of the box. **Your app's database IS Corral's database.**

| Adapter | When to Use | Setup |
|---------|-------------|-------|
| **Kysely (built-in)** | Default. Zero-dep. SQLite or PostgreSQL. | `corral dev` auto-migrates |
| **Drizzle** | If your app already uses Drizzle | `corral generate --drizzle` outputs schema |
| **Prisma** | If your app already uses Prisma | `corral generate --prisma` outputs schema |

| Database | When to Use |
|----------|-------------|
| **SQLite** | Local dev, single-user CLIs, prototyping |
| **PostgreSQL** | Production. Railway, Supabase, Neon, Fly, self-hosted |
| **MySQL/MariaDB** | If you already have one |
| **Cloudflare D1** | Edge deployment on Cloudflare Workers |
| **Turso/libSQL** | Edge SQLite (Turso, Fly LiteFS) |

### Database Config in YAML

```yaml
# corral.yaml

database:
  # Option 1: SQLite (dev default — zero config)
  url: "file:./corral.db"

  # Option 2: PostgreSQL (production)
  url: ${DATABASE_URL}                    # env var, e.g. Railway auto-sets this

  # Option 3: Cloudflare D1
  adapter: d1
  binding: CORRAL_DB                      # D1 binding name

  # Option 4: Turso
  url: ${TURSO_DATABASE_URL}
  auth_token: ${TURSO_AUTH_TOKEN}

  # Option 5: Use your app's existing connection
  adapter: drizzle                        # or prisma
  # Corral adds its tables to your existing schema

  # Migration behavior
  auto_migrate: true                      # Auto-migrate on startup (dev)
  # auto_migrate: false                   # Manual migration (production)
```

### Railway / Fly / Vercel Deployment

```bash
# Railway: spin up Postgres, get DATABASE_URL automatically
railway add postgresql
# corral.yaml just uses: url: ${DATABASE_URL}
# Deploy your app normally — Corral tables auto-migrate

# Fly.io: same pattern
fly postgres create
# Set DATABASE_URL secret, deploy

# Vercel + Neon/Supabase: same pattern
# Set DATABASE_URL in Vercel env vars

# Cloudflare Workers + D1:
wrangler d1 create corral
# corral.yaml: adapter: d1, binding: CORRAL_DB
```

**Zero Corral-specific infrastructure.** Whatever database your app uses, Corral uses too.

### Tables Corral Adds

```sql
-- Better Auth core
user, session, account, verification

-- Plugins
api_key                     -- API Key plugin
device_authorization        -- Device Auth plugin  
subscription                -- Stripe plugin

-- Corral usage layer
usage_events                -- Metering + analytics
product_config              -- Per-product meter/plan definitions
```

All prefixed to avoid collisions. Your app's tables remain untouched.

## Mounting in Your App

### Next.js (App Router)

```typescript
// app/api/auth/[...all]/route.ts
import { corral } from '@/lib/corral';
export const { GET, POST } = corral.handlers;
```

```typescript
// lib/corral.ts
import { createCorral } from '@llamafarm/corral';

export const corral = createCorral({
  configPath: './corral.yaml',    // or inline config object
  database: { url: process.env.DATABASE_URL },
  stripe: {
    secretKey: process.env.STRIPE_SECRET_KEY,
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
  },
});
```

### Hono

```typescript
import { Hono } from 'hono';
import { createCorral } from '@llamafarm/corral';

const app = new Hono();
const corral = createCorral({ configPath: './corral.yaml' });

app.route('/api/auth', corral.authRoutes);
app.route('/api/usage', corral.usageRoutes);

// Your routes
app.get('/dashboard', ...);
```

### Express

```typescript
import express from 'express';
import { createCorral } from '@llamafarm/corral';

const app = express();
const corral = createCorral({ configPath: './corral.yaml' });

app.use('/api/auth', corral.expressMiddleware());
app.use('/api/usage', corral.usageMiddleware());
```

### Standalone (no existing app)

```bash
# If you don't have an app yet — Corral can run standalone for dev/testing
corral dev
# Starts Hono server on :3100 with all routes + admin dashboard
# Great for developing the auth experience before integrating
```

## Auth Flows

### Flow 1: CLI Login (Device Authorization — Browser Hop)

```
User runs: demofly login

1. CLI calls POST /api/auth/device-authorization/authorize
   → { userCode: "ABCD-1234", verificationUri: "https://yourapp.com/device" }

2. CLI opens browser → user logs in → enters code → approves

3. CLI polls → gets { accessToken, refreshToken }

4. CLI saves to ~/.config/corral/token.json
   → All subsequent calls use Bearer token

No API key copy-paste. Seamless.
```

### Flow 2: API Key (Agent-Friendly)

```
1. User creates key in dashboard or CLI: corral keys create --name "my-agent"
   → df_live_abc123...

2. Agent uses: Authorization: Bearer df_live_abc123
   → Better Auth validates, returns session with plan info

Built-in: rate limiting, expiration, usage tracking, custom prefixes.
```

### Flow 3: Web Login (Email/Password)

```
1. <SignIn /> component → email/password → Better Auth session
2. Stripe auto-creates customer on signup
3. <PlanPicker /> → Stripe Checkout → subscription
4. Webhook → subscription record updated
5. checkUsage() gates features based on plan
```

## Agent Integration: How Agents Use Corral

### The Layered Approach

Agents need different things depending on context:

```
Layer 1: llms.txt (any agent, zero setup)
  curl https://corral.dev/llms.txt
  → Complete integration guide, YAML schema, examples
  → Enough for any agent to do a one-shot integration

Layer 2: CORRAL.md (auto-generated, project-specific)
  npx @llamafarm/corral init
  → Generates corral.yaml + CORRAL.md in your project
  → CORRAL.md is auto-discovered by Claude Code, Codex, Cursor
  → Contains project-specific instructions + schema reference

Layer 3: CLI with --json (mechanical automation)
  corral users list --json
  corral stripe sync --json
  corral config validate --json
  → Every command outputs structured JSON for agents

Layer 4: MCP Server (IDE agents)
  npx @better-auth/cli mcp --cursor
  → Better Auth's MCP handles auth questions
  → We extend with Corral-specific tools

Layer 5: Skill (SKILL.md — repeated deep use)
  → For OpenClaw / dedicated agents that manage auth regularly
  → Full step-by-step workflows for common tasks
```

### What `corral init` Generates

```bash
$ npx @llamafarm/corral init

Analyzing project...
  ✓ Next.js 15 detected (App Router)
  ✓ PostgreSQL (DATABASE_URL found)
  ✓ Tailwind + shadcn/ui detected
  ✓ No existing auth found

Creating:
  ✓ corral.yaml          — auth/billing config (edit this!)
  ✓ CORRAL.md            — agent instructions (auto-discovered)
  ✓ lib/corral.ts        — server setup
  ✓ app/api/auth/[...all]/route.ts  — route handler

Next steps:
  1. Edit corral.yaml (plans, meters, nudges)
  2. Run: corral dev
  3. Add <CorralProvider> to your layout
  4. Add <SignIn />, <UserButton />, etc.
```

### The Generated CORRAL.md

```markdown
# CORRAL.md — Agent Instructions

This project uses Corral for auth, billing, and usage tracking.

## Files
- `corral.yaml` — all config (plans, meters, nudges, UI, seeding)
- `lib/corral.ts` — server setup (rarely edit)
- `app/api/auth/[...all]/route.ts` — route handler (don't edit)

## Quick Tasks
- **Change a plan limit**: edit `meters.[name].limits` in corral.yaml
- **Add a new plan**: add to `billing.plans` in corral.yaml
- **Add usage tracking**: use `checkUsage()` + `recordUsage()` from '@llamafarm/corral'
- **Add a nudge**: add to `nudges` in corral.yaml
- **Add a UI component**: import from '@llamafarm/corral-ui'

## Available Components
<SignIn />, <SignUp />, <UserButton />, <ProfilePage />,
<PlanPicker />, <UsageMeters />, <PaywallModal />,
<NudgeBanner />, <AdminDashboard />

## CLI Commands
corral dev              # Start dev server
corral seed             # Seed database
corral stripe sync      # Sync plans to Stripe
corral config validate  # Check config

## YAML Schema
[full schema with descriptions and examples]
```

**Any coding agent that reads CORRAL.md knows exactly how to work with this project's auth.** No skill installation, no MCP setup, no docs lookup.

### The llms.txt (Zero Setup, One-Shot)

```
# Corral — Embedded Auth + Billing for TypeScript Apps

> Plug-and-play auth, billing, usage tracking, and admin.
> Not a service — a library you mount in your existing app.

## Install
npm install @llamafarm/corral @llamafarm/corral-ui

## Setup
npx @llamafarm/corral init
# Generates corral.yaml + route handler + CORRAL.md

## Config (corral.yaml)
[full annotated example]

## Components
[list with usage examples]

## API
[checkUsage, recordUsage, createCorral]

## CLI
[all commands]
```

An agent working on a random project can fetch this URL, read it, and integrate Corral in one turn. No skill, no MCP, no setup.

## CLI: YAML Editor UI

```bash
# Open visual YAML editor in browser
corral config edit
# → Opens http://localhost:3100/_corral/editor
# → Simple web UI for editing corral.yaml
# → Live validation, preview of plan cards, meter components
# → Save writes back to corral.yaml on disk

# Features:
# - Plan editor: drag to reorder, visual price cards
# - Meter editor: set limits with sliders, preview progress bars
# - Nudge editor: write message, pick trigger, preview banner
# - Seed editor: add/remove test users
# - Live preview: see components as you edit config
```

The editor is a **single static HTML page** bundled with the CLI (like the DemoFly viewer). No build step, no React dev server. Just serves a file.

```bash
# Non-interactive config changes (for agents)
corral config set billing.plans.pro.price 39
corral config set meters.video.created.limits.free.max 3
corral config validate
corral config diff    # Shows what changed
corral config apply   # Migrates + syncs Stripe
```

## Package Structure

```
@llamafarm/corral              # Core: createCorral(), checkUsage(), recordUsage()
@llamafarm/corral-ui           # React: SignIn, PlanPicker, AdminDashboard, etc.
@llamafarm/corral-client       # Client SDK: CLI auth, token management
corral                         # CLI: init, dev, seed, config edit, stripe sync
```

All installed into YOUR project. No separate infrastructure.

## Integration Example: Full DemoFly

```typescript
// demofly-web/lib/corral.ts
import { createCorral } from '@llamafarm/corral';
export const corral = createCorral({ configPath: './corral.yaml' });

// demofly-web/app/api/auth/[...all]/route.ts
import { corral } from '@/lib/corral';
export const { GET, POST } = corral.handlers;

// demofly-web/app/layout.tsx
import { CorralProvider, UserButton, NudgeBanner } from '@llamafarm/corral-ui';
export default function Layout({ children }) {
  return (
    <CorralProvider>
      <header>
        <UserButton />
      </header>
      <NudgeBanner />
      {children}
    </CorralProvider>
  );
}

// demofly-web/app/settings/page.tsx
import { ProfilePage } from '@llamafarm/corral-ui';
export default function Settings() { return <ProfilePage />; }

// demofly-web/app/admin/page.tsx  
import { AdminDashboard } from '@llamafarm/corral-ui';
export default function Admin() { return <AdminDashboard />; }

// demofly-web/app/api/videos/create/route.ts
import { corral } from '@/lib/corral';
export async function POST(req) {
  const session = await corral.getSession(req);
  const gate = await corral.checkUsage(session.userId, 'video.created');
  if (!gate.allowed) return Response.json(gate, { status: 429 });
  
  // ... create video ...
  
  await corral.recordUsage(session.userId, 'video.created', 1, { quality: '1080p' });
  return Response.json({ success: true });
}
```

```typescript
// demofly-cli/src/auth.ts — CLI uses client SDK
import { createCLIAuth } from '@llamafarm/corral-client/cli';

export const auth = createCLIAuth({
  serverUrl: 'https://demofly.dev',      // Same app! Not a separate auth server.
  appId: 'demofly',
  tokenPath: '~/.config/demofly/auth.json',
});
```

**The auth server IS the app server.** One URL, one deploy, one database.

## Deployment

| Platform | Database | How |
|----------|----------|-----|
| **Railway** | PostgreSQL (add-on) | `railway add postgresql` → DATABASE_URL auto-set |
| **Vercel** | Neon/Supabase | Set DATABASE_URL in env vars |
| **Fly.io** | Fly Postgres | `fly postgres create` → set secret |
| **Cloudflare** | D1 | `wrangler d1 create` → adapter: d1 |
| **Self-hosted** | Any PostgreSQL/MySQL | Set DATABASE_URL |
| **Local dev** | SQLite | Default, zero config |

**Zero Corral-specific infrastructure.** Deploy your app however you normally deploy it.

## Tech Stack

| Component | Choice | Why |
|-----------|--------|-----|
| Auth engine | Better Auth | Free, plugins for everything, agent-friendly |
| Auth UI base | @daveyplate/better-auth-ui | Pre-built shadcn login/signup/settings |
| Billing/usage UI | Our components on shadcn | Plan picker, meters, paywall, admin |
| Payments | Stripe via Better Auth plugin | First-party, handles everything |
| Database | Whatever you have | Kysely/Drizzle/Prisma adapters |
| Config | YAML | Human-readable, agent-writable, diffable |
| CLI | Commander.js + tsup | init, dev, seed, config edit |
| Agent docs | llms.txt + CORRAL.md + Skill | Layered: zero-setup → deep integration |

## Why This Works

1. **Not a service** — no Docker, no separate deploy, no network hops
2. **Your database** — adds tables alongside yours, uses your existing connection
3. **Your framework** — Next.js, Hono, Express, Cloudflare Workers, whatever
4. **Agent-native** — llms.txt for one-shot, CORRAL.md for project context, Skill for deep use
5. **Config-driven** — YAML is the interface, agents and humans edit the same file
6. **Visual editor** — `corral config edit` for humans who don't want to touch YAML
7. **One command start** — `corral dev` = migrate + seed + serve + admin dashboard
