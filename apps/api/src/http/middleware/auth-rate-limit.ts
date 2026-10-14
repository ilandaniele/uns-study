import { createHash } from "node:crypto";
import type { MiddlewareHandler } from "hono";
import { ApiErrors } from "../../common/api-error.js";
import { trimTrailingSlashes } from "../../common/request-path.js";
import type { AppEnv } from "../context.js";
import { readTextLimited } from "./body-limits.js";

/** Minimal slice of `RateLimitService` this middleware needs. */
export interface AuthRateLimiter {
  check(key: string, limit: number, windowSeconds: number): Promise<{ allowed: boolean }>;
}

const AUTH_PREFIX = "/api/auth";
const BODY_LIMIT_BYTES = 16 * 1024;
const SIGN_IN_PATH = "/sign-in/email";
const SIGN_UP_PATH = "/sign-up/email";
const RESET_REQUEST_PATH = "/request-password-reset";
const RESET_PATH = "/reset-password";
const LIMITED_PATHS = new Set([SIGN_IN_PATH, SIGN_UP_PATH, RESET_REQUEST_PATH, RESET_PATH]);

// Per lowercased email: slows credential stuffing against one account.
const SIGN_IN_EMAIL_LIMIT = 10;
const SIGN_IN_EMAIL_WINDOW_S = 15 * 60;
const SIGN_UP_EMAIL_LIMIT = 5;
const SIGN_UP_EMAIL_WINDOW_S = 60 * 60;
// Password reset: 3 requests per email per hour (each one sends a mail); redeeming is capped per
// client IP and per token so tokens can't be brute-forced.
const RESET_REQUEST_EMAIL_LIMIT = 3;
const RESET_REQUEST_EMAIL_WINDOW_S = 60 * 60;
const RESET_IP_LIMIT = 10;
const RESET_IP_WINDOW_S = 15 * 60;
const RESET_TOKEN_LIMIT = 5;
const RESET_TOKEN_WINDOW_S = 15 * 60;
// Per client IP (`cf-connecting-ip`, set by Cloudflare's edge and unforgeable).
const IP_LIMIT = 120;
const IP_WINDOW_S = 10 * 60;

function digest(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 32);
}

/**
 * Defense in depth for Better Auth's email sign-in/sign-up and password reset, mounted at
 * `/api/auth/*` before its handler. Adds a per-email limit (per-token for reset redemption) plus a
 * coarse per-IP cap on top of Better Auth's own limiter. Reads the JSON body itself (through a
 * clone, so Better Auth still gets the original); every body-carrying auth route gets the 16 KB cap.
 */
export function authRateLimit(rateLimit: AuthRateLimiter): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const method = c.req.method;
    if (method !== "POST" && method !== "PUT" && method !== "PATCH") return next();

    const text = await readTextLimited(c.req.raw, BODY_LIMIT_BYTES);
    const path = trimTrailingSlashes(c.req.path.startsWith(AUTH_PREFIX) ? c.req.path.slice(AUTH_PREFIX.length) : c.req.path);
    if (!LIMITED_PATHS.has(path) || method !== "POST") return next();

    let body: { email?: unknown; token?: unknown } | undefined;
    try {
      body = text ? (JSON.parse(text) as typeof body) : undefined;
    } catch {
      // A malformed body is Better Auth's to reject; the per-IP cap below still applies.
      body = undefined;
    }

    const ip = c.var.ip;
    const ipResult = await rateLimit.check(`auth-ip:${digest(ip)}`, IP_LIMIT, IP_WINDOW_S);
    if (!ipResult.allowed) throw ApiErrors.rateLimited();

    if (path === RESET_PATH) {
      const resetIp = await rateLimit.check(`auth-reset-ip:${digest(ip)}`, RESET_IP_LIMIT, RESET_IP_WINDOW_S);
      if (!resetIp.allowed) throw ApiErrors.rateLimited();
      const token = body?.token;
      if (typeof token === "string" && token) {
        const result = await rateLimit.check(`auth-reset-token:${digest(token)}`, RESET_TOKEN_LIMIT, RESET_TOKEN_WINDOW_S);
        if (!result.allowed) throw ApiErrors.rateLimited();
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
      if (!result.allowed) throw ApiErrors.rateLimited();
    }
    return next();
  };
}
