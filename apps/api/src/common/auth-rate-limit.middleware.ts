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
const RESET_REQUEST_PATH = "/request-password-reset";
const RESET_PATH = "/reset-password";
const LIMITED_PATHS = new Set([SIGN_IN_PATH, SIGN_UP_PATH, RESET_REQUEST_PATH, RESET_PATH]);

// Per lowercased email: slows credential stuffing against one account even when `req.ip` is spoofed.
const SIGN_IN_EMAIL_LIMIT = 10;
const SIGN_IN_EMAIL_WINDOW_S = 15 * 60;
const SIGN_UP_EMAIL_LIMIT = 5;
const SIGN_UP_EMAIL_WINDOW_S = 60 * 60;
// Password reset: 3 requests per email per hour (each one sends a mail); redeeming is capped per
// Fly-Client-IP and per token so tokens can't be brute-forced.
const RESET_REQUEST_EMAIL_LIMIT = 3;
const RESET_REQUEST_EMAIL_WINDOW_S = 60 * 60;
const RESET_IP_LIMIT = 10;
const RESET_IP_WINDOW_S = 15 * 60;
const RESET_TOKEN_LIMIT = 5;
const RESET_TOKEN_WINDOW_S = 15 * 60;
// Per `Fly-Client-IP` (set by Fly's edge, unforgeable). Proxied web traffic shares a few egress IPs, so
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
 * Defense in depth for Better Auth's email sign-in/sign-up and password reset, mounted at
 * `/api/auth` before its handler. `req.ip` can be forged on direct hits to the Fly app (the
 * trusted-hop count assumes the web proxy in front), so Better Auth's own per-IP limit is not enough on
 * its own: this adds a per-email limit (per-token for reset redemption) plus a coarse cap on the
 * unforgeable `Fly-Client-IP` header (skipped when absent). Reads the JSON body itself for those
 * routes; Better Auth reuses the already-parsed `req.body`.
 */
export function authRateLimitMiddleware(rateLimit: AuthRateLimiter) {
  const parseJson = express.json({ limit: "16kb" });

  const run = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const path = req.path.replace(/\/+$/, "");

    try {
      const flyIp = req.headers["fly-client-ip"];
      const flyIpValue = typeof flyIp === "string" && flyIp ? flyIp : null;
      if (flyIpValue) {
        const ip = await rateLimit.check(`auth-ip:${digest(flyIpValue)}`, FLY_IP_LIMIT, FLY_IP_WINDOW_S);
        if (!ip.allowed) return sendRateLimited(res);
      }

      const body = req.body as { email?: unknown; token?: unknown } | undefined;

      if (path === RESET_PATH) {
        if (flyIpValue) {
          const ip = await rateLimit.check(`auth-reset-ip:${digest(flyIpValue)}`, RESET_IP_LIMIT, RESET_IP_WINDOW_S);
          if (!ip.allowed) return sendRateLimited(res);
        }
        const token = body?.token;
        if (typeof token === "string" && token) {
          const result = await rateLimit.check(`auth-reset-token:${digest(token)}`, RESET_TOKEN_LIMIT, RESET_TOKEN_WINDOW_S);
          if (!result.allowed) return sendRateLimited(res);
        }
        return next();
      }

      const email = body?.email;
      if (typeof email === "string" && email.trim()) {
        const digested = digest(email.trim().toLowerCase());
        const result =
          path === SIGN_IN_PATH
            ? await rateLimit.check(`auth-signin-email:${digested}`, SIGN_IN_EMAIL_LIMIT, SIGN_IN_EMAIL_WINDOW_S)
            : path === SIGN_UP_PATH
              ? await rateLimit.check(`auth-signup-email:${digested}`, SIGN_UP_EMAIL_LIMIT, SIGN_UP_EMAIL_WINDOW_S)
              : await rateLimit.check(`auth-reset-email:${digested}`, RESET_REQUEST_EMAIL_LIMIT, RESET_REQUEST_EMAIL_WINDOW_S);
        if (!result.allowed) return sendRateLimited(res);
      }
      next();
    } catch (err) {
      next(err);
    }
  };

  return (req: Request, res: Response, next: NextFunction): void => {
    const path = req.path.replace(/\/+$/, "");
    if (req.method !== "POST" || !LIMITED_PATHS.has(path)) return next();
    // A malformed body is Better Auth's to reject; the per-IP cap above still applies.
    parseJson(req, res, () => void run(req, res, next));
  };
}
