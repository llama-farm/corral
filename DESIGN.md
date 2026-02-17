# Corral — Complete Design Document

*The plug-and-play auth, billing, and admin system for all LlamaFarm/Rownd projects.*

## Design Principles

1. **One YAML file = entire auth/billing experience.** Agent or human edits `corral.yaml`, everything else derives from it.
2. **Users never leave your app.** No Stripe portal, no auth provider dashboard. Everything is in-app: login, profile, billing, upgrade, cancel.
3. **Admins never leave the admin dashboard.** No Stripe dashboard (except initial API key), no Better Auth console. Everything managed in one place.
4. **Agents do the heavy lifting.** The YAML is the interface. Agents read it, generate code, wire components. Humans tweak the YAML.
5. **Static enough to deploy anywhere.** The UI components are React/shadcn. The server is a single Hono app. Deploy to Vercel, Fly, Railway, Docker, whatever.
6. **Easy to change, hard to break.** Config-driven means changes are declarative. No hunting through code to change a plan limit or add a nudge.

---

## The Config: `corral.yaml`

This is the single source of truth. Everything — server, UI, billing, admin, seeding — reads from this file.

```yaml
# corral.yaml — complete product auth/billing configuration

app:
  id: demofly
  name: DemoFly
  domain: demofly.dev                    # Production domain
  logo: /logo.svg                        # Path or URL
  favicon: /favicon.ico
  colors:
    primary: "#6366f1"                   # Indigo
    accent: "#f59e0b"                    # Amber
  support_email: support@demofly.dev

# ─── Authentication ───────────────────────────────────────

auth:
  server_url: https://auth.llamafarm.com  # Shared auth server
  methods:
    email_password: true
    magic_link: false
    google: false                         # Enable later
    github: false
  session:
    max_age: 30d
    refresh: true
  device_auth:                            # CLI login flow
    enabled: true
    verification_path: /device
    polling_interval_ms: 3000
    code_lifetime: 300                    # 5 minutes
  api_keys:
    enabled: true
    prefix: "df_"                         # DemoFly keys start with df_
    default_expiry: 90d
    rate_limit:
      window: 60s
      max_requests: 100

# ─── Plans & Billing ─────────────────────────────────────

billing:
  provider: stripe
  currency: usd
  trial_days: 14                          # Default trial for paid plans
  cancel_behavior: end_of_period          # immediate | end_of_period
  
  plans:
    free:
      display_name: "Starter"
      price: 0
      badge_color: "#94a3b8"              # Slate
      features:
        - "1 demo video per day"
        - "720p quality"
        - "DemoFly watermark"
        - "5 min TTS per month"
      cta: "Get Started Free"

    pro:
      display_name: "Pro"
      stripe_price_id: price_pro_monthly
      price: 29
      interval: month
      badge_color: "#6366f1"              # Indigo
      popular: true                       # Shows "Most Popular" badge
      trial: true                         # Uses billing.trial_days
      features:
        - "100 demo videos per month"
        - "1080p quality"
        - "No watermark"
        - "2 hours TTS per month"
        - "Share links"
        - "Priority support"
      cta: "Start Free Trial"

    team:
      display_name: "Team"
      stripe_price_id: price_team_monthly
      price: 99
      interval: month
      badge_color: "#8b5cf6"              # Violet
      trial: true
      features:
        - "1,000 demo videos per month"
        - "4K quality"
        - "No watermark"
        - "Custom voice clones"
        - "Team library"
        - "10 seats included"
        - "SSO"
      cta: "Start Free Trial"

    enterprise:
      display_name: "Enterprise"
      price: custom
      badge_color: "#0ea5e9"              # Sky
      features:
        - "Unlimited everything"
        - "Self-hosted option"
        - "Custom integrations"
        - "Dedicated support"
        - "SLA"
      cta: "Contact Sales"
      contact_url: "mailto:enterprise@demofly.dev"

# ─── Usage Metering ──────────────────────────────────────

meters:
  video.created:
    label: "Videos Created"
    unit: videos
    icon: video                            # Lucide icon name
    stripe_meter: demofly_videos
    limits:
      free:    { per: day, max: 1 }
      pro:     { per: month, max: 100 }
      team:    { per: month, max: 1000 }
      enterprise: unlimited
    warning_at: 80                         # Show warning at 80% usage
    nudge:
      at: 100                              # When limit hit
      message: "You've used all your demos today. Upgrade to Pro for 100/month!"
      cta: "Upgrade Now"
      discount_code: FIRSTPRO50           # Optional — auto-applies 50% off

  tts.minutes:
    label: "TTS Minutes"
    unit: minutes
    icon: mic
    stripe_meter: demofly_tts
    limits:
      free:    { per: month, max: 5 }
      pro:     { per: month, max: 120 }
      team:    { per: month, max: 500 }
      enterprise: unlimited
    warning_at: 75
    nudge:
      at: 100
      message: "You're out of TTS minutes. Upgrade for more."
      cta: "See Plans"

  video.max_duration_s:
    label: "Max Video Length"
    type: cap                              # Not metered, just a limit
    limits:
      free: 30
      pro: 300
      team: 600
      enterprise: unlimited

  video.quality:
    label: "Max Quality"
    type: tier
    limits:
      free: "720p"
      pro: "1080p"
      team: "4k"
      enterprise: "4k"

  video.watermark:
    label: "Watermark"
    type: flag                             # Boolean
    limits:
      free: true                           # Has watermark
      pro: false
      team: false
      enterprise: false
    nudge:
      when: true                           # When watermark is ON (free users)
      message: "Remove the DemoFly watermark"
      cta: "Upgrade to Pro — $29/mo"

# ─── Nudges & Engagement ─────────────────────────────────

nudges:
  trial_ending:
    trigger: trial_days_remaining <= 3
    message: "Your Pro trial ends in {days} days. Keep all your features!"
    cta: "Subscribe Now"
    style: banner                          # banner | toast | modal
    position: top                          # top | bottom
    dismissible: true
    show_once_per: session

  onboarding:
    trigger: videos_created == 0
    message: "Create your first demo video in 60 seconds"
    cta: "Create Demo"
    link: /create
    style: banner
    position: bottom
    dismissible: true
    show_once_per: forever                 # Once dismissed, never again

  upgrade_prompt:
    trigger: plan == free && days_since_signup >= 7
    message: "Loving DemoFly? Get 50% off your first month of Pro"
    cta: "Claim Offer"
    discount_code: WEEK50
    style: modal
    show_once_per: week

  payment_failed:
    trigger: payment_status == past_due
    message: "Your payment failed. Update your card to keep your Pro features."
    cta: "Update Payment"
    link: /settings/billing
    style: banner
    position: top
    dismissible: false                     # Can't dismiss — critical
    color: red

  approaching_limit:
    trigger: meter_usage_percent >= warning_at
    message: "You've used {current} of {limit} {meter_label} this {period}"
    style: toast
    position: bottom-right
    show_once_per: day

# ─── UI Components ────────────────────────────────────────

ui:
  framework: react                         # react | vue | svelte (react first)
  style: shadcn                            # shadcn/ui base
  theme: system                            # light | dark | system
  
  pages:
    login:
      path: /login
      redirect_after: /dashboard
      show_social: true                    # If social auth enabled
      show_magic_link: true                # If magic link enabled
      footer_text: "Don't have an account?"
      footer_link: /signup
      footer_link_text: "Sign up free"

    signup:
      path: /signup
      redirect_after: /onboarding
      collect_name: true
      terms_url: /terms
      privacy_url: /privacy
      footer_text: "Already have an account?"
      footer_link: /login

    forgot_password:
      path: /forgot-password
      
    device_verify:
      path: /device
      
    profile:                               # User self-service
      path: /settings
      tabs:
        - id: general
          label: "General"
          sections:
            - type: avatar                 # Upload/change avatar
            - type: name                   # Change display name
            - type: email                  # Change email (with verification)
            - type: password               # Change password
            - type: delete_account         # Danger zone
              confirm_text: "Type DELETE to confirm"
              
        - id: billing
          label: "Billing"
          sections:
            - type: current_plan           # Shows plan badge, features, usage
            - type: plan_picker            # Upgrade/downgrade cards
            - type: payment_method         # Card on file, update
            - type: invoices               # Invoice history, download PDF
            - type: cancel                 # Cancel subscription
              retention_message: "We'd hate to see you go! Here's what you'll lose:"
              retention_offer:
                message: "Stay and get 30% off for 3 months"
                discount_code: STAY30
                
        - id: usage
          label: "Usage"
          sections:
            - type: usage_meters           # All meters with progress bars
            - type: usage_history          # Chart of usage over time
            
        - id: api_keys
          label: "API Keys"
          sections:
            - type: api_key_list           # List, create, revoke API keys
            - type: cli_instructions       # How to use CLI auth
              
        - id: sessions
          label: "Sessions"
          sections:
            - type: active_sessions        # List active sessions, revoke
            - type: devices                # Device list

  components:
    # Embeddable components for use anywhere in the host app
    user_button:                           # Avatar dropdown in header
      show_plan_badge: true
      menu_items:
        - label: "Settings"
          link: /settings
          icon: settings
        - label: "Billing"
          link: /settings/billing
          icon: credit-card
        - divider: true
        - label: "Sign Out"
          action: sign_out
          icon: log-out
          
    usage_badge:                           # Inline usage indicator
      meter: video.created
      style: compact                       # compact | full
      show_in_header: true
      
    upgrade_banner:                        # Full-width upgrade prompt
      show_for: [free]
      message: "Unlock 1080p, remove watermarks, and share anywhere"
      cta: "Upgrade to Pro"
      
    paywall_modal:                         # Shown when hitting a limit
      title: "Upgrade Required"
      show_comparison: true                # Side-by-side plan comparison
      highlight_plan: pro

# ─── Admin Dashboard ──────────────────────────────────────

admin:
  path: /admin                             # Or separate domain: admin.demofly.dev
  require_role: admin
  
  sections:
    overview:
      widgets:
        - type: stat_card
          label: "Total Users"
          query: count(users)
        - type: stat_card
          label: "Active Today"
          query: count(users where last_active > today)
        - type: stat_card
          label: "MRR"
          source: stripe                   # Pull from Stripe
        - type: stat_card
          label: "Videos Today"
          query: sum(usage_events.video.created where period = today)
        - type: chart
          label: "Signups (30d)"
          query: count(users) group by day
          chart_type: bar
        - type: chart
          label: "Revenue (12m)"
          source: stripe
          chart_type: line
          
    users:
      columns:
        - field: name
        - field: email
        - field: plan
          badge: true
        - field: videos_created
          label: "Videos"
        - field: created_at
          label: "Joined"
        - field: last_active
          label: "Last Active"
      actions:
        - label: "View"
          link: /admin/users/{id}
        - label: "Impersonate"
          action: impersonate              # Better Auth admin plugin
        - label: "Change Plan"
          action: change_plan
        - label: "Ban"
          action: ban
          confirm: true
          color: red
          
    subscriptions:
      source: stripe
      show: [active, past_due, trialing, canceled]
      actions:
        - label: "Extend Trial"
          action: extend_trial
        - label: "Apply Discount"
          action: apply_discount
        - label: "Cancel"
          action: cancel_subscription
          
    analytics:
      per_product: true                    # Switch between products
      widgets:
        - type: timeseries
          meters: [video.created, tts.minutes]
          period: 30d
        - type: breakdown
          meter: video.created
          by: metadata.quality
        - type: funnel
          steps: [signup, first_video, second_video, upgrade]
        - type: retention
          cohort: weekly
          
    feature_flags:                         # Override limits per-user
      description: "Override plan limits for specific users (beta access, custom deals)"
      fields:
        - user_id
        - meter
        - override_limit
        - reason
        - expires_at

    nudge_manager:                         # Edit nudges from dashboard
      description: "Live-edit nudge messages, triggers, and targeting without redeploying"
      
    api_keys:                              # View all issued API keys
      columns: [user, key_prefix, created, last_used, expires, status]
      actions: [revoke]

# ─── Seeding ──────────────────────────────────────────────

seed:
  # Run: corral seed (or auto-seed on first boot in dev)
  auto_seed_dev: true                      # Auto-seed when NODE_ENV=development
  
  admin:
    email: rob@rownd.ai
    password: ${SEED_ADMIN_PASSWORD}        # From env var
    name: Rob Thelen
    role: admin
    
  test_users:
    - email: free@test.demofly.dev
      password: ${SEED_TEST_PASSWORD}
      name: "Test Free User"
      plan: free
      usage:                               # Pre-populate usage for testing
        video.created: 0
        
    - email: pro@test.demofly.dev
      password: ${SEED_TEST_PASSWORD}
      name: "Test Pro User"
      plan: pro
      stripe_test_card: pm_card_visa       # Stripe test payment method
      usage:
        video.created: 45
        tts.minutes: 67.5

    - email: limit@test.demofly.dev
      password: ${SEED_TEST_PASSWORD}
      name: "Test At-Limit User"
      plan: free
      usage:
        video.created: 1                   # Already at daily limit
        
    - email: trial@test.demofly.dev
      password: ${SEED_TEST_PASSWORD}
      name: "Test Trial User"
      plan: pro
      trial_ends_in: 2d                    # Trial ending in 2 days
      
    - email: pastdue@test.demofly.dev
      password: ${SEED_TEST_PASSWORD}
      name: "Test Past Due User"
      plan: pro
      payment_status: past_due             # For testing payment failure flows

  stripe_products:                         # Auto-create Stripe products/prices in test mode
    auto_sync: true                        # Creates products + prices from plans config
    
  sample_data:                             # Optional: generate sample analytics data
    enabled: true
    days: 30                               # 30 days of fake usage data
    users: 50                              # 50 fake users with realistic distribution

# ─── Backup ───────────────────────────────────────────────

backup:
  # For cloud deployments — automated database backup strategy
  provider: pg_dump                        # pg_dump | managed (if using managed PG)
  
  schedule:
    full: daily                            # Full backup daily at 3am UTC
    full_time: "03:00"
    incremental: hourly                    # WAL archiving every hour
    
  retention:
    daily: 7                               # Keep 7 daily backups
    weekly: 4                              # Keep 4 weekly backups
    monthly: 6                             # Keep 6 monthly backups
    
  storage:
    provider: s3                           # s3 | r2 | local | gcs
    bucket: corral-backups-${app.id}
    region: us-east-1
    encrypt: true                          # AES-256 encryption at rest
    
  restore:
    # corral backup restore --from latest
    # corral backup restore --from 2026-02-15
    # corral backup restore --from s3://corral-backups-demofly/2026-02-15-full.sql.gz
    test_restore: weekly                   # Auto-test restore to temp DB weekly
    
  alerts:
    on_failure: [email, slack]             # Notify on backup failure
    on_success: false                      # Don't spam on success
    
  # For managed databases (Railway, Supabase, Neon):
  # backup:
  #   provider: managed
  #   notes: "Railway/Supabase handle backups. We just need export for migration."
  #   export_schedule: weekly              # Weekly pg_dump export to S3 as escape hatch

# ─── CLI Commands ─────────────────────────────────────────

# All operations available as CLI commands for agents and humans:
#
# Setup:
#   corral init                           # Interactive setup, generates corral.yaml
#   corral init --from demofly-template   # From template
#
# Server:
#   corral dev                            # Start dev server (auto-seeds)
#   corral start                          # Start production server
#   corral migrate                        # Run database migrations
#
# Seed:
#   corral seed                           # Seed from corral.yaml config
#   corral seed --admin-only              # Just create admin user
#   corral seed --sample-data             # Generate sample analytics data
#   corral seed --reset                   # Wipe and re-seed (dev only!)
#
# Stripe:
#   corral stripe sync                    # Sync plans/meters to Stripe
#   corral stripe status                  # Show Stripe product/price status
#   corral stripe webhook-test            # Fire test webhook events
#
# Users:
#   corral users list                     # List all users
#   corral users create --email x         # Create user
#   corral users set-plan --email x --plan pro  # Change plan
#   corral users set-role --email x --role admin # Set admin
#   corral users reset-usage --email x    # Reset usage counters
#
# Backup:
#   corral backup now                     # Run backup immediately
#   corral backup list                    # List available backups
#   corral backup restore --from latest   # Restore from backup
#   corral backup export                  # Export to SQL file
#
# Config:
#   corral config validate                # Validate corral.yaml
#   corral config diff                    # Show what changed vs deployed
#   corral config apply                   # Apply config changes (migrates, syncs Stripe)
#
# Debug:
#   corral status                         # Server health, DB connection, Stripe status
#   corral logs                           # Tail auth server logs
#   corral test                           # Run integration tests against local server
```

---

## UI Component Inventory

Everything is a React component built on `@daveyplate/better-auth-ui` (existing library) extended with our billing/usage components.

### Existing (from better-auth-ui)
These are **already built** — we just configure and style them:

| Component | What It Does |
|-----------|-------------|
| `<SignIn />` | Email/password login form, social buttons, magic link |
| `<SignUp />` | Registration form with custom fields, terms checkbox |
| `<ForgotPassword />` | Password reset flow |
| `<UserButton />` | Avatar dropdown with menu (header component) |
| `<SettingsCards />` | Name, email, password, avatar, delete account |
| `<ApiKeysCard />` | Create, list, revoke API keys |
| `<DeviceVerification />` | Code entry page for CLI device auth |

### New (we build these)
These extend the system with billing, usage, and engagement:

| Component | What It Does |
|-----------|-------------|
| `<PlanPicker />` | Side-by-side plan comparison cards with CTA buttons |
| `<CurrentPlan />` | Shows current plan badge, renewal date, usage summary |
| `<PaymentMethod />` | Card on file, update card (Stripe Elements embedded) |
| `<InvoiceHistory />` | List of invoices with PDF download |
| `<CancelFlow />` | Multi-step cancellation with retention offers |
| `<UsageMeters />` | Progress bars for each meter, color-coded by usage % |
| `<UsageHistory />` | Time series chart of usage |
| `<UpgradeBanner />` | Configurable banner for free users |
| `<PaywallModal />` | Shown when user hits a limit, shows plan comparison |
| `<NudgeBanner />` | Configurable notification banners (trial ending, etc.) |
| `<NudgeToast />` | Toast notifications for usage warnings |
| `<WatermarkBadge />` | "Made with DemoFly" watermark with upgrade CTA |

### Component States

Every component handles these states automatically:

```
┌──────────────────────────────────────────────────────────┐
│ LOADING        │ Skeleton/shimmer while fetching         │
│ EMPTY          │ "No invoices yet" with helpful message  │
│ SUCCESS        │ Normal display                          │
│ ERROR          │ Red banner with retry button            │
│ WARNING        │ Yellow banner (approaching limit, etc.) │
│ LIMIT_REACHED  │ Red + upgrade CTA                      │
│ PAYMENT_FAILED │ Red banner, update payment CTA          │
│ TRIAL_ENDING   │ Yellow countdown banner                 │
│ UPGRADING      │ Loading state during Stripe checkout    │
│ DOWNGRADING    │ Confirmation modal with what they lose  │
│ CANCELING      │ Multi-step retention flow               │
└──────────────────────────────────────────────────────────┘
```

### Usage Meter Component (detailed)

```
┌─────────────────────────────────────────────┐
│  📹 Videos Created                          │
│  ████████████████████░░░░  45 / 100         │
│  Pro plan · Resets Mar 1                    │
└─────────────────────────────────────────────┘

At 80% (warning_at):
┌─────────────────────────────────────────────┐
│  📹 Videos Created                     ⚠️   │
│  ████████████████████████░  80 / 100        │
│  Pro plan · 20 remaining · Resets Mar 1     │
└─────────────────────────────────────────────┘

At 100% (limit):
┌─────────────────────────────────────────────┐
│  📹 Videos Created                     🔴   │
│  █████████████████████████  100 / 100       │
│  Limit reached · Resets Mar 1               │
│  ┌─────────────────────────────────────┐    │
│  │ Need more? Upgrade to Team (1000/mo)│    │
│  └─────────────────────────────────────┘    │
└─────────────────────────────────────────────┘

Free user (daily limit):
┌─────────────────────────────────────────────┐
│  📹 Videos Created                     🔴   │
│  █████████████████████████  1 / 1           │
│  Free plan · Resets tomorrow                │
│  ┌─────────────────────────────────────┐    │
│  │ ⚡ Upgrade to Pro — 100 videos/mo   │    │
│  │    50% off first month: FIRSTPRO50  │    │
│  └─────────────────────────────────────┘    │
└─────────────────────────────────────────────┘
```

### Cancellation Flow (detailed)

```
Step 1: "Are you sure?"
┌─────────────────────────────────────────────┐
│  Cancel your Pro plan?                      │
│                                             │
│  Here's what you'll lose:                   │
│  ✗ 1080p video quality → 720p              │
│  ✗ 100 videos/month → 1/day               │
│  ✗ No watermark → Watermark added          │
│  ✗ Share links → Disabled                   │
│                                             │
│  Your plan will remain active until Mar 16  │
│                                             │
│  [Keep My Plan]  [Continue Canceling →]     │
└─────────────────────────────────────────────┘

Step 2: Retention offer
┌─────────────────────────────────────────────┐
│  Wait — here's a special offer!             │
│                                             │
│  Stay on Pro and get 30% off for 3 months:  │
│  $29/mo → $20.30/mo                         │
│                                             │
│  [Accept Offer]  [No thanks, cancel →]      │
└─────────────────────────────────────────────┘

Step 3: Reason (optional, for analytics)
┌─────────────────────────────────────────────┐
│  Help us improve — why are you leaving?     │
│                                             │
│  ○ Too expensive                            │
│  ○ Missing features I need                  │
│  ○ Found a better alternative               │
│  ○ Not using it enough                      │
│  ○ Other: [____________]                    │
│                                             │
│  [Submit & Cancel]                          │
└─────────────────────────────────────────────┘
```

---

## How Integration Works

### For a New Project (Agent Flow)

```bash
# 1. Agent creates corral.yaml (from template or from scratch)
corral init --app lyric-gen --name "LyricFlow"

# 2. Edit the YAML (agent or human)
#    - Define plans, meters, nudges, UI pages
vim corral.yaml

# 3. Validate
corral config validate
# ✓ 4 plans defined (free, pro, team, enterprise)
# ✓ 2 meters defined (generations, exports)
# ✓ 3 nudges defined
# ✓ Stripe price IDs found for pro, team
# ✓ Seed config valid

# 4. Start dev server (auto-seeds, auto-migrates)
corral dev
# ✓ Database migrated (8 tables)
# ✓ Stripe synced (2 products, 4 prices, 2 meters)
# ✓ Admin user seeded: rob@rownd.ai
# ✓ 5 test users seeded
# ✓ 30 days sample data generated
# ✓ Server running at http://localhost:3100
# ✓ Admin dashboard at http://localhost:3100/admin

# 5. Add components to your app
#    Agent adds: <CorralProvider config="corral.yaml">
#    Agent adds: <SignIn />, <UserButton />, <PlanPicker />, etc.
#    All config-driven, all styled automatically.
```

### For an Existing Project (Adding Corral)

```bash
# 1. Install
npm install @llamafarm/corral @llamafarm/corral-ui

# 2. Agent generates corral.yaml from project analysis
#    "This is a Next.js app with these features, generate appropriate config"

# 3. Add provider wrapper
```

```tsx
// app/providers.tsx
import { CorralProvider } from '@llamafarm/corral-ui';
import config from '../corral.yaml';

export function Providers({ children }) {
  return (
    <CorralProvider config={config}>
      {children}
    </CorralProvider>
  );
}
```

```tsx
// app/layout.tsx — add UserButton to header
import { UserButton, NudgeBanner } from '@llamafarm/corral-ui';

export default function Layout({ children }) {
  return (
    <>
      <header>
        <Logo />
        <UsageBadge meter="video.created" />  {/* "45/100 videos" */}
        <UserButton />                         {/* Avatar dropdown */}
      </header>
      <NudgeBanner />                          {/* Auto-shows relevant nudges */}
      {children}
    </>
  );
}
```

```tsx
// app/settings/page.tsx — full profile/billing page
import { ProfilePage } from '@llamafarm/corral-ui';

export default function Settings() {
  return <ProfilePage />;  // Renders all tabs from corral.yaml config
}
```

```tsx
// app/admin/page.tsx — admin dashboard
import { AdminDashboard } from '@llamafarm/corral-ui';

export default function Admin() {
  return <AdminDashboard />;  // Renders all sections from corral.yaml config
}
```

```typescript
// In your API routes — gate features
import { checkUsage, recordUsage } from '@llamafarm/corral';

export async function POST(req) {
  const session = await getSession(req);
  
  // Check if user can create a video
  const gate = await checkUsage(session.userId, 'video.created');
  if (!gate.allowed) {
    return Response.json({
      error: 'limit_reached',
      ...gate,  // { current, limit, resetAt, upgradeUrl }
    }, { status: 429 });
  }
  
  // ... create the video ...
  
  // Record usage (writes to local DB + Stripe meter)
  await recordUsage(session.userId, 'video.created', 1, {
    quality: '1080p',
    duration_s: 45,
  });
}
```

**That's it.** YAML config + 5 component imports + 2 API calls = full auth/billing/profile/admin.

---

## Seeding Strategy

### Why Seeding Matters

Fast bootstrap is critical for:
1. **Dev experience** — `corral dev` gives you a working system in seconds, not minutes of manual setup
2. **Testing** — pre-built users at every state (free, pro, at-limit, trial-ending, payment-failed)
3. **Demos** — show a populated admin dashboard immediately
4. **CI/CD** — integration tests need deterministic seed data
5. **New team members** — clone repo, `corral dev`, everything works

### Seed Execution Order

```
corral seed (or auto on `corral dev`):

1. Database migration (create/update tables)
2. Stripe sync (create/update products, prices, meters)
3. Admin user creation (from seed.admin)
4. Test user creation (from seed.test_users)
   - Create user in Better Auth
   - Create Stripe customer (test mode)
   - Attach test payment method
   - Create subscription at specified plan
   - Set trial end date if specified
   - Set payment status if specified
   - Insert usage_events for specified usage
5. Sample data generation (if seed.sample_data.enabled)
   - Generate N fake users with realistic plan distribution
   - Generate M days of usage events with realistic patterns
   - Weekday/weekend patterns, growth trends, churn
```

### Seed Idempotency

Seeds are **idempotent** — running `corral seed` twice doesn't create duplicates:
- Users matched by email
- Stripe products matched by metadata.corral_plan
- Usage events upserted by user+meter+period

### Seed for CI

```yaml
# corral.test.yaml — minimal seed for integration tests
seed:
  auto_seed_dev: true
  admin:
    email: admin@test.local
    password: test-password-123
  test_users:
    - email: free@test.local
      password: test-password-123
      plan: free
    - email: pro@test.local
      password: test-password-123
      plan: pro
  stripe_products:
    auto_sync: true
  sample_data:
    enabled: false                         # No fake data in CI
```

---

## Backup Strategy

### The Risk

Corral stores the most important data in your system: **who your users are, what they're paying for, and what they've used.** Losing this means losing your business.

### Strategy: Belt + Suspenders

```
Layer 1: Managed DB backups (Railway/Supabase/Neon handle this)
  - Automatic point-in-time recovery
  - Usually 7-30 day retention
  - Zero config on our end
  → Good for: accidental data loss, quick restore

Layer 2: Our automated pg_dump exports (corral.yaml backup config)
  - Daily full dumps to S3/R2
  - Encrypted, compressed
  - 6-month retention
  → Good for: provider migration, long-term archive, disaster recovery

Layer 3: Stripe is its own backup
  - Customer records, subscriptions, invoices all in Stripe
  - If DB is lost, we can reconstruct billing state from Stripe
  → Good for: billing data is never truly lost
```

### Restore Flow

```bash
# List available backups
corral backup list
# 2026-02-16  full  42MB  s3://corral-backups-demofly/2026-02-16-full.sql.gz  ✓ verified
# 2026-02-15  full  41MB  s3://corral-backups-demofly/2026-02-15-full.sql.gz  ✓ verified
# ...

# Restore from latest
corral backup restore --from latest
# ⚠️  This will REPLACE the current database. Continue? [y/N]
# Downloading 2026-02-16-full.sql.gz (42MB)...
# Decrypting...
# Restoring to PostgreSQL...
# ✓ Restored. 1,247 users, 892 subscriptions, 45,231 usage events.

# Restore from specific date
corral backup restore --from 2026-02-10

# Restore to a DIFFERENT database (for testing)
corral backup restore --from latest --target postgresql://localhost:5433/corral_restore_test

# Reconcile with Stripe after restore
corral stripe reconcile
# Checks Stripe for any subscriptions/events newer than backup
# Updates local records to match Stripe truth
```

### Weekly Restore Test

The backup config includes `test_restore: weekly` — every week, the system:
1. Downloads the latest backup
2. Restores to a temporary database
3. Runs basic integrity checks (user count, subscription count, usage totals)
4. Drops the temp database
5. Reports success/failure

This catches silent backup corruption before you need the backup.

---

## Package Summary

```
@llamafarm/corral              # Server: Better Auth + Stripe + usage layer
@llamafarm/corral-ui           # React components: all UI from YAML config
@llamafarm/corral-client       # Client SDK: CLI auth, feature checking, token management
corral                         # CLI: init, dev, seed, backup, stripe sync, user management
```

## Tech Stack

| Layer | Choice | Why |
|-------|--------|-----|
| Auth engine | Better Auth | Free, plugins for everything, agent-friendly |
| Auth UI (base) | @daveyplate/better-auth-ui | Pre-built shadcn components for login/signup/settings |
| Billing UI (new) | Our components on shadcn | Plan picker, usage meters, paywall, cancellation |
| Payments | Stripe + Better Auth Stripe plugin | First-party integration, metered billing |
| Server | Hono | Lightweight, runs anywhere |
| Database | PostgreSQL (prod) / SQLite (dev) | Better Auth native |
| Config | YAML | Human-readable, agent-writable, diffable in git |
| CLI | Commander.js + tsup | Same pattern as DemoFly CLI |
| Components | React + shadcn/ui + Tailwind | Themeable, customizable, typed |
| Monorepo | Turborepo | Fast builds, shared deps |
| Backups | pg_dump → S3/R2 | Simple, proven, encrypted |
