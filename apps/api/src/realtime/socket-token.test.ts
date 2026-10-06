import { describe, expect, it, vi } from "vitest";
import { signSocketToken, verifySocketToken } from "./socket-token.js";

const SECRET = "unit-test-secret";
const CLAIMS = { userId: "user-1", sessionId: "sess-1" };

describe("signSocketToken / verifySocketToken", () => {
  it("round-trips: a freshly signed token verifies to the same userId and sessionId", () => {
    const { token } = signSocketToken("user-1", "sess-1", SECRET);
    expect(verifySocketToken(token, SECRET)).toEqual(CLAIMS);
  });

  it("rejects a token signed with a different secret", () => {
    const { token } = signSocketToken("user-1", "sess-1", SECRET);
    expect(verifySocketToken(token, "other-secret")).toBeNull();
  });

  it("rejects a tampered payload (userId changed after signing)", () => {
    const { token } = signSocketToken("user-1", "sess-1", SECRET);
    const [, sessionId, exp, sig] = token.split(".");
    expect(verifySocketToken(`user-2.${sessionId}.${exp}.${sig}`, SECRET)).toBeNull();
  });

  it("rejects a tampered payload (sessionId changed after signing)", () => {
    const { token } = signSocketToken("user-1", "sess-1", SECRET);
    const [userId, , exp, sig] = token.split(".");
    expect(verifySocketToken(`${userId}.sess-2.${exp}.${sig}`, SECRET)).toBeNull();
  });

  it("rejects a tampered signature", () => {
    const { token } = signSocketToken("user-1", "sess-1", SECRET);
    const [userId, sessionId, exp] = token.split(".");
    expect(verifySocketToken(`${userId}.${sessionId}.${exp}.not-the-real-signature`, SECRET)).toBeNull();
  });

  it("rejects malformed tokens, including the old three-part format", () => {
    expect(verifySocketToken("not-enough-parts", SECRET)).toBeNull();
    expect(verifySocketToken("a.b.c", SECRET)).toBeNull();
    expect(verifySocketToken("a.b.c.d.e", SECRET)).toBeNull();
    expect(verifySocketToken("", SECRET)).toBeNull();
  });

  it("expires after its TTL", () => {
    vi.useFakeTimers();
    try {
      const { token, expiresAt } = signSocketToken("user-1", "sess-1", SECRET);
      vi.setSystemTime(expiresAt - 1);
      expect(verifySocketToken(token, SECRET)).toEqual(CLAIMS);
      vi.setSystemTime(expiresAt + 1);
      expect(verifySocketToken(token, SECRET)).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});
