import { Inject, Injectable } from "@nestjs/common";
import { and, count, eq } from "drizzle-orm";
import { schema, type Db } from "@uns/database";
import {
  REPORT_EVIDENCE_MAX_BYTES,
  type ReportContext,
  type ReportCreatedDto,
  type ReportReason,
  type UploadInstructionDto,
} from "@uns/contracts";
import { DB } from "../database/database.module.js";
import { ApiErrors } from "../common/api-error.js";
import { RateLimitService } from "../security/rate-limit.service.js";
import { RolesService } from "../users/roles.service.js";
import { StorageService } from "../storage/storage.service.js";

const DAILY_REPORT_LIMIT = 5;
const DAY_SECONDS = 24 * 60 * 60;
const MAX_ATTACHMENTS_PER_REPORT = 3;

export interface CreateReportInput {
  reporterId: string;
  reportedUserId: string;
  reason: ReportReason;
  description?: string;
  roomId?: string;
  context: ReportContext;
  contextMessageId?: string;
}

@Injectable()
export class ReportsService {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(RateLimitService) private readonly rateLimit: RateLimitService,
    @Inject(RolesService) private readonly roles: RolesService,
    @Inject(StorageService) private readonly storage: StorageService,
  ) {}

  async createReport(input: CreateReportInput): Promise<ReportCreatedDto> {
    if (input.reporterId === input.reportedUserId) {
      throw ApiErrors.validation("No podés reportarte a vos mismo.");
    }

    const isModerator = await this.roles.hasRole(input.reporterId, ["ADMIN", "MODERATOR"]);
    if (!isModerator) {
      const limit = await this.rateLimit.check(`report:${input.reporterId}`, DAILY_REPORT_LIMIT, DAY_SECONDS);
      if (!limit.allowed) throw ApiErrors.rateLimited();
    }

    const [created] = await this.db
      .insert(schema.userReports)
      .values({
        reporterId: input.reporterId,
        reportedUserId: input.reportedUserId,
        roomId: input.roomId ?? null,
        reason: input.reason,
        description: input.description ?? null,
        context: input.context,
        contextMessageId: input.contextMessageId ?? null,
      })
      .returning();
    if (!created) throw new Error("Failed to create report");
    return { id: created.id, status: created.status };
  }

  /** Reporter-only: requests a presigned upload slot, up to `MAX_ATTACHMENTS_PER_REPORT` per report. */
  async requestAttachment(reportId: string, userId: string, contentType: string, sizeBytes: number): Promise<UploadInstructionDto> {
    const report = await this.getOwnedReport(reportId, userId);
    if (!report) throw ApiErrors.notFound("Reporte no encontrado.");

    if (!this.storage.isEnabled()) throw ApiErrors.storageUnavailable();

    const [{ value }] = await this.db
      .select({ value: count() })
      .from(schema.userReportAttachments)
      .where(eq(schema.userReportAttachments.reportId, reportId));
    if (Number(value) >= MAX_ATTACHMENTS_PER_REPORT) {
      throw ApiErrors.validation("Máximo 3 archivos adjuntos por reporte.");
    }
    if (sizeBytes > REPORT_EVIDENCE_MAX_BYTES) {
      throw ApiErrors.validation("El archivo supera el tamaño máximo permitido.");
    }

    const presigned = await this.storage.presignPut(contentType, sizeBytes);

    const [attachment] = await this.db
      .insert(schema.userReportAttachments)
      .values({
        reportId,
        objectKey: presigned.objectKey,
        contentType,
        sizeBytes,
        uploadedBy: userId,
        status: "PENDING",
      })
      .returning();
    if (!attachment) throw new Error("Failed to create attachment");

    return {
      attachmentId: attachment.id,
      uploadUrl: presigned.uploadUrl,
      method: "PUT",
      headers: presigned.headers,
      expiresAt: presigned.expiresAt,
    };
  }

  /** Reporter-only: verifies the object actually landed in storage via HEAD, then marks it UPLOADED. */
  async completeAttachment(reportId: string, attachmentId: string, userId: string): Promise<void> {
    const report = await this.getOwnedReport(reportId, userId);
    if (!report) throw ApiErrors.notFound("Reporte no encontrado.");

    const [attachment] = await this.db
      .select()
      .from(schema.userReportAttachments)
      .where(and(eq(schema.userReportAttachments.id, attachmentId), eq(schema.userReportAttachments.reportId, reportId)))
      .limit(1);
    if (!attachment) throw ApiErrors.notFound("Adjunto no encontrado.");
    if (attachment.status === "UPLOADED") return;

    const head = await this.storage.head(attachment.objectKey);
    if (!head || head.contentLength === null || head.contentLength <= 0) {
      throw ApiErrors.validation("El archivo no se subió correctamente.");
    }
    if (head.contentLength > REPORT_EVIDENCE_MAX_BYTES) {
      throw ApiErrors.validation("El archivo supera el tamaño máximo permitido.");
    }
    if (head.contentType && head.contentType !== attachment.contentType) {
      throw ApiErrors.validation("El tipo de archivo no coincide con lo declarado.");
    }

    await this.db.update(schema.userReportAttachments).set({ status: "UPLOADED" }).where(eq(schema.userReportAttachments.id, attachmentId));
  }

  private async getOwnedReport(reportId: string, reporterId: string) {
    const [report] = await this.db
      .select()
      .from(schema.userReports)
      .where(and(eq(schema.userReports.id, reportId), eq(schema.userReports.reporterId, reporterId)))
      .limit(1);
    return report ?? null;
  }
}
