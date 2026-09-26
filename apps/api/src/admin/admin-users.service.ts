import { Inject, Injectable } from "@nestjs/common";
import { desc, eq, ilike, or } from "drizzle-orm";
import { schema, type Db } from "@uns/database";
import type { AdminUserDto, ModerationActionType } from "@uns/contracts";
import { DB } from "../database/database.module.js";
import { ApiErrors } from "../common/api-error.js";
import { ModerationActionService } from "./moderation-action.service.js";

const SEARCH_LIMIT = 20;
const RECENT_SECURITY_EVENTS = 10;

@Injectable()
export class AdminUsersService {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(ModerationActionService) private readonly moderation: ModerationActionService,
  ) {}

  async search(q: string | undefined) {
    const rows = q
      ? await this.db
          .select()
          .from(schema.user)
          .where(or(ilike(schema.user.name, `%${q}%`), ilike(schema.user.email, `%${q}%`)))
          .limit(SEARCH_LIMIT)
      : await this.db.select().from(schema.user).limit(SEARCH_LIMIT);
    return rows.map((u) => ({ userId: u.id, name: u.name, email: u.email, createdAt: u.createdAt.toISOString() }));
  }

  async getById(userId: string): Promise<AdminUserDto> {
    const [u] = await this.db.select().from(schema.user).where(eq(schema.user.id, userId)).limit(1);
    if (!u) throw ApiErrors.notFound("Usuario no encontrado.");

    const roleRows = await this.db.select().from(schema.userRoles).where(eq(schema.userRoles.userId, userId));
    const restrictionRows = await this.db
      .select()
      .from(schema.userRestrictions)
      .where(eq(schema.userRestrictions.userId, userId))
      .orderBy(desc(schema.userRestrictions.createdAt));
    const [reputation] = await this.db.select().from(schema.userReputation).where(eq(schema.userReputation.userId, userId)).limit(1);
    const events = await this.db
      .select()
      .from(schema.securityEvents)
      .where(eq(schema.securityEvents.userId, userId))
      .orderBy(desc(schema.securityEvents.createdAt))
      .limit(RECENT_SECURITY_EVENTS);

    return {
      userId: u.id,
      name: u.name,
      email: u.email,
      createdAt: u.createdAt.toISOString(),
      roles: roleRows.map((r) => r.role),
      restrictions: restrictionRows
        .filter((r) => !r.liftedAt)
        .map((r) => ({ id: r.id, type: r.type, reason: r.reason, until: r.until ? r.until.toISOString() : null, createdAt: r.createdAt.toISOString() })),
      reputation: reputation
        ? {
            observationScore: reputation.observationScore,
            spamScore: reputation.spamScore,
            confirmedObservations: reputation.confirmedObservations,
            rejectedObservations: reputation.rejectedObservations,
          }
        : null,
      recentSecurityEvents: events.map((e) => ({ eventType: e.eventType, createdAt: e.createdAt.toISOString() })),
    };
  }

  async applyAction(
    actorId: string,
    targetUserId: string,
    input: { type: ModerationActionType; reason: string; until?: string | null; reportId?: string },
  ): Promise<void> {
    const [target] = await this.db.select().from(schema.user).where(eq(schema.user.id, targetUserId)).limit(1);
    if (!target) throw ApiErrors.notFound("Usuario no encontrado.");
    await this.moderation.apply({ actorId, targetUserId, ...input });
  }
}
