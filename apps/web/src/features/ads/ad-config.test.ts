import { describe, expect, it } from "vitest";
import { isAdSenseAllowed, isAdSenseContentPath, isAdSenseRoomPath } from "./ad-config";

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

describe("isAdSenseRoomPath", () => {
  it("matches only the room home", () => {
    expect(isAdSenseRoomPath("/")).toBe(true);
    for (const p of ["/sala/principal", "/perfil", "/foco", "", null, undefined]) {
      expect(isAdSenseRoomPath(p)).toBe(false);
    }
  });
});

describe("isAdSenseAllowed", () => {
  it("allows every placement on content routes", () => {
    expect(isAdSenseAllowed("community-feed", "/comunidad")).toBe(true);
    expect(isAdSenseAllowed("article", "/guias/tecnica-pomodoro")).toBe(true);
  });

  it("allows only rail and room-bottom on the room home", () => {
    expect(isAdSenseAllowed("rail", "/")).toBe(true);
    expect(isAdSenseAllowed("room-bottom", "/")).toBe(true);
    expect(isAdSenseAllowed("community-feed", "/")).toBe(false);
    expect(isAdSenseAllowed("article", "/")).toBe(false);
  });

  it("blocks app screens", () => {
    for (const p of ["/perfil", "/foco", "/admin", "/sala/principal"]) {
      expect(isAdSenseAllowed("room-bottom", p)).toBe(false);
      expect(isAdSenseAllowed("rail", p)).toBe(false);
    }
  });
});
