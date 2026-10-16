import { describe, expect, it } from "vitest";
import type { RoomSummary } from "@sala/contracts";
import { QUIET_THRESHOLD_META, quietToastMessage, thresholdAlreadyMet } from "./quiet-room";

const summary = (total: number, occupied: number, saved = 0, uncertain = 0): RoomSummary => ({
  roomId: "r",
  total,
  free: total - occupied - saved - uncertain,
  occupied,
  saved,
  uncertain,
  unknown: 0,
});

describe("thresholdAlreadyMet", () => {
  it("is false for rooms below the minimum seat count", () => {
    expect(thresholdAlreadyMet(summary(19, 0), 30)).toBe(false);
  });
  it("is met at exactly the threshold", () => {
    expect(thresholdAlreadyMet(summary(100, 50), 50)).toBe(true);
    expect(thresholdAlreadyMet(summary(100, 50), 30)).toBe(false);
  });
  it("counts saved and uncertain seats as occupied", () => {
    expect(thresholdAlreadyMet(summary(100, 20, 5, 5), 30)).toBe(true);
    expect(thresholdAlreadyMet(summary(100, 20, 6, 5), 30)).toBe(false);
  });
});

describe("quietToastMessage", () => {
  it("formats the alert", () => {
    expect(quietToastMessage({ roomId: "r", roomSlug: "principal", thresholdPct: 50, occupancyPct: 48, free: 56 })).toBe(
      "La sala bajó al 48 % ocupada: hay 56 lugares libres.",
    );
  });
});

describe("QUIET_THRESHOLD_META", () => {
  it("has a label for each threshold", () => {
    expect(Object.keys(QUIET_THRESHOLD_META)).toEqual(["30", "50", "70"]);
  });
});
