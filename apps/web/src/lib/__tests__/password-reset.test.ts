import { describe, expect, it } from "vitest";
import { RATE_LIMITED_MESSAGE, RESET_LINK_INVALID_MESSAGE, resetErrorMessage, validateNewPassword } from "../password-reset";

describe("validateNewPassword", () => {
  it("rejects short passwords, mismatches, and accepts a valid pair", () => {
    expect(validateNewPassword("short", "short")).toMatch(/al menos 8/);
    expect(validateNewPassword("longenough1", "different1")).toMatch(/no coinciden/);
    expect(validateNewPassword("longenough1", "longenough1")).toBeNull();
  });
});

describe("resetErrorMessage", () => {
  it("maps the invalid token query param and API codes", () => {
    expect(resetErrorMessage("INVALID_TOKEN")).toBe(RESET_LINK_INVALID_MESSAGE);
    expect(resetErrorMessage({ code: "INVALID_TOKEN", status: 400 })).toBe(RESET_LINK_INVALID_MESSAGE);
  });

  it("maps 429 to the rate-limit copy", () => {
    expect(resetErrorMessage({ status: 429 })).toBe(RATE_LIMITED_MESSAGE);
  });

  it("falls back to a generic message", () => {
    expect(resetErrorMessage({ code: "WHATEVER", status: 500 })).toMatch(/No pudimos/);
  });
});
