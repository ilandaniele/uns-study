import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { schema } from "@sala/database";
import { env } from "../env.js";
import { baseHeaders, buildTestApp } from "../http/test-app.js";

const GROUP = "11111111-1111-4111-8111-111111111111";

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

describe("group ranking route", () => {
  const priorToken = env.mpAccessToken;
  let ctx: ReturnType<typeof buildTestApp>;
  let free: { id: string; cookie: string };
  let paid: { id: string; cookie: string };
  let outsider: { id: string; cookie: string };

  const call = (path: string, cookie?: string) =>
    ctx.app.request(`/api/v1${path}`, { headers: baseHeaders(cookie ? { cookie } : {}) });

  beforeAll(async () => {
    env.mpAccessToken = "test-token";
    ctx = buildTestApp();
    free = await signUp(ctx.app, "free");
    paid = await signUp(ctx.app, "paid");
    outsider = await signUp(ctx.app, "outsider");
    await ctx.db.insert(schema.userSubscriptions).values([
      { userId: paid.id, providerSubscriptionId: "sub-paid", status: "authorized" },
      { userId: outsider.id, providerSubscriptionId: "sub-outsider", status: "authorized" },
    ]);
    await ctx.db.insert(schema.groupConversations).values({ id: GROUP, name: "Estudio", createdBy: paid.id });
    await ctx.db.insert(schema.groupMembers).values([
      { groupId: GROUP, userId: paid.id, role: "OWNER" },
      { groupId: GROUP, userId: free.id },
    ]);
    await ctx.db.insert(schema.userProfiles).values({ userId: paid.id });
  });

  afterAll(() => {
    env.mpAccessToken = priorToken;
  });

  it("answers 401 to anonymous callers", async () => {
    expect((await call(`/groups/${GROUP}/rankings`)).status).toBe(401);
  });

  it("answers 403 PRO_REQUIRED to a free user, even a group member", async () => {
    const res = await call(`/groups/${GROUP}/rankings`, free.cookie);
    expect(res.status).toBe(403);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe("PRO_REQUIRED");
  });

  it("answers 200 with private, no-store caching to a paid member", async () => {
    const res = await call(`/groups/${GROUP}/rankings?period=week&category=streak`, paid.cookie);
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    const body = (await res.json()) as { groupId: string; groupName: string; period: string; category: string; entries: unknown[] };
    expect(body).toMatchObject({ groupId: GROUP, groupName: "Estudio", period: "week", category: "streak" });
    expect(body.entries).toHaveLength(1);
  });

  it("answers 404 to a paid user who is not a member of the group", async () => {
    const res = await call(`/groups/${GROUP}/rankings`, outsider.cookie);
    expect(res.status).toBe(404);
  });

  it("answers 400 to a non-UUID group id", async () => {
    expect((await call("/groups/nope/rankings", paid.cookie)).status).toBe(400);
  });
});
