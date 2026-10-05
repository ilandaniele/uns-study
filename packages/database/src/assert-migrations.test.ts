import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createDb } from "./client.js";
import { assertMigrationsApplied } from "./assert-migrations.js";
import { migrate } from "./migrate.js";
import { migrationsFolder } from "./paths.js";

describe("assertMigrationsApplied", () => {
  it("passes after migrate()", async () => {
    const db = createDb({ pgliteDir: "memory://" });
    await migrate(db, "");
    await expect(assertMigrationsApplied(db)).resolves.toBeUndefined();
  });

  it("throws listing every tag on a fresh database", async () => {
    const db = createDb({ pgliteDir: "memory://" });
    const journal = JSON.parse(fs.readFileSync(path.join(migrationsFolder, "meta", "_journal.json"), "utf8"));
    await expect(assertMigrationsApplied(db)).rejects.toThrow(journal.entries[0].tag);
  });

  it("throws listing only the newer tags on a partially migrated database", async () => {
    // Copy the migrations minus the last one, apply that, then check against the full set.
    const journalPath = path.join(migrationsFolder, "meta", "_journal.json");
    const journal = JSON.parse(fs.readFileSync(journalPath, "utf8"));
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "migs-"));
    fs.mkdirSync(path.join(tmp, "meta"));
    const kept = journal.entries.slice(0, -1);
    for (const e of kept) fs.copyFileSync(path.join(migrationsFolder, `${e.tag}.sql`), path.join(tmp, `${e.tag}.sql`));
    fs.writeFileSync(path.join(tmp, "meta", "_journal.json"), JSON.stringify({ ...journal, entries: kept }));

    const db = createDb({ pgliteDir: "memory://" });
    const { migrate: pgliteMigrate } = await import("drizzle-orm/pglite/migrator");
    await pgliteMigrate(db as never, { migrationsFolder: tmp });

    const lastTag = journal.entries.at(-1).tag;
    const err = await assertMigrationsApplied(db).then(
      () => null,
      (e: Error) => e,
    );
    expect(err?.message).toContain(lastTag);
    expect(err?.message).not.toContain(kept.at(-1).tag);
    fs.rmSync(tmp, { recursive: true, force: true });
  });
});
