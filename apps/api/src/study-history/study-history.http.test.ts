import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { schema } from "@sala/database";
import { env } from "../env.js";
import { baseHeaders, buildTestApp } from "../http/test-app.js";

async function signUp(app: ReturnType<typeof buildTestApp>["app"], key: string) {
  const res = await app.request("/api/auth/sign-up/email", {
    method: "POST",
    headers: baseHeaders({ "content-type": "application/json" }),
    body: JSON.stringify({ email: `${key}@example.test`, password: "correct-horse-battery", name: key }),
  });
  expect(res.status).toBe(200);
  const body = (await res.json()) as { user: { id: string } };
  return { id: body.user.id, cookie: res.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ") };
}

describe("GET /me/study-history", () => {
  const priorToken = env.mpAccessToken;
  let ctx: ReturnType<typeof buildTestApp>;
  let free: { id: string; cookie: string };
  let paid: { id: string; cookie: string };

  const get = (path: string, cookie?: string) => ctx.app.request(`/api/v1${path}`, { headers: baseHeaders(cookie ? { cookie } : {}) });

  beforeAll(async () => {
    env.mpAccessToken = "test-token"; // subscriptions enabled: the container reads it at build time
    ctx = buildTestApp();
    free = await signUp(ctx.app, "hfree");
    paid = await signUp(ctx.app, "hpaid");
    await ctx.db.insert(schema.userSubscriptions).values({ userId: paid.id, providerSubscriptionId: "sub-h", status: "authorized" });
  });

  afterAll(() => {
    env.mpAccessToken = priorToken;
  });

  it("401 anonymous, 403 PRO_REQUIRED for a free user", async () => {
    expect((await get("/me/study-history")).status).toBe(401);
    const res = await get("/me/study-history", free.cookie);
    expect(res.status).toBe(403);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe("PRO_REQUIRED");
  });

  it("returns the 30-day shape for a Pro user", async () => {
    const res = await get("/me/study-history", paid.cookie);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { days: number; byDay: unknown[]; byWeekday: unknown[]; byHour: unknown[] };
    expect(body.days).toBe(30);
    expect(body.byDay).toHaveLength(30);
    expect(body.byWeekday).toHaveLength(7);
    expect(body.byHour).toHaveLength(24);
  });

  it("supports days=90", async () => {
    const body = (await (await get("/me/study-history?days=90", paid.cookie)).json()) as { byDay: unknown[] };
    expect(body.byDay).toHaveLength(90);
  });

  it("rejects an unsupported window", async () => {
    expect((await get("/me/study-history?days=7", paid.cookie)).status).toBe(400);
  });
});
