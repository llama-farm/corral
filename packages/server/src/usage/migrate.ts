export async function migrateUsageTables(db: any): Promise<void> {
  // Create usage_events table
  await db.schema
    .createTable("usage_events")
    .ifNotExists()
    .addColumn("id", "text", (col: any) => col.primaryKey())
    .addColumn("user_id", "text", (col: any) => col.notNull())
    .addColumn("meter", "text", (col: any) => col.notNull())
    .addColumn("quantity", "integer", (col: any) => col.notNull().defaultTo(1))
    .addColumn("metadata", "text")
    .addColumn("created_at", "text", (col: any) => col.notNull())
    .addColumn("period", "text", (col: any) => col.notNull())
    .execute();

  // Create index
  try {
    await db.schema
      .createIndex("idx_usage_events_lookup")
      .ifNotExists()
      .on("usage_events")
      .columns(["user_id", "meter", "period"])
      .execute();
  } catch {
    // Index may already exist
  }

  // Create product_config table
  await db.schema
    .createTable("product_config")
    .ifNotExists()
    .addColumn("id", "text", (col: any) => col.primaryKey())
    .addColumn("plan", "text", (col: any) => col.notNull())
    .addColumn("meter", "text", (col: any) => col.notNull())
    .addColumn("limit_value", "integer", (col: any) => col.notNull())
    .addColumn("created_at", "text", (col: any) => col.notNull())
    .addColumn("updated_at", "text", (col: any) => col.notNull())
    .execute();
}
