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

describe("/me/weekly-goal", () => {
  const priorToken = env.mpAccessToken;
  let ctx: ReturnType<typeof buildTestApp>;
  let free: { id: string; cookie: string };
  let paid: { id: string; cookie: string };

  const call = (method: string, cookie?: string, body?: unknown) =>
    ctx.app.request("/api/v1/me/weekly-goal", {
      method,
      headers: baseHeaders({ ...(body !== undefined ? { "content-type": "application/json" } : {}), ...(cookie ? { cookie } : {}) }),
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });

  beforeAll(async () => {
    env.mpAccessToken = "test-token";
    ctx = buildTestApp();
    free = await signUp(ctx.app, "free");
    paid = await signUp(ctx.app, "paid");
    await ctx.db.insert(schema.userSubscriptions).values({ userId: paid.id, providerSubscriptionId: "sub-paid", status: "authorized" });
  });

  afterAll(() => {
    env.mpAccessToken = priorToken;
  });

  it("is 401 anonymous and 403 PRO_REQUIRED for a free user", async () => {
    for (const [method, body] of [["GET"], ["PUT", { minutes: 300 }]] as const) {
      expect((await call(method, undefined, body)).status).toBe(401);
      const res = await call(method, free.cookie, body);
      expect(res.status).toBe(403);
      expect(((await res.json()) as { error: { code: string } }).error.code).toBe("PRO_REQUIRED");
    }
  });

  it("round trips for a Pro user", async () => {
    const empty = await call("GET", paid.cookie);
    expect(empty.status).toBe(200);
    expect(await empty.json()).toMatchObject({ goalMinutes: null, reminderEnabled: true, studiedMinutes: 0 });

    const put = await call("PUT", paid.cookie, { minutes: 420, reminderEnabled: false });
    expect(put.status).toBe(200);
    expect(await put.json()).toMatchObject({ goalMinutes: 420, reminderEnabled: false });
    expect(await (await call("GET", paid.cookie)).json()).toMatchObject({ goalMinutes: 420, reminderEnabled: false });

    expect(await (await call("PUT", paid.cookie, { minutes: null })).json()).toMatchObject({ goalMinutes: null, reminderEnabled: true });
  });

  it("rejects goals out of bounds", async () => {
    expect((await call("PUT", paid.cookie, { minutes: 30 })).status).toBe(400);
    expect((await call("PUT", paid.cookie, { minutes: 4201 })).status).toBe(400);
  });
});
