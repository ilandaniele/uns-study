import { Hono } from "hono";
import {
  gardenCheckoutSchema,
  gardenPlantSchema,
  gardenRedeemSchema,
  gardenVisibilitySchema,
} from "@sala/contracts";
import { currentUser, type AppEnv } from "../http/context.js";
import { requireAuth } from "../http/guards.js";
import { reply } from "../http/reply.js";
import { zBody } from "../http/validate.js";

export const gardenRouter = new Hono<AppEnv>();

gardenRouter.get("/profiles/:userId/garden", requireAuth(), async (c) => {
  c.header("Cache-Control", "private, no-store");
  return reply(c, await c.var.services.garden.visit(currentUser(c).id, c.req.param("userId")));
});
gardenRouter.use("/me/garden*", requireAuth());
gardenRouter.use("/me/garden*", async (c, next) => {
  c.header("Cache-Control", "private, no-store");
  await next();
});
gardenRouter.get("/me/garden", async (c) =>
  reply(c, await c.var.services.garden.get(currentUser(c).id)),
);

gardenRouter.post("/me/garden/visibility", zBody(gardenVisibilitySchema), async (c) => {
  const userId = currentUser(c).id;
  await c.var.services.antiAbuse.enforceRateLimit({ key: `garden:${userId}`, limit: 40, windowSeconds: 60 });
  // Compatibility for already-open older clients: visibility is now always enabled.
  return reply(c, await c.var.services.garden.get(userId));
});
gardenRouter.get("/me/garden/shop", (c) =>
  reply(c, c.var.services.gardenPurchases.shop(currentUser(c).id)),
);
gardenRouter.post(
  "/me/garden/checkout",
  zBody(gardenCheckoutSchema),
  async (c) => {
    const userId = currentUser(c).id;
    await c.var.services.antiAbuse.enforceRateLimit({
      key: `garden:checkout:${userId}`,
      limit: 10,
      windowSeconds: 3600,
    });
    return reply(c, await c.var.services.gardenPurchases.checkout(userId));
  },
);
gardenRouter.post("/me/garden/plant", zBody(gardenPlantSchema), async (c) => {
  const userId = currentUser(c).id;
  await c.var.services.antiAbuse.enforceRateLimit({
    key: `garden:${userId}`,
    limit: 40,
    windowSeconds: 60,
  });
  return reply(
    c,
    await c.var.services.garden.plant(userId, c.req.valid("json")),
    201,
  );
});
gardenRouter.post("/me/garden/redeem", zBody(gardenRedeemSchema), async (c) => {
  const userId = currentUser(c).id;
  await c.var.services.antiAbuse.enforceRateLimit({
    key: `garden:${userId}`,
    limit: 40,
    windowSeconds: 60,
  });
  return reply(
    c,
    await c.var.services.garden.redeem(userId, c.req.valid("json")),
  );
});
