import path from "node:path";
import { fileURLToPath } from "node:url";
import { migrate as migrateNodePostgres } from "drizzle-orm/node-postgres/migrator";
import { migrate as migratePglite } from "drizzle-orm/pglite/migrator";
import type { NodePgDatabase, PgliteDatabase } from "./client.js";
import { createDb, type Db } from "./client.js";
import { migrationsFolder } from "./paths.js";


/**
 * Applies pending migrations against `db`. Uses the same driver-selection rule as `createDb()`:
 * `DATABASE_URL` set -> node-postgres migrator, otherwise -> pglite migrator.
 */
export async function migrate(db: Db, databaseUrl = process.env.DATABASE_URL ?? ""): Promise<void> {
  if (databaseUrl) {
    await migrateNodePostgres(db as unknown as NodePgDatabase, { migrationsFolder });
  } else {
    await migratePglite(db as unknown as PgliteDatabase, { migrationsFolder });
  }
}

async function main() {
  const db = createDb();
  await migrate(db);
  console.log("Migrations applied.");
}

// Match on the CLI file name too: when bundled into an app, import.meta.url is that app's entry.
const isMain = path.basename(process.argv[1] ?? "") === "migrate.ts" && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]!);
if (isMain) {
  main()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
