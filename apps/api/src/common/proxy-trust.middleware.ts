import { timingSafeEqual } from "node:crypto";
import type { NextFunction, Request, Response } from "express";

const SECRET_HEADER = "x-sala-proxy-secret";

function matches(provided: unknown, secret: string): boolean {
  if (typeof provided !== "string") return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * `trust proxy` makes `req.ip` the first X-Forwarded-For entry, which a direct hit on the API can
 * forge. Legit traffic comes through the web app, which adds a shared secret header; anything
 * without it is a direct hit, so its XFF is replaced by `Fly-Client-IP` (set by the Fly edge,
 * unforgeable) or dropped. An empty secret disables the check. Must run before anything reads `req.ip`.
 */
export function proxyTrustMiddleware(secret: string) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!secret) return next();
    if (!matches(req.headers[SECRET_HEADER], secret)) {
      const flyIp = req.headers["fly-client-ip"];
      if (typeof flyIp === "string" && flyIp) req.headers["x-forwarded-for"] = flyIp;
      else delete req.headers["x-forwarded-for"];
    }
    delete req.headers[SECRET_HEADER];
    next();
  };
}
