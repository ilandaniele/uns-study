import { animalIdFromAlias, type MyProfileDto, type PrivacySettingsDto, type SeatAvatarDto } from "@sala/contracts";

type AppearanceProfile = Pick<
  MyProfileDto,
  "firstName" | "lastName" | "nickname" | "customName" | "identityMode" | "alias" | "avatarUrl" | "career" | "currentSubject" | "instagram" | "studentNumber" | "isAdmin"
>;
type AppearancePrivacy = Pick<
  PrivacySettingsDto,
  "showAvatar" | "showAdminBadge" | "showCareer" | "showCurrentSubject" | "showInstagram" | "showStudentNumber" | "showAliasAnimalOnMap"
>;

export interface AppearanceRow {
  label: string;
  value: string;
}

export interface Appearance {
  /** False when others only see the permanent alias animal (HIDDEN, or the chosen name fields are empty). */
  identityVisible: boolean;
  name: string;
  avatar: SeatAvatarDto;
  adminBadge: boolean;
  rows: AppearanceRow[];
}

/** Mirrors `resolvedName` in apps/api/src/users/display-name.ts — keep both in sync. */
export function resolvedName(profile: Pick<AppearanceProfile, "firstName" | "lastName" | "nickname" | "identityMode"> & { customName?: string | null }): string | null {
  if (profile.identityMode !== "HIDDEN") {
    const custom = profile.customName?.trim();
    if (custom) return custom;
  }
  const first = profile.firstName?.trim() ?? "";
  const last = profile.lastName?.trim() ?? "";
  const nickname = profile.nickname?.trim() ?? "";
  switch (profile.identityMode) {
    case "FIRST_NAME":
      return first || nickname || null;
    case "FULL_NAME":
      return [first, last].filter(Boolean).join(" ").trim() || null;
    case "NICKNAME":
      return nickname || null;
    case "NICKNAME_AND_NAME":
      return nickname && first ? `${nickname} (${first})` : nickname || first || null;
    case "HIDDEN":
    default:
      return null;
  }
}

/** How other people see the user, from the SAVED profile + privacy settings (server rules mirrored client-side). */
export function computeAppearance(profile: AppearanceProfile, privacy: AppearancePrivacy): Appearance {
  const name = resolvedName(profile);
  if (!name) {
    const animalId = animalIdFromAlias(profile.alias);
    const showAnimal = privacy.showAliasAnimalOnMap;
    return {
      identityVisible: false,
      name: showAnimal ? profile.alias?.trim() || "Alguien" : "Alguien",
      avatar: showAnimal && animalId ? { kind: "animal", animalId } : { kind: "silhouette" },
      adminBadge: false,
      rows: [],
    };
  }

  const rows: AppearanceRow[] = [];
  const career = profile.career?.trim();
  const subject = profile.currentSubject?.trim();
  const instagram = profile.instagram?.trim().replace(/^@/, "");
  const studentNumber = profile.studentNumber?.trim();
  if (privacy.showCareer && career) rows.push({ label: "Carrera", value: career });
  if (privacy.showCurrentSubject && subject) rows.push({ label: "Materia actual", value: subject });
  if (privacy.showInstagram && instagram) rows.push({ label: "Instagram", value: `@${instagram}` });
  if (privacy.showStudentNumber && studentNumber) rows.push({ label: "Legajo", value: studentNumber });

  return {
    identityVisible: true,
    name,
    avatar: privacy.showAvatar && profile.avatarUrl ? { kind: "photo", url: profile.avatarUrl } : { kind: "silhouette" },
    adminBadge: profile.isAdmin && privacy.showAdminBadge,
    rows,
  };
}
