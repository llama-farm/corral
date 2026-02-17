const BASE_STYLES = `
  body { margin: 0; padding: 0; background: #f1f5f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
  .container { max-width: 560px; margin: 40px auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
  .header { background: linear-gradient(135deg, #4f46e5, #6366f1); padding: 32px 40px; text-align: center; }
  .header h1 { color: #ffffff; margin: 0; font-size: 22px; font-weight: 600; }
  .body { padding: 32px 40px; color: #334155; line-height: 1.6; font-size: 15px; }
  .body h2 { color: #1e293b; margin: 0 0 16px; font-size: 20px; }
  .body p { margin: 0 0 16px; }
  .btn { display: inline-block; background: #4f46e5; color: #ffffff !important; text-decoration: none; padding: 12px 32px; border-radius: 8px; font-weight: 600; font-size: 15px; }
  .code { display: inline-block; background: #f1f5f9; color: #4f46e5; font-size: 32px; letter-spacing: 6px; padding: 12px 24px; border-radius: 8px; font-weight: 700; font-family: monospace; }
  .footer { padding: 24px 40px; text-align: center; color: #94a3b8; font-size: 13px; border-top: 1px solid #e2e8f0; }
`;

function wrap(appName: string, content: string): string {
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><style>${BASE_STYLES}</style></head>
<body><div class="container">
  <div class="header"><h1>${appName}</h1></div>
  <div class="body">${content}</div>
  <div class="footer">&copy; ${new Date().getFullYear()} ${appName}. All rights reserved.</div>
</div></body></html>`;
}

const TEMPLATES: Record<string, (vars: Record<string, string>) => string> = {
  'magic-link': (v) => wrap(v.APP_NAME || 'App', `
    <h2>Sign in to ${v.APP_NAME || 'your account'}</h2>
    <p>Click the button below to sign in. This link expires in 15 minutes.</p>
    <p style="text-align:center;margin:24px 0"><a class="btn" href="${v.URL}">Sign In</a></p>
    <p style="color:#94a3b8;font-size:13px">If you didn't request this, you can safely ignore this email.</p>
  `),

  'email-otp': (v) => wrap(v.APP_NAME || 'App', `
    <h2>Your verification code</h2>
    <p>Use the code below to verify your identity. It expires in 10 minutes.</p>
    <p style="text-align:center;margin:24px 0"><span class="code">${v.OTP}</span></p>
    <p style="color:#94a3b8;font-size:13px">If you didn't request this code, please ignore this email.</p>
  `),

  'password-reset': (v) => wrap(v.APP_NAME || 'App', `
    <h2>Reset your password</h2>
    <p>Hi${v.USER_NAME ? ` ${v.USER_NAME}` : ''}, we received a request to reset your password.</p>
    <p style="text-align:center;margin:24px 0"><a class="btn" href="${v.URL}">Reset Password</a></p>
    <p style="color:#94a3b8;font-size:13px">This link expires in 1 hour. If you didn't request a reset, no action is needed.</p>
  `),

  'email-verification': (v) => wrap(v.APP_NAME || 'App', `
    <h2>Verify your email</h2>
    <p>Thanks for signing up${v.USER_NAME ? `, ${v.USER_NAME}` : ''}! Please verify your email address.</p>
    <p style="text-align:center;margin:24px 0"><a class="btn" href="${v.URL}">Verify Email</a></p>
    <p style="color:#94a3b8;font-size:13px">If you didn't create an account, you can ignore this email.</p>
  `),

  'welcome': (v) => wrap(v.APP_NAME || 'App', `
    <h2>Welcome to ${v.APP_NAME || 'the app'}! 🎉</h2>
    <p>Hi${v.USER_NAME ? ` ${v.USER_NAME}` : ''}, your account is all set up and ready to go.</p>
    <p>Here's what you can do next:</p>
    <ul style="padding-left:20px;margin:16px 0">
      <li>Explore your dashboard</li>
      <li>Complete your profile</li>
      <li>Check out our documentation</li>
    </ul>
    ${v.URL ? `<p style="text-align:center;margin:24px 0"><a class="btn" href="${v.URL}">Get Started</a></p>` : ''}
  `),
};

/**
 * Render an email template with variable substitution.
 * 
 * Templates: magic-link, email-otp, password-reset, email-verification, welcome
 * Variables: {{APP_NAME}}, {{URL}}, {{OTP}}, {{USER_NAME}}, etc.
 */
export function renderEmail(template: string, vars: Record<string, string>): string {
  const fn = TEMPLATES[template];
  if (!fn) {
    // Fallback: treat template as raw HTML with {{VAR}} substitution
    let html = template;
    for (const [key, val] of Object.entries(vars)) {
      html = html.replaceAll(`{{${key}}}`, val);
    }
    return html;
  }
  return fn(vars);
}

/** List available template names */
export function listTemplates(): string[] {
  return Object.keys(TEMPLATES);
}
