import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Db } from "@sala/database";
import { schema } from "@sala/database";
import { freshDb, insertUsers } from "../test-utils.js";
import type { StorageService } from "../storage/storage.service.js";
import { AttachmentSweepJob } from "./attachment-sweep.job.js";

function fakeStorage(enabled = true): StorageService {
  return { isEnabled: () => enabled, deleteObject: vi.fn(async () => undefined) } as unknown as StorageService;
}

describe("AttachmentSweepJob", () => {
  let db: Db;

  beforeEach(async () => {
    db = freshDb();
    await insertUsers(db, ["reporter", "reported"]);
    const [report] = await db
      .insert(schema.userReports)
      .values({ reporterId: "reporter", reportedUserId: "reported", reason: "SPAM", context: "PROFILE" })
      .returning();
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
    await db.insert(schema.userReportAttachments).values([
      {
        reportId: report!.id,
        objectKey: "evidence/stale",
        contentType: "image/png",
        sizeBytes: 100,
        uploadedBy: "reporter",
        status: "PENDING",
        createdAt: twoHoursAgo,
      },
      {
        reportId: report!.id,
        objectKey: "evidence/fresh-pending",
        contentType: "image/png",
        sizeBytes: 100,
        uploadedBy: "reporter",
        status: "PENDING",
      },
      {
        reportId: report!.id,
        objectKey: "evidence/stale-uploaded",
        contentType: "image/png",
        sizeBytes: 100,
        uploadedBy: "reporter",
        status: "UPLOADED",
        createdAt: twoHoursAgo,
      },
    ]);
  });

  it("does nothing when storage is disabled", async () => {
    const storage = fakeStorage(false);
    const job = new AttachmentSweepJob(db, storage);
    const deleted = await job.runSweep();
    expect(deleted).toBe(0);
    expect(storage.deleteObject).not.toHaveBeenCalled();
  });

  it("deletes only PENDING attachments older than 1 hour", async () => {
    const storage = fakeStorage(true);
    const job = new AttachmentSweepJob(db, storage);
    const deleted = await job.runSweep();

    expect(deleted).toBe(1);
    expect(storage.deleteObject).toHaveBeenCalledWith("evidence/stale");

    const remaining = await db.select().from(schema.userReportAttachments);
    expect(remaining.map((a) => a.objectKey).sort()).toEqual(["evidence/fresh-pending", "evidence/stale-uploaded"]);
  });
});
