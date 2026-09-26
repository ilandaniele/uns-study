import { describe, expect, it } from "vitest";
import type { Auth } from "../auth/auth.instance.js";
import { resolveSocketUserId } from "./room-realtime.gateway.js";

function mockAuth(getSession: (...args: unknown[]) => Promise<unknown>): Auth {
  return { api: { getSession } } as unknown as Auth;
}

describe("resolveSocketUserId", () => {
  it("returns the user id when the session cookie is valid", async () => {
    const auth = mockAuth(async () => ({ user: { id: "u1" } }));
    await expect(resolveSocketUserId(auth, { cookie: "session=abc" })).resolves.toBe("u1");
  });

  it("returns null when there is no session", async () => {
    const auth = mockAuth(async () => null);
    await expect(resolveSocketUserId(auth, {})).resolves.toBeNull();
  });

  it("returns null instead of throwing when the auth call fails", async () => {
    const auth = mockAuth(async () => {
      throw new Error("boom");
    });
    await expect(resolveSocketUserId(auth, {})).resolves.toBeNull();
  });
});
