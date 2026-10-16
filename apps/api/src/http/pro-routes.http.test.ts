import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { schema } from "@sala/database";
import { env } from "../env.js";
import { baseHeaders, buildTestApp } from "./test-app.js";

const UUID = "123e4567-e89b-42d3-a456-426614174000";

// [method, path, body] for every Pro-gated route; the guard answers before the body is looked at.
const PRO_ROUTES: Array<[string, string, unknown?]> = [
  ["GET", "/rooms/sala/seat-watch"],
  ["PUT", "/rooms/sala/seat-watch", { seatIds: ["s1"] }],
  ["GET", "/me/study-history"],
  ["GET", "/rooms/sala/forecast"],
  ["GET", "/rooms/sala/favorites"],
  ["PUT", "/rooms/sala/favorites", { seatIds: ["s1"] }],
  ["GET", `/groups/${UUID}/presence`],
  ["POST", `/groups/${UUID}/focus`, { minutes: 25 }],
  ["DELETE", `/groups/${UUID}/focus`],
  ["GET", "/me/weekly-goal"],
  ["PUT", "/me/weekly-goal", { minutes: 300 }],
  ["GET", "/me/streak"],
  ["POST", "/me/streak-freeze", { localDate: "2026-10-15" }],
  ["GET", "/me/exams"],
  ["POST", "/me/exams", { subject: "Algebra", examDate: "2026-12-01", targetHours: 20 }],
  ["PATCH", `/me/exams/${UUID}`, { targetHours: 10 }],
  ["DELETE", `/me/exams/${UUID}`],
];

// Auth-only routes: anonymous gets 401, a free user is not turned away with PRO_REQUIRED.
const OPEN_ROUTES: Array<[string, string, unknown?]> = [
  ["DELETE", "/rooms/sala/seat-watch"],
  ["PUT", `/groups/${UUID}/seat-share`, { share: false }],
  ["GET", "/me/badges"],
];

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

function call(app: ReturnType<typeof buildTestApp>["app"], [method, path, body]: [string, string, unknown?], cookie?: string) {
  return app.request(`/api/v1${path}`, {
    method,
    headers: baseHeaders({ ...(body !== undefined ? { "content-type": "application/json" } : {}), ...(cookie ? { cookie } : {}) }),
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

describe("Pro routes", () => {
  const priorToken = env.mpAccessToken;
  let ctx: ReturnType<typeof buildTestApp>;
  let free: { id: string; cookie: string };
  let paid: { id: string; cookie: string };

  beforeAll(async () => {
    env.mpAccessToken = "test-token"; // subscriptions enabled: the container reads it at build time
    ctx = buildTestApp();
    free = await signUp(ctx.app, "free");
    paid = await signUp(ctx.app, "paid");
    await ctx.db.insert(schema.userSubscriptions).values({ userId: paid.id, providerSubscriptionId: "sub-paid", status: "authorized" });
  });

  afterEach(() => {
    env.mpAccessToken = "test-token";
  });

  it.each(PRO_ROUTES)("%s %s: 401 anonymous, 403 PRO_REQUIRED for a free user", async (...route) => {
    expect((await call(ctx.app, route)).status).toBe(401);
    const res = await call(ctx.app, route, free.cookie);
    expect(res.status).toBe(403);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe("PRO_REQUIRED");
  });

  it.each(PRO_ROUTES)("%s %s: a Pro user gets past the guard", async (...route) => {
    const res = await call(ctx.app, route, paid.cookie);
    expect(res.status).not.toBe(401);
    expect(res.status).not.toBe(403);
  });

  it.each(OPEN_ROUTES)("%s %s: 401 anonymous, not Pro-gated", async (...route) => {
    expect((await call(ctx.app, route)).status).toBe(401);
    const res = await call(ctx.app, route, free.cookie);
    expect(res.status).not.toBe(401);
    expect(res.status).not.toBe(403);
  });

  it("GET /me reports pro and adFree separately", async () => {
    const me = async (cookie?: string) => (await (await call(ctx.app, ["GET", "/me"], cookie)).json()) as { pro: boolean; adFree: boolean };
    expect(await me()).toMatchObject({ pro: false, adFree: false });
    expect(await me(free.cookie)).toMatchObject({ pro: false, adFree: false });
    expect(await me(paid.cookie)).toMatchObject({ pro: true, adFree: true });
  });

  it("GET /me: with subscriptions disabled everyone is Pro but ads still show", async () => {
    env.mpAccessToken = "";
    const res = await call(ctx.app, ["GET", "/me"], free.cookie);
    expect(await res.json()).toMatchObject({ pro: true, adFree: false, subscriptionsEnabled: false });
  });

  it("GET /me: a cancelled subscription stays ad-free until its period ends", async () => {
    const { db } = ctx;
    const future = new Date(Date.now() + 7 * 86_400_000);
    await db.update(schema.userSubscriptions).set({ status: "cancelled", currentPeriodEnd: future });
    const res = await call(ctx.app, ["GET", "/me"], paid.cookie);
    expect(await res.json()).toMatchObject({ pro: true, adFree: true });
    await db.update(schema.userSubscriptions).set({ currentPeriodEnd: new Date(Date.now() - 86_400_000) });
    expect(await (await call(ctx.app, ["GET", "/me"], paid.cookie)).json()).toMatchObject({ pro: false, adFree: false });
    await db.update(schema.userSubscriptions).set({ status: "authorized", currentPeriodEnd: null });
  });

  it("restores the env", () => {
    env.mpAccessToken = priorToken;
    expect(env.mpAccessToken).toBe(priorToken);
  });
});
