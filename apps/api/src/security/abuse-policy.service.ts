import { Inject, Injectable } from "@nestjs/common";
import { and, eq, gte, inArray } from "drizzle-orm";
import { schema, type Db } from "@uns/database";
import { DB } from "../database/database.module.js";
import { TurnstileService } from "./turnstile.service.js";

const CHALLENGE_WINDOW_MIN = 30;
const CHALLENGE_EVENT_TYPES = ["SEAT_TOGGLE_RAPID", "OBSERVATION_SPREAD", "RATE_LIMITED"];

const NEW_ACCOUNT_MAX_AGE_MS = 24 * 60 * 60 * 1000;

/** Stricter observation limits applied while an account is younger than 24h. */
export const OBSERVATION_LIMITS = {
  default: { perMinuteLimit: 6, distinctSeatCap: 15 },
  newAccount: { perMinuteLimit: 3, distinctSeatCap: 8 },
} as const;
export type ObservationLimits = (typeof OBSERVATION_LIMITS)[keyof typeof OBSERVATION_LIMITS];

/**
 * Decides when a presence-sensitive write should be challenged with Turnstile, and applies
 * account-age-sensitive rate limits. Pure-ish: only reads (never writes) so it stays cheap to
 * call before every check-in/observation.
 */
@Injectable()
export class AbusePolicyService {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(TurnstileService) private readonly turnstile: TurnstileService,
  ) {}

  /** True when Turnstile is enabled and the user has a recent abuse-flagging security event. */
  async requiresChallenge(userId: string): Promise<boolean> {
    if (!this.turnstile.isEnabled()) return false;
    const windowStart = new Date(Date.now() - CHALLENGE_WINDOW_MIN * 60_000);
    const [row] = await this.db
      .select({ id: schema.securityEvents.id })
      .from(schema.securityEvents)
      .where(
        and(
          eq(schema.securityEvents.userId, userId),
          inArray(schema.securityEvents.eventType, CHALLENGE_EVENT_TYPES),
          gte(schema.securityEvents.createdAt, windowStart),
        ),
      )
      .limit(1);
    return Boolean(row);
  }

  async isNewAccount(userId: string): Promise<boolean> {
    const [row] = await this.db.select({ createdAt: schema.user.createdAt }).from(schema.user).where(eq(schema.user.id, userId)).limit(1);
    if (!row) return false;
    return Date.now() - new Date(row.createdAt).getTime() < NEW_ACCOUNT_MAX_AGE_MS;
  }

  async observationLimits(userId: string): Promise<ObservationLimits> {
    return (await this.isNewAccount(userId)) ? OBSERVATION_LIMITS.newAccount : OBSERVATION_LIMITS.default;
  }
}
