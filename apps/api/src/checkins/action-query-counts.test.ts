import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@sala/database";
import { schema } from "@sala/database";
import { eq } from "drizzle-orm";
import { buildDisputeService, buildNotificationService, countQueries, freshDb, getRoom, getSeats, insertUsers } from "../test-utils.js";
import { PresenceService } from "../presence/presence.service.js";
import { RoomStateService } from "../rooms/room-state.service.js";
import { SecurityEventService } from "../security/security-event.service.js";
import { AbusePolicyService } from "../security/abuse-policy.service.js";
import { TurnstileService } from "../security/turnstile.service.js";
import { ReputationService } from "../reputation/reputation.service.js";
import { QrService } from "../qr/qr.service.js";
import { StudySessionService } from "../rankings/study-session.service.js";
import { RolesService } from "../users/roles.service.js";
import { RoomCache } from "../common/cache/room-cache.service.js";
import { flushBackground } from "../common/background.js";
import { ObservationService } from "../observations/observations.service.js";
import { CheckInService } from "./checkins.service.js";

// Database round trips per action (a transaction counts BEGIN + COMMIT), measured on a warm room
// cache. These are regression ceilings: an action getting chattier again should fail here.
describe("action query counts", () => {
  let db: Db;
  let checkIns: CheckInService;
  let observations: ObservationService;
  let roomId: string;
  let seatIds: string[];
  let location: { latitude: number; longitude: number; accuracy: number; capturedAt: string };

  beforeEach(async () => {
    db = await freshDb();
    const roomState = new RoomStateService(db);
    const presence = new PresenceService();
    const reputation = new ReputationService(db);
    const security = new SecurityEventService(db, reputation);
    const abusePolicy = new AbusePolicyService(db, new TurnstileService());
    const qr = new QrService(db);
    const roomCache = new RoomCache();
    checkIns = new CheckInService(db, roomState, presence, security, new StudySessionService(db), qr, buildDisputeService(db), new RolesService(db), roomCache);
    observations = new ObservationService(db, roomState, presence, security, abusePolicy, qr, reputation, buildNotificationService(db), roomCache);
    const room = await getRoom(db);
    roomId = room.id;
    location = { latitude: room.latitude, longitude: room.longitude, accuracy: 10, capturedAt: new Date().toISOString() };
    seatIds = (await getSeats(db)).map((s) => s.id);
    await insertUsers(db, ["u1", "u2"]);
    // Warm the room cache (the first request after boot pays for it once).
    await checkIns.checkIn({ userId: "u2", roomId, seatId: seatIds[5]!, location, showIdentity: false });
    await flushBackground();
  });

  it("counts round trips per action", async () => {
    const counts: Record<string, number> = {};

    const inMeasure = await countQueries(() => checkIns.checkIn({ userId: "u1", roomId, seatId: seatIds[0]!, location, showIdentity: false }));
    await flushBackground();
    counts.checkIn = inMeasure.queries;

    const active = await checkIns.getActiveCheckIn("u1");
    const extendMeasure = await countQueries(() => checkIns.extend("u1", location, active!));
    counts.extend = extendMeasure.queries;

    const observeMeasure = await countQueries(() => observations.observe({ userId: "u2", roomId, seatId: seatIds[1]!, status: "FREE", location }));
    counts.observe = observeMeasure.queries;

    const outMeasure = await countQueries(() => checkIns.checkOut("u1"));
    counts.checkOut = outMeasure.queries;

    console.info("round trips", JSON.stringify(counts));
    expect(counts.checkIn).toBeLessThanOrEqual(14);
    expect(counts.extend).toBeLessThanOrEqual(1);
    expect(counts.observe).toBeLessThanOrEqual(16); // +1: per-user advisory lock guarding the spread-cap check
    expect(counts.checkOut).toBeLessThanOrEqual(12);
  });

  it("records SEAT_TOGGLE_RAPID off the response path (visible once background work settles)", async () => {
    for (let i = 0; i < 4; i++) {
      await checkIns.checkIn({ userId: "u1", roomId, seatId: seatIds[i]!, location, showIdentity: false });
    }
    await flushBackground();
    const events = await db.select().from(schema.securityEvents).where(eq(schema.securityEvents.eventType, "SEAT_TOGGLE_RAPID"));
    expect(events.length).toBeGreaterThan(0);
  });
});
