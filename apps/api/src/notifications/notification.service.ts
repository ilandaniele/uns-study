import { randomInt } from "node:crypto";
import { and, eq, gt, inArray, ne, notExists, sql } from "drizzle-orm";
import { chunk, schema, type Db } from "@sala/database";
import { DISPUTE_MINUTES, seatLabel, type DisputeVoteAvailableEvent, type QuietRoomAlertEvent, type RoomSummary } from "@sala/contracts";
import { isMissingSchemaError } from "../common/sqlite-errors.js";
import { Logger } from "../platform/logger.js";
import type { Scheduler } from "../platform/scheduler.js";
import { RoomStateService, type SeatStateChange } from "../rooms/room-state.service.js";
import { PushService } from "./push.service.js";
import { mapWithConcurrency } from "./concurrency.js";
import { claimNotificationThrottle } from "./throttle.js";
import type { SeatWatchService } from "../seat-watch/seat-watch.service.js";
import { occupancyCrossing, type QuietRoomService } from "../quiet-room/quiet-room.service.js";

/** At most one "seat freed" push per user per this many minutes. */
const SEAT_FREED_THROTTLE_MIN = 10;
/** At most one "admin present" push per user per this many minutes. */
const ADMIN_PRESENT_THROTTLE_MIN = 60;
/** At most one "marked as free" push per holder per seat per this many minutes. */
const SEAT_CHALLENGE_THROTTLE_MIN = 10;
/** At most this many pushes are sent concurrently per notification batch. */
const SEND_CONCURRENCY = 10;
/** Direct/group message push bodies are cut to this many characters. */
const DM_PUSH_BODY_MAX = 120;
/** The room-wide "admin present" banner/push fires this long after the check-in, at minimum... */
const ADMIN_PRESENT_DELAY_MIN_MS = 2 * 60_000;
/** ...and at most this long — a random delay in between so the timing can't be correlated back to
 *  a specific check-in/seat (07 §privacy: presence must never pinpoint the admin). */
const ADMIN_PRESENT_DELAY_MAX_MS = 5 * 60_000;

export interface SeatFreedRecipient {
  userId: string;
  seatIds: string[];
}

export interface QuietRoomRecipient {
  userId: string;
  event: QuietRoomAlertEvent;
}

export type SeatChallengeReason = "dispute" | "marked-free-vote" | "marked-free" | "saved-challenged" | "lost";

function seatChallengeCopy(reason: SeatChallengeReason, seatCode: string): { title: string; body: string } {
  switch (reason) {
    case "dispute":
      return { title: "Están reclamando tu lugar", body: `Asiento ${seatCode}. Si seguís acá, entrá y tocá "Sigo acá".` };
    case "marked-free-vote":
      return {
        title: "Marcaron tu lugar como libre",
        body: `Asiento ${seatCode}. Abrieron una votación de ${DISPUTE_MINUTES} minutos: si seguís acá, entrá y tocá "Sigo acá".`,
      };
    case "marked-free":
      return { title: "Marcaron tu lugar como libre", body: `Asiento ${seatCode}. Si seguís acá, entrá y tocá "Sigo acá".` };
    case "saved-challenged":
      return {
        title: "Quieren liberar un lugar que marcaste como guardado",
        body: `Asiento ${seatCode}. Si todavía lo estás usando, entrá a la sala.`,
      };
    case "lost":
      return { title: "Perdiste tu lugar", body: `Asiento ${seatCode}. La votación confirmó que ya no estás ahí y cerró tu registro.` };
  }
}

/**
 * Decides who gets notified about seat-freed / admin-present events and sends the pushes
 * (fire-and-forget — callers never await the push side, only the in-app recipient list). Postgres
 * remains canonical for preferences/subscriptions/throttling; this service never mutates seat
 * state itself.
 */
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(
    private readonly db: Db,
    private readonly push: PushService,
    private readonly roomState: RoomStateService,
    private readonly scheduler: Scheduler,
    /** Pro seat watches; null in tests that construct the service directly. */
    private readonly seatWatch: SeatWatchService | null = null,
    /** Pro quiet-room watches; null in tests that construct the service directly. */
    private readonly quietRoom: QuietRoomService | null = null,
  ) {}

  /**
   * Schedules the room-wide admin-present banner + throttled push for a random 2-5 minutes from
   * now, so the timing can never be correlated back to `adminUserId`'s specific check-in. The
   * scheduler job (`admin-present:<adminUserId>`) calls `fireAdminPresent`, which only emits the
   * banner if the admin still holds an ACTIVE check-in in `roomId`. A second fresh check-in by the
   * same admin before the job fires replaces it instead of stacking a second banner/push.
   */
  scheduleAdminPresent(roomId: string, adminUserId: string): void {
    const delayMs = randomInt(ADMIN_PRESENT_DELAY_MIN_MS, ADMIN_PRESENT_DELAY_MAX_MS);
    this.scheduler.schedule(`admin-present:${adminUserId}`, new Date(Date.now() + delayMs), { roomId, adminUserId });
  }

  /** Scheduler handler body: emits the banner (via `emitBanner`) and the push if the admin is still checked in. */
  async fireAdminPresent(roomId: string, adminUserId: string, emitBanner: () => void): Promise<void> {
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

    // Pro seat watches get their own, more specific push; those users are left out of the generic one.
    const watchers = await this.notifySeatWatchers(roomId, freedSeatIds);

    const eligible = await this.eligibleSubscribers(roomId, "seatFreed");
    if (eligible.length === 0) return [];

    try {
      await this.sendSeatFreedPush(
        roomId,
        freedSeatIds,
        eligible.filter((userId) => !watchers.has(userId)),
        summary,
      );
    } catch (err) {
      this.logger.error("Failed to send seat-freed push batch", err instanceof Error ? err.stack : String(err));
    }

    return eligible.map((userId) => ({ userId, seatIds: freedSeatIds }));
  }

  /**
   * Claims (and deletes) the seat watches matching `freedSeatIds` and pushes each watcher who has a
   * push subscription and isn't checked into the room. Never throws: a missing table or a failed
   * push must not break the seat-freed flow. Returns every matched user, so the caller can keep them
   * out of the generic push.
   */
  private async notifySeatWatchers(roomId: string, freedSeatIds: string[]): Promise<Set<string>> {
    if (!this.seatWatch) return new Set();
    try {
      const matches = await this.seatWatch.claimMatches(roomId, freedSeatIds, new Date());
      if (matches.length === 0) return new Set();

      const toPush: typeof matches = [];
      for (const match of matches) {
        if (!(await this.hasActiveCheckIn(match.userId, roomId))) toPush.push(match);
      }
      const subscribed = new Set(await this.withPushSubscription(toPush.map((m) => m.userId)));
      const slug = await this.roomSlug(roomId);
      await mapWithConcurrency(
        toPush.filter((m) => subscribed.has(m.userId)),
        SEND_CONCURRENCY,
        async (match) =>
          this.push.sendToUser(match.userId, {
            title: "Se liberó un lugar que estabas esperando",
            body: await this.describeSeat(match.seatId),
            url: `/sala/${slug}?seat=${match.seatId}`,
            tag: "seat-watch",
          }),
      );
      return new Set(matches.map((m) => m.userId));
    } catch (err) {
      if (!isMissingSchemaError(err)) {
        this.logger.error("Failed to notify seat watchers", err instanceof Error ? err.stack : String(err));
      }
      return new Set();
    }
  }

  /**
   * Quiet-room alert: claims (one-shot delete) the watches the room just dropped through. Watchers with an
   * active check-in in the room are consumed but not notified. Others get a push (if subscribed) and are
   * returned for the in-app event. Never throws; a missing table is silent. Writes only when a watch fires.
   */
  async handleQuietRoom(roomId: string, summary: RoomSummary, changes: SeatStateChange[]): Promise<QuietRoomRecipient[]> {
    if (!this.quietRoom) return [];
    const crossing = occupancyCrossing(summary, changes);
    if (!crossing || crossing.afterPct >= crossing.beforePct) return [];
    try {
      const claimed = await this.quietRoom.claimCrossed(roomId, crossing.beforePct, crossing.afterPct, new Date());
      if (claimed.length === 0) return [];

      const targets: typeof claimed = [];
      for (const watch of claimed) {
        if (!(await this.hasActiveCheckIn(watch.userId, roomId))) targets.push(watch);
      }
      if (targets.length === 0) return [];

      const slug = await this.roomSlug(roomId);
      const subscribed = new Set(await this.withPushSubscription(targets.map((t) => t.userId)));
      try {
        await mapWithConcurrency(
          targets.filter((t) => subscribed.has(t.userId)),
          SEND_CONCURRENCY,
          (watch) =>
            this.push.sendToUser(watch.userId, {
              title: "La sala está más tranquila",
              body: `Está al ${crossing.afterPct} % ocupada: hay ${summary.free} lugares libres.`,
              url: `/sala/${slug}`,
              tag: "quiet-room",
            }),
        );
      } catch (err) {
        this.logger.error("Failed to send quiet-room push batch", err instanceof Error ? err.stack : String(err));
      }
      return targets.map((t) => ({
        userId: t.userId,
        event: { roomId, roomSlug: slug, thresholdPct: t.thresholdPct, occupancyPct: crossing.afterPct, free: summary.free },
      }));
    } catch (err) {
      if (!isMissingSchemaError(err)) {
        this.logger.error("Failed to process quiet-room watches", err instanceof Error ? err.stack : String(err));
      }
      return [];
    }
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
      await this.withPushSubscription(subscribers.map((s) => s.userId)),
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

  /**
   * Push for a new private/group message. Push-only — the in-app delivery is the realtime emit the
   * caller already did. `senderDisplayName` must be the recipient-facing name (alias or chosen
   * identity), never an email. The tag is per conversation so a burst collapses into one notification.
   */
  async notifyDirectMessage(input: { recipientId: string; senderDisplayName: string; conversationId: string; content: string; url?: string }): Promise<void> {
    const content = input.content.trim();
    const body = content.length > DM_PUSH_BODY_MAX ? `${content.slice(0, DM_PUSH_BODY_MAX - 1).trimEnd()}…` : content;
    await this.push.sendToUser(input.recipientId, {
      title: input.senderDisplayName.trim() || "Nuevo mensaje privado",
      body,
      url: input.url ?? `/chat/dm/${input.conversationId}`,
      tag: `dm-${input.conversationId}`,
    });
  }

  /**
   * Push to whoever holds a seat that someone else is challenging, so they can open the room and
   * answer "Sigo acá":
   * - `dispute`: a vote was opened on their check-in;
   * - `marked-free-vote`: an "Está libre" report on their check-in opened a vote;
   * - `marked-free`: an "Está libre" report that couldn't open a vote (cooldown/limits);
   * - `saved-challenged`: someone wants to free a seat they marked "Está guardado";
   * - `lost`: a vote ended their check-in.
   * Respects the user's `checkinExpiry` preference (default on — it only concerns their own seat).
   * Vote pushes are not throttled (the dispute flow already limits them); bare reports are
   * throttled to one per user per seat per 10 minutes.
   */
  async notifySeatChallenged(input: { userId: string; roomId: string; seatId: string; seatCode: string; reason: SeatChallengeReason }): Promise<void> {
    const [prefs] = await this.db
      .select({ checkinExpiry: schema.notificationPreferences.checkinExpiry })
      .from(schema.notificationPreferences)
      .where(eq(schema.notificationPreferences.userId, input.userId))
      .limit(1);
    if (prefs && !prefs.checkinExpiry) return;

    if (input.reason === "marked-free" || input.reason === "saved-challenged") {
      const claimed = await this.claimThrottle([input.userId], `SEAT_CHALLENGE_FREE:${input.seatId}`, SEAT_CHALLENGE_THROTTLE_MIN);
      if (claimed.length === 0) return;
    }

    const { title, body } = seatChallengeCopy(input.reason, input.seatCode);
    await this.push.sendToUser(input.userId, {
      title,
      body,
      url: await this.roomUrl(input.roomId),
      tag: `seat-challenge-${input.seatId}`,
    });
  }

  /** Only current, unexpired holders in this room; never anonymous visitors or departed users. */
  disputeVoters(roomId: string, excludedUserIds: readonly string[], now = new Date()): string[] {
    const rows = this.db.selectDistinct({ userId: schema.checkIns.userId }).from(schema.checkIns)
      .where(and(eq(schema.checkIns.roomId, roomId), eq(schema.checkIns.status, "ACTIVE"), gt(schema.checkIns.expiresAt, now))).all();
    return rows.map((row) => row.userId).filter((id) => !excludedUserIds.includes(id));
  }

  /** One push per eligible user at opening, not one per countdown tick or vote update. */
  async notifyDisputeVoters(userIds: readonly string[], event: DisputeVoteAvailableEvent): Promise<void> {
    const ends = new Intl.DateTimeFormat("es-AR", { timeZone: "America/Argentina/Buenos_Aires", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(event.closesAt));
    await mapWithConcurrency(userIds, 5, async (userId) => {
      if (Date.parse(event.closesAt) <= Date.now()) return;
      try {
        await this.push.sendToUser(userId, {
          title: "Hay una votación en tu sala",
          body: `Lugar ${event.seatCode}. Termina a las ${ends}. Entrá para confirmar si está ocupado, libre o guardado.`,
          url: `/sala/${encodeURIComponent(event.roomSlug)}?seat=${encodeURIComponent(event.seatId)}`,
          tag: `dispute-vote-${event.disputeId}`,
          expiresAt: event.closesAt,
        });
      } catch (error) {
        this.logger.error("Failed to send vote invitation", error instanceof Error ? error.stack : String(error));
      }
    });
  }

  /** Users subscribed to `preferenceKey` who don't currently hold an active check-in in `roomId`. */
  private async eligibleSubscribers(roomId: string, preferenceKey: "seatFreed" | "adminPresent"): Promise<string[]> {
    const column = preferenceKey === "seatFreed" ? schema.notificationPreferences.seatFreed : schema.notificationPreferences.adminPresent;
    const rows = await this.db
      .select({ userId: schema.notificationPreferences.userId })
      .from(schema.notificationPreferences)
      .where(
        and(
          eq(column, true),
          notExists(
            this.db
              .select({ one: sql`1` })
              .from(schema.checkIns)
              .where(
                and(
                  eq(schema.checkIns.userId, schema.notificationPreferences.userId),
                  eq(schema.checkIns.roomId, roomId),
                  eq(schema.checkIns.status, "ACTIVE"),
                ),
              ),
          ),
        ),
      );
    return rows.map((r) => r.userId);
  }

  private async sendSeatFreedPush(roomId: string, freedSeatIds: string[], recipients: string[], knownSummary?: { free: number }): Promise<void> {
    const toNotify = await this.claimThrottle(await this.withPushSubscription(recipients), "SEAT_FREED", SEAT_FREED_THROTTLE_MIN);
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

  /** `userIds` that have at least one push subscription — claiming a throttle for anyone else is a wasted write. */
  private async withPushSubscription(userIds: string[]): Promise<string[]> {
    if (userIds.length === 0) return [];
    const withSub = new Set<string>();
    for (const part of chunk(userIds, 90)) {
      const rows = await this.db
        .selectDistinct({ userId: schema.pushSubscriptions.userId })
        .from(schema.pushSubscriptions)
        .where(inArray(schema.pushSubscriptions.userId, part));
      for (const r of rows) withSub.add(r.userId);
    }
    return userIds.filter((id) => withSub.has(id));
  }

  /**
   * Atomically claims the right to notify each of `userIds` of `type`: a single upsert that only
   * "wins" (and is returned) for a user with no throttle row yet, or whose existing row is older
   * than `minutes` ago — done as one `INSERT ... ON CONFLICT ... WHERE ... RETURNING` so two
   * concurrent calls (e.g. two seats freeing in the same instant) can't both read "not throttled"
   * and both send. Callers must only send to the ids this returns.
   */
  private async claimThrottle(userIds: string[], type: string, minutes: number): Promise<string[]> {
    return claimNotificationThrottle(this.db, userIds, type, minutes, new Date());
  }
}
