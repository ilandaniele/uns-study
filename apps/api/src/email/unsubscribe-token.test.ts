import { describe, expect, it } from "vitest";
import { unsubscribeToken, verifyUnsubscribeToken } from "./unsubscribe-token.js";

describe("unsubscribe token", () => {
  it("verifies a token for the same user and secret", () => {
    const token = unsubscribeToken("user-1", "secret");
    expect(verifyUnsubscribeToken("user-1", token, "secret")).toBe(true);
  });

  it("is url-safe and stable", () => {
    const token = unsubscribeToken("user-1", "secret");
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(unsubscribeToken("user-1", "secret")).toBe(token);
  });

  it("rejects another user, another secret, a tampered or empty token", () => {
    const token = unsubscribeToken("user-1", "secret");
    expect(verifyUnsubscribeToken("user-2", token, "secret")).toBe(false);
    expect(verifyUnsubscribeToken("user-1", token, "other")).toBe(false);
    expect(verifyUnsubscribeToken("user-1", `${token}x`, "secret")).toBe(false);
    expect(verifyUnsubscribeToken("user-1", "", "secret")).toBe(false);
    expect(verifyUnsubscribeToken("user-1", token, "")).toBe(false);
  });
});
