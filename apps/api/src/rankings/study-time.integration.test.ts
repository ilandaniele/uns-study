import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Db } from "@sala/database";
import { schema } from "@sala/database";
import { eq } from "drizzle-orm";
import { buildNotificationService, freshDb, getRoom, getSeats, insertUsers } from "../test-utils.js";
import { PresenceService } from "../presence/presence.service.js";
import { RoomStateService } from "../rooms/room-state.service.js";
import { RoomsService } from "../rooms/rooms.service.js";
import { SecurityEventService } from "../security/security-event.service.js";
import { AbusePolicyService } from "../security/abuse-policy.service.js";
import { TurnstileService } from "../security/turnstile.service.js";
import { RateLimitService } from "../security/rate-limit.service.js";
import { ReputationService } from "../reputation/reputation.service.js";
import { RestrictionService } from "../users/restriction.service.js";
import { RolesService } from "../users/roles.service.js";
import { AliasService } from "../users/alias.service.js";
import { QrService } from "../qr/qr.service.js";
import { CheckInService } from "../checkins/checkins.service.js";
import { DisputeService } from "../disputes/disputes.service.js";
import { RoomRealtimeGateway } from "../realtime/room-realtime.gateway.js";
import { RecordingHub } from "../realtime/realtime-hub.js";
import { ExpirationJob } from "../jobs/expiration.job.js";
import { DailyResetJob } from "../jobs/daily-reset.job.js";
import { StudySessionService } from "./study-session.service.js";
import { RankingsService } from "./rankings.service.js";


/**
 * Drives the real check-in / dispute / job services through a simulated day (the clock is faked so
 * `new Date()` inside the services moves) and checks what lands in `study_sessions` and the ranking.
 * Buenos Aires is UTC-3 with no DST, so 11:00Z is 08:00 local.
 */
describe("study time end to end", () => {
  let db: Db;
  let checkIns: CheckInService;
  let disputes: DisputeService;
  let expiration: ExpirationJob;
  let dailyReset: DailyResetJob;
  let rankings: RankingsService;
  let roomId: string;
  let roomSlug: string;
  let seatIds: string[];
  let room: Awaited<ReturnType<typeof getRoom>>;

  beforeEach(async () => {
    db = freshDb();
    const roomState = new RoomStateService(db);
    const presence = new PresenceService();
    const reputation = new ReputationService(db);
    const security = new SecurityEventService(db, reputation);
    const studySessions = new StudySessionService(db);
    const restrictions = new RestrictionService(db);
    const notifications = buildNotificationService(db);
    const gateway = new RoomRealtimeGateway(new RecordingHub(), roomState, notifications, null); // no server attached — emits are no-ops
    disputes = new DisputeService(
      db,
      roomState,
      presence,
      security,
      studySessions,
      reputation,
      restrictions,
      gateway,
      new RateLimitService(),
      new AbusePolicyService(db, new TurnstileService()),
      notifications,
    );
    checkIns = new CheckInService(db, roomState, presence, security, studySessions, new QrService(db), disputes, new RolesService(db));
    expiration = new ExpirationJob(db, roomState, gateway, studySessions, disputes);
    dailyReset = new DailyResetJob(db, gateway, studySessions);
    rankings = new RankingsService(db, new RoomsService(db, roomState), new AliasService(db), new RolesService(db));

    room = await getRoom(db);
    roomId = room.id;
    roomSlug = room.slug;
    seatIds = (await getSeats(db)).map((s) => s.id);
    await insertUsers(db, ["u1", "u2"]);
    await db.insert(schema.userProfiles).values([{ userId: "u1" }, { userId: "u2" }]);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function at(iso: string): Date {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(iso));
    return new Date(iso);
  }

  function location() {
    return { latitude: room.latitude, longitude: room.longitude, accuracy: 10, capturedAt: new Date().toISOString() };
  }

  async function sessionsOf(userId: string) {
    return db.select().from(schema.studySessions).where(eq(schema.studySessions.userId, userId));
  }

  async function value(period: "today" | "week" | "all", now: Date, userId = "u1", category: "study_time" | "streak" = "study_time"): Promise<number> {
    const ranking = await rankings.getRankings(roomSlug, period, category, userId, now);
    return ranking.me?.value ?? 0;
  }

  it("counts a 6h stay kept alive with 'Sigo acá' renewals as 360 min, live and after checkout", async () => {
    at("2026-01-15T11:00:00Z");
    await checkIns.checkIn({ userId: "u1", roomId, seatId: seatIds[0]!, location: location(), showIdentity: false });
    at("2026-01-15T13:55:00Z");
    await checkIns.extend("u1", location()); // expires 16:55Z
    at("2026-01-15T16:50:00Z");
    // A same-seat re-check-in is also a renewal: it refreshes the same row instead of opening a new one.
    await checkIns.checkIn({ userId: "u1", roomId, seatId: seatIds[0]!, location: location(), showIdentity: false });

    const sixHoursIn = at("2026-01-15T17:00:00Z");
    expect(await value("today", sixHoursIn)).toBe(360);
    expect(await sessionsOf("u1")).toHaveLength(0);

    await checkIns.checkOut("u1");
    const rows = await sessionsOf("u1");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ verifiedMinutes: 360, localDate: "2026-01-15", source: "CHECK_IN" });
    expect(await value("today", sixHoursIn)).toBe(360); // closed row only, not also counted live
    expect(await value("all", sixHoursIn, "u1", "streak")).toBe(1);
  });

  it("expiration sweep records the stay clamped to its expiry, and an expired-but-unswept check-in still counts", async () => {
    at("2026-01-15T11:00:00Z");
    await checkIns.checkIn({ userId: "u1", roomId, seatId: seatIds[0]!, location: location(), showIdentity: false });

    // Expired at 14:00Z but the sweep hasn't run yet: the minutes must not drop out of the ranking.
    const beforeSweep = at("2026-01-15T14:10:00Z");
    expect(await value("today", beforeSweep)).toBe(180);

    await expiration.runSweep(beforeSweep);
    await expiration.runSweep(beforeSweep); // a second sweep is a no-op
    const rows = await sessionsOf("u1");
    expect(rows).toHaveLength(1);
    expect(rows[0]?.verifiedMinutes).toBe(180);
    expect(await value("today", beforeSweep)).toBe(180);
  });

  it("a checkout racing the expiration sweep records exactly one session", async () => {
    at("2026-01-15T11:00:00Z");
    await checkIns.checkIn({ userId: "u1", roomId, seatId: seatIds[0]!, location: location(), showIdentity: false });
    const late = at("2026-01-15T14:05:00Z");
    await Promise.all([checkIns.checkOut("u1"), expiration.runSweep(late)]);

    expect(await sessionsOf("u1")).toHaveLength(1);
    expect(await value("today", late)).toBe(180);
  });

  it("daily reset closes a 22:00-04:00 stay and credits each local day its own portion", async () => {
    at("2026-01-15T01:00:00Z"); // 2026-01-14 22:00 local
    await checkIns.checkIn({ userId: "u1", roomId, seatId: seatIds[0]!, location: location(), showIdentity: false });
    at("2026-01-15T03:55:00Z");
    await checkIns.extend("u1", location());
    at("2026-01-15T06:50:00Z");
    await checkIns.extend("u1", location());

    const reset = at("2026-01-15T07:00:00Z"); // 04:00 local
    expect(await dailyReset.runReset(roomId, reset)).toBe(true);

    const rows = await sessionsOf("u1");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ verifiedMinutes: 360, localDate: "2026-01-14" });
    expect((await db.select().from(schema.checkIns).where(eq(schema.checkIns.userId, "u1")))[0]?.status).toBe("EXPIRED");

    const laterToday = new Date("2026-01-15T15:00:00Z");
    expect(await value("today", laterToday)).toBe(240); // 00:00-04:00 local
    expect(await value("today", new Date("2026-01-15T02:59:00Z"))).toBe(120); // 22:00-24:00 local, ranked on the 14th
    expect(await value("week", laterToday)).toBe(360);
    expect(await value("all", laterToday, "u1", "streak")).toBe(2);
  });

  it("splits a still-ACTIVE stay across midnight live too", async () => {
    at("2026-01-15T01:00:00Z"); // 2026-01-14 22:00 local
    await checkIns.checkIn({ userId: "u1", roomId, seatId: seatIds[0]!, location: location(), showIdentity: false });
    const afterMidnight = at("2026-01-15T03:30:00Z"); // 00:30 local on the 15th
    expect(await value("today", afterMidnight)).toBe(30);
    expect(await value("week", afterMidnight)).toBe(150);
  });

  it("losing a dispute records the stay up to the moment it was lost", async () => {
    at("2026-01-15T11:00:00Z");
    await checkIns.checkIn({ userId: "u1", roomId, seatId: seatIds[0]!, location: location(), showIdentity: false });
    const lost = at("2026-01-15T12:00:00Z");
    const { dispute } = await disputes.open({ userId: "u2", roomId, seatId: seatIds[0]!, kind: "CLAIM", location: location() });
    const { dispute: resolved } = await disputes.respond(dispute.id, "u1", "LEFT");
    expect(resolved.status).toBe("RESOLVED_ABSENT");

    const rows = await sessionsOf("u1");
    expect(rows).toHaveLength(1);
    expect(rows[0]?.verifiedMinutes).toBe(60);
    expect(await value("today", lost)).toBe(60);
  });

  it("moving seats closes the old stay and keeps counting the new one, without overlap", async () => {
    at("2026-01-15T11:00:00Z");
    await checkIns.checkIn({ userId: "u1", roomId, seatId: seatIds[0]!, location: location(), showIdentity: false });
    at("2026-01-15T12:00:00Z");
    await checkIns.checkIn({ userId: "u1", roomId, seatId: seatIds[1]!, location: location(), showIdentity: false });

    const midway = at("2026-01-15T12:30:00Z");
    expect(await sessionsOf("u1")).toHaveLength(1);
    expect(await value("today", midway)).toBe(90); // 60 closed + 30 live

    const end = at("2026-01-15T13:00:00Z");
    await checkIns.checkOut("u1");
    expect((await sessionsOf("u1")).map((r) => r.verifiedMinutes).sort()).toEqual([60, 60]);
    expect(await value("today", end)).toBe(120);
  });

  it("merges a closed stay and a live one on the same day under the 720 daily cap", async () => {
    at("2026-01-15T10:00:00Z");
    await checkIns.checkIn({ userId: "u1", roomId, seatId: seatIds[0]!, location: location(), showIdentity: false });
    at("2026-01-15T12:00:00Z");
    await checkIns.checkOut("u1"); // 120 closed
    await checkIns.checkIn({ userId: "u1", roomId, seatId: seatIds[0]!, location: location(), showIdentity: false });
    expect(await value("today", new Date("2026-01-15T13:00:00Z"))).toBe(180); // 120 + 60 live

    // Push the live stay far beyond the cap: 120 closed + 660 live = 780 -> capped at 720.
    await db.update(schema.checkIns).set({ expiresAt: new Date("2026-01-16T02:00:00Z") }).where(eq(schema.checkIns.status, "ACTIVE"));
    expect(await value("today", new Date("2026-01-15T23:00:00Z"))).toBe(720);
  });
});
