import { Hono } from "hono";
import { addGroupMembersSchema, createGroupSchema, groupSendSchema } from "@sala/contracts";
import { ApiErrors } from "../common/api-error.js";
import { runInBackground } from "../common/background.js";
import { currentUser, type AppEnv } from "../http/context.js";
import { requireAuth } from "../http/guards.js";
import { reply } from "../http/reply.js";
import { uuidParam, zBody } from "../http/validate.js";
import { Logger } from "../platform/logger.js";

const logger = new Logger("GroupsRouter");

export const groupsRouter = new Hono<AppEnv>();

async function limit(c: { var: AppEnv["Variables"] }, key: string, max: number, windowSec: number): Promise<void> {
  const result = await c.var.services.rateLimit.check(key, max, windowSec);
  if (!result.allowed) throw ApiErrors.rateLimited();
}

groupsRouter.get("/groups", requireAuth(), async (c) => {
  const user = currentUser(c);
  return reply(c, await c.var.services.groups.listGroups(user.id));
});

// Registered before `/groups/:id` so "contacts" is not parsed as a group id.
groupsRouter.get("/groups/contacts", requireAuth(), async (c) => {
  const user = currentUser(c);
  return reply(c, await c.var.services.groups.listContacts(user.id));
});

groupsRouter.post("/groups", requireAuth(), zBody(createGroupSchema), async (c) => {
  const user = currentUser(c);
  await limit(c, `group-create:${user.id}`, 10, 3600);

  const { groups, realtime } = c.var.services;
  const { group, memberIds } = await groups.createGroup(user.id, c.req.valid("json"));
  realtime.emitGroupUpdated(memberIds, { groupId: group.id });
  return reply(c, group, 201);
});

groupsRouter.get("/groups/:id", requireAuth(), uuidParam("id"), async (c) => {
  const user = currentUser(c);
  return reply(c, await c.var.services.groups.getGroup(c.req.param("id"), user.id));
});

groupsRouter.post("/groups/:id/members", requireAuth(), uuidParam("id"), zBody(addGroupMembersSchema), async (c) => {
  const user = currentUser(c);
  await limit(c, `group-members:${user.id}`, 30, 3600);

  const id = c.req.param("id");
  const { groups, realtime } = c.var.services;
  const { group, memberIds } = await groups.addMembers(id, user.id, c.req.valid("json").userIds);
  realtime.emitGroupUpdated(memberIds, { groupId: id });
  return reply(c, group);
});

groupsRouter.post("/groups/:id/leave", requireAuth(), uuidParam("id"), async (c) => {
  const user = currentUser(c);
  await limit(c, `group-leave:${user.id}`, 30, 3600);

  const id = c.req.param("id");
  const { groups, realtime } = c.var.services;
  const { remainingMemberIds } = await groups.leaveGroup(id, user.id);
  realtime.emitGroupUpdated([...remainingMemberIds, user.id], { groupId: id });
  return reply(c, { ok: true });
});

groupsRouter.get("/groups/:id/messages", requireAuth(), uuidParam("id"), async (c) => {
  const user = currentUser(c);
  return reply(c, await c.var.services.groups.listMessages(c.req.param("id"), user.id, c.req.query("cursor") ?? null));
});

groupsRouter.post("/groups/:id/messages", requireAuth(), uuidParam("id"), zBody(groupSendSchema), async (c) => {
  const user = currentUser(c);
  await limit(c, `group:${user.id}`, 15, 60);

  const id = c.req.param("id");
  const { groups, realtime, notifications } = c.var.services;
  const { message, memberIds } = await groups.sendMessage(id, user.id, c.req.valid("json").content);
  realtime.emitGroupMessage(memberIds, message);
  if (message.content) {
    const content = message.content;
    runInBackground(logger, "group message push", async () => {
      await Promise.all(
        memberIds
          .filter((memberId) => memberId !== user.id)
          .map((recipientId) =>
            notifications.notifyDirectMessage({
              recipientId,
              senderDisplayName: message.senderName,
              conversationId: `group-${id}`,
              content,
              url: "/chat",
            }),
          ),
      );
    });
  }
  return reply(c, message, 201);
});

groupsRouter.post("/groups/:id/read", requireAuth(), uuidParam("id"), async (c) => {
  const user = currentUser(c);
  await limit(c, `group-read:${user.id}`, 60, 60);

  await c.var.services.groups.markRead(c.req.param("id"), user.id);
  return reply(c, { ok: true });
});
