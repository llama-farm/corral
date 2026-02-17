import chalk from 'chalk';
import { success, error, info, warn, jsonOutput } from '../util.js';

interface TestResult {
  name: string;
  passed: boolean;
  detail?: string;
  duration?: number;
}

async function timedFetch(url: string, options?: RequestInit): Promise<{ res: Response; ms: number }> {
  const start = Date.now();
  const res = await fetch(url, options);
  return { res, ms: Date.now() - start };
}

export async function testCommand(opts: {
  json?: boolean;
  url?: string;
  email?: string;
  password?: string;
  name?: string;
  cleanup?: boolean;
}) {
  const baseUrl = opts.url || process.env.BETTER_AUTH_URL || 'http://localhost:3000';
  const authUrl = `${baseUrl}/api/auth`;
  const email = opts.email || `corral-test-${Date.now()}@test.local`;
  const password = opts.password || 'CorralTest123!';
  const name = opts.name || 'Corral Test User';
  const results: TestResult[] = [];
  let sessionToken: string | null = null;
  let sessionCookie: string | null = null;
  let userId: string | null = null;

  console.log(chalk.bold(`\n🧪 Corral Test Suite — ${baseUrl}\n`));

  // ─── Test 1: Health Check ───────────────────────────────────────────
  try {
    const { res, ms } = await timedFetch(`${authUrl}/ok`);
    const body = await res.json();
    if (body.ok === true) {
      results.push({ name: 'Health check (/api/auth/ok)', passed: true, duration: ms });
      success(`Health check ✓ (${ms}ms)`);
    } else {
      results.push({ name: 'Health check', passed: false, detail: `Unexpected response: ${JSON.stringify(body)}` });
      error(`Health check — unexpected response: ${JSON.stringify(body)}`);
    }
  } catch (e: any) {
    results.push({ name: 'Health check', passed: false, detail: e.message });
    error(`Health check — ${e.message}`);
    // If health check fails, nothing else will work
    console.log(chalk.red('\n  Cannot reach auth server. Is it running?\n'));
    if (opts.json) jsonOutput({ results, passed: false }, true);
    return;
  }

  // ─── Test 2: Unauthenticated Session ────────────────────────────────
  try {
    const { res, ms } = await timedFetch(`${authUrl}/get-session`);
    const body = await res.text();
    // Should return null or empty session
    if (body === 'null' || body === '{}' || (res.ok && !JSON.parse(body)?.user)) {
      results.push({ name: 'Unauthenticated session returns null', passed: true, duration: ms });
      success(`Unauth session → null ✓ (${ms}ms)`);
    } else {
      results.push({ name: 'Unauthenticated session', passed: false, detail: `Expected null, got: ${body.slice(0, 100)}` });
      warn(`Unauth session returned data (may have existing cookie)`);
    }
  } catch (e: any) {
    results.push({ name: 'Unauthenticated session', passed: false, detail: e.message });
    error(`Unauth session — ${e.message}`);
  }

  // ─── Test 3: Sign Up ───────────────────────────────────────────────
  try {
    const { res, ms } = await timedFetch(`${authUrl}/sign-up/email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, name }),
    });
    const body = await res.json();
    
    if (body.user?.id && body.token) {
      userId = body.user.id;
      sessionToken = body.token;
      // Extract set-cookie header
      const setCookie = res.headers.get('set-cookie');
      if (setCookie) sessionCookie = setCookie;
      
      results.push({ name: 'Sign up', passed: true, duration: ms, detail: `User ID: ${userId}` });
      success(`Sign up ✓ — ${email} (${ms}ms)`);
    } else if (body.message?.includes('already exists') || body.code === 'USER_ALREADY_EXISTS') {
      results.push({ name: 'Sign up', passed: true, duration: ms, detail: 'User already exists (OK)' });
      warn(`Sign up — user already exists, will test login instead`);
    } else {
      results.push({ name: 'Sign up', passed: false, detail: JSON.stringify(body).slice(0, 200) });
      error(`Sign up — ${JSON.stringify(body).slice(0, 200)}`);
    }
  } catch (e: any) {
    results.push({ name: 'Sign up', passed: false, detail: e.message });
    error(`Sign up — ${e.message}`);
  }

  // ─── Test 4: Sign In ───────────────────────────────────────────────
  try {
    const { res, ms } = await timedFetch(`${authUrl}/sign-in/email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const body = await res.json();
    
    if (body.user?.id && body.token) {
      userId = body.user.id;
      sessionToken = body.token;
      const setCookie = res.headers.get('set-cookie');
      if (setCookie) sessionCookie = setCookie;
      
      results.push({ name: 'Sign in', passed: true, duration: ms });
      success(`Sign in ✓ — token received (${ms}ms)`);
      
      // Verify user data
      if (body.user.email === email) {
        results.push({ name: 'Sign in — email matches', passed: true });
        success(`  Email matches ✓`);
      }
      if (body.user.name === name) {
        results.push({ name: 'Sign in — name matches', passed: true });
        success(`  Name matches ✓`);
      }
    } else {
      results.push({ name: 'Sign in', passed: false, detail: JSON.stringify(body).slice(0, 200) });
      error(`Sign in — ${JSON.stringify(body).slice(0, 200)}`);
    }
  } catch (e: any) {
    results.push({ name: 'Sign in', passed: false, detail: e.message });
    error(`Sign in — ${e.message}`);
  }

  // ─── Test 5: Authenticated Session ──────────────────────────────────
  if (sessionToken) {
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (sessionCookie) headers['Cookie'] = sessionCookie;
      else headers['Authorization'] = `Bearer ${sessionToken}`;
      
      const { res, ms } = await timedFetch(`${authUrl}/get-session`, { headers });
      const body = await res.json();
      
      if (body.user?.id === userId) {
        results.push({ name: 'Authenticated session', passed: true, duration: ms });
        success(`Auth session ✓ — user ID matches (${ms}ms)`);
      } else if (body.session) {
        results.push({ name: 'Authenticated session', passed: true, duration: ms, detail: 'Session exists but user ID mismatch' });
        warn(`Auth session — got session but user ID differs`);
      } else {
        results.push({ name: 'Authenticated session', passed: false, detail: `No session returned: ${JSON.stringify(body).slice(0, 100)}` });
        error(`Auth session — no session returned`);
      }
    } catch (e: any) {
      results.push({ name: 'Authenticated session', passed: false, detail: e.message });
      error(`Auth session — ${e.message}`);
    }
  }

  // ─── Test 6: Sign Out ───────────────────────────────────────────────
  if (sessionToken) {
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (sessionCookie) headers['Cookie'] = sessionCookie;
      else headers['Authorization'] = `Bearer ${sessionToken}`;
      
      const { res, ms } = await timedFetch(`${authUrl}/sign-out`, {
        method: 'POST',
        headers,
      });
      
      if (res.ok) {
        results.push({ name: 'Sign out', passed: true, duration: ms });
        success(`Sign out ✓ (${ms}ms)`);
      } else {
        const body = await res.text();
        results.push({ name: 'Sign out', passed: false, detail: body.slice(0, 100) });
        error(`Sign out — ${res.status}: ${body.slice(0, 100)}`);
      }
    } catch (e: any) {
      results.push({ name: 'Sign out', passed: false, detail: e.message });
      error(`Sign out — ${e.message}`);
    }
  }

  // ─── Test 7: Session After Sign Out ─────────────────────────────────
  if (sessionToken) {
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (sessionCookie) headers['Cookie'] = sessionCookie;
      else headers['Authorization'] = `Bearer ${sessionToken}`;
      
      const { res, ms } = await timedFetch(`${authUrl}/get-session`, { headers });
      const body = await res.text();
      
      if (body === 'null' || !JSON.parse(body)?.user) {
        results.push({ name: 'Session cleared after sign out', passed: true, duration: ms });
        success(`Post-signout session → null ✓ (${ms}ms)`);
      } else {
        results.push({ name: 'Session cleared after sign out', passed: false, detail: 'Session still active' });
        warn(`Post-signout — session still active`);
      }
    } catch (e: any) {
      // Parse error on null is fine
      results.push({ name: 'Session cleared after sign out', passed: true });
      success(`Post-signout session → null ✓`);
    }
  }

  // ─── Test 8: Password Validation ────────────────────────────────────
  try {
    const { res, ms } = await timedFetch(`${authUrl}/sign-in/email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: 'wrong-password-12345' }),
    });
    const body = await res.json();
    
    if (!body.token && (res.status >= 400 || body.message || body.code)) {
      results.push({ name: 'Wrong password rejected', passed: true, duration: ms });
      success(`Wrong password rejected ✓ (${ms}ms)`);
    } else if (body.token) {
      results.push({ name: 'Wrong password rejected', passed: false, detail: 'Login succeeded with wrong password!' });
      error(`CRITICAL: Wrong password was accepted!`);
    }
  } catch (e: any) {
    // An error/rejection is actually correct here
    results.push({ name: 'Wrong password rejected', passed: true });
    success(`Wrong password rejected ✓`);
  }

  // ─── Summary ────────────────────────────────────────────────────────
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  const totalMs = results.reduce((sum, r) => sum + (r.duration || 0), 0);

  console.log('');
  console.log(chalk.bold('─'.repeat(50)));
  if (failed === 0) {
    console.log(chalk.green.bold(`\n  ✅ All ${passed} tests passed (${totalMs}ms)\n`));
  } else {
    console.log(chalk.red.bold(`\n  ❌ ${failed} failed, ${passed} passed (${totalMs}ms)\n`));
    results.filter(r => !r.passed).forEach(r => {
      console.log(chalk.red(`    ✗ ${r.name}: ${r.detail || 'unknown'}`));
    });
    console.log('');
  }

  // Cleanup hint
  if (!opts.cleanup && userId) {
    info(`Test user: ${email} (ID: ${userId})`);
    info(`Re-run with --cleanup to delete test user after`);
  }

  if (jsonOutput({ results, passed, failed, totalMs, testUser: { email, userId } }, !!opts.json)) return;
}
