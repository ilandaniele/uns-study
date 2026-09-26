import { createHash } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import { schema, type Db } from "@uns/database";
import { DB } from "../database/database.module.js";
import { env } from "../env.js";

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

@Injectable()
export class SecurityEventService {
  constructor(@Inject(DB) private readonly db: Db) {}

  async record(input: RecordSecurityEventInput): Promise<void> {
    await this.db.insert(schema.securityEvents).values({
      userId: input.userId ?? null,
      eventType: input.eventType,
      ipHash: input.ip ? hashIp(input.ip) : null,
      metadata: input.metadata ?? null,
    });
  }
}
