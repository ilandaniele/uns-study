import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@sala/database";
import { schema } from "@sala/database";
import { eq } from "drizzle-orm";
import { freshDb, insertUsers } from "../test-utils.js";
import { PushSubscriptionsService } from "./push-subscriptions.service.js";

describe("PushSubscriptionsService", () => {
  let db: Db;
  let svc: PushSubscriptionsService;

  beforeEach(async () => {
    db = await freshDb();
    svc = new PushSubscriptionsService(db);
    await insertUsers(db, ["u1", "u2"]);
  });

  it("rejects an endpoint whose host isn't on the allowlist", async () => {
    await expect(
      svc.subscribe("u1", { endpoint: "https://evil.example.com/collect", keys: { p256dh: "p", auth: "a" } }, null),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("stores a valid subscription", async () => {
    await svc.subscribe("u1", { endpoint: "https://fcm.googleapis.com/fcm/send/abc", keys: { p256dh: "p", auth: "a" } }, "some-ua");
    const rows = await db.select().from(schema.pushSubscriptions).where(eq(schema.pushSubscriptions.userId, "u1"));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.endpoint).toBe("https://fcm.googleapis.com/fcm/send/abc");
  });

  it("re-subscribing the same endpoint under a different user reassigns it instead of duplicating", async () => {
    const endpoint = "https://fcm.googleapis.com/fcm/send/shared-device";
    await svc.subscribe("u1", { endpoint, keys: { p256dh: "p1", auth: "a1" } }, null);
    await svc.subscribe("u2", { endpoint, keys: { p256dh: "p2", auth: "a2" } }, null);

    const rows = await db.select().from(schema.pushSubscriptions).where(eq(schema.pushSubscriptions.endpoint, endpoint));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.userId).toBe("u2");
    expect(rows[0]?.p256dh).toBe("p2");
  });

  it("caps subscriptions per user at 10, dropping the oldest beyond that", async () => {
    for (let i = 0; i < 12; i++) {
      await svc.subscribe("u1", { endpoint: `https://fcm.googleapis.com/fcm/send/device-${i}`, keys: { p256dh: "p", auth: "a" } }, null);
    }

    const rows = await db.select().from(schema.pushSubscriptions).where(eq(schema.pushSubscriptions.userId, "u1"));
    expect(rows).toHaveLength(10);
    const endpoints = rows.map((r) => r.endpoint);
    expect(endpoints).not.toContain("https://fcm.googleapis.com/fcm/send/device-0");
    expect(endpoints).not.toContain("https://fcm.googleapis.com/fcm/send/device-1");
    expect(endpoints).toContain("https://fcm.googleapis.com/fcm/send/device-11");
  });

  it("unsubscribe only removes the caller's own subscription for that endpoint", async () => {
    const endpoint = "https://fcm.googleapis.com/fcm/send/abc";
    await svc.subscribe("u1", { endpoint, keys: { p256dh: "p", auth: "a" } }, null);

    await svc.unsubscribe("u2", endpoint); // different user, same endpoint — no-op
    expect(await db.select().from(schema.pushSubscriptions).where(eq(schema.pushSubscriptions.endpoint, endpoint))).toHaveLength(1);

    await svc.unsubscribe("u1", endpoint);
    expect(await db.select().from(schema.pushSubscriptions).where(eq(schema.pushSubscriptions.endpoint, endpoint))).toHaveLength(0);
  });
});
