import { PGlite } from "@electric-sql/pglite";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { drizzle as drizzleNodePostgres, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { drizzle as drizzlePglite, type PgliteDatabase } from "drizzle-orm/pglite";
import { Pool } from "pg";
import fs from "node:fs";
import { defaultPgliteDir } from "./paths.js";
import * as schema from "./schema/index.js";


export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

export interface CreateDbOptions {
  /** Postgres connection string. When empty/undefined, falls back to local PGlite storage. */
  databaseUrl?: string;
  /** Directory (or `memory://`) used for the PGlite fallback. Defaults to `<repo>/.data/pglite`. */
  pgliteDir?: string;
  /**
   * Applies statement/query timeouts to the Postgres pool. Only the request-serving app pool should
   * set this: migrations, seed and one-off scripts share `createDb()` and may run long statements.
   */
  queryTimeouts?: boolean;
}

/**
 * Creates the Drizzle client.
 * - `DATABASE_URL` set -> `drizzle-orm/node-postgres` backed by a `pg` Pool (SSL enabled when the
 *   url declares `sslmode`).
 * - otherwise -> `drizzle-orm/pglite`, persisted under `<repo>/.data/pglite` (override via
 *   `PGLITE_DIR`, or pass `memory://` for ephemeral/test usage).
 */
const closers = new WeakMap<object, () => Promise<void>>();

/** Closes the underlying pool / PGlite instance and releases the PGlite lock file. */
export async function closeDb(db: Db): Promise<void> {
  await closers.get(db)?.();
  closers.delete(db);
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === "EPERM";
  }
}

/**
 * PGlite is single-process: two processes opening the same directory corrupt it (seen with
 * `tsx watch` restarts on Windows where the old process outlives the new one). Refuse to open
 * a directory another live process holds.
 */
function acquirePgliteLock(dir: string): () => void {
  const lockFile = `${dir}.lock`;
  if (fs.existsSync(lockFile)) {
    const pid = Number(fs.readFileSync(lockFile, "utf8"));
    if (pid && pid !== process.pid && isProcessAlive(pid)) {
      throw new Error(`PGlite directory ${dir} is in use by process ${pid}. Stop it first (PGlite is single-process).`);
    }
  }
  fs.writeFileSync(lockFile, String(process.pid));
  const release = () => {
    try {
      if (fs.existsSync(lockFile) && Number(fs.readFileSync(lockFile, "utf8")) === process.pid) fs.unlinkSync(lockFile);
    } catch {
      // best effort
    }
  };
  process.once("exit", release);
  return release;
}

/** TLS unless the host is loopback or the URL says `sslmode=disable`. */
export function needsSsl(databaseUrl: string): boolean {
  if (/[?&]sslmode=disable(?:&|$)/.test(databaseUrl)) return false;
  try {
    const host = new URL(databaseUrl).hostname.replace(/^\[|\]$/g, "");
    return !(host === "localhost" || host === "127.0.0.1" || host === "::1");
  } catch {
    return true;
  }
}

export function createDb(options: CreateDbOptions = {}): Db {
  const databaseUrl = options.databaseUrl ?? process.env.DATABASE_URL ?? "";

  if (databaseUrl) {
    const ssl = needsSsl(databaseUrl) ? true : undefined;
    const pool = new Pool({
      connectionString: databaseUrl,
      ssl,
      max: 10,
      idleTimeoutMillis: 300_000,
      connectionTimeoutMillis: 10_000,
      keepAlive: true,
      ...(options.queryTimeouts ? { statement_timeout: 15_000, query_timeout: 20_000 } : {}),
    });
    // An idle client erroring (Neon/proxy dropping the socket) emits 'error' on the pool; without a
    // listener that is an uncaught exception and kills the process.
    pool.on("error", (err) => {
      console.error(JSON.stringify({ evt: "pg_pool_error", msg: err.message }));
    });
    const db = drizzleNodePostgres(pool, { schema }) as unknown as Db;
    closers.set(db, () => pool.end());
    return db;
  }

  const dir = options.pgliteDir ?? process.env.PGLITE_DIR ?? defaultPgliteDir;
  let release = () => {};
  if (dir !== "memory://") {
    fs.mkdirSync(dir, { recursive: true });
    release = acquirePgliteLock(dir);
  }
  const pglite = new PGlite(dir);
  const db = drizzlePglite(pglite, { schema }) as unknown as Db;
  closers.set(db, async () => {
    await pglite.close();
    release();
  });
  return db;
}

export type { NodePgDatabase, PgliteDatabase };
