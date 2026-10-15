import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import type { ResendMessage } from "../email/resend.client.js";
import { schema, type Db } from "@sala/database";
import { toErrorResponse } from "../common/api-error.js";
import type { AppEnv } from "../http/context.js";
import { adminFeedbackRouter } from "../admin/admin-feedback.router.js";
import { FixedClock } from "../platform/clock.js";
import { AntiAbuseService } from "../security/anti-abuse.service.js";
import { RateLimitService } from "../security/rate-limit.service.js";
import type { Services } from "../services.js";
import { freshDb, insertUsers } from "../test-utils.js";
import { feedbackRouter } from "./feedback.router.js";
import { FeedbackService } from "./feedback.service.js";

const USER = { id: "u1", name: "Ana", email: "ana@example.test", image: null, emailVerified: true };

describe("feedback routers", () => {
  let db: Db;
  let turnstile: { isEnabled: ReturnType<typeof vi.fn>; verify: ReturnType<typeof vi.fn> };
  let sendBatch: Mock<(msgs: ResendMessage[]) => Promise<string[]>>;

  /** Real feedback service and limiter over a fresh DB; the session and role lookup are stubbed. */
  function mount(opts: { session?: typeof USER | null; admin?: boolean } = {}) {
    const rateLimit = new RateLimitService();
    const services = {
      feedback: new FeedbackService(db, new FixedClock(new Date()), { sendBatch }, { adminEmails: ["a@example.test"], ownerEmail: "", emailFrom: "x@example.test" }),
      antiAbuse: new AntiAbuseService(rateLimit, null as never, null as never, turnstile as never),
      turnstile,
      rateLimit,
      roles: { hasRole: async () => opts.admin === true },
      restriction: { assertNot: async () => undefined, activeRestrictions: async () => [] },
    } as unknown as Services;
    const app = new Hono<AppEnv>();
    app.use("*", async (c, next) => {
      c.set("services", services);
      c.set("auth", { api: { getSession: async () => (opts.session === null ? null : { user: opts.session ?? USER, session: { id: "s1" } }) } } as never);
      c.set("ip", "1.1.1.1");
      c.set("user", null);
      await next();
    });
    app.onError((err, c) => {
      const r = toErrorResponse(err, { method: c.req.method, path: c.req.path });
      return c.json(r.body, r.status as never);
    });
    app.route("/", feedbackRouter);
    app.route("/", adminFeedbackRouter);
    return app;
  }

  const json = (method: string, body: unknown) => ({ method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const valid = { category: "BUG", message: "Se rompe el mapa" };

  beforeEach(async () => {
    db = freshDb();
    await insertUsers(db, ["u1"]);
    turnstile = { isEnabled: vi.fn(() => false), verify: vi.fn(async () => true) };
    sendBatch = vi.fn(async () => ["id"]);
  });

  describe("POST /feedback", () => {
    it("accepts an anonymous post when Turnstile is disabled", async () => {
      const res = await mount({ session: null }).request("/feedback", json("POST", { ...valid, email: "x@example.test" }));
      expect(res.status).toBe(201);
      const { id } = (await res.json()) as { id: string };
      const [row] = await db.select().from(schema.feedback);
      expect(row).toMatchObject({ id, userId: null, contactEmail: "x@example.test" });
      expect(row!.ipHash).toMatch(/^[0-9a-f]{64}$/);
      expect(turnstile.verify).not.toHaveBeenCalled();
    });

    it("requires a valid Turnstile token from anonymous senders when enabled", async () => {
      turnstile.isEnabled.mockReturnValue(true);
      const app = mount({ session: null });
      turnstile.verify.mockResolvedValueOnce(false);
      const denied = await app.request("/feedback", json("POST", valid));
      expect(await denied.json()).toMatchObject({ error: { code: "TURNSTILE_REQUIRED" } });
      expect(await db.select().from(schema.feedback)).toHaveLength(0);

      const ok = await app.request("/feedback", json("POST", { ...valid, turnstileToken: "tok" }));
      expect(ok.status).toBe(201);
      expect(turnstile.verify).toHaveBeenLastCalledWith("tok", "1.1.1.1");
    });

    it("skips Turnstile for signed-in senders and stores their id", async () => {
      turnstile.isEnabled.mockReturnValue(true);
      const res = await mount().request("/feedback", json("POST", valid));
      expect(res.status).toBe(201);
      expect(turnstile.verify).not.toHaveBeenCalled();
      const [row] = await db.select().from(schema.feedback);
      expect(row).toMatchObject({ userId: "u1", contactEmail: "ana@example.test", ipHash: null });
    });

    it("answers 429 on the 4th post inside the window", async () => {
      const app = mount();
      for (let i = 0; i < 3; i++) expect((await app.request("/feedback", json("POST", valid))).status).toBe(201);
      const blocked = await app.request("/feedback", json("POST", valid));
      expect(blocked.status).toBe(429);
      expect(await blocked.json()).toMatchObject({ error: { code: "RATE_LIMITED" } });
      expect(await db.select().from(schema.feedback)).toHaveLength(3);
    });

    it("rejects a too-short message with a validation error", async () => {
      const res = await mount().request("/feedback", json("POST", { ...valid, message: "  hi " }));
      expect(res.status).toBe(400);
      expect(await res.json()).toMatchObject({ error: { code: "VALIDATION_ERROR" } });
    });
  });

  describe("admin routes", () => {
    const seed = async () => {
      const [row] = await db.insert(schema.feedback).values({ category: "OTHER", message: "hola mundo" }).returning();
      return row!.id;
    };

    it("answers 403 to a normal user and 401 to anonymous", async () => {
      const id = await seed();
      const app = mount();
      expect((await app.request("/admin/feedback")).status).toBe(403);
      expect((await app.request(`/admin/feedback/${id}`, json("PATCH", { status: "RESOLVED" }))).status).toBe(403);
      expect((await mount({ session: null }).request("/admin/feedback")).status).toBe(401);
    });

    it("lets an admin list, filter and resolve", async () => {
      const id = await seed();
      const app = mount({ admin: true });
      const list = await app.request("/admin/feedback");
      expect(list.status).toBe(200);
      expect(await list.json()).toMatchObject({ items: [{ id, status: "OPEN", sender: null }] });
      expect(((await (await app.request("/admin/feedback?status=RESOLVED")).json()) as { items: unknown[] }).items).toHaveLength(0);
      expect((await app.request("/admin/feedback?status=NOPE")).status).toBe(400);

      const patched = await app.request(`/admin/feedback/${id}`, json("PATCH", { status: "RESOLVED" }));
      expect(patched.status).toBe(200);
      expect((await db.select().from(schema.feedback))[0]!.status).toBe("RESOLVED");
    });

    it("does not write when the status is unchanged and 404s an unknown id", async () => {
      const id = await seed();
      const app = mount({ admin: true });
      const update = vi.spyOn(db, "update");
      expect((await app.request(`/admin/feedback/${id}`, json("PATCH", { status: "OPEN" }))).status).toBe(200);
      expect(update).not.toHaveBeenCalled();
      const missing = await app.request("/admin/feedback/00000000-0000-4000-8000-000000000000", json("PATCH", { status: "OPEN" }));
      expect(missing.status).toBe(404);
    });
  });
});
