import { Inject, Injectable, Logger } from "@nestjs/common";
import { and, eq, gt, inArray, ne } from "drizzle-orm";
import { schema, type Db } from "@uns/database";
import { DB } from "../database/database.module.js";
import { RoomStateService, type SeatStateChange } from "../rooms/room-state.service.js";
import { PushService } from "./push.service.js";
import { seatLabel } from "./seat-label.js";

/** At most one "seat freed" push per user per this many minutes. */
const SEAT_FREED_THROTTLE_MIN = 10;
/** At most one "admin present" push per user per this many minutes. */
const ADMIN_PRESENT_THROTTLE_MIN = 60;

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

  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(PushService) private readonly push: PushService,
    @Inject(RoomStateService) private readonly roomState: RoomStateService,
  ) {}

  /**
   * Called after a `RoomStateService.recomputeSeats` batch is broadcast — the caller (the realtime
   * gateway) itself never awaits this, so it can't delay the request that triggered the broadcast.
   * Returns the users who should get an in-app `seat:freed-alert` (opted in and not currently
   * checked into this room) — the caller emits that itself. The push side (throttled independently
   * of the in-app alert) is sent from here before returning, so the two can't race in tests/callers
   * that do await this.
   */
  async handleSeatFreed(roomId: string, changes: SeatStateChange[]): Promise<SeatFreedRecipient[]> {
    const freedSeatIds = changes
      .filter((c) => c.status === "FREE" && (c.previousStatus === "OCCUPIED" || c.previousStatus === "UNCERTAIN"))
      .map((c) => c.seatId);
    if (freedSeatIds.length === 0) return [];

    const eligible = await this.eligibleSubscribers(roomId, "seatFreed");
    if (eligible.length === 0) return [];

    try {
      await this.sendSeatFreedPush(roomId, freedSeatIds, eligible);
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

    const toNotify = await this.filterThrottled(
      subscribers.map((s) => s.userId),
      "ADMIN_PRESENT",
      ADMIN_PRESENT_THROTTLE_MIN,
    );
    if (toNotify.length === 0) return;

    const url = await this.roomUrl(roomId);
    await Promise.all(
      toNotify.map((userId) =>
        this.push.sendToUser(userId, {
          title: "Hay un admin en la sala",
          body: "Si tenés un problema con un lugar, podés pedir ayuda.",
          url,
          tag: "admin-present",
        }),
      ),
    );
    await this.markNotified(toNotify, "ADMIN_PRESENT");
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

  private async sendSeatFreedPush(roomId: string, freedSeatIds: string[], recipients: string[]): Promise<void> {
    const toNotify = await this.filterThrottled(recipients, "SEAT_FREED", SEAT_FREED_THROTTLE_MIN);
    if (toNotify.length === 0) return;

    const [slug, summary] = await Promise.all([this.roomSlug(roomId), this.roomState.getRoomSummary(roomId)]);
    const single = freedSeatIds.length === 1 ? await this.describeSeat(freedSeatIds[0]!) : null;

    const title = single ? "Se liberó un lugar" : `Se liberaron ${freedSeatIds.length} lugares`;
    const body = single ? `${single} — quedan ${summary.free} libres en la sala` : `Quedan ${summary.free} libres en la sala`;
    const url = single ? `/sala/${slug}?seat=${freedSeatIds[0]}` : `/sala/${slug}`;

    await Promise.all(toNotify.map((userId) => this.push.sendToUser(userId, { title, body, url, tag: "seat-freed" })));
    await this.markNotified(toNotify, "SEAT_FREED");
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

  private async filterThrottled(userIds: string[], type: string, minutes: number): Promise<string[]> {
    if (userIds.length === 0) return [];
    const cutoff = new Date(Date.now() - minutes * 60_000);
    const rows = await this.db
      .select({ userId: schema.notificationThrottles.userId })
      .from(schema.notificationThrottles)
      .where(
        and(
          eq(schema.notificationThrottles.type, type),
          inArray(schema.notificationThrottles.userId, userIds),
          gt(schema.notificationThrottles.lastNotifiedAt, cutoff),
        ),
      );
    const throttled = new Set(rows.map((r) => r.userId));
    return userIds.filter((id) => !throttled.has(id));
  }

  private async markNotified(userIds: string[], type: string): Promise<void> {
    const now = new Date();
    for (const userId of userIds) {
      await this.db
        .insert(schema.notificationThrottles)
        .values({ userId, type, lastNotifiedAt: now })
        .onConflictDoUpdate({
          target: [schema.notificationThrottles.userId, schema.notificationThrottles.type],
          set: { lastNotifiedAt: now },
        });
    }
  }
}
