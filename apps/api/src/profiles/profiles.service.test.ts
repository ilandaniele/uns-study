import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@sala/database";
import { schema } from "@sala/database";
import { eq } from "drizzle-orm";
import { buildDisputeService, freshDb, getRoom, getSeats, insertUsers } from "../test-utils.js";
import { PresenceService } from "../presence/presence.service.js";
import { RoomStateService } from "../rooms/room-state.service.js";
import { SecurityEventService } from "../security/security-event.service.js";
import { ReputationService } from "../reputation/reputation.service.js";
import { CheckInService } from "../checkins/checkins.service.js";
import { QrService } from "../qr/qr.service.js";
import { StudySessionService } from "../rankings/study-session.service.js";
import { StudyService } from "../study/study.service.js";
import { RestrictionService } from "../users/restriction.service.js";
import { AliasService } from "../users/alias.service.js";
import { RolesService } from "../users/roles.service.js";
import { ProfilesService } from "./profiles.service.js";

async function build(db: Db) {
  const roomState = new RoomStateService(db);
  const presence = new PresenceService();
  const security = new SecurityEventService(db, new ReputationService(db));
  const checkIns = new CheckInService(db, roomState, presence, security, new StudySessionService(db), new QrService(db), buildDisputeService(db), new RolesService(db));
  const study = new StudyService(db, new RestrictionService(db));
  const aliases = new AliasService(db);
  const profiles = new ProfilesService(db, study, aliases, new RestrictionService(db), new RolesService(db));
  return { profiles, checkIns, study };
}

describe("ProfilesService", () => {
  let db: Db;
  let profiles: ProfilesService;
  let checkIns: CheckInService;
  let study: StudyService;
  let roomId: string;
  let seatIds: string[];
  let location: { latitude: number; longitude: number; accuracy: number; capturedAt: string };

  beforeEach(async () => {
    db = freshDb();
    ({ profiles, checkIns, study } = await build(db));
    const room = await getRoom(db);
    roomId = room.id;
    location = { latitude: room.latitude, longitude: room.longitude, accuracy: 10, capturedAt: new Date().toISOString() };
    seatIds = (await getSeats(db)).map((s) => s.id);
    await insertUsers(db, ["u1", "u2", "viewer"]);
  });

  describe("getMyProfile / getMyPrivacy", () => {
    it("auto-creates rows on first read, defaulting to hidden/private, with a fun alias assigned", async () => {
      const profile = await profiles.getMyProfile("u1", "u1@example.test");
      expect(profile.identityMode).toBe("HIDDEN");
      expect(profile.firstName).toBeNull();
      expect(profile.alias).toMatch(/^\S+ \S+$/); // "Noun Adjective"

      const privacy = await profiles.getMyPrivacy("u1");
      expect(privacy.allowDirectMessages).toBe(true);
    });
  });

  describe("updateMyProfile / updateMyPrivacy", () => {
    it("persists a patch", async () => {
      const updated = await profiles.updateMyProfile("u1", "u1@example.test", { firstName: "Ana", identityMode: "FIRST_NAME" });
      expect(updated.firstName).toBe("Ana");
      expect(updated.identityMode).toBe("FIRST_NAME");

      const privacy = await profiles.updateMyPrivacy("u1", { showAvatar: true });
      expect(privacy.showAvatar).toBe(true);
    });

    it("keeps the same alias across every identity mode switch", async () => {
      const hidden = await profiles.getMyProfile("u1", "u1@example.test");
      expect(hidden.alias).not.toBeNull();

      const patches = [
        { firstName: "Ana", lastName: "Pérez", identityMode: "FULL_NAME" as const },
        { identityMode: "FIRST_NAME" as const },
        { nickname: "Anita", identityMode: "NICKNAME" as const },
        { identityMode: "HIDDEN" as const },
      ];
      for (const patch of patches) {
        const after = await profiles.updateMyProfile("u1", "u1@example.test", patch);
        expect(after.alias).toBe(hidden.alias);
      }
      const [row] = await db.select().from(schema.userProfiles).where(eq(schema.userProfiles.userId, "u1"));
      expect(row?.alias).toBe(hidden.alias);
    });

    it("reports isAdmin from the user's roles", async () => {
      expect((await profiles.getMyProfile("u1", "u1@example.test")).isAdmin).toBe(false);
      await db.insert(schema.userRoles).values({ userId: "u1", role: "ADMIN" });
      expect((await profiles.getMyProfile("u1", "u1@example.test")).isAdmin).toBe(true);
    });
  });

  describe("getPublicProfile", () => {
    it("hides fields the owner did not make visible (default private)", async () => {
      await profiles.updateMyProfile("u1", "u1@example.test", {
        firstName: "Ana",
        identityMode: "FIRST_NAME",
        career: "Ingeniería",
        bio: "Me gusta estudiar de noche.",
      });

      const pub = await profiles.getPublicProfile("viewer", "u1");
      expect(pub.displayName).toBe("Ana");
      expect(pub.career).toBeNull(); // showCareer defaults to false
      expect(pub.avatarUrl).toBeNull(); // showAvatar defaults to false
      expect(pub.blockedByMe).toBe(false);
    });

    it("exposes fields once the owner opts in via privacy settings", async () => {
      await profiles.updateMyProfile("u1", "u1@example.test", { firstName: "Ana", identityMode: "FIRST_NAME", career: "Ingeniería" });
      await profiles.updateMyPrivacy("u1", { showCareer: true });

      const pub = await profiles.getPublicProfile("viewer", "u1");
      expect(pub.career).toBe("Ingeniería");
    });

    it("treats a visible mode with empty name fields as alias: leaks nothing", async () => {
      await profiles.updateMyProfile("u1", "u1@example.test", { identityMode: "FIRST_NAME", bio: "secreto", career: "Ingeniería", instagram: "ana.estudia", studentNumber: "12345" });
      await profiles.updateMyPrivacy("u1", { showAvatar: true, showCareer: true, showInstagram: true, showStudentNumber: true });
      await db.update(schema.userProfiles).set({ avatarUrl: "/api/v1/avatars/u1?v=abc" }).where(eq(schema.userProfiles.userId, "u1"));

      const pub = await profiles.getPublicProfile("viewer", "u1");
      expect(pub.avatarUrl).toBeNull();
      expect(pub.bio).toBeNull();
      expect(pub.career).toBeNull();
      expect(pub.instagram).toBeNull();
      expect(pub.studentNumber).toBeNull();
      expect(pub.studyStatus).toBeNull();
    });

    it("never leaks avatar/career/subject/instagram/student number for a HIDDEN identity, even with every privacy flag on", async () => {
      await profiles.updateMyProfile("u1", "u1@example.test", {
        identityMode: "HIDDEN",
        career: "Ingeniería",
        currentSubject: "Análisis",
        instagram: "ana.estudia",
        studentNumber: "12345",
      });
      await profiles.updateMyPrivacy("u1", {
        showAvatar: true,
        showCareer: true,
        showCurrentSubject: true,
        showInstagram: true,
        showStudentNumber: true,
      });
      await db.update(schema.userProfiles).set({ avatarUrl: "/api/v1/avatars/u1?v=abc" }).where(eq(schema.userProfiles.userId, "u1"));

      const pub = await profiles.getPublicProfile("viewer", "u1");
      expect(pub.avatarUrl).toBeNull();
      expect(pub.career).toBeNull();
      expect(pub.currentSubject).toBeNull();
      expect(pub.instagram).toBeNull();
      expect(pub.studentNumber).toBeNull();

      await profiles.updateMyProfile("u1", "u1@example.test", { firstName: "Ana", identityMode: "FIRST_NAME" });
      const visible = await profiles.getPublicProfile("viewer", "u1");
      expect(visible.career).toBe("Ingeniería");
      expect(visible.instagram).toBe("ana.estudia");
      expect(visible.avatarUrl).toBe("/api/v1/avatars/u1?v=abc");
    });

    it("rejects profile updates from SUSPENDED and BANNED users", async () => {
      await db.insert(schema.userRestrictions).values({ userId: "u1", type: "BANNED", reason: "t" });
      await expect(profiles.updateMyProfile("u1", "u1@example.test", { nickname: "x" })).rejects.toMatchObject({ code: "RESTRICTED" });
      await db.insert(schema.userRestrictions).values({ userId: "u2", type: "SUSPENDED", reason: "t" });
      await expect(profiles.updateMyProfile("u2", "u2@example.test", { nickname: "x" })).rejects.toMatchObject({ code: "RESTRICTED" });
    });

    it("returns 404 NOT_FOUND when the target blocked the viewer", async () => {
      await db.insert(schema.userBlocks).values({ blockerId: "u1", blockedId: "viewer" });
      await expect(profiles.getPublicProfile("viewer", "u1")).rejects.toMatchObject({ code: "NOT_FOUND" });
    });

    it("reports blockedByMe when the viewer blocked the target", async () => {
      await db.insert(schema.userBlocks).values({ blockerId: "viewer", blockedId: "u1" });
      const pub = await profiles.getPublicProfile("viewer", "u1");
      expect(pub.blockedByMe).toBe(true);
    });

    it("shows the alias instead of 'Usuario anónimo' for a HIDDEN user", async () => {
      await profiles.getMyProfile("u1", "u1@example.test"); // lazily creates the HIDDEN profile + alias
      const pub = await profiles.getPublicProfile("viewer", "u1");
      expect(pub.displayName).not.toBe("Usuario anónimo");
    });

    it("hides studyStatus while the owner has a hidden identity mode", async () => {
      await checkIns.checkIn({ userId: "u1", roomId, seatId: seatIds[0]!, location, showIdentity: false });
      await study.start("u1", roomId, { subject: "Química", lookingForGroup: false });
      const pub = await profiles.getPublicProfile("viewer", "u1");
      expect(pub.studyStatus).toBeNull();
    });

    it("shows studyStatus for an owner with a visible identity mode", async () => {
      await profiles.updateMyProfile("u1", "u1@example.test", { nickname: "Ilancho", identityMode: "NICKNAME" });
      await checkIns.checkIn({ userId: "u1", roomId, seatId: seatIds[0]!, location, showIdentity: true });
      await study.start("u1", roomId, { subject: "Química", lookingForGroup: false });
      const pub = await profiles.getPublicProfile("viewer", "u1");
      expect(pub.studyStatus?.subject).toBe("Química");
    });
  });

  describe("updateCheckInIdentity", () => {
    it("toggles show_identity on the caller's active check-in", async () => {
      await checkIns.checkIn({ userId: "u1", roomId, seatId: seatIds[0]!, location, showIdentity: false });
      const updated = await profiles.updateCheckInIdentity("u1", true);
      expect(updated.showIdentity).toBe(true);

      const [row] = await db.select().from(schema.checkIns).where(eq(schema.checkIns.userId, "u1"));
      expect(row?.showIdentity).toBe(true);
    });

    it("throws NO_ACTIVE_CHECKIN when the caller has no active check-in", async () => {
      await expect(profiles.updateCheckInIdentity("u1", true)).rejects.toMatchObject({ code: "NO_ACTIVE_CHECKIN" });
    });
  });

  describe("deleteAccount", () => {
    it("checks out first, then removes the user row and cascades", async () => {
      await checkIns.checkIn({ userId: "u1", roomId, seatId: seatIds[0]!, location, showIdentity: true });
      await profiles.updateMyProfile("u1", "u1@example.test", { firstName: "Ana" });

      const checkoutResult = await checkIns.checkOut("u1");
      expect(checkoutResult).not.toBeNull();

      await profiles.deleteAccount("u1");

      const [userRow] = await db.select().from(schema.user).where(eq(schema.user.id, "u1"));
      expect(userRow).toBeUndefined();

      const [profileRow] = await db.select().from(schema.userProfiles).where(eq(schema.userProfiles.userId, "u1"));
      expect(profileRow).toBeUndefined();

      const checkInRows = await db.select().from(schema.checkIns).where(eq(schema.checkIns.userId, "u1"));
      expect(checkInRows).toHaveLength(0); // cascaded (was already COMPLETED from the checkout above)

      const [action] = await db.select().from(schema.moderationActions).where(eq(schema.moderationActions.action, "ACCOUNT_DELETED"));
      expect(action).toBeDefined();
      expect(action?.actorId).toBeNull(); // FK set-null once the user row is gone — no PII survives
      expect(action?.targetUserId).toBeNull();
    });

    it("cascades chat messages authored by the deleted user", async () => {
      const [chatRoom] = await db.select().from(schema.chatRooms); // seeded by seedInitialRoom
      await db.insert(schema.chatMessages).values({ chatRoomId: chatRoom!.id, userId: "u1", content: "hola" });

      await profiles.deleteAccount("u1");

      const messages = await db.select().from(schema.chatMessages).where(eq(schema.chatMessages.userId, "u1"));
      expect(messages).toHaveLength(0);
    });
  });
});
