import type { MiddlewareHandler } from "hono";
import type { AppEnv } from "../context.js";

const STATE_CHANGING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * Pure decision function for the CSRF check: given the request method/headers and the list of
 * trusted web origins, returns whether the request should be rejected.
 *
 * - Requests with neither an `Origin` header nor a `Sec-Fetch-Site` header (curl, server-to-server
 *   calls) are allowed only when they carry no cookie. Browsers always send at least one of these
 *   headers on a state-changing request, so a cookie-bearing request without both didn't come from
 *   our web app and can't be trusted with the session.
 * - An `Origin` header that isn't in `webOrigins` is rejected.
 * - `Sec-Fetch-Site: cross-site` is rejected even if `Origin` is absent or trusted.
 */
export function isCsrfRejected(
  request: { method: string; origin?: string | null; secFetchSite?: string | null; hasCookie?: boolean },
  webOrigins: string[],
): boolean {
  if (!STATE_CHANGING_METHODS.has(request.method.toUpperCase())) return false;

  if (request.secFetchSite && request.secFetchSite.toLowerCase() === "cross-site") return true;

  if (request.origin && !webOrigins.includes(request.origin)) return true;

  if (!request.origin && !request.secFetchSite && request.hasCookie) return true;

  return false;
}

/**
 * Rejects state-changing `/api/v1` requests whose `Origin` isn't a trusted web origin, or whose
 * `Sec-Fetch-Site` is `cross-site`. Better Auth's own routes (`/api/auth/*`) already validate
 * `trustedOrigins` and are unaffected, since this only guards `/api/v1`.
 */
export function csrfMiddleware(webOrigins: string[]): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    if (!c.req.path.startsWith("/api/v1")) return next();

    const rejected = isCsrfRejected(
      {
        method: c.req.method,
        origin: c.req.header("origin"),
        secFetchSite: c.req.header("sec-fetch-site"),
        hasCookie: Boolean(c.req.header("cookie")),
      },
      webOrigins,
    );

    if (rejected) return c.json({ error: { code: "FORBIDDEN", message: "Origen no permitido." } }, 403);

    await next();
  };
}
