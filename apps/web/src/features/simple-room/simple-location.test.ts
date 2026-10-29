import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LocationInput } from "@sala/contracts";
import { getSeatLocation } from "@/lib/geolocation";
import { simpleActionLocation } from "./simple-location";

vi.mock("@/lib/geolocation", async original => ({ ...await original<typeof import("@/lib/geolocation")>(), getSeatLocation: vi.fn() }));
const fix = (age = 0, accuracy = 20): LocationInput => ({ latitude: -38.7, longitude: -62.27, accuracy, capturedAt: new Date(Date.now() - age).toISOString(), sentAt: new Date(Date.now() - age).toISOString() });

describe("simple check-in location lifecycle", () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-29T12:00:00Z")); vi.mocked(getSeatLocation).mockResolvedValue(fix()); });
  afterEach(() => { vi.useRealTimers(); vi.clearAllMocks(); });
  it("reuses only this attempt's recent presence reading for a manual seat confirmation", async () => {
    const previous = fix(10_000);
    expect(await simpleActionLocation(previous, true)).toEqual({ ...previous, sentAt: new Date().toISOString() });
    expect(getSeatLocation).not.toHaveBeenCalled();
  });
  it("always acquires a new precise fix for automatic selection, even with a recent previous reading", async () => {
    await simpleActionLocation(fix(), false);
    expect(getSeatLocation).toHaveBeenCalledExactlyOnceWith(true);
  });
  it.each([null, () => fix(46_000), () => fix(0, 100), () => fix(-5_000)])("reacquires missing, expired, imprecise or future fixes for manual confirmation (%s)", async value => {
    await simpleActionLocation(value ? value() : null, true);
    expect(getSeatLocation).toHaveBeenCalledExactlyOnceWith(false);
  });
});
