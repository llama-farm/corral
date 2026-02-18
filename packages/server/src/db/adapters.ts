/**
 * Pluggable Database Adapter System for Corral.
 *
 * Provides a uniform interface over different database backends so that
 * the same Corral server code runs on Node.js (better-sqlite3, pg, mysql2)
 * **and** serverless/edge runtimes (Neon, PlanetScale, Cloudflare D1, Turso).
 *
 * Each adapter returns two things:
 *  1. `instance` — the raw driver object that Better Auth expects as its `database` option.
 *  2. `exec(sql)` — a simple "run this DDL" helper used for table bootstrapping.
 */

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface DatabaseAdapter {
  /** The value to pass to `betterAuth({ database: … })` */
  instance: unknown;
  /** Execute one or more DDL statements (bootstrap / migration). */
  exec(sql: string): Promise<void>;
  /** Optional cleanup (close pool, etc.) */
  close?(): Promise<void>;
  /** Adapter name for logging */
  readonly name: string;
}

export type AdapterFactory = (url: string, opts?: Record<string, unknown>) => Promise<DatabaseAdapter>;

// ---------------------------------------------------------------------------
// Built-in adapter factories
// ---------------------------------------------------------------------------

/**
 * SQLite via `better-sqlite3` (Node.js only — synchronous FFI driver).
 */
export async function sqliteAdapter(url: string): Promise<DatabaseAdapter> {
  const { default: Database } = await import("better-sqlite3" as string);
  const dbPath = url.replace(/^file:/, "") || "./corral.db";
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");

  return {
    name: "sqlite",
    instance: db,
    async exec(sql: string) {
      db.exec(sql);
    },
    async close() {
      db.close();
    },
  };
}

/**
 * PostgreSQL via `pg` (Node.js — standard libpq binding).
 */
export async function pgAdapter(url: string): Promise<DatabaseAdapter> {
  const pg = await import("pg" as string);
  const Pool = pg.default?.Pool ?? pg.Pool;
  const pool = new Pool({ connectionString: url });

  return {
    name: "pg",
    instance: pool,
    async exec(sql: string) {
      await pool.query(sql);
    },
    async close() {
      await pool.end();
    },
  };
}

/**
 * PostgreSQL via `@neondatabase/serverless` — works in Workers / Edge.
 */
export async function neonAdapter(url: string): Promise<DatabaseAdapter> {
  const { Pool } = await import("@neondatabase/serverless" as string);
  const pool = new Pool({ connectionString: url });

  return {
    name: "neon",
    instance: pool,
    async exec(ddl: string) {
      await pool.query(ddl);
    },
    async close() {
      await pool.end();
    },
  };
}

/**
 * MySQL via `mysql2/promise` (Node.js).
 */
export async function mysqlAdapter(url: string): Promise<DatabaseAdapter> {
  const mysql = await import("mysql2/promise" as string);
  const mod = mysql.default ?? mysql;
  const pool = mod.createPool(url);

  return {
    name: "mysql",
    instance: pool,
    async exec(sql: string) {
      await pool.query(sql);
    },
    async close() {
      await pool.end();
    },
  };
}

/**
 * Turso / libSQL — edge-friendly SQLite.
 */
export async function tursoAdapter(url: string, opts?: Record<string, unknown>): Promise<DatabaseAdapter> {
  const { createClient } = await import("@libsql/client" as string);
  const client = createClient({
    url,
    authToken: (opts?.authToken as string) ?? (typeof process !== "undefined" ? process.env?.TURSO_AUTH_TOKEN : undefined),
  });

  return {
    name: "turso",
    instance: { db: client, type: "sqlite" },
    async exec(sql: string) {
      // libSQL doesn't support multi-statement exec; split on semicolons.
      // SAFETY: This naive splitting is fine because the DDL is generated
      // internally by Corral (see bootstrap.ts), never from user input.
      // None of the internal DDL contains semicolons within string literals.
      const statements = sql
        .split(";")
        .map((s) => s.trim())
        .filter(Boolean);
      for (const stmt of statements) {
        await client.execute(stmt);
      }
    },
    async close() {
      client.close();
    },
  };
}

/**
 * Cloudflare D1 — pass the D1Database binding directly.
 *
 * Unlike other adapters this one is **synchronous** (the binding is already
 * available at request time), so we accept the binding object instead of a URL.
 */
export function d1Adapter(binding: unknown): DatabaseAdapter {
  const d1 = binding as { exec(sql: string): Promise<unknown> };
  return {
    name: "d1",
    instance: { db: binding, type: "sqlite" },
    async exec(sql: string) {
      await d1.exec(sql);
    },
  };
}

/**
 * PlanetScale via `@planetscale/database` — edge-friendly MySQL over HTTP.
 */
export async function planetscaleAdapter(url: string): Promise<DatabaseAdapter> {
  const { connect } = await import("@planetscale/database" as string);
  const conn = connect({ url });

  return {
    name: "planetscale",
    instance: conn,
    async exec(sql: string) {
      // PlanetScale doesn't support multi-statement; split on semicolons.
      // SAFETY: This naive splitting is fine because the DDL is generated
      // internally by Corral (see bootstrap.ts), never from user input.
      // None of the internal DDL contains semicolons within string literals.
      const statements = sql
        .split(";")
        .map((s) => s.trim())
        .filter(Boolean);
      for (const stmt of statements) {
        await conn.execute(stmt);
      }
    },
  };
}

// ---------------------------------------------------------------------------
// Registry — resolve adapter name → factory
// ---------------------------------------------------------------------------

const ADAPTER_MAP: Record<string, AdapterFactory> = {
  sqlite: sqliteAdapter,
  pg: pgAdapter,
  postgres: pgAdapter,
  postgresql: pgAdapter,
  neon: neonAdapter,
  mysql: mysqlAdapter,
  turso: tursoAdapter,
  libsql: tursoAdapter,
  planetscale: planetscaleAdapter,
};

/**
 * Create a database adapter by name.
 *
 * ```ts
 * const adapter = await createAdapter("pg", process.env.DATABASE_URL!);
 * ```
 */
export async function createAdapter(
  name: string,
  url: string,
  opts?: Record<string, unknown>,
): Promise<DatabaseAdapter> {
  const factory = ADAPTER_MAP[name];
  if (!factory) {
    const known = Object.keys(ADAPTER_MAP).join(", ");
    throw new Error(
      `[Corral] Unknown database adapter "${name}". Supported: ${known}`,
    );
  }
  return factory(url, opts);
}

/**
 * Register a custom adapter factory at runtime.
 */
export function registerAdapter(name: string, factory: AdapterFactory): void {
  ADAPTER_MAP[name] = factory;
}
