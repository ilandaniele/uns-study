import { Hono } from "hono";
import { proposeTableNameSchema } from "@sala/contracts";
import { ApiErrors } from "../common/api-error.js";
import type { AppEnv } from "../http/context.js";
import { currentUser } from "../http/context.js";
import { optionalAuth, requireAuth } from "../http/guards.js";
import { reply } from "../http/reply.js";
import { uuidParam, zBody } from "../http/validate.js";

/** Public read (personalized with `myVote`/`mine` when a session is present); proposing and voting require auth. */
export const tableNamesRouter = new Hono<AppEnv>();

tableNamesRouter.get("/tables/:tableId/names", optionalAuth, uuidParam("tableId"), async (c) => {
  const { services, user } = c.var;
  return reply(c, await services.tableNames.listForTable(c.req.param("tableId"), user?.id ?? null));
});

tableNamesRouter.post("/tables/:tableId/names", requireAuth(), uuidParam("tableId"), zBody(proposeTableNameSchema), async (c) => {
  const { services } = c.var;
  const user = currentUser(c);
  const body = c.req.valid("json");
  const limit = await services.rateLimit.check(`table-name:propose:${user.id}`, 5, 3600);
  if (!limit.allowed) throw ApiErrors.rateLimited();
  return reply(c, await services.tableNames.propose(c.req.param("tableId"), user.id, body.name), 201);
});

tableNamesRouter.post("/names/:proposalId/vote", requireAuth(), uuidParam("proposalId"), async (c) => {
  const { services } = c.var;
  const user = currentUser(c);
  const limit = await services.rateLimit.check(`table-name:vote:${user.id}`, 30, 600);
  if (!limit.allowed) throw ApiErrors.rateLimited();
  return reply(c, await services.tableNames.vote(c.req.param("proposalId"), user.id), 201);
});

tableNamesRouter.delete("/names/:proposalId/vote", requireAuth(), uuidParam("proposalId"), async (c) => {
  const { services } = c.var;
  const user = currentUser(c);
  const limit = await services.rateLimit.check(`table-name:vote:${user.id}`, 30, 600);
  if (!limit.allowed) throw ApiErrors.rateLimited();
  return reply(c, await services.tableNames.removeVote(c.req.param("proposalId"), user.id));
});
