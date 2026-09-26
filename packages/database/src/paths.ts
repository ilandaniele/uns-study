import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Repo root, found by walking up to `pnpm-workspace.yaml`. Works both from TS sources and when
 * this package is bundled into another app's dist (where `import.meta.url` points elsewhere).
 */
export function findRepoRoot(start = path.dirname(fileURLToPath(import.meta.url))): string {
  let dir = start;
  for (;;) {
    if (fs.existsSync(path.join(dir, "pnpm-workspace.yaml"))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return process.cwd();
    dir = parent;
  }
}

export const migrationsFolder = process.env.MIGRATIONS_DIR ?? path.join(findRepoRoot(), "packages", "database", "migrations");
export const defaultPgliteDir = path.join(findRepoRoot(), ".data", "pglite");
