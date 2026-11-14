import { describe, expect, it } from "vitest";
import { announcementInstant } from "./announcement-schedule";

describe("Bahía Blanca closure schedule", () => {
  it("does not interpret wall-clock inputs in the administrator's device timezone", () => {
    expect(announcementInstant("2026-11-14T22:00")).toBe("2026-11-15T01:00:00.000Z");
    expect(announcementInstant("2026-11-15T08:00")).toBe("2026-11-15T11:00:00.000Z");
  });
  it("allows immediate or indefinite schedules", () => { expect(announcementInstant("")).toBeUndefined(); });
  it.each(["2026-02-30T08:00", "2026-11-14T25:00", "2026-11-14", "invalid"])("rejects invalid dates: %s", value => {
    expect(() => announcementInstant(value)).toThrow("fecha");
  });
});
