import type { IdentityMode } from "@uns/contracts";

/** Minimal shape needed from a `user_profiles` row. */
export interface DisplayNameProfile {
  firstName: string | null;
  lastName: string | null;
  nickname: string | null;
  identityMode: IdentityMode;
}

/** Minimal shape needed from a `user_privacy_settings` row — reserved for future field-level rules. */
export type DisplayNamePrivacy = Record<string, unknown>;

const ANONYMOUS = "Usuario anónimo";

/**
 * Computes the public display name for a user given their profile's `identityMode`.
 * Falls back to "Usuario anónimo" whenever the profile is missing, hidden, or the
 * chosen fields are empty.
 */
export function displayName(
  profile: DisplayNameProfile | null,
  _privacy: DisplayNamePrivacy | null,
  _fallbackName: string,
): string {
  if (!profile || profile.identityMode === "HIDDEN") return ANONYMOUS;

  switch (profile.identityMode) {
    case "FIRST_NAME":
      return profile.firstName?.trim() || profile.nickname?.trim() || ANONYMOUS;
    case "FULL_NAME": {
      const first = profile.firstName?.trim() ?? "";
      const last = profile.lastName?.trim() ?? "";
      const full = [first, last].filter(Boolean).join(" ").trim();
      return full || ANONYMOUS;
    }
    case "NICKNAME":
      return profile.nickname?.trim() || ANONYMOUS;
    case "NICKNAME_AND_NAME": {
      const nickname = profile.nickname?.trim();
      const first = profile.firstName?.trim();
      if (nickname && first) return `${nickname} (${first})`;
      return nickname || first || ANONYMOUS;
    }
    default:
      return ANONYMOUS;
  }
}
