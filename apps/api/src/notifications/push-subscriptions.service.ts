import { and, desc, eq, inArray, or, sql } from "drizzle-orm";
import { inChunks, schema, type Db } from "@sala/database";
import type { z } from "zod";
import type { pushSubscriptionSchema } from "@sala/contracts";
import { ApiErrors } from "../common/api-error.js";
import { isAllowedPushEndpoint } from "./push-endpoint-allowlist.js";

export type PushSubscriptionInput = z.infer<typeof pushSubscriptionSchema>;

/** A user can't usefully have more devices subscribed than this — beyond it, the oldest
 *  subscriptions are dropped so a single account can't accumulate an unbounded fan-out list. */
const MAX_SUBSCRIPTIONS_PER_USER = 10;

export class PushSubscriptionsService {
  constructor(private readonly db: Db) {}

  /** Upserts by `endpoint`. The same user can refresh the row (e.g. after a key rotation). A different
   *  user takes it over only when sending the same `p256dh`/`auth` keys, which proves they hold that
   *  browser's subscription (a sign-out/sign-in on the same device). Knowing someone's endpoint URL
   *  alone does nothing: the conflicting row is left untouched. */
  async subscribe(userId: string, input: PushSubscriptionInput, userAgent: string | null): Promise<void> {
    if (!isAllowedPushEndpoint(input.endpoint)) throw ApiErrors.validation("Ese servicio de notificaciones no está permitido.");

    this.db.transaction((tx) => {
      tx.insert(schema.pushSubscriptions)
        .values({ userId, endpoint: input.endpoint, p256dh: input.keys.p256dh, auth: input.keys.auth, userAgent })
        .onConflictDoUpdate({
          target: schema.pushSubscriptions.endpoint,
          set: { userId, p256dh: input.keys.p256dh, auth: input.keys.auth, userAgent, failureCount: 0 },
          setWhere: or(
            eq(schema.pushSubscriptions.userId, userId),
            and(eq(schema.pushSubscriptions.p256dh, input.keys.p256dh), eq(schema.pushSubscriptions.auth, input.keys.auth)),
          ),
        })
        .run();

      // Drops the oldest subscriptions for `userId` beyond `MAX_SUBSCRIPTIONS_PER_USER`.
      const subs = tx
        .select({ id: schema.pushSubscriptions.id })
        .from(schema.pushSubscriptions)
        .where(eq(schema.pushSubscriptions.userId, userId))
        .orderBy(desc(schema.pushSubscriptions.createdAt), desc(sql`rowid`))
        .all();
      if (subs.length <= MAX_SUBSCRIPTIONS_PER_USER) return;

      const staleIds = subs.slice(MAX_SUBSCRIPTIONS_PER_USER).map((s) => s.id);
      inChunks(staleIds, (part) => {
        tx.delete(schema.pushSubscriptions).where(inArray(schema.pushSubscriptions.id, part)).run();
        return [];
      });
    });
  }

  async unsubscribe(userId: string, endpoint: string): Promise<void> {
    await this.db
      .delete(schema.pushSubscriptions)
      .where(and(eq(schema.pushSubscriptions.userId, userId), eq(schema.pushSubscriptions.endpoint, endpoint)));
  }
}
