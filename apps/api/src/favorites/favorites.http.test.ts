import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { schema } from "@sala/database";
import { env } from "../env.js";
import { baseHeaders, buildTestApp } from "../http/test-app.js";
import { getRoom, getSeats } from "../test-utils.js";

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

describe("favorites routes", () => {
  const priorToken = env.mpAccessToken;
  let ctx: ReturnType<typeof buildTestApp>;
  let free: { id: string; cookie: string };
  let paid: { id: string; cookie: string };
  let path: string;
  let seatIds: string[];

  const call = (method: string, cookie?: string, body?: unknown) =>
    ctx.app.request(`/api/v1${path}`, {
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
    path = `/rooms/${(await getRoom(ctx.db)).slug}/favorites`;
    seatIds = (await getSeats(ctx.db)).map((s) => s.id);
  });

  afterAll(() => {
    env.mpAccessToken = priorToken;
  });

  it("answers 401 anonymous and 403 PRO_REQUIRED for a free user", async () => {
    expect((await call("GET")).status).toBe(401);
    for (const res of [await call("GET", free.cookie), await call("PUT", free.cookie, { seatIds: [seatIds[0]] })]) {
      expect(res.status).toBe(403);
      expect(((await res.json()) as { error: { code: string } }).error.code).toBe("PRO_REQUIRED");
    }
  });

  it("round-trips for a Pro user", async () => {
    expect(await (await call("GET", paid.cookie)).json()).toEqual({ seatIds: [] });
    const put = await call("PUT", paid.cookie, { seatIds: [seatIds[0], seatIds[1]] });
    expect(put.status).toBe(200);
    expect(await (await call("GET", paid.cookie)).json()).toEqual({ seatIds: [seatIds[0], seatIds[1]] });
    expect(await (await call("PUT", paid.cookie, { seatIds: [] })).json()).toEqual({ seatIds: [] });
  });

  it("rejects foreign seats and more than 3 favorites", async () => {
    expect((await call("PUT", paid.cookie, { seatIds: ["nope"] })).status).toBe(400);
    expect((await call("PUT", paid.cookie, { seatIds: seatIds.slice(0, 4) })).status).toBe(400);
  });
});
