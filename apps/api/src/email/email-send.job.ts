import { Inject, Injectable, Logger } from "@nestjs/common";
import { Interval } from "@nestjs/schedule";
import { and, eq, exists, inArray, isNull, lt, notExists, or, sql } from "drizzle-orm";
import { schema, type Db } from "@sala/database";
import { DB } from "../database/database.module.js";
import { env } from "../env.js";
import { renderEmail } from "./email-render.js";
import { RESEND_CLIENT, ResendError, type ResendClient, type ResendMessage } from "./resend.client.js";
import { blockingRestrictions } from "./email-recipients.js";
import { unsubscribeUrls } from "./unsubscribe-token.js";

const SWEEP_INTERVAL_MS = 30_000;
const BATCH_SIZE = 100;
/** A claimed-but-unfinished delivery is reclaimable after this long (crashed instance, 5xx retry). */
const LEASE_MS = 10 * 60_000;
const MAX_ATTEMPTS = 3;

/**
 * Delivers pending campaign rows. Rows are claimed with a lease (`claimed_at`, `attempts`) via
 * `FOR UPDATE SKIP LOCKED`, so overlapping sweeps/instances never send the same row twice. 429/5xx
 * leaves rows pending (the lease expiry is the backoff) until `MAX_ATTEMPTS`; anything else fails them.
 * Does nothing unless Resend is configured, and only ever sees campaigns an admin confirmed (`sending`).
 */
@Injectable()
export class EmailSendJob {
  private readonly logger = new Logger(EmailSendJob.name);

  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(RESEND_CLIENT) private readonly client: ResendClient | null,
  ) {}

  @Interval(SWEEP_INTERVAL_MS)
  async tick(): Promise<void> {
    try {
      await this.runSweep(new Date());
    } catch (err) {
      this.logger.error("Email send sweep failed", err instanceof Error ? err.stack : String(err));
    }
  }

  /** Exposed for tests: claims up to one batch, sends it, closes finished campaigns; returns rows claimed. */
  async runSweep(now: Date = new Date()): Promise<number> {
    if (!this.client) return 0;
    const claimed = await this.claim(now);

    const byCampaign = new Map<string, typeof claimed>();
    for (const row of claimed) byCampaign.set(row.campaignId, [...(byCampaign.get(row.campaignId) ?? []), row]);
    for (const [campaignId, rows] of byCampaign) {
      try {
        await this.sendCampaignRows(this.client, campaignId, rows, now);
      } catch (err) {
        this.logger.error(`Email campaign ${campaignId} batch failed`, err instanceof Error ? err.stack : String(err));
      }
    }

    await this.closeFinishedCampaigns(now);
    return claimed.length;
  }

  private async claim(now: Date) {
    const leaseExpired = new Date(now.getTime() - LEASE_MS);
    const claimable = and(
      eq(schema.emailCampaignDeliveries.status, "pending"),
      or(isNull(schema.emailCampaignDeliveries.claimedAt), lt(schema.emailCampaignDeliveries.claimedAt, leaseExpired)),
    );
    const ids = this.db
      .select({ id: schema.emailCampaignDeliveries.id })
      .from(schema.emailCampaignDeliveries)
      .innerJoin(schema.emailCampaigns, eq(schema.emailCampaigns.id, schema.emailCampaignDeliveries.campaignId))
      .where(and(eq(schema.emailCampaigns.status, "sending"), claimable))
      .orderBy(schema.emailCampaignDeliveries.createdAt)
      .limit(BATCH_SIZE)
      .for("update", { of: schema.emailCampaignDeliveries, skipLocked: true });

    return this.db
      .update(schema.emailCampaignDeliveries)
      .set({ claimedAt: now, attempts: sql`${schema.emailCampaignDeliveries.attempts} + 1` })
      // Re-checking `claimable` makes a racing claimer that waited on a row lock back off.
      .where(and(inArray(schema.emailCampaignDeliveries.id, ids), claimable))
      .returning({
        id: schema.emailCampaignDeliveries.id,
        campaignId: schema.emailCampaignDeliveries.campaignId,
        userId: schema.emailCampaignDeliveries.userId,
        attempts: schema.emailCampaignDeliveries.attempts,
      });
  }

  private async sendCampaignRows(
    client: ResendClient,
    campaignId: string,
    rows: { id: string; userId: string; attempts: number }[],
    now: Date,
  ): Promise<void> {
    const [campaign] = await this.db.select().from(schema.emailCampaigns).where(eq(schema.emailCampaigns.id, campaignId)).limit(1);
    if (!campaign) return;

    const users = await this.db
      .select({
        id: schema.user.id,
        email: schema.user.email,
        emailVerified: schema.user.emailVerified,
        restricted: exists(blockingRestrictions(this.db, now)),
        optedOut: sql<boolean>`exists (select 1 from ${schema.notificationPreferences} np where np.user_id = ${schema.user.id} and np.marketing_emails = false)`,
      })
      .from(schema.user)
      .where(
        inArray(
          schema.user.id,
          rows.map((r) => r.userId),
        ),
      );
    const userById = new Map(users.map((u) => [u.id, u]));

    const sendable: { id: string; attempts: number; message: ResendMessage }[] = [];
    const skipped: { id: string; error: string }[] = [];
    for (const row of rows) {
      const u = userById.get(row.userId);
      if (!u) {
        skipped.push({ id: row.id, error: "user_missing" });
      } else if (!u.emailVerified || u.restricted) {
        skipped.push({ id: row.id, error: "ineligible" });
      } else if (u.optedOut) {
        skipped.push({ id: row.id, error: "opted_out" });
      } else {
        const urls = unsubscribeUrls(u.id);
        const { text, html } = renderEmail(campaign.bodyText, urls.page);
        sendable.push({
          id: row.id,
          attempts: row.attempts,
          message: {
            from: env.emailFrom,
            to: [u.email],
            subject: campaign.subject,
            text,
            html,
            headers: { "List-Unsubscribe": `<${urls.oneClick}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
          },
        });
      }
    }

    for (const s of skipped) {
      await this.db
        .update(schema.emailCampaignDeliveries)
        .set({ status: "failed", error: s.error })
        .where(and(eq(schema.emailCampaignDeliveries.id, s.id), eq(schema.emailCampaignDeliveries.status, "pending")));
    }
    if (sendable.length === 0) return;

    try {
      const messageIds = await client.sendBatch(sendable.map((s) => s.message));
      for (const [i, s] of sendable.entries()) {
        await this.db
          .update(schema.emailCampaignDeliveries)
          .set({ status: "sent", sentAt: now, providerMessageId: messageIds[i] ?? null, error: null })
          .where(eq(schema.emailCampaignDeliveries.id, s.id));
      }
    } catch (err) {
      const message = (err instanceof Error ? err.message : String(err)).slice(0, 500);
      const retryable = err instanceof ResendError && (err.status === 429 || err.status >= 500);
      const exhausted = sendable.filter((s) => !retryable || s.attempts >= MAX_ATTEMPTS).map((s) => s.id);
      const retrying = sendable.filter((s) => retryable && s.attempts < MAX_ATTEMPTS).map((s) => s.id);
      if (exhausted.length > 0) {
        await this.db.update(schema.emailCampaignDeliveries).set({ status: "failed", error: message }).where(inArray(schema.emailCampaignDeliveries.id, exhausted));
      }
      if (retrying.length > 0) {
        await this.db.update(schema.emailCampaignDeliveries).set({ error: message }).where(inArray(schema.emailCampaignDeliveries.id, retrying));
      }
    }
  }

  private async closeFinishedCampaigns(now: Date): Promise<void> {
    await this.db
      .update(schema.emailCampaigns)
      .set({ status: "sent", sentAt: now })
      .where(
        and(
          eq(schema.emailCampaigns.status, "sending"),
          notExists(
            this.db
              .select({ one: sql`1` })
              .from(schema.emailCampaignDeliveries)
              .where(and(eq(schema.emailCampaignDeliveries.campaignId, schema.emailCampaigns.id), eq(schema.emailCampaignDeliveries.status, "pending"))),
          ),
        ),
      );
  }
}
