import { Hono } from "hono";
import type { AppEnv } from "../http/context.js";
import { requireSuperAdmin } from "../http/guards.js";
import { currentUser } from "../http/context.js";
import { ApiErrors } from "../common/api-error.js";

export const verificationRouter = new Hono<AppEnv>();

/** Public: whether the seat photo verifier is configured, so the web only shows the button when it works. */
verificationRouter.get("/verification/status", (c) => {
  const verifier = c.var.services.seatPhotoVerifier;
  return c.json({ enabled: verifier !== null, provider: verifier?.diagnostics?.().provider ?? null });
});

/** Never expose keys, photo bytes, user ids or seat predictions in diagnostics. */
verificationRouter.get("/admin/verification/status", requireSuperAdmin, c => {
  c.header("Cache-Control", "private, no-store");
  const verifier = c.var.services.seatPhotoVerifier;
  return c.json({ enabled: verifier !== null, ...(verifier?.diagnostics?.() ?? { provider: verifier ? "mock" : "none", model: null, lastAttemptAt: null, lastFailure: null }) });
});

verificationRouter.post("/admin/verification/test", requireSuperAdmin, async c => {
  c.header("Cache-Control", "private, no-store");
  if (!(await c.var.services.rateLimit.check(`verifier-test:${currentUser(c).id}`, 2, 3600)).allowed) throw ApiErrors.rateLimited();
  return c.json(await c.var.services.photoVerification.testConnection());
});
