import type { MiddlewareHandler } from "hono";
import { ApiErrors } from "../../common/api-error.js";
import { env } from "../../env.js";
import type { AppEnv } from "../context.js";

/** While `MAINTENANCE_MODE=1`, every `/api/*` path except the health probes answers 503 FEATURE_DISABLED. */
export function maintenanceGate(): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const path = c.req.path;
    if (env.maintenanceMode && path.startsWith("/api/") && !path.startsWith("/api/v1/health")) {
      throw ApiErrors.featureDisabled("Mantenimiento en curso.");
    }
    await next();
  };
}
