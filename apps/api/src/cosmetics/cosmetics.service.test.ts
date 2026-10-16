import { beforeEach, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { schema, type Db } from "@sala/database";
import { FixedClock } from "../platform/clock.js";
import { ProService } from "../subscriptions/pro.js";
import { RolesService } from "../users/roles.service.js";
import { freshDb, insertUsers } from "../test-utils.js";
import { UserCosmeticsService } from "./cosmetics.service.js";

const NOW = new Date("2026-10-16T15:00:00Z");

describe("UserCosmeticsService", () => {
  let db: Db;
  let clock: FixedClock;
  let service: UserCosmeticsService;

  beforeEach(async () => {
    db = freshDb();
    clock = new FixedClock(NOW);
    const pro = new ProService(db, new RolesService(db), { subscriptionsEnabled: true, clock });
    service = new UserCosmeticsService(db, pro, clock);
    await insertUsers(db, ["u1", "u2", "u3"]);
  });

  const rows = () => db.select().from(schema.userCosmetics).all();

  it("returns defaults when nothing is saved", async () => {
    expect(await service.getMine("u1")).toEqual({ frame: "none", nameColor: "default", visibleToOthers: false });
  });

  it("round-trips a put and reports visibleToOthers only for paid + visible identity", async () => {
    await db.insert(schema.userSubscriptions).values({ userId: "u1", providerSubscriptionId: "sub-u1", status: "authorized" });
    expect((await service.putMine("u1", { frame: "gold", nameColor: "ocean" })).visibleToOthers).toBe(false); // no profile row

    await db.insert(schema.userProfiles).values({ userId: "u1", identityMode: "FIRST_NAME", firstName: "Ana" });
    expect(await service.getMine("u1")).toEqual({ frame: "gold", nameColor: "ocean", visibleToOthers: true });

    await db.update(schema.userProfiles).set({ identityMode: "HIDDEN" });
    expect((await service.getMine("u1")).visibleToOthers).toBe(false);
  });

  it("does not write when the values are unchanged", async () => {
    await service.putMine("u1", { frame: "glow", nameColor: "berry" });
    const first = rows()[0]!.updatedAt.getTime();
    clock.set(new Date(NOW.getTime() + 60_000));
    await service.putMine("u1", { frame: "glow", nameColor: "berry" });
    expect(rows()[0]!.updatedAt.getTime()).toBe(first);

    await service.putMine("u1", { frame: "glow", nameColor: "gold" });
    expect(rows()[0]!.updatedAt.getTime()).toBe(first + 60_000);
    expect(rows()).toHaveLength(1);
  });

  it("deletes the row when both values go back to default, and never inserts defaults", async () => {
    await service.putMine("u1", { frame: "duo", nameColor: "violet" });
    expect(rows()).toHaveLength(1);
    await service.putMine("u1", { frame: "none", nameColor: "default" });
    expect(rows()).toHaveLength(0);
    await service.putMine("u2", { frame: "none", nameColor: "default" });
    expect(rows()).toHaveLength(0);
  });

  it("flairFor ignores ids outside eligible, all-default rows and unknown enum values", async () => {
    await insertUsers(db, ["u4"]);
    await db.insert(schema.userCosmetics).values([
      { userId: "u1", frame: "gold", nameColor: "default" },
      { userId: "u2", frame: "double", nameColor: "forest" },
      { userId: "u3", frame: "none", nameColor: "default" },
      { userId: "u4", frame: "sparkle", nameColor: "ocean" },
    ]);

    const result = await service.flairFor(new Set(["u1", "u3", "u4"]));
    expect([...result.entries()]).toEqual([["u1", { frame: "gold", nameColor: "default" }]]);
    expect((await service.flairFor(new Set())).size).toBe(0);
  });

  it("tolerates a missing table: reads default, flairFor is empty, put is FEATURE_DISABLED", async () => {
    db.run(sql`DROP TABLE user_cosmetics`);
    expect(await service.getMine("u1")).toEqual({ frame: "none", nameColor: "default", visibleToOthers: false });
    expect((await service.flairFor(new Set(["u1"]))).size).toBe(0);
    await expect(service.putMine("u1", { frame: "gold", nameColor: "ocean" })).rejects.toMatchObject({ code: "FEATURE_DISABLED" });
  });
});
