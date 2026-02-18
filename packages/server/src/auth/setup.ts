import { betterAuth } from "better-auth";
import { admin } from "better-auth/plugins";
import type { CorralConfig } from "../config/schema.js";
import { bootstrapDatabase } from "../db/bootstrap.js";
import { createAdapter, type DatabaseAdapter } from "../db/adapters.js";

/**
 * Create the database adapter using the pluggable adapter system.
 *
 * Replaces the old `require()`-based approach with dynamic `import()` so the
 * package works in both ESM and CJS, and supports serverless drivers
 * (Neon, D1, Turso, PlanetScale) alongside traditional Node.js drivers.
 */
async function createDatabaseAdapter(config: CorralConfig): Promise<DatabaseAdapter> {
  const adapterName = config.database.adapter || "sqlite";
  const url = config.database.url;

  try {
    return await createAdapter(adapterName, url);
  } catch (e: any) {
    const hints: Record<string, string> = {
      sqlite: "npm install better-sqlite3",
      pg: "npm install pg",
      neon: "npm install @neondatabase/serverless",
      mysql: "npm install mysql2",
      turso: "npm install @libsql/client",
      planetscale: "npm install @planetscale/database",
    };
    const hint = hints[adapterName] ?? "";
    throw new Error(
      `[Corral] Failed to create "${adapterName}" adapter.${hint ? ` Try: ${hint}` : ""}\n` +
        `Original error: ${e.message}`,
    );
  }
}

/**
 * Resolve an env var from the config or process.env.
 * Config values can reference env vars with ${VAR_NAME} syntax.
 */
function resolveEnv(value: string | undefined, envKey: string): string | undefined {
  if (!value) return process.env[envKey];
  if (value.startsWith("${") && value.endsWith("}")) {
    return process.env[value.slice(2, -1)] || undefined;
  }
  return value;
}

/**
 * Build the email sending function.
 * Uses dynamic import() for optional dependencies (ESM-compatible).
 */
async function createEmailSender(config: CorralConfig) {
  const emailConfig = config.auth.email;
  if (!emailConfig) return null;

  const transport = emailConfig.transport || "console";

  switch (transport) {
    case "console":
      return async ({ to, subject, body }: { to: string; subject: string; body: string }) => {
        console.log(`\n📧 [Corral Email - Console]\n  To: ${to}\n  Subject: ${subject}\n  Body: ${body}\n`);
      };

    case "smtp":
    case "nodemailer": {
      try {
        const nodemailer = await import("nodemailer" as string);
        const mod = nodemailer.default ?? nodemailer;
        const transporter = mod.createTransport({
          host: resolveEnv(emailConfig.smtp?.host, "SMTP_HOST"),
          port: emailConfig.smtp?.port || 587,
          secure: emailConfig.smtp?.secure ?? false,
          auth: {
            user: resolveEnv(emailConfig.smtp?.user, "SMTP_USER"),
            pass: resolveEnv(emailConfig.smtp?.pass, "SMTP_PASS"),
          },
        });

        return async ({ to, subject, body }: { to: string; subject: string; body: string }) => {
          await transporter.sendMail({
            from: emailConfig.from || resolveEnv(undefined, "EMAIL_FROM") || "noreply@example.com",
            to,
            subject,
            html: body,
          });
        };
      } catch (e: any) {
        console.warn(`[Corral] SMTP requires 'nodemailer' package. Run: npm install nodemailer`);
        return null;
      }
    }

    case "resend": {
      try {
        const { Resend } = await import("resend" as string);
        const resend = new Resend(resolveEnv(emailConfig.resend?.apiKey, "RESEND_API_KEY"));
        const from = emailConfig.from || resolveEnv(undefined, "EMAIL_FROM") || "noreply@example.com";

        return async ({ to, subject, body }: { to: string; subject: string; body: string }) => {
          await resend.emails.send({ from, to, subject, html: body });
        };
      } catch (e: any) {
        console.warn(`[Corral] Resend requires 'resend' package. Run: npm install resend`);
        return null;
      }
    }

    case "postmark": {
      try {
        const postmark = await import("postmark" as string);
        const mod = postmark.default ?? postmark;
        const client = new mod.ServerClient(resolveEnv(emailConfig.postmark?.apiKey, "POSTMARK_API_KEY")!);
        const from = emailConfig.from || resolveEnv(undefined, "EMAIL_FROM") || "noreply@example.com";

        return async ({ to, subject, body }: { to: string; subject: string; body: string }) => {
          await client.sendEmail({ From: from, To: to, Subject: subject, HtmlBody: body });
        };
      } catch (e: any) {
        console.warn(`[Corral] Postmark requires 'postmark' package. Run: npm install postmark`);
        return null;
      }
    }

    default:
      console.warn(`[Corral] Unknown email transport: ${transport}`);
      return null;
  }
}

/**
 * Build social provider configuration from corral.yaml + env vars.
 */
function buildSocialProviders(config: CorralConfig): Record<string, any> {
  const providers: Record<string, any> = {};
  const methods = config.auth.methods;

  const providerMap: Record<string, { idEnv: string; secretEnv: string }> = {
    google: { idEnv: "GOOGLE_CLIENT_ID", secretEnv: "GOOGLE_CLIENT_SECRET" },
    github: { idEnv: "GITHUB_CLIENT_ID", secretEnv: "GITHUB_CLIENT_SECRET" },
    apple: { idEnv: "APPLE_CLIENT_ID", secretEnv: "APPLE_CLIENT_SECRET" },
    discord: { idEnv: "DISCORD_CLIENT_ID", secretEnv: "DISCORD_CLIENT_SECRET" },
    microsoft: { idEnv: "MICROSOFT_CLIENT_ID", secretEnv: "MICROSOFT_CLIENT_SECRET" },
    twitter: { idEnv: "TWITTER_CLIENT_ID", secretEnv: "TWITTER_CLIENT_SECRET" },
    facebook: { idEnv: "FACEBOOK_CLIENT_ID", secretEnv: "FACEBOOK_CLIENT_SECRET" },
    gitlab: { idEnv: "GITLAB_CLIENT_ID", secretEnv: "GITLAB_CLIENT_SECRET" },
    linkedin: { idEnv: "LINKEDIN_CLIENT_ID", secretEnv: "LINKEDIN_CLIENT_SECRET" },
  };

  for (const [name, envConfig] of Object.entries(providerMap)) {
    const configEntry = (methods as any)?.[name];

    if (configEntry === true || typeof configEntry === "object") {
      const clientId = resolveEnv(configEntry?.client_id, envConfig.idEnv);
      const clientSecret = resolveEnv(configEntry?.client_secret, envConfig.secretEnv);

      if (clientId && clientSecret) {
        providers[name] = {
          clientId,
          clientSecret,
          ...(configEntry?.scope ? { scope: configEntry.scope } : {}),
          ...(configEntry?.redirect_uri ? { redirectURI: configEntry.redirect_uri } : {}),
        };
      } else {
        console.warn(
          `[Corral] Social provider '${name}' enabled but missing credentials.\n` +
          `  Set ${envConfig.idEnv} and ${envConfig.secretEnv} in .env.local`
        );
      }
    }
  }

  return providers;
}

export async function createAuth(config: CorralConfig) {
  // Pre-flight checks
  if (!process.env.BETTER_AUTH_SECRET && !config.auth.secret) {
    console.warn(
      `[Corral] ⚠️  No BETTER_AUTH_SECRET env var or auth.secret in config.\n` +
      `Generate one: openssl rand -base64 32\n` +
      `Add to .env: BETTER_AUTH_SECRET=<your-secret>`
    );
  }

  if (!process.env.BETTER_AUTH_URL && !config.auth.server_url) {
    console.warn(
      `[Corral] ⚠️  No BETTER_AUTH_URL env var or auth.server_url in config.\n` +
      `Add to .env: BETTER_AUTH_URL=http://localhost:3000`
    );
  }

  const adapter = await createDatabaseAdapter(config);
  const emailSender = await createEmailSender(config);
  const socialProviders = buildSocialProviders(config);

  // Auto-bootstrap: create tables if they don't exist. Zero manual steps.
  try {
    await bootstrapDatabase(adapter);
  } catch (e: any) {
    console.warn(`[Corral] Database bootstrap warning: ${e.message}`);
  }

  // ── Plugins ────────────────────────────────────────────────────────

  const plugins: any[] = [admin()];

  // Magic link (passwordless email login)
  if (config.auth.methods.magic_link && emailSender) {
    try {
      const betterAuthPlugins = await import("better-auth/plugins");
      const { magicLink } = betterAuthPlugins;
      plugins.push(
        magicLink({
          sendMagicLink: async ({ email, url }: { email: string; url: string }) => {
            const appName = config.app?.name || "Your App";
            await emailSender({
              to: email,
              subject: `Sign in to ${appName}`,
              body: `
                <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
                  <h2>Sign in to ${appName}</h2>
                  <p>Click the button below to sign in. This link expires in 10 minutes.</p>
                  <a href="${url}" style="display:inline-block;padding:12px 24px;background:#4f46e5;color:#fff;border-radius:8px;text-decoration:none;font-weight:600;">
                    Sign In
                  </a>
                  <p style="color:#666;font-size:12px;margin-top:16px;">If you didn't request this, you can safely ignore it.</p>
                </div>
              `,
            });
          },
          expiresIn: config.auth.methods.magic_link === true ? 600 : (config.auth.methods.magic_link as any)?.expires_in || 600,
        })
      );
    } catch {
      console.warn(`[Corral] magic-link plugin not available. Update better-auth.`);
    }
  }

  // Email OTP
  if (config.auth.methods.email_otp && emailSender) {
    try {
      const betterAuthPlugins = await import("better-auth/plugins");
      const { emailOTP } = betterAuthPlugins;
      plugins.push(
        emailOTP({
          sendVerificationOTP: async ({ email, otp }: { email: string; otp: string }) => {
            const appName = config.app?.name || "Your App";
            await emailSender({
              to: email,
              subject: `Your ${appName} verification code: ${otp}`,
              body: `
                <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
                  <h2>Your verification code</h2>
                  <div style="font-size:32px;font-weight:bold;letter-spacing:8px;text-align:center;padding:24px;background:#f3f4f6;border-radius:12px;margin:16px 0;">
                    ${otp}
                  </div>
                  <p>Enter this code to sign in to ${appName}. It expires in 5 minutes.</p>
                  <p style="color:#666;font-size:12px;">If you didn't request this, you can safely ignore it.</p>
                </div>
              `,
            });
          },
          otpLength: (config.auth.methods.email_otp as any)?.length || 6,
          expiresIn: (config.auth.methods.email_otp as any)?.expires_in || 300,
        })
      );
    } catch {
      console.warn(`[Corral] email-otp plugin not available. Update better-auth.`);
    }
  }

  // Stripe billing
  if (config.billing?.stripe) {
    try {
      const stripePlugin = await import("@better-auth/stripe" as string);
      const stripeMod = await import("stripe" as string);
      const Stripe = stripeMod.default ?? stripeMod;
      const stripeKey = resolveEnv(config.billing.stripe.secret_key, "STRIPE_SECRET_KEY");

      if (stripeKey) {
        const stripeClient = new Stripe(stripeKey);
        const plans = (config.plans || [])
          .filter((p: any) => p.stripe_price_id)
          .map((p: any) => ({
            name: p.id,
            priceId: resolveEnv(p.stripe_price_id, `STRIPE_PRICE_${p.id.toUpperCase()}`),
            limits: p.limits || {},
            ...(p.group ? { group: p.group } : {}),
          }));

        const stripePluginFn = stripePlugin.stripe ?? stripePlugin.default?.stripe;
        plugins.push(
          stripePluginFn({
            stripeClient,
            stripeWebhookSecret: resolveEnv(config.billing.stripe.webhook_secret, "STRIPE_WEBHOOK_SECRET") || "",
            subscription: {
              enabled: true,
              plans,
              requirePaymentMethod: config.billing.stripe.require_payment_method ?? true,
            },
            onEvent: async (event: any) => {
              console.log(`[Corral/Stripe] ${event.type}`);
            },
          })
        );
      }
    } catch (e: any) {
      console.warn(`[Corral] Stripe requires '@better-auth/stripe' and 'stripe' packages.`);
    }
  }

  // ── Auth Options ────────────────────────────────────────────────────

  const authOptions: any = {
    baseURL: config.auth.server_url || process.env.BETTER_AUTH_URL,
    basePath: "/api/auth",
    secret: config.auth.secret || process.env.BETTER_AUTH_SECRET,
    database: adapter.instance,
    emailAndPassword: {
      enabled: config.auth.methods.email_password !== false,
      ...(emailSender && config.auth.methods.email_password !== false
        ? {
            sendResetPassword: async ({ user, url }: { user: any; url: string }) => {
              const appName = config.app?.name || "Your App";
              await emailSender({
                to: user.email,
                subject: `Reset your ${appName} password`,
                body: `
                  <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
                    <h2>Reset your password</h2>
                    <p>Hi ${user.name || "there"},</p>
                    <p>Click the button below to reset your password. This link expires in 1 hour.</p>
                    <a href="${url}" style="display:inline-block;padding:12px 24px;background:#4f46e5;color:#fff;border-radius:8px;text-decoration:none;font-weight:600;">
                      Reset Password
                    </a>
                    <p style="color:#666;font-size:12px;margin-top:16px;">If you didn't request this, you can safely ignore it.</p>
                  </div>
                `,
              });
            },
          }
        : {}),
    },
    ...(emailSender
      ? {
          emailVerification: {
            sendVerificationEmail: async ({ user, url }: { user: any; url: string }) => {
              const appName = config.app?.name || "Your App";
              await emailSender({
                to: user.email,
                subject: `Verify your ${appName} email`,
                body: `
                  <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
                    <h2>Verify your email</h2>
                    <p>Hi ${user.name || "there"},</p>
                    <p>Click below to verify your email address.</p>
                    <a href="${url}" style="display:inline-block;padding:12px 24px;background:#4f46e5;color:#fff;border-radius:8px;text-decoration:none;font-weight:600;">
                      Verify Email
                    </a>
                  </div>
                `,
              });
            },
            sendOnSignUp: config.auth.email?.verify_on_signup ?? false,
          },
        }
      : {}),
    session: {
      expiresIn: config.auth.session.max_age,
      updateAge: config.auth.session.update_age,
    },
    plugins,
    ...(config.auth.trusted_origins ? { trustedOrigins: config.auth.trusted_origins } : {}),
  };

  if (Object.keys(socialProviders).length > 0) {
    authOptions.socialProviders = socialProviders;
  }

  const auth = betterAuth(authOptions);
  return auth;
}
