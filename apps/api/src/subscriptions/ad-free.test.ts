import { describe, expect, it } from "vitest";
import { isAdFree } from "./ad-free.js";

describe("isAdFree", () => {
  it("is true for an authorized subscriber", () => {
    expect(isAdFree({ subscriptionStatus: "authorized", roles: [] })).toBe(true);
  });

  it("is true for admins and moderators without a subscription", () => {
    expect(isAdFree({ subscriptionStatus: undefined, roles: ["ADMIN"] })).toBe(true);
    expect(isAdFree({ subscriptionStatus: "cancelled", roles: ["MODERATOR"] })).toBe(true);
  });

  it("is false for a regular user without an authorized subscription", () => {
    expect(isAdFree({ subscriptionStatus: undefined, roles: [] })).toBe(false);
    expect(isAdFree({ subscriptionStatus: "pending", roles: [] })).toBe(false);
  });
});
