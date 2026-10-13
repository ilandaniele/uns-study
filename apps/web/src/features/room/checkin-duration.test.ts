import { describe, expect, it } from "vitest";
import { CHECKIN_DURATION_CHIPS, clampCheckInMinutes, clockTimeAfter, minutesUntilClockTime, rawMinutesUntilClockTime } from "./checkin-duration";

describe("CHECKIN_DURATION_CHIPS", () => {
  it("maps the chips to minutes, 3 h being the full window", () => {
    expect(CHECKIN_DURATION_CHIPS.map((c) => c.minutes)).toEqual([30, 60, 120, 180]);
  });
});

describe("clampCheckInMinutes", () => {
  it("clamps to 15..180 and rounds", () => {
    expect(clampCheckInMinutes(5)).toBe(15);
    expect(clampCheckInMinutes(500)).toBe(180);
    expect(clampCheckInMinutes(44.6)).toBe(45);
    expect(clampCheckInMinutes(Number.NaN)).toBe(180);
  });
});

describe("minutesUntilClockTime", () => {
  const now = new Date(2026, 8, 29, 10, 0, 0);
  it("returns the minutes to a time later today", () => {
    expect(minutesUntilClockTime("11:30", now)).toBe(90);
  });
  it("clamps too-near and too-far times", () => {
    expect(minutesUntilClockTime("10:05", now)).toBe(15);
    expect(minutesUntilClockTime("18:00", now)).toBe(180);
  });
  it("treats a time already passed as tomorrow (then clamps)", () => {
    expect(minutesUntilClockTime("09:00", now)).toBe(180);
  });
  it("rejects invalid text", () => {
    expect(minutesUntilClockTime("", now)).toBeNull();
    expect(minutesUntilClockTime("25:00", now)).toBeNull();
    expect(minutesUntilClockTime("abc", now)).toBeNull();
  });
});

describe("clockTimeAfter", () => {
  it("formats now + minutes as HH:MM", () => {
    expect(clockTimeAfter(90, new Date(2026, 8, 29, 10, 0, 0))).toBe("11:30");
  });
});

describe("rawMinutesUntilClockTime", () => {
  const now = new Date(2026, 0, 1, 10, 0, 0);
  it("does not clamp", () => {
    expect(rawMinutesUntilClockTime("10:05", now)).toBe(5);
    expect(rawMinutesUntilClockTime("15:00", now)).toBe(300);
  });
  it("rejects invalid text", () => {
    expect(rawMinutesUntilClockTime("", now)).toBeNull();
  });
});
