import { describe, expect, it } from "vitest";
import { markHowToSeen, shouldShowHowToOnFirstVisit } from "./how-to-seen";

function memoryStorage() {
  const data = new Map<string, string>();
  return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v) };
}

describe("how-to first visit", () => {
  it("shows once, then never again after it is marked seen", () => {
    const storage = memoryStorage();
    expect(shouldShowHowToOnFirstVisit(storage)).toBe(true);
    markHowToSeen(storage);
    expect(shouldShowHowToOnFirstVisit(storage)).toBe(false);
  });

  it("does not show when storage is missing or throws", () => {
    expect(shouldShowHowToOnFirstVisit(null)).toBe(false);
    const throwing = { getItem: () => { throw new Error("blocked"); } };
    expect(shouldShowHowToOnFirstVisit(throwing)).toBe(false);
  });
});
