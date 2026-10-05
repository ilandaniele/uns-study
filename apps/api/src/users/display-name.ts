import { animalIdFromAlias } from "@sala/contracts";
import type { IdentityMode } from "@sala/contracts";

/** Minimal shape needed from a `user_profiles` row. */
export interface DisplayNameProfile {
  firstName: string | null;
  lastName: string | null;
  nickname: string | null;
  identityMode: IdentityMode;
  /** Fun random alias shown instead of "Usuario anónimo" — `null` if none has been assigned yet. */
  alias?: string | null;
}

/** Minimal shape needed from a `user_privacy_settings` row — reserved for future field-level rules. */
export type DisplayNamePrivacy = Record<string, unknown>;

const ANONYMOUS = "Usuario anónimo";

/** Falls back to the profile's alias (if it has one) instead of the bare "Usuario anónimo". */
function anonymousFallback(profile: DisplayNameProfile): string {
  return profile.alias?.trim() || ANONYMOUS;
}

/** The name `identityMode` + the chosen fields resolve to, ignoring HIDDEN/alias — `null` when empty. */
function resolvedName(profile: DisplayNameProfile): string | null {
  switch (profile.identityMode) {
    case "FIRST_NAME":
      return profile.firstName?.trim() || profile.nickname?.trim() || null;
    case "FULL_NAME": {
      const first = profile.firstName?.trim() ?? "";
      const last = profile.lastName?.trim() ?? "";
      const full = [first, last].filter(Boolean).join(" ").trim();
      return full || null;
    }
    case "NICKNAME":
      return profile.nickname?.trim() || null;
    case "NICKNAME_AND_NAME": {
      const nickname = profile.nickname?.trim();
      const first = profile.firstName?.trim();
      if (nickname && first) return `${nickname} (${first})`;
      return nickname || first || null;
    }
    case "HIDDEN":
    default:
      return null;
  }
}

/**
 * True when `displayName` would need to fall back to the alias for this profile — HIDDEN, or a
 * visible mode whose chosen fields are still empty. Used to decide when to assign/release an alias.
 */
export function needsAlias(profile: Pick<DisplayNameProfile, "identityMode" | "firstName" | "lastName" | "nickname">): boolean {
  return resolvedName({ ...profile, alias: null }) === null;
}

/**
 * Computes the public display name for a user given their profile's `identityMode`.
 * Falls back to the profile's random alias (or "Usuario anónimo" if none was assigned) whenever
 * the profile is missing, hidden, or the chosen fields are empty.
 */
export function displayName(
  profile: DisplayNameProfile | null,
  _privacy: DisplayNamePrivacy | null,
  _fallbackName: string,
): string {
  if (!profile) return ANONYMOUS;
  return resolvedName(profile) ?? anonymousFallback(profile);
}

/** Minimal shape needed to gate a profile's avatar on the owner's privacy setting. */
export interface AvatarProfile extends Pick<DisplayNameProfile, "identityMode" | "firstName" | "lastName" | "nickname"> {
  avatarUrl: string | null;
}
export interface AvatarPrivacy {
  showAvatar: boolean;
}

/** Returns the profile's `avatarUrl`, or `null` when the owner hasn't opted into `showAvatar` or is shown as alias. */
export function visibleAvatarUrl(profile: AvatarProfile | null, privacy: AvatarPrivacy | null): string | null {
  if (!profile || needsAlias(profile) || !privacy?.showAvatar) return null;
  return profile.avatarUrl;
}

/** Catalog animal id of the profile's alias, but only while the name shown *is* the alias (else `null`). */
export function shownAliasAnimal(profile: DisplayNameProfile | null): string | null {
  if (!profile || !needsAlias(profile)) return null;
  return animalIdFromAlias(profile.alias);
}

/**
 * Whether the gold "Admin" badge goes on this user's avatar: only for an ADMIN who kept
 * `show_admin_badge` on, and only while their real identity is shown (never on the alias).
 */
export function showsAdminBadge(
  isAdmin: boolean,
  profile: Pick<DisplayNameProfile, "identityMode" | "firstName" | "lastName" | "nickname"> | null,
  privacy: { showAdminBadge: boolean } | null,
): boolean {
  return isAdmin && Boolean(profile) && !needsAlias(profile!) && (privacy?.showAdminBadge ?? true);
}
