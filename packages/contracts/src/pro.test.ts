import { describe, expect, it } from "vitest";
import {
  examPatchSchema,
  extendRequestSchema,
  favoriteSeatsRequestSchema,
  groupFocusRequestSchema,
  profileFlairRequestSchema,
  quietRoomOccupancyPct,
  quietWatchRequestSchema,
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

describe("profile flair and quiet room schemas", () => {
  it("accepts known frame and name color ids only", () => {
    expect(profileFlairRequestSchema.safeParse({ frame: "gold", nameColor: "ocean" }).success).toBe(true);
    expect(profileFlairRequestSchema.safeParse({ frame: "none", nameColor: "default" }).success).toBe(true);
    expect(profileFlairRequestSchema.safeParse({ frame: "rainbow", nameColor: "ocean" }).success).toBe(false);
    expect(profileFlairRequestSchema.safeParse({ frame: "gold", nameColor: "#fff" }).success).toBe(false);
    expect(profileFlairRequestSchema.safeParse({ frame: "gold" }).success).toBe(false);
  });

  it("accepts only the 30, 50 and 70 quiet thresholds", () => {
    for (const thresholdPct of [30, 50, 70]) expect(quietWatchRequestSchema.safeParse({ thresholdPct }).success).toBe(true);
    for (const thresholdPct of [40, 0, 100, "50"]) expect(quietWatchRequestSchema.safeParse({ thresholdPct }).success).toBe(false);
  });
});

describe("quietRoomOccupancyPct", () => {
  it("is null below the minimum seat count", () => {
    expect(quietRoomOccupancyPct({ total: 19, occupied: 5, saved: 0, uncertain: 0 })).toBeNull();
  });

  it("counts occupied, saved and uncertain, and rounds", () => {
    expect(quietRoomOccupancyPct({ total: 20, occupied: 5, saved: 0, uncertain: 0 })).toBe(25);
    expect(quietRoomOccupancyPct({ total: 108, occupied: 40, saved: 5, uncertain: 5 })).toBe(46);
    expect(quietRoomOccupancyPct({ total: 20, occupied: 0, saved: 0, uncertain: 0 })).toBe(0);
  });
});
