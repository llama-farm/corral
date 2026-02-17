import { readFileSync, writeFileSync, existsSync, mkdirSync, appendFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import { randomBytes } from 'crypto';
import chalk from 'chalk';
import { success, info, warn, jsonOutput } from '../util.js';

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

  const vars = {
    APP_NAME: appName,
    APP_ID: appId,
    DB_ADAPTER: db,
    DB_URL: dbUrlDefaults[db] || dbUrlDefaults['sqlite'],
    DB_PATH: db === 'sqlite' ? './corral.db' : dbUrlDefaults[db] || '',
    PORT: String(authServerPort),
    APP_ID_UPPER: appId.toUpperCase().replace(/-/g, '_'),
  };
  const results: string[] = [];
  const warnings: string[] = [];

  console.log(chalk.bold(`\n🤠 Corral init — ${appName}\n`));
  info(`Framework: ${framework.name} (port ${framework.port})`);
  if (framework.isPython) {
    info(`Architecture: Python backend — will generate auth middleware + standalone auth server`);
    info(`Auth server port: ${authServerPort}`);
    info(`Python backend port: ${framework.port}`);
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

  // Step 3 & 4: Generate server files (architecture-dependent)
  if (framework.isSPA) {
    // ─── SPA: standalone auth server in server/ directory ────────────
    // Pick server framework: --server flag, or detect from existing deps, or default to express
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
        // Also add a combined dev script if they have a plain 'dev'
        if (pkg.scripts['dev'] && !pkg.scripts['dev:all']) {
          pkg.scripts['dev:all'] = `concurrently "npm run dev" "npm run dev:auth"`;
          info('Added dev:all script (install concurrently: npm i -D concurrently)');
        }
        writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
        success('Added dev:auth script to package.json');
      }
    } catch {}

    // ─── Frontend files: auth-context.tsx + gates.tsx ─────────────────
    // Detect src directory
    const srcDir = existsSync('src') ? 'src' : '.';

    const authContextPath = join(srcDir, 'auth-context.tsx');
    if (!existsSync(authContextPath)) {
      writeFileSync(authContextPath, replaceVars(loadTemplate('auth-context.tsx.tmpl'), vars));
      results.push(authContextPath);
      success(`Created ${authContextPath} (React auth provider + useAuth hook)`);
    }

    const gatesPath = join(srcDir, 'gates.tsx');
    if (!existsSync(gatesPath)) {
      writeFileSync(gatesPath, replaceVars(loadTemplate('gates.tsx.tmpl'), vars));
      results.push(gatesPath);
      success(`Created ${gatesPath} (AuthGate, PlanGate, BlurGate components)`);
    }

    // ─── SQL reference file (dialect-specific) ────────────────────────
    const sqlTemplateMap: Record<string, string> = {
      sqlite: 'corral-tables.sql.tmpl',
      pg: 'corral-tables-pg.sql.tmpl',
      mysql: 'corral-tables.sql.tmpl',  // MySQL bootstrap is in the setup file
      turso: 'corral-tables.sql.tmpl',  // Turso uses SQLite syntax
      d1: 'corral-tables.sql.tmpl',     // D1 uses SQLite syntax
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

    // ─── LEARNING #6: Auto-patch vite.config.ts with /api proxy ─────
    for (const viteConfig of ['vite.config.ts', 'vite.config.js', 'vite.config.mjs']) {
      if (!existsSync(viteConfig)) continue;
      let content = readFileSync(viteConfig, 'utf-8');

      // Skip if proxy already configured
      if (content.includes("'/api'") || content.includes('"/api"') || content.includes("proxy")) {
        info(`${viteConfig} already has proxy config — skipping auto-patch`);
        break;
      }

      // Try to inject proxy into existing server block
      if (content.includes('server:') || content.includes('server :')) {
        // Has server block — add proxy inside it
        const serverMatch = content.match(/(server\s*:\s*\{)/);
        if (serverMatch) {
          const proxyBlock = `\n    proxy: {\n      '/api': {\n        target: 'http://localhost:${authServerPort}',\n        changeOrigin: true,\n      },\n    },`;
          content = content.replace(serverMatch[1], serverMatch[1] + proxyBlock);
          writeFileSync(viteConfig, content);
          success(`Auto-patched ${viteConfig} — added /api proxy to localhost:${authServerPort}`);
          break;
        }
      }

      // No server block — inject before closing defineConfig paren
      const configMatch = content.match(/(defineConfig\(\{[\s\S]*?)(}\s*\))/);
      if (configMatch) {
        const proxyConfig = `  server: {\n    proxy: {\n      '/api': {\n        target: 'http://localhost:${authServerPort}',\n        changeOrigin: true,\n      },\n    },\n  },\n`;
        content = content.replace(configMatch[2], proxyConfig + configMatch[2]);
        writeFileSync(viteConfig, content);
        success(`Auto-patched ${viteConfig} — added server.proxy for /api → localhost:${authServerPort}`);
        break;
      }

      // Couldn't auto-patch — give instructions
      info(`\n💡 Add this to your ${viteConfig} for seamless dev auth:\n`);
      console.log(chalk.cyan(`   server: {\n     proxy: {\n       '/api': {\n         target: 'http://localhost:${authServerPort}',\n         changeOrigin: true,\n       },\n     },\n   }`));
      console.log('');
      break;
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
  } else if (framework.isSPA) {
    console.log(`  1. Edit ${chalk.cyan('corral.yaml')} with your plans, meters, and branding`);
    console.log(`  2. Start auth server: ${chalk.cyan('npm run dev:auth')}`);
    console.log(`  3. Start your app: ${chalk.cyan('npm run dev')} (or ${chalk.cyan('npm run dev:all')} for both)`);
    console.log(`  4. Run ${chalk.cyan('corral doctor')} to verify setup`);
    console.log(`  5. Run ${chalk.cyan('corral stripe sync')} to sync plans to Stripe`);
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
