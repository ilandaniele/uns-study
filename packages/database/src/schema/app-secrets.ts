import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

/**
 * Server-generated secrets (e.g. `BETTER_AUTH_SECRET`, `IP_HASH_SALT`) that don't need to be
 * hand-typed at deploy time. First boot generates and persists a value here (race-safe via
 * `ON CONFLICT DO NOTHING`); subsequent boots reuse it unless an env var of the same name
 * overrides it. Rotating a secret = delete its row + restart (this invalidates all sessions for
 * `BETTER_AUTH_SECRET`).
 */
export const appSecrets = pgTable("app_secrets", {
  name: text("name").primaryKey(),
  value: text("value").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
