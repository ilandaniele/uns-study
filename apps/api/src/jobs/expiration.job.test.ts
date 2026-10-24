import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Db } from "@sala/database";
import { schema } from "@sala/database";
import { eq } from "drizzle-orm";
import { buildDisputeService, buildNotificationService, freshDb, getRoom, getSeats, insertUsers } from "../test-utils.js";
import { PresenceService } from "../presence/presence.service.js";
import { RoomStateService } from "../rooms/room-state.service.js";
import { SecurityEventService } from "../security/security-event.service.js";
import { ReputationService } from "../reputation/reputation.service.js";
import { StudySessionService } from "../rankings/study-session.service.js";
import { QrService } from "../qr/qr.service.js";
import { CheckInService } from "../checkins/checkins.service.js";
import { RolesService } from "../users/roles.service.js";
import { RoomRealtimeGateway } from "../realtime/room-realtime.gateway.js";
import { RecordingHub } from "../realtime/realtime-hub.js";
import { ExpirationJob } from "./expiration.job.js";

describe("ExpirationJob", () => {
  let db: Db;
  let checkIns: CheckInService;
  let job: ExpirationJob;
  let roomId: string;
  let seatId: string;
  let location: { latitude: number; longitude: number; accuracy: number; capturedAt: string };

  beforeEach(async () => {
    db = freshDb();
    const roomState = new RoomStateService(db);
    const presence = new PresenceService();
    const security = new SecurityEventService(db, new ReputationService(db));
    const studySessions = new StudySessionService(db);
    checkIns = new CheckInService(db, roomState, presence, security, studySessions, new QrService(db), buildDisputeService(db), new RolesService(db));
    const gateway = new RoomRealtimeGateway(new RecordingHub(), roomState, buildNotificationService(db), null);
    job = new ExpirationJob(db, roomState, gateway, studySessions, buildDisputeService(db));

    const room = await getRoom(db);
    roomId = room.id;
    location = { latitude: room.latitude, longitude: room.longitude, accuracy: 10, capturedAt: new Date().toISOString() };
    seatId = (await getSeats(db))[0]!.id;
    await insertUsers(db, ["u1"]);
  });

  it("does not clear a two-hour occupied report at the old twenty-minute deadline", async () => {
    const now = new Date();
    const deadline = new Date(now.getTime() + 120 * 60_000);
    await db.insert(schema.seatObservations).values({ userId: "u1", roomId, seatId, observedStatus: "OCCUPIED", presenceVerified: true, confidenceWeight: 1, observedAt: now, expiresAt: deadline });
    new RoomStateService(db).recomputeSeats([seatId], { roomId, now, eventType: "OBSERVATION", actingUserId: "u1" });
    for (const minutes of [5, 20, 60, 119]) {
      await job.runSweep(new Date(now.getTime() + minutes * 60_000));
      expect(db.select().from(schema.seatCurrentState).where(eq(schema.seatCurrentState.seatId, seatId)).get()?.status).toBe("OCCUPIED");
    }
    await job.runSweep(deadline);
    expect(db.select().from(schema.seatCurrentState).where(eq(schema.seatCurrentState.seatId, seatId)).get()?.status).toBe("UNKNOWN");
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

  it("does not expire a check-in whose extension committed between the sweep's select and its per-row update", async () => {
    const { checkIn } = await checkIns.checkIn({ userId: "u1", roomId, seatId, location, showIdentity: false });
    await db.update(schema.checkIns).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(schema.checkIns.id, checkIn.id));

    const originalTransaction = db.transaction.bind(db);
    const spy = vi.spyOn(db, "transaction").mockImplementationOnce(((cb: Parameters<typeof db.transaction>[0]) => {
      // Simulates a concurrent `extend()` committing its renewal after the sweep already selected
      // this check-in as an expiry candidate, but before the sweep's own transaction runs.
      db.update(schema.checkIns)
        .set({ status: "ACTIVE", expiresAt: new Date(Date.now() + 60 * 60_000), updatedAt: new Date() })
        .where(eq(schema.checkIns.id, checkIn.id))
        .run();
      return originalTransaction(cb);
    }) as typeof db.transaction);

    await job.runSweep(new Date());
    spy.mockRestore();

    const [row] = await db.select().from(schema.checkIns).where(eq(schema.checkIns.id, checkIn.id));
    expect(row?.status).toBe("ACTIVE");
    expect(row!.expiresAt.getTime()).toBeGreaterThan(Date.now());

    const sessions = await db.select().from(schema.studySessions).where(eq(schema.studySessions.checkInId, checkIn.id));
    expect(sessions).toHaveLength(0); // never treated as ended, so no session was recorded either
  });

  it("does not overwrite a check-in that was completed (checked out) between the sweep's select and its per-row update", async () => {
    const { checkIn } = await checkIns.checkIn({ userId: "u1", roomId, seatId, location, showIdentity: false });
    await db.update(schema.checkIns).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(schema.checkIns.id, checkIn.id));

    const originalTransaction = db.transaction.bind(db);
    const spy = vi.spyOn(db, "transaction").mockImplementationOnce(((cb: Parameters<typeof db.transaction>[0]) => {
      // Simulates the user checking out (COMPLETED) right after the sweep selected this row as an
      // expiry candidate but before the sweep's own transaction runs.
      db.update(schema.checkIns)
        .set({ status: "COMPLETED", endedAt: new Date(), updatedAt: new Date() })
        .where(eq(schema.checkIns.id, checkIn.id))
        .run();
      return originalTransaction(cb);
    }) as typeof db.transaction);

    await job.runSweep(new Date());
    spy.mockRestore();

    const [row] = await db.select().from(schema.checkIns).where(eq(schema.checkIns.id, checkIn.id));
    expect(row?.status).toBe("COMPLETED"); // must stay COMPLETED, never flipped to EXPIRED
  });

  it("recomputes a seat whose observation expired long before the previous sweep, not just within a recent lookback window", async () => {
    // An observation that expired a full day ago — well outside any short fixed lookback window —
    // simulating the job having been stopped for a while.
    await db.insert(schema.seatObservations).values({
      userId: "u1",
      roomId,
      seatId,
      observedStatus: "OCCUPIED",
      presenceVerified: true,
      qrVerified: false,
      confidenceWeight: 1,
      observedAt: new Date(Date.now() - 25 * 60 * 60_000),
      expiresAt: new Date(Date.now() - 24 * 60 * 60_000),
    });
    // `seat_current_state` is still stale from when that observation was fresh — nothing has
    // reconciled it since.
    const stale = new Date(Date.now() - 25 * 60 * 60_000);
    await db
      .insert(schema.seatCurrentState)
      .values({ seatId, status: "OCCUPIED", confidence: 0.6, sourceSummary: "OBSERVATION", lastUpdatedAt: stale, updatedAt: stale })
      .onConflictDoUpdate({
        target: schema.seatCurrentState.seatId,
        set: { status: "OCCUPIED", confidence: 0.6, sourceSummary: "OBSERVATION", lastUpdatedAt: stale, updatedAt: stale },
      });

    await job.runSweep(new Date());

    const [state] = await db.select().from(schema.seatCurrentState).where(eq(schema.seatCurrentState.seatId, seatId));
    expect(state?.status).toBe("UNKNOWN");
  });
});
