import { and, eq, gt, isNull, or } from "drizzle-orm";
import { schema, type Db } from "@sala/database";
import { ApiErrors } from "../common/api-error.js";

export type RestrictionType = "MUTE_CHAT" | "RESTRICT_OBSERVATIONS" | "SUSPENDED" | "BANNED";

export interface ActiveRestriction {
  id: string;
  type: RestrictionType;
  until: Date | null;
}

/** A restriction is active when it hasn't been lifted and (has no expiry, or hasn't expired yet). */
export class RestrictionService {
  constructor(private readonly db: Db) {}

  async activeRestrictions(userId: string): Promise<ActiveRestriction[]> {
    const now = new Date();
    const rows = await this.db
      .select()
      .from(schema.userRestrictions)
      .where(
        and(
          eq(schema.userRestrictions.userId, userId),
          isNull(schema.userRestrictions.liftedAt),
          or(isNull(schema.userRestrictions.until), gt(schema.userRestrictions.until, now)),
        ),
      );
    return rows.map((r) => ({ id: r.id, type: r.type as RestrictionType, until: r.until }));
  }

  /** Throws `ApiErrors.restricted()` if the user has an active restriction of any of `types`. */
  async assertNot(userId: string, types: RestrictionType[]): Promise<void> {
    const active = await this.activeRestrictions(userId);
    if (active.some((r) => types.includes(r.type))) {
      throw ApiErrors.restricted();
    }
  }
}
