import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { schema } from "@sala/database";
import type { LocationInput } from "@sala/contracts";
import type { Auth } from "../auth/auth.instance.js";
import { env } from "../env.js";
import { createApp } from "../http/app.js";
import { baseHeaders, buildTestApp } from "../http/test-app.js";
import { getRoom, getSeats, insertUsers } from "../test-utils.js";
import { loadStudyIntervals } from "../study-history/study-intervals.js";
import { classifyStudyLocation } from "./study-presence.js";

describe("verified study presence / real HTTP and SQLite", () => {
  let ctx: ReturnType<typeof buildTestApp>, app: ReturnType<typeof createApp>, room: Awaited<ReturnType<typeof getRoom>>, checkInId: string;
  let savedEnv: typeof env;
  let device: string | undefined;
  const start = Date.parse("2026-10-29T14:00:00Z");
  const at = (minute: number) => { vi.setSystemTime(start + minute * 60_000); return new Date(); };
  const fix = (distance = 0, accuracy = 5): LocationInput => ({ latitude: room.latitude + distance / 111_195, longitude: room.longitude, accuracy, capturedAt: new Date().toISOString(), sentAt: new Date().toISOString() });
  const request = (path: string, method = "GET", body?: unknown, actor = "study-a") => app.request(`/api/v1${path}`, { method, headers: baseHeaders({ "content-type": "application/json", ...(device ? { "x-study-device": device } : {}), ...(actor ? { "x-study-actor": actor } : {}) }), ...(body ? { body: JSON.stringify(body) } : {}) });
  const sample = (location = fix()) => request("/checkins/current/presence", "POST", { checkInId, location });
  const minutes = async () => (await loadStudyIntervals(ctx.db, "study-a", "2020-01-01", new Date())).reduce((n, part) => n + part.minutes, 0);
  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ["Date"] }); at(0); device = undefined;
    savedEnv = { ...env }; Object.assign(env, { isProduction: true, presenceDevBypass: false, betterAuthSecret: "test-only-study-presence-secret-123456789" });
    ctx = buildTestApp(); room = await getRoom(ctx.db);
    vi.spyOn(ctx.services.clock, "now").mockImplementation(() => new Date());
    await insertUsers(ctx.db, ["study-a", "study-b"]); ctx.db.update(schema.user).set({ emailVerified: true }).run();
    const auth = { api: { getSession: async ({ headers }: { headers: Headers }) => {
      const id = headers.get("x-study-actor"); return id ? { user: ctx.db.select().from(schema.user).where(eq(schema.user.id, id)).get() } : null;
    } } } as unknown as Auth;
    app = createApp({ services: ctx.services, auth });
    const response = await request("/checkins", "POST", { roomId: room.id, seatId: (await getSeats(ctx.db))[0]!.id, location: fix() });
    expect(response.status).toBe(201); checkInId = ((await response.json()) as { id: string }).id;
  });
  afterEach(() => { Object.assign(env, savedEnv); vi.useRealTimers(); vi.restoreAllMocks(); });

  it("keeps counting a valid check-in while a locked/offline browser cannot send GPS", async () => {
    at(20); expect(await minutes()).toBe(20);
    expect((await ctx.services.rankings.rawValues(room, "today", "study_time", new Date())).get("study-a")).toBe(20);
    expect((await ctx.services.garden.get("study-a")).studyMinutes).toBe(20);
    expect(await (await request("/checkins/current/presence")).json()).toMatchObject({ state: "COUNTING", checkInId });
    expect((await sample()).status).toBe(200);
    at(24); expect(await minutes()).toBe(24);
    await request("/checkins/current", "DELETE"); expect(await minutes()).toBe(24);
    expect(ctx.db.select().from(schema.studySessions).get()?.verifiedMinutes).toBe(24);
    at(90); expect(await minutes()).toBe(24);
    expect((await ctx.services.rankings.rawValues(room, "today", "study_time", new Date())).get("study-a")).toBe(24);
    expect((await ctx.services.garden.get("study-a")).studyMinutes).toBe(24);
  });

  it("repairs the still-open interval of a legacy five-minute monitor without growing settled history", async () => {
    ctx.db.update(schema.checkInMonitors).set({ verifiedUntil: new Date(start + 5 * 60_000) }).where(eq(schema.checkInMonitors.checkInId, checkInId)).run();
    at(65); expect(await minutes()).toBe(65);
    expect(await (await request("/checkins/current/presence")).json()).toMatchObject({ state: "COUNTING" });
    await request("/checkins/current", "DELETE");
    at(150); expect(await minutes()).toBe(65);
  });

  it("never counts beyond check-in expiry and finalizes exactly once after a long browser sleep", async () => {
    at(240); expect(await minutes()).toBe(180);
    await ctx.services.jobs.expiration.runSweep(new Date());
    expect(ctx.db.select().from(schema.studySessions).get()?.verifiedMinutes).toBe(180);
    at(300); expect(await minutes()).toBe(180);
    await ctx.services.jobs.expiration.runSweep(new Date());
    expect(ctx.db.select().from(schema.studySessions).all()).toHaveLength(1);
  });

  it("counts a renewed stay beyond its original expiry without requiring constant GPS", async () => {
    at(170); expect((await request("/checkins/current/extend", "POST", { location: fix() })).status).toBe(201);
    at(230); expect(await minutes()).toBe(230);
    at(400); expect(await minutes()).toBe(350);
  });

  it("a late confident exit ends the ongoing span, and an actual return excludes the entire absence", async () => {
    at(40); expect(await (await sample(fix(100))).json()).toMatchObject({ state: "AWAY" });
    at(70); expect(await minutes()).toBe(40); await sample();
    at(80); expect(await minutes()).toBe(50);
    await request("/checkins/current", "DELETE");
    at(120); expect(await minutes()).toBe(50);
  });

  it("pauses on a confident exit, resumes without counting the break, and retains actual intervals", async () => {
    for (const m of [3, 6, 9]) { at(m); await sample(); }
    at(10); expect(await (await sample(fix(100))).json()).toMatchObject({ state: "AWAY", releaseAt: new Date(start + 70 * 60_000).toISOString() });
    expect(ctx.db.select().from(schema.presenceGrants).all()).toHaveLength(0);
    at(35); expect(await minutes()).toBe(10); await sample();
    at(40); await request("/checkins/current", "DELETE");
    expect(await minutes()).toBe(15);
    const parts = await loadStudyIntervals(ctx.db, "study-a", "2020-01-01", new Date());
    expect(parts.map(p => [p.startedAt.toISOString(), p.minutes])).toEqual([[new Date(start).toISOString(), 10], [new Date(start + 35 * 60_000).toISOString(), 5]]);
  });

  it("releases after an hour outside with no further client callbacks, finalizes time once and does not invent a FREE report", async () => {
    at(3); await sample(); at(6); await sample(fix(100));
    at(65); await ctx.services.jobs.expiration.runSweep(new Date()); expect(ctx.db.select().from(schema.checkIns).get()?.status).toBe("ACTIVE");
    at(66); await ctx.services.jobs.expiration.runSweep(new Date());
    expect(ctx.db.select().from(schema.checkIns).get()?.status).toBe("EXPIRED");
    expect(ctx.db.select().from(schema.studySessions).get()?.verifiedMinutes).toBe(6);
    expect(ctx.db.select().from(schema.seatObservations).all()).toHaveLength(0);
    await ctx.services.jobs.expiration.runSweep(new Date()); expect(ctx.db.select().from(schema.studySessions).all()).toHaveLength(1);
  });

  it("does not revive an hour-long absence when the returning phone beats the sweep", async () => {
    at(3); await sample(fix(100)); at(64);
    expect(await (await sample()).json()).toMatchObject({ state: "RELEASED" });
    expect(await ctx.services.checkIns.getActiveCheckIn("study-a")).toBeNull();
  });

  it("never treats coarse, stale, zero-accuracy or boundary measurements as a confirmed exit or renewed proof", async () => {
    at(2);
    for (const location of [fix(60, 30), fix(100, 100), fix(100, 0), { ...fix(100), capturedAt: new Date(start).toISOString() }]) {
      expect(classifyStudyLocation(room, location, new Date())).toBe("UNKNOWN"); await sample(location);
    }
    const monitor = ctx.db.select().from(schema.checkInMonitors).get()!;
    expect(monitor.outsideSince).toBeNull(); expect(+monitor.verifiedUntil).toBe(start + 180 * 60_000);
    expect(JSON.stringify(monitor)).not.toMatch(/latitude|longitude/);
  });

  it("rejects other accounts, missing authentication and forged identity fields", async () => {
    expect((await request("/checkins/current/presence", "POST", { checkInId, location: fix() }, "study-b")).status).toBe(404);
    expect((await request("/checkins/current/presence", "GET", undefined, "")).status).toBe(401);
    expect(await (await request("/checkins/current/presence", "GET", undefined, "study-b")).json()).toBeNull();
    expect((await request("/checkins/current/presence", "POST", { checkInId, location: fix(), userId: "study-a" })).status).toBe(400);
  });

  it("ignores older samples from another device and duplicate proof does not extend its lease", async () => {
    at(3); const old = fix(100); at(3.2); await sample();
    const until = ctx.db.select().from(schema.checkInMonitors).get()!.verifiedUntil;
    await sample(old); expect(ctx.db.select().from(schema.checkInMonitors).get()?.outsideSince).toBeNull();
    const duplicate = fix(); at(3.3); await sample(duplicate);
    expect(ctx.db.select().from(schema.checkInMonitors).get()?.verifiedUntil).toEqual(until);
  });

  it("binds the new check-in to its browser: a second logged-in device cannot pause or extend its presence", async () => {
    await request("/checkins/current", "DELETE");
    device = "11111111-1111-4111-8111-111111111111";
    const response = await request("/checkins", "POST", { roomId: room.id, seatId: (await getSeats(ctx.db))[0]!.id, location: fix() });
    checkInId = ((await response.json()) as { id: string }).id;
    expect(ctx.db.select().from(schema.checkInMonitors).where(eq(schema.checkInMonitors.checkInId, checkInId)).get()?.deviceId).toBe(device);
    at(2); device = "22222222-2222-4222-8222-222222222222";
    expect(await (await sample(fix(100))).json()).toMatchObject({ state: "COUNTING", trackingHere: false });
    expect(await (await request("/checkins/current/presence")).json()).toMatchObject({ trackingHere: false });
    expect(ctx.db.select().from(schema.checkInMonitors).where(eq(schema.checkInMonitors.checkInId, checkInId)).get()?.outsideSince).toBeNull();
    device = "11111111-1111-4111-8111-111111111111";
    expect(await (await sample(fix(100))).json()).toMatchObject({ state: "AWAY" });
  });

  it("adopts a legacy check-in only from a device with a valid inside reading", async () => {
    at(2); device = "22222222-2222-4222-8222-222222222222";
    expect(await (await sample(fix(100))).json()).toMatchObject({ trackingHere: false });
    expect(ctx.db.select().from(schema.checkInMonitors).get()?.deviceId).toBeNull();
    at(3); device = "11111111-1111-4111-8111-111111111111";
    await sample(); expect(ctx.db.select().from(schema.checkInMonitors).get()?.deviceId).toBe(device);
  });

  it("also pauses the account's synchronized focus timer on a confirmed exit", async () => {
    ctx.services.focus.command("study-a", { version: 0, command: { action: "start" } });
    at(2); await sample(fix(100));
    expect(JSON.parse(ctx.db.select().from(schema.userFocus).get()!.state).timer.status).toBe("paused");
  });
});
