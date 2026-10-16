import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
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

describe("group study routes", () => {
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
  const code = async (res: Response) => ((await res.json()) as { error: { code: string } }).error.code;

  beforeAll(async () => {
    env.mpAccessToken = "test-token"; // subscriptions enabled: the container reads it at build time
    ctx = buildTestApp();
    free = await signUp(ctx.app, "free");
    paid = await signUp(ctx.app, "paid");
    await ctx.db.insert(schema.userSubscriptions).values({ userId: paid.id, providerSubscriptionId: "sub-paid", status: "authorized" });
    await ctx.db.insert(schema.groupConversations).values({ id: GROUP, name: "Estudio", createdBy: paid.id });
    await ctx.db.insert(schema.groupMembers).values([
      { groupId: GROUP, userId: paid.id, role: "OWNER" },
      { groupId: GROUP, userId: free.id, role: "MEMBER" },
    ]);
  });

  afterAll(() => {
    env.mpAccessToken = priorToken;
  });

  it("presence: 401 anonymous, 403 PRO_REQUIRED for free, 200 for Pro members, 404 for Pro non-members", async () => {
    expect((await call("GET", `/groups/${GROUP}/presence`)).status).toBe(401);
    const denied = await call("GET", `/groups/${GROUP}/presence`, free.cookie);
    expect(denied.status).toBe(403);
    expect(await code(denied)).toBe("PRO_REQUIRED");

    const ok = await call("GET", `/groups/${GROUP}/presence`, paid.cookie);
    expect(ok.status).toBe(200);
    expect(await ok.json()).toMatchObject({ members: [], sharing: true, focus: null });

    await ctx.db.delete(schema.groupMembers).where(eq(schema.groupMembers.userId, paid.id));
    expect((await call("GET", `/groups/${GROUP}/presence`, paid.cookie)).status).toBe(404);
    await ctx.db.insert(schema.groupMembers).values({ groupId: GROUP, userId: paid.id, role: "OWNER" });
  });

  it("seat-share works for a free member and is validated", async () => {
    expect((await call("PUT", `/groups/${GROUP}/seat-share`, undefined, { share: false })).status).toBe(401);
    expect((await call("PUT", `/groups/${GROUP}/seat-share`, free.cookie, { share: false })).status).toBe(204);
    expect(await ctx.db.select().from(schema.groupSeatShareOptouts)).toHaveLength(1);
    expect((await call("PUT", `/groups/${GROUP}/seat-share`, free.cookie, { share: "no" })).status).toBe(400);
    expect((await call("PUT", `/groups/${GROUP}/seat-share`, free.cookie, { share: true })).status).toBe(204);
    expect(await ctx.db.select().from(schema.groupSeatShareOptouts)).toHaveLength(0);
  });

  it("focus: 401 anonymous, 403 for free, start/stop round trip for Pro", async () => {
    expect((await call("POST", `/groups/${GROUP}/focus`, undefined, { minutes: 25 })).status).toBe(401);
    const denied = await call("POST", `/groups/${GROUP}/focus`, free.cookie, { minutes: 25 });
    expect(denied.status).toBe(403);
    expect(await code(denied)).toBe("PRO_REQUIRED");
    expect((await call("DELETE", `/groups/${GROUP}/focus`, free.cookie)).status).toBe(403);

    expect((await call("POST", `/groups/${GROUP}/focus`, paid.cookie, { minutes: 4 })).status).toBe(400);
    expect((await call("POST", `/groups/${GROUP}/focus`, paid.cookie, { minutes: 181 })).status).toBe(400);

    const started = await call("POST", `/groups/${GROUP}/focus`, paid.cookie, { minutes: 25 });
    expect(started.status).toBe(200);
    expect(await started.json()).toMatchObject({ startedBy: paid.id, minutes: 25 });

    const presence = await call("GET", `/groups/${GROUP}/presence`, paid.cookie);
    expect(((await presence.json()) as { focus: { minutes: number } | null }).focus).toMatchObject({ minutes: 25 });

    expect((await call("DELETE", `/groups/${GROUP}/focus`, paid.cookie)).status).toBe(204);
    const after = await call("GET", `/groups/${GROUP}/presence`, paid.cookie);
    expect(((await after.json()) as { focus: unknown }).focus).toBeNull();
  });
});
