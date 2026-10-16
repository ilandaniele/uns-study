import { describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { schema } from "@sala/database";
import { freshDb, insertUsers } from "../test-utils.js";
import { loadFrozenDates } from "./frozen-dates.js";

describe("loadFrozenDates", () => {
  it("groups frozen dates by user and honours the lower bound", async () => {
    const db = freshDb();
    await insertUsers(db, ["u1", "u2", "u3"]);
    await db.insert(schema.streakFreezes).values([
      { userId: "u1", localDate: "2026-01-05" },
      { userId: "u1", localDate: "2026-01-12" },
      { userId: "u2", localDate: "2026-01-13" },
    ]);
    const got = await loadFrozenDates(db, ["u1", "u2", "u3"], "2026-01-10");
    expect([...(got.get("u1") ?? [])]).toEqual(["2026-01-12"]);
    expect([...(got.get("u2") ?? [])]).toEqual(["2026-01-13"]);
    expect(got.has("u3")).toBe(false);
  });

  it("returns an empty map for no users", async () => {
    expect((await loadFrozenDates(freshDb(), [], "2026-01-01")).size).toBe(0);
  });

  it("returns an empty map when the table is missing", async () => {
    const db = freshDb();
    await insertUsers(db, ["u1"]);
    db.run(sql`DROP TABLE streak_freezes`);
    expect((await loadFrozenDates(db, ["u1"], "2026-01-01")).size).toBe(0);
  });
});
