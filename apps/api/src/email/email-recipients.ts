import { and, count, eq, exists, notExists, sql } from "drizzle-orm";
import { schema, type Db } from "@sala/database";
import type { EmailAudience } from "@sala/contracts";

/** Anything with `select` — a `Db` or a transaction handle. */
type Reader = Pick<Db, "select">;

/**
 * Users a campaign may reach: verified email, not opted out (a missing preferences row means opted
 * in), and no active SUSPENDED/BANNED restriction.
 */
export function recipientsQuery(db: Reader, now: Date, audience: EmailAudience = "all") {
  return db
    .select({ userId: schema.user.id, email: schema.user.email })
    .from(schema.user)
    .where(recipientConditions(db, now, audience));
}

export async function countRecipients(db: Reader, now: Date, audience: EmailAudience = "all"): Promise<number> {
  const [row] = await db.select({ n: count() }).from(schema.user).where(recipientConditions(db, now, audience));
  return Number(row?.n ?? 0);
}

function recipientConditions(db: Reader, now: Date, audience: EmailAudience) {
  return and(
    eq(schema.user.emailVerified, true),
    notExists(
      db
        .select({ one: sql`1` })
        .from(schema.notificationPreferences)
        .where(and(eq(schema.notificationPreferences.userId, schema.user.id), eq(schema.notificationPreferences.marketingEmails, false))),
    ),
    notExists(blockingRestrictions(db, now)),
    audienceCondition(db, audience),
  );
}

/** `subscribers` = an authorized subscription row exists; `free` = the opposite. */
function audienceCondition(db: Reader, audience: EmailAudience) {
  if (audience === "all") return undefined;
  const subscribed = activeSubscription(db);
  return audience === "subscribers" ? exists(subscribed) : notExists(subscribed);
}

/** Authorized subscription of the outer `user` row; shared with the send-time check. */
export function activeSubscription(db: Reader) {
  return db
    .select({ one: sql`1` })
    .from(schema.userSubscriptions)
    .where(and(eq(schema.userSubscriptions.userId, schema.user.id), eq(schema.userSubscriptions.status, "authorized")));
}

/** Active SUSPENDED/BANNED restrictions of the outer `user` row; shared with the send-time check. */
export function blockingRestrictions(db: Reader, now: Date) {
  return db
    .select({ one: sql`1` })
    .from(schema.userRestrictions)
    .where(
      and(
        eq(schema.userRestrictions.userId, schema.user.id),
        sql`${schema.userRestrictions.type} in ('SUSPENDED', 'BANNED')`,
        sql`${schema.userRestrictions.liftedAt} is null`,
        sql`(${schema.userRestrictions.until} is null or ${schema.userRestrictions.until} > ${now.toISOString()}::timestamptz)`,
      ),
    );
}
