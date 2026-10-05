import "reflect-metadata";

import type { AddressInfo } from "node:net";
import express from "express";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { INestApplication } from "@nestjs/common";
import { and, eq } from "drizzle-orm";
import { schema, seedInitialRoom, type Db } from "@sala/database";

// Must run before `env.ts` is first evaluated (it captures process.env at import time): an
// in-memory PGlite, no Redis/Resend, and no real DATABASE_URL leaking in from a local `.env`.
vi.hoisted(() => {
  process.env.DATABASE_URL = "";
  process.env.PGLITE_DIR = "memory://";
  process.env.UPSTASH_REDIS_REST_URL = "";
  process.env.UPSTASH_REDIS_REST_TOKEN = "";
  process.env.REDIS_URL = "";
  process.env.RESEND_API_KEY = "";
  process.env.EMAIL_FROM = "";
  process.env.MIGRATION_DATABASE_URL = "";
  process.env.E2E_TEST_HOOKS = "";
});

const ORIGIN = "http://localhost:3000";
const UUID_NONE = "00000000-0000-4000-8000-000000000000";

/**
 * HTTP-level IDOR checks: the real AppModule (real guards, controllers, services, Better Auth)
 * on an in-memory database, driven with real session cookies for several users. Mirrors the
 * middleware/pipeline wiring of `main.ts` that matters for authorization.
 */
describe("authorization over HTTP (IDOR)", () => {
  let app: INestApplication;
  let db: Db;
  let base: string;
  const cookies: Record<string, string> = {};
  const ids: Record<string, string> = {};

  async function signUp(key: string) {
    const res = await fetch(`${base}/api/auth/sign-up/email`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: ORIGIN },
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
    return fetch(`${base}/api/v1${path}`, {
      method,
      headers: {
        origin: ORIGIN,
        ...(who ? { cookie: cookies[who]! } : {}),
        ...(body !== undefined ? { "content-type": "application/json" } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  }

  beforeAll(async () => {
    const { NestFactory } = await import("@nestjs/core");
    const { toNodeHandler } = await import("better-auth/node");
    const { AppModule } = await import("../app.module.js");
    const { AUTH } = await import("../auth/auth.tokens.js");
    const { DB } = await import("../database/database.module.js");
    const { ApiExceptionFilter } = await import("../common/api-exception.filter.js");

    app = await NestFactory.create(AppModule, { bodyParser: false, logger: false });
    const http = app.getHttpAdapter().getInstance();
    http.all("/api/auth/*", toNodeHandler(app.get(AUTH)));
    app.use(express.json());
    app.setGlobalPrefix("api/v1");
    app.useGlobalFilters(new ApiExceptionFilter());
    await app.listen(0, "127.0.0.1");
    base = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}`;

    db = app.get(DB);
    await seedInitialRoom(db);
    for (const key of ["alice", "bob", "carol"]) await signUp(key);
  }, 60_000);

  afterAll(async () => {
    await app?.close();
  });

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
