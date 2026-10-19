import type { MyProfileDto, PrivacySettingsDto } from "@sala/contracts";

const KEY_PREFIX = "sala:identity-prompt-seen:v1:";

/** True when this browser has not asked `userId` yet. Storage errors count as asked, so a blocked store never nags. */
export function shouldAskIdentity(userId: string, storage: Pick<Storage, "getItem"> | null = safeStorage()): boolean {
  try {
    return storage != null && storage.getItem(KEY_PREFIX + userId) == null;
  } catch {
    return false;
  }
}

export function markIdentityAsked(userId: string, storage: Pick<Storage, "setItem"> | null = safeStorage()): void {
  try {
    storage?.setItem(KEY_PREFIX + userId, "1");
  } catch {
    // Private mode or blocked storage: the question may come back next visit, which is harmless.
  }
}

/** Already shows a name and a photo: nothing to ask. */
export function identityAlreadyVisible(profile: MyProfileDto, privacy: PrivacySettingsDto): boolean {
  return profile.identityMode !== "HIDDEN" && privacy.showAvatar && Boolean(profile.avatarUrl);
}

/** First and last name to show in the question: the profile's own, else the sign-in account's name split once. */
export function promptName(
  profile: Pick<MyProfileDto, "firstName" | "lastName">,
  accountName: string | null | undefined,
): { firstName: string; lastName: string } {
  const first = profile.firstName?.trim() ?? "";
  const last = profile.lastName?.trim() ?? "";
  if (first) return { firstName: first, lastName: last };
  const parts = (accountName ?? "").trim().split(/\s+/).filter(Boolean);
  return { firstName: parts[0] ?? "", lastName: parts.slice(1).join(" ") };
}

function safeStorage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}
