import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@uns/database";
import { schema } from "@uns/database";
import { freshDb, getRoom, getSeats, insertUsers } from "../test-utils.js";
import { RoomsService } from "../rooms/rooms.service.js";
import { RoomStateService } from "../rooms/room-state.service.js";
import { AliasService } from "../users/alias.service.js";
import { RankingsService } from "./rankings.service.js";

// Buenos Aires is UTC-3 with no DST: 15:00Z is always mid-afternoon local, well clear of midnight.
const TODAY = new Date("2026-01-15T15:00:00Z"); // local date 2026-01-15 (Thursday)

describe("RankingsService", () => {
  let db: Db;
  let svc: RankingsService;
  let roomId: string;
  let roomSlug: string;
  let seatId: string;

  beforeEach(async () => {
    db = await freshDb();
    const roomsService = new RoomsService(db, new RoomStateService(db));
    svc = new RankingsService(db, roomsService, new AliasService(db));
    const room = await getRoom(db);
    roomId = room.id;
    roomSlug = room.slug;
    seatId = (await getSeats(db))[0]!.id;
  });

  async function makeVisible(userId: string): Promise<void> {
    await db.insert(schema.userPrivacySettings).values({ userId, showInRoom: true });
  }

  async function insertStudySession(userId: string, localDate: string, minutes: number, idSuffix: string): Promise<void> {
    await db.insert(schema.studySessions).values({
      id: idSuffix,
      userId,
      roomId,
      checkInId: idSuffix,
      startedAt: new Date(`${localDate}T12:00:00Z`),
      endedAt: new Date(`${localDate}T12:30:00Z`),
      verifiedMinutes: minutes,
      localDate,
      source: "CHECK_IN",
    });
  }

  it("caps study_time at 720 minutes per day and excludes days outside the period", async () => {
    await insertUsers(db, ["u1"]);
    await makeVisible("u1");
    await insertStudySession("u1", "2026-01-15", 500, "11111111-1111-1111-1111-111111111111");
    await insertStudySession("u1", "2026-01-15", 400, "22222222-2222-2222-2222-222222222222");
    // Outside the current ISO week (Mon 2026-01-12 .. Sun 2026-01-18) and outside "today".
    await insertStudySession("u1", "2026-01-01", 100, "33333333-3333-3333-3333-333333333333");

    const today = await svc.getRankings(roomSlug, "today", "study_time", null, TODAY);
    expect(today.entries).toEqual([{ rank: 1, userId: null, displayName: "Usuario anónimo", avatarUrl: null, isMe: false, value: 720 }]);

    const all = await svc.getRankings(roomSlug, "all", "study_time", null, TODAY);
    expect(all.entries[0]?.value).toBe(820); // 720 (capped today) + 100 (other day)
  });

  it("computes a current streak and breaks it on a gap", async () => {
    await insertUsers(db, ["u2", "u3"]);
    await makeVisible("u2");
    await makeVisible("u3");

    // u2: qualifying (>=30min) on 13, 14, 15 -> streak of 3 ending today.
    await insertStudySession("u2", "2026-01-13", 40, "44444444-4444-4444-4444-444444444444");
    await insertStudySession("u2", "2026-01-14", 40, "55555555-5555-5555-5555-555555555555");
    await insertStudySession("u2", "2026-01-15", 40, "66666666-6666-6666-6666-666666666666");
    // A qualifying day further back, separated by a gap, must not extend the current streak.
    await insertStudySession("u2", "2026-01-10", 40, "77777777-7777-7777-7777-777777777777");

    // u3: only qualifies two days ago -> current streak is broken (0).
    await insertStudySession("u3", "2026-01-13", 40, "88888888-8888-8888-8888-888888888888");

    const ranking = await svc.getRankings(roomSlug, "all", "streak", null, TODAY);
    // Neither u2 nor u3 opted into anything beyond `showInRoom`, so they're shown anonymously —
    // only u2 clears a nonzero streak, so it's the only (unlinkable) entry in the list.
    expect(ranking.entries).toHaveLength(1);
    expect(ranking.entries[0]).toMatchObject({ userId: null, value: 3 }); // value 0 (u3) is excluded from the list
  });

  it("caps contribution points per day (20 observations + 5 check-ins) and sums them", async () => {
    await insertUsers(db, ["u4"]);
    await makeVisible("u4");

    for (let i = 0; i < 25; i++) {
      await db.insert(schema.seatObservations).values({
        userId: "u4",
        roomId,
        seatId,
        observedStatus: "FREE",
        expiresAt: new Date(TODAY.getTime() + 60_000),
        createdAt: TODAY,
      });
    }
    for (let i = 0; i < 7; i++) {
      await db.insert(schema.checkIns).values({
        userId: "u4",
        roomId,
        seatId,
        status: "COMPLETED",
        startedAt: TODAY,
        expiresAt: new Date(TODAY.getTime() + 60_000),
        endedAt: TODAY,
        createdAt: TODAY,
      });
    }

    const ranking = await svc.getRankings(roomSlug, "today", "contribution", null, TODAY);
    expect(ranking.entries).toEqual([{ rank: 1, userId: null, displayName: "Usuario anónimo", avatarUrl: null, isMe: false, value: 25 }]);
  });

  it("excludes hidden users from the public list but still computes `me` for the viewer", async () => {
    await insertUsers(db, ["u5"]);
    // No privacy row, no profile row -> defaults to hidden/not-shown-in-room.
    await insertStudySession("u5", "2026-01-15", 60, "99999999-9999-9999-9999-999999999999");

    const asStranger = await svc.getRankings(roomSlug, "today", "study_time", null, TODAY);
    expect(asStranger.entries).toHaveLength(0);
    expect(asStranger.me).toBeNull();

    const asSelf = await svc.getRankings(roomSlug, "today", "study_time", "u5", TODAY);
    expect(asSelf.entries).toHaveLength(0);
    expect(asSelf.me).toEqual({ rank: 0, userId: null, displayName: "Usuario anónimo", avatarUrl: null, isMe: true, value: 60 });
  });

  it("includes a HIDDEN user (with a profile row) under their random alias, but never linkable", async () => {
    await insertUsers(db, ["u6"]);
    await db.insert(schema.userProfiles).values({ userId: "u6" }); // default identityMode: HIDDEN
    await db.insert(schema.userPrivacySettings).values({ userId: "u6", showInRoom: true });
    await insertStudySession("u6", "2026-01-15", 45, "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");

    const ranking = await svc.getRankings(roomSlug, "today", "study_time", null, TODAY);
    expect(ranking.entries).toHaveLength(1);
    // Shown under the alias, but never linkable — an alias is a fun label, not an identity.
    expect(ranking.entries[0]?.userId).toBeNull();
    expect(ranking.entries[0]?.displayName).not.toBe("Usuario anónimo");
    expect(ranking.entries[0]?.displayName).toMatch(/^\S+ \S+$/); // "Noun Adjective"
  });

  it("links a visible identity that opted into showInRoom", async () => {
    await insertUsers(db, ["u7"]);
    await db.insert(schema.userProfiles).values({ userId: "u7", identityMode: "FIRST_NAME", firstName: "Ana" });
    await db.insert(schema.userPrivacySettings).values({ userId: "u7", showInRoom: true });
    await insertStudySession("u7", "2026-01-15", 45, "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb");

    const ranking = await svc.getRankings(roomSlug, "today", "study_time", null, TODAY);
    expect(ranking.entries).toEqual([{ rank: 1, userId: "u7", displayName: "Ana", avatarUrl: null, isMe: false, value: 45 }]);
  });

  it("excludes a user entirely once they opt out of showInRanking, even from their own `me`", async () => {
    await insertUsers(db, ["u8"]);
    await db.insert(schema.userProfiles).values({ userId: "u8", identityMode: "FIRST_NAME", firstName: "Beto" });
    await db.insert(schema.userPrivacySettings).values({ userId: "u8", showInRoom: true, showInRanking: false });
    await insertStudySession("u8", "2026-01-15", 45, "cccccccc-cccc-cccc-cccc-cccccccccccc");

    const asStranger = await svc.getRankings(roomSlug, "today", "study_time", null, TODAY);
    expect(asStranger.entries).toHaveLength(0);

    const asSelf = await svc.getRankings(roomSlug, "today", "study_time", "u8", TODAY);
    expect(asSelf.entries).toHaveLength(0);
    expect(asSelf.me).toBeNull();
  });
});
