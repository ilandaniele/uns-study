import { and, eq, lt } from "drizzle-orm";
import { schema, type Db } from "@sala/database";
import type { StorageService } from "../storage/storage.service.js";

const PENDING_MAX_AGE_MS = 60 * 60 * 1000; // 1 hour

/** Deletes report-evidence attachments that were presigned but never completed — they'd otherwise
 *  linger as orphaned objects (and rows) forever. Only runs when R2 storage is configured. */
export class AttachmentSweepJob {
  constructor(
    private readonly db: Db,
    private readonly storage: StorageService,
  ) {}

  /** Scheduler entry point (`attachment-sweep`, hourly). */
  async tick(): Promise<void> {
    await this.runSweep(new Date());
  }

  /** Exposed for tests: deletes PENDING attachments older than `PENDING_MAX_AGE_MS` as of `now`. */
  async runSweep(now: Date = new Date()): Promise<number> {
    if (!this.storage.isEnabled()) return 0;

    const cutoff = new Date(now.getTime() - PENDING_MAX_AGE_MS);
    const stale = this.db
      .select()
      .from(schema.userReportAttachments)
      .where(and(eq(schema.userReportAttachments.status, "PENDING"), lt(schema.userReportAttachments.createdAt, cutoff)))
      .all();

    for (const attachment of stale) {
      await this.storage.deleteObject(attachment.objectKey);
      this.db.delete(schema.userReportAttachments).where(eq(schema.userReportAttachments.id, attachment.id)).run();
    }

    return stale.length;
  }
}
