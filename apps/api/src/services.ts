// Type-only registry of the service graph; the implementation is `container.ts` (buildServices).
// The value type of each key is the class exported by the imported file. A Wave 2 owner who renames
// a class updates the matching `import type` line here.
import type { Db } from "@sala/database";
import type { ReactionsService } from "./chat/reactions.service.js";
import type { FocusService } from "./focus/focus.service.js";
import type { GardenGiftsService } from "./garden/garden-gifts.service.js";
import type { GardenService } from "./garden/garden.service.js";
import type { AchievementsService } from "./badges/achievements.service.js";
import type { CollaborationService } from "./badges/collaboration.service.js";
import type { GardenPurchasesService } from "./garden/garden-purchases.service.js";
import type { RoomsService } from "./rooms/rooms.service.js";
import type { RoomStateService } from "./rooms/room-state.service.js";
import type { RoomStatsService } from "./rooms/room-stats.service.js";
import type { RoomCache } from "./common/cache/room-cache.service.js";
import type { PresenceService } from "./presence/presence.service.js";
import type { CheckInService } from "./checkins/checkins.service.js";
import type { PhotoVerificationService } from "./checkins/photo-verification.service.js";
import type { ObservationService } from "./observations/observations.service.js";
import type { DisputeService } from "./disputes/disputes.service.js";
import type { TableNamesService } from "./table-names/table-names.service.js";
import type { ReputationService } from "./reputation/reputation.service.js";
import type { RankingsService } from "./rankings/rankings.service.js";
import type { StudySessionService } from "./rankings/study-session.service.js";
import type { StudyService } from "./study/study.service.js";
import type { RoomPeopleService } from "./study/room-people.service.js";
import type { ChatService } from "./chat/chat.service.js";
import type { DmService } from "./dm/dm.service.js";
import type { GroupsService } from "./groups/groups.service.js";
import type { BlocksService } from "./blocks/blocks.service.js";
import type { ProfilesService } from "./profiles/profiles.service.js";
import type { AvatarsService } from "./avatars/avatars.service.js";
import type { AliasService } from "./users/alias.service.js";
import type { RolesService } from "./users/roles.service.js";
import type { RestrictionService } from "./users/restriction.service.js";
import type { AdminUsersService } from "./admin/admin-users.service.js";
import type { AdminReportsService } from "./admin/admin-reports.service.js";
import type { AdminRoomsService } from "./admin/admin-rooms.service.js";
import type { AdminAuditService } from "./admin/admin-audit.service.js";
import type { AdminStudySessionsService } from "./admin/admin-study-sessions.service.js";
import type { ModerationActionService } from "./admin/moderation-action.service.js";
import type { AnnouncementsService } from "./announcements/announcements.service.js";
import type { ReportsService } from "./reports/reports.service.js";
import type { QrService } from "./qr/qr.service.js";
import type { FeedbackService } from "./feedback/feedback.service.js";
import type { NotificationService } from "./notifications/notification.service.js";
import type { PushService } from "./notifications/push.service.js";
import type { PushSubscriptionsService } from "./notifications/push-subscriptions.service.js";
import type { NotificationPreferencesService } from "./notifications/notification-preferences.service.js";
import type { EmailCampaignsService } from "./email/email-campaigns.service.js";
import type { ResendClient } from "./email/resend.client.js";
import type { SubscriptionsService } from "./subscriptions/subscriptions.service.js";
import type { MercadoPagoClient } from "./subscriptions/mercadopago.client.js";
import type { RateLimitService } from "./security/rate-limit.service.js";
import type { AntiAbuseService } from "./security/anti-abuse.service.js";
import type { SecurityEventService } from "./security/security-event.service.js";
import type { AbusePolicyService } from "./security/abuse-policy.service.js";
import type { TurnstileService } from "./security/turnstile.service.js";
import type { StorageService } from "./storage/storage.service.js";
import type { SeatPhotoVerifier } from "./verification/seat-photo-verifier.js";
import type { RoomRealtimeGateway } from "./realtime/room-realtime.gateway.js";
import type { Scheduler } from "./platform/scheduler.js";
import type { Clock } from "./platform/clock.js";
import type { ExpirationJob } from "./jobs/expiration.job.js";
import type { DisputeResolutionJob } from "./jobs/dispute-resolution.job.js";
import type { DailyResetJob } from "./jobs/daily-reset.job.js";
import type { AttachmentSweepJob } from "./jobs/attachment-sweep.job.js";
import type { CheckInExpiryReminderJob } from "./jobs/checkin-expiry-reminder.job.js";
import type { EmailSendJob } from "./email/email-send.job.js";
import type { WeeklyGoalReminderJob } from "./jobs/weekly-goal-reminder.job.js";
import type { ProService } from "./subscriptions/pro.js";
import type { SeatWatchService } from "./seat-watch/seat-watch.service.js";
import type { StudyHistoryService } from "./study-history/study-history.service.js";
import type { ForecastService } from "./forecast/forecast.service.js";
import type { FavoriteSeatsService } from "./favorites/favorites.service.js";
import type { GroupStudyService } from "./group-study/group-study.service.js";
import type { WeeklyGoalService } from "./weekly-goal/weekly-goal.service.js";
import type { StreakBadgesService } from "./badges/streak-badges.service.js";
import type { ExamsService } from "./exams/exams.service.js";
import type { UserCosmeticsService } from "./cosmetics/cosmetics.service.js";
import type { QuietRoomService } from "./quiet-room/quiet-room.service.js";
import type { GroupRankingService } from "./group-ranking/group-ranking.service.js";

export interface Services {
  achievements: AchievementsService;
  collaboration: CollaborationService;
  sectionUsage: SectionUsageService;
  reactions: ReactionsService;
  focus: FocusService;
  gardenGifts: GardenGiftsService;
  garden: GardenService;
  gardenPurchases: GardenPurchasesService;
  /** The shared sync SQLite handle, for the few routers that touch it directly (health, e2e hooks). */
  db: Db;
  // W2-A
  rooms: RoomsService;
  roomState: RoomStateService;
  roomStats: RoomStatsService;
  roomCache: RoomCache;
  presence: PresenceService;
  checkIns: CheckInService;
  photoVerification: PhotoVerificationService;
  observations: ObservationService;
  // W2-B
  disputes: DisputeService;
  tableNames: TableNamesService;
  reputation: ReputationService;
  rankings: RankingsService;
  studySessions: StudySessionService;
  study: StudyService;
  roomPeople: RoomPeopleService;
  // W2-C
  chat: ChatService;
  dm: DmService;
  groups: GroupsService;
  blocks: BlocksService;
  profiles: ProfilesService;
  avatars: AvatarsService;
  alias: AliasService;
  roles: RolesService;
  restriction: RestrictionService;
  // W2-D
  adminUsers: AdminUsersService;
  adminReports: AdminReportsService;
  adminRooms: AdminRoomsService;
  adminAudit: AdminAuditService;
  adminStudySessions: AdminStudySessionsService;
  moderation: ModerationActionService;
  announcements: AnnouncementsService;
  reports: ReportsService;
  qr: QrService;
  feedback: FeedbackService;
  // W2-E
  notifications: NotificationService;
  push: PushService;
  pushSubscriptions: PushSubscriptionsService;
  notificationPreferences: NotificationPreferencesService;
  emailCampaigns: EmailCampaignsService;
  /** `null` (feature disabled) until both RESEND_API_KEY and EMAIL_FROM are set. */
  resend: ResendClient | null;
  subscriptions: SubscriptionsService;
  /** `null` (subscriptions disabled) when MP_ACCESS_TOKEN is unset. */
  mercadoPago: MercadoPagoClient | null;
  rateLimit: RateLimitService;
  antiAbuse: AntiAbuseService;
  securityEvents: SecurityEventService;
  abusePolicy: AbusePolicyService;
  turnstile: TurnstileService;
  // W2-F
  storage: StorageService;
  seatPhotoVerifier: SeatPhotoVerifier | null;
  // Pro
  pro: ProService;
  seatWatch: SeatWatchService;
  studyHistory: StudyHistoryService;
  forecast: ForecastService;
  favoriteSeats: FavoriteSeatsService;
  groupStudy: GroupStudyService;
  weeklyGoal: WeeklyGoalService;
  streakBadges: StreakBadgesService;
  exams: ExamsService;
  cosmetics: UserCosmeticsService;
  quietRoom: QuietRoomService;
  groupRanking: GroupRankingService;
  // W1-C
  realtime: RoomRealtimeGateway;
  scheduler: Scheduler;
  clock: Clock;
  jobs: {
    expiration: ExpirationJob;
    disputeResolution: DisputeResolutionJob;
    dailyReset: DailyResetJob;
    attachmentSweep: AttachmentSweepJob;
    checkInExpiryReminder: CheckInExpiryReminderJob;
    emailSend: EmailSendJob;
    weeklyGoalReminder: WeeklyGoalReminderJob;
  };
}
import type { SectionUsageService } from "./usage/section-usage.service.js";
