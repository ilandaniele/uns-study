import { Inject, Injectable } from "@nestjs/common";
import { eq, sql } from "drizzle-orm";
import { schema, type Db } from "@uns/database";
import { DB } from "../database/database.module.js";

/** At or above this `spam_score`, an observation authored by the user counts for half its weight. */
export const SPAM_SCORE_WEIGHT_THRESHOLD = 5;
export const SPAM_PENALTY_WEIGHT = 0.5;

/** Tracks per-user reputation (`user_reputation`) and derives observation confidence weight from it. */
@Injectable()
export class ReputationService {
  constructor(@Inject(DB) private readonly db: Db) {}

  /** Bumps `spam_score` by `by` (default 1), creating the row on first offense. */
  async incrementSpamScore(userId: string, by = 1): Promise<void> {
    await this.db
      .insert(schema.userReputation)
      .values({ userId, spamScore: by })
      .onConflictDoUpdate({
        target: schema.userReputation.userId,
        set: { spamScore: sql`${schema.userReputation.spamScore} + ${by}`, updatedAt: new Date() },
      });
  }

  /** Reputation-only observation confidence weight (before any QR factor): 0.5 once `spam_score` >= 5, else 1. */
  async observationWeight(userId: string): Promise<number> {
    const [row] = await this.db
      .select({ spamScore: schema.userReputation.spamScore })
      .from(schema.userReputation)
      .where(eq(schema.userReputation.userId, userId))
      .limit(1);
    const spamScore = row?.spamScore ?? 0;
    return spamScore >= SPAM_SCORE_WEIGHT_THRESHOLD ? SPAM_PENALTY_WEIGHT : 1;
  }
}
