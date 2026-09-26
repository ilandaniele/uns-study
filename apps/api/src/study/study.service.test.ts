import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@uns/database";
import { schema } from "@uns/database";
import { and, eq } from "drizzle-orm";
import { freshDb, getRoom, getSeats, insertUsers } from "../test-utils.js";
import { PresenceService } from "../presence/presence.service.js";
import { RoomStateService } from "../rooms/room-state.service.js";
import { SecurityEventService } from "../security/security-event.service.js";
import { ReputationService } from "../reputation/reputation.service.js";
import { CheckInService } from "../checkins/checkins.service.js";
import { QrService } from "../qr/qr.service.js";
import { StudySessionService } from "../rankings/study-session.service.js";
import { RestrictionService } from "../users/restriction.service.js";
import { StudyService } from "./study.service.js";

async function build(db: Db) {
  const roomState = new RoomStateService(db);
  const presence = new PresenceService();
  const security = new SecurityEventService(db, new ReputationService(db));
  const checkIns = new CheckInService(db, roomState, presence, security, new StudySessionService(db), new QrService(db));
  const study = new StudyService(db, new RestrictionService(db));
  return { study, checkIns };
}

describe("StudyService", () => {
  let db: Db;
  let study: StudyService;
  let checkIns: CheckInService;
  let roomId: string;
  let seatIds: string[];
  let location: { latitude: number; longitude: number; accuracy: number; capturedAt: string };

  beforeEach(async () => {
    db = await freshDb();
    ({ study, checkIns } = await build(db));
    const room = await getRoom(db);
    roomId = room.id;
    location = { latitude: room.latitude, longitude: room.longitude, accuracy: 10, capturedAt: new Date().toISOString() };
    seatIds = (await getSeats(db)).map((s) => s.id);
    await insertUsers(db, ["u1", "u2"]);
  });

  it("rejects starting Study Mode without an active or recent check-in", async () => {
    await expect(study.start("u1", roomId, { lookingForGroup: false })).rejects.toMatchObject({ code: "PRESENCE_REJECTED" });
  });

  it("starts Study Mode when the caller has an active check-in", async () => {
    await checkIns.checkIn({ userId: "u1", roomId, seatId: seatIds[0]!, location, showIdentity: false });
    const status = await study.start("u1", roomId, { subject: "Física II", lookingForGroup: true });
    expect(status.subject).toBe("Física II");
    expect(status.lookingForGroup).toBe(true);

    const [row] = await db.select().from(schema.studyStatus).where(and(eq(schema.studyStatus.userId, "u1"), eq(schema.studyStatus.roomId, roomId)));
    expect(row?.active).toBe(true);
  });

  it("starts Study Mode when the caller checked in (and out) within the last hour", async () => {
    await checkIns.checkIn({ userId: "u1", roomId, seatId: seatIds[0]!, location, showIdentity: false });
    await checkIns.checkOut("u1");
    await expect(study.start("u1", roomId, { lookingForGroup: false })).resolves.toMatchObject({ lookingForGroup: false });
  });

  it("stop deactivates the caller's active study status", async () => {
    await checkIns.checkIn({ userId: "u1", roomId, seatId: seatIds[0]!, location, showIdentity: false });
    await study.start("u1", roomId, { lookingForGroup: false });
    await study.stop("u1");

    expect(await study.getActiveStatusForUser("u1")).toBeNull();
  });

  it("getActiveStatusForUser returns null when there's no active status", async () => {
    expect(await study.getActiveStatusForUser("u2")).toBeNull();
  });

  it("rejects starting Study Mode when the caller is suspended", async () => {
    await checkIns.checkIn({ userId: "u1", roomId, seatId: seatIds[0]!, location, showIdentity: false });
    await db.insert(schema.userRestrictions).values({ userId: "u1", type: "SUSPENDED", reason: "test" });

    await expect(study.start("u1", roomId, { lookingForGroup: false })).rejects.toMatchObject({ code: "RESTRICTED" });
  });
});
