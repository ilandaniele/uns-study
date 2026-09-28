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

describe("PresenceService accuracy tolerance", () => {
  const svc = new PresenceService();
  const center = { latitude: -38.70138372483678, longitude: -62.270139753196005, geofenceRadiusM: 50 };
  // ~0.0009 degrees of latitude is ~100 m.
  const at = (dLat: number, accuracy: number) => ({
    latitude: center.latitude + dLat,
    longitude: center.longitude,
    accuracy,
    capturedAt: new Date().toISOString(),
  });

  it("accepts an indoor fix 80 m off with 80 m accuracy (50 + 80/2 = 90 m allowed)", () => {
    const result = svc.validate(center, at(0.00072, 80), { isProduction: true, devBypass: false, maxAccuracyM: 100 });
    expect(result.valid).toBe(true);
  });

  it("rejects a precise fix 80 m away", () => {
    const result = svc.validate(center, at(0.00072, 10), { isProduction: true, devBypass: false, maxAccuracyM: 100 });
    expect(result.reason).toBe("OUTSIDE_GEOFENCE");
  });
});

describe("PresenceService clock skew", () => {
  const svc = new PresenceService();
  const room = { latitude: -38.70138372483678, longitude: -62.270139753196005, geofenceRadiusM: 50 };
  const opts = { isProduction: true, devBypass: false, maxAgeS: 120, maxAccuracyM: 150 };

  it("accepts a fresh fix from a phone whose clock runs 3 minutes fast", () => {
    const now = new Date("2026-09-29T15:00:00Z");
    const phoneNow = new Date(now.getTime() + 3 * 60_000);
    const result = svc.validate(
      room,
      { latitude: room.latitude, longitude: room.longitude, accuracy: 20, capturedAt: new Date(phoneNow.getTime() - 2000).toISOString(), sentAt: phoneNow.toISOString() },
      { ...opts, now },
    );
    expect(result.valid).toBe(true);
  });

  it("rejects when the device clock is wildly off (replayed request)", () => {
    const now = new Date("2026-09-29T15:00:00Z");
    const old = new Date(now.getTime() - 60 * 60_000);
    const result = svc.validate(
      room,
      { latitude: room.latitude, longitude: room.longitude, accuracy: 20, capturedAt: old.toISOString(), sentAt: old.toISOString() },
      { ...opts, now },
    );
    expect(result.reason).toBe("STALE_LOCATION");
  });

  it("returns distance details on rejection", () => {
    const result = svc.validate(
      room,
      { latitude: room.latitude + 0.0018, longitude: room.longitude, accuracy: 30, capturedAt: new Date().toISOString() },
      opts,
    );
    expect(result.reason).toBe("OUTSIDE_GEOFENCE");
    expect(result.details?.distanceM).toBeGreaterThan(180);
    expect(result.details?.allowedM).toBe(65);
  });
});
