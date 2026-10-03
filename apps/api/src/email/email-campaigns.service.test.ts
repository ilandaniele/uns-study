import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { schema, type Db } from "@sala/database";
import { freshDb, insertUsers } from "../test-utils.js";
import { env } from "../env.js";
import { EmailCampaignsService } from "./email-campaigns.service.js";

describe("EmailCampaignsService", () => {
  let db: Db;
  let svc: EmailCampaignsService;
  const saved = { key: env.resendApiKey, from: env.emailFrom };

  beforeEach(async () => {
    db = await freshDb();
    svc = new EmailCampaignsService(db);
    env.resendApiKey = "re_test";
    env.emailFrom = "Sala <hola@example.test>";
    await insertUsers(db, ["admin1", "u1", "u2", "u3"]);
    for (const id of ["u1", "u2", "u3"]) await db.update(schema.user).set({ emailVerified: true }).where(eq(schema.user.id, id));
    await db.insert(schema.notificationPreferences).values({ userId: "u3", marketingEmails: false });
  });

  afterEach(() => {
    env.resendApiKey = saved.key;
    env.emailFrom = saved.from;
  });

  it("create makes a draft and audits it", async () => {
    const c = await svc.create({ subject: "Hola", bodyText: "Chau" }, "admin1");
    expect(c.status).toBe("draft");
    const actions = await db.select().from(schema.moderationActions);
    expect(actions.map((a) => a.action)).toEqual(["EMAIL_CAMPAIGN_CREATED"]);
  });

  it("send enqueues one pending delivery per recipient and flips to sending", async () => {
    const c = await svc.create({ subject: "Hola", bodyText: "Chau" }, "admin1");
    const sent = await svc.send(c.id, "admin1");
    expect(sent.status).toBe("sending");
    expect(sent.recipientCount).toBe(2);
    const deliveries = await db.select().from(schema.emailCampaignDeliveries);
    expect(deliveries.map((d) => d.userId).sort()).toEqual(["u1", "u2"]);
    expect(deliveries.every((d) => d.status === "pending")).toBe(true);
    const actions = await db.select().from(schema.moderationActions).where(eq(schema.moderationActions.action, "EMAIL_CAMPAIGN_SENT"));
    expect(actions).toHaveLength(1);
  });

  it("send is idempotent: a second send is rejected and adds no rows", async () => {
    const c = await svc.create({ subject: "Hola", bodyText: "Chau" }, "admin1");
    await svc.send(c.id, "admin1");
    await expect(svc.send(c.id, "admin1")).rejects.toMatchObject({ status: 409 });
    expect(await db.select().from(schema.emailCampaignDeliveries)).toHaveLength(2);
    expect(await db.select().from(schema.moderationActions).where(eq(schema.moderationActions.action, "EMAIL_CAMPAIGN_SENT"))).toHaveLength(1);
  });

  it("update works on drafts and is rejected after send", async () => {
    const c = await svc.create({ subject: "Hola", bodyText: "Chau" }, "admin1");
    expect((await svc.update(c.id, { subject: "Nuevo" })).subject).toBe("Nuevo");
    await svc.send(c.id, "admin1");
    await expect(svc.update(c.id, { subject: "Tarde" })).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("send throws featureDisabled without Resend config and leaves the draft untouched", async () => {
    const c = await svc.create({ subject: "Hola", bodyText: "Chau" }, "admin1");
    env.resendApiKey = "";
    expect(svc.config()).toEqual({ enabled: false });
    await expect(svc.send(c.id, "admin1")).rejects.toMatchObject({ status: 503 });
    const [row] = await db.select().from(schema.emailCampaigns).where(eq(schema.emailCampaigns.id, c.id));
    expect(row?.status).toBe("draft");
    expect(await db.select().from(schema.emailCampaignDeliveries)).toHaveLength(0);
  });

  it("list reports counts per status", async () => {
    const c = await svc.create({ subject: "Hola", bodyText: "Chau" }, "admin1");
    await svc.send(c.id, "admin1");
    const [dto] = await svc.list();
    expect(dto).toMatchObject({ pendingCount: 2, sentCount: 0, failedCount: 0, recipientCount: 2 });
  });
});
