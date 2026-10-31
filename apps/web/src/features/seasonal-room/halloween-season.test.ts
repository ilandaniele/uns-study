import { describe, expect, it } from "vitest";
import { isHalloweenSeason } from "./halloween-season";

describe("Halloween in the room's timezone", () => {
  it.each([
    ["2026-10-25T02:59:59Z", false],
    ["2026-10-25T03:00:00Z", true],
    ["2026-10-31T18:00:00Z", true],
    ["2026-11-02T02:59:59Z", true],
    ["2026-11-02T03:00:00Z", false],
    ["2026-12-31T18:00:00Z", false],
    ["2027-10-31T18:00:00Z", true],
  ])("uses the local seasonal boundary at %s", (date, expected) => {
    expect(isHalloweenSeason(Date.parse(date))).toBe(expected);
  });
  it("ignores an invalid clock", () => { expect(isHalloweenSeason(NaN)).toBe(false); });
});
