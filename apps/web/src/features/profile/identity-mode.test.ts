import { describe, expect, it } from "vitest";
import { IDENTITY_MODES, identityModeHint, identityModeLabel, needsRoomVisibility, previewDisplayName } from "./identity-mode";

describe("identityModeLabel", () => {
  it("returns a distinct Spanish label for every mode", () => {
    const labels = IDENTITY_MODES.map(identityModeLabel);
    expect(new Set(labels).size).toBe(IDENTITY_MODES.length);
  });

  it("labels HIDDEN as the private default", () => {
    expect(identityModeLabel("HIDDEN")).toMatch(/oculto/i);
  });
});

describe("identityModeHint", () => {
  it("explains that hidden mode shows a random alias instead of your name", () => {
    expect(identityModeHint("HIDDEN")).toMatch(/apodo/i);
  });

  it("gives the generic hint for visible modes", () => {
    expect(identityModeHint("FULL_NAME")).toMatch(/verán otras personas/i);
  });
});

describe("previewDisplayName", () => {
  const f = { firstName: "Ilan", lastName: "Daniele", nickname: "Ilancho" };
  it("resolves each visible mode", () => {
    expect(previewDisplayName("NICKNAME", f)).toBe("Ilancho");
    expect(previewDisplayName("FIRST_NAME", f)).toBe("Ilan");
    expect(previewDisplayName("FULL_NAME", f)).toBe("Ilan Daniele");
    expect(previewDisplayName("NICKNAME_AND_NAME", f)).toBe("Ilancho (Ilan)");
  });
  it("is null for HIDDEN or empty fields", () => {
    expect(previewDisplayName("HIDDEN", f)).toBeNull();
    expect(previewDisplayName("NICKNAME", { ...f, nickname: " " })).toBeNull();
  });
});

describe("needsRoomVisibility", () => {
  it("only for visible modes with room/seat toggles off", () => {
    expect(needsRoomVisibility("NICKNAME", { showInRoom: false, showSeat: false })).toBe(true);
    expect(needsRoomVisibility("NICKNAME", { showInRoom: true, showSeat: false })).toBe(true);
    expect(needsRoomVisibility("NICKNAME", { showInRoom: true, showSeat: true })).toBe(false);
    expect(needsRoomVisibility("HIDDEN", { showInRoom: false, showSeat: false })).toBe(false);
  });
});
