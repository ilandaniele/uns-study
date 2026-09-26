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
import { CheckInService } from "../checkins/checkins.service.js";
import { ObservationService } from "./observations.service.js";

async function build(db: Db) {
  const roomState = new RoomStateService(db);
  const presence = new PresenceService();
  const security = new SecurityEventService(db);
  const abusePolicy = new AbusePolicyService(db, new TurnstileService());
  const checkIns = new CheckInService(db, roomState, presence, security);
  const observations = new ObservationService(db, roomState, presence, security, abusePolicy);
  return { observations, checkIns };
}

describe("ObservationService", () => {
  let db: Db;
  let observations: ObservationService;
  let checkIns: CheckInService;
  let roomId: string;
  let seatIds: string[];
  let location: { latitude: number; longitude: number; accuracy: number; capturedAt: string };

  beforeEach(async () => {
    db = await freshDb();
    ({ observations, checkIns } = await build(db));
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

  it("conflicting observations from different users produce UNCERTAIN", async () => {
    await observations.observe({ userId: "u1", roomId, seatId: seatIds[0]!, status: "OCCUPIED", location });
    await observations.observe({ userId: "u2", roomId, seatId: seatIds[0]!, status: "FREE", location });

    const [state] = await db.select().from(schema.seatCurrentState).where(eq(schema.seatCurrentState.seatId, seatIds[0]!));
    expect(state?.status).toBe("UNCERTAIN");
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

  it("an active check-in outranks a FREE observation from someone else", async () => {
    await checkIns.checkIn({ userId: "u1", roomId, seatId: seatIds[0]!, location, showIdentity: false });
    await observations.observe({ userId: "u2", roomId, seatId: seatIds[0]!, status: "FREE", location });

    const [state] = await db.select().from(schema.seatCurrentState).where(eq(schema.seatCurrentState.seatId, seatIds[0]!));
    expect(state?.status).toBe("OCCUPIED");
    expect(state?.sourceSummary).toBe("CHECK_IN");
  });

  it("rejects an observation on the seat where the caller has their own active check-in", async () => {
    await checkIns.checkIn({ userId: "u1", roomId, seatId: seatIds[0]!, location, showIdentity: false });
    await expect(observations.observe({ userId: "u1", roomId, seatId: seatIds[0]!, status: "FREE", location })).rejects.toMatchObject({
      code: "OWN_SEAT_OBSERVATION",
    });
  });
});
