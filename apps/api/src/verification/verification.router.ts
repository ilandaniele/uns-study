import { Hono } from "hono";
import type { AppEnv } from "../http/context.js";

export const verificationRouter = new Hono<AppEnv>();

/** Public: whether the seat photo verifier is configured, so the web only shows the button when it works. */
verificationRouter.get("/verification/status", (c) => {
  return c.json({ enabled: c.var.services.seatPhotoVerifier !== null });
});
