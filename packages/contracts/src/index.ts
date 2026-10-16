import { z } from "zod";
import { CHECKIN_MINUTES, CHECKIN_MIN_MINUTES } from "./events";

export * from "./animals";
export * from "./careers";
export * from "./profiles";
export * from "./social";
export * from "./groups";
export * from "./chat";
export * from "./moderation";
export * from "./rankings";
export * from "./qr";
export * from "./table-names";
export * from "./seat-labels";
export * from "./notifications";
export * from "./subscriptions";
export * from "./email";
export * from "./events";
export * from "./feedback";
export * from "./pro";

// ---- Domain enums ----

export type SeatStatus = "UNKNOWN" | "FREE" | "OCCUPIED" | "UNCERTAIN" | "SAVED";
export type TableType = "MAIN_TABLE" | "WALL_BAR";

// ---- DTOs ----

export interface RoomSummary {
  roomId: string;
  total: number;
  free: number;
  occupied: number;
  uncertain: number;
  saved: number;
  unknown: number;
}

/** `GET /rooms/:idOrSlug/stats/today`: social-proof counters for the room's current local day. */
export interface RoomTodayStatsDto {
  /** Distinct visitors (signed in or not) who opened the room today. */
  visitorsToday: number;
  /** The caller's own observations today; `null` for anonymous callers. */
  myContributionsToday: number | null;
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
  /** ISO time the seat's active check-in runs until; `null` without an active check-in. */
  occupiedUntil: string | null;
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
  /** Device clock at send time; lets the server measure fix age independent of clock skew. */
  sentAt?: string;
}

export type PresenceRejectReason =
  | "INVALID_COORDINATES"
  | "STALE_LOCATION"
  | "POOR_ACCURACY"
  | "OUTSIDE_GEOFENCE"
  | "ROOM_NOT_FOUND";

/** Numbers behind a presence decision, returned on rejection so the UI can say "~180 m, ±60 m". */
export interface PresenceDetails {
  distanceM: number;
  accuracyM: number;
  radiusM: number;
  /** Maximum distance accepted for this reading (radius + tolerance). */
  allowedM: number;
}

/** `GET /presence/grant?roomId=`: until when the caller may act in the room without a new fix. */
export interface PresenceGrantDto {
  expiresAt: string | null;
}

export interface PresenceResult {
  valid: boolean;
  reason: PresenceRejectReason | null;
  expiresAt: string | null;
  details?: PresenceDetails;
}

// ---- Room geofence calibration (admin) ----

export interface RoomGeofenceDto {
  latitude: number;
  longitude: number;
  radiusM: number;
  maxAccuracyM: number;
}

export interface GeofenceTestResultDto {
  distanceM: number;
  accuracyM: number;
  allowedM: number;
  valid: boolean;
  reason: PresenceRejectReason | null;
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
  /** Ads are hidden: staff, an authorized subscription, or a cancelled/paused one still inside its paid period. False when anonymous or when subscriptions are disabled. */
  adFree: boolean;
  /** isPro(): Pro features unlocked. Same function as the server guard. */
  pro: boolean;
  /** Boolean(MP_ACCESS_TOKEN) on the API; same value for anonymous callers. */
  subscriptionsEnabled: boolean;
  /** env.subscriptionPriceArs (default 1500); same value for anonymous callers. */
  subscriptionPriceArs: number;
  /** true only for the app owner (verified OWNER_EMAIL): may grant/revoke ADMIN. */
  canManageAdmins: boolean;
}

// ---- Socket events ----

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
  /** When the seat's active check-in runs until; `null` without one. */
  occupiedUntil?: string | null;
}

// ---- Zod schemas ----

export const locationInputSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  accuracy: z.number().nonnegative(),
  capturedAt: z.string().datetime(),
  /**
   * Device clock when the request was sent. With it the server measures the fix's age on the
   * device's own clock (sentAt - capturedAt), so a phone clock that runs fast/slow doesn't make
   * every reading look stale.
   */
  sentAt: z.string().datetime().optional(),
});

/**
 * Presence-sensitive writes below take an optional `location`: without one the API accepts the
 * caller's unexpired presence grant for the room (issued by an earlier in-geofence fix, valid
 * PRESENCE_GRANT_MINUTES) and otherwise answers PRESENCE_REQUIRED, so the client sends a fix.
 */
export const PRESENCE_GRANT_MINUTES = 60;

export const checkInRequestSchema = z.object({
  roomId: z.string().uuid(),
  seatId: z.string().uuid(),
  location: locationInputSchema.optional(),
  showIdentity: z.boolean().default(false),
  /** How long the user will occupy the seat, in minutes (15..180, default 180). */
  durationMinutes: z.number().int().min(CHECKIN_MIN_MINUTES).max(CHECKIN_MINUTES).default(CHECKIN_MINUTES),
  qrToken: z.string().max(128).nullable().optional(),
  /** Cloudflare Turnstile token; required only when the API answers TURNSTILE_REQUIRED. */
  turnstileToken: z.string().max(4096).nullable().optional(),
});

export const observationRequestSchema = z.object({
  roomId: z.string().uuid(),
  seatId: z.string().uuid(),
  status: z.enum(["FREE", "OCCUPIED", "SAVED"]),
  location: locationInputSchema.optional(),
  qrToken: z.string().max(128).nullable().optional(),
  turnstileToken: z.string().max(4096).nullable().optional(),
});

export const extendRequestSchema = z
  .object({
    location: locationInputSchema.optional(),
    durationMinutes: z.number().int().min(CHECKIN_MIN_MINUTES).max(CHECKIN_MINUTES).default(CHECKIN_MINUTES),
    /** Pro: set by the automatic "Sigo acá"; the server also requires a fix and at most 15 minutes left. */
    auto: z.literal(true).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.auto === true && !value.location) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["location"], message: "El extendido automático necesita tu ubicación." });
    }
  });

export const checkInPhotoRequestSchema = z.object({
  image: z.object({
    mimeType: z.enum(["image/jpeg", "image/webp", "image/png"]),
    // Base64 of a <=2MB decoded photo is at most ~2.8MB encoded — reject earlier/cheaper payloads
    // before they ever reach the decode/hash/verifier pipeline.
    base64: z.string().min(1).max(2_800_000),
  }),
  location: locationInputSchema.optional(),
});

export const openDisputeSchema = z.object({
  roomId: z.string().uuid(),
  seatId: z.string().uuid(),
  kind: z.enum(["CLAIM", "ABSENT", "SAVED"]),
  location: locationInputSchema.optional(),
});

export const voteDisputeSchema = z.object({
  vote: z.enum(["PRESENT", "ABSENT"]),
  location: locationInputSchema.optional(),
});

export const incumbentRespondSchema = z.object({
  action: z.enum(["STILL_HERE", "LEFT"]),
  location: locationInputSchema.optional(),
});

export const testGeofenceSchema = z.object({
  location: locationInputSchema,
});

export const updateGeofenceSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  radiusM: z.number().int().min(20).max(300),
});

export const ADMIN_MARK_OCCUPIED_MIN_MINUTES = 15;
export const ADMIN_MARK_OCCUPIED_MAX_MINUTES = 480;
export const ADMIN_MARK_OCCUPIED_DEFAULT_MINUTES = 60;

export const markAllOccupiedSchema = z.object({
  minutes: z.number().int().min(ADMIN_MARK_OCCUPIED_MIN_MINUTES).max(ADMIN_MARK_OCCUPIED_MAX_MINUTES).default(ADMIN_MARK_OCCUPIED_DEFAULT_MINUTES),
});

export const presenceValidateSchema = z.object({
  roomId: z.string().max(100),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  accuracy: z.number().nonnegative(),
  capturedAt: z.string().datetime(),
  /**
   * Device clock when the request was sent. With it the server measures the fix's age on the
   * device's own clock (sentAt - capturedAt), so a phone clock that runs fast/slow doesn't make
   * every reading look stale.
   */
  sentAt: z.string().datetime().optional(),
});

export const createQrCodeSchema = z.object({
  tableCode: z.string().max(50).optional(),
});

// ---- API error shape ----

export type ApiErrorCode =
  | "UNAUTHENTICATED"
  | "PRESENCE_REJECTED"
  | "PRESENCE_REQUIRED"
  | "SEAT_TAKEN"
  | "SEAT_NOT_FOUND"
  | "NO_ACTIVE_CHECKIN"
  | "RATE_LIMITED"
  | "VALIDATION_ERROR"
  | "INTERNAL_ERROR"
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
  | "ALREADY_VERIFIED"
  | "TABLE_NAME_NOT_ALLOWED"
  | "FEATURE_DISABLED"
  | "PRO_REQUIRED";

export interface ApiError {
  error: {
    code: ApiErrorCode;
    message: string;
    /** Present when code is PRESENCE_REJECTED. */
    reason?: PresenceRejectReason;
    /** Present when code is PRESENCE_REJECTED and a distance could be computed. */
    details?: PresenceDetails;
  };
}
