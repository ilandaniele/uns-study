import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@uns/database";
import { freshDb, getRoom, getSeats, insertUsers } from "../test-utils.js";
import { PresenceService } from "../presence/presence.service.js";
import { RoomStateService } from "../rooms/room-state.service.js";
import { RoomsService } from "../rooms/rooms.service.js";
import { SecurityEventService } from "../security/security-event.service.js";
import { ReputationService } from "../reputation/reputation.service.js";
import { StudySessionService } from "../rankings/study-session.service.js";
import { QrService } from "../qr/qr.service.js";
import { CheckInService } from "../checkins/checkins.service.js";
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
    );
    svc = new AdminRoomsService(db, new RoomsService(db, roomState), roomState);

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
