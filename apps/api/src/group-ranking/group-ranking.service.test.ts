import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { schema, type Db } from "@sala/database";
import { BlocksService } from "../blocks/blocks.service.js";
import { GroupStudyService } from "../group-study/group-study.service.js";
import { FixedClock } from "../platform/clock.js";
import { RankingsService } from "../rankings/rankings.service.js";
import { RoomRealtimeGateway } from "../realtime/room-realtime.gateway.js";
import { RecordingHub } from "../realtime/realtime-hub.js";
import { RoomStateService } from "../rooms/room-state.service.js";
import { RoomsService } from "../rooms/rooms.service.js";
import { buildNotificationService, freshDb, getRoom, insertUsers } from "../test-utils.js";
import { AliasService } from "../users/alias.service.js";
import { RolesService } from "../users/roles.service.js";
import { GroupRankingService } from "./group-ranking.service.js";

// Buenos Aires is UTC-3 with no DST: 15:00Z is mid-afternoon local.
const TODAY = new Date("2026-01-15T15:00:00Z");
const GROUP = "11111111-1111-4111-8111-111111111111";
const OTHER_GROUP = "22222222-2222-4222-8222-222222222222";

describe("GroupRankingService", () => {
  let db: Db;
  let svc: GroupRankingService;
  let roomId: string;
  let roomSlug: string;
  let n = 0;

  beforeEach(async () => {
    db = freshDb();
    const aliases = new AliasService(db);
    const rooms = new RoomsService(db, new RoomStateService(db));
    const rankings = new RankingsService(db, rooms, aliases, new RolesService(db));
    const gateway = new RoomRealtimeGateway(new RecordingHub(), new RoomStateService(db), buildNotificationService(db), null);
    const groupStudy = new GroupStudyService(db, aliases, new BlocksService(db, aliases), gateway, new FixedClock(TODAY));
    svc = new GroupRankingService(db, rooms, rankings, groupStudy);

    await insertUsers(db, ["u1", "u2", "u3", "u4", "outsider"]);
    await db.insert(schema.groupConversations).values({ id: GROUP, name: "Estudio", createdBy: "u1" });
    await db.insert(schema.groupMembers).values([
      { groupId: GROUP, userId: "u1", role: "OWNER" },
      { groupId: GROUP, userId: "u2" },
      { groupId: GROUP, userId: "u3" },
      { groupId: GROUP, userId: "u4" },
    ]);
    const room = await getRoom(db);
    roomId = room.id;
    roomSlug = room.slug;
    // Everyone has a profile (default HIDDEN mode: shown under an alias). The outsider studied the most.
    for (const id of ["u1", "u2", "u3", "u4", "outsider"]) await db.insert(schema.userProfiles).values({ userId: id });
    await study("outsider", 600);
    await study("u2", 120);
    await study("u1", 60);
  });

  async function study(userId: string, minutes: number): Promise<void> {
    const id = `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`;
    await db.insert(schema.studySessions).values({
      id,
      userId,
      roomId,
      checkInId: id,
      startedAt: new Date("2026-01-15T12:00:00Z"),
      endedAt: new Date("2026-01-15T13:00:00Z"),
      verifiedMinutes: minutes,
      localDate: "2026-01-15",
      source: "CHECK_IN",
    });
  }

  const get = (viewer = "u1") => svc.getGroupRanking(GROUP, viewer, roomSlug, "today", "study_time", TODAY);

  it("lists only group members with sequential ranks and zero-value members at the bottom", async () => {
    const res = await get();
    expect(res).toMatchObject({ groupId: GROUP, groupName: "Estudio", roomSlug, period: "today", category: "study_time" });
    expect(res.entries.map((e) => [e.rank, e.value])).toEqual([
      [1, 120],
      [2, 60],
      [3, 0],
      [4, 0],
    ]);
    expect(res.me).toMatchObject({ rank: 2, value: 60, isMe: true });
  });

  it("hides the user id of members shown under an alias", async () => {
    const res = await get();
    expect(res.entries.every((e) => e.userId === null)).toBe(true);
  });

  it("links members who chose a visible identity", async () => {
    await db.update(schema.userProfiles).set({ identityMode: "FIRST_NAME", firstName: "Beto" }).where(eq(schema.userProfiles.userId, "u2"));
    const res = await get();
    expect(res.entries[0]).toMatchObject({ userId: "u2", displayName: "Beto", value: 120 });
    expect(res.entries[1]?.userId).toBeNull();
  });

  it("404s for a non-member, an unknown group and an unknown room", async () => {
    await expect(get("outsider")).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(svc.getGroupRanking(OTHER_GROUP, "u1", roomSlug, "today", "study_time", TODAY)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(svc.getGroupRanking(GROUP, "u1", "no-such-room", "today", "study_time", TODAY)).rejects.toMatchObject({ status: 404 });
  });

  it("excludes members blocked in either direction", async () => {
    await db.insert(schema.userBlocks).values([
      { blockerId: "u1", blockedId: "u2" },
      { blockerId: "u3", blockedId: "u1" },
    ]);
    const res = await get();
    expect(res.entries.map((e) => e.value)).toEqual([60, 0]);
  });

  it("excludes a member who opted out of rankings, and gives them no `me`", async () => {
    await db.insert(schema.userPrivacySettings).values({ userId: "u2", showInRanking: false });
    const mine = await get("u1");
    expect(mine.entries.map((e) => e.value)).toEqual([60, 0, 0]);
    const theirs = await get("u2");
    expect(theirs.me).toBeNull();
    expect(theirs.entries).toHaveLength(3);
  });
});
