# Corral CLI Auth — Design Doc

## The Problem

Many LlamaFarm/Rownd tools are CLI-first (or CLI-only):
- `demofly` — demo video generator
- `corral` itself — auth/billing CLI
- Future: LlamaFarm model manager, Atmosphere mesh tools

These tools need auth + billing but have NO web UI (or just a landing page).
The experience must be fluid — not "go to this URL and paste a token."

## Design Principles

1. **Agent-native**: The primary user is an AI agent, not a human developer
2. **CLI-first**: Auth flow happens in the terminal, not a browser
3. **Frictionless**: `myapp login` should take <10 seconds
4. **Device tokens**: Long-lived, stored safely, auto-refreshed
5. **Plan gating in CLI**: `myapp pro-feature` → "Upgrade to Pro to use this. Run: myapp upgrade"
6. **Payment in CLI**: Opens browser for Stripe, but returns to CLI automatically

## Auth Flows

### Flow 1: Device Authorization (recommended for CLIs)

Like `gh auth login` or `stripe login`. Best UX for CLIs.

```
$ myapp login
🔐 Opening browser to authorize this device...
   If browser doesn't open, visit: https://myapp.dev/device?code=ABCD-1234
   
   Waiting for authorization... ✓
   
   Logged in as rob@rownd.ai (Pro plan)
   Device token saved to ~/.config/myapp/credentials.json
```

**How it works:**
1. CLI generates a device code + user code
2. CLI opens browser to `{baseURL}/device?code=XXXX`
3. User logs in (or is already logged in) in browser
4. User clicks "Authorize" 
5. CLI polls `/api/auth/device/token` until approved
6. CLI receives a long-lived device token
7. Token stored in `~/.config/{app}/credentials.json`

**Server-side:**
```ts
// New Corral endpoint: POST /api/corral/device/authorize
// Creates device_code + user_code, stores in DB
// Returns { deviceCode, userCode, verificationUrl, expiresIn, interval }

// New Corral endpoint: POST /api/corral/device/token  
// CLI polls this with deviceCode
// Returns { accessToken, refreshToken, user } when authorized
// Returns { error: "authorization_pending" } while waiting

// New Corral endpoint: GET /api/corral/device/verify?code=XXXX
// Browser page — shows "Authorize this device?" with user info
// POST to approve — marks device as authorized
```

### Flow 2: API Key (for agents/automation)

```
$ myapp login --api-key
🔑 Enter your API key: sk_live_xxxxxxxxxxxxx
   
   Authenticated as rob@rownd.ai (Pro plan)
   Key saved to ~/.config/myapp/credentials.json
```

**How it works:**
1. User generates API key from web dashboard or `corral users create-key`
2. CLI stores key in config
3. Every CLI request includes `Authorization: Bearer sk_live_xxx`

### Flow 3: Token from Environment (CI/CD)

```bash
export MYAPP_TOKEN=sk_live_xxxxxxxxxxxxx
myapp deploy  # automatically uses token from env
```

## Token Storage

```
~/.config/{app}/
├── credentials.json    # { token, refreshToken, expiresAt, user }
├── config.json         # CLI preferences (output format, default project, etc.)
└── .corral-session     # Symlink or copy — Corral manages this
```

**Security:**
- File permissions: 0600 (owner read/write only)
- On macOS: optionally store in Keychain via `security` command
- On Linux: optionally store in libsecret/keyring
- Fallback: encrypted JSON file with machine-specific key
- Never store in git-accessible locations

**Token refresh:**
- Device tokens have 30-day expiry
- CLI auto-refreshes on every command if <7 days remaining
- Refresh is transparent — user never sees it
- If refresh fails → prompt re-login

## CLI Subcommands (what `corral init` adds to your CLI)

```
myapp account            # Show current account info
myapp account login      # Device auth flow
myapp account logout     # Clear stored credentials
myapp account status     # Plan, usage, billing info
myapp account upgrade    # Open upgrade page in browser
myapp account token      # Print current token (for piping)
myapp account keys       # List/create/revoke API keys
```

For Corral's own CLI:
```
corral login             # Auth as developer (manages projects)
corral logout
corral status            # MRR, users, plans (dev dashboard)
corral whoami            # Current auth state
```

## Plan Gating in CLI

When a CLI-only user tries a pro feature:

```
$ myapp render --4k
⚡ 4K rendering requires a Pro plan.
   You're on the Free plan (1080p max).
   
   Upgrade to Pro ($29/mo) for:
   ✓ 4K rendering
   ✓ Custom branding
   ✓ Priority queue
   
   → Run: myapp account upgrade
   → Or visit: https://myapp.dev/pricing
```

**Implementation:**
```ts
// In the CLI tool's code:
import { requirePlan } from '@llamafarm/corral-client';

// Before running the feature:
const access = await requirePlan('pro');
if (!access.allowed) {
  console.log(access.upgradeMessage);  // Auto-generated from config
  process.exit(1);
}
```

## Payment Flow for CLI Users

```
$ myapp account upgrade

💰 Available plans:

  Free (current)     $0/mo    1080p, 10 renders/mo
  Pro (recommended)  $29/mo   4K, 100 renders/mo, custom branding
  Team               $99/mo   Everything + team sharing

  Select plan: pro

🔗 Opening checkout in browser...
   If browser doesn't open, visit:
   https://myapp.dev/checkout?session=cs_xxx

   Waiting for payment... ✓

🎉 Upgraded to Pro! Your new features are available immediately.
```

**How it works:**
1. CLI calls `/api/corral/checkout` with plan + userId
2. Server creates Stripe checkout session
3. CLI opens browser with checkout URL
4. CLI polls `/api/corral/subscription/status?userId=xxx` every 2 seconds
5. When subscription activates (webhook processes), poll returns new plan
6. CLI celebrates and exits

## Corral Client SDK (`@llamafarm/corral-client`)

Lightweight SDK for CLI tools to integrate with Corral:

```ts
import { CorralClient } from '@llamafarm/corral-client';

const corral = new CorralClient({
  baseURL: 'https://myapp.dev',  // or from config
  tokenPath: '~/.config/myapp/credentials.json',
});

// Auth
await corral.login();           // Device auth flow
await corral.logout();
const user = await corral.getUser();  // Current user + plan

// Gating
const access = await corral.checkFeature('4k-render');
if (!access.allowed) { /* show upgrade message */ }

// Usage
await corral.track('renders');  // Increment usage counter
const usage = await corral.getUsage('renders');
// { used: 7, limit: 10, remaining: 3, resetAt: '2026-03-01' }

// Billing
await corral.upgrade('pro');    // Opens browser checkout + polls
const sub = await corral.getSubscription();
// { plan: 'pro', status: 'active', currentPeriodEnd: '...' }
```

## Device Auth Database Schema

```sql
CREATE TABLE IF NOT EXISTS "device_authorization" (
  id TEXT PRIMARY KEY,
  deviceCode TEXT NOT NULL UNIQUE,    -- Random, used by CLI to poll
  userCode TEXT NOT NULL UNIQUE,      -- Short, shown to user (ABCD-1234)
  userId TEXT,                         -- Set when user authorizes
  status TEXT NOT NULL DEFAULT 'pending', -- pending | authorized | expired | denied
  clientId TEXT,                       -- Which CLI app
  scope TEXT DEFAULT '*',
  expiresAt TEXT NOT NULL,
  createdAt TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS "device_token" (
  id TEXT PRIMARY KEY,
  token TEXT NOT NULL UNIQUE,          -- The actual bearer token
  refreshToken TEXT NOT NULL UNIQUE,
  userId TEXT NOT NULL REFERENCES "user"(id),
  deviceName TEXT,                     -- "Rob's MacBook Pro"
  lastUsed TEXT,
  expiresAt TEXT NOT NULL,
  createdAt TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS "api_key" (
  id TEXT PRIMARY KEY,
  key TEXT NOT NULL UNIQUE,            -- sk_live_xxx or sk_test_xxx
  prefix TEXT NOT NULL,                -- First 8 chars for identification
  userId TEXT NOT NULL REFERENCES "user"(id),
  name TEXT,                           -- "CI/CD Key"
  permissions TEXT DEFAULT '*',        -- JSON array of scopes
  lastUsed TEXT,
  expiresAt TEXT,                      -- null = never expires
  createdAt TEXT NOT NULL DEFAULT (datetime('now'))
);
```

## Integration: How an Agent Adds Auth to a CLI

An agent (like Scout) running `corral init` on a CLI project should:

1. Detect it's a CLI (no React, no Next.js, has `bin` in package.json)
2. Install `@llamafarm/corral-client`
3. Generate:
   - `src/auth.ts` — CorralClient setup
   - `src/commands/account.ts` — login/logout/status/upgrade subcommands
   - Token storage config
4. Add `account` to the CLI's command tree
5. Add `requirePlan()` guards to premium commands

Total agent effort: read the CLI's structure, add 2 files, wire into command tree.
Total human effort: `corral init` → done.

## Edge Cases

- **Offline mode**: Cache user/plan info locally. Commands work offline if plan was cached <24h ago.
- **Multiple accounts**: `myapp account switch` — store multiple tokens, default to last used.
- **Team/org**: Device tokens can be scoped to an org. `myapp account org set <org-id>`.
- **Token revocation**: Dashboard or `corral users revoke-device <id>` invalidates immediately.
- **Rate limiting**: Device auth polling has exponential backoff. Max 5 min wait.
