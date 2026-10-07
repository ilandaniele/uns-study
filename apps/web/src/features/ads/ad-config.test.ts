import { describe, expect, it } from "vitest";
import { isAdSenseContentPath } from "./ad-config";

describe("isAdSenseContentPath", () => {
  it("allows the community feed", () => {
    expect(isAdSenseContentPath("/comunidad")).toBe(true);
  });

  it("blocks app, auth and empty screens", () => {
    for (const p of ["/", "/sala/principal", "/login", "/perfil", "/chat", "/ranking", "/foco", "/admin", "/q/abc", null]) {
      expect(isAdSenseContentPath(p)).toBe(false);
    }
  });

  it("does not match a prefix lookalike", () => {
    expect(isAdSenseContentPath("/comunidades")).toBe(false);
  });
});
