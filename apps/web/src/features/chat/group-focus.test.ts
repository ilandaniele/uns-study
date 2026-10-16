import { describe, expect, it } from "vitest";
import { formatCountdown, parseFocusMinutes, remainingMs } from "./group-focus";

describe("remainingMs", () => {
  const focus = { endsAt: "2026-10-16T12:00:00.000Z" };
  const end = Date.parse(focus.endsAt);

  it("counts down to the end", () => {
    expect(remainingMs(focus, end - 90_000)).toBe(90_000);
  });

  it("clamps at 0 once the timer is over", () => {
    expect(remainingMs(focus, end)).toBe(0);
    expect(remainingMs(focus, end + 5_000)).toBe(0);
  });

  it("is 0 without a timer or with a bad date", () => {
    expect(remainingMs(null, end)).toBe(0);
    expect(remainingMs({ endsAt: "nope" }, end)).toBe(0);
  });
});

describe("formatCountdown", () => {
  it("formats minutes and seconds", () => {
    expect(formatCountdown(25 * 60_000)).toBe("25:00");
    expect(formatCountdown(65_000)).toBe("01:05");
    expect(formatCountdown(9_000)).toBe("00:09");
  });

  it("rounds a partial second up", () => {
    expect(formatCountdown(1)).toBe("00:01");
    expect(formatCountdown(59_001)).toBe("01:00");
  });

  it("adds hours from one hour up", () => {
    expect(formatCountdown(90 * 60_000)).toBe("1:30:00");
    expect(formatCountdown(180 * 60_000)).toBe("3:00:00");
  });

  it("clamps negatives at 0", () => {
    expect(formatCountdown(-5_000)).toBe("00:00");
    expect(formatCountdown(0)).toBe("00:00");
  });
});

describe("parseFocusMinutes", () => {
  it("accepts 5..180", () => {
    expect(parseFocusMinutes("5")).toBe(5);
    expect(parseFocusMinutes(" 45 ")).toBe(45);
    expect(parseFocusMinutes("180")).toBe(180);
  });

  it("rejects out-of-range and non-integers", () => {
    expect(parseFocusMinutes("4")).toBeNull();
    expect(parseFocusMinutes("181")).toBeNull();
    expect(parseFocusMinutes("")).toBeNull();
    expect(parseFocusMinutes("2.5")).toBeNull();
    expect(parseFocusMinutes("-10")).toBeNull();
    expect(parseFocusMinutes("abc")).toBeNull();
  });
});
