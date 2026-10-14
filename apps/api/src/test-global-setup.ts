import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { buildTemplate } from "@sala/database/testing";

/**
 * Migrating + seeding takes noticeable time. Vitest runs every test file in a fresh module
 * context, so a per-file cache would repeat it for every file: build the migrated and seeded
 * database once per run, serialize it to a temp file, and let every `freshDb()` load that copy.
 * The path travels through `process.env.SALA_TEST_TEMPLATE` (workers inherit it).
 */
export default async function setup() {
  const dir = await mkdtemp(path.join(tmpdir(), "sala-sqlite-"));
  const file = path.join(dir, "template.sqlite");
  await writeFile(file, await buildTemplate());
  process.env.SALA_TEST_TEMPLATE = file;
  return () => rm(dir, { recursive: true, force: true });
}
