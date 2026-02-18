import { z } from "zod";

const colorsSchema = z.object({
  primary: z.string().default("#6366f1"),
  accent: z.string().default("#f59e0b"),
}).default({});

const appSchema = z.object({
  id: z.string().default("corral-app"),
  name: z.string().default("My App"),
  domain: z.string().default("http://localhost:3000"),
  logo: z.string().optional(),
  colors: colorsSchema,
  support_email: z.string().email().optional(),
}).default({});

// Social provider config: either `true` (read from env) or explicit object
const socialProviderSchema = z.union([
  z.literal(true),
  z.object({
    client_id: z.string().optional(),  // Falls back to env: {PROVIDER}_CLIENT_ID
    client_secret: z.string().optional(),  // Falls back to env: {PROVIDER}_CLIENT_SECRET
    scope: z.string().optional(),
    redirect_uri: z.string().optional(),
  }),
]);

const magicLinkConfigSchema = z.union([
  z.literal(true),
  z.object({
    expires_in: z.number().default(600),  // seconds
  }),
]);

const emailOtpConfigSchema = z.union([
  z.literal(true),
  z.object({
    length: z.number().default(6),
    expires_in: z.number().default(300),  // seconds
  }),
]);

const methodsSchema = z.object({
  // Core auth
  email_password: z.boolean().default(true),
  
  // Passwordless
  magic_link: z.union([z.boolean(), magicLinkConfigSchema]).default(false),
  email_otp: z.union([z.boolean(), emailOtpConfigSchema]).default(false),
  
  // Social providers — set to `true` to read from env, or provide explicit config
  google: socialProviderSchema.optional(),
  github: socialProviderSchema.optional(),
  apple: socialProviderSchema.optional(),
  discord: socialProviderSchema.optional(),
  microsoft: socialProviderSchema.optional(),
  twitter: socialProviderSchema.optional(),
  facebook: socialProviderSchema.optional(),
  gitlab: socialProviderSchema.optional(),
  linkedin: socialProviderSchema.optional(),
}).default({});

const sessionSchema = z.object({
  max_age: z.number().default(30 * 24 * 60 * 60),
  update_age: z.number().default(24 * 60 * 60),
}).default({});

const deviceAuthSchema = z.object({
  enabled: z.boolean().default(false),
}).default({});

const apiKeysSchema = z.object({
  enabled: z.boolean().default(false),
  prefix: z.string().default("sk_"),
}).default({});

const emailConfigSchema = z.object({
  transport: z.enum(["console", "smtp", "nodemailer", "resend", "postmark"]).default("console"),
  from: z.string().optional(),  // Falls back to EMAIL_FROM env
  verify_on_signup: z.boolean().default(false),
  smtp: z.object({
    host: z.string().optional(),  // Falls back to SMTP_HOST env
    port: z.number().default(587),
    secure: z.boolean().default(false),
    user: z.string().optional(),  // Falls back to SMTP_USER env
    pass: z.string().optional(),  // Falls back to SMTP_PASS env
  }).optional(),
  resend: z.object({
    apiKey: z.string().optional(),  // Falls back to RESEND_API_KEY env
  }).optional(),
  postmark: z.object({
    apiKey: z.string().optional(),  // Falls back to POSTMARK_API_KEY env
  }).optional(),
}).optional();

const authSchema = z.object({
  server_url: z.string().default("http://localhost:3000"),
  secret: z.string().optional(),  // Falls back to BETTER_AUTH_SECRET env
  methods: methodsSchema,
  session: sessionSchema,
  device_auth: deviceAuthSchema,
  api_keys: apiKeysSchema,
  email: emailConfigSchema,
  trusted_origins: z.array(z.string()).optional(),
}).default({});

const planSchema = z.object({
  name: z.string(),
  display_name: z.string(),
  stripe_price_id: z.string().optional(),
  price: z.number().default(0),
  interval: z.enum(["month", "year"]).default("month"),
  features: z.array(z.string()).default([]),
  cta: z.string().default("Get Started"),
  popular: z.boolean().default(false),
  trial: z.boolean().default(false),
});

const stripeConfigSchema = z.object({
  secret_key: z.string().optional(),  // Falls back to STRIPE_SECRET_KEY env
  publishable_key: z.string().optional(),  // Falls back to NEXT_PUBLIC_STRIPE_PUBLIC_KEY env
  webhook_secret: z.string().optional(),  // Falls back to STRIPE_WEBHOOK_SECRET env
  require_payment_method: z.boolean().default(true),
}).optional();

const billingSchema = z.object({
  provider: z.enum(["stripe", "none"]).default("none"),
  stripe: stripeConfigSchema,
  currency: z.string().default("usd"),
  trial_days: z.number().default(0),
  cancel_behavior: z.enum(["immediate", "end_of_period"]).default("end_of_period"),
}).default({});

const nudgeRefSchema = z.object({
  trigger: z.string().optional(),
  message: z.string().optional(),
  cta: z.string().optional(),
}).default({});

const meterSchema = z.object({
  label: z.string(),
  unit: z.string().default("requests"),
  icon: z.string().optional(),
  stripe_meter: z.string().optional(),
  type: z.enum(["metered", "cap", "tier", "flag"]).default("cap"),
  reset_period: z.enum(["day", "month"]).default("month"),
  limits: z.record(z.string(), z.number()).default({}),
  warning_at: z.number().default(0.8),
  nudge: nudgeRefSchema,
});

const nudgeSchema = z.object({
  trigger: z.string(),
  message: z.string(),
  cta: z.string().default("Upgrade"),
  style: z.enum(["banner", "modal", "toast"]).default("toast"),
  position: z.enum(["top", "bottom", "center"]).default("bottom"),
  dismissible: z.boolean().default(true),
  show_once_per: z.enum(["session", "day", "ever"]).default("session"),
  discount_code: z.string().optional(),
  color: z.string().optional(),
  link: z.string().optional(),
});

const seedSchema = z.object({
  admin: z.object({
    email: z.string().email(),
    password: z.string(),
    name: z.string().default("Admin"),
  }).optional(),
  test_users: z.array(z.object({
    email: z.string().email(),
    password: z.string(),
    name: z.string(),
    plan: z.string().optional(),
    usage: z.record(z.string(), z.number()).optional(),
  })).default([]),
  stripe_products: z.boolean().default(false),
  sample_data: z.boolean().default(false),
}).default({});

const databaseSchema = z.object({
  url: z.string().default("file:./corral.db"),
  adapter: z.enum(["sqlite", "pg", "mysql", "neon", "turso", "libsql", "planetscale", "d1"]).default("sqlite"),
  auto_migrate: z.boolean().default(true),
}).default({});

const adminSchema = z.object({
  path: z.string().default("/admin"),
  require_role: z.string().default("admin"),
  sections: z.object({
    users: z.boolean().default(true),
    billing: z.boolean().default(true),
    usage: z.boolean().default(true),
  }).default({}),
}).default({});

export const corralConfigSchema = z.object({
  app: appSchema,
  auth: authSchema,
  billing: billingSchema,
  plans: z.array(planSchema).default([]),
  features: z.record(z.string(), z.array(z.string())).default({}),
  meters: z.record(z.string(), meterSchema).default({}),
  nudges: z.record(z.string(), nudgeSchema).default({}),
  seed: seedSchema,
  database: databaseSchema,
  admin: adminSchema,
});

export type CorralConfig = z.infer<typeof corralConfigSchema>;
export type MeterConfig = z.infer<typeof meterSchema>;
export type PlanConfig = z.infer<typeof planSchema>;
