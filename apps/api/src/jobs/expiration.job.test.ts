import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@uns/database";
import { schema } from "@uns/database";
import { eq } from "drizzle-orm";
import { freshDb, getRoom, getSeats, insertUsers } from "../test-utils.js";
import { PresenceService } from "../presence/presence.service.js";
import { RoomStateService } from "../rooms/room-state.service.js";
import { SecurityEventService } from "../security/security-event.service.js";
import { CheckInService } from "../checkins/checkins.service.js";
import { RoomRealtimeGateway } from "../realtime/room-realtime.gateway.js";
import { ExpirationJob } from "./expiration.job.js";

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
    const security = new SecurityEventService(db);
    checkIns = new CheckInService(db, roomState, presence, security);
    const gateway = new RoomRealtimeGateway(roomState); // no @WebSocketServer() attached — emits are no-ops in tests
    job = new ExpirationJob(db, roomState, gateway);

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
});
