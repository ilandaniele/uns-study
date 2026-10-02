import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { schema, type Db } from "@uns/database";
import { buildDisputeService, freshDb, getRoom, getSeats, insertUsers } from "../test-utils.js";
import { PresenceService } from "../presence/presence.service.js";
import { RoomStateService } from "../rooms/room-state.service.js";
import { RoomsService } from "../rooms/rooms.service.js";
import { RoomCache } from "../common/cache/room-cache.service.js";
import { SecurityEventService } from "../security/security-event.service.js";
import { ReputationService } from "../reputation/reputation.service.js";
import { StudySessionService } from "../rankings/study-session.service.js";
import { QrService } from "../qr/qr.service.js";
import { CheckInService } from "../checkins/checkins.service.js";
import { RolesService } from "../users/roles.service.js";
import { AliasService } from "../users/alias.service.js";
import { AdminGuard } from "../users/admin.guard.js";
import { RoomPeopleService } from "../study/room-people.service.js";
import type { SeatMarkedByDto } from "@uns/contracts";
import { AdminRoomsController } from "./admin-rooms.controller.js";
import { AdminRoomsService } from "./admin-rooms.service.js";

describe("AdminRoomsService.stats — Fresh Seat Coverage", () => {
  let db: Db;
  let checkIns: CheckInService;
  let svc: AdminRoomsService;
  let roomId: string;
  let seatIds: string[];
  let location: { latitude: number; longitude: number; accuracy: number; capturedAt: string };

  beforeEach(async () => {
    db = await freshDb();
    const roomState = new RoomStateService(db);
    checkIns = new CheckInService(
      db,
      roomState,
      new PresenceService(),
      new SecurityEventService(db, new ReputationService(db)),
      new StudySessionService(db),
      new QrService(db),
      buildDisputeService(db),
      new RolesService(db),
    );
    svc = new AdminRoomsService(db, new RoomsService(db, roomState), roomState, new PresenceService());

    const room = await getRoom(db);
    roomId = room.id;
    location = { latitude: room.latitude, longitude: room.longitude, accuracy: 10, capturedAt: new Date().toISOString() };
    const seats = await getSeats(db);
    seatIds = seats.map((s) => s.id);
    await insertUsers(db, ["u1", "u2"]);
  });

  it("is 0 when no seat has any evidence", async () => {
    const stats = await svc.stats(roomId);
    expect(stats.freshSeatCoverage).toBe(0);
    expect(stats.activeCheckIns).toBe(0);
  });

  it("counts only seats with a non-UNKNOWN live status", async () => {
    await checkIns.checkIn({ userId: "u1", roomId, seatId: seatIds[0]!, location, showIdentity: false });
    await checkIns.checkIn({ userId: "u2", roomId, seatId: seatIds[1]!, location, showIdentity: false });

    const stats = await svc.stats(roomId);
    expect(stats.freshSeatCoverage).toBeCloseTo(2 / seatIds.length, 5);
    expect(stats.activeCheckIns).toBe(2);
    expect(stats.checkInsLast24h).toBe(2);
  });

  it("reports active/returning users by distinct Buenos Aires day, QR share and stored daily stats", async () => {
    const now = Date.now();
    const at = (daysAgo: number) => new Date(now - daysAgo * 24 * 3600_000);
    const obs = (userId: string, createdAt: Date, qrVerified = false) => ({
      userId,
      roomId,
      seatId: seatIds[0]!,
      observedStatus: "FREE" as const,
      qrVerified,
      observedAt: createdAt,
      expiresAt: new Date(createdAt.getTime() + 900_000),
      createdAt,
    });
    await db.insert(schema.seatObservations).values([
      obs("u1", at(1), true),
      obs("u1", at(3)), // u1: two days within 7d
      obs("u2", at(2)), // u2: one day in 7d
      obs("u2", at(20)), // u2: second day only within 30d
    ]);
    await db.insert(schema.roomDailyStats).values({ roomId, day: "2026-01-01", freshSeatCoverage: 0.5, checkIns: 3, observations: 4, activeUsers: 2 });

    const stats = await svc.stats(roomId);
    expect(stats.activeUsers7d).toBe(2);
    expect(stats.activeUsers30d).toBe(2);
    expect(stats.returningUsers7d).toBe(1);
    expect(stats.returningUsers30d).toBe(2);
    expect(stats.observations30d).toBe(4);
    expect(stats.qrVerifiedObservations30d).toBe(1);
    expect(stats.qrVerifiedObservationShare30d).toBeCloseTo(0.25, 5);
    expect(stats.dailyStats).toEqual([{ day: "2026-01-01", freshSeatCoverage: 0.5, checkIns: 3, observations: 4, activeUsers: 2 }]);
  });

  it("is 1 when every seat has evidence", async () => {
    for (const [i, seatId] of seatIds.entries()) {
      await insertUsers(db, [`bulk${i}`]);
      await checkIns.checkIn({ userId: `bulk${i}`, roomId, seatId, location, showIdentity: false });
    }
    const stats = await svc.stats(roomId);
    expect(stats.freshSeatCoverage).toBe(1);
  });
});

describe("AdminRoomsService — geofence calibration", () => {
  let db: Db;
  let svc: AdminRoomsService;
  let roomId: string;
  let center: { latitude: number; longitude: number };

  beforeEach(async () => {
    db = await freshDb();
    const roomState = new RoomStateService(db);
    const roomCache = new RoomCache();
    svc = new AdminRoomsService(db, new RoomsService(db, roomState, roomCache), roomState, new PresenceService(), roomCache);

    const room = await getRoom(db);
    roomId = room.id;
    center = { latitude: room.latitude, longitude: room.longitude };
    await insertUsers(db, ["admin1"]);
  });

  it("getGeofence returns the room's current center/radius and the configured max accuracy", async () => {
    const geofence = await svc.getGeofence(roomId);
    expect(geofence.latitude).toBe(center.latitude);
    expect(geofence.longitude).toBe(center.longitude);
    expect(geofence.radiusM).toBe(50);
    expect(geofence.maxAccuracyM).toBeGreaterThan(0);
  });

  it("testGeofence reports a passing reading at the room's center", async () => {
    const result = await svc.testGeofence(roomId, {
      latitude: center.latitude,
      longitude: center.longitude,
      accuracy: 15,
      capturedAt: new Date().toISOString(),
    });
    expect(result.valid).toBe(true);
    expect(result.reason).toBeNull();
    expect(result.distanceM).toBe(0);
  });

  it("testGeofence reports a failing reading far outside the geofence", async () => {
    const result = await svc.testGeofence(roomId, {
      latitude: center.latitude + 1,
      longitude: center.longitude,
      accuracy: 15,
      capturedAt: new Date().toISOString(),
    });
    expect(result.valid).toBe(false);
    expect(result.reason).toBe("OUTSIDE_GEOFENCE");
    expect(result.distanceM).toBeGreaterThan(1000);
  });

  it("updateGeofence persists the new center/radius and writes a moderation_actions audit row", async () => {
    const updated = await svc.updateGeofence(roomId, "admin1", {
      latitude: center.latitude + 0.001,
      longitude: center.longitude - 0.001,
      radiusM: 80,
    });
    expect(updated.radiusM).toBe(80);

    const geofence = await svc.getGeofence(roomId);
    expect(geofence.latitude).toBeCloseTo(center.latitude + 0.001, 6);
    expect(geofence.longitude).toBeCloseTo(center.longitude - 0.001, 6);
    expect(geofence.radiusM).toBe(80);

    const [audit] = await db
      .select()
      .from(schema.moderationActions)
      .where(eq(schema.moderationActions.action, "ROOM_GEOFENCE_UPDATED"));
    expect(audit).toBeTruthy();
    expect(audit?.actorId).toBe("admin1");
    expect(audit?.targetUserId).toBeNull();
    expect((audit?.metadata as { next?: { radiusM?: number } })?.next?.radiusM).toBe(80);
  });
});

describe("AdminRoomsService — mark all occupied", () => {
  let db: Db;
  let svc: AdminRoomsService;
  let roomState: RoomStateService;
  let checkIns: CheckInService;
  let people: RoomPeopleService;
  let roomId: string;
  let seatIds: string[];

  beforeEach(async () => {
    db = await freshDb();
    roomState = new RoomStateService(db);
    checkIns = new CheckInService(
      db,
      roomState,
      new PresenceService(),
      new SecurityEventService(db, new ReputationService(db)),
      new StudySessionService(db),
      new QrService(db),
      buildDisputeService(db),
      new RolesService(db),
    );
    svc = new AdminRoomsService(db, new RoomsService(db, roomState), roomState, new PresenceService());
    people = new RoomPeopleService(db, new AliasService(db));

    const room = await getRoom(db);
    roomId = room.id;
    seatIds = (await getSeats(db)).map((s) => s.id);
    await insertUsers(db, ["admin1", "u1", "u2"]);
  });

  const loc = async () => {
    const room = await getRoom(db);
    return { latitude: room.latitude, longitude: room.longitude, accuracy: 10, capturedAt: new Date().toISOString() };
  };

  async function audit(action: string) {
    return db.select().from(schema.moderationActions).where(eq(schema.moderationActions.action, action));
  }

  it("marks every non-occupied seat, leaves checked-in seats alone and audits it", async () => {
    await checkIns.checkIn({ userId: "u1", roomId, seatId: seatIds[0]!, location: await loc(), showIdentity: false });

    const before = Date.now();
    const result = await svc.markAllOccupied(roomId, "admin1", 90);
    expect(result.count).toBe(seatIds.length - 1);
    expect(result.expiresAt.getTime()).toBeGreaterThanOrEqual(before + 90 * 60_000);
    expect(result.changes.map((c) => c.seatId)).not.toContain(seatIds[0]);
    expect(result.changes.every((c) => c.status === "OCCUPIED")).toBe(true);

    const live = await roomState.getLiveSeatStates(roomId);
    expect([...live.values()].every((s) => s.status === "OCCUPIED")).toBe(true);

    const obs = await db.select().from(schema.seatObservations);
    expect(obs).toHaveLength(seatIds.length - 1);
    expect(obs.every((o) => o.adminOverride && o.userId === "admin1" && o.seatId !== seatIds[0])).toBe(true);

    const [row] = await audit("ADMIN_MARK_ALL_OCCUPIED");
    expect(row?.actorId).toBe("admin1");
    expect(row?.metadata).toMatchObject({ count: seatIds.length - 1, minutes: 90 });
  });

  it("converts FREE-observed seats and skips seats that are already OCCUPIED", async () => {
    const now = new Date();
    await db.insert(schema.seatObservations).values([
      { userId: "u1", roomId, seatId: seatIds[1]!, observedStatus: "FREE", confidenceWeight: 1, observedAt: now, expiresAt: new Date(now.getTime() + 600_000) },
      { userId: "u2", roomId, seatId: seatIds[2]!, observedStatus: "OCCUPIED", confidenceWeight: 1, observedAt: now, expiresAt: new Date(now.getTime() + 600_000) },
    ]);
    await roomState.recomputeSeats([seatIds[1]!, seatIds[2]!], { roomId, eventType: "OBSERVATION" });

    const result = await svc.markAllOccupied(roomId, "admin1", 60);
    expect(result.count).toBe(seatIds.length - 1);
    const live = await roomState.getLiveSeatStates(roomId);
    expect(live.get(seatIds[1]!)?.status).toBe("OCCUPIED");
  });

  it("undo expires only the admin marks and restores the previous states", async () => {
    await checkIns.checkIn({ userId: "u1", roomId, seatId: seatIds[0]!, location: await loc(), showIdentity: false });
    const marked = await svc.markAllOccupied(roomId, "admin1", 60);

    const undone = await svc.undoMarkAllOccupied(roomId, "admin1");
    expect(undone.count).toBe(marked.count);
    expect(undone.changes).toHaveLength(marked.count);
    expect(undone.changes.every((c) => c.status === "UNKNOWN")).toBe(true);

    const live = await roomState.getLiveSeatStates(roomId);
    expect(live.get(seatIds[0]!)?.status).toBe("OCCUPIED");
    expect(live.get(seatIds[1]!)?.status).toBe("UNKNOWN");
    expect(await audit("ADMIN_MARK_ALL_OCCUPIED_UNDO")).toHaveLength(1);

    const again = await svc.undoMarkAllOccupied(roomId, "admin1");
    expect(again.count).toBe(0);
  });

  it("shows 'Administración' as the marker without exposing the admin", async () => {
    await svc.markAllOccupied(roomId, "admin1", 60);
    const entries = (await people.listOccupants(roomId)) as SeatMarkedByDto[];
    expect(entries).toHaveLength(seatIds.length);
    expect(entries.every((e) => e.markedBy.displayName === "Administración")).toBe(true);
  });

  it("is only reachable through AdminGuard", () => {
    const guards = Reflect.getMetadata("__guards__", AdminRoomsController) as unknown[];
    expect(guards).toContain(AdminGuard);
    expect(Reflect.getMetadata("__guards__", AdminRoomsController.prototype.markAllOccupied)).toBeUndefined();
  });
});
