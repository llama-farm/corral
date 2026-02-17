import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { parse, stringify } from 'yaml';
import { Command, type OptionValues } from 'commander';
import chalk from 'chalk';
import { success, info, warn, error, jsonOutput } from '../util.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

function replaceVars(tmpl: string, vars: Record<string, string>): string {
  let result = tmpl;
  for (const [k, v] of Object.entries(vars)) {
    result = result.replaceAll(`{{${k}}}`, v);
  }
  return result;
}

function readConfig(configPath: string): Record<string, any> {
  if (!existsSync(configPath)) {
    throw new Error(`${configPath} not found. Run: corral init`);
  }
  return parse(readFileSync(configPath, 'utf-8')) || {};
}

function writeConfig(configPath: string, config: Record<string, any>, dryRun: boolean): void {
  const out = stringify(config, { lineWidth: 0 });
  if (dryRun) {
    console.log(chalk.dim('\n── dry-run: would write to ' + configPath + ' ──────────'));
    console.log(chalk.cyan(out));
    console.log(chalk.dim('─────────────────────────────────────────────────────\n'));
  } else {
    writeFileSync(configPath, out);
  }
}

/** Quick framework detection: corral.yaml first, then file structure. */
type FrameworkName = 'nextjs' | 'vite-react' | 'cra' | 'express' | 'hono' | 'unknown';

function detectFramework(config?: Record<string, any>): FrameworkName {
  // 1. corral.yaml has an explicit `framework` field
  if (config?.app?.framework) {
    const f = String(config.app.framework).toLowerCase();
    if (f.includes('next')) return 'nextjs';
    if (f.includes('vite') || f.includes('react')) return 'vite-react';
    if (f.includes('express')) return 'express';
    if (f.includes('hono')) return 'hono';
  }
  // 2. Auto-detect from filesystem
  try {
    const pkg = JSON.parse(readFileSync('package.json', 'utf-8'));
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    if (deps['next']) return 'nextjs';
    if (deps['vite'] && deps['react']) return 'vite-react';
    if (deps['react-scripts']) return 'cra';
    if (deps['hono']) return 'hono';
    if (deps['express']) return 'express';
  } catch {}
  // 3. Check for Next.js app/ dir
  if (existsSync('app') || existsSync('src/app')) return 'nextjs';
  return 'unknown';
}

/** Convert a kebab-case or path slug to PascalCase component name. */
function toPascalCase(s: string): string {
  return s
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join('');
}

/** Provider → required env var names. */
const PROVIDER_ENV_VARS: Record<string, string[]> = {
  google:    ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'],
  github:    ['GITHUB_CLIENT_ID', 'GITHUB_CLIENT_SECRET'],
  apple:     ['APPLE_CLIENT_ID', 'APPLE_CLIENT_SECRET'],
  discord:   ['DISCORD_CLIENT_ID', 'DISCORD_CLIENT_SECRET'],
  microsoft: ['MICROSOFT_CLIENT_ID', 'MICROSOFT_CLIENT_SECRET'],
  twitter:   ['TWITTER_CLIENT_ID', 'TWITTER_CLIENT_SECRET'],
  facebook:  ['FACEBOOK_CLIENT_ID', 'FACEBOOK_CLIENT_SECRET'],
  gitlab:    ['GITLAB_CLIENT_ID', 'GITLAB_CLIENT_SECRET'],
  linkedin:  ['LINKEDIN_CLIENT_ID', 'LINKEDIN_CLIENT_SECRET'],
};

const SUPPORTED_PROVIDERS = Object.keys(PROVIDER_ENV_VARS);

// ─── Command: add page ────────────────────────────────────────────────────────

async function addPageCommand(
  pagePath: string,
  opts: { gated?: string; name?: string; json?: boolean; config: string; dryRun?: boolean },
) {
  let config: Record<string, any> = {};
  try { config = readConfig(opts.config); } catch { warn('corral.yaml not found — proceeding with auto-detect'); }

  const framework = detectFramework(config);
  const rawName = opts.name || pagePath.split('/').filter(Boolean).pop() || 'Page';
  const componentName = toPascalCase(rawName);
  const results: string[] = [];

  console.log(chalk.bold(`\n📄 corral add page — ${pagePath}\n`));
  info(`Framework: ${framework}`);
  if (opts.gated) info(`Gated: ${chalk.cyan(opts.gated)} plan`);

  // Build the JSX body
  const bodyContent = opts.gated
    ? `      <PlanGate plan="${opts.gated}">\n        <div>\n          <h1>${componentName}</h1>\n          <p>This content is available on the ${opts.gated} plan.</p>\n        </div>\n      </PlanGate>`
    : `      <div>\n        <h1>${componentName}</h1>\n        <p>Welcome to ${componentName}.</p>\n      </div>`;

  const gateImport = opts.gated
    ? `import { PlanGate } from '@llamafarm/corral/ui';\n`
    : '';

  let outputPath: string;
  let fileContent: string;

  if (framework === 'nextjs') {
    // Next.js App Router — create app/<path>/page.tsx
    outputPath = join('app', pagePath, 'page.tsx');
    fileContent = `${gateImport ? '"use client";\n\n' : ''
}${gateImport}export default function ${componentName}Page() {
  return (
    <main>
${bodyContent}
    </main>
  );
}
`;
    info(`Next.js detected — creating ${chalk.cyan(outputPath)}`);
    info(`Route will be auto-registered at: /${pagePath}`);
  } else if (framework === 'vite-react' || framework === 'cra') {
    // React SPA — create src/pages/<Name>.tsx
    outputPath = join('src', 'pages', `${componentName}.tsx`);
    fileContent = `${opts.gated ? '"use client";\n\n' : ''}${gateImport}export function ${componentName}Page() {
  return (
    <main>
${bodyContent}
    </main>
  );
}

export default ${componentName}Page;
`;
    info(`React SPA detected — creating ${chalk.cyan(outputPath)}`);
    info(`Add to your router: ${chalk.cyan(`<Route path="/${pagePath}" element={<${componentName}Page />} />`)}`);
  } else {
    // Unknown / Express — create src/pages/<Name>.tsx
    outputPath = join('src', 'pages', `${componentName}.tsx`);
    fileContent = `${gateImport}export function ${componentName}Page() {
  return (
    <main>
${bodyContent}
    </main>
  );
}

export default ${componentName}Page;
`;
    info(`Framework unknown — creating ${chalk.cyan(outputPath)}`);
    warn('Add this component to your router manually.');
  }

  if (!opts.dryRun) {
    mkdirSync(dirname(outputPath), { recursive: true });
    if (existsSync(outputPath)) {
      warn(`${outputPath} already exists — skipping`);
    } else {
      writeFileSync(outputPath, fileContent);
      results.push(outputPath);
      success(`Created ${outputPath}`);
    }
  } else {
    console.log(chalk.dim('\n── dry-run: would write to ' + outputPath + ' ──────────'));
    console.log(chalk.cyan(fileContent));
    console.log(chalk.dim('─────────────────────────────────────────────────────\n'));
  }

  if (opts.gated) {
    info(`Wrap more content: ${chalk.cyan(`<PlanGate plan="${opts.gated}">…</PlanGate>`)}`);
  }

  if (jsonOutput({ framework, outputPath, componentName, gated: opts.gated ?? null, files: results }, !!opts.json)) return;
}

// ─── Command: add feature ─────────────────────────────────────────────────────

async function addFeatureCommand(
  name: string,
  opts: { plan: string; description?: string; json?: boolean; config: string; dryRun?: boolean },
) {
  const config = readConfig(opts.config);

  console.log(chalk.bold(`\n⭐ corral add feature — ${name}\n`));

  // features is a dict: { featureName: [plan1, plan2] }
  if (!config.features) config.features = {};

  const plans = opts.plan.split(',').map(p => p.trim());

  if (config.features[name]) {
    warn(`Feature "${name}" already exists — overwriting`);
  }

  // Store as array of allowed plans
  config.features[name] = plans;

  writeConfig(opts.config, config, !!opts.dryRun);

  if (!opts.dryRun) {
    success(`Added feature "${name}" (plans: ${plans.join(', ')}) to ${opts.config}`);
  }
  if (opts.description) {
    info(`Description: ${opts.description}`);
    info(`(Hint: add a comment above the feature in corral.yaml for docs)`);
  }
  info(`Gate usage: ${chalk.cyan(`<FeatureGate feature="${name}">…</FeatureGate>`)}`);
  info(`Check code: ${chalk.cyan(`hasFeature(user, '${name}')`)}`);

  if (jsonOutput({ name, plans, description: opts.description, config: opts.config }, !!opts.json)) return;
}

// ─── Command: add meter ───────────────────────────────────────────────────────

async function addMeterCommand(
  name: string,
  opts: { limit: string; plan: string; period?: string; json?: boolean; config: string; dryRun?: boolean },
) {
  const config = readConfig(opts.config);
  const limit = parseInt(opts.limit, 10);

  if (isNaN(limit)) {
    error(`--limit must be a number, got: ${opts.limit}`);
    process.exit(1);
  }

  console.log(chalk.bold(`\n📊 corral add meter — ${name}\n`));

  if (!config.meters) config.meters = {};

  // Support key as object key (convert dashes to underscores for YAML keys)
  const meterKey = name.replace(/-/g, '_');

  if (config.meters[meterKey]) {
    warn(`Meter "${meterKey}" already exists — overwriting`);
  }

  const period = opts.period || 'monthly';
  const resetPeriod = period === 'daily' ? 'day' : 'month';

  config.meters[meterKey] = {
    label: name
      .split('-')
      .map(w => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' '),
    unit: 'requests',
    type: 'cap',
    reset_period: resetPeriod,
    limits: {
      [opts.plan]: limit,
    },
    warning_at: 0.8,
    nudge: {
      message: `You've used {{percent}}% of your ${name} limit`,
      cta: 'Upgrade',
    },
  };

  writeConfig(opts.config, config, !!opts.dryRun);

  if (!opts.dryRun) {
    success(`Added meter "${meterKey}" (limit: ${limit}/${resetPeriod} for plan: ${opts.plan}) to ${opts.config}`);
  }
  info(`Track usage: ${chalk.cyan(`corral.meter.increment('${name}', userId)`)}`);
  info(`Check limit: ${chalk.cyan(`corral.meter.check('${name}', userId)`)}`);

  if (jsonOutput({ name, meterKey, limit, plan: opts.plan, period: resetPeriod, config: opts.config }, !!opts.json)) return;
}

// ─── Command: add provider ────────────────────────────────────────────────────

async function addProviderCommand(
  providerName: string,
  opts: { json?: boolean; config: string; dryRun?: boolean },
) {
  const name = providerName.toLowerCase();

  if (!SUPPORTED_PROVIDERS.includes(name)) {
    error(`Unknown provider: ${name}`);
    info(`Supported: ${SUPPORTED_PROVIDERS.join(', ')}`);
    process.exit(1);
  }

  const config = readConfig(opts.config);

  console.log(chalk.bold(`\n🔑 corral add provider — ${name}\n`));

  // Ensure auth.social array exists
  if (!config.auth) config.auth = {};
  if (!config.auth.social) config.auth.social = [];

  if (Array.isArray(config.auth.social)) {
    if (config.auth.social.includes(name)) {
      warn(`Provider "${name}" already configured`);
    } else {
      config.auth.social.push(name);
    }
  } else {
    // auth.social is an object (legacy) — convert or add key
    config.auth.social[name] = true;
  }

  // Also set in auth.methods for Better Auth compatibility
  if (!config.auth.methods) config.auth.methods = {};
  config.auth.methods[name] = true;

  writeConfig(opts.config, config, !!opts.dryRun);

  if (!opts.dryRun) {
    success(`Added ${name} provider to ${opts.config}`);
  }

  const envVars = PROVIDER_ENV_VARS[name];
  console.log('');
  console.log(chalk.bold('Add to .env:'));
  for (const v of envVars) {
    console.log(`  ${chalk.green(v)}=${chalk.dim('xxx')}`);
  }
  console.log('');

  // Provider-specific setup instructions
  const providerUrls: Record<string, string> = {
    google:    'https://console.cloud.google.com/apis/credentials',
    github:    'https://github.com/settings/developers',
    apple:     'https://developer.apple.com/account/resources/authkeys/list',
    discord:   'https://discord.com/developers/applications',
    microsoft: 'https://portal.azure.com/#view/Microsoft_AAD_RegisteredApps',
    twitter:   'https://developer.twitter.com/en/portal/dashboard',
    facebook:  'https://developers.facebook.com/apps/',
    gitlab:    'https://gitlab.com/-/profile/applications',
    linkedin:  'https://www.linkedin.com/developers/apps',
  };
  if (providerUrls[name]) {
    info(`Get credentials: ${chalk.cyan(providerUrls[name])}`);
  }
  info(`Callback URL: ${chalk.cyan(`/api/auth/callback/${name}`)}`);

  if (jsonOutput({ provider: name, envVars, config: opts.config }, !!opts.json)) return;
}

// ─── Command: add plan ────────────────────────────────────────────────────────

async function addPlanCommand(
  name: string,
  opts: {
    price: string;
    features?: string;
    trial?: string;
    highlighted?: boolean;
    json?: boolean;
    config: string;
    dryRun?: boolean;
  },
) {
  const config = readConfig(opts.config);
  const price = parseFloat(opts.price);

  if (isNaN(price)) {
    error(`--price must be a number, got: ${opts.price}`);
    process.exit(1);
  }

  console.log(chalk.bold(`\n💳 corral add plan — ${name}\n`));

  if (!config.plans) config.plans = [];

  // Check if plan already exists
  const existing = config.plans.findIndex((p: any) => p.name?.toLowerCase() === name.toLowerCase());
  if (existing >= 0) {
    warn(`Plan "${name}" already exists — overwriting`);
    config.plans.splice(existing, 1);
  }

  const featuresList = opts.features
    ? opts.features.split(',').map((f: string) => f.trim())
    : [];

  const newPlan: Record<string, any> = {
    name,
    display_name: name.charAt(0).toUpperCase() + name.slice(1),
    price,
    interval: price === 0 ? undefined : 'month',
    stripe_price_id: '',
    features: featuresList.length > 0 ? featuresList : [`Everything in the ${name} plan`],
    cta: price === 0 ? 'Get Started' : 'Start Free Trial',
  };

  if (price === 0) delete newPlan.interval;
  if (opts.trial) newPlan.trial_days = parseInt(opts.trial, 10);
  if (opts.highlighted) newPlan.popular = true;

  config.plans.push(newPlan);

  writeConfig(opts.config, config, !!opts.dryRun);

  if (!opts.dryRun) {
    success(`Added plan "${name}" ($${price}/mo) to ${opts.config}`);
  }
  if (opts.trial) info(`Trial: ${opts.trial} days`);
  if (featuresList.length > 0) info(`Features: ${featuresList.join(', ')}`);
  info(`Sync to Stripe: ${chalk.cyan('corral stripe push')}`);

  if (jsonOutput({ name, price, features: featuresList, config: opts.config }, !!opts.json)) return;
}

// ─── Command: add admin-page ──────────────────────────────────────────────────

async function addAdminPageCommand(
  opts: { json?: boolean; config: string; dryRun?: boolean },
) {
  let config: Record<string, any> = {};
  try { config = readConfig(opts.config); } catch { warn('corral.yaml not found — proceeding with auto-detect'); }

  const framework = detectFramework(config);
  const appName = config?.app?.name || process.cwd().split('/').pop() || 'App';
  const results: string[] = [];

  console.log(chalk.bold(`\n🛡️  corral add admin-page\n`));
  info(`Framework: ${framework}`);

  let outputPath: string;
  let fileContent: string;

  if (framework === 'nextjs') {
    outputPath = 'app/admin/page.tsx';
    fileContent = `"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useCorral } from "@llamafarm/corral";
import { AdminDashboard } from "@llamafarm/corral-ui";

export default function AdminPage() {
  const { user, loading } = useCorral();
  const router = useRouter();

  useEffect(() => {
    if (!loading && (!user || (user as any).role !== "admin")) {
      router.replace("/");
    }
  }, [user, loading, router]);

  if (loading) return <div className="p-8 text-muted-foreground">Loading…</div>;
  if (!user || (user as any).role !== "admin") return null;

  return (
    <main className="min-h-screen bg-background">
      <AdminDashboard appName="${appName}" />
    </main>
  );
}
`;
    info(`Creating: ${chalk.cyan(outputPath)}`);
    info(`Route: ${chalk.cyan('/admin')}`);
    info(`Protected: redirects non-admins to /`);
  } else {
    // React SPA
    outputPath = 'src/pages/Admin.tsx';
    fileContent = `import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useCorral } from "@llamafarm/corral";
import { AdminDashboard } from "@llamafarm/corral-ui";

export function AdminPage() {
  const { user, loading } = useCorral();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && (!user || (user as any).role !== "admin")) {
      navigate("/");
    }
  }, [user, loading, navigate]);

  if (loading) return <div style={{ padding: "2rem", color: "#888" }}>Loading…</div>;
  if (!user || (user as any).role !== "admin") return null;

  return (
    <main style={{ minHeight: "100vh" }}>
      <AdminDashboard appName="${appName}" />
    </main>
  );
}

export default AdminPage;
`;
    info(`Creating: ${chalk.cyan(outputPath)}`);
    info(`Add to router: ${chalk.cyan(`<Route path="/admin" element={<AdminPage />} />`)}`);
  }

  if (!opts.dryRun) {
    mkdirSync(dirname(outputPath), { recursive: true });
    if (existsSync(outputPath)) {
      warn(`${outputPath} already exists — skipping`);
    } else {
      writeFileSync(outputPath, fileContent);
      results.push(outputPath);
      success(`Created ${outputPath}`);
    }
  } else {
    console.log(chalk.dim('\n── dry-run: would write to ' + outputPath + ' ──────────'));
    console.log(chalk.cyan(fileContent));
    console.log(chalk.dim('─────────────────────────────────────────────────────\n'));
  }

  info(`Make a user admin: ${chalk.cyan('corral users set-plan --email user@example.com --plan admin')}`);
  info(`Or set role in DB: ${chalk.cyan(`UPDATE user SET role='admin' WHERE email='...'`)}`);

  if (jsonOutput({ framework, outputPath, files: results }, !!opts.json)) return;
}

// ─── Command: add device-verify ───────────────────────────────────────────────

async function addDeviceVerifyCommand(
  opts: { json?: boolean; config: string; dryRun?: boolean },
) {
  let config: Record<string, any> = {};
  try { config = readConfig(opts.config); } catch { warn('corral.yaml not found — proceeding with auto-detect'); }

  const framework = detectFramework(config);
  const appName = config?.app?.name || process.cwd().split('/').pop() || 'App';
  const appDomain = config?.app?.domain || 'http://localhost:3000';
  const appCliName = appName.toLowerCase().replace(/\s+/g, '-');
  const appIcon = config?.app?.icon || '🤠';
  const results: string[] = [];

  console.log(chalk.bold(`\n🔐 corral add device-verify\n`));
  info(`Framework: ${framework}`);

  const vars = {
    APP_NAME: appName,
    APP_DOMAIN: appDomain.replace(/^https?:\/\//, ''),
    APP_CLI_NAME: appCliName,
    APP_ICON: appIcon,
  };

  let outputPath: string;
  let templateName: string;

  if (framework === 'nextjs') {
    outputPath = 'app/device/verify/page.tsx';
    templateName = 'device-verify-nextjs.tsx.tmpl';
    info(`Creating: ${chalk.cyan(outputPath)}`);
    info(`Route: ${chalk.cyan('/device/verify')}`);
  } else {
    outputPath = 'src/pages/DeviceVerify.tsx';
    templateName = 'device-verify-react.tsx.tmpl';
    info(`Creating: ${chalk.cyan(outputPath)}`);
    info(`Add to router: ${chalk.cyan(`<Route path="/device/verify" element={<DeviceVerify />} />`)}`);
  }

  let fileContent: string;
  try {
    fileContent = replaceVars(loadTemplate(templateName), vars);
  } catch (e: any) {
    error(`Template not found: ${templateName} — ${e.message}`);
    process.exit(1);
  }

  if (!opts.dryRun) {
    mkdirSync(dirname(outputPath), { recursive: true });
    if (existsSync(outputPath)) {
      warn(`${outputPath} already exists — skipping`);
    } else {
      writeFileSync(outputPath, fileContent);
      results.push(outputPath);
      success(`Created ${outputPath}`);
    }
  } else {
    console.log(chalk.dim('\n── dry-run: would write to ' + outputPath + ' ──────────'));
    console.log(chalk.cyan(fileContent.slice(0, 400) + (fileContent.length > 400 ? '\n…(truncated)' : '')));
    console.log(chalk.dim('─────────────────────────────────────────────────────\n'));
  }

  info(`CLI auth URL: ${chalk.cyan(`${appDomain}/device/verify?code=XXXX`)}`);
  info(`API endpoint needed: ${chalk.cyan('POST /api/corral/device/verify')}`);
  info(`Run ${chalk.cyan('corral doctor')} to verify auth server is running.`);

  if (jsonOutput({ framework, outputPath, files: results }, !!opts.json)) return;
}

// ─── Command: add webhook ─────────────────────────────────────────────────────

async function addWebhookCommand(
  opts: { path?: string; json?: boolean; config: string; dryRun?: boolean },
) {
  let config: Record<string, any> = {};
  try { config = readConfig(opts.config); } catch { warn('corral.yaml not found — proceeding with auto-detect'); }

  const framework = detectFramework(config);
  const appDomain = config?.app?.domain || 'https://yourapp.com';
  const results: string[] = [];

  console.log(chalk.bold(`\n🪝  corral add webhook\n`));
  info(`Framework: ${framework}`);

  const webhookPath = opts.path || '/api/webhooks/stripe';

  if (framework === 'nextjs') {
    const outputPath = 'app/api/webhooks/stripe/route.ts';
    const fileContent = `import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";

// Initialize Stripe
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2024-11-20.acacia",
});

const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET!;

export async function POST(req: NextRequest) {
  const body = await req.text();
  const sig = req.headers.get("stripe-signature");

  if (!sig) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(body, sig, webhookSecret);
  } catch (err: any) {
    console.error("Webhook signature verification failed:", err.message);
    return NextResponse.json({ error: \`Webhook Error: \${err.message}\` }, { status: 400 });
  }

  // ─── Handle events ──────────────────────────────────────────────────────
  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      console.log("✅ Checkout completed:", session.id);
      // TODO: Update user plan in DB
      // const userId = session.metadata?.userId;
      // const planName = session.metadata?.planName;
      // await db.update(user).set({ plan: planName }).where(eq(user.id, userId));
      break;
    }

    case "customer.subscription.updated": {
      const subscription = event.data.object as Stripe.Subscription;
      console.log("🔄 Subscription updated:", subscription.id);
      // TODO: Sync subscription status to DB
      break;
    }

    case "customer.subscription.deleted": {
      const subscription = event.data.object as Stripe.Subscription;
      console.log("❌ Subscription cancelled:", subscription.id);
      // TODO: Downgrade user to free plan
      break;
    }

    case "invoice.payment_failed": {
      const invoice = event.data.object as Stripe.Invoice;
      console.log("💸 Payment failed:", invoice.id);
      // TODO: Notify user, handle grace period
      break;
    }

    default:
      console.log(\`Unhandled event type: \${event.type}\`);
  }

  return NextResponse.json({ received: true });
}
`;

    if (!opts.dryRun) {
      mkdirSync(dirname(outputPath), { recursive: true });
      if (existsSync(outputPath)) {
        warn(`${outputPath} already exists — skipping`);
      } else {
        writeFileSync(outputPath, fileContent);
        results.push(outputPath);
        success(`Created ${outputPath}`);
      }
    } else {
      console.log(chalk.dim('\n── dry-run: would write to ' + outputPath + ' ──────────'));
      console.log(chalk.cyan(fileContent.slice(0, 600) + '\n…(truncated)'));
      console.log(chalk.dim('─────────────────────────────────────────────────────\n'));
    }

    console.log('');
    console.log(chalk.bold('Set webhook URL in Stripe dashboard:'));
    console.log(`  ${chalk.cyan(`${appDomain}/api/webhooks/stripe`)}`);
    console.log('');
    info(`Add to .env: ${chalk.green('STRIPE_WEBHOOK_SECRET')}=${chalk.dim('whsec_...')}`);
    info(`Test locally: ${chalk.cyan('stripe listen --forward-to localhost:3000/api/webhooks/stripe')}`);

    if (jsonOutput({ framework, outputPath, webhookUrl: `${appDomain}/api/webhooks/stripe`, files: results }, !!opts.json)) return;

  } else {
    // Express / Hono / unknown — add webhook handler file
    const outputPath = opts.path
      ? opts.path.replace(/^\//, '') + '/stripe-webhook.ts'
      : 'src/webhooks/stripe.ts';

    const fileContent = `import Stripe from "stripe";
import type { Request, Response } from "express";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2024-11-20.acacia",
});

const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET!;

/**
 * Stripe webhook handler — mount with raw body parser:
 *
 *   import express from "express";
 *   import { stripeWebhookHandler } from "./webhooks/stripe.js";
 *
 *   // IMPORTANT: raw body needed for signature verification
 *   app.post(
 *     "/api/webhooks/stripe",
 *     express.raw({ type: "application/json" }),
 *     stripeWebhookHandler
 *   );
 */
export async function stripeWebhookHandler(req: Request, res: Response) {
  const sig = req.headers["stripe-signature"] as string;
  const body = req.body as Buffer;

  if (!sig) {
    res.status(400).json({ error: "Missing stripe-signature header" });
    return;
  }

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(body, sig, webhookSecret);
  } catch (err: any) {
    console.error("Webhook signature verification failed:", err.message);
    res.status(400).json({ error: \`Webhook Error: \${err.message}\` });
    return;
  }

  // ─── Handle events ──────────────────────────────────────────────────────
  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      console.log("✅ Checkout completed:", session.id);
      // TODO: Update user plan in DB
      break;
    }

    case "customer.subscription.updated": {
      const subscription = event.data.object as Stripe.Subscription;
      console.log("🔄 Subscription updated:", subscription.id);
      break;
    }

    case "customer.subscription.deleted": {
      const subscription = event.data.object as Stripe.Subscription;
      console.log("❌ Subscription cancelled:", subscription.id);
      // TODO: Downgrade user to free plan
      break;
    }

    case "invoice.payment_failed": {
      const invoice = event.data.object as Stripe.Invoice;
      console.log("💸 Payment failed:", invoice.id);
      break;
    }

    default:
      console.log(\`Unhandled event type: \${event.type}\`);
  }

  res.json({ received: true });
}
`;

    if (!opts.dryRun) {
      mkdirSync(dirname(outputPath), { recursive: true });
      if (existsSync(outputPath)) {
        warn(`${outputPath} already exists — skipping`);
      } else {
        writeFileSync(outputPath, fileContent);
        results.push(outputPath);
        success(`Created ${outputPath}`);
      }
    } else {
      console.log(chalk.dim('\n── dry-run: would write to ' + outputPath + ' ──────────'));
      console.log(chalk.cyan(fileContent.slice(0, 600) + '\n…(truncated)'));
      console.log(chalk.dim('─────────────────────────────────────────────────────\n'));
    }

    console.log('');
    console.log(chalk.bold('Set webhook URL in Stripe dashboard:'));
    console.log(`  ${chalk.cyan(`${appDomain}${webhookPath}`)}`);
    console.log('');
    console.log(chalk.bold('Mount in your server:'));
    console.log(chalk.cyan(`  import { stripeWebhookHandler } from "./webhooks/stripe.js";`));
    console.log(chalk.cyan(`  app.post("${webhookPath}", express.raw({ type: "application/json" }), stripeWebhookHandler);`));
    console.log('');
    info(`Add to .env: ${chalk.green('STRIPE_WEBHOOK_SECRET')}=${chalk.dim('whsec_...')}`);
    info(`Test locally: ${chalk.cyan(`stripe listen --forward-to localhost:3000${webhookPath}`)}`);

    if (jsonOutput({ framework, outputPath, webhookUrl: `${appDomain}${webhookPath}`, files: results }, !!opts.json)) return;
  }
}

// Merges Commander OptionValues (untyped) — cast to any to satisfy typed fn params
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mergeOpts(...sources: Record<string, any>[]): any {
  return Object.assign({}, ...sources);
}

// ─── Command group export ─────────────────────────────────────────────────────

export const addCommand = new Command('add')
  .description('Add pages, features, plans, meters, providers, and integrations');

// Global add flags (dry-run, json) come from the parent program opts —
// each subcommand reads them via its own inherited options.

addCommand
  .command('page <path>')
  .description('Create a new page component (Next.js: app/<path>/page.tsx, SPA: src/pages/<Name>.tsx)')
  .option('--gated <plan>', 'Wrap page content in <PlanGate plan="...">')
  .option('--name <name>', 'Override component name (default: derived from path)')
  .option('--dry-run', 'Preview changes without writing files')
  .option('--json', 'Output as JSON')
  .action(function (this: Command, pagePath: string, cmdOpts: OptionValues) {
    const parentOpts = this.parent?.parent?.opts() ?? {};
    addPageCommand(pagePath, mergeOpts(parentOpts, cmdOpts)).catch(err => { error(err.message); process.exit(1); });
  });

addCommand
  .command('feature <name>')
  .description('Add a feature gate to corral.yaml')
  .requiredOption('--plan <plan>', 'Plan(s) that unlock this feature (comma-separated)')
  .option('--description <desc>', 'Human-readable description')
  .option('--dry-run', 'Preview changes without writing files')
  .option('--json', 'Output as JSON')
  .action(function (this: Command, name: string, cmdOpts: OptionValues) {
    const parentOpts = this.parent?.parent?.opts() ?? {};
    addFeatureCommand(name, mergeOpts(parentOpts, cmdOpts)).catch(err => { error(err.message); process.exit(1); });
  });

addCommand
  .command('meter <name>')
  .description('Add a usage meter to corral.yaml')
  .requiredOption('--limit <number>', 'Usage limit per period')
  .requiredOption('--plan <plan>', 'Plan this limit applies to')
  .option('--period <period>', 'Reset period: monthly or daily (default: monthly)', 'monthly')
  .option('--dry-run', 'Preview changes without writing files')
  .option('--json', 'Output as JSON')
  .action(function (this: Command, name: string, cmdOpts: OptionValues) {
    const parentOpts = this.parent?.parent?.opts() ?? {};
    addMeterCommand(name, mergeOpts(parentOpts, cmdOpts)).catch(err => { error(err.message); process.exit(1); });
  });

addCommand
  .command('provider <name>')
  .description(`Add a social login provider to corral.yaml (supported: ${SUPPORTED_PROVIDERS.join(', ')})`)
  .option('--dry-run', 'Preview changes without writing files')
  .option('--json', 'Output as JSON')
  .action(function (this: Command, name: string, cmdOpts: OptionValues) {
    const parentOpts = this.parent?.parent?.opts() ?? {};
    addProviderCommand(name, mergeOpts(parentOpts, cmdOpts)).catch(err => { error(err.message); process.exit(1); });
  });

addCommand
  .command('plan <name>')
  .description('Add a billing plan to corral.yaml')
  .requiredOption('--price <number>', 'Monthly price in USD')
  .option('--features <list>', 'Comma-separated feature names')
  .option('--trial <days>', 'Trial period in days')
  .option('--highlighted', 'Mark as popular/highlighted plan')
  .option('--dry-run', 'Preview changes without writing files')
  .option('--json', 'Output as JSON')
  .action(function (this: Command, name: string, cmdOpts: OptionValues) {
    const parentOpts = this.parent?.parent?.opts() ?? {};
    addPlanCommand(name, mergeOpts(parentOpts, cmdOpts)).catch(err => { error(err.message); process.exit(1); });
  });

addCommand
  .command('admin-page')
  .description('Generate an admin dashboard page (protected by role === "admin")')
  .option('--dry-run', 'Preview changes without writing files')
  .option('--json', 'Output as JSON')
  .action(function (this: Command, cmdOpts: OptionValues) {
    const parentOpts = this.parent?.parent?.opts() ?? {};
    addAdminPageCommand(mergeOpts(parentOpts, cmdOpts)).catch(err => { error(err.message); process.exit(1); });
  });

addCommand
  .command('device-verify')
  .description('Generate the device verification page for CLI auth (RFC 8628)')
  .option('--dry-run', 'Preview changes without writing files')
  .option('--json', 'Output as JSON')
  .action(function (this: Command, cmdOpts: OptionValues) {
    const parentOpts = this.parent?.parent?.opts() ?? {};
    addDeviceVerifyCommand(mergeOpts(parentOpts, cmdOpts)).catch(err => { error(err.message); process.exit(1); });
  });

addCommand
  .command('webhook')
  .description('Generate a Stripe webhook handler')
  .option('--path <path>', 'Custom webhook path (default: /api/webhooks/stripe)')
  .option('--dry-run', 'Preview changes without writing files')
  .option('--json', 'Output as JSON')
  .action(function (this: Command, cmdOpts: OptionValues) {
    const parentOpts = this.parent?.parent?.opts() ?? {};
    addWebhookCommand(mergeOpts(parentOpts, cmdOpts)).catch(err => { error(err.message); process.exit(1); });
  });
