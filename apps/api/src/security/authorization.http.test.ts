import { beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { schema, type Db } from "@sala/database";
import { baseHeaders, buildTestApp } from "../http/test-app.js";

const UUID_NONE = "00000000-0000-4000-8000-000000000000";

/**
 * HTTP-level IDOR checks: the real `createApp` (real guards, routers, services, Better Auth) on an
 * in-memory SQLite database, driven with real session cookies for several users.
 */
describe("authorization over HTTP (IDOR)", () => {
  let app: ReturnType<typeof buildTestApp>["app"];
  let db: Db;
  const cookies: Record<string, string> = {};
  const ids: Record<string, string> = {};

  async function signUp(key: string) {
    const res = await app.request("/api/auth/sign-up/email", {
      method: "POST",
      headers: baseHeaders({ "content-type": "application/json" }),
      body: JSON.stringify({ email: `${key}@example.test`, password: "correct-horse-battery", name: key }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { user: { id: string } };
    ids[key] = body.user.id;
    cookies[key] = res.headers
      .getSetCookie()
      .map((c) => c.split(";")[0])
      .join("; ");
    expect(cookies[key]).toContain("session_token");
  }

  function call(who: string | null, method: string, path: string, body?: unknown) {
    return app.request(`/api/v1${path}`, {
      method,
      headers: baseHeaders({
        ...(who ? { cookie: cookies[who]! } : {}),
        ...(body !== undefined ? { "content-type": "application/json" } : {}),
      }),
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  }

  beforeAll(async () => {
    ({ app, db } = buildTestApp());
    for (const key of ["alice", "bob", "carol"]) await signUp(key);
  }, 60_000);

  it("rejects an unauthenticated request to protected routes with 401", async () => {
    for (const [method, path] of [
      ["GET", "/conversations"],
      ["GET", `/conversations/${UUID_NONE}/messages`],
      ["DELETE", "/checkins/current"],
      ["GET", "/profiles/me"],
      ["GET", "/admin/users"],
    ] as const) {
      const res = await call(null, method, path);
      expect(res.status, `${method} ${path}`).toBe(401);
    }
  });

  describe("DM conversation between alice and carol", () => {
    let conversationId: string;

    beforeAll(async () => {
      const [a, c] = [ids.alice!, ids.carol!].sort() as [string, string];
      const [conv] = await db.insert(schema.directConversations).values({ userA: a, userB: c }).returning();
      conversationId = conv!.id;
      await db.insert(schema.directMessages).values({ conversationId, senderId: ids.alice!, content: "secreto de alice" });
    });

    it("lets a participant read the thread (sanity)", async () => {
      const res = await call("alice", "GET", `/conversations/${conversationId}/messages`);
      expect(res.status).toBe(200);
      expect(JSON.stringify(await res.json())).toContain("secreto de alice");
    });

    it("forbids a non-participant from listing, sending and marking read", async () => {
      const list = await call("bob", "GET", `/conversations/${conversationId}/messages`);
      expect([403, 404]).toContain(list.status);
      expect(await list.text()).not.toContain("secreto de alice");

      const send = await call("bob", "POST", `/conversations/${conversationId}/messages`, { content: "intruso" });
      expect([403, 404]).toContain(send.status);

      const read = await call("bob", "POST", `/conversations/${conversationId}/read`);
      expect([403, 404]).toContain(read.status);

      const msgs = await db.select().from(schema.directMessages).where(eq(schema.directMessages.conversationId, conversationId));
      expect(msgs.map((m) => m.content)).toEqual(["secreto de alice"]);
      const reads = await db
        .select()
        .from(schema.directConversationReads)
        .where(and(eq(schema.directConversationReads.conversationId, conversationId), eq(schema.directConversationReads.userId, ids.bob!)));
      expect(reads).toHaveLength(0);
    });

    it("does not list the conversation for a non-participant", async () => {
      const res = await call("bob", "GET", "/conversations");
      expect(res.status).toBe(200);
      expect(JSON.stringify(await res.json())).not.toContain(conversationId);
    });
  });

  it("does not let bob delete alice's push subscription", async () => {
    const endpoint = "https://fcm.googleapis.com/fcm/send/alice-device-endpoint";
    await db.insert(schema.pushSubscriptions).values({ userId: ids.alice!, endpoint, p256dh: "p", auth: "a" });

    const res = await call("bob", "DELETE", "/notifications/push-subscriptions", { endpoint });
    expect(res.status).toBeLessThan(500);

    const rows = await db.select().from(schema.pushSubscriptions).where(eq(schema.pushSubscriptions.endpoint, endpoint));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.userId).toBe(ids.alice!);
  });

  it("does not let bob end, extend or photo-verify alice's active check-in", async () => {
    const [room] = await db.select().from(schema.rooms);
    const [seat] = await db.select().from(schema.seats).where(eq(schema.seats.roomId, room!.id)).limit(1);
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
    const [checkIn] = await db
      .insert(schema.checkIns)
      .values({ userId: ids.alice!, roomId: room!.id, seatId: seat!.id, expiresAt, presenceVerified: true })
      .returning();

    const end = await call("bob", "DELETE", "/checkins/current");
    expect(end.status).toBe(404);
    const extend = await call("bob", "POST", "/checkins/current/extend", {
      location: { latitude: 0, longitude: 0, accuracyM: 10 },
      durationMinutes: 60,
    });
    expect(extend.status).toBeGreaterThanOrEqual(400);
    expect(extend.status).toBeLessThan(500);
    const photo = await call("bob", "POST", `/checkins/${checkIn!.id}/photo`, {});
    expect(photo.status).toBeGreaterThanOrEqual(400);
    expect(photo.status).toBeLessThan(500);

    const [after] = await db.select().from(schema.checkIns).where(eq(schema.checkIns.id, checkIn!.id));
    expect(after!.status).toBe("ACTIVE");
    expect(after!.userId).toBe(ids.alice!);
    expect(after!.expiresAt.getTime()).toBe(expiresAt.getTime());
    expect(after!.endedAt).toBeNull();
  });

  it("forbids a normal user on admin routes", async () => {
    for (const [method, path] of [
      ["GET", "/admin/users"],
      ["GET", `/admin/users/${ids.alice}`],
      ["POST", `/admin/users/${ids.alice}/actions`],
    ] as const) {
      const res = await call("bob", method, path, method === "POST" ? { type: "BAN", reason: "x" } : undefined);
      expect(res.status, `${method} ${path}`).toBe(403);
    }
    const restrictions = await db.select().from(schema.userRestrictions).where(eq(schema.userRestrictions.userId, ids.alice!));
    expect(restrictions).toHaveLength(0);
  });

  it("exposes no email, password hash or tokens in another user's public profile", async () => {
    const res = await call("bob", "GET", `/profiles/${ids.alice}`);
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).not.toContain("alice@example.test");
    expect(text).not.toMatch(/email|password|token|secret/i);
    const [account] = await db.select().from(schema.account).where(eq(schema.account.userId, ids.alice!));
    expect(account?.password).toBeTruthy();
    expect(text).not.toContain(account!.password!);
  });
});
