# 🐴 Corral

> Auth, billing, and API gating for SaaS apps — drop-in, batteries included.

[![CI](https://github.com/llama-farm/corral/actions/workflows/ci.yml/badge.svg)](https://github.com/llama-farm/corral/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/@llamafarm/corral?label=%40llamafarm%2Fcorral)](https://www.npmjs.com/package/@llamafarm/corral)
[![npm](https://img.shields.io/npm/v/corral?label=corral%20CLI)](https://www.npmjs.com/package/corral)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

---

Corral bundles the auth + billing + gating plumbing that every SaaS app needs into a single cohesive toolkit. Built on [better-auth](https://better-auth.com), [Hono](https://hono.dev/), and [Stripe](https://stripe.com).

## Quick Start

```bash
# 1. Scaffold a new project
npx corral init my-app

# 2. Add your Stripe & auth secrets
cp .env.local.example .env.local

# 3. Start the dev server
npm run dev
```

That's it. You have auth, billing, and feature gating running locally.

## Features

- 🔐 **Authentication** — email/password, OAuth (GitHub, Google, etc.), magic links, sessions
- 💳 **Billing** — Stripe subscriptions, usage-based pricing, payment portal, webhooks
- 🔒 **Feature gating** — plan-aware `corralGate()` middleware and React `<Gate>` components
- 📊 **Usage tracking** — increment counters, enforce limits, expose usage APIs
- 🗄️ **Multi-database** — SQLite (dev), PostgreSQL, MySQL (production)
- ⚡ **ESM-first** — tree-shakeable, fast, works anywhere Node runs
- 🧩 **Framework-agnostic** — Hono core, adapters for Next.js, Remix, and plain Node

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

📖 **[llama-farm.github.io/corral](https://llama-farm.github.io/corral/)**

## Contributing

Contributions welcome! Please open an issue before submitting large PRs.

## License

[MIT](LICENSE) © [llama-farm](https://github.com/llama-farm)
