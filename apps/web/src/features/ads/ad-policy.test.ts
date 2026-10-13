import { describe, expect, it } from "vitest";
import { APP_OPEN_CAP_MS, PRE_CHECKIN_CAP_MS, REWARD_SNOOZE_MS } from "./ad-config";
import { getSnoozedUntil, markShown, shouldShowAppOpen, shouldShowPreCheckIn, snooze, type StorageLike } from "./ad-policy";

function fakeStorage(): StorageLike & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
  };
}

const T0 = 1_700_000_000_000;
const base = { pathname: "/sala/principal" };

describe("shouldShowAppOpen", () => {
  it("skips the first ever visit and records it", () => {
    const storage = fakeStorage();
    expect(shouldShowAppOpen({ ...base, now: T0, storage })).toBe(false);
    expect(storage.data.get("sala.ads.firstSeenAt")).toBe(String(T0));
    expect(shouldShowAppOpen({ ...base, now: T0 + 1000, storage })).toBe(true);
  });

  it("skips excluded routes", () => {
    const storage = fakeStorage();
    shouldShowAppOpen({ ...base, now: T0, storage });
    for (const pathname of ["/admin", "/admin/mails", "/login", "/privacidad", "/terminos"]) {
      expect(shouldShowAppOpen({ ...base, pathname, now: T0 + 1, storage })).toBe(false);
    }
    expect(shouldShowAppOpen({ ...base, pathname: "/administrar", now: T0 + 1, storage })).toBe(true);
  });

  it("shows again on the next open once the short anti-stacking gap has passed", () => {
    const storage = fakeStorage();
    shouldShowAppOpen({ ...base, now: T0, storage });
    markShown("app_open", T0 + 10, storage);
    expect(shouldShowAppOpen({ ...base, now: T0 + 10 + APP_OPEN_CAP_MS - 1, storage })).toBe(false);
    expect(shouldShowAppOpen({ ...base, now: T0 + 10 + APP_OPEN_CAP_MS, storage })).toBe(true);
  });

  it("is suppressed while snoozed", () => {
    const storage = fakeStorage();
    shouldShowAppOpen({ ...base, now: T0, storage });
    const until = snooze(T0 + 1, storage);
    expect(shouldShowAppOpen({ ...base, now: until - 1, storage })).toBe(false);
    expect(shouldShowAppOpen({ ...base, now: until, storage })).toBe(true);
  });
});

describe("shouldShowPreCheckIn", () => {
  it("shows when nothing is recorded", () => {
    expect(shouldShowPreCheckIn({ now: T0, storage: fakeStorage() })).toBe(true);
  });

  it("respects the 20 minute cap", () => {
    const storage = fakeStorage();
    markShown("pre_checkin", T0, storage);
    expect(shouldShowPreCheckIn({ now: T0 + PRE_CHECKIN_CAP_MS - 1, storage })).toBe(false);
    expect(shouldShowPreCheckIn({ now: T0 + PRE_CHECKIN_CAP_MS, storage })).toBe(true);
  });

  it("is independent from the app-open cap", () => {
    const storage = fakeStorage();
    markShown("app_open", T0, storage);
    expect(shouldShowPreCheckIn({ now: T0 + 1, storage })).toBe(true);
  });

  it("is suppressed while snoozed", () => {
    const storage = fakeStorage();
    snooze(T0, storage);
    expect(shouldShowPreCheckIn({ now: T0 + REWARD_SNOOZE_MS - 1, storage })).toBe(false);
    expect(shouldShowPreCheckIn({ now: T0 + REWARD_SNOOZE_MS, storage })).toBe(true);
  });
});

describe("storage failures", () => {
  const broken: StorageLike = {
    getItem: () => {
      throw new Error("blocked");
    },
    setItem: () => {
      throw new Error("blocked");
    },
  };

  it("never throws", () => {
    expect(() => shouldShowAppOpen({ ...base, now: T0, storage: broken })).not.toThrow();
    expect(() => shouldShowPreCheckIn({ now: T0, storage: broken })).not.toThrow();
    expect(() => markShown("app_open", T0, broken)).not.toThrow();
    expect(() => snooze(T0, broken)).not.toThrow();
    expect(getSnoozedUntil(broken)).toBeNull();
  });

  it("fails closed: no ad when storage is unavailable", () => {
    expect(shouldShowAppOpen({ ...base, now: T0, storage: broken })).toBe(false);
    expect(shouldShowPreCheckIn({ now: T0, storage: broken })).toBe(false);
  });
});
