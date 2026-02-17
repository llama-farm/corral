# 🦙 Corral

**Auth + payments your AI agent can set up.**

Point your coding agent (OpenClaw, Claude Code, Codex, Cursor) at Corral.
Tell it what you need. It adds login, Stripe billing, and feature gating to
your app in one conversation.

[![CI](https://github.com/llama-farm/corral/actions/workflows/ci.yml/badge.svg)](https://github.com/llama-farm/corral/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/@llamafarm/corral?label=%40llamafarm%2Fcorral)](https://www.npmjs.com/package/@llamafarm/corral)
[![npm](https://img.shields.io/npm/v/corral?label=corral%20CLI)](https://www.npmjs.com/package/corral)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

---

## For Agents

```bash
# Your agent runs:
npx create-corral init
npx create-corral add plan pro --price 29
npx create-corral add provider google
npx create-corral validate
# Done. Your app has auth + payments.
```

**Agent context:** Tell your agent to read [`llms.txt`](https://corralauth.dev/llms.txt)
or [`llms-full.txt`](https://corralauth.dev/llms-full.txt) for the full spec.

Works with: **OpenClaw** (native skill) · **Claude Code** · **Codex** · **Cursor** · **Windsurf** · **Aider** · any agent that can run CLI commands

→ [Full agent integration guide](https://corralauth.dev/agents.html)

## For Humans

```
You: "Add auth and Stripe billing. Free tier and Pro at $29/mo with Google login."
Agent: Done. Login at localhost:3000/login.
```

Tell your AI coding assistant what you want. Corral handles the plumbing.

---

## What Corral Does

Corral bundles auth + billing + feature gating into a single cohesive toolkit,
configured by one YAML file. Built on [better-auth](https://better-auth.com),
[Hono](https://hono.dev/), and [Stripe](https://stripe.com).

- 🔐 **Authentication** — email/password, OAuth (Google, GitHub, etc.), magic links, sessions
- 💳 **Billing** — Stripe subscriptions, usage-based pricing, payment portal, webhooks
- 🔒 **Feature gating** — plan-aware `FeatureGate` components and `requireFeature()` middleware
- 📊 **Usage tracking** — increment counters, enforce limits, expose usage APIs
- 🗄️ **Multi-database** — SQLite (dev), PostgreSQL, MySQL (production)
- 🤖 **Agent-native** — `--json` on every CLI command, `CORRAL.md` generated at init, `/api/llms.txt`
- 🧩 **Framework-agnostic** — Next.js, Express, Hono, Fastify; Python, Go, Rust validators

## Quick Start (Humans)

```bash
# 1. Scaffold auth + billing into your existing app
npx create-corral init

# 2. Add your Stripe & auth secrets
cp .env.local.example .env.local

# 3. Start the dev server
npm run dev
```

That's it. You have auth, billing, and feature gating running locally.

## Quick Start (Agents)

Agents: read [`llms.txt`](https://corralauth.dev/llms.txt) for the full spec.
The 9-command workflow:

```bash
corral analyze --json          # 1. understand the project
corral init --yes --json       # 2. scaffold everything
corral add provider google     # 3. add OAuth
corral add plan pro --price 29 # 4. add paid plan
corral add feature X --plans pro --gate blur --json  # 5. gate a feature
corral add meter api_calls --limit 10000 --json      # 6. add usage meter
corral stripe push --json      # 7. sync to Stripe
corral validate --json         # 8. verify everything (exit 0 = deploy-ready)
corral seed --env test --json  # 9. seed test users
```

All commands output `--json` with structured `{ "status": "ok", "result": {...}, "next_steps": [...] }`.
Errors always include a `"fix"` field.

## Packages

| Package | Description | npm |
|---------|-------------|-----|
| [`@llamafarm/corral`](packages/server) | Server core — auth, billing, gating, DB adapters | [![npm](https://img.shields.io/npm/v/@llamafarm/corral)](https://www.npmjs.com/package/@llamafarm/corral) |
| [`@llamafarm/corral-ui`](packages/ui) | React components — auth flows, billing UI, usage meters | [![npm](https://img.shields.io/npm/v/@llamafarm/corral-ui)](https://www.npmjs.com/package/@llamafarm/corral-ui) |
| [`corral`](packages/cli) | CLI — scaffold projects, add features, manage config | [![npm](https://img.shields.io/npm/v/corral)](https://www.npmjs.com/package/corral) |

## Monorepo Structure

```
corral/
├── packages/
│   ├── server/     # @llamafarm/corral
│   ├── ui/         # @llamafarm/corral-ui
│   └── cli/        # corral (CLI)
├── docs/           # GitHub Pages site
├── templates/      # Project scaffold templates
└── turbo.json      # Turborepo config
```

## Development

```bash
# Install dependencies
npm install

# Build all packages
npm run build

# TypeScript check
npm run typecheck

# Watch mode
npm run dev
```

## Releasing

This project uses [Changesets](https://github.com/changesets/changesets) for versioning.

```bash
# 1. Create a changeset describing your changes
npm run changeset

# 2. Version packages (updates package.json + CHANGELOG)
npm run version

# 3. Publish to npm (CI does this automatically on git tags)
npm run release
```

## Docs

📖 **[corralauth.dev](https://corralauth.dev)**

- [Agent Integration Guide](https://corralauth.dev/agents.html) — for AI coding agents
- [llms.txt](https://corralauth.dev/llms.txt) — agent-readable spec
- [Quickstart](https://corralauth.dev/quickstart.html) — for humans

## Contributing

Contributions welcome! Please open an issue before submitting large PRs.

## License

[MIT](LICENSE) © [llama-farm](https://github.com/llama-farm)

---

*Built by LlamaFarm 🦙 · Made for agents, works for humans too*
