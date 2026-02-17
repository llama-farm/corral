# 🦙 corral (CLI)

> Scaffold Corral-powered SaaS apps in seconds.

[![npm version](https://img.shields.io/npm/v/corral)](https://www.npmjs.com/package/corral)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## What it does

The `corral` CLI scaffolds and manages [Corral](https://llama-farm.github.io/corral/)-powered SaaS projects. One command stands up auth, billing, and database configuration — no copy-pasting boilerplate.

## Quick Start

```bash
npx corral init my-app
```

## Commands

| Command | Description |
|---------|-------------|
| `corral init [name]` | Scaffold a new Corral project |
| `corral add auth` | Add auth configuration to existing project |
| `corral add billing` | Add Stripe billing to existing project |
| `corral add gate <name>` | Add a feature gate |
| `corral dev` | Start dev server with live reloading |
| `corral login` | Authenticate with Corral Cloud |
| `corral logout` | Sign out |
| `corral --help` | Show all commands |

## What `corral init` generates

```
my-app/
├── corral.yaml           # Corral config
├── src/
│   ├── auth.ts           # Auth setup
│   ├── billing.ts        # Stripe integration
│   └── gates.tsx         # Feature gates
├── .env.local.example    # Required env vars
└── package.json
```

## Docs

📖 Full documentation at **[llama-farm.github.io/corral](https://llama-farm.github.io/corral/)**

## License

MIT © [llama-farm](https://github.com/llama-farm)
