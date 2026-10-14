import { describe, expect, it } from "vitest";
import { PRO_BENEFITS, PRO_FEATURES, proLockState } from "./pro";

describe("proLockState", () => {
  it("is unknown while there is no data", () => {
    expect(proLockState(null, true)).toBe("unknown");
    expect(proLockState(null, false)).toBe("unknown");
  });
  it("unlocks for subscribers", () => {
    expect(proLockState({ adFree: true, subscriptionsEnabled: true }, false)).toBe("unlocked");
  });
  it("does not lock when subscriptions are not on sale", () => {
    expect(proLockState({ adFree: false, subscriptionsEnabled: false }, false)).toBe("unlocked");
  });
  it("locks free users when subscriptions are enabled", () => {
    expect(proLockState({ adFree: false, subscriptionsEnabled: true }, false)).toBe("locked");
  });
});

describe("pro copy", () => {
  it("describes every feature", () => {
    for (const f of Object.values(PRO_FEATURES)) {
      expect(f.title).not.toBe("");
      expect(f.description).not.toBe("");
    }
    expect(PRO_BENEFITS.length).toBeGreaterThan(0);
  });
});
