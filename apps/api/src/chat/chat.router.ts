import { Hono } from "hono";
import { chatMessageSchema } from "@sala/contracts";
import { ApiErrors } from "../common/api-error.js";
import { currentUser, type AppEnv } from "../http/context.js";
import { requireAuth } from "../http/guards.js";
import { reply } from "../http/reply.js";
import { uuidParam, zBody } from "../http/validate.js";

export const chatRouter = new Hono<AppEnv>();

chatRouter.get("/rooms/:idOrSlug/messages", requireAuth(), async (c) => {
  const user = currentUser(c);
  return reply(c, await c.var.services.chat.listMessages(c.req.param("idOrSlug"), user.id, c.req.query("cursor") ?? null));
});

chatRouter.post("/rooms/:idOrSlug/messages", requireAuth(), zBody(chatMessageSchema), async (c) => {
  const user = currentUser(c);
  const { chat, rateLimit, realtime } = c.var.services;
  const limit = await rateLimit.check(`chat:${user.id}`, 20, 60);
  if (!limit.allowed) throw ApiErrors.rateLimited();

  const dto = await chat.createMessage(user.id, c.req.param("idOrSlug"), c.req.valid("json").content);
  // The broadcast reaches everyone: `mine` is only meaningful in the sender's own response.
  const broadcast = { ...dto };
  delete broadcast.mine;
  realtime.emitChatMessage(dto.chatRoomId, broadcast);
  return reply(c, dto, 201);
});

chatRouter.delete("/messages/:id", requireAuth(), uuidParam("id"), async (c) => {
  const user = currentUser(c);
  const { chat, rateLimit, realtime } = c.var.services;
  const limit = await rateLimit.check(`chat-delete:${user.id}`, 30, 60);
  if (!limit.allowed) throw ApiErrors.rateLimited();

  const id = c.req.param("id");
  const { chatRoomId } = await chat.deleteMessage(id, user.id);
  realtime.emitChatDeleted(chatRoomId, id);
  return reply(c, { ok: true });
});
