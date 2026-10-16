import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { schema } from "@sala/database";
import { env } from "../env.js";
import { baseHeaders, buildTestApp } from "../http/test-app.js";

describe("GET /rooms/:idOrSlug/forecast", () => {
  const priorToken = env.mpAccessToken;
  let ctx: ReturnType<typeof buildTestApp>;
  let free: string;
  let paid: string;

  async function signUp(key: string) {
    const res = await ctx.app.request("/api/auth/sign-up/email", {
      method: "POST",
      headers: baseHeaders({ "content-type": "application/json" }),
      body: JSON.stringify({ email: `${key}@example.test`, password: "correct-horse-battery", name: key }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { user: { id: string } };
    return { id: body.user.id, cookie: res.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ") };
  }

  const get = (slug: string, cookie?: string) =>
    ctx.app.request(`/api/v1/rooms/${slug}/forecast`, { headers: baseHeaders(cookie ? { cookie } : {}) });

  beforeAll(async () => {
    env.mpAccessToken = "test-token";
    ctx = buildTestApp();
    free = (await signUp("free")).cookie;
    const p = await signUp("paid");
    paid = p.cookie;
    await ctx.db.insert(schema.userSubscriptions).values({ userId: p.id, providerSubscriptionId: "sub-paid", status: "authorized" });
  });

  afterAll(() => {
    env.mpAccessToken = priorToken;
  });

  it("is 401 for anonymous and 403 PRO_REQUIRED for a free user", async () => {
    const slug = (await ctx.db.select().from(schema.rooms))[0]!.slug;
    expect((await get(slug)).status).toBe(401);
    const res = await get(slug, free);
    expect(res.status).toBe(403);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe("PRO_REQUIRED");
  });

  it("returns the empty forecast for a Pro user, 404 for an unknown room", async () => {
    const slug = (await ctx.db.select().from(schema.rooms))[0]!.slug;
    const res = await get(slug, paid);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { computedAt: string | null; grid: unknown[][] };
    expect(body.computedAt).toBeNull();
    expect(body.grid).toHaveLength(7);
    expect((await get("no-such-room", paid)).status).toBe(404);
  });
});
