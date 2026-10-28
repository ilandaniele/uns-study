import { Hono } from "hono";
import { adminDeleteUserSchema, moderationActionSchema, gardenSeedGiftSchema } from "@sala/contracts";
import { ApiErrors } from "../common/api-error.js";
import { currentUser, type AppEnv } from "../http/context.js";
import { requireAdmin, requireSuperAdmin } from "../http/guards.js";
import { reply } from "../http/reply.js";
import { zBody } from "../http/validate.js";

export const adminUsersRouter = new Hono<AppEnv>();

adminUsersRouter.get("/admin/aliases/:alias/profile", requireSuperAdmin, async c => {
  c.header("Cache-Control", "private, no-store"); c.header("Vary", "Cookie");
  return reply(c, await c.var.services.achievements.adminAliasProfile(currentUser(c).id, c.req.param("alias"), c.var.services.profiles));
});

adminUsersRouter.get("/admin/users/:id/profile", requireSuperAdmin, async (c) => {
  c.header("Cache-Control", "private, no-store");
  c.header("Vary", "Cookie");
  return reply(c, await c.var.services.profiles.getAdminProfile(currentUser(c).id, c.req.param("id")));
});

adminUsersRouter.get("/admin/users/:id/profile/avatar", requireSuperAdmin, async (c) => {
  c.header("Cache-Control", "private, no-store");
  c.header("Vary", "Cookie");
  const targetId = c.req.param("id");
  await c.var.services.profiles.authorizeAdminProfilePhoto(currentUser(c).id, targetId);
  // The dedicated permission check above authorizes this read; public avatar rules stay intact.
  const avatar = await c.var.services.avatars.getForOwner(targetId, true);
  c.header("Content-Type", avatar.mimeType);
  return c.body(new Uint8Array(avatar.bytes));
});

adminUsersRouter.get("/admin/users", requireSuperAdmin, async (c) => {
  return reply(c, await c.var.services.adminUsers.search(c.req.query("q"), currentUser(c).id));
});

adminUsersRouter.get("/admin/users/:id", requireSuperAdmin, async (c) => {
  return reply(c, await c.var.services.adminUsers.getById(c.req.param("id"), currentUser(c).id));
});

adminUsersRouter.post("/admin/users/:id/garden/seeds",requireSuperAdmin,zBody(gardenSeedGiftSchema),async c=>{
  const actorId=currentUser(c).id;
  c.header("Cache-Control","private, no-store");
  await c.var.services.antiAbuse.enforceRateLimit({key:`garden-gifts:${actorId}`,limit:30,windowSeconds:3600});
  return reply(c,await c.var.services.gardenGifts.grant(actorId,c.req.param("id"),c.req.valid("json")));
});

adminUsersRouter.post("/admin/users/:id/actions", requireAdmin, zBody(moderationActionSchema), async (c) => {
  await c.var.services.adminUsers.applyAction(currentUser(c).id, c.req.param("id"), c.req.valid("json"));
  return reply(c, { ok: true }, 201);
});

adminUsersRouter.post("/admin/users/:id/delete", requireSuperAdmin, zBody(adminDeleteUserSchema), async (c) => {
  const actorId = currentUser(c).id;
  if (!(await c.var.services.roles.isOwner(actorId))) throw ApiErrors.forbidden("Solo el dueño de la app puede eliminar cuentas.");
  const limit = await c.var.services.rateLimit.check(`admin-delete:${actorId}`, 20, 86400);
  if (!limit.allowed) throw ApiErrors.rateLimited();
  await c.var.services.adminUsers.deleteUser(actorId, c.req.param("id"), c.req.valid("json").email);
  return reply(c, { ok: true });
});

adminUsersRouter.put("/admin/users/:id/admin", requireSuperAdmin, async (c) => {
  await c.var.services.adminUsers.setAdmin(currentUser(c).id, c.req.param("id"), true);
  return reply(c, { ok: true });
});

adminUsersRouter.delete("/admin/users/:id/admin", requireSuperAdmin, async (c) => {
  await c.var.services.adminUsers.setAdmin(currentUser(c).id, c.req.param("id"), false);
  return reply(c, { ok: true });
});

adminUsersRouter.put("/admin/users/:id/shield", requireSuperAdmin, async (c) => {
  await c.var.services.adminUsers.setShield(currentUser(c).id, c.req.param("id"), true);
  return reply(c, { ok: true });
});

adminUsersRouter.delete("/admin/users/:id/shield", requireSuperAdmin, async (c) => {
  await c.var.services.adminUsers.setShield(currentUser(c).id, c.req.param("id"), false);
  return reply(c, { ok: true });
});
