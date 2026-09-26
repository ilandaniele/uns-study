import { z } from "zod";

export * from "./profiles.js";
export * from "./social.js";
export * from "./chat.js";
export * from "./moderation.js";
export * from "./rankings.js";
export * from "./qr.js";

// ---- Domain enums ----

export type SeatStatus = "UNKNOWN" | "FREE" | "OCCUPIED" | "UNCERTAIN";
export type TableType = "MAIN_TABLE" | "WALL_BAR";

// ---- Durations (minutes) ----

export const CHECKIN_MINUTES = 60;
export const FREE_OBS_MINUTES = 15;
export const OCCUPIED_OBS_MINUTES = 20;

// ---- DTOs ----

export interface RoomSummary {
  roomId: string;
  total: number;
  free: number;
  occupied: number;
  uncertain: number;
  unknown: number;
}

export interface RoomDto {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  timezone: string;
}

export interface TableDto {
  id: string;
  code: string;
  label: string;
  type: TableType;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
}

export interface SeatDto {
  id: string;
  tableId: string;
  code: string;
  seatNumber: number;
  x: number;
  y: number;
  rotation: number;
  status: SeatStatus;
  confidence: number;
  lastUpdatedAt: string | null;
  sourceSummary: string | null;
}

export interface RoomMapDto {
  room: RoomDto;
  summary: RoomSummary;
  tables: TableDto[];
  seats: SeatDto[];
  viewBox: { width: 1000; height: 1600 };
}

export interface LocationInput {
  latitude: number;
  longitude: number;
  accuracy: number;
  capturedAt: string;
}

export type PresenceRejectReason =
  | "INVALID_COORDINATES"
  | "STALE_LOCATION"
  | "POOR_ACCURACY"
  | "OUTSIDE_GEOFENCE"
  | "ROOM_NOT_FOUND";

export interface PresenceResult {
  valid: boolean;
  reason: PresenceRejectReason | null;
  expiresAt: string | null;
}

export interface CheckInDto {
  id: string;
  roomId: string;
  seatId: string;
  seatCode: string;
  status: "ACTIVE" | "COMPLETED" | "EXPIRED" | "CANCELLED";
  startedAt: string;
  expiresAt: string;
  showIdentity: boolean;
}

export interface MeDto {
  user: { id: string; name: string; email: string; image: string | null } | null;
  activeCheckIn: CheckInDto | null;
  roles: ("ADMIN" | "MODERATOR")[];
  restrictions: { type: string; until: string | null }[];
  profileCompleted: boolean;
}

// ---- Socket events ----

export const SocketEvents = {
  RoomJoin: "room:join",
  RoomLeave: "room:leave",
  SeatStateChanged: "seat:state-changed",
  RoomSummaryChanged: "room:summary-changed",
  RoomDailyReset: "room:daily-reset",
  ChatJoin: "chat:join",
  ChatLeave: "chat:leave",
  ChatMessageCreated: "chat:message-created",
  ChatMessageDeleted: "chat:message-deleted",
  DmMessageCreated: "dm:message-created",
  AnnouncementChanged: "room:announcement-changed",
} as const;

export interface SeatStateChangedEvent {
  roomId: string;
  seatId: string;
  status: SeatStatus;
  confidence: number;
  lastUpdatedAt: string;
}

// ---- Zod schemas ----

export const locationInputSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  accuracy: z.number().nonnegative(),
  capturedAt: z.string(),
});

export const checkInRequestSchema = z.object({
  roomId: z.string(),
  seatId: z.string(),
  location: locationInputSchema,
  showIdentity: z.boolean().default(false),
  qrToken: z.string().nullable().optional(),
  /** Cloudflare Turnstile token; required only when the API answers TURNSTILE_REQUIRED. */
  turnstileToken: z.string().max(4096).nullable().optional(),
});

export const observationRequestSchema = z.object({
  roomId: z.string(),
  seatId: z.string(),
  status: z.enum(["FREE", "OCCUPIED"]),
  location: locationInputSchema,
  qrToken: z.string().nullable().optional(),
  turnstileToken: z.string().max(4096).nullable().optional(),
});

export const extendRequestSchema = z.object({
  location: locationInputSchema,
});

export const presenceValidateSchema = z.object({
  roomId: z.string(),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  accuracy: z.number().nonnegative(),
  capturedAt: z.string(),
});

// ---- API error shape ----

export type ApiErrorCode =
  | "UNAUTHENTICATED"
  | "PRESENCE_REJECTED"
  | "SEAT_TAKEN"
  | "SEAT_NOT_FOUND"
  | "NO_ACTIVE_CHECKIN"
  | "RATE_LIMITED"
  | "VALIDATION_ERROR"
  | "OWN_SEAT_OBSERVATION"
  | "TURNSTILE_REQUIRED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "BLOCKED"
  | "DM_NOT_ALLOWED"
  | "RESTRICTED"
  | "STORAGE_UNAVAILABLE"
  | "INVALID_QR";

export interface ApiError {
  error: {
    code: ApiErrorCode;
    message: string;
    /** Present when code is PRESENCE_REJECTED. */
    reason?: PresenceRejectReason;
  };
}
