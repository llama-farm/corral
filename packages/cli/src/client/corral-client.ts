// @llamafarm/corral-client — SDK for CLI tools to integrate with Corral
//
// Usage in your CLI:
//   import { CorralClient } from '@llamafarm/corral-client';
//   const corral = new CorralClient({ baseURL: 'https://myapp.dev' });
//   await corral.login();
//   const user = await corral.getUser();
//   await corral.requirePlan('pro');

import { readFileSync, writeFileSync, mkdirSync, existsSync, chmodSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { execSync } from 'child_process';

interface CorralClientConfig {
  baseURL: string;
  appName?: string;        // Used for config directory (~/.config/{appName}/)
  tokenPath?: string;      // Override default token storage path
  apiKey?: string;         // Direct API key (skips token storage)
}

interface StoredCredentials {
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
  user: {
    id: string;
    email: string;
    name: string;
    plan: string;
    role: string;
  };
}

interface PlanAccess {
  allowed: boolean;
  currentPlan: string;
  requiredPlan: string;
  upgradeMessage?: string;
  upgradeCommand?: string;
}

interface UsageInfo {
  meterId: string;
  used: number;
  limit: number;
  remaining: number;
  resetAt: string;
}

export class CorralClient {
  private baseURL: string;
  private appName: string;
  private configDir: string;
  private credentialsPath: string;
  private credentials: StoredCredentials | null = null;
  private apiKey: string | null;

  constructor(config: CorralClientConfig) {
    this.baseURL = config.baseURL.replace(/\/$/, '');
    this.appName = config.appName || 'corral';
    this.configDir = join(homedir(), '.config', this.appName);
    this.credentialsPath = config.tokenPath || join(this.configDir, 'credentials.json');
    this.apiKey = config.apiKey || process.env[`${this.appName.toUpperCase()}_TOKEN`] || null;

    // Load stored credentials
    this.loadCredentials();
  }

  // ─── Auth ────────────────────────────────────────────────────────

  /** Device authorization flow — opens browser, polls for approval */
  async login(): Promise<StoredCredentials> {
    // Step 1: Request device authorization
    const authz = await this.fetch('/api/corral/device/authorize', { method: 'POST' });

    const verifyUrl = `${this.baseURL}/device/verify?code=${authz.userCode}`;
    console.log(`🔐 Opening browser to authorize this device...`);
    console.log(`   If browser doesn't open, visit: ${verifyUrl}`);
    console.log(`   Device code: ${authz.userCode}`);
    console.log('');

    // Try to open browser
    try {
      const cmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open';
      execSync(`${cmd} "${verifyUrl}"`, { stdio: 'ignore' });
    } catch {}

    // Step 2: Poll for token
    console.log('   Waiting for authorization...');
    const startTime = Date.now();
    const timeout = (authz.expiresIn || 600) * 1000;
    const interval = (authz.interval || 2) * 1000;

    while (Date.now() - startTime < timeout) {
      await sleep(interval);

      try {
        const result = await this.fetch('/api/corral/device/token', {
          method: 'POST',
          body: { deviceCode: authz.deviceCode },
        });

        if (result.error === 'authorization_pending') {
          process.stdout.write('.');
          continue;
        }

        if (result.accessToken) {
          console.log(' ✓');

          // Get user info with the new token
          this.credentials = {
            accessToken: result.accessToken,
            refreshToken: result.refreshToken,
            expiresAt: result.expiresAt,
            user: { id: '', email: '', name: '', plan: 'free', role: 'user' },
          };

          // Fetch actual user info
          try {
            const session = await this.fetch('/api/auth/get-session');
            if (session?.user) {
              this.credentials.user = session.user;
            }
          } catch {}

          this.saveCredentials();
          console.log(`\n   Logged in as ${this.credentials.user.email} (${this.credentials.user.plan} plan)`);
          console.log(`   Token saved to ${this.credentialsPath}`);
          return this.credentials;
        }
      } catch (err: any) {
        if (err.status === 410) throw new Error('Device code expired. Try again.');
        if (err.status === 403) throw new Error('Authorization denied.');
      }
    }

    throw new Error('Authorization timed out. Try again.');
  }

  /** API key login */
  async loginWithKey(apiKey: string): Promise<StoredCredentials> {
    this.apiKey = apiKey;

    // Verify the key works
    const session = await this.fetch('/api/auth/get-session');
    if (!session?.user) throw new Error('Invalid API key');

    this.credentials = {
      accessToken: apiKey,
      refreshToken: '',
      expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
      user: session.user,
    };
    this.saveCredentials();

    console.log(`   Authenticated as ${session.user.email} (${session.user.plan} plan)`);
    return this.credentials;
  }

  /** Clear stored credentials */
  async logout(): Promise<void> {
    if (this.credentials?.accessToken) {
      try {
        await this.fetch('/api/auth/sign-out', { method: 'POST' });
      } catch {}
    }
    this.credentials = null;
    this.apiKey = null;
    if (existsSync(this.credentialsPath)) {
      writeFileSync(this.credentialsPath, '{}');
    }
    console.log('   Logged out');
  }

  /** Get current user (or null) */
  async getUser(): Promise<StoredCredentials['user'] | null> {
    if (!this.isAuthenticated()) return null;
    return this.credentials?.user || null;
  }

  /** Check if authenticated */
  isAuthenticated(): boolean {
    return !!(this.apiKey || this.credentials?.accessToken);
  }

  // ─── Plan Gating ────────────────────────────────────────────────

  /** Check if user has access to a plan level */
  async checkPlan(requiredPlan: string): Promise<PlanAccess> {
    const user = await this.getUser();
    if (!user) {
      return {
        allowed: false,
        currentPlan: 'none',
        requiredPlan,
        upgradeMessage: `Authentication required. Run: ${this.appName} login`,
        upgradeCommand: `${this.appName} login`,
      };
    }

    const planRank: Record<string, number> = { free: 0, pro: 1, team: 2, enterprise: 3 };
    const userRank = planRank[user.plan] ?? 0;
    const reqRank = planRank[requiredPlan] ?? 1;

    if (userRank >= reqRank) {
      return { allowed: true, currentPlan: user.plan, requiredPlan };
    }

    return {
      allowed: false,
      currentPlan: user.plan,
      requiredPlan,
      upgradeMessage: `This feature requires the ${requiredPlan} plan. You're on ${user.plan}.`,
      upgradeCommand: `${this.appName} account upgrade`,
    };
  }

  /** Require a plan — exits with upgrade message if not met */
  async requirePlan(plan: string): Promise<void> {
    const access = await this.checkPlan(plan);
    if (!access.allowed) {
      console.error(`\n⚡ ${access.upgradeMessage}`);
      if (access.upgradeCommand) {
        console.error(`   → Run: ${access.upgradeCommand}\n`);
      }
      process.exit(1);
    }
  }

  // ─── Billing ─────────────────────────────────────────────────────

  /** Open upgrade flow — creates checkout + opens browser + polls */
  async upgrade(planId: string): Promise<boolean> {
    if (!this.isAuthenticated()) {
      console.log('   Please log in first.');
      await this.login();
    }

    console.log(`\n🔗 Creating checkout for ${planId}...`);

    const { url } = await this.fetch('/api/corral/checkout', {
      method: 'POST',
      body: { planId },
    });

    console.log(`   Opening checkout in browser...`);
    console.log(`   If browser doesn't open, visit: ${url}`);

    try {
      const cmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open';
      execSync(`${cmd} "${url}"`, { stdio: 'ignore' });
    } catch {}

    // Poll for plan change
    console.log('\n   Waiting for payment...');
    const startTime = Date.now();
    const timeout = 5 * 60 * 1000; // 5 min

    while (Date.now() - startTime < timeout) {
      await sleep(3000);
      try {
        const status = await this.fetch('/api/corral/subscription/status');
        if (status.plan && status.plan !== 'free' && status.plan !== this.credentials?.user?.plan) {
          console.log(` ✓`);
          console.log(`\n🎉 Upgraded to ${status.plan}! New features are available immediately.\n`);
          if (this.credentials) {
            this.credentials.user.plan = status.plan;
            this.saveCredentials();
          }
          return true;
        }
      } catch {}
      process.stdout.write('.');
    }

    console.log('\n   Timed out waiting for payment. Check your browser.');
    return false;
  }

  /** Get subscription info */
  async getSubscription(): Promise<any> {
    return this.fetch('/api/corral/billing');
  }

  // ─── Usage Tracking ──────────────────────────────────────────────

  /** Track a usage event */
  async track(meterId: string, count: number = 1): Promise<UsageInfo> {
    return this.fetch('/api/corral/usage/track', {
      method: 'POST',
      body: { meterId, count },
    });
  }

  /** Get current usage for a meter */
  async getUsage(meterId: string): Promise<UsageInfo> {
    return this.fetch(`/api/corral/usage/${meterId}`);
  }

  /** Check if usage is within limits */
  async checkUsage(meterId: string): Promise<{ allowed: boolean; usage: UsageInfo }> {
    const usage = await this.getUsage(meterId);
    return {
      allowed: usage.remaining > 0,
      usage,
    };
  }

  // ─── Internal ────────────────────────────────────────────────────

  private async fetch(path: string, opts?: { method?: string; body?: any }): Promise<any> {
    const url = `${this.baseURL}${path}`;
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };

    // Add auth
    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    } else if (this.credentials?.accessToken) {
      headers['Authorization'] = `Bearer ${this.credentials.accessToken}`;
    }

    const res = await globalThis.fetch(url, {
      method: opts?.method || 'GET',
      headers,
      body: opts?.body ? JSON.stringify(opts.body) : undefined,
    });

    const text = await res.text();
    const data = text ? JSON.parse(text) : null;

    if (!res.ok && res.status !== 202) {
      const err = new Error(data?.error || `HTTP ${res.status}`) as any;
      err.status = res.status;
      throw err;
    }

    return data;
  }

  private loadCredentials(): void {
    try {
      if (existsSync(this.credentialsPath)) {
        const raw = readFileSync(this.credentialsPath, 'utf-8');
        const parsed = JSON.parse(raw);
        if (parsed.accessToken) {
          this.credentials = parsed;

          // Check expiry
          if (this.credentials && new Date(this.credentials.expiresAt) < new Date()) {
            console.error(`   Session expired. Run: ${this.appName} login`);
            this.credentials = null;
          }
        }
      }
    } catch {}
  }

  private saveCredentials(): void {
    try {
      mkdirSync(this.configDir, { recursive: true });
      writeFileSync(this.credentialsPath, JSON.stringify(this.credentials, null, 2));
      // Secure permissions (owner read/write only)
      try { chmodSync(this.credentialsPath, 0o600); } catch {}
    } catch (err: any) {
      console.error(`   Warning: couldn't save credentials: ${err.message}`);
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
