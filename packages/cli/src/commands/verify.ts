import chalk from 'chalk';
import { success, error, info, warn, jsonOutput } from '../util.js';

interface StepResult {
  step: string;
  passed: boolean;
  detail?: string;
  ms: number;
}

async function timed(label: string, fn: () => Promise<{ passed: boolean; detail?: string }>): Promise<StepResult> {
  const start = Date.now();
  try {
    const result = await fn();
    return { step: label, ...result, ms: Date.now() - start };
  } catch (e: any) {
    return { step: label, passed: false, detail: e.message, ms: Date.now() - start };
  }
}

export async function verifyCommand(opts: { json?: boolean; url?: string }) {
  const baseUrl = opts.url || process.env.BETTER_AUTH_URL || 'http://localhost:3000';
  const authUrl = `${baseUrl}/api/auth`;
  const email = `corral-verify-${Date.now()}@test.local`;
  const password = 'CorralVerify99!';
  const results: StepResult[] = [];
  let sessionCookie: string | null = null;

  if (!opts.json) console.log(chalk.bold(`\n🔍 Corral Verify — ${baseUrl}\n`));

  // 1. Health check
  results.push(await timed('GET /api/auth/ok', async () => {
    const res = await fetch(`${authUrl}/ok`);
    const body = await res.json();
    if (body.ok === true) return { passed: true };
    return { passed: false, detail: `status ${res.status}` };
  }));

  if (!results[0].passed) {
    if (!opts.json) {
      error(`Health check failed — is the server running at ${baseUrl}?`);
    }
    if (opts.json) jsonOutput({ results, passed: false }, true);
    return;
  }

  // 2. Sign up
  results.push(await timed('POST /api/auth/sign-up/email', async () => {
    const res = await fetch(`${authUrl}/sign-up/email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, name: 'Verify Bot' }),
    });
    const body = await res.json();
    if (body.user?.id) return { passed: true, detail: `userId=${body.user.id}` };
    return { passed: false, detail: JSON.stringify(body).slice(0, 150) };
  }));

  // 3. Sign in
  results.push(await timed('POST /api/auth/sign-in/email', async () => {
    const res = await fetch(`${authUrl}/sign-in/email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const body = await res.json();
    const cookie = res.headers.get('set-cookie');
    if (cookie) sessionCookie = cookie;
    if (body.token) return { passed: true };
    return { passed: false, detail: JSON.stringify(body).slice(0, 150) };
  }));

  // 4. Get session (authenticated)
  results.push(await timed('GET /api/auth/get-session (auth)', async () => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (sessionCookie) headers['Cookie'] = sessionCookie;
    const res = await fetch(`${authUrl}/get-session`, { headers });
    const body = await res.json();
    if (body?.user?.email === email) return { passed: true };
    return { passed: false, detail: 'Session user mismatch' };
  }));

  // 5. Sign out
  results.push(await timed('POST /api/auth/sign-out', async () => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (sessionCookie) headers['Cookie'] = sessionCookie;
    const res = await fetch(`${authUrl}/sign-out`, { method: 'POST', headers });
    if (res.ok) return { passed: true };
    return { passed: false, detail: `status ${res.status}` };
  }));

  // 6. Verify session gone
  results.push(await timed('GET /api/auth/get-session (post-signout)', async () => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (sessionCookie) headers['Cookie'] = sessionCookie;
    const res = await fetch(`${authUrl}/get-session`, { headers });
    const body = await res.text();
    if (body === 'null' || !JSON.parse(body)?.user) return { passed: true };
    return { passed: false, detail: 'Session still active' };
  }));

  // Summary
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  const totalMs = results.reduce((sum, r) => sum + r.ms, 0);

  if (opts.json) {
    jsonOutput({ results, passed, failed, totalMs }, true);
    return;
  }

  for (const r of results) {
    const icon = r.passed ? chalk.green('✓') : chalk.red('✗');
    const time = chalk.gray(`(${r.ms}ms)`);
    console.log(`  ${icon} ${r.step} ${time}${r.detail && !r.passed ? chalk.red(` — ${r.detail}`) : ''}`);
  }

  console.log('');
  if (failed === 0) {
    console.log(chalk.green.bold(`  ✅ All ${passed} checks passed (${totalMs}ms)\n`));
  } else {
    console.log(chalk.red.bold(`  ❌ ${failed} failed, ${passed} passed (${totalMs}ms)\n`));
  }
}
