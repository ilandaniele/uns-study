import { Inject, Injectable, Logger } from "@nestjs/common";
import { eq, sql } from "drizzle-orm";
import webpush from "web-push";
import { schema, type Db } from "@sala/database";
import { DB } from "../database/database.module.js";
import { env } from "../env.js";
import { mapWithConcurrency } from "./concurrency.js";

/** At most this many devices are sent to at once per `sendToUser` call. */
const SEND_CONCURRENCY = 10;
/** A subscription is deleted after this many consecutive non-HTTP (encryption/argument, never a
 *  clean 404/410 — those delete immediately) failures, since it's evidently never going to work. */
const MAX_CONSECUTIVE_FAILURES = 3;

export interface PushPayload {
  title: string;
  body: string;
  /** Path the notification opens on click, e.g. `/sala/principal?seat=<id>`. */
  url: string;
  /** Replaces any earlier notification of the same tag instead of stacking (per `sw.js`). */
  tag: string;
}

/**
 * Thin wrapper around `web-push` for sending to every device a user has subscribed. Never logs a
 * subscription's `endpoint`/`p256dh`/`auth`. A subscription the push service reports gone (404/410
 * — uninstalled app, revoked permission, expired endpoint) is deleted so it's never retried.
 */
@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);
  private configured = false;

  constructor(@Inject(DB) private readonly db: Db) {}

  private ensureConfigured(): boolean {
    if (this.configured) return true;
    if (!env.vapidPublicKey || !env.vapidPrivateKey) return false;
    webpush.setVapidDetails(env.vapidSubject, env.vapidPublicKey, env.vapidPrivateKey);
    this.configured = true;
    return true;
  }

  /** Sends `payload` to every subscription on record for `userId`, best-effort per device. */
  async sendToUser(userId: string, payload: PushPayload): Promise<void> {
    if (!this.ensureConfigured()) return;
    const subs = await this.db.select().from(schema.pushSubscriptions).where(eq(schema.pushSubscriptions.userId, userId));
    await mapWithConcurrency(subs, SEND_CONCURRENCY, (sub) => this.sendOne(sub, payload));
  }

  private async sendOne(sub: typeof schema.pushSubscriptions.$inferSelect, payload: PushPayload): Promise<void> {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        JSON.stringify(payload),
        { timeout: 5000, TTL: 600 },
      );
      await this.db
        .update(schema.pushSubscriptions)
        .set({ lastSuccessAt: new Date(), failureCount: 0 })
        .where(eq(schema.pushSubscriptions.id, sub.id));
    } catch (err) {
      const statusCode = (err as { statusCode?: number }).statusCode;
      if (statusCode === 404 || statusCode === 410) {
        await this.db.delete(schema.pushSubscriptions).where(eq(schema.pushSubscriptions.id, sub.id));
        return;
      }
      this.logger.error(`Push delivery failed for subscription ${sub.id} (status ${statusCode ?? "unknown"})`);

      // Non-HTTP failures (bad encryption keys, invalid argument, ...) never delete on their own —
      // only after `MAX_CONSECUTIVE_FAILURES` in a row, so a single transient error doesn't drop a
      // device that would otherwise keep working.
      const [row] = await this.db
        .update(schema.pushSubscriptions)
        .set({ failureCount: sql`${schema.pushSubscriptions.failureCount} + 1` })
        .where(eq(schema.pushSubscriptions.id, sub.id))
        .returning({ failureCount: schema.pushSubscriptions.failureCount });
      if (row && row.failureCount >= MAX_CONSECUTIVE_FAILURES) {
        await this.db.delete(schema.pushSubscriptions).where(eq(schema.pushSubscriptions.id, sub.id));
      }
    }
  }
}
