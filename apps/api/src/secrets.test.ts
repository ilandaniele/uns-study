import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createDb, migrate, schema, type Db } from "@uns/database";
import { eq } from "drizzle-orm";
import { resolveAppSecrets, resolveOne, resolveVapidKeys } from "./secrets.js";

async function freshDb(): Promise<Db> {
  const db = createDb({ pgliteDir: "memory://" });
  await migrate(db, "");
  return db;
}

describe("resolveAppSecrets", () => {
  const originalBetterAuthSecret = process.env.BETTER_AUTH_SECRET;
  const originalIpHashSalt = process.env.IP_HASH_SALT;

  beforeEach(() => {
    delete process.env.BETTER_AUTH_SECRET;
    delete process.env.IP_HASH_SALT;
  });

  afterEach(() => {
    if (originalBetterAuthSecret === undefined) delete process.env.BETTER_AUTH_SECRET;
    else process.env.BETTER_AUTH_SECRET = originalBetterAuthSecret;
    if (originalIpHashSalt === undefined) delete process.env.IP_HASH_SALT;
    else process.env.IP_HASH_SALT = originalIpHashSalt;
  });

  it("generates and persists a value on first boot, and reuses it on the next boot", async () => {
    const db = await freshDb();

    await resolveAppSecrets(db);
    const firstSecret = process.env.BETTER_AUTH_SECRET;
    const firstSalt = process.env.IP_HASH_SALT;
    expect(firstSecret).toBeTruthy();
    expect(firstSalt).toBeTruthy();
    expect(firstSecret).not.toBe(firstSalt);

    // Simulate a second boot against the same database, with no env vars set.
    delete process.env.BETTER_AUTH_SECRET;
    delete process.env.IP_HASH_SALT;
    await resolveAppSecrets(db);

    expect(process.env.BETTER_AUTH_SECRET).toBe(firstSecret);
    expect(process.env.IP_HASH_SALT).toBe(firstSalt);

    const rows = await db.select().from(schema.appSecrets).orderBy(schema.appSecrets.name);
    expect(rows).toHaveLength(2);
  });

  it("prefers an already-set env var over any stored value", async () => {
    const db = await freshDb();
    await db.insert(schema.appSecrets).values({ name: "better_auth_secret", value: "stored-secret" });

    process.env.BETTER_AUTH_SECRET = "env-secret";
    await resolveAppSecrets(db);

    expect(process.env.BETTER_AUTH_SECRET).toBe("env-secret");
    const [row] = await db.select().from(schema.appSecrets).where(eq(schema.appSecrets.name, "better_auth_secret")).limit(1);
    expect(row?.value).toBe("stored-secret"); // untouched — env var wins without overwriting the DB
  });

  it("is race-safe: concurrent first boots against the same database agree on a single value", async () => {
    // Simulates several instances booting concurrently against the same (already-migrated,
    // still-empty) database, all with the env var unset — they must converge on one generated
    // value rather than each writing/using their own.
    const db = await freshDb();

    const values = await Promise.all(Array.from({ length: 5 }, () => resolveOne(db, "BETTER_AUTH_SECRET", "better_auth_secret")));

    expect(new Set(values).size).toBe(1);
    const rows = await db.select().from(schema.appSecrets).where(eq(schema.appSecrets.name, "better_auth_secret"));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.value).toBe(values[0]);
  });
});

describe("resolveVapidKeys", () => {
  const originalPublic = process.env.VAPID_PUBLIC_KEY;
  const originalPrivate = process.env.VAPID_PRIVATE_KEY;

  beforeEach(() => {
    delete process.env.VAPID_PUBLIC_KEY;
    delete process.env.VAPID_PRIVATE_KEY;
  });

  afterEach(() => {
    if (originalPublic === undefined) delete process.env.VAPID_PUBLIC_KEY;
    else process.env.VAPID_PUBLIC_KEY = originalPublic;
    if (originalPrivate === undefined) delete process.env.VAPID_PRIVATE_KEY;
    else process.env.VAPID_PRIVATE_KEY = originalPrivate;
  });

  it("generates and persists a pair on first boot, and reuses it on the next boot", async () => {
    const db = await freshDb();

    await resolveVapidKeys(db);
    const firstPublic = process.env.VAPID_PUBLIC_KEY;
    const firstPrivate = process.env.VAPID_PRIVATE_KEY;
    expect(firstPublic).toBeTruthy();
    expect(firstPrivate).toBeTruthy();
    expect(firstPublic).not.toBe(firstPrivate);

    delete process.env.VAPID_PUBLIC_KEY;
    delete process.env.VAPID_PRIVATE_KEY;
    await resolveVapidKeys(db);

    expect(process.env.VAPID_PUBLIC_KEY).toBe(firstPublic);
    expect(process.env.VAPID_PRIVATE_KEY).toBe(firstPrivate);

    const rows = await db.select().from(schema.appSecrets).where(eq(schema.appSecrets.name, "vapid_keys"));
    expect(rows).toHaveLength(1);
  });

  it("prefers an already-set env pair over any stored value", async () => {
    const db = await freshDb();
    await db
      .insert(schema.appSecrets)
      .values({ name: "vapid_keys", value: JSON.stringify({ publicKey: "stored-pub", privateKey: "stored-priv" }) });

    process.env.VAPID_PUBLIC_KEY = "env-pub";
    process.env.VAPID_PRIVATE_KEY = "env-priv";
    await resolveVapidKeys(db);

    expect(process.env.VAPID_PUBLIC_KEY).toBe("env-pub");
    expect(process.env.VAPID_PRIVATE_KEY).toBe("env-priv");
  });
});
