import { Inject, Injectable } from "@nestjs/common";
import { desc, eq, ilike, or } from "drizzle-orm";
import { schema, type Db } from "@sala/database";
import type { AdminUserDto, ModerationActionType } from "@sala/contracts";
import { DB } from "../database/database.module.js";
import { ApiErrors } from "../common/api-error.js";
import { RolesService } from "../users/roles.service.js";
import { ModerationActionService } from "./moderation-action.service.js";

const ADMIN_ONLY_ACTIONS: ModerationActionType[] = ["SUSPEND", "BAN", "LIFT"];

const SEARCH_LIMIT = 20;
const RECENT_SECURITY_EVENTS = 10;
const SEARCH_QUERY_MAX_LENGTH = 100;

/** Escapes `ILIKE` wildcards (`%`, `_`) and the escape character itself (`\`) so user input is matched literally. */
function escapeLikePattern(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

@Injectable()
export class AdminUsersService {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(ModerationActionService) private readonly moderation: ModerationActionService,
    @Inject(RolesService) private readonly roles: RolesService,
  ) {}

  async search(q: string | undefined, actorId: string) {
    const canSeeEmail = await this.roles.hasRole(actorId, ["ADMIN"]);
    const query = q?.slice(0, SEARCH_QUERY_MAX_LENGTH);
    const rows = query
      ? await this.db
          .select()
          .from(schema.user)
          .where(or(ilike(schema.user.name, `%${escapeLikePattern(query)}%`), ilike(schema.user.email, `%${escapeLikePattern(query)}%`)))
          .limit(SEARCH_LIMIT)
      : await this.db.select().from(schema.user).limit(SEARCH_LIMIT);
    return rows.map((u) => ({ userId: u.id, name: u.name, email: canSeeEmail ? u.email : null, createdAt: u.createdAt.toISOString() }));
  }

  async getById(userId: string, actorId: string): Promise<AdminUserDto> {
    const canSeeEmail = await this.roles.hasRole(actorId, ["ADMIN"]);
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
      email: canSeeEmail ? u.email : null,
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
    if (targetUserId === actorId) throw ApiErrors.forbidden("No podés aplicar una acción de moderación sobre vos mismo.");

    const [target] = await this.db.select().from(schema.user).where(eq(schema.user.id, targetUserId)).limit(1);
    if (!target) throw ApiErrors.notFound("Usuario no encontrado.");

    const targetIsStaff = await this.roles.hasRole(targetUserId, ["ADMIN", "MODERATOR"]);
    if (targetIsStaff) throw ApiErrors.forbidden("No podés aplicar una acción de moderación sobre otro moderador o administrador.");

    if (ADMIN_ONLY_ACTIONS.includes(input.type)) {
      const actorIsAdmin = await this.roles.hasRole(actorId, ["ADMIN"]);
      if (!actorIsAdmin) throw ApiErrors.forbidden("Necesitás permisos de administrador para hacer esto.");
    }

    await this.moderation.apply({ actorId, targetUserId, ...input });
  }
}
