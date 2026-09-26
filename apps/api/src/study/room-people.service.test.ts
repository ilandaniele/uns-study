import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@uns/database";
import { schema } from "@uns/database";
import { freshDb, getRoom, getSeats, insertUsers } from "../test-utils.js";
import { PresenceService } from "../presence/presence.service.js";
import { RoomStateService } from "../rooms/room-state.service.js";
import { SecurityEventService } from "../security/security-event.service.js";
import { ReputationService } from "../reputation/reputation.service.js";
import { CheckInService } from "../checkins/checkins.service.js";
import { QrService } from "../qr/qr.service.js";
import { StudySessionService } from "../rankings/study-session.service.js";
import { StudyService } from "./study.service.js";
import { RoomPeopleService } from "./room-people.service.js";

async function build(db: Db) {
  const roomState = new RoomStateService(db);
  const presence = new PresenceService();
  const security = new SecurityEventService(db, new ReputationService(db));
  const checkIns = new CheckInService(db, roomState, presence, security, new StudySessionService(db), new QrService(db));
  const study = new StudyService(db);
  const people = new RoomPeopleService(db);
  return { checkIns, study, people };
}

describe("RoomPeopleService", () => {
  let db: Db;
  let checkIns: CheckInService;
  let study: StudyService;
  let people: RoomPeopleService;
  let roomId: string;
  let seatIds: string[];
  let location: { latitude: number; longitude: number; accuracy: number; capturedAt: string };

  beforeEach(async () => {
    db = await freshDb();
    ({ checkIns, study, people } = await build(db));
    const room = await getRoom(db);
    roomId = room.id;
    location = { latitude: room.latitude, longitude: room.longitude, accuracy: 10, capturedAt: new Date().toISOString() };
    seatIds = (await getSeats(db)).map((s) => s.id);
    await insertUsers(db, ["u1", "u2", "u3", "viewer"]);
  });

  async function setPrivacy(userId: string, patch: Partial<typeof schema.userPrivacySettings.$inferInsert>) {
    await db.insert(schema.userPrivacySettings).values({ userId, ...patch }).onConflictDoUpdate({
      target: schema.userPrivacySettings.userId,
      set: patch,
    });
  }

  async function setProfile(userId: string, patch: Partial<typeof schema.userProfiles.$inferInsert>) {
    await db.insert(schema.userProfiles).values({ userId, ...patch }).onConflictDoUpdate({
      target: schema.userProfiles.userId,
      set: patch,
    });
  }

  it("excludes users without show_in_room even if checked in", async () => {
    await checkIns.checkIn({ userId: "u1", roomId, seatId: seatIds[0]!, location, showIdentity: true });
    await setPrivacy("u1", { showInRoom: false, showSeat: true });

    const list = await people.listPeople(roomId, "viewer");
    expect(list.find((p) => p.userId === "u1")).toBeUndefined();
  });

  it("includes a checked-in user with show_in_room, without seatCode unless show_identity && show_seat", async () => {
    await checkIns.checkIn({ userId: "u1", roomId, seatId: seatIds[0]!, location, showIdentity: false });
    await setPrivacy("u1", { showInRoom: true, showSeat: true });

    let list = await people.listPeople(roomId, "viewer");
    expect(list.find((p) => p.userId === "u1")?.seatCode).toBeNull();

    await checkIns.checkIn({ userId: "u1", roomId, seatId: seatIds[0]!, location, showIdentity: true });
    list = await people.listPeople(roomId, "viewer");
    expect(list.find((p) => p.userId === "u1")?.seatCode).not.toBeNull();
  });

  it("includes a user with only an active study status (no check-in)", async () => {
    await checkIns.checkIn({ userId: "u2", roomId, seatId: seatIds[1]!, location, showIdentity: false });
    await study.start("u2", roomId, { subject: "Química", lookingForGroup: true });
    await checkIns.checkOut("u2");
    await setPrivacy("u2", { showInRoom: true });

    const list = await people.listPeople(roomId, "viewer");
    const entry = list.find((p) => p.userId === "u2");
    expect(entry).toBeDefined();
    expect(entry?.studyStatus?.subject).toBe("Química");
  });

  it("excludes a user the viewer blocked", async () => {
    await checkIns.checkIn({ userId: "u1", roomId, seatId: seatIds[0]!, location, showIdentity: false });
    await setPrivacy("u1", { showInRoom: true });
    await db.insert(schema.userBlocks).values({ blockerId: "viewer", blockedId: "u1" });

    const list = await people.listPeople(roomId, "viewer");
    expect(list.find((p) => p.userId === "u1")).toBeUndefined();
  });

  it("excludes a user who blocked the viewer", async () => {
    await checkIns.checkIn({ userId: "u1", roomId, seatId: seatIds[0]!, location, showIdentity: false });
    await setPrivacy("u1", { showInRoom: true });
    await db.insert(schema.userBlocks).values({ blockerId: "u1", blockedId: "viewer" });

    const list = await people.listPeople(roomId, "viewer");
    expect(list.find((p) => p.userId === "u1")).toBeUndefined();
  });

  it("uses the display name computed from identity mode, falling back to anonymous", async () => {
    await checkIns.checkIn({ userId: "u3", roomId, seatId: seatIds[2]!, location, showIdentity: false });
    await setPrivacy("u3", { showInRoom: true });
    await setProfile("u3", { firstName: "María", identityMode: "FIRST_NAME" });

    const list = await people.listPeople(roomId, "viewer");
    expect(list.find((p) => p.userId === "u3")?.displayName).toBe("María");
  });

  describe("listOccupants", () => {
    it("includes only active check-ins with show_identity && show_seat", async () => {
      await checkIns.checkIn({ userId: "u1", roomId, seatId: seatIds[0]!, location, showIdentity: true });
      await setPrivacy("u1", { showSeat: true });
      await checkIns.checkIn({ userId: "u2", roomId, seatId: seatIds[1]!, location, showIdentity: true });
      await setPrivacy("u2", { showSeat: false });
      await checkIns.checkIn({ userId: "u3", roomId, seatId: seatIds[2]!, location, showIdentity: false });
      await setPrivacy("u3", { showSeat: true });

      const occupants = await people.listOccupants(roomId);
      expect(occupants.map((o) => o.userId)).toEqual(["u1"]);
      expect(occupants[0]?.seatId).toBe(seatIds[0]);
    });
  });
});
