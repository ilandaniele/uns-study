import { and, count, desc, eq, inArray, lt, lte, sql } from "drizzle-orm";
import { schema, type Db } from "@sala/database";
import type { Page } from "@sala/contracts";
import { displayName } from "../users/display-name.js";
import { ApiErrors } from "../common/api-error.js";

const PAGE_SIZE = 50;

export interface AuditEntryDto {
  id: string;
  actorId: string | null;
  actorName: string | null;
  targetUserId: string | null;
  targetName: string | null;
  reportId: string | null;
  action: string;
  metadata: unknown;
  createdAt: string;
}

/** Audit read model and explicitly requested owner-only cleanup. */
export class AdminAuditService {
  constructor(private readonly db: Db) {}

  /** The route requires SUPERADMIN. Only existing audit rows are removed, never moderation state. */
  clearExisting(actorId: string): { count: number; clearedBefore: string } {
    const now = new Date();
    return this.db.transaction(tx => {
      // Bulk-mark undo currently stores its observation IDs in the audit. Do not silently
      // destroy a live undo while clearing history; all existing rows survive this rejection.
      const activeUndo = tx.select({ id: schema.moderationActions.id }).from(schema.moderationActions).where(and(
        lte(schema.moderationActions.createdAt, now),
        eq(schema.moderationActions.action, "ADMIN_MARK_ALL_OCCUPIED"),
        sql`exists (select 1 from ${schema.seatObservations}
          where ${schema.seatObservations.id} in (select value from json_each(json_extract(${schema.moderationActions.metadata}, '$.observationIds')))
          and ${schema.seatObservations.expiresAt} > ${now.getTime()})`,
      )).limit(1).get();
      if (activeUndo) throw ApiErrors.validation("Hay un marcado total que todavía se puede deshacer. Deshacelo o esperá su vencimiento antes de limpiar la auditoría.");
      const filter = lte(schema.moderationActions.createdAt, now);
      const removed = tx.select({ total: count() }).from(schema.moderationActions).where(filter).get()!.total;
      tx.delete(schema.moderationActions).where(filter).run();
      if (removed) tx.insert(schema.moderationActions).values({
        actorId, action: "AUDIT_CLEARED", metadata: { count: removed, clearedBefore: now.toISOString() }, createdAt: new Date(now.getTime() + 1),
      }).run();
      return { count: removed, clearedBefore: now.toISOString() };
    });
  }

  /** Newest first. `targetUserId` narrows the log to the actions taken on one user. */
  async list(cursor: string | undefined, targetUserId?: string, ownerMetadata = false): Promise<Page<AuditEntryDto>> {
    const before = parseCursor(cursor);
    const rows = await this.db
      .select()
      .from(schema.moderationActions)
      .where(
        and(
          before ? lt(schema.moderationActions.createdAt, before) : undefined,
          targetUserId ? eq(schema.moderationActions.targetUserId, targetUserId) : undefined,
        ),
      )
      .orderBy(desc(schema.moderationActions.createdAt))
      .limit(PAGE_SIZE + 1);

    const page = rows.slice(0, PAGE_SIZE);
    const userIds = [...new Set(page.flatMap((r) => [r.actorId, r.targetUserId]).filter((id): id is string => id !== null))];
    const names = new Map(
      userIds.length === 0
        ? []
        : (
            await this.db
              .select({ id: schema.user.id, name: schema.user.name })
              .from(schema.user)
              .where(inArray(schema.user.id, userIds))
          ).map((u) => [u.id, u.name] as const),
    );
    if(!ownerMetadata && userIds.length){
      const profiles=await this.db.select().from(schema.userProfiles).where(inArray(schema.userProfiles.userId,userIds));
      names.clear();
      for(const profile of profiles)names.set(profile.userId,displayName(profile,null,""));
      for(const userId of userIds)if(!names.has(userId))names.set(userId,"Usuario anónimo");
    }

    const items = page.map((r) => ({
      id: r.id,
      actorId: r.actorId,
      actorName: r.actorId ? (names.get(r.actorId) ?? null) : null,
      targetUserId: r.targetUserId,
      targetName: r.targetUserId ? (names.get(r.targetUserId) ?? null) : null,
      reportId: r.reportId,
      action: r.action,
      metadata: !ownerMetadata && (r.action === "GARDEN_SEEDS_GRANTED" || r.action === "ROOM_GEOFENCE_UPDATED" || r.action.startsWith("EMAIL_")) ? null : r.metadata,
      createdAt: r.createdAt.toISOString(),
    }));
    const nextCursor = rows.length > PAGE_SIZE ? page[page.length - 1]!.createdAt.toISOString() : null;
    return { items, nextCursor };
  }
}

/** A malformed `?cursor=` is treated as "first page" instead of reaching the DB as Invalid Date. */
export function parseCursor(cursor: string | undefined): Date | null {
  if (!cursor) return null;
  const d = new Date(cursor);
  return Number.isNaN(d.getTime()) ? null : d;
}
