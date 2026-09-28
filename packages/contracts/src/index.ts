import { z } from "zod";

export * from "./profiles";
export * from "./social";
export * from "./chat";
export * from "./moderation";
export * from "./rankings";
export * from "./qr";
export * from "./table-names";

// ---- Domain enums ----

export type SeatStatus = "UNKNOWN" | "FREE" | "OCCUPIED" | "UNCERTAIN";
export type TableType = "MAIN_TABLE" | "WALL_BAR";

// ---- Durations (minutes) ----

export const CHECKIN_MINUTES = 60;
export const FREE_OBS_MINUTES = 15;
export const OCCUPIED_OBS_MINUTES = 20;
export const DISPUTE_MINUTES = 5;
/** How long a photo-verified check-in is protected from disputes/"Está libre" observations. */
export const VERIFIED_PROTECTION_MINUTES = 30;

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
  /** Community-voted nickname (see `table-names.ts`), or `null` when the table has none. */
  nickname: string | null;
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
  /** Present while the seat has an OPEN dispute (vote in progress). */
  dispute: { id: string; closesAt: string } | null;
  /** True while the seat's active check-in has unexpired photo-verification protection. */
  verified: boolean;
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
  /** When the seat verifier last confirmed this check-in's seat from a photo, if ever. */
  verifiedAt: string | null;
  /** `min(verifiedAt + VERIFIED_PROTECTION_MINUTES, expiresAt)` — null when never verified. */
  verificationExpiresAt: string | null;
}

// ---- Photo-verified check-ins ----

export type PhotoMimeType = "image/jpeg" | "image/webp" | "image/png";

export type PhotoVerificationReason = "VERIFIED" | "SEAT_MISMATCH" | "LOW_CONFIDENCE" | "NO_PREDICTION" | "VERIFIER_ERROR";

export interface PhotoVerificationResultDto {
  verified: boolean;
  reason: PhotoVerificationReason;
  checkIn: CheckInDto;
}

// ---- Seat disputes ----

export type DisputeKind = "CLAIM" | "ABSENT" | "SAVED";
export type DisputeStatus = "OPEN" | "RESOLVED_ABSENT" | "RESOLVED_PRESENT" | "TIED" | "CANCELLED";
export type DisputeVote = "PRESENT" | "ABSENT";

export interface SeatDisputeDto {
  id: string;
  seatId: string;
  kind: DisputeKind;
  status: DisputeStatus;
  openedAt: string;
  closesAt: string;
  /** Aggregate vote weights only — voter identities are never exposed. */
  votes: { present: number; absent: number };
  myVote: DisputeVote | null;
  iAmIncumbent: boolean;
  iAmOpener: boolean;
}

/** Broadcast on the room channel — never carries `myVote`/`iAm*` (those are viewer-specific). */
export type SeatDisputeLiteDto = Omit<SeatDisputeDto, "myVote" | "iAmIncumbent" | "iAmOpener">;

export interface DisputeChallengedEvent {
  disputeId: string;
  seatId: string;
  seatCode: string;
  closesAt: string;
}

/** Sent to a CLAIM opener's private `user:{userId}` channel once their claim resolves
 *  RESOLVED_ABSENT — the incumbent's check-in is cancelled, but the opener still has to
 *  self-check-in (fresh presence) rather than being auto-seated. */
export interface DisputeWonEvent {
  disputeId: string;
  seatId: string;
  seatCode: string;
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
  SeatDisputeOpened: "seat:dispute-opened",
  SeatDisputeUpdated: "seat:dispute-updated",
  SeatDisputeResolved: "seat:dispute-resolved",
  DisputeYouAreChallenged: "dispute:you-are-challenged",
  DisputeYouWon: "dispute:you-won",
  TableNicknameChanged: "table:nickname-changed",
} as const;

export interface TableNicknameChangedEvent {
  tableId: string;
  nickname: string | null;
}

export interface SeatStateChangedEvent {
  roomId: string;
  seatId: string;
  status: SeatStatus;
  confidence: number;
  lastUpdatedAt: string;
  verified: boolean;
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

export const checkInPhotoRequestSchema = z.object({
  image: z.object({
    mimeType: z.enum(["image/jpeg", "image/webp", "image/png"]),
    // Base64 of a <=2MB decoded photo is at most ~2.8MB encoded — reject earlier/cheaper payloads
    // before they ever reach the decode/hash/verifier pipeline.
    base64: z.string().min(1).max(2_800_000),
  }),
  location: locationInputSchema,
});

export const openDisputeSchema = z.object({
  roomId: z.string().uuid(),
  seatId: z.string().uuid(),
  kind: z.enum(["CLAIM", "ABSENT", "SAVED"]),
  location: locationInputSchema,
});

export const voteDisputeSchema = z.object({
  vote: z.enum(["PRESENT", "ABSENT"]),
  location: locationInputSchema,
});

export const incumbentRespondSchema = z
  .object({
    action: z.enum(["STILL_HERE", "LEFT"]),
    location: locationInputSchema.optional(),
  })
  .refine((v) => v.action !== "STILL_HERE" || v.location != null, {
    message: "location is required for STILL_HERE",
    path: ["location"],
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
  | "INVALID_QR"
  | "DISPUTE_NOT_ALLOWED"
  | "DISPUTE_ALREADY_OPEN"
  | "DISPUTE_CLOSED"
  | "VERIFIER_UNAVAILABLE"
  | "SEAT_VERIFIED"
  | "PHOTO_REUSED"
  | "PHOTO_INVALID"
  | "ALREADY_VERIFIED";

export interface ApiError {
  error: {
    code: ApiErrorCode;
    message: string;
    /** Present when code is PRESENCE_REJECTED. */
    reason?: PresenceRejectReason;
  };
}
