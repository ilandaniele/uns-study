import { beforeEach, describe, expect, it, vi } from "vitest";
import { schema, type Db } from "@sala/database";
import { freshDb, insertUsers } from "../test-utils.js";
import type { StorageService } from "../storage/storage.service.js";
import { AdminReportsService } from "./admin-reports.service.js";

describe("AdminReportsService.getAttachmentUrl", () => {
  let db: Db;
  let svc: AdminReportsService;
  let presignGet: ReturnType<typeof vi.fn>;
  let reportId: string;

  beforeEach(async () => {
    db = await freshDb();
    await insertUsers(db, ["reporter", "reported", "admin"]);
    presignGet = vi.fn(async (key: string) => `https://r2.example/${key}`);
    svc = new AdminReportsService(db, { presignGet } as unknown as StorageService);
    const [report] = await db
      .insert(schema.userReports)
      .values({ reporterId: "reporter", reportedUserId: "reported", reason: "SPAM", context: "PROFILE" })
      .returning();
    reportId = report!.id;
  });

  async function addAttachment(status: "PENDING" | "UPLOADED", key: string) {
    const [row] = await db
      .insert(schema.userReportAttachments)
      .values({ reportId, objectKey: key, contentType: "image/png", sizeBytes: 10, uploadedBy: "reporter", status })
      .returning();
    return row!.id;
  }

  it("presigns an UPLOADED attachment and audits the access", async () => {
    const id = await addAttachment("UPLOADED", "k1");
    await expect(svc.getAttachmentUrl(reportId, id, "admin")).resolves.toBe("https://r2.example/k1");
    const actions = await db.select().from(schema.moderationActions);
    expect(actions.some((a) => a.action === "REPORT_ATTACHMENT_VIEWED")).toBe(true);
  });

  it("returns NOT_FOUND and never presigns a PENDING attachment", async () => {
    const id = await addAttachment("PENDING", "k2");
    await expect(svc.getAttachmentUrl(reportId, id, "admin")).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(presignGet).not.toHaveBeenCalled();
  });
});
