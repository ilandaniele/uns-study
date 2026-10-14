import { describe, expect, it, vi } from "vitest";
import { ALARM_OVERDUE_GRACE_MS, armAlarm, rearmIfEarlier, shouldRunOnTick, type AlarmStorage } from "./alarm.js";

function storage(current: number | null): AlarmStorage & { setAlarm: ReturnType<typeof vi.fn> } {
  return { getAlarm: vi.fn(async () => current), setAlarm: vi.fn(async () => undefined) };
}

describe("alarm helpers", () => {
  it("rearmIfEarlier sets the alarm when none is pending or the new time is earlier", async () => {
    const none = storage(null);
    await rearmIfEarlier(none, new Date(5_000));
    expect(none.setAlarm).toHaveBeenCalledWith(5_000);

    const later = storage(10_000);
    await rearmIfEarlier(later, new Date(5_000));
    expect(later.setAlarm).toHaveBeenCalledWith(5_000);
  });

  it("rearmIfEarlier never postpones a pending alarm and ignores a null next", async () => {
    const s = storage(5_000);
    await rearmIfEarlier(s, new Date(9_000));
    await rearmIfEarlier(s, null);
    expect(s.setAlarm).not.toHaveBeenCalled();
  });

  it("armAlarm sets the exact time, or nothing when no job is pending", async () => {
    const s = storage(1_000);
    await armAlarm(s, new Date(9_000));
    expect(s.setAlarm).toHaveBeenCalledWith(9_000);
    await armAlarm(s, null);
    expect(s.setAlarm).toHaveBeenCalledTimes(1);
  });

  it("shouldRunOnTick fires when the alarm is missing or overdue past the grace period", () => {
    const now = 1_000_000;
    expect(shouldRunOnTick(null, now)).toBe(true);
    expect(shouldRunOnTick(now - ALARM_OVERDUE_GRACE_MS - 1, now)).toBe(true);
    expect(shouldRunOnTick(now - 1_000, now)).toBe(false);
    expect(shouldRunOnTick(now + 30_000, now)).toBe(false);
  });
});
