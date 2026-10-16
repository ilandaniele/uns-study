import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { schema } from "@sala/database";
import { env } from "../env.js";
import { isMissingSchemaError } from "../common/sqlite-errors.js";
import { getRoom } from "../test-utils.js";
import { baseHeaders, buildTestApp } from "./test-app.js";

// Tables created by migration 0003_pro_features. The DO can be booted on a database migrated only
// through 0002 (write cap, failed migration), so these Pro reads must degrade to defaults, never 500.
const PRO_0003_TABLES = [
  "favorite_seats",
  "group_focus_timers",
  "group_seat_share_optouts",
  "room_occupancy_forecast",
  "seat_watches",
  "streak_freezes",
  "study_goals",
  "user_exams",
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

describe("Pro GET endpoints on a database without migration 0003", () => {
  const priorToken = env.mpAccessToken;
  let ctx: ReturnType<typeof buildTestApp>;
  let roomSlug: string;
  let paid: { id: string; cookie: string };

  beforeAll(async () => {
    env.mpAccessToken = "test-token"; // subscriptions enabled, so the paid user is Pro for real
    ctx = buildTestApp();
    const { db } = ctx;
    // Simulate "migrated only through 0002": 0003 only creates new tables, so dropping them is equivalent.
    for (const table of PRO_0003_TABLES) db.run(sql.raw(`DROP TABLE IF EXISTS ${table}`));
    roomSlug = (await getRoom(db)).slug;
    paid = await signUp(ctx.app, "paid-old-schema");
    await db.insert(schema.userSubscriptions).values({ userId: paid.id, providerSubscriptionId: "sub-old-schema", status: "authorized" });
  });

  afterAll(() => {
    env.mpAccessToken = priorToken;
  });

  it("the 0003 tables are really gone", () => {
    for (const table of PRO_0003_TABLES) {
      let thrown: unknown;
      try {
        ctx.db.run(sql.raw(`SELECT 1 FROM ${table}`));
      } catch (err) {
        thrown = err;
      }
      expect(thrown, `${table} should be missing`).toBeDefined();
      expect(isMissingSchemaError(thrown)).toBe(true);
    }
  });

  it("GET /api/v1/me still reports the Pro user as pro", async () => {
    const res = await ctx.app.request("/api/v1/me", { headers: baseHeaders({ cookie: paid.cookie }) });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ pro: true });
  });

  it.each([
    "/me/study-history",
    "/me/weekly-goal",
    "/me/badges",
    "/me/exams",
    "/rooms/:slug/forecast",
    "/rooms/:slug/favorites",
  ])("GET %s serves defaults (200), not a 500", async (template) => {
    const path = template.replace(":slug", roomSlug);
    const res = await ctx.app.request(`/api/v1${path}`, { headers: baseHeaders({ cookie: paid.cookie }) });
    expect(res.status).toBe(200);
  });
});
