import { and, desc, eq } from "drizzle-orm";
import { schema, type Db } from "@sala/database";
import type { AdminFeedbackDto, FeedbackCategory, FeedbackCreatedDto, FeedbackStatus } from "@sala/contracts";
import { ApiErrors } from "../common/api-error.js";
import { escapeHtml } from "../email/email-render.js";
import type { ResendClient, ResendMessage } from "../email/resend.client.js";
import type { Clock } from "../platform/clock.js";

const LIST_LIMIT = 200;

const CATEGORY_LABELS: Record<FeedbackCategory, string> = {
  SUGGESTION: "Sugerencia",
  CONCERN: "Inquietud",
  BUG: "Error",
  OTHER: "Otro",
};

export interface FeedbackMailConfig {
  adminEmails: string[];
  ownerEmail: string;
  emailFrom: string;
}

export interface CreateFeedbackInput {
  userId: string | null;
  accountEmail: string | null;
  accountEmailVerified: boolean;
  accountName: string | null;
  category: FeedbackCategory;
  message: string;
  /** Address typed in the form; wins over the account email. */
  email?: string;
  ipHash: string | null;
}

export class FeedbackService {
  constructor(
    private readonly db: Db,
    private readonly clock: Clock,
    private readonly resend: Pick<ResendClient, "sendBatch"> | null,
    private readonly mail: FeedbackMailConfig,
  ) {}

  async create(input: CreateFeedbackInput): Promise<FeedbackCreatedDto> {
    const contactEmail = input.email ?? (input.accountEmailVerified ? input.accountEmail : null) ?? null;
    const [row] = await this.db
      .insert(schema.feedback)
      .values({
        userId: input.userId,
        category: input.category,
        message: input.message,
        contactEmail,
        ipHash: input.ipHash,
        createdAt: this.clock.now(),
      })
      .returning({ id: schema.feedback.id });

    this.notifyAdmins(input, contactEmail);
    return { id: row!.id };
  }

  async list(filter: { status?: FeedbackStatus } = {}): Promise<AdminFeedbackDto[]> {
    const rows = await this.db
      .select({ f: schema.feedback, senderName: schema.user.name })
      .from(schema.feedback)
      .leftJoin(schema.user, eq(schema.feedback.userId, schema.user.id))
      .where(filter.status ? and(eq(schema.feedback.status, filter.status)) : undefined)
      .orderBy(desc(schema.feedback.createdAt))
      .limit(LIST_LIMIT);

    return rows.map(({ f, senderName }) => ({
      id: f.id,
      category: f.category,
      message: f.message,
      contactEmail: f.contactEmail,
      sender: f.userId ? { userId: f.userId, name: senderName ?? "" } : null,
      status: f.status,
      createdAt: f.createdAt.toISOString(),
    }));
  }

  async setStatus(id: string, status: FeedbackStatus): Promise<{ id: string; status: FeedbackStatus }> {
    const [existing] = await this.db
      .select({ status: schema.feedback.status })
      .from(schema.feedback)
      .where(eq(schema.feedback.id, id))
      .limit(1);
    if (!existing) throw ApiErrors.notFound("Sugerencia no encontrada.");
    // Skip the write when nothing changes (DO Free plan caps rows written per day).
    if (existing.status !== status) {
      await this.db.update(schema.feedback).set({ status }).where(eq(schema.feedback.id, id));
    }
    return { id, status };
  }

  /** Fire-and-forget: errors are logged, never thrown, so a mail outage cannot fail the request. */
  private notifyAdmins(input: CreateFeedbackInput, contactEmail: string | null): void {
    const recipients = this.mail.adminEmails.length ? this.mail.adminEmails : this.mail.ownerEmail ? [this.mail.ownerEmail] : [];
    if (!this.resend || !this.mail.emailFrom || recipients.length === 0) return;

    const msg = composeFeedbackEmail({
      from: this.mail.emailFrom,
      to: recipients,
      category: input.category,
      message: input.message,
      contactEmail,
      senderName: input.accountName,
    });
    try {
      void this.resend.sendBatch([msg]).catch((err: unknown) => {
        console.error("[feedback] admin email failed:", err instanceof Error ? err.message : "unknown error");
      });
    } catch (err) {
      console.error("[feedback] admin email failed:", err instanceof Error ? err.message : "unknown error");
    }
  }
}

export function composeFeedbackEmail(input: {
  from: string;
  to: string[];
  category: FeedbackCategory;
  message: string;
  contactEmail: string | null;
  senderName: string | null;
}): ResendMessage {
  const label = CATEGORY_LABELS[input.category];
  const contact = input.contactEmail ?? "sin email de contacto";
  const sender = input.senderName || "anónimo";
  const text = [`Categoría: ${label}`, `Contacto: ${contact}`, `Enviado por: ${sender}`, "", input.message].join("\n");
  const html = [
    `<p><strong>Categoría:</strong> ${escapeHtml(label)}<br>`,
    `<strong>Contacto:</strong> ${escapeHtml(contact)}<br>`,
    `<strong>Enviado por:</strong> ${escapeHtml(sender)}</p>`,
    `<p>${escapeHtml(input.message).replace(/\r?\n/g, "<br>")}</p>`,
  ].join("");
  // Reply-To is only a convenience for the admins; strip line breaks so it cannot inject headers.
  const headers: Record<string, string> = input.contactEmail ? { "Reply-To": input.contactEmail.replace(/[\r\n]/g, "") } : {};
  return { from: input.from, to: input.to, subject: `Nueva sugerencia: ${label}`, text, html, headers };
}
