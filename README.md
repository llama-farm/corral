# 🦙 Corral

### You don't add auth to your app. Your agent does.

[![npm](https://img.shields.io/npm/v/create-corral?label=create-corral&color=f59e0b)](https://www.npmjs.com/package/create-corral)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

---

## ⚡ Get Started in 10 Seconds

Copy this into your AI coding agent (Claude Code, Cursor, Codex, OpenClaw, Windsurf — anything):

```
Read: https://llama-farm.github.io/corral/llms.txt

Add auth and Stripe billing to my app. Free tier + Pro
at $29/mo with 14-day trial. Wire up everything: login,
signup, profile page, admin dashboard, upgrade banners,
and feature gating.
```

That's it. Your agent reads the spec, runs the CLI, wires the UI. You ship.

---

## 🤔 What Just Happened?

Your agent ran `npx create-corral init`, which:

1. **Detected your framework** — Express, Next.js, Hono, Fastify, Koa, Vite+React, FastAPI, and [13+ more](https://llama-farm.github.io/corral/frameworks.html)
2. **Embedded auth into your existing server** — no new services, no Docker, same database
3. **Generated everything:**

| What | File |
|------|------|
| Auth setup (Better Auth + your DB) | `src/lib/corral.ts` |
| Login, signup, sessions, OAuth | `/api/auth/*` routes |
| Profile page (edit name, password, delete account) | `src/components/ProfilePage.tsx` |
| Admin dashboard (users, roles, plan overrides) | `src/components/AdminPanel.tsx` |
| Account menu (dropdown for navbar) | `src/components/AccountMenu.tsx` |
| Plan gating (`<PlanGate>`, `<FeatureGate>`, blur/block) | `src/gates.tsx` |
| Auth hook + provider | `src/auth-context.tsx` |
| Stripe checkout, billing portal, webhooks | `/api/corral/*` routes |
| Agent integration guide | `CORRAL.md` |
| Config (plans, features, meters, auth) | `corral.yaml` |

4. **Showed your agent the full feature list** — so it proactively wires up profile pages, upgrade banners, and admin dashboards without you asking

---

## 🎁 Everything You Get

### Ready to use (works immediately)
- ✅ Email/password sign-up & sign-in
- ✅ Social login (Google, GitHub, Apple, Discord + 6 more)
- ✅ Magic link & email OTP (passwordless)
- ✅ Session management, password reset, email verification

### Generated components (your agent wires them up)
- 🔌 **Account Menu** — navbar dropdown: profile, settings, upgrade, admin, sign out
- 🔌 **Profile Page** — edit name, change password, manage email, delete account
- 🔌 **Admin Dashboard** — user list, role management, plan overrides, usage stats
- 🔌 **Sign-in / Sign-up Pages** — social buttons, magic link, OTP tabs
- 🔌 **Upgrade Banner** — shows free users what they're missing

### Billing & monetization (Stripe-powered)
- 🔌 **Pricing Table** — auto-generated from `corral.yaml`, monthly/annual toggle
- 🔌 **One-click upgrade** → Stripe Checkout → back to your app
- 🔌 **Billing Portal** — manage subscription, invoices, payment method
- 🔌 **Plan Gating** — `<PlanGate plan="pro">` with blur/skeleton/block modes
- 🔌 **Usage Metering** — track API calls, storage, etc. with per-plan limits
- 🔌 **Free Trials** — configurable per plan (default 14 days)

### Developer & admin tools
- 🔌 **Feature Flags** — `<FeatureGate feature="ai-chat">` per-plan toggling
- 🔌 **CLI Auth** — device authorization flow (like `gh auth login`)
- 🔌 **API Keys** — programmatic access for integrations
- 🔌 **Deploy** — `corral deploy docker|fly|railway|render`

---

## 🔧 The 9-Command Workflow

Your agent runs these. You don't have to.

```bash
corral analyze --json          # 1. understand the project
corral init --yes --json       # 2. scaffold everything
corral add provider google     # 3. add OAuth
corral add plan pro --price 29 # 4. add paid plan
corral add feature ai --plans pro --gate blur  # 5. gate a feature
corral add meter api_calls --limit 10000       # 6. add usage meter
corral stripe sync --json      # 7. sync to Stripe
corral validate --json         # 8. verify everything
corral seed --env test --json  # 9. seed test users
```

Every command supports `--json`. Errors include a `"fix"` field. Exit 0 = deploy-ready.

---

## 📋 More Prompts to Try

**Just auth, no billing:**
```
Read: https://llama-farm.github.io/corral/llms.txt
Add authentication to my app with email + Google login.
```

**Add to existing project:**
```
Read: https://llama-farm.github.io/corral/llms.txt
Add Corral auth + billing to this project. Detect my
framework and embed into my existing server.
```

**Deploy:**
```
Read: https://llama-farm.github.io/corral/llms.txt
Generate Docker + Railway deployment configs for this app.
```

---

## 🏗️ How It Works

Corral is **not a hosted service**. It's a CLI that generates code into your project.

- **One YAML config** (`corral.yaml`) — plans, features, meters, auth providers
- **Embedded, not hosted** — mounts as route handlers in your app, same DB, same process
- **Built on** [Better Auth](https://better-auth.com) + [Stripe](https://stripe.com)
- **Agent-native** — `llms.txt` spec, `CORRAL.md` guide, `--json` everywhere, `.corral/agent-checklist.json`

### Supported frameworks
Express · Hono · Fastify · Koa · Hapi · NestJS · Polka · Restify · AdonisJS · Elysia · H3/Nitro · Next.js · Vite+React · CRA · FastAPI · Django · Flask

### Supported databases
SQLite (default) · PostgreSQL · MySQL · Turso/libSQL · Cloudflare D1

---

## 📖 Docs

**[llama-farm.github.io/corral](https://llama-farm.github.io/corral/)**

- [Quickstart](https://llama-farm.github.io/corral/quickstart.html)
- [Agent Guide](https://llama-farm.github.io/corral/agents.html)
- [CLI Reference](https://llama-farm.github.io/corral/cli.html)
- [Frameworks](https://llama-farm.github.io/corral/frameworks.html)
- [Billing](https://llama-farm.github.io/corral/billing.html)
- [Gating](https://llama-farm.github.io/corral/gating.html)
- [Deploy](https://llama-farm.github.io/corral/deployment.html)
- [llms.txt](https://llama-farm.github.io/corral/llms.txt) — agent-readable spec

---

## License

[MIT](LICENSE) © [LlamaFarm](https://github.com/llama-farm)

*Built for agents, works for humans too* 🦙
