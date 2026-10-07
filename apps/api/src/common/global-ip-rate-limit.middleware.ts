import type { NextFunction, Request, Response } from "express";
import { ApiErrors } from "./api-error.js";

// Coarse per-IP backstop on every /api/v1 request; the per-user/per-route limits stay the real gate.
// Counted in memory: the API runs one machine, and a shared backend (Postgres in production) would add
// queries to every request and turn a database hiccup into a site-wide 429.
const GLOBAL_IP_LIMIT = 300;
const GLOBAL_IP_WINDOW_MS = 60_000;
const SKIPPED_PATHS = new Set(["/api/v1/health", "/api/v1/health/ready"]);
const SKIPPED_PREFIXES = ["/api/v1/webhooks/mercadopago"];

/** Fixed-window counter per key. Expired windows are swept when the map grows. */
export class IpWindowCounter {
  private readonly windows = new Map<string, { start: number; count: number }>();

  constructor(
    private readonly limit = GLOBAL_IP_LIMIT,
    private readonly windowMs = GLOBAL_IP_WINDOW_MS,
  ) {}

  hit(key: string, now = Date.now()): boolean {
    let w = this.windows.get(key);
    if (!w || now - w.start >= this.windowMs) {
      if (this.windows.size >= 50_000) this.sweep(now);
      w = { start: now, count: 0 };
      this.windows.set(key, w);
    }
    w.count += 1;
    return w.count <= this.limit;
  }

  private sweep(now: number): void {
    for (const [k, w] of this.windows) if (now - w.start >= this.windowMs) this.windows.delete(k);
  }
}

/**
 * Mounted at `/api/v1` after `proxyTrustMiddleware` so `req.ip` is trustworthy. Skips the health
 * check and the Mercado Pago webhook (called by a third party, authenticated by signature).
 */
export function globalIpRateLimitMiddleware(counter = new IpWindowCounter()) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const path = (req.originalUrl.split("?")[0] ?? "").replace(/\/+$/, "");
    if (SKIPPED_PATHS.has(path) || SKIPPED_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`))) return next();
    const ip = req.ip;
    if (!ip || counter.hit(ip)) return next();
    const err = ApiErrors.rateLimited();
    res.status(err.getStatus()).json(err.getResponse());
  };
}
