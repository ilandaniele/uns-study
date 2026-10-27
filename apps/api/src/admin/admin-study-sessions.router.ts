import { Hono } from "hono";
import { manualStudySessionSchema } from "@sala/contracts";
import { currentUser, type AppEnv } from "../http/context.js";
import { requireSuperAdmin } from "../http/guards.js";
import { reply } from "../http/reply.js";
import { zBody } from "../http/validate.js";

export const adminStudySessionsRouter = new Hono<AppEnv>();

/** Credits study time a user really did but that was never recorded (see `AdminStudySessionsService`). */
adminStudySessionsRouter.post("/admin/study-sessions", requireSuperAdmin, zBody(manualStudySessionSchema), async (c) => {
  return reply(c, await c.var.services.adminStudySessions.credit(currentUser(c).id, c.req.valid("json")), 201);
});
