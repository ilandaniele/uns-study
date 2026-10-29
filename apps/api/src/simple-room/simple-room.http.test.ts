import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { schema } from "@sala/database";
import type { LocationInput, RoomMapDto, SeatCalibrationInput, SimpleCheckInResult } from "@sala/contracts";
import type { Auth } from "../auth/auth.instance.js";
import { env } from "../env.js";
import { createApp } from "../http/app.js";
import { buildServices } from "../container.js";
import { ApiErrors } from "../common/api-error.js";
import { baseHeaders, buildTestApp } from "../http/test-app.js";
import { insertUsers } from "../test-utils.js";

describe("simple room mode HTTP / canonical SQLite", () => {
  let ctx: ReturnType<typeof buildTestApp>, app: ReturnType<typeof createApp>, map: RoomMapDto, savedEnv: typeof env, auth: Auth;
  let userA: string, userB: string, owner: string, staff: string;
  let sequence = 0;
  const M = 6_371_000 * Math.PI / 180;
  const request = (path: string, method = "GET", body?: unknown, user = userA) => app.request(`/api/v1${path}`, { method,
    headers: baseHeaders({ "content-type": "application/json", ...(user ? { "x-simple-test-user": user } : {}) }), ...(body ? { body: JSON.stringify(body) } : {}) });
  const fix = (seatId?: string, accuracy = 0.02): LocationInput => {
    const room = ctx.db.select().from(schema.rooms).get()!, seat = map.seats.find(s => s.id === seatId) ?? map.seats.find(s => s.code === "M03-S02")!;
    return { latitude: room.latitude + (seat.y / 1600 * 20 - 10) / M,
      longitude: room.longitude + (seat.x / 1000 * 10 - 5) / (M * Math.cos(room.latitude * Math.PI / 180)), accuracy, capturedAt: new Date().toISOString(), sentAt: new Date().toISOString() };
  };
  const input = (seatId?: string) => ({ roomId: map.room.id, location: fix(), ...(seatId ? { confirmedSeatId: seatId } : {}) });
  const calibration = (): SeatCalibrationInput => ({ anchors: ["M01-S01", "M01-S04", "M06-S01"].map(code => {
    const seat = map.seats.find(s => s.code === code)!; const { latitude, longitude } = fix(seat.id); return { seatId: seat.id, latitude, longitude };
  }) as SeatCalibrationInput["anchors"], uncertaintyM: 0.1, source: "Synthetic measured 10 by 20 meter room" });
  const target = () => map.seats.find(s => s.code === "M03-S02")!;
  const mark = (status: "FREE" | "OCCUPIED" = "FREE", adminOverride = false) => ctx.db.insert(schema.seatObservations).values({ userId: userB, roomId: map.room.id, seatId: target().id, observedStatus: status, adminOverride, presenceVerified: true, confidenceWeight: 1, expiresAt: new Date(Date.now() + 900_000) }).run();
  beforeEach(async () => {
    savedEnv = { ...env }; Object.assign(env, { isProduction: true, presenceDevBypass: false, ownerEmail: "simple-owner@example.test", betterAuthSecret: "test-only-simple-room-secret-123456789" });
    ctx = buildTestApp(); sequence++;
    [userA, userB, owner, staff] = ["a", "b", "owner", "staff"].map(s => `simple-${sequence}-${s}`) as [string, string, string, string];
    await insertUsers(ctx.db, [userA, userB, owner, staff]); ctx.db.update(schema.user).set({ emailVerified: true }).run();
    ctx.db.update(schema.user).set({ email: "simple-owner@example.test" }).where(eq(schema.user.id, owner)).run();
    ctx.db.insert(schema.userRoles).values([{ userId: owner, role: "ADMIN" }, { userId: staff, role: "ADMIN" }]).run();
    auth = { api: { getSession: async ({ headers }: { headers: Headers }) => {
      const id = headers.get("x-simple-test-user"); if (!id) return null;
      const user = ctx.db.select().from(schema.user).where(eq(schema.user.id, id)).get(); return user ? { user } : null;
    } } } as unknown as Auth;
    app = createApp({ services: ctx.services, auth }); map = await ctx.services.rooms.getRoomMap("principal");
  });
  afterEach(() => { Object.assign(env, savedEnv); vi.restoreAllMocks(); vi.useRealTimers(); });

  it("persists mode per authenticated account without a check-in or a public profile field", async () => {
    expect(await (await request("/me/room-mode")).json()).toEqual({ mode: "COMMON" });
    expect(await (await request("/me/room-mode", "PATCH", { mode: "SIMPLE" })).json()).toEqual({ mode: "SIMPLE" });
    expect(await (await request("/me/room-mode", "GET", undefined, userB)).json()).toEqual({ mode: "COMMON" });
    expect(await (await request("/me/room-mode")).json()).toEqual({ mode: "SIMPLE" });
    expect((await request("/me/room-mode", "PATCH", { mode: "SIMPLE", userId: userB })).status).toBe(400);
    expect((await request("/me/room-mode", "GET", undefined, "")).status).toBe(401);
    expect(ctx.db.select().from(schema.checkIns).all()).toHaveLength(0);
    expect((await request("/rooms/principal/map")).headers.get("cache-control")).toBe("no-cache");
    ctx.db.delete(schema.user).where(eq(schema.user.id, userA)).run();
    expect(ctx.db.select().from(schema.userRoomPreferences).all()).toHaveLength(0);
  });

  it("asks for confirmation without measured references and never fabricates coordinates", async () => {
    const response = await request("/checkins/simple", "POST", input());
    expect(response.headers.get("cache-control")).toContain("no-store");
    const result = await response.json(); expect(result).toMatchObject({ outcome: "CONFIRM", reason: "CALIBRATION_REQUIRED", suggestedSeatId: null });
    expect(JSON.stringify(result)).not.toMatch(/latitude|longitude/); expect(ctx.db.select().from(schema.checkIns).all()).toHaveLength(0);
  });

  it("protects calibration from regular admins and audits changes without coordinates", async () => {
    const endpoint = "/admin/rooms/principal/seat-calibration";
    for (const method of ["GET", "PUT", "DELETE"]) expect((await request(endpoint, method, method === "PUT" ? calibration() : undefined, staff)).status).toBe(403);
    expect((await request(endpoint, "PUT", calibration(), owner)).status).toBe(200);
    const dto = await (await request(endpoint, "GET", undefined, owner)).json() as { positions: unknown[]; matchesLayout: boolean };
    expect(dto.matchesLayout).toBe(true); expect(dto.positions).toHaveLength(108);
    const events = ctx.db.select().from(schema.securityEvents).all(); expect(JSON.stringify(events)).not.toMatch(/latitude|longitude/);
    expect(JSON.stringify(await (await request("/rooms/principal/map")).json())).not.toMatch(/latitude|longitude|uncertaintyM/);
    expect((await request(endpoint, "DELETE", undefined, owner)).status).toBe(200);
    expect(ctx.db.select().from(schema.roomSeatCalibrations).all()).toHaveLength(0);
  });

  it("rejects unmeasurable references, out-of-room anchors and duplicate seats", async () => {
    const body = calibration();
    for (const candidate of [{ ...body, anchors: [body.anchors[0], body.anchors[0], body.anchors[2]] }, { ...body, anchors: body.anchors.map(a => ({ ...a, latitude: a.latitude + 0.1 })) }, { ...body, uncertaintyM: 0 }]) {
      expect((await request("/admin/rooms/principal/seat-calibration", "PUT", candidate, owner)).status).toBe(400);
    }
  });

  it("automatically checks into a uniquely identifiable FREE chair and retries without a move or refresh", async () => {
    await ctx.services.simpleRoom.saveCalibration(owner, "principal", calibration()); mark();
    const responses = await Promise.all([request("/checkins/simple", "POST", input()), request("/checkins/simple", "POST", input())]);
    const results = await Promise.all(responses.map(r => r.json() as Promise<SimpleCheckInResult>));
    expect(results.some(r => r.outcome === "CHECKED_IN")).toBe(true);
    expect(results.every(r => r.outcome !== "CONFIRM" && r.checkIn.seatId === target().id)).toBe(true);
    expect(ctx.db.select().from(schema.checkIns).all()).toHaveLength(1);
    expect(ctx.hub.eventsFor("seat:state-changed").length).toBeGreaterThan(0);
    expect(JSON.stringify(ctx.hub.eventsFor("seat:state-changed"))).not.toMatch(/latitude|longitude/);
  });

  it("uses explicit confirmation for UNKNOWN chairs, preserves existing check-ins and rejects cross-room chairs", async () => {
    const first = await (await request("/checkins/simple", "POST", input(target().id))).json() as Extract<SimpleCheckInResult, { checkIn: unknown }>;
    expect(first.outcome).toBe("CHECKED_IN");
    const other = map.seats.find(s => s.id !== target().id)!;
    const second = await (await request("/checkins/simple", "POST", input(other.id))).json() as typeof first;
    expect(second).toMatchObject({ outcome: "ALREADY_CHECKED_IN", checkIn: { id: first.checkIn.id, seatId: target().id, expiresAt: first.checkIn.expiresAt } });
    expect(ctx.db.select().from(schema.checkIns).all()).toHaveLength(1);
    const invalid = await request("/checkins/simple", "POST", { ...input(), confirmedSeatId: crypto.randomUUID() }, userB); expect(invalid.status).toBe(404);
  });

  it("never treats an existing presence grant as a new position, or accepts stale/exterior/coarse fixes", async () => {
    await ctx.services.presence.grant(ctx.db, userA, map.room.id);
    expect((await request("/checkins/simple", "POST", { roomId: map.room.id })).status).toBe(400);
    for (const location of [{ ...fix(), latitude: fix().latitude + 0.1 }, { ...fix(), accuracy: 1000 }, { ...fix(), capturedAt: new Date(Date.now() - 200_000).toISOString() }]) {
      expect((await request("/checkins/simple", "POST", { ...input(), location })).status).toBe(403);
    }
    expect((await request("/checkins/simple", "POST", input(), "")).status).toBe(401);
    expect(ctx.db.select().from(schema.checkIns).all()).toHaveLength(0);
  });

  it("does not overwrite a new occupied report or a calibration removed between selection and commit", async () => {
    await ctx.services.simpleRoom.saveCalibration(owner, "principal", calibration()); mark();
    const original = ctx.services.checkIns.checkIn.bind(ctx.services.checkIns);
    const spy = vi.spyOn(ctx.services.checkIns, "checkIn").mockImplementationOnce(async value => { mark("OCCUPIED", true); return original(value); });
    expect(await (await request("/checkins/simple", "POST", input())).json()).toMatchObject({ outcome: "CONFIRM" });
    expect(ctx.db.select().from(schema.checkIns).all()).toHaveLength(0); spy.mockRestore();
    ctx.db.delete(schema.seatObservations).run(); mark();
    const removed = vi.spyOn(ctx.services.checkIns, "checkIn").mockImplementationOnce(async value => { ctx.db.delete(schema.roomSeatCalibrations).run(); return original(value); });
    expect(await (await request("/checkins/simple", "POST", input())).json()).toMatchObject({ outcome: "CONFIRM" });
    expect(ctx.db.select().from(schema.checkIns).all()).toHaveLength(0);
    removed.mockRestore(); await ctx.services.simpleRoom.saveCalibration(owner, "principal", calibration());
    const other = map.seats.find(s => s.id !== target().id)!;
    vi.spyOn(ctx.services.checkIns, "checkIn").mockImplementationOnce(async value => {
      ctx.db.update(schema.seats).set({ x: other.x + 1 }).where(eq(schema.seats.id, other.id)).run(); return original(value);
    });
    expect(await (await request("/checkins/simple", "POST", input())).json()).toMatchObject({ outcome: "CONFIRM" });
    expect(ctx.db.select().from(schema.checkIns).all()).toHaveLength(0);
  });

  it("handles two people competing for a seat without assigning a second chair to the loser", async () => {
    await ctx.services.simpleRoom.saveCalibration(owner, "principal", calibration()); mark();
    const responses = await Promise.all([request("/checkins/simple", "POST", input()), request("/checkins/simple", "POST", input(), userB)]);
    const results = await Promise.all(responses.map(r => r.json() as Promise<SimpleCheckInResult>));
    expect(results.filter(r => r.outcome === "CHECKED_IN")).toHaveLength(1); expect(results.filter(r => r.outcome === "CONFIRM")).toHaveLength(1);
    expect(ctx.db.select().from(schema.checkIns).all()).toHaveLength(1);
  });

  it("keeps the ordinary check-in rate limit and the adaptive human challenge", async () => {
    const challenge = vi.spyOn(ctx.services.antiAbuse, "assertChallengePassed");
    for (let i = 0; i < 5; i++) expect((await request("/checkins/simple", "POST", input())).status).toBe(200);
    expect((await request("/checkins/simple", "POST", input())).status).toBe(429);
    expect(challenge).toHaveBeenCalledTimes(5);
    expect(ctx.db.select().from(schema.checkIns).all()).toHaveLength(0);
  });

  it("enforces actual closing hours before GPS or check-in writes", async () => {
    vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2026-10-29T04:00:00Z"));
    const services = buildServices({ db: ctx.db, hub: ctx.hub, scheduler: ctx.scheduler, evidence: null, clock: ctx.services.clock });
    app = createApp({ services, auth });
    const response = await request("/checkins/simple", "POST", input(target().id));
    expect(response.status).toBe(400); expect(await response.json()).toMatchObject({ error: { message: expect.stringContaining("cerrada") } });
    expect(ctx.db.select().from(schema.checkIns).all()).toHaveLength(0);
  });

  it("does not bypass canonical restrictions or an outstanding human challenge", async () => {
    ctx.db.insert(schema.userRestrictions).values({ userId: userB, type: "BANNED", reason: "Synthetic restriction" }).run();
    expect((await request("/checkins/simple", "POST", input(target().id), userB)).status).toBe(403);
    vi.spyOn(ctx.services.antiAbuse, "assertChallengePassed").mockRejectedValueOnce(ApiErrors.turnstileRequired());
    const response = await request("/checkins/simple", "POST", input(target().id));
    expect(response.status).toBe(403); expect(await response.json()).toMatchObject({ error: { code: "TURNSTILE_REQUIRED" } });
    expect(ctx.db.select().from(schema.checkIns).all()).toHaveLength(0);
  });
});
