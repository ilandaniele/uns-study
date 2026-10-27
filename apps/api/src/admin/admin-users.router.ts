import { Hono } from "hono";
import { adminDeleteUserSchema, moderationActionSchema } from "@sala/contracts";
import { ApiErrors } from "../common/api-error.js";
import { currentUser, type AppEnv } from "../http/context.js";
import { requireAdmin, requireAdminOnly } from "../http/guards.js";
import { reply } from "../http/reply.js";
import { zBody } from "../http/validate.js";

export const adminUsersRouter = new Hono<AppEnv>();

adminUsersRouter.get("/admin/users", requireAdmin, async (c) => {
  return reply(c, await c.var.services.adminUsers.search(c.req.query("q"), currentUser(c).id));
});

adminUsersRouter.get("/admin/users/:id", requireAdmin, async (c) => {
  return reply(c, await c.var.services.adminUsers.getById(c.req.param("id"), currentUser(c).id));
});

adminUsersRouter.post("/admin/users/:id/actions", requireAdmin, zBody(moderationActionSchema), async (c) => {
  await c.var.services.adminUsers.applyAction(currentUser(c).id, c.req.param("id"), c.req.valid("json"));
  return reply(c, { ok: true }, 201);
});

adminUsersRouter.post("/admin/users/:id/delete", requireAdminOnly, zBody(adminDeleteUserSchema), async (c) => {
  const actorId = currentUser(c).id;
  if (!(await c.var.services.roles.isOwner(actorId))) throw ApiErrors.forbidden("Solo el dueño de la app puede eliminar cuentas.");
  const limit = await c.var.services.rateLimit.check(`admin-delete:${actorId}`, 20, 86400);
  if (!limit.allowed) throw ApiErrors.rateLimited();
  await c.var.services.adminUsers.deleteUser(actorId, c.req.param("id"), c.req.valid("json").email);
  return reply(c, { ok: true });
});

adminUsersRouter.put("/admin/users/:id/admin", requireAdmin, requireAdminOnly, async (c) => {
  await c.var.services.adminUsers.setAdmin(currentUser(c).id, c.req.param("id"), true);
  return reply(c, { ok: true });
});

adminUsersRouter.delete("/admin/users/:id/admin", requireAdmin, requireAdminOnly, async (c) => {
  await c.var.services.adminUsers.setAdmin(currentUser(c).id, c.req.param("id"), false);
  return reply(c, { ok: true });
});

adminUsersRouter.put("/admin/users/:id/shield", requireAdmin, requireAdminOnly, async (c) => {
  await c.var.services.adminUsers.setShield(currentUser(c).id, c.req.param("id"), true);
  return reply(c, { ok: true });
});

adminUsersRouter.delete("/admin/users/:id/shield", requireAdmin, requireAdminOnly, async (c) => {
  await c.var.services.adminUsers.setShield(currentUser(c).id, c.req.param("id"), false);
  return reply(c, { ok: true });
});
