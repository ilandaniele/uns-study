import { describe, expect, it } from "vitest";
import { nextNavigationCount } from "../nav-history";

describe("nextNavigationCount", () => {
  it("does not count the first pathname", () => {
    expect(nextNavigationCount(0, null, "/")).toBe(0);
  });
  it("counts a pathname change", () => {
    expect(nextNavigationCount(0, "/", "/personas")).toBe(1);
  });
  it("ignores repeats of the same pathname", () => {
    expect(nextNavigationCount(2, "/personas", "/personas")).toBe(2);
  });
});
