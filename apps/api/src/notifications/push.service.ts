import { buildPushHTTPRequest } from "@pushforge/builder";
import { eq, sql } from "drizzle-orm";
import { schema, type Db } from "@sala/database";
import { env } from "../env.js";
import { Logger } from "../platform/logger.js";
import { mapWithConcurrency } from "./concurrency.js";

/** At most this many devices are sent to at once per `sendToUser` call. */
const SEND_CONCURRENCY = 10;
/** A subscription is deleted after this many consecutive non-HTTP (encryption/argument, never a
 *  clean 404/410 — those delete immediately) failures, since it's evidently never going to work. */
const MAX_CONSECUTIVE_FAILURES = 3;
/** Abort a push-service request that takes longer than this. */
const SEND_TIMEOUT_MS = 5000;
/** Push messages are time-sensitive: the push service drops them after this many seconds. */
const PUSH_TTL_S = 600;

type PrivateJwk = { kty: "EC"; crv: "P-256"; x: string; y: string; d: string };

/** Builds the VAPID signing JWK from the env key pair: the public key is the uncompressed P-256
 *  point (0x04 || x || y), the private key the raw 32-byte `d`, both base64url. */
function vapidJwk(publicKey: string, privateKey: string): PrivateJwk | null {
  const point = Buffer.from(publicKey, "base64url");
  if (point.length !== 65 || point[0] !== 0x04) return null;
  return { kty: "EC", crv: "P-256", x: point.subarray(1, 33).toString("base64url"), y: point.subarray(33, 65).toString("base64url"), d: privateKey };
}

/** Error carrying the push service's HTTP status so the 404/410 pruning keeps working. */
class PushHttpError extends Error {
  constructor(readonly statusCode: number) {
    super(`Push service responded ${statusCode}`);
  }
}

type PushOutcome = "delivered" | "gone" | "failed";

export type PushPayload = {
  title: string;
  body: string;
  /** Path the notification opens on click, e.g. `/sala/principal?seat=<id>`. */
  url: string;
  /** Replaces any earlier notification of the same tag instead of stacking (per `sw.js`). */
  tag: string;
};

/** Per-device result counts of one `sendToUser` call. */
export interface PushSendSummary {
  devices: number;
  accepted: number;
  gone: number;
  failed: number;
}

/**
 * Thin wrapper around `@pushforge/builder` (VAPID JWT + aes128gcm payload, sent with `fetch`) for sending to every device a user has subscribed. Never logs a
 * subscription's `endpoint`/`p256dh`/`auth`. A subscription the push service reports gone (404/410
 * — uninstalled app, revoked permission, expired endpoint) is deleted so it's never retried.
 */
export class PushService {
  private readonly logger = new Logger(PushService.name);
  private jwk: PrivateJwk | null | undefined;

  constructor(private readonly db: Db) {}

  /** VAPID keys come only from env; push is a no-op (`null`) when they are missing or malformed. */
  private ensureConfigured(): PrivateJwk | null {
    if (this.jwk !== undefined) return this.jwk;
    if (!env.vapidPublicKey || !env.vapidPrivateKey) return null;
    this.jwk = vapidJwk(env.vapidPublicKey, env.vapidPrivateKey);
    if (!this.jwk) this.logger.error("VAPID_PUBLIC_KEY is not a valid uncompressed P-256 key; push disabled");
    return this.jwk;
  }

  /** Sends `payload` to every subscription on record for `userId`, best-effort per device. */
  async sendToUser(userId: string, payload: PushPayload): Promise<PushSendSummary | null> {
    const jwk = this.ensureConfigured();
    if (!jwk) return null;
    const subs = await this.db.select().from(schema.pushSubscriptions).where(eq(schema.pushSubscriptions.userId, userId));
    const outcomes = await mapWithConcurrency(subs, SEND_CONCURRENCY, (sub) => this.sendOne(jwk, sub, payload));
    // One line per send so a "the notification never arrived" report can be checked against what
    // the push service accepted. Counts only: never the endpoint or keys.
    const count = (o: PushOutcome) => outcomes.filter((x) => x === o).length;
    const summary = { devices: subs.length, accepted: count("delivered"), gone: count("gone"), failed: count("failed") };
    this.logger.log(
      `Push "${payload.tag}" to user ${userId}: ${summary.devices} device(s), ${summary.accepted} accepted, ${summary.gone} gone, ${summary.failed} failed`,
    );
    return summary;
  }

  private async sendOne(jwk: PrivateJwk, sub: typeof schema.pushSubscriptions.$inferSelect, payload: PushPayload): Promise<PushOutcome> {
    try {
      // `high` urgency: Android delivers normal-priority FCM messages only in Doze maintenance
      // windows, often after the 10-minute TTL has expired. Every push we send is time-sensitive.
      const request = await buildPushHTTPRequest({
        privateJWK: jwk,
        subscription: { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        message: { payload, adminContact: env.vapidSubject, options: { ttl: PUSH_TTL_S, urgency: "high" } },
      });
      const res = await fetch(request.endpoint, {
        method: "POST",
        headers: request.headers,
        body: request.body,
        signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
      });
      if (!res.ok) throw new PushHttpError(res.status);
      // Only touch the row to clear a failure streak; a healthy subscription needs no write.
      if (sub.failureCount > 0) {
        await this.db.update(schema.pushSubscriptions).set({ failureCount: 0 }).where(eq(schema.pushSubscriptions.id, sub.id));
      }
      return "delivered";
    } catch (err) {
      const statusCode = (err as { statusCode?: number }).statusCode;
      if (statusCode === 404 || statusCode === 410) {
        await this.db.delete(schema.pushSubscriptions).where(eq(schema.pushSubscriptions.id, sub.id));
        return "gone";
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
      return "failed";
    }
  }
}
