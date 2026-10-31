import { beforeEach, describe, expect, it } from "vitest";
import { schema, type Db } from "@sala/database";
import { freshDb, getRoom, getSeats, insertUsers } from "../test-utils.js";
import { eq } from "drizzle-orm";
import { AdminAuditService } from "./admin-audit.service.js";

describe("AdminAuditService", () => {
  let db: Db;
  let svc: AdminAuditService;

  beforeEach(async () => {
    db = freshDb();
    svc = new AdminAuditService(db);
    await insertUsers(db, ["admin", "antonella", "other"]);
  });

  it("clears existing history while retaining current restrictions and a new cleanup receipt", async () => {
    await db.insert(schema.moderationActions).values({ actorId: "admin", targetUserId: "antonella", action: "BAN", createdAt: new Date(Date.now() - 60_000) });
    await db.insert(schema.userRestrictions).values({ userId: "antonella", type: "BANNED", reason: "Test" });
    const result = svc.clearExisting("admin");
    expect(result.count).toBe(1);
    expect((await svc.list(undefined)).items).toMatchObject([{ action: "AUDIT_CLEARED", metadata: { count: 1 } }]);
    expect(await db.select().from(schema.userRestrictions)).toHaveLength(1);
  });

  it("does not delete entries after the server cutoff or create receipts for an empty cleanup", async () => {
    expect(svc.clearExisting("admin").count).toBe(0);
    expect(await db.select().from(schema.moderationActions)).toHaveLength(0);
    await db.insert(schema.moderationActions).values([{ actorId: "admin", action: "WARN", createdAt: new Date(Date.now() - 60_000) }, { actorId: "admin", action: "BAN", createdAt: new Date(Date.now() + 60_000) }]);
    expect(svc.clearExisting("admin").count).toBe(1);
    const entries = await db.select().from(schema.moderationActions);
    expect(entries.map(e => e.action).sort()).toEqual(["AUDIT_CLEARED", "BAN"]);
  });

  it("rejects a cleanup atomically while bulk-mark undo is live, then allows it after expiry", async () => {
    const room = await getRoom(db), [seat] = await getSeats(db);
    const [observation] = await db.insert(schema.seatObservations).values({ userId: "admin", roomId: room.id, seatId: seat!.id, observedStatus: "OCCUPIED", adminOverride: true, expiresAt: new Date(Date.now() + 60_000) }).returning();
    await db.insert(schema.moderationActions).values([{ actorId: "admin", action: "WARN" }, { actorId: "admin", action: "ADMIN_MARK_ALL_OCCUPIED", metadata: { roomId: room.id, observationIds: [observation!.id] } }]);
    expect(() => svc.clearExisting("admin")).toThrow("todavía se puede deshacer");
    expect(await db.select().from(schema.moderationActions)).toHaveLength(2);
    await db.update(schema.seatObservations).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(schema.seatObservations.id, observation!.id));
    expect(svc.clearExisting("admin").count).toBe(2);
    expect(await db.select().from(schema.seatObservations)).toHaveLength(1);
  });

  it("shows account names only in the superadmin audit view", async () => {
    await db.insert(schema.moderationActions).values({ actorId: "admin", targetUserId: "antonella", action: "BAN", metadata: { reason: "x" } });

    const { items } = await svc.list(undefined,undefined,true);
    expect(items[0]).toMatchObject({ action: "BAN", actorName: "admin", targetName: "antonella" });
  });

  it("filters by target user so a ban is not buried under other events", async () => {
    await db.insert(schema.moderationActions).values({ actorId: "admin", targetUserId: "antonella", action: "BAN", metadata: {}, createdAt: new Date(Date.now() - 60_000) });
    await db.insert(schema.moderationActions).values(
      Array.from({ length: 60 }, () => ({ actorId: "admin", targetUserId: "other", action: "WARN", metadata: {} })),
    );

    const all = await svc.list(undefined);
    expect(all.items.some((i) => i.targetUserId === "antonella")).toBe(false);
    expect(all.nextCursor).not.toBeNull();

    const only = await svc.list(undefined, "antonella");
    expect(only.items).toHaveLength(1);
    expect(only.items[0]?.action).toBe("BAN");
  });
});
