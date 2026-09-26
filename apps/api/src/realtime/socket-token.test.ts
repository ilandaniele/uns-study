import { describe, expect, it, vi } from "vitest";
import { signSocketToken, verifySocketToken } from "./socket-token.js";

const SECRET = "unit-test-secret";

describe("signSocketToken / verifySocketToken", () => {
  it("round-trips: a freshly signed token verifies to the same userId", () => {
    const { token } = signSocketToken("user-1", SECRET);
    expect(verifySocketToken(token, SECRET)).toBe("user-1");
  });

  it("rejects a token signed with a different secret", () => {
    const { token } = signSocketToken("user-1", SECRET);
    expect(verifySocketToken(token, "other-secret")).toBeNull();
  });

  it("rejects a tampered payload (userId changed after signing)", () => {
    const { token } = signSocketToken("user-1", SECRET);
    const [, exp, sig] = token.split(".");
    expect(verifySocketToken(`user-2.${exp}.${sig}`, SECRET)).toBeNull();
  });

  it("rejects a tampered signature", () => {
    const { token } = signSocketToken("user-1", SECRET);
    const [userId, exp] = token.split(".");
    expect(verifySocketToken(`${userId}.${exp}.not-the-real-signature`, SECRET)).toBeNull();
  });

  it("rejects malformed tokens", () => {
    expect(verifySocketToken("not-enough-parts", SECRET)).toBeNull();
    expect(verifySocketToken("a.b.c.d", SECRET)).toBeNull();
    expect(verifySocketToken("", SECRET)).toBeNull();
  });

  it("expires after its TTL", () => {
    vi.useFakeTimers();
    try {
      const { token, expiresAt } = signSocketToken("user-1", SECRET);
      vi.setSystemTime(expiresAt - 1);
      expect(verifySocketToken(token, SECRET)).toBe("user-1");
      vi.setSystemTime(expiresAt + 1);
      expect(verifySocketToken(token, SECRET)).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});
