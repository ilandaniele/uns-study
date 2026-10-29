import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { watchStudyLocation } from "./study-location";

describe("short study-location sampling windows", () => {
  let success: PositionCallback, failure: PositionErrorCallback;
  const clear = vi.fn(), receive = vi.fn(), unavailable = vi.fn();
  const fix = (age = 0) => ({ timestamp: Date.now() - age, coords: { latitude: -38.7, longitude: -62.27, accuracy: 5 } }) as GeolocationPosition;
  beforeEach(() => {
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-29T14:00:00Z"));
    vi.stubGlobal("navigator", { geolocation: { watchPosition: (s: PositionCallback, e: PositionErrorCallback) => { success = s; failure = e; return 7; }, clearWatch: clear } });
  });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.clearAllMocks(); });
  it("preserves the fix timestamp, clears the sensor and ignores subsequent callbacks", () => {
    watchStudyLocation(receive, unavailable); success(fix(10_000)); success(fix());
    expect(receive).toHaveBeenCalledTimes(1); expect(receive.mock.calls[0]![0].capturedAt).toBe(new Date(Date.now() - 10_000).toISOString());
    expect(clear).toHaveBeenCalledWith(7); expect(unavailable).not.toHaveBeenCalled();
  });
  it("does not rejuvenate cached or future coordinates", () => {
    watchStudyLocation(receive, unavailable); success(fix(46_000)); success(fix(-6_000));
    expect(receive).not.toHaveBeenCalled(); vi.advanceTimersByTime(15_000); expect(unavailable).toHaveBeenCalledTimes(1);
  });
  it("cancels timers and late callbacks when hidden or unmounted", () => {
    const cancel = watchStudyLocation(receive, unavailable); cancel(); success(fix()); vi.advanceTimersByTime(20_000);
    expect(clear).toHaveBeenCalledWith(7); expect(receive).not.toHaveBeenCalled(); expect(unavailable).not.toHaveBeenCalled();
  });
  it("handles revoked location permission without leaving a watch running", () => {
    watchStudyLocation(receive, unavailable); failure({ code: 1 } as GeolocationPositionError); success(fix());
    expect(unavailable).toHaveBeenCalledTimes(1); expect(clear).toHaveBeenCalledWith(7); expect(receive).not.toHaveBeenCalled();
  });
});
