import { Inject, Injectable, Logger } from "@nestjs/common";
import { randomInt } from "node:crypto";
import { and, eq, gt, inArray, lt, ne } from "drizzle-orm";
import { schema, type Db } from "@sala/database";
import { seatLabel } from "@sala/contracts";
import { DB } from "../database/database.module.js";
import { RoomStateService, type SeatStateChange } from "../rooms/room-state.service.js";
import { PushService } from "./push.service.js";
import { mapWithConcurrency } from "./concurrency.js";

/** At most one "seat freed" push per user per this many minutes. */
const SEAT_FREED_THROTTLE_MIN = 10;
/** At most one "admin present" push per user per this many minutes. */
const ADMIN_PRESENT_THROTTLE_MIN = 60;
/** At most this many pushes are sent concurrently per notification batch. */
const SEND_CONCURRENCY = 10;
/** The room-wide "admin present" banner/push fires this long after the check-in, at minimum... */
const ADMIN_PRESENT_DELAY_MIN_MS = 2 * 60_000;
/** ...and at most this long — a random delay in between so the timing can't be correlated back to
 *  a specific check-in/seat (07 §privacy: presence must never pinpoint the admin). */
const ADMIN_PRESENT_DELAY_MAX_MS = 5 * 60_000;

export interface SeatFreedRecipient {
  userId: string;
  seatIds: string[];
}

/**
 * Decides who gets notified about seat-freed / admin-present events and sends the pushes
 * (fire-and-forget — callers never await the push side, only the in-app recipient list). Postgres
 * remains canonical for preferences/subscriptions/throttling; this service never mutates seat
 * state itself.
 */
@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  /** One pending "admin present" timer per admin userId — a second fresh check-in by the same
   *  admin before the first timer fires reschedules it instead of stacking a second banner/push. */
  private readonly adminPresentTimers = new Map<string, NodeJS.Timeout>();

  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(PushService) private readonly push: PushService,
    @Inject(RoomStateService) private readonly roomState: RoomStateService,
  ) {}

  /**
   * Schedules the room-wide admin-present banner + throttled push for a random 2-5 minutes from
   * now, so the timing can never be correlated back to `adminUserId`'s specific check-in. `emitBanner`
   * (the caller's `RoomRealtimeGateway.emitAdminPresent`) is only invoked if, once the timer fires,
   * the admin still holds an ACTIVE check-in in `roomId` — if they've since checked out, nothing
   * happens. The timer is `unref`'d so it never keeps the process alive on its own.
   */
  scheduleAdminPresent(roomId: string, adminUserId: string, emitBanner: () => void): void {
    const existing = this.adminPresentTimers.get(adminUserId);
    if (existing) clearTimeout(existing);

    const delayMs = randomInt(ADMIN_PRESENT_DELAY_MIN_MS, ADMIN_PRESENT_DELAY_MAX_MS);
    const timer = setTimeout(() => {
      this.adminPresentTimers.delete(adminUserId);
      this.fireAdminPresent(roomId, adminUserId, emitBanner).catch((err) =>
        this.logger.error("Failed to fire scheduled admin-present alert", err instanceof Error ? err.stack : String(err)),
      );
    }, delayMs);
    timer.unref?.();
    this.adminPresentTimers.set(adminUserId, timer);
  }

  private async fireAdminPresent(roomId: string, adminUserId: string, emitBanner: () => void): Promise<void> {
    if (!(await this.hasActiveCheckIn(adminUserId, roomId))) return;
    emitBanner();
    await this.notifyAdminPresent(roomId, adminUserId);
  }

  private async hasActiveCheckIn(userId: string, roomId: string): Promise<boolean> {
    const [row] = await this.db
      .select({ userId: schema.checkIns.userId })
      .from(schema.checkIns)
      .where(
        and(
          eq(schema.checkIns.userId, userId),
          eq(schema.checkIns.roomId, roomId),
          eq(schema.checkIns.status, "ACTIVE"),
          gt(schema.checkIns.expiresAt, new Date()),
        ),
      )
      .limit(1);
    return row !== undefined;
  }

  /**
   * Called after a `RoomStateService.recomputeSeats` batch is broadcast — the caller (the realtime
   * gateway) itself never awaits this, so it can't delay the request that triggered the broadcast.
   * Returns the users who should get an in-app `seat:freed-alert` (opted in and not currently
   * checked into this room) — the caller emits that itself. The push side (throttled independently
   * of the in-app alert) is sent from here before returning, so the two can't race in tests/callers
   * that do await this.
   */
  async handleSeatFreed(roomId: string, changes: SeatStateChange[], summary?: { free: number }): Promise<SeatFreedRecipient[]> {
    const freedSeatIds = [
      ...new Set(
        changes
          .filter((c) => c.status === "FREE" && (c.previousStatus === "OCCUPIED" || c.previousStatus === "SAVED" || c.previousStatus === "UNCERTAIN"))
          .map((c) => c.seatId),
      ),
    ];
    if (freedSeatIds.length === 0) return [];

    const eligible = await this.eligibleSubscribers(roomId, "seatFreed");
    if (eligible.length === 0) return [];

    try {
      await this.sendSeatFreedPush(roomId, freedSeatIds, eligible, summary);
    } catch (err) {
      this.logger.error("Failed to send seat-freed push batch", err instanceof Error ? err.stack : String(err));
    }

    return eligible.map((userId) => ({ userId, seatIds: freedSeatIds }));
  }

  /** Called when a fresh (not moved/extended) check-in is created by an ADMIN/MODERATOR. Push-only
   *  — the in-app room-wide banner is a plain socket broadcast the gateway sends unconditionally. */
  async notifyAdminPresent(roomId: string, adminUserId: string): Promise<void> {
    const subscribers = await this.db
      .select({ userId: schema.notificationPreferences.userId })
      .from(schema.notificationPreferences)
      .where(and(eq(schema.notificationPreferences.adminPresent, true), ne(schema.notificationPreferences.userId, adminUserId)));
    if (subscribers.length === 0) return;

    const toNotify = await this.claimThrottle(
      subscribers.map((s) => s.userId),
      "ADMIN_PRESENT",
      ADMIN_PRESENT_THROTTLE_MIN,
    );
    if (toNotify.length === 0) return;

    const url = await this.roomUrl(roomId);
    await mapWithConcurrency(toNotify, SEND_CONCURRENCY, (userId) =>
      this.push.sendToUser(userId, {
        title: "Hay un admin en la sala",
        body: "Si tenés un problema con un lugar, podés pedir ayuda.",
        url,
        tag: "admin-present",
      }),
    );
  }

  /** Users subscribed to `preferenceKey` who don't currently hold an active check-in in `roomId`. */
  private async eligibleSubscribers(roomId: string, preferenceKey: "seatFreed" | "adminPresent"): Promise<string[]> {
    const column = preferenceKey === "seatFreed" ? schema.notificationPreferences.seatFreed : schema.notificationPreferences.adminPresent;
    const subscribers = await this.db.select({ userId: schema.notificationPreferences.userId }).from(schema.notificationPreferences).where(eq(column, true));
    if (subscribers.length === 0) return [];

    const subscriberIds = subscribers.map((s) => s.userId);
    const activeCheckIns = await this.db
      .select({ userId: schema.checkIns.userId })
      .from(schema.checkIns)
      .where(and(eq(schema.checkIns.roomId, roomId), eq(schema.checkIns.status, "ACTIVE"), inArray(schema.checkIns.userId, subscriberIds)));
    const checkedIn = new Set(activeCheckIns.map((c) => c.userId));

    return subscriberIds.filter((id) => !checkedIn.has(id));
  }

  private async sendSeatFreedPush(roomId: string, freedSeatIds: string[], recipients: string[], knownSummary?: { free: number }): Promise<void> {
    const toNotify = await this.claimThrottle(recipients, "SEAT_FREED", SEAT_FREED_THROTTLE_MIN);
    if (toNotify.length === 0) return;

    const [slug, summary] = await Promise.all([this.roomSlug(roomId), knownSummary ?? this.roomState.getRoomSummary(roomId)]);
    const single = freedSeatIds.length === 1 ? await this.describeSeat(freedSeatIds[0]!) : null;

    const title = single ? "Se liberó un lugar" : `Se liberaron ${freedSeatIds.length} lugares`;
    const body = single ? `${single} — quedan ${summary.free} libres en la sala` : `Quedan ${summary.free} libres en la sala`;
    const url = single ? `/sala/${slug}?seat=${freedSeatIds[0]}` : `/sala/${slug}`;

    await mapWithConcurrency(toNotify, SEND_CONCURRENCY, (userId) => this.push.sendToUser(userId, { title, body, url, tag: "seat-freed" }));
  }

  private async describeSeat(seatId: string): Promise<string> {
    const [row] = await this.db
      .select({ seatNumber: schema.seats.seatNumber, tableCode: schema.roomTables.code, tableType: schema.roomTables.type })
      .from(schema.seats)
      .innerJoin(schema.roomTables, eq(schema.roomTables.id, schema.seats.tableId))
      .where(eq(schema.seats.id, seatId))
      .limit(1);
    if (!row) return "Un lugar";
    return seatLabel(row.tableCode, row.tableType, row.seatNumber);
  }

  private async roomSlug(roomId: string): Promise<string> {
    const [room] = await this.db.select({ slug: schema.rooms.slug }).from(schema.rooms).where(eq(schema.rooms.id, roomId)).limit(1);
    return room?.slug ?? "principal";
  }

  private async roomUrl(roomId: string): Promise<string> {
    return `/sala/${await this.roomSlug(roomId)}`;
  }

  /**
   * Atomically claims the right to notify each of `userIds` of `type`: a single upsert that only
   * "wins" (and is returned) for a user with no throttle row yet, or whose existing row is older
   * than `minutes` ago — done as one `INSERT ... ON CONFLICT ... WHERE ... RETURNING` so two
   * concurrent calls (e.g. two seats freeing in the same instant) can't both read "not throttled"
   * and both send. Callers must only send to the ids this returns.
   */
  private async claimThrottle(userIds: string[], type: string, minutes: number): Promise<string[]> {
    if (userIds.length === 0) return [];
    const now = new Date();
    const cutoff = new Date(now.getTime() - minutes * 60_000);
    const rows = await this.db
      .insert(schema.notificationThrottles)
      .values(userIds.map((userId) => ({ userId, type, lastNotifiedAt: now })))
      .onConflictDoUpdate({
        target: [schema.notificationThrottles.userId, schema.notificationThrottles.type],
        set: { lastNotifiedAt: now },
        where: lt(schema.notificationThrottles.lastNotifiedAt, cutoff),
      })
      .returning({ userId: schema.notificationThrottles.userId });
    return rows.map((r) => r.userId);
  }
}
