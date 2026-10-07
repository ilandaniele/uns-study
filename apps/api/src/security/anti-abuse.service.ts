import { Inject, Injectable } from "@nestjs/common";
import { ApiErrors } from "../common/api-error.js";
import { RateLimitService } from "./rate-limit.service.js";
import { SecurityEventService } from "./security-event.service.js";
import { AbusePolicyService } from "./abuse-policy.service.js";
import { TurnstileService } from "./turnstile.service.js";

export interface RateLimitRule {
  key: string;
  limit: number;
  windowSeconds: number;
  /** When set, a rejection is also recorded as this security event (feeds Turnstile escalation). */
  event?: { userId: string; eventType: string; ip?: string | null; metadata?: Record<string, unknown> };
}

/**
 * The anti-abuse decisions the write endpoints share: rate-limit enforcement (with the security
 * event recorded on rejection) and the Turnstile challenge gate. Controllers only call these.
 */
@Injectable()
export class AntiAbuseService {
  constructor(
    @Inject(RateLimitService) private readonly rateLimit: RateLimitService,
    @Inject(SecurityEventService) private readonly securityEvents: SecurityEventService,
    @Inject(AbusePolicyService) private readonly abusePolicy: AbusePolicyService,
    @Inject(TurnstileService) private readonly turnstile: TurnstileService,
  ) {}

  /** Throws RATE_LIMITED when the bucket is exhausted, recording `rule.event` first if given. */
  async enforceRateLimit(rule: RateLimitRule): Promise<void> {
    const result = await this.rateLimit.check(rule.key, rule.limit, rule.windowSeconds);
    if (result.allowed) return;
    if (rule.event) await this.securityEvents.record(rule.event);
    throw ApiErrors.rateLimited();
  }

  /** If the user was recently flagged, requires a valid Turnstile token (TURNSTILE_REQUIRED otherwise). */
  async assertChallengePassed(userId: string, token: string | undefined | null, ip: string): Promise<void> {
    if (!(await this.abusePolicy.requiresChallenge(userId))) return;
    if (await this.turnstile.verify(token ?? undefined, ip)) return;
    if (token) await this.securityEvents.record({ userId, eventType: "TURNSTILE_FAILED", ip });
    throw ApiErrors.turnstileRequired();
  }
}
