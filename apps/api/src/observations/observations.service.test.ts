import { beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import type { Db } from "@sala/database";
import { schema } from "@sala/database";
import { eq } from "drizzle-orm";
import { buildDisputeService, freshDb, getRoom, getSeats, insertUsers } from "../test-utils.js";
import { PresenceService } from "../presence/presence.service.js";
import { RoomStateService } from "../rooms/room-state.service.js";
import { SecurityEventService } from "../security/security-event.service.js";
import { AbusePolicyService } from "../security/abuse-policy.service.js";
import { TurnstileService } from "../security/turnstile.service.js";
import { ReputationService } from "../reputation/reputation.service.js";
import { QrService } from "../qr/qr.service.js";
import { StudySessionService } from "../rankings/study-session.service.js";
import { CheckInService } from "../checkins/checkins.service.js";
import { RolesService } from "../users/roles.service.js";
import { NotificationService } from "../notifications/notification.service.js";
import { PushService } from "../notifications/push.service.js";
import { flushBackground } from "../common/background.js";
import { ObservationService } from "./observations.service.js";
import type { ObservationLimits } from "../security/abuse-policy.service.js";
import type { DisputeService } from "../disputes/disputes.service.js";

async function build(db: Db) {
  const roomState = new RoomStateService(db);
  const presence = new PresenceService();
  const reputation = new ReputationService(db);
  const security = new SecurityEventService(db, reputation);
  const abusePolicy = new AbusePolicyService(db, new TurnstileService());
  const studySessions = new StudySessionService(db);
  const qr = new QrService(db);
  const push = new PushService(db);
  const send = vi.spyOn(push, "sendToUser").mockResolvedValue(undefined);
  const notifications = new NotificationService(db, push, roomState);
  const disputes = buildDisputeService(db, notifications);
  const checkIns = new CheckInService(db, roomState, presence, security, studySessions, qr, disputes, new RolesService(db));
  const observations = new ObservationService(db, roomState, presence, security, abusePolicy, qr, reputation, notifications, disputes);
  return { observations, checkIns, qr, reputation, send, disputes };
}

describe("ObservationService", () => {
  let db: Db;
  let observations: ObservationService;
  let checkIns: CheckInService;
  let qr: QrService;
  let reputation: ReputationService;
  let disputes: DisputeService;
  let send: MockInstance<PushService["sendToUser"]>;
  let roomId: string;
  let seatIds: string[];
  let location: { latitude: number; longitude: number; accuracy: number; capturedAt: string };

  beforeEach(async () => {
    db = await freshDb();
    ({ observations, checkIns, qr, reputation, send, disputes } = await build(db));
    const room = await getRoom(db);
    roomId = room.id;
    location = { latitude: room.latitude, longitude: room.longitude, accuracy: 10, capturedAt: new Date().toISOString() };
    seatIds = (await getSeats(db)).map((s) => s.id);
    await insertUsers(db, ["u1", "u2", "u3"]);
  });

  it("a single FREE observation sets the seat FREE with 15-minute expiry", async () => {
    const before = Date.now();
    await observations.observe({ userId: "u1", roomId, seatId: seatIds[0]!, status: "FREE", location });

    const [state] = await db.select().from(schema.seatCurrentState).where(eq(schema.seatCurrentState.seatId, seatIds[0]!));
    expect(state?.status).toBe("FREE");

    const [obs] = await db.select().from(schema.seatObservations).where(eq(schema.seatObservations.seatId, seatIds[0]!));
    const minutes = (new Date(obs!.expiresAt).getTime() - before) / 60_000;
    expect(minutes).toBeGreaterThan(14.9);
    expect(minutes).toBeLessThanOrEqual(15.01);
  });

  it("a FREE observation on a checked-in seat opens an ABSENT vote and pushes the holder once", async () => {
    await checkIns.checkIn({ userId: "u1", roomId, seatId: seatIds[0]!, location, showIdentity: false });
    const first = await observations.observe({ userId: "u2", roomId, seatId: seatIds[0]!, status: "FREE", location });
    await flushBackground();
    expect(first.dispute).toMatchObject({ kind: "ABSENT", status: "OPEN", seatId: seatIds[0] });
    expect(first.changes.find((c) => c.seatId === seatIds[0])?.status).toBe("UNCERTAIN");
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith(
      "u1",
      expect.objectContaining({ title: "Marcaron tu lugar como libre", body: expect.stringContaining("votación"), tag: `seat-challenge-${seatIds[0]}` }),
    );

    // A second reporter joins the running vote: same dispute, no second push.
    const second = await observations.observe({ userId: "u3", roomId, seatId: seatIds[0]!, status: "FREE", location });
    await flushBackground();
    expect(second.dispute?.id).toBe(first.dispute?.id);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("a FREE report that can't open a vote (seat cooldown) stays an observation and pushes the holder, throttled", async () => {
    await checkIns.checkIn({ userId: "u1", roomId, seatId: seatIds[0]!, location, showIdentity: false });
    const { dispute } = await disputes.open({ userId: "u2", roomId, seatId: seatIds[0]!, kind: "CLAIM", location });
    await disputes.respond(dispute.id, "u1", "STILL_HERE", location);
    await db.update(schema.seatDisputes).set({ closesAt: new Date(Date.now() - 1000) }).where(eq(schema.seatDisputes.id, dispute.id));
    await disputes.resolveDue(new Date());
    await flushBackground();
    send.mockClear();

    const result = await observations.observe({ userId: "u3", roomId, seatId: seatIds[0]!, status: "FREE", location });
    await flushBackground();
    expect(result.dispute).toBeNull();
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith("u1", expect.objectContaining({ title: "Marcaron tu lugar como libre", body: expect.not.stringContaining("votación") }));

    await insertUsers(db, ["u4"]);
    await observations.observe({ userId: "u4", roomId, seatId: seatIds[0]!, status: "FREE", location });
    await flushBackground();
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("a FREE report on a seat someone marked \"guardado\" opens a SAVED vote and pushes whoever saved it", async () => {
    await observations.observe({ userId: "u1", roomId, seatId: seatIds[0]!, status: "SAVED", location });
    const result = await observations.observe({ userId: "u2", roomId, seatId: seatIds[0]!, status: "FREE", location });
    await flushBackground();

    expect(result.dispute).toMatchObject({ kind: "SAVED", status: "OPEN" });
    const [state] = await db.select().from(schema.seatCurrentState).where(eq(schema.seatCurrentState.seatId, seatIds[0]!));
    expect(state?.sourceSummary).toBe("DISPUTE");
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith("u1", expect.objectContaining({ title: "Quieren liberar un lugar que marcaste como guardado" }));
  });

  it("FREE replacing the reporter's own \"guardado\" just frees the seat — no vote", async () => {
    await observations.observe({ userId: "u1", roomId, seatId: seatIds[0]!, status: "SAVED", location });
    const result = await observations.observe({ userId: "u1", roomId, seatId: seatIds[0]!, status: "FREE", location });
    await flushBackground();

    expect(result.dispute).toBeNull();
    const [state] = await db.select().from(schema.seatCurrentState).where(eq(schema.seatCurrentState.seatId, seatIds[0]!));
    expect(state?.status).toBe("FREE");
    expect(send).not.toHaveBeenCalled();
  });

  it("FREE on an observation-only OCCUPIED seat stays an observation conflict (UNCERTAIN, no vote)", async () => {
    await observations.observe({ userId: "u1", roomId, seatId: seatIds[0]!, status: "OCCUPIED", location });
    const result = await observations.observe({ userId: "u2", roomId, seatId: seatIds[0]!, status: "FREE", location });
    expect(result.dispute).toBeNull();
  });

  it("does not push when the observed seat has no check-in or the status is not FREE", async () => {
    await observations.observe({ userId: "u2", roomId, seatId: seatIds[0]!, status: "FREE", location });
    await checkIns.checkIn({ userId: "u1", roomId, seatId: seatIds[1]!, location, showIdentity: false });
    await observations.observe({ userId: "u2", roomId, seatId: seatIds[1]!, status: "OCCUPIED", location });
    await flushBackground();
    expect(send).not.toHaveBeenCalled();
  });

  it("a single OCCUPIED observation sets the seat OCCUPIED with 20-minute expiry", async () => {
    const before = Date.now();
    await observations.observe({ userId: "u1", roomId, seatId: seatIds[0]!, status: "OCCUPIED", location });

    const [state] = await db.select().from(schema.seatCurrentState).where(eq(schema.seatCurrentState.seatId, seatIds[0]!));
    expect(state?.status).toBe("OCCUPIED");

    const [obs] = await db.select().from(schema.seatObservations).where(eq(schema.seatObservations.seatId, seatIds[0]!));
    const minutes = (new Date(obs!.expiresAt).getTime() - before) / 60_000;
    expect(minutes).toBeGreaterThan(19.9);
    expect(minutes).toBeLessThanOrEqual(20.01);
  });

  it("a SAVED observation sets the seat SAVED with 30-minute expiry", async () => {
    const before = Date.now();
    await observations.observe({ userId: "u1", roomId, seatId: seatIds[0]!, status: "SAVED", location });

    const [state] = await db.select().from(schema.seatCurrentState).where(eq(schema.seatCurrentState.seatId, seatIds[0]!));
    expect(state?.status).toBe("SAVED");

    const [obs] = await db.select().from(schema.seatObservations).where(eq(schema.seatObservations.seatId, seatIds[0]!));
    expect(obs?.observedStatus).toBe("SAVED");
    const minutes = (new Date(obs!.expiresAt).getTime() - before) / 60_000;
    expect(minutes).toBeGreaterThan(29.9);
    expect(minutes).toBeLessThanOrEqual(30.01);
  });

  it("conflicting observations from different users produce UNCERTAIN", async () => {
    await observations.observe({ userId: "u1", roomId, seatId: seatIds[0]!, status: "OCCUPIED", location });
    await observations.observe({ userId: "u2", roomId, seatId: seatIds[0]!, status: "FREE", location });

    const [state] = await db.select().from(schema.seatCurrentState).where(eq(schema.seatCurrentState.seatId, seatIds[0]!));
    expect(state?.status).toBe("UNCERTAIN");
  });

  it("rejects a FREE observation on a seat whose check-in is photo-verified", async () => {
    const { checkIn } = await checkIns.checkIn({ userId: "u1", roomId, seatId: seatIds[0]!, location, showIdentity: false });
    await db.update(schema.checkIns).set({ verifiedAt: new Date() }).where(eq(schema.checkIns.id, checkIn.id));

    await expect(observations.observe({ userId: "u2", roomId, seatId: seatIds[0]!, status: "FREE", location })).rejects.toMatchObject({
      code: "SEAT_VERIFIED",
    });
  });

  it("still allows an OCCUPIED observation on a seat whose check-in is photo-verified", async () => {
    const { checkIn } = await checkIns.checkIn({ userId: "u1", roomId, seatId: seatIds[0]!, location, showIdentity: false });
    await db.update(schema.checkIns).set({ verifiedAt: new Date() }).where(eq(schema.checkIns.id, checkIn.id));

    await expect(
      observations.observe({ userId: "u2", roomId, seatId: seatIds[0]!, status: "OCCUPIED", location }),
    ).resolves.toBeDefined();
  });

  it("a duplicate observation by the same user on the same seat replaces the previous one", async () => {
    await observations.observe({ userId: "u1", roomId, seatId: seatIds[0]!, status: "OCCUPIED", location });
    await observations.observe({ userId: "u1", roomId, seatId: seatIds[0]!, status: "FREE", location });

    const [state] = await db.select().from(schema.seatCurrentState).where(eq(schema.seatCurrentState.seatId, seatIds[0]!));
    expect(state?.status).toBe("FREE"); // only the latest counts, no conflict with itself

    const rows = await db.select().from(schema.seatObservations).where(eq(schema.seatObservations.seatId, seatIds[0]!));
    expect(rows).toHaveLength(2); // old one kept but expired
    expect(rows.filter((r) => r.expiresAt.getTime() > Date.now())).toHaveLength(1);
  });

  it("photo protection blocks a FREE report for 2 hours from the photo, then a vote can open", async () => {
    const { checkIn } = await checkIns.checkIn({ userId: "u1", roomId, seatId: seatIds[0]!, location, showIdentity: false });
    await db.update(schema.checkIns).set({ verifiedAt: new Date(Date.now() - 119 * 60_000) }).where(eq(schema.checkIns.id, checkIn.id));
    await expect(observations.observe({ userId: "u2", roomId, seatId: seatIds[0]!, status: "FREE", location })).rejects.toMatchObject({
      code: "SEAT_VERIFIED",
    });

    await db.update(schema.checkIns).set({ verifiedAt: new Date(Date.now() - 121 * 60_000) }).where(eq(schema.checkIns.id, checkIn.id));
    const result = await observations.observe({ userId: "u2", roomId, seatId: seatIds[0]!, status: "FREE", location });
    expect(result.dispute?.kind).toBe("ABSENT");
  });

  it("rejects an observation on the seat where the caller has their own active check-in", async () => {
    await checkIns.checkIn({ userId: "u1", roomId, seatId: seatIds[0]!, location, showIdentity: false });
    await expect(observations.observe({ userId: "u1", roomId, seatId: seatIds[0]!, status: "FREE", location })).rejects.toMatchObject({
      code: "OWN_SEAT_OBSERVATION",
    });
  });

  it("a valid QR token for the seat's table gives the observation 1.5x confidence weight", async () => {
    const [seat] = await db.select().from(schema.seats).where(eq(schema.seats.id, seatIds[0]!));
    const [table] = await db.select().from(schema.roomTables).where(eq(schema.roomTables.id, seat!.tableId));
    const code = await qr.create(roomId, table!.code);

    await observations.observe({ userId: "u1", roomId, seatId: seatIds[0]!, status: "FREE", location, qrToken: code.token });

    const [obs] = await db.select().from(schema.seatObservations).where(eq(schema.seatObservations.seatId, seatIds[0]!));
    expect(obs?.qrVerified).toBe(true);
    expect(obs?.confidenceWeight).toBeCloseTo(1.5, 5);
  });

  it("an invalid QR token is ignored, not an error, and keeps the default weight", async () => {
    await observations.observe({ userId: "u1", roomId, seatId: seatIds[0]!, status: "FREE", location, qrToken: "not-a-real-token" });

    const [obs] = await db.select().from(schema.seatObservations).where(eq(schema.seatObservations.seatId, seatIds[0]!));
    expect(obs?.qrVerified).toBe(false);
    expect(obs?.confidenceWeight).toBeCloseTo(1, 5);
  });

  it("a user with spam_score >= 5 gets half confidence weight on their observations", async () => {
    for (let i = 0; i < 5; i++) await reputation.incrementSpamScore("u1");

    await observations.observe({ userId: "u1", roomId, seatId: seatIds[0]!, status: "FREE", location });

    const [obs] = await db.select().from(schema.seatObservations).where(eq(schema.seatObservations.seatId, seatIds[0]!));
    expect(obs?.confidenceWeight).toBeCloseTo(0.5, 5);
  });

  it("concurrent observations on different seats cannot bypass the distinct-seat cap", async () => {
    const limits = { perMinuteLimit: 6, distinctSeatCap: 2 } as unknown as ObservationLimits;
    const results = await Promise.allSettled(
      seatIds.slice(0, 5).map((seatId) => observations.observe({ userId: "u1", roomId, seatId, status: "FREE", location, limits })),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(2);
    for (const r of results.filter((r) => r.status === "rejected")) {
      expect((r as PromiseRejectedResult).reason).toMatchObject({ code: "RATE_LIMITED" });
    }
    const rows = await db.select().from(schema.seatObservations).where(eq(schema.seatObservations.userId, "u1"));
    expect(new Set(rows.map((r) => r.seatId)).size).toBe(2);
  });
});
