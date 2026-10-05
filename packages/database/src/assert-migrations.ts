import fs from "node:fs";
import path from "node:path";
import { sql } from "drizzle-orm";
import type { Db } from "./client.js";
import { migrationsFolder as defaultMigrationsFolder } from "./paths.js";

interface JournalEntry {
  tag: string;
  when: number;
}

/**
 * Throws if the bundled drizzle journal has migrations the database has not applied yet, listing
 * their tags. Runs read-only, so the least-privilege runtime role can do it (it needs SELECT on
 * `drizzle.__drizzle_migrations`). Mirrors drizzle-orm's migrator: a migration is pending when its
 * journal `when` is newer than the latest `created_at` recorded in the migrations table.
 */
export async function assertMigrationsApplied(db: Db, migrationsFolder = defaultMigrationsFolder): Promise<void> {
  const journalPath = path.join(migrationsFolder, "meta", "_journal.json");
  if (!fs.existsSync(journalPath)) throw new Error(`Can't find meta/_journal.json in ${migrationsFolder}`);
  const journal = JSON.parse(fs.readFileSync(journalPath, "utf8")) as { entries: JournalEntry[] };

  const exists = (await db.execute(sql`select to_regclass('drizzle.__drizzle_migrations') as t`)) as unknown as { rows: unknown[] };
  let lastApplied: number | null = null;
  if ((exists.rows[0] as { t: string | null } | undefined)?.t) {
    const last = (await db.execute(sql`select max(created_at) as last from drizzle.__drizzle_migrations`)) as unknown as { rows: unknown[] };
    const value = (last.rows[0] as { last: string | number | null } | undefined)?.last;
    if (value !== null && value !== undefined) lastApplied = Number(value);
  }

  const pending = journal.entries.filter((e) => lastApplied === null || lastApplied < e.when).map((e) => e.tag);
  if (pending.length > 0) {
    throw new Error(
      `Database schema is behind the code: ${pending.length} pending migration(s): ${pending.join(", ")}. ` +
        `Run ops/migrate-fly-db.ps1 before deploying.`,
    );
  }
}
