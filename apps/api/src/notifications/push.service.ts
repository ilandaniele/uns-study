import { Inject, Injectable, Logger } from "@nestjs/common";
import { eq } from "drizzle-orm";
import webpush from "web-push";
import { schema, type Db } from "@uns/database";
import { DB } from "../database/database.module.js";
import { env } from "../env.js";

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
    await Promise.all(subs.map((sub) => this.sendOne(sub, payload)));
  }

  private async sendOne(sub: typeof schema.pushSubscriptions.$inferSelect, payload: PushPayload): Promise<void> {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        JSON.stringify(payload),
      );
      await this.db.update(schema.pushSubscriptions).set({ lastSuccessAt: new Date() }).where(eq(schema.pushSubscriptions.id, sub.id));
    } catch (err) {
      const statusCode = (err as { statusCode?: number }).statusCode;
      if (statusCode === 404 || statusCode === 410) {
        await this.db.delete(schema.pushSubscriptions).where(eq(schema.pushSubscriptions.id, sub.id));
        return;
      }
      this.logger.error(`Push delivery failed for subscription ${sub.id} (status ${statusCode ?? "unknown"})`);
    }
  }
}
