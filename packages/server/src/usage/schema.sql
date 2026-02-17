CREATE TABLE IF NOT EXISTS usage_events (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  meter TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  metadata TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  period TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_usage_events_lookup
  ON usage_events (user_id, meter, period);

CREATE INDEX IF NOT EXISTS idx_usage_events_created
  ON usage_events (created_at);

CREATE TABLE IF NOT EXISTS product_config (
  id TEXT PRIMARY KEY,
  plan TEXT NOT NULL,
  meter TEXT NOT NULL,
  limit_value INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_product_config_lookup
  ON product_config (plan, meter);
