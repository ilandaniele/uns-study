import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { schema, type Db } from "@sala/database";
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
import { RoomPeopleService } from "../study/room-people.service.js";
import type { SeatMarkedByDto } from "@sala/contracts";
import { AdminRoomsService } from "./admin-rooms.service.js";

describe("AdminRoomsService.stats — Fresh Seat Coverage", () => {
  let db: Db;
  let checkIns: CheckInService;
  let svc: AdminRoomsService;
  let roomId: string;
  let seatIds: string[];
  let location: { latitude: number; longitude: number; accuracy: number; capturedAt: string };

  beforeEach(async () => {
    db = freshDb();
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
    svc = new AdminRoomsService(db, new RoomsService(db, roomState), roomState, new PresenceService(), new RolesService(db));

    const room = await getRoom(db);
    roomId = room.id;
    location = { latitude: room.latitude, longitude: room.longitude, accuracy: 10, capturedAt: new Date().toISOString() };
    const seats = await getSeats(db);
    seatIds = seats.map((s) => s.id);
    await insertUsers(db, ["u1", "u2", "admin1", "mod1"]);
    await db.insert(schema.userRoles).values([
      { userId: "admin1", role: "ADMIN" },
      { userId: "mod1", role: "MODERATOR" },
    ]);
  });

  it("live: occupant emails only for ADMIN callers, null for moderators", async () => {
    await checkIns.checkIn({ userId: "u1", roomId, seatId: seatIds[0]!, location, showIdentity: false });
    const asAdmin = await svc.live(roomId, "admin1");
    expect(asAdmin.occupants[0]?.email).toBeTruthy();
    const asMod = await svc.live(roomId, "mod1");
    expect(asMod.occupants).toHaveLength(1);
    expect(asMod.occupants[0]?.email).toBeNull();
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
    db = freshDb();
    const roomState = new RoomStateService(db);
    const roomCache = new RoomCache();
    svc = new AdminRoomsService(db, new RoomsService(db, roomState, roomCache), roomState, new PresenceService(), new RolesService(db), roomCache);

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
    db = freshDb();
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
    svc = new AdminRoomsService(db, new RoomsService(db, roomState), roomState, new PresenceService(), new RolesService(db));
    people = new RoomPeopleService(db, new AliasService(db), new RolesService(db));

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
    const now = new Date(Date.now() - 1000);
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

  it("undo of all-occupied preserves earlier admin, saved and member reports and later changes", async () => {
    await svc.markSeats(roomId, "admin1", [seatIds[0]!], "OCCUPIED");
    const now = new Date(Date.now() - 1000);
    await db.insert(schema.seatObservations).values([
      { userId: "u1", roomId, seatId: seatIds[1]!, observedStatus: "SAVED", confidenceWeight: 1, observedAt: now, expiresAt: new Date(now.getTime() + 600_000) },
      { userId: "u2", roomId, seatId: seatIds[2]!, observedStatus: "OCCUPIED", confidenceWeight: 1, observedAt: now, expiresAt: new Date(now.getTime() + 600_000) },
    ]);
    const marked = await svc.markAllOccupied(roomId, "admin1", 60);
    await svc.markSeats(roomId, "u2", [seatIds[3]!], "FREE");
    await svc.undoMarkAllOccupied(roomId, "admin1", marked.actionId!);
    const live = await roomState.getLiveSeatStates(roomId);
    expect(live.get(seatIds[0]!)?.status).toBe("OCCUPIED");
    expect(live.get(seatIds[1]!)?.status).toBe("SAVED");
    expect(live.get(seatIds[2]!)?.status).toBe("OCCUPIED");
    expect(live.get(seatIds[3]!)?.status).toBe("FREE");
    expect(live.get(seatIds[4]!)?.status).toBe("UNKNOWN");
  });

  it("undo is scoped to the actor and latest total-mark operation, including same-millisecond batches", async () => {
    const first = await svc.markAllOccupied(roomId, "admin1", 60);
    expect((await svc.undoMarkAllOccupied(roomId, "u2")).count).toBe(0);
    await svc.markSeats(roomId, "admin1", [seatIds[0]!], "FREE");
    await db.update(schema.seatObservations).set({ observedAt: new Date(Date.now() - 1000) }).where(eq(schema.seatObservations.observedStatus, "FREE"));
    const second = await svc.markAllOccupied(roomId, "admin1", 60);
    await db.update(schema.moderationActions).set({ createdAt: new Date(0) }).where(eq(schema.moderationActions.action, "ADMIN_MARK_ALL_OCCUPIED"));
    await expect(svc.undoMarkAllOccupied(roomId, "admin1", first.actionId!)).rejects.toThrow();
    expect((await svc.undoMarkAllOccupied(roomId, "admin1", second.actionId!)).count).toBe(1);
    expect((await roomState.getLiveSeatStates(roomId)).get(seatIds[0]!)?.status).toBe("FREE");
    expect((await roomState.getLiveSeatStates(roomId)).get(seatIds[1]!)?.status).toBe("OCCUPIED");
    expect((await svc.undoMarkAllOccupied(roomId, "admin1")).count).toBe(0);
    expect(await svc.markAllUndoState(roomId, "admin1")).toBeNull();
  });

  it("never clears unrelated marks when an old batch has no exact observation ids", async () => {
    await svc.markSeats(roomId, "admin1", [seatIds[0]!], "OCCUPIED");
    await db.insert(schema.moderationActions).values({ actorId: "admin1", action: "ADMIN_MARK_ALL_OCCUPIED", metadata: { roomId, count: 108 } });
    expect((await svc.undoMarkAllOccupied(roomId, "admin1")).count).toBe(0);
    expect((await roomState.getLiveSeatStates(roomId)).get(seatIds[0]!)?.status).toBe("OCCUPIED");
  });

  it("marks only the chosen seats occupied, skipping checked-in and unknown seats", async () => {
    await checkIns.checkIn({ userId: "u1", roomId, seatId: seatIds[0]!, location: await loc(), showIdentity: false });

    const result = await svc.markSeats(roomId, "admin1", [seatIds[0]!, seatIds[1]!, seatIds[2]!, seatIds[2]!, "nope"], "OCCUPIED");
    expect(result.count).toBe(2);
    expect(result.skipped).toBe(2);
    const live = await roomState.getLiveSeatStates(roomId);
    expect(live.get(seatIds[1]!)?.status).toBe("OCCUPIED");
    expect(live.get(seatIds[2]!)?.status).toBe("OCCUPIED");
    expect(live.get(seatIds[3]!)?.status).toBe("UNKNOWN");
    const obs = await db.select().from(schema.seatObservations);
    expect(obs).toHaveLength(2);
    expect(obs.every((o) => o.adminOverride && o.confidenceWeight === 1000)).toBe(true);
    const [row] = await audit("ADMIN_MARK_SEATS");
    expect(row?.metadata).toMatchObject({ status: "OCCUPIED", count: 2 });
  });

  it("supports selecting the whole room while leaving active check-ins untouched", async () => {
    await checkIns.checkIn({ userId: "u1", roomId, seatId: seatIds[0]!, location: await loc(), showIdentity: false });
    expect((await svc.markSeats(roomId, "admin1", seatIds, "OCCUPIED")).count).toBe(107);
    expect((await svc.markSeats(roomId, "admin1", seatIds, "FREE")).count).toBe(107);
    const live = await roomState.getLiveSeatStates(roomId);
    expect(live.get(seatIds[0]!)?.status).toBe("OCCUPIED");
    expect([...live.values()].filter(seat => seat.status === "FREE")).toHaveLength(107);
  });

  it("marks chosen seats free over member reports and replaces an earlier admin mark", async () => {
    const now = new Date(Date.now() - 1000);
    await db.insert(schema.seatObservations).values([
      { userId: "u1", roomId, seatId: seatIds[1]!, observedStatus: "OCCUPIED", confidenceWeight: 1, observedAt: now, expiresAt: new Date(now.getTime() + 600_000) },
      { userId: "u2", roomId, seatId: seatIds[1]!, observedStatus: "OCCUPIED", confidenceWeight: 1, observedAt: now, expiresAt: new Date(now.getTime() + 600_000) },
    ]);
    await svc.markSeats(roomId, "admin1", [seatIds[2]!], "OCCUPIED");

    const result = await svc.markSeats(roomId, "admin1", [seatIds[1]!, seatIds[2]!], "FREE");
    expect(result.count).toBe(2);
    expect((result.expiresAt.getTime() - Date.now()) / 60_000).toBeGreaterThan(179.9);
    const live = await roomState.getLiveSeatStates(roomId);
    expect(live.get(seatIds[1]!)?.status).toBe("FREE");
    expect(live.get(seatIds[2]!)?.status).toBe("FREE");

    const undone = await svc.undoMarkAllOccupied(roomId, "admin1");
    expect(undone.count).toBe(0);
    const after = await roomState.getLiveSeatStates(roomId);
    expect(after.get(seatIds[1]!)?.status).toBe("FREE");
    expect(after.get(seatIds[2]!)?.status).toBe("FREE");
  });

  it("shows only the admin's chosen public name as the marker", async () => {
    await db.insert(schema.userProfiles).values({ userId: "admin1", firstName: "Marina", identityMode: "FIRST_NAME" });
    await svc.markAllOccupied(roomId, "admin1", 60);
    const entries = (await people.listOccupants(roomId)) as SeatMarkedByDto[];
    expect(entries).toHaveLength(seatIds.length);
    expect(entries.every((e) => e.markedBy.displayName === "Marina")).toBe(true);
    expect(JSON.stringify(entries)).not.toMatch(/admin1|userId|@/);
  });

  it("rolls the whole bulk mark back when anything inside the transaction fails", async () => {
    const failing = new AdminRoomsService(
      db,
      new RoomsService(db, roomState),
      { getLiveSeatStates: roomState.getLiveSeatStates.bind(roomState), recomputeSeats: () => { throw new Error("boom"); } } as unknown as RoomStateService,
      new PresenceService(),
      new RolesService(db),
    );
    await expect(failing.markAllOccupied(roomId, "admin1", 60)).rejects.toThrow("boom");
    expect(await db.select().from(schema.seatObservations)).toHaveLength(0);
    expect(await audit("ADMIN_MARK_ALL_OCCUPIED")).toHaveLength(0);
  });
});
