import { and, count, countDistinct, desc, eq, gt, inArray, isNull, lte, sql } from "drizzle-orm";
import { schema, type Db, type Tx } from "@sala/database";
import { ADMIN_APPLICATION_MIN_DAYS, ADMIN_APPLICATION_MIN_PLACES, COLLABORATION_DAILY_SEED_CAP, COLLABORATION_PLACES_PER_SEED, COLLABORATION_REWARD_PLACES, COLLABORATION_REWARD_SEEDS, COLLABORATION_REWARD_PRO_DAYS, COLLABORATION_REWARD_COOLDOWN_DAYS, type AdminApplicationDto, type CollaborationProgressDto, type CollaborationRewardDto } from "@sala/contracts";
import { ApiErrors } from "../common/api-error.js";
import { DEFAULT_TIMEZONE, localDateOf } from "../common/dates.js";
import type { Clock } from "../platform/clock.js";
import type { RolesService } from "../users/roles.service.js";
import type { RestrictionService } from "../users/restriction.service.js";

export class CollaborationService {
  constructor(private readonly db: Db, private readonly clock: Clock) {}

  /** Called only after a presence-checked individual report, in its existing write transaction. */
  record(tx: Tx, userId: string, roomId: string, seatId: string, timezone: string, now: Date): void {
    const localDate = localDateOf(now, timezone);
    const today = tx.select({ total: count() }).from(schema.collaborationUpdates)
      .where(and(eq(schema.collaborationUpdates.userId, userId), eq(schema.collaborationUpdates.localDate, localDate))).get()!.total;
    if (today >= COLLABORATION_DAILY_SEED_CAP * COLLABORATION_PLACES_PER_SEED) return;
    const inserted = tx.insert(schema.collaborationUpdates).values({ userId, roomId, seatId, localDate, createdAt: now }).onConflictDoNothing().returning({ seatId: schema.collaborationUpdates.seatId }).get();
    if (!inserted || today + 1 < COLLABORATION_REWARD_PLACES) return;
    const verified = tx.select({ verified: schema.user.emailVerified }).from(schema.user).where(eq(schema.user.id, userId)).get()?.verified;
    if (!verified) return;
    const last = this.latestReward(userId, tx);
    if (last && now.getTime() - last.earnedAt.getTime() < COLLABORATION_REWARD_COOLDOWN_DAYS * 86400_000) return;
    const awarded = tx.insert(schema.collaborationRewards).values({
      id: crypto.randomUUID(), userId, localDate, places: today + 1, seeds: COLLABORATION_REWARD_SEEDS, earnedAt: now,
      proExpiresAt: new Date(Math.max(now.getTime(), last?.proExpiresAt.getTime() ?? 0) + COLLABORATION_REWARD_PRO_DAYS * 86400_000),
    }).onConflictDoNothing().returning({ id: schema.collaborationRewards.id }).get();
    if (!awarded) return;
    // Receipt, seed balance and promotional access commit with the distinct-seat credit.
    tx.insert(schema.userGardens).values({ userId, bonusSeeds: COLLABORATION_REWARD_SEEDS, updatedAt: now })
      .onConflictDoUpdate({ target: schema.userGardens.userId, set: { bonusSeeds: sql`${schema.userGardens.bonusSeeds} + ${COLLABORATION_REWARD_SEEDS}`, updatedAt: now } }).run();
  }

  private latestReward(userId: string, db: Db | Tx = this.db) {
    return db.select().from(schema.collaborationRewards).where(eq(schema.collaborationRewards.userId, userId)).orderBy(desc(schema.collaborationRewards.earnedAt)).limit(1).get();
  }

  pendingRewards(userId: string): CollaborationRewardDto[] {
    const now = this.clock.now();
    return this.db.select().from(schema.collaborationRewards).where(and(eq(schema.collaborationRewards.userId, userId), isNull(schema.collaborationRewards.seenAt), lte(schema.collaborationRewards.earnedAt, now), gt(schema.collaborationRewards.proExpiresAt, now)))
      .orderBy(desc(schema.collaborationRewards.earnedAt)).limit(3).all().map(row => ({ id: row.id, places: row.places, seeds: row.seeds, earnedAt: row.earnedAt.toISOString(), proExpiresAt: row.proExpiresAt.toISOString() }));
  }

  markRewardSeen(userId: string, rewardId: string): void {
    const reward = this.db.select({ seenAt: schema.collaborationRewards.seenAt }).from(schema.collaborationRewards).where(and(eq(schema.collaborationRewards.userId, userId), eq(schema.collaborationRewards.id, rewardId))).get();
    if (!reward) throw ApiErrors.notFound();
    if (!reward.seenAt) this.db.update(schema.collaborationRewards).set({ seenAt: this.clock.now() }).where(and(eq(schema.collaborationRewards.userId, userId), eq(schema.collaborationRewards.id, rewardId))).run();
  }

  progress(userId: string): CollaborationProgressDto {
    const today = localDateOf(this.clock.now(), DEFAULT_TIMEZONE);
    const days = this.db.select({ date: schema.collaborationUpdates.localDate, places: count() })
      .from(schema.collaborationUpdates).where(eq(schema.collaborationUpdates.userId, userId)).groupBy(schema.collaborationUpdates.localDate).all();
    const places = days.reduce((sum, day) => sum + day.places, 0);
    const seedCount = (n: number) => Math.min(COLLABORATION_DAILY_SEED_CAP, Math.floor(n / COLLABORATION_PLACES_PER_SEED));
    const todayPlaces = days.find(day => day.date === today)?.places ?? 0;
    const application = this.db.select().from(schema.adminApplications).where(eq(schema.adminApplications.userId, userId)).get();
    const staff = this.db.select().from(schema.userRoles).where(eq(schema.userRoles.userId, userId)).get();
    const reputation = this.db.select().from(schema.userReputation).where(eq(schema.userReputation.userId, userId)).get();
    const last = this.latestReward(userId);
    const nextEligibleAt = last ? new Date(last.earnedAt.getTime() + COLLABORATION_REWARD_COOLDOWN_DAYS * 86400_000) : null;
    return {
      places, days: days.length, seeds: days.reduce((sum, day) => sum + seedCount(day.places), 0), todayPlaces,
      todaySeeds: seedCount(todayPlaces), nextSeedPlaces: seedCount(todayPlaces) >= COLLABORATION_DAILY_SEED_CAP ? 0 : COLLABORATION_PLACES_PER_SEED - todayPlaces % COLLABORATION_PLACES_PER_SEED,
      eligibleForAdmin: !staff && places >= ADMIN_APPLICATION_MIN_PLACES && days.length >= ADMIN_APPLICATION_MIN_DAYS && (reputation?.spamScore ?? 0) < 5,
      applicationStatus: application?.status ?? null,
      weeklyReward: { targetPlaces: COLLABORATION_REWARD_PLACES, seeds: COLLABORATION_REWARD_SEEDS, proDays: COLLABORATION_REWARD_PRO_DAYS,
        nextEligibleAt: nextEligibleAt && nextEligibleAt > this.clock.now() ? nextEligibleAt.toISOString() : null,
        emailVerified: this.db.select({ verified: schema.user.emailVerified }).from(schema.user).where(eq(schema.user.id, userId)).get()?.verified === true },
    };
  }

  request(userId: string): void {
    this.db.transaction(tx => {
      const progress = this.progress(userId);
      if (!progress.eligibleForAdmin) throw ApiErrors.validation("Necesitás 100 lugares actualizados en al menos 3 días para solicitar el rol.");
      const current = tx.select().from(schema.adminApplications).where(eq(schema.adminApplications.userId, userId)).get();
      if (current?.status === "PENDING") return;
      const now = this.clock.now();
      if (current?.reviewedAt && now.getTime() - current.reviewedAt.getTime() < 7 * 86400_000) throw ApiErrors.validation("Podés volver a solicitarlo 7 días después de la revisión.");
      tx.insert(schema.adminApplications).values({ userId, status: "PENDING", requestedAt: now })
        .onConflictDoUpdate({ target: schema.adminApplications.userId, set: { status: "PENDING", requestedAt: now, reviewedAt: null, reviewedBy: null } }).run();
    });
  }

  applications(): AdminApplicationDto[] {
    const rows = this.db.select({ userId: schema.adminApplications.userId, displayName: schema.user.name, requestedAt: schema.adminApplications.requestedAt })
      .from(schema.adminApplications).innerJoin(schema.user, eq(schema.user.id, schema.adminApplications.userId))
      .where(eq(schema.adminApplications.status, "PENDING")).orderBy(schema.adminApplications.requestedAt).limit(100).all();
    if (!rows.length) return [];
    const totals = new Map(this.db.select({ userId: schema.collaborationUpdates.userId, places: count(), days: countDistinct(schema.collaborationUpdates.localDate) })
      .from(schema.collaborationUpdates).where(inArray(schema.collaborationUpdates.userId, rows.map(row => row.userId))).groupBy(schema.collaborationUpdates.userId).all().map(row => [row.userId, row]));
    return rows.map(row => ({ ...row, requestedAt: row.requestedAt.toISOString(), places: totals.get(row.userId)?.places ?? 0, days: totals.get(row.userId)?.days ?? 0 }));
  }

  pendingCount(): number {
    return this.db.select({ total: count() }).from(schema.adminApplications).where(eq(schema.adminApplications.status, "PENDING")).get()!.total;
  }

  async review(actorId: string, userId: string, approve: boolean, roles: RolesService, restrictions: RestrictionService): Promise<void> {
    if (!(await roles.isSuperAdmin(actorId))) throw ApiErrors.forbidden();
    await restrictions.assertNot(actorId, ["SUSPENDED", "BANNED"]);
    if (approve) await restrictions.assertNot(userId, ["SUSPENDED", "BANNED"]);
    this.db.transaction(tx => {
      const current = tx.select().from(schema.adminApplications).where(eq(schema.adminApplications.userId, userId)).get();
      if (!current) throw ApiErrors.notFound();
      if (current.status !== "PENDING") return;
      const target = tx.select().from(schema.user).where(eq(schema.user.id, userId)).get();
      if (approve && !target?.emailVerified) throw ApiErrors.validation("La cuenta debe verificar su correo antes del ascenso.");
      if (approve) tx.insert(schema.userRoles).values({ userId, role: "ADMIN" }).onConflictDoNothing().run();
      tx.update(schema.adminApplications).set({ status: approve ? "APPROVED" : "REJECTED", reviewedAt: this.clock.now(), reviewedBy: actorId }).where(eq(schema.adminApplications.userId, userId)).run();
      tx.insert(schema.moderationActions).values({ actorId, targetUserId: userId, action: approve ? "ADMIN_GRANTED" : "ADMIN_APPLICATION_REJECTED", metadata: { source: "collaboration-application" } }).run();
    });
  }
}
