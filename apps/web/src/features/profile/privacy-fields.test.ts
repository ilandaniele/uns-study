import { describe, expect, it } from "vitest";
import type { PrivacySettingsDto } from "@uns/contracts";
import { PRIVACY_FIELDS, privacyFieldDisabled } from "./privacy-fields";

const ALL_OFF: PrivacySettingsDto = {
  showFullName: false,
  showNickname: false,
  showCareer: false,
  showCurrentSubject: false,
  showInstagram: false,
  showStudentNumber: false,
  showAvatar: false,
  showInRoom: false,
  showSeat: false,
  allowDirectMessages: true,
};

describe("PRIVACY_FIELDS", () => {
  it("covers every boolean field of PrivacySettingsDto exactly once", () => {
    const keys = PRIVACY_FIELDS.map((f) => f.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys.sort()).toEqual(Object.keys(ALL_OFF).sort());
  });
});

describe("privacyFieldDisabled", () => {
  it("disables showSeat when showInRoom is off", () => {
    expect(privacyFieldDisabled("showSeat", ALL_OFF)).toBe(true);
  });

  it("enables showSeat when showInRoom is on", () => {
    expect(privacyFieldDisabled("showSeat", { ...ALL_OFF, showInRoom: true })).toBe(false);
  });

  it("never disables unrelated fields", () => {
    expect(privacyFieldDisabled("showCareer", ALL_OFF)).toBe(false);
  });
});
