import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
import chalk from 'chalk';
import { loadConfigRaw } from '../config.js';
import { jsonOutput } from '../util.js';

// ── Types ────────────────────────────────────────────────────────────────

interface PlanStatus {
  id: string;
  name: string;
  price: number;
  users: number;
  mrr: number;
}

interface MeterStatus {
  id: string;
  name: string;
  totalUsage: number;
  period: string;
}

interface StatusData {
  framework: string;
  auth: {
    status: 'running' | 'unreachable' | 'unknown';
    url: string;
    providers: string[];
  };
  database: {
    type: string;
    path: string;
    totalUsers: number;
  };
  plans: PlanStatus[];
  totalMrr: number;
  features: { total: number; gated: number };
  meters: MeterStatus[];
  stripe: { connected: boolean; products: number; prices: number };
  devices: number;
  apiKeys: number;
  lastSignup: string | null;
  lastLogin: string | null;
}

// ── Helpers ──────────────────────────────────────────────────────────────

function detectFramework(): string {
  if (!existsSync('package.json')) return 'unknown';
  try {
    const pkg = JSON.parse(readFileSync('package.json', 'utf-8'));
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    if (deps['next']) {
      const ver = (deps['next'] as string).replace(/[^0-9.]/g, '').split('.')[0];
      return `Next.js ${ver}`;
    }
    if (deps['@remix-run/react'] || deps['@remix-run/node']) return 'Remix';
    if (deps['@sveltejs/kit']) return 'SvelteKit';
    if (deps['nuxt']) return 'Nuxt';
    if (deps['astro']) return 'Astro';
    if (deps['hono']) return 'Hono';
    if (deps['fastify']) return 'Fastify';
    if (deps['express']) return 'Express';
    if (deps['react']) return 'React (Vite)';
    if (deps['vue']) return 'Vue';
  } catch {}
  return 'unknown';
}

function parseDbUrl(url: string): { type: string; path: string } {
  if (!url || url.startsWith('file:')) {
    return { type: 'sqlite', path: url?.replace(/^file:/, '') || 'corral.db' };
  }
  if (url.startsWith('postgresql://') || url.startsWith('postgres://')) {
    return { type: 'postgresql', path: url };
  }
  if (url.startsWith('mysql://')) {
    return { type: 'mysql', path: url };
  }
  if (url.startsWith('libsql://') || url.startsWith('wss://')) {
    return { type: 'turso', path: url };
  }
  // Bare file path
  return { type: 'sqlite', path: url };
}

function relativeTime(isoStr: string | null): string {
  if (!isoStr) return 'never';
  const diff = Date.now() - new Date(isoStr).getTime();
  const s = Math.floor(diff / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  const d = Math.floor(h / 24);
  if (d > 0) return `${d} day${d > 1 ? 's' : ''} ago`;
  if (h > 0) return `${h} hour${h > 1 ? 's' : ''} ago`;
  if (m > 0) return `${m} minute${m > 1 ? 's' : ''} ago`;
  return `${s} second${s !== 1 ? 's' : ''} ago`;
}

// ── Database queries ──────────────────────────────────────────────────────

interface DbData {
  totalUsers: number;
  planCounts: Record<string, number>;
  devices: number;
  apiKeys: number;
  lastSignup: string | null;
  lastLogin: string | null;
  subscriptions: Array<{ plan: string; count: number }>;
  meterUsage: Record<string, number>;
}

async function queryDatabase(dbPath: string, dbType: string): Promise<DbData> {
  const empty: DbData = {
    totalUsers: 0,
    planCounts: {},
    devices: 0,
    apiKeys: 0,
    lastSignup: null,
    lastLogin: null,
    subscriptions: [],
    meterUsage: {},
  };

  // Only SQLite supported for direct CLI queries right now
  if (dbType !== 'sqlite') return empty;

  const resolvedPath = resolve(dbPath);
  if (!existsSync(resolvedPath)) return empty;

  try {
    // Dynamic import — only available if project has better-sqlite3 installed
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const Database = (await import('better-sqlite3' as any)).default;
    const db = new Database(resolvedPath, { readonly: true });

    const safeGet = <T>(stmt: string): T | undefined => {
      try { return db.prepare(stmt).get() as T; } catch { return undefined; }
    };
    const safeAll = <T>(stmt: string): T[] => {
      try { return db.prepare(stmt).all() as T[]; } catch { return []; }
    };

    // Total users
    const totalRow = safeGet<{ count: number }>(`SELECT COUNT(*) as count FROM "user"`);
    empty.totalUsers = totalRow?.count ?? 0;

    // Users per plan
    const planRows = safeAll<{ plan: string; count: number }>(
      `SELECT COALESCE(plan, 'free') as plan, COUNT(*) as count FROM "user" GROUP BY plan`
    );
    for (const r of planRows) empty.planCounts[r.plan] = r.count;

    // Last signup
    const signupRow = safeGet<{ last: string }>(`SELECT MAX(createdAt) as last FROM "user"`);
    empty.lastSignup = signupRow?.last ?? null;

    // Last login (most recent session created)
    const loginRow = safeGet<{ last: string }>(`SELECT MAX(createdAt) as last FROM "session"`);
    empty.lastLogin = loginRow?.last ?? null;

    // Authorized devices
    const deviceRow = safeGet<{ count: number }>(
      `SELECT COUNT(*) as count FROM "device_token" WHERE status = 'authorized'`
    );
    empty.devices = deviceRow?.count ?? 0;

    // Active API keys
    const apiKeyRow = safeGet<{ count: number }>(
      `SELECT COUNT(*) as count FROM "api_key" WHERE enabled = 1`
    );
    empty.apiKeys = apiKeyRow?.count ?? 0;

    // Active subscriptions per plan (for MRR)
    const subRows = safeAll<{ plan: string; count: number }>(
      `SELECT plan, COUNT(*) as count FROM "subscription" WHERE status = 'active' GROUP BY plan`
    );
    empty.subscriptions = subRows;

    // Meter usage (current period events)
    const usageRows = safeAll<{ meterId: string; total: number }>(
      `SELECT meterId, SUM(count) as total FROM "usage_event" GROUP BY meterId`
    );
    for (const r of usageRows) empty.meterUsage[r.meterId] = r.total;

    db.close();
  } catch {
    // better-sqlite3 not installed, DB locked, or tables don't exist — silently return empty
  }

  return empty;
}

// ── Config helpers ────────────────────────────────────────────────────────

function getPlansFromRaw(raw: Record<string, any>): Array<{
  id: string; name: string; price: number;
}> {
  // Template format: top-level `plans` array
  if (Array.isArray(raw.plans)) {
    return raw.plans.map((p: any) => ({
      id: (p.name || '').toLowerCase(),
      name: p.display_name || p.name || 'unknown',
      price: p.price ?? 0,
    }));
  }
  // Schema format: billing.plans record
  if (raw.billing?.plans && typeof raw.billing.plans === 'object') {
    return Object.entries(raw.billing.plans as Record<string, any>).map(([k, v]: [string, any]) => ({
      id: k,
      name: v.name || k,
      price: v.price ?? 0,
    }));
  }
  return [];
}

function getAuthProviders(raw: Record<string, any>): string[] {
  const providers: string[] = [];
  const methods = raw.auth?.methods || {};

  if (methods.email_password !== false) providers.push('email/password');
  if (methods.magic_link) providers.push('magic-link');
  if (methods.email_otp) providers.push('email-otp');

  for (const p of ['google', 'github', 'apple', 'discord', 'microsoft', 'twitter']) {
    if (methods[p]) providers.push(p);
  }
  // auth.providers array format (config schema)
  if (Array.isArray(raw.auth?.providers)) {
    for (const p of raw.auth.providers) {
      if (!providers.includes(p)) providers.push(p);
    }
  }
  return providers.length > 0 ? providers : ['email/password'];
}

// ── Main command ──────────────────────────────────────────────────────────

export async function statusCommand(opts: { json?: boolean; config: string; url?: string }) {
  const baseUrl = opts.url || process.env.BETTER_AUTH_URL || 'http://localhost:3000';

  // ── Load config ──────────────────────────────────────────────────
  let raw: Record<string, any> = {};
  let configLoaded = false;
  try {
    raw = loadConfigRaw(opts.config);
    configLoaded = true;
  } catch {
    // Continue with defaults — will show what we can detect
  }

  const appName = raw.app?.name || 'unknown';
  const framework = detectFramework();

  // ── Database ─────────────────────────────────────────────────────
  const dbUrl = raw.database?.url || 'file:./corral.db';
  const { type: dbType, path: dbPath } = parseDbUrl(dbUrl);
  const dbData = await queryDatabase(dbPath, dbType);

  // ── Plans ────────────────────────────────────────────────────────
  const rawPlans = getPlansFromRaw(raw);
  const planStatuses: PlanStatus[] = rawPlans.map(p => {
    const users = dbData.planCounts[p.id] ?? dbData.planCounts[p.name] ?? 0;
    // Prefer active subscription count for MRR (falls back to plan column users)
    const activeSubs = dbData.subscriptions.find(
      s => s.plan.toLowerCase() === p.id || s.plan === p.name
    )?.count ?? (p.price > 0 ? users : 0);
    return { id: p.id, name: p.name, price: p.price, users, mrr: p.price * activeSubs };
  });

  // If no plans in config but DB has data, build from plan column
  if (planStatuses.length === 0 && Object.keys(dbData.planCounts).length > 0) {
    for (const [plan, count] of Object.entries(dbData.planCounts)) {
      planStatuses.push({ id: plan, name: plan, price: 0, users: count, mrr: 0 });
    }
  }

  const totalUsers = dbData.totalUsers;
  const totalMrr = planStatuses.reduce((s, p) => s + p.mrr, 0);

  // ── Auth providers ────────────────────────────────────────────────
  const authProviders = getAuthProviders(raw);

  // ── Features ─────────────────────────────────────────────────────
  const featuresConfig: Record<string, any> = raw.features || {};
  const totalFeatures = Object.keys(featuresConfig).length;
  const gatedFeatures = Object.values(featuresConfig).filter((plans: any) => {
    if (!Array.isArray(plans)) return false;
    return !(plans as string[]).includes('*') && !(plans as string[]).includes('authenticated');
  }).length;

  // ── Meters ───────────────────────────────────────────────────────
  const metersConfig: Record<string, any> = raw.meters || {};
  const meterStatuses: MeterStatus[] = Object.entries(metersConfig).map(([id, m]: [string, any]) => ({
    id,
    name: m.label || m.name || id,
    totalUsage: dbData.meterUsage[id] ?? 0,
    period: m.reset_period || 'monthly',
  }));

  // ── Auth server health ────────────────────────────────────────────
  let authStatus: 'running' | 'unreachable' | 'unknown' = 'unknown';
  try {
    const res = await fetch(`${baseUrl}/api/auth/ok`, {
      signal: AbortSignal.timeout(3000),
    });
    const body = await res.json() as any;
    authStatus = body.ok ? 'running' : 'unreachable';
  } catch {
    authStatus = 'unreachable';
  }

  // ── Stripe ───────────────────────────────────────────────────────
  let stripeConnected = false;
  let stripeProducts = 0;
  let stripePrices = 0;
  const stripeKeyEnv = raw.billing?.stripe?.secret_key_env || raw.billing?.stripe_secret_key_env || 'STRIPE_SECRET_KEY';
  const stripeKey = process.env[stripeKeyEnv] || process.env.STRIPE_SECRET_KEY;

  if (stripeKey) {
    try {
      const [prodRes, priceRes] = await Promise.all([
        fetch('https://api.stripe.com/v1/products?limit=100', {
          headers: { Authorization: `Bearer ${stripeKey}` },
          signal: AbortSignal.timeout(5000),
        }),
        fetch('https://api.stripe.com/v1/prices?limit=100', {
          headers: { Authorization: `Bearer ${stripeKey}` },
          signal: AbortSignal.timeout(5000),
        }),
      ]);
      if (prodRes.ok && priceRes.ok) {
        stripeConnected = true;
        const prods = await prodRes.json() as any;
        const prices = await priceRes.json() as any;
        stripeProducts = prods.data?.length ?? 0;
        stripePrices = prices.data?.length ?? 0;
      }
    } catch {}
  }

  // ── Build output data ─────────────────────────────────────────────
  const statusData: StatusData = {
    framework,
    auth: {
      status: authStatus,
      url: `${baseUrl}/api/auth`,
      providers: authProviders,
    },
    database: {
      type: dbType,
      path: dbPath,
      totalUsers,
    },
    plans: planStatuses,
    totalMrr,
    features: { total: totalFeatures, gated: gatedFeatures },
    meters: meterStatuses,
    stripe: { connected: stripeConnected, products: stripeProducts, prices: stripePrices },
    devices: dbData.devices,
    apiKeys: dbData.apiKeys,
    lastSignup: dbData.lastSignup,
    lastLogin: dbData.lastLogin,
  };

  // ── JSON output ───────────────────────────────────────────────────
  if (jsonOutput(statusData, !!opts.json)) return;

  // ── Pretty output ─────────────────────────────────────────────────
  const COL = 16; // label column width
  const row = (label: string, value: string) =>
    console.log(`  ${chalk.dim(label.padEnd(COL))} ${value}`);

  console.log(chalk.bold(`\n🐴 Corral Status\n`));

  if (!configLoaded) {
    console.log(chalk.yellow(`  ⚠  No ${opts.config} found — run: corral init\n`));
  }

  row('Project:', `${chalk.cyan(appName)} (${chalk.dim(framework)})`);

  const authIcon = authStatus === 'running'
    ? chalk.green(`✓ Running ${chalk.dim(`(${baseUrl}/api/auth)`)}`)
    : authStatus === 'unreachable'
      ? chalk.dim(`✗ Unreachable ${chalk.dim(`(${baseUrl}/api/auth)`)}`)
      : chalk.dim('unknown');
  row('Auth:', authIcon);

  const dbLabel = dbType === 'sqlite'
    ? `SQLite (${chalk.dim(dbPath)}, ${chalk.white(String(totalUsers))} users)`
    : `${dbType} (${chalk.white(String(totalUsers))} users)`;
  row('Database:', dbLabel);

  // ── Plans table ───────────────────────────────────────────────────
  if (planStatuses.length > 0) {
    console.log('');
    console.log(`  ${chalk.dim('Plans:')}`);

    const nw = 12, uw = 12, pw = 10;
    for (const p of planStatuses) {
      const usersStr = `${p.users} user${p.users !== 1 ? 's' : ''}`.padEnd(uw);
      const priceStr = (p.price === 0 ? '$0/mo' : `$${p.price}/mo`).padEnd(pw);
      const mrrStr = p.mrr > 0 ? chalk.green(`MRR: $${p.mrr.toLocaleString()}`) : '';
      console.log(`    ${chalk.cyan(p.name.padEnd(nw))} ${chalk.white(usersStr)} ${chalk.dim(priceStr)} ${mrrStr}`);
    }

    const sep = '─'.repeat(46);
    console.log(`    ${chalk.dim(sep)}`);
    const totalUsersStr = `${totalUsers} user${totalUsers !== 1 ? 's' : ''}`.padEnd(uw);
    const mrrLabel = totalMrr > 0 ? chalk.green(`MRR: $${totalMrr.toLocaleString()}`) : '';
    console.log(`    ${'Total'.padEnd(nw)} ${chalk.white(totalUsersStr)} ${''.padEnd(pw)} ${mrrLabel}`);
  }

  console.log('');
  row('Auth Providers:', authProviders.join(', '));
  row('Features:', `${totalFeatures} configured (${gatedFeatures} gated)`);

  if (meterStatuses.length > 0) {
    const summary = meterStatuses
      .map(m => `${m.id}: ${m.totalUsage.toLocaleString()} this period`)
      .join(', ');
    row('Meters:', `${meterStatuses.length} active (${chalk.dim(summary)})`);
  } else {
    row('Meters:', chalk.dim('none configured'));
  }

  if (!stripeKey) {
    row('Stripe:', chalk.dim('not configured'));
  } else if (stripeConnected) {
    row('Stripe:', chalk.green(`✓ Connected (${stripeProducts} products, ${stripePrices} prices)`));
  } else {
    row('Stripe:', chalk.red('✗ Connection failed'));
  }

  row('Devices:', `${dbData.devices} authorized`);
  row('API Keys:', `${dbData.apiKeys} active`);

  console.log('');
  row('Last signup:', dbData.lastSignup ? relativeTime(dbData.lastSignup) : chalk.dim('never'));
  row('Last login:', dbData.lastLogin ? relativeTime(dbData.lastLogin) : chalk.dim('never'));
  console.log('');
}
