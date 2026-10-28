import { describe, expect, it } from "vitest";
import type { PrivacySettingsDto } from "@sala/contracts";
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
  showInPeopleSearch: true,
  allowFriendRequests: true,
  showInRanking: true,
  showAliasAnimalOnMap: true,
  showAdminBadge: true,
};

describe("PRIVACY_FIELDS", () => {
  it("covers every live boolean field of PrivacySettingsDto exactly once", () => {
    const keys = PRIVACY_FIELDS.map((f) => f.key);
    expect(new Set(keys).size).toBe(keys.length);
    // showInRoom / showSeat / showFullName / showNickname are legacy columns: they no longer decide visibility
    // (the displayed name comes from identityMode), so there is no toggle for them.
    const legacy = ["showInRoom", "showSeat", "showFullName", "showNickname"];
    expect(keys.sort()).toEqual(Object.keys(ALL_OFF).filter((k) => !legacy.includes(k)).sort());
  });
});
