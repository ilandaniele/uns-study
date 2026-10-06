// Pure constants (no zod) so the web client can import them without pulling zod into its bundle.

// ---- Durations (minutes) ----

export const CHECKIN_MINUTES = 180;
export const FREE_OBS_MINUTES = 15;
export const OCCUPIED_OBS_MINUTES = 20;
/** "Está guardado" (belongings left, nobody sitting) observation lifetime. */
export const SAVED_OBS_MINUTES = 30;
/** Bounds for the user-chosen "occupy until" window of a check-in (minutes). */
export const CHECKIN_MIN_MINUTES = 15;
export const DISPUTE_MINUTES = 5;
/** How long a photo-verified check-in is protected from disputes/"Está libre" observations. */
export const VERIFIED_PROTECTION_MINUTES = 30;

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
  GroupMessageCreated: "group:message-created",
  GroupUpdated: "group:updated",
  AnnouncementChanged: "room:announcement-changed",
  SeatDisputeOpened: "seat:dispute-opened",
  SeatDisputeUpdated: "seat:dispute-updated",
  SeatDisputeResolved: "seat:dispute-resolved",
  DisputeYouAreChallenged: "dispute:you-are-challenged",
  DisputeYouWon: "dispute:you-won",
  TableNicknameChanged: "table:nickname-changed",
  RoomAdminPresent: "room:admin-present",
  SeatFreedAlert: "seat:freed-alert",
  CheckInExpiring: "checkin:expiring",
} as const;
