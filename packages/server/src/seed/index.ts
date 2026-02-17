import type { CorralConfig } from "../config/schema.js";

export async function seedData(config: CorralConfig, auth: any): Promise<void> {
  const ctx = auth.api;
  if (!config.seed) return;

  // Create admin user
  if (config.seed.admin) {
    const { email, password, name } = config.seed.admin;
    try {
      const existing = await ctx.getUser?.({ query: { email } }).catch(() => null);
      if (!existing) {
        await ctx.signUpEmail({ body: { email, password, name } });
        console.log(`[corral] Created admin user: ${email}`);
      }
    } catch (err) {
      console.warn(`[corral] Admin seed skipped (may already exist):`, err);
    }
  }

  // Create test users
  for (const user of config.seed.test_users) {
    try {
      await ctx.signUpEmail({
        body: { email: user.email, password: user.password, name: user.name },
      });
      console.log(`[corral] Created test user: ${user.email}`);
    } catch {
      // Already exists
    }
  }
}
