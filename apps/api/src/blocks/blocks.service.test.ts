import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@sala/database";
import { schema } from "@sala/database";
import { freshDb, insertUsers } from "../test-utils.js";
import { AliasService } from "../users/alias.service.js";
import { BlocksService } from "./blocks.service.js";

describe("BlocksService", () => {
  let db: Db;
  let svc: BlocksService;

  beforeEach(async () => {
    db = await freshDb();
    svc = new BlocksService(db, new AliasService(db));
    await insertUsers(db, ["u1", "u2", "u3"]);
  });

  it("rejects blocking yourself", async () => {
    await expect(svc.block("u1", "u1")).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("returns NOT_FOUND when blocking an unknown user", async () => {
    await expect(svc.block("u1", "ghost")).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("blocks and lists blocked users", async () => {
    await svc.block("u1", "u2");
    const blocked = await svc.blockedByMe("u1");
    expect(blocked).toEqual(["u2"]);

    const list = await svc.listBlocks("u1");
    expect(list).toHaveLength(1);
    expect(list[0]?.userId).toBe("u2");
  });

  it("is idempotent when blocking twice", async () => {
    await svc.block("u1", "u2");
    await svc.block("u1", "u2");
    expect(await svc.blockedByMe("u1")).toEqual(["u2"]);
  });

  it("unblocks", async () => {
    await svc.block("u1", "u2");
    await svc.unblock("u1", "u2");
    expect(await svc.blockedByMe("u1")).toEqual([]);
  });

  it("hides the blocked user's avatar when they haven't opted into showAvatar", async () => {
    await db.insert(schema.userProfiles).values({ userId: "u2", avatarUrl: "https://example.test/a.png" });
    await db.insert(schema.userPrivacySettings).values({ userId: "u2", showAvatar: false });
    await svc.block("u1", "u2");

    const list = await svc.listBlocks("u1");
    expect(list[0]?.avatarUrl).toBeNull();
  });

  it("detects a block in either direction", async () => {
    await svc.block("u1", "u2");
    expect(await svc.isBlockedEitherDirection("u1", "u2")).toBe(true);
    expect(await svc.isBlockedEitherDirection("u2", "u1")).toBe(true);
    expect(await svc.isBlockedEitherDirection("u1", "u3")).toBe(false);
  });
});
