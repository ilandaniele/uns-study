import { describe, expect, it } from "vitest";
import type { PrivacySettingsDto } from "@uns/contracts";
import { PRIVACY_FIELDS } from "./privacy-fields";

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
  showInRanking: true,
  showAliasAnimalOnMap: true,
};

describe("PRIVACY_FIELDS", () => {
  it("covers every live boolean field of PrivacySettingsDto exactly once", () => {
    const keys = PRIVACY_FIELDS.map((f) => f.key);
    expect(new Set(keys).size).toBe(keys.length);
    // showInRoom / showSeat are legacy columns: they no longer decide visibility, so there is no toggle for them.
    expect(keys.sort()).toEqual(Object.keys(ALL_OFF).filter((k) => k !== "showInRoom" && k !== "showSeat").sort());
  });
});
