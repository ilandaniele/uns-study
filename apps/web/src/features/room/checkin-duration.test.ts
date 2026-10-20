import { describe, expect, it } from "vitest";
import { CHECKIN_DURATION_CHIPS, checkInChoice, chipsUpTo, clampCheckInMinutes, clockTimeAfter, maxCheckInMinutes, minutesUntilClockTime, rawMinutesUntilClockTime } from "./checkin-duration";

describe("CHECKIN_DURATION_CHIPS", () => {
  it("maps the chips to minutes, Pro quick picks", () => {
    expect(CHECKIN_DURATION_CHIPS.map((c) => c.minutes)).toEqual([60, 180, 240, 360]);
  });
});

describe("clampCheckInMinutes", () => {
  it("clamps to 15..720 and rounds", () => {
    expect(clampCheckInMinutes(5)).toBe(15);
    expect(clampCheckInMinutes(900)).toBe(720);
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
    expect(minutesUntilClockTime("18:00", now)).toBe(480);
    expect(minutesUntilClockTime("23:00", now)).toBe(720);
  });
  it("treats a time already passed as tomorrow (then clamps)", () => {
    expect(minutesUntilClockTime("09:00", now)).toBe(720);
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

describe("maxCheckInMinutes / chipsUpTo", () => {
  it("caps free users at 3 h and Pro at 12 h", () => {
    expect(maxCheckInMinutes(false)).toBe(180);
    expect(maxCheckInMinutes(true)).toBe(720);
  });
  it("drops chips longer than the max", () => {
    expect(chipsUpTo(180).map((c) => c.minutes)).toEqual([60, 180]);
    expect(chipsUpTo(720).map((c) => c.minutes)).toEqual([60, 180, 240, 360]);
  });
});

describe("checkInChoice", () => {
  const now = new Date(2026, 0, 1, 10, 0, 0);
  it("accepts times inside the range, including the edges", () => {
    expect(checkInChoice("10:15", now, 180)).toEqual({ ok: true, minutes: 15 });
    expect(checkInChoice("13:00", now, 180)).toEqual({ ok: true, minutes: 180 });
    expect(checkInChoice("22:00", now, 720)).toEqual({ ok: true, minutes: 720 });
  });
  it("rejects too-near times", () => {
    expect(checkInChoice("10:05", now, 180).ok).toBe(false);
  });
  it("rejects too-far times with the upsell hint for free users only", () => {
    expect(checkInChoice("14:00", now, 180)).toEqual({ ok: false, message: "Podés elegir hasta 3 h. Con Pro, hasta 12 h." });
    expect(checkInChoice("23:00", now, 720)).toEqual({ ok: false, message: "Podés elegir hasta 12 h." });
  });
  it("rejects invalid text", () => {
    expect(checkInChoice("", now, 180).ok).toBe(false);
  });
});
