import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import type { ResendMessage } from "../email/resend.client.js";
import { schema, type Db } from "@sala/database";
import { FixedClock } from "../platform/clock.js";
import { freshDb, insertUsers } from "../test-utils.js";
import { FeedbackService, type CreateFeedbackInput } from "./feedback.service.js";

const MAIL = { adminEmails: ["admin@example.test"], ownerEmail: "owner@example.test", emailFrom: "Sala <no-reply@example.test>" };

const base: CreateFeedbackInput = {
  userId: null,
  accountEmail: null,
  accountEmailVerified: false,
  accountName: null,
  category: "SUGGESTION",
  message: "Más enchufes, por favor",
  ipHash: "hash",
};

describe("FeedbackService", () => {
  let db: Db;
  let clock: FixedClock;
  let sendBatch: Mock<(msgs: ResendMessage[]) => Promise<string[]>>;

  const build = (opts: { resend?: boolean; mail?: Partial<typeof MAIL> } = {}) =>
    new FeedbackService(db, clock, opts.resend === false ? null : { sendBatch }, { ...MAIL, ...opts.mail });
  const rows = () => db.select().from(schema.feedback);

  beforeEach(async () => {
    db = freshDb();
    clock = new FixedClock(new Date("2026-03-01T12:00:00Z"));
    sendBatch = vi.fn(async () => ["id"]);
    await insertUsers(db, ["u1"]);
  });

  describe("create", () => {
    it("stores one OPEN row with the typed email as contact", async () => {
      const { id } = await build().create({ ...base, email: "typed@example.test" });
      const all = await rows();
      expect(all).toHaveLength(1);
      expect(all[0]).toMatchObject({ id, status: "OPEN", contactEmail: "typed@example.test", userId: null, ipHash: "hash" });
      expect(all[0]!.createdAt).toEqual(clock.now());
    });

    it("falls back to a verified account email, never an unverified one", async () => {
      const svc = build();
      await svc.create({ ...base, userId: "u1", accountEmail: "acc@example.test", accountEmailVerified: true });
      await svc.create({ ...base, userId: "u1", accountEmail: "acc@example.test", accountEmailVerified: false });
      await svc.create({ ...base, userId: "u1", accountEmail: "acc@example.test", accountEmailVerified: true, email: "typed@example.test" });
      expect((await rows()).map((r) => r.contactEmail ?? "-").sort()).toEqual(["-", "acc@example.test", "typed@example.test"]);
    });
  });

  describe("admin email", () => {
    it("sends one message to the admins with escaped content", async () => {
      await build().create({ ...base, message: "<script>alert(1)</script>\nlinea 2", email: "typed@example.test", accountName: "Ana <b>" });
      expect(sendBatch).toHaveBeenCalledTimes(1);
      const msg = sendBatch.mock.calls[0]![0][0]!;
      expect(msg).toMatchObject({
        from: MAIL.emailFrom,
        to: ["admin@example.test"],
        subject: "Nueva sugerencia: Sugerencia",
        headers: { "Reply-To": "typed@example.test" },
      });
      expect(msg.subject).not.toMatch(/[\r\n]/);
      expect(msg.html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;<br>linea 2");
      expect(msg.html).toContain("Ana &lt;b&gt;");
      expect(msg.html).not.toContain("<script>");
      expect(msg.text).toContain("<script>alert(1)</script>");
    });

    it("falls back to the owner when no admin emails are configured", async () => {
      await build({ mail: { adminEmails: [] } }).create(base);
      expect(sendBatch.mock.calls[0]![0][0]!.to).toEqual(["owner@example.test"]);
    });

    it("is skipped without a client, a sender or recipients, and the row is still stored", async () => {
      await build({ resend: false }).create(base);
      await build({ mail: { emailFrom: "" } }).create(base);
      await build({ mail: { adminEmails: [], ownerEmail: "" } }).create(base);
      expect(sendBatch).not.toHaveBeenCalled();
      expect(await rows()).toHaveLength(3);
    });

    it("never fails the request when sending rejects or throws", async () => {
      const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
      sendBatch.mockRejectedValueOnce(new Error("resend down"));
      await expect(build().create(base)).resolves.toHaveProperty("id");
      sendBatch.mockImplementationOnce(() => {
        throw new Error("sync boom");
      });
      await expect(build().create(base)).resolves.toHaveProperty("id");
      await Promise.resolve();
      expect(error).toHaveBeenCalled();
      expect(await rows()).toHaveLength(2);
      error.mockRestore();
    });
  });

  describe("list", () => {
    it("returns newest first with the sender name and filters by status", async () => {
      const svc = build();
      const a = await svc.create({ ...base, message: "primera", userId: "u1" });
      clock.set(new Date("2026-03-01T13:00:00Z"));
      const b = await svc.create({ ...base, message: "segunda" });
      await svc.setStatus(a.id, "RESOLVED");

      const all = await svc.list();
      expect(all.map((i) => i.id)).toEqual([b.id, a.id]);
      expect(all[0]).toMatchObject({ sender: null, contactEmail: null, createdAt: "2026-03-01T13:00:00.000Z" });
      expect(all[1]!.sender).toEqual({ userId: "u1", name: expect.any(String) });
      expect((await svc.list({ status: "OPEN" })).map((i) => i.id)).toEqual([b.id]);
      expect((await svc.list({ status: "RESOLVED" })).map((i) => i.id)).toEqual([a.id]);
    });
  });

  describe("setStatus", () => {
    it("throws NOT_FOUND for an unknown id", async () => {
      await expect(build().setStatus("00000000-0000-4000-8000-000000000000", "RESOLVED")).rejects.toMatchObject({ code: "NOT_FOUND" });
    });

    it("updates the status and skips the UPDATE when it is unchanged", async () => {
      const svc = build();
      const { id } = await svc.create(base);
      const update = vi.spyOn(db, "update");
      await expect(svc.setStatus(id, "OPEN")).resolves.toEqual({ id, status: "OPEN" });
      expect(update).not.toHaveBeenCalled();
      await svc.setStatus(id, "RESOLVED");
      expect(update).toHaveBeenCalledTimes(1);
      expect((await rows())[0]!.status).toBe("RESOLVED");
      await svc.setStatus(id, "RESOLVED");
      expect(update).toHaveBeenCalledTimes(1);
    });
  });
});
