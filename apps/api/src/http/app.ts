// `createApp({ services, auth })` builds the whole Hono app (middleware + every router under
// /api/v1 + the Better Auth handler under /api/auth). The Worker runs it inside the AppDO.
import { Hono } from "hono";
import { sectionUsageRouter } from "../usage/section-usage.router.js";
import { reactionsRouter } from "../chat/reactions.router.js";
import { gardenRouter } from "../garden/garden.router.js";
import { cors } from "hono/cors";
import type { Auth } from "../auth/auth.instance.js";
import { meRouter } from "../auth/me.router.js";
import { toErrorResponse } from "../common/api-error.js";
import { env } from "../env.js";
import type { Services } from "../services.js";
import type { AppEnv } from "./context.js";
import { authRateLimit } from "./middleware/auth-rate-limit.js";
import { bodyLimits } from "./middleware/body-limits.js";
import { csrfMiddleware } from "./middleware/csrf.js";
import { globalIpRateLimit } from "./middleware/global-ip-rate-limit.js";
import { maintenanceGate } from "./middleware/maintenance.js";
import { securityHeaders } from "./middleware/security-headers.js";
import { slowLog } from "./middleware/slow-log.js";
import { healthRouter } from "./health.router.js";
import { authProvidersRouter } from "./auth-providers.router.js";
import { e2eTestHooksRouter } from "./e2e-test-hooks.router.js";
import { realtimeTokenRouter } from "../realtime/realtime-token.router.js";
import { roomsRouter } from "../rooms/rooms.router.js";
import { roomStatsRouter } from "../rooms/room-stats.router.js";
import { presenceRouter } from "../presence/presence.router.js";
import { checkinsRouter } from "../checkins/checkins.router.js";
import { observationsRouter } from "../observations/observations.router.js";
import { disputesRouter } from "../disputes/disputes.router.js";
import { disputesReadRouter } from "../disputes/disputes-read.router.js";
import { tableNamesRouter } from "../table-names/table-names.router.js";
import { rankingsRouter } from "../rankings/rankings.router.js";
import { studyRouter } from "../study/study.router.js";
import { roomPeopleRouter } from "../study/room-people.router.js";
import { chatRouter } from "../chat/chat.router.js";
import { dmRouter } from "../dm/dm.router.js";
import { groupsRouter } from "../groups/groups.router.js";
import { blocksRouter } from "../blocks/blocks.router.js";
import { profilesRouter } from "../profiles/profiles.router.js";
import { accountRouter } from "../profiles/account.router.js";
import { checkinIdentityRouter } from "../profiles/checkin-identity.router.js";
import { avatarsRouter } from "../avatars/avatars.router.js";
import { adminUsersRouter } from "../admin/admin-users.router.js";
import { adminReportsRouter } from "../admin/admin-reports.router.js";
import { adminFeedbackRouter } from "../admin/admin-feedback.router.js";
import { adminRoomsRouter } from "../admin/admin-rooms.router.js";
import { adminAuditRouter } from "../admin/admin-audit.router.js";
import { adminNamesRouter } from "../admin/admin-names.router.js";
import { adminAnnouncementsRouter } from "../admin/admin-announcements.router.js";
import { adminStudySessionsRouter } from "../admin/admin-study-sessions.router.js";
import { announcementsRouter } from "../announcements/announcements.router.js";
import { qrRouter } from "../qr/qr.router.js";
import { reportsRouter } from "../reports/reports.router.js";
import { feedbackRouter } from "../feedback/feedback.router.js";
import { pushSubscriptionsRouter } from "../notifications/push-subscriptions.router.js";
import { notificationPreferencesRouter } from "../notifications/notification-preferences.router.js";
import { adminEmailRouter } from "../email/admin-email.router.js";
import { unsubscribeRouter } from "../email/unsubscribe.router.js";
import { subscriptionsRouter } from "../subscriptions/subscriptions.router.js";
import { donationsRouter } from "../subscriptions/donations.router.js";
import { mercadopagoWebhookRouter } from "../subscriptions/mercadopago-webhook.router.js";
import { verificationRouter } from "../verification/verification.router.js";
import { seatWatchRouter } from "../seat-watch/seat-watch.router.js";
import { studyHistoryRouter } from "../study-history/study-history.router.js";
import { forecastRouter } from "../forecast/forecast.router.js";
import { favoritesRouter } from "../favorites/favorites.router.js";
import { groupStudyRouter } from "../group-study/group-study.router.js";
import { weeklyGoalRouter } from "../weekly-goal/weekly-goal.router.js";
import { streakBadgesRouter } from "../badges/streak-badges.router.js";
import { achievementsRouter } from "../badges/achievements.router.js";
import { examsRouter } from "../exams/exams.router.js";
import { cosmeticsRouter } from "../cosmetics/cosmetics.router.js";
import { quietRoomRouter } from "../quiet-room/quiet-room.router.js";
import { groupRankingRouter } from "../group-ranking/group-ranking.router.js";

export interface AppDeps {
  services: Services;
  auth: Auth;
}

export function createApp(deps: AppDeps): Hono<AppEnv> {
  const { services, auth } = deps;
  const app = new Hono<AppEnv>();

  // 1. Context.
  app.use("*", async (c, next) => {
    c.set("services", services);
    c.set("auth", auth);
    c.set("ip", c.req.header("cf-connecting-ip") || "127.0.0.1");
    c.set("user", null);
    await next();
  });
  // 2-5. Maintenance gate, security headers, CORS (credentials, local cross-origin dev only), slow-request log.
  app.use("*", maintenanceGate());
  app.use("*", securityHeaders());
  app.use("*", cors({ origin: env.webOrigins, credentials: true }));
  app.use("*", slowLog());
  // 6. Coarse per-IP cap (300/min) over every /api/v1 route; health and the MP webhook are skipped.
  //    Off under E2E hooks (never in production): the whole Playwright suite shares one localhost IP.
  if (!env.e2eTestHooks) app.use("/api/v1/*", globalIpRateLimit());
  // 7. CSRF origin check on state-changing /api/v1 requests.
  app.use("/api/v1/*", csrfMiddleware(env.webOrigins));
  // 8. Better Auth, behind its per-email/IP limiter.
  app.on(["GET", "POST"], "/api/auth/*", authRateLimit(services.rateLimit), (c) => c.var.auth.handler(c.req.raw));
  // 9. Body-size limits (100 KB; photo 3 MB and avatar 1 MB for live sessions).
  app.use("/api/v1/*", bodyLimits());

  // 10. Routers, in the blueprint 2.9 order.
  const api = new Hono<AppEnv>();
  for (const router of [
    healthRouter,
      sectionUsageRouter,
    authProvidersRouter,
    meRouter,
    realtimeTokenRouter,
    roomsRouter,
    roomStatsRouter,
    presenceRouter,
    checkinsRouter,
    observationsRouter,
    disputesRouter,
    disputesReadRouter,
    tableNamesRouter,
    rankingsRouter,
    studyRouter,
    roomPeopleRouter,
    chatRouter,
    reactionsRouter,
    dmRouter,
    groupsRouter,
    blocksRouter,
    profilesRouter,
    accountRouter,
    checkinIdentityRouter,
    avatarsRouter,
    adminUsersRouter,
    adminReportsRouter,
    adminFeedbackRouter,
    adminRoomsRouter,
    adminAuditRouter,
    adminNamesRouter,
    adminAnnouncementsRouter,
    adminStudySessionsRouter,
    announcementsRouter,
    qrRouter,
    reportsRouter,
    feedbackRouter,
    pushSubscriptionsRouter,
    notificationPreferencesRouter,
    adminEmailRouter,
    unsubscribeRouter,
    subscriptionsRouter,
    donationsRouter,
    mercadopagoWebhookRouter,
    verificationRouter,
    seatWatchRouter,
    studyHistoryRouter,
    forecastRouter,
    favoritesRouter,
    groupStudyRouter,
    weeklyGoalRouter,
    streakBadgesRouter,
    achievementsRouter,
    examsRouter,
    cosmeticsRouter,
    quietRoomRouter,
    groupRankingRouter,
    gardenRouter,
    e2eTestHooksRouter,
  ]) {
    api.route("/", router);
  }
  app.route("/api/v1", api);

  // 11. Error mapping.
  app.onError((err, c) => {
    const r = toErrorResponse(err, { method: c.req.method, path: c.req.path });
    return c.json(r.body, r.status as never);
  });
  app.notFound((c) => c.json({ error: { code: "NOT_FOUND", message: `Cannot ${c.req.method} ${c.req.path}` } }, 404));

  return app;
}
