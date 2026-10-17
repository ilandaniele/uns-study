import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Db } from "@sala/database";
import { schema } from "@sala/database";
import { eq } from "drizzle-orm";
import { buildDisputeService, freshDb, getRoom, getSeats, insertUsers } from "../test-utils.js";
import { PresenceService } from "../presence/presence.service.js";
import { RoomStateService } from "../rooms/room-state.service.js";
import { SecurityEventService } from "../security/security-event.service.js";
import { ReputationService } from "../reputation/reputation.service.js";
import { StudySessionService } from "../rankings/study-session.service.js";
import { QrService } from "../qr/qr.service.js";
import { RolesService } from "../users/roles.service.js";
import { CheckInService } from "./checkins.service.js";

async function build(db: Db) {
  const roomState = new RoomStateService(db);
  const presence = new PresenceService();
  const security = new SecurityEventService(db, new ReputationService(db));
  const studySessions = new StudySessionService(db);
  return new CheckInService(db, roomState, presence, security, studySessions, new QrService(db), buildDisputeService(db), new RolesService(db));
}

describe("CheckInService", () => {
  let db: Db;
  let svc: CheckInService;
  let roomId: string;
  let seatIds: string[];
  let location: { latitude: number; longitude: number; accuracy: number; capturedAt: string };

  beforeEach(async () => {
    db = freshDb();
    svc = await build(db);
    const room = await getRoom(db);
    roomId = room.id;
    location = { latitude: room.latitude, longitude: room.longitude, accuracy: 10, capturedAt: new Date().toISOString() };
    const seats = await getSeats(db);
    seatIds = seats.map((s) => s.id);
    await insertUsers(db, ["u1", "u2"]);
  });

  it("creates a check-in and sets the seat to OCCUPIED", async () => {
    const { checkIn } = await svc.checkIn({ userId: "u1", roomId, seatId: seatIds[0]!, location, showIdentity: false });
    expect(checkIn.status).toBe("ACTIVE");

    const [state] = await db.select().from(schema.seatCurrentState).where(eq(schema.seatCurrentState.seatId, seatIds[0]!));
    expect(state?.status).toBe("OCCUPIED");
    expect(state?.confidence).toBeCloseTo(0.98, 5);
  });

  it("adminPresent is false for a regular user's fresh check-in", async () => {
    const { adminPresent } = await svc.checkIn({ userId: "u1", roomId, seatId: seatIds[0]!, location, showIdentity: false });
    expect(adminPresent).toBe(false);
  });

  it("adminPresent is true for an ADMIN/MODERATOR's fresh check-in", async () => {
    await db.insert(schema.userRoles).values({ userId: "u1", role: "ADMIN" });
    const { adminPresent } = await svc.checkIn({ userId: "u1", roomId, seatId: seatIds[0]!, location, showIdentity: false });
    expect(adminPresent).toBe(true);
  });

  it("adminPresent is false when an admin moves seats (not a fresh check-in)", async () => {
    await db.insert(schema.userRoles).values({ userId: "u1", role: "MODERATOR" });
    await svc.checkIn({ userId: "u1", roomId, seatId: seatIds[0]!, location, showIdentity: false });
    const { adminPresent } = await svc.checkIn({ userId: "u1", roomId, seatId: seatIds[1]!, location, showIdentity: false });
    expect(adminPresent).toBe(false);
  });

  it("adminPresent is false when an admin re-checks into the same seat (refresh, not fresh)", async () => {
    await db.insert(schema.userRoles).values({ userId: "u1", role: "ADMIN" });
    await svc.checkIn({ userId: "u1", roomId, seatId: seatIds[0]!, location, showIdentity: false });
    const { adminPresent } = await svc.checkIn({ userId: "u1", roomId, seatId: seatIds[0]!, location, showIdentity: false });
    expect(adminPresent).toBe(false);
  });

  it("moving to a new seat completes the old check-in and recomputes the old seat", async () => {
    await svc.checkIn({ userId: "u1", roomId, seatId: seatIds[0]!, location, showIdentity: false });
    await svc.checkIn({ userId: "u1", roomId, seatId: seatIds[1]!, location, showIdentity: false });

    const rows = await db.select().from(schema.checkIns).where(eq(schema.checkIns.userId, "u1"));
    expect(rows.filter((r) => r.status === "ACTIVE")).toHaveLength(1);
    expect(rows.find((r) => r.status === "COMPLETED")?.seatId).toBe(seatIds[0]);

    const [oldState] = await db.select().from(schema.seatCurrentState).where(eq(schema.seatCurrentState.seatId, seatIds[0]!));
    expect(oldState?.status).toBe("UNKNOWN");
    const [newState] = await db.select().from(schema.seatCurrentState).where(eq(schema.seatCurrentState.seatId, seatIds[1]!));
    expect(newState?.status).toBe("OCCUPIED");
  });

  it("rejects a second user checking into an already-taken seat", async () => {
    await svc.checkIn({ userId: "u1", roomId, seatId: seatIds[0]!, location, showIdentity: false });
    await expect(svc.checkIn({ userId: "u2", roomId, seatId: seatIds[0]!, location, showIdentity: false })).rejects.toMatchObject({
      code: "SEAT_TAKEN",
    });
  });

  it("exactly one of two concurrent check-ins to the same seat wins", async () => {
    await insertUsers(db, ["u3", "u4"]);
    const results = await Promise.allSettled([
      svc.checkIn({ userId: "u3", roomId, seatId: seatIds[2]!, location, showIdentity: false }),
      svc.checkIn({ userId: "u4", roomId, seatId: seatIds[2]!, location, showIdentity: false }),
    ]);
    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toMatchObject({ code: "SEAT_TAKEN" });
  });

  it("concurrent same-user double check-in to two seats ends with exactly one ACTIVE check-in", async () => {
    await svc.checkIn({ userId: "u1", roomId, seatId: seatIds[0]!, location, showIdentity: false });

    const results = await Promise.allSettled([
      svc.checkIn({ userId: "u1", roomId, seatId: seatIds[1]!, location, showIdentity: false }),
      svc.checkIn({ userId: "u1", roomId, seatId: seatIds[2]!, location, showIdentity: false }),
    ]);
    expect(results.some((r) => r.status === "fulfilled")).toBe(true);

    const rows = await db.select().from(schema.checkIns).where(eq(schema.checkIns.userId, "u1"));
    expect(rows.filter((r) => r.status === "ACTIVE")).toHaveLength(1);
  });

  it("an error inside the write rolls the whole move back and surfaces unmasked", async () => {
    await svc.checkIn({ userId: "u1", roomId, seatId: seatIds[0]!, location, showIdentity: false });
    const roomState = (svc as unknown as { roomState: RoomStateService }).roomState;
    const spy = vi.spyOn(roomState, "recomputeSeats").mockImplementationOnce(() => {
      throw new Error("db down");
    });
    await expect(svc.checkIn({ userId: "u1", roomId, seatId: seatIds[1]!, location, showIdentity: false })).rejects.toThrow("db down");
    spy.mockRestore();

    // Nothing from the failed move survived: the user is still on the first seat, the second is free.
    const rows = await db.select().from(schema.checkIns).where(eq(schema.checkIns.userId, "u1"));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ seatId: seatIds[0], status: "ACTIVE" });
  });

  it("re-checking into the same seat resets the expiry reminder so the new window gets one", async () => {
    const { checkIn } = await svc.checkIn({ userId: "u1", roomId, seatId: seatIds[0]!, location, showIdentity: false });
    await db.update(schema.checkIns).set({ expiryReminderSentAt: new Date() }).where(eq(schema.checkIns.id, checkIn.id));
    await svc.checkIn({ userId: "u1", roomId, seatId: seatIds[0]!, location, showIdentity: false });
    const [row] = await db.select().from(schema.checkIns).where(eq(schema.checkIns.id, checkIn.id));
    expect(row?.expiryReminderSentAt).toBeNull();
  });

  it("moving from a seat in another room recomputes it against its own room and reports that room's changes", async () => {
    const room = await getRoom(db);
    const [otherRoom] = await db
      .insert(schema.rooms)
      .values({ slug: "otra-sala", name: "Otra sala", timezone: room.timezone, latitude: room.latitude, longitude: room.longitude, geofenceRadiusM: room.geofenceRadiusM, dailyResetTime: "04:00" })
      .returning();
    const [otherTable] = await db.insert(schema.roomTables).values({ roomId: otherRoom!.id, code: "T1", label: "T1", type: "MAIN_TABLE", x: 0, y: 0, width: 1, height: 1 }).returning();
    const [otherSeat] = await db.insert(schema.seats).values({ roomId: otherRoom!.id, tableId: otherTable!.id, code: "X1", seatNumber: 1, x: 0, y: 0 }).returning();

    const first = await svc.checkIn({ userId: "u1", roomId: otherRoom!.id, seatId: otherSeat!.id, location, showIdentity: false });
    expect(first.previousRoom).toBeNull();

    const moved = await svc.checkIn({ userId: "u1", roomId, seatId: seatIds[0]!, location, showIdentity: false });
    expect(moved.changes.map((c) => c.seatId)).toEqual([seatIds[0]]);
    expect(moved.previousRoom?.roomId).toBe(otherRoom!.id);
    expect(moved.previousRoom?.changes.map((c) => c.seatId)).toEqual([otherSeat!.id]);
    const [state] = await db.select().from(schema.seatCurrentState).where(eq(schema.seatCurrentState.seatId, otherSeat!.id));
    expect(state?.status).not.toBe("OCCUPIED");
  });

  it("checks out and frees the seat", async () => {
    await svc.checkIn({ userId: "u1", roomId, seatId: seatIds[0]!, location, showIdentity: false });
    const result = await svc.checkOut("u1");
    expect(result).not.toBeNull();

    const [state] = await db.select().from(schema.seatCurrentState).where(eq(schema.seatCurrentState.seatId, seatIds[0]!));
    expect(state?.status).toBe("UNKNOWN");

    const active = await svc.getActiveCheckIn("u1");
    expect(active).toBeNull();
  });

  it("checkOut is a no-op when there is nothing active", async () => {
    expect(await svc.checkOut("u1")).toBeNull();
  });

  it("checking out records exactly one study session for a check-in long enough to count", async () => {
    const { checkIn } = await svc.checkIn({ userId: "u1", roomId, seatId: seatIds[0]!, location, showIdentity: false });
    await db.update(schema.checkIns).set({ startedAt: new Date(Date.now() - 30 * 60_000) }).where(eq(schema.checkIns.id, checkIn.id));

    await svc.checkOut("u1");
    const sessions = await db.select().from(schema.studySessions).where(eq(schema.studySessions.checkInId, checkIn.id));
    expect(sessions).toHaveLength(1);
    expect(sessions[0]?.verifiedMinutes).toBeGreaterThanOrEqual(29);
  });

  it("moving seats records a study session for the seat left behind, exactly once", async () => {
    const { checkIn } = await svc.checkIn({ userId: "u1", roomId, seatId: seatIds[0]!, location, showIdentity: false });
    await db.update(schema.checkIns).set({ startedAt: new Date(Date.now() - 20 * 60_000) }).where(eq(schema.checkIns.id, checkIn.id));

    await svc.checkIn({ userId: "u1", roomId, seatId: seatIds[1]!, location, showIdentity: false });
    const sessions = await db.select().from(schema.studySessions).where(eq(schema.studySessions.checkInId, checkIn.id));
    expect(sessions).toHaveLength(1);
  });

  it("a check-in's valid fix lets the next presence-sensitive action skip the location", async () => {
    await svc.checkIn({ userId: "u1", roomId, seatId: seatIds[0]!, location, showIdentity: false });
    const extended = await svc.extend("u1", null);
    expect(extended.status).toBe("ACTIVE");
    // Moving seats within the grant needs no fix either.
    const { checkIn } = await svc.checkIn({ userId: "u1", roomId, seatId: seatIds[1]!, showIdentity: false });
    expect(checkIn.seatId).toBe(seatIds[1]);
  });

  it("an action without location and without a grant answers PRESENCE_REQUIRED", async () => {
    await expect(svc.checkIn({ userId: "u1", roomId, seatId: seatIds[0]!, showIdentity: false })).rejects.toMatchObject({
      code: "PRESENCE_REQUIRED",
    });
  });

  it("extends the check-in 3 hours from now", async () => {
    const { checkIn } = await svc.checkIn({ userId: "u1", roomId, seatId: seatIds[0]!, location, showIdentity: false });
    const before = new Date(checkIn.expiresAt).getTime();
    await new Promise((r) => setTimeout(r, 5));
    const extended = await svc.extend("u1", location);
    expect(new Date(extended.expiresAt).getTime()).toBeGreaterThan(before - 1000);
    expect(new Date(extended.expiresAt).getTime()).toBeGreaterThan(Date.now() + 119 * 60_000);
  });

  it("a check-in with durationMinutes expires that long after creation", async () => {
    const { checkIn } = await svc.checkIn({ userId: "u1", roomId, seatId: seatIds[0]!, location, showIdentity: false, durationMinutes: 45 });
    expect(new Date(checkIn.expiresAt).getTime() - new Date(checkIn.startedAt).getTime()).toBe(45 * 60_000);
  });

  it("extend with durationMinutes grants that window from now", async () => {
    await svc.checkIn({ userId: "u1", roomId, seatId: seatIds[0]!, location, showIdentity: false });
    const before = Date.now();
    const extended = await svc.extend("u1", location, undefined, 30);
    const minutes = (new Date(extended.expiresAt).getTime() - before) / 60_000;
    expect(minutes).toBeGreaterThan(29.9);
    expect(minutes).toBeLessThan(30.1);
  });

  it("a check-in expires exactly CHECKIN_MINUTES (2 hours) after creation", async () => {
    const { checkIn } = await svc.checkIn({ userId: "u1", roomId, seatId: seatIds[0]!, location, showIdentity: false });
    const started = new Date(checkIn.startedAt).getTime();
    const expires = new Date(checkIn.expiresAt).getTime();
    expect(expires - started).toBe(120 * 60_000);
  });

  it("extend rejects a check-in that has already passed its expires_at, even though the row is still status=ACTIVE", async () => {
    const { checkIn } = await svc.checkIn({ userId: "u1", roomId, seatId: seatIds[0]!, location, showIdentity: false });
    // The expiration sweep hasn't run yet, so the row still reads ACTIVE, but it's past due.
    await db.update(schema.checkIns).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(schema.checkIns.id, checkIn.id));

    await expect(svc.extend("u1", location)).rejects.toMatchObject({ code: "NO_ACTIVE_CHECKIN" });
  });

  it("extend rejects when a concurrent sweep expires the check-in between extend's own read and write", async () => {
    const { checkIn } = await svc.checkIn({ userId: "u1", roomId, seatId: seatIds[0]!, location, showIdentity: false });

    // Kicks the raw "sweep" update off in the same tick as `extend`'s read, so it can land between
    // `extend`'s SELECT (which still sees ACTIVE) and its own conditional UPDATE.
    const [extendResult] = await Promise.allSettled([
      svc.extend("u1", location),
      db.update(schema.checkIns).set({ status: "EXPIRED", endedAt: new Date(), updatedAt: new Date() }).where(eq(schema.checkIns.id, checkIn.id)),
    ]);

    expect(extendResult.status).toBe("rejected");
    if (extendResult.status === "rejected") {
      expect(extendResult.reason).toMatchObject({ code: "NO_ACTIVE_CHECKIN" });
    }

    const [row] = await db.select().from(schema.checkIns).where(eq(schema.checkIns.id, checkIn.id));
    expect(row?.status).toBe("EXPIRED"); // the sweep's write won, extend must not resurrect it
  });

  it("getActiveCheckIn ignores a status=ACTIVE row that is already past expires_at (not yet swept)", async () => {
    const { checkIn } = await svc.checkIn({ userId: "u1", roomId, seatId: seatIds[0]!, location, showIdentity: false });
    await db.update(schema.checkIns).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(schema.checkIns.id, checkIn.id));

    expect(await svc.getActiveCheckIn("u1")).toBeNull();
  });
});
