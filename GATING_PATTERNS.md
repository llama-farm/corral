# Corral Gating Patterns
*Captured during HORIZON integration — 2026-02-16*
*These patterns should become first-class Corral components/hooks*

## Pattern 1: Tab/Section Gating
**Problem:** SaaS apps have tabs/sections that should be locked on free tier.
**HORIZON example:** 7 pillars, free gets 3, pro gets all.
**What we built:**
```tsx
const FREE_PILLARS = new Set(["anomaly", "knowledge", "logs"]);
const isPro = subscription?.planId === "operator"; // or check plan tier
const isLocked = !FREE_PILLARS.has(pillar.id) && !isPro;
```
**What Corral should provide:**
```tsx
// Hook: useFeatureGate
const { isLocked, requiredPlan } = useFeatureGate("voice-intel");
// Reads from corral.yaml features map + current subscription

// Component: <FeatureGate feature="voice-intel" fallback={<UpgradeBanner />}>
//   <VoicePanel />
// </FeatureGate>
```
**Config in corral.yaml:**
```yaml
features:
  anomaly-intel: [observer, operator, squadron, command]
  knowledge-brain: [observer, operator, squadron, command]  
  voice-intel: [operator, squadron, command]
  mission-agent: [operator, squadron, command]
  # or simpler:
  free_features: [anomaly-intel, knowledge-brain, logs]
  pro_features: [voice-intel, mission-agent, osint, training]
```

## Pattern 2: Inline Upgrade Prompt (not Modal)
**Problem:** Modals are interruptive. When a user clicks a locked tab, they should see what they're missing WITH an upgrade path — right there, not in a popup.
**HORIZON example:** Clicking locked "Voice Intel" tab shows a full-width upgrade card in the content area with:
- What the feature does (description + preview)
- What plan unlocks it
- "Start 14-day free trial" CTA
- Subtle, elegant, not aggressive
**What Corral should provide:**
```tsx
<UpgradePrompt
  feature="voice-intel"
  title="Voice Intelligence"
  description="Multi-channel monitoring with AI priority detection"
  icon={<Radio />}
  previewImage="/previews/voice-intel.png"  // optional blurred preview
/>
// Auto-renders: feature description + required plan + CTA
// Reads plan info from CorralProvider context
```

## Pattern 3: Lock Badge on Navigation
**Problem:** Users should see BEFORE clicking that a tab is locked.
**HORIZON example:** Small lock icon + "PRO" badge on locked tabs.
**What Corral should provide:**
```tsx
<ProBadge show={isLocked} />
// or
<FeatureBadge feature="voice-intel" /> // auto-shows lock if gated
```

## Pattern 4: Partial Feature Access
**Problem:** Some features work on free tier but with limits (e.g., 5 queries/day).
**HORIZON example:** Knowledge Brain works for free but limited to 5 queries/day.
**What Corral should provide:**
```tsx
const { allowed, remaining, limit } = useUsageGate("knowledge.queries");
if (!allowed) showUpgradePrompt("You've used all 5 free queries today");
```

## Pattern 5: Trial-Aware CTAs
**Problem:** The upgrade button text should change based on context:
- No trial available: "Upgrade to Operator — $149/mo"
- Trial available: "Start 14-day free trial"
- Trial active: "X days left in trial"
- Trial expired: "Subscribe to continue"
**What Corral should provide:**
```tsx
<UpgradeCTA planId="operator" />
// Auto-renders correct text based on subscription state
```

## Pattern 6: Admin Needs Real User Data
**Problem:** Admin dashboard called custom endpoints that don't exist. Better Auth's admin plugin has specific endpoints.
**Learning:** AdminDashboard should use Better Auth's REAL admin API:
- `GET /admin/list-users` (not `/admin/users`)
- `POST /admin/set-role`
- `POST /admin/ban-user` / `POST /admin/unban-user`
- Compute stats client-side from user list (no custom stats endpoint needed)
**What Corral should provide:**
- Pre-built AdminDashboard that works out-of-box with Better Auth admin plugin
- No custom API endpoints needed
- Stats computed from user data client-side

## Pattern 7: Role-Based Access for Admin
**Problem:** User had role="user" but needed role="admin" to access admin API.
**Learning:** `corral seed` must set admin role. `corral init` should create the first user as admin.
**What Corral should provide:**
```yaml
seed:
  admin:
    email: admin@example.com
    role: admin  # MUST be set
```

## Pattern 8: Admin Role Must Be Set in Seed
**Problem:** First user signs up as role="user". Admin API rejects them with "YOU_ARE_NOT_ALLOWED_TO_LIST_USERS".
**Fix:** `corral seed` must explicitly set admin role via direct DB update or Better Auth admin API.
**Learning:** Better Auth's admin plugin uses the `role` field. Must be "admin" exactly.
**What Corral should provide:**
```yaml
seed:
  admin:
    email: admin@example.com
    role: admin  # Auto-set after signup via POST /admin/set-role
```

## Pattern 9: CorralUser Needs role Field
**Problem:** TypeScript `CorralUser` type didn't include `role`, causing build failures when checking `user?.role === "admin"`.
**Fix:** Added `role?: string` to CorralUser interface.
**Learning:** Better Auth returns role in the session user object. CorralProvider must pass it through.

## Pattern 10: Admin Bypasses Gating
**Problem:** Admin users should see all features regardless of subscription.
**HORIZON example:** `const isPro = subscription?.planId === "operator" || user?.role === "admin"`.
**What Corral should provide:**
```tsx
const { isLocked } = useFeatureGate("voice-intel"); // auto-bypasses for admins
```

## Validated Patterns (Working in HORIZON)
- ✅ Tab gating with PRO badges (4 locked tabs, 3 free)
- ✅ Inline upgrade prompt (not modal) with 14-day trial CTA
- ✅ Admin bypass (admin sees all tabs unlocked)
- ✅ Admin dashboard with real Better Auth API (list-users, set-role, ban/unban)
- ✅ Client-side stats computation from user list
- ✅ Signup timeline chart (CSS bars, no recharts dependency)

## Pattern 11: Anonymous Access with Auth Gate on Action
**Problem:** Users should be able to explore the app without logging in. But when they try to DO something (save, share, export), they need to log in.
**Example (DemoFly):** User browses demo videos → clicks "Share" → LoginPrompt says "Sign in to share (free plan available)"
**Example (HORIZON):** User sees the Anomaly Intel dashboard → clicks "Export Report" → login prompt
**What Corral provides:**
```tsx
const { requireAuth } = useAuthGate();
<button onClick={() => requireAuth(() => shareVideo(id), "Share your video")}>
  Share
</button>
// If not logged in → redirects to /login?returnTo=/current-page&reason=Share+your+video
// If logged in → runs shareVideo(id) immediately
```

## Pattern 12: Blur Gate — Show Content Behind Login
**Problem:** Users should SEE what they're missing (blurred/dimmed) to create desire, not just an empty wall.
**Example:** Search results visible but blurred. Overlay says "Sign in to view full results (free)".
**What Corral provides:**
```tsx
<AuthGate mode="blur" reason="Sign in to view results">
  <SearchResults data={results} />
</AuthGate>
// Renders results blurred + dimmed + overlay with LoginPrompt
```

## Pattern 13: Three-Tier Feature Config
**Problem:** Features need to work across all three tiers: anonymous, free (authenticated), and paid.
**What Corral provides in corral.yaml:**
```yaml
features:
  browse-catalog: ["*"]              # anyone, even anonymous
  save-favorites: ["authenticated"]  # any logged-in user
  basic-export: ["free", "pro"]      # free tier and up (requires login)
  voice-intel: ["pro", "enterprise"] # paid plans only
  admin-panel: ["admin"]             # admin only
```
**FeatureGate auto-selects the right prompt:**
- Anonymous + needs auth → LoginPrompt (with "Free plan available" badge)
- Free user + needs paid → UpgradePrompt (with trial CTA)
- Paid/Admin → content rendered normally

## Pattern 14: CLI Auth Gate — API Key Required for Sharing
**Problem:** CLI tools should work for basic tasks without auth. But sharing, publishing, or cloud features need an API key.
**Example (DemoFly CLI):**
```bash
$ demofly record --url http://localhost:3000    # ✅ Works without auth
$ demofly list                                  # ✅ Local files, no auth needed
$ demofly share my-demo.mp4                     # ❌ "API key required"
  # → "Run `demofly auth login` to sign in (free plans available)"
  # → Or: `demofly auth key <your-api-key>`
```
**What Corral provides (CLI):**
```typescript
// In CLI command handler:
import { requireApiKey } from "@llamafarm/corral-client";

const key = await requireApiKey({
  reason: "Sharing requires an account",
  hasFree: true,
  loginUrl: "https://app.example.com/settings/api-keys",
});
// Returns key if configured, or prints friendly message + exits
```

## Pattern 15: Login Prompt — Invitation, Not a Wall
**Problem:** Auth gates should feel like an invitation to join, not a barrier.
**What Corral provides:**
- LoginPrompt has gradient header, benefit bullets, "Free plan available" badge
- "Create free account" as primary CTA (not "Log in")
- "Already have an account? Sign in" as secondary
- `returnTo` URL preserved so user comes back after login
- Reason-specific: "Sign in to share your video" not just "Please log in"

## Components — Status

### ✅ Built (in `corral/packages/ui/src/gating/`)
- [x] `useFeatureGate(featureId)` — 3-tier: anonymous → free → pro, admin bypass, lockReason
- [x] `<FeatureGate>` — auto-selects LoginPrompt (auth) or UpgradePrompt (plan), block/blur modes
- [x] `<UpgradePrompt>` — inline upgrade card (not modal), trial-aware CTA
- [x] `<ProBadge>` — lock icon + PRO pill for nav items
- [x] `<UpgradeCTA>` — trial/active/expired/current-plan text states
- [x] `useUsageGate(meterId)` — metered limits, warning/exceeded, reset label
- [x] `<UsageLimitBanner>` — progress bar, hidden/warning/exceeded
- [x] `useAuthGate()` — requireAuth(action, reason), gateValue(), returnTo
- [x] `<AuthGate>` — block/blur/action modes for anonymous users
- [x] `<LoginPrompt>` — invitation-style, benefits list, "Free plan available" badge
- [x] AdminDashboard — real Better Auth admin API
- [x] `corral seed` — creates users + sets admin role via API

### TODO
- [ ] `requireApiKey()` for CLI — gate CLI commands behind auth
- [ ] `<AuthGate mode="blur">` demo in HORIZON
- [ ] `returnTo` handling in HORIZON login page
- [ ] Webhook handler for Stripe subscription → unlock features in real-time
