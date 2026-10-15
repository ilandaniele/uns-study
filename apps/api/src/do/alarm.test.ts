import { describe, expect, it, vi } from "vitest";
import { armAlarm, rearmIfEarlier, type AlarmStorage } from "./alarm.js";

function storage(current: number | null): AlarmStorage & { setAlarm: ReturnType<typeof vi.fn>; deleteAlarm: ReturnType<typeof vi.fn> } {
  return { getAlarm: vi.fn(async () => current), setAlarm: vi.fn(async () => undefined), deleteAlarm: vi.fn(async () => undefined) };
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

  it("armAlarm sets the exact time when it differs from the pending alarm", async () => {
    const s = storage(1_000);
    await armAlarm(s, new Date(9_000));
    expect(s.setAlarm).toHaveBeenCalledWith(9_000);
  });

  it("armAlarm skips setAlarm when the alarm is already at that time", async () => {
    const s = storage(9_000);
    await armAlarm(s, new Date(9_000));
    expect(s.setAlarm).not.toHaveBeenCalled();
    expect(s.deleteAlarm).not.toHaveBeenCalled();
  });

  it("armAlarm clears a pending alarm when no one-shot is due, and does nothing without one", async () => {
    const pending = storage(1_000);
    await armAlarm(pending, null);
    expect(pending.deleteAlarm).toHaveBeenCalledTimes(1);
    expect(pending.setAlarm).not.toHaveBeenCalled();

    const none = storage(null);
    await armAlarm(none, null);
    expect(none.deleteAlarm).not.toHaveBeenCalled();
    expect(none.setAlarm).not.toHaveBeenCalled();
  });
});
