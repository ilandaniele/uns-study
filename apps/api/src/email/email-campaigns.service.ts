import { Inject, Injectable } from "@nestjs/common";
import { and, count, desc, eq, inArray } from "drizzle-orm";
import { schema, type Db } from "@sala/database";
import type { EmailAudience, EmailCampaignDto, EmailCampaignInput, EmailCampaignStatus, EmailConfigDto, EmailRecipientPreviewDto } from "@sala/contracts";
import { emailAudienceSchema } from "@sala/contracts";
import { DB } from "../database/database.module.js";
import { ApiErrors, ApiException } from "../common/api-error.js";
import { env } from "../env.js";
import { countRecipients, recipientsQuery } from "./email-recipients.js";

const INSERT_CHUNK = 1000;
const LIST_LIMIT = 100;

type CampaignRow = typeof schema.emailCampaigns.$inferSelect;

/** Admin-side email campaign CRUD. Nothing is ever sent here except through `send`, which only enqueues deliveries. */
@Injectable()
export class EmailCampaignsService {
  constructor(@Inject(DB) private readonly db: Db) {}

  config(): EmailConfigDto {
    return { enabled: emailEnabled() };
  }

  async previewCount(audience: EmailAudience = "all", now: Date = new Date()): Promise<EmailRecipientPreviewDto> {
    return { recipientCount: await countRecipients(this.db, now, audience) };
  }

  async list(): Promise<EmailCampaignDto[]> {
    const rows = await this.db.select().from(schema.emailCampaigns).orderBy(desc(schema.emailCampaigns.createdAt)).limit(LIST_LIMIT);
    if (!rows.length) return [];
    const counts = await this.db
      .select({
        campaignId: schema.emailCampaignDeliveries.campaignId,
        status: schema.emailCampaignDeliveries.status,
        n: count(),
      })
      .from(schema.emailCampaignDeliveries)
      .where(inArray(schema.emailCampaignDeliveries.campaignId, rows.map((r) => r.id)))
      .groupBy(schema.emailCampaignDeliveries.campaignId, schema.emailCampaignDeliveries.status);
    return rows.map((row) => toDto(row, counts.filter((c) => c.campaignId === row.id)));
  }

  async create(input: EmailCampaignInput, actorId: string): Promise<EmailCampaignDto> {
    return this.db.transaction(async (tx) => {
      const [row] = await tx
        .insert(schema.emailCampaigns)
        .values({ subject: input.subject, bodyText: input.bodyText, audience: input.audience, createdBy: actorId })
        .returning();
      if (!row) throw new Error("Failed to create email campaign");
      await tx.insert(schema.moderationActions).values({ actorId, action: "EMAIL_CAMPAIGN_CREATED", metadata: { campaignId: row.id } });
      return toDto(row, []);
    });
  }

  async update(id: string, patch: Partial<EmailCampaignInput>): Promise<EmailCampaignDto> {
    const [existing] = await this.db.select().from(schema.emailCampaigns).where(eq(schema.emailCampaigns.id, id)).limit(1);
    if (!existing) throw ApiErrors.notFound("Campaña no encontrada.");
    if (existing.status !== "draft") throw ApiErrors.validation("La campaña ya se envió.");

    const [row] = await this.db
      .update(schema.emailCampaigns)
      .set({ ...(patch.subject !== undefined ? { subject: patch.subject } : {}), ...(patch.bodyText !== undefined ? { bodyText: patch.bodyText } : {}),
        ...(patch.audience !== undefined ? { audience: patch.audience } : {}),
      })
      .where(and(eq(schema.emailCampaigns.id, id), eq(schema.emailCampaigns.status, "draft")))
      .returning();
    // Lost a race with `send`: the draft is gone.
    if (!row) throw ApiErrors.validation("La campaña ya se envió.");
    return toDto(row, []);
  }

  /**
   * Freezes the recipient list into pending deliveries and flips the draft to `sending`, all in one
   * transaction, so a second click (or a second admin) hits the `status='draft'` guard. The actual
   * delivery is done by `EmailSendJob`.
   */
  async send(id: string, actorId: string, now: Date = new Date()): Promise<EmailCampaignDto> {
    if (!emailEnabled()) throw ApiErrors.featureDisabled("El envío de mails no está configurado.");

    return this.db.transaction(async (tx) => {
      const [draft] = await tx.select({ audience: schema.emailCampaigns.audience }).from(schema.emailCampaigns).where(eq(schema.emailCampaigns.id, id)).limit(1);
      const recipients = await recipientsQuery(tx, now, toAudience(draft?.audience));
      const [campaign] = await tx
        .update(schema.emailCampaigns)
        .set({ status: "sending", recipientCount: recipients.length })
        .where(and(eq(schema.emailCampaigns.id, id), eq(schema.emailCampaigns.status, "draft")))
        .returning();
      if (!campaign) {
        const [exists] = await tx.select({ id: schema.emailCampaigns.id }).from(schema.emailCampaigns).where(eq(schema.emailCampaigns.id, id)).limit(1);
        if (!exists) throw ApiErrors.notFound("Campaña no encontrada.");
        throw new ApiException("VALIDATION_ERROR", "La campaña ya se envió.", 409);
      }

      for (let i = 0; i < recipients.length; i += INSERT_CHUNK) {
        await tx
          .insert(schema.emailCampaignDeliveries)
          .values(recipients.slice(i, i + INSERT_CHUNK).map((r) => ({ campaignId: id, userId: r.userId })))
          .onConflictDoNothing();
      }
      await tx
        .insert(schema.moderationActions)
        .values({ actorId, action: "EMAIL_CAMPAIGN_SENT", metadata: { campaignId: id, recipientCount: recipients.length } });
      return toDto(campaign, [{ status: "pending", n: recipients.length }]);
    });
  }
}

export function emailEnabled(): boolean {
  return Boolean(env.resendApiKey && env.emailFrom);
}

function toAudience(value: string | undefined): EmailAudience {
  return emailAudienceSchema.catch("all").parse(value);
}

function toDto(row: CampaignRow, counts: { status: string; n: number }[]): EmailCampaignDto {
  const of = (status: string) => Number(counts.find((c) => c.status === status)?.n ?? 0);
  return {
    id: row.id,
    subject: row.subject,
    bodyText: row.bodyText,
    audience: toAudience(row.audience),
    status: row.status as EmailCampaignStatus,
    createdBy: row.createdBy,
    createdAt: row.createdAt.toISOString(),
    sentAt: row.sentAt?.toISOString() ?? null,
    recipientCount: row.recipientCount,
    sentCount: of("sent"),
    failedCount: of("failed"),
    pendingCount: of("pending"),
  };
}
