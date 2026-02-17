import { betterAuth } from "better-auth";
import { admin } from "better-auth/plugins";
import type { CorralConfig } from "../config/schema.js";
import { bootstrapDatabase } from "../db/bootstrap.js";

/**
 * Create the correct database adapter for Better Auth.
 * 
 * LEARNING #1: Better Auth does NOT accept { url, type } objects for SQLite.
 * SQLite requires a `better-sqlite3` Database instance.
 * PostgreSQL requires a `pg` Pool instance.
 * MySQL requires a `mysql2/promise` pool instance.
 */
function createDatabaseAdapter(config: CorralConfig) {
  const adapter = config.database.adapter || "sqlite";
  const url = config.database.url;

  switch (adapter) {
    case "sqlite": {
      try {
        const Database = require("better-sqlite3");
        const dbPath = url.replace(/^file:/, "") || "./corral.db";
        return new Database(dbPath);
      } catch (e: any) {
        throw new Error(
          `[Corral] SQLite requires 'better-sqlite3' package. Run: npm install better-sqlite3\n` +
          `Original error: ${e.message}`
        );
      }
    }
    case "pg": {
      try {
        const { Pool } = require("pg");
        return new Pool({ connectionString: url });
      } catch (e: any) {
        throw new Error(
          `[Corral] PostgreSQL requires 'pg' package. Run: npm install pg\n` +
          `Original error: ${e.message}`
        );
      }
    }
    case "mysql": {
      try {
        const mysql = require("mysql2/promise");
        return mysql.createPool(url);
      } catch (e: any) {
        throw new Error(
          `[Corral] MySQL requires 'mysql2' package. Run: npm install mysql2\n` +
          `Original error: ${e.message}`
        );
      }
    }
    default:
      throw new Error(`[Corral] Unknown database adapter: ${adapter}. Use 'sqlite', 'pg', or 'mysql'.`);
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
 * Supports multiple transports: nodemailer (SMTP), resend, postmark, console (dev).
 */
function createEmailSender(config: CorralConfig) {
  const emailConfig = config.auth.email;
  if (!emailConfig) return null;

  const transport = emailConfig.transport || "console";

  switch (transport) {
    case "console":
      // Dev mode: log emails to console
      return async ({ to, subject, body }: { to: string; subject: string; body: string }) => {
        console.log(`\n📧 [Corral Email - Console]\n  To: ${to}\n  Subject: ${subject}\n  Body: ${body}\n`);
      };

    case "smtp":
    case "nodemailer": {
      try {
        const nodemailer = require("nodemailer");
        const transporter = nodemailer.createTransport({
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
        const { Resend } = require("resend");
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
        const postmark = require("postmark");
        const client = new postmark.ServerClient(resolveEnv(emailConfig.postmark?.apiKey, "POSTMARK_API_KEY")!);
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
 * 
 * Pattern: Each provider reads from config first, falls back to env vars.
 * This lets you put client IDs in corral.yaml and secrets in .env.local
 * 
 * Env var convention:
 *   GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET
 *   GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET
 *   APPLE_CLIENT_ID, APPLE_CLIENT_SECRET
 *   DISCORD_CLIENT_ID, DISCORD_CLIENT_SECRET
 *   MICROSOFT_CLIENT_ID, MICROSOFT_CLIENT_SECRET
 *   TWITTER_CLIENT_ID, TWITTER_CLIENT_SECRET
 *   FACEBOOK_CLIENT_ID, FACEBOOK_CLIENT_SECRET
 */
function buildSocialProviders(config: CorralConfig): Record<string, any> {
  const providers: Record<string, any> = {};
  const methods = config.auth.methods;

  const providerMap: Record<string, { idEnv: string; secretEnv: string; extra?: Record<string, any> }> = {
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

    // Three ways to enable: explicit config object, `true` (env-only), or env vars present
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

export function createAuth(config: CorralConfig) {
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

  const database = createDatabaseAdapter(config);
  const emailSender = createEmailSender(config);
  const socialProviders = buildSocialProviders(config);

  // Auto-bootstrap: create tables if they don't exist. Zero manual steps.
  bootstrapDatabase(database, config.database.adapter || "sqlite");

  // ── Plugins ────────────────────────────────────────────────────────

  const plugins: any[] = [admin()];

  // Magic link (passwordless email login)
  if (config.auth.methods.magic_link && emailSender) {
    try {
      const { magicLink } = require("better-auth/plugins");
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

  // Email OTP (6-digit code login)
  if (config.auth.methods.email_otp && emailSender) {
    try {
      const { emailOTP } = require("better-auth/plugins");
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

  // Stripe billing (if configured)
  if (config.billing?.stripe) {
    try {
      const { stripe: stripePlugin } = require("@better-auth/stripe");
      const Stripe = require("stripe");
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

        plugins.push(
          stripePlugin({
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
    database,
    emailAndPassword: {
      enabled: config.auth.methods.email_password !== false,
      // Password reset requires email sender
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
    // Email verification
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
    // Trusted origins for SPA/cross-origin
    ...(config.auth.trusted_origins ? { trustedOrigins: config.auth.trusted_origins } : {}),
  };

  // Social providers (only add if any are configured)
  if (Object.keys(socialProviders).length > 0) {
    authOptions.socialProviders = socialProviders;
  }

  const auth = betterAuth(authOptions);
  return auth;
}
