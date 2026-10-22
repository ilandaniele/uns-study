import { describe, expect, it } from "vitest";
import { nextFabHidden } from "./fab-scroll";

const mid = { scrollY: 600, maxScrollY: 2000 };

describe("nextFabHidden", () => {
  it("hides after scrolling down past the threshold", () => {
    expect(nextFabHidden({ hidden: false, travel: 30, ...mid })).toBe(true);
  });

  it("shows again after scrolling up past the threshold", () => {
    expect(nextFabHidden({ hidden: true, travel: -30, ...mid })).toBe(false);
  });

  it("keeps the current state for small jitters", () => {
    expect(nextFabHidden({ hidden: true, travel: 5, ...mid })).toBe(true);
    expect(nextFabHidden({ hidden: false, travel: -5, ...mid })).toBe(false);
  });

  it("always shows near the top and the bottom of the page", () => {
    expect(nextFabHidden({ hidden: true, travel: 100, scrollY: 40, maxScrollY: 2000 })).toBe(false);
    expect(nextFabHidden({ hidden: true, travel: 100, scrollY: 1950, maxScrollY: 2000 })).toBe(false);
  });
});
