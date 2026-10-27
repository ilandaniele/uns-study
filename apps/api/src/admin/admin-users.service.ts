import { and, desc, eq, inArray } from "drizzle-orm";
import { schema, type Db } from "@sala/database";
import type { AdminUserDto, ModerationActionType } from "@sala/contracts";
import { ApiErrors } from "../common/api-error.js";
import { RolesService } from "../users/roles.service.js";
import { ModerationActionService } from "./moderation-action.service.js";

const ADMIN_ONLY_ACTIONS: ModerationActionType[] = ["SUSPEND", "BAN", "LIFT"];
/** Actions that restrict a user; a shielded user can only get these from the owner. */
const RESTRICTING_ACTIONS: ModerationActionType[] = ["MUTE_CHAT", "RESTRICT_OBSERVATIONS", "SUSPEND", "BAN"];

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

    const [roleRows, restrictionRows, [reputation], events, [shield]] = await Promise.all([
      this.db.select().from(schema.userRoles).where(eq(schema.userRoles.userId, userId)),
      this.db.select().from(schema.userRestrictions).where(eq(schema.userRestrictions.userId, userId)).orderBy(desc(schema.userRestrictions.createdAt)),
      this.db.select().from(schema.userReputation).where(eq(schema.userReputation.userId, userId)).limit(1),
      this.db
        .select()
        .from(schema.securityEvents)
        .where(eq(schema.securityEvents.userId, userId))
        .orderBy(desc(schema.securityEvents.createdAt))
        .limit(RECENT_SECURITY_EVENTS),
      this.db.select({ userId: schema.userShields.userId }).from(schema.userShields).where(eq(schema.userShields.userId, userId)).limit(1),
    ]);

    // Who applied each active restriction, so an admin can see who banned someone.
    const activeRestrictions = restrictionRows.filter((r) => !r.liftedAt);
    const actorIds = [...new Set(activeRestrictions.map((r) => r.createdBy).filter((id): id is string => !!id))];
    const actorRows = actorIds.length
      ? await this.db.select({ id: schema.user.id, name: schema.user.name }).from(schema.user).where(inArray(schema.user.id, actorIds))
      : [];
    const actorNames = new Map(actorRows.map((r) => [r.id, r.name]));

    return {
      userId: u.id,
      name: u.name,
      email: canSeeEmail ? u.email : null,
      createdAt: u.createdAt.toISOString(),
      roles: roleRows.map((r) => r.role),
      emailVerified: u.emailVerified,
      restrictions: activeRestrictions.map((r) => ({
        id: r.id,
        type: r.type,
        reason: r.reason,
        until: r.until ? r.until.toISOString() : null,
        createdAt: r.createdAt.toISOString(),
        createdByName: r.createdBy ? (actorNames.get(r.createdBy) ?? null) : null,
      })),
      reputation: reputation
        ? {
            observationScore: reputation.observationScore,
            spamScore: reputation.spamScore,
            confirmedObservations: reputation.confirmedObservations,
            rejectedObservations: reputation.rejectedObservations,
          }
        : null,
      recentSecurityEvents: events.map((e) => ({ eventType: e.eventType, createdAt: e.createdAt.toISOString() })),
      shielded: Boolean(shield),
    };
  }

  /** Deliberate, owner-only cleanup. Guards and deletion share one synchronous SQLite transaction. */
  async deleteUser(actorId: string, targetUserId: string, confirmationEmail: string): Promise<void> {
    if (!(await this.roles.isOwner(actorId))) throw ApiErrors.forbidden("Solo el dueño de la app puede eliminar cuentas.");
    if (actorId === targetUserId) throw ApiErrors.forbidden("No podés eliminar tu propia cuenta desde administración.");

    this.db.transaction((tx) => {
      const target = tx.select().from(schema.user).where(eq(schema.user.id, targetUserId)).get();
      if (!target) throw ApiErrors.notFound("Usuario no encontrado.");
      if (target.email.trim().toLowerCase() !== confirmationEmail.trim().toLowerCase()) {
        throw ApiErrors.validation("El correo no coincide con la cuenta que vas a eliminar. Volvé a cargar su perfil.");
      }
      const staff = tx.select().from(schema.userRoles).where(eq(schema.userRoles.userId, targetUserId)).get();
      const shield = tx.select().from(schema.userShields).where(eq(schema.userShields.userId, targetUserId)).get();
      if (staff || shield) throw ApiErrors.forbidden("No se puede eliminar una cuenta del equipo o blindada.");

      const seated = tx.select({ id: schema.checkIns.id }).from(schema.checkIns)
        .where(and(eq(schema.checkIns.userId, targetUserId), eq(schema.checkIns.status, "ACTIVE"))).get();
      if (seated) throw ApiErrors.validation("Esta persona tiene un lugar activo. Primero debe finalizar su presencia.");

      // Keep billing records and provider subscriptions intact; deletion must never orphan a charge.
      const subscription = tx.select({ userId: schema.userSubscriptions.userId }).from(schema.userSubscriptions)
        .where(eq(schema.userSubscriptions.userId, targetUserId)).get();
      const order = tx.select({ id: schema.gardenOrders.id }).from(schema.gardenOrders)
        .where(eq(schema.gardenOrders.userId, targetUserId)).get();
      if (subscription || order) throw ApiErrors.validation("La cuenta tiene compras o una suscripción y requiere revisión antes de eliminarla.");

      tx.insert(schema.moderationActions).values({
        actorId, targetUserId, action: "OWNER_ACCOUNT_DELETED", metadata: { emailVerified: target.emailVerified },
      }).run();
      // Foreign keys revoke sessions/credentials and apply the existing deletion policies to domain
      // records. Never put the deleted name or email in moderation metadata.
      tx.delete(schema.user).where(eq(schema.user.id, targetUserId)).run();
    });
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

  /** Owner-only: shields a user so no admin or moderator can restrict them, or removes the shield. Audited. */
  async setShield(actorId: string, targetUserId: string, shield: boolean): Promise<void> {
    if (!(await this.roles.isOwner(actorId))) throw ApiErrors.forbidden("Solo el dueño de la app puede blindar usuarios.");

    const [target] = await this.db.select().from(schema.user).where(eq(schema.user.id, targetUserId)).limit(1);
    if (!target) throw ApiErrors.notFound("Usuario no encontrado.");

    if (shield) {
      await this.db.insert(schema.userShields).values({ userId: targetUserId, createdBy: actorId }).onConflictDoNothing();
    } else {
      await this.db.delete(schema.userShields).where(eq(schema.userShields.userId, targetUserId));
    }

    await this.db.insert(schema.moderationActions).values({
      actorId,
      targetUserId,
      action: shield ? "SHIELDED" : "UNSHIELDED",
      metadata: {},
    });
  }

  async applyAction(
    actorId: string,
    targetUserId: string,
    input: { type: ModerationActionType; reason: string; until?: string | null; reportId?: string; restrictionId?: string },
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

    if (RESTRICTING_ACTIONS.includes(input.type)) {
      const [shield] = await this.db.select({ userId: schema.userShields.userId }).from(schema.userShields).where(eq(schema.userShields.userId, targetUserId)).limit(1);
      if (shield && !(await this.roles.isOwner(actorId))) throw ApiErrors.forbidden("Este usuario está blindado por el dueño de la app.");
    }

    await this.moderation.apply({ actorId, targetUserId, ...input });
  }
}
