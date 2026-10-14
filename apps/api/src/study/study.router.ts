import { Hono } from "hono";
import { studyStartSchema } from "@sala/contracts";
import { ApiErrors } from "../common/api-error.js";
import type { AppEnv } from "../http/context.js";
import { currentUser } from "../http/context.js";
import { requireAuth } from "../http/guards.js";
import { reply } from "../http/reply.js";
import { zBody } from "../http/validate.js";

export const studyRouter = new Hono<AppEnv>();

studyRouter.post("/study/start", requireAuth(), zBody(studyStartSchema), async (c) => {
  const { services } = c.var;
  const user = currentUser(c);
  const body = c.req.valid("json");
  // Start and stop share one bucket.
  const limit = await services.rateLimit.check(`study:${user.id}`, 60, 3600);
  if (!limit.allowed) throw ApiErrors.rateLimited();
  return reply(
    c,
    await services.study.start(user.id, body.roomId, {
      subject: body.subject,
      message: body.message,
      lookingForGroup: body.lookingForGroup,
    }),
    201,
  );
});

studyRouter.post("/study/stop", requireAuth(), async (c) => {
  const { services } = c.var;
  const user = currentUser(c);
  const limit = await services.rateLimit.check(`study-stop:${user.id}`, 30, 60);
  if (!limit.allowed) throw ApiErrors.rateLimited();
  await services.study.stop(user.id);
  return reply(c, { ok: true }, 200);
});
