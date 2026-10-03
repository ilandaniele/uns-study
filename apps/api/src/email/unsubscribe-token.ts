import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "../env.js";

/** Stateless unsubscribe token: HMAC of the user id, keyed with the auth secret (rotating it invalidates old links). */
export function unsubscribeToken(userId: string, secret: string): string {
  return createHmac("sha256", secret).update(`email-unsubscribe:v1:${userId}`).digest("base64url");
}

export function verifyUnsubscribeToken(userId: string, token: string, secret: string): boolean {
  if (!secret || !userId || !token) return false;
  const expected = Buffer.from(unsubscribeToken(userId, secret));
  const given = Buffer.from(token);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

/** `page` is the human-facing /baja page; `oneClick` is the API endpoint targeted by RFC 8058 `List-Unsubscribe-Post`. */
export function unsubscribeUrls(userId: string): { page: string; oneClick: string } {
  const query = `u=${encodeURIComponent(userId)}&t=${unsubscribeToken(userId, env.betterAuthSecret)}`;
  return {
    page: `${env.publicWebUrl}/baja?${query}`,
    oneClick: `${env.publicWebUrl}/api/v1/email/unsubscribe?${query}`,
  };
}
