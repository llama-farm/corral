import { z } from 'zod';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { parse, stringify } from 'yaml';

const PlanSchema = z.object({
  name: z.string(),
  price: z.number().optional(),
  stripe_price_id: z.string().optional(),
  features: z.array(z.string()).optional(),
  limits: z.record(z.number()).optional(),
});

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

export const ConfigSchema = z.object({
  app: z.object({
    name: z.string(),
    id: z.string(),
    url: z.string().optional(),
  }),
  database: z.object({
    adapter: z.string().optional(),
    url: z.string(),
    auto_migrate: z.boolean().optional(),
  }).optional(),
  auth: z.object({
    providers: z.array(z.string()).optional(),
    session_expiry: z.string().optional(),
  }).optional(),
  billing: z.object({
    provider: z.string().optional(),
    stripe_secret_key_env: z.string().optional(),
    plans: z.record(PlanSchema).optional(),
  }).optional(),
  meters: z.record(MeterSchema).optional(),
  nudges: z.array(NudgeSchema).optional(),
  seed: z.object({
    auto_seed_dev: z.boolean().optional(),
    admin: SeedUserSchema.optional(),
    test_users: z.array(SeedUserSchema).optional(),
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
    // Check plans have stripe_price_id if billing configured
    if (c.billing?.plans) {
      for (const [key, plan] of Object.entries(c.billing.plans)) {
        if (plan.price && !plan.stripe_price_id) {
          errors.push(`Plan "${key}" has price but no stripe_price_id`);
        }
      }
    }
    // Check meters reference valid plans
    if (c.meters && c.billing?.plans) {
      for (const [key, meter] of Object.entries(c.meters)) {
        if (meter.plan && !c.billing.plans[meter.plan]) {
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
