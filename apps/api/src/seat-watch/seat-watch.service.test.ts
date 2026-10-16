import { beforeEach, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { schema, type Db } from "@sala/database";
import { FixedClock } from "../platform/clock.js";
import { RoomsService } from "../rooms/rooms.service.js";
import { RoomStateService } from "../rooms/room-state.service.js";
import { freshDb, getRoom, getSeats, insertUsers } from "../test-utils.js";
import { SeatWatchService } from "./seat-watch.service.js";

const NOW = new Date("2026-10-16T15:00:00Z");

describe("SeatWatchService", () => {
  let db: Db;
  let clock: FixedClock;
  let svc: SeatWatchService;
  let roomId: string;
  let slug: string;
  let seatIds: string[];

  beforeEach(async () => {
    db = freshDb();
    clock = new FixedClock(NOW);
    svc = new SeatWatchService(db, new RoomsService(db, new RoomStateService(db)), clock);
    const room = await getRoom(db);
    roomId = room.id;
    slug = room.slug;
    seatIds = (await getSeats(db)).map((s) => s.id);
    await insertUsers(db, ["u1", "u2"]);
  });

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

  async function rows() {
    return db.select().from(schema.seatWatches);
  }

  describe("put", () => {
    it("stores a deduped watch that expires in 120 minutes", async () => {
      const dto = await svc.put("u1", slug, [seatIds[1]!, seatIds[0]!, seatIds[1]!]);
      expect(dto.roomId).toBe(roomId);
      expect(dto.seatIds).toEqual([seatIds[0], seatIds[1]].sort());
      expect(dto.expiresAt).toBe(new Date(NOW.getTime() + 120 * 60_000).toISOString());
      expect(await rows()).toHaveLength(1);
    });

    it("rejects seats that do not belong to the room (400)", async () => {
      await expect(svc.put("u1", slug, [seatIds[0]!, "not-a-seat"])).rejects.toMatchObject({ status: 400 });
      expect(await rows()).toHaveLength(0);
    });

    it("rejects more than 12 seats", async () => {
      await expect(svc.put("u1", slug, seatIds.slice(0, 13))).rejects.toMatchObject({ status: 400 });
    });

    it("replaces the user's previous watch", async () => {
      await svc.put("u1", slug, [seatIds[0]!]);
      await svc.put("u1", slug, [seatIds[1]!]);
      const all = await rows();
      expect(all).toHaveLength(1);
      expect(JSON.parse(all[0]!.seatIds)).toEqual([seatIds[1]]);
    });

    it("replaces a watch from another room", async () => {
      await addOtherRoom();
      await db.insert(schema.seatWatches).values({ userId: "u1", roomId: "room-2", seatIds: JSON.stringify(["x"]), expiresAt: new Date(NOW.getTime() + 3_600_000) });
      await svc.put("u1", slug, [seatIds[0]!]);
      const all = await rows();
      expect(all).toHaveLength(1);
      expect(all[0]!.roomId).toBe(roomId);
    });

    it("skips the write when nothing changed and the watch is fresh", async () => {
      await svc.put("u1", slug, [seatIds[0]!, seatIds[1]!]);
      const [first] = await rows();
      clock.advance(5 * 60_000);
      const dto = await svc.put("u1", slug, [seatIds[1]!, seatIds[0]!]);
      const [second] = await rows();
      expect(second!.createdAt).toEqual(first!.createdAt);
      expect(second!.expiresAt).toEqual(first!.expiresAt);
      expect(dto.expiresAt).toBe(first!.expiresAt.toISOString());
    });

    it("refreshes the expiry once more than 10 minutes have passed", async () => {
      await svc.put("u1", slug, [seatIds[0]!]);
      clock.advance(15 * 60_000);
      const dto = await svc.put("u1", slug, [seatIds[0]!]);
      expect(dto.expiresAt).toBe(new Date(NOW.getTime() + 135 * 60_000).toISOString());
    });

    it("maps a missing table to FEATURE_DISABLED", async () => {
      await db.run(sql`DROP TABLE seat_watches`);
      await expect(svc.put("u1", slug, [seatIds[0]!])).rejects.toMatchObject({ status: 503 });
    });
  });

  describe("get / remove", () => {
    it("returns the watch for its room only, and null once expired", async () => {
      expect(await svc.get("u1", slug)).toBeNull();
      await svc.put("u1", slug, [seatIds[0]!]);
      expect(await svc.get("u1", slug)).toMatchObject({ roomId });
      clock.advance(121 * 60_000);
      expect(await svc.get("u1", slug)).toBeNull();
    });

    it("remove deletes the row and is a no-op without one", async () => {
      await svc.remove("u1");
      await svc.put("u1", slug, [seatIds[0]!]);
      await svc.remove("u1");
      expect(await rows()).toHaveLength(0);
    });

    it("tolerates a missing table", async () => {
      await db.run(sql`DROP TABLE seat_watches`);
      expect(await svc.get("u1", slug)).toBeNull();
      await expect(svc.remove("u1")).resolves.toBeUndefined();
    });
  });

  describe("claimMatches", () => {
    it("returns and deletes only overlapping, unexpired watches", async () => {
      const soon = new Date(NOW.getTime() + 3_600_000);
      await db.insert(schema.seatWatches).values([
        { userId: "u1", roomId, seatIds: JSON.stringify([seatIds[0], seatIds[1]]), expiresAt: soon },
        { userId: "u2", roomId, seatIds: JSON.stringify([seatIds[2]]), expiresAt: soon },
      ]);
      const matches = await svc.claimMatches(roomId, [seatIds[1]!], NOW);
      expect(matches).toEqual([{ userId: "u1", seatId: seatIds[1] }]);
      expect((await rows()).map((r) => r.userId)).toEqual(["u2"]);
    });

    it("ignores expired watches and watches in other rooms", async () => {
      await addOtherRoom();
      await db.insert(schema.seatWatches).values([
        { userId: "u1", roomId, seatIds: JSON.stringify([seatIds[0]]), expiresAt: new Date(NOW.getTime() - 1000) },
        { userId: "u2", roomId: "room-2", seatIds: JSON.stringify([seatIds[0]]), expiresAt: new Date(NOW.getTime() + 3_600_000) },
      ]);
      expect(await svc.claimMatches(roomId, [seatIds[0]!], NOW)).toEqual([]);
      expect(await rows()).toHaveLength(2);
    });

    it("returns [] for a missing table", async () => {
      await db.run(sql`DROP TABLE seat_watches`);
      expect(await svc.claimMatches(roomId, [seatIds[0]!], NOW)).toEqual([]);
    });
  });

  describe("deleteExpired", () => {
    it("deletes rows expiring at or before now and returns the count", async () => {
      await db.insert(schema.seatWatches).values([
        { userId: "u1", roomId, seatIds: "[]", expiresAt: NOW },
        { userId: "u2", roomId, seatIds: "[]", expiresAt: new Date(NOW.getTime() + 1000) },
      ]);
      expect(await svc.deleteExpired(NOW)).toBe(1);
      expect((await rows()).map((r) => r.userId)).toEqual(["u2"]);
    });

    it("returns 0 for a missing table", async () => {
      await db.run(sql`DROP TABLE seat_watches`);
      expect(await svc.deleteExpired(NOW)).toBe(0);
    });
  });
});
