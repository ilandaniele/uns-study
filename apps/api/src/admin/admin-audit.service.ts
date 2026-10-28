import { and, desc, eq, inArray, lt } from "drizzle-orm";
import { schema, type Db } from "@sala/database";
import type { Page } from "@sala/contracts";
import { displayName } from "../users/display-name.js";

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

/** Read-only view over the append-only `moderation_actions` audit log. */
export class AdminAuditService {
  constructor(private readonly db: Db) {}

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
