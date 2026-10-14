import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Db } from "./client.js";
import { seedInitialRoom } from "./seed.js";
import * as schema from "./schema/index.js";

const migrationsFolder = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "migrations");

export interface TestDbOptions {
  /** A serialized, already-migrated database (see `buildTemplate`). */
  template?: Buffer;
  logger?: { logQuery(query: string, params: unknown[]): void };
}

/** Node only: in-memory better-sqlite3 database with foreign keys on. */
export function createTestDb(opts: TestDbOptions = {}): Db {
  const sqlite = opts.template ? new Database(opts.template) : new Database(":memory:");
  sqlite.pragma("foreign_keys = ON");
  return drizzle(sqlite, { schema, logger: opts.logger }) as unknown as Db;
}

export function migrateTestDb(db: Db): void {
  migrate(db as unknown as Parameters<typeof migrate>[0], { migrationsFolder });
}

/** Migrates + seeds a scratch database once and returns its bytes, so tests can clone it cheaply. */
export async function buildTemplate(): Promise<Buffer> {
  const sqlite = new Database(":memory:");
  sqlite.pragma("foreign_keys = ON");
  const db = drizzle(sqlite, { schema }) as unknown as Db;
  migrateTestDb(db);
  await seedInitialRoom(db);
  const bytes = sqlite.serialize();
  sqlite.close();
  return bytes;
}
