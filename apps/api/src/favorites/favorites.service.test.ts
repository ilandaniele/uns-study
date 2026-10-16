import { beforeEach, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import type { Db } from "@sala/database";
import { schema } from "@sala/database";
import { FixedClock } from "../platform/clock.js";
import { RoomStateService } from "../rooms/room-state.service.js";
import { RoomsService } from "../rooms/rooms.service.js";
import { freshDb, getRoom, getSeats, insertUsers } from "../test-utils.js";
import { FavoriteSeatsService } from "./favorites.service.js";

describe("FavoriteSeatsService", () => {
  let db: Db;
  let clock: FixedClock;
  let service: FavoriteSeatsService;
  let slug: string;
  let seatIds: string[];

  beforeEach(async () => {
    db = freshDb();
    clock = new FixedClock(new Date("2026-03-10T15:00:00Z"));
    service = new FavoriteSeatsService(db, new RoomsService(db, new RoomStateService(db)), clock);
    slug = (await getRoom(db)).slug;
    seatIds = (await getSeats(db)).map((s) => s.id);
    await insertUsers(db, ["u1", "u2"]);
  });

  it("starts empty and round-trips a list", async () => {
    expect(await service.get("u1", slug)).toEqual({ seatIds: [] });
    expect(await service.put("u1", slug, [seatIds[0]!, seatIds[1]!])).toEqual({ seatIds: [seatIds[0], seatIds[1]] });
    expect(await service.get("u1", slug)).toEqual({ seatIds: [seatIds[0], seatIds[1]] });
    expect(await service.get("u2", slug)).toEqual({ seatIds: [] });
  });

  it("rejects a seat that is not in the room", async () => {
    await expect(service.put("u1", slug, ["nope"])).rejects.toMatchObject({ status: 400 });
  });

  it("rejects more than 3 distinct seats and dedupes repeats", async () => {
    await expect(service.put("u1", slug, seatIds.slice(0, 4))).rejects.toMatchObject({ status: 400 });
    expect((await service.put("u1", slug, [seatIds[0]!, seatIds[0]!])).seatIds).toEqual([seatIds[0]]);
  });

  it("deletes the row on an empty list", async () => {
    await service.put("u1", slug, [seatIds[0]!]);
    expect(await service.put("u1", slug, [])).toEqual({ seatIds: [] });
    expect(await db.select().from(schema.favoriteSeats)).toHaveLength(0);
  });

  it("skips the write when the sorted ids are unchanged", async () => {
    await service.put("u1", slug, [seatIds[0]!, seatIds[1]!]);
    clock.set(new Date("2026-03-10T16:00:00Z"));
    await service.put("u1", slug, [seatIds[1]!, seatIds[0]!]);
    const [row] = await db.select().from(schema.favoriteSeats);
    expect(row!.updatedAt.toISOString()).toBe("2026-03-10T15:00:00.000Z");
    await service.put("u1", slug, [seatIds[2]!]);
    const [changed] = await db.select().from(schema.favoriteSeats);
    expect(changed!.updatedAt.toISOString()).toBe("2026-03-10T16:00:00.000Z");
  });

  it("reads empty and refuses writes when the table is missing", async () => {
    db.run(sql`DROP TABLE favorite_seats`);
    expect(await service.get("u1", slug)).toEqual({ seatIds: [] });
    await expect(service.put("u1", slug, [seatIds[0]!])).rejects.toMatchObject({ status: 503 });
  });
});
