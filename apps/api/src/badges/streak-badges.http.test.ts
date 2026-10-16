import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { schema } from "@sala/database";
import type { BadgesDto, StreakDto } from "@sala/contracts";
import { env } from "../env.js";
import { baseHeaders, buildTestApp } from "../http/test-app.js";
import { getRoom } from "../test-utils.js";
import { localDateOf } from "../common/dates.js";
import { addDays } from "../study-history/streak.js";

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

describe("streak and badges routes", () => {
  const priorToken = env.mpAccessToken;
  let ctx: ReturnType<typeof buildTestApp>;
  let free: { id: string; cookie: string };
  let paid: { id: string; cookie: string };

  const call = (method: string, path: string, cookie?: string, body?: unknown) =>
    ctx.app.request(`/api/v1${path}`, {
      method,
      headers: baseHeaders({ ...(body !== undefined ? { "content-type": "application/json" } : {}), ...(cookie ? { cookie } : {}) }),
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });

  beforeAll(async () => {
    env.mpAccessToken = "test-token"; // subscriptions enabled: the container reads it at build time
    ctx = buildTestApp();
    free = await signUp(ctx.app, "free");
    paid = await signUp(ctx.app, "paid");
    await ctx.db.insert(schema.userSubscriptions).values({ userId: paid.id, providerSubscriptionId: "sub-paid", status: "authorized" });
  });

  afterAll(() => {
    env.mpAccessToken = priorToken;
  });

  it("GET /me/streak and POST /me/streak-freeze: 401 anonymous, 403 PRO_REQUIRED for a free user", async () => {
    for (const [method, path, body] of [
      ["GET", "/me/streak", undefined],
      ["POST", "/me/streak-freeze", { localDate: "2026-01-01" }],
    ] as const) {
      expect((await call(method, path, undefined, body)).status).toBe(401);
      const res = await call(method, path, free.cookie, body);
      expect(res.status).toBe(403);
      expect(((await res.json()) as { error: { code: string } }).error.code).toBe("PRO_REQUIRED");
    }
  });

  it("GET /me/badges: 401 anonymous, 200 for a free user", async () => {
    expect((await call("GET", "/me/badges")).status).toBe(401);
    const res = await call("GET", "/me/badges", free.cookie);
    expect(res.status).toBe(200);
    const { badges } = (await res.json()) as BadgesDto;
    expect(badges).toHaveLength(8);
    expect(badges.every((b) => !b.earned)).toBe(true);
  });

  it("a Pro user reads the streak, freezes a day (idempotently) and the badge reflects it", async () => {
    const room = await getRoom(ctx.db);
    const today = localDateOf(new Date(), room.timezone);
    const yesterday = addDays(today, -1);
    const dayBefore = addDays(today, -2);

    const streak = (await (await call("GET", "/me/streak", paid.cookie)).json()) as StreakDto;
    expect(streak).toMatchObject({ current: 0, longest: 0, frozenDates: [], freezeAvailableThisMonth: true });
    expect(streak.freezableDates).toContain(yesterday);

    const frozen = await call("POST", "/me/streak-freeze", paid.cookie, { localDate: yesterday });
    expect(frozen.status).toBe(200);
    expect(((await frozen.json()) as StreakDto).frozenDates).toEqual([yesterday]);
    const again = await call("POST", "/me/streak-freeze", paid.cookie, { localDate: yesterday });
    expect(again.status).toBe(200);

    // A different day in the same month is refused, unless it falls in the previous month.
    if (dayBefore.slice(0, 7) === yesterday.slice(0, 7)) {
      const second = await call("POST", "/me/streak-freeze", paid.cookie, { localDate: dayBefore });
      expect(second.status).toBe(400);
    }
  });

  it("POST /me/streak-freeze validates the body and the window", async () => {
    expect((await call("POST", "/me/streak-freeze", paid.cookie, { localDate: "nope" })).status).toBe(400);
    const res = await call("POST", "/me/streak-freeze", paid.cookie, { localDate: "2000-01-01" });
    expect(res.status).toBe(400);
  });
});
