import { eq } from "drizzle-orm";
import { env } from "../env.js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { schema, type Db } from "@sala/database";
import { freshDb, insertUsers } from "../test-utils.js";
import type { StorageService } from "../storage/storage.service.js";
import { RolesService } from "../users/roles.service.js";
import { AdminReportsService } from "./admin-reports.service.js";

describe("AdminReportsService.getAttachmentUrl", () => {
  let db: Db;
  let svc: AdminReportsService;
  let presignGet: ReturnType<typeof vi.fn>;
  let reportId: string;

  beforeEach(async () => {
    db = freshDb();
    await insertUsers(db, ["reporter", "reported", "admin", "mod", "owner"]);
    await db.insert(schema.userRoles).values([
      { userId: "admin", role: "ADMIN" },
      { userId: "mod", role: "MODERATOR" },
    ]);
    await db.update(schema.user).set({email:env.ownerEmail,emailVerified:true}).where(eq(schema.user.id,"owner"));
    await db.insert(schema.userRoles).values({userId:"owner",role:"ADMIN"});
    await db.insert(schema.userProfiles).values({userId:"reporter",firstName:"Private given name",identityMode:"HIDDEN",alias:"Alias público"});
    presignGet = vi.fn(async (key: string) => `https://r2.example/${key}`);
    svc = new AdminReportsService(db, { presignGet } as unknown as StorageService, new RolesService(db));
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

  it("returns private party data only to the superadmin; staff sees the public alias", async () => {
    const asAdmin = await svc.getById(reportId, "owner");
    expect(asAdmin.reporter?.email).toBeTruthy();
    expect(asAdmin.reported?.email).toBeTruthy();

    const ordinaryAdmin=await svc.getById(reportId,"admin");
    expect(ordinaryAdmin.reporter).toMatchObject({name:"Alias público",email:null});
    const asMod = await svc.getById(reportId, "mod");
    expect(asMod.reporter).toMatchObject({ userId: "reporter", email: null });
    expect(asMod.reported).toMatchObject({ userId: "reported", email: null });

    const listed = await svc.list(undefined, undefined, "mod");
    expect(listed.items[0]?.reporter?.email).toBeNull();
  });

  it("lists a page of reports with the right parties and attachments per report", async () => {
    await insertUsers(db, ["other"]);
    const [second] = await db
      .insert(schema.userReports)
      .values({ reporterId: "other", reportedUserId: null, reason: "SPAM", context: "PROFILE" })
      .returning();
    await addAttachment("UPLOADED", "k-first");
    await db
      .insert(schema.userReportAttachments)
      .values({ reportId: second!.id, objectKey: "k-second", contentType: "image/png", sizeBytes: 5, uploadedBy: "other", status: "PENDING" });

    const listed = await svc.list(undefined, undefined, "admin");
    expect(listed.items).toHaveLength(2);
    const first = listed.items.find((i) => i.id === reportId)!;
    const other = listed.items.find((i) => i.id === second!.id)!;
    expect(first.reporter).toMatchObject({ userId: "reporter" });
    expect(first.reported).toMatchObject({ userId: "reported" });
    expect(first.attachments).toHaveLength(1);
    expect(first.attachments[0]).toMatchObject({ status: "UPLOADED" });
    expect(other.reporter).toMatchObject({ userId: "other" });
    expect(other.reported).toBeNull();
    expect(other.attachments).toMatchObject([{ status: "PENDING", sizeBytes: 5 }]);
  });
});
