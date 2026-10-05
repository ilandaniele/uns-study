import { z } from "zod";

export type ReportReason =
  | "SPAM"
  | "HARASSMENT"
  | "INAPPROPRIATE_BEHAVIOR"
  | "IMPERSONATION"
  | "SEAT_TROLLING"
  | "OFFENSIVE_CONTENT"
  | "OTHER";

export type ReportContext = "PROFILE" | "CHAT" | "DM";

export interface ReportCreatedDto {
  id: string;
  status: string;
}

export interface UploadInstructionDto {
  attachmentId: string;
  uploadUrl: string;
  method: "PUT";
  headers: Record<string, string>;
  expiresAt: string;
}

export const REPORT_EVIDENCE_MAX_BYTES = 5 * 1024 * 1024;
export const REPORT_EVIDENCE_MIME = ["image/jpeg", "image/png", "image/webp", "image/heic"] as const;

export interface AdminReportDto {
  id: string;
  /** `email` is null unless the caller is an ADMIN. */
  reporter: { userId: string; name: string; email: string | null } | null;
  reported: { userId: string; name: string; email: string | null } | null;
  reason: ReportReason;
  description: string | null;
  context: ReportContext;
  contextMessageId: string | null;
  status: string;
  createdAt: string;
  resolvedAt: string | null;
  attachments: { id: string; contentType: string; sizeBytes: number; status: string }[];
}

export type ModerationActionType = "WARN" | "MUTE_CHAT" | "RESTRICT_OBSERVATIONS" | "SUSPEND" | "BAN" | "LIFT";

export interface AdminUserDto {
  userId: string;
  name: string;
  /** Null unless the caller is an ADMIN (moderators never see emails). */
  email: string | null;
  createdAt: string;
  roles: string[];
  restrictions: { id: string; type: string; reason: string; until: string | null; createdAt: string }[];
  reputation: { observationScore: number; spamScore: number; confirmedObservations: number; rejectedObservations: number } | null;
  recentSecurityEvents: { eventType: string; createdAt: string }[];
}

export interface AnnouncementDto {
  id: string;
  roomId: string | null;
  title: string;
  body: string;
  startsAt: string;
  endsAt: string | null;
  active: boolean;
}

// ---- zod ----

export const createReportSchema = z.object({
  reason: z.enum(["SPAM", "HARASSMENT", "INAPPROPRIATE_BEHAVIOR", "IMPERSONATION", "SEAT_TROLLING", "OFFENSIVE_CONTENT", "OTHER"]),
  description: z.string().trim().max(1000).optional(),
  roomId: z.string().uuid().optional(),
  context: z.enum(["PROFILE", "CHAT", "DM"]),
  contextMessageId: z.string().uuid().optional(),
});

export const attachmentRequestSchema = z.object({
  contentType: z.enum(REPORT_EVIDENCE_MIME),
  sizeBytes: z.number().int().min(1).max(REPORT_EVIDENCE_MAX_BYTES),
});

export const moderationActionSchema = z.object({
  type: z.enum(["WARN", "MUTE_CHAT", "RESTRICT_OBSERVATIONS", "SUSPEND", "BAN", "LIFT"]),
  reason: z.string().trim().max(500),
  until: z.string().datetime().nullable().optional(),
  reportId: z.string().optional(),
});

export const reportStatusSchema = z.object({
  status: z.enum(["OPEN", "UNDER_REVIEW", "RESOLVED", "DISMISSED"]),
});

export const announcementSchema = z.object({
  roomId: z.string().nullable().optional(),
  title: z.string().trim().max(100),
  body: z.string().trim().max(1000),
  startsAt: z.string().datetime().optional(),
  endsAt: z.string().datetime().nullable().optional(),
  active: z.boolean().optional(),
});
