import type { SqliteScheduler } from "../platform/scheduler.js";
import type { RealtimeSockets } from "../realtime/ws-server.js";
import type { Services } from "../services.js";

/** Payload of an `admin-present:<adminUserId>` job (see `NotificationService.scheduleAdminPresent`). */
interface AdminPresentPayload {
  roomId: string;
  adminUserId: string;
}

function isAdminPresentPayload(value: unknown): value is AdminPresentPayload {
  const v = value as Partial<AdminPresentPayload> | null;
  return typeof v?.roomId === "string" && typeof v?.adminUserId === "string";
}

/**
 * Attaches a handler to every job key the scheduler can fire: the recurring jobs in
 * `RECURRING_JOBS` plus the `summary:<roomId>` and `admin-present:<adminUserId>` one-shot prefixes.
 */
export function registerJobs(scheduler: Pick<SqliteScheduler, "register">, services: Services, sockets: Pick<RealtimeSockets, "sweepSessions">): void {
  const { jobs } = services;
  scheduler.register("daily-reset", () => jobs.dailyReset.tick());
  scheduler.register("expiration", () => jobs.expiration.tick());
  scheduler.register("checkin-expiry-reminder", () => jobs.checkInExpiryReminder.tick());
  scheduler.register("dispute-resolution", () => jobs.disputeResolution.tick());
  scheduler.register("attachment-sweep", () => jobs.attachmentSweep.tick());
  scheduler.register("email-send", () => jobs.emailSend.tick());
  scheduler.register("weekly-goal-reminder", () => jobs.weeklyGoalReminder.tick());
  scheduler.register("realtime-session-sweep", () => sockets.sweepSessions());

  // `summary:<roomId>` — the coalesced room summary flush scheduled by the realtime gateway.
  scheduler.register("summary", ({ key }) => services.realtime.flushRoom(key.slice(key.indexOf(":") + 1)));

  // `admin-present:<adminUserId>` — the delayed room-wide admin banner (and push).
  scheduler.register("admin-present", ({ payload }) => {
    if (!isAdminPresentPayload(payload)) return;
    return services.notifications.fireAdminPresent(payload.roomId, payload.adminUserId, () => services.realtime.emitAdminPresent(payload.roomId, {}));
  });
}
