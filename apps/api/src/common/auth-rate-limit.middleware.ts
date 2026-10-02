import { createHash } from "node:crypto";
import express from "express";
import type { NextFunction, Request, Response } from "express";
import { ApiErrors } from "./api-error.js";

/** Minimal slice of `RateLimitService` this middleware needs. */
export interface AuthRateLimiter {
  check(key: string, limit: number, windowSeconds: number): Promise<{ allowed: boolean }>;
}

const SIGN_IN_PATH = "/sign-in/email";
const SIGN_UP_PATH = "/sign-up/email";

// Per lowercased email: slows credential stuffing against one account even when `req.ip` is spoofed.
const SIGN_IN_EMAIL_LIMIT = 10;
const SIGN_IN_EMAIL_WINDOW_S = 15 * 60;
const SIGN_UP_EMAIL_LIMIT = 5;
const SIGN_UP_EMAIL_WINDOW_S = 60 * 60;
// Per `Fly-Client-IP` (set by Fly's edge, unforgeable). Vercel traffic shares a few egress IPs, so
// this is a coarse backstop only, not a per-visitor limit.
const FLY_IP_LIMIT = 120;
const FLY_IP_WINDOW_S = 10 * 60;

function digest(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 32);
}

function sendRateLimited(res: Response): void {
  const err = ApiErrors.rateLimited();
  res.status(err.getStatus()).json(err.getResponse());
}

/**
 * Defense in depth for Better Auth's email sign-in/sign-up, mounted at `/api/auth` before its
 * handler. `req.ip` can be forged on direct hits to the Fly app (the trusted-hop count assumes
 * Vercel in front), so Better Auth's own per-IP limit is not enough on its own: this adds a
 * per-email limit plus a coarse cap on the unforgeable `Fly-Client-IP` header (skipped when absent).
 * Reads the JSON body itself for those two routes; Better Auth reuses the already-parsed `req.body`.
 */
export function authRateLimitMiddleware(rateLimit: AuthRateLimiter) {
  const parseJson = express.json({ limit: "16kb" });

  const run = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const path = req.path.replace(/\/+$/, "");
    const isSignIn = path === SIGN_IN_PATH;
    if (req.method !== "POST" || (!isSignIn && path !== SIGN_UP_PATH)) return next();

    try {
      const flyIp = req.headers["fly-client-ip"];
      if (typeof flyIp === "string" && flyIp) {
        const ip = await rateLimit.check(`auth-ip:${digest(flyIp)}`, FLY_IP_LIMIT, FLY_IP_WINDOW_S);
        if (!ip.allowed) return sendRateLimited(res);
      }

      const email = (req.body as { email?: unknown } | undefined)?.email;
      if (typeof email === "string" && email.trim()) {
        const key = `${isSignIn ? "auth-signin" : "auth-signup"}-email:${digest(email.trim().toLowerCase())}`;
        const result = isSignIn
          ? await rateLimit.check(key, SIGN_IN_EMAIL_LIMIT, SIGN_IN_EMAIL_WINDOW_S)
          : await rateLimit.check(key, SIGN_UP_EMAIL_LIMIT, SIGN_UP_EMAIL_WINDOW_S);
        if (!result.allowed) return sendRateLimited(res);
      }
      next();
    } catch (err) {
      next(err);
    }
  };

  return (req: Request, res: Response, next: NextFunction): void => {
    const path = req.path.replace(/\/+$/, "");
    if (req.method !== "POST" || (path !== SIGN_IN_PATH && path !== SIGN_UP_PATH)) return next();
    // A malformed body is Better Auth's to reject; the per-IP cap above still applies.
    parseJson(req, res, () => void run(req, res, next));
  };
}
