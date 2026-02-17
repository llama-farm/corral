import { loadConfig } from '../config.js';
import { success, error, info, warn, jsonOutput } from '../util.js';

async function authFetch(baseUrl: string, path: string, options?: RequestInit) {
  const res = await fetch(`${baseUrl}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  return { res, body: await res.json().catch(() => null) };
}

export async function seedCommand(opts: {
  json?: boolean; config: string; url?: string; adminOnly?: boolean;
}) {
  let config;
  try {
    config = loadConfig(opts.config);
  } catch (e: any) {
    error(`Config error: ${e.message}`);
    return;
  }

  const baseUrl = opts.url || process.env.BETTER_AUTH_URL || 'http://localhost:3000';
  const authUrl = `${baseUrl}/api/auth`;
  const created: { type: string; email: string; role?: string; status: string }[] = [];

  info(`Seeding against ${baseUrl}...\n`);

  // 1. Check server is reachable
  try {
    const { res } = await authFetch(authUrl, '/ok');
    if (!res.ok) throw new Error('Not OK');
  } catch {
    error(`Auth server not reachable at ${authUrl}. Is it running?`);
    return;
  }

  // 2. Create admin user
  if (config.seed?.admin) {
    const a = config.seed.admin;
    const password = a.password || 'Admin123!';

    // Sign up
    const { res, body } = await authFetch(authUrl, '/sign-up/email', {
      method: 'POST',
      body: JSON.stringify({ email: a.email, password, name: a.name || 'Admin' }),
    });

    if (body?.user?.id) {
      // Set admin role — sign in first to get session, then use admin API
      const { res: signInRes, body: signInBody } = await authFetch(authUrl, '/sign-in/email', {
        method: 'POST',
        body: JSON.stringify({ email: a.email, password }),
      });

      if (signInBody?.token) {
        const cookie = signInRes.headers.get('set-cookie') || '';
        // Set role to admin via admin API
        const { res: roleRes } = await authFetch(authUrl, '/admin/set-role', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Cookie': cookie },
          body: JSON.stringify({ userId: body.user.id, role: 'admin' }),
        });

        if (roleRes.ok) {
          created.push({ type: 'admin', email: a.email, role: 'admin', status: 'created+admin' });
          success(`Admin: ${a.email} (role: admin) ✓`);
        } else {
          // Role set may fail if this is the first user (chicken-egg problem)
          // Fall back to direct DB update note
          created.push({ type: 'admin', email: a.email, role: 'user', status: 'created (role set manually needed)' });
          warn(`Admin: ${a.email} created but role=admin not set via API.`);
          info(`  Fix: Run SQL: UPDATE user SET role='admin' WHERE email='${a.email}';`);
        }
      }
    } else if (body?.code === 'USER_ALREADY_EXISTS' || body?.message?.includes('already')) {
      created.push({ type: 'admin', email: a.email, status: 'exists' });
      info(`Admin: ${a.email} (already exists)`);
    } else {
      created.push({ type: 'admin', email: a.email, status: `error: ${body?.message || 'unknown'}` });
      error(`Admin: ${a.email} — ${body?.message || 'signup failed'}`);
    }
  }

  // 3. Create test users
  if (!opts.adminOnly && config.seed?.test_users) {
    for (const u of config.seed.test_users) {
      const password = u.password || 'Test123!';
      const { body } = await authFetch(authUrl, '/sign-up/email', {
        method: 'POST',
        body: JSON.stringify({ email: u.email, password, name: u.name || u.email }),
      });

      if (body?.user?.id) {
        created.push({ type: 'user', email: u.email, role: 'user', status: 'created' });
        success(`User: ${u.email} (plan: ${u.plan || 'free'}) ✓`);
      } else if (body?.code === 'USER_ALREADY_EXISTS' || body?.message?.includes('already')) {
        created.push({ type: 'user', email: u.email, status: 'exists' });
        info(`User: ${u.email} (already exists)`);
      } else {
        created.push({ type: 'user', email: u.email, status: `error: ${body?.message || 'unknown'}` });
        warn(`User: ${u.email} — ${body?.message || 'signup failed'}`);
      }
    }
  }

  // Summary
  const newCount = created.filter(c => c.status.includes('created')).length;
  const existCount = created.filter(c => c.status === 'exists').length;

  if (jsonOutput({ created, new: newCount, existing: existCount }, !!opts.json)) return;

  console.log('');
  info(`Seeded ${newCount} new, ${existCount} existing — ${created.length} total`);
}
