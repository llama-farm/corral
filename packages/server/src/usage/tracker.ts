// Use Web Crypto API (available in Node 19+, Workers, Deno, etc.)
import type { CorralConfig } from '../config/schema.js';

/**
 * Create a usage tracker for metered billing.
 * Works with both better-sqlite3 (sync .prepare/.run) and pg (async .query).
 */
export function createUsageTracker(db: any, config: CorralConfig) {
  const isPg = typeof db.query === 'function' && typeof db.prepare !== 'function';

  function currentPeriod(): { start: string; end: string } {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    return {
      start: start.toISOString().slice(0, 10),
      end: end.toISOString().slice(0, 10),
    };
  }

  function getPlanLimits(userId: string): Record<string, number> {
    // Look up user's plan from config meters
    const limits: Record<string, number> = {};
    const meters = config.meters || {};
    for (const [id, meter] of Object.entries(meters)) {
      if (meter.limits != null) {
        // Get the first available limit as default
        const firstLimit = Object.values(meter.limits)[0];
        if (firstLimit != null) limits[id] = firstLimit;
      }
    }
    return limits;
  }

  return {
    async increment(userId: string, meterId: string, amount: number = 1) {
      const { start, end } = currentPeriod();
      const id = crypto.randomUUID();

      if (isPg) {
        await db.query(
          `INSERT INTO "usage" (id, "userId", "meterId", count, "periodStart", "periodEnd")
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT ("userId", "meterId", "periodStart")
           DO UPDATE SET count = "usage".count + $4`,
          [id, userId, meterId, amount, start, end]
        );
      } else {
        db.prepare(
          `INSERT INTO "usage" (id, userId, meterId, count, periodStart, periodEnd)
           VALUES (?, ?, ?, ?, ?, ?)
           ON CONFLICT (userId, meterId, periodStart)
           DO UPDATE SET count = count + excluded.count`
        ).run(id, userId, meterId, amount, start, end);
      }
    },

    async get(userId: string, meterId?: string) {
      const { start } = currentPeriod();

      if (isPg) {
        const where = meterId
          ? `"userId" = $1 AND "meterId" = $2 AND "periodStart" = $3`
          : `"userId" = $1 AND "periodStart" = $2`;
        const params = meterId ? [userId, meterId, start] : [userId, start];
        const result = await db.query(`SELECT * FROM "usage" WHERE ${where}`, params);
        return result.rows;
      } else {
        const where = meterId
          ? `userId = ? AND meterId = ? AND periodStart = ?`
          : `userId = ? AND periodStart = ?`;
        const params = meterId ? [userId, meterId, start] : [userId, start];
        return db.prepare(`SELECT * FROM "usage" WHERE ${where}`).all(...params);
      }
    },

    async checkLimit(userId: string, meterId: string) {
      const limits = getPlanLimits(userId);
      const limit = limits[meterId] ?? Infinity;
      const rows = await this.get(userId, meterId);
      const current = rows.length > 0 ? (rows[0].count ?? 0) : 0;
      const remaining = Math.max(0, limit - current);
      return { allowed: current < limit, current, limit, remaining };
    },

    async reset(meterId: string) {
      const { start } = currentPeriod();

      if (isPg) {
        await db.query(
          `DELETE FROM "usage" WHERE "meterId" = $1 AND "periodStart" < $2`,
          [meterId, start]
        );
      } else {
        db.prepare(
          `DELETE FROM "usage" WHERE meterId = ? AND periodStart < ?`
        ).run(meterId, start);
      }
    },
  };
}
