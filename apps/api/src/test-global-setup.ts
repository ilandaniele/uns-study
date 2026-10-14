import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { createDb, migrate, seedInitialRoom } from "@sala/database";
import type { TestProject } from "vitest/node";

declare module "vitest" {
  export interface ProvidedContext {
    pgliteTemplate: string;
  }
}

/**
 * Migrating PGlite takes over a second. Vitest runs every test file in a fresh module context,
 * so a per-file cache would still migrate 95 times: build the migrated and seeded data directory
 * once per run instead, dump it to a temp file, and let every `freshDb()` boot from that dump.
 */
export default async function setup(project: TestProject) {
  const dir = await mkdtemp(path.join(tmpdir(), "sala-pglite-"));
  const file = path.join(dir, "template.tar");
  const pglite = new PGlite("memory://");
  const db = createDb({ pglite });
  await migrate(db, "");
  await seedInitialRoom(db);
  const dump = await pglite.dumpDataDir("none");
  await pglite.close();
  await writeFile(file, Buffer.from(await dump.arrayBuffer()));
  project.provide("pgliteTemplate", file);
  return () => rm(dir, { recursive: true, force: true });
}
