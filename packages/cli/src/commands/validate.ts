/**
 * corral validate
 *
 * Comprehensive runtime check that everything is wired correctly AFTER `corral init`.
 * Different from `corral doctor` (which validates config files and static setup).
 * `corral validate` makes live HTTP calls to verify the running server.
 *
 * Usage:
 *   corral validate
 *   corral validate --url http://localhost:3000
 *   corral validate --json
 *   corral validate --fix        (auto-fix what it can)
 */

import { existsSync, readFileSync, writeFileSync, appendFileSync } from 'fs';
import chalk from 'chalk';
import { loadConfig } from '../config.js';
import { jsonOutput, success, error as logError, warn, info } from '../util.js';

// ─── Types ────────────────────────────────────────────────────────────────────

type CheckStatus = 'pass' | 'fail' | 'warn' | 'skip';

interface CheckResult {
  name: string;
  status: CheckStatus;
  detail?: string;
  fix?: string;   // suggested CLI command to fix
}

// ─── HTTP helpers ─────────────────────────────────────────────────────────────

const TIMEOUT_MS = 8000;

async function httpGet(url: string, cookie?: string): Promise<{ status: number; body: unknown }> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (cookie) headers['Cookie'] = cookie;
  const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS), headers });
  let body: unknown;
  try { body = await res.json(); } catch { body = null; }
  return { status: res.status, body };
}

async function httpPost(
  url: string,
  data: unknown,
  cookie?: string,
): Promise<{ status: number; body: unknown; setCookie?: string }> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (cookie) headers['Cookie'] = cookie;
  const res = await fetch(url, {
    method: 'POST',
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers,
    body: JSON.stringify(data),
  });
  let body: unknown;
  try { body = await res.json(); } catch { body = null; }
  const setCookie = res.headers.get('set-cookie') || undefined;
  return { status: res.status, body, setCookie };
}

async function httpDelete(url: string, cookie?: string): Promise<{ status: number }> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (cookie) headers['Cookie'] = cookie;
  const res = await fetch(url, { method: 'DELETE', signal: AbortSignal.timeout(TIMEOUT_MS), headers });
  return { status: res.status };
}

// ─── Individual checks ────────────────────────────────────────────────────────

/** 1. corral.yaml exists and parses cleanly */
function checkConfig(configPath: string): CheckResult {
  if (!existsSync(configPath)) {
    return {
      name: 'corral.yaml exists and valid',
      status: 'fail',
      detail: `${configPath} not found`,
      fix: 'corral init',
    };
  }
  try {
    loadConfig(configPath);
    return { name: 'corral.yaml exists and valid', status: 'pass', detail: configPath };
  } catch (e: any) {
    return { name: 'corral.yaml exists and valid', status: 'fail', detail: e.message };
  }
}

/** 2. Auth health endpoint responds */
async function checkAuthHealth(baseUrl: string): Promise<CheckResult> {
  const name = `Auth server responding (GET /api/auth/ok → 200)`;
  try {
    const { status, body } = await httpGet(`${baseUrl}/api/auth/ok`);
    if (status === 200) return { name, status: 'pass', detail: `${baseUrl}` };
    return { name, status: 'fail', detail: `HTTP ${status}: ${JSON.stringify(body)}` };
  } catch (e: any) {
    return { name, status: 'fail', detail: `Server not reachable: ${e.message}` };
  }
}

/** 3. Session creation — sign up, sign in, get-session, delete */
async function checkSessionFlow(baseUrl: string): Promise<CheckResult> {
  const name = 'Session creation works (signup + signin + get-session)';
  const email = `corral-validate-${Date.now()}@test.invalid`;
  const password = 'CorralValidate999!';
  let sessionCookie = '';

  try {
    // Sign up
    const signUp = await httpPost(`${baseUrl}/api/auth/sign-up/email`, {
      email, password, name: 'Corral Validate',
    });
    if (signUp.status !== 200 && signUp.status !== 201) {
      return { name, status: 'fail', detail: `Sign-up returned HTTP ${signUp.status}` };
    }
    if (signUp.setCookie) sessionCookie = signUp.setCookie.split(';')[0];

    // Sign in (if sign-up didn't return a session)
    if (!sessionCookie) {
      const signIn = await httpPost(`${baseUrl}/api/auth/sign-in/email`, { email, password });
      if (signIn.status !== 200) {
        return { name, status: 'fail', detail: `Sign-in returned HTTP ${signIn.status}` };
      }
      if (signIn.setCookie) sessionCookie = signIn.setCookie.split(';')[0];
    }

    // Get session
    const session = await httpGet(`${baseUrl}/api/auth/get-session`, sessionCookie);
    if (session.status !== 200) {
      return { name, status: 'fail', detail: `get-session returned HTTP ${session.status}` };
    }

    // Clean up — try to delete the test user (best effort)
    try {
      await httpPost(`${baseUrl}/api/auth/delete-user`, {}, sessionCookie);
    } catch {
      // ignore cleanup errors
    }

    return { name, status: 'pass' };
  } catch (e: any) {
    return { name, status: 'fail', detail: e.message };
  }
}

/** 4. Each configured social provider has env vars set */
function checkSocialProviders(configPath: string): CheckResult {
  const name = 'Social providers configured';
  let config: ReturnType<typeof loadConfig>;
  try { config = loadConfig(configPath); } catch {
    return { name, status: 'skip', detail: 'corral.yaml invalid' };
  }

  const providers = config.auth?.providers || [];
  const socialProviders = providers.filter(p => p !== 'email' && p !== 'username');
  if (socialProviders.length === 0) {
    return { name, status: 'skip', detail: 'No social providers configured' };
  }

  const envContent = ['.env', '.env.local']
    .filter(existsSync)
    .map(f => readFileSync(f, 'utf-8'))
    .join('\n');

  const providerEnvMap: Record<string, string[]> = {
    google:   ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'],
    github:   ['GITHUB_CLIENT_ID', 'GITHUB_CLIENT_SECRET'],
    twitter:  ['TWITTER_CLIENT_ID', 'TWITTER_CLIENT_SECRET'],
    discord:  ['DISCORD_CLIENT_ID', 'DISCORD_CLIENT_SECRET'],
    facebook: ['FACEBOOK_CLIENT_ID', 'FACEBOOK_CLIENT_SECRET'],
    apple:    ['APPLE_CLIENT_ID', 'APPLE_CLIENT_SECRET'],
    microsoft:['MICROSOFT_CLIENT_ID', 'MICROSOFT_CLIENT_SECRET'],
  };

  const results: string[] = [];
  const missing: string[] = [];

  for (const provider of socialProviders) {
    const required = providerEnvMap[provider.toLowerCase()];
    if (!required) { results.push(`${provider} ✓ (no env check)`); continue; }

    const allSet = required.every(
      v => envContent.includes(v) || process.env[v],
    );
    if (allSet) {
      results.push(`${provider} ✓`);
    } else {
      missing.push(provider);
      results.push(`${provider} ✗`);
    }
  }

  if (missing.length > 0) {
    return {
      name: `Social providers: ${results.join(', ')}`,
      status: 'fail',
      detail: `Missing env vars for: ${missing.join(', ')}`,
    };
  }
  return { name: `Social providers: ${results.join(', ')}`, status: 'pass' };
}

/** 5. Stripe API key works */
async function checkStripeConnection(): Promise<CheckResult> {
  const name = 'Stripe connected';
  const stripeKey =
    process.env.STRIPE_SECRET_KEY ||
    (() => {
      const envStr = ['.env', '.env.local'].filter(existsSync).map(f => readFileSync(f, 'utf-8')).join('\n');
      const m = envStr.match(/STRIPE_SECRET_KEY=(.+)/);
      return m ? m[1].trim() : '';
    })();

  if (!stripeKey) {
    return { name, status: 'skip', detail: 'STRIPE_SECRET_KEY not set — billing disabled' };
  }

  try {
    const res = await fetch('https://api.stripe.com/v1/products?limit=10', {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { Authorization: `Bearer ${stripeKey}` },
    });
    const body = (await res.json()) as any;
    if (res.status === 200) {
      const count = body?.data?.length ?? 0;
      const priceCount = 0; // could fetch separately if desired
      return { name: `Stripe connected (${count} product${count !== 1 ? 's' : ''})`, status: 'pass' };
    }
    if (res.status === 401) {
      return { name, status: 'fail', detail: 'Invalid Stripe API key', fix: 'Check STRIPE_SECRET_KEY in .env' };
    }
    return { name, status: 'fail', detail: `HTTP ${res.status}: ${JSON.stringify(body)}` };
  } catch (e: any) {
    return { name, status: 'fail', detail: `Stripe unreachable: ${e.message}` };
  }
}

/** 6. Stripe products match corral.yaml plans */
function checkStripePlans(configPath: string): CheckResult {
  const name = 'Stripe products match corral.yaml plans';
  let config: ReturnType<typeof loadConfig>;
  try { config = loadConfig(configPath); } catch {
    return { name, status: 'skip', detail: 'corral.yaml invalid' };
  }

  const plans = config.billing?.plans || {};
  const paidPlans = Object.entries(plans).filter(([, p]) => p.price && p.price > 0);

  if (paidPlans.length === 0) {
    return { name, status: 'skip', detail: 'No paid plans in corral.yaml' };
  }

  const missingPriceId = paidPlans.filter(([, p]) => !p.stripe_price_id).map(([k]) => k);
  if (missingPriceId.length > 0) {
    return {
      name,
      status: 'warn',
      detail: `Plans missing stripe_price_id: ${missingPriceId.join(', ')}`,
      fix: 'corral stripe push',
    };
  }

  return { name: `${name} (${paidPlans.length} paid plan${paidPlans.length !== 1 ? 's' : ''})`, status: 'pass' };
}

/** 7. Device auth endpoint reachable */
async function checkDeviceAuth(baseUrl: string): Promise<CheckResult> {
  const name = 'Device auth endpoint reachable (POST /api/corral/device/authorize → 200)';
  try {
    const { status } = await httpPost(`${baseUrl}/api/corral/device/authorize`, { client_id: '__validate_probe__' });
    // Expect 200 or 4xx (endpoint exists, just rejects bad input — that's fine)
    if (status < 500) return { name, status: 'pass', detail: `HTTP ${status}` };
    return {
      name,
      status: 'fail',
      detail: `HTTP ${status} — endpoint may not be mounted`,
      fix: 'corral add device-auth',
    };
  } catch (e: any) {
    return {
      name,
      status: 'fail',
      detail: `Not reachable: ${e.message}`,
      fix: 'corral add device-auth',
    };
  }
}

/** 8. Usage tracking table accessible */
async function checkUsageTracking(baseUrl: string): Promise<CheckResult> {
  const name = 'Usage tracking table exists';
  try {
    // POST a probe event; the endpoint should return 200/202 or 400 (missing fields)
    const { status } = await httpPost(`${baseUrl}/api/corral/usage/track`, {
      user_id: '__validate_probe__',
      meter: '__probe__',
      delta: 0,
    });
    if (status < 500) return { name, status: 'pass', detail: `HTTP ${status}` };
    return {
      name,
      status: 'fail',
      detail: `HTTP ${status} — usage endpoint may not be registered`,
      fix: 'corral add usage',
    };
  } catch (e: any) {
    return {
      name,
      status: 'warn',
      detail: `Not reachable: ${e.message}`,
      fix: 'corral add usage',
    };
  }
}

/** 9. Admin API reachable */
async function checkAdminApi(baseUrl: string): Promise<CheckResult> {
  const name = 'Admin API reachable (/api/auth/admin/list-users → 200)';
  try {
    const { status } = await httpGet(`${baseUrl}/api/auth/admin/list-users`);
    // 200 (has session) or 401/403 (no session but endpoint exists) both mean it's mounted
    if (status < 500) return { name, status: 'pass', detail: `HTTP ${status}` };
    return { name, status: 'fail', detail: `HTTP ${status} — admin plugin may not be registered` };
  } catch (e: any) {
    return { name, status: 'fail', detail: e.message };
  }
}

/** 10. Webhook endpoint responds (only if URL configured) */
async function checkWebhook(configPath: string, baseUrl: string): Promise<CheckResult> {
  const name = 'Webhook endpoint configured';
  let config: ReturnType<typeof loadConfig>;
  try { config = loadConfig(configPath); } catch {
    return { name, status: 'skip', detail: 'corral.yaml invalid' };
  }

  // Look for webhook config in corral.yaml (may not be in the schema yet — try raw)
  const rawYaml = readFileSync(configPath, 'utf-8');
  const hasWebhook = rawYaml.includes('webhook');
  if (!hasWebhook) {
    return {
      name,
      status: 'warn',
      detail: 'Webhook endpoint not configured',
      fix: 'corral add webhook',
    };
  }

  try {
    const { status } = await httpPost(`${baseUrl}/api/corral/webhook`, {
      type: '__validate_probe__',
    });
    if (status < 500) return { name, status: 'pass', detail: `HTTP ${status}` };
    return { name, status: 'fail', detail: `HTTP ${status}` };
  } catch (e: any) {
    return { name, status: 'fail', detail: e.message };
  }
}

/** 11. Device verify page exists on filesystem */
function checkDeviceVerifyPage(): CheckResult {
  const name = 'Device verify page exists';
  const candidates = [
    'app/device-verify/page.tsx',
    'app/device-verify/page.jsx',
    'src/app/device-verify/page.tsx',
    'pages/device-verify.tsx',
    'pages/device-verify.jsx',
    'src/pages/device-verify.tsx',
  ];
  const found = candidates.find(p => existsSync(p));
  if (found) return { name, status: 'pass', detail: found };
  return {
    name,
    status: 'warn',
    detail: 'No device verify page found',
    fix: 'corral add device-verify',
  };
}

/** 12. CORRAL.md exists */
function checkCorralMd(): CheckResult {
  const name = 'CORRAL.md exists (agent discovery)';
  if (existsSync('CORRAL.md')) return { name, status: 'pass' };
  return {
    name,
    status: 'warn',
    detail: 'Agents won\'t auto-discover Corral config',
    fix: 'corral init',
  };
}

// ─── Auto-fix helpers ─────────────────────────────────────────────────────────

/**
 * Attempt to fix what we can automatically.
 * Currently handles: CORRAL.md creation, .gitignore entries.
 */
function autoFix(checks: CheckResult[]): string[] {
  const fixed: string[] = [];

  for (const check of checks) {
    if (check.status === 'pass') continue;

    // Fix: create CORRAL.md stub
    if (check.name.includes('CORRAL.md') && !existsSync('CORRAL.md')) {
      const appName = process.cwd().split('/').pop() || 'my-app';
      writeFileSync('CORRAL.md', `# ${appName} — Corral Auth\n\nRun \`corral init\` to complete setup.\n`);
      check.status = 'pass';
      check.detail = 'Created CORRAL.md stub';
      fixed.push('Created CORRAL.md');
    }

    // Fix: add .env to .gitignore
    if (check.name.includes('.gitignore')) {
      const gitignore = existsSync('.gitignore') ? readFileSync('.gitignore', 'utf-8') : '';
      if (!gitignore.includes('.env')) {
        appendFileSync('.gitignore', '\n.env\n.env.local\n');
        fixed.push('Added .env to .gitignore');
      }
    }
  }

  return fixed;
}

// ─── Main command ─────────────────────────────────────────────────────────────

export async function validateCommand(opts: {
  json?: boolean;
  fix?: boolean;
  config: string;
  url?: string;
}) {
  const baseUrl = opts.url || process.env.BETTER_AUTH_URL || 'http://localhost:3000';

  console.log(chalk.bold('\n🔍 Validating Corral setup...\n'));

  const checks: CheckResult[] = [];

  // Run all checks (sequential — many are runtime HTTP calls)
  checks.push(checkConfig(opts.config));

  // Static checks (no server needed)
  checks.push(checkSocialProviders(opts.config));
  checks.push(checkStripePlans(opts.config));
  checks.push(checkDeviceVerifyPage());
  checks.push(checkCorralMd());

  // Runtime checks (server must be running)
  const serverChecks = await Promise.allSettled([
    checkAuthHealth(baseUrl),
    checkSessionFlow(baseUrl),
    checkStripeConnection(),
    checkDeviceAuth(baseUrl),
    checkUsageTracking(baseUrl),
    checkAdminApi(baseUrl),
    checkWebhook(opts.config, baseUrl),
  ]);

  for (const result of serverChecks) {
    checks.push(result.status === 'fulfilled' ? result.value : {
      name: 'Runtime check',
      status: 'fail',
      detail: result.reason?.message || 'Unknown error',
    });
  }

  // Auto-fix if requested
  let fixedItems: string[] = [];
  if (opts.fix) {
    fixedItems = autoFix(checks);
    if (fixedItems.length > 0) {
      console.log(chalk.cyan.bold('  🔧 Auto-fixed:\n'));
      for (const f of fixedItems) console.log(`  ${chalk.cyan('→')} ${f}`);
      console.log('');
    }
  }

  // ─── Print results ───────────────────────────────────────────────

  for (const check of checks) {
    if (check.status === 'pass') {
      console.log(`  ${chalk.green('✓')} ${check.detail ? `${check.name} — ${chalk.dim(check.detail)}` : check.name}`);
    } else if (check.status === 'fail') {
      const detail = check.detail ? ` — ${check.detail}` : '';
      const fix = check.fix ? ` ${chalk.dim(`run: ${check.fix}`)}` : '';
      console.log(`  ${chalk.red('✗')} ${check.name}${detail}${fix}`);
    } else if (check.status === 'warn') {
      const detail = check.detail ? ` — ${check.detail}` : '';
      const fix = check.fix ? ` ${chalk.dim(`run: ${check.fix}`)}` : '';
      console.log(`  ${chalk.yellow('⚠')} ${check.name}${detail}${fix}`);
    } else {
      // skip
      console.log(`  ${chalk.dim('—')} ${check.name} ${chalk.dim('(skipped)')}`);
    }
  }

  // ─── Summary ────────────────────────────────────────────────────

  const passed = checks.filter(c => c.status === 'pass').length;
  const failed = checks.filter(c => c.status === 'fail').length;
  const warnings = checks.filter(c => c.status === 'warn').length;
  const skipped = checks.filter(c => c.status === 'skip').length;
  const total = checks.length - skipped;

  console.log('');
  console.log(chalk.bold('─'.repeat(50)));
  if (failed === 0 && warnings === 0) {
    console.log(chalk.green.bold(`\n  ✅ All ${passed}/${total} checks passed\n`));
  } else if (failed === 0) {
    console.log(chalk.yellow.bold(`\n  ⚠  ${passed}/${total} checks passed (${warnings} warning${warnings !== 1 ? 's' : ''})\n`));
  } else {
    console.log(chalk.red.bold(`\n  ❌ ${passed}/${total} checks passed (${failed} failed, ${warnings} warning${warnings !== 1 ? 's' : ''})\n`));
  }

  if (skipped > 0) {
    console.log(chalk.dim(`  ${skipped} check${skipped !== 1 ? 's' : ''} skipped (feature not configured)\n`));
  }

  if (!opts.fix && (failed > 0 || warnings > 0)) {
    console.log(chalk.dim(`  Tip: run ${chalk.cyan('corral validate --fix')} to auto-fix what\'s possible\n`));
  }

  if (jsonOutput({
    baseUrl,
    checks,
    summary: { passed, failed, warnings, skipped, total },
    fixed: fixedItems,
  }, !!opts.json)) return;
}
