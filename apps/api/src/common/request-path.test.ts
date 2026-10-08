import { describe, expect, it } from "vitest";
import { trimTrailingSlashes } from "./request-path.js";

describe("trimTrailingSlashes", () => {
  it("strips every trailing slash and nothing else", () => {
    expect(trimTrailingSlashes("/api/v1/health")).toBe("/api/v1/health");
    expect(trimTrailingSlashes("/api/v1/health///")).toBe("/api/v1/health");
    expect(trimTrailingSlashes("/a//b/")).toBe("/a//b");
    expect(trimTrailingSlashes("///")).toBe("");
    expect(trimTrailingSlashes("")).toBe("");
  });

  it("returns '' for over-long paths, which match no route", () => {
    expect(trimTrailingSlashes(`/${"a".repeat(3000)}`)).toBe("");
  });

  it("handles a long run of slashes followed by another character in linear time", () => {
    const path = `${"/".repeat(2000)}x`;
    const start = performance.now();
    expect(trimTrailingSlashes(path)).toBe(path);
    expect(performance.now() - start).toBeLessThan(50);
  });
});
