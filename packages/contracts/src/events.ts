// Pure constants (no zod) so the web client can import them without pulling zod into its bundle.

// ---- Durations (minutes) ----

/** Fixed check-in block for everyone without Pro: renewed with "Sigo acá" every 3 hours. */
export const CHECKIN_MINUTES = 180;
/** Pro users pick their own end time, up to this many minutes ahead. */
export const CHECKIN_PRO_MAX_MINUTES = 720;
export const FREE_OBS_MINUTES = 15;
export const OCCUPIED_OBS_MINUTES = 20;
/** "Está guardado" (belongings left, nobody sitting) observation lifetime. */
export const SAVED_OBS_MINUTES = 30;
/** Bounds for the user-chosen "occupy until" window of a check-in (minutes). */
export const CHECKIN_MIN_MINUTES = 15;
export const DISPUTE_MINUTES = 5;
/** How long a photo-verified check-in is protected from disputes/"Está libre" observations —
 *  counted from the photo and capped by the check-in's own expiry (see `computeVerificationExpiresAt`). */
export const VERIFIED_PROTECTION_MINUTES = 120;

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
  ChatCleared: "chat:cleared",
  DmMessageCreated: "dm:message-created",
  GroupMessageCreated: "group:message-created",
  GroupUpdated: "group:updated",
  AnnouncementChanged: "room:announcement-changed",
  SeatDisputeOpened: "seat:dispute-opened",
  SeatDisputeUpdated: "seat:dispute-updated",
  SeatDisputeResolved: "seat:dispute-resolved",
  DisputeYouAreChallenged: "dispute:you-are-challenged",
  DisputeYouWon: "dispute:you-won",
  DisputeVoteAvailable: "dispute:vote-available",
  TableNicknameChanged: "table:nickname-changed",
  RoomAdminPresent: "room:admin-present",
  SeatFreedAlert: "seat:freed-alert",
  CheckInExpiring: "checkin:expiring",
  QuietRoomAlert: "room:quiet-alert",
} as const;
