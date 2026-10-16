import { describe, expect, it } from "vitest";
import {
  examPatchSchema,
  extendRequestSchema,
  favoriteSeatsRequestSchema,
  groupFocusRequestSchema,
  seatWatchRequestSchema,
  weeklyGoalRequestSchema,
} from "./index.js";

const location = { latitude: -38.702, longitude: -62.269, accuracy: 20, capturedAt: new Date().toISOString() };
const ids = (n: number) => Array.from({ length: n }, (_, i) => `seat-${i}`);

describe("pro schemas", () => {
  it("bounds the seat watch to 1..12 seats", () => {
    expect(seatWatchRequestSchema.safeParse({ seatIds: ids(12) }).success).toBe(true);
    expect(seatWatchRequestSchema.safeParse({ seatIds: ids(13) }).success).toBe(false);
    expect(seatWatchRequestSchema.safeParse({ seatIds: [] }).success).toBe(false);
  });

  it("bounds favorites to 3 seats", () => {
    expect(favoriteSeatsRequestSchema.safeParse({ seatIds: ids(3) }).success).toBe(true);
    expect(favoriteSeatsRequestSchema.safeParse({ seatIds: ids(4) }).success).toBe(false);
  });

  it("bounds the group focus to 5..180 minutes", () => {
    expect(groupFocusRequestSchema.safeParse({ minutes: 4 }).success).toBe(false);
    expect(groupFocusRequestSchema.safeParse({ minutes: 5 }).success).toBe(true);
    expect(groupFocusRequestSchema.safeParse({ minutes: 180 }).success).toBe(true);
    expect(groupFocusRequestSchema.safeParse({ minutes: 181 }).success).toBe(false);
  });

  it("bounds the weekly goal and allows clearing it", () => {
    expect(weeklyGoalRequestSchema.safeParse({ minutes: null }).success).toBe(true);
    expect(weeklyGoalRequestSchema.safeParse({ minutes: 59 }).success).toBe(false);
    expect(weeklyGoalRequestSchema.safeParse({ minutes: 4201 }).success).toBe(false);
  });

  it("accepts a partial exam patch and rejects a malformed date", () => {
    expect(examPatchSchema.safeParse({ targetHours: 10 }).success).toBe(true);
    expect(examPatchSchema.safeParse({ examDate: "15/12/2026" }).success).toBe(false);
  });
});

describe("extendRequestSchema auto", () => {
  it("rejects auto without a location", () => {
    expect(extendRequestSchema.safeParse({ auto: true }).success).toBe(false);
  });

  it("accepts auto with a location", () => {
    expect(extendRequestSchema.safeParse({ auto: true, location }).success).toBe(true);
  });

  it("accepts neither auto nor a location", () => {
    expect(extendRequestSchema.safeParse({}).success).toBe(true);
  });
});
