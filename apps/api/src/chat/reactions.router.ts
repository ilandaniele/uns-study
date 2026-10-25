import { Hono } from "hono";
import {
  messageReactionSchema,
  reactionIdsSchema,
  reactionScopeSchema,
} from "@sala/contracts";
import { ApiErrors } from "../common/api-error.js";
import { currentUser, type AppEnv } from "../http/context.js";
import { requireAuth } from "../http/guards.js";
import { uuidParam, zBody } from "../http/validate.js";

export const reactionsRouter = new Hono<AppEnv>();
reactionsRouter.use("/message-reactions/*", requireAuth());
reactionsRouter.get(
  "/message-reactions/:scope/:threadId",
  uuidParam("threadId"),
  async (c) => {
    const scope = reactionScopeSchema.safeParse(c.req.param("scope"));
    const ids = reactionIdsSchema.safeParse(c.req.query("ids"));
    if (!scope.success || !ids.success) throw ApiErrors.validation();
    c.header("Cache-Control", "private, no-store");
    return c.json(
      await c.var.services.reactions.list(
        scope.data,
        c.req.param("threadId"),
        ids.data,
        currentUser(c).id,
      ),
    );
  },
);
reactionsRouter.put(
  "/message-reactions/:scope/:threadId/:messageId",
  uuidParam("threadId"),
  uuidParam("messageId"),
  zBody(messageReactionSchema),
  async (c) => {
    const scope = reactionScopeSchema.safeParse(c.req.param("scope"));
    if (!scope.success) throw ApiErrors.validation();
    const viewerId = currentUser(c).id;
    const limit = await c.var.services.rateLimit.check(
      `reactions:${viewerId}`,
      40,
      60,
    );
    if (!limit.allowed) throw ApiErrors.rateLimited();
    c.header("Cache-Control", "private, no-store");
    return c.json(
      await c.var.services.reactions.set(
        scope.data,
        c.req.param("threadId"),
        c.req.param("messageId"),
        viewerId,
        c.req.valid("json").emoji,
      ),
    );
  },
);
