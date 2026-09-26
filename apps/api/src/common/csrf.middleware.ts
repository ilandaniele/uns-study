import type { NextFunction, Request, Response } from "express";

const STATE_CHANGING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * Pure decision function for the CSRF check: given the request method/headers and the list of
 * trusted web origins, returns whether the request should be rejected.
 *
 * - Requests with neither an `Origin` header nor a `Sec-Fetch-Site` header (curl, server-to-server
 *   calls) are allowed — browsers always send at least one of these for cross-origin requests.
 * - An `Origin` header that isn't in `webOrigins` is rejected.
 * - `Sec-Fetch-Site: cross-site` is rejected even if `Origin` is absent or trusted.
 */
export function isCsrfRejected(
  request: { method: string; origin?: string | null; secFetchSite?: string | null },
  webOrigins: string[],
): boolean {
  if (!STATE_CHANGING_METHODS.has(request.method.toUpperCase())) return false;

  if (request.secFetchSite && request.secFetchSite.toLowerCase() === "cross-site") return true;

  if (request.origin && !webOrigins.includes(request.origin)) return true;

  return false;
}

/**
 * Rejects state-changing `/api/v1` requests whose `Origin` isn't a trusted web origin, or whose
 * `Sec-Fetch-Site` is `cross-site`. Must run before Better Auth's handler and Nest's routes —
 * Better Auth's own routes (`/api/auth/*`) already validate `trustedOrigins` and are unaffected
 * since this only guards `/api/v1`.
 */
export function csrfMiddleware(webOrigins: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.path.startsWith("/api/v1")) return next();

    const rejected = isCsrfRejected(
      {
        method: req.method,
        origin: req.headers.origin,
        secFetchSite: req.headers["sec-fetch-site"] as string | undefined,
      },
      webOrigins,
    );

    if (rejected) {
      res.status(403).json({ error: { code: "FORBIDDEN", message: "Origen no permitido." } });
      return;
    }

    next();
  };
}
