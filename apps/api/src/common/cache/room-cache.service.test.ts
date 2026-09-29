import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { schema, type Db } from "@uns/database";
import { countQueries, freshDb, getRoom, getSeats } from "../../test-utils.js";
import { RoomCache } from "./room-cache.service.js";

describe("RoomCache", () => {
  let db: Db;
  let cache: RoomCache;
  let roomId: string;
  let slug: string;

  beforeEach(async () => {
    db = await freshDb();
    cache = new RoomCache();
    const room = await getRoom(db);
    roomId = room.id;
    slug = room.slug;
  });

  it("serves the room by id and slug from memory after the first load", async () => {
    await cache.getRoom(db, roomId);
    await cache.getRoom(db, slug);
    const { queries } = await countQueries(async () => {
      await cache.getRoom(db, roomId);
      await cache.getRoom(db, slug);
    });
    expect(queries).toBe(0);
  });

  it("throws ROOM_NOT_FOUND for an unknown room and does not cache the miss", async () => {
    await expect(cache.getRoom(db, "nope")).rejects.toThrow();
    expect(await cache.findRoom(db, "nope")).toBeUndefined();
  });

  it("loads tables and seats once and finds active seats by id", async () => {
    const [seat] = await getSeats(db);
    const first = await cache.getLayout(db, roomId);
    expect(first.seats.length).toBe(108);
    const { queries, result } = await countQueries(() => cache.getActiveSeat(db, roomId, seat!.id));
    expect(queries).toBe(0);
    expect(result?.id).toBe(seat!.id);
  });

  it("invalidate(roomId) makes the next read see the new geofence", async () => {
    const before = await cache.getRoom(db, slug);
    await db.update(schema.rooms).set({ geofenceRadiusM: before.geofenceRadiusM + 25 }).where(eq(schema.rooms.id, roomId));

    // Still the cached copy until someone invalidates...
    expect((await cache.getRoom(db, slug)).geofenceRadiusM).toBe(before.geofenceRadiusM);
    cache.invalidate(roomId);
    // ...and both keys (id and slug) are refreshed afterwards.
    expect((await cache.getRoom(db, slug)).geofenceRadiusM).toBe(before.geofenceRadiusM + 25);
    expect((await cache.getRoom(db, roomId)).geofenceRadiusM).toBe(before.geofenceRadiusM + 25);
  });

  it("invalidate(roomId) refreshes table nicknames in the layout", async () => {
    const layout = await cache.getLayout(db, roomId);
    const table = layout.tables[0]!;
    await db.update(schema.roomTables).set({ nickname: "La Ballena" }).where(eq(schema.roomTables.id, table.id));
    expect((await cache.getLayout(db, roomId)).tables.find((t) => t.id === table.id)?.nickname).toBe(table.nickname);
    cache.invalidate(roomId);
    expect((await cache.getLayout(db, roomId)).tables.find((t) => t.id === table.id)?.nickname).toBe("La Ballena");
  });

  it("invalidate() with no argument clears every room", async () => {
    await cache.getRoom(db, roomId);
    cache.invalidate();
    const { queries } = await countQueries(() => cache.getRoom(db, roomId));
    expect(queries).toBe(1);
  });
});
