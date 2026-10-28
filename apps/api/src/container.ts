// Service graph, wired by hand (no DI container). Order matters: leaves first, then the services
// that depend on them, then the realtime gateway and the jobs.
//
//   buildServices(deps: ContainerDeps): Services
//
//   deps.db         the shared sync SQLite handle (`createDoDb(ctx.storage)` in the Worker, `freshDb()` in tests)
//   deps.hub        the realtime hub (`DoRealtimeHub` in the Worker, `RecordingHub` in tests)
//   deps.scheduler  `SqliteScheduler` in the Worker, `ManualScheduler` in tests
//   deps.evidence   the `EVIDENCE` R2 binding, or null when absent
//   deps.clock      `systemClock` in the Worker, `FixedClock` in tests
//   deps.env        optional config override; defaults to the mutable `env` singleton
//
// The caller then does `createApp({ services, auth: buildAuth(db) })`.
import type { Db } from "@sala/database";
import { ReactionsService } from "./chat/reactions.service.js";
import { GardenService } from "./garden/garden.service.js";
import { GardenPurchasesService } from "./garden/garden-purchases.service.js";
import { env as defaultEnv, type Env } from "./env.js";
import type { Clock } from "./platform/clock.js";
import type { Scheduler } from "./platform/scheduler.js";
import type { RealtimeHub } from "./realtime/realtime-hub.js";
import type { Services } from "./services.js";
import { RoomCache } from "./common/cache/room-cache.service.js";
import { RoomsService } from "./rooms/rooms.service.js";
import { RoomStateService } from "./rooms/room-state.service.js";
import { RoomStatsService } from "./rooms/room-stats.service.js";
import { PresenceService } from "./presence/presence.service.js";
import { CheckInService } from "./checkins/checkins.service.js";
import { PhotoVerificationService } from "./checkins/photo-verification.service.js";
import { ObservationService } from "./observations/observations.service.js";
import { DisputeService } from "./disputes/disputes.service.js";
import { TableNamesService } from "./table-names/table-names.service.js";
import { ReputationService } from "./reputation/reputation.service.js";
import { RankingsService } from "./rankings/rankings.service.js";
import { StudySessionService } from "./rankings/study-session.service.js";
import { StudyService } from "./study/study.service.js";
import { RoomPeopleService } from "./study/room-people.service.js";
import { ChatService } from "./chat/chat.service.js";
import { DmService } from "./dm/dm.service.js";
import { GroupsService } from "./groups/groups.service.js";
import { BlocksService } from "./blocks/blocks.service.js";
import { ProfilesService } from "./profiles/profiles.service.js";
import { AvatarsService } from "./avatars/avatars.service.js";
import { AliasService } from "./users/alias.service.js";
import { RolesService } from "./users/roles.service.js";
import { RestrictionService } from "./users/restriction.service.js";
import { AdminUsersService } from "./admin/admin-users.service.js";
import { AdminReportsService } from "./admin/admin-reports.service.js";
import { AdminRoomsService } from "./admin/admin-rooms.service.js";
import { AdminAuditService } from "./admin/admin-audit.service.js";
import { AdminStudySessionsService } from "./admin/admin-study-sessions.service.js";
import { ModerationActionService } from "./admin/moderation-action.service.js";
import { AnnouncementsService } from "./announcements/announcements.service.js";
import { ReportsService } from "./reports/reports.service.js";
import { QrService } from "./qr/qr.service.js";
import { FeedbackService } from "./feedback/feedback.service.js";
import { NotificationService } from "./notifications/notification.service.js";
import { PushService } from "./notifications/push.service.js";
import { PushSubscriptionsService } from "./notifications/push-subscriptions.service.js";
import { NotificationPreferencesService } from "./notifications/notification-preferences.service.js";
import { EmailCampaignsService } from "./email/email-campaigns.service.js";
import { ResendClient } from "./email/resend.client.js";
import { SubscriptionsService } from "./subscriptions/subscriptions.service.js";
import { MercadoPagoClient } from "./subscriptions/mercadopago.client.js";
import { RateLimitService } from "./security/rate-limit.service.js";
import { AntiAbuseService } from "./security/anti-abuse.service.js";
import { SecurityEventService } from "./security/security-event.service.js";
import { AbusePolicyService } from "./security/abuse-policy.service.js";
import { TurnstileService } from "./security/turnstile.service.js";
import { StorageService } from "./storage/storage.service.js";
import { createSeatPhotoVerifier } from "./verification/seat-photo-verifier.factory.js";
import { RoomRealtimeGateway } from "./realtime/room-realtime.gateway.js";
import { ExpirationJob } from "./jobs/expiration.job.js";
import { DisputeResolutionJob } from "./jobs/dispute-resolution.job.js";
import { DailyResetJob } from "./jobs/daily-reset.job.js";
import { AttachmentSweepJob } from "./jobs/attachment-sweep.job.js";
import { CheckInExpiryReminderJob } from "./jobs/checkin-expiry-reminder.job.js";
import { EmailSendJob } from "./email/email-send.job.js";
import { WeeklyGoalReminderJob } from "./jobs/weekly-goal-reminder.job.js";
import { ProService } from "./subscriptions/pro.js";
import { SeatWatchService } from "./seat-watch/seat-watch.service.js";
import { StudyHistoryService } from "./study-history/study-history.service.js";
import { ForecastService } from "./forecast/forecast.service.js";
import { FavoriteSeatsService } from "./favorites/favorites.service.js";
import { GroupStudyService } from "./group-study/group-study.service.js";
import { WeeklyGoalService } from "./weekly-goal/weekly-goal.service.js";
import { StreakBadgesService } from "./badges/streak-badges.service.js";
import { AchievementsService } from "./badges/achievements.service.js";
import { CollaborationService } from "./badges/collaboration.service.js";
import { ExamsService } from "./exams/exams.service.js";
import { UserCosmeticsService } from "./cosmetics/cosmetics.service.js";
import { QuietRoomService } from "./quiet-room/quiet-room.service.js";
import { GroupRankingService } from "./group-ranking/group-ranking.service.js";
import { RoomHours } from "./rooms/room-hours.js";

export interface ContainerDeps {
  /** Explicit override for isolated tests; production always wires the room schedule. */
  roomHours?: RoomHours | null;
  db: Db;
  hub: RealtimeHub;
  scheduler: Scheduler;
  /** The `EVIDENCE` R2 binding; null when absent (report evidence uploads are then disabled). */
  evidence: R2Bucket | null;
  clock: Clock;
  /** Config override for tests; defaults to the `env` singleton. */
  env?: Env;
}

export function buildServices(deps: ContainerDeps): Services {
  const { db, hub, scheduler, clock } = deps;
  const cfg = deps.env ?? defaultEnv;

  // Leaves.
  const roomCache = new RoomCache();
  const roomHours = deps.roomHours === undefined ? new RoomHours(db) : deps.roomHours;
  const roomState = new RoomStateService(db, roomHours);
  const presence = new PresenceService();
  const roles = new RolesService(db);
  const restriction = new RestrictionService(db);
  const alias = new AliasService(db);
  const reputation = new ReputationService(db);
  const studySessions = new StudySessionService(db);
  const securityEvents = new SecurityEventService(db, reputation);
  const rateLimit = new RateLimitService(db, cfg.ownerEmail);
  const turnstile = new TurnstileService();
  const abusePolicy = new AbusePolicyService(db, turnstile);
  const antiAbuse = new AntiAbuseService(rateLimit, securityEvents, abusePolicy, turnstile);
  const storage = new StorageService(deps.evidence, cfg);
  const qr = new QrService(db);
  const resend = cfg.resendApiKey && cfg.emailFrom ? new ResendClient(cfg.resendApiKey) : null;
  const mercadoPago = cfg.mpAccessToken ? new MercadoPagoClient(cfg.mpAccessToken) : null;
  const seatPhotoVerifier = createSeatPhotoVerifier(cfg);

  const pro = new ProService(db, roles, { subscriptionsEnabled: Boolean(cfg.mpAccessToken), clock });
  const cosmetics = new UserCosmeticsService(db, pro, clock);
  const collaboration = new CollaborationService(db, clock);
  const garden = new GardenService(db, clock, collaboration);
  const gardenPurchases = new GardenPurchasesService(db, garden, clock, mercadoPago, { webhookEnabled: !!cfg.mpWebhookSecret, webUrl: cfg.publicWebUrl });

  // Rooms come before notifications: the seat watch (a notification dependency) needs them.
  const rooms = new RoomsService(db, roomState, roomCache, roomHours);
  const seatWatch = new SeatWatchService(db, rooms, clock);
  const quietRoom = new QuietRoomService(db, rooms, clock);

  // Notifications and the realtime gateway (roomState -> notifications -> realtime).
  const push = new PushService(db);
  const notifications = new NotificationService(db, push, roomState, scheduler, seatWatch, quietRoom);
  // No scheduler: the 250 ms summary debounce uses setTimeout. Pending changes live in memory anyway,
  // and a SQL job cost ~6 rows written per seat change (DO Free plan caps rows written per day).
  const realtime = new RoomRealtimeGateway(hub, roomState, notifications, null);

  // Rooms and social.
  const roomStats = new RoomStatsService(db, rooms);
  const blocks = new BlocksService(db, alias);
  const reactions = new ReactionsService(db, blocks, restriction, hub);
  const study = new StudyService(db, restriction, roomHours);
  const profiles = new ProfilesService(db, study, alias, restriction, roles, pro, cosmetics);
  const avatars = new AvatarsService(db, restriction);
  const chat = new ChatService(db, rooms, restriction, roles, blocks, alias);
  const dm = new DmService(db, restriction, blocks, alias);
  const groups = new GroupsService(db, restriction, blocks, alias);
  const roomPeople = new RoomPeopleService(db, alias, roles, pro, cosmetics, roomHours);
  const rankings = new RankingsService(db, rooms, alias, roles, pro, cosmetics);
  const tableNames = new TableNamesService(db, restriction, realtime, roomCache);

  // Presence-sensitive domain.
  const disputes = new DisputeService(
    db, roomState, presence, securityEvents, studySessions, reputation, restriction, realtime, rateLimit, abusePolicy, notifications,
  );
  const checkIns = new CheckInService(db, roomState, presence, securityEvents, studySessions, qr, disputes, roles, roomCache, roomHours);
  const photoVerification = new PhotoVerificationService(db, roomState, presence, seatPhotoVerifier);
  const observations = new ObservationService(
    db, roomState, presence, securityEvents, abusePolicy, qr, reputation, notifications, disputes, roomCache, roomHours, collaboration,
  );

  // Admin and moderation.
  const moderation = new ModerationActionService(db, checkIns, realtime);
  const adminUsers = new AdminUsersService(db, moderation, roles);
  const adminReports = new AdminReportsService(db, storage, roles);
  const adminRooms = new AdminRoomsService(db, rooms, roomState, presence, roles, roomCache);
  const adminAudit = new AdminAuditService(db);
  const adminStudySessions = new AdminStudySessionsService(db, roles, rooms, studySessions);
  const announcements = new AnnouncementsService(db);
  const reports = new ReportsService(db, rateLimit, restriction, roles, storage);
  const feedback = new FeedbackService(db, clock, resend, { adminEmails: cfg.adminEmails, ownerEmail: cfg.ownerEmail, emailFrom: cfg.emailFrom });

  // Notifications / email / subscriptions.
  const pushSubscriptions = new PushSubscriptionsService(db);
  const notificationPreferences = new NotificationPreferencesService(db);
  const emailCampaigns = new EmailCampaignsService(db);
  const subscriptions = new SubscriptionsService(db, mercadoPago);

  // Pro features.
  const studyHistory = new StudyHistoryService(db, clock);
  const forecast = new ForecastService(db, rooms, clock);
  const favoriteSeats = new FavoriteSeatsService(db, rooms, clock);
  const groupStudy = new GroupStudyService(db, alias, blocks, realtime, clock);
  const groupRanking = new GroupRankingService(db, rooms, rankings, groupStudy);
  const weeklyGoal = new WeeklyGoalService(db, clock);
  const streakBadges = new StreakBadgesService(db, clock);
  const achievements = new AchievementsService(db, clock, streakBadges, collaboration, garden, rankings);
  const exams = new ExamsService(db, clock);

  const jobs = {
    expiration: new ExpirationJob(db, roomState, realtime, studySessions, disputes, roomHours),
    disputeResolution: new DisputeResolutionJob(disputes),
    dailyReset: new DailyResetJob(db, realtime, studySessions, forecast, seatWatch, quietRoom),
    attachmentSweep: new AttachmentSweepJob(db, storage),
    checkInExpiryReminder: new CheckInExpiryReminderJob(db, realtime, push),
    emailSend: new EmailSendJob(db, resend),
    weeklyGoalReminder: new WeeklyGoalReminderJob(db, push, pro, weeklyGoal, clock),
  };

  return {
    achievements, collaboration,
    db,
    rooms, roomState, roomStats, roomCache, presence, checkIns, photoVerification, observations,
    disputes, tableNames, reputation, rankings, studySessions, study, roomPeople,
    chat, dm, groups, blocks, profiles, avatars, alias, roles, restriction, reactions,
    adminUsers, adminReports, adminRooms, adminAudit, adminStudySessions, moderation,
    announcements, reports, qr, feedback,
    notifications, push, pushSubscriptions, notificationPreferences, emailCampaigns, resend,
    subscriptions, mercadoPago, rateLimit, antiAbuse, securityEvents, abusePolicy, turnstile,
    storage, seatPhotoVerifier,
    pro, seatWatch, studyHistory, forecast, favoriteSeats, groupStudy, weeklyGoal, streakBadges, exams,
    cosmetics, quietRoom, groupRanking, garden, gardenPurchases,
    sectionUsage: new SectionUsageService(db, clock),
    realtime, scheduler, clock,
    jobs,
  };
}
import { SectionUsageService } from "./usage/section-usage.service.js";
