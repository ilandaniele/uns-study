import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Db } from "@uns/database";
import { schema } from "@uns/database";
import { eq } from "drizzle-orm";
import { freshDb, insertUsers } from "../test-utils.js";
import { PushService } from "./push.service.js";

const { sendNotification } = vi.hoisted(() => ({
  sendNotification: vi.fn(async (_subscription: unknown, _payload?: string, _options?: unknown) => undefined),
}));
vi.mock("web-push", () => ({
  default: {
    setVapidDetails: vi.fn(),
    sendNotification,
  },
}));
vi.mock("../env.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../env.js")>();
  return { env: { ...actual.env, vapidPublicKey: "test-public-key", vapidPrivateKey: "test-private-key" } };
});

describe("PushService", () => {
  let db: Db;
  let svc: PushService;

  beforeEach(async () => {
    sendNotification.mockClear();
    sendNotification.mockResolvedValue(undefined);

    db = await freshDb();
    svc = new PushService(db);
    await insertUsers(db, ["u1"]);
    await db.insert(schema.pushSubscriptions).values({ userId: "u1", endpoint: "https://fcm.googleapis.com/fcm/send/abc", p256dh: "p", auth: "a" });
  });

  it("passes a timeout and TTL to web-push", async () => {
    await svc.sendToUser("u1", { title: "t", body: "b", url: "/", tag: "tag" });
    expect(sendNotification).toHaveBeenCalledWith(expect.anything(), expect.any(String), { timeout: 5000, TTL: 600 });
  });

  it("deletes the subscription immediately on a 410 (gone)", async () => {
    sendNotification.mockRejectedValueOnce(Object.assign(new Error("gone"), { statusCode: 410 }));
    await svc.sendToUser("u1", { title: "t", body: "b", url: "/", tag: "tag" });
    expect(await db.select().from(schema.pushSubscriptions).where(eq(schema.pushSubscriptions.userId, "u1"))).toHaveLength(0);
  });

  it("increments the failure count on a non-HTTP error, without deleting the subscription yet", async () => {
    sendNotification.mockRejectedValueOnce(new Error("encryption failed"));
    await svc.sendToUser("u1", { title: "t", body: "b", url: "/", tag: "tag" });

    const [row] = await db.select().from(schema.pushSubscriptions).where(eq(schema.pushSubscriptions.userId, "u1"));
    expect(row?.failureCount).toBe(1);
  });

  it("deletes the subscription after 3 consecutive non-HTTP failures", async () => {
    sendNotification.mockRejectedValue(new Error("encryption failed"));
    await svc.sendToUser("u1", { title: "t", body: "b", url: "/", tag: "tag" });
    await svc.sendToUser("u1", { title: "t", body: "b", url: "/", tag: "tag" });
    expect(await db.select().from(schema.pushSubscriptions).where(eq(schema.pushSubscriptions.userId, "u1"))).toHaveLength(1);

    await svc.sendToUser("u1", { title: "t", body: "b", url: "/", tag: "tag" });
    expect(await db.select().from(schema.pushSubscriptions).where(eq(schema.pushSubscriptions.userId, "u1"))).toHaveLength(0);
  });

  it("resets the failure count to 0 after a successful delivery", async () => {
    sendNotification.mockRejectedValueOnce(new Error("encryption failed"));
    await svc.sendToUser("u1", { title: "t", body: "b", url: "/", tag: "tag" });

    sendNotification.mockResolvedValueOnce(undefined);
    await svc.sendToUser("u1", { title: "t", body: "b", url: "/", tag: "tag" });

    const [row] = await db.select().from(schema.pushSubscriptions).where(eq(schema.pushSubscriptions.userId, "u1"));
    expect(row?.failureCount).toBe(0);
  });
});
