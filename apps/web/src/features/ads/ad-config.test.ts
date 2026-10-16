import { describe, expect, it } from "vitest";
import { isAdSenseContentPath } from "./ad-config";

describe("isAdSenseContentPath", () => {
  it("allows the community feed and the study guides", () => {
    expect(isAdSenseContentPath("/comunidad")).toBe(true);
    expect(isAdSenseContentPath("/guias")).toBe(true);
    expect(isAdSenseContentPath("/guias/tecnica-pomodoro")).toBe(true);
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
