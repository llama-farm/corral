import { existsSync, readFileSync } from 'fs';
import chalk from 'chalk';
import { success, error, info, warn, jsonOutput } from '../util.js';
import { loadConfig } from '../config.js';

interface Check {
  name: string;
  status: 'pass' | 'warn' | 'fail' | 'suggestion';
  detail?: string;
}

export async function doctorCommand(opts: { json?: boolean; config: string; url?: string }) {
  const checks: Check[] = [];
  const baseUrl = opts.url || process.env.BETTER_AUTH_URL || 'http://localhost:3000';

  console.log(chalk.bold(`\n🩺 Corral Doctor — Pre-flight checks\n`));

  // ─── 1. Config file exists ──────────────────────────────────────────
  if (existsSync(opts.config)) {
    checks.push({ name: 'Config file exists', status: 'pass', detail: opts.config });
    success(`${opts.config} found`);
  } else {
    checks.push({ name: 'Config file exists', status: 'fail', detail: `${opts.config} not found. Run: corral init` });
    error(`${opts.config} not found — run: corral init`);
  }

  // Load config for subsequent checks (safe — returns null if missing/invalid)
  let config: ReturnType<typeof loadConfig> | null = null;
  try { config = loadConfig(opts.config); } catch { /* config stays null */ }

  // ─── 2. Environment variables ───────────────────────────────────────
  // Check .env file
  const envContent = existsSync('.env') ? readFileSync('.env', 'utf-8') : '';
  const envLocalContent = existsSync('.env.local') ? readFileSync('.env.local', 'utf-8') : '';
  const allEnv = envContent + envLocalContent;

  if (allEnv.includes('BETTER_AUTH_SECRET') || process.env.BETTER_AUTH_SECRET) {
    checks.push({ name: 'BETTER_AUTH_SECRET set', status: 'pass' });
    success('BETTER_AUTH_SECRET ✓');
  } else {
    checks.push({ name: 'BETTER_AUTH_SECRET set', status: 'fail', detail: 'Required. Run: openssl rand -base64 32' });
    error('BETTER_AUTH_SECRET missing — generate: openssl rand -base64 32');
  }

  if (allEnv.includes('BETTER_AUTH_URL') || process.env.BETTER_AUTH_URL) {
    checks.push({ name: 'BETTER_AUTH_URL set', status: 'pass' });
    success('BETTER_AUTH_URL ✓');
  } else {
    checks.push({ name: 'BETTER_AUTH_URL set', status: 'warn', detail: 'Callbacks and redirects may not work' });
    warn('BETTER_AUTH_URL not set — callbacks/redirects may not work');
  }

  // ─── 3. Database driver installed ───────────────────────────────────
  const pkg = existsSync('package.json') ? JSON.parse(readFileSync('package.json', 'utf-8')) : { dependencies: {} };
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };

  const hasDriver = deps['better-sqlite3'] || deps['pg'] || deps['mysql2'];
  if (hasDriver) {
    const driver = deps['better-sqlite3'] ? 'better-sqlite3' : deps['pg'] ? 'pg' : 'mysql2';
    checks.push({ name: 'Database driver installed', status: 'pass', detail: driver });
    success(`Database driver: ${driver} ✓`);
  } else {
    checks.push({ name: 'Database driver installed', status: 'fail', detail: 'Install: npm install better-sqlite3 (or pg, mysql2)' });
    error('No database driver — install: npm install better-sqlite3');
  }

  // Types
  if (deps['better-sqlite3'] && !deps['@types/better-sqlite3']) {
    checks.push({ name: 'SQLite type declarations', status: 'warn', detail: 'npm install -D @types/better-sqlite3' });
    warn('Missing @types/better-sqlite3 — production build will fail');
  }

  // ─── 4. Route handler exists ────────────────────────────────────────
  const routePaths = [
    'app/api/auth/[...all]/route.ts',    // Next.js
    'app/api/auth/[...all]/route.js',
    'app/api/auth/[...corral]/route.ts',
    'src/app/api/auth/[...all]/route.ts',
    'server/auth.ts',                     // SPA standalone
    'src/auth.ts',                        // Hono / Express standalone
    'server/auth.js',
  ];
  const foundRoute = routePaths.find(p => existsSync(p));
  if (foundRoute) {
    const isSPA = foundRoute.startsWith('server/');
    checks.push({ name: 'Auth route handler', status: 'pass', detail: `${foundRoute}${isSPA ? ' (standalone)' : ''}` });
    success(`Route handler: ${foundRoute} ✓${isSPA ? ' (SPA standalone server)' : ''}`);
  } else {
    checks.push({ name: 'Auth route handler', status: 'fail', detail: 'Expected: app/api/auth/[...all]/route.ts or server/auth.ts' });
    error('No auth route handler — run: corral init');
  }

  // ─── 5. lib/corral.ts exists ────────────────────────────────────────
  const setupPaths = ['lib/corral.ts', 'src/lib/corral.ts', 'lib/auth.ts', 'src/lib/auth.ts', 'server/corral.ts'];
  const foundSetup = setupPaths.find(p => existsSync(p));
  if (foundSetup) {
    checks.push({ name: 'Auth setup file', status: 'pass', detail: foundSetup });
    success(`Auth setup: ${foundSetup} ✓`);
  } else {
    checks.push({ name: 'Auth setup file', status: 'warn', detail: 'Expected: lib/corral.ts' });
    warn('No lib/corral.ts found');
  }

  // ─── 6. Next.js rewrite conflict ───────────────────────────────────
  for (const configFile of ['next.config.js', 'next.config.mjs', 'next.config.ts']) {
    if (!existsSync(configFile)) continue;
    const content = readFileSync(configFile, 'utf-8');
    if (content.includes('rewrites') && 
        (content.includes("'/api/:path*'") || content.includes('"/api/:path*"')) &&
        !content.includes('(?!auth)')) {
      checks.push({ 
        name: 'Next.js rewrite conflict', 
        status: 'fail', 
        detail: `${configFile} proxies /api/* which will intercept /api/auth/*. Exclude with: '/api/:path((?!auth).*)'` 
      });
      error(`⚠️  ${configFile} has rewrite conflict — /api/auth/* will be proxied!`);
    }
  }

  // ─── 6b. Next.js .env.local placement ────────────────────────────────
  // LEARNING: In monorepos, Next.js only reads .env.local from its own directory
  const hasNext = existsSync('package.json') && deps['next'];
  if (hasNext) {
    const hasEnvLocal = existsSync('.env.local');
    const envLocalContent2 = hasEnvLocal ? readFileSync('.env.local', 'utf-8') : '';
    if (hasEnvLocal && envLocalContent2.includes('BETTER_AUTH_SECRET')) {
      checks.push({ name: '.env.local has auth vars', status: 'pass' });
      success('.env.local has BETTER_AUTH_SECRET ✓');
    } else if (!hasEnvLocal && allEnv.includes('BETTER_AUTH_SECRET')) {
      // Vars in .env but not .env.local — Next.js may not read them
      checks.push({ 
        name: '.env.local has auth vars', 
        status: 'warn', 
        detail: 'BETTER_AUTH_SECRET is in .env but not .env.local. Next.js reads .env.local first. Copy vars to .env.local.' 
      });
      warn('BETTER_AUTH_SECRET in .env but not .env.local — Next.js may not read it');
    }
  }

  // ─── 6c. Route handler has try/catch wrapping ──────────────────────
  if (foundRoute) {
    const routeContent = readFileSync(foundRoute, 'utf-8');
    if (routeContent.includes('try') && routeContent.includes('catch')) {
      checks.push({ name: 'Route handler has error wrapping', status: 'pass' });
      success('Route handler has try/catch ✓');
    } else {
      checks.push({ 
        name: 'Route handler has error wrapping', 
        status: 'warn', 
        detail: 'Route handler missing try/catch — unhandled rejections will crash Next.js dev server. Re-run corral init or wrap manually.' 
      });
      warn('Route handler missing try/catch — dev server may crash on auth errors');
    }
  }

  // ─── 6d. DB adapter format check ───────────────────────────────────
  // LEARNING #1: { db, type } format causes "selectFrom is not a function"
  if (foundSetup) {
    const setupContent = readFileSync(foundSetup, 'utf-8');
    // Strip comments before checking — comments with examples can cause false positives
    const setupNoComments = setupContent.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
    // Turso and D1 correctly use { db, type: "sqlite" } — only flag for plain SQLite
    const dbAdapter = config?.database?.adapter || 'sqlite';
    const tursoOrD1 = dbAdapter === 'turso' || dbAdapter === 'd1';
    if (!tursoOrD1 && (setupNoComments.includes('type: "sqlite"') || setupNoComments.includes("type: 'sqlite'"))) {
      checks.push({
        name: 'Database adapter format',
        status: 'fail',
        detail: 'Using { db, type: "sqlite" } format — this causes "selectFrom is not a function". Pass raw Database instance: betterAuth({ database: db })'
      });
      error('DB adapter uses { db, type } format — will crash. Pass raw Database instance instead.');
    } else if (setupContent.includes('database:')) {
      checks.push({ name: 'Database adapter format', status: 'pass' });
      success('Database adapter format ✓');
    }
  }

  // ─── 6e. Express route wildcard check ─────────────────────────────
  // Express 4 uses /*, Express 5 uses /*splat — template auto-detects
  if (foundRoute && (foundRoute.startsWith('server/') || foundRoute.includes('express'))) {
    const routeContent = readFileSync(foundRoute, 'utf-8');
    const expressVersion = deps['express'] ? parseInt(deps['express'].replace(/[^0-9]/g, '')[0] || '4') : 4;
    if (expressVersion >= 5 && routeContent.includes('"/api/auth/*"') && !routeContent.includes('/*splat') && !routeContent.includes('try')) {
      checks.push({
        name: 'Express route wildcard',
        status: 'warn',
        detail: 'Express 5 requires named wildcards (*splat). Update route or re-run corral init.'
      });
      warn('Express 5 detected — route may need /*splat instead of /*');
    } else if (expressVersion < 5 && routeContent.includes('/*splat') && !routeContent.includes('try')) {
      checks.push({
        name: 'Express route wildcard',
        status: 'warn',
        detail: 'Express 4 uses bare wildcard (*). Remove "splat" from route.'
      });
      warn('Express 4 detected — route uses /*splat (needs /*)');
    }
  }

  // ─── 6f. trustedOrigins check ─────────────────────────────────────
  // LEARNING #5: Sign-out breaks without trustedOrigins
  if (foundSetup) {
    const setupContent = readFileSync(foundSetup, 'utf-8');
    if (setupContent.includes('trustedOrigins')) {
      checks.push({ name: 'trustedOrigins configured', status: 'pass' });
      success('trustedOrigins configured ✓');
    } else {
      checks.push({
        name: 'trustedOrigins configured',
        status: 'warn',
        detail: 'Missing trustedOrigins in auth config — sign-out will fail with MISSING_OR_NULL_ORIGIN error'
      });
      warn('trustedOrigins not set — sign-out will break');
    }
  }

  // ─── 6g. Host binding check ───────────────────────────────────────
  // LEARNING #7: Default may bind IPv6 only
  if (foundRoute && foundRoute.startsWith('server/')) {
    const routeContent = readFileSync(foundRoute, 'utf-8');
    if (routeContent.includes('.listen(') && !routeContent.includes('0.0.0.0')) {
      checks.push({
        name: 'Server binds to 0.0.0.0',
        status: 'warn',
        detail: 'Server may only bind to IPv6. Add "0.0.0.0" as host parameter to .listen()'
      });
      warn('Server may not bind to 0.0.0.0 — could be IPv6-only');
    }
  }

  // ─── 6h. Vite proxy check for SPA ────────────────────────────────
  // LEARNING #6: SPA needs /api proxy for same-origin cookies
  const isSPA = foundRoute?.startsWith('server/');
  if (isSPA) {
    let hasProxy = false;
    for (const vf of ['vite.config.ts', 'vite.config.js', 'vite.config.mjs']) {
      if (!existsSync(vf)) continue;
      const vc = readFileSync(vf, 'utf-8');
      if (vc.includes('proxy') && (vc.includes('/api') || vc.includes('/api/auth'))) {
        hasProxy = true;
      }
    }
    if (hasProxy) {
      checks.push({ name: 'Vite proxy configured', status: 'pass' });
      success('Vite proxy for /api ✓');
    } else if (existsSync('vite.config.ts') || existsSync('vite.config.js')) {
      checks.push({
        name: 'Vite proxy configured',
        status: 'fail',
        detail: 'SPA needs /api proxy in vite.config.ts for cookie auth to work. Run: corral init (will auto-patch)'
      });
      error('Vite config missing /api proxy — cookies won\'t work cross-origin');
    }
  }

  // ─── 6i. Frontend auth files check ────────────────────────────────
  if (isSPA) {
    const authCtxPaths = ['src/auth-context.tsx', 'auth-context.tsx', 'src/lib/auth-context.tsx'];
    const hasAuthCtx = authCtxPaths.some(p => existsSync(p));
    if (hasAuthCtx) {
      checks.push({ name: 'Auth context (React)', status: 'pass' });
      success('Auth context component ✓');
    } else {
      checks.push({ name: 'Auth context (React)', status: 'suggestion', detail: 'Run corral init to generate auth-context.tsx with useAuth() hook' });
      info('No auth-context.tsx — run corral init to generate');
    }
  }

  // ─── 7. .gitignore covers secrets ──────────────────────────────────
  const gitignore = existsSync('.gitignore') ? readFileSync('.gitignore', 'utf-8') : '';
  if (gitignore.includes('.env')) {
    checks.push({ name: '.env in .gitignore', status: 'pass' });
    success('.env in .gitignore ✓');
  } else {
    checks.push({ name: '.env in .gitignore', status: 'warn', detail: 'Secrets may be committed' });
    warn('.env not in .gitignore — secrets may leak');
  }

  // ─── 8. Stripe keys (optional) ─────────────────────────────────────
  if (allEnv.includes('STRIPE_SECRET_KEY') || process.env.STRIPE_SECRET_KEY) {
    const isTest = allEnv.includes('sk_test_') || process.env.STRIPE_SECRET_KEY?.startsWith('sk_test_');
    checks.push({ name: 'Stripe keys', status: 'pass', detail: isTest ? 'test mode' : 'live mode' });
    success(`Stripe keys: ${isTest ? 'test mode' : 'LIVE mode'} ✓`);
    if (!isTest) warn('  ⚠️  Using LIVE Stripe keys!');
  } else {
    checks.push({ name: 'Stripe keys', status: 'suggestion', detail: 'Add STRIPE_SECRET_KEY for billing' });
    info('No Stripe keys — billing features disabled');
  }

  // ─── 9. Auth server reachable ──────────────────────────────────────
  try {
    const res = await fetch(`${baseUrl}/api/auth/ok`, { signal: AbortSignal.timeout(5000) });
    const body = await res.json();
    if (body.ok) {
      checks.push({ name: 'Auth server reachable', status: 'pass', detail: baseUrl });
      success(`Auth server reachable at ${baseUrl} ✓`);
    } else {
      checks.push({ name: 'Auth server reachable', status: 'fail', detail: `Unexpected: ${JSON.stringify(body)}` });
      error(`Auth server returned unexpected response`);
    }
  } catch (e: any) {
    checks.push({ name: 'Auth server reachable', status: 'warn', detail: `Not running: ${e.message}` });
    info(`Auth server not reachable at ${baseUrl} (not running?)`);
  }

  // ─── 10. CORRAL.md exists ──────────────────────────────────────────
  if (existsSync('CORRAL.md')) {
    checks.push({ name: 'CORRAL.md (agent discovery)', status: 'pass' });
    success('CORRAL.md ✓');
  } else {
    checks.push({ name: 'CORRAL.md (agent discovery)', status: 'suggestion', detail: 'Run corral init to generate' });
    info('No CORRAL.md — agents won\'t auto-discover Corral config');
  }

  // ─── Summary ────────────────────────────────────────────────────────
  const passed = checks.filter(c => c.status === 'pass').length;
  const warnings = checks.filter(c => c.status === 'warn').length;
  const failed = checks.filter(c => c.status === 'fail').length;
  const suggestions = checks.filter(c => c.status === 'suggestion').length;

  console.log('');
  console.log(chalk.bold('─'.repeat(50)));
  if (failed === 0) {
    console.log(chalk.green.bold(`\n  ✅ ${passed} passed, ${warnings} warnings\n`));
  } else {
    console.log(chalk.red.bold(`\n  ❌ ${failed} failed, ${passed} passed, ${warnings} warnings\n`));
  }
  if (suggestions > 0) {
    console.log(chalk.dim(`  💡 ${suggestions} suggestion(s) — run with --json for details\n`));
  }

  if (jsonOutput({ checks, summary: { passed, warnings, failed, suggestions } }, !!opts.json)) return;
}
