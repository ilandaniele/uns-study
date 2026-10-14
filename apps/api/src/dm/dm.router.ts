import { Hono } from "hono";
import { createConversationSchema, dmSendSchema } from "@sala/contracts";
import { ApiErrors } from "../common/api-error.js";
import { runInBackground } from "../common/background.js";
import { currentUser, type AppEnv } from "../http/context.js";
import { requireAuth } from "../http/guards.js";
import { reply } from "../http/reply.js";
import { uuidParam, zBody } from "../http/validate.js";
import { Logger } from "../platform/logger.js";

const logger = new Logger("DmRouter");

export const dmRouter = new Hono<AppEnv>();

dmRouter.get("/conversations", requireAuth(), async (c) => {
  const user = currentUser(c);
  return reply(c, await c.var.services.dm.listConversations(user.id));
});

dmRouter.post("/conversations", requireAuth(), zBody(createConversationSchema), async (c) => {
  const user = currentUser(c);
  const { dm, rateLimit } = c.var.services;
  const limit = await rateLimit.check(`dm-create:${user.id}`, 10, 3600);
  if (!limit.allowed) throw ApiErrors.rateLimited();

  return reply(c, await dm.getOrCreateConversation(user.id, c.req.valid("json").userId), 201);
});

dmRouter.get("/conversations/:id/messages", requireAuth(), uuidParam("id"), async (c) => {
  const user = currentUser(c);
  return reply(c, await c.var.services.dm.listMessages(c.req.param("id"), user.id, c.req.query("cursor") ?? null));
});

dmRouter.post("/conversations/:id/messages", requireAuth(), uuidParam("id"), zBody(dmSendSchema), async (c) => {
  const user = currentUser(c);
  const { dm, rateLimit, realtime, notifications } = c.var.services;
  const limit = await rateLimit.check(`dm:${user.id}`, 15, 60);
  if (!limit.allowed) throw ApiErrors.rateLimited();

  const id = c.req.param("id");
  const dto = await dm.sendMessage(id, user.id, c.req.valid("json").content);
  const otherId = await dm.otherParticipant(id, user.id);
  realtime.emitDm([user.id, otherId], dto);
  if (dto.content) {
    const content = dto.content;
    runInBackground(logger, "dm push", async () =>
      notifications.notifyDirectMessage({
        recipientId: otherId,
        senderDisplayName: await dm.publicDisplayName(user.id),
        conversationId: id,
        content,
      }),
    );
  }
  return reply(c, dto, 201);
});

dmRouter.post("/conversations/:id/read", requireAuth(), uuidParam("id"), async (c) => {
  const user = currentUser(c);
  const { dm, rateLimit } = c.var.services;
  const limit = await rateLimit.check(`dm-read:${user.id}`, 60, 60);
  if (!limit.allowed) throw ApiErrors.rateLimited();

  await dm.markRead(c.req.param("id"), user.id);
  return reply(c, { ok: true });
});
