import { Inject, Injectable } from "@nestjs/common";
import { and, desc, eq, inArray } from "drizzle-orm";
import { schema, type Db } from "@uns/database";
import type { z } from "zod";
import type { pushSubscriptionSchema } from "@uns/contracts";
import { DB } from "../database/database.module.js";
import { ApiErrors } from "../common/api-error.js";
import { isAllowedPushEndpoint } from "./push-endpoint-allowlist.js";

export type PushSubscriptionInput = z.infer<typeof pushSubscriptionSchema>;

/** A user can't usefully have more devices subscribed than this — beyond it, the oldest
 *  subscriptions are dropped so a single account can't accumulate an unbounded fan-out list. */
const MAX_SUBSCRIPTIONS_PER_USER = 10;

@Injectable()
export class PushSubscriptionsService {
  constructor(@Inject(DB) private readonly db: Db) {}

  /** Upserts by `endpoint` — re-subscribing the same device/browser (possibly as a different
   *  user, e.g. after a sign-out/sign-in) reassigns it rather than creating a duplicate row. */
  async subscribe(userId: string, input: PushSubscriptionInput, userAgent: string | null): Promise<void> {
    if (!isAllowedPushEndpoint(input.endpoint)) throw ApiErrors.validation("Ese servicio de notificaciones no está permitido.");

    await this.db
      .insert(schema.pushSubscriptions)
      .values({ userId, endpoint: input.endpoint, p256dh: input.keys.p256dh, auth: input.keys.auth, userAgent })
      .onConflictDoUpdate({
        target: schema.pushSubscriptions.endpoint,
        set: { userId, p256dh: input.keys.p256dh, auth: input.keys.auth, userAgent, failureCount: 0 },
      });

    await this.enforceSubscriptionCap(userId);
  }

  /** Deletes the oldest subscriptions for `userId` beyond `MAX_SUBSCRIPTIONS_PER_USER`. */
  private async enforceSubscriptionCap(userId: string): Promise<void> {
    const subs = await this.db
      .select({ id: schema.pushSubscriptions.id })
      .from(schema.pushSubscriptions)
      .where(eq(schema.pushSubscriptions.userId, userId))
      .orderBy(desc(schema.pushSubscriptions.createdAt));
    if (subs.length <= MAX_SUBSCRIPTIONS_PER_USER) return;

    const staleIds = subs.slice(MAX_SUBSCRIPTIONS_PER_USER).map((s) => s.id);
    await this.db.delete(schema.pushSubscriptions).where(inArray(schema.pushSubscriptions.id, staleIds));
  }

  async unsubscribe(userId: string, endpoint: string): Promise<void> {
    await this.db
      .delete(schema.pushSubscriptions)
      .where(and(eq(schema.pushSubscriptions.userId, userId), eq(schema.pushSubscriptions.endpoint, endpoint)));
  }
}
