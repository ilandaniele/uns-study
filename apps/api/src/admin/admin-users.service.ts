import { desc, eq } from "drizzle-orm";
import { schema, type Db } from "@sala/database";
import type { AdminUserDto, ModerationActionType } from "@sala/contracts";
import { ApiErrors } from "../common/api-error.js";
import { RolesService } from "../users/roles.service.js";
import { ModerationActionService } from "./moderation-action.service.js";

const ADMIN_ONLY_ACTIONS: ModerationActionType[] = ["SUSPEND", "BAN", "LIFT"];

const SEARCH_LIMIT = 50;
const LIST_ALL_LIMIT = 500;
const RECENT_SECURITY_EVENTS = 10;
const SEARCH_QUERY_MAX_LENGTH = 100;

/** Case-insensitive across Unicode (SQLite `LIKE` only folds ASCII); matched as a plain substring, so `%` and `_` are literal. */
function fold(value: string): string {
  return value.toLowerCase();
}

export class AdminUsersService {
  constructor(
    private readonly db: Db,
    private readonly moderation: ModerationActionService,
    private readonly roles: RolesService,
  ) {}

  async search(q: string | undefined, actorId: string) {
    const canSeeEmail = await this.roles.hasRole(actorId, ["ADMIN"]);
    const query = q?.trim().slice(0, SEARCH_QUERY_MAX_LENGTH);
    const columns = { id: schema.user.id, name: schema.user.name, email: schema.user.email, createdAt: schema.user.createdAt };
    let rows;
    if (query) {
      const needle = fold(query);
      const all = await this.db.select(columns).from(schema.user).orderBy(desc(schema.user.createdAt));
      rows = all.filter((u) => fold(u.name).includes(needle) || fold(u.email).includes(needle)).slice(0, SEARCH_LIMIT);
    } else {
      rows = await this.db.select(columns).from(schema.user).orderBy(desc(schema.user.createdAt)).limit(LIST_ALL_LIMIT);
    }
    const admins = await this.roles.adminIds(rows.map((u) => u.id));
    return rows.map((u) => ({
      userId: u.id,
      name: u.name,
      email: canSeeEmail ? u.email : null,
      createdAt: u.createdAt.toISOString(),
      isAdmin: admins.has(u.id),
    }));
  }

  async getById(userId: string, actorId: string): Promise<AdminUserDto> {
    const canSeeEmail = await this.roles.hasRole(actorId, ["ADMIN"]);
    const [u] = await this.db.select().from(schema.user).where(eq(schema.user.id, userId)).limit(1);
    if (!u) throw ApiErrors.notFound("Usuario no encontrado.");

    const [roleRows, restrictionRows, [reputation], events] = await Promise.all([
      this.db.select().from(schema.userRoles).where(eq(schema.userRoles.userId, userId)),
      this.db.select().from(schema.userRestrictions).where(eq(schema.userRestrictions.userId, userId)).orderBy(desc(schema.userRestrictions.createdAt)),
      this.db.select().from(schema.userReputation).where(eq(schema.userReputation.userId, userId)).limit(1),
      this.db
        .select()
        .from(schema.securityEvents)
        .where(eq(schema.securityEvents.userId, userId))
        .orderBy(desc(schema.securityEvents.createdAt))
        .limit(RECENT_SECURITY_EVENTS),
    ]);

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

  /** Owner-only: grants or revokes ADMIN. Audited in `moderation_actions` (free-text `action`). */
  async setAdmin(actorId: string, targetUserId: string, grant: boolean): Promise<void> {
    if (!(await this.roles.isOwner(actorId))) throw ApiErrors.forbidden("Solo el dueño de la app puede cambiar el rol de administrador.");

    const [target] = await this.db.select().from(schema.user).where(eq(schema.user.id, targetUserId)).limit(1);
    if (!target) throw ApiErrors.notFound("Usuario no encontrado.");
    if (targetUserId === actorId) throw ApiErrors.forbidden("No podés cambiar tu propio rol.");
    if (!grant && (await this.roles.isOwner(targetUserId))) throw ApiErrors.forbidden("No se puede quitar el rol de administrador al dueño.");

    if (grant) await this.roles.grantRole(targetUserId, "ADMIN");
    else await this.roles.revokeRole(targetUserId, "ADMIN");

    await this.db.insert(schema.moderationActions).values({
      actorId,
      targetUserId,
      action: grant ? "ADMIN_GRANTED" : "ADMIN_REVOKED",
      metadata: { role: "ADMIN" },
    });
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
