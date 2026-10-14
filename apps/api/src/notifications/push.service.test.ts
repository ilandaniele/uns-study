import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createECDH } from "node:crypto";
import { buildPushHTTPRequest } from "@pushforge/builder";
import type { Db } from "@sala/database";
import { schema } from "@sala/database";
import { eq } from "drizzle-orm";
import { env } from "../env.js";
import { freshDb, insertUsers } from "../test-utils.js";
import { PushService } from "./push.service.js";

const { sendNotification } = vi.hoisted(() => ({
  sendNotification: vi.fn(async (_subscription: unknown, _payload?: string) => undefined),
}));
// `buildPushHTTPRequest` (VAPID JWT + aes128gcm) is replaced by a stub that echoes the JSON payload
// as the body; the stubbed `fetch` forwards each request to `sendNotification` and maps a rejection
// carrying a `statusCode` to that HTTP status, anything else to a thrown network error.
vi.mock("@pushforge/builder", () => ({
  buildPushHTTPRequest: vi.fn(async (opts: { subscription: { endpoint: string }; message: { payload: unknown } }) => ({
    endpoint: opts.subscription.endpoint,
    headers: new Headers(),
    body: JSON.stringify(opts.message.payload),
  })),
}));

const ecdh = createECDH("prime256v1");
ecdh.generateKeys();
const PUBLIC_KEY = ecdh.getPublicKey().toString("base64url");
const PRIVATE_KEY = ecdh.getPrivateKey().toString("base64url");

describe("PushService", () => {
  let db: Db;
  let svc: PushService;

  beforeEach(async () => {
    sendNotification.mockClear();
    sendNotification.mockResolvedValue(undefined);
    vi.mocked(buildPushHTTPRequest).mockClear();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: { body: string }) => {
        try {
          await sendNotification({ endpoint: url }, init.body);
          return new Response(null, { status: 201 });
        } catch (err) {
          const statusCode = (err as { statusCode?: number }).statusCode;
          if (statusCode) return new Response(null, { status: statusCode });
          throw err;
        }
      }),
    );
    env.vapidPublicKey = PUBLIC_KEY;
    env.vapidPrivateKey = PRIVATE_KEY;

    db = freshDb();
    svc = new PushService(db);
    await insertUsers(db, ["u1"]);
    await db.insert(schema.pushSubscriptions).values({ userId: "u1", endpoint: "https://fcm.googleapis.com/fcm/send/abc", p256dh: "p", auth: "a" });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    env.vapidPublicKey = "";
    env.vapidPrivateKey = "";
  });

  it("is a no-op without VAPID keys", async () => {
    env.vapidPrivateKey = "";
    expect(await new PushService(db).sendToUser("u1", { title: "t", body: "b", url: "/", tag: "tag" })).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("is a no-op when the VAPID public key is not an uncompressed P-256 point", async () => {
    env.vapidPublicKey = "short";
    expect(await new PushService(db).sendToUser("u1", { title: "t", body: "b", url: "/", tag: "tag" })).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("signs with the JWK derived from the env key pair, a 600 s TTL and high urgency, and aborts slow sends", async () => {
    await svc.sendToUser("u1", { title: "t", body: "b", url: "/", tag: "tag" });

    const point = Buffer.from(PUBLIC_KEY, "base64url");
    expect(buildPushHTTPRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        privateJWK: { kty: "EC", crv: "P-256", x: point.subarray(1, 33).toString("base64url"), y: point.subarray(33, 65).toString("base64url"), d: PRIVATE_KEY },
        message: expect.objectContaining({ options: { ttl: 600, urgency: "high" } }),
      }),
    );
    expect(vi.mocked(fetch).mock.calls[0]![1]).toMatchObject({ method: "POST", signal: expect.any(AbortSignal) });
  });

  it("returns per-device counts for the send", async () => {
    expect(await svc.sendToUser("u1", { title: "t", body: "b", url: "/", tag: "tag" })).toEqual({ devices: 1, accepted: 1, gone: 0, failed: 0 });
    sendNotification.mockRejectedValueOnce(Object.assign(new Error("gone"), { statusCode: 410 }));
    expect(await svc.sendToUser("u1", { title: "t", body: "b", url: "/", tag: "tag" })).toEqual({ devices: 1, accepted: 0, gone: 1, failed: 0 });
  });

  it("deletes the subscription immediately on a 410 (gone)", async () => {
    sendNotification.mockRejectedValueOnce(Object.assign(new Error("gone"), { statusCode: 410 }));
    await svc.sendToUser("u1", { title: "t", body: "b", url: "/", tag: "tag" });
    expect(await db.select().from(schema.pushSubscriptions).where(eq(schema.pushSubscriptions.userId, "u1"))).toHaveLength(0);
  });

  it("deletes the subscription immediately on a 404 (gone)", async () => {
    sendNotification.mockRejectedValueOnce(Object.assign(new Error("gone"), { statusCode: 404 }));
    await svc.sendToUser("u1", { title: "t", body: "b", url: "/", tag: "tag" });
    expect(await db.select().from(schema.pushSubscriptions).where(eq(schema.pushSubscriptions.userId, "u1"))).toHaveLength(0);
  });

  it("increments the failure count on a non-HTTP error, without deleting the subscription yet", async () => {
    sendNotification.mockRejectedValueOnce(new Error("encryption failed"));
    await svc.sendToUser("u1", { title: "t", body: "b", url: "/", tag: "tag" });

    const [row] = await db.select().from(schema.pushSubscriptions).where(eq(schema.pushSubscriptions.userId, "u1"));
    expect(row?.failureCount).toBe(1);
  });

  it("counts an unexpected HTTP status (e.g. 500) as a failure, not as gone", async () => {
    sendNotification.mockRejectedValueOnce(Object.assign(new Error("boom"), { statusCode: 500 }));
    expect(await svc.sendToUser("u1", { title: "t", body: "b", url: "/", tag: "tag" })).toEqual({ devices: 1, accepted: 0, gone: 0, failed: 1 });
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

  it("logs one summary line per send with counts only, never the endpoint", async () => {
    const log = vi.spyOn((svc as unknown as { logger: { log: (m: string) => void } }).logger, "log").mockImplementation(() => undefined);
    await svc.sendToUser("u1", { title: "t", body: "b", url: "/", tag: "dm-1" });
    expect(log).toHaveBeenCalledWith('Push "dm-1" to user u1: 1 device(s), 1 accepted, 0 gone, 0 failed');
    expect(log.mock.calls.flat().join(" ")).not.toContain("fcm.googleapis.com");
  });
});
