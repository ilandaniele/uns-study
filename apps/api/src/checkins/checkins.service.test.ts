import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@uns/database";
import { schema } from "@uns/database";
import { eq } from "drizzle-orm";
import { freshDb, getRoom, getSeats, insertUsers } from "../test-utils.js";
import { PresenceService } from "../presence/presence.service.js";
import { RoomStateService } from "../rooms/room-state.service.js";
import { SecurityEventService } from "../security/security-event.service.js";
import { CheckInService } from "./checkins.service.js";

async function build(db: Db) {
  const roomState = new RoomStateService(db);
  const presence = new PresenceService();
  const security = new SecurityEventService(db);
  return new CheckInService(db, roomState, presence, security);
}

describe("CheckInService", () => {
  let db: Db;
  let svc: CheckInService;
  let roomId: string;
  let seatIds: string[];
  let location: { latitude: number; longitude: number; accuracy: number; capturedAt: string };

  beforeEach(async () => {
    db = await freshDb();
    svc = await build(db);
    const room = await getRoom(db);
    roomId = room.id;
    location = { latitude: room.latitude, longitude: room.longitude, accuracy: 10, capturedAt: new Date().toISOString() };
    const seats = await getSeats(db);
    seatIds = seats.map((s) => s.id);
    await insertUsers(db, ["u1", "u2"]);
  });

  it("creates a check-in and sets the seat to OCCUPIED", async () => {
    const { checkIn } = await svc.checkIn({ userId: "u1", roomId, seatId: seatIds[0]!, location, showIdentity: false });
    expect(checkIn.status).toBe("ACTIVE");

    const [state] = await db.select().from(schema.seatCurrentState).where(eq(schema.seatCurrentState.seatId, seatIds[0]!));
    expect(state?.status).toBe("OCCUPIED");
    expect(state?.confidence).toBeCloseTo(0.98, 5);
  });

  it("moving to a new seat completes the old check-in and recomputes the old seat", async () => {
    await svc.checkIn({ userId: "u1", roomId, seatId: seatIds[0]!, location, showIdentity: false });
    await svc.checkIn({ userId: "u1", roomId, seatId: seatIds[1]!, location, showIdentity: false });

    const rows = await db.select().from(schema.checkIns).where(eq(schema.checkIns.userId, "u1"));
    expect(rows.filter((r) => r.status === "ACTIVE")).toHaveLength(1);
    expect(rows.find((r) => r.status === "COMPLETED")?.seatId).toBe(seatIds[0]);

    const [oldState] = await db.select().from(schema.seatCurrentState).where(eq(schema.seatCurrentState.seatId, seatIds[0]!));
    expect(oldState?.status).toBe("UNKNOWN");
    const [newState] = await db.select().from(schema.seatCurrentState).where(eq(schema.seatCurrentState.seatId, seatIds[1]!));
    expect(newState?.status).toBe("OCCUPIED");
  });

  it("rejects a second user checking into an already-taken seat", async () => {
    await svc.checkIn({ userId: "u1", roomId, seatId: seatIds[0]!, location, showIdentity: false });
    await expect(svc.checkIn({ userId: "u2", roomId, seatId: seatIds[0]!, location, showIdentity: false })).rejects.toMatchObject({
      code: "SEAT_TAKEN",
    });
  });

  it("exactly one of two concurrent check-ins to the same seat wins", async () => {
    await insertUsers(db, ["u3", "u4"]);
    const results = await Promise.allSettled([
      svc.checkIn({ userId: "u3", roomId, seatId: seatIds[2]!, location, showIdentity: false }),
      svc.checkIn({ userId: "u4", roomId, seatId: seatIds[2]!, location, showIdentity: false }),
    ]);
    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
  });

  it("concurrent same-user double check-in to two seats ends with exactly one ACTIVE check-in", async () => {
    await svc.checkIn({ userId: "u1", roomId, seatId: seatIds[0]!, location, showIdentity: false });

    const results = await Promise.allSettled([
      svc.checkIn({ userId: "u1", roomId, seatId: seatIds[1]!, location, showIdentity: false }),
      svc.checkIn({ userId: "u1", roomId, seatId: seatIds[2]!, location, showIdentity: false }),
    ]);
    expect(results.some((r) => r.status === "fulfilled")).toBe(true);

    const rows = await db.select().from(schema.checkIns).where(eq(schema.checkIns.userId, "u1"));
    expect(rows.filter((r) => r.status === "ACTIVE")).toHaveLength(1);
  });

  it("checks out and frees the seat", async () => {
    await svc.checkIn({ userId: "u1", roomId, seatId: seatIds[0]!, location, showIdentity: false });
    const result = await svc.checkOut("u1");
    expect(result).not.toBeNull();

    const [state] = await db.select().from(schema.seatCurrentState).where(eq(schema.seatCurrentState.seatId, seatIds[0]!));
    expect(state?.status).toBe("UNKNOWN");

    const active = await svc.getActiveCheckIn("u1");
    expect(active).toBeNull();
  });

  it("checkOut is a no-op when there is nothing active", async () => {
    expect(await svc.checkOut("u1")).toBeNull();
  });

  it("extends the check-in 60 minutes from now", async () => {
    const { checkIn } = await svc.checkIn({ userId: "u1", roomId, seatId: seatIds[0]!, location, showIdentity: false });
    const before = new Date(checkIn.expiresAt).getTime();
    await new Promise((r) => setTimeout(r, 5));
    const extended = await svc.extend("u1", location);
    expect(new Date(extended.expiresAt).getTime()).toBeGreaterThan(before - 1000);
    expect(new Date(extended.expiresAt).getTime()).toBeGreaterThan(Date.now() + 59 * 60_000);
  });

  it("a check-in expires exactly 60 minutes after creation", async () => {
    const { checkIn } = await svc.checkIn({ userId: "u1", roomId, seatId: seatIds[0]!, location, showIdentity: false });
    const started = new Date(checkIn.startedAt).getTime();
    const expires = new Date(checkIn.expiresAt).getTime();
    expect(expires - started).toBe(60 * 60_000);
  });
});
