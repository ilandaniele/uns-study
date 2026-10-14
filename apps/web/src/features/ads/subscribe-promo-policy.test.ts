import { describe, expect, it } from "vitest";
import type { StorageLike } from "./ad-policy";
import {
  PROMO_CHANCE,
  PROMO_LAST_SHOWN_KEY,
  PROMO_MIN_GAP_MS,
  PROMO_NEW_VISITOR_GRACE_MS,
  markPromoShown,
  nextPromoDelayMs,
  shouldShowSubscribePromo,
} from "./subscribe-promo-policy";

function fakeStorage(seed: Record<string, string> = {}): StorageLike & { data: Map<string, string> } {
  const data = new Map<string, string>(Object.entries(seed));
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) };
}

const T0 = 1_700_000_000_000;
const FIRST_SEEN = "sala.ads.firstSeenAt";
const old = { [FIRST_SEEN]: String(T0 - PROMO_NEW_VISITOR_GRACE_MS - 1) };
const args = { now: T0, pathname: "/", random: () => 0 };

describe("shouldShowSubscribePromo", () => {
  it("shows for a returning visitor on a lucky roll", () => {
    expect(shouldShowSubscribePromo({ ...args, storage: fakeStorage(old) })).toBe(true);
  });

  it("never shows without a firstSeenAt or during the new-visitor grace", () => {
    expect(shouldShowSubscribePromo({ ...args, storage: fakeStorage() })).toBe(false);
    const fresh = fakeStorage({ [FIRST_SEEN]: String(T0 - PROMO_NEW_VISITOR_GRACE_MS + 1) });
    expect(shouldShowSubscribePromo({ ...args, storage: fresh })).toBe(false);
  });

  it("skips excluded paths", () => {
    for (const pathname of ["/suscripcion", "/foco", "/admin/mails", "/login"]) {
      expect(shouldShowSubscribePromo({ ...args, pathname, storage: fakeStorage(old) })).toBe(false);
    }
  });

  it("respects the minimum gap", () => {
    const recent = fakeStorage({ ...old, [PROMO_LAST_SHOWN_KEY]: String(T0 - PROMO_MIN_GAP_MS + 1) });
    expect(shouldShowSubscribePromo({ ...args, storage: recent })).toBe(false);
    const past = fakeStorage({ ...old, [PROMO_LAST_SHOWN_KEY]: String(T0 - PROMO_MIN_GAP_MS) });
    expect(shouldShowSubscribePromo({ ...args, storage: past })).toBe(true);
  });

  it("only passes below the chance", () => {
    const storage = fakeStorage(old);
    expect(shouldShowSubscribePromo({ ...args, storage, random: () => PROMO_CHANCE - 0.001 })).toBe(true);
    expect(shouldShowSubscribePromo({ ...args, storage, random: () => PROMO_CHANCE })).toBe(false);
  });

  it("fails closed when storage throws", () => {
    const broken: StorageLike = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    };
    expect(shouldShowSubscribePromo({ ...args, storage: broken })).toBe(false);
    expect(() => markPromoShown(broken, T0)).not.toThrow();
  });
});

describe("markPromoShown", () => {
  it("records the time", () => {
    const storage = fakeStorage();
    markPromoShown(storage, T0);
    expect(storage.data.get(PROMO_LAST_SHOWN_KEY)).toBe(String(T0));
  });
});

describe("nextPromoDelayMs", () => {
  it("spans 45-150 s for the first check", () => {
    expect(nextPromoDelayMs(0, true)).toBe(45_000);
    expect(nextPromoDelayMs(1, true)).toBe(150_000);
  });

  it("spans 3-6 min afterwards", () => {
    expect(nextPromoDelayMs(0, false)).toBe(180_000);
    expect(nextPromoDelayMs(1, false)).toBe(360_000);
  });
});
