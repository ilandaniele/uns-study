import { Hono } from "hono";
import { currentUser, type AppEnv } from "../http/context.js";
import { requireAdmin } from "../http/guards.js";
import { reply } from "../http/reply.js";
import { uuidParam } from "../http/validate.js";

export const adminNamesRouter = new Hono<AppEnv>();

// Static `tables/...` segment before the `:proposalId` one.
adminNamesRouter.delete("/admin/names/tables/:tableId/nickname", requireAdmin, uuidParam("tableId"), async (c) => {
  return reply(c, await c.var.services.tableNames.adminClearNickname(c.req.param("tableId"), currentUser(c).id));
});

adminNamesRouter.delete("/admin/names/:proposalId", requireAdmin, uuidParam("proposalId"), async (c) => {
  return reply(c, await c.var.services.tableNames.adminDeleteProposal(c.req.param("proposalId"), currentUser(c).id));
});
