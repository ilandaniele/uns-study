import { and, eq, gt, isNull, lte } from "drizzle-orm";
import { schema, type Db } from "@sala/database";
import { seatLabel } from "@sala/contracts";
import { Logger } from "../platform/logger.js";
import type { RoomRealtimeGateway } from "../realtime/room-realtime.gateway.js";
import type { PushService } from "../notifications/push.service.js";
import { mapWithConcurrency } from "../notifications/concurrency.js";

/** A check-in is reminded once it has this long or less left. */
const REMINDER_LEAD_MS = 5 * 60_000;
/** At most this many reminders are delivered concurrently per sweep. */
const SEND_CONCURRENCY = 10;

/**
 * Reminds users ~5 minutes before their ACTIVE check-in expires (socket event + push) so they can
 * tap "Sigo acá" or release the seat. Each check-in is claimed with a conditional UPDATE on
 * `expiry_reminder_sent_at`, so overlapping sweeps/instances never double-send; `extend()` resets
 * the flag so the extended check-in gets its own reminder.
 */
export class CheckInExpiryReminderJob {
  private readonly logger = new Logger(CheckInExpiryReminderJob.name);

  constructor(
    private readonly db: Db,
    private readonly realtime: RoomRealtimeGateway,
    private readonly push: PushService,
  ) {}

  /** Scheduler entry point (`checkin-expiry-reminder`, every 60 s). */
  async tick(): Promise<void> {
    try {
      await this.runSweep(new Date());
    } catch (err) {
      this.logger.error("Check-in expiry reminder sweep failed", err instanceof Error ? err.stack : String(err));
    }
  }

  /** Exposed for tests: claims and notifies every due check-in; returns the number claimed. */
  async runSweep(now: Date = new Date()): Promise<number> {
    const horizon = new Date(now.getTime() + REMINDER_LEAD_MS);
    const due = this.db
      .select({ id: schema.checkIns.id })
      .from(schema.checkIns)
      .where(
        and(
          eq(schema.checkIns.status, "ACTIVE"),
          gt(schema.checkIns.expiresAt, now),
          lte(schema.checkIns.expiresAt, horizon),
          isNull(schema.checkIns.expiryReminderSentAt),
        ),
      )
      .all();

    // Each claim is one atomic conditional UPDATE (sync), so claiming needs no concurrency pool.
    const claimed = due
      .map(({ id }) => {
        const [row] = this.db
          .update(schema.checkIns)
          .set({ expiryReminderSentAt: now })
          .where(
            and(
              eq(schema.checkIns.id, id),
              eq(schema.checkIns.status, "ACTIVE"),
              gt(schema.checkIns.expiresAt, now),
              isNull(schema.checkIns.expiryReminderSentAt),
            ),
          )
          .returning({ id: schema.checkIns.id, userId: schema.checkIns.userId, seatId: schema.checkIns.seatId, expiresAt: schema.checkIns.expiresAt })
          .all();
        return row ?? null;
      })
      .filter((row): row is NonNullable<typeof row> => row !== null);

    await mapWithConcurrency(claimed, SEND_CONCURRENCY, async (row) => {
      try {
        this.realtime.emitCheckInExpiring(row.userId, {
          checkInId: row.id,
          seatId: row.seatId,
          expiresAt: new Date(row.expiresAt).toISOString(),
        });
        if (this.pushEnabled(row.userId)) {
          const { label, slug } = this.describe(row.seatId);
          await this.push.sendToUser(row.userId, {
            title: "Tu lugar vence en 5 min",
            body: `${label} — tocá para seguir acá o liberarlo.`,
            url: `/sala/${slug}?seat=${row.seatId}`,
            tag: "checkin-expiry",
          });
        }
      } catch (err) {
        this.logger.error(`Failed to send expiry reminder for check-in ${row.id}`, err instanceof Error ? err.stack : String(err));
      }
    });
    return claimed.length;
  }

  /** On by default: a user without a preferences row hasn't opted out. */
  private pushEnabled(userId: string): boolean {
    const [pref] = this.db
      .select({ on: schema.notificationPreferences.checkinExpiry })
      .from(schema.notificationPreferences)
      .where(eq(schema.notificationPreferences.userId, userId))
      .limit(1)
      .all();
    return pref?.on ?? true;
  }

  private describe(seatId: string): { label: string; slug: string } {
    const [row] = this.db
      .select({
        seatNumber: schema.seats.seatNumber,
        tableCode: schema.roomTables.code,
        tableType: schema.roomTables.type,
        slug: schema.rooms.slug,
      })
      .from(schema.seats)
      .innerJoin(schema.roomTables, eq(schema.roomTables.id, schema.seats.tableId))
      .innerJoin(schema.rooms, eq(schema.rooms.id, schema.seats.roomId))
      .where(eq(schema.seats.id, seatId))
      .limit(1)
      .all();
    if (!row) return { label: "Tu lugar", slug: "principal" };
    return { label: seatLabel(row.tableCode, row.tableType, row.seatNumber), slug: row.slug };
  }
}
