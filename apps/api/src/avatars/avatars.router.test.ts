import { eq } from "drizzle-orm";
import { createHash } from "node:crypto";
import { Hono } from "hono";
import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@sala/database";
import { schema } from "@sala/database";
import { toErrorResponse } from "../common/api-error.js";
import type { AppEnv } from "../http/context.js";
import type { Services } from "../services.js";
import { freshDb, insertUsers } from "../test-utils.js";
import { RestrictionService } from "../users/restriction.service.js";
import { AvatarsService } from "./avatars.service.js";
import { avatarsRouter } from "./avatars.router.js";

const JPEG_BASE64 = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]).toString("base64");

describe("avatarsRouter GET /avatars/:userId", () => {
  let db: Db;
  let app: Hono<AppEnv>;

  /** `x-viewer` picks the session user; absent means anonymous. */
  const get = (userId: string, viewer?: string, query = "") =>
    app.request(`/avatars/${userId}${query}`, { headers: viewer ? { "x-viewer": viewer } : {} });

  beforeEach(async () => {
    db = freshDb();
    await insertUsers(db, ["u1", "u2"]);
    const avatars = new AvatarsService(db, new RestrictionService(db));
    await avatars.upload("u1", { mimeType: "image/jpeg", base64: JPEG_BASE64 });
    const services = { avatars, restriction: { activeRestrictions: async () => [] }, rateLimit: { check: async () => ({ allowed: true }) } } as unknown as Services;
    app = new Hono<AppEnv>();
    app.use("*", async (c, next) => {
      const viewer = c.req.header("x-viewer");
      c.set("services", services);
      c.set("auth", { api: { getSession: async () => (viewer ? { user: { id: viewer, name: viewer, email: `${viewer}@x.test` } } : null) } } as never);
      c.set("ip", "1.1.1.1");
      c.set("user", null);
      await next();
    });
    app.onError((err, c) => {
      const r = toErrorResponse(err, { method: c.req.method, path: c.req.path });
      return c.json(r.body, r.status as never);
    });
    app.route("/", avatarsRouter);
  });

  it("serves the owner their hidden photo with private/Vary: Cookie headers", async () => {
    const res = await get("u1", "u1");
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("private, no-cache");
    expect(res.headers.get("Vary")).toBe("Cookie");
    expect(res.headers.get("Content-Type")).toBe("image/jpeg");
    expect(Buffer.from(await res.arrayBuffer()).toString("base64")).toBe(JPEG_BASE64);
  });

  it("404s anonymous and other users while show_avatar is off", async () => {
    expect((await get("u1")).status).toBe(404);
    expect((await get("u1", "u2")).status).toBe(404);
  });

  it("serves others once show_avatar is on, still with private cache headers", async () => {
    await db.insert(schema.userPrivacySettings).values({ userId: "u1", showAvatar: true });
    await db.update(schema.userProfiles).set({ identityMode: "FIRST_NAME", firstName: "Ana" }).where(eq(schema.userProfiles.userId, "u1"));
    const res = await get("u1", "u2");
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("private, no-cache");
    expect(res.headers.get("Vary")).toBe("Cookie");
  });

  it("sends immutable caching when v matches the current content hash", async () => {
    const sha = createHash("sha256").update(Buffer.from(JPEG_BASE64, "base64")).digest("hex").slice(0, 12);
    const res = await get("u1", "u1", `?v=${sha}`);
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("private, max-age=31536000, immutable");
    expect(res.headers.get("Vary")).toBe("Cookie");
    expect(res.headers.get("ETag")).not.toBeNull();
  });

  it("keeps no-cache when v is stale", async () => {
    const res = await get("u1", "u1", "?v=deadbeef0000");
    expect(res.headers.get("Cache-Control")).toBe("private, no-cache");
  });

  it("answers 304 when If-None-Match matches", async () => {
    const first = await get("u1", "u1");
    const res = await app.request("/avatars/u1", { headers: { "x-viewer": "u1", "if-none-match": first.headers.get("ETag")! } });
    expect(res.status).toBe(304);
  });

  it("404s a hidden avatar for non-owners even with a matching v, without immutable", async () => {
    const sha = createHash("sha256").update(Buffer.from(JPEG_BASE64, "base64")).digest("hex").slice(0, 12);
    const res = await get("u1", "u2", `?v=${sha}`);
    expect(res.status).toBe(404);
    expect(res.headers.get("Cache-Control")).toBeNull();
  });
});
