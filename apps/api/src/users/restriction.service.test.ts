import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@sala/database";
import { schema } from "@sala/database";
import { freshDb, insertUsers } from "../test-utils.js";
import { RestrictionService } from "./restriction.service.js";

describe("RestrictionService", () => {
  let db: Db;
  let svc: RestrictionService;

  beforeEach(async () => {
    db = freshDb();
    svc = new RestrictionService(db);
    await insertUsers(db, ["u1"]);
  });

  it("has no active restrictions by default", async () => {
    await expect(svc.activeRestrictions("u1")).resolves.toEqual([]);
    await expect(svc.assertNot("u1", ["MUTE_CHAT", "BANNED"])).resolves.toBeUndefined();
  });

  it("treats an unexpired restriction as active", async () => {
    await db.insert(schema.userRestrictions).values({ userId: "u1", type: "MUTE_CHAT", reason: "spam" });

    const active = await svc.activeRestrictions("u1");
    expect(active).toHaveLength(1);
    expect(active[0]?.type).toBe("MUTE_CHAT");
    await expect(svc.assertNot("u1", ["MUTE_CHAT"])).rejects.toMatchObject({ code: "RESTRICTED" });
  });

  it("ignores an expired restriction (until in the past)", async () => {
    await db.insert(schema.userRestrictions).values({
      userId: "u1",
      type: "SUSPENDED",
      reason: "old",
      until: new Date(Date.now() - 60_000),
    });

    await expect(svc.activeRestrictions("u1")).resolves.toEqual([]);
    await expect(svc.assertNot("u1", ["SUSPENDED"])).resolves.toBeUndefined();
  });

  it("ignores a lifted restriction", async () => {
    await db.insert(schema.userRestrictions).values({
      userId: "u1",
      type: "BANNED",
      reason: "resolved",
      liftedAt: new Date(),
    });

    await expect(svc.activeRestrictions("u1")).resolves.toEqual([]);
    await expect(svc.assertNot("u1", ["BANNED"])).resolves.toBeUndefined();
  });

  it("treats a permanent restriction (until null) as active", async () => {
    await db.insert(schema.userRestrictions).values({ userId: "u1", type: "BANNED", reason: "perma" });

    await expect(svc.assertNot("u1", ["BANNED"])).rejects.toMatchObject({ code: "RESTRICTED" });
  });
});
