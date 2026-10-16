import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { schema } from "@sala/database";
import { env } from "../env.js";
import { baseHeaders, buildTestApp } from "../http/test-app.js";
import { getRoom } from "../test-utils.js";

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

describe("quiet-watch routes", () => {
  const priorToken = env.mpAccessToken;
  let ctx: ReturnType<typeof buildTestApp>;
  let free: { id: string; cookie: string };
  let paid: { id: string; cookie: string };
  let path: string;

  const call = (method: string, cookie?: string, body?: unknown) =>
    ctx.app.request(`/api/v1${path}`, {
      method,
      headers: baseHeaders({ ...(body !== undefined ? { "content-type": "application/json" } : {}), ...(cookie ? { cookie } : {}) }),
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });

  beforeAll(async () => {
    env.mpAccessToken = "test-token";
    ctx = buildTestApp();
    free = await signUp(ctx.app, "qfree");
    paid = await signUp(ctx.app, "qpaid");
    await ctx.db.insert(schema.userSubscriptions).values({ userId: paid.id, providerSubscriptionId: "sub-qpaid", status: "authorized" });
    path = `/rooms/${(await getRoom(ctx.db)).slug}/quiet-watch`;
  });

  afterAll(() => {
    env.mpAccessToken = priorToken;
  });

  it("answers 401 to anonymous callers", async () => {
    for (const method of ["GET", "DELETE"]) expect((await call(method)).status).toBe(401);
    expect((await call("PUT", undefined, { thresholdPct: 50 })).status).toBe(401);
  });

  it("answers 403 PRO_REQUIRED to a free user on GET and PUT", async () => {
    for (const res of [await call("GET", free.cookie), await call("PUT", free.cookie, { thresholdPct: 50 })]) {
      expect(res.status).toBe(403);
      expect(((await res.json()) as { error: { code: string } }).error.code).toBe("PRO_REQUIRED");
    }
  });

  it("lets a free user clear a watch (DELETE is not Pro-gated)", async () => {
    expect((await call("DELETE", free.cookie)).status).toBe(204);
  });

  it("rejects an unsupported threshold with 400", async () => {
    expect((await call("PUT", paid.cookie, { thresholdPct: 40 })).status).toBe(400);
  });

  it("lets a paid user create, read and delete a watch", async () => {
    const put = await call("PUT", paid.cookie, { thresholdPct: 50 });
    expect(put.status).toBe(200);
    expect(((await put.json()) as { watch: { thresholdPct: number } }).watch.thresholdPct).toBe(50);

    const get = await call("GET", paid.cookie);
    expect(((await get.json()) as { watch: { thresholdPct: number } | null }).watch?.thresholdPct).toBe(50);

    expect((await call("DELETE", paid.cookie)).status).toBe(204);
    expect(((await (await call("GET", paid.cookie)).json()) as { watch: unknown }).watch).toBeNull();
  });
});
