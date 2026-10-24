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
import { ManualScheduler } from "../platform/scheduler.js";

async function build(db: Db) {
  const roomState = new RoomStateService(db);
  const presence = new PresenceService();
  const reputation = new ReputationService(db);
  const security = new SecurityEventService(db, reputation);
  const abusePolicy = new AbusePolicyService(db, new TurnstileService());
  const studySessions = new StudySessionService(db);
  const qr = new QrService(db);
  const push = new PushService(db);
  const send = vi.spyOn(push, "sendToUser").mockResolvedValue(null);
  const notifications = new NotificationService(db, push, roomState, new ManualScheduler());
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
    db = freshDb();
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

  it("FREE on an observation-only OCCUPIED seat opens a vote that the reporter wins when nobody else votes", async () => {
    await observations.observe({ userId: "u1", roomId, seatId: seatIds[0]!, status: "OCCUPIED", location });
    const result = await observations.observe({ userId: "u2", roomId, seatId: seatIds[0]!, status: "FREE", location });
    expect(result.dispute).toMatchObject({ kind: "SAVED", status: "OPEN", seatId: seatIds[0] });
    expect(result.changes.find((c) => c.seatId === seatIds[0])?.status).toBe("UNCERTAIN");

    await db.update(schema.seatDisputes).set({ closesAt: new Date(Date.now() - 1000) }).where(eq(schema.seatDisputes.id, result.dispute!.id));
    await disputes.resolveDue(new Date());
    await flushBackground();

    const [row] = await db.select().from(schema.seatDisputes).where(eq(schema.seatDisputes.id, result.dispute!.id));
    expect(row?.status).toBe("RESOLVED_ABSENT");
    const [state] = await db.select().from(schema.seatCurrentState).where(eq(schema.seatCurrentState.seatId, seatIds[0]!));
    expect(state?.status).toBe("FREE");
  });

  it("FREE on an observation-only OCCUPIED seat stays OCCUPIED when the room votes it is taken", async () => {
    await observations.observe({ userId: "u1", roomId, seatId: seatIds[0]!, status: "OCCUPIED", location });
    const result = await observations.observe({ userId: "u2", roomId, seatId: seatIds[0]!, status: "FREE", location });
    // Voters need a seat of their own in the room.
    await insertUsers(db, ["u4"]);
    await checkIns.checkIn({ userId: "u3", roomId, seatId: seatIds[1]!, location, showIdentity: false });
    await checkIns.checkIn({ userId: "u4", roomId, seatId: seatIds[2]!, location, showIdentity: false });
    await disputes.vote(result.dispute!.id, "u3", "PRESENT", location);
    await disputes.vote(result.dispute!.id, "u4", "PRESENT", location);

    await db.update(schema.seatDisputes).set({ closesAt: new Date(Date.now() - 1000) }).where(eq(schema.seatDisputes.id, result.dispute!.id));
    await disputes.resolveDue(new Date());
    await flushBackground();

    const [state] = await db.select().from(schema.seatCurrentState).where(eq(schema.seatCurrentState.seatId, seatIds[0]!));
    expect(state?.status).toBe("OCCUPIED");
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

  it("an admin OCCUPIED mark is an admin_override that holds the seat for one check-in block", async () => {
    const before = Date.now();
    await observations.observe({ userId: "u1", roomId, seatId: seatIds[0]!, status: "OCCUPIED", location, adminMark: true });

    const [obs] = await db.select().from(schema.seatObservations).where(eq(schema.seatObservations.seatId, seatIds[0]!));
    expect(obs?.adminOverride).toBe(true);
    expect(obs?.confidenceWeight).toBe(1000);
    const minutes = (new Date(obs!.expiresAt).getTime() - before) / 60_000;
    expect(minutes).toBeGreaterThan(179.9);
    expect(minutes).toBeLessThanOrEqual(180.01);

    // A single member "Está libre" does not flip the admin mark to FREE.
    const result = await observations.observe({ userId: "u2", roomId, seatId: seatIds[0]!, status: "FREE", location });
    expect(result.dispute).toBeNull();
    const [state] = await db.select().from(schema.seatCurrentState).where(eq(schema.seatCurrentState.seatId, seatIds[0]!));
    expect(state?.status).not.toBe("FREE");
  });

  it("an admin FREE mark is an admin_override for one check-in block that beats member and admin OCCUPIED reports", async () => {
    await observations.observe({ userId: "u2", roomId, seatId: seatIds[0]!, status: "OCCUPIED", location });
    await observations.observe({ userId: "u1", roomId, seatId: seatIds[1]!, status: "OCCUPIED", location, adminMark: true });

    const before = Date.now();
    await observations.observe({ userId: "u1", roomId, seatId: seatIds[0]!, status: "FREE", location, adminMark: true });
    await observations.observe({ userId: "u1", roomId, seatId: seatIds[1]!, status: "FREE", location, adminMark: true });

    const states = await db.select().from(schema.seatCurrentState);
    expect(states.find((s) => s.seatId === seatIds[0])?.status).toBe("FREE");
    expect(states.find((s) => s.seatId === seatIds[1])?.status).toBe("FREE");
    const live = (await db.select().from(schema.seatObservations)).filter((o) => o.adminOverride && new Date(o.expiresAt).getTime() > Date.now());
    expect(live.map((o) => o.observedStatus)).toEqual(["FREE", "FREE"]);
    const minutes = (new Date(live[0]!.expiresAt).getTime() - before) / 60_000;
    expect(minutes).toBeGreaterThan(179.9);
    expect(minutes).toBeLessThanOrEqual(180.01);
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

  it("allows a vote on a photo-verified seat but one reporter cannot remove its holder", async () => {
    const { checkIn } = await checkIns.checkIn({ userId: "u1", roomId, seatId: seatIds[0]!, location, showIdentity: false });
    await db.update(schema.checkIns).set({ verifiedAt: new Date() }).where(eq(schema.checkIns.id, checkIn.id));

    const result = await observations.observe({ userId: "u2", roomId, seatId: seatIds[0]!, status: "FREE", location });
    expect(result.dispute?.kind).toBe("ABSENT");
    await db.update(schema.seatDisputes).set({ closesAt: new Date(Date.now() - 1000) }).where(eq(schema.seatDisputes.id, result.dispute!.id));
    await disputes.resolveDue();
    expect(db.select().from(schema.checkIns).where(eq(schema.checkIns.id, checkIn.id)).get()?.status).toBe("ACTIVE");
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

  it("reports before and after photo protection expires join the same vote", async () => {
    const { checkIn } = await checkIns.checkIn({ userId: "u1", roomId, seatId: seatIds[0]!, location, showIdentity: false });
    await db.update(schema.checkIns).set({ verifiedAt: new Date(Date.now() - 119 * 60_000) }).where(eq(schema.checkIns.id, checkIn.id));
    const first = await observations.observe({ userId: "u2", roomId, seatId: seatIds[0]!, status: "FREE", location });

    await db.update(schema.checkIns).set({ verifiedAt: new Date(Date.now() - 121 * 60_000) }).where(eq(schema.checkIns.id, checkIn.id));
    const result = await observations.observe({ userId: "u2", roomId, seatId: seatIds[0]!, status: "FREE", location });
    expect(result.dispute?.kind).toBe("ABSENT");
    expect(result.dispute?.id).toBe(first.dispute?.id);
    expect(result.dispute?.votes.absent).toBe(1);
  });

  it("SAVED opens a presence vote, cancels the abandoned check-in and keeps belongings guarded", async () => {
    const { checkIn } = await checkIns.checkIn({ userId: "u1", roomId, seatId: seatIds[0]!, location, showIdentity: false });
    const result = await observations.observe({ userId: "u2", roomId, seatId: seatIds[0]!, status: "SAVED", location });
    expect(result.dispute).toMatchObject({ kind: "ABSENT", myVote: "SAVED", votes: { saved: 1 } });
    await db.update(schema.seatDisputes).set({ closesAt: new Date(Date.now() - 1000) }).where(eq(schema.seatDisputes.id, result.dispute!.id));
    await disputes.resolveDue();
    expect(db.select().from(schema.checkIns).where(eq(schema.checkIns.id, checkIn.id)).get()?.status).toBe("CANCELLED");
    expect(db.select().from(schema.seatCurrentState).where(eq(schema.seatCurrentState.seatId, seatIds[0]!)).get()?.status).toBe("SAVED");
  });

  it("keeps the holder when occupied wins and expires the rejected belongings report", async () => {
    await insertUsers(db, ["u4"]);
    const { checkIn } = await checkIns.checkIn({ userId: "u1", roomId, seatId: seatIds[0]!, location, showIdentity: false });
    const result = await observations.observe({ userId: "u2", roomId, seatId: seatIds[0]!, status: "SAVED", location });
    await observations.observe({ userId: "u3", roomId, seatId: seatIds[0]!, status: "OCCUPIED", location });
    await observations.observe({ userId: "u4", roomId, seatId: seatIds[0]!, status: "OCCUPIED", location });
    await db.update(schema.seatDisputes).set({ closesAt: new Date(Date.now() - 1000) }).where(eq(schema.seatDisputes.id, result.dispute!.id));
    await disputes.resolveDue();
    expect(db.select().from(schema.checkIns).where(eq(schema.checkIns.id, checkIn.id)).get()?.status).toBe("ACTIVE");
    expect(db.select().from(schema.seatCurrentState).where(eq(schema.seatCurrentState.seatId, seatIds[0]!)).get()?.status).toBe("OCCUPIED");
    const belongings = db.select().from(schema.seatObservations).all().filter((row) => row.observedStatus === "SAVED");
    expect(belongings.every((row) => row.expiresAt.getTime() <= Date.now())).toBe(true);
  });

  it("accepts a belongings vote through the public vote service for an in-room voter", async () => {
    await checkIns.checkIn({ userId: "u1", roomId, seatId: seatIds[0]!, location, showIdentity: false });
    await checkIns.checkIn({ userId: "u3", roomId, seatId: seatIds[1]!, location, showIdentity: false });
    const result = await observations.observe({ userId: "u2", roomId, seatId: seatIds[0]!, status: "FREE", location });
    const vote = await disputes.vote(result.dispute!.id, "u3", "SAVED", location);
    expect(vote.myVote).toBe("SAVED");
    expect(vote.votes).toEqual({ present: 0, absent: 1, saved: 1 });
  });

  it("counts each reporter once and updates their vote when their observation changes", async () => {
    await checkIns.checkIn({ userId: "u1", roomId, seatId: seatIds[0]!, location, showIdentity: false });
    const first = await observations.observe({ userId: "u2", roomId, seatId: seatIds[0]!, status: "FREE", location });
    const second = await observations.observe({ userId: "u3", roomId, seatId: seatIds[0]!, status: "SAVED", location });
    expect(second.dispute?.id).toBe(first.dispute?.id);
    expect(second.dispute?.votes).toEqual({ present: 0, absent: 1, saved: 1 });
    const changed = await observations.observe({ userId: "u3", roomId, seatId: seatIds[0]!, status: "OCCUPIED", location });
    expect(changed.dispute?.votes).toEqual({ present: 1, absent: 1 });
    expect(changed.dispute?.myVote).toBe("PRESENT");
  });

  it("does not advertise a seat as free when absence wins but belongings votes tie free votes", async () => {
    await checkIns.checkIn({ userId: "u1", roomId, seatId: seatIds[0]!, location, showIdentity: false });
    const result = await observations.observe({ userId: "u2", roomId, seatId: seatIds[0]!, status: "FREE", location });
    await observations.observe({ userId: "u3", roomId, seatId: seatIds[0]!, status: "SAVED", location });
    await db.update(schema.seatDisputes).set({ closesAt: new Date(Date.now() - 1000) }).where(eq(schema.seatDisputes.id, result.dispute!.id));
    await disputes.resolveDue();
    expect(db.select().from(schema.seatCurrentState).where(eq(schema.seatCurrentState.seatId, seatIds[0]!)).get()?.status).toBe("SAVED");
  });

  it("two independent confirmations can retire a photo-verified holder who left", async () => {
    await insertUsers(db, ["u4"]);
    const { checkIn } = await checkIns.checkIn({ userId: "u1", roomId, seatId: seatIds[0]!, location, showIdentity: false });
    await db.update(schema.checkIns).set({ verifiedAt: new Date() }).where(eq(schema.checkIns.id, checkIn.id));
    const result = await observations.observe({ userId: "u2", roomId, seatId: seatIds[0]!, status: "FREE", location });
    await observations.observe({ userId: "u3", roomId, seatId: seatIds[0]!, status: "FREE", location });
    await observations.observe({ userId: "u4", roomId, seatId: seatIds[0]!, status: "FREE", location });
    await db.update(schema.seatDisputes).set({ closesAt: new Date(Date.now() - 1000) }).where(eq(schema.seatDisputes.id, result.dispute!.id));
    await disputes.resolveDue();
    expect(db.select().from(schema.checkIns).where(eq(schema.checkIns.id, checkIn.id)).get()?.status).toBe("CANCELLED");
    expect(db.select().from(schema.seatCurrentState).where(eq(schema.seatCurrentState.seatId, seatIds[0]!)).get()?.status).toBe("FREE");
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

  it("admin OCCUPIED marks skip the distinct-seat cap", async () => {
    const limits = { perMinuteLimit: 6, distinctSeatCap: 2 } as unknown as ObservationLimits;
    for (const seatId of seatIds.slice(0, 5)) {
      await observations.observe({ userId: "u1", roomId, seatId, status: "OCCUPIED", location, limits, adminMark: true });
    }
    const rows = await db.select().from(schema.seatObservations).where(eq(schema.seatObservations.userId, "u1"));
    expect(new Set(rows.map((r) => r.seatId)).size).toBe(5);
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
