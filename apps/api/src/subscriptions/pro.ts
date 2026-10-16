import { eq, inArray } from "drizzle-orm";
import { inChunks, schema, type Db } from "@sala/database";
import type { Clock } from "../platform/clock.js";
import type { RolesService } from "../users/roles.service.js";

export interface EntitlementInput {
  /** `user_subscriptions.status`, or null without a subscription. */
  subscriptionStatus: string | null;
  currentPeriodEnd: Date | null;
  /** RolesService roles; non-empty = staff. */
  roles: readonly string[];
  now: Date;
}

/** Paid only: authorized, or cancelled/paused while the paid period has not ended. */
export function hasPaidEntitlement(i: Omit<EntitlementInput, "roles">): boolean {
  if (i.subscriptionStatus === "authorized") return true;
  const lapsing = i.subscriptionStatus === "cancelled" || i.subscriptionStatus === "paused";
  return lapsing && i.currentPeriodEnd !== null && i.currentPeriodEnd.getTime() > i.now.getTime();
}

/** Paid entitlement, or staff. Drives `MeDto.adFree`. */
export function hasProEntitlement(i: EntitlementInput): boolean {
  return i.roles.length > 0 || hasPaidEntitlement(i);
}

/** Pro features unlocked: everyone while subscriptions are disabled, else `hasProEntitlement`. Drives `MeDto.pro` and `requirePro`. */
export function isPro(i: EntitlementInput & { subscriptionsEnabled: boolean }): boolean {
  return !i.subscriptionsEnabled || hasProEntitlement(i);
}

/** Pro lookups by user id; the same rules as the pure functions above, using the injected clock. */
export class ProService {
  constructor(
    private readonly db: Db,
    private readonly roles: RolesService,
    private readonly opts: { subscriptionsEnabled: boolean; clock: Clock },
  ) {}

  /** isPro for one user (1 subscription read + roles lookup). */
  async isProUser(userId: string): Promise<boolean> {
    if (!this.opts.subscriptionsEnabled) return true;
    const [[subscription], roles] = await Promise.all([
      this.db
        .select({ status: schema.userSubscriptions.status, currentPeriodEnd: schema.userSubscriptions.currentPeriodEnd })
        .from(schema.userSubscriptions)
        .where(eq(schema.userSubscriptions.userId, userId))
        .limit(1),
      this.roles.rolesFor(userId),
    ]);
    return isPro({
      subscriptionStatus: subscription?.status ?? null,
      currentPeriodEnd: subscription?.currentPeriodEnd ?? null,
      roles,
      now: this.opts.clock.now(),
      subscriptionsEnabled: this.opts.subscriptionsEnabled,
    });
  }

  /** Subset of userIds for which isPro holds (batched; all of them when subscriptions are disabled). */
  async filterPro(userIds: readonly string[]): Promise<Set<string>> {
    const unique = [...new Set(userIds)];
    if (!this.opts.subscriptionsEnabled) return new Set(unique);
    if (unique.length === 0) return new Set();
    const paid = await this.badgeIds(unique);
    const rest = unique.filter((id) => !paid.has(id));
    const staff =
      rest.length === 0
        ? []
        : inChunks(rest, (part) =>
            this.db.select({ userId: schema.userRoles.userId }).from(schema.userRoles).where(inArray(schema.userRoles.userId, part)).all(),
          );
    return new Set([...paid, ...staff.map((r) => r.userId)]);
  }

  /** Subset with hasPaidEntitlement (batched, chunked IN query). Used for the proBadge DTO flag. */
  async badgeIds(userIds: readonly string[]): Promise<Set<string>> {
    const unique = [...new Set(userIds)];
    if (unique.length === 0) return new Set();
    const now = this.opts.clock.now();
    const rows = inChunks(unique, (part) =>
      this.db
        .select({
          userId: schema.userSubscriptions.userId,
          status: schema.userSubscriptions.status,
          currentPeriodEnd: schema.userSubscriptions.currentPeriodEnd,
        })
        .from(schema.userSubscriptions)
        .where(inArray(schema.userSubscriptions.userId, part))
        .all(),
    );
    return new Set(
      rows.filter((r) => hasPaidEntitlement({ subscriptionStatus: r.status, currentPeriodEnd: r.currentPeriodEnd, now })).map((r) => r.userId),
    );
  }
}
