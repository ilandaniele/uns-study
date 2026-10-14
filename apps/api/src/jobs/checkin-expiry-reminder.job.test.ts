import { beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
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
import { RestrictionService } from "../users/restriction.service.js";
import { PushService } from "../notifications/push.service.js";
import type { Auth } from "../auth/auth.instance.js";
import { CheckInExpiryReminderJob } from "./checkin-expiry-reminder.job.js";

const mockAuth = { api: { getSession: async () => null } } as unknown as Auth;

describe("CheckInExpiryReminderJob", () => {
  let db: Db;
  let checkIns: CheckInService;
  let job: CheckInExpiryReminderJob;
  let emit: MockInstance<RoomRealtimeGateway["emitCheckInExpiring"]>;
  let send: MockInstance<PushService["sendToUser"]>;
  let roomId: string;
  let seatId: string;
  let location: { latitude: number; longitude: number; accuracy: number; capturedAt: string };

  const setExpiry = (ms: number) => db.update(schema.checkIns).set({ expiresAt: new Date(Date.now() + ms) }).where(eq(schema.checkIns.seatId, seatId));

  beforeEach(async () => {
    db = freshDb();
    const roomState = new RoomStateService(db);
    const security = new SecurityEventService(db, new ReputationService(db));
    checkIns = new CheckInService(db, roomState, new PresenceService(), security, new StudySessionService(db), new QrService(db), buildDisputeService(db), new RolesService(db));
    const gateway = new RoomRealtimeGateway(roomState, mockAuth, buildNotificationService(db), new RestrictionService(db));
    const push = new PushService(db);
    emit = vi.spyOn(gateway, "emitCheckInExpiring");
    send = vi.spyOn(push, "sendToUser").mockResolvedValue(null);
    job = new CheckInExpiryReminderJob(db, gateway, push);

    const room = await getRoom(db);
    roomId = room.id;
    location = { latitude: room.latitude, longitude: room.longitude, accuracy: 10, capturedAt: new Date().toISOString() };
    seatId = (await getSeats(db))[0]!.id;
    await insertUsers(db, ["u1"]);
    await checkIns.checkIn({ userId: "u1", roomId, seatId, location, showIdentity: false });
  });

  it("does nothing while more than 10 minutes remain", async () => {
    expect(await job.runSweep()).toBe(0);
    expect(emit).not.toHaveBeenCalled();
  });

  it("claims once: emits and pushes on the first sweep, nothing on the second", async () => {
    await setExpiry(9 * 60_000);
    expect(await job.runSweep()).toBe(1);
    expect(await job.runSweep()).toBe(0);
    expect(emit).toHaveBeenCalledTimes(1);
    expect(emit).toHaveBeenCalledWith("u1", expect.objectContaining({ seatId }));
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0]![1]).toMatchObject({ title: "Tu lugar vence en 10 min", tag: "checkin-expiry", url: expect.stringContaining(`?seat=${seatId}`) });
  });

  it("still emits the socket event but skips push when the preference is off", async () => {
    await db.insert(schema.notificationPreferences).values({ userId: "u1", checkinExpiry: false });
    await setExpiry(9 * 60_000);
    expect(await job.runSweep()).toBe(1);
    expect(emit).toHaveBeenCalledTimes(1);
    expect(send).not.toHaveBeenCalled();
  });

  it("skips expired and ended check-ins", async () => {
    await setExpiry(-1000);
    expect(await job.runSweep()).toBe(0);
    await setExpiry(5 * 60_000);
    await db.update(schema.checkIns).set({ status: "CANCELLED", endedAt: new Date() }).where(eq(schema.checkIns.seatId, seatId));
    expect(await job.runSweep()).toBe(0);
    expect(emit).not.toHaveBeenCalled();
  });

  it("extend resets the flag so the extended check-in is reminded again", async () => {
    await setExpiry(9 * 60_000);
    await job.runSweep();
    await checkIns.extend("u1", location);
    const [row] = await db.select().from(schema.checkIns).where(eq(schema.checkIns.seatId, seatId));
    expect(row!.expiryReminderSentAt).toBeNull();
    await setExpiry(9 * 60_000);
    expect(await job.runSweep()).toBe(1);
  });
});
