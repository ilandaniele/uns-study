import type { MiddlewareHandler } from "hono";
import { env } from "../../env.js";
import type { AppEnv } from "../context.js";

/**
 * Security headers for a JSON/image API (no HTML), the same set the previous Node API sent. A header
 * a handler already set (the avatar route sets its own CSP) is left alone. The browser only sees
 * avatars through the same-origin `/api/v1`, so CORP stays same-site.
 */
export function securityHeaders(): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    await next();
    const defaults: Record<string, string> = {
      "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
      "Cross-Origin-Resource-Policy": "same-site",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
      ...(env.isProduction ? { "Strict-Transport-Security": "max-age=15552000; includeSubDomains" } : {}),
    };
    for (const [name, value] of Object.entries(defaults)) {
      if (!c.res.headers.has(name)) c.res.headers.set(name, value);
    }
  };
}
