import { describe, expect, it } from "vitest";
import type { MyProfileDto, PrivacySettingsDto } from "@sala/contracts";
import { identityAlreadyVisible, markIdentityAsked, promptName, shouldAskIdentity } from "./identity-prompt";

function memoryStorage() {
  const map = new Map<string, string>();
  return { getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => void map.set(k, v) };
}

describe("identity prompt", () => {
  it("asks each user once per browser", () => {
    const storage = memoryStorage();
    expect(shouldAskIdentity("u1", storage)).toBe(true);
    markIdentityAsked("u1", storage);
    expect(shouldAskIdentity("u1", storage)).toBe(false);
    expect(shouldAskIdentity("u2", storage)).toBe(true);
    expect(shouldAskIdentity("u1", null)).toBe(false);
  });

  it("skips users that already show a name and a photo", () => {
    const profile = { identityMode: "FULL_NAME", avatarUrl: "https://x/a.jpg" } as MyProfileDto;
    const privacy = { showAvatar: true } as PrivacySettingsDto;
    expect(identityAlreadyVisible(profile, privacy)).toBe(true);
    expect(identityAlreadyVisible({ ...profile, identityMode: "HIDDEN" }, privacy)).toBe(false);
    expect(identityAlreadyVisible(profile, { ...privacy, showAvatar: false })).toBe(false);
    expect(identityAlreadyVisible({ ...profile, avatarUrl: null }, privacy)).toBe(false);
  });

  it("falls back to the account name when the profile has none", () => {
    expect(promptName({ firstName: "Ana", lastName: "Pérez" }, "Otra Cosa")).toEqual({ firstName: "Ana", lastName: "Pérez" });
    expect(promptName({ firstName: null, lastName: null }, "Juan Martín López")).toEqual({ firstName: "Juan", lastName: "Martín López" });
    expect(promptName({ firstName: null, lastName: null }, null)).toEqual({ firstName: "", lastName: "" });
  });
});
