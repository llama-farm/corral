import { readFileSync, writeFileSync, existsSync, mkdirSync, appendFileSync, readdirSync } from 'fs';
import { join, dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import { randomBytes } from 'crypto';
import chalk from 'chalk';
import { success, info, warn, jsonOutput } from '../util.js';
import { writeProjectLlmsTxt } from './serve-llms.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadTemplate(name: string): string {
  const paths = [
    join(__dirname, '..', 'src', 'templates', name),
    join(__dirname, 'templates', name),
    join(__dirname, '..', 'templates', name),
  ];
  for (const p of paths) {
    if (existsSync(p)) return readFileSync(p, 'utf-8');
  }
  throw new Error(`Template not found: ${name}`);
}

interface Framework {
  name: 'nextjs' | 'vite-react' | 'cra' | 'hono' | 'express' | 'fastapi' | 'django' | 'flask' | 'unknown';
  port: number;
  hasRewrites: boolean;
  hasProxy: boolean;
  isSPA: boolean;     // client-only — needs separate auth server
  isPython: boolean;  // Python backend — needs middleware + separate auth server
  serverFramework?: string; // for SPAs: which server to scaffold
}

function detectFramework(): Framework {
  try {
    const pkg = JSON.parse(readFileSync('package.json', 'utf-8'));
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };

    // Detect port from scripts
    let port = 3000;
    const devScript = pkg.scripts?.dev || '';
    const portMatch = devScript.match(/-p\s+(\d+)|--port\s+(\d+)|PORT=(\d+)/);
    if (portMatch) port = parseInt(portMatch[1] || portMatch[2] || portMatch[3]);

    // Detect Next.js rewrites (LEARNING #2)
    let hasRewrites = false;
    for (const configFile of ['next.config.js', 'next.config.mjs', 'next.config.ts']) {
      if (existsSync(configFile)) {
        const content = readFileSync(configFile, 'utf-8');
        if (content.includes('rewrites')) hasRewrites = true;
      }
    }

    // Detect Vite proxy config
    let hasProxy = false;
    for (const configFile of ['vite.config.ts', 'vite.config.js', 'vite.config.mjs']) {
      if (existsSync(configFile)) {
        const content = readFileSync(configFile, 'utf-8');
        if (content.includes('proxy') && content.includes('/api')) hasProxy = true;
      }
    }

    // Full-stack frameworks (have their own server)
    if (deps['next']) return { name: 'nextjs', port, hasRewrites, hasProxy: false, isSPA: false, isPython: false };
    
    // Server frameworks (standalone)
    if (deps['hono'] && !deps['react']) return { name: 'hono', port, hasRewrites: false, hasProxy: false, isSPA: false, isPython: false };
    if (deps['express'] && !deps['react']) return { name: 'express', port, hasRewrites: false, hasProxy: false, isSPA: false, isPython: false };

    // SPA frameworks (client-only — need a separate auth server)
    if (deps['vite'] && deps['react']) return { name: 'vite-react', port: port || 5173, hasRewrites: false, hasProxy, isSPA: true, isPython: false };
    if (deps['react-scripts']) return { name: 'cra', port: port || 3000, hasRewrites: false, hasProxy: false, isSPA: true, isPython: false };

    // React + Hono/Express = full-stack SPA with API server
    if (deps['react'] && deps['hono']) return { name: 'hono', port, hasRewrites: false, hasProxy, isSPA: false, isPython: false };
    if (deps['react'] && deps['express']) return { name: 'express', port, hasRewrites: false, hasProxy, isSPA: false, isPython: false };

    // Plain React with no server framework detected
    if (deps['react']) return { name: 'vite-react', port: 5173, hasRewrites: false, hasProxy, isSPA: true, isPython: false };

  } catch {}

  // ─── Python framework detection ────────────────────────────────
  // Check for pyproject.toml or requirements.txt
  const hasPyProject = existsSync('pyproject.toml');
  const hasRequirements = existsSync('requirements.txt');

  if (hasPyProject || hasRequirements) {
    const pyContent = hasPyProject ? readFileSync('pyproject.toml', 'utf-8') : '';
    const reqContent = hasRequirements ? readFileSync('requirements.txt', 'utf-8') : '';
    const allPy = pyContent + reqContent;

    // Detect Python port from common patterns
    let pyPort = 8000;
    for (const pyFile of ['main.py', 'app.py', 'src/main.py', 'src/api/main.py']) {
      if (existsSync(pyFile)) {
        const content = readFileSync(pyFile, 'utf-8');
        const portMatch = content.match(/port\s*=\s*(\d+)/);
        if (portMatch) pyPort = parseInt(portMatch[1]);
      }
    }

    if (allPy.includes('fastapi') || allPy.includes('FastAPI')) {
      return { name: 'fastapi', port: pyPort, hasRewrites: false, hasProxy: false, isSPA: false, isPython: true };
    }
    if (allPy.includes('django') || allPy.includes('Django')) {
      return { name: 'django', port: pyPort, hasRewrites: false, hasProxy: false, isSPA: false, isPython: true };
    }
    if (allPy.includes('flask') || allPy.includes('Flask')) {
      return { name: 'flask', port: pyPort, hasRewrites: false, hasProxy: false, isSPA: false, isPython: true };
    }

    // Generic Python project
    return { name: 'fastapi', port: pyPort, hasRewrites: false, hasProxy: false, isSPA: false, isPython: true };
  }

  return { name: 'unknown', port: 3000, hasRewrites: false, hasProxy: false, isSPA: false, isPython: false };
}

// ─── Monorepo: Detect Existing Server Workspace ────────────────────
// When init runs from a frontend workspace (e.g. frontend/ or apps/web/),
// check if there's already a sibling server workspace with Express/Hono/Fastify.
// If found, we'll install into that server instead of scaffolding a new one.

interface ExistingServer {
  path: string;          // relative path from cwd (e.g. "../server")
  absPath: string;       // absolute resolved path
  framework: 'express' | 'hono' | 'fastify';
  entryFile: string;     // e.g. "../server/src/index.ts"
  srcDir: string;        // e.g. "../server/src"
}

function detectExistingServer(): ExistingServer | null {
  const SERVER_ENTRIES = ['src/index.ts', 'src/app.ts', 'src/server.ts', 'index.ts', 'src/main.ts'];

  function checkWorkspace(relPath: string): ExistingServer | null {
    const pkgPath = join(relPath, 'package.json');
    if (!existsSync(pkgPath)) return null;
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
      const deps = { ...pkg.dependencies, ...pkg.devDependencies };
      const framework = deps['express'] ? 'express' : deps['hono'] ? 'hono' : deps['fastify'] ? 'fastify' : null;
      if (!framework) return null;
      for (const entry of SERVER_ENTRIES) {
        const entryPath = join(relPath, entry);
        if (existsSync(entryPath)) {
          const srcDir = join(relPath, entry.includes('src/') ? 'src' : '.');
          return {
            path: relPath,
            absPath: resolve(relPath),
            framework: framework as ExistingServer['framework'],
            entryFile: entryPath,
            srcDir,
          };
        }
      }
      // No entry file found but server framework detected — use src/ as default
      const srcDir = existsSync(join(relPath, 'src')) ? join(relPath, 'src') : relPath;
      return {
        path: relPath,
        absPath: resolve(relPath),
        framework: framework as ExistingServer['framework'],
        entryFile: join(srcDir, 'index.ts'),
        srcDir,
      };
    } catch {
      return null;
    }
  }

  // 1. Check parent package.json for workspaces array
  if (existsSync('../package.json')) {
    try {
      const parentPkg = JSON.parse(readFileSync('../package.json', 'utf-8'));
      const workspaces: string[] = Array.isArray(parentPkg.workspaces)
        ? parentPkg.workspaces
        : Array.isArray(parentPkg.workspaces?.packages)
        ? parentPkg.workspaces.packages
        : [];

      // Expand globs: handle "apps/*", "packages/*" patterns
      for (const ws of workspaces) {
        if (ws.includes('*')) {
          // Glob: list dirs in the parent pattern dir
          const base = ws.replace(/\/\*.*$/, '');
          const baseDir = join('..', base);
          if (existsSync(baseDir)) {
            try {
              for (const entry of readdirSync(baseDir)) {
                const candidate = join('..', base, entry);
                const found = checkWorkspace(candidate);
                if (found) return found;
              }
            } catch {}
          }
        } else {
          const found = checkWorkspace(join('..', ws));
          if (found) return found;
        }
      }
    } catch {}
  }

  // 2. Fallback: check common sibling directory names
  for (const name of ['server', 'api', 'backend', 'apps/server', 'apps/api', 'packages/server']) {
    const relPath = join('..', name);
    const found = checkWorkspace(relPath);
    if (found) return found;
  }

  return null;
}

// ─── Vite Proxy Port Detection ─────────────────────────────────────
// Read actual server port from existing vite proxy config, env, or package.json.
function getViteProxyServerPort(fallback: number): number {
  // 1. Check existing vite.config for proxy target port
  for (const configFile of ['vite.config.ts', 'vite.config.js', 'vite.config.mjs']) {
    if (!existsSync(configFile)) continue;
    const content = readFileSync(configFile, 'utf-8');
    // Match: target: 'http://localhost:3001' or target: "http://localhost:3001"
    const portMatch = content.match(/target\s*:\s*['"]https?:\/\/(?:localhost|127\.0\.0\.1):(\d+)['"]/);
    if (portMatch) return parseInt(portMatch[1]);
  }

  // 2. Check .env for SERVER_PORT / API_PORT / BACKEND_PORT
  for (const envFile of ['.env', '.env.local', '.env.development']) {
    if (!existsSync(envFile)) continue;
    const content = readFileSync(envFile, 'utf-8');
    const portMatch = content.match(/(?:SERVER_PORT|API_PORT|BACKEND_PORT|CORRAL_PORT)\s*=\s*(\d+)/);
    if (portMatch) return parseInt(portMatch[1]);
  }

  // 3. Check sibling server package.json scripts for PORT= env
  for (const serverPkg of ['../server/package.json', '../api/package.json']) {
    if (!existsSync(serverPkg)) continue;
    try {
      const pkg = JSON.parse(readFileSync(serverPkg, 'utf-8'));
      const scripts = Object.values(pkg.scripts || {}).join(' ');
      const portMatch = scripts.match(/PORT=(\d+)/);
      if (portMatch) return parseInt(portMatch[1]);
    } catch {}
  }

  return fallback;
}

function replaceVars(tmpl: string, vars: Record<string, string>): string {
  let result = tmpl;
  for (const [k, v] of Object.entries(vars)) {
    result = result.replaceAll(`{{${k}}}`, v);
  }
  return result;
}

/**
 * LEARNING #3: Auto-generate BETTER_AUTH_SECRET and set BETTER_AUTH_URL
 * LEARNING: Next.js reads .env.local preferentially; in monorepos where the
 * Next.js app is in a subdirectory, .env in the parent won't be read.
 * We write to BOTH .env and .env.local to cover all cases.
 */
/**
 * Ensure tsconfig.json has @/* path alias so generated imports resolve.
 * Corral generates imports like `@/auth-context`, `@/gates`, `@/lib/corral`.
 */
function patchTsconfigPaths(): void {
  const tsconfigFiles = ['tsconfig.json', 'tsconfig.app.json'];
  for (const file of tsconfigFiles) {
    if (!existsSync(file)) continue;
    try {
      const raw = readFileSync(file, 'utf-8');
      // Strip comments for JSON parsing (// and /* */ style)
      const stripped = raw
        .replace(/\/\/.*$/gm, '')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/,\s*([}\]])/g, '$1'); // trailing commas
      const tsconfig = JSON.parse(stripped);

      if (!tsconfig.compilerOptions) tsconfig.compilerOptions = {};
      const co = tsconfig.compilerOptions;

      // Check if @/* already mapped
      if (co.paths && co.paths['@/*']) continue;

      // Determine base — use existing baseUrl or default to "."
      if (!co.baseUrl) co.baseUrl = '.';
      if (!co.paths) co.paths = {};

      // Map @/* to src/* if src/ exists, otherwise ./*
      const srcDir = existsSync('src') ? 'src' : '.';
      co.paths['@/*'] = [`${srcDir}/*`];

      // Write back — preserve original formatting where possible
      // Re-read original to do surgical insert if feasible
      if (raw.includes('"compilerOptions"') && raw.includes('"paths"')) {
        // paths key exists but without @/* — just rewrite
        writeFileSync(file, JSON.stringify(tsconfig, null, 2) + '\n');
      } else {
        writeFileSync(file, JSON.stringify(tsconfig, null, 2) + '\n');
      }
      success(`Patched ${file} — added @/* path alias → ${srcDir}/*`);
      return; // only patch one tsconfig
    } catch (e) {
      // Non-fatal — some tsconfigs may be too complex to parse
      warn(`Could not auto-patch ${file} with @/* path alias`);
    }
  }
}

function ensureEnvVars(port: number, framework: string): string[] {
  const additions: string[] = [];

  // Check ALL env files for existing vars
  const envFiles = ['.env', '.env.local'];
  const allExisting = envFiles
    .filter(f => existsSync(f))
    .map(f => readFileSync(f, 'utf-8'))
    .join('\n');

  // Generate secret if missing
  if (!allExisting.includes('BETTER_AUTH_SECRET')) {
    const secret = randomBytes(32).toString('base64');
    additions.push(`BETTER_AUTH_SECRET=${secret}`);
  }

  // Set base URL if missing
  if (!allExisting.includes('BETTER_AUTH_URL')) {
    additions.push(`BETTER_AUTH_URL=http://localhost:${port}`);
  }

  if (additions.length > 0) {
    const block = `\n# Corral / Better Auth\n${additions.join('\n')}\n`;

    // For Next.js: write to .env.local (takes precedence, git-ignored by default)
    // For others: write to .env
    if (framework === 'nextjs') {
      appendFileSync('.env.local', block);
      success(`Added ${additions.length} env var(s) to .env.local`);
      ensureGitignore('.env.local');
      info('Using .env.local (Next.js reads this over .env)');
    } else {
      appendFileSync('.env', block);
      success(`Added ${additions.length} env var(s) to .env`);
    }

    ensureGitignore('.env');
    ensureGitignore('.env.local');
  }

  return additions;
}

function ensureGitignore(entry: string) {
  const gitignore = existsSync('.gitignore') ? readFileSync('.gitignore', 'utf-8') : '';
  if (!gitignore.includes(entry)) {
    appendFileSync('.gitignore', `\n${entry}\n`);
    info(`Added ${entry} to .gitignore`);
  }
}

/**
 * LEARNING #4: Install the correct database driver package
 */
function installDeps(framework: string, db: string): void {
  const deps = ['better-auth'];
  const devDeps: string[] = [];

  // Database driver + types
  switch (db) {
    case 'sqlite': deps.push('better-sqlite3'); devDeps.push('@types/better-sqlite3'); break;
    case 'pg': deps.push('pg'); devDeps.push('@types/pg'); break;
    case 'mysql': deps.push('mysql2'); break;
    case 'turso': deps.push('@libsql/client'); break;
    case 'd1': break; // D1 is provided by Cloudflare Workers runtime
  }

  // Try to install, but don't fail if npm isn't available
  try {
    info(`Installing: ${deps.join(', ')}...`);
    execSync(`npm install ${deps.join(' ')}`, { stdio: 'pipe' });
    if (devDeps.length > 0) {
      execSync(`npm install --save-dev ${devDeps.join(' ')}`, { stdio: 'pipe' });
    }
    success('Dependencies installed');
  } catch (e) {
    warn(`Auto-install failed. Run manually:\n  npm install ${deps.join(' ')}`);
  }
}

/**
 * LEARNING #2: Fix Next.js rewrites that conflict with /api/auth
 */
/**
 * LEARNING #2: Auto-detect AND auto-fix Next.js rewrites that intercept /api/auth
 */
function checkAndFixRewrites(framework: Framework, autoFix: boolean = true): boolean {
  if (framework.name !== 'nextjs' || !framework.hasRewrites) return false;

  for (const configFile of ['next.config.js', 'next.config.mjs', 'next.config.ts']) {
    if (!existsSync(configFile)) continue;
    let content = readFileSync(configFile, 'utf-8');

    // Check if rewrites catch /api/* without excluding /api/auth
    if (content.includes("'/api/:path*'") || content.includes('"/api/:path*"')) {
      // Check if auth is already excluded
      if (content.includes('(?!auth)') || content.includes('api/auth')) continue;

      if (autoFix) {
        // Auto-fix: replace /api/:path* with /api/:path((?!auth).*)
        const fixed = content
          .replace(/['"]\/api\/:path\*['"]/g, (match) => {
            const quote = match[0];
            return `${quote}/api/:path((?!auth).*)${quote}`;
          });

        if (fixed !== content) {
          writeFileSync(configFile, fixed);
          success(`Auto-fixed ${configFile} — excluded /api/auth from rewrites`);
          info(`Changed: '/api/:path*' → '/api/:path((?!auth).*)'`);
          return false; // Fixed, no longer a problem
        }
      }

      warn(
        `⚠️  ${chalk.bold(configFile)} has API rewrites that will intercept /api/auth/* requests!\n` +
        `   Corral's auth endpoints won't work unless you exclude /api/auth.\n\n` +
        `   ${chalk.bold('Fix:')} Change your rewrite source from:\n` +
        `     ${chalk.red("'/api/:path*'")}\n` +
        `   To:\n` +
        `     ${chalk.green("'/api/:path((?!auth).*)'")}\n`
      );
      return true;
    }
  }
  return false;
}

/**
 * Check and warn about Vite proxy configs that might intercept /api/auth
 */
function checkViteProxy(framework: Framework): boolean {
  if (!framework.hasProxy) return false;

  for (const configFile of ['vite.config.ts', 'vite.config.js', 'vite.config.mjs']) {
    if (!existsSync(configFile)) continue;
    const content = readFileSync(configFile, 'utf-8');

    // Check if there's already an /api/auth proxy (good — points to Corral server)
    if (content.includes("'/api/auth'") || content.includes('"/api/auth"')) {
      info(`${configFile} already has /api/auth proxy configured`);
      return false;
    }

    // Check if /api catches everything
    if ((content.includes("'/api'") || content.includes('"/api"')) && !content.includes('/api/auth')) {
      warn(
        `⚠️  ${chalk.bold(configFile)} proxies /api which may intercept /api/auth.\n` +
        `   Add a specific proxy for /api/auth pointing to your Corral server:\n\n` +
        `   ${chalk.cyan(`server: {\n` +
        `     proxy: {\n` +
        `       '/api/auth': { target: 'http://localhost:3001', changeOrigin: true },\n` +
        `       '/api': { target: 'http://localhost:YOUR_BACKEND_PORT', changeOrigin: true },\n` +
        `     }\n` +
        `   }`)}\n\n` +
        `   Order matters! /api/auth must come BEFORE /api.`
      );
      return true;
    }
  }
  return false;
}

// ─── Agent Discovery Breadcrumbs ──────────────────────────────────────────────

const AGENTS_MD_SECTION = `
## Auth & Billing (Corral)

This project uses [Corral](https://docs.llamafarm.dev/corral/) for authentication and billing.

- Config: \`corral.yaml\` — edit plans, features, meters here
- Agent guide: \`CORRAL.md\` — project-specific auth details
- Full docs: https://docs.llamafarm.dev/corral/llms.txt

### Quick Commands
\`\`\`bash
npx create-corral add feature <name> --plan <plan>  # gate a feature
npx create-corral add plan <name> --price <n>       # add a plan
npx create-corral add provider <name>               # add OAuth
npx create-corral doctor                            # verify setup
\`\`\`
`;

const CURSOR_RULES_SECTION = `
# Auth & Billing
This project uses Corral for auth. Read CORRAL.md for setup details.
For Corral commands: https://docs.llamafarm.dev/corral/llms.txt
`;

function injectAgentBreadcrumbs(configPath: string): void {
  // a. AGENTS.md
  if (existsSync('AGENTS.md')) {
    const content = readFileSync('AGENTS.md', 'utf-8');
    if (!content.includes('## Auth (Corral)') && !content.includes('## Auth & Billing (Corral)')) {
      appendFileSync('AGENTS.md', AGENTS_MD_SECTION);
      success('Updated AGENTS.md with Corral section');
    }
  }

  // b. .cursorrules
  if (existsSync('.cursorrules')) {
    const content = readFileSync('.cursorrules', 'utf-8');
    if (!content.includes('Corral for auth')) {
      appendFileSync('.cursorrules', CURSOR_RULES_SECTION);
      success('Updated .cursorrules with Corral context');
    }
  }

  // c. .github/copilot-instructions.md
  const copilotPath = '.github/copilot-instructions.md';
  if (existsSync(copilotPath)) {
    const content = readFileSync(copilotPath, 'utf-8');
    if (!content.includes('Corral for auth')) {
      appendFileSync(copilotPath, CURSOR_RULES_SECTION);
      success('Updated .github/copilot-instructions.md with Corral context');
    }
  }

  // d. package.json — add corral metadata
  const pkgPath = 'package.json';
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
      if (!pkg.corral) {
        pkg.corral = {
          version: '0.1.1',
          llms: 'https://docs.llamafarm.dev/corral/llms.txt',
          config: configPath,
        };
        writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
        success('Added corral metadata to package.json');
      }
    } catch {
      // non-fatal
    }
  }

  // e. public/.well-known/llms.txt (Next.js static file)
  writeProjectLlmsTxt(configPath);
}

// ─── Scaffold Frontend UI Components ───────────────────────────────
// Generates AdminPanel, ProfilePage, AccountMenu, and corral-styles.css
// Called after auth-context + gates are generated in any framework branch.

async function scaffoldFrontendComponents(
  srcDir: string,
  vars: Record<string, string>,
  results: string[],
  existingServer?: ExistingServer | null,
): Promise<void> {
  const componentsDir = join(srcDir, 'components');
  mkdirSync(componentsDir, { recursive: true });

  // AdminPanel.tsx
  const adminPanelPath = join(componentsDir, 'AdminPanel.tsx');
  if (!existsSync(adminPanelPath)) {
    writeFileSync(adminPanelPath, replaceVars(loadTemplate('admin-panel.tsx.tmpl'), vars));
    results.push(adminPanelPath);
    success(`Created ${adminPanelPath} (admin user management UI)`);
  }

  // ProfilePage.tsx
  const profilePagePath = join(componentsDir, 'ProfilePage.tsx');
  if (!existsSync(profilePagePath)) {
    writeFileSync(profilePagePath, replaceVars(loadTemplate('profile-page.tsx.tmpl'), vars));
    results.push(profilePagePath);
    success(`Created ${profilePagePath} (user profile + billing UI)`);
  }

  // AccountMenu.tsx
  const accountMenuPath = join(componentsDir, 'AccountMenu.tsx');
  if (!existsSync(accountMenuPath)) {
    writeFileSync(accountMenuPath, replaceVars(loadTemplate('account-menu.tsx.tmpl'), vars));
    results.push(accountMenuPath);
    success(`Created ${accountMenuPath} (nav dropdown: profile, upgrade, admin, sign out)`);
  }

  // corral-styles.css (at src root, not components/)
  const stylesPath = join(srcDir, 'corral-styles.css');
  if (!existsSync(stylesPath)) {
    writeFileSync(stylesPath, replaceVars(loadTemplate('corral-styles.css.tmpl'), vars));
    results.push(stylesPath);
    success(`Created ${stylesPath} (Corral UI styles — import in your app)`);
  }

  // Admin API routes — place into server src/ if existing server found, else skip
  if (existingServer) {
    const adminApiPath = join(existingServer.srcDir, 'corral-admin-routes.ts');
    if (!existsSync(adminApiPath)) {
      writeFileSync(adminApiPath, replaceVars(loadTemplate('admin-api.ts.tmpl'), vars));
      results.push(adminApiPath);
      success(`Created ${adminApiPath} (admin & billing API routes for ${existingServer.framework})`);
      info(`Mount in your server: app.use('/api/corral', (await import('./corral-admin-routes.js')).default)`);
    }
  }
}

export async function initCommand(opts: { json?: boolean; config: string; db?: string; install?: boolean; server?: 'express' | 'hono' | 'fastify' }) {
  const framework = detectFramework();
  const appName = process.cwd().split('/').pop() || 'my-app';
  const appId = appName.toLowerCase().replace(/[^a-z0-9-]/g, '-');
  const db = opts.db || 'sqlite';

  // For SPAs and Python backends, the auth server runs on a different port
  const authServerPort = (framework.isSPA || framework.isPython) ? 3001 : framework.port;

  // Database-specific defaults
  const dbUrlDefaults: Record<string, string> = {
    sqlite: './corral.db',
    pg: 'postgresql://localhost:5432/corral',
    mysql: 'mysql://root:@localhost:3306/corral',
    turso: 'file:./corral.db',
    d1: '(D1 binding — see wrangler.toml)',
  };

  // Derive CORRAL.md template vars based on detected framework
  const frameworkLabel =
    framework.name === 'nextjs' ? 'Next.js' :
    framework.name === 'vite-react' ? 'Vite + React (SPA)' :
    framework.name === 'cra' ? 'Create React App (SPA)' :
    framework.name === 'hono' ? 'Hono' :
    framework.name === 'express' ? 'Express' :
    framework.name === 'fastapi' ? 'FastAPI' :
    framework.name === 'django' ? 'Django' :
    framework.name === 'flask' ? 'Flask' :
    'Unknown';

  const serverFileLabel =
    framework.name === 'nextjs' ? 'app/api/auth/[...all]/route.ts' :
    framework.name === 'hono' ? 'src/routes/auth.ts' :
    framework.isSPA ? 'server/auth.ts' :
    'lib/corral.ts (mounted in your server)';

  const envSuffix =
    framework.name === 'nextjs' ? '.local' : '';

  const startCommandLabel =
    framework.name === 'nextjs' ? 'npm run dev' :
    framework.isSPA ? 'npm run dev   # starts Vite; separately: npx tsx server/auth.ts' :
    'npm run dev   # or: npx tsx server/auth.ts';

  const vars = {
    APP_NAME: appName,
    APP_ID: appId,
    DB_ADAPTER: db,
    DB_URL: dbUrlDefaults[db] || dbUrlDefaults['sqlite'],
    DB_PATH: db === 'sqlite' ? './corral.db' : dbUrlDefaults[db] || '',
    PORT: String(authServerPort),
    FRONTEND_PORT: String(framework.port),
    APP_ID_UPPER: appId.toUpperCase().replace(/-/g, '_'),
    FRAMEWORK: frameworkLabel,
    SERVER_FILE: serverFileLabel,
    ENV_SUFFIX: envSuffix,
    START_COMMAND: startCommandLabel,
    TRIAL_DAYS: '14',
    DEFAULT_PAID_PLAN: 'pro',
    AUTH_IMPORT_PATH: '../auth-context',
    PLAN_NAMES: 'free, pro',
    PAID_PLAN: 'pro',
    PAID_PLAN_DISPLAY: 'Pro',
    PAID_PLAN_PRICE: '29',
    SUCCESS_URL: '/?upgraded=true',
    CANCEL_URL: '/?cancelled=true',
  };
  const results: string[] = [];
  const warnings: string[] = [];

  // ─── Monorepo detection (run early so we can adjust messaging) ────
  // Only relevant for SPAs — if there's already a sibling server workspace,
  // install into it instead of scaffolding a new standalone auth server.
  const existingServer = framework.isSPA ? detectExistingServer() : null;

  console.log(chalk.bold(`\n🤠 Corral init — ${appName}\n`));
  info(`Framework: ${framework.name} (port ${framework.port})`);
  if (framework.isPython) {
    info(`Architecture: Python backend — will generate auth middleware + standalone auth server`);
    info(`Auth server port: ${authServerPort}`);
    info(`Python backend port: ${framework.port}`);
  } else if (framework.isSPA && existingServer) {
    info(`Architecture: Monorepo SPA + existing ${existingServer.framework} server at ${existingServer.path}`);
    info(`  Will install corral.ts into ${existingServer.srcDir}/ (no new auth server scaffolded)`);
  } else if (framework.isSPA) {
    info(`Architecture: SPA (client-only) — will scaffold standalone auth server`);
    info(`Auth server port: ${authServerPort}`);
  }
  info(`Database: ${db}`);

  // Step 1: Generate corral.yaml
  if (!existsSync(opts.config)) {
    const yaml = replaceVars(loadTemplate('corral.yaml.tmpl'), vars);
    writeFileSync(opts.config, yaml);
    results.push(opts.config);
    success(`Created ${opts.config}`);
  } else {
    info(`${opts.config} already exists, skipping`);
  }

  // Step 2: Generate CORRAL.md (agent discovery — LEARNING from design)
  if (!existsSync('CORRAL.md')) {
    writeFileSync('CORRAL.md', replaceVars(loadTemplate('CORRAL.md.tmpl'), vars));
    results.push('CORRAL.md');
    success('Created CORRAL.md (agent discovery file)');
  }

  // ─── Shared helper: generate gates.tsx with dynamic PLAN_RANK ──────
  async function generateGates(destPath: string): Promise<void> {
    if (existsSync(destPath)) return;
    let gatesContent = replaceVars(loadTemplate('gates.tsx.tmpl'), vars);
    try {
      const yaml = await import('yaml');
      const yamlContent = readFileSync(join(process.cwd(), 'corral.yaml'), 'utf-8');
      const parsedConfig = yaml.parse(yamlContent);
      const plans = parsedConfig?.plans || [];
      const planNames: string[] = plans.map((p: any) => typeof p === 'string' ? p : (p.name || '')).filter(Boolean);
      if (planNames.length > 0) {
        const rankEntries = planNames.map((name: string, i: number) => `  ${name}: ${i}`).join(',\n');
        const dynamicRank = `const PLAN_RANK: Record<string, number> = {\n${rankEntries}\n}`;
        gatesContent = gatesContent.replace(/const PLAN_RANK: Record<string, number> = \{[^}]*\}/, dynamicRank);
      }
    } catch {}
    mkdirSync(dirname(destPath), { recursive: true });
    writeFileSync(destPath, gatesContent);
    results.push(destPath);
    success(`Created ${destPath} (AuthGate, PlanGate, BlurGate components)`);
  }

  // Step 3 & 4: Generate server files (architecture-dependent)
  if (framework.isSPA) {
    const srcDir = existsSync('src') ? 'src' : '.';

    if (existingServer) {
      // ─── MONOREPO PATH: existing server found ──────────────────────
      // Install corral.ts into the server's src/, skip scaffolding new server.
      info(`Found existing ${existingServer.framework} server at ${existingServer.path} — using it for auth`);

      const setupTemplateMap: Record<string, string> = {
        sqlite: 'setup-spa.ts.tmpl',
        pg: 'setup-pg.ts.tmpl',
        mysql: 'setup-mysql.ts.tmpl',
        turso: 'setup-turso.ts.tmpl',
        d1: 'setup-d1.ts.tmpl',
      };
      const setupTemplate = setupTemplateMap[db] || 'setup-spa.ts.tmpl';

      // Copy corral.ts into the existing server's src/
      const serverCorralPath = join(existingServer.srcDir, 'corral.ts');
      if (!existsSync(serverCorralPath)) {
        writeFileSync(serverCorralPath, replaceVars(loadTemplate(setupTemplate), vars));
        results.push(serverCorralPath);
        success(`Created ${serverCorralPath} (auth setup — ${db})`);
      }

      // Generate mount instructions (and optionally auto-patch server entry)
      const mountSnippet = existingServer.framework === 'hono'
        ? `import { auth } from './corral.js';\nimport { serve } from '@hono/node-server';\n// Mount Corral auth:\napp.on(['GET', 'POST'], '/api/auth/*', (c) => auth.handler(c.req.raw));`
        : existingServer.framework === 'fastify'
        ? `import { auth } from './corral.js';\nimport { toNodeHandler } from 'better-auth/node';\n// Mount Corral auth:\napp.all('/api/auth/*', toNodeHandler(auth));`
        : `import { auth } from './corral.js';\nimport { toNodeHandler } from 'better-auth/node';\n// Mount Corral auth:\nconst authHandler = toNodeHandler(auth);\napp.all('/api/auth/*', (req, res) => authHandler(req, res));`;

      // Try to auto-patch the server entry file
      if (existsSync(existingServer.entryFile)) {
        const entryContent = readFileSync(existingServer.entryFile, 'utf-8');
        if (!entryContent.includes('corral') && !entryContent.includes('better-auth')) {
          // Prepend mount instructions as a comment block so it's safe to review
          const patchedContent =
            `// ─── Corral Auth (added by corral init) ───────────────────────────\n` +
            `// ${mountSnippet.split('\n').join('\n// ')}\n` +
            `// ──────────────────────────────────────────────────────────────────\n\n` +
            entryContent;
          writeFileSync(existingServer.entryFile, patchedContent);
          success(`Prepended auth mount instructions to ${existingServer.entryFile} (commented — review and uncomment)`);
        } else {
          info(`${existingServer.entryFile} already references auth — skipping patch`);
        }
      }

      // Create corral-admin-routes.ts in the server
      const adminApiPath = join(existingServer.srcDir, 'corral-admin-routes.ts');
      if (!existsSync(adminApiPath)) {
        writeFileSync(adminApiPath, replaceVars(loadTemplate('admin-api.ts.tmpl'), vars));
        results.push(adminApiPath);
        success(`Created ${adminApiPath} (admin & billing API routes)`);
        info(`Mount: app.use('/api/corral', (await import('./corral-admin-routes.js')).default)`);
      }

      // SQL reference in server dir
      const sqlTemplateMap: Record<string, string> = {
        sqlite: 'corral-tables.sql.tmpl', pg: 'corral-tables-pg.sql.tmpl',
        mysql: 'corral-tables.sql.tmpl', turso: 'corral-tables.sql.tmpl', d1: 'corral-tables.sql.tmpl',
      };
      const sqlPath = join(existingServer.path, 'corral-tables.sql');
      if (!existsSync(sqlPath)) {
        writeFileSync(sqlPath, replaceVars(loadTemplate(sqlTemplateMap[db] || 'corral-tables.sql.tmpl'), vars));
        results.push(sqlPath);
        success(`Created ${sqlPath}`);
      }

      // ─── Frontend files ────────────────────────────────────────────
      const authContextPath = join(srcDir, 'auth-context.tsx');
      if (!existsSync(authContextPath)) {
        writeFileSync(authContextPath, replaceVars(loadTemplate('auth-context.tsx.tmpl'), vars));
        results.push(authContextPath);
        success(`Created ${authContextPath} (React auth provider + useAuth hook)`);
      }

      await generateGates(join(srcDir, 'gates.tsx'));
      await scaffoldFrontendComponents(srcDir, vars, results, existingServer);

      // Patch Vite proxy to point to the existing server (with port detection)
      const serverPort = getViteProxyServerPort(existingServer.framework === 'express' ? 3001 : 8080);
      for (const viteConfig of ['vite.config.ts', 'vite.config.js', 'vite.config.mjs']) {
        if (!existsSync(viteConfig)) continue;
        let content = readFileSync(viteConfig, 'utf-8');
        if (content.includes('proxy')) {
          info(`${viteConfig} already has proxy config — skipping`);
          break;
        }
        const configMatch = content.match(/(defineConfig\(\{[\s\S]*?)(}\s*\))/);
        if (configMatch) {
          const proxyConfig = `  server: {\n    proxy: {\n      '/api': {\n        target: 'http://localhost:${serverPort}',\n        changeOrigin: true,\n      },\n    },\n  },\n`;
          content = content.replace(configMatch[2], proxyConfig + configMatch[2]);
          writeFileSync(viteConfig, content);
          success(`Auto-patched ${viteConfig} — /api → existing server at localhost:${serverPort}`);
        }
        break;
      }

    } else {
      // ─── STANDALONE PATH: no existing server found ─────────────────
      // Scaffold a new standalone auth server in server/
      let serverChoice = opts.server || 'express';
      if (!opts.server) {
        try {
          const pkg = JSON.parse(readFileSync('package.json', 'utf-8'));
          const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
          if (allDeps['hono']) serverChoice = 'hono';
          else if (allDeps['fastify']) serverChoice = 'fastify';
        } catch {}
      }
      const serverDir = 'server';
      mkdirSync(serverDir, { recursive: true });

      info(`Auth server framework: ${serverChoice}`);

      // server/corral.ts — auth setup (database-specific template)
      const setupTemplateMap: Record<string, string> = {
        sqlite: 'setup-spa.ts.tmpl',
        pg: 'setup-pg.ts.tmpl',
        mysql: 'setup-mysql.ts.tmpl',
        turso: 'setup-turso.ts.tmpl',
        d1: 'setup-d1.ts.tmpl',
      };
      const setupTemplate = setupTemplateMap[db] || 'setup-spa.ts.tmpl';
      const setupPath = join(serverDir, 'corral.ts');
      if (!existsSync(setupPath)) {
        writeFileSync(setupPath, replaceVars(loadTemplate(setupTemplate), vars));
        results.push(setupPath);
        success(`Created ${setupPath} (auth setup — ${db})`);
      }

      // server/auth.ts — server entrypoint (framework-specific)
      const serverTemplateMap: Record<string, string> = {
        express: 'server-express.ts.tmpl',
        hono: 'server-hono.ts.tmpl',
        fastify: 'server-fastify.ts.tmpl',
      };
      const serverPath = join(serverDir, 'auth.ts');
      if (!existsSync(serverPath)) {
        writeFileSync(serverPath, replaceVars(loadTemplate(serverTemplateMap[serverChoice]), vars));
        results.push(serverPath);
        success(`Created ${serverPath} (${serverChoice} auth server)`);
      }

      // Add dev:auth script to package.json
      try {
        const pkgPath = 'package.json';
        const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
        if (!pkg.scripts) pkg.scripts = {};
        if (!pkg.scripts['dev:auth']) {
          pkg.scripts['dev:auth'] = 'npx tsx server/auth.ts';
          if (pkg.scripts['dev'] && !pkg.scripts['dev:all']) {
            pkg.scripts['dev:all'] = `concurrently "npm run dev" "npm run dev:auth"`;
            info('Added dev:all script (install concurrently: npm i -D concurrently)');
          }
          writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
          success('Added dev:auth script to package.json');
        }
      } catch {}

      // ─── Frontend files ────────────────────────────────────────────
      const authContextPath = join(srcDir, 'auth-context.tsx');
      if (!existsSync(authContextPath)) {
        writeFileSync(authContextPath, replaceVars(loadTemplate('auth-context.tsx.tmpl'), vars));
        results.push(authContextPath);
        success(`Created ${authContextPath} (React auth provider + useAuth hook)`);
      }

      await generateGates(join(srcDir, 'gates.tsx'));
      await scaffoldFrontendComponents(srcDir, vars, results, null);

      // ─── SQL reference file ────────────────────────────────────────
      const sqlTemplateMap: Record<string, string> = {
        sqlite: 'corral-tables.sql.tmpl',
        pg: 'corral-tables-pg.sql.tmpl',
        mysql: 'corral-tables.sql.tmpl',
        turso: 'corral-tables.sql.tmpl',
        d1: 'corral-tables.sql.tmpl',
      };
      const sqlPath = join(serverDir, 'corral-tables.sql');
      if (!existsSync(sqlPath)) {
        writeFileSync(sqlPath, replaceVars(loadTemplate(sqlTemplateMap[db] || 'corral-tables.sql.tmpl'), vars));
        results.push(sqlPath);
        success(`Created ${sqlPath} (${db} tables — auto-created on first run)`);
        if (db === 'd1') {
          info('For D1: run `npx wrangler d1 execute corral-auth --file=./server/corral-tables.sql`');
        }
      }

      // ─── Auto-patch vite.config.ts — use detected server port ─────
      const detectedPort = getViteProxyServerPort(authServerPort);
      for (const viteConfig of ['vite.config.ts', 'vite.config.js', 'vite.config.mjs']) {
        if (!existsSync(viteConfig)) continue;
        let content = readFileSync(viteConfig, 'utf-8');

        if (content.includes("'/api'") || content.includes('"/api"') || content.includes('proxy')) {
          info(`${viteConfig} already has proxy config — skipping auto-patch`);
          break;
        }

        if (content.includes('server:') || content.includes('server :')) {
          const serverMatch = content.match(/(server\s*:\s*\{)/);
          if (serverMatch) {
            const proxyBlock = `\n    proxy: {\n      '/api': {\n        target: 'http://localhost:${detectedPort}',\n        changeOrigin: true,\n      },\n    },`;
            content = content.replace(serverMatch[1], serverMatch[1] + proxyBlock);
            writeFileSync(viteConfig, content);
            success(`Auto-patched ${viteConfig} — added /api proxy to localhost:${detectedPort}`);
            break;
          }
        }

        const configMatch = content.match(/(defineConfig\(\{[\s\S]*?)(}\s*\))/);
        if (configMatch) {
          const proxyConfig = `  server: {\n    proxy: {\n      '/api': {\n        target: 'http://localhost:${detectedPort}',\n        changeOrigin: true,\n      },\n    },\n  },\n`;
          content = content.replace(configMatch[2], proxyConfig + configMatch[2]);
          writeFileSync(viteConfig, content);
          success(`Auto-patched ${viteConfig} — added server.proxy for /api → localhost:${detectedPort}`);
          break;
        }

        info(`\n💡 Add to your ${viteConfig}:`);
        console.log(chalk.cyan(`   server: {\n     proxy: {\n       '/api': {\n         target: 'http://localhost:${detectedPort}',\n         changeOrigin: true,\n       },\n     },\n   }`));
        console.log('');
        break;
      }
    }

  } else if (framework.isPython) {
    // ─── Python: middleware + standalone auth server ─────────────────
    info(`Generating Python auth middleware for ${framework.name}...`);

    // middleware/corral.py — session validation for the Python backend
    const middlewareDir = 'middleware';
    mkdirSync(middlewareDir, { recursive: true });

    const middlewarePath = join(middlewareDir, 'corral.py');
    if (!existsSync(middlewarePath)) {
      const middlewareTemplate = db === 'pg' ? 'middleware-fastapi-pg.py.tmpl' : 'middleware-fastapi.py.tmpl';
      writeFileSync(middlewarePath, replaceVars(loadTemplate(middlewareTemplate), vars));
      results.push(middlewarePath);
      success(`Created ${middlewarePath} (${framework.name} auth middleware)`);
    }

    // middleware/__init__.py
    const initPyPath = join(middlewareDir, '__init__.py');
    if (!existsSync(initPyPath)) {
      writeFileSync(initPyPath, '');
      results.push(initPyPath);
    }

    // server/ directory — standalone Node.js auth server
    const serverDir = 'server';
    mkdirSync(serverDir, { recursive: true });

    // server/corral.ts — auth setup (same as SPA)
    const setupTemplateMap: Record<string, string> = {
      sqlite: 'setup-spa.ts.tmpl', pg: 'setup-pg.ts.tmpl', mysql: 'setup-mysql.ts.tmpl',
      turso: 'setup-turso.ts.tmpl', d1: 'setup-d1.ts.tmpl',
    };
    const setupPath = join(serverDir, 'corral.ts');
    if (!existsSync(setupPath)) {
      writeFileSync(setupPath, replaceVars(loadTemplate(setupTemplateMap[db] || 'setup-spa.ts.tmpl'), vars));
      results.push(setupPath);
      success(`Created ${setupPath} (auth setup — ${db})`);
    }

    // server/auth.ts — Express auth server
    const serverPath = join(serverDir, 'auth.ts');
    if (!existsSync(serverPath)) {
      writeFileSync(serverPath, replaceVars(loadTemplate('server-express.ts.tmpl'), vars));
      results.push(serverPath);
      success(`Created ${serverPath} (auth server for ${framework.name})`);
    }

    // server/package.json — Node deps for auth server
    const serverPkgPath = join(serverDir, 'package.json');
    if (!existsSync(serverPkgPath)) {
      const serverPkg = {
        name: `${appId}-auth-server`,
        private: true,
        type: 'module',
        scripts: { dev: 'npx tsx auth.ts' },
        dependencies: {
          'better-auth': '^1.4.0',
          'express': '^4.21.0',
          'cors': '^2.8.5',
          ...(db === 'sqlite' ? { 'better-sqlite3': '^11.0.0' } : {}),
          ...(db === 'pg' ? { 'pg': '^8.0.0' } : {}),
          ...(db === 'mysql' ? { 'mysql2': '^3.0.0' } : {}),
          ...(db === 'turso' ? { '@libsql/client': '^0.6.0' } : {}),
        },
        devDependencies: { 'tsx': '^4.0.0', 'typescript': '^5.7.0' },
      };
      writeFileSync(serverPkgPath, JSON.stringify(serverPkg, null, 2) + '\n');
      results.push(serverPkgPath);
      success(`Created ${serverPkgPath}`);
    }

    // SQL reference
    const sqlTemplateMap: Record<string, string> = { sqlite: 'corral-tables.sql.tmpl', pg: 'corral-tables-pg.sql.tmpl' };
    const sqlPath = join(serverDir, 'corral-tables.sql');
    if (!existsSync(sqlPath)) {
      writeFileSync(sqlPath, replaceVars(loadTemplate(sqlTemplateMap[db] || 'corral-tables.sql.tmpl'), vars));
      results.push(sqlPath);
      success(`Created ${sqlPath}`);
    }

    // CORRAL.md for agents
    if (!existsSync('CORRAL.md')) {
      writeFileSync('CORRAL.md', replaceVars(loadTemplate('CORRAL.md.tmpl'), vars));
      results.push('CORRAL.md');
      success('Created CORRAL.md');
    }

    // Log architecture guidance
    info('');
    info(chalk.bold('Architecture: Python + Corral Auth Server'));
    info(`  ${framework.name} (port ${framework.port}) ← your API (reads session from shared DB)`);
    info(`  Corral auth (port ${authServerPort}) ← handles login, signup, payments`);
    info(`  Shared database: ${db === 'sqlite' ? 'corral.db' : db}`);
    info('');
    info(`Your ${framework.name} app uses ${chalk.cyan('middleware/corral.py')} to validate sessions.`);
    info(`All auth operations go through the Corral server.`);
    info('');
    if (framework.name === 'fastapi') {
      info(`Add to your FastAPI app:`);
      console.log(chalk.cyan(`
   from middleware.corral import get_current_user, require_plan
   from fastapi import Depends

   @app.get("/api/protected")
   async def protected(user = Depends(get_current_user)):
       return {"hello": user["name"]}

   @app.get("/api/pro-only")
   async def pro_only(user = Depends(require_plan("pro"))):
       return {"premium": True}
`));
    }

  } else if (framework.name === 'nextjs') {
    // ─── Next.js: route handler + lib/corral.ts ──────────────────────
    const routePath = 'app/api/auth/[...all]/route.ts';
    if (!existsSync(routePath)) {
      mkdirSync(dirname(routePath), { recursive: true });
      writeFileSync(routePath, replaceVars(loadTemplate('route-nextjs.ts.tmpl'), vars));
      results.push(routePath);
      success(`Created ${routePath}`);
    }

    // Pick DB-specific setup template for non-SPA too
    const nonSpaSetupMap: Record<string, string> = {
      sqlite: 'setup.ts.tmpl',
      pg: 'setup-pg.ts.tmpl',
      mysql: 'setup-mysql.ts.tmpl',
      turso: 'setup-turso.ts.tmpl',
      d1: 'setup-d1.ts.tmpl',
    };
    const nonSpaSetupTmpl = nonSpaSetupMap[db] || 'setup.ts.tmpl';

    const setupPath = 'lib/corral.ts';
    if (!existsSync(setupPath)) {
      mkdirSync(dirname(setupPath), { recursive: true });
      writeFileSync(setupPath, replaceVars(loadTemplate(nonSpaSetupTmpl), vars));
      results.push(setupPath);
      success(`Created ${setupPath} (${db})`);
    }

    // Generate auth-context.tsx + gates.tsx for Next.js (at src/ or root)
    const nextSrcDir = existsSync('src') ? 'src' : '.';
    const nextAuthContextPath = join(nextSrcDir, 'auth-context.tsx');
    if (!existsSync(nextAuthContextPath)) {
      mkdirSync(dirname(nextAuthContextPath), { recursive: true });
      writeFileSync(nextAuthContextPath, replaceVars(loadTemplate('auth-context.tsx.tmpl'), vars));
      results.push(nextAuthContextPath);
      success(`Created ${nextAuthContextPath} (useAuth hook + AuthProvider)`);
    }

    await generateGates(join(nextSrcDir, 'gates.tsx'));

    // Scaffold admin/profile/billing UI components
    await scaffoldFrontendComponents(nextSrcDir, vars, results, null);

    // Wrap {children} in AuthProvider in app/layout.tsx
    const layoutPath = 'app/layout.tsx';
    if (existsSync(layoutPath)) {
      let layoutContent = readFileSync(layoutPath, 'utf-8');
      if (!layoutContent.includes('AuthProvider')) {
        // Add import at the top (after last existing import or at the very top)
        const importLine = `import { AuthProvider } from '@/auth-context';\n`;
        const lastImportIdx = layoutContent.lastIndexOf('\nimport ');
        if (lastImportIdx !== -1) {
          const insertAt = layoutContent.indexOf('\n', lastImportIdx + 1) + 1;
          layoutContent = layoutContent.slice(0, insertAt) + importLine + layoutContent.slice(insertAt);
        } else {
          layoutContent = importLine + layoutContent;
        }
        // Wrap {children} with <AuthProvider>
        layoutContent = layoutContent.replace(
          /\{children\}/g,
          '<AuthProvider>{children}</AuthProvider>',
        );
        writeFileSync(layoutPath, layoutContent);
        success(`Patched ${layoutPath} — wrapped {children} with <AuthProvider>`);
      } else {
        info(`${layoutPath} already has AuthProvider — skipping`);
      }
    }

  } else if (framework.name === 'hono') {
    // ─── Hono: route handler ─────────────────────────────────────────
    const routePath = 'src/auth.ts';
    if (!existsSync(routePath)) {
      mkdirSync(dirname(routePath), { recursive: true });
      writeFileSync(routePath, replaceVars(loadTemplate('route-hono.ts.tmpl'), vars));
      results.push(routePath);
      success(`Created ${routePath}`);
    }

    const nonSpaSetupMap: Record<string, string> = {
      sqlite: 'setup.ts.tmpl', pg: 'setup-pg.ts.tmpl', mysql: 'setup-mysql.ts.tmpl',
      turso: 'setup-turso.ts.tmpl', d1: 'setup-d1.ts.tmpl',
    };

    const setupPath = 'src/lib/corral.ts';
    if (!existsSync(setupPath)) {
      mkdirSync(dirname(setupPath), { recursive: true });
      writeFileSync(setupPath, replaceVars(loadTemplate(nonSpaSetupMap[db] || 'setup.ts.tmpl'), vars));
      results.push(setupPath);
      success(`Created ${setupPath} (${db})`);
    }

  } else {
    // ─── Express / unknown: standalone server ────────────────────────
    const nonSpaSetupMap: Record<string, string> = {
      sqlite: 'setup.ts.tmpl', pg: 'setup-pg.ts.tmpl', mysql: 'setup-mysql.ts.tmpl',
      turso: 'setup-turso.ts.tmpl', d1: 'setup-d1.ts.tmpl',
    };

    const setupPath = 'src/lib/corral.ts';
    if (!existsSync(setupPath)) {
      mkdirSync(dirname(setupPath), { recursive: true });
      writeFileSync(setupPath, replaceVars(loadTemplate(nonSpaSetupMap[db] || 'setup.ts.tmpl'), vars));
      results.push(setupPath);
      success(`Created ${setupPath} (${db})`);
    }
  }

  // Step 4b: Ensure tsconfig.json has @/* path alias (LEARNING from blind test)
  patchTsconfigPaths();

  // Step 5: Environment variables (LEARNING #3 + .env.local for Next.js)
  const envAdded = ensureEnvVars(authServerPort, framework.name);

  // SPA or Python: also add CORS_ORIGIN, CORRAL_PORT, and DB-specific env vars
  if (framework.isSPA || framework.isPython) {
    const envFile = '.env';
    const existing = existsSync(envFile) ? readFileSync(envFile, 'utf-8') : '';
    const spaAdditions: string[] = [];
    if (!existing.includes('CORS_ORIGIN')) spaAdditions.push(`CORS_ORIGIN=http://localhost:${framework.port}`);
    if (!existing.includes('CORRAL_PORT')) spaAdditions.push(`CORRAL_PORT=${authServerPort}`);

    // Database-specific env vars
    if (db === 'pg' && !existing.includes('DATABASE_URL')) {
      spaAdditions.push(`# DATABASE_URL=postgresql://user:pass@host:5432/dbname`);
      spaAdditions.push(`# Railway: auto-sets DATABASE_URL`);
      spaAdditions.push(`# Fly.io:  fly postgres attach`);
      spaAdditions.push(`# Neon:    copy from dashboard (add ?sslmode=require)`);
      spaAdditions.push(`DATABASE_URL=postgresql://localhost:5432/corral`);
    }
    if (db === 'mysql' && !existing.includes('DATABASE_URL')) {
      spaAdditions.push(`DATABASE_URL=mysql://root:@localhost:3306/corral`);
    }
    if (db === 'turso' && !existing.includes('TURSO_URL')) {
      spaAdditions.push(`# Get from: turso db show <name> --url`);
      spaAdditions.push(`TURSO_URL=file:./corral.db`);
      spaAdditions.push(`# Get from: turso db tokens create <name>`);
      spaAdditions.push(`# TURSO_AUTH_TOKEN=your-token`);
    }

    if (spaAdditions.length > 0) {
      appendFileSync(envFile, `\n# Corral SPA Settings\n${spaAdditions.join('\n')}\n`);
      success(`Added SPA env vars for ${db}`);
    }
  }

  // Step 6: Check for rewrite/proxy conflicts
  if (framework.name === 'nextjs') {
    const hasConflict = checkAndFixRewrites(framework);
    if (hasConflict) warnings.push('Next.js rewrite conflict detected — see above');
  }
  if (framework.isSPA) {
    const hasProxyConflict = checkViteProxy(framework);
    if (hasProxyConflict) warnings.push('Vite proxy may intercept /api/auth — see above');
  }

  // Step 7: Ensure .gitignore covers sensitive files
  ensureGitignore('.env');
  ensureGitignore('.env.local');
  ensureGitignore('corral.db');
  ensureGitignore('*.db');

  // Step 8: Install dependencies (LEARNING #4)
  if (opts.install !== false) {
    installDeps(framework.name, db);
    // SPA needs extra server deps based on chosen framework
    if (framework.isSPA) {
      const serverDepsMap: Record<string, { deps: string[]; devDeps: string[] }> = {
        express: {
          deps: ['express', 'cors'],
          devDeps: ['@types/express', '@types/cors', 'tsx', 'concurrently'],
        },
        hono: {
          deps: ['hono', '@hono/node-server'],
          devDeps: ['tsx', 'concurrently'],
        },
        fastify: {
          deps: ['fastify', '@fastify/cors'],
          devDeps: ['tsx', 'concurrently'],
        },
      };
      // Determine which server was chosen (read back from the generated file)
      let sChoice = 'express';
      try {
        const serverContent = readFileSync('server/auth.ts', 'utf-8');
        if (serverContent.includes('hono')) sChoice = 'hono';
        else if (serverContent.includes('fastify') || serverContent.includes('Fastify')) sChoice = 'fastify';
      } catch {}
      const sd = serverDepsMap[sChoice] || serverDepsMap['express'];
      try {
        info(`Installing ${sChoice} auth server deps...`);
        execSync(`npm install ${sd.deps.join(' ')}`, { stdio: 'pipe' });
        execSync(`npm install --save-dev ${sd.devDeps.join(' ')}`, { stdio: 'pipe' });
        success(`Auth server dependencies installed (${sChoice})`);
      } catch {
        warn(`Auto-install failed. Run: npm install ${sd.deps.join(' ')} && npm install -D ${sd.devDeps.join(' ')}`);
      }
    }
  }

  // Step 9: Agent discovery breadcrumbs
  injectAgentBreadcrumbs(opts.config);

  // Breadcrumb summary
  console.log('');
  console.log(chalk.bold('📖 Agent discovery:'));
  console.log(`   ${chalk.cyan('•')} CORRAL.md — project-specific guide (share with your agent)`);
  console.log(`   ${chalk.cyan('•')} corral.yaml — edit plans, features, auth here`);
  console.log(`   ${chalk.cyan('•')} llms.txt — https://docs.llamafarm.dev/corral/llms.txt`);

  // JSON output for agents
  if (jsonOutput({
    framework: framework.name,
    isSPA: framework.isSPA,
    port: framework.port,
    authServerPort,
    database: db,
    files: results,
    envVars: envAdded,
    warnings,
    appName,
    appId,
    monorepo: existingServer ? {
      serverPath: existingServer.path,
      serverFramework: existingServer.framework,
      entryFile: existingServer.entryFile,
    } : null,
  }, !!opts.json)) return;

  // Human-friendly next steps
  console.log('');
  if (warnings.length > 0) {
    console.log(chalk.yellow.bold('⚠️  Fix these issues first:'));
    warnings.forEach(w => console.log(`   ${chalk.yellow('•')} ${w}`));
    console.log('');
  }
  console.log(chalk.bold('Next steps:'));
  if (framework.isPython) {
    console.log(`  1. Install auth server deps: ${chalk.cyan('cd server && npm install')}`);
    console.log(`  2. Start auth server: ${chalk.cyan('cd server && npm run dev')}`);
    console.log(`  3. Start your ${framework.name} app normally`);
    console.log(`  4. Add ${chalk.cyan('Depends(get_current_user)')} to your protected routes`);
    console.log(`  5. Configure reverse proxy (nginx/caddy) to route /api/auth → auth server`);
    console.log(`  6. Edit ${chalk.cyan('corral.yaml')} with your plans and branding`);
  } else if (framework.isSPA && existingServer) {
    console.log(`  1. Edit ${chalk.cyan('corral.yaml')} with your plans, meters, and branding`);
    console.log(`  2. Review ${chalk.cyan(existingServer.entryFile)} — uncomment the Corral auth mount`);
    console.log(`  3. Start your existing server (auth is now part of it)`);
    console.log(`  4. Start your frontend: ${chalk.cyan('npm run dev')}`);
    console.log(`  5. Run ${chalk.cyan('corral doctor')} to verify setup`);
    console.log(`  6. Run ${chalk.cyan('corral stripe sync')} to sync plans to Stripe`);
    console.log('');
    console.log(chalk.bold('  New UI components generated:'));
    console.log(`    ${chalk.cyan('•')} src/components/AdminPanel.tsx — admin user management`);
    console.log(`    ${chalk.cyan('•')} src/components/ProfilePage.tsx — profile + billing`);
    console.log(`    ${chalk.cyan('•')} src/components/AccountMenu.tsx — nav dropdown`);
    console.log(`    ${chalk.cyan('•')} src/corral-styles.css — import in your app`);
  } else if (framework.isSPA) {
    console.log(`  1. Edit ${chalk.cyan('corral.yaml')} with your plans, meters, and branding`);
    console.log(`  2. Start auth server: ${chalk.cyan('npm run dev:auth')}`);
    console.log(`  3. Start your app: ${chalk.cyan('npm run dev')} (or ${chalk.cyan('npm run dev:all')} for both)`);
    console.log(`  4. Run ${chalk.cyan('corral doctor')} to verify setup`);
    console.log(`  5. Run ${chalk.cyan('corral stripe sync')} to sync plans to Stripe`);
    console.log('');
    console.log(chalk.bold('  New UI components generated:'));
    console.log(`    ${chalk.cyan('•')} src/components/AdminPanel.tsx — admin user management`);
    console.log(`    ${chalk.cyan('•')} src/components/ProfilePage.tsx — profile + billing`);
    console.log(`    ${chalk.cyan('•')} src/components/AccountMenu.tsx — nav dropdown`);
    console.log(`    ${chalk.cyan('•')} src/corral-styles.css — import in your app`);
  } else {
    console.log(`  1. Edit ${chalk.cyan('corral.yaml')} with your plans, meters, and branding`);
    console.log(`  2. Run ${chalk.cyan('corral doctor')} to verify setup`);
    console.log(`  3. Run ${chalk.cyan('corral dev')} to start with auth + seeded users`);
    console.log(`  4. Run ${chalk.cyan('corral stripe sync')} to sync plans to Stripe`);
  }
  if (framework.name === 'nextjs' && framework.hasRewrites) {
    console.log(`\n  ${chalk.yellow('!')} Don't forget to fix your next.config.js rewrites (see warning above)`);
  }
  console.log('');
}
