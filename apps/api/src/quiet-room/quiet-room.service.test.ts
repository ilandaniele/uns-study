import { beforeEach, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { schema, type Db } from "@sala/database";
import type { RoomSummary } from "@sala/contracts";
import { FixedClock } from "../platform/clock.js";
import { RoomsService } from "../rooms/rooms.service.js";
import { RoomStateService, type SeatStateChange } from "../rooms/room-state.service.js";
import { freshDb, getRoom, insertUsers } from "../test-utils.js";
import { occupancyCrossing, QuietRoomService } from "./quiet-room.service.js";

const NOW = new Date("2026-10-16T15:00:00Z");

function summary(total: number, occupied: number, saved = 0, uncertain = 0): RoomSummary {
  return { roomId: "r", total, occupied, saved, uncertain, free: total - occupied - saved - uncertain, unknown: 0 };
}

function change(seatId: string, status: SeatStateChange["status"], previousStatus: SeatStateChange["previousStatus"]): SeatStateChange {
  return { seatId, status, confidence: 1, lastUpdatedAt: NOW, verified: false, previousStatus };
}

describe("occupancyCrossing", () => {
  it("is null for rooms under 20 seats", () => {
    expect(occupancyCrossing(summary(19, 5), [change("a", "FREE", "OCCUPIED")])).toBeNull();
  });

  it("moves before/after by the number of seats that stopped being occupied", () => {
    const changes = ["a", "b", "c"].map((id) => change(id, "FREE", "OCCUPIED"));
    expect(occupancyCrossing(summary(100, 40), changes)).toEqual({ beforePct: 43, afterPct: 40 });
  });

  it("ignores changes without a previousStatus", () => {
    expect(occupancyCrossing(summary(100, 40), [change("a", "FREE", undefined)])).toEqual({ beforePct: 40, afterPct: 40 });
  });

  it("counts SAVED -> UNKNOWN as a decrease and FREE -> OCCUPIED as an increase", () => {
    expect(occupancyCrossing(summary(100, 40), [change("a", "UNKNOWN", "SAVED")])).toEqual({ beforePct: 41, afterPct: 40 });
    expect(occupancyCrossing(summary(100, 40), [change("a", "OCCUPIED", "FREE")])).toEqual({ beforePct: 39, afterPct: 40 });
  });

  it("does not count moves between occupied-ish statuses", () => {
    expect(occupancyCrossing(summary(100, 40), [change("a", "UNCERTAIN", "OCCUPIED")])).toEqual({ beforePct: 40, afterPct: 40 });
  });
});

describe("QuietRoomService", () => {
  let db: Db;
  let clock: FixedClock;
  let svc: QuietRoomService;
  let roomId: string;
  let slug: string;

  beforeEach(async () => {
    db = freshDb();
    clock = new FixedClock(NOW);
    svc = new QuietRoomService(db, new RoomsService(db, new RoomStateService(db)), clock);
    const room = await getRoom(db);
    roomId = room.id;
    slug = room.slug;
    await insertUsers(db, ["u1", "u2", "u3"]);
  });

  const rows = () => db.select().from(schema.quietRoomWatches);
  const minutes = (m: number) => new Date(NOW.getTime() + m * 60_000);

  async function addOtherRoom() {
    await db.insert(schema.rooms).values({
      id: "room-2",
      slug: "otra",
      name: "Otra",
      latitude: 0,
      longitude: 0,
      geofenceRadiusM: 50,
      timezone: "America/Argentina/Buenos_Aires",
      dailyResetTime: "04:00",
    });
  }

  it("stores a watch that expires in 240 minutes and reads it back", async () => {
    const dto = await svc.put("u1", slug, 50);
    expect(dto).toEqual({ roomId, thresholdPct: 50, expiresAt: minutes(240).toISOString() });
    expect(await svc.get("u1", slug)).toEqual(dto);
  });

  it("get returns null after expiry and for another room", async () => {
    await svc.put("u1", slug, 50);
    await addOtherRoom();
    expect(await svc.get("u1", "otra")).toBeNull();
    clock.set(minutes(241));
    expect(await svc.get("u1", slug)).toBeNull();
  });

  it("the same put twice does a single write until the TTL is nearly spent", async () => {
    await svc.put("u1", slug, 50);
    clock.set(minutes(5));
    await svc.put("u1", slug, 50);
    expect((await rows())[0]!.createdAt.getTime()).toBe(NOW.getTime());
    clock.set(minutes(11));
    await svc.put("u1", slug, 50);
    expect((await rows())[0]!.createdAt.getTime()).toBe(minutes(11).getTime());
  });

  it("a put with another threshold or room replaces the watch", async () => {
    await svc.put("u1", slug, 50);
    await svc.put("u1", slug, 30);
    expect((await rows()).map((r) => r.thresholdPct)).toEqual([30]);
    await addOtherRoom();
    await svc.put("u1", "otra", 70);
    const all = await rows();
    expect(all).toHaveLength(1);
    expect(all[0]!.roomId).toBe("room-2");
  });

  it("remove deletes the watch and is a no-op without one", async () => {
    await svc.remove("u1");
    await svc.put("u1", slug, 50);
    await svc.remove("u1");
    expect(await rows()).toHaveLength(0);
  });

  describe("claimCrossed", () => {
    async function seed() {
      await db.insert(schema.quietRoomWatches).values([
        { userId: "u1", roomId, thresholdPct: 30, expiresAt: minutes(60) },
        { userId: "u2", roomId, thresholdPct: 50, expiresAt: minutes(60) },
        { userId: "u3", roomId, thresholdPct: 70, expiresAt: minutes(60) },
      ]);
    }

    it("returns and deletes only thresholds in [after, before)", async () => {
      await seed();
      const claimed = await svc.claimCrossed(roomId, 60, 50, NOW);
      expect(claimed).toEqual([{ userId: "u2", thresholdPct: 50 }]);
      expect((await rows()).map((r) => r.userId).sort()).toEqual(["u1", "u3"]);
    });

    it("is one-shot", async () => {
      await seed();
      expect(await svc.claimCrossed(roomId, 80, 20, NOW)).toHaveLength(3);
      expect(await svc.claimCrossed(roomId, 80, 20, NOW)).toEqual([]);
    });

    it("leaves watches alone when occupancy did not drop through them", async () => {
      await seed();
      expect(await svc.claimCrossed(roomId, 50, 50, NOW)).toEqual([]);
      expect(await svc.claimCrossed(roomId, 40, 31, NOW)).toEqual([]);
      expect(await rows()).toHaveLength(3);
    });

    it("skips expired watches and other rooms", async () => {
      await addOtherRoom();
      await db.insert(schema.quietRoomWatches).values([
        { userId: "u1", roomId, thresholdPct: 50, expiresAt: minutes(-1) },
        { userId: "u2", roomId: "room-2", thresholdPct: 50, expiresAt: minutes(60) },
      ]);
      expect(await svc.claimCrossed(roomId, 80, 20, NOW)).toEqual([]);
      expect(await rows()).toHaveLength(2);
    });
  });

  it("deleteExpired removes only expired rows", async () => {
    await db.insert(schema.quietRoomWatches).values([
      { userId: "u1", roomId, thresholdPct: 50, expiresAt: minutes(-1) },
      { userId: "u2", roomId, thresholdPct: 50, expiresAt: minutes(5) },
    ]);
    expect(await svc.deleteExpired(NOW)).toBe(1);
    expect((await rows()).map((r) => r.userId)).toEqual(["u2"]);
  });

  it("tolerates a missing table", async () => {
    await db.run(sql`DROP TABLE quiet_room_watches`);
    expect(await svc.get("u1", slug)).toBeNull();
    await expect(svc.put("u1", slug, 50)).rejects.toMatchObject({ code: "FEATURE_DISABLED" });
    await expect(svc.remove("u1")).resolves.toBeUndefined();
    expect(await svc.claimCrossed(roomId, 80, 20, NOW)).toEqual([]);
    expect(await svc.deleteExpired(NOW)).toBe(0);
  });
});
