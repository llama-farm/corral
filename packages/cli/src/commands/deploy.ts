import { existsSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { randomBytes } from 'crypto';
import { detectFramework } from './init.js';
import { info, success, renderTemplate, warn } from '../util.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

type DeployTarget = 'docker' | 'fly' | 'railway' | 'render';
type BackendLang = 'python' | 'node' | 'go' | 'rust' | 'ruby';

function loadDockerTemplate(name: string): string {
  const paths = [
    join(__dirname, '..', 'src', 'templates', 'docker', name),
    join(__dirname, 'templates', 'docker', name),
    join(__dirname, '..', 'templates', 'docker', name),
  ];
  for (const p of paths) {
    if (existsSync(p)) return readFileSync(p, 'utf-8');
  }
  throw new Error(`Template not found: docker/${name}`);
}

function detectBackendLang(): BackendLang {
  const framework = detectFramework();
  if (framework.isPython || existsSync('pyproject.toml') || existsSync('requirements.txt')) return 'python';
  if (existsSync('go.mod')) return 'go';
  if (existsSync('Cargo.toml')) return 'rust';
  if (existsSync('Gemfile')) return 'ruby';
  return 'node';
}

function detectBackendSrc(lang: BackendLang): string {
  if (lang === 'node') return existsSync('src') ? 'src' : '.';
  if (existsSync('app')) return 'app';
  if (existsSync('src')) return 'src';
  return '.';
}

function detectGoMain(): string {
  if (existsSync('cmd/server/main.go')) return './cmd/server';
  if (existsSync('cmd/api/main.go')) return './cmd/api';
  if (existsSync('main.go')) return '.';
  return './cmd/server';
}

function detectRustBin(appName: string): string {
  if (!existsSync('Cargo.toml')) return appName;
  const cargo = readFileSync('Cargo.toml', 'utf-8');
  const binMatch = cargo.match(/\[\[bin\]\][\s\S]*?name\s*=\s*"([^"]+)"/);
  if (binMatch) return binMatch[1];
  const pkgMatch = cargo.match(/\[package\][\s\S]*?name\s*=\s*"([^"]+)"/);
  if (pkgMatch) return pkgMatch[1];
  return appName;
}

function detectPythonModule(): string {
  if (existsSync('app/main.py')) return 'app.main';
  if (existsSync('src/main.py')) return 'src.main';
  if (existsSync('main.py')) return 'main';
  if (existsSync('app.py')) return 'app';
  return 'main';
}

function detectRubyCmd(): string {
  if (!existsSync('Gemfile')) return 'puma -C config/puma.rb';
  const gemfile = readFileSync('Gemfile', 'utf-8');
  if (/gem\s+['"]rails['"]/.test(gemfile)) return 'rails server -b 0.0.0.0 -p ${PORT:-8000}';
  if (/gem\s+['"]puma['"]/.test(gemfile)) return 'puma -C config/puma.rb';
  return 'puma -C config/puma.rb';
}

function buildVars(region?: string): Record<string, string | boolean> {
  const framework = detectFramework();
  const appName = process.env.APP_NAME || process.cwd().split('/').pop() || 'my-app';
  const backendLang = detectBackendLang();

  return {
    APP_NAME: appName,
    BACKEND_LANG: backendLang,
    BACKEND_SRC: detectBackendSrc(backendLang),
    SERVER_NAME: process.env.SERVER_NAME || appName || '_',
    FLY_REGION: region || process.env.FLY_REGION || 'iad',
    CORRAL_SECRET: process.env.CORRAL_SECRET || process.env.BETTER_AUTH_SECRET || randomBytes(32).toString('hex'),
    GO_MAIN: detectGoMain(),
    RUST_BIN: detectRustBin(appName),
    PYTHON_MODULE: detectPythonModule(),
    RUBY_CMD: detectRubyCmd(),
    FRAMEWORK: framework.name,
    if_python: backendLang === 'python',
    if_go: backendLang === 'go',
    if_rust: backendLang === 'rust',
    if_ruby: backendLang === 'ruby',
    if_node: backendLang === 'node',
  };
}

function generateFiles(target: DeployTarget, vars: Record<string, string | boolean>) {
  const plan: Record<DeployTarget, Array<{ src: string; out: string }>> = {
    docker: [
      { src: 'Dockerfile.tmpl', out: 'Dockerfile' },
      { src: 'docker-compose.yml.tmpl', out: 'docker-compose.yml' },
      { src: 'nginx.conf.tmpl', out: 'nginx.conf' },
      { src: 'supervisord.conf.tmpl', out: 'supervisord.conf' },
    ],
    fly: [
      { src: 'fly.toml.tmpl', out: 'fly.toml' },
      { src: 'Dockerfile.tmpl', out: 'Dockerfile' },
    ],
    railway: [
      { src: 'railway.json.tmpl', out: 'railway.json' },
      { src: 'Dockerfile.tmpl', out: 'Dockerfile' },
    ],
    render: [
      { src: 'render.yaml.tmpl', out: 'render.yaml' },
      { src: 'Dockerfile.tmpl', out: 'Dockerfile' },
    ],
  };

  for (const file of plan[target]) {
    const content = renderTemplate(loadDockerTemplate(file.src), vars);
    writeFileSync(file.out, content);
    success(`Created ${file.out}`);
  }
}

function printNextSteps(target: DeployTarget) {
  console.log('');
  if (target === 'docker') {
    info('Next steps:');
    console.log('  1) docker compose up --build');
    console.log('  2) Verify app at http://localhost:8000');
  }
  if (target === 'fly') {
    info('Next steps:');
    console.log('  1) fly launch --no-deploy');
    console.log('  2) fly volumes create corral_data --size 1');
    console.log('  3) fly deploy');
  }
  if (target === 'railway') {
    info('Next steps:');
    console.log('  1) railway up');
    console.log('  2) Set CORRAL_SECRET and other env vars in Railway');
  }
  if (target === 'render') {
    info('Next steps:');
    console.log('  1) Commit Dockerfile + render.yaml');
    console.log('  2) Create a Render Web Service from this repo');
    console.log('  3) Set CORRAL_SECRET env var in Render dashboard');
  }
}

export async function deployCommand(target: DeployTarget, opts: { region?: string } = {}) {
  try {
    const vars = buildVars(opts.region);
    generateFiles(target, vars);
    printNextSteps(target);
  } catch (e: any) {
    warn(`Deploy scaffold failed: ${e.message}`);
    throw e;
  }
}
