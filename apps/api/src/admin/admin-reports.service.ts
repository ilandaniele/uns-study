import { Inject, Injectable } from "@nestjs/common";
import { and, asc, desc, eq, lt } from "drizzle-orm";
import { schema, type Db } from "@uns/database";
import type { AdminReportDto, Page } from "@uns/contracts";
import { DB } from "../database/database.module.js";
import { ApiErrors } from "../common/api-error.js";
import { StorageService } from "../storage/storage.service.js";

const PAGE_SIZE = 20;

type ReportStatus = (typeof schema.userReports.$inferSelect)["status"];

@Injectable()
export class AdminReportsService {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(StorageService) private readonly storage: StorageService,
  ) {}

  async list(status: string | undefined, cursor: string | undefined): Promise<Page<AdminReportDto>> {
    const conditions = [
      status ? eq(schema.userReports.status, status as ReportStatus) : undefined,
      cursor ? lt(schema.userReports.createdAt, new Date(cursor)) : undefined,
    ].filter((c): c is NonNullable<typeof c> => Boolean(c));

    const rows = await this.db
      .select()
      .from(schema.userReports)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(schema.userReports.createdAt))
      .limit(PAGE_SIZE + 1);

    const page = rows.slice(0, PAGE_SIZE);
    const items = await Promise.all(page.map((r) => this.toDto(r)));
    const nextCursor = rows.length > PAGE_SIZE ? page[page.length - 1]!.createdAt.toISOString() : null;
    return { items, nextCursor };
  }

  async getById(id: string): Promise<AdminReportDto> {
    const [row] = await this.db.select().from(schema.userReports).where(eq(schema.userReports.id, id)).limit(1);
    if (!row) throw ApiErrors.notFound("Reporte no encontrado.");
    return this.toDto(row);
  }

  async setStatus(id: string, status: string, actorId: string): Promise<AdminReportDto> {
    const [existing] = await this.db.select().from(schema.userReports).where(eq(schema.userReports.id, id)).limit(1);
    if (!existing) throw ApiErrors.notFound("Reporte no encontrado.");

    const resolved = status === "RESOLVED" || status === "DISMISSED";
    const [row] = await this.db
      .update(schema.userReports)
      .set({
        status: status as ReportStatus,
        resolvedAt: resolved ? new Date() : existing.resolvedAt,
        resolvedBy: resolved ? actorId : existing.resolvedBy,
      })
      .where(eq(schema.userReports.id, id))
      .returning();
    if (!row) throw new Error("Failed to update report");

    await this.db.insert(schema.moderationActions).values({
      actorId,
      targetUserId: row.reportedUserId,
      reportId: row.id,
      action: "REPORT_STATUS_CHANGED",
      metadata: { status },
    });

    return this.toDto(row);
  }

  /** Every access is audited (moderation reviewing evidence is itself a sensitive action). */
  async getAttachmentUrl(reportId: string, attachmentId: string, actorId: string): Promise<string> {
    const [attachment] = await this.db
      .select()
      .from(schema.userReportAttachments)
      .where(and(eq(schema.userReportAttachments.id, attachmentId), eq(schema.userReportAttachments.reportId, reportId)))
      .limit(1);
    if (!attachment) throw ApiErrors.notFound("Adjunto no encontrado.");

    const url = await this.storage.presignGet(attachment.objectKey);

    await this.db.insert(schema.moderationActions).values({
      actorId,
      reportId,
      action: "REPORT_ATTACHMENT_VIEWED",
      metadata: { attachmentId },
    });

    return url;
  }

  private async toDto(row: typeof schema.userReports.$inferSelect): Promise<AdminReportDto> {
    const [reporter] = await this.db.select().from(schema.user).where(eq(schema.user.id, row.reporterId)).limit(1);
    const [reported] = await this.db.select().from(schema.user).where(eq(schema.user.id, row.reportedUserId)).limit(1);
    const attachments = await this.db
      .select()
      .from(schema.userReportAttachments)
      .where(eq(schema.userReportAttachments.reportId, row.id))
      .orderBy(asc(schema.userReportAttachments.createdAt));

    return {
      id: row.id,
      reporter: { userId: row.reporterId, name: reporter?.name ?? "", email: reporter?.email ?? "" },
      reported: { userId: row.reportedUserId, name: reported?.name ?? "", email: reported?.email ?? "" },
      reason: row.reason,
      description: row.description,
      context: row.context,
      contextMessageId: row.contextMessageId,
      status: row.status,
      createdAt: row.createdAt.toISOString(),
      resolvedAt: row.resolvedAt ? row.resolvedAt.toISOString() : null,
      attachments: attachments.map((a) => ({ id: a.id, contentType: a.contentType, sizeBytes: a.sizeBytes, status: a.status })),
    };
  }
}
