import { describe, expect, it } from "vitest";
import { parseCursor } from "./admin-audit.service.js";

describe("parseCursor", () => {
  it("returns null for a missing or malformed cursor", () => {
    expect(parseCursor(undefined)).toBeNull();
    expect(parseCursor("")).toBeNull();
    expect(parseCursor("not-a-date")).toBeNull();
  });

  it("parses an ISO timestamp", () => {
    expect(parseCursor("2026-01-02T03:04:05.000Z")?.toISOString()).toBe("2026-01-02T03:04:05.000Z");
  });
});
