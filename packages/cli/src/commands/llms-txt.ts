import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { createServer } from 'http';
import { dirname, resolve } from 'path';
import chalk from 'chalk';
import { loadConfigRaw } from '../config.js';
import { success, info, error as logError } from '../util.js';

// ── Config extractors ────────────────────────────────────────────────────

interface ProviderInfo {
  emailPassword: boolean;
  social: string[];
  passwordless: string[];
}

interface PlanInfo {
  id: string;
  name: string;
  price: number;
  trial?: number;
  features: string[];
  stripePriceId?: string;
}

interface FeatureInfo {
  id: string;
  requiredPlan: string;
  description?: string;
}

interface MeterInfo {
  id: string;
  label: string;
  limits: Record<string, number | string>;
  period: string;
}

function extractProviders(raw: Record<string, any>): ProviderInfo {
  const methods = raw.auth?.methods || {};
  const social: string[] = [];
  const passwordless: string[] = [];
  let emailPassword = methods.email_password !== false; // default on

  const socialList = ['google', 'github', 'apple', 'discord', 'microsoft', 'twitter', 'facebook', 'twitch'];
  for (const p of socialList) {
    if (methods[p]) social.push(p.charAt(0).toUpperCase() + p.slice(1));
  }
  if (methods.magic_link) passwordless.push('magic-link');
  if (methods.email_otp) passwordless.push('email-otp');

  // Also handle auth.providers array (config schema format)
  if (Array.isArray(raw.auth?.providers)) {
    for (const p of raw.auth.providers as string[]) {
      const display = p.charAt(0).toUpperCase() + p.slice(1);
      if (socialList.includes(p) && !social.includes(display)) social.push(display);
    }
  }
  return { emailPassword, social, passwordless };
}

function extractPlans(raw: Record<string, any>): PlanInfo[] {
  const trialDays = raw.billing?.trial_days ?? 14;

  // Template format: top-level `plans` array
  if (Array.isArray(raw.plans)) {
    return raw.plans.map((p: any) => ({
      id: (p.name || '').toLowerCase(),
      name: p.display_name || p.name || 'unknown',
      price: p.price ?? 0,
      trial: p.trial ? trialDays : undefined,
      features: Array.isArray(p.features) ? p.features : [],
      stripePriceId: p.stripe_price_id,
    }));
  }
  // Schema format: billing.plans record
  if (raw.billing?.plans && typeof raw.billing.plans === 'object') {
    return Object.entries(raw.billing.plans as Record<string, any>).map(([k, v]: [string, any]) => ({
      id: k,
      name: v.name || k,
      price: v.price ?? 0,
      trial: v.trial !== undefined ? trialDays : undefined,
      features: Array.isArray(v.features) ? v.features : [],
      stripePriceId: v.stripe_price_id,
    }));
  }
  return [];
}

function extractFeatures(raw: Record<string, any>): FeatureInfo[] {
  const config: Record<string, any> = raw.features || {};
  return Object.entries(config).map(([id, plans]) => {
    if (!Array.isArray(plans)) return { id, requiredPlan: String(plans) };
    if ((plans as string[]).includes('*')) return { id, requiredPlan: 'everyone' };
    if ((plans as string[]).includes('authenticated')) return { id, requiredPlan: 'authenticated' };
    return { id, requiredPlan: (plans as string[]).join(' | ') };
  });
}

function extractMeters(raw: Record<string, any>): MeterInfo[] {
  const config: Record<string, any> = raw.meters || {};
  return Object.entries(config).map(([id, m]: [string, any]) => ({
    id,
    label: m.label || m.name || id,
    limits: m.limits || {},
    period: m.reset_period || 'monthly',
  }));
}

// ── Generator: standard llms.txt ─────────────────────────────────────────

function generateLlmsTxt(raw: Record<string, any>): string {
  const appName = raw.app?.name || 'App';
  const appUrl = (raw.app?.url || raw.app?.domain || 'http://localhost:3000').replace(/\/$/, '');
  const authBase = `${appUrl}/api/auth`;
  const corralBase = `${appUrl}/api/corral`;

  const providers = extractProviders(raw);
  const plans = extractPlans(raw);
  const features = extractFeatures(raw);
  const meters = extractMeters(raw);
  const hasBilling = raw.billing?.provider !== 'none' && plans.some(p => p.price > 0);

  const L: string[] = [];

  // ── Header ──────────────────────────────────────────────────────
  L.push(`# ${appName}`);
  L.push('');
  L.push(`> ${appName} uses Corral for authentication and billing.`);
  L.push('');

  // ── Auth ────────────────────────────────────────────────────────
  L.push('## Auth');
  L.push('');

  if (providers.emailPassword) {
    L.push(`- Sign up: \`POST ${authBase}/sign-up/email\` \`{ email, password, name }\``);
    L.push(`- Sign in: \`POST ${authBase}/sign-in/email\` \`{ email, password }\``);
  }
  L.push(`- Sign out: \`POST ${authBase}/sign-out\``);
  L.push(`- Get session: \`GET ${authBase}/get-session\` (requires session cookie or \`Authorization: Bearer <token>\`)`);

  if (providers.social.length > 0) {
    L.push(`- Social login: \`GET ${authBase}/sign-in/social?provider=<provider>&callbackURL=/\``);
  }

  if (providers.social.length > 0) {
    L.push('');
    L.push('### Social Providers');
    for (const p of providers.social) L.push(`- ${p} (enabled)`);
  }

  if (providers.passwordless.length > 0) {
    L.push('');
    L.push('### Passwordless');
    if (providers.passwordless.includes('magic-link')) {
      L.push(`- Magic link: \`POST ${authBase}/sign-in/magic-link\` \`{ email }\``);
    }
    if (providers.passwordless.includes('email-otp')) {
      L.push(`- Email OTP: \`POST ${authBase}/sign-in/email-otp\` \`{ email }\``);
    }
  }

  L.push('');

  // ── Plans ────────────────────────────────────────────────────────
  if (plans.length > 0) {
    L.push('## Plans');
    L.push('');
    L.push('| Plan | Price | Trial | Features |');
    L.push('|------|-------|-------|----------|');
    for (const p of plans) {
      const price = p.price === 0 ? 'Free' : `$${p.price}/mo`;
      const trial = p.trial ? `${p.trial} days` : '-';
      const feats = p.features.slice(0, 4).join(', ') || '-';
      L.push(`| ${p.name} | ${price} | ${trial} | ${feats} |`);
    }
    L.push('');
  }

  // ── Features ─────────────────────────────────────────────────────
  if (features.length > 0) {
    L.push('## Features');
    L.push('');
    L.push('| Feature | Required Plan | Description |');
    L.push('|---------|--------------|-------------|');
    for (const f of features) {
      L.push(`| ${f.id} | ${f.requiredPlan} | ${f.description || '-'} |`);
    }
    L.push('');
  }

  // ── Usage Meters ─────────────────────────────────────────────────
  if (meters.length > 0) {
    L.push('## Usage Meters');
    L.push('');
    const planNames = plans.length > 0 ? plans.map(p => p.name) : ['Free', 'Pro'];
    L.push(`| Meter | ${planNames.map(n => `${n} Limit`).join(' | ')} | Period |`);
    L.push(`|-------|${planNames.map(() => '---------').join('|')}|--------|`);
    for (const m of meters) {
      const vals = planNames.map(n => {
        const key = n.toLowerCase();
        return m.limits[key] ?? m.limits[n] ?? '-';
      });
      L.push(`| ${m.label} | ${vals.join(' | ')} | ${m.period} |`);
    }
    L.push('');
  }

  // ── API Endpoints ─────────────────────────────────────────────────
  L.push('## API Endpoints');
  L.push('');

  if (hasBilling) {
    L.push('### Billing');
    L.push(`- \`POST ${corralBase}/checkout\` \`{ planId }\` → \`{ url }\` (Stripe checkout)`);
    L.push(`- \`GET ${corralBase}/billing\` → subscription + invoices`);
    L.push(`- \`POST ${corralBase}/cancel\` → cancel at period end`);
    L.push(`- \`POST ${corralBase}/reactivate\` → undo cancel`);
    L.push('');
  }

  L.push('### Device Auth (CLI / Native Apps)');
  L.push(`- \`POST ${corralBase}/device/authorize\` → \`{ deviceCode, userCode, verificationUrl }\``);
  L.push(`- \`POST ${corralBase}/device/token\` \`{ deviceCode }\` → \`{ accessToken, refreshToken }\``);
  L.push(`- \`POST ${corralBase}/device/verify\` \`{ userCode, action }\` → approve/deny`);
  L.push('');

  L.push('### API Keys');
  L.push(`- \`POST ${corralBase}/apikeys\` \`{ name }\` → \`{ id, key, prefix }\``);
  L.push(`- \`GET ${corralBase}/apikeys\` → list keys`);
  L.push(`- \`DELETE ${corralBase}/apikeys/:id\` → revoke`);
  L.push('');

  if (meters.length > 0) {
    L.push('### Usage');
    L.push(`- \`POST ${corralBase}/usage/track\` \`{ meterId, count }\``);
    L.push(`- \`GET ${corralBase}/usage/:meterId\` → \`{ used, limit, remaining }\``);
    L.push('');
  }

  // ── Admin ────────────────────────────────────────────────────────
  L.push('## Admin');
  L.push(`- \`GET ${authBase}/admin/list-users\` → paginated user list`);
  L.push('- Requires role: `admin`');
  L.push('');

  // ── Footer ───────────────────────────────────────────────────────
  L.push('---');
  L.push(`*Generated by Corral CLI — regenerate with \`corral llms-txt\`*`);
  L.push('');

  return L.join('\n');
}

// ── Generator: full llms-full.txt ────────────────────────────────────────

function generateLlmsFullTxt(raw: Record<string, any>): string {
  const appName = raw.app?.name || 'App';
  const appUrl = (raw.app?.url || raw.app?.domain || 'http://localhost:3000').replace(/\/$/, '');
  const authBase = `${appUrl}/api/auth`;
  const corralBase = `${appUrl}/api/corral`;

  const providers = extractProviders(raw);
  const plans = extractPlans(raw);
  const meters = extractMeters(raw);
  const hasBilling = raw.billing?.provider !== 'none' && plans.some(p => p.price > 0);

  // Start with the standard version
  const standard = generateLlmsTxt(raw);
  // Remove the footer line and replace with extended content
  const base = standard.replace(/\n---\n\*Generated by.*\n$/, '\n');

  const L: string[] = [base.trimEnd()];

  L.push('');
  L.push('---');
  L.push('');
  L.push('## Full Reference');
  L.push('');
  L.push('### Curl Examples');
  L.push('');

  // ── Auth examples ────────────────────────────────────────────────
  if (providers.emailPassword) {
    L.push('#### Sign Up');
    L.push('```bash');
    L.push(`curl -s -X POST ${authBase}/sign-up/email \\`);
    L.push(`  -H "Content-Type: application/json" \\`);
    L.push(`  -c cookies.txt \\`);
    L.push(`  -d '{"email":"user@example.com","password":"password123","name":"Jane Doe"}'`);
    L.push('```');
    L.push('');
    L.push('**Response `200 OK`:**');
    L.push('```json');
    L.push(JSON.stringify({
      token: 'sess_abc123...',
      user: {
        id: 'usr_abc123',
        email: 'user@example.com',
        name: 'Jane Doe',
        plan: plans[0]?.id || 'free',
        role: 'user',
        emailVerified: false,
        createdAt: '2026-02-16T22:00:00.000Z',
      },
    }, null, 2));
    L.push('```');
    L.push('');

    L.push('#### Sign In');
    L.push('```bash');
    L.push(`curl -s -X POST ${authBase}/sign-in/email \\`);
    L.push(`  -H "Content-Type: application/json" \\`);
    L.push(`  -c cookies.txt \\`);
    L.push(`  -d '{"email":"user@example.com","password":"password123"}'`);
    L.push('```');
    L.push('');

    L.push('#### Get Session');
    L.push('```bash');
    L.push(`# Via cookie (browser)`);
    L.push(`curl -s ${authBase}/get-session -b cookies.txt`);
    L.push('');
    L.push(`# Via Bearer token (API / CLI)`);
    L.push(`curl -s ${authBase}/get-session \\`);
    L.push(`  -H "Authorization: Bearer sess_abc123..."`);
    L.push('```');
    L.push('');
    L.push('**Response `200 OK`:**');
    L.push('```json');
    L.push(JSON.stringify({
      session: {
        id: 'sess_abc123',
        userId: 'usr_abc123',
        expiresAt: '2026-03-18T22:00:00.000Z',
        ipAddress: '127.0.0.1',
        userAgent: 'curl/8.4.0',
      },
      user: {
        id: 'usr_abc123',
        email: 'user@example.com',
        name: 'Jane Doe',
        plan: plans[0]?.id || 'free',
        role: 'user',
      },
    }, null, 2));
    L.push('```');
    L.push('');

    L.push('#### Sign Out');
    L.push('```bash');
    L.push(`curl -s -X POST ${authBase}/sign-out \\`);
    L.push(`  -H "Authorization: Bearer sess_abc123..."`);
    L.push('```');
    L.push('');
  }

  if (providers.social.length > 0) {
    L.push('#### Social Login (Redirect Flow)');
    L.push('```bash');
    L.push('# Redirect the user\'s browser to:');
    L.push(`${authBase}/sign-in/social?provider=${providers.social[0].toLowerCase()}&callbackURL=/dashboard`);
    L.push('# After OAuth, user is redirected to callbackURL with session cookie set.');
    L.push('```');
    L.push('');
  }

  if (providers.passwordless.includes('magic-link')) {
    L.push('#### Magic Link');
    L.push('```bash');
    L.push(`curl -s -X POST ${authBase}/sign-in/magic-link \\`);
    L.push(`  -H "Content-Type: application/json" \\`);
    L.push(`  -d '{"email":"user@example.com"}'`);
    L.push('# → User receives email with link; clicking it sets session cookie.');
    L.push('```');
    L.push('');
  }

  if (providers.passwordless.includes('email-otp')) {
    L.push('#### Email OTP');
    L.push('```bash');
    L.push(`# Step 1: Request OTP`);
    L.push(`curl -s -X POST ${authBase}/sign-in/email-otp \\`);
    L.push(`  -H "Content-Type: application/json" \\`);
    L.push(`  -d '{"email":"user@example.com"}'`);
    L.push('');
    L.push(`# Step 2: Verify OTP`);
    L.push(`curl -s -X POST ${authBase}/verify-otp \\`);
    L.push(`  -H "Content-Type: application/json" \\`);
    L.push(`  -d '{"email":"user@example.com","otp":"123456"}'`);
    L.push('```');
    L.push('');
  }

  // ── Billing examples ──────────────────────────────────────────────
  if (hasBilling) {
    const paidPlan = plans.find(p => p.price > 0);

    L.push('#### Start Checkout (Stripe)');
    L.push('```bash');
    L.push(`curl -s -X POST ${corralBase}/checkout \\`);
    L.push(`  -H "Authorization: Bearer sess_abc123..." \\`);
    L.push(`  -H "Content-Type: application/json" \\`);
    L.push(`  -d '{"planId":"${paidPlan?.id || 'pro'}"}'`);
    L.push('```');
    L.push('**Response:**');
    L.push('```json');
    L.push(JSON.stringify({ url: 'https://checkout.stripe.com/c/pay/cs_test_abc123...' }, null, 2));
    L.push('```');
    L.push('');

    L.push('#### Get Billing Info');
    L.push('```bash');
    L.push(`curl -s ${corralBase}/billing \\`);
    L.push(`  -H "Authorization: Bearer sess_abc123..."`);
    L.push('```');
    L.push('**Response:**');
    L.push('```json');
    L.push(JSON.stringify({
      subscription: {
        plan: paidPlan?.id || 'pro',
        status: 'active',
        currentPeriodStart: '2026-02-16T00:00:00.000Z',
        currentPeriodEnd: '2026-03-16T00:00:00.000Z',
        cancelAtPeriodEnd: false,
        trialEnd: null,
      },
      invoices: [
        { id: 'inv_abc123', amount: paidPlan?.price || 29, currency: 'usd', date: '2026-02-16T00:00:00.000Z', status: 'paid' },
      ],
    }, null, 2));
    L.push('```');
    L.push('');

    L.push('#### Cancel Subscription');
    L.push('```bash');
    L.push(`curl -s -X POST ${corralBase}/cancel \\`);
    L.push(`  -H "Authorization: Bearer sess_abc123..."`);
    L.push('# Cancels at period end — user keeps access until then.');
    L.push('```');
    L.push('');

    L.push('#### Reactivate Subscription');
    L.push('```bash');
    L.push(`curl -s -X POST ${corralBase}/reactivate \\`);
    L.push(`  -H "Authorization: Bearer sess_abc123..."`);
    L.push('```');
    L.push('');
  }

  // ── Device Auth examples ──────────────────────────────────────────
  L.push('#### Device Authorization Flow (CLI / Native Apps)');
  L.push('```bash');
  L.push('# Step 1: Request device + user codes');
  L.push(`curl -s -X POST ${corralBase}/device/authorize`);
  L.push('```');
  L.push('**Response:**');
  L.push('```json');
  L.push(JSON.stringify({
    deviceCode: 'dev_code_abc123...',
    userCode: 'ABCD-1234',
    verificationUrl: `${appUrl}/device`,
    verificationUriComplete: `${appUrl}/device?code=ABCD-1234`,
    expiresIn: 600,
    interval: 5,
  }, null, 2));
  L.push('```');
  L.push('');
  L.push('```bash');
  L.push('# Step 2: Show user the code and URL, then poll for token');
  L.push(`while true; do`);
  L.push(`  RESP=$(curl -s -X POST ${corralBase}/device/token \\`);
  L.push(`    -H "Content-Type: application/json" \\`);
  L.push(`    -d '{"deviceCode":"dev_code_abc123..."}')`);
  L.push(`  if echo "$RESP" | grep -q "accessToken"; then`);
  L.push(`    echo "$RESP"; break`);
  L.push(`  fi`);
  L.push(`  sleep 5`);
  L.push(`done`);
  L.push('```');
  L.push('**Response (approved):**');
  L.push('```json');
  L.push(JSON.stringify({ accessToken: 'sess_abc123...', refreshToken: 'refresh_abc123...' }, null, 2));
  L.push('```');
  L.push('');
  L.push('```bash');
  L.push('# User approves in browser:');
  L.push(`curl -s -X POST ${corralBase}/device/verify \\`);
  L.push(`  -H "Authorization: Bearer sess_abc123..." \\`);
  L.push(`  -H "Content-Type: application/json" \\`);
  L.push(`  -d '{"userCode":"ABCD-1234","action":"approve"}'`);
  L.push('```');
  L.push('');

  // ── API Key examples ──────────────────────────────────────────────
  L.push('#### API Key Management');
  L.push('```bash');
  L.push('# Create a new API key');
  L.push(`curl -s -X POST ${corralBase}/apikeys \\`);
  L.push(`  -H "Authorization: Bearer sess_abc123..." \\`);
  L.push(`  -H "Content-Type: application/json" \\`);
  L.push(`  -d '{"name":"My Integration"}'`);
  L.push('```');
  L.push('**Response (key shown ONCE — save it):**');
  L.push('```json');
  L.push(JSON.stringify({ id: 'key_abc123', key: 'ck_live_abc123...', prefix: 'ck_live_' }, null, 2));
  L.push('```');
  L.push('');
  L.push('```bash');
  L.push('# List API keys');
  L.push(`curl -s ${corralBase}/apikeys \\`);
  L.push(`  -H "Authorization: Bearer sess_abc123..."`);
  L.push('```');
  L.push('**Response:**');
  L.push('```json');
  L.push(JSON.stringify([
    { id: 'key_abc123', name: 'My Integration', prefix: 'ck_live_', createdAt: '2026-02-16T00:00:00.000Z', lastUsed: '2026-02-16T22:00:00.000Z' },
  ], null, 2));
  L.push('```');
  L.push('');
  L.push('```bash');
  L.push('# Revoke an API key');
  L.push(`curl -s -X DELETE ${corralBase}/apikeys/key_abc123 \\`);
  L.push(`  -H "Authorization: Bearer sess_abc123..."`);
  L.push('```');
  L.push('');

  // ── Usage meter examples ──────────────────────────────────────────
  if (meters.length > 0) {
    const m0 = meters[0];
    L.push('#### Usage Tracking');
    L.push('```bash');
    L.push('# Track usage (server-side — use your API key or session token)');
    L.push(`curl -s -X POST ${corralBase}/usage/track \\`);
    L.push(`  -H "Authorization: Bearer sess_abc123..." \\`);
    L.push(`  -H "Content-Type: application/json" \\`);
    L.push(`  -d '{"meterId":"${m0.id}","count":1}'`);
    L.push('```');
    L.push('');
    L.push('```bash');
    L.push('# Check remaining quota');
    L.push(`curl -s ${corralBase}/usage/${m0.id} \\`);
    L.push(`  -H "Authorization: Bearer sess_abc123..."`);
    L.push('```');
    L.push('**Response:**');
    L.push('```json');
    const limitVal = m0.limits['pro'] ?? m0.limits['Pro'] ?? m0.limits['free'] ?? m0.limits['Free'] ?? 10000;
    L.push(JSON.stringify({
      meterId: m0.id,
      label: m0.label,
      used: 42,
      limit: limitVal,
      remaining: Number(limitVal) - 42,
      period: m0.period,
      resetAt: '2026-03-01T00:00:00.000Z',
    }, null, 2));
    L.push('```');
    L.push('');
  }

  // ── Admin examples ────────────────────────────────────────────────
  L.push('#### Admin: List Users');
  L.push('```bash');
  L.push(`curl -s "${authBase}/admin/list-users?limit=20&offset=0" \\`);
  L.push(`  -H "Authorization: Bearer <admin-session-token>"`);
  L.push('```');
  L.push('**Response:**');
  L.push('```json');
  L.push(JSON.stringify({
    users: [
      { id: 'usr_abc123', email: 'user@example.com', name: 'Jane Doe', plan: plans[0]?.id || 'free', role: 'user', createdAt: '2026-02-16T00:00:00.000Z' },
    ],
    total: 1,
    hasMore: false,
  }, null, 2));
  L.push('```');
  L.push('');

  // ── JSON Schemas ─────────────────────────────────────────────────
  L.push('### Request / Response Schemas');
  L.push('');

  L.push('#### User Object');
  L.push('```json');
  L.push(JSON.stringify({
    $schema: 'corral/user@1',
    id: 'string — nanoid prefixed with usr_',
    email: 'string — unique, lowercase',
    name: 'string',
    plan: `enum — ${plans.length > 0 ? plans.map(p => p.id).join(' | ') : 'free | pro'}`,
    role: 'enum — user | admin',
    emailVerified: 'boolean',
    image: 'string | null — avatar URL',
    banned: 'boolean',
    createdAt: 'string — ISO 8601',
    updatedAt: 'string — ISO 8601',
  }, null, 2));
  L.push('```');
  L.push('');

  L.push('#### Session Object');
  L.push('```json');
  L.push(JSON.stringify({
    $schema: 'corral/session@1',
    id: 'string',
    userId: 'string — references user.id',
    token: 'string — opaque Bearer token',
    expiresAt: 'string — ISO 8601',
    ipAddress: 'string | null',
    userAgent: 'string | null',
    createdAt: 'string — ISO 8601',
  }, null, 2));
  L.push('```');
  L.push('');

  if (hasBilling) {
    L.push('#### Subscription Object');
    L.push('```json');
    L.push(JSON.stringify({
      $schema: 'corral/subscription@1',
      plan: `enum — ${plans.map(p => p.id).join(' | ')}`,
      status: 'enum — active | canceled | past_due | trialing | incomplete | incomplete_expired',
      stripeCustomerId: 'string | null',
      stripeSubscriptionId: 'string | null',
      currentPeriodStart: 'string — ISO 8601',
      currentPeriodEnd: 'string — ISO 8601',
      cancelAtPeriodEnd: 'boolean',
      trialEnd: 'string | null — ISO 8601',
    }, null, 2));
    L.push('```');
    L.push('');
  }

  if (meters.length > 0) {
    L.push('#### Usage Response Object');
    L.push('```json');
    L.push(JSON.stringify({
      $schema: 'corral/usage@1',
      meterId: 'string',
      label: 'string',
      used: 'number — total usage this period',
      limit: 'number | null — null means unlimited',
      remaining: 'number | null',
      period: 'string — monthly | weekly | daily',
      resetAt: 'string — ISO 8601 — start of next period',
    }, null, 2));
    L.push('```');
    L.push('');
  }

  // ── Error format ──────────────────────────────────────────────────
  L.push('#### Error Response Format');
  L.push('```json');
  L.push(JSON.stringify({
    error: {
      code: 'string — e.g. INVALID_EMAIL, INVALID_PASSWORD, UNAUTHORIZED',
      message: 'string — human-readable',
      status: 'number — HTTP status code',
    },
  }, null, 2));
  L.push('```');
  L.push('');

  // ── Footer ───────────────────────────────────────────────────────
  L.push('---');
  L.push(`*Generated by Corral CLI — regenerate with \`corral llms-txt\`*`);
  L.push('');

  return L.join('\n');
}

// ── Command ───────────────────────────────────────────────────────────────

export async function llmsTxtCommand(opts: {
  config: string;
  output?: string;
  serve?: boolean;
  full?: boolean;
  port?: number;
}) {
  // Load config
  let raw: Record<string, any> = {};
  try {
    raw = loadConfigRaw(opts.config);
  } catch (e: any) {
    if (existsSync(opts.config)) {
      logError(`Failed to parse ${opts.config}: ${e.message}`);
      return;
    }
    logError(`Config not found: ${opts.config} — run: corral init`);
    return;
  }

  const content = generateLlmsTxt(raw);
  const fullContent = generateLlmsFullTxt(raw);

  // ── Serve mode ────────────────────────────────────────────────────
  if (opts.serve) {
    const port = opts.port || 7331;
    const server = createServer((req, res) => {
      const url = (req.url || '/').split('?')[0];
      if (url === '/llms.txt' || url === '/') {
        res.writeHead(200, {
          'Content-Type': 'text/plain; charset=utf-8',
          'Access-Control-Allow-Origin': '*',
        });
        res.end(content);
      } else if (url === '/llms-full.txt') {
        res.writeHead(200, {
          'Content-Type': 'text/plain; charset=utf-8',
          'Access-Control-Allow-Origin': '*',
        });
        res.end(fullContent);
      } else {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not found. Available: /llms.txt  /llms-full.txt');
      }
    });

    server.listen(port, () => {
      console.log(chalk.bold('\n📄 Corral llms.txt server\n'));
      info(`Standard:  ${chalk.cyan(`http://localhost:${port}/llms.txt`)}`);
      info(`Full:      ${chalk.cyan(`http://localhost:${port}/llms-full.txt`)}`);
      console.log('');
      info('Press Ctrl+C to stop');
    });
    return;
  }

  // ── File output mode ──────────────────────────────────────────────
  if (opts.output) {
    const outPath = resolve(opts.output);
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, content, 'utf-8');
    success(`Written: ${chalk.cyan(opts.output)}`);

    // Also write llms-full.txt next to it
    const fullOut = outPath.replace(/llms\.txt$/, 'llms-full.txt');
    const fullOutRel = opts.output.replace(/llms\.txt$/, 'llms-full.txt');
    writeFileSync(fullOut, fullContent, 'utf-8');
    success(`Written: ${chalk.cyan(fullOutRel)}`);

    // Hint about serving it
    info(`Add to your server: GET /.well-known/llms.txt → ${opts.output}`);
    return;
  }

  // ── Stdout mode ───────────────────────────────────────────────────
  process.stdout.write(opts.full ? fullContent : content);
}
