import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "../env.js";

const TTL_S = 5 * 60;
const HKDF_LABEL = "sala-de-estudio:socket-token";
const DEV_FALLBACK_SECRET = "dev-only-insecure-secret-change-me";

export interface SocketToken {
  token: string;
  expiresAt: number; // epoch ms
}

/** Derives a single-purpose signing key from `BETTER_AUTH_SECRET`, so a leaked socket token can't
 *  be replayed against Better Auth's own session/cookie signing (and vice versa). */
function deriveKey(secret: string): Buffer {
  return createHmac("sha256", secret).update(HKDF_LABEL).digest();
}

function sign(payload: string, key: Buffer): string {
  return createHmac("sha256", key).update(payload).digest("base64url");
}

/**
 * Issues a short-lived signed token (`userId.exp.sig`) proving the caller had a valid Better Auth
 * session at issuance time. Socket.IO connects directly to the API host (it can't be proxied
 * through Vercel's rewrites like REST calls), so it can't rely on the same-origin session cookie —
 * this token is passed via `handshake.auth.token` instead.
 */
export function signSocketToken(userId: string, secret = env.betterAuthSecret): SocketToken {
  const key = deriveKey(secret || DEV_FALLBACK_SECRET);
  const expiresAt = Date.now() + TTL_S * 1000;
  const payload = `${userId}.${expiresAt}`;
  return { token: `${payload}.${sign(payload, key)}`, expiresAt };
}

/**
 * Verifies a token minted by `signSocketToken`: well-formed, unexpired, and signed with the
 * current secret. Returns the `userId` on success, `null` on any failure (malformed, expired,
 * tampered). Signature comparison is timing-safe.
 */
export function verifySocketToken(token: string, secret = env.betterAuthSecret): string | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [userId, expRaw, sig] = parts;
  const exp = Number(expRaw);
  if (!userId || !sig || !Number.isFinite(exp)) return null;
  if (Date.now() > exp) return null;

  const key = deriveKey(secret || DEV_FALLBACK_SECRET);
  const expected = Buffer.from(sign(`${userId}.${expRaw}`, key));
  const actual = Buffer.from(sig);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
  return userId;
}
