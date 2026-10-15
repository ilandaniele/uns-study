import { count, eq, inArray } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { chunk, inChunks, rowsPerInsert, SQLITE_MAX_PARAMS, type Db } from "./client.js";
import { seedInitialRoom } from "./seed.js";
import { buildTemplate, createTestDb } from "./testing.js";
import { checkIns } from "./schema/checkins.js";
import { user } from "./schema/auth.js";
import { roomDailyStats } from "./schema/study.js";
import { rooms, roomTables, seatCurrentState, seats } from "./schema/rooms.js";
import { chatRooms, directConversations } from "./schema/chat.js";
import { retiredAliases, userProfiles } from "./schema/profiles.js";
import { tableNameProposals } from "./schema/table-names.js";
import { scheduledJobs } from "./schema/scheduled-jobs.js";
import { userAvatars } from "./schema/avatars.js";
import { securityEvents } from "./schema/security.js";
import { notificationPreferences } from "./schema/notifications.js";

let template: Buffer;

beforeAll(async () => {
  template = await buildTemplate();
});

describe("migrate + seed", () => {
  let db: Db;

  beforeEach(() => {
    db = createTestDb({ template });
  });

  it("template is already seeded with exactly 108 active seats and 108 UNKNOWN states", async () => {
    const [{ value: seatCount }] = await db.select({ value: count() }).from(seats).where(eq(seats.active, true));
    expect(seatCount).toBe(108);

    const states = await db.select().from(seatCurrentState);
    expect(states).toHaveLength(108);
    expect(states.every((s) => s.status === "UNKNOWN")).toBe(true);
  });

  it("is idempotent: seeding twice still yields 108 seats, 1 room, 1 chat room", async () => {
    await seedInitialRoom(db);
    await seedInitialRoom(db);

    const [{ value: seatCount }] = await db.select({ value: count() }).from(seats);
    expect(seatCount).toBe(108);
    expect(await db.select().from(rooms)).toHaveLength(1);

    const chats = await db.select().from(chatRooms);
    expect(chats).toHaveLength(1);
    expect(chats[0]?.slug).toBe("sala-principal");
    expect(chats[0]?.name).toBe("#sala-principal");
  });

  it("writes nothing when the room is already seeded (DO rows-written budget)", async () => {
    const insert = vi.spyOn(db, "insert");
    const update = vi.spyOn(db, "update");
    const del = vi.spyOn(db, "delete");
    const tx = vi.spyOn(db, "transaction");
    await seedInitialRoom(db);
    expect(insert).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
    expect(del).not.toHaveBeenCalled();
    expect(tx).not.toHaveBeenCalled();
  });

  it("keeps a calibrated geofence across re-seeds (seed runs on every boot)", async () => {
    const [before] = await db.select().from(rooms);
    if (!before) throw new Error("seed missing room");

    await db.update(rooms).set({ latitude: -38.7, longitude: -62.28, geofenceRadiusM: 75 }).where(eq(rooms.id, before.id));
    await seedInitialRoom(db);

    const [after] = await db.select().from(rooms);
    expect(after?.latitude).toBe(-38.7);
    expect(after?.longitude).toBe(-62.28);
    expect(after?.geofenceRadiusM).toBe(75);
  });
});

describe("constraints", () => {
  let db: Db;
  let roomId: string;
  let seatIds: string[];

  beforeEach(async () => {
    db = createTestDb({ template });
    const [room] = await db.select().from(rooms);
    roomId = room!.id;
    seatIds = (await db.select().from(seats)).map((s) => s.id);
    await db.insert(user).values([
      { id: "u1", name: "User One", email: "u1@example.com" },
      { id: "u2", name: "User Two", email: "u2@example.com" },
    ]);
  });

  const expiresAt = () => new Date(Date.now() + 60 * 60_000);

  it("rejects a second ACTIVE check-in for the same user via the partial unique index", async () => {
    await db.insert(checkIns).values({ userId: "u1", roomId, seatId: seatIds[0]!, status: "ACTIVE", expiresAt: expiresAt() });
    await expect(
      db.insert(checkIns).values({ userId: "u1", roomId, seatId: seatIds[1]!, status: "ACTIVE", expiresAt: expiresAt() }),
    ).rejects.toThrow(/UNIQUE/);
  });

  it("rejects a second ACTIVE check-in for the same seat via the partial unique index", async () => {
    await db.insert(checkIns).values({ userId: "u1", roomId, seatId: seatIds[0]!, status: "ACTIVE", expiresAt: expiresAt() });
    await expect(
      db.insert(checkIns).values({ userId: "u2", roomId, seatId: seatIds[0]!, status: "ACTIVE", expiresAt: expiresAt() }),
    ).rejects.toThrow(/UNIQUE/);
  });

  it("allows a new ACTIVE check-in once earlier ones are no longer ACTIVE", async () => {
    await db.insert(checkIns).values({ userId: "u1", roomId, seatId: seatIds[0]!, status: "COMPLETED", expiresAt: expiresAt() });
    await db.insert(checkIns).values({ userId: "u1", roomId, seatId: seatIds[0]!, status: "ACTIVE", expiresAt: expiresAt() });
    await db.insert(checkIns).values({ userId: "u1", roomId, seatId: seatIds[0]!, status: "EXPIRED", expiresAt: expiresAt() });
    expect(await db.select().from(checkIns)).toHaveLength(3);
  });

  it("enforces foreign keys", async () => {
    await expect(
      db.insert(checkIns).values({ userId: "ghost", roomId, seatId: seatIds[0]!, expiresAt: expiresAt() }),
    ).rejects.toThrow(/FOREIGN KEY/);
  });

  it("cascades deletes from user to check-ins", async () => {
    await db.insert(checkIns).values({ userId: "u1", roomId, seatId: seatIds[0]!, expiresAt: expiresAt() });
    await db.delete(user).where(eq(user.id, "u1"));
    expect(await db.select().from(checkIns)).toHaveLength(0);
  });

  it("keeps check constraints (direct conversation user ordering)", async () => {
    await expect(db.insert(directConversations).values({ userA: "u2", userB: "u1" })).rejects.toThrow(/CHECK/);
    await db.insert(directConversations).values({ userA: "u1", userB: "u2" });
  });

  it("rejects case-insensitive duplicate aliases via alias_lower", async () => {
    await db.insert(userProfiles).values({ userId: "u1", alias: "Zorro Veloz", aliasLower: "zorro veloz" });
    await expect(
      db.insert(userProfiles).values({ userId: "u2", alias: "ZORRO VELOZ", aliasLower: "ZORRO VELOZ".toLowerCase() }),
    ).rejects.toThrow(/UNIQUE/);
    // Null aliases never collide.
    await db.insert(userProfiles).values({ userId: "u2" });
  });

  it("rejects duplicate retired aliases (folded)", async () => {
    await db.insert(retiredAliases).values({ alias: "Gato", aliasLower: "gato" });
    await expect(db.insert(retiredAliases).values({ alias: "GATO", aliasLower: "gato" })).rejects.toThrow(/UNIQUE/);
  });

  it("allows one ACTIVE proposal per (table, name_lower) while a REMOVED one can repeat", async () => {
    const [table] = await db.select().from(roomTables);
    const base = { roomId, tableId: table!.id, proposerUserId: "u1", name: "Norte", nameLower: "norte" };
    await db.insert(tableNameProposals).values(base);
    await expect(db.insert(tableNameProposals).values({ ...base, name: "NORTE" })).rejects.toThrow(/UNIQUE/);
    await db.insert(tableNameProposals).values({ ...base, status: "REMOVED" });
  });
});

describe("type round-trips", () => {
  let db: Db;

  beforeEach(() => {
    db = createTestDb({ template });
  });

  it("timestamps come back as Date with ms precision and defaults fill in", async () => {
    const at = new Date("2026-03-04T05:06:07.891Z");
    await db.insert(user).values({ id: "u1", name: "U", email: "u@example.com", createdAt: at });
    const [row] = await db.select().from(user);
    expect(row?.createdAt).toBeInstanceOf(Date);
    expect(row?.createdAt.getTime()).toBe(at.getTime());
    expect(row?.updatedAt).toBeInstanceOf(Date);
  });

  it("booleans round-trip and filter", async () => {
    await db.insert(user).values({ id: "u1", name: "U", email: "u@example.com" });
    await db.insert(notificationPreferences).values({ userId: "u1", seatFreed: true });
    const [row] = await db.select().from(notificationPreferences);
    expect(row?.seatFreed).toBe(true);
    expect(row?.adminPresent).toBe(false);
    expect(row?.checkinExpiry).toBe(true);
    expect(await db.select().from(notificationPreferences).where(eq(notificationPreferences.seatFreed, true))).toHaveLength(1);
  });

  it("json columns round-trip objects and null; uuid defaults are generated", async () => {
    await db.insert(securityEvents).values([{ eventType: "a", metadata: { n: 1, tags: ["x"] } }, { eventType: "b" }]);
    const rows = await db.select().from(securityEvents).orderBy(securityEvents.eventType);
    expect(rows[0]?.metadata).toEqual({ n: 1, tags: ["x"] });
    expect(rows[1]?.metadata).toBeNull();
    expect(rows[0]?.id).toHaveLength(36);
  });

  it("blob columns round-trip as Buffer", async () => {
    await db.insert(user).values({ id: "u1", name: "U", email: "u@example.com" });
    const bytes = Buffer.from([0, 1, 2, 250, 255]);
    await db.insert(userAvatars).values({ userId: "u1", mimeType: "image/png", bytes, sha256: "abc" });
    const [row] = await db.select().from(userAvatars);
    expect(Buffer.isBuffer(row?.bytes)).toBe(true);
    expect(row?.bytes.equals(bytes)).toBe(true);
  });

  it("date-as-text columns stay strings", async () => {
    const [room] = await db.select().from(rooms);
    await db.insert(roomDailyStats).values({ roomId: room!.id, day: "2026-03-04" });
    const [row] = await db.select().from(roomDailyStats);
    expect(row?.day).toBe("2026-03-04");
  });

  it("scheduled_jobs round-trip (recurring, one-shot with payload)", async () => {
    const due = new Date("2026-03-04T05:06:07.000Z");
    await db.insert(scheduledJobs).values([
      { key: "expiration", dueAt: due, intervalMs: 30_000 },
      { key: "summary:r1", dueAt: due, payload: { roomId: "r1" } },
    ]);
    const rows = await db.select().from(scheduledJobs).orderBy(scheduledJobs.key);
    expect(rows[0]).toEqual({ key: "expiration", dueAt: due, intervalMs: 30_000, payload: null });
    expect(rows[1]).toEqual({ key: "summary:r1", dueAt: due, intervalMs: null, payload: { roomId: "r1" } });
  });
});

describe("transactions", () => {
  it("are synchronous: an async callback throws (documents the DO rule, R4)", () => {
    const db = createTestDb({ template });
    expect(() => db.transaction((async () => {}) as never)).toThrow();
  });

  it("roll back on throw and commit on return", () => {
    const db = createTestDb({ template });
    expect(() =>
      db.transaction((tx) => {
        tx.insert(user).values({ id: "u1", name: "U", email: "u@example.com" }).run();
        throw new Error("boom");
      }),
    ).toThrow("boom");
    expect(db.select({ value: count() }).from(user).get()?.value).toBe(0);

    db.transaction((tx) => {
      tx.insert(user).values({ id: "u1", name: "U", email: "u@example.com" }).run();
    });
    expect(db.select({ value: count() }).from(user).get()?.value).toBe(1);
  });
});

describe("chunk helpers", () => {
  const range = (n: number) => Array.from({ length: n }, (_, i) => i);

  it("chunk splits and keeps order", () => {
    expect(chunk(range(7), 3)).toEqual([[0, 1, 2], [3, 4, 5], [6]]);
    expect(chunk([], 3)).toEqual([]);
  });

  it("rowsPerInsert stays under the parameter cap", () => {
    expect(SQLITE_MAX_PARAMS).toBe(100);
    expect(rowsPerInsert(1)).toBe(100);
    expect(rowsPerInsert(11)).toBe(9);
    expect(rowsPerInsert(250)).toBe(1);
    // Conflict-set values share the budget: 9 rows x 11 columns + 2 would be 101.
    expect(rowsPerInsert(11, 2)).toBe(8);
    expect(rowsPerInsert(3, 2)).toBe(32);
  });

  it("inChunks handles more than 100 values and concatenates results", () => {
    const calls: number[] = [];
    const out = inChunks(range(250), (part) => {
      calls.push(part.length);
      return part.map((x) => x * 2);
    });
    expect(calls).toEqual([90, 90, 70]);
    expect(out).toHaveLength(250);
    expect(out[249]).toBe(498);
  });

  it("inChunks drives inArray over more ids than one statement may bind", () => {
    const db = createTestDb({ template });
    const ids = db.select({ id: seats.id }).from(seats).all().map((r) => r.id);
    expect(ids).toHaveLength(108);
    const rows = inChunks(ids, (part) => db.select({ id: seats.id }).from(seats).where(inArray(seats.id, part)).all());
    expect(rows).toHaveLength(108);
  });
});
