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
  if (!secret && env.isProduction) throw new Error("BETTER_AUTH_SECRET is required in production");
  return createHmac("sha256", secret || DEV_FALLBACK_SECRET).update(HKDF_LABEL).digest();
}

function sign(payload: string, key: Buffer): string {
  return createHmac("sha256", key).update(payload).digest("base64url");
}

/**
 * Issues a short-lived signed token (`userId.sessionId.exp.sig`) proving the caller had a valid
 * Better Auth session at issuance time. The WebSocket upgrade may not carry the same-origin session
 * cookie (local dev, cross-origin hosts), so the token is passed as the `?token=` query parameter instead. The session id is bound in so
 * the gateway can refuse a token whose session was signed out or revoked before it expired.
 */
export function signSocketToken(userId: string, sessionId: string, secret = env.betterAuthSecret): SocketToken {
  const key = deriveKey(secret);
  const expiresAt = Date.now() + TTL_S * 1000;
  const payload = `${userId}.${sessionId}.${expiresAt}`;
  return { token: `${payload}.${sign(payload, key)}`, expiresAt };
}

export interface SocketTokenClaims {
  userId: string;
  sessionId: string;
}

/**
 * Verifies a token minted by `signSocketToken`: well-formed, unexpired, and signed with the
 * current secret. Returns its claims on success, `null` on any failure (malformed, expired,
 * tampered). Signature comparison is timing-safe. It does not check that the session is still
 * live — callers must do that against the session table.
 */
export function verifySocketToken(token: string, secret = env.betterAuthSecret): SocketTokenClaims | null {
  const parts = token.split(".");
  if (parts.length !== 4) return null;
  const [userId, sessionId, expRaw, sig] = parts;
  const exp = Number(expRaw);
  if (!userId || !sessionId || !sig || !Number.isFinite(exp)) return null;
  if (Date.now() > exp) return null;

  const key = deriveKey(secret);
  const expected = Buffer.from(sign(`${userId}.${sessionId}.${expRaw}`, key));
  const actual = Buffer.from(sig);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
  return { userId, sessionId };
}
