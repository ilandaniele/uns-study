import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@sala/database";
import { schema } from "@sala/database";
import { eq } from "drizzle-orm";
import { freshDb, insertUsers } from "../test-utils.js";
import { ReputationService } from "../reputation/reputation.service.js";
import { SecurityEventService } from "./security-event.service.js";

describe("SecurityEventService", () => {
  let db: Db;
  let svc: SecurityEventService;

  beforeEach(async () => {
    db = await freshDb();
    svc = new SecurityEventService(db, new ReputationService(db));
    await insertUsers(db, ["u1"]);
  });

  it("records the event and bumps the author's spam_score by 1", async () => {
    await svc.record({ userId: "u1", eventType: "RATE_LIMITED" });

    const [event] = await db.select().from(schema.securityEvents).where(eq(schema.securityEvents.userId, "u1"));
    expect(event?.eventType).toBe("RATE_LIMITED");

    const [reputation] = await db.select().from(schema.userReputation).where(eq(schema.userReputation.userId, "u1"));
    expect(reputation?.spamScore).toBe(1);
  });

  it("accumulates spam_score across repeated events", async () => {
    for (let i = 0; i < 3; i++) await svc.record({ userId: "u1", eventType: "OBSERVATION_SPREAD" });
    const [reputation] = await db.select().from(schema.userReputation).where(eq(schema.userReputation.userId, "u1"));
    expect(reputation?.spamScore).toBe(3);
  });

  it("does not touch reputation for anonymous (userId-less) events", async () => {
    await svc.record({ eventType: "TURNSTILE_FAILED" });
    const rows = await db.select().from(schema.userReputation);
    expect(rows).toHaveLength(0);
  });
});
