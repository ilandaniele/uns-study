import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq, sql } from "drizzle-orm";
import { schema, type Db } from "@sala/database";
import { FixedClock } from "../platform/clock.js";
import { freshDb, getRoom, getSeats, insertUsers } from "../test-utils.js";
import { GardenService } from "./garden.service.js";

const NOW = new Date("2026-10-25T15:00:00Z");

describe("GardenService", () => {
  let db: Db;
  let clock: FixedClock;
  let garden: GardenService;
  let roomId: string;
  beforeEach(async () => {
    db = freshDb();
    clock = new FixedClock(NOW);
    garden = new GardenService(db, clock);
    await insertUsers(db, ["u1", "u2"]);
    roomId = (await getRoom(db)).id;
  });
  async function session(
    minutes: number,
    source: "CHECK_IN" | "MANUAL" = "CHECK_IN",
  ) {
    await db
      .insert(schema.studySessions)
      .values({
        userId: "u1",
        roomId,
        startedAt: new Date(NOW.getTime() - minutes * 60_000),
        endedAt: NOW,
        verifiedMinutes: minutes,
        localDate: "2026-10-25",
        source,
      });
  }
  it("shares only trees after opt-in, revokes access, preserves balances and respects blocks both ways", async () => {
    await expect(garden.visit("u2", "u1")).rejects.toThrow();
    await garden.plant("u1", { plot: 0, speciesId: "ceibo" });
    const before = await garden.get("u1");
    expect(before.shared).toBe(false);
    expect(await garden.setVisibility("u1", true)).toEqual({ ...before, shared: true });
    const visible = await garden.visit("u2", "u1");
    expect(Object.keys(visible).sort()).toEqual(["collection", "plants"]);
    expect(Object.keys(visible.plants[0]!).sort()).toEqual(["plot", "progress", "speciesId", "stage"]);
    for (const [blockerId, blockedId] of [["u1", "u2"], ["u2", "u1"]]) {
      db.insert(schema.userBlocks).values({ blockerId: blockerId!, blockedId: blockedId!, createdAt: NOW }).run();
      await expect(garden.visit("u2", "u1")).rejects.toThrow();
      db.delete(schema.userBlocks).run();
    }
    await garden.setVisibility("u1", false);
    await expect(garden.visit("u2", "u1")).rejects.toThrow();
    expect((await garden.visit("u1", "u1")).plants).toHaveLength(1);
    expect(await garden.get("u1")).toEqual(before);
    await expect(garden.visit("u1", "missing-user")).rejects.toThrow();
  });
  it("starts free, reads existing study credit, excludes manual adjustments, and never writes on reads", async () => {
    expect(await garden.get("u1")).toMatchObject({
      seeds: 30,
      studyMinutes: 0,
      plants: [],
      collection: {},
    });
    await session(61);
    await session(1000, "MANUAL");
    expect(await garden.get("u1")).toMatchObject({
      seeds: 40,
      studyMinutes: 61,
      nextSeedMinutes: 5,
    });
    expect(db.select().from(schema.userGardens).all()).toHaveLength(0);
  });
  it("honors revocation while a visit is loading its study ledger", async () => {
    await garden.setVisibility("u1", true);
    const get = garden.get.bind(garden);
    vi.spyOn(garden, "get").mockImplementationOnce(async id => {
      const result = await get(id);
      await garden.setVisibility(id, false);
      return result;
    });
    await expect(garden.visit("u2", "u1")).rejects.toThrow();
  });
  it("deducts purchases atomically and rejects overspend and double planting", async () => {
    const bought = await Promise.allSettled([
      garden.plant("u1", { plot: 0, speciesId: "ceibo" }),
      garden.plant("u1", { plot: 1, speciesId: "ceibo" }),
    ]);
    expect(bought.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await garden.get("u1")).toMatchObject({
      seeds: 5,
      plants: [{ plot: 0, speciesId: "ceibo", progress: 0 }],
    });
    await expect(
      garden.plant("u1", { plot: 0, speciesId: "espinillo" }),
    ).rejects.toThrow("ya tiene");
    await expect(
      garden.plant("u1", { plot: 25, speciesId: "espinillo" }),
    ).rejects.toThrow();
    await expect(
      garden.plant("u1", { plot: 2, speciesId: "fake" }),
    ).rejects.toThrow();
  });
  it("grows only from additional study, persists across instances and redeems once", async () => {
    await session(600);
    const planted = await garden.plant("u1", {
      plot: 4,
      speciesId: "espinillo",
    });
    const plant = planted.plants[0];
    expect(plant.progress).toBe(0);
    clock.advance(7 * 86_400_000);
    expect((await garden.get("u1")).plants[0].stage).toBe("seed");
    await expect(
      garden.redeem("u1", { plot: 4, plantId: plant.id }),
    ).rejects.toThrow("todavía");
    await session(60);
    expect((await garden.get("u1")).plants[0]).toMatchObject({
      progress: 0.5,
      stage: "young",
    });
    await session(60);
    const reloaded = new GardenService(db, clock);
    expect((await reloaded.get("u1")).plants[0].stage).toBe("mature");
    const input = { plot: 4, plantId: plant.id };
    const results = await Promise.allSettled([
      reloaded.redeem("u1", input),
      reloaded.redeem("u1", input),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await garden.get("u1")).toMatchObject({
      seeds: 156,
      collection: { espinillo: 1 },
      plants: [],
    });
    await garden.plant("u1", { plot: 4, speciesId: "espinillo" });
    await expect(garden.redeem("u1", input)).rejects.toThrow("ya se canjeó");
  });
  it("keeps gardens private and cannot redeem someone else's plant", async () => {
    const plant = (
      await garden.plant("u1", { plot: 0, speciesId: "espinillo" })
    ).plants[0];
    expect((await garden.get("u2")).plants).toEqual([]);
    await expect(
      garden.redeem("u2", { plot: 0, plantId: plant.id }),
    ).rejects.toThrow("no pertenece");
  });
  it("caps live time at check-in expiry and avoids double credit when the session is recorded", async () => {
    const seat = (await getSeats(db))[0];
    const startedAt = new Date(NOW.getTime() - 120 * 60_000);
    const expiresAt = new Date(NOW.getTime() - 60 * 60_000);
    const checkin = db
      .insert(schema.checkIns)
      .values({
        userId: "u1",
        roomId,
        seatId: seat.id,
        startedAt,
        expiresAt,
        presenceVerified: true,
      })
      .returning()
      .get();
    expect((await garden.get("u1")).studyMinutes).toBe(60);
    clock.advance(86_400_000);
    expect((await garden.get("u1")).studyMinutes).toBe(60);
    db.insert(schema.studySessions)
      .values({
        userId: "u1",
        roomId,
        checkInId: checkin.id,
        startedAt,
        endedAt: expiresAt,
        verifiedMinutes: 60,
        localDate: "2026-10-25",
      })
      .run();
    expect((await garden.get("u1")).studyMinutes).toBe(60);
  });
  it("deletes garden state with account and handles a missing migration without affecting the room", async () => {
    await garden.plant("u1", { plot: 0, speciesId: "espinillo" });
    db.delete(schema.user).where(eq(schema.user.id, "u1")).run();
    expect(db.select().from(schema.userGardens).all()).toHaveLength(0);
    db.run(sql`DROP TABLE user_gardens`);
    await expect(garden.get("u2")).rejects.toMatchObject({
      code: "FEATURE_DISABLED",
      status: 503,
    });
    expect(await getRoom(db)).toBeDefined();
  });
});
