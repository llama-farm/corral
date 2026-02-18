/**
 * Auto-bootstrap database for Better Auth.
 *
 * Uses the DatabaseAdapter interface so the same bootstrap logic works across
 * SQLite, PostgreSQL, MySQL, Turso, Neon, PlanetScale, D1, etc.
 */

import type { DatabaseAdapter } from "./adapters.js";

const BETTER_AUTH_TABLES_SQLITE = `
  CREATE TABLE IF NOT EXISTS "user" (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    emailVerified INTEGER NOT NULL DEFAULT 0,
    image TEXT,
    createdAt TEXT NOT NULL DEFAULT (datetime('now')),
    updatedAt TEXT NOT NULL DEFAULT (datetime('now')),
    role TEXT DEFAULT 'user',
    banned INTEGER DEFAULT 0,
    banReason TEXT,
    banExpires TEXT
  );

  CREATE TABLE IF NOT EXISTS "session" (
    id TEXT PRIMARY KEY,
    userId TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
    token TEXT NOT NULL UNIQUE,
    expiresAt TEXT NOT NULL,
    ipAddress TEXT,
    userAgent TEXT,
    createdAt TEXT NOT NULL DEFAULT (datetime('now')),
    updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS "account" (
    id TEXT PRIMARY KEY,
    userId TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
    accountId TEXT NOT NULL,
    providerId TEXT NOT NULL,
    accessToken TEXT,
    refreshToken TEXT,
    accessTokenExpiresAt TEXT,
    refreshTokenExpiresAt TEXT,
    scope TEXT,
    password TEXT,
    createdAt TEXT NOT NULL DEFAULT (datetime('now')),
    updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS "verification" (
    id TEXT PRIMARY KEY,
    identifier TEXT NOT NULL,
    value TEXT NOT NULL,
    expiresAt TEXT NOT NULL,
    createdAt TEXT NOT NULL DEFAULT (datetime('now')),
    updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_session_token ON "session"(token);
  CREATE INDEX IF NOT EXISTS idx_session_userId ON "session"(userId);
  CREATE INDEX IF NOT EXISTS idx_account_userId ON "account"(userId);
  CREATE INDEX IF NOT EXISTS idx_user_email ON "user"(email);
`;

const BETTER_AUTH_TABLES_PG = `
  CREATE TABLE IF NOT EXISTS "user" (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    image TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    role TEXT DEFAULT 'user',
    banned BOOLEAN DEFAULT false,
    "banReason" TEXT,
    "banExpires" TIMESTAMPTZ
  );

  CREATE TABLE IF NOT EXISTS "session" (
    id TEXT PRIMARY KEY,
    "userId" TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
    token TEXT NOT NULL UNIQUE,
    "expiresAt" TIMESTAMPTZ NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS "account" (
    id TEXT PRIMARY KEY,
    "userId" TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
    "accountId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "accessTokenExpiresAt" TIMESTAMPTZ,
    "refreshTokenExpiresAt" TIMESTAMPTZ,
    scope TEXT,
    password TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS "verification" (
    id TEXT PRIMARY KEY,
    identifier TEXT NOT NULL,
    value TEXT NOT NULL,
    "expiresAt" TIMESTAMPTZ NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE INDEX IF NOT EXISTS idx_session_token ON "session"(token);
  CREATE INDEX IF NOT EXISTS idx_session_userId ON "session"("userId");
  CREATE INDEX IF NOT EXISTS idx_account_userId ON "account"("userId");
  CREATE INDEX IF NOT EXISTS idx_user_email ON "user"(email);
`;

const USAGE_TABLES_SQLITE = `
  CREATE TABLE IF NOT EXISTS "usage_events" (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    userId TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
    meterId TEXT NOT NULL,
    value REAL NOT NULL DEFAULT 1,
    createdAt TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS "product_config" (
    id TEXT PRIMARY KEY,
    config TEXT NOT NULL,
    updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_usage_user_meter ON "usage_events"(userId, meterId);
  CREATE INDEX IF NOT EXISTS idx_usage_created ON "usage_events"(createdAt);

  CREATE TABLE IF NOT EXISTS "usage" (
    id TEXT PRIMARY KEY,
    userId TEXT NOT NULL,
    meterId TEXT NOT NULL,
    count INTEGER DEFAULT 0,
    periodStart TEXT NOT NULL,
    periodEnd TEXT NOT NULL,
    UNIQUE(userId, meterId, periodStart)
  );

  CREATE INDEX IF NOT EXISTS idx_usage_user_meter_period ON "usage"(userId, meterId, periodStart);
`;

const USAGE_TABLES_PG = `
  CREATE TABLE IF NOT EXISTS "usage_events" (
    id SERIAL PRIMARY KEY,
    "userId" TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
    "meterId" TEXT NOT NULL,
    value REAL NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS "product_config" (
    id TEXT PRIMARY KEY,
    config JSONB NOT NULL,
    "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE INDEX IF NOT EXISTS idx_usage_user_meter ON "usage_events"("userId", "meterId");
  CREATE INDEX IF NOT EXISTS idx_usage_created ON "usage_events"("createdAt");

  CREATE TABLE IF NOT EXISTS "usage" (
    id TEXT PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "meterId" TEXT NOT NULL,
    count INTEGER DEFAULT 0,
    "periodStart" TEXT NOT NULL,
    "periodEnd" TEXT NOT NULL,
    UNIQUE("userId", "meterId", "periodStart")
  );

  CREATE INDEX IF NOT EXISTS idx_usage_user_meter_period ON "usage"("userId", "meterId", "periodStart");
`;

const BETTER_AUTH_TABLES_MYSQL = `
  CREATE TABLE IF NOT EXISTS \`user\` (
    id VARCHAR(255) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    emailVerified BOOLEAN NOT NULL DEFAULT false,
    image TEXT,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    role VARCHAR(255) DEFAULT 'user',
    banned BOOLEAN DEFAULT false,
    banReason TEXT,
    banExpires DATETIME
  );

  CREATE TABLE IF NOT EXISTS \`session\` (
    id VARCHAR(255) PRIMARY KEY,
    userId VARCHAR(255) NOT NULL,
    token VARCHAR(255) NOT NULL UNIQUE,
    expiresAt DATETIME NOT NULL,
    ipAddress VARCHAR(255),
    userAgent TEXT,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (userId) REFERENCES \`user\`(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS \`account\` (
    id VARCHAR(255) PRIMARY KEY,
    userId VARCHAR(255) NOT NULL,
    accountId VARCHAR(255) NOT NULL,
    providerId VARCHAR(255) NOT NULL,
    accessToken TEXT,
    refreshToken TEXT,
    accessTokenExpiresAt DATETIME,
    refreshTokenExpiresAt DATETIME,
    scope TEXT,
    password TEXT,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (userId) REFERENCES \`user\`(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS \`verification\` (
    id VARCHAR(255) PRIMARY KEY,
    identifier VARCHAR(255) NOT NULL,
    value TEXT NOT NULL,
    expiresAt DATETIME NOT NULL,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  );
`;

const USAGE_TABLES_MYSQL = `
  CREATE TABLE IF NOT EXISTS \`usage_events\` (
    id INT AUTO_INCREMENT PRIMARY KEY,
    userId VARCHAR(255) NOT NULL,
    meterId VARCHAR(255) NOT NULL,
    value DOUBLE NOT NULL DEFAULT 1,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (userId) REFERENCES \`user\`(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS \`product_config\` (
    id VARCHAR(255) PRIMARY KEY,
    config JSON NOT NULL,
    updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS \`usage\` (
    id VARCHAR(255) PRIMARY KEY,
    userId VARCHAR(255) NOT NULL,
    meterId VARCHAR(255) NOT NULL,
    count INT DEFAULT 0,
    periodStart VARCHAR(255) NOT NULL,
    periodEnd VARCHAR(255) NOT NULL,
    UNIQUE KEY uq_usage_user_meter_period (userId, meterId, periodStart)
  );
`;

/** Adapters that use SQLite-flavoured DDL */
const SQLITE_ADAPTERS = new Set(["sqlite", "turso", "libsql", "d1"]);

/** Adapters that use MySQL-flavoured DDL */
const MYSQL_ADAPTERS = new Set(["mysql", "planetscale"]);

/**
 * Bootstrap the database: create all tables if they don't exist.
 * Accepts a DatabaseAdapter (preferred) or a raw driver + adapter name (legacy).
 */
export async function bootstrapDatabase(
  adapterOrDb: DatabaseAdapter | any,
  adapterName?: string,
): Promise<void> {
  // New path: DatabaseAdapter object
  if (adapterOrDb && typeof adapterOrDb === "object" && "exec" in adapterOrDb && "name" in adapterOrDb) {
    const adapter = adapterOrDb as DatabaseAdapter;
    const isSqlite = SQLITE_ADAPTERS.has(adapter.name);
    const isMysql = MYSQL_ADAPTERS.has(adapter.name);
    const authDDL = isSqlite ? BETTER_AUTH_TABLES_SQLITE : isMysql ? BETTER_AUTH_TABLES_MYSQL : BETTER_AUTH_TABLES_PG;
    const usageDDL = isSqlite ? USAGE_TABLES_SQLITE : isMysql ? USAGE_TABLES_MYSQL : USAGE_TABLES_PG;

    try {
      await adapter.exec(authDDL);
    } catch (e: any) {
      console.error("[Corral] Failed to bootstrap auth tables:", e.message);
    }
    try {
      await adapter.exec(usageDDL);
    } catch (e: any) {
      console.error("[Corral] Failed to bootstrap usage tables:", e.message);
    }
    return;
  }

  // Legacy path: raw driver object (backwards compat)
  const db = adapterOrDb;
  const isPg = adapterName === "pg" || adapterName === "postgres" || adapterName === "postgresql";

  if (isPg) {
    if (typeof db.query === "function") {
      db.query(BETTER_AUTH_TABLES_PG).catch((e: any) => {
        console.error("[Corral] Failed to bootstrap PG auth tables:", e.message);
      });
      db.query(USAGE_TABLES_PG).catch((e: any) => {
        console.error("[Corral] Failed to bootstrap PG usage tables:", e.message);
      });
    }
  } else {
    if (typeof db.exec === "function") {
      try {
        db.pragma?.("journal_mode = WAL");
        db.exec(BETTER_AUTH_TABLES_SQLITE);
        db.exec(USAGE_TABLES_SQLITE);
      } catch (e: any) {
        console.error("[Corral] Failed to bootstrap SQLite tables:", e.message);
      }
    }
  }
}
