import { afterEach, describe, expect, it, vi } from "vitest";
import { sql } from "drizzle-orm";
import { schema } from "@sala/database";
import { hasActiveBan } from "../auth/auth.instance.js";
import { env } from "../env.js";
import { baseHeaders, buildTestApp } from "./test-app.js";

interface ErrBody { error: { code: string; message: string } }

async function signUp(app: ReturnType<typeof buildTestApp>["app"], key: string) {
  const res = await app.request("/api/auth/sign-up/email", {
    method: "POST",
    headers: baseHeaders({ "content-type": "application/json" }),
    body: JSON.stringify({ email: `${key}@example.test`, password: "correct-horse-battery", name: key }),
  });
  expect(res.status).toBe(200);
  const body = (await res.json()) as { user: { id: string } };
  const cookie = res.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
  return { id: body.user.id, cookie };
}

describe("createApp", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    env.maintenanceMode = false;
    env.e2eTestHooks = false;
  });

  it("health: liveness and readiness answer ok", async () => {
    const { app } = buildTestApp();
    const live = await app.request("/api/v1/health", { headers: baseHeaders() });
    expect(live.status).toBe(200);
    expect(((await live.json()) as { ok: boolean }).ok).toBe(true);
    const ready = await app.request("/api/v1/health/ready", { headers: baseHeaders() });
    expect(await ready.json()).toEqual({ ok: true });
  });

  it("health/ready answers 503 when the database fails", async () => {
    const { app, db } = buildTestApp();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.spyOn(db, "run").mockImplementation(() => {
      throw new Error("down");
    });
    const res = await app.request("/api/v1/health/ready", { headers: baseHeaders() });
    expect(res.status).toBe(503);
    expect(((await res.json()) as ErrBody).error.message).toBe("No disponible.");
  });

  it("auth-providers reports email/password and the configured extras", async () => {
    const { app } = buildTestApp();
    const res = await app.request("/api/v1/auth-providers", { headers: baseHeaders() });
    expect(await res.json()).toMatchObject({ emailPassword: true });
  });

  it("unknown routes answer 404 NOT_FOUND in the API error shape", async () => {
    const { app } = buildTestApp();
    const res = await app.request("/api/v1/nope", { headers: baseHeaders() });
    expect(res.status).toBe(404);
    expect(((await res.json()) as ErrBody).error.code).toBe("NOT_FOUND");
  });

  it("sets security headers", async () => {
    const { app } = buildTestApp();
    const res = await app.request("/api/v1/health", { headers: baseHeaders() });
    expect(res.headers.get("content-security-policy")).toBe("default-src 'none'; frame-ancestors 'none'");
    expect(res.headers.get("cross-origin-resource-policy")).toBe("same-site");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("referrer-policy")).toBe("no-referrer");
  });

  it("maintenance mode answers 503 FEATURE_DISABLED everywhere except health", async () => {
    const { app } = buildTestApp();
    env.maintenanceMode = true;
    const res = await app.request("/api/v1/rooms", { headers: baseHeaders() });
    expect(res.status).toBe(503);
    const body = (await res.json()) as ErrBody;
    expect(body.error).toEqual({ code: "FEATURE_DISABLED", message: "Mantenimiento en curso." });
    expect((await app.request("/api/v1/health", { headers: baseHeaders() })).status).toBe(200);
  });

  it("CSRF: a state-changing request from an untrusted origin is rejected before any handler", async () => {
    const { app } = buildTestApp();
    const res = await app.request("/api/v1/checkins", {
      method: "POST",
      headers: { origin: "https://evil.test", "content-type": "application/json" },
      body: "{}",
    });
    expect(res.status).toBe(403);
    expect(((await res.json()) as ErrBody).error.message).toBe("Origen no permitido.");
  });

  it("body limits: 100 KB by default (413), and a check-in photo body over it needs a live session", async () => {
    const { app } = buildTestApp();
    const big = JSON.stringify({ blob: "x".repeat(200 * 1024) });
    const anon = await app.request("/api/v1/checkins/00000000-0000-4000-8000-000000000000/photo", {
      method: "POST",
      headers: baseHeaders({ "content-type": "application/json" }),
      body: big,
    });
    expect(anon.status).toBe(413);
    expect(((await anon.json()) as ErrBody).error.code).toBe("VALIDATION_ERROR");

    const { cookie } = await signUp(app, "photo");
    const live = await app.request("/api/v1/checkins/00000000-0000-4000-8000-000000000000/photo", {
      method: "POST",
      headers: baseHeaders({ "content-type": "application/json", cookie }),
      body: big,
    });
    expect(live.status).not.toBe(413);
    expect(live.status).toBeLessThan(500);

    const otherRoute = await app.request("/api/v1/checkins", {
      method: "POST",
      headers: baseHeaders({ "content-type": "application/json", cookie }),
      body: big,
    });
    expect(otherRoute.status).toBe(413);
  });

  it("GET /me: anonymous state, then the signed-in user", async () => {
    const { app } = buildTestApp();
    const anon = await app.request("/api/v1/me", { headers: baseHeaders() });
    expect(anon.status).toBe(200);
    expect(await anon.json()).toMatchObject({ user: null, activeCheckIn: null, roles: [], canManageAdmins: false });

    const { id, cookie } = await signUp(app, "megan");
    const me = await app.request("/api/v1/me", { headers: baseHeaders({ cookie }) });
    expect(me.status).toBe(200);
    expect(await me.json()).toMatchObject({ user: { id, email: "megan@example.test" }, activeCheckIn: null, profileCompleted: false });
  });

  it("GET /me keeps working for a suspended user (optional auth never blocks)", async () => {
    const { app, db } = buildTestApp();
    const { id, cookie } = await signUp(app, "sus");
    await db.insert(schema.userRestrictions).values({ userId: id, type: "SUSPENDED", reason: "t" });
    const me = await app.request("/api/v1/me", { headers: baseHeaders({ cookie }) });
    expect(me.status).toBe(200);
    expect(await me.json()).toMatchObject({ restrictions: [{ type: "SUSPENDED" }] });
    const checkin = await app.request("/api/v1/checkins/current/extend", { method: "POST", headers: baseHeaders({ cookie, "content-type": "application/json" }), body: "{}" });
    expect(checkin.status).toBe(403);
    expect(((await checkin.json()) as ErrBody).error.code).toBe("RESTRICTED");
  });

  it("a banned user cannot sign in again", async () => {
    const { app, db } = buildTestApp();
    const { id } = await signUp(app, "banned");
    await db.insert(schema.userRestrictions).values({ userId: id, type: "BANNED", reason: "t" });
    const res = await app.request("/api/auth/sign-in/email", {
      method: "POST",
      headers: baseHeaders({ "content-type": "application/json" }),
      body: JSON.stringify({ email: "banned@example.test", password: "correct-horse-battery" }),
    });
    expect(res.status).toBe(403);
    expect(await res.text()).toContain("ACCOUNT_BANNED");
  });

  it("E2E hook: 403 FORBIDDEN unless E2E_TEST_HOOKS is on; ages and expires the check-in when on", async () => {
    const { app, db } = buildTestApp();
    const off = await app.request("/api/v1/__e2e/expire-checkin", {
      method: "POST",
      headers: baseHeaders({ "content-type": "application/json" }),
      body: JSON.stringify({ userId: "nobody" }),
    });
    expect(off.status).toBe(403);

    env.e2eTestHooks = true;
    const { id } = await signUp(app, "e2e");
    const [room] = await db.select().from(schema.rooms);
    const [seat] = await db.select().from(schema.seats).limit(1);
    await db.insert(schema.checkIns).values({
      userId: id,
      roomId: room!.id,
      seatId: seat!.id,
      expiresAt: new Date(Date.now() + 3_600_000),
      presenceVerified: true,
    });
    const on = await app.request("/api/v1/__e2e/expire-checkin", {
      method: "POST",
      headers: baseHeaders({ "content-type": "application/json" }),
      body: JSON.stringify({ userId: id }),
    });
    expect(await on.json()).toEqual({ expired: true });
    const [row] = await db.select().from(schema.checkIns).where(sql`user_id = ${id}`);
    expect(row!.status).toBe("EXPIRED");
  });
});

describe("hasActiveBan (used by the Better Auth session.create hook)", () => {
  it("only flags active BANs", async () => {
    const { db } = buildTestApp();
    await db.insert(schema.user).values([
      { id: "u1", name: "u1", email: "u1@example.test" },
      { id: "u2", name: "u2", email: "u2@example.test" },
    ]);
    await expect(hasActiveBan(db, "u1")).resolves.toBe(false);
    await db.insert(schema.userRestrictions).values({ userId: "u1", type: "SUSPENDED", reason: "t" });
    await expect(hasActiveBan(db, "u1")).resolves.toBe(false);
    await db.insert(schema.userRestrictions).values({ userId: "u1", type: "BANNED", reason: "t" });
    await expect(hasActiveBan(db, "u1")).resolves.toBe(true);
    await expect(hasActiveBan(db, "u2")).resolves.toBe(false);
  });
});
