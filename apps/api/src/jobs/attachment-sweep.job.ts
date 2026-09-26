import { Inject, Injectable } from "@nestjs/common";
import { Interval } from "@nestjs/schedule";
import { and, eq, lt } from "drizzle-orm";
import { schema, type Db } from "@uns/database";
import { DB } from "../database/database.module.js";
import { StorageService } from "../storage/storage.service.js";

const SWEEP_INTERVAL_MS = 60 * 60 * 1000; // hourly
const PENDING_MAX_AGE_MS = 60 * 60 * 1000; // 1 hour

/** Deletes report-evidence attachments that were presigned but never completed — they'd otherwise
 *  linger as orphaned objects (and rows) forever. Only runs when R2 storage is configured. */
@Injectable()
export class AttachmentSweepJob {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(StorageService) private readonly storage: StorageService,
  ) {}

  @Interval(SWEEP_INTERVAL_MS)
  async tick(): Promise<void> {
    await this.runSweep(new Date());
  }

  /** Exposed for tests: deletes PENDING attachments older than `PENDING_MAX_AGE_MS` as of `now`. */
  async runSweep(now: Date = new Date()): Promise<number> {
    if (!this.storage.isEnabled()) return 0;

    const cutoff = new Date(now.getTime() - PENDING_MAX_AGE_MS);
    const stale = await this.db
      .select()
      .from(schema.userReportAttachments)
      .where(and(eq(schema.userReportAttachments.status, "PENDING"), lt(schema.userReportAttachments.createdAt, cutoff)));

    for (const attachment of stale) {
      await this.storage.deleteObject(attachment.objectKey);
      await this.db.delete(schema.userReportAttachments).where(eq(schema.userReportAttachments.id, attachment.id));
    }

    return stale.length;
  }
}
