import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@uns/database";
import { schema } from "@uns/database";
import { eq } from "drizzle-orm";
import { freshDb, getRoom, getSeats, insertUsers } from "../test-utils.js";
import { PresenceService } from "../presence/presence.service.js";
import { RoomStateService } from "../rooms/room-state.service.js";
import { SecurityEventService } from "../security/security-event.service.js";
import { ReputationService } from "../reputation/reputation.service.js";
import { StudySessionService } from "../rankings/study-session.service.js";
import { QrService } from "../qr/qr.service.js";
import { CheckInService } from "../checkins/checkins.service.js";
import { RoomRealtimeGateway } from "../realtime/room-realtime.gateway.js";
import type { Auth } from "../auth/auth.instance.js";
import { ExpirationJob } from "./expiration.job.js";

const mockAuth = { api: { getSession: async () => null } } as unknown as Auth;

describe("ExpirationJob", () => {
  let db: Db;
  let checkIns: CheckInService;
  let job: ExpirationJob;
  let roomId: string;
  let seatId: string;
  let location: { latitude: number; longitude: number; accuracy: number; capturedAt: string };

  beforeEach(async () => {
    db = await freshDb();
    const roomState = new RoomStateService(db);
    const presence = new PresenceService();
    const security = new SecurityEventService(db, new ReputationService(db));
    const studySessions = new StudySessionService(db);
    checkIns = new CheckInService(db, roomState, presence, security, studySessions, new QrService(db));
    const gateway = new RoomRealtimeGateway(roomState, mockAuth); // no @WebSocketServer() attached — emits are no-ops in tests
    job = new ExpirationJob(db, roomState, gateway, studySessions);

    const room = await getRoom(db);
    roomId = room.id;
    location = { latitude: room.latitude, longitude: room.longitude, accuracy: 10, capturedAt: new Date().toISOString() };
    seatId = (await getSeats(db))[0]!.id;
    await insertUsers(db, ["u1"]);
  });

  it("expires an ACTIVE check-in past its expires_at and recomputes the seat back to UNKNOWN", async () => {
    await checkIns.checkIn({ userId: "u1", roomId, seatId, location, showIdentity: false });

    // Force the check-in into the past so the sweep picks it up.
    await db.update(schema.checkIns).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(schema.checkIns.seatId, seatId));

    await job.runSweep(new Date());

    const [row] = await db.select().from(schema.checkIns).where(eq(schema.checkIns.seatId, seatId));
    expect(row?.status).toBe("EXPIRED");

    const [state] = await db.select().from(schema.seatCurrentState).where(eq(schema.seatCurrentState.seatId, seatId));
    expect(state?.status).toBe("UNKNOWN");
  });

  it("leaves check-ins that have not expired yet untouched", async () => {
    await checkIns.checkIn({ userId: "u1", roomId, seatId, location, showIdentity: false });
    await job.runSweep(new Date());

    const [row] = await db.select().from(schema.checkIns).where(eq(schema.checkIns.seatId, seatId));
    expect(row?.status).toBe("ACTIVE");
  });

  it("records exactly one study session for a swept check-in that ran long enough to count", async () => {
    const { checkIn } = await checkIns.checkIn({ userId: "u1", roomId, seatId, location, showIdentity: false });
    // Give it a real 45-minute window that already expired, so the sweep both expires it and
    // has enough duration (>= 5 min) to be worth recording.
    await db
      .update(schema.checkIns)
      .set({ startedAt: new Date(Date.now() - 45 * 60_000), expiresAt: new Date(Date.now() - 1000) })
      .where(eq(schema.checkIns.id, checkIn.id));

    await job.runSweep(new Date());
    // A second sweep must not double-record the same check-in (idempotent via check_in_id).
    await job.runSweep(new Date());

    const sessions = await db.select().from(schema.studySessions).where(eq(schema.studySessions.checkInId, checkIn.id));
    expect(sessions).toHaveLength(1);
    expect(sessions[0]?.verifiedMinutes).toBeGreaterThanOrEqual(44);
  });
});
