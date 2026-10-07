import { Inject, Injectable } from "@nestjs/common";
import { desc, lt } from "drizzle-orm";
import { schema, type Db } from "@sala/database";
import type { Page } from "@sala/contracts";
import { DB } from "../database/database.module.js";

const PAGE_SIZE = 50;

export interface AuditEntryDto {
  id: string;
  actorId: string | null;
  targetUserId: string | null;
  reportId: string | null;
  action: string;
  metadata: unknown;
  createdAt: string;
}

/** Read-only view over the append-only `moderation_actions` audit log. */
@Injectable()
export class AdminAuditService {
  constructor(@Inject(DB) private readonly db: Db) {}

  async list(cursor: string | undefined): Promise<Page<AuditEntryDto>> {
    const before = parseCursor(cursor);
    const rows = await this.db
      .select()
      .from(schema.moderationActions)
      .where(before ? lt(schema.moderationActions.createdAt, before) : undefined)
      .orderBy(desc(schema.moderationActions.createdAt))
      .limit(PAGE_SIZE + 1);

    const page = rows.slice(0, PAGE_SIZE);
    const items = page.map((r) => ({
      id: r.id,
      actorId: r.actorId,
      targetUserId: r.targetUserId,
      reportId: r.reportId,
      action: r.action,
      metadata: r.metadata,
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
