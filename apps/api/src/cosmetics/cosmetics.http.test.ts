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

describe("cosmetics routes", () => {
  const priorToken = env.mpAccessToken;
  let ctx: ReturnType<typeof buildTestApp>;
  let free: { id: string; cookie: string };
  let paid: { id: string; cookie: string };

  const call = (method: string, cookie?: string, body?: unknown) =>
    ctx.app.request("/api/v1/me/cosmetics", {
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

  it("answers 401 to anonymous callers", async () => {
    expect((await call("GET")).status).toBe(401);
    expect((await call("PUT", undefined, { frame: "gold", nameColor: "ocean" })).status).toBe(401);
  });

  it("lets a free user read defaults but answers 403 PRO_REQUIRED on PUT", async () => {
    expect(await (await call("GET", free.cookie)).json()).toEqual({ frame: "none", nameColor: "default", visibleToOthers: false });
    const res = await call("PUT", free.cookie, { frame: "gold", nameColor: "ocean" });
    expect(res.status).toBe(403);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe("PRO_REQUIRED");
  });

  it("saves and returns the choice for a paid user", async () => {
    const put = await call("PUT", paid.cookie, { frame: "gold", nameColor: "ocean" });
    expect(put.status).toBe(200);
    expect(await put.json()).toMatchObject({ frame: "gold", nameColor: "ocean" });
    expect(await (await call("GET", paid.cookie)).json()).toMatchObject({ frame: "gold", nameColor: "ocean" });
  });

  it("rejects unknown enum values with 400", async () => {
    expect((await call("PUT", paid.cookie, { frame: "rainbow", nameColor: "ocean" })).status).toBe(400);
    expect((await call("PUT", paid.cookie, { frame: "gold", nameColor: "pink" })).status).toBe(400);
    expect((await call("PUT", paid.cookie, { frame: "gold" })).status).toBe(400);
  });
});
