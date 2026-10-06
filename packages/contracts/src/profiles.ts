import { z } from "zod";

export type IdentityMode = "FULL_NAME" | "FIRST_NAME" | "NICKNAME" | "NICKNAME_AND_NAME" | "HIDDEN";

export interface MyProfileDto {
  userId: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  nickname: string | null;
  avatarUrl: string | null;
  career: string | null;
  currentSubject: string | null;
  bio: string | null;
  instagram: string | null;
  studentNumber: string | null;
  identityMode: IdentityMode;
  /** Name the user typed themselves; overrides the name `identityMode` resolves to (ignored while HIDDEN). */
  customName: string | null;
  /** Fun random alias, assigned once and never changed. Shown instead of a name while `identityMode` is HIDDEN. */
  alias: string | null;
  /** True when the user has the ADMIN role, so the profile page offers the admin badge toggle. */
  isAdmin: boolean;
}

export interface PrivacySettingsDto {
  showFullName: boolean;
  showNickname: boolean;
  showCareer: boolean;
  showCurrentSubject: boolean;
  showInstagram: boolean;
  showStudentNumber: boolean;
  showAvatar: boolean;
  showInRoom: boolean;
  showSeat: boolean;
  allowDirectMessages: boolean;
  /** Whether the user appears in rankings at all (default true) — under their alias when hidden. */
  showInRanking: boolean;
  /** Hidden users appear on the map as their alias animal (default true); off = generic silhouette. */
  showAliasAnimalOnMap: boolean;
  /** Admins only: show the gold "Admin" badge on their photo (default true). Ignored for non-admins. */
  showAdminBadge: boolean;
}

export interface StudyStatusDto {
  subject: string | null;
  message: string | null;
  lookingForGroup: boolean;
  startedAt: string;
}

export interface PublicProfileDto {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  career: string | null;
  currentSubject: string | null;
  bio: string | null;
  instagram: string | null;
  studentNumber: string | null;
  studyStatus: StudyStatusDto | null;
  allowsDirectMessages: boolean;
  blockedByMe: boolean;
  /** Draw the gold "Admin" badge: an admin with a visible identity who kept the badge on. */
  adminBadge: boolean;
}

export interface RoomPersonDto {
  /** `null` for users hidden on the map who appear only as their alias animal — never linkable. */
  userId: string | null;
  displayName: string;
  avatarUrl: string | null;
  career: string | null;
  seatCode: string | null;
  studyStatus: StudyStatusDto | null;
  /** Alias animal id (hidden users only, when they allow it on the map). */
  aliasAnimal?: string;
  /** Draw the gold "Admin" badge (visible identities only). */
  adminBadge?: boolean;
}

/** What to draw on an occupied seat: the person's photo, their alias animal, or a generic silhouette. */
export type SeatAvatarDto = { kind: "photo"; url: string } | { kind: "animal"; animalId: string } | { kind: "silhouette" };

/** One entry per active check-in seat. `userId` is `null` for hidden users — never linkable. */
export interface SeatOccupantDto {
  seatId: string;
  userId: string | null;
  displayName: string;
  /** Photo URL when `avatar.kind === "photo"`, else `null` (kept for older consumers). */
  avatarUrl: string | null;
  avatar: SeatAvatarDto;
  /** Draw the gold "Admin" badge (visible identities only). */
  adminBadge?: boolean;
}

/** A seat that reads OCCUPIED ("Está ocupado") or SAVED ("Está guardado") only because someone marked it; nobody is checked in. */
export interface SeatMarkedByDto {
  seatId: string;
  kind: "OCCUPIED" | "SAVED";
  markedBy: { displayName: string; observedAt: string };
}

/** Entry of `GET /rooms/:id/occupants`: discriminate with `"markedBy" in entry`. */
export type SeatOccupancyDto = SeatOccupantDto | SeatMarkedByDto;

/** Max length of the free-text display name typed in "¿Cómo te ven otras personas?". */
export const CUSTOM_NAME_MAX_LENGTH = 40;

// ---- zod ----

export const updateProfileSchema = z.object({
  firstName: z.string().trim().max(50).nullable().optional(),
  lastName: z.string().trim().max(50).nullable().optional(),
  nickname: z.string().trim().max(30).nullable().optional(),
  // 120 fits the longest official career name (see careers.ts); still free text.
  career: z.string().trim().max(120).nullable().optional(),
  currentSubject: z.string().trim().max(80).nullable().optional(),
  bio: z.string().trim().max(280).nullable().optional(),
  instagram: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9._]{1,30}$/)
    .nullable()
    .optional(),
  studentNumber: z.string().trim().max(20).nullable().optional(),
  // `avatarUrl` is intentionally absent: the server owns it exclusively via `/profiles/me/avatar[/google]`
  // — accepting it here would let a client point their profile at an arbitrary URL.
  identityMode: z.enum(["FULL_NAME", "FIRST_NAME", "NICKNAME", "NICKNAME_AND_NAME", "HIDDEN"]).optional(),
  customName: z.string().trim().max(CUSTOM_NAME_MAX_LENGTH).nullable().optional(),
});

export const updatePrivacySchema = z
  .object({
    showFullName: z.boolean(),
    showNickname: z.boolean(),
    showCareer: z.boolean(),
    showCurrentSubject: z.boolean(),
    showInstagram: z.boolean(),
    showStudentNumber: z.boolean(),
    showAvatar: z.boolean(),
    showInRoom: z.boolean(),
    showSeat: z.boolean(),
    allowDirectMessages: z.boolean(),
    showInRanking: z.boolean(),
    showAliasAnimalOnMap: z.boolean(),
    showAdminBadge: z.boolean(),
  })
  .partial();

export const studyStartSchema = z.object({
  roomId: z.string(),
  subject: z.string().trim().max(80).optional(),
  message: z.string().trim().max(140).optional(),
  lookingForGroup: z.boolean().default(false),
});

export const updateCheckInIdentitySchema = z.object({
  showIdentity: z.boolean(),
});

export const deleteAccountSchema = z.object({
  confirm: z.literal("ELIMINAR"),
});

export type AvatarMimeType = "image/jpeg" | "image/webp" | "image/png";

export const uploadAvatarSchema = z.object({
  mimeType: z.enum(["image/jpeg", "image/webp", "image/png"]),
  // Base64 of a <=300KB decoded avatar is at most ~420KB encoded.
  base64: z.string().min(1).max(420_000),
});
