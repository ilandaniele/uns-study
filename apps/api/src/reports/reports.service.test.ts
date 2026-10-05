import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Db } from "@sala/database";
import { schema } from "@sala/database";
import { eq } from "drizzle-orm";
import { freshDb, getRoom, insertUsers } from "../test-utils.js";
import { RateLimitService } from "../security/rate-limit.service.js";
import { RestrictionService } from "../users/restriction.service.js";
import { RolesService } from "../users/roles.service.js";
import type { StorageService } from "../storage/storage.service.js";
import { ReportsService } from "./reports.service.js";

function fakeStorage(overrides: Partial<StorageService> = {}): StorageService {
  return {
    isEnabled: () => true,
    presignPut: vi.fn(async (contentType: string) => ({
      objectKey: `evidence/fake-${Math.random().toString(36).slice(2)}`,
      uploadUrl: "https://signed.example/put",
      headers: { "Content-Type": contentType },
      expiresAt: new Date(Date.now() + 5 * 60_000).toISOString(),
    })),
    presignGet: vi.fn(async () => "https://signed.example/get"),
    head: vi.fn(async () => ({ contentType: "image/jpeg", contentLength: 1000 })),
    deleteObject: vi.fn(async () => undefined),
    ...overrides,
  } as unknown as StorageService;
}

describe("ReportsService", () => {
  let db: Db;
  let rateLimit: RateLimitService;
  let roles: RolesService;
  let restrictions: RestrictionService;

  beforeEach(async () => {
    db = await freshDb();
    await insertUsers(db, ["reporter", "reported", "mod"]);
    rateLimit = new RateLimitService();
    roles = new RolesService(db);
    restrictions = new RestrictionService(db);
    await db.insert(schema.userRoles).values({ userId: "mod", role: "ADMIN" });
  });

  it("creates a report", async () => {
    const svc = new ReportsService(db, rateLimit, restrictions, roles, fakeStorage());
    const created = await svc.createReport({ reporterId: "reporter", reportedUserId: "reported", reason: "SPAM", context: "PROFILE" });
    expect(created.status).toBe("OPEN");

    const [row] = await db.select().from(schema.userReports).where(eq(schema.userReports.id, created.id));
    expect(row?.reporterId).toBe("reporter");
  });

  it("rejects a report from a suspended reporter", async () => {
    await db.insert(schema.userRestrictions).values({ userId: "reporter", type: "SUSPENDED", reason: "test" });
    const svc = new ReportsService(db, rateLimit, restrictions, roles, fakeStorage());
    await expect(
      svc.createReport({ reporterId: "reporter", reportedUserId: "reported", reason: "SPAM", context: "PROFILE" }),
    ).rejects.toMatchObject({ code: "RESTRICTED" });
  });

  it("rejects reporting yourself", async () => {
    const svc = new ReportsService(db, rateLimit, restrictions, roles, fakeStorage());
    await expect(svc.createReport({ reporterId: "reporter", reportedUserId: "reporter", reason: "SPAM", context: "PROFILE" })).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
    });
  });

  it("rejects reporting a nonexistent user with 404", async () => {
    const svc = new ReportsService(db, rateLimit, restrictions, roles, fakeStorage());
    await expect(
      svc.createReport({ reporterId: "reporter", reportedUserId: "ghost", reason: "SPAM", context: "PROFILE" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("rejects a report with a roomId that doesn't exist", async () => {
    const svc = new ReportsService(db, rateLimit, restrictions, roles, fakeStorage());
    await expect(
      svc.createReport({
        reporterId: "reporter",
        reportedUserId: "reported",
        reason: "SPAM",
        context: "PROFILE",
        roomId: "00000000-0000-0000-0000-000000000000",
      }),
    ).rejects.toMatchObject({ code: "SEAT_NOT_FOUND" });
  });

  it("accepts a report with a valid roomId", async () => {
    const room = await getRoom(db);
    const svc = new ReportsService(db, rateLimit, restrictions, roles, fakeStorage());
    await expect(
      svc.createReport({ reporterId: "reporter", reportedUserId: "reported", reason: "SPAM", context: "PROFILE", roomId: room.id }),
    ).resolves.toMatchObject({ status: "OPEN" });
  });

  it("rejects a CHAT report whose contextMessageId doesn't exist or wasn't authored by the reported user", async () => {
    const room = await getRoom(db);
    const [chatRoom] = await db.insert(schema.chatRooms).values({ roomId: room.id, slug: "principal", name: "Principal" }).returning();
    const [message] = await db.insert(schema.chatMessages).values({ chatRoomId: chatRoom!.id, userId: "reporter", content: "hola" }).returning();

    const svc = new ReportsService(db, rateLimit, restrictions, roles, fakeStorage());
    await expect(
      svc.createReport({
        reporterId: "reporter",
        reportedUserId: "reported",
        reason: "OFFENSIVE_CONTENT",
        context: "CHAT",
        contextMessageId: message!.id,
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("accepts a CHAT report whose contextMessageId was authored by the reported user", async () => {
    const room = await getRoom(db);
    const [chatRoom] = await db.insert(schema.chatRooms).values({ roomId: room.id, slug: "principal", name: "Principal" }).returning();
    const [message] = await db.insert(schema.chatMessages).values({ chatRoomId: chatRoom!.id, userId: "reported", content: "hola" }).returning();

    const svc = new ReportsService(db, rateLimit, restrictions, roles, fakeStorage());
    await expect(
      svc.createReport({
        reporterId: "reporter",
        reportedUserId: "reported",
        reason: "OFFENSIVE_CONTENT",
        context: "CHAT",
        contextMessageId: message!.id,
      }),
    ).resolves.toMatchObject({ status: "OPEN" });
  });

  it("rejects a DM report whose contextMessageId wasn't sent by the reported user", async () => {
    const [conversation] = await db.insert(schema.directConversations).values({ userA: "reported", userB: "reporter" }).returning();
    const [message] = await db.insert(schema.directMessages).values({ conversationId: conversation!.id, senderId: "reporter", content: "hola" }).returning();

    const svc = new ReportsService(db, rateLimit, restrictions, roles, fakeStorage());
    await expect(
      svc.createReport({
        reporterId: "reporter",
        reportedUserId: "reported",
        reason: "HARASSMENT",
        context: "DM",
        contextMessageId: message!.id,
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("rejects a DM report citing a message from a conversation the reporter isn't in", async () => {
    await insertUsers(db, ["other"]);
    const [conversation] = await db.insert(schema.directConversations).values({ userA: "other", userB: "reported" }).returning();
    const [message] = await db.insert(schema.directMessages).values({ conversationId: conversation!.id, senderId: "reported", content: "hola" }).returning();

    const svc = new ReportsService(db, rateLimit, restrictions, roles, fakeStorage());
    const input = { reporterId: "reporter", reportedUserId: "reported", reason: "HARASSMENT" as const, context: "DM" as const, contextMessageId: message!.id };
    await expect(svc.createReport(input)).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    await expect(svc.createReport({ ...input, reporterId: "other" })).resolves.toMatchObject({ status: "OPEN" });
  });

  it("resolves the reported user from a CHAT message when given the message-author placeholder", async () => {
    const room = await getRoom(db);
    const [chatRoom] = await db.insert(schema.chatRooms).values({ roomId: room.id, slug: "principal", name: "Principal" }).returning();
    const [message] = await db.insert(schema.chatMessages).values({ chatRoomId: chatRoom!.id, userId: "reported", content: "hola" }).returning();

    const svc = new ReportsService(db, rateLimit, restrictions, roles, fakeStorage());
    const created = await svc.createReport({ reporterId: "reporter", reportedUserId: "message-author", reason: "SPAM", context: "CHAT", contextMessageId: message!.id });
    const [row] = await db.select().from(schema.userReports).where(eq(schema.userReports.id, created.id));
    expect(row?.reportedUserId).toBe("reported");
    await expect(svc.createReport({ reporterId: "reporter", reportedUserId: "message-author", reason: "SPAM", context: "PROFILE" })).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("enforces a 5/day cap for non-admins", async () => {
    const svc = new ReportsService(db, rateLimit, restrictions, roles, fakeStorage());
    for (let i = 0; i < 5; i++) {
      await insertUsers(db, [`target${i}`]);
      await svc.createReport({ reporterId: "reporter", reportedUserId: `target${i}`, reason: "SPAM", context: "PROFILE" });
    }
    await insertUsers(db, ["target5"]);
    await expect(svc.createReport({ reporterId: "reporter", reportedUserId: "target5", reason: "SPAM", context: "PROFILE" })).rejects.toMatchObject({
      code: "RATE_LIMITED",
    });
  });

  it("does not cap admins/moderators", async () => {
    const svc = new ReportsService(db, rateLimit, restrictions, roles, fakeStorage());
    for (let i = 0; i < 6; i++) {
      await insertUsers(db, [`m-target${i}`]);
      await expect(svc.createReport({ reporterId: "mod", reportedUserId: `m-target${i}`, reason: "SPAM", context: "PROFILE" })).resolves.toBeDefined();
    }
  });

  describe("attachments", () => {
    async function makeReport(svc: ReportsService) {
      return svc.createReport({ reporterId: "reporter", reportedUserId: "reported", reason: "SPAM", context: "PROFILE" });
    }

    it("only the reporter can request an upload instruction", async () => {
      const svc = new ReportsService(db, rateLimit, restrictions, roles, fakeStorage());
      const report = await makeReport(svc);
      await expect(svc.requestAttachment(report.id, "reported", "image/jpeg", 1000)).rejects.toMatchObject({ code: "NOT_FOUND" });
      await expect(svc.requestAttachment(report.id, "reporter", "image/jpeg", 1000)).resolves.toMatchObject({ method: "PUT" });
    });

    it("caps attachments at 3 per report", async () => {
      const svc = new ReportsService(db, rateLimit, restrictions, roles, fakeStorage());
      const report = await makeReport(svc);
      for (let i = 0; i < 3; i++) {
        await svc.requestAttachment(report.id, "reporter", "image/jpeg", 1000);
      }
      await expect(svc.requestAttachment(report.id, "reporter", "image/jpeg", 1000)).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    });

    it("throws STORAGE_UNAVAILABLE when storage is disabled", async () => {
      const svc = new ReportsService(db, rateLimit, restrictions, roles, fakeStorage({ isEnabled: () => false }));
      const report = await makeReport(svc);
      await expect(svc.requestAttachment(report.id, "reporter", "image/jpeg", 1000)).rejects.toMatchObject({ code: "STORAGE_UNAVAILABLE" });
    });

    it("rejects an oversized attachment", async () => {
      const svc = new ReportsService(db, rateLimit, restrictions, roles, fakeStorage());
      const report = await makeReport(svc);
      await expect(svc.requestAttachment(report.id, "reporter", "image/jpeg", 999_999_999)).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    });

    it("complete verifies via HEAD and marks the attachment UPLOADED", async () => {
      const svc = new ReportsService(db, rateLimit, restrictions, roles, fakeStorage());
      const report = await makeReport(svc);
      const instruction = await svc.requestAttachment(report.id, "reporter", "image/jpeg", 1000);
      await svc.completeAttachment(report.id, instruction.attachmentId, "reporter");

      const [row] = await db.select().from(schema.userReportAttachments).where(eq(schema.userReportAttachments.id, instruction.attachmentId));
      expect(row?.status).toBe("UPLOADED");
    });

    it("complete fails when HEAD finds nothing uploaded, and deletes the object + attachment row", async () => {
      const storage = fakeStorage({ head: vi.fn(async () => null) });
      const svc = new ReportsService(db, rateLimit, restrictions, roles, storage);
      const report = await makeReport(svc);
      const instruction = await svc.requestAttachment(report.id, "reporter", "image/jpeg", 1000);
      await expect(svc.completeAttachment(report.id, instruction.attachmentId, "reporter")).rejects.toMatchObject({ code: "VALIDATION_ERROR" });

      expect(storage.deleteObject).toHaveBeenCalled();
      const [row] = await db.select().from(schema.userReportAttachments).where(eq(schema.userReportAttachments.id, instruction.attachmentId));
      expect(row).toBeUndefined();
    });
  });
});
