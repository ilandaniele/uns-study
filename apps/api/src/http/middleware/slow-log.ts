import type { MiddlewareHandler } from "hono";
import type { AppEnv } from "../context.js";

const SLOW_MS = 800;

/**
 * Coordinate-free access log for slow or failed requests only, to diagnose "la app tarda" reports
 * from the Worker logs without logging every hit. Ids in the path are masked; no query strings, no IPs.
 */
export function slowLog(): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const started = Date.now();
    await next();
    const ms = Date.now() - started;
    const status = c.res.status;
    if (ms < SLOW_MS && status < 500) return;
    const path = c.req.path.replace(/[0-9a-f]{8}-[0-9a-f-]{27,}|[A-Za-z0-9]{24,}/g, ":id");
    console.info(JSON.stringify({ evt: "slow_or_failed_request", method: c.req.method, path, status, ms }));
  };
}
