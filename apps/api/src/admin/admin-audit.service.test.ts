import { beforeEach, describe, expect, it } from "vitest";
import { schema, type Db } from "@sala/database";
import { freshDb, insertUsers } from "../test-utils.js";
import { AdminAuditService } from "./admin-audit.service.js";

describe("AdminAuditService", () => {
  let db: Db;
  let svc: AdminAuditService;

  beforeEach(async () => {
    db = freshDb();
    svc = new AdminAuditService(db);
    await insertUsers(db, ["admin", "antonella", "other"]);
  });

  it("names the actor and the target of each entry", async () => {
    await db.insert(schema.moderationActions).values({ actorId: "admin", targetUserId: "antonella", action: "BAN", metadata: { reason: "x" } });

    const { items } = await svc.list(undefined);
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
