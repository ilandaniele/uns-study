import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@sala/database";
import { schema } from "@sala/database";
import { freshDb, getRoom, getSeats, insertUsers } from "../test-utils.js";
import { RoomStateService } from "./room-state.service.js";
import { RoomsService } from "./rooms.service.js";
import { RoomStatsService, visitorHashOf } from "./room-stats.service.js";

// 2026-03-10 15:00 UTC = 12:00 in Buenos Aires (UTC-3); local day starts 03:00 UTC.
const NOON = new Date("2026-03-10T15:00:00Z");

describe("RoomStatsService", () => {
  let db: Db;
  let stats: RoomStatsService;
  let roomId: string;
  let seatId: string;

  beforeEach(async () => {
    db = await freshDb();
    stats = new RoomStatsService(db, new RoomsService(db, new RoomStateService(db)), "test-secret");
    roomId = (await getRoom(db)).id;
    seatId = (await getSeats(db))[0]!.id;
    await insertUsers(db, ["u1", "u2"]);
  });

  async function observe(userId: string, createdAt: Date, adminOverride = false) {
    await db.insert(schema.seatObservations).values({
      userId,
      roomId,
      seatId,
      observedStatus: "FREE",
      adminOverride,
      observedAt: createdAt,
      expiresAt: new Date(createdAt.getTime() + 15 * 60_000),
      createdAt,
    });
  }

  it("counts each visitor once per local day, however often they visit", async () => {
    await stats.recordVisit("principal", { userId: null, ip: "1.1.1.1" }, NOON);
    await stats.recordVisit("principal", { userId: null, ip: "1.1.1.1" }, NOON);
    await stats.recordVisit("principal", { userId: null, ip: "2.2.2.2" }, NOON);
    await stats.recordVisit("principal", { userId: "u1", ip: "1.1.1.1" }, NOON);
    expect((await stats.getToday("principal", null, NOON)).visitorsToday).toBe(3);
  });

  it("resets the visitor count at the room's local midnight", async () => {
    await stats.recordVisit("principal", { userId: null, ip: "1.1.1.1" }, new Date("2026-03-10T02:59:00Z")); // 23:59 on the 9th
    await stats.recordVisit("principal", { userId: null, ip: "1.1.1.1" }, new Date("2026-03-10T03:01:00Z")); // 00:01 on the 10th
    expect((await stats.getToday("principal", null, new Date("2026-03-10T03:30:00Z"))).visitorsToday).toBe(1);
  });

  it("never stores the raw ip or user id", async () => {
    await stats.recordVisit("principal", { userId: null, ip: "9.9.9.9" }, NOON);
    const rows = await db.select().from(schema.roomDailyVisitors);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.visitorHash).toBe(visitorHashOf("test-secret", { userId: null, ip: "9.9.9.9" }));
    expect(JSON.stringify(rows)).not.toContain("9.9.9.9");
  });

  it("returns null contributions for anonymous callers", async () => {
    expect((await stats.getToday("principal", null, NOON)).myContributionsToday).toBeNull();
  });

  it("counts only the caller's own non-admin observations from the current local day", async () => {
    await observe("u1", new Date("2026-03-10T14:00:00Z"));
    await observe("u1", new Date("2026-03-10T14:30:00Z"));
    await observe("u1", new Date("2026-03-10T14:40:00Z"), true); // admin bulk mark
    await observe("u1", new Date("2026-03-10T02:00:00Z")); // yesterday, local time
    await observe("u2", new Date("2026-03-10T14:00:00Z"));
    expect((await stats.getToday("principal", "u1", NOON)).myContributionsToday).toBe(2);
    expect((await stats.getToday("principal", "u2", NOON)).myContributionsToday).toBe(1);
  });
});
