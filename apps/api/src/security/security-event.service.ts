import { createHash } from "node:crypto";
import { schema, type Db } from "@sala/database";
import { env } from "../env.js";
import { ReputationService } from "../reputation/reputation.service.js";

export interface RecordSecurityEventInput {
  userId?: string | null;
  eventType: string;
  ip?: string | null;
  metadata?: Record<string, unknown>;
}

/** Hashes the client IP with a server-side salt; raw IPs are never persisted. */
export function hashIp(ip: string): string {
  return createHash("sha256").update(`${ip}${env.ipHashSalt}`).digest("hex");
}

export class SecurityEventService {
  constructor(
    private readonly db: Db,
    private readonly reputation: ReputationService,
  ) {}

  async record(input: RecordSecurityEventInput): Promise<void> {
    await this.db.insert(schema.securityEvents).values({
      userId: input.userId ?? null,
      eventType: input.eventType,
      ipHash: input.ip ? hashIp(input.ip) : null,
      metadata: input.metadata ?? null,
    });
    // Every security event nudges the author's spam_score, which in turn lowers the confidence
    // weight of their future observations (see ReputationService.observationWeight).
    if (input.userId) {
      await this.reputation.incrementSpamScore(input.userId, 1);
    }
  }
}
