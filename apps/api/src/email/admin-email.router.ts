import { Hono } from "hono";
import { emailAudienceSchema, emailCampaignInputSchema, type EmailAudience } from "@sala/contracts";
import { ApiErrors } from "../common/api-error.js";
import { currentUser, type AppEnv } from "../http/context.js";
import { requireSuperAdmin } from "../http/guards.js";
import { reply } from "../http/reply.js";
import { uuidParam, zBody } from "../http/validate.js";

/** Explicit audience without the create default, so a PATCH that omits it never resets it to "all". */
const emailCampaignPatchSchema = emailCampaignInputSchema.extend({ audience: emailAudienceSchema }).partial();

/** The `audience` query parameter of the recipient count; defaults to "all", rejects unknown values. */
export function parseAudienceQuery(value: unknown): EmailAudience {
  const result = emailAudienceSchema.default("all").safeParse(value);
  if (!result.success) throw ApiErrors.validation(result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
  return result.data;
}

/** Campaign content, recipient counts and sending are reserved to the superadmin. */
export const adminEmailRouter = new Hono<AppEnv>();

adminEmailRouter.get("/admin/email-campaigns", requireSuperAdmin, async (c) => reply(c, await c.var.services.emailCampaigns.list()));

adminEmailRouter.get("/admin/email-campaigns/config", requireSuperAdmin, (c) => reply(c, c.var.services.emailCampaigns.config()));

adminEmailRouter.get("/admin/email-campaigns/recipients/count", requireSuperAdmin, async (c) =>
  reply(c, await c.var.services.emailCampaigns.previewCount(parseAudienceQuery(c.req.query("audience")))),
);

adminEmailRouter.post("/admin/email-campaigns", requireSuperAdmin, zBody(emailCampaignInputSchema), async (c) =>
  reply(c, await c.var.services.emailCampaigns.create(c.req.valid("json"), currentUser(c).id), 201),
);

adminEmailRouter.patch("/admin/email-campaigns/:id", requireSuperAdmin, uuidParam("id"), zBody(emailCampaignPatchSchema), async (c) =>
  reply(c, await c.var.services.emailCampaigns.update(c.req.param("id"), c.req.valid("json"))),
);

/** Enqueues the campaign for delivery. The web UI only calls this after the admin confirms the recipient count. */
adminEmailRouter.post("/admin/email-campaigns/:id/send", requireSuperAdmin, uuidParam("id"), async (c) =>
  reply(c, await c.var.services.emailCampaigns.send(c.req.param("id"), currentUser(c).id), 201),
);
