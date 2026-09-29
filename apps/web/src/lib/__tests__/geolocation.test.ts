import { describe, expect, it } from "vitest";
import { isReusableFix, pickBestFix } from "../geolocation";

const CACHED_FIX_TOLERANCE_MS = 5_000;

describe("pickBestFix", () => {
  it("returns null when there are no samples", () => {
    expect(pickBestFix([], Date.now())).toBeNull();
  });

  it("picks the most accurate sample among several", () => {
    const startedAt = 1_000_000;
    const best = pickBestFix(
      [
        { latitude: 0, longitude: 0, accuracy: 80, timestamp: startedAt + 1000 },
        { latitude: 0, longitude: 0, accuracy: 15, timestamp: startedAt + 2000 },
        { latitude: 0, longitude: 0, accuracy: 40, timestamp: startedAt + 3000 },
      ],
      startedAt,
    );
    expect(best?.accuracy).toBe(15);
  });

  it("ignores a sample whose timestamp predates sampling start by more than the tolerance (a cached fix)", () => {
    const startedAt = 1_000_000;
    const best = pickBestFix(
      [
        // A suspiciously precise but stale fix served instantly from the OS cache.
        { latitude: 0, longitude: 0, accuracy: 5, timestamp: startedAt - CACHED_FIX_TOLERANCE_MS - 1 },
        { latitude: 0, longitude: 0, accuracy: 60, timestamp: startedAt + 500 },
      ],
      startedAt,
    );
    expect(best?.accuracy).toBe(60);
  });

  it("keeps a sample within the cached-fix tolerance window", () => {
    const startedAt = 1_000_000;
    const best = pickBestFix([{ latitude: 0, longitude: 0, accuracy: 30, timestamp: startedAt - CACHED_FIX_TOLERANCE_MS + 1 }], startedAt);
    expect(best?.accuracy).toBe(30);
  });

  it("uses a recent cached fix when it's the only one (never fail a stationary phone)", () => {
    const startedAt = 1_000_000;
    const best = pickBestFix([{ latitude: 0, longitude: 0, accuracy: 5, timestamp: startedAt - CACHED_FIX_TOLERANCE_MS - 1 }], startedAt);
    expect(best?.accuracy).toBe(5);
  });
});

describe("pickBestFix cached fallback", () => {
  it("falls back to a recent cached fix when no fresh fix arrives (stationary phone indoors)", () => {
    const startedAt = 1_000_000;
    const cached = { latitude: 0, longitude: 0, accuracy: 35, timestamp: startedAt - 30_000 };
    expect(pickBestFix([cached], startedAt, startedAt + 8_000)).toEqual(cached);
  });

  it("drops a cached fix too old for the server to accept", () => {
    const startedAt = 1_000_000;
    const old = { latitude: 0, longitude: 0, accuracy: 10, timestamp: startedAt - 200_000 };
    expect(pickBestFix([old], startedAt, startedAt + 8_000)).toBeNull();
  });
});

describe("isReusableFix", () => {
  const now = Date.parse("2026-09-29T20:00:00Z");
  const fix = (ageMs: number, accuracy: number) => ({
    latitude: 0,
    longitude: 0,
    accuracy,
    capturedAt: new Date(now - ageMs).toISOString(),
  });
  it("reuses a recent precise fix", () => expect(isReusableFix(fix(10_000, 30), now)).toBe(true));
  it("rejects an old fix", () => expect(isReusableFix(fix(60_000, 30), now)).toBe(false));
  it("rejects an imprecise fix", () => expect(isReusableFix(fix(5_000, 120), now)).toBe(false));
  it("rejects nothing cached", () => expect(isReusableFix(null, now)).toBe(false));
});
