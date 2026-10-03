import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { schema, type Db } from "@sala/database";
import { freshDb, insertUsers } from "../test-utils.js";
import { env } from "../env.js";
import { EmailCampaignsService } from "./email-campaigns.service.js";
import { EmailSendJob } from "./email-send.job.js";
import { ResendError, type ResendClient, type ResendMessage } from "./resend.client.js";

class FakeResend {
  calls: ResendMessage[][] = [];
  failWith: Error | null = null;
  async sendBatch(msgs: ResendMessage[]): Promise<string[]> {
    this.calls.push(msgs);
    // Yield so concurrent sweeps genuinely interleave.
    await new Promise((r) => setTimeout(r, 5));
    if (this.failWith) throw this.failWith;
    return msgs.map((_, i) => `msg-${this.calls.length}-${i}`);
  }
}

const T0 = new Date("2026-10-03T12:00:00Z");
const minutes = (n: number) => new Date(T0.getTime() + n * 60_000);

describe("EmailSendJob", () => {
  let db: Db;
  let fake: FakeResend;
  let job: EmailSendJob;
  let campaignId: string;
  const saved = { key: env.resendApiKey, from: env.emailFrom };

  beforeEach(async () => {
    db = await freshDb();
    env.resendApiKey = "re_test";
    env.emailFrom = "Sala <hola@example.test>";
    fake = new FakeResend();
    job = new EmailSendJob(db, fake as unknown as ResendClient);
    await insertUsers(db, ["admin1", "u1", "u2", "u3"]);
    for (const id of ["u1", "u2", "u3"]) await db.update(schema.user).set({ emailVerified: true }).where(eq(schema.user.id, id));
    const svc = new EmailCampaignsService(db);
    const c = await svc.create({ subject: "Hola", bodyText: "Visitá https://sala-de-estudio.fly.dev" }, "admin1");
    await svc.send(c.id, "admin1");
    campaignId = c.id;
  });

  afterEach(() => {
    env.resendApiKey = saved.key;
    env.emailFrom = saved.from;
  });

  const deliveries = () => db.select().from(schema.emailCampaignDeliveries);
  const campaign = async () => (await db.select().from(schema.emailCampaigns).where(eq(schema.emailCampaigns.id, campaignId)))[0]!;

  it("sends every row once with unsubscribe headers and marks the campaign sent", async () => {
    await job.runSweep(T0);
    const rows = await deliveries();
    expect(rows.every((r) => r.status === "sent" && r.providerMessageId && r.sentAt)).toBe(true);
    const msgs = fake.calls.flat();
    expect(msgs).toHaveLength(3);
    expect(msgs[0]!.headers["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
    expect(msgs[0]!.headers["List-Unsubscribe"]).toMatch(/^<.*\/api\/v1\/email\/unsubscribe\?u=.*&t=.*>$/);
    const c = await campaign();
    expect(c.status).toBe("sent");
    expect(c.sentAt).not.toBeNull();
  });

  it("two concurrent sweeps send each row exactly once", async () => {
    await Promise.all([job.runSweep(T0), job.runSweep(T0)]);
    expect(fake.calls.flat()).toHaveLength(3);
    expect((await deliveries()).filter((r) => r.status === "sent")).toHaveLength(3);
  });

  it("5xx leaves rows pending for retry after the lease, then fails them at 3 attempts", async () => {
    fake.failWith = new ResendError(503, "down");
    await job.runSweep(T0);
    expect((await deliveries()).every((r) => r.status === "pending" && r.attempts === 1)).toBe(true);

    // Lease still held: nothing is claimed.
    expect(await job.runSweep(minutes(5))).toBe(0);

    await job.runSweep(minutes(11));
    expect((await deliveries()).every((r) => r.status === "pending" && r.attempts === 2)).toBe(true);

    await job.runSweep(minutes(22));
    const rows = await deliveries();
    expect(rows.every((r) => r.status === "failed" && r.attempts === 3 && r.error?.includes("down"))).toBe(true);
    expect((await campaign()).status).toBe("sent");
  });

  it("a non-retryable error fails the rows immediately", async () => {
    fake.failWith = new ResendError(422, "bad address");
    await job.runSweep(T0);
    expect((await deliveries()).every((r) => r.status === "failed" && r.attempts === 1)).toBe(true);
  });

  it("a user who opted out after the send was confirmed is skipped", async () => {
    await db.insert(schema.notificationPreferences).values({ userId: "u2", marketingEmails: false });
    await job.runSweep(T0);
    const rows = await deliveries();
    const u2 = rows.find((r) => r.userId === "u2")!;
    expect(u2).toMatchObject({ status: "failed", error: "opted_out" });
    expect(rows.filter((r) => r.status === "sent")).toHaveLength(2);
    expect(fake.calls.flat().map((m) => m.to[0])).not.toContain("u2@example.test");
  });

  it("a user who became unverified or banned after the send was confirmed is skipped as ineligible", async () => {
    await db.update(schema.user).set({ emailVerified: false }).where(eq(schema.user.id, "u1"));
    await db.insert(schema.userRestrictions).values({ userId: "u2", type: "BANNED", reason: "x" });
    await job.runSweep(T0);
    const rows = await deliveries();
    expect(rows.find((r) => r.userId === "u1")).toMatchObject({ status: "failed", error: "ineligible" });
    expect(rows.find((r) => r.userId === "u2")).toMatchObject({ status: "failed", error: "ineligible" });
    expect(rows.find((r) => r.userId === "u3")).toMatchObject({ status: "sent" });
    expect(fake.calls.flat().map((m) => m.to[0])).toEqual(["u3@example.test"]);
  });

  it("does nothing when Resend is not configured", async () => {
    const disabled = new EmailSendJob(db, null);
    expect(await disabled.runSweep(T0)).toBe(0);
    expect((await deliveries()).every((r) => r.status === "pending")).toBe(true);
  });
});
