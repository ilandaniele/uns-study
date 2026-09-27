import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import type { Db } from "@uns/database";
import { schema } from "@uns/database";

/**
 * Env var name -> `app_secrets.name` for values the API can generate itself, so deploying never
 * requires hand-typing a generated secret. Keep this list in sync with `env.ts`'s
 * `betterAuthSecret` / `ipHashSalt` fields.
 */
const AUTO_GENERATED_SECRETS: Record<string, string> = {
  BETTER_AUTH_SECRET: "better_auth_secret",
  IP_HASH_SALT: "ip_hash_salt",
};

/** Exported for tests exercising the race-safety of a single secret in isolation. */
export async function resolveOne(db: Db, envVar: string, dbName: string): Promise<string> {
  const fromEnv = process.env[envVar];
  if (fromEnv) return fromEnv;

  const [existing] = await db.select().from(schema.appSecrets).where(eq(schema.appSecrets.name, dbName)).limit(1);
  if (existing) return existing.value;

  // First boot: generate and try to persist. `ON CONFLICT DO NOTHING` + re-select makes this
  // race-safe when multiple instances boot concurrently — whichever insert wins, everyone ends up
  // reading the same row back.
  const generated = randomBytes(32).toString("base64url");
  await db.insert(schema.appSecrets).values({ name: dbName, value: generated }).onConflictDoNothing();

  const [row] = await db.select().from(schema.appSecrets).where(eq(schema.appSecrets.name, dbName)).limit(1);
  if (!row) throw new Error(`Failed to resolve app secret "${dbName}" after insert.`);
  return row.value;
}

/**
 * Ensures `BETTER_AUTH_SECRET` and `IP_HASH_SALT` are present in `process.env` before anything
 * else reads them. An already-set env var always wins (and is left out of the DB); otherwise the
 * value is read from — or, on first boot, generated into — the `app_secrets` table. Never logs
 * the resolved values.
 *
 * Must be called (and awaited) before `./env.js` is first imported anywhere in the process, since
 * `env.ts` captures these into plain fields at module-evaluation time.
 */
export async function resolveAppSecrets(db: Db): Promise<void> {
  for (const [envVar, dbName] of Object.entries(AUTO_GENERATED_SECRETS)) {
    process.env[envVar] = await resolveOne(db, envVar, dbName);
  }
}
