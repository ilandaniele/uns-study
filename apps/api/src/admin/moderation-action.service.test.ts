import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Db } from "@uns/database";
import { schema } from "@uns/database";
import { eq } from "drizzle-orm";
import { freshDb, getRoom, getSeats, insertUsers } from "../test-utils.js";
import { PresenceService } from "../presence/presence.service.js";
import { RoomStateService } from "../rooms/room-state.service.js";
import { SecurityEventService } from "../security/security-event.service.js";
import { ReputationService } from "../reputation/reputation.service.js";
import { StudySessionService } from "../rankings/study-session.service.js";
import { QrService } from "../qr/qr.service.js";
import { CheckInService } from "../checkins/checkins.service.js";
import type { RoomRealtimeGateway } from "../realtime/room-realtime.gateway.js";
import { ModerationActionService } from "./moderation-action.service.js";

function fakeGateway(): RoomRealtimeGateway {
  return { broadcastSeatChanges: vi.fn(async () => undefined), disconnectUser: vi.fn() } as unknown as RoomRealtimeGateway;
}

describe("ModerationActionService", () => {
  let db: Db;
  let checkIns: CheckInService;
  let svc: ModerationActionService;
  let gateway: RoomRealtimeGateway;
  let roomId: string;
  let seatIds: string[];
  let location: { latitude: number; longitude: number; accuracy: number; capturedAt: string };

  beforeEach(async () => {
    db = await freshDb();
    checkIns = new CheckInService(
      db,
      new RoomStateService(db),
      new PresenceService(),
      new SecurityEventService(db, new ReputationService(db)),
      new StudySessionService(db),
      new QrService(db),
    );
    gateway = fakeGateway();
    svc = new ModerationActionService(db, checkIns, gateway);

    const room = await getRoom(db);
    roomId = room.id;
    location = { latitude: room.latitude, longitude: room.longitude, accuracy: 10, capturedAt: new Date().toISOString() };
    const seats = await getSeats(db);
    seatIds = seats.map((s) => s.id);
    await insertUsers(db, ["actor", "target"]);
  });

  it("writes a user_restrictions row and a moderation_actions audit entry", async () => {
    await svc.apply({ actorId: "actor", targetUserId: "target", type: "MUTE_CHAT", reason: "spam" });

    const [restriction] = await db.select().from(schema.userRestrictions).where(eq(schema.userRestrictions.userId, "target"));
    expect(restriction?.type).toBe("MUTE_CHAT");
    expect(restriction?.reason).toBe("spam");

    const [audit] = await db.select().from(schema.moderationActions).where(eq(schema.moderationActions.targetUserId, "target"));
    expect(audit?.action).toBe("MUTE_CHAT");
    expect(audit?.actorId).toBe("actor");
  });

  it("LIFT clears all active restrictions for the user", async () => {
    await svc.apply({ actorId: "actor", targetUserId: "target", type: "MUTE_CHAT", reason: "spam" });
    await svc.apply({ actorId: "actor", targetUserId: "target", type: "RESTRICT_OBSERVATIONS", reason: "spam" });

    await svc.apply({ actorId: "actor", targetUserId: "target", type: "LIFT", reason: "resolved" });

    const rows = await db.select().from(schema.userRestrictions).where(eq(schema.userRestrictions.userId, "target"));
    expect(rows.every((r) => r.liftedAt !== null)).toBe(true);

    const [audit] = await db
      .select()
      .from(schema.moderationActions)
      .where(eq(schema.moderationActions.action, "LIFT"));
    expect(audit?.targetUserId).toBe("target");
  });

  it("SUSPEND revokes sessions and checks out an active check-in", async () => {
    await db.insert(schema.session).values({ id: "s1", token: "t1", userId: "target", expiresAt: new Date(Date.now() + 3600_000) });
    await checkIns.checkIn({ userId: "target", roomId, seatId: seatIds[0]!, location, showIdentity: false });

    await svc.apply({ actorId: "actor", targetUserId: "target", type: "SUSPEND", reason: "abuse" });

    const sessions = await db.select().from(schema.session).where(eq(schema.session.userId, "target"));
    expect(sessions).toHaveLength(0);

    const active = await checkIns.getActiveCheckIn("target");
    expect(active).toBeNull();
    expect(gateway.broadcastSeatChanges).toHaveBeenCalled();
    expect(gateway.disconnectUser).toHaveBeenCalledWith("target");

    const [restriction] = await db
      .select()
      .from(schema.userRestrictions)
      .where(eq(schema.userRestrictions.userId, "target"));
    expect(restriction?.type).toBe("SUSPENDED");
  });

  it("BAN also revokes sessions and checks out", async () => {
    await db.insert(schema.session).values({ id: "s2", token: "t2", userId: "target", expiresAt: new Date(Date.now() + 3600_000) });
    await checkIns.checkIn({ userId: "target", roomId, seatId: seatIds[0]!, location, showIdentity: false });

    await svc.apply({ actorId: "actor", targetUserId: "target", type: "BAN", reason: "abuse" });

    const sessions = await db.select().from(schema.session).where(eq(schema.session.userId, "target"));
    expect(sessions).toHaveLength(0);
    await expect(checkIns.getActiveCheckIn("target")).resolves.toBeNull();
  });

  it("WARN writes only an audit entry, no restriction", async () => {
    await svc.apply({ actorId: "actor", targetUserId: "target", type: "WARN", reason: "heads up" });
    const restrictions = await db.select().from(schema.userRestrictions).where(eq(schema.userRestrictions.userId, "target"));
    expect(restrictions).toHaveLength(0);
    const [audit] = await db.select().from(schema.moderationActions).where(eq(schema.moderationActions.action, "WARN"));
    expect(audit).toBeDefined();
  });
});
