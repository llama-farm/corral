/**
 * corral analyze
 *
 * Scans the current project and produces a human-readable (or --json) report
 * of the framework, tooling, pages, and what Corral would need to create.
 *
 * Designed to run BEFORE `corral init` so the user (or an AI agent) can see
 * exactly what will happen.
 *
 * Usage:
 *   corral analyze
 *   corral analyze --json
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import chalk from 'chalk';
import { jsonOutput } from '../util.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AnalysisResult {
  framework: string;
  router?: string;        // 'app router' | 'pages router' | undefined
  packageManager: string;
  typescript: boolean;
  existingAuth: string[];
  database: string[];
  styling: string[];
  pages: string[];
  apiRoutes: string[];
  layout: string | null;
  pythonBackend: string | null;
  recommendations: {
    create: string[];
    modify: string[];
    run: string;
  };
}

// ─── Recursive file glob (no external deps) ───────────────────────────────────

/**
 * Walk `dir` recursively and return all paths whose basename matches `test`.
 * Skips node_modules, .git, .corral, dist, .next, out directories.
 */
function walkFind(dir: string, test: (name: string, fullPath: string) => boolean, maxDepth = 8): string[] {
  const SKIP = new Set(['node_modules', '.git', '.corral', 'dist', '.next', 'out', '.turbo', 'build', '__pycache__', '.venv', 'venv']);
  const results: string[] = [];

  function walk(current: string, depth: number) {
    if (depth > maxDepth) return;
    let names: string[];
    try {
      names = readdirSync(current) as string[];
    } catch {
      return;
    }
    for (const name of names) {
      if (SKIP.has(name)) continue;
      const full = join(current, name);
      let isDir = false;
      let isFile = false;
      try {
        const st = statSync(full);
        isDir = st.isDirectory();
        isFile = st.isFile();
      } catch {
        continue;
      }
      if (isDir) {
        walk(full, depth + 1);
      } else if (isFile && test(name, full)) {
        results.push(full);
      }
    }
  }

  walk(dir, 0);
  return results;
}

/** Simple glob-style match: support `*` wildcard within a segment. */
function matchGlob(pattern: string, filePath: string): boolean {
  // Normalise separators
  const p = pattern.replace(/\\/g, '/');
  const f = filePath.replace(/\\/g, '/');
  // Convert glob to regex: ** = any path segments, * = one segment
  const re = new RegExp(
    '^' +
    p
      .split('**')
      .map(part =>
        part
          .split('*')
          .map(s => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
          .join('[^/]*'),
      )
      .join('.*') +
    '$',
  );
  return re.test(f);
}

/** Collect paths matching any of the given glob patterns under cwd. */
function globFiles(patterns: string[]): string[] {
  const cwd = process.cwd();
  const found: string[] = [];
  const seenDirs = new Set<string>();

  for (const pattern of patterns) {
    // Determine search root from the non-glob prefix
    const firstWild = pattern.indexOf('*');
    const prefix = firstWild === -1 ? pattern : pattern.slice(0, pattern.lastIndexOf('/', firstWild) + 1);
    const searchRoot = prefix ? join(cwd, prefix) : cwd;

    if (!existsSync(searchRoot)) continue;
    const key = searchRoot + '|' + pattern;
    if (seenDirs.has(key)) continue;
    seenDirs.add(key);

    const candidates = walkFind(searchRoot, (_name, full) => {
      const rel = full.replace(cwd + '/', '');
      return matchGlob(pattern, rel);
    });
    found.push(...candidates.map(f => f.replace(cwd + '/', '')));
  }

  return [...new Set(found)].sort();
}

// ─── Detection helpers ────────────────────────────────────────────────────────

function detectFramework(): { name: string; router?: string } {
  // Next.js
  for (const f of ['next.config.js', 'next.config.mjs', 'next.config.ts', 'next.config.cjs']) {
    if (existsSync(f)) {
      const router = existsSync('app') ? 'app router' : existsSync('pages') ? 'pages router' : undefined;
      // Try to detect Next.js version from package.json
      let version = '';
      try {
        const pkg = JSON.parse(readFileSync('package.json', 'utf-8'));
        const v = pkg.dependencies?.next || pkg.devDependencies?.next || '';
        const m = v.match(/(\d+)/);
        if (m) version = ` ${m[1]}`;
      } catch {}
      return { name: `Next.js${version}`, router };
    }
  }

  // Nuxt
  for (const f of ['nuxt.config.js', 'nuxt.config.ts', 'nuxt.config.mjs']) {
    if (existsSync(f)) return { name: 'Nuxt' };
  }

  // SvelteKit / Svelte
  for (const f of ['svelte.config.js', 'svelte.config.ts', 'svelte.config.cjs']) {
    if (existsSync(f)) return { name: 'SvelteKit / Svelte' };
  }

  // Remix
  for (const f of ['remix.config.js', 'remix.config.ts', 'remix.config.cjs']) {
    if (existsSync(f)) return { name: 'Remix' };
  }

  // Angular
  if (existsSync('angular.json')) return { name: 'Angular' };

  // Vite (React/Vue/etc)
  for (const f of ['vite.config.ts', 'vite.config.js', 'vite.config.mjs']) {
    if (existsSync(f)) {
      try {
        const content = readFileSync(f, 'utf-8');
        if (content.includes('@vitejs/plugin-vue') || content.includes("'vue'")) return { name: 'Vite (Vue)' };
        if (content.includes('@vitejs/plugin-react') || content.includes("'react'")) return { name: 'Vite (React)' };
      } catch {}
      return { name: 'Vite' };
    }
  }

  // Fallback: check package.json deps
  try {
    const pkg = JSON.parse(readFileSync('package.json', 'utf-8'));
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    if (deps['next']) return { name: 'Next.js', router: existsSync('app') ? 'app router' : 'pages router' };
    if (deps['nuxt'] || deps['nuxt3']) return { name: 'Nuxt' };
    if (deps['@sveltejs/kit']) return { name: 'SvelteKit' };
    if (deps['@remix-run/node']) return { name: 'Remix' };
    if (deps['react-scripts']) return { name: 'Create React App' };
    if (deps['react']) return { name: 'React (unknown bundler)' };
    if (deps['vue']) return { name: 'Vue' };
  } catch {}

  return { name: 'Unknown' };
}

function detectPackageManager(): string {
  if (existsSync('pnpm-lock.yaml') || existsSync('pnpm-workspace.yaml')) return 'pnpm';
  if (existsSync('bun.lockb')) return 'bun';
  if (existsSync('yarn.lock')) return 'yarn';
  if (existsSync('package-lock.json')) return 'npm';
  // No lock file — check for package.json packageManager field
  try {
    const pkg = JSON.parse(readFileSync('package.json', 'utf-8'));
    if (pkg.packageManager) {
      const pm = pkg.packageManager.split('@')[0];
      return pm;
    }
  } catch {}
  return 'npm (assumed)';
}

function detectExistingAuth(deps: Record<string, string>): string[] {
  const found: string[] = [];
  const checks: [string, string][] = [
    ['next-auth', 'NextAuth.js'],
    ['@auth/core', 'Auth.js'],
    ['@clerk/nextjs', 'Clerk (Next.js)'],
    ['@clerk/clerk-react', 'Clerk (React)'],
    ['@auth0/nextjs-auth0', 'Auth0 (Next.js)'],
    ['@auth0/auth0-react', 'Auth0 (React)'],
    ['better-auth', 'better-auth'],
    ['passport', 'Passport.js'],
    ['lucia', 'Lucia'],
    ['iron-session', 'iron-session'],
    ['@supabase/supabase-js', 'Supabase'],
    ['firebase', 'Firebase (Auth)'],
  ];
  for (const [pkg, label] of checks) {
    if (deps[pkg]) found.push(label);
  }
  return found;
}

function detectDatabase(deps: Record<string, string>): string[] {
  const found: string[] = [];
  if (existsSync('prisma') || deps['@prisma/client']) found.push('Prisma');
  for (const f of ['drizzle.config.ts', 'drizzle.config.js', 'drizzle.config.mjs']) {
    if (existsSync(f)) { found.push('Drizzle ORM'); break; }
  }
  if (deps['better-sqlite3']) found.push('better-sqlite3 (SQLite)');
  if (deps['pg'] || deps['postgres']) found.push('PostgreSQL (pg)');
  if (deps['mysql2']) found.push('MySQL (mysql2)');
  if (deps['@libsql/client']) found.push('Turso / libSQL');
  if (deps['mongoose'] || deps['mongodb']) found.push('MongoDB');
  if (deps['@supabase/supabase-js'] && !found.includes('Supabase')) found.push('Supabase (DB)');
  return found;
}

function detectStyling(deps: Record<string, string>): string[] {
  const found: string[] = [];
  for (const f of ['tailwind.config.js', 'tailwind.config.ts', 'tailwind.config.mjs', 'tailwind.config.cjs']) {
    if (existsSync(f)) { found.push('Tailwind CSS'); break; }
  }
  if (deps['styled-components']) found.push('styled-components');
  if (deps['@emotion/react'] || deps['@emotion/styled']) found.push('@emotion');
  if (deps['sass'] || deps['node-sass']) found.push('Sass/SCSS');
  if (deps['@mui/material'] || deps['@material-ui/core']) found.push('Material UI');
  if (deps['@chakra-ui/react']) found.push('Chakra UI');
  if (deps['@radix-ui/themes']) found.push('Radix UI');
  return found;
}

function detectPythonBackend(): string | null {
  if (existsSync('manage.py')) return 'Django';

  const hasPyProject = existsSync('pyproject.toml');
  const hasRequirements = existsSync('requirements.txt');
  if (!hasPyProject && !hasRequirements && !existsSync('main.py') && !existsSync('app.py')) return null;

  const pyContent = [
    hasPyProject ? readFileSync('pyproject.toml', 'utf-8') : '',
    hasRequirements ? readFileSync('requirements.txt', 'utf-8') : '',
    existsSync('main.py') ? readFileSync('main.py', 'utf-8') : '',
    existsSync('app.py') ? readFileSync('app.py', 'utf-8') : '',
  ].join('\n').toLowerCase();

  if (pyContent.includes('fastapi')) return 'FastAPI';
  if (pyContent.includes('flask')) return 'Flask';
  if (pyContent.includes('django')) return 'Django';
  if (hasPyProject || hasRequirements) return 'Python (unknown framework)';
  return null;
}

function buildRecommendations(result: Omit<AnalysisResult, 'recommendations'>): AnalysisResult['recommendations'] {
  const create: string[] = [];
  const modify: string[] = [];

  const isNextAppRouter = result.framework.startsWith('Next') && result.router === 'app router';
  const isNextPagesRouter = result.framework.startsWith('Next') && result.router === 'pages router';

  // Always need corral.yaml + .env
  if (!existsSync('corral.yaml')) create.push('corral.yaml');
  if (!existsSync('.env') && !existsSync('.env.local')) create.push('.env');

  if (isNextAppRouter || isNextPagesRouter) {
    if (!existsSync('lib/corral.ts') && !existsSync('src/lib/corral.ts')) {
      create.push('lib/corral.ts');
    }
    const routeExists =
      existsSync('app/api/auth/[...all]/route.ts') ||
      existsSync('src/app/api/auth/[...all]/route.ts') ||
      existsSync('pages/api/auth/[...all].ts');
    if (!routeExists) {
      create.push(isNextPagesRouter ? 'pages/api/auth/[...all].ts' : 'app/api/auth/[...all]/route.ts');
    }
    // Layout patch
    if (result.layout && !modify.includes(result.layout)) {
      modify.push(`${result.layout} (add CorralProvider)`);
    }
  } else if (result.pythonBackend) {
    create.push('server/corral.ts', 'server/auth.ts (Node.js auth server)', 'middleware/corral.py');
  } else {
    // SPA / other
    if (!existsSync('server/corral.ts')) create.push('server/corral.ts', 'server/auth.ts');
    if (!existsSync('src/auth-context.tsx') && !existsSync('auth-context.tsx')) {
      create.push('src/auth-context.tsx');
    }
  }

  if (!existsSync('CORRAL.md')) create.push('CORRAL.md');

  return { create, modify, run: 'corral init' };
}

// ─── Main command ─────────────────────────────────────────────────────────────

export async function analyzeCommand(opts: { json?: boolean } = {}) {
  console.log(chalk.bold('\n📋 Project Analysis\n'));

  // Load package.json deps
  let deps: Record<string, string> = {};
  try {
    const pkg = JSON.parse(readFileSync('package.json', 'utf-8'));
    deps = { ...pkg.dependencies, ...pkg.devDependencies };
  } catch {
    // no package.json — might be a Python project
  }

  // Detect all dimensions
  const fw = detectFramework();
  const packageManager = detectPackageManager();
  const typescript = existsSync('tsconfig.json');
  const existingAuth = detectExistingAuth(deps);
  const database = detectDatabase(deps);
  const styling = detectStyling(deps);
  const pythonBackend = detectPythonBackend();

  // Pages discovery
  const pagePaths = fw.router === 'pages router'
    ? ['src/pages/**/*.tsx', 'src/pages/**/*.jsx', 'pages/**/*.tsx', 'pages/**/*.jsx']
    : ['app/**/page.tsx', 'app/**/page.jsx', 'src/app/**/page.tsx'];
  const pages = globFiles(pagePaths);

  // API routes discovery
  const apiRoutePaths = fw.router === 'pages router' || fw.name.includes('pages')
    ? ['pages/api/**/*.ts', 'pages/api/**/*.js']
    : ['app/api/**/route.ts', 'app/api/**/route.js', 'src/app/api/**/route.ts'];
  const apiRoutes = globFiles(apiRoutePaths);

  // Layout detection
  let layout: string | null = null;
  for (const candidate of [
    'app/layout.tsx', 'app/layout.jsx', 'src/app/layout.tsx',
    'src/App.tsx', 'src/App.jsx', 'src/main.tsx', 'src/main.jsx',
  ]) {
    if (existsSync(candidate)) { layout = candidate; break; }
  }

  const partial: Omit<AnalysisResult, 'recommendations'> = {
    framework: fw.router ? `${fw.name} (${fw.router})` : fw.name,
    router: fw.router,
    packageManager,
    typescript,
    existingAuth,
    database,
    styling,
    pages,
    apiRoutes,
    layout,
    pythonBackend,
  };

  const recommendations = buildRecommendations(partial);
  const result: AnalysisResult = { ...partial, recommendations };

  if (jsonOutput(result, !!opts.json)) return;

  // ─── Human-friendly output ─────────────────────────────────────────

  const pad = (label: string) => label.padEnd(14);
  const line = (label: string, value: string) =>
    console.log(`  ${chalk.dim(pad(label))} ${value}`);

  line('Framework:', chalk.cyan(result.framework));
  line('Package Mgr:', chalk.cyan(packageManager));
  line('TypeScript:', typescript ? chalk.green('Yes (tsconfig.json found)') : chalk.yellow('No'));

  line(
    'Existing Auth:',
    existingAuth.length > 0
      ? chalk.yellow(existingAuth.join(', '))
      : chalk.dim('None detected'),
  );

  line(
    'Database:',
    database.length > 0
      ? chalk.cyan(database.join(', '))
      : chalk.dim('None detected'),
  );

  line(
    'Styling:',
    styling.length > 0
      ? chalk.cyan(styling.join(', '))
      : chalk.dim('None detected'),
  );

  if (pythonBackend) {
    line('Python backend:', chalk.cyan(pythonBackend));
  }

  console.log('');

  if (pages.length > 0) {
    line('Pages found:', chalk.white(pages.slice(0, 5).join(', ') + (pages.length > 5 ? `, +${pages.length - 5} more` : '')));
  } else {
    line('Pages found:', chalk.dim('None detected'));
  }

  if (apiRoutes.length > 0) {
    line('API routes:', chalk.white(apiRoutes.slice(0, 5).join(', ') + (apiRoutes.length > 5 ? `, +${apiRoutes.length - 5} more` : '')));
  } else {
    line('API routes:', chalk.dim('None detected'));
  }

  line('Layout:', layout ? chalk.white(layout) : chalk.dim('None detected'));

  // ─── Recommendations ───────────────────────────────────────────────

  console.log('');
  console.log(chalk.bold('  Recommendation:'));
  if (recommendations.create.length > 0) {
    console.log(`    ${chalk.dim('Create:')}  ${recommendations.create.join(', ')}`);
  }
  if (recommendations.modify.length > 0) {
    console.log(`    ${chalk.dim('Modify:')}  ${recommendations.modify.join(', ')}`);
  }
  console.log('');
  console.log(`  Run: ${chalk.cyan.bold(recommendations.run)}`);

  if (existingAuth.length > 0) {
    console.log('');
    console.log(chalk.yellow(`  ⚠  Existing auth detected (${existingAuth.join(', ')})`));
    console.log(chalk.yellow('     Corral can coexist — but review lib/corral.ts after init.'));
  }

  console.log('');
}
