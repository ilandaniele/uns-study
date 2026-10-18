import { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";
import { toErrorResponse } from "../common/api-error.js";
import type { AppEnv } from "../http/context.js";
import type { Services } from "../services.js";
import { qrRouter } from "../qr/qr.router.js";
import { adminRoomsRouter } from "./admin-rooms.router.js";

type Role = "ADMIN" | "MODERATOR";

function buildApp(role: Role, overrides: Record<string, unknown> = {}, allowed = true) {
  const services = {
    roles: { hasRole: async (_id: string, roles: string[]) => roles.includes(role) },
    restriction: { assertNot: async () => undefined },
    rateLimit: { check: vi.fn(async () => ({ allowed })) },
    ...overrides,
  } as unknown as Services;
  const app = new Hono<AppEnv>();
  app.use("*", async (c, next) => {
    c.set("services", services);
    c.set("auth", { api: { getSession: async () => ({ user: { id: "u1", name: "u1", email: "u1@example.test", image: null } }) } } as never);
    c.set("ip", "127.0.0.1");
    c.set("user", null);
    await next();
  });
  app.onError((err, c) => {
    const r = toErrorResponse(err, { method: c.req.method, path: c.req.path });
    return c.json(r.body, r.status as never);
  });
  app.route("/", adminRoomsRouter);
  app.route("/", qrRouter);
  return { app, services };
}

const json = (body: unknown) => ({ method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

describe("admin and qr routers", () => {
  it("lets a moderator mark all occupied and broadcasts the changes", async () => {
    const changes = [{ seatId: "s1" }];
    const adminRooms = { markAllOccupied: vi.fn(async () => ({ roomId: "r1", count: 3, expiresAt: new Date(0), changes })) };
    const realtime = { broadcastSeatChanges: vi.fn(async () => undefined) };
    const { app } = buildApp("MODERATOR", { adminRooms, realtime });
    const res = await app.request("/admin/rooms/r1/mark-all-occupied", json({ minutes: 60 }));
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ count: 3, expiresAt: new Date(0).toISOString() });
    expect(realtime.broadcastSeatChanges).toHaveBeenCalledWith("r1", changes);
  });

  it("marks chosen seats and rejects an unknown status", async () => {
    const changes = [{ seatId: "s1" }];
    const adminRooms = { markSeats: vi.fn(async () => ({ roomId: "r1", count: 1, skipped: 1, expiresAt: new Date(0), changes })) };
    const realtime = { broadcastSeatChanges: vi.fn(async () => undefined) };
    const { app } = buildApp("ADMIN", { adminRooms, realtime });
    const res = await app.request("/admin/rooms/r1/mark-seats", json({ seatIds: ["s1", "s2"], status: "FREE" }));
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ count: 1, skipped: 1, expiresAt: new Date(0).toISOString() });
    expect(adminRooms.markSeats).toHaveBeenCalledWith("r1", expect.any(String), ["s1", "s2"], "FREE");
    expect(realtime.broadcastSeatChanges).toHaveBeenCalledWith("r1", changes);
    const bad = await app.request("/admin/rooms/r1/mark-seats", json({ seatIds: ["s1"], status: "UNKNOWN" }));
    expect(bad.status).toBe(400);
  });

  it("rejects a moderator on the geofence PUT with 403", async () => {
    const adminRooms = { updateGeofence: vi.fn() };
    const { app } = buildApp("MODERATOR", { adminRooms });
    const res = await app.request("/admin/rooms/r1/geofence", { ...json({}), method: "PUT" });
    expect(res.status).toBe(403);
    expect(adminRooms.updateGeofence).not.toHaveBeenCalled();
  });

  it("returns 429 on the public qr resolve when rate limited", async () => {
    const qr = { resolve: vi.fn() };
    const { app } = buildApp("ADMIN", { qr }, false);
    const res = await app.request("/qr/abc");
    expect(res.status).toBe(429);
    expect(qr.resolve).not.toHaveBeenCalled();
  });
});
