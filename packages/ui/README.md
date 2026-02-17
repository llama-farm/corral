# 🐴 @llamafarm/corral-ui

> React components for Corral — auth flows, billing dashboards, and usage meters.

[![npm version](https://img.shields.io/npm/v/@llamafarm/corral-ui)](https://www.npmjs.com/package/@llamafarm/corral-ui)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## What it does

`@llamafarm/corral-ui` is the React component layer for the Corral SaaS toolkit. Works with `@llamafarm/corral` on the server to give you a complete full-stack auth + billing UI.

## Components

| Component | Description |
|-----------|-------------|
| `<AuthUI />` | Sign in / sign up / magic link / OAuth flows |
| `<BillingPortal />` | Plan selection, upgrade/downgrade, payment methods |
| `<UsageMeter />` | Real-time usage gauge with limit indicators |
| `<UpgradePrompt />` | Contextual upgrade CTA when users hit limits |
| `<AdminDashboard />` | Full admin view — users, subscriptions, usage (via `/admin` export) |

## Install

```bash
npm install @llamafarm/corral-ui
```

Requires React 18 or 19 as a peer dependency.

## Quick Usage

```tsx
import { AuthUI } from '@llamafarm/corral-ui';

export default function LoginPage() {
  return (
    <AuthUI
      callbackURL="/dashboard"
      socialProviders={['github', 'google']}
    />
  );
}
```

```tsx
// Admin dashboard (separate bundle)
import { AdminDashboard } from '@llamafarm/corral-ui/admin';

export default function AdminPage() {
  return <AdminDashboard />;
}
```

## Exports

| Export | Description |
|--------|-------------|
| `@llamafarm/corral-ui` | Auth, billing, and usage components |
| `@llamafarm/corral-ui/admin` | Admin dashboard (tree-shakeable, larger bundle) |

## Docs

📖 Full documentation at **[llama-farm.github.io/corral](https://llama-farm.github.io/corral/)**

## License

MIT © [llama-farm](https://github.com/llama-farm)
