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
import { DailyResetJob, resetInstantFor } from "./daily-reset.job.js";

describe("DailyResetJob", () => {
  let db: Db;
  let checkIns: CheckInService;
  let job: DailyResetJob;
  let roomId: string;
  let seatId: string;
  let location: { latitude: number; longitude: number; accuracy: number; capturedAt: string };

  beforeEach(async () => {
    db = await freshDb();
    const roomState = new RoomStateService(db);
    const presence = new PresenceService();
    const security = new SecurityEventService(db);
    checkIns = new CheckInService(db, roomState, presence, security);
    const gateway = new RoomRealtimeGateway(roomState);
    job = new DailyResetJob(db, gateway);

    const room = await getRoom(db);
    roomId = room.id;
    location = { latitude: room.latitude, longitude: room.longitude, accuracy: 10, capturedAt: new Date().toISOString() };
    seatId = (await getSeats(db))[0]!.id;
    await insertUsers(db, ["u1"]);
  });

  it("is a no-op before today's reset time", async () => {
    const room = await getRoom(db);
    const todayResetInstant = resetInstantFor(room, new Date());
    const before = new Date(todayResetInstant.getTime() - 60_000); // 1 minute before 04:00 local
    const ran = await job.runReset(roomId, before);
    expect(ran).toBe(false);
  });

  it("expires active check-ins/observations and resets all seats to UNKNOWN after the reset time", async () => {
    await checkIns.checkIn({ userId: "u1", roomId, seatId, location, showIdentity: false });

    const room = await getRoom(db);
    const after = new Date(resetInstantFor(room, new Date()).getTime() + 60_000); // 1 minute after
    const ran = await job.runReset(roomId, after);
    expect(ran).toBe(true);

    const [checkIn] = await db.select().from(schema.checkIns).where(eq(schema.checkIns.seatId, seatId));
    expect(checkIn?.status).toBe("EXPIRED");

    const states = await db.select().from(schema.seatCurrentState);
    expect(states).toHaveLength(108);
    expect(states.every((s) => s.status === "UNKNOWN" && s.confidence === 0)).toBe(true);

    const events = await db.select().from(schema.seatStateEvents);
    expect(events.length).toBeGreaterThan(0); // events are kept, not deleted
  });

  it("a second run the same day is a no-op", async () => {
    const room = await getRoom(db);
    const after = new Date(resetInstantFor(room, new Date()).getTime() + 60_000);
    expect(await job.runReset(roomId, after)).toBe(true);
    expect(await job.runReset(roomId, new Date(after.getTime() + 5 * 60_000))).toBe(false);
  });

  it("two concurrent runs (simulating separate instances) only apply the reset once", async () => {
    await checkIns.checkIn({ userId: "u1", roomId, seatId, location, showIdentity: false });

    const room = await getRoom(db);
    const after = new Date(resetInstantFor(room, new Date()).getTime() + 60_000);
    const results = await Promise.all([job.runReset(roomId, after), job.runReset(roomId, after)]);
    expect(results.filter(Boolean)).toHaveLength(1);

    const events = await db.select().from(schema.seatStateEvents).where(eq(schema.seatStateEvents.eventType, "DAILY_RESET"));
    expect(events).toHaveLength(108); // one batch, not two
  });
});
