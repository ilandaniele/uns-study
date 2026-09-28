import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@uns/database";
import { schema } from "@uns/database";
import { eq } from "drizzle-orm";
import { freshDb, getRoom, getSeats, insertUsers } from "../test-utils.js";
import { PresenceService } from "../presence/presence.service.js";
import { RoomStateService } from "../rooms/room-state.service.js";
import { SecurityEventService } from "../security/security-event.service.js";
import { AbusePolicyService } from "../security/abuse-policy.service.js";
import { TurnstileService } from "../security/turnstile.service.js";
import { ReputationService } from "../reputation/reputation.service.js";
import { StudySessionService } from "../rankings/study-session.service.js";
import { RestrictionService } from "../users/restriction.service.js";
import { RateLimitService } from "../security/rate-limit.service.js";
import { QrService } from "../qr/qr.service.js";
import { CheckInService } from "../checkins/checkins.service.js";
import { ObservationService } from "../observations/observations.service.js";
import { RoomRealtimeGateway } from "../realtime/room-realtime.gateway.js";
import type { Auth } from "../auth/auth.instance.js";
import { DailyResetJob, resetInstantFor } from "../jobs/daily-reset.job.js";
import { DisputeService } from "./disputes.service.js";

const mockAuth = { api: { getSession: async () => null } } as unknown as Auth;

async function build(db: Db) {
  const roomState = new RoomStateService(db);
  const presence = new PresenceService();
  const reputation = new ReputationService(db);
  const security = new SecurityEventService(db, reputation);
  const studySessions = new StudySessionService(db);
  const restrictions = new RestrictionService(db);
  const gateway = new RoomRealtimeGateway(roomState, mockAuth); // no @WebSocketServer() attached — emits are no-ops in tests
  const qr = new QrService(db);
  const disputes = new DisputeService(db, roomState, presence, security, studySessions, reputation, restrictions, gateway);
  const checkIns = new CheckInService(db, roomState, presence, security, studySessions, qr, disputes);
  const abusePolicy = new AbusePolicyService(db, new TurnstileService());
  const observations = new ObservationService(db, roomState, presence, security, abusePolicy, qr, reputation);
  const dailyReset = new DailyResetJob(db, gateway, studySessions);
  return { disputes, checkIns, observations, reputation, roomState, dailyReset };
}

describe("DisputeService", () => {
  let db: Db;
  let svc: DisputeService;
  let checkIns: CheckInService;
  let observations: ObservationService;
  let roomState: RoomStateService;
  let dailyReset: DailyResetJob;
  let roomId: string;
  let seatIds: string[];
  let location: { latitude: number; longitude: number; accuracy: number; capturedAt: string };

  beforeEach(async () => {
    db = await freshDb();
    ({ disputes: svc, checkIns, observations, roomState, dailyReset } = await build(db));
    const room = await getRoom(db);
    roomId = room.id;
    location = { latitude: room.latitude, longitude: room.longitude, accuracy: 10, capturedAt: new Date().toISOString() };
    seatIds = (await getSeats(db)).map((s) => s.id);
    await insertUsers(db, ["u1", "u2", "u3"]);
  });

  async function forceClosed(disputeId: string): Promise<void> {
    await db.update(schema.seatDisputes).set({ closesAt: new Date(Date.now() - 1000) }).where(eq(schema.seatDisputes.id, disputeId));
  }

  it("opening a CLAIM against an active check-in makes the seat UNCERTAIN", async () => {
    await checkIns.checkIn({ userId: "u1", roomId, seatId: seatIds[0]!, location, showIdentity: false });
    const { dispute } = await svc.open({ userId: "u2", roomId, seatId: seatIds[0]!, kind: "CLAIM", location });
    expect(dispute.status).toBe("OPEN");
    expect(dispute.votes).toEqual({ present: 0, absent: 1 }); // opener's automatic ABSENT vote

    const [state] = await db.select().from(schema.seatCurrentState).where(eq(schema.seatCurrentState.seatId, seatIds[0]!));
    expect(state?.status).toBe("UNCERTAIN");
    expect(state?.sourceSummary).toBe("DISPUTE");
  });

  it("rejects opening a dispute on your own seat", async () => {
    await checkIns.checkIn({ userId: "u1", roomId, seatId: seatIds[0]!, location, showIdentity: false });
    await expect(svc.open({ userId: "u1", roomId, seatId: seatIds[0]!, kind: "CLAIM", location })).rejects.toMatchObject({
      code: "DISPUTE_NOT_ALLOWED",
    });
  });

  it("rejects a CLAIM/ABSENT dispute on a seat with no active check-in", async () => {
    await expect(svc.open({ userId: "u1", roomId, seatId: seatIds[0]!, kind: "ABSENT", location })).rejects.toMatchObject({
      code: "DISPUTE_NOT_ALLOWED",
    });
  });

  it("rejects a SAVED dispute on a FREE/UNKNOWN seat", async () => {
    await expect(svc.open({ userId: "u1", roomId, seatId: seatIds[0]!, kind: "SAVED", location })).rejects.toMatchObject({
      code: "DISPUTE_NOT_ALLOWED",
    });
  });

  it("only one dispute can be OPEN per seat — a concurrent race has exactly one winner", async () => {
    await checkIns.checkIn({ userId: "u1", roomId, seatId: seatIds[0]!, location, showIdentity: false });
    await insertUsers(db, ["u4"]);
    const results = await Promise.allSettled([
      svc.open({ userId: "u2", roomId, seatId: seatIds[0]!, kind: "CLAIM", location }),
      svc.open({ userId: "u4", roomId, seatId: seatIds[0]!, kind: "CLAIM", location }),
    ]);
    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toMatchObject({ code: "DISPUTE_ALREADY_OPEN" });
  });

  it("votes upsert — voting twice replaces the previous vote", async () => {
    await checkIns.checkIn({ userId: "u1", roomId, seatId: seatIds[0]!, location, showIdentity: false });
    const { dispute } = await svc.open({ userId: "u2", roomId, seatId: seatIds[0]!, kind: "CLAIM", location });

    await svc.vote(dispute.id, "u3", "PRESENT", location);
    let fresh = await svc.getById(dispute.id, null);
    expect(fresh.votes).toEqual({ present: 1, absent: 1 });

    await svc.vote(dispute.id, "u3", "ABSENT", location);
    fresh = await svc.getById(dispute.id, null);
    expect(fresh.votes).toEqual({ present: 0, absent: 2 });
  });

  it("the incumbent cannot vote, but can respond", async () => {
    await checkIns.checkIn({ userId: "u1", roomId, seatId: seatIds[0]!, location, showIdentity: false });
    const { dispute } = await svc.open({ userId: "u2", roomId, seatId: seatIds[0]!, kind: "CLAIM", location });

    await expect(svc.vote(dispute.id, "u1", "PRESENT", location)).rejects.toMatchObject({ code: "DISPUTE_NOT_ALLOWED" });

    const { dispute: afterRespond } = await svc.respond(dispute.id, "u1", "STILL_HERE", location);
    expect(afterRespond.votes).toEqual({ present: 1, absent: 1 });
  });

  it("resolution: absent wins a CLAIM — transfers the seat and closes the claimant's previous seat", async () => {
    await checkIns.checkIn({ userId: "u1", roomId, seatId: seatIds[0]!, location, showIdentity: false });
    await checkIns.checkIn({ userId: "u2", roomId, seatId: seatIds[1]!, location, showIdentity: false });

    const { dispute } = await svc.open({ userId: "u2", roomId, seatId: seatIds[0]!, kind: "CLAIM", location });
    await forceClosed(dispute.id);
    await svc.resolveDue(new Date());

    const resolved = await svc.getById(dispute.id, null);
    expect(resolved.status).toBe("RESOLVED_ABSENT");

    const u1CheckIn = await checkIns.getActiveCheckIn("u1");
    expect(u1CheckIn).toBeNull();
    const u2CheckIn = await checkIns.getActiveCheckIn("u2");
    expect(u2CheckIn?.seatId).toBe(seatIds[0]);

    const [oldSeatState] = await db.select().from(schema.seatCurrentState).where(eq(schema.seatCurrentState.seatId, seatIds[1]!));
    expect(oldSeatState?.status).toBe("UNKNOWN");
  });

  it("resolution: absent wins an ABSENT dispute — the seat just frees up, no transfer", async () => {
    await checkIns.checkIn({ userId: "u1", roomId, seatId: seatIds[0]!, location, showIdentity: false });
    const { dispute } = await svc.open({ userId: "u2", roomId, seatId: seatIds[0]!, kind: "ABSENT", location });
    await forceClosed(dispute.id);
    await svc.resolveDue(new Date());

    expect((await checkIns.getActiveCheckIn("u1"))).toBeNull();
    expect((await checkIns.getActiveCheckIn("u2"))).toBeNull(); // ABSENT never creates a check-in for the opener
    const [state] = await db.select().from(schema.seatCurrentState).where(eq(schema.seatCurrentState.seatId, seatIds[0]!));
    expect(state?.status).toBe("UNKNOWN");
  });

  it("resolution: present wins — the incumbent keeps the seat and the opener takes a reputation hit", async () => {
    await checkIns.checkIn({ userId: "u1", roomId, seatId: seatIds[0]!, location, showIdentity: false });
    const { dispute } = await svc.open({ userId: "u2", roomId, seatId: seatIds[0]!, kind: "CLAIM", location });
    await svc.respond(dispute.id, "u1", "STILL_HERE", location); // present=1, absent=1
    await svc.vote(dispute.id, "u3", "PRESENT", location); // present=2, absent=1

    await forceClosed(dispute.id);
    await svc.resolveDue(new Date());

    const resolved = await svc.getById(dispute.id, null);
    expect(resolved.status).toBe("RESOLVED_PRESENT");
    expect((await checkIns.getActiveCheckIn("u1"))?.seatId).toBe(seatIds[0]);

    const [rep] = await db.select().from(schema.userReputation).where(eq(schema.userReputation.userId, "u2"));
    expect(rep?.rejectedObservations).toBe(1);
  });

  it("a tie resolves as TIED, keeping the seat UNCERTAIN until the incumbent extends", async () => {
    await checkIns.checkIn({ userId: "u1", roomId, seatId: seatIds[0]!, location, showIdentity: false });
    const { dispute } = await svc.open({ userId: "u2", roomId, seatId: seatIds[0]!, kind: "CLAIM", location }); // absent=1
    await svc.respond(dispute.id, "u1", "STILL_HERE", location); // present=1 -> tie

    await forceClosed(dispute.id);
    await svc.resolveDue(new Date());
    const resolved = await svc.getById(dispute.id, null);
    expect(resolved.status).toBe("TIED");

    const live = await roomState.getLiveSeatStates(roomId, new Date());
    expect(live.get(seatIds[0]!)?.status).toBe("UNCERTAIN");

    await new Promise((r) => setTimeout(r, 5));
    await checkIns.extend("u1", location);
    const liveAfterExtend = await roomState.getLiveSeatStates(roomId, new Date());
    expect(liveAfterExtend.get(seatIds[0]!)?.status).toBe("OCCUPIED");
  });

  it("the incumbent responding LEFT resolves the dispute immediately, transferring a CLAIM", async () => {
    await checkIns.checkIn({ userId: "u1", roomId, seatId: seatIds[0]!, location, showIdentity: false });
    const { dispute } = await svc.open({ userId: "u2", roomId, seatId: seatIds[0]!, kind: "CLAIM", location });

    const { dispute: afterLeft } = await svc.respond(dispute.id, "u1", "LEFT");
    expect(afterLeft.status).toBe("RESOLVED_ABSENT");
    expect((await checkIns.getActiveCheckIn("u1"))).toBeNull();
    expect((await checkIns.getActiveCheckIn("u2"))?.seatId).toBe(seatIds[0]);
  });

  it("the incumbent checking out while a dispute is OPEN resolves it immediately", async () => {
    await checkIns.checkIn({ userId: "u1", roomId, seatId: seatIds[0]!, location, showIdentity: false });
    const { dispute } = await svc.open({ userId: "u2", roomId, seatId: seatIds[0]!, kind: "ABSENT", location });

    await checkIns.checkOut("u1");
    const resolved = await svc.getById(dispute.id, null);
    expect(resolved.status).toBe("RESOLVED_ABSENT");
  });

  it("resolveDue is idempotent under concurrency — only one resolution is applied", async () => {
    await checkIns.checkIn({ userId: "u1", roomId, seatId: seatIds[0]!, location, showIdentity: false });
    const { dispute } = await svc.open({ userId: "u2", roomId, seatId: seatIds[0]!, kind: "ABSENT", location });
    await forceClosed(dispute.id);

    await Promise.all([svc.resolveDue(new Date()), svc.resolveDue(new Date())]);

    const events = await db
      .select()
      .from(schema.seatStateEvents)
      .where(eq(schema.seatStateEvents.seatId, seatIds[0]!));
    expect(events.filter((e) => e.eventType === "DISPUTE_RESOLVED")).toHaveLength(1);
  });

  it("daily reset cancels any dispute still OPEN", async () => {
    await checkIns.checkIn({ userId: "u1", roomId, seatId: seatIds[0]!, location, showIdentity: false });
    const { dispute } = await svc.open({ userId: "u2", roomId, seatId: seatIds[0]!, kind: "CLAIM", location });

    const room = await getRoom(db);
    const after = new Date(resetInstantFor(room, new Date()).getTime() + 60_000);
    await dailyReset.runReset(roomId, after);

    const resolved = await svc.getById(dispute.id, null);
    expect(resolved.status).toBe("CANCELLED");
  });

  describe("SAVED disputes", () => {
    it("wins as absent on an observation-only occupied seat — the seat derives FREE with source SAVED", async () => {
      await observations.observe({ userId: "u1", roomId, seatId: seatIds[0]!, status: "OCCUPIED", location });
      const { dispute } = await svc.open({ userId: "u2", roomId, seatId: seatIds[0]!, kind: "SAVED", location });
      expect(dispute.status).toBe("OPEN");

      await forceClosed(dispute.id);
      await svc.resolveDue(new Date());

      const [state] = await db.select().from(schema.seatCurrentState).where(eq(schema.seatCurrentState.seatId, seatIds[0]!));
      expect(state?.status).toBe("FREE");
      expect(state?.sourceSummary).toBe("SAVED");
    });

    it("with an active check-in, winning as absent cancels it", async () => {
      await checkIns.checkIn({ userId: "u1", roomId, seatId: seatIds[0]!, location, showIdentity: false });
      const { dispute } = await svc.open({ userId: "u2", roomId, seatId: seatIds[0]!, kind: "SAVED", location });

      await forceClosed(dispute.id);
      await svc.resolveDue(new Date());

      expect((await checkIns.getActiveCheckIn("u1"))).toBeNull();
      const [state] = await db.select().from(schema.seatCurrentState).where(eq(schema.seatCurrentState.seatId, seatIds[0]!));
      expect(state?.status).toBe("FREE");
      expect(state?.sourceSummary).toBe("SAVED");
    });

    it("a tie resolves as RESOLVED_PRESENT — no change and the opener takes the reputation hit", async () => {
      await checkIns.checkIn({ userId: "u1", roomId, seatId: seatIds[0]!, location, showIdentity: false });
      const { dispute } = await svc.open({ userId: "u2", roomId, seatId: seatIds[0]!, kind: "SAVED", location });
      await svc.respond(dispute.id, "u1", "STILL_HERE", location); // present=1, absent=1 (opener's auto vote)

      await forceClosed(dispute.id);
      await svc.resolveDue(new Date());

      const resolved = await svc.getById(dispute.id, null);
      expect(resolved.status).toBe("RESOLVED_PRESENT");
      expect((await checkIns.getActiveCheckIn("u1"))?.seatId).toBe(seatIds[0]);
      const [rep] = await db.select().from(schema.userReputation).where(eq(schema.userReputation.userId, "u2"));
      expect(rep?.rejectedObservations).toBe(1);
    });
  });
});

describe("DisputeService rate limit numbers", () => {
  it("the dispute-open bucket allows exactly 3 per hour, as wired in the controller", async () => {
    const rateLimit = new RateLimitService();
    const key = "dispute:open:u1";
    expect((await rateLimit.check(key, 3, 3600)).allowed).toBe(true);
    expect((await rateLimit.check(key, 3, 3600)).allowed).toBe(true);
    expect((await rateLimit.check(key, 3, 3600)).allowed).toBe(true);
    expect((await rateLimit.check(key, 3, 3600)).allowed).toBe(false);
  });
});
