import { describe, expect, it } from "vitest";
import { isRoomDaytime } from "./room-lighting";

describe("room photo local schedule", () => {
  it.each([
    ["2026-10-23T06:59:59-03:00", false],
    ["2026-10-23T07:00:00-03:00", true],
    ["2026-10-23T19:59:59-03:00", true],
    ["2026-10-23T20:00:00-03:00", false],
    ["2026-10-24T00:00:00-03:00", false],
    ["2026-10-24T01:22:00-03:00", false],
    // The same local boundaries expressed in other zones.
    ["2026-10-23T10:00:00Z", true],
    ["2026-10-24T08:00:00+09:00", false],
  ])("selects the correct photo at %s", (date, expected) => {
    expect(isRoomDaytime(Date.parse(date))).toBe(expected);
  });
});
