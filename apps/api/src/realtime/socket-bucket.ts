/** Per-socket fixed-window event budget: at most `limit` events per `windowMs`. Pure, clock injected.
 *  In a socket attachment this is stored as `{ tokens: count, refilledAt: windowStart }`. */
export interface SocketBucket {
  count: number;
  windowStart: number;
}

export function takeSocketToken(
  bucket: SocketBucket,
  now: number,
  limit: number,
  windowMs: number,
): boolean {
  if (now - bucket.windowStart >= windowMs) {
    bucket.windowStart = now;
    bucket.count = 0;
  }
  if (bucket.count >= limit) return false;
  bucket.count += 1;
  return true;
}

/** Client IP for per-IP connection caps: `cf-connecting-ip` (set by Cloudflare's edge) when present, else loopback. */
export function socketClientIp(headers: { get(name: string): string | null }): string {
  return headers.get("cf-connecting-ip") || "127.0.0.1";
}
