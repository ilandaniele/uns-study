import { Hono } from "hono";
import { profileFlairRequestSchema } from "@sala/contracts";
import { currentUser, type AppEnv } from "../http/context.js";
import { requireAuth, requirePro } from "../http/guards.js";
import { reply } from "../http/reply.js";
import { zBody } from "../http/validate.js";

const PUT_LIMIT = 20;
const WINDOW_S = 60;

/** `/me/cosmetics`: Pro profile flair. GET is open so a lapsed user still sees (and can reset) their choice. */
export const cosmeticsRouter = new Hono<AppEnv>();

cosmeticsRouter.get("/me/cosmetics", requireAuth(), async (c) => reply(c, await c.var.services.cosmetics.getMine(currentUser(c).id)));

cosmeticsRouter.put("/me/cosmetics", requireAuth(), requirePro(), zBody(profileFlairRequestSchema), async (c) => {
  const { services } = c.var;
  const user = currentUser(c);
  await services.antiAbuse.enforceRateLimit({ key: `cosmetics:${user.id}`, limit: PUT_LIMIT, windowSeconds: WINDOW_S });
  return reply(c, await services.cosmetics.putMine(user.id, c.req.valid("json")));
});
