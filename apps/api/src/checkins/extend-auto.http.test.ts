import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { schema } from "@sala/database";
import { and, eq } from "drizzle-orm";
import { env } from "../env.js";
import { baseHeaders, buildTestApp } from "../http/test-app.js";
import { getRoom, getSeats } from "../test-utils.js";

type Ctx = ReturnType<typeof buildTestApp>;

async function signUp(app: Ctx["app"], key: string) {
  const res = await app.request("/api/auth/sign-up/email", {
    method: "POST",
    headers: baseHeaders({ "content-type": "application/json" }),
    body: JSON.stringify({ email: `${key}@example.test`, password: "correct-horse-battery", name: key }),
  });
  expect(res.status).toBe(200);
  const body = (await res.json()) as { user: { id: string } };
  return { id: body.user.id, cookie: res.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ") };
}

describe("POST /checkins/current/extend with auto: true", () => {
  const priorToken = env.mpAccessToken;
  let ctx: Ctx;
  let free: { id: string; cookie: string };
  let paid: { id: string; cookie: string };
  let roomId: string;
  let seatIds: string[];
  let inside: { latitude: number; longitude: number; accuracy: number; capturedAt: string };
  let seatCursor = 0;

  beforeAll(async () => {
    env.mpAccessToken = "test-token"; // subscriptions enabled, so a free user is not Pro
    ctx = buildTestApp();
    free = await signUp(ctx.app, "autofree");
    paid = await signUp(ctx.app, "autopaid");
    await ctx.db.insert(schema.userSubscriptions).values({ userId: paid.id, providerSubscriptionId: "sub-auto", status: "authorized" });
    const room = await getRoom(ctx.db);
    roomId = room.id;
    seatIds = (await getSeats(ctx.db)).map((s) => s.id);
    inside = { latitude: room.latitude, longitude: room.longitude, accuracy: 10, capturedAt: new Date().toISOString() };
  });

  afterAll(() => {
    env.mpAccessToken = priorToken;
  });

  async function checkInWithMinutesLeft(userId: string, minutes: number) {
    await ctx.db.update(schema.checkIns).set({ status: "CANCELLED", endedAt: new Date() }).where(eq(schema.checkIns.userId, userId));
    const expiresAt = new Date(Date.now() + minutes * 60_000);
    await ctx.db.insert(schema.checkIns).values({ userId, roomId, seatId: seatIds[seatCursor++]!, expiresAt, presenceVerified: true });
    return expiresAt;
  }

  function extend(cookie: string, body: unknown) {
    return ctx.app.request("/api/v1/checkins/current/extend", {
      method: "POST",
      headers: baseHeaders({ "content-type": "application/json", cookie }),
      body: JSON.stringify(body),
    });
  }

  async function errorCode(res: Response) {
    return ((await res.json()) as { error: { code: string } }).error.code;
  }

  it("rejects auto without a location (400)", async () => {
    await checkInWithMinutesLeft(paid.id, 10);
    const res = await extend(paid.cookie, { auto: true });
    expect(res.status).toBe(400);
  });

  it("rejects auto from a free user (403 PRO_REQUIRED)", async () => {
    await checkInWithMinutesLeft(free.id, 10);
    const res = await extend(free.cookie, { auto: true, location: inside });
    expect(res.status).toBe(403);
    expect(await errorCode(res)).toBe("PRO_REQUIRED");
  });

  it("rejects auto with 30 minutes left (400)", async () => {
    await checkInWithMinutesLeft(paid.id, 30);
    const res = await extend(paid.cookie, { auto: true, location: inside });
    expect(res.status).toBe(400);
    expect(await errorCode(res)).toBe("VALIDATION_ERROR");
  });

  it("rejects auto from outside the geofence and leaves the check-in alone", async () => {
    const expiresAt = await checkInWithMinutesLeft(paid.id, 10);
    const res = await extend(paid.cookie, { auto: true, location: { ...inside, latitude: inside.latitude + 1 } });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(await errorCode(res)).toBe("PRESENCE_REJECTED");
    const [row] = await ctx.db.select().from(schema.checkIns).where(and(eq(schema.checkIns.userId, paid.id), eq(schema.checkIns.status, "ACTIVE")));
    expect(row!.expiresAt.getTime()).toBe(expiresAt.getTime());
  });

  it("does not accept a live presence grant in place of a fix (400)", async () => {
    await checkInWithMinutesLeft(paid.id, 10);
    const now = new Date();
    await ctx.db
      .insert(schema.presenceGrants)
      .values({ userId: paid.id, roomId, grantedAt: now, expiresAt: new Date(now.getTime() + 10 * 60_000) })
      .onConflictDoNothing();
    const res = await extend(paid.cookie, { auto: true });
    expect(res.status).toBe(400);
  });

  it("extends a Pro user's check-in with 10 minutes left and a valid fix, then rate limits a second try", async () => {
    await checkInWithMinutesLeft(paid.id, 10);
    const before = Date.now();
    const res = await extend(paid.cookie, { auto: true, location: inside });
    expect(res.status).toBe(201);
    const dto = (await res.json()) as { expiresAt: string };
    expect(new Date(dto.expiresAt).getTime()).toBeGreaterThan(before + 60 * 60_000);

    // Back inside the renewal window, so only the 240 s limiter can turn the retry away.
    await ctx.db
      .update(schema.checkIns)
      .set({ expiresAt: new Date(Date.now() + 10 * 60_000) })
      .where(and(eq(schema.checkIns.userId, paid.id), eq(schema.checkIns.status, "ACTIVE")));
    const again = await extend(paid.cookie, { auto: true, location: inside });
    expect(again.status).toBe(429);
  });

  it("leaves the normal extend alone: a free user extends with 30 minutes left", async () => {
    await checkInWithMinutesLeft(free.id, 30);
    const res = await extend(free.cookie, { location: inside });
    expect(res.status).toBe(201);
  });

  it("a free user always renews the fixed 3-hour block, whatever duration it asks for", async () => {
    await checkInWithMinutesLeft(free.id, 30);
    const before = Date.now();
    const res = await extend(free.cookie, { location: inside, durationMinutes: 600 });
    expect(res.status).toBe(201);
    const minutes = (new Date(((await res.json()) as { expiresAt: string }).expiresAt).getTime() - before) / 60_000;
    expect(minutes).toBeGreaterThan(179.9);
    expect(minutes).toBeLessThan(180.1);
  });

  it("a Pro user renews for the duration it chose", async () => {
    await checkInWithMinutesLeft(paid.id, 30);
    const before = Date.now();
    const res = await extend(paid.cookie, { location: inside, durationMinutes: 600 });
    expect(res.status).toBe(201);
    const minutes = (new Date(((await res.json()) as { expiresAt: string }).expiresAt).getTime() - before) / 60_000;
    expect(minutes).toBeGreaterThan(599.9);
    expect(minutes).toBeLessThan(600.1);
  });
});
