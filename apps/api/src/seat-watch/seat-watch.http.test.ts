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

describe("seat-watch routes", () => {
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
    path = `/rooms/${(await getRoom(ctx.db)).slug}/seat-watch`;
    seatIds = (await getSeats(ctx.db)).map((s) => s.id);
  });

  afterAll(() => {
    env.mpAccessToken = priorToken;
  });

  it("answers 401 to anonymous callers", async () => {
    for (const method of ["GET", "DELETE"]) expect((await call(method)).status).toBe(401);
    expect((await call("PUT", undefined, { seatIds: [seatIds[0]] })).status).toBe(401);
  });

  it("answers 403 PRO_REQUIRED to a free user on GET and PUT", async () => {
    for (const res of [await call("GET", free.cookie), await call("PUT", free.cookie, { seatIds: [seatIds[0]] })]) {
      expect(res.status).toBe(403);
      expect(((await res.json()) as { error: { code: string } }).error.code).toBe("PRO_REQUIRED");
    }
  });

  it("lets a free user clear a watch (DELETE is not Pro-gated)", async () => {
    expect((await call("DELETE", free.cookie)).status).toBe(204);
  });

  it("round-trips PUT, GET and DELETE for a Pro user", async () => {
    expect(await (await call("GET", paid.cookie)).json()).toEqual({ watch: null });

    const put = await call("PUT", paid.cookie, { seatIds: [seatIds[1], seatIds[0]] });
    expect(put.status).toBe(200);
    const { watch } = (await put.json()) as { watch: { seatIds: string[]; expiresAt: string } };
    expect(watch.seatIds.sort()).toEqual([seatIds[0], seatIds[1]].sort());

    const got = (await (await call("GET", paid.cookie)).json()) as { watch: { seatIds: string[] } | null };
    expect(got.watch?.seatIds.sort()).toEqual(watch.seatIds.sort());

    expect((await call("DELETE", paid.cookie)).status).toBe(204);
    expect(await (await call("GET", paid.cookie)).json()).toEqual({ watch: null });
  });

  it("rejects 13 seats and foreign seats with 400", async () => {
    expect((await call("PUT", paid.cookie, { seatIds: seatIds.slice(0, 13) })).status).toBe(400);
    expect((await call("PUT", paid.cookie, { seatIds: ["nope"] })).status).toBe(400);
    expect((await call("PUT", paid.cookie, { seatIds: [] })).status).toBe(400);
  });
});
