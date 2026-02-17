import { z } from 'zod';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { parse, stringify } from 'yaml';

// ─── Plan ─────────────────────────────────────────────────────────────────────
// Matches the array format written by `corral add plan`:
//   name, display_name, price, interval, stripe_price_id, features, cta, trial_days, popular
// Also accepts legacy record format under billing.plans.
const PlanSchema = z.object({
  name: z.string(),
  display_name: z.string().optional(),
  price: z.number().optional(),
  interval: z.string().optional(),
  stripe_price_id: z.string().optional(),
  features: z.array(z.string()).optional(),
  cta: z.string().optional(),
  trial_days: z.number().optional(),
  popular: z.boolean().optional(),
  limits: z.record(z.number()).optional(),
});

// ─── Meter ────────────────────────────────────────────────────────────────────
// Matches the structure written by `corral add meter`:
//   label, unit, type, reset_period, limits, warning_at, nudge
// Also accepts legacy fields: name, event, plan, limit, stripe_meter_id
const MeterSchema = z.object({
  label: z.string().optional(),
  unit: z.string().optional(),
  type: z.string().optional(),
  reset_period: z.string().optional(),
  limits: z.record(z.number()).optional(),
  warning_at: z.number().optional(),
  nudge: z.object({
    message: z.string().optional(),
    cta: z.string().optional(),
    trigger: z.string().optional(),
  }).optional(),
  icon: z.string().optional(),
  stripe_meter: z.string().optional(),
  // Legacy fields
  name: z.string().optional(),
  event: z.string().optional(),
  plan: z.string().optional(),
  limit: z.number().optional(),
  stripe_meter_id: z.string().optional(),
});

const NudgeSchema = z.object({
  trigger: z.string(),
  message: z.string(),
  cta: z.string().optional(),
  cta_url: z.string().optional(),
});

const SeedUserSchema = z.object({
  email: z.string(),
  password: z.string().optional(),
  name: z.string().optional(),
  plan: z.string().optional(),
});

// ─── Main Config Schema ───────────────────────────────────────────────────────
// Supports:
//   - plans as top-level array (written by `corral add plan`)  ← primary
//   - plans as billing.plans record (legacy)
//   - features as top-level record
//   - meters as top-level record
export const ConfigSchema = z.object({
  app: z.object({
    name: z.string(),
    id: z.string(),
    url: z.string().optional(),
    domain: z.string().optional(),
    framework: z.string().optional(),
    logo: z.string().optional(),
    support_email: z.string().optional(),
    icon: z.string().optional(),
  }),

  database: z.object({
    adapter: z.string().optional(),           // sqlite | pg | mysql | turso | d1
    url: z.string(),
    auto_migrate: z.boolean().optional(),
  }).optional(),

  auth: z.object({
    server_url: z.string().optional(),
    providers: z.array(z.string()).optional(),
    social: z.union([z.array(z.string()), z.record(z.boolean())]).optional(),
    methods: z.record(z.union([z.boolean(), z.record(z.unknown())])).optional(),
    email: z.record(z.unknown()).optional(),
    session: z.object({
      max_age: z.number().optional(),
      update_age: z.number().optional(),
    }).optional(),
    trusted_origins: z.array(z.string()).optional(),
    session_expiry: z.string().optional(),
  }).optional(),

  // ── Top-level plans array (primary format from `corral add plan`) ──
  plans: z.array(PlanSchema).optional(),

  // ── Top-level features record ──
  // Values: array of plan names, or "*" / "authenticated" special strings
  features: z.record(z.union([z.array(z.string()), z.string()])).optional(),

  billing: z.object({
    provider: z.string().optional(),
    stripe_secret_key_env: z.string().optional(),
    stripe: z.object({
      require_payment_method: z.boolean().optional(),
    }).optional(),
    currency: z.string().optional(),
    trial_days: z.number().optional(),
    cancel_behavior: z.string().optional(),
    // Legacy: plans as record under billing
    plans: z.record(PlanSchema).optional(),
  }).optional(),

  meters: z.record(MeterSchema).optional(),
  nudges: z.array(NudgeSchema).optional(),

  seed: z.object({
    auto_seed_dev: z.boolean().optional(),
    admin: SeedUserSchema.optional(),
    test_users: z.array(SeedUserSchema).optional(),
  }).optional(),

  admin: z.object({
    path: z.string().optional(),
    require_role: z.string().optional(),
  }).optional(),
});

export type Config = z.infer<typeof ConfigSchema>;

export function loadConfig(configPath: string): Config {
  if (!existsSync(configPath)) {
    throw new Error(`Config not found: ${configPath}. Run "corral init" first.`);
  }
  const raw = readFileSync(configPath, 'utf-8');
  const parsed = parse(raw);
  return ConfigSchema.parse(parsed);
}

export function loadConfigRaw(configPath: string): Record<string, any> {
  if (!existsSync(configPath)) {
    throw new Error(`Config not found: ${configPath}`);
  }
  return parse(readFileSync(configPath, 'utf-8'));
}

export function saveConfig(configPath: string, data: Record<string, any>) {
  writeFileSync(configPath, stringify(data, { lineWidth: 120 }));
}

export function validateConfig(config: unknown): { valid: boolean; errors: string[] } {
  const result = ConfigSchema.safeParse(config);
  if (result.success) {
    const errors: string[] = [];
    const c = result.data;

    // Check top-level plans array for stripe_price_id
    if (c.plans) {
      for (const plan of c.plans) {
        if (plan.price && plan.price > 0 && !plan.stripe_price_id) {
          errors.push(`Plan "${plan.name}" has price but no stripe_price_id — run: corral stripe push`);
        }
      }
    }

    // Check billing.plans record (legacy format)
    if (c.billing?.plans) {
      for (const [key, plan] of Object.entries(c.billing.plans)) {
        if (plan.price && plan.price > 0 && !plan.stripe_price_id) {
          errors.push(`Plan "${key}" has price but no stripe_price_id — run: corral stripe push`);
        }
      }
    }

    // Check meters reference valid plans (top-level plans array)
    const planNames = new Set([
      ...(c.plans?.map(p => p.name) ?? []),
      ...Object.keys(c.billing?.plans ?? {}),
    ]);
    if (c.meters) {
      for (const [key, meter] of Object.entries(c.meters)) {
        if (meter.plan && planNames.size > 0 && !planNames.has(meter.plan)) {
          errors.push(`Meter "${key}" references unknown plan "${meter.plan}"`);
        }
      }
    }

    return { valid: errors.length === 0, errors };
  }
  return {
    valid: false,
    errors: result.error.issues.map(i => `${i.path.join('.')}: ${i.message}`),
  };
}

export function setNestedValue(obj: Record<string, any>, path: string, value: any) {
  const keys = path.split('.');
  let current = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    if (!(keys[i] in current)) current[keys[i]] = {};
    current = current[keys[i]];
  }
  // Try to parse as number/boolean
  if (value === 'true') value = true;
  else if (value === 'false') value = false;
  else if (!isNaN(Number(value))) value = Number(value);
  current[keys[keys.length - 1]] = value;
}
