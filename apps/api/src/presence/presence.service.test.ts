import { describe, expect, it } from "vitest";
import { PresenceService, type PresenceRoom } from "./presence.service.js";

const room: PresenceRoom = { latitude: -38.702, longitude: -62.269, geofenceRadiusM: 120 };

function locationAt(latitude: number, longitude: number, opts: Partial<{ accuracy: number; capturedAt: string }> = {}) {
  return { latitude, longitude, accuracy: opts.accuracy ?? 20, capturedAt: opts.capturedAt ?? new Date().toISOString() };
}

describe("PresenceService", () => {
  const svc = new PresenceService();

  it("computes ~0 distance for the same point", () => {
    expect(svc.haversineDistanceM(room, room)).toBeCloseTo(0, 3);
  });

  it("computes a known distance (roughly) between two points", () => {
    // ~111km per degree of latitude.
    const d = svc.haversineDistanceM(room, { latitude: room.latitude + 1, longitude: room.longitude });
    expect(d).toBeGreaterThan(110_000);
    expect(d).toBeLessThan(112_000);
  });

  it("accepts a fresh, accurate, in-geofence location", () => {
    const result = svc.validate(room, locationAt(room.latitude, room.longitude), { isProduction: true, devBypass: false });
    expect(result.valid).toBe(true);
    expect(result.reason).toBeNull();
  });

  it("rejects a location outside the geofence", () => {
    const result = svc.validate(room, locationAt(room.latitude + 0.01, room.longitude), { isProduction: true, devBypass: false });
    expect(result.valid).toBe(false);
    expect(result.reason).toBe("OUTSIDE_GEOFENCE");
  });

  it("rejects a stale location", () => {
    const stale = locationAt(room.latitude, room.longitude, { capturedAt: new Date(Date.now() - 10 * 60_000).toISOString() });
    const result = svc.validate(room, stale, { isProduction: true, devBypass: false, maxAgeS: 120 });
    expect(result.valid).toBe(false);
    expect(result.reason).toBe("STALE_LOCATION");
  });

  it("rejects poor accuracy", () => {
    const poor = locationAt(room.latitude, room.longitude, { accuracy: 500 });
    const result = svc.validate(room, poor, { isProduction: true, devBypass: false, maxAccuracyM: 100 });
    expect(result.valid).toBe(false);
    expect(result.reason).toBe("POOR_ACCURACY");
  });

  it("rejects invalid coordinates", () => {
    const result = svc.validate(room, locationAt(200, room.longitude), { isProduction: true, devBypass: false });
    expect(result.valid).toBe(false);
    expect(result.reason).toBe("INVALID_COORDINATES");
  });

  it("dev bypass makes any location valid outside production", () => {
    const farAway = locationAt(0, 0);
    const result = svc.validate(room, farAway, { isProduction: false, devBypass: true });
    expect(result.valid).toBe(true);
  });

  it("dev bypass is refused in production, even when requested", () => {
    const farAway = locationAt(0, 0);
    const result = svc.validate(room, farAway, { isProduction: true, devBypass: true });
    expect(result.valid).toBe(false);
    expect(result.reason).toBe("OUTSIDE_GEOFENCE");
  });
});
