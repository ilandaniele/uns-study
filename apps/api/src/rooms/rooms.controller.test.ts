import { beforeEach, describe, expect, it } from "vitest";
import type { Response } from "express";
import type { RoomMapDto } from "@uns/contracts";
import { schema, type Db } from "@uns/database";
import { eq } from "drizzle-orm";
import { freshDb, getRoom, getSeats, insertUsers } from "../test-utils.js";
import { RoomCache } from "../common/cache/room-cache.service.js";
import { RoomStateService } from "./room-state.service.js";
import { RoomsService } from "./rooms.service.js";
import { RoomsController } from "./rooms.controller.js";
import { etagMatches } from "./map-etag.js";

function fakeRes() {
  const headers: Record<string, string> = {};
  const res = {
    statusCode: 200,
    setHeader(name: string, value: string) {
      headers[name.toLowerCase()] = value;
    },
    status(code: number) {
      res.statusCode = code;
      return res;
    },
  };
  return { res: res as unknown as Response & { statusCode: number }, headers };
}

describe("GET /rooms/:idOrSlug/map ETag", () => {
  let db: Db;
  let controller: RoomsController;
  let slug: string;
  let roomId: string;

  beforeEach(async () => {
    db = await freshDb();
    controller = new RoomsController(new RoomsService(db, new RoomStateService(db), new RoomCache()));
    const room = await getRoom(db);
    slug = room.slug;
    roomId = room.id;
  });

  it("returns 200 with a strong quoted ETag, then 304 with no body when If-None-Match matches", async () => {
    const first = fakeRes();
    const body = (await controller.getMap(slug, undefined, first.res)) as RoomMapDto;
    expect(body.seats.length).toBe(108);
    expect(first.res.statusCode).toBe(200);
    const etag = first.headers.etag!;
    expect(etag).toMatch(/^"[A-Za-z0-9_-]+"$/);

    const second = fakeRes();
    const notModified = await controller.getMap(slug, etag, second.res);
    expect(notModified).toBeUndefined();
    expect(second.res.statusCode).toBe(304);
    expect(second.headers.etag).toBe(etag);
  });

  it("changes the ETag when a seat state changes and answers 200 to the stale validator", async () => {
    const first = fakeRes();
    await controller.getMap(slug, undefined, first.res);
    const oldEtag = first.headers.etag!;

    await insertUsers(db, ["u1"]);
    const [seat] = await getSeats(db);
    const now = new Date();
    await db.insert(schema.seatObservations).values({
      userId: "u1",
      roomId,
      seatId: seat!.id,
      observedStatus: "OCCUPIED",
      presenceVerified: true,
      qrVerified: false,
      confidenceWeight: 1,
      observedAt: now,
      expiresAt: new Date(now.getTime() + 20 * 60_000),
    });

    const second = fakeRes();
    const body = await controller.getMap(slug, oldEtag, second.res);
    expect(body).toBeDefined();
    expect(second.res.statusCode).toBe(200);
    expect(second.headers.etag).not.toBe(oldEtag);
  });

  it("changes the ETag when a table nickname changes (after the layout cache is invalidated)", async () => {
    const cache = new RoomCache();
    controller = new RoomsController(new RoomsService(db, new RoomStateService(db), cache));
    const first = fakeRes();
    const map = (await controller.getMap(slug, undefined, first.res)) as RoomMapDto;
    const table = map.tables[0]!;
    await db.update(schema.roomTables).set({ nickname: "La Ballena" }).where(eq(schema.roomTables.id, table.id));
    cache.invalidate(roomId);

    const second = fakeRes();
    await controller.getMap(slug, first.headers.etag, second.res);
    expect(second.res.statusCode).toBe(200);
    expect(second.headers.etag).not.toBe(first.headers.etag);
  });
});

describe("etagMatches", () => {
  it("handles lists, weak validators and *", () => {
    expect(etagMatches('"a", "b"', '"b"')).toBe(true);
    expect(etagMatches('W/"a"', '"a"')).toBe(true);
    expect(etagMatches("*", '"a"')).toBe(true);
    expect(etagMatches('"c"', '"a"')).toBe(false);
    expect(etagMatches(undefined, '"a"')).toBe(false);
  });
});
