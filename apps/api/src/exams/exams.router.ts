import { Hono } from "hono";
import { examPatchSchema, examRequestSchema } from "@sala/contracts";
import { currentUser, type AppEnv } from "../http/context.js";
import { requireAuth, requirePro } from "../http/guards.js";
import { reply } from "../http/reply.js";
import { uuidParam, zBody } from "../http/validate.js";

const CREATE_LIMIT = 10;
const WINDOW_S = 60;

/** `/me/exams`: Pro exam planner. */
export const examsRouter = new Hono<AppEnv>();

examsRouter.get("/me/exams", requireAuth(), requirePro(), async (c) => reply(c, await c.var.services.exams.list(currentUser(c).id)));

examsRouter.post("/me/exams", requireAuth(), requirePro(), zBody(examRequestSchema), async (c) => {
  const { services } = c.var;
  const user = currentUser(c);
  await services.antiAbuse.enforceRateLimit({ key: `exams:${user.id}`, limit: CREATE_LIMIT, windowSeconds: WINDOW_S });
  return reply(c, await services.exams.create(user.id, c.req.valid("json")), 201);
});

examsRouter.patch("/me/exams/:id", requireAuth(), requirePro(), uuidParam("id"), zBody(examPatchSchema), async (c) =>
  reply(c, await c.var.services.exams.update(currentUser(c).id, c.req.param("id"), c.req.valid("json"))),
);

examsRouter.delete("/me/exams/:id", requireAuth(), requirePro(), uuidParam("id"), async (c) => {
  await c.var.services.exams.remove(currentUser(c).id, c.req.param("id"));
  return reply(c, null, 204);
});
