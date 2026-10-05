import { Inject, Injectable } from "@nestjs/common";
import { and, count, eq, or } from "drizzle-orm";
import { schema, type Db } from "@sala/database";
import {
  REPORT_EVIDENCE_MAX_BYTES,
  type ReportContext,
  type ReportCreatedDto,
  type ReportReason,
  type UploadInstructionDto,
} from "@sala/contracts";
import { DB } from "../database/database.module.js";
import { ApiErrors } from "../common/api-error.js";
import { RateLimitService } from "../security/rate-limit.service.js";
import { RestrictionService } from "../users/restriction.service.js";
import { RolesService } from "../users/roles.service.js";
import { StorageService } from "../storage/storage.service.js";

/** Path placeholder: report the author of `contextMessageId` without knowing their account id (alias authors). */
export const MESSAGE_AUTHOR_PLACEHOLDER = "message-author";
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
    @Inject(RestrictionService) private readonly restrictions: RestrictionService,
    @Inject(RolesService) private readonly roles: RolesService,
    @Inject(StorageService) private readonly storage: StorageService,
  ) {}

  async createReport(rawInput: CreateReportInput): Promise<ReportCreatedDto> {
    await this.restrictions.assertNot(rawInput.reporterId, ["SUSPENDED", "BANNED"]);
    const input = await this.resolveReportedUser(rawInput);

    if (input.reporterId === input.reportedUserId) {
      throw ApiErrors.validation("No podés reportarte a vos mismo.");
    }

    const [reportedUser] = await this.db.select({ id: schema.user.id }).from(schema.user).where(eq(schema.user.id, input.reportedUserId)).limit(1);
    if (!reportedUser) throw ApiErrors.notFound("Usuario no encontrado.");

    if (input.roomId) {
      const [room] = await this.db.select({ id: schema.rooms.id }).from(schema.rooms).where(eq(schema.rooms.id, input.roomId)).limit(1);
      if (!room) throw ApiErrors.roomNotFound();
    }

    if (input.contextMessageId) {
      await this.assertContextMessage(input.context, input.contextMessageId, input.reportedUserId, input.reporterId);
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
      await this.rejectAttachment(attachment.id, attachment.objectKey);
      throw ApiErrors.validation("El archivo no se subió correctamente.");
    }
    if (head.contentLength > REPORT_EVIDENCE_MAX_BYTES) {
      await this.rejectAttachment(attachment.id, attachment.objectKey);
      throw ApiErrors.validation("El archivo supera el tamaño máximo permitido.");
    }
    if (head.contentType && head.contentType !== attachment.contentType) {
      await this.rejectAttachment(attachment.id, attachment.objectKey);
      throw ApiErrors.validation("El tipo de archivo no coincide con lo declarado.");
    }

    await this.db.update(schema.userReportAttachments).set({ status: "UPLOADED" }).where(eq(schema.userReportAttachments.id, attachmentId));
  }

  /** A HEAD mismatch means the object doesn't actually match what was declared — delete both the
   *  (possibly bogus) object and the attachment row rather than leaving a dangling PENDING one. */
  private async rejectAttachment(attachmentId: string, objectKey: string): Promise<void> {
    await this.storage.deleteObject(objectKey);
    await this.db.delete(schema.userReportAttachments).where(eq(schema.userReportAttachments.id, attachmentId));
  }

  /** `contextMessageId` must point to a real message authored by the reported user, in the store matching `context`. */
  /** Resolves the placeholder reported id to the (chat) message's author, server-side. */
  private async resolveReportedUser(input: CreateReportInput): Promise<CreateReportInput> {
    if (input.reportedUserId !== MESSAGE_AUTHOR_PLACEHOLDER) return input;
    if (input.context !== "CHAT" || !input.contextMessageId) throw ApiErrors.validation("Falta el mensaje a reportar.");
    const [message] = await this.db
      .select({ userId: schema.chatMessages.userId })
      .from(schema.chatMessages)
      .where(eq(schema.chatMessages.id, input.contextMessageId))
      .limit(1);
    if (!message) throw ApiErrors.validation("El mensaje reportado no existe.");
    return { ...input, reportedUserId: message.userId };
  }

  private async assertContextMessage(context: ReportContext, messageId: string, reportedUserId: string, reporterId: string): Promise<void> {
    if (context === "CHAT") {
      const [message] = await this.db
        .select({ id: schema.chatMessages.id })
        .from(schema.chatMessages)
        .where(and(eq(schema.chatMessages.id, messageId), eq(schema.chatMessages.userId, reportedUserId)))
        .limit(1);
      if (!message) throw ApiErrors.validation("El mensaje reportado no existe.");
      return;
    }
    if (context === "DM") {
      // Only a participant of the conversation may cite one of its messages.
      const [message] = await this.db
        .select({ id: schema.directMessages.id })
        .from(schema.directMessages)
        .innerJoin(schema.directConversations, eq(schema.directConversations.id, schema.directMessages.conversationId))
        .where(
          and(
            eq(schema.directMessages.id, messageId),
            eq(schema.directMessages.senderId, reportedUserId),
            or(eq(schema.directConversations.userA, reporterId), eq(schema.directConversations.userB, reporterId)),
          ),
        )
        .limit(1);
      if (!message) throw ApiErrors.validation("El mensaje reportado no existe.");
      return;
    }
    // PROFILE context has no associated message; a contextMessageId here is meaningless.
    throw ApiErrors.validation("contextMessageId no es válido para este contexto.");
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
