/** Per-socket fixed-window event budget: at most `limit` events per `windowMs`. Pure, clock injected. */
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

/** Client IP for per-IP connection caps: `fly-client-ip` (set by Fly's edge) when present, else the socket address. */
export function socketClientIp(headers: Record<string, string | string[] | undefined>, address: string): string {
  const fly = headers["fly-client-ip"];
  const value = Array.isArray(fly) ? fly[0] : fly;
  return value ? value : address;
}
