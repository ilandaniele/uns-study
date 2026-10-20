import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@sala/database";
import { schema } from "@sala/database";
import { manualStudySessionSchema } from "@sala/contracts";
import { freshDb, getRoom, getSeats, insertUsers } from "../test-utils.js";
import { RolesService } from "../users/roles.service.js";
import { RoomsService } from "../rooms/rooms.service.js";
import { RoomStateService } from "../rooms/room-state.service.js";
import { AliasService } from "../users/alias.service.js";
import { StudySessionService } from "../rankings/study-session.service.js";
import { RankingsService } from "../rankings/rankings.service.js";
import { AdminStudySessionsService } from "./admin-study-sessions.service.js";

const NOW = new Date("2026-01-15T22:00:00Z"); // 19:00 local

describe("AdminStudySessionsService.credit", () => {
  let db: Db;
  let svc: AdminStudySessionsService;
  let roomsService: RoomsService;
  let roomId: string;

  beforeEach(async () => {
    db = freshDb();
    roomsService = new RoomsService(db, new RoomStateService(db));
    svc = new AdminStudySessionsService(db, new RolesService(db), roomsService, new StudySessionService(db));
    roomId = (await getRoom(db)).id;
    await insertUsers(db, ["admin", "moderator", "plain", "friend"]);
    await db.insert(schema.userRoles).values([
      { userId: "admin", role: "ADMIN" },
      { userId: "moderator", role: "MODERATOR" },
    ]);
  });

  const credit = { userId: "friend", startedAt: "2026-01-15T12:00:00.000Z", minutes: 360, reason: "Conteo perdido por bug" };

  it("rejects a non-admin actor, including a moderator, without writing anything", async () => {
    await expect(svc.credit("plain", credit, NOW)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(svc.credit("moderator", credit, NOW)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(await db.select().from(schema.studySessions)).toHaveLength(0);
    expect(await db.select().from(schema.moderationActions)).toHaveLength(0);
  });

  it("stores a MANUAL session, audits it with the reason, and the ranking picks it up", async () => {
    const result = await svc.credit("admin", { ...credit, roomId }, NOW);
    expect(result).toMatchObject({ userId: "friend", roomId, minutes: 360, startedAt: "2026-01-15T12:00:00.000Z", endedAt: "2026-01-15T18:00:00.000Z" });

    const [row] = await db.select().from(schema.studySessions).where(eq(schema.studySessions.id, result.id));
    expect(row).toMatchObject({ userId: "friend", roomId, source: "MANUAL", checkInId: null, verifiedMinutes: 360, localDate: "2026-01-15" });

    const [audit] = await db.select().from(schema.moderationActions);
    expect(audit).toMatchObject({ actorId: "admin", targetUserId: "friend", action: "STUDY_TIME_CREDITED" });
    expect(audit?.metadata).toMatchObject({ sessionId: result.id, minutes: 360, reason: "Conteo perdido por bug" });

    const rankings = new RankingsService(db, roomsService, new AliasService(db), new RolesService(db));
    const ranking = await rankings.getRankings(roomId, "today", "study_time", "friend", NOW);
    expect(ranking.me?.value).toBe(360);
  });

  it("accepts endedAt instead of minutes", async () => {
    const result = await svc.credit("admin", { userId: "friend", startedAt: "2026-01-15T12:00:00.000Z", endedAt: "2026-01-15T13:30:00.000Z", reason: "x" }, NOW);
    expect(result.minutes).toBe(90);
  });

  it("rejects an end before the start, an end in the future, and a start in the future", async () => {
    await expect(
      svc.credit("admin", { userId: "friend", startedAt: "2026-01-15T12:00:00.000Z", endedAt: "2026-01-15T11:00:00.000Z", reason: "x" }, NOW),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    await expect(svc.credit("admin", { ...credit, startedAt: "2026-01-15T20:00:00.000Z", minutes: 180 }, NOW)).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
    });
    await expect(svc.credit("admin", { ...credit, startedAt: "2026-01-15T23:00:00.000Z", minutes: 5000 }, NOW)).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
    });
    expect(await db.select().from(schema.studySessions)).toHaveLength(0);
  });

  it("credits more than 720 minutes as a bonus that counts whole on its start day, uncapped", async () => {
    // A real 6 h stay already counted that day: a bonus never overlaps it, and it may end after now.
    await svc.credit("admin", credit, NOW); // 12:00-18:00Z
    const bonus = await svc.credit("admin", { ...credit, startedAt: "2026-01-15T13:00:00.000Z", minutes: 5000 }, NOW);
    expect(bonus.minutes).toBe(5000);

    const rankings = new RankingsService(db, roomsService, new AliasService(db), new RolesService(db));
    const today = await rankings.getRankings(roomId, "today", "study_time", "friend", NOW);
    expect(today.me?.value).toBe(5360);

    // It still never blocks a later real stay.
    await expect(svc.credit("admin", { ...credit, startedAt: "2026-01-15T19:00:00.000Z", minutes: 60 }, NOW)).resolves.toMatchObject({ minutes: 60 });
  });

  it("takes time away with negative minutes, never below zero in the ranking", async () => {
    await svc.credit("admin", credit, NOW); // +360 on 2026-01-15
    const removed = await svc.credit("admin", { ...credit, startedAt: "2026-01-15T14:00:00.000Z", minutes: -100 }, NOW);
    expect(removed).toMatchObject({ minutes: -100, endedAt: "2026-01-15T14:00:00.000Z" });

    const rankings = new RankingsService(db, roomsService, new AliasService(db), new RolesService(db));
    expect((await rankings.getRankings(roomId, "today", "study_time", "friend", NOW)).me?.value).toBe(260);

    await svc.credit("admin", { ...credit, startedAt: "2026-01-15T15:00:00.000Z", minutes: -5000 }, NOW);
    const fresh = new RankingsService(db, roomsService, new AliasService(db), new RolesService(db));
    expect((await fresh.getRankings(roomId, "today", "study_time", "friend", NOW)).me?.value ?? 0).toBe(0);
  });

  it("rejects an unknown user or room", async () => {
    await expect(svc.credit("admin", { ...credit, userId: "ghost" }, NOW)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(svc.credit("admin", { ...credit, roomId: "00000000-0000-0000-0000-000000000000" }, NOW)).rejects.toMatchObject({ status: 404 });
  });

  it("refuses to credit time that overlaps an already counted session or a live check-in", async () => {
    await svc.credit("admin", credit, NOW); // 12:00-18:00Z
    await expect(svc.credit("admin", { ...credit, startedAt: "2026-01-15T17:00:00.000Z", minutes: 60 }, NOW)).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
    });
    // Back-to-back is fine.
    await expect(svc.credit("admin", { ...credit, startedAt: "2026-01-15T18:00:00.000Z", minutes: 60 }, NOW)).resolves.toMatchObject({ minutes: 60 });

    const seatId = (await getSeats(db))[0]!.id;
    await db.insert(schema.checkIns).values({ userId: "plain", roomId, seatId, status: "ACTIVE", startedAt: new Date("2026-01-15T10:00:00Z"), expiresAt: new Date("2026-01-15T23:00:00Z") });
    await expect(svc.credit("admin", { ...credit, userId: "plain", startedAt: "2026-01-15T11:00:00.000Z", minutes: 60 }, NOW)).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
    });
  });

  it("defaults the room to the user's latest check-in room, else the oldest active room", async () => {
    const result = await svc.credit("admin", credit, NOW);
    expect(result.roomId).toBe(roomId);
  });
});

describe("manualStudySessionSchema", () => {
  const base = { userId: "friend", startedAt: "2026-01-15T12:00:00.000Z", reason: "x" };

  it("requires exactly one of endedAt / minutes, a reason, and a sane number of minutes", () => {
    expect(manualStudySessionSchema.safeParse({ ...base, minutes: 60 }).success).toBe(true);
    expect(manualStudySessionSchema.safeParse({ ...base, endedAt: "2026-01-15T13:00:00.000Z" }).success).toBe(true);
    expect(manualStudySessionSchema.safeParse(base).success).toBe(false);
    expect(manualStudySessionSchema.safeParse({ ...base, minutes: 60, endedAt: "2026-01-15T13:00:00.000Z" }).success).toBe(false);
    expect(manualStudySessionSchema.safeParse({ ...base, minutes: 721 }).success).toBe(true);
    expect(manualStudySessionSchema.safeParse({ ...base, minutes: 1_000_001 }).success).toBe(false);
    expect(manualStudySessionSchema.safeParse({ ...base, minutes: -60 }).success).toBe(true);
    expect(manualStudySessionSchema.safeParse({ ...base, minutes: 0 }).success).toBe(false);
    expect(manualStudySessionSchema.safeParse({ ...base, minutes: 60, reason: "  " }).success).toBe(false);
  });
});
