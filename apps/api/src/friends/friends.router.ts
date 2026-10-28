import { Hono } from "hono";
import type { MiddlewareHandler } from "hono";
import { friendRequestSchema, friendResponseSchema, friendsListSchema, peopleSearchSchema } from "@sala/contracts";
import { ApiErrors } from "../common/api-error.js";
import { currentUser, type AppEnv } from "../http/context.js";
import { requireAuth } from "../http/guards.js";
import { reply } from "../http/reply.js";
import { uuidParam, zBody, zQuery } from "../http/validate.js";

export const friendsRouter = new Hono<AppEnv>();
const privateRead: MiddlewareHandler<AppEnv> = async (c, next) => { c.header("Cache-Control", "private, no-store"); c.header("Vary", "Cookie"); await next(); };
friendsRouter.get("/people/search", requireAuth(), privateRead, zQuery(peopleSearchSchema), async c => {
  const id = currentUser(c).id;
  if (!(await c.var.services.rateLimit.check(`people-search:${id}`, 60, 60)).allowed) throw ApiErrors.rateLimited();
  const { q, cursor } = c.req.valid("query");
  return reply(c, c.var.services.friends.search(id, q, cursor));
});
friendsRouter.get("/me/friends", requireAuth(), privateRead, zQuery(friendsListSchema), c => {
  const { view, cursor, q } = c.req.valid("query");
  return reply(c, c.var.services.friends.list(currentUser(c).id, view, cursor, q));
});
friendsRouter.post("/me/friends/state", requireAuth(), privateRead, zBody(friendRequestSchema), c => reply(c, c.var.services.friends.state(currentUser(c).id, c.req.valid("json").target)));
friendsRouter.post("/me/friends/requests", requireAuth(), privateRead, zBody(friendRequestSchema), async c => {
  const id = currentUser(c).id;
  if (!(await c.var.services.rateLimit.check(`friend-request:${id}`, 30, 3600)).allowed) throw ApiErrors.rateLimited();
  return reply(c, await c.var.services.friends.request(id, c.req.valid("json").target));
});
friendsRouter.post("/me/friends/requests/:id/respond", requireAuth(), privateRead, uuidParam("id"), zBody(friendResponseSchema), c => {
  c.var.services.friends.respond(currentUser(c).id, c.req.param("id"), c.req.valid("json").action);
  return reply(c, { ok: true });
});
friendsRouter.delete("/me/friends/:id", requireAuth(), privateRead, uuidParam("id"), c => {
  c.var.services.friends.remove(currentUser(c).id, c.req.param("id"));
  return reply(c, { ok: true });
});
friendsRouter.post("/me/friends/:id/block", requireAuth(), privateRead, uuidParam("id"), async c => {
  const id = currentUser(c).id;
  if (!(await c.var.services.rateLimit.check(`block:${id}`, 30, 3600)).allowed) throw ApiErrors.rateLimited();
  const target = c.var.services.friends.memberForBlock(id, c.req.param("id"));
  await c.var.services.blocks.block(id, target);
  return reply(c, { ok: true });
});
