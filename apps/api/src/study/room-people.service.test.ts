import { beforeEach, describe, expect, it } from "vitest";
import { animalIdFromAlias, isAnimalId, type SeatMarkedByDto, type SeatOccupantDto } from "@sala/contracts";
import type { Db } from "@sala/database";
import { schema } from "@sala/database";
import { buildDisputeService, freshDb, getRoom, getSeats, insertUsers } from "../test-utils.js";
import { PresenceService } from "../presence/presence.service.js";
import { RoomStateService } from "../rooms/room-state.service.js";
import { SecurityEventService } from "../security/security-event.service.js";
import { ReputationService } from "../reputation/reputation.service.js";
import { CheckInService } from "../checkins/checkins.service.js";
import { QrService } from "../qr/qr.service.js";
import { StudySessionService } from "../rankings/study-session.service.js";
import { RestrictionService } from "../users/restriction.service.js";
import { AliasService } from "../users/alias.service.js";
import { RolesService } from "../users/roles.service.js";
import { ProService } from "../subscriptions/pro.js";
import { UserCosmeticsService } from "../cosmetics/cosmetics.service.js";
import { FixedClock } from "../platform/clock.js";
import { StudyService } from "./study.service.js";
import { RoomPeopleService } from "./room-people.service.js";

async function build(db: Db) {
  const roomState = new RoomStateService(db);
  const presence = new PresenceService();
  const security = new SecurityEventService(db, new ReputationService(db));
  const checkIns = new CheckInService(db, roomState, presence, security, new StudySessionService(db), new QrService(db), buildDisputeService(db), new RolesService(db));
  const study = new StudyService(db, new RestrictionService(db));
  const people = new RoomPeopleService(db, new AliasService(db), new RolesService(db));
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
    db = freshDb();
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

  it("does not list expired ACTIVE check-ins as people or seat occupants before a sweep", async () => {
    await setProfile("u1", { firstName: "Test", identityMode: "FIRST_NAME" });
    await db.insert(schema.checkIns).values({ userId: "u1", roomId, seatId: seatIds[0]!, status: "ACTIVE", expiresAt: new Date(Date.now() - 1) });
    expect(await people.listPeople(roomId, "viewer")).toEqual([]);
    expect(await people.listOccupants(roomId)).toEqual([]);
  });

  it("lists a hidden-mode checked-in user only as their alias animal (no userId, no profile fields)", async () => {
    await checkIns.checkIn({ userId: "u1", roomId, seatId: seatIds[0]!, location, showIdentity: true });
    await setPrivacy("u1", { showCareer: true });
    await setProfile("u1", { firstName: "Zzyzx", identityMode: "HIDDEN", career: "Ingeniería" });

    const list = await people.listPeople(roomId, "viewer");
    expect(list).toHaveLength(1);
    const [entry] = list;
    expect(entry?.userId).toBeNull();
    expect(entry?.aliasAnimal).toBeDefined();
    expect(isAnimalId(entry?.aliasAnimal ?? "")).toBe(true);
    expect(animalIdFromAlias(entry?.displayName)).toBe(entry?.aliasAnimal);
    expect(entry).toMatchObject({ avatarUrl: null, career: null, studyStatus: null });
    expect(entry?.seatCode).not.toBeNull();
    expect(JSON.stringify(entry)).not.toContain("u1");
    expect(JSON.stringify(entry)).not.toContain("Zzyzx");
  });

  it("shows a visible-mode user by name even when the legacy show_in_room/show_seat columns are off", async () => {
    await checkIns.checkIn({ userId: "u1", roomId, seatId: seatIds[0]!, location, showIdentity: true });
    await setPrivacy("u1", { showInRoom: false, showSeat: false }); // legacy columns: must not matter
    await setProfile("u1", { nickname: "Ilancho", identityMode: "NICKNAME" });

    const [entry] = await people.listPeople(roomId, "viewer");
    expect(entry).toMatchObject({ userId: "u1", displayName: "Ilancho" });
    expect(entry?.seatCode).not.toBeNull();
    const [occupant] = (await people.listOccupants(roomId)) as SeatOccupantDto[];
    expect(occupant).toMatchObject({ userId: "u1", displayName: "Ilancho" });
  });

  it("shows a visible-mode user by name even when the check-in carries show_identity=false (the profile decides)", async () => {
    await checkIns.checkIn({ userId: "u1", roomId, seatId: seatIds[0]!, location, showIdentity: false });
    await setProfile("u1", { nickname: "Ilancho", identityMode: "NICKNAME" });

    const [entry] = await people.listPeople(roomId, "viewer");
    expect(entry).toMatchObject({ userId: "u1", displayName: "Ilancho", adminBadge: false });
    expect(entry?.aliasAnimal).toBeUndefined();
  });

  it("puts the admin badge on a visible admin unless they turned it off, never on a hidden admin", async () => {
    await db.insert(schema.userRoles).values({ userId: "u1", role: "ADMIN" });
    await checkIns.checkIn({ userId: "u1", roomId, seatId: seatIds[0]!, location, showIdentity: true });
    await setProfile("u1", { firstName: "Ana", identityMode: "FIRST_NAME" });

    expect((await people.listPeople(roomId, "viewer"))[0]?.adminBadge).toBe(true);
    expect(((await people.listOccupants(roomId)) as SeatOccupantDto[])[0]?.adminBadge).toBe(true);

    await setPrivacy("u1", { showAdminBadge: false });
    expect((await people.listPeople(roomId, "viewer"))[0]?.adminBadge).toBe(false);

    await setPrivacy("u1", { showAdminBadge: true });
    await setProfile("u1", { identityMode: "HIDDEN" });
    const [hidden] = await people.listPeople(roomId, "viewer");
    expect(hidden?.userId).toBeNull();
    expect(hidden?.adminBadge).toBeFalsy();
  });

  it("omits the hidden user entirely when the alias animal is off the map", async () => {
    await checkIns.checkIn({ userId: "u1", roomId, seatId: seatIds[0]!, location, showIdentity: false });
    await setPrivacy("u1", { showAliasAnimalOnMap: false });
    await setProfile("u1", { identityMode: "HIDDEN" });

    expect(await people.listPeople(roomId, "viewer")).toEqual([]);
  });

  it("does not list a hidden user who only has a study status (no check-in)", async () => {
    await checkIns.checkIn({ userId: "u2", roomId, seatId: seatIds[1]!, location, showIdentity: false });
    await study.start("u2", roomId, { subject: "Química", lookingForGroup: false });
    await checkIns.checkOut("u2");
    await setProfile("u2", { identityMode: "HIDDEN" });

    expect(await people.listPeople(roomId, "viewer")).toEqual([]);
  });

  it("still block-excludes hidden alias entries both ways", async () => {
    await checkIns.checkIn({ userId: "u1", roomId, seatId: seatIds[0]!, location, showIdentity: false });
    await checkIns.checkIn({ userId: "u2", roomId, seatId: seatIds[1]!, location, showIdentity: false });
    await setProfile("u1", { identityMode: "HIDDEN" });
    await setProfile("u2", { identityMode: "HIDDEN" });
    expect(await people.listPeople(roomId, "viewer")).toHaveLength(2);

    await db.insert(schema.userBlocks).values([
      { blockerId: "viewer", blockedId: "u1" },
      { blockerId: "u2", blockedId: "viewer" },
    ]);
    expect(await people.listPeople(roomId, "viewer")).toEqual([]);
  });

  it("counts hidden and visible users together", async () => {
    await checkIns.checkIn({ userId: "u1", roomId, seatId: seatIds[0]!, location, showIdentity: true });
    await checkIns.checkIn({ userId: "u2", roomId, seatId: seatIds[1]!, location, showIdentity: false });
    await setProfile("u1", { nickname: "Uno", identityMode: "NICKNAME" });
    await setProfile("u2", { identityMode: "HIDDEN" });

    const list = await people.listPeople(roomId, "viewer");
    expect(list.map((p) => p.userId).sort()).toEqual([null, "u1"]);
  });

  it("includes a checked-in visible-mode user with their seatCode", async () => {
    await checkIns.checkIn({ userId: "u1", roomId, seatId: seatIds[0]!, location, showIdentity: true });
    await setProfile("u1", { nickname: "Uno", identityMode: "NICKNAME" });

    const list = await people.listPeople(roomId, "viewer");
    expect(list.find((p) => p.userId === "u1")?.seatCode).not.toBeNull();
  });

  it("includes a user with only an active study status (no check-in)", async () => {
    await checkIns.checkIn({ userId: "u2", roomId, seatId: seatIds[1]!, location, showIdentity: false });
    await study.start("u2", roomId, { subject: "Química", lookingForGroup: true });
    await checkIns.checkOut("u2");
    await setProfile("u2", { nickname: "Dos", identityMode: "NICKNAME" });

    const list = await people.listPeople(roomId, "viewer");
    const entry = list.find((p) => p.userId === "u2");
    expect(entry).toBeDefined();
    expect(entry?.studyStatus?.subject).toBe("Química");
  });

  it("excludes a user the viewer blocked", async () => {
    await checkIns.checkIn({ userId: "u1", roomId, seatId: seatIds[0]!, location, showIdentity: false });
    await setProfile("u1", { nickname: "Uno", identityMode: "NICKNAME" });
    await db.insert(schema.userBlocks).values({ blockerId: "viewer", blockedId: "u1" });

    const list = await people.listPeople(roomId, "viewer");
    expect(list.find((p) => p.userId === "u1")).toBeUndefined();
  });

  it("excludes a user who blocked the viewer", async () => {
    await checkIns.checkIn({ userId: "u1", roomId, seatId: seatIds[0]!, location, showIdentity: false });
    await setProfile("u1", { nickname: "Uno", identityMode: "NICKNAME" });
    await db.insert(schema.userBlocks).values({ blockerId: "u1", blockedId: "viewer" });

    const list = await people.listPeople(roomId, "viewer");
    expect(list.find((p) => p.userId === "u1")).toBeUndefined();
  });

  it("uses the display name computed from identity mode, falling back to anonymous", async () => {
    await checkIns.checkIn({ userId: "u3", roomId, seatId: seatIds[2]!, location, showIdentity: true });
    await setProfile("u3", { firstName: "María", identityMode: "FIRST_NAME" });

    const list = await people.listPeople(roomId, "viewer");
    expect(list.find((p) => p.userId === "u3")?.displayName).toBe("María");
  });

  describe("listOccupants", () => {
    it("returns an entry for every active check-in, with identity decided by the profile's identity mode", async () => {
      await checkIns.checkIn({ userId: "u1", roomId, seatId: seatIds[0]!, location, showIdentity: true });
      await setProfile("u1", { firstName: "Ana", identityMode: "FIRST_NAME" });
      await checkIns.checkIn({ userId: "u2", roomId, seatId: seatIds[1]!, location, showIdentity: true });
      await setProfile("u2", { identityMode: "HIDDEN" });
      await checkIns.checkIn({ userId: "u3", roomId, seatId: seatIds[2]!, location, showIdentity: false });
      await setProfile("u3", { firstName: "Cami", identityMode: "FIRST_NAME" });

      const occupants = (await people.listOccupants(roomId)) as SeatOccupantDto[];
      expect(occupants.map((o) => o.seatId).sort()).toEqual([seatIds[0]!, seatIds[1]!, seatIds[2]!].sort());
      expect(occupants.find((o) => o.seatId === seatIds[0])).toMatchObject({ userId: "u1", displayName: "Ana", avatar: { kind: "silhouette" } });
      expect(occupants.find((o) => o.seatId === seatIds[2])).toMatchObject({ userId: "u3", displayName: "Cami" });
      expect(occupants.filter((o) => o.userId !== null).map((o) => o.userId).sort()).toEqual(["u1", "u3"]);
    });

    it("shows the photo when the visible user opted into showAvatar and has one", async () => {
      await checkIns.checkIn({ userId: "u1", roomId, seatId: seatIds[0]!, location, showIdentity: true });
      await setPrivacy("u1", { showAvatar: true });
      await setProfile("u1", { firstName: "Zzyzxa", identityMode: "FIRST_NAME", avatarUrl: "https://example.test/a.jpg" });

      const [entry] = (await people.listOccupants(roomId)) as SeatOccupantDto[];
      expect(entry?.avatar).toEqual({ kind: "photo", url: "https://example.test/a.jpg" });
      expect(entry?.avatarUrl).toBe("https://example.test/a.jpg");

      await setPrivacy("u1", { showAvatar: false });
      const [withoutPhoto] = (await people.listOccupants(roomId)) as SeatOccupantDto[];
      expect(withoutPhoto?.avatar).toEqual({ kind: "silhouette" });
    });

    it("shows the alias animal for a hidden user and never exposes their userId", async () => {
      await checkIns.checkIn({ userId: "u1", roomId, seatId: seatIds[0]!, location, showIdentity: false });
      await setProfile("u1", { firstName: "Zzyzxa", identityMode: "HIDDEN", avatarUrl: "https://example.test/a.jpg" });
      await setPrivacy("u1", { showAvatar: true });

      const [entry] = (await people.listOccupants(roomId)) as SeatOccupantDto[];
      expect(entry?.userId).toBeNull();
      expect(entry?.avatarUrl).toBeNull();
      expect(entry?.avatar.kind).toBe("animal");
      const animalId = entry?.avatar.kind === "animal" ? entry.avatar.animalId : "";
      expect(isAnimalId(animalId)).toBe(true);
      expect(animalIdFromAlias(entry?.displayName)).toBe(animalId);
      expect(JSON.stringify(entry)).not.toContain("u1");
      expect(JSON.stringify(entry)).not.toContain("Zzyzxa");
    });

    it("falls back to a silhouette named 'Alguien' when the hidden user turned the animal off", async () => {
      await checkIns.checkIn({ userId: "u1", roomId, seatId: seatIds[0]!, location, showIdentity: false });
      await setPrivacy("u1", { showAliasAnimalOnMap: false });
      await setProfile("u1", { identityMode: "HIDDEN" });

      const [entry] = (await people.listOccupants(roomId)) as SeatOccupantDto[];
      expect(entry).toMatchObject({ userId: null, displayName: "Alguien", avatar: { kind: "silhouette" } });
    });

    it("anonymizes occupants blocked either way with the viewer, keeping the seat occupied", async () => {
      await checkIns.checkIn({ userId: "u1", roomId, seatId: seatIds[0]!, location, showIdentity: true });
      await setProfile("u1", { firstName: "Zzyzxa", identityMode: "FIRST_NAME" });
      await checkIns.checkIn({ userId: "u2", roomId, seatId: seatIds[1]!, location, showIdentity: false });
      await setProfile("u2", { identityMode: "HIDDEN" });
      await db.insert(schema.userBlocks).values([
        { blockerId: "viewer", blockedId: "u1" },
        { blockerId: "u2", blockedId: "viewer" },
      ]);

      const occupants = (await people.listOccupants(roomId, "viewer")) as SeatOccupantDto[];
      expect(occupants).toHaveLength(2);
      for (const entry of occupants) {
        expect(entry).toMatchObject({ userId: null, displayName: "Alguien", avatar: { kind: "silhouette" } });
      }
      expect(JSON.stringify(occupants)).not.toContain("Zzyzxa");

      // Other viewers still see them as before.
      const [visible] = ((await people.listOccupants(roomId, "u3")) as SeatOccupantDto[]).filter((o) => o.seatId === seatIds[0]);
      expect(visible).toMatchObject({ userId: "u1", displayName: "Zzyzxa" });
    });

    it("hides the name of a blocked observer in 'markedBy'", async () => {
      await setProfile("u2", { firstName: "Beto", identityMode: "FIRST_NAME" });
      const minutes = (n: number) => new Date(Date.now() + n * 60_000);
      await db.insert(schema.seatObservations).values({ userId: "u2", roomId, seatId: seatIds[3]!, observedStatus: "OCCUPIED", observedAt: minutes(-3), expiresAt: minutes(15) });
      await db.insert(schema.userBlocks).values({ blockerId: "viewer", blockedId: "u2" });

      const marked = (await people.listOccupants(roomId, "viewer")).filter((e): e is SeatMarkedByDto => "markedBy" in e);
      expect(marked).toHaveLength(1);
      expect(marked[0]?.markedBy.displayName).toBe("Alguien");
      expect(JSON.stringify(marked[0])).not.toContain("Beto");
    });

    it("reports 'markedBy' for OCCUPIED-observation seats with nobody checked in", async () => {
      await setProfile("u2", { firstName: "Beto", identityMode: "FIRST_NAME" });
      const minutes = (n: number) => new Date(Date.now() + n * 60_000);
      await db.insert(schema.seatObservations).values([
        { userId: "u2", roomId, seatId: seatIds[3]!, observedStatus: "OCCUPIED", observedAt: minutes(-5), expiresAt: minutes(15) },
        // Expired and checked-in seats must not produce entries; FREE replaces an older report.
        { userId: "u2", roomId, seatId: seatIds[4]!, observedStatus: "OCCUPIED", observedAt: minutes(-60), expiresAt: minutes(-40) },
        { userId: "u2", roomId, seatId: seatIds[5]!, observedStatus: "OCCUPIED", observedAt: minutes(-4), expiresAt: minutes(15) },
        { userId: "u2", roomId, seatId: seatIds[5]!, observedStatus: "FREE", observedAt: minutes(-2), expiresAt: minutes(15) },
      ]);
      await checkIns.checkIn({ userId: "u1", roomId, seatId: seatIds[6]!, location, showIdentity: false });
      await db.insert(schema.seatObservations).values({ userId: "u2", roomId, seatId: seatIds[6]!, observedStatus: "OCCUPIED", expiresAt: minutes(15) });

      const marked = (await people.listOccupants(roomId)).filter((e): e is SeatMarkedByDto => "markedBy" in e);
      expect(marked).toHaveLength(2);
      const occupied = marked.find(entry => entry.seatId === seatIds[3])!;
      expect(occupied.markedBy.displayName).toBe("Beto");
      expect(Date.parse(occupied.markedBy.observedAt)).toBeLessThan(Date.now() - 4 * 60_000);
      expect(JSON.stringify(marked)).not.toContain("u2");
      expect(occupied.kind).toBe("OCCUPIED");
      expect(marked.find(entry => entry.seatId === seatIds[5])).toMatchObject({ kind: "FREE", markedBy: { displayName: "Beto" } });
    });

    it("shows public identities for administrative FREE marks and never leaks account identifiers", async () => {
      await setProfile("u2", { firstName: "Beto", identityMode: "FIRST_NAME" });
      const now = new Date();
      await db.insert(schema.seatObservations).values({ userId: "u2", roomId, seatId: seatIds[3]!, observedStatus: "FREE", adminOverride: true, observedAt: now, expiresAt: new Date(+now + 60_000) });
      const marked = (await people.listOccupants(roomId, "viewer")).filter((e): e is SeatMarkedByDto => "markedBy" in e);
      expect(marked).toEqual([{ seatId: seatIds[3], kind: "FREE", markedBy: { displayName: "Beto", observedAt: now.toISOString() } }]);
    });

    it("uses the hidden observer's alias for FREE and keeps both block directions anonymous", async () => {
      await setProfile("u2", { firstName: "Private Name", identityMode: "HIDDEN" });
      await db.insert(schema.seatObservations).values({ userId: "u2", roomId, seatId: seatIds[3]!, observedStatus: "FREE", adminOverride: true, expiresAt: new Date(Date.now() + 60_000) });
      const [entry] = (await people.listOccupants(roomId, "viewer")).filter((e): e is SeatMarkedByDto => "markedBy" in e);
      expect(entry?.kind).toBe("FREE"); expect(entry?.markedBy.displayName).not.toBe("Usuario anónimo");
      expect(JSON.stringify(entry)).not.toMatch(/Private Name|u2|@|userId|adminOverride/);
      for (const reverse of [false, true]) {
        await db.delete(schema.userBlocks);
        await db.insert(schema.userBlocks).values({ blockerId: reverse ? "u2" : "viewer", blockedId: reverse ? "viewer" : "u2" });
        const blocked = (await people.listOccupants(roomId, "viewer")).filter((e): e is SeatMarkedByDto => "markedBy" in e);
        expect(blocked[0]?.markedBy.displayName).toBe("Alguien");
      }
    });

    it("reports 'markedBy' with kind SAVED for seats whose freshest observation is SAVED", async () => {
      await setProfile("u2", { firstName: "Beto", identityMode: "FIRST_NAME" });
      const minutes = (n: number) => new Date(Date.now() + n * 60_000);
      await db.insert(schema.seatObservations).values({ userId: "u2", roomId, seatId: seatIds[3]!, observedStatus: "SAVED", observedAt: minutes(-3), expiresAt: minutes(30) });

      const marked = (await people.listOccupants(roomId)).filter((e): e is SeatMarkedByDto => "markedBy" in e);
      expect(marked).toHaveLength(1);
      expect(marked[0]).toMatchObject({ seatId: seatIds[3], kind: "SAVED", markedBy: { displayName: "Beto" } });
    });
  });

  describe("proBadge and flair", () => {
    async function proPeople() {
      const roles = new RolesService(db);
      const clock = new FixedClock(new Date());
      const pro = new ProService(db, roles, { subscriptionsEnabled: true, clock });
      await checkIns.checkIn({ userId: "u1", roomId, seatId: seatIds[0]!, location, showIdentity: true });
      await checkIns.checkIn({ userId: "u2", roomId, seatId: seatIds[1]!, location, showIdentity: true });
      await checkIns.checkIn({ userId: "u3", roomId, seatId: seatIds[2]!, location, showIdentity: true });
      await setProfile("u1", { firstName: "Ana", identityMode: "FIRST_NAME" }); // paid, visible
      await setProfile("u2", { firstName: "Beto", identityMode: "FIRST_NAME" }); // free, visible
      await setProfile("u3", { identityMode: "HIDDEN" }); // paid, alias
      await db.insert(schema.userSubscriptions).values([
        { userId: "u1", providerSubscriptionId: "sub-u1", status: "authorized" },
        { userId: "u3", providerSubscriptionId: "sub-u3", status: "authorized" },
      ]);
      await db.insert(schema.userCosmetics).values(["u1", "u2", "u3"].map((userId) => ({ userId, frame: "double", nameColor: "forest" })));
      return new RoomPeopleService(db, new AliasService(db), roles, pro, new UserCosmeticsService(db, pro, clock));
    }

    it("listPeople marks paid visible people only; the alias branch gets neither", async () => {
      const list = await (await proPeople()).listPeople(roomId, "viewer");
      expect(list.find((p) => p.userId === "u1")).toMatchObject({ proBadge: true, flair: { frame: "double", nameColor: "forest" } });
      const free = list.find((p) => p.userId === "u2");
      expect(free?.proBadge).toBeUndefined();
      expect(free?.flair).toBeUndefined();
      const alias = list.find((p) => p.userId === null);
      expect(alias?.proBadge).toBeUndefined();
      expect(alias?.flair).toBeUndefined();
    });

    it("listOccupants marks paid visible occupants only; alias and Alguien get neither", async () => {
      const occupants = (await (await proPeople()).listOccupants(roomId, "viewer")) as SeatOccupantDto[];
      expect(occupants.find((o) => o.userId === "u1")).toMatchObject({ proBadge: true, flair: { frame: "double", nameColor: "forest" } });
      const free = occupants.find((o) => o.userId === "u2");
      expect(free?.proBadge).toBeUndefined();
      expect(free?.flair).toBeUndefined();
      const hidden = occupants.find((o) => o.userId === null);
      expect(hidden?.proBadge).toBeUndefined();
      expect(hidden?.flair).toBeUndefined();
    });
  });
});
