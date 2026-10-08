import { describe, expect, it } from "vitest";
import { buenosAiresLocalToIso } from "./manual-study-session";

describe("buenosAiresLocalToIso", () => {
  it("adds the fixed UTC-3 offset", () => {
    expect(buenosAiresLocalToIso("2026-10-08T14:30")).toBe("2026-10-08T17:30:00.000Z");
  });

  it("rolls over midnight UTC", () => {
    expect(buenosAiresLocalToIso("2026-12-31T22:00")).toBe("2027-01-01T01:00:00.000Z");
  });

  it("rejects empty or malformed input", () => {
    expect(buenosAiresLocalToIso("")).toBeNull();
    expect(buenosAiresLocalToIso("hoy")).toBeNull();
  });
});
