import { createHash, timingSafeEqual } from "node:crypto";

const digest = (value: string): Buffer => createHash("sha256").update(value).digest();

/** Constant-time `Authorization: Bearer <token>` check; an empty configured token never matches. */
export function checkBearer(header: string | undefined, token: string): boolean {
  if (!token || !header) return false;
  const match = /^Bearer (.+)$/.exec(header);
  if (!match) return false;
  return timingSafeEqual(digest(match[1]!), digest(token));
}
