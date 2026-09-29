import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { schema, type Db } from "@uns/database";
import { buildDisputeService, freshDb, getRoom, getSeats, insertUsers } from "../test-utils.js";
import { PresenceService } from "../presence/presence.service.js";
import { RoomStateService } from "../rooms/room-state.service.js";
import { RoomsService } from "../rooms/rooms.service.js";
import { SecurityEventService } from "../security/security-event.service.js";
import { ReputationService } from "../reputation/reputation.service.js";
import { StudySessionService } from "../rankings/study-session.service.js";
import { QrService } from "../qr/qr.service.js";
import { CheckInService } from "../checkins/checkins.service.js";
import { RolesService } from "../users/roles.service.js";
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
    svc = new AdminRoomsService(db, new RoomsService(db, roomState), roomState, new PresenceService());

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
