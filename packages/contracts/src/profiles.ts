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
}

export interface RoomPersonDto {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  career: string | null;
  seatCode: string | null;
  studyStatus: StudyStatusDto | null;
}

export interface SeatOccupantDto {
  seatId: string;
  userId: string;
  displayName: string;
  avatarUrl: string | null;
}

// ---- zod ----

export const updateProfileSchema = z.object({
  firstName: z.string().trim().max(50).nullable().optional(),
  lastName: z.string().trim().max(50).nullable().optional(),
  nickname: z.string().trim().max(30).nullable().optional(),
  career: z.string().trim().max(80).nullable().optional(),
  currentSubject: z.string().trim().max(80).nullable().optional(),
  bio: z.string().trim().max(280).nullable().optional(),
  instagram: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9._]{1,30}$/)
    .nullable()
    .optional(),
  studentNumber: z.string().trim().max(20).nullable().optional(),
  avatarUrl: z.string().trim().url().max(500).startsWith("https://").nullable().optional(),
  identityMode: z.enum(["FULL_NAME", "FIRST_NAME", "NICKNAME", "NICKNAME_AND_NAME", "HIDDEN"]).optional(),
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
  base64: z.string().min(1),
});
