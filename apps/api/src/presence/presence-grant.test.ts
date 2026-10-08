import { beforeEach, describe, expect, it } from "vitest";
import { schema, type Db } from "@sala/database";
import { PRESENCE_GRANT_MINUTES } from "@sala/contracts";
import { freshDb, getRoom, insertUsers } from "../test-utils.js";
import { PresenceService } from "./presence.service.js";

const strict = { isProduction: true, devBypass: false };

describe("PresenceService presence grants", () => {
  const svc = new PresenceService();
  let db: Db;
  let room: Awaited<ReturnType<typeof getRoom>>;

  function inside(at: Date) {
    return { latitude: room.latitude, longitude: room.longitude, accuracy: 10, capturedAt: at.toISOString() };
  }

  beforeEach(async () => {
    db = await freshDb();
    room = await getRoom(db);
    await insertUsers(db, ["u1", "u2"]);
  });

  it("issues a grant valid PRESENCE_GRANT_MINUTES on a valid in-geofence fix", async () => {
    const now = new Date("2026-10-08T15:00:00Z");
    const grant = await svc.requirePresence(db, { userId: "u1", room, location: inside(now), options: { ...strict, now } });
    expect(grant.roomId).toBe(room.id);
    expect(grant.expiresAt.getTime()).toBe(now.getTime() + PRESENCE_GRANT_MINUTES * 60_000);
    expect(await svc.grantExpiresAt(db, "u1", room.id, now)).toEqual(grant.expiresAt);
  });

  it("accepts a request without a fix within the grant's 60 minutes", async () => {
    const issuedAt = new Date("2026-10-08T15:00:00Z");
    await svc.requirePresence(db, { userId: "u1", room, location: inside(issuedAt), options: { ...strict, now: issuedAt } });

    const later = new Date(issuedAt.getTime() + 59 * 60_000);
    const grant = await svc.requirePresence(db, { userId: "u1", room, options: { ...strict, now: later } });
    // Using the grant never extends it — only a new fix does.
    expect(grant.expiresAt.getTime()).toBe(issuedAt.getTime() + 60 * 60_000);
  });

  it("rejects a request without a fix once the grant is past 60 minutes", async () => {
    const issuedAt = new Date("2026-10-08T15:00:00Z");
    await svc.requirePresence(db, { userId: "u1", room, location: inside(issuedAt), options: { ...strict, now: issuedAt } });

    const later = new Date(issuedAt.getTime() + 60 * 60_000 + 1);
    await expect(svc.requirePresence(db, { userId: "u1", room, options: { ...strict, now: later } })).rejects.toMatchObject({
      code: "PRESENCE_REQUIRED",
    });
  });

  it("does not carry a grant over to another room or another user", async () => {
    const now = new Date("2026-10-08T15:00:00Z");
    await svc.requirePresence(db, { userId: "u1", room, location: inside(now), options: { ...strict, now } });

    const [other] = await db
      .insert(schema.rooms)
      .values({ slug: "otra-sala", name: "Otra sala", latitude: room.latitude, longitude: room.longitude, geofenceRadiusM: room.geofenceRadiusM, timezone: room.timezone, dailyResetTime: room.dailyResetTime })
      .returning();
    await expect(svc.requirePresence(db, { userId: "u1", room: other!, options: { ...strict, now } })).rejects.toMatchObject({
      code: "PRESENCE_REQUIRED",
    });
    await expect(svc.requirePresence(db, { userId: "u2", room, options: { ...strict, now } })).rejects.toMatchObject({
      code: "PRESENCE_REQUIRED",
    });
  });

  it("never grants on a fix outside the geofence", async () => {
    const now = new Date("2026-10-08T15:00:00Z");
    const outside = { ...inside(now), latitude: room.latitude + 0.01 };
    await expect(svc.requirePresence(db, { userId: "u1", room, location: outside, options: { ...strict, now } })).rejects.toMatchObject({
      code: "PRESENCE_REJECTED",
      reason: "OUTSIDE_GEOFENCE",
    });
    expect(await svc.grantExpiresAt(db, "u1", room.id, now)).toBeNull();
    await expect(svc.requirePresence(db, { userId: "u1", room, options: { ...strict, now } })).rejects.toMatchObject({
      code: "PRESENCE_REQUIRED",
    });
  });

  it("a rejected fix doesn't fall back to an existing grant", async () => {
    const issuedAt = new Date("2026-10-08T15:00:00Z");
    await svc.requirePresence(db, { userId: "u1", room, location: inside(issuedAt), options: { ...strict, now: issuedAt } });

    const later = new Date(issuedAt.getTime() + 10 * 60_000);
    const outside = { ...inside(later), latitude: room.latitude + 0.01 };
    await expect(svc.requirePresence(db, { userId: "u1", room, location: outside, options: { ...strict, now: later } })).rejects.toMatchObject({
      code: "PRESENCE_REJECTED",
    });
  });

  it("reuses presence already enforced in the same request only for the same room", async () => {
    const now = new Date("2026-10-08T15:00:00Z");
    const already = { roomId: room.id, expiresAt: new Date(now.getTime() + 60_000) };
    await expect(svc.requirePresence(db, { userId: "u1", room, already, options: { ...strict, now } })).resolves.toBe(already);
    await expect(
      svc.requirePresence(db, { userId: "u1", room, already: { ...already, roomId: "00000000-0000-0000-0000-000000000000" }, options: { ...strict, now } }),
    ).rejects.toMatchObject({ code: "PRESENCE_REQUIRED" });
  });
});
