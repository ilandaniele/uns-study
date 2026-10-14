import { Hono } from "hono";
import { beforeEach, describe, expect, it } from "vitest";
import type { RoomMapDto } from "@sala/contracts";
import { schema, type Db } from "@sala/database";
import { eq } from "drizzle-orm";
import { toErrorResponse } from "../common/api-error.js";
import type { AppEnv } from "../http/context.js";
import type { Services } from "../services.js";
import { freshDb, getRoom, getSeats, insertUsers } from "../test-utils.js";
import { RoomCache } from "../common/cache/room-cache.service.js";
import { RoomStateService } from "./room-state.service.js";
import { RoomsService } from "./rooms.service.js";
import { roomsRouter } from "./rooms.router.js";
import { etagMatches } from "./map-etag.js";

function appFor(rooms: RoomsService) {
  const app = new Hono<AppEnv>();
  app.use("*", async (c, next) => {
    c.set("services", { rooms } as unknown as Services);
    await next();
  });
  app.onError((err, c) => {
    const r = toErrorResponse(err, { method: c.req.method, path: c.req.path });
    return c.json(r.body, r.status as never);
  });
  app.route("/", roomsRouter);
  return app;
}

describe("GET /rooms/:idOrSlug/map ETag", () => {
  let db: Db;
  let app: Hono<AppEnv>;
  let slug: string;
  let roomId: string;

  beforeEach(async () => {
    db = freshDb();
    app = appFor(new RoomsService(db, new RoomStateService(db), new RoomCache()));
    const room = await getRoom(db);
    slug = room.slug;
    roomId = room.id;
  });

  it("returns 200 with a strong quoted ETag and no-cache, then 304 with no body when If-None-Match matches", async () => {
    const first = await app.request(`/rooms/${slug}/map`);
    const body = (await first.json()) as RoomMapDto;
    expect(body.seats.length).toBe(108);
    expect(first.status).toBe(200);
    expect(first.headers.get("cache-control")).toBe("no-cache");
    const etag = first.headers.get("etag")!;
    expect(etag).toMatch(/^"[A-Za-z0-9_-]+"$/);

    const second = await app.request(`/rooms/${slug}/map`, { headers: { "if-none-match": etag } });
    expect(second.status).toBe(304);
    expect(await second.text()).toBe("");
    expect(second.headers.get("etag")).toBe(etag);
  });

  it("changes the ETag when a seat state changes and answers 200 to the stale validator", async () => {
    const first = await app.request(`/rooms/${slug}/map`);
    const oldEtag = first.headers.get("etag")!;

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

    const second = await app.request(`/rooms/${slug}/map`, { headers: { "if-none-match": oldEtag } });
    expect(second.status).toBe(200);
    expect(second.headers.get("etag")).not.toBe(oldEtag);
  });

  it("changes the ETag when a table nickname changes (after the layout cache is invalidated)", async () => {
    const cache = new RoomCache();
    app = appFor(new RoomsService(db, new RoomStateService(db), cache));
    const first = await app.request(`/rooms/${slug}/map`);
    const map = (await first.json()) as RoomMapDto;
    const table = map.tables[0]!;
    await db.update(schema.roomTables).set({ nickname: "La Ballena" }).where(eq(schema.roomTables.id, table.id));
    cache.invalidate(roomId);

    const second = await app.request(`/rooms/${slug}/map`, { headers: { "if-none-match": first.headers.get("etag")! } });
    expect(second.status).toBe(200);
    expect(second.headers.get("etag")).not.toBe(first.headers.get("etag"));
  });

  it("serves the room list and a single room, and 404s an unknown room with the error body", async () => {
    const list = (await (await app.request("/rooms")).json()) as Array<{ slug: string }>;
    expect(list.map((r) => r.slug)).toContain(slug);
    const one = await app.request(`/rooms/${slug}`);
    expect(one.status).toBe(200);
    const missing = await app.request("/rooms/no-such-room");
    expect(missing.status).toBe(404);
    expect(((await missing.json()) as { error: { code: string } }).error.code).toBe("SEAT_NOT_FOUND");
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
