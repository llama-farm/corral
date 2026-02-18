import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

type Db = 'sqlite' | 'pg';

type Combo = {
  name: string;
  setup: (cwd: string) => void;
  runCwd?: (root: string) => string;
  verify: (ctx: { cwd: string; root: string; output: InitJson; db: Db }) => void;
};

type InitJson = {
  framework: string;
  isSPA: boolean;
  port: number;
  authServerPort: number;
  database: string;
  files: string[];
  envVars: string[];
  warnings: string[];
  appName: string;
  appId: string;
  monorepo: null | {
    serverPath: string;
    serverFramework: string;
    entryFile: string;
  };
};

type CaseResult = {
  caseName: string;
  db: Db;
  ok: boolean;
  error?: string;
};

const CLI_DIST = resolve(process.cwd(), 'dist/index.js');

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function writeJson(path: string, value: unknown) {
  writeFileSync(path, JSON.stringify(value, null, 2));
}

function parseInitJson(stdout: string): InitJson {
  const end = stdout.lastIndexOf('}');
  if (end === -1) throw new Error(`Could not find JSON output. Raw stdout:\n${stdout}`);

  let depth = 0;
  let start = -1;
  for (let i = end; i >= 0; i--) {
    const ch = stdout[i];
    if (ch === '}') depth++;
    if (ch === '{') {
      depth--;
      if (depth === 0) {
        start = i;
        break;
      }
    }
  }

  if (start === -1) throw new Error(`Could not parse JSON bounds. Raw stdout:\n${stdout}`);

  const jsonText = stdout.slice(start, end + 1);
  try {
    return JSON.parse(jsonText) as InitJson;
  } catch {
    throw new Error(`Failed to parse JSON payload. Raw stdout:\n${stdout}`);
  }
}

function runInit(cwd: string, db: Db) {
  const args = [CLI_DIST, 'init', '--json', '--no-install'];
  if (db === 'pg') args.push('--db', 'pg');

  const result = spawnSync('node', args, {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, FORCE_COLOR: '0' },
  });

  const stdout = result.stdout ?? '';
  const stderr = result.stderr ?? '';

  assert(result.status === 0, `Expected exit code 0, got ${result.status}\nSTDOUT:\n${stdout}\nSTDERR:\n${stderr}`);
  assert(!/\b(error|ERR!)\b/i.test(stderr), `Unexpected error output on stderr:\n${stderr}`);

  const output = parseInitJson(stdout);
  assert(output.database === db, `Expected database=${db}, got ${output.database}`);
  assert(Array.isArray(output.files), 'Expected output.files to be an array');

  return { output, stdout, stderr };
}

function expectBaseArtifacts(cwd: string, output: InitJson) {
  assert(existsSync(join(cwd, 'corral.yaml')), 'Missing corral.yaml');
  assert(existsSync(join(cwd, 'CORRAL.md')), 'Missing CORRAL.md');
  assert(existsSync(join(cwd, '.corral/agent-checklist.json')), 'Missing .corral/agent-checklist.json');
  assert(output.files.includes('corral.yaml'), 'JSON files missing corral.yaml');
  assert(output.files.includes('CORRAL.md'), 'JSON files missing CORRAL.md');
}

const combos: Combo[] = [
  {
    name: 'Express + React',
    setup: (cwd) => {
      mkdirSync(join(cwd, 'src'), { recursive: true });
      writeJson(join(cwd, 'package.json'), {
        name: 'express-react-app',
        type: 'module',
        scripts: { dev: 'node src/index.ts' },
        dependencies: { express: '^4.0.0', react: '^18.0.0' },
      });
      writeFileSync(
        join(cwd, 'src/index.ts'),
        "import express from 'express';\nconst app = express();\napp.listen(3000);\n",
      );
    },
    verify: ({ cwd, output }) => {
      assert(output.framework === 'express', `Expected framework express, got ${output.framework}`);
      assert(existsSync(join(cwd, 'src/lib/corral.ts')), 'Missing src/lib/corral.ts');
      assert(existsSync(join(cwd, 'src/auth-context.tsx')), 'Missing src/auth-context.tsx');
      assert(existsSync(join(cwd, 'src/gates.tsx')), 'Missing src/gates.tsx');
      const server = readFileSync(join(cwd, 'src/index.ts'), 'utf8');
      assert(server.includes('Corral Auth (added by corral init)'), 'Expected src/index.ts to be patched');
    },
  },
  {
    name: 'Next.js',
    setup: (cwd) => {
      writeJson(join(cwd, 'package.json'), {
        name: 'next-app',
        type: 'module',
        dependencies: { next: '^15.0.0', react: '^18.0.0' },
      });
      mkdirSync(join(cwd, 'app'), { recursive: true });
      writeFileSync(join(cwd, 'app/layout.tsx'), 'export default function Layout({ children }: any) { return <html><body>{children}</body></html>; }\n');
    },
    verify: ({ cwd, output }) => {
      assert(output.framework === 'nextjs', `Expected framework nextjs, got ${output.framework}`);
      assert(existsSync(join(cwd, 'app/api/auth/[...all]/route.ts')), 'Missing Next auth route');
      assert(existsSync(join(cwd, 'lib/corral.ts')), 'Missing lib/corral.ts');
    },
  },
  {
    name: 'Hono',
    setup: (cwd) => {
      mkdirSync(join(cwd, 'src'), { recursive: true });
      writeJson(join(cwd, 'package.json'), {
        name: 'hono-app',
        type: 'module',
        scripts: { dev: 'node src/index.ts' },
        dependencies: { hono: '^4.0.0' },
      });
      writeFileSync(join(cwd, 'src/index.ts'), "import { Hono } from 'hono';\nconst app = new Hono();\n");
    },
    verify: ({ cwd, output }) => {
      assert(output.framework === 'hono', `Expected framework hono, got ${output.framework}`);
      assert(existsSync(join(cwd, 'src/auth.ts')), 'Missing src/auth.ts');
      assert(existsSync(join(cwd, 'src/lib/corral.ts')), 'Missing src/lib/corral.ts');
    },
  },
  {
    name: 'Vite + React (SPA)',
    setup: (cwd) => {
      mkdirSync(join(cwd, 'src'), { recursive: true });
      writeJson(join(cwd, 'package.json'), {
        name: 'vite-react-app',
        type: 'module',
        dependencies: { vite: '^5.0.0', react: '^18.0.0' },
      });
      writeFileSync(join(cwd, 'src/main.tsx'), 'export {}\n');
      writeFileSync(join(cwd, 'vite.config.ts'), "import { defineConfig } from 'vite';\nexport default defineConfig({});\n");
    },
    verify: ({ cwd, output }) => {
      assert(output.framework === 'vite-react', `Expected framework vite-react, got ${output.framework}`);
      assert(output.isSPA === true, 'Expected SPA=true');
      assert(existsSync(join(cwd, 'server/auth.ts')), 'Missing server/auth.ts');
      assert(existsSync(join(cwd, 'server/corral.ts')), 'Missing server/corral.ts');
      const viteConfig = readFileSync(join(cwd, 'vite.config.ts'), 'utf8');
      assert(viteConfig.includes("'/api'"), 'Expected vite.config.ts to be patched with /api proxy');
    },
  },
  {
    name: 'Express only (no React)',
    setup: (cwd) => {
      mkdirSync(join(cwd, 'src'), { recursive: true });
      writeJson(join(cwd, 'package.json'), {
        name: 'express-only-app',
        type: 'module',
        dependencies: { express: '^4.0.0' },
      });
      writeFileSync(join(cwd, 'src/index.ts'), "import express from 'express';\nconst app = express();\napp.listen(3000);\n");
    },
    verify: ({ cwd, output }) => {
      assert(output.framework === 'express', `Expected framework express, got ${output.framework}`);
      assert(existsSync(join(cwd, 'src/lib/corral.ts')), 'Missing src/lib/corral.ts');
      assert(existsSync(join(cwd, 'src/corral-admin-routes.ts')), 'Missing src/corral-admin-routes.ts');
      assert(!existsSync(join(cwd, 'src/auth-context.tsx')), 'Did not expect src/auth-context.tsx for express-only');
    },
  },
  {
    name: 'FastAPI (Python)',
    setup: (cwd) => {
      writeFileSync(
        join(cwd, 'pyproject.toml'),
        `[project]\nname = "fastapi-app"\nversion = "0.1.0"\ndependencies = ["fastapi>=0.110.0"]\n`,
      );
    },
    verify: ({ cwd, output }) => {
      assert(output.framework === 'fastapi', `Expected framework fastapi, got ${output.framework}`);
      assert(existsSync(join(cwd, 'middleware/corral.py')), 'Missing middleware/corral.py');
      assert(existsSync(join(cwd, 'server/auth.ts')), 'Missing server/auth.ts');
      assert(existsSync(join(cwd, 'server/corral.ts')), 'Missing server/corral.ts');
    },
  },
  {
    name: 'Fastify + React',
    setup: (cwd) => {
      mkdirSync(join(cwd, 'src'), { recursive: true });
      writeJson(join(cwd, 'package.json'), {
        name: 'fastify-react-app',
        type: 'module',
        dependencies: { fastify: '^5.0.0', react: '^18.0.0' },
      });
      writeFileSync(
        join(cwd, 'src/index.ts'),
        "import Fastify from 'fastify';\nconst app = Fastify();\napp.listen({ port: 3000 });\n",
      );
    },
    verify: ({ cwd, output }) => {
      assert(output.framework === 'express', `Expected framework express (server framework fastify), got ${output.framework}`);
      assert(existsSync(join(cwd, 'src/lib/corral.ts')), 'Missing src/lib/corral.ts');
      const server = readFileSync(join(cwd, 'src/index.ts'), 'utf8');
      assert(server.includes('Corral Auth (added by corral init)'), 'Expected src/index.ts to be patched');
    },
  },
  {
    name: 'Monorepo SPA',
    setup: (cwd) => {
      const frontend = join(cwd, 'frontend');
      const server = join(cwd, 'server');
      mkdirSync(join(frontend, 'src'), { recursive: true });
      mkdirSync(join(server, 'src'), { recursive: true });

      writeJson(join(frontend, 'package.json'), {
        name: 'frontend',
        type: 'module',
        dependencies: { vite: '^5.0.0', react: '^18.0.0' },
      });
      writeFileSync(join(frontend, 'src/main.tsx'), 'export {}\n');
      writeFileSync(join(frontend, 'vite.config.ts'), "import { defineConfig } from 'vite';\nexport default defineConfig({});\n");

      writeJson(join(server, 'package.json'), {
        name: 'server',
        type: 'module',
        dependencies: { express: '^4.0.0' },
      });
      writeFileSync(join(server, 'src/index.ts'), "import express from 'express';\nconst app = express();\napp.listen(4000);\n");
    },
    runCwd: (root) => join(root, 'frontend'),
    verify: ({ cwd, root, output }) => {
      assert(output.framework === 'vite-react', `Expected framework vite-react, got ${output.framework}`);
      assert(output.monorepo?.serverPath === '../server', `Expected monorepo serverPath ../server, got ${output.monorepo?.serverPath}`);
      assert(existsSync(join(root, 'server/src/corral.ts')), 'Expected server/src/corral.ts in sibling server');
      const serverEntry = readFileSync(join(root, 'server/src/index.ts'), 'utf8');
      assert(serverEntry.includes('Corral Auth (added by corral init)'), 'Expected sibling server entry to be patched');
      assert(existsSync(join(cwd, 'src/auth-context.tsx')), 'Expected frontend auth-context');
      assert(!existsSync(join(cwd, 'server/auth.ts')), 'Did not expect standalone frontend/server/auth.ts in monorepo mode');
    },
  },
];

function runCase(combo: Combo, db: Db): CaseResult {
  const root = mkdtempSync(join(tmpdir(), 'corral-e2e-'));
  try {
    combo.setup(root);
    const cwd = combo.runCwd ? combo.runCwd(root) : root;
    const { output } = runInit(cwd, db);

    expectBaseArtifacts(cwd, output);
    combo.verify({ cwd, root, output, db });

    return { caseName: combo.name, db, ok: true };
  } catch (error) {
    return {
      caseName: combo.name,
      db,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function printSummary(results: CaseResult[]) {
  const lines = [
    '',
    'E2E Summary',
    '-----------',
    ...results.map((r) => `${r.ok ? 'PASS' : 'FAIL'} | ${r.caseName} | db=${r.db}${r.error ? `\n  ${r.error}` : ''}`),
    '',
  ];
  console.log(lines.join('\n'));
}

const results: CaseResult[] = [];
for (const combo of combos) {
  results.push(runCase(combo, 'sqlite'));
  results.push(runCase(combo, 'pg'));
}

printSummary(results);

if (results.some((r) => !r.ok)) {
  process.exit(1);
}
