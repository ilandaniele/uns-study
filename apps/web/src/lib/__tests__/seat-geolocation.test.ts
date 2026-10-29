import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getFreshLocation, getSeatLocation } from "../geolocation";

describe("fresh location for individual seats", () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-29T12:00:00Z")); });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
  const position = (longitude: number, ageMs = 0, accuracy = 0.1) => ({ coords: { latitude: -38.7, longitude, accuracy }, timestamp: Date.now() - ageMs });

  it("does not reuse the room's previous fix, and clears its independent GPS watch", async () => {
    let calls = 0;
    const clearWatch = vi.fn();
    const watchPosition = vi.fn((success: (p: unknown) => void) => {
      const sample = calls++ === 0 ? position(-62.27, 30_000) : position(-62.2701);
      setTimeout(() => success(sample), 0); return calls;
    });
    vi.stubGlobal("navigator", { geolocation: { watchPosition, clearWatch } });
    const room = getFreshLocation(); await vi.advanceTimersByTimeAsync(2600); expect((await room).longitude).toBe(-62.27);
    const seat = getSeatLocation(); await vi.advanceTimersByTimeAsync(1);
    expect((await seat).longitude).toBe(-62.2701); expect(watchPosition).toHaveBeenCalledTimes(2); expect(clearWatch).toHaveBeenCalledWith(2);
  });

  it("waits for the finer sample instead of treating a 20-meter room fix as seat precision", async () => {
    const clearWatch = vi.fn();
    vi.stubGlobal("navigator", { geolocation: { clearWatch, watchPosition: (success: (p: unknown) => void) => {
      setTimeout(() => success(position(-62.27, 0, 20)), 0);
      setTimeout(() => success(position(-62.2701)), 1000); return 7;
    } } });
    const promise = getSeatLocation(); await vi.advanceTimersByTimeAsync(1001);
    expect((await promise).accuracy).toBe(0.1); expect(clearWatch).toHaveBeenCalledWith(7);
  });

  it("preserves an OS-cached timestamp so the server can require manual seat confirmation", async () => {
    const clearWatch = vi.fn();
    vi.stubGlobal("navigator", { geolocation: { clearWatch, watchPosition: (success: (p: unknown) => void) => { setTimeout(() => success(position(-62.27, 30_000)), 0); return 8; } } });
    const capturedAt = Date.now() - 30_000;
    const promise = getSeatLocation();
    await vi.advanceTimersByTimeAsync(6001); const result = await promise;
    expect(Date.parse(result.capturedAt)).toBe(capturedAt); expect(clearWatch).toHaveBeenCalledWith(8);
  });
});
